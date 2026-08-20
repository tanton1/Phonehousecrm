import React, { useState, useMemo } from 'react';
import { Lead, SalesInvoice, WarrantyTicket } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { normalizeVietnamPhone, formatDisplayPhone } from '../../../utils/phoneUtils';
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
  CheckCircle2,
  Smartphone,
  Sparkles,
  RefreshCw,
  Send,
  ShieldCheck,
  Calendar
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
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'DEVICES' | 'ORDERS' | 'WARRANTY' | 'TIMELINE'>('OVERVIEW');
  const [noteInput, setNoteInput] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  // Normalized phone
  const normalizedPhone = useMemo(() => {
    return normalizeVietnamPhone(lead?.phone || lead?.phoneNormalized);
  }, [lead]);

  // Filter invoices for this customer by normalized phone
  const customerInvoices = useMemo(() => {
    if (!normalizedPhone) return [];
    return invoices.filter(inv => {
      const invPhone = normalizeVietnamPhone(inv.customerPhone || (inv as any).phone);
      return invPhone === normalizedPhone;
    });
  }, [invoices, normalizedPhone]);

  // Filter warranty tickets by normalized phone
  const customerWarranties = useMemo(() => {
    if (!normalizedPhone) return [];
    return warrantyTickets.filter(w => {
      const wPhone = normalizeVietnamPhone(w.phone);
      return wPhone === normalizedPhone;
    });
  }, [warrantyTickets, normalizedPhone]);

  // Extract owned devices from paid/completed invoices
  const ownedDevices = useMemo(() => {
    const list: Array<{
      id: string;
      model: string;
      imeiMasked: string;
      color?: string;
      storage?: string;
      batteryHealth?: number;
      purchaseDate: string;
      warrantyExpiry: string;
      invoiceCode: string;
      price: number;
    }> = [];

    customerInvoices.forEach(inv => {
      if (inv.status === 'cancelled') return;
      if (inv.items && inv.items.length > 0) {
        inv.items.forEach((item, idx) => {
          const imei = item.imei || '';
          const imeiMasked = imei.length >= 4 ? `••••••••${imei.slice(-4)}` : 'Chưa kích hoạt IMEI';
          const pDate = inv.createdAt || inv.createdDate || '2025-01-01';
          
          // Calculate warranty end (12 months from purchase)
          const pDateObj = new Date(pDate);
          pDateObj.setFullYear(pDateObj.getFullYear() + 1);
          const warrantyExpiry = pDateObj.toISOString().split('T')[0];

          list.push({
            id: `${inv.id}-${idx}`,
            model: item.productName || item.model || 'iPhone',
            imeiMasked,
            color: (item as any).color,
            storage: (item as any).storage,
            batteryHealth: (item as any).batteryHealth || 100,
            purchaseDate: pDate.slice(0, 10),
            warrantyExpiry,
            invoiceCode: inv.invoiceCode || inv.id,
            price: item.price || 0
          });
        });
      }
    });

    return list;
  }, [customerInvoices]);

  // Calculate LTV
  const totalLtv = useMemo(() => {
    return customerInvoices
      .filter(inv => inv.status !== 'cancelled')
      .reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
  }, [customerInvoices]);

  // VIP Tier calculation based on LTV
  const getVipTier = (ltv: number) => {
    if (ltv >= 100_000_000) return { name: 'KIM CƯƠNG (DIAMOND)', badge: 'bg-purple-100 text-purple-700 border-purple-200' };
    if (ltv >= 50_000_000) return { name: 'VÀNG (GOLD)', badge: 'bg-amber-100 text-amber-800 border-amber-200' };
    if (ltv >= 20_000_000) return { name: 'BẠC (SILVER)', badge: 'bg-blue-100 text-blue-700 border-blue-200' };
    return { name: 'THÀNH VIÊN (STANDARD)', badge: 'bg-zinc-100 text-zinc-700 border-zinc-200' };
  };

  const vipInfo = getVipTier(totalLtv);

  // Next Best Action Engine
  const nextBestAction = useMemo(() => {
    if (ownedDevices.length > 0) {
      const primaryDevice = ownedDevices[0];
      const purchaseTime = new Date(primaryDevice.purchaseDate).getTime();
      const monthsUsed = Math.floor((Date.now() - purchaseTime) / (1000 * 60 * 60 * 24 * 30));

      if (monthsUsed >= 12) {
        return {
          title: `Gợi ý lên đời dòng mới (Đã dùng ${primaryDevice.model} ~${monthsUsed} tháng)`,
          desc: `Khách đã sử dụng thiết bị được hơn 1 năm. Gợi ý chương trình Thu Cũ Đổi Mới trợ giá đến 2.000.000đ khi lên đời iPhone thế hệ mới nhất.`,
          actionType: 'TRADE_IN',
          actionText: 'Gửi Báo Giá Thu Cũ'
        };
      }

      return {
        title: `Chăm sóc sau bán & Bảo hành VIP`,
        desc: `Thiết bị ${primaryDevice.model} còn hạn bảo hành đến ${primaryDevice.warrantyExpiry}. Gợi ý kiểm tra pin định kỳ & vệ sinh máy miễn phí.`,
        actionType: 'WARRANTY_CARE',
        actionText: 'Gửi Lời Nhắc Chăm Sóc'
      };
    }

    if (lead?.budget && lead.budget > 25_000_000) {
      return {
        title: `Tư vấn chốt suất giữ máy Pro Max`,
        desc: `Khách hàng có ngân sách lớn (${(lead.budget / 1_000_000).toFixed(1)}tr) quan tâm ${lead.interestedModel}. Gửi báo giá kèm voucher phụ kiện 500k.`,
        actionType: 'HOT_DEAL',
        actionText: 'Tạo Báo Giá Ưu Đãi'
      };
    }

    return {
      title: `Gửi thông tin chương trình trả góp 0%`,
      desc: `Tư vấn gói duyệt hồ sơ trả góp online duyệt nhanh qua CCCD không cần trả trước.`,
      actionType: 'INSTALLMENT',
      actionText: 'Gửi Bảng Tính Trả Góp'
    };
  }, [ownedDevices, lead]);

  if (!isOpen || !lead) return null;

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
                <span>{formatDisplayPhone(lead.phone)}</span>
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
        <div className="p-3.5 bg-zinc-50/80 border-b border-zinc-100 grid grid-cols-4 gap-2 text-xs">
          <div className="p-2 bg-white border border-zinc-200/80 rounded-xl">
            <span className="text-[10px] text-zinc-400 block font-semibold">LTV Chi Tiêu</span>
            <span className="font-bold font-mono text-[#ff4b16] text-xs mt-0.5 block truncate">
              {(totalLtv / 1_000_000).toFixed(1)}tr
            </span>
          </div>

          <div className="p-2 bg-white border border-zinc-200/80 rounded-xl">
            <span className="text-[10px] text-zinc-400 block font-semibold">Đơn Mua</span>
            <span className="font-bold font-mono text-zinc-800 text-xs mt-0.5 block">
              {customerInvoices.length} đơn
            </span>
          </div>

          <div className="p-2 bg-white border border-zinc-200/80 rounded-xl">
            <span className="text-[10px] text-zinc-400 block font-semibold">Máy Sở Hữu</span>
            <span className="font-bold font-mono text-zinc-800 text-xs mt-0.5 block">
              {ownedDevices.length} máy
            </span>
          </div>

          <div className="p-2 bg-white border border-zinc-200/80 rounded-xl">
            <span className="text-[10px] text-zinc-400 block font-semibold">Bảo Hành</span>
            <span className="font-bold font-mono text-zinc-800 text-xs mt-0.5 block">
              {customerWarranties.length} lần
            </span>
          </div>
        </div>

        {/* 3. Next Best Action Recommendation Card */}
        <div className="p-3.5 mx-4 mt-3 bg-linear-to-r from-orange-50 to-amber-50 border border-orange-200/90 rounded-2xl space-y-2 text-xs">
          <div className="flex items-center space-x-1.5 font-bold text-[#ff4b16]">
            <Sparkles className="w-4 h-4" />
            <span>⚡ GỢI Ý HÀNH ĐỘNG HÔM NAY (NEXT BEST ACTION)</span>
          </div>
          <div>
            <p className="font-bold text-zinc-900">{nextBestAction.title}</p>
            <p className="text-[11px] text-zinc-600 mt-0.5 leading-relaxed">{nextBestAction.desc}</p>
          </div>
          <div className="pt-1 flex items-center space-x-2">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Send className="w-3 h-3" />}
              className="text-[11px] h-7"
              onClick={() => alert(`Đã kích hoạt gợi ý: ${nextBestAction.actionText}`)}
            >
              {nextBestAction.actionText}
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Phone className="w-3 h-3" />}
              className="text-[11px] h-7 bg-white"
              onClick={() => window.open(`tel:${lead.phone}`)}
            >
              Gọi Khách
            </Button>
          </div>
        </div>

        {/* 4. Navigation Tabs */}
        <div className="flex items-center space-x-1 px-4 border-b border-zinc-100 text-xs font-bold bg-white mt-2">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`py-2.5 px-2.5 border-b-2 transition-all cursor-pointer ${
              activeTab === 'OVERVIEW'
                ? 'border-[#ff4b16] text-[#ff4b16]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Nhu Cầu
          </button>

          <button
            onClick={() => setActiveTab('DEVICES')}
            className={`py-2.5 px-2.5 border-b-2 transition-all cursor-pointer ${
              activeTab === 'DEVICES'
                ? 'border-[#ff4b16] text-[#ff4b16]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Thiết Bị ({ownedDevices.length})
          </button>

          <button
            onClick={() => setActiveTab('ORDERS')}
            className={`py-2.5 px-2.5 border-b-2 transition-all cursor-pointer ${
              activeTab === 'ORDERS'
                ? 'border-[#ff4b16] text-[#ff4b16]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Đơn Hàng ({customerInvoices.length})
          </button>

          <button
            onClick={() => setActiveTab('WARRANTY')}
            className={`py-2.5 px-2.5 border-b-2 transition-all cursor-pointer ${
              activeTab === 'WARRANTY'
                ? 'border-[#ff4b16] text-[#ff4b16]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Bảo Hành ({customerWarranties.length})
          </button>

          <button
            onClick={() => setActiveTab('TIMELINE')}
            className={`py-2.5 px-2.5 border-b-2 transition-all cursor-pointer ${
              activeTab === 'TIMELINE'
                ? 'border-[#ff4b16] text-[#ff4b16]'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Nhật Ký
          </button>
        </div>

        {/* 5. Tab Content */}
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

                {lead.nextAction && (
                  <div className="p-2.5 bg-orange-50/70 border border-orange-200 rounded-xl space-y-1">
                    <span className="text-[10px] font-bold text-[#ff4b16] uppercase block">Kế Hoạch Tiếp Theo:</span>
                    <div className="flex justify-between items-center text-zinc-800 font-semibold">
                      <span>Loại: {lead.nextAction.type}</span>
                      <span className="font-mono text-zinc-600">{lead.nextAction.dueAt}</span>
                    </div>
                  </div>
                )}

                {lead.notes && (
                  <div className="pt-2 border-t border-zinc-200/60">
                    <span className="text-[10px] text-zinc-400 block">Ghi chú tư vấn:</span>
                    <p className="text-zinc-700 mt-0.5 leading-relaxed">{lead.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: OWNED DEVICES */}
          {activeTab === 'DEVICES' && (
            <div className="space-y-3">
              {ownedDevices.length === 0 ? (
                <div className="p-8 text-center text-zinc-400 bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl">
                  <Smartphone className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                  <p className="font-semibold text-zinc-600">Chưa có thiết bị nào</p>
                  <p className="text-[11px] text-zinc-400 mt-1">Dữ liệu thiết bị sẽ tự động ghi nhận khi khách hoàn tất đơn hàng POS.</p>
                </div>
              ) : (
                ownedDevices.map(dev => (
                  <div
                    key={dev.id}
                    className="p-3.5 bg-zinc-50 border border-zinc-200/80 rounded-2xl space-y-2"
                  >
                    <div className="flex items-center justify-between font-bold">
                      <div className="flex items-center space-x-2">
                        <Smartphone className="w-4 h-4 text-[#ff4b16]" />
                        <span className="text-zinc-900">{dev.model}</span>
                      </div>
                      <span className="font-mono text-[#ff4b16]">
                        {(dev.price).toLocaleString('vi-VN')}đ
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-600 bg-white p-2.5 rounded-xl border border-zinc-200/60">
                      <div>
                        <span className="text-[10px] text-zinc-400 block">IMEI:</span>
                        <span className="font-mono font-bold text-zinc-800">{dev.imeiMasked}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 block">Pin lúc bán:</span>
                        <span className="font-mono font-bold text-emerald-600">{dev.batteryHealth}%</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 block">Ngày mua:</span>
                        <span className="font-mono">{dev.purchaseDate}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 block">Hạn bảo hành:</span>
                        <span className="font-mono font-bold text-[#ff4b16]">{dev.warrantyExpiry}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: ORDERS */}
          {activeTab === 'ORDERS' && (
            <div className="space-y-2.5">
              {customerInvoices.length === 0 ? (
                <div className="p-8 text-center text-zinc-400 bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl">
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

          {/* TAB 4: WARRANTY */}
          {activeTab === 'WARRANTY' && (
            <div className="space-y-2.5">
              {customerWarranties.length === 0 ? (
                <div className="p-8 text-center text-zinc-400 bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl">
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

          {/* TAB 5: TIMELINE */}
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
