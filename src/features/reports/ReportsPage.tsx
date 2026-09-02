import React, { useState, useMemo, useEffect } from 'react';
import { 
  SalesInvoice, DeviceItem, WarrantyTicket, FundAccount, StoreBranch, 
  StaffMember, CashTransaction 
} from '../../types';
import { 
  BarChart3, TrendingUp, DollarSign, Calendar, Package, Wrench, Award, 
  Filter, Download, Printer, ArrowUpRight, ArrowDownLeft, PieChart, 
  Building2, Users, ShoppingCart, HelpCircle, ShieldCheck, ChevronRight, CheckCircle2, FileSpreadsheet,
  AlertTriangle, RefreshCw
} from 'lucide-react';
import { getPreviousVietnamMonthString, getVietnamDateString, getVietnamRelativeDateString, getVietnamTimeWithSecondsString } from '../../utils/dateTimeUtils';
import { toIsoDateTime } from '../../utils/dateValue';
import { fetchRepairRevenueReport, RepairRevenueReport } from '../../services/technicalApiClient';
import { requestS2eCashLedger, S2eCashLedgerReport } from '../../services/financeApiClient';

export interface ReportsPageProps {
  invoices: SalesInvoice[];
  devices: DeviceItem[];
  warrantyTickets: WarrantyTicket[];
  funds: FundAccount[];
  branches: StoreBranch[];
  selectedBranchId?: string;
  currentUser?: StaffMember | null;
  cashTransactions?: CashTransaction[];
  dataCoverage?: {
    partialDomainCount: number;
    invoiceLoaded: number;
    invoiceTotal: number;
    generatedAt?: string;
  };
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

const formatCompact = (amount: number) => {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(safeAmount);
  if (abs >= 1_000_000_000) return `${(safeAmount / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  if (abs >= 1_000_000) return `${(safeAmount / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} triệu`;
  if (abs >= 1_000) return `${(safeAmount / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} nghìn`;
  return safeAmount.toLocaleString('vi-VN');
};

export function dateOnlyInVietnam(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    // Finance transactions may use a Vietnam-local string without timezone.
    if (/^\d{4}-\d{2}-\d{2} /.test(trimmed)) return trimmed.slice(0, 10);
  }
  const iso = toIsoDateTime(value);
  if (!iso) return '';
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? '' : getVietnamDateString(parsed);
}

function invoiceLineItems(invoice: SalesInvoice): any[] {
  if (Array.isArray(invoice.detailedItems) && invoice.detailedItems.length > 0) return invoice.detailedItems as any[];
  return Array.isArray(invoice.items) ? invoice.items as any[] : [];
}

export function isPostedInvoice(invoice: SalesInvoice): boolean {
  const status = String(invoice.status || 'completed').trim().toUpperCase();
  return !['CANCELLED', 'CANCELED', 'REFUNDED', 'REVERSED', 'DRAFT', 'PENDING'].includes(status);
}

export function isPostedCashTransaction(transaction: CashTransaction): boolean {
  const status = String(transaction.status || 'COMPLETED').trim().toUpperCase();
  const recordStatus = String(transaction.recordStatus || 'POSTED').trim().toUpperCase();
  return status === 'COMPLETED' && !['DRAFT', 'REVERSED', 'CANCELLED', 'CANCELED'].includes(recordStatus);
}

/**
 * Build a spreadsheet-friendly CSV export for the current report snapshot.
 * This deliberately exports aggregate management figures only; identifiers,
 * customer data, IMEI and internal cost records are not included.
 */
export function buildReportCsv(rows: Array<[string, string | number]>): string {
  const escapeCell = (value: string | number) => {
    const text = String(value ?? '');
    return /[;\"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    ['Chỉ tiêu', 'Giá trị'],
    ...rows.map(([label, value]) => [label, value])
  ];
  // UTF-8 BOM keeps Vietnamese text readable in Excel on Windows. Semicolon
  // is used because it is the list separator in common Vietnamese locales.
  return `\uFEFF${lines.map(line => line.map(escapeCell).join(';')).join('\r\n')}\r\n`;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({
  invoices = [],
  devices = [],
  warrantyTickets = [],
  funds = [],
  branches = [],
  selectedBranchId = 'ALL',
  currentUser,
  cashTransactions = [],
  dataCoverage
}) => {
  const [activeTab, setActiveTab] = useState<'PL_STATEMENT' | 'REVENUE_STRUCTURE' | 'STOCK_AGING' | 'CASH_FLOW'>('PL_STATEMENT');
  const [timeRange, setTimeRange] = useState<'today' | 'yesterday' | '7days' | 'month' | 'last_month' | 'custom'>('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [repairReport, setRepairReport] = useState<RepairRevenueReport | null>(null);
  const [cashFlowReport, setCashFlowReport] = useState<S2eCashLedgerReport | null>(null);
  const [remoteReportLoading, setRemoteReportLoading] = useState(false);
  const [remoteReportError, setRemoteReportError] = useState<string | null>(null);

  const effectiveBranchId = useMemo(() => {
    // The parent already scopes non-admin data to the authenticated branch. Use
    // that authoritative branch in the report API instead of showing "ALL" for
    // a manager/accountant who cannot actually see the whole system.
    const role = String(currentUser?.role || '').toUpperCase();
    const selected = String(selectedBranchId || 'ALL');
    const effectiveSelected = selected === 'ALL' && role !== 'ADMIN'
      ? String(currentUser?.branchId || 'ALL')
      : selected;
    const match = branches.find(branch => branch.id === effectiveSelected || branch.code === effectiveSelected);
    return String(match?.id || effectiveSelected || 'ALL');
  }, [branches, currentUser?.branchId, currentUser?.role, selectedBranchId]);

  const reportRange = useMemo(() => {
    const today = getVietnamDateString();
    if (timeRange === 'today') return { from: today, to: today, label: 'Hôm nay' };
    if (timeRange === 'yesterday') {
      const date = getVietnamRelativeDateString(-1);
      return { from: date, to: date, label: 'Hôm qua' };
    }
    if (timeRange === '7days') return { from: getVietnamRelativeDateString(-6), to: today, label: '7 ngày gần nhất' };
    if (timeRange === 'month') return { from: `${today.slice(0, 7)}-01`, to: today, label: 'Tháng hiện tại' };
    if (timeRange === 'last_month') {
      const month = getPreviousVietnamMonthString();
      const [year, monthNumber] = month.split('-').map(Number);
      const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
      return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}`, label: 'Tháng trước' };
    }
    return {
      from: customStartDate,
      to: customEndDate,
      label: customStartDate && customEndDate ? `${customStartDate} → ${customEndDate}` : 'Tùy chọn'
    };
  }, [customEndDate, customStartDate, timeRange]);

  const invalidCustomRange = timeRange === 'custom'
    && Boolean(customStartDate && customEndDate && customStartDate > customEndDate);
  const incompleteCustomRange = timeRange === 'custom'
    && (!customStartDate || !customEndDate);

  useEffect(() => {
    if (invalidCustomRange || incompleteCustomRange || !reportRange.from || !reportRange.to || (effectiveBranchId === 'ALL' && String(currentUser?.role || '').toUpperCase() !== 'ADMIN')) {
      setRemoteReportLoading(false);
      setRepairReport(null);
      setCashFlowReport(null);
      setRemoteReportError(invalidCustomRange ? 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.' : incompleteCustomRange ? 'Vui lòng chọn đủ ngày bắt đầu và ngày kết thúc.' : null);
      return;
    }
    let active = true;
    setRemoteReportLoading(true);
    setRemoteReportError(null);
    Promise.allSettled([
      fetchRepairRevenueReport(reportRange.from, reportRange.to, effectiveBranchId),
      requestS2eCashLedger({ branchId: effectiveBranchId, from: reportRange.from, to: reportRange.to })
    ]).then(results => {
      if (!active) return;
      const [repairResult, cashResult] = results;
      const errors: string[] = [];
      if (repairResult.status === 'fulfilled') setRepairReport(repairResult.value);
      else {
        setRepairReport(null);
        errors.push('Không tải được báo cáo sửa chữa');
      }
      if (cashResult.status === 'fulfilled') setCashFlowReport(cashResult.value);
      else {
        setCashFlowReport(null);
        errors.push('Không tải được sổ quỹ theo kỳ');
      }
      setRemoteReportError(errors.length ? errors.join(' · ') : null);
    }).finally(() => {
      if (active) setRemoteReportLoading(false);
    });
    return () => { active = false; };
  }, [effectiveBranchId, currentUser?.role, incompleteCustomRange, invalidCustomRange, reportRange.from, reportRange.to]);

  // 1. Filtered Data by Branch & Time Range
  const filteredData = useMemo(() => {
    const todayStr = getVietnamDateString();
    const yesterdayStr = getVietnamRelativeDateString(-1);
    const past7Str = getVietnamRelativeDateString(-6);
    const thisMonthStr = todayStr.slice(0, 7);
    const lastMonthStr = getPreviousVietnamMonthString();

    const matchesTime = (value?: unknown) => {
      const dateOnly = dateOnlyInVietnam(value);
      // A dated report must not silently include records that have no business
      // date. They are surfaced as a data-quality warning below instead.
      if (!dateOnly) return false;
      if (timeRange === 'today') return dateOnly === todayStr;
      if (timeRange === 'yesterday') return dateOnly === yesterdayStr;
      if (timeRange === '7days') return dateOnly >= past7Str && dateOnly <= todayStr;
      if (timeRange === 'month') return dateOnly.startsWith(thisMonthStr);
      if (timeRange === 'last_month') return dateOnly.startsWith(lastMonthStr);
      if (timeRange === 'custom') {
        if (invalidCustomRange) return false;
        if (customStartDate && dateOnly < customStartDate) return false;
        if (customEndDate && dateOnly > customEndDate) return false;
        return true;
      }
      return true;
    };

    const matchesBranch = (branchId?: string) => {
      return effectiveBranchId === 'ALL' || !effectiveBranchId || branchId === effectiveBranchId || branchId === selectedBranchId;
    };

    const invs = invoices.filter(inv => isPostedInvoice(inv) && matchesBranch(inv.branchId) && matchesTime(inv.createdDate || inv.createdAt || (inv as any).date));
    const txs = cashTransactions.filter(tx => isPostedCashTransaction(tx) && matchesBranch(tx.branchId) && matchesTime(tx.date));
    const warrs = warrantyTickets.filter(w => matchesBranch(w.branchId) && matchesTime(w.createdAt));
    
    return { invs, txs, warrs };
  }, [effectiveBranchId, invoices, cashTransactions, warrantyTickets, selectedBranchId, timeRange, customStartDate, customEndDate, invalidCustomRange]);

  // 2. Revenue Calculations
  const revenueStats = useMemo(() => {
    const invs = filteredData.invs;

    // Gross Revenue & Discounts
    let deviceRevenue = 0;
    let accessoryRevenue = 0;
    let unallocatedRevenue = 0;
    let discountTotal = 0;

    let invoicesWithoutLines = 0;
    invs.forEach(inv => {
      discountTotal += Number(inv.discountAmount || 0);
      const lines = invoiceLineItems(inv);
      if (!lines.length && Number.isFinite(Number(inv.totalAmount))) {
        invoicesWithoutLines += 1;
        // Keep the invoice in the total even when an old record has no line
        // projection, but do not misclassify it as a device sale.
        unallocatedRevenue += Number(inv.totalAmount || 0);
      }
      lines.forEach((item: any) => {
        const lineTotal = Number(item.totalPrice ?? item.finalPrice ?? ((item.price || item.unitPrice || 0) * (item.quantity || 1)));
        if (item.deviceId || item.imei) {
          deviceRevenue += lineTotal;
        } else {
          accessoryRevenue += lineTotal;
        }
      });
    });

    // Repair Revenue
    const legacyRepairRevenue = filteredData.warrs
      .filter(w => w.status === 'delivered' || w.status === 'completed')
      .reduce((sum, w) => sum + (w.finalCost || w.estimatedCost || 0), 0);
    const repairRevenue = repairReport?.summary.serviceRevenue ?? legacyRepairRevenue;

    const grossRevenue = deviceRevenue + accessoryRevenue + unallocatedRevenue + repairRevenue;
    const netRevenue = Math.max(0, grossRevenue - discountTotal);

    return {
      deviceRevenue,
      accessoryRevenue,
      unallocatedRevenue,
      repairRevenue,
      discountTotal,
      grossRevenue,
      netRevenue,
      invoiceCount: invs.length,
      invoicesWithoutLines,
      repairRevenueSource: repairReport ? 'TECHNICAL_WORK_ORDERS' : 'LEGACY_WARRANTY_FALLBACK'
    };
  }, [filteredData, repairReport]);

  // 3. Cost of Goods Sold (COGS - Giá vốn hàng bán)
  const cogsStats = useMemo(() => {
    let deviceCost = 0;
    let accessoryCost = 0;
    let missingCostCount = 0;

    filteredData.invs.forEach(inv => {
      invoiceLineItems(inv).forEach((item: any) => {
        const quantity = Math.max(1, Number(item.quantity || 1));
        if (item.deviceId || item.imei) {
          // currentCost is the canonical cost snapshot; buyPrice is retained as
          // a compatibility fallback for older device records.
          const matchedDev = devices.find(d => d.id === item.deviceId || d.imei === item.imei);
          const cost = Number((matchedDev as any)?.currentCost ?? (matchedDev as any)?.buyPrice ?? item.costPrice ?? NaN);
          if (Number.isFinite(cost) && cost >= 0) deviceCost += cost * quantity;
          else missingCostCount += quantity;
        } else {
          const unitCost = Number(item.costPrice ?? item.unitCost ?? NaN);
          if (Number.isFinite(unitCost) && unitCost >= 0) accessoryCost += unitCost * quantity;
          else missingCostCount += quantity;
        }
      });
    });

    // Prefer the canonical technical cost posting. Legacy repair records may
    // carry a parts cost, but never infer it from a percentage of revenue.
    const legacyRepairPartsCost = filteredData.warrs
      .filter(w => w.status === 'delivered' || w.status === 'completed')
      .reduce((sum, w) => sum + Number(w.partsCost || 0), 0);
    const canonicalRepairPartsCost = repairReport
      ? repairReport.items.reduce((sum, item) => sum + Number(item.partsCost || 0), 0)
      : null;
    if (repairReport) {
      missingCostCount += repairReport.items.filter(item => item.partsCost == null).length;
    }
    const repairPartsCost = canonicalRepairPartsCost ?? legacyRepairPartsCost;

    const totalCOGS = deviceCost + accessoryCost + repairPartsCost;
    const grossProfit = revenueStats.netRevenue - totalCOGS;
    const grossMarginPercent = revenueStats.netRevenue > 0 ? (grossProfit / revenueStats.netRevenue) * 100 : 0;

    return {
      deviceCost,
      accessoryCost,
      repairPartsCost,
      totalCOGS,
      grossProfit,
      grossMarginPercent,
      missingCostCount
    };
  }, [filteredData, devices, repairReport, revenueStats.netRevenue]);

  // 4. Operating Expenses (OPEX - Chi phí hoạt động hạch toán)
  const opexStats = useMemo(() => {
    // Only payments with isPLAccounted !== false
    const accountedPayments = filteredData.txs.filter(t => t.type === 'PAYMENT' && t.isPLAccounted !== false);

    let rent = 0;
    let salary = 0;
    let marketing = 0;
    let utilities = 0;
    let otherOpex = 0;

    let unclassifiedPaymentCount = 0;
    let unclassifiedPaymentAmount = 0;
    const nonOpexCategories = new Set([
      'INVENTORY_PURCHASE', 'SUPPLIER_DEBT_PAY', 'TRADEIN_BUYBACK',
      'WARRANTY_PARTS', 'CUSTOMER_REFUND', 'INTER_BRANCH_PAYMENT',
      'INTERNAL_TRANSFER', 'ACCOUNTING_ADJUSTMENT'
    ]);

    accountedPayments.forEach(t => {
      const amount = Number(t.amount || 0);
      if (t.category === 'STORE_RENT') rent += amount;
      else if (t.category === 'SALARY_BONUS') salary += amount;
      else if (t.category === 'MARKETING_ADS') marketing += amount;
      else if (t.category === 'UTILITIES') utilities += amount;
      else if (['OPERATING_EXPENSE', 'OTHER_EXPENSE', 'INTERNAL'].includes(String(t.category || ''))) otherOpex += amount;
      else if (!nonOpexCategories.has(String(t.category || ''))) {
        // Unknown categories must be classified at source. Guessing from a free
        // text label can silently turn inventory/debt movements into expenses.
        unclassifiedPaymentCount += 1;
        unclassifiedPaymentAmount += amount;
      }
    });

    const totalOPEX = rent + salary + marketing + utilities + otherOpex;
    const operatingProfit = cogsStats.grossProfit - totalOPEX; // EBIT

    // Other Income & Expenses
    const otherIncome = filteredData.txs
      .filter(t => t.type === 'RECEIPT' && t.isPLAccounted !== false && t.category === 'OTHER_INCOME')
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    const netProfit = operatingProfit + otherIncome;
    const netProfitMargin = revenueStats.netRevenue > 0 ? (netProfit / revenueStats.netRevenue) * 100 : 0;

    return {
      rent,
      salary,
      marketing,
      utilities,
      otherOpex,
      totalOPEX,
      operatingProfit,
      otherIncome,
      netProfit,
      netProfitMargin,
      unclassifiedPaymentCount,
      unclassifiedPaymentAmount
    };
  }, [filteredData.txs, cogsStats.grossProfit, revenueStats.netRevenue]);

  // 5. Stock Value
  const stockStats = useMemo(() => {
    const inStockDevices = devices.filter(d => d.status === 'in_stock' && (effectiveBranchId === 'ALL' || !effectiveBranchId || d.branchId === effectiveBranchId || d.branchId === selectedBranchId));
    let missingCostCount = 0;
    let missingReceivedDateCount = 0;
    const totalStockValue = inStockDevices.reduce((sum, d) => {
      const cost = Number((d as any).currentCost ?? (d as any).buyPrice ?? NaN);
      if (!Number.isFinite(cost) || cost < 0) {
        missingCostCount += 1;
        return sum;
      }
      return sum + cost;
    }, 0);
    const today = getVietnamDateString();
    const agedStock30Days = inStockDevices.filter(d => {
      const received = dateOnlyInVietnam((d as any).receivedDate || (d as any).createdAt);
      if (!received) {
        missingReceivedDateCount += 1;
        return false;
      }
      const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${received}T00:00:00Z`)) / 86_400_000);
      return days > 30;
    });
    const stockAgeBuckets = [0, 15, 30, 60, 90].map((lower, index, bounds) => {
      const upper = bounds[index + 1];
      const items = inStockDevices.filter(device => {
        const received = dateOnlyInVietnam((device as any).receivedDate || (device as any).createdAt);
        if (!received) return false;
        const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${received}T00:00:00Z`)) / 86_400_000);
        return days >= lower && (upper === undefined ? true : days < upper);
      });
      return { label: upper === undefined ? `≥${lower} ngày` : `${lower}–${upper - 1} ngày`, count: items.length };
    });

    return { inStockDevices, totalStockValue, agedStock30Days, stockAgeBuckets, missingCostCount, missingReceivedDateCount };
  }, [devices, effectiveBranchId, selectedBranchId]);

  const handleExportCsv = () => {
    const branchLabel = branches.find(branch => branch.id === effectiveBranchId)?.name
      || (effectiveBranchId === 'ALL' ? 'Toàn hệ thống' : effectiveBranchId);
    const rows: Array<[string, string | number]> = [
      ['Chi nhánh', branchLabel],
      ['Kỳ báo cáo', reportRange.label],
      ['Từ ngày', reportRange.from],
      ['Đến ngày', reportRange.to],
      ['Doanh thu thiết bị', revenueStats.deviceRevenue],
      ['Doanh thu phụ kiện', revenueStats.accessoryRevenue],
      ['Doanh thu sửa chữa', revenueStats.repairRevenue],
      ['Doanh thu chưa phân bổ', revenueStats.unallocatedRevenue],
      ['Giảm giá', revenueStats.discountTotal],
      ['Doanh thu thuần', revenueStats.netRevenue],
      ['Giá vốn thiết bị', cogsStats.deviceCost],
      ['Giá vốn phụ kiện', cogsStats.accessoryCost],
      ['Chi phí linh kiện sửa chữa', cogsStats.repairPartsCost],
      ['Tổng giá vốn', cogsStats.totalCOGS],
      ['Lợi nhuận gộp', cogsStats.grossProfit],
      ['Chi phí hoạt động', opexStats.totalOPEX],
      ['Khoản chi chưa phân loại P&L', opexStats.unclassifiedPaymentAmount],
      ['Lợi nhuận hoạt động', opexStats.operatingProfit],
      ['Thu nhập khác', opexStats.otherIncome],
      ['Lợi nhuận ròng', opexStats.netProfit],
      ['Biên lợi nhuận ròng (%)', Number(opexStats.netProfitMargin.toFixed(2))],
      ['Máy đang tồn', stockStats.inStockDevices.length],
      ['Giá vốn máy đang tồn', stockStats.totalStockValue],
      ['Hóa đơn đã ghi nhận', revenueStats.invoiceCount],
      ['Hóa đơn thiếu dòng', revenueStats.invoicesWithoutLines],
      ['Dòng/máy thiếu giá vốn', cogsStats.missingCostCount + stockStats.missingCostCount]
    ];
    if (cashFlowReport) {
      rows.push(
        ['Số dư quỹ đầu kỳ', cashFlowReport.total.openingBalance],
        ['Thu bên ngoài trong kỳ', cashFlowReport.total.externalReceipts],
        ['Chi bên ngoài trong kỳ', cashFlowReport.total.externalPayments],
        ['Số dư quỹ cuối kỳ', cashFlowReport.total.closingBalance],
        ['Luân chuyển nội bộ - thu', cashFlowReport.total.internalReceipts],
        ['Luân chuyển nội bộ - chi', cashFlowReport.total.internalPayments]
      );
    }
    const csv = buildReportCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `bao-cao-${effectiveBranchId || 'ALL'}-${reportRange.from || 'ky'}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200 max-w-[1600px] mx-auto text-zinc-900 font-sans pb-16">
      
      {/* 1. Header & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-zinc-200/80 shadow-2xs">
        <div>
          <div className="flex items-center space-x-2 text-[#ff4b16] text-xs font-bold uppercase tracking-wider">
            <BarChart3 className="w-4 h-4" />
            <span>Báo Cáo Điều Hành · Server-authoritative sources</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-zinc-900 mt-1 tracking-tight">
            Báo Cáo Điều Hành Kết Quả Kinh Doanh (P&L)
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            POS, kho, kỹ thuật và sổ quỹ • {branches.find(b => b.id === effectiveBranchId)?.name || (effectiveBranchId === 'ALL' ? 'Toàn Hệ Thống' : effectiveBranchId)}
          </p>
        </div>

        {/* Time Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center bg-zinc-100 p-1 rounded-xl text-xs font-bold overflow-x-auto">
            {[
              { id: 'today', label: 'Hôm nay' },
              { id: 'yesterday', label: 'Hôm qua' },
              { id: '7days', label: '7 ngày' },
              { id: 'month', label: 'Tháng này' },
              { id: 'last_month', label: 'Tháng trước' },
              { id: 'custom', label: 'Tùy chọn...' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTimeRange(t.id as any)}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
                  timeRange === t.id ? 'bg-white text-[#ff4b16] shadow-2xs font-black' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCsv}
            className="p-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer shrink-0"
            title="Tải snapshot báo cáo tổng hợp dạng CSV"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Xuất CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="p-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer shrink-0"
            title="In báo cáo tài chính P&L"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">In Báo Cáo</span>
          </button>
        </div>
      </div>

      {/* Custom Date Range Picker */}
      {timeRange === 'custom' && (
        <div className="bg-orange-50/70 border border-orange-200/80 p-3 rounded-2xl flex flex-wrap items-center gap-3 animate-in fade-in">
          <span className="text-xs font-bold text-orange-950 flex items-center">
            <Calendar className="w-3.5 h-3.5 mr-1.5 text-[#ff4b16]" />
            Khoảng thời gian hạch toán:
          </span>
          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={customStartDate}
              onChange={e => setCustomStartDate(e.target.value)}
              className="px-3 py-1.5 bg-white border border-zinc-300 rounded-xl text-xs font-medium"
            />
            <span className="text-zinc-400 font-bold">đến</span>
            <input
              type="date"
              value={customEndDate}
              onChange={e => setCustomEndDate(e.target.value)}
              className="px-3 py-1.5 bg-white border border-zinc-300 rounded-xl text-xs font-medium"
            />
          </div>
        </div>
      )}

      {(dataCoverage?.partialDomainCount || remoteReportError || cogsStats.missingCostCount > 0 || stockStats.missingCostCount > 0 || revenueStats.invoicesWithoutLines > 0 || opexStats.unclassifiedPaymentCount > 0 || (!repairReport && remoteReportLoading)) ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="font-black">Cảnh báo chất lượng dữ liệu báo cáo</p>
              {dataCoverage?.partialDomainCount ? <p>Dữ liệu vận hành đang tải chưa đầy đủ ({dataCoverage.partialDomainCount} nhóm partial; hóa đơn {dataCoverage.invoiceLoaded}/{dataCoverage.invoiceTotal}). Không dùng số liệu này để chốt sổ.</p> : null}
              {remoteReportError ? <p>{remoteReportError}</p> : null}
              {cogsStats.missingCostCount > 0 || stockStats.missingCostCount > 0 ? <p>Thiếu giá vốn của {cogsStats.missingCostCount + stockStats.missingCostCount} dòng/máy; hệ thống không dùng tỷ lệ ước tính.</p> : null}
              {revenueStats.invoicesWithoutLines > 0 ? <p>{revenueStats.invoicesWithoutLines} hóa đơn thiếu dòng chi tiết, đã được tính tổng nhưng chưa phân bổ được theo ngành hàng.</p> : null}
              {opexStats.unclassifiedPaymentCount > 0 ? <p>{opexStats.unclassifiedPaymentCount} khoản chi ({formatCurrency(opexStats.unclassifiedPaymentAmount)}) chưa có nhóm P&amp;L hợp lệ nên chưa được cộng vào OPEX.</p> : null}
              {repairReport?.coverage === 'PARTIAL' ? <p>Báo cáo sửa chữa vượt giới hạn tải trang ({repairReport.totalCount} phiếu); cần lọc kỳ/chi nhánh hoặc dùng báo cáo tổng hợp.</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Doanh thu thuần */}
        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <span className="text-xs font-semibold text-zinc-500">1. Doanh Thu Thuần</span>
          <p className="text-xl sm:text-2xl font-black text-zinc-900 mt-1 font-mono">
            {formatCompact(revenueStats.netRevenue)}
          </p>
          <span className="text-[10px] font-semibold text-emerald-600 mt-1 block">
            ✓ {revenueStats.invoiceCount} hóa đơn đã ghi nhận trong kỳ
          </span>
        </div>

        {/* Giá vốn hàng bán (COGS) */}
        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <span className="text-xs font-semibold text-zinc-500">2. Giá Vốn (COGS)</span>
          <p className="text-xl sm:text-2xl font-black text-amber-700 mt-1 font-mono">
            {formatCompact(cogsStats.totalCOGS)}
          </p>
          <span className="text-[10px] font-semibold text-zinc-500 mt-1 block">
            {cogsStats.missingCostCount > 0 ? `${cogsStats.missingCostCount} dòng thiếu giá vốn` : `${revenueStats.netRevenue > 0 ? ((cogsStats.totalCOGS / revenueStats.netRevenue) * 100).toFixed(1) : 0}% trên doanh thu`}
          </span>
        </div>

        {/* Lợi nhuận gộp */}
        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <span className="text-xs font-semibold text-zinc-500">3. Lợi Nhuận Gộp</span>
          <p className={`text-xl sm:text-2xl font-black mt-1 font-mono ${cogsStats.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatCompact(cogsStats.grossProfit)}
          </p>
          <span className="text-[10px] font-semibold text-emerald-700 mt-1 block">
            Biên lãi gộp: {cogsStats.grossMarginPercent.toFixed(1)}%
          </span>
        </div>

        {/* Chi phí hoạt động OPEX */}
        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <span className="text-xs font-semibold text-zinc-500">4. Chi Phí (OPEX)</span>
          <p className="text-xl sm:text-2xl font-black text-rose-600 mt-1 font-mono">
            {formatCompact(opexStats.totalOPEX)}
          </p>
          <span className="text-[10px] font-semibold text-zinc-500 mt-1 block">
            Mặt bằng, Lương, Ads, Điện nước
          </span>
        </div>

        {/* Lợi nhuận ròng Net Profit */}
        <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-orange-500 to-[#e03e0e] text-white p-4 rounded-2xl shadow-md shadow-orange-500/20">
          <span className="text-xs font-bold text-orange-100 uppercase tracking-wider">5. Lợi Nhuận Ròng</span>
          <p className="text-xl sm:text-2xl font-black mt-1 font-mono text-white">
            {formatCompact(opexStats.netProfit)}
          </p>
          <span className="text-[10px] font-bold text-orange-100 mt-1 block">
            Biên lãi ròng: {opexStats.netProfitMargin.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="bg-white p-1.5 rounded-2xl border border-zinc-200/80 shadow-2xs flex space-x-1.5 overflow-x-auto">
        {[
          { id: 'PL_STATEMENT', label: '📊 P&L Điều Hành', desc: 'Bảng Kết Quả Hoạt Động Kinh Doanh' },
          { id: 'REVENUE_STRUCTURE', label: '🛍️ Cơ Cấu Ngành Hàng', desc: 'iPhone, Phụ kiện & Kỹ thuật' },
          { id: 'STOCK_AGING', label: '📦 Tồn Kho & Rủi Ro Vốn', desc: 'Tuổi hàng tồn & Vốn đọng' },
          { id: 'CASH_FLOW', label: '💰 Dòng Tiền & Quỹ Thực Tế', desc: 'Tiền mặt và tài khoản VietQR' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-2 ${
              activeTab === tab.id
                ? 'bg-[#ff4b16] text-white shadow-xs'
                : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* =========================================================================
          TAB 1: BÁO CÁO P&L CHUẨN KẾ TOÁN (INCOME STATEMENT TABLE)
      ========================================================================= */}
      {activeTab === 'PL_STATEMENT' && (
        <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-2xs overflow-hidden">
          {/* Statement Header */}
          <div className="p-5 sm:p-6 bg-gradient-to-r from-zinc-900 to-zinc-800 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-orange-400 font-bold">
                PHONEHOUSECRM · MANAGEMENT REPORT
              </span>
              <h2 className="text-lg sm:text-xl font-black tracking-tight mt-0.5">
                BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
              </h2>
              <p className="text-xs text-zinc-300 mt-1">
                 Kỳ báo cáo: {reportRange.label} • Múi giờ: Asia/Ho_Chi_Minh • Đơn vị: VNĐ
              </p>
            </div>
            <div className="text-right font-mono">
              <span className="text-xs text-zinc-400 block">LỢI NHUẬN RÒNG CUỐI KỲ</span>
              <span className="text-xl sm:text-2xl font-black text-emerald-400">
                {formatCurrency(opexStats.netProfit)}
              </span>
              <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-zinc-400">
                {remoteReportLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
                {remoteReportLoading ? 'Đang đồng bộ nguồn server' : `Cập nhật ${getVietnamTimeWithSecondsString()}`}
              </span>
            </div>
          </div>

          {/* Statement Body Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-zinc-100/80 border-b border-zinc-200 text-zinc-600 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">STT</th>
                  <th className="py-3 px-4">Chỉ Tiêu Tài Chính (P&L Items)</th>
                  <th className="py-3 px-4 w-32 text-center">Mã Số</th>
                  <th className="py-3 px-4 text-right w-44">Số Tiền (VNĐ)</th>
                  <th className="py-3 px-4 text-right w-32">% Doanh Thu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-medium">
                
                {/* 1. DOANH THU THUẦN */}
                <tr className="bg-orange-50/40 font-bold text-zinc-900">
                  <td className="py-3 px-4 text-center font-mono">I</td>
                  <td className="py-3 px-4 font-black text-sm text-zinc-900">DOANH THU BÁN HÀNG & CUNG CẤP DỊCH VỤ</td>
                  <td className="py-3 px-4 text-center font-mono text-zinc-400">REV-01</td>
                  <td className="py-3 px-4 text-right font-mono font-black text-zinc-900">{formatCurrency(revenueStats.grossRevenue)}</td>
                  <td className="py-3 px-4 text-right font-mono">100.0%</td>
                </tr>
                <tr className="text-zinc-600 hover:bg-zinc-50">
                  <td className="py-2.5 px-4 text-center text-zinc-400">1.1</td>
                  <td className="py-2.5 px-4 pl-8">Doanh thu bán điện thoại iPhone & iPad</td>
                  <td className="py-2.5 px-4 text-center font-mono text-zinc-400">01.1</td>
                  <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(revenueStats.deviceRevenue)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-zinc-400">
                    {revenueStats.grossRevenue > 0 ? ((revenueStats.deviceRevenue / revenueStats.grossRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr className="text-zinc-600 hover:bg-zinc-50">
                  <td className="py-2.5 px-4 text-center text-zinc-400">1.2</td>
                  <td className="py-2.5 px-4 pl-8">Doanh thu bán phụ kiện chính hãng</td>
                  <td className="py-2.5 px-4 text-center font-mono text-zinc-400">01.2</td>
                  <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(revenueStats.accessoryRevenue)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-zinc-400">
                    {revenueStats.grossRevenue > 0 ? ((revenueStats.accessoryRevenue / revenueStats.grossRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                {revenueStats.unallocatedRevenue > 0 ? <tr className="bg-amber-50/50 text-amber-900">
                  <td className="py-2.5 px-4 text-center text-zinc-400">1.3</td>
                  <td className="py-2.5 px-4 pl-8">Doanh thu chưa phân bổ (hóa đơn thiếu dòng)</td>
                  <td className="py-2.5 px-4 text-center font-mono text-zinc-400">01.3</td>
                  <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(revenueStats.unallocatedRevenue)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-zinc-400">{revenueStats.grossRevenue > 0 ? ((revenueStats.unallocatedRevenue / revenueStats.grossRevenue) * 100).toFixed(1) : 0}%</td>
                </tr> : null}
                <tr className="text-zinc-600 hover:bg-zinc-50">
                  <td className="py-2.5 px-4 text-center text-zinc-400">1.4</td>
                  <td className="py-2.5 px-4 pl-8">Doanh thu dịch vụ kỹ thuật sửa chữa</td>
                  <td className="py-2.5 px-4 text-center font-mono text-zinc-400">01.4</td>
                  <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(revenueStats.repairRevenue)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-zinc-400">
                    {revenueStats.grossRevenue > 0 ? ((revenueStats.repairRevenue / revenueStats.grossRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr className="text-rose-600 hover:bg-rose-50/40">
                  <td className="py-2.5 px-4 text-center">1.5</td>
                  <td className="py-2.5 px-4 pl-8">Các khoản giảm trừ (Giảm giá, chiết khấu, voucher)</td>
                  <td className="py-2.5 px-4 text-center font-mono text-zinc-400">REV-02</td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold">-{formatCurrency(revenueStats.discountTotal)}</td>
                  <td className="py-2.5 px-4 text-right font-mono">
                    {revenueStats.grossRevenue > 0 ? ((revenueStats.discountTotal / revenueStats.grossRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr className="bg-emerald-50/50 font-bold text-emerald-950">
                  <td className="py-3 px-4 text-center font-mono">II</td>
                  <td className="py-3 px-4 font-black">DOANH THU THUẦN (Net Revenue)</td>
                  <td className="py-3 px-4 text-center font-mono text-emerald-700">REV-10</td>
                  <td className="py-3 px-4 text-right font-mono font-black text-emerald-700 text-sm">{formatCurrency(revenueStats.netRevenue)}</td>
                  <td className="py-3 px-4 text-right font-mono">100.0%</td>
                </tr>

                {/* 2. GIÁ VỐN HÀNG BÁN */}
                <tr className="bg-zinc-50 font-bold text-zinc-900">
                  <td className="py-3 px-4 text-center font-mono">III</td>
                  <td className="py-3 px-4 font-black">GIÁ VỐN HÀNG BÁN (COGS)</td>
                  <td className="py-3 px-4 text-center font-mono text-zinc-400">COGS-11</td>
                  <td className="py-3 px-4 text-right font-mono font-black text-amber-800">{formatCurrency(cogsStats.totalCOGS)}</td>
                  <td className="py-3 px-4 text-right font-mono">
                    {revenueStats.netRevenue > 0 ? ((cogsStats.totalCOGS / revenueStats.netRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr className="text-zinc-600 hover:bg-zinc-50">
                  <td className="py-2.5 px-4 text-center text-zinc-400">3.1</td>
                  <td className="py-2.5 px-4 pl-8">Giá vốn máy iPhone / iPad xuất bán (theo IMEI)</td>
                  <td className="py-2.5 px-4 text-center font-mono text-zinc-400">11.1</td>
                  <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(cogsStats.deviceCost)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-zinc-400">
                    {revenueStats.netRevenue > 0 ? ((cogsStats.deviceCost / revenueStats.netRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr className="text-zinc-600 hover:bg-zinc-50">
                  <td className="py-2.5 px-4 text-center text-zinc-400">3.2</td>
                  <td className="py-2.5 px-4 pl-8">Giá vốn phụ kiện xuất bán</td>
                  <td className="py-2.5 px-4 text-center font-mono text-zinc-400">11.2</td>
                  <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(cogsStats.accessoryCost)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-zinc-400">
                    {revenueStats.netRevenue > 0 ? ((cogsStats.accessoryCost / revenueStats.netRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr className="text-zinc-600 hover:bg-zinc-50">
                  <td className="py-2.5 px-4 text-center text-zinc-400">3.3</td>
                  <td className="py-2.5 px-4 pl-8">Chi phí linh kiện thay thế kỹ thuật</td>
                  <td className="py-2.5 px-4 text-center font-mono text-zinc-400">11.3</td>
                  <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(cogsStats.repairPartsCost)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-zinc-400">
                    {revenueStats.netRevenue > 0 ? ((cogsStats.repairPartsCost / revenueStats.netRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>

                {/* 3. LỢI NHUẬN GỘP */}
                <tr className="bg-emerald-100/60 font-black text-emerald-950">
                  <td className="py-3 px-4 text-center font-mono">IV</td>
                  <td className="py-3 px-4 font-black text-sm">LỢI NHUẬN GỘP (Gross Profit = II - III)</td>
                  <td className="py-3 px-4 text-center font-mono text-emerald-800">GP-20</td>
                  <td className="py-3 px-4 text-right font-mono font-black text-emerald-700 text-sm">{formatCurrency(cogsStats.grossProfit)}</td>
                  <td className="py-3 px-4 text-right font-mono font-black text-emerald-700">
                    {cogsStats.grossMarginPercent.toFixed(1)}%
                  </td>
                </tr>

                {/* 4. CHI PHÍ HOẠT ĐỘNG (OPEX) */}
                <tr className="bg-zinc-50 font-bold text-zinc-900">
                  <td className="py-3 px-4 text-center font-mono">V</td>
                  <td className="py-3 px-4 font-black">CHI PHÍ HOẠT ĐỘNG DOANH NGHIỆP (OPEX)</td>
                  <td className="py-3 px-4 text-center font-mono text-zinc-400">OPEX-21</td>
                  <td className="py-3 px-4 text-right font-mono font-black text-rose-600">{formatCurrency(opexStats.totalOPEX)}</td>
                  <td className="py-3 px-4 text-right font-mono">
                    {revenueStats.netRevenue > 0 ? ((opexStats.totalOPEX / revenueStats.netRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr className="text-zinc-600 hover:bg-zinc-50">
                  <td className="py-2.5 px-4 text-center text-zinc-400">5.1</td>
                  <td className="py-2.5 px-4 pl-8">Chi phí thuê mặt bằng showroom</td>
                  <td className="py-2.5 px-4 text-center font-mono text-zinc-400">21.1</td>
                  <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(opexStats.rent)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-zinc-400">
                    {revenueStats.netRevenue > 0 ? ((opexStats.rent / revenueStats.netRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr className="text-zinc-600 hover:bg-zinc-50">
                  <td className="py-2.5 px-4 text-center text-zinc-400">5.2</td>
                  <td className="py-2.5 px-4 pl-8">Chi phí lương, thưởng, hoa hồng nhân sự</td>
                  <td className="py-2.5 px-4 text-center font-mono text-zinc-400">21.2</td>
                  <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(opexStats.salary)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-zinc-400">
                    {revenueStats.netRevenue > 0 ? ((opexStats.salary / revenueStats.netRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr className="text-zinc-600 hover:bg-zinc-50">
                  <td className="py-2.5 px-4 text-center text-zinc-400">5.3</td>
                  <td className="py-2.5 px-4 pl-8">Chi phí Marketing, truyền thông & Ads</td>
                  <td className="py-2.5 px-4 text-center font-mono text-zinc-400">21.3</td>
                  <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(opexStats.marketing)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-zinc-400">
                    {revenueStats.netRevenue > 0 ? ((opexStats.marketing / revenueStats.netRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr className="text-zinc-600 hover:bg-zinc-50">
                  <td className="py-2.5 px-4 text-center text-zinc-400">5.4</td>
                  <td className="py-2.5 px-4 pl-8">Chi phí điện, nước, internet & tiện ích</td>
                  <td className="py-2.5 px-4 text-center font-mono text-zinc-400">21.4</td>
                  <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(opexStats.utilities)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-zinc-400">
                    {revenueStats.netRevenue > 0 ? ((opexStats.utilities / revenueStats.netRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr className="text-zinc-600 hover:bg-zinc-50">
                  <td className="py-2.5 px-4 text-center text-zinc-400">5.5</td>
                  <td className="py-2.5 px-4 pl-8">Chi phí quản lý & vận hành khác</td>
                  <td className="py-2.5 px-4 text-center font-mono text-zinc-400">21.5</td>
                  <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(opexStats.otherOpex)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-zinc-400">
                    {revenueStats.netRevenue > 0 ? ((opexStats.otherOpex / revenueStats.netRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>

                {/* 5. LỢI NHUẬN THUẦN HĐKD */}
                <tr className="bg-amber-50/60 font-bold text-zinc-900">
                  <td className="py-3 px-4 text-center font-mono">VI</td>
                  <td className="py-3 px-4 font-black">LỢI NHUẬN THUẦN TỪ HĐKD (EBIT = IV - V)</td>
                  <td className="py-3 px-4 text-center font-mono text-amber-700">EBIT-30</td>
                  <td className={`py-3 px-4 text-right font-mono font-black ${opexStats.operatingProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {formatCurrency(opexStats.operatingProfit)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    {revenueStats.netRevenue > 0 ? ((opexStats.operatingProfit / revenueStats.netRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>

                {/* 6. THU NHẬP KHÁC */}
                <tr className="text-zinc-600 hover:bg-zinc-50">
                  <td className="py-2.5 px-4 text-center text-zinc-400">VII</td>
                  <td className="py-2.5 px-4">Thu nhập khác (Thanh lý, lãi tiền gửi...)</td>
                  <td className="py-2.5 px-4 text-center font-mono text-zinc-400">OTH-40</td>
                  <td className="py-2.5 px-4 text-right font-mono text-emerald-600">+{formatCurrency(opexStats.otherIncome)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-zinc-400">
                    {revenueStats.netRevenue > 0 ? ((opexStats.otherIncome / revenueStats.netRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>

                {/* 7. TỔNG LỢI NHUẬN RÒNG CUỐI KỲ */}
                <tr className="bg-gradient-to-r from-orange-500 to-[#e03e0e] text-white font-black text-sm">
                  <td className="py-4 px-4 text-center font-mono">VIII</td>
                  <td className="py-4 px-4 font-black text-base">TỔNG LỢI NHUẬN RÒNG CUỐI KỲ (NET PROFIT = VI + VII)</td>
                  <td className="py-4 px-4 text-center font-mono text-orange-200">NET-60</td>
                  <td className="py-4 px-4 text-right font-mono font-black text-lg text-white">
                    {formatCurrency(opexStats.netProfit)}
                  </td>
                  <td className="py-4 px-4 text-right font-mono font-black text-orange-100">
                    {opexStats.netProfitMargin.toFixed(1)}%
                  </td>
                </tr>

              </tbody>
            </table>
          </div>

          {/* Statement Footer Note */}
          <div className="p-4 bg-zinc-50 border-t border-zinc-200/80 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-zinc-500 gap-2">
            <span className="flex items-center">
              <ShieldCheck className="w-4 h-4 mr-1 text-emerald-600" />
              Báo cáo quản trị; giá vốn và nguồn dữ liệu thiếu được cảnh báo, không tự suy đoán.
            </span>
            <span>Ký xác nhận: Kế toán trưởng & Ban Giám Đốc</span>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: CƠ CẤU NGÀNH HÀNG & DOANH THU
      ========================================================================= */}
      {activeTab === 'REVENUE_STRUCTURE' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-3xl border border-zinc-200/80 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-100 pb-3">
              Cơ Cấu Doanh Thu Theo Ngành Hàng
            </h3>
            <div className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between font-bold text-zinc-700 mb-1">
                  <span>1. Điện Thoại & Tablet (iPhone / iPad)</span>
                  <span className="font-mono text-zinc-900">
                    {formatCurrency(revenueStats.deviceRevenue)} ({revenueStats.grossRevenue > 0 ? ((revenueStats.deviceRevenue / revenueStats.grossRevenue) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-zinc-100 rounded-full h-2.5">
                  <div
                    className="bg-[#ff4b16] h-2.5 rounded-full"
                    style={{ width: `${revenueStats.grossRevenue > 0 ? (revenueStats.deviceRevenue / revenueStats.grossRevenue) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between font-bold text-zinc-700 mb-1">
                  <span>2. Phụ Kiện Chính Hãng (Cáp, Sạc, Tai Nghe, Ốp)</span>
                  <span className="font-mono text-zinc-900">
                    {formatCurrency(revenueStats.accessoryRevenue)} ({revenueStats.grossRevenue > 0 ? ((revenueStats.accessoryRevenue / revenueStats.grossRevenue) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-zinc-100 rounded-full h-2.5">
                  <div
                    className="bg-amber-500 h-2.5 rounded-full"
                    style={{ width: `${revenueStats.grossRevenue > 0 ? (revenueStats.accessoryRevenue / revenueStats.grossRevenue) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between font-bold text-zinc-700 mb-1">
                  <span>3. Dịch Vụ Kỹ Thuật & Sửa Chữa</span>
                  <span className="font-mono text-zinc-900">
                    {formatCurrency(revenueStats.repairRevenue)} ({revenueStats.grossRevenue > 0 ? ((revenueStats.repairRevenue / revenueStats.grossRevenue) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-zinc-100 rounded-full h-2.5">
                  <div
                    className="bg-purple-600 h-2.5 rounded-full"
                    style={{ width: `${revenueStats.grossRevenue > 0 ? (revenueStats.repairRevenue / revenueStats.grossRevenue) * 100 : 0}%` }}
                  />
                </div>
              </div>
              {revenueStats.unallocatedRevenue > 0 ? <div>
                <div className="flex justify-between font-bold text-amber-800 mb-1">
                  <span>4. Chưa phân bổ (thiếu dòng hóa đơn)</span>
                  <span className="font-mono">{formatCurrency(revenueStats.unallocatedRevenue)} ({revenueStats.grossRevenue > 0 ? ((revenueStats.unallocatedRevenue / revenueStats.grossRevenue) * 100).toFixed(1) : 0}%)</span>
                </div>
                <div className="w-full bg-zinc-100 rounded-full h-2.5"><div className="bg-amber-500 h-2.5 rounded-full" style={{ width: `${revenueStats.grossRevenue > 0 ? (revenueStats.unallocatedRevenue / revenueStats.grossRevenue) * 100 : 0}%` }} /></div>
              </div> : null}
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-zinc-200/80 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-100 pb-3">
              Chi Tiết Chi Phí Vận Hành (OPEX Breakdown)
            </h3>
            <div className="space-y-3 text-xs">
              {[
                { label: 'Mặt bằng Showroom', amount: opexStats.rent, color: 'bg-blue-500' },
                { label: 'Lương & Hoa hồng nhân sự', amount: opexStats.salary, color: 'bg-emerald-500' },
                { label: 'Marketing & Quảng cáo Ads', amount: opexStats.marketing, color: 'bg-purple-500' },
                { label: 'Điện, Nước & Tiện ích', amount: opexStats.utilities, color: 'bg-amber-500' },
                { label: 'Chi phí quản lý khác', amount: opexStats.otherOpex, color: 'bg-zinc-500' }
              ].map((item, idx) => (
                <div key={idx}>
                  <div className="flex justify-between font-bold text-zinc-700 mb-1">
                    <span>{item.label}</span>
                    <span className="font-mono text-zinc-900">
                      {formatCurrency(item.amount)} ({opexStats.totalOPEX > 0 ? ((item.amount / opexStats.totalOPEX) * 100).toFixed(1) : 0}%)
                    </span>
                  </div>
                  <div className="w-full bg-zinc-100 rounded-full h-2">
                    <div
                      className={`${item.color} h-2 rounded-full`}
                      style={{ width: `${opexStats.totalOPEX > 0 ? (item.amount / opexStats.totalOPEX) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: TUỔI TỒN KHO & RỦI RO ĐỌNG VỐN
      ========================================================================= */}
      {activeTab === 'STOCK_AGING' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-3xl border border-zinc-200/80 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-100 pb-3">
              Phân Tích Tuổi Tồn Kho & Rủi Ro Đọng Vốn
            </h3>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                {stockStats.stockAgeBuckets.map((bucket, index) => (
                  <div key={bucket.label} className={`rounded-2xl border p-3 ${index >= 3 ? 'border-rose-200 bg-rose-50' : index === 2 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                    <span className="block text-[11px] font-bold text-zinc-600">{bucket.label}</span>
                    <strong className="mt-1 block font-mono text-lg text-zinc-900">{bucket.count} máy</strong>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500">Tuổi hàng tính từ ngày nhận máy theo múi giờ Việt Nam. Tab này hiện bao gồm máy IMEI; phụ kiện/linh kiện cần báo cáo tồn SKU riêng.</p>
              {stockStats.missingReceivedDateCount > 0 ? <p className="text-[11px] font-bold text-amber-700">{stockStats.missingReceivedDateCount} máy thiếu ngày nhận nên chưa được phân nhóm tuổi.</p> : null}
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-zinc-200/80 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-100 pb-3">
              Giá Trị Tồn Kho Thực Tế Theo Kho
            </h3>
            <div className="space-y-2.5">
              <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl flex items-center justify-between">
                <div>
                   <span className="text-xs font-bold text-zinc-700">Giá vốn máy đang tồn (canonical cost):</span>
                  <p className="text-lg font-black text-zinc-900 font-mono mt-0.5">{formatCurrency(stockStats.totalStockValue)}</p>
                </div>
                <span className="text-xs font-bold px-3 py-1 bg-white border border-zinc-200 rounded-xl text-zinc-700">
                   {stockStats.inStockDevices.length} máy sẵn kho
                 </span>
              </div>
              {stockStats.missingCostCount > 0 ? <p className="text-[11px] font-bold text-amber-700">Chưa định giá được {stockStats.missingCostCount} máy; tổng trên chưa bao gồm các máy này.</p> : null}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: DÒNG TIỀN THỰC & SỐ DƯ QUỸ
      ========================================================================= */}
      {activeTab === 'CASH_FLOW' && (
        <div className="space-y-4">
          {cashFlowReport ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { label: 'Số dư đầu kỳ', value: cashFlowReport.total.openingBalance, color: 'text-zinc-900' },
                  { label: 'Thu trong kỳ', value: cashFlowReport.total.externalReceipts, color: 'text-emerald-700' },
                  { label: 'Chi trong kỳ', value: cashFlowReport.total.externalPayments, color: 'text-rose-700' },
                  { label: 'Số dư cuối kỳ', value: cashFlowReport.total.closingBalance, color: 'text-[#ff4b16]' }
                ].map(item => <div key={item.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs"><span className="block text-[10px] font-bold uppercase text-zinc-500">{item.label}</span><strong className={`mt-1 block font-mono text-lg ${item.color}`}>{formatCurrency(item.value)}</strong></div>)}
              </div>
              {(cashFlowReport.total.internalReceipts > 0 || cashFlowReport.total.internalPayments > 0) ? <p className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-900">Luân chuyển nội bộ: thu {formatCurrency(cashFlowReport.total.internalReceipts)} · chi {formatCurrency(cashFlowReport.total.internalPayments)}. Khoản này không tính vào doanh thu/chi phí bên ngoài.</p> : null}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cashFlowReport.sources.map(source => <div key={source.id} className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xs"><div className="flex items-center gap-2"><div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${source.kind === 'CASH' ? 'bg-orange-100 text-[#ff4b16]' : 'bg-blue-100 text-blue-700'}`}>{source.kind === 'CASH' ? <DollarSign className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}</div><div><h4 className="text-xs font-bold text-zinc-900">{source.label}</h4><p className="text-[10px] text-zinc-400">{source.rows.length} giao dịch trong kỳ</p></div></div><div className="mt-4 border-t border-zinc-100 pt-3"><span className="block text-[10px] font-bold text-zinc-400">SỐ DƯ CUỐI KỲ</span><strong className="mt-1 block font-mono text-lg text-zinc-900">{formatCurrency(source.closingBalance)}</strong></div></div>)}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">{remoteReportLoading ? 'Đang tải sổ quỹ theo kỳ...' : 'Chưa có dữ liệu sổ quỹ theo kỳ. Vui lòng chọn lại khoảng thời gian hoặc kiểm tra quyền FINANCE_VIEW.'}</div>
          )}
        </div>
      )}

    </div>
  );
};
