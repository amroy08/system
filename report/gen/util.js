const fs = require('fs');
const path = require('path');
const {
  Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ImageRun, PageBreak, BorderStyle, ShadingType, VerticalAlign,
} = require('docx');

const DIAGRAM_DIR = path.join(__dirname, '..', 'diagrams');

// Usable content area with 1in margins on A4: ~6.27in wide, ~9.7in tall
const MAX_W_IN = 6.2;
const MAX_H_IN = 8.3;
const DPI = 96;

function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function img(name, opts = {}) {
  const file = path.join(DIAGRAM_DIR, name);
  const { width, height } = pngSize(file);
  let w = width / DPI;
  let h = height / DPI;
  const maxW = opts.maxW || MAX_W_IN;
  const maxH = opts.maxH || MAX_H_IN;
  const scale = Math.min(maxW / w, maxH / h, 1);
  w *= scale; h *= scale;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
    children: [new ImageRun({
      type: 'png',
      data: fs.readFileSync(file),
      transformation: { width: Math.round(w * DPI), height: Math.round(h * DPI) },
    })],
  });
}

function caption(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({ text, italics: true, size: 20, color: '444444' })],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    spacing: { after: 240 },
    children: [new TextRun({ text })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 120 },
    children: [new TextRun({ text })],
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 160, line: 320 },
    ...opts.paragraph,
    children: [new TextRun({ text, size: 24, ...opts.run })],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 80, line: 300 },
    children: [new TextRun({ text, size: 24 })],
  });
}

function numbered(text, ref, level = 0) {
  return new Paragraph({
    numbering: { reference: ref, level },
    spacing: { after: 80, line: 300 },
    children: [new TextRun({ text, size: 24 })],
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function spacer(count = 1) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(new Paragraph({ children: [] }));
  return out;
}

const CELL_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '9aa5b1' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '9aa5b1' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '9aa5b1' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '9aa5b1' },
};

function cell(text, opts = {}) {
  return new TableCell({
    borders: CELL_BORDER,
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.head ? { type: ShadingType.CLEAR, fill: '0f2248' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    children: [new Paragraph({
      spacing: { after: 0 },
      children: [new TextRun({
        text: String(text),
        bold: !!opts.head,
        color: opts.head ? 'FFFFFF' : '000000',
        size: 20,
      })],
    })],
  });
}

// rows: array of arrays; first row treated as header. widths: percentage array.
function table(rows, widths) {
  const trs = rows.map((r, i) => new TableRow({
    tableHeader: i === 0,
    children: r.map((c, j) => cell(c, { head: i === 0, width: widths ? widths[j] : undefined })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: trs,
  });
}

function centered(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: opts.after ?? 160 },
    children: [new TextRun({ text, bold: !!opts.bold, size: opts.size || 24, allCaps: !!opts.caps, color: opts.color })],
  });
}

module.exports = { img, caption, h1, h2, h3, para, bullet, numbered, pageBreak, spacer, table, centered };
