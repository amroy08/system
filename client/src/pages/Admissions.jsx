import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserPlus, Plus, Eye, XCircle, School, CheckCircle2 } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';
import { useLookups } from '../hooks/useLookups';
import { DataTable, StatusTabs, Field, Modal, Badge, CredentialsModal } from '../components/ui';

const EMPTY = {
  firstName: '', lastName: '', gender: 'Male', dob: '', nationality: '', curriculum: 'IB PYP',
  classAppliedFor: '', academicYear: '2024-2025', address: '',
  parentName: '', parentRelation: 'Father', parentMobile: '', parentEmail: '', parentOccupation: '',
};

export default function Admissions() {
  const { notify } = useApp();
  const { classes } = useLookups(['classes']);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('all');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [enroll, setEnroll] = useState({ classId: '', rollNo: '', admissionDate: '', transportRequired: false, transportRoute: '', studentPassword: '', parentPassword: '' });
  const [reason, setReason] = useState('');
  const [params] = useSearchParams();

  const load = () => api.get('/admissions').then(({ data }) => setRows(data));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (params.get('add')) { setForm(EMPTY); setModal({ type: 'form' }); } }, [params]);

  const counts = useMemo(() => ({
    all: rows.length,
    registered: rows.filter((r) => r.status === 'registered').length,
    admitted: rows.filter((r) => r.status === 'admitted').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
  }), [rows]);

  const filtered = tab === 'all' ? rows : rows.filter((r) => r.status === tab);

  const save = async () => {
    try {
      if (modal.data?._id) await api.put(`/admissions/${modal.data._id}`, form);
      else await api.post('/admissions', form);
      notify('Registration saved');
      setModal(null); load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const doEnroll = async () => {
    try {
      const { data } = await api.post(`/admissions/${modal.data._id}/enroll`, enroll);
      notify('Admission confirmed!');
      setModal({ type: 'credentials', data: data.credentials, name: `${modal.data.firstName} ${modal.data.lastName || ''}`.trim() });
      load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const doReject = async () => {
    try {
      await api.post(`/admissions/${modal.data._id}/reject`, { reason });
      notify('Application rejected');
      setModal(null); load();
    } catch (e) { notify(errMsg(e), 'error'); }
  };

  const columns = [
    { key: 'regNo', label: 'Reg #', render: (r) => <span className="mono">{r.regNo}</span> },
    { key: 'firstName', label: 'Applicant', render: (r) => <b>{r.firstName} {r.lastName}</b>, exportValue: (r) => `${r.firstName} ${r.lastName}` },
    { key: 'gender', label: 'Gender' },
    { key: 'dob', label: 'DOB' },
    { key: 'classAppliedFor', label: 'Class Applied' },
    { key: 'academicYear', label: 'Academic Year' },
    { key: 'parentName', label: 'Parent / Guardian', render: (r) => <div>{r.parentName}<div className="small muted">{r.parentMobile}</div></div> },
    { key: 'status', label: 'Status', render: (r) => (
      <div>
        <Badge value={r.status} />
        {r.status === 'rejected' && (
          <div className="small link-like" onClick={() => setModal({ type: 'reason', data: r })}>View Reason</div>
        )}
        {r.status === 'admitted' && r.admissionNo && <div className="small muted mono">{r.admissionNo}</div>}
      </div>
    )},
    { label: 'Actions', sortable: false, noExport: true, render: (r) => (
      <div className="row-actions">
        <button className="act-view" title="View" onClick={() => setModal({ type: 'view', data: r })}><Eye size={15} /></button>
        {r.status === 'registered' && (<>
          <button className="act-green" title="Enroll to Class" onClick={() => {
            setEnroll({ classId: '', rollNo: '', admissionDate: new Date().toISOString().slice(0, 10), transportRequired: false, transportRoute: '', studentPassword: '', parentPassword: '' });
            setModal({ type: 'enroll', data: r });
          }}><School size={15} /></button>
          <button className="act-del" title="Reject" onClick={() => { setReason(''); setModal({ type: 'reject', data: r }); }}><XCircle size={15} /></button>
        </>)}
      </div>
    )},
  ];

  return (
    <>
      <div className="page-head">
        <h2><UserPlus size={20} /> Admissions Management</h2>
        <div className="spacer" />
        <button className="btn btn-green" onClick={() => { setForm(EMPTY); setModal({ type: 'form' }); }}>
          <Plus size={15} /> New Registration
        </button>
      </div>

      <StatusTabs active={tab} onChange={setTab} tabs={[
        { key: 'all', label: 'All', count: counts.all, color: 'navy' },
        { key: 'registered', label: 'Registered', count: counts.registered, color: 'teal' },
        { key: 'admitted', label: 'Admitted', count: counts.admitted, color: 'green' },
        { key: 'rejected', label: 'Rejected', count: counts.rejected, color: 'red' },
      ]} />

      <DataTable columns={columns} rows={filtered} title="Admissions Report" exportName="admissions" />

      {/* New registration / edit */}
      {modal?.type === 'form' && (
        <Modal title={modal.data ? 'Edit Registration' : 'New Registration'} icon={UserPlus} size="lg" onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" onClick={save}>Save Registration</button>
          </>}>
          <div className="form-grid">
            <div className="form-section">Applicant Information</div>
            <Field label="First Name" required><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
            <Field label="Last Name"><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
            <Field label="Gender"><select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option>Male</option><option>Female</option></select></Field>
            <Field label="Date of Birth"><input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></Field>
            <Field label="Nationality"><input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} /></Field>
            <Field label="Curriculum"><select value={form.curriculum} onChange={(e) => setForm({ ...form, curriculum: e.target.value })}><option>IB PYP</option><option>CBSE</option><option>ICSE</option><option>State Board</option></select></Field>
            <Field label="Class Applied For" required>
              <select value={form.classAppliedFor} onChange={(e) => setForm({ ...form, classAppliedFor: e.target.value })}>
                <option value="">Select…</option>
                {[...new Set(classes.map((c) => c.name))].map((n) => <option key={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Academic Year" required><input value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} /></Field>
            <Field label="Address" full><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <div className="form-section">Parent / Guardian Information</div>
            <Field label="Parent Name" required><input value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} /></Field>
            <Field label="Relation"><select value={form.parentRelation} onChange={(e) => setForm({ ...form, parentRelation: e.target.value })}><option>Father</option><option>Mother</option><option>Guardian</option></select></Field>
            <Field label="Mobile"><input value={form.parentMobile} onChange={(e) => setForm({ ...form, parentMobile: e.target.value })} /></Field>
            <Field label="Email"><input value={form.parentEmail} onChange={(e) => setForm({ ...form, parentEmail: e.target.value })} /></Field>
            <Field label="Occupation"><input value={form.parentOccupation} onChange={(e) => setForm({ ...form, parentOccupation: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {/* Enroll to class */}
      {modal?.type === 'enroll' && (
        <Modal title={`Enroll to Class — ${modal.data.firstName} ${modal.data.lastName}`} icon={School} onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-green" onClick={doEnroll} disabled={!enroll.classId}><CheckCircle2 size={15} /> Confirm Admission</button>
          </>}>
          <div className="form-grid">
            <Field label="Class" required>
              <select value={enroll.classId} onChange={(e) => setEnroll({ ...enroll, classId: e.target.value })}>
                <option value="">Select class…</option>
                {classes.filter((c) => c.status === 'active').map((c) => <option key={c._id} value={c._id}>{c.name} {c.section} ({c.academicYear})</option>)}
              </select>
            </Field>
            <Field label="Roll No"><input value={enroll.rollNo} onChange={(e) => setEnroll({ ...enroll, rollNo: e.target.value })} /></Field>
            <Field label="Admission Date"><input type="date" value={enroll.admissionDate} onChange={(e) => setEnroll({ ...enroll, admissionDate: e.target.value })} /></Field>
            <Field label="Student Login Password" hint="Leave blank for default: student123"><input value={enroll.studentPassword} onChange={(e) => setEnroll({ ...enroll, studentPassword: e.target.value })} /></Field>
            <Field label="Parent Login Password" hint="Leave blank for default: parent123"><input value={enroll.parentPassword} onChange={(e) => setEnroll({ ...enroll, parentPassword: e.target.value })} /></Field>
            <Field label="Transport Required">
              <select value={enroll.transportRequired ? 'yes' : 'no'} onChange={(e) => setEnroll({ ...enroll, transportRequired: e.target.value === 'yes' })}>
                <option value="no">No</option><option value="yes">Yes</option>
              </select>
            </Field>
            <Field label="Transport Route"><input value={enroll.transportRoute} disabled={!enroll.transportRequired} onChange={(e) => setEnroll({ ...enroll, transportRoute: e.target.value })} /></Field>
          </div>
          <p className="small muted mt">Confirming admission creates the student record, links/creates the parent, and generates login accounts automatically.</p>
        </Modal>
      )}

      {/* Login credentials (shown once after enrolling) */}
      {modal?.type === 'credentials' && (
        <CredentialsModal credentials={modal.data} name={modal.name} onClose={() => setModal(null)} />
      )}

      {/* Reject */}
      {modal?.type === 'reject' && (
        <Modal title="Reject Application" icon={XCircle} size="sm" onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-gray" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-red" onClick={doReject}>Reject Application</button>
          </>}>
          <Field label="Reason for rejection" required full>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Age criteria not met" />
          </Field>
        </Modal>
      )}

      {/* View reason */}
      {modal?.type === 'reason' && (
        <Modal title="Rejection Reason" icon={XCircle} size="sm" onClose={() => setModal(null)}>
          <p><b>{modal.data.firstName} {modal.data.lastName}</b> ({modal.data.regNo})</p>
          <p className="mt" style={{ background: '#fee2e2', padding: 12, borderRadius: 8, color: '#b91c1c' }}>{modal.data.rejectReason}</p>
        </Modal>
      )}

      {/* View */}
      {modal?.type === 'view' && (
        <Modal title={`${modal.data.firstName} ${modal.data.lastName} — ${modal.data.regNo}`} icon={Eye} onClose={() => setModal(null)}>
          <div className="form-grid">
            {[['Status', modal.data.status], ['Gender', modal.data.gender], ['DOB', modal.data.dob],
              ['Nationality', modal.data.nationality], ['Class Applied', modal.data.classAppliedFor],
              ['Academic Year', modal.data.academicYear], ['Parent', `${modal.data.parentName} (${modal.data.parentRelation})`],
              ['Parent Mobile', modal.data.parentMobile], ['Parent Email', modal.data.parentEmail],
              ['Address', modal.data.address], ['Admission #', modal.data.admissionNo],
            ].map(([k, v]) => <div key={k} className="field"><label>{k}</label><div style={{ fontWeight: 600 }}>{v || '—'}</div></div>)}
          </div>
        </Modal>
      )}
    </>
  );
}
