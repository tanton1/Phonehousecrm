import { describe, expect, it } from 'vitest';
import { debtOpenItemId, newDebtOpenItemRecord } from '../server/services/branchPartyService';
import {
  buildDebtOpenItemReconciliationPlan,
  DebtOpenItemPlanningInput,
  DebtSourceDocument,
  ReconciliationDocument,
  reconcileDebtOpenItems
} from '../server/services/debtOpenItemReconciliationService';
import type { Firestore } from 'firebase-admin/firestore';

const generatedAt = '2026-08-31T12:00:00.000Z';

function source(
  sourceType: DebtSourceDocument['sourceType'],
  id: string,
  data: Record<string, any>
): DebtSourceDocument {
  return { sourceType, id, data };
}

function document(id: string, data: Record<string, any>): ReconciliationDocument {
  return { id, data };
}

function baseInput(overrides: Partial<DebtOpenItemPlanningInput> = {}): DebtOpenItemPlanningInput {
  return {
    sources: [source('PURCHASE_ORDER', 'PO-1', {
      branchId: 'CN01', supplierId: 'SUP-1', code: 'PN-001', status: 'COMPLETED',
      debtAmount: 700_000, paidAmount: 300_000, partyMasterId: 'PTY-1', branchSupplierAccountId: 'BPA-1',
      createdAt: '2026-08-01T02:00:00.000Z'
    })],
    partners: [document('SUP-1', {
      id: 'SUP-1', branchId: 'CN01', type: 'SUPPLIER', name: 'Nhà cung cấp', phone: '0905000001',
      partyMasterId: 'PTY-1', branchPartyAccountId: 'BPA-1', isActive: true
    })],
    accounts: [document('BPA-1', {
      id: 'BPA-1', branchId: 'CN01', partyMasterId: 'PTY-1', legacyPartnerId: 'SUP-1',
      type: 'SUPPLIER', status: 'ACTIVE', payableBalance: 700_000, receivableBalance: 0
    })],
    partyMasters: [document('PTY-1', { id: 'PTY-1', status: 'ACTIVE' })],
    openItems: [],
    generatedAt,
    actorUid: 'AUDITOR-1',
    scanComplete: true,
    ...overrides
  };
}

