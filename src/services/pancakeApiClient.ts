import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { ChatConversation, ChatMessage } from '../features/chat/types';

interface PancakeApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PancakeChannelStatus {
  pageId: string;
  pageName: string;
  branchId: string;
  branchName: string;
  historyDays: number;
  includeComments: boolean;
  status: 'READY' | 'MISSING_TOKEN' | 'CONFIG_ERROR';
  webhookStatus?: 'RECEIVING' | 'NOT_SEEN' | 'MISSING_SECRET';
  lastWebhookAt?: string;
  error?: string;
  requiredTokenEnv?: string;
}

export interface PancakeBranchOption {
  id: string;
  name: string;
  code: string;
}

export interface PancakeWebhookSetup {
  pageId: string;
  pageName: string;
  branchId: string;
  branchName: string;
  callbackUrl: string;
  webhookStatus: 'RECEIVING' | 'NOT_SEEN';
  lastWebhookAt?: string;
  lastWebhookEvent?: string;
  requiredEvents: string[];
  docsUrl: string;
}

export interface PancakeChatStaffOption {
  id: string;
  name: string;
  role: string;
  branchId: string;
}

export interface PancakeChatSummary {
  branchId: string;
  periodDays: number;
  total: number;
  unassigned: number;
  awaitingReply: number;
  overdue: number;
  followUpDue: number;
  won: number;
  lost: number;
  conversionRate: number;
  slaMeasured: number;
  slaMet: number;
  slaRate: number;
  averageFirstResponseSeconds: number;
  sampleCapped: boolean;
  byStaff: Array<{ staffId: string; staffName: string; total: number; open: number; won: number; overdue: number }>;
  generatedAt: string;
}

export interface PancakeConversationPage {
  items: ChatConversation[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PancakeSyncResult {
  pageId: string;
  imported: number;
  scanned: number;
  nextCursor: string | null;
  done: boolean;
  cutoffAt: string;
}

export interface PancakeRepairResult {
  pageId: string;
  scanned: number;
  conversations: number;
  repaired: number;
  removed: number;
  failed: number;
  hasMore: boolean;
}

async function requestPancakeApi<T>(
  endpoint: string,
  options: { method?: 'GET' | 'POST' | 'PATCH'; query?: Record<string, unknown>; payload?: Record<string, unknown> } = {}
): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn.');
  const token = await user.getIdToken(false);
  const query = new URLSearchParams();
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  const response = await fetch(`/api/pancake/${endpoint}${query.size ? `?${query}` : ''}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: (options.method || 'GET') === 'GET' ? undefined : JSON.stringify(options.payload || {})
  });
  const body = await response.json().catch(() => ({ success: false, error: `HTTP_${response.status}` })) as PancakeApiEnvelope<T>;
  if (!response.ok || !body.success) throw new Error(body.error || `Pancake API lỗi ${response.status}`);
  return body.data as T;
}

export function createPancakeOperationKey(prefix = 'PCK_SEND') {
  const unique = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${unique}`;
}

export function requestPancakeChannels() {
  return requestPancakeApi<{ channels: PancakeChannelStatus[]; branches: PancakeBranchOption[] }>('channels');
}

export function requestLinkPancakeBranch(pageId: string, branchId: string) {
  return requestPancakeApi<Pick<PancakeChannelStatus, 'pageId' | 'pageName' | 'branchId' | 'branchName' | 'status'>>(
    `channels/${encodeURIComponent(pageId)}/branch`,
    { method: 'POST', payload: { branchId } }
  );
}

export function requestPancakeWebhookSetup(pageId: string) {
  return requestPancakeApi<PancakeWebhookSetup>(
    `channels/${encodeURIComponent(pageId)}/webhook-setup`
  );
}

export function requestPancakeConversations(input: { branchId?: string; cursor?: string; limit?: number } = {}) {
  return requestPancakeApi<PancakeConversationPage>('conversations', { query: input });
}

export function requestPancakeChatStaff(branchId: string) {
  return requestPancakeApi<{ branchId: string; items: PancakeChatStaffOption[] }>('staff', { query: { branchId } });
}

export function requestPancakeChatSummary(branchId: string, periodDays = 30) {
  return requestPancakeApi<PancakeChatSummary>('summary', { query: { branchId, periodDays } });
}

export function requestUpdatePancakeWorkflow(
  conversationId: string,
  input: {
    assignedStaffId?: string;
    workflowStatus?: string;
    priority?: string;
    nextFollowUpAt?: string | null;
    outcomeNote?: string;
  }
) {
  return requestPancakeApi<ChatConversation>(
    `conversations/${encodeURIComponent(conversationId)}/workflow`,
    { method: 'PATCH', payload: input }
  );
}

export function requestPancakeMessages(conversationId: string, refresh = true) {
  return requestPancakeApi<{ items: ChatMessage[]; warning?: string }>(
    `conversations/${encodeURIComponent(conversationId)}/messages`,
    { query: { refresh } }
  );
}

function firestoreDateIso(value: any): string {
  if (value?.toDate instanceof Function) return value.toDate().toISOString();
  if (value?.seconds !== undefined) return new Date(Number(value.seconds) * 1000).toISOString();
  const parsed = new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/**
 * Realtime stream for the conversation currently open on screen. Pancake
 * webhook writes remain server-only; the client only listens to authorized
 * branch data through Firestore Rules.
 */
export function subscribePancakeMessages(
  conversationId: string,
  branchId: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError?: (error: unknown) => void
) {
  const streamQuery = query(
    collection(db, 'chatMessages'),
    where('branchId', '==', branchId),
    where('conversationId', '==', conversationId),
    orderBy('timestamp', 'asc'),
    limit(500)
  );
  return onSnapshot(streamQuery, snapshot => {
    onMessages(snapshot.docs.map(document => {
      const data = document.data() as Record<string, any>;
      return {
        id: document.id,
        externalMessageId: data.externalMessageId,
        sender: data.sender || 'CUSTOMER',
        senderName: data.senderName || 'Khách hàng',
        content: typeof data.content === 'string' ? data.content : '',
        timestamp: data.timestampIso || firestoreDateIso(data.timestamp),
        attachments: Array.isArray(data.attachments) ? data.attachments.filter((item: unknown) => typeof item === 'string') : [],
        messageKind: data.messageKind || 'MESSAGE'
      } as ChatMessage;
    }));
  }, error => onError?.(error));
}

export function requestSendPancakeMessage(conversationId: string, text: string) {
  return requestPancakeApi<{ message: ChatMessage; idempotentReplay: boolean }>(
    `conversations/${encodeURIComponent(conversationId)}/send`,
    { method: 'POST', payload: { text, operationKey: createPancakeOperationKey() } }
  );
}

export function requestMarkPancakeRead(conversationId: string) {
  return requestPancakeApi<{ conversationId: string; unreadCount: number }>(
    `conversations/${encodeURIComponent(conversationId)}/read`,
    { method: 'POST' }
  );
}

export function requestSyncPancakePage(pageId: string, cursor?: string | null) {
  return requestPancakeApi<PancakeSyncResult>('sync', {
    method: 'POST',
    payload: { pageId, cursor: cursor || undefined }
  });
}

export function requestRepairPancakeMessages(pageId: string, limit = 5) {
  return requestPancakeApi<PancakeRepairResult>('repair-messages', {
    method: 'POST',
    payload: { pageId, limit }
  });
}
