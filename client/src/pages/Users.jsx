import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users as UsersIcon, Plus, KeyRound, Ban, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { DataTable, StatusTabs, FilterBar, Field, Modal, Badge, Confirm } from '../components/ui';

const EMPTY = {
  username: '', fullName: '', email: '', mobile: '', password: '', role: '', gender: 'Male',
  dob: '', qualification: '', specialization: '', address: '', status: 'active',
};

const ROLE_COLORS = { admin: 'bg-navy', clerk: 'bg-blue', supervisor: 'bg-purple', teacher: 'bg-teal', student: 'bg-green', parent: 'bg-pink' };
const STAFF_ROLES = ['admin', 'clerk', 'supervisor', 'teacher'];

export default function Users() {
  const { notify, user } = useApp();
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('all');
  const [filters, setFilters] = useState({ search: '', role: '', gender: '' });
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmDel, setConfirmDel] = useState(null);
  const [params] = useSearchParams();
  const isAdmin = user?.role === 'admin';

  const load = () => api.get('/users').then(({ data }) => setRows(data));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const add = params.get('add');
    if (add) { setForm({ ...EMPTY, role: add === '1' ? '' : add }); setModal({ type: 'form' }); }
  }, [params]);

  const counts = useMemo(() => ({
    all: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    inactive: rows.filter((r) => r.status === 'inactive').length,
    suspended: rows.filter((r) => r.status === 'suspended').length,
  }), [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (tab !== 'all' && r.status !== tab) return false;
    if (filters.role && r.role !== filters.role) return false;
    if (filters.gender && r.gender !== filters.gender) return false;
    if (filters.search) {
      const t = filters.search.toLowerCase();
      if (!`${r.username} ${r.fullName} ${r.email} ${r.mobile}`.toLowerCase().includes(t)) return false;
    }
    return true;
  }), [rows, tab, filters]);

  const editableRoleOptions = modal?.data && !STAFF_ROLES.includes(modal.data.role)
    ? [modal.data.role]
    : STAFF_ROLES;

  const save = async () => {
    try {
      if (modal.data?._id) await api.put(`/users/${modal.data._id}`, form);
      else await api.post('/users', form);
      notify('User saved');
      setModal(null); load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const resetPassword = async (r) => {
    const newPassword = prompt(`Enter a 6–128 character password with uppercase, lowercase, number and symbol for ${r.username}:`);
    if (!newPassword) return;
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/.test(newPassword)) {
      return notify('Use 6–128 characters with uppercase, lowercase, number and symbol', 'error');
    }
    try {
      await api.post(`/users/${r._id}/reset-password`, { newPassword });
      notify(`Password reset for ${r.username}`);
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const setStatus = async (r, status) => {
    try {
      await api.post(`/users/${r._id}/status`, { status });
      notify(`User ${status === 'active' ? 'activated' : 'suspended'}`);
      load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const columns = [
    { key: 'fullName', label: 'User', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="badge bg-navy">{(r.fullName || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
        <div><b>{r.fullName}</b><div className="small muted">@{r.username}</div></div>
      </div>
    )},
    { key: 'email', label: 'Email' },
    { key: 'mobile', label: 'Mobile' },
    { key: 'role', label: 'Role', render: (r) => <Badge value={r.role} color={ROLE_COLORS[r.role]} /> },
    { key: 'gender', label: 'Gender' },
    { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
    { key: 'joined', label: 'Joined' },
    { key: 'lastLogin', label: 'Last Login', render: (r) => r.lastLogin ? new Date(r.lastLogin).toLocaleString() : 'N/A' },
    { label: 'Actions', sortable: false, noExport: true, render: (r) => isAdmin && (
      <div className="row-actions">
        <button className="act-orange" title="Reset password" onClick={() => resetPassword(r)}><KeyRound size={15} /></button>
        {r.status !== 'suspended'
          ? <button className="act-del" title="Suspend" onClick={() => setStatus(r, 'suspended')}><Ban size={15} /></button>
          : <button className="act-green" title="Activate" onClick={() => setStatus(r, 'active')}><CheckCircle2 size={15} /></button>}
        <button className="act-edit" title="Edit" onClick={() => { setForm({ ...EMPTY, ...r, password: '' }); setModal({ type: 'form', data: r }); }}><Pencil size={15} /></button>
        <button className="act-del" title="Delete" onClick={() => setConfirmDel(r)}><Trash2 size={15} /></button>
      </div>
    )},
  ];

  return (
    <>
      <div className="page-head">
        <h2><UsersIcon size={20} /> Users Management</h2>
        <div className="spacer" />
        {isAdmin && <button className="btn btn-green" onClick={() => { setForm(EMPTY); setModal({ type: 'form' }); }}><Plus size={15} /> Add</button>}
      </div>

      <StatusTabs active={tab} onChange={setTab} tabs={[
        { key: 'all', label: 'All', count: counts.all, color: 'navy' },
        { key: 'active', label: 'Active', count: counts.active, color: 'green' },
        { key: 'inactive', label: 'Inactive', count: counts.inactive, color: 'gray' },
        { key: 'suspended', label: 'Suspended', count: counts.suspended, color: 'red' },
      ]} />

      <FilterBar onClear={() => setFilters({ search: '', role: '', gender: '' })}>
        <Field label="Search"><input placeholder="Search users..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></Field>
        <Field label="Role">
          <select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
            <option value="">All Roles</option>
            {[...STAFF_ROLES, 'student', 'parent'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Gender">
          <select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}>
            <option value="">All Genders</option><option>Male</option><option>Female</option>
          </select>
        </Field>
      </FilterBar>

      <DataTable columns={columns} rows={filtered} title="Users Report" exportName="users" />

      {modal?.type === 'form' && (
        <Modal title={modal.data ? 'Edit User' : 'Add User'} icon={UsersIcon} size="lg" onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" onClick={save}>{modal.data ? 'Update User' : 'Add User'}</button>
          </>}>
          <div className="form-grid">
            <div className="form-section">Account</div>
            <Field label="Username" required><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
            <Field label="Full Name" required><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
            <Field label="Email" required><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Mobile" required><input value={form.mobile} placeholder="+91 300 0000000" onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
            <Field label={modal.data ? 'New Password (leave blank to keep)' : 'Password'} required={!modal.data}>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Role" required>
              <select value={form.role} disabled={modal.data && !STAFF_ROLES.includes(modal.data.role)} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="">Select role…</option>
                {editableRoleOptions.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Gender" required><select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option>Male</option><option>Female</option></select></Field>
            <Field label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>active</option><option>inactive</option><option>suspended</option></select></Field>
            <div className="form-section">Personal & Professional</div>
            <Field label="Date of Birth"><input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></Field>
            <Field label="Qualification"><input value={form.qualification} placeholder="e.g. M.Sc Mathematics" onChange={(e) => setForm({ ...form, qualification: e.target.value })} /></Field>
            <Field label="Specialization"><input value={form.specialization} placeholder="e.g. Mathematics" onChange={(e) => setForm({ ...form, specialization: e.target.value })} /></Field>
            <Field label="Address"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm message={`Delete user "${confirmDel.username}"?`}
          onNo={() => setConfirmDel(null)}
          onYes={async () => {
            try { await api.delete(`/users/${confirmDel._id}`); notify('User deleted'); load(); }
            catch (e) { notify(errMsg(e), 'error'); }
            setConfirmDel(null);
          }} />
      )}
    </>
  );
}
