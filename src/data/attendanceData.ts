import {
  StaffMember,
  ShiftDefinition,
  WeeklyShiftSchedule,
  AttendanceRecord,
  LeaveRequest,
  CommissionTransaction,
  TechnicianPerformanceRecord,
  SalaryPolicy,
  PayrollLedgerItem,
  MonthlyPayrollSlip
} from '../types';

export const INITIAL_STAFF_MEMBERS: StaffMember[] = [];

export const INITIAL_SHIFTS: ShiftDefinition[] = [
  {
    id: 'SHIFT_MORNING',
    name: 'Ca sáng',
    type: 'MORNING',
    startTime: '08:00',
    endTime: '17:00',
    breakDurationMinutes: 60,
    color: '#ff4b16',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-800'
  },
  {
    id: 'SHIFT_AFTERNOON',
    name: 'Ca chiều',
    type: 'AFTERNOON',
    startTime: '14:00',
    endTime: '21:00',
    breakDurationMinutes: 45,
    color: '#F97316',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-800'
  },
  {
    id: 'SHIFT_EVENING',
    name: 'Ca tối',
    type: 'EVENING',
    startTime: '17:00',
    endTime: '22:00',
    breakDurationMinutes: 30,
    color: '#E11D48',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-rose-800'
  }
];

export const INITIAL_ATTENDANCE_RECORD_CURRENT_USER: AttendanceRecord | null = null;

export const INITIAL_TODAY_ATTENDANCE_LIST: AttendanceRecord[] = [];

export const INITIAL_WEEKLY_SCHEDULES: WeeklyShiftSchedule[] = [];

export const INITIAL_COMMISSIONS: CommissionTransaction[] = [];

export const INITIAL_LEAVE_REQUESTS: LeaveRequest[] = [];

export const INITIAL_PAYROLL_LEDGER_CURRENT_USER: PayrollLedgerItem[] = [];

export const INITIAL_MONTHLY_PAYROLL_SLIPS: MonthlyPayrollSlip[] = [];

export const INITIAL_POLICIES: SalaryPolicy[] = [
  {
    id: 'POL_SALES_2026',
    name: 'Chính sách Lương & Thưởng Bán Hàng Showroom',
    role: 'SALES',
    effectiveFrom: '2026-01-01',
    version: 'v2.1',
    status: 'ACTIVE',
    baseSalary: 8000000,
    attendanceBonus: 500000,
    deviceProfitPercent: 2.0,
    accessoryProfitPercent: 5.0,
    carePackagePercent: 10.0,
    onlineSaleSplitPercent: 30.0,
    storeCloserSplitPercent: 70.0,
    techPointRateVnd: 0,
    overtimeHourlyRate: 35000,
    kpiBonusTiers: [
      { minPercent: 80, bonusAmount: 600000 },
      { minPercent: 100, bonusAmount: 1500000 },
      { minPercent: 120, bonusAmount: 3000000 }
    ]
  },
  {
    id: 'POL_ONLINE_2026',
    name: 'Chính sách Lương Sale Online & Trực Page',
    role: 'SALE_ONLINE',
    effectiveFrom: '2026-01-01',
    version: 'v1.0',
    status: 'ACTIVE',
    baseSalary: 7500000,
    attendanceBonus: 500000,
    deviceProfitPercent: 1.5,
    accessoryProfitPercent: 4.0,
    carePackagePercent: 8.0,
    onlineSaleSplitPercent: 30.0,
    storeCloserSplitPercent: 70.0,
    techPointRateVnd: 0,
    overtimeHourlyRate: 35000,
    kpiBonusTiers: [
      { minPercent: 80, bonusAmount: 500000 },
      { minPercent: 100, bonusAmount: 1200000 },
      { minPercent: 120, bonusAmount: 2500000 }
    ]
  },
  {
    id: 'POL_TECH_2026',
    name: 'Chính sách Kỹ Thuật Viên & Điểm Sửa Chữa (Points)',
    role: 'TECHNICIAN',
    effectiveFrom: '2026-01-01',
    version: 'v3.0',
    status: 'ACTIVE',
    baseSalary: 9500000,
    attendanceBonus: 500000,
    deviceProfitPercent: 0.5,
    accessoryProfitPercent: 3.0,
    carePackagePercent: 5.0,
    onlineSaleSplitPercent: 0,
    storeCloserSplitPercent: 0,
    techPointRateVnd: 50000,
    overtimeHourlyRate: 45000,
    kpiBonusTiers: [
      { minPercent: 80, bonusAmount: 700000 },
      { minPercent: 100, bonusAmount: 1800000 },
      { minPercent: 120, bonusAmount: 3500000 }
    ]
  }
];
