import {
  Megaphone, CalendarDays, NotebookPen, BookMarked, ShieldAlert, Award, Trophy,
  LifeBuoy, MessageSquareWarning, FolderOpen, UsersRound, Receipt, Landmark,
} from 'lucide-react';
import CrudPage from '../components/CrudPage';
import { Badge } from '../components/ui';
import { useLookups, className, studentName } from '../hooks/useLookups';
import { useApp } from '../context/AppContextValue';
import { AttachmentLink } from '../components/Attachment';

const STAFF = ['admin', 'clerk', 'supervisor'];
const STAFF_TEACHER = ['admin', 'clerk', 'supervisor', 'teacher'];
const ALL = ['admin', 'clerk', 'supervisor', 'teacher', 'student', 'parent'];

const classOptions = (lk) => (lk.classes || []).map((c) => ({ value: c._id, label: `${c.name} ${c.section} (${c.academicYear})` }));
const subjectOptions = (lk) => (lk.subjects || []).map((s) => ({ value: s._id, label: s.name }));
const studentOptions = (lk) => (lk.students || []).filter((s) => s.status === 'active').map((s) => ({ value: s._id, label: `${s.firstName} ${s.lastName || ''} (${s.admissionNo})` }));
const studentClassId = (students, studentId) => (students || []).find((s) => s._id === studentId)?.classId || '';
const selectedClassStudentOptions = (lk, form) => {
  if (!form.classId) return [];
  return (lk.students || [])
    .filter((s) => s.status === 'active' && s.classId === form.classId)
    .map((s) => ({ value: s._id, label: `${s.firstName} ${s.lastName || ''} (${s.admissionNo})` }));
};

/* ---------------- Notices ---------------- */
const parentGradeRecipientHint = (lk, form) => {
  const selectedClassIds = form.classIds?.length ? new Set(form.classIds) : null;
  const students = (lk.students || []).filter((record) => record.status === 'active' && (!selectedClassIds || selectedClassIds.has(record.classId)));
  const parentIds = new Set(students.flatMap((record) => record.parentIds || []));
  const parents = (lk.parents || []).filter((record) => record.status === 'active' && (!selectedClassIds || parentIds.has(record._id)));
  const valid = new Set();
  let missing = 0;
  let dummy = 0;
  let invalid = 0;
  for (const parent of parents) {
    const email = String(parent.email || '').trim().toLowerCase();
    if (!email) missing++;
    else if (email.endsWith('@mvhs.edu.in')) dummy++;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid++;
    else valid.add(email);
  }
  return `${valid.size} deliverable · ${missing} missing · ${dummy} dummy · ${invalid} invalid. Leave all grades unselected to notify every eligible parent.`;
};

