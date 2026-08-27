import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');

const hashCache = {};
const hash = (p) => {
  if (!hashCache[p]) {
    hashCache[p] = bcrypt.hashSync(p, 10);
  }
  return hashCache[p];
};
const nanoid = (t = 12) => Array.from({ length: t }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(62 * Math.random())]).join("");

// Load legacy students
const legacyPath = '/Users/amroy/Desktop/MVHIGHSCHOOLERP/apps/api/migration-input/legacy-students-original.json';

if (!fs.existsSync(legacyPath)) {
  console.error(`ERROR: Legacy student data file not found at ${legacyPath}`);
  process.exit(1);
}

const legacyStudents = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
console.log(`Loaded ${legacyStudents.length} legacy students from ${legacyPath}`);

// Load legacy payments
const legacyPaymentsPath = '/Users/amroy/Desktop/MVHIGHSCHOOLERP/apps/api/migration-input/legacy-payments-original.json';
if (!fs.existsSync(legacyPaymentsPath)) {
  console.error(`ERROR: Legacy payments data file not found at ${legacyPaymentsPath}`);
  process.exit(1);
}
const legacyPayments = JSON.parse(fs.readFileSync(legacyPaymentsPath, 'utf8'));
console.log(`Loaded ${legacyPayments.length} legacy payments from ${legacyPaymentsPath}`);

// 1. Reset all operational data tables to empty arrays
const tablesToReset = [
  'attendance', 'exams', 'marks', 
  'notices', 'calendarEvents', 'lessonPlans', 'logbook', 'discipline', 
  'conduct', 'activities', 'helpdesk', 'complaints', 'documents', 
  'bookIssues', 'salarySlips', 'timetables', 'substitutes', 'ptm'
];
for (const table of tablesToReset) {
  fs.writeFileSync(path.join(dataDir, `${table}.json`), JSON.stringify([], null, 2));
}
console.log('Reset operational data tables.');

// 2. Load teachers from existing users.json to assign as class teachers
const usersFile = path.join(dataDir, 'users.json');
let currentUsers = [];
if (fs.existsSync(usersFile)) {
  currentUsers = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
}
const teachers = currentUsers.filter(u => u.role === 'teacher');
console.log(`Found ${teachers.length} teachers in database.`);

// Filter out old student and parent users, keep staff
const staffUsers = currentUsers.filter(u => ['admin', 'clerk', 'supervisor', 'teacher'].includes(u.role));
console.log(`Keeping ${staffUsers.length} staff users.`);

// 3. Create classes
// Class names: Grade 1, Grade 2, etc.
// Unique Grade + Section
const uniqueClasses = [...new Set(legacyStudents.map(s => `${s.grade}_${s.section}`))];
const classMap = {}; // name_section -> classId
const classesData = [];

uniqueClasses.forEach((clsKey, index) => {
  const [grade, section] = clsKey.split('_');
  const classId = nanoid();
  classMap[clsKey] = classId;

  // Assign class teacher round-robin
  const teacher = teachers[index % teachers.length];

  classesData.push({
    "_id": classId,
    "name": grade,
    "section": section,
    "academicYear": "2026-2027",
    "capacity": 40,
    "room": `Room ${101 + index}`,
    "classTeacherId": teacher ? teacher._id : "",
    "status": "active",
    "createdAt": new Date().toISOString()
  });
});

fs.writeFileSync(path.join(dataDir, 'classes.json'), JSON.stringify(classesData, null, 2));
console.log(`Created ${classesData.length} classes.`);

// 4. Create Fee Structures matching official image
// Get class ids grouped by primary vs secondary
const primaryClassIds = [];
const secondaryClassIds = [];

classesData.forEach(c => {
  const isPrimary = c.name.startsWith('Grade 1') || c.name.startsWith('Grade 2') || c.name.startsWith('Grade 3') || c.name.startsWith('Grade 4');
  if (isPrimary) {
    primaryClassIds.push(c._id);
  } else {
    secondaryClassIds.push(c._id);
  }
});

