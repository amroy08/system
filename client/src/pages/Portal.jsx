import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, CalendarCheck, Award, Wallet, Megaphone, GraduationCap,
  BookOpen, AlertTriangle, Clock, UsersRound, Trophy, ClipboardCheck, FolderOpen,
  ChevronDown, Home, Check,
} from 'lucide-react';

const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e', '#06b6d4'];
const stringToColor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { KpiCard, Badge } from '../components/ui';
import { AttachmentLink } from '../components/Attachment';

/* ---- Library books issued to this student, with overdue / due-soon alerts ---- */
function MyLibraryBooks({ studentId, cur, isParent, studentName }) {
  const [lib, setLib] = useState(null);
  useEffect(() => { api.get('/library/my').then(({ data }) => setLib(data)).catch(() => {}); }, []);
  if (!lib) return null;

  const mine = lib.issues.filter((i) => i.memberId === studentId);
  if (mine.length === 0) return null;

  const overdue = mine.filter((i) => i.overdue);
  const dueSoon = mine.filter((i) => i.status === 'issued' && !i.overdue && i.dueInDays <= 3);

  return (
    <div className="card card-pad">
      <div className="card-title"><BookOpen size={15} /> {isParent ? `Library Books — ${studentName}` : 'My Library Books'}</div>

      {overdue.map((i) => (
        <div key={i._id} className="mb" style={{
          border: '1px solid var(--danger)', borderLeft: '4px solid var(--danger)',
          borderRadius: 8, padding: '10px 13px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <AlertTriangle size={17} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          <span className="small">
            <b>"{i.bookTitle}"</b> is <b className="txt-red">{i.daysLate} day(s) overdue</b> (was due {i.dueDate}).
            Fine so far: <b className="txt-red">{cur}{i.fineAccrued}</b> — it grows {cur}{lib.finePerDay} every day.
            Please return it to the library.
          </span>
        </div>
      ))}

      {dueSoon.map((i) => (
        <div key={i._id} className="mb" style={{
          border: '1px solid var(--warning)', borderLeft: '4px solid var(--warning)',
          borderRadius: 8, padding: '10px 13px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <Clock size={17} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <span className="small">
            <b>"{i.bookTitle}"</b> is due {i.dueInDays === 0 ? <b>today</b> : <b>in {i.dueInDays} day(s)</b>} ({i.dueDate}).
            Return on time to avoid a {cur}{lib.finePerDay}/day fine.
          </span>
        </div>
      ))}

      <table className="data-table">
        <thead><tr><th>Book</th><th>Issued</th><th>Due</th><th>Returned</th><th>Fine</th><th>Status</th></tr></thead>
        <tbody>
          {mine.map((i) => (
            <tr key={i._id}>
              <td><b>{i.bookTitle}</b> <span className="small muted">({i.accNo})</span></td>
              <td>{i.issueDate}</td>
              <td className={i.overdue ? 'txt-red' : ''}>{i.dueDate}</td>
              <td>{i.returnDate || '—'}</td>
              <td>{i.fine ? <b className="txt-red">{cur}{i.fine}</b>
                : i.overdue ? <span className="txt-red small"><b>{cur}{i.fineAccrued}</b> accruing</span> : '—'}</td>
              <td><Badge value={i.overdue ? 'overdue' : i.status}
                color={i.overdue ? 'bg-red' : i.status === 'returned' ? 'bg-green' : 'bg-yellow'} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MyAttendanceCard({ attendance }) {
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' or 'list'
  const [statusFilter, setStatusFilter] = useState('all');
  
  const recent = attendance.recent || [];
  const summary = attendance.summary || {};
  
  const latestDateStr = recent[0]?.date || new Date().toISOString().slice(0, 10);
  const [currentYear, setCurrentYear] = useState(() => {
    const d = new Date(latestDateStr);
    return isNaN(d.getTime()) ? 2026 : d.getFullYear();
  });
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date(latestDateStr);
    return isNaN(d.getTime()) ? 7 : d.getMonth(); // 0-indexed (7 = August)
  });
  
  const getStatusForDate = (dateStr) => {
    const found = recent.find((r) => r.date === dateStr);
    return found ? found.status : null;
  };
  
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const monthNames = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];
  
  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };
  
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };
  
  const getStatusColorClass = (status) => {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s === 'present') return 'bg-green';
    if (s === 'absent') return 'bg-red';
    if (s === 'late') return 'bg-yellow';
    if (s === 'halfday') return 'bg-blue';
    if (s === 'leave') return 'bg-purple';
    return '';
  };

  const getStatusStyles = (status) => {
    if (!status) return {};
    const s = status.toLowerCase();
    if (s === 'present') return { backgroundColor: 'rgba(22, 163, 74, 0.1)', color: 'var(--accent)' };
    if (s === 'absent') return { backgroundColor: 'rgba(220, 38, 38, 0.1)', color: 'var(--danger)' };
    if (s === 'late') return { backgroundColor: 'rgba(234, 179, 8, 0.1)', color: 'var(--warning)' };
    if (s === 'halfday') return { backgroundColor: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9' };
    if (s === 'leave') return { backgroundColor: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' };
    return {};
  };

  const filteredRecent = recent.filter(r => {
    if (statusFilter === 'all') return true;
    return r.status.toLowerCase() === statusFilter.toLowerCase();
  });
  
  const calendarCells = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push(<div key={`empty-${i}`} style={{ aspectRatio: '1' }} />);
  }
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const status = getStatusForDate(dateString);
    const statusStyle = getStatusStyles(status);
    const isToday = new Date().toISOString().slice(0, 10) === dateString;

    calendarCells.push(
      <div 
        key={day} 
        style={{
          aspectRatio: '1',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          fontSize: '11px',
          position: 'relative',
          fontWeight: status ? '700' : '400',
          outline: isToday ? '2px solid var(--accent)' : 'none',
          ...statusStyle
        }} 
        title={status ? `${dateString}: ${status}` : dateString}
      >
        <span>{day}</span>
        {status && (
          <span 
            className={getStatusColorClass(status)} 
            style={{ 
              width: 5, 
              height: 5, 
              borderRadius: '50%', 
              position: 'absolute', 
              bottom: 4 
            }} 
          />
        )}
      </div>
    );
  }

  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div className="card-title" style={{ margin: 0 }}><CalendarCheck size={15} /> Attendance Tracker</div>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <button 
            type="button"
            className={`tab-btn-sm ${viewMode === 'calendar' ? 'active' : ''}`} 
            onClick={() => setViewMode('calendar')}
            style={{
              background: viewMode === 'calendar' ? 'var(--primary)' : 'transparent',
              color: viewMode === 'calendar' ? '#fff' : 'var(--muted)',
              border: 'none', padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600
            }}
          >
            Calendar
          </button>
          <button 
            type="button"
            className={`tab-btn-sm ${viewMode === 'list' ? 'active' : ''}`} 
            onClick={() => setViewMode('list')}
            style={{
              background: viewMode === 'list' ? 'var(--primary)' : 'transparent',
              color: viewMode === 'list' ? '#fff' : 'var(--muted)',
              border: 'none', padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600
            }}
          >
            List
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <button type="button" onClick={prevMonth} className="btn btn-xs btn-outline" style={{ padding: '2px 6px', fontSize: 11 }}>&larr; Prev</button>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{monthNames[currentMonth]} {currentYear}</span>
            <button type="button" onClick={nextMonth} className="btn btn-xs btn-outline" style={{ padding: '2px 6px', fontSize: 11 }}>Next &rarr;</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', fontSize: 11 }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
              <div key={day} style={{ fontWeight: 600, paddingBottom: 4, borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>{day}</div>
            ))}
            {calendarCells}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12, fontSize: 10, justifyContent: 'center', color: 'var(--muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span className="bg-green" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} /> Present</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span className="bg-red" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} /> Absent</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span className="bg-yellow" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} /> Late</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span className="bg-blue" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} /> Half Day</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span className="bg-purple" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} /> Leave</div>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {Object.entries(summary).map(([k, v]) => (
                <Badge key={k} value={`${k}: ${v}`} color={{ present: 'bg-green', absent: 'bg-red', late: 'bg-yellow', halfday: 'bg-blue', leave: 'bg-purple' }[k]} />
              ))}
            </div>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', fontSize: 11 }}
            >
              <option value="all">All Statuses</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="late">Late</option>
              <option value="halfday">Halfday</option>
              <option value="leave">Leave</option>
            </select>
          </div>

          <table className="data-table">
            <thead><tr><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {filteredRecent.map((r, i) => (
                <tr key={i}><td>{r.date}</td><td><Badge value={r.status} color={getStatusColorClass(r.status)} /></td></tr>
              ))}
              {filteredRecent.length === 0 && <tr className="empty-row"><td colSpan={2}>No matching attendance logs</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MyReceiptsCard({ fees, cur }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAll, setShowAll] = useState(false);
  
  const receipts = fees.receipts || [];
  
  const filteredReceipts = receipts.filter((r) => {
    if (statusFilter === 'all') return true;
    return r.status.toLowerCase() === statusFilter.toLowerCase();
  });
  
  const displayedReceipts = showAll ? filteredReceipts : filteredReceipts.slice(0, 5);

  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div className="card-title" style={{ margin: 0 }}><Wallet size={15} /> Fee Receipts</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 11 }}
          >
            <option value="all">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="unpaid">Unpaid</option>
          </select>
          {filteredReceipts.length > 5 && (
            <button 
              type="button"
              className="btn btn-xs btn-outline" 
              onClick={() => setShowAll(!showAll)}
              style={{ fontSize: 11, padding: '4px 8px' }}
            >
              {showAll ? 'Show Less' : 'Show All'}
            </button>
          )}
        </div>
      </div>
      <table className="data-table">
        <thead><tr><th>Receipt #</th><th>Date</th><th>Due</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
        <tbody>
          {displayedReceipts.map((r) => (
            <tr key={r._id}>
              <td className="mono">{r.receiptNo}</td><td>{r.date}</td>
              <td>{cur}{(r.amountDue || 0).toLocaleString()}</td>
              <td>{cur}{(r.amountPaid || 0).toLocaleString()}</td>
              <td className={r.balance > 0 ? 'txt-red' : 'txt-green'}>{cur}{(r.balance || 0).toLocaleString()}</td>
              <td><Badge value={r.status} /></td>
            </tr>
          ))}
          {displayedReceipts.length === 0 && (
            <tr className="empty-row">
              <td colSpan={6}>No receipts found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SnapshotView({ snap, cur, isParent }) {
  const att = snap.attendance.summary;
  const attTotal = Object.values(att).reduce((s, n) => s + n, 0) || 1;
  const presentPct = Math.round(((att.present + att.late + att.halfday) / attTotal) * 100);

  // Section Filters
  const [noticeSearch, setNoticeSearch] = useState('');
  const [ptmFilter, setPtmFilter] = useState('all');
  
  const [actTab, setActTab] = useState('all');
  const [actSearch, setActSearch] = useState('');

  const [docTab, setDocTab] = useState('all');
  const [docSearch, setDocSearch] = useState('');

  // Filters logic
  const filteredNotices = (snap.notices || []).filter(n => 
    n.title.toLowerCase().includes(noticeSearch.toLowerCase()) || 
    (n.body && n.body.toLowerCase().includes(noticeSearch.toLowerCase()))
  );

  const filteredPtm = (snap.ptm || []).filter(m => {
    if (ptmFilter === 'all') return true;
    return m.status?.toLowerCase() === ptmFilter.toLowerCase();
  });

  const unifiedActivities = [
    ...(snap.activities || []).map(a => ({ id: a._id, title: a.title, type: 'Activity', date: a.date || '—', rawType: 'activities', data: a })),
    ...(snap.activeExams || []).map(e => ({ id: e._id, title: e.name, type: 'Exam', date: `${e.startDate}${e.endDate ? ` to ${e.endDate}` : ''}`, rawType: 'exams', data: e }))
  ];
  
  const filteredAct = unifiedActivities.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(actSearch.toLowerCase());
    const matchesTab = actTab === 'all' || item.rawType === actTab;
    return matchesSearch && matchesTab;
  });

  const homeworkData = (snap.homework || []).map(h => ({
    id: h._id,
    title: h.title,
    date: `Due ${h.dueDate || '—'}`,
    type: h.type,
    rawType: 'homework',
    desc: h.description,
    attachment: h.attachment
  }));

  const materialsData = (snap.lessonPlans || []).map(p => ({
    id: p._id,
    title: p.topic,
    date: p.date || '—',
    type: 'Lesson material',
    rawType: 'materials',
    desc: [p.objectives, p.activities, p.homework].filter(Boolean).join(' · '),
    attachment: p.attachment
  }));

  const docsData = (snap.documents || []).map(d => ({
    id: d._id,
    title: d.title,
    date: d.date || '—',
    type: 'Document',
    rawType: 'documents',
    link: d.link,
    attachment: d.attachment
  }));

  const unifiedDocs = [...homeworkData, ...materialsData, ...docsData];

  const filteredDocs = unifiedDocs.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(docSearch.toLowerCase()) || 
      (item.desc && item.desc.toLowerCase().includes(docSearch.toLowerCase()));
    const matchesTab = docTab === 'all' || item.rawType === docTab;
    return matchesSearch && matchesTab;
  });

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="kpi-grid">
        <KpiCard color="navy" icon={GraduationCap} value={snap.className} label="Class" />
        <KpiCard color="green" icon={CalendarCheck} value={`${presentPct}%`} label="Attendance" />
        <KpiCard color="purple" icon={Award} value={snap.results.length} label="Published Results" />
        <KpiCard color={snap.fees.balance > 0 ? 'red' : 'teal'} icon={Wallet} value={`${cur}${snap.fees.balance.toLocaleString()}`} label="Fee Balance" />
      </div>

      <div className="grid-2">
        <MyAttendanceCard attendance={snap.attendance} />

        <div className="card card-pad">
          <div className="card-title"><Award size={15} /> Exam Results (Published)</div>
          <table className="data-table">
            <thead><tr><th>Exam</th><th>Subject</th><th>Marks</th><th>Grade</th></tr></thead>
            <tbody>
              {snap.results.map((r, i) => (
                <tr key={i}>
                  <td>{r.examName}</td><td>{r.subject}</td>
                  <td><b>{r.marks}</b> / {r.maxMarks}</td>
                  <td><Badge value={r.grade} color={r.grade === 'F' ? 'bg-red' : 'bg-green'} /></td>
                </tr>
              ))}
              {snap.results.length === 0 && <tr className="empty-row"><td colSpan={4}>Results not published yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <MyLibraryBooks
        studentId={snap.student._id}
        cur={cur}
        isParent={isParent}
        studentName={`${snap.student.firstName} ${snap.student.lastName || ''}`.trim()}
      />

      <MyReceiptsCard fees={snap.fees} cur={cur} />

      <div className="grid-2">
        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
            <div className="card-title" style={{ margin: 0 }}><Megaphone size={15} /> Notices for this Grade</div>
            <input 
              type="text" 
              placeholder="Search notices..." 
              value={noticeSearch}
              onChange={(e) => setNoticeSearch(e.target.value)}
              style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 11, maxWidth: 140 }}
            />
          </div>
          {filteredNotices.slice(0, 5).map((notice) => (
            <div key={notice._id} className="portal-update-row">
              <b>{notice.title}</b><span>{notice.date || '—'}</span>
              <p>{notice.body || 'No additional details.'}</p>
              <AttachmentLink attachment={notice.attachment} />
            </div>
          ))}
          {!filteredNotices.length && <p className="muted small">No published notices match the search criteria.</p>}
        </div>

        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
            <div className="card-title" style={{ margin: 0 }}><UsersRound size={15} /> Parent-Teacher Meetings</div>
            <select 
              value={ptmFilter}
              onChange={(e) => setPtmFilter(e.target.value)}
              style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 11 }}
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          {filteredPtm.slice(0, 5).map((meeting) => (
            <div key={meeting._id} className="portal-update-row">
              <b>{meeting.title}</b><span>{meeting.date || '—'} · {meeting.status}</span>
              <p>{meeting.slots || meeting.notes || 'Contact the school office for timing.'}</p>
            </div>
          ))}
          {!filteredPtm.length && <p className="muted small">No scheduled meetings match the status filter.</p>}
        </div>

        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
            <div className="card-title" style={{ margin: 0 }}><Trophy size={15} /> Activities & Exams</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', fontSize: 10 }}>
                {['all', 'exams', 'activities'].map(tab => (
                  <button 
                    key={tab}
                    type="button"
                    className={`tab-btn-xs ${actTab === tab ? 'active' : ''}`}
                    onClick={() => setActTab(tab)}
                    style={{
                      background: actTab === tab ? 'var(--primary)' : 'transparent',
                      color: actTab === tab ? '#fff' : 'var(--muted)',
                      border: 'none', padding: '3px 6px', cursor: 'pointer', fontWeight: 600
                    }}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              <input 
                type="text" 
                placeholder="Search..." 
                value={actSearch}
                onChange={(e) => setActSearch(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 11, maxWidth: 90 }}
              />
            </div>
          </div>
          {filteredAct.slice(0, 5).map((item) => (
            <div key={item.id} className="portal-update-row">
              <b>{item.title}</b><span>{item.date} · {item.type}</span>
            </div>
          ))}
          {!filteredAct.length && <p className="muted small">No upcoming activities or exams match the filter.</p>}
        </div>

        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
            <div className="card-title" style={{ margin: 0 }}><ClipboardCheck size={15} /> Homework & Documents</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', fontSize: 10 }}>
                {['all', 'homework', 'materials', 'documents'].map(tab => (
                  <button 
                    key={tab}
                    type="button"
                    className={`tab-btn-xs ${docTab === tab ? 'active' : ''}`}
                    onClick={() => setDocTab(tab)}
                    style={{
                      background: docTab === tab ? 'var(--primary)' : 'transparent',
                      color: docTab === tab ? '#fff' : 'var(--muted)',
                      border: 'none', padding: '3px 6px', cursor: 'pointer', fontWeight: 600
                    }}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              <input 
                type="text" 
                placeholder="Search..." 
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 11, maxWidth: 90 }}
              />
            </div>
          </div>
          {filteredDocs.slice(0, 5).map((item) => (
            <div key={item.id} className="portal-update-row">
              <b>{item.title}</b><span>{item.date} · {item.type}</span>
              {item.desc && <p>{item.desc}</p>}
              {item.link && item.link !== '#' && (
                <a className="link-like small" href={item.link} target="_blank" rel="noreferrer">
                  <FolderOpen size={12} /> Open document
                </a>
              )}
              <AttachmentLink attachment={item.attachment} />
            </div>
          ))}
          {!filteredDocs.length && <p className="muted small">No homework, lesson material, or documents found.</p>}
        </div>
      </div>
    </div>
  );
}

function FamilyOverview({ activeChildren, formerChildren, cur, onSelect }) {
  const totalBalance = [...activeChildren, ...formerChildren].reduce((sum, child) => sum + Number(child.fees.balance || 0), 0);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="kpi-grid">
        <KpiCard color="navy" icon={GraduationCap} value={activeChildren.length} label="Active Children" />
        <KpiCard color="purple" icon={Award} value={formerChildren.length} label="Former Students" />
        <KpiCard color={totalBalance > 0 ? 'red' : 'teal'} icon={Wallet} value={`${cur}${totalBalance.toLocaleString()}`} label="Family Fee Balance" />
      </div>
      <div className="card card-pad">
        <div className="card-title"><UsersRound size={15} /> Children Overview</div>
        <table className="data-table">
          <thead><tr><th>Student</th><th>Admission No.</th><th>Class</th><th>Status</th><th>Fee Balance</th><th></th></tr></thead>
          <tbody>
            {[...activeChildren, ...formerChildren].map((child) => (
              <tr key={child.student._id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      backgroundColor: stringToColor(child.student._id),
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: 11,
                    }}>
                      {child.student.firstName[0]}{child.student.lastName ? child.student.lastName[0] : ''}
                    </div>
                    <b>{child.student.firstName} {child.student.lastName || ''}</b>
                  </div>
                </td>
                <td className="mono">{child.student.admissionNo}</td>
                <td>{child.className}</td>
                <td><Badge value={child.student.status} color={child.student.status === 'active' ? 'bg-green' : 'bg-gray'} /></td>
                <td className={child.fees.balance > 0 ? 'txt-red' : 'txt-green'}><b>{cur}{child.fees.balance.toLocaleString()}</b></td>
                <td><button className="btn btn-xs btn-navy" onClick={() => onSelect(child.student._id)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Portal() {
  const { user, settings, notify } = useApp();
  const [data, setData] = useState(null);
  const [notices, setNotices] = useState([]);
  const [childId, setChildId] = useState('all');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [familyNoticeSearch, setFamilyNoticeSearch] = useState('');
  const notifyRef = useRef(notify);
  const dropdownRef = useRef(null);
  const cur = settings.currency || '₹';

  useEffect(() => { notifyRef.current = notify; }, [notify]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const url = user.role === 'parent' ? '/portal/parent' : '/portal/student';
    api.get(url).then(({ data }) => setData(data)).catch((e) => notifyRef.current(errMsg(e), 'error'));
    api.get('/portal/notices').then(({ data }) => setNotices(data)).catch(() => {});
  }, [user.role]);

  if (!data) return <div className="card card-pad">Loading your dashboard…</div>;

  const activeChildren = user.role === 'parent' ? data.children || [] : [];
  const formerChildren = user.role === 'parent' ? data.formerChildren || [] : [];
  const allChildren = [...activeChildren, ...formerChildren];
  const showFamily = user.role === 'parent' && allChildren.length > 1 && childId === 'all';
  const snap = user.role === 'parent'
    ? allChildren.find((child) => child.student._id === childId) || (allChildren.length === 1 ? allChildren[0] : null)
    : data;

  const filteredFamilyNotices = notices.filter((n) =>
    n.title.toLowerCase().includes(familyNoticeSearch.toLowerCase()) ||
    (n.body && n.body.toLowerCase().includes(familyNoticeSearch.toLowerCase()))
  );

  return (
    <>
      <div className="page-head">
        <h2><LayoutDashboard size={20} /> My Dashboard</h2>
        <div className="spacer" />
        {user.role === 'parent' && allChildren.length > 1 && (
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '6px 12px',
                backgroundColor: '#fff',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              }}
            >
              {childId === 'all' ? (
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  backgroundColor: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Home size={14} />
                </div>
              ) : (
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  backgroundColor: stringToColor(childId),
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: 11,
                }}>
                  {(() => {
                    const activeChild = allChildren.find((c) => c.student._id === childId);
                    return activeChild ? `${activeChild.student.firstName[0]}${activeChild.student.lastName ? activeChild.student.lastName[0] : ''}`.toUpperCase() : '??';
                  })()}
                </div>
              )}
              <div style={{ textAlign: 'left', lineHeight: 1.1 }}>
                <div style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--txt)' }}>
                  {childId === 'all' ? 'Family Overview' : (() => {
                    const activeChild = allChildren.find((c) => c.student._id === childId);
                    return activeChild ? `${activeChild.student.firstName} ${activeChild.student.lastName || ''}`.trim() : '';
                  })()}
                </div>
                <div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>
                  {childId === 'all' ? 'All Children' : (() => {
                    const activeChild = allChildren.find((c) => c.student._id === childId);
                    return activeChild ? activeChild.className : '';
                  })()}
                </div>
              </div>
              <ChevronDown size={14} style={{ color: 'var(--txt-muted)', marginLeft: 4 }} />
            </button>

            {dropdownOpen && (
              <div
                className="portal-switcher-card"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 6,
                  width: 280,
                  backgroundColor: '#fff',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                  zIndex: 100,
                  padding: '6px 0',
                }}
              >
                <div style={{ padding: '6px 14px', fontSize: 11, fontWeight: 'bold', color: 'var(--txt-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                  Switch Account View
                </div>
                
                {/* Family Overview Option */}
                <button
                  onClick={() => { setChildId('all'); setDropdownOpen(false); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 14px',
                    border: 'none',
                    background: childId === 'all' ? '#f0f6ff' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background-color 0.1s',
                  }}
                  onMouseEnter={(e) => { if (childId !== 'all') e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                  onMouseLeave={(e) => { if (childId !== 'all') e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <div style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    backgroundColor: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Home size={13} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 'bold', color: childId === 'all' ? '#1e40af' : 'var(--txt)' }}>Family Overview</div>
                    <div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>All Children</div>
                  </div>
                  {childId === 'all' && <Check size={14} style={{ color: '#2563eb' }} />}
                </button>

                {activeChildren.length > 0 && (
                  <>
                    <div style={{ padding: '6px 14px 4px 14px', fontSize: 10, fontWeight: 'bold', color: 'var(--txt-muted)', textTransform: 'uppercase' }}>
                      Active Students
                    </div>
                    {activeChildren.map((child) => {
                      const isSel = childId === child.student._id;
                      return (
                        <button
                          key={child.student._id}
                          onClick={() => { setChildId(child.student._id); setDropdownOpen(false); }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            width: '100%',
                            padding: '8px 14px',
                            border: 'none',
                            background: isSel ? '#f0f6ff' : 'transparent',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background-color 0.1s',
                          }}
                          onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                          onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <div style={{
                            width: 26,
                            height: 26,
                            borderRadius: '50%',
                            backgroundColor: stringToColor(child.student._id),
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            fontSize: 10,
                          }}>
                            {child.student.firstName[0]}{child.student.lastName ? child.student.lastName[0] : ''}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 'bold', color: isSel ? '#1e40af' : 'var(--txt)' }}>
                              {child.student.firstName} {child.student.lastName || ''}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{child.className}</div>
                          </div>
                          {isSel && <Check size={14} style={{ color: '#2563eb' }} />}
                        </button>
                      );
                    })}
                  </>
                )}

                {formerChildren.length > 0 && (
                  <>
                    <div style={{ padding: '6px 14px 4px 14px', fontSize: 10, fontWeight: 'bold', color: 'var(--txt-muted)', textTransform: 'uppercase' }}>
                      Former Students
                    </div>
                    {formerChildren.map((child) => {
                      const isSel = childId === child.student._id;
                      return (
                        <button
                          key={child.student._id}
                          onClick={() => { setChildId(child.student._id); setDropdownOpen(false); }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            width: '100%',
                            padding: '8px 14px',
                            border: 'none',
                            background: isSel ? '#f0f6ff' : 'transparent',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background-color 0.1s',
                          }}
                          onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                          onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <div style={{
                            width: 26,
                            height: 26,
                            borderRadius: '50%',
                            backgroundColor: '#94a3b8',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            fontSize: 10,
                          }}>
                            {child.student.firstName[0]}{child.student.lastName ? child.student.lastName[0] : ''}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 'bold', color: isSel ? '#1e40af' : 'var(--txt)' }}>
                              {child.student.firstName} {child.student.lastName || ''}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{child.className}</div>
                          </div>
                          {isSel && <Check size={14} style={{ color: '#2563eb' }} />}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {user.role === 'parent' && snap && !showFamily && (
        <p className="small muted mb">
          Viewing <b>{snap?.student.firstName} {snap?.student.lastName}</b> ({snap?.student.admissionNo}).
          {allChildren.length > 1 && ' Use the selector above to switch between your children.'}
        </p>
      )}

      {showFamily
        ? <FamilyOverview activeChildren={activeChildren} formerChildren={formerChildren} cur={cur} onSelect={setChildId} />
        : snap ? <SnapshotView snap={snap} cur={cur} isParent={user.role === 'parent'} /> : <div className="card card-pad muted">No linked student records found.</div>}

      {showFamily && notices.length > 0 && (
        <div className="card card-pad mt">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
            <div className="card-title" style={{ margin: 0 }}><Megaphone size={15} /> School Notices</div>
            <input 
              type="text" 
              placeholder="Search notices..." 
              value={familyNoticeSearch}
              onChange={(e) => setFamilyNoticeSearch(e.target.value)}
              style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 11, maxWidth: 160 }}
            />
          </div>
          {filteredFamilyNotices.slice(0, 5).map((n) => (
            <div key={n._id} className="portal-update-row">
              <b>{n.title}</b> <Badge value={n.audience} color="bg-blue" /> <span className="small muted">{n.date}</span>
              <div className="small muted" style={{ marginTop: 3 }}>{n.body}</div>
              <AttachmentLink attachment={n.attachment} />
            </div>
          ))}
          {!filteredFamilyNotices.length && <p className="muted small">No school notices match the search criteria.</p>}
        </div>
      )}
    </>
  );
}
