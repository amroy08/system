import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoUri = process.env.MONGO_URI;

async function main() {
  if (!mongoUri) return;
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db('mvhs_production');
    
    console.log('Searching STUDENTS collection for "alis" or "alistair":');
    const students = await db.collection('students').find({
      name: { $regex: /alis/i }
    }).toArray();
    if (students.length === 0) console.log('- No matches found.');
    students.forEach(s => console.log(`  * Student ID: ${s._id}, Name: ${s.name}, Class: ${s.classId || s.className || ''}`));

    console.log('\nSearching PARENTS collection for "simp" or "simpson":');
    const parents = await db.collection('parents').find({
      name: { $regex: /simp/i }
    }).toArray();
    if (parents.length === 0) console.log('- No matches found.');
    parents.forEach(p => console.log(`  * Parent ID: ${p._id}, Name: ${p.name}, Phone: ${p.mobile}`));

    console.log('\nSearching USERS collection for "amr" or "roy" or "alis" or "simp":');
    const users = await db.collection('users').find({
      $or: [
        { fullName: { $regex: /amr|roy|alis|simp/i } },
        { username: { $regex: /amr|roy|alis|simp/i } }
      ]
    }).toArray();
    if (users.length === 0) console.log('- No matches found.');
    users.forEach(u => console.log(`  * User ID: ${u._id}, Username: ${u.username}, FullName: ${u.fullName}, Role: ${u.role}`));

  } finally {
    await client.close();
  }
}

main().catch(console.error);