const feeStructuresData = [
  // Tuition Fee
  {
    "_id": nanoid(),
    "name": "Tuition Fee (Primary)",
    "category": "tuition",
    "frequency": "monthly",
    "amount": 1500,
    "classIds": primaryClassIds,
    "status": "active",
    "createdAt": new Date().toISOString()
  },
  {
    "_id": nanoid(),
    "name": "Tuition Fee (Secondary)",
    "category": "tuition",
    "frequency": "monthly",
    "amount": 1800,
    "classIds": secondaryClassIds,
    "status": "active",
    "createdAt": new Date().toISOString()
  },
  // Admission Fee
  {
    "_id": nanoid(),
    "name": "Admission Fee (Primary)",
    "category": "one-time",
    "frequency": "one-time",
    "amount": 2000,
    "classIds": primaryClassIds,
    "status": "active",
    "createdAt": new Date().toISOString()
  },
  {
    "_id": nanoid(),
    "name": "Admission Fee (Secondary)",
    "category": "one-time",
    "frequency": "one-time",
    "amount": 2200,
    "classIds": secondaryClassIds,
    "status": "active",
    "createdAt": new Date().toISOString()
  },
  // Term Fee
  {
    "_id": nanoid(),
    "name": "Term Fee (Primary)",
    "category": "exam",
    "frequency": "bi-annual",
    "amount": 1500,
    "classIds": primaryClassIds,
    "status": "active",
    "createdAt": new Date().toISOString()
  },
  {
    "_id": nanoid(),
    "name": "Term Fee (Secondary)",
    "category": "exam",
    "frequency": "bi-annual",
    "amount": 1800,
    "classIds": secondaryClassIds,
    "status": "active",
    "createdAt": new Date().toISOString()
  },
  // MS Fee
  {
    "_id": nanoid(),
    "name": "MS Fee (Primary)",
    "category": "activity",
    "frequency": "annual",
    "amount": 2500,
    "classIds": primaryClassIds,
    "status": "active",
    "createdAt": new Date().toISOString()
  },
  {
    "_id": nanoid(),
    "name": "MS Fee (Secondary)",
    "category": "activity",
    "frequency": "annual",
    "amount": 3600,
    "classIds": secondaryClassIds,
    "status": "active",
    "createdAt": new Date().toISOString()
  }
];

fs.writeFileSync(path.join(dataDir, 'feeStructures.json'), JSON.stringify(feeStructuresData, null, 2));
console.log('Created fee structures matching official MVHS sheet.');

// 5. Create Parents
const parentMap = {}; // mobile -> parentId
const parentsData = [];
const parentUsersData = [];

// Group parents by mobile number
legacyStudents.forEach(s => {
  const mobile = s.guardianMobile || "9999999999";
  if (!parentMap[mobile]) {
    const parentId = nanoid();
    parentMap[mobile] = parentId;

    const email = `${s.guardianName.toLowerCase().replace(/[^a-z0-9]/g, '')}@mvhs.edu.in`;
    const username = `parent_${mobile}`;

    parentsData.push({
      "_id": parentId,
      "name": s.guardianName,
      "relation": "Guardian",
      "occupation": "Service",
      "mobile": mobile,
      "email": email,
      "address": "Mumbai, Maharashtra",
      "status": "active",
      "createdAt": new Date().toISOString()
    });

    // Create user login for parent
    parentUsersData.push({
      "_id": nanoid(),
      "username": username,
      "fullName": s.guardianName,
      "role": "parent",
      "status": "active",
      "refId": parentId,
      "email": email,
      "mobile": mobile,
      "passwordHash": hash("parent123"),
      "createdAt": new Date().toISOString()
    });
  }
});

fs.writeFileSync(path.join(dataDir, 'parents.json'), JSON.stringify(parentsData, null, 2));
console.log(`Created ${parentsData.length} parents.`);

// 6. Create Students & Student Users
const studentsData = [];
const studentUsersData = [];
const houses = ['Red', 'Blue', 'Green', 'Yellow'];
const rollNumbers = {}; // classKey -> currentRoll

