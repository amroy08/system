import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { MongoClient } from 'mongodb';
import { config } from '../config.js';
import { flushDb, reloadDb } from '../db/index.js';
import { isOffsiteBackupConfigured, replicateBackup } from './backupReplica.js';

const FORMAT_VERSION = 1;
const backupRoot = path.join(config.dataDir, 'backups', 'system');
const auditFile = path.join(backupRoot, 'backup-audit.jsonl');
let operationRunning = false;
let nextScheduledAt = null;

function backupId(type, date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${type}-${stamp}`;
}

function assertBackupId(id) {
  if (!/^[a-z][a-z0-9-]*-\d{8}T\d{6}Z$/.test(String(id || ''))) {
    throw new Error('Invalid backup identifier');
  }
  const directory = path.resolve(backupRoot, id);
  if (path.dirname(directory) !== path.resolve(backupRoot)) throw new Error('Invalid backup location');
  return directory;
}

function hashFile(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, file);
}

function copyFileAtomic(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  fs.copyFileSync(source, temporary);
  fs.renameSync(temporary, destination);
}

function listFiles(directory, prefix = '') {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolute, relative));
    else if (entry.isFile()) files.push({ relative, absolute });
  }
  return files;
}

function snapshotFiles(directory) {
  return listFiles(directory)
    .filter(({ relative }) => relative !== 'manifest.json')
    .map(({ relative, absolute }) => {
      const stat = fs.statSync(absolute);
      return { path: relative.split(path.sep).join('/'), bytes: stat.size, sha256: hashFile(absolute) };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function appendAudit(event) {
  fs.mkdirSync(backupRoot, { recursive: true });
  fs.appendFileSync(auditFile, `${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`);
}

function readManifest(directory) {
  const manifestPath = path.join(directory, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('Backup manifest is missing');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function copyTree(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, destination, { recursive: true, force: true, errorOnExist: false });
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let errorText = '';
    child.stderr.on('data', (chunk) => { errorText += chunk.toString(); });
    child.on('error', (error) => reject(new Error(`${command} is unavailable: ${error.message}`)));
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} failed: ${errorText.trim() || `exit ${code}`}`)));
  });
}

async function dumpMongoJson(destination) {
  const client = new MongoClient(config.mongoUri);
  try {
    await client.connect();
    const db = client.db(config.mongoDbName);
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const exportRoot = path.join(destination, 'mongo-json');
    fs.mkdirSync(exportRoot, { recursive: true });
    for (const { name } of collections.sort((a, b) => a.name.localeCompare(b.name))) {
      if (name.startsWith('system.')) continue;
      const docs = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
      writeJsonAtomic(path.join(exportRoot, `${name}.json`), {
        collection: name,
        exportedAt: new Date().toISOString(),
        documentCount: docs.length,
        documents: JSON.parse(JSON.stringify(docs)),
      });
    }
  } finally {
    await client.close();
  }
}

async function dumpMongo(destination) {
  try {
    await runProcess('mongodump', [
      `--uri=${config.mongoUri}`,
      `--db=${config.mongoDbName}`,
      `--archive=${path.join(destination, 'mongo.archive.gz')}`,
      '--gzip',
    ]);
  } catch (error) {
    if (!error.message.includes('mongodump is unavailable')) throw error;
    await dumpMongoJson(destination);
  }
}

function applyRetention() {
  const groups = { scheduled: config.backupRetention, 'pre-restore': 10 };
  const backups = listBackups();
  for (const [type, keep] of Object.entries(groups)) {
    for (const backup of backups.filter((item) => item.type === type).slice(keep)) {
      fs.rmSync(assertBackupId(backup.id), { recursive: true, force: true });
      appendAudit({ action: 'retention-delete', backupId: backup.id, actor: 'System' });
    }
  }
}

