import { useState } from 'react';
import { AlertTriangle, CircleUser, Save, KeyRound } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { Field, Badge } from '../components/ui';

export default function Account() {
  const { user, setUser, notify } = useApp();
  const [form, setForm] = useState({
    fullName: user?.fullName || '', email: user?.email || '', mobile: user?.mobile || '',
    gender: user?.gender || 'Male', address: user?.address || '',
  });
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  const saveProfile = async () => {
    try {
      const { data } = await api.put('/auth/me', form);
      const updated = { ...user, ...data };
      setUser(updated);
      notify('Profile updated');
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const changePassword = async () => {
    if (pwd.newPassword !== pwd.confirm) return notify('New passwords do not match', 'error');
    try {
      await api.post('/auth/change-password', pwd);
      notify('Password changed. Sign in again with the new password.');
      setPwd({ currentPassword: '', newPassword: '', confirm: '' });
      setUser(null);
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  return (
    <>
      <div className="page-head"><h2><CircleUser size={20} /> My Account</h2></div>
      {user?.passwordChangeRequired && (
        <div className="card card-pad" style={{
          marginBottom: 16,
          borderColor: 'rgba(245, 158, 11, .34)',
          background: 'linear-gradient(135deg, rgba(255, 251, 235, .96), rgba(255, 255, 255, .88))',
        }}>
          <div className="card-title" style={{ color: '#92400e' }}>
            <AlertTriangle size={16} /> Password change required
          </div>
          <div className="muted">
            For security, this account must set a new password before opening other pages. Change it once, then sign in again and the sidebar links will work normally.
          </div>
        </div>
      )}
      <div className="grid-2">
        <div className="card card-pad">
          <div className="card-title"><CircleUser size={15} /> Profile</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div className="login-logo" style={{ margin: 0, width: 54, height: 54, fontSize: 20 }}>
              {(user?.fullName || 'U').split(' ').map((w) => w[0]).slice(0, 2).join('')}
            </div>
            <div>
              <b>{user?.fullName}</b> <Badge value={user?.role} color="bg-navy" />
              <div className="small muted">@{user?.username}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Full Name"><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
            <Field label="Email"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Mobile"><input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
            <Field label="Gender"><select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option>Male</option><option>Female</option></select></Field>
            <Field label="Address"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <button className="btn btn-green" onClick={saveProfile}><Save size={15} /> Save Profile</button>
          </div>
        </div>
        <div className="card card-pad">
          <div className="card-title"><KeyRound size={15} /> Change Password</div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Current Password"><input type="password" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} /></Field>
            <Field label="New Password" hint="At least 6 characters"><input type="password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} /></Field>
            <Field label="Confirm New Password"><input type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} /></Field>
            <button className="btn btn-navy" onClick={changePassword}><KeyRound size={15} /> Change Password</button>
          </div>
        </div>
      </div>
    </>
  );
}
