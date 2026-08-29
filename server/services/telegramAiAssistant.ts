import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { Firestore } from 'firebase-admin/firestore';
import { getVietnamDateString, getVietnamDayUtcRange } from '../../shared/vietnamTime';
import { getDeviceLifecycleTimeline } from './deviceLifecycleService';
import { deriveTechnicalBoardStage } from './technicalService';
import { getTelegramConfig, escapeTelegramHtml, TelegramConfig } from './telegramService';

let cachedAiClient: { client: GoogleGenAI; key: string } | null = null;

export function isOpenAiCompatible(apiKey: string, baseUrl?: string): boolean {
  if (baseUrl && baseUrl.trim().length > 0) return true;
  if (apiKey.startsWith('sk-') || apiKey.startsWith('fun-') || apiKey.includes('apikey.fun')) return true;
  return false;
}

export function resolveBaseUrl(baseUrl?: string): string {
  const trimmed = String(baseUrl || '').trim();
  if (trimmed) return trimmed.replace(/\/+$/, '');
  return 'https://api.apikey.fun/v1';
}

export function convertGoogleDeclarationsToOpenAiTools(declarations: FunctionDeclaration[]) {
  return declarations.map(decl => ({
    type: 'function',
    function: {
      name: decl.name,
      description: decl.description,
      parameters: decl.parameters || { type: 'object', properties: {} }
    }
  }));
}

export function getAI(configOverride?: TelegramConfig): GoogleGenAI | null {
  const config = configOverride || getTelegramConfig();
  const apiKey = String(config.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;

  if (cachedAiClient && cachedAiClient.key === apiKey) {
    return cachedAiClient.client;
  }

  try {
    const client = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'phonehouse-telegram-copilot' } }
    });
    cachedAiClient = { client, key: apiKey };
    return client;
  } catch (e) {
    console.warn('[Telegram AI Assistant] Failed to initialize GoogleGenAI:', e);
    return null;
  }
}

