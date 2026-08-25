# M.V HIGH SCHOOL ERP — Sidebar Feature & Role Guide

This guide explains what every sidebar feature does and which login roles can access it. It is based on the current sidebar permissions in `client/src/components/Layout.jsx`.

## Role access summary

| Login role | Main purpose | Sidebar access style |
| --- | --- | --- |
| Admin | Full school control, configuration, finance, academics, users, backups, and promotions. | Full access, including admin-only modules like Promotions, System Backup, and Settings. |
| Clerk | Daily office operations: admissions, records, fees, documents, exams support, and parent/student service. | Broad operational access, but no Promotions, Backups, Settings, Lesson Planning, or Teaching Logbook. |
| Supervisor | Academic and operations supervision across records, teachers, classes, lesson work, exams, fees, and reports. | Broad access like Clerk, plus Lesson Planning and Teaching Logbook; no Promotions, Backups, or Settings. |
| Teacher | Class-facing work: attendance, marks, lesson plans, homework, notices, discipline, activities, and support. | Teaching and academic workflow access; no finance except Payroll view, no full records administration. |
| Parent | Parent portal for linked children. | Sees only linked-child information such as notices, homework, timetable, PTM, hall tickets, documents, helpdesk, complaints, and account. |
| Student | Student portal for own school information. | Sees own dashboard, library, timetable, notices, homework, calendar, hall tickets, documents, support, and account. |

## Admin login

Admin is the master role. Admin can manage the school setup, users, academic year operations, fee rules, student rollover, backups, and system settings.

| Section | Feature | What admin can do |
| --- | --- | --- |
| Overview | Dashboard | View school-wide stats: active students, parents, teachers, classes, subjects, attendance, fees, incidents, pending admissions, and charts. |
| Overview | Reports | Open report cards/ledgers for students, fees, dues, attendance, classes, discipline, daily accounts, and parents. |
| Records | Admissions | Add new student enquiries/admissions, track pending admissions, approve/enroll students, and generate student/parent records. |
| Records | Students | Add, edit, view, document-manage, and delete student records; manage class, fee admission type, contact, medical, transport, and documents. |
| Records | Classes & Sections | Create and manage classes, sections, room/location, capacity, class strength, and class teacher setup. |
| Records | Parents | Add/edit parents, link multiple children, check email availability, filter by grade/relationship/child links/status, and manage parent contact records. |
| Records | Assets | Track school assets such as computers, furniture, projectors, equipment, and assigned locations/status. |
| Records | Stock / Inventory | Manage consumable stock, issue/receive inventory, quantities, categories, and low-stock records. |
| Records | Subjects | Add/edit subjects, subject codes, marks rules, and class assignments. |
| Records | Teachers | Manage teacher records, subject/class relation, contact information, and teacher status. |
| Records | Substitutes | Manage substitute teacher arrangements and replacement planning. |
| Library | Books Catalog | Add/manage books, categories, authors, stock, and availability. |
| Library | Issue / Return | Issue books, mark returns, track due dates, and manage circulation records. |
| Daily | Timetable | Create/edit weekly class timetables and make them visible to teachers, students, and parents. |
| Daily | Attendance | Mark attendance, copy previous day, mark all present/absent, and review class attendance. |
| Daily | School Notices | Publish notices, attach PDF/images, target all or selected grades, and send email notifications to eligible parents. |
| Daily | Homework / Classwork | Create class homework/classwork, attach material, set due dates, and publish to students/parents. |
| Daily | PTM | Schedule/reschedule/cancel parent-teacher meetings, target grades, and notify linked parents. |
| Daily | Calendar | Add school events, holidays, exams, meetings, and general calendar entries. |
| Daily | Lesson Planning | Create/review lesson plans with class, subject, topic, objectives, activities, homework, and attachments. |
| Daily | Teaching Logbook | Review daily teaching logs entered by teachers for topic covered, homework, remarks, and class progress. |
| Academic | Exams | Create exams, select exam type, target grades, publish schedules, send exam emails, and manage exam status. |
| Academic | Results / Marks | View marks entry, review teacher submissions, lock/publish results, and control result visibility. |
| Academic | Hall Tickets | Generate/view hall tickets for exams and make them available to students/parents. |
| Academic | Discipline | Record incidents, severity, action taken, parent notified status, and open/closed cases. |
| Academic | Conduct | Add merit/demerit points and conduct notes for students. |
| Academic | Activities | Create activities, target grades, assign in-charge, set status, and notify parents. |
| Academic | Promotions | Promote/retain students, roll over academic year, move Grade 10 to Old Students, carry balances, and apply correct fee rate. |
| Finance | Fees Collection | Select class/student, view fee summary, collect payment, apply discount/late fee, generate receipt, and trigger receipt email. |
| Finance | Outstanding Dues | View unpaid students, filter by grade/amount, select defaulters, and send WhatsApp reminders to registered guardian numbers. |
| Finance | Payroll / Salary | Generate salary slips, manage salary components, deductions, payments, and salary records. |
| Finance | Daily Accounts | Add income/expense entries, payment mode, category, amount, recorded-by, and description. |
| Finance | Fee Structure | Add/edit official fee components, frequency, amount, assigned grades, admission type, and active/archive status. |
| Support | Helpdesk | View, assign, update, and close support tickets raised by staff, students, or parents. |
| Support | Complaints | View and manage complaints, severity, resolution, and status. |
| Support | Documents | Upload documents/circulars with links or PDF/image attachments, target grades/users, and send notifications. |
| Administration | Users / Staff | Create/edit users, update roles, reset passwords, activate/deactivate accounts, and delete users. |
| Administration | System Backup | Create/check backups, verify backup health, and manage restore/backup readiness. |
| Profile | My Account | Update own profile and change password. |
| Profile | Settings | Manage school/system settings such as school name, branding, app URLs, security-related settings, and configuration. |
| Footer | Academic Year | Shows the active academic year, currently 2026–27. |
| Footer | Sign Out | Ends the current login session and returns to login. |

