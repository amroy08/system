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
    const { applyOffsiteRetention } = await import('../utils/backupReplica.js');
    await applyOffsiteRetention(15);
    console.log('[Backup Cron] Enforced 15-backup Cloudflare R2 retention limit.');
    process.exit(0);
  } catch (err) {
    console.error('[Backup Cron] Backup failed:', err);
    process.exit(1);
  }
}

run();
