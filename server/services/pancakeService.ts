import { createHash, timingSafeEqual } from 'crypto';
import { FieldPath, FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import { normalizeOperationalPolicyVersions, selectEffectiveOperationalPolicy } from './operationalPolicyService';
import { refreshMetaConversationMessages } from './metaMessengerService';

const PANCAKE_PAGE_API_V1 = 'https://pages.fm/api/public_api/v1';
const PANCAKE_PAGE_API_V2 = 'https://pages.fm/api/public_api/v2';
const DEFAULT_PAGE_ID = '332799593244601';

export interface PancakePageConfig {
  pageId: string;
  pageName: string;
  branchId?: string;
  branchName: string;
  historyDays: number;
  includeComments: boolean;
  pageAccessToken: string;
  tokenEnv: string;
}

export interface PancakeActor {
  uid: string;
  role: string;
  branchId?: string;
  assignedBranchIds?: string[];
  name?: string;
}

interface ResolvedBranch {
  id: string;
  name: string;
}

export interface PancakeBranchOption extends ResolvedBranch {
  code: string;
}

interface NormalizedConversation {
  externalConversationId: string;
  pageId: string;
  pageName: string;
  channel: 'FACEBOOK' | 'INSTAGRAM' | 'ZALO' | 'TIKTOK' | 'WHATSAPP' | 'WEB';
  conversationType: 'INBOX' | 'COMMENT';
  customerName: string;
  customerPhone: string;
  avatarUrl?: string;
  lastMessageSnippet: string;
  lastMessageTime: string;
  unreadCount: number;
  updatedAt: string;
  createdAt: string;
}

interface NormalizedMessage {
  externalMessageId: string;
  sender: 'CUSTOMER' | 'STAFF' | 'BOT';
  senderName: string;
  content: string;
  timestamp: string;
  attachments: string[];
  messageKind: 'MESSAGE' | 'COMMENT';
}

interface NormalizedConversationEvent {
  conversation: NormalizedConversation;
  requestId: string;
  version: number;
  externalAssigneeIds: string[];
  externalTagIds: string[];
  seen?: boolean;
  isReplied?: boolean;
}

interface NormalizedConnectStatusEvent {
  pageId: string;
  requestId: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
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

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (['true', '1', 'yes', 'on', 'có'].includes(value.toLowerCase())) return true;
    if (['false', '0', 'no', 'off', 'không'].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

function normalizeText(value: unknown): string {
  return asString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compactNormalizedText(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, '');
}

function configuredBranchMatches(data: Record<string, any>, target: string, exactOnly: boolean): boolean {
  const targetCompact = compactNormalizedText(target);
  if (!targetCompact) return false;
  const values = [
    data.name,
    data.code,
    data.shortName,
    data.systemName,
    data.systemType,
    data.brandName
  ];
  return values.some((value) => {
    const normalized = normalizeText(value);
    const compact = compactNormalizedText(value);
    if (!compact) return false;
    if (normalized === target || compact === targetCompact) return true;
    return !exactOnly && (normalized.includes(target) || compact.includes(targetCompact));
  });
}

function normalizePhone(value: unknown): string {
  return asString(value).replace(/[^0-9+]/g, '');
}

function toIso(value: unknown, fallback = new Date().toISOString()): string {
  if (!value) return fallback;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'number') {
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }
  const object = asObject(value);
  if (object.seconds !== undefined || object._seconds !== undefined) {
    const seconds = asNumber(object.seconds ?? object._seconds);
    const nanos = asNumber(object.nanoseconds ?? object._nanoseconds);
    return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000)).toISOString();
  }
  const date = new Date(asString(value));
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function safeTimestamp(value: unknown): Timestamp {
  return Timestamp.fromDate(new Date(toIso(value)));
}

function hashId(prefix: string, ...values: unknown[]): string {
  return `${prefix}_${createHash('sha256').update(values.map(value => asString(value)).join('|')).digest('hex').slice(0, 40)}`;
}

export function pancakeConversationDocumentId(pageId: string, conversationId: string): string {
  return hashId('PCK_CONV', pageId, conversationId);
}

export function pancakeMessageDocumentId(pageId: string, conversationId: string, messageId: string): string {
  return hashId('PCK_MSG', pageId, conversationId, messageId);
}

function configuredPageFromRaw(raw: Record<string, any>, env: NodeJS.ProcessEnv): PancakePageConfig | null {
  const pageId = asString(raw.pageId || raw.page_id);
  if (!pageId) return null;
  const normalizedPageName = asString(raw.pageName || raw.page_name) || `Pancake ${pageId}`;
  const tokenEnv = asString(raw.tokenEnv || raw.token_env) || (pageId === asString(env.PANCAKE_PAGE_ID || DEFAULT_PAGE_ID)
    ? 'PANCAKE_PAGE_ACCESS_TOKEN'
    : `PANCAKE_PAGE_TOKEN_${pageId}`);
  return {
    pageId,
    pageName: normalizedPageName,
    branchId: asString(raw.branchId || raw.branch_id) || undefined,
    branchName: asString(raw.branchName || raw.branch_name) || 'Phonehouse',
    historyDays: Math.min(365, Math.max(1, asNumber(raw.historyDays || raw.history_days, 30))),
    includeComments: asBoolean(raw.includeComments ?? raw.include_comments, true),
    pageAccessToken: asString(raw.pageAccessToken || raw.page_access_token || env[tokenEnv]),
    tokenEnv
  };
}

export function getPancakePageConfigs(env: NodeJS.ProcessEnv = process.env): PancakePageConfig[] {
  const rawJson = asString(env.PANCAKE_PAGES_JSON);
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        const configs = parsed.map(item => configuredPageFromRaw(asObject(item), env)).filter(Boolean) as PancakePageConfig[];
        if (configs.length) return configs;
      }
    } catch (error) {
      console.error('[Pancake] PANCAKE_PAGES_JSON không phải JSON hợp lệ.', error);
    }
  }
  const tokenEnv = asString(env.PANCAKE_PAGE_TOKEN_ENV) || 'PANCAKE_PAGE_ACCESS_TOKEN';
  const single = configuredPageFromRaw({
    pageId: env.PANCAKE_PAGE_ID || DEFAULT_PAGE_ID,
    pageName: env.PANCAKE_PAGE_NAME || 'phonehousech109',
    branchId: env.PANCAKE_BRANCH_ID,
    branchName: env.PANCAKE_BRANCH_NAME || 'Phonehouse',
    historyDays: env.PANCAKE_HISTORY_DAYS || 30,
    includeComments: env.PANCAKE_INCLUDE_COMMENTS ?? true,
    tokenEnv
  }, env);
  return single ? [single] : [];
}

function channelFromRaw(raw: Record<string, any>): NormalizedConversation['channel'] {
  const source = normalizeText(raw.channel || raw.platform || raw.page_type || raw.network || raw.type);
  if (source.includes('instagram')) return 'INSTAGRAM';
  if (source.includes('zalo')) return 'ZALO';
  if (source.includes('tiktok')) return 'TIKTOK';
  if (source.includes('whatsapp')) return 'WHATSAPP';
  if (source.includes('web') || source.includes('plugin')) return 'WEB';
  return 'FACEBOOK';
}

function findCustomer(raw: Record<string, any>): Record<string, any> {
  return asObject(raw.page_customer || raw.customer || raw.from || raw.sender || raw.user || raw.participant);
}

function firstPhone(customer: Record<string, any>, raw: Record<string, any>): string {
  const candidates = [
    customer.phone, customer.phone_number, customer.mobile, raw.phone, raw.phone_number,
    ...(Array.isArray(customer.phone_numbers) ? customer.phone_numbers : []),
    ...(Array.isArray(raw.phone_numbers) ? raw.phone_numbers : [])
  ];
  for (const candidate of candidates) {
    const value = typeof candidate === 'object' ? asString(candidate?.value || candidate?.phone) : asString(candidate);
    if (value) return normalizePhone(value);
  }
  return '';
}

function messageText(raw: Record<string, any>): string {
  const nested = asObject(raw.message);
  const data = asObject(raw.data);
  const payload = asObject(raw.payload);
  const comment = asObject(raw.comment);
  const candidates = [
    raw.text,
    raw.content,
    raw.body,
    raw.original_message,
    raw.snippet,
    typeof raw.message === 'object' ? '' : raw.message,
    typeof raw.last_message === 'object' ? '' : raw.last_message,
    typeof raw.lastMessage === 'object' ? '' : raw.lastMessage,
    raw.caption,
    nested.text,
    nested.content,
    nested.body,
    typeof nested.message === 'object' ? '' : nested.message,
    nested.caption,
    data.text,
    data.content,
    data.body,
    typeof data.message === 'object' ? '' : data.message,
    payload.text,
    payload.content,
    payload.body,
    typeof payload.message === 'object' ? '' : payload.message,
    comment.message,
    comment.text,
    comment.content
  ];
  for (const candidate of candidates) {
    const value = asString(candidate);
    if (value) return value;
  }
  return '';
}

