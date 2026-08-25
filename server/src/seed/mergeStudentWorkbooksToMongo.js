import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';
import { ADMISSION_CATEGORY } from '../utils/feeStructure.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultImportDir = path.join(__dirname, '..', '..', 'data', 'import_temp');
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const createNew = args.has('--create-new');
const importDirArg = process.argv.find((arg) => arg.startsWith('--import-dir='));
const importDir = importDirArg ? path.resolve(importDirArg.split('=').slice(1).join('=')) : defaultImportDir;

const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const titleCase = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
const number = (value) => Number(value) || 0;
const digits = (value) => String(value ?? '').replace(/\D/g, '');
const fullName = (student) => `${student.firstName || ''} ${student.lastName || ''}`.trim();
const classLabel = (klass) => klass ? `${klass.name || ''} ${klass.section || ''}`.trim() : '';

function parseSourceClass(value) {
  const label = String(value ?? '').trim();
  const match = label.match(/^(\d+)\s+([A-Za-z]+)$/);
  if (!match) return { label, valid: false };
  const grade = Number(match[1]);
  const section = match[2].toUpperCase();
  if (grade === 11) return { grade, name: 'Old Students', section, valid: true, old: true };
  return { grade, name: `Grade ${grade}`, section, valid: grade >= 1 && grade <= 10, old: false };
}

