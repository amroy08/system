import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { config } from '../config.js';
import { ensureMongoIndexes } from '../db/indexes.js';

const mode = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--verify') ? 'verify'
    : 'dry-run';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digest(rows) {
  const ordered = [...rows].sort((a, b) => String(a._id).localeCompare(String(b._id)));
  return createHash('sha256').update(JSON.stringify(canonical(ordered))).digest('hex');
}

async function loadSource() {
  const entries = await fs.readdir(config.dataDir, { withFileTypes: true });
  const collections = new Map();
  const errors = [];
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path.basename(entry.name, '.json');
    const file = path.join(config.dataDir, entry.name);
    let rows;
    try {
      rows = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      errors.push(`${entry.name}: invalid JSON (${error.message})`);
      continue;
    }
    if (!Array.isArray(rows)) {
      errors.push(`${entry.name}: collection must be a JSON array`);
      continue;
    }
    if (name === 'counters') {
      rows = rows.map((row) => row?._id || !row?.key ? row : { _id: `counter-${row.key}`, ...row });
    }
    const ids = new Set();
    for (const [index, row] of rows.entries()) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) errors.push(`${entry.name}[${index}]: record must be an object`);
      else if (!row._id) errors.push(`${entry.name}[${index}]: missing _id`);
      else if (ids.has(row._id)) errors.push(`${entry.name}: duplicate _id ${row._id}`);
      else ids.add(row._id);
    }
    collections.set(name, rows);
  }
  return { collections, errors };
}

function validateUnique(collections, collectionName, field, errors) {
  const seen = new Map();
  for (const row of collections.get(collectionName) || []) {
    const value = row[field];
    if (value === undefined || value === null || value === '') continue;
    if (seen.has(value)) errors.push(`${collectionName}: duplicate ${field} ${value}`);
    else seen.set(value, row._id);
  }
}

function validateCompositeUnique(collections, collectionName, fields, errors, { skipIncomplete = false } = {}) {
  const seen = new Map();
  for (const row of collections.get(collectionName) || []) {
    const missing = fields.filter((field) => row[field] === undefined || row[field] === null || row[field] === '');
    if (missing.length) {
      if (skipIncomplete) continue;
      errors.push(`${collectionName}/${row._id}: missing ${missing.join(', ')} for unique record key`);
      continue;
    }
    const values = fields.map((field) => String(row[field]));
    const key = JSON.stringify(values);
    if (seen.has(key)) errors.push(`${collectionName}: duplicate ${fields.join('+')} ${values.join(' / ')}`);
    else seen.set(key, row._id);
  }
}

function validateReferences(collections, errors) {
  const ids = (name) => new Set((collections.get(name) || []).map((row) => row._id));
  const classIds = ids('classes');
  const parentIds = ids('parents');
  const studentIds = ids('students');
  for (const student of collections.get('students') || []) {
    if (student.classId && !classIds.has(student.classId)) errors.push(`students/${student._id}: unknown classId ${student.classId}`);
    for (const parentId of student.parentIds || []) {
      if (!parentIds.has(parentId)) errors.push(`students/${student._id}: unknown parentId ${parentId}`);
    }
  }
  for (const receipt of collections.get('feeReceipts') || []) {
    if (receipt.studentId && !studentIds.has(receipt.studentId)) errors.push(`feeReceipts/${receipt._id}: unknown studentId ${receipt.studentId}`);
  }
  const receiptIds = ids('feeReceipts');
  for (const refund of collections.get('feeRefunds') || []) {
    if (refund.receiptId && !receiptIds.has(refund.receiptId)) errors.push(`feeRefunds/${refund._id}: unknown receiptId ${refund.receiptId}`);
  }
  for (const user of collections.get('users') || []) {
    if (user.role === 'student' && user.refId && !studentIds.has(user.refId)) errors.push(`users/${user._id}: unknown student refId ${user.refId}`);
    if (user.role === 'parent' && user.refId && !parentIds.has(user.refId)) errors.push(`users/${user._id}: unknown parent refId ${user.refId}`);
  }
}

async function verifyTarget(db, source) {
  const mismatches = [];
  for (const [name, rows] of source.entries()) {
    const targetRows = await db.collection(name).find({}).toArray();
    if (targetRows.length !== rows.length) mismatches.push(`${name}: source ${rows.length}, target ${targetRows.length}`);
    else if (digest(targetRows) !== digest(rows)) mismatches.push(`${name}: content checksum differs`);
  }
  if (mismatches.length) throw new Error(`Migration reconciliation failed:\n- ${mismatches.join('\n- ')}`);
  return { collections: source.size, records: [...source.values()].reduce((sum, rows) => sum + rows.length, 0) };
}

async function main() {
  const { collections, errors } = await loadSource();
  validateUnique(collections, 'users', 'username', errors);
  validateCompositeUnique(collections, 'users', ['role', 'refId'], errors, { skipIncomplete: true });
  validateUnique(collections, 'admissions', 'regNo', errors);
  validateUnique(collections, 'students', 'admissionNo', errors);
  validateUnique(collections, 'students', 'sourceAdmissionId', errors);
  validateUnique(collections, 'feeReceipts', 'receiptNo', errors);
  validateUnique(collections, 'feeReceipts', 'idempotencyKey', errors);
  validateUnique(collections, 'feeRefunds', 'receiptId', errors);
  validateUnique(collections, 'dailyAccounts', 'ledgerKey', errors);
  validateUnique(collections, 'attachments', 'storedName', errors);
  validateUnique(collections, 'emailDeliveries', 'uniqueKey', errors);
  validateUnique(collections, 'counters', 'key', errors);
  validateCompositeUnique(collections, 'attendance', ['classId', 'date'], errors);
  validateCompositeUnique(collections, 'marks', ['examId', 'classId', 'subjectId'], errors);
  validateCompositeUnique(collections, 'salarySlips', ['staffId', 'month'], errors);
  validateReferences(collections, errors);
  const records = [...collections.values()].reduce((sum, rows) => sum + rows.length, 0);
  console.log(`[migration] Source validated: ${collections.size} collections, ${records} records`);
  if (errors.length) throw new Error(`Source validation failed:\n- ${errors.join('\n- ')}`);
  if (mode === 'dry-run') {
    console.log('[migration] Dry run passed. No database changes were made.');
    return;
  }
  if (!config.mongoUri) throw new Error('MONGO_URI is required for --execute or --verify');
  const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  try {
    await client.connect();
    const db = client.db(config.mongoDbName);
    if (mode === 'execute') {
      const occupied = [];
      for (const name of collections.keys()) {
        const count = await db.collection(name).estimatedDocumentCount();
        if (count) occupied.push(`${name} (${count})`);
      }
      if (occupied.length) throw new Error(`Target database is not empty; migration refused:\n- ${occupied.join('\n- ')}`);
      for (const [name, rows] of collections.entries()) {
        if (rows.length) await db.collection(name).insertMany(rows, { ordered: false });
      }
      await ensureMongoIndexes(db);
    }
    const result = await verifyTarget(db, collections);
    console.log(`[migration] Reconciliation passed: ${result.collections} collections, ${result.records} records`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`[migration] ${error.message}`);
  process.exitCode = 1;
});
