import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { AppCtx } from './AppContextValue';

// Apply the persisted theme immediately so public pages and login also respect it
if (localStorage.getItem('sms_theme') === 'dark') {
  document.documentElement.classList.add('dark');
}

function applyTheme(settings) {
  const root = document.documentElement;
  if (settings.primaryColor) {
    root.style.setProperty('--primary', settings.primaryColor);
    root.style.setProperty('--primary-dark', shade(settings.primaryColor, -18));
    root.style.setProperty('--primary-darker', shade(settings.primaryColor, -32));
  }
  if (settings.accentColor) {
    root.style.setProperty('--accent', settings.accentColor);
    root.style.setProperty('--accent-dark', shade(settings.accentColor, -15));
  }
}

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.min(255, Math.max(0, Math.round(c + (pct / 100) * 255)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [settings, setSettings] = useState({ schoolName: 'Demo School', currency: '₹' });
  const [toast, setToast] = useState(null);

  const loadSettings = useCallback(async () => {
    try {
      const endpoint = user?.passwordChangeRequired ? '/public/settings' : (user ? '/settings' : '/public/settings');
      const { data } = await api.get(endpoint);
      setSettings((s) => ({ ...s, ...data }));
      applyTheme(data);
    } catch { /* server may be starting */ }
  }, [user]);

  useEffect(() => {
    let active = true;
    api.get('/auth/me')
      .then(({ data }) => { if (active) setUser(data); })
      .catch(() => {})
      .finally(() => { if (active) setAuthReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => { if (authReady) loadSettings(); }, [authReady, loadSettings]);

  const login = async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* clear local state even if the session expired */ }
    setUser(null);
  };

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 3200);
  }, []);

  return (
    <AppCtx.Provider value={{ user, setUser, authReady, login, logout, settings, setSettings, loadSettings, notify }}>
      {children}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 22, right: 22, zIndex: 999,
          background: toast.type === 'error' ? 'var(--danger)' : 'var(--accent)',
          color: '#fff', padding: '11px 18px', borderRadius: 8, fontWeight: 600,
          boxShadow: '0 8px 30px rgba(0,0,0,.25)', fontSize: 13.5, maxWidth: 380,
        }}>
          {toast.message}
        </div>
      )}
    </AppCtx.Provider>
  );
}
