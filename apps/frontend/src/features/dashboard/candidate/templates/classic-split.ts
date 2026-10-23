/**
 * "Classic Split" — letter-spaced caps heading, two columns with a hairline
 * divider. Left: contact, education, awards, skills. Right: profile, work
 * experience. Rebuilt from the Canva reference as vector data.
 */
import type { CanvasObject, CanvasTextStyle, TemplateMeta } from './kit';
import { Sheet, categorize, fitSpacing, sectionEntries, sectionLines, stripBullet } from './kit';

const INK = '#111111';
const DETAIL = '#3D3D3D';
const DATE = '#4F4F4F';
const HAIRLINE = '#D6D6D6';

const HEADING: CanvasTextStyle = { size: 11, bold: true, letterSpacing: 1.8, color: INK };

export const classicSplit: TemplateMeta = {
  id: 'classic-split',
  name: 'Classic Split',
  tagline: 'Two columns, letter-spaced caps',
  accent: '#111111',
  build(document) {
    const sheet = new Sheet();

    /* A hairline between the columns, sheet-wide. */
    sheet.decor({
      type: 'rect',
      x: 234,
      y: 178,
      w: 1,
      h: 616,
      fill: HAIRLINE,
    } as CanvasObject);

    const head = sheet.column(48, 500, 74, 176);
    const left = sheet.column(48, 168, 182, 794);
    const right = sheet.column(256, 291, 182, 794);
    const categorized = categorize(document);

    /* ------------------------------- heading ------------------------------ */
    const name = (document.name || 'Your name').toUpperCase();
    sheet.text(
      head,
      name,
      { size: 21, bold: true, color: INK, letterSpacing: fitSpacing(name, { size: 21, bold: true }, 500, 6.5) },
      3,
    );
    if (document.headline) {
      sheet.text(head, document.headline, { size: 12.5, italic: true, color: DETAIL }, 0);
    }

    /* --------------------------- left column ------------------------------ */
    const leftHeading = (text: string) => sheet.text(left, text.toUpperCase(), HEADING, 7);
    const leftLines = (lines: string[], style: CanvasTextStyle, gapAfter: number) => {
      for (const line of lines) sheet.text(left, line, style, gapAfter);
    };

    if (document.contacts.length) {
      leftHeading('Contact');
      leftLines(document.contacts.map((contact) => `•  ${contact}`), { size: 9.5, color: INK }, 3);
      sheet.gap(left, 11);
    }

    const education = sectionEntries(categorized.education);
    if (education.length) {
      leftHeading('Education');
      for (const item of education) {
        if (item.title) sheet.text(left, item.title, { size: 10.5, bold: true, color: INK }, 1.5);
        if (item.date) sheet.text(left, item.date, { size: 9, color: DATE }, 1.5);
        leftLines([...item.lines, ...item.bullets], { size: 9.5, color: DETAIL }, 2);
        sheet.gap(left, 6);
      }
      sheet.gap(left, 5);
    }

    const { awards, training, skills, references } = categorized;

    if (awards && sectionLines(awards).length) {
      leftHeading('Awards & certifications');
      for (const line of sectionLines(awards)) {
        sheet.text(left, line.startsWith('•') ? line : `•  ${stripBullet(line)}`, { size: 9.5, color: INK }, 2.5);
      }
      sheet.gap(left, 11);
    }

    if (training && sectionLines(training).length) {
      leftHeading('Training');
      for (const line of sectionLines(training)) {
        sheet.text(left, line.startsWith('•') ? line : `•  ${stripBullet(line)}`, { size: 9.5, color: INK }, 2.5);
      }
      sheet.gap(left, 11);
    }

    if (skills.length) {
      leftHeading('Skills');
      for (const item of skills) sheet.text(left, `•  ${item}`, { size: 9.5, color: INK }, 2.5);
      sheet.gap(left, 7);
    }

    if (references && sectionLines(references).length) {
      leftHeading('References');
      for (const line of sectionLines(references)) {
        sheet.text(left, line, { size: 9.5, color: DETAIL }, 2.5);
      }
    }

    /* --------------------------- right column ----------------------------- */
    const rightHeading = (text: string) => sheet.text(right, text.toUpperCase(), HEADING, 7);

    if (categorized.summary) {
      rightHeading('Profile');
      sheet.text(right, categorized.summary, { size: 10, color: '#1F1F1F', lineHeight: 1.5 }, 0);
      sheet.gap(right, 15);
    }

    if (categorized.experience) {
      rightHeading('Work experience');
      for (const item of sectionEntries(categorized.experience)) {
        if (item.title) sheet.text(right, item.title, { size: 10.5, bold: true, color: INK }, 1.5);
        if (item.date) sheet.text(right, item.date, { size: 9.5, italic: true, color: DATE }, 2.5);
        for (const line of item.lines) sheet.text(right, line, { size: 9.5, color: DETAIL }, 1.5);
        for (const bullet of item.bullets) sheet.text(right, `•  ${bullet}`, { size: 9.5, color: '#222222' }, 1.5);
        sheet.gap(right, 7);
      }
      sheet.gap(right, 6);
    }

    if (categorized.projects && sectionLines(categorized.projects).length) {
      rightHeading('Projects');
      for (const line of sectionLines(categorized.projects)) {
        sheet.text(right, line, { size: 9.5, color: DETAIL }, 2.5);
      }
      sheet.gap(right, 12);
    }

    if (categorized.additional && sectionLines(categorized.additional).length) {
      rightHeading('Additional information');
      for (const line of sectionLines(categorized.additional)) {
        sheet.text(right, line, { size: 9.5, color: DETAIL }, 2.5);
      }
      sheet.gap(right, 12);
    }

    for (const section of categorized.remaining) {
      if (!sectionLines(section).length) continue;
      rightHeading(section.title || 'More');
      for (const line of sectionLines(section)) {
        sheet.text(right, line, { size: 9.5, color: DETAIL }, 2.5);
      }
      sheet.gap(right, 12);
    }

    return sheet.doc;
  },
};
