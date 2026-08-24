import { auth } from '../lib/firebase';
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
  error?: string;
  requiredTokenEnv?: string;
}

export interface PancakeBranchOption {
  id: string;
  name: string;
  code: string;
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

async function requestPancakeApi<T>(
  endpoint: string,
  options: { method?: 'GET' | 'POST'; query?: Record<string, unknown>; payload?: Record<string, unknown> } = {}
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

export function requestPancakeConversations(input: { branchId?: string; cursor?: string; limit?: number } = {}) {
  return requestPancakeApi<PancakeConversationPage>('conversations', { query: input });
}

export function requestPancakeMessages(conversationId: string, refresh = true) {
  return requestPancakeApi<{ items: ChatMessage[]; warning?: string }>(
    `conversations/${encodeURIComponent(conversationId)}/messages`,
    { query: { refresh } }
  );
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
