import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const s3Client = new S3Client({
  region: process.env.BACKUP_S3_REGION || 'auto',
  endpoint: process.env.BACKUP_S3_ENDPOINT || undefined,
  forcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE === 'true',
  credentials: {
    accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY || '',
  },
});

async function main() {
  const bucket = process.env.BACKUP_S3_BUCKET || 'mvhs-backups';
  console.log(`Checking backups in bucket: ${bucket}`);
  try {
    const data = await s3Client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: process.env.BACKUP_S3_PREFIX || 'school-backups',
    }));
    const contents = data.Contents || [];
    if (contents.length === 0) {
      console.log('No backup files found in the Cloudflare R2 bucket.');
    } else {
      console.log(`Found ${contents.length} backup file(s):`);
      contents.forEach((item) => {
        console.log(`- ${item.Key} (${(item.Size / 1024).toFixed(2)} KB, Last Modified: ${item.LastModified})`);
      });
    }
  } catch (err) {
    console.error('Failed to connect to Cloudflare R2 backup bucket:', err);
  }
}

main().catch(console.error);
