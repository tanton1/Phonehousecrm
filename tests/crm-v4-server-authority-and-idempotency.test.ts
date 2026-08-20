import { describe, it, expect } from 'vitest';
import { 
  processCareActivityReview, 
  processDeviceReservation, 
  processConvertQuoteToPOS 
} from '../server/services/crmService';
import { 
  emitCrmEvent, 
  normalizeCustomerId 
} from '../server/services/crmEventService';

describe('CRM 4.0: Server Authority, Zero Fallback, Idempotency & Event Bus Suite', () => {

  describe('1. Zero Fallback Enforcement', () => {
    it('fails closed when reviewer identity or branch is missing', async () => {
      await expect(
        processCareActivityReview(null, {
          activityId: 'ACT-01',
          status: 'MANAGER_VERIFIED',
          reviewerUid: '',
          reviewerName: 'Admin',
          reviewerRole: 'MANAGER',
          reviewerBranchId: ''
        })
      ).rejects.toThrow('MISSING_STAFF_IDENTITY');
    });

    it('fails closed when device reservation parameters are incomplete', async () => {
      await expect(
        processDeviceReservation(null, {
          deviceId: '',
          leadId: 'LEAD-01',
          staffId: 'STAFF-01',
          branchId: ''
        })
      ).rejects.toThrow('MISSING_RESERVATION_PARAMS');
    });
  });

  describe('2. Customer ID Normalization & Event Bus', () => {
    it('standardizes raw phone numbers into clean CUST_ prefix format', () => {
      expect(normalizeCustomerId(undefined, '0905 123 456')).toBe('CUST_0905123456');
      expect(normalizeCustomerId('CUST_9999', undefined)).toBe('CUST_9999');
      expect(normalizeCustomerId('LEGACY-ID-123', undefined)).toBe('CUST_LEGACYID123');
    });

    it('emits CRM event and generates CustomerActivity with valid normalized customerId', async () => {
      const result = await emitCrmEvent(null, {
        type: 'CARE',
        customerId: '0905111222',
        leadId: 'LEAD-01',
        staffId: 'STAFF-01',
        staffName: 'Trần Bán Hàng',
        branchId: 'CN01',
        summary: 'Tư vấn iPhone 16 Pro Max qua cuộc gọi ý nghĩa L1'
      });

      expect(result.activityId).toBeDefined();
      expect(result.activityId).toContain('CUST_ACT_');
    });

    it('dispatches CRMTask automatically on high-priority event trigger', async () => {
      const result = await emitCrmEvent(null, {
        type: 'APPOINTMENT_NO_SHOW',
        customerId: 'CUST_0905333444',
        leadId: 'LEAD-02',
        staffId: 'STAFF-02',
        staffName: 'Lê Bán Hàng',
        branchId: 'CN01',
        summary: 'Khách hàng lỡ hẹn showroom 15:00',
        createTask: {
          taskType: 'NO_SHOW_RECOVERY',
          priority: 'P1',
          dueAt: '2026-08-20 15:15:00',
          title: 'Gọi lại cho khách lỡ hẹn showroom trong 15 phút',
          description: 'Hỏi thăm lý do bận và gợi ý dời lịch hoặc ship máy tận nhà'
        }
      });

      expect(result.taskId).toBeDefined();
      expect(result.taskId).toContain('TASK_');
    });
  });

  describe('3. Quote to POS Idempotency Engine', () => {
    it('returns conversion status for valid quote', async () => {
      const convert = await processConvertQuoteToPOS(null, 'QT-001', 'INV-001');
      expect(convert.invoiceId).toBe('INV-001');
    });
  });
});
