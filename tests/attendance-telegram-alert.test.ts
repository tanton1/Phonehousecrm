import crypto from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { processServerCheckIn } from '../server/services/attendanceService';

const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const ORIGINAL_ENV = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  TELEGRAM_ALERTS_ENABLED: process.env.TELEGRAM_ALERTS_ENABLED
};

afterEach(() => {
  Object.entries(ORIGINAL_ENV).forEach(([key, value]) => {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  });
});

describe('Attendance Telegram transactional alert', () => {
  it('writes one combined outbox event when check-in GPS is outside the branch radius', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = '-100123';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
    process.env.TELEGRAM_ALERTS_ENABLED = 'true';
    const now = new Date();
    const date = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
    const attendanceId = `ATT_STAFF_ALERT_${date.replace(/-/g, '')}`;
    const session = {
      uid: 'STAFF_ALERT', branchId: 'PH109', action: 'CHECK_IN', status: 'OPEN',
      expiresAtMs: Date.now() + 60_000, deviceIdHash: digest('device-alert'),
      clientIpHash: digest('113.1.1.1'), nonceHash: digest('nonce-alert')
    };
    const outboxWrites: any[] = [];
    const collection = (name: string) => ({
      doc: (id: string) => ({
        col: name, id,
        get: async () => name === 'branches'
          ? ({ exists: true, data: () => ({ name: 'PH 109', gpsLatitude: 16.0, gpsLongitude: 108.0, attendanceRadius: 50, isActive: true }) })
          : name === 'weeklyShiftSchedules'
            ? ({ exists: true, data: () => ({ status: 'PUBLISHED', days: { [date]: { shiftId: 'SHIFT_TEST', shiftName: 'Ca test', startTime: '00:00', endTime: '23:59', breakMinutes: 60 } } }) })
            : ({ exists: false, data: () => null })
      }),
      where: () => ({ where: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }) }) })
    });
    const db: any = {
      collection,
      runTransaction: async (callback: any) => callback({
        get: async (ref: any) => ref.col === 'attendanceVerificationSessions'
          ? ({ exists: true, data: () => session })
          : ref.col === 'evidenceRecords'
            ? ({ exists: true, data: () => ({ status: 'ACTIVE', resourceType: 'ATTENDANCE', resourceId: attendanceId, branchId: 'PH109', createdByUid: 'STAFF_ALERT' }) })
            : ({ exists: false, data: () => null }),
        set: (ref: any, data: any) => { if (ref.col === 'telegramOutboxEvents') outboxWrites.push({ id: ref.id, data }); },
        update: () => undefined
      })
    };

    const result = await processServerCheckIn(db, {
      staffId: 'STAFF_ALERT', staffName: 'Nhân viên cảnh báo', branchId: 'PH109',
      userCoords: { latitude: 16.01, longitude: 108.01 }, photoEvidenceId: 'PHOTO_ALERT',
      faceSessionId: 'SESSION_ALERT', verificationNonce: 'nonce-alert', deviceId: 'device-alert', clientIp: '113.1.1.1'
    });

    expect(result.verification.gpsVerified).toBe(false);
    expect(outboxWrites).toHaveLength(1);
    expect(outboxWrites[0].data).toMatchObject({
      attendanceId,
      action: 'CHECK_IN',
      status: 'PENDING',
      violations: expect.arrayContaining(['OUTSIDE_GEOFENCE'])
    });
  });
});

