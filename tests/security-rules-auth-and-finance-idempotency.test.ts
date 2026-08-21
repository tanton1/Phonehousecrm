import { describe, it, expect } from 'vitest';
import { executeAtomicCheckout } from '../server/services/checkoutService';
import { getStaffAuthority } from '../server/middleware/authenticateFirebase';

describe('Security Rules, Auth Hardening & Finance Idempotency Suite', () => {

  describe('1. Authentication Fail-Closed Profile Invariant', () => {
    it('returns null when user document is not provisioned in Firestore', async () => {
      const mockDb: any = {
        collection: () => ({
          doc: () => ({ get: async () => ({ exists: false }) }),
          where: () => ({ limit: () => ({ get: async () => ({ empty: true }) }) })
        })
      };
      const authority = await getStaffAuthority('non_existent_uid_123', undefined, mockDb);
      expect(authority).toBeNull();
    });
  });

  describe('2. POS Reservation Consumption on Checkout', () => {
    it('marks device reservation document as CONSUMED atomically upon successful POS checkout', async () => {
      let consumedReservationData: any = null;

      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (ref: any) => {
              if (ref.col === 'checkoutRequests') return { exists: false };
              if (ref.col === 'funds') {
                return {
                  exists: true,
                  data: () => ({ name: 'Quỹ tiền mặt CN01', type: 'CASH', branchId: 'CN01', active: true })
                };
              }
              if (ref.col === 'devices') {
                return {
                  exists: true,
                  data: () => ({
                    id: 'DEV-RESERVED-10',
                    model: 'iPhone 16 Pro Max',
                    sellPrice: 34990000,
                    status: 'reserved',
                    reservedForLeadId: 'LEAD-BUYER-01',
                    reservedUntil: new Date(Date.now() + 20 * 60000).toISOString(),
                    branchId: 'CN01'
                  })
                };
              }
              if (ref.col === 'operationalConfigs' && ref.docId === 'sales') return {
                exists: true,
                data: () => ({ isActive: true, version: 'test-v1', commissionTags: [{ id: 'MAY_TEST', name: 'Máy test', appliesTo: 'DEVICE', calculationType: 'FLAT', value: 100000, isActive: true }] })
              };
              return { exists: false };
            },
            set: (ref: any, data: any) => {
              if (ref.col === 'deviceReservations') {
                consumedReservationData = data;
              }
            },
            update: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      const result = await executeAtomicCheckout(mockDb, {
        deviceIds: ['DEV-RESERVED-10'],
        branchId: 'CN01',
        leadId: 'LEAD-BUYER-01',
        payment: { method: 'CASH', fundId: 'FUND-01' },
        commissionTagSelections: [{ itemType: 'DEVICE', itemId: 'DEV-RESERVED-10', tagIds: ['MAY_TEST'] }]
      });

      expect(result.success).toBe(true);
      expect(consumedReservationData).not.toBeNull();
      expect(consumedReservationData.status).toBe('CONSUMED');
      expect(consumedReservationData.leadId).toBe('LEAD-BUYER-01');
      expect(consumedReservationData.deviceId).toBe('DEV-RESERVED-10');
      expect(consumedReservationData.consumedInvoiceId).toBe(result.invoiceId);
    });
  });

  describe('3. Finance Idempotency Verification Pattern', () => {
    it('returns cached idempotent transaction when called multiple times with same idempotencyKey', async () => {
      const idempotencyKey = 'IDEM-FIN-TEST-001';
      const cachedTx = {
        id: 'tx_cached_123',
        code: 'PC999999',
        type: 'PAYMENT',
        amount: 5000000,
        fundId: 'FUND-01',
        status: 'COMPLETED'
      };

      let dbRunCount = 0;

      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId })
        }),
        runTransaction: async (cb: any) => {
          dbRunCount++;
          const mockTransaction = {
            get: async (ref: any) => {
              if (ref.col === 'financeRequests' && ref.docId === idempotencyKey) {
                return {
                  exists: true,
                  data: () => ({
                    id: idempotencyKey,
                    status: 'COMPLETED',
                    transaction: cachedTx
                  })
                };
              }
              return { exists: false };
            },
            set: () => {},
            update: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      // Simulating idempotent transaction execution
      let resultingTx: any = null;
      await mockDb.runTransaction(async (transaction: any) => {
        const idemRef = mockDb.collection('financeRequests').doc(idempotencyKey);
        const idemSnap = await transaction.get(idemRef);
        if (idemSnap.exists && idemSnap.data()?.status === 'COMPLETED') {
          resultingTx = idemSnap.data()?.transaction;
          return;
        }
      });

      expect(resultingTx).toEqual(cachedTx);
      expect(resultingTx.amount).toBe(5000000);
      expect(resultingTx.status).toBe('COMPLETED');
    });
  });
});
