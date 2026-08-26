import { describe, expect, it } from 'vitest';
import {
  assertPartnerForBranch,
  debtLedgerEntry,
  newBranchPartyAccountRecord,
  resolvePartyIdentity
} from '../server/services/branchPartyService';

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
});

