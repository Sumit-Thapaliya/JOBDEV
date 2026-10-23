import { serviceRequest } from '../../common/http.js';
import type { RequestHandler } from 'express';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { z } from 'zod';
import { AppDataSource } from '../../database/data-source.js';
import { AppError } from '../../common/errors/AppError.js';
import { env } from '../../config/env.js';
import { User, UserRole } from '../user/user.entity.js';
import { ResumeVersion } from '../user/resume-version.entity.js';
import { toSafeUser } from '../auth/auth.service.js';

const object = z.object({ type: z.enum(['text', 'image', 'rect', 'line', 'shape']) }).passthrough();
export const saveCurrentResumeSchema = z.object({
  fileName: z.string().min(1).max(200).regex(/\.pdf$/i),
  pdfBase64: z.string().min(8).max(14_000_000),
  canvas: z.object({
    pages: z.array(z.object({ objects: z.array(object).max(5000) }).passthrough()).min(1).max(30),
    assets: z.record(z.object({ src: z.string().max(7_000_000), pxW: z.number().positive().optional(), pxH: z.number().positive().optional() })),
  }),
  profile: z.record(z.unknown()),
});

export function splitAssets(canvas: z.infer<typeof saveCurrentResumeSchema>['canvas']) {
  const stored = structuredClone(canvas);
  const used = new Set(canvas.pages.flatMap(p => p.objects.filter(o => o.type === 'image').map(o => String(o.assetId))));
  const assets: Array<{ id: string; data: Buffer; mime: string }> = [];
  let total = 0;
  for (const id of used) {
    const asset = stored.assets[id];
    if (!asset || id.length > 160 || !/^[\w-]+$/.test(id)) throw new AppError(400, 'Invalid image reference');
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(asset.src);
    if (!match) throw new AppError(400, 'Images must be JPEG data. Re-add the image in the editor.');
    const data = Buffer.from(match[1], 'base64');
    total += data.length;
    if (data.length > 5_000_000 || total > 10_000_000) throw new AppError(413, 'Resume images exceed the 10 MB total limit (5 MB per image).');
    if (data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) throw new AppError(400, 'Invalid JPEG image');
    assets.push({ id, data, mime: 'image/jpeg' });
    asset.src = `asset:${id}`;
  }
  stored.assets = Object.fromEntries(Object.entries(stored.assets).filter(([id]) => used.has(id)));
  return { stored, assets };
}

export async function hydratedCanvas(user: User) {
  if (!user.resumeCanvas) return null;
  const canvas = structuredClone(user.resumeCanvas);
  const assets: Array<{ assetId: string; mimeType: string; data: Buffer }> = await AppDataSource.query(
    'SELECT "assetId", "mimeType", data FROM resume_assets WHERE "userId" = $1', [user.userId],
  );
  for (const asset of assets) {
    if (canvas.assets?.[asset.assetId]) canvas.assets[asset.assetId].src = `data:${asset.mimeType};base64,${asset.data.toString('base64')}`;
  }
  return canvas;
}

