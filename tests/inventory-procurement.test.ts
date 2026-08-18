import { describe, it, expect } from 'vitest';

describe('Sprint 9: Inventory Procurement, PO Wizard & Inter-Branch Transfer Suite', () => {
  it('Case 1: Tính toán tổng giá trị đơn nhập PO và ghi nhận công nợ NCC chính xác', () => {
    const deviceRows = [
      { id: '1', model: 'iPhone 15 Pro Max', buyPrice: 24000000 },
      { id: '2', model: 'iPhone 14 Pro Max', buyPrice: 18000000 },
      { id: '3', model: 'iPhone 13 128GB', buyPrice: 10500000 }
    ];

    const totalPOAmount = deviceRows.reduce((sum, r) => sum + r.buyPrice, 0);
    const paidAmount = 30000000; // Trả trước 30 triệu
    const supplierDebt = totalPOAmount - paidAmount;

    expect(totalPOAmount).toBe(52500000);
    expect(supplierDebt).toBe(22500000);
  });

  it('Case 2: Validate chuyển kho chỉ cho phép máy in_stock thuộc đúng chi nhánh nguồn', () => {
    const branchDevices: any[] = [
      { id: 'D1', imei: '356789012345678', branchId: 'CN-01', status: 'in_stock' },
      { id: 'D2', imei: '356789012345679', branchId: 'CN-01', status: 'sold' }, // Đã bán -> Không thể chuyển
      { id: 'D3', imei: '356789012345680', branchId: 'CN-02', status: 'in_stock' }  // Thuộc kho khác -> Không thể chuyển
    ];

    const sourceBranchId = 'CN-01';
    const availableForTransfer = branchDevices.filter(
      d => d.status === 'in_stock' && (!d.branchId || d.branchId === sourceBranchId)
    );

    expect(availableForTransfer.length).toBe(1);
    expect(availableForTransfer[0].imei).toBe('356789012345678');
  });

  it('Case 3: Cấm chuyển kho khi chi nhánh nguồn và chi nhánh đích trùng nhau', () => {
    const sourceBranchId = 'CN-01';
    const targetBranchId = 'CN-01';

    const isValidTransfer = sourceBranchId !== targetBranchId;
    expect(isValidTransfer).toBe(false);
  });
});
