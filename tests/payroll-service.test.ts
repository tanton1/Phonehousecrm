import { describe, expect, it } from 'vitest';
import { buildPayrollRecords } from '../server/services/payrollService';

describe('Payroll backend snapshots', () => {
  it('calculates from published shifts, attendance and eligible commission ledger only', () => {
    const records = buildPayrollRecords({
      period: '2026-08',
      branchId: 'CN01',
      users: [{ id: 'STAFF_01', data: { displayName: 'Sale Mai', role: 'SALES', branchId: 'CN01', active: true, baseSalary: 10_000_000, allowance: 500_000 } }],
      branches: [{ id: 'CN01', data: { name: 'PhoneHouse' } }],
      attendance: [{ staffId: 'STAFF_01', date: '2026-08-01', checkInTime: '08:00:00', checkOutTime: '17:00:00', attendanceStatus: 'COMPLETED', scheduledStart: '08:00', scheduledEnd: '17:00', scheduledBreakMinutes: 60, netWorkMinutes: 480, verificationStatus: 'VERIFIED', verification: { gpsVerified: true }, checkOutVerification: { gpsVerified: true } }],
      schedules: [{ staffId: 'STAFF_01', status: 'PUBLISHED', days: {
        '2026-08-01': { shiftId: 'DAY' },
        '2026-08-02': { shiftId: 'DAY' },
        '2026-08-03': { shiftId: 'OFF', isOff: true }
      } }],
      commissions: [
        { staffUid: 'STAFF_01', status: 'ELIGIBLE', commissionPayable: 200_000 },
        { staffUid: 'STAFF_01', status: 'PENDING', commissionPayable: 999_000 },
        { staffUid: 'STAFF_01', status: 'ELIGIBLE', commissionPayable: 999_000, payrollPostingId: 'OLD_RUN' }
      ]
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ standardWorkDays: 2, workDays: 1, techCommission: 200_000, allowances: 500_000, netSalary: 5_700_000 });
  });

  it('does not leak staff from another branch into a branch payroll run', () => {
    const records = buildPayrollRecords({
      period: '2026-08',
      branchId: 'CN01',
      users: [
        { id: 'CN01_STAFF', data: { displayName: 'CN01', branchId: 'CN01', active: true } },
        { id: 'CN02_STAFF', data: { displayName: 'CN02', branchId: 'CN02', active: true } }
      ],
      attendance: [], schedules: [], commissions: [], branches: []
    });
    expect(records.map((record) => record.staffId)).toEqual(['CN01_STAFF']);
  });

  it('uses only valid completed workday credit and supports half days', () => {
    const records = buildPayrollRecords({
      period: '2026-08',
      branchId: 'CN01',
      users: [{ id: 'STAFF_01', data: { displayName: 'KTV', role: 'TECHNICIAN', branchId: 'CN01', active: true, baseSalary: 9_000_000 } }],
      branches: [{ id: 'CN01', data: { name: 'PhoneHouse' } }],
      attendance: [
        { staffId: 'STAFF_01', date: '2026-08-01', checkInTime: '08:00:00', attendanceStatus: 'CHECKED_IN', scheduledStart: '08:00', scheduledEnd: '17:00', scheduledBreakMinutes: 60 },
        { staffId: 'STAFF_01', date: '2026-08-02', checkInTime: '08:00:00', checkOutTime: '12:30:00', attendanceStatus: 'COMPLETED', scheduledStart: '08:00', scheduledEnd: '17:00', scheduledBreakMinutes: 60, netWorkMinutes: 240, verificationStatus: 'VERIFIED', verification: { gpsVerified: true }, checkOutVerification: { gpsVerified: true } },
        { staffId: 'STAFF_01', date: '2026-08-03', checkInTime: '08:00:00', checkOutTime: '17:00:00', attendanceStatus: 'COMPLETED', scheduledStart: '08:00', scheduledEnd: '17:00', scheduledBreakMinutes: 60, netWorkMinutes: 480, verificationStatus: 'PENDING_REVIEW', verification: { gpsVerified: true }, checkOutVerification: { gpsVerified: false } }
      ],
      schedules: [{ staffId: 'STAFF_01', status: 'PUBLISHED', days: {
        '2026-08-01': { shiftId: 'DAY' }, '2026-08-02': { shiftId: 'DAY' }, '2026-08-03': { shiftId: 'DAY' }
      } }],
      commissions: []
    });
    expect(records[0]).toMatchObject({ standardWorkDays: 3, workDays: 0.5, netSalary: 1_500_000 });
  });

  it('uses the technician fixed department policy as the monthly schedule baseline', () => {
    const records = buildPayrollRecords({
      period: '2026-08', branchId: 'CN01',
      users: [{ id: 'TECH_01', data: { displayName: 'KTV cố định', role: 'TECHNICIAN', branchId: 'CN01', active: true } }],
      branches: [{ id: 'CN01', data: { name: 'PhoneHouse' } }], attendance: [], schedules: [], commissions: [],
      departmentPolicies: [{ branchId: 'CN01', departmentId: 'TECHNICAL', mode: 'FIXED', active: true, workDayIndexes: [0, 1, 2, 3, 4, 5] }]
    });
    expect(records[0].standardWorkDays).toBe(26);
  });

  it('uses effective-dated compensation and credits approved paid leave', () => {
    const records = buildPayrollRecords({
      period: '2026-08', branchId: 'CN01',
      users: [{ id: 'STAFF_01', data: { displayName: 'Sale có phép', role: 'SALES', branchId: 'CN01', active: true, baseSalary: 1 } }],
      branches: [{ id: 'CN01', data: { name: 'PhoneHouse' } }],
      attendance: [], commissions: [], departmentPolicies: [],
      schedules: [{ staffId: 'STAFF_01', status: 'PUBLISHED', branchId: 'CN01', days: {
        '2026-08-01': { shiftId: 'DAY' }, '2026-08-02': { shiftId: 'DAY' }
      } }],
      compensations: [{ id: 'COMP_01', staffUid: 'STAFF_01', effectiveFrom: '2026-08-01', status: 'ACTIVE', version: 2, baseSalary: 10_000_000, allowance: 500_000 }],
      leaves: [{ id: 'LEAVE_01', staffId: 'STAFF_01', status: 'APPROVED', type: 'ANNUAL_LEAVE', startDate: '2026-08-01', endDate: '2026-08-01' }]
    });
    expect(records[0]).toMatchObject({
      baseSalary: 10_000_000,
      proratedBaseSalary: 5_000_000,
      paidLeaveDays: 1,
      unpaidLeaveDays: 0,
      workDays: 1,
      compensationId: 'COMP_01',
      compensationSource: 'CANONICAL',
      netSalary: 5_500_000,
      blockingIssues: []
    });
    expect(records[0].leaveRequestIds).toEqual(['LEAVE_01']);
  });

  it('uses canonical sales commission entries and carries refund reversals into payroll', () => {
    const records = buildPayrollRecords({
      period: '2026-08', branchId: 'CN01',
      users: [{ id: 'SALE_01', data: { displayName: 'Sale', role: 'SALES', branchId: 'CN01', active: true, baseSalary: 8_000_000, salesCommission: 99_000_000 } }],
      branches: [{ id: 'CN01', data: { name: 'PhoneHouse' } }],
      attendance: [{ id: 'ATT_01', staffId: 'SALE_01', date: '2026-08-01', checkInTime: '08:00:00', checkOutTime: '17:00:00', attendanceStatus: 'COMPLETED', scheduledStart: '08:00', scheduledEnd: '17:00', scheduledBreakMinutes: 60, netWorkMinutes: 480, verificationStatus: 'VERIFIED', verification: { gpsVerified: true }, checkOutVerification: { gpsVerified: true } }],
      schedules: [{ staffId: 'SALE_01', status: 'PUBLISHED', branchId: 'CN01', days: { '2026-08-01': { shiftId: 'DAY' } } }],
      compensations: [], leaves: [],
      commissions: [
        { id: 'SALE_COMM_01', staffUid: 'SALE_01', commissionCategory: 'SALES', status: 'ELIGIBLE', commissionPayable: 500_000 },
        { id: 'SALE_REV_01', staffUid: 'SALE_01', commissionCategory: 'SALES', status: 'ELIGIBLE', commissionPayable: -200_000 }
      ]
    });
    expect(records[0].posCommission).toBe(300_000);
    expect(records[0].netSalary).toBe(8_300_000);
    expect(records[0].warnings).not.toContain('LEGACY_SALES_COMMISSION_SOURCE');
  });

  it('includes each approved unposted earning and deduction adjustment exactly once', () => {
    const records = buildPayrollRecords({
      period: '2026-08', branchId: 'CN01',
      users: [{ id: 'STAFF_01', data: { displayName: 'Nhân viên', branchId: 'CN01', active: true, baseSalary: 8_000_000, advanceSalaryDeductions: 9_000_000 } }],
      branches: [{ id: 'CN01', data: { name: 'PhoneHouse' } }],
      attendance: [{ staffId: 'STAFF_01', date: '2026-08-01', checkInTime: '08:00:00', checkOutTime: '17:00:00', attendanceStatus: 'COMPLETED', scheduledStart: '08:00', scheduledEnd: '17:00', scheduledBreakMinutes: 60, netWorkMinutes: 480, verificationStatus: 'VERIFIED', verification: { gpsVerified: true }, checkOutVerification: { gpsVerified: true } }],
      schedules: [{ staffId: 'STAFF_01', status: 'PUBLISHED', branchId: 'CN01', days: { '2026-08-01': { shiftId: 'DAY' } } }],
      commissions: [],
      adjustments: [
        { id: 'ADJ_EARN', staffUid: 'STAFF_01', period: '2026-08', status: 'APPROVED', type: 'EARNING', amount: 500_000 },
        { id: 'ADJ_DEDUCT', staffUid: 'STAFF_01', period: '2026-08', status: 'APPROVED', type: 'DEDUCTION', amount: 200_000 },
        { id: 'ADJ_PENDING', staffUid: 'STAFF_01', period: '2026-08', status: 'PENDING', type: 'EARNING', amount: 9_000_000 },
        { id: 'ADJ_POSTED', staffUid: 'STAFF_01', period: '2026-08', status: 'APPROVED', payrollPostingId: 'OLD_RUN', type: 'EARNING', amount: 9_000_000 }
      ]
    });
    expect(records[0]).toMatchObject({ adjustmentEarnings: 500_000, adjustmentDeductions: 200_000, advances: 200_000, netSalary: 8_300_000 });
    expect(records[0].adjustmentEntryIds).toEqual(['ADJ_EARN', 'ADJ_DEDUCT']);
  });
});