export async function testGeminiConnection(
  apiKey?: string,
  baseUrlOverride?: string,
  modelOverride?: string
): Promise<{ success: boolean; model?: string; error?: string }> {
  const config = getTelegramConfig();
  const key = String(apiKey || config.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
  const baseUrl = String(baseUrlOverride !== undefined ? baseUrlOverride : (config.geminiBaseUrl || process.env.GEMINI_BASE_URL || '')).trim();

  if (!key) return { success: false, error: 'GEMINI_API_KEY_EMPTY' };

  const candidateModels = [
    modelOverride,
    config.aiModel,
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gpt-4o-mini',
    'gpt-4o'
  ].filter(Boolean) as string[];

  // 1. OpenAI-Compatible Proxy (apikey.fun, OneAPI, NewAPI, etc.)
  if (isOpenAiCompatible(key, baseUrl)) {
    const resolvedUrl = resolveBaseUrl(baseUrl);
    let lastErr = 'PROXY_TEST_FAILED';
    for (const model of candidateModels) {
      try {
        const res = await fetch(`${resolvedUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Hello, confirm PhoneHouse AI connection in 3 words.' }],
            max_tokens: 50
          }),
          signal: AbortSignal.timeout(12000)
        });

        if (res.ok) {
          const data: any = await res.json();
          if (data?.choices?.[0]?.message?.content) {
            return { success: true, model };
          }
        } else {
          const errText = await res.text().catch(() => '');
          lastErr = `HTTP ${res.status}: ${errText.slice(0, 150)}`;
        }
      } catch (err: any) {
        lastErr = String(err?.message || 'NETWORK_TIMEOUT');
      }
    }
    return { success: false, error: lastErr };
  }

  // 2. Native Google AI Studio
  const ai = new GoogleGenAI({ apiKey: key });
  let lastError = 'GEMINI_TEST_FAILED';

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: 'Hello, confirm PhoneHouse AI connection in 3 words.' }] }]
      });
      if (response.text) {
        return { success: true, model };
      }
    } catch (err: any) {
      lastError = String(err?.message || 'GEMINI_TEST_FAILED');
    }
  }

  return { success: false, error: lastError };
}

function formatVnd(value: unknown): string {
  const amount = Number(value || 0);
  return `${(Number.isFinite(amount) ? Math.round(amount) : 0).toLocaleString('vi-VN')} đ`;
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9@/_\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value: unknown): string {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
}

type TelegramBranch = {
  id: string;
  name: string;
  code?: string;
  shortName?: string;
  address?: string;
  aliases?: string[];
  telegramAliases?: string[];
};

export type BranchMatchResolution =
  | { status: 'MATCHED'; branch: TelegramBranch; candidates: TelegramBranch[] }
  | { status: 'AMBIGUOUS'; branch: null; candidates: TelegramBranch[] }
  | { status: 'NOT_FOUND'; branch: null; candidates: TelegramBranch[] };

const ALL_BRANCH_ALIASES = new Set([
  'all',
  'toan he thong',
  'tat ca',
  'tong he thong',
  'tat ca chi nhanh',
  'ca chuoi',
  'toan bo',
  'toan chuoi'
]);

const BRANCH_STOP_WORDS = new Set([
  'phone', 'house', 'phonehouse', 'chi', 'nhanh', 'cua', 'hang', 'co', 'so', 'kho',
  'tai', 'ben', 'khu', 'vuc', 'dia', 'chi', 'xem', 'kiem', 'tra', 'bao', 'cao', 'doanh',
  'thu', 'ton', 'may', 'ky', 'thuat', 'nhan', 'su', 'cham', 'cong', 'hom', 'nay', 'qua',
  'tuan', 'thang', 'ngay', 'o', 'cua', 'va', 'the', 'shop', 'viet', 'nam', 'tp', 'thanh',
  'pho', 'quan', 'phuong', 'duong'
]);

export function isAllBranchQuery(query?: string): boolean {
  const normalized = normalizeText(query);
  return ALL_BRANCH_ALIASES.has(normalized)
    || /\b(toan he thong|tat ca chi nhanh|ca chuoi|toan chuoi|toan bo)\b/.test(normalized);
}

function branchAliases(branch: TelegramBranch): string[] {
  const configuredAliases = [
    ...(Array.isArray(branch.aliases) ? branch.aliases : []),
    ...(Array.isArray(branch.telegramAliases) ? branch.telegramAliases : [])
  ];
  const base = [branch.id, branch.code, branch.name, branch.shortName, branch.address, ...configuredAliases]
    .map(normalizeText)
    .filter(Boolean);
  const derived: string[] = [];

  for (const alias of base) {
    derived.push(alias, compactText(alias));
    const withoutBrand = alias
      .replace(/\b(phone house|phonehouse|chi nhanh|cua hang|co so)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (withoutBrand) derived.push(withoutBrand, compactText(withoutBrand));

    const codeMatch = compactText(alias).match(/^([a-z]+)0*(\d+)$/);
    if (codeMatch) {
      derived.push(`${codeMatch[1]}${codeMatch[2]}`, `${codeMatch[1]} ${codeMatch[2]}`, `${codeMatch[1]}-${codeMatch[2]}`);
    }
  }

  return [...new Set(derived.map(normalizeText).filter(Boolean))];
}

export function getBranchAcceptedAliases(branch: TelegramBranch): string[] {
  const preferred = [branch.code, branch.name, branch.shortName]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  const automatic = branchAliases(branch)
    .filter(alias => !alias.includes(' ') && alias.length >= 3)
    .slice(0, 3);
  return [...new Set([...preferred, ...automatic])].slice(0, 5);
}

export async function fetchActiveBranches(db: Firestore): Promise<TelegramBranch[]> {
  const snapshot = await db.collection('branches').limit(200).get();
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...(doc.data() || {}) } as any))
    .filter(b => b.isActive !== false && b.active !== false);
}

export function resolveBranchMatch(branches: TelegramBranch[], query?: string): BranchMatchResolution {
  const raw = normalizeText(query);
  if (!raw || isAllBranchQuery(raw)) return { status: 'NOT_FOUND', branch: null, candidates: [] };

  const compactRaw = compactText(raw);
  const queryTokens = [...new Set(raw.split(/\s+/).filter(token => {
    if (BRANCH_STOP_WORDS.has(token)) return false;
    return /^\d+$/.test(token) ? token.length >= 2 : token.length >= 3;
  }))];

  const exactCodeMatches = branches.filter(branch => {
    const aliases = branchAliases(branch);
    return aliases.some(alias => raw === alias || compactRaw === compactText(alias));
  });
  if (exactCodeMatches.length === 1) {
    return { status: 'MATCHED', branch: exactCodeMatches[0], candidates: exactCodeMatches };
  }
  if (exactCodeMatches.length > 1) {
    return { status: 'AMBIGUOUS', branch: null, candidates: exactCodeMatches };
  }

  // A unique meaningful token is a valid short alias (for example XSTORE, 109,
  // HAM NGHI). Generic words are excluded and duplicate tokens stay ambiguous.
  const tokenOwners = new Map<string, TelegramBranch[]>();
  for (const branch of branches) {
    const tokens = [...new Set(branchAliases(branch)
      .flatMap(alias => alias.split(/\s+/))
      .filter(token => !BRANCH_STOP_WORDS.has(token) && (/^\d+$/.test(token) ? token.length >= 2 : token.length >= 3)))];
    for (const token of tokens) tokenOwners.set(token, [...(tokenOwners.get(token) || []), branch]);
  }
  const uniqueTokenMatches = [...new Set(queryTokens
    .flatMap(token => tokenOwners.get(token) || [])
    .filter(branch => queryTokens.some(token => tokenOwners.get(token)?.length === 1 && tokenOwners.get(token)?.[0].id === branch.id)))];
  if (uniqueTokenMatches.length === 1) {
    return { status: 'MATCHED', branch: uniqueTokenMatches[0], candidates: uniqueTokenMatches };
  }
  if (uniqueTokenMatches.length > 1) {
    return { status: 'AMBIGUOUS', branch: null, candidates: uniqueTokenMatches.slice(0, 5) };
  }

  const ranked = branches
    .map(branch => {
      const id = normalizeText(branch.id);
      const code = normalizeText(branch.code);
      const name = normalizeText(branch.name);
      const shortName = normalizeText(branch.shortName);
      const address = normalizeText(branch.address);
      let score = 0;

      for (const alias of [id, code]) {
        if (!alias) continue;
        const compactAlias = compactText(alias);
        if ((raw.includes(alias) || compactRaw.includes(compactAlias)) && compactAlias.length >= 3) score += 120;
        const numericCode = compactAlias.match(/\d{2,}/)?.[0];
        if (numericCode && queryTokens.includes(numericCode)) score += 90;
      }

      for (const alias of [shortName, name, address]) {
        const compactAlias = compactText(alias);
        if (compactAlias.length >= 4 && compactRaw.includes(compactAlias)) score += alias === shortName ? 100 : 70;
      }

      const branchTokens = [...new Set([id, code, name, shortName, address]
        .join(' ')
        .split(/\s+/)
        .filter(token => {
          if (BRANCH_STOP_WORDS.has(token)) return false;
          return /^\d+$/.test(token) ? token.length >= 2 : token.length >= 3;
        }))];
      for (const token of queryTokens) {
        if (branchTokens.includes(token)) score += /^\d+$/.test(token) ? 55 : 25;
      }

      // Reward contiguous location phrases such as "109 ham nghi" or "tran dai nghia".
      const locationAliases = [shortName, name, address]
        .map(alias => alias.split(/\s+/).filter(token => !BRANCH_STOP_WORDS.has(token)).join(' '))
        .filter(alias => alias.length >= 4);
      if (locationAliases.some(alias => raw.includes(alias) || compactRaw.includes(compactText(alias)))) score += 80;

      return { branch, score };
    })
    .filter(entry => entry.score >= 50)
    .sort((a, b) => b.score - a.score || a.branch.name.localeCompare(b.branch.name, 'vi'));

  if (ranked.length === 0) return { status: 'NOT_FOUND', branch: null, candidates: [] };
  const bestScore = ranked[0].score;
  const tied = ranked.filter(entry => entry.score === bestScore).map(entry => entry.branch);
  if (tied.length > 1) return { status: 'AMBIGUOUS', branch: null, candidates: tied.slice(0, 5) };

  // A close second means the text is not specific enough to select a store safely.
  if (ranked[1] && bestScore - ranked[1].score < 25) {
    return { status: 'AMBIGUOUS', branch: null, candidates: ranked.slice(0, 5).map(entry => entry.branch) };
  }
  return { status: 'MATCHED', branch: ranked[0].branch, candidates: [ranked[0].branch] };
}

export function findBranchMatch(branches: TelegramBranch[], query?: string): TelegramBranch | null {
  const resolution = resolveBranchMatch(branches, query);
  return resolution.status === 'MATCHED' ? resolution.branch : null;
}

function branchSelectionError(branches: TelegramBranch[], query?: string): string {
  if (branches.length === 0) {
    return '🏪 Chưa có chi nhánh đang hoạt động trong cấu hình CRM. Vui lòng kiểm tra lại mục Cài đặt cửa hàng.';
  }
  const resolution = resolveBranchMatch(branches, query);
  const entered = escapeTelegramHtml(query || '(chưa nhập)');
  if (resolution.status === 'AMBIGUOUS') {
    const choices = resolution.candidates
      .map(branch => `<code>${escapeTelegramHtml(branch.code || branch.id)}</code> — ${escapeTelegramHtml(branch.name || branch.id)}`)
      .join('\n• ');
    return `⚠️ Tên chi nhánh "<code>${entered}</code>" đang khớp nhiều nơi. Hãy gửi đúng mã chi nhánh:\n• ${choices}`;
  }
  const choices = branches.slice(0, 12)
    .map(branch => `<code>${escapeTelegramHtml(branch.code || branch.id)}</code> — ${escapeTelegramHtml(branch.name || branch.id)}`)
    .join('\n• ');
  return `🏪 Không tìm thấy chi nhánh "<code>${entered}</code>". Gõ <code>@bot chi nhánh</code> để xem alias, hoặc dùng mã trong danh sách:\n• ${choices}`;
}

export function formatVietnamNow(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const dateText = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(date);
  const timeText = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(date);
  return `${timeText} ${dateText} (GMT+7)`;
}

export interface ResolvedDateRange {
  dates: string[];
  startDate: string;
  endDate: string;
  label: string;
}

function normalizeDateInput(dateInput: string, today: string): string {
  const trimmed = dateInput.trim();
  const isoDate = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) {
    const normalized = `${isoDate[1]}-${isoDate[2].padStart(2, '0')}-${isoDate[3].padStart(2, '0')}`;
    const parsed = new Date(`${normalized}T12:00:00+07:00`);
    if (!Number.isNaN(parsed.getTime()) && getVietnamDateString(parsed) === normalized) return normalized;
    throw new Error('TELEGRAM_DATE_INVALID');
  }
  const ddmmyyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    return normalizeDateInput(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`, today);
  }
  const ddmm = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (ddmm) {
    const year = today.slice(0, 4);
    return normalizeDateInput(`${year}-${ddmm[2]}-${ddmm[1]}`, today);
  }
  throw new Error('TELEGRAM_DATE_INVALID');
}

function formatVnDate(isoDate: string): string {
  const parts = String(isoDate || '').split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return isoDate;
}

export function resolveDateRange(input: {
  period?: 'TODAY' | 'YESTERDAY' | 'WEEK' | 'LAST_WEEK' | 'MONTH' | 'LAST_MONTH' | 'CUSTOM' | string;
  date?: string;
  startDate?: string;
  endDate?: string;
}): ResolvedDateRange {
  const today = getVietnamDateString();
  const base = new Date(`${today}T12:00:00+07:00`);

  // 1. Single exact date
  if (input.date) {
    const norm = normalizeDateInput(input.date, today);
    return {
      dates: [norm],
      startDate: norm,
      endDate: norm,
      label: `NGÀY ${formatVnDate(norm)}`
    };
  }

  // 2. Custom date range
  if (input.startDate && input.endDate) {
    const startNorm = normalizeDateInput(input.startDate, today);
    const endNorm = normalizeDateInput(input.endDate, today);
    const startMs = new Date(`${startNorm}T12:00:00+07:00`).getTime();
    const endMs = new Date(`${endNorm}T12:00:00+07:00`).getTime();
    const dates: string[] = [];
    for (let c = startMs; c <= endMs; c += 86_400_000) {
      dates.push(getVietnamDateString(c));
    }
    return {
      dates: dates.length ? dates : [today],
      startDate: startNorm,
      endDate: endNorm,
      label: `TỪ ${formatVnDate(startNorm)} ĐẾN ${formatVnDate(endNorm)}`
    };
  }

  const p = String(input.period || 'TODAY').toUpperCase();

  if (p === 'YESTERDAY' || p === 'HOM_QUA') {
    const yestStr = getVietnamDateString(base.getTime() - 86_400_000);
    return {
      dates: [yestStr],
      startDate: yestStr,
      endDate: yestStr,
      label: `HÔM QUA (${formatVnDate(yestStr)})`
    };
  }

  if (p === 'WEEK' || p === 'TUAN_NAY') {
    const day = base.getUTCDay();
    const startMs = base.getTime() - (day === 0 ? 6 : day - 1) * 86_400_000;
    const dates: string[] = [];
    for (let c = startMs; c <= base.getTime(); c += 86_400_000) {
      dates.push(getVietnamDateString(c));
    }
    return {
      dates,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      label: `TUẦN NÀY (${formatVnDate(dates[0])} - HÔM NAY)`
    };
  }

  if (p === 'LAST_WEEK' || p === 'TUAN_TRUOC') {
    const day = base.getUTCDay();
    const thisWeekStartMs = base.getTime() - (day === 0 ? 6 : day - 1) * 86_400_000;
    const lastWeekStartMs = thisWeekStartMs - 7 * 86_400_000;
    const dates: string[] = [];
    for (let c = lastWeekStartMs; c < thisWeekStartMs; c += 86_400_000) {
      dates.push(getVietnamDateString(c));
    }
    return {
      dates,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      label: `TUẦN TRƯỚC (${formatVnDate(dates[0])} - ${formatVnDate(dates[dates.length - 1])})`
    };
  }

  if (p === 'LAST_MONTH' || p === 'THANG_TRUOC') {
    const [y, m] = today.split('-').map(Number);
    const prevYear = m === 1 ? y - 1 : y;
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevMonthPrefix = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    const daysInMonth = new Date(prevYear, prevMonth, 0).getDate();
    const dates: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      dates.push(`${prevMonthPrefix}-${String(d).padStart(2, '0')}`);
    }
    return {
      dates,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      label: `THÁNG TRƯỚC (THÁNG ${prevMonth}/${prevYear})`
    };
  }

  if (p === 'MONTH' || p === 'THANG_NAY') {
    const monthPrefix = today.slice(0, 7);
    const [y, m] = today.split('-').map(Number);
    const currentDay = Number(today.slice(8, 10));
    const dates: string[] = [];
    for (let d = 1; d <= currentDay; d++) {
      dates.push(`${monthPrefix}-${String(d).padStart(2, '0')}`);
    }
    return {
      dates,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      label: `THÁNG NÀY (THÁNG ${m}/${y})`
    };
  }

  // Default: TODAY
  return {
    dates: [today],
    startDate: today,
    endDate: today,
    label: `HÔM NAY (${formatVnDate(today)})`
  };
}

/**
 * 1. Tool Implementations for AI Assistant
 */

export async function toolGetRevenueReport(
  db: Firestore,
  args: {
    period?: 'TODAY' | 'YESTERDAY' | 'WEEK' | 'LAST_WEEK' | 'MONTH' | 'LAST_MONTH' | 'CUSTOM' | string;
    date?: string;
    startDate?: string;
    endDate?: string;
    branchQuery?: string;
    all?: boolean;
  },
  senderId: string
): Promise<string> {
  const config = getTelegramConfig();
  const isOwner = config.ownerUserIds.has(senderId);
  const isAll = Boolean(args.all) || isAllBranchQuery(args.branchQuery);

  if (isAll && !isOwner && config.ownerUserIds.size > 0) {
    return '⛔ Quyền riêng tư: Báo cáo doanh số TOÀN HỆ THỐNG chỉ dành riêng cho Chủ hệ thống (Owner). Vui lòng chỉ định chi nhánh cụ thể.';
  }

  const branches = await fetchActiveBranches(db);
  const matchedBranch = isAll ? null : findBranchMatch(branches, args.branchQuery);

  if (!isAll && !matchedBranch) return branchSelectionError(branches, args.branchQuery);

  const scopeId = isAll ? 'ALL' : String(matchedBranch!.id);
  const dateRange = resolveDateRange(args);

  const snapshots = await db.getAll(
    ...dateRange.dates.map(date => db.collection('executiveDailyAggregates').doc(`${date}_${scopeId}`))
  );

  let totalRevenue = 0;
  let totalInvoices = 0;

  snapshots.forEach(snap => {
    if (snap.exists) {
      const data = snap.data() || {};
      totalRevenue += Number(data.revenue || 0);
      totalInvoices += Number(data.invoiceCount || 0);
    }
  });

  // Fallback to real-time invoices if aggregate was 0 or single date
  if (totalRevenue === 0 && totalInvoices === 0 && dateRange.dates.length <= 7) {
    const startRange = getVietnamDayUtcRange(dateRange.startDate);
    const endRange = getVietnamDayUtcRange(dateRange.endDate);
    let invQuery: FirebaseFirestore.Query = db.collection('invoices')
      .where('createdAtIso', '>=', startRange.startUtc)
      .where('createdAtIso', '<=', endRange.endUtc);
    if (matchedBranch) {
      invQuery = invQuery.where('branchId', '==', matchedBranch.id);
    }
    const invSnap = await invQuery.limit(1000).get();
    invSnap.docs.forEach(doc => {
      const d = doc.data() || {};
      totalRevenue += Number(d.totalAmount || d.finalTotal || 0);
      totalInvoices += 1;
    });
  }

  const scopeLabel = isAll ? 'Toàn hệ thống' : matchedBranch!.name || matchedBranch!.id;

  return [
    `<b>💰 BÁO CÁO DOANH SỐ · ${escapeTelegramHtml(dateRange.label)}</b>`,
    `🏪 <b>Phạm vi:</b> ${escapeTelegramHtml(scopeLabel)}`,
    `• <b>Doanh thu:</b> <code>${formatVnd(totalRevenue)}</code>`,
    `• <b>Số đơn bán:</b> <b>${totalInvoices.toLocaleString('vi-VN')} hóa đơn</b>`,
    `<i>Cập nhật lúc ${escapeTelegramHtml(formatVietnamNow())}</i>`
  ].join('\n');
}

export async function toolLookupImei(db: Firestore, args: { imei: string }): Promise<string> {
  const imei = String(args.imei || '').trim();
  if (!imei) return '⚠️ Thiếu số IMEI cần tra cứu.';

  try {
    const timeline = await getDeviceLifecycleTimeline(
      db,
      { imei },
      { uid: 'TELEGRAM_COPILOT', role: 'REGIONAL_MANAGER', assignedBranchIds: [] }
    );
    const device = timeline.device || {};
    const summary = timeline.summary || {};
    const recent = Array.isArray(timeline.events) ? timeline.events.slice(0, 4) : [];

    return [
      `<b>📱 THÔNG TIN THIẾT BỊ IMEI …${escapeTelegramHtml(imei.slice(-6))}</b>`,
      `• Model: <b>${escapeTelegramHtml(device.model || 'Chưa xác định')}</b> (${escapeTelegramHtml(device.color || '')} ${escapeTelegramHtml(device.storage || '')})`,
      `• Trạng thái máy: <b>${escapeTelegramHtml(summary.currentStatus || device.status || 'UNKNOWN')}</b>`,
      `• Pin: <b>${device.batteryHealth ? `${device.batteryHealth}%` : 'N/A'}</b> · Ngoại hình: ${escapeTelegramHtml(device.condition || 'N/A')}`,
      `• Giá bán niêm yết: <code>${formatVnd(device.sellPrice)}</code>`,
      `• Chi nhánh: <b>${escapeTelegramHtml(device.branchName || device.branchId || 'Chưa xác định')}</b>`,
      `• Vị trí kho: ${escapeTelegramHtml(summary.currentLocationName || 'Kho trung tâm')}`,
      `• Người chịu trách nhiệm: <b>${escapeTelegramHtml(summary.currentCustodianName || 'Chưa gán')}</b>`,
      summary.workOrderCount
        ? `• Phiếu kỹ thuật: <b>${Number(summary.workOrderCount)} ca</b> (Rework: ${Number(summary.reworkCount || 0)})`
        : '',
      recent.length ? '<b>Lịch sử gần nhất:</b>' : '',
      ...recent.map(
        (event: any) =>
          `• <i>${escapeTelegramHtml(String(event.occurredAt || '').slice(0, 16).replace('T', ' '))}</i>: ${escapeTelegramHtml(event.title || event.eventType)}`
      )
    ]
      .filter(Boolean)
      .join('\n');
  } catch (err: any) {
    if (String(err?.message || '').includes('NOT_FOUND')) {
      return `🔎 Không tìm thấy thiết bị nào khớp IMEI <code>${escapeTelegramHtml(imei)}</code> trong hệ thống.`;
    }
    return `⚠️ Lỗi khi tra cứu IMEI: ${escapeTelegramHtml(err?.message || 'Không xác định')}`;
  }
}

export async function toolCheckInventory(
  db: Firestore,
  args: { modelQuery?: string; branchQuery?: string; all?: boolean },
  senderId: string
): Promise<string> {
  const config = getTelegramConfig();
  const isOwner = config.ownerUserIds.has(senderId);
  const isAll = Boolean(args.all) || isAllBranchQuery(args.branchQuery);

  if (isAll && !isOwner && config.ownerUserIds.size > 0) {
    return '⛔ Tra cứu tồn kho toàn hệ thống yêu cầu quyền Chủ hệ thống (Owner). Hãy chỉ định chi nhánh cụ thể.';
  }

  const branches = await fetchActiveBranches(db);
  const matchedBranch = isAll ? null : findBranchMatch(branches, args.branchQuery);
  if (!isAll && !matchedBranch) return branchSelectionError(branches, args.branchQuery);

  let query: FirebaseFirestore.Query = db.collection('devices').where('status', '==', 'in_stock');
  if (matchedBranch) {
    query = query.where('branchId', '==', matchedBranch.id);
  }

  const snapshot = await query.limit(1000).get();
  const modelNeedle = normalizeText(args.modelQuery || '');

  const devices = snapshot.docs
    .map(doc => doc.data())
    .filter(d => !modelNeedle || normalizeText(d.model).includes(modelNeedle) || normalizeText(d.storage).includes(modelNeedle));

  // Group by model & storage
  const groupCounts: Record<string, number> = {};
  devices.forEach(d => {
    const key = `${d.model || 'iPhone'} ${d.storage || ''}`.trim();
    groupCounts[key] = (groupCounts[key] || 0) + 1;
  });

  const topModels = Object.entries(groupCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const scopeName = isAll ? 'Toàn hệ thống' : matchedBranch ? matchedBranch.name || matchedBranch.id : 'Chi nhánh';

  return [
    `<b>📦 TỒN KHO MÁY SẴN BÁN</b>`,
    `🏪 <b>Chi nhánh:</b> ${escapeTelegramHtml(scopeName)}`,
    `• <b>Tổng tồn khả dụng:</b> <b>${devices.length} máy</b>`,
    topModels.length ? '<b>Chi tiết từng dòng máy:</b>' : '',
    ...topModels.map(([model, count]) => `• ${escapeTelegramHtml(model)}: <b>${count} máy</b>`),
    topModels.length < Object.keys(groupCounts).length
      ? `<i>...và ${Object.keys(groupCounts).length - topModels.length} dòng máy khác.</i>`
      : '',
    `<i>Cập nhật lúc ${escapeTelegramHtml(formatVietnamNow())}</i>`
  ]
    .filter(Boolean)
    .join('\n');
}

export async function toolGetTechnicalProgress(
  db: Firestore,
  args: { branchQuery?: string; all?: boolean },
  senderId: string
): Promise<string> {
  const config = getTelegramConfig();
  const isOwner = config.ownerUserIds.has(senderId);
  const isAll = Boolean(args.all) || isAllBranchQuery(args.branchQuery);

  if (isAll && !isOwner && config.ownerUserIds.size > 0) {
    return '⛔ Xem tiến độ kỹ thuật toàn hệ thống chỉ dành cho Chủ hệ thống. Vui lòng ghi rõ chi nhánh.';
  }

  const branches = await fetchActiveBranches(db);
  const matchedBranch = isAll ? null : findBranchMatch(branches, args.branchQuery);
  if (!isAll && !matchedBranch) return branchSelectionError(branches, args.branchQuery);

  const activeLineStatuses = ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_PARTS', 'COMPLETED', 'REWORK_REQUIRED'];
  let lineQuery: FirebaseFirestore.Query = db.collection('technicalWorkOrderLines').where('status', 'in', activeLineStatuses);
  if (matchedBranch) {
    lineQuery = lineQuery.where('branchId', '==', matchedBranch.id);
  }

  const lineSnapshot = await lineQuery.limit(1000).get();
  const lines = lineSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
  const workOrderIds = [...new Set(lines.map(l => String(l.workOrderId || '')).filter(Boolean))].slice(0, 400);

  const workOrderSnapshots = workOrderIds.length
    ? await db.getAll(...workOrderIds.map(id => db.collection('technicalWorkOrders').doc(id)))
    : [];

  const TERMINAL_STATUSES = new Set(['DELIVERED_TO_CUSTOMER', 'RETURNED_TO_STOCK', 'RETURNED_TO_BRANCH', 'CANCELLED']);
  const workOrders = workOrderSnapshots
    .filter(s => s.exists)
    .map(s => ({ id: s.id, ...s.data() } as any))
    .filter(wo => !TERMINAL_STATUSES.has(String(wo.status || '')) && (!matchedBranch || String(wo.branchId || '') === String(matchedBranch.id)));

  const linesByWorkOrder = new Map<string, any[]>();
  lines.forEach(line => {
    const woId = String(line.workOrderId || '');
    linesByWorkOrder.set(woId, [...(linesByWorkOrder.get(woId) || []), line]);
  });

  const stageCounts: Record<string, number> = {};
  workOrders.forEach(wo => {
    const stage = deriveTechnicalBoardStage(wo, linesByWorkOrder.get(wo.id) || []);
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  });

  const scopeName = isAll ? 'Toàn hệ thống' : matchedBranch ? matchedBranch.name || matchedBranch.id : 'Chi nhánh';

  return [
    `<b>🔧 BÁO CÁO TIẾN ĐỘ KỸ THUẬT & KCS</b>`,
    `🏪 <b>Phạm vi:</b> ${escapeTelegramHtml(scopeName)}`,
    `• <b>Tổng ca đang mở:</b> <b>${workOrders.length} ca</b>`,
    `• ⏳ Chờ KTV nhận: <b>${stageCounts.WAITING_ACCEPTANCE || 0}</b>`,
    `• ⚙️ Đang sửa chữa: <b>${stageCounts.IN_PROGRESS || 0}</b>`,
    `• 📦 Chờ linh kiện: <b>${stageCounts.WAITING_PARTS || 0}</b>`,
    `• 🔍 Chờ nghiệm thu KCS: <b>${stageCounts.WAITING_QC || 0}</b>`,
    `• 🔄 Cần Rework / Làm lại: <b>${stageCounts.REWORK || 0}</b>`,
    `• ✅ Đã xong (Chờ trả khách / Nhập kho): <b>${stageCounts.WAITING_DELIVERY || 0}</b>`,
    `<i>Cập nhật lúc ${escapeTelegramHtml(formatVietnamNow())}</i>`
  ].join('\n');
}

export async function toolLookupCustomer(db: Firestore, args: { phoneOrName: string }): Promise<string> {
  const query = String(args.phoneOrName || '').trim();
  if (!query) return '⚠️ Vui lòng nhập số điện thoại hoặc tên khách hàng cần tra cứu.';

  const isPhone = /^[0-9+ ]{8,15}$/.test(query);
  const customersSnap = await db.collection('customers').limit(100).get();
  
  const qNorm = normalizeText(query);
  const matched = customersSnap.docs
    .map(doc => ({ id: doc.id, ...(doc.data() || {}) } as any))
    .filter(c => {
      if (isPhone) return String(c.phone || '').includes(query.replace(/\s+/g, ''));
      return normalizeText(c.name || '').includes(qNorm);
    })
    .slice(0, 3);

  if (matched.length === 0) {
    // Try searching in leads
    const leadsSnap = await db.collection('crm_leads').limit(100).get();
    const matchedLeads = leadsSnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() || {}) } as any))
      .filter(l => {
        if (isPhone) return String(l.phone || '').includes(query.replace(/\s+/g, ''));
        return normalizeText(l.name || '').includes(qNorm);
      })
      .slice(0, 3);

    if (matchedLeads.length === 0) {
      return `🔎 Không tìm thấy khách hàng hoặc Lead nào khớp với <code>${escapeTelegramHtml(query)}</code>.`;
    }

    const lead = matchedLeads[0];
    return [
      `<b>👤 THÔNG TIN LEAD TIỀM NĂNG (CRM)</b>`,
      `• Tên: <b>${escapeTelegramHtml(lead.name || 'Khách hàng')}</b>`,
      `• SĐT: <code>${escapeTelegramHtml(lead.phone || 'N/A')}</code>`,
      `• Nhu cầu: <b>${escapeTelegramHtml(lead.interestedModel || 'Chưa ghi nhận')}</b>`,
      `• Ngân sách: <code>${formatVnd(lead.budget)}</code>`,
      `• Trạng thái: <b>${escapeTelegramHtml(lead.status || 'NEW')}</b>`,
      `• Nguồn: ${escapeTelegramHtml(lead.source || 'Facebook/TikTok')}`,
      `• Nhân viên phụ trách: <b>${escapeTelegramHtml(lead.assignedStaff || 'Chưa gán')}</b>`
    ].join('\n');
  }

  const cust = matched[0];
  return [
    `<b>👤 HỒ SƠ KHÁCH HÀNG: ${escapeTelegramHtml(cust.name || 'Khách hàng')}</b>`,
    `• SĐT: <code>${escapeTelegramHtml(cust.phone || 'N/A')}</code>`,
    `• Phân hạng VIP: <b>${escapeTelegramHtml(cust.tier || cust.customerTier || 'STANDARD')}</b>`,
    `• Tổng chi tiêu tích lũy: <code>${formatVnd(cust.totalSpent)}</code>`,
    `• Điểm tích lũy: <b>${Number(cust.loyaltyPoints || 0).toLocaleString('vi-VN')} điểm</b>`,
    `• Công nợ hiện tại: <b style="color:red">${formatVnd(cust.debtAmount || cust.outstandingDebt)}</b>`,
    cust.address ? `• Địa chỉ: ${escapeTelegramHtml(cust.address)}` : '',
    cust.notes ? `• Ghi chú: <i>${escapeTelegramHtml(cust.notes)}</i>` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

export async function toolGetCashflowSummary(
  db: Firestore,
  args: { period?: 'TODAY' | 'YESTERDAY' | 'MONTH' | 'LAST_MONTH' | string; date?: string },
  senderId: string
): Promise<string> {
  const config = getTelegramConfig();
  const isOwner = config.ownerUserIds.has(senderId);

  if (!isOwner && config.ownerUserIds.size > 0) {
    return '⛔ BẢO MẬT: Dữ liệu Sổ Quỹ & Dòng Tiền mặt / Tài khoản Ngân Hàng là thông tin nhạy cảm cấp cao, chỉ dành riêng cho Chủ sở hữu hệ thống (Owner User IDs).';
  }

  const dateRange = resolveDateRange({ period: args.period || 'TODAY', date: args.date });

  const [fundsSnap, txSnap] = await Promise.all([
    db.collection('fundAccounts').where('isActive', '==', true).limit(50).get(),
    db.collection('cashTransactions').limit(1000).get()
  ]);

  const funds = fundsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
  const totalFundBalance = funds.reduce((sum, f) => sum + Number(f.currentBalance || 0), 0);

  let totalIncome = 0;
  let totalExpense = 0;

  txSnap.docs.forEach(doc => {
    const tx = doc.data() || {};
    const dateStr = String(tx.date || tx.createdAtIso || tx.createdAt || '').slice(0, 10);
    if (dateRange.dates.includes(dateStr)) {
      if (tx.type === 'RECEIPT' || tx.type === 'THU') {
        totalIncome += Number(tx.amount || 0);
      } else if (tx.type === 'PAYMENT' || tx.type === 'CHI') {
        totalExpense += Number(tx.amount || 0);
      }
    }
  });

  return [
    `<b>💵 BÁO CÁO TÀI CHÍNH & SỔ QUỸ · ${escapeTelegramHtml(dateRange.label)}</b>`,
    `• <b>Tổng thu:</b> <code>+${formatVnd(totalIncome)}</code>`,
    `• <b>Tổng chi:</b> <code>-${formatVnd(totalExpense)}</code>`,
    `• <b>Chênh lệch dòng tiền:</b> <b>${formatVnd(totalIncome - totalExpense)}</b>`,
    `• <b>Tổng số dư khả dụng (Các quỹ):</b> <code>${formatVnd(totalFundBalance)}</code>`,
    funds.length ? '<b>Số dư theo từng quỹ:</b>' : '',
    ...funds.map(
      f => `• ${escapeTelegramHtml(f.name || f.bankName || f.id)}: <b>${formatVnd(f.currentBalance)}</b>`
    )
  ]
    .filter(Boolean)
    .join('\n');
}

export async function toolGetAttendanceToday(
  db: Firestore,
  args: { branchQuery?: string; all?: boolean; date?: string }
): Promise<string> {
  const today = getVietnamDateString();
  const targetDate = args.date ? normalizeDateInput(args.date, today) : today;
  const branches = await fetchActiveBranches(db);
  const isAll = Boolean(args.all) || isAllBranchQuery(args.branchQuery);
  const matchedBranch = isAll ? null : findBranchMatch(branches, args.branchQuery);
  if (!isAll && !matchedBranch) return branchSelectionError(branches, args.branchQuery);

  let query: FirebaseFirestore.Query = db.collection('attendance').where('date', '==', targetDate);
  if (matchedBranch) {
    query = query.where('branchId', '==', matchedBranch.id);
  }

  const snapshot = await query.limit(500).get();
  const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

  const checkedIn = records.filter(r => r.attendanceStatus === 'CHECKED_IN' || r.checkInTime);
  const late = records.filter(r => (Number(r.lateMinutes) || 0) > 0);
  const completed = records.filter(r => r.attendanceStatus === 'COMPLETED' || r.checkOutTime);

  const scopeLabel = isAll ? 'Toàn hệ thống' : matchedBranch!.name || matchedBranch!.id;
  const dateLabel = targetDate === today ? `HÔM NAY (${formatVnDate(targetDate)})` : `NGÀY ${formatVnDate(targetDate)}`;

  return [
    `<b>⏰ TÌNH HÌNH CHẤM CÔNG · ${escapeTelegramHtml(dateLabel)}</b>`,
    `🏪 <b>Phạm vi:</b> ${escapeTelegramHtml(scopeLabel)}`,
    `• Tổng lượt chấm công: <b>${records.length} nhân viên</b>`,
    `• Đang trong ca làm việc: <b>${checkedIn.length - completed.length} người</b>`,
    `• Đã hoàn thành ca: <b>${completed.length} người</b>`,
    `• Đi trễ trong ngày: <b>${late.length} lượt</b>`,
    late.length ? '<b>Danh sách đi trễ:</b>' : '',
    ...late.slice(0, 5).map(
      r => `• ${escapeTelegramHtml(r.staffName || 'NV')}: Trễ ${r.lateMinutes} phút (Ca ${escapeTelegramHtml(r.shiftName || '')})`
    ),
    `<i>Cập nhật lúc ${escapeTelegramHtml(formatVietnamNow())}</i>`
  ]
    .filter(Boolean)
    .join('\n');
}

export async function toolGetTopSellingProducts(
  db: Firestore,
  args: {
    period?: 'TODAY' | 'YESTERDAY' | 'WEEK' | 'LAST_WEEK' | 'MONTH' | 'LAST_MONTH' | 'CUSTOM' | string;
    date?: string;
    startDate?: string;
    endDate?: string;
    branchQuery?: string;
    limit?: number;
  }
): Promise<string> {
  const dateRange = resolveDateRange(args);
  const branches = await fetchActiveBranches(db);
  const matchedBranch = findBranchMatch(branches, args.branchQuery);
  if (args.branchQuery && !matchedBranch) return branchSelectionError(branches, args.branchQuery);

  const startRange = getVietnamDayUtcRange(dateRange.startDate);
  const endRange = getVietnamDayUtcRange(dateRange.endDate);
  let query: FirebaseFirestore.Query = db.collection('invoices')
    .where('createdAtIso', '>=', startRange.startUtc)
    .where('createdAtIso', '<=', endRange.endUtc);

  if (matchedBranch) {
    query = query.where('branchId', '==', matchedBranch.id);
  }

  const invoicesSnap = await query.limit(1000).get();

  const modelStats: Record<string, { count: number; totalRevenue: number }> = {};
  invoicesSnap.docs.forEach(doc => {
    const inv = doc.data() || {};
    const items = Array.isArray(inv.items) ? inv.items : [];
    items.forEach((item: any) => {
      const modelName = String(item.model || item.productName || item.name || 'Sản phẩm khác').trim();
      if (!modelStats[modelName]) modelStats[modelName] = { count: 0, totalRevenue: 0 };
      const qty = Number(item.quantity || 1);
      const price = Number(item.price || item.sellPrice || 0);
      modelStats[modelName].count += qty;
      modelStats[modelName].totalRevenue += qty * price;
    });
  });

  const topList = Object.entries(modelStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, args.limit || 5);

  const scopeLabel = matchedBranch ? matchedBranch.name || matchedBranch.id : 'Toàn hệ thống';

  if (topList.length === 0) {
    return `📊 Chưa ghi nhận sản phẩm nào bán ra trong ${dateRange.label} (Phạm vi: ${scopeLabel}).`;
  }

  return [
    `<b>🏆 TOP SẢN PHẨM BÁN CHẠY NHẤT · ${escapeTelegramHtml(dateRange.label)}</b>`,
    `🏪 <b>Phạm vi:</b> ${escapeTelegramHtml(scopeLabel)}`,
    ...topList.map(([model, stat], index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';
      return `${medal} <b>${escapeTelegramHtml(model)}</b>: <b>${stat.count} máy</b> (Doanh thu: <code>${formatVnd(stat.totalRevenue)}</code>)`;
    }),
    `<i>Dựa trên phân tích hóa đơn bán lẻ thời gian thực.</i>`
  ].join('\n');
}

export async function toolGetAgingInventory(
  db: Firestore,
  args: { daysThreshold?: number; branchQuery?: string }
): Promise<string> {
  const threshold = Number(args.daysThreshold) || 30;
  const cutoffDate = new Date(Date.now() - threshold * 86_400_000).toISOString();
  
  const branches = await fetchActiveBranches(db);
  const matchedBranch = findBranchMatch(branches, args.branchQuery);
  if (args.branchQuery && !matchedBranch) return branchSelectionError(branches, args.branchQuery);

  let query: FirebaseFirestore.Query = db.collection('devices').where('status', '==', 'in_stock');
  if (matchedBranch) query = query.where('branchId', '==', matchedBranch.id);

  const snap = await query.limit(1000).get();
  const agingDevices = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as any))
    .filter(d => {
      const entry = String(d.importDate || d.createdAtIso || d.createdAt || '');
      return entry && entry <= cutoffDate;
    });

  const grouped: Record<string, number> = {};
  agingDevices.forEach(d => {
    const key = `${d.model || 'iPhone'} (${d.storage || ''} ${d.color || ''})`.trim();
    grouped[key] = (grouped[key] || 0) + 1;
  });

  const topAging = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return [
    `<b>⚠️ CẢNH BÁO TỒN KHO LÂU NGÀY (> ${threshold} ngày)</b>`,
    `🏪 <b>Phạm vi:</b> ${escapeTelegramHtml(matchedBranch ? matchedBranch.name || matchedBranch.id : 'Toàn hệ thống')}`,
    `• Tổng số máy tồn > ${threshold} ngày: <b>${agingDevices.length} máy</b>`,
    topAging.length ? '<b>Danh sách máy đọng vốn:</b>' : '<i>Không có máy nào tồn quá hạn!</i>',
    ...topAging.map(([name, count]) => `• ${escapeTelegramHtml(name)}: <b>${count} máy</b>`),
    agingDevices.length > 0 ? '💡 <i>Khuyến nghị: Xem xét giảm giá hoặc chạy Flash Sale xả kho thu hồi vốn.</i>' : ''
  ].filter(Boolean).join('\n');
}