export function Notices() {
  const lookups = useLookups(['classes', 'students', 'parents']);

  return <CrudPage lookups={lookups} cfg={{
    endpoint: '/notices', title: 'School Notices', icon: Megaphone, addLabel: 'Post Notice', writeRoles: STAFF,
    tabs: [
      { key: 'published', label: 'Published', color: 'green' },
      { key: 'draft', label: 'Draft', color: 'gray' },
    ],
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'title', label: 'Title', render: (r) => <b>{r.title}</b> },
      { key: 'classIds', label: 'Target Grades', render: (r) => {
        const labels = (r.classIds || []).map((id) => className(lookups.classes || [], id));
        return labels.length ? <span title={labels.join(', ')}>{labels.slice(0, 2).join(', ')}{labels.length > 2 ? ` +${labels.length - 2}` : ''}</span> : <Badge value="All Grades" color="bg-blue" />;
      }},
      { key: 'postedBy', label: 'Posted By' },
      { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
      { key: 'emailStatus', label: 'Email', render: (r) => <Badge value={r.emailStatus || 'not sent'} color={r.emailStatus === 'sent' ? 'bg-green' : r.emailStatus === 'failed' ? 'bg-red' : r.emailStatus === 'no-recipients' ? 'bg-yellow' : 'bg-gray'} /> },
      { key: 'attachment', label: 'Attachment', sortable: false, render: (r) => <AttachmentLink attachment={r.attachment} compact /> },
    ],
    fields: [
      { name: 'title', label: 'Title', required: true, full: true },
      { name: 'body', label: 'Notice Body', type: 'textarea', full: true },
      { name: 'attachment', label: 'PDF / Image Attachment', type: 'attachment', scope: 'notice', full: true, default: null },
      { name: 'classIds', label: 'Notify Grades / Sections', type: 'multiselect', options: classOptions, default: [], full: true, hint: parentGradeRecipientHint },
      { name: 'date', label: 'Date', type: 'date', default: new Date().toISOString().slice(0, 10) },
      { name: 'status', label: 'Status', type: 'select', options: ['published', 'draft'], default: 'published' },
    ],
    viewFields: (r, lk) => {
      const labels = (r.classIds || []).map((id) => className(lk.classes || [], id));
      return [['Title', r.title], ['Target Grades', labels.join(', ') || 'All Grades'], ['Date', r.date], ['Posted By', r.postedBy], ['Notice', r.body]];
    },
  }} />;
}
/* ---------------- Calendar ---------------- */
export function CalendarPage() {
  const lookups = useLookups(['classes']);
  return <CrudPage lookups={lookups} cfg={{
    endpoint: '/calendar', title: 'School Calendar', icon: CalendarDays, addLabel: 'Add Event', writeRoles: STAFF,
    tabs: [
      { key: 'holiday', label: 'Holidays', color: 'red', match: (r) => r.type === 'holiday' },
      { key: 'event', label: 'Events', color: 'teal', match: (r) => r.type === 'event' },
      { key: 'exam', label: 'Exams', color: 'purple', match: (r) => r.type === 'exam' },
    ],
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'title', label: 'Event', render: (r) => <b>{r.title}</b> },
      { key: 'type', label: 'Type', render: (r) => <Badge value={r.type} /> },
      { key: 'classIds', label: 'Target Grades', render: (r) => {
        const labels = (r.classIds || []).map((id) => className(lookups.classes || [], id));
        return labels.length ? <span title={labels.join(', ')}>{labels.slice(0, 2).join(', ')}{labels.length > 2 ? ` +${labels.length - 2}` : ''}</span> : <Badge value="All Grades" color="bg-blue" />;
      } },
      { key: 'description', label: 'Description' },
    ],
    fields: [
      { name: 'title', label: 'Title', required: true, full: true },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'type', label: 'Type', type: 'select', options: ['event', 'holiday', 'exam', 'meeting'], default: 'event' },
      { name: 'classIds', label: 'Notify Grades / Sections', type: 'multiselect', options: classOptions, default: [], full: true, hint: parentGradeRecipientHint },
      { name: 'description', label: 'Description', type: 'textarea', full: true },
    ],
  }} />;
}

/* ---------------- Lesson Planning ---------------- */
export function LessonPlanning() {
  const lookups = useLookups(['classes', 'subjects']);
  const { user } = useApp();
  return <CrudPage lookups={lookups} cfg={{
    endpoint: '/lesson-plans', title: 'Lesson Planning', icon: NotebookPen, addLabel: 'New Lesson Plan', writeRoles: STAFF_TEACHER,
    tabs: [
      { key: 'planned', label: 'Planned', color: 'teal' },
      { key: 'completed', label: 'Completed', color: 'green' },
    ],
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'teacherName', label: 'Teacher' },
      { key: 'classId', label: 'Class', value: (r) => className(lookups.classes, r.classId) },
      { key: 'subjectId', label: 'Subject', value: (r) => lookups.subjects.find((s) => s._id === r.subjectId)?.name || '—' },
      { key: 'topic', label: 'Topic', render: (r) => <b>{r.topic}</b> },
      { key: 'homework', label: 'Homework' },
      { key: 'attachment', label: 'Material', sortable: false, render: (r) => <AttachmentLink attachment={r.attachment} compact /> },
      { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
    ],
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true, default: new Date().toISOString().slice(0, 10) },
      { name: 'teacherName', label: 'Teacher', default: user?.fullName },
      { name: 'classId', label: 'Class', type: 'select', options: classOptions, required: true },
      { name: 'subjectId', label: 'Subject', type: 'select', options: subjectOptions, required: true },
      { name: 'topic', label: 'Topic', required: true, full: true },
      { name: 'objectives', label: 'Learning Objectives', type: 'textarea', full: true },
      { name: 'activities', label: 'Activities', type: 'textarea', full: true },
      { name: 'homework', label: 'Homework', full: true },
      { name: 'shareWithFamilies', label: 'Share Lesson Material with Students / Parents?', type: 'checkbox', default: false },
      { name: 'attachment', label: 'Lesson Plan PDF / Image', type: 'attachment', scope: 'lessonPlan', full: true, default: null },
      { name: 'status', label: 'Status', type: 'select', options: ['planned', 'completed'], default: 'planned' },
    ],
    viewFields: (r, lk) => [['Date', r.date], ['Teacher', r.teacherName], ['Class', className(lk.classes, r.classId)],
      ['Topic', r.topic], ['Objectives', r.objectives], ['Activities', r.activities], ['Homework', r.homework]],
  }} />;
}

