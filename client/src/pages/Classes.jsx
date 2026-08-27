import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { School, Plus, Pencil, Trash2, CalendarRange, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups } from '../hooks/useLookups';
import { DataTable, Field, Modal, Badge, Confirm } from '../components/ui';

const EMPTY = { name: '', section: 'A', academicYear: '2026-2027', capacity: 30, room: '', classTeacherId: '', status: 'active' };

export default function Classes() {
  const { notify, user } = useApp();
  const { teachers, students } = useLookups(['teachers', 'students']);
  const [rows, setRows] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmDel, setConfirmDel] = useState(null);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const canWrite = ['admin', 'clerk', 'supervisor'].includes(user?.role);

  const load = () => api.get('/classes').then(({ data }) => setRows(data));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (params.get('add')) { setForm(EMPTY); setModal({ type: 'form' }); } }, [params]);

  const save = async () => {
    try {
      if (modal.data?._id) await api.put(`/classes/${modal.data._id}`, form);
      else await api.post('/classes', form);
      notify('Class saved');
      setModal(null); load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const teacherName = (id) => teachers.find((t) => t._id === id)?.fullName || '—';
  const strength = (id) => students.filter((s) => s.classId === id && s.status === 'active').length;

  const columns = [
    { key: 'name', label: 'Class', render: (r) => <b>{r.name} {r.section}</b>, exportValue: (r) => `${r.name} ${r.section}` },
    { key: 'academicYear', label: 'Academic Year', render: (r) => <Badge value={r.academicYear} color="bg-blue" /> },
    { key: 'room', label: 'Location / Room' },
    { key: 'capacity', label: 'Capacity' },
    { label: 'Strength', value: (r) => strength(r._id), render: (r) => {
      const n = strength(r._id);
      return <span className={n >= r.capacity ? 'txt-red' : ''}><b>{n}</b> / {r.capacity}</span>;
    }},
    { key: 'classTeacherId', label: 'Class Teacher', value: (r) => teacherName(r.classTeacherId) },
    { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
    { label: 'Actions', sortable: false, noExport: true, render: (r) => (
      <div className="row-actions">
        <button className="act-view" title="View timetable" onClick={() => navigate(`/timetable?classId=${r._id}`)}><CalendarRange size={15} /></button>
        <button className="act-green" title="View students" onClick={() => navigate(`/students`)}><Users size={15} /></button>
        {canWrite && <button className="act-edit" title="Edit" onClick={() => { setForm({ ...EMPTY, ...r }); setModal({ type: 'form', data: r }); }}><Pencil size={15} /></button>}
        {user?.role === 'admin' && <button className="act-del" title="Delete" onClick={() => setConfirmDel(r)}><Trash2 size={15} /></button>}
      </div>
    )},
  ];

  return (
    <>
      <div className="page-head">
        <h2><School size={20} /> Classes & Sections</h2>
        <div className="spacer" />
        {canWrite && <button className="btn btn-green" onClick={() => { setForm(EMPTY); setModal({ type: 'form' }); }}><Plus size={15} /> Add Class</button>}
      </div>

      <DataTable columns={columns} rows={rows} title="Classes Report" exportName="classes" />

      {modal?.type === 'form' && (
        <Modal title={modal.data ? 'Edit Class' : 'Add Class'} icon={School} onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" onClick={save}>{modal.data ? 'Update Class' : 'Add Class'}</button>
          </>}>
          <div className="form-grid">
            <Field label="Class Name" required hint="Class + Section + Year must be unique"><input value={form.name} placeholder="e.g. Class 1" onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Section" required>
              <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })}>
                {['A', 'B', 'C', 'D', 'E'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Academic Year" required><input value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} /></Field>
            <Field label="Capacity"><input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: +e.target.value })} /></Field>
            <Field label="Location / Room"><input value={form.room} placeholder="e.g. Room 101" onChange={(e) => setForm({ ...form, room: e.target.value })} /></Field>
            <Field label="Class Teacher">
              <select value={form.classTeacherId} onChange={(e) => setForm({ ...form, classTeacherId: e.target.value })}>
                <option value="">Select teacher…</option>
                {teachers.map((t) => <option key={t._id} value={t._id}>{t.fullName}</option>)}
              </select>
            </Field>
            <Field label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>active</option><option>archived</option></select></Field>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm message={`Delete class "${confirmDel.name} ${confirmDel.section} (${confirmDel.academicYear})"?`}
          onNo={() => setConfirmDel(null)}
          onYes={async () => {
            try { await api.delete(`/classes/${confirmDel._id}`); notify('Class deleted'); load(); }
            catch (e) { notify(errMsg(e), 'error'); }
            setConfirmDel(null);
          }} />
      )}
    </>
  );
}
