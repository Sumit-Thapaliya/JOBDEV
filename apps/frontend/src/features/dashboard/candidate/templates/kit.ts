/**
 * Resume templates — the shared kit.
 *
 * A template is plain data: a page colour, a few decorative objects and a
 * `build` function that pours the extracted resume into fixed slots. The
 * result is a normal canvas document, so the canvas editor opens it filled,
 * everything stays editable, and the existing PDF writer prints it.
 */
import {
  canvasTextHeight,
  canvasTextWidth,
  RESUME_PAGE,
  type CanvasDocument,
  type CanvasLineObject,
  type CanvasObject,
  type CanvasPage,
  type CanvasRectObject,
  type CanvasTextObject,
  type CanvasTextStyle,
  type ResumeDocument,
  type ResumeSection,
} from '../demo-resume-pdf';

export const PAGE_W = RESUME_PAGE.width;
export const PAGE_H = RESUME_PAGE.height;

export interface TemplateMeta {
  id: string;
  name: string;
  tagline: string;
  /** Small dot on the picker card, in the template's own ink colour. */
  accent: string;
  build: (document: ResumeDocument) => CanvasDocument;
}

export interface Column {
  x: number;
  w: number;
  top: number;
  bottom: number;
  /** The cursor for the next object in this column. */
  y: number;
  /** Which sheet this column is writing to — columns page independently. */
  sheet: number;
}

/**
 * Writes canvas objects into a growing document.
 *
 * Columns paginate **on their own**: a left column that runs long moves its
 * own cursor to sheet 2 without dragging the right column with it — that was
 * the bug that left half a page blank. Page-1 furniture (bands, dividers)
 * never repeats; a template that needs its sidebar on later sheets says so.
 */
export class Sheet {
  readonly doc: CanvasDocument;
  /** Sheet used by `textAt`/`band` unless told otherwise — follows the last column write. */
  private current = 0;
  private readonly columns: Column[] = [];

  constructor(background?: string) {
    this.doc = {
      pages: [{ objects: [], ...(background ? { background } : {}) }],
      assets: {},
    };
  }

  private pageAt(index: number): CanvasPage {
    while (this.doc.pages.length <= index) {
      const background = this.doc.pages[0]?.background;
      this.doc.pages.push({ objects: [], ...(background ? { background } : {}) });
    }
    return this.doc.pages[index];
  }

  get page(): CanvasPage {
    return this.pageAt(this.current);
  }

  get sheetCount(): number {
    return this.doc.pages.length;
  }

  /** A layout column; each one keeps its own sheet and cursor. */
  column(x: number, w: number, top: number, bottom: number): Column {
    const column: Column = { x, w, top, bottom, y: top, sheet: 0 };
    this.columns.push(column);
    return column;
  }

  /** Page-1 furniture only — later sheets stay clean for continuation. */
  decor(...objects: CanvasObject[]): void {
    this.doc.pages[0].objects.push(...objects);
  }

  /** Exact object on a specific sheet (repeatable furniture, footers). */
  bandOn(sheet: number, x: number, y: number, w: number, h: number, fill: string): void {
    this.pageAt(sheet).objects.push({ type: 'rect', x, y, w, h, fill });
  }

  /** Advance one column to its own next sheet; others stay where they are. */
  breakColumn(column: Column): void {
    column.sheet += 1;
    column.y = column.top;
    this.pageAt(column.sheet);
  }

  /** Break every column (single-column templates; a shared forced break). */
  breakPage(): void {
    for (const column of this.columns) this.breakColumn(column);
    this.current = this.columns.length ? Math.max(...this.columns.map((c) => c.sheet)) : 0;
  }

  /** Break this column when `height` no longer fits below its cursor. */
  fit(column: Column, height: number): void {
    if (column.y + height > column.bottom) this.breakColumn(column);
  }

  gap(column: Column, points: number): void {
    this.fit(column, points);
    column.y += points;
  }

  /** Flowing text: measured, page-broken in its own column, appended. */
  text(column: Column, text: string, style: CanvasTextStyle, gapAfter = 0): CanvasTextObject {
    const height = canvasTextHeight(text, style, column.w);
    this.fit(column, height);
    const object: CanvasTextObject = {
      type: 'text',
      x: column.x,
      y: column.y,
      w: column.w,
      text,
      style,
    };
    this.pageAt(column.sheet).objects.push(object);
    this.current = column.sheet;
    column.y += height + gapAfter;
    return object;
  }

  /** Text at an exact spot (two-column rows, chips); returns its height. */
  textAt(
    x: number,
    y: number,
    w: number,
    text: string,
    style: CanvasTextStyle,
    sheet = this.current,
  ): number {
    const height = canvasTextHeight(text, style, w);
    this.pageAt(sheet).objects.push({ type: 'text', x, y, w, text, style });
    return height;
  }

  measure(text: string, style: CanvasTextStyle, width: number): number {
    return canvasTextHeight(text, style, width);
  }

  lineWidth(text: string, style: CanvasTextStyle): number {
    return canvasTextWidth(text, style);
  }

