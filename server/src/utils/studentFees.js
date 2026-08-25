export function summarizeStudentFees(student, receipts = []) {
  const activeReceipts = receipts.filter((receipt) => receipt.status !== 'refunded');
  const totalDemand = Number(student?.totalDemand || 0);
  const totalPaid = activeReceipts.reduce((sum, receipt) => sum + Number(receipt.amountPaid || 0), 0);
  const totalDiscount = activeReceipts.reduce((sum, receipt) => sum + Number(receipt.discount || 0), 0);
  const totalLateFee = activeReceipts.reduce((sum, receipt) => sum + Number(receipt.lateFee || 0), 0);
  return {
    totalDemand,
    totalPaid,
    totalDiscount,
    totalLateFee,
    balance: Math.max(0, totalDemand + totalLateFee - totalDiscount - totalPaid),
  };
}
