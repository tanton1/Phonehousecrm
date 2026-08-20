import { describe, it, expect } from 'vitest';
import { 
  canTransitionLeadState, 
  processCareActivityReview, 
  processDeviceReservation 
} from '../server/services/crmService';

describe('CRM Server Authority & Lead State Machine Suite', () => {

  describe('1. Lead State Machine Transition Invariants', () => {
    it('allows valid progressive pipeline transition: new -> contacted -> consulting', () => {
      const t1 = canTransitionLeadState('new', 'contacted');
      expect(t1.allowed).toBe(true);

      const t2 = canTransitionLeadState('contacted', 'consulting');
      expect(t2.allowed).toBe(true);
    });

    it('allows transition to appointment_scheduled and deposit_paid', () => {
      const t1 = canTransitionLeadState('consulting', 'appointment_scheduled');
      expect(t1.allowed).toBe(true);

      const t2 = canTransitionLeadState('appointment_scheduled', 'deposit_paid');
      expect(t2.allowed).toBe(true);
    });

    it('allows transition to WON only when valid invoiceId context is supplied', () => {
      // Missing invoiceId
      const failed = canTransitionLeadState('deposit_paid', 'won', {});
      expect(failed.allowed).toBe(false);
      expect(failed.reason).toContain('invoiceId');

      // Valid invoiceId
      const success = canTransitionLeadState('deposit_paid', 'won', { invoiceId: 'INV-202608-001' });
      expect(success.allowed).toBe(true);
    });

    it('blocks arbitrary jump from NEW to WON without progressive pipeline or invoice', () => {
      const jump = canTransitionLeadState('new', 'won', {});
      expect(jump.allowed).toBe(false);
    });

    it('requires lostReason when marking lead as LOST', () => {
      const missingReason = canTransitionLeadState('contacted', 'lost');
      expect(missingReason.allowed).toBe(false);
      expect(missingReason.reason).toContain('lostReason');

      const withReason = canTransitionLeadState('contacted', 'lost', { lostReason: 'Khách mua nơi khác giá rẻ hơn' });
      expect(withReason.allowed).toBe(true);
    });

    it('protects WON status as immutable', () => {
      const attemptRevert = canTransitionLeadState('won', 'contacted');
      expect(attemptRevert.allowed).toBe(false);
    });
  });

  describe('2. Authoritative Server QA Review Engine', () => {
    it('authorizes Manager/Admin to audit care activity with full metadata and audit trail', async () => {
      const reviewed = await processCareActivityReview(null, {
        activityId: 'ACT-TEST-01',
        status: 'MANAGER_VERIFIED',
        reviewerUid: 'MGR-001',
        reviewerName: 'Trưởng Cửa Hàng A',
        reviewerRole: 'MANAGER',
        reviewerBranchId: 'CN01',
        note: 'Đã kiểm tra ghi âm cuộc gọi 65s chuẩn quy trình'
      });

      expect(reviewed.verificationStatus).toBe('MANAGER_VERIFIED');
      expect(reviewed.qaReview?.status).toBe('MANAGER_VERIFIED');
      expect(reviewed.qaReview?.reviewedBy).toBe('MGR-001');
      expect(reviewed.qaReview?.note).toContain('Đã kiểm tra ghi âm');
      expect(reviewed.auditHistory).toHaveLength(1);
      expect(reviewed.auditHistory![0].newStatus).toBe('MANAGER_VERIFIED');
    });

    it('rejects regular sales staff attempting to perform QA review', async () => {
      await expect(
        processCareActivityReview(null, {
          activityId: 'ACT-TEST-02',
          status: 'MANAGER_VERIFIED',
          reviewerUid: 'STAFF-001',
          reviewerName: 'Nhân Viên Bán Hàng',
          reviewerRole: 'STAFF',
          reviewerBranchId: 'CN01'
        })
      ).rejects.toThrow('PERMISSION_DENIED');
    });
  });

  describe('3. Device Inventory Reservation Engine (30m Hold)', () => {
    it('creates active device reservation with 30m expiration timestamp', async () => {
      const reservation = await processDeviceReservation(null, {
        deviceId: 'DEV-IPHONE16-01',
        leadId: 'LEAD-001',
        quoteId: 'QT-001',
        customerId: 'CUST-001',
        staffId: 'STAFF-01',
        branchId: 'CN01',
        reservationDurationMinutes: 30
      });

      expect(reservation.status).toBe('ACTIVE');
      expect(reservation.deviceId).toBe('DEV-IPHONE16-01');
      expect(reservation.expiresAt).toBeDefined();

      const diffMins = (new Date(reservation.expiresAt).getTime() - new Date(reservation.reservedAt).getTime()) / 60000;
      expect(Math.round(diffMins)).toBe(30);
    });
  });
});
