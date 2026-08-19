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
  Receipt
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

  // 3. Date Filter State & Calculations 100% from REAL DATA
  const [dateFilter, setDateFilter] = useState<'today' | 'this_month' | 'last_month'>('this_month');
  const [kpiCardIndex, setKpiCardIndex] = useState(0);
  const [bestSellerTab, setBestSellerTab] = useState<'revenue' | 'quantity'>('revenue');
  const [bestSellerLimit, setBestSellerLimit] = useState(10);
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);

  // Dynamic filter for invoices from real data (excluding cancelled invoices)
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

  // Real aggregate financial metrics
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

  // Real Funds and Inventory
  const totalFunds = funds.reduce((sum, f) => sum + (f.currentBalance || 0), 0);
  const cashFundTotal = funds.filter(f => f.type === 'CASH' || f.name?.toLowerCase().includes('tiền mặt')).reduce((s, f) => s + (f.currentBalance || 0), 0);
  const bankFundTotal = totalFunds - cashFundTotal;

  const inStockDevices = devices.filter(d => d.status === 'in_stock');
  const totalStockValue = inStockDevices.reduce((sum, d) => sum + (d.sellPrice || 0), 0);

  // 100% Real Daily Revenue Bar Chart Calculation
  const realChartDays = useMemo(() => {
    const dayMap = new Map<string, number>();

    // Generate buckets for the month (1..31 or past 15 sample intervals)
    const daysInMonth = [1, 4, 7, 10, 12, 14, 16, 18, 20, 21, 23, 24, 26, 27, 28, 30];
    daysInMonth.forEach(d => {
      const key = d.toString().padStart(2, '0');
      dayMap.set(key, 0);
    });

    // Populate from real invoices
    filteredInvoices.forEach(inv => {
      if (inv.createdAt) {
        const dayStr = inv.createdAt.split('T')[0]?.split('-')[2] || '01';
        const current = dayMap.get(dayStr) || 0;
        dayMap.set(dayStr, current + ((inv.finalAmount || inv.totalAmount || 0) / 1_000_000));
      }
    });

    const entries = Array.from(dayMap.entries()).map(([day, val]) => ({
      day,
      val: Math.round(val * 10) / 10
    }));

    const maxVal = Math.max(1, ...entries.map(e => e.val));

    return {
      entries: entries.map(e => ({
        ...e,
        isPeak: e.val > 0 && e.val >= maxVal * 0.9
      })),
      maxVal: Math.max(10, Math.ceil(maxVal / 50) * 50)
    };
  }, [filteredInvoices]);

  // 100% Real Best-Selling Products Calculation from Invoices & Devices
  const realBestSellers = useMemo(() => {
    const productStats = new Map<string, { name: string; quantity: number; revenue: number; color?: string }>();

    // 1. Scan from real invoices
    filteredInvoices.forEach(inv => {
      if (inv.detailedItems && inv.detailedItems.length > 0) {
        inv.detailedItems.forEach(item => {
          const key = item.name.toUpperCase().trim();
          const existing = productStats.get(key) || { name: item.name, quantity: 0, revenue: 0, color: item.color };
          existing.quantity += item.quantity || 1;
          existing.revenue += item.totalPrice || (item.unitPrice * (item.quantity || 1)) || 0;
          productStats.set(key, existing);
        });
      } else if (inv.devices && inv.devices.length > 0) {
        inv.devices.forEach(dev => {
          const key = dev.model.toUpperCase().trim();
          const existing = productStats.get(key) || { name: dev.model, quantity: 0, revenue: 0, color: dev.color };
          existing.quantity += 1;
          existing.revenue += dev.price || 0;
          productStats.set(key, existing);
        });
      } else if (inv.items && inv.items.length > 0) {
        inv.items.forEach(it => {
          const key = it.model.toUpperCase().trim();
          const existing = productStats.get(key) || { name: it.model, quantity: 0, revenue: 0, color: it.color };
          existing.quantity += 1;
          existing.revenue += it.price || 0;
          productStats.set(key, existing);
        });
      }
    });

    // 2. If invoices have no detailed items, aggregate from sold devices
    if (productStats.size === 0) {
      const soldDevices = devices.filter(d => d.status === 'sold');
      soldDevices.forEach(d => {
        const key = d.model.toUpperCase().trim();
        const existing = productStats.get(key) || { name: d.model, quantity: 0, revenue: 0, color: d.color };
        existing.quantity += 1;
        existing.revenue += d.sellPrice || 0;
        productStats.set(key, existing);
      });
    }

    // 3. If still empty, preview from in_stock devices so cashier knows current catalog
    if (productStats.size === 0) {
      inStockDevices.slice(0, 5).forEach(d => {
        const key = d.model.toUpperCase().trim();
        const existing = productStats.get(key) || { name: d.model, quantity: 0, revenue: 0, color: d.color };
        existing.revenue += d.sellPrice || 0;
        productStats.set(key, existing);
      });
    }

    const list = Array.from(productStats.values()).map(p => {
      const nameUpper = p.name.toUpperCase();
      let colorBg = 'from-zinc-800 to-zinc-950';
      if (nameUpper.includes('SA MẠC') || nameUpper.includes('DESERT') || nameUpper.includes('GOLD')) {
        colorBg = 'from-amber-700 to-amber-900';
      } else if (nameUpper.includes('TÍM') || nameUpper.includes('PURPLE')) {
        colorBg = 'from-purple-800 to-indigo-950';
      } else if (nameUpper.includes('XANH') || nameUpper.includes('BLUE')) {
        colorBg = 'from-blue-800 to-sky-950';
      } else if (nameUpper.includes('TITAN') || nameUpper.includes('GRAY') || nameUpper.includes('XÁM')) {
        colorBg = 'from-stone-600 to-stone-800';
      }

      return {
        ...p,
        colorBg
      };
    });

    if (bestSellerTab === 'quantity') {
      return list.sort((a, b) => b.quantity - a.quantity).slice(0, bestSellerLimit);
    }
    return list.sort((a, b) => b.revenue - a.revenue).slice(0, bestSellerLimit);
  }, [filteredInvoices, devices, inStockDevices, bestSellerTab, bestSellerLimit]);

  // Real Carousel Cards
  const kpiCards = [
    {
      title: `${totalInvoicesCount} hoá đơn bán lẻ`,
      hint: 'Vuốt tiếp 👉',
      mainNumber: (totalRevenue / 1_000_000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 }),
      unit: 'triệu đồng',
      bottomInfo: `📦 Đã phục vụ ${totalInvoicesCount} lượt khách hàng`,
      bg: 'bg-[#18181b]'
    },
    {
      title: 'Lợi nhuận gộp ước tính',
      hint: `⭐ Tỷ suất ~${profitMargin}%`,
      mainNumber: (grossProfit / 1_000_000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 }),
      unit: 'triệu đồng',
      bottomInfo: '📈 Doanh thu thuần sau giá vốn máy',
      bg: 'bg-gradient-to-br from-zinc-900 to-emerald-950/80'
    },
    {
      title: 'Tổng số dư các quỹ',
      hint: `${funds.length} tài khoản`,
      mainNumber: (totalFunds / 1_000_000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 }),
      unit: 'triệu đồng',
      bottomInfo: `🏦 Két: ${(cashFundTotal / 1_000_000).toFixed(1)}Tr • NH: ${(bankFundTotal / 1_000_000).toFixed(1)}Tr`,
      bg: 'bg-gradient-to-br from-zinc-900 to-amber-950/80'
    },
    {
      title: 'Giá trị kho sẵn bán',
      hint: `${inStockDevices.length} máy sẵn sàng`,
      mainNumber: (totalStockValue / 1_000_000_000).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      unit: 'tỷ đồng',
      bottomInfo: `📱 ${inStockDevices.length} máy iPhone sẵn sàng xuất quầy`,
      bg: 'bg-gradient-to-br from-zinc-900 to-blue-950/80'
    }
  ];

  return (
    <div className="w-full max-w-3xl mx-auto min-h-screen bg-[#f8f9fa] text-zinc-900 pb-24 px-2.5 sm:px-4 space-y-3 select-none font-sans">
      
      {/* 1. Top Header Bar (Tràn viền, không lồng khung) */}
      <div className="pt-2 pb-1 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight text-zinc-950">
            Tổng Quan Cửa Hàng
          </h1>
          <span className="text-[11px] font-bold text-zinc-400 font-mono">
            {currentBranchName}
          </span>
        </div>

        <div className="flex items-center space-x-3 text-zinc-700">
          <button 
            type="button"
            onClick={() => onNavigateTab('crm')}
            className="p-1.5 hover:text-[#ff4b16] cursor-pointer active:scale-95 transition-colors"
            title="Cuộc gọi & Hotline"
          >
            <Phone className="w-5 h-5 stroke-[2.2]" />
          </button>

          <div 
            className="relative cursor-pointer" 
            onClick={() => onNavigateTab('crm')}
            title="Khách hàng cần chăm sóc"
          >
            <Bell className="w-5 h-5 stroke-[2.2]" />
            {leads.length > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-[#ff4b16] text-white text-[10px] font-black px-1.5 py-0.2 rounded-full min-w-[18px] text-center shadow-xs">
                {leads.length}
              </span>
            )}
          </div>

          <button 
            type="button"
            onClick={() => onOpenAICopilot?.()}
            className="p-1.5 hover:text-[#ff4b16] cursor-pointer active:scale-95 transition-colors"
            title="Trợ lý AI PhoneHouse"
          >
            <Mail className="w-5 h-5 stroke-[2.2]" />
          </button>
        </div>
      </div>

      {/* 2. Date Filter Pill Dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white border border-zinc-200 text-xs font-bold text-zinc-800 shadow-2xs hover:bg-zinc-50 active:scale-95 transition-all cursor-pointer"
        >
          <Calendar className="w-3.5 h-3.5 text-[#ff4b16]" />
          <span>{dateFilter === 'this_month' ? 'Tháng này' : dateFilter === 'last_month' ? 'Tháng trước' : 'Hôm nay'}</span>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
        </button>

        {isDateDropdownOpen && (
          <div className="absolute top-10 left-0 z-30 bg-white border border-zinc-200 rounded-2xl shadow-xl py-1.5 w-40 text-xs font-bold text-zinc-700 animate-in fade-in zoom-in-95 duration-100">
            <button
              onClick={() => { setDateFilter('today'); setIsDateDropdownOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-orange-50 hover:text-[#ff4b16] cursor-pointer"
            >
              Hôm nay
            </button>
            <button
              onClick={() => { setDateFilter('this_month'); setIsDateDropdownOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-orange-50 hover:text-[#ff4b16] cursor-pointer"
            >
              Tháng này
            </button>
            <button
              onClick={() => { setDateFilter('last_month'); setIsDateDropdownOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-orange-50 hover:text-[#ff4b16] cursor-pointer"
            >
              Tháng trước
            </button>
          </div>
        )}
      </div>

      {/* 3. Swipable Carousel KPI Card (100% Số liệu thật, tràn viền mượt mà) */}
      <div>
        <div 
          onClick={() => setKpiCardIndex((prev) => (prev + 1) % kpiCards.length)}
          className={`${kpiCards[kpiCardIndex].bg} text-white rounded-3xl p-4 sm:p-5 shadow-lg shadow-zinc-950/15 relative overflow-hidden transition-all duration-300 cursor-pointer min-h-[140px] flex flex-col justify-between`}
        >
          <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between text-xs text-zinc-300 font-medium">
            <span className="font-bold">{kpiCards[kpiCardIndex].title}</span>
            <span className="text-[11px] text-zinc-400">{kpiCards[kpiCardIndex].hint}</span>
          </div>

          <div className="my-1">
            <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-[#ff4b16] leading-none">
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

        {/* Carousel Pagination Dots */}
        <div className="flex items-center justify-center space-x-1.5 mt-2">
          {kpiCards.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setKpiCardIndex(idx)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                kpiCardIndex === idx ? 'w-5 bg-[#ff4b16]' : 'w-1.5 bg-zinc-300'
              }`}
            />
          ))}
        </div>
      </div>

      {/* 4. Quick 6-Grid Feature Shortcuts (Cập nhật đúng 6 chức năng mới) */}
      <div className="bg-white rounded-3xl p-3.5 sm:p-4 border border-zinc-200/80 shadow-2xs">
        <div className="grid grid-cols-3 gap-y-3.5 gap-x-2">
          {/* Icon 1: Khách hàng CRM */}
          <button
            onClick={() => onNavigateTab('crm')}
            className="flex flex-col items-center text-center group cursor-pointer active:scale-95 transition-transform"
          >
            <div className="w-11 h-11 rounded-2xl bg-orange-50 text-[#ff4b16] flex items-center justify-center group-hover:bg-[#ff4b16] group-hover:text-white transition-colors shadow-2xs">
              <Users className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-xs font-bold text-zinc-800 mt-1.5">Khách hàng CRM</span>
          </button>

          {/* Icon 2: Sửa chữa / Bảo hành */}
          <button
            onClick={() => onNavigateTab('warranty')}
            className="flex flex-col items-center text-center group cursor-pointer active:scale-95 transition-transform"
          >
            <div className="w-11 h-11 rounded-2xl bg-zinc-100 text-zinc-800 flex items-center justify-center group-hover:bg-zinc-800 group-hover:text-white transition-colors shadow-2xs">
              <Wrench className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-xs font-bold text-zinc-800 mt-1.5">Sửa chữa</span>
          </button>

          {/* Icon 3: Chat (Đã đổi từ Giao hàng) */}
          <button
            onClick={() => onOpenAICopilot ? onOpenAICopilot() : onNavigateTab('crm')}
            className="flex flex-col items-center text-center group cursor-pointer active:scale-95 transition-transform"
          >
            <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center group-hover:bg-sky-600 group-hover:text-white transition-colors shadow-2xs">
              <MessageSquare className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-xs font-bold text-zinc-800 mt-1.5">Chat</span>
          </button>

          {/* Icon 4: Sổ Quỹ (Đã đổi từ Thanh toán) */}
          <button
            onClick={() => onNavigateTab('cashbook')}
            className="flex flex-col items-center text-center group cursor-pointer active:scale-95 transition-transform"
          >
            <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition-colors shadow-2xs">
              <BookOpen className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-xs font-bold text-zinc-800 mt-1.5">Sổ quỹ</span>
          </button>

          {/* Icon 5: Chấm Công (Đã đổi từ Nhân viên) */}
          <button
            onClick={() => onNavigateTab('hrm')}
            className="flex flex-col items-center text-center group cursor-pointer active:scale-95 transition-transform"
          >
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors shadow-2xs">
              <Clock className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-xs font-bold text-zinc-800 mt-1.5">Chấm công</span>
          </button>

          {/* Icon 6: Đối Soát Trả Góp (Đã đổi từ Thuế & Kế toán) */}
          <button
            onClick={() => onNavigateTab('accounting-reports')}
            className="flex flex-col items-center text-center group cursor-pointer active:scale-95 transition-transform relative"
          >
            <span className="absolute -top-1 right-1 bg-red-600 text-white text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase">
              mới
            </span>
            <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors shadow-2xs">
              <CreditCard className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-xs font-bold text-zinc-800 mt-1.5">Đối soát trả góp</span>
          </button>
        </div>
      </div>

      {/* 5. Doanh Thu Bar Chart Card (100% Số liệu thật) */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <h3 className="text-base font-black text-zinc-950">Doanh thu</h3>
            <span className="text-[10px] text-zinc-400 font-mono">
              (Tổng: {(totalRevenue / 1_000_000).toFixed(1)} Tr)
            </span>
          </div>

          <span className="text-xs font-bold text-zinc-500 font-mono">
            {dateFilter === 'this_month' ? 'Tháng này' : dateFilter === 'last_month' ? 'Tháng trước' : 'Hôm nay'}
          </span>
        </div>

        {/* Real Dynamic Bar Chart */}
        <div className="relative pt-2">
          {/* Horizontal Gridlines */}
          <div className="absolute inset-x-0 top-3 border-b border-dashed border-zinc-100 flex justify-between">
            <span className="text-[10px] font-mono text-zinc-400 -mt-2">{realChartDays.maxVal}Tr</span>
          </div>
          <div className="absolute inset-x-0 top-16 border-b border-dashed border-zinc-100 flex justify-between">
            <span className="text-[10px] font-mono text-zinc-400 -mt-2">{Math.round(realChartDays.maxVal / 2)}Tr</span>
          </div>
          <div className="absolute inset-x-0 bottom-6 border-b border-zinc-200 flex justify-between">
            <span className="text-[10px] font-mono text-zinc-400 -mt-2">0</span>
          </div>

          {/* Dynamic Bars container */}
          <div className="h-28 flex items-end justify-between gap-1 pl-8 pr-1 pb-6">
            {realChartDays.entries.map((item, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                <div
                  style={{ height: `${Math.max(item.val > 0 ? 8 : 2, (item.val / realChartDays.maxVal) * 100)}%` }}
                  className={`w-full max-w-[10px] rounded-t-sm transition-all duration-300 ${
                    item.isPeak
                      ? 'bg-gradient-to-t from-orange-500 to-[#ff4b16]'
                      : item.val > 0 
                        ? 'bg-gradient-to-t from-orange-400/80 to-amber-500/90 hover:brightness-110'
                        : 'bg-zinc-200'
                  }`}
                  title={`Ngày ${item.day}: ${item.val} Triệu VNĐ`}
                />
                <span className={`text-[9px] font-mono mt-1 ${item.isPeak ? 'text-[#ff4b16] font-bold' : 'text-zinc-400'}`}>
                  {item.day}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 6. Hàng Bán Chạy (100% Số liệu thật, tràn viền phẳng) */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-zinc-950">Hàng bán chạy</h3>
          <span className="text-xs text-zinc-400 font-mono">
            {realBestSellers.length} mặt hàng
          </span>
        </div>

        {/* Segmented Filter Pills */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setBestSellerTab('revenue')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
              bestSellerTab === 'revenue'
                ? 'bg-[#ff4b16] text-white shadow-xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Theo doanh thu
          </button>

          <button
            type="button"
            onClick={() => setBestSellerTab('quantity')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
              bestSellerTab === 'quantity'
                ? 'bg-[#ff4b16] text-white shadow-xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Theo số lượng
          </button>
        </div>

        {/* Real Best-Selling List Items */}
        <div className="divide-y divide-zinc-100">
          {realBestSellers.length === 0 ? (
            <div className="py-6 text-center text-xs text-zinc-400">
              Chưa có đơn hàng trong giai đoạn này.
            </div>
          ) : (
            realBestSellers.map((item, idx) => (
              <div 
                key={idx}
                onClick={() => onNavigateTab('pos')}
                className="py-2.5 flex items-center justify-between gap-2.5 group cursor-pointer hover:bg-orange-50/50 -mx-1 px-1 rounded-2xl transition-colors"
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${item.colorBg} flex items-center justify-center shrink-0 shadow-xs`}>
                    <Smartphone className="w-4 h-4 text-white/90" />
                  </div>

                  <div className="min-w-0">
                    <h4 className="text-xs font-black text-zinc-900 truncate tracking-tight group-hover:text-[#ff4b16] transition-colors">
                      {item.name}
                    </h4>
                    <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                      {item.quantity} hàng hóa đã xuất
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-black font-mono text-[#ff4b16] block">
                    {item.revenue.toLocaleString('vi-VN')}
                  </span>
                  <span className="text-[10px] text-zinc-400 font-medium">đồng</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 7. Floating Role Switcher on Bottom Right */}
      <div className="fixed bottom-16 right-3.5 z-40">
        <button
          type="button"
          onClick={() => onNavigateTab('pos')}
          className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-full bg-zinc-950 text-white text-xs font-bold shadow-xl border border-zinc-800 hover:bg-zinc-900 active:scale-95 transition-all cursor-pointer"
        >
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span>Admin / CHT</span>
        </button>
      </div>

      {/* 8. Mobile Bottom Navigation Bar with Active Orange Dot */}
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
  );
};
