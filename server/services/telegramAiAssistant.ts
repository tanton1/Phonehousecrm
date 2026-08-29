import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { Firestore } from 'firebase-admin/firestore';
import { getVietnamDateString } from '../../shared/vietnamTime';
import { getDeviceLifecycleTimeline } from './deviceLifecycleService';
import { deriveTechnicalBoardStage } from './technicalService';
import { getTelegramConfig, escapeTelegramHtml, TelegramConfig } from './telegramService';

let cachedAiClient: { client: GoogleGenAI; key: string } | null = null;

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

export async function testGeminiConnection(apiKey?: string): Promise<{ success: boolean; model?: string; error?: string }> {
  const key = String(apiKey || getTelegramConfig().geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
  if (!key) return { success: false, error: 'GEMINI_API_KEY_EMPTY' };
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: 'Hello, confirm PhoneHouse AI connection in 3 words.' }] }]
    });
    return { success: Boolean(response.text), model: 'gemini-2.5-flash' };
  } catch (err: any) {
    return { success: false, error: String(err?.message || 'GEMINI_TEST_FAILED') };
  }
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

async function fetchActiveBranches(db: Firestore): Promise<Array<{ id: string; name: string; code?: string; shortName?: string }>> {
  const snapshot = await db.collection('branches').limit(200).get();
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...(doc.data() || {}) } as any))
    .filter(b => b.isActive !== false && b.active !== false);
}

function findBranchMatch(branches: Array<{ id: string; name: string; code?: string; shortName?: string }>, query?: string) {
  if (!query) return null;
  const q = normalizeText(query);
  if (!q || ['all', 'toan he thong', 'tong'].includes(q)) return null;
  return branches.find(b => {
    const aliases = [b.id, b.code, b.name, b.shortName].map(normalizeText).filter(Boolean);
    return aliases.some(alias => q === alias || q.includes(alias) || alias.includes(q));
  }) || null;
}

/**
 * 1. Tool Implementations for AI Assistant
 */