legacyStudents.forEach((s, index) => {
  const clsKey = `${s.grade}_${s.section}`;
  if (!rollNumbers[clsKey]) rollNumbers[clsKey] = 1;
  const rollNo = rollNumbers[clsKey]++;

  const studentId = nanoid();
  const parentId = parentMap[s.guardianMobile || "9999999999"];
  const classId = classMap[clsKey];

  studentsData.push({
    "_id": studentId,
    "admissionNo": s.studentId, // Use studentId as admissionNo (e.g. MVHS-2026-100435)
    "firstName": s.firstName,
    "lastName": s.lastName || "Kumar",
    "gender": s.gender === 'MALE' ? 'Male' : 'Female',
    "dob": s.dateOfBirth,
    "nationality": "Indian",
    "curriculum": "State Board",
    "englishLevel": "B2",
    "house": houses[index % houses.length],
    "allergies": "",
    "medicalNotes": `Category: ${s.admissionCategory}`,
    "totalDemand": Number(s.totalDemand) || 0,
    "languages": "English, Hindi, Marathi",
    "classId": classId,
    "rollNo": String(rollNo),
    "admissionDate": "2025-06-01",
    "transportRequired": false,
    "transportRoute": "",
    "parentIds": [parentId],
    "academicYear": "2026-2027",
    "status": "active",
    "address": "Mumbai, Maharashtra",
    "createdAt": new Date().toISOString()
  });

  // Create student user login
  studentUsersData.push({
    "_id": nanoid(),
    "username": s.studentId.toLowerCase(), // e.g. "mvhs-2026-100435"
    "fullName": `${s.firstName} ${s.lastName || 'Kumar'}`.trim(),
    "role": "student",
    "status": "active",
    "refId": studentId,
    "passwordHash": hash("student123"),
    "createdAt": new Date().toISOString()
  });
});

fs.writeFileSync(path.join(dataDir, 'students.json'), JSON.stringify(studentsData, null, 2));
console.log(`Created ${studentsData.length} students.`);

// Write all users back to users.json
const allUsers = [...staffUsers, ...parentUsersData, ...studentUsersData];
fs.writeFileSync(usersFile, JSON.stringify(allUsers, null, 2));
console.log(`Updated users.json with ${allUsers.length} total users.`);

// 7. Load & Import Payments/Receipts (Sorted and balance tracked)
// Group payments by legacy student ID
const paymentsByStudent = {};
legacyPayments.forEach(p => {
  if (!paymentsByStudent[p.studentId]) {
    paymentsByStudent[p.studentId] = [];
  }
  paymentsByStudent[p.studentId].push(p);
});

// Sort payments chronologically per student
Object.keys(paymentsByStudent).forEach(sid => {
  paymentsByStudent[sid].sort((a, b) => new Date(a.paidDate || '') - new Date(b.paidDate || ''));
});

const studentBalanceTracker = {};
studentsData.forEach(s => {
  studentBalanceTracker[s._id] = s.totalDemand;
});

const feeReceiptsData = [];
const dailyAccountsData = [];
let receiptCount = 0;

