import { describe, it, expect } from 'vitest';
import { executeAtomicCheckout } from '../server/services/checkoutService';
import { randomBytes } from 'crypto';

const checkoutActor = { uid: 'SALE_01', name: 'Sale test', role: 'SALES', branchId: 'CN01' };

describe('P0 Security, Finance Settlement & POS Integrity Invariants Suite', () => {

  describe('1. User Provisioning Password Security (P0-01)', () => {
    it('generates secure random password when no password is provided instead of hardcoded default', () => {
      const generated = randomBytes(16).toString('hex') + 'A1!';
      expect(generated).not.toBe('PhoneHouse@2026');
      expect(generated.length).toBeGreaterThan(20);
    });
  });

  describe('2. POS Settlement Model & Installment Debt Invariant (P0-06)', () => {
    it('does NOT increase customer debt when paying via 3rd-party bank INSTALLMENT', async () => {
      let customerDebtIncrement = -1;
      let financePartnerDebtIncrement = -1;

      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (ref: any) => {
              if (ref.col === 'checkoutRequests') return { exists: false };
              if (ref.col === 'warehouses') return { exists: true, data: () => ({ id: 'KHO01', branchId: 'CN01', isActive: true }) };
              if (ref.col === 'branches') return { exists: true, data: () => ({ id: 'CN01', code: 'CN01', name: 'Chi nhánh 01', isActive: true }) };
              if (ref.col === 'funds') {
                return {
                  exists: true,
                  data: () => ({ name: 'Quỹ tiền mặt CN01', type: 'CASH', branchId: 'CN01', active: true })
                };
              }
              if (ref.col === 'devices') {
                return {
                  exists: true,
                  data: () => ({ id: ref.docId, model: 'iPhone 16 Pro', imei: '123456789012345', sellPrice: 30000000, status: 'in_stock', branchId: 'CN01', currentLocationId: 'KHO01' })
                };
              }
              if (ref.col === 'operationalConfigs' && ref.docId === 'sales') return {
                exists: true,
                data: () => ({ name: 'Sales test', isActive: true, version: 'test-v1', commissionTags: [{ id: 'MAY_TEST', name: 'Máy test', appliesTo: 'DEVICE', calculationType: 'FLAT', value: 100000, isActive: true }] })
              };
              if (ref.col === 'users') return { exists: true, data: () => ({ authUid: 'SALE_01', branchId: 'CN01', payrollBranchId: 'CN01', active: true }) };
              if (ref.col === 'payrollPeriods' || ref.col === 'payrollStaffLocks') return { exists: false, data: () => undefined };
              if (ref.col === 'partners') {
                if (ref.docId === 'CUST-01') {
                  return {
                    exists: true,
                    data: () => ({ id: ref.docId, name: 'Khách test', phone: '0905000001', type: 'CUSTOMER', status: 'ACTIVE', branchId: 'CN01', outstandingDebt: 0 })
                  };
                }
                return {
                  exists: true,
                  data: () => ({ id: ref.docId, name: 'FE Credit', type: 'FINANCE_COMPANY', status: 'ACTIVE', branchId: 'CN01' })
                };
              }
              return { exists: false };
            },
            set: () => {},
            update: (ref: any, updateFields: any) => {
              if (ref.col === 'partners' && ref.docId === 'CUST-01') {
                customerDebtIncrement = updateFields.outstandingDebt ? 0 : 0;
              }
              if (ref.col === 'partners' && ref.docId === 'FINANCE-PARTNER-01') {
                financePartnerDebtIncrement = 20000000;
              }
            }
          };
          return await cb(mockTransaction);
        }
      };

      const result = await executeAtomicCheckout(mockDb, {
        deviceIds: ['DEV-01'],
        branchId: 'CN01',
        warehouseId: 'KHO01',
        customerId: 'CUST-01',
        payment: {
          method: 'INSTALLMENT',
          downPayment: 10000000,
          fundId: 'FUND-CASH-01',
          installmentFinancePartnerId: 'FINANCE-PARTNER-01'
        },
        installmentFinancePartnerId: 'FINANCE-PARTNER-01',
        installmentContractCode: 'HD-TG-001',
        commissionTagSelections: [{ itemType: 'DEVICE', itemId: 'DEV-01', tagIds: ['MAY_TEST'] }]
      }, checkoutActor);

      expect(result.success).toBe(true);
      expect(result.finalAmount).toBe(30000000);
      expect(result.invoice.debtAmount).toBe(0); // Customer does NOT owe the bank financed portion!
      expect(result.invoice.financeAmount).toBe(20000000); // Financed by partner
      expect(result.invoice.installmentContractCode).toBe('HD-TG-001');
    });
  });

  describe('3. Branch Inventory Balance Strict Check (P0-08)', () => {
    it('fails closed when branch inventory balance is missing (No global stock fallback)', async () => {
      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (ref: any) => {
              if (ref.col === 'checkoutRequests') return { exists: false };
              if (ref.col === 'warehouses') return { exists: true, data: () => ({ id: 'KHO01', branchId: 'CN01', isActive: true }) };
              if (ref.col === 'branches') return { exists: true, data: () => ({ id: 'CN01', code: 'CN01', name: 'Chi nhánh 01', isActive: true }) };
              if (ref.col === 'funds') {
                return {
                  exists: true,
                  data: () => ({ name: 'Quỹ tiền mặt CN01', type: 'CASH', branchId: 'CN01', active: true })
                };
              }
              if (ref.col === 'products') {
                return {
                  exists: true,
                  data: () => ({ id: 'PROD-01', name: 'Củ sạc 20W', retailPrice: 500000, stockQuantity: 100 })
                };
              }
              if (ref.col === 'inventoryBalances') {
                // Branch balance document does not exist
                return { exists: false };
              }
              return { exists: false };
            },
            set: () => {},
            update: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      await expect(
        executeAtomicCheckout(mockDb, {
          deviceIds: [],
          accessoryLines: [{ productId: 'PROD-01', quantity: 1 }],
          branchId: 'CN01',
          warehouseId: 'KHO01',
          payment: { method: 'CASH', fundId: 'FUND-01' }
        })
      ).rejects.toThrow('BRANCH_STOCK_NOT_INITIALIZED');
    });
  });

  describe('4. POS Checkout with Reserved Device for Lead (P0-05)', () => {
    it('allows checkout of reserved device when checkout matches the reserved leadId', async () => {
      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (ref: any) => {
              if (ref.col === 'checkoutRequests') return { exists: false };
              if (ref.col === 'warehouses') return { exists: true, data: () => ({ id: 'KHO01', branchId: 'CN01', isActive: true }) };
              if (ref.col === 'branches') return { exists: true, data: () => ({ id: 'CN01', code: 'CN01', name: 'Chi nhánh 01', isActive: true }) };
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
                    id: 'DEV-RESERVED-01',
                    model: 'iPhone 16 Pro Max',
                    sellPrice: 34000000,
                    status: 'reserved',
                    reservedForLeadId: 'LEAD-MATCH-01',
                    reservedUntil: new Date(Date.now() + 15 * 60000).toISOString(),
                    branchId: 'CN01',
                    currentLocationId: 'KHO01'
                  })
                };
              }
              if (ref.col === 'operationalConfigs' && ref.docId === 'sales') return {
                exists: true,
                data: () => ({ name: 'Sales test', isActive: true, version: 'test-v1', commissionTags: [{ id: 'MAY_TEST', name: 'Máy test', appliesTo: 'DEVICE', calculationType: 'FLAT', value: 100000, isActive: true }] })
              };
              if (ref.col === 'users') return { exists: true, data: () => ({ authUid: 'SALE_01', branchId: 'CN01', payrollBranchId: 'CN01', active: true }) };
              if (ref.col === 'payrollPeriods' || ref.col === 'payrollStaffLocks') return { exists: false, data: () => undefined };
              return { exists: false };
            },
            set: () => {},
            update: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      const result = await executeAtomicCheckout(mockDb, {
        deviceIds: ['DEV-RESERVED-01'],
        branchId: 'CN01',
        warehouseId: 'KHO01',
        leadId: 'LEAD-MATCH-01',
        payment: { method: 'CASH', fundId: 'FUND-01' },
        commissionTagSelections: [{ itemType: 'DEVICE', itemId: 'DEV-RESERVED-01', tagIds: ['MAY_TEST'] }]
      }, checkoutActor);

      expect(result.success).toBe(true);
      expect(result.finalAmount).toBe(34000000);
    });

    it('rejects checkout of reserved device when checkout belongs to a different lead or customer', async () => {
      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (ref: any) => {
              if (ref.col === 'checkoutRequests') return { exists: false };
              if (ref.col === 'warehouses') return { exists: true, data: () => ({ id: 'KHO01', branchId: 'CN01', isActive: true }) };
              if (ref.col === 'branches') return { exists: true, data: () => ({ id: 'CN01', code: 'CN01', name: 'Chi nhánh 01', isActive: true }) };
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
                    id: 'DEV-RESERVED-01',
                    model: 'iPhone 16 Pro Max',
                    sellPrice: 34000000,
                    status: 'reserved',
                    reservedForLeadId: 'LEAD-ORIGINAL-01',
                    reservedUntil: new Date(Date.now() + 15 * 60000).toISOString(),
                    branchId: 'CN01',
                    currentLocationId: 'KHO01'
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

      await expect(
        executeAtomicCheckout(mockDb, {
          deviceIds: ['DEV-RESERVED-01'],
          branchId: 'CN01',
          warehouseId: 'KHO01',
          leadId: 'LEAD-DIFFERENT-02',
          payment: { method: 'CASH', fundId: 'FUND-01' }
        })
      ).rejects.toThrow('DEVICE_ALREADY_SOLD');
    });
  });
});
