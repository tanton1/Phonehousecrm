import React, { useState, useMemo } from 'react';
import { SalesInvoice, DeviceItem, Lead, WarrantyTicket, FundAccount, Partner, StoreBranch, StaffMember } from '../../../types';
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
  Radio, 
  TrendingUp, 
  Clock, 
  ShieldAlert, 
  CheckCircle2, 
  Sparkles, 
  Zap, 
  ExternalLink,
  Wallet,
  Activity,
  ChevronRight,
  ArrowUpRight
} from 'lucide-react';

export interface SalesHomeViewProps {
  invoices: SalesInvoice[];
  devices: DeviceItem[];
  leads: Lead[];
  currentBranch?: StoreBranch;
  currentUser?: StaffMember | null;
  onNavigateTab: (tabId: string) => void;
}

export const SalesHomeView: React.FC<SalesHomeViewProps> = ({
  invoices,
  devices,
  leads,
  currentBranch,
  currentUser,
  onNavigateTab
}) => {
  const currentMonthStr = '2026-08';
  const todayStr = new Date().toISOString().split('T')[0];

  const myInvoices = invoices.filter(inv => !currentUser || inv.cashierId === currentUser.id || inv.cashierName === currentUser.name || inv.creatorName === currentUser.name);
  const myMonthlyInvoices = myInvoices.filter(inv => (inv.createdAt || '').startsWith(currentMonthStr));
  const todayInvoices = invoices.filter(inv => (inv.createdAt || '').startsWith(todayStr));
  
  const todayRevenue = todayInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
  const myRevenueMonth = myMonthlyInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
  const myDeviceCountMonth = myMonthlyInvoices.reduce((sum, inv) => sum + (inv.items?.length || inv.devices?.length || 1), 0);
  const myCommissionEstimate = Math.round(myRevenueMonth * 0.012 + myDeviceCountMonth * 50000); // 1.2% + 50k/máy

  // KPI Target: 250,000,000đ per month target
  const monthlyTarget = 250000000;
  const progressPercent = Math.min(100, Math.round((myRevenueMonth / monthlyTarget) * 100));
  const daysLeftInMonth = 12;

  const myLeadsToCall = leads.filter(l => l.status === 'new' || l.status === 'contacted' || l.status === 'negotiating');
  const myAppointments = leads.filter(l => l.status === 'appointment_scheduled');
  const inStockDevices = devices.filter(d => d.status === 'in_stock');
  
  // Aging inventory (> 30 days)
  const agingDevices = inStockDevices.filter(d => {
    if (!d.receivedDate) return false;
    const diffDays = Math.floor((Date.now() - new Date(d.receivedDate).getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 30;
  });

  // Hourly retail waveform pattern (8h -> 22h)
  const hourlyData = [
    { hour: '08h', sales: 0, height: '15%' },
    { hour: '10h', sales: 1, height: '40%' },
    { hour: '12h', sales: 2, height: '65%' },
    { hour: '14h', sales: 1, height: '35%' },
    { hour: '16h', sales: 3, height: '80%' },
    { hour: '18h', sales: 4, height: '95%', isPeak: true },
    { hour: '20h', sales: 5, height: '100%', isPeak: true },
    { hour: '22h', sales: 1, height: '30%' }
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
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-400">BÀN LÀM VIỆC SALES</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-[#ff4b16]">
                {currentBranch?.name || 'Showroom PhoneHouse'}
              </span>
            </div>
            <h2 className="text-sm font-bold text-zinc-800">
              Xin chào, <span className="text-zinc-900">{currentUser?.name || 'Chuyên Viên Sales'}</span>
            </h2>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onNavigateTab('pos')}
            className="px-4 py-2 rounded-2xl bg-gradient-to-r from-orange-500 to-[#ff4b16] text-white font-bold text-xs shadow-md shadow-orange-500/25 hover:brightness-105 active:scale-95 transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Mở Bán POS (F2)</span>
          </button>
        </div>
      </div>

      {/* 2. Unified Fluent Financial Stage */}
      <div className="bg-gradient-to-b from-zinc-950 via-zinc-900 to-black text-white rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-1/4 w-80 h-80 bg-orange-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-zinc-400">
                Doanh Số Cá Nhân Tháng {new Date().getMonth() + 1}
              </span>
              <div className="mt-1 flex items-baseline space-x-3">
                <span className="text-3xl sm:text-5xl font-black font-mono tracking-tight text-white">
                  {myRevenueMonth.toLocaleString('vi-VN')} <span className="text-lg sm:text-2xl text-[#ff4b16] font-sans">đ</span>
                </span>
                <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center space-x-0.5">
                  <ArrowUpRight className="w-3 h-3" />
                  <span>{myDeviceCountMonth} máy</span>
                </span>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-[11px] font-mono text-zinc-400 block">Doanh số ca hôm nay</span>
              <span className="text-lg sm:text-xl font-bold font-mono text-[#ff4b16]">
                +{todayRevenue.toLocaleString('vi-VN')} đ
              </span>
            </div>
          </div>

          {/* Progress Line */}
          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-zinc-400">Tiến độ Mốc Vàng (250 Triệu VNĐ)</span>
              <span className="text-white font-bold">{progressPercent}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                style={{ width: `${progressPercent}%` }}
                className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-[#ff4b16] transition-all duration-700 shadow-sm shadow-orange-500/50"
              />
            </div>
          </div>

          {/* Statistics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-zinc-800/80 text-xs">
            <div>
              <span className="text-zinc-500 block text-[11px]">Hoa hồng tạm tính</span>
              <span className="text-base sm:text-lg font-black font-mono text-emerald-400 mt-0.5 block">
                +{myCommissionEstimate.toLocaleString('vi-VN')} đ
              </span>
            </div>

            <div>
              <span className="text-zinc-500 block text-[11px]">Máy sẵn bán tại quầy</span>
              <span className="text-base sm:text-lg font-black font-mono text-white mt-0.5 block">
                {inStockDevices.length} máy
              </span>
            </div>

            <div>
              <span className="text-zinc-500 block text-[11px]">Lịch hẹn khách</span>
              <span className="text-base sm:text-lg font-black font-mono text-purple-400 mt-0.5 block">
                {myAppointments.length} khách
              </span>
            </div>

            <div>
              <span className="text-zinc-500 block text-[11px]">Leads cần chăm sóc</span>
              <span className="text-base sm:text-lg font-black font-mono text-blue-400 mt-0.5 block">
                {myLeadsToCall.length} leads
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Action Stream */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-[#ff4b16]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
              Khách Hàng & Việc Cần Chăm Sóc Hôm Nay
            </h3>
          </div>
          <span className="text-xs text-zinc-400 font-mono">
            {myAppointments.length + myLeadsToCall.length + agingDevices.length} việc
          </span>
        </div>

        <div className="divide-y divide-zinc-100 bg-white rounded-3xl border border-zinc-100 shadow-xs overflow-hidden">
          {/* Item 1: Lịch hẹn Showroom */}
          <div className="p-4 hover:bg-zinc-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-zinc-900">Lịch Hẹn Xem Máy</span>
                  <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 rounded bg-purple-100 text-purple-700">
                    {myAppointments.length} khách
                  </span>
                </div>
                <p className="text-xs text-zinc-500 truncate mt-0.5">
                  {myAppointments[0] ? `${myAppointments[0].name} - Hẹn xem ${myAppointments[0].interestedModel || 'iPhone'}` : 'Chưa có lịch hẹn mới'}
                </p>
              </div>
            </div>

            <button
              onClick={() => onNavigateTab('crm')}
              className="px-3.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs flex items-center space-x-1 transition-all shrink-0 cursor-pointer self-start sm:self-auto"
            >
              <Phone className="w-3 h-3" />
              <span>Liên hệ</span>
            </button>
          </div>

          {/* Item 2: Leads cần gọi */}
          <div className="p-4 hover:bg-zinc-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-zinc-900">Leads Cần Tư Vấn</span>
                  <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 rounded bg-blue-100 text-blue-700">
                    {myLeadsToCall.length} leads
                  </span>
                </div>
                <p className="text-xs text-zinc-500 truncate mt-0.5">
                  {myLeadsToCall[0] ? `${myLeadsToCall[0].name} • Quan tâm: ${myLeadsToCall[0].interestedModel || 'iPhone'}` : 'Đã phản hồi hết khách'}
                </p>
              </div>
            </div>

            <button
              onClick={() => onNavigateTab('crm')}
              className="px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center space-x-1 transition-all shrink-0 cursor-pointer self-start sm:self-auto"
            >
              <span>Xem danh sách</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Minimalist Floating Bottom Thumb-Dock */}
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
