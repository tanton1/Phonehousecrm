import { describe, expect, it } from 'vitest';
import { buildCrmSearchPrefixes, chooseCrmAssignee, normalizeCrmPhone } from '../server/services/crmOperationsService';
import { executeAtomicCheckout } from '../server/services/checkoutService';

describe('CRM operations engine', () => {
  it('normalizes Vietnamese phone numbers and builds searchable aliases', () => {
    expect(normalizeCrmPhone('+84 905 000 001')).toBe('0905000001');
    const prefixes = buildCrmSearchPrefixes('Nguyễn Văn Tân', '0905000001', 'iPhone 15 Pro Max');
    expect(prefixes).toContain('nguyen');
    expect(prefixes).toContain('0905');
    expect(prefixes).toContain('iphone 15');
  });

  it('assigns an in-shift person with the lowest open workload', () => {
    const selected = chooseCrmAssignee([
      { id: 'A', name: 'A', role: 'SALES', openTasks: 9, scheduledNow: true },
      { id: 'B', name: 'B', role: 'SALES', openTasks: 2, scheduledNow: true },
      { id: 'C', name: 'C', role: 'SALES', openTasks: 0, scheduledNow: false }
    ]);
    expect(selected?.id).toBe('B');
  });

  it('creates a WON CRM lead and after-sale tasks in the same POS transaction', async () => {
    const writes: Array<{ col: string; docId: string; data: any }> = [];
    let generated = 0;
    const db: any = {
      collection: (col: string) => ({
        doc: (docId?: string) => ({ col, docId: docId || `${col}-${++generated}` })
      }),
      runTransaction: async (callback: any) => callback({
        get: async (ref: any) => {
          if (ref.col === 'checkoutRequests') return { exists: false };
          if (ref.col === 'warehouses') return { exists: true, data: () => ({ id: 'KHO01', branchId: 'CN01', isActive: true }) };
          if (ref.col === 'branches') return { exists: true, data: () => ({ id: 'CN01', code: 'CN01', name: 'Chi nhánh 01', isActive: true }) };
          if (ref.col === 'funds') return { exists: true, data: () => ({ name: 'Tiền mặt', type: 'CASH', branchId: 'CN01', active: true }) };
          if (ref.col === 'devices') return { exists: true, data: () => ({ model: 'iPhone 15 Pro Max', storage: '256GB', condition: 'Like New', imei: '55555', sellPrice: 20000000, status: 'in_stock', branchId: 'CN01', currentLocationId: 'KHO01' }) };
          if (ref.col === 'operationalConfigs' && ref.docId === 'sales') return { exists: true, data: () => ({ name: 'Sales', version: '1', isActive: true, commissionTags: [] }) };
          if (ref.col === 'operationalConfigs' && ref.docId === 'retailPricing') return { exists: false };
          return { exists: false };
        },
        set: (ref: any, data: any) => writes.push({ col: ref.col, docId: ref.docId, data }),
        update: (ref: any, data: any) => writes.push({ col: ref.col, docId: ref.docId, data }),
        delete: () => undefined
      })
    };

    const result = await executeAtomicCheckout(db, {
      deviceIds: ['DEV-01'], branchId: 'CN01', warehouseId: 'KHO01', customerName: 'Anh Tân', customerPhone: '0905000001',
      payment: { method: 'CASH', fundId: 'FUND-01' }, idempotencyKey: 'POS_CRM_POSTSALE_001'
    }, { uid: 'SALE-01', role: 'SALES', name: 'Sale 01', branchId: 'CN01' });

    const leadWrite = writes.find(write => write.col === 'leads');
    const tasks = writes.filter(write => write.col === 'crmTasks');
    expect(result.success).toBe(true);
    expect(leadWrite?.data).toMatchObject({ status: 'won', phoneNormalized: '0905000001', wonInvoiceId: result.invoiceId });
    expect(tasks).toHaveLength(4);
    expect(tasks.every(write => write.data.scope === 'POST_SALE' && write.data.sourceEntityId === result.invoiceId)).toBe(true);
  });
});
