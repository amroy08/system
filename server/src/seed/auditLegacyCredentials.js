import bcrypt from 'bcryptjs';
import { initDb, col, closeDb } from '../db/index.js';

try {
  await initDb();
  const users = await col('users').find({ status: 'active' });
  const counts = { admin: 0, parent: 0, student: 0 };
  for (const user of users) {
    const candidate = user.role === 'parent' ? 'parent123'
      : user.role === 'student' ? 'student123'
        : user.username === 'admin' ? 'admin123'
          : null;
    if (candidate && user.passwordHash && await bcrypt.compare(candidate, user.passwordHash)) {
      counts[user.role] += 1;
    }
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  console.log(JSON.stringify({ activeAccountsChecked: users.length, legacyCredentialCounts: counts, total }, null, 2));
  if (total) process.exitCode = 2;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
