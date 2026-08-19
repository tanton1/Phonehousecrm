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
  ChevronRight,
  TrendingDown,
  Layers,
  ArrowUpRight
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

  // 3. Fluid Luxury Dashboard (Apple/Porsche Design System - Minimal Borders, Unified Canvas)
  const currentMonthStr = '2026-08';
  const todayStr = new Date().toISOString().split('T')[0];

  const todayInvoices = invoices.filter(inv => (inv.createdAt || '').startsWith(todayStr));
  const monthInvoices = invoices.filter(inv => (inv.createdAt || '').startsWith(currentMonthStr));
  
  const todayRevenue = todayInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
  const monthRevenue = monthInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
  const totalStockDevices = devices.filter(d => d.status === 'in_stock');
  const totalStockValue = totalStockDevices.reduce((sum, d) => sum + (d.sellPrice || 0), 0);
  
  // Profit calculation
  const monthProfit = monthInvoices.reduce((sum, inv) => {
    let cost = 0;
    if (inv.detailedItems && inv.detailedItems.length > 0) {
      cost = inv.detailedItems.reduce((c, it) => c + ((it.buyPrice || it.unitPrice * 0.82) * (it.quantity || 1)), 0);
    } else {
      cost = (inv.finalAmount || inv.totalAmount || 0) * 0.82;
    }
    return sum + Math.max(0, (inv.finalAmount || inv.totalAmount || 0) - cost);
  }, 0);

  // Target calculations (Target 500tr for branch / system)
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
    { hour: '08h', height: '25%' },
    { hour: '10h', height: '50%' },
    { hour: '12h', height: '65%' },
    { hour: '14h', height: '45%' },
    { hour: '16h', height: '80%' },
    { hour: '18h', height: '95%', isPeak: true },
    { hour: '20h', height: '100%', isPeak: true },
    { hour: '22h', height: '40%' }
  ];

  return (
    <div className="space-y-6 pb-28 text-zinc-900 select-none animate-in fade-in duration-300">
      
      {/* 1. Seamless Live Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-b border-zinc-100 pb-3">
        <div className="flex items-center space-x-3">
          <div className="relative flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping absolute" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 relative" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-400">TRUNG TÂM ĐIỀU HÀNH</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-[#ff4b16]">
                {currentBranchName}
              </span>
            </div>
            <h2 className="text-sm font-bold text-zinc-800">
              Xin chào, <span className="text-zinc-900">{currentUser?.name || 'Ban Quản Trị'}</span>
            </h2>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onNavigateTab('pos')}
            className="px-4 py-2 rounded-2xl bg-gradient-to-r from-orange-500 to-[#ff4b16] text-white font-bold text-xs shadow-md shadow-orange-500/25 hover:brightness-105 active:scale-95 transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Vào POS Bán Hàng (F2)</span>
          </button>

          {onOpenAICopilot && (
            <button
              onClick={onOpenAICopilot}
              className="p-2 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors cursor-pointer"
              title="AI Trợ Lý Điều Hành"
            >
              <Sparkles className="w-4 h-4 text-[#ff4b16]" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Unified Fluent Financial Stage (Không đóng khung chữ nhật rời rạc) */}
      <div className="bg-gradient-to-b from-zinc-950 via-zinc-900 to-black text-white rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-0 right-1/4 w-80 h-80 bg-orange-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          {/* Top Row: Total Month Revenue Headline & Today Pulse */}
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-zinc-400">
                Doanh Thu Tháng {new Date().getMonth() + 1}
              </span>
              <div className="mt-1 flex items-baseline space-x-3">
                <span className="text-3xl sm:text-5xl font-black font-mono tracking-tight text-white">
                  {monthRevenue.toLocaleString('vi-VN')} <span className="text-lg sm:text-2xl text-[#ff4b16] font-sans">đ</span>
                </span>
                <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center space-x-0.5">
                  <ArrowUpRight className="w-3 h-3" />
                  <span>+18.4%</span>
                </span>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-[11px] font-mono text-zinc-400 block">Doanh số hôm nay</span>
              <span className="text-lg sm:text-xl font-bold font-mono text-[#ff4b16]">
                +{todayRevenue.toLocaleString('vi-VN')} đ
              </span>
              <span className="text-[10px] text-zinc-400 block mt-0.5">
                ({todayInvoices.length} đơn xuất trong ngày)
              </span>
            </div>
          </div>

          {/* Progress Line */}
          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-zinc-400">Tiến độ chỉ tiêu tháng (500 Triệu VNĐ)</span>
              <span className="text-white font-bold">{progressPercent}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                style={{ width: `${progressPercent}%` }}
                className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-[#ff4b16] transition-all duration-700 shadow-sm shadow-orange-500/50"
              />
            </div>
          </div>

          {/* Integrated Statistics Grid (Dạng bảng số liệu mở, không viền hộp) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-zinc-800/80 text-xs">
            <div>
              <span className="text-zinc-500 block text-[11px]">Lợi nhuận gộp ước tính</span>
              <span className="text-base sm:text-lg font-black font-mono text-emerald-400 mt-0.5 block">
                +{(monthProfit / 1_000_000).toFixed(1)} Tr
              </span>
            </div>

            <div>
              <span className="text-zinc-500 block text-[11px]">Giá trị kho sẵn bán</span>
              <span className="text-base sm:text-lg font-black font-mono text-white mt-0.5 block">
                {(totalStockValue / 1_000_000_000).toFixed(2)} Tỷ
              </span>
              <span className="text-[10px] text-zinc-400">{totalStockDevices.length} máy trong kho</span>
            </div>

            <div>
              <span className="text-zinc-500 block text-[11px]">Tổng số dư két tiền</span>
              <span className="text-base sm:text-lg font-black font-mono text-amber-400 mt-0.5 block">
                {(totalFundBalance / 1_000_000).toFixed(1)} Tr
              </span>
            </div>

            <div>
              <span className="text-zinc-500 block text-[11px]">Tồn kho &gt; 30 ngày</span>
              <span className={`text-base sm:text-lg font-black font-mono mt-0.5 block ${agingDevices.length > 0 ? 'text-rose-400' : 'text-zinc-300'}`}>
                {agingDevices.length} máy
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Action Stream & Priority Feed (Bảng luồng công việc tinh gọn) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-[#ff4b16]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
              Công Việc Cần Xử Lý Nhanh (Zero Missed Deals)
            </h3>
          </div>
          <span className="text-xs text-zinc-400 font-mono">
            {myAppointments.length + agingDevices.length + myLeadsToCall.length} việc
          </span>
        </div>

        {/* Seamless Stream Items (Row-based list with subtle dividers) */}
        <div className="divide-y divide-zinc-100 bg-white rounded-3xl border border-zinc-100 shadow-xs overflow-hidden">
          {/* Item 1: Lịch hẹn Showroom */}
          <div className="p-4 hover:bg-zinc-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-zinc-900">Lịch Hẹn Showroom</span>
                  <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 rounded bg-purple-100 text-purple-700">
                    {myAppointments.length} khách
                  </span>
                </div>
                <p className="text-xs text-zinc-500 truncate mt-0.5">
                  {myAppointments[0] ? `${myAppointments[0].name} - Hẹn xem ${myAppointments[0].interestedModel || 'iPhone'}` : 'Hiện không có lịch hẹn mới'}
                </p>
              </div>
            </div>

            <button
              onClick={() => onNavigateTab('crm')}
              className="px-3.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs flex items-center space-x-1 transition-all shrink-0 cursor-pointer self-start sm:self-auto"
            >
              <span>Xem lịch</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Item 2: Cảnh báo tồn kho cần xả */}
          <div className="p-4 hover:bg-zinc-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-zinc-900">Máy Tồn Kho Trên 30 Ngày</span>
                  <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 rounded bg-amber-100 text-amber-700">
                    {agingDevices.length} cây
                  </span>
                </div>
                <p className="text-xs text-zinc-500 truncate mt-0.5">
                  {agingDevices[0] ? `${agingDevices[0].model} • IMEI: ...${agingDevices[0].imei.slice(-4)} cần thanh lý` : 'Tất cả hàng hóa xoay vòng tốt'}
                </p>
              </div>
            </div>

            <button
              onClick={() => onNavigateTab('inventory')}
              className="px-3.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs flex items-center space-x-1 transition-all shrink-0 cursor-pointer self-start sm:self-auto"
            >
              <span>Đề xuất xả kho</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Item 3: Leads đang chờ tư vấn */}
          <div className="p-4 hover:bg-zinc-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-zinc-900">Khách Hàng Đang Tư Vấn</span>
                  <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 rounded bg-blue-100 text-blue-700">
                    {myLeadsToCall.length} leads
                  </span>
                </div>
                <p className="text-xs text-zinc-500 truncate mt-0.5">
                  {myLeadsToCall[0] ? `${myLeadsToCall[0].name} quan tâm ${myLeadsToCall[0].interestedModel || 'iPhone'}` : 'Đã phản hồi hết khách'}
                </p>
              </div>
            </div>

            <button
              onClick={() => onNavigateTab('crm')}
              className="px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center space-x-1 transition-all shrink-0 cursor-pointer self-start sm:self-auto"
            >
              <span>Mở CRM</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Retail Hourly Waveform Sparkline (Nhịp sóng âm giờ cao điểm) */}
      <div className="p-4 bg-white rounded-3xl border border-zinc-100 shadow-xs space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-zinc-700">
          <div className="flex items-center space-x-1.5">
            <Activity className="w-3.5 h-3.5 text-[#ff4b16]" />
            <span>Xung Nhịp Khách Hàng Trong Ngày (8h - 22h)</span>
          </div>
          <span className="text-[10px] font-mono text-orange-600 font-bold">Giờ vàng: 18h - 21h tối</span>
        </div>

        <div className="h-10 flex items-end justify-between gap-1.5 px-2">
          {hourlyData.map((item, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
              <div className="w-full bg-zinc-100 rounded-t-md h-8 flex items-end overflow-hidden">
                <div
                  style={{ height: item.height }}
                  className={`w-full rounded-t-md transition-all ${
                    item.isPeak ? 'bg-gradient-to-t from-orange-500 to-[#ff4b16]' : 'bg-zinc-300'
                  }`}
                />
              </div>
              <span className="text-[8px] font-mono text-zinc-400">{item.hour}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Minimalist Floating Bottom Thumb-Dock */}
      <div className="fixed bottom-3 inset-x-0 z-40 px-3 flex justify-center pointer-events-none">
        <div className="pointer-events-auto bg-zinc-950/90 backdrop-blur-xl border border-zinc-800/80 p-1.5 rounded-full shadow-2xl flex items-center gap-2 text-white">
          <button
            onClick={() => onNavigateTab('crm')}
            className="px-3.5 py-2 rounded-full hover:bg-zinc-800 text-zinc-300 hover:text-white font-bold text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Thêm Lead</span>
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
