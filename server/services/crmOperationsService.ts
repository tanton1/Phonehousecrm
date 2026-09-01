import crypto from 'crypto';
import { FieldPath, FieldValue, Firestore } from 'firebase-admin/firestore';
import {
  CareAction,
  CareChannel,
  CareOutcome,
  CRMTask,
  CustomerResponseCode,
  EvidenceType,
  EvidenceVerificationStatus,
  Lead,
  LeadAppointment,
  LeadQuote,
  LeadStatus,
  ObjectionCategory,
  ObjectionCode
} from '../../src/types';
import { calculateCareQualityBreakdown, calculateLeadTemperature } from '../../src/features/crm/utils/crmEngine';
import { normalizeOperationalPolicyVersions, selectEffectiveOperationalPolicy } from './operationalPolicyService';
import { canTransitionLeadState } from './crmService';

export interface CrmActor {
  uid: string;
  role: string;
  branchId?: string;
  assignedBranchIds?: string[];
  name?: string;
}

export interface CrmLeadListInput {
  branchId?: string;
  ownerId?: string;
  status?: string;
  source?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface CrmCreateLeadInput {
  branchId: string;
  name: string;
  phone: string;
  zalo?: string;
  source?: string;
  interestedModel?: string;
  budget?: number;
  tradeInRequired?: boolean;
  tradeInModel?: string;
  notes?: string;
  requestedAssigneeId?: string;
  nextActionType?: string;
  nextActionAt?: string;
  operationKey: string;
}

export interface CrmCareInput {
  leadId: string;
  taskId?: string;
  channel: CareChannel;
  action: CareAction;
  outcome: CareOutcome;
  customerResponseCode?: CustomerResponseCode;
  customerResponseText?: string;
  objectionCategory?: ObjectionCategory;
  objectionCode?: ObjectionCode;
  priceDetails?: Record<string, unknown>;
  evidenceType?: EvidenceType;
  evidenceData?: Record<string, unknown>;
  nextActionType?: 'CALL' | 'ZALO' | 'SEND_QUOTE' | 'APPOINTMENT' | 'LONG_TERM_NURTURE' | 'CLOSE_DEAL';
  nextActionAt?: string;
  nextActionNotes?: string;
  operationKey: string;
}

export interface AssignmentCandidate {
  id: string;
  name: string;
  role: string;
  departmentId?: string;
  openTasks: number;
  lastAssignedAt?: string;
  scheduledNow?: boolean;
}

const MANAGER_ROLES = new Set(['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER']);
const SALES_ROLES = new Set(['SALES', 'SALE', 'SALE_ONLINE']);
const CARE_ROLES = new Set(['CUSTOMER_CARE', 'CSKH']);
const ACTIVE_TASK_STATUSES = new Set(['PENDING', 'IN_PROGRESS']);
const CLOSED_LEAD_STATUSES = new Set(['won', 'lost']);

function cleanObject<T extends Record<string, any>>(input: T): T {
  const output: Record<string, any> = {};
  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      output[key] = value.map(item => item && typeof item === 'object' && !Array.isArray(item) ? cleanObject(item) : item);
      return;
    }
    output[key] = value && typeof value === 'object' && !(value instanceof Date)
      ? cleanObject(value)
      : value;
  });
  return output as T;
}

function serializeCrmValue(value: any): any {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.toMillis === 'function') return new Date(value.toMillis()).toISOString();
  if (Array.isArray(value)) return value.map(serializeCrmValue);
  return Object.fromEntries(Object.entries(value)
    .map(([key, nested]) => [key, serializeCrmValue(nested)])
    .filter(([, nested]) => nested !== undefined));
}

function normalizedRole(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

function isManager(actor: CrmActor) {
  return MANAGER_ROLES.has(normalizedRole(actor.role));
}

function isCustomerCareIdentity(value: any) {
  const role = normalizedRole(value?.role);
  const department = normalizedRole(value?.departmentId || value?.departmentName).replace(/\s+/g, '_');
  return CARE_ROLES.has(role) || department === 'CUSTOMER_CARE' || department === 'CSKH' || department.includes('CHĂM_SÓC');
}

function isSalesIdentity(value: any) {
  const role = normalizedRole(value?.role);
  const department = normalizedRole(value?.departmentId || value?.departmentName).replace(/\s+/g, '_');
  return SALES_ROLES.has(role) || department === 'SALES' || department === 'BÁN_HÀNG';
}

function assertBranchAccess(actor: CrmActor, branchId: string) {
  if (!branchId || branchId === 'ALL') throw new Error('CRM_BRANCH_REQUIRED: Vui lòng chọn chi nhánh cụ thể.');
  if (normalizedRole(actor.role) === 'ADMIN') return;
  const allowed = new Set([actor.branchId, ...(actor.assignedBranchIds || [])].filter(Boolean));
  if (!allowed.has(branchId)) throw new Error('CRM_BRANCH_FORBIDDEN: Bạn không có quyền truy cập chi nhánh này.');
}

function canAccessBranch(actor: CrmActor, branchId: string) {
  if (normalizedRole(actor.role) === 'ADMIN') return true;
  return [actor.branchId, ...(actor.assignedBranchIds || [])].filter(Boolean).includes(branchId);
}

export function normalizeCrmPhone(input: unknown): string {
  let phone = String(input || '').replace(/\D/g, '');
  if (phone.startsWith('84') && phone.length >= 11) phone = `0${phone.slice(2)}`;
  if (phone.length === 9) phone = `0${phone}`;
  if (!/^0\d{9}$/.test(phone)) throw new Error('CRM_PHONE_INVALID: Số điện thoại phải gồm 10 số hợp lệ.');
  return phone;
}

function normalizeSearch(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildCrmSearchPrefixes(...values: unknown[]) {
  const prefixes = new Set<string>();
  values.forEach(value => {
    const normalized = normalizeSearch(value);
    if (!normalized) return;
    const words = normalized.split(/\s+/).filter(Boolean);
    for (let index = 0; index < words.length; index += 1) {
      const phrase = words.slice(index).join(' ');
      for (let size = 2; size <= Math.min(24, phrase.length); size += 1) prefixes.add(phrase.slice(0, size));
    }
    prefixes.add(normalized.slice(0, 60));
  });
  return [...prefixes].slice(0, 120);
}

function timestampMillis(value: any): number {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(String(value).replace(' ', 'T')).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIso(value: unknown, fallback?: Date): string {
  const text = String(value || '').trim();
  const parsed = text ? new Date(text.replace(' ', 'T')) : fallback;
  if (!parsed || Number.isNaN(parsed.getTime())) throw new Error('CRM_DATETIME_INVALID: Thời gian xử lý không hợp lệ.');
  return parsed.toISOString();
}

function vietnamClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short'
  }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const time = `${get('hour')}:${get('minute')}`;
  const localNoon = new Date(`${date}T12:00:00+07:00`);
  const day = localNoon.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(localNoon.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  return { date, time, weekStart: monday };
}

function safeDocSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
}

function operationId(kind: string, operationKey: string) {
  return `${kind}_${crypto.createHash('sha256').update(operationKey).digest('hex').slice(0, 32)}`;
}

function activityIdFor(operationKey: string) {
  return `CARE_${crypto.createHash('sha256').update(operationKey).digest('hex').slice(0, 28)}`;
}

function eventIdFor(operationKey: string) {
  return `CUST_ACT_${crypto.createHash('sha256').update(operationKey).digest('hex').slice(0, 28)}`;
}

function validateOperationKey(value: unknown) {
  const key = String(value || '').trim();
  if (key.length < 8 || key.length > 180) throw new Error('CRM_OPERATION_KEY_REQUIRED: Thiếu mã chống tạo trùng hợp lệ.');
  return key;
}

function encodeCursor(id: string) {
  return Buffer.from(JSON.stringify({ id }), 'utf8').toString('base64url');
}

function decodeCursor(cursor?: string) {
  if (!cursor) return '';
  try {
    return String(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))?.id || '');
  } catch {
    throw new Error('CRM_CURSOR_INVALID');
  }
}

