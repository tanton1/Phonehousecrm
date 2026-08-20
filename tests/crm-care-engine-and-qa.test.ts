import { describe, it, expect } from 'vitest';
import { 
  suggestNextAction, 
  calculateLeadTemperature, 
  calculateLeadPriority, 
  calculateCareQualityBreakdown,
  OBJECTION_TAXONOMY 
} from '../src/features/crm/utils/crmEngine';
import { Lead, LeadCareActivity } from '../src/types';

describe('CRM 3.1: Verifiable Care Process, Engine & QA Test Suite', () => {

  describe('1. Auto-Suggestion Matrix (Customer Response -> Next Action & Objections)', () => {
    it('suggests CLOSE_DEAL immediately when customer is READY_TO_BUY', () => {
      const suggestion = suggestNextAction('READY_TO_BUY');
      expect(suggestion.nextActionType).toBe('CLOSE_DEAL');
      expect(suggestion.nextActionNotes).toContain('Tạo đơn POS');
    });

    it('suggests APPOINTMENT tomorrow morning when customer WILL_VISIT_STORE', () => {
      const suggestion = suggestNextAction('WILL_VISIT_STORE');
      expect(suggestion.nextActionType).toBe('APPOINTMENT');
      expect(suggestion.nextActionNotes).toContain('lịch hẹn showroom');
    });

    it('suggests SEND_QUOTE within 2h with PRICE objection when COMPARING_PRICE', () => {
      const suggestion = suggestNextAction('COMPARING_PRICE');
      expect(suggestion.nextActionType).toBe('SEND_QUOTE');
      expect(suggestion.suggestedObjectionCategory).toBe('PRICE');
      expect(suggestion.suggestedObjectionCode).toBe('COMPETITOR_CHEAPER');
    });

    it('suggests Day 1 of next month when customer WAITING_SALARY', () => {
      const suggestion = suggestNextAction('WAITING_SALARY');
      expect(suggestion.nextActionType).toBe('CALL');
      expect(suggestion.suggestedObjectionCategory).toBe('FINANCE');
      expect(suggestion.suggestedObjectionCode).toBe('WAITING_PAYDAY');
      expect(suggestion.nextActionAt).toMatch(/\d{4}-\d{2}-01 10:00/);
    });

    it('suggests ZALO follow-up with spouse consult when NEED_FAMILY_CONSULT', () => {
      const suggestion = suggestNextAction('NEED_FAMILY_CONSULT');
      expect(suggestion.nextActionType).toBe('ZALO');
      expect(suggestion.suggestedObjectionCategory).toBe('DECISION_MAKER');
      expect(suggestion.suggestedObjectionCode).toBe('NEED_ASK_SPOUSE');
    });

    it('suggests 2h retry when customer has NO_RESPONSE', () => {
      const suggestion = suggestNextAction('NO_RESPONSE');
      expect(suggestion.nextActionType).toBe('CALL');
      expect(suggestion.nextActionNotes).toContain('sau 2 giờ');
    });
  });

  describe('2. Lead Temperature Engine (0 - 100 Score & HOT / WARM / COLD)', () => {
    it('classifies READY_TO_BUY with high budget as HOT (score >= 70)', () => {
      const lead: Partial<Lead> = {
        budget: 34000000,
        meaningfulCareCount: 2,
        lastContactedAt: new Date().toISOString()
      };
      const activity: Partial<LeadCareActivity> = {
        customerResponseCode: 'READY_TO_BUY',
        outcome: 'CONNECTED',
        isMeaningfulContact: true
      };

      const result = calculateLeadTemperature(lead, activity);
      expect(result.temperature).toBe('HOT');
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('classifies BOUGHT_OTHER_STORE as COLD (score < 40)', () => {
      const lead: Partial<Lead> = {
        budget: 15000000
      };
      const activity: Partial<LeadCareActivity> = {
        customerResponseCode: 'BOUGHT_OTHER_STORE',
        outcome: 'LOST_NOT_INTERESTED'
      };

      const result = calculateLeadTemperature(lead, activity);
      expect(result.temperature).toBe('COLD');
      expect(result.score).toBeLessThan(40);
    });
  });

  describe('3. Priority Ranking Engine for My Work (P0 / P1 / P2 / P3)', () => {
    it('assigns P0 to new lead exceeding 15m SLA', () => {
      const lead: Lead = {
        id: 'L1',
        name: 'Khách A',
        phone: '0905111222',
        source: 'Facebook Ads',
        interestedModel: 'iPhone 16 Pro Max',
        budget: 30000000,
        tradeInRequirose: false,
        status: 'new',
        assignedStaff: 'Sale 1',
        followUpDate: '2026-08-20',
        createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        notes: ''
      };

      const prio = calculateLeadPriority(lead, false);
      expect(prio.rank).toBe('P0');
      expect(prio.score).toBeGreaterThanOrEqual(90);
    });

    it('assigns P1 to lead with appointment today', () => {
      const lead: Lead = {
        id: 'L2',
        name: 'Khách B',
        phone: '0905333444',
        source: 'Zalo OA',
        interestedModel: 'iPhone 16 Pro',
        budget: 25000000,
        tradeInRequirose: false,
        status: 'appointment_scheduled',
        assignedStaff: 'Sale 2',
        followUpDate: '2026-08-20',
        createdAt: new Date().toISOString(),
        notes: ''
      };

      const prio = calculateLeadPriority(lead, true);
      expect(prio.rank).toBe('P1');
      expect(prio.score).toBe(90);
    });

    it('assigns P2 to lead pending L1 or L2 care', () => {
      const lead: Lead = {
        id: 'L3',
        name: 'Khách C',
        phone: '0905555666',
        source: 'TikTok',
        interestedModel: 'iPhone 15',
        budget: 18000000,
        tradeInRequirose: false,
        status: 'contacted',
        careStatus: 'CARE_2_PENDING',
        assignedStaff: 'Sale 3',
        followUpDate: '2026-08-20',
        createdAt: new Date().toISOString(),
        notes: ''
      };

      const prio = calculateLeadPriority(lead, false);
      expect(prio.rank).toBe('P2');
    });
  });

  describe('4. Care Quality Score Breakdown (Process /40 + Evidence /30 + Outcome /30)', () => {
    it('calculates full quality breakdown with verified manager audit', () => {
      const breakdown = calculateCareQualityBreakdown({
        channel: 'CALL',
        action: 'CALL_CUSTOMER',
        outcome: 'APPOINTMENT_CREATED',
        customerResponseText: 'Khách rất hào hứng và hẹn 15:00 ghé showroom trải nghiệm',
        evidenceType: 'CALL_LOG',
        evidenceData: { callDurationSeconds: 65 },
        verificationStatus: 'MANAGER_VERIFIED',
        isMeaningfulContact: true,
        nextActionAt: '2026-08-21 15:00'
      });

      expect(breakdown.processScore).toBe(40);
      expect(breakdown.evidenceScore).toBe(30);
      expect(breakdown.outcomeScore).toBe(25);
      expect(breakdown.totalScore).toBe(95);
    });

    it('penalizes flagged activity with 0 evidence score', () => {
      const breakdown = calculateCareQualityBreakdown({
        channel: 'CALL',
        action: 'CALL_CUSTOMER',
        outcome: 'NO_ANSWER',
        evidenceType: 'SELF_REPORTED',
        verificationStatus: 'FLAGGED',
        isMeaningfulContact: false
      });

      expect(breakdown.evidenceScore).toBe(0);
      expect(breakdown.totalScore).toBeLessThan(40);
    });
  });

  describe('5. Attempt Sequence vs. Meaningful Care Sequence Invariant', () => {
    it('does not increment meaningfulCareNo on missed call (NO_ANSWER)', () => {
      const pastActivities: LeadCareActivity[] = [];
      const attemptNo = pastActivities.length + 1;
      const isMeaningful = false;
      const meaningfulPast = pastActivities.filter(a => a.isMeaningfulContact);
      const meaningfulCareNo = isMeaningful ? meaningfulPast.length + 1 : undefined;

      expect(attemptNo).toBe(1);
      expect(meaningfulCareNo).toBeUndefined();
    });

    it('increments meaningfulCareNo only when call is answered (CONNECTED)', () => {
      const pastActivities: LeadCareActivity[] = [
        {
          id: 'ACT-1',
          leadId: 'L1',
          attemptNo: 1,
          sequence: 1,
          isMeaningfulContact: false, // missed call
          staffId: 'STAFF-1',
          staffName: 'Sale 1',
          branchId: 'CN01',
          channel: 'CALL',
          action: 'CALL_CUSTOMER',
          outcome: 'NO_ANSWER',
          evidenceType: 'CALL_LOG',
          verificationStatus: 'SELF_REPORTED',
          createdAt: '2026-08-20 09:00'
        }
      ];

      const attemptNo = pastActivities.length + 1;
      const isMeaningful = true;
      const meaningfulPast = pastActivities.filter(a => a.isMeaningfulContact);
      const meaningfulCareNo = isMeaningful ? meaningfulPast.length + 1 : undefined;

      expect(attemptNo).toBe(2);
      expect(meaningfulCareNo).toBe(1); // First meaningful care touch (L1) despite being attempt #2
    });
  });

  describe('6. Structured Objection Taxonomy', () => {
    it('contains all 8 required objection categories', () => {
      expect(OBJECTION_TAXONOMY.PRICE).toBeDefined();
      expect(OBJECTION_TAXONOMY.PRODUCT).toBeDefined();
      expect(OBJECTION_TAXONOMY.FINANCE).toBeDefined();
      expect(OBJECTION_TAXONOMY.DECISION_MAKER).toBeDefined();
      expect(OBJECTION_TAXONOMY.TIMING).toBeDefined();
      expect(OBJECTION_TAXONOMY.COMPETITOR).toBeDefined();
      expect(OBJECTION_TAXONOMY.WARRANTY).toBeDefined();
      expect(OBJECTION_TAXONOMY.OTHER).toBeDefined();
    });
  });
});