export async function toolGetRevenueReport(
  db: Firestore,
  args: { period?: 'TODAY' | 'WEEK' | 'MONTH'; branchQuery?: string; all?: boolean },
  senderId: string
): Promise<string> {
  const config = getTelegramConfig();
  const isOwner = config.ownerUserIds.has(senderId);
  const isAll = args.all || normalizeText(args.branchQuery || '').includes('all');

  if (isAll && !isOwner && config.ownerUserIds.size > 0) {
    return '⛔ Quyền riêng tư: Báo cáo doanh số TOÀN HỆ THỐNG chỉ dành riêng cho Chủ hệ thống (Owner). Vui lòng chọn chi nhánh cụ thể (ví dụ: Cầu Giấy, Xstore).';
  }

  const branches = await fetchActiveBranches(db);
  const matchedBranch = isAll ? null : findBranchMatch(branches, args.branchQuery);

  if (!isAll && !matchedBranch && branches.length > 0) {
    return `🏪 Vui lòng ghi rõ tên chi nhánh (Hiện có: ${branches.map(b => b.name || b.id).join(', ')}).`;
  }

  const scopeId = isAll ? 'ALL' : String(matchedBranch!.id);
  const period = args.period || 'TODAY';
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
  for (let cursor = start.getTime(); cursor <= base.getTime(); cursor += 86_400_000) {
    dates.push(getVietnamDateString(cursor));
  }

  const snapshots = await db.getAll(
    ...dates.map(date => db.collection('executiveDailyAggregates').doc(`${date}_${scopeId}`))
  );

  const totals = snapshots.reduce(
    (acc, snapshot) => {
      const data = snapshot.exists ? snapshot.data() || {} : {};
      acc.revenue += Number(data.revenue || 0);
      acc.invoices += Number(data.invoiceCount || 0);
      return acc;
    },
    { revenue: 0, invoices: 0 }
  );

  const periodLabel = period === 'TODAY' ? 'HÔM NAY' : period === 'WEEK' ? 'TUẦN NÀY' : 'THÁNG NÀY';
  const scopeLabel = isAll ? 'Toàn hệ thống' : matchedBranch!.name || matchedBranch!.id;

  return [
    `<b>💰 BÁO CÁO DOANH SỐ · ${escapeTelegramHtml(periodLabel)}</b>`,
    `🏪 <b>Phạm vi:</b> ${escapeTelegramHtml(scopeLabel)}`,
    `• <b>Doanh thu:</b> <code>${formatVnd(totals.revenue)}</code>`,
    `• <b>Số đơn bán:</b> <b>${totals.invoices.toLocaleString('vi-VN')} hóa đơn</b>`,
    `<i>Dữ liệu cập nhật theo múi giờ Việt Nam.</i>`
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
  const isAll = args.all || normalizeText(args.branchQuery || '').includes('all');

  if (isAll && !isOwner && config.ownerUserIds.size > 0) {
    return '⛔ Tra cứu tồn kho toàn hệ thống yêu cầu quyền Chủ hệ thống (Owner). Hãy chỉ định chi nhánh cụ thể.';
  }

  const branches = await fetchActiveBranches(db);
  const matchedBranch = isAll ? null : findBranchMatch(branches, args.branchQuery);

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
      : ''
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
  const isAll = args.all || normalizeText(args.branchQuery || '').includes('all');

  if (isAll && !isOwner && config.ownerUserIds.size > 0) {
    return '⛔ Xem tiến độ kỹ thuật toàn hệ thống chỉ dành cho Chủ hệ thống. Vui lòng ghi rõ chi nhánh.';
  }

  const branches = await fetchActiveBranches(db);
  const matchedBranch = isAll ? null : findBranchMatch(branches, args.branchQuery);

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
    `• ✅ Đã xong (Chờ trả khách / Nhập kho): <b>${stageCounts.WAITING_DELIVERY || 0}</b>`
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
  args: { period?: 'TODAY' | 'MONTH' },
  senderId: string
): Promise<string> {
  const config = getTelegramConfig();
  const isOwner = config.ownerUserIds.has(senderId);

  if (!isOwner && config.ownerUserIds.size > 0) {
    return '⛔ BẢO MẬT: Dữ liệu Sổ Quỹ & Dòng Tiền mặt / Tài khoản Ngân Hàng là thông tin nhạy cảm cấp cao, chỉ dành riêng cho Chủ sở hữu hệ thống (Owner User IDs).';
  }

  const today = getVietnamDateString();
  const isMonth = args.period === 'MONTH';
  const prefix = isMonth ? today.slice(0, 7) : today;

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
    const dateStr = String(tx.date || tx.createdAt || '');
    if (dateStr.startsWith(prefix)) {
      if (tx.type === 'RECEIPT' || tx.type === 'THU') {
        totalIncome += Number(tx.amount || 0);
      } else if (tx.type === 'PAYMENT' || tx.type === 'CHI') {
        totalExpense += Number(tx.amount || 0);
      }
    }
  });

  return [
    `<b>💵 BÁO CÁO TÀI CHÍNH & SỔ QUỸ ${isMonth ? 'THÁNG NÀY' : 'HÔM NAY'}</b>`,
    `• <b>Tổng thu:</b> <code style="color:green">+${formatVnd(totalIncome)}</code>`,
    `• <b>Tổng chi:</b> <code style="color:red">-${formatVnd(totalExpense)}</code>`,
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
  args: { branchQuery?: string; all?: boolean }
): Promise<string> {
  const today = getVietnamDateString();
  const branches = await fetchActiveBranches(db);
  const matchedBranch = args.all ? null : findBranchMatch(branches, args.branchQuery);

  let query: FirebaseFirestore.Query = db.collection('attendance').where('date', '==', today);
  if (matchedBranch) {
    query = query.where('branchId', '==', matchedBranch.id);
  }

  const snapshot = await query.limit(500).get();
  const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

  const checkedIn = records.filter(r => r.attendanceStatus === 'CHECKED_IN' || r.checkInTime);
  const late = records.filter(r => (Number(r.lateMinutes) || 0) > 0);
  const completed = records.filter(r => r.attendanceStatus === 'COMPLETED' || r.checkOutTime);

  const scopeLabel = matchedBranch ? matchedBranch.name || matchedBranch.id : 'Toàn hệ thống';

  return [
    `<b>⏰ TÌNH HÌNH CHẤM CÔNG HÔM NAY (${escapeTelegramHtml(today)})</b>`,
    `🏪 <b>Phạm vi:</b> ${escapeTelegramHtml(scopeLabel)}`,
    `• Tổng lượt chấm công: <b>${records.length} nhân viên</b>`,
    `• Đang trong ca làm việc: <b>${checkedIn.length - completed.length} người</b>`,
    `• Đã hoàn thành ca: <b>${completed.length} người</b>`,
    `• Đi trễ trong ngày: <b>${late.length} lượt</b>`,
    late.length ? '<b>Danh sách đi trễ:</b>' : '',
    ...late.slice(0, 5).map(
      r => `• ${escapeTelegramHtml(r.staffName || 'NV')}: Trễ ${r.lateMinutes} phút (Ca ${escapeTelegramHtml(r.shiftName || '')})`
    )
  ]
    .filter(Boolean)
    .join('\n');
}

