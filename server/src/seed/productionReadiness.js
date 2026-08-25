import { config, assertProductionConfig } from '../config.js';
import { initDb, col, closeDb } from '../db/index.js';
import { getEmailHealth } from '../utils/emailService.js';
import { getBackupHealth, listBackups, verifyBackup } from '../utils/backupService.js';

const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
}

try {
  if (!config.isProduction) throw new Error('Run with NODE_ENV=production and the production environment file');
  assertProductionConfig();
  record('configuration', true, 'Production configuration is valid');

  await initDb();
  record('database', true, `Connected to ${config.mongoDbName}`);

  const activeUsers = await col('users').count({ status: 'active' });
  const unverifiedUsers = await col('users').count({ status: 'active', credentialVersion: { $ne: 2 } });
  record('credentials', unverifiedUsers === 0, `${activeUsers} active; ${unverifiedUsers} require secure credential rotation`);

  const email = await getEmailHealth();
  record('smtp', email.configured && email.reachable, email.reachable ? `Reachable as ${email.from}` : email.error || 'SMTP is not reachable');

  const backup = getBackupHealth();
  const latest = listBackups()[0];
  const maximumAgeMs = config.backupIntervalHours * 2 * 60 * 60 * 1000;
  const recent = latest?.createdAt && Date.now() - new Date(latest.createdAt).getTime() <= maximumAgeMs;
  const replicated = latest?.offsite?.status === 'replicated';
  let verified = false;
  if (latest?.id) {
    try {
      verifyBackup(latest.id);
      verified = true;
    } catch {
      verified = false;
    }
  }
  record(
    'backup',
    backup.enabled && backup.offsiteConfigured && recent && replicated && verified,
    latest ? `Latest ${latest.id}; recent=${Boolean(recent)}; replicated=${replicated}; verified=${verified}` : 'No backup exists',
  );
} catch (error) {
  record('startup', false, error.message);
} finally {
  await closeDb().catch(() => {});
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`);
if (checks.some((check) => !check.ok)) process.exitCode = 1;
