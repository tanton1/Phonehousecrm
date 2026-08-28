import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attendanceTelegramOutboxId,
  clearTelegramConfigCache,
  createAttendanceTelegramOutboxRecord,
  escapeTelegramHtml,
  getTelegramRuntimeStatus,
  loadTelegramConfig,
  parseTelegramIntent,
  saveTelegramConfiguration,
  telegramIsConfigured
} from '../server/services/telegramService';

const ORIGINAL_ENV = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  TELEGRAM_ALERTS_ENABLED: process.env.TELEGRAM_ALERTS_ENABLED,
  TELEGRAM_QUERIES_ENABLED: process.env.TELEGRAM_QUERIES_ENABLED,
  CHANNEL_TOKEN_ENCRYPTION_KEY: process.env.CHANNEL_TOKEN_ENCRYPTION_KEY
};

afterEach(() => {
  clearTelegramConfigCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.entries(ORIGINAL_ENV).forEach(([key, value]) => {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  });
});

describe('Telegram bot deterministic intent and safety layer', () => {
  it('recognizes commands and Vietnamese natural-language IMEI questions', () => {
    expect(parseTelegramIntent('/doanhso homnay PH109')).toMatchObject({ kind: 'REVENUE', period: 'TODAY', branchToken: 'ph109' });
    expect(parseTelegramIntent('@PhoneHouseBot IMEI 12345 đang ở đâu?')).toEqual({ kind: 'IMEI', imei: '12345' });
    expect(parseTelegramIntent('/kythuat PH109')).toMatchObject({ kind: 'TECHNICAL', branchToken: 'ph109' });
    expect(parseTelegramIntent('/help')).toEqual({ kind: 'HELP' });
  });

  it('escapes Telegram HTML and creates stable per-action outbox identities', () => {
    expect(escapeTelegramHtml('<script>&"')).toBe('&lt;script&gt;&amp;&quot;');
    expect(attendanceTelegramOutboxId('ATT_01', 'CHECK_IN')).toBe(attendanceTelegramOutboxId('ATT_01', 'CHECK_IN'));
    expect(attendanceTelegramOutboxId('ATT_01', 'CHECK_IN')).not.toBe(attendanceTelegramOutboxId('ATT_01', 'CHECK_OUT'));
    expect(attendanceTelegramOutboxId('ATT_01', 'SHIFT_LOCATION', 'OUT:1')).not.toBe(attendanceTelegramOutboxId('ATT_01', 'SHIFT_LOCATION', 'OUT:2'));
  });

  it('builds one server-owned attendance alert without client recipients', () => {
    const record = createAttendanceTelegramOutboxRecord({
      attendanceId: 'ATT_STAFF_20260828', action: 'CHECK_IN', staffId: 'STAFF', staffName: 'An',
      branchId: 'PH109', branchName: 'PhoneHouse 109', scheduledStart: '08:00', actualTime: '08:11',
      lateMinutes: 6, distanceMeters: 120, radiusMeters: 50, violations: ['LATE', 'OUTSIDE_GEOFENCE']
    });
    expect(record).toMatchObject({
      eventType: 'ATTENDANCE_EXCEPTION', destination: 'PRIMARY_GROUP', status: 'PENDING', attempts: 0,
      violations: ['LATE', 'OUTSIDE_GEOFENCE']
    });
    expect(record).not.toHaveProperty('chatId');
    expect(record).not.toHaveProperty('token');
    expect(record).not.toHaveProperty('scheduledEnd');
  });

  it('reports disconnected instead of a false-positive when production variables are missing', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect(telegramIsConfigured()).toBe(false);
    await expect(getTelegramRuntimeStatus()).resolves.toMatchObject({
      configured: false,
      connected: false,
      missing: expect.arrayContaining(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_WEBHOOK_SECRET'])
    });
  });

  it('stores Bot token and webhook secret encrypted when configured from CRM', async () => {
    process.env.CHANNEL_TOKEN_ENCRYPTION_KEY = 'phonehouse-telegram-config-encryption-key-2026';
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    let stored: Record<string, any> | null = null;
    const ref = {
      get: async () => ({ exists: Boolean(stored), data: () => stored }),
      set: async (value: Record<string, any>) => { stored = value; },
      delete: async () => { stored = null; }
    };
    const db: any = { collection: (name: string) => {
      expect(name).toBe('telegramConfigurations');
      return { doc: (id: string) => { expect(id).toBe('primary'); return ref; } };
    } };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/getMe')) return new Response(JSON.stringify({ ok: true, result: { username: 'PhoneHouseBot' } }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/getChat')) return new Response(JSON.stringify({ ok: true, result: { id: -1001234567890, type: 'supergroup', title: 'PhoneHouse' } }), { status: 200, headers: { 'content-type': 'application/json' } });
      throw new Error('UNEXPECTED_TELEGRAM_METHOD');
    }));
    const token = '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdef';
    const result = await saveTelegramConfiguration(db, {
      botToken: token,
      chatId: '-1001234567890',
      ownerUserIds: '111222333, 444555666',
      alertsEnabled: true,
      queriesEnabled: true
    }, { uid: 'ADMIN_UID', name: 'Admin' });
    expect(result).toMatchObject({ source: 'DATABASE', hasBotToken: true, hasWebhookSecret: true, chatId: '-1001234567890' });
    expect(stored).toMatchObject({
      encryptedBotToken: { algorithm: 'aes-256-gcm' },
      encryptedWebhookSecret: { algorithm: 'aes-256-gcm' },
      ownerUserIds: ['111222333', '444555666']
    });
    expect(JSON.stringify(stored)).not.toContain(token);
    clearTelegramConfigCache();
    const loaded = await loadTelegramConfig(db, true);
    expect(loaded.token).toBe(token);
    expect(loaded.webhookSecret).toHaveLength(64);
  });
});
