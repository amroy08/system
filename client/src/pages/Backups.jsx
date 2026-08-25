import { useCallback, useEffect, useState } from 'react';
import { Archive, CheckCircle2, DatabaseBackup, Download, HardDrive, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { Badge, Confirm, DataTable } from '../components/ui';

function formatBytes(bytes = 0) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export default function Backups() {
  const { notify } = useApp();
  const [backups, setBackups] = useState([]);
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState('');
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [verified, setVerified] = useState({});

  const load = useCallback(async () => {
    try {
      const [{ data: rows }, { data: status }] = await Promise.all([api.get('/backups'), api.get('/backups/health')]);
      setBackups(rows);
      setHealth(status);
    } catch (error) { notify(errMsg(error), 'error'); }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy('create');
    try {
      await api.post('/backups', { reason: 'Manual administrator snapshot' });
      notify('Complete system backup created');
      await load();
    } catch (error) { notify(errMsg(error), 'error'); }
    setBusy('');
  };

  const verify = async (backup) => {
    setBusy(`verify-${backup.id}`);
    try {
      const { data } = await api.post(`/backups/${backup.id}/verify`);
      setVerified((current) => ({ ...current, [backup.id]: data.verifiedAt }));
      notify('Backup integrity verified');
    } catch (error) { notify(errMsg(error), 'error'); }
    setBusy('');
  };

  const download = async (backup) => {
    setBusy(`download-${backup.id}`);
    try {
      const { data } = await api.get(`/backups/${backup.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${backup.id}.tar.gz`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) { notify(errMsg(error), 'error'); }
    setBusy('');
  };

  const restore = async () => {
    const backup = restoreTarget;
    setRestoreTarget(null);
    setBusy(`restore-${backup.id}`);
    try {
      const { data } = await api.post(`/backups/${backup.id}/restore`, {
        confirmation: backup.id,
        reason: 'Administrator approved full-system restore',
      });
      notify(`System restored. Safety backup: ${data.safetyBackupId}`);
      window.setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      notify(errMsg(error), 'error');
      setBusy('');
    }
  };

  const columns = [
    { label: 'Created', value: (row) => row.createdAt || '', render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleString() : 'Unknown' },
    { label: 'Type', key: 'type', render: (row) => <Badge value={row.type} color={row.type === 'manual' ? 'bg-blue' : row.type === 'pre-restore' ? 'bg-yellow' : 'bg-green'} /> },
    { label: 'Created By', key: 'createdBy' },
    { label: 'Contents', value: (row) => `${row.fileCount || 0} files`, render: (row) => <span>{row.fileCount || 0} files · {formatBytes(row.totalBytes)}</span> },
    { label: 'Integrity', value: (row) => verified[row.id] ? 'verified' : 'not verified', render: (row) => verified[row.id] ? <Badge value="verified" color="bg-green" /> : <span className="muted">Verify when needed</span> },
    { label: 'Actions', sortable: false, noExport: true, render: (row) => (
      <div className="row-actions backup-row-actions">
        <button className="act-green" title="Verify integrity" disabled={!!busy} onClick={() => verify(row)}><ShieldCheck size={15} /></button>
        <button className="act-blue" title="Download backup" disabled={!!busy} onClick={() => download(row)}><Download size={15} /></button>
        <button className="act-orange" title="Restore this backup" disabled={!!busy} onClick={() => setRestoreTarget(row)}><RotateCcw size={15} /></button>
      </div>
    ) },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2><DatabaseBackup size={20} /> System Backup & Recovery</h2>
          <p className="small muted">Protect database records and uploaded documents together.</p>
        </div>
        <div className="spacer" />
        <button className="btn btn-gray" disabled={!!busy} onClick={load}><RefreshCw size={15} /> Refresh</button>
        <button className="btn btn-green" disabled={!!busy || !health?.supported} onClick={create}>
          <Archive size={15} /> {busy === 'create' ? 'Creating…' : 'Create Backup'}
        </button>
      </div>

      {!health?.supported && <div className="card card-pad backup-warning">Managed backups must be configured with the database provider for driver: {health?.driver}.</div>}

      <div className="backup-health-grid">
        <div className="backup-health-card"><HardDrive size={18} /><span>Protected data</span><b>{formatBytes((health?.dataBytes || 0) + (health?.uploadBytes || 0))}</b></div>
        <div className="backup-health-card"><DatabaseBackup size={18} /><span>Available backups</span><b>{health?.backupCount || 0}</b></div>
        <div className="backup-health-card"><CheckCircle2 size={18} /><span>Last completed</span><b>{health?.lastBackupAt ? new Date(health.lastBackupAt).toLocaleString() : 'Not yet'}</b></div>
        <div className="backup-health-card"><RefreshCw size={18} /><span>Automatic schedule</span><b>{health?.enabled ? `Every ${health.intervalHours} hours` : 'Disabled'}</b></div>
      </div>

      <div className="card card-pad backup-policy">
        <ShieldCheck size={18} />
        <div><b>Safe restore policy</b><span>Every restore is verified first and creates a separate pre-restore safety backup. Scheduled backups retain the latest {health?.retention || 30} snapshots.</span></div>
      </div>

      <DataTable columns={columns} rows={backups} title="System Backups" exportName="system-backups" defaultPageSize={10} />

      {restoreTarget && (
        <Confirm
          title="Restore complete system?"
          message={`Restore ${restoreTarget.id}? Current records and uploaded files will be replaced after a new safety backup is created. Users should stop editing until the restore finishes.`}
          yesLabel="Create Safety Backup & Restore"
          onNo={() => setRestoreTarget(null)}
          onYes={restore}
        />
      )}
    </>
  );
}
