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
    const admin = client.db().admin();
    const dbInfo = await admin.listDatabases();
    console.log('Available MongoDB Databases:');
    for (const dbDetail of dbInfo.databases) {
      const dbName = dbDetail.name;
      // Skip system databases
      if (['admin', 'local', 'config'].includes(dbName)) continue;
      
      const dbInstance = client.db(dbName);
      const collections = await dbInstance.listCollections().toArray();
      console.log(`\nDatabase: ${dbName}`);
      for (const coll of collections) {
        const count = await dbInstance.collection(coll.name).estimatedDocumentCount();
        if (count > 0) {
          console.log(`  - ${coll.name}: ${count} records`);
        }
      }
    }
  } finally {
    await client.close();
  }
}

main().catch(console.error);
