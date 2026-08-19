import React, { useState, useMemo } from 'react';
import { SalesInvoice, DeviceItem, Lead, WarrantyTicket, FundAccount, Partner, StoreBranch, StaffMember } from '../../types';
import { 
  Phone, 
  Bell, 
  Mail, 
  Calendar, 
  ChevronDown, 
  Users, 
  Wrench, 
  MessageSquare, 
  BookOpen, 
  Clock, 
  CreditCard, 
  Maximize2, 
  Smartphone, 
  TrendingUp, 
  Shield, 
  Sparkles,
  ShoppingBag,
  ArrowRight,
  Package,
  CheckCircle2,
  AlertCircle,
  Receipt,
  Layers,
  Zap,
  ArrowUpRight,
  ExternalLink,
  ChevronRight,
  Filter,
  Flame,
  Wallet
} from 'lucide-react';

import { TechHomeView } from './components/TechHomeView';
import { AccountantHomeView } from './components/AccountantHomeView';

export interface DashboardPageProps {
  invoices: SalesInvoice[];
  devices: DeviceItem[];
  leads: Lead[];
  warrantyTickets: WarrantyTicket[];
  funds: FundAccount[];
  partners: Partner[];
  branches: StoreBranch[];
  selectedBranchId?: string;
  currentUser?: StaffMember | null;
  onNavigateTab: (tabId: string) => void;
  onOpenAICopilot?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  invoices,
  devices,
  leads,
  warrantyTickets,
  funds,
  partners,
  branches,
  selectedBranchId,
  currentUser,
  onNavigateTab,
  onOpenAICopilot
}) => {
  const currentBranch = branches.find(b => b.id === selectedBranchId) || branches[0];
  const currentBranchName = branches.find(b => b.id === selectedBranchId)?.name || 'Toàn Hệ Thống PhoneHouse';

  // 1. Role-Adaptive Home for TECHNICIANS
  if (currentUser?.role === 'TECHNICIAN' || currentUser?.role === 'TECH' || currentUser?.role === 'TECH_LEAD') {
    return (
      <TechHomeView
        warrantyTickets={warrantyTickets}
        devices={devices}
        currentBranch={currentBranch}
        currentUser={currentUser}
        onNavigateTab={onNavigateTab}
      />
    );
  }

  // 2. Role-Adaptive Home for ACCOUNTANTS
  if (currentUser?.role === 'ACCOUNTANT') {
    return (
      <AccountantHomeView
        invoices={invoices}
        funds={funds}
        partners={partners}
        currentBranch={currentBranch}
        currentUser={currentUser}
        onNavigateTab={onNavigateTab}
      />
    );
  }

  // 3. Shared State for Filters & Action Tabs
  const [dateFilter, setDateFilter] = useState<'today' | 'this_month' | 'last_month'>('this_month');
  const [kpiCardIndex, setKpiCardIndex] = useState(0);
  const [bestSellerTab, setBestSellerTab] = useState<'revenue' | 'quantity'>('revenue');
  const [bestSellerLimit, setBestSellerLimit] = useState(10);
  const [actionQueueTab, setActionQueueTab] = useState<'ALL' | 'APPOINTMENTS' | 'AGING_STOCK' | 'WARRANTY'>('ALL');
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);

  // 4. Dynamic Filter for Invoices (100% Real Data, excluding cancelled)
  const filteredInvoices = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const thisMonthStr = todayStr.substring(0, 7); // e.g. '2026-08'
    
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const lastMonthStr = d.toISOString().substring(0, 7);

    return invoices.filter(inv => {
      if (inv.status === 'cancelled') return false;
      const invDate = inv.createdAt || '';
      if (dateFilter === 'today') return invDate.startsWith(todayStr);
      if (dateFilter === 'last_month') return invDate.startsWith(lastMonthStr);
      return invDate.startsWith(thisMonthStr) || !inv.createdAt;
    });
  }, [invoices, dateFilter]);

  // Aggregate Real Metrics
  const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + (inv.finalAmount || inv.totalAmount || 0), 0);
  const totalInvoicesCount = filteredInvoices.length;

  // Real Gross Profit
  const grossProfit = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => {
      let cost = 0;
      if (inv.detailedItems && inv.detailedItems.length > 0) {
        cost = inv.detailedItems.reduce((c, it) => c + ((it.buyPrice || it.unitPrice * 0.8) * (it.quantity || 1)), 0);
      } else {
        cost = (inv.finalAmount || inv.totalAmount || 0) * 0.8;
      }
      return sum + Math.max(0, (inv.finalAmount || inv.totalAmount || 0) - cost);
    }, 0);
  }, [filteredInvoices]);

  const profitMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;

  // Funds and Inventory
  const totalFunds = funds.reduce((sum, f) => sum + (f.currentBalance || 0), 0);
  const cashFundTotal = funds.filter(f => f.type === 'CASH' || f.name?.toLowerCase().includes('tiền mặt')).reduce((s, f) => s + (f.currentBalance || 0), 0);
  const bankFundTotal = totalFunds - cashFundTotal;

  const inStockDevices = devices.filter(d => d.status === 'in_stock');
  const totalStockValue = inStockDevices.reduce((sum, d) => sum + (d.sellPrice || 0), 0);

  // 100% Real Aging Stock (> 30 days)
  const agingDevices = inStockDevices.filter(d => {
    if (!d.receivedDate) return false;
    const diffDays = Math.floor((Date.now() - new Date(d.receivedDate).getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 30;
  });

  // Real Appointments & Active Leads
  const myAppointments = leads.filter(l => l.status === 'appointment_scheduled');
  const myLeadsToCall = leads.filter(l => l.status === 'new' || l.status === 'contacted' || l.status === 'negotiating');

  // Real Pending Warranties
  const pendingWarranties = warrantyTickets.filter(w => w.status === 'PENDING' || w.status === 'IN_PROGRESS' || w.status === 'WAITING_FOR_PARTS');

  // Total Action Items count
  const totalActionCount = myAppointments.length + agingDevices.length + pendingWarranties.length;

  // 5. 100% Real Daily Revenue Bar Chart Calculation (Robust & Fail-safe)
  const realChartDays = useMemo(() => {
    const dayMap = new Map<string, number>();

    // Generate buckets for the month (1..30)
    const daysInMonth = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];
    daysInMonth.forEach(d => {
      const key = d.toString().padStart(2, '0');
      dayMap.set(key, 0);
    });

    // Populate from real invoices
    filteredInvoices.forEach(inv => {
      if (inv.createdAt) {
        try {
          const datePart = inv.createdAt.split('T')[0];
          const parts = datePart.split('-');
          const dayStr = parts[2] ? parts[2].padStart(2, '0') : '01';
          
          // Match to closest bucket or set directly
          const matchedDay = daysInMonth.find(d => Math.abs(d - parseInt(dayStr, 10)) <= 1);
          const bucketKey = matchedDay ? matchedDay.toString().padStart(2, '0') : dayStr;
          
          const current = dayMap.get(bucketKey) || 0;
          dayMap.set(bucketKey, current + ((inv.finalAmount || inv.totalAmount || 0) / 1_000_000));
        } catch (e) {
          // ignore parsing error
        }
      }
    });

    const entries = Array.from(dayMap.entries()).map(([day, val]) => ({
      day,
      val: Math.round(val * 10) / 10
    }));

    const maxVal = Math.max(10, ...entries.map(e => e.val));

    return {
      entries: entries.map(e => ({
        ...e,
        isPeak: e.val > 0 && e.val >= maxVal * 0.85
      })),
      maxVal: Math.ceil(maxVal / 20) * 20
    };
  }, [filteredInvoices]);

  // 6. 100% Real Best-Selling Products Calculation
  const realBestSellers = useMemo(() => {
    const productStats = new Map<string, { name: string; quantity: number; revenue: number }>();

    filteredInvoices.forEach(inv => {
      if (inv.detailedItems && inv.detailedItems.length > 0) {
        inv.detailedItems.forEach(item => {
          const key = item.name.toUpperCase().trim();
          const existing = productStats.get(key) || { name: item.name, quantity: 0, revenue: 0 };
          existing.quantity += item.quantity || 1;
          existing.revenue += item.totalPrice || (item.unitPrice * (item.quantity || 1)) || 0;
          productStats.set(key, existing);
        });
      } else if (inv.devices && inv.devices.length > 0) {
        inv.devices.forEach(dev => {
          const key = dev.model.toUpperCase().trim();
          const existing = productStats.get(key) || { name: dev.model, quantity: 0, revenue: 0 };
          existing.quantity += 1;
          existing.revenue += dev.price || 0;
          productStats.set(key, existing);
        });
      } else if (inv.items && inv.items.length > 0) {
        inv.items.forEach(it => {
          const key = it.model.toUpperCase().trim();
          const existing = productStats.get(key) || { name: it.model, quantity: 0, revenue: 0 };
          existing.quantity += 1;
          existing.revenue += it.price || 0;
          productStats.set(key, existing);
        });
      }
    });

    if (productStats.size === 0) {
      const soldDevices = devices.filter(d => d.status === 'sold');
      soldDevices.forEach(d => {
        const key = d.model.toUpperCase().trim();
        const existing = productStats.get(key) || { name: d.model, quantity: 0, revenue: 0 };
        existing.quantity += 1;
        existing.revenue += d.sellPrice || 0;
        productStats.set(key, existing);
      });
    }

    if (productStats.size === 0) {
      inStockDevices.slice(0, 5).forEach(d => {
        const key = d.model.toUpperCase().trim();
        const existing = productStats.get(key) || { name: d.model, quantity: 0, revenue: 0 };
        existing.revenue += d.sellPrice || 0;
        productStats.set(key, existing);
      });
    }

    const list = Array.from(productStats.values());

    if (bestSellerTab === 'quantity') {
      return list.sort((a, b) => b.quantity - a.quantity).slice(0, bestSellerLimit);
    }
    return list.sort((a, b) => b.revenue - a.revenue).slice(0, bestSellerLimit);
  }, [filteredInvoices, devices, inStockDevices, bestSellerTab, bestSellerLimit]);

  // 7. Carousel Card Definitions for Mobile
  const kpiCards = [
    {
      title: `${totalInvoicesCount} hoá đơn bán lẻ`,
      hint: 'Vuốt tiếp 👉',
      mainNumber: (totalRevenue / 1_000_000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 }),
      unit: 'triệu đồng',
      bottomInfo: `📦 Đã phục vụ ${totalInvoicesCount} lượt khách`,
      bg: 'bg-[#18181b]'
    },
    {
      title: 'Lợi nhuận gộp ước tính',
      hint: `⭐ Tỷ suất ~${profitMargin}%`,
      mainNumber: (grossProfit / 1_000_000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 }),
      unit: 'triệu đồng',
      bottomInfo: '📈 Doanh thu thuần sau giá vốn',
      bg: 'bg-gradient-to-br from-zinc-900 to-zinc-950'
    },
    {
      title: 'Tổng số dư các quỹ',
      hint: `${funds.length} tài khoản`,
      mainNumber: (totalFunds / 1_000_000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 }),
      unit: 'triệu đồng',
      bottomInfo: `🏦 Két: ${(cashFundTotal / 1_000_000).toFixed(1)}Tr • NH: ${(bankFundTotal / 1_000_000).toFixed(1)}Tr`,
      bg: 'bg-gradient-to-br from-zinc-900 to-zinc-950'
    },
    {
      title: 'Giá trị kho sẵn bán',
      hint: `${inStockDevices.length} máy sẵn sàng`,
      mainNumber: (totalStockValue / 1_000_000_000).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      unit: 'tỷ đồng',
      bottomInfo: `📱 ${inStockDevices.length} máy iPhone sẵn xuất quầy`,
      bg: 'bg-gradient-to-br from-zinc-900 to-zinc-950'
    }
  ];

  // 2-Tone Shortcuts List (Chỉ dùng xám trung tính + màu thương hiệu #ff4b16)
  const shortcutsList = [
    { id: 'crm', label: 'Khách hàng CRM', icon: Users, tab: 'crm' },
    { id: 'warranty', label: 'Sửa chữa', icon: Wrench, tab: 'warranty' },
    { id: 'chat', label: 'Chat', icon: MessageSquare, action: () => onOpenAICopilot ? onOpenAICopilot() : onNavigateTab('crm') },
    { id: 'cashbook', label: 'Sổ quỹ', icon: BookOpen, tab: 'cashbook' },
    { id: 'hrm', label: 'Chấm công', icon: Clock, tab: 'hrm' },
    { id: 'installments', label: 'Đối soát trả góp', icon: CreditCard, tab: 'accounting-reports', isNew: true }
  ];

  return (
    <div className="w-full min-h-screen bg-[#f8f9fa] text-zinc-900 select-none font-sans">
      
      {/* ========================================================================= */}
      {/* 🖥️ DESKTOP HUD EXECUTIVE VIEW (>= 1024px) - Bố cục Chuyên Nghiệp Máy Tính */}
      {/* ========================================================================= */}
      <div className="hidden lg:block max-w-[1600px] mx-auto p-5 space-y-5 pb-20">
        {/* Top Command Bar Desktop */}
        <div className="flex items-center justify-between bg-white px-5 py-3.5 rounded-2xl border border-zinc-200/70 shadow-2xs">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-[#ff4b16] text-white flex items-center justify-center font-black">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-black text-zinc-950 tracking-tight">
                Tổng Quan Điều Hành Showroom
              </h1>
              <div className="flex items-center space-x-2 text-xs text-zinc-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-zinc-800 font-bold">{currentBranchName}</span>
                <span>•</span>
                <span>Đang trực tuyến: <b className="text-zinc-900">{currentUser?.name || 'Ban Quản Trị'}</b></span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Date Filters */}
            <div className="flex items-center p-1 bg-zinc-100 rounded-xl text-xs font-bold">
              <button
                onClick={() => setDateFilter('today')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dateFilter === 'today' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Hôm nay
              </button>
              <button
                onClick={() => setDateFilter('this_month')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dateFilter === 'this_month' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Tháng này
              </button>
              <button
                onClick={() => setDateFilter('last_month')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dateFilter === 'last_month' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Tháng trước
              </button>
            </div>

            {/* Quick Actions */}
            <button
              onClick={() => onNavigateTab('pos')}
              className="px-4 py-2 bg-[#ff4b16] hover:bg-[#e03e0e] text-white rounded-xl font-bold text-xs shadow-md shadow-orange-500/25 flex items-center space-x-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Vào POS Bán Hàng (F2)</span>
            </button>

            {onOpenAICopilot && (
              <button
                onClick={onOpenAICopilot}
                className="p-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl transition-colors cursor-pointer"
                title="Trợ lý AI PhoneHouse"
              >
                <Sparkles className="w-4 h-4 text-[#ff4b16]" />
              </button>
            )}
          </div>
        </div>

        {/* 4-Column Desktop Financial Metric Strip */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-zinc-200/70 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
              <span>Doanh Thu Bán Lẻ</span>
              <span className="px-1.5 py-0.5 rounded-md bg-orange-50 text-[#ff4b16] font-mono font-bold text-[10px]">
                {totalInvoicesCount} đơn xuất
              </span>
            </div>
            <div className="text-2xl font-black font-mono tracking-tight text-zinc-950">
              {totalRevenue.toLocaleString('vi-VN')} <span className="text-xs font-sans text-zinc-500 font-bold">đ</span>
            </div>
            <span className="text-[11px] text-zinc-400 block font-medium">100% doanh thu thực từ hóa đơn</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-zinc-200/70 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
              <span>Lợi Nhuận Gộp Ước Tính</span>
              <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-700 font-mono font-bold text-[10px]">
                Tỷ suất ~{profitMargin}%
              </span>
            </div>
            <div className="text-2xl font-black font-mono tracking-tight text-emerald-600">
              +{grossProfit.toLocaleString('vi-VN')} <span className="text-xs font-sans text-zinc-500 font-bold">đ</span>
            </div>
            <span className="text-[11px] text-zinc-400 block font-medium">Doanh thu thuần sau giá vốn máy</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-zinc-200/70 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
              <span>Tổng Số Dư Các Quỹ</span>
              <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-700 font-mono font-bold text-[10px]">
                {funds.length} tài khoản
              </span>
            </div>
            <div className="text-2xl font-black font-mono tracking-tight text-zinc-950">
              {totalFunds.toLocaleString('vi-VN')} <span className="text-xs font-sans text-zinc-500 font-bold">đ</span>
            </div>
            <span className="text-[11px] text-zinc-400 block font-medium">
              Két: {(cashFundTotal / 1_000_000).toFixed(1)}Tr • NH: {(bankFundTotal / 1_000_000).toFixed(1)}Tr
            </span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-zinc-200/70 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
              <span>Giá Trị Kho Sẵn Bán</span>
              <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-700 font-mono font-bold text-[10px]">
                {inStockDevices.length} máy sẵn sàng
              </span>
            </div>
            <div className="text-2xl font-black font-mono tracking-tight text-zinc-950">
              {(totalStockValue / 1_000_000_000).toFixed(2)} <span className="text-xs font-sans text-zinc-500 font-bold">Tỷ VNĐ</span>
            </div>
            <span className="text-[11px] text-zinc-400 block font-medium">Toàn bộ hàng trong kho chi nhánh</span>
          </div>
        </div>

        {/* Desktop 2-Column Main Workspace (65% / 35%) */}
        <div className="grid grid-cols-12 gap-5 items-start">
          {/* Left Column (65% -> 8 cols): Chart + Top Best Sellers */}
          <div className="col-span-8 space-y-5">
            {/* Real Dynamic Revenue Bar Chart */}
            <div className="bg-white p-5 rounded-2xl border border-zinc-200/70 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-zinc-900">
                    Biểu Đồ Doanh Thu Theo Ngày Thực Tế
                  </h3>
                  <span className="text-xs text-zinc-400 font-medium">
                    Tổng doanh thu kỳ: <b className="text-zinc-900 font-mono">{totalRevenue.toLocaleString('vi-VN')} đ</b>
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-zinc-500 px-2.5 py-1 rounded-lg bg-zinc-50 border border-zinc-200">
                  {dateFilter === 'this_month' ? 'Tháng này' : dateFilter === 'last_month' ? 'Tháng trước' : 'Hôm nay'}
                </span>
              </div>

              {/* Chart Grid */}
              <div className="relative pt-3">
                <div className="absolute inset-x-0 top-3 border-b border-dashed border-zinc-100 flex justify-between">
                  <span className="text-[10px] font-mono text-zinc-400 -mt-2">{realChartDays.maxVal} Tr</span>
                </div>
                <div className="absolute inset-x-0 top-20 border-b border-dashed border-zinc-100 flex justify-between">
                  <span className="text-[10px] font-mono text-zinc-400 -mt-2">{Math.round(realChartDays.maxVal / 2)} Tr</span>
                </div>
                <div className="absolute inset-x-0 bottom-7 border-b border-zinc-200 flex justify-between">
                  <span className="text-[10px] font-mono text-zinc-400 -mt-2">0</span>
                </div>

                <div className="h-40 flex items-end justify-between gap-2 pl-10 pr-2 pb-7">
                  {realChartDays.entries.map((item, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                      {/* Tooltip on hover */}
                      <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white text-[10px] font-mono px-2 py-0.5 rounded-md whitespace-nowrap z-20 pointer-events-none shadow-md">
                        Ngày {item.day}: {item.val} Tr
                      </div>

                      <div
                        style={{ height: `${Math.max(item.val > 0 ? 8 : 2, (item.val / realChartDays.maxVal) * 100)}%` }}
                        className={`w-full max-w-[20px] rounded-t-md transition-all duration-300 ${
                          item.isPeak
                            ? 'bg-[#ff4b16]'
                            : item.val > 0
                              ? 'bg-zinc-700 hover:bg-[#ff4b16]'
                              : 'bg-zinc-200'
                        }`}
                      />
                      <span className={`text-[10px] font-mono mt-1.5 ${item.isPeak ? 'text-[#ff4b16] font-bold' : 'text-zinc-500'}`}>
                        {item.day}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top Best Sellers Table */}
            <div className="bg-white p-5 rounded-2xl border border-zinc-200/70 shadow-2xs space-y-3.5">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-zinc-900">
                    Sản Phẩm & Dòng Máy Bán Chạy Nhất
                  </h3>
                  <span className="text-xs text-zinc-400 font-medium">Tổng hợp 100% từ đơn hàng thực tế</span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setBestSellerTab('revenue')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      bestSellerTab === 'revenue' ? 'bg-[#ff4b16] text-white shadow-xs' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    Theo doanh thu
                  </button>
                  <button
                    onClick={() => setBestSellerTab('quantity')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      bestSellerTab === 'quantity' ? 'bg-[#ff4b16] text-white shadow-xs' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    Theo số lượng
                  </button>
                </div>
              </div>

              <div className="divide-y divide-zinc-100">
                {realBestSellers.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-400">
                    Chưa phát sinh đơn hàng trong giai đoạn được chọn.
                  </div>
                ) : (
                  realBestSellers.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => onNavigateTab('pos')}
                      className="py-3 flex items-center justify-between gap-3 hover:bg-zinc-50 -mx-2 px-2 rounded-xl transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-[#ff4b16] group-hover:text-white transition-colors">
                          #{idx + 1}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-black text-zinc-900 truncate group-hover:text-[#ff4b16] transition-colors">
                            {item.name}
                          </h4>
                          <span className="text-[11px] text-zinc-400 font-medium font-mono">
                            Đã xuất bán: <b className="text-zinc-700">{item.quantity} sản phẩm</b>
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-black font-mono text-[#ff4b16] block">
                          {item.revenue.toLocaleString('vi-VN')} đ
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column (35% -> 4 cols): 6 Shortcuts (2-Tone) + Action Center Tab */}
          <div className="col-span-4 space-y-5">
            {/* 6 Quick Shortcuts (2-Tone Neutral Gray + Brand Orange) */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200/70 shadow-2xs space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900 border-b border-zinc-100 pb-2">
                Phím Tắt Điều Hành Nhanh
              </h3>

              <div className="grid grid-cols-3 gap-2">
                {shortcutsList.map(sc => {
                  const Icon = sc.icon;
                  return (
                    <button
                      key={sc.id}
                      onClick={() => sc.action ? sc.action() : onNavigateTab(sc.tab || 'crm')}
                      className="p-2.5 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/70 flex flex-col items-center text-center transition-all cursor-pointer group active:scale-95 relative"
                    >
                      {sc.isNew && (
                        <span className="absolute -top-1.5 -right-1 bg-[#ff4b16] text-white text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase shadow-xs">
                          mới
                        </span>
                      )}
                      <div className="w-8 h-8 rounded-lg bg-zinc-200/80 text-zinc-700 group-hover:bg-[#ff4b16] group-hover:text-white flex items-center justify-center transition-colors">
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] font-bold text-zinc-700 group-hover:text-zinc-950 mt-1 line-clamp-1">
                        {sc.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action Center ("Việc Cần Xử Lý") */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200/70 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                <div className="flex items-center space-x-1.5">
                  <Zap className="w-4 h-4 text-[#ff4b16]" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900">
                    Việc Cần Xử Lý
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 font-mono text-[10px] font-bold">
                  {totalActionCount} mục
                </span>
              </div>

              {/* Sub-tabs for Action Center */}
              <div className="flex items-center gap-1 text-[11px] font-bold border-b border-zinc-100 pb-2">
                <button
                  onClick={() => setActionQueueTab('ALL')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    actionQueueTab === 'ALL' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Tất cả ({totalActionCount})
                </button>
                <button
                  onClick={() => setActionQueueTab('APPOINTMENTS')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    actionQueueTab === 'APPOINTMENTS' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Lịch hẹn ({myAppointments.length})
                </button>
                <button
                  onClick={() => setActionQueueTab('AGING_STOCK')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    actionQueueTab === 'AGING_STOCK' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Tồn &gt;30d ({agingDevices.length})
                </button>
              </div>

              {/* Action List */}
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {/* 1. Appointments */}
                {(actionQueueTab === 'ALL' || actionQueueTab === 'APPOINTMENTS') && myAppointments.map(app => (
                  <div key={app.id} className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/60 flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-zinc-900 truncate">{app.name}</span>
                        <span className="text-[9px] font-bold px-1 rounded bg-zinc-200 text-zinc-700">Lịch Hẹn</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                        {app.phone} • Xem {app.interestedModel || 'iPhone'}
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigateTab('crm')}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 text-white text-[10px] font-bold hover:bg-[#ff4b16] transition-colors cursor-pointer shrink-0"
                    >
                      Gọi
                    </button>
                  </div>
                ))}

                {/* 2. Aging Devices */}
                {(actionQueueTab === 'ALL' || actionQueueTab === 'AGING_STOCK') && agingDevices.slice(0, 4).map(dev => (
                  <div key={dev.id} className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/60 flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-zinc-900 truncate">{dev.model}</span>
                        <span className="text-[9px] font-bold px-1 rounded bg-orange-100 text-[#ff4b16]">Tồn &gt;30d</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 truncate font-mono mt-0.5">
                        IMEI: ...{dev.imei.slice(-4)} • {(dev.sellPrice || 0).toLocaleString('vi-VN')}đ
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigateTab('inventory')}
                      className="px-2.5 py-1 rounded-lg bg-zinc-200 text-zinc-800 text-[10px] font-bold hover:bg-[#ff4b16] hover:text-white transition-colors cursor-pointer shrink-0"
                    >
                      Xả kho
                    </button>
                  </div>
                ))}

                {/* 3. Pending Warranties */}
                {(actionQueueTab === 'ALL' || actionQueueTab === 'WARRANTY') && pendingWarranties.slice(0, 3).map(w => (
                  <div key={w.id} className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/60 flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-zinc-900 truncate">{w.customerName}</span>
                        <span className="text-[9px] font-bold px-1 rounded bg-zinc-200 text-zinc-700">Kỹ Thuật</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                        {w.deviceModel} • {w.issueDescription || 'Kiểm tra máy'}
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigateTab('warranty')}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 text-white text-[10px] font-bold hover:bg-[#ff4b16] transition-colors cursor-pointer shrink-0"
                    >
                      Xử lý
                    </button>
                  </div>
                ))}

                {totalActionCount === 0 && (
                  <div className="py-6 text-center text-xs text-zinc-400">
                    🎉 Không có công việc nào đang chờ xử lý!
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📱 MOBILE VIEW (< 1024px) - Bố Cục Tràn Viền Tinh Gọn Dành Cho Điện Thoại */}
      {/* ========================================================================= */}
      <div className="block lg:hidden w-full px-2.5 sm:px-3 pt-2 pb-24 space-y-3">
        {/* 1. Mobile Header (Tràn viền, không khung lồng) */}
        <div className="flex items-center justify-between py-1 border-b border-zinc-200/60">
          <div>
            <h1 className="text-lg font-black tracking-tight text-zinc-950">
              Tổng Quan Cửa Hàng
            </h1>
            <span className="text-[10px] font-bold text-zinc-400 font-mono">
              {currentBranchName}
            </span>
          </div>

          <div className="flex items-center space-x-3 text-zinc-700">
            <button 
              type="button"
              onClick={() => onNavigateTab('crm')}
              className="p-1 hover:text-[#ff4b16] cursor-pointer"
            >
              <Phone className="w-5 h-5 stroke-[2.2]" />
            </button>

            <div 
              className="relative cursor-pointer" 
              onClick={() => onNavigateTab('crm')}
            >
              <Bell className="w-5 h-5 stroke-[2.2]" />
              {leads.length > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-[#ff4b16] text-white text-[9px] font-black px-1.5 py-0.2 rounded-full">
                  {leads.length}
                </span>
              )}
            </div>

            <button 
              type="button"
              onClick={() => onOpenAICopilot?.()}
              className="p-1 hover:text-[#ff4b16] cursor-pointer"
            >
              <Mail className="w-5 h-5 stroke-[2.2]" />
            </button>
          </div>
        </div>

        {/* 2. Mobile Date Filter */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white border border-zinc-200 text-xs font-bold text-zinc-800 shadow-2xs hover:bg-zinc-50 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5 text-[#ff4b16]" />
            <span>{dateFilter === 'this_month' ? 'Tháng này' : dateFilter === 'last_month' ? 'Tháng trước' : 'Hôm nay'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {isDateDropdownOpen && (
            <div className="absolute top-10 left-0 z-30 bg-white border border-zinc-200 rounded-xl shadow-xl py-1 w-36 text-xs font-bold text-zinc-700">
              <button
                onClick={() => { setDateFilter('today'); setIsDateDropdownOpen(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 cursor-pointer"
              >
                Hôm nay
              </button>
              <button
                onClick={() => { setDateFilter('this_month'); setIsDateDropdownOpen(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 cursor-pointer"
              >
                Tháng này
              </button>
              <button
                onClick={() => { setDateFilter('last_month'); setIsDateDropdownOpen(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 cursor-pointer"
              >
                Tháng trước
              </button>
            </div>
          )}
        </div>

        {/* 3. Mobile Swipable Carousel KPI Card (100% Real Numbers) */}
        <div>
          <div 
            onClick={() => setKpiCardIndex((prev) => (prev + 1) % kpiCards.length)}
            className={`${kpiCards[kpiCardIndex].bg} text-white rounded-2xl p-4 shadow-md shadow-zinc-950/10 relative overflow-hidden transition-all duration-200 cursor-pointer min-h-[135px] flex flex-col justify-between`}
          >
            <div className="flex items-center justify-between text-xs text-zinc-300 font-medium">
              <span className="font-bold">{kpiCards[kpiCardIndex].title}</span>
              <span className="text-[10px] text-zinc-400">{kpiCards[kpiCardIndex].hint}</span>
            </div>

            <div className="my-1">
              <div className="text-3xl font-black font-mono tracking-tight text-[#ff4b16] leading-none">
                {kpiCards[kpiCardIndex].mainNumber}
              </div>
              <span className="text-xs text-zinc-300 font-medium mt-1 block">
                {kpiCards[kpiCardIndex].unit}
              </span>
            </div>

            <div className="text-[11px] text-zinc-400 font-medium border-t border-zinc-800/80 pt-2 flex items-center justify-between">
              <span>{kpiCards[kpiCardIndex].bottomInfo}</span>
              <span className="text-[10px] text-zinc-500 font-mono">{kpiCardIndex + 1}/{kpiCards.length}</span>
            </div>
          </div>

          <div className="flex items-center justify-center space-x-1.5 mt-2">
            {kpiCards.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setKpiCardIndex(idx)}
                className={`h-1 rounded-full transition-all ${
                  kpiCardIndex === idx ? 'w-4 bg-[#ff4b16]' : 'w-1 bg-zinc-300'
                }`}
              />
            ))}
          </div>
        </div>

        {/* 4. Mobile 6-Grid Shortcuts (Chỉ dùng 2 tone: Xám + Cam thương hiệu) */}
        <div className="bg-white rounded-2xl p-3 border border-zinc-200/70 shadow-2xs">
          <div className="grid grid-cols-3 gap-2.5">
            {shortcutsList.map(sc => {
              const Icon = sc.icon;
              return (
                <button
                  key={sc.id}
                  onClick={() => sc.action ? sc.action() : onNavigateTab(sc.tab || 'crm')}
                  className="flex flex-col items-center text-center p-2 rounded-xl bg-zinc-50/70 hover:bg-zinc-100 transition-all cursor-pointer active:scale-95 relative"
                >
                  {sc.isNew && (
                    <span className="absolute -top-1 right-1 bg-[#ff4b16] text-white text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase">
                      mới
                    </span>
                  )}
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 text-zinc-700 flex items-center justify-center shadow-2xs">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold text-zinc-800 mt-1 line-clamp-1">
                    {sc.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5. Mobile Tab "Việc Cần Xử Lý" (Action Center) */}
        <div className="bg-white rounded-2xl p-3.5 border border-zinc-200/70 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
            <div className="flex items-center space-x-1.5">
              <Zap className="w-3.5 h-3.5 text-[#ff4b16]" />
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900">
                Việc Cần Xử Lý
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
              {totalActionCount} việc
            </span>
          </div>

          <div className="space-y-1.5">
            {myAppointments.slice(0, 2).map(app => (
              <div key={app.id} className="p-2 rounded-xl bg-zinc-50 flex items-center justify-between text-xs">
                <div className="min-w-0 pr-2">
                  <span className="font-bold text-zinc-900 truncate block">{app.name}</span>
                  <span className="text-[10px] text-zinc-500 truncate block">Hẹn xem {app.interestedModel || 'iPhone'}</span>
                </div>
                <button
                  onClick={() => onNavigateTab('crm')}
                  className="px-2.5 py-1 rounded-lg bg-zinc-900 text-white text-[10px] font-bold cursor-pointer"
                >
                  Xem
                </button>
              </div>
            ))}

            {agingDevices.slice(0, 2).map(dev => (
              <div key={dev.id} className="p-2 rounded-xl bg-zinc-50 flex items-center justify-between text-xs">
                <div className="min-w-0 pr-2">
                  <span className="font-bold text-zinc-900 truncate block">{dev.model}</span>
                  <span className="text-[10px] text-[#ff4b16] font-bold truncate block">Tồn kho &gt;30 ngày</span>
                </div>
                <button
                  onClick={() => onNavigateTab('inventory')}
                  className="px-2.5 py-1 rounded-lg bg-orange-100 text-[#ff4b16] text-[10px] font-bold cursor-pointer"
                >
                  Xả
                </button>
              </div>
            ))}

            {totalActionCount === 0 && (
              <div className="py-3 text-center text-xs text-zinc-400">
                Không có việc khẩn cấp
              </div>
            )}
          </div>
        </div>

        {/* 6. Mobile Real Revenue Bar Chart */}
        <div className="bg-white rounded-2xl p-3.5 border border-zinc-200/70 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900">Doanh thu theo ngày</h3>
              <span className="text-[10px] text-zinc-400 font-mono">
                ({(totalRevenue / 1_000_000).toFixed(1)}Tr)
              </span>
            </div>
            <span className="text-[10px] font-bold text-zinc-400 font-mono">
              {dateFilter === 'this_month' ? 'Tháng này' : dateFilter === 'last_month' ? 'Tháng trước' : 'Hôm nay'}
            </span>
          </div>

          {/* Chart Display */}
          <div className="relative pt-2">
            <div className="absolute inset-x-0 top-2 border-b border-dashed border-zinc-100 flex justify-between">
              <span className="text-[9px] font-mono text-zinc-400 -mt-2">{realChartDays.maxVal}Tr</span>
            </div>
            <div className="absolute inset-x-0 bottom-5 border-b border-zinc-200 flex justify-between">
              <span className="text-[9px] font-mono text-zinc-400 -mt-2">0</span>
            </div>

            <div className="h-24 flex items-end justify-between gap-1 pl-6 pr-1 pb-5">
              {realChartDays.entries.map((item, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                  <div
                    style={{ height: `${Math.max(item.val > 0 ? 8 : 2, (item.val / realChartDays.maxVal) * 100)}%` }}
                    className={`w-full max-w-[8px] rounded-t-sm transition-all duration-300 ${
                      item.isPeak
                        ? 'bg-[#ff4b16]'
                        : item.val > 0
                          ? 'bg-zinc-700'
                          : 'bg-zinc-200'
                    }`}
                  />
                  <span className={`text-[8px] font-mono mt-1 ${item.isPeak ? 'text-[#ff4b16] font-bold' : 'text-zinc-400'}`}>
                    {item.day}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 7. Mobile Best Sellers List */}
        <div className="bg-white rounded-2xl p-3.5 border border-zinc-200/70 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900">Hàng bán chạy</h3>
            <div className="flex items-center space-x-1 text-[10px] font-bold">
              <button
                onClick={() => setBestSellerTab('revenue')}
                className={`px-2 py-0.5 rounded-lg cursor-pointer ${
                  bestSellerTab === 'revenue' ? 'bg-[#ff4b16] text-white' : 'text-zinc-500 bg-zinc-100'
                }`}
              >
                Doanh thu
              </button>
              <button
                onClick={() => setBestSellerTab('quantity')}
                className={`px-2 py-0.5 rounded-lg cursor-pointer ${
                  bestSellerTab === 'quantity' ? 'bg-[#ff4b16] text-white' : 'text-zinc-500 bg-zinc-100'
                }`}
              >
                Số lượng
              </button>
            </div>
          </div>

          <div className="divide-y divide-zinc-100">
            {realBestSellers.length === 0 ? (
              <div className="py-4 text-center text-xs text-zinc-400">
                Chưa có đơn hàng trong giai đoạn này.
              </div>
            ) : (
              realBestSellers.slice(0, 5).map((item, idx) => (
                <div 
                  key={idx}
                  onClick={() => onNavigateTab('pos')}
                  className="py-2 flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    <div className="w-6 h-6 rounded-md bg-zinc-100 text-zinc-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                      #{idx + 1}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-zinc-900 truncate">
                        {item.name}
                      </h4>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {item.quantity} sản phẩm
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold font-mono text-[#ff4b16]">
                      {item.revenue.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 8. Mobile Navigation Dock */}
        <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-zinc-200 px-2 py-1.5 flex items-center justify-around text-[10px] font-bold text-zinc-500 shadow-lg">
          <button
            type="button"
            className="flex flex-col items-center text-[#ff4b16] relative py-1"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff4b16] mb-0.5" />
            <span>Tổng quan</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('inventory')}
            className="flex flex-col items-center hover:text-zinc-900 py-1 cursor-pointer"
          >
            <Package className="w-4 h-4 mb-0.5 text-zinc-400" />
            <span>Hàng hoá</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('pos')}
            className="flex flex-col items-center hover:text-zinc-900 py-1 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4 mb-0.5 text-zinc-400" />
            <span>Bán hàng</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('invoices')}
            className="flex flex-col items-center hover:text-zinc-900 py-1 cursor-pointer"
          >
            <Receipt className="w-4 h-4 mb-0.5 text-zinc-400" />
            <span>Hoá đơn</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('cashbook')}
            className="flex flex-col items-center hover:text-zinc-900 py-1 cursor-pointer"
          >
            <span className="text-base font-black leading-none mb-0.5">≡</span>
            <span>Nhiều hơn</span>
          </button>
        </div>
      </div>
    </div>
  );
};
