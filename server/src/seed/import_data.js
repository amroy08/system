import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import {
  ADMISSION_CATEGORY,
  calculateAnnualFee,
} from '../utils/feeStructure.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');
const importTempDir = path.join(dataDir, 'import_temp');
const shouldApply = process.argv.includes('--apply');

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const makeId = () => Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`), 'utf8'));
const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const number = (value) => Number(value) || 0;
const fullName = (student) => `${student.firstName || ''} ${student.lastName || ''}`.trim();

function writeJsonAtomic(name, value) {
  const destination = path.join(dataDir, `${name}.json`);
  const temporary = `${destination}.importing`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, destination);
}

function classKey(name, section) {
  return `${normalize(name)}|${normalize(section)}`;
}

function parseSourceClass(value) {
  const label = String(value ?? '').trim();
  const match = label.match(/^(\d+)\s+([A-Za-z]+)$/);
  if (!match) throw new Error(`Unsupported class value: "${label}"`);
  const grade = Number(match[1]);
  if (grade === 11) return { grade, name: 'Old Students', section: match[2].toUpperCase(), old: true };
  if (grade < 1 || grade > 10) throw new Error(`Unsupported grade: ${grade}`);
  return { grade, name: `Grade ${grade}`, section: match[2].toUpperCase(), old: false };
}

function admissionCategoryForGrade(grade) {
  return grade === 1 || grade === 5 ? ADMISSION_CATEGORY.NEW : ADMISSION_CATEGORY.EXISTING;
}

function updateCategoryNote(notes, category) {
  const value = String(notes || '').trim();
  if (!value) return `Category: ${category}`;
  if (/Category:\s*(NEW_ADMISSION|EXISTING(?:_STUDENT)?)/i.test(value)) {
    return value.replace(/Category:\s*(NEW_ADMISSION|EXISTING(?:_STUDENT)?)/i, `Category: ${category}`);
  }
  return `${value}\nCategory: ${category}`;
}

function paymentDate(lastPaid) {
  const months = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };
  const month = months[normalize(lastPaid)];
  if (!month) return '2026-08-10';
  const year = month <= 3 ? 2027 : 2026;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function buildFeeStructures(classes, existingStructures) {
  const idByName = new Map(existingStructures.map((item) => [item.name, item._id]));
  const ids = (predicate) => classes.filter(predicate).map((item) => item._id);
  const prePrimaryIds = ids((item) => /nursery|kg|montessori/i.test(item.name));
  const primaryIds = ids((item) => /^Grade [1-4]$/.test(item.name));
  const secondaryIds = ids((item) => /^Grade (?:[5-9]|10)$/.test(item.name));
  const now = new Date().toISOString();
  const entries = [
    ['Admission Fee (Pre-primary)', 'one-time', 'one-time', 2000, prePrimaryIds],
    ['Monthly Fee (Pre-primary)', 'tuition', 'monthly', 1500, prePrimaryIds],
    ['Term Fee (Pre-primary)', 'exam', 'annual', 3000, prePrimaryIds],
    ['MS Fee (Pre-primary)', 'activity', 'annual', 2000, prePrimaryIds],
    ['School Kit (Pre-primary)', 'other', 'annual', 4500, prePrimaryIds],
    ['Admission Fee (Primary)', 'one-time', 'one-time', 2000, primaryIds],
    ['Monthly Fee (Primary)', 'tuition', 'monthly', 1500, primaryIds],
    ['Term Fee (Primary)', 'exam', 'bi-annual', 1500, primaryIds],
    ['MS Fee (Primary)', 'activity', 'annual', 2500, primaryIds],
    ['Admission Fee (Secondary)', 'one-time', 'one-time', 2200, secondaryIds],
    ['Monthly Fee (Secondary)', 'tuition', 'monthly', 1800, secondaryIds],
    ['Term Fee (Secondary)', 'exam', 'bi-annual', 1800, secondaryIds],
    ['MS Fee (Secondary)', 'activity', 'annual', 3600, secondaryIds],
  ];
  return entries.map(([name, category, frequency, amount, classIds]) => ({
    _id: idByName.get(name) || makeId(),
    name,
    category,
    frequency,
    amount,
    classIds,
    status: 'active',
    createdAt: now,
  }));
}

function validateSourceRecord(record, source) {
  const sourceTotal = number(record.Fees) + number(record['Old Balance']);
  const sourceOutstanding = number(record.Total) - number(record.Received);
  if (Math.abs(sourceTotal - number(record.Total)) > 0.01) {
    throw new Error(`${source} row ${record._sourceRow}: Total does not equal Fees + Old Balance`);
  }
  if (Math.abs(sourceOutstanding - number(record.Outstsnding)) > 0.01) {
    throw new Error(`${source} row ${record._sourceRow}: Outstanding does not equal Total - Received`);
  }
}

function nextUsername(prefix, usedNames) {
  let sequence = 1;
  while (usedNames.has(`${prefix}${sequence}`)) sequence += 1;
  const username = `${prefix}${sequence}`;
  usedNames.add(username);
  return username;
}

async function runImport() {
  const sources = ['primary', 'secondary', 'old'];
  const importedRows = [];
  for (const source of sources) {
    const file = path.join(importTempDir, `${source}.json`);
    if (!fs.existsSync(file)) throw new Error(`Missing prepared import file: ${file}`);
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const record of rows) {
      validateSourceRecord(record, source);
      importedRows.push({ source, record });
    }
  }
  if (!importedRows.length) throw new Error('No student rows found in prepared import files.');

  const existingStudents = readJson('students');
  const existingParents = readJson('parents');
  const existingUsers = readJson('users');
  const existingReceipts = readJson('feeReceipts');
  const existingAccounts = readJson('dailyAccounts');
  const existingClasses = readJson('classes');
  const existingCounters = readJson('counters');
  const existingStructures = readJson('feeStructures');
  const now = new Date().toISOString();

  const orderedMatch = existingStudents.length >= importedRows.length
    && importedRows.every(({ record }, index) => normalize(record.Name) === normalize(fullName(existingStudents[index])));
  const existingStudentsByName = new Map();
  for (const student of existingStudents) {
    const key = normalize(fullName(student));
    if (!existingStudentsByName.has(key)) existingStudentsByName.set(key, []);
    existingStudentsByName.get(key).push(student);
  }

  const classes = [...existingClasses];
  const classByKey = new Map(classes.map((item) => [classKey(item.name, item.section), item]));
  for (const { record } of importedRows) {
    const parsed = parseSourceClass(record.Class);
    const key = classKey(parsed.name, parsed.section);
    if (!classByKey.has(key)) {
      const created = {
        _id: makeId(),
        name: parsed.name,
        section: parsed.section,
        academicYear: '2026-2027',
        capacity: 70,
        room: '',
        status: 'active',
        createdAt: now,
      };
      classes.push(created);
      classByKey.set(key, created);
    }
  }

  const parentById = new Map(existingParents.map((item) => [item._id, item]));
  const receiptByStudentId = new Map(existingReceipts.map((item) => [item.studentId, item]));
  const accountByReceiptId = new Map(existingAccounts.filter((item) => item.receiptId).map((item) => [item.receiptId, item]));
  const usedStudentIds = new Set();
  const usedParentIds = new Set();
  const students = [];
  const receipts = [];
  const accounts = [];
  let correctedRows = 0;
  let overpaymentCredits = 0;

  for (let index = 0; index < importedRows.length; index += 1) {
    const { source, record } = importedRows[index];
    const parsedClass = parseSourceClass(record.Class);
    const klass = classByKey.get(classKey(parsedClass.name, parsedClass.section));
    const category = admissionCategoryForGrade(parsedClass.grade);
    const current = orderedMatch
      ? existingStudents[index]
      : (existingStudentsByName.get(normalize(record.Name)) || []).find((item) => !usedStudentIds.has(item._id));
    const sourceName = String(record.Name).trim().replace(/\s+/g, ' ');
    const parts = sourceName.split(' ');
    const currentFee = parsedClass.old
      ? number(record.Fees)
      : calculateAnnualFee(parsedClass.name, category);
    const totalDemand = currentFee + number(record['Old Balance']);
    const received = number(record.Received);
    const balance = totalDemand - received;
    if (currentFee !== number(record.Fees)) correctedRows += 1;
    if (balance < 0) overpaymentCredits += Math.abs(balance);

    const studentId = current?._id || makeId();
    usedStudentIds.add(studentId);
    const parentIds = (current?.parentIds || []).filter((id) => parentById.has(id));
    if (!parentIds.length) throw new Error(`${source} row ${record._sourceRow}: no existing parent could be matched safely`);
    parentIds.forEach((id) => usedParentIds.add(id));

    const student = {
      ...(current || {}),
      _id: studentId,
      admissionNo: current?.admissionNo || `2026-${String(index + 1).padStart(8, '0')}`,
      firstName: current?.firstName || parts[0],
      lastName: current?.lastName ?? parts.slice(1).join(' '),
      classId: klass._id,
      parentIds,
      academicYear: '2026-2027',
      status: current?.status || 'active',
      admissionCategory: category,
      totalDemand,
      medicalNotes: updateCategoryNote(current?.medicalNotes, category),
      createdAt: current?.createdAt || now,
    };
    students.push(student);

    if (received > 0) {
      const previousReceipt = receiptByStudentId.get(studentId);
      const receiptId = previousReceipt?._id || makeId();
      const receiptNo = previousReceipt?.receiptNo || `RCP-2026-${String(receipts.length + 1).padStart(8, '0')}`;
      const receipt = {
        _id: receiptId,
        receiptNo,
        studentId,
        studentName: fullName(student),
        admissionNo: student.admissionNo,
        className: `${klass.name} ${klass.section} (${klass.academicYear})`,
        academicYear: klass.academicYear,
        date: paymentDate(record['Last paid']),
        items: [{ description: 'Imported cumulative fee payment', amount: received }],
        subTotal: received,
        lateFee: 0,
        discount: 0,
        amountDue: received,
        amountPaid: received,
        balance,
        previousYearArrears: number(record['Old Balance']),
        currentGradeFeeRate: currentFee,
        totalDemand,
        totalPaidLifetime: received,
        mode: previousReceipt?.mode || 'cash',
        reference: previousReceipt?.reference || '',
        remarks: `Imported cumulative payment; source supplied last-paid month: ${record['Last paid'] || 'not provided'}`,
        collectedBy: previousReceipt?.collectedBy || 'Admin User',
        status: balance <= 0 ? 'paid' : 'partial',
        createdAt: previousReceipt?.createdAt || now,
      };
      receipts.push(receipt);
      const previousAccount = accountByReceiptId.get(receiptId);
      accounts.push({
        _id: previousAccount?._id || makeId(),
        date: receipt.date,
        type: 'income',
        category: 'Fees',
        description: `Fee receipt ${receiptNo} — ${receipt.studentName}`,
        amount: received,
        mode: receipt.mode,
        recordedBy: receipt.collectedBy,
        receiptId,
        createdAt: previousAccount?.createdAt || now,
      });
    }
  }

  const parents = existingParents.filter((item) => usedParentIds.has(item._id));
  const staffUsers = existingUsers.filter((item) => !['student', 'parent'].includes(item.role));
  const existingStudentUsers = new Map(existingUsers.filter((item) => item.role === 'student').map((item) => [item.refId, item]));
  const existingParentUsers = new Map(existingUsers.filter((item) => item.role === 'parent').map((item) => [item.refId, item]));
  const usedNames = new Set(staffUsers.map((item) => item.username));
  const studentPasswordHash = bcrypt.hashSync('student123', 10);
  const parentPasswordHash = bcrypt.hashSync('parent123', 10);
  const studentUsers = students.map((student) => {
    const existing = existingStudentUsers.get(student._id);
    const username = existing?.username || nextUsername('student', usedNames);
    usedNames.add(username);
    return existing || {
      _id: makeId(), username, fullName: fullName(student), role: 'student', status: 'active',
      refId: student._id, passwordHash: studentPasswordHash, createdAt: now,
    };
  });
  const parentUsers = parents.map((parent) => {
    const existing = existingParentUsers.get(parent._id);
    const username = existing?.username || nextUsername('parent', usedNames);
    usedNames.add(username);
    return existing || {
      _id: makeId(), username, fullName: parent.name, role: 'parent', status: 'active',
      refId: parent._id, email: parent.email || '', mobile: parent.mobile || '',
      passwordHash: parentPasswordHash, createdAt: now,
    };
  });
  const users = [...staffUsers, ...parentUsers, ...studentUsers];
  const feeStructures = buildFeeStructures(classes, existingStructures);
  const counters = existingCounters.map((counter) => {
    const values = {
      admissionNo: students.length,
      studentUser: studentUsers.length,
      parentUser: parentUsers.length,
      receipt: receipts.length,
    };
    return Object.hasOwn(values, counter.key) ? { ...counter, value: values[counter.key], updatedAt: now } : counter;
  });

  const summary = {
    mode: shouldApply ? 'apply' : 'dry-run',
    students: students.length,
    parents: parents.length,
    receipts: receipts.length,
    classesAdded: classes.length - existingClasses.length,
    feeRowsCorrected: correctedRows,
    overpaymentCreditTotal: overpaymentCredits,
    removedUnmatchedStudents: existingStudents.length - students.length,
  };
  console.log(JSON.stringify(summary));
  if (!shouldApply) return;

  writeJsonAtomic('classes', classes);
  writeJsonAtomic('feeStructures', feeStructures);
  writeJsonAtomic('students', students);
  writeJsonAtomic('parents', parents);
  writeJsonAtomic('users', users);
  writeJsonAtomic('feeReceipts', receipts);
  writeJsonAtomic('dailyAccounts', accounts);
  writeJsonAtomic('counters', counters);
}

runImport().catch((error) => {
  console.error(`Import failed: ${error.message}`);
  process.exitCode = 1;
});
