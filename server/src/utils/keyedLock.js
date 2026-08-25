const locks = new Map();

export async function acquireKeyedLock(key) {
  const normalizedKey = String(key || 'global');
  const previous = locks.get(normalizedKey) || Promise.resolve();
  let unlock;
  const current = new Promise((resolve) => { unlock = resolve; });
  locks.set(normalizedKey, current);
  await previous;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    unlock();
    if (locks.get(normalizedKey) === current) locks.delete(normalizedKey);
  };
}