function attachmentUrls(raw: Record<string, any>): string[] {
  const nested = asObject(raw.message);
  const data = asObject(raw.data);
  const payload = asObject(raw.payload);
  const values = [
    raw.attachments,
    nested.attachments,
    data.attachments,
    payload.attachments,
    raw.attachment,
    nested.attachment,
    data.attachment,
    payload.attachment,
    raw.images,
    raw.image,
    raw.photos,
    raw.photo,
    raw.video,
    raw.file,
    raw.sticker,
    raw.media,
    nested.images,
    nested.image,
    nested.video,
    nested.file,
    nested.sticker,
    nested.media
  ].flatMap(value => Array.isArray(value) ? value : value ? [value] : []);

  const findUrl = (value: unknown, depth = 0): string => {
    if (typeof value === 'string') return asString(value);
    if (depth > 3) return '';
    const item = asObject(value);
    const direct = [
      item.url,
      item.file_url,
      item.download_url,
      item.image_url,
      item.full_url,
      item.large_url,
      item.preview_url,
      item.playable_url,
      item.src
    ];
    for (const candidate of direct) {
      const url = asString(candidate);
      if (url) return url;
    }
    for (const child of [item.payload, item.file, item.image, item.photo, item.video, item.sticker, item.media, item.data]) {
      const url = findUrl(child, depth + 1);
      if (url) return url;
    }
    return '';
  };

  const urls = values.map(value => {
    return findUrl(value);
  }).filter(Boolean);
  return [...new Set(urls)];
}

export function normalizePancakeConversation(rawValue: unknown, config: Pick<PancakePageConfig, 'pageId' | 'pageName'>): NormalizedConversation | null {
  const raw = asObject(rawValue);
  const externalConversationId = asString(raw.id || raw.conversation_id || raw.conversationId || raw.thread_id || raw.threadId);
  if (!externalConversationId) return null;
  const customer = findCustomer(raw);
  const lastMessage = asObject(raw.last_message || raw.lastMessage || (Array.isArray(raw.messages) ? raw.messages[0] : null));
  const updatedAt = toIso(
    raw.updated_at
      || raw.updatedAt
      || raw.updated_time
      || raw.last_sent_at
      || raw.last_message_at
      || lastMessage.created_at
      || lastMessage.created_time
      || lastMessage.timestamp
  );
  const rawType = normalizeText(raw.conversation_type || raw.type || raw.kind || lastMessage.type);
  const isComment = rawType.includes('comment') || Boolean(raw.post_id || raw.comment_id || lastMessage.comment_id);
  return {
    externalConversationId,
    pageId: asString(raw.page_id || asObject(raw.page).id) || config.pageId,
    pageName: asString(raw.page_name || asObject(raw.page).name) || config.pageName,
    channel: channelFromRaw(raw),
    conversationType: isComment ? 'COMMENT' : 'INBOX',
    customerName: asString(customer.name || customer.full_name || raw.customer_name || raw.sender_name) || 'Khách hàng',
    customerPhone: firstPhone(customer, raw),
    avatarUrl: asString(customer.avatar_url || customer.avatar || customer.picture || raw.avatar_url) || undefined,
    lastMessageSnippet: messageText(lastMessage) || messageText(raw) || (isComment ? 'Bình luận mới' : 'Tin nhắn mới'),
    lastMessageTime: updatedAt,
    unreadCount: Math.max(0, asNumber(raw.unread_count ?? raw.unreadCount ?? (raw.unread ? 1 : 0))),
    updatedAt,
    createdAt: toIso(raw.created_at || raw.created_time || raw.createdAt, updatedAt)
  };
}

export function normalizePancakeMessage(rawValue: unknown, pageId: string, fallbackConversationType: 'INBOX' | 'COMMENT' = 'INBOX'): NormalizedMessage | null {
  const raw = asObject(rawValue);
  const nested = asObject(raw.message);
  const data = asObject(raw.data);
  const externalMessageId = asString(raw.id || raw.message_id || raw.messageId || nested.id || raw.comment_id);
  const content = messageText(raw) || messageText(nested);
  const attachments = attachmentUrls(raw);
  // Read receipts and unsupported system events may have an id but no visible
  // content. They must not become empty chat bubbles.
  if (!content && attachments.length === 0) return null;
  const sender = asObject(raw.from || raw.sender || nested.from || nested.sender || raw.user || data.from || data.sender);
  const senderId = asString(sender.id || sender.uid || raw.sender_id || raw.from_id);
  const senderType = normalizeText(raw.sender_type || sender.type || raw.from_type);
  const fromPage = raw.is_from_page === true || raw.from_page === true || senderId === pageId || ['page', 'admin', 'agent', 'staff'].some(type => senderType.includes(type));
  const fromBot = raw.is_bot === true || senderType.includes('bot');
  const timestamp = toIso(
    raw.created_at
      || raw.created_time
      || raw.sent_at
      || raw.timestamp
      || raw.inserted_at
      || nested.created_at
      || nested.created_time
      || nested.sent_at
      || nested.timestamp
      || data.created_at
      || data.created_time
      || data.timestamp
  );
  return {
    externalMessageId: externalMessageId || hashId('EXT', pageId, timestamp, content, attachments.join(',')),
    sender: fromBot ? 'BOT' : fromPage ? 'STAFF' : 'CUSTOMER',
    senderName: asString(sender.name || sender.full_name || raw.sender_name) || (fromPage ? 'Nhân viên Pancake' : 'Khách hàng'),
    content: content || (attachments.length ? 'Đã gửi tệp đính kèm' : ''),
    timestamp,
    attachments,
    messageKind: fallbackConversationType === 'COMMENT' || Boolean(raw.comment_id) ? 'COMMENT' : 'MESSAGE'
  };
}

function extractConversationArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.conversations)) return payload.conversations;
  if (Array.isArray(payload?.data?.conversations)) return payload.data.conversations;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function extractMessageArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.messages)) return payload.messages;
  if (Array.isArray(payload?.data?.messages)) return payload.data.messages;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function extractNextCursor(payload: any, conversations: any[]): string | null {
  const direct = asString(payload?.last_conversation_id || payload?.next_cursor || payload?.paging?.next_cursor || payload?.data?.last_conversation_id || payload?.data?.next_cursor);
  if (direct) return direct;
  if (payload?.has_more === false || payload?.data?.has_more === false || conversations.length < 60) return null;
  const last = asObject(conversations[conversations.length - 1]);
  return asString(last.id || last.conversation_id) || null;
}

async function pancakeApiRequest(config: PancakePageConfig, path: string, init: RequestInit = {}, apiVersion: 'v1' | 'v2' = 'v1'): Promise<any> {
  if (!config.pageAccessToken) throw new Error(`PANCAKE_PAGE_TOKEN_NOT_CONFIGURED:${config.tokenEnv}`);
  const base = apiVersion === 'v2' ? PANCAKE_PAGE_API_V2 : PANCAKE_PAGE_API_V1;
  const url = new URL(`${base}${path}`);
  url.searchParams.set('page_access_token', config.pageAccessToken);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers || {}) }
    });
    const text = await response.text();
    let payload: any = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message: text }; }
    if (!response.ok || payload?.success === false) {
      const reason = asString(payload?.error?.message || payload?.error || payload?.message) || `HTTP_${response.status}`;
      if (response.status === 401 || response.status === 403) throw new Error(`PANCAKE_TOKEN_INVALID:${reason}`);
      if (response.status === 429) throw new Error('PANCAKE_RATE_LIMITED');
      throw new Error(`PANCAKE_API_ERROR:${reason}`);
    }
    return payload;
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('PANCAKE_API_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizedRole(actor: PancakeActor): string {
  return asString(actor.role).toUpperCase();
}

function isManager(actor: PancakeActor): boolean {
  return ['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER'].includes(normalizedRole(actor));
}

const CHAT_STAFF_ROLES = new Set(['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER', 'CUSTOMER_CARE', 'CSKH', 'SALE_ONLINE', 'SALES', 'SALE']);
const CHAT_WORKFLOW_STATUSES = new Set(['NEW', 'OPEN', 'WAITING_CUSTOMER', 'FOLLOW_UP', 'WON', 'LOST', 'CLOSED']);
const CHAT_PRIORITIES = new Set(['NORMAL', 'HIGH', 'URGENT']);

function canWorkChat(actor: PancakeActor): boolean {
  return CHAT_STAFF_ROLES.has(normalizedRole(actor));
}

async function activeCustomerCarePolicy(db: Firestore) {
  const snapshot = await db.collection('operationalConfigs').doc('customerCare').get();
  return selectEffectiveOperationalPolicy(normalizeOperationalPolicyVersions('customerCare', snapshot.exists ? snapshot.data() : null));
}

async function firstResponseMinutes(db: Firestore): Promise<number | null> {
  const value = asNumber((await activeCustomerCarePolicy(db))?.firstResponseMinutes, Number.NaN);
  return Number.isFinite(value) && value > 0 ? Math.min(24 * 60, Math.max(1, value)) : null;
}

function dueAtFrom(timestamp: string, minutes: number | null): Timestamp | null {
  if (!minutes) return null;
  return Timestamp.fromMillis(safeTimestamp(timestamp).toMillis() + minutes * 60_000);
}