## Clerk login

Clerk is for office and front-desk operations. Clerk can manage records and daily finance work but should not control critical admin-only settings.

| Section | Clerk features |
| --- | --- |
| Overview | Dashboard, Reports |
| Records | Admissions, Students, Classes & Sections, Parents, Assets, Stock / Inventory, Subjects, Teachers, Substitutes |
| Library | Books Catalog, Issue / Return |
| Daily | Timetable, Attendance, School Notices, Homework / Classwork, PTM, Calendar |
| Academic | Exams, Results / Marks, Hall Tickets, Discipline, Conduct, Activities |
| Finance | Fees Collection, Outstanding Dues, Payroll / Salary, Daily Accounts, Fee Structure |
| Support | Helpdesk, Complaints, Documents |
| Administration | Users / Staff |
| Profile | My Account |
| Footer | Academic Year, Sign Out |

Common clerk examples:

- Add a new admission and update parent contact details.
- Collect a fee payment and print/export a receipt.
- Check outstanding dues and send WhatsApp reminders.
- Upload a notice/document for selected grades.
- Help maintain student, parent, class, subject, inventory, and asset records.

Clerk does not see Promotions, System Backup, or Settings.

## Supervisor login

Supervisor is for academic/operational oversight. Supervisor can inspect and manage most academic records, teacher workflows, and reports.

| Section | Supervisor features |
| --- | --- |
| Overview | Dashboard, Reports |
| Records | Admissions, Students, Classes & Sections, Parents, Assets, Stock / Inventory, Subjects, Teachers, Substitutes |
| Library | Books Catalog, Issue / Return |
| Daily | Timetable, Attendance, School Notices, Homework / Classwork, PTM, Calendar, Lesson Planning, Teaching Logbook |
| Academic | Exams, Results / Marks, Hall Tickets, Discipline, Conduct, Activities |
| Finance | Fees Collection, Outstanding Dues, Payroll / Salary, Daily Accounts, Fee Structure |
| Support | Helpdesk, Complaints, Documents |
| Administration | Users / Staff |
| Profile | My Account |
| Footer | Academic Year, Sign Out |

Common supervisor examples:

- Review attendance, marks, lesson plans, and teaching logbook records.
- Monitor reports for class strength, fees, dues, and discipline.
- Manage teacher/class academic records.
- Review notices, PTM, activities, and homework communication.

Supervisor does not see Promotions, System Backup, or Settings.

## Teacher login

Teacher is focused on teaching work and student-facing academic operations. Teacher does not manage master setup, full finance, backups, or settings.

