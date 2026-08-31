import type { Firestore, Transaction } from 'firebase-admin/firestore';

export type FinanceVoucherPrefix = 'PT' | 'PC' | 'SDDK';

interface VoucherCodeRequest {
  branchId: string;
  prefix: FinanceVoucherPrefix;
  occurredAt: string;
}

function safeToken(value: string, fallback: string): string {
  const token = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return token || fallback;
}

export async function allocateFinanceVoucherCode(
  db: Firestore,
  transaction: Transaction,
  input: VoucherCodeRequest
): Promise<string> {
  const [code] = await allocateFinanceVoucherCodes(db, transaction, [input]);
  return code;
}

export async function allocateFinanceVoucherCodes(
  db: Firestore,
  transaction: Transaction,
  inputs: VoucherCodeRequest[]
): Promise<string[]> {
  const descriptors = inputs.map(input => {
    const year = /^\d{4}/.test(input.occurredAt) ? input.occurredAt.slice(0, 4) : String(new Date().getUTCFullYear());
    const branchToken = safeToken(input.branchId, 'CN');
    const prefix = safeToken(input.prefix, 'CT') as FinanceVoucherPrefix;
    const ref = db.collection('financeVoucherSequences').doc(`${branchToken}_${year}_${prefix}`);
    return { input, year, branchToken, prefix, ref };
  });
  const snapshots = await Promise.all(descriptors.map(descriptor => transaction.get(descriptor.ref)));
  return descriptors.map((descriptor, index) => {
    const previous = Number(snapshots[index].data()?.lastNumber || 0);
    const next = Number.isSafeInteger(previous) && previous >= 0 ? previous + 1 : 1;
    transaction.set(descriptor.ref, {
      branchId: descriptor.input.branchId,
      year: descriptor.year,
      prefix: descriptor.prefix,
      lastNumber: next,
      updatedAt: descriptor.input.occurredAt
    }, { merge: true });
    return `${descriptor.prefix}-${descriptor.branchToken}-${descriptor.year}-${String(next).padStart(6, '0')}`;
  });
}
