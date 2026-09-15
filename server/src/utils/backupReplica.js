import fs from 'node:fs';
import path from 'node:path';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { config } from '../config.js';

let backupClient;

function client() {
  if (!backupClient) {
    backupClient = new S3Client({
      region: config.backupS3Region,
      endpoint: config.backupS3Endpoint || undefined,
      forcePathStyle: config.backupS3ForcePathStyle,
      credentials: {
        accessKeyId: config.backupS3AccessKeyId,
        secretAccessKey: config.backupS3SecretAccessKey,
      },
    });
  }
  return backupClient;
}

export function isOffsiteBackupConfigured() {
  return Boolean(config.backupS3Bucket && config.backupS3AccessKeyId && config.backupS3SecretAccessKey);
}

export async function replicateBackup(directory, manifest) {
  if (!isOffsiteBackupConfigured()) return { status: 'not-configured' };
  const files = [...manifest.files, { path: 'manifest.json' }];
  for (const file of files) {
    const absolute = path.resolve(directory, file.path);
    if (!absolute.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error('Unsafe backup replication path');
    await client().send(new PutObjectCommand({
      Bucket: config.backupS3Bucket,
      Key: `${config.backupS3Prefix}/${manifest.id}/${file.path}`,
      Body: fs.createReadStream(absolute),
      ContentLength: fs.statSync(absolute).size,
      ContentType: file.path.endsWith('.json') ? 'application/json' : 'application/octet-stream',
      ServerSideEncryption: 'AES256',
      Metadata: { backupId: manifest.id, sha256: file.sha256 || '' },
    }));
  }
  return { status: 'replicated', replicatedAt: new Date().toISOString() };
}

export async function removeBackupReplica(backupId) {
  if (!isOffsiteBackupConfigured()) return { status: 'not-configured' };
  const prefix = `${config.backupS3Prefix}/${backupId}/`;
  let deleted = 0;
  let continuationToken;
  do {
    const listed = await client().send(new ListObjectsV2Command({
      Bucket: config.backupS3Bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    const objects = (listed.Contents || []).map((object) => ({ Key: object.Key })).filter((object) => object.Key);
    if (objects.length) {
      await client().send(new DeleteObjectsCommand({
        Bucket: config.backupS3Bucket,
        Delete: { Objects: objects },
      }));
      deleted += objects.length;
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
  return { status: 'deleted', deleted };
}

export async function listOffsiteBackups() {
  if (!isOffsiteBackupConfigured()) return [];
  const prefix = `${config.backupS3Prefix}/`;
  const dirs = new Set();
  let continuationToken;
  do {
    const listed = await client().send(new ListObjectsV2Command({
      Bucket: config.backupS3Bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const object of listed.Contents || []) {
      const remainder = object.Key.slice(prefix.length);
      const snapshotId = remainder.split('/')[0];
      if (snapshotId && snapshotId.includes('-')) dirs.add(snapshotId);
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);

  const sortedIds = Array.from(dirs).sort().reverse();
  const manifests = await Promise.all(
    sortedIds.slice(0, 30).map(async (id) => {
      try {
        return await getOffsiteManifest(id);
      } catch {
        return {
          id,
          type: id.startsWith('manual') ? 'manual' : id.startsWith('pre-restore') ? 'pre-restore' : 'scheduled',
          createdAt: null,
          createdBy: 'Cloudflare R2 Snapshot',
          fileCount: 0,
          totalBytes: 0,
          valid: true,
        };
      }
    })
  );

  return manifests.sort((a, b) => String(b.createdAt || b.id).localeCompare(String(a.createdAt || a.id)));
}

export async function getOffsiteManifest(backupId) {
  if (!isOffsiteBackupConfigured()) throw new Error('Offsite backup not configured');
  const key = `${config.backupS3Prefix}/${backupId}/manifest.json`;
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const res = await client().send(new GetObjectCommand({
    Bucket: config.backupS3Bucket,
    Key: key,
  }));
  const body = await res.Body.transformToString();
  return JSON.parse(body);
}

export async function getOffsiteFileStream(backupId, filePath) {
  if (!isOffsiteBackupConfigured()) throw new Error('Offsite backup not configured');
  const key = `${config.backupS3Prefix}/${backupId}/${filePath}`;
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const res = await client().send(new GetObjectCommand({
    Bucket: config.backupS3Bucket,
    Key: key,
  }));
  return res.Body;
}

export async function applyOffsiteRetention(maxRetention = 15) {
  if (!isOffsiteBackupConfigured()) return;
  const prefix = `${config.backupS3Prefix}/`;
  const dirs = new Set();
  let continuationToken;
  do {
    const listed = await client().send(new ListObjectsV2Command({
      Bucket: config.backupS3Bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const object of listed.Contents || []) {
      const remainder = object.Key.slice(prefix.length);
      const snapshotId = remainder.split('/')[0];
      if (snapshotId && snapshotId.includes('-')) dirs.add(snapshotId);
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);

  const sorted = Array.from(dirs).sort(); // chronological order: oldest first
  if (sorted.length > maxRetention) {
    const toDelete = sorted.slice(0, sorted.length - maxRetention);
    console.log(`[R2 Retention] Purging ${toDelete.length} old snapshots to maintain ${maxRetention} limit:`, toDelete);
    for (const id of toDelete) {
      await removeBackupReplica(id);
    }
  }
}
