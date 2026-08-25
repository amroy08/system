import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoUri = process.env.MONGO_URI;

async function searchMongo() {
  if (!mongoUri) return;
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const dbs = ['mvhs_production', 'school_management'];
    const terms = ['amroy', 'alistair', 'simpson'];

    for (const dbName of dbs) {
      const db = client.db(dbName);
      const collections = await db.listCollections().toArray();
      for (const coll of collections) {
        const name = coll.name;
        if (name.startsWith('system.')) continue;
        const cursor = db.collection(name).find({});
        while (await cursor.hasNext()) {
          const doc = await cursor.next();
          const str = JSON.stringify(doc).toLowerCase();
          for (const term of terms) {
            if (str.includes(term)) {
              console.log(`[Mongo] Found "${term}" in database "${dbName}", collection "${name}":`);
              console.log(JSON.stringify(doc, null, 2));
              console.log('------------------------------------');
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Mongo search failed:', err);
  } finally {
    await client.close();
  }
}

function searchFiles() {
  const dataDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) return;
  const terms = ['amroy', 'alistair', 'simpson'];
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      content.forEach((doc, idx) => {
        const str = JSON.stringify(doc).toLowerCase();
        for (const term of terms) {
          if (str.includes(term)) {
            console.log(`[File] Found "${term}" in file "${file}" at index ${idx}:`);
            console.log(JSON.stringify(doc, null, 2));
            console.log('------------------------------------');
          }
        }
      });
    } catch {}
  }
}

async function main() {
  console.log('Searching MongoDB Atlas...');
  await searchMongo();
  console.log('\nSearching Local JSON files...');
  searchFiles();
}

main().catch(console.error);
