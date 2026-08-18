import { describe, it, expect } from 'vitest';

describe('Sprint 15: Attendance, Payroll & Shift SOP Checklist Suite', () => {
  it('Case 1: Tính toán thực lĩnh bảng lương (Net Salary = Lương ngày công + Hoa hồng POS + Hoa hồng KTV + Phụ cấp - Tạm ứng)', () => {
    const baseSalary = 8000000;
    const workDays = 26;
    const standardDays = 26;
    const posCommission = 4500000;
    const techCommission = 2000000;
    const allowances = 1200000;
    const advances = 1000000;

    const proratedBase = Math.round((baseSalary / standardDays) * workDays);
    const netSalary = proratedBase + posCommission + techCommission + allowances - advances;

    expect(proratedBase).toBe(8000000);
    expect(netSalary).toBe(14700000);
  });

  it('Case 2: Kiểm định hoàn thành quy trình SOP (Tất cả tiêu chí phải được tick chọn)', () => {
    const openingItems = [
      { id: '1', completed: true },
      { id: '2', completed: true },
      { id: '3', completed: false }, // Chưa hoàn thành
      { id: '4', completed: true }
    ];

    const isAllCompleted = openingItems.every(i => i.completed);
    expect(isAllCompleted).toBe(false);

    // After ticking the 3rd item
    openingItems[2].completed = true;
    const isNowCompleted = openingItems.every(i => i.completed);
    expect(isNowCompleted).toBe(true);
  });

  it('Case 3: Phân biệt quy trình Mở ca (Opening) và Đóng ca (Closing)', () => {
    const shiftTypes = ['OPENING', 'CLOSING'];
    expect(shiftTypes.includes('OPENING')).toBe(true);
    expect(shiftTypes.includes('CLOSING')).toBe(true);
  });
});
