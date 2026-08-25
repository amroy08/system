import fs from 'node:fs/promises';
import path from 'node:path';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../config.js';

const execute = process.argv.includes('--execute');

async function main() {
  if (!config.s3Bucket || !config.s3AccessKeyId || !config.s3SecretAccessKey) {
    throw new Error('S3 bucket and credentials are required');
  }
  const attachmentsFile = path.join(config.dataDir, 'attachments.json');
  const attachments = JSON.parse(await fs.readFile(attachmentsFile, 'utf8'));
  const client = new S3Client({
    region: config.s3Region,
    endpoint: config.s3Endpoint || undefined,
    forcePathStyle: config.s3ForcePathStyle,
    credentials: { accessKeyId: config.s3AccessKeyId, secretAccessKey: config.s3SecretAccessKey },
  });
  let available = 0;
  let missing = 0;
  let uploaded = 0;
  for (const attachment of attachments) {
    const file = path.resolve(config.uploadsDir, attachment.storedName || '');
    if (!attachment.storedName || !file.startsWith(`${path.resolve(config.uploadsDir)}${path.sep}`)) {
      throw new Error(`Attachment ${attachment._id} has an unsafe storage key`);
    }
    let content;
    try {
      content = await fs.readFile(file);
      available++;
    } catch {
      missing++;
      continue;
    }
    if (!execute) continue;
    try {
      const remote = await client.send(new HeadObjectCommand({ Bucket: config.s3Bucket, Key: attachment.storedName }));
      if (remote.ContentLength !== content.length) throw new Error(`Remote size mismatch for ${attachment.storedName}`);
    } catch (error) {
      if (error.$metadata?.httpStatusCode !== 404 && error.name !== 'NotFound') throw error;
      await client.send(new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: attachment.storedName,
        Body: content,
        ContentType: attachment.mimeType,
        ServerSideEncryption: 'AES256',
      }));
      uploaded++;
    }
  }
  console.log(`[storage] ${available} local files available; ${missing} missing; ${uploaded} uploaded`);
  if (missing) throw new Error('One or more attachment files are missing; migration is incomplete');
  if (!execute) console.log('[storage] Dry run only. No files were uploaded.');
}

main().catch((error) => {
  console.error(`[storage] ${error.message}`);
  process.exitCode = 1;
});