/* ---------------- Teaching Logbook ---------------- */
export function Logbook() {
  const lookups = useLookups(['classes', 'subjects']);
  const { user } = useApp();
  return <CrudPage lookups={lookups} cfg={{
    endpoint: '/logbook', title: 'Teaching Logbook', icon: BookMarked, addLabel: 'Add Log Entry', writeRoles: STAFF_TEACHER,
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'teacherName', label: 'Teacher' },
      { key: 'classId', label: 'Class', value: (r) => className(lookups.classes, r.classId) },
      { key: 'subjectId', label: 'Subject', value: (r) => lookups.subjects.find((s) => s._id === r.subjectId)?.name || '—' },
      { key: 'topicCovered', label: 'Topic Covered', render: (r) => <b>{r.topicCovered}</b> },
      { key: 'homeworkGiven', label: 'Homework Given' },
      { key: 'remarks', label: 'Remarks' },
    ],
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true, default: new Date().toISOString().slice(0, 10) },
      { name: 'teacherName', label: 'Teacher', default: user?.fullName },
      { name: 'classId', label: 'Class', type: 'select', options: classOptions, required: true },
      { name: 'subjectId', label: 'Subject', type: 'select', options: subjectOptions, required: true },
      { name: 'topicCovered', label: 'Topic Covered', required: true, full: true },
      { name: 'homeworkGiven', label: 'Homework Given', full: true },
      { name: 'remarks', label: 'Remarks', type: 'textarea', full: true },
    ],
  }} />;
}

/* ---------------- Discipline ---------------- */
export function Discipline() {
  const lookups = useLookups(['students']);
  const { user } = useApp();
  return <CrudPage lookups={lookups} cfg={{
    endpoint: '/discipline', title: 'Discipline Management', icon: ShieldAlert, addLabel: 'Report Incident', writeRoles: STAFF_TEACHER,
    tabs: [
      { key: 'open', label: 'Open', color: 'red' },
      { key: 'closed', label: 'Closed', color: 'green' },
    ],
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'studentId', label: 'Student', value: (r) => r.studentName || studentName(lookups.students, r.studentId), render: (r) => <b>{r.studentName || studentName(lookups.students, r.studentId)}</b> },
      { key: 'incident', label: 'Incident' },
      { key: 'severity', label: 'Severity', render: (r) => <Badge value={r.severity} /> },
      { key: 'actionTaken', label: 'Action Taken' },
      { key: 'parentNotified', label: 'Parent Notified', render: (r) => <Badge value={r.parentNotified ? 'Yes' : 'No'} color={r.parentNotified ? 'bg-green' : 'bg-gray'} /> },
      { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
    ],
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true, default: new Date().toISOString().slice(0, 10) },
      { name: 'studentId', label: 'Student', type: 'select', options: studentOptions, required: true },
      { name: 'incident', label: 'Incident Description', type: 'textarea', required: true, full: true },
      { name: 'severity', label: 'Severity', type: 'select', options: ['low', 'medium', 'high', 'critical'], default: 'low' },
      { name: 'actionTaken', label: 'Action Taken', full: true },
      { name: 'parentNotified', label: 'Parent Notified?', type: 'checkbox' },
      { name: 'reportedBy', label: 'Reported By', default: user?.fullName },
      { name: 'status', label: 'Status', type: 'select', options: ['open', 'closed'], default: 'open' },
    ],
    viewFields: (r, lk) => [['Date', r.date], ['Student', r.studentName || studentName(lk.students, r.studentId)],
      ['Severity', r.severity], ['Incident', r.incident], ['Action Taken', r.actionTaken],
      ['Parent Notified', r.parentNotified ? 'Yes' : 'No'], ['Reported By', r.reportedBy], ['Status', r.status]],
  }} />;
}

