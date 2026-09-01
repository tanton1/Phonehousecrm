import crypto from 'crypto';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { getVietnamDateString, getVietnamDayUtcRange } from '../../shared/vietnamTime';
import { getDeviceLifecycleTimeline } from './deviceLifecycleService';
import { deriveTechnicalBoardStage } from './technicalService';
import { verifyGeofence } from './geofenceService';
import { decryptChannelSecret, encryptChannelSecret } from './channelConnectionService';
import {
  consumeTelegramLinkCode,
  resolveTelegramPrincipal,
  TelegramPrincipal,
  telegramPrincipalCanAccessBranch
} from './telegramAuthorityService';
import {
  processTelegramAiCopilot,
  toolGetRevenueReport,
  toolLookupImei,
  toolGetTechnicalProgress,
  toolGetRetailRepairQueue,
  toolGetCrmPipeline,
  toolGetCrmWorkQueue,
  toolLookupCustomer,
  toolGetCashflowSummary,
  toolGetAttendanceToday,
  toolCheckInventory,
  findBranchMatch,
  getBranchAcceptedAliases,
  fetchActiveBranches
} from './telegramAiAssistant';
import { expandVietnameseBusinessShorthand } from './businessSpeech';

type TelegramAction = 'CHECK_IN' | 'CHECK_OUT' | 'MISSING_CHECK_IN' | 'SHIFT_LOCATION';

export interface TelegramConfig {
  token: string;
  chatId: string;
  webhookSecret: string;
  ownerUserIds: Set<string>;
  alertsEnabled: boolean;
  queriesEnabled: boolean;
  geminiApiKey?: string;
  geminiBaseUrl?: string;
  aiModel?: string;
  source?: 'ENVIRONMENT' | 'DATABASE';
}

