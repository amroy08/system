import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

if (fs.existsSync(path.resolve('./.env.production'))) {
  dotenv.config({ path: path.resolve('./.env.production') });
} else {
  dotenv.config();
}

const { createBackup } = await import('../utils/backupService.js');

async function run() {
  console.log('[Backup Cron] Starting automated database backup...');
  try {
    const manifest = await createBackup({
      type: 'scheduled',
      createdBy: 'GitHub Actions Automated Backup',
      reason: 'Scheduled 6-hour Cloudflare R2 backup',
    });
    console.log(`[Backup Cron] Backup successful: ${manifest.id}`);
    console.log(`[Backup Cron] Offsite R2 status: ${manifest.offsite?.status || 'N/A'}`);
    process.exit(0);
  } catch (err) {
    console.error('[Backup Cron] Backup failed:', err);
    process.exit(1);
  }
}

run();
