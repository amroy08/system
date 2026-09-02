import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nodeEnv = process.env.NODE_ENV || 'development';
const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
const configuredOrigins = (process.env.CORS_ORIGINS || appUrl)
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: process.env.PORT || 5050,
  jwtSecret: process.env.JWT_SECRET || 'sms-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  // DB_DRIVER: 'file' (default, zero-setup JSON files) or 'mongo' (cloud.mongodb.com)
  dbDriver: process.env.DB_DRIVER || 'file',
  mongoUri: process.env.MONGO_URI || '',
  mongoDbName: process.env.MONGO_DB_NAME || 'school_management',
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'),
  storageDriver: process.env.STORAGE_DRIVER || 'local',
  s3Endpoint: process.env.S3_ENDPOINT || '',
  s3Region: process.env.S3_REGION || 'auto',
  s3Bucket: process.env.S3_BUCKET || '',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || '',
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  backupEnabled: process.env.BACKUP_ENABLED !== 'false',
  backupIntervalHours: Math.max(1, parseInt(process.env.BACKUP_INTERVAL_HOURS || '6', 10)),
  backupRetention: Math.max(1, parseInt(process.env.BACKUP_RETENTION || '15', 10)),
  backupS3Endpoint: process.env.BACKUP_S3_ENDPOINT || '',
  backupS3Region: process.env.BACKUP_S3_REGION || 'auto',
  backupS3Bucket: process.env.BACKUP_S3_BUCKET || '',
  backupS3AccessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID || '',
  backupS3SecretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY || '',
  backupS3ForcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE === 'true',
  backupS3Prefix: (process.env.BACKUP_S3_PREFIX || 'school-backups').replace(/^\/+|\/+$/g, ''),
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  emailFrom: process.env.EMAIL_FROM || '"M.V HIGH SCHOOL" <noreply@mvhs.edu.in>',
  appUrl,
  corsOrigins: configuredOrigins,
  sessionCookieName: 'sms_session',
  csrfCookieName: 'sms_csrf',
  sessionMaxAgeMs: Math.max(1, parseInt(process.env.SESSION_HOURS || '12', 10)) * 60 * 60 * 1000,
};

export function assertProductionConfig() {
  if (!config.isProduction) return;
  const errors = [];
  if (config.jwtSecret === 'sms-dev-secret-change-me' || config.jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be a unique value of at least 32 characters');
  }
  if (!config.appUrl.startsWith('https://')) errors.push('APP_URL must use HTTPS');
  if (config.dbDriver !== 'mongo') errors.push('DB_DRIVER must be mongo');
  if (!config.mongoUri.startsWith('mongodb://') && !config.mongoUri.startsWith('mongodb+srv://')) errors.push('MONGO_URI must be a valid MongoDB connection URI');
  if (!config.corsOrigins.length || config.corsOrigins.includes('*') || !config.corsOrigins.includes(config.appUrl)) {
    errors.push('CORS_ORIGINS must explicitly include APP_URL and cannot use a wildcard');
  }
  if (config.storageDriver !== 's3') errors.push('STORAGE_DRIVER must be s3');
  if (!config.s3Bucket || !config.s3AccessKeyId || !config.s3SecretAccessKey) {
    errors.push('S3 bucket and credentials are required');
  }
  if (!config.backupS3Bucket || !config.backupS3AccessKeyId || !config.backupS3SecretAccessKey) {
    errors.push('Independent off-site backup S3 bucket and credentials are required');
  }
  if (config.backupS3Bucket && config.backupS3Bucket === config.s3Bucket) {
    errors.push('BACKUP_S3_BUCKET must be independent from the document S3 bucket');
  }
  if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
    errors.push('SMTP_HOST, SMTP_USER and SMTP_PASS are required');
  }
  if (!process.env.EMAIL_FROM) errors.push('EMAIL_FROM is required');
  if (errors.length) throw new Error(`Invalid production configuration:\n- ${errors.join('\n- ')}`);
}
// Reload trigger: load new SMTP_USER
