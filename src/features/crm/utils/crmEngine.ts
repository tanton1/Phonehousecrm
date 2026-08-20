import { 
  Lead, 
  LeadCareActivity, 
  CustomerResponseCode, 
  ObjectionCategory, 
  ObjectionCode, 
  EvidenceVerificationStatus,
  CareOutcome,
  LeadStatus 
} from '../../../types';
import { getVietnamDateString, getVietnamTimeString } from '../../../utils/dateTimeUtils';

export interface NextActionSuggestion {
  nextActionType: 'CALL' | 'ZALO' | 'SEND_QUOTE' | 'APPOINTMENT' | 'LONG_TERM_NURTURE' | 'CLOSE_DEAL';
  nextActionAt: string;
  nextActionNotes: string;
  suggestedObjectionCategory?: ObjectionCategory;
  suggestedObjectionCode?: ObjectionCode;
}

/**
 * 1. Auto-Suggestion Matrix: Maps CustomerResponseCode to authoritative Next Actions
 */
export function suggestNextAction(responseCode: CustomerResponseCode): NextActionSuggestion {
  const now = new Date();
  
  switch (responseCode) {
    case 'READY_TO_BUY': {
      return {
        nextActionType: 'CLOSE_DEAL',
        nextActionAt: `${getVietnamDateString(now)} ${getVietnamTimeString(now)}`,
        nextActionNotes: 'Khách sẵn sàng chốt mua - Tạo đơn POS hoặc giữ cọc sản phẩm ngay'
      };
    }

    case 'WILL_VISIT_STORE': {
      const tomorrow = new Date(now.getTime() + 86400000);
      return {
        nextActionType: 'APPOINTMENT',
        nextActionAt: `${getVietnamDateString(tomorrow)} 10:00`,
        nextActionNotes: 'Tạo lịch hẹn showroom - Giữ máy trước khi khách tới trải nghiệm'
      };
    }

    case 'COMPARING_PRICE':
    case 'TOO_EXPENSIVE': {
      const in2h = new Date(now.getTime() + 2 * 3600000);
      return {
        nextActionType: 'SEND_QUOTE',
        nextActionAt: `${getVietnamDateString(in2h)} ${getVietnamTimeString(in2h)}`,
        nextActionNotes: 'Gửi báo giá so sánh cạnh tranh & CTKM trợ giá đặc quyền',
        suggestedObjectionCategory: 'PRICE',
        suggestedObjectionCode: 'COMPETITOR_CHEAPER'
      };
    }

    case 'WAITING_SALARY': {
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const nextMonthFirst = new Date(currentYear, currentMonth + 1, 1, 10, 0);
      return {
        nextActionType: 'CALL',
        nextActionAt: `${getVietnamDateString(nextMonthFirst)} 10:00`,
        nextActionNotes: 'Gọi lại đợt nhận lương đầu tháng kèm ưu đãi trả chậm',
        suggestedObjectionCategory: 'FINANCE',
        suggestedObjectionCode: 'WAITING_PAYDAY'
      };
    }

    case 'NEED_FAMILY_CONSULT': {
      const tomorrow = new Date(now.getTime() + 86400000);
      return {
        nextActionType: 'ZALO',
        nextActionAt: `${getVietnamDateString(tomorrow)} 14:30`,
        nextActionNotes: 'Gửi hình ảnh máy & thông số chi tiết qua Zalo để khách tham khảo cùng người thân',
        suggestedObjectionCategory: 'DECISION_MAKER',
        suggestedObjectionCode: 'NEED_ASK_SPOUSE'
      };
    }

    case 'ASK_TRADE_IN': {
      const in3h = new Date(now.getTime() + 3 * 3600000);
      return {
        nextActionType: 'SEND_QUOTE',
        nextActionAt: `${getVietnamDateString(in3h)} ${getVietnamTimeString(in3h)}`,
        nextActionNotes: 'Thẩm định máy cũ thu cũ đổi mới & gửi bảng giá bù chênh lệch',
        suggestedObjectionCategory: 'FINANCE',
        suggestedObjectionCode: 'TRADE_IN_VALUATION'
      };
    }

    case 'ASK_INSTALLMENT': {
      const in3h = new Date(now.getTime() + 3 * 3600000);
      return {
        nextActionType: 'SEND_QUOTE',
        nextActionAt: `${getVietnamDateString(in3h)} ${getVietnamTimeString(in3h)}`,
        nextActionNotes: 'Tư vấn gói trả góp 0% qua thẻ tín dụng hoặc CCCD',
        suggestedObjectionCategory: 'FINANCE',
        suggestedObjectionCode: 'INSTALLMENT_FEES'
      };
    }

    case 'OUT_OF_BUDGET': {
      const in3Days = new Date(now.getTime() + 3 * 86400000);
      return {
        nextActionType: 'CALL',
        nextActionAt: `${getVietnamDateString(in3Days)} 10:00`,
        nextActionNotes: 'Tư vấn dòng máy lướt 99% hoặc phiên bản dung lượng thấp hơn phù hợp túi tiền',
        suggestedObjectionCategory: 'PRODUCT',
        suggestedObjectionCode: 'WANT_DIFFERENT_MODEL'
      };
    }

    case 'NO_RESPONSE': {
      const in2h = new Date(now.getTime() + 2 * 3600000);
      return {
        nextActionType: 'CALL',
        nextActionAt: `${getVietnamDateString(in2h)} ${getVietnamTimeString(in2h)}`,
        nextActionNotes: 'Thử liên hệ lại sau 2 giờ hoặc gửi tin nhắn Zalo kèm hình ảnh máy'
      };
    }

    case 'BOUGHT_OTHER_STORE': {
      const in30Days = new Date(now.getTime() + 30 * 86400000);
      return {
        nextActionType: 'LONG_TERM_NURTURE',
        nextActionAt: `${getVietnamDateString(in30Days)} 10:00`,
        nextActionNotes: 'Khách đã mua bên ngoài - Đưa vào danh sách chăm sóc phụ kiện & bảo hành sau 30 ngày',
        suggestedObjectionCategory: 'OTHER',
        suggestedObjectionCode: 'OTHER'
      };
    }

    case 'THINKING':
    default: {
      const tomorrow = new Date(now.getTime() + 86400000);
      return {
        nextActionType: 'CALL',
        nextActionAt: `${getVietnamDateString(tomorrow)} 09:30`,
        nextActionNotes: 'Theo dõi phản hồi & giải đáp thắc mắc thêm về máy',
        suggestedObjectionCategory: 'TIMING',
        suggestedObjectionCode: 'NOT_URGENT'
      };
    }
  }
}

