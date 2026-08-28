import { describe, it, expect } from 'vitest';
import { processServerCheckIn, processServerCheckOut } from '../server/services/attendanceService';
import { verifyGeofence } from '../server/services/geofenceService';

describe('Production Attendance & Shift Hardening Test Suite (P0/P1)', () => {
  const storeLocation = { latitude: 16.0678, longitude: 108.2208 };

  describe('1. Geofence & Evidence Verification', () => {
    it('passes geofence when coordinates are within radius', () => {
      const userCoords = { latitude: 16.0679, longitude: 108.2209 };
      const geo = verifyGeofence(userCoords, storeLocation, 150);
      expect(geo.isInside).toBe(true);
      expect(geo.distanceMeters).toBeLessThan(150);
    });

    it('rejects check-in when GPS coordinates are outside allowable radius', () => {
      const farCoords = { latitude: 16.0750, longitude: 108.2350 }; // ~1.7km away
      const geo = verifyGeofence(farCoords, storeLocation, 150);
      expect(geo.isInside).toBe(false);
      expect(geo.error).toContain('Vượt quá bán kính cho phép');
    });

    it('fails closed when branch GPS is unconfigured', () => {
      const unconfigured = { latitude: 0, longitude: 0 };
      const geo = verifyGeofence({ latitude: 16.0678, longitude: 108.2208 }, unconfigured, 150);
      expect(geo.isInside).toBe(false);
      expect(geo.error).toContain('chưa được cấu hình tọa độ GPS chuẩn');
    });
  });

  describe('2. Check-in & Biometric State Engine', () => {
    it('uses GPS as the location authority and does not require the store network', async () => {
      const result = await processServerCheckIn(null, {
        staffId: 'STAFF-TECH-01',
        staffName: 'Trần Kỹ Thuật',
        branchId: 'CN01',
        userCoords: { latitude: 16.0678, longitude: 108.2208 },
        faceCaptureBase64: '',
        clientIp: '127.0.0.1'
      });

      expect(['ON_TIME', 'LATE']).toContain(result.status);
      expect(result.verificationStatus).toBe('VERIFIED');
      expect(result.verification.gpsVerified).toBe(true);
      expect(result.verification.faceVerified).toBe(false);
      expect(result.verification.networkVerified).toBe(false);
    });

    it('records shift metadata and scheduled bounds in check-in result', async () => {
      const result = await processServerCheckIn(null, {
        staffId: 'STAFF-SALES-01',
        staffName: 'Nguyễn Bán Hàng',
        branchId: 'CN01',
        userCoords: { latitude: 16.0678, longitude: 108.2208 },
        faceCaptureBase64: 'VALID_CAPTURE_MOCK_123456789012345678901234567890',
        clientIp: '127.0.0.1'
      });

      expect(result.shiftId).toBeDefined();
      expect(result.scheduledStart).toBeDefined();
      expect(result.scheduledEnd).toBeDefined();
      expect(result.graceMinutes).toBe(5);
    });
  });

  describe('3. Check-out & Work Duration Calculation', () => {
    it('calculates workDurationMinutes and sets COMPLETED status on checkout', async () => {
      const checkoutResult = await processServerCheckOut(null, {
        staffId: 'STAFF-TEST-01',
        branchId: 'CN01'
      });

      expect(checkoutResult.status).toBe('COMPLETED');
      expect(checkoutResult.checkOutTime).toBeDefined();
      expect(checkoutResult.workDurationMinutes).toBeGreaterThan(0);
      expect(checkoutResult.netWorkMinutes).toBeGreaterThan(0);
    });
  });
});
