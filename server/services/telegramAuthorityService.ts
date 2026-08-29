import crypto from 'crypto';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { hasPermission, normalizeRole, Permission } from '../../shared/permissions';

const TELEGRAM_LINKS_COLLECTION = 'telegramUserLinks';
const TELEGRAM_LINK_CODES_COLLECTION = 'telegramLinkCodes';
const TELEGRAM_USER_BINDINGS_COLLECTION = 'telegramUserBindings';
const LINK_CODE_TTL_MS = 10 * 60_000;

export interface TelegramPrincipal {
  senderId: string;
  senderFingerprint: string;
  uid: string;
  name: string;
  role: string;
  branchId: string;
  assignedBranchIds: string[];
  isOwner: boolean;
  linked: boolean;
}

export interface TelegramLinkStatus {
  linked: boolean;
  linkedAt?: string;
  senderFingerprint?: string;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function telegramSenderLinkId(senderId: string): string {
  return sha256(`telegram-user-link:${String(senderId || '').trim()}`);
}

export function telegramLinkCodeId(code: string): string {
  return sha256(`telegram-link-code:${String(code || '').trim().toUpperCase()}`);
}

export function telegramSenderFingerprint(senderId: string): string {
  return telegramSenderLinkId(senderId).slice(0, 14);
}

function canonicalBranches(user: Record<string, any>): string[] {
  return [...new Set([
    String(user.branchId || '').trim(),
    ...(Array.isArray(user.assignedBranchIds) ? user.assignedBranchIds.map((value: unknown) => String(value || '').trim()) : [])
  ].filter(Boolean))];
}

export async function resolveTelegramPrincipal(
  db: Firestore,
  senderId: string,
  ownerUserIds: Set<string>
): Promise<TelegramPrincipal | null> {
  const normalizedSenderId = String(senderId || '').trim();
  if (!normalizedSenderId) return null;
  const fingerprint = telegramSenderFingerprint(normalizedSenderId);

  // Bootstrap compatibility: configured owners remain operational while staff
  // accounts progressively link their CRM identities.
  if (ownerUserIds.has(normalizedSenderId)) {
    return {
      senderId: normalizedSenderId,
      senderFingerprint: fingerprint,
      uid: `TELEGRAM_OWNER_${fingerprint}`,
      name: 'Chủ hệ thống',
      role: 'ADMIN',
      branchId: '',
      assignedBranchIds: [],
      isOwner: true,
      linked: false
    };
  }

  const linkSnapshot = await db.collection(TELEGRAM_LINKS_COLLECTION).doc(telegramSenderLinkId(normalizedSenderId)).get();
  if (!linkSnapshot.exists || linkSnapshot.data()?.active === false) return null;
  const uid = String(linkSnapshot.data()?.uid || '').trim();
  if (!uid) return null;

  const userSnapshot = await db.collection('users').doc(uid).get();
  if (!userSnapshot.exists || userSnapshot.data()?.active !== true) return null;
  const user = userSnapshot.data() || {};
  const role = normalizeRole(user.role);
  if (!role) return null;
  const branches = canonicalBranches(user);

  return {
    senderId: normalizedSenderId,
    senderFingerprint: fingerprint,
    uid,
    name: String(user.displayName || user.name || user.email || uid),
    role,
    branchId: String(user.branchId || branches[0] || '').trim(),
    assignedBranchIds: branches,
    isOwner: false,
    linked: true
  };
}

export function telegramPrincipalCanAccessBranch(principal: TelegramPrincipal, branchId: string): boolean {
  const normalizedBranchId = String(branchId || '').trim();
  if (!normalizedBranchId) return false;
  if (principal.isOwner || principal.role === 'ADMIN') return true;
  return new Set([principal.branchId, ...principal.assignedBranchIds].filter(Boolean)).has(normalizedBranchId);
}

export function telegramPrincipalHasPermission(principal: TelegramPrincipal, permission: Permission): boolean {
  return principal.isOwner || hasPermission(principal.role, permission);
}

export function telegramPrincipalHasAnyRole(principal: TelegramPrincipal, roles: string[]): boolean {
  if (principal.isOwner) return true;
  const allowed = new Set(roles.map(normalizeRole));
  return allowed.has(normalizeRole(principal.role));
}

export async function createTelegramLinkCode(
  db: Firestore,
  actor: { uid: string; role: string; branchId?: string; assignedBranchIds?: string[]; name?: string }
): Promise<{ code: string; expiresAt: string }> {
  const code = crypto.randomBytes(5).toString('hex').toUpperCase();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS).toISOString();
  await db.collection(TELEGRAM_LINK_CODES_COLLECTION).doc(telegramLinkCodeId(code)).set({
    uid: actor.uid,
    codeFingerprint: sha256(code).slice(0, 12),
    status: 'PENDING',
    expiresAt,
    createdAt: FieldValue.serverTimestamp(),
    createdAtIso: new Date().toISOString()
  });
  return { code, expiresAt };
}

