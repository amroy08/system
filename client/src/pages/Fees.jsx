import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wallet, Plus, Eye, Printer, Undo2, Mail } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups } from '../hooks/useLookups';
import { DataTable, StatusTabs, Field, Modal, Badge, KpiCard } from '../components/ui';

function createPaymentForm() {
  return {
    items: [], lateFee: 0, discount: 0, amountPaid: 0, mode: 'cash', reference: '', remarks: '',
    date: new Date().toISOString().slice(0, 10), idempotencyKey: crypto.randomUUID(),
  };
}

function buildSplitPreview(items = [], amountPaid = 0) {
  let remaining = Number(amountPaid) || 0;
  const rows = [];
  for (const item of items) {
    const outstanding = Math.max(0, Number(item.outstandingAmount ?? item.amount) || 0);
    const allocation = remaining > 0 ? Math.min(remaining, outstanding) : 0;
    remaining -= allocation;
    rows.push({
      ...item,
      outstandingAmount: outstanding,
      allocationAmount: allocation,
      remainingAfterPayment: Math.max(0, outstanding - allocation),
    });
  }
  if (remaining > 0) {
    rows.push({
      name: 'School Fees Payment',
      frequency: 'extra',
      amount: remaining,
      paidAmount: 0,
      outstandingAmount: remaining,
      allocationAmount: remaining,
      remainingAfterPayment: 0,
    });
  }
  return rows;
}

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

