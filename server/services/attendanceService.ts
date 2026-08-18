import { Firestore, doc, runTransaction, getDoc } from 'firebase/firestore';
import { verifyGeofence, LatLng } from './geofenceService';

export interface CheckInRequest {
  staffId: string;
  staffName?: string;
  role?: string;
  branchId: string;
  branchName?: string;
  userCoords?: LatLng;
  storeCoords?: LatLng;
  allowedRadiusMeters?: number;
  faceVerified: boolean;
  faceConfidence?: number;
  networkVerified: boolean;
  qrScanned?: boolean;
  clientTime?: string;
}

export interface CheckOutRequest {
  staffId: string;
  branchId: string;
}

export interface AttendanceRecordResult {
  id: string;
  staffId: string;
  staffName: string;
  branchId: string;
  date: string;
  checkInTime: string;
  checkOutTime?: string;
  status: 'ON_TIME' | 'LATE' | 'PENDING_VERIFICATION' | 'REJECTED';
  workDurationMinutes: number;
  verification: {
    gpsVerified: boolean;
    distanceMeters: number;
    faceVerified: boolean;
    networkVerified: boolean;
    qrScanned: boolean;
    serverTimeIso: string;
  };
}

export async function processServerCheckIn(
  db: Firestore | null,
  payload: CheckInRequest
): Promise<AttendanceRecordResult> {
  const {
    staffId,
    staffName = 'Nhân viên',
    role = 'STAFF',
    branchId,
    branchName = 'Chi nhánh PhoneHouse',
    userCoords,
    storeCoords,
    allowedRadiusMeters = 150,
    faceVerified,
    networkVerified,
    qrScanned = false
  } = payload;

  if (!staffId) {
    throw new Error('Thiếu mã nhân viên (staffId).');
  }

  // 1. Verify Geofencing
  const geoCheck = verifyGeofence(userCoords, storeCoords, allowedRadiusMeters);
  if (!geoCheck.isInside) {
    throw new Error(geoCheck.error || 'Vị trí GPS không nằm trong phạm vi cửa hàng.');
  }

  // 2. Authoritative Server Timestamp (Vietnam Timezone)
  const now = new Date();
  const dateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }); // YYYY-MM-DD
  const timeStr = now.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh'
  });
  const serverTimeIso = now.toISOString();

  // 3. Determine Attendance Status
  let status: 'ON_TIME' | 'LATE' | 'PENDING_VERIFICATION' = 'ON_TIME';
  if (!faceVerified) {
    // Backend AI Face offline or unconfirmed -> Mark for Manager Audit
    status = 'PENDING_VERIFICATION';
  } else {
    // Check if after 08:30
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (hours > 8 || (hours === 8 && minutes > 30)) {
      status = 'LATE';
    }
  }

  const recordId = `ATT_${staffId}_${dateStr.replace(/-/g, '')}`;
  const newRecord: AttendanceRecordResult = {
    id: recordId,
    staffId,
    staffName,
    branchId,
    date: dateStr,
    checkInTime: timeStr,
    status,
    workDurationMinutes: 0,
    verification: {
      gpsVerified: true,
      distanceMeters: geoCheck.distanceMeters,
      faceVerified,
      networkVerified,
      qrScanned,
      serverTimeIso
    }
  };

  // 4. Persistence with Duplicate Locking
  if (db) {
    const attRef = doc(db, 'attendance', recordId);
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(attRef);
      if (snap.exists()) {
        const existingData = snap.data();
        if (existingData.checkInTime) {
          throw new Error(`ALREADY_CHECKED_IN: Bạn đã điểm danh hôm nay lúc ${existingData.checkInTime}.`);
        }
      }
      transaction.set(attRef, {
        ...newRecord,
        role,
        branchName,
        createdAt: serverTimeIso
      });
    });
  }

  return newRecord;
}

export async function processServerCheckOut(
  db: Firestore | null,
  payload: CheckOutRequest
): Promise<{ success: boolean; checkOutTime: string; workDurationMinutes: number }> {
  const { staffId } = payload;
  const now = new Date();
  const dateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
  const timeStr = now.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh'
  });

  const recordId = `ATT_${staffId}_${dateStr.replace(/-/g, '')}`;
  let workDurationMinutes = 480; // default 8 hours

  if (db) {
    const attRef = doc(db, 'attendance', recordId);
    const snap = await getDoc(attRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.checkInTime) {
        const [inH, inM] = data.checkInTime.split(':').map(Number);
        const [outH, outM] = timeStr.split(':').map(Number);
        workDurationMinutes = Math.max(0, (outH * 60 + outM) - (inH * 60 + inM));
      }
    }
  }

  return {
    success: true,
    checkOutTime: timeStr,
    workDurationMinutes
  };
}
