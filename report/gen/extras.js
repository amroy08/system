const { h1, h2, h3, para, bullet, table, centered, pageBreak, spacer } = require('./util');

function listOfFigures() {
  return [
    centered('LIST OF FIGURES', { bold: true, size: 32 }),
    ...spacer(1),
    table([
      ['Figure No.', 'Title', 'Chapter'],
      ['Figure 5.1', 'Three-tier system architecture of the School Management System', '5'],
      ['Figure 5.2', 'Use case diagram showing actors and their system interactions', '5'],
      ['Figure 5.3', 'DFD Level 0 — context diagram', '5'],
      ['Figure 5.4', 'DFD Level 1 — major processes and data stores', '5'],
      ['Figure 5.5', 'DFD Level 2 — decomposition of the fee and finance process', '5'],
      ['Figure 5.6', 'Entity-relationship diagram of the complete database', '5'],
      ['Figure 5.7', 'Class diagram of the domain model', '5'],
      ['Figure 5.8', 'Sequence diagram — login and authenticated request handling', '5'],
      ['Figure 5.9', 'Sequence diagram — fee due computation and receipt generation', '5'],
      ['Figure 5.10', 'Sequence diagram — marks entry, submission, and publishing', '5'],
      ['Figure 5.11', 'Sequence diagram — book issue, return, and fine posting', '5'],
      ['Figure 5.12', 'Activity diagram — admission and enrollment workflow', '5'],
      ['Figure 9.1', 'Administrator dashboard (dark mode) with KPIs, alerts, and charts', '9'],
      ['Figure 9.2', 'Students Management module with status tabs, filters, and data table', '9'],
    ], [16, 68, 16]),
    pageBreak(),
  ];
}

function listOfTables() {
  return [
    centered('LIST OF TABLES', { bold: true, size: 32 }),
    ...spacer(1),
    table([
      ['Table Context', 'Description', 'Chapter'],
      ['Limitations comparison', 'Limitations of manual, spreadsheet, and commercial ERP systems', '2'],
      ['User characteristics', 'Roles, assumed skill levels, and primary activities', '3'],
      ['Non-functional requirements', 'Security, usability, performance, portability, maintainability', '4'],
      ['Hardware requirements', 'Minimum and recommended hardware configurations', '4'],
      ['Software requirements', 'Operating system, runtime, database, and key libraries', '4'],
      ['Database design tables', 'Field-level design of all principal collections', '5'],
      ['Supporting libraries', 'Libraries and tools with their purpose in the project', '6'],
      ['Project structure', 'Repository layout of server and client applications', '7'],
      ['REST API summary', 'Endpoint groups, representative endpoints, and allowed roles', '7'],
      ['Test case table', 'Thirty-two documented test cases with results', '8'],
    ], [24, 60, 16]),
    pageBreak(),
  ];
}

function appendixA() {
  return [
    h1('APPENDIX A: INSTALLATION AND CONFIGURATION GUIDE'),
    h2('A.1 Prerequisites'),
    bullet('Node.js version 18 or later installed (verify with node --version).'),
    bullet('npm (bundled with Node.js; verify with npm --version).'),
    bullet('Git for cloning the repository.'),
    bullet('Optional: a MongoDB Atlas account (free tier) if cloud mode is desired; file mode needs no database.'),
    h2('A.2 Obtaining the Source Code'),
    para('Clone the repository and inspect its two applications:'),
    bullet('git clone https://github.com/sumitkumar1503/complete-school-management-system.git'),
    bullet('cd complete-school-management-system — the server/ folder holds the Express API and the client/ folder holds the React application.'),
    h2('A.3 Installing Dependencies'),
    bullet('Server: open a terminal in server/ and run npm install.'),
    bullet('Client: open a second terminal in client/ and run npm install.'),
    h2('A.4 Configuration'),
    para('Server configuration lives in server/.env. The important variables are:'),
    table([
      ['Variable', 'Example', 'Meaning'],
      ['PORT', '5050', 'Port on which the Express API listens'],
      ['DB_MODE', 'file', 'file = JSON store in server/data; mongo = MongoDB'],
      ['MONGO_URI', 'mongodb+srv://…', 'Connection string (only when DB_MODE=mongo)'],
      ['JWT_SECRET', 'any-long-random-string', 'Secret used to sign authentication tokens'],
    ], [20, 34, 46]),
    para('To switch the same installation to MongoDB Atlas: create a free cluster, obtain the connection string, set DB_MODE=mongo and MONGO_URI accordingly, then re-run the seed script. No application code changes are required.'),
    h2('A.5 Seeding Demonstration Data'),
    para('From the server/ folder run npm run seed. The script populates every collection — users for all six roles, classes, subjects, students with parents, attendance, exams with marks, fee structures and receipts, assets, inventory, library books with issues, salary slips, notices, and timetable entries — providing an immediately explorable system.'),
    h2('A.6 Running the Application'),
    bullet('Start the API: in server/ run npm run dev (default http://localhost:5050).'),
    bullet('Start the client: in client/ run npm run dev (Vite serves http://localhost:5173 and proxies /api to the server).'),
    bullet('Open the client URL in a browser; the public homepage appears with Login in the navigation bar.'),
    h2('A.7 Building for Production'),
    para('Run npm run build inside client/ to produce the optimized bundle in client/dist. The bundle can be served by any static web server, with the Express API running behind the same origin or a reverse proxy. In production, always set a strong JWT_SECRET and prefer DB_MODE=mongo with a managed MongoDB instance and regular backups.'),
  ];
}