export interface TelegramAdminConfiguration {
  source: 'ENVIRONMENT' | 'DATABASE';
  hasBotToken: boolean;
  hasWebhookSecret: boolean;
  hasGeminiApiKey: boolean;
  geminiBaseUrl?: string;
  aiModel?: string;
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
  geminiApiKey?: unknown;
  geminiBaseUrl?: unknown;
  aiModel?: unknown;
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

interface TelegramOutboxBase {
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

export interface AttendanceTelegramOutboxRecord extends AttendanceTelegramAlertInput, TelegramOutboxBase {
  eventType: 'ATTENDANCE_EXCEPTION';
}

export interface CrmDailyDigestItem {
  taskId: string;
  title: string;
  assignedStaffName: string;
  branchName: string;
  dueAt: string;
  overdue: boolean;
}

export interface CrmDailyDigestTelegramOutboxRecord extends TelegramOutboxBase {
  eventType: 'CRM_DAILY_DIGEST';
  reportDate: string;
  overdueCount: number;
  dueTodayCount: number;
  activeTaskCount: number;
  coverageComplete: boolean;
  items: CrmDailyDigestItem[];
}

export interface QuickQuoteUnassignedTelegramOutboxRecord extends TelegramOutboxBase {
  eventType: 'QUICK_QUOTE_UNASSIGNED';
  requestId: string;
  requestCode: string;
  branchId: string;
  branchName: string;
  quoteType: 'DEVICE' | 'REPAIR' | 'ACCESSORY';
  customerName: string;
  estimatedTotal: number;
  responseDueAt: string;
}

export type TelegramOutboxRecord = AttendanceTelegramOutboxRecord | CrmDailyDigestTelegramOutboxRecord | QuickQuoteUnassignedTelegramOutboxRecord;

type TelegramIntent =
  | { kind: 'HELP' }
  | { kind: 'MENU' }
  | { kind: 'LINK'; code: string }
  | { kind: 'BRANCHES' }
  | { kind: 'BRANCH_CONFIRM'; branchToken: string }
  | {
      kind: 'REVENUE';
      period: 'TODAY' | 'YESTERDAY' | 'WEEK' | 'LAST_WEEK' | 'MONTH' | 'LAST_MONTH' | 'CUSTOM';
      date?: string;
      startDate?: string;
      endDate?: string;
      branchToken?: string;
      all: boolean;
    }
  | { kind: 'IMEI'; imei: string }
  | { kind: 'TECHNICAL'; branchToken?: string; all: boolean }
  | { kind: 'INVENTORY'; branchToken?: string; all: boolean; model?: string; includeImeis?: boolean }
  | {
      kind: 'RETAIL_REPAIRS';
      repairType: 'ALL' | 'WARRANTY' | 'CUSTOMER_SERVICE';
      branchToken?: string;
      all: boolean;
      includeImeis?: boolean;
      period?: 'TODAY' | 'YESTERDAY' | 'WEEK' | 'LAST_WEEK' | 'MONTH' | 'LAST_MONTH' | 'CUSTOM';
      date?: string;
    }
  | { kind: 'CUSTOMER'; query: string }
  | { kind: 'CRM_PIPELINE'; branchToken?: string; all: boolean; period: TelegramCommandScope['period']; date?: string }
  | { kind: 'CRM_WORK_QUEUE'; branchToken?: string; all: boolean }
  | { kind: 'CASHBOOK'; period?: 'TODAY' | 'YESTERDAY' | 'MONTH' | 'LAST_MONTH'; branchToken?: string; all?: boolean }
  | { kind: 'ATTENDANCE'; branchToken?: string; all: boolean; date?: string }
  | { kind: 'AI'; query: string }
  | { kind: 'UNKNOWN'; raw: string };

const TERMINAL_WORK_ORDER_STATUSES = new Set(['DELIVERED_TO_CUSTOMER', 'RETURNED_TO_STOCK', 'RETURNED_TO_BRANCH', 'CANCELLED']);
const TELEGRAM_CONFIGURATION_COLLECTION = 'telegramConfigurations';
const TELEGRAM_CONFIGURATION_DOCUMENT = 'primary';
const TELEGRAM_USER_PREFERENCES_COLLECTION = 'telegramUserPreferences';
const TELEGRAM_CONVERSATION_CONTEXT_COLLECTION = 'telegramConversationContexts';
const TELEGRAM_CONFIGURATION_CACHE_MS = 60_000;
const TELEGRAM_CONVERSATION_CONTEXT_MS = 30 * 60_000;
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
    geminiApiKey: String(process.env.GEMINI_API_KEY || '').trim(),
    geminiBaseUrl: String(process.env.GEMINI_BASE_URL || '').trim(),
    aiModel: String(process.env.GEMINI_MODEL || 'gemini-3.7-flash').trim(),
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

export type TelegramUserBranchPreference = {
  branchId: string;
  branchCode: string;
  branchName: string;
};

export function telegramUserPreferenceId(senderId: string): string {
  return crypto.createHash('sha256').update(`telegram-preference:${String(senderId || '')}`).digest('hex');
}

function telegramConversationContextId(senderId: string): string {
  return crypto.createHash('sha256').update(`telegram-context:${String(senderId || '')}`).digest('hex');
}

export function isTelegramContextFollowUp(rawText: string): boolean {
  const normalized = expandVietnameseBusinessShorthand(rawText);
  if (!normalized || normalized.startsWith('/')) return false;
  if (/\b(doanh so|doanh thu|ton kho|ky thuat|kcs|crm|khach hang|cham cong|diem danh|so quy|bao hanh|sua le|imei)\b/.test(normalized)) return false;
  return /^(?:con|the|vay|roi|uh|ok|xem)?\s*(?:hom nay|hom qua|tuan nay|tuan truoc|thang nay|thang truoc|chi tiet|danh sach|imei|chi nhanh|cn|ph|\d{1,3})\b/.test(normalized)
    || /^(?:con|the|vay)\s+.+(?:thi sao|sao|khong)$/.test(normalized);
}

export async function contextualizeTelegramQuery(
  db: Firestore,
  senderId: string,
  rawText: string
): Promise<{ query: string; usedContext: boolean }> {
  const query = String(rawText || '').trim().slice(0, 1_000);
  if (!isTelegramContextFollowUp(query)) return { query, usedContext: false };
  try {
    const snapshot = await db.collection(TELEGRAM_CONVERSATION_CONTEXT_COLLECTION).doc(telegramConversationContextId(senderId)).get();
    const context = snapshot.exists ? snapshot.data() : null;
    const updatedAtMs = Date.parse(String(context?.updatedAtIso || ''));
    if (!context?.query || !Number.isFinite(updatedAtMs) || Date.now() - updatedAtMs > TELEGRAM_CONVERSATION_CONTEXT_MS) {
      return { query, usedContext: false };
    }
    return {
      query: `${String(context.query).slice(0, 700)}. Yêu cầu tiếp theo: ${query}`.slice(0, 1_000),
      usedContext: true
    };
  } catch {
    return { query, usedContext: false };
  }
}

export async function rememberTelegramConversation(
  db: Firestore,
  senderId: string,
  query: string,
  intent: string
): Promise<void> {
  // Do not retain free-form, customer or IMEI queries as conversation context.
  if (!['REVENUE', 'INVENTORY', 'TECHNICAL', 'RETAIL_REPAIRS', 'CRM_PIPELINE', 'CRM_WORK_QUEUE', 'CASHBOOK', 'ATTENDANCE'].includes(intent)) return;
  const safeQuery = String(query || '').trim().replace(/(?:\+?\d[\d\s().-]{5,}\d)/g, match => {
    return match.replace(/\D/g, '').length >= 10 ? '[dữ liệu nhạy cảm]' : match;
  }).slice(0, 1_000);
  try {
    await db.collection(TELEGRAM_CONVERSATION_CONTEXT_COLLECTION).doc(telegramConversationContextId(senderId)).set({
      query: safeQuery,
      intent,
      updatedAtIso: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } catch {
    // Context improves convenience but must never make the primary bot query fail.
  }
}

export async function loadTelegramUserBranchPreference(
  db: Firestore,
  senderId: string
): Promise<TelegramUserBranchPreference | null> {
  if (!senderId) return null;
  const snapshot = await db.collection(TELEGRAM_USER_PREFERENCES_COLLECTION).doc(telegramUserPreferenceId(senderId)).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  const branchId = String(data.branchId || '').trim();
  if (!branchId) return null;
  return {
    branchId,
    branchCode: String(data.branchCode || branchId).trim(),
    branchName: String(data.branchName || data.branchCode || branchId).trim()
  };
}

async function saveTelegramUserBranchPreference(
  db: Firestore,
  senderId: string,
  branch: { id: string; code?: string; name?: string }
): Promise<TelegramUserBranchPreference> {
  const preference: TelegramUserBranchPreference = {
    branchId: String(branch.id),
    branchCode: String(branch.code || branch.id),
    branchName: String(branch.name || branch.code || branch.id)
  };
  await db.collection(TELEGRAM_USER_PREFERENCES_COLLECTION).doc(telegramUserPreferenceId(senderId)).set({
    ...preference,
    senderFingerprint: telegramUserPreferenceId(senderId).slice(0, 14),
    updatedAt: FieldValue.serverTimestamp(),
    updatedAtIso: new Date().toISOString()
  }, { merge: true });
  return preference;
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
    hasGeminiApiKey: Boolean(config.geminiApiKey || process.env.GEMINI_API_KEY),
    geminiBaseUrl: config.geminiBaseUrl || '',
    aiModel: config.aiModel || 'gemini-3.7-flash',
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
      geminiApiKey: data.encryptedGeminiApiKey ? decryptChannelSecret(data.encryptedGeminiApiKey) : environment.geminiApiKey,
      geminiBaseUrl: String(data.geminiBaseUrl || environment.geminiBaseUrl || '').trim(),
      aiModel: String(data.aiModel || environment.aiModel || 'gemini-3.7-flash').trim(),
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

  const suppliedGeminiKey = String(input.geminiApiKey || '').trim();
  const geminiApiKey = suppliedGeminiKey || (current.encryptedGeminiApiKey ? decryptChannelSecret(current.encryptedGeminiApiKey) : '') || environment.geminiApiKey;
  const geminiBaseUrl = String(input.geminiBaseUrl !== undefined ? input.geminiBaseUrl : (current.geminiBaseUrl || environment.geminiBaseUrl || '')).trim();
  const aiModel = String(input.aiModel || current.aiModel || environment.aiModel || 'gemini-3.7-flash').trim();

  if (!/^\d{6,20}:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('TELEGRAM_BOT_TOKEN_INVALID');
  if (!/^-\d{5,25}$/.test(chatId)) throw new Error('TELEGRAM_GROUP_CHAT_ID_INVALID');
  if (ownerUserIds.some(id => !/^\d{3,25}$/.test(id))) throw new Error('TELEGRAM_OWNER_USER_ID_INVALID');
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(webhookSecret)) throw new Error('TELEGRAM_WEBHOOK_SECRET_INVALID');
  const candidate: TelegramConfig = {
    token, chatId, webhookSecret, geminiApiKey, geminiBaseUrl, aiModel, ownerUserIds: new Set(ownerUserIds), alertsEnabled, queriesEnabled, source: 'DATABASE'
  };
  const [bot, chat] = await Promise.all([
    telegramRequest<any>('getMe', undefined, candidate),
    telegramRequest<any>('getChat', { chat_id: chatId }, candidate)
  ]);
  if (!['group', 'supergroup'].includes(String(chat?.type || ''))) throw new Error('TELEGRAM_GROUP_CHAT_REQUIRED');
  await ref.set({
    encryptedBotToken: encryptChannelSecret(token),
    encryptedWebhookSecret: encryptChannelSecret(webhookSecret),
    ...(geminiApiKey ? { encryptedGeminiApiKey: encryptChannelSecret(geminiApiKey) } : {}),
    geminiBaseUrl,
    aiModel,
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

export function createAttendanceTelegramOutboxRecord(input: AttendanceTelegramAlertInput): AttendanceTelegramOutboxRecord {
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
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as unknown as AttendanceTelegramOutboxRecord;
}

export function crmDailyDigestOutboxId(reportDate: string): string {
  return crypto.createHash('sha256').update(`CRM_DAILY_DIGEST:${reportDate}`).digest('hex');
}

export function createCrmDailyDigestTelegramOutboxRecord(input: {
  reportDate: string;
  overdueCount: number;
  dueTodayCount: number;
  activeTaskCount: number;
  coverageComplete: boolean;
  items: CrmDailyDigestItem[];
}): CrmDailyDigestTelegramOutboxRecord {
  return {
    eventType: 'CRM_DAILY_DIGEST',
    reportDate: input.reportDate,
    overdueCount: Math.max(0, Math.trunc(Number(input.overdueCount || 0))),
    dueTodayCount: Math.max(0, Math.trunc(Number(input.dueTodayCount || 0))),
    activeTaskCount: Math.max(0, Math.trunc(Number(input.activeTaskCount || 0))),
    coverageComplete: input.coverageComplete,
    items: input.items.slice(0, 12).map(item => ({
      taskId: String(item.taskId || '').slice(0, 120),
      title: String(item.title || 'Công việc CRM').trim().slice(0, 160),
      assignedStaffName: String(item.assignedStaffName || 'Chưa phân công').trim().slice(0, 120),
      branchName: String(item.branchName || 'Chi nhánh').trim().slice(0, 120),
      dueAt: String(item.dueAt || '').slice(0, 40),
      overdue: item.overdue === true
    })),
    status: 'PENDING',
    attempts: 0,
    destination: 'PRIMARY_GROUP',
    createdAt: FieldValue.serverTimestamp(),
    createdAtIso: new Date().toISOString(),
    nextAttemptAt: null,
    lastErrorCode: null
  };
}

export function quickQuoteUnassignedOutboxId(requestId: string): string {
  return crypto.createHash('sha256').update(`QUICK_QUOTE_UNASSIGNED:${requestId}`).digest('hex');
}

export function createQuickQuoteUnassignedTelegramOutboxRecord(input: {
  requestId: string;
  requestCode: string;
  branchId: string;
  branchName: string;
  quoteType: 'DEVICE' | 'REPAIR' | 'ACCESSORY';
  customerName: string;
  estimatedTotal: number;
  responseDueAt: string;
}): QuickQuoteUnassignedTelegramOutboxRecord {
  return {
    eventType: 'QUICK_QUOTE_UNASSIGNED',
    requestId: String(input.requestId || '').slice(0, 160),
    requestCode: String(input.requestCode || '').slice(0, 40),
    branchId: String(input.branchId || '').slice(0, 120),
    branchName: String(input.branchName || input.branchId || 'Chi nhánh').slice(0, 160),
    quoteType: input.quoteType,
    customerName: String(input.customerName || 'Khách hàng').slice(0, 160),
    estimatedTotal: Math.max(0, Math.round(Number(input.estimatedTotal || 0))),
    responseDueAt: String(input.responseDueAt || '').slice(0, 50),
    status: 'PENDING',
    attempts: 0,
    destination: 'PRIMARY_GROUP',
    createdAt: FieldValue.serverTimestamp(),
    createdAtIso: new Date().toISOString(),
    nextAttemptAt: null,
    lastErrorCode: null
  };
}

export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatVnd(value: unknown): string {
  const amount = Number(value || 0);
  return `${(Number.isFinite(amount) ? Math.round(amount) : 0).toLocaleString('vi-VN')} đ`;
}

function formatAttendanceAlert(record: AttendanceTelegramOutboxRecord): string {
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

export async function sendTelegramMessage(
  text: string,
  options: {
    chatId?: string;
    replyToMessageId?: string | number;
    replyMarkup?: Record<string, unknown>;
    config?: TelegramConfig;
  } = {}
): Promise<any> {
  const config = options.config || getTelegramConfig();
  if (!telegramIsConfigured(config)) throw new Error('TELEGRAM_NOT_CONFIGURED');
  return telegramRequest('sendMessage', {
    chat_id: options.chatId || config.chatId,
    text: text.slice(0, 4000),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(options.replyToMessageId ? { reply_to_message_id: options.replyToMessageId } : {}),
    ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {})
  }, config);
}

export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  text?: string,
  config?: TelegramConfig
): Promise<any> {
  const conf = config || getTelegramConfig();
  if (!telegramIsConfigured(conf)) return;
  return telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text: text.slice(0, 180) } : {})
  }, conf).catch(() => null);
}

export async function editTelegramMessageText(
  text: string,
  options: {
    chatId: string;
    messageId: number | string;
    replyMarkup?: Record<string, unknown>;
    config?: TelegramConfig;
  }
): Promise<any> {
  const config = options.config || getTelegramConfig();
  if (!telegramIsConfigured(config)) throw new Error('TELEGRAM_NOT_CONFIGURED');
  return telegramRequest('editMessageText', {
    chat_id: options.chatId,
    message_id: options.messageId,
    text: text.slice(0, 4000),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {})
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
      allowedUpdates: webhook?.allowed_updates || [],
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
    allowed_updates: ['message', 'edited_message', 'callback_query'],
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
    const provider = await sendTelegramMessage(formatTelegramOutboxAlert(record), { config });
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

function telegramVoiceMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.webm')) return 'audio/webm';
  return 'audio/ogg';
}

export async function downloadTelegramVoice(
  fileId: string,
  declaredSize: number,
  config = getTelegramConfig()
): Promise<{ bytes: Buffer; mimeType: string }> {
  const maxBytes = 5 * 1024 * 1024;
  if (!fileId) throw new Error('TELEGRAM_VOICE_FILE_REQUIRED');
  if (declaredSize > maxBytes) throw new Error('TELEGRAM_VOICE_TOO_LARGE');
  const file = await telegramRequest<{ file_path?: string; file_size?: number }>('getFile', { file_id: fileId }, config);
  const filePath = String(file?.file_path || '');
  if (!filePath || filePath.includes('..') || filePath.startsWith('/')) throw new Error('TELEGRAM_VOICE_FILE_INVALID');
  if (Number(file?.file_size || declaredSize || 0) > maxBytes) throw new Error('TELEGRAM_VOICE_TOO_LARGE');
  const response = await fetch(`https://api.telegram.org/file/bot${config.token}/${filePath}`, {
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`TELEGRAM_VOICE_DOWNLOAD_${response.status}`);
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > maxBytes) throw new Error('TELEGRAM_VOICE_TOO_LARGE');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error('TELEGRAM_VOICE_EMPTY');
  if (bytes.length > maxBytes) throw new Error('TELEGRAM_VOICE_TOO_LARGE');
  return { bytes, mimeType: telegramVoiceMimeType(filePath) };
}

export async function sendTelegramChatAction(chatId: string, config = getTelegramConfig()): Promise<void> {
  await telegramRequest('sendChatAction', { chat_id: chatId, action: 'typing' }, config).catch(() => null);
}

function firestoreDateIso(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : '';
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : '';
  }
  const seconds = Number(value?.seconds ?? value?._seconds);
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : '';
}

export async function scanCrmDailyDigestAlerts(
  db: Firestore,
  nowInput: Date | string | number = new Date()
): Promise<{
  scanned: number;
  created: number;
  eventId?: string;
  overdueCount: number;
  dueTodayCount: number;
  coverageComplete: boolean;
}> {
  const now = nowInput instanceof Date ? new Date(nowInput.getTime()) : new Date(nowInput);
  if (!Number.isFinite(now.getTime())) throw new Error('CRM_DIGEST_TIME_INVALID');
  const reportDate = getVietnamDateString(now);
  const { startUtc, endUtc } = getVietnamDayUtcRange(reportDate);
  const startMs = Date.parse(startUtc);
  const endMs = Date.parse(endUtc);
  const nowMs = now.getTime();
  const taskLimit = 5000;
  const [taskSnapshot, branchSnapshot] = await Promise.all([
    db.collection('crmTasks').where('status', 'in', ['PENDING', 'IN_PROGRESS']).limit(taskLimit).get(),
    db.collection('branches').limit(500).get()
  ]);
  const branchNames = new Map(branchSnapshot.docs.map(document => {
    const branch = document.data() || {};
    return [document.id, String(branch.name || branch.code || document.id)] as const;
  }));
  const activeTasks = taskSnapshot.docs.map(document => {
    const task = document.data() || {};
    const dueAt = firestoreDateIso(task.dueAt || task.nextActionAt || task.followUpDate);
    const dueMs = dueAt ? Date.parse(dueAt) : Number.NaN;
    return { id: document.id, task, dueAt, dueMs };
  });
  const overdue = activeTasks.filter(item => Number.isFinite(item.dueMs) && item.dueMs < nowMs);
  const dueToday = activeTasks.filter(item => Number.isFinite(item.dueMs) && item.dueMs >= nowMs && item.dueMs >= startMs && item.dueMs <= endMs);
  const priorityItems = [...overdue, ...dueToday]
    .sort((left, right) => left.dueMs - right.dueMs)
    .slice(0, 12)
    .map(item => ({
      taskId: item.id,
      title: String(item.task.title || item.task.taskType || item.task.type || 'Chăm sóc khách hàng'),
      assignedStaffName: String(item.task.assignedStaffName || item.task.assignedToName || item.task.assignedStaffId || 'Chưa phân công'),
      branchName: branchNames.get(String(item.task.branchId || '')) || String(item.task.branchName || item.task.branchId || 'Chi nhánh'),
      dueAt: item.dueAt,
      overdue: item.dueMs < nowMs
    }));
  const coverageComplete = taskSnapshot.size < taskLimit;
  if (!overdue.length && !dueToday.length) {
    return { scanned: taskSnapshot.size, created: 0, overdueCount: 0, dueTodayCount: 0, coverageComplete };
  }
  const eventId = crmDailyDigestOutboxId(reportDate);
  try {
    await db.collection('telegramOutboxEvents').doc(eventId).create(createCrmDailyDigestTelegramOutboxRecord({
      reportDate,
      overdueCount: overdue.length,
      dueTodayCount: dueToday.length,
      activeTaskCount: activeTasks.length,
      coverageComplete,
      items: priorityItems
    }));
    return { scanned: taskSnapshot.size, created: 1, eventId, overdueCount: overdue.length, dueTodayCount: dueToday.length, coverageComplete };
  } catch (error: any) {
    const duplicateCode = String(error?.code || error?.message || '').toLowerCase();
    if (!duplicateCode.includes('already') && Number(error?.code) !== 6) throw error;
    return { scanned: taskSnapshot.size, created: 0, eventId, overdueCount: overdue.length, dueTodayCount: dueToday.length, coverageComplete };
  }
}

function normalizeText(value: unknown): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9@/_\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatCrmDailyDigestAlert(record: CrmDailyDigestTelegramOutboxRecord): string {
  return [
    `<b>📋 CRM CẦN XỬ LÝ · ${escapeTelegramHtml(record.reportDate)}</b>`,
    `• Công việc đang mở: <b>${record.activeTaskCount}</b>`,
    `• 🔴 Quá hạn: <b>${record.overdueCount}</b>`,
    `• 🟡 Đến hạn hôm nay: <b>${record.dueTodayCount}</b>`,
    '',
    ...record.items.map((item, index) => {
      const dueTimestamp = Date.parse(item.dueAt);
      const dueTime = Number.isFinite(dueTimestamp)
        ? new Date(dueTimestamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
        : 'chưa đặt';
      return `${index + 1}. ${item.overdue ? '🔴' : '🟡'} <b>${escapeTelegramHtml(item.title)}</b>\n   ${escapeTelegramHtml(item.assignedStaffName)} · ${escapeTelegramHtml(item.branchName)} · hạn ${escapeTelegramHtml(dueTime)}`;
    }),
    record.items.length === 0 ? '<i>Không có task CRM đến hạn cần nhắc.</i>' : '',
    record.coverageComplete ? '' : '<i>⚠️ Dữ liệu đã chạm giới hạn quét; quản lý nên mở báo cáo CRM để xem đầy đủ.</i>',
    '<i>Dùng /vieccrm MÃ_CHI_NHÁNH để xem hàng đợi chi tiết.</i>'
  ].filter(Boolean).join('\n');
}

function formatQuickQuoteUnassignedAlert(record: QuickQuoteUnassignedTelegramOutboxRecord): string {
  const dueTimestamp = Date.parse(record.responseDueAt);
  const dueTime = Number.isFinite(dueTimestamp)
    ? new Date(dueTimestamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : 'chưa đặt';
  return [
    `<b>🚨 BÁO GIÁ MINIWEB CHƯA CÓ SALE</b>`,
    `• Mã: <b>${escapeTelegramHtml(record.requestCode)}</b>`,
    `• Chi nhánh: <b>${escapeTelegramHtml(record.branchName)}</b>`,
    `• Khách: ${escapeTelegramHtml(record.customerName)}`,
    `• Loại: ${escapeTelegramHtml(record.quoteType)} · tạm tính <b>${escapeTelegramHtml(formatVnd(record.estimatedTotal))}</b>`,
    `• Hạn phản hồi: <b>${escapeTelegramHtml(dueTime)}</b>`,
    '',
    '<i>Quản lý vui lòng mở CRM → Báo giá miniweb để nhận và phân công yêu cầu.</i>'
  ].join('\n');
}

function formatTelegramOutboxAlert(record: TelegramOutboxRecord): string {
  if (record.eventType === 'CRM_DAILY_DIGEST') return formatCrmDailyDigestAlert(record);
  if (record.eventType === 'QUICK_QUOTE_UNASSIGNED') return formatQuickQuoteUnassignedAlert(record);
  return formatAttendanceAlert(record);
}

export function isTelegramSafeBranchShortcut(rawText: string): boolean {
  const normalized = normalizeText(rawText);
  return /^(cn|ph)\s*[-_]?\s*0*\d+$/.test(normalized)
    || /^(danh sach |cac |ma )?chi nhanh$/.test(normalized);
}

type TelegramCommandScope = {
  period: 'TODAY' | 'YESTERDAY' | 'WEEK' | 'LAST_WEEK' | 'MONTH' | 'LAST_MONTH' | 'CUSTOM';
  date?: string;
  branchToken?: string;
  all: boolean;
};

function parseTelegramCommandScope(value: string): TelegramCommandScope {
  const normalized = expandVietnameseBusinessShorthand(value);
  const all = /\b(all|tong he thong|tong|toan he thong|tat ca chi nhanh|tat ca|ca chuoi|toan chuoi|toan bo)\b/.test(normalized);
  const dateMatch = normalized.match(/\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{4})?)\b/);

  let period: TelegramCommandScope['period'] = 'TODAY';
  if (dateMatch) period = 'CUSTOM';
  else if (/\b(thang truoc|last month)\b/.test(normalized)) period = 'LAST_MONTH';
  else if (/\b(tuan truoc|last week)\b/.test(normalized)) period = 'LAST_WEEK';
  else if (/\b(hom qua|homqua|yesterday|hq)\b/.test(normalized)) period = 'YESTERDAY';
  else if (/\b(thang nay|thangnay|thang|month)\b/.test(normalized)) period = 'MONTH';
  else if (/\b(tuan nay|tuannay|tuan|week)\b/.test(normalized)) period = 'WEEK';

  const branchToken = normalized
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{4})?\b/g, ' ')
    .replace(/\b(thang truoc|tuan truoc|hom qua|homqua|hôm qua|hq|thang nay|thangnay|tuan nay|tuannay|hom nay|homnay|hn|today|yesterday|last month|last week|month|week|thang|tuan)\b/g, ' ')
    .replace(/\b(all|tong he thong|tong|toan he thong|tat ca chi nhanh|tat ca|ca chuoi|toan chuoi|toan bo)\b/g, ' ')
    .replace(/\b(bao cao ban hang|bao cao|doanh so|doanh thu|ban duoc|ban sao|tinh hinh ban|ngay)\b/g, ' ')
    .replace(/\b(yeu cau tiep theo|thi sao|the nao|con sao)\b/g, ' ')
    .replace(/[.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || undefined;

  return { period, date: dateMatch?.[1], branchToken, all };
}

function extractInventoryModelQuery(value: string): string | undefined {
  const normalized = expandVietnameseBusinessShorthand(value);
  const modelMatch = normalized.match(/\b(?:iphone\s*)?((?:1[1-9]|[6-9])(?:\s+(?:pro|max|plus|mini)){0,3})(?:\s+(\d{2,4}\s*(?:gb|tb)))?\b/);
  if (!modelMatch) return undefined;
  const model = `${modelMatch[1] || ''} ${modelMatch[2] || ''}`.replace(/\s+/g, ' ').trim();
  return model || undefined;
}

export function parseTelegramIntent(rawText: string): TelegramIntent {
  const original = String(rawText || '').trim();
  const normalized = expandVietnameseBusinessShorthand(original.replace(/@[A-Za-z0-9_]+/g, ' '));
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const rawCommand = tokens[0] || '';
  const command = rawCommand.split('@')[0];

  if (['/help', '/start', '/trogiup'].includes(command)) return { kind: 'HELP' };
  if (['/menu', '/chucnang', '/dashboard'].includes(command)) return { kind: 'MENU' };
  if (['/chinhanh', '/branches', '/branch'].includes(command)) return { kind: 'BRANCHES' };
  if (['/lienket', '/link'].includes(command)) {
    return { kind: 'LINK', code: String(tokens[1] || '').toUpperCase() };
  }

  if (command === '/ai') {
    return { kind: 'AI', query: original.replace(/^\/ai(@\w+)?\s*/i, '').trim() };
  }

  // Pure IMEI or explicit IMEI query
  const imeiMatch = normalized.match(/(?:imei|may|sua chua)\s*[:#-]?\s*(\d{5,15})\b/)
    || (command === '/imei' || command === '/suachua' ? normalized.match(/\b(\d{5,15})\b/) : null)
    || (/^\d{15}$/.test(normalized) ? [normalized, normalized] : null);

  if (imeiMatch) return { kind: 'IMEI', imei: imeiMatch[1] };

  if (/^0\d{9}$/.test(normalized)) return { kind: 'CUSTOMER', query: normalized };

  // Explicit Slash Commands
  if (['/report', '/baocao', '/doanhso'].includes(command)) {
    const scope = parseTelegramCommandScope(tokens.slice(1).join(' '));
    return { kind: 'REVENUE', ...scope };
  }

  if (['/kythuat'].includes(command)) {
    const scope = parseTelegramCommandScope(tokens.slice(1).join(' '));
    return { kind: 'TECHNICAL', branchToken: scope.branchToken, all: scope.all };
  }

  if (['/tonkho'].includes(command)) {
    const scope = parseTelegramCommandScope(tokens.slice(1).join(' '));
    const includeImeis = /\b(imei|chi tiet|danh sach|tung may|ma may)\b/.test(normalized);
    return { kind: 'INVENTORY', branchToken: scope.branchToken, all: scope.all, includeImeis, model: extractInventoryModelQuery(normalized) };
  }

  if (['/baohanh', '/sualẻ', '/suale', '/suakhach', '/suachualẻ', '/suachuale'].includes(command)) {
    const scope = parseTelegramCommandScope(tokens.slice(1).join(' '));
    const repairType = command === '/baohanh' ? 'WARRANTY' : 'CUSTOMER_SERVICE';
    const hasTime = /\b(hom nay|homnay|hom qua|homqua|tuan|thang|\d{1,2}\/\d{1,2}|\d{4}-\d{1,2}-\d{1,2})\b/.test(normalized);
    return {
      kind: 'RETAIL_REPAIRS', repairType, branchToken: scope.branchToken, all: scope.all,
      includeImeis: true, period: hasTime ? scope.period : undefined, date: scope.date
    };
  }

  if (['/khachhang', '/lead', '/khach'].includes(command)) {
    const query = original.replace(/^\/(?:khachhang|lead|khach)(?:@\w+)?\s*/i, '').trim();
    return { kind: 'CUSTOMER', query: query || tokens.slice(1).join(' ') };
  }

  if (['/soquy', '/quy', '/taichinh'].includes(command)) {
    const scope = parseTelegramCommandScope(tokens.slice(1).join(' '));
    const period = ['TODAY', 'YESTERDAY', 'MONTH', 'LAST_MONTH'].includes(scope.period) ? scope.period as 'TODAY' | 'YESTERDAY' | 'MONTH' | 'LAST_MONTH' : 'TODAY';
    return {
      kind: 'CASHBOOK', period,
      ...(scope.branchToken ? { branchToken: scope.branchToken } : {}),
      ...(scope.all ? { all: true } : {})
    };
  }

  if (['/nhansu', '/chamcong', '/diemdanh'].includes(command)) {
    const scope = parseTelegramCommandScope(tokens.slice(1).join(' '));
    return { kind: 'ATTENDANCE', branchToken: scope.branchToken, all: scope.all, date: scope.date };
  }

  if (['/crm', '/pipeline'].includes(command)) {
    const scope = parseTelegramCommandScope(tokens.slice(1).join(' '));
    return { kind: 'CRM_PIPELINE', branchToken: scope.branchToken, all: scope.all, period: scope.period, date: scope.date };
  }

  if (['/vieccrm', '/followup', '/chamsoc'].includes(command)) {
    const scope = parseTelegramCommandScope(tokens.slice(1).join(' '));
    return { kind: 'CRM_WORK_QUEUE', branchToken: scope.branchToken, all: scope.all };
  }

  // Deterministic natural-language commands used in Telegram groups. These must
  // not depend on the AI provider because a proxy outage or a malformed tool call
  // could otherwise drop branch/date arguments that are present in the message.
  if (/\b(doanh so|doanh thu|bao cao ban hang|ban duoc|ban sao|tinh hinh ban)\b/.test(normalized)) {
    const scope = parseTelegramCommandScope(normalized);
    return { kind: 'REVENUE', ...scope };
  }

  if (/\b(ky thuat|kcs|tien do sua chua|may dang sua)\b/.test(normalized)) {
    const scope = parseTelegramCommandScope(normalized
      .replace(/\b(ky thuat|kcs|tien do sua chua|may dang sua)\b/g, ' '));
    return { kind: 'TECHNICAL', branchToken: scope.branchToken, all: scope.all };
  }

  const inventoryModel = extractInventoryModelQuery(normalized);
  if (/\b(ton kho|con may|may ton|con hang|co san)\b/.test(normalized)
    || Boolean(inventoryModel && /\b(con khong|co khong|con may nao|con con nao)\b/.test(normalized))) {
    const scope = parseTelegramCommandScope(normalized
      .replace(/\b(ton kho|con may|may ton|con hang|co san|con khong|co khong|con may nao|con con nao)\b/g, ' '));
    const includeImeis = /\b(imei|chi tiet|danh sach|tung may|ma may)\b/.test(normalized);
    return { kind: 'INVENTORY', branchToken: scope.branchToken, all: scope.all, includeImeis, model: inventoryModel };
  }

  if (/\b(bao hanh|sua le|sua khach|sua dich vu|may khach sua|tiep nhan sua)\b/.test(normalized)) {
    const hasWarranty = /\b(bao hanh)\b/.test(normalized);
    const hasService = /\b(sua le|sua khach|sua dich vu|may khach sua|tiep nhan sua)\b/.test(normalized);
    const scope = parseTelegramCommandScope(normalized
      .replace(/\b(may nhan|may|bao hanh|sua le|sua khach|sua dich vu|may khach sua|tiep nhan sua|dang xu ly|tinh trang|chi tiet|danh sach|imei)\b/g, ' '));
    const hasTime = /\b(hom nay|homnay|hom qua|homqua|tuan|thang|\d{1,2}\/\d{1,2}|\d{4}-\d{1,2}-\d{1,2})\b/.test(normalized);
    return {
      kind: 'RETAIL_REPAIRS',
      repairType: hasWarranty && !hasService ? 'WARRANTY' : hasService && !hasWarranty ? 'CUSTOMER_SERVICE' : 'ALL',
      branchToken: scope.branchToken,
      all: scope.all,
      includeImeis: /\b(imei|chi tiet|danh sach|tung may)\b/.test(normalized),
      period: hasTime ? scope.period : undefined,
      date: scope.date
    };
  }

  if (/\b(nhan su|cham cong|diem danh|di tre|ai tre|ai di lam|ai chua vao ca)\b/.test(normalized)) {
    const scope = parseTelegramCommandScope(normalized
      .replace(/\b(nhan su|cham cong|diem danh|di tre|ai tre|ai di lam|ai chua vao ca)\b/g, ' '));
    return { kind: 'ATTENDANCE', branchToken: scope.branchToken, all: scope.all, date: scope.date };
  }

  if (/\b(crm pipeline|pipeline crm|bao cao crm|ty le chuyen doi lead|ty le chuyen doi crm|lead moi|tong lead|lead hom nay)\b/.test(normalized)) {
    const scope = parseTelegramCommandScope(normalized.replace(/\b(crm pipeline|pipeline crm|bao cao crm|ty le chuyen doi lead|ty le chuyen doi crm|lead moi|tong lead|lead hom nay)\b/g, ' '));
    return { kind: 'CRM_PIPELINE', branchToken: scope.branchToken, all: scope.all, period: scope.period, date: scope.date };
  }

  if (/\b(viec crm|lead qua han|can cham soc|viec can lam|follow up|khach can goi lai|khach can goi|can goi lai|lich hen crm|task crm|cong viec crm)\b/.test(normalized)) {
    const scope = parseTelegramCommandScope(normalized.replace(/\b(viec crm|lead qua han|can cham soc|viec can lam|follow up|khach can goi lai|khach can goi|can goi lai|lich hen crm|task crm|cong viec crm)\b/g, ' '));
    return { kind: 'CRM_WORK_QUEUE', branchToken: scope.branchToken, all: scope.all };
  }

  const customerPhoneMatch = normalized.match(/\b(0\d{9,10})\b/);
  if (customerPhoneMatch && /\b(khach|khach hang|lead|customer|tra cuu)\b/.test(normalized)) {
    return { kind: 'CUSTOMER', query: customerPhoneMatch[1] };
  }

  if (/^(danh sach |cac |ma )?chi nhanh$/.test(normalized)) return { kind: 'BRANCHES' };
  if (/^(cn|ph)\s*[-_]?\s*0*\d+$/.test(normalized)) {
    return { kind: 'BRANCH_CONFIRM', branchToken: normalized };
  }

  // All natural conversational questions route to Gemini Copilot
  return { kind: 'AI', query: original };
}

export function renderMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '💰 Doanh Số', callback_data: 'menu:revenue' },
        { text: '📦 Tồn Kho', callback_data: 'menu:inventory' }
      ],
      [
        { text: '👥 CRM & Chăm sóc', callback_data: 'menu:crm' },
        { text: '🔧 Kỹ Thuật & KCS', callback_data: 'menu:technical' }
      ],
      [
        { text: '⏰ Chấm Công', callback_data: 'menu:attendance' },
        { text: '💵 Sổ Quỹ', callback_data: 'menu:cashbook' }
      ],
      [
        { text: '❓ Trợ Giúp', callback_data: 'menu:help' }
      ],
      [
        { text: '🏪 Mã & tên chi nhánh', callback_data: 'menu:branches' }
      ]
    ]
  };
}

