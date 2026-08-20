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
import { calculateLeadTemperature, calculateLeadPriority } from '../utils/crmEngine';
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
  Award,
  HelpCircle,
  Lock,
  ExternalLink
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
  onUpdateAppointmentStatus?: (appointmentId: string, status: LeadAppointment['status']) => Promise<void> | void;
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
  onUpdateAppointmentStatus,
  onSaveQuote,
  onConvertQuoteToPOS
}) => {
  if (!isOpen || !lead) return null;

  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'CARE_TIMELINE' | 'QUOTES' | 'APPOINTMENTS' | 'ORDERS'>('CARE_TIMELINE');

  // Filter activities for this lead
  const leadActivities = useMemo(() => {
    return activities
      .filter(a => a.leadId === lead.id)
      .sort((a, b) => (a.attemptNo || a.sequence) - (b.attemptNo || b.sequence));
  }, [activities, lead.id]);

  const leadAppointments = useMemo(() => {
    return appointments.filter(a => a.leadId === lead.id);
  }, [appointments, lead.id]);

  const leadQuotes = useMemo(() => {
    return quotes.filter(q => q.leadId === lead.id);
  }, [quotes, lead.id]);

  // Lead Temperature & Priority calculation
  const temp = calculateLeadTemperature(lead);
  const prio = calculateLeadPriority(lead);

  // Appointment Form State
  const [isCreatingAppt, setIsCreatingAppt] = useState(false);
  const [apptDate, setApptDate] = useState<string>(() => {
    const tomorrow = new Date(Date.now() + 86400000);
    return `${getVietnamDateString(tomorrow)} 15:00`;
  });
  const [apptBranchId, setApptBranchId] = useState<string>(lead.branchId || currentUser?.branchId || branches[0]?.id || 'CN01');
  const [apptNotes, setApptNotes] = useState<string>('Khách ghé trải nghiệm máy');

  // Quote Form State
  const [isCreatingQuote, setIsCreatingQuote] = useState(false);
  const [quoteModel, setQuoteModel] = useState<string>(lead.interestedModel || 'iPhone 16 Pro Max 256GB');
  const [quoteUnitPrice, setQuoteUnitPrice] = useState<number>(lead.budget || 28990000);
  const [quoteTradeInSubsidy, setQuoteTradeInSubsidy] = useState<number>(lead.tradeInRequirose ? 12000000 : 0);
  const [quoteDiscount, setQuoteDiscount] = useState<number>(500000);
  const [quoteWarrantyPackage, setQuoteWarrantyPackage] = useState<string>('Bảo hành VIP 12 tháng 1 đổi 1');
  const [quoteReservedDeviceId, setQuoteReservedDeviceId] = useState<string>('');

  const quoteFinalPrice = quoteUnitPrice - quoteTradeInSubsidy - quoteDiscount;

  const handleCreateAppointmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const branchName = branches.find(b => b.id === apptBranchId)?.name || 'Chi nhánh PhoneHouse';
    const effectiveStaffId = currentUser?.id || lead.assignedStaffId || 'STAFF';
    const effectiveStaffName = currentUser?.displayName || lead.assignedStaff || 'Chuyên viên';

    const newAppt: LeadAppointment = {
      id: `APPT_${lead.id}_${Date.now()}`,
      leadId: lead.id,
      customerId: lead.customerId || `CUST_${lead.phoneNormalized || lead.phone}`,
      customerName: lead.name,
      customerPhone: lead.phone,
      branchId: apptBranchId,
      branchName,
      assignedStaffId: effectiveStaffId,
      assignedStaffName: effectiveStaffName,
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
    const effectiveStaffId = currentUser?.id || lead.assignedStaffId || 'STAFF';
    const effectiveStaffName = currentUser?.displayName || lead.assignedStaff || 'Chuyên viên';
    const effectiveBranchId = currentUser?.branchId || lead.branchId || branches[0]?.id || 'CN01';

    const newQuote: LeadQuote = {
      id: `QUOTE_${lead.id}_${Date.now()}`,
      quoteCode: `QT-${Math.floor(10000 + Math.random() * 90000)}`,
      leadId: lead.id,
      customerId: lead.customerId || `CUST_${lead.phoneNormalized || lead.phone}`,
      customerName: lead.name,
      customerPhone: lead.phone,
      staffId: effectiveStaffId,
      staffName: effectiveStaffName,
      branchId: effectiveBranchId,
      model: quoteModel,
      unitPrice: quoteUnitPrice,
      tradeInSubsidy: quoteTradeInSubsidy,
      discountAmount: quoteDiscount,
      finalPrice: quoteFinalPrice,
      warrantyPackage: quoteWarrantyPackage,
      reservedDeviceId: quoteReservedDeviceId || undefined,
      reservedUntil: quoteReservedDeviceId ? `${getVietnamDateString()} ${getVietnamTimeString(new Date(Date.now() + 30 * 60000))}` : undefined,
      validUntil: getVietnamDateString(new Date(Date.now() + 3 * 86400000)),
      status: 'SENT',
      createdAt: getVietnamDateTimeString()
    };

    await onSaveQuote(newQuote);
    setIsCreatingQuote(false);
  };

  const handleUpdateApptStatus = async (apptId: string, newStatus: LeadAppointment['status']) => {
    if (onUpdateAppointmentStatus) {
      await onUpdateAppointmentStatus(apptId, newStatus);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/60 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-zinc-200">
        
        {/* 1. Command Center Header */}
        <div className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 text-white p-4 sm:p-5 flex flex-col gap-3 border-b border-zinc-700">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF4B16] to-orange-500 flex items-center justify-center font-black text-xl shadow-md">
                {lead.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center space-x-2 flex-wrap">
                  <h2 className="text-base font-black tracking-tight text-white">{lead.name}</h2>
                  
                  {/* Lead Temperature Badge */}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                    temp.temperature === 'HOT' ? 'bg-rose-500/20 text-rose-300 border border-rose-400/40' :
                    temp.temperature === 'WARM' ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40' :
                    'bg-zinc-800 text-zinc-400'
                  }`}>
                    {temp.temperature === 'HOT' ? '🔥 HOT' : temp.temperature === 'WARM' ? '⚡ WARM' : '❄️ COLD'} ({temp.score}đ)
                  </span>

                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-bold text-orange-200">
                    {lead.source}
                  </span>

                  {lead.careQualityScore !== undefined && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-extrabold border border-amber-400/30">
                      ★ Quality: {lead.careQualityScore}đ
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-3 text-xs text-zinc-300 mt-1">
                  <span className="font-semibold text-orange-400 font-mono">{formatDisplayPhone(lead.phone)}</span>
                  <span>•</span>
                  <span className="text-zinc-200">{lead.interestedModel}</span>
                  <span>•</span>
                  <span className="font-bold text-emerald-400">~{lead.budget.toLocaleString('vi-VN')} đ</span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Action Command Toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-zinc-700/60 text-xs">
            <a
              href={`tel:${lead.phone}`}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold flex items-center gap-1.5 transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Gọi</span>
            </a>

            <a
              href={`https://zalo.me/${lead.phoneNormalized || lead.phone}`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold flex items-center gap-1.5 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
              <span>Zalo</span>
            </a>

            <button
              onClick={() => onOpenCareModal(lead)}
              className="px-3 py-1.5 rounded-xl bg-[#FF4B16] hover:bg-[#E94312] text-white font-black flex items-center gap-1.5 shadow-sm cursor-pointer ml-auto"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>+ Chăm sóc</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('QUOTES');
                setIsCreatingQuote(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>+ Báo giá</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('APPOINTMENTS');
                setIsCreatingAppt(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-purple-400" />
              <span>+ Hẹn lịch</span>
            </button>
          </div>
        </div>

        {/* 2. Tab Navigation */}
        <div className="flex items-center space-x-1 px-4 bg-zinc-100/80 border-b border-zinc-200 overflow-x-auto text-xs py-1.5">
          {[
            { id: 'CARE_TIMELINE', label: `Chăm sóc (${leadActivities.length})`, icon: Clock },
            { id: 'OVERVIEW', label: 'Tổng quan', icon: User },
            { id: 'QUOTES', label: `Báo giá (${leadQuotes.length})`, icon: FileText },
            { id: 'APPOINTMENTS', label: `Lịch hẹn (${leadAppointments.length})`, icon: Calendar },
            { id: 'ORDERS', label: `Lịch sử mua (${invoices.length})`, icon: ShoppingBag }
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

        {/* 3. Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* TAB 1: CARE TIMELINE */}
          {activeTab === 'CARE_TIMELINE' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl p-4 border border-orange-200/80 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-orange-950 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#FF4B16]" />
                    <span>Lịch Sử Chăm Sóc Có Kiểm Chứng (Audited Touch History)</span>
                  </h4>
                  <p className="text-xs text-orange-900/80 mt-0.5">
                    Đã thực hiện <strong>{leadActivities.length}</strong> lượt chạm (Trong đó: <strong>{leadActivities.filter(a => a.isMeaningfulContact).length}</strong> lần đàm thoại có ý nghĩa).
                  </p>
                </div>
                <button
                  onClick={() => onOpenCareModal(lead)}
                  className="px-3 py-1.5 rounded-xl bg-[#FF4B16] text-white text-xs font-bold shadow-xs hover:bg-[#E94312] cursor-pointer"
                >
                  + Thêm chăm sóc
                </button>
              </div>

              {leadActivities.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 text-xs font-medium space-y-2">
                  <Clock className="w-8 h-8 text-zinc-300 mx-auto" />
                  <p>Chưa có lượt chăm sóc nào được ghi nhận cho khách hàng này.</p>
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-zinc-200">
                  {leadActivities.map((act) => (
                    <div key={act.id} className="relative bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs space-y-2 text-xs">
                      {/* Dot */}
                      <div className={`absolute -left-6 top-4 w-3.5 h-3.5 rounded-full border-2 border-white ${
                        act.isMeaningfulContact ? 'bg-[#FF4B16] ring-2 ring-orange-200' : 'bg-zinc-400'
                      }`} />

                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-zinc-900 text-white font-bold text-[10px]">
                            Lượt #{act.attemptNo || act.sequence} {act.meaningfulCareNo ? `(L${act.meaningfulCareNo})` : ''}
                          </span>
                          <span className="font-bold text-zinc-800">
                            {act.channel} • {act.action}
                          </span>
                        </div>

                        {/* Verification Status Pill */}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                          act.verificationStatus === 'MANAGER_VERIFIED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          act.verificationStatus === 'SYSTEM_CAPTURED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          act.verificationStatus === 'NEEDS_EVIDENCE' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          act.verificationStatus === 'FLAGGED' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                          'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {act.verificationStatus === 'MANAGER_VERIFIED' && <ShieldCheck className="w-3 h-3 text-emerald-600" />}
                          <span>{act.verificationStatus === 'MANAGER_VERIFIED' ? 'QA Đã duyệt' :
                                 act.verificationStatus === 'SYSTEM_CAPTURED' ? 'System Log' :
                                 act.verificationStatus === 'NEEDS_EVIDENCE' ? 'Cần bổ sung bằng chứng' :
                                 act.verificationStatus === 'FLAGGED' ? 'Gắn cờ' :
                                 'Tự khai báo'}</span>
                        </span>
                      </div>

                      {/* Content */}
                      <div className="text-zinc-700 bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                        <div className="font-semibold text-zinc-900 mb-0.5">
                          Kết quả: {act.outcome} • Phản hồi: {act.customerResponseCode}
                        </div>
                        {act.customerResponseText && (
                          <div className="text-[11px] text-zinc-600 italic">"{act.customerResponseText}"</div>
                        )}
                        {act.objectionCategory && (
                          <div className="mt-1 text-[10px] font-bold text-orange-800">
                            Lý do băn khoăn: [{act.objectionCategory}] {act.objectionCode}
                          </div>
                        )}
                      </div>

                      {/* Evidence & QA notes */}
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1">
                        <div>Thực hiện bởi: <strong>{act.staffName}</strong> • {act.createdAt}</div>
                        {act.qaReview && (
                          <div className="text-purple-600 font-bold">
                            Duyệt: {act.qaReview.reviewedByName}
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
            <div className="space-y-4 animate-fadeIn text-xs">
              <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200 space-y-3">
                <h4 className="font-black text-zinc-900 uppercase tracking-wider">Thông tin chi tiết Lead</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Họ tên khách:</span>
                    <span className="font-bold text-zinc-800">{lead.name}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Số điện thoại:</span>
                    <span className="font-bold text-zinc-800 font-mono">{lead.phone}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Nguồn tiếp cận:</span>
                    <span className="font-bold text-zinc-800">{lead.source}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Sản phẩm quan tâm:</span>
                    <span className="font-bold text-[#FF4B16]">{lead.interestedModel}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Ngân sách dự kiến:</span>
                    <span className="font-bold text-emerald-600">{lead.budget.toLocaleString('vi-VN')} đ</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Nhu cầu Thu Cũ Đổi Mới:</span>
                    <span className="font-bold text-zinc-800">{lead.tradeInRequirose ? `Có (${lead.tradeInModel || 'Chưa rõ model'})` : 'Không'}</span>
                  </div>
                </div>
              </div>

              {lead.notes && (
                <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200 space-y-1.5">
                  <h4 className="font-black text-zinc-900 uppercase tracking-wider">Ghi chú xuyên suốt</h4>
                  <pre className="text-zinc-700 font-sans whitespace-pre-wrap text-xs bg-white p-3 rounded-xl border border-zinc-100">{lead.notes}</pre>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: QUOTES */}
          {activeTab === 'QUOTES' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-zinc-900">
                  Bảng Báo Giá Đã Gửi Khách ({leadQuotes.length})
                </h4>
                <button
                  onClick={() => setIsCreatingQuote(!isCreatingQuote)}
                  className="px-3 py-1.5 rounded-xl bg-[#FF4B16] text-white text-xs font-bold hover:bg-[#E94312] cursor-pointer"
                >
                  {isCreatingQuote ? 'Đóng form' : '+ Tạo báo giá mới'}
                </button>
              </div>

              {isCreatingQuote && (
                <form onSubmit={handleCreateQuoteSubmit} className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200 space-y-3 text-xs">
                  <div className="font-bold text-zinc-900 text-sm">Soạn bảng báo giá & Giữ tồn kho</div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-zinc-600 block mb-1">Model sản phẩm</label>
                      <input 
                        type="text" 
                        value={quoteModel} 
                        onChange={e => setQuoteModel(e.target.value)} 
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-zinc-600 block mb-1">Giá niêm yết (VNĐ)</label>
                      <input 
                        type="number" 
                        value={quoteUnitPrice} 
                        onChange={e => setQuoteUnitPrice(Number(e.target.value))} 
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-zinc-600 block mb-1">Trợ giá Thu Cũ (VNĐ)</label>
                      <input 
                        type="number" 
                        value={quoteTradeInSubsidy} 
                        onChange={e => setQuoteTradeInSubsidy(Number(e.target.value))} 
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-zinc-600 block mb-1">Giảm giá thêm / Voucher</label>
                      <input 
                        type="number" 
                        value={quoteDiscount} 
                        onChange={e => setQuoteDiscount(Number(e.target.value))} 
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl"
                      />
                    </div>
                  </div>

                  {/* Device Stock Reservation Selector */}
                  <div>
                    <label className="text-[11px] font-bold text-zinc-600 block mb-1">
                      Giữ hàng tồn kho thực tế (Tùy chọn - Giữ 30 phút)
                    </label>
                    <select
                      value={quoteReservedDeviceId}
                      onChange={e => setQuoteReservedDeviceId(e.target.value)}
                      className="w-full p-2 bg-white border border-zinc-200 rounded-xl text-xs"
                    >
                      <option value="">-- Không giữ máy cụ thể (Chỉ báo giá dòng) --</option>
                      {devices.filter(d => d.status === 'in_stock').slice(0, 10).map(dev => (
                        <option key={dev.id} value={dev.id}>
                          {dev.name} - IMEI: {dev.imei || dev.id} ({dev.sellingPrice.toLocaleString('vi-VN')} đ)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-zinc-200 flex items-center justify-between font-bold text-sm">
                    <span>Giá thanh toán cuối:</span>
                    <span className="text-[#FF4B16] text-base">{quoteFinalPrice.toLocaleString('vi-VN')} đ</span>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-zinc-900 text-white font-black hover:bg-zinc-800 cursor-pointer"
                  >
                    Lưu Báo Giá & Gửi Khách
                  </button>
                </form>
              )}

              {leadQuotes.length === 0 ? (
                <div className="py-8 text-center text-zinc-400 text-xs font-medium">
                  Chưa có báo giá nào được tạo.
                </div>
              ) : (
                <div className="space-y-3">
                  {leadQuotes.map(q => (
                    <div key={q.id} className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-[#FF4B16] text-sm">{q.quoteCode}</span>
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold text-[10px]">
                          {q.status}
                        </span>
                      </div>
                      <div className="font-bold text-zinc-900">{q.model}</div>
                      <div className="flex items-center justify-between text-zinc-600 pt-1 border-t border-zinc-100">
                        <span>Giá chốt: <strong className="text-zinc-900">{q.finalPrice.toLocaleString('vi-VN')} đ</strong></span>
                        <button
                          onClick={() => onConvertQuoteToPOS(q, lead)}
                          className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-xs"
                        >
                          Tạo Đơn POS →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: APPOINTMENTS */}
          {activeTab === 'APPOINTMENTS' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-zinc-900">
                  Lịch Hẹn Trải Nghiệm Showroom ({leadAppointments.length})
                </h4>
                <button
                  onClick={() => setIsCreatingAppt(!isCreatingAppt)}
                  className="px-3 py-1.5 rounded-xl bg-[#FF4B16] text-white text-xs font-bold hover:bg-[#E94312] cursor-pointer"
                >
                  {isCreatingAppt ? 'Đóng form' : '+ Tạo lịch hẹn mới'}
                </button>
              </div>

              {isCreatingAppt && (
                <form onSubmit={handleCreateAppointmentSubmit} className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200 space-y-3 text-xs">
                  <div className="font-bold text-zinc-900 text-sm">Đặt lịch hẹn Showroom</div>
                  
                  <div>
                    <label className="text-[11px] font-bold text-zinc-600 block mb-1">Thời gian hẹn</label>
                    <input 
                      type="text" 
                      value={apptDate} 
                      onChange={e => setApptDate(e.target.value)} 
                      placeholder="YYYY-MM-DD HH:mm"
                      className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-600 block mb-1">Chi nhánh Showroom</label>
                    <select
                      value={apptBranchId}
                      onChange={e => setApptBranchId(e.target.value)}
                      className="w-full p-2 bg-white border border-zinc-200 rounded-xl"
                    >
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name} - {b.address}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-600 block mb-1">Ghi chú chuẩn bị máy</label>
                    <input 
                      type="text" 
                      value={apptNotes} 
                      onChange={e => setApptNotes(e.target.value)} 
                      className="w-full p-2 bg-white border border-zinc-200 rounded-xl"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-zinc-900 text-white font-black hover:bg-zinc-800 cursor-pointer"
                  >
                    Xác Nhận Đặt Lịch
                  </button>
                </form>
              )}

              {leadAppointments.length === 0 ? (
                <div className="py-8 text-center text-zinc-400 text-xs font-medium">
                  Chưa có lịch hẹn nào.
                </div>
              ) : (
                <div className="space-y-3">
                  {leadAppointments.map(appt => (
                    <div key={appt.id} className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-zinc-900 text-sm">
                          <Calendar className="w-4 h-4 text-purple-600" />
                          <span>{appt.scheduledAt}</span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                          appt.status === 'ARRIVED' ? 'bg-emerald-100 text-emerald-800' :
                          appt.status === 'NO_SHOW' ? 'bg-rose-100 text-rose-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {appt.status}
                        </span>
                      </div>

                      <div className="text-zinc-600">
                        <div>Địa điểm: <strong>{appt.branchName}</strong></div>
                        <div>Máy xem: <strong>{appt.interestedModel}</strong></div>
                        {appt.notes && <div className="text-zinc-400 mt-1">"{appt.notes}"</div>}
                      </div>

                      {/* Status quick actions */}
                      <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                        <div className="flex gap-1.5">
                          {appt.status !== 'ARRIVED' && (
                            <button
                              onClick={() => handleUpdateApptStatus(appt.id, 'ARRIVED')}
                              className="px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs border border-emerald-200 cursor-pointer"
                            >
                              ✓ Khách đã đến
                            </button>
                          )}
                          {appt.status !== 'NO_SHOW' && (
                            <button
                              onClick={() => handleUpdateApptStatus(appt.id, 'NO_SHOW')}
                              className="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 cursor-pointer"
                            >
                              ❌ Không đến (No-Show)
                            </button>
                          )}
                        </div>

                        {appt.status === 'ARRIVED' && (
                          <span className="text-emerald-600 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Đã tiếp đón tại shop</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ORDERS HISTORY */}
          {activeTab === 'ORDERS' && (
            <div className="space-y-3 animate-fadeIn text-xs">
              <h4 className="font-black text-zinc-900 uppercase tracking-wider">Lịch Sử Mua Hàng & Sửa Chữa</h4>
              {invoices.length === 0 ? (
                <div className="py-8 text-center text-zinc-400 font-medium">
                  Khách hàng chưa có đơn hàng nào trước đây.
                </div>
              ) : (
                invoices.map(inv => (
                  <div key={inv.id} className="bg-zinc-50 rounded-2xl p-3.5 border border-zinc-200 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-zinc-900">{inv.id}</div>
                      <div className="text-[11px] text-zinc-500">{inv.createdAt}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-600 text-sm">{inv.finalAmount.toLocaleString('vi-VN')} đ</div>
                      <span className="text-[10px] text-zinc-400">{inv.paymentMethod}</span>
                    </div>
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
