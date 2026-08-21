import { describe, it, expect } from 'vitest';
import { 
  findStaffByIdentifier, 
  calculateInvoiceCommissions, 
  calculateWarrantyTicketCommissions, 
  syncCommissionsFromAllSources, 
  calculateStaffDualWallet,
  calculateSalesCommissionFromTagSnapshots
} from '../src/utils/commissionEngine';
import { SalesInvoice, WarrantyTicket, StaffMember } from '../src/types';

describe('HR & Attendance Runtime Stability & Empty Data Resilience Test Suite', () => {
  const sampleInvoice: SalesInvoice = {
    id: 'INV-TEST-001',
    invoiceCode: 'HD-TEST-001',
    customerName: 'Nguyễn Văn Test',
    customerPhone: '0987654321',
    status: 'completed',
    sellerName: 'Lê Sales',
    totalAmount: 25000000,
    discountAmount: 0,
    finalAmount: 25000000,
    paymentMethod: 'Tiền mặt',
    warrantyPackage: 'Gói Tiêu Chuẩn',
    accessories: [],
    detailedItems: [
      {
        name: 'iPhone 15 Pro Max 256GB Titan Tự Nhiên',
        type: 'phone',
        unitPrice: 25000000,
        quantity: 1,
        totalPrice: 25000000
      }
    ]
  };

  const sampleWarrantyTicket: WarrantyTicket = {
    id: 'TICKET-TEST-001',
    ticketNumber: 'BH-001',
    customerName: 'Trần Thị Khách',
    phone: '0912345678',
    imei: '358123456789012',
    model: 'iPhone 13 Pro',
    faultDescription: 'Thay pin Pisen chính hãng',
    issueType: 'Pin / Phù Pin',
    status: 'delivered',
    technician: 'Nguyễn Kỹ Thuật',
    branchId: 'CN01',
    isWarrantyFree: false,
    estimatedCost: 800000,
    finalCost: 800000,
    receivedDate: '2026-08-20',
    expectedReturnDate: '2026-08-21',
    techTasks: ['TASK_BATTERY_REPLACEMENT']
  };

  it('Case 1: staffList rỗng ([]) + có invoice -> calculateInvoiceCommissions không crash và trả về mảng rỗng', () => {
    expect(() => {
      const result = calculateInvoiceCommissions(sampleInvoice, []);
      expect(result).toEqual([]);
    }).not.toThrow();
  });

  it('Case 2: staffList rỗng ([]) + có warranty ticket -> calculateWarrantyTicketCommissions không crash và trả về mảng rỗng', () => {
    expect(() => {
      const result = calculateWarrantyTicketCommissions(sampleWarrantyTicket, []);
      expect(result).toEqual([]);
    }).not.toThrow();
  });

  it('Case 3: staffList rỗng ([]) -> syncCommissionsFromAllSources không crash và trả về mảng an toàn', () => {
    expect(() => {
      const result = syncCommissionsFromAllSources(
        [sampleInvoice],
        [sampleWarrantyTicket],
        [],
        [],
        []
      );
      expect(result).toEqual([]);
    }).not.toThrow();
  });

  it('Case 4: staffList rỗng ([]) -> calculateStaffDualWallet không crash khi truy cập .id / .name', () => {
    expect(() => {
      const wallet = calculateStaffDualWallet('UNKNOWN_STAFF_ID', [], []);
      expect(wallet).toBeDefined();
      expect(wallet.staffId).toBe('UNKNOWN_STAFF_ID');
      expect(wallet.totalGrossCommission).toBe(0);
      expect(wallet.totalTransactionsCount).toBe(0);
    }).not.toThrow();
  });

  it('Case 5: findStaffByIdentifier với identifier không tồn tại hoặc rỗng -> trả về undefined an toàn', () => {
    expect(findStaffByIdentifier(undefined, [])).toBeUndefined();
    expect(findStaffByIdentifier('', [])).toBeUndefined();
    expect(findStaffByIdentifier('NonExistentStaff', [])).toBeUndefined();
  });

  it('Case 6: Hóa đơn có seller không tồn tại trong staffList -> Không tự gán hoa hồng cho nhân viên đầu tiên', () => {
    const validStaff: StaffMember[] = [
      {
        id: 'STAFF_A',
        name: 'Hoàng Nhân Viên A',
        code: 'NV01',
        role: 'SALES',
        roleTitle: 'Nhân viên bán hàng',
        branchId: 'CN01',
        branchName: 'Chi Nhánh 1',
        email: 'staffa@phonehouse.vn',
        phone: '0988888888',
        avatar: '',
        isActive: true,
        joinDate: '2026-01-01',
        status: 'ACTIVE',
        attendanceRecords: [],
        monthlyPayroll: []
      } as unknown as StaffMember
    ];

    const invoiceWithUnknownSeller: SalesInvoice = {
      ...sampleInvoice,
      sellerName: 'Nhân Viên Không Tồn Tại'
    };

    const comms = calculateInvoiceCommissions(invoiceWithUnknownSeller, validStaff);
    expect(comms).toBeDefined();
  });

  it('Case 7: tính hoa hồng từ snapshot tag cố định và nhân theo số lượng phụ kiện', () => {
    const flat = calculateSalesCommissionFromTagSnapshots({
      name: 'Ốp lưng', type: 'accessory', quantity: 2, unitPrice: 500000, totalPrice: 1000000,
      commissionTags: [{
        id: 'PK_50K', name: 'Phụ kiện 50K', appliesTo: 'ACCESSORY', calculationType: 'FLAT',
        value: 50000, isActive: true, policyId: 'sales', policyVersion: '2026.08'
      }]
    });
    const percentOnline = calculateSalesCommissionFromTagSnapshots({
      name: 'Máy full BH', type: 'device', quantity: 1, unitPrice: 20000000, totalPrice: 20000000,
      commissionTags: [{
        id: 'MAY_FULL_BH', name: 'Máy full BH', appliesTo: 'DEVICE', calculationType: 'PERCENT',
        value: 2, isActive: true, policyId: 'sales', policyVersion: '2026.08'
      }]
    }, 0.5);
    expect(flat).toEqual({ amount: 100000, percentRate: 0 });
    expect(percentOnline).toEqual({ amount: 200000, percentRate: 1 });
  });
});