export function renderRevenueMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '⚡ Hôm Nay', callback_data: 'revenue:today' },
        { text: '📅 Tuần Này', callback_data: 'revenue:week' },
        { text: '📊 Tháng Này', callback_data: 'revenue:month' }
      ],
      [
        { text: '🌐 Toàn hệ thống hôm nay (Owner)', callback_data: 'revenue:today:all' }
      ],
      [
        { text: '🔙 Menu Chính', callback_data: 'menu:main' }
      ]
    ]
  };
}

export function renderCrmMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📊 Pipeline hôm nay', callback_data: 'crm:pipeline:today' },
        { text: '📈 Pipeline tháng', callback_data: 'crm:pipeline:month' }
      ],
      [
        { text: '📋 Việc cần làm & quá hạn', callback_data: 'crm:work-queue' }
      ],
      [
        { text: '🏪 Đổi chi nhánh', callback_data: 'menu:branches' },
        { text: '🔙 Menu Chính', callback_data: 'menu:main' }
      ]
    ]
  };
}

function renderPreferredBranchQuickActions() {
  return {
    inline_keyboard: [
      [
        { text: '💰 Doanh số hôm nay', callback_data: 'quick:revenue:today' },
        { text: '📅 Doanh số tuần', callback_data: 'quick:revenue:week' }
      ],
      [
        { text: '📦 Tồn kho', callback_data: 'quick:inventory' },
        { text: '📱 IMEI tồn kho', callback_data: 'quick:inventory:imeis' }
      ],
      [
        { text: '🔧 Kỹ thuật', callback_data: 'quick:technical' },
        { text: '🛡 Bảo hành', callback_data: 'quick:warranty' }
      ],
      [
        { text: '🧰 Sửa lẻ', callback_data: 'quick:service-repairs' },
        { text: '⏰ Chấm công', callback_data: 'quick:attendance' }
      ],
      [
        { text: '👥 CRM pipeline', callback_data: 'crm:pipeline:month' },
        { text: '📋 Việc CRM', callback_data: 'crm:work-queue' }
      ],
      [
        { text: '🏪 Đổi chi nhánh', callback_data: 'menu:branches' }
      ],
      [{ text: '🔙 Menu Chính', callback_data: 'menu:main' }]
    ]
  };
}

