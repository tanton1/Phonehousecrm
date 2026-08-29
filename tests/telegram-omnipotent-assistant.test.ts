import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  answerTelegramQuery,
  clearTelegramConfigCache,
  parseTelegramIntent,
  renderMainMenuKeyboard,
  renderRevenueMenuKeyboard,
  telegramHelpText,
  telegramMenuText
} from '../server/services/telegramService';
import {
  toolGetRevenueReport,
  toolLookupImei,
  toolCheckInventory,
  toolGetTechnicalProgress,
  toolLookupCustomer,
  toolGetCashflowSummary,
  toolGetAttendanceToday
} from '../server/services/telegramAiAssistant';

const ORIGINAL_ENV = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  TELEGRAM_ALERTS_ENABLED: process.env.TELEGRAM_ALERTS_ENABLED,
  TELEGRAM_QUERIES_ENABLED: process.env.TELEGRAM_QUERIES_ENABLED,
  TELEGRAM_OWNER_USER_IDS: process.env.TELEGRAM_OWNER_USER_IDS,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY
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

describe('Telegram Omnipotent Assistant Intent Parsing & Tools', () => {
  it('parses direct commands and natural queries for all business modules', () => {
    // Menu & Help
    expect(parseTelegramIntent('/menu')).toEqual({ kind: 'MENU' });
    expect(parseTelegramIntent('/help')).toEqual({ kind: 'HELP' });

    // Revenue
    expect(parseTelegramIntent('/doanhso homnay PH109')).toMatchObject({
      kind: 'REVENUE',
      period: 'TODAY',
      branchToken: 'ph109'
    });
    expect(parseTelegramIntent('/baocao thang all')).toMatchObject({
      kind: 'REVENUE',
      period: 'MONTH',
      all: true
    });

    // IMEI
    expect(parseTelegramIntent('/imei 356789012345678')).toEqual({
      kind: 'IMEI',
      imei: '356789012345678'
    });

    // Technical
    expect(parseTelegramIntent('/kythuat Cầu Giấy')).toMatchObject({
      kind: 'TECHNICAL',
      branchToken: 'cau giay'
    });

    // Inventory
    expect(parseTelegramIntent('/tonkho 15 Pro Max')).toMatchObject({
      kind: 'INVENTORY'
    });

    // Customer & CRM
    expect(parseTelegramIntent('/khachhang 0988123456')).toEqual({
      kind: 'CUSTOMER',
      query: '0988123456'
    });

    // Cashbook
    expect(parseTelegramIntent('/soquy homnay')).toEqual({
      kind: 'CASHBOOK',
      period: 'TODAY'
    });
    expect(parseTelegramIntent('/quy thang')).toEqual({
      kind: 'CASHBOOK',
      period: 'MONTH'
    });

    // Attendance
    expect(parseTelegramIntent('/nhansu PH109')).toMatchObject({
      kind: 'ATTENDANCE',
      branchToken: 'ph109'
    });

    // AI Direct
    expect(parseTelegramIntent('/ai Tư vấn cách tối ưu chi phí linh kiện')).toEqual({
      kind: 'AI',
      query: 'Tư vấn cách tối ưu chi phí linh kiện'
    });

    // Natural conversation fallback to AI
    expect(parseTelegramIntent('Shop Cầu Giấy hôm nay bán được mấy cây iPhone?')).toEqual({
      kind: 'AI',
      query: 'Shop Cầu Giấy hôm nay bán được mấy cây iPhone?'
    });
  });

  it('renders interactive inline keyboards for quick menus', () => {
    const mainKey = renderMainMenuKeyboard();
    expect(mainKey.inline_keyboard.length).toBeGreaterThanOrEqual(3);
    expect(mainKey.inline_keyboard[0][0]).toMatchObject({ text: '💰 Doanh Số', callback_data: 'menu:revenue' });
    expect(mainKey.inline_keyboard[0][1]).toMatchObject({ text: '📦 Tồn Kho', callback_data: 'menu:inventory' });

    const revKey = renderRevenueMenuKeyboard();
    expect(revKey.inline_keyboard[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callback_data: 'revenue:today' }),
        expect.objectContaining({ callback_data: 'revenue:week' }),
        expect.objectContaining({ callback_data: 'revenue:month' })
      ])
    );
  });

  it('enforces RBAC for sensitive Cashflow & System-wide revenue queries', async () => {
    process.env.TELEGRAM_OWNER_USER_IDS = '123456789';
    process.env.TELEGRAM_BOT_TOKEN = '123456789:ABCDEF_mock_token';
    process.env.TELEGRAM_CHAT_ID = '-1001234567890';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'a'.repeat(32);

    const mockDb: any = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(() => ({ get: async () => ({ docs: [] }) })) })),
        limit: vi.fn(() => ({ get: async () => ({ docs: [] }) }))
      })),
      getAll: vi.fn(async () => [])
    };

    // Non-owner query for cashbook
    const nonOwnerCash = await toolGetCashflowSummary(mockDb, { period: 'TODAY' }, '999999999');
    expect(nonOwnerCash).toContain('⛔ BẢO MẬT');

    // Owner query for cashbook
    const ownerCash = await toolGetCashflowSummary(mockDb, { period: 'TODAY' }, '123456789');
    expect(ownerCash).toContain('BÁO CÁO TÀI CHÍNH & SỔ QUỸ');

    // Non-owner query for all-system revenue
    const nonOwnerRev = await toolGetRevenueReport(mockDb, { period: 'TODAY', all: true }, '999999999');
    expect(nonOwnerRev).toContain('⛔ Quyền riêng tư');
  });

  it('executes customer lookup tool properly', async () => {
    const mockDb: any = {
      collection: vi.fn((col) => {
        if (col === 'customers') {
          return {
            limit: vi.fn(() => ({
              get: async () => ({
                docs: [
                  {
                    id: 'CUST_01',
                    data: () => ({
                      name: 'Nguyễn Văn A',
                      phone: '0988123456',
                      totalSpent: 45000000,
                      customerTier: 'VIP VÀNG',
                      debtAmount: 0
                    })
                  }
                ]
              })
            }))
          };
        }
        return {
          limit: vi.fn(() => ({ get: async () => ({ docs: [] }) }))
        };
      })
    };

    const res = await toolLookupCustomer(mockDb, { phoneOrName: '0988123456' });
    expect(res).toContain('HỒ SƠ KHÁCH HÀNG: Nguyễn Văn A');
    expect(res).toContain('45.000.000 đ');
    expect(res).toContain('VIP VÀNG');
  });

  it('executes attendance overview tool properly', async () => {
    const mockDb: any = {
      collection: vi.fn((col) => {
        if (col === 'branches') {
          return {
            limit: vi.fn(() => ({
              get: async () => ({
                docs: [
                  { id: 'PH109', data: () => ({ name: 'PhoneHouse Cầu Giấy', code: 'PH109' }) }
                ]
              })
            }))
          };
        }
        if (col === 'attendance') {
          return {
            where: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(() => ({
                  get: async () => ({
                    docs: [
                      { id: 'ATT_1', data: () => ({ staffName: 'Trần Văn B', attendanceStatus: 'CHECKED_IN', lateMinutes: 10, shiftName: 'Ca sáng' }) }
                    ]
                  })
                }))
              })),
              limit: vi.fn(() => ({
                get: async () => ({
                  docs: [
                    { id: 'ATT_1', data: () => ({ staffName: 'Trần Văn B', attendanceStatus: 'CHECKED_IN', lateMinutes: 10, shiftName: 'Ca sáng' }) }
                  ]
                })
              }))
            }))
          };
        }
        return {
          limit: vi.fn(() => ({ get: async () => ({ docs: [] }) }))
        };
      })
    };

    const res = await toolGetAttendanceToday(mockDb, { branchQuery: 'PH109' });
    expect(res).toContain('TÌNH HÌNH CHẤM CÔNG HÔM NAY');
    expect(res).toContain('Trần Văn B');
    expect(res).toContain('Trễ 10 phút');
  });

  it('handles help and menu answers correctly with replyMarkup', async () => {
    const mockDb: any = {};
    const helpRes = await answerTelegramQuery(mockDb, '/help', '123456789');
    expect(helpRes.intent).toBe('HELP');
    expect(helpRes.reply).toContain('PHONEHOUSE AI COPILOT');
    expect(helpRes.replyMarkup).toBeDefined();

    const menuRes = await answerTelegramQuery(mockDb, '/menu', '123456789');
    expect(menuRes.intent).toBe('MENU');
    expect(menuRes.reply).toContain('BẢNG ĐIỀU KHIỂN PHONEHOUSE AI');
    expect(menuRes.replyMarkup).toBeDefined();
  });
});
