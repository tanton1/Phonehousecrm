import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { verifyGeofence, LatLng } from './geofenceService';

export interface CheckInRequest {
  staffId: string;
  staffName?: string;
  role?: string;
  branchId: string;
  branchName?: string;
  userCoords?: LatLng;
  faceVerified?: boolean;
  faceConfidence?: number;
  networkVerified?: boolean;
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
    faceVerified = false,
    networkVerified = false,
    qrScanned = false
  } = payload;

  if (!staffId) {
    throw new Error('Thiếu mã nhân viên (staffId).');
  }

  // 1. Authoritative Store Geofence Lookup from DB (Never trust client storeCoords)
  let authoritativeStoreCoords: LatLng = { latitude: 16.0678, longitude: 108.2208 }; // Default Danang Showroom
  let authoritativeRadius = 150; // meters

  if (db && branchId) {
    const branchDoc = await db.collection('branches').doc(branchId).get();
    if (branchDoc.exists) {
      const bData = branchDoc.data()!;
      if (typeof bData.gpsLatitude === 'number' && typeof bData.gpsLongitude === 'number') {
        authoritativeStoreCoords = { latitude: bData.gpsLatitude, longitude: bData.gpsLongitude };
      }
      if (typeof bData.attendanceRadius === 'number') {
        authoritativeRadius = bData.attendanceRadius;
      }
    }
  }

  // 2. Verify Geofencing against Authoritative Store Location
  const geoCheck = verifyGeofence(userCoords, authoritativeStoreCoords, authoritativeRadius);
  if (!geoCheck.isInside) {
    throw new Error(geoCheck.error || 'Vị trí GPS không nằm trong bán kính cho phép của cửa hàng.');
  }

  // 3. Authoritative Server Timestamp (Vietnam Timezone)
  const now = new Date();
  const dateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }); // YYYY-MM-DD
  const timeStr = now.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh'
  });
  const serverTimeIso = now.toISOString();

  // 4. Determine Attendance Status
  let status: 'ON_TIME' | 'LATE' | 'PENDING_VERIFICATION' = 'ON_TIME';
  if (!faceVerified) {
    status = 'PENDING_VERIFICATION';
  } else {
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

  // 5. Persistence with Duplicate Locking
  if (db) {
    const attRef = db.collection('attendance').doc(recordId);
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(attRef);
      if (snap.exists) {
        const existingData = snap.data()!;
        if (existingData.checkInTime) {
          throw new Error(`ALREADY_CHECKED_IN: Bạn đã điểm danh hôm nay lúc ${existingData.checkInTime}.`);
        }
      }
      transaction.set(attRef, {
        ...newRecord,
        role,
        branchName,
        createdAt: FieldValue.serverTimestamp()
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
    const attRef = db.collection('attendance').doc(recordId);
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(attRef);
      if (!snap.exists) {
        throw new Error('NOT_CHECKED_IN: Không tìm thấy lượt điểm danh vào ca của ngày hôm nay.');
      }
      const data = snap.data()!;
      if (data.checkOutTime) {
        throw new Error(`ALREADY_CHECKED_OUT: Bạn đã kết thúc ca làm việc lúc ${data.checkOutTime}.`);
      }

      if (data.checkInTime) {
        const [inH, inM] = data.checkInTime.split(':').map(Number);
        const [outH, outM] = timeStr.split(':').map(Number);
        workDurationMinutes = Math.max(0, (outH * 60 + outM) - (inH * 60 + inM));
      }

      // Authoritative Firestore write for Check-out
      transaction.update(attRef, {
        checkOutTime: timeStr,
        workDurationMinutes,
        updatedAt: FieldValue.serverTimestamp()
      });
    });
  }

  return {
    success: true,
    checkOutTime: timeStr,
    workDurationMinutes
  };
}
