import React, { useState, useMemo } from 'react';
import { 
  Lead, 
  LeadCareActivity, 
  LeadAppointment, 
  LeadQuote, 
  SalesInvoice, 
  WarrantyTicket,
  UserAccount,
  StoreBranch,
  DeviceItem
} from '../../../types';
import { formatDisplayPhone } from '../../../utils/phoneUtils';
import { getVietnamDateString, getVietnamTimeString, getVietnamDateTimeString } from '../../../utils/dateTimeUtils';
import { 
  User, 
  Phone, 
  Clock, 
  DollarSign, 
  MessageSquare, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  FileText, 
  ShoppingBag, 
  Building2, 
  X, 
  Plus, 
  Send, 
  Tag, 
  Sparkles, 
  ArrowRight,
  Check,
  Smartphone,
  Flame,
  Award
} from 'lucide-react';

export interface LeadOperationalDrawerProps {
  lead: Lead | null;
  isOpen: boolean;
  currentUser?: UserAccount | null;
  branches?: StoreBranch[];
  devices?: DeviceItem[];
  activities?: LeadCareActivity[];
  appointments?: LeadAppointment[];
  quotes?: LeadQuote[];
  invoices?: SalesInvoice[];
  warrantyTickets?: WarrantyTicket[];
  onClose: () => void;
  onOpenCareModal: (lead: Lead) => void;
  onSaveAppointment: (appointment: LeadAppointment) => Promise<void> | void;
  onSaveQuote: (quote: LeadQuote) => Promise<void> | void;
  onConvertQuoteToPOS: (quote: LeadQuote, lead: Lead) => void;
}

