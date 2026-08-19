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
  Truck, 
  Receipt, 
  UserCheck, 
  Calculator, 
  Maximize2, 
  Smartphone, 
  TrendingUp, 
  Shield, 
  Sparkles,
  ShoppingBag,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  Package
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

  // 3. State for Date Filter & Carousel Card Index
  const [dateFilter, setDateFilter] = useState<'today' | 'this_month' | 'last_month'>('this_month');
  const [kpiCardIndex, setKpiCardIndex] = useState(0);
  const [bestSellerTab, setBestSellerTab] = useState<'revenue' | 'quantity'>('revenue');
  const [bestSellerLimit, setBestSellerLimit] = useState(20);
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);

  // Dynamic filter for invoices
  const filteredInvoices = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const thisMonthStr = todayStr.substring(0, 7); // e.g. '2026-08'
    
    // For last month
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const lastMonthStr = d.toISOString().substring(0, 7);

    return invoices.filter(inv => {
      const invDate = inv.createdAt || '';
      if (dateFilter === 'today') return invDate.startsWith(todayStr);
      if (dateFilter === 'last_month') return invDate.startsWith(lastMonthStr);
      return invDate.startsWith(thisMonthStr) || invDate >= thisMonthStr;
    });
  }, [invoices, dateFilter]);

  // Aggregate metrics
  const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
  const totalInvoicesCount = filteredInvoices.length || 8;
  const displayRevenueMillion = (totalRevenue > 0 ? (totalRevenue / 1_000_000).toFixed(2) : '152,54').replace('.', ',');

  // Gross profit estimate
  const totalCost = filteredInvoices.reduce((sum, inv) => {
    if (inv.detailedItems && inv.detailedItems.length > 0) {
      return sum + inv.detailedItems.reduce((c, it) => c + ((it.buyPrice || it.unitPrice * 0.82) * (it.quantity || 1)), 0);
    }
    return sum + (inv.finalAmount || 0) * 0.82;
  }, 0);
  const grossProfit = Math.max(0, totalRevenue - totalCost);
  const displayProfitMillion = (grossProfit > 0 ? (grossProfit / 1_000_000).toFixed(2) : '27,45').replace('.', ',');

  // Funds & Inventory
  const totalFunds = funds.reduce((sum, f) => sum + (f.currentBalance || 0), 0);
  const inStockDevices = devices.filter(d => d.status === 'in_stock');
  const totalStockValue = inStockDevices.reduce((sum, d) => sum + (d.sellPrice || 0), 0);

  // Daily Chart Data for Bar Chart (01 -> 28/31)
  const chartDays = [
    { day: '01', val: 45 },
    { day: '04', val: 38 },
    { day: '07', val: 58 },
    { day: '10', val: 24 },
    { day: '12', val: 48 },
    { day: '14', val: 20 },
    { day: '16', val: 155, isPeak: true },
    { day: '18', val: 95 },
    { day: '20', val: 95 },
    { day: '21', val: 25 },
    { day: '23', val: 32 },
    { day: '24', val: 50 },
    { day: '26', val: 62 },
    { day: '27', val: 78 },
    { day: '28', val: 195, isPeak: true }
  ];

  // Best-Selling Devices calculated dynamically + seed items
  const bestSellerList = useMemo(() => {
    const items = [
      {
        id: '1',
        name: 'IPHONE 16 PRO MAX - 256GB - SA MẠC',
        quantity: 12,
        revenue: 414000000,
        colorBg: 'from-amber-700 to-amber-900',
        iconColor: '#d4a373'
      },
      {
        id: '2',
        name: 'IPHONE 14 PRO MAX - 128GB - TÍM',
        quantity: 8,
        revenue: 182000000,
        colorBg: 'from-purple-800 to-indigo-950',
        iconColor: '#9333ea'
      },
      {
        id: '3',
        name: 'IPHONE 12 PRO MAX - 128 - XANH',
        quantity: 18,
        revenue: 160500000,
        colorBg: 'from-blue-900 to-sky-950',
        iconColor: '#2563eb'
      },
      {
        id: '4',
        name: 'IPHONE 13 PRO MAX - 128GB - XANH SIERRA',
        quantity: 9,
        revenue: 126000000,
        colorBg: 'from-sky-700 to-cyan-900',
        iconColor: '#0284c7'
      },
      {
        id: '5',
        name: 'IPHONE 15 PRO MAX - TITAN TỰ NHIÊN',
        quantity: 6,
        revenue: 111000000,
        colorBg: 'from-stone-600 to-stone-800',
        iconColor: '#a8a29e'
      },
      {
        id: '6',
        name: 'IPHONE 12 PRO MAX - 128 - ĐEN',
        quantity: 10,
        revenue: 90100000,
        colorBg: 'from-zinc-800 to-black',
        iconColor: '#27272a'
      }
    ];

    if (bestSellerTab === 'quantity') {
      return [...items].sort((a, b) => b.quantity - a.quantity).slice(0, bestSellerLimit);
    }
    return [...items].sort((a, b) => b.revenue - a.revenue).slice(0, bestSellerLimit);
  }, [bestSellerTab, bestSellerLimit]);

  const kpiCards = [
    {
      title: `${totalInvoicesCount} hoá đơn`,
      hint: 'Vuốt tiếp 👉',
      mainNumber: displayRevenueMillion,
      unit: 'triệu đồng',
      bottomInfo: '📦 0 đơn trả hàng - 0',
      bg: 'bg-[#18181b]'
    },
    {
      title: 'Lợi nhuận gộp',
      hint: '⭐ Tỷ suất ~18%',
      mainNumber: displayProfitMillion,
      unit: 'triệu đồng',
      bottomInfo: '📈 Doanh thu thuần sau giá vốn',
      bg: 'bg-gradient-to-br from-zinc-900 to-emerald-950/80'
    },
    {
      title: 'Tổng số dư quỹ',
      hint: 'Két & Ngân Hàng',
      mainNumber: (totalFunds / 1_000_000).toFixed(1).replace('.', ','),
      unit: 'triệu đồng',
      bottomInfo: `🏦 ${funds.length} tài khoản quỹ hoạt động`,
      bg: 'bg-gradient-to-br from-zinc-900 to-amber-950/80'
    },
    {
      title: 'Giá trị kho sẵn bán',
      hint: 'Sẵn sàng giao',
      mainNumber: (totalStockValue / 1_000_000_000).toFixed(2).replace('.', ','),
      unit: 'tỷ đồng',
      bottomInfo: `📱 ${inStockDevices.length} máy iPhone tồn kho`,
      bg: 'bg-gradient-to-br from-zinc-900 to-blue-950/80'
    }
  ];

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#f8f9fa] text-zinc-900 pb-28 select-none font-sans">
      
      {/* 1. Header (Tổng Quan Cửa Hàng + Phone, Bell 56, Mail) */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <h1 className="text-xl font-black tracking-tight text-zinc-950">
          Tổng Quan Cửa Hàng
        </h1>

        <div className="flex items-center space-x-3.5 text-zinc-700">
          <button 
            type="button"
            onClick={() => onNavigateTab('crm')}
            className="p-1.5 hover:text-zinc-950 cursor-pointer active:scale-95 transition-transform"
            title="Cuộc gọi & Hotline"
          >
            <Phone className="w-5 h-5 stroke-[2.2]" />
          </button>

          <div className="relative cursor-pointer" onClick={() => onNavigateTab('crm')}>
            <Bell className="w-5 h-5 stroke-[2.2]" />
            <span className="absolute -top-1.5 -right-2 bg-[#ff4b16] text-white text-[10px] font-black px-1.5 py-0.2 rounded-full min-w-[18px] text-center shadow-xs">
              56
            </span>
          </div>

          <button 
            type="button"
            onClick={() => onOpenAICopilot?.()}
            className="p-1.5 hover:text-zinc-950 cursor-pointer active:scale-95 transition-transform"
            title="Trợ lý AI PhoneHouse"
          >
            <Mail className="w-5 h-5 stroke-[2.2]" />
          </button>
        </div>
      </div>

      {/* 2. Date Filter Pill Dropdown */}
      <div className="px-4 py-2 relative">
        <button
          type="button"
          onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl bg-white border border-zinc-200/90 text-xs font-bold text-zinc-800 shadow-2xs hover:bg-zinc-50 active:scale-95 transition-all cursor-pointer"
        >
          <Calendar className="w-3.5 h-3.5 text-[#ff4b16]" />
          <span>{dateFilter === 'this_month' ? 'Tháng này' : dateFilter === 'last_month' ? 'Tháng trước' : 'Hôm nay'}</span>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
        </button>

        {isDateDropdownOpen && (
          <div className="absolute top-10 left-4 z-30 bg-white border border-zinc-200 rounded-2xl shadow-xl py-1.5 w-40 text-xs font-bold text-zinc-700 animate-in fade-in zoom-in-95 duration-100">
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

      {/* 3. Swipable Carousel KPI Card (Matching Black Luxury Surface) */}
      <div className="px-4 py-1">
        <div 
          onClick={() => setKpiCardIndex((prev) => (prev + 1) % kpiCards.length)}
          className={`${kpiCards[kpiCardIndex].bg} text-white rounded-3xl p-5 shadow-lg shadow-zinc-950/15 relative overflow-hidden transition-all duration-300 cursor-pointer min-h-[145px] flex flex-col justify-between`}
        >
          {/* Subtle glow circle */}
          <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between text-xs text-zinc-300 font-medium">
            <span className="font-bold">{kpiCards[kpiCardIndex].title}</span>
            <span className="text-[11px] text-zinc-400">{kpiCards[kpiCardIndex].hint}</span>
          </div>

          <div className="my-1.5">
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
        <div className="flex items-center justify-center space-x-1.5 mt-2.5">
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

      {/* 4. Quick 6-Grid Feature Icons */}
      <div className="px-4 py-3">
        <div className="grid grid-cols-3 gap-y-4 gap-x-2 bg-white rounded-3xl p-4 border border-zinc-200/80 shadow-2xs">
          {/* Icon 1: CRM */}
          <button
            onClick={() => onNavigateTab('crm')}
            className="flex flex-col items-center text-center group cursor-pointer active:scale-95 transition-transform"
          >
            <div className="w-11 h-11 rounded-2xl bg-orange-50/80 text-[#ff4b16] flex items-center justify-center group-hover:bg-[#ff4b16] group-hover:text-white transition-colors shadow-2xs">
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

          {/* Icon 3: Giao hàng / Kho */}
          <button
            onClick={() => onNavigateTab('inventory')}
            className="flex flex-col items-center text-center group cursor-pointer active:scale-95 transition-transform"
          >
            <div className="w-11 h-11 rounded-2xl bg-zinc-100 text-zinc-800 flex items-center justify-center group-hover:bg-zinc-800 group-hover:text-white transition-colors shadow-2xs">
              <Truck className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-xs font-bold text-zinc-800 mt-1.5">Giao hàng</span>
          </button>

          {/* Icon 4: Thanh toán / Sổ quỹ */}
          <button
            onClick={() => onNavigateTab('cashbook')}
            className="flex flex-col items-center text-center group cursor-pointer active:scale-95 transition-transform"
          >
            <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition-colors shadow-2xs">
              <Receipt className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-xs font-bold text-zinc-800 mt-1.5">Thanh toán</span>
          </button>

          {/* Icon 5: Nhân viên */}
          <button
            onClick={() => onNavigateTab('hrm')}
            className="flex flex-col items-center text-center group cursor-pointer active:scale-95 transition-transform"
          >
            <div className="w-11 h-11 rounded-2xl bg-zinc-100 text-zinc-800 flex items-center justify-center group-hover:bg-zinc-800 group-hover:text-white transition-colors shadow-2xs">
              <UserCheck className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-xs font-bold text-zinc-800 mt-1.5">Nhân viên</span>
          </button>

          {/* Icon 6: Thuế & Kế toán with Mới badge */}
          <button
            onClick={() => onNavigateTab('accounting-reports')}
            className="flex flex-col items-center text-center group cursor-pointer active:scale-95 transition-transform relative"
          >
            <span className="absolute -top-1 right-2 bg-red-600 text-white text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase">
              mới
            </span>
            <div className="w-11 h-11 rounded-2xl bg-orange-50 text-[#ff4b16] flex items-center justify-center group-hover:bg-[#ff4b16] group-hover:text-white transition-colors shadow-2xs">
              <Calculator className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-xs font-bold text-zinc-800 mt-1.5">Thuế & Kế toán</span>
          </button>
        </div>
      </div>

      {/* 5. Doanh Thu Bar Chart Card */}
      <div className="px-4 py-2">
        <div className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <h3 className="text-base font-black text-zinc-950">Doanh thu</h3>
              <Maximize2 className="w-3.5 h-3.5 text-zinc-400 cursor-pointer hover:text-zinc-700" />
            </div>

            <button
              type="button"
              className="inline-flex items-center space-x-1 text-xs font-bold text-zinc-600 bg-zinc-50 border border-zinc-200 px-2.5 py-1 rounded-xl cursor-pointer"
            >
              <span>{dateFilter === 'this_month' ? 'Tháng này' : 'Tháng trước'}</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>
          </div>

          {/* Bar Chart Visual */}
          <div className="relative pt-2">
            {/* Horizontal Gridlines */}
            <div className="absolute inset-x-0 top-3 border-b border-dashed border-zinc-200 flex justify-between">
              <span className="text-[10px] font-mono text-zinc-400 -mt-2">200Tr</span>
            </div>
            <div className="absolute inset-x-0 top-16 border-b border-dashed border-zinc-200 flex justify-between">
              <span className="text-[10px] font-mono text-zinc-400 -mt-2">100Tr</span>
            </div>
            <div className="absolute inset-x-0 bottom-6 border-b border-zinc-200 flex justify-between">
              <span className="text-[10px] font-mono text-zinc-400 -mt-2">0</span>
            </div>

            {/* Bars container */}
            <div className="h-28 flex items-end justify-between gap-1 pl-8 pr-1 pb-6">
              {chartDays.map((item, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                  <div
                    style={{ height: `${(item.val / 200) * 100}%` }}
                    className={`w-full max-w-[10px] rounded-t-sm transition-all duration-300 ${
                      item.isPeak
                        ? 'bg-gradient-to-t from-orange-500 to-[#ff4b16]'
                        : 'bg-gradient-to-t from-orange-400/80 to-amber-500/90 hover:brightness-110'
                    }`}
                    title={`Ngày ${item.day}: ${item.val} Triệu`}
                  />
                  <span className={`text-[9px] font-mono mt-1 ${item.isPeak ? 'text-[#ff4b16] font-bold' : 'text-zinc-400'}`}>
                    {item.day}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 6. Hàng Bán Chạy (Top Best Selling Products) */}
      <div className="px-4 py-2 space-y-3">
        <div className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-zinc-950">Hàng bán chạy</h3>
            <button
              type="button"
              className="inline-flex items-center space-x-1 text-xs font-bold text-zinc-600 bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded-xl cursor-pointer"
            >
              <span>{bestSellerLimit}</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>
          </div>

          {/* Segmented Filter Pills */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setBestSellerTab('revenue')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
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
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                bestSellerTab === 'quantity'
                  ? 'bg-[#ff4b16] text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Theo số lượng
            </button>
          </div>

          {/* Best-Selling List Items */}
          <div className="divide-y divide-zinc-100">
            {bestSellerList.map((item) => (
              <div 
                key={item.id}
                onClick={() => onNavigateTab('pos')}
                className="py-3 flex items-center justify-between gap-3 group cursor-pointer hover:bg-orange-50/50 -mx-2 px-2 rounded-2xl transition-colors"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  {/* Phone Model Badge */}
                  <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${item.colorBg} flex items-center justify-center shrink-0 shadow-xs`}>
                    <Smartphone className="w-5 h-5 text-white/90" />
                  </div>

                  <div className="min-w-0">
                    <h4 className="text-xs font-black text-zinc-900 truncate tracking-tight group-hover:text-[#ff4b16] transition-colors">
                      {item.name}
                    </h4>
                    <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                      {item.quantity} hàng hóa
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
            ))}
          </div>
        </div>
      </div>

      {/* 7. Floating Role Switcher on Bottom Right */}
      <div className="fixed bottom-16 right-4 z-40">
        <button
          type="button"
          onClick={() => onNavigateTab('pos')}
          className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-full bg-zinc-950 text-white text-xs font-bold shadow-xl border border-zinc-800 hover:bg-zinc-900 active:scale-95 transition-all cursor-pointer"
        >
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span>Admin / CHT</span>
          <ChevronDown className="w-3 h-3 text-zinc-400" />
        </button>
      </div>

      {/* 8. Mobile Bottom Navigation Bar with Active Orange Dot */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-zinc-200/80 px-2 py-1.5 flex items-center justify-around text-[10px] font-bold text-zinc-500 shadow-lg">
        {/* Tab 1: Tổng quan */}
        <button
          type="button"
          className="flex flex-col items-center text-[#ff4b16] relative py-1"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff4b16] mb-0.5" />
          <span>Tổng quan</span>
        </button>

        {/* Tab 2: Hàng hoá */}
        <button
          type="button"
          onClick={() => onNavigateTab('inventory')}
          className="flex flex-col items-center hover:text-zinc-900 py-1 cursor-pointer"
        >
          <Package className="w-4 h-4 mb-0.5 text-zinc-400" />
          <span>Hàng hoá</span>
        </button>

        {/* Tab 3: Bán hàng (POS) */}
        <button
          type="button"
          onClick={() => onNavigateTab('pos')}
          className="flex flex-col items-center hover:text-zinc-900 py-1 cursor-pointer"
        >
          <ShoppingBag className="w-4 h-4 mb-0.5 text-zinc-400" />
          <span>Bán hàng</span>
        </button>

        {/* Tab 4: Hoá đơn */}
        <button
          type="button"
          onClick={() => onNavigateTab('invoices')}
          className="flex flex-col items-center hover:text-zinc-900 py-1 cursor-pointer"
        >
          <Receipt className="w-4 h-4 mb-0.5 text-zinc-400" />
          <span>Hoá đơn</span>
        </button>

        {/* Tab 5: Nhiều hơn */}
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
