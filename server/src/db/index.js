import { config } from '../config.js';
import { fileStore } from './fileStore.js';
import { mongoStore } from './mongoStore.js';

// Single switch point between file-based storage and MongoDB Atlas.
// Set DB_DRIVER=mongo and MONGO_URI=... in server/.env to use cloud.mongodb.com.
const store = config.dbDriver === 'mongo' ? mongoStore : fileStore;

export async function initDb() {
  await store.init();
  console.log(`[db] Using driver: ${config.dbDriver}`);
}

export function col(name) {
  return store.collection(name);
}

export async function flushDb() {
  await store.flush?.();
}

export async function reloadDb() {
  await store.reload?.();
}

export async function closeDb() {
  await store.close?.();
}

// Atomic-ish sequence counters for admission numbers, receipts, asset tags, etc.
export async function nextSeq(key) {
  return store.nextSeq(key);
}
