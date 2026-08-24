import { Firestore } from 'firebase-admin/firestore';

export interface ShiftSchedulingActor {
  uid: string;
  role: string;
  branchId?: string;
  assignedBranchIds?: string[];
  name?: string;
}

export interface ShiftBoardEntryInput {
  staffId: string;
  days: Record<string, { shiftId: string; note?: string }>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MANAGER_ROLES = new Set(['ADMIN', 'MANAGER', 'STORE_MANAGER']);

const cleanObject = <T extends Record<string, unknown>>(input: T): T => {
  const output: Record<string, unknown> = {};
  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      output[key] = value.map((item) => (
        item && typeof item === 'object' && !Array.isArray(item)
          ? cleanObject(item as Record<string, unknown>)
          : item
      ));
      return;
    }
    output[key] = value && typeof value === 'object'
      ? cleanObject(value as Record<string, unknown>)
      : value;
  });
  return output as T;
};

export function getWeekDates(weekStart: string): string[] {
  if (!DATE_RE.test(weekStart)) {
    throw new Error('INVALID_WEEK_START: Tuần làm việc phải có định dạng YYYY-MM-DD.');
  }
  const [year, month, day] = weekStart.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 12));
  if (Number.isNaN(start.getTime())) {
    throw new Error('INVALID_WEEK_START: Ngày bắt đầu tuần không hợp lệ.');
  }
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start.getTime() + index * 86_400_000);
    return current.toISOString().slice(0, 10);
  });
}

export function resolveDepartment(input: { role?: unknown; departmentId?: unknown; departmentName?: unknown }) {
  const explicitId = String(input.departmentId || '').trim();
  const explicitName = String(input.departmentName || '').trim();
  if (explicitId || explicitName) {
    return {
      departmentId: explicitId || explicitName.toUpperCase().replace(/\s+/g, '_'),
      departmentName: explicitName || explicitId
    };
  }

  const role = String(input.role || '').toUpperCase();
  if (['TECH', 'TECHNICIAN', 'TECH_LEAD'].includes(role)) return { departmentId: 'TECHNICAL', departmentName: 'Kỹ thuật' };
  if (['SALES', 'SALE', 'SALE_ONLINE', 'CASHIER', 'CSKH'].includes(role)) return { departmentId: 'SALES', departmentName: 'Bán hàng & CSKH' };
  if (['WAREHOUSE', 'INVENTORY_MANAGER'].includes(role)) return { departmentId: 'WAREHOUSE', departmentName: 'Kho hàng' };
  if (['ACCOUNTANT'].includes(role)) return { departmentId: 'FINANCE', departmentName: 'Kế toán' };
  if (['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER'].includes(role)) return { departmentId: 'MANAGEMENT', departmentName: 'Quản lý' };
  return { departmentId: 'OTHER', departmentName: 'Bộ phận khác' };
}

function assertCanManage(actor: ShiftSchedulingActor) {
  if (!MANAGER_ROLES.has(String(actor.role || '').toUpperCase())) {
    throw new Error('SHIFT_SCHEDULE_FORBIDDEN: Chỉ Admin hoặc Quản lý được xếp và đăng lịch làm việc.');
  }
}

function assertBranchAccess(actor: ShiftSchedulingActor, branchId: string) {
  if (!branchId || branchId === 'ALL') {
    throw new Error('SHIFT_BRANCH_REQUIRED: Vui lòng chọn một chi nhánh cụ thể.');
  }
  if (String(actor.role || '').toUpperCase() === 'ADMIN') return;
  const allowed = new Set([actor.branchId, ...(actor.assignedBranchIds || [])].filter(Boolean));
  if (!allowed.has(branchId)) {
    throw new Error('SHIFT_BRANCH_FORBIDDEN: Bạn không có quyền xếp ca cho chi nhánh này.');
  }
}

function canReadBranch(actor: ShiftSchedulingActor, branchId: string) {
  if (String(actor.role || '').toUpperCase() === 'ADMIN') return true;
  return [actor.branchId, ...(actor.assignedBranchIds || [])].filter(Boolean).includes(branchId);
}

