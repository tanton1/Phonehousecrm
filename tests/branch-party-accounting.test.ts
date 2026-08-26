import { describe, expect, it } from 'vitest';
import {
  assertPartnerForBranch,
  debtLedgerEntry,
  ensureBranchPartner,
  mergeBranchPartyType,
  newBranchPartyAccountRecord,
  resolvePartyIdentity
} from '../server/services/branchPartyService';

function branchPartyDb(seed: Record<string, Record<string, any>>) {
  const store = new Map<string, any>();
  Object.entries(seed).forEach(([collection, docs]) => Object.entries(docs).forEach(([id, value]) => {
    store.set(`${collection}/${id}`, { ...value });
  }));
  const snapshot = (collection: string, id: string) => ({
    id,
    exists: store.has(`${collection}/${id}`),
    data: () => store.get(`${collection}/${id}`)
  });
  const reference = (collection: string, id: string) => ({ collection, id });
  const db: any = {
    collection: (collection: string) => ({ doc: (id: string) => reference(collection, id) }),
    runTransaction: async (handler: (transaction: any) => Promise<any>) => handler({
      get: async (ref: any) => snapshot(ref.collection, ref.id),
      create: (ref: any, value: any) => {
        const key = `${ref.collection}/${ref.id}`;
        if (store.has(key)) throw new Error('ALREADY_EXISTS');
        store.set(key, { ...value });
      },
      set: (ref: any, value: any, options?: { merge?: boolean }) => {
        const key = `${ref.collection}/${ref.id}`;
        store.set(key, options?.merge ? { ...(store.get(key) || {}), ...value } : { ...value });
      },
      update: (ref: any, value: any) => {
        const key = `${ref.collection}/${ref.id}`;
        if (!store.has(key)) throw new Error('NOT_FOUND');
        store.set(key, { ...store.get(key), ...value });
      }
    })
  };
  return { db, get: (collection: string, id: string) => store.get(`${collection}/${id}`) };
}

