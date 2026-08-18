import { useMemo } from 'react';
import { SalesInvoice, DeviceItem, Lead, WarrantyTicket, FundAccount, Partner } from '../../../types';

export interface ActionQueueItem {
  id: string;
  type: 'INSTALLMENT_PENDING' | 'LONG_IN_STOCK' | 'OVERDUE_WARRANTY' | 'UNCONTACTED_LEAD';
  severity: 'danger' | 'warning' | 'info';
  title: string;
  count: number;
  description: string;
  targetTab: string;
  actionLabel: string;
}

export interface DailyRevenueItem {
  date: string;
  dayName: string;
  revenue: number;
  orderCount: number;
}

export interface DashboardMetricsResult {
  todayRevenue: number;
  todayOrderCount: number;
  monthRevenue: number;
  monthOrderCount: number;
  inStockDeviceCount: number;
  inStockTotalValue: number;
  totalCashFundBalance: number;
  totalBankFundBalance: number;
  activeLeadsCount: number;
  urgentWarrantyCount: number;
  actionQueue: ActionQueueItem[];
  dailyRevenueTrend: DailyRevenueItem[];
  inventoryHealth: {
    inStock: number;
    soldThisMonth: number;
    agingStockCount: number; // in stock > 30 days
  };
}

export interface UseDashboardMetricsParams {
  invoices: SalesInvoice[];
  devices: DeviceItem[];
  leads: Lead[];
  warrantyTickets: WarrantyTicket[];
  funds: FundAccount[];
  partners: Partner[];
  selectedBranchId?: string;
}

