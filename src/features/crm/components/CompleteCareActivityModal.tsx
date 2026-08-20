import React, { useState, useMemo } from 'react';
import { 
  Lead, 
  LeadCareActivity, 
  CareChannel, 
  CareAction, 
  CareOutcome, 
  CustomerResponseCode, 
  ObjectionCode, 
  EvidenceType, 
  EvidenceVerificationStatus,
  UserAccount,
  StoreBranch
} from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { getVietnamDateString, getVietnamTimeString, getVietnamDateTimeString } from '../../../utils/dateTimeUtils';
import { 
  Phone, 
  MessageSquare, 
  Send, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  DollarSign, 
  Upload, 
  FileCheck, 
  Clock, 
  Sparkles, 
  UserCheck, 
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  X,
  Building2,
  Paperclip
} from 'lucide-react';

export interface CompleteCareActivityModalProps {
  isOpen: boolean;
  lead: Lead;
  currentUser?: UserAccount | null;
  branches?: StoreBranch[];
  existingActivities?: LeadCareActivity[];
  onClose: () => void;
  onSubmitActivity: (activity: LeadCareActivity, updatedLeadPartial: Partial<Lead>) => Promise<void> | void;
}

export const CompleteCareActivityModal: React.FC<CompleteCareActivityModalProps> = ({
  isOpen,
  lead,
  currentUser,
  branches = [],
  existingActivities = [],
  onClose,
  onSubmitActivity
}) => {
  if (!isOpen) return null;

  // Auto determine sequence
  const currentSequence = (existingActivities.filter(a => a.leadId === lead.id).length) + 1;

  // Form State
  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Channel & Action
  const [channel, setChannel] = useState<CareChannel>('CALL');
  const [action, setAction] = useState<CareAction>('CALL_CUSTOMER');

  // Step 2: Outcome & Customer Response
  const [outcome, setOutcome] = useState<CareOutcome>('CONNECTED');
  const [responseCode, setResponseCode] = useState<CustomerResponseCode>('THINKING');

  // Step 3: Details & Objection
  const [customerResponseText, setCustomerResponseText] = useState('');
  const [objectionCode, setObjectionCode] = useState<ObjectionCode | ''>('');
  const [competitorName, setCompetitorName] = useState('');
  const [storePrice, setStorePrice] = useState<number>(lead.budget || 28990000);
  const [competitorPrice, setCompetitorPrice] = useState<number>(28200000);
  const [customerExpectedPrice, setCustomerExpectedPrice] = useState<number>(28000000);

  // Step 4: Evidence
  const [evidenceType, setEvidenceType] = useState<EvidenceType>('CALL_LOG');
  const [callDurationSeconds, setCallDurationSeconds] = useState<number>(54);
  const [conversationSnippet, setConversationSnippet] = useState<string>('Khách đã xem báo giá và phản hồi qua Zalo');
  const [screenshotFileName, setScreenshotFileName] = useState<string>('');
  const [screenshotBase64, setScreenshotBase64] = useState<string>('');

  // Step 5: Next Action
  const [nextActionType, setNextActionType] = useState<'CALL' | 'ZALO' | 'SEND_QUOTE' | 'APPOINTMENT' | 'LONG_TERM_NURTURE' | 'CLOSE_DEAL'>('CALL');
  const [nextActionAt, setNextActionAt] = useState<string>(() => {
    const tomorrow = new Date(Date.now() + 86400000);
    return `${getVietnamDateString(tomorrow)} 10:00`;
  });
  const [nextActionNotes, setNextActionNotes] = useState('');

  // Price gap calculation
  const priceGap = useMemo(() => {
    if (objectionCode === 'PRICE_GAP') {
      return storePrice - competitorPrice;
    }
    return 0;
  }, [objectionCode, storePrice, competitorPrice]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setScreenshotFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        setScreenshotBase64(reader.result as string);
        setEvidenceType('SCREENSHOT_UPLOAD');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleApplyPresetFollowUp = (preset: '2h' | 'tomorrow_morning' | 'tomorrow_afternoon' | '3days' | 'next_month') => {
    const now = new Date();
    if (preset === '2h') {
      const target = new Date(now.getTime() + 2 * 3600000);
      setNextActionAt(`${getVietnamDateString(target)} ${getVietnamTimeString(target)}`);
    } else if (preset === 'tomorrow_morning') {
      const tomorrow = new Date(now.getTime() + 86400000);
      setNextActionAt(`${getVietnamDateString(tomorrow)} 09:30`);
    } else if (preset === 'tomorrow_afternoon') {
      const tomorrow = new Date(now.getTime() + 86400000);
      setNextActionAt(`${getVietnamDateString(tomorrow)} 14:30`);
    } else if (preset === '3days') {
      const in3Days = new Date(now.getTime() + 3 * 86400000);
      setNextActionAt(`${getVietnamDateString(in3Days)} 10:00`);
    } else if (preset === 'next_month') {
      // 1st of next month for payday nurture
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const nextMonthFirst = new Date(currentYear, currentMonth + 1, 1, 10, 0);
      setNextActionAt(`${getVietnamDateString(nextMonthFirst)} 10:00`);
      setNextActionType('CALL');
      setNextActionNotes('Gọi lại đợt nhận lương đầu tháng');
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const isMeaningful = outcome === 'CONNECTED' || outcome === 'REPLIED' || outcome === 'APPOINTMENT_CREATED' || outcome === 'DEPOSIT_CREATED';
      
      const verificationStatus: EvidenceVerificationStatus = 
        evidenceType === 'SELF_REPORTED' 
          ? 'SELF_REPORTED' 
          : 'VERIFIED';

      const activityId = `CARE_${lead.id}_SEQ${currentSequence}_${Date.now()}`;
      
      const newActivity: LeadCareActivity = {
        id: activityId,
        leadId: lead.id,
        customerId: lead.customerId,
        sequence: currentSequence,
        isMeaningfulContact: isMeaningful,
        staffId: currentUser?.id || lead.assignedStaffId || 'STAFF',
        staffName: currentUser?.displayName || lead.assignedStaff || 'Chuyên viên bán hàng',
        branchId: lead.branchId || currentUser?.branchId || 'CN01',
        channel,
        action,
        outcome,
        customerResponseCode: responseCode,
        customerResponseText: customerResponseText.trim() || undefined,
        objectionCode: objectionCode ? objectionCode : undefined,
        priceDetails: objectionCode === 'PRICE_GAP' ? {
          storePrice,
          competitorPrice,
          customerExpectedPrice,
          priceGap,
          competitorName: competitorName || 'Cửa hàng khác'
        } : undefined,
        evidenceType,
        verificationStatus,
        evidenceData: {
          callDurationSeconds: channel === 'CALL' ? callDurationSeconds : undefined,
          callStartedAt: channel === 'CALL' ? getVietnamDateTimeString() : undefined,
          conversationId: (channel === 'ZALO' || channel === 'FACEBOOK') ? `CONV_${lead.phoneNormalized || lead.phone}` : undefined,
          messageCount: (channel === 'ZALO' || channel === 'FACEBOOK') ? 3 : undefined,
          screenshotUrl: screenshotBase64 || undefined,
          screenshotFileName: screenshotFileName || undefined
        },
        nextActionType,
        nextActionAt,
        nextActionNotes: nextActionNotes.trim() || undefined,
        createdAt: getVietnamDateTimeString()
      };

      // Compute updated Lead careStatus
      let nextCareStatus = lead.careStatus || 'CARE_1_PENDING';
      if (currentSequence === 1) nextCareStatus = 'CARE_1_DONE';
      else if (currentSequence === 2) nextCareStatus = 'CARE_2_DONE';
      else if (currentSequence >= 3) nextCareStatus = 'CARE_3_DONE';

      if (nextActionType === 'LONG_TERM_NURTURE' || outcome === 'LOST_NOT_INTERESTED') {
        nextCareStatus = 'LONG_TERM_NURTURE';
      }

      // Compute Care Quality Score
      let qualityScore = 30; // base score
      if (isMeaningful) qualityScore += 25;
      if (verificationStatus === 'VERIFIED') qualityScore += 20;
      if (customerResponseText.trim().length > 10) qualityScore += 15;
      if (nextActionAt) qualityScore += 10;
      qualityScore = Math.min(100, qualityScore);

      const leadUpdate: Partial<Lead> = {
        careStatus: nextCareStatus,
        careAttempts: (lead.careAttempts || 0) + 1,
        meaningfulCareCount: (lead.meaningfulCareCount || 0) + (isMeaningful ? 1 : 0),
        careQualityScore: qualityScore,
        lastCustomerResponse: customerResponseText || responseCode,
        lastCustomerResponseCode: responseCode,
        lastEvidenceType: evidenceType,
        lastCareOutcome: outcome,
        lastCareAt: getVietnamDateTimeString(),
        lastContactedAt: getVietnamDateTimeString(),
        nextActionAt: nextActionAt || lead.nextActionAt,
        nextActionNotes: nextActionNotes || lead.nextActionNotes,
        notes: lead.notes 
          ? `${lead.notes}\n[L${currentSequence} ${getVietnamTimeString()}]: ${customerResponseText || responseCode}` 
          : `[L${currentSequence} ${getVietnamTimeString()}]: ${customerResponseText || responseCode}`
      };

      if (responseCode === 'WILL_VISIT_STORE' || outcome === 'APPOINTMENT_CREATED') {
        leadUpdate.status = 'appointment_scheduled';
      } else if (responseCode === 'READY_TO_BUY' || outcome === 'DEPOSIT_CREATED') {
        leadUpdate.status = 'deposit';
      }

      await onSubmitActivity(newActivity, leadUpdate);
      onClose();
    } catch (err: any) {
      console.error('Error submitting care activity:', err);
      alert(`Lỗi ghi nhận chăm sóc: ${err.message || 'Vui lòng thử lại'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 via-[#FF4B16] to-amber-500 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center font-black text-base shadow-inner">
              L{currentSequence}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-black tracking-tight">Ghi Nhận Chăm Sóc Lần {currentSequence}</h3>
                <span className="px-2 py-0.5 rounded-full bg-white/25 text-[10px] font-bold">Bằng chứng xác thực</span>
              </div>
              <p className="text-xs text-white/90 font-medium">
                {lead.name} • {lead.phone} • {lead.interestedModel}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="bg-zinc-50 border-b border-zinc-200 px-5 py-2.5 flex items-center justify-between text-xs">
          {[
            { num: 1, label: 'Kênh & Hành Động' },
            { num: 2, label: 'Kết Quả' },
            { num: 3, label: 'Phản Hồi' },
            { num: 4, label: 'Bằng Chứng' },
            { num: 5, label: 'Việc Kế Tiếp' }
          ].map((s) => (
            <div 
              key={s.num} 
              className={`flex items-center space-x-1.5 cursor-pointer font-bold ${
                step === s.num 
                  ? 'text-[#FF4B16]' 
                  : step > s.num 
                    ? 'text-emerald-600' 
                    : 'text-zinc-400'
              }`}
              onClick={() => setStep(s.num)}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                step === s.num 
                  ? 'bg-[#FF4B16] text-white' 
                  : step > s.num 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-zinc-200 text-zinc-600'
              }`}>
                {step > s.num ? '✓' : s.num}
              </div>
              <span className="hidden sm:inline text-[11px]">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* STEP 1: Channel & Action */}
          {step === 1 && (
            <div className="space-y-4 animate-fadeIn">
              <div>
                <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block mb-2">
                  1. Kênh tiếp xúc khách hàng
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: 'CALL', label: 'Gọi Điện Thoại', icon: Phone, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
                    { id: 'ZALO', label: 'Nhắn Zalo', icon: MessageSquare, color: 'text-blue-600 bg-blue-50 border-blue-200' },
                    { id: 'FACEBOOK', label: 'Messenger FB', icon: Send, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
                    { id: 'SMS', label: 'Tin Nhắn SMS', icon: MessageSquare, color: 'text-amber-600 bg-amber-50 border-amber-200' },
                    { id: 'IN_PERSON', label: 'Gặp Showroom', icon: Building2, color: 'text-purple-600 bg-purple-50 border-purple-200' },
                    { id: 'TIKTOK', label: 'TikTok Chat', icon: Sparkles, color: 'text-pink-600 bg-pink-50 border-pink-200' }
                  ].map((ch) => {
                    const Icon = ch.icon;
                    const isSelected = channel === ch.id;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => {
                          setChannel(ch.id as CareChannel);
                          if (ch.id === 'CALL') setAction('CALL_CUSTOMER');
                          else if (ch.id === 'IN_PERSON') setAction('STORE_VISIT');
                          else setAction('SEND_MESSAGE');
                        }}
                        className={`p-3 rounded-2xl border text-left flex flex-col space-y-1.5 transition-all cursor-pointer ${
                          isSelected 
                            ? `${ch.color} ring-2 ring-[#FF4B16] font-bold shadow-xs` 
                            : 'bg-white border-zinc-200 hover:bg-zinc-50 text-zinc-700'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-xs">{ch.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block mb-2">
                  2. Loại hành động thực hiện
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'CALL_CUSTOMER', label: 'Gọi tư vấn sản phẩm' },
                    { id: 'SEND_MESSAGE', label: 'Gửi tin nhắn tư vấn' },
                    { id: 'SEND_QUOTE', label: 'Gửi bảng báo giá chi tiết' },
                    { id: 'SEND_PRODUCT', label: 'Gửi ảnh/video thực tế máy' },
                    { id: 'BOOK_APPOINTMENT', label: 'Hẹn lịch trải nghiệm tại shop' },
                    { id: 'STORE_VISIT', label: 'Tiếp đón tại showroom' }
                  ].map((act) => (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => setAction(act.id as CareAction)}
                      className={`p-2.5 rounded-xl border text-left font-medium transition-all cursor-pointer ${
                        action === act.id 
                          ? 'border-[#FF4B16] bg-orange-50/50 text-[#FF4B16] font-bold' 
                          : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700'
                      }`}
                    >
                      {act.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Outcome & Response */}
          {step === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <div>
                <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block mb-2">
                  1. Kết quả kết nối
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'CONNECTED', label: 'Đã trao đổi trực tiếp', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                    { id: 'REPLIED', label: 'Khách đã nhắn lại', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
                    { id: 'APPOINTMENT_CREATED', label: 'Đã chốt lịch hẹn', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
                    { id: 'DEPOSIT_CREATED', label: 'Đã chốt cọc giữ máy', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
                    { id: 'NO_ANSWER', label: 'Không nghe máy', badge: 'bg-zinc-100 text-zinc-700 border-zinc-200' },
                    { id: 'BUSY', label: 'Máy bận / Thuê bao', badge: 'bg-zinc-100 text-zinc-700 border-zinc-200' },
                    { id: 'SEEN_NO_REPLY', label: 'Đã xem chưa trả lời', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
                    { id: 'LOST_NOT_INTERESTED', label: 'Khách không có nhu cầu', badge: 'bg-rose-50 text-rose-700 border-rose-200' }
                  ].map((out) => (
                    <button
                      key={out.id}
                      type="button"
                      onClick={() => setOutcome(out.id as CareOutcome)}
                      className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                        outcome === out.id 
                          ? `${out.badge} ring-2 ring-[#FF4B16]` 
                          : 'bg-white border-zinc-200 hover:bg-zinc-50 text-zinc-700'
                      }`}
                    >
                      {out.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block mb-2">
                  2. Trạng thái phản hồi của khách hàng
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'READY_TO_BUY', label: '🔥 Sẵn sàng mua ngay' },
                    { id: 'WILL_VISIT_STORE', label: '📍 Hẹn sẽ ghé showroom xem' },
                    { id: 'THINKING', label: '🤔 Cần suy nghĩ thêm' },
                    { id: 'COMPARING_PRICE', label: '🏷️ Đang so sánh giá nơi khác' },
                    { id: 'WAITING_SALARY', label: '💰 Đợi lương / Tài chính' },
                    { id: 'ASK_TRADE_IN', label: '🔄 Quan tâm thu cũ đổi mới' },
                    { id: 'ASK_INSTALLMENT', label: '💳 Muốn trả góp duyệt nhanh' },
                    { id: 'NEED_FAMILY_CONSULT', label: '👨‍👩‍👧 Cần hỏi ý kiến người thân' },
                    { id: 'BOUGHT_OTHER_STORE', label: '❌ Đã mua ở chỗ khác' }
                  ].map((resp) => (
                    <button
                      key={resp.id}
                      type="button"
                      onClick={() => {
                        setResponseCode(resp.id as CustomerResponseCode);
                        if (resp.id === 'COMPARING_PRICE') setObjectionCode('PRICE_GAP');
                      }}
                      className={`p-2.5 rounded-xl border text-left font-semibold transition-all cursor-pointer ${
                        responseCode === resp.id 
                          ? 'border-[#FF4B16] bg-orange-50 text-[#FF4B16] font-bold' 
                          : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700'
                      }`}
                    >
                      {resp.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Customer Feedback & Price Gap */}
          {step === 3 && (
            <div className="space-y-4 animate-fadeIn">
              <div>
                <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block mb-1.5">
                  Chi tiết nội dung trao đổi & phản hồi từ khách
                </label>
                <textarea
                  rows={3}
                  value={customerResponseText}
                  onChange={e => setCustomerResponseText(e.target.value)}
                  placeholder="Ví dụ: Khách nói đang phân vân bản 256GB vs 512GB màu Desert, hỏi thêm gói bảo hành VIP 1 đổi 1 trong 12 tháng..."
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-xs text-zinc-900 focus:outline-none focus:border-[#FF4B16]"
                />
              </div>

              {responseCode === 'COMPARING_PRICE' && (
                <div className="bg-orange-50/70 border border-orange-200 rounded-2xl p-3.5 space-y-3">
                  <div className="flex items-center space-x-2 text-xs font-bold text-orange-900">
                    <DollarSign className="w-4 h-4 text-[#FF4B16]" />
                    <span>Phân tích chênh lệch giá đối thủ (Price Gap)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-[11px] text-zinc-500 font-medium">Tên đối thủ so sánh</span>
                      <input 
                        type="text" 
                        value={competitorName}
                        onChange={e => setCompetitorName(e.target.value)}
                        placeholder="VD: ShopDunk, HoangHa..."
                        className="w-full mt-1 p-2 bg-white border border-zinc-200 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-zinc-500 font-medium">Giá PhoneHouse (VNĐ)</span>
                      <input 
                        type="number" 
                        value={storePrice}
                        onChange={e => setStorePrice(Number(e.target.value))}
                        className="w-full mt-1 p-2 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-zinc-500 font-medium">Giá đối thủ (VNĐ)</span>
                      <input 
                        type="number" 
                        value={competitorPrice}
                        onChange={e => setCompetitorPrice(Number(e.target.value))}
                        className="w-full mt-1 p-2 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-rose-600"
                      />
                    </div>
                  </div>
                  {priceGap > 0 && (
                    <div className="text-xs font-bold text-rose-700 bg-rose-50 p-2 rounded-xl border border-rose-200 flex items-center justify-between">
                      <span>Mức giá PhoneHouse cao hơn đối thủ:</span>
                      <span>+{priceGap.toLocaleString('vi-VN')} đ</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Evidence */}
          {step === 4 && (
            <div className="space-y-4 animate-fadeIn">
              <div>
                <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block mb-2">
                  Hình thức bằng chứng xác thực (Evidence)
                </label>
                <div className="grid grid-cols-2 gap-2.5 text-xs mb-3">
                  {[
                    { id: 'CALL_LOG', label: '☎️ Nhật ký cuộc gọi', desc: 'Ghi nhận thời lượng & giờ gọi' },
                    { id: 'CONVERSATION_ATTACHED', label: '💬 Hội thoại Chat tự động', desc: 'Trích xuất ID tin nhắn Zalo/FB' },
                    { id: 'SCREENSHOT_UPLOAD', label: '🖼️ Tải ảnh chụp màn hình', desc: 'Ảnh chat/báo giá từ Zalo cá nhân' },
                    { id: 'SELF_REPORTED', label: '⚠️ Tự khai (Chưa có bằng chứng)', desc: 'Ghi chú cho quản lý kiểm duyệt' }
                  ].map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setEvidenceType(ev.id as EvidenceType)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        evidenceType === ev.id 
                          ? 'border-[#FF4B16] bg-orange-50/50 text-[#FF4B16] ring-1 ring-[#FF4B16] font-bold' 
                          : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700'
                      }`}
                    >
                      <div className="font-bold text-xs mb-0.5">{ev.label}</div>
                      <div className="text-[11px] text-zinc-500 font-normal">{ev.desc}</div>
                    </button>
                  ))}
                </div>

                {evidenceType === 'CALL_LOG' && (
                  <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-900">Thời lượng cuộc gọi đã ghi nhận:</span>
                      <span className="font-black text-emerald-700">{callDurationSeconds} giây ({Math.floor(callDurationSeconds/60)}p {callDurationSeconds%60}s)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input 
                        type="range" 
                        min="10" 
                        max="300" 
                        value={callDurationSeconds}
                        onChange={e => setCallDurationSeconds(Number(e.target.value))}
                        className="w-full accent-emerald-600"
                      />
                    </div>
                    <p className="text-[11px] text-emerald-700">✓ Đã xác thực thời gian bắt đầu gọi: {getVietnamDateTimeString()}</p>
                  </div>
                )}

                {evidenceType === 'SCREENSHOT_UPLOAD' && (
                  <div className="p-4 border-2 border-dashed border-zinc-300 hover:border-[#FF4B16] rounded-2xl text-center space-y-2 bg-zinc-50 transition-colors">
                    <Upload className="w-6 h-6 text-zinc-400 mx-auto" />
                    <div className="text-xs font-bold text-zinc-700">
                      {screenshotFileName ? `Đã chọn: ${screenshotFileName}` : 'Chọn ảnh chụp màn hình chat Zalo/Tin nhắn'}
                    </div>
                    <label className="inline-block px-3 py-1.5 bg-[#FF4B16] text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-[#E94312]">
                      Duyệt ảnh từ máy
                      <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: Next Action */}
          {step === 5 && (
            <div className="space-y-4 animate-fadeIn">
              <div>
                <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block mb-2">
                  1. Hành động tiếp theo cần thực hiện (Next Best Action)
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    { id: 'CALL', label: 'Gọi lại tư vấn' },
                    { id: 'ZALO', label: 'Nhắn Zalo chăm sóc' },
                    { id: 'SEND_QUOTE', label: 'Gửi bảng giá mới' },
                    { id: 'APPOINTMENT', label: 'Đón khách tại shop' },
                    { id: 'LONG_TERM_NURTURE', label: 'Chăm sóc dài hạn' },
                    { id: 'CLOSE_DEAL', label: 'Chốt đơn xuất POS' }
                  ].map((nAct) => (
                    <button
                      key={nAct.id}
                      type="button"
                      onClick={() => setNextActionType(nAct.id as any)}
                      className={`p-2.5 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                        nextActionType === nAct.id 
                          ? 'border-[#FF4B16] bg-orange-50 text-[#FF4B16]' 
                          : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700'
                      }`}
                    >
                      {nAct.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block mb-1.5">
                  2. Thời điểm thực hiện hẹn trước (SLA)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <button 
                    type="button" 
                    onClick={() => handleApplyPresetFollowUp('2h')}
                    className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-orange-100 text-zinc-700 hover:text-orange-900 text-xs font-semibold cursor-pointer"
                  >
                    +2 Giờ sau
                  </button>
                  <button 
                    type="button" 
                    onClick={() => handleApplyPresetFollowUp('tomorrow_morning')}
                    className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-orange-100 text-zinc-700 hover:text-orange-900 text-xs font-semibold cursor-pointer"
                  >
                    Sáng mai (09:30)
                  </button>
                  <button 
                    type="button" 
                    onClick={() => handleApplyPresetFollowUp('tomorrow_afternoon')}
                    className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-orange-100 text-zinc-700 hover:text-orange-900 text-xs font-semibold cursor-pointer"
                  >
                    Chiều mai (14:30)
                  </button>
                  <button 
                    type="button" 
                    onClick={() => handleApplyPresetFollowUp('3days')}
                    className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-orange-100 text-zinc-700 hover:text-orange-900 text-xs font-semibold cursor-pointer"
                  >
                    3 Ngày sau
                  </button>
                  <button 
                    type="button" 
                    onClick={() => handleApplyPresetFollowUp('next_month')}
                    className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-orange-100 text-zinc-700 hover:text-orange-900 text-xs font-semibold cursor-pointer"
                  >
                    Đầu tháng (Đợi lương)
                  </button>
                </div>
                <input
                  type="text"
                  value={nextActionAt}
                  onChange={e => setNextActionAt(e.target.value)}
                  placeholder="YYYY-MM-DD HH:mm"
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800 focus:outline-none focus:border-[#FF4B16]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block mb-1">
                  Ghi chú cho lần hành động tiếp theo
                </label>
                <input
                  type="text"
                  value={nextActionNotes}
                  onChange={e => setNextActionNotes(e.target.value)}
                  placeholder="VD: Kiểm tra màu Desert có sẵn tại kho trước khi gọi lại..."
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:border-[#FF4B16]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="bg-zinc-50 border-t border-zinc-200 px-5 py-3.5 flex items-center justify-between">
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="px-3.5 py-2 rounded-xl bg-white border border-zinc-200 hover:bg-zinc-100 text-xs font-bold text-zinc-700 flex items-center space-x-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Quay lại</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl bg-white border border-zinc-200 hover:bg-zinc-100 text-xs font-bold text-zinc-600 cursor-pointer"
              >
                Hủy
              </button>
            )}
          </div>

          <div>
            {step < 5 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="px-5 py-2 rounded-xl bg-[#FF4B16] hover:bg-[#E94312] text-white text-xs font-black flex items-center space-x-1.5 cursor-pointer shadow-sm"
              >
                <span>Tiếp tục</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmit}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#FF4B16] to-orange-500 hover:opacity-95 text-white text-xs font-black flex items-center space-x-2 cursor-pointer shadow-md disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Đang lưu...' : `Hoàn tất Lần ${currentSequence}`}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