export const saveCurrentResume: RequestHandler = async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.CANDIDATE) throw new AppError(403, 'Only candidates can save a resume');
    const input = saveCurrentResumeSchema.parse(req.body);
    const pdf = Buffer.from(input.pdfBase64, 'base64');
    if (pdf.length > 10_000_000) throw new AppError(413, 'The edited PDF must be under 10 MB');
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new AppError(400, 'Invalid PDF');
    try { await PDFDocument.load(pdf, { throwOnInvalidObject: true }); } catch { throw new AppError(400, 'The edited PDF could not be read'); }
    const { stored, assets } = splitAssets(input.canvas);
    let parsedProfile = input.profile;
    let warning: string | null = null;
    // Re-extract the EDITED PDF so structured skills/education follow text edits.
    try {
      if (!env.ATS_API_KEY) throw new Error('ATS not configured');
      const form = new FormData();
      form.append('file', new Blob([pdf], { type: 'application/pdf' }), input.fileName);
      form.append('max_pages', String(Math.max(1, input.canvas.pages.length)));
      const response = await serviceRequest(`${env.ATS_ENDPOINT}/v1/format`, {
        method: 'POST', headers: { 'X-API-Key': env.ATS_API_KEY }, body: form, signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error('ATS extraction failed');
      const extracted = await response.json();
      if (!extracted || typeof extracted !== 'object' || Array.isArray(extracted)) throw new Error('Invalid extraction');
      // Retain non-resume preferences, but make the new extraction authoritative.
      parsedProfile = { ...extracted };
      for (const key of ['expectedSalary', 'noticePeriod', 'seniority', 'workModes', 'openToWork']) {
        if (input.profile[key] !== undefined) parsedProfile[key] = input.profile[key];
      }
    } catch {
      warning = 'Resume saved. Automatic field extraction is temporarily unavailable; review your profile fields manually.';
    }
    const user = await AppDataSource.transaction(async manager => {
      const repo = manager.getRepository(User);
      const current = await repo.findOne({ where: { userId: req.user!.userId, isDeleted: false }, lock: { mode: 'pessimistic_write' } });
      if (!current) throw new AppError(404, 'Account not found');
      // One current resume: replace all previous PDF/canvas/image data atomically.
      await manager.delete(ResumeVersion, { userId: current.userId });
      await manager.query('DELETE FROM resume_assets WHERE "userId" = $1', [current.userId]);
      for (const asset of assets) await manager.query(
        'INSERT INTO resume_assets ("userId", "assetId", "mimeType", data) VALUES ($1, $2, $3, $4)',
        [current.userId, asset.id, asset.mime, asset.data],
      );
      current.resumeData = null;
      current.resumePdf = pdf;
      current.resumeCanvas = stored;
      current.resumeFileName = input.fileName;
      current.resumeUploadedAt = new Date();
      current.parsedProfile = parsedProfile;
      return repo.save(current);
    });
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ success: true, data: { user: toSafeUser(user), warning } });
  } catch (error) { next(error); }
};

/**
 * The recruiter copy: the candidate's own PDF, stamped with JOBDEV.
 *
 * Style matches the microservice's stamp (Helvetica-Bold 68pt, 45°, light
 * grey) so a recruiter cannot tell which side produced the copy. The word is
 * centred exactly: rotated text starts at the baseline's lower-left, so the
 * run is offset by half its length along the diagonal.
 */
const WATERMARK = {
  text: 'JOBDEV',
  font: StandardFonts.HelveticaBold,
  size: 68,
  opacity: 0.18,
  color: rgb(0.42, 0.45, 0.5),
  footer: 'Shared through JOBDEV',
} as const;

export async function watermarkPdf(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes);
  const font = await document.embedFont(WATERMARK.font);
  for (const page of document.getPages()) {
    const { width, height } = page.getSize();
    const run = font.widthOfTextAtSize(WATERMARK.text, WATERMARK.size);
    const diagonal = run / 2 / Math.SQRT2;
    page.drawText(WATERMARK.text, {
      x: width / 2 - diagonal,
      y: height / 2 - diagonal,
      size: WATERMARK.size,
      font,
      color: WATERMARK.color,
      opacity: WATERMARK.opacity,
      rotate: degrees(45),
    });
    page.drawText(WATERMARK.footer, {
      x: 24, y: 14, size: 9, font, color: rgb(0.3, 0.3, 0.3), opacity: 0.7,
    });
  }
  return Buffer.from(await document.save());
}

/** Candidate directory already permits recruiter access; never expose the clean bytes here. */
export const recruiterResume: RequestHandler = async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) throw new AppError(400, 'Invalid candidate id');
    const candidate = await AppDataSource.getRepository(User).findOneBy({ userId: String(req.params.id), role: UserRole.CANDIDATE, isDeleted: false });
    if (!candidate || !candidate.resumeFileName) throw new AppError(404, 'No resume available');
    let bytes = candidate.resumePdf ?? (candidate.resumeData ? Buffer.from(candidate.resumeData, 'base64') : null);
    if (!bytes) throw new AppError(404, 'No resume available');
    if (bytes.subarray(0, 5).toString() !== '%PDF-') {
      if (!env.ATS_API_KEY) throw new AppError(503, 'Word-to-PDF conversion is unavailable');
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(bytes)]), candidate.resumeFileName);
      /* Clean conversion — the JobDev watermark below is the only stamp. */
      form.append('no_watermark', 'true');
      const response = await serviceRequest(`${env.ATS_ENDPOINT}/v1/format/pdf`, {
        method: 'POST', headers: { 'X-API-Key': env.ATS_API_KEY }, body: form, signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new AppError(502, 'Could not prepare the resume preview');
      bytes = Buffer.from(await response.arrayBuffer());
    }
    const watermarked = await watermarkPdf(bytes);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline; filename="JobDev-candidate-resume.pdf"');
    res.type('application/pdf').send(watermarked);
  } catch (error) { next(error); }
};
