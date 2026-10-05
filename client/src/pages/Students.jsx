import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  GraduationCap, Plus, Eye, Wallet, CalendarCheck, Award, UsersRound, Pencil, Trash2,
  CreditCard, Printer, FileText, Receipt, Camera, FolderLock, MapPin, Phone, ShieldCheck,
  HeartPulse, User, BookOpen, Trophy, CheckCircle2, XCircle, ArrowLeft, Edit3, Check, X,
} from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups, className } from '../hooks/useLookups';
import { DataTable, StatusTabs, FilterBar, Field, Modal, Badge, Confirm, CredentialsModal } from '../components/ui';
import { AttachmentField, AttachmentImage, AttachmentLink } from '../components/Attachment';
import { displayClassName, formatClass, isPrePrimaryClassName } from '../utils/classNames';
import { MyAttendanceCard } from './Portal';

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
  firstName: '', lastName: '', gender: 'Male', dob: '', nationality: '', curriculum: 'State Board',
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
  const [modal, setModal] = useState(null); // {type: 'form'|'fees'|'attendance'|'results'|'parents'|'view'|'idcard'|'class-idcards', data, fromView}
  const [idSide, setIdSide] = useState('both'); // 'both' | 'front' | 'back'
  const [classCardsClassId, setClassCardsClassId] = useState('');
  const [profileTab, setProfileTab] = useState('overview');
  const [form, setForm] = useState(EMPTY);
  const [formTab, setFormTab] = useState('details');
  const [feePreview, setFeePreview] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [params] = useSearchParams();
  const canWrite = ['admin', 'clerk', 'supervisor'].includes(user?.role);

  const [isEditingStudentFees, setIsEditingStudentFees] = useState(false);
  const [editableStudentComponents, setEditableStudentComponents] = useState([]);
  const [editableStudentArrears, setEditableStudentArrears] = useState(0);
  const [editableStudentRemainingBalance, setEditableStudentRemainingBalance] = useState(0);
  const [editableStudentRemarks, setEditableStudentRemarks] = useState('');
  const [savingStudentFeeAdjustment, setSavingStudentFeeAdjustment] = useState(false);

  const startEditingStudentFeeStructure = (breakdownItems, totalDemand, standardDemand, previousYearArrears, totalPaid) => {
    const regular = [];
    for (const item of breakdownItems) {
      if (!item.name.toLowerCase().includes('arrear') && !item.name.toLowerCase().includes('previous') && !item.name.toLowerCase().includes('old balance')) {
        regular.push({
          name: item.name,
          frequency: item.frequency || 'annual',
          amount: Number(item.amount || 0),
        });
      }
    }
    const arrearsVal = Number(previousYearArrears || 0);
    const balVal = Math.max(0, Number(totalDemand || 0) - Number(totalPaid || 0));

    setEditableStudentComponents(regular);
    setEditableStudentArrears(arrearsVal);
    setEditableStudentRemainingBalance(balVal);
    setEditableStudentRemarks('');
    setIsEditingStudentFees(true);
  };

  const cancelEditingStudentFeeStructure = () => {
    setIsEditingStudentFees(false);
  };

  const handleStudentComponentAmountChange = (idx, newAmount, totalPaid) => {
    const amountVal = Math.max(0, Number(newAmount) || 0);
    const updated = editableStudentComponents.map((c, i) => (i === idx ? { ...c, amount: amountVal } : c));
    setEditableStudentComponents(updated);
    const standardSum = updated.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const newBal = Math.max(0, standardSum + Number(editableStudentArrears || 0) - Number(totalPaid || 0));
    setEditableStudentRemainingBalance(newBal);
  };

  const handleStudentComponentNameChange = (idx, newName) => {
    setEditableStudentComponents((prev) => prev.map((c, i) => (i === idx ? { ...c, name: newName } : c)));
  };

  const handleStudentComponentFrequencyChange = (idx, newFreq) => {
    setEditableStudentComponents((prev) => prev.map((c, i) => (i === idx ? { ...c, frequency: newFreq } : c)));
  };

  const handleAddStudentComponent = () => {
    setEditableStudentComponents((prev) => [...prev, { name: 'Other Fee', frequency: 'annual', amount: 0 }]);
  };

  const handleRemoveStudentComponent = (idx, totalPaid) => {
    const updated = editableStudentComponents.filter((_, i) => i !== idx);
    setEditableStudentComponents(updated);
    const standardSum = updated.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const newBal = Math.max(0, standardSum + Number(editableStudentArrears || 0) - Number(totalPaid || 0));
    setEditableStudentRemainingBalance(newBal);
  };

  const handleStudentArrearsChange = (newArrearsVal, totalPaid) => {
    const arrVal = Math.max(0, Number(newArrearsVal) || 0);
    setEditableStudentArrears(arrVal);
    const standardSum = editableStudentComponents.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const newBal = Math.max(0, standardSum + arrVal - Number(totalPaid || 0));
    setEditableStudentRemainingBalance(newBal);
  };

  const handleStudentRemainingBalanceChange = (newBalVal, totalPaid) => {
    const balVal = Math.max(0, Number(newBalVal) || 0);
    setEditableStudentRemainingBalance(balVal);
    const standardSum = editableStudentComponents.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const neededArrears = Math.max(0, balVal + Number(totalPaid || 0) - standardSum);
    setEditableStudentArrears(neededArrears);
  };

  const saveStudentFeeAdjustment = async (studentId) => {
    if (!studentId) return;
    setSavingStudentFeeAdjustment(true);
    try {
      const payload = {
        components: editableStudentComponents,
        previousYearArrears: Number(editableStudentArrears) || 0,
        remainingBalance: Number(editableStudentRemainingBalance) || 0,
        remarks: editableStudentRemarks.trim() || 'Fee structure & balances manually adjusted in Students module',
      };
      const { data } = await api.put(`/fees/student/${studentId}/adjust-structure`, payload);
      notify('Student fee structure and remaining balance updated successfully');
      setIsEditingStudentFees(false);
      if (modal?.data) {
        setModal((prev) => ({
          ...prev,
          data: {
            ...prev.data,
            student: data.student || { ...prev.data.student, totalDemand: data.totalDemand, outstanding: data.outstanding },
          },
        }));
      }
      load();
    } catch (e) {
      notify(errMsg(e), 'error');
    } finally {
      setSavingStudentFeeAdjustment(false);
    }
  };

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
      const isGrade1 = /\b(grade|class)\s*1\b/i.test(name);
      const isGrade2to4 = /\b(grade|class)\s*[2-4]\b/i.test(name);
      const isGrade5 = /\b(grade|class)\s*5\b/i.test(name);

      let standardDemand = 23500;
      if (isPrePrimaryClassName(name)) {
        standardDemand = 29500;
      } else if (isGrade1) {
        standardDemand = 25500;
      } else if (isGrade2to4) {
        standardDemand = 23500;
      } else if (isGrade5) {
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

  const printStudentIdCards = (studentsList, side = 'both') => {
    if (!studentsList || studentsList.length === 0) return;
    const logoSrc = settings.logoUrl || '/logo.jpeg';
    const schoolName = settings.schoolName || 'M.V HIGH SCHOOL';
    const schoolAddress = settings.address || 'Prarthna Samaj, Opera House, Mumbai - 400004';
    const ay = settings.academicYear || '2026-27';
    const phone = settings.phone || '022 2386 5845';

    const w = window.open('', '_blank');
    if (!w) {
      notify('Pop-up blocked! Please allow pop-ups to print ID cards.', 'error');
      return;
    }

    const cardsHtml = studentsList.map((s) => {
      const clsName = className(classes, s.classId);
      const contactNo = s.fatherMobile || s.motherMobile || s.parentMobile || phone;
      const fullAddress = s.address || [s.addressLine1, s.addressLine2, s.city || 'Mumbai', s.pinCode ? `PIN: ${s.pinCode}` : ''].filter(Boolean).join(', ') || 'Mumbai, Maharashtra';
      const studentPhotoUrl = s.profilePhoto?._id
        ? `/api/attachments/${s.profilePhoto._id}`
        : s.documents?.profilePhoto?._id
        ? `/api/attachments/${s.documents.profilePhoto._id}`
        : '';
      const initials = `${s.firstName?.[0] || 'S'}${(s.lastName || ' ')[0]}`;

      const frontHtml = `
        <div class="official-id-card id-card-front">
          <div class="id-card-header">
            <img src="${logoSrc}" alt="Logo" class="id-school-logo" />
            <div class="id-header-text">
              <h4 class="id-school-name">${escapeReceiptText(schoolName)}</h4>
              <p class="id-school-sub">${escapeReceiptText(schoolAddress)}</p>
            </div>
            <span class="id-ay-tag">${escapeReceiptText(ay)}</span>
          </div>

          <div class="id-card-body">
            <div class="id-photo-col">
              <div class="id-photo-box">
                ${studentPhotoUrl 
                  ? `<img src="${studentPhotoUrl}" alt="Photo" />` 
                  : `<div class="id-photo-placeholder">${initials}</div>`}
              </div>
              <span class="id-adm-badge">ADM #${s.admissionNo}</span>
            </div>

            <div class="id-details-col">
              <h3 class="id-student-name">${escapeReceiptText(s.firstName)} ${escapeReceiptText(s.lastName || '')}</h3>
              <table class="id-details-table">
                <tbody>
                  <tr>
                    <td class="lbl">Class & Div</td>
                    <td class="colon">:</td>
                    <td class="val"><b>${escapeReceiptText(clsName || '8th')}</b> ${s.division ? `(Div ${s.division})` : ''}</td>
                  </tr>
                  <tr>
                    <td class="lbl">Roll No</td>
                    <td class="colon">:</td>
                    <td class="val">${s.rollNo || '—'}</td>
                  </tr>
                  <tr>
                    <td class="lbl">Date of Birth</td>
                    <td class="colon">:</td>
                    <td class="val">${s.dob || '—'}</td>
                  </tr>
                  <tr>
                    <td class="lbl">Parent Name</td>
                    <td class="colon">:</td>
                    <td class="val">${escapeReceiptText(s.fatherName || s.motherName || s.parentName || '—')}</td>
                  </tr>
                  <tr>
                    <td class="lbl">Blood Group</td>
                    <td class="colon">:</td>
                    <td class="val">${s.bloodGroup || (s.allergies ? `⚠ ${s.allergies}` : '—')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="id-card-footer">
            <div class="id-footer-meta">
              <span>STUDENT IDENTITY CARD</span>
            </div>
            <div class="id-principal-sign">
              <span class="id-sign-script">Sarita Gomes</span>
              <span class="id-sign-title">Principal Sign</span>
            </div>
          </div>
        </div>
      `;

      const backHtml = `
        <div class="official-id-card id-card-back">
          <div class="id-card-header">
            <h4 class="id-back-title">Emergency Info & Guidelines</h4>
            <span class="id-ay-tag">Cardholder</span>
          </div>

          <div class="id-back-body">
            <div class="id-back-contact-box">
              <div class="id-back-row">
                <span class="id-back-icon-pill phone">📞</span>
                <span><b>Emergency:</b> ${escapeReceiptText(contactNo)}</span>
              </div>
              <div class="id-back-row">
                <span class="id-back-icon-pill blood">🩸</span>
                <span><b>Blood Group:</b> ${escapeReceiptText(s.bloodGroup || '—')}</span>
              </div>
              <div class="id-back-address-card">
                <b>Residential Address:</b>
                <div>${escapeReceiptText(fullAddress)}</div>
              </div>
            </div>

            <div class="id-back-rules-col">
              <div class="id-rules-title">Campus Regulations</div>
              <ol class="id-rules-list">
                <li>Card must be worn in campus at all times.</li>
                <li>Mandatory for exams, lab & library access.</li>
                <li>Report loss of card immediately to administration.</li>
                <li>Non-transferable identity credential.</li>
              </ol>
            </div>
          </div>

          <div class="id-card-footer">
            If found, please return to school office • Tel: ${escapeReceiptText(phone)}
          </div>
        </div>
      `;

      return `
        <div class="card-pair-wrapper">
          ${(side === 'both' || side === 'front') ? frontHtml : ''}
          ${(side === 'both' || side === 'back') ? backHtml : ''}
        </div>
      `;
    }).join('');

    w.document.write(`<!DOCTYPE html><html><head><title>ID Cards Print - ${studentsList.length} Students</title>
      <meta charset="utf-8" />
      <style>
        @page {
          size: A4 portrait;
          margin: 10mm 8mm;
        }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          margin: 0; padding: 10px; background: #fff; color: #0f172a;
        }
        .print-cards-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          justify-content: flex-start;
          align-content: flex-start;
        }
        .card-pair-wrapper {
          display: flex;
          gap: 8px;
          page-break-inside: avoid;
          break-inside: avoid;
          margin-bottom: 8px;
        }
        .official-id-card {
          width: 330px;
          height: 205px;
          background: #ffffff;
          border: 1px solid #94a3b8;
          border-radius: 8px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          position: relative;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .id-card-front {
          border-top: 3.5px solid #0f2248;
        }
        .id-card-header {
          background: #0f2248 !important;
          color: #ffffff !important;
          padding: 6px 10px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .id-school-logo {
          width: 28px;
          height: 28px;
          border-radius: 4px;
          object-fit: contain;
          background: #ffffff;
          padding: 1px;
        }
        .id-header-text {
          flex: 1;
          min-width: 0;
        }
        .id-school-name {
          font-size: 11px;
          font-weight: 800;
          color: #ffffff !important;
          margin: 0;
          line-height: 1.15;
          text-transform: uppercase;
        }
        .id-school-sub {
          font-size: 7px;
          color: #93c5fd !important;
          margin: 1px 0 0;
        }
        .id-ay-tag {
          background: rgba(255,255,255,0.2) !important;
          border: 1px solid rgba(255,255,255,0.4);
          color: #ffffff !important;
          font-size: 8px;
          font-weight: 800;
          padding: 1px 5px;
          border-radius: 3px;
        }
        .id-card-body {
          display: flex;
          gap: 10px;
          padding: 8px 10px 4px;
          flex: 1;
          align-items: center;
        }
        .id-photo-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          flex-shrink: 0;
        }
        .id-photo-box {
          width: 66px;
          height: 78px;
          border: 1.5px solid #0f2248;
          border-radius: 5px;
          overflow: hidden;
          background: #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .id-photo-box img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .id-photo-placeholder {
          font-size: 20px;
          font-weight: 800;
          color: #0f2248;
        }
        .id-adm-badge {
          font-size: 7.5px;
          font-family: monospace;
          font-weight: 800;
          color: #0f2248;
          background: #e2e8f0;
          padding: 1px 4px;
          border-radius: 2px;
        }
        .id-details-col {
          flex: 1;
          min-width: 0;
        }
        .id-student-name {
          font-size: 12px;
          font-weight: 900;
          color: #0f2248;
          text-transform: uppercase;
          margin: 0 0 3px;
          line-height: 1.15;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .id-details-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 8.5px;
          line-height: 1.3;
        }
        .id-details-table td {
          padding: 0.5px 0;
        }
        .id-details-table td.lbl {
          color: #475569;
          font-weight: 700;
          width: 32%;
        }
        .id-details-table td.colon {
          width: 6px;
          font-weight: 700;
          color: #475569;
        }
        .id-details-table td.val {
          color: #0f172a;
          font-weight: 800;
          text-transform: uppercase;
        }
        .id-card-footer {
          margin-top: auto;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          padding: 3px 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .id-footer-meta {
          font-size: 7px;
          font-weight: 800;
          color: #475569;
        }
        .id-principal-sign {
          text-align: right;
        }
        .id-sign-script {
          font-family: 'Brush Script MT', 'Dancing Script', cursive;
          font-size: 12px;
          color: #0f2248;
          display: block;
        }
        .id-sign-title {
          font-size: 6px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          display: block;
        }
        .id-card-back {
          border-top: 3.5px solid #0f2248;
        }
        .id-back-title {
          font-size: 8.5px;
          font-weight: 800;
          color: #ffffff !important;
          margin: 0;
        }
        .id-back-body {
          padding: 6px 10px;
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 1.1fr;
          gap: 8px;
        }
        .id-back-contact-box {
          display: flex;
          flex-direction: column;
          gap: 4px;
          justify-content: center;
        }
        .id-back-row {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 8px;
          color: #0f172a;
        }
        .id-back-icon-pill {
          font-size: 9px;
        }
        .id-back-address-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 4px 6px;
          font-size: 7.5px;
          line-height: 1.25;
          color: #334155;
        }
        .id-back-address-card b {
          display: block;
          color: #0f2248;
          margin-bottom: 1px;
        }
        .id-back-rules-col {
          border-left: 1px solid #e2e8f0;
          padding-left: 8px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .id-rules-title {
          font-size: 8px;
          font-weight: 800;
          color: #0f2248;
          margin-bottom: 2px;
          text-transform: uppercase;
        }
        .id-rules-list {
          margin: 0;
          padding-left: 10px;
          font-size: 7px;
          line-height: 1.3;
          color: #475569;
        }
        .id-card-back .id-card-footer {
          background: #0f2248 !important;
          color: #93c5fd !important;
          font-size: 6.5px;
          justify-content: center;
        }
      </style>
    </head><body>
      <div class="print-cards-grid">
        ${cardsHtml}
      </div>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  };

  const openQuick = async (type, r, fromView = false) => {
    try {
      const { data } = await api.get(`/students/${r._id}/${type}`);
      setModal({ type, data, student: r, fromView });
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
        <button className="btn btn-navy" onClick={() => {
          setClassCardsClassId(filters.classId || classes[0]?._id || '');
          setModal({ type: 'class-idcards' });
        }}>
          <CreditCard size={15} /> Class ID Cards
        </button>
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

      {/* ------- Revamped 360 View Profile ------- */}
      {modal?.type === 'view' && (() => {
        const s = modal.data;
        const studentPhoto = s.profilePhoto?._id ? s.profilePhoto : (s.documents?.profilePhoto?._id ? s.documents.profilePhoto : null);
        const docsList = Object.entries(s.documents || {}).filter(([k, v]) => v?._id);

        return (
          <Modal title={`Student Profile 360 — ${s.firstName} ${s.lastName || ''}`} icon={Eye} size="lg" onClose={() => setModal(null)}>
            <div className="student-profile-view">
              {/* Cover Banner */}
              <div className="spv-banner">
                <div className="spv-hero">
                  <div className="spv-photo-frame">
                    {studentPhoto ? (
                      <AttachmentImage attachment={studentPhoto} alt={`${s.firstName} ${s.lastName}`} />
                    ) : (
                      <div className="spv-photo-placeholder">
                        <Camera size={26} opacity={0.7} />
                        <span>{s.firstName?.[0] || 'S'}{(s.lastName || ' ')[0]}</span>
                      </div>
                    )}
                  </div>
                  <div className="spv-info">
                    <h3>{s.firstName} {s.lastName || ''}</h3>
                    <div className="spv-sub">
                      <span><b>Adm:</b> <code style={{ color: '#fff' }}>{s.admissionNo}</code></span>
                      <span>•</span>
                      <span><b>Roll:</b> {s.rollNo || '—'}</span>
                      <span>•</span>
                      <span><b>Class:</b> {displayClassName(className(classes, s.classId))}</span>
                    </div>
                    <div className="spv-badges">
                      <span className="spv-badge">{s.status || 'Active'}</span>
                      <span className="spv-badge" style={{ background: 'rgba(16,185,129,0.3)' }}>{s.curriculum || 'State Board'}</span>
                      {s.gender && <span className="spv-badge">{s.gender}</span>}
                      {s.house && <span className="spv-badge" style={{ background: HOUSE_HEX[s.house] || 'rgba(255,255,255,0.2)' }}>{s.house} House</span>}
                    </div>
                  </div>
                </div>

                {/* Quick Action Shortcuts inside the View Modal */}
                <div className="spv-actions">
                  <button type="button" className="spv-btn spv-btn-primary" title="Collect Fees" onClick={() => { setModal(null); navigate(`/fees?add=true&studentId=${s._id}`); }}>
                    <Wallet size={14} /> Collect Fee
                  </button>
                  <button type="button" className="spv-btn" title="Fee History" onClick={() => openQuick('fees', s, true)}>
                    <Receipt size={14} /> Fee History
                  </button>
                  <button type="button" className="spv-btn" title="Attendance Records" onClick={() => openQuick('attendance', s, true)}>
                    <CalendarCheck size={14} /> Attendance
                  </button>
                  <button type="button" className="spv-btn" title="Marks & Report Card" onClick={() => openQuick('results', s, true)}>
                    <Award size={14} /> Results
                  </button>
                  <button type="button" className="spv-btn" title="View & Print ID Card" onClick={() => setModal({ type: 'idcard', data: s, fromView: true })}>
                    <CreditCard size={14} /> ID Card
                  </button>
                  {canWrite && (
                    <button type="button" className="spv-btn" title="Edit Student Record" onClick={() => openEdit(s)}>
                      <Pencil size={14} /> Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Sub-Tabs */}
              <div className="spv-tabs">
                <button type="button" className={`spv-tab ${profileTab === 'overview' ? 'active' : ''}`} onClick={() => setProfileTab('overview')}>
                  <User size={14} /> Academic & Personal
                </button>
                <button type="button" className={`spv-tab ${profileTab === 'parents' ? 'active' : ''}`} onClick={() => setProfileTab('parents')}>
                  <UsersRound size={14} /> Family & Contacts
                </button>
                <button type="button" className={`spv-tab ${profileTab === 'transport' ? 'active' : ''}`} onClick={() => setProfileTab('transport')}>
                  <HeartPulse size={14} /> Medical & Transport
                </button>
                <button type="button" className={`spv-tab ${profileTab === 'documents' ? 'active' : ''}`} onClick={() => setProfileTab('documents')}>
                  <FolderLock size={14} /> Vault & Documents ({docsList.length + (studentPhoto ? 1 : 0)})
                </button>
              </div>

              {/* Tab 1: Overview */}
              {profileTab === 'overview' && (
                <div className="spv-panel">
                  <div className="spv-grid">
                    <div className="spv-card"><span className="spv-card-label">Admission Number</span><span className="spv-card-val mono">{s.admissionNo || '—'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">Roll Number</span><span className="spv-card-val">{s.rollNo || '—'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">Class & Division</span><span className="spv-card-val">{className(classes, s.classId) || '—'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">Curriculum / Board</span><span className="spv-card-val">{s.curriculum || 'State Board'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">Date of Birth</span><span className="spv-card-val">{s.dob || '—'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">Gender</span><span className="spv-card-val">{s.gender || '—'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">Nationality</span><span className="spv-card-val">{s.nationality || 'Indian'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">English Level (EAL)</span><span className="spv-card-val">{s.englishLevel || '—'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">House</span><span className="spv-card-val">{s.house || '—'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">Languages Known</span><span className="spv-card-val">{s.languages || '—'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">Admission Date</span><span className="spv-card-val">{s.admissionDate || '—'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">Account Status</span><span className="spv-card-val" style={{ textTransform: 'capitalize' }}>{s.status || 'Active'}</span></div>
                  </div>
                </div>
              )}

              {/* Tab 2: Parents & Contacts */}
              {profileTab === 'parents' && (
                <div className="spv-panel">
                  <div className="spv-grid">
                    <div className="spv-card"><span className="spv-card-label">Father's Name</span><span className="spv-card-val">{s.fatherName || s.parentName || '—'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">Father's Contact</span><span className="spv-card-val">{s.fatherMobile || s.parentMobile || '—'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">Mother's Name</span><span className="spv-card-val">{s.motherName || '—'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">Mother's Contact</span><span className="spv-card-val">{s.motherMobile || '—'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">Parent / Guardian Email</span><span className="spv-card-val">{s.parentEmail || s.fatherEmail || s.motherEmail || '—'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">City</span><span className="spv-card-val">{s.city || 'Mumbai'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">State</span><span className="spv-card-val">{s.state || 'Maharashtra'}</span></div>
                    <div className="spv-card"><span className="spv-card-label">PIN Code</span><span className="spv-card-val">{s.pinCode || '—'}</span></div>
                    <div className="spv-card" style={{ gridColumn: '1 / -1' }}><span className="spv-card-label">Residential Address</span><span className="spv-card-val">{s.address || '—'}</span></div>
                  </div>
                </div>
              )}

              {/* Tab 3: Medical & Transport */}
              {profileTab === 'transport' && (
                <div className="spv-panel">
                  <div className="spv-grid">
                    <div className="spv-card">
                      <span className="spv-card-label">Allergies / Special Conditions</span>
                      <span className="spv-card-val" style={{ color: s.allergies ? 'var(--danger)' : 'inherit' }}>
                        {s.allergies ? `⚠ ${s.allergies}` : 'None reported'}
                      </span>
                    </div>
                    <div className="spv-card">
                      <span className="spv-card-label">Medical Notes</span>
                      <span className="spv-card-val">{s.medicalNotes || 'No special medical conditions recorded'}</span>
                    </div>
                    <div className="spv-card">
                      <span className="spv-card-label">School Transport Service</span>
                      <span className="spv-card-val">{s.transportRequired ? 'Opted for School Bus' : 'Self / Not Required'}</span>
                    </div>
                    <div className="spv-card">
                      <span className="spv-card-label">Transport Route / Stop</span>
                      <span className="spv-card-val">{s.transportRoute || '—'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Vault & Documents */}
              {profileTab === 'documents' && (
                <div className="spv-panel">
                  <div className="spv-doc-grid">
                    {/* Profile Photo Entry */}
                    <div className="spv-doc-item">
                      <div>
                        <div className="spv-doc-title">Student Photograph</div>
                        <div className="spv-doc-status">{studentPhoto ? 'Photo Uploaded' : 'Not Uploaded'}</div>
                      </div>
                      {studentPhoto ? <AttachmentLink attachment={studentPhoto} /> : <span className="small muted">None</span>}
                    </div>

                    {/* Standard Student Documents */}
                    {STUDENT_DOCUMENTS.map(([key, label]) => {
                      const doc = s.documents?.[key];
                      return (
                        <div className="spv-doc-item" key={key}>
                          <div>
                            <div className="spv-doc-title">{label}</div>
                            <div className="spv-doc-status">{doc?._id ? `${doc.fileType || 'File'} • ${doc.fileName || 'Attached'}` : 'Not provided'}</div>
                          </div>
                          {doc?._id ? <AttachmentLink attachment={doc} /> : <span className="small muted">—</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </Modal>
        );
      })()}

      {/* ------- Quick: Fees ------- */}
      {modal?.type === 'fees' && (() => {
        const student = modal.data.student || modal.student;
        const receipts = modal.data.receipts || [];
        const totalDemand = student.totalDemand || 0;
        const totalPaid = receipts.filter(r => r.status !== 'refunded').reduce((sum, r) => sum + (r.amountPaid || 0), 0);
        const outstanding = Math.max(0, totalDemand - totalPaid);
        
        const classNameLower = String(className(classes, student.classId) || '').toLowerCase();
        const isPP = isPrePrimaryClassName(classNameLower);
        const isGrade1 = /\b(grade|class)\s*1\b/i.test(classNameLower);
        const isGrade2to4 = /\b(grade|class)\s*[2-4]\b/i.test(classNameLower);
        const isGrade5 = /\b(grade|class)\s*5\b/i.test(classNameLower);
        const isP = !isPP && (isGrade1 || isGrade2to4 || classNameLower.includes('primary'));
        
        const hasAdmission = isPP
          || isGrade1
          || isGrade5
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
          <Modal
            title={`Fee Summary — ${student.firstName} ${student.lastName}`}
            icon={Wallet}
            size="lg"
            onClose={() => setModal(null)}
            onBack={modal.fromView ? () => setModal({ type: 'view', data: modal.student || student }) : null}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt-muted)' }}>Financial Summary & Dues</div>
              {!isEditingStudentFees && canWrite && (
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'rgba(37,99,235,0.08)',
                    color: 'var(--primary)',
                    border: '1px solid rgba(37,99,235,0.25)',
                    borderRadius: 6,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  onClick={() => startEditingStudentFeeStructure(breakdownItems, totalDemand, standardDemand, previousYearArrears, totalPaid)}
                >
                  <Edit3 size={13} /> Edit Fees & Remaining Balance
                </button>
              )}
            </div>

            {isEditingStudentFees && (
              <div className="full" style={{ background: 'var(--bg-card)', border: '1.5px dashed var(--primary)', borderRadius: 10, padding: 16, marginBottom: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Edit3 size={15} /> Edit Student Fees, Old Balance & Remaining Balance
                  </div>
                  <button
                    type="button"
                    className="btn btn-xs"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(37,99,235,0.1)', color: 'var(--primary)', border: '1px solid rgba(37,99,235,0.25)', borderRadius: 6, fontWeight: 600, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}
                    onClick={handleAddStudentComponent}
                  >
                    <Plus size={12} /> Add Fee Head
                  </button>
                </div>

                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--txt-muted)' }}>
                      <th style={{ textAlign: 'left', paddingBottom: 6 }}>Fee Component</th>
                      <th style={{ textAlign: 'center', paddingBottom: 6, width: 120 }}>Frequency</th>
                      <th style={{ textAlign: 'right', paddingBottom: 6, width: 130 }}>Amount (₹)</th>
                      <th style={{ textAlign: 'center', paddingBottom: 6, width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editableStudentComponents.map((comp, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '6px 4px' }}>
                          <input
                            type="text"
                            value={comp.name}
                            onChange={(e) => handleStudentComponentNameChange(idx, e.target.value)}
                            style={{ width: '100%', fontSize: 12, fontWeight: 600, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)' }}
                          />
                        </td>
                        <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                          <select
                            value={comp.frequency}
                            onChange={(e) => handleStudentComponentFrequencyChange(idx, e.target.value)}
                            style={{ fontSize: 11, fontWeight: 600, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', textTransform: 'uppercase' }}
                          >
                            <option value="monthly">Monthly</option>
                            <option value="bi-annual">Bi-Annual</option>
                            <option value="annual">Annual</option>
                            <option value="one-time">One-Time</option>
                          </select>
                        </td>
                        <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min="0"
                            value={comp.amount}
                            onChange={(e) => handleStudentComponentAmountChange(idx, e.target.value, totalPaid)}
                            style={{ width: 120, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)' }}
                          />
                        </td>
                        <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveStudentComponent(idx, totalPaid)}
                            title="Remove fee head"
                            style={{ background: 'transparent', border: 'none', color: 'var(--txt-muted)', cursor: 'pointer', padding: 2 }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#dc2626'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--txt-muted)'}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}

                    {/* Arrears row */}
                    <tr style={{ borderTop: '2px solid var(--border)', background: 'rgba(245, 158, 11, 0.08)' }}>
                      <td style={{ padding: '8px 6px', fontWeight: 700, color: '#b45309' }}>
                        Previous Year Arrears (Old Balance)
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(245, 158, 11, 0.2)', color: '#b45309', padding: '2px 6px', borderRadius: 4 }}>
                          ONE-TIME
                        </span>
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                        <input
                          type="number"
                          min="0"
                          value={editableStudentArrears}
                          onChange={(e) => handleStudentArrearsChange(e.target.value, totalPaid)}
                          style={{ width: 120, textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, padding: '5px 6px', borderRadius: 6, border: '1.5px solid #f59e0b', color: '#b45309', background: '#fff' }}
                        />
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>

                {/* Synchronized Real-time Balance Box */}
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, fontSize: 11 }}>
                  <div>
                    <div className="text-muted">Current Year Fees</div>
                    <b style={{ fontSize: 13, fontFamily: 'monospace' }}>{cur}{editableStudentComponents.reduce((s, c) => s + (Number(c.amount) || 0), 0).toLocaleString()}</b>
                  </div>
                  <div>
                    <div className="text-muted">Old Balance / Arrears</div>
                    <b style={{ fontSize: 13, fontFamily: 'monospace', color: '#b45309' }}>{cur}{Number(editableStudentArrears || 0).toLocaleString()}</b>
                  </div>
                  <div>
                    <div className="text-muted">Total Life Demand</div>
                    <b style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--primary)' }}>
                      {cur}{(editableStudentComponents.reduce((s, c) => s + (Number(c.amount) || 0), 0) + Number(editableStudentArrears || 0)).toLocaleString()}
                    </b>
                  </div>
                  <div>
                    <div className="text-muted">Paid to Date (Lifetime)</div>
                    <b style={{ fontSize: 13, fontFamily: 'monospace', color: '#16a34a' }}>{cur}{totalPaid.toLocaleString()}</b>
                  </div>
                  <div style={{ background: 'rgba(220, 38, 38, 0.06)', border: '1.5px solid rgba(220, 38, 38, 0.3)', borderRadius: 6, padding: '4px 8px' }}>
                    <div style={{ color: '#dc2626', fontWeight: 700 }}>Remaining Balance (Editable)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <span style={{ fontWeight: 800, color: '#dc2626' }}>{cur}</span>
                      <input
                        type="number"
                        min="0"
                        value={editableStudentRemainingBalance}
                        onChange={(e) => handleStudentRemainingBalanceChange(e.target.value, totalPaid)}
                        title="Editing remaining balance automatically recalculates previous year arrears"
                        style={{ width: '100%', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, fontSize: 13, padding: '2px 4px', borderRadius: 4, border: '1px solid #dc2626', color: '#dc2626', background: '#fff' }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                  <input
                    type="text"
                    placeholder="Reason / Note for adjustment (e.g. Previous balance corrected from manual register)"
                    value={editableStudentRemarks}
                    onChange={(e) => setEditableStudentRemarks(e.target.value)}
                    style={{ flex: 1, fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-gray"
                    onClick={cancelEditingStudentFeeStructure}
                    style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    <X size={14} /> Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-green"
                    disabled={savingStudentFeeAdjustment}
                    onClick={() => saveStudentFeeAdjustment(student._id)}
                    style={{ padding: '6px 14px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700 }}
                  >
                    <Check size={14} /> {savingStudentFeeAdjustment ? 'Saving Changes...' : 'Save Changes to Database'}
                  </button>
                </div>
              </div>
            )}
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

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Transaction History (Receipts)</span>
                <span className="badge bg-blue" style={{ fontSize: 10 }}>AY 2026-27 (Current Year)</span>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Receipt #</th><th>Date</th><th>Due</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {(modal.data.receipts || []).length === 0 && <tr className="empty-row"><td colSpan={7}>No receipts for current year (2026-27)</td></tr>}
                  {(modal.data.receipts || []).map((r) => (
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

            {/* Financial Year: 2025-26 Previous Year Section */}
            <div style={{ marginTop: 24, borderTop: '1px dashed var(--border)', paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt-orange)' }}>Financial Year : 2025-26</span>
                  <span className="badge bg-orange" style={{ fontSize: 10 }}>Previous Year Archive</span>
                </div>
                {(modal.data.archivedReceipts || []).length > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt-green)' }}>
                    Total Paid (2025-26): {cur}{(modal.data.archivedReceipts || []).reduce((sum, r) => sum + (r.amount || 0), 0).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '6%' }}>Sr. No.</th>
                      <th>Paid Date</th>
                      <th>Amount</th>
                      <th>Split Structure</th>
                      <th>Transaction Mode</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!modal.data.archivedReceipts || modal.data.archivedReceipts.length === 0) ? (
                      <tr className="empty-row"><td colSpan={6}>No previous year records found (Newly admitted or no legacy payments in 2025-26)</td></tr>
                    ) : (
                      modal.data.archivedReceipts.map((ar, idx) => {
                        const b = ar.breakdown || {};
                        const splitParts = [];
                        if (b.admissionFees > 0) splitParts.push(`Admission: ${cur}${b.admissionFees.toLocaleString()}`);
                        if (b.monthlyFees > 0) splitParts.push(`Monthly: ${cur}${b.monthlyFees.toLocaleString()}`);
                        if (b.termFees > 0) splitParts.push(`Term: ${cur}${b.termFees.toLocaleString()}`);
                        if (b.msFees > 0) splitParts.push(`MS: ${cur}${b.msFees.toLocaleString()}`);
                        const splitText = splitParts.length > 0 ? splitParts.join(' | ') : `Fee: ${cur}${ar.amount?.toLocaleString()}`;

                        return (
                          <tr key={ar._id || idx}>
                            <td>{idx + 1}</td>
                            <td><b>{ar.date}</b></td>
                            <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--txt-green)' }}>{cur}{ar.amount?.toLocaleString()}</td>
                            <td style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{splitText}</td>
                            <td><span className="badge bg-navy" style={{ textTransform: 'uppercase', fontSize: 10 }}>{ar.paymentMode || 'CASH'}</span></td>
                            <td><Badge value="Archived" color="bg-solid-green" /></td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
        </Modal>
      );
    })()}

      {/* ------- Quick: Attendance (Full Calendar Tracker) ------- */}
      {modal?.type === 'attendance' && (
        <Modal
          title={`Attendance Calendar — ${modal.student.firstName} ${modal.student.lastName || ''}`}
          icon={CalendarCheck}
          size="lg"
          onClose={() => setModal(null)}
          onBack={modal.fromView ? () => setModal({ type: 'view', data: modal.student }) : null}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="small muted" style={{ fontWeight: 700 }}>Summary:</span>
              {Object.entries(modal.data.summary || {}).map(([k, v]) => (
                <Badge key={k} value={`${k.toUpperCase()}: ${v}`} color={{ present: 'bg-green', absent: 'bg-red', late: 'bg-yellow', halfday: 'bg-blue', leave: 'bg-purple' }[k]} />
              ))}
            </div>

            <MyAttendanceCard attendance={{
              summary: modal.data.summary || {},
              recent: modal.data.records || [],
            }} />
          </div>
        </Modal>
      )}

      {/* ------- Quick: Results (Enhanced Scorecard UI) ------- */}
      {modal?.type === 'results' && (() => {
        const results = modal.data.results || [];
        const totalMarks = results.reduce((sum, r) => sum + (Number(r.marks) || 0), 0);
        const maxMarks = results.reduce((sum, r) => sum + (Number(r.maxMarks) || 0), 0);
        const percentage = maxMarks > 0 ? Math.round((totalMarks / maxMarks) * 1000) / 10 : 0;
        const passedCount = results.filter(r => r.grade !== 'F' && r.status !== 'failed').length;

        return (
          <Modal
            title={`Exam Results — ${modal.student.firstName} ${modal.student.lastName}`}
            icon={Award}
            size="lg"
            onClose={() => setModal(null)}
            onBack={modal.fromView ? () => setModal({ type: 'view', data: modal.student }) : null}
            footer={results.length > 0 && (
              <button className="btn btn-navy" onClick={() => setModal({ ...modal, type: 'reportcard' })}>
                <FileText size={15} /> Print Report Card
              </button>
            )}
          >
            {results.length > 0 && (
              <div className="results-header-summary">
                <div className="results-kpi-item">
                  <span className="results-kpi-label">Overall Score</span>
                  <span className={`results-kpi-val ${percentage >= 50 ? 'good' : 'bad'}`}>
                    <Trophy size={18} /> {percentage}%
                  </span>
                </div>
                <div className="results-kpi-item">
                  <span className="results-kpi-label">Marks Obtained</span>
                  <span className="results-kpi-val mono">{totalMarks} / {maxMarks}</span>
                </div>
                <div className="results-kpi-item">
                  <span className="results-kpi-label">Subjects Cleared</span>
                  <span className="results-kpi-val good">
                    <CheckCircle2 size={16} /> {passedCount} / {results.length}
                  </span>
                </div>
                <div className="results-kpi-item">
                  <span className="results-kpi-label">Academic Status</span>
                  <span className="results-kpi-val">
                    {percentage >= 35 ? (
                      <span className="badge bg-solid-green" style={{ fontSize: 11, padding: '3px 8px' }}>PASSED</span>
                    ) : (
                      <span className="badge bg-solid-red" style={{ fontSize: 11, padding: '3px 8px' }}>NEEDS IMPROVEMENT</span>
                    )}
                  </span>
                </div>
              </div>
            )}

            <div className="results-table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Exam</th>
                    <th>Subject</th>
                    <th>Marks Obtained</th>
                    <th>Max</th>
                    <th>Grade</th>
                    <th>Result Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.length === 0 && (
                    <tr className="empty-row"><td colSpan={6}>No examination results recorded yet for this student.</td></tr>
                  )}
                  {results.map((r, i) => {
                    const isPassed = r.grade !== 'F' && r.status !== 'failed';
                    return (
                      <tr key={i}>
                        <td><b>{r.examName}</b></td>
                        <td style={{ fontWeight: 600 }}>{r.subject}</td>
                        <td>
                          <span className={`results-score-pill ${isPassed ? 'passed' : 'failed'}`}>
                            {r.marks ?? '—'}
                          </span>
                        </td>
                        <td className="muted">{r.maxMarks}</td>
                        <td>
                          <Badge value={r.grade || '—'} color={r.grade === 'F' ? 'bg-red' : 'bg-green'} />
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: isPassed ? '#16a34a' : '#dc2626' }}>
                            {isPassed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                            {r.status || (isPassed ? 'Passed' : 'Failed')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Modal>
        );
      })()}

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

      {/* ------- Student Official ID Card (Front & Back - Professional Landscape) ------- */}
      {modal?.type === 'idcard' && (() => {
        const s = modal.data;
        const clsName = className(classes, s.classId);
        const logoSrc = settings.logoUrl || '/logo.jpeg';
        const contactNo = s.fatherMobile || s.motherMobile || s.parentMobile || settings.phone || '9869353282';
        const fullAddress = s.address || [s.addressLine1, s.addressLine2, s.city || 'Mumbai', s.pinCode ? `PIN: ${s.pinCode}` : ''].filter(Boolean).join(', ') || 'Mumbai, Maharashtra';

        return (
          <Modal
            title={`ID Card — ${s.firstName} ${s.lastName}`}
            icon={CreditCard}
            size="lg"
            onClose={() => setModal(null)}
            onBack={modal.fromView ? () => setModal({ type: 'view', data: s }) : null}
            footer={<>
              <button className="btn btn-gray" onClick={() => setModal(null)}>Close</button>
              <button className="btn btn-navy" onClick={() => printStudentIdCards([s], idSide)}><Printer size={15} /> Print Card</button>
            </>}
          >
            <div className="id-card-view-wrapper">
              <div className="id-card-view-tabs no-print">
                <button
                  type="button"
                  className={`id-card-view-tab ${idSide === 'both' ? 'active' : ''}`}
                  onClick={() => setIdSide('both')}
                >
                  Both Sides (Front & Back)
                </button>
                <button
                  type="button"
                  className={`id-card-view-tab ${idSide === 'front' ? 'active' : ''}`}
                  onClick={() => setIdSide('front')}
                >
                  Front Side Only
                </button>
                <button
                  type="button"
                  className={`id-card-view-tab ${idSide === 'back' ? 'active' : ''}`}
                  onClick={() => setIdSide('back')}
                >
                  Back Side Only
                </button>
              </div>

              <div className="id-card-container print-area">
                {(idSide === 'both' || idSide === 'front') && (
                  <div className="official-id-card id-card-front">
                    <div className="id-card-header">
                      <img src={logoSrc} alt="School Logo" className="id-school-logo" />
                      <div className="id-header-text">
                        <h4 className="id-school-name">{settings.schoolName || 'M.V HIGH SCHOOL MUMBAI'}</h4>
                        <p className="id-school-sub">{settings.address || 'Prarthna Samaj, Opera House, Mumbai - 400004'}</p>
                      </div>
                      <span className="id-ay-tag">{settings.academicYear || '2026-27'}</span>
                    </div>

                    <div className="id-card-body">
                      <div className="id-photo-col">
                        <div className="id-photo-box">
                          {s.profilePhoto?._id ? (
                            <AttachmentImage attachment={s.profilePhoto} alt={`${s.firstName} ${s.lastName}`} />
                          ) : s.documents?.profilePhoto?._id ? (
                            <AttachmentImage attachment={s.documents.profilePhoto} alt={`${s.firstName} ${s.lastName}`} />
                          ) : (
                            <div className="id-photo-placeholder">
                              <span>{s.firstName?.[0] || 'S'}{(s.lastName || ' ')[0]}</span>
                            </div>
                          )}
                        </div>
                        <span className="id-adm-badge">ADM #{s.admissionNo}</span>
                      </div>

                      <div className="id-details-col">
                        <h3 className="id-student-name">{s.firstName} {s.lastName || ''}</h3>
                        <table className="id-details-table">
                          <tbody>
                            <tr>
                              <td className="lbl">Class & Div</td>
                              <td className="colon">:</td>
                              <td className="val"><b>{clsName || '8th'}</b> {s.division ? `(Div ${s.division})` : ''}</td>
                            </tr>
                            <tr>
                              <td className="lbl">Roll No</td>
                              <td className="colon">:</td>
                              <td className="val">{s.rollNo || '—'}</td>
                            </tr>
                            <tr>
                              <td className="lbl">Date of Birth</td>
                              <td className="colon">:</td>
                              <td className="val">{s.dob || '—'}</td>
                            </tr>
                            <tr>
                              <td className="lbl">Parent Name</td>
                              <td className="colon">:</td>
                              <td className="val">{s.fatherName || s.motherName || s.parentName || '—'}</td>
                            </tr>
                            <tr>
                              <td className="lbl">Blood Group</td>
                              <td className="colon">:</td>
                              <td className="val">{s.bloodGroup || (s.allergies ? `⚠ ${s.allergies}` : '—')}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="id-card-footer">
                      <div className="id-footer-meta">
                        <span>STUDENT ID CARD</span>
                      </div>
                      <div className="id-principal-sign">
                        <span className="id-sign-script">Sarita Gomes</span>
                        <span className="id-sign-title">Principal Sign</span>
                      </div>
                    </div>
                  </div>
                )}

                {(idSide === 'both' || idSide === 'back') && (
                  <div className="official-id-card id-card-back">
                    <div className="id-card-header">
                      <h4 className="id-back-title">Emergency Information & Guidelines</h4>
                      <span className="id-ay-tag">Cardholder</span>
                    </div>

                    <div className="id-back-body">
                      <div className="id-back-contact-box">
                        <div className="id-back-row">
                          <span className="id-back-icon-pill phone"><Phone size={11} /></span>
                          <span><b>Emergency:</b> {contactNo}</span>
                        </div>
                        <div className="id-back-row">
                          <span className="id-back-icon-pill blood"><HeartPulse size={11} /></span>
                          <span><b>Blood Group:</b> {s.bloodGroup || '—'}</span>
                        </div>
                        <div className="id-back-address-card">
                          <b>Residential Address:</b>
                          <div>{fullAddress}</div>
                        </div>
                      </div>

                      <div className="id-back-rules-col">
                        <div className="id-rules-title">Campus Regulations</div>
                        <ol className="id-rules-list">
                          <li>Card must be worn in campus at all times.</li>
                          <li>Mandatory for exams, lab & library access.</li>
                          <li>Report loss of card immediately to administration.</li>
                          <li>Non-transferable identity credential.</li>
                        </ol>
                      </div>
                    </div>

                    <div className="id-card-footer">
                      If found, please return to school office • Tel: {settings.phone || '022 2386 5845'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ------- Bulk Class ID Cards Generation Modal ------- */}
      {modal?.type === 'class-idcards' && (() => {
        const targetClass = classes.find(c => c._id === classCardsClassId);
        const classStudents = rows.filter(r => !classCardsClassId || r.classId === classCardsClassId);
        const logoSrc = settings.logoUrl || '/logo.jpeg';

        return (
          <Modal
            title={`Bulk ID Cards Generator — ${targetClass ? formatClass(targetClass) : 'All Classes'}`}
            icon={CreditCard}
            size="xl"
            onClose={() => setModal(null)}
            footer={<>
              <button className="btn btn-gray" onClick={() => setModal(null)}>Close</button>
              <button className="btn btn-navy" onClick={() => printStudentIdCards(classStudents, idSide)} disabled={classStudents.length === 0}>
                <Printer size={15} /> Print All ({classStudents.length}) Cards
              </button>
            </>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="no-print" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-card)', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Select Class:</label>
                  <select
                    value={classCardsClassId}
                    onChange={(e) => setClassCardsClassId(e.target.value)}
                    style={{ minWidth: 200 }}
                  >
                    <option value="">All Classes ({rows.length} students)</option>
                    {classes.map(c => (
                      <option key={c._id} value={c._id}>{formatClass(c)}</option>
                    ))}
                  </select>
                </div>

                <div className="id-card-view-tabs" style={{ marginLeft: 'auto' }}>
                  <button
                    type="button"
                    className={`id-card-view-tab ${idSide === 'both' ? 'active' : ''}`}
                    onClick={() => setIdSide('both')}
                  >
                    Front & Back
                  </button>
                  <button
                    type="button"
                    className={`id-card-view-tab ${idSide === 'front' ? 'active' : ''}`}
                    onClick={() => setIdSide('front')}
                  >
                    Front Only
                  </button>
                  <button
                    type="button"
                    className={`id-card-view-tab ${idSide === 'back' ? 'active' : ''}`}
                    onClick={() => setIdSide('back')}
                  >
                    Back Only
                  </button>
                </div>
              </div>

              {classStudents.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--txt-muted)' }}>
                  No students found in selected class.
                </div>
              ) : (
                <div className="bulk-id-grid print-area bulk-print-id-cards-container">
                  {classStudents.map((s) => {
                    const clsName = className(classes, s.classId);
                    const contactNo = s.fatherMobile || s.motherMobile || s.parentMobile || settings.phone || '9869353282';
                    const fullAddress = s.address || [s.addressLine1, s.addressLine2, s.city || 'Mumbai', s.pinCode ? `PIN: ${s.pinCode}` : ''].filter(Boolean).join(', ') || 'Mumbai, Maharashtra';

                    return (
                      <div key={s._id} style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {(idSide === 'both' || idSide === 'front') && (
                          <div className="official-id-card id-card-front">
                            <div className="id-card-header">
                              <img src={logoSrc} alt="School Logo" className="id-school-logo" />
                              <div className="id-header-text">
                                <h4 className="id-school-name">{settings.schoolName || 'M.V HIGH SCHOOL MUMBAI'}</h4>
                                <p className="id-school-sub">{settings.address || 'Prarthna Samaj, Opera House, Mumbai - 400004'}</p>
                              </div>
                              <span className="id-ay-tag">{settings.academicYear || '2026-27'}</span>
                            </div>

                            <div className="id-card-body">
                              <div className="id-photo-col">
                                <div className="id-photo-box">
                                  {s.profilePhoto?._id ? (
                                    <AttachmentImage attachment={s.profilePhoto} alt={`${s.firstName} ${s.lastName}`} />
                                  ) : s.documents?.profilePhoto?._id ? (
                                    <AttachmentImage attachment={s.documents.profilePhoto} alt={`${s.firstName} ${s.lastName}`} />
                                  ) : (
                                    <div className="id-photo-placeholder">
                                      <span>{s.firstName?.[0] || 'S'}{(s.lastName || ' ')[0]}</span>
                                    </div>
                                  )}
                                </div>
                                <span className="id-adm-badge">ADM #{s.admissionNo}</span>
                              </div>

                              <div className="id-details-col">
                                <h3 className="id-student-name">{s.firstName} {s.lastName || ''}</h3>
                                <table className="id-details-table">
                                  <tbody>
                                    <tr>
                                      <td className="lbl">Class & Div</td>
                                      <td className="colon">:</td>
                                      <td className="val"><b>{clsName || '8th'}</b> {s.division ? `(Div ${s.division})` : ''}</td>
                                    </tr>
                                    <tr>
                                      <td className="lbl">Roll No</td>
                                      <td className="colon">:</td>
                                      <td className="val">{s.rollNo || '—'}</td>
                                    </tr>
                                    <tr>
                                      <td className="lbl">Date of Birth</td>
                                      <td className="colon">:</td>
                                      <td className="val">{s.dob || '—'}</td>
                                    </tr>
                                    <tr>
                                      <td className="lbl">Parent Name</td>
                                      <td className="colon">:</td>
                                      <td className="val">{s.fatherName || s.motherName || s.parentName || '—'}</td>
                                    </tr>
                                    <tr>
                                      <td className="lbl">Blood Group</td>
                                      <td className="colon">:</td>
                                      <td className="val">{s.bloodGroup || (s.allergies ? `⚠ ${s.allergies}` : '—')}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="id-card-footer">
                              <div className="id-footer-meta">
                                <span>STUDENT ID CARD</span>
                              </div>
                              <div className="id-principal-sign">
                                <span className="id-sign-script">Sarita Gomes</span>
                                <span className="id-sign-title">Principal Sign</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {(idSide === 'both' || idSide === 'back') && (
                          <div className="official-id-card id-card-back">
                            <div className="id-card-header">
                              <h4 className="id-back-title">Emergency Info & Guidelines</h4>
                              <span className="id-ay-tag">Cardholder</span>
                            </div>

                            <div className="id-back-body">
                              <div className="id-back-contact-box">
                                <div className="id-back-row">
                                  <span className="id-back-icon-pill phone"><Phone size={11} /></span>
                                  <span><b>Emergency:</b> {contactNo}</span>
                                </div>
                                <div className="id-back-row">
                                  <span className="id-back-icon-pill blood"><HeartPulse size={11} /></span>
                                  <span><b>Blood Group:</b> {s.bloodGroup || '—'}</span>
                                </div>
                                <div className="id-back-address-card">
                                  <b>Residential Address:</b>
                                  <div>{fullAddress}</div>
                                </div>
                              </div>

                              <div className="id-back-rules-col">
                                <div className="id-rules-title">Campus Regulations</div>
                                <ol className="id-rules-list">
                                  <li>Card must be worn in campus at all times.</li>
                                  <li>Mandatory for exams, lab & library access.</li>
                                  <li>Report loss of card immediately to administration.</li>
                                  <li>Non-transferable identity credential.</li>
                                </ol>
                              </div>
                            </div>

                            <div className="id-card-footer">
                              If found, please return to school office • Tel: {settings.phone || '022 2386 5845'}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Modal>
        );
      })()}

      {/* ------- Quick: Parents ------- */}
      {modal?.type === 'parents' && (
        <Modal
          title={`Linked Parents — ${modal.student.firstName} ${modal.student.lastName}`}
          icon={UsersRound}
          onClose={() => setModal(null)}
          onBack={modal.fromView ? () => setModal({ type: 'view', data: modal.student }) : null}
        >
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
