import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { config } from '../config.js';

function writeJsonAtomically(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fd = fs.openSync(temporary, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, file);
}

// Very small MongoDB-like query matcher so the same query objects work
// against both the file store and the real MongoDB driver.
function matchValue(docValue, cond) {
  if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, v]) => {
      switch (op) {
        case '$in': return v.includes(docValue);
        case '$nin': return !v.includes(docValue);
        case '$ne': return docValue !== v;
        case '$gt': return docValue > v;
        case '$gte': return docValue >= v;
        case '$lt': return docValue < v;
        case '$lte': return docValue <= v;
        case '$regex': return new RegExp(v, cond.$options || '').test(String(docValue ?? ''));
        case '$options': return true;
        case '$exists': return v ? docValue !== undefined : docValue === undefined;
        default: return false;
      }
    });
  }
  return docValue === cond;
}

function matches(doc, query = {}) {
  return Object.entries(query).every(([key, cond]) => {
    if (key === '$or') return cond.some((q) => matches(doc, q));
    if (key === '$and') return cond.every((q) => matches(doc, q));
    const value = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
    return matchValue(value, cond);
  });
}

class FileCollection {
  constructor(name) {
    this.name = name;
    this.file = path.join(config.dataDir, `${name}.json`);
    this.docs = this._load();
    this._writeTimer = null;
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf-8'));
    } catch {
      return [];
    }
  }

  _persist() {
    // Debounced write so bulk operations don't hammer the disk
    clearTimeout(this._writeTimer);
    this._writeTimer = setTimeout(() => {
      writeJsonAtomically(this.file, this.docs);
    }, 50);
  }

  flush() {
    clearTimeout(this._writeTimer);
    writeJsonAtomically(this.file, this.docs);
  }

  reload() {
    clearTimeout(this._writeTimer);
    this.docs = this._load();
  }

  async find(query = {}, { sort, limit, skip } = {}) {
    let out = this.docs.filter((d) => matches(d, query));
    if (sort) {
      const [[field, dir]] = Object.entries(sort);
      out = [...out].sort((a, b) => {
        const av = a[field], bv = b[field];
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * dir;
      });
    }
    if (skip) out = out.slice(skip);
    if (limit) out = out.slice(0, limit);
    return structuredClone(out);
  }

  async findOne(query = {}) {
    const doc = this.docs.find((d) => matches(d, query));
    return doc ? structuredClone(doc) : null;
  }

  async insertOne(doc) {
    const toInsert = { _id: doc._id || nanoid(12), ...doc, createdAt: doc.createdAt || new Date().toISOString() };
    this.docs.push(toInsert);
    this._persist();
    return structuredClone(toInsert);
  }

  async insertMany(docs) {
    const out = [];
    for (const d of docs) out.push(await this.insertOne(d));
    return out;
  }

  async updateOne(query, changes) {
    const doc = this.docs.find((d) => matches(d, query));
    if (!doc) return null;
    Object.assign(doc, changes, { updatedAt: new Date().toISOString() });
    this._persist();
    return structuredClone(doc);
  }

  async updateMany(query, changes) {
    let n = 0;
    for (const doc of this.docs) {
      if (matches(doc, query)) {
        Object.assign(doc, changes, { updatedAt: new Date().toISOString() });
        n++;
      }
    }
    if (n) this._persist();
    return n;
  }

  async deleteOne(query) {
    const idx = this.docs.findIndex((d) => matches(d, query));
    if (idx === -1) return 0;
    this.docs.splice(idx, 1);
    this._persist();
    return 1;
  }

  async deleteMany(query) {
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => !matches(d, query));
    const removed = before - this.docs.length;
    if (removed) this._persist();
    return removed;
  }

  async count(query = {}) {
    return this.docs.filter((d) => matches(d, query)).length;
  }

  async nextSequence(key) {
    let counter = this.docs.find((doc) => doc.key === key);
    if (!counter) {
      counter = { _id: nanoid(12), key, value: 0, createdAt: new Date().toISOString() };
      this.docs.push(counter);
    }
    counter.value += 1;
    counter.updatedAt = new Date().toISOString();
    this._persist();
    return counter.value;
  }
}

const collections = new Map();

export const fileStore = {
  async init() {
    fs.mkdirSync(config.dataDir, { recursive: true });
  },
  collection(name) {
    if (!collections.has(name)) collections.set(name, new FileCollection(name));
    return collections.get(name);
  },
  flush() {
    for (const collection of collections.values()) collection.flush();
  },
  reload() {
    for (const collection of collections.values()) collection.reload();
  },
  nextSeq(key) {
    return this.collection('counters').nextSequence(key);
  },
};