export async function listShiftBoard(
  db: Firestore | null,
  actor: ShiftSchedulingActor,
  input: { weekStart: string; branchId?: string }
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  getWeekDates(input.weekStart);

  const role = String(actor.role || '').toUpperCase();
  const canManage = MANAGER_ROLES.has(role);
  const requestedBranchId = String(input.branchId || '').trim();

  const [scheduleSnapshot, definitionSnapshot, policySnapshot] = await Promise.all([
    db.collection('weeklyShiftSchedules').where('weekStart', '==', input.weekStart).limit(500).get(),
    db.collection('shiftDefinitions').limit(100).get(),
    db.collection('shiftDepartmentPolicies').limit(100).get()
  ]);

  const schedules = scheduleSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as any))
    .filter((schedule) => {
      if (!canManage) return schedule.staffId === actor.uid;
      if (!canReadBranch(actor, schedule.branchId)) return false;
      return !requestedBranchId || requestedBranchId === 'ALL' || schedule.branchId === requestedBranchId;
    });

  const definitions = definitionSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as any))
    .filter((definition) => definition.active !== false)
    .filter((definition) => {
      if (!definition.branchId || definition.branchId === 'ALL') return true;
      if (!canReadBranch(actor, definition.branchId)) return false;
      return !requestedBranchId || requestedBranchId === 'ALL' || definition.branchId === requestedBranchId;
    })
    .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));

  const policies = policySnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as any))
    .filter((policy) => policy.active !== false)
    .filter((policy) => canReadBranch(actor, policy.branchId))
    .filter((policy) => !requestedBranchId || requestedBranchId === 'ALL' || policy.branchId === requestedBranchId)
    .sort((a, b) => String(a.departmentName || '').localeCompare(String(b.departmentName || ''), 'vi'));

  return {
    weekStart: input.weekStart,
    schedules,
    definitions,
    policies,
    permissions: { canManage, canConfigureShifts: canManage }
  };
}

