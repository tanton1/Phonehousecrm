import React from 'react';
import { SalesInvoice, DeviceItem, Lead, WarrantyTicket, FundAccount, Partner, StoreBranch, StaffMember } from '../../../types';
import { ShoppingCart, Users, Phone, Award, DollarSign, Calendar, Flame, Smartphone, ArrowRight, Plus, Search } from 'lucide-react';

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
  const myInvoices = invoices.filter(inv => !currentUser || inv.cashierId === currentUser.id || inv.cashierName === currentUser.name);
  const myMonthlyInvoices = myInvoices.filter(inv => (inv.createdAt || '').startsWith(currentMonthStr));
  
  const myRevenueMonth = myMonthlyInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
  const myDeviceCountMonth = myMonthlyInvoices.reduce((sum, inv) => sum + (inv.items?.length || 0), 0);
  const myCommissionEstimate = Math.round(myRevenueMonth * 0.012 + myDeviceCountMonth * 50000); // 1.2% + 50k/máy

  const myLeadsToCall = leads.filter(l => l.status === 'new' || l.status === 'contacted' || l.status === 'negotiating');
  const myAppointments = leads.filter(l => l.status === 'appointment_scheduled');
  const inStockDevices = devices.filter(d => d.status === 'in_stock');

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200">
      {/* 1. Greeting & Quick Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 p-4 sm:p-5 rounded-3xl text-white shadow-lg shadow-orange-500/20">
        <div>
          <div className="flex items-center space-x-2 text-orange-100 text-xs font-semibold uppercase tracking-wider">
            <Flame className="w-4 h-4 text-amber-300 animate-pulse" />
            <span>Bàn Làm Việc Chuyên Viên Bán Hàng</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black mt-1">
            Xin chào, {currentUser?.name || 'Chuyên Viên Sales'} 👋
          </h1>
          <p className="text-xs text-orange-100 mt-0.5">
            {currentBranch?.name || 'Chi nhánh PhoneHouse'} • Ca làm việc hôm nay
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigateTab('pos')}
            className="px-4 py-2.5 rounded-2xl bg-white text-[#ff4b16] font-black text-xs shadow-md hover:bg-orange-50 active:scale-95 transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Mở Bán POS (F2)</span>
          </button>
          <button
            onClick={() => onNavigateTab('crm')}
            className="px-3.5 py-2.5 rounded-2xl bg-orange-700/60 hover:bg-orange-700 border border-orange-400/40 text-white font-bold text-xs active:scale-95 transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo Lead</span>
          </button>
        </div>
      </div>

      {/* 2. Personal KPIs Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Doanh Số Tháng 8</span>
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#ff4b16] flex items-center justify-center font-bold">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-black text-zinc-900 mt-2 font-mono">
            {(myRevenueMonth / 1_000_000).toFixed(1)} <span className="text-xs font-bold text-zinc-500">triệu</span>
          </p>
          <span className="text-[10px] font-semibold text-emerald-600 mt-1 block">
            ✓ Đã bán {myDeviceCountMonth} sản phẩm
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Hoa Hồng Tạm Tính</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-black text-emerald-700 mt-2 font-mono">
            {myCommissionEstimate.toLocaleString('vi-VN')} <span className="text-xs font-bold text-zinc-500">đ</span>
          </p>
          <span className="text-[10px] font-semibold text-zinc-400 mt-1 block">
            Theo chính sách doanh số V1
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Khách Cần Chăm Sóc</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-black text-zinc-900 mt-2 font-mono">
            {myLeadsToCall.length} <span className="text-xs font-bold text-zinc-500">leads</span>
          </p>
          <span className="text-[10px] font-semibold text-amber-600 mt-1 block">
            Ưu tiên gọi tư vấn chốt máy
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Lịch Hẹn Ghé Showroom</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-black text-zinc-900 mt-2 font-mono">
            {myAppointments.length} <span className="text-xs font-bold text-zinc-500">khách</span>
          </p>
          <span className="text-[10px] font-semibold text-purple-600 mt-1 block">
            Đã hẹn test máy trực tiếp
          </span>
        </div>
      </div>

      {/* 3. Action Queue & Ready In-Stock Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Leads To Call */}
        <div className="lg:col-span-2 bg-white p-4 sm:p-5 rounded-2xl border border-zinc-200/80 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="flex items-center space-x-2">
              <Phone className="w-4 h-4 text-[#ff4b16]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                Danh Sách Khách Cần Gọi Điện Chăm Sóc ({myLeadsToCall.length})
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('crm')}
              className="text-xs font-bold text-[#ff4b16] hover:underline flex items-center space-x-1 cursor-pointer"
            >
              <span>Xem CRM</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2 max-h-[380px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-200 pr-1">
            {myLeadsToCall.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 text-xs">
                Tuyệt vời! Bạn đã hoàn thành liên hệ tất cả khách hàng tiềm năng.
              </div>
            ) : (
              myLeadsToCall.slice(0, 5).map(lead => (
                <div
                  key={lead.id}
                  onClick={() => onNavigateTab('crm')}
                  className="p-3 bg-zinc-50/70 hover:bg-orange-50/60 border border-zinc-200/80 rounded-xl flex items-center justify-between transition-all cursor-pointer group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-zinc-900 group-hover:text-[#ff4b16] transition-colors">
                        {lead.name}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500 font-semibold">{lead.phone}</span>
                    </div>
                    <p className="text-[11px] text-zinc-600">
                      Quan tâm: <span className="font-semibold text-zinc-800">{lead.interestedModel || 'Chưa rõ'}</span>
                      {lead.budget && ` • Ngân sách: ~${(lead.budget / 1_000_000).toFixed(1)}tr`}
                    </p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateTab('pos');
                    }}
                    className="px-3 py-1.5 bg-white border border-orange-200 text-[#ff4b16] font-bold text-xs rounded-lg shadow-2xs hover:bg-[#ff4b16] hover:text-white transition-colors cursor-pointer"
                  >
                    Bán POS
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ready In-Stock Preview */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-zinc-200/80 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="flex items-center space-x-2">
              <Smartphone className="w-4 h-4 text-[#ff4b16]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                Kho Máy Sẵn Bán ({inStockDevices.length})
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('inventory')}
              className="text-xs font-bold text-[#ff4b16] hover:underline cursor-pointer"
            >
              Tra kho
            </button>
          </div>

          <div className="space-y-2 max-h-[380px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-200 pr-1">
            {inStockDevices.slice(0, 6).map(dev => (
              <div
                key={dev.id}
                onClick={() => onNavigateTab('pos')}
                className="p-2.5 bg-zinc-50 border border-zinc-200/70 rounded-xl flex items-center justify-between hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <div className="min-w-0 pr-2">
                  <h5 className="text-xs font-bold text-zinc-900 truncate">{dev.model}</h5>
                  <p className="text-[10px] text-zinc-500 font-mono truncate">
                    IMEI: ...{dev.imei.slice(-6)} • Pin: {dev.batteryHealth || 100}%
                  </p>
                </div>
                <span className="font-mono font-bold text-xs text-[#ff4b16] shrink-0">
                  {((dev.sellPrice || 0) / 1_000_000).toFixed(1)}tr
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