/**
 * 2. Lead Temperature Engine (0 - 100 Score & HOT / WARM / COLD)
 */
export function calculateLeadTemperature(
  lead: Partial<Lead>,
  lastActivity?: Partial<LeadCareActivity>
): { temperature: 'HOT' | 'WARM' | 'COLD'; score: number } {
  let score = 50; // Neutral starting score

  const respCode = lastActivity?.customerResponseCode || lead.lastCustomerResponseCode;
  if (respCode === 'READY_TO_BUY') score += 40;
  else if (respCode === 'WILL_VISIT_STORE') score += 30;
  else if (respCode === 'COMPARING_PRICE' || respCode === 'ASK_TRADE_IN' || respCode === 'ASK_INSTALLMENT') score += 15;
  else if (respCode === 'NO_RESPONSE') score -= 20;
  else if (respCode === 'BOUGHT_OTHER_STORE') score -= 40;
  else if (respCode === 'OUT_OF_BUDGET') score -= 15;

  if (lead.budget && lead.budget >= 20000000) score += 10;
  if (lead.meaningfulCareCount && lead.meaningfulCareCount >= 2) score += 10;

  // Recency factor
  if (lead.lastContactedAt) {
    const elapsedHours = (Date.now() - new Date(lead.lastContactedAt).getTime()) / 3600000;
    if (elapsedHours <= 2) score += 15;
    else if (elapsedHours <= 24) score += 5;
    else if (elapsedHours > 72) score -= 15;
  }

  // Outcome penalty
  if (lastActivity?.outcome === 'NO_ANSWER' || lastActivity?.outcome === 'BUSY') {
    score -= 10;
  }

  score = Math.max(5, Math.min(100, score));

  let temperature: 'HOT' | 'WARM' | 'COLD' = 'WARM';
  if (score >= 70) temperature = 'HOT';
  else if (score < 40) temperature = 'COLD';

  return { temperature, score };
}

