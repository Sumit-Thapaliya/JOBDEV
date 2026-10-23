/**
 * "Modern Minimal" — one column, ruled section headings, right-aligned dates
 * and tag-style skill chips. Rebuilt from the Canva reference as vector data.
 */
import { canvasLineHeight, type ResumeSection } from '../demo-resume-pdf';
import type { CanvasTextStyle, TemplateMeta } from './kit';
import { Sheet, categorize, chipRows, contactLines, sectionEntries, sectionLines, sectionText } from './kit';

const INK = '#111111';
const BODY = '#333333';
const SOFT = '#555555';
const RULE = '#BBBBBB';
const TOP_RULE = '#1A1A1A';
const CHIP_BG = '#F0F0F0';
const CHIP_INK = '#222222';
const CHIP_H = 18;
const CHIP_PAD = 9;
const CHIP_GAP = 6;

export const modernMinimal: TemplateMeta = {
  id: 'modern-minimal',
  name: 'Modern Minimal',
  tagline: 'Single column, ruled headings, skill chips',
  accent: '#555555',
  build(document) {
    const sheet = new Sheet();
    const column = sheet.column(56, 483, 56, 792);
    const categorized = categorize(document);

    /* ------------------------------- heading ------------------------------ */
    sheet.text(column, document.name || 'Your name', { size: 26, bold: true, color: INK }, 3);
    if (document.headline) {
      sheet.text(column, document.headline, { size: 12.5, color: SOFT }, 7);
    }
    if (document.contacts.length) {
      const contactStyle: CanvasTextStyle = { size: 9.5, color: BODY };
      const rows = contactLines(sheet, document.contacts, contactStyle, column.w);
      rows.forEach((row) => sheet.text(column, row, contactStyle, 3));
      sheet.gap(column, 9 - 3 - (rows.length - 1) * 3);
    }
    sheet.rule(column, 1.1, TOP_RULE, 15);

    /* ------------------------------ sections ------------------------------ */
    const heading = (text: string) => {
      /* Keep a heading with at least its first row — never orphan it at the foot. */
      sheet.fit(column, 78);
      sheet.text(column, text.toUpperCase(), { size: 11.5, bold: true, letterSpacing: 0.8, color: INK }, 4);
      sheet.rule(column, 0.8, RULE, 9);
    };

    const paragraph = (text: string) => {
      for (const line of text.split('\n')) {
        if (line.trim()) sheet.text(column, line.trim(), { size: 10, color: BODY, lineHeight: 1.5 }, 2);
      }
    };

    const entries = (section: ResumeSection) => {
      for (const item of sectionEntries(section)) {
        const titleStyle: CanvasTextStyle = { size: 11, bold: true, color: INK };
        const dateStyle: CanvasTextStyle = { size: 9.5, color: SOFT };
        const dateW = item.date ? Math.min(200, sheet.lineWidth(item.date, dateStyle) + 2) : 0;
        const titleW = Math.max(120, column.w - (dateW ? dateW + 14 : 0));
        const titleH = item.title ? sheet.measure(item.title, titleStyle, titleW) : 0;
        const dateH = item.date ? sheet.measure(item.date, dateStyle, dateW) : 0;
        sheet.fit(column, Math.max(titleH, dateH, 1));
        const page = column.sheet;
        const y0 = column.y;
        if (item.title) sheet.textAt(column.x, y0, titleW, item.title, titleStyle, page);
        if (item.date) sheet.textAt(column.x + column.w - dateW, y0, dateW, item.date, dateStyle, page);
        column.y = y0 + Math.max(titleH, dateH, 1) + 4;
        for (const line of item.lines) sheet.text(column, line, { size: 9.5, color: SOFT }, 1.5);
        for (const bullet of item.bullets) sheet.text(column, `•  ${bullet}`, { size: 10, color: BODY }, 1.5);
        sheet.gap(column, 6);
      }
    };

    const chips = (items: string[]) => {
      const chipStyle: CanvasTextStyle = { size: 9.5, color: CHIP_INK };
      const offsets = Math.max(0, (CHIP_H - canvasLineHeight(chipStyle)) / 2);
      for (const row of chipRows(items, column.w, chipStyle, CHIP_PAD, CHIP_GAP)) {
        sheet.fit(column, CHIP_H);
        const page = column.sheet;
        const y0 = column.y;
        let x = column.x;
        for (const chip of row) {
          sheet.band(x, y0, chip.w, CHIP_H, CHIP_BG, page);
          sheet.textAt(x + CHIP_PAD, y0 + offsets, chip.w - CHIP_PAD * 2, chip.text, chipStyle, page);
          x += chip.w + CHIP_GAP;
        }
        column.y = y0 + CHIP_H + 6;
      }
    };

    const lines = (section: ResumeSection | null, gapAfter = 2.5) => {
      for (const line of sectionLines(section)) {
        sheet.text(column, line, { size: 10, color: BODY }, gapAfter);
      }
    };

    /* -------------------------- document order ---------------------------- */
    if (categorized.summary) {
      heading('Profile');
      paragraph(categorized.summary);
      sheet.gap(column, 12);
    }
    if (categorized.experience) {
      heading('Employment history');
      entries(categorized.experience);
      sheet.gap(column, 8);
    }
    if (categorized.education) {
      heading('Education');
      entries(categorized.education);
      sheet.gap(column, 8);
    }
    if (categorized.skills.length) {
      heading('Skills');
      chips(categorized.skills);
      sheet.gap(column, 8);
    }
    if (categorized.projects) {
      heading('Projects');
      entries(categorized.projects);
      sheet.gap(column, 8);
    }
    if (categorized.training) {
      heading('Training');
      lines(categorized.training);
      sheet.gap(column, 8);
    }
    if (categorized.awards) {
      heading('Certifications');
      lines(categorized.awards);
      sheet.gap(column, 8);
    }
    if (categorized.additional) {
      heading('Additional information');
      paragraph(sectionText(categorized.additional));
      sheet.gap(column, 8);
    }
    if (categorized.references) {
      heading('References');
      lines(categorized.references);
      sheet.gap(column, 8);
    }
    for (const section of categorized.remaining) {
      if (!sectionLines(section).length) continue;
      heading(section.title || 'More');
      lines(section);
      sheet.gap(column, 8);
    }

    /* Footer note, only when everything fitted on one sheet. */
    if (sheet.sheetCount === 1 && column.y < 780) {
      sheet.textAt(column.x, 792, column.w, 'Curriculum Vitae', {
        size: 10.5,
        bold: true,
        color: INK,
        align: 'center',
      });
    }

    return sheet.doc;
  },
};
