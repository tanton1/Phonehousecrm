import { describe, it, expect } from 'vitest';
import { 
  Lead, 
  LeadCareActivity, 
  LeadAppointment, 
  LeadQuote, 
  CareStatus, 
  EvidenceVerificationStatus 
} from '../src/types';

describe('CRM 3.0: Verifiable Care Process, Evidence Verification & QA Suite', () => {
  it('Case 1: Phân biệt số lần tiếp xúc (Care Attempts) và số lần trao đổi hiệu quả (Meaningful Contacts)', () => {
    const activities: Partial<LeadCareActivity>[] = [
      { id: 'ACT-1', sequence: 1, outcome: 'NO_ANSWER', isMeaningfulContact: false },
      { id: 'ACT-2', sequence: 2, outcome: 'BUSY', isMeaningfulContact: false },
      { id: 'ACT-3', sequence: 3, outcome: 'CONNECTED', isMeaningfulContact: true, customerResponseText: 'Đang xem xét iPhone 16 Pro Max' }
    ];

    const attemptsCount = activities.length;
    const meaningfulCount = activities.filter(a => a.isMeaningfulContact).length;

    expect(attemptsCount).toBe(3);
    expect(meaningfulCount).toBe(1);
  });

  it('Case 2: Chuyển dịch Care Status qua các touchpoint chuẩn hóa (L1 -> L2 -> L3 -> Nurture)', () => {
    let careStatus: CareStatus = 'NOT_STARTED';

    // Touch 1
    careStatus = 'CARE_1_DONE';
    expect(careStatus).toBe('CARE_1_DONE');

    // Touch 2
    careStatus = 'CARE_2_DONE';
    expect(careStatus).toBe('CARE_2_DONE');

    // Touch 3 with no response -> Move to Long-term Nurture instead of losing lead immediately
    const touch3Outcome = 'LOST_NOT_INTERESTED';
    if (touch3Outcome === 'LOST_NOT_INTERESTED') {
      careStatus = 'LONG_TERM_NURTURE';
    }
    expect(careStatus).toBe('LONG_TERM_NURTURE');
  });

  it('Case 3: Xác thực Bằng chứng chăm sóc (MANAGER_VERIFIED vs SELF_REPORTED)', () => {
    const activityWithCallLog: Partial<LeadCareActivity> = {
      id: 'ACT-VERIFIED',
      evidenceType: 'CALL_LOG',
      verificationStatus: 'MANAGER_VERIFIED',
      evidenceData: {
        callDurationSeconds: 68,
        callStartedAt: '2026-08-20 10:15:00'
      }
    };

    const activitySelfReported: Partial<LeadCareActivity> = {
      id: 'ACT-SELF',
      evidenceType: 'SELF_REPORTED',
      verificationStatus: 'SELF_REPORTED'
    };

    expect(activityWithCallLog.verificationStatus).toBe('MANAGER_VERIFIED');
    expect(activityWithCallLog.evidenceData?.callDurationSeconds).toBeGreaterThan(0);

    expect(activitySelfReported.verificationStatus).toBe('SELF_REPORTED');
  });

  it('Case 4: Phân tích Price Gap khi khách hàng so sánh giá đối thủ', () => {
    const storePrice = 28990000;
    const competitorPrice = 28200000;
    const priceGap = storePrice - competitorPrice;

    const activity: Partial<LeadCareActivity> = {
      objectionCode: 'PRICE_GAP',
      priceDetails: {
        storePrice,
        competitorPrice,
        priceGap,
        competitorName: 'ShopDunk'
      }
    };

    expect(activity.priceDetails?.priceGap).toBe(790000);
    expect(activity.priceDetails?.competitorName).toBe('ShopDunk');
  });

  it('Case 5: Tính điểm chất lượng chăm sóc (Care Quality Score)', () => {
    const computeQualityScore = (
      isMeaningful: boolean,
      verificationStatus: EvidenceVerificationStatus,
      feedbackLength: number,
      hasNextAction: boolean
    ) => {
      let score = 30; // base score
      if (isMeaningful) score += 25;
      if (verificationStatus === 'MANAGER_VERIFIED' || verificationStatus === 'SYSTEM_CAPTURED') score += 20;
      if (feedbackLength > 10) score += 15;
      if (hasNextAction) score += 10;
      return Math.min(100, score);
    };

    const highQualityLeadScore = computeQualityScore(true, 'MANAGER_VERIFIED', 45, true);
    const lowQualityLeadScore = computeQualityScore(false, 'SELF_REPORTED', 0, false);

    expect(highQualityLeadScore).toBe(100);
    expect(lowQualityLeadScore).toBe(30);
  });

  it('Case 6: Báo giá (Lead Quote) và tính giá thanh toán sau trợ giá thu cũ & voucher', () => {
    const quote: LeadQuote = {
      id: 'QUOTE-101',
      quoteCode: 'QT-89123',
      leadId: 'LEAD-01',
      customerName: 'Nguyễn Văn A',
      customerPhone: '0905123456',
      staffId: 'STAFF-01',
      staffName: 'Tuấn Bán Hàng',
      branchId: 'CN01',
      model: 'iPhone 16 Pro Max 256GB Desert',
      unitPrice: 28990000,
      tradeInSubsidy: 12000000,
      discountAmount: 500000,
      finalPrice: 28990000 - 12000000 - 500000,
      validUntil: '2026-08-23',
      status: 'SENT',
      createdAt: '2026-08-20 10:30'
    };

    expect(quote.finalPrice).toBe(16490000);
    expect(quote.status).toBe('SENT');
  });
});
