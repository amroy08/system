import { useCallback, useEffect, useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, ClipboardCheck, BookOpen } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups } from '../hooks/useLookups';
import { DataTable, Field, Modal, Badge, Confirm } from '../components/ui';
import { AttachmentField, AttachmentLink } from '../components/Attachment';
import { formatClass } from '../utils/classNames';

const EMPTY = { title: '', description: '', type: 'Homework', classId: '', subjectId: '', dueDate: '', status: 'active', attachment: null };

export default function Homework() {
  const { notify, user } = useApp();
  const { classes = [], subjects = [] } = useLookups(['classes', 'subjects']);
  
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmDel, setConfirmDel] = useState(null);
  const [tab, setTab] = useState('all');

  const isStaff = ['admin', 'clerk', 'supervisor', 'teacher'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/homework');
      setRows(data);
    } catch (e) {
      notify(errMsg(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    try {
      if (!form.title || !form.classId || !form.subjectId || !form.dueDate) {
        notify('Please fill in all required fields.', 'error');
        return;
      }
      if (!form.description?.trim() && !form.attachment?._id) {
        notify('Add written instructions, an attachment, or both.', 'error');
        return;
      }
      if (modal.data?._id) {
        await api.put(`/homework/${modal.data._id}`, form);
        notify('Task updated successfully');
      } else {
        await api.post('/homework', form);
        notify('Task assigned successfully');
      }
      setModal(null);
      load();
    } catch (e) {
      notify(errMsg(e), 'error');
    }
  };

  // Helper to map IDs to Names
  const getClassName = (id) => {
    const c = classes.find(x => x._id === id);
    return c ? formatClass(c, false) : 'N/A';
  };

  const getSubjectName = (id) => {
    const s = subjects.find(x => x._id === id);
    return s ? s.name : 'N/A';
  };

  // Calculate urgency color for student/parent view
  const getUrgencyBadge = (dueDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return { label: 'Overdue', color: 'bg-solid-red' };
    } else if (diffDays === 0) {
      return { label: 'Due Today', color: 'bg-solid-red' };
    } else if (diffDays === 1) {
      return { label: 'Due Tomorrow', color: 'bg-solid-orange' };
    } else if (diffDays <= 3) {
      return { label: `Due in ${diffDays} days`, color: 'bg-orange' };
    } else {
      return { label: `Due in ${diffDays} days`, color: 'bg-green' };
    }
  };

  // Filters
  const filtered = useMemo(() => {
    if (tab === 'all') return rows;
    return rows.filter(r => r.type.toLowerCase() === tab.toLowerCase());
  }, [rows, tab]);

  const columns = [
    { key: 'type', label: 'Type', render: (r) => {
      const colors = { Homework: 'bg-orange', Classwork: 'bg-teal', Assignment: 'bg-purple', Project: 'bg-navy' };
      return <Badge value={r.type} color={colors[r.type] || 'bg-gray'} />;
    }},
    { key: 'title', label: 'Title', render: (r) => <div><b>{r.title}</b><div className="small text-muted">{r.description?.slice(0, 50)}{r.description?.length > 50 ? '...' : ''}</div></div> },
    { key: 'classId', label: 'Class / Grade', render: (r) => getClassName(r.classId) },
    { key: 'subjectId', label: 'Subject', render: (r) => getSubjectName(r.subjectId) },
    { key: 'assignedDate', label: 'Assigned Date' },
    { key: 'dueDate', label: 'Due Date', render: (r) => {
      const urgency = getUrgencyBadge(r.dueDate);
      return (
        <div>
          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.dueDate}</span>
          <div style={{ marginTop: 2 }}><Badge value={urgency.label} color={urgency.color} /></div>
        </div>
      );
    }},
    { key: 'attachment', label: 'Material', sortable: false, render: (r) => <AttachmentLink attachment={r.attachment} compact /> },
    ...(isStaff ? [{ key: 'status', label: 'Status', render: (r) => <Badge value={r.status} color={r.status === 'active' ? 'bg-green' : 'bg-gray'} /> }] : []),
    ...(isStaff ? [{
      label: 'Actions',
      sortable: false,
      noExport: true,
      render: (r) => (
        <div className="row-actions">
          <button className="act-edit" title="Edit" onClick={() => { setForm({ ...EMPTY, ...r }); setModal({ type: 'form', data: r }); }}><Pencil size={15} /></button>
          <button className="act-del" title="Delete" onClick={() => setConfirmDel(r)}><Trash2 size={15} /></button>
        </div>
      )
    }] : [])
  ];

  return (
    <div style={{ padding: '24px' }} className="space-y-6">
      <div className="page-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '20px', fontWeight: '700' }}>
          <ClipboardCheck size={22} className="txt-primary" />
          Homework & Classwork Tasks
        </h2>
        {isStaff && (
          <button className="btn btn-green" onClick={() => { setForm(EMPTY); setModal({ type: 'form' }); }}>
            <Plus size={15} /> Assign Task
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        {[['all', 'All Tasks'], ['homework', 'Homework'], ['classwork', 'Classwork'], ['assignment', 'Assignments'], ['project', 'Projects']].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              background: tab === k ? 'var(--primary)' : 'var(--bg-card)',
              color: tab === k ? '#ffffff' : 'var(--txt-muted)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card text-center" style={{ padding: '40px' }}>
          <div className="animate-spin text-2xl text-slate-500 mb-2">⏳</div>
          <p>Loading homework sheets...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="card text-center" style={{ padding: '50px 20px', color: 'var(--txt-muted)' }}>
          <BookOpen size={36} style={{ margin: '0 auto 10px', opacity: 0.6 }} />
          <p className="font-semibold text-sm">No tasks assigned yet</p>
          <p className="text-xs muted">When teachers assign homework or classwork, they will be listed here.</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={filtered} title="Assigned Work List" exportName="homework" />
      )}

      {/* Assign / Edit Task Modal */}
      {modal?.type === 'form' && (
        <Modal
          title={modal.data ? 'Edit Assigned Task' : 'Assign New Task'}
          icon={ClipboardCheck}
          onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" onClick={save}>{modal.data ? 'Update Task' : 'Assign Task'}</button>
          </>}
        >
          <div className="form-grid">
            <Field label="Task Title" required>
              <input value={form.title} placeholder="e.g. Read Chapter 3 and solve exercises" onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>

            <Field label="Class / Grade" required>
              <select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">Select Class</option>
                {classes.map(c => <option key={c._id} value={c._id}>{formatClass(c)}</option>)}
              </select>
            </Field>

            <Field label="Subject" required>
              <select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                <option value="">Select Subject</option>
                {subjects.map(s => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}
              </select>
            </Field>

            <Field label="Task Type" required>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {['Homework', 'Classwork', 'Assignment', 'Project'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>

            <Field label="Due Date" required>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </Field>

            <Field label="Status" required>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active (Notify Parents)</option>
                <option value="draft">Draft (Private)</option>
              </select>
            </Field>

            <Field label="Instructions / Description" style={{ gridColumn: 'span 2' }}>
              <textarea
                value={form.description}
                rows={4}
                placeholder="Write detailed instructions for students here..."
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--txt)' }}
              />
            </Field>

            <Field label="Worksheet / Reference File" full>
              <AttachmentField value={form.attachment} onChange={(attachment) => setForm({ ...form, attachment })} scope="homework" />
            </Field>
          </div>
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {confirmDel && (
        <Confirm
          message={`Are you sure you want to delete task "${confirmDel.title}"?`}
          onNo={() => setConfirmDel(null)}
          onYes={async () => {
            try {
              await api.delete(`/homework/${confirmDel._id}`);
              notify('Task deleted successfully');
              load();
            } catch (e) {
              notify(errMsg(e), 'error');
            }
            setConfirmDel(null);
          }}
        />
      )}
    </div>
  );
}
