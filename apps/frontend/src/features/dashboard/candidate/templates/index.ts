/**
 * The template registry. Add a file, add a row here — the pickers (Build
 * Resume strip and the editor's Templates panel) read this list.
 */
import { blueSidebar } from './blue-sidebar';
import { classicSplit } from './classic-split';
import { executiveCream } from './executive-cream';
import { headerBand } from './header-band';
import { modernMinimal } from './modern-minimal';
import type { CanvasDocument, ResumeDocument, TemplateMeta } from './kit';

export { SAMPLE_DOCUMENT } from './kit';
export type { TemplateMeta } from './kit';

export const RESUME_TEMPLATES: TemplateMeta[] = [
  classicSplit,
  modernMinimal,
  executiveCream,
  blueSidebar,
  headerBand,
];

export function getTemplate(id: string): TemplateMeta | null {
  return RESUME_TEMPLATES.find((template) => template.id === id) ?? null;
}

/** Fill a template from the extracted resume; the editor opens the result. */
export function fillWithTemplate(id: string, document: ResumeDocument): CanvasDocument | null {
  const template = getTemplate(id);
  return template ? template.build(document) : null;
}
