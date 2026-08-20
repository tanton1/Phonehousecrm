import { describe, it, expect } from 'vitest';
import { 
  canTransitionLeadState, 
  processCareActivityReview,
  processDeviceReservation,
  processConvertQuoteToPOS
} from '../server/services/crmService';

describe('CRM End-to-End Authority, Ownership, Branch Isolation & POS Integrity Suite', () => {

  describe('1. Lead State Machine Transition Invariants', () => {
    it('blocks jumping directly from NEW to WON without invoiceId', () => {
      const check = canTransitionLeadState('new', 'won', {});
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('invoiceId');
    });

    it('blocks jumping from NEW to WON even if invoiceId is given because stages must be traversed', () => {
      const check = canTransitionLeadState('new', 'won', { invoiceId: 'INV-123' });
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Không được phép chuyển trực tiếp');
    });

    it('allows consulting -> won when invoiceId is present', () => {
      const check = canTransitionLeadState('consulting', 'won', { invoiceId: 'INV-123', staffId: 'S-01', branchId: 'CN01' });
      expect(check.allowed).toBe(true);
    });

    it('blocks transitioning to lost without lostReason', () => {
      const check = canTransitionLeadState('negotiating', 'lost', {});
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('lostReason');
    });

    it('allows transitioning to lost when lostReason is supplied', () => {
      const check = canTransitionLeadState('negotiating', 'lost', { lostReason: 'Khách đổi nhu cầu mua máy khác' });
      expect(check.allowed).toBe(true);
    });

    it('prevents modifying an already WON deal back to earlier stages', () => {
      const check = canTransitionLeadState('won', 'negotiating');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('WON');
    });
  });

  describe('2. Device Reservation Branch Isolation & Conflict Handling', () => {
    it('fails closed when device belongs to another branch', async () => {
      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({
            id: docId
          })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (ref: any) => ({
              exists: true,
              data: () => ({
                id: 'DEV-01',
                imei: '358901234567890',
                model: 'iPhone 16 Pro Max',
                status: 'in_stock',
                branchId: 'CN02' // Device is in CN02
              })
            }),
            update: () => {},
            set: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      // Request from CN01 trying to hold device in CN02
      await expect(
        processDeviceReservation(mockDb, {
          deviceId: 'DEV-01',
          leadId: 'LEAD-01',
          staffId: 'STAFF-01',
          branchId: 'CN01'
        })
      ).rejects.toThrow('DEVICE_BRANCH_FORBIDDEN');
    });

    it('fails closed when device is already sold', async () => {
      const mockDb: any = {
        collection: () => ({ doc: (id: string) => ({ id }) }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async () => ({
              exists: true,
              data: () => ({
                id: 'DEV-02',
                imei: '358909999999999',
                model: 'iPhone 16 Pro Max',
                status: 'sold',
                branchId: 'CN01'
              })
            }),
            update: () => {},
            set: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      await expect(
        processDeviceReservation(mockDb, {
          deviceId: 'DEV-02',
          leadId: 'LEAD-01',
          staffId: 'STAFF-01',
          branchId: 'CN01'
        })
      ).rejects.toThrow('DEVICE_ALREADY_SOLD');
    });
  });

  describe('3. Quote to POS Real Invoice Verification & Idempotency', () => {
    it('fails closed when the referenced invoice does not exist in DB', async () => {
      const mockDb: any = {
        collection: (col: string) => ({ doc: (id: string) => ({ col, id }) }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (ref: any) => {
              if (ref.col === 'leadQuotes') {
                return {
                  exists: true,
                  data: () => ({
                    id: 'QT-01',
                    status: 'ACCEPTED'
                  })
                };
              }
              // Invoice doc does not exist
              return { exists: false };
            },
            update: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      await expect(
        processConvertQuoteToPOS(mockDb, 'QT-01', 'FAKE_INVOICE_999')
      ).rejects.toThrow('INVOICE_NOT_FOUND');
    });

    it('converts quote and marks reserved device as sold in the same transaction', async () => {
      let quoteUpdated = false;
      let deviceSold = false;

      const mockDb: any = {
        collection: (col: string) => ({ doc: (id: string) => ({ col, id }) }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (ref: any) => {
              if (ref.col === 'leadQuotes') {
                return {
                  exists: true,
                  data: () => ({
                    id: 'QT-01',
                    status: 'ACCEPTED',
                    reservedDeviceId: 'DEV-01'
                  })
                };
              }
              if (ref.col === 'invoices') {
                return {
                  exists: true,
                  data: () => ({
                    id: 'INV-REAL-100',
                    status: 'completed'
                  })
                };
              }
              return { exists: false };
            },
            update: (ref: any, fields: any) => {
              if (ref.col === 'leadQuotes' && fields.status === 'CONVERTED_POS') {
                quoteUpdated = true;
              }
              if (ref.col === 'devices' && fields.status === 'sold') {
                deviceSold = true;
              }
            }
          };
          return await cb(mockTransaction);
        }
      };

      const res = await processConvertQuoteToPOS(mockDb, 'QT-01', 'INV-REAL-100');
      expect(res.alreadyConverted).toBe(false);
      expect(res.invoiceId).toBe('INV-REAL-100');
      expect(quoteUpdated).toBe(true);
      expect(deviceSold).toBe(true);
    });

    it('returns alreadyConverted: true when called again with the same invoiceId (Idempotency)', async () => {
      const mockDb: any = {
        collection: (col: string) => ({ doc: (id: string) => ({ col, id }) }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (ref: any) => {
              if (ref.col === 'leadQuotes') {
                return {
                  exists: true,
                  data: () => ({
                    id: 'QT-01',
                    status: 'CONVERTED_POS',
                    convertedInvoiceId: 'INV-REAL-100'
                  })
                };
              }
              return { exists: true, data: () => ({ id: 'INV-REAL-100' }) };
            },
            update: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      const res = await processConvertQuoteToPOS(mockDb, 'QT-01', 'INV-REAL-100');
      expect(res.alreadyConverted).toBe(true);
      expect(res.invoiceId).toBe('INV-REAL-100');
    });

    it('throws QUOTE_ALREADY_CONVERTED when attempting to convert to a different invoice', async () => {
      const mockDb: any = {
        collection: (col: string) => ({ doc: (id: string) => ({ col, id }) }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (ref: any) => {
              if (ref.col === 'leadQuotes') {
                return {
                  exists: true,
                  data: () => ({
                    id: 'QT-01',
                    status: 'CONVERTED_POS',
                    convertedInvoiceId: 'INV-REAL-100'
                  })
                };
              }
              return { exists: true, data: () => ({ id: 'INV-ANOTHER-200' }) };
            },
            update: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      await expect(
        processConvertQuoteToPOS(mockDb, 'QT-01', 'INV-ANOTHER-200')
      ).rejects.toThrow('QUOTE_ALREADY_CONVERTED');
    });
  });
});
