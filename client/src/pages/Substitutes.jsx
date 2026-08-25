import { useEffect, useState } from 'react';
import { RefreshCw, Plus, Trash2 } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups } from '../hooks/useLookups';
import { DataTable, Field, Modal, Badge, Confirm } from '../components/ui';

export default function Substitutes() {
  const { notify, user } = useApp();
  const { teachers } = useLookups(['teachers']);
  const [rows, setRows] = useState([]);
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), absentTeacherId: '', substituteTeacherId: '', day: 'Monday', notes: '' });
  const [periods, setPeriods] = useState([]);
  const canWrite = ['admin', 'clerk', 'supervisor'].includes(user?.role);

  const load = () => api.get('/teachers/substitutes').then(({ data }) => setRows(data));
  useEffect(() => { load(); }, []);

  // Load absent teacher's periods when teacher/day changes
  useEffect(() => {
    if (!form.absentTeacherId) { setPeriods([]); return; }
    api.get('/teachers/substitutes/periods', { params: { teacherId: form.absentTeacherId, day: form.day } })
      .then(({ data }) => setPeriods(data));
  }, [form.absentTeacherId, form.day]);

  const tName = (id) => teachers.find((t) => t._id === id)?.fullName || '—';

  const save = async () => {
    try {
      await api.post('/teachers/substitutes', {
        date: form.date,
        absentTeacherId: form.absentTeacherId,
        absentTeacherName: tName(form.absentTeacherId),
        substituteTeacherId: form.substituteTeacherId,
        substituteTeacherName: tName(form.substituteTeacherId),
        periods: periods.map((p) => ({ day: p.day, period: p.period, subjectName: p.subjectName, start: p.start, end: p.end })),
        notes: form.notes,
      });
      notify('Substitute allocated');
      setModal(null); load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const columns = [
    { key: 'date', label: 'Date' },
    { key: 'absentTeacherName', label: 'Absent Teacher', render: (r) => <b>{r.absentTeacherName}</b> },
    { key: 'substituteTeacherName', label: 'Substitute', render: (r) => <Badge value={r.substituteTeacherName} color="bg-teal" /> },
    { label: 'Periods Covered', value: (r) => (r.periods || []).length, render: (r) => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(r.periods || []).map((p, i) => <Badge key={i} value={`P${p.period} ${p.subjectName || ''}`} color="bg-gray" />)}
      </div>
    )},
    { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
    { label: 'Actions', sortable: false, noExport: true, render: (r) => canWrite && (
      <div className="row-actions">
        <button className="act-del" title="Remove" onClick={() => setConfirmDel(r)}><Trash2 size={15} /></button>
      </div>
    )},
  ];

  return (
    <>
      <div className="page-head">
        <h2><RefreshCw size={20} /> Substitute Management</h2>
        <div className="spacer" />
        {canWrite && (
          <button className="btn btn-green" onClick={() => {
            setForm({ date: new Date().toISOString().slice(0, 10), absentTeacherId: '', substituteTeacherId: '', day: 'Monday', notes: '' });
            setPeriods([]);
            setModal({ type: 'form' });
          }}><Plus size={15} /> Allocate Substitute</button>
        )}
      </div>

      <p className="small muted mb">When a teacher is absent, load their timetable periods and allocate another teacher to cover them.</p>

      <DataTable columns={columns} rows={rows} title="Substitutes Report" exportName="substitutes" />

      {modal?.type === 'form' && (
        <Modal title="Allocate Substitute" icon={RefreshCw} size="lg" onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" disabled={!form.absentTeacherId || !form.substituteTeacherId} onClick={save}>Allocate</button>
          </>}>
          <div className="form-grid">
            <Field label="Date" required><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Day (for timetable lookup)">
              <select value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}>
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Absent Teacher" required>
              <select value={form.absentTeacherId} onChange={(e) => setForm({ ...form, absentTeacherId: e.target.value })}>
                <option value="">Select teacher…</option>
                {teachers.map((t) => <option key={t._id} value={t._id}>{t.fullName}</option>)}
              </select>
            </Field>
            <Field label="Substitute Teacher" required>
              <select value={form.substituteTeacherId} onChange={(e) => setForm({ ...form, substituteTeacherId: e.target.value })}>
                <option value="">Select teacher…</option>
                {teachers.filter((t) => t._id !== form.absentTeacherId && t.status === 'active').map((t) => (
                  <option key={t._id} value={t._id}>{t.fullName}</option>
                ))}
              </select>
            </Field>
            <div className="full">
              <div className="card-title">Periods to Cover ({form.day})</div>
              {periods.length === 0 && <p className="muted small">No periods found for this teacher on {form.day}.</p>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {periods.map((p, i) => (
                  <Badge key={i} value={`Period ${p.period} · ${p.subjectName} (${p.start}-${p.end})`} color="bg-blue" />
                ))}
              </div>
            </div>
            <Field label="Notes" full><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm message="Remove this substitute allocation?"
          onNo={() => setConfirmDel(null)}
          onYes={async () => {
            try { await api.delete(`/teachers/substitutes/${confirmDel._id}`); notify('Removed'); load(); }
            catch (e) { notify(errMsg(e), 'error'); }
            setConfirmDel(null);
          }} />
      )}
    </>
  );
}