export async function handleTelegramCallbackQuery(
  db: Firestore,
  callbackQuery: { id: string; from: { id: string | number }; data?: string; message?: { chat: { id: string | number }; message_id: number } },
  config?: TelegramConfig
): Promise<void> {
  const conf = config || getTelegramConfig();
  const senderId = String(callbackQuery.from?.id || '');
  const data = String(callbackQuery.data || '');
  const chatId = String(callbackQuery.message?.chat?.id || conf.chatId);
  const principal = await resolveTelegramPrincipal(db, senderId, conf.ownerUserIds).catch(() => null);

  await answerTelegramCallbackQuery(callbackQuery.id, 'Đang tải dữ liệu...', conf);

  let replyText = '';
  let replyMarkup: Record<string, unknown> | undefined;

  const publicCallback = ['menu:main', 'menu:help', 'menu:branches'].includes(data) || data.startsWith('branch:');
  if (!principal && !publicCallback) {
    replyText = '<b>🔐 Cần liên kết Telegram với PhoneHouseCRM.</b>\nMở mục <b>Xem thêm → Liên kết Telegram</b> trên CRM rồi gửi <code>/lienket MÃ</code>.';
  } else if (data === 'menu:main') {
    replyText = telegramMenuText();
    replyMarkup = renderMainMenuKeyboard();
  } else if (data === 'menu:revenue') {
    replyText = '📊 <b>CHỌN MỐC THỜI GIAN TRA CỨU DOANH SỐ:</b>';
    replyMarkup = renderRevenueMenuKeyboard();
  } else if (data === 'menu:crm') {
    replyText = [
      '<b>👥 CRM & CHĂM SÓC KHÁCH HÀNG</b>',
      'Chọn báo cáo theo chi nhánh mặc định hoặc dùng:',
      '<code>/khachhang SỐ_ĐIỆN_THOẠI</code> để mở Customer 360.'
    ].join('\n');
    replyMarkup = renderCrmMenuKeyboard();
  } else if (['crm:pipeline:today', 'crm:pipeline:month', 'crm:work-queue'].includes(data)) {
    const preference = await loadTelegramUserBranchPreference(db, senderId);
    if (!preference) {
      const directory = await branchesReply(db, 'Chọn chi nhánh mặc định trước khi xem CRM.');
      replyText = directory.text;
      replyMarkup = directory.replyMarkup;
    } else if (data === 'crm:work-queue') {
      replyText = await toolGetCrmWorkQueue(db, { branchQuery: preference.branchId, all: false }, principal);
      replyMarkup = renderCrmMenuKeyboard();
    } else {
      replyText = await toolGetCrmPipeline(db, {
        branchQuery: preference.branchId,
        all: false,
        period: data.endsWith(':month') ? 'MONTH' : 'TODAY'
      }, principal);
      replyMarkup = renderCrmMenuKeyboard();
    }
  } else if (data === 'revenue:today:all') {
    replyText = await revenueReply(db, { kind: 'REVENUE', period: 'TODAY', all: true }, senderId, principal);
    replyMarkup = renderRevenueMenuKeyboard();
  } else if (['revenue:today', 'revenue:week', 'revenue:month', 'quick:revenue:today', 'quick:revenue:week'].includes(data)) {
    const preference = await loadTelegramUserBranchPreference(db, senderId);
    if (!preference) {
      const directory = await branchesReply(db, 'Chọn chi nhánh mặc định trước khi xem doanh số.');
      replyText = directory.text;
      replyMarkup = directory.replyMarkup;
    } else {
      const period = data.endsWith(':week') ? 'WEEK' : data.endsWith(':month') ? 'MONTH' : 'TODAY';
      replyText = await revenueReply(db, { kind: 'REVENUE', period, branchToken: preference.branchId, all: false }, senderId, principal);
      replyMarkup = data.startsWith('quick:') ? renderPreferredBranchQuickActions() : renderRevenueMenuKeyboard();
    }
  } else if (['menu:inventory', 'quick:inventory', 'quick:inventory:imeis'].includes(data)) {
    const preference = await loadTelegramUserBranchPreference(db, senderId);
    if (!preference) {
      const directory = await branchesReply(db, 'Chọn chi nhánh mặc định trước khi xem tồn kho.');
      replyText = directory.text;
      replyMarkup = directory.replyMarkup;
    } else {
      replyText = await toolCheckInventory(db, { branchQuery: preference.branchId, all: false, includeImeis: data.endsWith(':imeis') }, senderId, principal);
      replyMarkup = renderPreferredBranchQuickActions();
    }
  } else if (['menu:technical', 'quick:technical'].includes(data)) {
    const preference = await loadTelegramUserBranchPreference(db, senderId);
    if (!preference) {
      const directory = await branchesReply(db, 'Chọn chi nhánh mặc định trước khi xem tiến độ kỹ thuật.');
      replyText = directory.text;
      replyMarkup = directory.replyMarkup;
    } else {
      replyText = await technicalReply(db, { kind: 'TECHNICAL', branchToken: preference.branchId, all: false }, senderId, principal);
      replyMarkup = renderPreferredBranchQuickActions();
    }
  } else if (['menu:attendance', 'quick:attendance'].includes(data)) {
    const preference = await loadTelegramUserBranchPreference(db, senderId);
    if (!preference) {
      const directory = await branchesReply(db, 'Chọn chi nhánh mặc định trước khi xem chấm công.');
      replyText = directory.text;
      replyMarkup = directory.replyMarkup;
    } else {
      replyText = await toolGetAttendanceToday(db, { branchQuery: preference.branchId, all: false }, principal);
      replyMarkup = renderPreferredBranchQuickActions();
    }
  } else if (['quick:warranty', 'quick:service-repairs'].includes(data)) {
    const preference = await loadTelegramUserBranchPreference(db, senderId);
    if (!preference) {
      const directory = await branchesReply(db, 'Chọn chi nhánh mặc định trước khi xem máy bảo hành/sửa lẻ.');
      replyText = directory.text;
      replyMarkup = directory.replyMarkup;
    } else {
      replyText = await toolGetRetailRepairQueue(db, {
        branchQuery: preference.branchId,
        repairType: data === 'quick:warranty' ? 'WARRANTY' : 'CUSTOMER_SERVICE',
        includeImeis: true
      }, senderId, principal);
      replyMarkup = renderPreferredBranchQuickActions();
    }
  } else if (data === 'menu:cashbook') {
    replyText = await toolGetCashflowSummary(db, { period: 'TODAY' }, senderId, principal);
    replyMarkup = {
      inline_keyboard: [[{ text: '🔙 Menu Chính', callback_data: 'menu:main' }]]
    };
  } else if (data === 'menu:help') {
    replyText = telegramHelpText();
    replyMarkup = {
      inline_keyboard: [[{ text: '🔙 Menu Chính', callback_data: 'menu:main' }]]
    };
  } else if (data.startsWith('branch:')) {
    replyText = await branchConfirmationReply(db, data.slice('branch:'.length), senderId, principal);
    replyMarkup = renderPreferredBranchQuickActions();
  } else if (data === 'menu:branches') {
    const directory = await branchesReply(db);
    replyText = directory.text;
    replyMarkup = directory.replyMarkup;
  } else {
    replyText = telegramMenuText();
    replyMarkup = renderMainMenuKeyboard();
  }

  const messageId = callbackQuery.message?.message_id;

  if (messageId) {
    try {
      await editTelegramMessageText(replyText, {
        chatId,
        messageId,
        replyMarkup,
        config: conf
      });
      return;
    } catch (editErr: any) {
      const msg = String(editErr?.message || '').toLowerCase();
      if (msg.includes('message is not modified')) return;
      // Fallback to sending new message
    }
  }

  await sendTelegramMessage(replyText, {
    chatId,
    replyMarkup,
    config: conf
  });
}

