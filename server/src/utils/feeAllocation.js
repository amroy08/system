import { normalizeAdmissionCategory, resolveFeeAssignment } from './feeStructure.js';

function number(value) {
  return Number(value || 0);
}

export function normalizeFeeHead(value = '') {
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

export function feeHeadRank(name = '') {
  const value = normalizeFeeHead(name);
  if (value.includes('arrear') || value.includes('previous') || value.includes('old balance')) return 0;
  if (value.includes('admission')) return 10;
  if (value.includes('monthly') || value.includes('tuition')) return 20;
  if (value.includes('term') || value.includes('exam')) return 30;
  if (value.includes('ms fee') || value.includes('m.s') || value.includes('activity') || value.includes('misc')) return 40;
  if (value.includes('kit')) return 50;
  if (value.includes('transport')) return 60;
  return 90;
}

export function sortFeeComponents(components = []) {
  return [...components].sort((a, b) => {
    const ranked = feeHeadRank(a.name) - feeHeadRank(b.name);
    if (ranked) return ranked;
    return normalizeFeeHead(a.name).localeCompare(normalizeFeeHead(b.name));
  });
}

export function resolveStudentFeeComponents({ student, klass, structures = [] }) {
  const snapshots = student?.feeAssignments || [];
  const latestSnapshot = snapshots[snapshots.length - 1];
  let components = (latestSnapshot?.components || [])
    .map(({ name, frequency, amount }) => ({ name, frequency, amount: number(amount) }))
    .filter((item) => item.name && item.amount > 0);

  if (!components.length && klass) {
    const category = normalizeAdmissionCategory(student?.admissionCategory, student?.medicalNotes);
    components = resolveFeeAssignment(structures, klass, category).components
      .map(({ name, frequency, amount }) => ({ name, frequency, amount: number(amount) }))
      .filter((item) => item.name && item.amount > 0);
  }

  components = sortFeeComponents(components);
  const standardDemand = components.reduce((sum, item) => sum + item.amount, 0);
  const totalDemand = number(student?.totalDemand);
  const extra = totalDemand - standardDemand;
  if (extra > 0.01) {
    components.unshift({
      name: 'Arrear Fees (Previous Balance)',
      frequency: 'one-time',
      amount: extra,
    });
  }

  return components;
}

export function summarizeComponentPayments(components = [], receipts = []) {
  const paidByHead = new Map();
  for (const receipt of receipts.filter((item) => item.status !== 'refunded')) {
    for (const item of receipt.items || []) {
      const key = normalizeFeeHead(item.description);
      paidByHead.set(key, number(paidByHead.get(key)) + number(item.amount));
    }
  }

  return sortFeeComponents(components).map((component) => {
    const paidAmount = Math.min(component.amount, number(paidByHead.get(normalizeFeeHead(component.name))));
    return {
      ...component,
      paidAmount,
      outstandingAmount: Math.max(0, component.amount - paidAmount),
    };
  });
}

export function allocateFeePayment(amountPaid, componentSummaries = []) {
  let remaining = number(amountPaid);
  const items = [];
  const preview = [];

  for (const component of componentSummaries) {
    const outstanding = Math.max(0, number(component.outstandingAmount ?? component.amount));
    const alloc = remaining > 0 ? Math.min(remaining, outstanding) : 0;
    if (alloc > 0) {
      items.push({ description: component.name, amount: alloc });
      remaining -= alloc;
    }
    preview.push({
      name: component.name,
      frequency: component.frequency,
      amount: number(component.amount),
      paidAmount: number(component.paidAmount),
      outstandingAmount: outstanding,
      allocationAmount: alloc,
      remainingAfterPayment: Math.max(0, outstanding - alloc),
    });
  }

  if (remaining > 0) {
    items.push({ description: 'School Fees Payment', amount: remaining });
    preview.push({
      name: 'School Fees Payment',
      frequency: 'extra',
      amount: remaining,
      paidAmount: 0,
      outstandingAmount: remaining,
      allocationAmount: remaining,
      remainingAfterPayment: 0,
    });
  }

  return { items, preview };
}

export function buildRemainingBalanceBreakdown(components = [], receipts = [], balance = 0) {
  const summaries = summarizeComponentPayments(components, receipts)
    .map((component) => ({
      name: component.name,
      frequency: component.frequency,
      amount: component.amount,
      paidAmount: component.paidAmount,
      balanceAmount: component.outstandingAmount,
    }))
    .filter((component) => component.balanceAmount > 0);

  let target = Math.max(0, number(balance));
  let sum = summaries.reduce((total, component) => total + component.balanceAmount, 0);

  if (sum > target) {
    let reduction = sum - target;
    for (let index = summaries.length - 1; index >= 0 && reduction > 0; index -= 1) {
      const amount = Math.min(summaries[index].balanceAmount, reduction);
      summaries[index].balanceAmount -= amount;
      reduction -= amount;
    }
  }

  const adjusted = summaries.filter((component) => component.balanceAmount > 0);
  sum = adjusted.reduce((total, component) => total + component.balanceAmount, 0);
  if (target > sum) {
    adjusted.push({
      name: 'Late Fee / Adjustments',
      frequency: 'adjustment',
      amount: target - sum,
      paidAmount: 0,
      balanceAmount: target - sum,
    });
  }

  return adjusted;
}