export async function toolGetTopSellingProducts(
  db: Firestore,
  args: { period?: 'TODAY' | 'WEEK' | 'MONTH'; limit?: number }
): Promise<string> {
  const period = args.period || 'TODAY';
  const today = getVietnamDateString();
  const base = new Date(`${today}T12:00:00+07:00`);
  let start = new Date(base);
  if (period === 'WEEK') {
    const day = base.getUTCDay();
    start = new Date(base.getTime() - (day === 0 ? 6 : day - 1) * 86_400_000);
  } else if (period === 'MONTH') {
    start = new Date(`${today.slice(0, 7)}-01T12:00:00+07:00`);
  }
  const startDateStr = getVietnamDateString(start.getTime());

  const invoicesSnap = await db.collection('invoices')
    .where('createdAtIso', '>=', `${startDateStr}T00:00:00`)
    .limit(1000)
    .get();

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

  if (topList.length === 0) {
    return `📊 Chưa ghi nhận sản phẩm nào bán ra trong ${period === 'TODAY' ? 'hôm nay' : period === 'WEEK' ? 'tuần này' : 'tháng này'}.`;
  }

  const periodLabel = period === 'TODAY' ? 'HÔM NAY' : period === 'WEEK' ? 'TUẦN NÀY' : 'THÁNG NÀY';
  return [
    `<b>🏆 TOP SẢN PHẨM BÁN CHẠY NHẤT · ${periodLabel}</b>`,
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
  args: { period?: 'TODAY' | 'MONTH'; branchQuery?: string }
): Promise<string> {
  const period = args.period || 'TODAY';
  const today = getVietnamDateString();
  const prefix = period === 'MONTH' ? today.slice(0, 7) : today;

  const branches = await fetchActiveBranches(db);
  const matchedBranch = findBranchMatch(branches, args.branchQuery);

  let query: FirebaseFirestore.Query = db.collection('invoices');
  if (matchedBranch) query = query.where('branchId', '==', matchedBranch.id);

  const snap = await query.limit(1000).get();
  const staffStats: Record<string, { count: number; revenue: number }> = {};

  snap.docs.forEach(doc => {
    const inv = doc.data() || {};
    const dateStr = String(inv.createdAtIso || inv.createdAt || '');
    if (dateStr.startsWith(prefix)) {
      const seller = String(inv.sellerName || inv.createdByName || 'Chưa gán').trim();
      if (!staffStats[seller]) staffStats[seller] = { count: 0, revenue: 0 };
      staffStats[seller].count += 1;
      staffStats[seller].revenue += Number(inv.totalAmount || 0);
    }
  });

  const rankedStaff = Object.entries(staffStats).sort((a, b) => b[1].revenue - a[1].revenue);

  return [
    `<b>🎖️ BẢNG XẾP HẠNG HIỆU SUẤT SALE · ${period === 'TODAY' ? 'HÔM NAY' : 'THÁNG NÀY'}</b>`,
    `🏪 <b>Phạm vi:</b> ${escapeTelegramHtml(matchedBranch ? matchedBranch.name || matchedBranch.id : 'Toàn hệ thống')}`,
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
          enum: ['TODAY', 'WEEK', 'MONTH'],
          description: 'Khoảng thời gian: TODAY (Hôm nay), WEEK (Tuần này), MONTH (Tháng này).'
        },
        branchQuery: {
          type: Type.STRING,
          description: 'Tên hoặc mã chi nhánh (ví dụ: PH109, Cau Giay, Xstore). Để trống hoặc ALL nếu toàn hệ thống.'
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
          description: 'Tên chi nhánh cần kiểm tra tồn kho.'
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
          description: 'Tên chi nhánh cần xem tiến độ kỹ thuật.'
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
          enum: ['TODAY', 'MONTH'],
          description: 'Mốc thời gian TODAY (hôm nay) hoặc MONTH (tháng này).'
        }
      }
    }
  },
  {
    name: 'get_attendance_today',
    description: 'Báo cáo tình hình nhân sự đi làm hôm nay, ai đang trong ca, ai đi trễ, quân số từng chi nhánh.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        branchQuery: {
          type: Type.STRING,
          description: 'Tên chi nhánh cần xem.'
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
          enum: ['TODAY', 'WEEK', 'MONTH'],
          description: 'Khoảng thời gian cần phân tích.'
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
          description: 'Tên chi nhánh cần kiểm tra tồn kho lâu.'
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
          enum: ['TODAY', 'MONTH'],
          description: 'Mốc thời gian TODAY hoặc MONTH.'
        },
        branchQuery: {
          type: Type.STRING,
          description: 'Tên chi nhánh cần lọc.'
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
  const ai = getAI(config);
  if (!ai) {
    return '🤖 <i>Trợ lý AI chưa được cài GEMINI_API_KEY. Quản trị viên vui lòng vào <b>Cài đặt hệ thống ➔ Thông báo Telegram & AI</b> trên Web CRM để nhập API Key.</i>';
  }

  const aiModel = config.aiModel || 'gemini-2.5-flash';

  const systemInstruction = `
Bạn là "PhoneHouse Executive AI Copilot" - Cố vấn điều hành và Trợ lý ảo toàn năng trực tiếp hỗ trợ Giám Đốc và các Trưởng Chi Nhánh của chuỗi PhoneHouse CRM (bán lẻ iPhone, bảo hành & sửa chữa).
Nhiệm vụ của bạn:
1. Trả lời bằng tiếng Việt lịch sự, thông minh, súc tích và có chiều sâu phân tích quản trị điều hành.
2. Định dạng câu trả lời bằng HTML Telegram: sử dụng <b>, <i>, <code>, các dấu gạch đầu dòng • và icon sinh động (💰, 📱, 📦, 👥, 🔧, ⏰, 💵, 🏆, ⚠️).
3. Đơn vị tiền tệ luôn là Việt Nam Đồng (ví dụ: 25.000.000 đ).
4. Sử dụng công cụ (Function Calling) để lấy dữ liệu thực tế chính xác 100% trước khi trả lời. Tuyệt đối không tự bịa đặt số liệu.
5. Khi người dùng hỏi câu hỏi tổng quan hoặc phân tích, bạn hãy tổng hợp dữ liệu từ các công cụ, nhận xét xu hướng (tăng/giảm, điểm nghẽn kỹ thuật, rủi ro tồn kho, công nợ) và đưa ra ĐỀ XUẤT HÀNH ĐỘNG cụ thể.
`;

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