| Section | Teacher features |
| --- | --- |
| Overview | Dashboard |
| Records | Students |
| Library | Books Catalog, Issue / Return |
| Daily | Timetable, Attendance, School Notices, Homework / Classwork, PTM, Calendar, Lesson Planning, Teaching Logbook |
| Academic | Exams, Results / Marks, Discipline, Conduct, Activities |
| Finance | Payroll / Salary |
| Support | Helpdesk, Complaints, Documents |
| Profile | My Account |
| Footer | Academic Year, Sign Out |

Common teacher examples:

- View assigned students and class details.
- Mark attendance for class.
- Add homework/classwork and attach PDF/image material.
- Create lesson plans and teaching logbook entries.
- Enter marks, submit marks for admin review, and view exam schedules.
- Record discipline/conduct/activity information.
- View own payroll/salary information where permitted.

Teacher does not see Admissions, Parents management, Fee Collection, Outstanding Dues, Fee Structure, Users, Backups, Settings, or Promotions.

## Parent login

Parent login is linked-child based. If a parent has two or three children linked, the parent portal should show information for those linked children only.

| Section | Parent features |
| --- | --- |
| Overview | My Dashboard |
| Library | Books Catalog |
| Daily | Timetable, School Notices, Homework / Classwork, PTM, Calendar |
| Academic | Hall Tickets |
| Support | Helpdesk, Complaints, Documents |
| Profile | My Account |
| Footer | Academic Year, Sign Out |

Common parent examples:

- View linked child/children dashboard.
- Check fee balance, notices, homework, documents, PTM details, timetable, and hall tickets where published.
- Raise helpdesk tickets or complaints.
- Update own profile/contact details and change password.

Parent does not see full school records, other students, fee collection back office, marks entry, admissions, users, or settings.

## Student login

Student login is own-record based. A student sees only their own school information.

| Section | Student features |
| --- | --- |
| Overview | My Dashboard |
| Library | Books Catalog |
| Daily | Timetable, School Notices, Homework / Classwork, Calendar |
| Academic | Hall Tickets |
| Support | Helpdesk, Complaints, Documents |
| Profile | My Account |
| Footer | Academic Year, Sign Out |

Common student examples:

- View own dashboard, timetable, homework/classwork, notices, calendar, documents, and hall tickets.
- Browse library books.
- Raise helpdesk tickets or complaints.
- Update own account details and password.

Student does not see PTM, fee office modules, admissions, full student records, reports, users, backups, settings, or promotions.

## Feature catalog with examples

