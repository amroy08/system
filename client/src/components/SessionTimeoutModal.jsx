import { useEffect, useRef, useState, useCallback } from 'react';
import { Clock } from 'lucide-react';
import { useApp } from '../context/AppContextValue';

// 30 minutes total timeout, with a 2-minute countdown warning
const IDLE_TIMEOUT_MS = 28 * 60 * 1000; // 28 minutes
const WARNING_COUNTDOWN_SECONDS = 120;   // 2 minutes

export default function SessionTimeoutModal() {
  const { user, logout, notify } = useApp();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARNING_COUNTDOWN_SECONDS);

  const idleTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const handleLogout = useCallback(() => {
    setShowWarning(false);
    clearInterval(countdownIntervalRef.current);
    clearTimeout(idleTimerRef.current);
    logout();
    notify('You have been logged out due to inactivity for security.', 'error');
  }, [logout, notify]);

  const resetTimer = useCallback(() => {
    if (!user) return;
    setShowWarning(false);
    clearInterval(countdownIntervalRef.current);
    clearTimeout(idleTimerRef.current);

    idleTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setSecondsLeft(WARNING_COUNTDOWN_SECONDS);
      countdownIntervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current);
            handleLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, IDLE_TIMEOUT_MS);
  }, [user, handleLogout]);

  useEffect(() => {
    if (!user) return undefined;

    const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    const handleActivity = () => {
      // If warning modal is already visible, do not dismiss on random mousemove;
      // require explicit "Stay Logged In" click
      if (!showWarning) {
        resetTimer();
      }
    };

    resetTimer();
    events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));

    return () => {
      clearTimeout(idleTimerRef.current);
      clearInterval(countdownIntervalRef.current);
      events.forEach((evt) => window.removeEventListener(evt, handleActivity));
    };
  }, [user, resetTimer, showWarning]);

  if (!showWarning || !user) return null;

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      <div className="card" style={{
        maxWidth: 440, width: '100%', padding: '24px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        borderRadius: '16px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        textAlign: 'center',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px auto',
        }}>
          <Clock size={28} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px', color: 'var(--txt)' }}>
          Session Expiring Soon
        </h3>
        <p style={{ color: 'var(--txt-muted)', fontSize: '0.92rem', marginBottom: '20px', lineHeight: 1.5 }}>
          You have been inactive. For data security, your session will automatically close in:
        </p>
        <div style={{
          fontSize: '2rem', fontWeight: 800, fontFamily: 'monospace',
          color: secondsLeft <= 30 ? 'var(--danger)' : 'var(--primary)',
          marginBottom: '24px',
        }}>
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
        </div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-gray"
            onClick={handleLogout}
            style={{ flex: 1 }}
          >
            Log Out Now
          </button>
          <button
            type="button"
            className="btn btn-green"
            onClick={resetTimer}
            style={{ flex: 1 }}
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
}