async function activeBranches(db: Firestore): Promise<Array<Record<string, any>>> {
  return fetchActiveBranches(db);
}

async function branchesReply(db: Firestore, intro?: string): Promise<{ text: string; replyMarkup?: Record<string, unknown> }> {
  const branches = await fetchActiveBranches(db);
  if (branches.length === 0) return { text: '🏪 Chưa có chi nhánh đang hoạt động trong CRM.' };
  const text = [
    '<b>🏪 DANH MỤC CHI NHÁNH BOT NHẬN DIỆN</b>',
    intro ? `<i>${escapeTelegramHtml(intro)}</i>` : '',
    ...branches.map(branch => {
      const aliases = getBranchAcceptedAliases(branch)
        .filter(alias => normalizeText(alias) !== normalizeText(branch.code || branch.id))
        .slice(0, 3)
        .map(escapeTelegramHtml)
        .join(', ');
      return `• <code>${escapeTelegramHtml(branch.code || branch.id)}</code> — <b>${escapeTelegramHtml(branch.name || branch.id)}</b>${aliases ? `\n  Gọi bằng: ${aliases}` : ''}`;
    }),
    '',
    'Ví dụ: <code>@trolyAlphonehouse_bot doanh số CN-02 hôm nay</code>'
  ].filter(Boolean).join('\n');
  const buttons = branches.map(branch => ({
    text: `${branch.code || branch.id} · ${branch.name || branch.id}`.slice(0, 60),
    callback_data: `branch:${branch.code || branch.id}`.slice(0, 64)
  }));
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let index = 0; index < buttons.length; index += 2) rows.push(buttons.slice(index, index + 2));
  rows.push([{ text: '🔙 Menu Chính', callback_data: 'menu:main' }]);
  return { text, replyMarkup: { inline_keyboard: rows } };
}

