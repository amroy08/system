import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, Pencil, Trash2, Award, Megaphone, Trophy, Send } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups } from '../hooks/useLookups';
import { DataTable, StatusTabs, Field, Modal, Badge, Confirm } from '../components/ui';
import { formatClass } from '../utils/classNames';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const EXAM_TYPES = ['Weekly Test', 'Unit Test 1', 'First Semester Exam', 'Unit Test 2', 'Second Semester Exam', 'Other / Additional Exam'];
const LEGACY_EXAM_TYPES = ['Unit Test', 'Quarterly', 'Half Yearly', 'Annual', 'Mock Test'];
const EMPTY = { name: '', type: 'Unit Test 1', academicYear: '2026-2027', classIds: [], startDate: '', endDate: '', status: 'scheduled' };

export default function Exams() {
  const { notify, user } = useApp();
  const { classes, students, parents } = useLookups(['classes', 'students', 'parents']);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [results, setResults] = useState(null);
  const [resultClass, setResultClass] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const [confirmSchedule, setConfirmSchedule] = useState(null);
  const navigate = useNavigate();
  const canWrite = ['admin', 'clerk', 'supervisor'].includes(user?.role);

  const load = () => api.get('/exams').then(({ data }) => setRows(data));
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    all: rows.length,
    scheduled: rows.filter((r) => r.status === 'scheduled').length,
    ongoing: rows.filter((r) => r.status === 'ongoing').length,
    published: rows.filter((r) => r.status === 'published').length,
  }), [rows]);

  const filtered = rows.filter((exam) =>
    (tab === 'all' || exam.status === tab) && (typeFilter === 'all' || exam.type === typeFilter)
  );

  const save = async () => {
    try {
      const payload = { ...form, classIds: Array.isArray(form.classIds) ? form.classIds : [] };
      if (modal.data?._id) await api.put(`/exams/${modal.data._id}`, payload);
      else await api.post('/exams', payload);
      notify('Exam saved');
      setModal(null); load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const publish = async (r) => {
    try {
      const { data } = await api.post(`/exams/${r._id}/publish`);
      notify(`Published ${data.publishedSheets} mark sheet(s). Results now visible to students & parents.`);
      load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const prepareSchedulePublish = async (exam) => {
    try {
      const { data } = await api.post('/email/recipient-preview', exam.classIds?.length
        ? { audience: 'class', classIds: exam.classIds }
        : { audience: 'parents' });
      setConfirmSchedule({ exam, preview: data });
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const publishSchedule = async () => {
    const exam = confirmSchedule.exam;
    setConfirmSchedule(null);
    try {
      const { data } = await api.post(`/exams/${exam._id}/publish-schedule`);
      notify(`Exam schedule published; ${data.queuedCount} private email${data.queuedCount === 1 ? '' : 's'} queued.`);
      load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const openResults = async (r, classId = '') => {
    try {
      const { data } = await api.get(`/exams/${r._id}/results`, { params: classId ? { classId } : {} });
      setResults(data);
      setResultClass(classId);
      setModal({ type: 'results', data: r });
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const getClassName = (classIds) => {
    if (!classIds || classIds.length === 0) return 'All Classes';
    const labels = classIds.map((id) => classes.find((item) => item._id === id)).filter(Boolean).map((item) => formatClass(item, false));
    return labels.length ? `${labels.slice(0, 2).join(', ')}${labels.length > 2 ? ` +${labels.length - 2}` : ''}` : 'N/A';
  };

  const recipientHint = useMemo(() => {
    const selectedClassIds = form.classIds?.length ? new Set(form.classIds) : null;
    const selectedStudents = students.filter((record) => record.status === 'active' && (!selectedClassIds || selectedClassIds.has(record.classId)));
    const parentIds = new Set(selectedStudents.flatMap((record) => record.parentIds || []));
    const selectedParents = parents.filter((record) => record.status === 'active' && (!selectedClassIds || parentIds.has(record._id)));
    const valid = new Set();
    let missing = 0;
    let dummy = 0;
    let invalid = 0;
    selectedParents.forEach((parent) => {
      const email = String(parent.email || '').trim().toLowerCase();
      if (!email) missing++;
      else if (email.endsWith('@mvhs.edu.in')) dummy++;
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid++;
      else valid.add(email);
    });
    return `${valid.size} deliverable · ${missing} missing · ${dummy} dummy · ${invalid} invalid. Leave all grades unselected to notify every eligible parent.`;
  }, [form.classIds, parents, students]);

  const columns = [
    { key: 'name', label: 'Exam', render: (r) => <b>{r.name}</b> },
    { key: 'type', label: 'Type', render: (r) => <Badge value={r.type} color="bg-purple" /> },
    { key: 'classIds', label: 'Class / Grade', render: (r) => getClassName(r.classIds) },
    { key: 'academicYear', label: 'Year' },
    { key: 'startDate', label: 'Start Date' },
    { key: 'endDate', label: 'End Date' },
    { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
    { key: 'emailStatus', label: 'Schedule Email', render: (r) => <Badge value={r.emailStatus || 'not sent'} color={r.emailStatus === 'sent' ? 'bg-green' : r.emailStatus === 'failed' ? 'bg-red' : 'bg-gray'} /> },
    { label: 'Actions', sortable: false, noExport: true, render: (r) => (
      <div className="row-actions">
        <button className="act-navy" title="Marks entry" onClick={() => navigate(`/marks?examId=${r._id}`)}><Award size={15} /></button>
        <button className="act-view" title="Results & toppers" onClick={() => openResults(r)}><Trophy size={15} /></button>
        {user?.role === 'admin' && r.status !== 'published' && (
          <button className="act-green" title="Publish results (Admin only)" onClick={() => publish(r)}><Megaphone size={15} /></button>
        )}
        {user?.role === 'admin' && <button className="act-navy" title={r.schedulePublishedAt ? 'Publish revised schedule and notify parents' : 'Publish schedule and notify parents'} onClick={() => prepareSchedulePublish(r)}><Send size={15} /></button>}
        {canWrite && <button className="act-edit" title="Edit" onClick={() => { setForm({ ...EMPTY, ...r, classIds: r.classIds || (r.classId ? [r.classId] : []) }); setModal({ type: 'form', data: r }); }}><Pencil size={15} /></button>}
        {user?.role === 'admin' && <button className="act-del" title="Delete" onClick={() => setConfirmDel(r)}><Trash2 size={15} /></button>}
      </div>
    )},
  ];

  return (
    <div className="academic-workspace exams-workspace">
      <div className="page-head academic-page-head">
        <div className="academic-title-icon accent-orange"><ClipboardList size={21} /></div>
        <div>
          <h2>Exams Management</h2>
          <p>Plan assessments, manage marks, and publish results from one workspace.</p>
        </div>
        <div className="spacer" />
        {canWrite && <button className="btn btn-green" onClick={() => { setForm(EMPTY); setModal({ type: 'form' }); }}><Plus size={15} /> Create Exam</button>}
      </div>

      <StatusTabs active={tab} onChange={setTab} tabs={[
        { key: 'all', label: 'All', count: counts.all, color: 'navy' },
        { key: 'scheduled', label: 'Scheduled', count: counts.scheduled, color: 'teal' },
        { key: 'ongoing', label: 'Ongoing', count: counts.ongoing, color: 'orange' },
        { key: 'published', label: 'Published', count: counts.published, color: 'green' },
      ]} />

      <div className="filter-card exam-sequence-card mb">
        <div className="exam-sequence-head">
          <div>
            <span className="academic-eyebrow">Academic sequence</span>
            <b>Standard assessment cycle</b>
          </div>
          <Field label="Filter by exam type">
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter exams by type">
              <option value="all">All exam types</option>
              {EXAM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              {LEGACY_EXAM_TYPES.some((type) => rows.some((exam) => exam.type === type)) && (
                <optgroup label="Legacy exam types">
                  {LEGACY_EXAM_TYPES.filter((type) => rows.some((exam) => exam.type === type)).map((type) => <option key={type} value={type}>{type}</option>)}
                </optgroup>
              )}
            </select>
          </Field>
        </div>
        <div className="exam-sequence-track">
          {['Unit Test 1', 'First Semester', 'Unit Test 2', 'Second Semester'].map((label, index) => (
            <div key={label} className="exam-sequence-step"><span>{index + 1}</span><b>{label}</b></div>
          ))}
        </div>
        <p>Weekly and additional tests can be scheduled independently. Teachers can draft, submit, or lock marks; only Admin can publish results.</p>
      </div>

      <DataTable columns={columns} rows={filtered} title="Exams Report" exportName="exams" />

      {modal?.type === 'form' && (
        <Modal title={modal.data ? 'Edit Exam' : 'Create Exam'} icon={ClipboardList} onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" onClick={save}>{modal.data ? 'Update Exam' : 'Create Exam'}</button>
          </>}>
          <div className="form-grid">
            <Field label="Exam Name" required><input value={form.name} placeholder="e.g. Unit Test 1" onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Type">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {EXAM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                {modal.data && LEGACY_EXAM_TYPES.includes(form.type) && (
                  <optgroup label="Current legacy type"><option value={form.type}>{form.type}</option></optgroup>
                )}
              </select>
            </Field>
            <Field label="Academic Year"><input value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} /></Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {['scheduled', 'ongoing', 'completed'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Notify Grades / Sections" full hint={recipientHint}>
              <div className="multi-check-grid">
                {classes.map((item) => {
                  const selected = form.classIds?.includes(item._id);
                  return (
                    <label key={item._id} className={selected ? 'selected' : ''}>
                      <input type="checkbox" checked={Boolean(selected)} onChange={(event) => setForm((current) => ({
                        ...current,
                        classIds: event.target.checked
                          ? [...(current.classIds || []), item._id]
                          : (current.classIds || []).filter((id) => id !== item._id),
                      }))} />
                      <span>{formatClass(item)}</span>
                    </label>
                  );
                })}
              </div>
            </Field>
            <Field label="Start Date" required><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
            <Field label="End Date"><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {modal?.type === 'results' && results && (
        <Modal title={`Results — ${modal.data.name}`} icon={Trophy} size="lg" onClose={() => { setModal(null); setResults(null); }}>
          <div className="filter-grid mb">
            <Field label="Filter by class">
              <select value={resultClass} onChange={(e) => openResults(modal.data, e.target.value)}>
                <option value="">All classes</option>
                {classes.map((c) => <option key={c._id} value={c._id}>{formatClass(c)}</option>)}
              </select>
            </Field>
          </div>

          <div className="card-title"><Trophy size={15} /> Top Performers</div>
          <div className="table-wrap mb">
          <table className="data-table">
            <thead><tr><th>Rank</th><th>Student</th><th>Total</th><th>%</th></tr></thead>
            <tbody>
              {results.ranked.slice(0, 10).map((r) => (
                <tr key={r.studentId}>
                  <td><Badge value={`#${r.rank}`} color={r.rank <= 3 ? 'bg-solid-orange' : 'bg-gray'} /></td>
                  <td><b>{r.name}</b> <span className="small muted">({r.admissionNo})</span></td>
                  <td>{r.total} / {r.max}</td>
                  <td><b>{r.pct}%</b></td>
                </tr>
              ))}
              {results.ranked.length === 0 && <tr className="empty-row"><td colSpan={4}>No marks entered yet</td></tr>}
            </tbody>
          </table>
          </div>

          {Object.keys(results.gradeDist).length > 0 && (
            <>
              <div className="card-title mt">Grade Distribution</div>
              <Bar
                data={{
                  labels: Object.keys(results.gradeDist),
                  datasets: [{ label: 'Students', data: Object.values(results.gradeDist), backgroundColor: '#0f2248' }],
                }}
                options={{ plugins: { legend: { display: false } } }}
                height={90}
              />
            </>
          )}
        </Modal>
      )}

      {confirmDel && (
        <Confirm message={`Delete exam "${confirmDel.name}" and all its marks?`}
          onNo={() => setConfirmDel(null)}
          onYes={async () => {
            try { await api.delete(`/exams/${confirmDel._id}`); notify('Exam deleted'); load(); }
            catch (e) { notify(errMsg(e), 'error'); }
            setConfirmDel(null);
          }} />
      )}

      {confirmSchedule && (
        <Confirm
          message={`Publish “${confirmSchedule.exam.name}” schedule? ${confirmSchedule.preview.eligibleCount} private email${confirmSchedule.preview.eligibleCount === 1 ? '' : 's'} will be queued; ${confirmSchedule.preview.skipped.missing || 0} missing, ${confirmSchedule.preview.skipped.dummy || 0} dummy and ${confirmSchedule.preview.skipped.invalid || 0} invalid addresses will be skipped.`}
          onNo={() => setConfirmSchedule(null)}
          onYes={publishSchedule}
        />
      )}
    </div>
  );
}
