import { createHash, timingSafeEqual } from 'crypto';
import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import {
  ChannelConnectionActor,
  ZALO_PROVIDER,
  decryptChannelSecret,
  encryptChannelSecret,
  getStoredZaloOaConnection,
  listChatChannelConnections,
  zaloConnectionDocumentId
} from './channelConnectionService';

export type ZaloOaActor = ChannelConnectionActor;

export interface NormalizedZaloMessage {
  oaId: string;
  customerId: string;
  externalConversationId: string;
  externalMessageId: string;
  sender: 'CUSTOMER' | 'STAFF';
  senderName: string;
  customerName: string;
  content: string;
  timestamp: string;
  attachments: string[];
  rawKind: string;
}

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

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  const object = asObject(value);
  if (typeof object.toMillis === 'function') return asNumber(object.toMillis());
  const seconds = asNumber(object.seconds ?? object._seconds);
  if (seconds > 0) return seconds * 1000;
  const numeric = asNumber(value);
  if (numeric > 0) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(asString(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIso(value: unknown): string {
  const millis = toMillis(value) || Date.now();
  return new Date(millis).toISOString();
}

function safeTimestamp(value: unknown): Timestamp {
  return Timestamp.fromMillis(toMillis(value) || Date.now());
}

function hashId(prefix: string, ...parts: string[]): string {
  return `${prefix}_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40)}`;
}

function canAccessBranch(actor: ZaloOaActor, branchId: string): boolean {
  if (asString(actor.role).toUpperCase() === 'ADMIN') return true;
  return [actor.branchId, ...(actor.assignedBranchIds || [])].filter(Boolean).includes(branchId);
}

function assertBranchAccess(actor: ZaloOaActor, branchId: string) {
  if (!canAccessBranch(actor, branchId)) throw new Error('ZALO_BRANCH_FORBIDDEN');
}

function isAdmin(actor: ZaloOaActor): boolean {
  return asString(actor.role).toUpperCase() === 'ADMIN';
}

export function zaloConversationDocumentId(oaId: string, customerId: string): string {
  return hashId('ZALO_CONV', oaId, customerId);
}

export function zaloMessageDocumentId(oaId: string, messageId: string): string {
  return hashId('ZALO_MSG', oaId, messageId);
}

export function extractZaloOaId(payloadInput: unknown): string {
  const payload = asObject(payloadInput);
  const eventName = asString(payload.event_name).toLowerCase();
  if (asString(payload.oa_id)) return asString(payload.oa_id);
  return eventName.startsWith('user_')
    ? asString(asObject(payload.recipient).id)
    : asString(asObject(payload.sender).id);
}

export function verifyZaloWebhookSignature(
  rawBody: Buffer,
  payloadInput: unknown,
  signatureHeader: unknown,
  webhookSecretInput: unknown
): boolean {
  const payload = asObject(payloadInput);
  const appId = asString(payload.app_id);
  const timestamp = asString(payload.timestamp);
  const secret = asString(webhookSecretInput);
  const signature = asString(Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader)
    .replace(/^mac\s*=\s*/i, '')
    .toLowerCase();
  if (!rawBody.length || !appId || !timestamp || !secret || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHash('sha256')
    .update(`${appId}${rawBody.toString('utf8')}${timestamp}${secret}`, 'utf8')
    .digest('hex');
  const left = Buffer.from(signature, 'hex');
  const right = Buffer.from(expected, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function attachmentUrls(messageInput: unknown): string[] {
  const message = asObject(messageInput);
  const values = new Set<string>();
  for (const attachmentInput of Array.isArray(message.attachments) ? message.attachments : []) {
    const attachment = asObject(attachmentInput);
    const payload = asObject(attachment.payload);
    [payload.url, payload.thumbnail, payload.link_url, attachment.url, attachment.thumbnail]
      .map(asString)
      .filter(value => /^https?:\/\//i.test(value))
      .forEach(value => values.add(value));
  }
  return [...values];
}

function attachmentLabel(eventName: string): string {
  if (eventName.includes('image') || eventName.includes('gif')) return 'Đã gửi hình ảnh';
  if (eventName.includes('video')) return 'Đã gửi video';
  if (eventName.includes('audio')) return 'Đã gửi âm thanh';
  if (eventName.includes('file')) return 'Đã gửi tệp đính kèm';
  if (eventName.includes('sticker')) return 'Đã gửi nhãn dán';
  return 'Tin nhắn Zalo';
}

export function normalizeZaloWebhookMessage(payloadInput: unknown): NormalizedZaloMessage | null {
  const payload = asObject(payloadInput);
  const eventName = asString(payload.event_name).toLowerCase();
  if (!eventName.startsWith('user_send_') && !eventName.startsWith('oa_send_')) return null;
  const oaId = extractZaloOaId(payload);
  const outbound = eventName.startsWith('oa_send_');
  const customerId = outbound
    ? asString(asObject(payload.recipient).id)
    : asString(asObject(payload.sender).id);
  if (!oaId || !customerId || customerId === oaId) return null;
  const message = asObject(payload.message);
  const attachments = attachmentUrls(message);
  const timestamp = toIso(payload.timestamp);
  const content = asString(message.text) || attachmentLabel(eventName);
  const externalMessageId = asString(message.msg_id || message.message_id)
    || hashId('ZALO_EVT', oaId, customerId, timestamp, eventName, content, JSON.stringify(attachments));
  return {
    oaId,
    customerId,
    externalConversationId: asString(message.conversation_id) || customerId,
    externalMessageId,
    sender: outbound ? 'STAFF' : 'CUSTOMER',
    senderName: outbound ? 'PhoneHouse' : 'Khách Zalo',
    customerName: asString(asObject(payload.sender).display_name) || 'Khách Zalo',
    content,
    timestamp,
    attachments,
    rawKind: eventName
  };
}

async function zaloApiRequest(
  accessToken: string,
  pathOrUrl: string,
  init: RequestInit = {}
): Promise<Record<string, any>> {
  if (!accessToken) throw new Error('ZALO_ACCESS_TOKEN_REQUIRED');
  const url = pathOrUrl.startsWith('https://openapi.zalo.me/')
    ? pathOrUrl
    : `https://openapi.zalo.me/${pathOrUrl.replace(/^\//, '')}`;
  if (!url.startsWith('https://openapi.zalo.me/')) throw new Error('ZALO_API_URL_INVALID');
  const response = await fetch(url, {
    ...init,
    headers: {
      access_token: accessToken,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  const errorCode = asNumber(payload.error, response.ok ? 0 : response.status);
  if (!response.ok || errorCode !== 0) {
    throw new Error(`ZALO_API_FAILED_${errorCode || response.status}: ${asString(payload.message) || 'Zalo từ chối yêu cầu.'}`);
  }
  return payload;
}

export async function ensureZaloAccessToken(db: Firestore, oaId: string, forceRefresh = false): Promise<string> {
  let connection = await getStoredZaloOaConnection(db, oaId);
  if (!connection) throw new Error('ZALO_CONNECTION_NOT_FOUND');
  const now = Date.now();
  if (!forceRefresh && connection.accessToken && (!connection.accessTokenExpiresAt || connection.accessTokenExpiresAt > now + 5 * 60 * 1000)) {
    return connection.accessToken;
  }
  if (!connection.refreshToken) throw new Error('ZALO_REFRESH_TOKEN_REQUIRED');
  if (!connection.appId || !connection.appSecret) throw new Error('ZALO_APP_CREDENTIALS_NOT_CONFIGURED');
  if (connection.refreshTokenExpiresAt && connection.refreshTokenExpiresAt <= now) throw new Error('ZALO_REFRESH_TOKEN_EXPIRED');

  const ref = db.collection('channelConnections').doc(zaloConnectionDocumentId(oaId));
  let claimed = false;
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error('ZALO_CONNECTION_NOT_FOUND');
    const data = snapshot.data() || {};
    const expiresAt = toMillis(data.accessTokenExpiresAt);
    if (!forceRefresh && expiresAt > Date.now() + 5 * 60 * 1000) return;
    const leaseUntil = toMillis(data.refreshLeaseUntil);
    if (leaseUntil > Date.now()) throw new Error('ZALO_TOKEN_REFRESH_IN_PROGRESS');
    transaction.set(ref, {
      refreshLeaseUntil: Timestamp.fromMillis(Date.now() + 30_000),
      refreshLeaseId: hashId('ZALO_REFRESH', oaId, String(Date.now())),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    claimed = true;
  });
  if (!claimed) {
    connection = await getStoredZaloOaConnection(db, oaId);
    if (connection?.accessToken) return connection.accessToken;
    throw new Error('ZALO_ACCESS_TOKEN_REQUIRED');
  }

  try {
    const body = new URLSearchParams({
      refresh_token: connection.refreshToken,
      app_id: connection.appId,
      grant_type: 'refresh_token'
    });
    const response = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        secret_key: connection.appSecret
      },
      body
    });
    const payload = await response.json().catch(() => ({})) as Record<string, any>;
    const accessToken = asString(payload.access_token);
    const refreshToken = asString(payload.refresh_token);
    if (!response.ok || !accessToken || !refreshToken) {
      throw new Error(`ZALO_TOKEN_REFRESH_FAILED: ${asString(payload.error_name || payload.message || payload.error) || response.status}`);
    }
    const expiresIn = Math.min(90_000, Math.max(300, asNumber(payload.expires_in ?? payload.expire_in, 90_000)));
    await ref.set({
      encryptedAccessToken: encryptChannelSecret(accessToken),
      encryptedRefreshToken: encryptChannelSecret(refreshToken),
      hasToken: true,
      hasRefreshToken: true,
      tokenFingerprint: createHash('sha256').update(accessToken).digest('hex').slice(0, 12),
      accessTokenExpiresAt: Timestamp.fromMillis(Date.now() + expiresIn * 1000),
      refreshTokenExpiresAt: Timestamp.fromMillis(Date.now() + 90 * 24 * 60 * 60 * 1000),
      refreshLeaseUntil: Timestamp.fromMillis(0),
      lastTokenRefreshAt: FieldValue.serverTimestamp(),
      status: 'READY',
      lastError: '',
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return accessToken;
  } catch (error: any) {
    await ref.set({
      refreshLeaseUntil: Timestamp.fromMillis(0),
      status: 'ERROR',
      lastError: asString(error?.message),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    throw error;
  }
}

function isExpiredAccessTokenError(error: unknown): boolean {
  const message = asString((error as any)?.message);
  return message.includes('ZALO_API_FAILED_-216') || message.includes('ZALO_API_FAILED_-220') || message.includes('ZALO_API_FAILED_-124');
}

async function withFreshZaloToken<T>(
  db: Firestore,
  oaId: string,
  work: (accessToken: string) => Promise<T>
): Promise<T> {
  const token = await ensureZaloAccessToken(db, oaId);
  try {
    return await work(token);
  } catch (error) {
    if (!isExpiredAccessTokenError(error)) throw error;
    const refreshed = await ensureZaloAccessToken(db, oaId, true);
    return work(refreshed);
  }
}

function messageDocument(message: NormalizedZaloMessage, branch: { id: string; name: string }, conversationId: string) {
  const id = zaloMessageDocumentId(message.oaId, message.externalMessageId);
  return {
    id,
    provider: ZALO_PROVIDER,
    conversationId,
    externalConversationId: message.externalConversationId,
    externalMessageId: message.externalMessageId,
    customerPsid: message.customerId,
    pageId: message.oaId,
    branchId: branch.id,
    sender: message.sender,
    senderName: message.senderName,
    content: message.content,
    timestamp: safeTimestamp(message.timestamp),
    timestampIso: message.timestamp,
    attachments: message.attachments,
    messageKind: 'MESSAGE',
    zaloEventKind: message.rawKind,
    createdAt: FieldValue.serverTimestamp()
  };
}

async function persistZaloMessage(
  db: Firestore,
  connection: NonNullable<Awaited<ReturnType<typeof getStoredZaloOaConnection>>>,
  message: NormalizedZaloMessage
) {
  const conversationId = zaloConversationDocumentId(message.oaId, message.customerId);
  const messageId = zaloMessageDocumentId(message.oaId, message.externalMessageId);
  const conversationRef = db.collection('chatConversations').doc(conversationId);
  const messageRef = db.collection('chatMessages').doc(messageId);
  return db.runTransaction(async transaction => {
    const [conversationSnapshot, existingMessageSnapshot] = await Promise.all([
      transaction.get(conversationRef),
      transaction.get(messageRef)
    ]);
    if (existingMessageSnapshot.exists) return { conversationId, messageId, duplicate: true };
    const existing = conversationSnapshot.data() || {};
    const inbound = message.sender === 'CUSTOMER';
    const eventMillis = safeTimestamp(message.timestamp).toMillis();
    const lastMillis = toMillis(existing.lastMessageTime || existing.updatedAt);
    const isLatest = eventMillis >= lastMillis;
    const updates: Record<string, any> = {
      id: conversationId,
      provider: ZALO_PROVIDER,
      pageId: message.oaId,
      pageName: connection.oaName,
      externalConversationId: message.externalConversationId,
      customerPsid: message.customerId,
      branchId: connection.branchId,
      branchName: connection.branchName,
      channel: 'ZALO',
      conversationType: 'INBOX',
      customerName: asString(existing.customerName) || message.customerName,
      customerPhone: asString(existing.customerPhone),
      createdAt: existing.createdAt || safeTimestamp(message.timestamp),
      lastSyncedAt: FieldValue.serverTimestamp(),
      lastZaloWebhookAt: FieldValue.serverTimestamp()
    };
    if (isLatest) {
      updates.lastMessageSnippet = message.content;
      updates.lastMessageTime = message.timestamp;
      updates.updatedAt = safeTimestamp(message.timestamp);
      updates.awaitingStaffReply = inbound;
      updates.workflowStatus = inbound
        ? (['WON', 'LOST', 'CLOSED'].includes(asString(existing.workflowStatus).toUpperCase()) ? 'OPEN' : asString(existing.workflowStatus) || 'NEW')
        : asString(existing.workflowStatus) || 'OPEN';
      updates.unreadCount = inbound ? Math.max(0, asNumber(existing.unreadCount)) + 1 : Math.max(0, asNumber(existing.unreadCount));
      if (inbound) {
        updates.lastCustomerMessageAt = safeTimestamp(message.timestamp);
        if (!existing.firstCustomerMessageAt) updates.firstCustomerMessageAt = safeTimestamp(message.timestamp);
      } else {
        updates.lastStaffMessageAt = safeTimestamp(message.timestamp);
      }
    }
    transaction.set(conversationRef, updates, { merge: true });
    transaction.create(messageRef, messageDocument(message, {
      id: connection.branchId,
      name: connection.branchName
    }, conversationId));
    return { conversationId, messageId, duplicate: false };
  });
}

export async function processZaloOaWebhook(db: Firestore | null, payloadInput: unknown) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const message = normalizeZaloWebhookMessage(payloadInput);
  if (!message) return { accepted: true, ignored: true, processed: 0, duplicates: 0 };
  const connection = await getStoredZaloOaConnection(db, message.oaId);
  if (!connection) throw new Error('ZALO_CONNECTION_NOT_FOUND');
  const result = await persistZaloMessage(db, connection, message);
  const batch = db.batch();
  batch.set(db.collection('channelConnections').doc(connection.id), {
    webhookStatus: 'RECEIVING',
    lastWebhookAt: FieldValue.serverTimestamp(),
    lastWebhookEvent: message.rawKind,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  batch.set(db.collection('zaloOaMappings').doc(message.oaId), {
    oaId: message.oaId,
    oaName: connection.oaName,
    branchId: connection.branchId,
    branchName: connection.branchName,
    isActive: true,
    lastWebhookAt: FieldValue.serverTimestamp(),
    lastWebhookEvent: message.rawKind,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();
  return {
    accepted: true,
    ignored: false,
    processed: result.duplicate ? 0 : 1,
    duplicates: result.duplicate ? 1 : 0
  };
}

export async function testZaloConnection(
  db: Firestore | null,
  connectionId: string,
  actor: ZaloOaActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isAdmin(actor)) throw new Error('CHANNEL_CONNECTION_ADMIN_REQUIRED');
  const ref = db.collection('channelConnections').doc(asString(connectionId));
  const snapshot = await ref.get();
  if (!snapshot.exists || asString(snapshot.data()?.provider) !== ZALO_PROVIDER) throw new Error('ZALO_CONNECTION_NOT_FOUND');
  const data = snapshot.data() || {};
  assertBranchAccess(actor, asString(data.branchId));
  const oaId = asString(data.externalAccountId);
  try {
    const payload = await withFreshZaloToken(db, oaId, token => zaloApiRequest(token, 'v2.0/oa/getoa'));
    const oa = asObject(payload.data);
    const apiOaId = asString(oa.oaid || oa.oa_id || oa.id);
    if (apiOaId && apiOaId !== oaId) throw new Error('ZALO_OA_TOKEN_MISMATCH');
    await ref.set({
      displayName: asString(oa.name) || data.displayName,
      status: 'READY',
      lastError: '',
      lastTestedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { id: ref.id, provider: ZALO_PROVIDER, externalAccountId: oaId, displayName: asString(oa.name) || data.displayName, testOk: true };
  } catch (error: any) {
    await ref.set({ status: 'ERROR', lastError: asString(error?.message), lastTestedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw error;
  }
}

export async function getZaloOaChannels(db: Firestore | null, actor: ZaloOaActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const connections = (await listChatChannelConnections(db, actor))
    .filter(connection => connection.provider === ZALO_PROVIDER && connection.active !== false);
  return connections.map(connection => {
    const error = connection.status === 'ERROR' ? connection.lastError || 'ZALO_CONNECTION_ERROR' : '';
    return {
      provider: ZALO_PROVIDER as 'ZALO_OA',
      connectionId: connection.id,
      pageId: connection.externalAccountId,
      pageName: connection.displayName,
      branchId: connection.branchId,
      branchName: connection.branchName,
      historyDays: connection.historyDays,
      includeComments: false,
      status: error ? 'CONFIG_ERROR' as const : connection.hasToken ? 'READY' as const : 'MISSING_TOKEN' as const,
      webhookStatus: connection.webhookStatus === 'RECEIVING' ? 'RECEIVING' as const : 'NOT_SEEN' as const,
      ...(connection.lastWebhookAt ? { lastWebhookAt: toIso(connection.lastWebhookAt) } : {}),
      ...(connection.lastWebhookEvent ? { lastWebhookEvent: connection.lastWebhookEvent } : {}),
      connectionStatus: connection.hasToken ? 'CONNECTED' as const : 'DISCONNECTED' as const,
      ...(error ? { error } : {}),
      ...(!connection.hasToken ? { requiredTokenEnv: 'OA Access Token' } : {})
    };
  });
}

export async function setZaloBranchMapping(
  db: Firestore | null,
  input: { pageId: string; branchId: string },
  actor: ZaloOaActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const manager = ['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER'].includes(asString(actor.role).toUpperCase());
  if (!manager) throw new Error('ZALO_BRANCH_MAPPING_FORBIDDEN');
  const connection = await getStoredZaloOaConnection(db, input.pageId);
  if (!connection) throw new Error('ZALO_CONNECTION_NOT_FOUND');
  const branchSnapshot = await db.collection('branches').doc(asString(input.branchId)).get();
  if (!branchSnapshot.exists || branchSnapshot.data()?.isActive === false || branchSnapshot.data()?.active === false) {
    throw new Error('ZALO_BRANCH_NOT_FOUND');
  }
  assertBranchAccess(actor, branchSnapshot.id);
  const branchName = asString(branchSnapshot.data()?.name) || branchSnapshot.id;
  const batch = db.batch();
  batch.set(db.collection('channelConnections').doc(connection.id), {
    branchId: branchSnapshot.id,
    branchName,
    updatedByUid: actor.uid,
    updatedByName: asString(actor.name) || actor.uid,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  batch.set(db.collection('zaloOaMappings').doc(connection.oaId), {
    oaId: connection.oaId,
    oaName: connection.oaName,
    branchId: branchSnapshot.id,
    branchName,
    isActive: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();
  return {
    provider: ZALO_PROVIDER as 'ZALO_OA',
    pageId: connection.oaId,
    pageName: connection.oaName,
    branchId: branchSnapshot.id,
    branchName,
    status: connection.accessToken ? 'READY' as const : 'MISSING_TOKEN' as const
  };
}

export async function getZaloWebhookSetup(
  db: Firestore | null,
  pageId: string,
  actor: ZaloOaActor,
  requestOrigin: string
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const connection = await getStoredZaloOaConnection(db, pageId);
  if (!connection) throw new Error('ZALO_CONNECTION_NOT_FOUND');
  assertBranchAccess(actor, connection.branchId);
  const origin = asString(requestOrigin || process.env.APP_URL).replace(/\/$/, '');
  if (!origin) throw new Error('ZALO_WEBHOOK_ORIGIN_NOT_CONFIGURED');
  const mapping = asObject((await db.collection('zaloOaMappings').doc(connection.oaId).get()).data());
  return {
    provider: ZALO_PROVIDER as 'ZALO_OA',
    pageId: connection.oaId,
    pageName: connection.oaName,
    branchId: connection.branchId,
    branchName: connection.branchName,
    callbackUrl: `${origin}/api/zalo/webhook`,
    webhookStatus: mapping.lastWebhookAt ? 'RECEIVING' as const : 'NOT_SEEN' as const,
    ...(mapping.lastWebhookAt ? { lastWebhookAt: toIso(mapping.lastWebhookAt) } : {}),
    ...(asString(mapping.lastWebhookEvent) ? { lastWebhookEvent: asString(mapping.lastWebhookEvent) } : {}),
    connectionStatus: connection.accessToken ? 'CONNECTED' as const : 'DISCONNECTED' as const,
    requiredEvents: ['user_send_text', 'user_send_image', 'user_send_file', 'oa_send_text', 'oa_send_image', 'oa_send_file'],
    docsUrl: 'https://stc-developers.zdn.vn/docs/v2/official-account/webhook/tong-quan'
  };
}

function clientMessage(document: Record<string, any>) {
  return {
    id: asString(document.id),
    externalMessageId: asString(document.externalMessageId),
    sender: document.sender,
    senderName: asString(document.senderName),
    content: asString(document.content),
    timestamp: asString(document.timestampIso) || toIso(document.timestamp),
    attachments: Array.isArray(document.attachments) ? document.attachments : [],
    messageKind: 'MESSAGE' as const
  };
}

export async function sendZaloOaMessage(
  db: Firestore | null,
  input: { conversationId: string; text: string; operationKey: string },
  actor: ZaloOaActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const text = asString(input.text);
  if (!text) throw new Error('ZALO_MESSAGE_TEXT_REQUIRED');
  if (text.length > 2_000) throw new Error('ZALO_MESSAGE_TEXT_TOO_LONG');
  const operationKey = asString(input.operationKey);
  if (!operationKey) throw new Error('ZALO_OPERATION_KEY_REQUIRED');
  const conversationRef = db.collection('chatConversations').doc(asString(input.conversationId));
  const operationRef = db.collection('zaloSendOperations').doc(hashId('ZALO_SEND', operationKey));
  let replay: Record<string, any> | null = null;
  let conversation: Record<string, any> = {};
  await db.runTransaction(async transaction => {
    const [conversationSnapshot, operationSnapshot] = await Promise.all([
      transaction.get(conversationRef),
      transaction.get(operationRef)
    ]);
    if (!conversationSnapshot.exists) throw new Error('ZALO_CONVERSATION_NOT_FOUND');
    conversation = { id: conversationSnapshot.id, ...conversationSnapshot.data() };
    if (conversation.provider !== ZALO_PROVIDER) throw new Error('ZALO_CONVERSATION_PROVIDER_MISMATCH');
    assertBranchAccess(actor, asString(conversation.branchId));
    if (operationSnapshot.exists) {
      const operation = operationSnapshot.data() || {};
      if (operation.status === 'SENT') replay = operation;
      else throw new Error('ZALO_SEND_ALREADY_PROCESSING');
      return;
    }
    transaction.create(operationRef, {
      id: operationRef.id,
      provider: ZALO_PROVIDER,
      operationKey,
      conversationId: conversationRef.id,
      status: 'PROCESSING',
      actorUid: actor.uid,
      createdAt: FieldValue.serverTimestamp()
    });
  });
  if (replay) return { message: asObject(replay.message), idempotentReplay: true };

  const oaId = asString(conversation.pageId);
  const customerId = asString(conversation.customerPsid || conversation.externalConversationId);
  try {
    const payload = await withFreshZaloToken(db, oaId, token => zaloApiRequest(token, 'v3.0/oa/message/cs', {
      method: 'POST',
      body: JSON.stringify({ recipient: { user_id: customerId }, message: { text } })
    }));
    const data = asObject(payload.data);
    const externalMessageId = asString(data.message_id || data.msg_id)
      || hashId('ZALO_OUT', oaId, customerId, operationKey);
    const timestamp = toIso(data.sent_time || Date.now());
    const normalized: NormalizedZaloMessage = {
      oaId,
      customerId,
      externalConversationId: asString(conversation.externalConversationId) || customerId,
      externalMessageId,
      sender: 'STAFF',
      senderName: asString(actor.name) || 'PhoneHouse',
      customerName: asString(conversation.customerName) || 'Khách Zalo',
      content: text,
      timestamp,
      attachments: [],
      rawKind: 'oa_send_text'
    };
    const connection = await getStoredZaloOaConnection(db, oaId);
    if (!connection) throw new Error('ZALO_CONNECTION_NOT_FOUND');
    const persisted = await persistZaloMessage(db, connection, normalized);
    const document = messageDocument(normalized, { id: connection.branchId, name: connection.branchName }, persisted.conversationId);
    const message = clientMessage(document);
    await operationRef.set({ status: 'SENT', externalMessageId, message, completedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { message, idempotentReplay: false };
  } catch (error: any) {
    await operationRef.set({ status: 'FAILED', error: asString(error?.message), failedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw error;
  }
}

function normalizeHistoryItem(oaId: string, customerId: string, itemInput: unknown): NormalizedZaloMessage | null {
  const item = asObject(itemInput);
  const source = asNumber(item.src, -1);
  if (![0, 1].includes(source)) return null;
  const messageObject = asObject(item.message);
  const text = asString(item.message) || asString(messageObject.text);
  const attachments = [item.url, item.thumb, item.thumbnail, messageObject.url]
    .map(asString)
    .filter(value => /^https?:\/\//i.test(value));
  const timestamp = toIso(item.time || item.timestamp);
  return {
    oaId,
    customerId,
    externalConversationId: customerId,
    externalMessageId: asString(item.message_id || item.msg_id) || hashId('ZALO_HISTORY', oaId, customerId, timestamp, text),
    sender: source === 1 ? 'CUSTOMER' : 'STAFF',
    senderName: source === 1 ? asString(item.from_display_name) || 'Khách Zalo' : asString(item.from_display_name) || 'PhoneHouse',
    customerName: source === 1 ? asString(item.from_display_name) || 'Khách Zalo' : asString(item.to_display_name) || 'Khách Zalo',
    content: text || attachmentLabel(asString(item.type)),
    timestamp,
    attachments,
    rawKind: `history_${asString(item.type) || 'message'}`
  };
}

export async function refreshZaloConversationMessages(db: Firestore, conversationInput: Record<string, any>) {
  if (asString(conversationInput.provider) !== ZALO_PROVIDER) throw new Error('ZALO_CONVERSATION_PROVIDER_MISMATCH');
  const oaId = asString(conversationInput.pageId);
  const customerId = asString(conversationInput.customerPsid || conversationInput.externalConversationId);
  const connection = await getStoredZaloOaConnection(db, oaId);
  if (!connection) throw new Error('ZALO_CONNECTION_NOT_FOUND');
  const data = JSON.stringify({ user_id: customerId, offset: 0, count: 10 });
  const payload = await withFreshZaloToken(db, oaId, token => zaloApiRequest(token, `v2.0/oa/conversation?data=${encodeURIComponent(data)}`));
  const raw = Array.isArray(payload.data) ? payload.data : Array.isArray(asObject(payload.data).data) ? asObject(payload.data).data : [];
  let imported = 0;
  for (const item of raw) {
    const normalized = normalizeHistoryItem(oaId, customerId, item);
    if (!normalized) continue;
    const result = await persistZaloMessage(db, connection, normalized);
    if (!result.duplicate) imported += 1;
  }
  return { imported, scanned: raw.length };
}

export async function markZaloConversationRead(db: Firestore | null, conversationId: string, actor: ZaloOaActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const snapshot = await db.collection('chatConversations').doc(asString(conversationId)).get();
  if (!snapshot.exists) throw new Error('ZALO_CONVERSATION_NOT_FOUND');
  const conversation = snapshot.data() || {};
  if (conversation.provider !== ZALO_PROVIDER) throw new Error('ZALO_CONVERSATION_PROVIDER_MISMATCH');
  assertBranchAccess(actor, asString(conversation.branchId));
  await snapshot.ref.set({ unreadCount: 0, readAt: FieldValue.serverTimestamp(), readByUid: actor.uid }, { merge: true });
  return { conversationId: snapshot.id, unreadCount: 0 };
}

export async function syncZaloOaConversations(db: Firestore | null, pageId: string, actor: ZaloOaActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const connection = await getStoredZaloOaConnection(db, pageId);
  if (!connection) throw new Error('ZALO_CONNECTION_NOT_FOUND');
  assertBranchAccess(actor, connection.branchId);
  return {
    pageId,
    imported: 0,
    scanned: 0,
    nextCursor: null,
    done: true,
    cutoffAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    realtimeOnly: true
  };
}
