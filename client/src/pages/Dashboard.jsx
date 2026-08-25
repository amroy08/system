import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap, UserCog, School, BookOpen, UsersRound, Wallet, AlertTriangle,
  UserCheck, ClipboardList, ShieldAlert, Cake, UserPlus, Receipt, Award,
  LifeBuoy, MessageSquareWarning, NotebookPen, CalendarRange, Megaphone, Send, RefreshCw,
} from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { api } from '../api';
import { useApp } from '../context/AppContextValue';
import { KpiCard, Badge } from '../components/ui';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

const dayLabel = (d) => new Date(d).toLocaleDateString(undefined, { weekday: 'short' });
const compactNumber = (value) => Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);

const chartFont = { family: "'Inter', sans-serif", size: 10, weight: '600' };
const legendOpts = {
  position: 'bottom',
  labels: {
    boxWidth: 8,
    usePointStyle: true,
    pointStyle: 'circle',
    padding: 14,
    font: chartFont,
    color: '#64748b',
  }
};
const tooltipOpts = {
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  titleFont: { family: "'Inter', sans-serif", size: 12, weight: '700' },
  bodyFont: { family: "'Inter', sans-serif", size: 11 },
  padding: 8,
  cornerRadius: 8,
  boxPadding: 4,
};
const commonScales = {
  x: {
    grid: { display: false },
    ticks: { font: { family: "'Inter', sans-serif", size: 10 }, color: '#64748b' }
  },
  y: {
    grid: { color: 'rgba(203,213,225,0.25)', borderDash: [4, 4] },
    ticks: { font: { family: "'Inter', sans-serif", size: 10 }, color: '#64748b', precision: 0 }
  }
};
const horizontalScales = {
  y: {
    grid: { display: false },
    ticks: { font: { family: "'Inter', sans-serif", size: 10 }, color: '#64748b' }
  },
  x: {
    grid: { color: 'rgba(203,213,225,0.25)', borderDash: [4, 4] },
    ticks: { font: { family: "'Inter', sans-serif", size: 10 }, color: '#64748b', precision: 0 }
  }
};

function ChartPanel({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="chart-box">
      <div className="chart-head">
        <div className="chart-icon">{Icon && <Icon size={16} />}</div>
        <div>
          <div className="card-title">{title}</div>
          {subtitle && <div className="chart-subtitle">{subtitle}</div>}
        </div>
      </div>
      <div className="chart-content">{children}</div>
    </div>
  );
}

function ChartEmpty({ message }) {
  return <div className="chart-empty"><span>—</span>{message}</div>;
}

/* ---------------- Greeting bar with live clock ---------------- */
function GreetBar({ subtitle }) {
  const { user } = useApp();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const h = now.getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <div className="greet-bar">
      <div>
        <h3>{greeting}, {user?.fullName} 👋</h3>
        <div className="sub">{subtitle}</div>
      </div>
      <div className="clock">
        <div className="time">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
        <div className="date">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
      </div>
    </div>
  );
}