export async function saveShiftBoard(
  db: Firestore | null,
  actor: ShiftSchedulingActor,
  input: {
    branchId: string;
    weekStart: string;
    status: 'DRAFT' | 'PUBLISHED';
    entries: ShiftBoardEntryInput[];
    operationKey?: string;
  }
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  assertCanManage(actor);
  assertBranchAccess(actor, input.branchId);
  const weekDates = getWeekDates(input.weekStart);
  const entries = Array.isArray(input.entries) ? input.entries : [];
  if (entries.length === 0) throw new Error('SHIFT_ENTRIES_REQUIRED: Chưa có nhân viên nào trong lịch cần lưu.');
  if (entries.length > 200) throw new Error('SHIFT_ENTRIES_LIMIT: Mỗi lần chỉ lưu tối đa 200 nhân viên.');
  if (!['DRAFT', 'PUBLISHED'].includes(input.status)) throw new Error('SHIFT_STATUS_INVALID');

  const uniqueStaffIds = [...new Set(entries.map((entry) => String(entry.staffId || '').trim()).filter(Boolean))];
  if (uniqueStaffIds.length !== entries.length) throw new Error('SHIFT_STAFF_DUPLICATED: Danh sách có nhân viên bị trùng.');

  const operationKey = String(input.operationKey || '').trim();
  const operationRef = operationKey ? db.collection('shiftScheduleOperations').doc(operationKey) : null;
  if (operationRef) {
    const operationSnapshot = await operationRef.get();
    if (operationSnapshot.exists) return { ...operationSnapshot.data(), idempotentReplay: true };
  }

  // All reads are completed before the write batch begins.
  const [definitionSnapshot, ...userSnapshots] = await Promise.all([
    db.collection('shiftDefinitions').limit(100).get(),
    ...uniqueStaffIds.map((staffId) => db.collection('users').doc(staffId).get())
  ]);

  const definitions = new Map<string, any>();
  definitionSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data.active !== false) definitions.set(doc.id, { id: doc.id, ...data });
  });

  const users = new Map<string, any>();
  userSnapshots.forEach((snapshot, index) => {
    if (!snapshot.exists) throw new Error(`SHIFT_STAFF_NOT_FOUND: Không tìm thấy nhân viên ${uniqueStaffIds[index]}.`);
    users.set(uniqueStaffIds[index], snapshot.data());
  });

  const now = new Date().toISOString();
  const batch = db.batch();
  const persisted: any[] = [];

  entries.forEach((entry) => {
    const user = users.get(entry.staffId);
    if (!user || user.active === false) throw new Error(`SHIFT_STAFF_INACTIVE: Nhân viên ${entry.staffId} không hoạt động.`);
    const staffBranches = new Set([user.branchId, ...(user.assignedBranchIds || [])].filter(Boolean));
    if (!staffBranches.has(input.branchId)) {
      throw new Error(`SHIFT_STAFF_BRANCH_MISMATCH: ${user.displayName || entry.staffId} không thuộc chi nhánh đã chọn.`);
    }

    const normalizedDays: Record<string, any> = {};
    Object.entries(entry.days || {}).forEach(([date, assignment]) => {
      if (!weekDates.includes(date)) throw new Error(`SHIFT_DATE_OUTSIDE_WEEK: ${date} không thuộc tuần đã chọn.`);
      const shiftId = String(assignment?.shiftId || '').trim();
      if (!shiftId) return;
      if (shiftId === 'OFF') {
        normalizedDays[date] = { shiftId: 'OFF', shiftName: 'Nghỉ', startTime: '', endTime: '', breakMinutes: 0, status: 'OFF', isOff: true, note: String(assignment.note || '').trim() };
        return;
      }
      const definition = definitions.get(shiftId);
      if (!definition) throw new Error(`SHIFT_DEFINITION_NOT_FOUND: Ca ${shiftId} không tồn tại hoặc đã ngừng dùng.`);
      if (definition.branchId && definition.branchId !== 'ALL' && definition.branchId !== input.branchId) {
        throw new Error(`SHIFT_DEFINITION_BRANCH_MISMATCH: Ca ${definition.name || shiftId} không thuộc chi nhánh này.`);
      }
      normalizedDays[date] = cleanObject({
        shiftId,
        shiftName: definition.name,
        startTime: definition.startTime,
        endTime: definition.endTime,
        breakMinutes: Number(definition.breakDurationMinutes || definition.breakMinutes || 0),
        status: 'SCHEDULED',
        isOff: false,
        note: String(assignment.note || '').trim()
      });
    });

    if (input.status === 'PUBLISHED' && weekDates.some((date) => !normalizedDays[date])) {
      throw new Error(`SHIFT_WEEK_INCOMPLETE: Hãy xếp đủ 7 ngày (kể cả ngày nghỉ) cho ${user.displayName || entry.staffId} trước khi đăng lịch.`);
    }

    const department = resolveDepartment(user);
    const scheduleId = `SCHED_${input.branchId}_${input.weekStart}_${entry.staffId}`;
    const schedule = cleanObject({
      id: scheduleId,
      branchId: input.branchId,
      staffId: entry.staffId,
      staffName: user.displayName || user.name || entry.staffId,
      role: user.role || 'STAFF',
      departmentId: department.departmentId,
      departmentName: department.departmentName,
      weekStart: input.weekStart,
      weekStartDate: input.weekStart,
      days: normalizedDays,
      status: input.status,
      updatedAt: now,
      updatedBy: actor.name || actor.uid,
      ...(input.status === 'PUBLISHED' ? { publishedAt: now, publishedBy: actor.name || actor.uid } : {})
    });
    // Replace the whole weekly document so removed/cleared days cannot survive from an older draft.
    batch.set(db.collection('weeklyShiftSchedules').doc(scheduleId), schedule, { merge: false });
    persisted.push(schedule);
  });

  const result = {
    branchId: input.branchId,
    weekStart: input.weekStart,
    status: input.status,
    saved: persisted.length,
    savedAt: now,
    idempotentReplay: false
  };
  const auditRef = db.collection('shiftScheduleAuditLogs').doc();
  batch.set(auditRef, cleanObject({
    ...result,
    actorUid: actor.uid,
    actorName: actor.name || actor.uid,
    scheduleIds: persisted.map((schedule) => schedule.id),
    createdAt: now
  }));
  if (operationRef) batch.set(operationRef, result);
  await batch.commit();
  return result;
}