describe('Shared party identity with isolated branch accounts', () => {
  it('reuses one master identity but creates a different account for every branch', () => {
    const partner = { id: 'SUP_A', type: 'SUPPLIER', name: 'Công ty XYZ', phone: '+84 905 000 001' };
    const branchA = resolvePartyIdentity(partner, 'CN_A');
    const branchB = resolvePartyIdentity(partner, 'CN_B');

    expect(branchA.partyMasterId).toBe(branchB.partyMasterId);
    expect(branchA.branchPartyAccountId).not.toBe(branchB.branchPartyAccountId);
    const accountA = newBranchPartyAccountRecord(partner, 'CN_A', branchA, 'ADMIN', '2026-08-26T00:00:00.000Z');
    const accountB = newBranchPartyAccountRecord(partner, 'CN_B', branchB, 'ADMIN', '2026-08-26T00:00:00.000Z');
    expect(accountA).toMatchObject({ branchId: 'CN_A', payableBalance: 0, receivableBalance: 0 });
    expect(accountB).toMatchObject({ branchId: 'CN_B', payableBalance: 0, receivableBalance: 0 });
  });

  it('keeps posted references immutable when identity text is edited', () => {
    const original = resolvePartyIdentity({ phone: '0905000001' }, 'CN_A');
    const edited = resolvePartyIdentity({
      phone: '0905999999',
      partyMasterId: original.partyMasterId,
      branchPartyAccountId: original.branchPartyAccountId
    }, 'CN_A');
    expect(edited.partyMasterId).toBe(original.partyMasterId);
    expect(edited.branchPartyAccountId).toBe(original.branchPartyAccountId);
  });

  it('rejects a supplier from another branch or a customer used as supplier', () => {
    expect(() => assertPartnerForBranch(
      { branchId: 'CN_B', type: 'SUPPLIER' }, 'CN_A', ['SUPPLIER', 'BOTH'], 'PURCHASE_SUPPLIER'
    )).toThrow('PURCHASE_SUPPLIER_BRANCH_MISMATCH');
    expect(() => assertPartnerForBranch(
      { branchId: 'CN_A', type: 'CUSTOMER' }, 'CN_A', ['SUPPLIER', 'BOTH'], 'PURCHASE_SUPPLIER'
    )).toThrow('PURCHASE_SUPPLIER_TYPE_INVALID');
  });

  it('creates one-sided immutable debt ledger entries', () => {
    const entry = debtLedgerEntry({
      id: 'DLE_01', branchId: 'CN_A', partyAccountId: 'BPA_01', legacyPartnerId: 'SUP_01',
      direction: 'PAYABLE', sourceType: 'PURCHASE_ORDER', sourceDocumentId: 'PO_01',
      debitIncrease: 12_000_000, actorUid: 'ADMIN', occurredAt: '2026-08-26T00:00:00.000Z'
    });
    expect(entry).toMatchObject({ debitIncrease: 12_000_000, creditDecrease: 0, balanceDelta: 12_000_000, status: 'POSTED' });
    expect(() => debtLedgerEntry({
      id: 'DLE_BAD', branchId: 'CN_A', partyAccountId: 'BPA_01', legacyPartnerId: 'SUP_01',
      direction: 'PAYABLE', sourceType: 'PAYMENT', sourceDocumentId: 'PAY_01',
      debitIncrease: 1, creditDecrease: 1, actorUid: 'ADMIN', occurredAt: '2026-08-26T00:00:00.000Z'
    })).toThrow('DEBT_LEDGER_ONE_SIDED_ENTRY_REQUIRED');
  });

  it('upgrades a customer account to BOTH when the same phone is added as supplier', () => {
    expect(mergeBranchPartyType('CUSTOMER', 'SUPPLIER')).toBe('BOTH');
    expect(mergeBranchPartyType('SUPPLIER', 'SUPPLIER')).toBe('SUPPLIER');
  });

  it('repairs and reuses a branchless legacy supplier instead of rejecting the duplicate phone', async () => {
    const identity = resolvePartyIdentity({ phone: '0905000001' }, 'CN_A');
    const { db, get } = branchPartyDb({
      branches: { CN_A: { id: 'CN_A', isActive: true } },
      partyMasters: {
        [identity.partyMasterId]: {
          id: identity.partyMasterId,
          displayName: 'NCC cũ',
          phoneNormalized: '0905000001',
          status: 'ACTIVE'
        }
      },
      branchPartyAccounts: {
        [identity.branchPartyAccountId]: {
          id: identity.branchPartyAccountId,
          branchId: 'CN_A',
          partyMasterId: identity.partyMasterId,
          legacyPartnerId: 'SUP_LEGACY',
          type: 'SUPPLIER',
          payableBalance: 125000,
          status: 'ACTIVE'
        }
      },
      partners: {
        SUP_LEGACY: {
          id: 'WRONG_EMBEDDED_ID',
          name: 'NCC cũ',
          phone: '0905000001',
          type: 'SUPPLIER',
          outstandingDebt: 125000,
          isActive: true
        }
      }
    });

    const result = await ensureBranchPartner(db, {
      id: 'SUP_NEW_CLIENT_ID',
      branchId: 'CN_A',
      details: { name: 'NCC cũ đã sửa tên', phone: '0905000001', type: 'SUPPLIER' }
    }, 'ADMIN_01');

    expect(result).toMatchObject({ created: false, repaired: true });
    expect(result.partner).toMatchObject({
      id: 'SUP_LEGACY',
      branchId: 'CN_A',
      name: 'NCC cũ đã sửa tên',
      outstandingDebt: 125000,
      branchPartyAccountId: identity.branchPartyAccountId
    });
    expect(get('partners', 'SUP_LEGACY')).toMatchObject({ id: 'SUP_LEGACY', branchId: 'CN_A' });
    expect(get('branchPartyAccounts', identity.branchPartyAccountId)).toMatchObject({
      legacyPartnerId: 'SUP_LEGACY',
      branchId: 'CN_A',
      status: 'ACTIVE'
    });
    expect(get('partners', 'SUP_NEW_CLIENT_ID')).toBeUndefined();
  });
});
