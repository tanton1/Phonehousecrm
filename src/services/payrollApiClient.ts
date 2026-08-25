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
  records: Array<PayrollRecord & { id?: string; branchId?: string; status: 'DRAFT' | 'APPROVED' | 'PAID' }>;
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

export async function fetchMyPayrollSlip(period: string) {
  const query = new URLSearchParams({ period });
  return unwrap<(PayrollRecord & { id: string; period: string; runStatus: 'APPROVED' | 'PAID'; approvedAt?: string }) | null>(
    await apiJson(`/api/payroll/my-slip?${query.toString()}`, { timeoutMs: 30000 })
  );
}