export async function toolGetStaffPerformance(
  db: Firestore,
  args: {
    period?: 'TODAY' | 'YESTERDAY' | 'WEEK' | 'LAST_WEEK' | 'MONTH' | 'LAST_MONTH' | 'CUSTOM' | string;
    date?: string;
    startDate?: string;
    endDate?: string;
    branchQuery?: string;
  }
): Promise<string> {
  const dateRange = resolveDateRange(args);
  const branches = await fetchActiveBranches(db);
  const matchedBranch = findBranchMatch(branches, args.branchQuery);
  if (args.branchQuery && !matchedBranch) return branchSelectionError(branches, args.branchQuery);

  const startRange = getVietnamDayUtcRange(dateRange.startDate);
  const endRange = getVietnamDayUtcRange(dateRange.endDate);
  let query: FirebaseFirestore.Query = db.collection('invoices')
    .where('createdAtIso', '>=', startRange.startUtc)
    .where('createdAtIso', '<=', endRange.endUtc);

  if (matchedBranch) query = query.where('branchId', '==', matchedBranch.id);

  const snap = await query.limit(1000).get();
  const staffStats: Record<string, { count: number; revenue: number }> = {};

  snap.docs.forEach(doc => {
    const inv = doc.data() || {};
    const seller = String(inv.sellerName || inv.createdByName || 'Chưa gán').trim();
    if (!staffStats[seller]) staffStats[seller] = { count: 0, revenue: 0 };
    staffStats[seller].count += 1;
    staffStats[seller].revenue += Number(inv.totalAmount || inv.finalTotal || 0);
  });

  const rankedStaff = Object.entries(staffStats).sort((a, b) => b[1].revenue - a[1].revenue);
  const scopeLabel = matchedBranch ? matchedBranch.name || matchedBranch.id : 'Toàn hệ thống';

  return [
    `<b>🎖️ BẢNG XẾP HẠNG HIỆU SUẤT SALE · ${escapeTelegramHtml(dateRange.label)}</b>`,
    `🏪 <b>Phạm vi:</b> ${escapeTelegramHtml(scopeLabel)}`,
    ...rankedStaff.slice(0, 8).map(([name, stat], idx) => {
      const rankIcon = idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
      return `${rankIcon} <b>${escapeTelegramHtml(name)}</b>: <code>${formatVnd(stat.revenue)}</code> (${stat.count} đơn)`;
    }),
    rankedStaff.length === 0 ? '<i>Chưa có đơn hàng phát sinh trong khoảng thời gian này.</i>' : ''
  ].join('\n');
}

