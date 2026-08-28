import crypto from 'crypto';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { getVietnamDateString } from '../../shared/vietnamTime';
import { getDeviceLifecycleTimeline } from './deviceLifecycleService';
import { deriveTechnicalBoardStage } from './technicalService';
import { verifyGeofence } from './geofenceService';
import { decryptChannelSecret, encryptChannelSecret } from './channelConnectionService';

type TelegramAction = 'CHECK_IN' | 'CHECK_OUT' | 'MISSING_CHECK_IN' | 'SHIFT_LOCATION';

export interface TelegramConfig {
  token: string;
  chatId: string;
  webhookSecret: string;
  ownerUserIds: Set<string>;
  alertsEnabled: boolean;
  queriesEnabled: boolean;
  source?: 'ENVIRONMENT' | 'DATABASE';
}

export interface TelegramAdminConfiguration {
  source: 'ENVIRONMENT' | 'DATABASE';
  hasBotToken: boolean;
  hasWebhookSecret: boolean;
  chatId: string;
  ownerUserIds: string[];
  alertsEnabled: boolean;
  queriesEnabled: boolean;
}

export interface TelegramConfigurationInput {
  botToken?: unknown;
  chatId?: unknown;
  ownerUserIds?: unknown;
  alertsEnabled?: unknown;
  queriesEnabled?: unknown;
}

export interface AttendanceTelegramAlertInput {
  attendanceId: string;
  action: TelegramAction;
  staffId: string;
  staffName: string;
  branchId: string;
  branchName?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  actualTime?: string;
  lateMinutes?: number;
  distanceMeters?: number;
  radiusMeters?: number;
  violations: Array<'LATE' | 'OUTSIDE_GEOFENCE' | 'MISSING_CHECK_IN' | 'RETURNED_INSIDE'>;
}

export interface TelegramOutboxRecord extends AttendanceTelegramAlertInput {
  eventType: 'ATTENDANCE_EXCEPTION';
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  attempts: number;
  destination: 'PRIMARY_GROUP';
  createdAt: unknown;
  createdAtIso: string;
  nextAttemptAt?: string | null;
  sentAt?: unknown;
  providerMessageId?: string | number | null;
  lastErrorCode?: string | null;
}

type TelegramIntent =
  | { kind: 'HELP' }
  | { kind: 'REVENUE'; period: 'TODAY' | 'WEEK' | 'MONTH'; branchToken?: string; all: boolean }
  | { kind: 'IMEI'; imei: string }
  | { kind: 'TECHNICAL'; branchToken?: string; all: boolean }
  | { kind: 'INVENTORY'; branchToken?: string; all: boolean; model?: string }
  | { kind: 'UNKNOWN' };

const TERMINAL_WORK_ORDER_STATUSES = new Set(['DELIVERED_TO_CUSTOMER', 'RETURNED_TO_STOCK', 'RETURNED_TO_BRANCH', 'CANCELLED']);
const TELEGRAM_CONFIGURATION_COLLECTION = 'telegramConfigurations';
const TELEGRAM_CONFIGURATION_DOCUMENT = 'primary';
const TELEGRAM_CONFIGURATION_CACHE_MS = 60_000;
let databaseTelegramConfigCache: { config: TelegramConfig; expiresAt: number } | null = null;

function boolEnv(name: string, fallback = false): boolean {
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function environmentTelegramConfig(): TelegramConfig {
  return {
    token: String(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    chatId: String(process.env.TELEGRAM_CHAT_ID || '').trim(),
    webhookSecret: String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim(),
    ownerUserIds: new Set(String(process.env.TELEGRAM_OWNER_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean)),
    alertsEnabled: boolEnv('TELEGRAM_ALERTS_ENABLED'),
    queriesEnabled: boolEnv('TELEGRAM_QUERIES_ENABLED'),
    source: 'ENVIRONMENT'
  };
}

export function getTelegramConfig(): TelegramConfig {
  if (databaseTelegramConfigCache && databaseTelegramConfigCache.expiresAt > Date.now()) {
    return databaseTelegramConfigCache.config;
  }
  return environmentTelegramConfig();
}

export function clearTelegramConfigCache(): void {
  databaseTelegramConfigCache = null;
}

function normalizeOwnerUserIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(values.map(item => String(item || '').trim()).filter(Boolean))];
}

function publicTelegramConfiguration(config: TelegramConfig): TelegramAdminConfiguration {
  return {
    source: config.source === 'DATABASE' ? 'DATABASE' : 'ENVIRONMENT',
    hasBotToken: Boolean(config.token),
    hasWebhookSecret: Boolean(config.webhookSecret),
    chatId: config.chatId,
    ownerUserIds: [...config.ownerUserIds],
    alertsEnabled: config.alertsEnabled,
    queriesEnabled: config.queriesEnabled
  };
}

export async function loadTelegramConfig(db: Firestore | null, force = false): Promise<TelegramConfig> {
  if (!force && databaseTelegramConfigCache && databaseTelegramConfigCache.expiresAt > Date.now()) {
    return databaseTelegramConfigCache.config;
  }
  const environment = environmentTelegramConfig();
  if (!db) return environment;
  const snapshot = await db.collection(TELEGRAM_CONFIGURATION_COLLECTION).doc(TELEGRAM_CONFIGURATION_DOCUMENT).get();
  const data = snapshot.exists ? snapshot.data() || {} : null;
  if (!data || data.active === false) {
    databaseTelegramConfigCache = null;
    return environment;
  }
  try {
    const config: TelegramConfig = {
      token: decryptChannelSecret(data.encryptedBotToken),
      chatId: String(data.chatId || '').trim(),
      webhookSecret: decryptChannelSecret(data.encryptedWebhookSecret),
      ownerUserIds: new Set(normalizeOwnerUserIds(data.ownerUserIds)),
      alertsEnabled: data.alertsEnabled !== false,
      queriesEnabled: data.queriesEnabled !== false,
      source: 'DATABASE'
    };
    databaseTelegramConfigCache = { config, expiresAt: Date.now() + TELEGRAM_CONFIGURATION_CACHE_MS };
    return config;
  } catch (error) {
    if (telegramIsConfigured(environment)) return environment;
    throw new Error('TELEGRAM_CONFIGURATION_DECRYPT_FAILED');
  }
}

