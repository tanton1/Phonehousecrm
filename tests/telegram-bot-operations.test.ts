import { afterEach, describe, expect, it } from 'vitest';
import {
  attendanceTelegramOutboxId,
  createAttendanceTelegramOutboxRecord,
  escapeTelegramHtml,
  getTelegramRuntimeStatus,
  parseTelegramIntent,
  telegramIsConfigured
} from '../server/services/telegramService';

const ORIGINAL_ENV = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  TELEGRAM_ALERTS_ENABLED: process.env.TELEGRAM_ALERTS_ENABLED,
  TELEGRAM_QUERIES_ENABLED: process.env.TELEGRAM_QUERIES_ENABLED
};

afterEach(() => {
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
});
