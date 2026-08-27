import bcrypt from 'bcryptjs';
import fs from 'fs';
import { config } from '../config.js';
import { initDb, col } from '../db/index.js';
import { fileStore } from '../db/fileStore.js';

const hash = (p) => bcrypt.hashSync(p, 10);
const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};
const daysAhead = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

async function seed() {
  if (config.isProduction) throw new Error('Demo seeding is disabled in production');
  if (process.env.CONFIRM_DATABASE_RESET !== 'RESET_MVHS_DATABASE') {
    throw new Error('Set CONFIRM_DATABASE_RESET=RESET_MVHS_DATABASE to confirm this destructive reset');
  }
  if (config.dbDriver === 'file' && fs.existsSync(config.dataDir)) {
    fs.rmSync(config.dataDir, { recursive: true, force: true });
  }
  await initDb();
  if (config.dbDriver === 'mongo') {
    // Wipe existing collections when reseeding Mongo
    for (const name of ['users','students','parents','classes','subjects','assignments','admissions','attendance','exams','marks','feeReceipts','feeStructures','dailyAccounts','notices','calendarEvents','lessonPlans','logbook','discipline','conduct','activities','helpdesk','complaints','documents','assets','inventory','stockMovements','timetables','substitutes','ptm','settings','counters','books','bookIssues','salarySlips']) {
      await col(name).deleteMany({});
    }
  }

  const AY = '2026-2027';

  // ---------- Settings ----------
  await col('settings').insertOne({
    key: 'school',
    value: {
      schoolName: 'Demo School',
      tagline: 'Learn. Grow. Succeed.',
      address: 'S.V.P. ROAD, Charni Road, Bhatwadi, PRARTHNA SAMAJ, Mumbai, Maharashtra 400004',
      phone: '022 2386 5845',
      email: 'info@demoschool.edu',
      website: 'www.demoschool.edu',
      timezone: 'Asia/Kolkata',
      currency: '₹',
      academicYear: AY,
      logoUrl: '',
      primaryColor: '#0f2248',
      accentColor: '#16a34a',
    },
  });

  // ---------- Staff users ----------
  const [admin] = await col('users').insertMany([
    { username: 'admin', fullName: 'Admin User', role: 'admin', status: 'active', email: 'admin@demo.com', mobile: '+91 90000 00001', gender: 'Male', joined: '2020-01-01', passwordHash: hash('admin123') },
    { username: 'clerk1', fullName: 'Clerk 1', role: 'clerk', status: 'active', email: 'clerk1@demo.com', mobile: '+91 90000 00002', gender: 'Female', joined: '2021-06-15', passwordHash: hash('clerk123') },
    { username: 'clerk2', fullName: 'Clerk 2', role: 'clerk', status: 'active', email: 'clerk2@demo.com', mobile: '+91 90000 00003', gender: 'Male', joined: '2022-03-10', passwordHash: hash('clerk123') },
    { username: 'supervisor1', fullName: 'Supervisor 1', role: 'supervisor', status: 'active', email: 'supervisor1@demo.com', mobile: '+91 90000 00004', gender: 'Male', joined: '2019-06-01', passwordHash: hash('supervisor123') },
    { username: 'supervisor2', fullName: 'Supervisor 2', role: 'supervisor', status: 'active', email: 'supervisor2@demo.com', mobile: '+91 90000 00005', gender: 'Female', joined: '2020-09-01', passwordHash: hash('supervisor123') },
  ]);

  const teacherDefs = [
    { username: 'teacher1', fullName: 'Teacher 1', specialization: 'Mathematics', qualification: 'M.Sc Mathematics', status: 'active' },
    { username: 'teacher2', fullName: 'Teacher 2', specialization: 'English', qualification: 'M.A English', status: 'active' },
    { username: 'teacher3', fullName: 'Teacher 3', specialization: 'Science', qualification: 'M.Sc Physics', status: 'active' },
    { username: 'teacher4', fullName: 'Teacher 4', specialization: 'Computer', qualification: 'MCA', status: 'inactive' },
  ];
  const teachers = await col('users').insertMany(
    teacherDefs.map((t, i) => ({
      ...t, role: 'teacher', email: `${t.username}@demo.com`, mobile: `+91 91000 0000${i + 1}`,
      gender: i % 2 ? 'Female' : 'Male', joined: daysAgo(400 + i * 90), passwordHash: hash('teacher123'),
    }))
  );

  // ---------- Classes ----------
  const classes = await col('classes').insertMany([
    { name: 'Class 1', section: 'A', academicYear: AY, capacity: 30, room: 'Room 101', classTeacherId: teachers[0]._id, status: 'active' },
    { name: 'Class 1', section: 'B', academicYear: AY, capacity: 30, room: 'Room 102', classTeacherId: teachers[1]._id, status: 'active' },
    { name: 'Class 2', section: 'A', academicYear: AY, capacity: 35, room: 'Room 201', classTeacherId: teachers[2]._id, status: 'active' },
  ]);

  // ---------- Subjects ----------
  const subjects = await col('subjects').insertMany([
    { name: 'Mathematics', code: 'MATH-01', maxMarks: 100, passingMarks: 33, classIds: classes.map((c) => c._id) },
    { name: 'English', code: 'ENG-01', maxMarks: 100, passingMarks: 33, classIds: classes.map((c) => c._id) },
    { name: 'Science', code: 'SCI-01', maxMarks: 100, passingMarks: 33, classIds: [classes[0]._id, classes[2]._id] },
    { name: 'Computer', code: 'COMP-01', maxMarks: 50, passingMarks: 17, classIds: [classes[2]._id] },
    { name: 'Hindi', code: 'HIN-01', maxMarks: 100, passingMarks: 33, classIds: [classes[0]._id, classes[1]._id] },
  ]);

  // ---------- Teacher assignments ----------
  await col('assignments').insertMany([
    { teacherId: teachers[0]._id, classId: classes[0]._id, subjectId: subjects[0]._id },
    { teacherId: teachers[0]._id, classId: classes[1]._id, subjectId: subjects[0]._id },
    { teacherId: teachers[1]._id, classId: classes[0]._id, subjectId: subjects[1]._id },
    { teacherId: teachers[1]._id, classId: classes[1]._id, subjectId: subjects[1]._id },
    { teacherId: teachers[1]._id, classId: classes[2]._id, subjectId: subjects[1]._id },
    { teacherId: teachers[2]._id, classId: classes[0]._id, subjectId: subjects[2]._id },
    { teacherId: teachers[2]._id, classId: classes[2]._id, subjectId: subjects[2]._id },
  ]);

  // ---------- Parents ----------
  const parentDefs = [
    { name: 'Parent 1 Demo', relation: 'Father', occupation: 'Engineer' },
    { name: 'Parent 2 Demo', relation: 'Mother', occupation: 'Doctor' },
    { name: 'Parent 3 Demo', relation: 'Father', occupation: 'Businessman' },
    { name: 'Parent 4 Demo', relation: 'Guardian', occupation: 'Teacher' },
    { name: 'Parent 5 Demo', relation: 'Mother', occupation: 'Banker' },
    { name: 'Parent 6 Demo', relation: 'Father', occupation: 'Farmer' },
  ];
  const parents = await col('parents').insertMany(
    parentDefs.map((p, i) => ({
      ...p, mobile: `+91 92000 0000${i + 1}`, email: `parent${i + 1}@demo.com`,
      address: `${i + 1} Park Avenue, Knowledge City`, status: 'active',
    }))
  );

  // ---------- Students (12, mirroring the video) ----------
  const nationalities = ['British', 'Indian', 'American', 'French', 'Singaporean', 'Korean', 'Indian', 'Indian', 'German', 'Japanese', 'Indian', 'Australian'];
  const eal = ['NATIVE', 'C1', 'NATIVE', 'B2', 'C1', 'B1', 'NATIVE', 'A2', 'B2', 'B1', 'NATIVE', 'C2'];
  const houses = ['Red', 'Blue', 'Green', 'Yellow', 'Red', 'Blue', 'Green', 'Yellow', 'Red', 'Blue', 'Green', 'Yellow'];
  const statuses = ['active','active','active','active','active','active','active','active','active','active','transferred','passed-out'];
  // Give a few students birthdays near today so the dashboard birthday widget has data
  const bday = (inDays, birthYear) => {
    const d = new Date();
    d.setDate(d.getDate() + inDays);
    return `${birthYear}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const studentDocs = [];
  for (let i = 0; i < 12; i++) {
    const classIdx = i < 4 ? 0 : i < 8 ? 1 : 2;
    studentDocs.push({
      admissionNo: `2024-${String(i + 1).padStart(8, '0')}`,
      firstName: `Student ${i + 1}`,
      lastName: 'Demo',
      gender: i % 3 === 1 ? 'Female' : 'Male',
      dob: i === 0 ? bday(0, 2017) : i === 3 ? bday(2, 2016) : i === 7 ? bday(5, 2017)
        : `201${6 + (classIdx)}-0${(i % 9) + 1}-1${i % 9}`,
      nationality: nationalities[i],
      curriculum: 'IB PYP',
      englishLevel: eal[i],
      house: houses[i],
      allergies: i === 4 ? 'Peanuts' : '',
      medicalNotes: i === 4 ? 'Carries EpiPen. Avoid nut products.' : '',
      languages: 'English, Hindi',
      classId: classes[classIdx]._id,
      rollNo: String((i % 4) + 1),
      admissionDate: daysAgo(300 - i * 10),
      transportRequired: i % 3 === 0,
      transportRoute: i % 3 === 0 ? `Route ${(i % 4) + 1}` : '',
      parentIds: [parents[i % 6]._id],
      academicYear: AY,
      status: statuses[i],
      address: `${i + 1} Park Avenue, Knowledge City`,
    });
  }
  const students = await col('students').insertMany(studentDocs);

  // Student + parent logins
  await col('users').insertMany(
    students.map((s, i) => ({
      username: `student${i + 1}`, fullName: `${s.firstName} ${s.lastName}`, role: 'student',
      status: s.status === 'active' ? 'active' : 'inactive', refId: s._id, passwordHash: hash('student123'),
    }))
  );
  await col('users').insertMany(
    parents.map((p, i) => ({
      username: `parent${i + 1}`, fullName: p.name, role: 'parent', status: 'active',
      refId: p._id, email: p.email, mobile: p.mobile, passwordHash: hash('parent123'),
    }))
  );
  // One suspended user like in the video
  await col('users').insertOne({
    username: 'clerk3', fullName: 'Clerk 3', role: 'clerk', status: 'suspended',
    email: 'clerk3@demo.com', mobile: '+91 90000 00009', joined: '2024-03-01', passwordHash: hash('clerk123'),
  });

  // ---------- Admissions pipeline ----------
  await col('admissions').insertMany([
    { regNo: 'REG-2024-00001', firstName: 'Applicant', lastName: 'One', gender: 'Male', dob: '2017-04-12', classAppliedFor: 'Class 1', academicYear: AY, parentName: 'Guardian One', parentRelation: 'Father', parentMobile: '+91 93000 00001', parentEmail: 'g1@demo.com', status: 'registered' },
    { regNo: 'REG-2024-00002', firstName: 'Applicant', lastName: 'Two', gender: 'Female', dob: '2017-08-21', classAppliedFor: 'Class 1', academicYear: AY, parentName: 'Guardian Two', parentRelation: 'Mother', parentMobile: '+91 93000 00002', parentEmail: 'g2@demo.com', status: 'registered' },
    { regNo: 'REG-2024-00003', firstName: 'Applicant', lastName: 'Three', gender: 'Male', dob: '2016-11-02', classAppliedFor: 'Class 2', academicYear: AY, parentName: 'Guardian Three', parentRelation: 'Father', parentMobile: '+91 93000 00003', status: 'rejected', rejectReason: 'Age criteria not met for the applied class.' },
    { regNo: 'REG-2024-00004', firstName: 'Applicant', lastName: 'Four', gender: 'Female', dob: '2017-01-30', classAppliedFor: 'Class 1', academicYear: AY, parentName: 'Guardian Four', parentRelation: 'Guardian', parentMobile: '+91 93000 00004', status: 'admitted', studentId: students[0]._id, admissionNo: students[0].admissionNo },
  ]);

  // ---------- Counters ----------
  await col('counters').insertMany([
    { key: 'admissionNo', value: 12 },
    { key: 'registration', value: 4 },
    { key: 'receipt', value: 6 },
    { key: 'assetTag', value: 5 },
    { key: 'studentUser', value: 12 },
    { key: 'parentUser', value: 6 },
    { key: 'bookAcc', value: 10 },
    { key: 'salarySlip', value: 5 },
  ]);

  // ---------- Attendance: last 7 school days ----------
  const statusPool = ['present', 'present', 'present', 'present', 'present', 'present', 'late', 'absent', 'halfday', 'leave'];
  for (let d = 6; d >= 0; d--) {
    for (const klass of classes) {
      const roster = students.filter((s) => s.classId === klass._id && s.status === 'active');
      await col('attendance').insertOne({
        classId: klass._id,
        date: daysAgo(d),
        records: roster.map((s, i) => ({
          studentId: s._id,
          status: d === 0 && i === 0 ? 'absent' : statusPool[(i * 7 + d * 3) % statusPool.length],
        })),
        markedBy: 'Teacher 1',
      });
    }
  }

  // ---------- Exams & marks ----------
  const exams = await col('exams').insertMany([
    { name: 'Unit Test 1', type: 'Unit Test', academicYear: AY, startDate: daysAgo(45), endDate: daysAgo(40), status: 'published', classIds: classes.map((c) => c._id) },
    { name: 'Quarterly Exam', type: 'Quarterly', academicYear: AY, startDate: daysAgo(10), endDate: daysAgo(5), status: 'ongoing', classIds: classes.map((c) => c._id) },
    { name: 'Half Yearly Exam', type: 'Half Yearly', academicYear: AY, startDate: daysAhead(20), endDate: daysAhead(28), status: 'scheduled', classIds: classes.map((c) => c._id) },
  ]);

  const grade = (m, max, pass) => {
    const pct = (m / max) * 100;
    if (pct >= 90) return 'A+';
    if (pct >= 80) return 'A';
    if (pct >= 70) return 'B+';
    if (pct >= 60) return 'B';
    if (pct >= 50) return 'C';
    if (m >= pass) return 'D';
    return 'F';
  };

  for (const klass of classes) {
    const roster = students.filter((s) => s.classId === klass._id && s.status === 'active');
    const klassSubjects = subjects.filter((s) => s.classIds.includes(klass._id));
    for (const subj of klassSubjects) {
      // Unit Test 1: published
      await col('marks').insertOne({
        examId: exams[0]._id, classId: klass._id, subjectId: subj._id, status: 'published',
        enteredBy: 'Teacher 1', publishedBy: 'Admin User',
        entries: roster.map((s, i) => {
          const m = Math.min(subj.maxMarks, Math.round(subj.maxMarks * (0.45 + ((i * 13) % 50) / 100)));
          return { studentId: s._id, marks: m, grade: grade(m, subj.maxMarks, subj.passingMarks), pass: m >= subj.passingMarks };
        }),
      });
      // Quarterly: submitted (awaiting admin publish)
      await col('marks').insertOne({
        examId: exams[1]._id, classId: klass._id, subjectId: subj._id, status: 'submitted',
        enteredBy: 'Teacher 2',
        entries: roster.map((s, i) => {
          const m = Math.min(subj.maxMarks, Math.round(subj.maxMarks * (0.4 + ((i * 17) % 55) / 100)));
          return { studentId: s._id, marks: m, grade: grade(m, subj.maxMarks, subj.passingMarks), pass: m >= subj.passingMarks };
        }),
      });
    }
  }

  // ---------- Fee structures ----------
  await col('feeStructures').insertMany([
    { name: 'Tuition Fee', category: 'tuition', frequency: 'monthly', amount: 1500, classIds: [], status: 'active' },
    { name: 'Transport Fee', category: 'transport', frequency: 'monthly', amount: 500, classIds: [], status: 'active' },
    { name: 'Admission Fee', category: 'one-time', frequency: 'one-time', amount: 5000, classIds: [], status: 'active' },
    { name: 'Annual Sports Fee', category: 'activity', frequency: 'annual', amount: 1200, classIds: [], status: 'active' },
    { name: 'Lab Fee (Class 2)', category: 'lab', frequency: 'annual', amount: 800, classIds: [classes[2]._id], status: 'active' },
  ]);

  // ---------- Fee receipts ----------
  const mkReceipt = async (i, student, opts) => {
    const klass = classes.find((c) => c._id === student.classId);
    const items = opts.items;
    const subTotal = items.reduce((s, x) => s + x.amount, 0);
    const amountDue = subTotal + (opts.lateFee || 0) - (opts.discount || 0);
    const balance = amountDue - opts.amountPaid;
    const doc = await col('feeReceipts').insertOne({
      receiptNo: `RCP-2024-${String(i).padStart(8, '0')}`,
      studentId: student._id,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNo: student.admissionNo,
      className: `${klass.name} ${klass.section} (${AY})`,
      academicYear: AY,
      date: opts.date, items, subTotal,
      lateFee: opts.lateFee || 0, discount: opts.discount || 0,
      amountDue, amountPaid: opts.amountPaid, balance,
      mode: opts.mode, remarks: opts.remarks || '',
      collectedBy: 'Admin User',
      status: opts.amountPaid <= 0 ? 'unpaid' : balance > 0 ? 'partial' : 'paid',
    });
    if (opts.amountPaid > 0) {
      await col('dailyAccounts').insertOne({
        date: opts.date, type: 'income', category: 'Fees',
        description: `Fee receipt ${doc.receiptNo} — ${doc.studentName}`,
        amount: opts.amountPaid, mode: opts.mode, recordedBy: 'Admin User', receiptId: doc._id,
      });
    }
  };

  await mkReceipt(1, students[0], { date: daysAgo(30), items: [{ description: `TUITION — prev month`, amount: 1500 }, { description: 'Transport', amount: 500 }], amountPaid: 2000, mode: 'cash' });
  await mkReceipt(2, students[1], { date: daysAgo(25), items: [{ description: 'TUITION — prev month', amount: 1500 }], amountPaid: 1500, mode: 'upi' });
  await mkReceipt(3, students[2], { date: daysAgo(12), items: [{ description: 'TUITION — this month', amount: 1500 }], lateFee: 50, amountPaid: 1000, mode: 'cash', remarks: 'Late payment' });
  await mkReceipt(4, students[3], { date: daysAgo(6), items: [{ description: 'TUITION — this month', amount: 1500 }, { description: 'Annual Sports Fee', amount: 1200 }], discount: 200, amountPaid: 2500, mode: 'card' });
  await mkReceipt(5, students[4], { date: daysAgo(2), items: [{ description: 'TUITION — this month', amount: 1500 }], amountPaid: 1500, mode: 'online' });
  await mkReceipt(6, students[5], { date: iso(today), items: [{ description: 'TUITION — this month', amount: 1500 }, { description: 'Transport', amount: 500 }], amountPaid: 2000, mode: 'cash' });

  // ---------- Daily accounts (expenses) ----------
  await col('dailyAccounts').insertMany([
    { date: daysAgo(5), type: 'expense', category: 'Utilities', description: 'Electricity bill', amount: 3200, mode: 'online', recordedBy: 'Clerk 1' },
    { date: daysAgo(3), type: 'expense', category: 'Supplies', description: 'Whiteboard markers x 40', amount: 900, mode: 'cash', recordedBy: 'Clerk 1' },
    { date: daysAgo(1), type: 'income', category: 'Donation', description: 'Alumni donation', amount: 5000, mode: 'check', recordedBy: 'Admin User' },
  ]);

  // ---------- Assets ----------
  await col('assets').insertMany([
    { tag: 'AST-00001', name: 'Projector — Epson X41', category: 'Electronics', location: 'Room 101', purchaseDate: '2023-05-10', cost: 42000, status: 'in-use', maintenance: [{ date: daysAgo(60), description: 'Lamp replacement', cost: 3500, by: 'Clerk 1' }] },
    { tag: 'AST-00002', name: 'Microscope Set (10 units)', category: 'Lab Equipment', location: 'Science Lab', purchaseDate: '2022-08-01', cost: 85000, status: 'in-use', maintenance: [] },
    { tag: 'AST-00003', name: 'Desktop PC — Lab', category: 'Electronics', location: 'Computer Lab', purchaseDate: '2021-11-20', cost: 38000, status: 'maintenance', maintenance: [{ date: daysAgo(4), description: 'RAM upgrade + servicing', cost: 2800, by: 'Clerk 2' }] },
    { tag: 'AST-00004', name: 'Water Purifier', category: 'Appliances', location: 'Cafeteria', purchaseDate: '2023-01-15', cost: 15000, status: 'in-use', maintenance: [] },
    { tag: 'AST-00005', name: 'School Bus — KA01 AB 1234', category: 'Vehicle', location: 'Parking', purchaseDate: '2019-04-01', cost: 1450000, status: 'in-use', maintenance: [{ date: daysAgo(15), description: 'Oil change and brake pads', cost: 8500, by: 'Clerk 1' }] },
  ]);

  // ---------- Inventory ----------
  const inv = await col('inventory').insertMany([
    { name: 'A4 Paper', category: 'Stationery', unit: 'pack', quantity: 42, reorderLevel: 20, status: 'active' },
    { name: 'Whiteboard Markers', category: 'Stationery', unit: 'pieces', quantity: 15, reorderLevel: 24, status: 'active' },
    { name: 'Chalk Boxes', category: 'Stationery', unit: 'box', quantity: 60, reorderLevel: 10, status: 'active' },
    { name: 'Cleaning Liquid', category: 'Housekeeping', unit: 'litre', quantity: 8, reorderLevel: 10, status: 'active' },
    { name: 'Printer Toner', category: 'Office', unit: 'pieces', quantity: 5, reorderLevel: 2, status: 'active' },
  ]);
  await col('stockMovements').insertMany([
    { itemId: inv[0]._id, itemName: 'A4 Paper', type: 'in', quantity: 50, balanceAfter: 50, note: 'Opening stock', date: daysAgo(20), by: 'Clerk 1' },
    { itemId: inv[0]._id, itemName: 'A4 Paper', type: 'issue', quantity: 8, balanceAfter: 42, note: 'Issued to exam cell', issuedTo: 'Exam Cell', date: daysAgo(3), by: 'Clerk 1' },
  ]);

  // ---------- Timetables ----------
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const slots = [
    { no: 1, start: '08:30', end: '09:15' },
    { no: 2, start: '09:15', end: '10:00' },
    { no: 3, start: '10:15', end: '11:00' },
    { no: 4, start: '11:00', end: '11:45' },
    { no: 5, start: '12:30', end: '13:15' },
  ];
  for (const klass of classes) {
    const klassSubjects = subjects.filter((s) => s.classIds.includes(klass._id));
    const periods = [];
    for (const day of days) {
      slots.forEach((slot, i) => {
        const subj = klassSubjects[i % klassSubjects.length];
        const assignment = (subj && teachers[i % teachers.length]) || null;
        periods.push({
          day, period: slot.no, start: slot.start, end: slot.end,
          subjectId: subj?._id || null, subjectName: subj?.name || 'Free',
          teacherId: teachers[i % teachers.length]._id, teacherName: teachers[i % teachers.length].fullName,
        });
      });
    }
    await col('timetables').insertOne({ classId: klass._id, periods });
  }

  // ---------- Notices, calendar, PTM ----------
  await col('notices').insertMany([
    { title: 'Annual Sports Day', body: 'Annual Sports Day will be held on the school grounds. All students must report by 8 AM.', audience: 'all', date: daysAgo(2), status: 'published', postedBy: 'Admin User' },
    { title: 'Fee Payment Reminder', body: 'Monthly tuition fees for this month are due by the 10th. Late fee applies afterwards.', audience: 'parents', date: daysAgo(1), status: 'published', postedBy: 'Clerk 1' },
    { title: 'Staff Meeting', body: 'All teaching staff to assemble in the conference room on Friday at 3:30 PM.', audience: 'teachers', date: iso(today), status: 'published', postedBy: 'Admin User' },
  ]);
  await col('calendarEvents').insertMany([
    { title: 'Independence Day (Holiday)', type: 'holiday', date: daysAhead(12), description: 'School closed' },
    { title: 'Science Exhibition', type: 'event', date: daysAhead(18), description: 'Open to parents from 10 AM' },
    { title: 'Half Yearly Exams Begin', type: 'exam', date: daysAhead(20), description: '' },
  ]);
  await col('ptm').insertMany([
    { title: 'PTM — Term 1 Review', date: daysAhead(7), slots: '09:00 - 12:00 (15 min per parent)', classIds: classes.map((c) => c._id), status: 'scheduled', notes: 'Book your slot with the class teacher.' },
  ]);

  // ---------- Lesson plans & logbook ----------
  await col('lessonPlans').insertMany([
    { teacherName: 'Teacher 1', classId: classes[0]._id, subjectId: subjects[0]._id, date: iso(today), topic: 'Addition with carrying', objectives: 'Students can add 2-digit numbers with carrying', activities: 'Board practice, worksheet', homework: 'Workbook page 24', status: 'planned' },
    { teacherName: 'Teacher 2', classId: classes[1]._id, subjectId: subjects[1]._id, date: daysAgo(1), topic: 'Nouns and pronouns', objectives: 'Identify nouns/pronouns in sentences', activities: 'Group reading', homework: 'Underline nouns in a paragraph', status: 'completed' },
  ]);
  await col('logbook').insertMany([
    { teacherName: 'Teacher 1', classId: classes[0]._id, subjectId: subjects[0]._id, date: daysAgo(1), topicCovered: 'Addition basics', homeworkGiven: 'Workbook page 23', remarks: 'Good participation' },
    { teacherName: 'Teacher 3', classId: classes[2]._id, subjectId: subjects[2]._id, date: daysAgo(1), topicCovered: 'States of matter', homeworkGiven: 'Draw the water cycle', remarks: '2 students need revision support' },
  ]);

  // ---------- Discipline, conduct, activities ----------
  await col('discipline').insertMany([
    { studentId: students[6]._id, studentName: 'Student 7 Demo', date: daysAgo(4), incident: 'Disrupting class repeatedly', severity: 'medium', actionTaken: 'Verbal warning, seat changed', parentNotified: true, reportedBy: 'Teacher 2', status: 'closed' },
    { studentId: students[2]._id, studentName: 'Student 3 Demo', date: daysAgo(2), incident: 'Skipped afternoon periods', severity: 'high', actionTaken: 'Parent meeting scheduled', parentNotified: true, reportedBy: 'Supervisor 1', status: 'open' },
    { studentId: students[9]._id, studentName: 'Student 10 Demo', date: daysAgo(1), incident: 'Incomplete homework 3 days in a row', severity: 'low', actionTaken: 'Extra practice assigned', parentNotified: false, reportedBy: 'Teacher 1', status: 'open' },
  ]);
  await col('conduct').insertMany([
    { studentId: students[0]._id, studentName: 'Student 1 Demo', date: daysAgo(3), type: 'merit', note: 'Helped organize the library', points: 5, by: 'Teacher 2' },
    { studentId: students[4]._id, studentName: 'Student 5 Demo', date: daysAgo(1), type: 'merit', note: 'Won inter-class quiz', points: 10, by: 'Teacher 3' },
  ]);
  await col('activities').insertMany([
    { title: 'Football Practice', type: 'Sports', date: daysAhead(2), classIds: [classes[2]._id], inCharge: 'Teacher 3', status: 'scheduled' },
    { title: 'Art & Craft Workshop', type: 'Cultural', date: daysAhead(5), classIds: [classes[0]._id, classes[1]._id], inCharge: 'Teacher 2', status: 'scheduled' },
  ]);

  // ---------- Helpdesk, complaints, documents ----------
  await col('helpdesk').insertMany([
    { subject: 'Cannot download hall ticket', description: 'Getting an error when downloading hall ticket for Quarterly exam.', raisedBy: 'student1', role: 'student', priority: 'high', status: 'open', category: 'Portal' },
    { subject: 'Fee receipt email not received', description: 'Paid on Monday but no email receipt yet.', raisedBy: 'parent2', role: 'parent', priority: 'medium', status: 'in-progress', category: 'Fees', assignedTo: 'Clerk 1' },
    { subject: 'Projector flickering in Room 101', description: 'Screen flickers during lessons.', raisedBy: 'teacher1', role: 'teacher', priority: 'low', status: 'open', category: 'Infrastructure' },
  ]);
  await col('complaints').insertMany([
    { subject: 'School bus arriving late', description: 'Route 2 bus has been 20+ minutes late all week.', raisedBy: 'parent1', role: 'parent', against: 'Transport', status: 'open', severity: 'medium' },
    { subject: 'Canteen food quality', description: 'Food served on Wednesday was stale.', raisedBy: 'teacher2', role: 'teacher', against: 'Canteen', status: 'resolved', severity: 'high', resolution: 'Vendor warned; weekly quality checks started.' },
  ]);
  await col('documents').insertMany([
    { title: 'School Almanac 2024-25', category: 'General', audience: 'all', link: '#', uploadedBy: 'Admin User', date: daysAgo(40) },
    { title: 'Exam Guidelines — Quarterly', category: 'Exams', audience: 'students', link: '#', uploadedBy: 'Admin User', date: daysAgo(8) },
    { title: 'Staff Leave Policy', category: 'HR', audience: 'teachers', link: '#', uploadedBy: 'Admin User', date: daysAgo(90) },
  ]);

  // ---------- Library ----------
  const bookDefs = [
    ['Basic Mathematics — Grade 1', 'R. Sharma', 'Mathematics', 5],
    ['English Reader — Level 1', 'P. Collins', 'English', 6],
    ['My World of Science', 'A. Verma', 'Science', 4],
    ['Fun with Computers', 'S. Iyer', 'Computer', 3],
    ['Hindi Pathmala 1', 'K. Gupta', 'Hindi', 5],
    ['Atlas for Young Learners', 'Geo Press', 'Reference', 2],
    ['Illustrated Dictionary', 'Lexi House', 'Reference', 3],
    ['Moral Stories for Kids', 'T. Rao', 'Story Books', 8],
    ['Drawing & Craft Ideas', 'M. Das', 'Art', 4],
    ['General Knowledge Today', 'Quiz Works', 'GK', 5],
  ];
  const coverColors = ['#0f2248', '#16a34a', '#7c3aed', '#dc2626', '#0ea5e9', '#d97706'];
  const books = await col('books').insertMany(bookDefs.map(([title, author, category, copies], i) => ({
    accNo: `LIB-${String(i + 1).padStart(5, '0')}`,
    title, author, category, copies,
    availableCopies: copies,
    isbn: `978-81-${String(100000 + i * 137)}`,
    shelf: `${category[0]}-${(i % 4) + 1}`,
    coverColor: coverColors[i % 6],
  })));

  const issueDefs = [
    { book: 0, member: students[0], daysAgoIssued: 5, status: 'issued' },   // due in future
    { book: 7, member: students[2], daysAgoIssued: 20, status: 'issued' },  // overdue
    { book: 1, member: students[4], daysAgoIssued: 18, status: 'returned', returnedDaysAgo: 2 },
  ];
  for (const d of issueDefs) {
    const issueDate = daysAgo(d.daysAgoIssued);
    const due = new Date();
    due.setDate(due.getDate() - d.daysAgoIssued + 14);
    const dueDate = iso(due);
    const returned = d.status === 'returned';
    const returnDate = returned ? daysAgo(d.returnedDaysAgo) : null;
    const daysLate = returned ? Math.max(0, Math.ceil((new Date(returnDate) - new Date(dueDate)) / 86400000)) : 0;
    await col('bookIssues').insertOne({
      bookId: books[d.book]._id, bookTitle: books[d.book].title, accNo: books[d.book].accNo,
      memberType: 'student', memberId: d.member._id,
      memberName: `${d.member.firstName} ${d.member.lastName}`,
      issueDate, dueDate, returnDate,
      fine: daysLate * 5, status: d.status, issuedBy: 'Clerk 1',
    });
    if (!returned) {
      await col('books').updateOne({ _id: books[d.book]._id }, { availableCopies: books[d.book].availableCopies - 1 });
    }
  }

  // ---------- Payroll (salary slips) ----------
  const prevMonth = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  };
  const thisMonth = new Date().toISOString().slice(0, 7);
  let slipSeq = 0;
  const mkSlip = async (staff, month, basic, status) => {
    slipSeq++;
    const allowances = [{ name: 'HRA', amount: Math.round(basic * 0.2) }, { name: 'Transport Allowance', amount: 1500 }];
    const deductions = [{ name: 'Provident Fund', amount: Math.round(basic * 0.06) }, { name: 'Professional Tax', amount: 200 }];
    const gross = basic + allowances.reduce((s, a) => s + a.amount, 0);
    const totalDeductions = deductions.reduce((s, d2) => s + d2.amount, 0);
    await col('salarySlips').insertOne({
      slipNo: `SLP-${month.replace('-', '')}-${String(slipSeq).padStart(4, '0')}`,
      staffId: staff._id, staffName: staff.fullName, role: staff.role,
      designation: staff.specialization || staff.role,
      month, basicSalary: basic, allowances, deductions,
      gross, totalAllowances: gross - basic, totalDeductions, netPay: gross - totalDeductions,
      workingDays: 26, presentDays: 25,
      status, paidOn: status === 'paid' ? daysAgo(3) : null, mode: status === 'paid' ? 'online' : null,
      generatedBy: 'Admin User',
    });
  };
  await mkSlip(teachers[0], prevMonth(), 45000, 'paid');
  await mkSlip(teachers[1], prevMonth(), 42000, 'paid');
  await mkSlip(teachers[2], prevMonth(), 40000, 'paid');
  await mkSlip(teachers[0], thisMonth, 45000, 'generated');
  await mkSlip(teachers[1], thisMonth, 42000, 'generated');

  // ---------- Substitutes ----------
  await col('substitutes').insertMany([
    { date: iso(today), absentTeacherId: teachers[3]._id, absentTeacherName: 'Teacher 4', substituteTeacherId: teachers[0]._id, substituteTeacherName: 'Teacher 1', periods: [{ day: 'Monday', period: 2, className: 'Class 2 A', subjectName: 'Computer' }], status: 'allocated' },
  ]);

  // Flush file store writes
  if (config.dbDriver === 'file') {
    for (const name of ['users','students','parents','classes','subjects','assignments','admissions','attendance','exams','marks','feeReceipts','feeStructures','dailyAccounts','notices','calendarEvents','lessonPlans','logbook','discipline','conduct','activities','helpdesk','complaints','documents','assets','inventory','stockMovements','timetables','substitutes','ptm','settings','counters','books','bookIssues','salarySlips']) {
      fileStore.collection(name).flush();
    }
  }

  console.log('Seed complete.');
  console.log('Logins -> admin/admin123, clerk1/clerk123, supervisor1/supervisor123, teacher1/teacher123, student1/student123, parent1/parent123');
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
