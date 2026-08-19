import React from 'react';
import { WarrantyTicket, DeviceItem, StoreBranch, StaffMember } from '../../../types';
import { Wrench, Clock, CheckCircle2, Award, AlertTriangle, Smartphone, Cpu, ArrowRight, Plus } from 'lucide-react';

export interface TechHomeViewProps {
  warrantyTickets: WarrantyTicket[];
  devices: DeviceItem[];
  currentBranch?: StoreBranch;
  currentUser?: StaffMember | null;
  onNavigateTab: (tabId: string) => void;
}

export const TechHomeView: React.FC<TechHomeViewProps> = ({
  warrantyTickets,
  devices,
  currentBranch,
  currentUser,
  onNavigateTab
}) => {
  const myTickets = warrantyTickets.filter(t => 
    !currentUser || t.technician === currentUser.name || t.technician === currentUser.id
  );

  const pendingTickets = myTickets.filter(t => t.status === 'received' || t.status === 'inspecting' || t.status === 'repairing');
  const waitingPartsTickets = myTickets.filter(t => t.status === 'waiting_parts');
  const readyTickets = myTickets.filter(t => t.status === 'ready');
  const completedTickets = myTickets.filter(t => t.status === 'delivered');

  // Estimate Tech Commission: 15% labor cost per repaired ticket
  const completedRevenue = completedTickets.reduce((sum, t) => sum + (t.estimatedCost || t.repairCost || 0), 0);
  const techWalletCommission = Math.round(completedRevenue * 0.15);

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200">
      {/* 1. Tech Greeting & Quick Intake Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-zinc-800 via-zinc-900 to-zinc-950 p-4 sm:p-5 rounded-3xl text-white shadow-lg shadow-zinc-900/30 border border-zinc-700">
        <div>
          <div className="flex items-center space-x-2 text-orange-400 text-xs font-semibold uppercase tracking-wider">
            <Wrench className="w-4 h-4 text-[#ff4b16] animate-pulse" />
            <span>Bàn Làm Việc Kỹ Thuật Viên Sửa Chữa</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black mt-1">
            Kỹ thuật viên: {currentUser?.name || 'Kỹ thuật viên'} 🛠️
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            {currentBranch?.name || 'Chi nhánh PhoneHouse'} • Ca trực kỹ thuật
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigateTab('warranty')}
            className="px-4 py-2.5 rounded-2xl bg-[#ff4b16] hover:bg-[#e03e0e] text-white font-bold text-xs shadow-md active:scale-95 transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tiếp Nhận Máy Mới</span>
          </button>
          <button
            onClick={() => onNavigateTab('tech-workspace')}
            className="px-3.5 py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-200 font-bold text-xs active:scale-95 transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <Cpu className="w-4 h-4" />
            <span>Bàn Thợ Chi Tiết</span>
          </button>
        </div>
      </div>

      {/* 2. Tech KPIs Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Máy Đang Xử Lý</span>
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#ff4b16] flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-black text-zinc-900 mt-2 font-mono">
            {pendingTickets.length} <span className="text-xs font-bold text-zinc-500">máy</span>
          </p>
          <span className="text-[10px] font-semibold text-amber-600 mt-1 block">
            Cần hoàn thành theo SLA
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Chờ Linh Kiện</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-black text-zinc-900 mt-2 font-mono">
            {waitingPartsTickets.length} <span className="text-xs font-bold text-zinc-500">máy</span>
          </p>
          <span className="text-[10px] font-semibold text-zinc-400 mt-1 block">
            Đang yêu cầu kho cấp
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Sửa Xong Chờ Giao</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-black text-zinc-900 mt-2 font-mono">
            {readyTickets.length} <span className="text-xs font-bold text-zinc-500">máy</span>
          </p>
          <span className="text-[10px] font-semibold text-emerald-600 mt-1 block">
            Đã KCS đạt chuẩn
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Ví Hoa Hồng Thợ</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-black text-purple-700 mt-2 font-mono">
            {techWalletCommission.toLocaleString('vi-VN')} <span className="text-xs font-bold text-zinc-500">đ</span>
          </p>
          <span className="text-[10px] font-semibold text-zinc-400 mt-1 block">
            Hoa hồng công thợ tháng này
          </span>
        </div>
      </div>

      {/* 3. Tech Action Queue: Urgent Repair Tickets */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-zinc-200/80 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div className="flex items-center space-x-2">
            <Wrench className="w-4 h-4 text-[#ff4b16]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
              Hàng Đợi Máy Cần Xử Lý Ngay ({pendingTickets.length})
            </h3>
          </div>
          <button
            onClick={() => onNavigateTab('warranty')}
            className="text-xs font-bold text-[#ff4b16] hover:underline flex items-center space-x-1 cursor-pointer"
          >
            <span>Mở Kanban Sửa Chữa</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-2.5">
          {pendingTickets.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-xs">
              Tuyệt vời! Không có máy nào bị tồn đọng chưa sửa.
            </div>
          ) : (
            pendingTickets.map(ticket => (
              <div
                key={ticket.id}
                onClick={() => onNavigateTab('warranty')}
                className="p-3 bg-zinc-50/70 hover:bg-orange-50/60 border border-zinc-200/80 rounded-xl flex items-center justify-between transition-all cursor-pointer group"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-xs text-[#ff4b16]">{ticket.ticketNumber}</span>
                    <h5 className="text-xs font-bold text-zinc-900 group-hover:text-[#ff4b16] transition-colors">
                      {ticket.model}
                    </h5>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-orange-100 text-[#ff4b16]">
                      {ticket.issueType}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Khách: <strong className="text-zinc-700">{ticket.customerName}</strong> ({ticket.phone}) • Lỗi: {ticket.faultDescription || ticket.issueDescription || 'Chưa có mô tả'}
                  </p>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateTab('warranty');
                  }}
                  className="px-3 py-1.5 bg-white border border-zinc-300 text-zinc-800 hover:border-orange-300 hover:text-[#ff4b16] font-bold text-xs rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  Xử lý ➔
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
