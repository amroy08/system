import { useEffect, useMemo, useState } from 'react';
import { UsersRound, Plus, Pencil, Trash2, GraduationCap, Link2, Mail, UserCheck } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups, className } from '../hooks/useLookups';
import { DataTable, Field, Modal, Badge, Confirm, FilterBar, KpiCard } from '../components/ui';
import { formatClass } from '../utils/classNames';

const EMPTY = { name: '', relation: 'Father', mobile: '', email: '', occupation: '', address: '', status: 'active' };
const EMPTY_FILTERS = { classId: '', relation: '', linkType: '', emailType: '', status: '' };
const hasDeliverableEmail = (parent) => {
  const email = String(parent.email || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith('@mvhs.edu.in');
};

export default function Parents() {
  const { notify, user } = useApp();
  const { students, classes, reload } = useLookups(['students', 'classes']);
  const [rows, setRows] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmDel, setConfirmDel] = useState(null);
  const [linkStudentId, setLinkStudentId] = useState('');
  const [linkClassId, setLinkClassId] = useState('');
  const [linkSearch, setLinkSearch] = useState('');
  const [showLinkResults, setShowLinkResults] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const canWrite = ['admin', 'clerk', 'supervisor'].includes(user?.role);

  const load = () => api.get('/parents').then(({ data }) => setRows(data));
  useEffect(() => { load(); }, []);

  const childrenByParent = useMemo(() => {
    const map = new Map();
    students.forEach((student) => (student.parentIds || []).forEach((parentId) => {
      if (!map.has(parentId)) map.set(parentId, []);
      map.get(parentId).push(student);
    }));
    return map;
  }, [students]);
  const childrenOf = (parentId) => childrenByParent.get(parentId) || [];

  const openChildren = (parent) => {
    setLinkStudentId('');
    setLinkClassId('');
    setLinkSearch('');
    setShowLinkResults(false);
    setModal({ type: 'children', data: parent });
  };

  const linkableStudents = useMemo(() => {
    if (!modal?.data?._id || !linkClassId) return [];
    const query = linkSearch.trim().toLowerCase();
    return students
      .filter((s) => {
        if (s.status !== 'active' || s.classId !== linkClassId || (s.parentIds || []).includes(modal.data._id)) return false;
        if (!query) return true;
        const name = `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase();
        return name.includes(query) || String(s.admissionNo || '').toLowerCase().includes(query);
      })
      .sort((a, b) => `${a.firstName} ${a.lastName || ''}`.localeCompare(`${b.firstName} ${b.lastName || ''}`));
  }, [students, modal, linkClassId, linkSearch]);

  const filteredRows = useMemo(() => rows.filter((parent) => {
    const children = childrenByParent.get(parent._id) || [];
    if (filters.classId && !children.some((student) => student.classId === filters.classId)) return false;
    if (filters.relation && String(parent.relation || '').toLowerCase() !== filters.relation) return false;
    if (filters.status && parent.status !== filters.status) return false;
    if (filters.emailType === 'deliverable' && !hasDeliverableEmail(parent)) return false;
    if (filters.emailType === 'missing' && hasDeliverableEmail(parent)) return false;
    if (filters.linkType === 'none' && children.length !== 0) return false;
    if (filters.linkType === 'single' && children.length !== 1) return false;
    if (filters.linkType === 'multiple' && children.length < 2) return false;
    return true;
  }), [rows, childrenByParent, filters]);

  const linkedParents = rows.filter((parent) => childrenOf(parent._id).length > 0).length;
  const multiChildParents = rows.filter((parent) => childrenOf(parent._id).length > 1).length;
  const deliverableEmails = rows.filter(hasDeliverableEmail).length;

  const save = async () => {
    try {
      if (modal.data?._id) await api.put(`/parents/${modal.data._id}`, form);
      else await api.post('/parents', form);
      notify('Parent saved');
      setModal(null); load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const linkChild = async () => {
    try {
      if (modal.data.status !== 'active') return notify('Activate this parent before linking a student', 'error');
      const s = students.find((x) => x._id === linkStudentId);
      if (!s) return;
      const parentIds = [...new Set([...(s.parentIds || []), modal.data._id])];
      await api.put(`/students/${s._id}`, { parentIds });
      notify(`Linked ${s.firstName} to ${modal.data.name}`);
      setLinkStudentId('');
      setLinkSearch('');
      setShowLinkResults(false);
      reload();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const unlinkChild = async (s) => {
    try {
      await api.put(`/students/${s._id}`, { parentIds: (s.parentIds || []).filter((id) => id !== modal.data._id) });
      notify(`Unlinked ${s.firstName}`);
      reload();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const columns = [
    { key: 'name', label: 'Parent', render: (r) => <b>{r.name}</b> },
    { key: 'relation', label: 'Relation', render: (r) => <Badge value={r.relation} color="bg-blue" /> },
    { key: 'mobile', label: 'Mobile' },
    { key: 'email', label: 'Email', render: (r) => (
      <div>
        <span>{r.email || '—'}</span>
        <div className={`small ${hasDeliverableEmail(r) ? 'txt-green' : 'muted'}`} style={{ marginTop: 2 }}>
          {hasDeliverableEmail(r) ? 'Deliverable' : 'No deliverable email'}
        </div>
      </div>
    ) },
    { key: 'occupation', label: 'Occupation' },
    { label: 'Children', value: (r) => childrenOf(r._id).length, render: (r) => (
      <span className="link-like" onClick={() => openChildren(r)}>
        {childrenOf(r._id).length} linked
      </span>
    )},
    { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
    { label: 'Actions', sortable: false, noExport: true, render: (r) => (
      <div className="row-actions">
        <button className="act-view" title="Linked children" onClick={() => openChildren(r)}><GraduationCap size={15} /></button>
        {canWrite && <button className="act-edit" title="Edit" onClick={() => { setForm({ ...EMPTY, ...r }); setModal({ type: 'form', data: r }); }}><Pencil size={15} /></button>}
        {user?.role === 'admin' && <button className="act-del" title="Delete" onClick={() => setConfirmDel(r)}><Trash2 size={15} /></button>}
      </div>
    )},
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2><UsersRound size={20} /> Parents Management</h2>
          <p className="small muted" style={{ marginTop: 4 }}>Manage parent contacts, linked children, and portal communication readiness.</p>
        </div>
        <div className="spacer" />
        {canWrite && <button className="btn btn-green" onClick={() => { setForm(EMPTY); setModal({ type: 'form' }); }}><Plus size={15} /> Add Parent</button>}
      </div>

      <div className="kpi-grid">
        <KpiCard color="navy" icon={UsersRound} value={rows.length} label="Total Parents" />
        <KpiCard color="green" icon={UserCheck} value={linkedParents} label="Linked to Students" />
        <KpiCard color="purple" icon={GraduationCap} value={multiChildParents} label="Multiple Children" />
        <KpiCard color="teal" icon={Mail} value={deliverableEmails} label="Deliverable Emails" />
      </div>

      <FilterBar onClear={() => setFilters(EMPTY_FILTERS)}>
        <Field label="Grade / Class">
          <select value={filters.classId} onChange={(e) => setFilters({ ...filters, classId: e.target.value })}>
            <option value="">All grades</option>
            {classes.filter((item) => item.status === 'active').map((item) => <option key={item._id} value={item._id}>{formatClass(item, false)}</option>)}
          </select>
        </Field>
        <Field label="Relationship">
          <select value={filters.relation} onChange={(e) => setFilters({ ...filters, relation: e.target.value })}>
            <option value="">All relationships</option>
            <option value="father">Father</option><option value="mother">Mother</option><option value="guardian">Guardian</option>
          </select>
        </Field>
        <Field label="Child Links">
          <select value={filters.linkType} onChange={(e) => setFilters({ ...filters, linkType: e.target.value })}>
            <option value="">All link types</option>
            <option value="none">No linked child</option><option value="single">One child</option><option value="multiple">Multiple children</option>
          </select>
        </Field>
        <Field label="Email Availability">
          <select value={filters.emailType} onChange={(e) => setFilters({ ...filters, emailType: e.target.value })}>
            <option value="">All email types</option>
            <option value="deliverable">Deliverable email</option><option value="missing">Missing / placeholder email</option>
          </select>
        </Field>
        <Field label="Status">
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
        </Field>
      </FilterBar>

      <DataTable columns={columns} rows={filteredRows} title="Parents Report" exportName="parents" />

      {modal?.type === 'form' && (
        <Modal title={modal.data ? 'Edit Parent' : 'Add Parent'} icon={UsersRound} onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" onClick={save}>{modal.data ? 'Update' : 'Add'}</button>
          </>}>
          <div className="form-grid">
            <div className="form-section">Parent Information</div>
            <Field label="Name" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Relation"><select value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })}><option>Father</option><option>Mother</option><option>Guardian</option></select></Field>
            <div className="form-section">Contact Details</div>
            <Field label="Mobile"><input type="tel" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
            <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <div className="form-section">Additional Details</div>
            <Field label="Occupation"><input value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} /></Field>
            <Field label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>active</option><option>inactive</option></select></Field>
            <Field label="Address" full><textarea rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {modal?.type === 'children' && (
        <Modal title={`Linked Children — ${modal.data.name}`} icon={GraduationCap} onClose={() => setModal(null)}>
          {childrenOf(modal.data._id).map((s) => (
            <div key={s._id} className="card card-pad mb" style={{ border: '1px solid var(--border)', boxShadow: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="badge bg-navy">S</span>
              <div style={{ flex: 1 }}>
                <b>{s.firstName} {s.lastName}</b>
                <div className="small muted">{s.admissionNo} · {className(classes, s.classId)}</div>
              </div>
              {canWrite && <button className="btn btn-xs btn-red" onClick={() => unlinkChild(s)}>Unlink</button>}
            </div>
          ))}
          {childrenOf(modal.data._id).length === 0 && <p className="muted mb">No children linked yet.</p>}
          {canWrite && modal.data.status === 'active' && (
            <div className="form-grid" style={{ marginTop: 14 }}>
              <Field label="Class / Grade">
                <select value={linkClassId} onChange={(e) => {
                  setLinkClassId(e.target.value);
                  setLinkStudentId('');
                  setLinkSearch('');
                  setShowLinkResults(false);
                }}>
                  <option value="">Select class / grade…</option>
                  {classes.filter((c) => c.status === 'active').map((c) => (
                    <option key={c._id} value={c._id}>{formatClass(c, false)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Search student">
                <div className="student-search">
                  <input
                    type="search"
                    value={linkSearch}
                    disabled={!linkClassId}
                    placeholder={linkClassId ? 'Search by name or admission no.' : 'Select a class first'}
                    autoComplete="off"
                    onFocus={() => setShowLinkResults(true)}
                    onChange={(e) => {
                      setLinkSearch(e.target.value);
                      setLinkStudentId('');
                      setShowLinkResults(true);
                    }}
                  />
                  {showLinkResults && linkClassId && (
                    <div className="student-search-results">
                      {linkableStudents.length ? linkableStudents.map((s) => (
                        <button type="button" key={s._id} onClick={() => {
                          setLinkStudentId(s._id);
                          setLinkSearch(`${s.firstName} ${s.lastName || ''} — ${s.admissionNo}`);
                          setShowLinkResults(false);
                        }}>
                          <span>{s.firstName} {s.lastName || ''}</span>
                          <small>{s.admissionNo}</small>
                        </button>
                      )) : <div className="student-search-empty">No matching unlinked students</div>}
                    </div>
                  )}
                </div>
              </Field>
              <div className="full" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-navy btn-sm" disabled={!linkStudentId} onClick={linkChild}><Link2 size={14} /> Link Selected Student</button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {confirmDel && (
        <Confirm message={`Delete parent "${confirmDel.name}"?`}
          onNo={() => setConfirmDel(null)}
          onYes={async () => {
            try { await api.delete(`/parents/${confirmDel._id}`); notify('Parent deleted'); load(); }
            catch (e) { notify(errMsg(e), 'error'); }
            setConfirmDel(null);
          }} />
      )}
    </>
  );
}
