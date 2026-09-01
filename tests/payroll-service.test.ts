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
        { staffUid: 'STAFF_01', branchId: 'CN01', payrollBranchId: 'CN01', payrollPeriod: '2026-08', status: 'ELIGIBLE', commissionPayable: 200_000 },
        { staffUid: 'STAFF_01', branchId: 'CN01', payrollBranchId: 'CN01', payrollPeriod: '2026-08', status: 'PENDING', commissionPayable: 999_000 },
        { staffUid: 'STAFF_01', branchId: 'CN01', payrollBranchId: 'CN01', payrollPeriod: '2026-08', status: 'ELIGIBLE', commissionPayable: 999_000, payrollPostingId: 'OLD_RUN' }
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
        { id: 'SALE_COMM_01', staffUid: 'SALE_01', branchId: 'CN01', payrollBranchId: 'CN01', payrollPeriod: '2026-08', commissionCategory: 'SALES', status: 'ELIGIBLE', commissionPayable: 500_000 },
        { id: 'SALE_REV_01', staffUid: 'SALE_01', branchId: 'CN01', payrollBranchId: 'CN01', payrollPeriod: '2026-08', commissionCategory: 'SALES', status: 'ELIGIBLE', commissionPayable: -200_000 }
      ]
    });
    expect(records[0].posCommission).toBe(300_000);
    expect(records[0].netSalary).toBe(8_300_000);
    expect(records[0].warnings).not.toContain('LEGACY_SALES_COMMISSION_SOURCE');
  });

  it('blocks a negative raw net instead of paying all reversal ledgers against a clamped zero salary', () => {
    const records = buildPayrollRecords({
      period: '2026-08', branchId: 'CN01',
      users: [{ id: 'SALE_01', data: { authUid: 'SALE_01', displayName: 'Sale hoàn hoa hồng', branchId: 'CN01', payrollBranchId: 'CN01', active: true, baseSalary: 3_000_000 } }],
      branches: [{ id: 'CN01', data: { name: 'PhoneHouse' } }],
      attendance: [{ staffId: 'SALE_01', date: '2026-08-01', checkInTime: '08:00:00', checkOutTime: '17:00:00', attendanceStatus: 'COMPLETED', scheduledStart: '08:00', scheduledEnd: '17:00', scheduledBreakMinutes: 60, netWorkMinutes: 480, verificationStatus: 'VERIFIED', verification: { gpsVerified: true }, checkOutVerification: { gpsVerified: true } }],
      schedules: [{ staffId: 'SALE_01', branchId: 'CN01', status: 'PUBLISHED', days: { '2026-08-01': { shiftId: 'DAY' } } }],
      commissions: [{ id: 'REV_5M', staffUid: 'SALE_01', branchId: 'CN01', payrollBranchId: 'CN01', payrollPeriod: '2026-08', commissionCategory: 'SALES', status: 'ELIGIBLE', commissionPayable: -5_000_000 }]
    });
    expect(records[0]).toMatchObject({
      rawNetSalary: -2_000_000,
      negativeCarry: 2_000_000,
      netSalary: 0
    });
    expect(records[0].blockingIssues).toContain('NEGATIVE_NET_REQUIRES_RECOVERY_ADJUSTMENT');
  });

  it('blocks a legacy commission missing the authoritative payroll home branch', () => {
    const records = buildPayrollRecords({
      period: '2026-08', branchId: 'CN01',
      users: [{ id: 'STAFF_01', data: { authUid: 'STAFF_01', branchId: 'CN01', payrollBranchId: 'CN01', active: true } }],
      branches: [], attendance: [], schedules: [],
      commissions: [{ id: 'COMM_LEGACY', staffUid: 'STAFF_01', branchId: 'CN01', payrollPeriod: '2026-08', status: 'ELIGIBLE', commissionPayable: 500_000 }]
    });
    expect(records[0].techCommission).toBe(0);
    expect(records[0].commissionEntryIds).toEqual([]);
    expect(records[0].blockingIssues).toContain('COMMISSION_LEDGER_MIGRATION_REQUIRED');
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
        { id: 'ADJ_EARN', staffUid: 'STAFF_01', branchId: 'CN01', period: '2026-08', status: 'APPROVED', type: 'EARNING', amount: 500_000 },
        { id: 'ADJ_DEDUCT', staffUid: 'STAFF_01', branchId: 'CN01', period: '2026-08', status: 'APPROVED', type: 'DEDUCTION', amount: 200_000 },
        { id: 'ADJ_PENDING', staffUid: 'STAFF_01', branchId: 'CN01', period: '2026-08', status: 'PENDING', type: 'EARNING', amount: 9_000_000 },
        { id: 'ADJ_POSTED', staffUid: 'STAFF_01', branchId: 'CN01', period: '2026-08', status: 'APPROVED', payrollPostingId: 'OLD_RUN', type: 'EARNING', amount: 9_000_000 }
      ]
    });
    expect(records[0]).toMatchObject({ adjustmentEarnings: 500_000, adjustmentDeductions: 200_000, advances: 200_000, netSalary: 8_300_000 });
    expect(records[0].adjustmentEntryIds).toEqual(['ADJ_EARN', 'ADJ_DEDUCT']);
  });

  it('routes a multi-branch staff member only to the payroll home branch and aggregates commission from every source branch', () => {
    const input = {
      period: '2026-08', branchId: 'CN01',
      users: [{ id: 'STAFF_01', data: { authUid: 'STAFF_01', displayName: 'Nhân viên đa chi nhánh', branchId: 'CN01', payrollBranchId: 'CN01', assignedBranchIds: ['CN01', 'CN02'], active: true } }],
      branches: [{ id: 'CN01', data: { name: 'Chi nhánh 1' } }, { id: 'CN02', data: { name: 'Chi nhánh 2' } }],
      attendance: [], schedules: [],
      commissions: [
        { id: 'COMM_CN01_AUG', staffUid: 'STAFF_01', branchId: 'CN01', payrollBranchId: 'CN01', payrollPeriod: '2026-08', status: 'ELIGIBLE', commissionPayable: 100_000 },
        { id: 'COMM_CN02_AUG', staffUid: 'STAFF_01', sourceBranchId: 'CN02', branchId: 'CN02', payrollBranchId: 'CN01', payrollPeriod: '2026-08', status: 'ELIGIBLE', commissionPayable: 900_000 },
        { id: 'COMM_CN01_SEP', staffUid: 'STAFF_01', branchId: 'CN01', payrollBranchId: 'CN01', payrollPeriod: '2026-09', status: 'ELIGIBLE', commissionPayable: 800_000 },
        { id: 'COMM_LEGACY_STAFF_ID', staffId: 'STAFF_01', branchId: 'CN01', payrollPeriod: '2026-08', status: 'ELIGIBLE', commissionPayable: 700_000 },
        { id: 'COMM_LEGACY_NO_BRANCH', staffUid: 'STAFF_01', payrollPeriod: '2026-08', status: 'ELIGIBLE', commissionPayable: 600_000 }
      ],
      adjustments: [
        { id: 'ADJ_CN01_AUG', staffUid: 'STAFF_01', branchId: 'CN01', period: '2026-08', status: 'APPROVED', type: 'EARNING', amount: 50_000 },
        { id: 'ADJ_CN02_AUG', staffUid: 'STAFF_01', branchId: 'CN02', period: '2026-08', status: 'APPROVED', type: 'EARNING', amount: 500_000 },
        { id: 'ADJ_CN01_SEP', staffUid: 'STAFF_01', branchId: 'CN01', period: '2026-09', status: 'APPROVED', type: 'EARNING', amount: 400_000 }
      ]
    };
    const records = buildPayrollRecords(input);
    const otherBranchRecords = buildPayrollRecords({ ...input, branchId: 'CN02' });

    expect(records[0]).toMatchObject({ staffUid: 'STAFF_01', staffId: 'STAFF_01', payrollBranchId: 'CN01', branchId: 'CN01', techCommission: 1_000_000, adjustmentEarnings: 50_000 });
    expect(records[0].commissionEntryIds).toEqual(['COMM_CN01_AUG', 'COMM_CN02_AUG']);
    expect(records[0].commissionEntrySnapshots).toEqual({
      COMM_CN01_AUG: { amount: 100_000, sourceBranchId: 'CN01', payrollBranchId: 'CN01', commissionCategory: '' },
      COMM_CN02_AUG: { amount: 900_000, sourceBranchId: 'CN02', payrollBranchId: 'CN01', commissionCategory: '' }
    });
    expect(records[0].commissionSourceBranchIds).toEqual(['CN01', 'CN02']);
    expect(records[0].adjustmentEntryIds).toEqual(['ADJ_CN01_AUG']);
    expect(records[0].blockingIssues).toContain('COMMISSION_LEDGER_MIGRATION_REQUIRED');
    expect(otherBranchRecords).toEqual([]);
  });

  it('surfaces a blocking migration issue for a multi-branch user without payrollBranchId', () => {
    const records = buildPayrollRecords({
      period: '2026-08', branchId: 'CN01',
      users: [{ id: 'STAFF_01', data: { authUid: 'STAFF_01', displayName: 'Thiếu home branch', branchId: 'CN01', assignedBranchIds: ['CN01', 'CN02'], active: true } }],
      branches: [{ id: 'CN01', data: { name: 'Chi nhánh 1' } }],
      attendance: [], schedules: [], commissions: []
    });
    expect(records).toHaveLength(1);
    expect(records[0].blockingIssues).toContain('PAYROLL_HOME_BRANCH_REQUIRED');
  });

  it('uses Firebase authUid as the payroll identity and de-duplicates a legacy user profile', () => {
    const records = buildPayrollRecords({
      period: '2026-08', branchId: 'CN01',
      users: [
        { id: 'LEGACY_EMAIL_DOC', data: { authUid: 'AUTH_01', displayName: 'Hồ sơ cũ', branchId: 'CN01', active: true, baseSalary: 8_000_000 } },
        { id: 'AUTH_01', data: { authUid: 'AUTH_01', displayName: 'Hồ sơ chuẩn', branchId: 'CN01', active: true, baseSalary: 8_000_000 } }
      ],
      branches: [{ id: 'CN01', data: { name: 'Chi nhánh 1' } }],
      attendance: [], schedules: [],
      compensations: [{ id: 'COMP_AUTH_01', staffUid: 'AUTH_01', effectiveFrom: '2026-01-01', status: 'ACTIVE', baseSalary: 9_000_000, allowance: 500_000 }],
      commissions: [{ id: 'COMM_AUTH_01', staffUid: 'AUTH_01', branchId: 'CN01', payrollBranchId: 'CN01', payrollPeriod: '2026-08', status: 'ELIGIBLE', commissionPayable: 300_000 }]
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      staffId: 'AUTH_01',
      userDocumentId: 'AUTH_01',
      staffName: 'Hồ sơ chuẩn',
      baseSalary: 9_000_000,
      techCommission: 300_000
    });
    expect(records[0].blockingIssues).toContain('DUPLICATE_USER_PROFILE');
  });

  it('suppresses an active email-keyed legacy profile when its canonical Firebase profile is inactive', () => {
    const records = buildPayrollRecords({
      period: '2026-08', branchId: 'CN01',
      users: [
        { id: 'sale@phonehouse.vn', data: { email: 'sale@phonehouse.vn', displayName: 'Legacy active', branchId: 'CN01', active: true, baseSalary: 99_000_000 } },
        { id: 'AUTH_DISABLED', data: { authUid: 'AUTH_DISABLED', email: 'sale@phonehouse.vn', displayName: 'Canonical inactive', branchId: 'CN01', active: false } }
      ],
      branches: [], attendance: [], schedules: [], commissions: []
    });
    expect(records).toEqual([]);
  });

  it('groups explicit identical Firebase UIDs even when profile emails differ', () => {
    const records = buildPayrollRecords({
      period: '2026-08', branchId: 'CN01',
      users: [
        { id: 'AUTH_01', data: { authUid: 'AUTH_01', email: 'new@phonehouse.vn', displayName: 'Canonical', branchId: 'CN01', active: true, baseSalary: 8_000_000 } },
        { id: 'OLD_DOC', data: { authUid: 'AUTH_01', email: 'old@phonehouse.vn', displayName: 'Duplicate', branchId: 'CN01', active: true, baseSalary: 50_000_000 } }
      ],
      branches: [], attendance: [], schedules: [], commissions: []
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ staffUid: 'AUTH_01', userDocumentId: 'AUTH_01', baseSalary: 8_000_000 });
    expect(records[0].blockingIssues).toContain('DUPLICATE_USER_PROFILE');
  });

  it('fails closed for a true email-keyed legacy profile without canonical Firebase UID', () => {
    const records = buildPayrollRecords({
      period: '2026-08', branchId: 'CN01',
      users: [{ id: 'legacy@phonehouse.vn', data: { email: 'legacy@phonehouse.vn', displayName: 'Legacy', branchId: 'CN01', active: true, baseSalary: 8_000_000 } }],
      branches: [], attendance: [], schedules: [], commissions: []
    });
    expect(records).toHaveLength(1);
    expect(records[0].blockingIssues).toContain('LEGACY_USER_UID_MIGRATION_REQUIRED');
  });

  it('requires UID document migration when authUid is canonical but the user document id is legacy', () => {
    const records = buildPayrollRecords({
      period: '2026-08', branchId: 'CN01',
      users: [{ id: 'OLD_USER_DOC', data: { authUid: 'AUTH_01', displayName: 'Hồ sơ chưa đổi document ID', branchId: 'CN01', active: true, baseSalary: 8_000_000 } }],
      branches: [], attendance: [], schedules: [], commissions: []
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ staffUid: 'AUTH_01', userDocumentId: 'OLD_USER_DOC' });
    expect(records[0].blockingIssues).toContain('LEGACY_USER_UID_MIGRATION_REQUIRED');
  });

  it('unions published schedules from every assigned workplace and de-duplicates dates', () => {
    const records = buildPayrollRecords({
      period: '2026-08', branchId: 'CN01',
      users: [{ id: 'AUTH_01', data: { authUid: 'AUTH_01', branchId: 'CN01', payrollBranchId: 'CN01', assignedBranchIds: ['CN01', 'CN02'], active: true } }],
      branches: [], attendance: [], commissions: [],
      schedules: [
        { staffId: 'AUTH_01', branchId: 'CN01', status: 'PUBLISHED', days: { '2026-08-01': { shiftId: 'DAY' }, '2026-08-02': { shiftId: 'OFF', isOff: true } } },
        { staffId: 'AUTH_01', branchId: 'CN02', status: 'PUBLISHED', days: { '2026-08-01': { shiftId: 'EVENING' }, '2026-08-02': { shiftId: 'DAY' } } },
        { staffId: 'AUTH_01', branchId: 'CN03', status: 'PUBLISHED', days: { '2026-08-03': { shiftId: 'DAY' } } }
      ]
    });
    expect(records[0].standardWorkDays).toBe(2);
  });
});