legacyPayments.forEach((p) => {
  const legacyStudent = legacyStudents.find(s => s.id === p.studentId);
  if (!legacyStudent) return;

  const student = studentsData.find(s => s.admissionNo === legacyStudent.studentId);
  if (!student) return;

  const klass = classesData.find(c => c._id === student.classId);
  const className = klass ? `${klass.name} ${klass.section} (${klass.academicYear})` : '';

  const items = [];
  if (p.splitStructure) {
    if (p.splitStructure.admissionFees > 0) {
      items.push({ description: "Admission Fee", amount: p.splitStructure.admissionFees });
    }
    if (p.splitStructure.monthlyFees > 0) {
      items.push({ description: "Tuition Fee", amount: p.splitStructure.monthlyFees });
    }
    if (p.splitStructure.termFees > 0) {
      items.push({ description: "Examination Fee", amount: p.splitStructure.termFees });
    }
    if (p.splitStructure.msFees > 0) {
      items.push({ description: "Misc Fee", amount: p.splitStructure.msFees });
    }
  }

  if (items.length === 0) {
    items.push({ description: "School Fees", amount: p.amount });
  }

  const subTotal = items.reduce((sum, item) => sum + item.amount, 0);
  const amountPaid = p.amount;
  
  // Track outstanding balance reducing chronologically
  studentBalanceTracker[student._id] = (studentBalanceTracker[student._id] || student.totalDemand) - amountPaid;
  const balanceAfter = studentBalanceTracker[student._id];

  const status = balanceAfter <= 0 ? 'paid' : 'partial';

  let mode = (p.paymentMode || 'cash').toLowerCase();
  if (mode === 'cheque') mode = 'check';
  if (mode === 'neft') mode = 'online';

  const receiptId = nanoid();
  receiptCount++;

  const receiptDoc = {
    "_id": receiptId,
    "receiptNo": `RCP-2025-${String(receiptCount).padStart(8, '0')}`,
    "studentId": student._id,
    "studentName": `${student.firstName} ${student.lastName}`.trim(),
    "admissionNo": student.admissionNo,
    "className": className,
    "academicYear": student.academicYear,
    "date": p.paidDate || new Date().toISOString().slice(0, 10),
    "items": items,
    "subTotal": subTotal,
    "lateFee": 0,
    "discount": 0,
    "amountDue": subTotal,
    "amountPaid": amountPaid,
    "balance": balanceAfter,
    "mode": mode,
    "reference": p.transactionId || '',
    "remarks": p.remarks || '',
    "collectedBy": p.insertedBy || 'System Migrator',
    "status": status,
    "createdAt": new Date().toISOString()
  };

  feeReceiptsData.push(receiptDoc);

  if (amountPaid > 0) {
    dailyAccountsData.push({
      "_id": nanoid(),
      "date": receiptDoc.date,
      "type": "income",
      "category": "Fees",
      "description": `Fee receipt ${receiptDoc.receiptNo} — ${receiptDoc.studentName}`,
      "amount": amountPaid,
      "mode": mode,
      "recordedBy": receiptDoc.collectedBy,
      "receiptId": receiptId,
      "createdAt": new Date().toISOString()
    });
  }
});

fs.writeFileSync(path.join(dataDir, 'feeReceipts.json'), JSON.stringify(feeReceiptsData, null, 2));
fs.writeFileSync(path.join(dataDir, 'dailyAccounts.json'), JSON.stringify(dailyAccountsData, null, 2));
console.log(`Created ${feeReceiptsData.length} fee receipts and daily accounts.`);

// 8. Update settings.json
const settingsFile = path.join(dataDir, 'settings.json');
let settings = [];
if (fs.existsSync(settingsFile)) {
  settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
}
const schoolSettings = settings.find(s => s.key === 'school');
if (schoolSettings) {
  schoolSettings.value.schoolName = "M.V HIGH SCHOOL";
  schoolSettings.value.tagline = "Learn. Grow. Succeed.";
  schoolSettings.value.address = "S.V.P. ROAD, Charni Road, Bhatwadi, PRARTHNA SAMAJ, Mumbai, Maharashtra 400004";
  schoolSettings.value.phone = "022 2386 5845";
  schoolSettings.value.academicYear = "2026-2027";
}
fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
console.log('Updated settings.json with school name and academic year.');

// 9. Update counters.json
const countersFile = path.join(dataDir, 'counters.json');
let counters = [];
if (fs.existsSync(countersFile)) {
  counters = JSON.parse(fs.readFileSync(countersFile, 'utf8'));
}

const updateCounter = (key, value) => {
  const counter = counters.find(c => c.key === key);
  if (counter) {
    counter.value = value;
  }
};

updateCounter('admissionNo', studentsData.length);
updateCounter('studentUser', studentUsersData.length);
updateCounter('parentUser', parentUsersData.length);
updateCounter('receipt', receiptCount);
updateCounter('registration', 0);

fs.writeFileSync(countersFile, JSON.stringify(counters, null, 2));
console.log('Updated counters.json.');

console.log('🎉 Migration completed successfully!');
