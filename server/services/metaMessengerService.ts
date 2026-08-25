import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';

export interface MetaMessengerActor {
  uid: string;
  role: string;
  branchId?: string;
  assignedBranchIds?: string[];
  name?: string;
}

export interface MetaMessengerConfig {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  appSecret: string;
  verifyToken: string;
  branchId?: string;
  graphApiVersion: string;
}

interface ResolvedBranch {
  id: string;
  name: string;
}

export interface NormalizedMetaMessage {
  pageId: string;
  customerPsid: string;
  externalConversationId: string;
  externalMessageId: string;
  sender: 'CUSTOMER' | 'STAFF';
  senderName: string;
  content: string;
  timestamp: string;
  attachments: string[];
  messageKind: 'MESSAGE';
  rawKind: 'MESSAGE' | 'POSTBACK';
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

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();
  const numeric = asNumber(value);
  if (numeric > 0) {
    const milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const object = asObject(value);
  if (object.seconds !== undefined || object._seconds !== undefined) {
    const seconds = asNumber(object.seconds ?? object._seconds);
    const nanoseconds = asNumber(object.nanoseconds ?? object._nanoseconds);
    return new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000)).toISOString();
  }
  const parsed = new Date(asString(value));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function safeTimestamp(value: unknown): Timestamp {
  return Timestamp.fromDate(new Date(toIso(value)));
}

function hashId(prefix: string, ...values: unknown[]): string {
  const hash = createHash('sha256')
    .update(values.map(value => asString(value)).join('|'))
    .digest('hex')
    .slice(0, 40);
  return `${prefix}_${hash}`;
}