export async function getTelegramAdminConfiguration(db: Firestore | null): Promise<TelegramAdminConfiguration> {
  return publicTelegramConfiguration(await loadTelegramConfig(db, true));
}

export async function saveTelegramConfiguration(
  db: Firestore,
  input: TelegramConfigurationInput,
  actor: { uid: string; name?: string }
): Promise<TelegramAdminConfiguration> {
  const ref = db.collection(TELEGRAM_CONFIGURATION_COLLECTION).doc(TELEGRAM_CONFIGURATION_DOCUMENT);
  const currentSnapshot = await ref.get();
  const current = currentSnapshot.exists ? currentSnapshot.data() || {} : {};
  const environment = environmentTelegramConfig();
  const suppliedToken = String(input.botToken || '').trim();
  const token = suppliedToken || decryptChannelSecret(current.encryptedBotToken) || environment.token;
  const chatId = String(input.chatId ?? current.chatId ?? environment.chatId).trim();
  const webhookSecret = decryptChannelSecret(current.encryptedWebhookSecret)
    || environment.webhookSecret
    || crypto.randomBytes(32).toString('hex');
  const ownerUserIds = normalizeOwnerUserIds(input.ownerUserIds ?? current.ownerUserIds ?? [...environment.ownerUserIds]);
  const alertsEnabled = typeof input.alertsEnabled === 'boolean' ? input.alertsEnabled : current.alertsEnabled !== false;
  const queriesEnabled = typeof input.queriesEnabled === 'boolean' ? input.queriesEnabled : current.queriesEnabled !== false;
  if (!/^\d{6,20}:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('TELEGRAM_BOT_TOKEN_INVALID');
  if (!/^-\d{5,25}$/.test(chatId)) throw new Error('TELEGRAM_GROUP_CHAT_ID_INVALID');
  if (ownerUserIds.some(id => !/^\d{3,25}$/.test(id))) throw new Error('TELEGRAM_OWNER_USER_ID_INVALID');
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(webhookSecret)) throw new Error('TELEGRAM_WEBHOOK_SECRET_INVALID');
  const candidate: TelegramConfig = {
    token, chatId, webhookSecret, ownerUserIds: new Set(ownerUserIds), alertsEnabled, queriesEnabled, source: 'DATABASE'
  };
  const [bot, chat] = await Promise.all([
    telegramRequest<any>('getMe', undefined, candidate),
    telegramRequest<any>('getChat', { chat_id: chatId }, candidate)
  ]);
  if (!['group', 'supergroup'].includes(String(chat?.type || ''))) throw new Error('TELEGRAM_GROUP_CHAT_REQUIRED');
  await ref.set({
    encryptedBotToken: encryptChannelSecret(token),
    encryptedWebhookSecret: encryptChannelSecret(webhookSecret),
    tokenFingerprint: crypto.createHash('sha256').update(token).digest('hex').slice(0, 12),
    chatId,
    chatTitle: String(chat?.title || '').trim().slice(0, 200),
    botUsername: String(bot?.username || '').trim().slice(0, 100),
    ownerUserIds,
    alertsEnabled,
    queriesEnabled,
    active: true,
    updatedAt: FieldValue.serverTimestamp(),
    updatedAtIso: new Date().toISOString(),
    updatedByUid: actor.uid,
    updatedByName: String(actor.name || actor.uid).trim().slice(0, 160)
  }, { merge: false });
  databaseTelegramConfigCache = { config: candidate, expiresAt: Date.now() + TELEGRAM_CONFIGURATION_CACHE_MS };
  return publicTelegramConfiguration(candidate);
}

export async function deleteTelegramConfiguration(db: Firestore): Promise<void> {
  await db.collection(TELEGRAM_CONFIGURATION_COLLECTION).doc(TELEGRAM_CONFIGURATION_DOCUMENT).delete();
  clearTelegramConfigCache();
}

export function telegramIsConfigured(config = getTelegramConfig()): boolean {
  return Boolean(config.token && config.chatId && config.webhookSecret);
}

export function telegramAlertsEnabled(): boolean {
  const config = getTelegramConfig();
  return config.alertsEnabled && telegramIsConfigured(config);
}

export function attendanceTelegramOutboxId(attendanceId: string, action: TelegramAction, suffix = ''): string {
  return crypto.createHash('sha256').update(`ATTENDANCE:${attendanceId}:${action}:${suffix}`).digest('hex');
}

export function createAttendanceTelegramOutboxRecord(input: AttendanceTelegramAlertInput): TelegramOutboxRecord {
  const record = {
    ...input,
    staffName: String(input.staffName || 'Nhân viên').trim().slice(0, 160),
    branchName: String(input.branchName || input.branchId || 'Chi nhánh').trim().slice(0, 160),
    eventType: 'ATTENDANCE_EXCEPTION',
    status: 'PENDING',
    attempts: 0,
    destination: 'PRIMARY_GROUP',
    createdAt: FieldValue.serverTimestamp(),
    createdAtIso: new Date().toISOString(),
    nextAttemptAt: null,
    lastErrorCode: null
  };
  // Firestore Admin rejects explicit `undefined` values. Legacy attendance
  // records may not contain every optional shift field, so omit those keys
  // structurally instead of relying on a global ignoreUndefined setting.
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as unknown as TelegramOutboxRecord;
}

export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatVnd(value: unknown): string {
  const amount = Number(value || 0);
  return `${(Number.isFinite(amount) ? Math.round(amount) : 0).toLocaleString('vi-VN')} đ`;
}

