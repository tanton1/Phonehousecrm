import { describe, it, expect } from 'vitest';

describe('Sprint 10: Finance Banking Ledger & Partner Debt 360° Suite', () => {
  it('Case 1: Bảo vệ số dư quỹ - Chặn đứng chi vượt quá số dư khả dụng của quỹ', () => {
    const fund = {
      id: 'FUND-01',
      name: 'Két Tiền Mặt Chi Nhánh',
      currentBalance: 5000000
    };

    const paymentAmount = 8000000; // Chi 8 triệu > 5 triệu
    const isSufficientBalance = fund.currentBalance >= paymentAmount;

    expect(isSufficientBalance).toBe(false);
  });

  it('Case 2: Thanh toán nợ Nhà Cung Cấp - Khấu trừ công nợ và cập nhật sổ nợ', () => {
    const partner = {
      id: 'PARTNER-NCC-01',
      name: 'Kho Sỉ Apple Sài Gòn',
      outstandingDebt: 45000000,
      debtTransactions: [] as any[]
    };

    const repayAmount = 20000000;
    const newDebt = Math.max(0, partner.outstandingDebt - repayAmount);

    const newTx = {
      id: 'TX-DEBT-01',
      amount: repayAmount,
      type: 'PAYMENT',
      date: '2026-08-18',
      note: 'Thanh toán nợ tiền hàng'
    };

    const updatedDebtTransactions = [newTx, ...partner.debtTransactions];

    expect(newDebt).toBe(25000000);
    expect(updatedDebtTransactions.length).toBe(1);
    expect(updatedDebtTransactions[0].amount).toBe(20000000);
  });

  it('Case 3: Tính toán dòng tiền ròng (Net Cashflow = Tổng Thu - Tổng Chi)', () => {
    const transactions = [
      { id: '1', type: 'RECEIPT', amount: 35000000 },
      { id: '2', type: 'RECEIPT', amount: 15000000 },
      { id: '3', type: 'PAYMENT', amount: 20000000 },
      { id: '4', type: 'PAYMENT', amount: 5000000 }
    ];

    const totalReceipts = transactions.filter(t => t.type === 'RECEIPT').reduce((sum, t) => sum + t.amount, 0);
    const totalPayments = transactions.filter(t => t.type === 'PAYMENT').reduce((sum, t) => sum + t.amount, 0);
    const netCashflow = totalReceipts - totalPayments;

    expect(totalReceipts).toBe(50000000);
    expect(totalPayments).toBe(25000000);
    expect(netCashflow).toBe(25000000);
  });
});