/**
 * 3. Priority Ranking Engine for My Work (P0 / P1 / P2 / P3)
 */
export function calculateLeadPriority(
  lead: Lead,
  hasAppointmentToday = false
): { rank: 'P0' | 'P1' | 'P2' | 'P3'; score: number; label: string; badgeStyle: string } {
  let score = 50;

  // P0: New lead exceeding SLA or appointment in next 30-60 mins
  if (lead.status === 'new') {
    const createdAgoHours = (Date.now() - new Date(lead.createdAt).getTime()) / 3600000;
    if (createdAgoHours > 0.25) { // > 15 mins
      return {
        rank: 'P0',
        score: 98,
        label: 'P0: Lead Mới Quá SLA',
        badgeStyle: 'bg-rose-600 text-white animate-pulse shadow-md shadow-rose-500/30'
      };
    }
  }

  if (hasAppointmentToday) {
    return {
      rank: 'P1',
      score: 90,
      label: 'P1: Lịch Hẹn Hôm Nay',
      badgeStyle: 'bg-orange-600 text-white font-extrabold shadow-sm'
    };
  }

  if (lead.lastCustomerResponseCode === 'READY_TO_BUY' || lead.leadTemperature === 'HOT') {
    return {
      rank: 'P1',
      score: 85,
      label: 'P1: Khách Nóng Sẵn Sàng Mua',
      badgeStyle: 'bg-orange-500 text-white font-extrabold'
    };
  }

  // P2: Follow-up due today or L1 pending
  if (lead.careStatus === 'CARE_1_PENDING' || lead.careStatus === 'NOT_STARTED') {
    return {
      rank: 'P2',
      score: 75,
      label: 'P2: Cần Chăm Sóc L1',
      badgeStyle: 'bg-blue-600 text-white font-bold'
    };
  }

  if (lead.careStatus === 'CARE_2_PENDING' || lead.careStatus === 'CARE_3_PENDING') {
    return {
      rank: 'P2',
      score: 65,
      label: 'P2: Follow-up L2/L3',
      badgeStyle: 'bg-indigo-600 text-white font-bold'
    };
  }

  // P3: Long term nurture
  return {
    rank: 'P3',
    score: 40,
    label: 'P3: Nuôi Dưỡng Dài Hạn',
    badgeStyle: 'bg-zinc-600 text-white'
  };
}

/**
 * 4. Care Quality Score Breakdown (Process /40 + Evidence /30 + Outcome /30)
 */
export function calculateCareQualityBreakdown(activity: Partial<LeadCareActivity>): {
  processScore: number;
  evidenceScore: number;
  outcomeScore: number;
  totalScore: number;
} {
  // Process Score (Max 40)
  let processScore = 15; // Base entry
  if (activity.channel && activity.action) processScore += 10;
  if (activity.customerResponseText && activity.customerResponseText.trim().length >= 10) processScore += 10;
  if (activity.nextActionAt) processScore += 5;
  processScore = Math.min(40, processScore);

  // Evidence Score (Max 30)
  let evidenceScore = 5;
  if (activity.verificationStatus === 'MANAGER_VERIFIED') {
    evidenceScore = 30;
  } else if (activity.verificationStatus === 'SYSTEM_CAPTURED') {
    evidenceScore = 28;
  } else if (activity.evidenceType === 'SCREENSHOT_UPLOAD' && activity.evidenceData?.screenshotUrl) {
    evidenceScore = 20;
  } else if (activity.evidenceType === 'CALL_LOG' && activity.evidenceData?.callDurationSeconds && activity.evidenceData.callDurationSeconds > 10) {
    evidenceScore = 18;
  } else if (activity.evidenceType === 'CONVERSATION_ATTACHED') {
    evidenceScore = 22;
  } else if (activity.verificationStatus === 'SELF_REPORTED') {
    evidenceScore = 10;
  } else if (activity.verificationStatus === 'FLAGGED') {
    evidenceScore = 0;
  }
  evidenceScore = Math.min(30, evidenceScore);

  // Outcome Score (Max 30)
  let outcomeScore = 5;
  if (activity.outcome === 'DEPOSIT_CREATED' || activity.customerResponseCode === 'READY_TO_BUY') {
    outcomeScore = 30;
  } else if (activity.outcome === 'APPOINTMENT_CREATED' || activity.customerResponseCode === 'WILL_VISIT_STORE') {
    outcomeScore = 25;
  } else if (activity.outcome === 'CONNECTED' || activity.outcome === 'REPLIED') {
    outcomeScore = 18;
  } else if (activity.isMeaningfulContact) {
    outcomeScore = 15;
  } else if (activity.outcome === 'NO_ANSWER' || activity.outcome === 'BUSY') {
    outcomeScore = 5;
  }
  outcomeScore = Math.min(30, outcomeScore);

  const totalScore = processScore + evidenceScore + outcomeScore;
  return { processScore, evidenceScore, outcomeScore, totalScore };
}