function formatAttendanceAlert(record: TelegramOutboxRecord): string {
  const labels: Record<string, string> = {
    CHECK_IN: 'VÀO CA', CHECK_OUT: 'RA CA', MISSING_CHECK_IN: 'CHƯA VÀO CA', SHIFT_LOCATION: 'VỊ TRÍ TRONG CA'
  };
  const violationLabels = record.violations.map(violation => ({
    LATE: `Đi trễ ${Math.max(0, Number(record.lateMinutes || 0))} phút`,
    OUTSIDE_GEOFENCE: `Ngoài phạm vi${Number.isFinite(Number(record.distanceMeters)) ? ` · cách ${Math.round(Number(record.distanceMeters))}m` : ''}${Number.isFinite(Number(record.radiusMeters)) ? ` / bán kính ${Math.round(Number(record.radiusMeters))}m` : ''}`,
    MISSING_CHECK_IN: 'Quá giờ vào ca nhưng chưa chấm công',
    RETURNED_INSIDE: 'Đã quay lại phạm vi cửa hàng'
  }[violation])).filter(Boolean);
  const isRecovery = record.violations.includes('RETURNED_INSIDE');
  return [
    `<b>${isRecovery ? '✅' : '⚠️'} CHẤM CÔNG · ${escapeTelegramHtml(labels[record.action] || record.action)}</b>`,
    `👤 <b>${escapeTelegramHtml(record.staffName)}</b>`,
    `🏪 ${escapeTelegramHtml(record.branchName || record.branchId)}`,
    record.scheduledStart ? `🗓 Ca: <code>${escapeTelegramHtml(record.scheduledStart)}–${escapeTelegramHtml(record.scheduledEnd || '--:--')}</code>` : '',
    record.actualTime ? `🕐 Thực tế: <code>${escapeTelegramHtml(record.actualTime)}</code>` : '',
    ...violationLabels.map(label => `• ${escapeTelegramHtml(label)}`),
    isRecovery ? '<i>Trạng thái theo dõi đã trở lại bình thường.</i>' : '<b>Trạng thái: Cần quản lý kiểm tra</b>',
    `<code>${escapeTelegramHtml(record.attendanceId)}</code>`
  ].filter(Boolean).join('\n');
}

async function telegramRequest<T = any>(method: string, payload?: Record<string, unknown>, config = getTelegramConfig()): Promise<T> {
  if (!config.token) throw new Error('TELEGRAM_NOT_CONFIGURED');
  const response = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
    method: payload ? 'POST' : 'GET',
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(8_000)
  });
  const result: any = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    const errorCode = Number(result?.error_code || response.status || 500);
    throw new Error(`TELEGRAM_PROVIDER_${errorCode}`);
  }
  return result.result as T;
}

export async function sendTelegramMessage(text: string, options: { chatId?: string; replyToMessageId?: string | number; config?: TelegramConfig } = {}): Promise<any> {
  const config = options.config || getTelegramConfig();
  if (!telegramIsConfigured(config)) throw new Error('TELEGRAM_NOT_CONFIGURED');
  return telegramRequest('sendMessage', {
    chat_id: options.chatId || config.chatId,
    text: text.slice(0, 4000),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(options.replyToMessageId ? { reply_to_message_id: options.replyToMessageId } : {})
  }, config);
}

export async function getTelegramRuntimeStatus(db: Firestore | null = null): Promise<Record<string, unknown>> {
  const config = db ? await loadTelegramConfig(db, true) : getTelegramConfig();
  const adminConfiguration = publicTelegramConfiguration(config);
  if (!telegramIsConfigured(config)) {
    return { ...adminConfiguration, configured: false, connected: false, missing: [!config.token && 'TELEGRAM_BOT_TOKEN', !config.chatId && 'TELEGRAM_CHAT_ID', !config.webhookSecret && 'TELEGRAM_WEBHOOK_SECRET'].filter(Boolean) };
  }
  try {
    const [bot, webhook] = await Promise.all([telegramRequest<any>('getMe', undefined, config), telegramRequest<any>('getWebhookInfo', undefined, config)]);
    return {
      ...adminConfiguration,
      configured: true,
      connected: true,
      botUsername: bot?.username || '',
      webhookConfigured: Boolean(webhook?.url),
      pendingUpdateCount: Number(webhook?.pending_update_count || 0),
      lastWebhookErrorAt: webhook?.last_error_date ? new Date(Number(webhook.last_error_date) * 1000).toISOString() : null,
      lastWebhookErrorMessage: webhook?.last_error_message ? 'Telegram đang báo lỗi webhook. Xem log server để biết chi tiết.' : null,
      alertsEnabled: config.alertsEnabled,
      queriesEnabled: config.queriesEnabled,
      destinationFingerprint: crypto.createHash('sha256').update(config.chatId).digest('hex').slice(0, 10)
    };
  } catch (error: any) {
    return { ...adminConfiguration, configured: true, connected: false, errorCode: String(error?.message || 'TELEGRAM_STATUS_FAILED') };
  }
}

export async function registerTelegramWebhook(publicBaseUrl: string, configOverride?: TelegramConfig): Promise<{ url: string }> {
  const config = configOverride || getTelegramConfig();
  if (!telegramIsConfigured(config)) throw new Error('TELEGRAM_NOT_CONFIGURED');
  const baseUrl = String(publicBaseUrl || '').trim().replace(/\/$/, '');
  if (!/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(baseUrl)) throw new Error('TELEGRAM_PUBLIC_URL_INVALID');
  const url = `${baseUrl}/api/telegram/webhook`;
  await telegramRequest('setWebhook', {
    url,
    secret_token: config.webhookSecret,
    allowed_updates: ['message', 'edited_message'],
    drop_pending_updates: false
  }, config);
  return { url };
}

