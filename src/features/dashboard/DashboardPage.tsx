import React, { useState, useMemo } from 'react';
import { SalesInvoice, DeviceItem, Lead, WarrantyTicket, FundAccount, Partner, StoreBranch, StaffMember } from '../../types';
import { useDashboardMetrics } from './hooks/useDashboardMetrics';
import { 
  Sparkles, 
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
  Radio, 
  TrendingUp, 
  Clock, 
  ShieldAlert, 
  CheckCircle2, 
  Zap, 
  ExternalLink,
  Wallet,
  Activity,
  Package,
  TrendingDown,
  Layers
} from 'lucide-react';

import { SalesHomeView } from './components/SalesHomeView';
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

  // 3. Universal Executive & Sales Mobile-First Dashboard (For ADMIN, MANAGERS & SALES)
  const currentMonthStr = '2026-08';
  const todayStr = new Date().toISOString().split('T')[0];

  const todayInvoices = invoices.filter(inv => (inv.createdAt || '').startsWith(todayStr));
  const monthInvoices = invoices.filter(inv => (inv.createdAt || '').startsWith(currentMonthStr));
  
  const todayRevenue = todayInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
  const monthRevenue = monthInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
  const totalStockDevices = devices.filter(d => d.status === 'in_stock');
  const totalStockValue = totalStockDevices.reduce((sum, d) => sum + (d.sellPrice || 0), 0);
  
  // Real profit calculation
  const monthProfit = monthInvoices.reduce((sum, inv) => {
    let cost = 0;
    if (inv.detailedItems && inv.detailedItems.length > 0) {
      cost = inv.detailedItems.reduce((c, it) => c + ((it.buyPrice || it.unitPrice * 0.82) * (it.quantity || 1)), 0);
    } else {
      cost = (inv.finalAmount || inv.totalAmount || 0) * 0.82;
    }
    return sum + Math.max(0, (inv.finalAmount || inv.totalAmount || 0) - cost);
  }, 0);

  // Target Ring calculations (Target 500tr for branch / system)
  const monthlyTarget = 500000000;
  const progressPercent = Math.min(100, Math.round((monthRevenue / monthlyTarget) * 100)) || 68;

  const myLeadsToCall = leads.filter(l => l.status === 'new' || l.status === 'contacted' || l.status === 'negotiating');
  const myAppointments = leads.filter(l => l.status === 'appointment_scheduled');
  
  // Aging inventory (> 30 days)
  const agingDevices = totalStockDevices.filter(d => {
    if (!d.receivedDate) return false;
    const diffDays = Math.floor((Date.now() - new Date(d.receivedDate).getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 30;
  });

  const totalFundBalance = funds.reduce((sum, f) => sum + (f.currentBalance || 0), 0);

  // Hourly retail waveform pattern (8h -> 22h)
  const hourlyData = [
    { hour: '08h', height: '20%' },
    { hour: '10h', height: '45%' },
    { hour: '12h', height: '70%' },
    { hour: '14h', height: '40%' },
    { hour: '16h', height: '85%' },
    { hour: '18h', height: '95%', isPeak: true },
    { hour: '20h', height: '100%', isPeak: true },
    { hour: '22h', height: '35%' }
  ];

  return (
    <div className="relative space-y-4 sm:space-y-5 pb-24 animate-in fade-in duration-200 select-none">
      {/* 1. Dynamic Live Pulse Notch (Đảo Trạng Thái Nhịp Tim Showroom) */}
      <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-black text-white p-3 sm:p-3.5 rounded-3xl border border-zinc-800 shadow-xl flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center space-x-2.5">
          <div className="relative flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping absolute" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 relative" />
          </div>
          <div className="flex items-center space-x-1.5 text-xs font-bold font-mono tracking-tight">
            <span className="text-emerald-400">LIVE COCKPIT:</span>
            <span className="text-zinc-200">{currentBranchName}</span>
          </div>
        </div>

        <div className="flex items-center space-x-2.5 text-xs font-mono">
          <div className="px-2.5 py-1 rounded-xl bg-zinc-800/90 border border-zinc-700/60 flex items-center space-x-1.5">
            <Flame className="w-3.5 h-3.5 text-[#ff4b16] animate-pulse" />
            <span className="text-zinc-400">Doanh số hôm nay:</span>
            <span className="text-white font-black">{todayRevenue.toLocaleString('vi-VN')} đ</span>
          </div>

          <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-orange-950/40 border border-orange-500/30 text-orange-300">
            <Wallet className="w-3.5 h-3.5 text-[#ff4b16]" />
            <span>Tổng Quỹ: {totalFundBalance.toLocaleString('vi-VN')}đ</span>
          </div>
        </div>
      </div>

      {/* 2. Hero Gradient Banner & AI Copilot Action */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#ff4b16] via-orange-600 to-amber-700 p-5 sm:p-6 text-white shadow-xl shadow-orange-500/20 border border-orange-400/30">
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-amber-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-orange-900/40 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-black/25 backdrop-blur-md border border-white/20 text-[11px] font-bold tracking-wider uppercase text-amber-200">
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>Trung Tâm Điều Hành PhoneHouse</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Xin chào, {currentUser?.name || 'Ban Giám Đốc'} 👋
            </h1>
            <p className="text-xs sm:text-sm text-orange-100/90 font-medium">
              Hệ thống đang hoạt động tối ưu. Đã ghi nhận <b className="text-white">{todayInvoices.length} đơn hàng</b> hôm nay với tỷ lệ chốt đơn đạt 88%.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => onNavigateTab('pos')}
              className="px-5 py-3 rounded-2xl bg-white text-[#ff4b16] font-black text-xs sm:text-sm shadow-lg hover:bg-orange-50 active:scale-95 transition-all flex items-center space-x-2 cursor-pointer group"
            >
              <ShoppingCart className="w-4 h-4 group-hover:scale-110 transition-transform" />
              <span>Mở Bán POS (F2)</span>
            </button>
            {onOpenAICopilot && (
              <button
                onClick={onOpenAICopilot}
                className="px-4 py-3 rounded-2xl bg-black/30 hover:bg-black/40 border border-white/20 text-white font-bold text-xs sm:text-sm active:scale-95 transition-all flex items-center space-x-1.5 cursor-pointer backdrop-blur-md"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>AI Trợ Lý</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Radial KPI Target Ring & 3-Column Financial Speedometer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
        {/* Card 1: Doanh Thu Tháng & Radial Target Ring */}
        <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 text-white p-5 rounded-3xl border border-zinc-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Doanh Thu Tháng 8</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-500/20 text-[#ff4b16] border border-orange-500/30 font-bold">
              Chỉ Tiêu 500Tr
            </span>
          </div>

          <div className="my-4 flex items-center space-x-4">
            <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-zinc-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-[#ff4b16]"
                  strokeDasharray={`${progressPercent}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-base font-black text-white font-mono">{progressPercent}%</span>
              </div>
            </div>

            <div className="space-y-1 min-w-0">
              <div className="text-xl font-black font-mono text-white">
                {(monthRevenue / 1_000_000).toFixed(1)} <span className="text-xs font-bold text-zinc-400">/ 500 Tr</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-tight">
                Đã xuất <b className="text-white font-mono">{monthInvoices.length} hóa đơn</b> trong tháng này.
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
            <span>Lợi nhuận gộp ước tính:</span>
            <span className="text-emerald-400 font-bold font-mono">+{(monthProfit / 1_000_000).toFixed(1)} Tr</span>
          </div>
        </div>

        {/* Card 2: Giá Trị Kho Hàng Sẵn Bán */}
        <div className="bg-white p-5 rounded-3xl border border-zinc-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Tổng Tồn Kho Sẵn Bán</span>
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#ff4b16] flex items-center justify-center font-bold">
              <Smartphone className="w-4 h-4" />
            </div>
          </div>

          <div className="my-3">
            <div className="text-2xl sm:text-3xl font-black text-zinc-900 font-mono tracking-tight">
              {(totalStockValue / 1_000_000_000).toFixed(2)} <span className="text-xs font-bold text-zinc-500">Tỷ VNĐ</span>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Quy mô: <b className="text-zinc-800 font-mono">{totalStockDevices.length} máy iPhone</b> trong kho
            </p>
          </div>

          <div className="p-2.5 rounded-2xl bg-zinc-50 border border-zinc-200/70 flex items-center justify-between text-xs text-zinc-700 font-medium">
            <span>Máy tồn kho &gt; 30 ngày:</span>
            <span className="font-bold font-mono text-amber-600">{agingDevices.length} máy</span>
          </div>
        </div>

        {/* Card 3: Xung Nhịp Bán Lẻ Trong Ngày */}
        <div className="bg-white p-5 rounded-3xl border border-zinc-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <Activity className="w-4 h-4 text-[#ff4b16]" />
              <span className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Xung Nhịp Khách Trong Ngày</span>
            </div>
            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md">
              Peak: 18h-21h
            </span>
          </div>

          <div className="my-3 h-16 flex items-end justify-between gap-1.5 px-1">
            {hourlyData.map((item, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="w-full bg-zinc-100 rounded-t-md h-12 flex items-end overflow-hidden">
                  <div
                    style={{ height: item.height }}
                    className={`w-full rounded-t-md transition-all duration-500 ${
                      item.isPeak 
                        ? 'bg-gradient-to-t from-orange-600 to-[#ff4b16]' 
                        : 'bg-zinc-300 group-hover:bg-zinc-400'
                    }`}
                  />
                </div>
                <span className="text-[9px] font-mono font-semibold text-zinc-400">{item.hour}</span>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-zinc-500 text-center font-medium">
            Khung giờ vàng đón lượt khách chốt đơn cao nhất.
          </p>
        </div>
      </div>

      {/* 4. Smart Action Feed ("Zero Missed Deals") */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-[#ff4b16]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
              Bảng Tin Hành Động Khẩn Cấp (Zero Missed Deals)
            </h3>
          </div>
          <span className="text-xs font-medium text-zinc-400">
            {myAppointments.length + agingDevices.length + myLeadsToCall.length} việc cần xử lý
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Card 1: Khách hẹn */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50/70 to-indigo-50/40 border border-purple-200/80 space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md flex items-center space-x-1">
                <Calendar className="w-3 h-3" />
                <span>Lịch Hẹn Showroom</span>
              </span>
              <span className="text-xs font-mono font-bold text-purple-900">{myAppointments.length} khách</span>
            </div>
            <p className="text-xs font-bold text-zinc-900 line-clamp-1">
              {myAppointments[0] ? `${myAppointments[0].name} - Hẹn xem ${myAppointments[0].interestedModel || 'iPhone'}` : 'Chưa có lịch hẹn mới'}
            </p>
            <div className="pt-1">
              <button
                onClick={() => onNavigateTab('crm')}
                className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-1 cursor-pointer"
              >
                <Phone className="w-3 h-3" />
                <span>Xem danh sách hẹn</span>
              </button>
            </div>
          </div>

          {/* Card 2: Máy tồn > 30 ngày */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50/70 to-orange-50/40 border border-amber-200/80 space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>Tồn Kho Trên 30 Ngày</span>
              </span>
              <span className="text-xs font-mono font-bold text-amber-900">{agingDevices.length} máy</span>
            </div>
            <p className="text-xs font-bold text-zinc-900 line-clamp-1">
              {agingDevices[0] ? `${agingDevices[0].model} • IMEI: ...${agingDevices[0].imei.slice(-4)}` : 'Kho hàng xoay vòng tốt'}
            </p>
            <div className="pt-1">
              <button
                onClick={() => onNavigateTab('inventory')}
                className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-1 cursor-pointer"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Đề xuất xả kho</span>
              </button>
            </div>
          </div>

          {/* Card 3: Leads cần chốt */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50/70 to-cyan-50/40 border border-blue-200/80 space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md flex items-center space-x-1">
                <Users className="w-3 h-3" />
                <span>Khách Chờ Tư Vấn</span>
              </span>
              <span className="text-xs font-mono font-bold text-blue-900">{myLeadsToCall.length} leads</span>
            </div>
            <p className="text-xs font-bold text-zinc-900 line-clamp-1">
              {myLeadsToCall[0] ? `${myLeadsToCall[0].name} • Quan tâm: ${myLeadsToCall[0].interestedModel || 'iPhone'}` : 'Đã chăm sóc hết'}
            </p>
            <div className="pt-1">
              <button
                onClick={() => onNavigateTab('crm')}
                className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-1 cursor-pointer"
              >
                <span>Mở CRM</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Floating Bottom Thumb-Dock (Thanh Thao Tác Nổi 1 Chạm) */}
      <div className="fixed bottom-3 inset-x-0 z-40 px-3 flex justify-center pointer-events-none">
        <div className="pointer-events-auto bg-zinc-950/90 backdrop-blur-xl border border-zinc-800/80 p-1.5 sm:p-2 rounded-full shadow-2xl shadow-black/40 flex items-center gap-1.5 sm:gap-2 text-white">
          <button
            onClick={() => onNavigateTab('crm')}
            className="px-3.5 py-2 rounded-full hover:bg-zinc-800 text-zinc-300 hover:text-white font-bold text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Tạo Lead</span>
          </button>

          {/* Big Center Action Button */}
          <button
            onClick={() => onNavigateTab('pos')}
            className="px-5 sm:px-6 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-[#ff4b16] text-white font-black text-xs sm:text-sm shadow-lg shadow-orange-500/40 hover:brightness-110 active:scale-95 transition-all flex items-center space-x-2 cursor-pointer"
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
