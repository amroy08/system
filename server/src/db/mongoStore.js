import { MongoClient, ObjectId } from 'mongodb';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { ensureMongoIndexes } from './indexes.js';

// Wraps the official MongoDB driver behind the same tiny interface as fileStore,
// so switching drivers requires zero changes elsewhere in the app.
// We use string _ids (nanoid) instead of ObjectId so data is portable between drivers.

let client = global._mongoClient;
let db = global._mongoDb;

function objectIdCandidate(value) {
  return typeof value === 'string' && ObjectId.isValid(value) && String(new ObjectId(value)) === value;
}

function expandObjectIdValue(value) {
  return objectIdCandidate(value) ? [value, new ObjectId(value)] : [value];
}

function normalizeMongoQuery(query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return query;
  const normalized = { ...query };
  const idQuery = normalized._id;
  if (objectIdCandidate(idQuery)) {
    normalized._id = { $in: expandObjectIdValue(idQuery) };
  } else if (idQuery && typeof idQuery === 'object' && !Array.isArray(idQuery) && Array.isArray(idQuery.$in)) {
    normalized._id = {
      ...idQuery,
      $in: idQuery.$in.flatMap(expandObjectIdValue),
    };
  }
  return normalized;
}

class MongoCollection {
  constructor(name) {
    this.col = db.collection(name);
  }

  async find(query = {}, { sort, limit, skip, projection } = {}) {
    let cursor = this.col.find(normalizeMongoQuery(query), projection ? { projection } : undefined);
    if (sort) cursor = cursor.sort(sort);
    if (skip) cursor = cursor.skip(skip);
    if (limit) cursor = cursor.limit(limit);
    return cursor.toArray();
  }

  async findOne(query = {}) {
    return this.col.findOne(normalizeMongoQuery(query));
  }

  async insertOne(doc) {
    const toInsert = { _id: doc._id || nanoid(12), ...doc, createdAt: doc.createdAt || new Date().toISOString() };
    await this.col.insertOne(toInsert);
    return toInsert;
  }

  async insertMany(docs) {
    const out = docs.map((d) => ({ _id: d._id || nanoid(12), ...d, createdAt: d.createdAt || new Date().toISOString() }));
    if (out.length) await this.col.insertMany(out);
    return out;
  }

  async updateOne(query, changes) {
    const res = await this.col.findOneAndUpdate(
      normalizeMongoQuery(query),
      { $set: { ...changes, updatedAt: new Date().toISOString() } },
      { returnDocument: 'after' }
    );
    return res;
  }

  async updateMany(query, changes) {
    const res = await this.col.updateMany(normalizeMongoQuery(query), { $set: { ...changes, updatedAt: new Date().toISOString() } });
    return res.modifiedCount;
  }

  async deleteOne(query) {
    const res = await this.col.deleteOne(normalizeMongoQuery(query));
    return res.deletedCount;
  }

  async deleteMany(query) {
    const res = await this.col.deleteMany(normalizeMongoQuery(query));
    return res.deletedCount;
  }

  async count(query = {}) {
    return this.col.countDocuments(normalizeMongoQuery(query));
  }
}
const collections = new Map();

// Derive direct shard replica set URI dynamically from mongoUri without hardcoding credentials in code
function getDirectReplicaUri(sourceUri) {
  if (!sourceUri || !sourceUri.startsWith('mongodb+srv://')) return sourceUri;
  const match = sourceUri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/?]+)(.*)$/);
  if (!match) return sourceUri;
  const [, user, pass, host, rest] = match;
  if (host.includes('cluster0.ebevlic.mongodb.net')) {
    const query = rest.includes('?') ? rest.split('?')[1] : '';
    const params = new URLSearchParams(query);
    params.set('ssl', 'true');
    params.set('replicaSet', 'atlas-lpgh00-shard-0');
    params.set('authSource', 'admin');
    params.set('retryWrites', 'true');
    params.set('w', 'majority');
    return `mongodb://${user}:${pass}@ac-alxiilz-shard-00-00.ebevlic.mongodb.net:27017,ac-alxiilz-shard-00-01.ebevlic.mongodb.net:27017,ac-alxiilz-shard-00-02.ebevlic.mongodb.net:27017/${config.mongoDbName}?${params.toString()}`;
  }
  return sourceUri;
}

export const mongoStore = {
  async init() {
    if (!client) {
      const primaryUri = config.mongoUri;
      const directUri = getDirectReplicaUri(config.mongoUri);
      const clientOptions = {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
        socketTimeoutMS: 45000,
        family: 4,
      };

      try {
        client = new MongoClient(primaryUri, clientOptions);
        await client.connect();
      } catch (firstErr) {
        if (directUri && directUri !== primaryUri) {
          console.warn('[db] Primary MongoDB URI connection timed out; attempting direct replica set hosts...');
          client = new MongoClient(directUri, clientOptions);
          await client.connect();
        } else {
          throw firstErr;
        }
      }

      global._mongoClient = client;
      global._mongoDb = client.db(config.mongoDbName);
      db = global._mongoDb;
      await ensureMongoIndexes(db);
      console.log(`[db] Connected to MongoDB: ${config.mongoDbName}`);
    } else {
      db = global._mongoDb;
    }
  },
  collection(name) {
    if (!collections.has(name)) collections.set(name, new MongoCollection(name));
    return collections.get(name);
  },
  async close() {
    await client?.close();
  },
  async nextSeq(key) {
    const result = await db.collection('counters').findOneAndUpdate(
      { key },
      {
        $inc: { value: 1 },
        $setOnInsert: { _id: nanoid(12), createdAt: new Date().toISOString() },
        $set: { updatedAt: new Date().toISOString() },
      },
      { upsert: true, returnDocument: 'after' }
    );
    return result.value;
  },
};
