import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '../..');

test('backup retention caps scheduled backups and expires old manual backups', () => {
  execFileSync(process.execPath, ['--input-type=module', '-'], {
    cwd: serverRoot,
    stdio: 'pipe',
    input: `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import os from 'node:os';
      import path from 'node:path';

      function stamp(date) {
        return date.toISOString().replace(/[-:]/g, '').replace(/\\.\\d{3}Z$/, 'Z');
      }

      function writeBackup(root, type, date) {
        const id = \`\${type}-\${stamp(date)}\`;
        const directory = path.join(root, 'backups', 'system', id);
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({
          formatVersion: 1,
          id,
          type,
          createdAt: date.toISOString(),
          createdBy: 'Retention Test',
          reason: '',
          driver: 'file',
          fileCount: 0,
          totalBytes: 0,
          files: [],
        }, null, 2));
        return id;
      }

      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-retention-'));
      const backupRoot = path.join(temporary, 'backups', 'system');
      const now = new Date();

      process.env.DB_DRIVER = 'file';
      process.env.DATA_DIR = temporary;
      process.env.UPLOADS_DIR = path.join(temporary, 'uploads');
      process.env.BACKUP_RETENTION = '30';
      process.env.BACKUP_ENABLED = 'true';

      fs.writeFileSync(path.join(temporary, 'live.json'), '[]');

      const oldScheduledIds = [];
      for (let index = 0; index < 16; index += 1) {
        oldScheduledIds.push(writeBackup(temporary, 'scheduled', new Date(now.getTime() - (index + 1) * 60_000)));
      }
      const oldManualId = writeBackup(temporary, 'manual', new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000));
      const recentManualId = writeBackup(temporary, 'manual', new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000));

      const service = await import('./src/utils/backupService.js?retention-test');
      await service.createBackup({ type: 'scheduled', createdBy: 'Retention Test' });

      const remaining = new Set(fs.readdirSync(backupRoot).filter((entry) => fs.statSync(path.join(backupRoot, entry)).isDirectory()));
      const scheduled = [...remaining].filter((id) => id.startsWith('scheduled-'));

      assert.equal(scheduled.length, 15);
      assert.equal(remaining.has(oldManualId), false);
      assert.equal(remaining.has(recentManualId), true);
      assert.equal(remaining.has(oldScheduledIds.at(-1)), false);
    `,
  });
});
