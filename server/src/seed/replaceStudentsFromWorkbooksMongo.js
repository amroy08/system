import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';
import { ADMISSION_CATEGORY } from '../utils/feeStructure.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');
const defaultImportDir = path.join(dataDir, 'import_temp');
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const importDirArg = process.argv.find((arg) => arg.startsWith('--import-dir='));
const importDir = importDirArg ? path.resolve(importDirArg.split('=').slice(1).join('=')) : defaultImportDir;
const sources = ['primary', 'secondary', 'old'];

const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const titleCase = (value) => clean(value).toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
const number = (value) => Number(value) || 0;
const digits = (value) => String(value ?? '').replace(/\D/g, '');
const classLabel = (klass) => klass ? `${klass.name || ''} ${klass.section || ''}`.trim() : '';

function parseSourceClass(value) {
  const label = clean(value);
  const match = label.match(/^(\d+)\s+([A-Za-z]+)$/);
  if (!match) return { label, valid: false };
  const grade = Number(match[1]);
  const section = match[2].toUpperCase();
  if (grade === 11) return { grade, name: 'Old Students', section, valid: true, old: true };
  return { grade, name: `Grade ${grade}`, section, valid: grade >= 1 && grade <= 10, old: false };
}

function admissionCategoryForGrade(grade) {
  return grade === 1 || grade === 5 ? ADMISSION_CATEGORY.NEW : ADMISSION_CATEGORY.EXISTING;
}

function validateRecord(record) {
  const errors = [];
  const sourceTotal = number(record.Fees) + number(record['Old Balance']);
  const sourceOutstanding = number(record.Total) - number(record.Received);
  if (!clean(record.Name)) errors.push('missing_name');
  if (!parseSourceClass(record.Class).valid) errors.push('invalid_class');
  if (Math.abs(sourceTotal - number(record.Total)) > 0.01) errors.push('total_mismatch');
  if (Math.abs(sourceOutstanding - number(record.Outstsnding)) > 0.01) errors.push('outstanding_mismatch');
  return errors;
}

