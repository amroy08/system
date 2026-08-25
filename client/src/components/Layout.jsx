import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BarChart3, UserPlus, GraduationCap, School, Users, Package, Boxes,
  BookOpen, UserCog, UserCheck, ClipboardList, ClipboardCheck, FileBadge, ShieldAlert,
  Award, Trophy, Wallet, Receipt, Landmark, LifeBuoy, MessageSquareWarning, FolderOpen,
  UsersRound, CircleUser, Settings, Megaphone, CalendarDays, CalendarRange,
  NotebookPen, BookMarked, LogOut, ChevronLeft, ChevronRight, RefreshCw,
  Library, BadgeIndianRupee, Search, ArrowUpDown, Bell, Menu, DatabaseBackup,
} from 'lucide-react';
import { useApp } from '../context/AppContextValue';
import { api } from '../api';
import CommandPalette from './CommandPalette';

const NAV = [
  { section: 'Overview', items: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'clerk', 'supervisor', 'teacher'] },
    { to: '/portal', label: 'My Dashboard', icon: LayoutDashboard, roles: ['student', 'parent'] },
    { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'clerk', 'supervisor'] },
  ]},
  { section: 'Records', items: [
    { to: '/admissions', label: 'Admissions', icon: UserPlus, roles: ['admin', 'clerk', 'supervisor'] },
    { to: '/students', label: 'Students', icon: GraduationCap, roles: ['admin', 'clerk', 'supervisor', 'teacher'] },
    { to: '/classes', label: 'Classes & Sections', icon: School, roles: ['admin', 'clerk', 'supervisor'] },
    { to: '/parents', label: 'Parents', icon: UsersRound, roles: ['admin', 'clerk', 'supervisor'] },
    { to: '/assets', label: 'Assets', icon: Package, roles: ['admin', 'clerk', 'supervisor'] },
    { to: '/inventory', label: 'Stock / Inventory', icon: Boxes, roles: ['admin', 'clerk', 'supervisor'] },
    { to: '/subjects', label: 'Subjects', icon: BookOpen, roles: ['admin', 'clerk', 'supervisor'] },
    { to: '/teachers', label: 'Teachers', icon: UserCog, roles: ['admin', 'clerk', 'supervisor'] },
    { to: '/substitutes', label: 'Substitutes', icon: RefreshCw, roles: ['admin', 'clerk', 'supervisor'] },
  ]},
  { section: 'Library', items: [
    { to: '/library', label: 'Books Catalog', icon: Library, roles: ['admin', 'clerk', 'supervisor', 'teacher', 'student', 'parent'] },
    { to: '/library-circulation', label: 'Issue / Return', icon: BookMarked, roles: ['admin', 'clerk', 'supervisor', 'teacher'] },
  ]},
  { section: 'Daily', items: [
    { to: '/timetable', label: 'Timetable', icon: CalendarRange, roles: ['admin', 'clerk', 'supervisor', 'teacher', 'student', 'parent'] },
    { to: '/attendance', label: 'Attendance', icon: UserCheck, roles: ['admin', 'clerk', 'supervisor', 'teacher'] },
    { to: '/notices', label: 'School Notices', icon: Megaphone, roles: ['admin', 'clerk', 'supervisor', 'teacher', 'student', 'parent'] },
    { to: '/homework', label: 'Homework / Classwork', icon: ClipboardCheck, roles: ['admin', 'clerk', 'supervisor', 'teacher', 'student', 'parent'] },
    { to: '/ptm', label: 'PTM', icon: UsersRound, roles: ['admin', 'clerk', 'supervisor', 'teacher', 'parent'] },
    { to: '/calendar', label: 'Calendar', icon: CalendarDays, roles: ['admin', 'clerk', 'supervisor', 'teacher', 'student', 'parent'] },
    { to: '/activities', label: 'Activities', icon: Trophy, roles: ['admin', 'clerk', 'supervisor', 'teacher', 'student', 'parent'] },
    { to: '/lesson-planning', label: 'Lesson Planning', icon: NotebookPen, roles: ['admin', 'supervisor', 'teacher'] },
    { to: '/logbook', label: 'Teaching Logbook', icon: BookMarked, roles: ['admin', 'supervisor', 'teacher'] },
  ]},
  { section: 'Academic', items: [
    { to: '/exams', label: 'Exams', icon: ClipboardList, roles: ['admin', 'clerk', 'supervisor', 'teacher'] },
    { to: '/marks', label: 'Results / Marks', icon: Award, roles: ['admin', 'clerk', 'supervisor', 'teacher'] },
    { to: '/hall-tickets', label: 'Hall Tickets', icon: FileBadge, roles: ['admin', 'clerk', 'supervisor', 'student', 'parent'] },
    { to: '/discipline', label: 'Discipline', icon: ShieldAlert, roles: ['admin', 'clerk', 'supervisor', 'teacher'], badgeKey: 'openIncidents' },
    { to: '/conduct', label: 'Conduct', icon: Award, roles: ['admin', 'clerk', 'supervisor', 'teacher'] },
    { to: '/promotions', label: 'Promotions', icon: ArrowUpDown, roles: ['admin'] },
  ]},
  { section: 'Finance', items: [
    { to: '/fees', label: 'Fees Collection', icon: Wallet, roles: ['admin', 'clerk', 'supervisor'] },
    { to: '/outstanding', label: 'Outstanding Dues', icon: Landmark, roles: ['admin', 'clerk', 'supervisor'] },
    { to: '/payroll', label: 'Payroll / Salary', icon: BadgeIndianRupee, roles: ['admin', 'clerk', 'supervisor', 'teacher'] },
    { to: '/daily-accounts', label: 'Daily Accounts', icon: Landmark, roles: ['admin', 'clerk', 'supervisor'] },
    { to: '/fee-structure', label: 'Fee Structure', icon: Receipt, roles: ['admin', 'clerk', 'supervisor'] },
  ]},
  { section: 'Support', items: [
    { to: '/helpdesk', label: 'Helpdesk', icon: LifeBuoy, roles: ['admin', 'clerk', 'supervisor', 'teacher', 'student', 'parent'], badgeKey: 'openTickets' },
    { to: '/complaints', label: 'Complaints', icon: MessageSquareWarning, roles: ['admin', 'clerk', 'supervisor', 'teacher', 'student', 'parent'], badgeKey: 'openComplaints' },
    { to: '/documents', label: 'Documents', icon: FolderOpen, roles: ['admin', 'clerk', 'supervisor', 'teacher', 'student', 'parent'] },
  ]},
  { section: 'Administration', items: [
    { to: '/users', label: 'Users / Staff', icon: Users, roles: ['admin', 'clerk', 'supervisor'] },
    { to: '/backups', label: 'System Backup', icon: DatabaseBackup, roles: ['admin'] },
  ]},
  { section: 'Profile', items: [
    { to: '/account', label: 'My Account', icon: CircleUser, roles: ['admin', 'clerk', 'supervisor', 'teacher', 'student', 'parent'] },
    { to: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
  ]},
];