export async function unregisterTelegramWebhook(configOverride?: TelegramConfig): Promise<void> {
  const config = configOverride || getTelegramConfig();
  if (!config.token) return;
  await telegramRequest('deleteWebhook', { drop_pending_updates: true }, config);
}

export async function dispatchTelegramOutboxEvent(db: Firestore, eventId: string): Promise<{ sent: boolean; skipped?: boolean; errorCode?: string }> {
  const config = await loadTelegramConfig(db);
  if (!config.alertsEnabled || !telegramIsConfigured(config)) return { sent: false, skipped: true, errorCode: 'TELEGRAM_ALERTS_DISABLED_OR_NOT_CONFIGURED' };
  const ref = db.collection('telegramOutboxEvents').doc(eventId);
  let record: TelegramOutboxRecord | null = null;
  const claimed = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return false;
    const data = snapshot.data() as TelegramOutboxRecord;
    if (data.status === 'SENT' || data.status === 'SENDING' || Number(data.attempts || 0) >= 8) return false;
    record = data;
    transaction.update(ref, { status: 'SENDING', attempts: Number(data.attempts || 0) + 1, lastAttemptAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!claimed || !record) return { sent: false, skipped: true };
  try {
    const provider = await sendTelegramMessage(formatAttendanceAlert(record), { config });
    await ref.update({ status: 'SENT', sentAt: FieldValue.serverTimestamp(), providerMessageId: provider?.message_id || null, nextAttemptAt: null, lastErrorCode: null });
    return { sent: true };
  } catch (error: any) {
    const attempts = Number(record.attempts || 0) + 1;
    const errorCode = String(error?.message || 'TELEGRAM_SEND_FAILED').slice(0, 120);
    const backoffMinutes = Math.min(60, 2 ** Math.min(5, attempts));
    await ref.update({ status: 'FAILED', lastErrorCode: errorCode, nextAttemptAt: new Date(Date.now() + backoffMinutes * 60_000).toISOString() });
    return { sent: false, errorCode };
  }
}

export async function dispatchPendingTelegramOutbox(db: Firestore, limit = 25): Promise<{ processed: number; sent: number; failed: number }> {
  const snapshot = await db.collection('telegramOutboxEvents').where('status', 'in', ['PENDING', 'FAILED']).limit(Math.min(50, Math.max(1, limit))).get();
  const now = Date.now();
  const ids = snapshot.docs.filter(doc => {
    const nextAttemptAt = String(doc.data()?.nextAttemptAt || '');
    return !nextAttemptAt || Date.parse(nextAttemptAt) <= now;
  }).map(doc => doc.id);
  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    const result = await dispatchTelegramOutboxEvent(db, id);
    if (result.sent) sent += 1;
    else if (!result.skipped) failed += 1;
  }
  return { processed: ids.length, sent, failed };
}

function normalizeText(value: unknown): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9@/_\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseTelegramIntent(rawText: string): TelegramIntent {
  const original = String(rawText || '').trim();
  const normalized = normalizeText(original.replace(/@[A-Za-z0-9_]+/g, ' '));
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const rawCommand = tokens[0] || '';
  const command = rawCommand.split('@')[0];
  if (['/help', '/start', '/trogiup'].includes(command)) return { kind: 'HELP' };
  const imeiMatch = normalized.match(/(?:imei|may|sua chua)\s*[:#-]?\s*(\d{5,15})\b/) || (command === '/imei' || command === '/suachua' ? normalized.match(/\b(\d{5,15})\b/) : null);
  if (imeiMatch) return { kind: 'IMEI', imei: imeiMatch[1] };
  const all = /\b(all|toan he thong|tong he thong)\b/.test(normalized);
  const branchToken = tokens.slice(command.startsWith('/') ? 1 : 0).filter(token => !['homnay', 'hom', 'nay', 'tuan', 'thang', 'all'].includes(token)).join(' ') || undefined;
  if (['/report', '/baocao', '/doanhso'].includes(command) || /\b(doanh so|bao cao ban hang|ban duoc bao nhieu)\b/.test(normalized)) {
    const period = /\bthang\b/.test(normalized) ? 'MONTH' : /\btuan\b/.test(normalized) ? 'WEEK' : 'TODAY';
    return { kind: 'REVENUE', period, branchToken, all };
  }
  if (['/kythuat'].includes(command) || /\b(ky thuat|cho kcs|cho linh kien|tien do sua)\b/.test(normalized)) return { kind: 'TECHNICAL', branchToken, all };
  if (['/tonkho'].includes(command) || /\bton kho\b/.test(normalized)) return { kind: 'INVENTORY', branchToken, all };
  return { kind: 'UNKNOWN' };
}

async function activeBranches(db: Firestore): Promise<Array<Record<string, any>>> {
  const snapshot = await db.collection('branches').limit(200).get();
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...(doc.data() || {}) } as Record<string, any>))
    .filter(branch => branch.isActive !== false && branch.active !== false);
}

function branchAliases(branch: Record<string, any>): string[] {
  return [branch.id, branch.code, branch.name, branch.shortName].map(normalizeText).filter(value => value.length >= 2);
}

async function resolveTelegramBranch(db: Firestore, token: string | undefined): Promise<Record<string, any> | null> {
  if (!token) return null;
  const needle = normalizeText(token).replace(/^.*?\b(homnay|tuan|thang)\b/g, '').trim();
  if (!needle || ['all', 'toan he thong', 'tong he thong'].includes(needle)) return null;
  const branches = await activeBranches(db);
  return branches.find(branch => branchAliases(branch).some(alias => needle === alias || needle.includes(alias) || alias.includes(needle))) || null;
}