function paymentDate(lastPaid) {
  const months = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  const month = months[normalize(lastPaid)];
  if (!month) return '2026-08-10';
  const year = month <= 3 ? 2027 : 2026;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function phoneNumbers(value) {
  const chunks = String(value ?? '').split(/[\/,;&]+/).map(digits).filter(Boolean);
  return [...new Set(chunks.map((item) => item.length > 10 ? item.slice(-10) : item).filter((item) => item.length >= 6))];
}

function workbookSnapshot(source, record) {
  return {
    source,
    row: record._sourceRow,
    name: clean(record.Name),
    class: clean(record.Class),
    contact: clean(record.Contact),
    fees: number(record.Fees),
    oldBalance: number(record['Old Balance']),
    total: number(record.Total),
    received: number(record.Received),
    outstanding: number(record.Outstsnding),
    lastPaid: clean(record['Last paid']),
    importedAt: new Date().toISOString(),
  };
}

function loadRows() {
  const rows = [];
  for (const source of sources) {
    const file = path.join(importDir, `${source}.json`);
    if (!fs.existsSync(file)) throw new Error(`Missing prepared import file: ${file}`);
    for (const record of JSON.parse(fs.readFileSync(file, 'utf8'))) {
      rows.push({ source, record });
    }
  }
  return rows;
}

function nextAdmissionNo(index) {
  return `2026-${String(index + 1).padStart(8, '0')}`;
}

function nextReceiptNo(index) {
  return `RCP-2026-${String(index + 1).padStart(8, '0')}`;
}

async function clearStudentDomain(db) {
  const deletions = {};
  const del = async (name, query = {}) => {
    const exists = await db.listCollections({ name }).hasNext();
    if (!exists) return 0;
    return (await db.collection(name).deleteMany(query)).deletedCount;
  };

  deletions.students = await del('students');
  deletions.parents = await del('parents');
  deletions.admissions = await del('admissions');
  deletions.studentParentUsers = await del('users', { role: { $in: ['student', 'parent'] } });
  deletions.feeReceipts = await del('feeReceipts');
  deletions.feeRefunds = await del('feeRefunds');
  deletions.dailyFeeAccounts = await del('dailyAccounts', { $or: [{ category: 'Fees' }, { receiptId: { $exists: true } }] });
  deletions.attendance = await del('attendance');
  deletions.marks = await del('marks');
  deletions.studentAttachments = await del('attachments', { scope: 'studentDocument' });
  for (const name of ['bookIssues', 'discipline', 'conduct', 'activities', 'helpdesk', 'complaints', 'documents', 'whatsappReminderLogs']) {
    deletions[name] = await del(name, {
      $or: [
        { studentId: { $exists: true } },
        { memberId: { $exists: true } },
        { hostId: { $exists: true } },
        { entityType: 'student' },
      ],
    });
  }
  deletions.studentEmailDeliveries = await del('emailDeliveries', { entityType: { $in: ['student', 'admission', 'feeReceipt'] } });
  return deletions;
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  if (!process.env.MONGO_DB_NAME) throw new Error('MONGO_DB_NAME is required');

  const importedRows = loadRows();
  const invalid = [];
  const validRows = [];
  for (const item of importedRows) {
    const errors = validateRecord(item.record);
    if (errors.length) invalid.push({ source: item.source, row: item.record._sourceRow, name: item.record.Name, class: item.record.Class, errors });
    else validRows.push(item);
  }

  const duplicateKeys = new Map();
  for (const { record } of validRows) {
    const key = `${normalize(record.Name)}|${normalize(record.Class)}`;
    duplicateKeys.set(key, (duplicateKeys.get(key) || 0) + 1);
  }
  const duplicateRows = validRows
    .filter(({ record }) => duplicateKeys.get(`${normalize(record.Name)}|${normalize(record.Class)}`) > 1)
    .map(({ source, record }) => ({ source, row: record._sourceRow, name: clean(record.Name), class: clean(record.Class) }));

  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db(process.env.MONGO_DB_NAME);
  const classes = await db.collection('classes').find({}).toArray();
  const classByLabel = new Map(classes.map((item) => [normalize(classLabel(item)), item]));
  const missingClasses = [...new Set(validRows.map(({ record }) => {
    const parsed = parseSourceClass(record.Class);
    return classByLabel.has(normalize(`${parsed.name} ${parsed.section}`)) ? null : `${parsed.name} ${parsed.section}`;
  }).filter(Boolean))];

  const paidRows = validRows.filter(({ record }) => number(record.Received) > 0);
  const parentPhoneKeys = new Set(validRows.flatMap(({ record }) => phoneNumbers(record.Contact).slice(0, 1)));
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    importedRows: importedRows.length,
    validRows: validRows.length,
    invalidRows: invalid.length,
    duplicateNameClassRows: duplicateRows.length,
    studentsToCreate: validRows.length,
    parentsToCreate: parentPhoneKeys.size,
    receiptsToCreate: paidRows.length,
    missingClasses,
    invalidSamples: invalid.slice(0, 10),
    duplicateSamples: duplicateRows.slice(0, 10),
    paymentSamples: paidRows.slice(0, 10).map(({ source, record }) => ({
      source,
      row: record._sourceRow,
      name: clean(record.Name),
      class: clean(record.Class),
      received: number(record.Received),
      outstanding: number(record.Outstsnding),
      lastPaid: clean(record['Last paid']),
    })),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!apply) {
    await client.close();
    return;
  }
  if (invalid.length) throw new Error('Cannot apply replacement while invalid rows exist');
  if (missingClasses.length) throw new Error(`Cannot apply replacement; missing classes: ${missingClasses.join(', ')}`);

  const now = new Date().toISOString();
  const deletions = await clearStudentDomain(db);
  const parentByPhone = new Map();
  const parentDocs = [];
  const studentDocs = [];
  const receiptDocs = [];
  const accountDocs = [];

  for (let index = 0; index < validRows.length; index += 1) {
    const { source, record } = validRows[index];
    const parsed = parseSourceClass(record.Class);
    const klass = classByLabel.get(normalize(`${parsed.name} ${parsed.section}`));
    const sourceName = clean(record.Name);
    const parts = titleCase(sourceName).split(' ');
    const phones = phoneNumbers(record.Contact);
    const primaryPhone = phones[0] || '';
    let parentId = '';

    if (primaryPhone) {
      if (!parentByPhone.has(primaryPhone)) {
        const parent = {
          _id: nanoid(12),
          name: `${titleCase(sourceName)} Parent`,
          relation: 'Guardian',
          mobile: primaryPhone,
          alternateMobile: phones.slice(1).join(' / '),
          email: '',
          address: '',
          status: 'active',
          source: 'legacy-workbook-replace',
          createdAt: now,
          updatedAt: now,
        };
        parentByPhone.set(primaryPhone, parent);
        parentDocs.push(parent);
      }
      parentId = parentByPhone.get(primaryPhone)._id;
    }

    const admissionCategory = admissionCategoryForGrade(parsed.grade);
    const student = {
      _id: nanoid(12),
      admissionNo: nextAdmissionNo(index),
      firstName: parts[0] || titleCase(sourceName),
      lastName: parts.slice(1).join(' '),
      gender: 'Male',
      dob: '',
      nationality: 'Indian',
      curriculum: 'IB PYP',
      englishLevel: 'NATIVE',
      house: '',
      classId: klass._id,
      rollNo: String(record.SN || index + 1),
      admissionDate: '',
      academicYear: klass.academicYear || '2026-2027',
      status: parsed.old ? 'passed-out' : 'active',
      parentIds: parentId ? [parentId] : [],
      parentName: parentId ? parentByPhone.get(primaryPhone).name : '',
      parentRelation: parentId ? 'Guardian' : '',
      parentMobile: primaryPhone,
      alternateContact: phones.slice(1).join(' / '),
      address: '',
      admissionCategory,
      totalDemand: number(record.Total),
      medicalNotes: `Category: ${admissionCategory}`,
      importedWorkbook: workbookSnapshot(source, record),
      sourceSystem: 'legacy-workbook-replace',
      createdAt: now,
      updatedAt: now,
    };
    studentDocs.push(student);

    const received = number(record.Received);
    if (received > 0) {
      const balance = Math.max(0, number(record.Outstsnding));
      const receipt = {
        _id: nanoid(12),
        receiptNo: nextReceiptNo(receiptDocs.length),
        studentId: student._id,
        studentName: sourceName,
        admissionNo: student.admissionNo,
        className: `${klass.name} ${klass.section} (${klass.academicYear || student.academicYear})`,
        academicYear: klass.academicYear || student.academicYear,
        date: paymentDate(record['Last paid']),
        items: [{ description: 'Imported opening fee payment from legacy ERP', amount: received }],
        subTotal: received,
        lateFee: 0,
        discount: 0,
        amountDue: received,
        amountPaid: received,
        balance,
        previousYearArrears: number(record['Old Balance']),
        currentGradeFeeRate: number(record.Fees),
        totalDemand: number(record.Total),
        totalPaidLifetime: received,
        mode: 'cash',
        reference: '',
        remarks: `Imported opening payment from legacy ERP (${source}.xlsx row ${record._sourceRow}); source supplied last-paid month: ${clean(record['Last paid']) || 'not provided'}`,
        collectedBy: 'Legacy ERP Import',
        status: balance <= 0 ? 'paid' : 'partial',
        idempotencyKey: `legacy-replace:${source}:${record._sourceRow}`,
        createdAt: now,
        updatedAt: now,
      };
      receiptDocs.push(receipt);
      accountDocs.push({
        _id: nanoid(12),
        ledgerKey: `fee-income:${receipt._id}`,
        date: receipt.date,
        type: 'income',
        category: 'Fees',
        description: `Fee receipt ${receipt.receiptNo} — ${receipt.studentName}`,
        amount: receipt.amountPaid,
        mode: receipt.mode,
        recordedBy: receipt.collectedBy,
        receiptId: receipt._id,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (parentDocs.length) await db.collection('parents').insertMany(parentDocs, { ordered: false });
  if (studentDocs.length) await db.collection('students').insertMany(studentDocs, { ordered: false });
  if (receiptDocs.length) await db.collection('feeReceipts').insertMany(receiptDocs, { ordered: false });
  if (accountDocs.length) await db.collection('dailyAccounts').insertMany(accountDocs, { ordered: false });
  await db.collection('counters').updateOne({ key: 'admissionNo' }, { $set: { value: studentDocs.length, updatedAt: now }, $setOnInsert: { _id: nanoid(12), createdAt: now } }, { upsert: true });
  await db.collection('counters').updateOne({ key: 'receipt' }, { $set: { value: receiptDocs.length, updatedAt: now }, $setOnInsert: { _id: nanoid(12), createdAt: now } }, { upsert: true });

  console.log(JSON.stringify({
    applied: {
      deletions,
      parentsCreated: parentDocs.length,
      studentsCreated: studentDocs.length,
      receiptsCreated: receiptDocs.length,
      dailyAccountsCreated: accountDocs.length,
    },
  }, null, 2));
  await client.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
