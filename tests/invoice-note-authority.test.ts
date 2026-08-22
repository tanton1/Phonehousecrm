import { describe, expect, it } from 'vitest';
import { processUpdateInvoiceNote } from '../server/services/checkoutService';

function createDb() {
  const data = new Map<string, any>([[
    'invoices/INV_01',
    { id: 'INV_01', invoiceCode: 'HD-01', branchId: 'CN01', notes: '', history: [] }
  ]]);
  let autoId = 0;
  const ref = (col: string, id?: string) => ({ col, id: id || `AUTO_${++autoId}` });
  const db: any = {
    collection: (col: string) => ({ doc: (id?: string) => ref(col, id) }),
    runTransaction: async (callback: any) => callback({
      get: async (target: any) => ({ id: target.id, ref: target, exists: data.has(`${target.col}/${target.id}`), data: () => data.get(`${target.col}/${target.id}`) }),
      update: (target: any, value: any) => data.set(`${target.col}/${target.id}`, { ...data.get(`${target.col}/${target.id}`), ...value }),
      set: (target: any, value: any) => data.set(`${target.col}/${target.id}`, { ...value })
    })
  };
  return { db, data };
}

describe('Server-authoritative invoice notes', () => {
  it('updates only operational notes and creates an audit event', async () => {
    const { db, data } = createDb();
    const invoice = await processUpdateInvoiceNote(db, 'INV_01', 'Khách hẹn lấy máy 18:00', {
      uid: 'SALE_01', role: 'SALES', branchId: 'CN01', name: 'Sale A'
    });
    expect(invoice.notes).toBe('Khách hẹn lấy máy 18:00');
    expect(data.get('invoices/INV_01').history).toHaveLength(1);
    expect([...data.entries()].find(([key]) => key.startsWith('invoiceEvents/'))?.[1]).toMatchObject({
      invoiceId: 'INV_01', branchId: 'CN01', eventType: 'NOTE_UPDATED', actorUid: 'SALE_01'
    });
  });

  it('rejects a staff member from another branch', async () => {
    const { db, data } = createDb();
    await expect(processUpdateInvoiceNote(db, 'INV_01', 'Sai chi nhánh', {
      uid: 'SALE_02', role: 'SALES', branchId: 'CN02'
    })).rejects.toThrow('INVOICE_BRANCH_FORBIDDEN');
    expect(data.get('invoices/INV_01').notes).toBe('');
  });
});