function periodDates(period: 'TODAY' | 'WEEK' | 'MONTH'): string[] {
  const today = getVietnamDateString();
  const base = new Date(`${today}T12:00:00+07:00`);
  let start = new Date(base);
  if (period === 'WEEK') {
    const day = base.getUTCDay();
    start = new Date(base.getTime() - (day === 0 ? 6 : day - 1) * 86_400_000);
  } else if (period === 'MONTH') {
    start = new Date(`${today.slice(0, 7)}-01T12:00:00+07:00`);
  }
  const dates: string[] = [];
  for (let cursor = start.getTime(); cursor <= base.getTime(); cursor += 86_400_000) dates.push(getVietnamDateString(cursor));
  return dates;
}

async function revenueReply(db: Firestore, intent: Extract<TelegramIntent, { kind: 'REVENUE' }>, senderId: string): Promise<string> {
  const config = getTelegramConfig();
  const owner = config.ownerUserIds.has(senderId);
  if (intent.all && !owner) return '⛔ Phạm vi <b>toàn hệ thống</b> chỉ dành cho chủ hệ thống đã được cấu hình.';
  const branch = intent.all ? null : await resolveTelegramBranch(db, intent.branchToken);
  if (!intent.all && !branch) return '🏪 Hãy ghi rõ chi nhánh. Ví dụ: <code>/doanhso homnay PH109</code>.';
  const scopeId = intent.all ? 'ALL' : String(branch!.id);
  const dates = periodDates(intent.period);
  const snapshots = await db.getAll(...dates.map(date => db.collection('executiveDailyAggregates').doc(`${date}_${scopeId}`)));
  const totals = snapshots.reduce((acc, snapshot) => {
    const data = snapshot.exists ? snapshot.data() || {} : {};
    acc.revenue += Number(data.revenue || 0);
    acc.invoices += Number(data.invoiceCount || 0);
    return acc;
  }, { revenue: 0, invoices: 0 });
  const periodLabel = intent.period === 'TODAY' ? 'hôm nay' : intent.period === 'WEEK' ? 'tuần này' : 'tháng này';
  return [`<b>💰 DOANH SỐ ${escapeTelegramHtml(periodLabel.toUpperCase())}</b>`, `🏪 ${escapeTelegramHtml(intent.all ? 'Toàn hệ thống' : branch!.name || branch!.code || branch!.id)}`, `• Doanh thu: <code>${formatVnd(totals.revenue)}</code>`, `• Hóa đơn: <b>${totals.invoices.toLocaleString('vi-VN')}</b>`, `<i>Dữ liệu đến ${escapeTelegramHtml(getVietnamDateString())}, giờ Việt Nam.</i>`].join('\n');
}

async function imeiReply(db: Firestore, imei: string): Promise<string> {
  try {
    const timeline = await getDeviceLifecycleTimeline(db, { imei }, { uid: 'TELEGRAM_GROUP', role: 'REGIONAL_MANAGER', assignedBranchIds: [] });
    const device = timeline.device || {};
    const summary = timeline.summary || {};
    const recent = Array.isArray(timeline.events) ? timeline.events.slice(0, 5) : [];
    return [
      `<b>📱 IMEI …${escapeTelegramHtml(String(imei).slice(-6))}</b>`,
      `• Máy: <b>${escapeTelegramHtml(device.model || 'Chưa xác định')}</b>`,
      `• Trạng thái: <b>${escapeTelegramHtml(summary.currentStatus || device.status || 'UNKNOWN')}</b>`,
      `• Chi nhánh: ${escapeTelegramHtml(device.branchName || device.branchId || 'Chưa xác định')}`,
      `• Vị trí: ${escapeTelegramHtml(summary.currentLocationName || 'Chưa xác định')}`,
      `• Người giữ: ${escapeTelegramHtml(summary.currentCustodianName || 'Chưa xác định')}`,
      summary.workOrderCount ? `• Phiếu kỹ thuật: <b>${Number(summary.workOrderCount)}</b> · Rework: ${Number(summary.reworkCount || 0)}` : '',
      recent.length ? '<b>Mốc gần nhất:</b>' : '',
      ...recent.map((event: any) => `• ${escapeTelegramHtml(String(event.occurredAt || '').slice(0, 16).replace('T', ' '))} · ${escapeTelegramHtml(event.title || event.eventType)}`)
    ].filter(Boolean).join('\n');
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code.includes('NOT_FOUND')) return `🔎 Không tìm thấy IMEI <code>${escapeTelegramHtml(imei)}</code> trong dữ liệu máy hoặc phiếu kỹ thuật.`;
    return '⚠️ Chưa thể tải lịch sử IMEI. Vui lòng thử lại sau.';
  }
}

