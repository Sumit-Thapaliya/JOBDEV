import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { ApplicantPayload } from './applicant.serializer.js';

/**
 * The recruiter's PDF — built HERE, from the already-masked payload.
 *
 * Why not the microservice / the candidate's stored PDF: those bytes still
 * contain the real email, phone and links. A PDF cannot be blurred after the
 * fact, so the only safe PDF is one composed from the masked view
 * (`toApplicantPayload`) — the tokenised contact fields never enter this file.
 *
 * Nothing new is needed to draw it: pdf-lib is already a backend dependency
 * (it stamps the JOBDEV watermark), and everything below is text layout.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 46;
const BOTTOM = 58;
/** Same stamp geometry as the existing watermark helper. */
const WATERMARK = { text: 'JOBDEV', size: 68, opacity: 0.18, color: rgb(0.42, 0.45, 0.5) };

const INK = rgb(0.1, 0.11, 0.12);
const MUTED = rgb(0.42, 0.45, 0.5);
const HAIRLINE = rgb(0.86, 0.87, 0.89);
const REDACTION = rgb(0.82, 0.84, 0.86);

type Masked = ApplicantPayload['candidate']['contact'];

export async function renderApplicantPdf(
  payload: ApplicantPayload,
  viewerLabel: string,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  const { resume, contact, location } = payload.candidate;
  const width = A4.width - MARGIN * 2;

  let page = document.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  const wrap = (value: string, font: PDFFont, size: number, maxWidth = width): string[] => {
    const rows: string[] = [];
    let current = '';
    for (const word of value.split(/\s+/).filter(Boolean)) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
      else {
        if (current) rows.push(current);
        current = word;
      }
    }
    if (current) rows.push(current);
    return rows.length ? rows : [''];
  };

  const newPage = () => {
    page = document.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN;
  };

  const ensure = (needed: number) => {
    if (y - needed < BOTTOM) newPage();
  };

  const centred = (value: string, font: PDFFont, size: number, color = INK, gap = size + 3) => {
    ensure(gap);
    page.drawText(value, {
      x: (A4.width - font.widthOfTextAtSize(value, size)) / 2,
      y: y - size,
      size,
      font,
      color,
    });
    y -= gap;
  };

  const text = (
    value: string,
    options: { font?: PDFFont; size?: number; color?: typeof INK; gap?: number; indent?: number } = {},
  ) => {
    const { font = regular, size = 9.4, color = INK, gap = 12, indent = 0 } = options;
    for (const row of wrap(value, font, size, width - indent)) {
      ensure(gap);
      page.drawText(row, { x: MARGIN + indent, y: y - size, size, font, color });
      y -= gap;
    }
  };

  const heading = (label: string) => {
    y -= 6;
    ensure(15);
    page.drawText(label.toUpperCase(), { x: MARGIN, y: y - 8.6, size: 8.6, font: bold, color: INK });
    y -= 12.5;
  };

  const rule = () => {
    ensure(12);
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4.width - MARGIN, y },
      thickness: 0.7,
      color: HAIRLINE,
    });
    y -= 14;
  };

  /** A withheld value: same idea as the blur on the paper — a grey bar whose
   *  length hints at the original, never the value and never the digest. */
  const redacted = (x: number, length: number) => {
    const barWidth = Math.max(26, Math.min(92, length * 3.1));
    page.drawRectangle({
      x,
      y: y - 8 + 1.5,
      width: barWidth,
      height: 6.5,
      color: REDACTION,
    });
    return barWidth;
  };

  const contactRow = () => {
    const fields = [
      contact.email,
      contact.phone,
      contact.linkedin,
      ...contact.other.map((item) => ({
        ...item,
        state: (item.token ? 'blurred' : 'missing') as 'blurred' | 'missing',
      })),
    ].filter((field) => field.state === 'blurred' && field.token);

    if (!fields.length) return;
    ensure(16);

    const layout = fields.map((field) => {
      const label = field.label.toUpperCase();
      const labelWidth = regular.widthOfTextAtSize(label, 7.4);
      const bar = Math.max(26, Math.min(92, field.length * 3.1));
      return { label, labelWidth, length: field.length, total: labelWidth + 4 + bar };
    });
    const gap = 16;
    const totalWidth = layout.reduce((sum, item) => sum + item.total, 0) + gap * (layout.length - 1);

    let x = (A4.width - totalWidth) / 2;
    for (const item of layout) {
      page.drawText(item.label, { x, y: y - 8.6, size: 7.4, font: bold, color: MUTED });
      redacted(x + item.labelWidth + 4, item.length);
      x += item.total + gap;
    }
    y -= 18;
  };

  /* ------------------------------------------------------------------ header */
  centred(resume.name || 'Candidate', bold, 17, INK, 21);
  if (resume.headline) centred(resume.headline, regular, 9.2, MUTED, 13);
  if (location) centred(location, regular, 8.6, MUTED, 13);
  contactRow();
  rule();

  /* ---------------------------------------------------------------- content */
  if (resume.summary) {
    heading('Summary');
    text(resume.summary);
  }

  if (resume.experience.length) {
    heading('Experience');
    for (const entry of resume.experience) {
      const role = [entry.role, entry.company].filter(Boolean).join(' · ');
      ensure(24);
      const periodWidth = entry.period ? regular.widthOfTextAtSize(entry.period, 8.6) + 12 : 0;
      const rows = wrap(role, bold, 9.8, width - periodWidth);
      rows.forEach((row, index) => {
        ensure(12.6);
        page.drawText(row, { x: MARGIN, y: y - 9.6, size: 9.8, font: bold, color: INK });
        if (index === rows.length - 1 && entry.period) {
          page.drawText(entry.period, {
            x: A4.width - MARGIN - regular.widthOfTextAtSize(entry.period, 8.6),
            y: y - 9.6,
            size: 8.6,
            font: regular,
            color: MUTED,
          });
        }
        y -= 12.6;
      });
      for (const detail of entry.details) text(`•  ${detail}`, { size: 9.2, gap: 11.4, indent: 10 });
      y -= 4;
    }
  }

  if (resume.education.length) {
    heading('Education');
    for (const line of resume.education) text(line);
  }

  if (resume.skills.length) {
    heading('Skills');
    for (const line of resume.skills) text(line);
  }

  for (const section of resume.sections) {
    heading(section.heading);
    for (const line of section.lines) text(line);
  }

  /* ---------------------------------------------------------------- stamps */
  const stampDate = new Date().toLocaleDateString();
  const pages = document.getPages();
  pages.forEach((sheet: PDFPage, index) => {
    const size = sheet.getSize();
    const run = bold.widthOfTextAtSize(WATERMARK.text, WATERMARK.size);
    const diagonal = run / 2 / Math.SQRT2;
    sheet.drawText(WATERMARK.text, {
      x: size.width / 2 - diagonal,
      y: size.height / 2 - diagonal,
      size: WATERMARK.size,
      font: bold,
      color: WATERMARK.color,
      opacity: WATERMARK.opacity,
      rotate: degrees(45),
    });
    sheet.drawText(`Shared through JOBDEV · ${viewerLabel} · ${stampDate}`, {
      x: MARGIN,
      y: 26,
      size: 7.4,
      font: bold,
      color: MUTED,
      opacity: 0.9,
    });
    const counter = `Page ${index + 1} of ${pages.length}`;
    sheet.drawText(counter, {
      x: size.width - MARGIN - regular.widthOfTextAtSize(counter, 7.4),
      y: 26,
      size: 7.4,
      font: regular,
      color: MUTED,
      opacity: 0.9,
    });
  });

  document.setTitle(`${resume.name || 'Candidate'} — JobDev resume`);
  document.setProducer('JobDev');
  document.setCreator('JobDev');

  return document.save();
}
