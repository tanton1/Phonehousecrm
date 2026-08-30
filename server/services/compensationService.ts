import type { Firestore } from 'firebase-admin/firestore';
import { parseVnd } from '../utils/financeIntegrity';
import { assertPayrollPeriodsOpen } from './payrollPeriodLockService';

export interface CompensationActor {
  uid: string;
  role: string;
  branchId?: string;
  assignedBranchIds?: string[];
  name?: string;
}

export interface EmploymentCompensation {
  id: string;
  staffUid: string;
  staffName: string;
  branchId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  baseSalary: number;
  allowance: number;
  version: number;
  status: 'ACTIVE' | 'SUPERSEDED';
  createdAt: string;
  createdByUid: string;
  updatedAt: string;
  updatedByUid: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COMPENSATION_ROLES = new Set(['ADMIN', 'ACCOUNTANT']);

function safeIdPart(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, '_');
}

function assertCompensationAccess(actor: CompensationActor) {
  if (!COMPENSATION_ROLES.has(String(actor.role || '').toUpperCase())) {
    throw new Error('COMPENSATION_FORBIDDEN: Chỉ quản trị viên hoặc kế toán được cấu hình lương.');
  }
}

function canAccessBranch(actor: CompensationActor, branchId: string) {
  const role = String(actor.role || '').toUpperCase();
  return role === 'ADMIN'
    || role === 'ACCOUNTANT'
    || actor.branchId === branchId
    || (actor.assignedBranchIds || []).includes(branchId);
}

export function resolveCompensationForPeriod(
  entries: Array<Record<string, any>>,
  staffUid: string,
  period: string
): Record<string, any> | null {
  const periodStart = `${period}-01`;
  const [year, month] = period.split('-').map(Number);
  const periodEnd = `${period}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
  return entries
    .filter((entry) => String(entry.staffUid || '') === staffUid)
    .filter((entry) => entry.status !== 'SUPERSEDED')
    .filter((entry) => String(entry.effectiveFrom || '') <= periodEnd)
    .filter((entry) => !entry.effectiveTo || String(entry.effectiveTo) >= periodStart)
    .sort((left, right) => String(right.effectiveFrom || '').localeCompare(String(left.effectiveFrom || '')))[0] || null;
}

export async function listEmploymentCompensations(
  db: Firestore | null,
  actor: CompensationActor,
  input: { staffUid?: string; branchId?: string }
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  assertCompensationAccess(actor);
  const branchId = String(input.branchId || '').trim();
  if (branchId && branchId !== 'ALL' && !canAccessBranch(actor, branchId)) throw new Error('COMPENSATION_BRANCH_FORBIDDEN');
  let query: FirebaseFirestore.Query = db.collection('employmentCompensations');
  if (input.staffUid) query = query.where('staffUid', '==', String(input.staffUid));
  else if (branchId && branchId !== 'ALL') query = query.where('branchId', '==', branchId);
  const snapshot = await query.limit(1001).get();
  if (snapshot.size > 1000) throw new Error('COMPENSATION_RESULT_LIMIT: Có quá nhiều cấu hình lương, cần lọc theo nhân viên hoặc chi nhánh.');
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((left: any, right: any) => String(right.effectiveFrom || '').localeCompare(String(left.effectiveFrom || '')));
}

export async function saveEmploymentCompensation(
  db: Firestore | null,
  actor: CompensationActor,
  staffUidRaw: string,
  input: Record<string, unknown>
): Promise<EmploymentCompensation> {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  assertCompensationAccess(actor);
  const staffUid = String(staffUidRaw || '').trim();
  const effectiveFrom = String(input.effectiveFrom || '').trim();
  const effectiveTo = String(input.effectiveTo || '').trim() || null;
  if (!staffUid) throw new Error('COMPENSATION_STAFF_REQUIRED');
  if (!DATE_RE.test(effectiveFrom) || (effectiveTo && (!DATE_RE.test(effectiveTo) || effectiveTo < effectiveFrom))) {
    throw new Error('COMPENSATION_EFFECTIVE_DATE_INVALID');
  }
  const baseSalary = parseVnd(input.baseSalary, { allowZero: true, field: 'BASE_SALARY' });
  const allowance = parseVnd(input.allowance ?? 0, { allowZero: true, field: 'ALLOWANCE' });
  const staffRef = db.collection('users').doc(staffUid);
  const compensationId = `COMP_${safeIdPart(staffUid)}_${effectiveFrom.replace(/-/g, '')}`;
  const compensationRef = db.collection('employmentCompensations').doc(compensationId);
  const auditRef = db.collection('compensationAuditLogs').doc();
  let result!: EmploymentCompensation;

  await db.runTransaction(async (transaction) => {
    const [staffSnapshot, existingSnapshot] = await Promise.all([
      transaction.get(staffRef),
      transaction.get(compensationRef)
    ]);
    if (!staffSnapshot.exists || staffSnapshot.data()?.active === false) throw new Error('COMPENSATION_STAFF_NOT_FOUND');
    const staff = staffSnapshot.data()!;
    const branchId = String(staff.branchId || '').trim();
    if (!branchId || !canAccessBranch(actor, branchId)) throw new Error('COMPENSATION_BRANCH_FORBIDDEN');
    await assertPayrollPeriodsOpen(transaction, db, branchId, [effectiveFrom.slice(0, 7)]);
    const now = new Date().toISOString();
    const existing = existingSnapshot.exists ? existingSnapshot.data()! : null;
    result = {
      id: compensationId,
      staffUid,
      staffName: String(staff.displayName || staff.name || staffUid),
      branchId,
      effectiveFrom,
      effectiveTo,
      baseSalary,
      allowance,
      version: Number(existing?.version || 0) + 1,
      status: 'ACTIVE',
      createdAt: String(existing?.createdAt || now),
      createdByUid: String(existing?.createdByUid || actor.uid),
      updatedAt: now,
      updatedByUid: actor.uid
    };
    transaction.set(compensationRef, result, { merge: false });
    transaction.set(auditRef, {
      id: auditRef.id,
      compensationId,
      staffUid,
      branchId,
      action: existing ? 'UPDATED' : 'CREATED',
      previous: existing,
      next: result,
      actorUid: actor.uid,
      actorName: actor.name || actor.uid,
      occurredAt: now
    });
  });
  return result;
}
