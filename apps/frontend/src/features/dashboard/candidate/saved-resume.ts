import { toResumeDocument, type AtsGenerationResult } from './ats-service';
import {
  flowToCanvas,
  resumePdf,
  resumePdfFromCanvas,
  type CanvasDocument,
} from './demo-resume-pdf';

export interface SavedResume {
  fileName: string;
  dataBase64: string;
  uploadedAt: string | null;
  parsedProfile: Record<string, unknown> | null;
  canvas: CanvasDocument | null;
  /** The 1-page ATS PDF stored on the profile (users.resumePdf). */
  atsPdfBase64?: string | null;
}

const base64Pdf = (base64: string) =>
  new Blob([Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))], {
    type: 'application/pdf',
  });

export function restoreFile(saved: SavedResume | null) {
  if (!saved) return null;
  const extension = saved.fileName.split('.').pop()?.toLowerCase();
  const type =
    extension === 'pdf'
      ? 'application/pdf'
      : extension === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/msword';
  return new File(
    [
      Uint8Array.from(atob(saved.dataBase64), (character) =>
        character.charCodeAt(0),
      ),
    ],
    saved.fileName,
    { type },
  );
}

export function restoreResult(
  saved: SavedResume | null,
): AtsGenerationResult | null {
  if (!saved?.parsedProfile && !saved?.canvas && !saved?.atsPdfBase64) return null;
  const document = saved.parsedProfile ? toResumeDocument(saved.parsedProfile) : null;
  const canvas =
    saved.canvas ??
    (Array.isArray(saved.parsedProfile?.pages)
      ? (saved.parsedProfile as unknown as CanvasDocument)
      : null) ??
    (document ? flowToCanvas(document) : null);
  const fileName = `${saved.fileName.replace(/\.[^.]+$/, '')}-ats-resume.pdf`;

  /* The profile's stored ATS PDF wins: it is exactly what the service built. */
  if (saved.atsPdfBase64) {
    return {
      fileName,
      blob: base64Pdf(saved.atsPdfBase64),
      pages: 1,
      generatedAt: saved.uploadedAt ?? new Date().toISOString(),
      engine: 'service',
      note: 'Your ATS resume, saved to your profile.',
      ...(canvas ? { canvas } : {}),
    };
  }

  if (canvas) {
    return {
      ...resumePdfFromCanvas(canvas),
      fileName,
      generatedAt: saved.uploadedAt ?? new Date().toISOString(),
      engine: 'service',
      note: 'Restored from your saved resume.',
      canvas,
    };
  }

  return {
    ...resumePdf(document!),
    fileName,
    generatedAt: saved.uploadedAt ?? new Date().toISOString(),
    engine: 'service',
    note: 'Restored from your saved resume.',
    document: document!,
    canvas: flowToCanvas(document!),
  };
}
