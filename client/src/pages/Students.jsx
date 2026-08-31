import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  GraduationCap, Plus, Eye, Wallet, CalendarCheck, Award, UsersRound, Pencil, Trash2,
  CreditCard, Printer, FileText, Receipt, Camera, FolderLock,
} from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups, className } from '../hooks/useLookups';
import { DataTable, StatusTabs, FilterBar, Field, Modal, Badge, Confirm, CredentialsModal } from '../components/ui';
import { AttachmentField, AttachmentImage } from '../components/Attachment';
import { displayClassName, formatClass, isPrePrimaryClassName } from '../utils/classNames';

const HOUSE_COLORS = { Red: 'bg-solid-red', Blue: 'bg-solid-blue', Green: 'bg-solid-green', Yellow: 'bg-solid-orange' };
const HOUSE_HEX = { Red: '#dc2626', Blue: '#2563eb', Green: '#16a34a', Yellow: '#f59e0b' };
const STUDENT_DOCUMENTS = [
  ['studentAadhaar', 'Student Aadhaar Card'],
  ['studentIdCard', 'Student ID Card'],
  ['birthCertificate', 'Birth Certificate'],
  ['leavingCertificate', 'Leaving Certificate (LC)'],
  ['transferCertificate', 'Transfer Certificate (TC)'],
  ['previousMarksheet', 'Previous Class Marksheet'],
  ['other', 'Other Supporting Document'],
];

