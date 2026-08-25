import bcrypt from 'bcryptjs';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoUri = process.env.MONGO_URI;
const mongoDbName = process.env.MONGO_DB_NAME || 'mvhs_production';

async function main() {
  if (!mongoUri) {
    console.error('MONGO_URI is not configured in .env');
    process.exit(1);
  }
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(mongoDbName);
    const hash = bcrypt.hashSync('admin123', 10);
    const result = await db.collection('users').updateOne(
      { username: 'admin' },
      { $set: { passwordHash: hash, loginAttempts: 0, lockedUntil: null } }
    );
    if (result.matchedCount === 0) {
      console.log('Could not find user "admin" in MongoDB. Seeding a new admin account...');
      await db.collection('users').insertOne({
        username: 'admin',
        fullName: 'Admin User',
        role: 'admin',
        status: 'active',
        email: 'admin@demo.com',
        mobile: '+91 90000 00001',
        gender: 'Male',
        joined: new Date().toISOString().slice(0, 10),
        passwordHash: hash,
        createdAt: new Date().toISOString()
      });
      console.log('🎉 Seeded new admin account!');
    } else {
      console.log('🎉 Reset admin password to "admin123" in MongoDB!');
    }
  } finally {
    await client.close();
  }
}

main().catch(console.error);
