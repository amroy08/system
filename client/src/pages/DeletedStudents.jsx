import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserX, RefreshCw, Trash2, Wallet, Eye, Phone, MapPin, AlertCircle,
  CheckCircle2, Search, Filter, ArrowLeft, ArrowUpRight, Receipt, Loader2,
  GraduationCap
} from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups } from '../hooks/useLookups';
import { DataTable, Badge, Modal, Confirm } from '../components/ui';
import { formatClass } from '../utils/classNames';

export default function DeletedStudents() {
  const { notify, user } = useApp();
  const navigate = useNavigate();
  const { classes = [] } = useLookups(['classes']);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState('ALL');
  const [search, setSearch] = useState('');
  
  // Modals state
  const [viewStudent, setViewStudent] = useState(null);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [permanentDelTarget, setPermanentDelTarget] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [deletingPermanent, setDeletingPermanent] = useState(false);

  const canPermanentlyDelete = user?.role === 'admin';
  const canRestore = ['admin', 'clerk'].includes(user?.role);

  const loadDeleted = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/students/deleted-records');
      setRecords(data || []);
    } catch (e) {
      notify(errMsg(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeleted();
  }, []);

  const classMap = useMemo(() => {
    return new Map(classes.map((c) => [c._id, formatClass(c)]));
  }, [classes]);

  // Filter records by grade/class and search
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (selectedClassId !== 'ALL' && r.classId !== selectedClassId) return false;
      if (search) {
        const q = search.toLowerCase();
        const fullName = `${r.firstName || ''} ${r.lastName || ''}`.toLowerCase();
        const adm = String(r.admissionNo || '').toLowerCase();
        const parent = String(r.parentName || '').toLowerCase();
        const contact = String(r.parentMobile || '').toLowerCase();
        if (!fullName.includes(q) && !adm.includes(q) && !parent.includes(q) && !contact.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [records, selectedClassId, search]);

  // Handle Restore
  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await api.post(`/students/${restoreTarget._id}/restore`);
      notify(`Student "${restoreTarget.firstName} ${restoreTarget.lastName || ''}" restored back to ERP`);
      setRestoreTarget(null);
      loadDeleted();
    } catch (e) {
      notify(errMsg(e), 'error');
    } finally {
      setRestoring(false);
    }
  };

  // Handle Permanent Delete
  const handlePermanentDelete = async () => {
    if (!permanentDelTarget) return;
    setDeletingPermanent(true);
    try {
      await api.delete(`/students/${permanentDelTarget._id}/permanent`);
      notify(`Student "${permanentDelTarget.firstName} ${permanentDelTarget.lastName || ''}" permanently purged from system`);
      setPermanentDelTarget(null);
      loadDeleted();
    } catch (e) {
      notify(errMsg(e), 'error');
    } finally {
      setDeletingPermanent(false);
    }
  };

  // Direct Navigate to Fee Collection for Deleted Student
  const handleCollectFee = (student) => {
    navigate(`/fees?studentId=${student._id}`);
  };

  const columns = [
    {
      key: 'admissionNo',
      label: 'Adm No / GR',
      render: (r) => (
        <div>
          <span className="mono font-semibold txt-primary" style={{ fontSize: 13 }}>{r.admissionNo}</span>
          {r.grNumber && <div className="small muted mono" style={{ fontSize: 11 }}>GR: {r.grNumber}</div>}
        </div>
      ),
      exportValue: (r) => r.admissionNo
    },
    {
      key: 'name',
      label: 'Student Name',
      render: (r) => (
        <div>
          <b style={{ fontSize: 13.5 }}>{r.firstName} {r.lastName}</b>
          <div className="small muted" style={{ fontSize: 11 }}>
            Roll: <b>{r.rollNo || '—'}</b> · {r.gender || '—'}
          </div>
        </div>
      ),
      exportValue: (r) => `${r.firstName} ${r.lastName || ''}`.trim()
    },
    {
      key: 'classId',
      label: 'Standard / Division',
      render: (r) => <span>{classMap.get(r.classId) || '—'}</span>,
      exportValue: (r) => classMap.get(r.classId) || ''
    },
    {
      key: 'parent',
      label: 'Parent & Contact',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 12.5 }}>{r.parentName || '—'}</div>
          <div className="small mono muted" style={{ fontSize: 11 }}>{r.parentMobile || 'No contact'}</div>
        </div>
      ),
      exportValue: (r) => `${r.parentName || ''} (${r.parentMobile || ''})`
    },
    {
      key: 'financials',
      label: 'Fee Summary',
      render: (r) => {
        const total = r.totalDemand || 0;
        const paid = r.totalPaidLifetime || 0;
        const out = r.outstanding || Math.max(0, total - paid);
        return (
          <div style={{ fontSize: 12 }}>
            <div>Demand: <b>₹{total.toLocaleString()}</b></div>
            <div style={{ color: out > 0 ? '#ea580c' : '#16a34a', fontWeight: 700 }}>
              {out > 0 ? `Pending: ₹${out.toLocaleString()}` : 'Settled'}
            </div>
          </div>
        );
      },
      exportValue: (r) => `Demand: ${r.totalDemand || 0}, Pending: ${r.outstanding || 0}`
    },
    {
      key: 'deletedMeta',
      label: 'Deleted On',
      render: (r) => (
        <div style={{ fontSize: 11.5, color: '#64748b' }}>
          <div>{r.deletedAt ? new Date(r.deletedAt).toLocaleDateString() : '—'}</div>
          {r.deletedBy && <div className="muted small">By: {r.deletedBy}</div>}
        </div>
      ),
      exportValue: (r) => r.deletedAt || ''
    },
    {
      label: 'Actions',
      sortable: false,
      noExport: true,
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={() => setViewStudent(r)}
            className="btn btn-sm btn-gray"
            style={{ padding: '5px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            title="View Full Student Profile"
          >
            <Eye size={12} /> View
          </button>
          
          <button
            onClick={() => handleCollectFee(r)}
            className="btn btn-sm btn-green"
            style={{ padding: '5px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            title="Collect Fee / Record Payment"
          >
            <Wallet size={12} /> Collect Fee
          </button>

          {canRestore && (
            <button
              onClick={() => setRestoreTarget(r)}
              className="btn btn-sm btn-blue"
              style={{ padding: '5px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              title="Restore student back to active ERP roster"
            >
              <RefreshCw size={12} /> Restore
            </button>
          )}

          {canPermanentlyDelete && (
            <button
              onClick={() => setPermanentDelTarget(r)}
              className="btn btn-sm btn-red"
              style={{ padding: '5px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              title="Permanently remove student from database"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="outstanding-wrapper" style={{ padding: '24px' }}>
      {/* Page Header */}
      <div className="outstanding-header-card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(185,28,28,0.06))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(239,68,68,0.2)', flexShrink: 0 }}>
            <UserX size={22} style={{ color: '#dc2626' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--txt)', margin: 0 }}>
              Deleted Students Archive
            </h2>
            <p style={{ fontSize: 12, color: 'var(--txt-muted)', marginTop: 2, fontWeight: 500 }}>
              Safely browse students removed from the active roster. Balances here are excluded from the main dashboard. You can view profiles, collect fees, or restore them anytime.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={loadDeleted}
            className="btn btn-sm btn-gray"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8 }}
          >
            <RefreshCw size={13} /> Refresh List
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="outstanding-kpi-grid">
        <div className="outstanding-kpi-item" style={{ background: 'linear-gradient(135deg, #fef2f2, #fff1f2)', border: '1px solid rgba(239,68,68,0.22)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
              <UserX size={17} />
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, background: 'rgba(239,68,68,0.1)', color: '#b91c1c', padding: '3px 8px', borderRadius: 20 }}>Archived</span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#1e293b' }}>
              {records.length} <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>Students</span>
            </div>
            <div style={{ fontWeight: 600, color: '#475569', fontSize: 12, marginTop: 2 }}>Total Deleted Students</div>
            <div style={{ fontSize: 11, color: '#dc2626', marginTop: 5, fontWeight: 600 }}>
              Isolated from active school lists
            </div>
          </div>
        </div>

        <div className="outstanding-kpi-item" style={{ background: 'linear-gradient(135deg, #fffbf5, #fef3c7)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
              <Wallet size={17} />
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, background: 'rgba(245,158,11,0.1)', color: '#b45309', padding: '3px 8px', borderRadius: 20 }}>Hidden From Dashboard</span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#1e293b' }}>
              ₹{records.reduce((sum, r) => sum + (r.outstanding || Math.max(0, (r.totalDemand || 0) - (r.totalPaidLifetime || 0))), 0).toLocaleString()}
            </div>
            <div style={{ fontWeight: 600, color: '#475569', fontSize: 12, marginTop: 2 }}>Archived Outstanding Dues</div>
            <div style={{ fontSize: 11, color: '#b45309', marginTop: 5, fontWeight: 600 }}>
              Not counted in live school balance
            </div>
          </div>
        </div>

        <div className="outstanding-kpi-item" style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid rgba(22,163,74,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(22,163,74,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
              <CheckCircle2 size={17} />
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, background: 'rgba(22,163,74,0.1)', color: '#15803d', padding: '3px 8px', borderRadius: 20 }}>Safety Safe</span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#1e293b' }}>
              100% <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>Restorable</span>
            </div>
            <div style={{ fontWeight: 600, color: '#475569', fontSize: 12, marginTop: 2 }}>1-Click Restore to Active</div>
            <div style={{ fontSize: 11, color: '#15803d', marginTop: 5, fontWeight: 600 }}>
              Reactivates student login & attendance
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="outstanding-filter-bar">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, flex: '1 1 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(241,245,249,0.8)', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(226,232,240,0.8)' }}>
            <Filter size={13} style={{ color: 'var(--txt-muted)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-muted)', textTransform: 'uppercase' }}>Grade Filter</span>
          </div>

          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--txt)', fontWeight: 600, fontSize: 13, outline: 'none', cursor: 'pointer', minWidth: 200 }}
          >
            <option value="ALL">All Grades / Standards</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>{formatClass(c)}</option>
            ))}
          </select>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 200px', maxWidth: 300 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search name, GR, parent phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px 8px 30px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5 }}
            />
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt-muted)' }}>
          {filteredRecords.length} Students Listed
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="card" style={{ padding: '64px', textAlign: 'center', background: '#fff', borderRadius: 16 }}>
          <Loader2 className="animate-spin txt-primary" size={26} style={{ margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 700, fontSize: 14 }}>Loading Deleted Students Archive...</p>
        </div>
      ) : (
        <div className="outstanding-desktop-table">
          <DataTable
            columns={columns}
            rows={filteredRecords}
            title="Deleted Students Archive Report"
            exportName={`Deleted_Students_${new Date().toISOString().slice(0, 10)}`}
          />
        </div>
      )}

      {/* Mobile Card Feed View */}
      {!loading && (
        <div className="outstanding-mobile-cards">
          {filteredRecords.length === 0 ? (
            <div className="card" style={{ padding: '32px', textAlign: 'center', background: '#fff' }}>
              <p className="muted small">No deleted students matching your filter.</p>
            </div>
          ) : (
            filteredRecords.map((r) => {
              const total = r.totalDemand || 0;
              const paid = r.totalPaidLifetime || 0;
              const out = r.outstanding || Math.max(0, total - paid);
              return (
                <div key={r._id} className="defaulter-card" style={{ borderLeft: '4px solid #ef4444' }}>
                  <div className="defaulter-card-top">
                    <div>
                      <div className="defaulter-student-name">{r.firstName} {r.lastName}</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                        <span className="defaulter-meta-badge">{classMap.get(r.classId) || '—'}</span>
                        <span style={{ fontSize: 11, color: 'var(--txt-muted)', fontFamily: 'monospace' }}>Roll: {r.rollNo || '—'}</span>
                        <span style={{ fontSize: 11, color: 'var(--txt-muted)', fontFamily: 'monospace' }}>Adm: {r.admissionNo}</span>
                      </div>
                    </div>
                    <div>
                      {out > 0 ? (
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#ea580c', background: '#fff7ed', border: '1px solid rgba(251,146,60,0.3)', padding: '3px 8px', borderRadius: 8 }}>
                          Pending ₹{out.toLocaleString()}
                        </span>
                      ) : (
                        <Badge value="Settled" color="bg-solid-green" />
                      )}
                    </div>
                  </div>

                  <div className="defaulter-details-grid">
                    <div className="defaulter-detail-cell">
                      <span className="defaulter-detail-label">Total Fee</span>
                      <span className="defaulter-detail-value">₹{total.toLocaleString()}</span>
                    </div>
                    <div className="defaulter-detail-cell">
                      <span className="defaulter-detail-label">Paid</span>
                      <span className="defaulter-detail-value txt-green">₹{paid.toLocaleString()}</span>
                    </div>
                    <div className="defaulter-detail-cell">
                      <span className="defaulter-detail-label">Balance</span>
                      <span className="defaulter-detail-value" style={{ color: out > 0 ? '#ea580c' : '#16a34a' }}>
                        ₹{out.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="defaulter-guardian-box">
                    <span><b>{r.parentName || 'No parent name'}</b> ({r.parentRelation || 'Guardian'})</span>
                    <span className="mono" style={{ fontWeight: 600 }}>{r.parentMobile || '—'}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                    <button
                      onClick={() => handleCollectFee(r)}
                      className="btn btn-green"
                      style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                    >
                      <Wallet size={13} /> Collect Fee
                    </button>
                    {canRestore && (
                      <button
                        onClick={() => setRestoreTarget(r)}
                        className="btn btn-blue"
                        style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                      >
                        <RefreshCw size={13} /> Restore
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Student Profile View Modal */}
      {viewStudent && (
        <Modal
          title={`Deleted Student Profile — ${viewStudent.firstName} ${viewStudent.lastName || ''}`}
          icon={UserX}
          onClose={() => setViewStudent(null)}
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div>
                <span className="small muted">Admission Number</span>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{viewStudent.admissionNo}</div>
              </div>
              <div>
                <span className="small muted">Standard & Division</span>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{classMap.get(viewStudent.classId) || '—'}</div>
              </div>
              <div>
                <span className="small muted">Roll Number</span>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{viewStudent.rollNo || '—'}</div>
              </div>
              <div>
                <span className="small muted">Date of Birth</span>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{viewStudent.dob || '—'}</div>
              </div>
              <div>
                <span className="small muted">Parent / Guardian</span>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{viewStudent.parentName || '—'} ({viewStudent.parentRelation || '—'})</div>
              </div>
              <div>
                <span className="small muted">Mobile Number</span>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{viewStudent.parentMobile || '—'}</div>
              </div>
              <div>
                <span className="small muted">Residential Address</span>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{viewStudent.address || '—'}</div>
              </div>
              <div>
                <span className="small muted">Account Status</span>
                <div><Badge value="Deleted" color="bg-solid-red" /></div>
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>Financial Ledger Status</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8 }}>
                  <span className="small muted">Annual Demand</span>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>₹{(viewStudent.totalDemand || 0).toLocaleString()}</div>
                </div>
                <div style={{ padding: 10, background: '#f0fdf4', borderRadius: 8 }}>
                  <span className="small muted">Paid to Date</span>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>₹{(viewStudent.totalPaidLifetime || 0).toLocaleString()}</div>
                </div>
                <div style={{ padding: 10, background: '#fff7ed', borderRadius: 8 }}>
                  <span className="small muted">Pending Due</span>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#ea580c' }}>
                    ₹{(viewStudent.outstanding || Math.max(0, (viewStudent.totalDemand || 0) - (viewStudent.totalPaidLifetime || 0))).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button
                onClick={() => {
                  const s = viewStudent;
                  setViewStudent(null);
                  handleCollectFee(s);
                }}
                className="btn btn-green"
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Wallet size={14} /> Collect Fee Now
              </button>
              {canRestore && (
                <button
                  onClick={() => {
                    const s = viewStudent;
                    setViewStudent(null);
                    setRestoreTarget(s);
                  }}
                  className="btn btn-blue"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <RefreshCw size={14} /> Restore Student
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Restore Confirmation Dialog */}
      {restoreTarget && (
        <Confirm
          title="Restore Student?"
          yesLabel="Yes, Restore"
          danger={false}
          message={`Restore student "${restoreTarget.firstName} ${restoreTarget.lastName || ''}" (${restoreTarget.admissionNo}) back into active ERP classes? Their attendance roster and student login will be reactivated.`}
          onNo={() => setRestoreTarget(null)}
          onYes={handleRestore}
        />
      )}

      {/* Permanent Deletion Dialog */}
      {permanentDelTarget && (
        <Confirm
          message={`PERMANENTLY DELETE student "${permanentDelTarget.firstName} ${permanentDelTarget.lastName || ''}" (${permanentDelTarget.admissionNo})? This action CANNOT be undone and will purge all student data completely.`}
          onNo={() => setPermanentDelTarget(null)}
          onYes={handlePermanentDelete}
        />
      )}
    </div>
  );
}
