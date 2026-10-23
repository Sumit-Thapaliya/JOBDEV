/**
 * "Blue Sidebar" — a solid brand-blue panel down the left edge with the name,
 * contact and skills in white; the right side carries the story (summary,
 * experience, education, projects). The sidebar band repeats on continuation
 * sheets so nothing white-on-white ever happens.
 */
import type { CanvasTextStyle, TemplateMeta } from './kit';
import { Sheet, categorize, sectionEntries, sectionLines, sectionText } from './kit';

const BRAND = '#3B57E7';
const INK = '#171A24';
const BODY = '#3A3F4A';
const MUTED = '#6A7080';
const RULE = '#E8EAF0';
const ON_BAND = '#FFFFFF';
const ON_BAND_SOFT = '#D7DEFF';

const SIDEBAR_W = 190;

export const blueSidebar: TemplateMeta = {
  id: 'blue-sidebar',
  name: 'Blue Sidebar',
  tagline: 'Full-height brand panel, white story column',
  accent: BRAND,
  build(document) {
    const sheet = new Sheet();

    /* The band is furniture: drawn on page 1 here, repeated after the layout
       knows how many sheets the sidebar needs. */
    const side = sheet.column(20, SIDEBAR_W - 40, 56, 792);
    const main = sheet.column(SIDEBAR_W + 26, 595 - SIDEBAR_W - 26 - 48, 56, 792);
    const categorized = categorize(document);

    const sideHeading = (text: string) =>
      sheet.text(side, text.toUpperCase(), { size: 9.5, bold: true, letterSpacing: 1.2, color: ON_BAND_SOFT }, 5);

    /* ------------------------------- sidebar ------------------------------ */
    sheet.text(side, document.name || 'Your name', { size: 17, bold: true, color: ON_BAND, lineHeight: 1.2 }, 3);
    if (document.headline) {
      sheet.text(side, document.headline, { size: 10, italic: true, color: ON_BAND_SOFT, lineHeight: 1.4 }, 12);
    } else {
      sheet.gap(side, 10);
    }

    if (document.contacts.length) {
      sideHeading('Contact');
      for (const contact of document.contacts) {
        sheet.text(side, contact, { size: 8.5, color: ON_BAND, lineHeight: 1.5 }, 3);
      }
      sheet.gap(side, 12);
    }

    if (categorized.skills.length) {
      sideHeading('Skills');
      for (const skill of categorized.skills) {
        sheet.text(side, skill, { size: 9, color: ON_BAND, lineHeight: 1.5 }, 3);
      }
      sheet.gap(side, 12);
    }

    const sidebarAwards = categorized.awards ?? categorized.training;
    if (sidebarAwards && sectionLines(sidebarAwards).length) {
      sideHeading(categorized.awards ? 'Certifications' : 'Training');
      for (const line of sectionLines(sidebarAwards)) {
        sheet.text(side, line.replace(/^•\s*/, ''), { size: 8.5, color: ON_BAND_SOFT, lineHeight: 1.5 }, 3.5);
      }
    }

    /* The panel itself — one band per sheet, painted UNDER everything else. */
    for (let page = 0; page < sheet.sheetCount; page += 1) {
      sheet.bandBehind(page, 0, 0, SIDEBAR_W, 842, BRAND);
    }

    /* ---------------------------- story column ---------------------------- */
    const heading = (text: string) => {
      sheet.fit(main, 78);
      sheet.text(main, text.toUpperCase(), { size: 11.5, bold: true, letterSpacing: 0.6, color: BRAND }, 4);
      sheet.rule(main, 0.9, RULE, 9);
    };

    const paragraph = (text: string) => {
      for (const line of text.split('\n')) {
        if (line.trim()) sheet.text(main, line.trim(), { size: 10, color: BODY, lineHeight: 1.55 }, 2);
      }
    };

    const entries = (sections: ReturnType<typeof sectionEntries>, dateStyle: CanvasTextStyle) => {
      for (const item of sections) {
        const titleStyle: CanvasTextStyle = { size: 11, bold: true, color: INK };
        const dateW = item.date ? Math.min(170, sheet.lineWidth(item.date, dateStyle) + 2) : 0;
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
        sheet.gap(main, 7);
      }
    };

    const simple = (section: Parameters<typeof sectionLines>[0]) => {
      for (const line of sectionLines(section)) {
        sheet.text(main, line, { size: 10, color: BODY }, 2.5);
      }
    };

    if (categorized.summary) {
      heading('Profile');
      paragraph(categorized.summary);
      sheet.gap(main, 14);
    }
    if (categorized.experience) {
      heading('Experience');
      entries(sectionEntries(categorized.experience), { size: 9.5, bold: true, color: BRAND });
      sheet.gap(main, 10);
    }
    if (categorized.education) {
      heading('Education');
      entries(sectionEntries(categorized.education), { size: 9.5, color: MUTED });
      sheet.gap(main, 10);
    }
    if (categorized.projects) {
      heading('Projects');
      entries(sectionEntries(categorized.projects), { size: 9.5, color: MUTED });
      sheet.gap(main, 10);
    }
    if (categorized.references) {
      heading('References');
      simple(categorized.references);
      sheet.gap(main, 12);
    }
    if (categorized.additional) {
      heading('Additional information');
      paragraph(sectionText(categorized.additional));
      sheet.gap(main, 12);
    }
    for (const section of categorized.remaining) {
      if (!sectionLines(section).length) continue;
      heading(section.title || 'More');
      simple(section);
      sheet.gap(main, 12);
    }

    return sheet.doc;
  },
};
