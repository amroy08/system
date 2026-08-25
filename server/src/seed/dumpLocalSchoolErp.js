import { MongoClient } from 'mongodb';

async function main() {
  const client = new MongoClient('mongodb://localhost:27017');
  try {
    await client.connect();
    const db = client.db('school_erp');
    
    console.log('--- local school_erp: STUDENTS ---');
    const students = await db.collection('students').find({}).toArray();
    students.forEach(s => console.log(`ID: ${s._id}, Name: ${s.studentName || s.name}, Roll: ${s.rollNo || ''}, Class: ${s.class || ''}`));

    console.log('\n--- local school_erp: TEACHERS ---');
    const teachers = await db.collection('teachers').find({}).toArray();
    teachers.forEach(t => console.log(`ID: ${t._id}, Name: ${t.name || t.fullName}, Email: ${t.email || ''}, Subject: ${t.subject || ''}`));

    console.log('\n--- local school_erp: PARENTS ---');
    const parents = await db.collection('parents').find({}).toArray();
    parents.forEach(p => console.log(`ID: ${p._id}, Father: ${p.fatherName || p.name}, Mother: ${p.motherName || ''}, Phone: ${p.phone || ''}`));

    console.log('\n--- local school_erp: ADMISSIONS ---');
    const admissions = await db.collection('admissions').find({}).toArray();
    admissions.forEach(a => console.log(`ID: ${a._id}, Student: ${a.studentName}, Father: ${a.fatherName}, Class: ${a.classAppliedFor}`));

    console.log('\n--- local school_erp: USERS ---');
    const users = await db.collection('users').find({}).toArray();
    users.forEach(u => console.log(`ID: ${u._id}, Username: ${u.username}, Role: ${u.role}, Email: ${u.email || ''}`));

  } finally {
    await client.close();
  }
}

main().catch(console.error);
