import { useEffect, useMemo, useState } from 'react';
import { Boxes, Plus, Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, History } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { DataTable, StatusTabs, Field, Modal, Badge, Confirm } from '../components/ui';

const EMPTY = { name: '', category: 'Stationery', unit: 'pieces', openingStock: 0, reorderLevel: 0 };

export default function Inventory() {
  const { notify, user } = useApp();
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('all');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [move, setMove] = useState({ type: 'in', quantity: 1, note: '', issuedTo: '' });
  const [movements, setMovements] = useState([]);
  const [confirmDel, setConfirmDel] = useState(null);
  const canWrite = ['admin', 'clerk', 'supervisor'].includes(user?.role);

  const load = () => api.get('/inventory').then(({ data }) => setRows(data));
  useEffect(() => { load(); }, []);

  const isLow = (r) => (r.quantity || 0) <= (r.reorderLevel || 0);
  const counts = useMemo(() => ({ all: rows.length, low: rows.filter(isLow).length }), [rows]);
  const filtered = tab === 'all' ? rows : rows.filter(isLow);

  const save = async () => {
    try {
      if (modal.data?._id) await api.put(`/inventory/${modal.data._id}`, form);
      else await api.post('/inventory', form);
      notify('Item saved');
      setModal(null); load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const doMove = async () => {
    try {
      await api.post(`/inventory/${modal.data._id}/move`, move);
      notify(move.type === 'in' ? 'Stock added' : move.type === 'issue' ? 'Stock issued' : 'Stock adjusted');
      setModal(null); load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const openHistory = async (r) => {
    const { data } = await api.get(`/inventory/${r._id}/movements`);
    setMovements(data);
    setModal({ type: 'history', data: r });
  };

  const openMove = (r, type) => {
    setMove({ type, quantity: 1, note: '', issuedTo: '' });
    setModal({ type: 'move', data: r });
  };

  const columns = [
    { key: 'name', label: 'Item', render: (r) => <b>{r.name}</b> },
    { key: 'category', label: 'Category', render: (r) => <Badge value={r.category} color="bg-blue" /> },
    { key: 'quantity', label: 'In Stock', render: (r) => (
      <b className={isLow(r) ? 'txt-red' : ''}>{r.quantity} {r.unit}{isLow(r) ? ' ⚠' : ''}</b>
    )},
    { key: 'reorderLevel', label: 'Reorder Level', render: (r) => `${r.reorderLevel} ${r.unit}` },
    { label: 'Stock Health', sortable: false, render: (r) => <Badge value={isLow(r) ? 'Reorder now' : 'OK'} color={isLow(r) ? 'bg-red' : 'bg-green'} /> },
    { label: 'Actions', sortable: false, noExport: true, render: (r) => (
      <div className="row-actions">
        {canWrite && (<>
          <button className="act-green" title="Stock In" onClick={() => openMove(r, 'in')}><ArrowDownToLine size={15} /></button>
          <button className="act-orange" title="Issue" onClick={() => openMove(r, 'issue')}><ArrowUpFromLine size={15} /></button>
          <button className="act-purple" title="Adjust" onClick={() => openMove(r, 'adjust')}><SlidersHorizontal size={15} /></button>
        </>)}
        <button className="act-view" title="Movement history" onClick={() => openHistory(r)}><History size={15} /></button>
        {canWrite && <button className="act-edit" title="Edit" onClick={() => { setForm({ ...EMPTY, ...r }); setModal({ type: 'form', data: r }); }}><Pencil size={15} /></button>}
        {user?.role === 'admin' && <button className="act-del" title="Delete" onClick={() => setConfirmDel(r)}><Trash2 size={15} /></button>}
      </div>
    )},
  ];

  return (
    <>
      <div className="page-head">
        <h2><Boxes size={20} /> Stock / Inventory</h2>
        <div className="spacer" />
        {canWrite && <button className="btn btn-green" onClick={() => { setForm(EMPTY); setModal({ type: 'form' }); }}><Plus size={15} /> Add Item</button>}
      </div>

      <StatusTabs active={tab} onChange={setTab} tabs={[
        { key: 'all', label: 'All Items', count: counts.all, color: 'navy' },
        { key: 'low', label: 'Low Stock', count: counts.low, color: 'red' },
      ]} />

      <DataTable columns={columns} rows={filtered} title="Inventory Report" exportName="inventory" />

      {modal?.type === 'form' && (
        <Modal title={modal.data ? 'Edit Item' : 'Add Item'} icon={Boxes} onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" onClick={save}>{modal.data ? 'Update' : 'Add Item'}</button>
          </>}>
          <div className="form-grid">
            <Field label="Item Name" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Category">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {['Stationery', 'Office', 'Housekeeping', 'Sports', 'Lab', 'Other'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Unit Type">
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {['pieces', 'pack', 'box', 'kg', 'litre', 'ream', 'set'].map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
            {!modal.data && <Field label="Opening Stock"><input type="number" value={form.openingStock} onChange={(e) => setForm({ ...form, openingStock: +e.target.value })} /></Field>}
            <Field label="Reorder Level" hint="Alert when stock falls to this level"><input type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: +e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {modal?.type === 'move' && (
        <Modal title={`${move.type === 'in' ? 'Stock In' : move.type === 'issue' ? 'Issue Stock' : 'Adjust Stock'} — ${modal.data.name}`}
          icon={Boxes} size="sm" onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" onClick={doMove}>Confirm</button>
          </>}>
          <p className="small muted mb">Current stock: <b>{modal.data.quantity} {modal.data.unit}</b></p>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label={move.type === 'adjust' ? 'Set quantity to' : 'Quantity'}>
              <input type="number" value={move.quantity} onChange={(e) => setMove({ ...move, quantity: e.target.value })} />
            </Field>
            {move.type === 'issue' && (
              <Field label="Issued To"><input value={move.issuedTo} placeholder="e.g. Exam Cell" onChange={(e) => setMove({ ...move, issuedTo: e.target.value })} /></Field>
            )}
            <Field label="Note"><input value={move.note} onChange={(e) => setMove({ ...move, note: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {modal?.type === 'history' && (
        <Modal title={`Movements — ${modal.data.name}`} icon={History} onClose={() => setModal(null)}>
          <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Balance</th><th>Note</th><th>By</th></tr></thead>
            <tbody>
              {movements.length === 0 && <tr className="empty-row"><td colSpan={6}>No movements yet</td></tr>}
              {movements.map((m) => (
                <tr key={m._id}>
                  <td>{m.date}</td>
                  <td><Badge value={m.type} color={{ in: 'bg-green', issue: 'bg-yellow', adjust: 'bg-purple' }[m.type]} /></td>
                  <td>{m.quantity}</td><td><b>{m.balanceAfter}</b></td>
                  <td>{m.note}{m.issuedTo ? ` → ${m.issuedTo}` : ''}</td><td>{m.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm message={`Delete item "${confirmDel.name}"?`}
          onNo={() => setConfirmDel(null)}
          onYes={async () => {
            try { await api.delete(`/inventory/${confirmDel._id}`); notify('Item deleted'); load(); }
            catch (e) { notify(errMsg(e), 'error'); }
            setConfirmDel(null);
          }} />
      )}
    </>
  );
}
