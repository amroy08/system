import { Router } from 'express';
import { col } from '../db/index.js';
import { authRequired, allowRoles, STAFF } from '../middleware/auth.js';
import { ADMISSION_CATEGORY, resolveFeeAssignment } from '../utils/feeStructure.js';
import { summarizeStudentFees } from '../utils/studentFees.js';
import { sendInternalError } from '../utils/httpErrors.js';
import { acquireKeyedLock } from '../utils/keyedLock.js';

const router = Router();
router.use(authRequired);
router.use(allowRoles(...STAFF));

function isPassoutClass(klass) {
  const name = String(klass?.name || '').toLowerCase();
  return name.includes('old') || name.includes('pass') || name.includes('alumni');
}

function isPrePrimaryClass(klass) {
  return /nursery|kg|pre-primary/i.test(String(klass?.name || ''));
}

function classGrade(klass) {
  return Number(String(klass?.name || '').match(/\d+/)?.[0]) || null;
}

// 1. Preview candidates and their carry-over balances for a source class
router.get('/preview/:classId', async (req, res) => {
  try {
    const classId = req.params.classId;
    const sourceClass = await col('classes').findOne({ _id: classId });
    if (!sourceClass) return res.status(404).json({ error: 'Source class not found' });

    const students = await col('students').find({ classId, status: 'active' });
    const candidates = [];

    for (const s of students) {
      // Calculate outstanding arrear balance
      const receipts = await col('feeReceipts').find({ studentId: s._id, status: { $ne: 'refunded' } });
      const arrears = summarizeStudentFees(s, receipts).balance;

      candidates.push({
        studentId: s._id,
        fullName: `${s.firstName} ${s.lastName || ''}`.trim(),
        grNumber: s.admissionNo,
        currentGrade: sourceClass.name,
        currentSection: sourceClass.section,
        arrearAmount: arrears,
        action: 'PROMOTE',
        targetFeeCategory: 'EXISTING'
      });
    }

    res.json({
      classId,
      totalCandidates: candidates.length,
      candidates
    });
  } catch (e) {
    sendInternalError(res, e, 'Promotion preview');
  }
});

// 2. Execute batch promotion & rollover
router.post('/batch', async (req, res) => {
  let release;
  try {
    const { fromClassId, toClassId, candidates = [], targetFeeCategory } = req.body;
    if (!fromClassId || !toClassId || fromClassId === toClassId) {
      return res.status(400).json({ error: 'Select different source and target classes' });
    }
    if (!Array.isArray(candidates)) return res.status(400).json({ error: 'Promotion candidates must be a list' });
    const candidateIds = candidates.map((candidate) => candidate?.studentId).filter(Boolean);
    if (new Set(candidateIds).size !== candidateIds.length) {
      return res.status(400).json({ error: 'A student can appear only once in a promotion batch' });
    }
    if (candidates.some((candidate) => !candidate?.studentId || !['PROMOTE', 'RETAIN'].includes(candidate.action))) {
      return res.status(400).json({ error: 'Every candidate must have a valid promotion decision' });
    }
    release = await acquireKeyedLock(`promotion:${fromClassId}`);

    const sourceClass = await col('classes').findOne({ _id: fromClassId });
    if (!sourceClass) return res.status(404).json({ error: 'Source class not found' });
    const targetClass = await col('classes').findOne({ _id: toClassId });
    if (!targetClass) return res.status(404).json({ error: 'Target class not found' });

    const passoutRollover = isPassoutClass(targetClass);
    const prePrimaryRollover = isPrePrimaryClass(sourceClass) && isPrePrimaryClass(targetClass);
    const targetGrade = classGrade(targetClass);
    const selectedFeeCategory = targetGrade === 1
      ? ADMISSION_CATEGORY.NEW
      : targetGrade === 5
      ? (targetFeeCategory === ADMISSION_CATEGORY.EXISTING ? ADMISSION_CATEGORY.EXISTING : ADMISSION_CATEGORY.NEW)
      : prePrimaryRollover ? ADMISSION_CATEGORY.NEW : ADMISSION_CATEGORY.EXISTING;
    const structures = await col('feeStructures').find({ status: 'active' });
    const resolvedTargetFee = passoutRollover
      ? { annualFee: 0, components: [] }
      : resolveFeeAssignment(structures, targetClass, selectedFeeCategory);
    if (!passoutRollover && !resolvedTargetFee.components.length) {
      return res.status(400).json({ error: `No active fee structure is assigned to ${targetClass.name} ${targetClass.section} for ${targetClass.academicYear}` });
    }

    let promotedCount = 0;
    let detainedCount = 0;
    let carriedArrears = 0;

    for (const cand of candidates) {
      const student = await col('students').findOne({ _id: cand.studentId });
      if (!student || student.classId !== fromClassId || student.status !== 'active') continue;

      if (cand.action === 'PROMOTE') {
        // Calculate current arrears
        const receipts = await col('feeReceipts').find({ studentId: student._id, status: { $ne: 'refunded' } });
        const arrears = summarizeStudentFees(student, receipts).balance;

        // Passed-out students carry only their existing balance. Regular promotions
        // retain the cumulative demand and append the next class's annual fee.
        const newClassDemand = resolvedTargetFee.annualFee;
        const targetDemand = (student.totalDemand || 0) + newClassDemand;
        carriedArrears += arrears;
        const feeAssignments = passoutRollover ? (student.feeAssignments || []) : [
          ...(student.feeAssignments || []),
          {
            ...resolvedTargetFee,
            source: 'promotion',
            fromClassId,
            assignedAt: new Date().toISOString(),
            assignedBy: req.user.name,
          },
        ];

        await col('students').updateOne(
          { _id: student._id },
          {
            classId: toClassId,
            academicYear: targetClass.academicYear,
            totalDemand: targetDemand,
            feeAssignments,
            status: passoutRollover ? 'passed-out' : 'active',
            admissionCategory: passoutRollover ? ADMISSION_CATEGORY.EXISTING : selectedFeeCategory
          }
        );
        promotedCount++;
      } else {
        // Find same-grade class in target academic year
        const sameGradeClass = await col('classes').findOne({
          name: sourceClass.name,
          section: sourceClass.section,
          academicYear: targetClass.academicYear,
        }) || sourceClass;

        // Resolve fee for this retained class
        const resolvedRetainedFee = resolveFeeAssignment(structures, sameGradeClass, ADMISSION_CATEGORY.EXISTING);

        // Update student demand and assignments
        const targetDemand = (student.totalDemand || 0) + resolvedRetainedFee.annualFee;
        const feeAssignments = [
          ...(student.feeAssignments || []),
          {
            ...resolvedRetainedFee,
            source: 'retention',
            fromClassId,
            assignedAt: new Date().toISOString(),
            assignedBy: req.user.name,
          },
        ];

        await col('students').updateOne(
          { _id: student._id },
          {
            classId: sameGradeClass._id,
            academicYear: targetClass.academicYear,
            totalDemand: targetDemand,
            feeAssignments,
            status: 'active',
            admissionCategory: ADMISSION_CATEGORY.EXISTING,
          }
        );
        detainedCount++;
      }
    }

    res.json({
      success: true,
      carriedArrears,
      message: passoutRollover
        ? `${promotedCount} student(s) moved to Old Students with no new fee; ${detainedCount} retained.`
        : `${promotedCount} student(s) promoted and ${detainedCount} student(s) retained.`
    });
  } catch (e) {
    sendInternalError(res, e, 'Promotion batch');
  } finally {
    release?.();
  }
});

export default router;
