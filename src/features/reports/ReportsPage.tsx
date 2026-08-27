import React, { useState, useMemo } from 'react';
import { 
  SalesInvoice, DeviceItem, WarrantyTicket, FundAccount, StoreBranch, 
  StaffMember, CashTransaction 
} from '../../types';
import { 
  BarChart3, TrendingUp, DollarSign, Calendar, Package, Wrench, Award, 
  Filter, Download, Printer, ArrowUpRight, ArrowDownLeft, PieChart, 
  Building2, Users, ShoppingCart, HelpCircle, ShieldCheck, ChevronRight, CheckCircle2, FileSpreadsheet
} from 'lucide-react';
import { getPreviousVietnamMonthString, getVietnamDateString, getVietnamRelativeDateString } from '../../utils/dateTimeUtils';

export interface ReportsPageProps {
  invoices: SalesInvoice[];
  devices: DeviceItem[];
  warrantyTickets: WarrantyTicket[];
  funds: FundAccount[];
  branches: StoreBranch[];
  selectedBranchId?: string;
  currentUser?: StaffMember | null;
  cashTransactions?: CashTransaction[];
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

const formatCompact = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { notation: "compact", maximumFractionDigits: 2 }).format(amount).replace('T', 'tr');
};

export const ReportsPage: React.FC<ReportsPageProps> = ({
  invoices = [],
  devices = [],
  warrantyTickets = [],
  funds = [],
  branches = [],
  selectedBranchId = 'ALL',
  currentUser,
  cashTransactions = []
}) => {
  const [activeTab, setActiveTab] = useState<'PL_STATEMENT' | 'REVENUE_STRUCTURE' | 'STOCK_AGING' | 'CASH_FLOW'>('PL_STATEMENT');
  const [timeRange, setTimeRange] = useState<'today' | 'yesterday' | '7days' | 'month' | 'last_month' | 'custom'>('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // 1. Filtered Data by Branch & Time Range
  const filteredData = useMemo(() => {
    const todayStr = getVietnamDateString();
    const yesterdayStr = getVietnamRelativeDateString(-1);
    const past7Str = getVietnamRelativeDateString(-6);
    const thisMonthStr = todayStr.slice(0, 7);
    const lastMonthStr = getPreviousVietnamMonthString();

    const matchesTime = (dateStr?: string) => {
      if (!dateStr) return true;
      const dateOnly = dateStr.slice(0, 10);
      if (timeRange === 'today') return dateOnly === todayStr;
      if (timeRange === 'yesterday') return dateOnly === yesterdayStr;
      if (timeRange === '7days') return dateOnly >= past7Str;
      if (timeRange === 'month') return dateOnly.startsWith(thisMonthStr);
      if (timeRange === 'last_month') return dateOnly.startsWith(lastMonthStr);
      if (timeRange === 'custom') {
        if (customStartDate && dateOnly < customStartDate) return false;
        if (customEndDate && dateOnly > customEndDate) return false;
        return true;
      }
      return true;
    };

    const matchesBranch = (branchId?: string) => {
      return !selectedBranchId || selectedBranchId === 'ALL' || branchId === selectedBranchId;
    };

    const invs = invoices.filter(inv => matchesBranch(inv.branchId) && matchesTime(inv.createdAt || (inv as any).date));
    const txs = cashTransactions.filter(tx => matchesBranch(tx.branchId) && matchesTime(tx.date));
    const warrs = warrantyTickets.filter(w => matchesBranch(w.branchId) && matchesTime(w.createdAt));
    
    return { invs, txs, warrs };
  }, [invoices, cashTransactions, warrantyTickets, selectedBranchId, timeRange, customStartDate, customEndDate]);

  // 2. Revenue Calculations
  const revenueStats = useMemo(() => {
    const invs = filteredData.invs;

    // Gross Revenue & Discounts
    let deviceRevenue = 0;
    let accessoryRevenue = 0;
    let discountTotal = 0;

    invs.forEach(inv => {
      discountTotal += (inv.discountAmount || 0);
      inv.items?.forEach((item: any) => {
        const lineTotal = item.totalPrice || item.finalPrice || (item.price * (item.quantity || 1)) || 0;
        if (item.deviceId || item.imei) {
          deviceRevenue += lineTotal;
        } else {
          accessoryRevenue += lineTotal;
        }
      });
    });

    // Repair Revenue
    const repairRevenue = filteredData.warrs
      .filter(w => w.status === 'delivered' || w.status === 'completed')
      .reduce((sum, w) => sum + (w.finalCost || w.estimatedCost || 0), 0);

    const grossRevenue = deviceRevenue + accessoryRevenue + repairRevenue;
    const netRevenue = Math.max(0, grossRevenue - discountTotal);

    return {
      deviceRevenue,
      accessoryRevenue,
      repairRevenue,
      discountTotal,
      grossRevenue,
      netRevenue,
      invoiceCount: invs.length
    };
  }, [filteredData]);

  // 3. Cost of Goods Sold (COGS - Giá vốn hàng bán)
  const cogsStats = useMemo(() => {
    let deviceCost = 0;
    let accessoryCost = 0;

    filteredData.invs.forEach(inv => {
      inv.items?.forEach((item: any) => {
        if (item.deviceId || item.imei) {
          // Look up device in inventory for exact importPrice
          const matchedDev = devices.find(d => d.id === item.deviceId || d.imei === item.imei);
          const cost = matchedDev?.importPrice || (item.price ? item.price * 0.86 : 0);
          deviceCost += cost;
        } else {
          const cost = item.costPrice ? (item.costPrice * (item.quantity || 1)) : ((item.price || 0) * 0.65 * (item.quantity || 1));
          accessoryCost += cost;
        }
      });
    });

    // Repair parts cost
    const repairPartsCost = filteredData.warrs
      .filter(w => w.status === 'delivered' || w.status === 'completed')
      .reduce((sum, w) => sum + ((w.partsCost || 0) || ((w.finalCost || 0) * 0.45)), 0);

    const totalCOGS = deviceCost + accessoryCost + repairPartsCost;
    const grossProfit = revenueStats.netRevenue - totalCOGS;
    const grossMarginPercent = revenueStats.netRevenue > 0 ? (grossProfit / revenueStats.netRevenue) * 100 : 0;

    return {
      deviceCost,
      accessoryCost,
      repairPartsCost,
      totalCOGS,
      grossProfit,
      grossMarginPercent
    };
  }, [filteredData, devices, revenueStats.netRevenue]);

  // 4. Operating Expenses (OPEX - Chi phí hoạt động hạch toán)
  const opexStats = useMemo(() => {
    // Only payments with isPLAccounted !== false
    const accountedPayments = filteredData.txs.filter(t => t.type === 'PAYMENT' && t.isPLAccounted !== false);

    let rent = 0;
    let salary = 0;
    let marketing = 0;
    let utilities = 0;
    let otherOpex = 0;

    accountedPayments.forEach(t => {
      if (t.category === 'STORE_RENT' || t.categoryName?.includes('mặt bằng')) rent += t.amount;
      else if (t.category === 'SALARY_BONUS' || t.categoryName?.includes('lương')) salary += t.amount;
      else if (t.category === 'MARKETING_ADS' || t.categoryName?.includes('quảng cáo') || t.categoryName?.includes('Marketing')) marketing += t.amount;
      else if (t.category === 'UTILITIES' || t.categoryName?.includes('điện') || t.categoryName?.includes('nước')) utilities += t.amount;
      else if (t.category !== 'INVENTORY_PURCHASE' && t.category !== 'SUPPLIER_DEBT_PAY' && t.category !== 'TRADEIN_BUYBACK') {
        otherOpex += t.amount;
      }
    });

    const totalOPEX = rent + salary + marketing + utilities + otherOpex;
    const operatingProfit = cogsStats.grossProfit - totalOPEX; // EBIT

    // Other Income & Expenses
    const otherIncome = filteredData.txs
      .filter(t => t.type === 'RECEIPT' && t.isPLAccounted !== false && t.category === 'OTHER_INCOME')
      .reduce((s, t) => s + t.amount, 0);

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
      netProfitMargin
    };
  }, [filteredData.txs, cogsStats.grossProfit, revenueStats.netRevenue]);

  // 5. Stock Value
  const stockStats = useMemo(() => {
    const inStockDevices = devices.filter(d => d.status === 'in_stock' && (!selectedBranchId || selectedBranchId === 'ALL' || d.branchId === selectedBranchId));
    const totalStockValue = inStockDevices.reduce((sum, d) => sum + (d.importPrice || (d.sellPrice * 0.8) || 0), 0);
    const agedStock30Days = inStockDevices.filter(d => {
      const days = (Date.now() - new Date(d.createdAt || Date.now()).getTime()) / (1000 * 3600 * 24);
      return days > 30;
    });

    return { inStockDevices, totalStockValue, agedStock30Days };
  }, [devices, selectedBranchId]);

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200 max-w-[1600px] mx-auto text-zinc-900 font-sans pb-16">
      
      {/* 1. Header & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-zinc-200/80 shadow-2xs">
        <div>
          <div className="flex items-center space-x-2 text-[#ff4b16] text-xs font-bold uppercase tracking-wider">
            <BarChart3 className="w-4 h-4" />
            <span>Hệ Thống Báo Cáo Tài Chính Chuẩn Kế Toán</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-zinc-900 mt-1 tracking-tight">
            Báo Cáo Kết Quả Hoạt Động Kinh Doanh (P&L)
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Dữ liệu hạch toán tự động từ POS, Kho hàng và Sổ quỹ thu chi • {branches.find(b => b.id === selectedBranchId)?.name || 'Toàn Hệ Thống'}
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

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Doanh thu thuần */}
        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <span className="text-xs font-semibold text-zinc-500">1. Doanh Thu Thuần</span>
          <p className="text-xl sm:text-2xl font-black text-zinc-900 mt-1 font-mono">
            {formatCompact(revenueStats.netRevenue)}
          </p>
          <span className="text-[10px] font-semibold text-emerald-600 mt-1 block">
            ✓ {revenueStats.invoiceCount} hóa đơn bán lẻ
          </span>
        </div>

        {/* Giá vốn hàng bán (COGS) */}
        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <span className="text-xs font-semibold text-zinc-500">2. Giá Vốn (COGS)</span>
          <p className="text-xl sm:text-2xl font-black text-amber-700 mt-1 font-mono">
            {formatCompact(cogsStats.totalCOGS)}
          </p>
          <span className="text-[10px] font-semibold text-zinc-500 mt-1 block">
            {revenueStats.netRevenue > 0 ? ((cogsStats.totalCOGS / revenueStats.netRevenue) * 100).toFixed(1) : 0}% trên doanh thu
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
          { id: 'PL_STATEMENT', label: '📊 Báo Cáo P&L Chuẩn Kế Toán', desc: 'Bảng Kết Quả Hoạt Động Kinh Doanh' },
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
                PHARMACY / RETAIL STANDARD FINANCIAL STATEMENT
              </span>
              <h2 className="text-lg sm:text-xl font-black tracking-tight mt-0.5">
                BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
              </h2>
              <p className="text-xs text-zinc-300 mt-1">
                Kỳ kế toán: {timeRange === 'today' ? 'Hôm nay' : timeRange === 'month' ? 'Tháng hiện tại' : 'Chu kỳ được chọn'} • Đơn vị tính: VNĐ
              </p>
            </div>
            <div className="text-right font-mono">
              <span className="text-xs text-zinc-400 block">LỢI NHUẬN RÒNG CUỐI KỲ</span>
              <span className="text-xl sm:text-2xl font-black text-emerald-400">
                {formatCurrency(opexStats.netProfit)}
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
                <tr className="text-zinc-600 hover:bg-zinc-50">
                  <td className="py-2.5 px-4 text-center text-zinc-400">1.3</td>
                  <td className="py-2.5 px-4 pl-8">Doanh thu dịch vụ kỹ thuật sửa chữa</td>
                  <td className="py-2.5 px-4 text-center font-mono text-zinc-400">01.3</td>
                  <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(revenueStats.repairRevenue)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-zinc-400">
                    {revenueStats.grossRevenue > 0 ? ((revenueStats.repairRevenue / revenueStats.grossRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
                <tr className="text-rose-600 hover:bg-rose-50/40">
                  <td className="py-2.5 px-4 text-center">1.4</td>
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
              Số liệu chuẩn hóa từ chứng từ hạch toán hệ thống PhoneHouse CRM.
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
              <div className="p-4 bg-emerald-50 border border-emerald-200/70 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="font-black text-emerald-900 block text-sm">Tồn kho dưới 15 ngày (Hàng xoay nhanh)</span>
                  <span className="text-[11px] text-emerald-700 mt-0.5 block">Độ thanh khoản cao, giữ giá trị tốt</span>
                </div>
                <span className="font-mono font-black text-emerald-900 text-base">
                  {stockStats.inStockDevices.length - stockStats.agedStock30Days.length} cây
                </span>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200/70 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="font-black text-amber-900 block text-sm">Tồn kho trên 30 ngày (Cần kích cầu / xả kho)</span>
                  <span className="text-[11px] text-amber-700 mt-0.5 block">Nên áp dụng flash sale hoặc tặng kèm quà để thu hồi vốn</span>
                </div>
                <span className="font-mono font-black text-amber-900 text-base">
                  {stockStats.agedStock30Days.length} cây
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-zinc-200/80 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-100 pb-3">
              Giá Trị Tồn Kho Thực Tế Theo Kho
            </h3>
            <div className="space-y-2.5">
              <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-zinc-700">Tổng giá trị vốn đọng trong máy:</span>
                  <p className="text-lg font-black text-zinc-900 font-mono mt-0.5">{formatCurrency(stockStats.totalStockValue)}</p>
                </div>
                <span className="text-xs font-bold px-3 py-1 bg-white border border-zinc-200 rounded-xl text-zinc-700">
                  {stockStats.inStockDevices.length} máy sẵn kho
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: DÒNG TIỀN THỰC & SỐ DƯ QUỸ
      ========================================================================= */}
      {activeTab === 'CASH_FLOW' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {funds.map(f => (
            <div key={f.id} className="bg-white p-5 rounded-3xl border border-zinc-200/80 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold ${f.type === 'CASH' ? 'bg-orange-100 text-[#ff4b16]' : 'bg-blue-100 text-blue-700'}`}>
                    {f.type === 'CASH' ? <DollarSign className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="font-bold text-zinc-900 text-xs">{f.name}</h4>
                    <p className="text-[10px] text-zinc-400">{f.bankName || 'Két tiền mặt showroom'}</p>
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-zinc-100">
                <span className="text-[10px] text-zinc-400 font-semibold block">SỐ DƯ HIỆN TẠI</span>
                <span className="text-lg font-black font-mono text-zinc-900 block mt-0.5">
                  {formatCurrency(f.currentBalance)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};