function validateRecord(record) {
  const errors = [];
  const sourceTotal = number(record.Fees) + number(record['Old Balance']);
  const sourceOutstanding = number(record.Total) - number(record.Received);
  if (!normalize(record.Name)) errors.push('missing_name');
  if (!parseSourceClass(record.Class).valid) errors.push('invalid_class');
  if (Math.abs(sourceTotal - number(record.Total)) > 0.01) errors.push('total_mismatch');
  if (Math.abs(sourceOutstanding - number(record.Outstsnding)) > 0.01) errors.push('outstanding_mismatch');
  return errors;
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

function importKeyFor(record) {
  const parsed = parseSourceClass(record.Class);
  return `${normalize(record.Name)}|${normalize(`${parsed.name} ${parsed.section}`)}`;
}

function workbookSnapshot(source, record) {
  return {
    source,
    row: record._sourceRow,
    name: String(record.Name || '').trim().replace(/\s+/g, ' '),
    class: String(record.Class || '').trim(),
    contact: String(record.Contact || '').trim(),
    fees: number(record.Fees),
    oldBalance: number(record['Old Balance']),
    total: number(record.Total),
    received: number(record.Received),
    outstanding: number(record.Outstsnding),
    lastPaid: String(record['Last paid'] || '').trim(),
    importedAt: new Date().toISOString(),
  };
}

async function nextSeq(db, key) {
  const result = await db.collection('counters').findOneAndUpdate(
    { key },
    {
      $inc: { value: 1 },
      $setOnInsert: { _id: nanoid(12), createdAt: new Date().toISOString() },
      $set: { updatedAt: new Date().toISOString() },
    },
    { upsert: true, returnDocument: 'after' }
  );
  return result.value.value;
}

function loadImportedRows() {
  const sources = ['primary', 'secondary', 'old'];
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

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  if (!process.env.MONGO_DB_NAME) throw new Error('MONGO_DB_NAME is required');

  const importedRows = loadImportedRows();
  const duplicateImportKeys = new Set();
  const seenImportKeys = new Map();
  for (const { record } of importedRows) {
    const key = importKeyFor(record);
    seenImportKeys.set(key, (seenImportKeys.get(key) || 0) + 1);
    if (seenImportKeys.get(key) > 1) duplicateImportKeys.add(key);
  }

  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db(process.env.MONGO_DB_NAME);

  const [students, classes, parents] = await Promise.all([
    db.collection('students').find({}).toArray(),
    db.collection('classes').find({}).toArray(),
    db.collection('parents').find({}).toArray(),
  ]);

  const classById = new Map(classes.map((item) => [item._id, item]));
  const classByLabel = new Map(classes.map((item) => [normalize(classLabel(item)), item]));
  const parentsByPhone = new Map();
  for (const parent of parents) {
    const phone = digits(parent.mobile);
    if (phone) parentsByPhone.set(phone.slice(-10), parent);
  }

  const studentsByName = new Map();
  const studentsByNameClass = new Map();
  for (const student of students) {
    const nameKey = normalize(fullName(student));
    const nameClassKey = `${nameKey}|${normalize(classLabel(classById.get(student.classId)))}`;
    if (!studentsByName.has(nameKey)) studentsByName.set(nameKey, []);
    if (!studentsByNameClass.has(nameClassKey)) studentsByNameClass.set(nameClassKey, []);
    studentsByName.get(nameKey).push(student);
    studentsByNameClass.get(nameClassKey).push(student);
  }

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    createNew,
    importedRows: importedRows.length,
    updated: 0,
    wouldUpdate: 0,
    created: 0,
    wouldCreate: 0,
    skippedDuplicateRows: 0,
    skippedAmbiguous: 0,
    skippedInvalid: 0,
    skippedNewRows: 0,
    unchangedOnlineOnlyStudents: 0,
    samples: {
      invalid: [],
      duplicateRows: [],
      ambiguous: [],
      newRows: [],
      updated: [],
    },
  };

  const matchedStudentIds = new Set();
  const now = new Date().toISOString();

  for (const { source, record } of importedRows) {
    const validationErrors = validateRecord(record);
    const parsed = parseSourceClass(record.Class);
    const sourceName = String(record.Name || '').trim().replace(/\s+/g, ' ');
    const sourceKey = importKeyFor(record);

    if (validationErrors.length) {
      summary.skippedInvalid += 1;
      if (summary.samples.invalid.length < 10) {
        summary.samples.invalid.push({ source, row: record._sourceRow, name: sourceName, class: record.Class, errors: validationErrors });
      }
      continue;
    }

    if (duplicateImportKeys.has(sourceKey)) {
      summary.skippedDuplicateRows += 1;
      if (summary.samples.duplicateRows.length < 10) {
        summary.samples.duplicateRows.push({ source, row: record._sourceRow, name: sourceName, class: record.Class });
      }
      continue;
    }

    const klass = classByLabel.get(normalize(`${parsed.name} ${parsed.section}`));
    if (!klass) {
      summary.skippedInvalid += 1;
      if (summary.samples.invalid.length < 10) {
        summary.samples.invalid.push({ source, row: record._sourceRow, name: sourceName, class: record.Class, errors: ['missing_target_class'] });
      }
      continue;
    }

    const exact = studentsByNameClass.get(sourceKey) || [];
    const sameName = studentsByName.get(normalize(sourceName)) || [];
    const matched = exact.length === 1 ? exact[0] : exact.length === 0 && sameName.length === 1 ? sameName[0] : null;

    if (!matched) {
      if (exact.length > 1 || sameName.length > 1) {
        summary.skippedAmbiguous += 1;
        if (summary.samples.ambiguous.length < 10) {
          summary.samples.ambiguous.push({ source, row: record._sourceRow, name: sourceName, class: record.Class, matches: Math.max(exact.length, sameName.length) });
        }
        continue;
      }

      if (!createNew) {
        summary.skippedNewRows += 1;
        if (summary.samples.newRows.length < 10) {
          summary.samples.newRows.push({ source, row: record._sourceRow, name: sourceName, class: record.Class, contactLast4: digits(record.Contact).slice(-4) });
        }
        continue;
      }

      const parts = titleCase(sourceName).split(' ');
      const phone = digits(record.Contact).slice(-10);
      let parent = phone ? parentsByPhone.get(phone) : null;
      if (apply && !parent) {
        parent = await db.collection('parents').insertOne({
          _id: nanoid(12),
          name: `${titleCase(sourceName)} Parent`,
          relation: 'Guardian',
          mobile: phone,
          email: '',
          address: '',
          status: 'active',
          createdAt: now,
        }).then((result) => ({ _id: result.insertedId, mobile: phone }));
      }
      const admissionSeq = apply ? await nextSeq(db, 'admission') : 0;
      const studentDoc = {
        _id: nanoid(12),
        admissionNo: apply ? `${new Date().getFullYear()}-${String(admissionSeq).padStart(8, '0')}` : 'DRY-RUN',
        firstName: parts[0] || titleCase(sourceName),
        lastName: parts.slice(1).join(' '),
        classId: klass._id,
        parentIds: parent?._id ? [parent._id] : [],
        academicYear: klass.academicYear || '2026-2027',
        status: parsed.old ? 'passed-out' : 'active',
        admissionCategory: admissionCategoryForGrade(parsed.grade),
        totalDemand: number(record.Total),
        medicalNotes: `Category: ${admissionCategoryForGrade(parsed.grade)}`,
        importedWorkbook: workbookSnapshot(source, record),
        createdAt: now,
        updatedAt: now,
      };
      if (apply) await db.collection('students').insertOne(studentDoc);
      summary[apply ? 'created' : 'wouldCreate'] += 1;
      continue;
    }

    matchedStudentIds.add(matched._id);
    const category = admissionCategoryForGrade(parsed.grade);
    const changes = {
      classId: klass._id,
      academicYear: klass.academicYear || '2026-2027',
      status: parsed.old ? 'passed-out' : (matched.status || 'active'),
      admissionCategory: category,
      totalDemand: number(record.Total),
      medicalNotes: updateCategoryNote(matched.medicalNotes, category),
      importedWorkbook: workbookSnapshot(source, record),
      updatedAt: now,
    };
    if (apply) await db.collection('students').updateOne({ _id: matched._id }, { $set: changes });
    summary[apply ? 'updated' : 'wouldUpdate'] += 1;
    if (summary.samples.updated.length < 10) {
      summary.samples.updated.push({
        name: sourceName,
        fromClass: classLabel(classById.get(matched.classId)),
        toClass: classLabel(klass),
        totalDemand: changes.totalDemand,
      });
    }
  }

  summary.unchangedOnlineOnlyStudents = students.filter((student) => !matchedStudentIds.has(student._id)).length;
  console.log(JSON.stringify(summary, null, 2));
  await client.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
