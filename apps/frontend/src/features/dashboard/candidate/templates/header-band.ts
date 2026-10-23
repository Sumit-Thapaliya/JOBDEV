/**
 * "Header Band" — a dark full-width band carries the name and headline, the
 * contact row sits just under it, and one clean column follows. Section
 * headings are tracked caps with a hairline; dates run down the right edge.
 */
import type { CanvasTextStyle, TemplateMeta } from './kit';
import { Sheet, categorize, contactLines, sectionEntries, sectionLines, sectionText } from './kit';

const BAND = '#171A24';
const INK = '#171A24';
const BODY = '#3A3F4A';
const MUTED = '#6A7080';
const RULE = '#E8EAF0';
const ACCENT = '#3B57E7';
const BAND_H = 112;

export const headerBand: TemplateMeta = {
  id: 'header-band',
  name: 'Header Band',
  tagline: 'Dark masthead, one clean column',
  accent: BAND,
  build(document) {
    const sheet = new Sheet();
    const band = sheet.column(48, 499, 30, BAND_H - 14);
    const head = sheet.column(48, 499, BAND_H + 16, BAND_H + 70);
    const main = sheet.column(48, 499, BAND_H + 78, 792);
    const categorized = categorize(document);

    /* ------------------------------ masthead ------------------------------ */
    const name = document.name || 'Your name';
    sheet.text(band, name, { size: 22, bold: true, color: '#FFFFFF', lineHeight: 1.15 }, 2);
    if (document.headline) {
      sheet.text(band, document.headline, { size: 11, color: '#A9B8FF', letterSpacing: 0.4 }, 0);
    }
    /* Behind the text: the masthead band must not cover the name. */
    sheet.bandBehind(0, 0, 0, 595, BAND_H, BAND);

    /* ------------------------------- contact ------------------------------ */
    if (document.contacts.length) {
      const contactStyle: CanvasTextStyle = { size: 9.5, color: MUTED };
      const rows = contactLines(sheet, document.contacts, contactStyle, head.w);
      rows.forEach((row) => sheet.text(head, row, contactStyle, 3));
    }

    /* ------------------------------ sections ------------------------------ */
    const heading = (text: string, first = false) => {
      if (!first) sheet.gap(main, 8);
      sheet.fit(main, 78);
      sheet.text(main, text.toUpperCase(), { size: 11, bold: true, letterSpacing: 1, color: INK }, 3.5);
      sheet.rule(main, 1, RULE, 8);
    };

    const paragraph = (text: string) => {
      for (const line of text.split('\n')) {
        if (line.trim()) sheet.text(main, line.trim(), { size: 10, color: BODY, lineHeight: 1.55 }, 2);
      }
    };

    const entries = (sections: ReturnType<typeof sectionEntries>) => {
      const titleStyle: CanvasTextStyle = { size: 10.5, bold: true, color: INK };
      const dateStyle: CanvasTextStyle = { size: 9.5, bold: true, color: ACCENT };
      for (const item of sections) {
        const dateW = item.date ? Math.min(150, sheet.lineWidth(item.date, dateStyle) + 2) : 0;
        const titleW = Math.max(120, main.w - (dateW ? dateW + 12 : 0));
        const titleH = item.title ? sheet.measure(item.title, titleStyle, titleW) : 0;
        const dateH = item.date ? sheet.measure(item.date, dateStyle, dateW) : 0;
        sheet.fit(main, Math.max(titleH, dateH, 1));
        const page = main.sheet;
        const y0 = main.y;
        if (item.title) sheet.textAt(main.x, y0, titleW, item.title, titleStyle, page);
        if (item.date) sheet.textAt(main.x + main.w - dateW, y0, dateW, item.date, dateStyle, page);
        main.y = y0 + Math.max(titleH, dateH, 1) + 4;
        for (const line of item.lines) sheet.text(main, line, { size: 9.5, color: MUTED }, 1.5);
        for (const bullet of item.bullets) sheet.text(main, `•  ${bullet}`, { size: 9.5, color: BODY }, 1.5);
        sheet.gap(main, 6);
      }
    };

    if (categorized.summary) {
      heading('Profile', true);
      paragraph(categorized.summary);
    }
    if (categorized.experience) {
      heading('Experience');
      entries(sectionEntries(categorized.experience));
    }
    if (categorized.education) {
      heading('Education');
      entries(sectionEntries(categorized.education));
    }
    if (categorized.skills.length) {
      heading('Skills');
      const style: CanvasTextStyle = { size: 9.5, color: BODY };
      const cellW = main.w / 4;
      for (let index = 0; index < categorized.skills.length; index += 4) {
        const row = categorized.skills.slice(index, index + 4);
        const heights = row.map((skill) => sheet.measure(`•  ${skill}`, style, cellW - 6));
        const rowH = Math.max(...heights, 1);
        sheet.fit(main, rowH);
        const page = main.sheet;
        const y0 = main.y;
        row.forEach((skill, position) => {
          sheet.textAt(main.x + position * cellW, y0, cellW - 6, `•  ${skill}`, style, page);
        });
        main.y = y0 + rowH + 3;
      }
    }
    if (categorized.projects) {
      heading('Projects');
      entries(sectionEntries(categorized.projects));
    }
    if (categorized.awards || categorized.training) {
      heading('Certifications & training');
      const groups = [
        ...(categorized.awards ? sectionEntries(categorized.awards) : []),
        ...(categorized.training ? sectionEntries(categorized.training) : []),
      ];
      for (const item of groups) {
        if (item.title) sheet.text(main, item.title, { size: 10, color: BODY }, 1.5);
        for (const line of [...item.lines, ...item.bullets]) {
          sheet.text(main, line, { size: 9.5, color: BODY }, 1.5);
        }
      }
    }
    if (categorized.references) {
      heading('References');
      for (const item of sectionEntries(categorized.references)) {
        if (item.title) sheet.text(main, item.title, { size: 10, bold: true, color: INK }, 1);
        for (const line of [...item.lines, ...item.bullets]) {
          sheet.text(main, line, { size: 9.5, color: MUTED }, 1);
        }
      }
    }
    if (categorized.additional) {
      heading('Additional information');
      paragraph(sectionText(categorized.additional));
    }
    for (const section of categorized.remaining) {
      if (!sectionLines(section).length) continue;
      heading(section.title || 'More');
      for (const line of sectionLines(section)) {
        sheet.text(main, line, { size: 10, color: BODY }, 2.5);
      }
    }

    return sheet.doc;
  },
};