export async function toolGetDebtReport(
  db: Firestore,
  _args: Record<string, unknown>,
  senderId: string
): Promise<string> {
  const config = getTelegramConfig();
  const isOwner = config.ownerUserIds.has(senderId);
  if (!isOwner && config.ownerUserIds.size > 0) {
    return '⛔ Báo cáo công nợ toàn chuỗi chỉ dành riêng cho Chủ hệ thống (Owner).';
  }

  const snap = await db.collection('customers')
    .where('debtAmount', '>', 0)
    .limit(100)
    .get();

  const debtors = snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as any))
    .sort((a, b) => Number(b.debtAmount || 0) - Number(a.debtAmount || 0));

  const totalDebt = debtors.reduce((sum, c) => sum + Number(c.debtAmount || 0), 0);

  return [
    `<b>📑 BÁO CÁO CÔNG NỢ KHÁCH HÀNG CẦN THU HỒI</b>`,
    `• <b>Tổng công nợ chưa thu:</b> <b style="color:red">${formatVnd(totalDebt)}</b> (${debtors.length} khách nợ)`,
    debtors.length ? '<b>Top khách nợ cao nhất:</b>' : '',
    ...debtors.slice(0, 6).map((c, i) => `• ${i + 1}. <b>${escapeTelegramHtml(c.name || 'Khách')}</b> (${escapeTelegramHtml(c.phone || 'N/A')}): <code>${formatVnd(c.debtAmount)}</code>`),
    debtors.length > 0 ? '📞 <i>Khuyến nghị: Bộ phận CSKH/Kế toán liên hệ nhắc nợ các khoản trên.</i>' : ''
  ].filter(Boolean).join('\n');
}

