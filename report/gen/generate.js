const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, Footer, Header,
  PageNumber, LevelFormat, convertInchesToTwip,
} = require('docx');

const { titlePage, certificate, declaration, acknowledgement, abstractPage, tocPage } = require('./front');
const { ch1Introduction, ch2Literature, ch3Analysis, ch4SRS } = require('./ch1to4');
const { ch5Design } = require('./ch5design');
const { ch6Technology, ch7Implementation } = require('./ch6to7');
const { ch8Testing, ch9Results, ch10Conclusion, ch11Bibliography } = require('./ch8to11');
const { listOfFigures, listOfTables, appendixA, appendixB } = require('./extras');

const children = [
  ...titlePage(),
  ...certificate(),
  ...declaration(),
  ...acknowledgement(),
  ...abstractPage(),
  ...tocPage(),
  ...listOfFigures(),
  ...listOfTables(),
  ...ch1Introduction(),
  ...ch2Literature(),
  ...ch3Analysis(),
  ...ch4SRS(),
  ...ch5Design(),
  ...ch6Technology(),
  ...ch7Implementation(),
  ...ch8Testing(),
  ...ch9Results(),
  ...ch10Conclusion(),
  ...appendixA(),
  ...appendixB(),
  ...ch11Bibliography(),
];

const doc = new Document({
  creator: 'Student',
  title: 'Complete School Management System - Project Report',
  description: 'B.Tech project report on the Complete School Management System (MERN Stack)',
  features: { updateFields: true },
  styles: {
    default: {
      document: { run: { font: 'Times New Roman', size: 24 } },
      heading1: { run: { font: 'Times New Roman', size: 32, bold: true, color: '0f2248' }, paragraph: { spacing: { after: 240 } } },
      heading2: { run: { font: 'Times New Roman', size: 28, bold: true, color: '16325c' }, paragraph: { spacing: { before: 280, after: 160 } } },
      heading3: { run: { font: 'Times New Roman', size: 25, bold: true, color: '2a4a7f' }, paragraph: { spacing: { before: 220, after: 120 } } },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: convertInchesToTwip(8.27), height: convertInchesToTwip(11.69) }, // A4
        margin: {
          top: convertInchesToTwip(1),
          bottom: convertInchesToTwip(1),
          left: convertInchesToTwip(1.15),
          right: convertInchesToTwip(1),
        },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: 'Complete School Management System', italics: true, size: 18, color: '888888' })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Page ', size: 20 }),
            new TextRun({ children: [PageNumber.CURRENT], size: 20 }),
          ],
        })],
      }),
    },
    children,
  }],
});

const outPath = path.join(__dirname, '..', 'School-Management-System-Project-Report.docx');
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outPath, buffer);
  console.log('Report written:', outPath, `(${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
}).catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
