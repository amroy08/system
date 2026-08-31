import { useEffect, useState } from 'react';
import { UserCheck, Save, CopyCheck, CheckCheck, XCircle } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups } from '../hooks/useLookups';
import { Field, Badge } from '../components/ui';
import { formatClass } from '../utils/classNames';

const STATUSES = [
  { key: 'present', label: 'P', title: 'Present' },
  { key: 'absent', label: 'A', title: 'Absent' },
  { key: 'late', label: 'L', title: 'Late' },
  { key: 'halfday', label: 'H', title: 'Half-day' },
  { key: 'leave', label: 'LV', title: 'Leave' },
];

export default function Attendance() {
  const { notify } = useApp();
  const { classes } = useLookups(['classes']);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!classId || !date) { setSheet(null); return; }
    api.get('/attendance', { params: { classId, date } })
      .then(({ data }) => setSheet(data))
      .catch((e) => notify(errMsg(e), 'error'));
  }, [classId, date, notify]);

  const setStatus = (studentId, status) => {
    setSheet((s) => ({
      ...s,
      records: s.records.map((r) => (r.studentId === studentId ? { ...r, status } : r)),
    }));
  };

  const markAll = (status) => setSheet((s) => ({ ...s, records: s.records.map((r) => ({ ...r, status })) }));

  const copyYesterday = async () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    const fromDate = d.toISOString().slice(0, 10);
    try {
      const { data } = await api.get('/attendance/copy', { params: { classId, fromDate } });
      setSheet((s) => ({
        ...s,
        records: s.records.map((r) => {
          const prev = data.records.find((x) => x.studentId === r.studentId);
          return prev ? { ...r, status: prev.status } : r;
        }),
      }));
      notify(`Copied attendance from ${fromDate}`);
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.post('/attendance', {
        classId, date,
        records: sheet.records.map((r) => ({ studentId: r.studentId, status: r.status || 'present' })),
      });
      notify('Attendance saved successfully');
      setSheet((s) => ({ ...s, saved: true }));
    } catch (e) { notify(errMsg(e), 'error'); }
    setBusy(false);
  };

  const counts = {};
  for (const r of sheet?.records || []) if (r.status) counts[r.status] = (counts[r.status] || 0) + 1;
  const selectedClass = classes.find((item) => item._id === classId);

  return (
    <div className="academic-workspace attendance-workspace">
      <div className="page-head academic-page-head">
        <div className="academic-title-icon accent-green"><UserCheck size={21} /></div>
        <div>
          <h2>Daily Attendance</h2>
          <p>Load a class register, mark attendance, and save the daily sheet.</p>
        </div>
      </div>

      <div className="filter-card academic-filter-panel attendance-filter-panel">
        <div className="academic-filter-copy">
          <span className="academic-eyebrow">Register setup</span>
          <b>Select class and date</b>
          <small>Bulk actions become available after the register loads.</small>
        </div>
        <div className="filter-grid">
          <Field label="Class" required>
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Select class…</option>
              {classes.filter((c) => c.status === 'active').map((c) => (
                <option key={c._id} value={c._id}>{formatClass(c)}</option>
              ))}
            </select>
          </Field>
          <Field label="Date" required><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <div className="field attendance-bulk-field"><label>Quick actions</label>
            <div className="attendance-bulk-actions">
              <button className="btn btn-sm btn-green" disabled={!sheet} onClick={() => markAll('present')}><CheckCheck size={14} /> Mark All Present</button>
              <button className="btn btn-sm btn-red" disabled={!sheet} onClick={() => markAll('absent')}><XCircle size={14} /> Mark All Absent</button>
              <button className="btn btn-sm btn-blue" disabled={!sheet} onClick={copyYesterday}><CopyCheck size={14} /> Copy from Yesterday</button>
            </div>
          </div>
        </div>
      </div>

      {!sheet && <div className="card academic-empty-state">
        <div className="academic-empty-icon accent-green"><UserCheck size={26} /></div>
        <h3>Ready for today’s attendance</h3>
        <p>Select a class and date to load the student register.</p>
      </div>}

      {sheet && (
        <div className="table-card">
          <div className="academic-table-context">
            <div>
              <span className="academic-eyebrow">Attendance register</span>
              <h3>{selectedClass ? formatClass(selectedClass, false) : 'Selected class'} <small>· {date}</small></h3>
            </div>
            <div className="academic-context-tags"><span>{sheet.records.length} students</span>{sheet.saved && <span className="is-warning">Previously saved</span>}</div>
          </div>
          <div className="table-toolbar">
            <div className="attendance-counts">
              {STATUSES.map((s) => (
                <Badge key={s.key} value={`${s.title}: ${counts[s.key] || 0}`}
                  color={{ present: 'bg-green', absent: 'bg-red', late: 'bg-yellow', halfday: 'bg-blue', leave: 'bg-purple' }[s.key]} />
              ))}
            </div>
            <div className="spacer" />
            <button className="btn btn-green" disabled={busy || sheet.records.length === 0} onClick={save}>
              <Save size={15} /> {busy ? 'Saving…' : 'Save Attendance'}
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Roll</th><th>Adm #</th><th>Student</th><th>Status</th></tr>
              </thead>
              <tbody>
                {sheet.records.length === 0 && <tr className="empty-row"><td colSpan={4}>No active students in this class</td></tr>}
                {sheet.records.map((r) => (
                  <tr key={r.studentId}>
                    <td>{r.rollNo || '—'}</td>
                    <td className="mono">{r.admissionNo}</td>
                    <td><b>{r.name}</b></td>
                    <td>
                      <div className="attendance-status-control">
                        {STATUSES.map((s) => (
                          <button key={s.key} title={s.title}
                            className={`att-btn ${r.status === s.key ? `on-${s.key}` : ''}`}
                            onClick={() => setStatus(r.studentId, s.key)}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
