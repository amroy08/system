import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Award, Save, Send, Lock, Printer, GraduationCap, Trophy, CheckCheck } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups } from '../hooks/useLookups';
import { Field, Badge, KpiCard } from '../components/ui';
import { formatClass, displayClassName } from '../utils/classNames';

function StudentParentMarks() {
  const { user, notify } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('all');

  useEffect(() => {
    setLoading(true);
    const url = user?.role === 'parent' ? '/portal/parent' : '/portal/student';
    api.get(url)
      .then(({ data }) => {
        setData(data);
        if (user?.role === 'parent') {
          const children = [...(data.children || []), ...(data.formerChildren || [])];
          if (children.length > 0) setSelectedChildId(children[0].student._id);
        }
      })
      .catch((e) => notify(errMsg(e), 'error'))
      .finally(() => setLoading(false));
  }, [user?.role, notify]);

  if (loading) {
    return <div className="card card-pad">Loading exam results…</div>;
  }

  const isParent = user?.role === 'parent';
  const allChildren = isParent ? [...(data?.children || []), ...(data?.formerChildren || [])] : [];
  const currentSnap = isParent
    ? allChildren.find((c) => c.student._id === selectedChildId) || allChildren[0]
    : data;

  if (!currentSnap) {
    return (
      <div className="card card-pad muted">
        No linked student records found.
      </div>
    );
  }

  const results = currentSnap.results || [];

  const examMap = new Map();
  results.forEach(r => {
    if (r.examId && !examMap.has(r.examId)) {
      examMap.set(r.examId, r.examName);
    }
  });
  const distinctExams = Array.from(examMap.entries()).map(([id, name]) => ({ id, name }));

  const filteredResults = selectedExamId === 'all'
    ? results
    : results.filter(r => r.examId === selectedExamId);

  const totalSubjects = filteredResults.length;
  const passedCount = filteredResults.filter(r => r.grade !== 'F').length;
  const totalMarksScored = filteredResults.reduce((sum, r) => sum + (Number(r.marks) || 0), 0);
  const totalMaxMarks = filteredResults.reduce((sum, r) => sum + (Number(r.maxMarks) || 0), 0);
  const overallPct = totalMaxMarks ? Math.round((totalMarksScored / totalMaxMarks) * 100) : 0;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="page-head no-print">
        <div>
          <h2><Award size={20} /> Results & Marks</h2>
          <p className="muted small" style={{ margin: '4px 0 0 0' }}>
            {isParent
              ? `Viewing exam results for ${currentSnap.student.firstName} ${currentSnap.student.lastName || ''} (${currentSnap.className})`
              : `Viewing your published exam results (${currentSnap.className})`}
          </p>
        </div>
        <div className="spacer" />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {isParent && allChildren.length > 1 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="small muted">Child:</span>
              <select
                value={selectedChildId}
                onChange={(e) => setSelectedChildId(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 13, background: '#fff' }}
              >
                {allChildren.map((child) => (
                  <option key={child.student._id} value={child.student._id}>
                    {child.student.firstName} {child.student.lastName || ''} ({child.className})
                  </option>
                ))}
              </select>
            </div>
          )}
          {results.length > 0 && (
            <button className="btn btn-navy" onClick={() => window.print()}>
              <Printer size={15} /> Print Results
            </button>
          )}
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard color="navy" icon={GraduationCap} value={displayClassName(currentSnap.className)} label="Class / Section" />
        <KpiCard color="purple" icon={Award} value={results.length} label="Published Results" />
        <KpiCard color={overallPct >= 40 ? 'green' : 'red'} icon={Trophy} value={`${overallPct}%`} label="Overall Score" />
        <KpiCard color="teal" icon={CheckCheck} value={`${passedCount} / ${totalSubjects || 1}`} label="Subjects Passed" />
      </div>

      <div className="card card-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div className="card-title" style={{ margin: 0 }}>
            <Award size={16} /> Exam Results
          </div>
          {distinctExams.length > 1 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="small muted">Exam:</span>
              <select
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12, background: '#fff' }}
              >
                <option value="all">All Exams</option>
                {distinctExams.map((ex) => (
                  <option key={ex.id} value={ex.id}>{ex.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Exam Name</th>
              <th>Subject</th>
              <th>Marks</th>
              <th>Max Marks</th>
              <th>Grade</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredResults.map((r, i) => (
              <tr key={i}>
                <td><b>{r.examName}</b></td>
                <td>{r.subject}</td>
                <td><b className={r.grade === 'F' ? 'txt-red' : 'txt-green'}>{r.marks}</b></td>
                <td>{r.maxMarks}</td>
                <td><Badge value={r.grade} color={r.grade === 'F' ? 'bg-red' : 'bg-green'} /></td>
                <td>
                  <Badge
                    value={r.grade === 'F' ? 'Failed' : 'Passed'}
                    color={r.grade === 'F' ? 'bg-red' : 'bg-green'}
                  />
                </td>
              </tr>
            ))}
            {filteredResults.length === 0 && (
              <tr className="empty-row">
                <td colSpan={6} style={{ textAlign: 'center', padding: '24px 12px' }}>
                  {results.length === 0
                    ? 'No results have been published yet for this student.'
                    : 'No results found for the selected exam filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Marks() {
  const { notify, user } = useApp();

  if (['student', 'parent'].includes(user?.role)) {
    return <StudentParentMarks />;
  }

  const { classes, subjects } = useLookups(['classes', 'subjects']);
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();

  useEffect(() => {
    api.get('/exams').then(({ data }) => setExams(data));
    const pre = params.get('examId');
    if (pre) setExamId(pre);
  }, [params]);

  useEffect(() => {
    if (!examId || !classId || !subjectId) { setSheet(null); return; }
    api.get(`/exams/${examId}/marks`, { params: { classId, subjectId } })
      .then(({ data }) => setSheet(data))
      .catch((e) => notify(errMsg(e), 'error'));
  }, [examId, classId, subjectId, notify]);

  const classSubjects = subjects.filter((s) => !s.classIds?.length || s.classIds.includes(classId));
  const locked = sheet && ['locked', 'published'].includes(sheet.status) && user?.role === 'teacher';
  const selectedExam = exams.find((item) => item._id === examId);
  const selectedClass = classes.find((item) => item._id === classId);
  const completedFilters = [examId, classId, subjectId].filter(Boolean).length;
  const currentMax = Number(sheet?.maxMarks || sheet?.subject?.maxMarks || selectedExam?.maxMarks || 100);
  const currentPass = Number(sheet?.passingMarks || sheet?.subject?.passingMarks || selectedExam?.passingMarks || 35);

  const setMark = (studentId, marks) => {
    if (marks !== '' && (Number(marks) < 0 || Number(marks) > currentMax)) return;
    setSheet((s) => ({
      ...s,
      entries: s.entries.map((e) => (e.studentId === studentId ? { ...e, marks } : e)),
    }));
  };

  const save = async (action) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/exams/${examId}/marks`, {
        classId, subjectId, action,
        maxMarks: currentMax,
        passingMarks: currentPass,
        entries: sheet.entries.map((e) => ({ studentId: e.studentId, marks: e.marks })),
      });
      setSheet((s) => ({ ...s, status: data.status, entries: s.entries.map((e) => {
        const g = data.entries.find((x) => x.studentId === e.studentId);
        return g ? { ...e, grade: g.grade } : e;
      })}));
      notify(action === 'draft' ? 'Draft saved' : action === 'submitted' ? 'Marks submitted for publishing' : 'Marks locked');
    } catch (e) { notify(errMsg(e), 'error'); }
    setBusy(false);
  };

  const printSheet = () => {
    const exam = exams.find((e) => e._id === examId);
    const klass = classes.find((c) => c._id === classId);
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Mark Sheet</title><style>
      body{font-family:Segoe UI,sans-serif;padding:30px;color:#1e293b}
      h1{font-size:20px} h3{color:#475569;font-weight:500;margin:4px 0 18px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#0f2248;color:#fff;padding:8px 10px;text-align:left}
      td{border-bottom:1px solid #e2e8f0;padding:7px 10px}
    </style></head><body>
      <h1>${exam?.name || ''} — Mark Sheet</h1>
      <h3>${klass ? formatClass(klass) : ''} · ${sheet.subject?.name} (Total: ${currentMax}, Pass: ${currentPass})</h3>
      <table><thead><tr><th>Roll</th><th>Adm #</th><th>Student</th><th>Marks</th><th>Grade</th></tr></thead><tbody>
      ${sheet.entries.map((e) => `<tr><td>${e.rollNo || ''}</td><td>${e.admissionNo}</td><td>${e.name}</td><td>${e.marks ?? '—'} / ${currentMax}</td><td>${e.grade}</td></tr>`).join('')}
      </tbody></table></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="academic-workspace marks-workspace">
      <div className="page-head academic-page-head">
        <div className="academic-title-icon accent-purple"><Award size={21} /></div>
        <div>
          <h2>Results & Marks Entry</h2>
          <p>Choose the assessment context, enter marks, and move the sheet through review.</p>
        </div>
        <div className="spacer" />
        <div className="academic-progress-pill"><b>{completedFilters}/3</b><span>selections complete</span></div>
      </div>

      <div className="filter-card academic-filter-panel marks-filter-panel">
        <div className="academic-step"><span>1</span><div><b>Assessment</b><small>Select the exam</small></div></div>
        <div className="academic-step"><span>2</span><div><b>Class</b><small>Choose the register</small></div></div>
        <div className="academic-step"><span>3</span><div><b>Subject</b><small>Load the mark sheet</small></div></div>
        <div className="filter-grid">
          <Field label="Exam" required>
            <select value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">Select exam…</option>
              {exams.map((x) => <option key={x._id} value={x._id}>{x.name} ({x.academicYear})</option>)}
            </select>
          </Field>
          <Field label="Class" required>
            <select value={classId} onChange={(e) => { setClassId(e.target.value); setSubjectId(''); }}>
              <option value="">Select class…</option>
              {classes.filter((c) => c.status === 'active').map((c) => <option key={c._id} value={c._id}>{formatClass(c)}</option>)}
            </select>
          </Field>
          <Field label="Subject" required>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!classId}>
              <option value="">Select subject…</option>
              {classSubjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {!sheet && <div className="card academic-empty-state">
        <div className="academic-empty-icon accent-purple"><Award size={26} /></div>
        <h3>{completedFilters === 0 ? 'Prepare a mark sheet' : 'Complete the selections above'}</h3>
        <p>Select an exam, class and subject. Grades are calculated automatically.</p>
        <div className="academic-empty-meta"><span>Draft</span><span>Submit</span><span>Lock</span><span>Publish</span></div>
      </div>}

      {sheet && (
        <div className="table-card">
          <div className="academic-table-context">
            <div>
              <span className="academic-eyebrow">Active mark sheet</span>
              <h3>{selectedExam?.name || 'Exam'} <small>· {selectedClass ? formatClass(selectedClass, false) : 'Class'} · {sheet.subject?.name}</small></h3>
            </div>
            <div className="academic-context-tags">
              <span>Total: <b>{currentMax}</b> marks</span>
              <span>Pass: <b>{currentPass}</b> marks</span>
              <span>{sheet.entries.length} students</span>
            </div>
          </div>
          <div className="table-toolbar">
            <Badge value={sheet.status} />
            {locked && <Badge value="Locked — contact admin for changes" color="bg-red" />}
            <div className="spacer" />
            <button className="btn btn-sm btn-blue" onClick={printSheet}><Printer size={14} /> Print A4</button>
            <button className="btn btn-sm btn-gray" disabled={busy || locked} onClick={() => save('draft')}><Save size={14} /> Save Draft</button>
            <button className="btn btn-sm btn-navy" disabled={busy || locked} onClick={() => save('submitted')}><Send size={14} /> Submit</button>
            <button className="btn btn-sm btn-orange" disabled={busy || locked} onClick={() => save('locked')}><Lock size={14} /> Lock</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Roll</th><th>Adm #</th><th>Student</th><th>Marks (out of {currentMax})</th><th>Grade</th></tr></thead>
              <tbody>
                {sheet.entries.length === 0 && <tr className="empty-row"><td colSpan={5}>No active students in this class</td></tr>}
                {sheet.entries.map((e) => (
                  <tr key={e.studentId}>
                    <td>{e.rollNo || '—'}</td>
                    <td className="mono">{e.admissionNo}</td>
                    <td><b>{e.name}</b></td>
                    <td>
                      <input className="marks-score-input" type="number" min="0" max={currentMax} value={e.marks}
                        disabled={locked}
                        onChange={(ev) => setMark(e.studentId, ev.target.value)} />
                    </td>
                    <td><Badge value={e.grade} color={e.grade === 'F' ? 'bg-red' : e.grade === '-' ? 'bg-gray' : 'bg-green'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted mt">Save Draft → keep editing later · Submit → ready for admin publishing · Lock → freeze entries. Only Admin can Publish from the Exams page.</p>
        </div>
      )}
    </div>
  );
}
