import { describe, expect, it } from 'vitest';
import { buildS2eCashLedgerReport } from '../server/services/s2eCashLedgerService';

describe('S2e-HKD cash ledger report', () => {
  it('separates cash, bank and unsettled funds while preserving the accounting equation', () => {
    const report = buildS2eCashLedgerReport({
      branchId: 'CN01',
      from: '2026-08-01',
      to: '2026-08-31',
      funds: [
        { id: 'CASH_1', branchId: 'CN01', name: 'Két chính', type: 'CASH', openingBalance: 1_000, currentBalance: 1_250 },
        { id: 'BANK_1', branchId: 'CN01', name: 'VCB', type: 'BANK', bankName: 'Vietcombank', accountNumber: '1234', openingBalance: 500, currentBalance: 800 },
        { id: 'POS_1', branchId: 'CN01', name: 'MPOS chờ về', type: 'POS_CARD', currentBalance: 900 }
      ],
      priorNetByFund: { CASH_1: 1_000, BANK_1: 500 },
      knownOpeningByFund: {
        CASH_1: { exists: true, date: '2026-01-01 08:00:00', type: 'RECEIPT', amount: 1_000 },
        BANK_1: { exists: true, date: '2026-01-01 08:00:00', type: 'RECEIPT', amount: 500 }
      },
      periodTransactions: [
        { id: 'T1', fundId: 'CASH_1', type: 'RECEIPT', category: 'SALES_REVENUE', amount: 400, date: '2026-08-02 09:00:00', code: 'PT-1' },
        { id: 'T2', fundId: 'CASH_1', type: 'PAYMENT', category: 'INTERNAL_TRANSFER', transferGroupId: 'TRF-1', amount: 150, date: '2026-08-03 09:00:00', code: 'PC-1' },
        { id: 'T3', fundId: 'BANK_1', type: 'RECEIPT', category: 'INTERNAL_TRANSFER', transferGroupId: 'TRF-1', amount: 150, date: '2026-08-03 09:00:01', code: 'PT-2' },
        { id: 'T4', fundId: 'BANK_1', type: 'RECEIPT', category: 'OTHER_INCOME', amount: 150, date: '2026-08-04 09:00:00', code: 'PT-3' }
      ]
    });

    expect(report.sources.map((source: any) => source.id)).toEqual(['CASH', 'BANK:BANK_1']);
    expect(report.total).toMatchObject({
      openingBalance: 1_500,
      receipts: 700,
      payments: 150,
      closingBalance: 2_050,
      internalReceipts: 150,
      internalPayments: 150,
      externalReceipts: 550,
      externalPayments: 0
    });
    expect(report.sources[0].rows.map((row: any) => row.runningBalance)).toEqual([1_400, 1_250]);
    expect(report.excludedSettlementFunds).toEqual([{ id: 'POS_1', name: 'MPOS chờ về', type: 'POS_CARD', currentBalance: 900 }]);
  });

  it('moves an opening voucher created inside the period into opening balance instead of receipts', () => {
    const report = buildS2eCashLedgerReport({
      branchId: 'CN01',
      from: '2026-08-01',
      to: '2026-08-31',
      funds: [{ id: 'CASH_NEW', branchId: 'CN01', name: 'Két mới', type: 'CASH', openingBalance: 2_000 }],
      priorNetByFund: { CASH_NEW: 0 },
      knownOpeningByFund: { CASH_NEW: { exists: true, date: '2026-08-10 08:00:00', type: 'RECEIPT', amount: 2_000 } },
      periodTransactions: [
        { id: 'OPENING_CASH_NEW', fundId: 'CASH_NEW', type: 'RECEIPT', category: 'OPENING_BALANCE', amount: 2_000, date: '2026-08-10 08:00:00' }
      ]
    });
    expect(report.total).toMatchObject({ openingBalance: 2_000, receipts: 0, payments: 0, closingBalance: 2_000 });
    expect(report.sources[0].rows).toEqual([]);
  });

  it('does not backdate a fund opening balance into a report before the fund existed', () => {
    const report = buildS2eCashLedgerReport({
      branchId: 'CN01',
      from: '2026-07-01',
      to: '2026-07-31',
      funds: [{ id: 'CASH_FUTURE', branchId: 'CN01', name: 'Két mới', type: 'CASH', openingBalance: 2_000 }],
      priorNetByFund: { CASH_FUTURE: 0 },
      knownOpeningByFund: {
        CASH_FUTURE: { exists: true, date: '2026-08-10 08:00:00', type: 'RECEIPT', amount: 2_000 }
      },
      periodTransactions: []
    });

    expect(report.total).toMatchObject({ openingBalance: 0, receipts: 0, payments: 0, closingBalance: 0 });
  });
});