function appendixB() {
  return [
    h1('APPENDIX B: USER MANUAL (QUICK REFERENCE)'),
    h2('B.1 Demonstration Login Accounts'),
    para('The seed script creates one account per role. All demonstration accounts use the password published in the repository README.'),
    table([
      ['Role', 'Purpose of the Account'],
      ['Admin', 'Full control: settings, publishing results, payroll, all modules'],
      ['Clerk', 'Admissions, fee collection, inventory, library circulation'],
      ['Supervisor', 'Admissions and general management oversight'],
      ['Teacher', 'Attendance marking, marks entry, lesson plans, logbook'],
      ['Student', 'Portal: attendance, results, hall tickets, library dues, helpdesk'],
      ['Parent', 'Portal: children\u2019s data, fee dues, results, notices'],
    ], [20, 80]),
    h2('B.2 Common Tasks'),
    h3('B.2.1 Admitting and Enrolling a Student'),
    bullet('Admissions → New Registration: fill applicant, class applied, and guardian details, then save.'),
    bullet('From the Registered tab choose Admit, then Enroll to Class: pick class and section, assign roll number and login password, set admission date and transport if needed.'),
    bullet('Confirm Admission — the student now appears across attendance, fees, exams, and the parent portal.'),
    h3('B.2.2 Marking Attendance'),
    bullet('Attendance → select class and date. Use the colour toggles per student, or the bulk buttons Mark All Present / Mark All Absent / Copy from Yesterday, then save.'),
    h3('B.2.3 Collecting a Fee Payment'),
    bullet('Fees → Collect: choose the student; the system displays computed dues per month.'),
    bullet('Select months, enter amount and payment mode, save — the numbered receipt opens for printing or emailing, and the income posts to Daily Accounts automatically.'),
    h3('B.2.4 Running an Examination Cycle'),
    bullet('Exams → create the exam for a class. Teachers open Marks Entry, save drafts, and submit their subject sheets.'),
    bullet('Admin reviews submitted sheets and clicks Publish — results, report cards, and hall tickets become available to students and parents.'),
    h3('B.2.5 Issuing and Returning Library Books'),
    bullet('Library → Books Catalog to manage titles (covers can be uploaded; images are resized automatically).'),
    bullet('Circulation → Issue: choose book and student; the due date is set automatically. On Return, any late fine is computed and posted to accounts.'),
    h3('B.2.6 Generating Payroll'),
    bullet('Finance → Payroll → Generate Slip: pick the staff member and month, adjust allowances/deductions, and save. Mark Paid posts the expense; the A4 slip is printable.'),
    h2('B.3 Productivity Features'),
    bullet('Press Ctrl+K anywhere to open the global command palette and jump to any student, receipt, book, or record.'),
    bullet('Use the Dark Mode toggle at the bottom of the sidebar; the preference is remembered.'),
    bullet('Data tables offer CSV, PDF, and Print exports plus instant search.'),
    bullet('Printable documents (ID cards, report cards, receipts, salary slips, hall tickets) open in a print-ready A4 layout.'),
  ];
}

module.exports = { listOfFigures, listOfTables, appendixA, appendixB };