const TITLES = {
  '/': 'Dashboard', '/portal': 'My Dashboard', '/reports': 'Reports', '/admissions': 'Admissions',
  '/students': 'Students', '/classes': 'Classes & Sections', '/parents': 'Parents',
  '/assets': 'Assets', '/inventory': 'Inventory', '/subjects': 'Subjects',
  '/teachers': 'Teachers', '/substitutes': 'Substitutes', '/timetable': 'Timetable',
  '/attendance': 'Attendance', '/notices': 'Notices', '/ptm': 'Parent-Teacher Meetings',
  '/calendar': 'Calendar', '/lesson-planning': 'Lesson Planning', '/logbook': 'Logbook',
  '/exams': 'Exams', '/marks': 'Marks & Results', '/hall-tickets': 'Hall Tickets',
  '/discipline': 'Discipline', '/conduct': 'Conduct', '/activities': 'Activities',
  '/fees': 'Fees Collection', '/daily-accounts': 'Daily Accounts', '/fee-structure': 'Fee Structure',
  '/promotions': 'Promotions', '/outstanding': 'Outstanding Dues',
  '/helpdesk': 'Helpdesk', '/complaints': 'Complaints', '/documents': 'Documents',
  '/users': 'Users', '/account': 'My Account', '/settings': 'Settings', '/backups': 'System Backup',
  '/library': 'Library — Books', '/library-circulation': 'Library — Issue / Return',
  '/payroll': 'Payroll',
};

