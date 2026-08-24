import { ShiftDepartmentPolicy, StaffMember } from '../types';

export type ShiftDraftDay = { shiftId: string; note?: string };
export type ShiftDraftSchedule = Record<string, Record<string, ShiftDraftDay>>;

export function resolveStaffDepartment(staff: Pick<StaffMember, 'role' | 'departmentId' | 'departmentName'>) {
  if (staff.departmentId || staff.departmentName) {
    return {
      id: staff.departmentId || String(staff.departmentName).toUpperCase().replace(/\s+/g, '_'),
      name: staff.departmentName || staff.departmentId || 'Bộ phận khác'
    };
  }
  const role = String(staff.role || '').toUpperCase();
  if (['TECH', 'TECHNICIAN', 'TECH_LEAD'].includes(role)) return { id: 'TECHNICAL', name: 'Kỹ thuật' };
  if (['SALES', 'SALE', 'SALE_ONLINE', 'CASHIER', 'CSKH'].includes(role)) return { id: 'SALES', name: 'Bán hàng & CSKH' };
  if (['WAREHOUSE', 'INVENTORY_MANAGER'].includes(role)) return { id: 'WAREHOUSE', name: 'Kho hàng' };
  if (role === 'ACCOUNTANT') return { id: 'FINANCE', name: 'Kế toán' };
  if (['ADMIN', 'MANAGER', 'STORE_MANAGER'].includes(role)) return { id: 'MANAGEMENT', name: 'Quản lý' };
  return { id: 'OTHER', name: 'Bộ phận khác' };
}

export function applyFixedDepartmentPolicies(input: {
  draft: ShiftDraftSchedule;
  policies: ShiftDepartmentPolicy[];
  staffList: StaffMember[];
  dates: string[];
  validShiftIds: Set<string>;
}) {
  const next: ShiftDraftSchedule = Object.fromEntries(
    Object.entries(input.draft).map(([staffId, days]) => [staffId, { ...days }])
  );
  const policyMap = new Map(
    input.policies
      .filter((policy) => policy.active !== false)
      .map((policy) => [policy.departmentId, policy])
  );
  let appliedCells = 0;
  const fixedStaffIds = new Set<string>();

  input.staffList.forEach((staff) => {
    const department = resolveStaffDepartment(staff);
    const policy = policyMap.get(department.id);
    if (!policy || policy.mode !== 'FIXED' || !policy.defaultShiftId || !input.validShiftIds.has(policy.defaultShiftId)) return;
    fixedStaffIds.add(staff.id);
    const staffDays = { ...(next[staff.id] || {}) };
    input.dates.forEach((date, dayIndex) => {
      // Existing assignments are exceptions and always win over the department rule.
      if (staffDays[date]?.shiftId) return;
      staffDays[date] = {
        shiftId: policy.workDayIndexes.includes(dayIndex) ? policy.defaultShiftId! : 'OFF',
        note: 'Tự điền theo quy tắc bộ phận'
      };
      appliedCells += 1;
    });
    next[staff.id] = staffDays;
  });

  return { draft: next, appliedCells, fixedStaffIds };
}