/**
 * 2. Function Declarations for Gemini Tools
 */
const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'get_revenue_report',
    description: 'Lấy báo cáo doanh thu, số lượng hóa đơn bán hàng theo mốc thời gian và chi nhánh.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        period: {
          type: Type.STRING,
          enum: ['TODAY', 'YESTERDAY', 'WEEK', 'LAST_WEEK', 'MONTH', 'LAST_MONTH', 'CUSTOM'],
          description: 'Khoảng thời gian: TODAY (Hôm nay), YESTERDAY (Hôm qua), WEEK (Tuần này), LAST_WEEK (Tuần trước), MONTH (Tháng này), LAST_MONTH (Tháng trước).'
        },
        date: {
          type: Type.STRING,
          description: 'Ngày cụ thể dạng YYYY-MM-DD hoặc DD/MM/YYYY (ví dụ: 2026-08-28 hoặc 28/08).'
        },
        startDate: {
          type: Type.STRING,
          description: 'Ngày bắt đầu dạng YYYY-MM-DD khi tra cứu khoảng thời gian tùy chỉnh.'
        },
        endDate: {
          type: Type.STRING,
          description: 'Ngày kết thúc dạng YYYY-MM-DD khi tra cứu khoảng thời gian tùy chỉnh.'
        },
        branchQuery: {
          type: Type.STRING,
          description: 'Tên hoặc mã chi nhánh cụ thể (ví dụ: PH109, Cau Giay, 109, Xa Dan, 245, Tran Dai Nghia...). Để trống nếu muốn xem toàn hệ thống.'
        },
        all: {
          type: Type.BOOLEAN,
          description: 'True nếu muốn lấy toàn bộ hệ thống (chỉ dành cho Owner).'
        }
      }
    }
  },
  {
    name: 'lookup_imei_lifecycle',
    description: 'Tra cứu toàn bộ vòng đời, lịch sử nhập xuất, sửa chữa, vị trí kho và người giữ máy theo số IMEI 15 chữ số.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        imei: {
          type: Type.STRING,
          description: 'Số IMEI 15 chữ số của thiết bị.'
        }
      },
      required: ['imei']
    }
  },
  {
    name: 'check_inventory_stock',
    description: 'Tra cứu số lượng máy tồn kho sẵn bán gom nhóm theo từng Model iPhone và Chi nhánh.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        modelQuery: {
          type: Type.STRING,
          description: 'Tên dòng máy iPhone cần tra cứu (ví dụ: 15 Pro Max, 14 Plus, 13 Pro).'
        },
        branchQuery: {
          type: Type.STRING,
          description: 'Tên hoặc mã chi nhánh cần kiểm tra tồn kho (ví dụ: Cầu Giấy, 109, Xã Đàn, PH109...).'
        },
        all: {
          type: Type.BOOLEAN,
          description: 'True nếu muốn tra cứu trên tất cả chi nhánh.'
        }
      }
    }
  },
  {
    name: 'get_technical_progress',
    description: 'Báo cáo số lượng ca kỹ thuật, máy chờ KCS, máy chờ linh kiện, máy cần làm lại (Rework).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        branchQuery: {
          type: Type.STRING,
          description: 'Tên hoặc mã chi nhánh cần xem tiến độ kỹ thuật (ví dụ: Cầu Giấy, 109, Xã Đàn, PH109...).'
        },
        all: {
          type: Type.BOOLEAN,
          description: 'True nếu xem toàn bộ các chi nhánh.'
        }
      }
    }
  },
  {
    name: 'lookup_customer_info',
    description: 'Tra cứu thông tin khách hàng hoặc Lead CRM theo số điện thoại hoặc họ tên.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        phoneOrName: {
          type: Type.STRING,
          description: 'Số điện thoại hoặc họ tên của khách hàng.'
        }
      },
      required: ['phoneOrName']
    }
  },
  {
    name: 'get_cashflow_summary',
    description: 'Tra cứu tổng thu chi trong ngày/tháng và số dư các tài khoản quỹ tiền mặt / ngân hàng (Bảo mật Owner).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        period: {
          type: Type.STRING,
          enum: ['TODAY', 'YESTERDAY', 'MONTH', 'LAST_MONTH'],
          description: 'Mốc thời gian TODAY, YESTERDAY, MONTH (tháng này), LAST_MONTH (tháng trước).'
        },
        date: {
          type: Type.STRING,
          description: 'Ngày cụ thể dạng YYYY-MM-DD hoặc DD/MM/YYYY.'
        }
      }
    }
  },
  {
    name: 'get_attendance_today',
    description: 'Báo cáo tình hình nhân sự đi làm, ai đang trong ca, ai đi trễ, quân số từng chi nhánh theo ngày.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        branchQuery: {
          type: Type.STRING,
          description: 'Tên hoặc mã chi nhánh cần xem (ví dụ: Cầu Giấy, 109, Xã Đàn, PH109...).'
        },
        date: {
          type: Type.STRING,
          description: 'Ngày cần xem dạng YYYY-MM-DD hoặc DD/MM/YYYY (mặc định là hôm nay).'
        },
        all: {
          type: Type.BOOLEAN,
          description: 'True nếu xem tất cả các chi nhánh.'
        }
      }
    }
  },
  {
    name: 'get_top_selling_products',
    description: 'Báo cáo top các sản phẩm, model iPhone bán chạy nhất theo doanh số và số lượng.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        period: {
          type: Type.STRING,
          enum: ['TODAY', 'YESTERDAY', 'WEEK', 'LAST_WEEK', 'MONTH', 'LAST_MONTH', 'CUSTOM'],
          description: 'Khoảng thời gian: TODAY, YESTERDAY, WEEK, LAST_WEEK, MONTH, LAST_MONTH.'
        },
        date: {
          type: Type.STRING,
          description: 'Ngày cụ thể dạng YYYY-MM-DD hoặc DD/MM/YYYY.'
        },
        branchQuery: {
          type: Type.STRING,
          description: 'Tên chi nhánh cần lọc.'
        },
        limit: {
          type: Type.INTEGER,
          description: 'Số lượng sản phẩm top cần lấy (mặc định 5).'
        }
      }
    }
  },
  {
    name: 'get_aging_inventory',
    description: 'Cảnh báo và phân tích danh sách thiết bị tồn kho lâu ngày (> 30 ngày) đọng vốn.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        daysThreshold: {
          type: Type.INTEGER,
          description: 'Số ngày tồn kho tối thiểu để coi là tồn lâu (mặc định 30 ngày).'
        },
        branchQuery: {
          type: Type.STRING,
          description: 'Tên hoặc mã chi nhánh cần kiểm tra tồn kho lâu.'
        }
      }
    }
  },
  {
    name: 'get_staff_sales_performance',
    description: 'Bảng xếp hạng hiệu suất bán hàng của từng nhân viên theo doanh thu và số lượng đơn.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        period: {
          type: Type.STRING,
          enum: ['TODAY', 'YESTERDAY', 'WEEK', 'LAST_WEEK', 'MONTH', 'LAST_MONTH', 'CUSTOM'],
          description: 'Mốc thời gian: TODAY, YESTERDAY, WEEK, LAST_WEEK, MONTH, LAST_MONTH.'
        },
        date: {
          type: Type.STRING,
          description: 'Ngày cụ thể dạng YYYY-MM-DD hoặc DD/MM/YYYY.'
        },
        branchQuery: {
          type: Type.STRING,
          description: 'Tên hoặc mã chi nhánh cần lọc (ví dụ: Cầu Giấy, 109, Xã Đàn, PH109...).'
        }
      }
    }
  },
  {
    name: 'get_debt_report',
    description: 'Báo cáo danh sách khách hàng có công nợ cao cần thu hồi (Bảo mật Owner).',
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  }
];

