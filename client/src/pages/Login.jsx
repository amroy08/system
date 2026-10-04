import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Eye, EyeOff, ArrowRight, ShieldCheck, BookOpen, CalendarCheck, GraduationCap, Smartphone, Users, Award, Headphones } from 'lucide-react';
import { useApp } from '../context/AppContextValue';
import { errMsg } from '../api';
import { usePwa } from '../components/PwaInstallPrompt';

export default function Login() {
  const { login, settings, user } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate(['student', 'parent'].includes(user.role) ? '/portal' : '/');
    }
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter your username');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const user = await login(username.trim(), password);
      navigate(['student', 'parent'].includes(user.role) ? '/portal' : '/');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const { isInstalled, triggerInstall, isIos } = usePwa();

  const handleInstallClick = async () => {
    if (isIos) {
      alert("To install on iPhone/iPad:\n1. Tap the Safari Share button (square with arrow) at the bottom.\n2. Scroll down and tap 'Add to Home Screen'.\n3. Tap 'Add'!");
      return;
    }
    const outcome = await triggerInstall();
    if (!outcome) {
      alert("To install in Chrome:\nClick the 'Install App' icon at the top right of your address bar, or tap Chrome menu (3 dots) > 'Install M.V High School ERP'.");
    }
  };

  const schoolName = settings.schoolName || 'M.V. HIGH SCHOOL';
  const year = new Date().getFullYear();
  const acadYear = `${year}-${year + 1}`;

  return (
    <div className="login-page">
      {/* Left branding panel */}
      <div className="login-brand-panel">
        <div className="login-brand-content">
          <div className="login-brand-header-row">
            <div className="login-brand-logo-wrap">
              <img src="/logo.jpeg" alt={schoolName} className="login-brand-logo-img" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              <div className="login-brand-monogram">MV</div>
            </div>
            <div className="login-brand-badge-pill">
              <Award size={13} />
              <span>Official ERP Portal</span>
            </div>
          </div>

          <h1 className="login-brand-name">{schoolName}</h1>
          <p className="login-brand-tagline">Integrated Enterprise Management & Academic System</p>
          
          <div className="login-brand-roles">
            <span className="login-role-tag">Students</span>
            <span className="login-role-tag">Parents</span>
            <span className="login-role-tag">Teachers</span>
            <span className="login-role-tag">Administration</span>
          </div>

          <div className="login-brand-divider" />

          <div className="login-brand-features">
            <div className="login-brand-feature">
              <div className="login-feature-icon-box"><CalendarCheck size={18} /></div>
              <div>
                <strong>Smart Attendance & Timetable</strong>
                <p>Live period tracking, daily roll calls & biometric sync</p>
              </div>
            </div>
            <div className="login-brand-feature">
              <div className="login-feature-icon-box"><BookOpen size={18} /></div>
              <div>
                <strong>Fees, Homework & Library</strong>
                <p>Digital receipts, homework feeds and book circulation</p>
              </div>
            </div>
            <div className="login-brand-feature">
              <div className="login-feature-icon-box"><GraduationCap size={18} /></div>
              <div>
                <strong>Exams, Marks & Progress Cards</strong>
                <p>Comprehensive report cards, hall tickets & grade sheets</p>
              </div>
            </div>
          </div>

          {/* Highlights / stats badge on desktop */}
          <div className="login-brand-stats">
            <div className="login-stat-item">
              <span className="login-stat-label">Academic Year</span>
              <span className="login-stat-val">AY {acadYear}</span>
            </div>
            <div className="login-stat-divider" />
            <div className="login-stat-item">
              <span className="login-stat-label">Security</span>
              <span className="login-stat-val">256-Bit SSL</span>
            </div>
            <div className="login-stat-divider" />
            <div className="login-stat-item">
              <span className="login-stat-label">System Uptime</span>
              <span className="login-stat-val">99.9%</span>
            </div>
          </div>
        </div>

        <p className="login-brand-copyright">© {year} {schoolName}. All rights reserved.</p>
      </div>

      {/* Right form panel */}
      <div className="login-form-panel">
        <div className="login-form-container">
          {/* Mobile-only logo */}
          <div className="login-mobile-logo">
            <div className="login-brand-monogram login-brand-monogram--sm">MV</div>
            <h2 className="login-mobile-school">{schoolName}</h2>
          </div>

          <div className="login-form-logo">
            <img src="/school-logo.jpg" alt={schoolName + ' Logo'} className="login-school-logo" />
          </div>

          <div className="login-form-header">
            <h2>Welcome back</h2>
            <p>Sign in to your account to continue</p>
          </div>

          {error && (
            <div className="login-error animate-shake">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="login-form">
            <div className="login-field-box">
              <label className="login-label" htmlFor="login-username">Username / Staff ID</label>
              <div className="login-input-wrap">
                <span className="login-icon"><User size={16} /></span>
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. john.doe"
                  autoFocus
                  autoComplete="username"
                  spellCheck="false"
                />
              </div>
            </div>

            <div className="login-field-box">
              <div className="login-label-row">
                <label className="login-label" htmlFor="login-password">Password</label>
              </div>
              <div className="login-input-wrap">
                <span className="login-icon"><Lock size={16} /></span>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-toggle-pw"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="login-btn-primary" disabled={busy}>
              {busy ? (
                <span className="login-btn-content">
                  <span className="spinner-border-sm" /> Authenticating…
                </span>
              ) : (
                <span className="login-btn-content">
                  Sign In <ArrowRight size={17} />
                </span>
              )}
            </button>
          </form>

          <div className="login-footer-meta">
            <ShieldCheck size={14} className="login-shield-icon" />
            <span>Secure Encrypted Session · AY {acadYear}</span>
          </div>

          {!isInstalled && (
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={handleInstallClick}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: '0.82rem', padding: '6px 16px', borderRadius: '20px',
                  background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.25)',
                  color: 'var(--primary)', cursor: 'pointer', fontWeight: 600,
                }}
              >
                <Smartphone size={14} />
                Install School App
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
