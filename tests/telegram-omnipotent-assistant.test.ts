import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  answerTelegramQuery,
  clearTelegramConfigCache,
  parseTelegramIntent,
  renderCrmMenuKeyboard,
  renderMainMenuKeyboard,
  renderRevenueMenuKeyboard,
  telegramHelpText,
  telegramMenuText
} from '../server/services/telegramService';
import {
  toolGetRevenueReport,
  toolLookupImei,
  toolCheckInventory,
  toolGetRetailRepairQueue,
  toolGetTechnicalProgress,
  toolLookupCustomer,
  toolGetCashflowSummary,
  toolGetAttendanceToday,
  toolGetTopSellingProducts,
  toolGetAgingInventory,
  toolGetStaffPerformance,
  toolGetDebtReport,
  testGeminiConnection,
  isOpenAiCompatible,
  resolveBaseUrl,
  findBranchMatch,
  resolveBranchMatch,
  formatVietnamNow,
  resolveDateRange
} from '../server/services/telegramAiAssistant';
import { getVietnamDayUtcRange } from '../shared/vietnamTime';

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
    expect(parseTelegramIntent('/chinhanh')).toEqual({ kind: 'BRANCHES' });
    expect(parseTelegramIntent('@trolyAlphonehouse_bot chi nhánh')).toEqual({ kind: 'BRANCHES' });
    expect(parseTelegramIntent('@trolyAlphonehouse_bot CN-02')).toEqual({ kind: 'BRANCH_CONFIRM', branchToken: 'cn-02' });

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
    expect(parseTelegramIntent('/doanhso hôm qua PH 109')).toMatchObject({
      kind: 'REVENUE',
      period: 'YESTERDAY',
      branchToken: 'ph 109',
      all: false
    });
    expect(parseTelegramIntent('/doanhso 28/08/2026 Phone House - 109 Hàm Nghi')).toMatchObject({
      kind: 'REVENUE',
      period: 'CUSTOM',
      date: '28/08/2026',
      branchToken: 'phone house - 109 ham nghi'
    });
    expect(parseTelegramIntent('/doanhso tuần trước XStore')).toMatchObject({
      kind: 'REVENUE',
      period: 'LAST_WEEK',
      branchToken: 'xstore'
    });
    expect(parseTelegramIntent('@trolyAlphonehouse_bot doanh số PH 109 tuần này')).toMatchObject({
      kind: 'REVENUE',
      period: 'WEEK',
      branchToken: 'ph 109',
      all: false
    });
    expect(parseTelegramIntent('@trolyAlphonehouse_bot doanh số CN-02 tuần này')).toMatchObject({
      kind: 'REVENUE',
      period: 'WEEK',
      branchToken: 'cn-02',
      all: false
    });
    expect(parseTelegramIntent('@trolyAlphonehouse_bot doanh thu Xstore ĐN hôm nay')).toMatchObject({
      kind: 'REVENUE',
      period: 'TODAY',
      branchToken: 'xstore dn',
      all: false
    });
    expect(parseTelegramIntent('@trolyAlphonehouse_bot tồn kho CN-02 chi tiết IMEI')).toMatchObject({
      kind: 'INVENTORY',
      branchToken: expect.stringContaining('cn-02'),
      includeImeis: true,
      all: false
    });
    expect(parseTelegramIntent('@trolyAlphonehouse_bot tồn kho iPhone 15 Pro Max 256GB CN-02 danh sách IMEI')).toMatchObject({
      kind: 'INVENTORY', model: '15 pro max 256gb', includeImeis: true
    });
    expect(parseTelegramIntent('@trolyAlphonehouse_bot máy bảo hành CN-02 đang xử lý chi tiết IMEI')).toMatchObject({
      kind: 'RETAIL_REPAIRS', repairType: 'WARRANTY', includeImeis: true, all: false
    });
    expect(parseTelegramIntent('@trolyAlphonehouse_bot máy sửa lẻ Xstore hôm nay')).toMatchObject({
      kind: 'RETAIL_REPAIRS', repairType: 'CUSTOMER_SERVICE', period: 'TODAY', all: false
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
    expect(parseTelegramIntent('@trolyAlphonehouse_bot lead mới CN-02 tháng này')).toMatchObject({
      kind: 'CRM_PIPELINE', branchToken: 'cn-02', period: 'MONTH'
    });
    expect(parseTelegramIntent('@trolyAlphonehouse_bot khách cần gọi lại CN-02')).toMatchObject({
      kind: 'CRM_WORK_QUEUE', branchToken: 'cn-02'
    });
    expect(parseTelegramIntent('@trolyAlphonehouse_bot tra cứu khách 0988123456')).toEqual({
      kind: 'CUSTOMER', query: '0988123456'
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
    expect(mainKey.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      expect.objectContaining({ callback_data: 'menu:crm' })
    ]));

    const crmKey = renderCrmMenuKeyboard();
    expect(crmKey.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      expect.objectContaining({ callback_data: 'crm:pipeline:today' }),
      expect.objectContaining({ callback_data: 'crm:pipeline:month' }),
      expect.objectContaining({ callback_data: 'crm:work-queue' })
    ]));

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
    expect(res).toContain('TÌNH HÌNH CHẤM CÔNG');
    expect(res).toContain('HÔM NAY');
    expect(res).toContain('Trần Văn B');
    expect(res).toContain('Trễ 10 phút');
  });

  it('generates deep executive insights for top selling products and aging inventory', async () => {
    const createQueryChain = (docs: any[]) => {
      const chain: any = {
        where: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        get: async () => ({ docs, size: docs.length })
      };
      return chain;
    };

    const mockDb: any = {
      collection: vi.fn((col) => {
        if (col === 'invoices') {
          return createQueryChain([
            { data: () => ({ sellerName: 'Nguyễn Văn A', totalAmount: 90000000, items: [{ model: 'iPhone 15 Pro Max 256GB', quantity: 3, price: 30000000 }], createdAtIso: new Date().toISOString() }) },
            { data: () => ({ sellerName: 'Lê Thị B', totalAmount: 60000000, items: [{ model: 'iPhone 13 128GB', quantity: 5, price: 12000000 }], createdAtIso: new Date().toISOString() }) }
          ]);
        }
        if (col === 'devices') {
          return createQueryChain([
            { id: 'DEV_1', data: () => ({ model: 'iPhone 12', storage: '64GB', color: 'Black', importDate: '2025-01-01T00:00:00Z' }) },
            { id: 'DEV_2', data: () => ({ model: 'iPhone 12', storage: '64GB', color: 'Black', importDate: '2025-01-01T00:00:00Z' }) }
          ]);
        }
        if (col === 'customers') {
          return {
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: async () => ({
                  docs: [
                    { id: 'CUST_1', data: () => ({ name: 'Công ty TNHH X', phone: '0912345678', debtAmount: 45000000 }) }
                  ]
                })
              }))
            }))
          };
        }
        if (col === 'branches') {
          return {
            limit: vi.fn(() => ({ get: async () => ({ docs: [] }) }))
          };
        }
        return {
          limit: vi.fn(() => ({ get: async () => ({ docs: [] }) }))
        };
      })
    };

    // Top selling
    const topRes = await toolGetTopSellingProducts(mockDb, { period: 'TODAY' });
    expect(topRes).toContain('TOP SẢN PHẨM BÁN CHẠY NHẤT');
    expect(topRes).toContain('iPhone 13 128GB');

    // Aging inventory
    const agingRes = await toolGetAgingInventory(mockDb, { daysThreshold: 30 });
    expect(agingRes).toContain('CẢNH BÁO TỒN KHO LÂU NGÀY');
    expect(agingRes).toContain('iPhone 12');

    // Staff performance
    const staffRes = await toolGetStaffPerformance(mockDb, { period: 'TODAY' });
    expect(staffRes).toContain('BẢNG XẾP HẠNG HIỆU SUẤT SALE');
    expect(staffRes).toContain('Nguyễn Văn A');

    // Debt report (Owner)
    process.env.TELEGRAM_OWNER_USER_IDS = '123456789';
    clearTelegramConfigCache();
    const debtRes = await toolGetDebtReport(mockDb, {}, '123456789');
    expect(debtRes).toContain('BÁO CÁO CÔNG NỢ KHÁCH HÀNG CẦN THU HỒI');
    expect(debtRes).toContain('Công ty TNHH X');
  });

  it('validates testGeminiConnection with empty key', async () => {
    delete process.env.GEMINI_API_KEY;
    clearTelegramConfigCache();
    const res = await testGeminiConnection('');
    expect(res.success).toBe(false);
    expect(res.error).toBe('GEMINI_API_KEY_EMPTY');
  });

  it('correctly identifies OpenAI-compatible proxy keys like apikey.fun and resolves baseUrls', () => {
    expect(isOpenAiCompatible('sk-1234567890abcdef')).toBe(true);
    expect(isOpenAiCompatible('fun-1234567890abcdef')).toBe(true);
    expect(isOpenAiCompatible('AIzaSyCustomKey', 'https://api.apikey.fun/v1')).toBe(true);
    expect(isOpenAiCompatible('AIzaSyCustomKey', '')).toBe(false);

    expect(resolveBaseUrl('')).toBe('https://api.apikey.fun/v1');
    expect(resolveBaseUrl('https://api.apikey.fun/v1/')).toBe('https://api.apikey.fun/v1');
    expect(resolveBaseUrl('https://custom-proxy.com/v1')).toBe('https://custom-proxy.com/v1');
  });

  it('tests connection against OpenAI compatible proxy endpoint with fetch mock', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: 'PhoneHouse AI Connected' } }
        ]
      })
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await testGeminiConnection('sk-test-apikey-fun', 'https://api.apikey.fun/v1', 'gemini-3.7-flash');
    expect(res.success).toBe(true);
    expect(res.model).toBe('gemini-3.7-flash');
    expect(fetchMock).toHaveBeenCalled();
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

  it('accurately resolves branch matching across diverse real-world queries', () => {
    const sampleBranches = [
      { id: 'PH109', name: 'PhoneHouse 109 Cầu Giấy', code: 'PH109', shortName: 'Cầu Giấy', address: '109 Cầu Giấy, Quan Hoa, Hà Nội' },
      { id: 'PH245', name: 'PhoneHouse 245 Xã Đàn', code: 'PH245', shortName: 'Xã Đàn', address: '245 Xã Đàn, Nam Đồng, Đống Đa' },
      { id: 'PH86', name: 'PhoneHouse 86 Trần Đại Nghĩa', code: 'PH86', shortName: 'Trần Đại Nghĩa', address: '86 Trần Đại Nghĩa, Hai Bà Trưng' },
      { id: 'PH_HD', name: 'PhoneHouse Hà Đông', code: 'PH_HD', shortName: 'Hà Đông', address: 'Quang Trung, Hà Đông' }
    ];

    // Exact ID / Code
    expect(findBranchMatch(sampleBranches, 'PH109')?.id).toBe('PH109');
    expect(findBranchMatch(sampleBranches, 'ph245')?.id).toBe('PH245');
    expect(findBranchMatch(sampleBranches, 'PH 109')?.id).toBe('PH109');

    // Number tokens
    expect(findBranchMatch(sampleBranches, '109')?.id).toBe('PH109');
    expect(findBranchMatch(sampleBranches, '245')?.id).toBe('PH245');
    expect(findBranchMatch(sampleBranches, '86')?.id).toBe('PH86');

    // Street / Name tokens
    expect(findBranchMatch(sampleBranches, 'Cầu Giấy')?.id).toBe('PH109');
    expect(findBranchMatch(sampleBranches, 'Xã Đàn')?.id).toBe('PH245');
    expect(findBranchMatch(sampleBranches, 'Trần Đại Nghĩa')?.id).toBe('PH86');
    expect(findBranchMatch(sampleBranches, 'Hà Đông')?.id).toBe('PH_HD');
    expect(findBranchMatch(sampleBranches, 'PhoneHouse - 109 Cầu Giấy')?.id).toBe('PH109');
    expect(findBranchMatch([
      { id: 'BR_PH', name: 'PhoneHouse Đà Nẵng - 109 Hàm Nghi', code: 'PH109', address: '109 Hàm Nghi, Đà Nẵng' }
    ], 'Phone House 109 Hàm Nghi')?.id).toBe('BR_PH');

    // Conversational query
    expect(findBranchMatch(sampleBranches, 'báo cáo chi nhánh Cầu Giấy hôm nay')?.id).toBe('PH109');
    expect(findBranchMatch(sampleBranches, 'xem tồn kho bên cơ sở 245 Xã Đàn')?.id).toBe('PH245');
    expect(findBranchMatch(sampleBranches, 'doanh số của 86 trần đại nghĩa')?.id).toBe('PH86');

    // All system
    expect(findBranchMatch(sampleBranches, 'toàn hệ thống')).toBeNull();
    expect(findBranchMatch(sampleBranches, 'all')).toBeNull();
    expect(findBranchMatch(sampleBranches, 'tất cả chi nhánh')).toBeNull();

    const productionBranches = [
      { id: 'BR_XSTORE', name: 'Xstore ĐN', code: 'CN-03', address: 'Đà Nẵng' },
      { id: 'BR_TONG', name: 'TỔNG', code: 'CN-01' },
      { id: 'BR_PH109', name: 'PH 109', code: 'CN-02', address: '109 Hàm Nghi, Đà Nẵng' }
    ];
    expect(findBranchMatch(productionBranches, 'CN-02')?.id).toBe('BR_PH109');
    expect(findBranchMatch(productionBranches, 'cn2')?.id).toBe('BR_PH109');
    expect(findBranchMatch(productionBranches, 'PH109')?.id).toBe('BR_PH109');
    expect(findBranchMatch(productionBranches, '109 Hàm Nghi')?.id).toBe('BR_PH109');
    expect(findBranchMatch(productionBranches, 'Xstore')?.id).toBe('BR_XSTORE');
    expect(findBranchMatch(productionBranches, 'tổng')?.id).toBe('BR_TONG');
  });

  it('returns detailed inventory IMEIs and canonical warranty/service work orders', async () => {
    const branches = [{ id: 'BR_PH109', name: 'PH 109', code: 'CN-02', address: '109 Hàm Nghi' }];
    const query = (docs: any[]) => {
      const chain: any = {
        where: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        get: async () => ({ docs })
      };
      return chain;
    };
    const deviceDocs = [
      { id: 'DEV_1', data: () => ({ imei: '356789012345678', model: 'iPhone 15 Pro Max', storage: '256GB', condition: 'Like New 99%', batteryHealth: 98, sellPrice: 25_000_000, currentLocationName: 'Kho PH 109' }) },
      { id: 'DEV_2', data: () => ({ imei: '356789012345679', model: 'iPhone 13', storage: '128GB', condition: '98%', batteryHealth: 90, sellPrice: 12_000_000, currentLocationName: 'Kho PH 109' }) }
    ];
    const workOrderDocs = [
      { id: 'WO_WARRANTY', data: () => ({ code: 'WO-001', branchId: 'BR_PH109', workOrderType: 'WARRANTY', status: 'IN_PROGRESS', imei: '356789012345670', model: 'iPhone 14 Pro', customerName: 'Anh A', currentCustodianName: 'KTV Tuấn', receivedAt: '2026-08-29T03:00:00.000Z' }) },
      { id: 'WO_SERVICE', data: () => ({ code: 'WO-002', branchId: 'BR_PH109', workOrderType: 'CUSTOMER_SERVICE', status: 'WAITING_PARTS', imei: '356789012345671', model: 'iPhone 12', customerName: 'Chị B', currentCustodianName: 'KTV Nam', receivedAt: '2026-08-29T04:00:00.000Z' }) }
    ];
    const mockDb: any = {
      collection: vi.fn((name: string) => {
        if (name === 'branches') return { limit: () => ({ get: async () => ({ docs: branches.map(branch => ({ id: branch.id, data: () => branch })) }) }) };
        if (name === 'devices') return query(deviceDocs);
        if (name === 'technicalWorkOrders') return query(workOrderDocs);
        throw new Error(`UNEXPECTED_COLLECTION_${name}`);
      })
    };

    const inventory = await toolCheckInventory(mockDb, { branchQuery: 'CN-02', modelQuery: '15 pro max 256gb', includeImeis: true }, 'OWNER');
    expect(inventory).toContain('Danh sách IMEI chi tiết');
    expect(inventory).toContain('356789012345678');
    expect(inventory).toContain('Like New 99%');
    expect(inventory).not.toContain('356789012345679');

    const warranty = await toolGetRetailRepairQueue(mockDb, { branchQuery: 'CN-02', repairType: 'WARRANTY', includeImeis: true }, 'OWNER');
    expect(warranty).toContain('BẢO HÀNH ĐANG XỬ LÝ');
    expect(warranty).toContain('356789012345670');
    expect(warranty).not.toContain('356789012345671');

    const service = await toolGetRetailRepairQueue(mockDb, { branchQuery: 'CN-02', repairType: 'CUSTOMER_SERVICE', includeImeis: true }, 'OWNER');
    expect(service).toContain('SỬA LẺ ĐANG XỬ LÝ');
    expect(service).toContain('356789012345671');
  });

  it('lists accepted branch aliases and confirms a bare branch code without AI', async () => {
    const branches = [
      { id: 'BR_XSTORE', name: 'Xstore ĐN', code: 'CN-03', address: 'Đà Nẵng' },
      { id: 'BR_TONG', name: 'TỔNG', code: 'CN-01' },
      { id: 'BR_PH109', name: 'PH 109', code: 'CN-02', address: '109 Hàm Nghi, Đà Nẵng' }
    ];
    let storedPreference: Record<string, any> | null = null;
    const mockDb: any = {
      collection: vi.fn((name: string) => {
        if (name === 'branches') {
          return { limit: () => ({ get: async () => ({ docs: branches.map(branch => ({ id: branch.id, data: () => branch })) }) }) };
        }
        if (name === 'telegramUserPreferences') {
          return { doc: () => ({
            get: async () => ({ exists: Boolean(storedPreference), data: () => storedPreference }),
            set: async (value: Record<string, any>) => { storedPreference = value; }
          }) };
        }
        if (name === 'executiveDailyAggregates') return { doc: (id: string) => ({ id }) };
        throw new Error(`UNEXPECTED_COLLECTION_${name}`);
      }),
      getAll: async () => [{ exists: true, data: () => ({ revenue: 12_000_000, invoiceCount: 2 }) }]
    };
    const list = await answerTelegramQuery(mockDb, '@trolyAlphonehouse_bot chi nhánh', 'OWNER');
    expect(list.intent).toBe('BRANCHES');
    expect(list.reply).toContain('CN-02');
    expect(list.reply).toContain('PH 109');
    expect(list.replyMarkup).toEqual(expect.objectContaining({
      inline_keyboard: expect.arrayContaining([
        expect.arrayContaining([expect.objectContaining({ callback_data: 'branch:CN-02' })])
      ])
    }));

    const explicitRevenue = await answerTelegramQuery(mockDb, '/doanhso hôm nay CN-02', 'OWNER');
    expect(explicitRevenue.reply).toContain('PH 109');
    expect(storedPreference).toMatchObject({ branchId: 'BR_PH109', branchCode: 'CN-02' });

    const confirmation = await answerTelegramQuery(mockDb, '@trolyAlphonehouse_bot CN-02', 'OWNER');
    expect(confirmation.intent).toBe('BRANCH_CONFIRM');
    expect(confirmation.reply).toContain('ĐÃ CHỌN CHI NHÁNH MẶC ĐỊNH');
    expect(confirmation.reply).toContain('PH 109');
    expect(storedPreference).toMatchObject({ branchId: 'BR_PH109', branchCode: 'CN-02', branchName: 'PH 109' });

    const revenue = await answerTelegramQuery(mockDb, '/doanhso hôm nay', 'OWNER');
    expect(revenue.intent).toBe('REVENUE');
    expect(revenue.reply).toContain('PH 109');
    expect(revenue.reply).toContain('12.000.000 đ');
  });

  it('fails safely when a branch query is ambiguous or unknown', async () => {
    const branches = [
      { id: 'HN_01', name: 'PhoneHouse Nguyễn Trãi Hà Nội', code: 'HN01', shortName: 'Nguyễn Trãi', address: '100 Nguyễn Trãi, Hà Nội' },
      { id: 'HCM_01', name: 'PhoneHouse Nguyễn Trãi TP.HCM', code: 'HCM01', shortName: 'Nguyễn Trãi', address: '200 Nguyễn Trãi, TP.HCM' }
    ];
    const resolution = resolveBranchMatch(branches, 'Nguyễn Trãi');
    expect(resolution.status).toBe('AMBIGUOUS');
    expect(resolution.candidates).toHaveLength(2);

    const collection = vi.fn((name: string) => {
      if (name === 'branches') {
        return { limit: () => ({ get: async () => ({ docs: branches.map(branch => ({ id: branch.id, data: () => branch })) }) }) };
      }
      throw new Error(`UNEXPECTED_COLLECTION_${name}`);
    });
    const reply = await toolCheckInventory({ collection } as any, { branchQuery: 'chi nhánh không tồn tại' }, 'OWNER');
    expect(reply).toContain('Không tìm thấy chi nhánh');
    expect(collection).not.toHaveBeenCalledWith('devices');
  });

  it('queries invoice fallback with exact Vietnam UTC day boundaries', async () => {
    const whereCalls: Array<[string, string, string]> = [];
    const invoiceQuery: any = {
      where: vi.fn((field: string, op: string, value: string) => {
        whereCalls.push([field, op, value]);
        return invoiceQuery;
      }),
      limit: vi.fn(() => invoiceQuery),
      get: async () => ({ docs: [] })
    };
    const mockDb: any = {
      collection: vi.fn((name: string) => {
        if (name === 'branches') {
          return { limit: () => ({ get: async () => ({ docs: [{ id: 'PH109', data: () => ({ name: 'Phone House - 109 Hàm Nghi', code: 'PH 109' }) }] }) }) };
        }
        if (name === 'executiveDailyAggregates') return { doc: (id: string) => ({ id }) };
        if (name === 'invoices') return invoiceQuery;
        throw new Error(`UNEXPECTED_COLLECTION_${name}`);
      }),
      getAll: async () => [{ exists: false }]
    };

    const reply = await toolGetRevenueReport(mockDb, { date: '29/08/2026', branchQuery: 'PH109' }, 'OWNER');
    expect(whereCalls).toEqual(expect.arrayContaining([
      ['createdAtIso', '>=', '2026-08-28T17:00:00.000Z'],
      ['createdAtIso', '<=', '2026-08-29T16:59:59.999Z'],
      ['branchId', '==', 'PH109']
    ]));
    expect(reply).toContain('29/08/2026');
    expect(reply).toContain('(GMT+7)');
  });

  it('accurately resolves date ranges for yesterday, week, last week, month, and specific dates', () => {
    // Specific date
    const spec = resolveDateRange({ date: '2026-08-28' });
    expect(spec.dates).toEqual(['2026-08-28']);
    expect(spec.label).toContain('28/08/2026');

    // Yesterday
    const yest = resolveDateRange({ period: 'YESTERDAY' });
    expect(yest.dates.length).toBe(1);
    expect(yest.label).toContain('HÔM QUA');

    // Today
    const today = resolveDateRange({ period: 'TODAY' });
    expect(today.dates.length).toBe(1);
    expect(today.label).toContain('HÔM NAY');

    // This week & last week
    const week = resolveDateRange({ period: 'WEEK' });
    expect(week.dates.length).toBeGreaterThanOrEqual(1);

    const lastWeek = resolveDateRange({ period: 'LAST_WEEK' });
    expect(lastWeek.dates.length).toBe(7);

    // This month & last month
    const month = resolveDateRange({ period: 'MONTH' });
    expect(month.dates.length).toBeGreaterThanOrEqual(1);

    const lastMonth = resolveDateRange({ period: 'LAST_MONTH' });
    expect(lastMonth.dates.length).toBeGreaterThanOrEqual(28);
    expect(getVietnamDayUtcRange('2026-08-29')).toEqual({
      startUtc: '2026-08-28T17:00:00.000Z',
      endUtc: '2026-08-29T16:59:59.999Z'
    });
    expect(formatVietnamNow(new Date('2026-08-29T07:32:10.000Z'))).toContain('14:32:10');
    expect(formatVietnamNow(new Date('2026-08-29T07:32:10.000Z'))).toContain('(GMT+7)');
  });
});
