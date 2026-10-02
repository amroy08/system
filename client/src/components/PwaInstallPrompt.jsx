import { useEffect, useState } from 'react';
import { DownloadCloud, X } from 'lucide-react';

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // If user previously dismissed, check if dismissed in last 7 days
    const dismissedAt = localStorage.getItem('mvhs_pwa_dismissed');
    if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000) {
      return undefined;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem('mvhs_pwa_dismissed', String(Date.now()));
  };

  if (!visible) return null;

  return (
    <aside
      aria-label="App installation banner"
      className="pwa-install-banner no-print"
      style={{
        position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 9998,
        maxWidth: 420, margin: '0 auto',
        backgroundColor: 'var(--bg-card)',
        backdropFilter: 'blur(10px)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '12px 16px',
        boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'var(--primary)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <DownloadCloud size={20} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--txt)' }}>Install MVHS ERP</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--txt-muted)' }}>Add to home screen for faster one-tap access</div>
      </div>

      <button
        type="button"
        className="btn btn-sm btn-green"
        onClick={handleInstall}
        style={{ padding: '6px 14px', flexShrink: 0 }}
      >
        Install
      </button>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss banner"
        style={{
          background: 'none', border: 'none', color: 'var(--txt-light)',
          cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
        }}
      >
        <X size={16} />
      </button>
    </aside>
  );
}
