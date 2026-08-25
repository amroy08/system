import { useEffect, useState, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarRange, Save, Printer } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups } from '../hooks/useLookups';
import { Field } from '../components/ui';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SLOTS = [
  { no: 1, start: '07:30', end: '08:10' },
  { no: 2, start: '08:10', end: '08:45' },
  { no: 3, start: '08:45', end: '09:20' },
  { no: 4, start: '09:20', end: '09:55' },
  { no: 5, start: '09:55', end: '10:30' },
  { no: 6, start: '11:00', end: '11:30' },
  { no: 7, start: '11:30', end: '12:00' },
  { no: 8, start: '12:00', end: '12:30' },
  { no: 9, start: '12:30', end: '13:00' },
  { no: 10, start: '13:00', end: '13:30' },
];

export default function Timetable() {
  const { notify, user } = useApp();
  const { classes, subjects, teachers } = useLookups(['classes', 'subjects', 'teachers']);
  const [classId, setClassId] = useState('');
  const [periods, setPeriods] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [params] = useSearchParams();
  const canWrite = ['admin', 'clerk', 'supervisor'].includes(user?.role);

  useEffect(() => {
    const pre = params.get('classId');
    if (pre) {
      setClassId(pre);
    } else if (classes.length === 1) {
      setClassId(classes[0]._id);
    }
  }, [params, classes]);

  useEffect(() => {
    if (!classId) { setPeriods([]); return; }
    api.get(`/timetables/${classId}`)
      .then(({ data }) => { setPeriods(data.periods || []); setDirty(false); })
      .catch(() => { setPeriods([]); });
  }, [classId]);

  const getCell = (day, no) => periods.find((p) => p.day === day && p.period === no);

  const setCell = (day, slot, subjectId, teacherId) => {
    const subj = subjects.find((s) => s._id === subjectId);
    const teacher = teachers.find((t) => t._id === teacherId);
    setPeriods((prev) => {
      const rest = prev.filter((p) => !(p.day === day && p.period === slot.no));
      if (!subjectId && !teacherId) return rest;
      const existing = getCell(day, slot.no) || {};
      return [...rest, {
        day, period: slot.no, start: slot.start, end: slot.end,
        subjectId: subjectId ?? existing.subjectId, subjectName: subj?.name || existing.subjectName || 'Free',
        teacherId: teacherId ?? existing.teacherId, teacherName: teacher?.fullName || existing.teacherName || '',
      }];
    });
    setDirty(true);
  };

  const save = async () => {
    try {
      await api.post(`/timetables/${classId}`, { periods });
      notify('Timetable saved');
      setDirty(false);
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const printIt = () => window.print();
  const selectedClass = classes.find((item) => item._id === classId);

  return (
    <div className="academic-workspace timetable-workspace">
      <div className="page-head academic-page-head no-print">
        <div className="academic-title-icon"><CalendarRange size={21} /></div>
        <div>
          <h2>Weekly Timetable</h2>
          <p>Plan subjects and teachers across the school week.</p>
        </div>
        <div className="spacer" />
        {classId && <button className="btn btn-blue" onClick={printIt}><Printer size={15} /> Print</button>}
        {canWrite && classId && <button className="btn btn-green" disabled={!dirty} onClick={save}><Save size={15} /> Save Timetable</button>}
      </div>

      <div className="filter-card academic-filter-panel no-print">
        <div className="academic-filter-copy">
          <span className="academic-eyebrow">Schedule setup</span>
          <b>Choose a class</b>
          <small>Load its current weekly plan, then assign subjects and teachers.</small>
        </div>
        <div className="filter-grid academic-single-filter">
          <Field label="Class" required>
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Select class…</option>
              {classes.map((c) => <option key={c._id} value={c._id}>{c.name} {c.section} ({c.academicYear})</option>)}
            </select>
          </Field>
        </div>
      </div>

      {!classId && <div className="card academic-empty-state">
        <div className="academic-empty-icon"><CalendarRange size={26} /></div>
        <h3>Your weekly schedule starts here</h3>
        <p>Select a class above to view or edit its timetable.</p>
        <div className="academic-empty-meta"><span>5 school days</span><span>10 periods</span><span>1 recess</span></div>
      </div>}

      {classId && (
        <div className="table-card print-area">
          <div className="academic-table-context no-print">
            <div>
              <span className="academic-eyebrow">Current schedule</span>
              <h3>{selectedClass ? `${selectedClass.name} ${selectedClass.section}` : 'Selected class'}</h3>
            </div>
            <div className="academic-context-tags"><span>Monday–Friday</span><span>10 periods</span>{dirty && <span className="is-warning">Unsaved changes</span>}</div>
          </div>
          <div className="table-wrap">
            <table className="data-table timetable-grid-table">
              <thead>
                <tr>
                  <th>Period</th>
                  {DAYS.map((d) => <th key={d}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {SLOTS.map((slot, idx) => (
                  <Fragment key={slot.no}>
                    <tr>
                      <td><span className="period-number">P{slot.no}</span><div className="period-time">{slot.start} – {slot.end}</div></td>
                      {DAYS.map((day) => {
                        const cell = getCell(day, slot.no);
                        return (
                          <td key={day}>
                            {canWrite ? (
                              <div className="timetable-cell-editor">
                                <select value={cell?.subjectId || ''}
                                  onChange={(e) => setCell(day, slot, e.target.value || null, cell?.teacherId)}>
                                  <option value="">Free</option>
                                  {subjects.filter((s) => !s.classIds?.length || s.classIds.includes(classId)).map((s) => (
                                    <option key={s._id} value={s._id}>{s.name}</option>
                                  ))}
                                </select>
                                <select value={cell?.teacherId || ''}
                                  onChange={(e) => setCell(day, slot, cell?.subjectId, e.target.value || null)}>
                                  <option value="">— teacher —</option>
                                  {teachers.map((t) => <option key={t._id} value={t._id}>{t.fullName}</option>)}
                                </select>
                              </div>
                            ) : (
                              cell?.subjectName && cell.subjectName !== 'Free' ? (
                                <div>
                                  <b className="txt-primary" style={{ fontSize: '13px' }}>{cell.subjectName}</b>
                                  <div className="small muted" style={{ fontSize: '11px', marginTop: 2 }}>{cell.teacherName}</div>
                                </div>
                              ) : <span className="muted">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {idx === 4 && (
                      <tr key="recess" className="timetable-recess-row">
                        <td><b>Recess</b></td>
                        <td colSpan={5}>
                          <span>Break</span> 10:30 – 11:00
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