async function branchConfirmationReply(db: Firestore, branchToken: string, senderId: string, principal?: TelegramPrincipal | null): Promise<string> {
  const branches = await fetchActiveBranches(db);
  const branch = findBranchMatch(branches, branchToken);
  if (!branch) return (await branchesReply(db)).text;
  if (principal && !telegramPrincipalCanAccessBranch(principal, branch.id)) {
    return '⛔ Chi nhánh này nằm ngoài phạm vi được cấp cho tài khoản CRM của bạn.';
  }
  await saveTelegramUserBranchPreference(db, senderId, branch);
  return [
    `<b>✅ ĐÃ CHỌN CHI NHÁNH MẶC ĐỊNH</b>`,
    `• Mã chuẩn: <code>${escapeTelegramHtml(branch.code || branch.id)}</code>`,
    `• Tên: <b>${escapeTelegramHtml(branch.name || branch.id)}</b>`,
    `• Từ giờ chỉ cần hỏi: <code>doanh số hôm nay</code>`,
    `<i>Cài đặt này chỉ áp dụng cho tài khoản Telegram của bạn.</i>`
  ].join('\n');
}

async function applyPreferredBranchToIntent(db: Firestore, intent: TelegramIntent, senderId: string): Promise<TelegramIntent> {
  switch (intent.kind) {
    case 'REVENUE':
    case 'TECHNICAL':
    case 'INVENTORY':
    case 'ATTENDANCE':
    case 'CASHBOOK':
    case 'CRM_PIPELINE':
    case 'CRM_WORK_QUEUE': {
      if (intent.all) return intent;
      if (intent.branchToken) {
        try {
          const branches = await fetchActiveBranches(db);
          const branch = findBranchMatch(branches, intent.branchToken);
          if (branch) await saveTelegramUserBranchPreference(db, senderId, branch);
        } catch (error: any) {
          console.warn('[Telegram Branch Preference Auto-Learn Failed]:', String(error?.message || error));
        }
        return intent;
      }
      const preference = await loadTelegramUserBranchPreference(db, senderId);
      return preference ? { ...intent, branchToken: preference.branchId } : intent;
    }
    case 'RETAIL_REPAIRS': {
      if (intent.all) return intent;
      if (intent.branchToken) {
        try {
          const branches = await fetchActiveBranches(db);
          const branch = findBranchMatch(branches, intent.branchToken);
          if (branch) await saveTelegramUserBranchPreference(db, senderId, branch);
        } catch (error: any) {
          console.warn('[Telegram Branch Preference Auto-Learn Failed]:', String(error?.message || error));
        }
        return intent;
      }
      const preference = await loadTelegramUserBranchPreference(db, senderId);
      return preference ? { ...intent, branchToken: preference.branchId } : intent;
    }
    default:
      return intent;
  }
}

