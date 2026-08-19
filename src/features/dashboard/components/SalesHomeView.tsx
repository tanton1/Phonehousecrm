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
  Activity
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
  const remainingRevenue = Math.max(0, monthlyTarget - myRevenueMonth);
  const dailyRequiredUnits = Math.ceil(remainingRevenue / (daysLeftInMonth * 22000000)); // ~22tr/iPhone avg

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
    <div className="relative space-y-4 sm:space-y-6 pb-24 animate-in fade-in duration-200">
      {/* 1. Dynamic Live Pulse Notch (Đảo Trạng Thái Nhịp Tim Showroom) */}
      <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-black text-white p-3 sm:p-3.5 rounded-3xl border border-zinc-800/80 shadow-xl flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center space-x-2.5">
          <div className="relative flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping absolute" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 relative" />
          </div>
          <div className="flex items-center space-x-1.5 text-xs font-bold font-mono tracking-tight">
            <span className="text-emerald-400">LIVE SHOWROOM:</span>
            <span className="text-zinc-200">{currentBranch?.name || 'Chi Nhánh PhoneHouse'}</span>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="px-2.5 py-1 rounded-xl bg-zinc-800/90 border border-zinc-700/60 flex items-center space-x-1.5">
            <Flame className="w-3.5 h-3.5 text-[#ff4b16] animate-pulse" />
            <span className="text-zinc-400">Doanh thu ca:</span>
            <span className="text-white font-bold">{todayRevenue.toLocaleString('vi-VN')} đ</span>
          </div>

          <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-orange-950/40 border border-orange-500/30 text-orange-300">
            <Radio className="w-3.5 h-3.5 text-[#ff4b16]" />
            <span>Két: Sẵn Sàng</span>
          </div>
        </div>
      </div>

      {/* 2. Hero Gradient Greeting & Fast Sales Action */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#ff4b16] via-orange-600 to-amber-700 p-5 sm:p-6 text-white shadow-xl shadow-orange-500/20 border border-orange-400/30">
        {/* Glow ambient background elements */}
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-amber-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-orange-900/40 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-black/25 backdrop-blur-md border border-white/20 text-[11px] font-bold tracking-wider uppercase text-amber-200">
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>Chuyên Viên Bán Hàng Xuất Sắc</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Xin chào, {currentUser?.name || 'Chuyên Viên Sales'} 👋
            </h1>
            <p className="text-xs sm:text-sm text-orange-100/90 font-medium">
              Hôm nay showroom đã tiếp đón <b className="text-white">{todayInvoices.length}</b> lượt khách mua sắm. Chúc bạn một ngày bùng nổ doanh số!
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
            <button
              onClick={() => onNavigateTab('crm')}
              className="px-4 py-3 rounded-2xl bg-black/30 hover:bg-black/40 border border-white/20 text-white font-bold text-xs sm:text-sm active:scale-95 transition-all flex items-center space-x-1.5 cursor-pointer backdrop-blur-md"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Lead</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Radial KPI Target Ring & Commission Speedometer (Khoán Doanh Số & Hoa Hồng) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
        {/* KPI Target Card */}
        <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 text-white p-5 rounded-3xl border border-zinc-800 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tiến Độ Doanh Số Tháng 8</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-500/20 text-[#ff4b16] border border-orange-500/30 font-bold">
              Mốc Vàng
            </span>
          </div>

          <div className="my-4 flex items-center space-x-4">
            {/* Circular Progress Ring */}
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
                {(myRevenueMonth / 1_000_000).toFixed(1)} <span className="text-xs font-bold text-zinc-400">/ 250 Tr</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-tight">
                Cần xuất bán thêm <b className="text-[#ff4b16]">~{dailyRequiredUnits} máy/ngày</b> để cán đích Mốc Vàng 150%.
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
            <span>Đã bán: <b className="text-white font-mono">{myDeviceCountMonth} thiết bị</b></span>
            <span>Còn lại: <b className="text-amber-400 font-mono">{daysLeftInMonth} ngày</b></span>
          </div>
        </div>

        {/* Commission & Income Card */}
        <div className="bg-white p-5 rounded-3xl border border-zinc-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Hoa Hồng Tạm Tính</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Award className="w-4 h-4" />
            </div>
          </div>

          <div className="my-3">
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono tracking-tight">
              {myCommissionEstimate.toLocaleString('vi-VN')} <span className="text-xs font-bold text-zinc-500">đ</span>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Định mức: 1.2% doanh thu + 50.000đ/máy iPhone
            </p>
          </div>

          <div className="p-2.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/60 flex items-center justify-between text-xs text-emerald-900 font-medium">
            <span>Thưởng vượt KPI dự kiến:</span>
            <span className="font-bold font-mono text-emerald-700">+2.000.000 đ</span>
          </div>
        </div>

        {/* Hourly Sales Pulse Waveform */}
        <div className="bg-white p-5 rounded-3xl border border-zinc-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <Activity className="w-4 h-4 text-[#ff4b16]" />
              <span className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Xung Nhịp Bán Lẻ Trong Ngày</span>
            </div>
            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md">
              Peak: 18h-21h
            </span>
          </div>

          {/* Bar sparkline visual */}
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
            Khung giờ vàng tối showroom đón lượng khách chốt đơn cao nhất.
          </p>
        </div>
      </div>

      {/* 4. Smart Action Feed ("Zero Missed Deals" - Danh Sách Cần Xử Lý Ngay) */}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Card 1: Khách hẹn hôm nay */}
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
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => onNavigateTab('crm')}
                className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-1 cursor-pointer"
              >
                <Phone className="w-3 h-3" />
                <span>Liên hệ ngay</span>
              </button>
            </div>
          </div>

          {/* Card 2: Máy tồn kho cần xả */}
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
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => onNavigateTab('inventory')}
                className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-1 cursor-pointer"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Đề xuất xả kho</span>
              </button>
            </div>
          </div>

          {/* Card 3: Khách nóng cần chốt */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50/70 to-cyan-50/40 border border-blue-200/80 space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md flex items-center space-x-1">
                <Users className="w-3 h-3" />
                <span>Leads Cần Gọi Chăm Sóc</span>
              </span>
              <span className="text-xs font-mono font-bold text-blue-900">{myLeadsToCall.length} leads</span>
            </div>
            <p className="text-xs font-bold text-zinc-900 line-clamp-1">
              {myLeadsToCall[0] ? `${myLeadsToCall[0].name} • Quan tâm: ${myLeadsToCall[0].interestedModel || 'iPhone'}` : 'Đã chăm sóc hết danh sách'}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => onNavigateTab('crm')}
                className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-1 cursor-pointer"
              >
                <span>Xem danh sách</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Ready In-Stock Preview Table */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-zinc-200/80 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div className="flex items-center space-x-2">
            <Smartphone className="w-4 h-4 text-[#ff4b16]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
              Kho Máy Sẵn Bán Nhanh Tại Quầy ({inStockDevices.length})
            </h3>
          </div>
          <button
            onClick={() => onNavigateTab('inventory')}
            className="text-xs font-bold text-[#ff4b16] hover:underline flex items-center space-x-1 cursor-pointer"
          >
            <span>Toàn bộ kho</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {inStockDevices.slice(0, 6).map(dev => (
            <div
              key={dev.id}
              onClick={() => onNavigateTab('pos')}
              className="p-3 bg-zinc-50/70 hover:bg-orange-50/60 border border-zinc-200/80 rounded-2xl flex items-center justify-between transition-all cursor-pointer group"
            >
              <div className="min-w-0 pr-2">
                <h5 className="text-xs font-bold text-zinc-900 truncate group-hover:text-[#ff4b16] transition-colors">
                  {dev.model}
                </h5>
                <p className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
                  IMEI: ...{dev.imei.slice(-6)} • Pin {dev.batteryHealth || 100}% • {dev.color || 'Titan'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono font-black text-xs text-[#ff4b16]">
                  {((dev.sellPrice || 0) / 1_000_000).toFixed(1)} Tr
                </span>
                <span className="block text-[9px] font-bold text-emerald-600">Sẵn giao</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Floating Bottom Thumb-Dock (Thanh Thao Tác Nổi 1 Chạm) */}
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