export default function Fees() {
  const { notify, settings, user } = useApp();
  const { students = [], classes = [] } = useLookups(['students', 'classes']);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('all');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [modal, setModal] = useState(null);
  const [params] = useSearchParams();
  const cur = settings.currency || '₹';

  const [viewMode, setViewMode] = useState('grades');
  const [activeClassDrillDown, setActiveClassDrillDown] = useState(null);
  const [studentReceiptsModal, setStudentReceiptsModal] = useState(null);

  const getClassWing = (className) => {
    const name = String(className || '').toLowerCase();
    const match = name.match(/\b\d+\b/) || name.match(/\d+/);
    const gradeNum = match ? parseInt(match[0], 10) : null;
    if (gradeNum === null) return 'PRE-PRIMARY';
    if (gradeNum >= 1 && gradeNum <= 4) return 'PRIMARY';
    return 'SECONDARY';
  };

  // payment form state
  const [studentId, setStudentId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [formWing, setFormWing] = useState('');
  const [formClassId, setFormClassId] = useState('');
  const [computed, setComputed] = useState(null);
  const [pay, setPay] = useState(createPaymentForm);
  const [splitEdited, setSplitEdited] = useState(false);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      if (!formClassId) return [];
      return students.filter((s) => ['active', 'passed-out'].includes(s.status) && s.classId === formClassId);
    }
    return students.filter((s) => {
      if (!['active', 'passed-out'].includes(s.status)) return false;
      if (formClassId && s.classId !== formClassId) return false;
      const name = `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase();
      return name.includes(q) || String(s.admissionNo || '').toLowerCase().includes(q);
    });
  }, [students, formClassId, searchQuery]);

  const load = () => api.get('/fees').then(({ data }) => setRows(data));
  useEffect(() => { 
    load(); 
    const handleOuterClick = () => setShowDropdown(false);
    document.addEventListener('click', handleOuterClick);
    return () => document.removeEventListener('click', handleOuterClick);
  }, []);
  useEffect(() => {
    const add = params.get('add');
    const sid = params.get('studentId');
    if (add) {
      openAdd();
      if (sid) {
        setStudentId(sid);
        const student = students.find(s => s._id === sid);
        if (student) {
          setSearchQuery(`${student.firstName} ${student.lastName || ''} — ${student.admissionNo}`);
          setFormClassId(student.classId);
          const klass = classes.find(c => c._id === student.classId);
          if (klass) {
            const wingName = getClassWing(klass.name);
            setFormWing(wingName);
          }
        }
      }
    }
    const t = params.get('tab');
    if (t) setTab(t);
  }, [params, students, classes]);

  useEffect(() => {
    if (!studentId) { setComputed(null); return; }
    api.get(`/fees/compute/${studentId}`).then(({ data }) => {
      setComputed(data);
      setSplitEdited(false);
    });
  }, [studentId]);

  const autoSplitPreview = useMemo(
    () => buildSplitPreview(computed?.items || [], pay.amountPaid),
    [computed, pay.amountPaid]
  );

  const manualSplitPreview = useMemo(
    () => buildSplitPreview(computed?.items || [], 0).map((item) => {
      const allocationAmount = Number(pay.items.find((split) => split.description === item.name)?.amount || 0);
      return {
        ...item,
        allocationAmount,
        remainingAfterPayment: Math.max(0, item.outstandingAmount - allocationAmount),
      };
    }),
    [computed, pay.items]
  );

  const paymentSplitPreview = splitEdited ? manualSplitPreview : autoSplitPreview;

  useEffect(() => {
    if (!computed || splitEdited) return;
    const autoItems = autoSplitPreview
      .filter((item) => Number(item.allocationAmount || 0) > 0)
      .map((item) => ({ description: item.name, amount: item.allocationAmount }));
    setPay((current) => ({ ...current, items: autoItems }));
  }, [computed, autoSplitPreview, splitEdited]);

  const splitTotal = useMemo(
    () => pay.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
    [pay.items]
  );

  const updateManualSplit = (description, amount) => {
    setSplitEdited(true);
    setPay((current) => {
      const next = current.items.filter((item) => item.description !== description);
      const numericAmount = Number(amount) || 0;
      if (numericAmount > 0) next.push({ description, amount: numericAmount });
      return { ...current, items: next };
    });
  };

  const resetAutoSplit = () => {
    setSplitEdited(false);
  };

  const projectedBalance = useMemo(() => Math.max(0, (
    Number(computed?.balance || 0)
    + (Number(pay.lateFee) || 0)
    - (Number(pay.discount) || 0)
    - (Number(pay.amountPaid) || 0)
  )), [computed, pay.amountPaid, pay.lateFee, pay.discount]);

  const counts = useMemo(() => ({
    all: rows.length,
    paid: rows.filter((r) => r.status === 'paid').length,
    partial: rows.filter((r) => r.status === 'partial').length,
    unpaid: rows.filter((r) => r.status === 'unpaid').length,
    refunded: rows.filter((r) => r.status === 'refunded').length,
  }), [rows]);

  const totalCollected = rows.filter((r) => r.status !== 'refunded').reduce((s, r) => s + (r.amountPaid || 0), 0);

  const studentPaidMap = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      if (r.status !== 'refunded') {
        map[r.studentId] = (map[r.studentId] || 0) + (r.amountPaid || 0);
      }
    });
    return map;
  }, [rows]);

  const totalOutstanding = useMemo(() => {
    return students.filter(s => ['active', 'passed-out'].includes(s.status)).reduce((sum, s) => {
      const paid = studentPaidMap[s._id] || 0;
      const demand = s.totalDemand || 0;
      return sum + Math.max(0, demand - paid);
    }, 0);
  }, [students, studentPaidMap]);

  const classStats = useMemo(() => {
    const stats = {};
    classes.forEach(c => {
      stats[c._id] = {
        class: c,
        studentCount: 0,
        totalDemand: 0,
        totalPaid: 0,
        outstanding: 0,
      };
    });

    students.forEach(s => {
      if (['active', 'passed-out'].includes(s.status) && stats[s.classId]) {
        const paid = studentPaidMap[s._id] || 0;
        const demand = s.totalDemand || 0;
        const outstanding = Math.max(0, demand - paid);
        
        stats[s.classId].studentCount += 1;
        stats[s.classId].totalDemand += demand;
        stats[s.classId].totalPaid += paid;
        stats[s.classId].outstanding += outstanding;
      }
    });

    return Object.values(stats);
  }, [classes, students, studentPaidMap]);

  const filtered = useMemo(() => {
    let list = tab === 'all' ? rows : rows.filter((r) => r.status === tab);
    if (selectedClassId) {
      list = list.filter((r) => {
        const student = students.find((s) => s._id === r.studentId);
        return student && student.classId === selectedClassId;
      });
    }
    return list;
  }, [rows, tab, selectedClassId, students]);

  const openAdd = () => {
    setStudentId('');
    setSearchQuery('');
    setFormWing('');
    setFormClassId('');
    setShowDropdown(false);
    setComputed(null);
    setPay(createPaymentForm());
    setModal({ type: 'pay' });
  };

  const record = async () => {
    const paidAmt = Number(pay.amountPaid) || 0;
    if (paidAmt <= 0) {
      notify("Please enter a valid payment amount greater than 0.", "error");
      return;
    }
    if (computed && paidAmt > computed.balance) {
      notify(`Payment amount exceeds the outstanding balance (${computed.balance}).`, "error");
      return;
    }
    if (Math.abs(splitTotal - paidAmt) > 0.01) {
      notify(`Split total must match the paid amount. Current split total is ${splitTotal}.`, "error");
      return;
    }
    if (pay.mode === 'upi' && !pay.reference) {
      notify("UPI Reference / UTR is required for UPI payments.", "error");
      return;
    }
    if (pay.mode === 'check' && !pay.reference) {
      notify("Cheque Number is required for cheque payments.", "error");
      return;
    }
    if (pay.mode === 'online' && !pay.reference) {
      notify("Bank Reference Number is required for online payments.", "error");
      return;
    }
    try {
      const idempotencyKey = pay.idempotencyKey;
      const { data } = await api.post('/fees', { studentId, ...pay, idempotencyKey }, { headers: { 'Idempotency-Key': idempotencyKey } });
      notify(`Payment recorded — ${data.receiptNo}`);
      setModal({ type: 'receipt', data });
      load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const refund = async (r) => {
    try {
      await api.post(`/fees/${r._id}/refund`, {});
      notify('Receipt marked as refunded');
      load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const emailReceipt = async (receipt) => {
    try {
      const { data } = await api.post(`/fees/${receipt._id}/email`, {});
      notify(data.queuedCount ? `Receipt queued for ${data.queuedCount} parent email${data.queuedCount === 1 ? '' : 's'}` : 'No deliverable parent email is linked', data.queuedCount ? 'success' : 'error');
      load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const printReceipt = () => {
    if (!modal?.data) return;
    const r = modal.data;
    
    const renderSingleCopy = (copyType, data) => {
      const totalDemand = data.totalDemand || (Number(data.subTotal || 0) + Number(data.balance || 0)) || 0;
      const name = String(data.className || '').toLowerCase();
      let standardDemand = 23500;
      if (name.includes('nursery') || name.includes('jr') || name.includes('junior') || name.includes('sr') || name.includes('senior') || name.includes('kg') || name.includes('pre-primary')) {
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

      const previousYearArrears = data.previousYearArrears !== undefined ? data.previousYearArrears : Math.max(0, totalDemand - standardDemand);
      const currentGradeFeeRate = data.currentGradeFeeRate !== undefined ? data.currentGradeFeeRate : Math.min(totalDemand, standardDemand);
      const totalPaidLifetime = data.totalPaidLifetime !== undefined ? data.totalPaidLifetime : (totalDemand - data.balance);
      const balanceBreakdownHtml = renderBalanceBreakdownRows(data.balanceBreakdown || []);

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
                <p style="margin:0"><b>Receipt Date:</b> ${data.date}</p>
                <p style="margin:0"><b>Receipt No:</b> ${data.receiptNo}</p>
                <p style="margin:0"><b>Tel:</b> 022 2386 5845</p>
                <p style="margin:0"><b>Email:</b> principalmveng@gmail.com</p>
              </div>
              <div style="text-align:right; line-height:1.4">
                <p style="margin:0; font-size:9px; color:#94a3b8; text-transform:uppercase">Receipt To</p>
                <p style="margin:0; font-size:11px; font-weight:700; text-transform:uppercase">${data.studentName}</p>
                <p style="margin:0"><b>Adm No:</b> ${data.admissionNo}</p>
                <p style="margin:0; font-weight:700">${data.className}</p>
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
                  ${(data.items || []).map((item, idx) => `
                    <tr style="border-bottom:1px solid #f1f5f9">
                      <td style="padding:4px">${idx + 1}</td>
                      <td style="padding:4px; font-weight:600">${item.description}</td>
                      <td style="padding:4px; text-align:right; font-family:monospace">INR ${Number(item.amount || 0).toFixed(2)} /-</td>
                    </tr>
                  `).join('')}
                  ${data.lateFee > 0 ? `
                    <tr style="border-bottom:1px solid #f1f5f9">
                      <td style="padding:4px">${(data.items || []).length + 1}</td>
                      <td style="padding:4px; font-weight:600">Late Fee Charge</td>
                      <td style="padding:4px; text-align:right; font-family:monospace; color:#dc2626">+ INR ${Number(data.lateFee || 0).toFixed(2)} /-</td>
                    </tr>
                  ` : ''}
                  ${data.discount > 0 ? `
                    <tr style="border-bottom:1px solid #f1f5f9">
                      <td style="padding:4px">${(data.items || []).length + (data.lateFee > 0 ? 2 : 1)}</td>
                      <td style="padding:4px; font-weight:600">Concession Discount</td>
                      <td style="padding:4px; text-align:right; font-family:monospace; color:#16a34a">- INR ${Number(data.discount || 0).toFixed(2)} /-</td>
                    </tr>
                  ` : ''}
                </tbody>
              </table>
            </div>

            <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:10px">
              <div>
                <p style="margin:0"><b>Transaction Mode:</b> ${String(data.mode || '').toUpperCase()}</p>
                ${data.reference ? `<p style="margin:0"><b>Ref No:</b> ${data.reference}</p>` : ''}
              </div>
              <div style="width:200px; text-align:right; line-height:1.4">
                <div style="display:flex; justify-content:space-between; color:#475569">
                  <span>Sub Total</span>
                  <span style="font-family:monospace">INR ${Number(data.amountPaid || 0).toFixed(2)}/-</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-weight:700; color:#0f172a; border-top:1px solid #cbd5e1; padding-top:2px; font-size:11px">
                  <span>Total Paid</span>
                  <span style="font-family:monospace">INR ${Number(data.amountPaid || 0).toFixed(2)}/-</span>
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
                  <p style="margin:0">Paid in this Receipt: <span style="font-family:monospace; color:#16a34a; font-weight:700">INR ${Number(data.amountPaid || 0).toFixed(2)}</span></p>
                  <p style="margin:0">Total Paid (Lifetime): <span style="font-family:monospace; color:#16a34a; font-weight:700">INR ${Number(totalPaidLifetime).toFixed(2)}</span></p>
                  <p style="margin:2px 0 0; border-top:1px solid #cbd5e1; padding-top:1px; font-weight:700; color:#b45309">Remaining Balance Outstanding: <span style="font-family:monospace">INR ${Number(data.balance || 0).toFixed(2)}</span></p>
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
        ${renderSingleCopy("SCHOOL COPY", r)}
        
        <div style="border-top:2px dashed #94a3b8; text-align:center; position:relative; margin:10px 0; min-height:14px">
          <span style="background:#fff; padding:0 10px; font-size:9px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:2px; position:absolute; top:-7px; left:50%; transform:translateX(-50%)">
            ✂ CUT ALONG DOTTED LINE — DUPLICATE COPY BELOW ✂
          </span>
        </div>

        ${renderSingleCopy("PARENT COPY", r)}
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const columns = [
    { key: 'receiptNo', label: 'Receipt #', render: (r) => <span className="mono link-like" onClick={() => setModal({ type: 'receipt', data: r })}>{r.receiptNo}</span> },
    { key: 'date', label: 'Date' },
    { key: 'studentName', label: 'Student', render: (r) => <div><b>{r.studentName}</b><div className="small muted">{r.admissionNo}</div></div> },
    {
      key: 'className',
      label: 'Class',
      render: (r) => {
        const student = students.find((s) => s._id === r.studentId);
        if (student) {
          const klass = classes.find((c) => c._id === student.classId);
          if (klass) return `${klass.name} ${klass.section} (${klass.academicYear})`;
        }
        return r.className;
      }
    },
    { key: 'amountDue', label: 'Due', value: (r) => r.amountDue, render: (r) => `${cur}${(r.amountDue || 0).toLocaleString()}` },
    { key: 'amountPaid', label: 'Paid', value: (r) => r.amountPaid, render: (r) => <b className="txt-green">{cur}{(r.amountPaid || 0).toLocaleString()}</b> },
    { key: 'balance', label: 'Balance', value: (r) => r.balance, render: (r) => <span className={r.balance > 0 ? 'txt-red' : ''}>{cur}{(r.balance || 0).toLocaleString()}</span> },
    { key: 'mode', label: 'Mode', render: (r) => <Badge value={r.mode} color="bg-gray" /> },
    { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
    { label: 'Actions', sortable: false, noExport: true, render: (r) => (
      <div className="row-actions">
        <button className="act-view" title="View receipt" onClick={() => setModal({ type: 'receipt', data: r })}><Eye size={15} /></button>
        <button className="act-navy" title="Print" onClick={() => setModal({ type: 'receipt', data: r, autoPrint: true })}><Printer size={15} /></button>
        <button className="act-green" title="Email receipt" onClick={() => emailReceipt(r)}><Mail size={15} /></button>
        {['admin', 'clerk'].includes(user?.role) && r.status !== 'refunded' && (
          <button className="act-orange" title="Refund" onClick={() => refund(r)}><Undo2 size={15} /></button>
        )}
      </div>
    )},
  ];

  return (
    <>
      <div className="page-head">
        <h2><Wallet size={20} /> Fees Collection</h2>
        <div className="spacer" />
        <div className="page-head-filter" style={{ marginRight: 12, minWidth: 200 }}>
          <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--txt)', cursor: 'pointer' }}>
            <option value="">All Classes / Grades</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>{c.name} {c.section}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-green" onClick={openAdd}><Plus size={15} /> Record Payment</button>
      </div>

      <div className="kpi-grid">
        <KpiCard color="green" icon={Wallet} value={`${cur}${totalCollected.toLocaleString()}`} label="Total Collected" />
        <KpiCard color="red" icon={Wallet} value={`${cur}${totalOutstanding.toLocaleString()}`} label="Outstanding" />
        <KpiCard color="navy" icon={Wallet} value={rows.length} label="Total Receipts" />
      </div>

      <div className="view-switcher-bar" style={{ display: 'flex', gap: 12, margin: '20px 0 10px' }}>
        <button 
          className={`btn ${viewMode === 'grades' ? 'btn-navy' : 'btn-gray'}`}
          style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13 }}
          onClick={() => {
            setViewMode('grades');
            setActiveClassDrillDown(null);
          }}
        >
          Grade-wise Overview
        </button>
        <button 
          className={`btn ${viewMode === 'receipts' ? 'btn-navy' : 'btn-gray'}`}
          style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13 }}
          onClick={() => {
            setViewMode('receipts');
            setActiveClassDrillDown(null);
          }}
        >
          Receipts Log
        </button>
      </div>

      {viewMode === 'receipts' && (
        <>
          <StatusTabs active={tab} onChange={setTab} tabs={[
            { key: 'all', label: 'All', count: counts.all, color: 'navy' },
            { key: 'paid', label: 'Paid', count: counts.paid, color: 'green' },
            { key: 'partial', label: 'Partial', count: counts.partial, color: 'orange' },
            { key: 'unpaid', label: 'Unpaid', count: counts.unpaid, color: 'red' },
            { key: 'refunded', label: 'Refunded', count: counts.refunded, color: 'gray' },
          ]} />

          <DataTable columns={columns} rows={filtered} title="Fees Collection Report" exportName="fee-receipts" />
        </>
      )}

      {viewMode === 'grades' && !activeClassDrillDown && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
          {classStats.map(stat => {
            const collectionRate = stat.totalDemand > 0 ? (stat.totalPaid / stat.totalDemand) * 100 : 0;
            return (
              <div 
                key={stat.class._id} 
                onClick={() => setActiveClassDrillDown(stat.class._id)}
                style={{ 
                  background: 'var(--bg-card)', 
                  border: '1px solid var(--border)', 
                  borderRadius: 16, 
                  padding: 20, 
                  cursor: 'pointer', 
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)'
                }}
                className="hover-scale"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, fontFamily: 'Outfit' }}>
                    {stat.class.name} {stat.class.section}
                  </h3>
                  <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', padding: '2px 8px', borderRadius: 99 }}>
                    {stat.studentCount} Students
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ color: 'var(--txt-muted)' }}>Collected</div>
                    <b style={{ color: '#16a34a', fontSize: 14 }}>{cur}{stat.totalPaid.toLocaleString()}</b>
                  </div>
                  <div>
                    <div style={{ color: 'var(--txt-muted)' }}>Outstanding</div>
                    <b style={{ color: '#dc2626', fontSize: 14 }}>{cur}{stat.outstanding.toLocaleString()}</b>
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--txt-muted)', marginBottom: 4 }}>
                    <span>Collection Progress</span>
                    <span>{collectionRate.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${collectionRate}%`, height: '100%', background: '#16a34a', borderRadius: 99 }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'grades' && activeClassDrillDown && (() => {
        const selectedClass = classes.find(c => c._id === activeClassDrillDown);
        const classStudents = students.filter(s => ['active', 'passed-out'].includes(s.status) && s.classId === activeClassDrillDown);
        
        const drillDownColumns = [
          { key: 'admissionNo', label: 'Adm No' },
          { key: 'name', label: 'Name', render: (s) => <b>{s.firstName} {s.lastName || ''}</b> },
          { key: 'admissionCategory', label: 'Category', render: (s) => <Badge value={s.admissionCategory} /> },
          { key: 'totalDemand', label: 'Total Demand', render: (s) => `${cur}${(s.totalDemand || 0).toLocaleString()}` },
          { key: 'totalPaid', label: 'Total Paid', render: (s) => <span style={{ color: '#16a34a', fontWeight: 600 }}>{cur}{(studentPaidMap[s._id] || 0).toLocaleString()}</span> },
          { key: 'outstanding', label: 'Outstanding Balance', render: (s) => {
              const outstanding = Math.max(0, (s.totalDemand || 0) - (studentPaidMap[s._id] || 0));
              return <span style={{ color: outstanding > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>{cur}{outstanding.toLocaleString()}</span>;
            } 
          },
          { label: 'Actions', sortable: false, noExport: true, render: (s) => (
              <div style={{ display: 'flex', gap: 6 }}>
                <button 
                  className="act-btn-modern act-btn-pay" 
                  title="Record Payment" 
                  onClick={() => {
                    setStudentId(s._id);
                    setSearchQuery(`${s.firstName} ${s.lastName || ''} — ${s.admissionNo}`);
                    setFormClassId(s.classId);
                    if (selectedClass) {
                      setFormWing(getClassWing(selectedClass.name));
                    }
                    setModal({ type: 'pay' });
                  }}
                >
                  <Plus size={13} /> Pay
                </button>
                <button 
                  className="act-btn-modern act-btn-receipts" 
                  title="View Receipts" 
                  onClick={() => setStudentReceiptsModal(s)}
                >
                  <Eye size={13} /> Receipts
                </button>
              </div>
            )
          }
        ];

        return (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <button 
                className="btn btn-gray" 
                onClick={() => setActiveClassDrillDown(null)}
                style={{ padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                ← Back to Grades
              </button>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, fontFamily: 'Outfit' }}>
                Students in {selectedClass ? `${selectedClass.name} ${selectedClass.section}` : ''}
              </h3>
            </div>
            
            <DataTable 
              columns={drillDownColumns} 
              rows={classStudents} 
              title={`Students Directory — ${selectedClass ? selectedClass.name : ''}`} 
              exportName={`students-${selectedClass ? selectedClass.name : 'class'}`} 
            />
          </div>
        );
      })()}

      {/* Record payment */}
      {modal?.type === 'pay' && (
        <Modal title="Record Fee Payment" icon={Wallet} size="lg" onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" disabled={!studentId || !pay.amountPaid || Number(pay.amountPaid) <= 0} onClick={record}>Record Payment</button>
          </>}>
          <div className="form-grid">
            <Field label="Wing" required>
              <select value={formWing} onChange={(e) => {
                setFormWing(e.target.value);
                setFormClassId('');
                setStudentId('');
                setSearchQuery('');
              }}>
                <option value="">Select Wing</option>
                <option value="PRE-PRIMARY">Pre-Primary</option>
                <option value="PRIMARY">Primary</option>
                <option value="SECONDARY">Secondary</option>
              </select>
            </Field>

            <Field label="Class / Grade" required>
              <select value={formClassId} onChange={(e) => {
                setFormClassId(e.target.value);
                setStudentId('');
                setSearchQuery('');
              }} disabled={!formWing}>
                <option value="">Select Class / Grade</option>
                {classes
                  .filter((c) => {
                    const wingName = getClassWing(c.name);
                    return wingName === formWing;
                  })
                  .map((c) => (
                    <option key={c._id} value={c._id}>{c.name} {c.section}</option>
                  ))}
              </select>
            </Field>

            <Field label="Student" required>
              <div className="student-search" onClick={(e) => e.stopPropagation()}>
                <input
                  type="search"
                  value={searchQuery}
                  placeholder="Search by student name or admission no..."
                  autoComplete="off"
                  onFocus={() => setShowDropdown(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setStudentId('');
                    setShowDropdown(true);
                  }}
                />
                {showDropdown && (formClassId || searchQuery.trim().length > 0) && (
                  <div className="student-search-results">
                    {filteredStudents.length ? filteredStudents.map((s) => {
                      const klass = classes.find((c) => c._id === s.classId);
                      const classNameLabel = klass ? `${klass.name} ${klass.section}` : '';
                      return (
                        <button
                          type="button"
                          key={s._id}
                          onClick={() => {
                            setStudentId(s._id);
                            setSearchQuery(`${s.firstName} ${s.lastName || ''} — ${s.admissionNo}`);
                            setShowDropdown(false);
                            if (!formClassId) {
                              setFormClassId(s.classId);
                              if (klass) {
                                setFormWing(getClassWing(klass.name));
                              }
                            }
                          }}
                        >
                          <span>{s.firstName} {s.lastName || ''} {classNameLabel && <span className="small muted">({classNameLabel})</span>}</span>
                          <small>{s.admissionNo}</small>
                        </button>
                      );
                    }) : <div className="student-search-empty">No matching students</div>}
                  </div>
                )}
              </div>
            </Field>
            {computed && (
              <>
                <div className="form-section">Fee Summary ({computed.className})</div>
                <div className="full fee-summary-grid" style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', textAlign: 'center', border: '1px solid var(--border)' }}>
                    <div className="small text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Annual Fee</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{cur}{computed.totalDemand.toLocaleString()}</div>
                  </div>
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', textAlign: 'center', border: '1px solid var(--border)' }}>
                    <div className="small text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Paid to Date</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: '#16a34a' }}>{cur}{computed.totalPaid.toLocaleString()}</div>
                  </div>
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', textAlign: 'center', border: '1px solid var(--border)' }}>
                    <div className="small text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Outstanding Balance</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: '#dc2626' }}>{cur}{computed.balance.toLocaleString()}</div>
                  </div>
                </div>

                <div className="form-section">Fee Breakdown</div>
                <div className="full" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', fontWeight: '700', color: 'var(--txt-muted)' }}>
                        <th style={{ textAlign: 'left', paddingBottom: 6 }}>Fee Component</th>
                        <th style={{ textAlign: 'center', paddingBottom: 6 }}>Frequency</th>
                        <th style={{ textAlign: 'right', paddingBottom: 6 }}>Total Due</th>
                        <th style={{ textAlign: 'right', paddingBottom: 6 }}>Paid</th>
                        <th style={{ textAlign: 'right', paddingBottom: 6 }}>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(computed.items || []).map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: idx === computed.items.length - 1 ? 'none' : '1px solid var(--border-light)' }}>
                          <td style={{ padding: '6px 0', fontWeight: '600' }}>{item.name}</td>
                          <td style={{ padding: '6px 0', textAlign: 'center' }}>
                            <span style={{ fontSize: 10, fontWeight: '700', background: 'var(--border)', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>
                              {item.frequency}
                            </span>
                          </td>
                          <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'monospace', fontWeight: '700' }}>{cur}{Number(item.amount || 0).toLocaleString()}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'monospace', color: '#16a34a' }}>{cur}{Number(item.paidAmount || 0).toLocaleString()}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'monospace', color: Number(item.outstandingAmount || 0) > 0 ? '#dc2626' : '#16a34a' }}>{cur}{Number(item.outstandingAmount || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Field label="Amount Paid" required><input type="number" value={pay.amountPaid} onChange={(e) => setPay({ ...pay, amountPaid: e.target.value })} /></Field>
                <Field label="Late Fee"><input type="number" value={pay.lateFee} onChange={(e) => setPay({ ...pay, lateFee: e.target.value })} /></Field>
                <Field label="Discount"><input type="number" value={pay.discount} onChange={(e) => setPay({ ...pay, discount: e.target.value })} /></Field>

                <div className="full" style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', fontSize: 14, textAlign: 'center', border: '1px solid var(--border)' }}>
                  Remaining Outstanding Balance after payment: &nbsp;
                  <b style={{ color: 'var(--primary)', fontSize: 16 }}>
                    {cur}{projectedBalance.toLocaleString()}
                  </b>
                </div>

                <div className="form-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span>{splitEdited ? 'Edited Split' : 'Auto Split Preview'}</span>
                  {splitEdited && (
                    <button type="button" className="btn btn-gray" style={{ padding: '4px 10px', fontSize: 12 }} onClick={resetAutoSplit}>
                      Reset Auto Split
                    </button>
                  )}
                </div>
                <div className="full" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', fontWeight: '700', color: 'var(--txt-muted)' }}>
                        <th style={{ textAlign: 'left', paddingBottom: 6 }}>Fee Head</th>
                        <th style={{ textAlign: 'right', paddingBottom: 6 }}>Already Paid</th>
                        <th style={{ textAlign: 'right', paddingBottom: 6 }}>This Payment</th>
                        <th style={{ textAlign: 'right', paddingBottom: 6 }}>Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentSplitPreview.map((item, idx) => (
                        <tr key={`${item.name}-${idx}`} style={{ borderBottom: idx === paymentSplitPreview.length - 1 ? 'none' : '1px solid var(--border-light)' }}>
                          <td style={{ padding: '6px 0', fontWeight: 600 }}>{item.name}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'monospace' }}>{cur}{Number(item.paidAmount || 0).toLocaleString()}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right' }}>
                            <input
                              type="number"
                              min="0"
                              max={Number(item.outstandingAmount || 0)}
                              value={Number(item.allocationAmount || 0)}
                              onChange={(e) => updateManualSplit(item.name, e.target.value)}
                              style={{ width: 120, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: Number(item.allocationAmount || 0) > 0 ? '#2563eb' : 'var(--txt-muted)' }}
                            />
                          </td>
                          <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'monospace', color: Number(item.remainingAfterPayment || 0) > 0 ? '#dc2626' : '#16a34a' }}>{cur}{Number(item.remainingAfterPayment || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '1px solid var(--border)', fontWeight: 700 }}>
                        <td style={{ padding: '8px 0' }} colSpan={2}>Split Total</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: 'monospace', color: Math.abs(splitTotal - (Number(pay.amountPaid) || 0)) > 0.01 ? '#dc2626' : '#16a34a' }}>
                          {cur}{splitTotal.toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 0', textAlign: 'right', color: Math.abs(splitTotal - (Number(pay.amountPaid) || 0)) > 0.01 ? '#dc2626' : '#16a34a' }}>
                          {Math.abs(splitTotal - (Number(pay.amountPaid) || 0)) > 0.01 ? 'Must match paid amount' : 'Ready'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <Field label="Payment Mode">
                  <select value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value, reference: '' })}>
                    {['cash', 'online', 'check', 'upi', 'card'].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </Field>
                {['online', 'check', 'upi', 'card'].includes(pay.mode) && (
                  <Field label={pay.mode === 'check' ? "Cheque Number" : pay.mode === 'upi' ? "UPI Reference / UTR" : "Reference Number"} required>
                    <input value={pay.reference || ''} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder={pay.mode === 'check' ? "Enter cheque number" : "Enter transaction reference"} />
                  </Field>
                )}
                <Field label="Date"><input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></Field>
                <Field label="Remarks"><input value={pay.remarks} onChange={(e) => setPay({ ...pay, remarks: e.target.value })} /></Field>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* Student Receipts List Modal */}
      {studentReceiptsModal && (() => {
        const studentReceipts = rows.filter(r => r.studentId === studentReceiptsModal._id);
        const receiptColumns = [
          { key: 'receiptNo', label: 'Receipt #' },
          { key: 'date', label: 'Date' },
          { key: 'amountPaid', label: 'Paid', render: (r) => `${cur}${(r.amountPaid || 0).toLocaleString()}` },
          { key: 'balance', label: 'Balance Due', render: (r) => `${cur}${(r.balance || 0).toLocaleString()}` },
          { key: 'mode', label: 'Mode', render: (r) => String(r.mode || '').toUpperCase() },
          { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
          { label: 'Actions', sortable: false, noExport: true, render: (r) => (
              <div className="row-actions">
                <button className="act-view" title="View receipt" onClick={() => setModal({ type: 'receipt', data: r })}><Eye size={13} /></button>
                <button className="act-navy" title="Print" onClick={() => setModal({ type: 'receipt', data: r, autoPrint: true })}><Printer size={13} /></button>
                <button className="act-green" title="Email receipt" onClick={() => emailReceipt(r)}><Mail size={13} /></button>
              </div>
            )
          }
        ];
        
        return (
          <Modal 
            title={`Payment Receipts — ${studentReceiptsModal.firstName} ${studentReceiptsModal.lastName || ''}`} 
            icon={Wallet} 
            size="lg" 
            onClose={() => setStudentReceiptsModal(null)}
          >
            {studentReceipts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--txt-muted)' }}>
                No payment receipts found for this student.
              </div>
            ) : (
              <DataTable 
                columns={receiptColumns} 
                rows={studentReceipts} 
                title="Student Receipts" 
                exportName={`receipts-${studentReceiptsModal.firstName}`}
              />
            )}
          </Modal>
        );
      })()}

      {/* Receipt */}
      {modal?.type === 'receipt' && (
        <Modal title="Fee Receipt" icon={Wallet} size="lg" onClose={() => setModal(null)}>
          <button className="btn btn-navy mb no-print" onClick={printReceipt}><Printer size={15} /> Print A4</button>
          <div id="receipt-print">
            <div className="receipt">
              <h1>{settings.schoolName || 'School Name'}</h1>
              <div className="small muted">{settings.address}</div>
              <div className="band">FEE PAYMENT RECEIPT</div>
              <table>
                <tbody>
                  <tr>
                    <td><b>Receipt No:</b> {modal.data.receiptNo}</td>
                    <td style={{ textAlign: 'right' }}><b>Date:</b> {modal.data.date}</td>
                  </tr>
                  <tr>
                    <td><b>Student:</b> {modal.data.studentName}</td>
                    <td style={{ textAlign: 'right' }}><b>Adm No:</b> {modal.data.admissionNo}</td>
                  </tr>
                  <tr>
                    <td><b>Class:</b> {modal.data.className}</td>
                    <td style={{ textAlign: 'right' }}><b>Year:</b> {modal.data.academicYear}</td>
                  </tr>
                </tbody>
              </table>
              <table className="lines" style={{ marginTop: 14 }}>
                <thead><tr><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {(modal.data.items || []).map((i, idx) => (
                    <tr key={idx}><td>{i.description}</td><td style={{ textAlign: 'right' }}>{(i.amount || 0).toLocaleString()}</td></tr>
                  ))}
                  {modal.data.lateFee > 0 && <tr><td>Late fee</td><td style={{ textAlign: 'right', color: '#dc2626' }}>+ {modal.data.lateFee.toLocaleString()}</td></tr>}
                  {modal.data.discount > 0 && <tr><td>Discount</td><td style={{ textAlign: 'right', color: '#16a34a' }}>− {modal.data.discount.toLocaleString()}</td></tr>}
                  <tr><td style={{ textAlign: 'right' }}><b>AMOUNT PAID</b></td><td style={{ textAlign: 'right' }}><b>{(modal.data.amountPaid || 0).toLocaleString()}</b></td></tr>
                  <tr><td style={{ textAlign: 'right' }}><b>BALANCE DUE</b></td><td style={{ textAlign: 'right', color: modal.data.balance > 0 ? '#dc2626' : '#16a34a' }}><b>{(modal.data.balance || 0).toLocaleString()}</b></td></tr>
                </tbody>
              </table>
              {(modal.data.balanceBreakdown || []).some((item) => Number(item.balanceAmount || 0) > 0) && (
                <table className="lines" style={{ marginTop: 14 }}>
                  <thead>
                    <tr>
                      <th>Remaining Balance Breakdown</th>
                      <th style={{ textAlign: 'right' }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(modal.data.balanceBreakdown || [])
                      .filter((item) => Number(item.balanceAmount || 0) > 0)
                      .map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.name}</td>
                          <td style={{ textAlign: 'right', color: '#b45309' }}>{Number(item.balanceAmount || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
              <table style={{ marginTop: 14 }}>
                <tbody>
                  <tr>
                    <td><b>Mode:</b> {String(modal.data.mode || '').toUpperCase()}</td>
                    <td><b>Status:</b> <span style={{ color: modal.data.status === 'paid' ? '#16a34a' : '#d97706', fontWeight: 700 }}>{String(modal.data.status || '').toUpperCase()}</span></td>
                    <td style={{ textAlign: 'right' }}><b>Collected by:</b> {modal.data.collectedBy}</td>
                  </tr>
                </tbody>
              </table>
              {modal.data.remarks && <p style={{ marginTop: 10 }}><b>Remarks:</b> {modal.data.remarks}</p>}
              <div className="sig-row"><span>Cashier</span><span>Accountant</span><span>Principal</span></div>
              <p className="small muted" style={{ textAlign: 'center', marginTop: 18 }}>This is a system-generated receipt — Generated on {new Date().toLocaleDateString()}</p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
