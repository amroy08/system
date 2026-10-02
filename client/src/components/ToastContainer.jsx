import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const TOAST_ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_COLORS = {
  success: { bg: '#15803d', border: '#22c55e', text: '#ffffff' },
  error: { bg: '#b91c1c', border: '#ef4444', text: '#ffffff' },
  warning: { bg: '#b45309', border: '#f59e0b', text: '#ffffff' },
  info: { bg: '#1d4ed8', border: '#3b82f6', text: '#ffffff' },
};

export default function ToastContainer({ toast, onDismiss }) {
  if (!toast) return null;

  const type = toast.type || 'success';
  const Icon = TOAST_ICONS[type] || CheckCircle2;
  const colors = TOAST_COLORS[type] || TOAST_COLORS.success;

  return (
    <div
      role="status"
      aria-live="polite"
      className="toast-notification no-print"
      style={{
        position: 'fixed',
        top: 24,
        right: 24,
        zIndex: 99999,
        backgroundColor: colors.bg,
        color: colors.text,
        borderLeft: `4px solid ${colors.border}`,
        borderRadius: '10px',
        padding: '12px 18px',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.28)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        maxWidth: '420px',
        fontSize: '0.9rem',
        fontWeight: 500,
        animation: 'toastSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <Icon size={20} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.75)',
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
            alignItems: 'center',
            marginLeft: 4,
          }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
