import { auth } from '../lib/firebase';
import { ShiftDefinition, WeeklyShiftSchedule } from '../types';

export interface ShiftBoardResponse {
  weekStart: string;
  schedules: WeeklyShiftSchedule[];
  definitions: ShiftDefinition[];
  permissions: {
    canManage: boolean;
    canConfigureShifts: boolean;
  };
}

export interface ShiftBoardEntryPayload {
  staffId: string;
  days: Record<string, { shiftId: string; note?: string }>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn.');
  const token = await user.getIdToken(false);
  const response = await fetch(`/api/attendance${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {})
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const message = payload?.error || payload?.message || `Máy chủ trả lỗi HTTP ${response.status}.`;
    throw new Error(String(message).replace(/^[A-Z0-9_]+:\s*/, ''));
  }
  return payload.data as T;
}

export function fetchShiftBoard(weekStart: string, branchId: string) {
  const query = new URLSearchParams({ weekStart, branchId });
  return request<ShiftBoardResponse>(`/shift-board?${query.toString()}`);
}

export function saveShiftBoard(payload: {
  branchId: string;
  weekStart: string;
  status: 'DRAFT' | 'PUBLISHED';
  entries: ShiftBoardEntryPayload[];
  operationKey: string;
}) {
  return request<{ saved: number; status: 'DRAFT' | 'PUBLISHED'; idempotentReplay: boolean }>('/shift-board', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export function createShiftDefinition(payload: {
  name: string;
  startTime: string;
  endTime: string;
  breakDurationMinutes: number;
  color: string;
  branchId?: string;
}) {
  return request<ShiftDefinition>('/shift-definitions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function updateShiftDefinition(id: string, payload: {
  name: string;
  startTime: string;
  endTime: string;
  breakDurationMinutes: number;
  color: string;
  branchId?: string;
  active?: boolean;
}) {
  return request<ShiftDefinition>(`/shift-definitions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}
