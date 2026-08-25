import { MongoClient } from 'mongodb';
import { config } from '../config.js';

async function run() {
  const client = new MongoClient(config.mongoUri || 'mongodb://localhost:27017/school_mgmt');
  await client.connect();
  const db = client.db();
  console.log('Connected to MongoDB');

  const classes = await db.collection('classes').find({}).toArray();

  const prePrimaryIds = [];
  const primaryIds = [];
  const secondaryIds = [];

  classes.forEach(c => {
    const name = c.name.toLowerCase();
    if (name.includes('nursery') || name.includes('kg') || name.includes('pre-primary')) {
      prePrimaryIds.push(c._id);
    } else if (name.includes('1') || name.includes('2') || name.includes('3') || name.includes('4')) {
      primaryIds.push(c._id);
    } else {
      secondaryIds.push(c._id);
    }
  });

  const now = new Date().toISOString();
  const structures = [
    // Pre-Primary
    { name: 'Admission Fee (Pre-Primary)', category: 'one-time', frequency: 'one-time', amount: 2000, classIds: prePrimaryIds, status: 'active', createdAt: now },
    { name: 'Tuition Fee (Pre-Primary)', category: 'tuition', frequency: 'monthly', amount: 1500, classIds: prePrimaryIds, status: 'active', createdAt: now },
    { name: 'Term Fee (Pre-Primary)', category: 'exam', frequency: 'annual', amount: 3000, classIds: prePrimaryIds, status: 'active', createdAt: now },
    { name: 'MS Fee (Pre-Primary)', category: 'activity', frequency: 'annual', amount: 2000, classIds: prePrimaryIds, status: 'active', createdAt: now },
    { name: 'Stationery Fee (Pre-Primary)', category: 'activity', frequency: 'annual', amount: 4500, classIds: prePrimaryIds, status: 'active', createdAt: now },
    
    // Primary
    { name: 'Admission Fee (Primary)', category: 'one-time', frequency: 'one-time', amount: 2000, classIds: primaryIds, status: 'active', createdAt: now },
    { name: 'Tuition Fee (Primary)', category: 'tuition', frequency: 'monthly', amount: 1500, classIds: primaryIds, status: 'active', createdAt: now },
    { name: 'Term Fee (Primary)', category: 'exam', frequency: 'bi-annual', amount: 1500, classIds: primaryIds, status: 'active', createdAt: now },
    { name: 'MS Fee (Primary)', category: 'activity', frequency: 'annual', amount: 2500, classIds: primaryIds, status: 'active', createdAt: now },
    
    // Secondary
    { name: 'Admission Fee (Secondary)', category: 'one-time', frequency: 'one-time', amount: 2200, classIds: secondaryIds, status: 'active', createdAt: now },
    { name: 'Tuition Fee (Secondary)', category: 'tuition', frequency: 'monthly', amount: 1800, classIds: secondaryIds, status: 'active', createdAt: now },
    { name: 'Term Fee (Secondary)', category: 'exam', frequency: 'bi-annual', amount: 1800, classIds: secondaryIds, status: 'active', createdAt: now },
    { name: 'MS Fee (Secondary)', category: 'activity', frequency: 'annual', amount: 3600, classIds: secondaryIds, status: 'active', createdAt: now }
  ];

  await db.collection('feeStructures').deleteMany({});
  await db.collection('feeStructures').insertMany(structures);
  console.log(`Successfully synced ${structures.length} fee structures.`);
  await client.close();
}

run().catch(console.error);
