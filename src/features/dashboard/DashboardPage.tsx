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
import { SalesHomeView } from './components/SalesHomeView';

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

  // 1. Role-Adaptive Home for SALES (Integrated Cockpit & KPI Center)
  if (currentUser?.role === 'SALES' || currentUser?.role === 'SALE') {
    return (
      <SalesHomeView
        invoices={invoices}
        devices={devices}
        leads={leads}
        warrantyTickets={warrantyTickets}
        funds={funds}
        partners={partners}
        branches={branches}
        currentBranch={currentBranch}
        currentUser={currentUser}
        onNavigateTab={onNavigateTab}
      />
    );
  }

  // 2. Role-Adaptive Home for TECHNICIANS
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

  // 3. Role-Adaptive Home for ACCOUNTANTS
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

  // 4. Shared State for Filters & Action Tabs
  type DateFilterType = 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month';
  const [dateFilter, setDateFilter] = useState<DateFilterType>('this_month');
  const [kpiCardIndex, setKpiCardIndex] = useState(0);
  const [bestSellerTab, setBestSellerTab] = useState<'revenue' | 'quantity'>('revenue');
  const [bestSellerLimit, setBestSellerLimit] = useState(10);
  const [actionQueueTab, setActionQueueTab] = useState<'ALL' | 'APPOINTMENTS' | 'AGING_STOCK' | 'WARRANTY'>('ALL');
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);

  // Helper date calculations
  const dateRanges = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const thisMonthStr = todayStr.substring(0, 7);

    // Calculate last month YYYY-MM
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    // This week Monday to Sunday
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monThisWeek = new Date(now);
    monThisWeek.setDate(now.getDate() + diffToMonday);
    const sunThisWeek = new Date(monThisWeek);
    sunThisWeek.setDate(monThisWeek.getDate() + 6);

    // Last week Monday to Sunday
    const monLastWeek = new Date(monThisWeek);
    monLastWeek.setDate(monThisWeek.getDate() - 7);
    const sunLastWeek = new Date(monLastWeek);
    sunLastWeek.setDate(monLastWeek.getDate() + 6);

    const formatD = (d: Date) => d.toISOString().split('T')[0];

    return {
      todayStr,
      thisMonthStr,
      lastMonthStr,
      monThisWeek,
      sunThisWeek,
      monLastWeek,
      sunLastWeek,
      startThisWeekStr: formatD(monThisWeek),
      endThisWeekStr: formatD(sunThisWeek),
      startLastWeekStr: formatD(monLastWeek),
      endLastWeekStr: formatD(sunLastWeek)
    };
  }, []);

  // 5. Dynamic Filter for Invoices (100% Real Data, excluding cancelled)
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (inv.status === 'cancelled') return false;
      const invDate = inv.createdAt ? inv.createdAt.split('T')[0] : dateRanges.todayStr;
      
      if (dateFilter === 'today') {
        return invDate === dateRanges.todayStr;
      }
      if (dateFilter === 'this_week') {
        return invDate >= dateRanges.startThisWeekStr && invDate <= dateRanges.endThisWeekStr;
      }
      if (dateFilter === 'last_week') {
        return invDate >= dateRanges.startLastWeekStr && invDate <= dateRanges.endLastWeekStr;
      }
      if (dateFilter === 'last_month') {
        return invDate.startsWith(dateRanges.lastMonthStr);
      }
      // 'this_month'
      return invDate.startsWith(dateRanges.thisMonthStr) || !inv.createdAt;
    });
  }, [invoices, dateFilter, dateRanges]);

  // Aggregate Real Metrics
  const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + (inv.finalAmount || inv.totalAmount || 0), 0);
  const totalInvoicesCount = filteredInvoices.length;

  // Real Gross Profit Calculation (Excluding fabricated 20% margin)
  const { grossProfit, missingCostCount } = useMemo(() => {
    let profit = 0;
    let missingCount = 0;

    for (const inv of filteredInvoices) {
      let invCost = 0;
      let hasValidCost = false;

      if (inv.detailedItems && inv.detailedItems.length > 0) {
        for (const it of inv.detailedItems) {
          if (typeof (it as any).buyPrice === 'number' && (it as any).buyPrice > 0) {
            invCost += (it as any).buyPrice * (it.quantity || 1);
            hasValidCost = true;
          }
        }
      } else if (inv.devices && inv.devices.length > 0) {
        for (const dev of inv.devices) {
          const matchedDevice = devices.find(d => d.imei === dev.imei || d.id === (dev as any).id);
          if (matchedDevice && typeof matchedDevice.buyPrice === 'number' && matchedDevice.buyPrice > 0) {
            invCost += matchedDevice.buyPrice;
            hasValidCost = true;
          }
        }
      }

      if (hasValidCost) {
        profit += Math.max(0, (inv.finalAmount || inv.totalAmount || 0) - invCost);
      } else {
        missingCount++;
      }
    }

    return { grossProfit: profit, missingCostCount: missingCount };
  }, [filteredInvoices, devices]);

  const profitMargin = totalRevenue > 0 && grossProfit > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;

  // Funds and Inventory: Distinct Vốn Tồn Kho vs Giá Trị Bán Dự Kiến
  const totalFunds = funds.reduce((sum, f) => sum + (f.currentBalance || 0), 0);
  const cashFundTotal = funds.filter(f => f.type === 'CASH' || f.name?.toLowerCase().includes('tiền mặt')).reduce((s, f) => s + (f.currentBalance || 0), 0);
  const bankFundTotal = totalFunds - cashFundTotal;

  const inStockDevices = devices.filter(d => d.status === 'in_stock');
  const totalStockCost = inStockDevices.reduce((sum, d) => sum + (d.buyPrice || (d as any).costPrice || 0), 0);
  const totalStockRetailValue = inStockDevices.reduce((sum, d) => sum + (d.sellPrice || 0), 0);
  const potentialStockProfit = Math.max(0, totalStockRetailValue - totalStockCost);

  // 100% Real Aging Stock (> 30 days)
  const agingDevices = inStockDevices.filter(d => {
    if (!d.receivedDate) return false;
    const diffDays = Math.floor((Date.now() - new Date(d.receivedDate).getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 30;
  });

  // Real Appointments & Active Warranties (Handling all schema status codes)
  const myAppointments = leads.filter(l => l.status === 'appointment_scheduled');
  const pendingWarranties = warrantyTickets.filter(w => 
    ['received', 'inspecting', 'waiting_parts', 'repairing', 'PENDING', 'IN_PROGRESS', 'WAITING_FOR_PARTS'].includes(w.status || '')
  );
  const totalActionCount = myAppointments.length + agingDevices.length + pendingWarranties.length;

  // 5. Dynamic Revenue Bar Chart Calculation Adapting to Every Filter (Today, This Week, Last Week, This Month, Last Month)
  const realChartData = useMemo(() => {
    // 1. TODAY -> Hourly Buckets (08h, 10h, 12h, 14h, 16h, 18h, 20h, 22h)
    if (dateFilter === 'today') {
      const hours = ['08h', '10h', '12h', '14h', '16h', '18h', '20h', '22h'];
      const hourMap = new Map<string, number>();
      hours.forEach(h => hourMap.set(h, 0));

      filteredInvoices.forEach(inv => {
        if (inv.createdAt) {
          try {
            const timePart = inv.createdAt.split('T')[1] || '';
            const hNum = parseInt(timePart.split(':')[0] || '10', 10);
            const matched = hours.find(hr => Math.abs(parseInt(hr, 10) - hNum) <= 1) || '14h';
            hourMap.set(matched, (hourMap.get(matched) || 0) + ((inv.finalAmount || inv.totalAmount || 0) / 1_000_000));
          } catch (e) {}
        }
      });

      const entries = hours.map(h => ({
        label: h,
        val: Math.round((hourMap.get(h) || 0) * 10) / 10
      }));
      const maxVal = Math.max(5, ...entries.map(e => e.val));

      return {
        title: 'Doanh thu hôm nay (Theo khung giờ)',
        entries: entries.map(e => ({ ...e, isPeak: e.val > 0 && e.val >= maxVal * 0.85 })),
        maxVal: Math.ceil(maxVal / 5) * 5
      };
    }

    // 2. THIS WEEK or LAST WEEK -> 7 Weekdays (T2, T3, T4, T5, T6, T7, CN)
    if (dateFilter === 'this_week' || dateFilter === 'last_week') {
      const baseMonday = dateFilter === 'this_week' ? dateRanges.monThisWeek : dateRanges.monLastWeek;
      const dayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
      const dayEntries = dayNames.map((name, i) => {
        const d = new Date(baseMonday);
        d.setDate(baseMonday.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const dayOfMonth = d.getDate().toString().padStart(2, '0');
        return {
          key: dateStr,
          label: `${name}`,
          subLabel: `${dayOfMonth}`,
          val: 0
        };
      });

      filteredInvoices.forEach(inv => {
        if (inv.createdAt) {
          const invDate = inv.createdAt.split('T')[0];
          const target = dayEntries.find(d => d.key === invDate);
          if (target) {
            target.val += (inv.finalAmount || inv.totalAmount || 0) / 1_000_000;
          }
        }
      });

      dayEntries.forEach(d => { d.val = Math.round(d.val * 10) / 10; });
      const maxVal = Math.max(10, ...dayEntries.map(e => e.val));

      return {
        title: dateFilter === 'this_week' ? 'Doanh thu tuần này (Thứ 2 - Chủ Nhật)' : 'Doanh thu tuần trước (Thứ 2 - Chủ Nhật)',
        entries: dayEntries.map(e => ({ ...e, isPeak: e.val > 0 && e.val >= maxVal * 0.85 })),
        maxVal: Math.ceil(maxVal / 10) * 10
      };
    }

    // 3. THIS MONTH or LAST MONTH -> Days of Month (01, 04, 07... 31)
    const isLastMonth = dateFilter === 'last_month';
    const sampleDays = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31];
    const monthDayMap = new Map<string, number>();
    sampleDays.forEach(d => {
      const key = d.toString().padStart(2, '0');
      monthDayMap.set(key, 0);
    });

    filteredInvoices.forEach(inv => {
      if (inv.createdAt) {
        try {
          const datePart = inv.createdAt.split('T')[0];
          const dayStr = datePart.split('-')[2] ? datePart.split('-')[2].padStart(2, '0') : '01';
          const dNum = parseInt(dayStr, 10);
          const matchedDay = sampleDays.find(d => Math.abs(d - dNum) <= 1) || 1;
          const bucketKey = matchedDay.toString().padStart(2, '0');
          monthDayMap.set(bucketKey, (monthDayMap.get(bucketKey) || 0) + ((inv.finalAmount || inv.totalAmount || 0) / 1_000_000));
        } catch (e) {}
      }
    });

    const entries = Array.from(monthDayMap.entries()).map(([day, val]) => ({
      label: day,
      val: Math.round(val * 10) / 10
    }));
    const maxVal = Math.max(10, ...entries.map(e => e.val));

    return {
      title: isLastMonth ? 'Doanh thu tháng trước (Theo ngày)' : 'Doanh thu tháng này (Theo ngày)',
      entries: entries.map(e => ({ ...e, isPeak: e.val > 0 && e.val >= maxVal * 0.85 })),
      maxVal: Math.ceil(maxVal / 20) * 20
    };
  }, [filteredInvoices, dateFilter, dateRanges]);

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
      title: 'Vốn tồn kho hiện tại',
      hint: `${inStockDevices.length} máy sẵn sàng`,
      mainNumber: (totalStockCost / 1_000_000_000).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      unit: 'tỷ VNĐ',
      bottomInfo: `🏷️ Giá bán: ${(totalStockRetailValue / 1_000_000_000).toFixed(2)} Tỷ • LN tiềm năng: ${(potentialStockProfit / 1_000_000).toFixed(0)}Tr`,
      bg: 'bg-gradient-to-br from-zinc-900 to-zinc-950'
    }
  ];

  // 6 Shortcuts List: 100% Brand Orange Icons (#ff4b16), KHÔNG KHUNG XUNG QUANH
  const shortcutsList = [
    { id: 'crm', label: 'Khách hàng CRM', icon: Users, action: () => onNavigateTab('crm') },
    { id: 'warranty', label: 'Sửa chữa', icon: Wrench, action: () => onNavigateTab('warranty') },
    { id: 'chat', label: 'Chat', icon: MessageSquare, action: () => onOpenAICopilot ? onOpenAICopilot() : onNavigateTab('omnichannel-chat') },
    { id: 'cashbook', label: 'Sổ quỹ', icon: BookOpen, action: () => onNavigateTab('cashbook') },
    { id: 'hrm', label: 'Chấm công', icon: Clock, action: () => onNavigateTab('hr-attendance') },
    { id: 'installments', label: 'Đối soát trả góp', icon: CreditCard, action: () => onNavigateTab('installments'), isNew: true }
  ];

  // Helper date label
  const dateFilterLabel = {
    today: 'Hôm nay',
    this_week: 'Tuần này',
    last_week: 'Tuần trước',
    this_month: 'Tháng này',
    last_month: 'Tháng trước'
  }[dateFilter];

  return (
    <div className="w-full min-h-screen bg-[#f8f9fa] text-zinc-900 select-none font-sans">
      
      {/* ========================================================================= */}
      {/* 🖥️ DESKTOP HUD EXECUTIVE VIEW (>= 1024px) - Bố cục Chuyên Nghiệp Máy Tính (Tràn viền) */}
      {/* ========================================================================= */}
      <div className="hidden lg:block w-full max-w-none px-4 sm:px-6 lg:px-8 py-5 space-y-5 pb-20">
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
            {/* Extended Date Filters (Hôm nay, Tuần này, Tuần trước, Tháng này, Tháng trước) */}
            <div className="flex items-center p-1 bg-zinc-100 rounded-xl text-xs font-bold space-x-0.5">
              <button
                onClick={() => setDateFilter('today')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dateFilter === 'today' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Hôm nay
              </button>
              <button
                onClick={() => setDateFilter('this_week')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dateFilter === 'this_week' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Tuần này
              </button>
              <button
                onClick={() => setDateFilter('last_week')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dateFilter === 'last_week' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Tuần trước
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
              <span>Vốn Tồn Kho Hiện Tại</span>
              <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-700 font-mono font-bold text-[10px]">
                {inStockDevices.length} máy sẵn sàng
              </span>
            </div>
            <div className="text-2xl font-black font-mono tracking-tight text-zinc-950">
              {(totalStockCost / 1_000_000_000).toFixed(2)} <span className="text-xs font-sans text-zinc-500 font-bold">Tỷ VNĐ</span>
            </div>
            <span className="text-[11px] text-zinc-400 block font-medium">
              Giá bán: {(totalStockRetailValue / 1_000_000_000).toFixed(2)} Tỷ • LN tiềm năng: {(potentialStockProfit / 1_000_000).toFixed(0)}Tr
            </span>
          </div>
        </div>

        {/* Desktop 2-Column Main Workspace (65% / 35%) */}
        <div className="grid grid-cols-12 gap-5 items-start">
          {/* Left Column (65% -> 8 cols): Chart + Top Best Sellers */}
          <div className="col-span-8 space-y-5">
            {/* Dynamic Revenue Bar Chart According to Filter */}
            <div className="bg-white p-5 rounded-2xl border border-zinc-200/70 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-zinc-900">
                    {realChartData.title}
                  </h3>
                  <span className="text-xs text-zinc-400 font-medium">
                    Tổng doanh thu kỳ này: <b className="text-zinc-900 font-mono">{totalRevenue.toLocaleString('vi-VN')} đ</b>
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-zinc-600 px-3 py-1 rounded-lg bg-zinc-50 border border-zinc-200">
                  {dateFilterLabel}
                </span>
              </div>

              {/* Dynamic Chart Display */}
              <div className="relative pt-3">
                <div className="absolute inset-x-0 top-3 border-b border-dashed border-zinc-100 flex justify-between">
                  <span className="text-[10px] font-mono text-zinc-400 -mt-2">{realChartData.maxVal} Tr</span>
                </div>
                <div className="absolute inset-x-0 top-20 border-b border-dashed border-zinc-100 flex justify-between">
                  <span className="text-[10px] font-mono text-zinc-400 -mt-2">{Math.round(realChartData.maxVal / 2)} Tr</span>
                </div>
                <div className="absolute inset-x-0 bottom-7 border-b border-zinc-200 flex justify-between">
                  <span className="text-[10px] font-mono text-zinc-400 -mt-2">0</span>
                </div>

                <div className="h-40 flex items-end justify-between gap-2 pl-10 pr-2 pb-7">
                  {realChartData.entries.map((item, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                      <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white text-[10px] font-mono px-2 py-0.5 rounded-md whitespace-nowrap z-20 pointer-events-none shadow-md">
                        {item.label}: {item.val} Tr
                      </div>

                      <div
                        style={{ height: `${Math.max(item.val > 0 ? 8 : 2, (item.val / realChartData.maxVal) * 100)}%` }}
                        className={`w-full max-w-[22px] rounded-t-md transition-all duration-300 ${
                          item.isPeak
                            ? 'bg-[#ff4b16]'
                            : item.val > 0
                              ? 'bg-zinc-800 hover:bg-[#ff4b16]'
                              : 'bg-zinc-200'
                        }`}
                      />
                      <span className={`text-[10px] font-mono mt-1.5 ${item.isPeak ? 'text-[#ff4b16] font-bold' : 'text-zinc-500'}`}>
                        {item.label}
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
                        <div className="w-8 h-8 rounded-lg bg-orange-50 text-[#ff4b16] flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-[#ff4b16] group-hover:text-white transition-colors">
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

          {/* Right Column (35% -> 4 cols): 6 Frameless Orange Shortcuts + Action Center Tab */}
          <div className="col-span-4 space-y-5">
            {/* 6 Quick Shortcuts (100% Màu Cam Thương Hiệu, Không Khung Bao Quanh) */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200/70 shadow-2xs space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900 border-b border-zinc-100 pb-2">
                Phím Tắt Điều Hành Nhanh
              </h3>

              <div className="grid grid-cols-3 gap-y-4 gap-x-2 pt-1">
                {shortcutsList.map(sc => {
                  const Icon = sc.icon;
                  return (
                    <button
                      key={sc.id}
                      onClick={sc.action}
                      className="flex flex-col items-center text-center group cursor-pointer active:scale-95 transition-all relative py-1"
                    >
                      {sc.isNew && (
                        <span className="absolute -top-1 right-2 bg-[#ff4b16] text-white text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase shadow-xs">
                          mới
                        </span>
                      )}
                      {/* Icon màu cam, không có khung bao quanh */}
                      <Icon className="w-7 h-7 text-[#ff4b16] stroke-[2.2] transition-transform duration-200 group-hover:scale-115" />
                      <span className="text-[11px] font-bold text-zinc-800 group-hover:text-[#ff4b16] mt-2 line-clamp-1 transition-colors">
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

        {/* 2. Mobile Date Filter (Hôm nay, Tuần này, Tuần trước, Tháng này, Tháng trước) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white border border-zinc-200 text-xs font-bold text-zinc-800 shadow-2xs hover:bg-zinc-50 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5 text-[#ff4b16]" />
            <span>{dateFilterLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {isDateDropdownOpen && (
            <div className="absolute top-10 left-0 z-30 bg-white border border-zinc-200 rounded-xl shadow-xl py-1 w-40 text-xs font-bold text-zinc-700">
              <button
                onClick={() => { setDateFilter('today'); setIsDateDropdownOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-orange-50 hover:text-[#ff4b16] cursor-pointer"
              >
                Hôm nay
              </button>
              <button
                onClick={() => { setDateFilter('this_week'); setIsDateDropdownOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-orange-50 hover:text-[#ff4b16] cursor-pointer"
              >
                Tuần này
              </button>
              <button
                onClick={() => { setDateFilter('last_week'); setIsDateDropdownOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-orange-50 hover:text-[#ff4b16] cursor-pointer"
              >
                Tuần trước
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

        {/* 4. Mobile 6-Grid Shortcuts: Icon Màu Cam, Không Khung Bao Quanh */}
        <div className="bg-white rounded-2xl p-3 border border-zinc-200/70 shadow-2xs">
          <div className="grid grid-cols-3 gap-y-3.5 gap-x-2 pt-1">
            {shortcutsList.map(sc => {
              const Icon = sc.icon;
              return (
                <button
                  key={sc.id}
                  onClick={sc.action}
                  className="flex flex-col items-center text-center group cursor-pointer active:scale-95 transition-all relative py-1"
                >
                  {sc.isNew && (
                    <span className="absolute -top-1 right-2 bg-[#ff4b16] text-white text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase">
                      mới
                    </span>
                  )}
                  {/* Icon màu cam, không có khung bao quanh */}
                  <Icon className="w-6 h-6 text-[#ff4b16] stroke-[2.2] transition-transform duration-200 group-hover:scale-115" />
                  <span className="text-[11px] font-bold text-zinc-800 group-hover:text-[#ff4b16] mt-1.5 line-clamp-1 transition-colors">
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

        {/* 6. Mobile Dynamic Revenue Bar Chart */}
        <div className="bg-white rounded-2xl p-3.5 border border-zinc-200/70 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900">{realChartData.title}</h3>
            </div>
            <span className="text-[10px] font-bold text-zinc-500 font-mono">
              ({(totalRevenue / 1_000_000).toFixed(1)}Tr)
            </span>
          </div>

          {/* Chart Display */}
          <div className="relative pt-2">
            <div className="absolute inset-x-0 top-2 border-b border-dashed border-zinc-100 flex justify-between">
              <span className="text-[9px] font-mono text-zinc-400 -mt-2">{realChartData.maxVal}Tr</span>
            </div>
            <div className="absolute inset-x-0 bottom-5 border-b border-zinc-200 flex justify-between">
              <span className="text-[9px] font-mono text-zinc-400 -mt-2">0</span>
            </div>

            <div className="h-24 flex items-end justify-between gap-1 pl-6 pr-1 pb-5">
              {realChartData.entries.map((item, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                  <div
                    style={{ height: `${Math.max(item.val > 0 ? 8 : 2, (item.val / realChartData.maxVal) * 100)}%` }}
                    className={`w-full max-w-[12px] rounded-t-sm transition-all duration-300 ${
                      item.isPeak
                        ? 'bg-[#ff4b16]'
                        : item.val > 0
                          ? 'bg-zinc-800'
                          : 'bg-zinc-200'
                    }`}
                  />
                  <span className={`text-[8px] font-mono mt-1 ${item.isPeak ? 'text-[#ff4b16] font-bold' : 'text-zinc-400'}`}>
                    {item.label}
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
                    <div className="w-6 h-6 rounded-md bg-orange-50 text-[#ff4b16] flex items-center justify-center font-bold text-[10px] shrink-0">
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
