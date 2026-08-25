import { MongoClient } from 'mongodb';

async function main() {
  const client = new MongoClient('mongodb://localhost:27017');
  const terms = ['amroy', 'alistair', 'simpson'];
  try {
    await client.connect();
    const admin = client.db().admin();
    const dbInfo = await admin.listDatabases();
    console.log('Available Local MongoDB Databases:');
    
    for (const dbDetail of dbInfo.databases) {
      const dbName = dbDetail.name;
      if (['admin', 'local', 'config'].includes(dbName)) continue;
      
      const dbInstance = client.db(dbName);
      const collections = await dbInstance.listCollections().toArray();
      console.log(`\nDatabase: ${dbName}`);
      for (const coll of collections) {
        const count = await dbInstance.collection(coll.name).estimatedDocumentCount();
        if (count > 0) {
          console.log(`  - ${coll.name}: ${count} records`);
          
          // Search this collection
          const cursor = dbInstance.collection(coll.name).find({});
          while (await cursor.hasNext()) {
            const doc = await cursor.next();
            const str = JSON.stringify(doc).toLowerCase();
            for (const term of terms) {
              if (str.includes(term)) {
                console.log(`    🎉 Found "${term}" in collection "${coll.name}":`);
                console.log(JSON.stringify(doc, null, 6));
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to query local MongoDB:', err);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
