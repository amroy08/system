import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContextValue';
import { errMsg } from '../api';

export default function Login() {
  const { login, settings, user } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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

  const initials = (settings.schoolName || 'DS').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">{initials}</div>
        <h1>{settings.schoolName || 'Demo School'}</h1>
        <div className="sub">School Management System — Sign in to continue</div>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={submit} style={{ display: 'grid', gap: 13 }}>
          <div className="field">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. admin" autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button className="btn btn-navy" disabled={busy} style={{ justifyContent: 'center', padding: 11 }}>
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