async function technicalReply(db: Firestore, intent: Extract<TelegramIntent, { kind: 'TECHNICAL' }>, senderId: string): Promise<string> {
  const config = getTelegramConfig();
  const owner = config.ownerUserIds.has(senderId);
  if (intent.all && !owner) return '⛔ Phạm vi <b>toàn hệ thống</b> chỉ dành cho chủ hệ thống đã được cấu hình.';
  const branch = intent.all ? null : await resolveTelegramBranch(db, intent.branchToken);
  if (!intent.all && !branch) return '🏪 Hãy ghi rõ chi nhánh. Ví dụ: <code>/kythuat PH109</code>.';
  const activeLineStatuses = ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_PARTS', 'COMPLETED', 'REWORK_REQUIRED'];
  let lineQuery: FirebaseFirestore.Query = db.collection('technicalWorkOrderLines').where('status', 'in', activeLineStatuses);
  if (branch) lineQuery = lineQuery.where('branchId', '==', branch.id);
  const lineSnapshot = await lineQuery.limit(1000).get();
  const lines = lineSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
  const workOrderIds = [...new Set(lines.map(line => String(line.workOrderId || '')).filter(Boolean))].slice(0, 400);
  const workOrderSnapshots = workOrderIds.length
    ? await db.getAll(...workOrderIds.map(id => db.collection('technicalWorkOrders').doc(id)))
    : [];
  const workOrders = workOrderSnapshots
    .filter(snapshot => snapshot.exists)
    .map(snapshot => ({ id: snapshot.id, ...snapshot.data() } as any))
    .filter(item => !TERMINAL_WORK_ORDER_STATUSES.has(String(item.status || '')) && (!branch || String(item.branchId || '') === String(branch.id)));
  const linesByWorkOrder = new Map<string, any[]>();
  lines.forEach(line => linesByWorkOrder.set(String(line.workOrderId || ''), [...(linesByWorkOrder.get(String(line.workOrderId || '')) || []), line]));
  const stageCounts: Record<string, number> = {};
  workOrders.forEach(workOrder => {
    const stage = deriveTechnicalBoardStage(workOrder, linesByWorkOrder.get(workOrder.id) || []);
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  });
  return [
    '<b>🔧 TIẾN ĐỘ KỸ THUẬT</b>',
    `🏪 ${escapeTelegramHtml(intent.all ? 'Toàn hệ thống' : branch!.name || branch!.id)}`,
    `• Tổng đang mở: <b>${workOrders.length}</b>`,
    `• Chờ nhận: ${stageCounts.WAITING_ACCEPTANCE || 0}`,
    `• Đang xử lý: ${stageCounts.IN_PROGRESS || 0}`,
    `• Chờ linh kiện: ${stageCounts.WAITING_PARTS || 0}`,
    `• Chờ KCS: ${stageCounts.WAITING_QC || 0}`,
    `• Rework: ${stageCounts.REWORK || 0}`,
    `• Chờ trả máy: ${stageCounts.WAITING_DELIVERY || 0}`,
    lineSnapshot.size >= 1000 || workOrderIds.length >= 400 ? '<i>⚠️ Dữ liệu vượt giới hạn tức thời; mở webapp để xem báo cáo đầy đủ.</i>' : ''
  ].filter(Boolean).join('\n');
}

async function inventoryReply(db: Firestore, intent: Extract<TelegramIntent, { kind: 'INVENTORY' }>, senderId: string): Promise<string> {
  const config = getTelegramConfig();
  const owner = config.ownerUserIds.has(senderId);
  if (intent.all && !owner) return '⛔ Phạm vi <b>toàn hệ thống</b> chỉ dành cho chủ hệ thống đã được cấu hình.';
  const branch = intent.all ? null : await resolveTelegramBranch(db, intent.branchToken);
  if (!intent.all && !branch) return '🏪 Hãy ghi rõ chi nhánh. Ví dụ: <code>/tonkho PH109</code>.';
  let query: FirebaseFirestore.Query = db.collection('devices').where('status', '==', 'in_stock');
  if (branch) query = query.where('branchId', '==', branch.id);
  const snapshot = await query.limit(1000).get();
  const modelNeedle = normalizeText(intent.model || '');
  const devices = snapshot.docs.map(doc => doc.data()).filter(device => !modelNeedle || normalizeText(device.model).includes(modelNeedle));
  return ['<b>📦 TỒN KHO MÁY SẴN BÁN</b>', `🏪 ${escapeTelegramHtml(intent.all ? 'Toàn hệ thống' : branch!.name || branch!.id)}`, `• Số máy: <b>${devices.length}</b>`, snapshot.size >= 1000 ? '<i>⚠️ Kết quả nhanh đã chạm giới hạn; xem Ma trận tồn kho để có số đầy đủ.</i>' : ''].filter(Boolean).join('\n');
}

export function telegramHelpText(): string {
  return [
    '<b>🤖 PHONEHOUSE BOT</b>',
    '<code>/doanhso homnay PH109</code>',
    '<code>/doanhso tuan PH109</code>',
    '<code>/doanhso thang all</code> · chỉ chủ hệ thống',
    '<code>/imei 55555</code>',
    '<code>/kythuat PH109</code>',
    '<code>/tonkho PH109</code>',
    'Có thể hỏi: <i>“@Bot IMEI 12345 đang ở đâu?”</i>',
    '<i>Bot không trả giá vốn, quỹ, lương, mật mã hoặc dữ liệu khách hàng trong group.</i>'
  ].join('\n');
}

export async function answerTelegramQuery(db: Firestore, text: string, senderId: string): Promise<{ intent: string; reply: string }> {
  const intent = parseTelegramIntent(text);
  if (intent.kind === 'HELP') return { intent: intent.kind, reply: telegramHelpText() };
  if (intent.kind === 'REVENUE') return { intent: intent.kind, reply: await revenueReply(db, intent, senderId) };
  if (intent.kind === 'IMEI') return { intent: intent.kind, reply: await imeiReply(db, intent.imei) };
  if (intent.kind === 'TECHNICAL') return { intent: intent.kind, reply: await technicalReply(db, intent, senderId) };
  if (intent.kind === 'INVENTORY') return { intent: intent.kind, reply: await inventoryReply(db, intent, senderId) };
  return { intent: 'UNKNOWN', reply: telegramHelpText() };
}