async function executeTool(db: Firestore, name: string, args: any, senderId: string): Promise<string> {
  if (name === 'get_revenue_report') return toolGetRevenueReport(db, args, senderId);
  if (name === 'lookup_imei_lifecycle') return toolLookupImei(db, args);
  if (name === 'check_inventory_stock') return toolCheckInventory(db, args, senderId);
  if (name === 'get_technical_progress') return toolGetTechnicalProgress(db, args, senderId);
  if (name === 'lookup_customer_info') return toolLookupCustomer(db, args);
  if (name === 'get_cashflow_summary') return toolGetCashflowSummary(db, args, senderId);
  if (name === 'get_attendance_today') return toolGetAttendanceToday(db, args);
  if (name === 'get_top_selling_products') return toolGetTopSellingProducts(db, args);
  if (name === 'get_aging_inventory') return toolGetAgingInventory(db, args);
  if (name === 'get_staff_sales_performance') return toolGetStaffPerformance(db, args);
  if (name === 'get_debt_report') return toolGetDebtReport(db, args, senderId);
  return 'Không tìm thấy công cụ tương ứng.';
}

/**
 * 3. Main AI Copilot Query Processor with Multi-Turn Deep Reasoning
 */
export async function processTelegramAiCopilot(
  db: Firestore,
  userMessage: string,
  senderId: string
): Promise<string> {
  const config = getTelegramConfig();
  const apiKey = String(config.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
  const baseUrl = config.geminiBaseUrl || process.env.GEMINI_BASE_URL || '';

  if (!apiKey) {
    return '🤖 <i>Trợ lý AI chưa được cài API Key. Quản trị viên vui lòng vào <b>Cài đặt hệ thống ➔ Thông báo Telegram & AI</b> trên Web CRM để nhập API Key (Google AI Studio hoặc API proxy như apikey.fun).</i>';
  }

  const aiModel = config.aiModel || 'gemini-3.7-flash';

  const activeBranchList = await fetchActiveBranches(db);
  const now = new Date();
  const todayVn = getVietnamDateString();
  const timeVn = now.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
  const dayOfWeekNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const vnDayOfWeek = dayOfWeekNames[new Date(`${todayVn}T12:00:00+07:00`).getUTCDay()];
  const yesterdayVn = getVietnamDateString(new Date(`${todayVn}T12:00:00+07:00`).getTime() - 86_400_000);

  const branchesGuide = activeBranchList.length > 0
    ? activeBranchList.map((b, i) => `${i + 1}. ID: ${b.id} | Tên: ${b.name} | Mã: ${b.code || b.id}${b.address ? ` | ĐC: ${b.address}` : ''}`).join('\n')
    : 'Chưa có dữ liệu chi nhánh';

  const systemInstruction = `
Bạn là "PhoneHouse Executive AI Copilot" - Cố vấn điều hành và Trợ lý ảo toàn năng trực tiếp hỗ trợ Giám Đốc và các Trưởng Chi Nhánh của chuỗi PhoneHouse CRM (bán lẻ iPhone, bảo hành & sửa chữa).

[THỜI GIAN THỰC TẾ HIỆN TẠI (MÚI GIỜ VIỆT NAM GMT+7)]:
- Thời điểm hiện tại: ${vnDayOfWeek}, ngày ${formatVnDate(todayVn)}, lúc ${timeVn}.
- Hôm nay (TODAY): ${todayVn}
- Hôm qua (YESTERDAY): ${yesterdayVn}
- Tháng này: Tháng ${todayVn.slice(5, 7)}/${todayVn.slice(0, 4)}

[DANH SÁCH CHI NHÁNH CHÍNH THỨC HIỆN CÓ CỦA PHONEHOUSE]:
${branchesGuide}

[QUY TẮC BẮT BUỘC KHI XỬ LÝ CHI NHÁNH & THỜI GIAN]:
1. Phân biệt chi nhánh: Khi người dùng nhắc đến bất kỳ chi nhánh hoặc địa điểm nào (ví dụ: "Cầu Giấy", "109", "Xã Đàn", "245", "Trần Đại Nghĩa", "86", "Hà Đông", "PH109"...), bạn PHẢI truyền đúng tên hoặc mã chi nhánh vào tham số \`branchQuery\` của công cụ.
2. Nếu người dùng hỏi chung, không chỉ đích danh chi nhánh hoặc nói "toàn hệ thống", "tất cả chi nhánh", "cả chuỗi", "tổng", bạn hãy truyền \`all: true\` hoặc để trống \`branchQuery\`.
3. Phân biệt thời gian: Khi người dùng nói "hôm qua", bạn PHẢI chọn \`period: 'YESTERDAY'\` hoặc \`date: '${yesterdayVn}'\`. Khi nói "hôm nay", chọn \`period: 'TODAY'\`. Khi nói ngày cụ thể (ví dụ 28/08), hãy truyền \`date: 'YYYY-MM-DD'\`.
4. Định dạng câu trả lời bằng HTML Telegram: sử dụng <b>, <i>, <code>, các dấu gạch đầu dòng • và icon sinh động (💰, 📱, 📦, 👥, 🔧, ⏰, 💵, 🏆, ⚠️).
5. Đơn vị tiền tệ luôn là Việt Nam Đồng (ví dụ: 25.000.000 đ).
6. Sử dụng công cụ (Function Calling) để lấy dữ liệu thực tế chính xác 100% trước khi trả lời. Tuyệt đối không tự bịa đặt số liệu.
7. Khi người dùng hỏi phân tích hoặc so sánh, bạn hãy tổng hợp dữ liệu từ các công cụ, nhận xét xu hướng (tăng/giảm, điểm nghẽn kỹ thuật, rủi ro tồn kho, công nợ) và đưa ra ĐỀ XUẤT HÀNH ĐỘNG cụ thể.
`;

  // === CASE 1: OPENAI-COMPATIBLE PROXY (apikey.fun, OneAPI, NewAPI, etc.) ===
  if (isOpenAiCompatible(apiKey, baseUrl)) {
    const resolvedUrl = resolveBaseUrl(baseUrl);
    const openAiTools = convertGoogleDeclarationsToOpenAiTools(functionDeclarations);
    const messages: any[] = [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userMessage }
    ];

    try {
      const initialRes = await fetch(`${resolvedUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: aiModel,
          messages,
          tools: openAiTools,
          tool_choice: 'auto'
        }),
        signal: AbortSignal.timeout(25000)
      });

      if (!initialRes.ok) {
        const errText = await initialRes.text().catch(() => '');
        throw new Error(`Proxy HTTP ${initialRes.status}: ${errText.slice(0, 150)}`);
      }

      const initialData: any = await initialRes.json();
      const assistantMsg = initialData?.choices?.[0]?.message;
      const toolCalls = assistantMsg?.tool_calls;

      if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
        const toolExecutionResults: Array<{ name: string; output: string }> = [];
        messages.push(assistantMsg);

        for (const tc of toolCalls) {
          const name = tc.function?.name;
          let args = {};
          try {
            args = typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function?.arguments || {};
          } catch {
            args = {};
          }
          const output = await executeTool(db, name, args, senderId);
          toolExecutionResults.push({ name, output });
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `[Dữ liệu thực tế từ hệ thống cho công cụ ${name}]:\n${output}`
          });
        }

        const isComplexQuery = userMessage.length > 25 || /(tại sao|phân tích|đánh giá|so sánh|lý do|tư vấn|đề xuất|chi tiết|nhận xét|top|xếp hạng)/i.test(userMessage);
        if (!isComplexQuery && toolExecutionResults.length === 1) {
          return toolExecutionResults[0].output;
        }

        try {
          const secondTurnRes = await fetch(`${resolvedUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: aiModel,
              messages
            }),
            signal: AbortSignal.timeout(25000)
          });

          if (secondTurnRes.ok) {
            const secondData: any = await secondTurnRes.json();
            const text = secondData?.choices?.[0]?.message?.content?.trim();
            if (text) return text;
          }
        } catch (synthErr) {
          console.warn('[OpenAI Proxy Multi-turn Synthesis Fallback]:', synthErr);
        }

        return toolExecutionResults.map(r => r.output).join('\n\n');
      }

      return assistantMsg?.content?.trim() || '🤖 Đã tiếp nhận yêu cầu. Bạn có thể gõ <code>/menu</code> để xem các chức năng hỗ trợ nhanh.';
    } catch (err: any) {
      console.warn('[OpenAI Proxy Assistant Error]:', err);
      return `⚠️ Trợ lý AI Proxy đang bận hoặc gặp lỗi: <i>${escapeTelegramHtml(err?.message || 'Timeout')}</i>. Vui lòng kiểm tra lại API Key / Base URL hoặc dùng lệnh trực tiếp.`;
    }
  }

  // === CASE 2: NATIVE GOOGLE AI STUDIO (@google/genai) ===
  const ai = getAI(config);
  if (!ai) {
    return '🤖 <i>Trợ lý AI chưa được cài GEMINI_API_KEY hợp lệ. Quản trị viên vui lòng vào <b>Cài đặt hệ thống ➔ Thông báo Telegram & AI</b> trên Web CRM để nhập API Key.</i>';
  }

  try {
    // 1. Initial Call
    const initialResponse = await ai.models.generateContent({
      model: aiModel,
      contents: [
        {
          role: 'user',
          parts: [{ text: userMessage }]
        }
      ],
      config: {
        systemInstruction,
        tools: [{ functionDeclarations }]
      }
    });

    const functionCalls = initialResponse.functionCalls;

    // 2. If Gemini wants to invoke tools
    if (functionCalls && functionCalls.length > 0) {
      const toolExecutionResults: Array<{ name: string; output: string }> = [];

      for (const call of functionCalls) {
        const name = call.name;
        const args = (call.args || {}) as any;
        const output = await executeTool(db, name, args, senderId);
        toolExecutionResults.push({ name, output });
      }

      // If only 1 simple tool was called and user asked simple prompt, return directly
      const isComplexQuery = userMessage.length > 25 || /(tại sao|phân tích|đánh giá|so sánh|lý do|tư vấn|đề xuất|chi tiết|nhận xét|top|xếp hạng)/i.test(userMessage);

      if (!isComplexQuery && toolExecutionResults.length === 1) {
        return toolExecutionResults[0].output;
      }

      // Multi-turn synthesis for deep analysis
      try {
        const secondTurnResponse = await ai.models.generateContent({
          model: aiModel,
          contents: [
            { role: 'user', parts: [{ text: userMessage }] },
            initialResponse.candidates?.[0]?.content || { role: 'model', parts: [{ text: 'Đang tra cứu dữ liệu...' }] },
            {
              role: 'user',
              parts: toolExecutionResults.map(r => ({
                text: `[Dữ liệu thực tế từ hệ thống cho công cụ ${r.name}]:\n${r.output}`
              }))
            }
          ],
          config: {
            systemInstruction: `${systemInstruction}\nĐọc kỹ toàn bộ số liệu thực tế vừa tra cứu được. Hãy tổng hợp thành một báo cáo phân tích quản trị hoàn chỉnh, nêu bật các số liệu quan trọng, nhận định và đưa ra đề xuất thực tế hữu ích cho Giám Đốc/Quản lý.`
          }
        });

        if (secondTurnResponse.text?.trim()) {
          return secondTurnResponse.text.trim();
        }
      } catch (synthErr) {
        console.warn('[Telegram AI Multi-turn Synthesis Fallback]:', synthErr);
      }

      return toolExecutionResults.map(r => r.output).join('\n\n');
    }

    // 3. Normal text response
    return (
      initialResponse.text?.trim() ||
      '🤖 Đã tiếp nhận yêu cầu. Bạn có thể gõ <code>/menu</code> để xem các chức năng hỗ trợ nhanh.'
    );
  } catch (err: any) {
    console.warn('[Telegram AI Assistant Error]:', err);
    return `⚠️ Trợ lý AI đang bận hoặc gặp lỗi kết nối: <i>${escapeTelegramHtml(err?.message || 'Timeout')}</i>. Vui lòng kiểm tra lại API Key hoặc dùng lệnh trực tiếp.`;
  }
}