/* ---------------- Conduct ---------------- */
export function Conduct() {
  const lookups = useLookups(['classes', 'students']);
  const { user } = useApp();
  return <CrudPage lookups={lookups} cfg={{
    endpoint: '/conduct', title: 'Conduct Register', icon: Award, addLabel: 'Add Entry', writeRoles: STAFF_TEACHER,
    tabs: [
      { key: 'merit', label: 'Merits', color: 'green', match: (r) => r.type === 'merit' },
      { key: 'demerit', label: 'Demerits', color: 'red', match: (r) => r.type === 'demerit' },
    ],
    filters: [
      {
        name: 'classId',
        label: 'Grade / Class',
        type: 'select',
        allLabel: 'All grades',
        options: classOptions,
        match: (r, value) => (r.classId || studentClassId(lookups.students, r.studentId)) === value,
      },
      { name: 'type', label: 'Type', type: 'select', allLabel: 'All types', options: ['merit', 'demerit'] },
    ],
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'classId', label: 'Grade / Class', value: (r) => className(lookups.classes, r.classId || studentClassId(lookups.students, r.studentId)) },
      { key: 'studentId', label: 'Student', value: (r) => r.studentName || studentName(lookups.students, r.studentId), render: (r) => <b>{r.studentName || studentName(lookups.students, r.studentId)}</b> },
      { key: 'type', label: 'Type', render: (r) => <Badge value={r.type} /> },
      { key: 'points', label: 'Points', render: (r) => <b className={r.type === 'merit' ? 'txt-green' : 'txt-red'}>{r.type === 'merit' ? '+' : '−'}{r.points}</b> },
      { key: 'note', label: 'Note' },
      { key: 'by', label: 'Recorded By' },
    ],
    fields: [
      { name: 'date', label: 'Date', type: 'date', default: new Date().toISOString().slice(0, 10) },
      { name: 'classId', label: 'Grade / Class', type: 'select', options: classOptions, required: true, onChange: () => ({ studentId: '' }) },
      {
        name: 'studentId',
        label: 'Student',
        type: 'select',
        options: selectedClassStudentOptions,
        required: true,
        hint: (lk, form) => form.classId ? 'Only students from the selected grade are shown.' : 'Select a grade first to load students.',
      },
      { name: 'type', label: 'Type', type: 'select', options: ['merit', 'demerit'], default: 'merit' },
      { name: 'points', label: 'Points', type: 'number', default: 5 },
      { name: 'note', label: 'Note', full: true },
      { name: 'by', label: 'Recorded By', default: user?.fullName },
    ],
    prepareForm: (r, lk, emptyForm) => ({ ...emptyForm, ...r, classId: r.classId || studentClassId(lk.students, r.studentId) }),
    viewFields: (r, lk) => [
      ['Date', r.date],
      ['Grade / Class', className(lk.classes, r.classId || studentClassId(lk.students, r.studentId))],
      ['Student', r.studentName || studentName(lk.students, r.studentId)],
      ['Type', r.type],
      ['Points', r.points],
      ['Note', r.note],
      ['Recorded By', r.by],
    ],
  }} />;
}

