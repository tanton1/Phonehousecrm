import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assertAttendanceVerificationSession } from '../server/services/attendanceVerificationService';

const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

function openSession() {
  return {
    uid: 'staff-1',
    branchId: 'branch-1',
    action: 'CHECK_IN',
    status: 'OPEN',
    expiresAtMs: Date.now() + 60_000,
    deviceIdHash: hash('device-123'),
    clientIpHash: hash('203.0.113.10'),
    nonceHash: hash('nonce-123')
  };
}

const assertion = {
  sessionId: 'AVS_TEST',
  nonce: 'nonce-123',
  uid: 'staff-1',
  branchId: 'branch-1',
  deviceId: 'device-123',
  action: 'CHECK_IN' as const,
  clientIp: '203.0.113.10'
};

describe('attendance verification session', () => {
  it('binds the session to user, branch, device and nonce without binding a mobile IP', () => {
    expect(() => assertAttendanceVerificationSession(openSession(), assertion)).not.toThrow();
    expect(() => assertAttendanceVerificationSession(openSession(), { ...assertion, clientIp: '198.51.100.24' })).not.toThrow();
    expect(() => assertAttendanceVerificationSession(openSession(), { ...assertion, nonce: 'replayed-or-wrong' }))
      .toThrow('VERIFICATION_SESSION_NONCE_INVALID');
    expect(() => assertAttendanceVerificationSession(openSession(), { ...assertion, deviceId: 'other-device' }))
      .toThrow('VERIFICATION_SESSION_DEVICE_MISMATCH');
  });

  it('rejects a used or expired session', () => {
    expect(() => assertAttendanceVerificationSession({ ...openSession(), status: 'USED' }, assertion))
      .toThrow('VERIFICATION_SESSION_ALREADY_USED');
    expect(() => assertAttendanceVerificationSession({ ...openSession(), expiresAtMs: Date.now() - 1 }, assertion))
      .toThrow('VERIFICATION_SESSION_EXPIRED');
  });
});