function safeSecretEqual(provided: unknown, configured: unknown): boolean {
  const left = Buffer.from(asString(provided));
  const right = Buffer.from(asString(configured));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function canAccessBranch(actor: MetaMessengerActor, branchId: string): boolean {
  if (asString(actor.role).toUpperCase() === 'ADMIN') return true;
  return [actor.branchId, ...(actor.assignedBranchIds || [])].filter(Boolean).includes(branchId);
}

function assertBranchAccess(actor: MetaMessengerActor, branchId: string) {
  if (!canAccessBranch(actor, branchId)) throw new Error('META_BRANCH_FORBIDDEN');
}

function configuredGraphVersion(value: unknown): string {
  const normalized = asString(value).replace(/^v/i, '');
  return /^\d+\.\d+$/.test(normalized) ? `v${normalized}` : 'v23.0';
}

export function getMetaMessengerConfig(env: NodeJS.ProcessEnv = process.env): MetaMessengerConfig {
  return {
    pageId: asString(env.META_PAGE_ID),
    pageName: asString(env.META_PAGE_NAME) || 'phonehousech109',
    pageAccessToken: asString(env.META_PAGE_ACCESS_TOKEN),
    appSecret: asString(env.META_APP_SECRET),
    verifyToken: asString(env.META_WEBHOOK_VERIFY_TOKEN),
    branchId: asString(env.META_BRANCH_ID) || undefined,
    graphApiVersion: configuredGraphVersion(env.META_GRAPH_API_VERSION)
  };
}

export function verifyMetaWebhookToken(provided: unknown, configured: unknown): boolean {
  return safeSecretEqual(provided, configured);
}

export function verifyMetaWebhookSignature(rawBody: Buffer, signatureHeader: unknown, appSecret: unknown): boolean {
  const signature = asString(Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader);
  const secret = asString(appSecret);
  if (!rawBody.length || !secret || !signature.startsWith('sha256=')) return false;
  const received = Buffer.from(signature.slice('sha256='.length), 'hex');
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'), 'hex');
  return received.length > 0 && received.length === expected.length && timingSafeEqual(received, expected);
}

export function metaConversationDocumentId(pageId: string, customerPsid: string): string {
  return hashId('META_CONV', pageId, customerPsid);
}

export function metaMessageDocumentId(pageId: string, messageId: string): string {
  return hashId('META_MSG', pageId, messageId);
}

function attachmentLabel(attachments: Array<Record<string, any>>): string {
  const types = new Set(attachments.map(item => asString(item.type).toLowerCase()).filter(Boolean));
  if (types.has('image')) return 'Đã gửi hình ảnh';
  if (types.has('video')) return 'Đã gửi video';
  if (types.has('audio')) return 'Đã gửi âm thanh';
  if (types.has('file')) return 'Đã gửi tệp đính kèm';
  return attachments.length ? 'Đã gửi tệp đính kèm' : '';
}

function normalizeMessagingEvent(pageId: string, raw: Record<string, any>): NormalizedMetaMessage | null {
  const senderId = asString(asObject(raw.sender).id);
  const recipientId = asString(asObject(raw.recipient).id);
  const message = asObject(raw.message);
  const postback = asObject(raw.postback);
  const isMessage = Boolean(Object.keys(message).length);
  const isPostback = Boolean(Object.keys(postback).length);
  if (!isMessage && !isPostback) return null;

  const isEcho = message.is_echo === true || senderId === pageId;
  const customerPsid = isEcho ? recipientId : senderId;
  if (!customerPsid || customerPsid === pageId) return null;

  const rawAttachments = (Array.isArray(message.attachments) ? message.attachments : [])
    .map(asObject)
    .filter(item => Object.keys(item).length > 0);
  const attachments = rawAttachments
    .map(item => asString(asObject(item.payload).url))
    .filter(Boolean);
  const content = asString(message.text)
    || asString(postback.title)
    || asString(postback.payload)
    || attachmentLabel(rawAttachments)
    || (message.is_deleted ? 'Tin nhắn đã được gỡ' : 'Tin nhắn Messenger');
  const timestamp = toIso(raw.timestamp);
  const externalMessageId = asString(message.mid)
    || asString(postback.mid)
    || hashId('META_EVT', pageId, customerPsid, timestamp, content, JSON.stringify(attachments));

  return {
    pageId,
    customerPsid,
    externalConversationId: customerPsid,
    externalMessageId,
    sender: isEcho ? 'STAFF' : 'CUSTOMER',
    senderName: isEcho ? 'PhoneHouse' : 'Khách Facebook',
    content,
    timestamp,
    attachments,
    messageKind: 'MESSAGE',
    rawKind: isPostback ? 'POSTBACK' : 'MESSAGE'
  };
}

export function normalizeMetaWebhookMessages(payload: unknown, configuredPageId = ''): NormalizedMetaMessage[] {
  const root = asObject(payload);
  if (asString(root.object).toLowerCase() !== 'page') return [];
  const normalized: NormalizedMetaMessage[] = [];
  for (const rawEntry of Array.isArray(root.entry) ? root.entry : []) {
    const entry = asObject(rawEntry);
    const pageId = asString(entry.id);
    if (!pageId || (configuredPageId && pageId !== configuredPageId)) continue;
    for (const rawMessaging of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const event = normalizeMessagingEvent(pageId, asObject(rawMessaging));
      if (event) normalized.push(event);
    }
  }
  return normalized.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

async function branchById(db: Firestore, branchId: string): Promise<ResolvedBranch | null> {
  if (!branchId) return null;
  const snapshot = await db.collection('branches').doc(branchId).get();
  if (!snapshot.exists || snapshot.data()?.isActive === false || snapshot.data()?.active === false) return null;
  return { id: snapshot.id, name: asString(snapshot.data()?.name) || snapshot.id };
}

async function resolveMetaBranch(db: Firestore, config: MetaMessengerConfig): Promise<ResolvedBranch> {
  const configured = await branchById(db, asString(config.branchId));
  if (configured) return configured;

  const [metaMapping, pancakeMapping] = await Promise.all([
    db.collection('metaPageMappings').doc(config.pageId).get(),
    db.collection('pancakePageMappings').doc(config.pageId).get()
  ]);
  const mappedBranchId = asString(metaMapping.data()?.branchId || pancakeMapping.data()?.branchId);
  const mapped = await branchById(db, mappedBranchId);
  if (mapped) return mapped;
  throw new Error('META_BRANCH_NOT_FOUND');
}

function messageDocument(message: NormalizedMetaMessage, branch: ResolvedBranch, conversationId: string) {
  const id = metaMessageDocumentId(message.pageId, message.externalMessageId);
  return {
    id,
    provider: 'META_MESSENGER',
    conversationId,
    externalConversationId: message.externalConversationId,
    externalMessageId: message.externalMessageId,
    customerPsid: message.customerPsid,
    pageId: message.pageId,
    branchId: branch.id,
    sender: message.sender,
    senderName: message.senderName,
    content: message.content,
    timestamp: safeTimestamp(message.timestamp),
    timestampIso: message.timestamp,
    attachments: message.attachments,
    messageKind: message.messageKind,
    metaEventKind: message.rawKind,
    createdAt: FieldValue.serverTimestamp()
  };
}

async function persistMetaMessage(
  db: Firestore,
  config: MetaMessengerConfig,
  branch: ResolvedBranch,
  message: NormalizedMetaMessage
) {
  const conversationId = metaConversationDocumentId(message.pageId, message.customerPsid);
  const messageId = metaMessageDocumentId(message.pageId, message.externalMessageId);
  const conversationRef = db.collection('chatConversations').doc(conversationId);
  const messageRef = db.collection('chatMessages').doc(messageId);
  return db.runTransaction(async transaction => {
    const [conversationSnapshot, existingMessageSnapshot] = await Promise.all([
      transaction.get(conversationRef),
      transaction.get(messageRef)
    ]);
    const existingConversation = conversationSnapshot.data() || {};
    const existingMessage = existingMessageSnapshot.data() || {};
    const document = messageDocument(message, branch, conversationId);
    const eventMillis = safeTimestamp(message.timestamp).toMillis();
    const existingLastMillis = existingConversation.lastMessageTime || existingConversation.updatedAt
      ? safeTimestamp(existingConversation.lastMessageTime || existingConversation.updatedAt).toMillis()
      : 0;
    const isLatest = eventMillis >= existingLastMillis;

    if (existingMessageSnapshot.exists) {
      const changed = asString(existingMessage.content) !== message.content
        || JSON.stringify(Array.isArray(existingMessage.attachments) ? existingMessage.attachments : []) !== JSON.stringify(message.attachments);
      if (changed) {
        transaction.set(messageRef, {
          content: message.content,
          attachments: message.attachments,
          timestamp: safeTimestamp(message.timestamp),
          timestampIso: message.timestamp,
          webhookUpdatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        if (isLatest) {
          transaction.set(conversationRef, {
            lastMessageSnippet: message.content,
            lastMessageTime: message.timestamp,
            updatedAt: safeTimestamp(message.timestamp),
            lastMetaWebhookAt: FieldValue.serverTimestamp()
          }, { merge: true });
        }
      }
      return { conversationId, messageId, duplicate: true, updated: changed };
    }

    const inbound = message.sender === 'CUSTOMER';
    const existingUnread = Math.max(0, asNumber(existingConversation.unreadCount));
    const conversationUpdates: Record<string, any> = {
      id: conversationId,
      provider: 'META_MESSENGER',
      pageId: message.pageId,
      pageName: config.pageName,
      externalConversationId: message.externalConversationId,
      customerPsid: message.customerPsid,
      branchId: branch.id,
      branchName: branch.name,
      channel: 'FACEBOOK',
      conversationType: 'INBOX',
      customerName: asString(existingConversation.customerName) || 'Khách Facebook',
      customerPhone: asString(existingConversation.customerPhone),
      createdAt: existingConversation.createdAt || safeTimestamp(message.timestamp),
      lastSyncedAt: FieldValue.serverTimestamp(),
      lastMetaWebhookAt: FieldValue.serverTimestamp()
    };
    if (isLatest) {
      conversationUpdates.lastMessageSnippet = message.content;
      conversationUpdates.lastMessageTime = message.timestamp;
      conversationUpdates.updatedAt = safeTimestamp(message.timestamp);
      conversationUpdates.awaitingStaffReply = inbound;
      conversationUpdates.workflowStatus = inbound
        ? (['WON', 'LOST', 'CLOSED'].includes(asString(existingConversation.workflowStatus).toUpperCase())
          ? 'OPEN'
          : asString(existingConversation.workflowStatus) || 'NEW')
        : (asString(existingConversation.workflowStatus) || 'OPEN');
      if (inbound) {
        conversationUpdates.unreadCount = existingUnread + 1;
        conversationUpdates.lastCustomerMessageAt = safeTimestamp(message.timestamp);
        if (!existingConversation.firstCustomerMessageAt) {
          conversationUpdates.firstCustomerMessageAt = safeTimestamp(message.timestamp);
        }
      } else {
        conversationUpdates.unreadCount = existingUnread;
        conversationUpdates.lastStaffMessageAt = safeTimestamp(message.timestamp);
      }
    }
    transaction.set(conversationRef, conversationUpdates, { merge: true });
    transaction.create(messageRef, document);
    return { conversationId, messageId, duplicate: false, updated: false };
  });
}

export async function processMetaMessengerWebhook(db: Firestore | null, payload: unknown) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const config = getMetaMessengerConfig();
  if (!config.pageId) throw new Error('META_PAGE_ID_NOT_CONFIGURED');
  const root = asObject(payload);
  if (asString(root.object).toLowerCase() !== 'page') {
    return { accepted: true, ignored: true, reason: 'UNSUPPORTED_OBJECT', processed: 0 };
  }
  const branch = await resolveMetaBranch(db, config);
  const messages = normalizeMetaWebhookMessages(payload, config.pageId);
  const results = [];
  for (const message of messages) {
    results.push(await persistMetaMessage(db, config, branch, message));
  }
  await db.collection('metaPageMappings').doc(config.pageId).set({
    pageId: config.pageId,
    pageName: config.pageName,
    branchId: branch.id,
    branchName: branch.name,
    isActive: true,
    lastWebhookAt: FieldValue.serverTimestamp(),
    lastWebhookEvent: messages.length ? 'MESSAGES' : 'NON_MESSAGE_EVENT',
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return {
    accepted: true,
    ignored: messages.length === 0,
    processed: results.filter(result => !result.duplicate).length,
    duplicates: results.filter(result => result.duplicate).length
  };
}

function clientMessage(document: Record<string, any>) {
  return {
    id: document.id,
    externalMessageId: document.externalMessageId,
    sender: document.sender,
    senderName: document.senderName,
    content: document.content,
    timestamp: document.timestampIso,
    attachments: document.attachments,
    messageKind: document.messageKind
  };
}

async function graphApiRequest(config: MetaMessengerConfig, path: string, body: Record<string, any>) {
  if (!config.pageAccessToken) throw new Error('META_PAGE_ACCESS_TOKEN_NOT_CONFIGURED');
  const response = await fetch(`https://graph.facebook.com/${config.graphApiVersion}/${path.replace(/^\//, '')}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.pageAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok || payload.error) {
    const error = asObject(payload.error);
    const code = asString(error.code) || String(response.status);
    const message = asString(error.message) || 'Meta không thể gửi tin nhắn.';
    throw new Error(`META_SEND_FAILED_${code}: ${message}`);
  }
  return payload;
}

export async function sendMetaMessengerMessage(
  db: Firestore | null,
  input: { conversationId: string; text: string; operationKey: string },
  actor: MetaMessengerActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const text = asString(input.text);
  if (!text) throw new Error('META_MESSAGE_REQUIRED');
  if (text.length > 2000) throw new Error('META_MESSAGE_TOO_LONG');
  const conversationSnapshot = await db.collection('chatConversations').doc(asString(input.conversationId)).get();
  if (!conversationSnapshot.exists) throw new Error('META_CONVERSATION_NOT_FOUND');
  const conversation = { id: conversationSnapshot.id, ...conversationSnapshot.data() } as Record<string, any>;
  if (conversation.provider !== 'META_MESSENGER') throw new Error('META_CONVERSATION_PROVIDER_MISMATCH');
  assertBranchAccess(actor, asString(conversation.branchId));
  const config = getMetaMessengerConfig();
  if (!config.pageId || asString(conversation.pageId) !== config.pageId) throw new Error('META_PAGE_NOT_CONFIGURED');
  const customerPsid = asString(conversation.customerPsid || conversation.externalConversationId);
  if (!customerPsid) throw new Error('META_CUSTOMER_PSID_MISSING');

  const operationId = hashId('META_SEND', input.operationKey || actor.uid, conversation.id, text);
  const operationRef = db.collection('metaSendOperations').doc(operationId);
  try {
    await operationRef.create({
      id: operationId,
      operationKey: asString(input.operationKey),
      conversationId: conversation.id,
      branchId: conversation.branchId,
      pageId: conversation.pageId,
      actorUid: actor.uid,
      status: 'PENDING',
      createdAt: FieldValue.serverTimestamp()
    });
  } catch {
    const existing = await operationRef.get();
    if (existing.data()?.status === 'SENT' && existing.data()?.message) {
      return { message: existing.data()!.message, idempotentReplay: true };
    }
    throw new Error('META_SEND_ALREADY_PROCESSING');
  }

  try {
    const response = await graphApiRequest(config, `${config.pageId}/messages`, {
      messaging_type: 'RESPONSE',
      recipient: { id: customerPsid },
      message: { text }
    });
    const externalMessageId = asString(response.message_id) || operationId;
    const normalized: NormalizedMetaMessage = {
      pageId: config.pageId,
      customerPsid,
      externalConversationId: customerPsid,
      externalMessageId,
      sender: 'STAFF',
      senderName: asString(actor.name) || 'Nhân viên PhoneHouse',
      content: text,
      timestamp: new Date().toISOString(),
      attachments: [],
      messageKind: 'MESSAGE',
      rawKind: 'MESSAGE'
    };
    const document = messageDocument(normalized, {
      id: asString(conversation.branchId),
      name: asString(conversation.branchName)
    }, conversation.id);
    const messageRef = db.collection('chatMessages').doc(document.id);
    await db.runTransaction(async transaction => {
      const [freshConversation, existingMessage] = await Promise.all([
        transaction.get(conversationSnapshot.ref),
        transaction.get(messageRef)
      ]);
      if (!freshConversation.exists) throw new Error('META_CONVERSATION_NOT_FOUND');
      if (!existingMessage.exists) transaction.create(messageRef, document);
      transaction.set(conversationSnapshot.ref, {
        lastMessageSnippet: text,
        lastMessageTime: normalized.timestamp,
        lastStaffMessageAt: safeTimestamp(normalized.timestamp),
        updatedAt: safeTimestamp(normalized.timestamp),
        awaitingStaffReply: false,
        unreadCount: 0,
        lastSyncedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      transaction.set(operationRef, {
        status: 'SENT',
        externalMessageId,
        message: clientMessage(document),
        completedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    });
    return { message: clientMessage(document), idempotentReplay: false };
  } catch (error: any) {
    await operationRef.set({
      status: 'FAILED',
      error: asString(error?.message),
      failedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    throw error;
  }
}

export async function markMetaConversationRead(
  db: Firestore | null,
  conversationId: string,
  actor: MetaMessengerActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const snapshot = await db.collection('chatConversations').doc(asString(conversationId)).get();
  if (!snapshot.exists) throw new Error('META_CONVERSATION_NOT_FOUND');
  const conversation = snapshot.data() || {};
  if (conversation.provider !== 'META_MESSENGER') throw new Error('META_CONVERSATION_PROVIDER_MISMATCH');
  assertBranchAccess(actor, asString(conversation.branchId));
  await snapshot.ref.set({
    unreadCount: 0,
    readAt: FieldValue.serverTimestamp(),
    readByUid: actor.uid
  }, { merge: true });
  return { conversationId: snapshot.id, unreadCount: 0 };
}