function canAccessBranch(actor: PancakeActor, branchId: string): boolean {
  if (normalizedRole(actor) === 'ADMIN') return true;
  return [actor.branchId, ...(actor.assignedBranchIds || [])].filter(Boolean).includes(branchId);
}

function assertBranchAccess(actor: PancakeActor, branchId: string) {
  if (!canAccessBranch(actor, branchId)) throw new Error('PANCAKE_BRANCH_FORBIDDEN');
}

function isActiveBranchData(data: Record<string, any>): boolean {
  return data.isActive !== false && data.active !== false && data.isArchived !== true;
}

async function activeBranchById(db: Firestore, branchId: string): Promise<ResolvedBranch | null> {
  if (!branchId) return null;
  const snapshot = await db.collection('branches').doc(branchId).get();
  if (!snapshot.exists || !isActiveBranchData(asObject(snapshot.data()))) return null;
  return { id: snapshot.id, name: asString(snapshot.data()?.name) || asString(snapshot.data()?.code) || snapshot.id };
}

export async function listPancakeBranchOptions(db: Firestore, actor: PancakeActor): Promise<PancakeBranchOption[]> {
  const snapshot = await db.collection('branches').limit(500).get();
  return snapshot.docs
    .filter(doc => isActiveBranchData(asObject(doc.data())) && canAccessBranch(actor, doc.id))
    .map(doc => ({
      id: doc.id,
      name: asString(doc.data().name) || asString(doc.data().code) || doc.id,
      code: asString(doc.data().code)
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'vi'));
}

export async function resolvePancakeBranch(db: Firestore, config: PancakePageConfig): Promise<ResolvedBranch> {
  if (config.branchId) {
    const configured = await activeBranchById(db, config.branchId);
    if (!configured) throw new Error('PANCAKE_BRANCH_NOT_FOUND');
    return configured;
  }
  const mappingSnapshot = await db.collection('pancakePageMappings').doc(config.pageId).get();
  if (mappingSnapshot.exists && mappingSnapshot.data()?.isActive !== false) {
    const mapped = await activeBranchById(db, asString(mappingSnapshot.data()?.branchId));
    if (mapped) return mapped;
  }
  const snapshot = await db.collection('branches').limit(500).get();
  const target = normalizeText(config.branchName);
  const active = snapshot.docs.filter(doc => isActiveBranchData(asObject(doc.data())));
  const exact = active.filter(doc => configuredBranchMatches(doc.data(), target, true));
  const candidates = exact.length ? exact : active.filter(doc => configuredBranchMatches(doc.data(), target, false));
  if (candidates.length === 1) {
    return { id: candidates[0].id, name: asString(candidates[0].data().name) || config.branchName };
  }
  if (candidates.length > 1) throw new Error('PANCAKE_BRANCH_AMBIGUOUS');

  // Some legacy branches were named by address while their warehouse carries
  // the PhoneHouse/XStore system identity. Resolve that relationship without
  // relying on a guessed Firestore document id.
  const warehouseSnapshot = await db.collection('warehouses').limit(1000).get();
  const linkedBranchIds = new Set(
    warehouseSnapshot.docs
      .filter(doc => {
        const data = doc.data();
        const isActive = data.isActive !== false && data.active !== false && data.isArchived !== true;
        return isActive && configuredBranchMatches(data, target, false);
      })
      .map(doc => asString(doc.data().branchId))
      .filter(Boolean)
  );
  const linkedBranches = active.filter(doc => linkedBranchIds.has(doc.id));
  if (linkedBranches.length === 1) {
    return { id: linkedBranches[0].id, name: asString(linkedBranches[0].data().name) || config.branchName };
  }
  throw new Error(linkedBranches.length ? 'PANCAKE_BRANCH_AMBIGUOUS' : 'PANCAKE_BRANCH_NOT_FOUND');
}

export async function setPancakeBranchMapping(
  db: Firestore | null,
  input: { pageId: string; branchId: string },
  actor: PancakeActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isManager(actor)) throw new Error('PANCAKE_BRANCH_MAPPING_FORBIDDEN');
  const config = configByPageId(asString(input.pageId));
  const branch = await activeBranchById(db, asString(input.branchId));
  if (!branch) throw new Error('PANCAKE_BRANCH_NOT_FOUND');
  assertBranchAccess(actor, branch.id);
  const branchSnapshot = await db.collection('branches').doc(branch.id).get();
  await db.collection('pancakePageMappings').doc(config.pageId).set({
    pageId: config.pageId,
    pageName: config.pageName,
    branchId: branch.id,
    branchName: branch.name,
    branchCode: asString(branchSnapshot.data()?.code),
    isActive: true,
    updatedByUid: actor.uid,
    updatedByName: asString(actor.name) || actor.uid,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return {
    pageId: config.pageId,
    pageName: config.pageName,
    branchId: branch.id,
    branchName: branch.name,
    status: config.pageAccessToken ? 'READY' : 'MISSING_TOKEN'
  };
}

function configByPageId(pageId: string, env: NodeJS.ProcessEnv = process.env): PancakePageConfig {
  const config = getPancakePageConfigs(env).find(item => item.pageId === pageId);
  if (!config) throw new Error('PANCAKE_PAGE_NOT_CONFIGURED');
  return config;
}

function conversationDocument(normalized: NormalizedConversation, branch: ResolvedBranch) {
  const id = pancakeConversationDocumentId(normalized.pageId, normalized.externalConversationId);
  return {
    id,
    provider: 'PANCAKE',
    pageId: normalized.pageId,
    pageName: normalized.pageName,
    externalConversationId: normalized.externalConversationId,
    branchId: branch.id,
    branchName: branch.name,
    channel: normalized.channel,
    conversationType: normalized.conversationType,
    customerName: normalized.customerName,
    customerPhone: normalized.customerPhone,
    ...(normalized.avatarUrl ? { avatarUrl: normalized.avatarUrl } : {}),
    lastMessageSnippet: normalized.lastMessageSnippet,
    lastMessageTime: normalized.lastMessageTime,
    unreadCount: normalized.unreadCount,
    createdAt: safeTimestamp(normalized.createdAt),
    updatedAt: safeTimestamp(normalized.updatedAt),
    lastSyncedAt: FieldValue.serverTimestamp()
  };
}

function messageDocument(normalized: NormalizedMessage, conversation: any) {
  const id = pancakeMessageDocumentId(conversation.pageId, conversation.externalConversationId, normalized.externalMessageId);
  return {
    id,
    provider: 'PANCAKE',
    conversationId: conversation.id,
    externalConversationId: conversation.externalConversationId,
    externalMessageId: normalized.externalMessageId,
    pageId: conversation.pageId,
    branchId: conversation.branchId,
    sender: normalized.sender,
    senderName: normalized.senderName,
    content: normalized.content,
    timestamp: safeTimestamp(normalized.timestamp),
    timestampIso: normalized.timestamp,
    attachments: normalized.attachments,
    messageKind: normalized.messageKind,
    createdAt: FieldValue.serverTimestamp()
  };
}

function firestoreTimestampIso(value: any): string {
  return toIso(value);
}

function clientConversation(snapshot: any) {
  const data = snapshot.data ? snapshot.data() : snapshot;
  const optionalIso = (value: any) => value ? firestoreTimestampIso(value) : '';
  return {
    id: snapshot.id || data.id,
    provider: data.provider || 'PANCAKE',
    pageId: data.pageId,
    pageName: data.pageName,
    externalConversationId: data.externalConversationId,
    branchId: data.branchId,
    branchName: data.branchName,
    channel: data.channel || 'FACEBOOK',
    conversationType: data.conversationType || 'INBOX',
    customerName: data.customerName || 'Khách hàng',
    customerPhone: data.customerPhone || '',
    avatarUrl: data.avatarUrl,
    lastMessageSnippet: data.lastMessageSnippet || '',
    lastMessageTime: data.lastMessageTime || firestoreTimestampIso(data.updatedAt),
    unreadCount: asNumber(data.unreadCount),
    assignedStaff: data.assignedStaffName || '',
    assignedStaffId: data.assignedStaffId || '',
    assignedStaffName: data.assignedStaffName || '',
    workflowStatus: data.workflowStatus || 'NEW',
    priority: data.priority || 'NORMAL',
    firstResponseDueAt: optionalIso(data.firstResponseDueAt),
    firstResponseAt: optionalIso(data.firstResponseAt),
    firstCustomerMessageAt: optionalIso(data.firstCustomerMessageAt),
    lastCustomerMessageAt: optionalIso(data.lastCustomerMessageAt),
    lastStaffMessageAt: optionalIso(data.lastStaffMessageAt),
    nextFollowUpAt: optionalIso(data.nextFollowUpAt),
    awaitingStaffReply: data.awaitingStaffReply === true,
    firstResponseSeconds: asNumber(data.firstResponseSeconds),
    slaMet: typeof data.slaMet === 'boolean' ? data.slaMet : undefined,
    outcomeNote: data.outcomeNote || '',
    interestedModel: data.interestedModel || '',
    messages: []
  };
}

function clientMessage(snapshot: any) {
  const data = snapshot.data ? snapshot.data() : snapshot;
  return {
    id: snapshot.id || data.id,
    externalMessageId: data.externalMessageId,
    sender: data.sender || 'CUSTOMER',
    senderName: data.senderName || 'Khách hàng',
    content: data.content || '',
    timestamp: data.timestampIso || firestoreTimestampIso(data.timestamp),
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    messageKind: data.messageKind || 'MESSAGE'
  };
}

function encodeCursor(updatedAt: any, id: string): string {
  return Buffer.from(JSON.stringify({ updatedAt: firestoreTimestampIso(updatedAt), id }), 'utf8').toString('base64url');
}

function decodeCursor(cursor?: string): { updatedAt: Timestamp; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!parsed.updatedAt || !parsed.id) return null;
    return { updatedAt: safeTimestamp(parsed.updatedAt), id: asString(parsed.id) };
  } catch {
    throw new Error('PANCAKE_CURSOR_INVALID');
  }
}

