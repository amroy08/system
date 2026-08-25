import { MongoClient } from 'mongodb';

async function main() {
  const client = new MongoClient('mongodb://localhost:27017');
  try {
    await client.connect();
    const db = client.db('school_erp');
    const students = await db.collection('students').find({}).toArray();
    console.log('--- Detailed Local school_erp Students ---');
    students.forEach((s, i) => {
      console.log(`Record #${i + 1}:`);
      console.log(JSON.stringify(s, null, 2));
      console.log('-----------------------------------------');
    });
  } finally {
    await client.close();
  }
}

main().catch(console.error);