export function calculateDashboardMetrics(params: UseDashboardMetricsParams): DashboardMetricsResult {
  const { invoices = [], devices = [], leads = [], warrantyTickets = [], funds = [], selectedBranchId } = params;

  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonthPrefix = todayStr.slice(0, 7); // YYYY-MM

  // Helper to extract date string from invoice
  const getInvoiceDate = (inv: SalesInvoice): string => {
    return inv.createdDate || inv.createdAt?.slice(0, 10) || (inv as any).date || '';
  };

  // 1. Branch Filtered Lists
  const branchInvoices = selectedBranchId && selectedBranchId !== 'ALL'
    ? invoices.filter(inv => !inv.branchId || inv.branchId === selectedBranchId)
    : invoices;

  const branchDevices = selectedBranchId && selectedBranchId !== 'ALL'
    ? devices.filter(dev => !dev.branchId || dev.branchId === selectedBranchId)
    : devices;

  const branchLeads = selectedBranchId && selectedBranchId !== 'ALL'
    ? leads.filter(l => !l.branchId || l.branchId === selectedBranchId)
    : leads;

  const branchWarranties = selectedBranchId && selectedBranchId !== 'ALL'
    ? warrantyTickets.filter(w => !w.branchId || w.branchId === selectedBranchId)
    : warrantyTickets;

  const branchFunds = selectedBranchId && selectedBranchId !== 'ALL'
    ? funds.filter(f => !f.branchId || f.branchId === selectedBranchId || f.branchId === 'ALL')
    : funds;

  // 2. Revenue & Orders
  const validInvoices = branchInvoices.filter(inv => inv.status !== 'cancelled');
  const todayInvoices = validInvoices.filter(inv => getInvoiceDate(inv) === todayStr);
  const monthInvoices = validInvoices.filter(inv => getInvoiceDate(inv).startsWith(currentMonthPrefix));

  const todayRevenue = todayInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
  const todayOrderCount = todayInvoices.length;

  const monthRevenue = monthInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
  const monthOrderCount = monthInvoices.length;

  // 3. Stock metrics
  const inStockDevices = branchDevices.filter(d => d.status === 'in_stock');
  const inStockDeviceCount = inStockDevices.length;
  const inStockTotalValue = inStockDevices.reduce((sum, d) => sum + (d.buyPrice || d.sellPrice || 0), 0);

  // Aging stock (> 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
  const agingDevices = inStockDevices.filter(d => d.receivedDate && d.receivedDate < thirtyDaysAgoStr);

  // 4. Fund Balances
  const totalCashFundBalance = branchFunds
    .filter(f => f.type === 'CASH')
    .reduce((sum, f) => sum + (f.currentBalance || 0), 0);

  const totalBankFundBalance = branchFunds
    .filter(f => f.type === 'BANK')
    .reduce((sum, f) => sum + (f.currentBalance || 0), 0);

  // 5. CRM & Warranty
  const activeLeads = branchLeads.filter(l => l.status !== 'won' && l.status !== 'lost');
  const uncontactedLeads = activeLeads.filter(l => l.status === 'new');

  const activeWarranties = branchWarranties.filter(w => w.status !== 'delivered');
  const urgentWarranties = activeWarranties.filter(w => w.status === 'ready');

  // 6. Action Queue Items (Prioritized by urgency)
  const actionQueue: ActionQueueItem[] = [];

  // A. Pending Installments
  const pendingInstallments = validInvoices.filter(
    inv => inv.paymentMethod?.includes('Trả góp') && inv.installmentDisbursementStatus === 'PENDING'
  );
  if (pendingInstallments.length > 0) {
    actionQueue.push({
      id: 'queue-installments',
      type: 'INSTALLMENT_PENDING',
      severity: 'danger',
      title: 'Đơn trả góp chưa giải ngân',
      count: pendingInstallments.length,
      description: `Có ${pendingInstallments.length} hồ sơ trả góp đang chờ đối tác tài chính chuyển tiền về tài khoản.`,
      targetTab: 'invoices',
      actionLabel: 'Xác nhận giải ngân'
    });
  }

  // B. Aging Inventory
  if (agingDevices.length > 0) {
    actionQueue.push({
      id: 'queue-aging-stock',
      type: 'LONG_IN_STOCK',
      severity: 'warning',
      title: 'Máy tồn kho trên 30 ngày',
      count: agingDevices.length,
      description: `Có ${agingDevices.length} máy đọng vốn lâu. Đề xuất điều chỉnh giá hoặc tạo chương trình xả kho.`,
      targetTab: 'inventory',
      actionLabel: 'Xem máy tồn lâu'
    });
  }

  // C. Urgent Warranty
  if (urgentWarranties.length > 0) {
    actionQueue.push({
      id: 'queue-warranty',
      type: 'OVERDUE_WARRANTY',
      severity: 'warning',
      title: 'Máy sửa chữa cần giao khách',
      count: urgentWarranties.length,
      description: `Có ${urgentWarranties.length} máy đã hoàn tất sửa chữa hoặc cần xử lý khẩn cấp.`,
      targetTab: 'warranty',
      actionLabel: 'Xem tiếp nhận'
    });
  }

  // D. Uncontacted Leads
  if (uncontactedLeads.length > 0) {
    actionQueue.push({
      id: 'queue-leads',
      type: 'UNCONTACTED_LEAD',
      severity: 'info',
      title: 'Khách tiềm năng mới chưa liên hệ',
      count: uncontactedLeads.length,
      description: `Có ${uncontactedLeads.length} khách mới để lại thông tin cần tư vấn trong ngày.`,
      targetTab: 'crm',
      actionLabel: 'Mở Pipeline CRM'
    });
  }

  // 7. Daily Revenue Trend (Last 7 Days)
  const dailyRevenueTrend: DailyRevenueItem[] = [];
  const daysOfWeek = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().split('T')[0];
    const dayName = daysOfWeek[d.getDay()];

    const dayInvs = validInvoices.filter(inv => getInvoiceDate(inv) === dateKey);
    const dayRev = dayInvs.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);

    dailyRevenueTrend.push({
      date: dateKey,
      dayName,
      revenue: dayRev,
      orderCount: dayInvs.length
    });
  }

  return {
    todayRevenue,
    todayOrderCount,
    monthRevenue,
    monthOrderCount,
    inStockDeviceCount,
    inStockTotalValue,
    totalCashFundBalance,
    totalBankFundBalance,
    activeLeadsCount: activeLeads.length,
    urgentWarrantyCount: urgentWarranties.length,
    actionQueue,
    dailyRevenueTrend,
    inventoryHealth: {
      inStock: inStockDeviceCount,
      soldThisMonth: monthInvoices.reduce((sum, inv) => sum + (inv.devices?.length || inv.items?.length || 1), 0),
      agingStockCount: agingDevices.length
    }
  };
}

export function useDashboardMetrics(params: UseDashboardMetricsParams): DashboardMetricsResult {
  return useMemo(() => calculateDashboardMetrics(params), [
    params.invoices,
    params.devices,
    params.leads,
    params.warrantyTickets,
    params.funds,
    params.partners,
    params.selectedBranchId
  ]);
}