export async function getPancakeChannels(db: Firestore | null, actor: PancakeActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const channels = [];
  for (const config of getPancakePageConfigs()) {
    let branch: ResolvedBranch | null = null;
    let branchError = '';
    try { branch = await resolvePancakeBranch(db, config); } catch (error: any) { branchError = error?.message || 'PANCAKE_BRANCH_NOT_FOUND'; }
    if (branch && !canAccessBranch(actor, branch.id)) continue;
    const mappingSnapshot = await db.collection('pancakePageMappings').doc(config.pageId).get();
    const mapping = asObject(mappingSnapshot.data());
    const lastWebhookValue = mapping.lastWebhookAt;
    const webhookStatus = !asString(process.env.PANCAKE_WEBHOOK_SECRET)
      ? 'MISSING_SECRET'
      : lastWebhookValue
        ? 'RECEIVING'
        : 'NOT_SEEN';
    channels.push({
      pageId: config.pageId,
      pageName: config.pageName,
      branchId: branch?.id || config.branchId || '',
      branchName: branch?.name || config.branchName,
      historyDays: config.historyDays,
      includeComments: config.includeComments,
      status: branchError ? 'CONFIG_ERROR' : config.pageAccessToken ? 'READY' : 'MISSING_TOKEN',
      webhookStatus,
      ...(lastWebhookValue ? { lastWebhookAt: firestoreTimestampIso(lastWebhookValue) } : {}),
      ...(asString(mapping.lastWebhookEvent) ? { lastWebhookEvent: asString(mapping.lastWebhookEvent) } : {}),
      connectionStatus: ['CONNECTED', 'DISCONNECTED'].includes(asString(mapping.pancakeConnectionStatus).toUpperCase())
        ? asString(mapping.pancakeConnectionStatus).toUpperCase()
        : 'UNKNOWN',
      error: branchError || undefined,
      requiredTokenEnv: config.pageAccessToken ? undefined : config.tokenEnv
    });
  }
  return { channels, branches: await listPancakeBranchOptions(db, actor) };
}

export async function getPancakeWebhookSetup(
  db: Firestore | null,
  pageId: string,
  actor: PancakeActor,
  requestOrigin: string
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isManager(actor)) throw new Error('PANCAKE_WEBHOOK_SETUP_FORBIDDEN');
  const config = configByPageId(asString(pageId));
  const branch = await resolvePancakeBranch(db, config);
  assertBranchAccess(actor, branch.id);
  const secret = asString(process.env.PANCAKE_WEBHOOK_SECRET);
  if (!secret) throw new Error('PANCAKE_WEBHOOK_SECRET_NOT_CONFIGURED');
  const mappingSnapshot = await db.collection('pancakePageMappings').doc(config.pageId).get();
  const mapping = asObject(mappingSnapshot.data());
  const origin = asString(process.env.APP_URL || requestOrigin).replace(/\/$/, '');
  if (!origin) throw new Error('PANCAKE_WEBHOOK_ORIGIN_NOT_CONFIGURED');
  const callbackUrl = `${origin}/api/pancake/webhook?secret=${encodeURIComponent(secret)}&page_id=${encodeURIComponent(config.pageId)}`;
  return {
    pageId: config.pageId,
    pageName: config.pageName,
    branchId: branch.id,
    branchName: branch.name,
    callbackUrl,
    webhookStatus: mapping.lastWebhookAt ? 'RECEIVING' : 'NOT_SEEN',
    ...(mapping.lastWebhookAt ? { lastWebhookAt: firestoreTimestampIso(mapping.lastWebhookAt) } : {}),
    ...(asString(mapping.lastWebhookEvent) ? { lastWebhookEvent: asString(mapping.lastWebhookEvent) } : {}),
    connectionStatus: ['CONNECTED', 'DISCONNECTED'].includes(asString(mapping.pancakeConnectionStatus).toUpperCase())
      ? asString(mapping.pancakeConnectionStatus).toUpperCase()
      : 'UNKNOWN',
    requiredEvents: ['messaging', 'conversation', 'connect_status'],
    docsUrl: 'https://developer.pancake.biz/webhook'
  };
}

export async function listPancakeConversations(db: Firestore | null, input: { branchId?: string; cursor?: string; limit?: number }, actor: PancakeActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  let branchId = asString(input.branchId || actor.branchId);
  if (!branchId && normalizedRole(actor) === 'ADMIN') {
    const firstConfig = getPancakePageConfigs()[0];
    if (firstConfig) branchId = (await resolvePancakeBranch(db, firstConfig)).id;
  }
  if (!branchId) throw new Error('PANCAKE_BRANCH_REQUIRED');
  assertBranchAccess(actor, branchId);
  const limit = Math.min(100, Math.max(10, asNumber(input.limit, 60)));
  let query: any = db.collection('chatConversations')
    .where('branchId', '==', branchId)
    .orderBy('updatedAt', 'desc')
    .orderBy(FieldPath.documentId(), 'asc');
  const cursor = decodeCursor(input.cursor);
  if (cursor) query = query.startAfter(cursor.updatedAt, cursor.id);
  const snapshot = await query.limit(limit + 1).get();
  const docs = snapshot.docs.slice(0, limit);
  const last = docs[docs.length - 1];
  return {
    items: docs.map(clientConversation),
    nextCursor: snapshot.docs.length > limit && last ? encodeCursor(last.data().updatedAt, last.id) : null,
    hasMore: snapshot.docs.length > limit
  };
}

export async function listPancakeChatStaff(db: Firestore | null, branchIdInput: string, actor: PancakeActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!canWorkChat(actor)) throw new Error('PANCAKE_CHAT_STAFF_FORBIDDEN');
  const branchId = asString(branchIdInput || actor.branchId);
  if (!branchId) throw new Error('PANCAKE_BRANCH_REQUIRED');
  assertBranchAccess(actor, branchId);
  const snapshot = await db.collection('users').where('active', '==', true).limit(500).get();
  const items = snapshot.docs
    .map(document => ({ id: document.id, ...document.data() } as any))
    .filter(user => {
      const role = asString(user.role).toUpperCase();
      const branches = new Set([user.branchId, ...(Array.isArray(user.assignedBranchIds) ? user.assignedBranchIds : [])].filter(Boolean));
      return CHAT_STAFF_ROLES.has(role) && (role === 'ADMIN' || branches.has(branchId));
    })
    .map(user => ({
      id: user.id,
      name: asString(user.displayName || user.name || user.email) || user.id,
      role: asString(user.role).toUpperCase(),
      branchId: asString(user.branchId)
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'vi'));
  return { branchId, items };
}

