import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoUri = process.env.MONGO_URI;

async function main() {
  if (!mongoUri) {
    console.error('MONGO_URI is not configured in .env');
    process.exit(1);
  }
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db('school_management');
    
    console.log('--- MongoDB school_management: STUDENTS ---');
    const students = await db.collection('students').find({}).toArray();
    students.forEach(s => console.log(`ID: ${s._id}, Name: ${s.name || s.fullName || s.firstName}, Class: ${s.classId || s.className || ''}`));

    console.log('\n--- MongoDB school_management: PARENTS ---');
    const parents = await db.collection('parents').find({}).toArray();
    parents.forEach(p => console.log(`ID: ${p._id}, Name: ${p.name || p.fullName || p.fatherName}, Phone: ${p.phone || p.mobile || ''}`));

    console.log('\n--- MongoDB school_management: USERS ---');
    const users = await db.collection('users').find({}).toArray();
    users.forEach(u => console.log(`ID: ${u._id}, Username: ${u.username}, Role: ${u.role}, FullName: ${u.fullName || ''}`));

    console.log('\n--- MongoDB school_management: ADMISSIONS ---');
    const admissions = await db.collection('admissions').find({}).toArray();
    admissions.forEach(a => console.log(`ID: ${a._id}, Student: ${a.firstName} ${a.lastName}, Parent: ${a.parentName}, Status: ${a.status}`));

  } finally {
    await client.close();
  }
}

main().catch(console.error);
