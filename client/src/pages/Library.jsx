import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Library as LibraryIcon, Plus, Pencil, Trash2, BookOpen, BookMarked,
  AlertTriangle, Coins, CheckCircle2, Undo2, Send, Upload, X as XIcon,
} from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { DataTable, StatusTabs, Field, Modal, Badge, Confirm, KpiCard } from '../components/ui';

const CATEGORIES = ['Mathematics', 'English', 'Science', 'Computer', 'Hindi', 'Reference', 'Story Books', 'Art', 'GK', 'General'];
const BOOK_INIT = { title: '', author: '', isbn: '', category: 'General', copies: 1, shelf: '', coverImage: '' };

// Uploaded cover wins; otherwise fall back to category artwork in client/public/covers/
const categoryArt = (category) => {
  const key = String(category || 'General').toLowerCase().replace(/\s+/g, '-');
  const known = ['mathematics', 'english', 'science', 'computer', 'hindi', 'reference', 'story-books', 'art', 'gk', 'general'];
  return `/covers/${known.includes(key) ? key : 'general'}.png`;
};
const bookCover = (b) => b.coverImage || categoryArt(b.category);

// Resize the chosen file on a canvas so even phone photos fit the 600KB limit
function fileToCover(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const maxW = 480;
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image file')); };
    img.src = url;
  });
}

