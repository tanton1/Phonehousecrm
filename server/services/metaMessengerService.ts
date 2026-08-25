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
  customerName: string;
  content: string;
  timestamp: string;
  attachments: string[];
  messageKind: 'MESSAGE' | 'COMMENT';
  conversationType: 'INBOX' | 'COMMENT';
  rawKind: 'MESSAGE' | 'POSTBACK' | 'COMMENT';
  metaConversationId?: string;
  postId?: string;
  commentId?: string;
  parentCommentId?: string;
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

function isManager(actor: MetaMessengerActor): boolean {
  return ['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER'].includes(asString(actor.role).toUpperCase());
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
    customerName: 'Khách Facebook',
    content,
    timestamp,
    attachments,
    messageKind: 'MESSAGE',
    conversationType: 'INBOX',
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

export function normalizeMetaFeedComments(payload: unknown, configuredPageId = ''): NormalizedMetaMessage[] {
  const root = asObject(payload);
  if (asString(root.object).toLowerCase() !== 'page') return [];
  const normalized: NormalizedMetaMessage[] = [];
  for (const rawEntry of Array.isArray(root.entry) ? root.entry : []) {
    const entry = asObject(rawEntry);
    const pageId = asString(entry.id);
    if (!pageId || (configuredPageId && pageId !== configuredPageId)) continue;
    for (const rawChange of Array.isArray(entry.changes) ? entry.changes : []) {
      const change = asObject(rawChange);
      const value = asObject(change.value);
      if (asString(change.field).toLowerCase() !== 'feed' || asString(value.item).toLowerCase() !== 'comment') continue;
      const author = asObject(value.from);
      const authorId = asString(author.id);
      const commentId = asString(value.comment_id || value.id);
      const postId = asString(value.post_id);
      if (!authorId || authorId === pageId || !commentId || !postId) continue;
      const verb = asString(value.verb).toLowerCase();
      const timestamp = toIso(value.created_time || entry.time);
      normalized.push({
        pageId,
        customerPsid: authorId,
        externalConversationId: `COMMENT:${postId}:${authorId}`,
        externalMessageId: commentId,
        sender: 'CUSTOMER',
        senderName: asString(author.name) || 'Khách Facebook',
        customerName: asString(author.name) || 'Khách Facebook',
        content: verb === 'remove' ? 'Bình luận đã được xóa' : asString(value.message) || 'Khách đã gửi bình luận',
        timestamp,
        attachments: [],
        messageKind: 'COMMENT',
        conversationType: 'COMMENT',
        rawKind: 'COMMENT',
        postId,
        commentId,
        parentCommentId: asString(value.parent_id) || undefined
      });
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
    ...(message.metaConversationId ? { metaConversationId: message.metaConversationId } : {}),
    ...(message.postId ? { postId: message.postId } : {}),
    ...(message.commentId ? { commentId: message.commentId } : {}),
    ...(message.parentCommentId ? { parentCommentId: message.parentCommentId } : {}),
    createdAt: FieldValue.serverTimestamp()
  };
}

async function persistMetaMessage(
  db: Firestore,
  config: MetaMessengerConfig,
  branch: ResolvedBranch,
  message: NormalizedMetaMessage
) {
  const conversationId = metaConversationDocumentId(message.pageId, message.externalConversationId);
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
      ...(message.metaConversationId ? { metaConversationId: message.metaConversationId } : {}),
      branchId: branch.id,
      branchName: branch.name,
      channel: 'FACEBOOK',
      conversationType: message.conversationType,
      customerName: asString(existingConversation.customerName) || message.customerName || 'Khách Facebook',
      customerPhone: asString(existingConversation.customerPhone),
      ...(message.postId ? { postId: message.postId } : {}),
      ...(message.commentId ? { lastCommentId: message.commentId } : {}),
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
  const messages = [
    ...normalizeMetaWebhookMessages(payload, config.pageId),
    ...normalizeMetaFeedComments(payload, config.pageId)
  ].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
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
    lastWebhookEvent: messages.some(message => message.messageKind === 'COMMENT')
      ? 'FEED_COMMENT'
      : messages.length ? 'MESSAGES' : 'NON_MESSAGE_EVENT',
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return {
    accepted: true,
    ignored: messages.length === 0,
    processed: results.filter(result => !result.duplicate).length,
    duplicates: results.filter(result => result.duplicate).length
  };
}

export async function getMetaMessengerChannel(db: Firestore | null, actor: MetaMessengerActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const config = getMetaMessengerConfig();
  let branch: ResolvedBranch | null = null;
  let branchError = '';
  if (config.pageId) {
    try { branch = await resolveMetaBranch(db, config); } catch (error: any) { branchError = error?.message || 'META_BRANCH_NOT_FOUND'; }
  }
  if (branch && !canAccessBranch(actor, branch.id)) return null;
  const mapping = config.pageId
    ? asObject((await db.collection('metaPageMappings').doc(config.pageId).get()).data())
    : {};
  const configurationError = !config.pageId
    ? 'META_PAGE_ID_NOT_CONFIGURED'
    : !config.appSecret
      ? 'META_APP_SECRET_NOT_CONFIGURED'
      : !config.verifyToken
        ? 'META_WEBHOOK_VERIFY_TOKEN_NOT_CONFIGURED'
        : branchError;
  return {
    provider: 'META_MESSENGER' as const,
    pageId: config.pageId,
    pageName: config.pageName,
    branchId: branch?.id || config.branchId || '',
    branchName: branch?.name || 'Phonehouse',
    historyDays: Math.min(90, Math.max(1, asNumber(process.env.META_SYNC_DAYS, 30))),
    includeComments: true,
    status: configurationError ? 'CONFIG_ERROR' : config.pageAccessToken ? 'READY' : 'MISSING_TOKEN',
    webhookStatus: mapping.lastWebhookAt ? 'RECEIVING' : 'NOT_SEEN',
    ...(mapping.lastWebhookAt ? { lastWebhookAt: toIso(mapping.lastWebhookAt) } : {}),
    ...(asString(mapping.lastWebhookEvent) ? { lastWebhookEvent: asString(mapping.lastWebhookEvent) } : {}),
    connectionStatus: configurationError ? 'UNKNOWN' : 'CONNECTED',
    ...(configurationError ? { error: configurationError } : {}),
    ...(!config.pageAccessToken ? { requiredTokenEnv: 'META_PAGE_ACCESS_TOKEN' } : {})
  };
}

export async function setMetaBranchMapping(
  db: Firestore | null,
  input: { pageId: string; branchId: string },
  actor: MetaMessengerActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isManager(actor)) throw new Error('META_BRANCH_MAPPING_FORBIDDEN');
  const config = getMetaMessengerConfig();
  if (!config.pageId || asString(input.pageId) !== config.pageId) throw new Error('META_PAGE_NOT_CONFIGURED');
  const branch = await branchById(db, asString(input.branchId));
  if (!branch) throw new Error('META_BRANCH_NOT_FOUND');
  assertBranchAccess(actor, branch.id);
  await db.collection('metaPageMappings').doc(config.pageId).set({
    pageId: config.pageId,
    pageName: config.pageName,
    branchId: branch.id,
    branchName: branch.name,
    isActive: true,
    updatedByUid: actor.uid,
    updatedByName: asString(actor.name) || actor.uid,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return {
    provider: 'META_MESSENGER' as const,
    pageId: config.pageId,
    pageName: config.pageName,
    branchId: branch.id,
    branchName: branch.name,
    status: config.pageAccessToken ? 'READY' : 'MISSING_TOKEN'
  };
}

export async function getMetaWebhookSetup(
  db: Firestore | null,
  pageId: string,
  actor: MetaMessengerActor,
  requestOrigin: string
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isManager(actor)) throw new Error('META_WEBHOOK_SETUP_FORBIDDEN');
  const config = getMetaMessengerConfig();
  if (!config.pageId || asString(pageId) !== config.pageId) throw new Error('META_PAGE_NOT_CONFIGURED');
  const branch = await resolveMetaBranch(db, config);
  assertBranchAccess(actor, branch.id);
  const origin = asString(requestOrigin || process.env.APP_URL).replace(/\/$/, '');
  if (!origin) throw new Error('META_WEBHOOK_ORIGIN_NOT_CONFIGURED');
  const mapping = asObject((await db.collection('metaPageMappings').doc(config.pageId).get()).data());
  return {
    provider: 'META_MESSENGER' as const,
    pageId: config.pageId,
    pageName: config.pageName,
    branchId: branch.id,
    branchName: branch.name,
    callbackUrl: `${origin}/api/meta/webhook`,
    webhookStatus: mapping.lastWebhookAt ? 'RECEIVING' : 'NOT_SEEN',
    ...(mapping.lastWebhookAt ? { lastWebhookAt: toIso(mapping.lastWebhookAt) } : {}),
    ...(asString(mapping.lastWebhookEvent) ? { lastWebhookEvent: asString(mapping.lastWebhookEvent) } : {}),
    connectionStatus: config.pageAccessToken ? 'CONNECTED' : 'UNKNOWN',
    requiredEvents: [
      'messages', 'message_echoes', 'message_deliveries', 'message_reads',
      'message_reactions', 'message_edits', 'messaging_postbacks', 'feed'
    ],
    docsUrl: 'https://developers.facebook.com/docs/messenger-platform/webhooks'
  };
}

async function graphApiGet(config: MetaMessengerConfig, pathOrUrl: string): Promise<Record<string, any>> {
  if (!config.pageAccessToken) throw new Error('META_PAGE_ACCESS_TOKEN_NOT_CONFIGURED');
  const baseUrl = `https://graph.facebook.com/${config.graphApiVersion}/`;
  const url = pathOrUrl.startsWith('https://graph.facebook.com/')
    ? pathOrUrl
    : `${baseUrl}${pathOrUrl.replace(/^\//, '')}`;
  if (!url.startsWith('https://graph.facebook.com/')) throw new Error('META_PAGING_URL_INVALID');
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${config.pageAccessToken}` }
  });
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok || payload.error) {
    const error = asObject(payload.error);
    const code = asString(error.code) || String(response.status);
    const message = asString(error.message) || 'Meta không thể đọc dữ liệu hội thoại.';
    throw new Error(`META_API_FAILED_${code}: ${message}`);
  }
  return payload;
}

function participantFromConversation(raw: Record<string, any>, pageId: string): Record<string, any> {
  const participants = Array.isArray(asObject(raw.participants).data)
    ? asObject(raw.participants).data.map(asObject)
    : [];
  return participants.find((participant: Record<string, any>) => asString(participant.id) && asString(participant.id) !== pageId) || {};
}

function attachmentsFromGraphMessage(raw: Record<string, any>): string[] {
  const container = asObject(raw.attachments);
  const values = Array.isArray(container.data)
    ? container.data
    : Array.isArray(raw.attachments) ? raw.attachments : [];
  return values.map(asObject).flatMap(item => {
    const target = asObject(item.image_data || item.video_data || item.file_url || item.payload);
    return [asString(item.file_url || item.url || target.url || target.preview_url)].filter(Boolean);
  });
}

function normalizeGraphMessage(
  raw: Record<string, any>,
  config: MetaMessengerConfig,
  customerPsid: string,
  customerName: string,
  metaConversationId: string
): NormalizedMetaMessage | null {
  const messageId = asString(raw.id);
  if (!messageId) return null;
  const from = asObject(raw.from);
  const senderIsPage = asString(from.id) === config.pageId;
  const attachments = attachmentsFromGraphMessage(raw);
  const content = asString(raw.message) || (attachments.length ? 'Đã gửi tệp đính kèm' : 'Tin nhắn Messenger');
  return {
    pageId: config.pageId,
    customerPsid,
    externalConversationId: customerPsid,
    externalMessageId: messageId,
    sender: senderIsPage ? 'STAFF' : 'CUSTOMER',
    senderName: senderIsPage ? config.pageName : asString(from.name) || customerName,
    customerName,
    content,
    timestamp: toIso(raw.created_time),
    attachments,
    messageKind: 'MESSAGE',
    conversationType: 'INBOX',
    rawKind: 'MESSAGE',
    metaConversationId
  };
}

async function persistMetaConversationSummaries(
  db: Firestore,
  config: MetaMessengerConfig,
  branch: ResolvedBranch,
  conversations: Array<Record<string, any>>
) {
  const summaries = conversations.map(raw => {
    const participant = participantFromConversation(raw, config.pageId);
    const customerPsid = asString(participant.id);
    if (!customerPsid) return null;
    const messages = Array.isArray(asObject(raw.messages).data) ? asObject(raw.messages).data.map(asObject) : [];
    const latest = messages
      .map(message => normalizeGraphMessage(message, config, customerPsid, asString(participant.name) || 'Khách Facebook', asString(raw.id)))
      .filter(Boolean)
      .sort((left: any, right: any) => Date.parse(right.timestamp) - Date.parse(left.timestamp))[0] as NormalizedMetaMessage | undefined;
    const updatedAt = toIso(raw.updated_time || latest?.timestamp);
    const conversationId = metaConversationDocumentId(config.pageId, customerPsid);
    return {
      conversationId,
      message: latest,
      updatedAt,
      data: {
        id: conversationId,
        provider: 'META_MESSENGER',
        pageId: config.pageId,
        pageName: config.pageName,
        externalConversationId: customerPsid,
        metaConversationId: asString(raw.id),
        customerPsid,
        branchId: branch.id,
        branchName: branch.name,
        channel: 'FACEBOOK',
        conversationType: 'INBOX',
        customerName: asString(participant.name) || 'Khách Facebook',
        customerPhone: '',
        lastMessageSnippet: latest?.content || 'Hội thoại Facebook',
        lastMessageTime: latest?.timestamp || updatedAt,
        updatedAt: safeTimestamp(updatedAt),
        lastSyncedAt: FieldValue.serverTimestamp()
      }
    };
  }).filter(Boolean) as Array<Record<string, any>>;
  if (!summaries.length) return 0;
  const conversationRefs = summaries.map(summary => db.collection('chatConversations').doc(summary.conversationId));
  const messageRefs = summaries.map(summary => summary.message
    ? db.collection('chatMessages').doc(metaMessageDocumentId(config.pageId, summary.message.externalMessageId))
    : null);
  const snapshots = await db.getAll(...conversationRefs, ...messageRefs.filter(Boolean));
  const snapshotByPath = new Map(snapshots.map(snapshot => [snapshot.ref.path, snapshot]));
  const batch = db.batch();
  for (let index = 0; index < summaries.length; index += 1) {
    const summary = summaries[index];
    const ref = conversationRefs[index];
    const existing = snapshotByPath.get(ref.path);
    const existingData = existing?.data() || {};
    const existingMillis = existing?.exists ? safeTimestamp(existingData.updatedAt || existingData.lastMessageTime).toMillis() : 0;
    const updateMillis = safeTimestamp(summary.updatedAt).toMillis();
    const data = updateMillis >= existingMillis
      ? { ...summary.data, createdAt: existingData.createdAt || safeTimestamp(summary.updatedAt) }
      : {
          provider: 'META_MESSENGER',
          metaConversationId: summary.data.metaConversationId,
          customerPsid: summary.data.customerPsid,
          customerName: asString(existingData.customerName) || summary.data.customerName,
          lastSyncedAt: FieldValue.serverTimestamp()
        };
    if (!existing?.exists) {
      Object.assign(data, { unreadCount: 0, workflowStatus: 'OPEN', awaitingStaffReply: false });
    }
    batch.set(ref, data, { merge: true });
    if (summary.message && messageRefs[index]) {
      const messageRef = messageRefs[index]!;
      if (!snapshotByPath.get(messageRef.path)?.exists) {
        batch.set(messageRef, messageDocument(summary.message, branch, summary.conversationId), { merge: true });
      }
    }
  }
  await batch.commit();
  return summaries.length;
}

export async function syncMetaConversations(
  db: Firestore | null,
  input: { pageId: string; cursor?: string },
  actor: MetaMessengerActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isManager(actor)) throw new Error('META_SYNC_FORBIDDEN');
  const config = getMetaMessengerConfig();
  if (!config.pageId || asString(input.pageId) !== config.pageId) throw new Error('META_PAGE_NOT_CONFIGURED');
  const branch = await resolveMetaBranch(db, config);
  assertBranchAccess(actor, branch.id);
  const historyDays = Math.min(90, Math.max(1, asNumber(process.env.META_SYNC_DAYS, 30)));
  const cutoff = Date.now() - historyDays * 24 * 60 * 60 * 1000;
  const fields = 'id,updated_time,participants,messages.limit(1){id,created_time,from,to,message,attachments}';
  const params = new URLSearchParams({ fields, limit: '50' });
  if (asString(input.cursor)) params.set('after', asString(input.cursor));
  const payload = await graphApiGet(config, `${config.pageId}/conversations?${params}`);
  const rawItems = Array.isArray(payload.data) ? payload.data.map(asObject) : [];
  const inRange = rawItems.filter(item => safeTimestamp(item.updated_time).toMillis() >= cutoff);
  const imported = await persistMetaConversationSummaries(db, config, branch, inRange);
  const oldest = rawItems.reduce(
    (minimum, item) => Math.min(minimum, safeTimestamp(item.updated_time).toMillis()),
    Number.POSITIVE_INFINITY
  );
  const nextCursor = asString(asObject(asObject(payload.paging).cursors).after);
  const done = !nextCursor || rawItems.length === 0 || oldest < cutoff;
  return {
    pageId: config.pageId,
    imported,
    scanned: rawItems.length,
    nextCursor: done ? null : nextCursor,
    done,
    cutoffAt: new Date(cutoff).toISOString()
  };
}

async function persistMetaHistoryMessages(
  db: Firestore,
  config: MetaMessengerConfig,
  branch: ResolvedBranch,
  conversation: Record<string, any>,
  messages: NormalizedMetaMessage[]
) {
  if (!messages.length) return 0;
  const conversationId = asString(conversation.id)
    || metaConversationDocumentId(config.pageId, messages[0].externalConversationId);
  const conversationRef = db.collection('chatConversations').doc(conversationId);
  const messageRefs = messages.map(message => db.collection('chatMessages').doc(
    metaMessageDocumentId(config.pageId, message.externalMessageId)
  ));
  const snapshots = await db.getAll(conversationRef, ...messageRefs);
  const conversationSnapshot = snapshots[0];
  const snapshotByPath = new Map(snapshots.slice(1).map(snapshot => [snapshot.ref.path, snapshot]));
  const batch = db.batch();
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const ref = messageRefs[index];
    const existing = snapshotByPath.get(ref.path);
    const document = messageDocument(message, branch, conversationId);
    if (!existing?.exists) {
      batch.set(ref, document, { merge: true });
      continue;
    }
    const existingData = existing.data() || {};
    if (asString(existingData.content) !== message.content
      || JSON.stringify(existingData.attachments || []) !== JSON.stringify(message.attachments)) {
      batch.set(ref, {
        content: message.content,
        attachments: message.attachments,
        timestamp: safeTimestamp(message.timestamp),
        timestampIso: message.timestamp,
        historyRefreshedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
  }
  const latest = [...messages].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))[0];
  const current = conversationSnapshot.data() || {};
  const currentMillis = conversationSnapshot.exists
    ? safeTimestamp(current.updatedAt || current.lastMessageTime).toMillis()
    : 0;
  const latestMillis = safeTimestamp(latest.timestamp).toMillis();
  const conversationUpdate: Record<string, any> = {
    provider: 'META_MESSENGER',
    metaConversationId: latest.metaConversationId,
    customerPsid: latest.customerPsid,
    customerName: asString(current.customerName) || latest.customerName,
    lastSyncedAt: FieldValue.serverTimestamp()
  };
  if (!conversationSnapshot.exists) {
    Object.assign(conversationUpdate, {
      id: conversationId,
      pageId: config.pageId,
      pageName: config.pageName,
      externalConversationId: latest.externalConversationId,
      branchId: branch.id,
      branchName: branch.name,
      channel: 'FACEBOOK',
      conversationType: 'INBOX',
      customerPhone: '',
      unreadCount: 0,
      workflowStatus: 'OPEN',
      createdAt: safeTimestamp(messages[0].timestamp)
    });
  }
  if (latestMillis >= currentMillis) {
    Object.assign(conversationUpdate, {
      lastMessageSnippet: latest.content,
      lastMessageTime: latest.timestamp,
      updatedAt: safeTimestamp(latest.timestamp),
      awaitingStaffReply: latest.sender === 'CUSTOMER'
    });
  }
  batch.set(conversationRef, conversationUpdate, { merge: true });
  await batch.commit();
  return messages.length;
}

export async function refreshMetaConversationMessages(
  db: Firestore | null,
  conversation: Record<string, any>
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const config = getMetaMessengerConfig();
  if (!config.pageId || asString(conversation.pageId) !== config.pageId) throw new Error('META_PAGE_NOT_CONFIGURED');
  const branch = await resolveMetaBranch(db, config);
  const customerPsid = asString(conversation.customerPsid || conversation.externalConversationId);
  let metaConversationId = asString(conversation.metaConversationId);
  if (!metaConversationId && customerPsid) {
    const lookup = await graphApiGet(config, `${config.pageId}/conversations?${new URLSearchParams({ user_id: customerPsid, limit: '1' })}`);
    metaConversationId = asString(Array.isArray(lookup.data) ? asObject(lookup.data[0]).id : '');
  }
  if (!metaConversationId) throw new Error('META_CONVERSATION_EXTERNAL_ID_MISSING');
  const fields = 'id,messages.limit(100){id,created_time,from,to,message,attachments}';
  const payload = await graphApiGet(config, `${metaConversationId}?${new URLSearchParams({ fields })}`);
  const rawMessages = Array.isArray(asObject(payload.messages).data) ? asObject(payload.messages).data.map(asObject) : [];
  const normalized = rawMessages
    .map(raw => normalizeGraphMessage(
      raw,
      config,
      customerPsid,
      asString(conversation.customerName) || 'Khách Facebook',
      metaConversationId
    ))
    .filter(Boolean) as NormalizedMetaMessage[];
  const imported = await persistMetaHistoryMessages(
    db,
    config,
    branch,
    conversation,
    normalized.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
  );
  return { imported, metaConversationId };
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
    const isComment = asString(conversation.conversationType).toUpperCase() === 'COMMENT';
    const replyToCommentId = asString(conversation.lastCommentId);
    if (isComment && !replyToCommentId) throw new Error('META_COMMENT_REPLY_TARGET_MISSING');
    const response = isComment
      ? await graphApiRequest(config, `${replyToCommentId}/comments`, { message: text })
      : await graphApiRequest(config, `${config.pageId}/messages`, {
          messaging_type: 'RESPONSE',
          recipient: { id: customerPsid },
          message: { text }
        });
    const externalMessageId = asString(response.message_id || response.id) || operationId;
    const normalized: NormalizedMetaMessage = {
      pageId: config.pageId,
      customerPsid,
      externalConversationId: asString(conversation.externalConversationId) || customerPsid,
      externalMessageId,
      sender: 'STAFF',
      senderName: asString(actor.name) || 'Nhân viên PhoneHouse',
      customerName: asString(conversation.customerName) || 'Khách Facebook',
      content: text,
      timestamp: new Date().toISOString(),
      attachments: [],
      messageKind: isComment ? 'COMMENT' : 'MESSAGE',
      conversationType: isComment ? 'COMMENT' : 'INBOX',
      rawKind: isComment ? 'COMMENT' : 'MESSAGE',
      ...(isComment ? {
        postId: asString(conversation.postId),
        commentId: externalMessageId,
        parentCommentId: replyToCommentId
      } : {})
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
