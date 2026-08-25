import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import {
  ChannelConnectionActor,
  TIKTOK_PROVIDER,
  decryptChannelSecret,
  encryptChannelSecret,
  getStoredTikTokBusinessConnection,
  listChatChannelConnections,
  tiktokConnectionDocumentId
} from './channelConnectionService';

export type TikTokBusinessActor = ChannelConnectionActor;

export interface NormalizedTikTokMessage {
  businessId: string;
  customerId: string;
  externalConversationId: string;
  externalMessageId: string;
  sender: 'CUSTOMER' | 'STAFF';
  senderName: string;
  customerName: string;
  customerAvatarUrl: string;
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
  return new Date(toMillis(value) || Date.now()).toISOString();
}

function safeTimestamp(value: unknown): Timestamp {
  return Timestamp.fromMillis(toMillis(value) || Date.now());
}

function hashId(prefix: string, ...parts: string[]): string {
  return `${prefix}_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40)}`;
}

function canAccessBranch(actor: TikTokBusinessActor, branchId: string): boolean {
  if (asString(actor.role).toUpperCase() === 'ADMIN') return true;
  return [actor.branchId, ...(actor.assignedBranchIds || [])].filter(Boolean).includes(branchId);
}

function assertBranchAccess(actor: TikTokBusinessActor, branchId: string) {
  if (!canAccessBranch(actor, branchId)) throw new Error('TIKTOK_BRANCH_FORBIDDEN');
}

function isAdmin(actor: TikTokBusinessActor): boolean {
  return asString(actor.role).toUpperCase() === 'ADMIN';
}

export function tiktokConversationDocumentId(businessId: string, customerId: string): string {
  return hashId('TIKTOK_CONV', businessId, customerId);
}

export function tiktokMessageDocumentId(businessId: string, messageId: string): string {
  return hashId('TIKTOK_MSG', businessId, messageId);
}

export function extractTikTokBusinessId(payloadInput: unknown): string {
  return asString(asObject(payloadInput).user_openid);
}

