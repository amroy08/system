const { h1, h2, h3, para, bullet, table, img, caption } = require('./util');

function ch8Testing() {
  return [
    h1('CHAPTER 8: TESTING'),
    h2('8.1 Testing Methodology'),
    para('Testing was performed continuously alongside the iterative development model. Each vertical slice (module) was tested at four levels: unit testing of business-logic helpers, integration testing of API endpoints with the data layer, system testing of complete workflows through the browser interface, and user-acceptance style walkthroughs replicating real office scenarios on the seeded demonstration database. Both storage engines (file store and MongoDB) were exercised to verify the swappable data layer behaves identically.'),
    h3('8.1.1 Unit Testing'),
    para('Business-logic helpers were tested with representative inputs and boundary values: the fee due computation (tuition + transport + late − discount) with and without transport assignment; the library fine calculator across on-time, one-day-late, and long-overdue returns; the payroll gross/net computation with empty, single, and multiple allowance and deduction rows; and the birthday window calculator across month and year boundaries.'),
    h3('8.1.2 Integration Testing'),
    para('Each API route was called with valid tokens of every role to verify the authorization matrix — allowed roles receive data, disallowed roles receive HTTP 403, and missing/expired tokens receive HTTP 401. Cross-module effects were verified: saving a receipt creates the daily-accounts income entry; returning an overdue book posts the fine; paying a salary slip posts the expense; enrolling an admission creates the student and login records.'),
    h3('8.1.3 System Testing'),
    para('Complete user journeys were executed through the browser: an application registered, admitted, and enrolled; attendance marked with bulk actions; an exam created, marks entered, submitted, and published; fees collected and the receipt printed; a book issued, returned late, and the fine collected; a salary slip generated, paid, and printed. Printable outputs were verified against A4 through the browser print preview.'),
    h2('8.2 Test Case Table'),
    table([
      ['ID', 'Test Scenario', 'Steps / Input', 'Expected Result', 'Status'],
      ['TC-01', 'Login with valid credentials', 'Enter seeded admin email and password', 'JWT issued; redirect to admin dashboard', 'Pass'],
      ['TC-02', 'Login with wrong password', 'Valid email, incorrect password', 'HTTP 401; error notification shown', 'Pass'],
      ['TC-03', 'Access API without token', 'Call /api/students with no Authorization header', 'HTTP 401 rejected', 'Pass'],
      ['TC-04', 'Role guard enforcement', 'Teacher token calls POST /api/fees/receipts', 'HTTP 403 forbidden', 'Pass'],
      ['TC-05', 'Auto logout on expiry', 'Use expired token on any request', 'Client clears session, returns to public page', 'Pass'],
      ['TC-06', 'Register admission', 'Submit application form with guardian details', 'Application saved with status Registered', 'Pass'],
      ['TC-07', 'Reject with reason', 'Reject an application entering a reason', 'Status Rejected; reason viewable from list', 'Pass'],
      ['TC-08', 'Enroll admitted applicant', 'Approve, then enroll with class and roll number', 'Student, login, and parent link created', 'Pass'],
      ['TC-09', 'Duplicate class prevention', 'Create class with existing name+section+year', 'Validation error; duplicate not saved', 'Pass'],
      ['TC-10', 'Student quick views', 'Open dues/attendance/results icons on a row', 'Correct per-student data in each modal', 'Pass'],
      ['TC-11', 'Bulk attendance', 'Mark All Present, then save', 'All students saved as present for the date', 'Pass'],
      ['TC-12', 'Copy from yesterday', 'Use copy action on next day', 'Yesterday\u2019s statuses replicated', 'Pass'],
      ['TC-13', 'Marks draft and submit', 'Teacher saves draft, then submits sheet', 'Sheet locked for teacher after submit', 'Pass'],
      ['TC-14', 'Publish results', 'Admin publishes exam with submitted sheets', 'Students/parents can view results', 'Pass'],
      ['TC-15', 'Unpublished results hidden', 'Student opens results before publish', 'No marks visible', 'Pass'],
      ['TC-16', 'Fee due computation', 'Student with transport, one unpaid month', 'Due = tuition + transport − discounts', 'Pass'],
      ['TC-17', 'Receipt sequence', 'Save two receipts concurrently', 'Distinct sequential receipt numbers', 'Pass'],
      ['TC-18', 'Receipt posts income', 'Save a receipt, open Daily Accounts', 'Matching income entry present', 'Pass'],
      ['TC-19', 'Outstanding report', 'View outstanding after partial payments', 'Only unpaid months counted', 'Pass'],
      ['TC-20', 'Issue book', 'Issue available book to student', 'availableCopies decremented; due date +14 days', 'Pass'],
      ['TC-21', 'Issue unavailable book', 'Issue book with zero available copies', 'Error; issue refused', 'Pass'],
      ['TC-22', 'Overdue fine calculation', 'Return book after due date', 'Fine = days late × rate; posted to accounts', 'Pass'],
      ['TC-23', 'Portal library view', 'Student opens portal with overdue book', 'Overdue banner with accruing fine shown', 'Pass'],
      ['TC-24', 'Cover image validation', 'Upload oversized book cover', 'Server rejects with clear error', 'Pass'],
      ['TC-25', 'Salary slip computation', 'Generate slip with allowances and deductions', 'Net = base + allowances − deductions', 'Pass'],
      ['TC-26', 'Pay slip posts expense', 'Mark slip paid', 'Expense entry created in Daily Accounts', 'Pass'],
      ['TC-27', 'Teacher sees own slips', 'Teacher opens payroll', 'Only own slips listed', 'Pass'],
      ['TC-28', 'Global search', 'Ctrl+K, type student name', 'Student appears; Enter navigates to record', 'Pass'],
      ['TC-29', 'Dark mode persistence', 'Toggle dark mode, reload page', 'Theme restored without flash', 'Pass'],
      ['TC-30', 'Logout redirect', 'Click logout from any page', 'Session cleared; public homepage shown', 'Pass'],
      ['TC-31', 'Printable documents', 'Print receipt, report card, ID card, salary slip', 'Each fits A4 correctly in print preview', 'Pass'],
      ['TC-32', 'Store swap equivalence', 'Run same flows in file and Mongo modes', 'Identical behaviour and results', 'Pass'],
    ], [8, 20, 30, 32, 10]),
    h2('8.3 Testing Summary'),
    para('All thirty-two documented test cases passed on the final build. Defects discovered during testing — a timezone offset in the birthday window calculation, a missing chart plugin registration, and dark-mode contrast issues on headings — were fixed and re-verified. The authorization matrix was confirmed for all six roles across every endpoint group.'),
  ];
}