export async function consumeTelegramLinkCode(
  db: Firestore,
  senderId: string,
  rawCode: string
): Promise<TelegramPrincipal> {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!/^[A-F0-9]{10}$/.test(code)) throw new Error('TELEGRAM_LINK_CODE_INVALID');
  const codeRef = db.collection(TELEGRAM_LINK_CODES_COLLECTION).doc(telegramLinkCodeId(code));
  const linkRef = db.collection(TELEGRAM_LINKS_COLLECTION).doc(telegramSenderLinkId(senderId));

  await db.runTransaction(async transaction => {
    const codeSnapshot = await transaction.get(codeRef);
    if (!codeSnapshot.exists || codeSnapshot.data()?.status !== 'PENDING') throw new Error('TELEGRAM_LINK_CODE_INVALID');
    const codeData = codeSnapshot.data() || {};
    if (Date.parse(String(codeData.expiresAt || '')) <= Date.now()) throw new Error('TELEGRAM_LINK_CODE_EXPIRED');
    const uid = String(codeData.uid || '').trim();
    const userRef = db.collection('users').doc(uid);
    const bindingRef = db.collection(TELEGRAM_USER_BINDINGS_COLLECTION).doc(uid);
    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists || userSnapshot.data()?.active !== true) throw new Error('TELEGRAM_LINK_USER_INACTIVE');
    const bindingSnapshot = await transaction.get(bindingRef);
    const previousLinkId = String(bindingSnapshot.data()?.linkId || '').trim();
    const now = new Date().toISOString();
    if (previousLinkId && previousLinkId !== linkRef.id) {
      transaction.set(db.collection(TELEGRAM_LINKS_COLLECTION).doc(previousLinkId), {
        active: false,
        replacedAt: FieldValue.serverTimestamp(),
        replacedAtIso: now
      }, { merge: true });
    }
    transaction.set(linkRef, {
      uid,
      senderFingerprint: telegramSenderFingerprint(senderId),
      active: true,
      linkedAt: FieldValue.serverTimestamp(),
      linkedAtIso: now,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    transaction.set(bindingRef, {
      uid,
      linkId: linkRef.id,
      senderFingerprint: telegramSenderFingerprint(senderId),
      active: true,
      linkedAt: FieldValue.serverTimestamp(),
      linkedAtIso: now,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    transaction.update(codeRef, {
      status: 'USED',
      usedAt: FieldValue.serverTimestamp(),
      usedAtIso: now,
      senderFingerprint: telegramSenderFingerprint(senderId)
    });
  });

  const principal = await resolveTelegramPrincipal(db, senderId, new Set());
  if (!principal) throw new Error('TELEGRAM_LINK_FAILED');
  return principal;
}

export async function getTelegramLinkStatus(db: Firestore, uid: string): Promise<TelegramLinkStatus> {
  const bindingSnapshot = await db.collection(TELEGRAM_USER_BINDINGS_COLLECTION).doc(uid).get();
  if (bindingSnapshot.exists && bindingSnapshot.data()?.active !== false) {
    const data = bindingSnapshot.data() || {};
    return {
      linked: true,
      linkedAt: String(data.linkedAtIso || ''),
      senderFingerprint: String(data.senderFingerprint || '')
    };
  }
  // Compatibility for links created before the one-to-one binding document existed.
  const snapshot = await db.collection(TELEGRAM_LINKS_COLLECTION).where('uid', '==', uid).limit(10).get();
  const activeLink = snapshot.docs.find(document => document.data()?.active !== false);
  if (!activeLink) return { linked: false };
  const data = activeLink.data() || {};
  return {
    linked: true,
    linkedAt: String(data.linkedAtIso || ''),
    senderFingerprint: String(data.senderFingerprint || '')
  };
}

export async function unlinkTelegramUser(db: Firestore, uid: string): Promise<void> {
  const snapshot = await db.collection(TELEGRAM_LINKS_COLLECTION).where('uid', '==', uid).limit(10).get();
  const activeDocuments = snapshot.docs.filter(document => document.data()?.active !== false);
  const batch = db.batch();
  activeDocuments.forEach(document => batch.set(document.ref, {
    active: false,
    unlinkedAt: FieldValue.serverTimestamp(),
    unlinkedAtIso: new Date().toISOString()
  }, { merge: true }));
  batch.set(db.collection(TELEGRAM_USER_BINDINGS_COLLECTION).doc(uid), {
    active: false,
    unlinkedAt: FieldValue.serverTimestamp(),
    unlinkedAtIso: new Date().toISOString()
  }, { merge: true });
  await batch.commit();
}
