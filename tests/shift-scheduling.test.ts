import { describe, expect, it } from 'vitest';
import { getWeekDates, resolveDepartment, saveShiftBoard, upsertShiftDepartmentPolicy } from '../server/services/shiftSchedulingService';
import { resolveShiftAssignment } from '../server/services/attendanceService';
import { applyFixedDepartmentPolicies } from '../src/utils/shiftPolicy';

type Ref = { col: string; id: string };

function createDb() {
  const data = new Map<string, any>();
  let autoId = 0;
  const snapshot = (ref: Ref) => ({
    id: ref.id,
    exists: data.has(`${ref.col}/${ref.id}`),
    data: () => data.get(`${ref.col}/${ref.id}`)
  });
  const docsFor = (col: string) => [...data.entries()]
    .filter(([key]) => key.startsWith(`${col}/`))
    .map(([key, value]) => ({ id: key.slice(col.length + 1), data: () => value }));
  const db: any = {
    collection: (col: string) => ({
      doc: (id?: string) => {
        const ref: any = { col, id: id || `AUTO_${++autoId}` };
        ref.get = async () => snapshot(ref);
        ref.set = async (value: any) => data.set(`${ref.col}/${ref.id}`, value);
        return ref;
      },
      limit: () => ({ get: async () => ({ docs: docsFor(col), empty: docsFor(col).length === 0 }) })
    }),
    batch: () => {
      const writes: Array<() => void> = [];
      return {
        set: (ref: Ref, value: any, options?: { merge?: boolean }) => writes.push(() => {
          const key = `${ref.col}/${ref.id}`;
          data.set(key, options?.merge ? { ...(data.get(key) || {}), ...value } : value);
        }),
        commit: async () => writes.forEach((write) => write())
      };
    }
  };
  return { db, data };
}

const actor = { uid: 'ADMIN_01', role: 'ADMIN', branchId: 'CN01', name: 'Admin' };