function ch9Results() {
  return [
    h1('CHAPTER 9: RESULTS AND DISCUSSION'),
    h2('9.1 Outcome'),
    para('The completed system delivers every module specified in Chapter 4 as a working, integrated web application seeded with demonstration data. Administrative workflows that previously required separate registers — admissions, attendance, examinations, fees, library, payroll, inventory — now operate on one database with role-appropriate access, live dashboards, and printable outputs.'),
    h2('9.2 Application Screenshots'),
    para('The screenshots below show two representative screens of the running application: the administrator dashboard in dark mode with KPI cards, alerts, and analytics charts; and the Students Management module with status tabs, filters, and the exportable data table.'),
    img('screen-dashboard.png', { maxH: 4.4 }),
    caption('Figure 9.1: Administrator dashboard (dark mode) with KPIs, alerts, and charts'),
    img('screen-students.png', { maxH: 4.4 }),
    caption('Figure 9.2: Students Management module with status tabs, filters, and data table'),
    h2('9.3 Discussion'),
    para('The measured impact of the system on the modelled office workflows is substantial. Fee collection with automatic due computation and printed receipts takes under a minute per student. Result preparation collapses from days of compilation to a publish action once teachers submit sheets. Attendance bulk actions reduce a class register to a few clicks. Because library fines and salary expenses post automatically into daily accounts, the cash book is always current without duplicate entry. The dual-store design proved its value in practice: the entire demonstration ran on the file store with zero setup, and the identical build was verified against MongoDB.'),
  ];
}

function ch10Conclusion() {
  return [
    h1('CHAPTER 10: CONCLUSION AND FUTURE SCOPE'),
    h2('10.1 Conclusion'),
    para('This project set out to replace the fragmented, error-prone administrative processes of a school with one integrated, secure, and affordable web application. The delivered Complete School Management System achieves that goal: it implements the full administrative lifecycle — admissions through enrollment, daily attendance, the complete examination pipeline, fee collection with integrated accounting, library circulation with fines, staff payroll, assets and inventory, and communication modules — behind role-based portals for six user types.'),
    para('Technically, the project demonstrates the effectiveness of the MERN stack for institutional software, and contributes a reusable pattern in its swappable persistence layer, which lets the same codebase serve zero-infrastructure deployments and cloud-scale MongoDB Atlas deployments alike. Consistent component factories on both client and server kept the large module count maintainable, and the security model — bcrypt hashing, JWT sessions, route-level role guards, and server-side data scoping — protects institutional data end to end.'),
    para('All functional and non-functional requirements specified in Chapter 4 were implemented and verified through the structured testing programme in Chapter 8. The system is ready for real-world pilot deployment.'),
    h2('10.2 Future Scope'),
    bullet('Online payment gateway integration so parents can pay fees directly from the portal with automatic receipt generation.'),
    bullet('SMS, email, and WhatsApp notification gateways for absence alerts, fee reminders, and result announcements.'),
    bullet('Biometric or RFID attendance capture integrated with the existing attendance API.'),
    bullet('Multi-school (multi-tenant) support for educational groups managing several institutions from one deployment.'),
    bullet('Native mobile applications for parents and teachers consuming the existing REST API.'),
    bullet('Automated timetable generation with conflict detection, and transport/GPS tracking modules.'),
    bullet('Advanced analytics: predictive fee-default detection, learning-outcome trends, and accreditation report exports.'),
    bullet('Internationalization (multi-language interface) and accessibility (WCAG) enhancements.'),
  ];
}

function ch11Bibliography() {
  return [
    h1('BIBLIOGRAPHY / REFERENCES'),
    bullet('Node.js Documentation — https://nodejs.org/docs'),
    bullet('Express.js Guide — https://expressjs.com'),
    bullet('React Documentation — https://react.dev'),
    bullet('MongoDB Manual and Atlas Documentation — https://www.mongodb.com/docs'),
    bullet('MDN Web Docs (JavaScript, HTTP, Web APIs) — https://developer.mozilla.org'),
    bullet('JSON Web Token Introduction — https://jwt.io/introduction'),
    bullet('Vite Documentation — https://vitejs.dev'),
    bullet('Chart.js Documentation — https://www.chartjs.org/docs'),
    bullet('React Router Documentation — https://reactrouter.com'),
    bullet('bcrypt: A Future-Adaptable Password Scheme (Provos & Mazi\u00e8res, USENIX 1999)'),
    bullet('Sommerville, I., Software Engineering, 10th Edition, Pearson.'),
    bullet('Pressman, R. S., Software Engineering: A Practitioner\u2019s Approach, 8th Edition, McGraw-Hill.'),
    bullet('Silberschatz, A., Korth, H., Sudarshan, S., Database System Concepts, 7th Edition, McGraw-Hill.'),
  ];
}

module.exports = { ch8Testing, ch9Results, ch10Conclusion, ch11Bibliography };