  rule(column: Column, thickness: number, color: string, gapAfter = 0): CanvasLineObject {
    const size = Math.max(0.3, thickness);
    this.fit(column, size);
    const object: CanvasLineObject = {
      type: 'line',
      x: column.x,
      y: column.y,
      w: column.w,
      thickness,
      color,
    };
    this.pageAt(column.sheet).objects.push(object);
    this.current = column.sheet;
    column.y += size + gapAfter;
    return object;
  }

  /** An exact box (chips, bands); does not touch any cursor. */
  band(x: number, y: number, w: number, h: number, fill: string, sheet = this.current): CanvasRectObject {
    const object: CanvasRectObject = { type: 'rect', x, y, w, h, fill };
    this.pageAt(sheet).objects.push(object);
    return object;
  }

  /** A full-page panel that must sit UNDER everything already on the sheet. */
  bandBehind(sheet: number, x: number, y: number, w: number, h: number, fill: string): void {
    this.pageAt(sheet).objects.unshift({ type: 'rect', x, y, w, h, fill });
  }
}

/* ------------------------------ section data ------------------------------ */

export interface CategorizedResume {
  summary: string;
  experience: ResumeSection | null;
  education: ResumeSection | null;
  projects: ResumeSection | null;
  training: ResumeSection | null;
  awards: ResumeSection | null;
  references: ResumeSection | null;
  additional: ResumeSection | null;
  skills: string[];
  /** Anything the patterns above did not claim, in document order. */
  remaining: ResumeSection[];
}

const titled = (section: ResumeSection, pattern: RegExp) => pattern.test(section.title ?? '');

export function categorize(document: ResumeDocument): CategorizedResume {
  const result: CategorizedResume = {
    summary: '',
    experience: null,
    education: null,
    projects: null,
    training: null,
    awards: null,
    references: null,
    additional: null,
    skills: [],
    remaining: [],
  };
  for (const section of document.sections) {
    if (titled(section, /summary|profile|about|objective/i)) {
      const text = sectionText(section);
      if (text) result.summary = result.summary ? `${result.summary}\n${text}` : text;
    } else if (titled(section, /experience|employment|work history|career/i)) {
      if (result.experience) result.remaining.push(section);
      else result.experience = section;
    } else if (titled(section, /education|academic/i)) {
      if (result.education) result.remaining.push(section);
      else result.education = section;
    } else if (titled(section, /skill|competenc|technical/i)) {
      result.skills.push(...skillItems(section));
    } else if (titled(section, /project/i)) {
      if (result.projects) result.remaining.push(section);
      else result.projects = section;
    } else if (titled(section, /training/i)) {
      if (result.training) result.remaining.push(section);
      else result.training = section;
    } else if (titled(section, /award|certificat/i)) {
      if (result.awards) result.remaining.push(section);
      else result.awards = section;
    } else if (titled(section, /reference/i)) {
      if (result.references) result.remaining.push(section);
      else result.references = section;
    } else if (titled(section, /additional|interest|other|volunteer|language|activit/i)) {
      if (result.additional) result.remaining.push(section);
      else result.additional = section;
    } else {
      result.remaining.push(section);
    }
  }
  return result;
}

export function sectionText(section: ResumeSection | null): string {
  return (section?.blocks ?? [])
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n');
}

export function stripBullet(text: string): string {
  return text.replace(/^[-*•·]\s*/, '').trim();
}

/** Section rendered as plain lines: bullets keep their dot, the rest verbatim. */
export function sectionLines(section: ResumeSection | null): string[] {
  const lines: string[] = [];
  for (const block of section?.blocks ?? []) {
    const text = block.text.trim();
    if (!text) continue;
    lines.push(block.kind === 'bullet' ? `•  ${stripBullet(text)}` : text);
  }
  return lines;
}

export interface EntryItem {
  title: string;
  date: string;
  lines: string[];
  bullets: string[];
}

/** A trailing date on an entry line ("June 2015 - Present", "2010 – 2014"). */
const DATE_TAIL =
  /\s((?:[A-Za-z]{3,9}\.?\s+)?\d{4}\s*[-–—]\s*(?:present|current|now|today|(?:[A-Za-z]{3,9}\.?\s+)?\d{4})|present|current|now|today|\d{4})$/i;

/** Separators a title can be left holding once its date is cut off. */
const TRAILING_SEPARATOR = /[\s·•|,;:–—-]+$/;

export function splitEntry(text: string): { title: string; date: string } {
  const match = DATE_TAIL.exec(text);
  if (match && match.index > 3) {
    const title = text.slice(0, match.index).trim().replace(TRAILING_SEPARATOR, '');
    if (title) return { title, date: match[1].trim() };
  }
  return { title: text, date: '' };
}