/* ---------------- Activities ---------------- */
export function Activities() {
  const lookups = useLookups(['classes', 'students', 'parents']);
  return <CrudPage lookups={lookups} cfg={{
    endpoint: '/activities', title: 'Activities', icon: Trophy, addLabel: 'Add Activity', writeRoles: STAFF_TEACHER,
    tabs: [
      { key: 'scheduled', label: 'Scheduled', color: 'teal' },
      { key: 'completed', label: 'Completed', color: 'green' },
    ],
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'title', label: 'Activity', render: (r) => <b>{r.title}</b> },
      { key: 'type', label: 'Type', render: (r) => <Badge value={r.type} color="bg-purple" /> },
      { key: 'classIds', label: 'Target Grades', render: (r) => {
        const labels = (r.classIds || []).map((id) => className(lookups.classes || [], id));
        return labels.length ? <span title={labels.join(', ')}>{labels.slice(0, 2).join(', ')}{labels.length > 2 ? ` +${labels.length - 2}` : ''}</span> : <Badge value="All Grades" color="bg-blue" />;
      } },
      { key: 'inCharge', label: 'In-charge' },
      { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
      { key: 'emailStatus', label: 'Email', render: (r) => <Badge value={r.emailStatus || 'not sent'} color={r.emailStatus === 'sent' ? 'bg-green' : r.emailStatus === 'failed' ? 'bg-red' : r.emailStatus === 'no-recipients' ? 'bg-yellow' : 'bg-gray'} /> },
    ],
    fields: [
      { name: 'title', label: 'Activity Title', required: true, full: true },
      { name: 'type', label: 'Type', type: 'select', options: ['Sports', 'Cultural', 'Academic', 'Community', 'Club'], default: 'Sports' },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'inCharge', label: 'In-charge' },
      { name: 'status', label: 'Status', type: 'select', options: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
      { name: 'classIds', label: 'Notify Grades / Sections', type: 'multiselect', options: classOptions, default: [], full: true, hint: parentGradeRecipientHint },
      { name: 'description', label: 'Description', type: 'textarea', full: true },
    ],
  }} />;
}

