import crypto from 'crypto';
import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';

export interface ChannelConnectionActor {
  uid: string;
  role: string;
  branchId?: string;
  assignedBranchIds?: string[];
  name?: string;
}

export interface StoredMetaPageConnection {
  id: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  branchId: string;
  branchName: string;
  historyDays: number;
  includeComments: boolean;
  active: boolean;
}

export interface StoredZaloOaConnection {
  id: string;
  oaId: string;
  oaName: string;
  accessToken: string;
  refreshToken: string;
  appId: string;
  appSecret: string;
  webhookSecret: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  branchId: string;
  branchName: string;
  active: boolean;
}

export interface StoredTikTokBusinessConnection {
  id: string;
  businessId: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  appId: string;
  appSecret: string;
  scope: string[];
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  branchId: string;
  branchName: string;
  historyDays: number;
  active: boolean;
}

interface EncryptedChannelToken {
  algorithm: 'aes-256-gcm';
  iv: string;
  authTag: string;
  ciphertext: string;
  keyVersion: 'v1';
}

export const META_PROVIDER = 'META_MESSENGER';
export const ZALO_PROVIDER = 'ZALO_OA';
export const TIKTOK_PROVIDER = 'TIKTOK_BUSINESS';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_SESSION_TTL_MS = 30 * 60 * 1000;
export const META_SUBSCRIBED_FIELDS = [
  'messages',
  'message_echoes',
  'message_reads',
  'message_deliveries',
  'message_reactions',
  'message_edits',
  'messaging_postbacks',
  'messaging_handovers',
  'standby',
  'feed'
] as const;

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function role(actor: ChannelConnectionActor): string {
  return asString(actor.role).toUpperCase();
}

function isAdmin(actor: ChannelConnectionActor): boolean {
  return role(actor) === 'ADMIN';
}

function isManager(actor: ChannelConnectionActor): boolean {
  return ['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER'].includes(role(actor));
}

function canAccessBranch(actor: ChannelConnectionActor, branchId: string): boolean {
  if (isAdmin(actor)) return true;
  return [actor.branchId, ...(actor.assignedBranchIds || [])].filter(Boolean).includes(branchId);
}

function configuredGraphVersion(): string {
  const value = asString(process.env.META_GRAPH_API_VERSION).replace(/^v/i, '');
  return /^\d+\.\d+$/.test(value) ? `v${value}` : 'v23.0';
}

function encryptionKey(): Buffer {
  const configured = asString(process.env.CHANNEL_TOKEN_ENCRYPTION_KEY || process.env.META_APP_SECRET);
  if (configured.length < 16) throw new Error('CHANNEL_TOKEN_ENCRYPTION_KEY_NOT_CONFIGURED');
  return crypto.createHash('sha256').update(configured, 'utf8').digest();
}

