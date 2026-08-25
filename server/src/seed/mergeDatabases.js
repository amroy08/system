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
    const sourceDb = client.db('school_management');
    const targetDb = client.db('mvhs_production');

    console.log('Merging custom subjects...');
    const sourceSubjects = await sourceDb.collection('subjects').find({}).toArray();
    for (const sub of sourceSubjects) {
      const exists = await targetDb.collection('subjects').findOne({ name: sub.name });
      if (!exists) {
        await targetDb.collection('subjects').insertOne(sub);
        console.log(`- Merged subject: ${sub.name}`);
      } else {
        console.log(`- Subject "${sub.name}" already exists, skipping.`);
      }
    }

    console.log('\nMerging custom teachers...');
    const sourceTeachers = await sourceDb.collection('users').find({ role: 'teacher' }).toArray();
    for (const teacher of sourceTeachers) {
      const exists = await targetDb.collection('users').findOne({ username: teacher.username });
      if (!exists) {
        await targetDb.collection('users').insertOne(teacher);
        console.log(`- Merged teacher: ${teacher.fullName} (@${teacher.username})`);
      } else {
        console.log(`- Teacher "${teacher.fullName}" already exists, skipping.`);
      }
    }

    console.log('\n🎉 Custom teachers and subjects merged successfully!');
  } finally {
    await client.close();
  }
}

main().catch(console.error);
