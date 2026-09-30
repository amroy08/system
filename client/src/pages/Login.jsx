import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Eye, EyeOff, ArrowRight, ShieldCheck, Fingerprint, KeyRound } from 'lucide-react';
import { useApp } from '../context/AppContextValue';
import { errMsg } from '../api';

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

  const schoolName = settings.schoolName || 'M.V. HIGH SCHOOL';
  const year = new Date().getFullYear();
  const acadYear = `${year}-${year + 1}`;

  return (
    <div className="login-page">
      {/* Left branding panel */}
      <div className="login-brand-panel">
        <div className="login-brand-content">
          <div className="login-brand-monogram">MV</div>
          <h1 className="login-brand-name">{schoolName}</h1>
          <p className="login-brand-tagline">Enterprise Management Portal</p>
          <div className="login-brand-divider" />
          <div className="login-brand-features">
            <div className="login-brand-feature">
              <ShieldCheck size={18} />
              <span>End-to-end encrypted sessions</span>
            </div>
            <div className="login-brand-feature">
              <Fingerprint size={18} />
              <span>Browser-bound authentication</span>
            </div>
            <div className="login-brand-feature">
              <KeyRound size={18} />
              <span>Brute-force protected access</span>
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
        </div>
      </div>
    </div>
  );
}
