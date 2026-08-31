import { describe, expect, it } from 'vitest';
import { decodeCashLedgerCursor, encodeCashLedgerCursor, listCashLedger } from '../server/services/cashLedgerService';

function createCashLedgerDb(records: Record<string, any>) {
  const entries = Object.entries(records);
  const makeQuery = (filters: Array<{ field: string; operator: string; value: any }> = [], cursor?: [string, string], max?: number): any => {
    const resolve = () => {
      let rows = entries.filter(([, value]) => filters.every(filter => {
        const actual = value[filter.field];
        if (filter.operator === '==') return actual === filter.value;
        if (filter.operator === '>=') return actual >= filter.value;
        if (filter.operator === '<=') return actual <= filter.value;
        return false;
      }));
      rows.sort(([leftId, left], [rightId, right]) => String(right.date).localeCompare(String(left.date)) || rightId.localeCompare(leftId));
      if (cursor) rows = rows.filter(([id, value]) => String(value.date) < cursor[0] || (String(value.date) === cursor[0] && id < cursor[1]));
      if (max != null) rows = rows.slice(0, max);
      return rows;
    };
    const query: any = {
      where: (field: string, operator: string, value: any) => makeQuery([...filters, { field, operator, value }], cursor, max),
      orderBy: () => query,
      startAfter: (date: string, id: string) => makeQuery(filters, [date, id], max),
      limit: (limit: number) => makeQuery(filters, cursor, limit),
      get: async () => ({ docs: resolve().map(([id, value]) => ({ id, data: () => value })) }),
      aggregate: () => ({
        get: async () => {
          const rows = resolve();
          return { data: () => ({ amount: rows.reduce((sum, [, value]) => sum + Number(value.amount || 0), 0), count: rows.length }) };
        }
      })
    };
    return query;
  };
  return { collection: () => makeQuery() } as any;
}

const actor = { uid: 'ACC_01', role: 'ACCOUNTANT', branchId: 'CN01' };

describe('Cash ledger server query', () => {
  it('returns complete server totals while paginating ledger rows', async () => {
    const db = createCashLedgerDb({
      TX_04: { branchId: 'CN01', fundId: 'F1', status: 'COMPLETED', type: 'RECEIPT', amount: 400, date: '2026-08-04 09:00:00' },
      TX_03: { branchId: 'CN01', fundId: 'F1', status: 'COMPLETED', type: 'PAYMENT', amount: 100, date: '2026-08-03 09:00:00' },
      TX_02: { branchId: 'CN01', fundId: 'F1', status: 'COMPLETED', type: 'RECEIPT', amount: 200, date: '2026-08-02 09:00:00' },
      TX_OTHER: { branchId: 'CN02', fundId: 'F2', status: 'COMPLETED', type: 'RECEIPT', amount: 99_999, date: '2026-08-05 09:00:00' },
      TX_CANCELLED: { branchId: 'CN01', fundId: 'F1', status: 'CANCELLED', type: 'RECEIPT', amount: 50_000, date: '2026-08-05 10:00:00' }
    });
    const first = await listCashLedger(db, actor, { branchId: 'CN01', from: '2026-08-01', to: '2026-08-31', limit: 2 });
    expect(first.items.map((item: any) => item.id)).toEqual(['TX_04', 'TX_03']);
    expect(first.totals).toMatchObject({ receipts: 600, payments: 100, net: 500, receiptCount: 2, paymentCount: 1 });
    expect(first).toMatchObject({ hasMore: true, coverage: 'COMPLETE' });

    const second = await listCashLedger(db, actor, { branchId: 'CN01', from: '2026-08-01', to: '2026-08-31', limit: 2, cursor: first.nextCursor });
    expect(second.items.map((item: any) => item.id)).toEqual(['TX_02']);
  });

  it('enforces branch scope and validates opaque cursors', async () => {
    const db = createCashLedgerDb({});
    await expect(listCashLedger(db, actor, { branchId: 'CN02' })).rejects.toThrow('CASH_LEDGER_BRANCH_FORBIDDEN');
    const cursor = encodeCashLedgerCursor('2026-08-31 10:00:00', 'TX_01');
    expect(decodeCashLedgerCursor(cursor)).toEqual({ date: '2026-08-31 10:00:00', id: 'TX_01' });
    expect(() => decodeCashLedgerCursor('invalid')).toThrow('CASH_LEDGER_CURSOR_INVALID');
  });

  it('does not classify opening balance as receipt in the selected period', async () => {
    const db = createCashLedgerDb({
      OPENING_F1: { branchId: 'CN01', fundId: 'F1', status: 'COMPLETED', type: 'RECEIPT', category: 'OPENING_BALANCE', amount: 1_000, date: '2026-08-01 08:00:00' },
      TX_SALE: { branchId: 'CN01', fundId: 'F1', status: 'COMPLETED', type: 'RECEIPT', category: 'SALES_REVENUE', amount: 400, date: '2026-08-02 09:00:00' }
    });
    const result = await listCashLedger(db, actor, { branchId: 'CN01', from: '2026-08-01', to: '2026-08-31' });
    expect(result.totals).toMatchObject({ receipts: 400, receiptCount: 1, openingExcluded: 1_000, openingCount: 1 });
  });
});
