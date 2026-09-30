import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react';
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
  const initials = schoolName.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'MH';

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header-group">
          <div className="login-logo-glow">
            <div className="login-logo">{initials}</div>
          </div>
          <h1>{schoolName}</h1>
          <p className="sub">Enterprise Portal · Sign in to continue</p>
        </div>

        {error && (
          <div className="login-error animate-shake">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={submit} className="login-form">
          <div className="login-field-box">
            <label className="login-label">Username / Staff ID</label>
            <div className="login-input-wrap">
              <span className="login-icon"><User size={16} /></span>
              <input
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
              <label className="login-label">Password</label>
            </div>
            <div className="login-input-wrap">
              <span className="login-icon"><Lock size={16} /></span>
              <input
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
                <span className="spinner-border-sm" /> Signing in…
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
          <span>Secure Encrypted Session · AY 2026-2027</span>
        </div>
      </div>
    </div>
  );
}
