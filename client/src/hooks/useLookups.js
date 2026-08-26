import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';

const LOOKUP_TTL_MS = 60_000;
const cache = new Map();
const inflight = new Map();

async function fetchLookup(key, force = false) {
  const cached = cache.get(key);
  if (!force && cached && Date.now() - cached.loadedAt < LOOKUP_TTL_MS) return cached.data;
  if (!force && inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    const url = key === 'teachers' ? '/teachers' : `/${key}`;
    const { data } = await api.get(url);
    cache.set(key, { data, loadedAt: Date.now() });
    return data;
  })().finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

// Loads commonly needed reference data (classes, subjects, teachers, students, parents)
export function useLookups(keys = ['classes']) {
  const [data, setData] = useState({ classes: [], subjects: [], teachers: [], students: [], parents: [] });
  const [loading, setLoading] = useState(true);
  const keySignature = keys.join('\u0000');

  const load = useCallback(async (force = false) => {
    setLoading(true);
    const out = {};
    await Promise.all(keySignature.split('\u0000').filter(Boolean).map(async (k) => {
      try {
        out[k] = await fetchLookup(k, force);
      } catch { out[k] = []; }
    }));
    setData((prev) => ({ ...prev, ...out }));
    setLoading(false);
  }, [keySignature]);

  const reload = useCallback(() => load(true), [load]);

  useEffect(() => { load(false); }, [load]);
  return { ...data, loading, reload };
}

export const className = (classes, id) => {
  const c = classes.find((x) => x._id === id);
  return c ? `${c.name} ${c.section} (${c.academicYear})` : '—';
};

export const studentName = (students, id) => {
  const s = students.find((x) => x._id === id);
  return s ? `${s.firstName} ${s.lastName || ''}`.trim() : '—';
};
