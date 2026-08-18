import { describe, it, expect } from 'vitest';
import { calculateDashboardMetrics } from '../src/features/dashboard/hooks/useDashboardMetrics';

describe('Sprint 6: Dashboard Metrics & Action Queue Test Suite', () => {
  it('Case 1: Tính toán doanh thu hôm nay và tháng này chính xác', () => {
    const todayStr = new Date().toISOString().split('T')[0];
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
    expect(result.dailyRevenueTrend[6].date).toBe(new Date().toISOString().split('T')[0]);
  });
});