/* =================== Books Catalog =================== */
export function LibraryBooks() {
  const { user, settings, notify } = useApp();
  const navigate = useNavigate();
  const cur = settings.currency || '₹';
  const canWrite = ['admin', 'clerk', 'supervisor'].includes(user?.role);
  const [books, setBooks] = useState([]);
  const [students, setStudents] = useState([]);
  const [stats, setStats] = useState(null);
  const [modal, setModal] = useState(null); // {type:'form'|'issue', data}
  const [form, setForm] = useState(BOOK_INIT);
  const [issueForm, setIssueForm] = useState({ memberId: '', days: 14 });
  const [confirmDel, setConfirmDel] = useState(null);
  const [view, setView] = useState('grid');
  const fileRef = useRef(null);

  const load = () => Promise.all([
    api.get('/library/books').then(({ data }) => setBooks(data)),
    api.get('/library/stats').then(({ data }) => setStats(data)),
  ]);
  useEffect(() => {
    load();
    if (canWrite) api.get('/students', { params: { status: 'active' } }).then(({ data }) => setStudents(data));
  }, [canWrite]);

  const save = async () => {
    try {
      if (modal?.data) await api.put(`/library/books/${modal.data._id}`, form);
      else await api.post('/library/books', form);
      notify(modal?.data ? 'Book updated' : 'Book added to catalog');
      setModal(null);
      load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const pickCover = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToCover(file);
      setForm((f) => ({ ...f, coverImage: dataUrl }));
    } catch (err) { notify(err.message, 'error'); }
    e.target.value = '';
  };

  const issueBook = async () => {
    try {
      await api.post('/library/issues', {
        bookId: modal.data._id, memberType: 'student',
        memberId: issueForm.memberId, days: issueForm.days,
      });
      notify(`"${modal.data.title}" issued`);
      setModal(null);
      load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const columns = [
    { key: 'accNo', label: 'Acc No' },
    { key: 'title', label: 'Title', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src={bookCover(r)} alt="" style={{ width: 30, height: 40, objectFit: 'cover', borderRadius: 4 }} />
        <b>{r.title}</b>
      </div>
    ), exportValue: (r) => r.title },
    { key: 'author', label: 'Author' },
    { key: 'category', label: 'Category', render: (r) => <Badge value={r.category} color="bg-purple" /> },
    { key: 'shelf', label: 'Shelf' },
    { key: 'copies', label: 'Copies' },
    { key: 'availableCopies', label: 'Available', render: (r) => (
      <Badge value={`${r.availableCopies} available`} color={r.availableCopies > 0 ? 'bg-green' : 'bg-red'} />
    )},
    ...(canWrite ? [{ key: '_act', label: 'Actions', sortable: false, render: (r) => (
      <div className="row-actions">
        <button className="act-green" title="Issue to student" disabled={r.availableCopies < 1}
          onClick={() => { setIssueForm({ memberId: '', days: 14 }); setModal({ type: 'issue', data: r }); }}><Send size={15} /></button>
        <button className="act-edit" title="Edit" onClick={() => { setForm({ ...BOOK_INIT, ...r }); setModal({ type: 'form', data: r }); }}><Pencil size={15} /></button>
        {user?.role === 'admin' && <button className="act-del" title="Delete" onClick={() => setConfirmDel(r)}><Trash2 size={15} /></button>}
      </div>
    )}] : []),
  ];

  return (
    <>
      <div className="page-head">
        <h2><LibraryIcon size={20} /> Library — Books Catalog</h2>
        <div className="spacer" />
        <button className="btn btn-gray" onClick={() => setView(view === 'grid' ? 'table' : 'grid')}>
          {view === 'grid' ? 'Table View' : 'Shelf View'}
        </button>
        {canWrite && <button className="btn btn-green" onClick={() => { setForm(BOOK_INIT); setModal({ type: 'form' }); }}><Plus size={15} /> Add Book</button>}
      </div>

      {stats && (
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <KpiCard color="navy" icon={BookOpen} value={stats.titles} label="Titles" />
          <KpiCard color="teal" icon={BookMarked} value={stats.totalCopies} label="Total Copies" />
          <KpiCard color="green" icon={CheckCircle2} value={stats.available} label="Available" />
          <KpiCard color="orange" icon={Send} value={stats.issued} label="Issued Out" onClick={() => navigate('/library-circulation')} />
          <KpiCard color="red" icon={AlertTriangle} value={stats.overdue} label="Overdue" onClick={() => navigate('/library-circulation')} />
          <KpiCard color="purple" icon={Coins} value={`${cur}${stats.finesCollected}`} label="Fines Collected" />
        </div>
      )}

      {canWrite && stats?.overdue > 0 && (
        <div className="card card-pad mb" style={{ borderLeft: '4px solid var(--danger)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
          <span>
            <b>{stats.overdue} book(s) overdue</b> — fine accruing so far: <b className="txt-red">{cur}{stats.fineAccruing}</b> (at {cur}{stats.finePerDay}/day).
          </span>
          <button className="btn btn-sm btn-red" style={{ marginLeft: 'auto' }} onClick={() => navigate('/library-circulation')}>
            View Overdue Books
          </button>
        </div>
      )}

      {view === 'grid' && (
        <div className="book-grid">
          {books.map((b) => (
            <div key={b._id} className="book-card">
              <div className="cover cover-img" style={{
                backgroundImage: `linear-gradient(180deg, rgba(8,14,28,0) 30%, rgba(8,14,28,.88) 78%), url(${bookCover(b)})`,
                backgroundColor: b.coverColor,
              }}>
                <div className="t">{b.title}</div>
                <div className="a">{b.author}</div>
              </div>
              <div className="meta">
                <span><b>{b.accNo}</b> · Shelf {b.shelf || '—'}</span>
                <span>{b.category}</span>
                <Badge value={b.availableCopies > 0 ? `${b.availableCopies} of ${b.copies} available` : 'All copies issued'}
                  color={b.availableCopies > 0 ? 'bg-green' : 'bg-red'} />
                {canWrite && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <button className="btn btn-xs btn-green" disabled={b.availableCopies < 1}
                      onClick={() => { setIssueForm({ memberId: '', days: 14 }); setModal({ type: 'issue', data: b }); }}>
                      <Send size={12} /> Issue
                    </button>
                    <button className="btn btn-xs btn-gray"
                      onClick={() => { setForm({ ...BOOK_INIT, ...b }); setModal({ type: 'form', data: b }); }}>
                      <Pencil size={12} /> Edit
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'table' && <DataTable columns={columns} rows={books} title="Books Catalog" exportName="library-books" />}

      {modal?.type === 'form' && (
        <Modal title={modal.data ? 'Edit Book' : 'Add Book'} icon={BookOpen} onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" onClick={save}>{modal.data ? 'Update' : 'Add Book'}</button>
          </>}>
          <div className="form-grid">
            <Field label="Title" required full><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Author"><input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} /></Field>
            <Field label="ISBN"><input value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} /></Field>
            <Field label="Category">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Shelf"><input value={form.shelf} placeholder="e.g. M-2" onChange={(e) => setForm({ ...form, shelf: e.target.value })} /></Field>
            <Field label="Total Copies"><input type="number" min="1" value={form.copies} onChange={(e) => setForm({ ...form, copies: e.target.value })} /></Field>
            <Field label="Cover Image" full hint="Optional — JPG/PNG, auto-resized. If not set, category artwork is used.">
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <img src={form.coverImage || categoryArt(form.category)} alt="cover preview"
                  style={{ width: 72, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                <div style={{ display: 'grid', gap: 6 }}>
                  <button type="button" className="btn btn-sm btn-navy" onClick={() => fileRef.current?.click()}>
                    <Upload size={13} /> {form.coverImage ? 'Change Image' : 'Upload Image'}
                  </button>
                  {form.coverImage && (
                    <button type="button" className="btn btn-sm btn-gray" onClick={() => setForm({ ...form, coverImage: '' })}>
                      <XIcon size={13} /> Remove (use category art)
                    </button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickCover} />
              </div>
            </Field>
          </div>
        </Modal>
      )}

      {modal?.type === 'issue' && (
        <Modal title={`Issue — ${modal.data.title}`} icon={Send} onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" onClick={issueBook} disabled={!issueForm.memberId}>Issue Book</button>
          </>}>
          <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
            <img src={bookCover(modal.data)} alt="" style={{ width: 64, height: 86, objectFit: 'cover', borderRadius: 8 }} />
            <div className="small">
              <b>{modal.data.title}</b>
              <div className="muted">{modal.data.author} · {modal.data.accNo}</div>
              <Badge value={`${modal.data.availableCopies} available`} color="bg-green" />
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Student" required>
              <select value={issueForm.memberId} onChange={(e) => setIssueForm({ ...issueForm, memberId: e.target.value })}>
                <option value="">— Select student —</option>
                {students.map((s) => <option key={s._id} value={s._id}>{s.firstName} {s.lastName} ({s.admissionNo})</option>)}
              </select>
            </Field>
            <Field label="Issue Period (days)" hint={`Fine of ${cur}${stats?.finePerDay ?? 5}/day applies after the due date`}>
              <input type="number" min="1" max="60" value={issueForm.days} onChange={(e) => setIssueForm({ ...issueForm, days: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm message={`Delete "${confirmDel.title}" from the catalog?`}
          onNo={() => setConfirmDel(null)}
          onYes={async () => {
            try { await api.delete(`/library/books/${confirmDel._id}`); notify('Book deleted'); load(); }
            catch (e) { notify(errMsg(e), 'error'); }
            setConfirmDel(null);
          }} />
      )}
    </>
  );
}

/* =================== Circulation (Issue / Return) =================== */
export function LibraryCirculation() {
  const { user, settings, notify } = useApp();
  const cur = settings.currency || '₹';
  const canWrite = ['admin', 'clerk', 'supervisor'].includes(user?.role);
  const [issues, setIssues] = useState([]);
  const [books, setBooks] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [tab, setTab] = useState('issued');
  const [showIssue, setShowIssue] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(null);
  const [form, setForm] = useState({ bookId: '', memberType: 'student', memberId: '', days: 14 });

  const load = () => api.get('/library/issues').then(({ data }) => setIssues(data));
  useEffect(() => {
    load();
    api.get('/library/books', { params: { available: 'true' } }).then(({ data }) => setBooks(data));
    if (canWrite) {
      api.get('/students', { params: { status: 'active' } }).then(({ data }) => setStudents(data));
      api.get('/teachers').then(({ data }) => setTeachers(data));
    }
  }, [canWrite]);

  const counts = useMemo(() => ({
    issued: issues.filter((i) => i.status === 'issued').length,
    overdue: issues.filter((i) => i.overdue).length,
    returned: issues.filter((i) => i.status === 'returned').length,
  }), [issues]);

  const filtered = tab === 'all' ? issues
    : tab === 'overdue' ? issues.filter((i) => i.overdue)
    : issues.filter((i) => i.status === tab);

  const issue = async () => {
    try {
      await api.post('/library/issues', form);
      notify('Book issued');
      setShowIssue(false);
      setForm({ bookId: '', memberType: 'student', memberId: '', days: 14 });
      load();
      api.get('/library/books', { params: { available: 'true' } }).then(({ data }) => setBooks(data));
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const doReturn = async () => {
    const rec = confirmReturn;
    setConfirmReturn(null);
    try {
      const { data } = await api.post(`/library/issues/${rec._id}/return`);
      notify(data.fine > 0
        ? `Returned with ${cur}${data.fine} late fine — posted to Daily Accounts`
        : 'Book returned on time');
      load();
      api.get('/library/books', { params: { available: 'true' } }).then(({ data: d }) => setBooks(d));
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const columns = [
    { key: 'accNo', label: 'Acc No' },
    { key: 'bookTitle', label: 'Book', render: (r) => <b>{r.bookTitle}</b> },
    { key: 'memberName', label: 'Member', render: (r) => <>{r.memberName} <Badge value={r.memberType} color={r.memberType === 'student' ? 'bg-blue' : 'bg-teal'} /></> },
    { key: 'issueDate', label: 'Issued' },
    { key: 'dueDate', label: 'Due', render: (r) => r.overdue
      ? <span className="txt-red"><b>{r.dueDate}</b> ({r.daysLate}d late)</span> : r.dueDate },
    { key: 'returnDate', label: 'Returned', render: (r) => r.returnDate || '—' },
    { key: 'fine', label: 'Fine', render: (r) => {
      if (r.fine) return <b className="txt-red">{cur}{r.fine}</b>;
      if (r.overdue) return <span className="txt-red small"><b>{cur}{r.daysLate * 5}</b> accruing</span>;
      return '—';
    }},
    { key: 'status', label: 'Status', render: (r) => (
      <Badge value={r.overdue ? 'overdue' : r.status} color={r.overdue ? 'bg-red' : r.status === 'returned' ? 'bg-green' : 'bg-yellow'} />
    )},
    ...(canWrite ? [{ key: '_act', label: 'Actions', sortable: false, render: (r) => (
      r.status === 'issued'
        ? <button className="btn btn-sm btn-navy" onClick={() => setConfirmReturn(r)}><Undo2 size={13} /> Return</button>
        : null
    )}] : []),
  ];

  return (
    <>
      <div className="page-head">
        <h2><BookMarked size={20} /> Library — Issue / Return</h2>
        <div className="spacer" />
        {canWrite && <button className="btn btn-green" onClick={() => setShowIssue(true)}><Plus size={15} /> Issue Book</button>}
      </div>

      <StatusTabs active={tab} onChange={setTab} tabs={[
        { key: 'issued', label: 'Issued Out', count: counts.issued, color: 'yellow' },
        { key: 'overdue', label: 'Overdue', count: counts.overdue, color: 'red' },
        { key: 'returned', label: 'Returned', count: counts.returned, color: 'green' },
        { key: 'all', label: 'All', count: issues.length, color: 'navy' },
      ]} />

      <DataTable columns={columns} rows={filtered} title="Library Circulation" exportName="library-circulation" />

      {showIssue && (
        <Modal title="Issue Book" icon={Send} onClose={() => setShowIssue(false)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setShowIssue(false)}>Cancel</button>
            <button className="btn btn-green" onClick={issue}>Issue Book</button>
          </>}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Book" required>
              <select value={form.bookId} onChange={(e) => setForm({ ...form, bookId: e.target.value })}>
                <option value="">— Select available book —</option>
                {books.map((b) => <option key={b._id} value={b._id}>{b.title} ({b.accNo}) — {b.availableCopies} left</option>)}
              </select>
            </Field>
            <Field label="Member Type">
              <select value={form.memberType} onChange={(e) => setForm({ ...form, memberType: e.target.value, memberId: '' })}>
                <option value="student">Student</option>
                <option value="teacher">Teacher / Staff</option>
              </select>
            </Field>
            <Field label={form.memberType === 'student' ? 'Student' : 'Staff Member'} required>
              <select value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>
                <option value="">— Select member —</option>
                {form.memberType === 'student'
                  ? students.map((s) => <option key={s._id} value={s._id}>{s.firstName} {s.lastName} ({s.admissionNo})</option>)
                  : teachers.map((t) => <option key={t._id} value={t._id}>{t.fullName}</option>)}
              </select>
            </Field>
            <Field label="Issue Period (days)" hint="Fine of ₹5/day applies after the due date">
              <input type="number" min="1" max="60" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}

      {confirmReturn && (
        <Confirm
          title="Return Book?"
          message={`Return "${confirmReturn.bookTitle}" from ${confirmReturn.memberName}?${confirmReturn.overdue ? ` A late fine of ${cur}${confirmReturn.daysLate * 5} will be charged (${confirmReturn.daysLate} days late).` : ''}`}
          danger={false}
          yesLabel="Yes, Return"
          onNo={() => setConfirmReturn(null)}
          onYes={doReturn}
        />
      )}
    </>
  );
}
