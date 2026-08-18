/**
 * Attendance API Client Wrapper
 * Communicates with backend attendance endpoints with server-authoritative timestamps.
 */

export interface ServerNetworkCheckResult {
  clientIp: string;
  isAllowed: boolean;
  branchId?: string;
  serverTimeIso: string;
  serverTimeFormatted: string;
  serverDateFormatted: string;
  networkSignature: string;
}

export interface CheckInPayload {
  staffId: string;
  staffName?: string;
  role?: string;
  branchId: string;
  branchName?: string;
  userCoords?: { latitude: number; longitude: number };
  storeCoords?: { latitude: number; longitude: number };
  allowedRadiusMeters?: number;
  faceVerified: boolean;
  faceConfidence?: number;
  networkVerified: boolean;
  qrScanned?: boolean;
}

export async function checkServerNetwork(branchId?: string): Promise<ServerNetworkCheckResult | null> {
  try {
    const res = await fetch('/api/attendance/network-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId })
    });
    const json = await res.json();
    if (json.success && json.data) {
      return json.data;
    }
  } catch (e) {
    console.warn('Network check API error:', e);
  }
  return null;
}

export async function submitServerCheckIn(payload: CheckInPayload) {
  const res = await fetch('/api/attendance/check-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Điểm danh vào ca thất bại.');
  }
  return json.data;
}

export async function submitServerCheckOut(staffId: string, branchId: string) {
  const res = await fetch('/api/attendance/check-out', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffId, branchId })
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Kết thúc ca làm việc thất bại.');
  }
  return json.data;
}