async function createBackupUnsafe({ type = 'manual', createdBy = 'System', reason = '' } = {}) {
  if (config.dbDriver === 'file') await flushDb();
  fs.mkdirSync(backupRoot, { recursive: true });
  let offset = 0;
  let id = backupId(type);
  let directory = assertBackupId(id);
  while (fs.existsSync(directory)) {
    offset += 1000;
    id = backupId(type, new Date(Date.now() + offset));
    directory = assertBackupId(id);
  }
  const backupData = path.join(directory, 'data');
  fs.mkdirSync(backupData, { recursive: true });

  if (config.dbDriver === 'file') {
    const dataFiles = fs.readdirSync(config.dataDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
    for (const entry of dataFiles) {
      fs.copyFileSync(path.join(config.dataDir, entry.name), path.join(backupData, entry.name));
    }
  } else if (config.dbDriver === 'mongo') {
    await dumpMongo(backupData);
  } else {
    throw new Error(`Unsupported database driver: ${config.dbDriver}`);
  }
  if (config.storageDriver === 'local' && fs.existsSync(config.uploadsDir)) copyTree(config.uploadsDir, path.join(directory, 'uploads'));

  const files = snapshotFiles(directory);
  const manifest = {
    formatVersion: FORMAT_VERSION,
    id,
    type,
    createdAt: new Date().toISOString(),
    createdBy: String(createdBy || 'System').slice(0, 120),
    reason: String(reason || '').slice(0, 300),
    driver: config.dbDriver,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
  writeJsonAtomic(path.join(directory, 'manifest.json'), manifest);
  try {
    manifest.offsite = await replicateBackup(directory, manifest);
    writeJsonAtomic(path.join(directory, 'manifest.json'), manifest);
  } catch (error) {
    manifest.offsite = { status: 'failed', error: error.message, attemptedAt: new Date().toISOString() };
    writeJsonAtomic(path.join(directory, 'manifest.json'), manifest);
    appendAudit({ action: 'replicate', backupId: id, actor: manifest.createdBy, result: 'failed', error: error.message });
    throw new Error(`Local backup created but off-site replication failed: ${error.message}`);
  }
  appendAudit({ action: 'create', backupId: id, type, actor: manifest.createdBy, reason: manifest.reason });
  applyRetention();
  return manifest;
}

async function exclusive(operation) {
  if (operationRunning) throw new Error('Another backup or restore operation is already running');
  operationRunning = true;
  try {
    return await operation();
  } finally {
    operationRunning = false;
  }
}

export function listBackups() {
  if (!fs.existsSync(backupRoot)) return [];
  const rows = [];
  for (const entry of fs.readdirSync(backupRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    try {
      rows.push(readManifest(path.join(backupRoot, entry.name)));
    } catch {
      rows.push({ id: entry.name, type: 'unknown', createdAt: null, valid: false });
    }
  }
  return rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function createBackup(options) {
  return exclusive(() => createBackupUnsafe(options));
}

export function verifyBackup(id) {
  const directory = assertBackupId(id);
  const manifest = readManifest(directory);
  if (manifest.formatVersion !== FORMAT_VERSION || manifest.id !== id) throw new Error('Unsupported or mismatched backup manifest');
  if (!Array.isArray(manifest.files) || manifest.fileCount !== manifest.files.length) throw new Error('Backup manifest file count is invalid');
  const declared = new Set();
  for (const expected of manifest.files) {
    const relative = String(expected.path || '');
    if (!relative || relative.includes('..') || path.isAbsolute(relative) || declared.has(relative)) {
      throw new Error('Backup contains an unsafe or duplicate file path');
    }
    declared.add(relative);
    const file = path.resolve(directory, relative);
    if (!file.startsWith(`${directory}${path.sep}`) || !fs.existsSync(file)) throw new Error(`Backup file is missing: ${relative}`);
    const stat = fs.statSync(file);
    if (stat.size !== expected.bytes || hashFile(file) !== expected.sha256) throw new Error(`Backup checksum failed: ${relative}`);
    if (relative.startsWith('data/') && relative.endsWith('.json')) JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const actual = snapshotFiles(directory);
  if (actual.length !== manifest.fileCount || actual.some((file) => !declared.has(file.path))) {
    throw new Error('Backup contents do not match its manifest');
  }
  appendAudit({ action: 'verify', backupId: id, actor: 'System', result: 'passed' });
  return { ok: true, verifiedAt: new Date().toISOString(), fileCount: actual.length, totalBytes: manifest.totalBytes };
}

export async function restoreBackup(id, { restoredBy = 'System', reason = '' } = {}) {
  return exclusive(async () => {
    const directory = assertBackupId(id);
    const selectedManifest = readManifest(directory);
    if (config.dbDriver !== 'file' || selectedManifest.driver !== 'file') {
      throw new Error('MongoDB restores must be performed through the staging restore runbook');
    }
    verifyBackup(id);
    const safetyBackup = await createBackupUnsafe({ type: 'pre-restore', createdBy: restoredBy, reason: `Before restoring ${id}` });
    const rollback = path.join(backupRoot, `.rollback-${Date.now()}`);
    const snapshotData = path.join(directory, 'data');
    const snapshotUploads = path.join(directory, 'uploads');
    const liveDataFiles = fs.readdirSync(config.dataDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
    fs.mkdirSync(path.join(rollback, 'data'), { recursive: true });
    for (const entry of liveDataFiles) fs.copyFileSync(path.join(config.dataDir, entry.name), path.join(rollback, 'data', entry.name));
    if (fs.existsSync(config.uploadsDir)) copyTree(config.uploadsDir, path.join(rollback, 'uploads'));

    try {
      const desiredFiles = fs.readdirSync(snapshotData).filter((name) => name.endsWith('.json'));
      for (const entry of liveDataFiles) {
        if (!desiredFiles.includes(entry.name)) fs.rmSync(path.join(config.dataDir, entry.name), { force: true });
      }
      for (const name of desiredFiles) copyFileAtomic(path.join(snapshotData, name), path.join(config.dataDir, name));
      fs.rmSync(config.uploadsDir, { recursive: true, force: true });
      if (fs.existsSync(snapshotUploads)) copyTree(snapshotUploads, config.uploadsDir);
      await reloadDb();
      appendAudit({ action: 'restore', backupId: id, safetyBackupId: safetyBackup.id, actor: restoredBy, reason, result: 'passed' });
      fs.rmSync(rollback, { recursive: true, force: true });
      return { ok: true, backupId: id, safetyBackupId: safetyBackup.id, restoredAt: new Date().toISOString() };
    } catch (error) {
      for (const entry of fs.readdirSync(config.dataDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.json')) fs.rmSync(path.join(config.dataDir, entry.name), { force: true });
      }
      copyTree(path.join(rollback, 'data'), config.dataDir);
      fs.rmSync(config.uploadsDir, { recursive: true, force: true });
      copyTree(path.join(rollback, 'uploads'), config.uploadsDir);
      await reloadDb();
      appendAudit({ action: 'restore', backupId: id, safetyBackupId: safetyBackup.id, actor: restoredBy, reason, result: 'failed', error: error.message });
      fs.rmSync(rollback, { recursive: true, force: true });
      throw error;
    }
  });
}

export function getBackupDirectory(id) {
  const directory = assertBackupId(id);
  if (!fs.existsSync(path.join(directory, 'manifest.json'))) throw new Error('Backup not found');
  return directory;
}

export function getBackupHealth() {
  const backups = listBackups();
  const dataBytes = fs.existsSync(config.dataDir) ? fs.readdirSync(config.dataDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .reduce((sum, entry) => sum + fs.statSync(path.join(config.dataDir, entry.name)).size, 0) : 0;
  const uploadFiles = listFiles(config.uploadsDir);
  return {
    supported: ['file', 'mongo'].includes(config.dbDriver),
    driver: config.dbDriver,
    enabled: config.backupEnabled,
    intervalHours: config.backupIntervalHours,
    retention: config.backupRetention,
    busy: operationRunning,
    nextScheduledAt,
    lastBackupAt: backups[0]?.createdAt || null,
    backupCount: backups.length,
    offsiteConfigured: isOffsiteBackupConfigured(),
    lastOffsiteStatus: backups[0]?.offsite?.status || 'not-configured',
    dataBytes,
    uploadCount: uploadFiles.length,
    uploadBytes: uploadFiles.reduce((sum, file) => sum + fs.statSync(file.absolute).size, 0),
  };
}

export function startBackupScheduler() {
  if (!config.backupEnabled || !['file', 'mongo'].includes(config.dbDriver)) return;
  const interval = config.backupIntervalHours * 60 * 60 * 1000;
  const latest = listBackups().find((backup) => backup.type === 'scheduled');
  const elapsed = latest?.createdAt ? Date.now() - new Date(latest.createdAt).getTime() : interval;
  const firstDelay = Math.max(60_000, interval - elapsed);
  const schedule = (delay) => {
    nextScheduledAt = new Date(Date.now() + delay).toISOString();
    const timer = setTimeout(async () => {
      try {
        await createBackup({ type: 'scheduled', createdBy: 'Backup Scheduler', reason: 'Automated system snapshot' });
      } catch (error) {
        appendAudit({ action: 'scheduled-backup', actor: 'Backup Scheduler', result: 'failed', error: error.message });
        console.error('[Backup Scheduler]', error);
      } finally {
        schedule(interval);
      }
    }, delay);
    timer.unref();
  };
  schedule(firstDelay);
}
