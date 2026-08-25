import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const { config } = await import('../config.js');

async function main() {
  if (!config.mongoUri) {
    console.error('MONGO_URI is not configured in .env');
    process.exit(1);
  }
  console.log(`Connecting to MongoDB at: ${config.mongoUri.replace(/:([^@]+)@/, ':****@')}`);
  const client = new MongoClient(config.mongoUri);
  try {
    await client.connect();
    const db = client.db(config.mongoDbName);
    const collections = await db.listCollections().toArray();
    for (const coll of collections) {
      if (coll.name.startsWith('system.')) continue;
      await db.collection(coll.name).deleteMany({});
      console.log(`Wiped collection: ${coll.name}`);
    }
    console.log('🎉 MongoDB database cleared successfully!');
  } finally {
    await client.close();
  }
}

main().catch(console.error);
