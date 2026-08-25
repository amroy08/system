import { useEffect, useMemo, useState } from 'react';
import { Package, Plus, Pencil, Trash2, Wrench, Eye } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { DataTable, StatusTabs, Field, Modal, Badge, Confirm } from '../components/ui';

const EMPTY = { name: '', category: 'Electronics', location: '', purchaseDate: '', cost: 0, status: 'in-use' };

export default function Assets() {
  const { notify, settings, user } = useApp();
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('all');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [maint, setMaint] = useState({ date: new Date().toISOString().slice(0, 10), description: '', cost: 0 });
  const [confirmDel, setConfirmDel] = useState(null);
  const cur = settings.currency || '₹';
  const canWrite = ['admin', 'clerk', 'supervisor'].includes(user?.role);

  const load = () => api.get('/assets').then(({ data }) => setRows(data));
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    all: rows.length,
    'in-use': rows.filter((r) => r.status === 'in-use').length,
    maintenance: rows.filter((r) => r.status === 'maintenance').length,
    retired: rows.filter((r) => r.status === 'retired').length,
  }), [rows]);

  const filtered = tab === 'all' ? rows : rows.filter((r) => r.status === tab);

  const save = async () => {
    try {
      if (modal.data?._id) await api.put(`/assets/${modal.data._id}`, form);
      else await api.post('/assets', form);
      notify('Asset saved — tag auto-generated');
      setModal(null); load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const addMaintenance = async () => {
    try {
      await api.post(`/assets/${modal.data._id}/maintenance`, maint);
      notify('Maintenance logged (expense recorded in Daily Accounts)');
      setModal(null); load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const maintTotal = (r) => (r.maintenance || []).reduce((s, m) => s + (m.cost || 0), 0);

  const columns = [
    { key: 'tag', label: 'Asset Tag', render: (r) => <span className="mono">{r.tag}</span> },
    { key: 'name', label: 'Asset', render: (r) => <b>{r.name}</b> },
    { key: 'category', label: 'Category', render: (r) => <Badge value={r.category} color="bg-blue" /> },
    { key: 'location', label: 'Location' },
    { key: 'purchaseDate', label: 'Purchased' },
    { key: 'cost', label: 'Cost', value: (r) => r.cost, render: (r) => `${cur}${(r.cost || 0).toLocaleString()}` },
    { label: 'Maintenance', value: (r) => maintTotal(r), render: (r) => (
      <span className="link-like" onClick={() => setModal({ type: 'history', data: r })}>
        {(r.maintenance || []).length} logs · {cur}{maintTotal(r).toLocaleString()}
      </span>
    )},
    { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
    { label: 'Actions', sortable: false, noExport: true, render: (r) => (
      <div className="row-actions">
        <button className="act-view" title="Maintenance history" onClick={() => setModal({ type: 'history', data: r })}><Eye size={15} /></button>
        {canWrite && <button className="act-orange" title="Log maintenance" onClick={() => { setMaint({ date: new Date().toISOString().slice(0, 10), description: '', cost: 0 }); setModal({ type: 'maint', data: r }); }}><Wrench size={15} /></button>}
        {canWrite && <button className="act-edit" title="Edit" onClick={() => { setForm({ ...EMPTY, ...r }); setModal({ type: 'form', data: r }); }}><Pencil size={15} /></button>}
        {user?.role === 'admin' && <button className="act-del" title="Delete" onClick={() => setConfirmDel(r)}><Trash2 size={15} /></button>}
      </div>
    )},
  ];

  return (
    <>
      <div className="page-head">
        <h2><Package size={20} /> Assets Management</h2>
        <div className="spacer" />
        {canWrite && <button className="btn btn-green" onClick={() => { setForm(EMPTY); setModal({ type: 'form' }); }}><Plus size={15} /> Add Asset</button>}
      </div>

      <StatusTabs active={tab} onChange={setTab} tabs={[
        { key: 'all', label: 'All', count: counts.all, color: 'navy' },
        { key: 'in-use', label: 'In Use', count: counts['in-use'], color: 'green' },
        { key: 'maintenance', label: 'Maintenance', count: counts.maintenance, color: 'orange' },
        { key: 'retired', label: 'Retired', count: counts.retired, color: 'gray' },
      ]} />

      <DataTable columns={columns} rows={filtered} title="Assets Report" exportName="assets" />

      {modal?.type === 'form' && (
        <Modal title={modal.data ? 'Edit Asset' : 'Add Asset'} icon={Package} onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" onClick={save}>{modal.data ? 'Update' : 'Add Asset'}</button>
          </>}>
          <div className="form-grid">
            <Field label="Asset Name" required full hint={!modal.data ? 'Asset tag (AST-xxxxx) will be auto-generated' : `Tag: ${modal.data.tag}`}>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Category">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {['Electronics', 'Lab Equipment', 'Furniture', 'Vehicle', 'Appliances', 'Sports', 'Other'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Location"><input value={form.location} placeholder="e.g. Room 101" onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
            <Field label="Purchase Date"><input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></Field>
            <Field label="Cost"><input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: +e.target.value })} /></Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {['in-use', 'maintenance', 'retired'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
        </Modal>
      )}

      {modal?.type === 'maint' && (
        <Modal title={`Log Maintenance — ${modal.data.name}`} icon={Wrench} size="sm" onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" onClick={addMaintenance}>Log Maintenance</button>
          </>}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Date"><input type="date" value={maint.date} onChange={(e) => setMaint({ ...maint, date: e.target.value })} /></Field>
            <Field label="Description" required><input value={maint.description} placeholder="e.g. Lamp replacement" onChange={(e) => setMaint({ ...maint, description: e.target.value })} /></Field>
            <Field label="Cost" hint="Recorded as an expense in Daily Accounts"><input type="number" value={maint.cost} onChange={(e) => setMaint({ ...maint, cost: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {modal?.type === 'history' && (
        <Modal title={`Maintenance History — ${modal.data.name} (${modal.data.tag})`} icon={Eye} onClose={() => setModal(null)}>
          <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Description</th><th>Cost</th><th>By</th></tr></thead>
            <tbody>
              {(modal.data.maintenance || []).length === 0 && <tr className="empty-row"><td colSpan={4}>No maintenance history</td></tr>}
              {(modal.data.maintenance || []).map((m, i) => (
                <tr key={i}><td>{m.date}</td><td>{m.description}</td><td>{cur}{(m.cost || 0).toLocaleString()}</td><td>{m.by}</td></tr>
              ))}
            </tbody>
          </table>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm message={`Delete asset "${confirmDel.name}" (${confirmDel.tag})?`}
          onNo={() => setConfirmDel(null)}
          onYes={async () => {
            try { await api.delete(`/assets/${confirmDel._id}`); notify('Asset deleted'); load(); }
            catch (e) { notify(errMsg(e), 'error'); }
            setConfirmDel(null);
          }} />
      )}
    </>
  );
}