/* ---------------- Birthday widget ---------------- */
function Birthdays({ birthdays }) {
  if (!birthdays?.length) return null;
  return (
    <div className="bday-card">
      <div className="card-title" style={{ color: '#fff' }}><Cake size={16} /> Upcoming Birthdays 🎂</div>
      {birthdays.slice(0, 5).map((b, i) => (
        <div key={i} className="row">
          <Cake size={14} />
          <b>{b.name}</b>
          <span style={{ marginLeft: 'auto', fontSize: 12 }}>
            {b.inDays === 0 ? 'Today!' : b.inDays === 1 ? 'Tomorrow' : `in ${b.inDays} days`} · turns {b.turns}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Admin dashboard (full command center) ---------------- */
function AdminDashboard({ stats, week, cur, navigate }) {
  return (
    <>
      <GreetBar subtitle="Here's the complete picture of your school today — you have full administrative control." />
      <div className="kpi-grid">
        <KpiCard color="navy" icon={GraduationCap} value={stats.activeStudents} label="Active Students"
          onAction={() => navigate('/admissions?add=1')} actionLabel="+ Add Student" />
        <KpiCard color="green" icon={UserCog} value={stats.teachers} label="Teachers"
          onAction={() => navigate('/users?add=teacher')} actionLabel="+ Add Teacher" />
        <KpiCard color="teal" icon={School} value={stats.classes} label="Classes"
          onAction={() => navigate('/classes?add=1')} actionLabel="+ Add Class" />
        <KpiCard color="purple" icon={BookOpen} value={stats.subjects} label="Subjects"
          onAction={() => navigate('/subjects?add=1')} actionLabel="+ Add Subject" />
        <KpiCard color="pink" icon={UsersRound} value={stats.parents} label="Parents" onClick={() => navigate('/parents')} />
        <KpiCard color="green" icon={Wallet} value={`${cur}${stats.todaysCollection.toLocaleString()}`} label="Today's Collection"
          onAction={() => navigate('/fees?add=1')} actionLabel="+ Record Payment" />
        <KpiCard color="red" icon={AlertTriangle} value={`${cur}${stats.outstanding.toLocaleString()}`} label="Outstanding Balance"
          onClick={() => navigate('/outstanding')} />
        <KpiCard color="teal" icon={Wallet} value={`${cur}${(stats.totalFeeCollected || 0).toLocaleString()}`} label="Total Collected (All-Time)" onClick={() => navigate('/fees')} />
        <KpiCard color="orange" icon={UserCheck} value={`${stats.attendanceToday.present}/${stats.attendanceToday.marked}`} label="Today's Attendance"
          onAction={() => navigate('/attendance')} actionLabel="Mark Now" />
        <KpiCard color="teal" icon={ClipboardList} value={stats.activeExams} label="Active Exams" onClick={() => navigate('/exams')} />
        <KpiCard color="red" icon={ShieldAlert} value={stats.openIncidents} label="Open Incidents" onClick={() => navigate('/discipline')} />
        <KpiCard color="orange" icon={UserPlus} value={stats.pendingAdmissions} label="Pending Admissions"
          onAction={() => navigate('/admissions')} actionLabel="Review" />
      </div>

      {stats.sheetsAwaitingPublish > 0 && (
        <div className="card card-pad mb" style={{ borderLeft: '4px solid var(--warning)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Megaphone size={18} style={{ color: 'var(--warning)' }} />
          <span><b>{stats.sheetsAwaitingPublish} mark sheet(s)</b> submitted by teachers are waiting for your publish approval.</span>
          <button className="btn btn-sm btn-orange" style={{ marginLeft: 'auto' }} onClick={() => navigate('/exams')}>Review & Publish</button>
        </div>
      )}

      <div className="chart-grid">
        <ChartPanel icon={UserCheck} title="Attendance" subtitle="Daily status totals · last 7 days">
          <div className="chart-canvas">
          <Bar
            data={{
              labels: week.map((w) => dayLabel(w.date)),
              datasets: [
                { label: 'Present', data: week.map((w) => w.present), backgroundColor: '#10b981', stack: 's', borderRadius: 4 },
                { label: 'Late', data: week.map((w) => w.late), backgroundColor: '#fbbf24', stack: 's', borderRadius: 4 },
                { label: 'Half-day', data: week.map((w) => w.halfday), backgroundColor: '#3b82f6', stack: 's', borderRadius: 4 },
                { label: 'Leave', data: week.map((w) => w.leave), backgroundColor: '#8b5cf6', stack: 's', borderRadius: 4 },
                { label: 'Absent', data: week.map((w) => w.absent), backgroundColor: '#ef4444', stack: 's', borderRadius: 4 },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: legendOpts, tooltip: tooltipOpts },
              scales: {
                x: { stacked: true, grid: { display: false }, ticks: { font: { family: "'Inter', sans-serif", size: 10 }, color: 'var(--txt-muted)' } },
                y: { stacked: true, grid: { color: 'rgba(203,213,225,0.25)', borderDash: [4, 4] }, ticks: { font: { family: "'Inter', sans-serif", size: 10 }, color: 'var(--txt-muted)', precision: 0 } }
              }
            }}
          />
          </div>
        </ChartPanel>
        <ChartPanel icon={Wallet} title="Fee Collection" subtitle="Daily receipts · last 7 days">
          <div className="chart-canvas">
          <Line
            data={{
              labels: stats.feeTrend.map((f) => dayLabel(f.date)),
              datasets: [{
                label: `Collection (${cur})`, data: stats.feeTrend.map((f) => f.amount),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16,185,129,0.10)',
                fill: true,
                tension: 0.42,
                borderWidth: 3,
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
              }],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { ...tooltipOpts, callbacks: { label: (context) => `${cur}${Number(context.raw || 0).toLocaleString('en-IN')}` } },
              },
              scales: {
                ...commonScales,
                y: { ...commonScales.y, ticks: { ...commonScales.y.ticks, callback: (value) => `${cur}${compactNumber(value)}` } },
              }
            }}
          />
          </div>
        </ChartPanel>
        <ChartPanel
          icon={UsersRound}
          title="Student Gender Mix"
          subtitle={stats.genderMix['not specified'] ? `${stats.genderMix['not specified'].toLocaleString()} records require gender data` : 'Active students'}
        >
          <div className="chart-doughnut">
            <Doughnut
              data={{
                labels: Object.keys(stats.genderMix).map((g) => g[0].toUpperCase() + g.slice(1)),
                datasets: [{
                  data: Object.values(stats.genderMix),
                  backgroundColor: Object.keys(stats.genderMix).map((gender) => ({ male: '#2563eb', female: '#ec4899', other: '#8b5cf6', 'not specified': '#94a3b8' }[gender])),
                  borderWidth: 3,
                  borderColor: 'rgba(255,255,255,0.75)',
                  hoverOffset: 4
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: legendOpts, tooltip: tooltipOpts },
                cutout: '70%'
              }}
            />
          </div>
        </ChartPanel>
        <Birthdays birthdays={stats.birthdays} />
        <ChartPanel icon={GraduationCap} title="Class-wise Strength" subtitle="Active students by grade">
          <div className="chart-canvas chart-canvas-tall">
          <Bar
            data={{
              labels: Object.entries(stats.classWiseStrength || {}).filter(([, count]) => count > 0).map(([label]) => label),
              datasets: [{
                label: 'Students',
                data: Object.entries(stats.classWiseStrength || {}).filter(([, count]) => count > 0).map(([, count]) => count),
                backgroundColor: 'rgba(37,99,235,.82)',
                borderColor: '#2563eb',
                borderWidth: 1,
                borderRadius: 6,
                barThickness: 14
              }]
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              indexAxis: 'y',
              plugins: { legend: { display: false }, tooltip: tooltipOpts },
              scales: horizontalScales
            }}
          />
          </div>
        </ChartPanel>
        <ChartPanel icon={Wallet} title="Fee Demand" subtitle="Collected versus outstanding">
          <div className="chart-doughnut">
            <Doughnut
              data={{
                labels: ['Total Collected (All-Time)', 'Outstanding Balance'],
                datasets: [{
                  data: [stats.totalFeeCollected || 0, stats.outstanding || 0],
                  backgroundColor: ['#10b981', '#ef4444'],
                  borderWidth: 3,
                  borderColor: 'rgba(255,255,255,0.75)',
                  hoverOffset: 4
                }]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: legendOpts,
                  tooltip: { ...tooltipOpts, callbacks: { label: (context) => `${context.label}: ${cur}${Number(context.raw || 0).toLocaleString('en-IN')}` } },
                },
                cutout: '70%'
              }}
            />
          </div>
        </ChartPanel>
        <ChartPanel icon={ShieldAlert} title="Discipline Severity" subtitle="Recorded incidents by priority">
          {Object.values(stats.severity).some((value) => value > 0) ? (
            <div className="chart-doughnut">
              <Doughnut
              data={{
                labels: Object.keys(stats.severity).map((g) => g[0].toUpperCase() + g.slice(1)),
                datasets: [{
                  data: Object.values(stats.severity),
                  backgroundColor: ['#fbbf24', '#ef4444', '#3b82f6'],
                  borderWidth: 3,
                  borderColor: 'rgba(255,255,255,0.75)',
                  hoverOffset: 4
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: legendOpts, tooltip: tooltipOpts },
                cutout: '70%'
              }}
              />
            </div>
          ) : <ChartEmpty message="No discipline incidents recorded" />}
        </ChartPanel>
      </div>
    </>
  );
}

/* ---------------- Clerk dashboard (front office: admissions + fees) ---------------- */
function ClerkDashboard({ stats, cur, navigate }) {
  const [receipts, setReceipts] = useState([]);
  const [admissions, setAdmissions] = useState([]);
  useEffect(() => {
    api.get('/fees').then(({ data }) => setReceipts(data.slice(0, 6)));
    api.get('/admissions', { params: { status: 'registered' } }).then(({ data }) => setAdmissions(data.slice(0, 5)));
  }, []);

  return (
    <>
      <GreetBar subtitle="Front-office view — admissions, fee collection and receipts at your fingertips." />
      <div className="kpi-grid">
        <KpiCard color="green" icon={Wallet} value={`${cur}${stats.todaysCollection.toLocaleString()}`} label="Today's Collection"
          onAction={() => navigate('/fees?add=1')} actionLabel="+ Record Payment" />
        <KpiCard color="red" icon={AlertTriangle} value={`${cur}${stats.outstanding.toLocaleString()}`} label="Outstanding Dues"
          onClick={() => navigate('/outstanding')} />
        <KpiCard color="teal" icon={Receipt} value={stats.receiptsToday} label="Receipts Today" onClick={() => navigate('/fees')} />
        <KpiCard color="orange" icon={UserPlus} value={stats.pendingAdmissions} label="Pending Admissions"
          onAction={() => navigate('/admissions?add=1')} actionLabel="+ New Registration" />
        <KpiCard color="navy" icon={GraduationCap} value={stats.activeStudents} label="Active Students"
          onClick={() => navigate('/students')} />
      </div>

      <div className="grid-2">
        <div className="card card-pad">
          <div className="card-title"><Receipt size={15} /> Latest Receipts</div>
          <table className="data-table">
            <thead><tr><th>Receipt</th><th>Student</th><th>Paid</th><th>Status</th></tr></thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r._id} style={{ cursor: 'pointer' }} onClick={() => navigate('/fees')}>
                  <td className="mono small">{r.receiptNo}</td><td>{r.studentName}</td>
                  <td><b>{cur}{(r.amountPaid || 0).toLocaleString()}</b></td>
                  <td><Badge value={r.status} /></td>
                </tr>
              ))}
              {receipts.length === 0 && <tr className="empty-row"><td colSpan={4}>No receipts yet</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div className="card card-pad">
            <div className="card-title"><UserPlus size={15} /> Waiting for Enrollment</div>
            {admissions.map((a) => (
              <div key={a._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="badge bg-blue">{a.regNo}</span>
                <b>{a.firstName} {a.lastName}</b>
                <span className="small muted">{a.classAppliedFor}</span>
                <button className="btn btn-xs btn-green" style={{ marginLeft: 'auto' }} onClick={() => navigate('/admissions')}>Enroll</button>
              </div>
            ))}
            {admissions.length === 0 && <p className="muted small">No pending registrations 🎉</p>}
          </div>
          <Birthdays birthdays={stats.birthdays} />
        </div>
      </div>
    </>
  );
}

/* ---------------- Supervisor dashboard (operations: attendance + discipline) ---------------- */
function SupervisorDashboard({ stats, week, navigate }) {
  const [incidents, setIncidents] = useState([]);
  useEffect(() => {
    api.get('/discipline', { params: { status: 'open' } }).then(({ data }) => setIncidents(data.slice(0, 6)));
  }, []);

  return (
    <>
      <GreetBar subtitle="Operations view — attendance, discipline and school day management." />
      <div className="kpi-grid">
        <KpiCard color="orange" icon={UserCheck} value={`${stats.attendanceToday.present}/${stats.attendanceToday.marked}`} label="Today's Attendance"
          onAction={() => navigate('/attendance')} actionLabel="Mark Now" />
        <KpiCard color="red" icon={ShieldAlert} value={stats.openIncidents} label="Open Incidents" onClick={() => navigate('/discipline')} />
        <KpiCard color="purple" icon={MessageSquareWarning} value={stats.openComplaints} label="Open Complaints" onClick={() => navigate('/complaints')} />
        <KpiCard color="teal" icon={LifeBuoy} value={stats.openTickets} label="Helpdesk Tickets" onClick={() => navigate('/helpdesk')} />
        <KpiCard color="navy" icon={ClipboardList} value={stats.activeExams} label="Active Exams" onClick={() => navigate('/exams')} />
      </div>

      <div className="grid-2">
        <div className="chart-box">
          <div className="card-title">Attendance — Last 7 Days</div>
          <Bar
            data={{
              labels: week.map((w) => dayLabel(w.date)),
              datasets: [
                { label: 'Present', data: week.map((w) => w.present), backgroundColor: '#16a34a', stack: 's' },
                { label: 'Absent', data: week.map((w) => w.absent), backgroundColor: '#ef4444', stack: 's' },
                { label: 'Late', data: week.map((w) => w.late), backgroundColor: '#f59e0b', stack: 's' },
              ],
            }}
            options={{ responsive: true, plugins: { legend: legendOpts }, scales: { x: { stacked: true }, y: { stacked: true } } }}
          />
        </div>
        <div className="card card-pad">
          <div className="card-title"><ShieldAlert size={15} /> Open Discipline Cases</div>
          {incidents.map((d) => (
            <div key={d._id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Badge value={d.severity} />
                <b>{d.studentName}</b>
                <span className="small muted" style={{ marginLeft: 'auto' }}>{d.date}</span>
              </div>
              <div className="small muted" style={{ marginTop: 3 }}>{d.incident}</div>
            </div>
          ))}
          {incidents.length === 0 && <p className="muted small">No open incidents 🎉</p>}
          <button className="btn btn-sm btn-navy mt" onClick={() => navigate('/discipline')}>Open Discipline Register</button>
        </div>
      </div>
    </>
  );
}

/* ---------------- Teacher dashboard (my day: periods + classes) ---------------- */
function TeacherDashboard({ navigate }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/dashboard/teacher').then(({ data }) => setData(data)); }, []);
  if (!data) return <div className="card card-pad">Loading your day…</div>;

  return (
    <>
      <GreetBar subtitle={data.classTeacherOf
        ? `You are the class teacher of ${data.classTeacherOf}. Here's your day at a glance.`
        : "Here's your teaching day at a glance."} />
      <div className="kpi-grid">
        <KpiCard color="navy" icon={School} value={data.stats.classes} label="My Classes" />
        <KpiCard color="purple" icon={BookOpen} value={data.stats.subjects} label="My Subjects" />
        <KpiCard color="teal" icon={GraduationCap} value={data.stats.students} label="My Students" />
        <KpiCard color="orange" icon={Award} value={data.stats.draftSheets} label="Draft Mark Sheets"
          onAction={() => navigate('/marks')} actionLabel="Enter Marks" />
        <KpiCard color="green" icon={UserCheck} value="Mark" label="Today's Attendance"
          onAction={() => navigate('/attendance')} actionLabel="Open Register" />
      </div>

      <div className="grid-2">
        <div className="card card-pad">
          <div className="card-title"><CalendarRange size={15} /> My Periods Today ({data.dayName})</div>
          <table className="data-table">
            <thead><tr><th>Period</th><th>Time</th><th>Class</th><th>Subject</th></tr></thead>
            <tbody>
              {data.todaysPeriods.map((p, i) => (
                <tr key={i}>
                  <td><Badge value={`P${p.period}`} color="bg-navy" /></td>
                  <td>{p.start} – {p.end}</td>
                  <td>{p.className}</td>
                  <td><b>{p.subjectName}</b></td>
                </tr>
              ))}
              {data.todaysPeriods.length === 0 && <tr className="empty-row"><td colSpan={4}>No periods today — enjoy! 🎉</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div className="card card-pad">
            <div className="card-title"><BookOpen size={15} /> My Class & Subject Assignments</div>
            {data.assignments.map((a) => (
              <div key={a._id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <Badge value={a.subjectName} color="bg-purple" />
                <span>{a.className}</span>
                <span className="small muted" style={{ marginLeft: 'auto' }}>{a.studentCount} students</span>
              </div>
            ))}
            {data.assignments.length === 0 && <p className="muted small">No assignments yet — ask admin to assign classes.</p>}
          </div>
          <div className="card card-pad">
            <div className="card-title"><Send size={15} /> Quick Actions</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-sm btn-green" onClick={() => navigate('/attendance')}><UserCheck size={14} /> Mark Attendance</button>
              <button className="btn btn-sm btn-navy" onClick={() => navigate('/marks')}><Award size={14} /> Enter Marks</button>
              <button className="btn btn-sm btn-blue" onClick={() => navigate('/lesson-planning')}><NotebookPen size={14} /> Lesson Plan</button>
              <button className="btn btn-sm btn-orange" onClick={() => navigate('/logbook')}><BookOpen size={14} /> Logbook</button>
              <button className="btn btn-sm btn-red" onClick={() => navigate('/discipline')}><ShieldAlert size={14} /> Report Incident</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------- Entry ---------------- */
export default function Dashboard() {
  const { user, settings } = useApp();
  const [stats, setStats] = useState(null);
  const [week, setWeek] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();
  const cur = settings.currency || '₹';

  const load = useCallback(async () => {
    if (user?.role === 'teacher') return;
    setRefreshing(true);
    try {
      const [s, w] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/attendance/summary/week'),
      ]);
      setStats(s.data);
      setWeek(w.data);
      setLastUpdated(new Date());
    } finally {
      setRefreshing(false);
    }
  }, [user?.role]);

  useEffect(() => {
    load();
    // Auto-refresh every 60 seconds
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  if (user?.role === 'teacher') return <TeacherDashboard navigate={navigate} />;
  if (!stats) return <div className="card card-pad">Loading dashboard…</div>;

  return (
    <>
      <div className="page-head">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Dashboard</h2>
        <div className="spacer" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            className="btn btn-sm btn-gray"
            onClick={load}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
      {user?.role === 'clerk' && <ClerkDashboard stats={stats} cur={cur} navigate={navigate} />}
      {user?.role === 'supervisor' && <SupervisorDashboard stats={stats} week={week} navigate={navigate} />}
      {!['clerk', 'supervisor'].includes(user?.role) && <AdminDashboard stats={stats} week={week} cur={cur} navigate={navigate} />}
    </>
  );
}
