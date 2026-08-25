import dotenv from 'dotenv';
import { initDb, closeDb, col } from '../db/index.js';
import { createBackup } from '../utils/backupService.js';
import {
  allocateFeePayment,
  buildRemainingBalanceBreakdown,
  resolveStudentFeeComponents,
  summarizeComponentPayments,
} from '../utils/feeAllocation.js';
import { summarizeStudentFees } from '../utils/studentFees.js';

dotenv.config();

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');

function receiptTime(receipt) {
  return String(receipt.date || receipt.createdAt || receipt.receiptNo || '');
}

function shouldRecalculateReceipt(receipt) {
  return String(receipt.idempotencyKey || '').startsWith('legacy-replace:')
    || String(receipt.remarks || '').includes('Imported opening payment from legacy ERP')
    || !Array.isArray(receipt.balanceBreakdown);
}

async function main() {
  await initDb();
  try {
    const [receipts, students, classes, feeStructures] = await Promise.all([
      col('feeReceipts').find({}),
      col('students').find({}),
      col('classes').find({}),
      col('feeStructures').find({ status: 'active' }),
    ]);

    const studentsById = new Map(students.map((student) => [student._id, student]));
    const classesById = new Map(classes.map((klass) => [klass._id, klass]));
    const receiptsByStudent = new Map();
    for (const receipt of receipts.filter((item) => item.status !== 'refunded')) {
      if (!receiptsByStudent.has(receipt.studentId)) receiptsByStudent.set(receipt.studentId, []);
      receiptsByStudent.get(receipt.studentId).push(receipt);
    }
    for (const studentReceipts of receiptsByStudent.values()) {
      studentReceipts.sort((a, b) => receiptTime(a).localeCompare(receiptTime(b)));
    }

    const targets = receipts.filter(shouldRecalculateReceipt);
    const updates = [];
    for (const receipt of targets) {
      const student = studentsById.get(receipt.studentId);
      if (!student) continue;
      const klass = classesById.get(student.classId);
      const components = resolveStudentFeeComponents({ student, klass, structures: feeStructures });
      const studentReceipts = receiptsByStudent.get(student._id) || [];
      const previousReceipts = studentReceipts.filter((item) => item._id !== receipt._id && receiptTime(item) < receiptTime(receipt));
      const componentSummaries = summarizeComponentPayments(components, previousReceipts);
      const { items } = allocateFeePayment(receipt.amountPaid, componentSummaries);
      const summaryAfterReceipt = summarizeStudentFees(student, [...previousReceipts, { ...receipt, items }]);
      const balanceBreakdown = buildRemainingBalanceBreakdown(components, [...previousReceipts, { ...receipt, items }], summaryAfterReceipt.balance);
      const previousYearArrears = components.find((item) => item.name === 'Arrear Fees (Previous Balance)')?.amount || 0;
      updates.push({
        receipt,
        changes: {
          items,
          balanceBreakdown,
          previousYearArrears,
          currentGradeFeeRate: Math.max(0, Number(student.totalDemand || 0) - previousYearArrears),
          totalDemand: Number(student.totalDemand || 0),
          totalPaidLifetime: summaryAfterReceipt.totalPaid,
          balance: summaryAfterReceipt.balance,
        },
      });
    }

    const changed = updates.filter(({ receipt, changes }) => {
      return JSON.stringify(receipt.items || []) !== JSON.stringify(changes.items)
        || JSON.stringify(receipt.balanceBreakdown || []) !== JSON.stringify(changes.balanceBreakdown);
    });
    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      receiptsChecked: targets.length,
      receiptsToUpdate: changed.length,
      samples: changed.slice(0, 8).map(({ receipt, changes }) => ({
        receiptNo: receipt.receiptNo,
        studentName: receipt.studentName,
        amountPaid: receipt.amountPaid,
        before: receipt.items || [],
        after: changes.items,
        balanceBreakdown: changes.balanceBreakdown,
        balance: changes.balance,
      })),
    }, null, 2));

    if (!apply || changed.length === 0) return;

    try {
      const backup = await createBackup({
        type: 'manual',
        createdBy: 'Receipt Split Recalculation',
        reason: 'Before recalculating imported legacy receipt fee-head splits',
      });
      console.log(JSON.stringify({ backupId: backup.id }, null, 2));
    } catch (error) {
      console.warn(`[backup warning] ${error.message}`);
    }

    for (const { receipt, changes } of changed) {
      await col('feeReceipts').updateOne({ _id: receipt._id }, changes);
    }
    console.log(JSON.stringify({ updated: changed.length }, null, 2));
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
