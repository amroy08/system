import { useCallback, useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, Building2, MailCheck, RefreshCw, Send } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { Field } from '../components/ui';

export default function Settings() {
  const { notify, loadSettings } = useApp();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [emailHealth, setEmailHealth] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [testEmail, setTestEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  const loadEmailDiagnostics = useCallback(async () => {
    try {
      const [{ data: health }, { data: recent }] = await Promise.all([api.get('/email/health'), api.get('/email/deliveries')]);
      setEmailHealth(health);
      setDeliveries(recent);
    } catch (e) { notify(errMsg(e), 'error'); }
  }, [notify]);

  useEffect(() => {
    api.get('/settings').then(({ data }) => setForm({
      schoolName: '', tagline: '', address: '', phone: '', email: '', website: '',
      timezone: 'Asia/Kolkata', currency: '₹', academicYear: '2026-2027', logoUrl: '',
      ...data,
    }));
    loadEmailDiagnostics();
  }, [loadEmailDiagnostics]);

  if (!form) return <div className="card card-pad">Loading settings…</div>;

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/settings', form);
      await loadSettings();
      notify('Settings saved successfully');
    } catch (e) { notify(errMsg(e), 'error'); }
    setBusy(false);
  };

  const sendTest = async () => {
    if (!testEmail.trim()) return notify('Enter a test email address', 'error');
    setEmailBusy(true);
    try {
      await api.post('/email/test', { email: testEmail.trim() });
      notify('Test email queued');
      await loadEmailDiagnostics();
    } catch (e) { notify(errMsg(e), 'error'); }
    setEmailBusy(false);
  };

  const retryDelivery = async (deliveryId) => {
    try {
      await api.post(`/email/deliveries/${deliveryId}/retry`);
      notify('Email delivery retry started');
      await loadEmailDiagnostics();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  return (
    <>
      <div className="page-head">
        <h2><SettingsIcon size={20} /> Settings</h2>
        <div className="spacer" />
        <button className="btn btn-green" disabled={busy} onClick={save}><Save size={15} /> Save Settings</button>
      </div>

      <div style={{ maxWidth: '760px', margin: '0 auto 24px' }}>
        <div className="card card-pad">
          <div className="card-title"><Building2 size={15} /> School Information</div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="School Name" required><input value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} /></Field>
            <Field label="Tagline"><input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} /></Field>
            <Field label="Address"><textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <div className="form-grid">
              <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="Email"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Website"><input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></Field>
              <Field label="Logo URL"><input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} /></Field>
              <Field label="Time Zone">
                <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                  {['Asia/Kolkata', 'Asia/Karachi', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Currency Symbol"><input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></Field>
              <Field label="Academic Year"><input value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} /></Field>
            </div>
          </div>
        </div>

        <div className="card card-pad email-diagnostics">
          <div className="card-title">
            <MailCheck size={15} /> Email Delivery
            <button className="btn btn-xs btn-gray" onClick={loadEmailDiagnostics}><RefreshCw size={13} /> Refresh</button>
          </div>
          <div className="email-health-grid">
            <div><span>Transport</span><b>{emailHealth?.mode === 'smtp' ? 'SMTP' : 'Simulation'}</b></div>
            <div><span>Configuration</span><b className={emailHealth?.configured ? 'txt-green' : 'txt-orange'}>{emailHealth?.configured ? 'Configured' : 'Incomplete'}</b></div>
            <div><span>Connection</span><b className={emailHealth?.reachable ? 'txt-green' : 'txt-orange'}>{emailHealth?.reachable ? 'Reachable' : 'Not verified'}</b></div>
            <div><span>Pending</span><b>{(emailHealth?.counts?.pending || 0) + (emailHealth?.counts?.retry || 0)}</b></div>
          </div>
          <div className="email-test-row">
            <Field label="Send Test Email" hint="Only real, non-dummy email addresses are accepted.">
              <input type="email" value={testEmail} placeholder="parent@example.com" onChange={(event) => setTestEmail(event.target.value)} />
            </Field>
            <button className="btn btn-blue" disabled={emailBusy} onClick={sendTest}><Send size={14} /> {emailBusy ? 'Sending…' : 'Send Test'}</button>
          </div>
          <div className="small muted">From: {emailHealth?.from || '—'} · Portal: {emailHealth?.appUrl || '—'}</div>
          <div className="email-delivery-list">
            <b>Recent deliveries</b>
            {deliveries.slice(0, 8).map((delivery) => (
              <div key={delivery._id} title={delivery.failureReason || ''}>
                <span>{delivery.eventType}</span><span>{delivery.recipient}</span>
                <strong className={`email-state ${delivery.status}`}>{delivery.status}</strong>
                {['failed', 'retry'].includes(delivery.status) && <button className="btn btn-xs btn-gray" onClick={() => retryDelivery(delivery._id)}>Retry</button>}
              </div>
            ))}
            {!deliveries.length && <div className="muted">No email deliveries recorded yet.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
