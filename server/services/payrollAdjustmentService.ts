import type { Firestore } from 'firebase-admin/firestore';
import { parseVnd } from '../utils/financeIntegrity';
import { assertPayrollPeriodsOpen } from './payrollPeriodLockService';
import type { PayrollActor } from './payrollService';
import { assertValidPayrollHomeBranch } from './payrollStaffIdentity';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const TYPES = new Set(['EARNING', 'DEDUCTION']);
const CATEGORIES = new Set(['OVERTIME', 'ATTENDANCE_BONUS', 'ADVANCE', 'PENALTY', 'MANUAL']);
const MAKER_ROLES = new Set(['ADMIN', 'MANAGER', 'STORE_MANAGER', 'ACCOUNTANT']);
const CHECKER_ROLES = new Set(['ADMIN', 'ACCOUNTANT']);

function actorCanAccessBranch(actor: PayrollActor, branchId: string) {
  const role = String(actor.role || '').toUpperCase();
  return role === 'ADMIN' || role === 'ACCOUNTANT' || actor.branchId === branchId || (actor.assignedBranchIds || []).includes(branchId);
}

function assertMaker(actor: PayrollActor) {
  if (!MAKER_ROLES.has(String(actor.role || '').toUpperCase())) throw new Error('PAYROLL_ADJUSTMENT_FORBIDDEN');
}

export async function listPayrollAdjustments(
  db: Firestore | null,
  actor: PayrollActor,
  input: { period: string; branchId: string; staffUid?: string }
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  assertMaker(actor);
  if (!PERIOD_RE.test(input.period)) throw new Error('PAYROLL_PERIOD_INVALID');
  if (!input.branchId || input.branchId === 'ALL' || !actorCanAccessBranch(actor, input.branchId)) throw new Error('PAYROLL_ADJUSTMENT_BRANCH_FORBIDDEN');
  let query: FirebaseFirestore.Query = db.collection('payrollAdjustments')
    .where('period', '==', input.period)
    .where('branchId', '==', input.branchId);
  if (input.staffUid) query = query.where('staffUid', '==', input.staffUid);
  const snapshot = await query.limit(1001).get();
  if (snapshot.size > 1000) throw new Error('PAYROLL_ADJUSTMENT_LIMIT');
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((left: any, right: any) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
}

export async function createPayrollAdjustment(
  db: Firestore | null,
  actor: PayrollActor,
  input: Record<string, unknown>
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  assertMaker(actor);
  const staffUid = String(input.staffUid || '').trim();
  const period = String(input.period || '').trim();
  const type = String(input.type || '').trim().toUpperCase();
  const category = String(input.category || '').trim().toUpperCase();
  const reason = String(input.reason || '').trim().slice(0, 1000);
  if (!staffUid || !PERIOD_RE.test(period) || !TYPES.has(type) || !CATEGORIES.has(category) || reason.length < 5) {
    throw new Error('PAYROLL_ADJUSTMENT_REQUIRED_FIELDS');
  }
  if (type === 'EARNING' && ['ADVANCE', 'PENALTY'].includes(category)) throw new Error('PAYROLL_ADJUSTMENT_CATEGORY_TYPE_MISMATCH');
  const amount = parseVnd(input.amount, { field: 'PAYROLL_ADJUSTMENT_AMOUNT' });
  const staffRef = db.collection('users').doc(staffUid);
  const adjustmentRef = db.collection('payrollAdjustments').doc();
  let result: Record<string, any> = {};
  await db.runTransaction(async (transaction) => {
    const staffSnapshot = await transaction.get(staffRef);
    if (!staffSnapshot.exists || staffSnapshot.data()?.active === false) throw new Error('PAYROLL_ADJUSTMENT_STAFF_NOT_FOUND');
    const staff = staffSnapshot.data()!;
    const branchId = assertValidPayrollHomeBranch(staff);
    if (!branchId || !actorCanAccessBranch(actor, branchId)) throw new Error('PAYROLL_ADJUSTMENT_BRANCH_FORBIDDEN');
    const staffLock = await transaction.get(db.collection('payrollStaffLocks').doc(`${period}_${staffUid}`));
    if (staffLock.exists) throw new Error('PAYROLL_STAFF_ALREADY_LOCKED: Kỳ lương nhân viên đã được duyệt.');
    await assertPayrollPeriodsOpen(transaction, db, branchId, [period]);
    const now = new Date().toISOString();
    result = {
      id: adjustmentRef.id,
      staffUid,
      staffName: String(staff.displayName || staff.name || staffUid),
      branchId,
      period,
      type,
      category,
      amount,
      reason,
      status: 'PENDING',
      requestedByUid: actor.uid,
      requestedByName: actor.name || actor.uid,
      createdAt: now,
      updatedAt: now
    };
    transaction.create(adjustmentRef, result);
    transaction.set(db.collection('payrollAdjustmentAuditLogs').doc(), {
      adjustmentId: adjustmentRef.id,
      action: 'CREATED',
      next: result,
      actorUid: actor.uid,
      actorName: actor.name || actor.uid,
      occurredAt: now
    });
  });
  return result;
}

export async function reviewPayrollAdjustment(
  db: Firestore | null,
  actor: PayrollActor,
  adjustmentId: string,
  input: { decision: string; reason?: string }
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!CHECKER_ROLES.has(String(actor.role || '').toUpperCase())) throw new Error('PAYROLL_ADJUSTMENT_REVIEW_FORBIDDEN');
  const decision = String(input.decision || '').toUpperCase();
  if (!['APPROVE', 'REJECT'].includes(decision)) throw new Error('PAYROLL_ADJUSTMENT_DECISION_INVALID');
  const reason = String(input.reason || '').trim().slice(0, 1000);
  if (decision === 'REJECT' && reason.length < 5) throw new Error('PAYROLL_ADJUSTMENT_REJECTION_REASON_REQUIRED');
  const ref = db.collection('payrollAdjustments').doc(adjustmentId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error('PAYROLL_ADJUSTMENT_NOT_FOUND');
    const current = snapshot.data()!;
    if (!actorCanAccessBranch(actor, String(current.branchId || ''))) throw new Error('PAYROLL_ADJUSTMENT_BRANCH_FORBIDDEN');
    if (current.status !== 'PENDING') throw new Error('PAYROLL_ADJUSTMENT_ALREADY_REVIEWED');
    if (String(current.requestedByUid || '') === actor.uid) throw new Error('PAYROLL_ADJUSTMENT_MAKER_CHECKER_REQUIRED');
    await assertPayrollPeriodsOpen(transaction, db, String(current.branchId || ''), [String(current.period || '')]);
    const now = new Date().toISOString();
    const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const next = {
      ...current,
      id: adjustmentId,
      status,
      reviewReason: reason || null,
      approvedByUid: actor.uid,
      approvedByName: actor.name || actor.uid,
      approvedAt: now,
      updatedAt: now
    };
    transaction.update(ref, next);
    transaction.set(db.collection('payrollAdjustmentAuditLogs').doc(), {
      adjustmentId,
      action: status,
      previousStatus: current.status,
      nextStatus: status,
      reason: reason || null,
      actorUid: actor.uid,
      actorName: actor.name || actor.uid,
      occurredAt: now
    });
    return next;
  });
}
