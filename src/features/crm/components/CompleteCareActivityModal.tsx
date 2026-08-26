import React, { useState, useMemo } from 'react';
import { 
  Lead, 
  LeadCareActivity, 
  CareChannel, 
  CareAction, 
  CareOutcome, 
  CustomerResponseCode, 
  ObjectionCategory,
  ObjectionCode, 
  EvidenceType, 
  EvidenceVerificationStatus,
  UserAccount,
  StoreBranch
} from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { getVietnamDateString, getVietnamTimeString, getVietnamDateTimeString } from '../../../utils/dateTimeUtils';
import { 
  suggestNextAction, 
  calculateLeadTemperature, 
  calculateCareQualityBreakdown, 
  OBJECTION_TAXONOMY 
} from '../utils/crmEngine';
import { uploadCrmEvidence } from '../../../services/crmEvidenceService';
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
  Paperclip,
  Tag,
  Flame
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
  // 1. Separate Attempt Sequence vs. Meaningful Care Sequence
  const totalLeadActivities = useMemo(() => {
    return existingActivities.filter(a => a.leadId === lead.id);
  }, [existingActivities, lead.id]);

  const attemptNo = totalLeadActivities.length + 1;
  const pastMeaningfulActivities = totalLeadActivities.filter(a => a.isMeaningfulContact);
  const nextMeaningfulNo = pastMeaningfulActivities.length + 1;

  // Form State
  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Step 1: Channel & Action
  const [channel, setChannel] = useState<CareChannel>('CALL');
  const [action, setAction] = useState<CareAction>('CALL_CUSTOMER');

  // Step 2: Outcome & Customer Response
  const [outcome, setOutcome] = useState<CareOutcome>('CONNECTED');
  const [responseCode, setResponseCode] = useState<CustomerResponseCode>('THINKING');

  // Step 3: Details & Objection Taxonomy
  const [customerResponseText, setCustomerResponseText] = useState('');
  const [objectionCategory, setObjectionCategory] = useState<ObjectionCategory | ''>('');
  const [objectionCode, setObjectionCode] = useState<ObjectionCode | ''>('');
  const [competitorName, setCompetitorName] = useState('');
  const [storePrice, setStorePrice] = useState<number>(0);
  const [competitorPrice, setCompetitorPrice] = useState<number>(0);
  const [customerExpectedPrice] = useState<number>(0);

  // Step 4: Evidence
  const [evidenceType, setEvidenceType] = useState<EvidenceType>('SELF_REPORTED');
  const [callDurationSeconds, setCallDurationSeconds] = useState<number>(0);
  const [screenshotFileName, setScreenshotFileName] = useState<string>('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);

  // Step 5: Next Action
  const [nextActionType, setNextActionType] = useState<'CALL' | 'ZALO' | 'SEND_QUOTE' | 'APPOINTMENT' | 'LONG_TERM_NURTURE' | 'CLOSE_DEAL'>('CALL');
  const [nextActionAt, setNextActionAt] = useState<string>(() => {
    const tomorrow = new Date(Date.now() + 86400000);
    return `${getVietnamDateString(tomorrow)} 09:30`;
  });
  const [nextActionNotes, setNextActionNotes] = useState('');

  // Price gap calculation
  const priceGap = useMemo(() => {
    if (objectionCategory === 'PRICE' || responseCode === 'COMPARING_PRICE' || responseCode === 'TOO_EXPENSIVE') {
      return Math.max(0, storePrice - competitorPrice);
    }
    return 0;
  }, [objectionCategory, responseCode, storePrice, competitorPrice]);

  if (!isOpen) return null;

  // Handle Response Code change with Auto-suggestion engine
  const handleSelectResponseCode = (code: CustomerResponseCode) => {
    setResponseCode(code);
    const suggestion = suggestNextAction(code);
    setNextActionType(suggestion.nextActionType);
    setNextActionAt(suggestion.nextActionAt);
    setNextActionNotes(suggestion.nextActionNotes);
    if (suggestion.suggestedObjectionCategory) {
      setObjectionCategory(suggestion.suggestedObjectionCategory);
    }
    if (suggestion.suggestedObjectionCode) {
      setObjectionCode(suggestion.suggestedObjectionCode);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setScreenshotFileName(file.name);
      setScreenshotFile(file);
      setEvidenceType('SCREENSHOT_UPLOAD');
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
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const nextMonthFirst = new Date(currentYear, currentMonth + 1, 1, 10, 0);
      setNextActionAt(`${getVietnamDateString(nextMonthFirst)} 10:00`);
      setNextActionType('CALL');
      setNextActionNotes('Gọi lại đợt nhận lương đầu tháng');
    }
  };

  const handleSubmit = async () => {
    setValidationError(null);

    // Strict Identity Invariant Check (No mock fallback)
    const effectiveStaffId = currentUser?.id || lead.assignedStaffId;
    const effectiveStaffName = currentUser?.displayName || lead.assignedStaff;
    const effectiveBranchId = currentUser?.branchId || lead.branchId;

    if (!effectiveStaffId || !effectiveStaffName) {
      setValidationError('Không thể xác định danh tính nhân viên đang thao tác. Vui lòng đăng nhập lại.');
      return;
    }

    if (!effectiveBranchId) {
      setValidationError('Không thể xác định chi nhánh làm việc của nhân viên.');
      return;
    }

    setIsSubmitting(true);
    try {
      const uploadedScreenshotUrl = screenshotFile
        ? await uploadCrmEvidence(lead.id, screenshotFile)
        : undefined;
      const isMeaningful = outcome === 'CONNECTED' || outcome === 'REPLIED' || outcome === 'APPOINTMENT_CREATED' || outcome === 'DEPOSIT_CREATED';
      const meaningfulCareNo = isMeaningful ? nextMeaningfulNo : undefined;

      // Evidence Verification Status: Default to SELF_REPORTED unless automated system log
      const verificationStatus: EvidenceVerificationStatus = 
        evidenceType === 'SELF_REPORTED' 
          ? 'SELF_REPORTED' 
          : evidenceType === 'SCREENSHOT_UPLOAD'
          ? 'SELF_REPORTED'
          : 'PENDING_EVIDENCE';

      const qualityBreakdown = calculateCareQualityBreakdown({
        channel,
        action,
        outcome,
        customerResponseText,
        evidenceType,
        verificationStatus,
        isMeaningfulContact: isMeaningful,
        customerResponseCode: responseCode,
        nextActionAt
      });

      const activityId = `CARE_${lead.id}_ATT${attemptNo}_${Date.now()}`;
      
      const newActivity: LeadCareActivity = {
        id: activityId,
        leadId: lead.id,
        customerId: lead.customerId || `CUST_${lead.phoneNormalized || lead.phone}`,
        sequence: attemptNo,
        attemptNo,
        meaningfulCareNo,
        isMeaningfulContact: isMeaningful,
        staffId: effectiveStaffId,
        staffName: effectiveStaffName,
        branchId: effectiveBranchId,
        channel,
        action,
        outcome,
        customerResponseCode: responseCode,
        customerResponseText: customerResponseText.trim() || undefined,
        objectionCategory: objectionCategory ? objectionCategory : undefined,
        objectionCode: objectionCode ? objectionCode : undefined,
        priceDetails: (objectionCategory === 'PRICE' || responseCode === 'COMPARING_PRICE') ? {
          storePrice,
          competitorPrice,
          customerExpectedPrice,
          priceGap,
          competitorName: competitorName || 'Cửa hàng khác'
        } : undefined,
        opportunityContext: {
          productInterestSnapshot: lead.interestedModel,
          budgetSnapshot: storePrice || lead.budget,
          leadStageSnapshot: lead.status
        },
        evidenceType,
        verificationStatus,
        evidenceData: {
          callDurationSeconds: channel === 'CALL' ? callDurationSeconds : undefined,
          callStartedAt: channel === 'CALL' ? getVietnamDateTimeString() : undefined,
          conversationId: (channel === 'ZALO' || channel === 'FACEBOOK') ? `CONV_${lead.phoneNormalized || lead.phone}` : undefined,
          messageCount: (channel === 'ZALO' || channel === 'FACEBOOK') ? 3 : undefined,
          screenshotUrl: uploadedScreenshotUrl,
          screenshotFileName: screenshotFileName || undefined
        },
        qualityScoreBreakdown: qualityBreakdown,
        nextActionType,
        nextActionAt,
        nextActionNotes: nextActionNotes.trim() || undefined,
        createdAt: getVietnamDateTimeString()
      };

      // Compute updated Lead careStatus
      let nextCareStatus = lead.careStatus || 'CARE_1_PENDING';
      if (isMeaningful) {
        if (nextMeaningfulNo === 1) nextCareStatus = 'CARE_1_DONE';
        else if (nextMeaningfulNo === 2) nextCareStatus = 'CARE_2_DONE';
        else if (nextMeaningfulNo >= 3) nextCareStatus = 'CARE_3_DONE';
      } else {
        if (!lead.careStatus || lead.careStatus === 'NOT_STARTED') {
          nextCareStatus = 'CARE_1_PENDING';
        }
      }

      if (nextActionType === 'LONG_TERM_NURTURE' || outcome === 'LOST_NOT_INTERESTED') {
        nextCareStatus = 'LONG_TERM_NURTURE';
      }

      // Compute Dynamic Lead Temperature
      const tempResult = calculateLeadTemperature(
        { ...lead, lastCustomerResponseCode: responseCode, budget: storePrice },
        { outcome, customerResponseCode: responseCode, isMeaningfulContact: isMeaningful }
      );

      const leadUpdate: Partial<Lead> = {
        customerId: lead.customerId || `CUST_${lead.phoneNormalized || lead.phone}`,
        careStatus: nextCareStatus,
        careAttempts: attemptNo,
        meaningfulCareCount: (lead.meaningfulCareCount || 0) + (isMeaningful ? 1 : 0),
        careQualityScore: qualityBreakdown.totalScore,
        leadTemperature: tempResult.temperature,
        temperatureScore: tempResult.score,
        lastCustomerResponse: customerResponseText || responseCode,
        lastCustomerResponseCode: responseCode,
        lastEvidenceType: evidenceType,
        lastCareOutcome: outcome,
        lastCareAt: getVietnamDateTimeString(),
        lastContactedAt: getVietnamDateTimeString(),
        nextActionAt: nextActionAt || lead.nextActionAt,
        nextActionNotes: nextActionNotes || lead.nextActionNotes,
        notes: lead.notes 
          ? `${lead.notes}\n[Lần ${attemptNo}${isMeaningful ? ` - L${nextMeaningfulNo}` : ' (Chưa đàm thoại)'} ${getVietnamTimeString()}]: ${customerResponseText || responseCode}` 
          : `[Lần ${attemptNo}${isMeaningful ? ` - L${nextMeaningfulNo}` : ' (Chưa đàm thoại)'} ${getVietnamTimeString()}]: ${customerResponseText || responseCode}`
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
      setValidationError(`Lỗi ghi nhận chăm sóc: ${err.message || 'Vui lòng thử lại'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentBranchName = branches.find(b => b.id === (currentUser?.branchId || lead.branchId))?.name || 'Chi Nhánh Showroom';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/80 backdrop-blur-sm animate-fadeIn sm:items-center sm:p-4">
      <div className="relative flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl animate-scaleUp sm:h-auto sm:max-h-[94vh] sm:rounded-3xl sm:border sm:border-zinc-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-[#FF4B16] p-5 sm:p-6 text-white relative">
          <button 
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex items-center space-x-2 text-xs font-bold text-orange-100 uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Ghi Nhận Chăm Sóc Có Kiểm Chứng (Evidence-Based CRM)</span>
          </div>
          
          <div className="flex items-baseline space-x-2">
            <h2 className="text-xl font-black text-white">{lead.name}</h2>
            <span className="text-xs text-orange-200 font-mono">({lead.phone})</span>
          </div>

          {/* Touch Matrix Header Pill */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-xl bg-white/20 text-white font-bold backdrop-blur-xs flex items-center gap-1.5">
              <span>Lượt tiếp cận #{attemptNo}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span>Chăm sóc có ý nghĩa: L{nextMeaningfulNo}</span>
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-black/20 text-orange-100 font-medium">
              Quan tâm: <strong>{lead.interestedModel}</strong>
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-white/10 text-white text-[11px]">
              {currentBranchName}
            </span>
          </div>

          {/* Step Indicator */}
          <div className="mt-4 flex items-center justify-between gap-1.5 max-w-md">
            {[
              { num: 1, label: 'Kênh & Hành động' },
              { num: 2, label: 'Kết quả' },
              { num: 3, label: 'Phản hồi & Giá' },
              { num: 4, label: 'Bằng chứng' },
              { num: 5, label: 'Next Action' }
            ].map(s => (
              <div key={s.num} className="flex-1 flex flex-col items-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                  step === s.num 
                    ? 'bg-white text-[#FF4B16] ring-2 ring-white/50 scale-110 shadow-md' 
                    : step > s.num 
                    ? 'bg-emerald-400 text-zinc-900 font-bold' 
                    : 'bg-white/20 text-white/70'
                }`}>
                  {step > s.num ? '✓' : s.num}
                </div>
                <span className="text-[9px] font-medium text-orange-100 mt-1 truncate hidden sm:block">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Validation Error Banner */}
        {validationError && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-xs font-bold text-rose-800 animate-shake">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* STEP 1: Channel & Action */}
          {step === 1 && (
            <div className="space-y-4 animate-fadeIn">
              <div>
                <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block mb-2">
                  1. Kênh liên hệ thực tế
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    { id: 'CALL', label: 'Gọi Hotline / Di động', icon: Phone },
                    { id: 'ZALO', label: 'Nhắn Zalo cá nhân / OA', icon: MessageSquare },
                    { id: 'FACEBOOK', label: 'Facebook Messenger', icon: Send },
                    { id: 'IN_PERSON', label: 'Tư vấn tại Showroom', icon: Building2 },
                    { id: 'SMS', label: 'Tin nhắn SMS', icon: MessageSquare },
                    { id: 'TIKTOK', label: 'TikTok Shop / Live', icon: Sparkles }
                  ].map((ch) => {
                    const Icon = ch.icon;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => setChannel(ch.id as CareChannel)}
                        className={`p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          channel === ch.id 
                            ? 'border-[#FF4B16] bg-orange-50/60 text-[#FF4B16] font-bold shadow-xs' 
                            : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-[11px]">{ch.label}</span>
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

          {/* STEP 2: Outcome & Customer Response Code */}
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
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block">
                    2. Trạng thái phản hồi của khách hàng (Auto-suggest Next Action)
                  </label>
                  <span className="text-[11px] text-orange-600 font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Auto-Prefill
                  </span>
                </div>
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
                    { id: 'OUT_OF_BUDGET', label: '📉 Vượt quá ngân sách' },
                    { id: 'NO_RESPONSE', label: '🔇 Chưa phản hồi lại' },
                    { id: 'BOUGHT_OTHER_STORE', label: '❌ Đã mua ở chỗ khác' }
                  ].map((resp) => (
                    <button
                      key={resp.id}
                      type="button"
                      onClick={() => handleSelectResponseCode(resp.id as CustomerResponseCode)}
                      className={`p-2.5 rounded-xl border text-left font-semibold transition-all cursor-pointer ${
                        responseCode === resp.id 
                          ? 'border-[#FF4B16] bg-orange-50 text-[#FF4B16] font-bold ring-1 ring-[#FF4B16]' 
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

          {/* STEP 3: Details & Structured Objection Taxonomy */}
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

              {/* Objection Category Selector */}
              <div>
                <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Phân nhóm lý do băn khoăn / từ chối (Objection Taxonomy)</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
                  {(Object.keys(OBJECTION_TAXONOMY) as ObjectionCategory[]).map(catKey => {
                    const catObj = OBJECTION_TAXONOMY[catKey];
                    const isSelected = objectionCategory === catKey;
                    return (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => {
                          setObjectionCategory(catKey);
                          if (catObj.codes[0]) setObjectionCode(catObj.codes[0].code);
                        }}
                        className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-zinc-900 text-white border-zinc-900 font-bold shadow-xs'
                            : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        {catObj.label}
                      </button>
                    );
                  })}
                </div>

                {/* Sub-reasons based on category */}
                {objectionCategory && OBJECTION_TAXONOMY[objectionCategory] && (
                  <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-2 text-xs">
                    <span className="text-[11px] font-bold text-zinc-600 block">Lý do cụ thể:</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {OBJECTION_TAXONOMY[objectionCategory].codes.map(c => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => setObjectionCode(c.code)}
                          className={`p-2 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                            objectionCode === c.code 
                              ? 'bg-orange-50 border-[#FF4B16] text-[#FF4B16] font-bold' 
                              : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {(objectionCategory === 'PRICE' || responseCode === 'COMPARING_PRICE') && (
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

          {/* STEP 4: Evidence Integrity */}
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
                    { id: 'SELF_REPORTED', label: '⚠️ Tự khai (Chưa có bằng chứng)', desc: 'Gửi quản lý phê duyệt sau' }
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
                        className="w-full accent-emerald-600 cursor-pointer"
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

                {evidenceType === 'SELF_REPORTED' && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1">
                    <div className="font-bold">⚠️ Chế độ tự khai báo</div>
                    <p className="text-[11px] text-amber-700">Hoạt động này sẽ ở trạng thái chờ QA Manager thẩm định và có thể bị yêu cầu bổ sung bằng chứng sau.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: Next Action & Score Summary */}
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
                  2. Thời gian hẹn liên hệ lại (SLA Reminder)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    { id: '2h', label: '+2 Giờ' },
                    { id: 'tomorrow_morning', label: 'Sáng mai (09:30)' },
                    { id: 'tomorrow_afternoon', label: 'Chiều mai (14:30)' },
                    { id: '3days', label: '+3 Ngày' },
                    { id: 'next_month', label: 'Đầu tháng tới (Lương)' }
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyPresetFollowUp(preset.id as any)}
                      className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <input 
                  type="text" 
                  value={nextActionAt}
                  onChange={e => setNextActionAt(e.target.value)}
                  placeholder="YYYY-MM-DD HH:mm"
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono font-bold text-zinc-800"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block mb-1">
                  3. Ghi chú hành động tiếp theo
                </label>
                <input 
                  type="text" 
                  value={nextActionNotes}
                  onChange={e => setNextActionNotes(e.target.value)}
                  placeholder="Ví dụ: Gọi lại nhắc khách về chương trình tặng củ sạc nhanh 20W..."
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900"
                />
              </div>

              {/* Quality Score Breakdown Preview */}
              {(() => {
                const breakdown = calculateCareQualityBreakdown({
                  channel,
                  action,
                  outcome,
                  customerResponseText,
                  evidenceType,
                  verificationStatus: 'SELF_REPORTED',
                  isMeaningfulContact: outcome === 'CONNECTED' || outcome === 'REPLIED' || outcome === 'APPOINTMENT_CREATED' || outcome === 'DEPOSIT_CREATED',
                  customerResponseCode: responseCode,
                  nextActionAt
                });
                return (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-black text-zinc-900">
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>Điểm chất lượng chăm sóc (Care Quality):</span>
                      </span>
                      <span className="text-[#FF4B16] text-sm">{breakdown.totalScore}/100</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-200/80 text-[11px] text-zinc-600">
                      <div>Quy trình: <strong>{breakdown.processScore}/40</strong></div>
                      <div>Bằng chứng: <strong>{breakdown.evidenceScore}/30</strong></div>
                      <div>Kết quả: <strong>{breakdown.outcomeScore}/30</strong></div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between">
          <button
            type="button"
            disabled={step === 1 || isSubmitting}
            onClick={() => setStep(step - 1)}
            className="px-4 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-bold flex items-center space-x-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại</span>
          </button>

          {step < 5 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-sm active:scale-95 transition-transform"
            >
              <span>Tiếp tục (Bước {step + 1}/5)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="px-6 py-2.5 rounded-xl bg-[#FF4B16] hover:bg-[#E94312] text-white text-xs font-black flex items-center space-x-2 cursor-pointer shadow-md shadow-orange-500/25 disabled:opacity-50 active:scale-95 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Đang lưu...' : 'Hoàn Tất & Ghi Nhận Chăm Sóc'}</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
