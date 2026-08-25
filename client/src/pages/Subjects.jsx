import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Plus, Pencil, Trash2, GraduationCap, CheckCircle2, Target, Search, Check } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups } from '../hooks/useLookups';
import { DataTable, Field, Modal, Badge, Confirm, KpiCard } from '../components/ui';

const EMPTY = { name: '', code: '', maxMarks: 100, passingMarks: 33, classIds: [] };

export default function Subjects() {
  const { notify, user } = useApp();
  const { classes } = useLookups(['classes']);
  const [rows, setRows] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmDel, setConfirmDel] = useState(null);
  const [classSearch, setClassSearch] = useState('');
  const [params] = useSearchParams();
  const canWrite = ['admin', 'clerk', 'supervisor'].includes(user?.role);

  const load = () => api.get('/subjects').then(({ data }) => setRows(data));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (params.get('add')) { setForm(EMPTY); setModal({ type: 'form' }); } }, [params]);

  const save = async () => {
    try {
      if (modal.data?._id) await api.put(`/subjects/${modal.data._id}`, form);
      else await api.post('/subjects', form);
      notify('Subject saved');
      setModal(null); load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const toggleClass = (id) => {
    setForm((f) => ({
      ...f,
      classIds: f.classIds.includes(id) ? f.classIds.filter((x) => x !== id) : [...f.classIds, id],
    }));
  };

  const openForm = (subject = null) => {
    setClassSearch('');
    setForm(subject ? { ...EMPTY, ...subject, classIds: subject.classIds || [] } : { ...EMPTY, classIds: [] });
    setModal({ type: 'form', data: subject });
  };

  const activeClasses = useMemo(() => classes.filter((item) => item.status === 'active'), [classes]);
  const visibleClasses = useMemo(() => {
    const query = classSearch.trim().toLowerCase();
    if (!query) return activeClasses;
    return activeClasses.filter((item) => `${item.name} ${item.section} ${item.academicYear}`.toLowerCase().includes(query));
  }, [activeClasses, classSearch]);

  const assignedSubjects = rows.filter((row) => (row.classIds || []).length > 0).length;
  const coveredClasses = new Set(rows.flatMap((row) => row.classIds || [])).size;
  const averagePassing = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + ((Number(row.passingMarks) || 0) / Math.max(Number(row.maxMarks) || 1, 1)) * 100, 0) / rows.length)
    : 0;

  const columns = [
    { key: 'name', label: 'Subject', render: (r) => <b>{r.name}</b> },
    { key: 'code', label: 'Code', render: (r) => <span className="mono">{r.code}</span> },
    { key: 'maxMarks', label: 'Max Marks' },
    { key: 'passingMarks', label: 'Passing Marks' },
    { label: 'Assigned Classes', value: (r) => (r.classIds || []).length, render: (r) => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(r.classIds || []).slice(0, 4).map((id) => {
          const c = classes.find((x) => x._id === id);
          return c ? <Badge key={id} value={`${c.name} ${c.section}`} color="bg-blue" /> : null;
        })}
        {(r.classIds || []).length > 4 && <Badge value={`+${r.classIds.length - 4} more`} color="bg-gray" />}
        {!(r.classIds || []).length && <span className="muted">All / none</span>}
      </div>
    )},
    { label: 'Actions', sortable: false, noExport: true, render: (r) => (
      <div className="row-actions">
        {canWrite && <button className="act-edit" title="Edit" onClick={() => openForm(r)}><Pencil size={15} /></button>}
        {user?.role === 'admin' && <button className="act-del" title="Delete" onClick={() => setConfirmDel(r)}><Trash2 size={15} /></button>}
      </div>
    )},
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2><BookOpen size={20} /> Subjects Management</h2>
          <p className="small muted" style={{ marginTop: 4 }}>Configure grading rules and assign subjects to the correct classes.</p>
        </div>
        <div className="spacer" />
        {canWrite && <button className="btn btn-green" onClick={() => openForm()}><Plus size={15} /> Add Subject</button>}
      </div>

      <div className="kpi-grid">
        <KpiCard color="navy" icon={BookOpen} value={rows.length} label="Total Subjects" />
        <KpiCard color="green" icon={CheckCircle2} value={assignedSubjects} label="Assigned Subjects" />
        <KpiCard color="teal" icon={GraduationCap} value={`${coveredClasses}/${activeClasses.length}`} label="Classes Covered" />
        <KpiCard color="orange" icon={Target} value={`${averagePassing}%`} label="Average Pass Mark" />
      </div>

      <DataTable columns={columns} rows={rows} title="Subjects Report" exportName="subjects" />

      {modal?.type === 'form' && (
        <Modal title={modal.data ? 'Edit Subject' : 'Add Subject'} icon={BookOpen} size="lg" onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" disabled={!form.name.trim()} onClick={save}>{modal.data ? 'Update Subject' : 'Add Subject'}</button>
          </>}>
          <div className="form-grid">
            <Field label="Subject Name" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Subject Code"><input value={form.code} placeholder="e.g. MATH-01" onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Max Marks"><input type="number" value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: +e.target.value })} /></Field>
            <Field label="Passing Marks"><input type="number" value={form.passingMarks} onChange={(e) => setForm({ ...form, passingMarks: +e.target.value })} /></Field>
            <Field label="Assign to Classes" full>
              <div className="class-picker">
                <div className="class-picker-toolbar">
                  <div className="mini-search">
                    <Search size={14} />
                    <input value={classSearch} onChange={(e) => setClassSearch(e.target.value)} placeholder="Search classes…" />
                  </div>
                  <span className="small muted">{form.classIds.length} of {activeClasses.length} selected</span>
                  <button type="button" className="btn btn-xs btn-blue" onClick={() => setForm((current) => ({ ...current, classIds: activeClasses.map((item) => item._id) }))}>Select All</button>
                  <button type="button" className="btn btn-xs btn-gray" onClick={() => setForm((current) => ({ ...current, classIds: [] }))}>Clear</button>
                </div>
                <div className="class-picker-grid">
                  {visibleClasses.map((item) => {
                    const selected = form.classIds.includes(item._id);
                    return (
                      <button type="button" key={item._id} className={`class-choice ${selected ? 'selected' : ''}`} onClick={() => toggleClass(item._id)}>
                        <span className="class-choice-check">{selected && <Check size={13} />}</span>
                        <span>
                          <b>{item.name} {item.section}</b>
                          <small>{item.academicYear}</small>
                        </span>
                      </button>
                    );
                  })}
                  {!visibleClasses.length && <div className="student-search-empty">No matching classes</div>}
                </div>
              </div>
            </Field>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm message={`Delete subject "${confirmDel.name}"?`}
          onNo={() => setConfirmDel(null)}
          onYes={async () => {
            try { await api.delete(`/subjects/${confirmDel._id}`); notify('Subject deleted'); load(); }
            catch (e) { notify(errMsg(e), 'error'); }
            setConfirmDel(null);
          }} />
      )}
    </>
  );
}