| Feature | Visible to | What it does | Example |
| --- | --- | --- | --- |
| Dashboard | Admin, Clerk, Supervisor, Teacher | Staff overview of school operations and statistics. | Admin checks today’s attendance, fee collection, active exams, and pending approvals. |
| My Dashboard | Parent, Student | Personal portal dashboard. | Parent checks linked children; student checks own notices/homework. |
| Reports | Admin, Clerk, Supervisor | Reporting center for school ledgers and exports. | Export fee collection or parent directory report. |
| Admissions | Admin, Clerk, Supervisor | Handles new admission workflow. | Add a new Grade 3 applicant and select fee admission type. |
| Students | Admin, Clerk, Supervisor, Teacher | Student master list and details. | Staff edits student profile/documents; teacher views student information. |
| Classes & Sections | Admin, Clerk, Supervisor | Class setup and class strength tracking. | Create Grade 5 A with capacity 70. |
| Parents | Admin, Clerk, Supervisor | Parent master list and child linking. | Link one parent to two siblings and update email/mobile. |
| Assets | Admin, Clerk, Supervisor | Fixed asset records. | Track a projector assigned to Room 501. |
| Stock / Inventory | Admin, Clerk, Supervisor | Stock item movement and quantity tracking. | Add notebooks received or issue stationery. |
| Subjects | Admin, Clerk, Supervisor | Subject master and class assignment. | Add Computer subject for Grade 1 A. |
| Teachers | Admin, Clerk, Supervisor | Teacher master data. | Add teacher profile and subject specialization. |
| Substitutes | Admin, Clerk, Supervisor | Substitute teacher planning. | Assign substitute for absent teacher. |
| Books Catalog | All roles | Library book browsing/management depending on role. | Student browses books; staff manages catalog. |
| Issue / Return | Admin, Clerk, Supervisor, Teacher | Book circulation workflow. | Issue a book to a student and mark return. |
| Timetable | All roles | Weekly class timetable. | Staff edits timetable; parent/student view class timetable. |
| Attendance | Admin, Clerk, Supervisor, Teacher | Daily attendance marking and review. | Teacher marks Grade 2 A present/absent. |
| School Notices | All roles | Notices with optional grade targeting, attachment, and email. | Staff posts a Grade 1 notice with PDF attachment. |
| Homework / Classwork | All roles | Homework/classwork records with due dates and attachments. | Teacher uploads JPG/PDF worksheet for Grade 3. |
| PTM | Admin, Clerk, Supervisor, Teacher, Parent | Parent-teacher meeting scheduling and visibility. | Staff schedules PTM for Grade 5 and parents see it. |
| Calendar | All roles | School calendar events and holidays. | Add Independence Day holiday or exam date. |
| Lesson Planning | Admin, Supervisor, Teacher | Lesson plan creation/review with material attachment. | Teacher uploads lesson PDF and marks plan completed. |
| Teaching Logbook | Admin, Supervisor, Teacher | Daily teaching progress record. | Teacher logs topic covered and homework given. |
| Exams | Admin, Clerk, Supervisor, Teacher | Exam creation, type, schedule, status, and grade targeting. | Create First Semester exam for Grade 6. |
| Results / Marks | Admin, Clerk, Supervisor, Teacher | Marks entry/review/publishing flow. | Teacher submits marks; admin publishes result. |
| Hall Tickets | Admin, Clerk, Supervisor, Parent, Student | Exam hall ticket generation/viewing. | Parent downloads linked child’s hall ticket. |
| Discipline | Admin, Clerk, Supervisor, Teacher | Incident register and parent notification tracking. | Teacher records high-severity incident. |
| Conduct | Admin, Clerk, Supervisor, Teacher | Merit/demerit conduct register. | Add +5 merit points for good behavior. |
| Activities | Admin, Clerk, Supervisor, Teacher | Sports/cultural/academic activity planning and notifications. | Create Sports Day for selected grades. |
| Promotions | Admin | Academic year rollover and class promotion/retention. | Move Grade 10 students to Old Students with balance only. |
| Fees Collection | Admin, Clerk, Supervisor | Student fee payment collection and receipts. | Collect ₹5,000 from a parent and email receipt. |
| Outstanding Dues | Admin, Clerk, Supervisor | Defaulter tracking and reminder workflow. | Filter Grade 4 unpaid students over ₹5,000 and send WhatsApp reminder. |
| Payroll / Salary | Admin, Clerk, Supervisor, Teacher | Salary slip/payroll module; teacher can view relevant payroll information. | Generate staff salary slip for August. |
| Daily Accounts | Admin, Clerk, Supervisor | Daily income/expense ledger. | Record repair expense paid by cash. |
| Fee Structure | Admin, Clerk, Supervisor | Official fee components and assigned grade rules. Admin edits; Clerk/Supervisor view/use. | Change monthly tuition fee for future admissions/promotions. |
| Helpdesk | All roles | Support ticket system. | Parent raises portal issue; admin assigns it. |
| Complaints | All roles | Complaint filing and resolution tracking. | Student/parent files complaint; staff resolves it. |
| Documents | All roles | Circular/document repository with attachments and targeting. | Upload circular PDF for all parents. |
| Users / Staff | Admin, Clerk, Supervisor | User account list and staff/user management. | Admin edits user password or role. |
| System Backup | Admin | Backup management and health checking. | Admin creates/verifies a backup before deployment. |
| My Account | All roles | Personal profile and password page. | Parent updates mobile number; user changes password. |
| Settings | Admin | System/school configuration. | Admin updates school name to M.V HIGH SCHOOL. |
| Academic Year | All roles | Displays active academic year. | Shows Academic Year 2026–27. |
| Sign Out | All roles | Logs out the current user. | User ends session safely. |

## Important access notes

- Parent and student portal data must stay scoped: parents see only linked children, and students see only their own record.
- Fee Structure is the source for future fee calculation. Editing it should affect new admissions and future promotions, not rewrite old paid history unless a specific migration/recalculation is intentionally run.
- Promotions are admin-only because they can affect class placement and carried fee balances.
- System Backup and Settings are admin-only because mistakes there can affect the whole system.
- Clerk and Supervisor can operate many modules, but critical destructive actions should remain audited and limited.
