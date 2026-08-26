import crypto from 'crypto';
import { FieldValue, Firestore } from 'firebase-admin/firestore';

export type AttendanceVerificationAction = 'CHECK_IN' | 'CHECK_OUT';

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
export async function createAttendanceVerificationSession(
  db: Firestore | null,
  input: { uid: string; branchId: string; deviceId: string; action: AttendanceVerificationAction; clientIp: string }
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!input.branchId) throw new Error('BRANCH_REQUIRED');
  if (!input.deviceId || input.deviceId.length < 8) throw new Error('DEVICE_ID_REQUIRED');
  const sessionId = `AVS_${crypto.randomBytes(18).toString('hex')}`;
  const nonce = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  const expiresAt = now + 120_000;
  await db.collection('attendanceVerificationSessions').doc(sessionId).create({
    id: sessionId,
    uid: input.uid,
    branchId: input.branchId,
    deviceIdHash: hash(input.deviceId),
    clientIpHash: hash(input.clientIp),
    action: input.action,
    nonceHash: hash(nonce),
    status: 'OPEN',
    createdAt: FieldValue.serverTimestamp(),
    expiresAtMs: expiresAt
  });
  return {
    sessionId,
    nonce,
    expiresAt: new Date(expiresAt).toISOString(),
    action: input.action,
    requiredEvidence: { gps: true, networkWhenConfigured: true, facePhoto: false, qr: false }
  };
}

export function assertAttendanceVerificationSession(
  session: any,
  input: { sessionId: string; nonce: string; uid: string; branchId: string; deviceId: string; action: AttendanceVerificationAction; clientIp: string }
) {
  if (!session) throw new Error('VERIFICATION_SESSION_NOT_FOUND');
  if (session.status !== 'OPEN' || session.usedAt) throw new Error('VERIFICATION_SESSION_ALREADY_USED');
  if (Number(session.expiresAtMs || 0) <= Date.now()) throw new Error('VERIFICATION_SESSION_EXPIRED');
  if (String(session.uid || '') !== input.uid) throw new Error('VERIFICATION_SESSION_USER_MISMATCH');
  if (String(session.branchId || '') !== input.branchId) throw new Error('VERIFICATION_SESSION_BRANCH_MISMATCH');
  if (String(session.action || '') !== input.action) throw new Error('VERIFICATION_SESSION_ACTION_MISMATCH');
  if (String(session.deviceIdHash || '') !== hash(input.deviceId)) throw new Error('VERIFICATION_SESSION_DEVICE_MISMATCH');
  if (String(session.clientIpHash || '') !== hash(input.clientIp)) throw new Error('VERIFICATION_SESSION_NETWORK_MISMATCH');
  if (String(session.nonceHash || '') !== hash(input.nonce)) throw new Error('VERIFICATION_SESSION_NONCE_INVALID');
}
