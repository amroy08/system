import { useEffect, useState } from 'react';
import { BarChart3, GraduationCap, Wallet, UserCheck, ShieldAlert, School, UsersRound, ArrowRight, FileSpreadsheet, Search, SlidersHorizontal, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../context/AppContextValue';

export default function Reports() {
  const [stats, setStats] = useState(null);
  const { settings } = useApp();
  const navigate = useNavigate();
  const cur = settings.currency || '₹';

  useEffect(() => { api.get('/dashboard/stats').then(({ data }) => setStats(data)); }, []);
  if (!stats) return <div className="card card-pad reports-loading">Loading reports…</div>;

  const reports = [
    { title: 'Students Report', category: 'Academic', desc: 'Full student roster with status, wing, academic year, and custom attributes.', icon: GraduationCap, to: '/students', tone: 'blue', stat: `${stats.activeStudents} Active` },
    { title: 'Fee Collection', category: 'Finance', desc: 'Detailed receipts ledger with filters for paid, partial, and unpaid collections.', icon: Wallet, to: '/fees', tone: 'green', stat: `${cur}${stats.todaysCollection.toLocaleString()} Today` },
    { title: 'Outstanding Dues', category: 'Finance', desc: 'Arrears tracker with class filters and pre-populated WhatsApp reminders.', icon: Wallet, to: '/outstanding', tone: 'red', stat: `${cur}${stats.outstanding.toLocaleString()} Pending` },
    { title: 'Attendance Report', category: 'Administrative', desc: 'Daily attendance register, present/absent history, and monthly totals.', icon: UserCheck, to: '/attendance', tone: 'orange', stat: `${stats.attendanceToday.present}/${stats.attendanceToday.marked} Marked` },
    { title: 'Class Strengths', category: 'Academic', desc: 'Class-wise student lists, capacity usage, wing allocation, and timetables.', icon: School, to: '/classes', tone: 'purple', stat: `${stats.classes} Classes` },
    { title: 'Discipline Log', category: 'Administrative', desc: 'Incident register sorted by severity, status, and pending action.', icon: ShieldAlert, to: '/discipline', tone: 'red', stat: `${stats.openIncidents} Open Cases` },
    { title: 'Daily Accounts', category: 'Finance', desc: 'Daily income and expense ledger with balances and transaction history.', icon: Wallet, to: '/daily-accounts', tone: 'teal', stat: 'Cash Ledger' },
    { title: 'Parents Directory', category: 'Administrative', desc: 'Contact directory for registered parents and their linked wards.', icon: UsersRound, to: '/parents', tone: 'orange', stat: `${stats.parents} Parents` },
  ];

  return (
    <>
      <div className="reports-hero">
        <div className="reports-hero-icon"><BarChart3 size={22} /></div>
        <div>
          <span className="reports-eyebrow">Analytics &amp; exports</span>
          <h2>Reports Center</h2>
          <p>Open a live ledger, apply filters, and export the exact school data you need.</p>
        </div>
        <div className="reports-hero-meta">
          <span><b>{reports.length}</b> report modules</span>
          <span><b>3</b> export formats</span>
        </div>
      </div>

      <div className="reports-section-head">
        <div><h3>Available reports</h3><span>Select a module to open its detailed ledger</span></div>
        <div className="reports-categories"><span>Academic</span><span>Finance</span><span>Administrative</span></div>
      </div>

      <div className="reports-grid">
        {reports.map((r) => (
          <button
            type="button"
            key={r.title}
            className={`report-module tone-${r.tone}`}
            onClick={() => navigate(r.to)}
          >
            <div className="report-module-top">
              <div className="report-module-icon"><r.icon size={19} /></div>
              <div className="report-module-labels">
                <span className="report-category">{r.category}</span>
                <span className="report-stat">{r.stat}</span>
              </div>
            </div>
            <div className="report-module-copy"><h3>{r.title}</h3><p>{r.desc}</p></div>
            <div className="report-module-action">
              <span>Open report</span><span className="report-arrow"><ArrowRight size={14} /></span>
            </div>
          </button>
        ))}
      </div>

      <div className="reports-export-guide">
        <div className="reports-export-title">
          <div><FileSpreadsheet size={19} /></div>
          <span><b>Export any report in three steps</b><small>Every ledger supports the same fast workflow</small></span>
        </div>
        <div className="reports-export-steps">
          <span><i>1</i><Search size={15} /><b>Open a ledger</b></span>
          <span><i>2</i><SlidersHorizontal size={15} /><b>Apply filters</b></span>
          <span><i>3</i><Download size={15} /><b>CSV, PDF or Print</b></span>
        </div>
      </div>
    </>
  );
}
