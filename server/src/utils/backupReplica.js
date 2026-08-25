import fs from 'node:fs';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
