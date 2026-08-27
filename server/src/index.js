import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import { config, assertProductionConfig } from './config.js';
import { initDb, col, closeDb, flushDb } from './db/index.js';

import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import admissionsRoutes from './routes/admissions.js';
import studentsRoutes from './routes/students.js';
import parentsRoutes from './routes/parents.js';
import attendanceRoutes from './routes/attendance.js';
import examsRoutes from './routes/exams.js';
import feesRoutes from './routes/fees.js';
import teachersRoutes from './routes/teachers.js';
import dashboardRoutes from './routes/dashboard.js';
import portalRoutes from './routes/portal.js';
import assetsRoutes from './routes/assets.js';
import inventoryRoutes from './routes/inventory.js';
import libraryRoutes from './routes/library.js';
import payrollRoutes from './routes/payroll.js';
import searchRoutes from './routes/search.js';
import miscRoutes from './routes/misc.js';
import promotionsRoutes from './routes/promotions.js';
import homeworkRoutes from './routes/homework.js';
import emailRoutes from './routes/email.js';
import attachmentRoutes from './routes/attachments.js';
import backupRoutes from './routes/backups.js';
import recoveryRoutes from './routes/recovery.js';
import { processEmailOutbox } from './utils/emailOutbox.js';
import { startBackupScheduler } from './utils/backupService.js';
import { csrfProtect } from './middleware/auth.js';
import { mutationAudit, requestContext } from './middleware/mutationAudit.js';
import { requestTiming } from './middleware/performance.js';

assertProductionConfig();

const app = express();
app.set('trust proxy', config.isProduction ? 1 : false);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
}));
app.use(compression());
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin.replace(/\/$/, ''))) return callback(null, true);
    return callback(new Error('Origin is not allowed'));
  },
}));
app.use(cookieParser());
app.use(express.json({ limit: '12mb' }));
app.use(requestContext);
app.use(requestTiming);
app.use(csrfProtect);
app.use(mutationAudit);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});
app.use('/api/auth/login', loginLimiter);

app.get('/api/health', async (req, res) => {
  try {
    await col('settings').count({});
    res.json(config.isProduction ? { ok: true } : { ok: true, driver: config.dbDriver });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// Public branding for the login screen (no auth)
app.get('/api/public/settings', async (req, res) => {
  const doc = await col('settings').findOne({ key: 'school' });
  const v = doc?.value || {};
  res.json({
    schoolName: v.schoolName || 'M.V HIGH SCHOOL',
    logoUrl: v.logoUrl || '',
    primaryColor: v.primaryColor || '#0f2248',
    accentColor: v.accentColor || '#16a34a',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admissions', admissionsRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/parents', parentsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/exams', examsRoutes);
app.use('/api/fees', feesRoutes);
app.use('/api/teachers', teachersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/promotions', promotionsRoutes);
app.use('/api/homework', homeworkRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/recovery', recoveryRoutes);
app.use('/api', miscRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

async function assertNoDefaultProductionCredentials() {
  if (!config.isProduction) return;
  const unverified = await col('users').count({ status: 'active', credentialVersion: { $ne: 2 } });
  if (unverified) {
    throw new Error(`${unverified} active account(s) have not passed credential remediation. Run the credential remediation workflow before production.`);
  }
}

initDb().then(async () => {
  await assertNoDefaultProductionCredentials();
  startBackupScheduler();
  processEmailOutbox().catch((error) => console.error('[Email Outbox]', error));
  const emailWorker = setInterval(() => processEmailOutbox().catch((error) => console.error('[Email Outbox]', error)), 15_000);
  emailWorker.unref();
  const server = app.listen(config.port, () => {
    console.log(`[server] School Management API running on http://localhost:${config.port}`);
  });
  let shutdownStarted = false;
  const shutdown = (signal) => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    console.log(`[server] ${signal} received; closing HTTP server`);
    server.close(async () => {
      await flushDb();
      await closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('uncaughtException', (error) => {
    console.error('[server] Uncaught exception:', error);
    shutdown('uncaughtException');
  });
  process.once('unhandledRejection', (error) => {
    console.error('[server] Unhandled rejection:', error);
    shutdown('unhandledRejection');
  });
}).catch(async (error) => {
  console.error('[server] Startup failed:', error.message);
  await closeDb().catch(() => {});
  process.exit(1);
});
// Nodemon trigger reload comment