export async function scanMissingAttendanceAlerts(db: Firestore): Promise<{ scanned: number; created: number; eventIds: string[] }> {
  if (!telegramAlertsEnabled()) return { scanned: 0, created: 0, eventIds: [] };
  const date = getVietnamDateString();
  const nowTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
  const nowMinutes = Number(nowTime.slice(0, 2)) * 60 + Number(nowTime.slice(3, 5));
  const [{ STANDARD_SHIFTS, getVietnamWeekStart }, { getWeekDates, resolveDepartment }] = await Promise.all([
    import('./attendanceService'),
    import('./shiftSchedulingService')
  ]);
  const weekStart = getVietnamWeekStart(date);
  const [usersSnapshot, schedulesSnapshot, policiesSnapshot, definitionsSnapshot, todayAttendanceSnapshot, openAttendanceSnapshot, branches] = await Promise.all([
    db.collection('users').where('active', '==', true).limit(500).get(),
    db.collection('weeklyShiftSchedules').where('weekStart', '==', weekStart).limit(600).get(),
    db.collection('shiftDepartmentPolicies').limit(300).get(),
    db.collection('shiftDefinitions').limit(300).get(),
    db.collection('attendance').where('date', '==', date).limit(1000).get(),
    db.collection('attendance').where('attendanceStatus', '==', 'CHECKED_IN').limit(1000).get(),
    activeBranches(db)
  ]);
  const scheduleByStaffBranch = new Map<string, Record<string, any>>();
  const scheduleByStaff = new Map<string, Record<string, any>>();
  schedulesSnapshot.docs.forEach(doc => {
    const schedule = doc.data() || {};
    if (schedule.status === 'DRAFT') return;
    scheduleByStaffBranch.set(`${String(schedule.staffId || '')}:${String(schedule.branchId || '')}`, schedule);
    if (schedule.days?.[date] && !scheduleByStaff.has(String(schedule.staffId || ''))) {
      scheduleByStaff.set(String(schedule.staffId || ''), schedule);
    }
  });
  const policiesById = new Map(policiesSnapshot.docs.map(doc => [doc.id, doc.data() || {}]));
  const definitionsById = new Map(definitionsSnapshot.docs.map(doc => [doc.id, doc.data() || {}]));
  const attendanceKey = (value: Record<string, any>) => `${String(value.staffId || '')}:${String(value.branchId || '')}`;
  const checkedInToday = new Set(todayAttendanceSnapshot.docs.filter(doc => Boolean(doc.data()?.checkInTime)).map(doc => attendanceKey(doc.data() || {})));
  const currentlyWorking = new Set(openAttendanceSnapshot.docs.map(doc => attendanceKey(doc.data() || {})));
  const branchById = new Map(branches.map(branch => [String(branch.id), branch]));
  const weekDayIndex = getWeekDates(weekStart).indexOf(date);
  let created = 0;
  const eventIds: string[] = [];
  for (const userDoc of usersSnapshot.docs) {
    const user = userDoc.data() || {};
    const homeBranchId = String(user.branchId || '').trim();
    const explicitSchedule = scheduleByStaffBranch.get(`${userDoc.id}:${homeBranchId}`) || scheduleByStaff.get(userDoc.id);
    const branchId = String(explicitSchedule?.branchId || homeBranchId).trim();
    if (!branchId) continue;
    const key = `${userDoc.id}:${branchId}`;
    if (currentlyWorking.has(key) || checkedInToday.has(key)) continue;
    let daySchedule = explicitSchedule?.days?.[date] || null;
    if (!daySchedule) {
      const department = resolveDepartment(user);
      const policyId = `POLICY_${branchId}_${department.departmentId.replace(/[^A-Z0-9_-]/g, '_')}`;
      const policy = policiesById.get(policyId);
      const workDayIndexes = Array.isArray(policy?.workDayIndexes) ? policy.workDayIndexes.map(Number) : [];
      if (policy?.active !== false && policy?.mode === 'FIXED' && policy?.defaultShiftId && workDayIndexes.includes(weekDayIndex)) {
        const definition = definitionsById.get(String(policy.defaultShiftId));
        if (definition && definition.active !== false && (!definition.branchId || definition.branchId === 'ALL' || definition.branchId === branchId)) {
          daySchedule = {
            shiftId: String(policy.defaultShiftId),
            shiftName: String(definition.name || 'Ca cố định'),
            startTime: String(definition.startTime || ''),
            endTime: String(definition.endTime || ''),
            breakMinutes: Number(definition.breakDurationMinutes ?? definition.breakMinutes ?? 0)
          };
        }
      }
    }
    const shiftId = String(daySchedule?.shiftId || '').trim();
    const shiftName = String(daySchedule?.shiftName || '').trim();
    if (!daySchedule || daySchedule.isOff || shiftId === 'OFF' || shiftName === 'Nghỉ') continue;
    const standard = STANDARD_SHIFTS[shiftId]
      || (shiftName === 'Ca sáng' ? STANDARD_SHIFTS.SHIFT_MORNING : shiftName === 'Ca chiều' ? STANDARD_SHIFTS.SHIFT_AFTERNOON : shiftName === 'Ca tối' ? STANDARD_SHIFTS.SHIFT_EVENING : null);
    const startTime = String(daySchedule.startTime || standard?.startTime || '');
    const endTime = String(daySchedule.endTime || standard?.endTime || '');
    const [hour, minute] = startTime.split(':').map(Number);
    const dueMinutes = hour * 60 + minute + 5;
    // The employee owns the full five-minute grace window. A shift beginning
    // at 08:00 must not be reported missing until 08:06.
    if (!Number.isFinite(dueMinutes) || nowMinutes <= dueMinutes) continue;
    const attendanceId = `ATT_${userDoc.id}_${date.replace(/-/g, '')}`;
    const eventId = attendanceTelegramOutboxId(attendanceId, 'MISSING_CHECK_IN');
    const eventRef = db.collection('telegramOutboxEvents').doc(eventId);
    const branch = branchById.get(branchId);
    if (!branch) continue;
    try {
      await eventRef.create(createAttendanceTelegramOutboxRecord({
        attendanceId, action: 'MISSING_CHECK_IN', staffId: userDoc.id,
        staffName: String(user.displayName || user.name || user.email || userDoc.id), branchId,
        branchName: String(branch.name || branch.code || branchId),
        scheduledStart: startTime, scheduledEnd: endTime, actualTime: nowTime,
        lateMinutes: Math.max(0, nowMinutes - (hour * 60 + minute)), violations: ['MISSING_CHECK_IN']
      }));
      created += 1;
      eventIds.push(eventId);
    } catch (error: any) {
      const duplicateCode = String(error?.code || error?.message || '').toLowerCase();
      if (!duplicateCode.includes('already') && Number(error?.code) !== 6) throw error;
    }
  }
  return { scanned: usersSnapshot.size, created, eventIds };
}