export function chooseCrmAssignee(candidates: AssignmentCandidate[], rotation = 0): AssignmentCandidate | null {
  const eligible = candidates.filter(item => item.scheduledNow !== false);
  const pool = eligible.length ? eligible : candidates;
  if (!pool.length) return null;
  const minimumOpen = Math.min(...pool.map(item => item.openTasks));
  const leastLoaded = pool
    .filter(item => item.openTasks === minimumOpen)
    .sort((left, right) => {
      const assignedDiff = timestampMillis(left.lastAssignedAt) - timestampMillis(right.lastAssignedAt);
      return assignedDiff || left.id.localeCompare(right.id);
    });
  return leastLoaded[Math.abs(rotation) % leastLoaded.length] || leastLoaded[0];
}

async function loadCarePolicy(db: Firestore) {
  const snapshot = await db.collection('operationalConfigs').doc('customerCare').get();
  const policy = selectEffectiveOperationalPolicy(normalizeOperationalPolicyVersions('customerCare', snapshot.exists ? snapshot.data() : null));
  return policy || {
    policyId: 'CRM_SAFE_DEFAULT', version: '1', firstResponseMinutes: 15, followUpAttempts: 3,
    followUpDays: [1, 3, 7, 30], completedFollowUpCommission: 0,
    requireEvidence: false, requireQaApproval: false
  };
}

export async function prepareCrmPostSalePlan(
  db: Firestore,
  branchId: string,
  fallback: { id: string; name?: string }
) {
  const [candidates, policy] = await Promise.all([
    loadAssignmentCandidates(db, branchId, 'POST_SALE'),
    loadCarePolicy(db)
  ]);
  const assignee = chooseCrmAssignee(candidates, Date.now()) || {
    id: fallback.id,
    name: fallback.name || fallback.id,
    role: 'SALES',
    openTasks: 0,
    scheduledNow: true
  };
  const days: number[] = [...new Set<number>((Array.isArray(policy.followUpDays) ? policy.followUpDays : [1, 3, 7, 30])
    .map((value: unknown) => Math.round(Number(value)))
    .filter((value: number) => Number.isFinite(value) && value > 0 && value <= 365))].slice(0, 6);
  return { assignee, days: days.length ? days : [1, 3, 7, 30], policyId: policy.policyId || policy.id || 'CRM_SAFE_DEFAULT', policyVersion: policy.version || '1' };
}

function userBranches(user: any) {
  return new Set([user?.branchId, ...(Array.isArray(user?.assignedBranchIds) ? user.assignedBranchIds : [])].filter(Boolean));
}

async function loadAssignmentCandidates(db: Firestore, branchId: string, scope: 'PRE_SALE' | 'POST_SALE') {
  const clock = vietnamClock();
  const [usersSnapshot, tasksSnapshot, schedulesSnapshot] = await Promise.all([
    db.collection('users').where('active', '==', true).limit(500).get(),
    db.collection('crmTasks').where('branchId', '==', branchId).limit(2000).get(),
    db.collection('weeklyShiftSchedules').where('weekStart', '==', clock.weekStart).limit(500).get()
  ]);
  const openCounts = new Map<string, number>();
  tasksSnapshot.docs.forEach(doc => {
    const task = doc.data();
    if (ACTIVE_TASK_STATUSES.has(String(task.status))) {
      openCounts.set(String(task.assignedStaffId || ''), (openCounts.get(String(task.assignedStaffId || '')) || 0) + 1);
    }
  });
  const scheduleMap = new Map<string, any>();
  schedulesSnapshot.docs.forEach(doc => {
    const schedule = doc.data();
    if (schedule.branchId === branchId && schedule.status === 'PUBLISHED') scheduleMap.set(String(schedule.staffId), schedule);
  });
  const hasPublishedSchedules = scheduleMap.size > 0;
  return usersSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as any))
    .filter(user => userBranches(user).has(branchId))
    .filter(user => scope === 'POST_SALE' ? isCustomerCareIdentity(user) : isSalesIdentity(user))
    .map(user => {
      const schedule = scheduleMap.get(user.id);
      const day = schedule?.days?.[clock.date];
      const scheduledNow = !hasPublishedSchedules || Boolean(
        day && day.shiftId !== 'OFF' && day.isOff !== true && (!day.startTime || !day.endTime || (clock.time >= day.startTime && clock.time <= day.endTime))
      );
      return {
        id: user.id,
        name: user.displayName || user.name || user.email || user.id,
        role: user.role,
        departmentId: user.departmentId,
        openTasks: openCounts.get(user.id) || 0,
        lastAssignedAt: user.lastCrmAssignedAt,
        scheduledNow
      } as AssignmentCandidate;
    });
}

/** Read-only assignment context used by server-owned public lead sources. */
export async function prepareCrmPreSaleAssignment(db: Firestore, branchId: string) {
  const [candidates, policy] = await Promise.all([
    loadAssignmentCandidates(db, branchId, 'PRE_SALE'),
    loadCarePolicy(db)
  ]);
  return {
    candidates,
    responseSlaMinutes: Math.max(1, Math.min(1_440, Math.round(Number(policy.firstResponseMinutes || 15)))),
    policyId: String(policy.policyId || policy.id || 'CRM_SAFE_DEFAULT'),
    policyVersion: String(policy.version || '1')
  };
}

async function assertLeadAccess(actor: CrmActor, lead: any, ownership = true) {
  if (!lead?.branchId || !canAccessBranch(actor, lead.branchId)) throw new Error('CRM_LEAD_BRANCH_FORBIDDEN');
  if (!ownership || isManager(actor)) return;
  const ownerIds = [lead.assignedStaffId, lead.salesOwnerId, lead.customerCareOwnerId].filter(Boolean);
  if (!ownerIds.includes(actor.uid)) throw new Error('CRM_LEAD_OWNERSHIP_FORBIDDEN: Lead thuộc nhân viên khác.');
}

