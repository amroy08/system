import { useEffect, useState } from 'react';
import { DownloadCloud, X, Share, PlusSquare } from 'lucide-react';

let globalDeferredPrompt = null;
const listeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    globalDeferredPrompt = e;
    listeners.forEach((fn) => fn(e));
  });
}

export function usePwa() {
  const [prompt, setPrompt] = useState(globalDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua) && !isStandalone;
    setIsIos(isIosDevice);

    const listener = (p) => setPrompt(p);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  const triggerInstall = async () => {
    if (globalDeferredPrompt) {
      globalDeferredPrompt.prompt();
      const { outcome } = await globalDeferredPrompt.userChoice;
      if (outcome === 'accepted') {
        globalDeferredPrompt = null;
        setPrompt(null);
      }
      return outcome;
    }
    return null;
  };

  return { prompt, isInstalled, isIos, triggerInstall };
}

export default function PwaInstallPrompt() {
  const { prompt, isInstalled, isIos, triggerInstall } = usePwa();
  const [visible, setVisible] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    if (isInstalled) return;

    const dismissedAt = localStorage.getItem('mvhs_pwa_dismissed');
    if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000) {
      return;
    }

    if (prompt || isIos) {
      setVisible(true);
    }
  }, [prompt, isInstalled, isIos]);

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosGuide(true);
      return;
    }
    await triggerInstall();
    setVisible(false);
  };

  const handleDismiss = () => {
    setVisible(false);
    setShowIosGuide(false);
    localStorage.setItem('mvhs_pwa_dismissed', String(Date.now()));
  };

  if (!visible || isInstalled) return null;

  return (
    <>
      <aside
        aria-label="App installation banner"
        className="pwa-install-banner no-print"
        style={{
          position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 99999,
          maxWidth: 420, margin: '0 auto',
          backgroundColor: 'var(--bg-card)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '12px 16px',
          boxShadow: '0 12px 35px rgba(0,0,0,0.22)',
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
          <div style={{ fontSize: '0.8rem', color: 'var(--txt-muted)' }}>
            {isIos ? 'Add to iPhone Home Screen' : 'Add to home screen for faster one-tap access'}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-sm btn-green"
          onClick={handleInstallClick}
          style={{ padding: '6px 14px', flexShrink: 0 }}
        >
          {isIos ? 'How to Add' : 'Install'}
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

      {showIosGuide && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed', inset: 0, zIndex: 100000,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowIosGuide(false)}
        >
          <div
            className="card card-pad"
            style={{ maxWidth: 400, width: '100%', borderRadius: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Install on iPhone / iPad</h3>
              <button onClick={() => setShowIosGuide(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <ol style={{ paddingLeft: 20, fontSize: '0.9rem', color: 'var(--txt-muted)', lineHeight: 1.8 }}>
              <li>
                Tap the <b>Share button</b> <Share size={15} style={{ verticalAlign: 'middle', margin: '0 2px' }} /> in Safari's bottom toolbar.
              </li>
              <li>
                Scroll down and tap <b>Add to Home Screen</b> <PlusSquare size={15} style={{ verticalAlign: 'middle', margin: '0 2px' }} />.
              </li>
              <li>
                Tap <b>Add</b> at the top right.
              </li>
            </ol>
            <button className="btn btn-blue" style={{ width: '100%', marginTop: 14 }} onClick={() => setShowIosGuide(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