export async function processAttendanceLocationHeartbeat(
  db: Firestore,
  input: { branchId: string; latitude: number; longitude: number; accuracyMeters?: number },
  actor: { uid: string; name?: string }
): Promise<{ attendanceId: string; isInside: boolean; distanceMeters: number; radiusMeters: number; eventId?: string }> {
  if (!input.branchId) throw new Error('BRANCH_REQUIRED');
  if (![input.latitude, input.longitude].every(Number.isFinite)) throw new Error('LOCATION_COORDINATES_INVALID');
  const today = getVietnamDateString();
  let attendanceRef = db.collection('attendance').doc(`ATT_${actor.uid}_${today.replace(/-/g, '')}`);
  let attendanceSnap = await attendanceRef.get();
  if (!attendanceSnap.exists || String(attendanceSnap.data()?.attendanceStatus || '') !== 'CHECKED_IN') {
    const open = await db.collection('attendance')
      .where('staffId', '==', actor.uid)
      .where('branchId', '==', input.branchId)
      .where('attendanceStatus', '==', 'CHECKED_IN')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (open.empty) throw new Error('ATTENDANCE_NOT_OPEN');
    attendanceRef = open.docs[0].ref;
    attendanceSnap = open.docs[0];
  }
  const attendance = attendanceSnap.data() || {};
  if (String(attendance.branchId || '') !== input.branchId) throw new Error('ATTENDANCE_BRANCH_MISMATCH');
  const branchRef = db.collection('branches').doc(input.branchId);
  const branchSnap = await branchRef.get();
  if (!branchSnap.exists) throw new Error('BRANCH_NOT_FOUND');
  const branch = branchSnap.data() || {};
  if (typeof branch.gpsLatitude !== 'number' || typeof branch.gpsLongitude !== 'number') throw new Error('BRANCH_GPS_NOT_CONFIGURED');
  const radiusMeters = Number(branch.attendanceRadius || branch.allowedGpsRadiusMeters || 50);
  const geo = verifyGeofence({ latitude: input.latitude, longitude: input.longitude }, { latitude: branch.gpsLatitude, longitude: branch.gpsLongitude }, radiusMeters);
  const stateRef = db.collection('attendanceLocationState').doc(attendanceRef.id);
  let createdEventId: string | undefined;
  await db.runTransaction(async transaction => {
    const stateSnap = await transaction.get(stateRef);
    const state = stateSnap.exists ? stateSnap.data() || {} : {};
    const previousOutsideCount = Number(state.consecutiveOutsideCount || 0);
    const previousExcursion = Number(state.excursionSequence || 0);
    const wasOutside = state.outsideAlertActive === true;
    if (geo.isInside) {
      if (wasOutside && telegramAlertsEnabled()) {
        const eventId = attendanceTelegramOutboxId(attendanceRef.id, 'SHIFT_LOCATION', `RETURN:${previousExcursion}`);
        transaction.set(db.collection('telegramOutboxEvents').doc(eventId), createAttendanceTelegramOutboxRecord({
          attendanceId: attendanceRef.id, action: 'SHIFT_LOCATION', staffId: actor.uid,
          staffName: String(attendance.staffName || actor.name || actor.uid), branchId: input.branchId,
          branchName: String(attendance.branchName || branch.name || branch.code || input.branchId),
          scheduledStart: attendance.scheduledStart, scheduledEnd: attendance.scheduledEnd,
          actualTime: new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
          distanceMeters: geo.distanceMeters, radiusMeters, violations: ['RETURNED_INSIDE']
        }), { merge: false });
        createdEventId = eventId;
      }
      transaction.set(stateRef, {
        attendanceId: attendanceRef.id, staffId: actor.uid, branchId: input.branchId,
        isInside: true, consecutiveOutsideCount: 0, outsideAlertActive: false,
        excursionSequence: previousExcursion, distanceMeters: geo.distanceMeters,
        accuracyMeters: Number.isFinite(Number(input.accuracyMeters)) ? Number(input.accuracyMeters) : null,
        lastLatitude: input.latitude, lastLongitude: input.longitude,
        lastSeenAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return;
    }
    const outsideCount = previousOutsideCount + 1;
    const excursionSequence = wasOutside ? previousExcursion : Math.max(1, previousExcursion + 1);
    if (!wasOutside && outsideCount >= 2 && telegramAlertsEnabled()) {
      const eventId = attendanceTelegramOutboxId(attendanceRef.id, 'SHIFT_LOCATION', `OUT:${excursionSequence}`);
      transaction.set(db.collection('telegramOutboxEvents').doc(eventId), createAttendanceTelegramOutboxRecord({
        attendanceId: attendanceRef.id, action: 'SHIFT_LOCATION', staffId: actor.uid,
        staffName: String(attendance.staffName || actor.name || actor.uid), branchId: input.branchId,
        branchName: String(attendance.branchName || branch.name || branch.code || input.branchId),
        scheduledStart: attendance.scheduledStart, scheduledEnd: attendance.scheduledEnd,
        actualTime: new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
        distanceMeters: geo.distanceMeters, radiusMeters, violations: ['OUTSIDE_GEOFENCE']
      }), { merge: false });
      createdEventId = eventId;
    }
    transaction.set(stateRef, {
      attendanceId: attendanceRef.id, staffId: actor.uid, branchId: input.branchId,
      isInside: false, consecutiveOutsideCount: outsideCount,
      outsideAlertActive: wasOutside || outsideCount >= 2,
      excursionSequence, distanceMeters: geo.distanceMeters,
      accuracyMeters: Number.isFinite(Number(input.accuracyMeters)) ? Number(input.accuracyMeters) : null,
      lastLatitude: input.latitude, lastLongitude: input.longitude,
      lastSeenAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });
  return { attendanceId: attendanceRef.id, isInside: geo.isInside, distanceMeters: geo.distanceMeters, radiusMeters, ...(createdEventId ? { eventId: createdEventId } : {}) };
}
