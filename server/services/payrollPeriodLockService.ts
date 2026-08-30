import type { Firestore, Transaction } from 'firebase-admin/firestore';

const LOCKED_STATUSES = new Set(['APPROVED', 'PAID', 'LOCKED']);

export function payrollPeriodLockId(period: string, branchId: string) {
  return `${period}_${String(branchId || '').replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

export function monthKeyFromDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('PAYROLL_LOCK_DATE_INVALID');
  return date.slice(0, 7);
}

export function monthKeysBetween(startDate: string, endDate: string): string[] {
  const startPeriod = monthKeyFromDate(startDate);
  const endPeriod = monthKeyFromDate(endDate);
  if (endDate < startDate) throw new Error('PAYROLL_LOCK_DATE_INVALID');
  const [startYear, startMonth] = startPeriod.split('-').map(Number);
  const [endYear, endMonth] = endPeriod.split('-').map(Number);
  const result: string[] = [];
  let cursor = startYear * 12 + startMonth - 1;
  const end = endYear * 12 + endMonth - 1;
  while (cursor <= end && result.length <= 24) {
    result.push(`${Math.floor(cursor / 12)}-${String(cursor % 12 + 1).padStart(2, '0')}`);
    cursor += 1;
  }
  if (cursor <= end) throw new Error('PAYROLL_LOCK_RANGE_TOO_LARGE');
  return result;
}

export async function assertPayrollPeriodsOpen(
  transaction: Transaction,
  db: Firestore,
  branchId: string,
  periods: string[]
) {
  const uniquePeriods = [...new Set(periods.filter(Boolean))];
  const refs = uniquePeriods.map((period) => db.collection('payrollPeriods').doc(payrollPeriodLockId(period, branchId)));
  const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
  snapshots.forEach((snapshot, index) => {
    const status = String(snapshot.data()?.status || 'OPEN').toUpperCase();
    if (snapshot.exists && LOCKED_STATUSES.has(status)) {
      throw new Error(`PAYROLL_PERIOD_LOCKED: Kỳ ${uniquePeriods[index]} của chi nhánh đã ${status}; thay đổi phải đi qua phiếu điều chỉnh kỳ sau.`);
    }
  });
}
