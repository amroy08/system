import { NavLink, Outlet, Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useApp } from '../context/AppContextValue';

export default function PublicLayout() {
  const { settings, user } = useApp();

  return (
    <div className="public-shell">
      <nav className="public-nav">
        <Link to="/home" className="brand">
          <GraduationCap size={26} /> {settings.schoolName || 'Demo School'}
        </Link>
        <div className="links">
          <NavLink to="/home" className={({ isActive }) => (isActive ? 'on' : '')}>Home</NavLink>
          <NavLink to="/about-us" className={({ isActive }) => (isActive ? 'on' : '')}>About Us</NavLink>
          <NavLink to="/contact" className={({ isActive }) => (isActive ? 'on' : '')}>Contact Us</NavLink>
          {user ? (
            <Link to="/" className="login-cta">Open Portal</Link>
          ) : (
            <NavLink to="/login" className={({ isActive }) => `login-cta ${isActive ? 'on' : ''}`}>Login</NavLink>
          )}
        </div>
      </nav>
      <Outlet />
      <footer className="public-footer">
        <span>© {new Date().getFullYear()} {settings.schoolName || 'Demo School'} — All rights reserved.</span>
        <span>{settings.address}</span>
        <span>{settings.phone} · {settings.email}</span>
      </footer>
    </div>
  );
}
