import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { initDb, col } from '../db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const hash = (p) => bcrypt.hashSync(p, 10);

async function clearDb() {
  if (config.isProduction) throw new Error('Database reset is disabled in production');
  if (process.env.CONFIRM_DATABASE_RESET !== 'RESET_MVHS_DATABASE') {
    throw new Error('Set CONFIRM_DATABASE_RESET=RESET_MVHS_DATABASE to confirm this destructive reset');
  }
  console.log('Wiping database...');
  
  if (config.dbDriver === 'file' && fs.existsSync(config.dataDir)) {
    fs.rmSync(config.dataDir, { recursive: true, force: true });
  }
  
  await initDb();
  
  const collections = [
    'users', 'students', 'parents', 'classes', 'subjects', 'assignments',
    'admissions', 'attendance', 'exams', 'marks', 'feeReceipts', 'feeStructures',
    'dailyAccounts', 'notices', 'calendarEvents', 'lessonPlans', 'logbook',
    'discipline', 'conduct', 'activities', 'helpdesk', 'complaints', 'documents',
    'assets', 'inventory', 'stockMovements', 'timetables', 'substitutes', 'ptm',
    'settings', 'counters', 'books', 'bookIssues', 'salarySlips'
  ];

  if (config.dbDriver === 'mongo') {
    for (const name of collections) {
      await col(name).deleteMany({});
    }
  } else {
    fs.mkdirSync(config.dataDir, { recursive: true });
    for (const name of collections) {
      if (name !== 'settings' && name !== 'users' && name !== 'counters' && name !== 'classes') {
        fs.writeFileSync(path.join(config.dataDir, `${name}.json`), '[]');
      }
    }
  }

  // 1. Create Default School Settings
  console.log('Seeding initial school settings...');
  await col('settings').insertOne({
    key: 'school',
    value: {
      schoolName: 'M.V HIGH SCHOOL',
      tagline: 'Learn. Grow. Succeed.',
      address: 'S.V.P. ROAD, Charni Road, Bhatwadi, PRARTHNA SAMAJ, Mumbai, Maharashtra 400004',
      phone: '022 2386 5845',
      email: 'info@mvhs.edu.in',
      website: 'www.mvhs.edu.in',
      timezone: 'Asia/Kolkata',
      currency: '₹',
      academicYear: '2026-2027',
      logoUrl: '',
      primaryColor: '#0f2248',
      accentColor: '#16a34a',
    },
  });

  // 2. Create Root Admin User
  console.log('Seeding root admin account (admin / admin123)...');
  await col('users').insertOne({
    username: 'admin',
    fullName: 'Admin User',
    role: 'admin',
    status: 'active',
    email: 'admin@demo.com',
    mobile: '+91 90000 00001',
    gender: 'Male',
    joined: new Date().toISOString().slice(0, 10),
    passwordHash: hash('admin123'),
  });

  // 3. Initialize Database Counters
  console.log('Resetting counters...');
  await col('counters').insertMany([
    { key: 'admissionNo', value: 0 },
    { key: 'registration', value: 0 },
    { key: 'receipt', value: 0 },
    { key: 'assetTag', value: 0 },
    { key: 'studentUser', value: 0 },
    { key: 'parentUser', value: 0 },
    { key: 'bookAcc', value: 0 },
    { key: 'salarySlip', value: 0 },
  ]);

  // 4. Create Default MVHS Classes
  console.log('Seeding default MVHS classes with capacity 70...');
  const AY = '2026-2027';
  const defaultClasses = [
    { name: 'Nursery', section: 'A', academicYear: AY, capacity: 70, room: 'Room N1', status: 'active' },
    { name: 'Junior KG', section: 'A', academicYear: AY, capacity: 70, room: 'Room JK1', status: 'active' },
    { name: 'Senior KG', section: 'A', academicYear: AY, capacity: 70, room: 'Room SK1', status: 'active' },
    { name: 'Grade 1', section: 'A', academicYear: AY, capacity: 70, room: 'Room 101', status: 'active' },
    { name: 'Grade 2', section: 'A', academicYear: AY, capacity: 70, room: 'Room 201', status: 'active' },
    { name: 'Grade 3', section: 'A', academicYear: AY, capacity: 70, room: 'Room 301', status: 'active' },
    { name: 'Grade 4', section: 'A', academicYear: AY, capacity: 70, room: 'Room 401', status: 'active' },
    { name: 'Grade 5', section: 'A', academicYear: AY, capacity: 70, room: 'Room 501', status: 'active' },
    { name: 'Grade 6', section: 'A', academicYear: AY, capacity: 70, room: 'Room 601', status: 'active' },
    { name: 'Grade 7', section: 'A', academicYear: AY, capacity: 70, room: 'Room 701', status: 'active' },
    { name: 'Grade 8', section: 'A', academicYear: AY, capacity: 70, room: 'Room 801', status: 'active' },
    { name: 'Grade 9', section: 'A', academicYear: AY, capacity: 70, room: 'Room 901', status: 'active' },
    { name: 'Grade 10', section: 'A', academicYear: AY, capacity: 70, room: 'Room 1001', status: 'active' },
    { name: 'Old Students', section: 'A', academicYear: AY, capacity: 70, room: 'Alumni Room', status: 'active' }
  ];
  await col('classes').insertMany(defaultClasses);

  if (config.dbDriver === 'file') {
    col('users').flush();
    col('settings').flush();
    col('counters').flush();
    col('classes').flush();
  }

  console.log('Database wiped and reset successfully. Only the root admin account (admin / admin123) is preserved.');
  await new Promise((resolve) => setTimeout(resolve, 500));
  process.exit(0);
}

clearDb().catch((err) => {
  console.error('Failed to wipe database:', err);
  process.exit(1);
});
