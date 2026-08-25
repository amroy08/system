import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';

// Loads commonly needed reference data (classes, subjects, teachers, students, parents)
export function useLookups(keys = ['classes']) {
  const [data, setData] = useState({ classes: [], subjects: [], teachers: [], students: [], parents: [] });
  const [loading, setLoading] = useState(true);
  const keySignature = keys.join('\u0000');

  const reload = useCallback(async () => {
    setLoading(true);
    const out = {};
    await Promise.all(keySignature.split('\u0000').filter(Boolean).map(async (k) => {
      try {
        const url = k === 'teachers' ? '/teachers' : `/${k}`;
        const { data: d } = await api.get(url);
        out[k] = d;
      } catch { out[k] = []; }
    }));
    setData((prev) => ({ ...prev, ...out }));
    setLoading(false);
  }, [keySignature]);

  useEffect(() => { reload(); }, [reload]);
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
