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
  chatId?: string;
  ownerUserIds?: string[];
}

export interface TelegramConfigurationInput {
  botToken?: string;
  chatId: string;
  ownerUserIds: string;
  alertsEnabled: boolean;
  queriesEnabled: boolean;
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