export async function getPancakeChatSummary(
  db: Firestore | null,
  branchIdInput: string,
  actor: PancakeActor,
  periodDaysInput = 30
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  let branchId = asString(branchIdInput || actor.branchId);
  if (!branchId && normalizedRole(actor) === 'ADMIN') {
    const firstConfig = getPancakePageConfigs()[0];
    if (firstConfig) branchId = (await resolvePancakeBranch(db, firstConfig)).id;
  }
  if (!branchId) throw new Error('PANCAKE_BRANCH_REQUIRED');
  assertBranchAccess(actor, branchId);

  const periodDays = Math.min(90, Math.max(1, asNumber(periodDaysInput, 30)));
  const cutoffMs = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const snapshot = await db.collection('chatConversations')
    .where('branchId', '==', branchId)
    .orderBy('updatedAt', 'desc')
    .limit(2000)
    .get();
  const conversations = snapshot.docs
    .map(document => ({ id: document.id, ...document.data() } as Record<string, any>))
    .filter(conversation => safeTimestamp(conversation.updatedAt || conversation.lastMessageTime).toMillis() >= cutoffMs);

  const terminalStatuses = new Set(['WON', 'LOST', 'CLOSED']);
  const nowMs = Date.now();
  let unassigned = 0;
  let awaitingReply = 0;
  let overdue = 0;
  let followUpDue = 0;
  let won = 0;
  let lost = 0;
  let slaMeasured = 0;
  let slaMet = 0;
  let totalFirstResponseSeconds = 0;
  const byStaff = new Map<string, { staffId: string; staffName: string; total: number; open: number; won: number; overdue: number }>();

  for (const conversation of conversations) {
    const status = asString(conversation.workflowStatus || 'NEW').toUpperCase();
    const isTerminal = terminalStatuses.has(status);
    const dueAtMs = conversation.firstResponseDueAt ? safeTimestamp(conversation.firstResponseDueAt).toMillis() : 0;
    const isCurrentOverdue = !conversation.firstResponseAt && conversation.awaitingStaffReply === true && dueAtMs > 0 && dueAtMs < nowMs;
    const isSlaMissed = conversation.slaMet === false || isCurrentOverdue;
    if (!conversation.assignedStaffId && !isTerminal) unassigned += 1;
    if (conversation.awaitingStaffReply === true && !isTerminal) awaitingReply += 1;
    if (isSlaMissed) overdue += 1;
    if (conversation.nextFollowUpAt && safeTimestamp(conversation.nextFollowUpAt).toMillis() <= nowMs && !isTerminal) followUpDue += 1;
    if (status === 'WON') won += 1;
    if (status === 'LOST') lost += 1;
    if (conversation.firstResponseAt || asNumber(conversation.firstResponseSeconds) > 0) {
      slaMeasured += 1;
      totalFirstResponseSeconds += Math.max(0, asNumber(conversation.firstResponseSeconds));
      if (conversation.slaMet === true) slaMet += 1;
    }

    const staffId = asString(conversation.assignedStaffId);
    if (staffId) {
      const current = byStaff.get(staffId) || {
        staffId,
        staffName: asString(conversation.assignedStaffName) || staffId,
        total: 0,
        open: 0,
        won: 0,
        overdue: 0
      };
      current.total += 1;
      if (!isTerminal) current.open += 1;
      if (status === 'WON') current.won += 1;
      if (isSlaMissed) current.overdue += 1;
      byStaff.set(staffId, current);
    }
  }

  const decided = won + lost;
  return {
    branchId,
    periodDays,
    total: conversations.length,
    unassigned,
    awaitingReply,
    overdue,
    followUpDue,
    won,
    lost,
    conversionRate: decided ? Math.round((won / decided) * 1000) / 10 : 0,
    slaMeasured,
    slaMet,
    slaRate: slaMeasured ? Math.round((slaMet / slaMeasured) * 1000) / 10 : 0,
    averageFirstResponseSeconds: slaMeasured ? Math.round(totalFirstResponseSeconds / slaMeasured) : 0,
    sampleCapped: snapshot.size >= 2000,
    byStaff: [...byStaff.values()].sort((left, right) => right.total - left.total || left.staffName.localeCompare(right.staffName, 'vi')),
    generatedAt: new Date().toISOString()
  };
}

export async function updatePancakeConversationWorkflow(
  db: Firestore | null,
  conversationId: string,
  input: {
    assignedStaffId?: string;
    workflowStatus?: string;
    priority?: string;
    nextFollowUpAt?: string | null;
    outcomeNote?: string;
  },
  actor: PancakeActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!canWorkChat(actor)) throw new Error('PANCAKE_WORKFLOW_FORBIDDEN');
  const conversationRef = db.collection('chatConversations').doc(asString(conversationId));
  const eventRef = db.collection('chatConversationEvents').doc();
  const slaMinutes = await firstResponseMinutes(db);

  await db.runTransaction(async transaction => {
    const conversationSnapshot = await transaction.get(conversationRef);
    if (!conversationSnapshot.exists) throw new Error('PANCAKE_CONVERSATION_NOT_FOUND');
    const conversation = conversationSnapshot.data()!;
    assertBranchAccess(actor, asString(conversation.branchId));

    const manager = isManager(actor);
    const requestedAssigneeId = input.assignedStaffId === undefined ? undefined : asString(input.assignedStaffId);
    let assignee: { id: string; name: string } | null | undefined;
    if (requestedAssigneeId !== undefined) {
      if (!requestedAssigneeId) {
        if (!manager) throw new Error('PANCAKE_UNASSIGN_FORBIDDEN');
        assignee = null;
      } else {
        const assigneeSnapshot = await transaction.get(db.collection('users').doc(requestedAssigneeId));
        if (!assigneeSnapshot.exists || assigneeSnapshot.data()?.active !== true) throw new Error('PANCAKE_ASSIGNEE_NOT_ACTIVE');
        const user = assigneeSnapshot.data()!;
        const role = asString(user.role).toUpperCase();
        const branches = new Set([user.branchId, ...(Array.isArray(user.assignedBranchIds) ? user.assignedBranchIds : [])].filter(Boolean));
        if (!CHAT_STAFF_ROLES.has(role) || (role !== 'ADMIN' && !branches.has(conversation.branchId))) throw new Error('PANCAKE_ASSIGNEE_BRANCH_MISMATCH');
        if (!manager && requestedAssigneeId !== actor.uid) throw new Error('PANCAKE_ASSIGN_OTHER_FORBIDDEN');
        if (!manager && conversation.assignedStaffId && conversation.assignedStaffId !== actor.uid) throw new Error('PANCAKE_CONVERSATION_OWNED_BY_OTHER');
        assignee = { id: assigneeSnapshot.id, name: asString(user.displayName || user.name || user.email) || assigneeSnapshot.id };
      }
    } else if (!manager && conversation.assignedStaffId && conversation.assignedStaffId !== actor.uid) {
      throw new Error('PANCAKE_CONVERSATION_OWNED_BY_OTHER');
    } else if (!manager && !conversation.assignedStaffId) {
      assignee = { id: actor.uid, name: asString(actor.name) || actor.uid };
    }

    const workflowStatus = input.workflowStatus === undefined ? undefined : asString(input.workflowStatus).toUpperCase();
    const priority = input.priority === undefined ? undefined : asString(input.priority).toUpperCase();
    if (workflowStatus !== undefined && !CHAT_WORKFLOW_STATUSES.has(workflowStatus)) throw new Error('PANCAKE_WORKFLOW_STATUS_INVALID');
    if (priority !== undefined && !CHAT_PRIORITIES.has(priority)) throw new Error('PANCAKE_PRIORITY_INVALID');
    const outcomeNote = input.outcomeNote === undefined ? undefined : asString(input.outcomeNote).slice(0, 1000);
    let nextFollowUpAt: Timestamp | null | undefined;
    if (input.nextFollowUpAt !== undefined) {
      if (!input.nextFollowUpAt) nextFollowUpAt = null;
      else {
        const parsedFollowUp = new Date(asString(input.nextFollowUpAt));
        if (Number.isNaN(parsedFollowUp.getTime())) throw new Error('PANCAKE_FOLLOW_UP_TIME_INVALID');
        nextFollowUpAt = Timestamp.fromDate(parsedFollowUp);
      }
    }

    const updates: Record<string, any> = {
      ...(assignee === null ? { assignedStaffId: '', assignedStaffName: '' } : assignee ? { assignedStaffId: assignee.id, assignedStaffName: assignee.name } : {}),
      ...(workflowStatus !== undefined ? { workflowStatus } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(nextFollowUpAt !== undefined ? { nextFollowUpAt } : {}),
      ...(outcomeNote !== undefined ? { outcomeNote } : {}),
      workflowUpdatedAt: FieldValue.serverTimestamp(),
      workflowUpdatedByUid: actor.uid,
      workflowUpdatedByName: asString(actor.name) || actor.uid
    };
    if (!conversation.firstResponseAt && !conversation.firstResponseDueAt && conversation.firstCustomerMessageAt) {
      const dueAt = dueAtFrom(firestoreTimestampIso(conversation.firstCustomerMessageAt), slaMinutes);
      if (dueAt) updates.firstResponseDueAt = dueAt;
    }
    if (workflowStatus && ['WON', 'LOST', 'CLOSED'].includes(workflowStatus)) {
      updates.closedAt = FieldValue.serverTimestamp();
      updates.awaitingStaffReply = false;
    }
    transaction.set(conversationRef, updates, { merge: true });
    transaction.create(eventRef, {
      id: eventRef.id,
      conversationId: conversationSnapshot.id,
      pageId: conversation.pageId,
      branchId: conversation.branchId,
      eventType: 'WORKFLOW_UPDATED',
      before: {
        assignedStaffId: conversation.assignedStaffId || '',
        workflowStatus: conversation.workflowStatus || 'NEW',
        priority: conversation.priority || 'NORMAL'
      },
      changes: {
        ...(requestedAssigneeId !== undefined ? { assignedStaffId: requestedAssigneeId } : {}),
        ...(workflowStatus !== undefined ? { workflowStatus } : {}),
        ...(priority !== undefined ? { priority } : {})
      },
      actorUid: actor.uid,
      actorName: asString(actor.name) || actor.uid,
      createdAt: FieldValue.serverTimestamp()
    });
  });

  return clientConversation(await conversationRef.get());
}

