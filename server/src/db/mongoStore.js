import { MongoClient, ObjectId } from 'mongodb';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { ensureMongoIndexes } from './indexes.js';

// Wraps the official MongoDB driver behind the same tiny interface as fileStore,
// so switching drivers requires zero changes elsewhere in the app.
// We use string _ids (nanoid) instead of ObjectId so data is portable between drivers.

let client;
let db;

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

  async find(query = {}, { sort, limit, skip } = {}) {
    let cursor = this.col.find(normalizeMongoQuery(query));
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

export const mongoStore = {
  async init() {
    client = new MongoClient(config.mongoUri);
    await client.connect();
    db = client.db(config.mongoDbName);
    await ensureMongoIndexes(db);
    console.log(`[db] Connected to MongoDB: ${config.mongoDbName}`);
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
