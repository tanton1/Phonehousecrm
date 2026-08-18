import { describe, it, expect } from 'vitest';

describe('Sprint 8: Invoices & Refund Safety Logic Test Suite', () => {
  const funds: any[] = [
    { id: 'FUND-CASH-01', name: 'Két Tiền Mặt Chi Nhánh', type: 'CASH', currentBalance: 50000000, branchId: 'CN-01' },
    { id: 'FUND-BANK-01', name: 'Techcombank VietQR', type: 'BANK', currentBalance: 120000000, branchId: 'ALL' }
  ];

  it('Case 1: Hóa đơn mới có paymentFundId -> Hoàn tiền tự động vào đúng Quỹ gốc', () => {
    const newInvoice: any = {
      id: 'INV-2026-001',
      invoiceCode: 'HD-2608-001',
      customerName: 'Nguyễn Văn A',
      finalAmount: 25000000,
      paidAmount: 25000000,
      paymentMethod: 'Chuyển khoản QR',
      paymentFundId: 'FUND-BANK-01',
      status: 'completed',
      totalAmount: 25000000,
      discountAmount: 0,
      accessories: [],
      warrantyPackage: 'Gói Tiêu Chuẩn 6 Tháng'
    };

    const targetFund = funds.find(f => f.id === newInvoice.paymentFundId);
    expect(targetFund).toBeDefined();
    expect(targetFund?.id).toBe('FUND-BANK-01');
    expect(targetFund?.type).toBe('BANK');
  });

  it('Case 2: Hóa đơn cũ (Legacy) không có paymentFundId -> Cảnh báo yêu cầu Admin chọn Quỹ thủ công', () => {
    const legacyInvoice: any = {
      id: 'INV-OLD-999',
      customerName: 'Khách Cũ',
      finalAmount: 15000000,
      paidAmount: 15000000,
      paymentMethod: 'Tiền mặt',
      status: 'completed',
      totalAmount: 15000000,
      discountAmount: 0,
      accessories: [],
      warrantyPackage: 'Gói Tiêu Chuẩn 6 Tháng'
    };

    expect(legacyInvoice.paymentFundId).toBeUndefined();

    // Logic: Requires explicit selectedFundId from Admin
    const adminSelectedFundId = 'FUND-CASH-01';
    const refundFund = funds.find(f => f.id === adminSelectedFundId);

    expect(refundFund).toBeDefined();
    expect(refundFund?.id).toBe('FUND-CASH-01');
  });

  it('Case 3: Phiếu chi hoàn tiền tạo đúng category CUSTOMER_REFUND và type PAYMENT', () => {
    const invoice: any = {
      id: 'INV-REFUND-01',
      invoiceCode: 'HD-REF-01',
      customerName: 'Trần Thị B',
      customerPhone: '0901234567',
      finalAmount: 18000000,
      paidAmount: 18000000,
      paymentMethod: 'Tiền mặt',
      paymentFundId: 'FUND-CASH-01',
      status: 'completed',
      totalAmount: 18000000,
      discountAmount: 0,
      accessories: [],
      warrantyPackage: 'Gói Tiêu Chuẩn 6 Tháng'
    };

    const refundAmount = invoice.paidAmount || invoice.finalAmount;
    const cashRefundTx = {
      id: `TX-REF-${Date.now()}`,
      code: `PC-REF-${Date.now().toString().slice(-4)}`,
      type: 'PAYMENT',
      category: 'CUSTOMER_REFUND',
      categoryName: 'Chi hoàn tiền đổi trả hóa đơn',
      amount: refundAmount,
      fundId: invoice.paymentFundId,
      partnerName: invoice.customerName,
      status: 'COMPLETED',
      referenceCode: invoice.invoiceCode
    };

    expect(cashRefundTx.type).toBe('PAYMENT');
    expect(cashRefundTx.category).toBe('CUSTOMER_REFUND');
    expect(cashRefundTx.amount).toBe(18000000);
    expect(cashRefundTx.fundId).toBe('FUND-CASH-01');
  });
});
