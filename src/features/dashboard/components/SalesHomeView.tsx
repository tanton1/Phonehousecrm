import React, { useState, useMemo } from 'react';
import { 
  SalesInvoice, 
  DeviceItem, 
  Lead, 
  WarrantyTicket, 
  FundAccount, 
  Partner, 
  StoreBranch, 
  StaffMember 
} from '../../../types';
import { 
  calculateStaffDualWallet, 
  syncCommissionsFromAllSources 
} from '../../../utils/commissionEngine';
import { INITIAL_STAFF_MEMBERS } from '../../../data/attendanceData';
import { 
  ShoppingCart, 
  Users, 
  Phone, 
  Award, 
  DollarSign, 
  Calendar, 
  Flame, 
  Smartphone, 
  ArrowRight, 
  Plus, 
  Search, 
  TrendingUp, 
  Clock, 
  ShieldCheck, 
  CheckCircle2, 
  Sparkles, 
  Zap, 
  Wallet, 
  ChevronRight, 
  ArrowUpRight,
  ScanFace,
  Target,
  Trophy,
  Check,
  Copy,
  Layers,
  Star,
  Medal,
  SlidersHorizontal,
  Package,
  Activity,
  UserCheck,
  Percent,
  CheckCircle
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from 'recharts';

export interface SalesHomeViewProps {
  invoices: SalesInvoice[];
  devices: DeviceItem[];
  leads: Lead[];
  warrantyTickets?: WarrantyTicket[];
  funds?: FundAccount[];
  partners?: Partner[];
  branches?: StoreBranch[];
  currentBranch?: StoreBranch;
  currentUser?: StaffMember | null;
  onNavigateTab: (tabId: string) => void;
  onOpenCheckIn?: () => void;
}

export const SalesHomeView: React.FC<SalesHomeViewProps> = ({
  invoices = [],
  devices = [],
  leads = [],
  warrantyTickets = [],
  funds = [],
  partners = [],
  branches = [],
  currentBranch,
  currentUser,
  onNavigateTab,
  onOpenCheckIn
}) => {
  // 1. Time & Filter States
  const [timeScope, setTimeScope] = useState<'TODAY' | 'THIS_WEEK' | 'THIS_MONTH'>('THIS_MONTH');
  const [activeTab, setActiveTab] = useState<'KPI_TRACKER' | 'LEADS_QUEUE' | 'SALES_LEDGER' | 'LEADERBOARD'>('KPI_TRACKER');
  const [copiedImei, setCopiedImei] = useState<string | null>(null);
  const [ledgerSearch, setLedgerSearch] = useState('');

  // 2. Vietnam Time Helpers
  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  }, []);

  const currentMonthStr = useMemo(() => todayStr.slice(0, 7), [todayStr]);

  // Days left in current month
  const { currentDay, totalDaysInMonth, daysLeftInMonth } = useMemo(() => {
    const now = new Date();
    const d = now.getDate();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return {
      currentDay: d,
      totalDaysInMonth: lastDay,
      daysLeftInMonth: Math.max(1, lastDay - d)
    };
  }, []);

  // 3. Current User Identification & Invoices Filter
  const currentStaffId = currentUser?.id || (currentUser as any)?.uid || 'STAFF_001';
  const currentStaffName = currentUser?.name || (currentUser as any)?.displayName || 'Chuyên Viên Sales';

  const myInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (!currentUser) return true;
      const staffNameLower = currentStaffName.toLowerCase();
      const matchSeller = (inv.sellerName || inv.salesStaff || inv.cashier || inv.creatorName || '').toLowerCase();
      const matchCashierId = inv.cashierId === currentStaffId || inv.sellerId === currentStaffId;
      return matchCashierId || matchSeller.includes(staffNameLower) || staffNameLower.includes(matchSeller);
    });
  }, [invoices, currentUser, currentStaffId, currentStaffName]);

  // Scoped Invoices
  const scopedInvoices = useMemo(() => {
    if (timeScope === 'TODAY') {
      return myInvoices.filter(inv => (inv.createdAt || '').startsWith(todayStr));
    }
    if (timeScope === 'THIS_WEEK') {
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const mondayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(monday);
      return myInvoices.filter(inv => (inv.createdAt || '') >= mondayStr);
    }
    return myInvoices.filter(inv => (inv.createdAt || '').startsWith(currentMonthStr));
  }, [myInvoices, timeScope, todayStr, currentMonthStr]);

  // 4. Commission Engine & Dual Wallet Calculation
  const staffList = useMemo(() => INITIAL_STAFF_MEMBERS, []);

  const allCommissions = useMemo(() => {
    return syncCommissionsFromAllSources(invoices, warrantyTickets, staffList);
  }, [invoices, warrantyTickets, staffList]);

  const dualWallet = useMemo(() => {
    return calculateStaffDualWallet(currentStaffId, allCommissions, staffList);
  }, [currentStaffId, allCommissions, staffList]);

  // Financial Metrics
  const scopedRevenue = useMemo(() => {
    return scopedInvoices.reduce((sum, inv) => sum + (inv.finalAmount || inv.totalAmount || 0), 0);
  }, [scopedInvoices]);

  const scopedDeviceCount = useMemo(() => {
    return scopedInvoices.reduce((sum, inv) => sum + (inv.items?.length || inv.devices?.length || 1), 0);
  }, [scopedInvoices]);

  const todayRevenue = useMemo(() => {
    return myInvoices
      .filter(inv => (inv.createdAt || '').startsWith(todayStr))
      .reduce((sum, inv) => sum + (inv.finalAmount || inv.totalAmount || 0), 0);
  }, [myInvoices, todayStr]);

  // 5. Dynamic KPI Targets
  const monthlyTargetRevenue = (currentUser as any)?.kpiTargetRevenue || 150000000;
  const monthlyTargetOrders = (currentUser as any)?.kpiTargetOrders || 30;

  const revenueProgressPercent = Math.min(150, Math.round((scopedRevenue / monthlyTargetRevenue) * 100));
  const ordersProgressPercent = Math.min(150, Math.round((scopedDeviceCount / monthlyTargetOrders) * 100));

  const remainingRevenue = Math.max(0, monthlyTargetRevenue - scopedRevenue);
  const remainingOrders = Math.max(0, monthlyTargetOrders - scopedDeviceCount);
  const dailyTargetNeeded = Math.round(remainingRevenue / daysLeftInMonth);

  // 6. Commission & Performance Gamification Tier
  const tierInfo = useMemo(() => {
    const rev = scopedRevenue;
    if (rev >= 300000000) {
      return {
        title: 'Master Sales',
        badge: '👑 Master Sales',
        color: 'text-amber-400 bg-amber-500/20 border-amber-400/40',
        gradient: 'from-amber-500 via-orange-500 to-yellow-400',
        bonusText: 'Đã đạt cấp bậc cao nhất • Thưởng nóng +3.000.000 đ',
        nextTargetText: 'Đạt đỉnh phong độ!',
        nextTierProgress: 100
      };
    }
    if (rev >= 200000000) {
      return {
        title: 'Best Seller',
        badge: '🔥 Best Seller',
        color: 'text-rose-400 bg-rose-500/20 border-rose-400/40',
        gradient: 'from-rose-500 to-orange-500',
        bonusText: 'Thưởng nóng +1.500.000 đ • +0.3% doanh số phụ',
        nextTargetText: `Còn ${(300000000 - rev).toLocaleString('vi-VN')} đ để chạm 👑 Master Sales`,
        nextTierProgress: Math.min(100, Math.round(((rev - 200000000) / 100000000) * 100))
      };
    }
    if (rev >= 100000000) {
      return {
        title: 'Chuyên Viên',
        badge: '✨ Chuyên Viên',
        color: 'text-emerald-400 bg-emerald-500/20 border-emerald-400/40',
        gradient: 'from-emerald-500 to-teal-500',
        bonusText: 'Vượt mốc cơ bản • Mở khóa hoa hồng lũy tiến',
        nextTargetText: `Còn ${(200000000 - rev).toLocaleString('vi-VN')} đ để chạm 🔥 Best Seller`,
        nextTierProgress: Math.min(100, Math.round(((rev - 100000000) / 100000000) * 100))
      };
    }
    return {
      title: 'Tập Sự',
      badge: '🌱 Tập Sự',
      color: 'text-blue-400 bg-blue-500/20 border-blue-400/40',
      gradient: 'from-blue-500 to-indigo-500',
      bonusText: 'Đang bứt phá chỉ tiêu đầu tháng',
      nextTargetText: `Còn ${(100000000 - rev).toLocaleString('vi-VN')} đ để thăng hạng ✨ Chuyên Viên`,
      nextTierProgress: Math.min(100, Math.round((rev / 100000000) * 100))
    };
  }, [scopedRevenue]);

  // 7. Operational Actions Data (Leads, Appointments, In-Stock)
  const myLeadsToCall = useMemo(() => {
    return leads.filter(l => l.status === 'new' || l.status === 'contacted' || l.status === 'negotiating');
  }, [leads]);

  const myAppointments = useMemo(() => {
    return leads.filter(l => l.status === 'appointment_scheduled');
  }, [leads]);

  const inStockDevices = useMemo(() => {
    return devices.filter(d => d.status === 'in_stock');
  }, [devices]);

  // Aging inventory (> 30 days)
  const agingDevices = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(thirtyDaysAgo);
    return inStockDevices.filter(d => d.receivedDate && d.receivedDate < thirtyDaysAgoStr);
  }, [inStockDevices]);

  // 8. Attach Rate & Chart Waveform Data
  const attachRateStats = useMemo(() => {
    let invoicesWithAcc = 0;
    scopedInvoices.forEach(inv => {
      const hasAcc = (inv.accessories && inv.accessories.length > 0) || 
                     (inv.items && inv.items.some(i => (i.model || '').toLowerCase().includes('sạc') || (i.model || '').toLowerCase().includes('tai nghe') || (i.model || '').toLowerCase().includes('ốp')));
      if (hasAcc) invoicesWithAcc++;
    });
    const rate = scopedInvoices.length > 0 ? Math.round((invoicesWithAcc / scopedInvoices.length) * 100) : 0;
    return { invoicesWithAcc, rate };
  }, [scopedInvoices]);

  // Daily Pace Waveform (Group revenue by day of current month)
  const dailyPaceChartData = useMemo(() => {
    const dayMap: Record<number, number> = {};
    for (let i = 1; i <= currentDay; i++) {
      dayMap[i] = 0;
    }
    scopedInvoices.forEach(inv => {
      const dateStr = inv.createdAt || '';
      if (dateStr.startsWith(currentMonthStr)) {
        const dayNum = parseInt(dateStr.split('-')[2] || '1', 10);
        if (dayNum >= 1 && dayNum <= currentDay) {
          dayMap[dayNum] = (dayMap[dayNum] || 0) + (inv.finalAmount || inv.totalAmount || 0);
        }
      }
    });

    return Object.keys(dayMap).map(d => ({
      day: `N${d}`,
      revenue: Math.round(dayMap[parseInt(d, 10)] / 1000000), // in Millions VNĐ
      rawRevenue: dayMap[parseInt(d, 10)]
    }));
  }, [scopedInvoices, currentMonthStr, currentDay]);

  // Product Structure Mix
  const productMixData = useMemo(() => {
    let sealCount = 0;
    let likeNewCount = 0;
    let accessoryCount = 0;

    scopedInvoices.forEach(inv => {
      (inv.items || inv.devices || []).forEach((item: any) => {
        const name = (item.model || item.name || '').toLowerCase();
        if (name.includes('seal') || name.includes('mới')) sealCount++;
        else likeNewCount++;
      });
      accessoryCount += (inv.accessories?.length || 0);
    });

    if (sealCount === 0 && likeNewCount === 0 && accessoryCount === 0) {
      return [
        { name: 'Máy 99% Like New', value: 65, color: '#f97316' },
        { name: 'Máy New Seal', value: 25, color: '#3b82f6' },
        { name: 'Phụ kiện / Gói bảo hành', value: 10, color: '#10b981' }
      ];
    }

    return [
      { name: 'Máy 99% Like New', value: likeNewCount, color: '#f97316' },
      { name: 'Máy New Seal', value: sealCount, color: '#3b82f6' },
      { name: 'Phụ kiện & Dịch vụ', value: accessoryCount, color: '#10b981' }
    ].filter(i => i.value > 0);
  }, [scopedInvoices]);

  // 9. Showroom Leaderboard
  const showroomLeaderboard = useMemo(() => {
    const staffRevenueMap: Record<string, { name: string; revenue: number; orders: number }> = {};

    invoices.forEach(inv => {
      const dateStr = inv.createdAt || '';
      if (dateStr.startsWith(currentMonthStr) && inv.status !== 'cancelled') {
        const staffName = inv.sellerName || inv.salesStaff || inv.cashier || inv.creatorName || 'NV Bán Hàng';
        if (!staffRevenueMap[staffName]) {
          staffRevenueMap[staffName] = { name: staffName, revenue: 0, orders: 0 };
        }
        staffRevenueMap[staffName].revenue += (inv.finalAmount || inv.totalAmount || 0);
        staffRevenueMap[staffName].orders += 1;
      }
    });

    const ranking = Object.values(staffRevenueMap).sort((a, b) => b.revenue - a.revenue);
    if (ranking.length === 0) {
      return [
        { name: currentStaffName, revenue: scopedRevenue, orders: scopedInvoices.length, rank: 1 }
      ];
    }
    return ranking.map((r, idx) => ({ ...r, rank: idx + 1 }));
  }, [invoices, currentMonthStr, currentStaffName, scopedRevenue, scopedInvoices.length]);

  const handleCopyImei = (imei: string) => {
    navigator.clipboard.writeText(imei);
    setCopiedImei(imei);
    setTimeout(() => setCopiedImei(null), 2000);
  };

  return (
    <div className="space-y-5 pb-32 text-zinc-900 select-none animate-in fade-in duration-300">
      
      {/* ========================================================================= */}
      {/* 1. SEAMLESS LIVE STATUS BAR & TOP ACTIONS                                 */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-b border-zinc-100 pb-3">
        <div className="flex items-center space-x-3">
          <div className="relative flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping absolute" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 relative" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-400">
                SALES COCKPIT & KPI HUB
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-[#ff4b16] border border-orange-100">
                {currentBranch?.name || 'Showroom PhoneHouse'}
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-black text-zinc-900 flex items-center space-x-1.5">
              <span>Xin chào, {currentStaffName}</span>
              <span className="text-xs px-2 py-0.5 rounded-md font-mono font-bold bg-zinc-100 text-zinc-700">
                {tierInfo.badge}
              </span>
            </h2>
          </div>
        </div>

        {/* Quick Shift Top Buttons */}
        <div className="flex items-center space-x-2">
          {onOpenCheckIn && (
            <button
              onClick={onOpenCheckIn}
              className="px-3.5 py-2 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95 border border-zinc-200/80"
              title="Điểm danh khuôn mặt Face ID vào ca"
            >
              <ScanFace className="w-3.5 h-3.5 text-[#ff4b16]" />
              <span className="hidden sm:inline">Face ID Vào Ca</span>
            </button>
          )}

          <button
            onClick={() => onNavigateTab('crm')}
            className="px-3.5 py-2 rounded-2xl bg-orange-50 hover:bg-orange-100 text-[#ff4b16] font-bold text-xs transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95 border border-orange-200"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Lead</span>
          </button>

          <button
            onClick={() => onNavigateTab('pos')}
            className="px-4 py-2 rounded-2xl bg-gradient-to-r from-orange-500 to-[#ff4b16] text-white font-black text-xs shadow-md shadow-orange-500/25 hover:brightness-105 active:scale-95 transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>BÁN POS (F2)</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. HERO KPI & LIVE DUAL WALLET STAGE (APPLE PRO DARK THEME)               */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-b from-zinc-950 via-zinc-900 to-black text-white rounded-3xl p-5 sm:p-7 shadow-2xl relative overflow-hidden border border-zinc-800">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-orange-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          
          {/* Time Scope Switcher & Title */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-800/80">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-[#ff4b16]" />
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-zinc-300">
                Hiệu Suất Bán Hàng & Mục Tiêu KPI
              </span>
            </div>

            {/* Time Scope Chips */}
            <div className="flex items-center space-x-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 self-start sm:self-auto text-xs">
              {[
                { id: 'TODAY', label: 'Hôm nay' },
                { id: 'THIS_WEEK', label: 'Tuần này' },
                { id: 'THIS_MONTH', label: `Tháng ${new Date().getMonth() + 1}` }
              ].map(scope => (
                <button
                  key={scope.id}
                  onClick={() => setTimeScope(scope.id as any)}
                  className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    timeScope === scope.id
                      ? 'bg-gradient-to-r from-orange-500 to-[#ff4b16] text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {scope.label}
                </button>
              ))}
            </div>
          </div>

          {/* Core Numbers Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
            
            {/* Left Col: Main Revenue & Target Ring (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400 block">
                  Doanh số cá nhân ({timeScope === 'TODAY' ? 'Hôm nay' : timeScope === 'THIS_WEEK' ? 'Tuần này' : `Tháng ${new Date().getMonth() + 1}`})
                </span>
                <div className="mt-1 flex flex-wrap items-baseline gap-3">
                  <span className="text-3xl sm:text-5xl font-black font-mono tracking-tight text-white">
                    {scopedRevenue.toLocaleString('vi-VN')} <span className="text-lg sm:text-2xl text-[#ff4b16] font-sans">đ</span>
                  </span>
                  <span className="text-xs font-bold font-mono px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>{scopedDeviceCount} máy</span>
                  </span>
                </div>
              </div>

              {/* Progress Bar & Smart Daily Pace Recommendation */}
              <div className="space-y-2 bg-zinc-900/60 p-3.5 rounded-2xl border border-zinc-800/80">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-zinc-400 flex items-center space-x-1.5">
                    <Target className="w-3.5 h-3.5 text-[#ff4b16]" />
                    <span>Mục tiêu KPI tháng: <b className="text-white font-bold">{monthlyTargetRevenue.toLocaleString('vi-VN')} đ</b></span>
                  </span>
                  <span className="text-emerald-400 font-bold">{revenueProgressPercent}%</span>
                </div>
                
                <div className="w-full h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    style={{ width: `${Math.min(100, revenueProgressPercent)}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-[#ff4b16] transition-all duration-700 shadow-sm shadow-orange-500/50"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-0.5">
                  {remainingRevenue > 0 ? (
                    <span>
                      ⏳ Còn thiếu: <b className="text-orange-400 font-bold">{remainingRevenue.toLocaleString('vi-VN')} đ</b> ({remainingOrders} máy)
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-bold flex items-center space-x-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>🎉 Đã xuất sắc vượt kế hoạch tháng!</span>
                    </span>
                  )}
                  <span>
                    🚀 Cần: <b className="text-white font-bold">{dailyTargetNeeded.toLocaleString('vi-VN')} đ/ngày</b> ({daysLeftInMonth} ngày còn)
                  </span>
                </div>
              </div>
            </div>

            {/* Right Col: Live Dual Commission Wallet & Rank Box (5 cols) */}
            <div className="lg:col-span-5 bg-gradient-to-br from-zinc-900/90 to-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-mono font-bold text-zinc-300 uppercase">Ví Hoa Hồng Tích Lũy</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Thời Gian Thực
                </span>
              </div>

              {/* Commission Total */}
              <div>
                <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
                  +{dualWallet.grandTotalCommission.toLocaleString('vi-VN')} <span className="text-sm font-sans">đ</span>
                </span>
                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-zinc-800/80 text-[11px] font-mono">
                  <div className="bg-zinc-950/60 p-2 rounded-xl border border-zinc-800">
                    <span className="text-zinc-500 block text-[10px]">Hoa hồng Máy</span>
                    <span className="text-white font-bold">+{dualWallet.salesWallet.deviceCommission.toLocaleString('vi-VN')} đ</span>
                  </div>
                  <div className="bg-zinc-950/60 p-2 rounded-xl border border-zinc-800">
                    <span className="text-zinc-500 block text-[10px]">Phụ kiện & Dịch vụ</span>
                    <span className="text-amber-400 font-bold">+{(dualWallet.salesWallet.accessoryCommission + dualWallet.salesWallet.carePackageCommission).toLocaleString('vi-VN')} đ</span>
                  </div>
                </div>
              </div>

              {/* Gamified Tier Banner */}
              <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <span className="text-zinc-400 text-[10px] block">Cấp bậc thi đua:</span>
                  <span className="font-bold text-white text-xs">{tierInfo.badge}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-zinc-400 block">{tierInfo.nextTargetText}</span>
                  <span className="text-[10px] font-mono text-[#ff4b16] font-bold">
                    Tiến độ thăng hạng: {tierInfo.nextTierProgress}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Mini Executive KPI Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-zinc-800/80 text-xs">
            <div className="bg-zinc-900/40 p-2.5 rounded-xl border border-zinc-800/60">
              <span className="text-zinc-500 block text-[10px]">Doanh số ca hôm nay</span>
              <span className="text-sm sm:text-base font-black font-mono text-[#ff4b16] mt-0.5 block">
                +{todayRevenue.toLocaleString('vi-VN')} đ
              </span>
            </div>

            <div className="bg-zinc-900/40 p-2.5 rounded-xl border border-zinc-800/60">
              <span className="text-zinc-500 block text-[10px]">Máy sẵn bán tại quầy</span>
              <span className="text-sm sm:text-base font-black font-mono text-white mt-0.5 block">
                {inStockDevices.length} máy
              </span>
            </div>

            <div className="bg-zinc-900/40 p-2.5 rounded-xl border border-zinc-800/60">
              <span className="text-zinc-500 block text-[10px]">Lịch hẹn hôm nay</span>
              <span className="text-sm sm:text-base font-black font-mono text-purple-400 mt-0.5 block">
                {myAppointments.length} khách
              </span>
            </div>

            <div className="bg-zinc-900/40 p-2.5 rounded-xl border border-zinc-800/60">
              <span className="text-zinc-500 block text-[10px]">Tỷ lệ kèm Phụ Kiện</span>
              <span className="text-sm sm:text-base font-black font-mono text-emerald-400 mt-0.5 block">
                {attachRateStats.rate}% ({attachRateStats.invoicesWithAcc} đơn)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. INTEGRATED 4-TAB DEEP WORK & MOTIVATION CENTER                         */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        
        {/* Tab Navigation Pill Bar */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none border-b border-zinc-200/80">
          {[
            { id: 'KPI_TRACKER', label: '🎯 Mục Tiêu & Nhịp Độ', count: `${revenueProgressPercent}%` },
            { id: 'LEADS_QUEUE', label: '📋 Khách Hàng & Việc Cần Chốt', count: myAppointments.length + myLeadsToCall.length },
            { id: 'SALES_LEDGER', label: '💰 Sổ Bán & Bảng Kê Hoa Hồng', count: scopedInvoices.length },
            { id: 'LEADERBOARD', label: '🏆 Bảng Vinh Danh Showroom', count: `Top ${showroomLeaderboard.find(s => s.name === currentStaffName)?.rank || 1}` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all flex items-center space-x-2 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-zinc-950 text-white shadow-md'
                  : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200/80'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-black ${
                activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-700'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* TAB 1: 🎯 KPI TRACKER & PACE CHARTS */}
        {activeTab === 'KPI_TRACKER' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            
            {/* Row 1: Daily Pace Chart & Product Mix */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              
              {/* Daily Pace Area Chart (8 cols) */}
              <div className="lg:col-span-8 bg-white p-4 sm:p-5 rounded-3xl border border-zinc-200/80 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-[#ff4b16]" />
                    <h3 className="text-xs sm:text-sm font-black text-zinc-900 uppercase tracking-tight">
                      Nhịp Độ Doanh Số Cá Nhân (Theo Ngày Trong Tháng)
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-zinc-400">Đơn vị: Triệu VNĐ</span>
                </div>

                <div className="h-56 sm:h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyPaceChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ff4b16" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#ff4b16" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="day" stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#18181b', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '11px' }}
                        formatter={(value: any) => [`${Number(value).toLocaleString('vi-VN')} Tr VNĐ`, 'Doanh số']}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="#ff4b16" strokeWidth={2.5} fillOpacity={1} fill="url(#salesGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Product Mix Pie (4 cols) */}
              <div className="lg:col-span-4 bg-white p-4 sm:p-5 rounded-3xl border border-zinc-200/80 shadow-2xs space-y-3 flex flex-col justify-between">
                <div className="flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-orange-500" />
                  <h3 className="text-xs sm:text-sm font-black text-zinc-900 uppercase tracking-tight">
                    Cơ Cấu Sản Phẩm Đã Bán
                  </h3>
                </div>

                <div className="h-44 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={productMixData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {productMixData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#18181b', borderRadius: '10px', border: 'none', color: '#fff', fontSize: '10px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-1.5 text-xs font-medium border-t border-zinc-100 pt-2.5">
                  {productMixData.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center space-x-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-zinc-600 truncate">{item.name}</span>
                      </div>
                      <span className="font-mono font-bold text-zinc-900">{item.value} món</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: Aging Stock Incentive (Xả Hàng Thưởng Nóng) */}
            <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-rose-500/10 border border-orange-200/80 rounded-3xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Flame className="w-4 h-4 text-orange-600" />
                  <h3 className="text-xs sm:text-sm font-black text-orange-950 uppercase tracking-tight">
                    🔥 Danh Sách Máy Tồn &gt;30 Ngày Cần Đẩy Gấp (Thưởng Thêm Hoa Hồng Nóng)
                  </h3>
                </div>
                <span className="text-xs font-mono font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                  {agingDevices.length} máy
                </span>
              </div>

              {agingDevices.length === 0 ? (
                <p className="text-xs text-zinc-500 italic py-2">
                  ✅ Hiện không có máy nào tồn quá 30 ngày tại chi nhánh. Vòng quay kho rất tốt!
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {agingDevices.slice(0, 6).map(dev => (
                    <div 
                      key={dev.id}
                      className="bg-white p-3 rounded-2xl border border-orange-200 shadow-2xs flex items-center justify-between space-x-2 hover:border-orange-400 transition-all"
                    >
                      <div className="min-w-0">
                        <h5 className="text-xs font-black text-zinc-900 truncate">{dev.model}</h5>
                        <p className="text-[10px] text-zinc-500 truncate font-mono">
                          {dev.storage} • {dev.color} • PIN {dev.batteryHealth || 100}%
                        </p>
                        <span className="text-[10px] font-bold text-rose-600 font-mono">
                          Giá: {(dev.sellPrice || 0).toLocaleString('vi-VN')} đ
                        </span>
                      </div>

                      <button
                        onClick={() => onNavigateTab('pos')}
                        className="px-2.5 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-[10px] shrink-0 cursor-pointer shadow-xs active:scale-95"
                      >
                        Bán Ngay
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: 📋 LEADS & APPOINTMENTS QUEUE */}
        {activeTab === 'LEADS_QUEUE' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Danh sách khách hàng tiềm năng & lịch hẹn trong ngày
              </span>
              <button
                onClick={() => onNavigateTab('crm')}
                className="text-xs font-bold text-[#ff4b16] hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <span>Mở Toàn Bộ CRM Leads</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              
              {/* Lịch Hẹn Showroom */}
              <div className="bg-white rounded-3xl p-4 border border-zinc-200/80 shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-purple-600" />
                    <h4 className="text-xs font-black text-zinc-900 uppercase">Lịch Hẹn Xem Máy Showroom</h4>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-mono">
                    {myAppointments.length} khách
                  </span>
                </div>

                {myAppointments.length === 0 ? (
                  <div className="py-8 text-center text-zinc-400 text-xs">
                    Chưa có lịch hẹn xem máy mới trong hôm nay.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {myAppointments.map(lead => (
                      <div key={lead.id} className="p-3 rounded-2xl bg-purple-50/40 border border-purple-100 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <h5 className="text-xs font-bold text-zinc-900 truncate">{lead.name}</h5>
                          <p className="text-[11px] text-zinc-500 truncate">
                            📱 {lead.phone} • Hẹn xem: <b className="text-purple-700">{lead.interestedModel || 'iPhone'}</b>
                          </p>
                        </div>

                        <a
                          href={`tel:${lead.phone}`}
                          className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center space-x-1 shrink-0 cursor-pointer shadow-xs"
                        >
                          <Phone className="w-3 h-3" />
                          <span>Gọi ngay</span>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Leads Cần Tư Vấn Gấp */}
              <div className="bg-white rounded-3xl p-4 border border-zinc-200/80 shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    <h4 className="text-xs font-black text-zinc-900 uppercase">Leads Mới Cần Tư Vấn Gấp</h4>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-mono">
                    {myLeadsToCall.length} leads
                  </span>
                </div>

                {myLeadsToCall.length === 0 ? (
                  <div className="py-8 text-center text-zinc-400 text-xs">
                    Đã phản hồi hết toàn bộ leads chăm sóc.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {myLeadsToCall.slice(0, 5).map(lead => (
                      <div key={lead.id} className="p-3 rounded-2xl bg-blue-50/40 border border-blue-100 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <h5 className="text-xs font-bold text-zinc-900 truncate">{lead.name}</h5>
                          <p className="text-[11px] text-zinc-500 truncate">
                            Quan tâm: <b className="text-blue-700">{lead.interestedModel || 'iPhone'}</b> • Nguồn: {lead.source || 'Facebook/Web'}
                          </p>
                        </div>

                        <button
                          onClick={() => onNavigateTab('crm')}
                          className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center space-x-1 shrink-0 cursor-pointer shadow-xs"
                        >
                          <span>Chăm sóc</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: 💰 SALES LEDGER & COMMISSIONS */}
        {activeTab === 'SALES_LEDGER' && (
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs space-y-4 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
              <div>
                <h3 className="text-xs sm:text-sm font-black text-zinc-900 uppercase">
                  Sổ Bán Hàng & Bảng Kê Hoa Hồng Từng Đơn
                </h3>
                <p className="text-[11px] text-zinc-500">
                  Ghi nhận minh bạch theo thời gian thực mọi giao dịch do bạn chốt trong tháng.
                </p>
              </div>

              <div className="relative max-w-xs w-full">
                <input
                  type="text"
                  placeholder="Tìm mã đơn, tên khách..."
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-1.5 pl-8 text-xs font-bold focus:outline-none focus:border-[#ff4b16]"
                />
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            {scopedInvoices.length === 0 ? (
              <div className="py-12 text-center text-zinc-400 text-xs">
                Chưa có đơn hàng nào trong chu kỳ này.
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Mã Hóa Đơn</th>
                      <th className="py-2.5 px-3">Khách Hàng</th>
                      <th className="py-2.5 px-3">Sản Phẩm</th>
                      <th className="py-2.5 px-3 text-right">Giá Trị Đơn</th>
                      <th className="py-2.5 px-3 text-right">Hoa Hồng Tạm Tính</th>
                      <th className="py-2.5 px-3 text-center">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {scopedInvoices
                      .filter(inv => {
                        if (!ledgerSearch) return true;
                        const s = ledgerSearch.toLowerCase();
                        return (inv.invoiceCode || inv.id).toLowerCase().includes(s) || (inv.customerName || '').toLowerCase().includes(s);
                      })
                      .map((inv) => {
                        const itemsCount = inv.items?.length || inv.devices?.length || 1;
                        const estComm = Math.round((inv.finalAmount || inv.totalAmount || 0) * 0.012 + itemsCount * 50000);

                        return (
                          <tr key={inv.id} className="hover:bg-zinc-50/70 transition-colors">
                            <td className="py-3 px-3 font-mono font-bold text-zinc-900">
                              {inv.invoiceCode || `HD-${inv.id.slice(-6)}`}
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-bold text-zinc-800 block">{inv.customerName || 'Khách vãng lai'}</span>
                              <span className="text-[10px] text-zinc-400 font-mono">{inv.customerPhone || ''}</span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-medium text-zinc-700 block truncate max-w-xs">
                                {inv.items?.[0]?.model || inv.devices?.[0]?.model || 'Sản phẩm tại quầy'}
                              </span>
                              <span className="text-[10px] text-zinc-400">
                                {itemsCount} sản phẩm • {inv.paymentMethod || 'Tiền mặt'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-zinc-950">
                              {(inv.finalAmount || inv.totalAmount || 0).toLocaleString('vi-VN')} đ
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-black text-emerald-600">
                              +{estComm.toLocaleString('vi-VN')} đ
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Hoàn Tất
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: 🏆 SHOWROOM LEADERBOARD */}
        {activeTab === 'LEADERBOARD' && (
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center space-x-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-zinc-900 uppercase">
                    Bảng Vinh Danh Doanh Số Showroom Tháng {new Date().getMonth() + 1}
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Bảng xếp hạng thi đua doanh số nội bộ giữa các chuyên viên tư vấn tại showroom.
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                Showroom Cup
              </span>
            </div>

            <div className="space-y-2.5">
              {showroomLeaderboard.map((staff, idx) => {
                const isMe = staff.name === currentStaffName;
                const isTop1 = idx === 0;
                const isTop2 = idx === 1;
                const isTop3 = idx === 2;

                return (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-2xl flex items-center justify-between gap-3 border transition-all ${
                      isMe 
                        ? 'bg-orange-50/80 border-[#ff4b16] shadow-sm' 
                        : isTop1 
                        ? 'bg-amber-50/60 border-amber-200' 
                        : 'bg-zinc-50/70 border-zinc-200/70'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono font-black text-xs shrink-0 ${
                        isTop1 ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30' :
                        isTop2 ? 'bg-zinc-400 text-white' :
                        isTop3 ? 'bg-amber-700 text-white' :
                        'bg-zinc-200 text-zinc-700'
                      }`}>
                        {idx + 1}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className={`text-xs sm:text-sm font-black truncate ${isMe ? 'text-[#ff4b16]' : 'text-zinc-900'}`}>
                            {staff.name} {isMe && '(Tôi)'}
                          </h4>
                          {isTop1 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                              🥇 Quán Quân
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-500 font-mono">
                          {staff.orders} đơn hàng thành công
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs sm:text-sm font-black font-mono text-zinc-950 block">
                        {staff.revenue.toLocaleString('vi-VN')} đ
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600 font-mono">
                        +{Math.round(staff.revenue * 0.012).toLocaleString('vi-VN')} đ hoa hồng
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. MINIMALIST FLOATING BOTTOM THUMB-DOCK (MOBILE FAST ACTION)             */}
      {/* ========================================================================= */}
      <div className="fixed bottom-3 inset-x-0 z-40 px-3 flex justify-center pointer-events-none">
        <div className="pointer-events-auto bg-zinc-950/90 backdrop-blur-xl border border-zinc-800/80 p-1.5 rounded-full shadow-2xl flex items-center gap-2 text-white">
          <button
            onClick={() => onNavigateTab('crm')}
            className="px-3.5 py-2 rounded-full hover:bg-zinc-800 text-zinc-300 hover:text-white font-bold text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Tạo Lead</span>
          </button>

          <button
            onClick={() => onNavigateTab('pos')}
            className="px-5 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-[#ff4b16] text-white font-black text-xs sm:text-sm shadow-lg shadow-orange-500/30 hover:brightness-110 active:scale-95 transition-all flex items-center space-x-2 cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>BÁN POS (F2)</span>
          </button>

          <button
            onClick={() => onNavigateTab('inventory')}
            className="px-3.5 py-2 rounded-full hover:bg-zinc-800 text-zinc-300 hover:text-white font-bold text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Tra IMEI</span>
          </button>
        </div>
      </div>
    </div>
  );
};

