import { useCallback, useEffect, useState, useMemo } from 'react';
import { Landmark, Send, Filter, CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups } from '../hooks/useLookups';
import { DataTable, Badge } from '../components/ui';

export default function Outstanding() {
  const { notify, settings } = useApp();
  const { classes = [] } = useLookups(['classes']);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [duesFilter, setDuesFilter] = useState('DEFAULTERS');

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState([]);
  const [guardianSelections, setGuardianSelections] = useState({});
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkIndex, setBulkIndex] = useState(0);
  const [bulkQueue, setBulkQueue] = useState([]);
  const [bulkMissing, setBulkMissing] = useState(0);

  const cur = settings.currency || '₹';

  const loadOutstandings = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/fees/outstanding');
      setRecords(data || []);
    } catch (e) {
      notify(errMsg(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadOutstandings();
  }, [loadOutstandings]);

  // Filter records
  const filtered = useMemo(() => {
    return records.filter((r) => {
      const matchesGrade = gradeFilter === 'ALL' || r.grade.toLowerCase() === gradeFilter.toLowerCase();
      if (!matchesGrade) return false;

      if (duesFilter === 'DEFAULTERS') return r.outstandingAmount > 0;
      if (duesFilter === 'OVER_5K') return r.outstandingAmount >= 5000;
      if (duesFilter === 'OVER_10K') return r.outstandingAmount >= 10000;
      return true; // ALL
    });
  }, [records, gradeFilter, duesFilter]);

  const defaultersOnly = useMemo(() => {
    return filtered.filter((r) => r.outstandingAmount > 0);
  }, [filtered]);

  const totalUncollected = useMemo(() => {
    return filtered.reduce((sum, r) => sum + r.outstandingAmount, 0);
  }, [filtered]);

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedIds.length === defaultersOnly.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(defaultersOnly.map((r) => r.id));
    }
  };

  const toggleSelectOne = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(item => item !== id));
    } else {
      setSelectedIds(prev => [...prev, id]);
    }
  };

  const selectedStudents = useMemo(() => {
    return records.filter((r) => selectedIds.includes(r.id));
  }, [records, selectedIds]);

  const selectedGuardians = (student) => {
    const guardians = student.guardianOptions || [];
    const selection = guardianSelections[student.id] || guardians[0]?.parentId;
    return selection === 'all' ? guardians : guardians.filter((guardian) => guardian.parentId === selection);
  };

  const reminderMessage = (guardianName, students) => {
    const lines = students.map((student, index) =>
      `${index + 1}. ${student.studentName} (${student.grNumber}, ${student.grade} ${student.section}) — INR ${student.outstandingAmount.toLocaleString('en-IN')}`
    );
    return `Dear ${guardianName || 'Parent'}, fee payment reminder from M.V HIGH SCHOOL. Pending fee details:\n${lines.join('\n')}\nKindly settle the outstanding amount at the fee counter. Thank you!`;
  };

  const logPreparedReminder = (student, parentId) => {
    api.post('/fees/whatsapp-reminders/prepared', {
      studentId: student.id,
      parentId,
    }).catch((error) => notify(errMsg(error), 'error'));
  };

  const openWhatsAppReminder = (guardian, entries) => {
    const students = entries.map((entry) => entry.student);
    const message = reminderMessage(guardian.name, students);
    window.open(`https://wa.me/${guardian.whatsappNumber}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    entries.forEach((entry) => logPreparedReminder(entry.student, entry.parentId));
  };

  // Single WhatsApp preparation
  const sendSingleWhatsApp = (student) => {
    const guardians = selectedGuardians(student);
    if (!guardians.length) {
      notify('No active linked parent has a valid WhatsApp number.', 'error');
      return;
    }
    if (guardians.length === 1) {
      openWhatsAppReminder(guardians[0], [{ student, parentId: guardians[0].parentId }]);
      return;
    }
    setBulkQueue(guardians.map((guardian) => ({ guardian, entries: [{ student, parentId: guardian.parentId }] })));
    setBulkMissing(0);
    setBulkIndex(0);
    setBulkModalOpen(true);
  };

  // Start bulk dispatch
  const startBulkDispatch = () => {
    if (selectedStudents.length === 0) return;
    const recipients = new Map();
    let missing = 0;
    selectedStudents.forEach((student) => {
      const guardians = selectedGuardians(student);
      if (!guardians.length) {
        missing += Math.max(1, student.missingGuardianNumbers || 0);
        return;
      }
      missing += student.missingGuardianNumbers || 0;
      guardians.forEach((guardian) => {
        const existing = recipients.get(guardian.whatsappNumber) || { guardian, entries: [] };
        if (!existing.entries.some((entry) => entry.student.id === student.id)) {
          existing.entries.push({ student, parentId: guardian.parentId });
        }
        recipients.set(guardian.whatsappNumber, existing);
      });
    });
    const queue = [...recipients.values()];
    if (!queue.length) {
      notify('None of the selected students has a linked parent with a valid WhatsApp number.', 'error');
      return;
    }
    setBulkQueue(queue);
    setBulkMissing(missing);
    setBulkIndex(0);
    setBulkModalOpen(true);
  };

  // Send next in bulk modal
  const sendNextBulk = () => {
    const reminder = bulkQueue[bulkIndex];
    if (!reminder) return;
    openWhatsAppReminder(reminder.guardian, reminder.entries);
    setBulkIndex(prev => prev + 1);
  };

  // Table columns definition for DataTable
  const columns = [
    {
      label: 'Select',
      sortable: false,
      noExport: true,
      render: (r) => (
        r.outstandingAmount > 0 ? (
          <input
            type="checkbox"
            checked={selectedIds.includes(r.id)}
            onChange={() => toggleSelectOne(r.id)}
            style={{ width: '15px', height: '15px', cursor: 'pointer' }}
          />
        ) : null
      )
    },
    { key: 'grNumber', label: 'GR Number', render: (r) => <span className="mono font-semibold txt-primary">{r.grNumber}</span> },
    { key: 'studentName', label: 'Student Name', render: (r) => <b>{r.studentName}</b> },
    { key: 'grade', label: 'Grade & Sec', render: (r) => <span>{r.grade} - {r.section}</span>, exportValue: (r) => `${r.grade} - ${r.section}` },
    { key: 'guardianMobile', label: 'Registered Guardian', render: (r) => {
      const guardians = r.guardianOptions || [];
      if (!guardians.length) return <span className="small txt-red">No valid linked number</span>;
      if (guardians.length === 1) return (
        <div><b>{guardians[0].name}</b><div className="small mono muted">{guardians[0].mobile}</div></div>
      );
      return (
        <select
          value={guardianSelections[r.id] || guardians[0].parentId}
          onChange={(event) => setGuardianSelections((current) => ({ ...current, [r.id]: event.target.value }))}
          aria-label={`WhatsApp guardian for ${r.studentName}`}
        >
          {guardians.map((guardian) => (
            <option key={guardian.parentId} value={guardian.parentId}>{guardian.name} ({guardian.relation}) — {guardian.mobile}</option>
          ))}
          <option value="all">All valid guardians</option>
        </select>
      );
    }, exportValue: (r) => (r.guardianOptions || []).map((guardian) => `${guardian.name}: ${guardian.mobile}`).join('; ') || 'No valid linked number' },
    { key: 'totalDemand', label: 'Total Demand', render: (r) => <span>{cur}{r.totalDemand.toLocaleString()}</span>, exportValue: (r) => r.totalDemand },
    { key: 'paidAmount', label: 'Paid', render: (r) => <b className="txt-green">{cur}{r.paidAmount.toLocaleString()}</b>, exportValue: (r) => r.paidAmount },
    {
      key: 'outstandingAmount',
      label: 'Outstanding Due',
      render: (r) => (
        r.outstandingAmount > 0 ? (
          <b className="txt-orange">{cur}{r.outstandingAmount.toLocaleString()}</b>
        ) : (
          <Badge value="Settled" color="bg-solid-green" />
        )
      ),
      exportValue: (r) => r.outstandingAmount
    },
    {
      label: 'Actions',
      sortable: false,
      noExport: true,
      render: (r) => (
        r.outstandingAmount > 0 && (r.guardianOptions || []).length ? (
          <button
            onClick={() => sendSingleWhatsApp(r)}
            className="btn btn-sm btn-green"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '4px 10px', fontWeight: '700' }}
          >
            <Send size={12} /> WhatsApp
          </button>
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--txt-muted)', fontStyle: 'italic' }}>{r.outstandingAmount > 0 ? 'Missing number' : 'Paid'}</span>
        )
      )
    }
  ];

  return (
    <div className="space-y-6" style={{ padding: '24px' }}>
      {/* Header */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '20px 24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.7)', boxShadow: '0 8px 32px rgba(31, 38, 135, 0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(37,99,235,0.1), rgba(30,58,138,0.05))', display: 'flex', alignItems: 'center', justifyCentert: 'center', border: '1px solid rgba(37,99,235,0.15)', justifyContent: 'center' }}>
            <Landmark size={24} className="txt-primary" />
          </div>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '-0.02em', color: 'var(--txt)', margin: 0 }}>
              Outstanding Fee Dues &amp; Arrears
            </h2>
            <p style={{ fontSize: '12.5px', color: 'var(--txt-muted)', marginTop: '2px', fontWeight: '500' }}>
              Track student unpaid balances, validate parent contacts, and dispatch bulk reminders.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {selectedIds.length > 0 && (
            <button
              onClick={startBulkDispatch}
              className="btn btn-green"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', padding: '10px 20px', borderRadius: '10px', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)', border: 'none', cursor: 'pointer' }}
            >
              <Send size={14} /> Prepare WhatsApp Reminders ({selectedIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="kpi-grid">
        {/* KPI Card 1 */}
        <div className="kpi-card" style={{ background: 'linear-gradient(135deg, rgba(254,247,237,0.85), rgba(254,242,242,0.65))', border: '1px solid rgba(251,146,60,0.22)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '80px', height: '80px', background: 'rgba(249,115,22,0.04)', borderRadius: '50%' }}></div>
          <div className="kpi-top-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div className="kpi-icon" style={{ background: 'rgba(249,115,22,0.1)', borderColor: 'rgba(249,115,22,0.25)', color: '#ea580c' }}>
              <Landmark size={18} />
            </div>
            <span style={{ fontSize: '10px', fontWeight: '700', background: 'rgba(234,88,12,0.1)', color: '#c2410c', padding: '2px 8px', borderRadius: '20px' }}>Pending Ledger</span>
          </div>
          <div className="kpi-body" style={{ marginTop: '14px', width: '100%' }}>
            <div className="kpi-value" style={{ fontSize: '26px', fontWeight: '900', letterSpacing: '-0.02em', color: '#1e293b' }}>
              {cur}{totalUncollected.toLocaleString()}
            </div>
            <div className="kpi-label" style={{ fontWeight: '600', color: '#475569', fontSize: '12px', marginTop: '2px' }}>Total Outstanding Balance</div>
            <div style={{ fontSize: '11px', color: '#ea580c', marginTop: '6px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ea580c' }}></span>
              Across {defaultersOnly.length} Defaulters
            </div>
          </div>
        </div>
        
        {/* KPI Card 2 */}
        <div className="kpi-card" style={{ background: 'linear-gradient(135deg, rgba(240,253,244,0.85), rgba(236,252,254,0.65))', border: '1px solid rgba(22,163,74,0.22)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '80px', height: '80px', background: 'rgba(22,163,74,0.04)', borderRadius: '50%' }}></div>
          <div className="kpi-top-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div className="kpi-icon" style={{ background: 'rgba(22,163,74,0.1)', borderColor: 'rgba(22,163,74,0.25)', color: '#15803d' }}>
              <CheckCircle2 size={18} />
            </div>
            <span style={{ fontSize: '10px', fontWeight: '700', background: 'rgba(22,163,74,0.1)', color: '#166534', padding: '2px 8px', borderRadius: '20px' }}>Reminders Queue</span>
          </div>
          <div className="kpi-body" style={{ marginTop: '14px', width: '100%' }}>
            <div className="kpi-value" style={{ fontSize: '26px', fontWeight: '900', letterSpacing: '-0.02em', color: '#1e293b' }}>
              {selectedIds.length} <span style={{ fontSize: '15px', fontWeight: '500', color: '#64748b' }}>Students</span>
            </div>
            <div className="kpi-label" style={{ fontWeight: '600', color: '#475569', fontSize: '12px', marginTop: '2px' }}>Selected for Reminders</div>
            <div style={{ fontSize: '11px', color: '#166534', marginTop: '6px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }}></span>
              Ready for parent validation
            </div>
          </div>
        </div>

        {/* KPI Card 3 */}
        <div className="kpi-card" style={{ background: 'linear-gradient(135deg, rgba(254,242,242,0.85), rgba(255,241,242,0.65))', border: '1px solid rgba(220,38,38,0.22)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '80px', height: '80px', background: 'rgba(220,38,38,0.04)', borderRadius: '50%' }}></div>
          <div className="kpi-top-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div className="kpi-icon" style={{ background: 'rgba(220,38,38,0.1)', borderColor: 'rgba(220,38,38,0.25)', color: '#dc2626' }}>
              <AlertCircle size={18} />
            </div>
            <span style={{ fontSize: '10px', fontWeight: '700', background: 'rgba(220,38,38,0.1)', color: '#991b1b', padding: '2px 8px', borderRadius: '20px' }}>High Risk</span>
          </div>
          <div className="kpi-body" style={{ marginTop: '14px', width: '100%' }}>
            <div className="kpi-value" style={{ fontSize: '26px', fontWeight: '900', letterSpacing: '-0.02em', color: '#1e293b' }}>
              {filtered.filter((o) => o.outstandingAmount >= 5000).length} <span style={{ fontSize: '15px', fontWeight: '500', color: '#64748b' }}>Students</span>
            </div>
            <div className="kpi-label" style={{ fontWeight: '600', color: '#475569', fontSize: '12px', marginTop: '2px' }}>Critical Defaulters</div>
            <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '6px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#dc2626' }}></span>
              Dues over {cur}5,000
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '16px 20px', borderRadius: '12px', border: '1px solid rgba(226,232,240,0.8)', background: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(8px)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.03)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(226,232,240,0.6)' }}>
            <Filter size={14} style={{ color: 'var(--txt-muted)' }} />
            <span style={{ fontSize: '11.5px', fontWeight: '700', color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Filters</span>
          </div>
          
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', color: 'var(--txt)', fontWeight: '600', fontSize: '13px', outline: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <option value="ALL">All Grades / Standards</option>
            {classes.map((c) => (
              <option key={c._id} value={c.name}>{c.name} {c.section} ({c.academicYear})</option>
            ))}
          </select>

          {/* Dues Filter Toggle Group */}
          <div style={{ display: 'inline-flex', background: 'rgba(241, 245, 249, 0.8)', border: '1px solid var(--border)', padding: '3px', borderRadius: '10px', gap: '2px' }}>
            <button
              onClick={() => setDuesFilter('DEFAULTERS')}
              style={{ border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', transition: 'all 0.2s', background: duesFilter === 'DEFAULTERS' ? 'linear-gradient(135deg, #f97316, #ea580c)' : 'transparent', color: duesFilter === 'DEFAULTERS' ? '#fff' : 'var(--txt-muted)' }}
            >
              ⚠️ Unpaid Only
            </button>
            <button
              onClick={() => setDuesFilter('OVER_5K')}
              style={{ border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', transition: 'all 0.2s', background: duesFilter === 'OVER_5K' ? 'linear-gradient(135deg, #f97316, #ea580c)' : 'transparent', color: duesFilter === 'OVER_5K' ? '#fff' : 'var(--txt-muted)' }}
            >
              &gt; {cur}5,000
            </button>
            <button
              onClick={() => setDuesFilter('OVER_10K')}
              style={{ border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', transition: 'all 0.2s', background: duesFilter === 'OVER_10K' ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'transparent', color: duesFilter === 'OVER_10K' ? '#fff' : 'var(--txt-muted)' }}
            >
              &gt; {cur}10,000
            </button>
            <button
              onClick={() => setDuesFilter('ALL')}
              style={{ border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', transition: 'all 0.2s', background: duesFilter === 'ALL' ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'transparent', color: duesFilter === 'ALL' ? '#fff' : 'var(--txt-muted)' }}
            >
              All Records
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--txt-muted)' }}>{filtered.length} Students Listed</span>
          {defaultersOnly.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="btn btn-sm btn-gray"
              style={{ fontSize: '12px', fontWeight: '700', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
            >
              {selectedIds.length === defaultersOnly.length ? 'Deselect All' : 'Select All Defaulters'}
            </button>
          )}
        </div>
      </div>

      {/* Outstandings Table */}
      {loading ? (
        <div className="glass-card" style={{ padding: '64px', textAlign: 'center', borderRadius: '16px', border: '1px solid rgba(226,232,240,0.8)', background: '#fff' }}>
          <div style={{ display: 'inline-flex', width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(37,99,235,0.06)', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
            <Loader2 className="animate-spin" style={{ color: 'var(--primary)' }} size={24} />
          </div>
          <p style={{ fontWeight: '700', fontSize: '14.5px', color: 'var(--txt)' }}>Loading Outstanding Ledger...</p>
          <p style={{ fontSize: '12px', color: 'var(--txt-muted)', marginTop: '4px' }}>Compiling demands, waivers, and collection history</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          title="Outstanding Fee Dues Report"
          exportName={`Outstanding_Fees_${gradeFilter}_${new Date().toISOString().slice(0,10)}`}
        />
      )}


      {/* WhatsApp Bulk Modal */}
      {bulkModalOpen && bulkQueue.length > 0 && (() => {
        const total = bulkQueue.length;
        const done = bulkIndex;
        const currentReminder = bulkQueue[bulkIndex];
        const progress = Math.round((done / total) * 100);
        const isFinished = done >= total;

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border)', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Send size={16} className="txt-green" />
                  WhatsApp Fee Reminder Queue
                </h3>
                <button onClick={() => setBulkModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--txt-muted)', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '700', marginBottom: '6px' }}>
                    <span>Prepared {done} of {total} unique guardian reminders</span>
                    <span className="txt-green">{progress}%</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--bg)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: 'var(--txt-green)', borderRadius: '4px', transition: 'width 0.3s ease' }}></div>
                  </div>
                </div>

                {!isFinished && currentReminder ? (
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '9px', fontWeight: '800', background: 'var(--border)', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                        Guardian {bulkIndex + 1} of {total}
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: '700', fontFamily: 'monospace' }}>{currentReminder.guardian.mobile}</span>
                    </div>

                    <div>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>{currentReminder.guardian.name}</h4>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--txt-muted)' }}>{currentReminder.guardian.relation} · {currentReminder.entries.length} linked student{currentReminder.entries.length === 1 ? '' : 's'}</p>
                    </div>

                    <div className="outstanding-reminder-summary" style={{ display: 'grid', gap: '10px', background: 'var(--bg-card)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: '9px', color: 'var(--txt-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Student(s)</p>
                        <p style={{ margin: '2px 0 0', fontWeight: '700' }}>{currentReminder.entries.map((entry) => entry.student.studentName).join(', ')}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: 0, fontSize: '9px', color: 'var(--txt-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Combined Pending Dues</p>
                        <p style={{ margin: '2px 0 0', fontWeight: '700', color: 'var(--txt-orange)', fontFamily: 'monospace' }}>{cur}{currentReminder.entries.reduce((sum, entry) => sum + entry.student.outstandingAmount, 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <CheckCircle2 size={36} className="txt-green" style={{ margin: '0 auto 8px' }} />
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>All Reminders Prepared</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--txt-muted)' }}>WhatsApp was opened for every reachable guardian. Delivery is confirmed only inside WhatsApp.</p>
                  </div>
                )}

                <div style={{ background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.2)', padding: '12px', borderRadius: '10px', display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--txt-orange)', fontWeight: '500' }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <p style={{ margin: 0 }}>Each click opens one unique guardian reminder for manual sending. Shared parent numbers are grouped, and {bulkMissing} unreachable guardian/student recipient{bulkMissing === 1 ? '' : 's'} {bulkMissing === 1 ? 'is' : 'are'} skipped.</p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                  <button onClick={() => setBulkModalOpen(false)} className="btn btn-gray" style={{ padding: '8px 16px', fontSize: '12px' }}>
                    {isFinished ? 'Done' : 'Pause / Close'}
                  </button>
                  {!isFinished && (
                    <button onClick={sendNextBulk} className="btn btn-green" style={{ padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Send size={12} /> Open WhatsApp for {currentReminder?.guardian.name}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