async function persistMessages(db: Firestore, conversation: any, messages: NormalizedMessage[]) {
  if (!messages.length) return;
  let batch = db.batch();
  let count = 0;
  for (const message of messages) {
    const document = messageDocument(message, conversation);
    batch.set(db.collection('chatMessages').doc(document.id), document, { merge: true });
    count += 1;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 400 !== 0) await batch.commit();
}

async function fetchConversationMessages(config: PancakePageConfig, externalConversationId: string, conversationType: 'INBOX' | 'COMMENT') {
  const payload = await pancakeApiRequest(
    config,
    `/pages/${encodeURIComponent(config.pageId)}/conversations/${encodeURIComponent(externalConversationId)}/messages`,
    { method: 'GET' },
    'v1'
  );
  return extractMessageArray(payload)
    .map(item => normalizePancakeMessage(item, config.pageId, conversationType))
    .filter(Boolean) as NormalizedMessage[];
}

export async function listPancakeMessages(db: Firestore | null, conversationId: string, actor: PancakeActor, refreshFromPancake = true) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const conversationSnapshot = await db.collection('chatConversations').doc(conversationId).get();
  if (!conversationSnapshot.exists) throw new Error('PANCAKE_CONVERSATION_NOT_FOUND');
  const conversation = { id: conversationSnapshot.id, ...conversationSnapshot.data() } as any;
  assertBranchAccess(actor, conversation.branchId);
  let warning = '';
  if (refreshFromPancake && conversation.provider === 'META_MESSENGER') {
    try {
      await refreshMetaConversationMessages(db, conversation);
    } catch (error: any) {
      warning = error?.message || 'META_MESSAGE_REFRESH_FAILED';
    }
  } else if (refreshFromPancake) {
    try {
      const config = configByPageId(conversation.pageId);
      const messages = await fetchConversationMessages(config, conversation.externalConversationId, conversation.conversationType || 'INBOX');
      await persistMessages(db, conversation, messages);
      await conversationSnapshot.ref.set({ lastSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch (error: any) {
      warning = error?.message || 'PANCAKE_MESSAGE_REFRESH_FAILED';
    }
  }
  const snapshot = await db.collection('chatMessages')
    .where('conversationId', '==', conversationId)
    .orderBy('timestamp', 'asc')
    .limit(500)
    .get();
  return { items: snapshot.docs.map(clientMessage), warning: warning || undefined };
}

export async function repairPancakeEmptyMessages(
  db: Firestore | null,
  input: { pageId: string; limit?: number },
  actor: PancakeActor
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isManager(actor)) throw new Error('PANCAKE_REPAIR_FORBIDDEN');
  const config = configByPageId(asString(input.pageId));
  const branch = await resolvePancakeBranch(db, config);
  assertBranchAccess(actor, branch.id);
  const limit = Math.min(10, Math.max(1, asNumber(input.limit, 5)));
  const emptySnapshot = await db.collection('chatMessages')
    .where('branchId', '==', branch.id)
    .where('pageId', '==', config.pageId)
    .where('content', '==', '')
    .limit(limit)
    .get();

  if (emptySnapshot.empty) {
    return { pageId: config.pageId, scanned: 0, conversations: 0, repaired: 0, removed: 0, failed: 0, hasMore: false };
  }

  const byConversation = new Map<string, any[]>();
  for (const messageSnapshot of emptySnapshot.docs) {
    const conversationId = asString(messageSnapshot.data().conversationId);
    if (!conversationId) continue;
    const current = byConversation.get(conversationId) || [];
    current.push(messageSnapshot);
    byConversation.set(conversationId, current);
  }

  const results = await Promise.allSettled([...byConversation.entries()].map(async ([conversationId, blankMessages]) => {
    const conversationSnapshot = await db.collection('chatConversations').doc(conversationId).get();
    if (!conversationSnapshot.exists) return { blankMessages, messages: [] as NormalizedMessage[], missingConversation: true };
    const conversation = { id: conversationSnapshot.id, ...conversationSnapshot.data() } as any;
    if (conversation.branchId !== branch.id || conversation.pageId !== config.pageId) throw new Error('PANCAKE_REPAIR_SCOPE_MISMATCH');
    const messages = await fetchConversationMessages(config, conversation.externalConversationId, conversation.conversationType || 'INBOX');
    await persistMessages(db, conversation, messages);
    await conversationSnapshot.ref.set({ lastSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { blankMessages, messages, missingConversation: false };
  }));

  const cleanupBatch = db.batch();
  let cleanupWrites = 0;
  let repaired = 0;
  let removed = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === 'rejected') {
      failed += 1;
      continue;
    }
    const normalizedIds = new Set(result.value.messages.map(message => message.externalMessageId));
    for (const blankSnapshot of result.value.blankMessages) {
      const data = blankSnapshot.data();
      const attachments = Array.isArray(data.attachments) ? data.attachments.filter(Boolean) : [];
      if (attachments.length) {
        cleanupBatch.set(blankSnapshot.ref, { content: 'Đã gửi tệp đính kèm' }, { merge: true });
        cleanupWrites += 1;
        repaired += 1;
      } else if (normalizedIds.has(asString(data.externalMessageId))) {
        // persistMessages already rewrote this deterministic document with the
        // corrected body produced by the new Pancake normalizer.
        repaired += 1;
      } else {
        // The old record is a read receipt or another unsupported event. It had
        // no visible content and should never render as a message.
        cleanupBatch.delete(blankSnapshot.ref);
        cleanupWrites += 1;
        removed += 1;
      }
    }
  }
  if (cleanupWrites) await cleanupBatch.commit();

  const remainingSnapshot = await db.collection('chatMessages')
    .where('branchId', '==', branch.id)
    .where('pageId', '==', config.pageId)
    .where('content', '==', '')
    .limit(1)
    .get();
  return {
    pageId: config.pageId,
    scanned: emptySnapshot.size,
    conversations: byConversation.size,
    repaired,
    removed,
    failed,
    hasMore: !remainingSnapshot.empty
  };
}

export async function syncPancakeConversations(db: Firestore | null, input: { pageId: string; cursor?: string }, actor: PancakeActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (!isManager(actor)) throw new Error('PANCAKE_SYNC_FORBIDDEN');
  const config = configByPageId(asString(input.pageId));
  const branch = await resolvePancakeBranch(db, config);
  assertBranchAccess(actor, branch.id);
  const path = `/pages/${encodeURIComponent(config.pageId)}/conversations`;
  const urlSuffix = input.cursor ? `?last_conversation_id=${encodeURIComponent(input.cursor)}` : '';
  const payload = await pancakeApiRequest(config, `${path}${urlSuffix}`, { method: 'GET' }, 'v2');
  const rawItems = extractConversationArray(payload);
  const cutoff = Date.now() - config.historyDays * 24 * 60 * 60 * 1000;
  const normalized = rawItems
    .map(item => normalizePancakeConversation(item, config))
    .filter((item): item is NormalizedConversation => Boolean(item))
    .filter(item => config.includeComments || item.conversationType !== 'COMMENT');
  const inRange = normalized.filter(item => new Date(item.updatedAt).getTime() >= cutoff);
  let batch = db.batch();
  let written = 0;
  for (const item of inRange) {
    const document = conversationDocument(item, branch);
    batch.set(db.collection('chatConversations').doc(document.id), document, { merge: true });
    written += 1;
    if (written % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (written % 400 !== 0) await batch.commit();
  const oldest = normalized.reduce((min, item) => Math.min(min, new Date(item.updatedAt).getTime()), Number.POSITIVE_INFINITY);
  const nextCursor = extractNextCursor(payload, rawItems);
  const done = !nextCursor || rawItems.length === 0 || oldest < cutoff;
  return { pageId: config.pageId, imported: written, scanned: rawItems.length, nextCursor: done ? null : nextCursor, done, cutoffAt: new Date(cutoff).toISOString() };
}

export function verifyPancakeWebhookSecret(provided: unknown, configured: unknown): boolean {
  const left = Buffer.from(asString(provided));
  const right = Buffer.from(asString(configured));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function webhookPayloadRoot(payload: unknown): Record<string, any> {
  const root = asObject(payload);
  const data = asObject(root.data);
  const innerPayload = asObject(root.payload);
  return Object.keys(innerPayload).length ? { ...root, ...innerPayload } : Object.keys(data).length ? { ...root, ...data } : root;
}

export function identifyPancakeWebhookPageId(payload: unknown, fallback = ''): string {
  const root = webhookPayloadRoot(payload);
  return asString(root.page_id || root.pageId || asObject(root.page).id || asObject(root.page_info).id || fallback);
}

export function normalizePancakeWebhook(payload: unknown, config: PancakePageConfig): { conversation: NormalizedConversation; message: NormalizedMessage } | null {
  const root = webhookPayloadRoot(payload);
  const rawConversation = {
    ...asObject(root.conversation),
    id: asString(asObject(root.conversation).id || root.conversation_id || root.conversationId || root.thread_id),
    page_id: identifyPancakeWebhookPageId(root, config.pageId),
    page_name: root.page_name || config.pageName,
    customer: root.customer || root.sender || asObject(root.message).from,
    channel: root.channel || root.platform || root.page_type,
    type: root.conversation_type || root.type || root.event || root.event_type || asObject(root.conversation).type || asObject(root.message).type,
    updated_at: root.updated_at || root.timestamp || asObject(root.message).created_at || asObject(root.message).inserted_at,
    last_message: root.message || root.comment || root
  };
  const messageRaw = Object.keys(asObject(root.message)).length
    ? { ...asObject(root.message), sender: asObject(root.message).sender || root.sender, comment_id: root.comment_id }
    : Object.keys(asObject(root.comment)).length
      ? { ...asObject(root.comment), sender: asObject(root.comment).from || root.sender, comment_id: asObject(root.comment).id }
      : root;
  const conversation = normalizePancakeConversation(rawConversation, config);
  if (!conversation) return null;
  const message = normalizePancakeMessage(messageRaw, config.pageId, conversation.conversationType);
  if (!message) return null;
  return { conversation, message };
}

export function normalizePancakeConversationEvent(
  payload: unknown,
  config: Pick<PancakePageConfig, 'pageId' | 'pageName'>
): NormalizedConversationEvent | null {
  const root = webhookPayloadRoot(payload);
  if (asString(root.event_type || root.event || root.type).toLowerCase() !== 'conversation') return null;
  const raw = asObject(root.conversation);
  if (!Object.keys(raw).length) return null;
  const seen = typeof raw.seen === 'boolean' ? raw.seen : undefined;
  const isReplied = typeof raw.is_replied === 'boolean' ? raw.is_replied : undefined;
  const normalized = normalizePancakeConversation({
    ...raw,
    page_id: identifyPancakeWebhookPageId(root, config.pageId),
    page_name: root.page_name || config.pageName,
    updated_at: raw.updated_at || raw.updatedAt || root.timestamp,
    ...(seen === undefined ? {} : { unread_count: seen ? 0 : 1 })
  }, config);
  if (!normalized) return null;
  return {
    conversation: normalized,
    requestId: asString(root.request_id || root.requestId),
    version: Math.max(0, Math.floor(asNumber(raw.version))),
    externalAssigneeIds: [...new Set((Array.isArray(raw.assignee_ids) ? raw.assignee_ids : []).map(asString).filter(Boolean))],
    externalTagIds: [...new Set((Array.isArray(raw.tags) ? raw.tags : []).map(asString).filter(Boolean))],
    ...(seen === undefined ? {} : { seen }),
    ...(isReplied === undefined ? {} : { isReplied })
  };
}

export function normalizePancakeConnectStatusEvent(payload: unknown): NormalizedConnectStatusEvent | null {
  const root = webhookPayloadRoot(payload);
  if (asString(root.event_type || root.event || root.type).toLowerCase() !== 'connect_status') return null;
  const page = asObject(root.page || root.page_info || root.connection);
  const rawStatus = asString(
    root.connection_status
      || root.connect_status
      || root.status
      || page.connection_status
      || page.connect_status
      || page.status
  ).toLowerCase();
  return {
    pageId: identifyPancakeWebhookPageId(root),
    requestId: asString(root.request_id || root.requestId),
    status: rawStatus === 'connected' ? 'CONNECTED' : rawStatus === 'disconnected' ? 'DISCONNECTED' : 'UNKNOWN'
  };
}

export async function processPancakeWebhook(db: Firestore | null, payload: unknown, fallbackPageId = '') {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const pageId = identifyPancakeWebhookPageId(payload, fallbackPageId);
  const config = configByPageId(pageId);
  const branch = await resolvePancakeBranch(db, config);
  const webhookRoot = webhookPayloadRoot(payload);
  const eventType = asString(webhookRoot.event_type || webhookRoot.event || webhookRoot.type || webhookRoot.action).toLowerCase() || 'unknown';
  const requestId = asString(webhookRoot.request_id || webhookRoot.requestId);
  const connectStatusEvent = normalizePancakeConnectStatusEvent(payload);
  await db.collection('pancakePageMappings').doc(config.pageId).set({
    pageId: config.pageId,
    pageName: config.pageName,
    branchId: branch.id,
    branchName: branch.name,
    isActive: true,
    lastWebhookAt: FieldValue.serverTimestamp(),
    lastWebhookEvent: eventType.toUpperCase(),
    ...(requestId ? { lastWebhookRequestId: requestId } : {}),
    ...(connectStatusEvent ? {
      pancakeConnectionStatus: connectStatusEvent.status,
      lastConnectStatusAt: FieldValue.serverTimestamp()
    } : {})
  }, { merge: true });

  if (connectStatusEvent) {
    return {
      accepted: true,
      ignored: false,
      eventType: 'connect_status',
      connectionStatus: connectStatusEvent.status
    };
  }

  const conversationEvent = normalizePancakeConversationEvent(payload, config);
  if (conversationEvent) {
    const conversationDoc = conversationDocument(conversationEvent.conversation, branch);
    const conversationRef = db.collection('chatConversations').doc(conversationDoc.id);
    const result = await db.runTransaction(async transaction => {
      const existingSnapshot = await transaction.get(conversationRef);
      const existing = existingSnapshot.data() || {};
      const existingVersion = Math.max(0, Math.floor(asNumber(existing.pancakeVersion)));
      if (conversationEvent.requestId && conversationEvent.requestId === asString(existing.lastPancakeRequestId)) {
        return { applied: false, reason: 'DUPLICATE_REQUEST' };
      }
      if (conversationEvent.version > 0 && existingVersion >= conversationEvent.version) {
        return { applied: false, reason: 'OUT_OF_ORDER_VERSION' };
      }

      const hasUsefulSnippet = Boolean(asString(asObject(webhookRoot.conversation).snippet));
      const updates: Record<string, any> = {
        ...conversationDoc,
        createdAt: existing.createdAt || conversationDoc.createdAt,
        externalAssigneeIds: conversationEvent.externalAssigneeIds,
        externalTagIds: conversationEvent.externalTagIds,
        ...(conversationEvent.version > 0 ? { pancakeVersion: conversationEvent.version } : {}),
        ...(conversationEvent.requestId ? { lastPancakeRequestId: conversationEvent.requestId } : {}),
        ...(conversationEvent.seen === undefined ? {} : { pancakeSeen: conversationEvent.seen }),
        ...(conversationEvent.isReplied === undefined ? {} : { pancakeIsReplied: conversationEvent.isReplied }),
        lastPancakeConversationEventAt: FieldValue.serverTimestamp()
      };
      if (existingSnapshot.exists && conversationEvent.conversation.customerName === 'Khách hàng') delete updates.customerName;
      if (existingSnapshot.exists && !conversationEvent.conversation.customerPhone) delete updates.customerPhone;
      if (existingSnapshot.exists && !conversationEvent.conversation.avatarUrl) delete updates.avatarUrl;
      if (existingSnapshot.exists && !hasUsefulSnippet) {
        delete updates.lastMessageSnippet;
        delete updates.lastMessageTime;
      }
      transaction.set(conversationRef, updates, { merge: true });
      return { applied: true, reason: '' };
    });
    return {
      accepted: true,
      ignored: !result.applied,
      eventType: 'conversation',
      reason: result.reason || undefined,
      conversationId: conversationDoc.id,
      version: conversationEvent.version
    };
  }

  const normalized = normalizePancakeWebhook(payload, config);
  if (!normalized) return { accepted: true, ignored: true, reason: 'UNSUPPORTED_EVENT' };
  const conversationDoc = conversationDocument(normalized.conversation, branch);
  const messageDoc = messageDocument(normalized.message, conversationDoc);
  const conversationRef = db.collection('chatConversations').doc(conversationDoc.id);
  const messageRef = db.collection('chatMessages').doc(messageDoc.id);
  const slaMinutes = normalized.message.sender === 'CUSTOMER' ? await firstResponseMinutes(db) : null;
  const result = await db.runTransaction(async transaction => {
    const [existingConversation, existingMessage] = await Promise.all([
      transaction.get(conversationRef),
      transaction.get(messageRef)
    ]);
    const existing = existingConversation.data() || {};
    if (existingMessage.exists) {
      const currentMessage = existingMessage.data() || {};
      const currentAttachments = Array.isArray(currentMessage.attachments) ? currentMessage.attachments.filter(Boolean) : [];
      const messageChanged = asString(currentMessage.content) !== normalized.message.content
        || JSON.stringify(currentAttachments) !== JSON.stringify(normalized.message.attachments)
        || asString(currentMessage.senderName) !== normalized.message.senderName;
      if (!messageChanged) return { duplicate: true, updated: false };
      transaction.set(messageRef, {
        content: normalized.message.content,
        attachments: normalized.message.attachments,
        sender: normalized.message.sender,
        senderName: normalized.message.senderName,
        timestamp: safeTimestamp(normalized.message.timestamp),
        timestampIso: normalized.message.timestamp,
        webhookUpdatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      const existingLastMessageMs = existing.lastMessageTime || existing.updatedAt
        ? safeTimestamp(existing.lastMessageTime || existing.updatedAt).toMillis()
        : 0;
      if (safeTimestamp(normalized.message.timestamp).toMillis() >= existingLastMessageMs) {
        transaction.set(conversationRef, {
          lastMessageSnippet: normalized.message.content,
          lastMessageTime: normalized.message.timestamp,
          updatedAt: safeTimestamp(normalized.message.timestamp)
        }, { merge: true });
      }
      return { duplicate: true, updated: true };
    }
    const previousUnread = asNumber(existing.unreadCount);
    const inbound = normalized.message.sender === 'CUSTOMER';
    const workflowUpdates: Record<string, any> = {};
    if (inbound) {
      workflowUpdates.lastCustomerMessageAt = safeTimestamp(normalized.message.timestamp);
      workflowUpdates.awaitingStaffReply = true;
      if (!existing.firstCustomerMessageAt) workflowUpdates.firstCustomerMessageAt = safeTimestamp(normalized.message.timestamp);
      if (!existing.firstResponseAt && !existing.firstResponseDueAt) {
        const dueAt = dueAtFrom(normalized.message.timestamp, slaMinutes);
        if (dueAt) workflowUpdates.firstResponseDueAt = dueAt;
      }
      workflowUpdates.workflowStatus = ['WON', 'LOST', 'CLOSED'].includes(asString(existing.workflowStatus).toUpperCase())
        ? 'OPEN'
        : existing.workflowStatus || 'NEW';
    } else {
      workflowUpdates.lastStaffMessageAt = safeTimestamp(normalized.message.timestamp);
      workflowUpdates.awaitingStaffReply = false;
      workflowUpdates.workflowStatus = !existing.workflowStatus || existing.workflowStatus === 'NEW' ? 'OPEN' : existing.workflowStatus;
      if (!existing.firstResponseAt && existing.firstCustomerMessageAt) {
        const firstCustomerAt = safeTimestamp(existing.firstCustomerMessageAt);
        const responseAt = safeTimestamp(normalized.message.timestamp);
        const responseSeconds = Math.max(0, Math.round((responseAt.toMillis() - firstCustomerAt.toMillis()) / 1000));
        workflowUpdates.firstResponseAt = responseAt;
        workflowUpdates.firstResponseSeconds = responseSeconds;
        if (existing.firstResponseDueAt) workflowUpdates.slaMet = responseAt.toMillis() <= safeTimestamp(existing.firstResponseDueAt).toMillis();
      }
    }
    transaction.set(conversationRef, {
      ...conversationDoc,
      createdAt: existing.createdAt || conversationDoc.createdAt,
      unreadCount: inbound ? previousUnread + 1 : previousUnread,
      lastMessageSnippet: normalized.message.content,
      lastMessageTime: normalized.message.timestamp,
      updatedAt: safeTimestamp(normalized.message.timestamp),
      ...workflowUpdates
    }, { merge: true });
    transaction.create(messageRef, messageDoc);
    return { duplicate: false, updated: false };
  });
  return { accepted: true, ignored: false, eventType: 'messaging', duplicate: result.duplicate, updated: result.updated, conversationId: conversationDoc.id, messageId: messageDoc.id };
}

export async function sendPancakeMessage(db: Firestore | null, input: { conversationId: string; text: string; operationKey: string }, actor: PancakeActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const text = asString(input.text);
  if (!text) throw new Error('PANCAKE_MESSAGE_REQUIRED');
  if (text.length > 5000) throw new Error('PANCAKE_MESSAGE_TOO_LONG');
  const conversationSnapshot = await db.collection('chatConversations').doc(asString(input.conversationId)).get();
  if (!conversationSnapshot.exists) throw new Error('PANCAKE_CONVERSATION_NOT_FOUND');
  const conversation = { id: conversationSnapshot.id, ...conversationSnapshot.data() } as any;
  assertBranchAccess(actor, conversation.branchId);
  const config = configByPageId(conversation.pageId);
  const operationId = hashId('PCK_SEND', input.operationKey || actor.uid, conversation.id, text);
  const operationRef = db.collection('pancakeSendOperations').doc(operationId);
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
    throw new Error('PANCAKE_SEND_ALREADY_PROCESSING');
  }
  try {
    const payload = await pancakeApiRequest(
      config,
      `/pages/${encodeURIComponent(config.pageId)}/conversations/${encodeURIComponent(conversation.externalConversationId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          action: conversation.conversationType === 'COMMENT' ? 'reply_comment' : 'reply_inbox',
          message: text
        })
      },
      'v1'
    );
    const rawMessage = asObject(payload?.message || payload?.data || payload);
    const normalized = normalizePancakeMessage({
      ...rawMessage,
      id: rawMessage.id || rawMessage.message_id || operationId,
      content: messageText(rawMessage) || text,
      sender: { id: config.pageId, name: actor.name || 'Nhân viên PhoneHouse', type: 'PAGE' },
      is_from_page: true,
      created_at: rawMessage.created_at || new Date().toISOString()
    }, config.pageId, conversation.conversationType || 'INBOX')!;
    const document = messageDocument(normalized, conversation);
    const conversationRef = conversationSnapshot.ref;
    const assignmentEventRef = db.collection('chatConversationEvents').doc();
    const slaMinutes = await firstResponseMinutes(db);
    await db.runTransaction(async transaction => {
      const [messageSnapshot, currentConversationSnapshot] = await Promise.all([
        transaction.get(db.collection('chatMessages').doc(document.id)),
        transaction.get(conversationRef)
      ]);
      if (!currentConversationSnapshot.exists) throw new Error('PANCAKE_CONVERSATION_NOT_FOUND');
      const currentConversation = currentConversationSnapshot.data()!;
      if (!messageSnapshot.exists) transaction.create(db.collection('chatMessages').doc(document.id), document);
      const workflowUpdates: Record<string, any> = {
        lastStaffMessageAt: safeTimestamp(normalized.timestamp),
        awaitingStaffReply: false,
        workflowStatus: ['WON', 'LOST', 'CLOSED'].includes(asString(currentConversation.workflowStatus).toUpperCase())
          ? 'OPEN'
          : !currentConversation.workflowStatus || currentConversation.workflowStatus === 'NEW'
            ? 'OPEN'
            : currentConversation.workflowStatus
      };
      if (!currentConversation.assignedStaffId) {
        workflowUpdates.assignedStaffId = actor.uid;
        workflowUpdates.assignedStaffName = asString(actor.name) || actor.uid;
        transaction.create(assignmentEventRef, {
          id: assignmentEventRef.id,
          conversationId: currentConversationSnapshot.id,
          pageId: currentConversation.pageId,
          branchId: currentConversation.branchId,
          eventType: 'AUTO_ASSIGNED_ON_REPLY',
          actorUid: actor.uid,
          actorName: asString(actor.name) || actor.uid,
          createdAt: FieldValue.serverTimestamp()
        });
      }
      if (!currentConversation.firstResponseAt && currentConversation.firstCustomerMessageAt) {
        const firstCustomerAt = safeTimestamp(currentConversation.firstCustomerMessageAt);
        const responseAt = safeTimestamp(normalized.timestamp);
        const dueAt = currentConversation.firstResponseDueAt
          ? safeTimestamp(currentConversation.firstResponseDueAt)
          : dueAtFrom(firestoreTimestampIso(firstCustomerAt), slaMinutes);
        const responseSeconds = Math.max(0, Math.round((responseAt.toMillis() - firstCustomerAt.toMillis()) / 1000));
        workflowUpdates.firstResponseAt = responseAt;
        workflowUpdates.firstResponseSeconds = responseSeconds;
        if (dueAt) {
          workflowUpdates.firstResponseDueAt = dueAt;
          workflowUpdates.slaMet = responseAt.toMillis() <= dueAt.toMillis();
        }
      }
      transaction.set(conversationRef, {
        lastMessageSnippet: normalized.content,
        lastMessageTime: normalized.timestamp,
        unreadCount: 0,
        updatedAt: safeTimestamp(normalized.timestamp),
        lastSyncedAt: FieldValue.serverTimestamp(),
        ...workflowUpdates
      }, { merge: true });
      transaction.set(operationRef, { status: 'SENT', message: clientMessage(document), completedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    return { message: clientMessage(document), idempotentReplay: false };
  } catch (error: any) {
    await operationRef.set({ status: 'FAILED', error: asString(error?.message), failedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw error;
  }
}

export async function markPancakeConversationRead(db: Firestore | null, conversationId: string, actor: PancakeActor) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const snapshot = await db.collection('chatConversations').doc(conversationId).get();
  if (!snapshot.exists) throw new Error('PANCAKE_CONVERSATION_NOT_FOUND');
  const conversation = { id: snapshot.id, ...snapshot.data() } as any;
  assertBranchAccess(actor, conversation.branchId);
  const config = configByPageId(conversation.pageId);
  await pancakeApiRequest(
    config,
    `/pages/${encodeURIComponent(config.pageId)}/conversations/${encodeURIComponent(conversation.externalConversationId)}/read`,
    { method: 'POST', body: '{}' },
    'v1'
  );
  await snapshot.ref.set({ unreadCount: 0, readAt: FieldValue.serverTimestamp(), readByUid: actor.uid }, { merge: true });
  return { conversationId, unreadCount: 0 };
}