/* ---------------- Helpdesk ---------------- */
export function Helpdesk() {
  const { user } = useApp();
  return <CrudPage cfg={{
    endpoint: '/helpdesk', title: 'Helpdesk', icon: LifeBuoy, addLabel: 'Raise Ticket', writeRoles: STAFF, createRoles: ALL,
    tabs: [
      { key: 'open', label: 'Open', color: 'red' },
      { key: 'in-progress', label: 'In Progress', color: 'orange' },
      { key: 'resolved', label: 'Resolved', color: 'green' },
    ],
    columns: [
      { key: 'subject', label: 'Subject', render: (r) => <b>{r.subject}</b> },
      { key: 'category', label: 'Category', render: (r) => <Badge value={r.category} color="bg-gray" /> },
      { key: 'raisedBy', label: 'Raised By', render: (r) => <div>{r.raisedBy}<div className="small muted">{r.role}</div></div> },
      { key: 'priority', label: 'Priority', render: (r) => <Badge value={r.priority} /> },
      { key: 'assignedTo', label: 'Assigned To', render: (r) => r.assignedTo || <span className="muted">—</span> },
      { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
    ],
    fields: [
      { name: 'subject', label: 'Subject', required: true, full: true },
      { name: 'description', label: 'Description', type: 'textarea', full: true },
      { name: 'category', label: 'Category', type: 'select', options: ['Portal', 'Fees', 'Academics', 'Infrastructure', 'Transport', 'Other'], default: 'Other' },
      { name: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high'], default: 'medium' },
      { name: 'raisedBy', label: 'Raised By', default: user?.username },
      { name: 'role', label: 'Role', default: user?.role },
      { name: 'assignedTo', label: 'Assigned To' },
      { name: 'status', label: 'Status', type: 'select', options: ['open', 'in-progress', 'resolved', 'closed'], default: 'open' },
    ],
    viewFields: (r) => [['Subject', r.subject], ['Category', r.category], ['Priority', r.priority],
      ['Raised By', `${r.raisedBy} (${r.role})`], ['Assigned To', r.assignedTo], ['Status', r.status], ['Description', r.description]],
  }} />;
}

/* ---------------- Complaints ---------------- */
export function Complaints() {
  const { user } = useApp();
  return <CrudPage cfg={{
    endpoint: '/complaints', title: 'Complaints Management', icon: MessageSquareWarning, addLabel: 'File Complaint', writeRoles: STAFF, createRoles: ALL,
    tabs: [
      { key: 'open', label: 'Open', color: 'red' },
      { key: 'resolved', label: 'Resolved', color: 'green' },
    ],
    columns: [
      { key: 'subject', label: 'Subject', render: (r) => <b>{r.subject}</b> },
      { key: 'against', label: 'Against', render: (r) => <Badge value={r.against} color="bg-gray" /> },
      { key: 'raisedBy', label: 'Filed By', render: (r) => <div>{r.raisedBy}<div className="small muted">{r.role}</div></div> },
      { key: 'severity', label: 'Severity', render: (r) => <Badge value={r.severity} /> },
      { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
    ],
    fields: [
      { name: 'subject', label: 'Subject', required: true, full: true },
      { name: 'description', label: 'Description', type: 'textarea', full: true },
      { name: 'against', label: 'Against (dept/person)', full: true },
      { name: 'severity', label: 'Severity', type: 'select', options: ['low', 'medium', 'high'], default: 'medium' },
      { name: 'raisedBy', label: 'Filed By', default: user?.username },
      { name: 'role', label: 'Role', default: user?.role },
      { name: 'status', label: 'Status', type: 'select', options: ['open', 'resolved', 'dismissed'], default: 'open' },
      { name: 'resolution', label: 'Resolution', type: 'textarea', full: true },
    ],
    viewFields: (r) => [['Subject', r.subject], ['Against', r.against], ['Severity', r.severity],
      ['Filed By', `${r.raisedBy} (${r.role})`], ['Status', r.status], ['Description', r.description], ['Resolution', r.resolution]],
  }} />;
}

/* ---------------- Documents ---------------- */
export function Documents() {
  const { user } = useApp();
  const lookups = useLookups(['classes', 'students', 'parents']);
  return <CrudPage lookups={lookups} cfg={{
    endpoint: '/documents', title: 'Documents', icon: FolderOpen, addLabel: 'Add Document', writeRoles: STAFF,
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'title', label: 'Document', render: (r) => <b>{r.title}</b> },
      { key: 'category', label: 'Category', render: (r) => <Badge value={r.category} color="bg-blue" /> },
      { key: 'classIds', label: 'Target Grades', render: (r) => {
        const labels = (r.classIds || []).map((id) => className(lookups.classes || [], id));
        return labels.length ? <span title={labels.join(', ')}>{labels.slice(0, 2).join(', ')}{labels.length > 2 ? ` +${labels.length - 2}` : ''}</span> : <Badge value="All Grades" color="bg-blue" />;
      } },
      { key: 'emailStatus', label: 'Email', render: (r) => <Badge value={r.emailStatus || 'pending'} color={r.emailStatus === 'sent' ? 'bg-green' : r.emailStatus === 'no-recipients' ? 'bg-yellow' : 'bg-gray'} /> },
      { key: 'uploadedBy', label: 'Uploaded By' },
      { key: 'link', label: 'Link', sortable: false, render: (r) => r.link && r.link !== '#'
        ? <a className="link-like" href={r.link} target="_blank" rel="noreferrer">Open</a> : <span className="muted">—</span> },
      { key: 'attachment', label: 'File', sortable: false, render: (r) => <AttachmentLink attachment={r.attachment} compact /> },
    ],
    fields: [
      { name: 'title', label: 'Title', required: true, full: true },
      { name: 'category', label: 'Category', type: 'select', options: ['General', 'Exams', 'HR', 'Policies', 'Forms'], default: 'General' },
      { name: 'classIds', label: 'Notify Grades / Sections', type: 'multiselect', options: classOptions, default: [], full: true, hint: parentGradeRecipientHint },
      { name: 'link', label: 'Link / URL', full: true, placeholder: 'https://…' },
      { name: 'attachment', label: 'Upload PDF / Image', type: 'attachment', scope: 'document', full: true, default: null },
      { name: 'date', label: 'Date', type: 'date', default: new Date().toISOString().slice(0, 10) },
      { name: 'uploadedBy', label: 'Uploaded By', default: user?.fullName },
    ],
  }} />;
}

/* ---------------- PTM ---------------- */
export function PTM() {
  const lookups = useLookups(['classes', 'students', 'parents']);
  return <CrudPage lookups={lookups} cfg={{
    endpoint: '/ptm', title: 'Parent-Teacher Meetings', icon: UsersRound, addLabel: 'Schedule PTM', writeRoles: STAFF_TEACHER,
    tabs: [
      { key: 'scheduled', label: 'Scheduled', color: 'teal' },
      { key: 'completed', label: 'Completed', color: 'green' },
    ],
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'title', label: 'Meeting', render: (r) => <b>{r.title}</b> },
      { key: 'classIds', label: 'Target Grades', render: (r) => {
        const ids = r.classIds?.length ? r.classIds : r.classId && r.classId !== 'all' ? [r.classId] : [];
        const labels = ids.map((id) => className(lookups.classes || [], id));
        return labels.length ? <span title={labels.join(', ')}>{labels.slice(0, 2).join(', ')}{labels.length > 2 ? ` +${labels.length - 2}` : ''}</span> : <Badge value="All Grades" color="bg-blue" />;
      } },
      { key: 'slots', label: 'Slots' },
      { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
      { key: 'emailStatus', label: 'Email', render: (r) => <Badge value={r.emailStatus || 'not sent'} color={r.emailStatus === 'sent' ? 'bg-green' : r.emailStatus === 'failed' ? 'bg-red' : 'bg-gray'} /> },
      { key: 'notes', label: 'Notes' },
    ],
    fields: [
      { name: 'title', label: 'Title', required: true, full: true },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'classIds', label: 'Target Grades / Sections', type: 'multiselect', options: classOptions, default: [], full: true, hint: parentGradeRecipientHint },
      { name: 'slots', label: 'Slot Details', placeholder: 'e.g. 09:00-12:00, 15 min each', full: true },
      { name: 'status', label: 'Status', type: 'select', options: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true },
    ],
  }} />;
}

