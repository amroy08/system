import { useEffect, useMemo, useRef, useState } from 'react';
import { X, FileText, Printer, FileSpreadsheet, Search, Filter as FilterIcon, XCircle, KeyRound, Copy } from 'lucide-react';

export function KpiCard({ color = 'navy', icon: Icon, value, label, onAction, actionLabel, onClick }) {
  return (
    <div className={`kpi-card kpi-${color}`} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="kpi-top-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        {Icon && <div className="kpi-icon"><Icon size={20} /></div>}
        {onAction && (
          <button className="kpi-action" onClick={(e) => { e.stopPropagation(); onAction(); }}>
            {actionLabel || '+ Add'}
          </button>
        )}
      </div>
      <div className="kpi-body" style={{ marginTop: '12px', width: '100%' }}>
        <div className="kpi-value">{value}</div>
        <div className="kpi-label">{label}</div>
      </div>
    </div>
  );
}

/* ---------------- Chevron status tabs ---------------- */
export function StatusTabs({ tabs, active, onChange }) {
  return (
    <div className="status-tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={`status-tab st-${t.color} ${active === t.key ? 'selected' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label} {t.count != null && `(${t.count})`}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Badge ---------------- */
const badgeColors = {
  active: 'bg-green', inactive: 'bg-gray', suspended: 'bg-red', transferred: 'bg-purple',
  'passed-out': 'bg-pink', registered: 'bg-blue', admitted: 'bg-green', rejected: 'bg-red',
  paid: 'bg-green', partial: 'bg-yellow', unpaid: 'bg-red', refunded: 'bg-gray',
  open: 'bg-red', 'in-progress': 'bg-yellow', resolved: 'bg-green', closed: 'bg-gray',
  draft: 'bg-gray', submitted: 'bg-blue', locked: 'bg-purple', published: 'bg-green',
  scheduled: 'bg-blue', ongoing: 'bg-yellow', completed: 'bg-green', low: 'bg-blue',
  medium: 'bg-yellow', high: 'bg-red', critical: 'bg-red', 'in-use': 'bg-green',
  maintenance: 'bg-yellow', retired: 'bg-gray', income: 'bg-green', expense: 'bg-red',
  present: 'bg-green', absent: 'bg-red', late: 'bg-yellow', halfday: 'bg-blue', leave: 'bg-purple',
  merit: 'bg-green', demerit: 'bg-red', holiday: 'bg-red', event: 'bg-blue', exam: 'bg-purple',
  allocated: 'bg-green', planned: 'bg-blue',
};
export function Badge({ value, color }) {
  if (value == null || value === '') return <span className="muted">—</span>;
  const cls = color || badgeColors[String(value).toLowerCase()] || 'bg-gray';
  return <span className={`badge ${cls}`}>{String(value).replace(/-/g, ' ').toUpperCase()}</span>;
}

/* ---------------- Modal ---------------- */
export function Modal({ title, icon: Icon, onClose, children, footer, size }) {
  const modalRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab' || !modalRef.current) return;
      const controls = [...modalRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    modalRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`modal ${size === 'lg' ? 'modal-lg' : size === 'sm' ? 'modal-sm' : ''}`}>
        <div className="modal-head">
          {Icon && <Icon size={17} />} {title}
          <button className="x" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- Field ---------------- */
export function Field({ label, required, children, full, hint }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label>{label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}</label>
      {children}
      {hint && <span className="small muted">{hint}</span>}
    </div>
  );
}

/* ---------------- Filter bar ---------------- */
export function FilterBar({ children, onClear }) {
  return (
    <div className="filter-card">
      <div className="filter-head">
        <FilterIcon size={15} /> Filters
        {onClear && (
          <button className="clear-btn" onClick={onClear}><XCircle size={13} /> Clear</button>
        )}
      </div>
      <div className="filter-grid">{children}</div>
    </div>
  );
}

/* ---------------- CSV / print helpers ---------------- */
function exportCSV(columns, rows, filename) {
  const cols = columns.filter((c) => !c.noExport);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.map((c) => esc(c.label)).join(',')];
  for (const r of rows) {
    lines.push(cols.map((c) => esc(c.exportValue ? c.exportValue(r) : plainValue(c, r))).join(','));
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.csv`;
  a.click();
}

function plainValue(col, row) {
  const v = typeof col.value === 'function' ? col.value(row) : row[col.key];
  return v == null ? '' : v;
}

function printTable(columns, rows, title) {
  const cols = columns.filter((c) => !c.noExport);
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>${title}</title><style>
    body{font-family:Segoe UI,sans-serif;padding:24px;color:#1e293b}
    h2{margin-bottom:14px} table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#0f2248;color:#fff;padding:7px 9px;text-align:left}
    td{border-bottom:1px solid #e2e8f0;padding:6px 9px}
  </style></head><body><h2>${title}</h2><table><thead><tr>${
    cols.map((c) => `<th>${c.label}</th>`).join('')
  }</tr></thead><tbody>${
    rows.map((r) => `<tr>${cols.map((c) => `<td>${c.exportValue ? c.exportValue(r) : plainValue(c, r)}</td>`).join('')}</tr>`).join('')
  }</tbody></table></body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

/* ---------------- DataTable ---------------- */
export function DataTable({ columns, rows, title = 'Report', exportName, defaultPageSize = 10, footer }) {
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState(1);

  const filtered = useMemo(() => {
    let out = rows;
    if (search) {
      const t = search.toLowerCase();
      out = rows.filter((r) =>
        columns.some((c) => String(plainValue(c, r)).toLowerCase().includes(t))
      );
    }
    if (sortBy) {
      const c = columns.find((x) => (x.key || x.label) === sortBy);
      out = [...out].sort((a, b) => {
        const av = plainValue(c, a), bv = plainValue(c, b);
        const an = parseFloat(av), bn = parseFloat(bv);
        if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * sortDir;
        return String(av).localeCompare(String(bv)) * sortDir;
      });
    }
    return out;
  }, [rows, search, sortBy, sortDir, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * pageSize, cur * pageSize + pageSize);

  return (
    <div className="table-card">
      <div className="table-toolbar no-print">
        <button className="btn btn-sm btn-green" onClick={() => exportCSV(columns, filtered, exportName || title)}>
          <FileSpreadsheet size={14} /> CSV
        </button>
        <button className="btn btn-sm btn-red" onClick={() => printTable(columns, filtered, title)}>
          <FileText size={14} /> PDF
        </button>
        <button className="btn btn-sm btn-blue" onClick={() => printTable(columns, filtered, title)}>
          <Printer size={14} /> PRINT
        </button>
        <span className="small muted">Show</span>
        <select value={pageSize} onChange={(e) => { setPageSize(+e.target.value); setPage(0); }}
          style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 7px' }}>
          {[10, 25, 50, 100].map((n) => <option key={n}>{n}</option>)}
        </select>
        <span className="small muted">entries</span>
        <div className="spacer" />
        <div className="mini-search">
          <Search size={14} />
          <input placeholder="Search..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key || c.label} className={c.sortable === false ? '' : 'sortable'}
                  onClick={() => {
                    if (c.sortable === false) return;
                    const k = c.key || c.label;
                    if (sortBy === k) setSortDir(-sortDir);
                    else { setSortBy(k); setSortDir(1); }
                  }}>
                  {c.label}{sortBy === (c.key || c.label) ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && (
              <tr className="empty-row"><td colSpan={columns.length}>No records found</td></tr>
            )}
            {slice.map((r, i) => (
              <tr key={r._id || i}>
                {columns.map((c) => (
                  <td key={c.key || c.label}>
                    {c.render ? c.render(r) : plainValue(c, r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-foot no-print">
        <span>Showing {filtered.length === 0 ? 0 : cur * pageSize + 1} to {Math.min(filtered.length, (cur + 1) * pageSize)} of {filtered.length} entries</span>
        {footer}
        <div className="pages">
          <button disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button>
          {Array.from({ length: pages }).slice(0, 7).map((_, i) => (
            <button key={i} className={`page-number ${i === cur ? 'on' : ''}`} onClick={() => setPage(i)}>{i + 1}</button>
          ))}
          <button disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Login credentials modal ----------------
   Shown once right after a student / parent login account is created,
   because passwords are stored hashed and cannot be viewed later. */
export function CredentialsModal({ credentials = {}, name, onClose }) {
  const [copied, setCopied] = useState(false);
  const rows = [
    credentials.studentUsername && { role: 'Student', username: credentials.studentUsername, password: credentials.studentPassword },
    credentials.parentUsername && { role: 'Parent', username: credentials.parentUsername, password: credentials.parentPassword },
  ].filter(Boolean);

  const copyAll = () => {
    const text = rows.map((r) => `${r.role} — username: ${r.username} | password: ${r.password}`).join('\n');
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Modal title="Login Credentials Created" icon={KeyRound} onClose={onClose}
      footer={<>
        <button className="btn btn-blue" onClick={copyAll}><Copy size={14} /> {copied ? 'Copied!' : 'Copy Credentials'}</button>
        <button className="btn btn-green" onClick={onClose}>Done</button>
      </>}>
      {name && <p style={{ marginBottom: 10 }}>Login accounts for <b>{name}</b>:</p>}
      <table className="data-table mb">
        <thead><tr><th>Role</th><th>Username</th><th>Password</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr className="empty-row"><td colSpan={3}>No new login accounts were created</td></tr>}
          {rows.map((r) => (
            <tr key={r.role}>
              <td><Badge value={r.role} color={r.role === 'Student' ? 'bg-green' : 'bg-pink'} /></td>
              <td className="mono"><b>{r.username}</b></td>
              <td className="mono"><b>{r.password}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        Share these with the {rows.length > 1 ? 'student and parent' : 'user'} now — passwords are stored
        encrypted and cannot be viewed again. You can reset them anytime from Users Management.
      </p>
    </Modal>
  );
}

/* ---------------- Confirm dialog ---------------- */
export function Confirm({ title = 'Are you sure?', message, onYes, onNo, yesLabel = 'Yes, Delete', danger = true }) {
  return (
    <Modal title={title} onClose={onNo} size="sm"
      footer={
        <>
          <button className="btn btn-gray" onClick={onNo}>Cancel</button>
          <button className={`btn ${danger ? 'btn-red' : 'btn-green'}`} onClick={onYes}>{yesLabel}</button>
        </>
      }>
      <p>{message}</p>
    </Modal>
  );
}