export async function processCreateCrmLead(db: Firestore | null, input: CrmCreateLeadInput, actor: CrmActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const operationKey = validateOperationKey(input.operationKey);
  const branchId = String(input.branchId || actor.branchId || '').trim();
  assertBranchAccess(actor, branchId);
  const name = String(input.name || '').trim();
  if (name.length < 2) throw new Error('CRM_LEAD_NAME_REQUIRED');
  const phoneNormalized = normalizeCrmPhone(input.phone);
  const budget = Math.max(0, Math.round(Number(input.budget || 0)));
  if (!Number.isFinite(budget)) throw new Error('CRM_LEAD_BUDGET_INVALID');
  const carePolicy = await loadCarePolicy(db);
  let candidates = await loadAssignmentCandidates(db, branchId, 'PRE_SALE');

  if (input.requestedAssigneeId) {
    if (!isManager(actor)) throw new Error('CRM_MANUAL_ASSIGN_FORBIDDEN');
    const targetSnapshot = await db.collection('users').doc(input.requestedAssigneeId).get();
    if (!targetSnapshot.exists || targetSnapshot.data()?.active !== true) throw new Error('CRM_ASSIGNEE_NOT_ACTIVE');
    const target = { id: targetSnapshot.id, ...targetSnapshot.data() } as any;
    if (!userBranches(target).has(branchId) || !isSalesIdentity(target)) throw new Error('CRM_ASSIGNEE_BRANCH_OR_ROLE_INVALID');
    candidates = [{ id: target.id, name: target.displayName || target.name || target.id, role: target.role, openTasks: 0, scheduledNow: true }];
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const requestedNextAction = String(input.nextActionType || 'CALL').toUpperCase();
  const leadNextActionType = requestedNextAction === 'ZALO' ? 'MESSAGE'
    : ['CALL', 'MESSAGE', 'APPOINTMENT', 'SEND_QUOTE', 'CHECK_STOCK', 'LONG_TERM_NURTURE'].includes(requestedNextAction)
      ? requestedNextAction
      : 'CALL';
  const operationRef = db.collection('crmOperations').doc(operationId('CREATE_LEAD', operationKey));
  const phoneRef = db.collection('crmPhoneRegistry').doc(phoneNormalized);
  const customerId = `CUST_${phoneNormalized}`;
  const customerRef = db.collection('crmCustomerProfiles').doc(customerId);
  const counterRef = db.collection('crmAssignmentCounters').doc(`${branchId}_PRE_SALE`);

  return db.runTransaction(async transaction => {
    const [operationSnapshot, phoneSnapshot, customerSnapshot, counterSnapshot] = await Promise.all([
      transaction.get(operationRef), transaction.get(phoneRef), transaction.get(customerRef), transaction.get(counterRef)
    ]);
    if (operationSnapshot.exists) return { ...operationSnapshot.data()?.result, idempotentReplay: true };
    const rotation = Number(counterSnapshot.data()?.rotation || 0);
    const selected = chooseCrmAssignee(candidates, rotation);
    const assignee = selected || {
      id: actor.uid, name: actor.name || actor.uid, role: actor.role, openTasks: 0, scheduledNow: true
    };
    const fallback = !selected;
    const leadRef = db.collection('leads').doc();
    const leadId = leadRef.id;
    const taskRef = db.collection('crmTasks').doc(`TASK_${leadId}_FIRST_RESPONSE`);
    const dueAt = new Date(now.getTime() + Math.max(1, Number(carePolicy.firstResponseMinutes || 15)) * 60_000).toISOString();
    const lead = cleanObject({
      id: leadId,
      customerId,
      branchId,
      name,
      phone: String(input.phone).trim(),
      phoneNormalized,
      zalo: String(input.zalo || '').trim() || undefined,
      source: String(input.source || 'Khác').trim(),
      interestedModel: String(input.interestedModel || '').trim(),
      budget,
      tradeInRequirose: input.tradeInRequired === true,
      tradeInModel: String(input.tradeInModel || '').trim() || undefined,
      status: 'new' as LeadStatus,
      careStatus: 'CARE_1_PENDING', careAttempts: 0, meaningfulCareCount: 0, careQualityScore: 0,
      assignedStaffId: assignee.id, assignedStaff: assignee.name,
      salesOwnerId: assignee.id, salesOwnerName: assignee.name,
      assignmentMode: input.requestedAssigneeId ? 'MANUAL' : fallback ? 'CREATOR_FALLBACK' : 'AUTO_SHIFT_LOAD',
      assignmentVersion: 1,
      currentTaskId: taskRef.id, firstResponseDueAt: dueAt, followUpDate: dueAt, nextActionAt: dueAt,
      nextAction: { type: leadNextActionType, dueAt, assignedTo: assignee.name },
      nextActionNotes: String(input.notes || '').trim() || 'Phản hồi lead mới',
      notes: String(input.notes || '').trim(),
      openTaskCount: 1, overdueTaskCount: 0,
      searchPrefixes: buildCrmSearchPrefixes(name, phoneNormalized, input.interestedModel),
      createdAt: nowIso, updatedAt: nowIso
    });
    const task: CRMTask = {
      id: taskRef.id, leadId, customerId, type: 'NEW_LEAD_SLA', scope: 'PRE_SALE', priority: 'P0',
      dueAt, assignedStaffId: assignee.id, assignedStaffName: assignee.name, branchId,
      title: `Phản hồi lead mới: ${name}`,
      description: String(input.interestedModel || '').trim() ? `Nhu cầu: ${String(input.interestedModel).trim()}` : undefined,
      sourceEntityType: 'LEAD', sourceEntityId: leadId, status: 'PENDING', createdAt: nowIso, updatedAt: nowIso
    };
    const duplicateCustomer = phoneSnapshot.exists || customerSnapshot.exists;
    const event = {
      id: eventIdFor(operationKey), customerId, leadId, type: 'LEAD_CREATED', entityId: leadId,
      staffId: actor.uid, staffName: actor.name || actor.uid, branchId,
      summary: duplicateCustomer ? 'Tạo cơ hội mua mới cho khách hàng đã có' : 'Tiếp nhận khách hàng tiềm năng mới',
      details: { source: lead.source, interestedModel: lead.interestedModel, assignedStaffId: assignee.id }, createdAt: nowIso
    };
    const result = { lead, task, duplicateCustomer, assignment: { staffId: assignee.id, staffName: assignee.name, mode: lead.assignmentMode } };

    transaction.set(leadRef, { ...lead, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.set(taskRef, { ...cleanObject(task), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.set(phoneRef, { phoneNormalized, customerId, lastLeadId: leadId, updatedAt: FieldValue.serverTimestamp(), createdAt: phoneSnapshot.data()?.createdAt || FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(customerRef, cleanObject({
      id: customerId, name, phone: String(input.phone).trim(), phoneNormalized, branchId,
      latestLeadId: leadId, opportunityCount: FieldValue.increment(1),
      createdAt: customerSnapshot.data()?.createdAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    }), { merge: true });
    transaction.set(db.collection('customerActivities').doc(event.id), { ...event, createdAt: FieldValue.serverTimestamp() });
    transaction.set(db.collection('leadAssignmentHistory').doc(`ASSIGN_${leadId}_1`), {
      id: `ASSIGN_${leadId}_1`, leadId, fromStaffId: '', fromStaffName: 'Hàng chờ', toStaffId: assignee.id,
      toStaffName: assignee.name, changedBy: actor.uid, changedByName: actor.name || actor.uid,
      branchId,
      reason: input.requestedAssigneeId ? 'MANUAL_REASSIGN' : 'AUTO_ASSIGN', notes: fallback ? 'Không tìm thấy nhân viên trong ca; giao người tạo' : '', changedAt: FieldValue.serverTimestamp()
    });
    transaction.set(counterRef, { rotation: rotation + 1, lastAssignedStaffId: assignee.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(db.collection('users').doc(assignee.id), { lastCrmAssignedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(operationRef, { kind: 'CREATE_LEAD', operationKey, result, createdAt: FieldValue.serverTimestamp() });
    return { ...result, idempotentReplay: false };
  });
}

export async function listCrmLeads(db: Firestore | null, input: CrmLeadListInput, actor: CrmActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const limit = Math.min(100, Math.max(10, Number(input.limit || 50)));
  const branchId = String(input.branchId || actor.branchId || '').trim();
  if (branchId && branchId !== 'ALL') assertBranchAccess(actor, branchId);
  if (branchId === 'ALL' && normalizedRole(actor.role) !== 'ADMIN') throw new Error('CRM_BRANCH_FORBIDDEN');
  let query: any = db.collection('leads');
  if (branchId && branchId !== 'ALL') query = query.where('branchId', '==', branchId);
  const role = normalizedRole(actor.role);
  const requestedOwner = String(input.ownerId || '').trim();
  if (!isManager(actor)) {
    query = query.where(isCustomerCareIdentity(actor) ? 'customerCareOwnerId' : 'assignedStaffId', '==', actor.uid);
  } else if (requestedOwner && requestedOwner !== 'ALL') {
    const ownerSnapshot = await db.collection('users').doc(requestedOwner).get();
    if (!ownerSnapshot.exists) throw new Error('CRM_ASSIGNEE_NOT_FOUND');
    const owner = { id: ownerSnapshot.id, ...ownerSnapshot.data() } as any;
    query = query.where(isCustomerCareIdentity(owner) ? 'customerCareOwnerId' : 'assignedStaffId', '==', requestedOwner);
  }
  if (input.status && input.status !== 'ALL') query = query.where('status', '==', input.status);
  if (input.source && input.source !== 'ALL') query = query.where('source', '==', input.source);
  const search = normalizeSearch(input.search);
  if (search.length >= 2) query = query.where('searchPrefixes', 'array-contains', search.slice(0, 24));
  query = query.orderBy(FieldPath.documentId());
  const cursorId = decodeCursor(input.cursor);
  if (cursorId) query = query.startAfter(cursorId);
  const snapshot = await query.limit(limit + 1).get();
  const docs = snapshot.docs.slice(0, limit);
  const items = docs.map((doc: any) => serializeCrmValue({ id: doc.id, ...doc.data() }) as Lead)
    .sort((left: Lead, right: Lead) => timestampMillis(right.updatedAt || right.createdAt) - timestampMillis(left.updatedAt || left.createdAt));
  return {
    items,
    nextCursor: snapshot.docs.length > limit && docs.length ? encodeCursor(docs[docs.length - 1].id) : null,
    hasMore: snapshot.docs.length > limit,
    summary: { loaded: items.length, scope: isManager(actor) ? 'TEAM' : role === 'CUSTOMER_CARE' || role === 'CSKH' ? 'CUSTOMER_CARE' : 'MY_LEADS' }
  };
}

function taskPriorityScore(task: any, now = Date.now()) {
  const due = timestampMillis(task.dueAt);
  const overdue = due > 0 && due < now;
  const priority = { P0: 400, P1: 300, P2: 200, P3: 100 }[String(task.priority) as 'P0'] || 0;
  return priority + (overdue ? 1000 + Math.min(500, Math.floor((now - due) / 60_000)) : 0) - Math.floor(Math.max(0, due - now) / 3_600_000);
}

export async function getCrmWorkQueue(db: Firestore | null, input: { branchId?: string; ownerId?: string; limit?: number }, actor: CrmActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const managerAll = isManager(actor) && (!input.ownerId || input.ownerId === 'ALL');
  const ownerId = isManager(actor) && input.ownerId && input.ownerId !== 'ALL' ? input.ownerId : actor.uid;
  const limit = Math.min(200, Math.max(20, Number(input.limit || 100)));
  const taskQuery = managerAll && input.branchId && input.branchId !== 'ALL'
    ? db.collection('crmTasks').where('branchId', '==', input.branchId)
    : db.collection('crmTasks').where('assignedStaffId', '==', ownerId);
  const snapshot = await taskQuery.limit(1000).get();
  const tasks = snapshot.docs
    .map(doc => serializeCrmValue({ id: doc.id, ...doc.data() }) as any)
    .filter(task => ACTIVE_TASK_STATUSES.has(String(task.status)))
    .filter(task => !input.branchId || input.branchId === 'ALL' || task.branchId === input.branchId)
    .filter(task => canAccessBranch(actor, task.branchId) || task.assignedStaffId === actor.uid);
  const leadIds = [...new Set(tasks.map(task => String(task.leadId || '')).filter(Boolean))];
  const leadSnapshots = leadIds.length ? await db.getAll(...leadIds.map(id => db.collection('leads').doc(id))) : [];
  const leadMap = new Map(leadSnapshots.filter(snapshot => snapshot.exists).map(snapshot => [snapshot.id, serializeCrmValue({ id: snapshot.id, ...snapshot.data() }) as Lead]));
  const byLead = new Map<string, any>();
  tasks.forEach(task => {
    const key = task.leadId || task.id;
    const existing = byLead.get(key);
    if (!existing || taskPriorityScore(task) > taskPriorityScore(existing)) byLead.set(key, task);
  });

  // Compatibility for old open leads that predate crmTasks.
  let leadQuery: any = managerAll && input.branchId && input.branchId !== 'ALL'
    ? db.collection('leads').where('branchId', '==', input.branchId).limit(500)
    : db.collection('leads').where(isCustomerCareIdentity(actor) ? 'customerCareOwnerId' : 'assignedStaffId', '==', ownerId).limit(250);
  const fallbackSnapshot = await leadQuery.get();
  fallbackSnapshot.docs.forEach((doc: any) => {
    const lead = serializeCrmValue({ id: doc.id, ...doc.data() }) as Lead;
    if (CLOSED_LEAD_STATUSES.has(lead.status) || byLead.has(lead.id)) return;
    if (!canAccessBranch(actor, String(lead.branchId || ''))) return;
    leadMap.set(lead.id, lead);
    byLead.set(lead.id, {
      id: `LEGACY_${lead.id}`, leadId: lead.id, customerId: lead.customerId,
      type: 'CARE_FOLLOW_UP', scope: 'PRE_SALE', priority: lead.priorityRank || 'P2',
      dueAt: lead.nextActionAt || lead.followUpDate || lead.createdAt, assignedStaffId: ownerId,
      assignedStaffName: lead.assignedStaff, branchId: lead.branchId, title: lead.nextActionNotes || 'Chăm sóc khách hàng',
      status: 'PENDING', legacyProjection: true, createdAt: lead.createdAt
    });
  });
  const now = Date.now();
  const items = [...byLead.values()]
    .sort((left, right) => taskPriorityScore(right, now) - taskPriorityScore(left, now))
    .slice(0, limit)
    .map(task => ({ task, lead: task.leadId ? leadMap.get(task.leadId) || null : null, overdue: timestampMillis(task.dueAt) < now }));
  return {
    items,
    summary: {
      total: items.length,
      overdue: items.filter(item => item.overdue).length,
      newLeads: items.filter(item => item.task.type === 'NEW_LEAD_SLA').length,
      appointments: items.filter(item => item.task.type === 'APPOINTMENT_REMINDER').length,
      postSale: items.filter(item => item.task.scope === 'POST_SALE').length
    }
  };
}

export async function listCrmCareActivities(
  db: Firestore | null,
  input: { branchId?: string; staffId?: string; verificationStatus?: string; limit?: number },
  actor: CrmActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const limit = Math.min(500, Math.max(20, Number(input.limit || 200)));
  const requestedBranch = String(input.branchId || actor.branchId || '').trim();
  if (requestedBranch && requestedBranch !== 'ALL') assertBranchAccess(actor, requestedBranch);
  if (requestedBranch === 'ALL' && normalizedRole(actor.role) !== 'ADMIN') throw new Error('CRM_BRANCH_FORBIDDEN');
  let query: any = db.collection('leadCareActivities');
  if (requestedBranch && requestedBranch !== 'ALL') query = query.where('branchId', '==', requestedBranch);
  else if (!isManager(actor)) query = query.where('staffId', '==', actor.uid);
  const snapshot = await query.limit(Math.min(1500, limit * 4)).get();
  const items = snapshot.docs
    .map((doc: any) => serializeCrmValue({ id: doc.id, ...doc.data() }))
    .filter((activity: any) => isManager(actor) || activity.staffId === actor.uid)
    .filter((activity: any) => !input.staffId || input.staffId === 'ALL' || activity.staffId === input.staffId)
    .filter((activity: any) => !input.verificationStatus || input.verificationStatus === 'ALL' || activity.verificationStatus === input.verificationStatus)
    .sort((left: any, right: any) => timestampMillis(right.createdAt) - timestampMillis(left.createdAt))
    .slice(0, limit);
  return { items, summary: { total: items.length, limited: snapshot.size >= Math.min(1500, limit * 4) } };
}

export async function processCrmCare(db: Firestore | null, input: CrmCareInput, actor: CrmActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const operationKey = validateOperationKey(input.operationKey);
  if (!input.leadId || !input.channel || !input.action || !input.outcome) throw new Error('CRM_CARE_REQUIRED_FIELDS');
  const carePolicy = await loadCarePolicy(db);
  const operationRef = db.collection('crmOperations').doc(operationId('CARE', operationKey));
  const leadRef = db.collection('leads').doc(input.leadId);
  const activityRef = db.collection('leadCareActivities').doc(activityIdFor(operationKey));
  const requestedTaskRef = input.taskId && !input.taskId.startsWith('LEGACY_') ? db.collection('crmTasks').doc(input.taskId) : null;
  const now = new Date();
  const nowIso = now.toISOString();

  return db.runTransaction(async transaction => {
    const [operationSnapshot, leadSnapshot, taskSnapshot] = await Promise.all([
      transaction.get(operationRef), transaction.get(leadRef), requestedTaskRef ? transaction.get(requestedTaskRef) : Promise.resolve(null)
    ]);
    if (operationSnapshot.exists) return { ...operationSnapshot.data()?.result, idempotentReplay: true };
    if (!leadSnapshot.exists) throw new Error('CRM_LEAD_NOT_FOUND');
    const lead = { id: leadSnapshot.id, ...leadSnapshot.data() } as Lead;
    await assertLeadAccess(actor, lead, true);
    const evidenceType = (input.evidenceType || 'SELF_REPORTED') as EvidenceType;
    const hasEvidence = evidenceType !== 'SELF_REPORTED' && Boolean(
      input.evidenceData?.screenshotUrl || input.evidenceData?.conversationId || input.evidenceData?.callDurationSeconds || evidenceType === 'STORE_VISIT_IN_PERSON'
    );
    if (carePolicy.requireEvidence === true && !hasEvidence) throw new Error('CRM_EVIDENCE_REQUIRED: Chính sách hiện tại yêu cầu bằng chứng chăm sóc.');
    const meaningful = ['CONNECTED', 'REPLIED', 'APPOINTMENT_CREATED', 'DEPOSIT_CREATED'].includes(input.outcome);
    const attemptNo = Number(lead.careAttempts || 0) + 1;
    const meaningfulCareNo = meaningful ? Number(lead.meaningfulCareCount || 0) + 1 : undefined;
    const verificationStatus: EvidenceVerificationStatus = hasEvidence ? 'PENDING_EVIDENCE' : 'SELF_REPORTED';
    const activityBase: any = cleanObject({
      id: activityRef.id, leadId: lead.id, customerId: lead.customerId || `CUST_${normalizeCrmPhone(lead.phone)}`,
      sequence: attemptNo, attemptNo, meaningfulCareNo, isMeaningfulContact: meaningful,
      staffId: actor.uid, staffName: actor.name || actor.uid, branchId: lead.branchId,
      channel: input.channel, action: input.action, outcome: input.outcome,
      customerResponseCode: input.customerResponseCode,
      customerResponseText: String(input.customerResponseText || '').trim() || undefined,
      objectionCategory: input.objectionCategory, objectionCode: input.objectionCode,
      priceDetails: input.priceDetails,
      opportunityContext: { productInterestSnapshot: lead.interestedModel, budgetSnapshot: lead.budget, leadStageSnapshot: lead.status },
      evidenceType, verificationStatus, evidenceData: input.evidenceData,
      nextActionType: input.nextActionType, nextActionAt: input.nextActionAt ? toIso(input.nextActionAt) : undefined,
      nextActionNotes: String(input.nextActionNotes || '').trim() || undefined,
      createdAt: nowIso
    });
    activityBase.qualityScoreBreakdown = calculateCareQualityBreakdown(activityBase);
    const temperature = calculateLeadTemperature(lead, activityBase);
    let careStatus: any = lead.careStatus || 'CARE_1_PENDING';
    if (meaningfulCareNo === 1) careStatus = 'CARE_1_DONE';
    else if (meaningfulCareNo === 2) careStatus = 'CARE_2_DONE';
    else if ((meaningfulCareNo || 0) >= 3) careStatus = 'CARE_3_DONE';
    if (input.nextActionType === 'LONG_TERM_NURTURE' || input.outcome === 'LOST_NOT_INTERESTED') careStatus = 'LONG_TERM_NURTURE';
    let nextStatus = lead.status;
    if (input.outcome === 'APPOINTMENT_CREATED' && canTransitionLeadState(lead.status, 'appointment_scheduled').allowed) nextStatus = 'appointment_scheduled';
    if (input.outcome === 'DEPOSIT_CREATED' && canTransitionLeadState(lead.status, 'deposit', { depositReference: operationKey }).allowed) nextStatus = 'deposit';
    if (input.customerResponseCode === 'READY_TO_BUY' && ['new', 'contacted'].includes(lead.status)) nextStatus = 'negotiating';
    const nextDueAt = input.nextActionAt ? toIso(input.nextActionAt) : undefined;
    const shouldCreateTask = Boolean(nextDueAt && input.nextActionType && input.nextActionType !== 'CLOSE_DEAL');
    const nextTaskRef = shouldCreateTask ? db.collection('crmTasks').doc(`TASK_${activityRef.id}_NEXT`) : null;
    const completingOpenTask = Boolean(requestedTaskRef && taskSnapshot?.exists && ACTIVE_TASK_STATUSES.has(String(taskSnapshot.data()?.status)));
    const remainingOpenTasks = Math.max(0, Number(lead.openTaskCount || 0) - (completingOpenTask ? 1 : 0) + (shouldCreateTask ? 1 : 0));
    const eventRef = db.collection('customerActivities').doc(eventIdFor(operationKey));
    const updatedLead = cleanObject({
      ...lead,
      status: nextStatus,
      careStatus,
      careAttempts: attemptNo,
      meaningfulCareCount: Number(lead.meaningfulCareCount || 0) + (meaningful ? 1 : 0),
      careQualityScore: activityBase.qualityScoreBreakdown.totalScore,
      leadTemperature: temperature.temperature,
      temperatureScore: temperature.score,
      lastCustomerResponse: activityBase.customerResponseText || input.customerResponseCode || input.outcome,
      lastCustomerResponseCode: input.customerResponseCode,
      lastEvidenceType: evidenceType,
      lastCareOutcome: input.outcome,
      lastCareAt: nowIso,
      lastContactedAt: nowIso,
      lastActivitySummary: `${input.channel} · ${input.outcome}${activityBase.customerResponseText ? ` · ${activityBase.customerResponseText}` : ''}`,
      nextActionAt: nextDueAt,
      followUpDate: nextDueAt || lead.followUpDate,
      nextActionNotes: activityBase.nextActionNotes,
      currentTaskId: nextTaskRef?.id || (remainingOpenTasks > 0 && !completingOpenTask ? lead.currentTaskId : undefined),
      openTaskCount: remainingOpenTasks,
      overdueTaskCount: 0,
      firstRespondedAt: lead.firstRespondedAt || nowIso,
      updatedAt: nowIso
    });
    const result = { activity: activityBase, lead: updatedLead, nextTask: null as any };

    transaction.set(activityRef, { ...activityBase, createdAt: FieldValue.serverTimestamp() });
    transaction.update(leadRef, {
      ...cleanObject(updatedLead),
      updatedAt: FieldValue.serverTimestamp()
    });
    if (requestedTaskRef && taskSnapshot?.exists) {
      const task = taskSnapshot.data();
      if (task?.assignedStaffId !== actor.uid && !isManager(actor)) throw new Error('CRM_TASK_OWNERSHIP_FORBIDDEN');
      transaction.update(requestedTaskRef, { status: 'COMPLETED', completedAt: FieldValue.serverTimestamp(), completedBy: actor.uid, outcome: input.outcome, updatedAt: FieldValue.serverTimestamp() });
    }
    if (nextTaskRef && nextDueAt) {
      const nextTask = cleanObject({
        id: nextTaskRef.id, leadId: lead.id, customerId: lead.customerId, type: input.nextActionType === 'APPOINTMENT' ? 'APPOINTMENT_REMINDER' : 'CARE_FOLLOW_UP',
        scope: isCustomerCareIdentity(actor) ? 'POST_SALE' : 'PRE_SALE', priority: input.nextActionType === 'APPOINTMENT' ? 'P1' : 'P2',
        dueAt: nextDueAt, assignedStaffId: actor.uid, assignedStaffName: actor.name || actor.uid, branchId: lead.branchId,
        title: activityBase.nextActionNotes || `Chăm sóc tiếp: ${lead.name}`, sourceEntityType: 'CARE_ACTIVITY', sourceEntityId: activityRef.id,
        status: 'PENDING', createdAt: nowIso, updatedAt: nowIso
      });
      result.nextTask = nextTask;
      transaction.set(nextTaskRef, { ...nextTask, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
    transaction.set(eventRef, {
      id: eventRef.id, customerId: lead.customerId || `CUST_${normalizeCrmPhone(lead.phone)}`, leadId: lead.id,
      type: 'CARE', entityId: activityRef.id, staffId: actor.uid, staffName: actor.name || actor.uid, branchId: lead.branchId,
      summary: updatedLead.lastActivitySummary, details: { outcome: input.outcome, nextActionAt: nextDueAt }, createdAt: FieldValue.serverTimestamp()
    });
    transaction.set(operationRef, { kind: 'CARE', operationKey, result, createdAt: FieldValue.serverTimestamp() });
    return { ...result, idempotentReplay: false };
  });
}

export async function processAssignCrmLead(db: Firestore | null, input: { leadId: string; toStaffId: string; reason?: string; notes?: string; operationKey: string }, actor: CrmActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isManager(actor)) throw new Error('CRM_ASSIGN_FORBIDDEN: Chỉ quản lý được điều phối Lead.');
  const operationKey = validateOperationKey(input.operationKey);
  const leadRef = db.collection('leads').doc(input.leadId);
  const targetRef = db.collection('users').doc(input.toStaffId);
  const operationRef = db.collection('crmOperations').doc(operationId('ASSIGN', operationKey));
  return db.runTransaction(async transaction => {
    const [operationSnapshot, leadSnapshot, targetSnapshot] = await Promise.all([
      transaction.get(operationRef), transaction.get(leadRef), transaction.get(targetRef)
    ]);
    if (operationSnapshot.exists) return { ...operationSnapshot.data()?.result, idempotentReplay: true };
    if (!leadSnapshot.exists) throw new Error('CRM_LEAD_NOT_FOUND');
    if (!targetSnapshot.exists || targetSnapshot.data()?.active !== true) throw new Error('CRM_ASSIGNEE_NOT_ACTIVE');
    const lead = { id: leadSnapshot.id, ...leadSnapshot.data() } as Lead;
    await assertLeadAccess(actor, lead, false);
    const target = { id: targetSnapshot.id, ...targetSnapshot.data() } as any;
    if (!userBranches(target).has(lead.branchId) || (!isSalesIdentity(target) && !isCustomerCareIdentity(target))) throw new Error('CRM_ASSIGNEE_BRANCH_OR_ROLE_INVALID');
    const targetName = target.displayName || target.name || target.email || target.id;
    const isCare = isCustomerCareIdentity(target);
    const currentTaskRef = lead.currentTaskId ? db.collection('crmTasks').doc(lead.currentTaskId) : null;
    const currentTaskSnapshot = currentTaskRef ? await transaction.get(currentTaskRef) : null;
    const nowIso = new Date().toISOString();
    const update: any = isCare
      ? { customerCareOwnerId: target.id, customerCareOwnerName: targetName }
      : { assignedStaffId: target.id, assignedStaff: targetName, salesOwnerId: target.id, salesOwnerName: targetName };
    const result = { lead: { ...lead, ...update, assignmentMode: 'MANUAL', assignmentVersion: Number(lead.assignmentVersion || 0) + 1, updatedAt: nowIso } };
    transaction.update(leadRef, { ...update, assignmentMode: 'MANUAL', assignmentVersion: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    if (currentTaskRef && currentTaskSnapshot?.exists) transaction.update(currentTaskRef, { assignedStaffId: target.id, assignedStaffName: targetName, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(db.collection('leadAssignmentHistory').doc(), cleanObject({
      leadId: lead.id, fromStaffId: isCare ? lead.customerCareOwnerId || '' : lead.assignedStaffId || '',
      fromStaffName: isCare ? lead.customerCareOwnerName || '' : lead.assignedStaff || '', toStaffId: target.id, toStaffName: targetName,
      branchId: lead.branchId,
      changedBy: actor.uid, changedByName: actor.name || actor.uid, reason: input.reason || 'MANAGER_REASSIGN', notes: String(input.notes || '').trim() || undefined,
      changedAt: FieldValue.serverTimestamp()
    }));
    transaction.set(operationRef, { kind: 'ASSIGN', operationKey, result, createdAt: FieldValue.serverTimestamp() });
    return { ...result, idempotentReplay: false };
  });
}

export async function processCreateCrmAppointment(db: Firestore | null, input: Partial<LeadAppointment> & { operationKey: string }, actor: CrmActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const operationKey = validateOperationKey(input.operationKey);
  const leadRef = db.collection('leads').doc(String(input.leadId || ''));
  const operationRef = db.collection('crmOperations').doc(operationId('APPOINTMENT', operationKey));
  return db.runTransaction(async transaction => {
    const [operationSnapshot, leadSnapshot] = await Promise.all([transaction.get(operationRef), transaction.get(leadRef)]);
    if (operationSnapshot.exists) return { ...operationSnapshot.data()?.result, idempotentReplay: true };
    if (!leadSnapshot.exists) throw new Error('CRM_LEAD_NOT_FOUND');
    const lead = { id: leadSnapshot.id, ...leadSnapshot.data() } as Lead;
    await assertLeadAccess(actor, lead, true);
    const branchId = String(input.branchId || lead.branchId || '');
    assertBranchAccess(actor, branchId);
    const scheduledAt = toIso(input.scheduledAt);
    const nowIso = new Date().toISOString();
    const ref = db.collection('leadAppointments').doc();
    const taskRef = db.collection('crmTasks').doc(`TASK_${ref.id}_REMINDER`);
    const appointment: LeadAppointment = cleanObject({
      id: ref.id, leadId: lead.id, customerId: lead.customerId, customerName: lead.name, customerPhone: lead.phone,
      branchId, branchName: input.branchName, assignedStaffId: actor.uid, assignedStaffName: actor.name || actor.uid,
      scheduledAt, interestedModel: input.interestedModel || lead.interestedModel, reservationDeviceId: input.reservationDeviceId,
      notes: String(input.notes || '').trim() || undefined, status: 'SCHEDULED', createdAt: nowIso
    });
    const result = { appointment, lead: { ...lead, status: 'appointment_scheduled', nextActionAt: scheduledAt, currentTaskId: taskRef.id } };
    transaction.set(ref, { ...appointment, createdAt: FieldValue.serverTimestamp() });
    transaction.update(leadRef, { status: 'appointment_scheduled', nextActionAt: scheduledAt, followUpDate: scheduledAt, nextActionNotes: 'Lịch hẹn tại cửa hàng', currentTaskId: taskRef.id, openTaskCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    transaction.set(taskRef, {
      id: taskRef.id, leadId: lead.id, customerId: lead.customerId, type: 'APPOINTMENT_REMINDER', scope: 'PRE_SALE', priority: 'P1',
      dueAt: scheduledAt, assignedStaffId: actor.uid, assignedStaffName: actor.name || actor.uid, branchId,
      title: `Đón lịch hẹn: ${lead.name}`, sourceEntityType: 'APPOINTMENT', sourceEntityId: ref.id,
      status: 'PENDING', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    transaction.set(db.collection('customerActivities').doc(eventIdFor(operationKey)), {
      id: eventIdFor(operationKey), customerId: lead.customerId || `CUST_${normalizeCrmPhone(lead.phone)}`, leadId: lead.id, type: 'APPOINTMENT', entityId: ref.id,
      staffId: actor.uid, staffName: actor.name || actor.uid, branchId, summary: `Đặt lịch hẹn ${scheduledAt}`, createdAt: FieldValue.serverTimestamp()
    });
    transaction.set(operationRef, { kind: 'APPOINTMENT', operationKey, result, createdAt: FieldValue.serverTimestamp() });
    return { ...result, idempotentReplay: false };
  });
}

export async function processUpdateCrmAppointment(db: Firestore | null, appointmentId: string, input: { status: LeadAppointment['status']; operationKey: string }, actor: CrmActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const operationKey = validateOperationKey(input.operationKey);
  const appointmentRef = db.collection('leadAppointments').doc(appointmentId);
  const operationRef = db.collection('crmOperations').doc(operationId('APPOINTMENT_UPDATE', operationKey));
  const reminderTaskRef = db.collection('crmTasks').doc(`TASK_${appointmentId}_REMINDER`);
  return db.runTransaction(async transaction => {
    const [operationSnapshot, appointmentSnapshot, reminderTaskSnapshot] = await Promise.all([
      transaction.get(operationRef), transaction.get(appointmentRef), transaction.get(reminderTaskRef)
    ]);
    if (operationSnapshot.exists) return { ...operationSnapshot.data()?.result, idempotentReplay: true };
    if (!appointmentSnapshot.exists) throw new Error('CRM_APPOINTMENT_NOT_FOUND');
    const appointment = { id: appointmentSnapshot.id, ...appointmentSnapshot.data() } as LeadAppointment;
    if (!canAccessBranch(actor, appointment.branchId) || (!isManager(actor) && ![appointment.assignedStaffId, (appointment as any).staffId].includes(actor.uid))) throw new Error('CRM_APPOINTMENT_FORBIDDEN');
    const allowed = new Set(['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'NO_SHOW', 'CANCELLED', 'COMPLETED']);
    if (!allowed.has(input.status)) throw new Error('CRM_APPOINTMENT_STATUS_INVALID');
    const nowIso = new Date().toISOString();
    const closesReminder = reminderTaskSnapshot.exists && ACTIVE_TASK_STATUSES.has(String(reminderTaskSnapshot.data()?.status))
      && ['ARRIVED', 'NO_SHOW', 'CANCELLED', 'COMPLETED'].includes(input.status);
    const result = { appointment: { ...appointment, status: input.status, arrivedAt: input.status === 'ARRIVED' ? nowIso : appointment.arrivedAt } };
    transaction.update(appointmentRef, cleanObject({ status: input.status, arrivedAt: result.appointment.arrivedAt, updatedAt: FieldValue.serverTimestamp() }));
    if (closesReminder) {
      transaction.update(reminderTaskRef, {
        status: input.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED', completedAt: FieldValue.serverTimestamp(),
        completedBy: actor.uid, outcome: input.status, updatedAt: FieldValue.serverTimestamp()
      });
    }
    if (input.status === 'NO_SHOW') {
      const taskRef = db.collection('crmTasks').doc(`TASK_${appointment.id}_NO_SHOW`);
      transaction.set(taskRef, {
        id: taskRef.id, leadId: appointment.leadId, customerId: appointment.customerId, type: 'NO_SHOW_RECOVERY', scope: 'PRE_SALE', priority: 'P1',
        dueAt: new Date(Date.now() + 15 * 60_000).toISOString(), assignedStaffId: appointment.assignedStaffId || actor.uid,
        assignedStaffName: appointment.assignedStaffName || actor.name || actor.uid, branchId: appointment.branchId,
        title: `Gọi lại khách lỡ hẹn: ${appointment.customerName}`, sourceEntityType: 'APPOINTMENT', sourceEntityId: appointment.id,
        status: 'PENDING', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      });
    }
    const taskDelta = (input.status === 'NO_SHOW' ? 1 : 0) - (closesReminder ? 1 : 0);
    if (taskDelta || input.status === 'NO_SHOW') {
      transaction.update(db.collection('leads').doc(appointment.leadId), cleanObject({
        openTaskCount: taskDelta ? FieldValue.increment(taskDelta) : undefined,
        currentTaskId: input.status === 'NO_SHOW' ? `TASK_${appointment.id}_NO_SHOW` : undefined,
        updatedAt: FieldValue.serverTimestamp()
      }));
    }
    transaction.set(operationRef, { kind: 'APPOINTMENT_UPDATE', operationKey, result, createdAt: FieldValue.serverTimestamp() });
    return { ...result, idempotentReplay: false };
  });
}

export async function processCreateCrmQuote(db: Firestore | null, input: Partial<LeadQuote> & { operationKey: string }, actor: CrmActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const operationKey = validateOperationKey(input.operationKey);
  const leadRef = db.collection('leads').doc(String(input.leadId || ''));
  const operationRef = db.collection('crmOperations').doc(operationId('QUOTE', operationKey));
  const deviceRef = input.reservedDeviceId ? db.collection('devices').doc(input.reservedDeviceId) : null;
  return db.runTransaction(async transaction => {
    const [operationSnapshot, leadSnapshot, deviceSnapshot] = await Promise.all([
      transaction.get(operationRef), transaction.get(leadRef), deviceRef ? transaction.get(deviceRef) : Promise.resolve(null)
    ]);
    if (operationSnapshot.exists) return { ...operationSnapshot.data()?.result, idempotentReplay: true };
    if (!leadSnapshot.exists) throw new Error('CRM_LEAD_NOT_FOUND');
    const lead = { id: leadSnapshot.id, ...leadSnapshot.data() } as Lead;
    await assertLeadAccess(actor, lead, true);
    const unitPrice = Math.round(Number(input.unitPrice || 0));
    const accessoriesPrice = Math.max(0, Math.round(Number(input.accessoriesPrice || 0)));
    const tradeInSubsidy = Math.max(0, Math.round(Number(input.tradeInSubsidy || 0)));
    const discountAmount = Math.max(0, Math.round(Number(input.discountAmount || 0)));
    const finalPrice = unitPrice + accessoriesPrice - tradeInSubsidy - discountAmount;
    if (!Number.isFinite(finalPrice) || unitPrice <= 0 || finalPrice < 0) throw new Error('CRM_QUOTE_PRICE_INVALID');
    if (deviceSnapshot) {
      if (!deviceSnapshot.exists) throw new Error('DEVICE_NOT_FOUND');
      const device = deviceSnapshot.data();
      if (device?.status !== 'in_stock') throw new Error('DEVICE_ALREADY_RESERVED');
      if (device?.branchId && device.branchId !== lead.branchId) throw new Error('DEVICE_BRANCH_FORBIDDEN');
    }
    const nowIso = new Date().toISOString();
    const reservedUntil = deviceRef ? new Date(Date.now() + 30 * 60_000).toISOString() : undefined;
    const quoteRef = db.collection('leadQuotes').doc();
    const quote: LeadQuote = cleanObject({
      id: quoteRef.id, quoteCode: `QT-${nowIso.slice(2, 10).replace(/-/g, '')}-${quoteRef.id.slice(-5).toUpperCase()}`,
      leadId: lead.id, customerId: lead.customerId, customerName: lead.name, customerPhone: lead.phone,
      staffId: actor.uid, staffName: actor.name || actor.uid, branchId: lead.branchId,
      model: String(input.model || lead.interestedModel).trim(), unitPrice, accessoriesPrice, tradeInSubsidy, discountAmount, finalPrice,
      warrantyPackage: String(input.warrantyPackage || '').trim() || undefined,
      validUntil: toIso(input.validUntil, new Date(Date.now() + 3 * 86_400_000)), status: input.status === 'DRAFT' ? 'DRAFT' : 'SENT',
      reservedDeviceId: deviceRef?.id, reservedUntil, notes: String(input.notes || '').trim() || undefined, createdAt: nowIso
    });
    const result = { quote, lead: { ...lead, status: ['new', 'contacted'].includes(lead.status) ? 'negotiating' : lead.status } };
    const expiryTaskRef = db.collection('crmTasks').doc(`TASK_${quoteRef.id}_EXPIRY`);
    transaction.set(quoteRef, { ...quote, createdAt: FieldValue.serverTimestamp() });
    if (deviceRef) transaction.update(deviceRef, { status: 'reserved', reservedForLeadId: lead.id, reservedByStaffId: actor.uid, reservedUntil, updatedAt: FieldValue.serverTimestamp() });
    transaction.update(leadRef, { status: result.lead.status, openTaskCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    transaction.set(expiryTaskRef, {
      id: expiryTaskRef.id, leadId: lead.id, customerId: lead.customerId, type: 'QUOTE_EXPIRY', scope: 'PRE_SALE', priority: 'P2',
      dueAt: quote.validUntil, assignedStaffId: actor.uid, assignedStaffName: actor.name || actor.uid, branchId: lead.branchId,
      title: `Theo dõi báo giá: ${lead.name}`, description: `Báo giá ${quote.quoteCode} sắp hết hiệu lực.`,
      sourceEntityType: 'QUOTE', sourceEntityId: quoteRef.id, status: 'PENDING',
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    transaction.set(db.collection('customerActivities').doc(eventIdFor(operationKey)), {
      id: eventIdFor(operationKey), customerId: lead.customerId || `CUST_${normalizeCrmPhone(lead.phone)}`, leadId: lead.id, type: 'QUOTE', entityId: quoteRef.id,
      staffId: actor.uid, staffName: actor.name || actor.uid, branchId: lead.branchId, summary: `Gửi báo giá ${quote.quoteCode}: ${finalPrice.toLocaleString('vi-VN')}đ`, createdAt: FieldValue.serverTimestamp()
    });
    transaction.set(operationRef, { kind: 'QUOTE', operationKey, result, createdAt: FieldValue.serverTimestamp() });
    return { ...result, idempotentReplay: false };
  });
}

export async function getCrmCustomer360(db: Firestore | null, leadId: string, actor: CrmActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const leadSnapshot = await db.collection('leads').doc(leadId).get();
  if (!leadSnapshot.exists) throw new Error('CRM_LEAD_NOT_FOUND');
  const lead = serializeCrmValue({ id: leadSnapshot.id, ...leadSnapshot.data() }) as Lead;
  await assertLeadAccess(actor, lead, false);
  const customerId = lead.customerId || `CUST_${normalizeCrmPhone(lead.phone)}`;
  const [profile, activities, appointments, quotes, invoices, warrantyTickets, tasks, timeline] = await Promise.all([
    db.collection('crmCustomerProfiles').doc(customerId).get(),
    db.collection('leadCareActivities').where('leadId', '==', leadId).limit(200).get(),
    db.collection('leadAppointments').where('leadId', '==', leadId).limit(100).get(),
    db.collection('leadQuotes').where('leadId', '==', leadId).limit(100).get(),
    db.collection('invoices').where('leadId', '==', leadId).limit(100).get(),
    db.collection('warrantyTickets').where('customerPhone', '==', lead.phone).limit(100).get(),
    db.collection('crmTasks').where('leadId', '==', leadId).limit(200).get(),
    db.collection('customerActivities').where('customerId', '==', customerId).limit(300).get()
  ]);
  const rows = (snapshot: any) => snapshot.docs.map((doc: any) => serializeCrmValue({ id: doc.id, ...doc.data() }));
  return {
    lead,
    customer: profile.exists ? { id: profile.id, ...profile.data() } : { id: customerId, name: lead.name, phone: lead.phone },
    activities: rows(activities).sort((a: any, b: any) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt)),
    appointments: rows(appointments), quotes: rows(quotes), invoices: rows(invoices), warrantyTickets: rows(warrantyTickets), tasks: rows(tasks),
    timeline: rows(timeline).sort((a: any, b: any) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt))
  };
}

export async function getCrmDashboard(db: Firestore | null, input: { branchId?: string; dateFrom?: string; dateTo?: string }, actor: CrmActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const branchId = String(input.branchId || actor.branchId || '').trim();
  if (branchId && branchId !== 'ALL') assertBranchAccess(actor, branchId);
  if (branchId === 'ALL' && normalizedRole(actor.role) !== 'ADMIN') throw new Error('CRM_BRANCH_FORBIDDEN');
  const from = input.dateFrom ? new Date(`${input.dateFrom}T00:00:00+07:00`).getTime() : Date.now() - 30 * 86_400_000;
  const to = input.dateTo ? new Date(`${input.dateTo}T23:59:59+07:00`).getTime() : Date.now();
  const scoped = (collection: string) => branchId && branchId !== 'ALL' ? db.collection(collection).where('branchId', '==', branchId) : db.collection(collection);
  const [leadSnapshot, activitySnapshot, invoiceSnapshot, taskSnapshot] = await Promise.all([
    scoped('leads').limit(5000).get(), scoped('leadCareActivities').limit(10000).get(), scoped('invoices').limit(5000).get(), scoped('crmTasks').limit(10000).get()
  ]);
  const inRange = (data: any) => {
    const time = timestampMillis(data.createdAt || data.updatedAt);
    return time >= from && time <= to;
  };
  const leads = leadSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead)).filter(inRange);
  const activities = activitySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)).filter(inRange);
  const invoices = invoiceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)).filter(inRange);
  const tasks = taskSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)).filter(inRange);
  const won = leads.filter(lead => lead.status === 'won');
  const lost = leads.filter(lead => lead.status === 'lost');
  const revenue = invoices.filter(invoice => invoice.status === 'completed' && invoice.leadId).reduce((sum, invoice) => sum + Number(invoice.finalAmount || invoice.totalAmount || 0), 0);
  const firstResponseMinutes = activities.reduce((rows: number[], activity: any) => {
    const lead = leads.find(item => item.id === activity.leadId);
    if (!lead) return rows;
    const minutes = (timestampMillis(activity.createdAt) - timestampMillis(lead.createdAt)) / 60_000;
    if (Number.isFinite(minutes) && minutes >= 0) rows.push(minutes);
    return rows;
  }, [] as number[]);
  const lostReasons = new Map<string, number>();
  lost.forEach(lead => lostReasons.set(lead.lostReason || 'Chưa xác định', (lostReasons.get(lead.lostReason || 'Chưa xác định') || 0) + 1));
  const now = Date.now();
  return {
    kpis: {
      leads: leads.length, won: won.length, lost: lost.length,
      conversionRate: leads.length ? Math.round(won.length / leads.length * 1000) / 10 : 0,
      revenue,
      overdueTasks: tasks.filter(task => ACTIVE_TASK_STATUSES.has(String(task.status)) && timestampMillis(task.dueAt) < now).length,
      appointments: tasks.filter(task => task.type === 'APPOINTMENT_REMINDER').length,
      postSaleCompleted: tasks.filter(task => task.scope === 'POST_SALE' && task.status === 'COMPLETED').length,
      averageFirstResponseMinutes: firstResponseMinutes.length ? Math.round(firstResponseMinutes.reduce((sum, value) => sum + value, 0) / firstResponseMinutes.length) : 0
    },
    funnel: {
      new: leads.filter(lead => lead.status === 'new').length,
      contacted: leads.filter(lead => lead.status === 'contacted').length,
      consulting: leads.filter(lead => ['consulting', 'negotiating'].includes(lead.status)).length,
      appointment: leads.filter(lead => lead.status === 'appointment_scheduled').length,
      deposit: leads.filter(lead => ['deposit', 'deposit_paid'].includes(lead.status)).length,
      won: won.length,
      lost: lost.length
    },
    lostReasons: [...lostReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    quality: {
      activities: activities.length,
      meaningful: activities.filter(activity => activity.isMeaningfulContact).length,
      verified: activities.filter(activity => ['MANAGER_VERIFIED', 'SYSTEM_CAPTURED'].includes(activity.verificationStatus)).length
    },
    generatedAt: new Date().toISOString()
  };
}

export async function getCrmDispatchBoard(db: Firestore | null, branchId: string, actor: CrmActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isManager(actor)) throw new Error('CRM_DISPATCH_FORBIDDEN');
  assertBranchAccess(actor, branchId);
  const [usersSnapshot, tasksSnapshot, schedulesSnapshot] = await Promise.all([
    db.collection('users').where('active', '==', true).limit(500).get(),
    db.collection('crmTasks').where('branchId', '==', branchId).limit(3000).get(),
    db.collection('weeklyShiftSchedules').where('weekStart', '==', vietnamClock().weekStart).limit(500).get()
  ]);
  const clock = vietnamClock();
  const schedules = new Map(schedulesSnapshot.docs.map(doc => [String(doc.data().staffId), doc.data()]));
  const tasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
  const staff = usersSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as any))
    .filter(user => userBranches(user).has(branchId) && (isSalesIdentity(user) || isCustomerCareIdentity(user)))
    .map(user => {
      const assigned = tasks.filter(task => task.assignedStaffId === user.id && ACTIVE_TASK_STATUSES.has(String(task.status)));
      const schedule = schedules.get(user.id);
      const day = schedule?.days?.[clock.date];
      return {
        id: user.id, name: user.displayName || user.name || user.id, role: user.role,
        department: isCustomerCareIdentity(user) ? 'CUSTOMER_CARE' : 'SALES',
        inShift: Boolean(day && day.shiftId !== 'OFF' && day.isOff !== true),
        shiftName: day?.shiftName || 'Chưa xếp ca', openTasks: assigned.length,
        overdueTasks: assigned.filter(task => timestampMillis(task.dueAt) < Date.now()).length,
        p0Tasks: assigned.filter(task => task.priority === 'P0').length
      };
    })
    .sort((left, right) => right.overdueTasks - left.overdueTasks || right.openTasks - left.openTasks);
  return { staff, summary: { staff: staff.length, openTasks: staff.reduce((sum, item) => sum + item.openTasks, 0), overdueTasks: staff.reduce((sum, item) => sum + item.overdueTasks, 0) } };
}
