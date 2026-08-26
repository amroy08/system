import { Router } from 'express';
import { nanoid } from 'nanoid';
import { col } from '../db/index.js';
import { authRequired, allowRoles, STAFF } from '../middleware/auth.js';
import { getStoredFile, putStoredFile } from '../utils/storageService.js';
import { permittedClassIds as getPermittedClassIds } from '../utils/accessScope.js';

const router = Router();
router.use(authRequired);

const ALLOWED_TYPES = {
  'application/pdf': { extension: 'pdf', label: 'PDF' },
  'image/png': { extension: 'png', label: 'PNG' },
  'image/jpeg': { extension: 'jpg', label: 'JPG' },
};
const MAX_BYTES = 8 * 1024 * 1024;
const scopeCollections = {
  lessonPlan: 'lessonPlans',
  homework: 'homework',
  notice: 'notices',
  document: 'documents',
  studentDocument: 'students',
};

const STUDENT_DOCUMENT_TYPES = new Set([
  'profilePhoto', 'studentAadhaar', 'studentIdCard', 'birthCertificate',
  'leavingCertificate', 'transferCertificate', 'previousMarksheet', 'other',
  'parentAadhaar',
]);

function safeName(value) {
  return String(value || 'attachment').replace(/[^a-zA-Z0-9._ -]/g, '').slice(0, 120) || 'attachment';
}

function hasExpectedSignature(buffer, mimeType) {
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (mimeType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  return false;
}

async function findHost(attachment) {
  const collectionName = scopeCollections[attachment.scope];
  if (!collectionName) return null;
  if (attachment.scope === 'studentDocument') {
    return attachment.hostId ? col('students').findOne({ _id: attachment.hostId, status: { $ne: 'deleted' } }) : null;
  }
  const rows = await col(collectionName).find({ _deleted: { $ne: true } });
  return rows.find((row) => row.attachment?._id === attachment._id) || null;
}

async function permittedClassIds(req) {
  if (req.user.role === 'teacher') return getPermittedClassIds(req.user);
  if (req.user.role === 'student') {
    const student = await col('students').findOne({ _id: req.user.refId, status: 'active' });
    return student?.classId ? [student.classId] : [];
  }
  if (req.user.role === 'parent') {
    const students = await col('students').find({ status: 'active' });
    return [...new Set(students.filter((student) => (student.parentIds || []).includes(req.user.refId)).map((student) => student.classId).filter(Boolean))];
  }
  return null;
}

function hostClassIds(host) {
  if (Array.isArray(host.classIds) && host.classIds.length) return host.classIds.filter(Boolean);
  return host.classId && host.classId !== 'all' ? [host.classId] : [];
}

async function canRead(req, attachment) {
  if (attachment.scope === 'studentDocument') return STAFF.includes(req.user.role);
  if (STAFF.includes(req.user.role) || attachment.uploadedById === req.user.id) return true;
  const host = await findHost(attachment);
  if (!host) return false;
  const isFamily = ['student', 'parent'].includes(req.user.role);
  if (isFamily && attachment.scope === 'lessonPlan' && !host.shareWithFamilies) return false;
  if (isFamily && attachment.scope === 'homework' && host.status !== 'active') return false;
  if (isFamily && attachment.scope === 'notice' && host.status !== 'published') return false;
  const allowed = (await permittedClassIds(req)) || [];
  const targets = hostClassIds(host);
  return targets.length === 0 || targets.some((classId) => allowed.includes(classId));
}

router.post('/', allowRoles('admin', 'clerk', 'supervisor', 'teacher'), async (req, res) => {
  try {
    const { fileName, mimeType, data, scope, hostId, documentType } = req.body;
    const type = ALLOWED_TYPES[mimeType];
    if (!type) return res.status(400).json({ error: 'Only PDF, PNG, JPG and JPEG files are allowed' });
    if (!scopeCollections[scope]) return res.status(400).json({ error: 'Invalid attachment destination' });
    if (scope === 'studentDocument') {
      if (!STAFF.includes(req.user.role)) return res.status(403).json({ error: 'Only authorized staff can manage student documents' });
      if (!hostId || !(await col('students').findOne({ _id: hostId, status: { $ne: 'deleted' } }))) return res.status(404).json({ error: 'Student not found' });
      if (!STUDENT_DOCUMENT_TYPES.has(documentType)) return res.status(400).json({ error: 'Invalid student document type' });
      if (documentType === 'profilePhoto' && !mimeType.startsWith('image/')) {
        return res.status(400).json({ error: 'Student photos must be PNG, JPG or JPEG images' });
      }
    }
    const encoded = String(data || '').replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(encoded, 'base64');
    if (!buffer.length) return res.status(400).json({ error: 'The selected file is empty' });
    if (buffer.length > MAX_BYTES) return res.status(400).json({ error: 'The selected file exceeds the 8 MB limit' });
    if (!hasExpectedSignature(buffer, mimeType)) return res.status(400).json({ error: 'The file content does not match its PDF or image type' });

    const id = nanoid(18);
    const storedName = `${id}.${type.extension}`;
    await putStoredFile(storedName, buffer, mimeType);
    const attachment = await col('attachments').insertOne({
      _id: id,
      scope,
      fileName: safeName(fileName),
      mimeType,
      fileType: type.label,
      size: buffer.length,
      storedName,
      uploadedById: req.user.id,
      uploadedBy: req.user.name,
      uploadedAt: new Date().toISOString(),
      ...(scope === 'studentDocument' ? { hostId, documentType } : {}),
    });
    res.status(201).json({ ...attachment, url: `/attachments/${attachment._id}/content` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id/content', async (req, res) => {
  const attachment = await col('attachments').findOne({ _id: req.params.id });
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
  if (!(await canRead(req, attachment))) return res.status(403).json({ error: 'You do not have access to this attachment' });
  try {
    const content = await getStoredFile(attachment.storedName);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${safeName(attachment.fileName)}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(content);
  } catch {
    res.status(404).json({ error: 'Attachment file is unavailable' });
  }
});

export default router;
