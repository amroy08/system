import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, Archive } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { DataTable, StatusTabs, Field, Modal, Confirm, FilterBar } from './ui';
import { AttachmentField } from './Attachment';

/**
 * Config-driven CRUD page used by simpler modules.
 * cfg = {
 *   endpoint, title, icon, addLabel,
 *   writeRoles: [...],
 *   tabs: [{key,label,color, match(row)}] (optional; 'all' handled automatically)
 *   columns: DataTable columns
 *   fields: [{ name, label, type: 'text'|'number'|'date'|'select'|'textarea'|'checkbox', options, required, full, default }]
 *   viewFields: optional [(row)=>[label, value]] for the eye/view modal
 * }
 */
export default function CrudPage({ cfg, lookups = {} }) {
  const { notify, user } = useApp();
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('all');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [filters, setFilters] = useState({});
  const [confirmDel, setConfirmDel] = useState(null);
  const canWrite = !cfg.readOnly && (!cfg.writeRoles || cfg.writeRoles.includes(user?.role));
  const canCreate = !cfg.readOnly && (cfg.createRoles ? cfg.createRoles.includes(user?.role) : canWrite);

  const load = useCallback(() => api.get(cfg.endpoint).then(({ data }) => setRows(data)).catch((e) => notify(errMsg(e), 'error')), [cfg.endpoint, notify]);
  useEffect(() => { load(); }, [load]);

  const emptyForm = useMemo(() => {
    const f = {};
    for (const fld of cfg.fields) f[fld.name] = fld.default ?? (fld.type === 'checkbox' ? false : '');
    return f;
  }, [cfg]);

  const filtered = useMemo(() => {
    const matchesConfiguredFilters = (row) => (cfg.filters || []).every((filter) => {
      const value = filters[filter.name];
      if (value == null || value === '') return true;
      if (filter.match) return filter.match(row, value, filters);
      const rowValue = row[filter.key || filter.name];
      return String(rowValue ?? '').toLowerCase() === String(value).toLowerCase();
    });

    const tabbed = (() => {
      if (tab === 'all' || !cfg.tabs) return rows;
      const t = cfg.tabs.find((x) => x.key === tab);
      return t?.match ? rows.filter(t.match) : rows.filter((r) => r.status === tab);
    })();

    if (!cfg.filters?.length) return tabbed;
    return tabbed.filter(matchesConfiguredFilters);
  }, [rows, tab, cfg, filters]);

  const filterOptions = (filter) => {
    const options = typeof filter.options === 'function' ? filter.options(lookups, rows) : filter.options;
    return (options || []).map((option) => (typeof option === 'object' ? option : { value: option, label: option }));
  };

  const hasActiveFilters = Object.values(filters).some((value) => value != null && value !== '');

  const setFilter = (name, value) => setFilters((prev) => ({ ...prev, [name]: value }));

  const save = async () => {
    try {
      if (modal.data?._id) await api.put(`${cfg.endpoint}/${modal.data._id}`, form);
      else await api.post(cfg.endpoint, form);
      notify('Saved successfully');
      setModal(null);
      load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const columns = [...cfg.columns];
  if (cfg.viewFields || cfg.rowActions?.length || canWrite) columns.push({
    label: 'Actions', sortable: false, noExport: true, render: (r) => (
      <div className="row-actions">
        {cfg.viewFields && <button className="act-view" title="View" onClick={() => setModal({ type: 'view', data: r })}><Eye size={15} /></button>}
        {cfg.rowActions?.map((a, i) => (
          <button key={i} className={a.className || 'act-navy'} title={a.title}
            onClick={() => a.onClick(r, { reload: load, notify })}>{a.icon}</button>
        ))}
        {canWrite && <button className="act-edit" title="Edit" onClick={() => {
          setForm(cfg.prepareForm ? cfg.prepareForm(r, lookups, emptyForm) : { ...emptyForm, ...r });
          setModal({ type: 'form', data: r });
        }}><Pencil size={15} /></button>}
        {canWrite && r.status !== 'archived' && <button className="act-del" title={cfg.archiveMode ? 'Archive' : 'Delete'} onClick={() => setConfirmDel(r)}>
          {cfg.archiveMode ? <Archive size={15} /> : <Trash2 size={15} />}
        </button>}
      </div>
    ),
  });

  const Icon = cfg.icon;

  return (
    <>
      <div className="page-head">
        <h2>{Icon && <Icon size={20} />} {cfg.title}</h2>
        <div className="spacer" />
        {canCreate && (
          <button className="btn btn-green" onClick={() => { setForm(emptyForm); setModal({ type: 'form' }); }}>
            <Plus size={15} /> {cfg.addLabel || 'Add'}
          </button>
        )}
      </div>

      {cfg.tabs && (
        <StatusTabs active={tab} onChange={setTab} tabs={[
          { key: 'all', label: 'All', count: rows.length, color: 'navy' },
          ...cfg.tabs.map((t) => ({
            ...t,
            count: (t.match ? rows.filter(t.match) : rows.filter((r) => r.status === t.key)).length,
          })),
        ]} />
      )}

      {cfg.filters?.length > 0 && (
        <FilterBar onClear={hasActiveFilters ? () => setFilters({}) : undefined}>
          {cfg.filters.map((filter) => (
            <Field key={filter.name} label={filter.label}>
              {filter.type === 'select' ? (
                <select value={filters[filter.name] ?? ''} onChange={(e) => setFilter(filter.name, e.target.value)}>
                  <option value="">{filter.allLabel || 'All'}</option>
                  {filterOptions(filter).map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={filter.type || 'text'}
                  value={filters[filter.name] ?? ''}
                  onChange={(e) => setFilter(filter.name, e.target.value)}
                  placeholder={filter.placeholder}
                />
              )}
            </Field>
          ))}
        </FilterBar>
      )}

      <DataTable columns={columns} rows={filtered} title={cfg.title} exportName={cfg.title.toLowerCase().replace(/\s+/g, '-')} />

      {modal?.type === 'form' && (
        <Modal title={`${modal.data ? 'Edit' : 'Add'} — ${cfg.title}`} icon={Icon} onClose={() => setModal(null)}
          size={cfg.modalSize || (cfg.fields.length > 8 ? 'lg' : undefined)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" onClick={save}>{modal.data ? 'Update' : 'Save'}</button>
          </>}>
          <div className={`form-grid ${typeof cfg.formClassName === 'function' ? cfg.formClassName(form) : (cfg.formClassName || '')}`}>
            {cfg.fields.map((f) => {
              if (f.section) return <div key={f.section} className="form-section">{f.section}</div>;
              const set = (v) => setForm((prev) => ({ ...prev, [f.name]: v, ...(f.onChange ? f.onChange(v, prev, lookups) : {}) }));
              const options = typeof f.options === 'function' ? f.options(lookups, form) : f.options;
              const hint = typeof f.hint === 'function' ? f.hint(lookups, form) : f.hint;
              return (
                <Field key={f.name} label={f.label} required={f.required} full={f.full} hint={hint}>
                  {f.type === 'attachment' ? (
                    <AttachmentField value={form[f.name]} onChange={set} scope={f.scope} />
                  ) : f.type === 'select' ? (
                    <select value={form[f.name] ?? ''} onChange={(e) => set(e.target.value)}>
                      <option value="">Select…</option>
                      {(options || []).map((o) =>
                        typeof o === 'object'
                          ? <option key={o.value} value={o.value}>{o.label}</option>
                          : <option key={o} value={o}>{o}</option>
                      )}
                    </select>
                  ) : f.type === 'multiselect' ? (
                    <div className="multi-check-grid">
                      {(options || []).map((o) => {
                        const option = typeof o === 'object' ? o : { value: o, label: o };
                        const selected = Array.isArray(form[f.name]) && form[f.name].includes(option.value);
                        return (
                          <label key={option.value} className={selected ? 'selected' : ''}>
                            <input type="checkbox" checked={selected} onChange={(e) => {
                              const current = Array.isArray(form[f.name]) ? form[f.name] : [];
                              set(e.target.checked ? [...current, option.value] : current.filter((value) => value !== option.value));
                            }} />
                            <span>{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : f.type === 'textarea' ? (
                    <textarea rows={3} value={form[f.name] ?? ''} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} />
                  ) : f.type === 'checkbox' ? (
                    <select value={form[f.name] ? 'yes' : 'no'} onChange={(e) => set(e.target.value === 'yes')}>
                      <option value="no">No</option><option value="yes">Yes</option>
                    </select>
                  ) : (
                    <input type={f.type || 'text'} value={form[f.name] ?? ''} onChange={(e) => set(f.type === 'number' ? e.target.valueAsNumber || e.target.value : e.target.value)} placeholder={f.placeholder} />
                  )}
                </Field>
              );
            })}
          </div>
        </Modal>
      )}

      {modal?.type === 'view' && cfg.viewFields && (
        <Modal title={cfg.title} icon={Icon} onClose={() => setModal(null)}>
          <div className="form-grid">
            {cfg.viewFields(modal.data, lookups).map(([k, v]) => (
              <div key={k} className={`field ${String(v).length > 60 ? 'full' : ''}`}>
                <label>{k}</label><div style={{ fontWeight: 600, whiteSpace: 'pre-wrap' }}>{v || '—'}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm message={cfg.archiveMode ? 'Archive this fee component? Existing student fee snapshots and receipts will remain unchanged.' : 'Delete this record? This cannot be undone.'}
          onNo={() => setConfirmDel(null)}
          onYes={async () => {
            try { await api.delete(`${cfg.endpoint}/${confirmDel._id}`); notify(cfg.archiveMode ? 'Archived' : 'Deleted'); load(); }
            catch (e) { notify(errMsg(e), 'error'); }
            setConfirmDel(null);
          }} />
      )}
    </>
  );
}
