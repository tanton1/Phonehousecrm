import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { Firestore } from 'firebase-admin/firestore';
import { getVietnamDateString } from '../../shared/vietnamTime';
import { getDeviceLifecycleTimeline } from './deviceLifecycleService';
import { deriveTechnicalBoardStage } from './technicalService';
import { getTelegramConfig, escapeTelegramHtml } from './telegramService';

let aiClient: GoogleGenAI | null = null;

function getAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    try {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'phonehouse-telegram-copilot' } }
      });
    } catch (e) {
      console.warn('[Telegram AI Assistant] Failed to initialize GoogleGenAI:', e);
      return null;
    }
  }
  return aiClient;
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

  if (isAll && !isOwner) {
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

  if (isAll && !isOwner) {
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

  if (isAll && !isOwner) {
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

  if (!isOwner) {
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
    description: 'Tra cứu thông tin chi tiết thiết bị theo số IMEI 15 chữ số (Model, pin, trạng thái, người giữ, lịch sử luân chuyển).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        imei: {
          type: Type.STRING,
          description: 'Số IMEI 15 chữ số của điện thoại.'
        }
      },
      required: ['imei']
    }
  },
  {
    name: 'check_inventory_stock',
    description: 'Tra cứu tồn kho máy sẵn bán theo dòng máy (iPhone 14, 15, Pro Max...) và theo chi nhánh.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        modelQuery: {
          type: Type.STRING,
          description: 'Tên dòng máy cần tìm (ví dụ: 15 Pro Max, 14 Plus, 13).'
        },
        branchQuery: {
          type: Type.STRING,
          description: 'Tên chi nhánh cần kiểm tra.'
        },
        all: {
          type: Type.BOOLEAN,
          description: 'True nếu kiểm tra toàn bộ chi nhánh.'
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
  }
];

/**
 * 3. Main AI Copilot Query Processor
 */
export async function processTelegramAiCopilot(
  db: Firestore,
  userMessage: string,
  senderId: string
): Promise<string> {
  const ai = getAI();
  if (!ai) {
    return '🤖 <i>Trợ lý AI chưa được cấu hình GEMINI_API_KEY trên máy chủ. Bạn có thể sử dụng các lệnh trực tiếp như /doanhso, /imei, /tonkho, /kythuat.</i>';
  }

  const systemInstruction = `
Bạn là "PhoneHouse Executive Copilot" - Trợ lý AI toàn năng của Ban Điều Hành chuỗi bán lẻ iPhone & Kỹ thuật PhoneHouse CRM.
Nhiệm vụ của bạn là hỗ trợ Giám Đốc và các Trưởng Cửa Hàng tra cứu thông tin, phân tích dữ liệu và điều hành chuỗi.
Quy tắc phản hồi:
1. Luôn phản hồi bằng tiếng Việt thân thiện, lịch sự, chuyên nghiệp.
2. Định dạng câu trả lời bằng HTML đơn giản của Telegram: sử dụng <b>, <i>, <code>, các dấu gạch đầu dòng • và icon sinh động (💰, 📱, 📦, 👥, 🔧, ⏰, 💵).
3. Đơn vị tiền tệ luôn là Việt Nam Đồng (ví dụ: 25.000.000 đ).
4. Sử dụng công cụ (Function Calling) tương ứng để lấy dữ liệu thực tế chính xác 100% trước khi trả lời. Tuyệt đối không tự bịa đặt số liệu tài chính hoặc số lượng máy tồn kho.
5. Nếu câu hỏi là trao đổi kiến thức, tư vấn vận hành hoặc mẹo quản trị, hãy trả lời súc tích và hữu ích.
`;

  try {
    // 1. Send request with function declarations
    const initialResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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
      const call = functionCalls[0];
      const name = call.name;
      const args = (call.args || {}) as any;

      let toolResult = '';
      if (name === 'get_revenue_report') {
        toolResult = await toolGetRevenueReport(db, args, senderId);
      } else if (name === 'lookup_imei_lifecycle') {
        toolResult = await toolLookupImei(db, args);
      } else if (name === 'check_inventory_stock') {
        toolResult = await toolCheckInventory(db, args, senderId);
      } else if (name === 'get_technical_progress') {
        toolResult = await toolGetTechnicalProgress(db, args, senderId);
      } else if (name === 'lookup_customer_info') {
        toolResult = await toolLookupCustomer(db, args);
      } else if (name === 'get_cashflow_summary') {
        toolResult = await toolGetCashflowSummary(db, args, senderId);
      } else if (name === 'get_attendance_today') {
        toolResult = await toolGetAttendanceToday(db, args);
      } else {
        toolResult = 'Không tìm thấy công cụ tương ứng.';
      }

      return toolResult;
    }

    // 3. Normal text response
    return (
      initialResponse.text?.trim() ||
      '🤖 Đã tiếp nhận yêu cầu. Bạn có thể gõ <code>/menu</code> để xem các chức năng hỗ trợ nhanh.'
    );
  } catch (err: any) {
    console.warn('[Telegram AI Assistant Error]:', err);
    return `⚠️ Trợ lý AI đang bận hoặc gặp lỗi kết nối: <i>${escapeTelegramHtml(err?.message || 'Timeout')}</i>. Vui lòng thử lại hoặc dùng lệnh trực tiếp.`;
  }
}
