const { Paragraph, TextRun, AlignmentType, TableOfContents } = require('docx');
const { h1, para, centered, pageBreak, spacer } = require('./util');

const BLANK = '_________________________';

function titlePage() {
  return [
    ...spacer(2),
    centered('A PROJECT REPORT', { bold: true, size: 32 }),
    centered('ON', { size: 26 }),
    ...spacer(1),
    centered('COMPLETE SCHOOL MANAGEMENT SYSTEM', { bold: true, size: 44, color: '0f2248' }),
    centered('(A MERN Stack Web Application)', { size: 26, color: '444444' }),
    ...spacer(2),
    centered('Submitted in partial fulfillment of the requirements', { size: 24 }),
    centered('for the award of the degree of', { size: 24 }),
    ...spacer(1),
    centered('BACHELOR OF TECHNOLOGY', { bold: true, size: 28 }),
    centered('IN', { size: 24 }),
    centered('COMPUTER SCIENCE AND ENGINEERING', { bold: true, size: 28 }),
    ...spacer(2),
    centered('Submitted By', { size: 24 }),
    centered(BLANK, { bold: true, size: 26 }),
    centered(`Roll No: ${BLANK}`, { size: 24 }),
    ...spacer(1),
    centered('Under the Guidance of', { size: 24 }),
    centered(BLANK, { bold: true, size: 26 }),
    ...spacer(2),
    centered('DEPARTMENT OF COMPUTER SCIENCE AND ENGINEERING', { bold: true, size: 24 }),
    centered(BLANK, { bold: true, size: 26 }),
    centered('(College Name)', { size: 22, color: '666666' }),
    centered(`Academic Year: ${BLANK}`, { size: 24 }),
    pageBreak(),
  ];
}

function certificate() {
  return [
    centered('CERTIFICATE', { bold: true, size: 32, caps: true }),
    ...spacer(2),
    para(`This is to certify that the project report entitled "COMPLETE SCHOOL MANAGEMENT SYSTEM" is a bonafide work carried out by ${BLANK} bearing Roll No. ${BLANK}, a student of ${BLANK} (College Name), in partial fulfillment of the requirements for the award of the degree of Bachelor of Technology in Computer Science and Engineering during the academic year ${BLANK}.`),
    para('The project has been carried out under my supervision and guidance, and the work embodied in this report has not been submitted to any other university or institution for the award of any degree or diploma.'),
    ...spacer(4),
    para(`Internal Guide: ${BLANK}                                        Head of Department: ${BLANK}`),
    ...spacer(2),
    para(`External Examiner: ${BLANK}                                   Date: ${BLANK}`),
    pageBreak(),
  ];
}

function declaration() {
  return [
    centered('DECLARATION', { bold: true, size: 32 }),
    ...spacer(2),
    para(`I, ${BLANK}, bearing Roll No. ${BLANK}, hereby declare that the project report entitled "COMPLETE SCHOOL MANAGEMENT SYSTEM" submitted to ${BLANK} (College Name) is a record of original work done by me under the guidance of ${BLANK}.`),
    para('The information and data presented in this report are authentic to the best of my knowledge. This project work has not been submitted, either in part or in full, to any other university or institution for the award of any degree or diploma.'),
    ...spacer(4),
    para(`Place: ${BLANK}`),
    para(`Date: ${BLANK}`),
    ...spacer(2),
    para(`Signature: ${BLANK}`),
    para(`Name: ${BLANK}`),
    pageBreak(),
  ];
}

function acknowledgement() {
  return [
    centered('ACKNOWLEDGEMENT', { bold: true, size: 32 }),
    ...spacer(2),
    para(`I would like to express my sincere gratitude to my project guide, ${BLANK}, for their valuable guidance, constant encouragement, and constructive suggestions throughout the development of this project. Their expertise and patience were instrumental in shaping this work.`),
    para(`I am deeply thankful to ${BLANK}, Head of the Department of Computer Science and Engineering, for providing the necessary facilities and a conducive environment for carrying out this project work.`),
    para(`I extend my thanks to the Principal and the management of ${BLANK} (College Name) for their support and for providing the infrastructure required for this project.`),
    para('I would also like to thank all the faculty members and laboratory staff of the department for their cooperation and assistance during the course of this project.'),
    para('Finally, I am grateful to my parents and friends for their unwavering support, motivation, and encouragement, without which this project would not have been possible.'),
    ...spacer(3),
    para(`${BLANK}`),
    para('(Student Name)'),
    pageBreak(),
  ];
}

function abstractPage() {
  return [
    centered('ABSTRACT', { bold: true, size: 32 }),
    ...spacer(1),
    para('Educational institutions handle an enormous volume of administrative and academic data every day — student admissions, class allocations, daily attendance, examinations, fee collection, library circulation, staff payroll, inventory, and communication with parents. When these processes are managed manually through paper registers or disconnected spreadsheets, they become slow, error-prone, and difficult to audit. Information remains siloed, reports take days to prepare, and parents have little visibility into their children\u2019s progress.'),
    para('The Complete School Management System presented in this report is a full-stack web application that digitizes and unifies the entire administrative workflow of a school on a single platform. The system is built on the MERN technology stack \u2014 MongoDB, Express.js, React, and Node.js \u2014 and features a novel swappable data layer that allows the institution to run either on a zero-configuration file-based JSON store or on a production-grade MongoDB Atlas cloud database without changing a single line of application code.'),
    para('The system implements role-based access control for six distinct user roles: Admin, Clerk, Supervisor, Teacher, Student, and Parent. Each role receives a purpose-built dashboard and a permission-scoped view of the data. Core modules include admissions with an approval workflow, student and class management, subject and teacher allocation with substitute handling, daily attendance with bulk marking, a complete examination lifecycle (marks entry, submission, locking, and publishing), fee collection with automatic due computation and printable receipts, daily accounts, assets and inventory tracking, a full library management system with fine calculation, staff payroll with printable salary slips, notices, timetable, lesson planning, discipline tracking, and a helpdesk.'),
    para('Security is enforced through JSON Web Token (JWT) based authentication, bcrypt password hashing, and route-level role authorization middleware. The user interface follows modern design practices with a component-driven architecture, a global Ctrl+K command palette for instant navigation, a dark mode powered by CSS custom properties, printable A4 documents (report cards, hall tickets, ID cards, salary slips, and fee receipts), and interactive dashboard analytics rendered with Chart.js.'),
    para('The report describes the complete software development life cycle of the project \u2014 requirement analysis, feasibility study, system design with data flow diagrams, entity-relationship model, class and sequence diagrams, implementation details of every module, and a structured testing phase. The outcome is a production-ready, extensible school management platform that reduces administrative effort, eliminates data duplication, and provides all stakeholders with real-time, role-appropriate access to institutional data.'),
    ...spacer(1),
    para('Keywords: School Management System, MERN Stack, MongoDB, Express.js, React, Node.js, JWT Authentication, Role-Based Access Control, Data Flow Diagram, Entity-Relationship Model.', { run: { italics: true } }),
    pageBreak(),
  ];
}

function tocPage() {
  return [
    centered('TABLE OF CONTENTS', { bold: true, size: 32 }),
    ...spacer(1),
    new TableOfContents('Table of Contents', {
      hyperlink: true,
      headingStyleRange: '1-3',
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: '(In Microsoft Word, right-click the table above and choose "Update Field" to refresh page numbers.)',
        italics: true, size: 18, color: '888888',
      })],
    }),
    pageBreak(),
  ];
}

module.exports = { titlePage, certificate, declaration, acknowledgement, abstractPage, tocPage };
