import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { config } from '../config.js';

function argument(name) {
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || '';
}

function hashFile(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function validBackupId(value) {
  return /^[a-z][a-z0-9-]*-\d{8}T\d{6}Z$/.test(value);
}

function safeManifestPath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !value.includes('..')
    && !path.isAbsolute(value);
}

function backupFiles(directory, current = directory) {
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) return backupFiles(directory, absolute);
    return [path.relative(directory, absolute)];
  });
}

function restore(uri, targetDb, archive) {
  return new Promise((resolve, reject) => {
    const child = spawn('mongorestore', [
      `--uri=${uri}`,
      `--db=${targetDb}`,
      `--archive=${archive}`,
      '--gzip',
      '--drop',
    ], { stdio: ['ignore', 'inherit', 'pipe'] });
    let errorText = '';
    child.stderr.on('data', (chunk) => { errorText += chunk.toString(); });
    child.on('error', (error) => reject(new Error(`mongorestore is unavailable: ${error.message}`)));
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(errorText.trim() || `mongorestore exited with ${code}`)));
  });
}

async function main() {
  const directory = path.resolve(argument('--backup-directory'));
  const targetDb = argument('--target-db');
  if (!directory || directory === path.resolve('.')) throw new Error('--backup-directory is required');
  if (!/(staging|restore|drill)/i.test(targetDb)) throw new Error('Target database name must explicitly contain staging, restore or drill');
  if (targetDb === config.mongoDbName) throw new Error('Refusing to restore into the configured production database');
  if (!config.mongoUri) throw new Error('MONGO_URI is required');
  const manifestPath = path.join(directory, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.formatVersion !== 1 || !Array.isArray(manifest.files)) throw new Error('Unsupported or invalid backup manifest');
  if (!validBackupId(manifest.id) || path.basename(directory) !== manifest.id) throw new Error('Backup directory does not match the manifest ID');
  if (manifest.driver !== 'mongo') throw new Error('Selected backup is not a MongoDB backup');
  if (manifest.fileCount !== manifest.files.length) throw new Error('Backup file count does not match the manifest');
  const paths = new Set();
  for (const expected of manifest.files) {
    if (!safeManifestPath(expected.path) || paths.has(expected.path)) throw new Error('Manifest contains an unsafe or duplicate path');
    paths.add(expected.path);
    const file = path.resolve(directory, expected.path);
    if (!file.startsWith(`${directory}${path.sep}`) || !fs.existsSync(file)) throw new Error(`Missing backup file: ${expected.path}`);
    if (fs.statSync(file).size !== expected.bytes || hashFile(file) !== expected.sha256) throw new Error(`Checksum failed: ${expected.path}`);
  }
  const actualFiles = backupFiles(directory).filter((file) => file !== 'manifest.json');
  if (actualFiles.length !== manifest.files.length || actualFiles.some((file) => !paths.has(file))) {
    throw new Error('Backup directory contains files not declared in the manifest');
  }
  const archivePath = path.join('data', 'mongo.archive.gz');
  if (!paths.has(archivePath)) throw new Error('MongoDB archive is not declared in the manifest');
  const archive = path.join(directory, archivePath);
  await restore(config.mongoUri, targetDb, archive);
  console.log(`[restore-drill] Restored and checksum-verified ${manifest.id} into ${targetDb}`);
}

main().catch((error) => {
  console.error(`[restore-drill] ${error.message}`);
  process.exitCode = 1;
});