export function encryptChannelSecret(valueInput: unknown): EncryptedChannelToken | null {
  const value = asString(valueInput);
  if (!value) return null;
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

export function decryptChannelSecret(value: unknown): string {
  const encrypted = asObject(value) as Partial<EncryptedChannelToken>;
  if (!encrypted.ciphertext) return '';
  if (encrypted.algorithm !== 'aes-256-gcm') throw new Error('CHANNEL_TOKEN_ALGORITHM_UNSUPPORTED');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(asString(encrypted.iv), 'base64')
  );
  decipher.setAuthTag(Buffer.from(asString(encrypted.authTag), 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(asString(encrypted.ciphertext), 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function tokenFingerprint(token: string): string {
  return token ? crypto.createHash('sha256').update(token).digest('hex').slice(0, 12) : '';
}

export function metaConnectionDocumentId(pageIdInput: unknown): string {
  const pageId = asString(pageIdInput).replace(/[^0-9A-Za-z_-]/g, '');
  if (!pageId) throw new Error('META_PAGE_ID_REQUIRED');
  return `META_${pageId}`;
}

export function zaloConnectionDocumentId(oaIdInput: unknown): string {
  const oaId = asString(oaIdInput).replace(/[^0-9A-Za-z_-]/g, '');
  if (!oaId) throw new Error('ZALO_OA_ID_REQUIRED');
  return `ZALO_${oaId}`;
}

export function tiktokConnectionDocumentId(businessIdInput: unknown): string {
  const businessId = asString(businessIdInput).replace(/[^0-9A-Za-z_-]/g, '');
  if (!businessId) throw new Error('TIKTOK_BUSINESS_ID_REQUIRED');
  return `TIKTOK_${businessId}`;
}

function normalizedProvider(value: unknown): string {
  const provider = asString(value).toUpperCase();
  if (provider === ZALO_PROVIDER) return ZALO_PROVIDER;
  if (provider === TIKTOK_PROVIDER) return TIKTOK_PROVIDER;
  return META_PROVIDER;
}

function mappingCollection(provider: string): string {
  if (provider === ZALO_PROVIDER) return 'zaloOaMappings';
  if (provider === TIKTOK_PROVIDER) return 'tiktokBusinessMappings';
  return 'metaPageMappings';
}

function cleanClientConnection(id: string, dataInput: unknown, mappingInput: unknown = {}) {
  const data = asObject(dataInput);
  const mapping = asObject(mappingInput);
  const provider = normalizedProvider(data.provider);
  const defaultName = provider === ZALO_PROVIDER
    ? 'Zalo OA'
    : provider === TIKTOK_PROVIDER ? 'TikTok Business' : 'Facebook Page';
  return {
    id,
    provider,
    externalAccountId: asString(data.externalAccountId || data.pageId),
    displayName: asString(data.displayName || data.pageName) || defaultName,
    branchId: asString(data.branchId),
    branchName: asString(data.branchName),
    active: data.active !== false,
    status: asString(data.status) || (data.hasToken ? 'NOT_TESTED' : 'MISSING_TOKEN'),
    hasToken: data.hasToken === true || Boolean(data.encryptedPageAccessToken || data.encryptedAccessToken),
    tokenFingerprint: asString(data.tokenFingerprint),
    historyDays: Math.min(90, Math.max(1, asNumber(data.historyDays, 30))),
    includeComments: data.includeComments !== false,
    source: asString(data.source) || 'MANAGED',
    webhookStatus: mapping.lastWebhookAt ? 'RECEIVING' : asString(data.webhookStatus) || 'NOT_SEEN',
    lastWebhookAt: mapping.lastWebhookAt || data.lastWebhookAt || null,
    lastWebhookEvent: asString(mapping.lastWebhookEvent || data.lastWebhookEvent),
    lastTestedAt: data.lastTestedAt || null,
    lastSyncAt: data.lastSyncAt || null,
    lastError: asString(data.lastError),
    subscribedFields: Array.isArray(data.subscribedFields) ? data.subscribedFields : [],
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null
  };
}

async function activeBranch(db: Firestore, branchIdInput: unknown) {
  const branchId = asString(branchIdInput);
  if (!branchId) throw new Error('CHANNEL_BRANCH_REQUIRED');
  const snapshot = await db.collection('branches').doc(branchId).get();
  if (!snapshot.exists || snapshot.data()?.isActive === false || snapshot.data()?.active === false) {
    throw new Error('CHANNEL_BRANCH_NOT_ACTIVE');
  }
  return { id: snapshot.id, name: asString(snapshot.data()?.name) || snapshot.id };
}

async function writeEvent(
  db: Firestore,
  actor: Pick<ChannelConnectionActor, 'uid' | 'name'>,
  input: Record<string, any>
) {
  const ref = db.collection('channelConnectionEvents').doc();
  await ref.set({
    id: ref.id,
    provider: asString(input.provider) || META_PROVIDER,
    actorUid: actor.uid,
    actorName: asString(actor.name) || actor.uid,
    occurredAt: FieldValue.serverTimestamp(),
    ...input
  });
}

async function legacyBranch(db: Firestore, pageId: string) {
  const explicit = asString(process.env.META_BRANCH_ID);
  if (explicit) {
    try { return await activeBranch(db, explicit); } catch { /* continue with existing mappings */ }
  }
  const [metaMapping, pancakeMapping] = await Promise.all([
    db.collection('metaPageMappings').doc(pageId).get(),
    db.collection('pancakePageMappings').doc(pageId).get()
  ]);
  const branchId = asString(metaMapping.data()?.branchId || pancakeMapping.data()?.branchId);
  if (!branchId) return null;
  try { return await activeBranch(db, branchId); } catch { return null; }
}

async function bootstrapLegacyMetaConnection(db: Firestore) {
  const pageId = asString(process.env.META_PAGE_ID);
  if (!pageId) return null;
  const ref = db.collection('channelConnections').doc(metaConnectionDocumentId(pageId));
  const existing = await ref.get();
  if (existing.exists) return existing;
  const branch = await legacyBranch(db, pageId);
  if (!branch) return null;
  const token = asString(process.env.META_PAGE_ACCESS_TOKEN);
  const encrypted = token ? encryptChannelSecret(token) : null;
  await ref.set({
    id: ref.id,
    provider: META_PROVIDER,
    externalAccountId: pageId,
    displayName: asString(process.env.META_PAGE_NAME) || `Facebook Page ${pageId}`,
    branchId: branch.id,
    branchName: branch.name,
    active: true,
    status: token ? 'NOT_TESTED' : 'MISSING_TOKEN',
    hasToken: Boolean(token),
    ...(encrypted ? { encryptedPageAccessToken: encrypted, tokenFingerprint: tokenFingerprint(token) } : {}),
    historyDays: Math.min(90, Math.max(1, asNumber(process.env.META_SYNC_DAYS, 30))),
    includeComments: true,
    source: 'ENV_MIGRATED',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: false });
  return ref.get();
}

async function readChannelConnections(db: Firestore, actor: ChannelConnectionActor) {
  await bootstrapLegacyMetaConnection(db);
  const snapshot = await db.collection('channelConnections').limit(100).get();
  const documents = snapshot.docs
    .filter(document => [META_PROVIDER, ZALO_PROVIDER, TIKTOK_PROVIDER].includes(asString(document.data().provider)))
    .filter(document => canAccessBranch(actor, asString(document.data().branchId)));
  const mappingSnapshots = await Promise.all(documents.map(document => db
    .collection(mappingCollection(asString(document.data().provider)))
    .doc(asString(document.data().externalAccountId))
    .get()));
  return documents
    .map((document, index) => cleanClientConnection(
      document.id,
      document.data(),
      mappingSnapshots[index]?.data()
    ))
    .sort((left, right) => Number(right.active) - Number(left.active) || left.displayName.localeCompare(right.displayName, 'vi'));
}

export async function listChannelConnections(db: Firestore | null, actor: ChannelConnectionActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isManager(actor)) throw new Error('CHANNEL_CONNECTIONS_FORBIDDEN');
  return readChannelConnections(db, actor);
}

export async function listChatChannelConnections(db: Firestore | null, actor: ChannelConnectionActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  return readChannelConnections(db, actor);
}

export async function getStoredMetaPageConnection(
  db: Firestore | null,
  pageIdInput: unknown
): Promise<StoredMetaPageConnection | null> {
  if (!db) return null;
  const pageId = asString(pageIdInput);
  if (!pageId) return null;
  let snapshot = await db.collection('channelConnections').doc(metaConnectionDocumentId(pageId)).get();
  if (!snapshot.exists && pageId === asString(process.env.META_PAGE_ID)) {
    snapshot = await bootstrapLegacyMetaConnection(db) || snapshot;
  }
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  if (data.active === false || asString(data.provider) !== META_PROVIDER) return null;
  let token = '';
  if (data.encryptedPageAccessToken) token = decryptChannelSecret(data.encryptedPageAccessToken);
  if (!token && pageId === asString(process.env.META_PAGE_ID)) token = asString(process.env.META_PAGE_ACCESS_TOKEN);
  return {
    id: snapshot.id,
    pageId,
    pageName: asString(data.displayName) || `Facebook Page ${pageId}`,
    pageAccessToken: token,
    branchId: asString(data.branchId),
    branchName: asString(data.branchName),
    historyDays: Math.min(90, Math.max(1, asNumber(data.historyDays, 30))),
    includeComments: data.includeComments !== false,
    active: data.active !== false
  };
}

function timestampMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  const object = asObject(value);
  if (typeof object.toMillis === 'function') return asNumber(object.toMillis());
  const seconds = asNumber(object.seconds ?? object._seconds);
  if (seconds > 0) return seconds * 1000;
  const parsed = Date.parse(asString(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getStoredZaloOaConnection(
  db: Firestore | null,
  oaIdInput: unknown
): Promise<StoredZaloOaConnection | null> {
  if (!db) return null;
  const oaId = asString(oaIdInput);
  if (!oaId) return null;
  const snapshot = await db.collection('channelConnections').doc(zaloConnectionDocumentId(oaId)).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  if (data.active === false || asString(data.provider) !== ZALO_PROVIDER) return null;
  return {
    id: snapshot.id,
    oaId,
    oaName: asString(data.displayName) || `Zalo OA ${oaId}`,
    accessToken: decryptChannelSecret(data.encryptedAccessToken),
    refreshToken: decryptChannelSecret(data.encryptedRefreshToken),
    appId: asString(data.appId || process.env.ZALO_APP_ID),
    appSecret: decryptChannelSecret(data.encryptedAppSecret) || asString(process.env.ZALO_APP_SECRET),
    webhookSecret: decryptChannelSecret(data.encryptedWebhookSecret) || asString(process.env.ZALO_OA_SECRET_KEY),
    accessTokenExpiresAt: timestampMillis(data.accessTokenExpiresAt),
    refreshTokenExpiresAt: timestampMillis(data.refreshTokenExpiresAt),
    branchId: asString(data.branchId),
    branchName: asString(data.branchName),
    active: data.active !== false
  };
}

export async function getStoredTikTokBusinessConnection(
  db: Firestore | null,
  businessIdInput: unknown
): Promise<StoredTikTokBusinessConnection | null> {
  if (!db) return null;
  const businessId = asString(businessIdInput);
  if (!businessId) return null;
  const snapshot = await db.collection('channelConnections').doc(tiktokConnectionDocumentId(businessId)).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  if (data.active === false || asString(data.provider) !== TIKTOK_PROVIDER) return null;
  return {
    id: snapshot.id,
    businessId,
    displayName: asString(data.displayName) || `TikTok Business ${businessId}`,
    accessToken: decryptChannelSecret(data.encryptedAccessToken),
    refreshToken: decryptChannelSecret(data.encryptedRefreshToken),
    appId: asString(data.appId || process.env.TIKTOK_APP_ID),
    appSecret: decryptChannelSecret(data.encryptedAppSecret) || asString(process.env.TIKTOK_APP_SECRET),
    scope: Array.isArray(data.scope) ? data.scope.map(asString).filter(Boolean) : [],
    accessTokenExpiresAt: timestampMillis(data.accessTokenExpiresAt),
    refreshTokenExpiresAt: timestampMillis(data.refreshTokenExpiresAt),
    branchId: asString(data.branchId),
    branchName: asString(data.branchName),
    historyDays: Math.min(90, Math.max(1, asNumber(data.historyDays, 30))),
    active: data.active !== false
  };
}

export async function saveManualTikTokConnection(
  db: Firestore | null,
  input: Record<string, any>,
  actor: ChannelConnectionActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isAdmin(actor)) throw new Error('CHANNEL_CONNECTION_ADMIN_REQUIRED');
  const businessId = asString(input.businessId || input.openId);
  if (!/^[0-9A-Za-z_-]{5,100}$/.test(businessId)) throw new Error('TIKTOK_BUSINESS_ID_INVALID');
  const branch = await activeBranch(db, input.branchId);
  const ref = db.collection('channelConnections').doc(tiktokConnectionDocumentId(businessId));
  const existing = await ref.get();
  const current = existing.data() || {};
  const accessToken = asString(input.accessToken);
  const refreshToken = asString(input.refreshToken);
  const appSecret = asString(input.appSecret);
  if (!accessToken && !current.encryptedAccessToken) throw new Error('TIKTOK_ACCESS_TOKEN_REQUIRED');
  const now = Date.now();
  const accessExpiresIn = Math.min(7 * 24 * 60 * 60, Math.max(300, asNumber(input.expiresIn, 24 * 60 * 60)));
  const refreshExpiresIn = Math.min(400 * 24 * 60 * 60, Math.max(24 * 60 * 60, asNumber(input.refreshTokenExpiresIn, 365 * 24 * 60 * 60)));
  const updates: Record<string, any> = {
    id: ref.id,
    provider: TIKTOK_PROVIDER,
    externalAccountId: businessId,
    displayName: asString(input.displayName || input.businessName) || asString(current.displayName) || `TikTok Business ${businessId}`,
    branchId: branch.id,
    branchName: branch.name,
    appId: asString(input.appId) || asString(current.appId) || asString(process.env.TIKTOK_APP_ID),
    scope: Array.isArray(input.scope) ? input.scope.map(asString).filter(Boolean) : (Array.isArray(current.scope) ? current.scope : []),
    active: true,
    status: 'NOT_TESTED',
    hasToken: true,
    historyDays: Math.min(90, Math.max(1, asNumber(input.historyDays, current.historyDays || 30))),
    includeComments: false,
    source: asString(current.source) || 'MANUAL',
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: actor.uid,
    updatedByName: asString(actor.name) || actor.uid,
    ...(accessToken ? {
      encryptedAccessToken: encryptChannelSecret(accessToken),
      tokenFingerprint: tokenFingerprint(accessToken),
      accessTokenExpiresAt: Timestamp.fromMillis(now + accessExpiresIn * 1000)
    } : {}),
    ...(refreshToken ? {
      encryptedRefreshToken: encryptChannelSecret(refreshToken),
      hasRefreshToken: true,
      refreshTokenExpiresAt: Timestamp.fromMillis(now + refreshExpiresIn * 1000)
    } : {}),
    ...(appSecret ? { encryptedAppSecret: encryptChannelSecret(appSecret), hasAppSecret: true } : {})
  };
  if (!existing.exists) updates.createdAt = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(ref, updates, { merge: true });
  batch.set(db.collection('tiktokBusinessMappings').doc(businessId), {
    businessId,
    displayName: updates.displayName,
    branchId: branch.id,
    branchName: branch.name,
    isActive: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();
  await writeEvent(db, actor, {
    provider: TIKTOK_PROVIDER,
    connectionId: ref.id,
    pageId: businessId,
    branchId: branch.id,
    eventType: existing.exists ? 'CONNECTION_UPDATED' : 'CONNECTION_CREATED'
  });
  return cleanClientConnection(ref.id, (await ref.get()).data());
}

export async function saveManualZaloConnection(
  db: Firestore | null,
  input: Record<string, any>,
  actor: ChannelConnectionActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isAdmin(actor)) throw new Error('CHANNEL_CONNECTION_ADMIN_REQUIRED');
  const oaId = asString(input.oaId);
  if (!/^[0-9]{5,30}$/.test(oaId)) throw new Error('ZALO_OA_ID_INVALID');
  const branch = await activeBranch(db, input.branchId);
  const ref = db.collection('channelConnections').doc(zaloConnectionDocumentId(oaId));
  const existing = await ref.get();
  const current = existing.data() || {};
  const accessToken = asString(input.accessToken);
  const refreshToken = asString(input.refreshToken);
  const appSecret = asString(input.appSecret);
  const webhookSecret = asString(input.webhookSecret);
  if (!accessToken && !current.encryptedAccessToken) throw new Error('ZALO_ACCESS_TOKEN_REQUIRED');
  const expiresIn = Math.min(90_000, Math.max(300, asNumber(input.expiresIn, 90_000)));
  const now = Date.now();
  const updates: Record<string, any> = {
    id: ref.id,
    provider: ZALO_PROVIDER,
    externalAccountId: oaId,
    displayName: asString(input.oaName) || asString(current.displayName) || `Zalo OA ${oaId}`,
    branchId: branch.id,
    branchName: branch.name,
    appId: asString(input.appId) || asString(current.appId) || asString(process.env.ZALO_APP_ID),
    active: true,
    status: 'NOT_TESTED',
    hasToken: true,
    historyDays: Math.min(90, Math.max(1, asNumber(input.historyDays, current.historyDays || 30))),
    includeComments: false,
    source: asString(current.source) || 'MANUAL',
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: actor.uid,
    updatedByName: asString(actor.name) || actor.uid,
    ...(accessToken ? {
      encryptedAccessToken: encryptChannelSecret(accessToken),
      tokenFingerprint: tokenFingerprint(accessToken),
      accessTokenExpiresAt: Timestamp.fromMillis(now + expiresIn * 1000)
    } : {}),
    ...(refreshToken ? {
      encryptedRefreshToken: encryptChannelSecret(refreshToken),
      hasRefreshToken: true,
      refreshTokenExpiresAt: Timestamp.fromMillis(now + 90 * 24 * 60 * 60 * 1000)
    } : {}),
    ...(appSecret ? { encryptedAppSecret: encryptChannelSecret(appSecret), hasAppSecret: true } : {}),
    ...(webhookSecret ? { encryptedWebhookSecret: encryptChannelSecret(webhookSecret), hasWebhookSecret: true } : {})
  };
  if (!existing.exists) updates.createdAt = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(ref, updates, { merge: true });
  batch.set(db.collection('zaloOaMappings').doc(oaId), {
    oaId,
    oaName: updates.displayName,
    branchId: branch.id,
    branchName: branch.name,
    isActive: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();
  await writeEvent(db, actor, {
    provider: ZALO_PROVIDER,
    connectionId: ref.id,
    pageId: oaId,
    branchId: branch.id,
    eventType: existing.exists ? 'CONNECTION_UPDATED' : 'CONNECTION_CREATED'
  });
  return cleanClientConnection(ref.id, (await ref.get()).data());
}

export async function saveManualMetaConnection(
  db: Firestore | null,
  input: Record<string, any>,
  actor: ChannelConnectionActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isAdmin(actor)) throw new Error('CHANNEL_CONNECTION_ADMIN_REQUIRED');
  const pageId = asString(input.pageId);
  if (!/^[0-9]{5,30}$/.test(pageId)) throw new Error('META_PAGE_ID_INVALID');
  const branch = await activeBranch(db, input.branchId);
  const ref = db.collection('channelConnections').doc(metaConnectionDocumentId(pageId));
  const existing = await ref.get();
  const token = asString(input.pageAccessToken);
  const encrypted = token ? encryptChannelSecret(token) : null;
  const updates: Record<string, any> = {
    id: ref.id,
    provider: META_PROVIDER,
    externalAccountId: pageId,
    displayName: asString(input.pageName) || asString(existing.data()?.displayName) || `Facebook Page ${pageId}`,
    branchId: branch.id,
    branchName: branch.name,
    active: true,
    status: token || existing.data()?.encryptedPageAccessToken ? 'NOT_TESTED' : 'MISSING_TOKEN',
    hasToken: Boolean(token || existing.data()?.encryptedPageAccessToken),
    historyDays: Math.min(90, Math.max(1, asNumber(input.historyDays, existing.data()?.historyDays || 30))),
    includeComments: input.includeComments !== false,
    source: existing.data()?.source || 'MANUAL',
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: actor.uid,
    updatedByName: asString(actor.name) || actor.uid
  };
  if (!existing.exists) updates.createdAt = FieldValue.serverTimestamp();
  if (encrypted) Object.assign(updates, {
    encryptedPageAccessToken: encrypted,
    tokenFingerprint: tokenFingerprint(token)
  });
  const batch = db.batch();
  batch.set(ref, updates, { merge: true });
  batch.set(db.collection('metaPageMappings').doc(pageId), {
    pageId,
    pageName: updates.displayName,
    branchId: branch.id,
    branchName: branch.name,
    isActive: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();
  await writeEvent(db, actor, {
    connectionId: ref.id,
    pageId,
    branchId: branch.id,
    eventType: existing.exists ? 'CONNECTION_UPDATED' : 'CONNECTION_CREATED'
  });
  return cleanClientConnection(ref.id, (await ref.get()).data());
}

async function graphRequest(
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<Record<string, any>> {
  if (!accessToken) throw new Error('META_PAGE_ACCESS_TOKEN_NOT_CONFIGURED');
  const url = path.startsWith('https://')
    ? path
    : `https://graph.facebook.com/${configuredGraphVersion()}/${path.replace(/^\//, '')}`;
  if (!url.startsWith('https://graph.facebook.com/')) throw new Error('META_GRAPH_URL_INVALID');
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok || payload.error) {
    const error = asObject(payload.error);
    throw new Error(`META_API_FAILED_${asString(error.code) || response.status}: ${asString(error.message) || 'Meta từ chối yêu cầu.'}`);
  }
  return payload;
}

export async function testMetaConnection(
  db: Firestore | null,
  connectionId: string,
  actor: ChannelConnectionActor,
  subscribe = false
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isAdmin(actor)) throw new Error('CHANNEL_CONNECTION_ADMIN_REQUIRED');
  const ref = db.collection('channelConnections').doc(asString(connectionId));
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('CHANNEL_CONNECTION_NOT_FOUND');
  const data = snapshot.data() || {};
  const branchId = asString(data.branchId);
  if (!canAccessBranch(actor, branchId)) throw new Error('CHANNEL_BRANCH_FORBIDDEN');
  const pageId = asString(data.externalAccountId);
  const token = decryptChannelSecret(data.encryptedPageAccessToken)
    || (pageId === asString(process.env.META_PAGE_ID) ? asString(process.env.META_PAGE_ACCESS_TOKEN) : '');
  try {
    const page = await graphRequest(`${pageId}?fields=id,name`, token);
    if (asString(page.id) !== pageId) throw new Error('META_PAGE_TOKEN_MISMATCH');
    if (subscribe) {
      const params = new URLSearchParams({ subscribed_fields: META_SUBSCRIBED_FIELDS.join(',') });
      await graphRequest(`${pageId}/subscribed_apps?${params}`, token, { method: 'POST' });
    }
    await ref.set({
      displayName: asString(page.name) || data.displayName,
      status: subscribe ? 'READY' : 'VERIFIED',
      lastError: '',
      lastTestedAt: FieldValue.serverTimestamp(),
      ...(subscribe ? { subscribedFields: [...META_SUBSCRIBED_FIELDS], subscribedAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await writeEvent(db, actor, {
      connectionId: ref.id,
      pageId,
      branchId,
      eventType: subscribe ? 'WEBHOOK_SUBSCRIBED' : 'CONNECTION_TESTED'
    });
    return { ...cleanClientConnection(ref.id, (await ref.get()).data()), testOk: true };
  } catch (error: any) {
    await ref.set({
      status: 'ERROR',
      lastError: asString(error?.message),
      lastTestedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    throw error;
  }
}

export async function updateChannelConnection(
  db: Firestore | null,
  connectionId: string,
  input: Record<string, any>,
  actor: ChannelConnectionActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isAdmin(actor)) throw new Error('CHANNEL_CONNECTION_ADMIN_REQUIRED');
  const ref = db.collection('channelConnections').doc(asString(connectionId));
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('CHANNEL_CONNECTION_NOT_FOUND');
  const current = snapshot.data() || {};
  const provider = normalizedProvider(current.provider);
  const branch = input.branchId !== undefined
    ? await activeBranch(db, input.branchId)
    : { id: asString(current.branchId), name: asString(current.branchName) };
  const token = asString(provider === META_PROVIDER ? input.pageAccessToken : input.accessToken);
  const refreshToken = asString(input.refreshToken);
  const appSecret = asString(input.appSecret);
  const webhookSecret = asString(input.webhookSecret);
  const encrypted = token ? encryptChannelSecret(token) : null;
  const now = Date.now();
  const updates: Record<string, any> = {
    ...(input.displayName !== undefined ? { displayName: asString(input.displayName) || current.displayName } : {}),
    ...(input.branchId !== undefined ? { branchId: branch.id, branchName: branch.name } : {}),
    ...(input.historyDays !== undefined ? { historyDays: Math.min(90, Math.max(1, asNumber(input.historyDays, 30))) } : {}),
    ...(input.includeComments !== undefined ? { includeComments: input.includeComments === true } : {}),
    ...(input.active !== undefined ? { active: input.active === true } : {}),
    ...(encrypted ? {
      [provider === META_PROVIDER ? 'encryptedPageAccessToken' : 'encryptedAccessToken']: encrypted,
      tokenFingerprint: tokenFingerprint(token),
      hasToken: true,
      status: 'NOT_TESTED',
      lastError: '',
      ...(provider !== META_PROVIDER ? {
        accessTokenExpiresAt: Timestamp.fromMillis(now + Math.min(
          provider === TIKTOK_PROVIDER ? 7 * 24 * 60 * 60 : 90_000,
          Math.max(300, asNumber(input.expiresIn, provider === TIKTOK_PROVIDER ? 24 * 60 * 60 : 90_000))
        ) * 1000)
      } : {})
    } : {}),
    ...(provider !== META_PROVIDER && refreshToken ? {
      encryptedRefreshToken: encryptChannelSecret(refreshToken),
      hasRefreshToken: true,
      refreshTokenExpiresAt: Timestamp.fromMillis(now + (provider === TIKTOK_PROVIDER ? 365 : 90) * 24 * 60 * 60 * 1000)
    } : {}),
    ...(provider !== META_PROVIDER && asString(input.appId) ? { appId: asString(input.appId) } : {}),
    ...(provider !== META_PROVIDER && appSecret ? { encryptedAppSecret: encryptChannelSecret(appSecret), hasAppSecret: true } : {}),
    ...(provider === ZALO_PROVIDER && webhookSecret ? { encryptedWebhookSecret: encryptChannelSecret(webhookSecret), hasWebhookSecret: true } : {}),
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: actor.uid,
    updatedByName: asString(actor.name) || actor.uid
  };
  const pageId = asString(current.externalAccountId);
  const batch = db.batch();
  batch.set(ref, updates, { merge: true });
  if (input.branchId !== undefined) {
    batch.set(db.collection(mappingCollection(provider)).doc(pageId), {
      ...(provider === ZALO_PROVIDER
        ? { oaId: pageId, oaName: updates.displayName || current.displayName }
        : provider === TIKTOK_PROVIDER
          ? { businessId: pageId, displayName: updates.displayName || current.displayName }
          : { pageId, pageName: updates.displayName || current.displayName }),
      branchId: branch.id,
      branchName: branch.name,
      isActive: true,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  await batch.commit();
  await writeEvent(db, actor, {
    provider,
    connectionId: ref.id,
    pageId,
    branchId: branch.id,
    eventType: 'CONNECTION_UPDATED'
  });
  return cleanClientConnection(ref.id, (await ref.get()).data());
}

export async function disconnectChannelConnection(
  db: Firestore | null,
  connectionId: string,
  actor: ChannelConnectionActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isAdmin(actor)) throw new Error('CHANNEL_CONNECTION_ADMIN_REQUIRED');
  const ref = db.collection('channelConnections').doc(asString(connectionId));
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('CHANNEL_CONNECTION_NOT_FOUND');
  const data = snapshot.data() || {};
  const provider = normalizedProvider(data.provider);
  const pageId = asString(data.externalAccountId);
  const conversations = await db.collection('chatConversations').where('pageId', '==', pageId).limit(1).get();
  if (conversations.empty) await ref.delete();
  else await ref.set({
    active: false,
    status: 'DISCONNECTED',
    disconnectedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: actor.uid
  }, { merge: true });
  await writeEvent(db, actor, {
    provider,
    connectionId: ref.id,
    pageId,
    branchId: asString(data.branchId),
    eventType: conversations.empty ? 'CONNECTION_DELETED' : 'CONNECTION_DISCONNECTED'
  });
  return { connectionId: ref.id, deleted: conversations.empty, disconnected: !conversations.empty };
}

function oauthRedirectUri(originInput: string): string {
  const configured = asString(process.env.META_OAUTH_REDIRECT_URI);
  if (configured) return configured;
  const origin = asString(originInput).replace(/\/$/, '');
  if (!/^https?:\/\//.test(origin)) throw new Error('META_OAUTH_ORIGIN_INVALID');
  return `${origin}/api/channel-connections/meta/oauth/callback`;
}

export async function startMetaOAuth(
  db: Firestore | null,
  actor: ChannelConnectionActor,
  origin: string
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isAdmin(actor)) throw new Error('CHANNEL_CONNECTION_ADMIN_REQUIRED');
  const appId = asString(process.env.META_APP_ID);
  if (!appId || !asString(process.env.META_APP_SECRET)) throw new Error('META_OAUTH_APP_NOT_CONFIGURED');
  const state = crypto.randomBytes(24).toString('hex');
  const redirectUri = oauthRedirectUri(origin);
  await db.collection('channelOAuthStates').doc(state).set({
    id: state,
    provider: META_PROVIDER,
    actorUid: actor.uid,
    actorName: asString(actor.name) || actor.uid,
    origin: asString(origin).replace(/\/$/, ''),
    redirectUri,
    status: 'PENDING',
    expiresAt: Timestamp.fromMillis(Date.now() + OAUTH_STATE_TTL_MS),
    createdAt: FieldValue.serverTimestamp()
  });
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    scope: [
      'public_profile',
      'pages_show_list',
      'pages_manage_metadata',
      'pages_read_engagement',
      'pages_messaging',
      'pages_manage_engagement'
    ].join(',')
  });
  return {
    provider: META_PROVIDER,
    authorizationUrl: `https://www.facebook.com/${configuredGraphVersion()}/dialog/oauth?${params}`,
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString()
  };
}

export async function completeMetaOAuth(
  db: Firestore | null,
  input: { state: string; code: string }
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const stateRef = db.collection('channelOAuthStates').doc(asString(input.state));
  const stateSnapshot = await stateRef.get();
  if (!stateSnapshot.exists) throw new Error('META_OAUTH_STATE_INVALID');
  const state = stateSnapshot.data() || {};
  if (state.status !== 'PENDING') throw new Error('META_OAUTH_STATE_USED');
  if (state.expiresAt?.toMillis?.() < Date.now()) throw new Error('META_OAUTH_STATE_EXPIRED');
  const appId = asString(process.env.META_APP_ID);
  const appSecret = asString(process.env.META_APP_SECRET);
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: asString(state.redirectUri),
    code: asString(input.code)
  });
  const tokenPayload = await fetch(`https://graph.facebook.com/${configuredGraphVersion()}/oauth/access_token?${params}`)
    .then(async response => {
      const payload = await response.json().catch(() => ({})) as Record<string, any>;
      if (!response.ok || payload.error) {
        const error = asObject(payload.error);
        throw new Error(`META_OAUTH_EXCHANGE_FAILED: ${asString(error.message) || response.status}`);
      }
      return payload;
    });
  const shortLivedUserToken = asString(tokenPayload.access_token);
  let userToken = shortLivedUserToken;
  if (shortLivedUserToken) {
    const longLivedParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedUserToken
    });
    try {
      const longLivedResponse = await fetch(`https://graph.facebook.com/${configuredGraphVersion()}/oauth/access_token?${longLivedParams}`);
      const longLivedPayload = await longLivedResponse.json().catch(() => ({})) as Record<string, any>;
      if (longLivedResponse.ok && asString(longLivedPayload.access_token)) {
        userToken = asString(longLivedPayload.access_token);
      }
    } catch {
      // Page import can still continue with the valid short-lived user token.
    }
  }
  const accountsPayload = await graphRequest('me/accounts?fields=id,name,access_token,tasks&limit=100', userToken);
  const pages = (Array.isArray(accountsPayload.data) ? accountsPayload.data : [])
    .map(asObject)
    .filter(page => asString(page.id) && asString(page.access_token))
    .map(page => ({
      pageId: asString(page.id),
      pageName: asString(page.name) || `Facebook Page ${asString(page.id)}`,
      tasks: Array.isArray(page.tasks) ? page.tasks.map(asString).filter(Boolean) : [],
      encryptedPageAccessToken: encryptChannelSecret(page.access_token),
      tokenFingerprint: tokenFingerprint(asString(page.access_token))
    }));
  if (!pages.length) throw new Error('META_OAUTH_NO_PAGES');
  const sessionId = `META_OAUTH_${crypto.randomBytes(16).toString('hex')}`;
  const batch = db.batch();
  batch.set(db.collection('channelOAuthSessions').doc(sessionId), {
    id: sessionId,
    provider: META_PROVIDER,
    actorUid: asString(state.actorUid),
    actorName: asString(state.actorName),
    pages,
    status: 'READY',
    expiresAt: Timestamp.fromMillis(Date.now() + OAUTH_SESSION_TTL_MS),
    createdAt: FieldValue.serverTimestamp()
  });
  batch.set(stateRef, {
    status: 'COMPLETED',
    sessionId,
    completedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();
  return { sessionId, origin: asString(state.origin), pageCount: pages.length };
}

export async function getMetaOAuthSession(
  db: Firestore | null,
  sessionId: string,
  actor: ChannelConnectionActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isAdmin(actor)) throw new Error('CHANNEL_CONNECTION_ADMIN_REQUIRED');
  const snapshot = await db.collection('channelOAuthSessions').doc(asString(sessionId)).get();
  if (!snapshot.exists) throw new Error('META_OAUTH_SESSION_NOT_FOUND');
  const data = snapshot.data() || {};
  if (asString(data.actorUid) !== actor.uid) throw new Error('META_OAUTH_SESSION_FORBIDDEN');
  if (data.expiresAt?.toMillis?.() < Date.now()) throw new Error('META_OAUTH_SESSION_EXPIRED');
  return {
    id: snapshot.id,
    status: asString(data.status),
    pages: (Array.isArray(data.pages) ? data.pages : []).map(pageInput => {
      const page = asObject(pageInput);
      return {
        pageId: asString(page.pageId),
        pageName: asString(page.pageName),
        tasks: Array.isArray(page.tasks) ? page.tasks : []
      };
    })
  };
}

export async function importMetaOAuthPages(
  db: Firestore | null,
  sessionId: string,
  selectionsInput: unknown,
  actor: ChannelConnectionActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isAdmin(actor)) throw new Error('CHANNEL_CONNECTION_ADMIN_REQUIRED');
  const selections = (Array.isArray(selectionsInput) ? selectionsInput : []).map(asObject);
  if (!selections.length) throw new Error('META_OAUTH_PAGE_SELECTION_REQUIRED');
  const sessionRef = db.collection('channelOAuthSessions').doc(asString(sessionId));
  const sessionSnapshot = await sessionRef.get();
  if (!sessionSnapshot.exists) throw new Error('META_OAUTH_SESSION_NOT_FOUND');
  const session = sessionSnapshot.data() || {};
  if (asString(session.actorUid) !== actor.uid) throw new Error('META_OAUTH_SESSION_FORBIDDEN');
  if (session.status === 'IMPORTED') {
    const importedPageIds = Array.isArray(session.importedPageIds) ? session.importedPageIds.map(asString).filter(Boolean) : [];
    return { imported: importedPageIds.length, pageIds: importedPageIds, subscribed: 0, failedSubscriptions: 0, idempotentReplay: true };
  }
  if (session.expiresAt?.toMillis?.() < Date.now()) throw new Error('META_OAUTH_SESSION_EXPIRED');
  const pages = new Map((Array.isArray(session.pages) ? session.pages : []).map(pageInput => {
    const page = asObject(pageInput);
    return [asString(page.pageId), page];
  }));
  const normalized = [];
  for (const selection of selections) {
    const pageId = asString(selection.pageId);
    const page = pages.get(pageId);
    if (!page) throw new Error('META_OAUTH_PAGE_NOT_IN_SESSION');
    const branch = await activeBranch(db, selection.branchId);
    normalized.push({ pageId, page, branch, selection });
  }
  const batch = db.batch();
  for (const item of normalized) {
    const ref = db.collection('channelConnections').doc(metaConnectionDocumentId(item.pageId));
    batch.set(ref, {
      id: ref.id,
      provider: META_PROVIDER,
      externalAccountId: item.pageId,
      displayName: asString(item.page.pageName),
      branchId: item.branch.id,
      branchName: item.branch.name,
      active: true,
      status: 'NOT_TESTED',
      hasToken: true,
      encryptedPageAccessToken: item.page.encryptedPageAccessToken,
      tokenFingerprint: item.page.tokenFingerprint,
      grantedTasks: Array.isArray(item.page.tasks) ? item.page.tasks : [],
      historyDays: Math.min(90, Math.max(1, asNumber(item.selection.historyDays, 30))),
      includeComments: item.selection.includeComments !== false,
      source: 'META_OAUTH',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: asString(actor.name) || actor.uid
    }, { merge: true });
    batch.set(db.collection('metaPageMappings').doc(item.pageId), {
      pageId: item.pageId,
      pageName: asString(item.page.pageName),
      branchId: item.branch.id,
      branchName: item.branch.name,
      isActive: true,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    const eventRef = db.collection('channelConnectionEvents').doc();
    batch.set(eventRef, {
      id: eventRef.id,
      provider: META_PROVIDER,
      connectionId: metaConnectionDocumentId(item.pageId),
      pageId: item.pageId,
      branchId: item.branch.id,
      eventType: 'CONNECTION_IMPORTED',
      actorUid: actor.uid,
      actorName: asString(actor.name) || actor.uid,
      occurredAt: FieldValue.serverTimestamp()
    });
  }
  batch.set(sessionRef, {
    status: 'IMPORTED',
    importedPageIds: normalized.map(item => item.pageId),
    importedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();
  const subscriptionResults = await Promise.allSettled(normalized.map(async item => {
    const token = decryptChannelSecret(item.page.encryptedPageAccessToken);
    const params = new URLSearchParams({ subscribed_fields: META_SUBSCRIBED_FIELDS.join(',') });
    await graphRequest(`${item.pageId}/subscribed_apps?${params}`, token, { method: 'POST' });
    await db.collection('channelConnections').doc(metaConnectionDocumentId(item.pageId)).set({
      status: 'READY',
      subscribedFields: [...META_SUBSCRIBED_FIELDS],
      subscribedAt: FieldValue.serverTimestamp(),
      lastError: '',
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }));
  await Promise.all(subscriptionResults.map(async (result, index) => {
    if (result.status !== 'rejected') return;
    const item = normalized[index];
    await db.collection('channelConnections').doc(metaConnectionDocumentId(item.pageId)).set({
      status: 'ERROR',
      lastError: asString(result.reason?.message || result.reason),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }));
  const subscribed = subscriptionResults.filter(result => result.status === 'fulfilled').length;
  return {
    imported: normalized.length,
    pageIds: normalized.map(item => item.pageId),
    subscribed,
    failedSubscriptions: normalized.length - subscribed,
    idempotentReplay: false
  };
}

function tiktokOAuthRedirectUri(originInput: string): string {
  const configured = asString(process.env.TIKTOK_OAUTH_REDIRECT_URI);
  if (configured) return configured;
  const origin = asString(originInput).replace(/\/$/, '');
  if (!/^https?:\/\//.test(origin)) throw new Error('TIKTOK_OAUTH_ORIGIN_INVALID');
  return `${origin}/api/channel-connections/tiktok/oauth/callback`;
}

async function tiktokTokenRequest(payload: Record<string, any>) {
  const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({})) as Record<string, any>;
  const code = asNumber(body.code, response.ok ? 0 : response.status);
  if (!response.ok || code !== 0) {
    throw new Error(`TIKTOK_OAUTH_EXCHANGE_FAILED_${code || response.status}: ${asString(body.message) || 'TikTok từ chối cấp token.'}`);
  }
  return asObject(body.data);
}

export async function startTikTokOAuth(
  db: Firestore | null,
  actor: ChannelConnectionActor,
  origin: string
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isAdmin(actor)) throw new Error('CHANNEL_CONNECTION_ADMIN_REQUIRED');
  const appId = asString(process.env.TIKTOK_APP_ID);
  const appSecret = asString(process.env.TIKTOK_APP_SECRET);
  const configuredAuthorizationUrl = asString(process.env.TIKTOK_AUTHORIZATION_URL);
  if (!appId || !appSecret || !configuredAuthorizationUrl) throw new Error('TIKTOK_OAUTH_APP_NOT_CONFIGURED');
  let authorizationUrl: URL;
  try {
    authorizationUrl = new URL(configuredAuthorizationUrl);
  } catch {
    throw new Error('TIKTOK_AUTHORIZATION_URL_INVALID');
  }
  if (authorizationUrl.protocol !== 'https:') throw new Error('TIKTOK_AUTHORIZATION_URL_INVALID');
  const state = crypto.randomBytes(24).toString('hex');
  const redirectUri = tiktokOAuthRedirectUri(origin);
  await db.collection('channelOAuthStates').doc(state).set({
    id: state,
    provider: TIKTOK_PROVIDER,
    actorUid: actor.uid,
    actorName: asString(actor.name) || actor.uid,
    origin: asString(origin).replace(/\/$/, ''),
    redirectUri,
    status: 'PENDING',
    expiresAt: Timestamp.fromMillis(Date.now() + OAUTH_STATE_TTL_MS),
    createdAt: FieldValue.serverTimestamp()
  });
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('disable_auto_auth', '1');
  return {
    provider: TIKTOK_PROVIDER,
    authorizationUrl: authorizationUrl.toString(),
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString()
  };
}

export async function completeTikTokOAuth(
  db: Firestore | null,
  input: { state: string; code: string }
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const stateRef = db.collection('channelOAuthStates').doc(asString(input.state));
  const stateSnapshot = await stateRef.get();
  if (!stateSnapshot.exists) throw new Error('TIKTOK_OAUTH_STATE_INVALID');
  const state = stateSnapshot.data() || {};
  if (asString(state.provider) !== TIKTOK_PROVIDER) throw new Error('TIKTOK_OAUTH_STATE_INVALID');
  if (state.status !== 'PENDING') throw new Error('TIKTOK_OAUTH_STATE_USED');
  if (state.expiresAt?.toMillis?.() < Date.now()) throw new Error('TIKTOK_OAUTH_STATE_EXPIRED');
  const appId = asString(process.env.TIKTOK_APP_ID);
  const appSecret = asString(process.env.TIKTOK_APP_SECRET);
  const authCode = asString(input.code);
  if (!authCode) throw new Error('TIKTOK_OAUTH_CODE_REQUIRED');
  const token = await tiktokTokenRequest({
    client_id: appId,
    client_secret: appSecret,
    grant_type: 'authorization_code',
    auth_code: authCode,
    redirect_uri: asString(state.redirectUri)
  });
  const businessId = asString(token.open_id || token.business_id);
  const accessToken = asString(token.access_token);
  if (!businessId || !accessToken) throw new Error('TIKTOK_OAUTH_TOKEN_RESPONSE_INVALID');
  const sessionId = `TIKTOK_OAUTH_${crypto.randomBytes(16).toString('hex')}`;
  const batch = db.batch();
  batch.set(db.collection('channelOAuthSessions').doc(sessionId), {
    id: sessionId,
    provider: TIKTOK_PROVIDER,
    actorUid: asString(state.actorUid),
    actorName: asString(state.actorName),
    businessId,
    displayName: `TikTok Business ${businessId}`,
    encryptedAccessToken: encryptChannelSecret(accessToken),
    encryptedRefreshToken: encryptChannelSecret(token.refresh_token),
    tokenFingerprint: tokenFingerprint(accessToken),
    scope: Array.isArray(token.scope) ? token.scope.map(asString).filter(Boolean) : asString(token.scope).split(',').map(value => value.trim()).filter(Boolean),
    accessTokenExpiresIn: Math.max(300, asNumber(token.expires_in, 24 * 60 * 60)),
    refreshTokenExpiresIn: Math.max(24 * 60 * 60, asNumber(token.refresh_token_expires_in, 365 * 24 * 60 * 60)),
    status: 'READY',
    expiresAt: Timestamp.fromMillis(Date.now() + OAUTH_SESSION_TTL_MS),
    createdAt: FieldValue.serverTimestamp()
  });
  batch.set(stateRef, { status: 'COMPLETED', sessionId, completedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  return { sessionId, origin: asString(state.origin), businessId };
}

export async function getTikTokOAuthSession(
  db: Firestore | null,
  sessionId: string,
  actor: ChannelConnectionActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isAdmin(actor)) throw new Error('CHANNEL_CONNECTION_ADMIN_REQUIRED');
  const snapshot = await db.collection('channelOAuthSessions').doc(asString(sessionId)).get();
  if (!snapshot.exists) throw new Error('TIKTOK_OAUTH_SESSION_NOT_FOUND');
  const data = snapshot.data() || {};
  if (asString(data.provider) !== TIKTOK_PROVIDER) throw new Error('TIKTOK_OAUTH_SESSION_NOT_FOUND');
  if (asString(data.actorUid) !== actor.uid) throw new Error('TIKTOK_OAUTH_SESSION_FORBIDDEN');
  if (data.expiresAt?.toMillis?.() < Date.now()) throw new Error('TIKTOK_OAUTH_SESSION_EXPIRED');
  return {
    id: snapshot.id,
    status: asString(data.status),
    businessId: asString(data.businessId),
    displayName: asString(data.displayName),
    scope: Array.isArray(data.scope) ? data.scope : []
  };
}

export async function importTikTokOAuthAccount(
  db: Firestore | null,
  sessionId: string,
  input: Record<string, any>,
  actor: ChannelConnectionActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isAdmin(actor)) throw new Error('CHANNEL_CONNECTION_ADMIN_REQUIRED');
  const sessionRef = db.collection('channelOAuthSessions').doc(asString(sessionId));
  const sessionSnapshot = await sessionRef.get();
  if (!sessionSnapshot.exists) throw new Error('TIKTOK_OAUTH_SESSION_NOT_FOUND');
  const session = sessionSnapshot.data() || {};
  if (asString(session.provider) !== TIKTOK_PROVIDER) throw new Error('TIKTOK_OAUTH_SESSION_NOT_FOUND');
  if (asString(session.actorUid) !== actor.uid) throw new Error('TIKTOK_OAUTH_SESSION_FORBIDDEN');
  if (session.status === 'IMPORTED') {
    return { imported: 1, businessId: asString(session.businessId), idempotentReplay: true };
  }
  if (session.expiresAt?.toMillis?.() < Date.now()) throw new Error('TIKTOK_OAUTH_SESSION_EXPIRED');
  const branch = await activeBranch(db, input.branchId);
  const businessId = asString(session.businessId);
  const ref = db.collection('channelConnections').doc(tiktokConnectionDocumentId(businessId));
  const now = Date.now();
  const batch = db.batch();
  batch.set(ref, {
    id: ref.id,
    provider: TIKTOK_PROVIDER,
    externalAccountId: businessId,
    displayName: asString(input.displayName) || asString(session.displayName) || `TikTok Business ${businessId}`,
    branchId: branch.id,
    branchName: branch.name,
    appId: asString(process.env.TIKTOK_APP_ID),
    encryptedAppSecret: encryptChannelSecret(process.env.TIKTOK_APP_SECRET),
    hasAppSecret: Boolean(asString(process.env.TIKTOK_APP_SECRET)),
    encryptedAccessToken: session.encryptedAccessToken,
    encryptedRefreshToken: session.encryptedRefreshToken,
    tokenFingerprint: asString(session.tokenFingerprint),
    hasToken: true,
    hasRefreshToken: Boolean(session.encryptedRefreshToken),
    scope: Array.isArray(session.scope) ? session.scope : [],
    accessTokenExpiresAt: Timestamp.fromMillis(now + asNumber(session.accessTokenExpiresIn, 24 * 60 * 60) * 1000),
    refreshTokenExpiresAt: Timestamp.fromMillis(now + asNumber(session.refreshTokenExpiresIn, 365 * 24 * 60 * 60) * 1000),
    historyDays: Math.min(90, Math.max(1, asNumber(input.historyDays, 30))),
    includeComments: false,
    active: true,
    status: 'NOT_TESTED',
    source: 'TIKTOK_OAUTH',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: actor.uid,
    updatedByName: asString(actor.name) || actor.uid
  }, { merge: true });
  batch.set(db.collection('tiktokBusinessMappings').doc(businessId), {
    businessId,
    displayName: asString(input.displayName) || asString(session.displayName) || `TikTok Business ${businessId}`,
    branchId: branch.id,
    branchName: branch.name,
    isActive: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  const eventRef = db.collection('channelConnectionEvents').doc();
  batch.set(eventRef, {
    id: eventRef.id,
    provider: TIKTOK_PROVIDER,
    connectionId: ref.id,
    pageId: businessId,
    branchId: branch.id,
    eventType: 'CONNECTION_IMPORTED',
    actorUid: actor.uid,
    actorName: asString(actor.name) || actor.uid,
    occurredAt: FieldValue.serverTimestamp()
  });
  batch.set(sessionRef, { status: 'IMPORTED', importedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  return { imported: 1, businessId, idempotentReplay: false };
}

export async function listChannelConnectionEvents(
  db: Firestore | null,
  actor: ChannelConnectionActor,
  connectionId = ''
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isManager(actor)) throw new Error('CHANNEL_CONNECTIONS_FORBIDDEN');
  const snapshot = await db.collection('channelConnectionEvents').orderBy('occurredAt', 'desc').limit(200).get();
  return snapshot.docs
    .map(document => ({ id: document.id, ...document.data() } as Record<string, any>))
    .filter(event => !connectionId || asString(event.connectionId) === connectionId)
    .filter(event => canAccessBranch(actor, asString(event.branchId)))
    .slice(0, 100);
}

export async function recordChannelWebhookHealth(
  db: Firestore,
  pageId: string,
  eventType: string
) {
  const ref = db.collection('channelConnections').doc(metaConnectionDocumentId(pageId));
  const snapshot = await ref.get();
  if (!snapshot.exists) return;
  await ref.set({
    webhookStatus: 'RECEIVING',
    lastWebhookAt: FieldValue.serverTimestamp(),
    lastWebhookEvent: asString(eventType),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}
