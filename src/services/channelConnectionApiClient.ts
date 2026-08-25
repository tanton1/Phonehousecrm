import { auth } from '../lib/firebase';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ChannelConnection {
  id: string;
  provider: 'META_MESSENGER';
  externalAccountId: string;
  displayName: string;
  branchId: string;
  branchName: string;
  active: boolean;
  status: string;
  hasToken: boolean;
  tokenFingerprint?: string;
  historyDays: number;
  includeComments: boolean;
  source: string;
  webhookStatus: 'RECEIVING' | 'NOT_SEEN';
  lastWebhookAt?: string;
  lastWebhookEvent?: string;
  lastTestedAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  subscribedFields: string[];
}

export interface MetaOAuthPage {
  pageId: string;
  pageName: string;
  tasks: string[];
}

export interface MetaOAuthSession {
  id: string;
  status: string;
  pages: MetaOAuthPage[];
}

export interface ChannelConnectionEvent {
  id: string;
  connectionId?: string;
  pageId?: string;
  branchId?: string;
  eventType: string;
  actorName?: string;
  occurredAt?: string;
}

function timestampIso(value: any): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (value?.toDate instanceof Function) return value.toDate().toISOString();
  const seconds = Number(value.seconds ?? value._seconds);
  if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function normalizeConnection(input: any): ChannelConnection {
  return {
    ...input,
    lastWebhookAt: timestampIso(input?.lastWebhookAt),
    lastTestedAt: timestampIso(input?.lastTestedAt),
    lastSyncAt: timestampIso(input?.lastSyncAt),
    subscribedFields: Array.isArray(input?.subscribedFields) ? input.subscribedFields : []
  } as ChannelConnection;
}

async function requestApi<T>(
  endpoint = '',
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; payload?: unknown } = {}
): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Phiên đăng nhập đã hết hạn.');
  const token = await user.getIdToken(false);
  const response = await fetch(`/api/channel-connections/${endpoint}`, {
    method: options.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: (options.method || 'GET') === 'GET' ? undefined : JSON.stringify(options.payload || {})
  });
  const body = await response.json().catch(() => ({ success: false, error: `HTTP_${response.status}` })) as ApiEnvelope<T>;
  if (!response.ok || !body.success) throw new Error(body.error || `Không thể quản lý kết nối (${response.status}).`);
  return body.data as T;
}

export async function listChannelConnections() {
  const result = await requestApi<{ items: any[] }>();
  return (result.items || []).map(normalizeConnection);
}

export async function createManualMetaConnection(input: {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  branchId: string;
  historyDays: number;
  includeComments: boolean;
}) {
  return normalizeConnection(await requestApi('', { method: 'POST', payload: input }));
}

export async function updateMetaConnection(connectionId: string, input: Record<string, unknown>) {
  return normalizeConnection(await requestApi(encodeURIComponent(connectionId), { method: 'PATCH', payload: input }));
}

export function disconnectMetaConnection(connectionId: string) {
  return requestApi<{ connectionId: string; deleted: boolean; disconnected: boolean }>(
    encodeURIComponent(connectionId),
    { method: 'DELETE' }
  );
}

export async function testMetaConnection(connectionId: string, subscribe = false) {
  return normalizeConnection(await requestApi(`${encodeURIComponent(connectionId)}/test`, {
    method: 'POST',
    payload: { subscribe }
  }));
}

export function startMetaOAuth() {
  return requestApi<{ provider: string; authorizationUrl: string; expiresAt: string }>('meta/oauth/start');
}

export function getMetaOAuthSession(sessionId: string) {
  return requestApi<MetaOAuthSession>(`meta/oauth/sessions/${encodeURIComponent(sessionId)}`);
}

export function importMetaOAuthPages(sessionId: string, pages: Array<{
  pageId: string;
  branchId: string;
  historyDays: number;
  includeComments: boolean;
}>) {
  return requestApi<{ imported: number; pageIds: string[] }>(
    `meta/oauth/sessions/${encodeURIComponent(sessionId)}/import`,
    { method: 'POST', payload: { pages } }
  );
}

export async function listChannelConnectionEvents(connectionId = '') {
  const query = connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : '';
  const result = await requestApi<{ items: any[] }>(`events/list${query}`);
  return (result.items || []).map(item => ({ ...item, occurredAt: timestampIso(item.occurredAt) })) as ChannelConnectionEvent[];
}
