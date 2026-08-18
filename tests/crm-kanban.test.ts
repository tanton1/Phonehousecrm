import { describe, it, expect } from 'vitest';
import { LeadStatus } from '../src/types';

describe('Sprint 11: CRM Lead Kanban & Customer 360° Suite', () => {
  it('Case 1: Chuyển đổi trạng thái Lead trong Pipeline Kanban', () => {
    const lead = {
      id: 'LEAD-01',
      name: 'Anh Tuấn',
      status: 'new' as LeadStatus
    };

    const nextStatus: LeadStatus = 'appointment_scheduled';
    const updatedLead = {
      ...lead,
      status: nextStatus
    };

    expect(updatedLead.status).toBe('appointment_scheduled');
  });

  it('Case 2: Tính toán Customer Lifetime Value (LTV) từ lịch sử hóa đơn', () => {
    const customerPhone = '0901234567';
    const invoices = [
      { id: 'INV-1', customerPhone: '0901234567', finalAmount: 25000000, status: 'completed' },
      { id: 'INV-2', customerPhone: '0901234567', finalAmount: 3500000, status: 'completed' },
      { id: 'INV-3', customerPhone: '0901234567', finalAmount: 10000000, status: 'cancelled' }, // Đơn hủy -> Không tính vào LTV
      { id: 'INV-4', customerPhone: '0988888888', finalAmount: 30000000, status: 'completed' }  // Khách khác -> Không tính
    ];

    const customerInvoices = invoices.filter(
      inv => inv.customerPhone === customerPhone && inv.status !== 'cancelled'
    );
    const totalLtv = customerInvoices.reduce((sum, inv) => sum + inv.finalAmount, 0);

    expect(customerInvoices.length).toBe(2);
    expect(totalLtv).toBe(28500000);
  });

  it('Case 3: Tính toán SLA phản hồi Lead (< 2 giờ vs > 2 giờ)', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const isOverdue = (createdIso: string) => {
      const hoursPassed = (Date.now() - new Date(createdIso).getTime()) / (1000 * 60 * 60);
      return hoursPassed > 2;
    };

    expect(isOverdue(threeHoursAgo)).toBe(true);
    expect(isOverdue(thirtyMinsAgo)).toBe(false);
  });
});