function renderBalanceBreakdownRows(rows = []) {
  const visibleRows = rows.filter((item) => Number(item.balanceAmount || 0) > 0);
  if (!visibleRows.length) return '<p style="margin:2px 0; color:#16a34a; font-weight:700">No fee-head balance pending.</p>';
  return `
    <table style="width:100%; border-collapse:collapse; margin-top:4px; font-size:8.5px">
      <tbody>
        ${visibleRows.map((item) => `
          <tr>
            <td style="padding:1px 0">${item.name}</td>
            <td style="padding:1px 0; text-align:right; font-family:monospace; color:#b45309">INR ${Number(item.balanceAmount || 0).toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function receiptReferenceLabel(mode = '') {
  const normalized = String(mode || '').toLowerCase();
  if (normalized === 'upi') return 'UPI Reference / UTR';
  if (normalized === 'check') return 'Cheque Number';
  if (normalized === 'online') return 'Transaction ID / Reference';
  if (normalized === 'card') return 'Card Reference';
  return 'Reference Number';
}

function escapeReceiptText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Deterministic pseudo-barcode from the admission number
function Barcode({ code }) {
  const bars = String(code).split('').flatMap((ch) => {
    const n = ch.charCodeAt(0);
    return [(n % 3) + 1, ((n >> 2) % 3) + 1];
  });
  return (
    <div className="barcode">
      {bars.map((h, i) => <i key={i} style={{ height: `${h * 10 + 4}px`, width: i % 3 === 0 ? 3 : 2 }} />)}
    </div>
  );
}

const EMPTY = {
  firstName: '', lastName: '', gender: 'Male', dob: '', nationality: '', curriculum: 'IB PYP',
  englishLevel: 'NATIVE', house: 'Red', classId: '', rollNo: '', admissionDate: '',
  admissionCategory: 'NEW_ADMISSION',
  transportRequired: false, transportRoute: '', allergies: '', medicalNotes: '', languages: '',
  address: '', addressLine1: '', addressLine2: '', city: '', state: '', pinCode: '', country: 'India',
  fatherName: '', fatherMobile: '', fatherEmail: '', fatherOccupation: '',
  motherName: '', motherMobile: '', motherEmail: '', motherOccupation: '',
  parentName: '', parentRelation: 'Father', parentMobile: '', parentEmail: '', parentOccupation: '',
  loginPassword: '', parentPassword: '',
};

export default function Students() {
  const navigate = useNavigate();
  const { notify, settings, user } = useApp();
  const { classes, parents } = useLookups(['classes', 'parents']);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('all');
  const [filters, setFilters] = useState({ search: '', classId: '', gender: '', curriculum: '', englishLevel: '', house: '', hasAllergies: false });
  const [modal, setModal] = useState(null); // {type: 'form'|'fees'|'attendance'|'results'|'parents'|'view', data}
  const [form, setForm] = useState(EMPTY);
  const [formTab, setFormTab] = useState('details');
  const [feePreview, setFeePreview] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [params] = useSearchParams();
  const canWrite = ['admin', 'clerk', 'supervisor'].includes(user?.role);

  const load = () => api.get('/students').then(({ data }) => setRows(data));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (params.get('add')) openAdd(); }, [params]);

  const counts = useMemo(() => {
    const c = { all: rows.length };
    for (const s of ['active', 'inactive', 'transferred', 'passed-out', 'suspended']) {
      c[s] = rows.filter((r) => r.status === s).length;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (tab !== 'all' && r.status !== tab) return false;
    if (filters.classId && r.classId !== filters.classId) return false;
    if (filters.gender && r.gender !== filters.gender) return false;
    if (filters.curriculum && r.curriculum !== filters.curriculum) return false;
    if (filters.englishLevel && r.englishLevel !== filters.englishLevel) return false;
    if (filters.house && r.house !== filters.house) return false;
    if (filters.hasAllergies && !r.allergies) return false;
    if (filters.search) {
      const t = filters.search.toLowerCase();
      if (!`${r.firstName} ${r.lastName} ${r.admissionNo} ${r.rollNo}`.toLowerCase().includes(t)) return false;
    }
    return true;
  }), [rows, tab, filters]);

  const getAdmissionCategory = (student) => {
    if (student.admissionCategory === 'NEW_ADMISSION') return 'NEW_ADMISSION';
    if (student.admissionCategory === 'EXISTING' || student.admissionCategory === 'EXISTING_STUDENT') return 'EXISTING';
    return student.medicalNotes?.includes('Category: NEW_ADMISSION') ? 'NEW_ADMISSION' : 'EXISTING';
  };

  const openAdd = () => { setFormTab('details'); setForm(EMPTY); setModal({ type: 'form' }); };
  const openEdit = (r) => { setFormTab('details'); setForm({ ...EMPTY, ...r, documents: r.documents || {}, admissionCategory: getAdmissionCategory(r) }); setModal({ type: 'form', data: r }); };

  const setDocument = (key, attachment) => {
    setForm((current) => ({ ...current, documents: { ...(current.documents || {}), [key]: attachment } }));
  };

  useEffect(() => {
    let active = true;
    if (modal?.type !== 'form' || !form.classId) {
      setFeePreview(null);
      return () => { active = false; };
    }
    api.get('/students/fee-preview', { params: { classId: form.classId, admissionCategory: form.admissionCategory } })
      .then(({ data }) => { if (active) setFeePreview(data); })
      .catch(() => { if (active) setFeePreview(null); });
    return () => { active = false; };
  }, [modal?.type, form.classId, form.admissionCategory]);

  const save = async () => {
    try {
      if (modal.data?._id) {
        await api.put(`/students/${modal.data._id}`, form);
        notify('Student updated');
        setModal(null);
      } else {
        const { data } = await api.post('/students', form);
        notify('Student added successfully');
        setModal({ type: 'credentials', data: data.credentials, name: `${form.firstName} ${form.lastName}`.trim() });
      }
      load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const printReceipt = (receipt) => {
    const renderSingleCopy = (copyType, r) => {
      const totalDemand = r.totalDemand || (Number(r.subTotal || 0) + Number(r.balance || 0)) || 0;
      const name = String(r.className || '').toLowerCase();
      let standardDemand = 23500;
      if (isPrePrimaryClassName(name)) {
        standardDemand = 29500;
      } else if (name.includes('grade 1') || name.includes('class 1')) {
        standardDemand = 25500;
      } else if (name.includes('grade 2') || name.includes('class 2') || name.includes('grade 3') || name.includes('class 3') || name.includes('grade 4') || name.includes('class 4')) {
        standardDemand = 23500;
      } else if (name.includes('grade 5') || name.includes('class 5')) {
        standardDemand = 31000;
      } else {
        standardDemand = 28800;
      }

      const previousYearArrears = r.previousYearArrears !== undefined ? r.previousYearArrears : Math.max(0, totalDemand - standardDemand);
      const currentGradeFeeRate = r.currentGradeFeeRate !== undefined ? r.currentGradeFeeRate : Math.min(totalDemand, standardDemand);
      const totalPaidLifetime = r.totalPaidLifetime !== undefined ? r.totalPaidLifetime : (totalDemand - r.balance);
      const balanceBreakdownHtml = renderBalanceBreakdownRows(r.balanceBreakdown || []);

      return `
        <div class="receipt-copy">
          <div>
            <div style="position:absolute; top:12px; right:12px; background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; font-size:9px; font-weight:800; padding:2px 8px; border-radius:4px; text-transform:uppercase">
              ${copyType}
            </div>
            
            <div style="text-align:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:10px">
              <img src="/logo.jpeg" alt="School Logo" style="width:40px; height:40px; object-fit:contain; margin:0 auto; display:block" />
              <h2 style="font-size:14px; font-weight:900; margin:4px 0 2px; text-transform:uppercase; color:#0f172a; letter-spacing:0.5px">M.V HIGH SCHOOL</h2>
              <p style="font-size:8px; color:#475569; margin:0">463-475, S.V.P. ROAD, PRARTHNA SAMAJ, Charni Road, Opera House, Mumbai, Maharashtra 400004</p>
            </div>

            <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:10px">
              <div style="line-height:1.4">
                <p style="margin:0"><b>Receipt Date:</b> ${r.date}</p>
                <p style="margin:0"><b>Receipt No:</b> ${r.receiptNo}</p>
                <p style="margin:0"><b>Tel:</b> 022 2386 5845</p>
                <p style="margin:0"><b>Email:</b> principalmveng@gmail.com</p>
              </div>
              <div style="text-align:right; line-height:1.4">
                <p style="margin:0; font-size:9px; color:#94a3b8; text-transform:uppercase">Receipt To</p>
                <p style="margin:0; font-size:11px; font-weight:700; text-transform:uppercase">${r.studentName}</p>
                <p style="margin:0"><b>Adm No:</b> ${r.admissionNo}</p>
                <p style="margin:0; font-weight:700">${displayClassName(r.className)}</p>
              </div>
            </div>

            <div style="border-top:1px solid #cbd5e1; border-bottom:1px solid #cbd5e1; padding:4px 0; margin-bottom:10px">
              <table style="width:100%; border-collapse:collapse; font-size:9.5px">
                <thead>
                  <tr style="font-weight:700; color:#334155; border-bottom:1px solid #cbd5e1">
                    <th style="text-align:left; padding:2px 4px; width:6%">#</th>
                    <th style="text-align:left; padding:2px 4px">Description</th>
                    <th style="text-align:right; padding:2px 4px">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${(r.items || []).map((item, idx) => `
                    <tr style="border-bottom:1px solid #f1f5f9">
                      <td style="padding:4px">${idx + 1}</td>
                      <td style="padding:4px; font-weight:600">${item.description}</td>
                      <td style="padding:4px; text-align:right; font-family:monospace">INR ${Number(item.amount || 0).toFixed(2)} /-</td>
                    </tr>
                  `).join('')}
                  ${r.lateFee > 0 ? `
                    <tr style="border-bottom:1px solid #f1f5f9">
                      <td style="padding:4px">${(r.items || []).length + 1}</td>
                      <td style="padding:4px; font-weight:600">Late Fee Charge</td>
                      <td style="padding:4px; text-align:right; font-family:monospace; color:#dc2626">+ INR ${Number(r.lateFee || 0).toFixed(2)} /-</td>
                    </tr>
                  ` : ''}
                  ${r.discount > 0 ? `
                    <tr style="border-bottom:1px solid #f1f5f9">
                      <td style="padding:4px">${(r.items || []).length + (r.lateFee > 0 ? 2 : 1)}</td>
                      <td style="padding:4px; font-weight:600">Concession Discount</td>
                      <td style="padding:4px; text-align:right; font-family:monospace; color:#16a34a">- INR ${Number(r.discount || 0).toFixed(2)} /-</td>
                    </tr>
                  ` : ''}
                </tbody>
              </table>
            </div>

            <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:10px">
              <div style="max-width:280px; line-height:1.35">
                <p style="margin:0"><b>Transaction Mode:</b> ${String(r.mode || '').toUpperCase()}</p>
                ${r.reference ? `<p style="margin:0"><b>${receiptReferenceLabel(r.mode)}:</b> ${escapeReceiptText(r.reference)}</p>` : ''}
                ${r.remarks ? `<p style="margin:0"><b>Remarks:</b> ${escapeReceiptText(r.remarks)}</p>` : ''}
              </div>
              <div style="width:200px; text-align:right; line-height:1.4">
                <div style="display:flex; justify-content:space-between; color:#475569">
                  <span>Sub Total</span>
                  <span style="font-family:monospace">INR ${Number(r.amountPaid || 0).toFixed(2)}/-</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-weight:700; color:#0f172a; border-top:1px solid #cbd5e1; padding-top:2px; font-size:11px">
                  <span>Total Paid</span>
                  <span style="font-family:monospace">INR ${Number(r.amountPaid || 0).toFixed(2)}/-</span>
                </div>
              </div>
            </div>

            <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:6px 10px; margin-bottom:10px; font-size:9px; color:#475569; font-weight:600">
              <p style="margin:0 0 4px; font-size:8px; text-transform:uppercase; color:#94a3b8; font-weight:700; letter-spacing:0.5px">Student Account Balance Statement</p>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
                <div style="line-height:1.4">
                  <p style="margin:0">Current Grade Fee Rate: <span style="font-family:monospace; color:#0f172a">INR ${Number(currentGradeFeeRate).toFixed(2)}</span></p>
                  <p style="margin:0">Previous Year Arrears: <span style="font-family:monospace; color:#0f172a">INR ${Number(previousYearArrears).toFixed(2)}</span></p>
                  <p style="margin:0">Total Life Demand: <span style="font-family:monospace; color:#0f172a">INR ${Number(totalDemand).toFixed(2)}</span></p>
                </div>
                <div style="text-align:right; line-height:1.4">
                  <p style="margin:0">Paid in this Receipt: <span style="font-family:monospace; color:#16a34a; font-weight:700">INR ${Number(r.amountPaid || 0).toFixed(2)}</span></p>
                  <p style="margin:0">Total Paid (Lifetime): <span style="font-family:monospace; color:#16a34a; font-weight:700">INR ${Number(totalPaidLifetime).toFixed(2)}</span></p>
                  <p style="margin:2px 0 0; border-top:1px solid #cbd5e1; padding-top:1px; font-weight:700; color:#b45309">Remaining Balance Outstanding: <span style="font-family:monospace">INR ${Number(r.balance || 0).toFixed(2)}</span></p>
                </div>
              </div>
              <div style="border-top:1px solid #e2e8f0; margin-top:5px; padding-top:4px">
                <p style="margin:0 0 2px; font-size:8px; text-transform:uppercase; color:#94a3b8; font-weight:700; letter-spacing:0.5px">Remaining Balance Breakdown</p>
                ${balanceBreakdownHtml}
              </div>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:flex-end; font-size:8.5px; color:#64748b; border-top:1px solid #f1f5f9; padding-top:6px">
            <div>
              <p style="margin:0; font-weight:700; color:#475569">Terms & Conditions</p>
              <p style="margin:0">This is a computer-generated fee receipt. Signature is not mandatory.</p>
            </div>
            <div style="text-align:center">
              <div style="width:110px; border-bottom:1px solid #94a3b8; margin-bottom:2px"></div>
              <p style="margin:0; font-weight:700; color:#475569">Authorized Signatory</p>
              <p style="margin:0; font-size:7.5px">(Seal & Signature)</p>
            </div>
          </div>
        </div>
      `;
    };

    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Fee Receipt</title><style>
      html, body { height: 100%; margin: 0; padding: 0; background: #fff; }
      .print-container {
        height: 100vh;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 20px;
        box-sizing: border-box;
      }
      .receipt-copy {
        height: 46%;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 15px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        position: relative;
        background: #fff;
        color: #1e293b;
        font-size: 11px;
        font-family: 'Segoe UI', sans-serif;
      }
      @media print {
        .print-container {
          padding: 10px;
        }
      }
    </style></head><body>
      <div class="print-container">
        ${renderSingleCopy("SCHOOL COPY", receipt)}
        
        <div style="border-top:2px dashed #94a3b8; text-align:center; position:relative; margin:10px 0; min-height:14px">
          <span style="background:#fff; padding:0 10px; font-size:9px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:2px; position:absolute; top:-7px; left:50%; transform:translateX(-50%)">
            ✂ CUT ALONG DOTTED LINE — DUPLICATE COPY BELOW ✂
          </span>
        </div>

        ${renderSingleCopy("PARENT COPY", receipt)}
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const openQuick = async (type, r) => {
    try {
      const { data } = await api.get(`/students/${r._id}/${type}`);
      setModal({ type, data, student: r });
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const cur = settings.currency || '₹';

  const columns = [
    { key: 'admissionNo', label: 'Adm #', render: (r) => <span className="mono link-like" onClick={() => setModal({ type: 'view', data: r })}>{r.admissionNo}</span> },
    { key: 'firstName', label: 'Student', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="badge bg-navy">S</span>
        <div>
          <b>{r.firstName} {r.lastName}</b>
          <div className="small muted">Roll {r.rollNo || '—'} {r.gender === 'Female' ? '♀' : '♂'}</div>
        </div>
      </div>
    ), exportValue: (r) => `${r.firstName} ${r.lastName}` },
    { key: 'nationality', label: 'Nationality' },
    { key: 'curriculum', label: 'Curriculum', render: (r) => <Badge value={r.curriculum} color="bg-solid-green" /> },
    { key: 'englishLevel', label: 'EAL', render: (r) => <Badge value={r.englishLevel} color={r.englishLevel === 'NATIVE' ? 'bg-teal' : 'bg-yellow'} /> },
    { key: 'classId', label: 'Class', value: (r) => className(classes, r.classId) },
    { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
    { key: 'house', label: 'House', render: (r) => <Badge value={r.house} color={HOUSE_COLORS[r.house]} /> },
    { key: 'allergies', label: 'Allergies', render: (r) => r.allergies ? <span className="txt-red small"><b>⚠ Allergy</b></span> : <span className="muted">—</span> },
    { label: 'Actions', sortable: false, noExport: true, render: (r) => (
      <div className="row-actions">
        <button className="act-view" title="View profile" onClick={() => setModal({ type: 'view', data: r })}><Eye size={15} /></button>
        <button className="act-green" title="Collect Fee" onClick={() => navigate(`/fees?add=true&studentId=${r._id}`)}><Wallet size={15} /></button>
        <button className="act-navy" title="Fees history" onClick={() => openQuick('fees', r)}><Receipt size={15} /></button>
        <button className="act-orange" title="Attendance report" onClick={() => openQuick('attendance', r)}><CalendarCheck size={15} /></button>
        <button className="act-navy" title="Exam results" onClick={() => openQuick('results', r)}><Award size={15} /></button>
        <button className="act-purple" title="Linked parents" onClick={() => openQuick('parents', r)}><UsersRound size={15} /></button>
        <button className="act-view" title="ID Card" onClick={() => setModal({ type: 'idcard', data: r })}><CreditCard size={15} /></button>
        {canWrite && <button className="act-edit" title="Edit" onClick={() => openEdit(r)}><Pencil size={15} /></button>}
        {user?.role === 'admin' && <button className="act-del" title="Delete" onClick={() => setConfirmDel(r)}><Trash2 size={15} /></button>}
      </div>
    )},
  ];

  return (
    <>
      <div className="page-head">
        <h2><GraduationCap size={20} /> Students Management</h2>
        <div className="spacer" />
        {canWrite && <button className="btn btn-green" onClick={openAdd}><Plus size={15} /> Add Student</button>}
      </div>

      <StatusTabs active={tab} onChange={setTab} tabs={[
        { key: 'all', label: 'All', count: counts.all, color: 'navy' },
        { key: 'active', label: 'Active', count: counts.active, color: 'green' },
        { key: 'inactive', label: 'Inactive', count: counts.inactive, color: 'gray' },
        { key: 'transferred', label: 'Transferred', count: counts.transferred, color: 'purple' },
        { key: 'passed-out', label: 'Passed Out', count: counts['passed-out'], color: 'pink' },
        { key: 'suspended', label: 'Suspended', count: counts.suspended, color: 'red' },
      ]} />

      <FilterBar onClear={() => setFilters({ search: '', classId: '', gender: '', curriculum: '', englishLevel: '', house: '', hasAllergies: false })}>
        <Field label="Search"><input placeholder="Search students..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></Field>
        <Field label="Class">
          <select value={filters.classId} onChange={(e) => setFilters({ ...filters, classId: e.target.value })}>
            <option value="">All Classes</option>
            {classes.map((c) => <option key={c._id} value={c._id}>{formatClass(c)}</option>)}
          </select>
        </Field>
        <Field label="Gender">
          <select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}>
            <option value="">All Genders</option><option>Male</option><option>Female</option>
          </select>
        </Field>
        <Field label="Curriculum">
          <select value={filters.curriculum} onChange={(e) => setFilters({ ...filters, curriculum: e.target.value })}>
            <option value="">All Curricula</option><option>IB PYP</option><option>CBSE</option><option>ICSE</option><option>State Board</option>
          </select>
        </Field>
        <Field label="English Level">
          <select value={filters.englishLevel} onChange={(e) => setFilters({ ...filters, englishLevel: e.target.value })}>
            <option value="">All Levels</option>
            {['NATIVE', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'].map((l) => <option key={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="House">
          <select value={filters.house} onChange={(e) => setFilters({ ...filters, house: e.target.value })}>
            <option value="">All Houses</option>{['Red', 'Blue', 'Green', 'Yellow'].map((h) => <option key={h}>{h}</option>)}
          </select>
        </Field>
        <Field label="Has Allergies">
          <label style={{ display: 'flex', gap: 7, alignItems: 'center', textTransform: 'none', fontSize: 13 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={filters.hasAllergies}
              onChange={(e) => setFilters({ ...filters, hasAllergies: e.target.checked })} />
            <span className="txt-red">⚠ Has allergies</span>
          </label>
        </Field>
      </FilterBar>

      <DataTable columns={columns} rows={filtered} title="Students Report" exportName="students" />

      {/* ------- Add / Edit form ------- */}
      {modal?.type === 'form' && (
        <Modal title={modal.data ? 'Edit Student' : 'Add Student'} icon={GraduationCap} size="lg" onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" onClick={save}>{modal.data ? 'Update Student' : 'Add Student'}</button>
          </>}>
          {modal.data && (
            <div className="student-edit-tabs">
              <button type="button" className={formTab === 'details' ? 'active' : ''} onClick={() => setFormTab('details')}><GraduationCap size={15} /> Student Details</button>
              <button type="button" className={formTab === 'documents' ? 'active' : ''} onClick={() => setFormTab('documents')}><FolderLock size={15} /> Documents & Photo</button>
            </div>
          )}
          {(!modal.data || formTab === 'details') && (
          <div className="form-grid">
            <div className="form-section">Personal Information</div>
            <Field label="First Name" required><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
            <Field label="Last Name"><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
            <Field label="Gender"><select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option>Male</option><option>Female</option></select></Field>
            <Field label="Date of Birth"><input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></Field>
            <Field label="Nationality / Citizenship"><input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} placeholder="e.g. Indian" /></Field>
            <Field label="Languages Spoken"><input value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} placeholder="e.g. English, Hindi" /></Field>
            <div className="form-section">Address Details</div>
            <Field label="Address Line 1" full><input value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} /></Field>
            <Field label="Address Line 2" full><input value={form.addressLine2} onChange={(e) => setForm({ ...form, addressLine2: e.target.value })} /></Field>
            <Field label="City"><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="State"><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
            <Field label="PIN Code"><input value={form.pinCode} onChange={(e) => setForm({ ...form, pinCode: e.target.value })} /></Field>
            <Field label="Country"><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
            <Field label="Full Address" full><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>

            <div className="form-section">Academic</div>
            <Field label="Class" required>
              <select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">Select class…</option>
                {classes.map((c) => <option key={c._id} value={c._id}>{formatClass(c)}</option>)}
              </select>
            </Field>
            <Field label="Roll No"><input value={form.rollNo} onChange={(e) => setForm({ ...form, rollNo: e.target.value })} /></Field>
            <Field label="Curriculum"><select value={form.curriculum} onChange={(e) => setForm({ ...form, curriculum: e.target.value })}><option>IB PYP</option><option>CBSE</option><option>ICSE</option><option>State Board</option></select></Field>
            <Field label="English Level (EAL)"><select value={form.englishLevel} onChange={(e) => setForm({ ...form, englishLevel: e.target.value })}>{['NATIVE', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'].map((l) => <option key={l}>{l}</option>)}</select></Field>
            <Field label="House"><select value={form.house} onChange={(e) => setForm({ ...form, house: e.target.value })}>{['Red', 'Blue', 'Green', 'Yellow'].map((h) => <option key={h}>{h}</option>)}</select></Field>
            <Field label="Admission Date"><input type="date" value={form.admissionDate} onChange={(e) => setForm({ ...form, admissionDate: e.target.value })} /></Field>
            <Field label="Fee Admission Type" hint="New admission charges apply only for the joining academic year. Promotion changes the student to the existing rate.">
              <select value={form.admissionCategory || 'NEW_ADMISSION'} onChange={(e) => setForm({ ...form, admissionCategory: e.target.value })}>
                <option value="NEW_ADMISSION">New Admission (Charges Admission Fee)</option>
                <option value="EXISTING">Existing Student (No Admission Fee)</option>
              </select>
            </Field>
            {feePreview && (
              <div className="student-fee-preview">
                <span>Annual fee for {displayClassName(feePreview.className)}</span>
                <b>{settings.currency || '₹'}{feePreview.annualFee.toLocaleString()}</b>
              </div>
            )}
            {modal.data && (
              <Field label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {['active', 'inactive', 'transferred', 'passed-out', 'suspended'].map((s) => <option key={s}>{s}</option>)}
              </select></Field>
            )}

            <div className="form-section">Transport</div>
            <Field label="Transport Required">
              <select value={form.transportRequired ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, transportRequired: e.target.value === 'yes' })}>
                <option value="no">No</option><option value="yes">Yes</option>
              </select>
            </Field>
            <Field label="Transport Route"><input value={form.transportRoute} disabled={!form.transportRequired} onChange={(e) => setForm({ ...form, transportRoute: e.target.value })} placeholder="e.g. Route 2" /></Field>

            <div className="form-section">Medical Notes</div>
            <Field label="Allergies"><input value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder="e.g. Peanuts" /></Field>
            <Field label="Health Restrictions"><input value={form.medicalNotes} onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })} /></Field>

            <div className="form-section">Father Information</div>
            <Field label="Father Name"><input value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} /></Field>
            <Field label="Father Mobile"><input value={form.fatherMobile} onChange={(e) => setForm({ ...form, fatherMobile: e.target.value })} /></Field>
            <Field label="Father Email"><input value={form.fatherEmail} onChange={(e) => setForm({ ...form, fatherEmail: e.target.value })} /></Field>
            <Field label="Father Occupation"><input value={form.fatherOccupation} onChange={(e) => setForm({ ...form, fatherOccupation: e.target.value })} /></Field>

            <div className="form-section">Mother Information</div>
            <Field label="Mother Name"><input value={form.motherName} onChange={(e) => setForm({ ...form, motherName: e.target.value })} /></Field>
            <Field label="Mother Mobile"><input value={form.motherMobile} onChange={(e) => setForm({ ...form, motherMobile: e.target.value })} /></Field>
            <Field label="Mother Email"><input value={form.motherEmail} onChange={(e) => setForm({ ...form, motherEmail: e.target.value })} /></Field>
            <Field label="Mother Occupation"><input value={form.motherOccupation} onChange={(e) => setForm({ ...form, motherOccupation: e.target.value })} /></Field>

            {!modal.data && (<>
              <div className="form-section">Parent / Guardian</div>
              <Field label="Parent Name"><input value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} /></Field>
              <Field label="Relation"><select value={form.parentRelation} onChange={(e) => setForm({ ...form, parentRelation: e.target.value })}><option>Father</option><option>Mother</option><option>Guardian</option></select></Field>
              <Field label="Parent Mobile" hint="Reuses existing parent if mobile matches"><input value={form.parentMobile} onChange={(e) => setForm({ ...form, parentMobile: e.target.value })} /></Field>
              <Field label="Parent Email"><input value={form.parentEmail} onChange={(e) => setForm({ ...form, parentEmail: e.target.value })} /></Field>

              <div className="form-section">Login Passwords</div>
              <Field label="Student Login Password" hint="Leave blank for default: student123"><input value={form.loginPassword} onChange={(e) => setForm({ ...form, loginPassword: e.target.value })} /></Field>
              <Field label="Parent Login Password" hint="Leave blank for default: parent123"><input value={form.parentPassword} onChange={(e) => setForm({ ...form, parentPassword: e.target.value })} /></Field>
            </>)}
          </div>
          )}
          {modal.data && formTab === 'documents' && (
            <div className="student-documents-panel">
              <div className="student-document-note"><FolderLock size={18} /><span><b>Secure student document vault</b><small>Visible only to authorized staff. Uploads are optional and do not affect fees or admission records.</small></span></div>
              <div className="student-photo-card">
                <div className="student-photo-preview">
                  {form.profilePhoto?._id
                    ? <AttachmentImage attachment={form.profilePhoto} alt={`${form.firstName} ${form.lastName}`} />
                    : <span><Camera size={26} />{form.firstName?.[0]}{form.lastName?.[0]}</span>}
                </div>
                <div><h4>Student Photograph</h4><p>Used on the student profile and identity card.</p>
                  <AttachmentField value={form.profilePhoto} onChange={(value) => setForm((current) => ({ ...current, profilePhoto: value }))}
                    scope="studentDocument" hostId={modal.data._id} documentType="profilePhoto" imageOnly title="Upload student photo" />
                </div>
              </div>
              <div className="student-document-grid">
                {STUDENT_DOCUMENTS.map(([key, label]) => (
                  <div className="student-document-card" key={key}>
                    <div className="student-document-label"><span>{label}</span><small>{form.documents?.[key]?._id ? 'Uploaded' : 'Optional'}</small></div>
                    <AttachmentField value={form.documents?.[key]} onChange={(value) => setDocument(key, value)}
                      scope="studentDocument" hostId={modal.data._id} documentType={key} />
                  </div>
                ))}
                {(form.parentIds || []).map((parentId) => {
                  const parent = parents.find((item) => item._id === parentId);
                  const key = `parentAadhaar_${parentId}`;
                  return (
                    <div className="student-document-card" key={key}>
                      <div className="student-document-label"><span>{parent?.name || 'Linked Parent'} Aadhaar Card</span><small>{parent?.relation || 'Parent / Guardian'}</small></div>
                      <AttachmentField value={form.documents?.[key]} onChange={(value) => setDocument(key, value)}
                        scope="studentDocument" hostId={modal.data._id} documentType="parentAadhaar" />
                    </div>
                  );
                })}
              </div>
              {!(form.parentIds || []).length && <p className="student-document-empty">Link a parent or guardian to this student to add their Aadhaar document.</p>}
            </div>
          )}
        </Modal>
      )}

      {/* ------- Login credentials (shown once after adding) ------- */}
      {modal?.type === 'credentials' && (
        <CredentialsModal credentials={modal.data} name={modal.name} onClose={() => setModal(null)} />
      )}

      {/* ------- View profile ------- */}
      {modal?.type === 'view' && (
        <Modal title={`${modal.data.firstName} ${modal.data.lastName}`} icon={Eye} onClose={() => setModal(null)}>
          <div className="form-grid">
            {[['Admission #', modal.data.admissionNo], ['Roll No', modal.data.rollNo], ['Gender', modal.data.gender],
              ['Date of Birth', modal.data.dob], ['Class', className(classes, modal.data.classId)], ['Status', modal.data.status],
              ['Nationality', modal.data.nationality], ['Curriculum', modal.data.curriculum], ['English Level', modal.data.englishLevel],
              ['House', modal.data.house], ['Languages', modal.data.languages], ['Admission Date', modal.data.admissionDate],
              ['Transport', modal.data.transportRequired ? `Yes — ${modal.data.transportRoute}` : 'No'],
              ['Allergies', modal.data.allergies || 'None'], ['Medical Notes', modal.data.medicalNotes || '—'],
              ['Father', modal.data.fatherName], ['Father Mobile', modal.data.fatherMobile],
              ['Mother', modal.data.motherName], ['Mother Mobile', modal.data.motherMobile],
              ['City', modal.data.city], ['State', modal.data.state], ['PIN Code', modal.data.pinCode],
              ['Address', modal.data.address],
            ].map(([k, v]) => (
              <div key={k} className="field"><label>{k}</label><div style={{ fontWeight: 600 }}>{v || '—'}</div></div>
            ))}
          </div>
        </Modal>
      )}

      {/* ------- Quick: Fees ------- */}
      {modal?.type === 'fees' && (() => {
        const student = modal.data.student || modal.student;
        const receipts = modal.data.receipts || [];
        const totalDemand = student.totalDemand || 0;
        const totalPaid = receipts.filter(r => r.status !== 'refunded').reduce((sum, r) => sum + (r.amountPaid || 0), 0);
        const outstanding = Math.max(0, totalDemand - totalPaid);
        
        const classNameLower = String(className(classes, student.classId) || '').toLowerCase();
        const isPP = isPrePrimaryClassName(classNameLower);
        const isP = !isPP && (classNameLower.includes('grade 1') || classNameLower.includes('class 1') || classNameLower.includes('grade 2') || classNameLower.includes('class 2') || classNameLower.includes('grade 3') || classNameLower.includes('class 3') || classNameLower.includes('grade 4') || classNameLower.includes('class 4') || classNameLower.includes('primary'));
        
        const hasAdmission = isPP
          || classNameLower.includes('grade 1') || classNameLower.includes('class 1')
          || classNameLower.includes('grade 5') || classNameLower.includes('class 5')
          || getAdmissionCategory(student) === 'NEW_ADMISSION';

        const isOld = classNameLower.includes('old') || classNameLower.includes('alumni') || classNameLower.includes('passed-out');
        const currentAssignment = student.feeAssignments && student.feeAssignments.length > 0
          ? student.feeAssignments[student.feeAssignments.length - 1]
          : null;

        const breakdownItems = [];
        let standardDemand = 0;
        
        if (!isOld) {
          if (currentAssignment && Array.isArray(currentAssignment.components) && currentAssignment.components.length > 0) {
            standardDemand = typeof currentAssignment.annualFee === 'number' ? currentAssignment.annualFee : 0;
            currentAssignment.components.forEach(comp => {
              let name = comp.name;
              if (name.includes(' (')) name = name.split(' (')[0];
              breakdownItems.push({ name, amount: comp.amount, frequency: comp.frequency });
            });
          } else {
            // Fallback if no database assignment is found
            if (isPP) {
              if (hasAdmission) breakdownItems.push({ name: 'Admission Fee', amount: 2000, frequency: 'one-time' });
              breakdownItems.push({ name: 'Monthly Fee', amount: 18000, frequency: 'monthly' });
              breakdownItems.push({ name: 'Term Fee', amount: 3000, frequency: 'annual' });
              breakdownItems.push({ name: 'MS Fee', amount: 2000, frequency: 'annual' });
              breakdownItems.push({ name: 'School Kit', amount: 4500, frequency: 'annual' });
              standardDemand = hasAdmission ? 29500 : 27500;
            } else if (isP) {
              if (hasAdmission) breakdownItems.push({ name: 'Admission Fee', amount: 2000, frequency: 'one-time' });
              breakdownItems.push({ name: 'Monthly Fee', amount: 18000, frequency: 'monthly' });
              breakdownItems.push({ name: 'Term Fee', amount: 3000, frequency: 'bi-annual' });
              breakdownItems.push({ name: 'MS Fee', amount: 2500, frequency: 'annual' });
              standardDemand = hasAdmission ? 25500 : 23500;
            } else {
              if (hasAdmission) breakdownItems.push({ name: 'Admission Fee', amount: 2200, frequency: 'one-time' });
              breakdownItems.push({ name: 'Monthly Fee', amount: 21600, frequency: 'monthly' });
              breakdownItems.push({ name: 'Term Fee', amount: 3600, frequency: 'bi-annual' });
              breakdownItems.push({ name: 'MS Fee', amount: 3600, frequency: 'annual' });
              standardDemand = hasAdmission ? 31000 : 28800;
            }
          }
        }
        
        const previousYearArrears = Math.max(0, totalDemand - standardDemand);

        if (previousYearArrears > 0) {
          breakdownItems.push({ name: 'Arrear Fees (Previous Year Balance)', amount: previousYearArrears, frequency: 'one-time' });
        }

        return (
          <Modal title={`Fee Summary — ${student.firstName} ${student.lastName}`} icon={Wallet} size="lg" onClose={() => setModal(null)}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, fontSize: 12 }}>
              <div>
                <p style={{ margin: 0, color: 'var(--txt-muted)' }}>Current Grade Rate</p>
                <b style={{ fontSize: 14 }}>{cur}{standardDemand.toLocaleString()}</b>
              </div>
              <div>
                <p style={{ margin: 0, color: 'var(--txt-muted)' }}>Previous Year Arrears</p>
                <b style={{ fontSize: 14, color: previousYearArrears > 0 ? 'var(--txt-orange)' : 'var(--txt-green)' }}>{cur}{previousYearArrears.toLocaleString()}</b>
              </div>
              <div>
                <p style={{ margin: 0, color: 'var(--txt-muted)' }}>Total Life Demand</p>
                <b style={{ fontSize: 14 }}>{cur}{totalDemand.toLocaleString()}</b>
              </div>
              <div>
                <p style={{ margin: 0, color: 'var(--txt-muted)' }}>Total Paid (Lifetime)</p>
                <b style={{ fontSize: 14, color: 'var(--txt-green)' }}>{cur}{totalPaid.toLocaleString()}</b>
              </div>
              <div>
                <p style={{ margin: 0, color: 'var(--txt-muted)' }}>Outstanding Balance</p>
                <b style={{ fontSize: 14, color: outstanding > 0 ? 'var(--txt-red)' : 'var(--txt-green)' }}>{cur}{outstanding.toLocaleString()}</b>
              </div>
            </div>

            <div className="student-finance-grid" style={{ display: 'grid', gap: 16, marginBottom: 16 }}>
              <div className="card-pad" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 8, color: 'var(--primary)' }}>Fee Breakdown Details</div>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <tbody>
                    {breakdownItems.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '4px 0', fontWeight: 600 }}>{item.name}</td>
                        <td style={{ padding: '4px 0', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{cur}{item.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 700 }}>
                      <td style={{ padding: '6px 0', color: 'var(--txt)' }}>Total Life Demand</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'monospace', color: 'var(--txt)', fontSize: 12 }}>{cur}{totalDemand.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div className="card-pad" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 8, color: 'var(--txt-green)' }}>Payment Allocation Summary</div>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '6px 0', fontWeight: 600 }}>Total Demand</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'monospace' }}>{cur}{totalDemand.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px 0', fontWeight: 600 }}>Total Paid (Lifetime)</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'monospace', color: 'var(--txt-green)' }}>{cur}{totalPaid.toLocaleString()}</td>
                    </tr>
                    <tr style={{ borderTop: '1px solid var(--border)', fontWeight: 700 }}>
                      <td style={{ padding: '8px 0', color: 'var(--txt-red)' }}>Outstanding Balance Due</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: 'monospace', color: 'var(--txt-red)', fontSize: 12 }}>{cur}{outstanding.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Transaction History (Receipts)</div>
            <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Receipt #</th><th>Date</th><th>Due</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {modal.data.receipts.length === 0 && <tr className="empty-row"><td colSpan={7}>No receipts yet</td></tr>}
              {modal.data.receipts.map((r) => (
                <tr key={r._id}>
                  <td className="mono">{r.receiptNo}</td><td>{r.date}</td>
                  <td>{cur}{r.amountDue?.toLocaleString()}</td><td>{cur}{r.amountPaid?.toLocaleString()}</td>
                  <td className={r.balance > 0 ? 'txt-red' : 'txt-green'}>{cur}{r.balance?.toLocaleString()}</td>
                  <td><Badge value={r.status} /></td>
                  <td>
                    <button className="btn btn-navy" style={{ padding: '2px 6px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => printReceipt(r)}>
                      <Printer size={12} /> Print
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            </div>
        </Modal>
      );
    })()}

      {/* ------- Quick: Attendance ------- */}
      {modal?.type === 'attendance' && (
        <Modal title={`Attendance — ${modal.student.firstName} ${modal.student.lastName}`} icon={CalendarCheck} onClose={() => setModal(null)}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {Object.entries(modal.data.summary).map(([k, v]) => <Badge key={k} value={`${k}: ${v}`} color={{ present: 'bg-green', absent: 'bg-red', late: 'bg-yellow', halfday: 'bg-blue', leave: 'bg-purple' }[k]} />)}
          </div>
          <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {modal.data.records.slice(0, 30).map((r, i) => (
                <tr key={i}><td>{r.date}</td><td><Badge value={r.status} /></td></tr>
              ))}
            </tbody>
          </table>
          </div>
        </Modal>
      )}

      {/* ------- Quick: Results ------- */}
      {modal?.type === 'results' && (
        <Modal title={`Results — ${modal.student.firstName} ${modal.student.lastName}`} icon={Award} size="lg" onClose={() => setModal(null)}
          footer={modal.data.results.length > 0 && (
            <button className="btn btn-navy" onClick={() => setModal({ ...modal, type: 'reportcard' })}>
              <FileText size={15} /> Print Report Card
            </button>
          )}>
          <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Exam</th><th>Subject</th><th>Marks</th><th>Grade</th><th>Sheet Status</th></tr></thead>
            <tbody>
              {modal.data.results.length === 0 && <tr className="empty-row"><td colSpan={5}>No results yet</td></tr>}
              {modal.data.results.map((r, i) => (
                <tr key={i}>
                  <td>{r.examName}</td><td>{r.subject}</td>
                  <td><b>{r.marks ?? '—'}</b> / {r.maxMarks}</td>
                  <td><Badge value={r.grade} color={r.grade === 'F' ? 'bg-red' : 'bg-green'} /></td>
                  <td><Badge value={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Modal>
      )}

      {/* ------- Printable report card ------- */}
      {modal?.type === 'reportcard' && (() => {
        const s = modal.student;
        const byExam = {};
        for (const r of modal.data.results) (byExam[r.examName] = byExam[r.examName] || []).push(r);
        return (
          <Modal title="Report Card" icon={FileText} size="lg" onClose={() => setModal(null)}
            footer={<>
              <button className="btn btn-gray" onClick={() => setModal(null)}>Close</button>
              <button className="btn btn-navy" onClick={() => window.print()}><Printer size={15} /> Print A4</button>
            </>}>
            <div className="doc-a4 print-area">
              <div style={{ textAlign: 'center' }}>
                <h1>{settings.schoolName}</h1>
                <div className="small">{settings.address} · {settings.phone}</div>
              </div>
              <div className="band">STUDENT REPORT CARD — {settings.academicYear}</div>
              <table style={{ marginBottom: 16 }}>
                <tbody>
                  <tr>
                    <td><b>Name:</b> {s.firstName} {s.lastName}</td>
                    <td><b>Admission #:</b> {s.admissionNo}</td>
                  </tr>
                  <tr>
                    <td><b>Class:</b> {className(classes, s.classId)}</td>
                    <td><b>Roll No:</b> {s.rollNo || '—'}</td>
                  </tr>
                </tbody>
              </table>
              {Object.entries(byExam).map(([exam, results]) => {
                const total = results.reduce((t, r) => t + (r.marks || 0), 0);
                const max = results.reduce((t, r) => t + (r.maxMarks || 0), 0);
                const pct = max ? Math.round((total / max) * 1000) / 10 : 0;
                return (
                  <div key={exam} style={{ marginBottom: 18 }}>
                    <h3 style={{ margin: '10px 0 6px' }}>{exam}</h3>
                    <table className="lines">
                      <thead><tr><th>Subject</th><th>Marks Obtained</th><th>Max Marks</th><th>Grade</th></tr></thead>
                      <tbody>
                        {results.map((r, i) => (
                          <tr key={i}><td>{r.subject}</td><td>{r.marks ?? '—'}</td><td>{r.maxMarks}</td><td><b>{r.grade || '—'}</b></td></tr>
                        ))}
                        <tr style={{ fontWeight: 700 }}>
                          <td>Total</td><td>{total}</td><td>{max}</td><td>{pct}%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })}
              <div className="sig-row">
                <span>Class Teacher</span>
                <span>Parent / Guardian</span>
                <span>Principal</span>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ------- Student ID card ------- */}
      {modal?.type === 'idcard' && (() => {
        const s = modal.data;
        return (
          <Modal title={`ID Card — ${s.firstName} ${s.lastName}`} icon={CreditCard} onClose={() => setModal(null)}
            footer={<>
              <button className="btn btn-gray" onClick={() => setModal(null)}>Close</button>
              <button className="btn btn-navy" onClick={() => window.print()}><Printer size={15} /> Print</button>
            </>}>
            <div className="print-area" style={{ padding: '10px 0' }}>
              <div className="id-card">
                <div className="idc-head">
                  <GraduationCap size={30} />
                  <div>
                    <div className="sch">{settings.schoolName}</div>
                    <div className="tag">STUDENT IDENTITY CARD · {settings.academicYear}</div>
                  </div>
                </div>
                <div className="idc-body">
                  <div className={`idc-photo ${s.profilePhoto?._id ? 'has-photo' : ''}`} style={{ background: HOUSE_HEX[s.house] || 'var(--primary)' }}>
                    {s.profilePhoto?._id
                      ? <AttachmentImage attachment={s.profilePhoto} alt={`${s.firstName} ${s.lastName}`} />
                      : <>{s.firstName[0]}{(s.lastName || ' ')[0]}</>}
                  </div>
                  <table>
                    <tbody>
                      <tr><td>Name</td><td><b>{s.firstName} {s.lastName}</b></td></tr>
                      <tr><td>Class</td><td>{className(classes, s.classId)}</td></tr>
                      <tr><td>Roll No</td><td>{s.rollNo || '—'}</td></tr>
                      <tr><td>House</td><td>{s.house}</td></tr>
                      <tr><td>DOB</td><td>{s.dob || '—'}</td></tr>
                      <tr><td>Blood / Allergy</td><td>{s.allergies ? `⚠ ${s.allergies}` : 'None'}</td></tr>
                    </tbody>
                  </table>
                </div>
                <Barcode code={s.admissionNo} />
                <div className="idc-no">{s.admissionNo}</div>
                <div className="idc-strip" style={{ background: HOUSE_HEX[s.house] || 'var(--primary)' }} />
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ------- Quick: Parents ------- */}
      {modal?.type === 'parents' && (
        <Modal title={`Linked Parents — ${modal.student.firstName} ${modal.student.lastName}`} icon={UsersRound} onClose={() => setModal(null)}>
          {modal.data.length === 0 && <p className="muted">No parents linked.</p>}
          {modal.data.map((p) => (
            <div key={p._id} className="card card-pad mb" style={{ border: '1px solid var(--border)', boxShadow: 'none' }}>
              <b>{p.name}</b> <Badge value={p.relation} color="bg-blue" />
              <div className="small muted mt" style={{ marginTop: 6 }}>{p.mobile} · {p.email || 'no email'} · {p.occupation || '—'}</div>
            </div>
          ))}
        </Modal>
      )}

      {confirmDel && (
        <Confirm message={`Delete student "${confirmDel.firstName} ${confirmDel.lastName}" (${confirmDel.admissionNo})? This also removes their login.`}
          onNo={() => setConfirmDel(null)}
          onYes={async () => {
            try { await api.delete(`/students/${confirmDel._id}`); notify('Student deleted'); load(); }
            catch (e) { notify(errMsg(e), 'error'); }
            setConfirmDel(null);
          }} />
      )}
    </>
  );
}