export default function Layout() {
  const { user, logout, settings } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [badges, setBadges] = useState({});
  const [cmdOpen, setCmdOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!['admin', 'clerk', 'supervisor', 'teacher'].includes(user?.role)) return;
    api.get('/dashboard/stats').then(({ data }) =>
      setBadges({ openIncidents: data.openIncidents, openTickets: data.openTickets, openComplaints: data.openComplaints })
    ).catch(() => {});
  }, [location.pathname, user]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setCmdOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => { if (event.key === 'Escape') setMobileMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileMenuOpen]);

  const title = TITLES[location.pathname] || 'Dashboard';
  const canSearch = ['admin', 'clerk', 'supervisor', 'teacher'].includes(user?.role);
  const initials = user?.fullName ? user.fullName.split(' ').map(n => n[0]).slice(0, 2).join('') : 'U';

  return (
    <div className={`app-shell ${collapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'mobile-nav-active' : ''}`}>
      {mobileMenuOpen && (
        <div className="sidebar-overlay no-print" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className={`sidebar-shell ${mobileMenuOpen ? 'mobile-open' : ''}`} aria-label="Main navigation">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="brand-icon">
            <GraduationCap size={20} />
          </div>
          <div className="sidebar-brand-text nav-label">
            <div className="brand-name">{settings.schoolName || 'MVHS ERP'}</div>
            <div className="brand-sub">School Management</div>
          </div>
          <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* User */}
        <div className="school-block nav-label">
          <div className="user-avatar">{initials}</div>
          <div>
            <div className="uname">{user?.fullName}</div>
            <div className="urole">{user?.role}</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {NAV.map((sec) => {
            const items = sec.items.filter((i) => i.roles.includes(user?.role));
            if (!items.length) return null;
            return (
              <div key={sec.section}>
                <div className="nav-section-label">{sec.section}</div>
                {items.map((i) => (
                  <NavLink
                    key={i.to}
                    to={i.to}
                    className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`}
                    end={i.to === '/'}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <i.icon size={16} style={{ flexShrink: 0 }} />
                    <span className="nav-label">{i.label}</span>
                    {i.badgeKey && badges[i.badgeKey] > 0 && (
                      <span className="nav-badge">{badges[i.badgeKey]}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar-foot">
          <div className="ay-label nav-label">Academic Year 2026–27</div>
          <button className="foot-btn logout-btn" onClick={() => { logout(); navigate('/login'); setMobileMenuOpen(false); }}>
            <LogOut size={14} />
            <span className="nav-label">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Area ────────────────────────────────────────── */}
      <div className="main-area">
        <header className="topbar no-print">
          <button className="mobile-toggle" aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <Menu size={18} />
          </button>
          {/* Page title (left) */}
          <div className="page-title">{title}</div>

          <div className="spacer" />

          {/* Right controls */}
          <div className="top-right">
            {/* Academic Year badge */}
            <div className="ay-badge">
              <span className="dot" />
              <span className="ay-label-text">AY 2026–27</span>
            </div>

            {/* Search */}
            {canSearch && (
              <button className="search-trigger" onClick={() => setCmdOpen(true)}>
                <Search size={13} />
                <span className="search-label">Search everything…</span>
                <span className="kbd">Ctrl K</span>
              </button>
            )}

            {/* Notifications */}
            <button className="topbar-icon-btn" title="Notifications">
              <Bell size={17} />
            </button>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