/* ---------------- Fee Structure ---------------- */
export function FeeStructure() {
  const { settings } = useApp();
  const lookups = useLookups(['classes']);
  const cur = settings.currency || '₹';
  const years = [...new Set((lookups.classes || []).map((item) => item.academicYear).filter(Boolean))];
  const annualAmount = (row) => Number(row.amount || 0) * ({ monthly: 12, quarterly: 4, 'bi-annual': 2 }[row.frequency] || 1);
  return <CrudPage lookups={lookups} cfg={{
    endpoint: '/fee-structures', title: 'Official Fee Structure', icon: Receipt,
    addLabel: 'Add Fee Component', writeRoles: ['admin'], archiveMode: true, modalSize: 'lg',
    tabs: [
      { key: 'active', label: 'Active', color: 'green' },
      { key: 'archived', label: 'Archived', color: 'gray' },
    ],
    columns: [
      { key: 'name', label: 'Fee Component', render: (r) => <b>{r.name}</b> },
      { key: 'academicYear', label: 'Academic Year', render: (r) => <Badge value={r.academicYear || 'All Years'} color="bg-blue" /> },
      { key: 'appliesTo', label: 'Applies To', render: (r) => <Badge value={({ ALL: 'All Students', NEW_ADMISSION: 'New Admissions', EXISTING: 'Existing Students' }[r.appliesTo]) || (r.category === 'one-time' ? 'New Admissions' : 'All Students')} color="bg-teal" /> },
      { key: 'classIds', label: 'Assigned Grades', render: (r) => {
        const names = (r.classIds || []).map((id) => lookups.classes?.find((item) => item._id === id)).filter(Boolean).map((item) => `${item.name} ${item.section}`);
        return names.length ? <span title={names.join(', ')}>{names.slice(0, 2).join(', ')}{names.length > 2 ? ` +${names.length - 2}` : ''}</span> : '—';
      } },
      { key: 'frequency', label: 'Frequency', render: (r) => <Badge value={r.frequency} color="bg-purple" /> },
      { key: 'amount', label: 'Rate', value: (r) => r.amount, render: (r) => <b>{cur}{Number(r.amount || 0).toLocaleString()}</b> },
      { key: 'annualAmount', label: 'Annual Total', value: annualAmount, render: (r) => <b>{cur}{annualAmount(r).toLocaleString()}</b> },
      { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
    ],
    fields: [
      { name: 'name', label: 'Fee Component Name', required: true },
      { name: 'academicYear', label: 'Academic Year', type: 'select', options: years, required: true, default: years[0] || '' },
      { name: 'category', label: 'Fee Category', type: 'select', options: ['tuition', 'exam', 'activity', 'transport', 'one-time', 'lab', 'other'], default: 'tuition', required: true },
      { name: 'appliesTo', label: 'Student Type', type: 'select', options: [
        { value: 'ALL', label: 'All Students' },
        { value: 'NEW_ADMISSION', label: 'New Admissions' },
        { value: 'EXISTING', label: 'Existing Students' },
      ], default: 'ALL', required: true },
      { name: 'frequency', label: 'Frequency', type: 'select', options: ['monthly', 'quarterly', 'bi-annual', 'annual', 'one-time'], default: 'monthly', required: true },
      { name: 'amount', label: 'Rate Per Period', type: 'number', required: true, hint: 'The annual total is calculated from this rate and frequency.' },
      { name: 'classIds', label: 'Assign to Grades / Sections', type: 'multiselect', options: (lk, form) => classOptions({ classes: (lk.classes || []).filter((item) => !form.academicYear || item.academicYear === form.academicYear) }), default: [], required: true, full: true },
      { name: 'status', label: 'Status', type: 'select', options: ['active', 'archived'], default: 'active' },
    ],
  }} />;
}

/* ---------------- Daily Accounts ---------------- */
const ACCOUNT_CATEGORIES = [
  'Fees', 'Admission', 'Donation', 'Administration', 'Travel', 'Utilities', 'Supplies',
  'Maintenance', 'Salary', 'Transport', 'Stationery', 'Printing', 'Repairs', 'Events', 'Other',
];
const ACCOUNT_MODES = ['cash', 'online', 'upi', 'card', 'check', 'bank transfer'];

export function DailyAccounts() {
  const { settings, user } = useApp();
  const cur = settings.currency || '₹';
  return <CrudPage cfg={{
    endpoint: '/daily-accounts', title: 'Daily Accounts', icon: Landmark, addLabel: 'Add Entry', writeRoles: STAFF,
    formClassName: (form) => `daily-account-form ${form.type === 'income' ? 'income' : 'expense'}`,
    tabs: [
      { key: 'income', label: 'Income', color: 'green', match: (r) => r.type === 'income' },
      { key: 'expense', label: 'Expense', color: 'red', match: (r) => r.type === 'expense' },
    ],
    filters: [
      { name: 'type', label: 'Ledger Type', type: 'select', allLabel: 'All entries', options: [
        { value: 'income', label: 'Income only' },
        { value: 'expense', label: 'Expense only' },
      ] },
      { name: 'category', label: 'Category', type: 'select', allLabel: 'All categories', options: ACCOUNT_CATEGORIES },
      { name: 'mode', label: 'Payment Mode', type: 'select', allLabel: 'All modes', options: ACCOUNT_MODES },
      { name: 'fromDate', label: 'From Date', type: 'date', match: (r, value) => !r.date || r.date >= value },
      { name: 'toDate', label: 'To Date', type: 'date', match: (r, value) => !r.date || r.date <= value },
    ],
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'type', label: 'Type', render: (r) => <Badge value={r.type} /> },
      { key: 'category', label: 'Category', render: (r) => <Badge value={r.category} color="bg-gray" /> },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount', value: (r) => r.amount, render: (r) => (
        <b className={r.type === 'income' ? 'txt-green' : 'txt-red'}>
          {r.type === 'income' ? '+' : '−'}{cur}{(r.amount || 0).toLocaleString()}
        </b>
      )},
      { key: 'mode', label: 'Mode', render: (r) => <Badge value={r.mode} color="bg-gray" /> },
      { key: 'recordedBy', label: 'Recorded By' },
    ],
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true, default: new Date().toISOString().slice(0, 10) },
      { name: 'type', label: 'Type', type: 'select', options: ['income', 'expense'], default: 'expense' },
      { name: 'category', label: 'Category', type: 'select', options: ACCOUNT_CATEGORIES, default: 'Other', hint: 'Use categories like Administration or Travel for expense reports. Fee receipts remain Fees income.' },
      { name: 'amount', label: 'Amount', type: 'number', required: true, placeholder: '0.00' },
      { name: 'mode', label: 'Mode', type: 'select', options: ACCOUNT_MODES, default: 'cash' },
      { name: 'recordedBy', label: 'Recorded By', default: user?.fullName },
      { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Add a short note about this transaction', full: true },
    ],
    viewFields: (r) => [
      ['Date', r.date],
      ['Type', r.type],
      ['Category', r.category],
      ['Amount', `${r.type === 'income' ? '+' : '−'}${cur}${Number(r.amount || 0).toLocaleString()}`],
      ['Mode', r.mode],
      ['Recorded By', r.recordedBy],
      ['Description', r.description],
    ],
  }} />;
}
