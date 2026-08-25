# MVHS School Management ERP — System Handover & Technical Overview

This document provides a comprehensive overview of the **M.V HIGH SCHOOL (MVHS) ERP** system. Use this as a direct prompt/reference guide for any AI coding assistant (like Codex) to help them understand the system architecture, business rules, and design choices.

---

## 1. Technical Stack & Architecture

The project is structured as a Javascript monorepo:
* **Frontend (`/client`)**: React (Vite-based), Vanilla CSS (located in `client/src/index.css`), React Router, Lucide Icons, Chart.js.
* **Backend (`/server`)**: Node.js (Express), running on port `5050` by default.
* **Database Driver (`server/src/db/index.js`)**: An abstracted database layer supporting two drivers:
  1. **File-based Store (`fileStore.js`)**: Reads and writes to JSON collections in `server/data/*.json`. (Active by default, ideal for VPS hosting).
  2. **MongoDB Store (`mongoStore.js`)**: Production-ready MongoDB connector. Enabled by setting `DB_DRIVER=mongo` and `MONGO_URI` in `server/.env`.
* **SMTP Mailer (`server/src/utils/emailService.js`)**: Integrated with Nodemailer to trigger parent/teacher email alerts. Uses Google App Password configured in `.env`.

---

## 2. Core Modules & Custom Logic

### 🗓️ Timetable (10-Period Setup)
* **Structure**: Located in `client/src/pages/Timetable.jsx`.
* **Timings**: Configured for 10 periods:
  * **P1**: 07:30 – 08:10 | **P2**: 08:10 – 08:45 | **P3**: 08:45 – 09:20 | **P4**: 09:20 – 09:55 | **P5**: 09:55 – 10:30
  * **Recess Break**: A visual, non-editable row in the table spanning Monday–Friday from **10:30 – 11:00**.
  * **P6**: 11:00 – 11:30 | **P7**: 11:30 – 12:00 | **P8**: 12:00 – 12:30 | **P9**: 12:30 – 13:00 | **P10**: 13:00 – 13:30

### 📚 Homework & Classwork Portal
* **Location**: Frontend: `Homework.jsx` | Backend: `homework.js` (route) & `homework.json` (db).
* **Visibility**: Role-based access. Students and parents only see tasks assigned to their specific `classId`.
* **Urgency Badges**: Dynamic color-coded badges based on due date proximity (🔴 Overdue/Due Today, 🟡 Due in 2–3 Days, 🟢 Due Later).
* **Notifications**: Publishing an active task automatically dispatches email alerts to all parent records linked to students in that class.

### 📢 School Notices
* **Location**: Frontend: `simplePages.jsx` | Backend: `portal.js` (filtering) & `misc.js` (audience routing).
* **Audience Specifics**: Option to target notices to:
  * `all` (Staff, Parents, Students)
  * `teachers` (Only visible and emailed to active teachers)
  * `parents` / `students` (Only visible and emailed to active parents)
  * Specific **Grade/Class ID** (Only visible and emailed to the parents of students in that class).

### 🏆 Exams & Grading
* **Class Targeting**: Exams can be assigned to "All Classes" or a specific "Class / Grade".
* **Email Alerts**: Creating an exam triggers alerts targeted specifically to the parents of students in the selected class.

---

## 3. Database Collections & Business Rules

### Classes & MVHS Standard
* **Structure**: 14 classes seeded (`Nursery A`, `Junior KG A`, `Senior KG A`, `Grade 1 A` to `Grade 10 A`, and `Old Students A`).
* **Section Mapping**: MVHS operates on section **A**. Any legacy imports with section `B` are automatically mapped to `A`.
* **Capacity**: All classes have a capacity limit of **70** students.

### Fee Structure Rules
1. **Entry Grades (Admission Fees)**: Grades `Nursery A`, `Junior KG A`, `Senior KG A`, `Grade 1 A`, and `Grade 5 A` always incur a standard `₹2,000` Admission Fee.
2. **Promoted / Existing Students**: Other grades only incur an Admission Fee if the student's category is explicitly set to `NEW_ADMISSION`. Promoted students default to `EXISTING` and are **not** charged the admission fee.
3. **Post-10th "Old Students"**: Class named `Old Students` acts as an alumni holder. It has `0` standard grade fees; students promoted here only carry over their pending unpaid balances from Grade 10.

### Student Rollover & Promotions
* **Location**: `server/src/routes/promotions.js` and `client/src/pages/Promotions.jsx`.
* **Formula**: When a student is promoted:
  $$\text{Target Demand} = \text{Previous Demand} + \text{New Class Fee}$$
  This cumulative demand structure prevents lifetime paid amounts from being double-deducted, leaving outstanding balance calculated dynamically as:
  $$\text{Balance} = \text{Total Demand} - \text{Total Paid}$$

---

## 4. Theme & User Interface Design

The ERP utilizes a modern **glassmorphic design system** with a sleek navy theme:
* **Primary Branding Color**: Dark Navy Blue (`#0f2248`) used for headers, sidebars, and primary actions.
* **Secondary Action Color**: Emerald Green (`#16a34a`) used for create buttons and update success actions.
* **Visual Components**: Custom DataTables (with CSV/PDF/Print exports), Status Tabs, badge indicators, and smooth micro-animations.

---

## 5. File Database (fileStore.js) Array-Querying Rule

> [!WARNING]
> Because `fileStore.js` is a mock database running on local JSON files, it does **not** support implicit array querying like MongoDB does. 
> 
> * **Incorrect**: `col('students').find({ parentIds: req.user.refId })`
> * **Correct**: Retrieve active students and filter locally:
>   `const all = await col('students').find({ status: 'active' });`
>   `const students = all.filter(s => (s.parentIds || []).includes(req.user.refId));`
