import { describe, it, expect } from 'vitest';
import { calculateDistanceInMeters, verifyGeofence } from '../server/services/geofenceService';
import { processServerCheckIn } from '../server/services/attendanceService';

describe('Sprint 2: Attendance Verification & Geofence Test Suite', () => {
  const storeLocation = { latitude: 16.0678, longitude: 108.2208 }; // PhoneHouse Da Nang Flagship

  it('Case 1: Tính toán khoảng cách Haversine chính xác', () => {
    // Exact same point -> 0 meters
    const dist0 = calculateDistanceInMeters(storeLocation, storeLocation);
    expect(dist0).toBe(0);

    // Nearby point ~50m away
    const nearby = { latitude: 16.0681, longitude: 108.2210 };
    const distNear = calculateDistanceInMeters(storeLocation, nearby);
    expect(distNear).toBeGreaterThan(0);
    expect(distNear).toBeLessThan(100);
  });

  it('Case 2: Chặn chấm công khi ngoài bán kính GPS cho phép', () => {
    const farAway = { latitude: 16.0800, longitude: 108.2500 }; // ~3.5km away
    const result = verifyGeofence(farAway, storeLocation, 100);

    expect(result.isInside).toBe(false);
    expect(result.distanceMeters).toBeGreaterThan(1000);
    expect(result.error).toContain('Vượt quá bán kính cho phép');
  });

  it('Case 3: Báo lỗi cấu hình khi chi nhánh chưa có tọa độ GPS', () => {
    const unconfiguredStore = { latitude: 0, longitude: 0 };
    const userLoc = { latitude: 16.0678, longitude: 108.2208 };
    const result = verifyGeofence(userLoc, unconfiguredStore, 100);

    expect(result.isInside).toBe(false);
    expect(result.error).toContain('chưa được cấu hình tọa độ GPS chuẩn');
  });

  it('Case 4: Xác thực Check-In Server Timestamp & Chuyển PENDING khi Face ID Offline', async () => {
    const result = await processServerCheckIn(null, {
      staffId: 'STAFF-007',
      staffName: 'Lê Văn B',
      branchId: 'CN01',
      userCoords: { latitude: 16.0678, longitude: 108.2208 },
      faceVerified: false, // AI Face offline
      networkVerified: true,
      qrScanned: true
    });

    expect(result.staffId).toBe('STAFF-007');
    expect(result.status).toBe('PENDING_VERIFICATION'); // Flagged for manager review
    expect(result.verification.gpsVerified).toBe(true);
    expect(result.verification.faceVerified).toBe(false);
    expect(result.verification.serverTimeIso).toBeDefined();
    expect(result.checkInTime).toBeDefined();
  });
});
