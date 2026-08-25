import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCog, Settings2, Plus, Trash2, Star } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups, className } from '../hooks/useLookups';
import { DataTable, StatusTabs, Field, Modal, Badge, KpiCard } from '../components/ui';

export default function Teachers() {
  const { notify, user } = useApp();
  const { classes, subjects } = useLookups(['classes', 'subjects']);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('all');
  const [modal, setModal] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [newAssign, setNewAssign] = useState({ classId: '', subjectId: '' });
  const canWrite = ['admin', 'clerk', 'supervisor'].includes(user?.role);
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();

  const load = () => api.get('/teachers').then(({ data }) => setRows(data));
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    all: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    inactive: rows.filter((r) => r.status === 'inactive').length,
    suspended: rows.filter((r) => r.status === 'suspended').length,
  }), [rows]);

  const filtered = tab === 'all' ? rows : rows.filter((r) => r.status === tab);
  const totalAssignments = rows.reduce((s, r) => s + r.assignmentCount, 0);
  const classTeachers = rows.filter((r) => r.classTeacherOf).length;

  const openManage = async (t) => {
    const { data } = await api.get('/teachers/assignments', { params: { teacherId: t._id } });
    setAssignments(data);
    setNewAssign({ classId: '', subjectId: '' });
    setModal({ type: 'manage', data: t });
  };

  const addAssignment = async () => {
    try {
      await api.post('/teachers/assignments', { teacherId: modal.data._id, ...newAssign });
      const { data } = await api.get('/teachers/assignments', { params: { teacherId: modal.data._id } });
      setAssignments(data);
      setNewAssign({ classId: '', subjectId: '' });
      notify('Assignment added');
      load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const removeAssignment = async (id) => {
    try {
      await api.delete(`/teachers/assignments/${id}`);
      setAssignments((a) => a.filter((x) => x._id !== id));
      notify('Assignment removed');
      load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const columns = [
    { key: 'fullName', label: 'Teacher', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="badge bg-navy">{(r.fullName || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
        <div><b>{r.fullName}</b><div className="small muted">@{r.username}</div></div>
      </div>
    )},
    { key: 'email', label: 'Contact', render: (r) => <div className="small">{r.email}<br />{r.mobile}</div> },
    { key: 'specialization', label: 'Specialization', render: (r) => <Badge value={r.specialization} color="bg-teal" /> },
    { key: 'classCount', label: 'Classes', render: (r) => <Badge value={String(r.classCount)} color="bg-blue" /> },
    { key: 'subjectCount', label: 'Subjects', render: (r) => <Badge value={String(r.subjectCount)} color="bg-purple" /> },
    { key: 'classTeacherOf', label: 'Class Teacher Of', render: (r) => r.classTeacherOf
      ? <span><Star size={12} style={{ color: '#f59e0b', verticalAlign: '-1px' }} /> {r.classTeacherOf}</span>
      : <span className="muted">—</span> },
    { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
    { label: 'Actions', sortable: false, noExport: true, render: (r) => canWrite && (
      <button className="btn btn-xs btn-navy" onClick={() => openManage(r)}><Settings2 size={13} /> Manage</button>
    )},
  ];

  return (
    <>
      <div className="page-head">
        <h2><UserCog size={20} /> Teachers Management</h2>
        <div className="spacer" />
        {isAdmin && (
          <button className="btn btn-green" title="Opens the user form with username & password fields" onClick={() => navigate('/users?add=teacher')}>
            <Plus size={15} /> Add Teacher
          </button>
        )}
      </div>

      <div className="kpi-grid">
        <KpiCard color="navy" icon={UserCog} value={counts.all} label="Total Teachers" />
        <KpiCard color="green" icon={UserCog} value={counts.active} label="Active" />
        <KpiCard color="teal" icon={Settings2} value={totalAssignments} label="Total Assignments" />
        <KpiCard color="orange" icon={Star} value={classTeachers} label="Class Teachers" />
      </div>

      <StatusTabs active={tab} onChange={setTab} tabs={[
        { key: 'all', label: 'All', count: counts.all, color: 'navy' },
        { key: 'active', label: 'Active', count: counts.active, color: 'green' },
        { key: 'inactive', label: 'Inactive', count: counts.inactive, color: 'gray' },
        { key: 'suspended', label: 'Suspended', count: counts.suspended, color: 'red' },
      ]} />

      <DataTable columns={columns} rows={filtered} title="Teachers Report" exportName="teachers" />

      {modal?.type === 'manage' && (
        <Modal title={`Assignments — ${modal.data.fullName}`} icon={Settings2} size="lg" onClose={() => setModal(null)}>
          <div className="table-wrap mb">
          <table className="data-table">
            <thead><tr><th>Class</th><th>Subject</th><th></th></tr></thead>
            <tbody>
              {assignments.length === 0 && <tr className="empty-row"><td colSpan={3}>No assignments yet</td></tr>}
              {assignments.map((a) => (
                <tr key={a._id}>
                  <td>{className(classes, a.classId)}</td>
                  <td>{subjects.find((s) => s._id === a.subjectId)?.name || '—'}</td>
                  <td><button className="act-del row-actions" onClick={() => removeAssignment(a._id)}><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="form-grid" style={{ alignItems: 'end' }}>
            <Field label="Class">
              <select value={newAssign.classId} onChange={(e) => setNewAssign({ ...newAssign, classId: e.target.value })}>
                <option value="">Select class…</option>
                {classes.filter((c) => c.status === 'active').map((c) => <option key={c._id} value={c._id}>{c.name} {c.section} ({c.academicYear})</option>)}
              </select>
            </Field>
            <Field label="Subject">
              <select value={newAssign.subjectId} onChange={(e) => setNewAssign({ ...newAssign, subjectId: e.target.value })}>
                <option value="">Select subject…</option>
                {subjects.filter((s) => !newAssign.classId || !s.classIds?.length || s.classIds.includes(newAssign.classId)).map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <div className="full">
              <button className="btn btn-green btn-sm" disabled={!newAssign.classId || !newAssign.subjectId} onClick={addAssignment}>
                <Plus size={14} /> Assign Class & Subject
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
