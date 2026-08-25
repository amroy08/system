import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { useApp } from './context/AppContextValue';
import Layout from './components/Layout';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Reports = lazy(() => import('./pages/Reports'));
const Admissions = lazy(() => import('./pages/Admissions'));
const Students = lazy(() => import('./pages/Students'));
const Classes = lazy(() => import('./pages/Classes'));
const Parents = lazy(() => import('./pages/Parents'));
const Assets = lazy(() => import('./pages/Assets'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Subjects = lazy(() => import('./pages/Subjects'));
const Teachers = lazy(() => import('./pages/Teachers'));
const Substitutes = lazy(() => import('./pages/Substitutes'));
const Timetable = lazy(() => import('./pages/Timetable'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Exams = lazy(() => import('./pages/Exams'));
const Marks = lazy(() => import('./pages/Marks'));
const HallTickets = lazy(() => import('./pages/HallTickets'));
const Fees = lazy(() => import('./pages/Fees'));
const Payroll = lazy(() => import('./pages/Payroll'));
const Promotions = lazy(() => import('./pages/Promotions'));
const Outstanding = lazy(() => import('./pages/Outstanding'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const Account = lazy(() => import('./pages/Account'));
const About = lazy(() => import('./pages/About'));
const Backups = lazy(() => import('./pages/Backups'));
const Homework = lazy(() => import('./pages/Homework'));
const Portal = lazy(() => import('./pages/Portal'));
const LibraryBooks = lazy(() => import('./pages/Library').then((module) => ({ default: module.LibraryBooks })));
const LibraryCirculation = lazy(() => import('./pages/Library').then((module) => ({ default: module.LibraryCirculation })));
const lazySimplePage = (name) => lazy(() => import('./pages/simplePages').then((module) => ({ default: module[name] })));
const Notices = lazySimplePage('Notices');
const CalendarPage = lazySimplePage('CalendarPage');
const LessonPlanning = lazySimplePage('LessonPlanning');
const Logbook = lazySimplePage('Logbook');
const Discipline = lazySimplePage('Discipline');
const Conduct = lazySimplePage('Conduct');
const Activities = lazySimplePage('Activities');
const Helpdesk = lazySimplePage('Helpdesk');
const Complaints = lazySimplePage('Complaints');
const Documents = lazySimplePage('Documents');
const PTM = lazySimplePage('PTM');
const FeeStructure = lazySimplePage('FeeStructure');
const DailyAccounts = lazySimplePage('DailyAccounts');

function Protected({ children }) {
  const { user, authReady } = useApp();
  const location = useLocation();
  if (!authReady) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.passwordChangeRequired && location.pathname !== '/account') return <Navigate to="/account" replace />;
  return children;
}

function AdminOnly({ children }) {
  const { user } = useApp();
  return user?.role === 'admin' ? children : <Navigate to="/" replace />;
}

function RoleHome() {
  const { user } = useApp();
  if (['student', 'parent'].includes(user?.role)) return <Navigate to="/portal" replace />;
  return <Dashboard />;
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Suspense fallback={<div role="status" aria-live="polite" style={{ padding: '2rem' }}>Loading…</div>}>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/home" element={<Navigate to="/login" replace />} />
          <Route path="/about-us" element={<Navigate to="/login" replace />} />
          <Route path="/contact" element={<Navigate to="/login" replace />} />

          <Route element={<Protected><Layout /></Protected>}>
            <Route path="/" element={<RoleHome />} />
            <Route path="/portal" element={<Portal />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/admissions" element={<Admissions />} />
            <Route path="/students" element={<Students />} />
            <Route path="/classes" element={<Classes />} />
            <Route path="/parents" element={<Parents />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/library" element={<LibraryBooks />} />
            <Route path="/library-circulation" element={<LibraryCirculation />} />
            <Route path="/subjects" element={<Subjects />} />
            <Route path="/teachers" element={<Teachers />} />
            <Route path="/substitutes" element={<Substitutes />} />
            <Route path="/timetable" element={<Timetable />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/notices" element={<Notices />} />
            <Route path="/homework" element={<Homework />} />
            <Route path="/ptm" element={<PTM />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/lesson-planning" element={<LessonPlanning />} />
            <Route path="/logbook" element={<Logbook />} />
            <Route path="/exams" element={<Exams />} />
            <Route path="/marks" element={<Marks />} />
            <Route path="/hall-tickets" element={<HallTickets />} />
            <Route path="/discipline" element={<Discipline />} />
            <Route path="/conduct" element={<Conduct />} />
            <Route path="/activities" element={<Activities />} />
            <Route path="/fees" element={<Fees />} />
            <Route path="/payroll" element={<Payroll />} />
            <Route path="/daily-accounts" element={<DailyAccounts />} />
            <Route path="/fee-structure" element={<FeeStructure />} />
            <Route path="/promotions" element={<Promotions />} />
            <Route path="/outstanding" element={<Outstanding />} />
            <Route path="/helpdesk" element={<Helpdesk />} />
            <Route path="/complaints" element={<Complaints />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/users" element={<Users />} />
            <Route path="/account" element={<Account />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/backups" element={<AdminOnly><Backups /></AdminOnly>} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppProvider>
  );
}