/**
 * 5. Structured Objection Taxonomy
 */
export const OBJECTION_TAXONOMY: Record<ObjectionCategory, { label: string; codes: Array<{ code: ObjectionCode; label: string }> }> = {
  PRICE: {
    label: 'Giá & Khuyến mãi',
    codes: [
      { code: 'PRICE_TOO_HIGH', label: 'Giá sản phẩm vượt ngân sách' },
      { code: 'COMPETITOR_CHEAPER', label: 'Cửa hàng khác đang bán rẻ hơn' },
      { code: 'PRICE_GAP', label: 'Chênh lệch giá phụ kiện / bảo hành' }
    ]
  },
  PRODUCT: {
    label: 'Sản phẩm & Tồn kho',
    codes: [
      { code: 'NO_STOCK_COLOR', label: 'Hết màu mong muốn (Vàng titan, Đen...)' },
      { code: 'NO_STORAGE', label: 'Hết phiên bản dung lượng (256GB, 512GB)' },
      { code: 'WANT_DIFFERENT_MODEL', label: 'Đổi ý muốn tham khảo dòng máy khác' }
    ]
  },
  FINANCE: {
    label: 'Tài chính & Thanh toán',
    codes: [
      { code: 'NOT_ENOUGH_CASH', label: 'Chưa đủ tiền mặt ngay' },
      { code: 'INSTALLMENT_REJECTED', label: 'Hồ sơ trả góp không được duyệt' },
      { code: 'INSTALLMENT_FEES', label: 'Phí trả góp / lãi suất cao hơn mong đợi' },
      { code: 'TRADE_IN_VALUATION', label: 'Định giá máy cũ thu lại chưa vừa ý' }
    ]
  },
  DECISION_MAKER: {
    label: 'Người ra quyết định',
    codes: [
      { code: 'NEED_ASK_SPOUSE', label: 'Cần hỏi ý kiến vợ / chồng / người yêu' },
      { code: 'NEED_PARENT_APPROVAL', label: 'Cần bố mẹ đồng ý / phụ huynh thanh toán' }
    ]
  },
  TIMING: {
    label: 'Thời điểm mua hàng',
    codes: [
      { code: 'WAITING_PAYDAY', label: 'Đợi ngày nhận lương / thưởng (Đầu tháng)' },
      { code: 'NOT_URGENT', label: 'Chưa vội, đang dùng máy cũ bình thường' },
      { code: 'WAITING_FOR_PROMO', label: 'Đợi đợt Sale lớn / Flash Sale' }
    ]
  },
  COMPETITOR: {
    label: 'Đối thủ cạnh tranh',
    codes: [
      { code: 'COMPETITOR_CHEAPER', label: 'Khách chọn mua tại chuỗi bán lẻ khác' }
    ]
  },
  WARRANTY: {
    label: 'Bảo hành & Hậu mãi',
    codes: [
      { code: 'WARRANTY_TERMS', label: 'Băn khoăn chính sách 1 đổi 1 / bảo hành pin' }
    ]
  },
  OTHER: {
    label: 'Lý do khác',
    codes: [
      { code: 'OTHER', label: 'Lý do khác' }
    ]
  }
};
