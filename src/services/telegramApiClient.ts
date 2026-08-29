import { apiJson } from './apiClient';

export interface TelegramRuntimeStatus {
  configured: boolean;
  connected: boolean;
  botUsername?: string;
  webhookConfigured?: boolean;
  pendingUpdateCount?: number;
  lastWebhookErrorAt?: string | null;
  lastWebhookErrorMessage?: string | null;
  alertsEnabled?: boolean;
  queriesEnabled?: boolean;
  destinationFingerprint?: string;
  missing?: string[];
  errorCode?: string;
  source?: 'ENVIRONMENT' | 'DATABASE';
  hasBotToken?: boolean;
  hasWebhookSecret?: boolean;
  hasGeminiApiKey?: boolean;
  geminiBaseUrl?: string;
  aiModel?: string;
  chatId?: string;
  ownerUserIds?: string[];
}

export interface TelegramConfigurationInput {
  botToken?: string;
  chatId: string;
  ownerUserIds: string;
  alertsEnabled: boolean;
  queriesEnabled: boolean;
  geminiApiKey?: string;
  geminiBaseUrl?: string;
  aiModel?: string;
}

export async function requestTelegramStatus(): Promise<TelegramRuntimeStatus> {
  const response = await apiJson<{ success: boolean; data: TelegramRuntimeStatus }>('/api/telegram/status', {
    method: 'GET', cache: 'no-store', timeoutMs: 12_000
  });
  return response.data;
}

export async function requestTelegramTest(): Promise<{ messageId?: string | number | null }> {
  const response = await apiJson<{ success: boolean; data: { messageId?: string | number | null } }>('/api/telegram/test', {
    method: 'POST', body: JSON.stringify({}), timeoutMs: 12_000
  });
  return response.data;
}

export async function requestTestGeminiAi(geminiApiKey?: string, geminiBaseUrl?: string, aiModel?: string): Promise<{ success: boolean; model?: string }> {
  const response = await apiJson<{ success: boolean; data: { success: boolean; model?: string } }>('/api/telegram/test-ai', {
    method: 'POST', body: JSON.stringify({ geminiApiKey: geminiApiKey || undefined, geminiBaseUrl: geminiBaseUrl || undefined, aiModel: aiModel || undefined }), timeoutMs: 15_000
  });
  return response.data;
}

export async function requestRegisterTelegramWebhook(): Promise<{ url: string }> {
  const response = await apiJson<{ success: boolean; data: { url: string } }>('/api/telegram/register-webhook', {
    method: 'POST', body: JSON.stringify({}), timeoutMs: 12_000
  });
  return response.data;
}

export async function requestSaveTelegramConfiguration(input: TelegramConfigurationInput): Promise<{ configuration: TelegramRuntimeStatus; webhook: { url: string } }> {
  const response = await apiJson<{ success: boolean; data: { configuration: TelegramRuntimeStatus; webhook: { url: string } } }>('/api/telegram/configuration', {
    method: 'POST', body: JSON.stringify(input), timeoutMs: 20_000
  });
  return response.data;
}

export async function requestDeleteTelegramConfiguration(): Promise<void> {
  await apiJson<{ success: boolean; data: { deleted: boolean } }>('/api/telegram/configuration', {
    method: 'DELETE', timeoutMs: 12_000
  });
}

export interface TelegramLinkStatus {
  linked: boolean;
  linkedAt?: string;
  senderFingerprint?: string;
}

export async function requestTelegramLinkStatus(): Promise<TelegramLinkStatus> {
  const response = await apiJson<{ success: boolean; data: TelegramLinkStatus }>('/api/telegram/link-status', {
    method: 'GET', cache: 'no-store', timeoutMs: 12_000
  });
  return response.data;
}

export async function requestTelegramLinkCode(): Promise<{ code: string; expiresAt: string }> {
  const response = await apiJson<{ success: boolean; data: { code: string; expiresAt: string } }>('/api/telegram/link-code', {
    method: 'POST', body: JSON.stringify({}), timeoutMs: 12_000
  });
  return response.data;
}

export async function requestUnlinkTelegram(): Promise<void> {
  await apiJson<{ success: boolean; data: { unlinked: boolean } }>('/api/telegram/link', {
    method: 'DELETE', timeoutMs: 12_000
  });
}
