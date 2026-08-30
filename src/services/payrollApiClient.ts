import { apiJson } from './apiClient';
import type { PayrollRecord } from '../features/payroll/components/MonthlyPayrollTable';

export interface PayrollRun {
  id: string;
  period: string;
  branchId: string;
  status: 'DRAFT' | 'APPROVED' | 'PAID';
  staffCount: number;
  totalPayroll: number;
  totalCommission: number;
  updatedAt: string;
  approvedAt?: string;
  paidAt?: string;
  blockingIssueCount?: number;
  warningCount?: number;
  records: Array<PayrollRecord & { id?: string; branchId?: string; status: 'DRAFT' | 'APPROVED' | 'PAID' }>;
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
}

export interface PayrollAdjustment {
  id: string;
  staffUid: string;
  staffName: string;
  branchId: string;
  period: string;
  type: 'EARNING' | 'DEDUCTION';
  category: 'OVERTIME' | 'ATTENDANCE_BONUS' | 'ADVANCE' | 'PENALTY' | 'MANUAL';
  amount: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
  requestedByUid: string;
  payrollPostingId?: string;
}

function unwrap<T>(payload: any): T {
  if (!payload?.success) throw new Error(payload?.error || payload?.message || 'Yêu cầu bảng lương thất bại.');
  return payload.data as T;
}

export async function fetchPayrollRun(period: string, branchId: string) {
  const query = new URLSearchParams({ period, branchId });
  return unwrap<PayrollRun | null>(await apiJson(`/api/payroll/runs/current?${query.toString()}`, { timeoutMs: 30000 }));
}

export async function calculatePayrollRun(period: string, branchId: string) {
  return unwrap<PayrollRun>(await apiJson('/api/payroll/runs/calculate', {
    method: 'POST',
    body: JSON.stringify({ period, branchId }),
    timeoutMs: 60000
  }));
}

export async function approvePayrollRun(runId: string) {
  return unwrap<PayrollRun>(await apiJson(`/api/payroll/runs/${encodeURIComponent(runId)}/approve`, {
    method: 'POST',
    body: JSON.stringify({}),
    timeoutMs: 60000
  }));
}

export async function payPayrollRun(runId: string, input: { fundId: string; idempotencyKey: string; note?: string }) {
  return unwrap<any>(await apiJson(`/api/payroll/runs/${encodeURIComponent(runId)}/pay`, {
    method: 'POST',
    headers: { 'X-Idempotency-Key': input.idempotencyKey },
    body: JSON.stringify(input),
    timeoutMs: 60000
  }));
}

export async function fetchEmploymentCompensations(input: { staffUid?: string; branchId?: string } = {}) {
  const query = new URLSearchParams();
  if (input.staffUid) query.set('staffUid', input.staffUid);
  if (input.branchId) query.set('branchId', input.branchId);
  return unwrap<EmploymentCompensation[]>(await apiJson(`/api/payroll/compensations?${query.toString()}`, { timeoutMs: 30000 }));
}

export async function saveEmploymentCompensation(staffUid: string, input: { effectiveFrom: string; effectiveTo?: string; baseSalary: number; allowance: number }) {
  return unwrap<EmploymentCompensation>(await apiJson(`/api/payroll/compensations/${encodeURIComponent(staffUid)}`, {
    method: 'POST',
    body: JSON.stringify(input),
    timeoutMs: 30000
  }));
}

export async function fetchMyPayrollSlip(period: string) {
  const query = new URLSearchParams({ period });
  return unwrap<(PayrollRecord & { id: string; period: string; runStatus: 'APPROVED' | 'PAID'; approvedAt?: string }) | null>(
    await apiJson(`/api/payroll/my-slip?${query.toString()}`, { timeoutMs: 30000 })
  );
}

export async function fetchPayrollAdjustments(period: string, branchId: string) {
  const query = new URLSearchParams({ period, branchId });
  return unwrap<PayrollAdjustment[]>(await apiJson(`/api/payroll/adjustments?${query.toString()}`, { timeoutMs: 30000 }));
}

export async function createPayrollAdjustment(input: {
  staffUid: string;
  period: string;
  type: PayrollAdjustment['type'];
  category: PayrollAdjustment['category'];
  amount: number;
  reason: string;
}) {
  return unwrap<PayrollAdjustment>(await apiJson('/api/payroll/adjustments', {
    method: 'POST',
    body: JSON.stringify(input),
    timeoutMs: 30000
  }));
}

export async function reviewPayrollAdjustment(adjustmentId: string, decision: 'APPROVE' | 'REJECT', reason = '') {
  return unwrap<PayrollAdjustment>(await apiJson(`/api/payroll/adjustments/${encodeURIComponent(adjustmentId)}/review`, {
    method: 'POST',
    body: JSON.stringify({ decision, reason }),
    timeoutMs: 30000
  }));
}
