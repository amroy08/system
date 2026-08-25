# Complete School Management System (MERN)

A full school management system with role-based access for **Admin, Clerk, Supervisor, Teacher, Student and Parent** — built with **MongoDB-compatible storage, Express, React and Node.js**.

By default it runs on a **file-based JSON database (zero setup)** and can be switched to **MongoDB Atlas (cloud.mongodb.com)** by changing one environment variable.

## Modules

- **Public website** — Home, About Us and Contact pages with a shared navbar; login is part of the public nav and logout returns to the homepage
- **Role-specific dashboards** — Admin gets the full command center, Clerk gets a front-office view (admissions + fees + receipts), Supervisor gets an operations view (attendance + discipline), Teacher gets "my day" (today's periods, assignments, quick actions); all with a live-clock greeting bar
- **Dashboard extras** — KPI cards with quick actions, attendance / fee-collection / gender-mix / discipline charts, upcoming-birthdays widget, publish-approval alert
- **Admissions** — registration → enroll to class (auto-creates student, parent & logins) → confirm / reject with reason
- **Students** — full profiles (transport, medical notes, citizenship, languages), quick views for fees, attendance, results, linked parents
- **Classes & Sections** — capacity, room, class teacher; Class + Section + Year uniqueness enforced
- **Parents** — auto-created on admission, link multiple children to one parent
- **Assets & Inventory** — auto asset tags, maintenance history with expenses; stock in / issue / adjust with reorder alerts
- **Subjects / Teachers / Substitutes** — subject-class mapping, teacher assignments, substitute allocation from timetable periods
- **Attendance** — Present / Absent / Late / Half-day / Leave, Mark-All buttons, Copy from Yesterday
- **Exams & Results** — marks entry with auto-grading; teachers can Draft / Submit / Lock, only **Admin can Publish**; toppers, grade distribution, printable mark sheets, hall tickets
- **Fees & Finance** — tuition + transport + late fee − discount computation, 5 payment modes, printable A4 receipts, daily accounts, fee structures
- **Communication** — notices with audiences, timetable, calendar, PTM, lesson planning, teaching logbook
- **Discipline / Conduct / Activities / Helpdesk / Complaints / Documents**
- **Users / Staff** — reset passwords, suspend/activate, role management
- **Library** — books catalog with colorful shelf view, issue/return circulation desk, due dates, automatic late fines (posted to Daily Accounts), overdue tracking
- **Payroll** — generate monthly salary slips with allowances & deductions, mark paid (auto expense entry), printable A4 salary slips
- **Global search (Ctrl+K)** — command palette that searches students, teachers, parents, receipts, books, assets, exams and salary slips with keyboard navigation
- **Printables** — fee receipts, salary slips, report cards, hall tickets, mark sheets and **student ID cards** (with barcode + house colors)
- **Dark mode** — proper variable-based dark theme, persisted across sessions
- **Settings** — school branding + **live theme color customizer**
- **Student & Parent portals** — attendance, published results, fee balances, notices; parents can switch between linked children

## Prerequisites

Before running the project, make sure you have:

| Requirement | Version | Check with | Download |
|---|---|---|---|
| **Node.js** | 18 or later | `node --version` | https://nodejs.org |
| **npm** | 9+ (comes with Node) | `npm --version` | bundled with Node.js |
| **Git** | any recent | `git --version` | https://git-scm.com |
| **MongoDB Atlas account** | optional | — | https://cloud.mongodb.com (only for cloud mode; **not needed** for default file mode) |

> No database installation is required to try the project — it ships with a zero-setup file-based JSON store.

## Steps to Run the Project

### Step 1 — Clone the repository

```bash
git clone https://github.com/sumitkumar1503/complete-school-management-system.git
cd complete-school-management-system
```

### Step 2 — Install & start the API server

```bash
cd server
npm install         # install server dependencies
npm run seed        # load demo data (users, students, fees, library, payroll...)
npm run dev         # starts API on http://localhost:5050
```

Keep this terminal running.

### Step 3 — Install & start the web client (new terminal)

```bash
cd client
npm install         # install client dependencies
npm run dev         # starts app on http://localhost:5173
```

### Step 4 — Open the app

Visit **http://localhost:5173** in your browser. You'll land on the public homepage — click **Login** in the navbar and use any demo account below.

### Troubleshooting

- **Port already in use** — Vite automatically picks the next free port (e.g. 5174); check the terminal output. For the API, change `PORT` in `server/.env`.
- **Empty pages after login** — make sure you ran `npm run seed` and the API terminal shows it is listening on port 5050.
- **Login fails** — reseed with `npm run seed` to restore the demo accounts.

### Demo Logins

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Clerk | `clerk1` | `clerk123` |
| Supervisor | `supervisor1` | `supervisor123` |
| Teacher | `teacher1` | `teacher123` |
| Student | `student1` | `student123` |
| Parent | `parent1` | `parent123` |

## Switching to MongoDB Atlas (cloud.mongodb.com)

The whole app talks to a tiny storage interface with two interchangeable drivers:

- `file` (default) — JSON files in `server/data/`, perfect for local demos
- `mongo` — the official MongoDB driver against Atlas or any MongoDB server

Create `server/.env`:

```env
DB_DRIVER=mongo
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net
MONGO_DB_NAME=school_management
```

Then reseed and restart:

```bash
cd server
npm run seed
npm run dev
```

Switch back anytime with `DB_DRIVER=file`. Documents use portable string IDs, so both drivers behave identically.

## Project Structure

```
server/
  src/
    config.js            # env config (port, JWT, DB driver)
    db/
      index.js           # driver switch + sequence counters
      fileStore.js       # JSON file store with Mongo-like queries
      mongoStore.js      # MongoDB driver wrapper (same interface)
    middleware/auth.js   # JWT + role guards
    routes/              # auth, users, admissions, students, attendance,
                         # exams, fees, teachers, dashboard, portal,
                         # assets, inventory, misc (CRUD factory)
    seed/seed.js         # demo data
client/
  src/
    components/          # Layout, DataTable, Modal, KPI cards, status tabs, CrudPage
    context/AppContext   # auth, settings, theme, toasts
    pages/               # 30+ module pages
```

## Project Report

A complete 55-page college project report (Word format) with abstract, DFD (levels 0/1/2), ER diagram, class diagram, sequence diagrams, activity diagram, database design, test cases, and appendices is available at:

```
report/School-Management-System-Project-Report.docx
```

All diagram sources (`.mmd`) and rendered PNGs are in `report/diagrams/`. To regenerate the document run `node gen/generate.js` inside the `report/` folder.

## Role Permissions (summary)

- **Admin** — everything, including publishing exam results, user management, settings/theme
- **Clerk / Supervisor** — admissions, students, fees, assets, inventory, most management modules
- **Teacher** — attendance, marks entry (draft/submit/lock), lesson plans, logbook, discipline, helpdesk
- **Student** — own attendance, published results, hall tickets, notices, helpdesk
- **Parent** — linked children's data (multiple children in one dashboard), fees, PTM, notices