export async function upsertShiftDefinition(
  db: Firestore | null,
  actor: ShiftSchedulingActor,
  input: {
    id?: string;
    name: string;
    startTime: string;
    endTime: string;
    breakDurationMinutes?: number;
    color?: string;
    branchId?: string;
    active?: boolean;
  }
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  assertCanManage(actor);
  const name = String(input.name || '').trim();
  if (name.length < 2) throw new Error('SHIFT_NAME_REQUIRED: Tên ca phải có ít nhất 2 ký tự.');
  if (!TIME_RE.test(input.startTime) || !TIME_RE.test(input.endTime)) throw new Error('SHIFT_TIME_INVALID: Giờ ca phải có dạng HH:mm.');
  const breakDurationMinutes = Number(input.breakDurationMinutes || 0);
  if (!Number.isFinite(breakDurationMinutes) || breakDurationMinutes < 0 || breakDurationMinutes > 240) {
    throw new Error('SHIFT_BREAK_INVALID: Thời gian nghỉ phải từ 0 đến 240 phút.');
  }

  const role = String(actor.role || '').toUpperCase();
  const branchId = role === 'ADMIN' ? String(input.branchId || 'ALL') : String(actor.branchId || '');
  if (branchId !== 'ALL') assertBranchAccess(actor, branchId);
  const collection = db.collection('shiftDefinitions');
  const ref = input.id ? collection.doc(input.id) : collection.doc();
  const existing = await ref.get();
  if (input.id && !existing.exists) throw new Error('SHIFT_DEFINITION_NOT_FOUND');
  if (existing.exists) {
    const existingBranchId = existing.data()?.branchId || 'ALL';
    if (role !== 'ADMIN' && existingBranchId !== actor.branchId) throw new Error('SHIFT_DEFINITION_FORBIDDEN');
  }

  const now = new Date().toISOString();
  const definition = cleanObject({
    id: ref.id,
    name,
    type: 'CUSTOM',
    startTime: input.startTime,
    endTime: input.endTime,
    breakDurationMinutes,
    color: String(input.color || '#FF4B16'),
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-800',
    branchId,
    active: input.active !== false,
    createdAt: existing.data()?.createdAt || now,
    createdBy: existing.data()?.createdBy || actor.uid,
    updatedAt: now,
    updatedBy: actor.uid
  });
  await ref.set(definition, { merge: false });
  return definition;
}

export async function upsertShiftDepartmentPolicy(
  db: Firestore | null,
  actor: ShiftSchedulingActor,
  input: {
    branchId: string;
    departmentId: string;
    departmentName: string;
    mode: 'FIXED' | 'ROTATING';
    defaultShiftId?: string;
    workDayIndexes?: number[];
    active?: boolean;
  }
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  assertCanManage(actor);
  const branchId = String(input.branchId || '').trim();
  assertBranchAccess(actor, branchId);
  const departmentId = String(input.departmentId || '').trim().toUpperCase();
  const departmentName = String(input.departmentName || '').trim();
  if (!departmentId || !departmentName) throw new Error('SHIFT_DEPARTMENT_REQUIRED: Vui lòng chọn bộ phận.');
  if (!['FIXED', 'ROTATING'].includes(input.mode)) throw new Error('SHIFT_POLICY_MODE_INVALID');

  const workDayIndexes = [...new Set((input.workDayIndexes || []).map(Number))].sort((a, b) => a - b);
  if (workDayIndexes.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error('SHIFT_POLICY_WORK_DAYS_INVALID');
  }
  const defaultShiftId = String(input.defaultShiftId || '').trim();
  if (input.mode === 'FIXED' && !defaultShiftId) {
    throw new Error('SHIFT_POLICY_DEFAULT_REQUIRED: Bộ phận giờ hành chính phải chọn ca mặc định.');
  }
  if (input.mode === 'FIXED' && workDayIndexes.length === 0) {
    throw new Error('SHIFT_POLICY_WORK_DAYS_REQUIRED: Hãy chọn ít nhất một ngày làm việc.');
  }

  const policyId = `POLICY_${branchId}_${departmentId.replace(/[^A-Z0-9_-]/g, '_')}`;
  const policyRef = db.collection('shiftDepartmentPolicies').doc(policyId);
  const reads = [policyRef.get()];
  if (input.mode === 'FIXED') reads.push(db.collection('shiftDefinitions').doc(defaultShiftId).get());
  const [existing, shiftSnapshot] = await Promise.all(reads);
  if (input.mode === 'FIXED') {
    if (!shiftSnapshot?.exists) throw new Error('SHIFT_DEFINITION_NOT_FOUND: Ca mặc định không tồn tại.');
    const definition = shiftSnapshot.data();
    if (definition?.active === false) throw new Error('SHIFT_DEFINITION_INACTIVE: Ca mặc định đã ngừng dùng.');
    if (definition?.branchId && definition.branchId !== 'ALL' && definition.branchId !== branchId) {
      throw new Error('SHIFT_DEFINITION_BRANCH_MISMATCH: Ca mặc định không thuộc chi nhánh này.');
    }
  }

  const now = new Date().toISOString();
  const policy = cleanObject({
    id: policyId,
    branchId,
    departmentId,
    departmentName,
    mode: input.mode,
    defaultShiftId: input.mode === 'FIXED' ? defaultShiftId : undefined,
    workDayIndexes: input.mode === 'FIXED' ? workDayIndexes : [],
    active: input.active !== false,
    createdAt: existing.data()?.createdAt || now,
    createdBy: existing.data()?.createdBy || actor.uid,
    updatedAt: now,
    updatedBy: actor.uid
  });
  await policyRef.set(policy, { merge: false });
  return policy;
}