export function verifyTikTokWebhookSignature(
  rawBody: Buffer,
  signatureHeader: unknown,
  appSecretInput: unknown,
  nowMillis = Date.now(),
  maxAgeSeconds = 5 * 60
): boolean {
  const header = asString(Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader);
  const secret = asString(appSecretInput);
  if (!rawBody.length || !header || !secret) return false;
  const fields = Object.fromEntries(header.split(',').map(part => part.trim().split('=', 2)).filter(part => part.length === 2));
  const timestamp = asString(fields.t);
  const signature = asString(fields.s).toLowerCase();
  if (!/^\d{9,13}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const timestampMillis = Number(timestamp) < 10_000_000_000 ? Number(timestamp) * 1000 : Number(timestamp);
  if (!Number.isFinite(timestampMillis) || Math.abs(nowMillis - timestampMillis) > maxAgeSeconds * 1000) return false;
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`, 'utf8')
    .digest('hex');
  const left = Buffer.from(signature, 'hex');
  const right = Buffer.from(expected, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function parsedWebhookContent(payload: Record<string, any>): Record<string, any> {
  if (typeof payload.content === 'string') {
    try { return asObject(JSON.parse(payload.content)); } catch { return {}; }
  }
  return asObject(payload.content);
}

function user(input: unknown) {
  const data = asObject(input);
  return {
    id: asString(data.id || data.open_id || data.user_id || input),
    name: asString(data.display_name || data.name || data.nickname),
    avatar: asString(data.profile_image || data.avatar_url || data.avatar),
    role: asString(data.role || data.participant_role).toUpperCase()
  };
}

function attachmentValues(content: Record<string, any>): string[] {
  const values = new Set<string>();
  const candidates = [
    asObject(content.sticker).url,
    asObject(content.emoji).url,
    asObject(content.share_post).embed_url,
    asObject(content.image).url,
    asObject(content.video).url
  ];
  candidates.map(asString).filter(value => /^https?:\/\//i.test(value)).forEach(value => values.add(value));
  return [...values];
}

function messageLabel(content: Record<string, any>): string {
  const type = asString(content.type || content.message_type).toUpperCase();
  if (type.includes('IMAGE')) return 'Đã gửi hình ảnh';
  if (type.includes('VIDEO')) return 'Đã gửi video';
  if (type.includes('STICKER') || type.includes('EMOJI')) return 'Đã gửi nhãn dán';
  if (type.includes('SHARE')) return 'Đã chia sẻ bài TikTok';
  return 'Tin nhắn TikTok';
}

export function normalizeTikTokWebhookMessage(payloadInput: unknown): NormalizedTikTokMessage | null {
  const payload = asObject(payloadInput);
  const event = asString(payload.event).toLowerCase();
  if (!['im_receive_msg', 'im_receive_msg_eu', 'im_send_msg'].includes(event)) return null;
  const content = parsedWebhookContent(payload);
  const inbound = event.startsWith('im_receive_msg');
  const from = user(content.from_user || content.from);
  const to = user(content.to_user || content.to);
  const businessId = extractTikTokBusinessId(payload) || (inbound ? to.id : from.id);
  const customer = inbound ? from : to;
  if (!businessId || !customer.id || customer.id === businessId) return null;
  const text = asString(asObject(content.text).body || content.text || content.message_text);
  const attachments = attachmentValues(content);
  const timestamp = toIso(content.timestamp || payload.create_time);
  const externalConversationId = asString(content.conversation_id);
  const externalMessageId = asString(content.message_id)
    || hashId('TIKTOK_EVT', businessId, customer.id, externalConversationId, timestamp, event, text, JSON.stringify(attachments));
  return {
    businessId,
    customerId: customer.id,
    externalConversationId: externalConversationId || customer.id,
    externalMessageId,
    sender: inbound ? 'CUSTOMER' : 'STAFF',
    senderName: inbound ? customer.name || 'Khách TikTok' : 'PhoneHouse',
    customerName: customer.name || 'Khách TikTok',
    customerAvatarUrl: customer.avatar,
    content: text || messageLabel(content),
    timestamp,
    attachments,
    rawKind: event
  };
}

async function tiktokApiRequest(
  accessToken: string,
  pathOrUrl: string,
  init: RequestInit = {}
): Promise<Record<string, any>> {
  if (!accessToken) throw new Error('TIKTOK_ACCESS_TOKEN_REQUIRED');
  const url = pathOrUrl.startsWith('https://business-api.tiktok.com/')
    ? pathOrUrl
    : `https://business-api.tiktok.com/open_api/v1.3/${pathOrUrl.replace(/^\//, '')}`;
  if (!url.startsWith('https://business-api.tiktok.com/open_api/v1.3/')) throw new Error('TIKTOK_API_URL_INVALID');
  const response = await fetch(url, {
    ...init,
    headers: {
      'Access-Token': accessToken,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  const code = asNumber(payload.code, response.ok ? 0 : response.status);
  if (!response.ok || code !== 0) {
    throw new Error(`TIKTOK_API_FAILED_${code || response.status}: ${asString(payload.message) || 'TikTok từ chối yêu cầu.'}`);
  }
  return payload;
}

export async function ensureTikTokAccessToken(db: Firestore, businessId: string, forceRefresh = false): Promise<string> {
  let connection = await getStoredTikTokBusinessConnection(db, businessId);
  if (!connection) throw new Error('TIKTOK_CONNECTION_NOT_FOUND');
  const now = Date.now();
  if (!forceRefresh && connection.accessToken && (!connection.accessTokenExpiresAt || connection.accessTokenExpiresAt > now + 5 * 60 * 1000)) {
    return connection.accessToken;
  }
  if (!connection.refreshToken) throw new Error('TIKTOK_REFRESH_TOKEN_REQUIRED');
  if (!connection.appId || !connection.appSecret) throw new Error('TIKTOK_APP_CREDENTIALS_NOT_CONFIGURED');
  if (connection.refreshTokenExpiresAt && connection.refreshTokenExpiresAt <= now) throw new Error('TIKTOK_REFRESH_TOKEN_EXPIRED');
  const ref = db.collection('channelConnections').doc(tiktokConnectionDocumentId(businessId));
  let claimed = false;
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error('TIKTOK_CONNECTION_NOT_FOUND');
    const data = snapshot.data() || {};
    if (!forceRefresh && toMillis(data.accessTokenExpiresAt) > Date.now() + 5 * 60 * 1000) return;
    if (toMillis(data.refreshLeaseUntil) > Date.now()) throw new Error('TIKTOK_TOKEN_REFRESH_IN_PROGRESS');
    transaction.set(ref, {
      refreshLeaseUntil: Timestamp.fromMillis(Date.now() + 30_000),
      refreshLeaseId: hashId('TIKTOK_REFRESH', businessId, String(Date.now())),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    claimed = true;
  });
  if (!claimed) {
    connection = await getStoredTikTokBusinessConnection(db, businessId);
    if (connection?.accessToken) return connection.accessToken;
    throw new Error('TIKTOK_ACCESS_TOKEN_REQUIRED');
  }
  try {
    const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/refresh_token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: connection.appId,
        client_secret: connection.appSecret,
        grant_type: 'refresh_token',
        refresh_token: connection.refreshToken
      })
    });
    const payload = await response.json().catch(() => ({})) as Record<string, any>;
    const code = asNumber(payload.code, response.ok ? 0 : response.status);
    const data = asObject(payload.data);
    const accessToken = asString(data.access_token);
    const refreshToken = asString(data.refresh_token) || connection.refreshToken;
    if (!response.ok || code !== 0 || !accessToken) {
      throw new Error(`TIKTOK_TOKEN_REFRESH_FAILED_${code || response.status}: ${asString(payload.message) || 'TikTok không gia hạn token.'}`);
    }
    await ref.set({
      encryptedAccessToken: encryptChannelSecret(accessToken),
      encryptedRefreshToken: encryptChannelSecret(refreshToken),
      hasToken: true,
      hasRefreshToken: true,
      tokenFingerprint: createHash('sha256').update(accessToken).digest('hex').slice(0, 12),
      scope: Array.isArray(data.scope) ? data.scope.map(asString).filter(Boolean) : connection.scope,
      accessTokenExpiresAt: Timestamp.fromMillis(Date.now() + Math.max(300, asNumber(data.expires_in, 24 * 60 * 60)) * 1000),
      refreshTokenExpiresAt: Timestamp.fromMillis(Date.now() + Math.max(24 * 60 * 60, asNumber(data.refresh_token_expires_in, 365 * 24 * 60 * 60)) * 1000),
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

async function withFreshTikTokToken<T>(db: Firestore, businessId: string, work: (accessToken: string) => Promise<T>): Promise<T> {
  const token = await ensureTikTokAccessToken(db, businessId);
  try {
    return await work(token);
  } catch (error: any) {
    const message = asString(error?.message).toLowerCase();
    if (!message.includes('tiktok_api_failed_401') && !message.includes('access token') && !message.includes('token expired')) throw error;
    return work(await ensureTikTokAccessToken(db, businessId, true));
  }
}

function messageDocument(message: NormalizedTikTokMessage, branch: { id: string; name: string }, conversationId: string) {
  const id = tiktokMessageDocumentId(message.businessId, message.externalMessageId);
  return {
    id,
    provider: TIKTOK_PROVIDER,
    conversationId,
    externalConversationId: message.externalConversationId,
    externalMessageId: message.externalMessageId,
    customerPsid: message.customerId,
    pageId: message.businessId,
    branchId: branch.id,
    sender: message.sender,
    senderName: message.senderName,
    content: message.content,
    timestamp: safeTimestamp(message.timestamp),
    timestampIso: message.timestamp,
    attachments: message.attachments,
    messageKind: 'MESSAGE',
    tiktokEventKind: message.rawKind,
    createdAt: FieldValue.serverTimestamp()
  };
}

async function persistTikTokMessage(
  db: Firestore,
  connection: NonNullable<Awaited<ReturnType<typeof getStoredTikTokBusinessConnection>>>,
  message: NormalizedTikTokMessage
) {
  const conversationId = tiktokConversationDocumentId(message.businessId, message.customerId);
  const messageId = tiktokMessageDocumentId(message.businessId, message.externalMessageId);
  const conversationRef = db.collection('chatConversations').doc(conversationId);
  const messageRef = db.collection('chatMessages').doc(messageId);
  return db.runTransaction(async transaction => {
    const [conversationSnapshot, messageSnapshot] = await Promise.all([
      transaction.get(conversationRef),
      transaction.get(messageRef)
    ]);
    if (messageSnapshot.exists) return { conversationId, messageId, duplicate: true };
    const existing = conversationSnapshot.data() || {};
    const inbound = message.sender === 'CUSTOMER';
    const isLatest = safeTimestamp(message.timestamp).toMillis() >= toMillis(existing.lastMessageTime || existing.updatedAt);
    const updates: Record<string, any> = {
      id: conversationId,
      provider: TIKTOK_PROVIDER,
      pageId: message.businessId,
      pageName: connection.displayName,
      externalConversationId: message.externalConversationId,
      customerPsid: message.customerId,
      branchId: connection.branchId,
      branchName: connection.branchName,
      channel: 'TIKTOK',
      conversationType: 'INBOX',
      customerName: message.customerName || asString(existing.customerName) || 'Khách TikTok',
      avatarUrl: message.customerAvatarUrl || asString(existing.avatarUrl),
      customerPhone: asString(existing.customerPhone),
      createdAt: existing.createdAt || safeTimestamp(message.timestamp),
      lastSyncedAt: FieldValue.serverTimestamp(),
      lastTikTokWebhookAt: FieldValue.serverTimestamp()
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
    transaction.create(messageRef, messageDocument(message, { id: connection.branchId, name: connection.branchName }, conversationId));
    return { conversationId, messageId, duplicate: false };
  });
}

export async function processTikTokBusinessWebhook(db: Firestore | null, payloadInput: unknown) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const payload = asObject(payloadInput);
  const businessId = extractTikTokBusinessId(payload);
  const event = asString(payload.event).toLowerCase();
  const connection = await getStoredTikTokBusinessConnection(db, businessId);
  if (!connection) throw new Error('TIKTOK_CONNECTION_NOT_FOUND');
  const message = normalizeTikTokWebhookMessage(payload);
  let processed = 0;
  let duplicates = 0;
  if (message) {
    const result = await persistTikTokMessage(db, connection, message);
    processed = result.duplicate ? 0 : 1;
    duplicates = result.duplicate ? 1 : 0;
  }
  const batch = db.batch();
  batch.set(db.collection('channelConnections').doc(connection.id), {
    webhookStatus: 'RECEIVING',
    lastWebhookAt: FieldValue.serverTimestamp(),
    lastWebhookEvent: event,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  batch.set(db.collection('tiktokBusinessMappings').doc(businessId), {
    businessId,
    displayName: connection.displayName,
    branchId: connection.branchId,
    branchName: connection.branchName,
    isActive: true,
    lastWebhookAt: FieldValue.serverTimestamp(),
    lastWebhookEvent: event,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();
  return { accepted: true, ignored: !message, processed, duplicates };
}

async function configureTikTokWebhook(connection: NonNullable<Awaited<ReturnType<typeof getStoredTikTokBusinessConnection>>>, callbackUrl: string) {
  if (!connection.appId || !connection.appSecret) throw new Error('TIKTOK_APP_CREDENTIALS_NOT_CONFIGURED');
  if (!/^https:\/\//i.test(callbackUrl)) throw new Error('TIKTOK_WEBHOOK_CALLBACK_INVALID');
  const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/business/webhook/update/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: connection.appId,
      secret: connection.appSecret,
      event_type: 'DIRECT_MESSAGE',
      callback_url: callbackUrl
    })
  });
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  const code = asNumber(payload.code, response.ok ? 0 : response.status);
  if (!response.ok || code !== 0) throw new Error(`TIKTOK_WEBHOOK_SETUP_FAILED_${code || response.status}: ${asString(payload.message) || 'TikTok từ chối webhook.'}`);
  return payload;
}

function publicOrigin(originInput: string): string {
  const origin = asString(originInput || process.env.APP_URL).replace(/\/$/, '');
  if (!/^https:\/\//i.test(origin)) throw new Error('TIKTOK_WEBHOOK_ORIGIN_NOT_CONFIGURED');
  return origin;
}

export async function testTikTokConnection(
  db: Firestore | null,
  connectionId: string,
  actor: TikTokBusinessActor,
  subscribe = false,
  requestOrigin = ''
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isAdmin(actor)) throw new Error('CHANNEL_CONNECTION_ADMIN_REQUIRED');
  const ref = db.collection('channelConnections').doc(asString(connectionId));
  const snapshot = await ref.get();
  if (!snapshot.exists || asString(snapshot.data()?.provider) !== TIKTOK_PROVIDER) throw new Error('TIKTOK_CONNECTION_NOT_FOUND');
  const data = snapshot.data() || {};
  assertBranchAccess(actor, asString(data.branchId));
  const businessId = asString(data.externalAccountId);
  try {
    await withFreshTikTokToken(db, businessId, token => tiktokApiRequest(token,
      `business/message/conversation/list/?business_id=${encodeURIComponent(businessId)}&conversation_type=SINGLE&limit=1`
    ));
    if (subscribe) {
      const connection = await getStoredTikTokBusinessConnection(db, businessId);
      if (!connection) throw new Error('TIKTOK_CONNECTION_NOT_FOUND');
      await configureTikTokWebhook(connection, `${publicOrigin(requestOrigin)}/api/tiktok/webhook`);
    }
    await ref.set({
      status: subscribe ? 'READY' : 'VERIFIED',
      lastError: '',
      lastTestedAt: FieldValue.serverTimestamp(),
      ...(subscribe ? { subscribedFields: ['DIRECT_MESSAGE'], subscribedAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { ...await cleanTikTokConnection(db, ref.id), testOk: true };
  } catch (error: any) {
    await ref.set({ status: 'ERROR', lastError: asString(error?.message), lastTestedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw error;
  }
}

async function cleanTikTokConnection(db: Firestore, connectionId: string) {
  return (await listChatChannelConnections(db, { uid: 'SYSTEM', role: 'ADMIN' })).find(item => item.id === connectionId) || null;
}

export async function getTikTokBusinessChannels(db: Firestore | null, actor: TikTokBusinessActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const connections = (await listChatChannelConnections(db, actor))
    .filter(connection => connection.provider === TIKTOK_PROVIDER && connection.active !== false);
  return connections.map(connection => {
    const error = connection.status === 'ERROR' ? connection.lastError || 'TIKTOK_CONNECTION_ERROR' : '';
    return {
      provider: TIKTOK_PROVIDER as 'TIKTOK_BUSINESS',
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
      ...(!connection.hasToken ? { requiredTokenEnv: 'TikTok Access Token' } : {})
    };
  });
}

export async function setTikTokBranchMapping(
  db: Firestore | null,
  input: { pageId: string; branchId: string },
  actor: TikTokBusinessActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const connection = await getStoredTikTokBusinessConnection(db, input.pageId);
  if (!connection) throw new Error('TIKTOK_CONNECTION_NOT_FOUND');
  const branch = await db.collection('branches').doc(asString(input.branchId)).get();
  if (!branch.exists || branch.data()?.isActive === false || branch.data()?.active === false) throw new Error('TIKTOK_BRANCH_NOT_FOUND');
  assertBranchAccess(actor, branch.id);
  const branchName = asString(branch.data()?.name) || branch.id;
  const batch = db.batch();
  batch.set(db.collection('channelConnections').doc(connection.id), { branchId: branch.id, branchName, updatedAt: FieldValue.serverTimestamp(), updatedByUid: actor.uid }, { merge: true });
  batch.set(db.collection('tiktokBusinessMappings').doc(connection.businessId), {
    businessId: connection.businessId,
    displayName: connection.displayName,
    branchId: branch.id,
    branchName,
    isActive: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();
  return { provider: TIKTOK_PROVIDER, pageId: connection.businessId, pageName: connection.displayName, branchId: branch.id, branchName, status: 'READY' as const };
}

export async function getTikTokWebhookSetup(
  db: Firestore | null,
  pageId: string,
  actor: TikTokBusinessActor,
  requestOrigin: string
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const connection = await getStoredTikTokBusinessConnection(db, pageId);
  if (!connection) throw new Error('TIKTOK_CONNECTION_NOT_FOUND');
  assertBranchAccess(actor, connection.branchId);
  const mapping = asObject((await db.collection('tiktokBusinessMappings').doc(connection.businessId).get()).data());
  return {
    provider: TIKTOK_PROVIDER as 'TIKTOK_BUSINESS',
    pageId: connection.businessId,
    pageName: connection.displayName,
    branchId: connection.branchId,
    branchName: connection.branchName,
    callbackUrl: `${publicOrigin(requestOrigin)}/api/tiktok/webhook`,
    webhookStatus: mapping.lastWebhookAt ? 'RECEIVING' as const : 'NOT_SEEN' as const,
    ...(mapping.lastWebhookAt ? { lastWebhookAt: toIso(mapping.lastWebhookAt) } : {}),
    ...(asString(mapping.lastWebhookEvent) ? { lastWebhookEvent: asString(mapping.lastWebhookEvent) } : {}),
    connectionStatus: connection.accessToken ? 'CONNECTED' as const : 'DISCONNECTED' as const,
    requiredEvents: ['DIRECT_MESSAGE'],
    docsUrl: 'https://business-api.tiktok.com/portal/bm-api/education-hub'
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

export async function sendTikTokBusinessMessage(
  db: Firestore | null,
  input: { conversationId: string; text: string; operationKey: string },
  actor: TikTokBusinessActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const text = asString(input.text);
  if (!text) throw new Error('TIKTOK_MESSAGE_TEXT_REQUIRED');
  if (text.length > 6_000) throw new Error('TIKTOK_MESSAGE_TEXT_TOO_LONG');
  const operationKey = asString(input.operationKey);
  if (!operationKey) throw new Error('TIKTOK_OPERATION_KEY_REQUIRED');
  const conversationRef = db.collection('chatConversations').doc(asString(input.conversationId));
  const operationRef = db.collection('tiktokSendOperations').doc(hashId('TIKTOK_SEND', operationKey));
  let replay: Record<string, any> | null = null;
  let conversation: Record<string, any> = {};
  await db.runTransaction(async transaction => {
    const [conversationSnapshot, operationSnapshot] = await Promise.all([
      transaction.get(conversationRef),
      transaction.get(operationRef)
    ]);
    if (!conversationSnapshot.exists) throw new Error('TIKTOK_CONVERSATION_NOT_FOUND');
    conversation = { id: conversationSnapshot.id, ...conversationSnapshot.data() };
    if (conversation.provider !== TIKTOK_PROVIDER) throw new Error('TIKTOK_CONVERSATION_PROVIDER_MISMATCH');
    assertBranchAccess(actor, asString(conversation.branchId));
    const lastCustomerMessageAt = toMillis(conversation.lastCustomerMessageAt);
    if (!lastCustomerMessageAt || Date.now() - lastCustomerMessageAt > 48 * 60 * 60 * 1000) throw new Error('TIKTOK_REPLY_WINDOW_EXPIRED');
    if (operationSnapshot.exists) {
      const operation = operationSnapshot.data() || {};
      if (operation.status === 'SENT') replay = operation;
      else throw new Error('TIKTOK_SEND_ALREADY_PROCESSING');
      return;
    }
    transaction.create(operationRef, {
      id: operationRef.id,
      provider: TIKTOK_PROVIDER,
      operationKey,
      conversationId: conversationRef.id,
      status: 'PROCESSING',
      actorUid: actor.uid,
      createdAt: FieldValue.serverTimestamp()
    });
  });
  if (replay) return { message: asObject(replay.message), idempotentReplay: true };
  const businessId = asString(conversation.pageId);
  try {
    const payload = await withFreshTikTokToken(db, businessId, token => tiktokApiRequest(token, 'business/message/send/', {
      method: 'POST',
      body: JSON.stringify({
        business_id: businessId,
        recipient_type: 'CONVERSATION',
        recipient: asString(conversation.externalConversationId),
        message_type: 'TEXT',
        text: { body: text }
      })
    }));
    const data = asObject(payload.data);
    const externalMessageId = asString(data.message_id || asObject(data.message).message_id)
      || hashId('TIKTOK_OUT', businessId, asString(conversation.externalConversationId), operationKey);
    const normalized: NormalizedTikTokMessage = {
      businessId,
      customerId: asString(conversation.customerPsid),
      externalConversationId: asString(conversation.externalConversationId),
      externalMessageId,
      sender: 'STAFF',
      senderName: asString(actor.name) || 'PhoneHouse',
      customerName: asString(conversation.customerName) || 'Khách TikTok',
      customerAvatarUrl: asString(conversation.avatarUrl),
      content: text,
      timestamp: toIso(data.timestamp || Date.now()),
      attachments: [],
      rawKind: 'im_send_msg'
    };
    const connection = await getStoredTikTokBusinessConnection(db, businessId);
    if (!connection) throw new Error('TIKTOK_CONNECTION_NOT_FOUND');
    const persisted = await persistTikTokMessage(db, connection, normalized);
    const message = clientMessage(messageDocument(normalized, { id: connection.branchId, name: connection.branchName }, persisted.conversationId));
    await operationRef.set({ status: 'SENT', externalMessageId, message, completedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { message, idempotentReplay: false };
  } catch (error: any) {
    await operationRef.set({ status: 'FAILED', error: asString(error?.message), failedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw error;
  }
}

function historyMessage(
  connection: NonNullable<Awaited<ReturnType<typeof getStoredTikTokBusinessConnection>>>,
  conversationId: string,
  participants: Record<string, ReturnType<typeof user>>,
  input: unknown
): NormalizedTikTokMessage | null {
  const item = asObject(input);
  const from = user(item.from_user || item.from);
  const to = user(item.to_user || item.to);
  const fromProfile = participants[from.id] || from;
  const toProfile = participants[to.id] || to;
  const outbound = from.id === connection.businessId
    || fromProfile.role === 'BUSINESS'
    || ['BUSINESS', 'SELF'].includes(asString(item.from_role).toUpperCase());
  const customer = outbound ? toProfile : fromProfile;
  if (!customer.id || customer.id === connection.businessId) return null;
  const text = asString(asObject(item.text).body || item.text || item.message_text);
  const attachments = attachmentValues(item);
  const timestamp = toIso(item.timestamp || item.create_time);
  return {
    businessId: connection.businessId,
    customerId: customer.id,
    externalConversationId: conversationId,
    externalMessageId: asString(item.message_id) || hashId('TIKTOK_HISTORY', connection.businessId, conversationId, timestamp, text, JSON.stringify(attachments)),
    sender: outbound ? 'STAFF' : 'CUSTOMER',
    senderName: outbound ? 'PhoneHouse' : customer.name || 'Khách TikTok',
    customerName: customer.name || 'Khách TikTok',
    customerAvatarUrl: customer.avatar,
    content: text || messageLabel(item),
    timestamp,
    attachments,
    rawKind: 'history_message'
  };
}

function messageListData(payload: Record<string, any>) {
  const data = asObject(payload.data);
  const participantMap: Record<string, ReturnType<typeof user>> = {};
  for (const entry of Array.isArray(data.participants) ? data.participants : []) {
    const profile = user(entry);
    if (profile.id) participantMap[profile.id] = profile;
  }
  const messages = Array.isArray(data.messages) ? data.messages : Array.isArray(data.list) ? data.list : [];
  return { participantMap, messages };
}

export async function refreshTikTokConversationMessages(db: Firestore, conversationInput: Record<string, any>) {
  if (asString(conversationInput.provider) !== TIKTOK_PROVIDER) throw new Error('TIKTOK_CONVERSATION_PROVIDER_MISMATCH');
  const businessId = asString(conversationInput.pageId);
  const externalConversationId = asString(conversationInput.externalConversationId);
  const connection = await getStoredTikTokBusinessConnection(db, businessId);
  if (!connection) throw new Error('TIKTOK_CONNECTION_NOT_FOUND');
  const payload = await withFreshTikTokToken(db, businessId, token => tiktokApiRequest(token,
    `business/message/content/list/?business_id=${encodeURIComponent(businessId)}&conversation_id=${encodeURIComponent(externalConversationId)}`
  ));
  const { participantMap, messages } = messageListData(payload);
  let imported = 0;
  for (const item of messages) {
    const normalized = historyMessage(connection, externalConversationId, participantMap, item);
    if (!normalized) continue;
    const result = await persistTikTokMessage(db, connection, normalized);
    if (!result.duplicate) imported += 1;
  }
  return { imported, scanned: messages.length };
}

export async function markTikTokConversationRead(db: Firestore | null, conversationId: string, actor: TikTokBusinessActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const snapshot = await db.collection('chatConversations').doc(asString(conversationId)).get();
  if (!snapshot.exists) throw new Error('TIKTOK_CONVERSATION_NOT_FOUND');
  const conversation = snapshot.data() || {};
  if (conversation.provider !== TIKTOK_PROVIDER) throw new Error('TIKTOK_CONVERSATION_PROVIDER_MISMATCH');
  assertBranchAccess(actor, asString(conversation.branchId));
  const businessId = asString(conversation.pageId);
  try {
    await withFreshTikTokToken(db, businessId, token => tiktokApiRequest(token, 'business/message/send/', {
      method: 'POST',
      body: JSON.stringify({
        business_id: businessId,
        recipient_type: 'CONVERSATION',
        recipient: asString(conversation.externalConversationId),
        message_type: 'SENDER_ACTION',
        sender_action: 'MARK_READ'
      })
    }));
  } catch (error: any) {
    console.warn('[TikTok mark read]', asString(error?.message));
  }
  await snapshot.ref.set({ unreadCount: 0, readAt: FieldValue.serverTimestamp(), readByUid: actor.uid }, { merge: true });
  return { conversationId: snapshot.id, unreadCount: 0 };
}

function encodeSyncCursor(type: 'STRANGER' | 'SINGLE', cursor: string): string {
  return Buffer.from(JSON.stringify({ type, cursor }), 'utf8').toString('base64url');
}

function decodeSyncCursor(value: unknown): { type: 'STRANGER' | 'SINGLE'; cursor: string } {
  try {
    const parsed = asObject(JSON.parse(Buffer.from(asString(value), 'base64url').toString('utf8')));
    return { type: parsed.type === 'SINGLE' ? 'SINGLE' : 'STRANGER', cursor: asString(parsed.cursor) };
  } catch {
    return { type: 'STRANGER', cursor: '' };
  }
}

function conversationList(payload: Record<string, any>): { items: Record<string, any>[]; cursor: string; hasMore: boolean } {
  const data = asObject(payload.data);
  const raw = Array.isArray(data.conversations) ? data.conversations : Array.isArray(data.list) ? data.list : [];
  const pageInfo = asObject(data.page_info || data.pageInfo);
  return {
    items: raw.map(asObject),
    cursor: asString(data.cursor || pageInfo.cursor || pageInfo.next_cursor),
    hasMore: data.has_more === true || pageInfo.has_more === true
  };
}

export async function syncTikTokConversations(
  db: Firestore | null,
  input: { pageId: string; cursor?: string },
  actor: TikTokBusinessActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const connection = await getStoredTikTokBusinessConnection(db, input.pageId);
  if (!connection) throw new Error('TIKTOK_CONNECTION_NOT_FOUND');
  assertBranchAccess(actor, connection.branchId);
  const state = decodeSyncCursor(input.cursor);
  const query = new URLSearchParams({
    business_id: connection.businessId,
    conversation_type: state.type,
    limit: '10',
    ...(state.cursor ? { cursor: state.cursor } : {})
  });
  const payload = await withFreshTikTokToken(db, connection.businessId, token => tiktokApiRequest(token,
    `business/message/conversation/list/?${query}`
  ));
  const page = conversationList(payload);
  let imported = 0;
  await Promise.all(page.items.map(async item => {
    const externalConversationId = asString(item.conversation_id || item.id);
    if (!externalConversationId) return;
    const messagePayload = await withFreshTikTokToken(db, connection.businessId, token => tiktokApiRequest(token,
      `business/message/content/list/?business_id=${encodeURIComponent(connection.businessId)}&conversation_id=${encodeURIComponent(externalConversationId)}`
    ));
    const { participantMap, messages } = messageListData(messagePayload);
    for (const messageInput of messages) {
      const normalized = historyMessage(connection, externalConversationId, participantMap, messageInput);
      if (!normalized) continue;
      const result = await persistTikTokMessage(db, connection, normalized);
      if (!result.duplicate) imported += 1;
    }
  }));
  let nextCursor: string | null = null;
  let done = false;
  if (page.hasMore && page.cursor) nextCursor = encodeSyncCursor(state.type, page.cursor);
  else if (state.type === 'STRANGER') nextCursor = encodeSyncCursor('SINGLE', '');
  else done = true;
  await db.collection('channelConnections').doc(connection.id).set({
    lastSyncAt: FieldValue.serverTimestamp(),
    lastError: '',
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return {
    pageId: connection.businessId,
    imported,
    scanned: page.items.length,
    nextCursor,
    done,
    cutoffAt: new Date(Date.now() - connection.historyDays * 24 * 60 * 60 * 1000).toISOString()
  };
}