async function revenueReply(db: Firestore, intent: Extract<TelegramIntent, { kind: 'REVENUE' }>, senderId: string, principal?: TelegramPrincipal | null): Promise<string> {
  return toolGetRevenueReport(db, {
    period: intent.period,
    date: intent.date,
    startDate: intent.startDate,
    endDate: intent.endDate,
    branchQuery: intent.branchToken,
    all: intent.all
  }, senderId, principal);
}

async function imeiReply(db: Firestore, imei: string, principal?: TelegramPrincipal | null): Promise<string> {
  return toolLookupImei(db, { imei }, principal);
}

async function technicalReply(db: Firestore, intent: Extract<TelegramIntent, { kind: 'TECHNICAL' }>, senderId: string, principal?: TelegramPrincipal | null): Promise<string> {
  return toolGetTechnicalProgress(db, {
    branchQuery: intent.branchToken,
    all: intent.all
  }, senderId, principal);
}

async function inventoryReply(db: Firestore, intent: Extract<TelegramIntent, { kind: 'INVENTORY' }>, senderId: string, principal?: TelegramPrincipal | null): Promise<string> {
  return toolCheckInventory(db, {
    modelQuery: intent.model,
    branchQuery: intent.branchToken,
    all: intent.all,
    includeImeis: intent.includeImeis
  }, senderId, principal);
}

async function attendanceReply(db: Firestore, intent: Extract<TelegramIntent, { kind: 'ATTENDANCE' }>, principal?: TelegramPrincipal | null): Promise<string> {
  return toolGetAttendanceToday(db, {
    branchQuery: intent.branchToken,
    all: intent.all,
    date: intent.date
  }, principal);
}

async function customerReply(db: Firestore, query: string, principal?: TelegramPrincipal | null): Promise<string> {
  return toolLookupCustomer(db, { phoneOrName: query }, principal);
}

async function cashbookReply(db: Firestore, intent: Extract<TelegramIntent, { kind: 'CASHBOOK' }>, senderId: string): Promise<string> {
  return toolGetCashflowSummary(db, { period: intent.period || 'TODAY' }, senderId);
}

export function telegramMenuText(): string {
  return [
    '<b>🤖 BẢNG ĐIỀU KHIỂN PHONEHOUSE AI</b>',
    'Chào mừng bạn đến với Trợ Lý Toàn Năng.',
    'Chọn chức năng bên dưới hoặc nhắn/gửi voice ngắn bằng tiếng Việt tự nhiên:'
  ].join('\n');
}

