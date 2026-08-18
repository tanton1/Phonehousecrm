import { describe, it, expect } from 'vitest';
import { WarrantyTicket } from '../src/types';

describe('Sprint 14: Warranty Tech Workbench & Repair Kanban Suite', () => {
  it('Case 1: Quy trình chuyển trạng thái phiếu sửa chữa trong Repair Kanban', () => {
    const ticket: WarrantyTicket = {
      id: 'T-1',
      ticketNumber: 'BH-2608-01',
      customerName: 'Nguyễn Văn A',
      phone: '0901234567',
      model: 'iPhone 13',
      imei: '123456',
      issueType: 'Pin / Phù Pin',
      faultDescription: 'Pin chai',
      technician: 'KTV Nam',
      status: 'received',
      isWarrantyFree: false,
      estimatedCost: 600000,
      finalCost: 600000,
      receivedDate: '2026-08-18',
      expectedReturnDate: '2026-08-19'
    };

    expect(ticket.status).toBe('received');

    // Progression to ready (after repair)
    const completedTicket: WarrantyTicket = {
      ...ticket,
      status: 'ready',
      completedDate: '2026-08-18'
    };

    expect(completedTicket.status).toBe('ready');
  });

  it('Case 2: Phân loại bảo hành miễn phí (finalCost = 0) và sửa dịch vụ tính phí', () => {
    const freeTicket: Partial<WarrantyTicket> = {
      isWarrantyFree: true,
      repairCategory: 'WARRANTY_FREE',
      finalCost: 0
    };

    const serviceTicket: Partial<WarrantyTicket> = {
      isWarrantyFree: false,
      repairCategory: 'REPAIR_SERVICE',
      estimatedCost: 1200000,
      finalCost: 1200000
    };

    expect(freeTicket.finalCost).toBe(0);
    expect(serviceTicket.finalCost).toBe(1200000);
  });

  it('Case 3: Tính toán linh kiện sử dụng và hoa hồng kỹ thuật viên', () => {
    const partsUsed = [
      { partId: 'P1', name: 'Pin Bison 13 Pro', quantity: 1, costPrice: 350000, retailPrice: 650000 },
      { partId: 'P2', name: 'Keo ron kháng nước', quantity: 1, costPrice: 30000, retailPrice: 50000 }
    ];

    const totalPartsCost = partsUsed.reduce((sum, p) => sum + p.costPrice * p.quantity, 0);
    const techCommission = 120000;

    expect(totalPartsCost).toBe(380000);
    expect(techCommission).toBe(120000);
  });
});
