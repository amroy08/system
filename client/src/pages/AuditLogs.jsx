import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, RefreshCw, Filter, Clock, User } from 'lucide-react';
import { api, errMsg } from '../api';
import { Badge } from '../components/ui';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const [actionFilter, setActionFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        limit: pageSize,
        skip: page * pageSize,
      };
      if (actionFilter) params.action = actionFilter;
      if (roleFilter) params.actorRole = roleFilter;

      const { data } = await api.get('/audit-logs', { params });
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(errMsg(err, 'Failed to load audit logs'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, actionFilter, roleFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const formatDetails = (details, _action) => {
    if (!details) return '—';
    if (typeof details === 'string') return details;

    if (details.action === 'FEE_PAYMENT') {
      return (
        <span style={{ fontSize: '0.85rem' }}>
          Receipt: <b>{details.receiptNo}</b> | Student: <b>{details.studentName}</b> | Paid: <b>₹{details.amountPaid}</b> ({details.mode})
        </span>
      );
    }
    if (details.action === 'FEE_REFUND') {
      return (
        <span style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>
          Refund: <b>{details.receiptNo}</b> | Amount: <b>₹{details.amountRefunded}</b> | Reason: {details.reason}
        </span>
      );
    }
    if (details.action === 'STUDENT_DELETE') {
      return (
        <span style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>
          Deleted Student: <b>{details.studentName}</b> (Adm: {details.admissionNo})
        </span>
      );
    }
    if (details.action === 'PASSWORD_RESET') {
      return (
        <span style={{ fontSize: '0.85rem' }}>
          Password reset for user: <b>{details.targetUser}</b> ({details.targetRole})
        </span>
      );
    }
    return JSON.stringify(details);
  };

  const getActionBadge = (action, details) => {
    if (details?.action === 'FEE_REFUND') return <Badge value="Refund" color="bg-red" />;
    if (details?.action === 'FEE_PAYMENT') return <Badge value="Fee Payment" color="bg-green" />;
    if (details?.action === 'STUDENT_DELETE') return <Badge value="Student Deleted" color="bg-red" />;
    if (details?.action === 'PASSWORD_RESET') return <Badge value="Password Reset" color="bg-purple" />;

    if (action.includes('DELETE')) return <Badge value="Delete" color="bg-red" />;
    if (action.includes('POST')) return <Badge value="Create" color="bg-green" />;
    if (action.includes('PUT') || action.includes('PATCH')) return <Badge value="Update" color="bg-blue" />;
    return <Badge value="Action" color="bg-gray" />;
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldAlert size={24} className="txt-red" /> Security & Financial Audit Logs
          </h1>
          <p className="page-subtitle muted">
            Tamper-evident record of all administrative changes, deletions, fee collections, and user modifications.
          </p>
        </div>
        <button className="btn btn-blue" onClick={loadLogs} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div className="alert alert-danger mb">{error}</div>}

      <div className="card card-pad mb" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Filter size={16} className="muted" />
          <span className="small muted">Filter Action:</span>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
            className="input-select"
            style={{ width: 170 }}
          >
            <option value="">All Actions</option>
            <option value="fees">Fees & Refunds</option>
            <option value="students">Students</option>
            <option value="users">Users & Passwords</option>
            <option value="DELETE">Deletions</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={16} className="muted" />
          <span className="small muted">Actor Role:</span>
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}
            className="input-select"
            style={{ width: 150 }}
          >
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="clerk">Clerk</option>
            <option value="supervisor">Supervisor</option>
            <option value="teacher">Teacher</option>
          </select>
        </div>

        <div style={{ marginLeft: 'auto', fontSize: '0.88rem', color: 'var(--txt-muted)' }}>
          Total logged events: <b>{total}</b>
        </div>
      </div>

      <div className="table-card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 180 }}>Time</th>
                <th style={{ width: 130 }}>Event</th>
                <th style={{ width: 160 }}>Actor</th>
                <th>Resource / Details</th>
                <th style={{ width: 130 }}>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '30px' }}>
                    <RefreshCw size={20} className="spin txt-blue mb" />
                    <div>Loading audit events…</div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={5} style={{ textAlign: 'center', padding: '30px' }}>No audit events recorded yet</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={13} className="muted" />
                        <span style={{ fontSize: '0.85rem' }}>
                          {new Date(log.occurredAt).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                          })}
                        </span>
                      </div>
                    </td>
                    <td>{getActionBadge(log.action, log.details)}</td>
                    <td>
                      <div><b>{log.actorName || 'System'}</b></div>
                      <div className="small muted">{log.actorRole || 'system'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{log.resource || log.action}</div>
                      {log.details && (
                        <div style={{ marginTop: 4 }}>
                          {formatDetails(log.details, log.action)}
                        </div>
                      )}
                    </td>
                    <td className="mono small muted">{log.ip || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="table-foot no-print">
          <span>
            Showing {total === 0 ? 0 : page * pageSize + 1} to {Math.min(total, (page + 1) * pageSize)} of {total} events
          </span>
          <div className="pages">
            <button disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span style={{ padding: '0 10px', fontSize: '0.85rem', alignSelf: 'center' }}>
              Page {page + 1} of {totalPages}
            </span>
            <button disabled={page >= totalPages - 1 || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