describe('debt open-item reconciliation planning', () => {
  it('requires a concrete branch and explicit actor before apply can touch Firestore', async () => {
    const neverReachedDb = {} as Firestore;
    await expect(reconcileDebtOpenItems(neverReachedDb, {
      apply: true,
      actorUid: 'ADMIN-1'
    })).rejects.toThrow('DEBT_RECONCILIATION_APPLY_BRANCH_REQUIRED');
    await expect(reconcileDebtOpenItems(neverReachedDb, {
      apply: true,
      branchId: 'CN01'
    })).rejects.toThrow('DEBT_RECONCILIATION_APPLY_ACTOR_REQUIRED');
    await expect(reconcileDebtOpenItems(neverReachedDb, {
      apply: true,
      branchId: 'ALL',
      actorUid: 'ADMIN-1'
    })).rejects.toThrow('DEBT_RECONCILIATION_BRANCH_INVALID');
  });

  it('plans one deterministic create only when source and account projection match', () => {
    const plan = buildDebtOpenItemReconciliationPlan(baseInput());
    const entry = plan.entries[0];
    expect(entry).toMatchObject({
      sourceType: 'PURCHASE_ORDER', sourceId: 'PO-1', expectedOpenAmount: 700_000,
      outcome: 'READY_TO_CREATE', partyAccountId: 'BPA-1', partyMasterId: 'PTY-1'
    });
    expect(entry.deterministicOpenItemId).toBe(debtOpenItemId('PURCHASE_ORDER', 'PO-1', 'PAYABLE'));
    expect(entry.record).toMatchObject({
      id: entry.deterministicOpenItemId,
      originalAmount: 1_000_000,
      settledAmount: 300_000,
      openAmount: 700_000,
      status: 'PARTIAL',
      reconciliationBackfill: true
    });
    expect(plan.summary).toMatchObject({ readyToCreate: 1, accountMismatch: 0 });
  });

  it('never recreates or overwrites a terminal item whose source appears open', () => {
    const terminal = newDebtOpenItemRecord({
      branchId: 'CN01', partyAccountId: 'BPA-1', partyMasterId: 'PTY-1', legacyPartnerId: 'SUP-1',
      direction: 'PAYABLE', sourceType: 'PURCHASE_ORDER', sourceDocumentId: 'PO-1', originalAmount: 700_000,
      settledAmount: 700_000, actorUid: 'OLD', occurredAt: generatedAt
    });
    const plan = buildDebtOpenItemReconciliationPlan(baseInput({ openItems: [document(terminal.id, terminal)] }));
    expect(plan.entries[0]).toMatchObject({
      outcome: 'BLOCKED', reason: 'DEBT_RECONCILIATION_TERMINAL_ITEM_WOULD_REOPEN'
    });
    expect(plan.entries[0].record).toBeUndefined();
    expect(plan.summary.readyToCreate).toBe(0);
  });

  it('blocks a deterministic terminal item even when that item carries the wrong branch', () => {
    const terminal = {
      ...newDebtOpenItemRecord({
        branchId: 'CN01', partyAccountId: 'BPA-1', partyMasterId: 'PTY-1', legacyPartnerId: 'SUP-1',
        direction: 'PAYABLE', sourceType: 'PURCHASE_ORDER', sourceDocumentId: 'PO-1', originalAmount: 700_000,
        settledAmount: 700_000, actorUid: 'OLD', occurredAt: generatedAt
      }),
      branchId: 'CN-WRONG'
    };
    const plan = buildDebtOpenItemReconciliationPlan(baseInput({ openItems: [document(terminal.id, terminal)] }));
    expect(plan.entries[0]).toMatchObject({
      deterministicOpenItemId: terminal.id,
      existingOpenItemIds: [terminal.id],
      outcome: 'BLOCKED',
      reason: 'DEBT_RECONCILIATION_TERMINAL_ITEM_WOULD_REOPEN'
    });
    expect(plan.summary.readyToCreate).toBe(0);
  });

  it('reports duplicate legacy items as ambiguous instead of creating a third item', () => {
    const item = newDebtOpenItemRecord({
      branchId: 'CN01', partyAccountId: 'BPA-1', partyMasterId: 'PTY-1', legacyPartnerId: 'SUP-1',
      direction: 'PAYABLE', sourceType: 'PURCHASE_ORDER', sourceDocumentId: 'PO-1', originalAmount: 1_000_000,
      settledAmount: 300_000, actorUid: 'OLD', occurredAt: generatedAt
    });
    const plan = buildDebtOpenItemReconciliationPlan(baseInput({
      openItems: [document('LEGACY-1', item), document('LEGACY-2', item)]
    }));
    expect(plan.entries[0]).toMatchObject({
      outcome: 'AMBIGUOUS', reason: 'DEBT_RECONCILIATION_MULTIPLE_OPEN_ITEMS'
    });
    expect(plan.summary).toMatchObject({ readyToCreate: 0, ambiguous: 1 });
  });

  it('blocks backfill when directional account balance does not equal all source debt', () => {
    const plan = buildDebtOpenItemReconciliationPlan(baseInput({
      accounts: [document('BPA-1', {
        id: 'BPA-1', branchId: 'CN01', partyMasterId: 'PTY-1', legacyPartnerId: 'SUP-1',
        type: 'SUPPLIER', status: 'ACTIVE', payableBalance: 900_000, receivableBalance: 0
      })]
    }));
    expect(plan.entries[0]).toMatchObject({
      outcome: 'MISMATCH', reason: 'DEBT_RECONCILIATION_ACCOUNT_BALANCE_MISMATCH'
    });
    expect(plan.accountChecks[0]).toMatchObject({ expectedOpenAmount: 700_000, accountBalance: 900_000, matches: false });
    expect(plan.summary.readyToCreate).toBe(0);
  });

  it('reports identity mismatches and truncated scans without applying assumptions', () => {
    const identityPlan = buildDebtOpenItemReconciliationPlan(baseInput({
      partners: [document('SUP-1', {
        id: 'SUP-1', branchId: 'CN01', type: 'SUPPLIER', phone: '0905000001',
        partyMasterId: 'PTY-1', branchPartyAccountId: 'BPA-OTHER', isActive: true
      })]
    }));
    expect(identityPlan.entries[0]).toMatchObject({
      outcome: 'MISMATCH', reason: 'DEBT_RECONCILIATION_SOURCE_ACCOUNT_MISMATCH'
    });

    const truncatedPlan = buildDebtOpenItemReconciliationPlan(baseInput({ scanComplete: false }));
    expect(truncatedPlan.entries[0]).toMatchObject({
      outcome: 'BLOCKED', reason: 'DEBT_RECONCILIATION_SCAN_TRUNCATED'
    });
    expect(truncatedPlan.summary.readyToCreate).toBe(0);
  });

  it('supports invoice and technical receivables while keeping the two source formulas distinct', () => {
    const customer = document('CUS-1', {
      id: 'CUS-1', branchId: 'CN01', type: 'CUSTOMER', phone: '0905000002',
      partyMasterId: 'PTY-C', branchPartyAccountId: 'BPA-C', isActive: true
    });
    const plan = buildDebtOpenItemReconciliationPlan(baseInput({
      sources: [
        source('INVOICE', 'INV-1', {
          branchId: 'CN01', customerId: 'CUS-1', invoiceCode: 'HD-1', debtAmount: 400_000,
          debtCollections: [{ amount: 100_000 }], customerPartyMasterId: 'PTY-C', branchCustomerAccountId: 'BPA-C'
        }),
        source('TECHNICAL_WORK_ORDER', 'WO-1', {
          branchId: 'CN01', customerId: 'CUS-1', code: 'WO-1', balanceDue: 600_000, paidAmount: 200_000,
          partyMasterId: 'PTY-C', branchPartyAccountId: 'BPA-C', status: 'DELIVERED_TO_CUSTOMER'
        })
      ],
      partners: [customer],
      accounts: [document('BPA-C', {
        id: 'BPA-C', branchId: 'CN01', partyMasterId: 'PTY-C', legacyPartnerId: 'CUS-1',
        type: 'CUSTOMER', status: 'ACTIVE', payableBalance: 0, receivableBalance: 1_000_000
      })],
      partyMasters: [document('PTY-C', { id: 'PTY-C', status: 'ACTIVE' })]
    }));
    expect(plan.summary.readyToCreate).toBe(2);
    expect(plan.entries.find(entry => entry.sourceType === 'INVOICE')?.record).toMatchObject({
      originalAmount: 500_000, settledAmount: 100_000, openAmount: 400_000
    });
    expect(plan.entries.find(entry => entry.sourceType === 'TECHNICAL_WORK_ORDER')?.record).toMatchObject({
      originalAmount: 800_000, settledAmount: 200_000, openAmount: 600_000
    });
  });
});
