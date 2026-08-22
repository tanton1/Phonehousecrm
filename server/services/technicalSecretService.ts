import crypto from 'crypto';
import { FieldValue, Firestore } from 'firebase-admin/firestore';

interface EncryptedTechnicalSecret {
  algorithm: 'aes-256-gcm';
  iv: string;
  authTag: string;
  ciphertext: string;
  keyVersion: 'v1';
}

function encryptionKey(): Buffer {
  const configured = String(process.env.TECHNICAL_SECRET_ENCRYPTION_KEY || '').trim();
  if (configured.length < 32) {
    throw new Error('TECHNICAL_SECRET_KEY_NOT_CONFIGURED: Cần cấu hình TECHNICAL_SECRET_ENCRYPTION_KEY tối thiểu 32 ký tự trên server trước khi lưu mật mã mở máy.');
  }
  return crypto.createHash('sha256').update(configured, 'utf8').digest();
}

export function encryptTechnicalSecret(plainText?: string): EncryptedTechnicalSecret | null {
  const value = String(plainText || '').trim();
  if (!value) return null;
  if (value.length > 128) throw new Error('TECHNICAL_SECRET_TOO_LONG');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    keyVersion: 'v1'
  };
}

function decryptTechnicalSecret(secret: EncryptedTechnicalSecret): string {
  if (secret.algorithm !== 'aes-256-gcm') throw new Error('UNSUPPORTED_TECHNICAL_SECRET_ALGORITHM');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(secret.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(secret.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function canAccessBranch(actor: any, branchId?: string): boolean {
  if (String(actor?.role || '').toUpperCase() === 'ADMIN') return true;
  return !!branchId && (actor?.branchId === branchId || (actor?.assignedBranchIds || []).includes(branchId));
}

export async function revealTechnicalPasscode(
  db: Firestore,
  workOrderId: string,
  actor: { uid: string; name?: string; role?: string; branchId?: string; assignedBranchIds?: string[] }
): Promise<{ passcode: string | null }> {
  const workOrderSnap = await db.collection('technicalWorkOrders').doc(workOrderId).get();
  if (!workOrderSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
  const workOrder = workOrderSnap.data()!;
  if (!canAccessBranch(actor, workOrder.branchId)) throw new Error('BRANCH_FORBIDDEN');

  const role = String(actor.role || '').toUpperCase();
  let allowed = ['ADMIN', 'MANAGER', 'TECH_LEAD'].includes(role);
  if (!allowed && ['TECH', 'TECHNICIAN'].includes(role)) {
    const assigned = await db.collection('technicalWorkOrderLines')
      .where('workOrderId', '==', workOrderId)
      .where('assigneeUid', '==', actor.uid)
      .limit(1)
      .get();
    allowed = !assigned.empty;
  }
  if (!allowed) throw new Error('PASSCODE_ACCESS_DENIED');

  const secretSnap = await db.collection('technicalSecrets').doc(workOrderId).get();
  const auditRef = db.collection('auditLogs').doc();
  await auditRef.set({
    id: auditRef.id,
    eventType: 'TECHNICAL_PASSCODE_VIEWED',
    workOrderId,
    branchId: workOrder.branchId,
    actorUid: actor.uid,
    actorName: actor.name || null,
    occurredAt: FieldValue.serverTimestamp()
  });
  if (!secretSnap.exists) return { passcode: null };
  return { passcode: decryptTechnicalSecret(secretSnap.data() as EncryptedTechnicalSecret) };
}
