import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardCheck, UserCheck, Wallet, Megaphone,
  GraduationCap, Menu,
} from 'lucide-react';
import { useApp } from '../context/AppContextValue';

export default function MobileBottomNav({ onOpenMenu }) {
  const { user } = useApp();
  const location = useLocation();

  if (!user) return null;

  const isFamily = ['student', 'parent'].includes(user.role);

  const familyItems = [
    { to: '/portal', label: 'Home', icon: LayoutDashboard },
    { to: '/homework', label: 'Homework', icon: ClipboardCheck },
    { to: '/attendance', label: 'Attendance', icon: UserCheck },
    { to: '/fees', label: 'Fees', icon: Wallet },
    { to: '/notices', label: 'Notices', icon: Megaphone },
  ];

  const staffItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/students', label: 'Students', icon: GraduationCap },
    { to: '/attendance', label: 'Attendance', icon: UserCheck },
    { to: '/fees', label: 'Fees', icon: Wallet },
  ];

  const items = isFamily ? familyItems : staffItems;

  return (
    <nav className="mobile-bottom-nav no-print">
      {items.map((it) => {
        const Icon = it.icon;
        const isActive = location.pathname === it.to;
        return (
          <NavLink
            key={it.to}
            to={it.to}
            className={`mobile-bottom-nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={19} />
            <span>{it.label}</span>
          </NavLink>
        );
      })}

      {!isFamily && onOpenMenu && (
        <button
          type="button"
          onClick={onOpenMenu}
          className="mobile-bottom-nav-item"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <Menu size={19} />
          <span>Menu</span>
        </button>
      )}
    </nav>
  );
}
