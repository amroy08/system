import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { config } from '../config.js';

function argument(name) {
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || '';
}

function validBackupId(value) {
  return /^[a-z][a-z0-9-]*-\d{8}T\d{6}Z$/.test(value);
}

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function safeManifestPath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !value.includes('..')
    && !path.isAbsolute(value);
}

async function main() {
  const backupId = argument('--backup-id');
  const destination = argument('--destination');
  if (!validBackupId(backupId)) throw new Error('A valid --backup-id is required');
  if (!destination) throw new Error('--destination is required');
  if (!config.backupS3Bucket || !config.backupS3AccessKeyId || !config.backupS3SecretAccessKey) {
    throw new Error('Off-site backup credentials are required');
  }
  const destinationRoot = path.resolve(destination);
  const target = path.resolve(destinationRoot, backupId);
  if (path.dirname(target) !== destinationRoot) throw new Error('Unsafe backup destination');
  try {
    await fs.access(target);
    throw new Error('Destination backup already exists');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const staging = path.resolve(destinationRoot, `.fetch-${backupId}-${process.pid}`);
  if (path.dirname(staging) !== destinationRoot) throw new Error('Unsafe staging destination');
  await fs.mkdir(staging, { recursive: false });

  const client = new S3Client({
    region: config.backupS3Region,
    endpoint: config.backupS3Endpoint || undefined,
    forcePathStyle: config.backupS3ForcePathStyle,
    credentials: { accessKeyId: config.backupS3AccessKeyId, secretAccessKey: config.backupS3SecretAccessKey },
  });
  const prefix = `${config.backupS3Prefix}/${backupId}/`;
  try {
    let continuationToken;
    let objectCount = 0;
    do {
      const page = await client.send(new ListObjectsV2Command({
        Bucket: config.backupS3Bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));
      for (const object of page.Contents || []) {
        const relative = String(object.Key || '').slice(prefix.length);
        if (!relative || relative.includes('..') || path.isAbsolute(relative)) throw new Error('Off-site backup contains an unsafe key');
        const file = path.resolve(staging, relative);
        if (!file.startsWith(`${staging}${path.sep}`)) throw new Error('Off-site backup contains an unsafe path');
        const response = await client.send(new GetObjectCommand({ Bucket: config.backupS3Bucket, Key: object.Key }));
        if (!response.Body) throw new Error(`Backup object is empty: ${relative}`);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, Buffer.from(await response.Body.transformToByteArray()));
        objectCount += 1;
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    if (!objectCount) throw new Error('Off-site backup was not found');

    const manifest = JSON.parse(await fs.readFile(path.join(staging, 'manifest.json'), 'utf8'));
    if (manifest.id !== backupId) throw new Error('Off-site manifest does not match the requested backup');
    if (manifest.formatVersion !== 1 || !Array.isArray(manifest.files)) throw new Error('Unsupported or invalid backup manifest');
    if (manifest.fileCount !== manifest.files.length || objectCount !== manifest.files.length + 1) {
      throw new Error('Off-site backup object count does not match the manifest');
    }
    const paths = new Set();
    for (const expected of manifest.files) {
      if (!safeManifestPath(expected.path) || paths.has(expected.path)) throw new Error('Manifest contains an unsafe or duplicate path');
      paths.add(expected.path);
      const file = path.resolve(staging, expected.path);
      if (!file.startsWith(`${staging}${path.sep}`)) throw new Error('Manifest contains an unsafe path');
      const content = await fs.readFile(file);
      if (content.length !== expected.bytes || digest(content) !== expected.sha256) throw new Error(`Checksum failed: ${expected.path}`);
    }
    await fs.rename(staging, target);
    console.log(`[backup] Downloaded and verified ${backupId} to ${target}`);
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

main().catch((error) => {
  console.error(`[backup] ${error.message}`);
  process.exitCode = 1;
});
