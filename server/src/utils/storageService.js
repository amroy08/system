import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../config.js';

let s3Client;

function client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.s3Region,
      endpoint: config.s3Endpoint || undefined,
      forcePathStyle: config.s3ForcePathStyle,
      credentials: {
        accessKeyId: config.s3AccessKeyId,
        secretAccessKey: config.s3SecretAccessKey,
      },
    });
  }
  return s3Client;
}

function localPath(key) {
  const resolved = path.resolve(config.uploadsDir, key);
  if (!resolved.startsWith(`${path.resolve(config.uploadsDir)}${path.sep}`)) throw new Error('Unsafe storage key');
  return resolved;
}

export async function putStoredFile(key, content, contentType) {
  if (config.storageDriver === 's3') {
    await client().send(new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      Body: content,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
    }));
    return;
  }
  await mkdir(config.uploadsDir, { recursive: true });
  await writeFile(localPath(key), content);
}

export async function getStoredFile(key) {
  if (config.storageDriver === 's3') {
    const result = await client().send(new GetObjectCommand({ Bucket: config.s3Bucket, Key: key }));
    if (!result.Body) throw new Error('Stored file has no content');
    return Buffer.from(await result.Body.transformToByteArray());
  }
  return readFile(localPath(key));
}
