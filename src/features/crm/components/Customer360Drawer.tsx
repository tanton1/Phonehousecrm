import React, { useState } from 'react';
import { Lead, SalesInvoice, WarrantyTicket } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { 
  User, 
  Phone, 
  Award, 
  ShoppingBag, 
  Wrench, 
  Clock, 
  DollarSign, 
  MessageSquare, 
  X, 
  Plus, 
  CheckCircle2 
} from 'lucide-react';

export interface Customer360DrawerProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  invoices: SalesInvoice[];
  warrantyTickets: WarrantyTicket[];
  onAddTimelineNote?: (leadId: string, note: string) => Promise<void> | void;
}

export const Customer360Drawer: React.FC<Customer360DrawerProps> = ({
  lead,
  isOpen,
  onClose,
  invoices,
  warrantyTickets,
  onAddTimelineNote
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'ORDERS' | 'WARRANTY' | 'TIMELINE'>('OVERVIEW');
  const [noteInput, setNoteInput] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  if (!isOpen || !lead) return null;

  // Filter invoices for this customer by phone
  const customerInvoices = invoices.filter(
    inv => inv.customerPhone === lead.phone || (inv.phone && inv.phone === lead.phone)
  );

  // Filter warranty tickets
  const customerWarranties = warrantyTickets.filter(
    w => w.phone === lead.phone
  );

  // Calculate LTV
  const totalLtv = customerInvoices
    .filter(inv => inv.status !== 'cancelled')
    .reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);

  // VIP Tier calculation based on LTV
  const getVipTier = (ltv: number) => {
    if (ltv >= 100_000_000) return { name: 'KIM CƯƠNG (DIAMOND)', badge: 'bg-purple-100 text-purple-700 border-purple-200' };
    if (ltv >= 50_000_000) return { name: 'VÀNG (GOLD)', badge: 'bg-amber-100 text-amber-800 border-amber-200' };
    if (ltv >= 20_000_000) return { name: 'BẠC (SILVER)', badge: 'bg-blue-100 text-blue-700 border-blue-200' };
    return { name: 'THÀNH VIÊN (STANDARD)', badge: 'bg-zinc-100 text-zinc-700 border-zinc-200' };
  };

  const vipInfo = getVipTier(totalLtv);

  const handleSaveNote = async () => {
    if (!noteInput.trim() || !onAddTimelineNote) return;
    setIsSubmittingNote(true);
    try {
      await onAddTimelineNote(lead.id, noteInput.trim());
      setNoteInput('');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg h-full flex flex-col shadow-2xl border-l border-zinc-200 animate-in slide-in-from-right duration-300">
        {/* 1. Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-orange-100 text-[#ff4b16] flex items-center justify-center font-bold text-base">
              {lead.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-black text-zinc-900 leading-snug">{lead.name}</h3>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${vipInfo.badge}`}>
                  {vipInfo.name}
                </span>
              </div>
              <p className="text-xs text-zinc-500 font-mono flex items-center space-x-1 mt-0.5">
                <Phone className="w-3 h-3 text-zinc-400" />
                <span>{lead.phone}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. KPI Metrics Bar */}
        <div className="p-4 bg-zinc-50/80 border-b border-zinc-100 grid grid-cols-3 gap-2 text-xs">
          <div className="p-2.5 bg-white border border-zinc-200/80 rounded-xl">
            <span className="text-[10px] text-zinc-400 block font-semibold">Tổng Chi Tiêu (LTV)</span>
            <span className="font-bold font-mono text-[#ff4b16] text-sm mt-0.5 block">
              {(totalLtv / 1_000_000).toFixed(1)}tr
            </span>
          </div>

          <div className="p-2.5 bg-white border border-zinc-200/80 rounded-xl">
            <span className="text-[10px] text-zinc-400 block font-semibold">Số Đơn Mua</span>
            <span className="font-bold font-mono text-zinc-800 text-sm mt-0.5 block">
              {customerInvoices.length} đơn
            </span>
          </div>

          <div className="p-2.5 bg-white border border-zinc-200/80 rounded-xl">
            <span className="text-[10px] text-zinc-400 block font-semibold">Lần Bảo Hành</span>
            <span className="font-bold font-mono text-zinc-800 text-sm mt-0.5 block">
              {customerWarranties.length} lần
            </span>
          </div>
        </div>

        {/* 3. Navigation Tabs */}
        <div className="flex items-center space-x-1 px-4 border-b border-zinc-100 text-xs font-bold bg-white">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`py-3 px-3 border-b-2 transition-all cursor-pointer ${
              activeTab === 'OVERVIEW'
                ? 'border-[#ff4b16] text-[#ff4b16]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Nhu Cầu & Lead
          </button>

          <button
            onClick={() => setActiveTab('ORDERS')}
            className={`py-3 px-3 border-b-2 transition-all cursor-pointer ${
              activeTab === 'ORDERS'
                ? 'border-[#ff4b16] text-[#ff4b16]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Đơn Hàng ({customerInvoices.length})
          </button>

          <button
            onClick={() => setActiveTab('WARRANTY')}
            className={`py-3 px-3 border-b-2 transition-all cursor-pointer ${
              activeTab === 'WARRANTY'
                ? 'border-[#ff4b16] text-[#ff4b16]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Sửa Chữa ({customerWarranties.length})
          </button>

          <button
            onClick={() => setActiveTab('TIMELINE')}
            className={`py-3 px-3 border-b-2 transition-all cursor-pointer ${
              activeTab === 'TIMELINE'
                ? 'border-[#ff4b16] text-[#ff4b16]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Nhật Ký Chăm Sóc
          </button>
        </div>

        {/* 4. Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-3">
              <div className="p-4 bg-zinc-50 border border-zinc-200/80 rounded-2xl space-y-2.5">
                <h4 className="font-bold text-zinc-900">Thông Tin Nhu Cầu Mua Hàng</h4>
                <div className="grid grid-cols-2 gap-2 text-zinc-600">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Dòng máy quan tâm:</span>
                    <span className="font-bold text-zinc-800">{lead.interestedModel || 'Chưa chọn máy'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Ngân sách dự kiến:</span>
                    <span className="font-bold font-mono text-[#ff4b16]">
                      {lead.budget ? `${(lead.budget / 1_000_000).toFixed(1)} triệu` : 'Linh hoạt'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Nguồn tiếp nhận:</span>
                    <span className="font-bold text-zinc-800">{lead.source}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Nhân viên chăm sóc:</span>
                    <span className="font-bold text-zinc-800">{lead.assignedStaff || 'Chưa gán'}</span>
                  </div>
                </div>

                {lead.notes && (
                  <div className="pt-2 border-t border-zinc-200/60">
                    <span className="text-[10px] text-zinc-400 block">Ghi chú tư vấn:</span>
                    <p className="text-zinc-700 mt-0.5 leading-relaxed">{lead.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ORDERS */}
          {activeTab === 'ORDERS' && (
            <div className="space-y-2.5">
              {customerInvoices.length === 0 ? (
                <div className="p-8 text-center text-zinc-400">
                  Khách hàng chưa phát sinh hóa đơn mua hàng.
                </div>
              ) : (
                customerInvoices.map(inv => (
                  <div
                    key={inv.id}
                    className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-zinc-900">{inv.invoiceCode || inv.id}</span>
                      <span className="font-mono font-bold text-[#ff4b16]">
                        {(inv.finalAmount || 0).toLocaleString('vi-VN')}đ
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500 flex items-center justify-between">
                      <span>{inv.createdAt || inv.createdDate || 'N/A'}</span>
                      <span className="font-semibold text-zinc-700">{inv.paymentMethod}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: WARRANTY */}
          {activeTab === 'WARRANTY' && (
            <div className="space-y-2.5">
              {customerWarranties.length === 0 ? (
                <div className="p-8 text-center text-zinc-400">
                  Không có phiếu bảo hành hoặc sửa chữa nào.
                </div>
              ) : (
                customerWarranties.map(w => (
                  <div
                    key={w.id}
                    className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-zinc-900">{w.model} ({w.ticketNumber})</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-[#ff4b16]">
                        {w.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-600">{w.faultDescription}</p>
                    <span className="text-[10px] text-zinc-400 font-mono block">{w.receivedDate}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: TIMELINE */}
          {activeTab === 'TIMELINE' && (
            <div className="space-y-3">
              {/* Add Note Input */}
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Thêm ghi chú chăm sóc (e.g. Đã gọi hẹn chiều qua)..."
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  className="flex-1 h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-[#ff4b16]"
                />
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={isSubmittingNote}
                  onClick={handleSaveNote}
                >
                  Lưu
                </Button>
              </div>

              {/* Timeline list */}
              <div className="space-y-2">
                {(lead as any).timeline && (lead as any).timeline.length > 0 ? (
                  (lead as any).timeline.map((t: any, idx: number) => (
                    <div key={idx} className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-zinc-800">{t.action || 'Chăm sóc khách hàng'}</span>
                        <span className="text-zinc-400 font-mono text-[10px]">{t.timestamp?.slice(0, 16).replace('T', ' ')}</span>
                      </div>
                      <p className="text-zinc-600 text-[11px]">{t.content}</p>
                    </div>
                  ))
                ) : lead.notes ? (
                  <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl text-zinc-700 text-xs">
                    <span className="font-bold block mb-1">Ghi chú hiện tại:</span>
                    {lead.notes}
                  </div>
                ) : (
                  <div className="p-4 text-center text-zinc-400 text-xs">
                    Chưa có nhật ký chăm sóc.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
