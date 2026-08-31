import { useEffect, useState } from 'react';
import { FileBadge, Printer } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups } from '../hooks/useLookups';
import { Field } from '../components/ui';
import { displayClassName, formatClass } from '../utils/classNames';

export default function HallTickets() {
  const { notify, user } = useApp();
  const { classes } = useLookups(['classes']);
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [tickets, setTickets] = useState([]);
  const isStaff = ['admin', 'clerk', 'supervisor'].includes(user?.role);

  useEffect(() => { api.get('/exams').then(({ data }) => setExams(data)); }, []);

  useEffect(() => {
    if (!examId) { setTickets([]); return; }
    api.get(`/exams/${examId}/hall-tickets`, { params: classId ? { classId } : {} })
      .then(({ data }) => setTickets(data))
      .catch((e) => notify(errMsg(e), 'error'));
  }, [examId, classId, notify]);

  const printTickets = () => window.print();

  return (
    <>
      <div className="page-head no-print">
        <h2><FileBadge size={20} /> Hall Tickets</h2>
        <div className="spacer" />
        {tickets.length > 0 && (
          <button className="btn btn-navy" onClick={printTickets}><Printer size={15} /> Print / Download All</button>
        )}
      </div>

      <div className="filter-card no-print">
        <div className="filter-grid">
          <Field label="Exam" required>
            <select value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">Select exam…</option>
              {exams.map((x) => <option key={x._id} value={x._id}>{x.name} ({x.academicYear})</option>)}
            </select>
          </Field>
          {isStaff && (
            <Field label="Class">
              <select value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">All classes</option>
                {classes.map((c) => <option key={c._id} value={c._id}>{formatClass(c)}</option>)}
              </select>
            </Field>
          )}
        </div>
      </div>

      {!examId && <div className="card card-pad muted no-print">Select an exam to generate hall tickets.</div>}

      <div className="print-area" style={{ display: 'grid', gap: 16 }}>
        {tickets.map((t, i) => (
          <div key={i} className="card" style={{ padding: 24, pageBreakInside: 'avoid' }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid var(--primary)', paddingBottom: 10, marginBottom: 12 }}>
              <h2 style={{ color: 'var(--primary)' }}>{t.school}</h2>
              <div style={{ fontWeight: 700, letterSpacing: 2, marginTop: 4 }}>EXAMINATION HALL TICKET</div>
            </div>
            <div className="grid-2">
              <div>
                <p><b>Student:</b> {t.student.name}</p>
                <p><b>Admission #:</b> <span className="mono">{t.student.admissionNo}</span></p>
                <p><b>Roll No:</b> {t.student.rollNo || '—'}</p>
                <p><b>Class:</b> {displayClassName(t.className)}</p>
              </div>
              <div>
                <p><b>Exam:</b> {t.exam.name}</p>
                <p><b>Start:</b> {t.exam.startDate}</p>
                <p><b>End:</b> {t.exam.endDate || '—'}</p>
                <p><b>Subjects:</b> {t.subjects.join(', ') || '—'}</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, fontSize: 12 }}>
              <span style={{ borderTop: '1px solid #94a3b8', padding: '4px 26px 0' }}>Student Signature</span>
              <span style={{ borderTop: '1px solid #94a3b8', padding: '4px 26px 0' }}>Invigilator</span>
              <span style={{ borderTop: '1px solid #94a3b8', padding: '4px 26px 0' }}>Principal</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
