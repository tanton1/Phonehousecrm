import { describe, it, expect } from 'vitest';
import { calculateDashboardMetrics } from '../src/features/dashboard/hooks/useDashboardMetrics';
import { getVietnamDateString } from '../src/utils/dateTimeUtils';
import { invoiceRevenueAmount, invoiceStaffUid, isPostedCashTransaction, isPostedInvoice } from '../src/utils/invoiceMetrics';

describe('Sprint 6: Dashboard Metrics & Action Queue Test Suite', () => {
  it('Case 1: Tính toán doanh thu hôm nay và tháng này chính xác', () => {
    const todayStr = getVietnamDateString();
    const invoices: any[] = [
      { id: 'INV-1', createdDate: todayStr, finalAmount: 25000000, status: 'completed' },
      { id: 'INV-2', createdDate: todayStr, finalAmount: 15000000, status: 'completed' },
      { id: 'INV-3', createdDate: todayStr, finalAmount: 10000000, status: 'cancelled' } // Cancelled -> Omitted
    ];

    const result = calculateDashboardMetrics({
      invoices,
      devices: [],
      leads: [],
      warrantyTickets: [],
      funds: [],
      partners: []
    });

    expect(result.todayRevenue).toBe(40000000);
    expect(result.todayOrderCount).toBe(2);
  });

  it('Case 2: Sinh Action Queue khi có đơn trả góp chưa giải ngân', () => {
    const invoices: any[] = [
      {
        id: 'INV-TG-01',
        paymentMethod: 'Trả góp qua Cty Tài Chính (HD/Home/Mpos)',
        installmentDisbursementStatus: 'PENDING',
        finalAmount: 30000000,
        status: 'completed'
      }
    ];

    const result = calculateDashboardMetrics({
      invoices,
      devices: [],
      leads: [],
      warrantyTickets: [],
      funds: [],
      partners: []
    });

    const installmentAction = result.actionQueue.find(a => a.type === 'INSTALLMENT_PENDING');
    expect(installmentAction).toBeDefined();
    expect(installmentAction?.severity).toBe('danger');
    expect(installmentAction?.count).toBe(1);
    expect(installmentAction?.targetTab).toBe('invoices');
  });

  it('Case 3: Cảnh báo máy tồn kho lâu ngày (> 30 ngày)', () => {
    const fortyDaysAgo = new Date();
    fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40);

    const devices: any[] = [
      { id: 'DEV-1', model: 'iPhone 13', status: 'in_stock', receivedDate: fortyDaysAgo.toISOString().split('T')[0] },
      { id: 'DEV-2', model: 'iPhone 15', status: 'in_stock', receivedDate: new Date().toISOString().split('T')[0] }
    ];

    const result = calculateDashboardMetrics({
      invoices: [],
      devices,
      leads: [],
      warrantyTickets: [],
      funds: [],
      partners: []
    });

    expect(result.inStockDeviceCount).toBe(2);
    expect(result.inventoryHealth.agingStockCount).toBe(1);

    const agingAction = result.actionQueue.find(a => a.type === 'LONG_IN_STOCK');
    expect(agingAction).toBeDefined();
    expect(agingAction?.severity).toBe('warning');
  });

  it('Case 4: Xu hướng doanh thu 7 ngày sinh đủ 7 ngày liên tiếp', () => {
    const result = calculateDashboardMetrics({
      invoices: [],
      devices: [],
      leads: [],
      warrantyTickets: [],
      funds: [],
      partners: []
    });

    expect(result.dailyRevenueTrend.length).toBe(7);
    expect(result.dailyRevenueTrend[6].date).toBe(getVietnamDateString());
  });

  it('Case 5: không ghi nhận trạng thái chưa hạch toán và hóa đơn thiếu ngày', () => {
    const todayStr = getVietnamDateString();
    const invoices: any[] = [
      { id: 'POSTED', createdDate: todayStr, finalAmount: 10_000_000, status: 'COMPLETED' },
      { id: 'NO-DATE', finalAmount: 99_000_000, status: 'COMPLETED' },
      { id: 'REFUND', createdDate: todayStr, finalAmount: 20_000_000, status: 'REFUNDED' },
      { id: 'REVERSE', createdDate: todayStr, finalAmount: 30_000_000, status: 'REVERSED' },
      { id: 'DRAFT', createdDate: todayStr, finalAmount: 40_000_000, status: 'DRAFT' },
      { id: 'PENDING', createdDate: todayStr, finalAmount: 50_000_000, status: 'PENDING' }
    ];

    const result = calculateDashboardMetrics({
      invoices,
      devices: [],
      leads: [],
      warrantyTickets: [],
      funds: [],
      partners: []
    });

    expect(result.todayRevenue).toBe(10_000_000);
    expect(result.todayOrderCount).toBe(1);
    expect(result.monthOrderCount).toBe(1);
  });

  it('Case 6: lọc chi nhánh fail-closed với dữ liệu thiếu branchId', () => {
    const todayStr = getVietnamDateString();
    const result = calculateDashboardMetrics({
      invoices: [
        { id: 'A', branchId: 'BR-A', createdDate: todayStr, finalAmount: 1_000, status: 'COMPLETED' },
        { id: 'B', branchId: 'BR-B', createdDate: todayStr, finalAmount: 2_000, status: 'COMPLETED' },
        { id: 'LEGACY', createdDate: todayStr, finalAmount: 4_000, status: 'COMPLETED' }
      ] as any[],
      devices: [],
      leads: [],
      warrantyTickets: [],
      funds: [],
      partners: [],
      selectedBranchId: 'BR-A'
    });

    expect(result.todayRevenue).toBe(1_000);
    expect(result.todayOrderCount).toBe(1);
  });

  it('Case 7: giữ số tiền 0 và ưu tiên UID ổn định khi gán doanh số', () => {
    expect(invoiceRevenueAmount({ finalAmount: 0, totalAmount: 9_000_000 } as any)).toBe(0);
    expect(invoiceStaffUid({ creatorUid: 'uid-creator', sellerId: 'uid-seller' } as any)).toBe('uid-creator');
    expect(invoiceStaffUid({ sellerId: 'uid-seller', cashierId: 'uid-cashier' } as any)).toBe('uid-seller');
  });

  it('Case 8: chuẩn hóa trạng thái hóa đơn và giao dịch quỹ không phân biệt hoa thường', () => {
    expect(isPostedInvoice({ status: 'CANCELLED' } as any)).toBe(false);
    expect(isPostedInvoice({ status: 'Refunded' } as any)).toBe(false);
    expect(isPostedInvoice({ status: 'completed' } as any)).toBe(true);
    expect(isPostedCashTransaction({ status: 'completed', recordStatus: 'posted' } as any)).toBe(true);
    expect(isPostedCashTransaction({ status: 'COMPLETED', recordStatus: 'REVERSED' } as any)).toBe(false);
  });
});