export const LeadOperationalDrawer: React.FC<LeadOperationalDrawerProps> = ({
  lead,
  isOpen,
  currentUser,
  branches = [],
  devices = [],
  activities = [],
  appointments = [],
  quotes = [],
  invoices = [],
  warrantyTickets = [],
  onClose,
  onOpenCareModal,
  onSaveAppointment,
  onSaveQuote,
  onConvertQuoteToPOS
}) => {
  if (!isOpen || !lead) return null;

  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'CARE_TIMELINE' | 'CHAT' | 'QUOTES' | 'APPOINTMENTS' | 'ORDERS'>('CARE_TIMELINE');

  // Filter activities for this lead
  const leadActivities = useMemo(() => {
    return activities.filter(a => a.leadId === lead.id).sort((a, b) => a.sequence - b.sequence);
  }, [activities, lead.id]);

  const leadAppointments = useMemo(() => {
    return appointments.filter(a => a.leadId === lead.id);
  }, [appointments, lead.id]);

  const leadQuotes = useMemo(() => {
    return quotes.filter(q => q.leadId === lead.id);
  }, [quotes, lead.id]);

  // Appointment Form State
  const [isCreatingAppt, setIsCreatingAppt] = useState(false);
  const [apptDate, setApptDate] = useState<string>(() => {
    const tomorrow = new Date(Date.now() + 86400000);
    return `${getVietnamDateString(tomorrow)} 15:00`;
  });
  const [apptBranchId, setApptBranchId] = useState<string>(lead.branchId || branches[0]?.id || 'CN01');
  const [apptNotes, setApptNotes] = useState<string>('Khách ghé trải nghiệm máy');

  // Quote Form State
  const [isCreatingQuote, setIsCreatingQuote] = useState(false);
  const [quoteModel, setQuoteModel] = useState<string>(lead.interestedModel || 'iPhone 16 Pro Max 256GB');
  const [quoteUnitPrice, setQuoteUnitPrice] = useState<number>(lead.budget || 28990000);
  const [quoteTradeInSubsidy, setQuoteTradeInSubsidy] = useState<number>(lead.tradeInRequirose ? 12000000 : 0);
  const [quoteDiscount, setQuoteDiscount] = useState<number>(500000);
  const [quoteWarrantyPackage, setQuoteWarrantyPackage] = useState<string>('Bảo hành VIP 12 tháng 1 đổi 1');

  const quoteFinalPrice = quoteUnitPrice - quoteTradeInSubsidy - quoteDiscount;

  const handleCreateAppointmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const branchName = branches.find(b => b.id === apptBranchId)?.name || 'Chi nhánh PhoneHouse';
    const newAppt: LeadAppointment = {
      id: `APPT_${lead.id}_${Date.now()}`,
      leadId: lead.id,
      customerId: lead.customerId,
      customerName: lead.name,
      customerPhone: lead.phone,
      branchId: apptBranchId,
      branchName,
      assignedStaffId: currentUser?.id || lead.assignedStaffId || 'STAFF',
      assignedStaffName: currentUser?.displayName || lead.assignedStaff || 'Chuyên viên',
      scheduledAt: apptDate,
      interestedModel: lead.interestedModel,
      notes: apptNotes,
      status: 'SCHEDULED',
      createdAt: getVietnamDateTimeString()
    };

    await onSaveAppointment(newAppt);
    setIsCreatingAppt(false);
  };

  const handleCreateQuoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newQuote: LeadQuote = {
      id: `QUOTE_${lead.id}_${Date.now()}`,
      quoteCode: `QT-${Math.floor(10000 + Math.random() * 90000)}`,
      leadId: lead.id,
      customerId: lead.customerId,
      customerName: lead.name,
      customerPhone: lead.phone,
      staffId: currentUser?.id || lead.assignedStaffId || 'STAFF',
      staffName: currentUser?.displayName || lead.assignedStaff || 'Chuyên viên bán hàng',
      branchId: lead.branchId || currentUser?.branchId || 'CN01',
      model: quoteModel,
      unitPrice: quoteUnitPrice,
      tradeInSubsidy: quoteTradeInSubsidy,
      discountAmount: quoteDiscount,
      finalPrice: quoteFinalPrice,
      warrantyPackage: quoteWarrantyPackage,
      validUntil: getVietnamDateString(new Date(Date.now() + 3 * 86400000)),
      status: 'SENT',
      createdAt: getVietnamDateTimeString()
    };

    await onSaveQuote(newQuote);
    setIsCreatingQuote(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/60 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-zinc-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 text-white p-4 sm:p-5 flex items-center justify-between border-b border-zinc-700">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF4B16] to-orange-500 flex items-center justify-center font-black text-lg shadow-sm">
              {lead.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-black tracking-tight text-white">{lead.name}</h2>
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold text-orange-200">
                  {lead.source}
                </span>
                {lead.careQualityScore !== undefined && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-300 text-[10px] font-extrabold border border-amber-400/40">
                    ★ {lead.careQualityScore}đ
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-3 text-xs text-zinc-300 mt-0.5">
                <span className="font-semibold text-orange-400">{formatDisplayPhone(lead.phone)}</span>
                <span>•</span>
                <span className="text-zinc-300">{lead.interestedModel}</span>
                <span>•</span>
                <span className="font-bold text-emerald-400">~{lead.budget.toLocaleString('vi-VN')} đ</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => onOpenCareModal(lead)}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#FF4B16] to-orange-500 hover:opacity-95 text-white text-xs font-black flex items-center space-x-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Chăm sóc</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-1 px-4 bg-zinc-100/80 border-b border-zinc-200 overflow-x-auto text-xs py-1.5">
          {[
            { id: 'CARE_TIMELINE', label: `Chăm sóc (${leadActivities.length})`, icon: Clock },
            { id: 'OVERVIEW', label: 'Tổng quan', icon: User },
            { id: 'QUOTES', label: `Báo giá (${leadQuotes.length})`, icon: FileText },
            { id: 'APPOINTMENTS', label: `Lịch hẹn (${leadAppointments.length})`, icon: Calendar },
            { id: 'ORDERS', label: `Lịch sử (${invoices.length})`, icon: ShoppingBag }
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-2 rounded-xl font-bold flex items-center space-x-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  isSelected 
                    ? 'bg-white text-[#FF4B16] shadow-xs border border-zinc-200/80' 
                    : 'text-zinc-600 hover:bg-white/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* TAB 1: CARE TIMELINE */}
          {activeTab === 'CARE_TIMELINE' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Header Action Summary */}
              <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl p-4 border border-orange-200/80 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-orange-950 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#FF4B16]" />
                    <span>Tiến Trình Chăm Sóc Có Kiểm Chứng</span>
                  </h4>
                  <p className="text-xs text-orange-900/80 mt-0.5">
                    Đã thực hiện <strong>{leadActivities.length} lần chăm sóc</strong> • {leadActivities.filter(a => a.isMeaningfulContact).length} lần trao đổi hiệu quả
                  </p>
                </div>
                <button
                  onClick={() => onOpenCareModal(lead)}
                  className="px-3 py-2 bg-[#FF4B16] hover:bg-[#E94312] text-white rounded-xl text-xs font-black shadow-xs cursor-pointer flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ghi nhận L{leadActivities.length + 1}</span>
                </button>
              </div>

              {/* Timeline Items */}
              {leadActivities.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-zinc-200 rounded-3xl space-y-2">
                  <Clock className="w-8 h-8 text-zinc-300 mx-auto" />
                  <p className="text-xs font-bold text-zinc-600">Chưa có lượt chăm sóc nào được ghi nhận</p>
                  <p className="text-[11px] text-zinc-400">Bấm nút "+ Chăm sóc" ở góc trên để ghi nhận cuộc gọi hoặc tin nhắn đầu tiên.</p>
                </div>
              ) : (
                <div className="space-y-3 relative before:absolute before:left-5 before:top-4 before:bottom-4 before:w-0.5 before:bg-zinc-200">
                  {leadActivities.map((act) => (
                    <div key={act.id} className="relative pl-11">
                      {/* Timeline Dot */}
                      <div className="absolute left-2.5 top-3 w-5 h-5 rounded-full bg-[#FF4B16] text-white flex items-center justify-center font-black text-[10px] ring-4 ring-white shadow-xs">
                        {act.sequence}
                      </div>

                      {/* Card */}
                      <div className="bg-white rounded-2xl p-4 border border-zinc-200/90 shadow-2xs space-y-2.5">
                        <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-black text-zinc-900">Lần {act.sequence}: {act.action}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              act.verificationStatus === 'VERIFIED' 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {act.verificationStatus === 'VERIFIED' ? '✓ VERIFIED' : '⚠ SELF_REPORTED'}
                            </span>
                          </div>
                          <span className="text-[11px] font-medium text-zinc-400">{act.createdAt}</span>
                        </div>

                        {/* Channel & Evidence info */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-zinc-50 p-2 rounded-xl">
                            <span className="text-[10px] text-zinc-400 block font-bold uppercase">Kênh liên hệ</span>
                            <span className="font-semibold text-zinc-800">{act.channel} • {act.staffName}</span>
                          </div>
                          <div className="bg-zinc-50 p-2 rounded-xl">
                            <span className="text-[10px] text-zinc-400 block font-bold uppercase">Bằng chứng (Evidence)</span>
                            <span className="font-semibold text-emerald-700">
                              {act.evidenceType === 'CALL_LOG' && `☎️ Cuộc gọi ${act.evidenceData?.callDurationSeconds || 54}s`}
                              {act.evidenceType === 'CONVERSATION_ATTACHED' && '💬 Hội thoại Chat tự động'}
                              {act.evidenceType === 'SCREENSHOT_UPLOAD' && '🖼️ Ảnh chụp màn hình đã tải'}
                              {act.evidenceType === 'SELF_REPORTED' && '⚠️ Tự khai báo'}
                            </span>
                          </div>
                        </div>

                        {/* Verbatim Feedback */}
                        {act.customerResponseText && (
                          <div className="bg-orange-50/50 p-2.5 rounded-xl border border-orange-100 text-xs">
                            <span className="font-bold text-orange-950">Phản hồi của khách: </span>
                            <span className="text-zinc-800">"{act.customerResponseText}"</span>
                          </div>
                        )}

                        {/* Price Gap Analysis */}
                        {act.priceDetails && (
                          <div className="bg-rose-50/60 p-2.5 rounded-xl border border-rose-200 text-xs flex items-center justify-between text-rose-900">
                            <span>Chênh lệch so với {act.priceDetails.competitorName}:</span>
                            <span className="font-black">+{act.priceDetails.priceGap?.toLocaleString('vi-VN')} đ</span>
                          </div>
                        )}

                        {/* Next Action */}
                        {act.nextActionAt && (
                          <div className="flex items-center justify-between text-xs text-zinc-600 bg-zinc-50 px-3 py-2 rounded-xl border border-zinc-200/70">
                            <span className="font-bold text-zinc-800 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-[#FF4B16]" />
                              <span>Hẹn kế tiếp ({act.nextActionType}):</span>
                            </span>
                            <span className="font-black text-[#FF4B16]">{act.nextActionAt}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700">Thông tin Lead & Chuyên viên</h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Số điện thoại</span>
                    <span className="font-bold text-zinc-900">{formatDisplayPhone(lead.phone)}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Sản phẩm quan tâm</span>
                    <span className="font-bold text-zinc-900">{lead.interestedModel}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Ngân sách dự kiến</span>
                    <span className="font-bold text-emerald-600">{lead.budget.toLocaleString('vi-VN')} đ</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Chuyên viên phụ trách</span>
                    <span className="font-bold text-zinc-900">{lead.assignedStaff}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Nhu cầu thu cũ đổi mới</span>
                    <span className="font-bold text-zinc-900">{lead.tradeInRequirose ? `Có (${lead.tradeInModel || 'Đang xác nhận'})` : 'Không'}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Trạng thái Pipeline</span>
                    <span className="font-bold text-[#FF4B16] uppercase">{lead.status}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: QUOTES */}
          {activeTab === 'QUOTES' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-800">Danh Sách Báo Giá Đã Gửi</h4>
                <button
                  onClick={() => setIsCreatingQuote(true)}
                  className="px-3 py-1.5 bg-[#FF4B16] hover:bg-[#E94312] text-white rounded-xl text-xs font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Tạo báo giá mới</span>
                </button>
              </div>

              {isCreatingQuote && (
                <form onSubmit={handleCreateQuoteSubmit} className="bg-orange-50/60 p-4 rounded-2xl border border-orange-200 space-y-3 text-xs">
                  <h5 className="font-black text-orange-900 uppercase">Tạo Báo Giá Chính Thức</h5>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[11px] text-zinc-500 font-medium">Dòng máy</span>
                      <input 
                        type="text" 
                        value={quoteModel} 
                        onChange={e => setQuoteModel(e.target.value)}
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-zinc-500 font-medium">Giá niêm yết (VNĐ)</span>
                      <input 
                        type="number" 
                        value={quoteUnitPrice} 
                        onChange={e => setQuoteUnitPrice(Number(e.target.value))}
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-zinc-500 font-medium">Trợ giá thu cũ (VNĐ)</span>
                      <input 
                        type="number" 
                        value={quoteTradeInSubsidy} 
                        onChange={e => setQuoteTradeInSubsidy(Number(e.target.value))}
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl text-emerald-600 font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-zinc-500 font-medium">Giảm giá thêm (VNĐ)</span>
                      <input 
                        type="number" 
                        value={quoteDiscount} 
                        onChange={e => setQuoteDiscount(Number(e.target.value))}
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl text-[#FF4B16] font-bold"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-zinc-200 font-bold">
                    <span>Giá thanh toán sau trừ quà/thu cũ:</span>
                    <span className="text-base text-[#FF4B16] font-black">{quoteFinalPrice.toLocaleString('vi-VN')} đ</span>
                  </div>
                  <div className="flex justify-end space-x-2 pt-1">
                    <button type="button" onClick={() => setIsCreatingQuote(false)} className="px-3 py-1.5 bg-white border border-zinc-200 rounded-xl">Hủy</button>
                    <button type="submit" className="px-4 py-1.5 bg-[#FF4B16] text-white font-bold rounded-xl">Lưu & Gửi báo giá</button>
                  </div>
                </form>
              )}

              {leadQuotes.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-6">Chưa có báo giá nào cho Lead này.</p>
              ) : (
                leadQuotes.map((q) => (
                  <div key={q.id} className="bg-white p-3.5 rounded-2xl border border-zinc-200 shadow-2xs space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-orange-600 font-black">{q.quoteCode} • {q.model}</span>
                      <span className="text-base font-black text-emerald-600">{q.finalPrice.toLocaleString('vi-VN')} đ</span>
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Gốc: {q.unitPrice.toLocaleString('vi-VN')} đ | Thu cũ: -{q.tradeInSubsidy?.toLocaleString('vi-VN')} đ | Giảm giá: -{q.discountAmount?.toLocaleString('vi-VN')} đ
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
                      <span className="text-[10px] text-zinc-400">Hiệu lực đến {q.validUntil}</span>
                      <button
                        onClick={() => onConvertQuoteToPOS(q, lead)}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center space-x-1"
                      >
                        <span>Chuyển sang POS</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: APPOINTMENTS */}
          {activeTab === 'APPOINTMENTS' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-800">Lịch Hẹn Showroom</h4>
                <button
                  onClick={() => setIsCreatingAppt(true)}
                  className="px-3 py-1.5 bg-[#FF4B16] hover:bg-[#E94312] text-white rounded-xl text-xs font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Đặt lịch hẹn mới</span>
                </button>
              </div>

              {isCreatingAppt && (
                <form onSubmit={handleCreateAppointmentSubmit} className="bg-purple-50/60 p-4 rounded-2xl border border-purple-200 space-y-3 text-xs">
                  <h5 className="font-black text-purple-900 uppercase">Tạo Lịch Hẹn Đón Khách</h5>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[11px] text-zinc-500 font-medium">Thời gian hẹn (YYYY-MM-DD HH:mm)</span>
                      <input 
                        type="text" 
                        value={apptDate} 
                        onChange={e => setApptDate(e.target.value)}
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-zinc-500 font-medium">Chi nhánh đón tiếp</span>
                      <select
                        value={apptBranchId}
                        onChange={e => setApptBranchId(e.target.value)}
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl"
                      >
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-500 font-medium">Ghi chú đón tiếp</span>
                    <input 
                      type="text" 
                      value={apptNotes} 
                      onChange={e => setApptNotes(e.target.value)}
                      className="w-full p-2 bg-white border border-zinc-200 rounded-xl"
                    />
                  </div>
                  <div className="flex justify-end space-x-2 pt-1">
                    <button type="button" onClick={() => setIsCreatingAppt(false)} className="px-3 py-1.5 bg-white border border-zinc-200 rounded-xl">Hủy</button>
                    <button type="submit" className="px-4 py-1.5 bg-purple-600 text-white font-bold rounded-xl">Xác nhận lịch hẹn</button>
                  </div>
                </form>
              )}

              {leadAppointments.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-6">Chưa có lịch hẹn nào tại showroom.</p>
              ) : (
                leadAppointments.map((ap) => (
                  <div key={ap.id} className="bg-white p-3.5 rounded-2xl border border-zinc-200 shadow-2xs space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-purple-700 font-black flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{ap.scheduledAt}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-black">
                        {ap.status}
                      </span>
                    </div>
                    <p className="text-zinc-700 font-medium">📍 {ap.branchName} • Phụ trách: {ap.assignedStaffName}</p>
                    {ap.notes && <p className="text-[11px] text-zinc-500 bg-zinc-50 p-2 rounded-lg">"{ap.notes}"</p>}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 5: ORDERS */}
          {activeTab === 'ORDERS' && (
            <div className="space-y-4 animate-fadeIn text-xs">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-800">Lịch Sử Hóa Đơn & Bảo Hành</h4>
              {invoices.length === 0 ? (
                <p className="text-zinc-400 text-center py-6">Khách hàng chưa có hóa đơn mua hàng trước đây.</p>
              ) : (
                invoices.map(inv => (
                  <div key={inv.id} className="p-3 bg-white border border-zinc-200 rounded-2xl shadow-2xs space-y-1">
                    <div className="flex justify-between font-bold">
                      <span>{inv.invoiceCode}</span>
                      <span className="text-emerald-600 font-black">{inv.finalAmount.toLocaleString('vi-VN')} đ</span>
                    </div>
                    <p className="text-[11px] text-zinc-500">{inv.paymentMethod} • {inv.detailedItems?.map(d => d.name).join(', ')}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