/** Entry lines and the bullets under them, in order. */
export function sectionEntries(section: ResumeSection | null): EntryItem[] {
  const items: EntryItem[] = [];
  if (!section) return items;
  let current: EntryItem | null = null;
  for (const block of section.blocks) {
    const text = block.text.trim();
    if (!text) continue;
    if (block.kind === 'entry') {
      const split = splitEntry(text);
      current = { title: split.title, date: split.date, lines: [], bullets: [] };
      items.push(current);
      continue;
    }
    if (!current) {
      current = { title: '', date: '', lines: [], bullets: [] };
      items.push(current);
    }
    if (block.kind === 'bullet') current.bullets.push(stripBullet(text));
    else current.lines.push(text);
  }
  return items;
}

/** Individual skills: bullets and comma lists both split into single items. */
export function skillItems(section: ResumeSection | null): string[] {
  const items: string[] = [];
  for (const block of section?.blocks ?? []) {
    const cleaned = stripBullet(block.text.trim());
    if (!cleaned) continue;
    for (const piece of cleaned.split(/\s*[•·|,;]\s*|\n/)) {
      const item = piece.trim();
      if (item.length < 2 || item.length > 48) continue;
      if (!items.includes(item)) items.push(item);
    }
  }
  return items;
}

export function contactsRow(contacts: string[], separator = '   |   '): string {
  return contacts
    .map((contact) => contact.trim())
    .filter(Boolean)
    .join(separator);
}

/** Contact items joined by pipes, wrapped so a long row can never clip. */
export function contactLines(
  sheet: Sheet,
  contacts: string[],
  style: CanvasTextStyle,
  width: number,
  separator = '  |  ',
): string[] {
  const rows: string[] = [];
  let row = '';
  for (const raw of contacts) {
    const contact = raw.trim();
    if (!contact) continue;
    const trial = row ? `${row}${separator}${contact}` : contact;
    if (row && sheet.lineWidth(trial, style) > width) {
      rows.push(row);
      row = contact;
    } else {
      row = trial;
    }
  }
  if (row) rows.push(row);
  return rows;
}

/** The largest character spacing that still fits the line in `width`. */
export function fitSpacing(
  text: string,
  style: CanvasTextStyle,
  width: number,
  preferred: number,
): number {
  if (!text) return 0;
  const base = canvasTextWidth(text, { ...style, letterSpacing: undefined });
  if (base >= width) return 0;
  const gaps = Math.max(1, text.length - 1);
  return Math.max(0, Math.min(preferred, (width - base) / gaps));
}

export interface ChipRowItem {
  text: string;
  w: number;
}

/** Chip packing for the tag-style skill rows. */
export function chipRows(
  items: string[],
  maxWidth: number,
  style: CanvasTextStyle,
  padX = 9,
  gap = 6,
): ChipRowItem[][] {
  const rows: ChipRowItem[][] = [];
  let row: ChipRowItem[] = [];
  let used = 0;
  for (const text of items) {
    const w = canvasTextWidth(text, style) + padX * 2;
    if (row.length && used + gap + w > maxWidth) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push({ text, w });
    used += (row.length > 1 ? gap : 0) + w;
  }
  if (row.length) rows.push(row);
  return rows;
}

/* --------------------------- the sample document --------------------------- */

/** Drives the picker previews — a plausible resume so the cards stay honest. */
export const SAMPLE_DOCUMENT: ResumeDocument = {
  name: 'Anisha Parvati',
  headline: 'Head Manager',
  contacts: [
    '123 Anywhere Street, Any City',
    '+1 234 567 890',
    'hello@reallygreatsite.com',
    'reallygreatsite.com',
  ],
  sections: [
    {
      title: 'About me',
      blocks: [
        {
          kind: 'text',
          text: 'Experienced manager with a record of running busy teams. Comfortable owning budgets, schedules and the details that keep work moving on time.',
        },
      ],
    },
    {
      title: 'Experience',
      blocks: [
        { kind: 'entry', text: 'Head Manager — Borcelle Studio · 2023 - Now' },
        { kind: 'bullet', text: 'Lead a team of twelve across two locations.' },
        { kind: 'bullet', text: 'Introduced the weekly planning routine now used company-wide.' },
        { kind: 'entry', text: 'General Manager — Liceria & Co. · 2022 - 2023' },
        { kind: 'bullet', text: 'Cut supply costs by 14% in the first year.' },
      ],
    },
    {
      title: 'Education',
      blocks: [
        { kind: 'entry', text: 'Master of Business Management — Wardiere University · 2020 - 2023' },
        { kind: 'entry', text: 'Bachelor of Business Management — Borcelle University · 2016 - 2020' },
      ],
    },
    {
      title: 'Skills',
      blocks: [
        { kind: 'bullet', text: 'Leadership' },
        { kind: 'bullet', text: 'Analytics' },
        { kind: 'bullet', text: 'Digital marketing' },
        { kind: 'bullet', text: 'Teamwork' },
        { kind: 'bullet', text: 'Communication' },
        { kind: 'bullet', text: 'Problem solving' },
        { kind: 'bullet', text: 'Collaboration' },
      ],
    },
  ],
};

export type { CanvasDocument, CanvasObject, ResumeDocument, ResumeSection, CanvasTextStyle };