export function telegramHelpText(): string {
  return [
    '<b>🤖 PHONEHOUSE AI COPILOT & BOT TOÀN NĂNG</b>',
    '<b>1. Bảng điều khiển nhanh:</b>',
    '• <code>/menu</code>: Bật menu tương tác nút bấm',
    '• <code>/chinhanh</code>: Xem mã và tên chi nhánh bot chấp nhận',
    '• <code>/lienket MÃ</code>: Liên kết Telegram với tài khoản PhoneHouseCRM',
    '',
    '<b>2. Tra cứu nghiệp vụ:</b>',
    '• <code>/doanhso hôm nay PH109</code> · Doanh số hôm nay',
    '• <code>/doanhso hôm qua PH 109</code> · Doanh số hôm qua',
    '• <code>/doanhso 28/08/2026 109 Hàm Nghi</code> · Doanh số ngày cụ thể',
    '• <code>/doanhso thang all</code> · Doanh số toàn chuỗi (Owner)',
    '• <code>/imei 355555...</code> · Tra cứu vòng đời 15 số IMEI',
    '• <code>/tonkho PH109</code> · Tồn kho khả dụng',
    '• <code>/tonkho PH109 chi tiết IMEI</code> · Danh sách từng máy',
    '• <code>/kythuat PH109</code> · Tiến độ sửa chữa & KCS',
    '• <code>/baohanh PH109</code> · Máy bảo hành đang xử lý',
    '• <code>/suale PH109</code> · Máy sửa lẻ đang xử lý',
    '• <code>/khachhang 0988xxxxxx</code> · Tra cứu khách/công nợ/Lead',
    '• <code>/crm PH109 tháng</code> · Pipeline và tỷ lệ chuyển đổi CRM',
    '• <code>/vieccrm PH109</code> · Lead/task cần chăm sóc và quá hạn',
    '• <code>/nhansu PH109</code> · Tình hình điểm danh & đi trễ',
    '• <code>/soquy homnay</code> · Sổ quỹ & tiền mặt (Owner)',
    '',
    '<b>3. Trợ lý AI Thông Minh:</b>',
    '• Tin riêng không cần lệnh: <i>“ds hn 109”</i>, <i>“15pm 256 còn không”</i>, <i>“ai trễ?”</i>',
    '• Có thể gửi voice tối đa 3 phút; bot sẽ chép lời rồi tra đúng dữ liệu CRM.',
    '• Có thể hỏi tiếp ngắn: <i>“hôm qua thì sao?”</i> hoặc <i>“còn 245?”</i>',
    '• Trong nhóm, hãy gọi bot, dùng lệnh hoặc trả lời tin nhắn của bot để tránh bot nghe nhầm hội thoại chung.',
    '• Phân tích tự do: <code>/ai tư vấn cách tăng doanh thu phụ kiện</code>'
  ].join('\n');
}

export async function answerTelegramQuery(
  db: Firestore,
  text: string,
  senderId: string,
  suppliedPrincipal?: TelegramPrincipal | null
): Promise<{ intent: string; reply: string; replyMarkup?: Record<string, unknown> }> {
  let intent = parseTelegramIntent(text);
  if (intent.kind === 'LINK') {
    try {
      const principal = await consumeTelegramLinkCode(db, senderId, intent.code);
      return {
        intent: intent.kind,
        reply: [
          '<b>✅ LIÊN KẾT TELEGRAM THÀNH CÔNG</b>',
          `• Tài khoản: <b>${escapeTelegramHtml(principal.name)}</b>`,
          `• Vai trò: <b>${escapeTelegramHtml(principal.role)}</b>`,
          `• Chi nhánh: <b>${escapeTelegramHtml(principal.branchId || 'Theo phạm vi được cấp')}</b>`,
          '<i>Từ bây giờ bot sẽ tự giới hạn dữ liệu đúng quyền của tài khoản CRM này.</i>'
        ].join('\n')
      };
    } catch (error: any) {
      const code = String(error?.message || 'TELEGRAM_LINK_FAILED');
      const message = code.includes('EXPIRED')
        ? 'Mã liên kết đã hết hạn. Hãy tạo mã mới trên PhoneHouseCRM.'
        : code.includes('USER_INACTIVE')
          ? 'Tài khoản CRM đã ngừng hoạt động.'
          : 'Mã liên kết không hợp lệ hoặc đã được sử dụng.';
      return { intent: intent.kind, reply: `⚠️ ${message}` };
    }
  }

  const config = getTelegramConfig();
  const enforcePrincipal = suppliedPrincipal !== undefined;
  const principal = suppliedPrincipal === undefined
    ? await resolveTelegramPrincipal(db, senderId, config.ownerUserIds).catch(() => null)
    : suppliedPrincipal;
  if (enforcePrincipal && !principal && !['HELP', 'MENU', 'BRANCHES', 'BRANCH_CONFIRM'].includes(intent.kind)) {
    return {
      intent: 'LINK_REQUIRED',
      reply: [
        '<b>🔐 CẦN LIÊN KẾT TÀI KHOẢN</b>',
        'Telegram này chưa được gắn với nhân viên PhoneHouseCRM.',
        'Mở mục <b>Xem thêm → Liên kết Telegram</b> trên CRM để lấy mã, sau đó gửi:',
        '<code>/lienket MÃ_CỦA_BẠN</code>'
      ].join('\n')
    };
  }
  intent = await applyPreferredBranchToIntent(db, intent, senderId);

  if (intent.kind === 'HELP') {
    return { intent: intent.kind, reply: telegramHelpText(), replyMarkup: renderMainMenuKeyboard() };
  }
  if (intent.kind === 'MENU') {
    return { intent: intent.kind, reply: telegramMenuText(), replyMarkup: renderMainMenuKeyboard() };
  }
  if (intent.kind === 'BRANCHES') {
    const directory = await branchesReply(db);
    return { intent: intent.kind, reply: directory.text, replyMarkup: directory.replyMarkup };
  }
  if (intent.kind === 'BRANCH_CONFIRM') {
    return {
      intent: intent.kind,
      reply: await branchConfirmationReply(db, intent.branchToken, senderId, principal),
      replyMarkup: renderPreferredBranchQuickActions()
    };
  }
  if (intent.kind === 'REVENUE') {
    return { intent: intent.kind, reply: await revenueReply(db, intent, senderId, principal), replyMarkup: renderRevenueMenuKeyboard() };
  }
  if (intent.kind === 'IMEI') {
    return { intent: intent.kind, reply: await imeiReply(db, intent.imei, principal) };
  }
  if (intent.kind === 'TECHNICAL') {
    return { intent: intent.kind, reply: await technicalReply(db, intent, senderId, principal) };
  }
  if (intent.kind === 'INVENTORY') {
    return { intent: intent.kind, reply: await inventoryReply(db, intent, senderId, principal) };
  }
  if (intent.kind === 'RETAIL_REPAIRS') {
    return {
      intent: intent.kind,
      reply: await toolGetRetailRepairQueue(db, {
        repairType: intent.repairType,
        branchQuery: intent.branchToken,
        all: intent.all,
        includeImeis: intent.includeImeis,
        period: intent.period,
        date: intent.date
      }, senderId, principal)
    };
  }
  if (intent.kind === 'CUSTOMER') {
    return { intent: intent.kind, reply: await toolLookupCustomer(db, { phoneOrName: intent.query }, principal) };
  }
  if (intent.kind === 'CASHBOOK') {
    return { intent: intent.kind, reply: await toolGetCashflowSummary(db, { period: intent.period, branchQuery: intent.branchToken, all: intent.all }, senderId, principal) };
  }
  if (intent.kind === 'ATTENDANCE') {
    return { intent: intent.kind, reply: await attendanceReply(db, intent, principal) };
  }
  if (intent.kind === 'CRM_PIPELINE') {
    return {
      intent: intent.kind,
      reply: await toolGetCrmPipeline(db, { branchQuery: intent.branchToken, all: intent.all, period: intent.period, date: intent.date }, principal)
    };
  }
  if (intent.kind === 'CRM_WORK_QUEUE') {
    return {
      intent: intent.kind,
      reply: await toolGetCrmWorkQueue(db, { branchQuery: intent.branchToken, all: intent.all }, principal)
    };
  }
  if (intent.kind === 'AI') {
    const aiReply = await processTelegramAiCopilot(db, intent.query, senderId, principal);
    return { intent: 'AI', reply: aiReply };
  }

  // Fallback to Gemini AI Copilot
  const aiAnswer = await processTelegramAiCopilot(db, text, senderId);
  return { intent: 'AI', reply: aiAnswer };
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
