/**
 * "Executive Cream" — centred spaced name on soft off-white, double rules,
 * date-column entries and a four-column skills grid. Rebuilt from the Canva
 * reference as vector data.
 */
import type { ResumeSection } from '../demo-resume-pdf';
import type { CanvasTextStyle, TemplateMeta } from './kit';
import { Sheet, categorize, contactLines, fitSpacing, sectionEntries, sectionText } from './kit';

const BG = '#F9F9F9';
const INK = '#26292E';
const BODY = '#3A3E45';
const MUTED = '#6B7078';
const RULE = '#8A8D93';
const DARK = '#2E3237';

export const executiveCream: TemplateMeta = {
  id: 'executive-cream',
  name: 'Executive Cream',
  tagline: 'Centred header, date columns, soft paper',
  accent: '#8A8D93',
  build(document) {
    const sheet = new Sheet(BG);
    const head = sheet.column(56, 483, 52, 198);
    const main = sheet.column(56, 483, 206, 792);
    const categorized = categorize(document);

    /* ------------------------------- heading ------------------------------ */
    const name = (document.name || 'Your name').toUpperCase();
    sheet.text(
      head,
      name,
      {
        size: 26,
        bold: true,
        color: INK,
        align: 'center',
        letterSpacing: fitSpacing(name, { size: 26, bold: true }, 483, 4),
      },
      3,
    );
    if (document.headline) {
      sheet.text(
        head,
        document.headline.toUpperCase(),
        { size: 13, color: MUTED, align: 'center', letterSpacing: 3 },
        9,
      );
    }
    if (document.contacts.length) {
      const contactStyle: CanvasTextStyle = { size: 10, color: INK, align: 'center' };
      const rows = contactLines(sheet, document.contacts, contactStyle, head.w);
      rows.forEach((row, index) => {
        sheet.text(head, row, contactStyle, index === rows.length - 1 ? 5 : 3);
      });
    } else {
      sheet.gap(head, 8);
    }
    sheet.rule(head, 1.2, DARK, 3.5);
    sheet.rule(head, 2.6, DARK, 0);

    /* ------------------------------ furniture ----------------------------- */
    const heading = (text: string) => {
      sheet.fit(main, 84);
      sheet.text(main, text.toUpperCase(), { size: 15, bold: true, letterSpacing: 0.4, color: INK }, 5);
      sheet.rule(main, 1, RULE, 10);
    };

    const paragraph = (text: string) => {
      for (const line of text.split('\n')) {
        if (line.trim()) sheet.text(main, line.trim(), { size: 10, color: BODY, lineHeight: 1.55 }, 2);
      }
    };

    /* Left = dates / place, right = role and the notes under it. */
    const dateEntries = (section: ResumeSection) => {
      const leftW = 150;
      const rightX = main.x + 170;
      const rightW = main.w - 170;
      const leftStyle: CanvasTextStyle = { size: 10, color: MUTED, lineHeight: 1.5 };
      const titleStyle: CanvasTextStyle = { size: 11, bold: true, color: INK };
      const bodyStyle: CanvasTextStyle = { size: 10, color: BODY, lineHeight: 1.5 };
      for (const item of sectionEntries(section)) {
        const lines = [...item.lines];
        const leftLines = item.date ? [item.date] : [];
        if (!item.date && lines.length > 1) leftLines.push(lines.shift() as string);
        const leftText = leftLines.join('\n');
        const leftH = leftText ? sheet.measure(leftText, leftStyle, leftW) : 0;
        let rightH = item.title ? sheet.measure(item.title, titleStyle, rightW) : 0;
        for (const line of lines) rightH += sheet.measure(line, bodyStyle, rightW) + 1.5;
        for (const bullet of item.bullets) rightH += sheet.measure(`•  ${bullet}`, bodyStyle, rightW) + 1.5;
        sheet.fit(main, Math.max(leftH, rightH, 1));
        const page = main.sheet;
        const y0 = main.y;
        if (leftText) sheet.textAt(main.x, y0, leftW, leftText, leftStyle, page);
        let y = y0;
        if (item.title) y += sheet.textAt(rightX, y, rightW, item.title, titleStyle, page) + 1.5;
        for (const line of lines) y += sheet.textAt(rightX, y, rightW, line, bodyStyle, page) + 1.5;
        for (const bullet of item.bullets) y += sheet.textAt(rightX, y, rightW, `•  ${bullet}`, bodyStyle, page) + 1.5;
        main.y += Math.max(leftH, rightH, 1) + 8;
      }
    };

    /* Four bullet columns, like the reference's skills block. */
    const skillGrid = (items: string[]) => {
      const cellW = main.w / 4;
      const style: CanvasTextStyle = { size: 10, color: BODY };
      for (let index = 0; index < items.length; index += 4) {
        const row = items.slice(index, index + 4);
        const heights = row.map((item) => sheet.measure(`•  ${item}`, style, cellW - 8));
        const rowH = Math.max(...heights, 1);
        sheet.fit(main, rowH);
        const page = main.sheet;
        const y0 = main.y;
        row.forEach((item, position) => {
          sheet.textAt(main.x + position * cellW, y0, cellW - 8, `•  ${item}`, style, page);
        });
        main.y = y0 + rowH + 3;
      }
    };

    /* Two reference cards per row: name, then role / phone / social lines. */
    const referenceCards = (section: ResumeSection) => {
      const cellW = 235;
      const nameStyle: CanvasTextStyle = { size: 10.5, bold: true, color: INK };
      const lineStyle: CanvasTextStyle = { size: 9.5, color: MUTED, lineHeight: 1.5 };
      const items = sectionEntries(section);
      for (let index = 0; index < items.length; index += 2) {
        const row = items.slice(index, index + 2);
        const heights = row.map((item) => {
          let height = item.title ? sheet.measure(item.title, nameStyle, cellW) : 0;
          for (const line of [...item.lines, ...item.bullets]) {
            height += sheet.measure(line, lineStyle, cellW) + 1;
          }
          return height;
        });
        const rowH = Math.max(...heights, 1);
        sheet.fit(main, rowH);
        const page = main.sheet;
        const y0 = main.y;
        row.forEach((item, position) => {
          const x = main.x + position * (cellW + 10);
          let y = y0;
          if (item.title) y += sheet.textAt(x, y, cellW, item.title, nameStyle, page) + 1;
          for (const line of [...item.lines, ...item.bullets]) {
            y += sheet.textAt(x, y, cellW, line, lineStyle, page) + 1;
          }
        });
        main.y = y0 + rowH + 8;
      }
    };

    /* -------------------------- document order ---------------------------- */
    if (categorized.summary) {
      heading('About me');
      paragraph(categorized.summary);
      sheet.gap(main, 15);
    }
    if (categorized.education) {
      heading('Education');
      dateEntries(categorized.education);
      sheet.gap(main, 10);
    }
    if (categorized.experience) {
      heading('Experience');
      dateEntries(categorized.experience);
      sheet.gap(main, 10);
    }
    if (categorized.skills.length) {
      heading('Skills');
      skillGrid(categorized.skills);
      sheet.gap(main, 16);
    }
    if (categorized.projects) {
      heading('Projects');
      dateEntries(categorized.projects);
      sheet.gap(main, 10);
    }
    if (categorized.awards || categorized.training) {
      heading('Certifications & training');
      const lines = [...(categorized.awards ? sectionEntries(categorized.awards) : []), ...(categorized.training ? sectionEntries(categorized.training) : [])];
      for (const item of lines) {
        if (item.title) sheet.text(main, item.title, { size: 10, color: BODY }, 1.5);
        for (const line of [...item.lines, ...item.bullets]) {
          sheet.text(main, line, { size: 10, color: BODY }, 1.5);
        }
      }
      sheet.gap(main, 15);
    }
    if (categorized.references) {
      heading('References');
      referenceCards(categorized.references);
      sheet.gap(main, 10);
    }
    if (categorized.additional) {
      heading('Additional information');
      paragraph(sectionText(categorized.additional));
      sheet.gap(main, 15);
    }
    for (const section of categorized.remaining) {
      heading(section.title || 'More');
      for (const item of sectionEntries(section)) {
        if (item.title) sheet.text(main, item.title, { size: 10, color: BODY }, 1.5);
        for (const line of [...item.lines, ...item.bullets]) {
          sheet.text(main, line, { size: 10, color: BODY }, 1.5);
        }
      }
      sheet.gap(main, 15);
    }

    return sheet.doc;
  },
};
