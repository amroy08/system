import { Link } from 'react-router-dom';
import {
  GraduationCap, Users, Wallet, ClipboardList, Library, UserCheck, ShieldCheck,
  CalendarRange, Megaphone, BadgeIndianRupee, Boxes, Palette,
} from 'lucide-react';
import { useApp } from '../../context/AppContextValue';

const FEATURES = [
  { icon: GraduationCap, title: 'Admissions & Students', desc: 'Full admission pipeline — register, enroll, auto-create logins for students and parents, with medical notes, transport and house tracking.' },
  { icon: UserCheck, title: 'Smart Attendance', desc: 'Color-coded daily attendance with bulk actions, copy-from-yesterday, and per-student reports for any date range.' },
  { icon: ClipboardList, title: 'Exams & Results', desc: 'Marks entry with auto-grading, draft → submit → lock workflow, admin-only publishing, toppers and printable report cards.' },
  { icon: Wallet, title: 'Fees & Finance', desc: 'One-click fee computation, five payment modes, printable A4 receipts, daily accounts and outstanding tracking.' },
  { icon: BadgeIndianRupee, title: 'Payroll & Salary Slips', desc: 'Generate monthly salary slips with allowances and deductions, mark paid, and print professional A4 slips.' },
  { icon: Library, title: 'Library Management', desc: 'Complete books catalog, issue/return circulation desk, due dates, automatic late fines and overdue alerts.' },
  { icon: CalendarRange, title: 'Timetable & Substitutes', desc: 'Weekly period planner per class, plus one-click substitute allocation when a teacher is absent.' },
  { icon: Megaphone, title: 'Communication', desc: 'Notices with audience targeting, school calendar, PTM scheduling, helpdesk and complaint tracking.' },
  { icon: Boxes, title: 'Assets & Inventory', desc: 'Asset tags with maintenance expense history, and consumable stock with reorder-level alerts.' },
  { icon: ShieldCheck, title: 'Role-Based Access', desc: 'Six roles — Admin, Clerk, Supervisor, Teacher, Student, Parent — each with their own dashboard and permissions.' },
  { icon: Users, title: 'Parent Portal', desc: 'Parents see all their children in one dashboard — attendance, published results, fee balances and notices.' },
  { icon: Palette, title: 'Your Branding', desc: 'Built-in theme customizer — change primary and accent colors of the whole app to match your school.' },
];

export default function Home() {
  const { settings, user } = useApp();

  return (
    <>
      <section className="hero">
        <h1>Run Your Entire School from <span className="hl">One Beautiful Dashboard</span></h1>
        <p>
          {settings.schoolName || 'Demo School'} uses a complete management platform covering admissions,
          attendance, exams, fees, payroll, library and much more — for staff, teachers, students and parents.
        </p>
        <div className="cta-row">
          <Link to={user ? '/' : '/login'} className="btn btn-green" style={{ padding: '12px 28px', fontSize: 15 }}>
            {user ? 'Open Portal' : 'Login to Portal'}
          </Link>
          <Link to="/about-us" className="btn" style={{ padding: '12px 28px', fontSize: 15, background: 'rgba(255,255,255,.12)', color: '#fff' }}>
            Learn More
          </Link>
        </div>
        <div className="hero-stats">
          <div className="stat"><div className="n">30+</div><div className="l">Modules</div></div>
          <div className="stat"><div className="n">6</div><div className="l">User Roles</div></div>
          <div className="stat"><div className="n">100%</div><div className="l">Paperless Reports</div></div>
          <div className="stat"><div className="n">1-Click</div><div className="l">CSV / PDF Export</div></div>
        </div>
      </section>

      <section className="public-section">
        <h2>Everything a Modern School Needs</h2>
        <p className="lead">From the front office to the classroom, from the accounts desk to the library — every workflow is covered.</p>
        <div className="feat-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="feat-card">
              <div className="fi"><f.icon size={22} /></div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