describe('Department shift scheduling', () => {
  it('builds the exact seven calendar dates and resolves friendly departments', () => {
    expect(getWeekDates('2026-08-24')).toEqual([
      '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30'
    ]);
    expect(resolveDepartment({ role: 'TECHNICIAN' })).toEqual({ departmentId: 'TECHNICAL', departmentName: 'Kỹ thuật' });
    expect(resolveDepartment({ role: 'SALES' })).toEqual({ departmentId: 'SALES', departmentName: 'Bán hàng' });
    expect(resolveDepartment({ role: 'SALES', departmentId: 'CSKH', departmentName: 'Chăm sóc khách hàng' })).toEqual({ departmentId: 'CSKH', departmentName: 'Chăm sóc khách hàng' });
  });

  it('publishes a complete weekly schedule with immutable shift snapshots and audit data', async () => {
    const { db, data } = createDb();
    data.set('users/STAFF_01', { displayName: 'KTV Nam', role: 'TECHNICIAN', branchId: 'CN01', assignedBranchIds: ['CN01'], active: true });
    data.set('shiftDefinitions/SHIFT_DAY', { name: 'Ca ngày', startTime: '08:00', endTime: '17:00', breakDurationMinutes: 60, branchId: 'CN01', active: true, color: '#FF4B16' });
    const dates = getWeekDates('2026-08-24');
    const days = Object.fromEntries(dates.map((date, index) => [date, { shiftId: index === 6 ? 'OFF' : 'SHIFT_DAY' }]));

    const result = await saveShiftBoard(db, actor, {
      branchId: 'CN01',
      weekStart: '2026-08-24',
      status: 'PUBLISHED',
      entries: [{ staffId: 'STAFF_01', days }],
      operationKey: 'OP_SHIFT_01'
    });

    expect(result).toMatchObject({ saved: 1, status: 'PUBLISHED', idempotentReplay: false });
    const schedule = data.get('weeklyShiftSchedules/SCHED_CN01_2026-08-24_STAFF_01');
    expect(schedule).toMatchObject({ staffName: 'KTV Nam', departmentId: 'TECHNICAL', status: 'PUBLISHED' });
    expect(schedule.days['2026-08-24']).toMatchObject({ shiftId: 'SHIFT_DAY', shiftName: 'Ca ngày', startTime: '08:00', endTime: '17:00', breakMinutes: 60 });
    expect(schedule.days['2026-08-30']).toMatchObject({ shiftId: 'OFF', isOff: true });
    expect([...data.keys()].some((key) => key.startsWith('shiftScheduleAuditLogs/'))).toBe(true);
  });

  it('does not publish a staff schedule when one day is still unassigned', async () => {
    const { db, data } = createDb();
    data.set('users/STAFF_01', { displayName: 'Sale Mai', role: 'SALES', branchId: 'CN01', active: true });
    data.set('shiftDefinitions/SHIFT_DAY', { name: 'Ca ngày', startTime: '08:00', endTime: '17:00', breakDurationMinutes: 60, branchId: 'CN01', active: true });
    const dates = getWeekDates('2026-08-24').slice(0, 6);
    const days = Object.fromEntries(dates.map((date) => [date, { shiftId: 'SHIFT_DAY' }]));

    await expect(saveShiftBoard(db, actor, {
      branchId: 'CN01',
      weekStart: '2026-08-24',
      status: 'PUBLISHED',
      entries: [{ staffId: 'STAFF_01', days }]
    })).rejects.toThrow('SHIFT_WEEK_INCOMPLETE');
    expect(data.has('weeklyShiftSchedules/SCHED_CN01_2026-08-24_STAFF_01')).toBe(false);
  });

  it('blocks a manager from scheduling another branch', async () => {
    const { db } = createDb();
    await expect(saveShiftBoard(db, { uid: 'MGR_01', role: 'MANAGER', branchId: 'CN01' }, {
      branchId: 'CN02',
      weekStart: '2026-08-24',
      status: 'DRAFT',
      entries: [{ staffId: 'STAFF_01', days: { '2026-08-24': { shiftId: 'OFF' } } }]
    })).rejects.toThrow('SHIFT_BRANCH_FORBIDDEN');
  });

  it('does not allow check-in from an unpublished draft schedule', async () => {
    const db: any = {
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({ status: 'DRAFT', days: { '2026-08-24': { shiftId: 'SHIFT_DAY', shiftName: 'Ca ngày', startTime: '08:00', endTime: '17:00' } } })
          })
        }),
        where: () => ({ where: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }) }) })
      })
    };

    await expect(resolveShiftAssignment(db, { staffId: 'STAFF_01', branchId: 'CN01', workDate: '2026-08-24' }))
      .rejects.toThrow('SHIFT_NOT_ASSIGNED');
  });

  it('stores a fixed administrative policy against a configured shift', async () => {
    const { db, data } = createDb();
    data.set('shiftDefinitions/SHIFT_OFFICE', { name: 'Giờ hành chính', startTime: '08:00', endTime: '17:30', branchId: 'CN01', active: true });
    const policy = await upsertShiftDepartmentPolicy(db, actor, {
      branchId: 'CN01',
      departmentId: 'FINANCE',
      departmentName: 'Kế toán',
      mode: 'FIXED',
      defaultShiftId: 'SHIFT_OFFICE',
      workDayIndexes: [0, 1, 2, 3, 4, 5]
    });

    expect(policy).toMatchObject({ id: 'POLICY_CN01_FINANCE', mode: 'FIXED', defaultShiftId: 'SHIFT_OFFICE' });
    expect(data.get('shiftDepartmentPolicies/POLICY_CN01_FINANCE').workDayIndexes).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('auto-fills fixed departments, leaves sales rotating, and preserves manual exceptions', () => {
    const staff: any[] = [
      { id: 'ACC_01', role: 'ACCOUNTANT' },
      { id: 'SALE_01', role: 'SALES' }
    ];
    const dates = getWeekDates('2026-08-24');
    const result = applyFixedDepartmentPolicies({
      draft: { ACC_01: { '2026-08-26': { shiftId: 'OFF', note: 'Nghỉ phép đã duyệt' } } },
      policies: [
        { id: 'P1', branchId: 'CN01', departmentId: 'FINANCE', departmentName: 'Kế toán', mode: 'FIXED', defaultShiftId: 'SHIFT_OFFICE', workDayIndexes: [0, 1, 2, 3, 4], active: true },
        { id: 'P2', branchId: 'CN01', departmentId: 'SALES', departmentName: 'Bán hàng & CSKH', mode: 'ROTATING', workDayIndexes: [], active: true }
      ],
      staffList: staff,
      dates,
      validShiftIds: new Set(['SHIFT_OFFICE'])
    });

    expect(result.draft.ACC_01['2026-08-24'].shiftId).toBe('SHIFT_OFFICE');
    expect(result.draft.ACC_01['2026-08-26']).toEqual({ shiftId: 'OFF', note: 'Nghỉ phép đã duyệt' });
    expect(result.draft.ACC_01['2026-08-30'].shiftId).toBe('OFF');
    expect(result.draft.SALE_01).toBeUndefined();
    expect(result.appliedCells).toBe(6);
  });
});
