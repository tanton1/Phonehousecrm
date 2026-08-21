import { describe, expect, it } from 'vitest';
import { financeAccountIdFromDraft, validateFinanceAccountDraft } from '../server/routes/finance';
import { calculateBranchWarehouseCoverage, isWarehouseRecordActive, validateOperationalConfig, validateWarehouseDraft, warehouseHasBlockingDevices } from '../server/routes/configuration';
import { normalizeOperationalPolicyVersions, operationalPolicyPeriodsOverlap, selectEffectiveOperationalPolicy } from '../server/services/operationalPolicyService';

describe('Branch-scoped finance accounts', () => {
  it('rejects missing and global branch identifiers', () => {
    expect(() => validateFinanceAccountDraft({ name: 'Két tiền', type: 'CASH' })).toThrow(/BRANCH_REQUIRED/);
    expect(() => validateFinanceAccountDraft({ branchId: 'ALL', name: 'Két tiền', type: 'CASH' })).toThrow(/BRANCH_REQUIRED/);
  });

  it('requires complete bank identity and accepts multiple distinct accounts for one branch', () => {
    expect(() => validateFinanceAccountDraft({ branchId: 'CN01', name: 'VCB', type: 'BANK' })).toThrow(/BANK_FIELDS_REQUIRED/);

    const first = validateFinanceAccountDraft({
      branchId: 'CN01', type: 'BANK', name: 'VCB bán hàng',
      bankName: 'Vietcombank', accountNumber: '001 234 5678', accountHolder: 'PHONE HOUSE'
    });
    const second = validateFinanceAccountDraft({
      branchId: 'CN01', type: 'BANK', name: 'Techcombank QR',
      bankName: 'Techcombank', accountNumber: '1903666888999', accountHolder: 'PHONE HOUSE'
    });

    expect(first.branchId).toBe('CN01');
    expect(first.accountNumber).toBe('0012345678');
    expect(second.accountNumber).toBe('1903666888999');
  });

  it('derives a stable finance account id from one client creation request', () => {
    const requestId = 'FUND-DRAFT-1787300000000-abcd1234';
    expect(financeAccountIdFromDraft('CN01', 'CASH', requestId, 1)).toBe(financeAccountIdFromDraft('CN01', 'CASH', requestId, 2));
    expect(financeAccountIdFromDraft('CN01', 'CASH', requestId, 1)).toContain('1787300000000-abcd1234');
  });
});

describe('Branch-scoped warehouse hierarchy', () => {
  it('rejects warehouses without a concrete branch', () => {
    expect(() => validateWarehouseDraft({ id: 'W1', code: 'W1', name: 'Kho 1' })).toThrow(/WAREHOUSE_BRANCH_REQUIRED/);
    expect(() => validateWarehouseDraft({ id: 'W1', branchId: 'ALL', code: 'W1', name: 'Kho 1' })).toThrow(/WAREHOUSE_BRANCH_REQUIRED/);
  });

  it('requires both main parent and responsible employee for a child warehouse', () => {
    expect(() => validateWarehouseDraft({
      id: 'CHILD', branchId: 'CN01', code: 'CHILD', name: 'Kho con', type: 'TECHNICIAN_SUB'
    })).toThrow(/CHILD_WAREHOUSE_PARENT_REQUIRED/);

    expect(() => validateWarehouseDraft({
      id: 'CHILD', branchId: 'CN01', code: 'CHILD', name: 'Kho con', type: 'TECHNICIAN_SUB', parentWarehouseId: 'MAIN'
    })).toThrow(/CHILD_WAREHOUSE_CUSTODIAN_REQUIRED/);

    expect(validateWarehouseDraft({
      id: 'CHILD', branchId: 'CN01', code: 'child', name: 'Kho con', type: 'TECHNICIAN_SUB',
      parentWarehouseId: 'MAIN', custodianUid: 'USER_01'
    })).toMatchObject({
      branchId: 'CN01', code: 'CHILD', parentWarehouseId: 'MAIN', custodianUid: 'USER_01', isChild: true
    });
  });

  it('prevents a main warehouse from also being a child', () => {
    expect(() => validateWarehouseDraft({
      id: 'W1', branchId: 'CN01', code: 'W1', name: 'Kho', type: 'CENTRAL',
      isMain: true, parentWarehouseId: 'MAIN', custodianUid: 'USER_01'
    })).toThrow(/MAIN_WAREHOUSE_CANNOT_HAVE_PARENT/);
  });

  it('derives main-warehouse capability from the warehouse type only', () => {
    expect(validateWarehouseDraft({
      id: 'MAIN', branchId: 'CN01', code: 'MAIN', name: 'Kho tổng', type: 'CENTRAL'
    })).toMatchObject({ type: 'CENTRAL', isMain: true, isChild: false });

    expect(validateWarehouseDraft({
      id: 'RETAIL', branchId: 'CN01', code: 'RETAIL', name: 'Kho bán lẻ', type: 'RETAIL_STORE', isMain: true
    })).toMatchObject({ type: 'RETAIL_STORE', isMain: false, isChild: false });
  });

  it('allows an empty warehouse with sold-device history to be archived or reassigned', () => {
    expect(warehouseHasBlockingDevices([{ status: 'sold' }, { status: 'SOLD' }])).toBe(false);
    expect(warehouseHasBlockingDevices([{ status: 'sold' }, { status: 'in_stock' }])).toBe(true);
  });

  it('accepts any active warehouse type for branch setup coverage and ignores archived warehouses', () => {
    expect(calculateBranchWarehouseCoverage(['CN01', 'CN02'], [
      { branchId: 'CN01', type: 'RETAIL_STORE', isMain: false, isActive: true },
      { branchId: 'CN02', type: 'REPAIR_WARRANTY', isMain: false, isActive: true }
    ])).toMatchObject({ coveredBranches: 2, totalBranches: 2, complete: true });
    expect(calculateBranchWarehouseCoverage(['CN01', 'CN02'], [
      { branchId: 'CN01', type: 'CENTRAL', isMain: true, isActive: true },
      { branchId: 'CN02', type: 'RETAIL_STORE', isActive: false }
    ])).toMatchObject({ coveredBranches: 1, totalBranches: 2, complete: false });
  });

  it('does not count legacy archived flags as an active warehouse', () => {
    expect(isWarehouseRecordActive({ isActive: true, active: false })).toBe(false);
    expect(isWarehouseRecordActive({ isActive: true, isArchived: true })).toBe(false);
    expect(calculateBranchWarehouseCoverage(['CN01'], [
      { branchId: 'CN01', isActive: true, isArchived: true }
    ])).toMatchObject({ coveredBranches: 0, totalBranches: 1, complete: false });
  });
});

describe('Mandatory operational setup', () => {
  it('validates Sales configuration without injecting business defaults', () => {
    expect(() => validateOperationalConfig('sales', { policyId: 'SALE_V1', effectiveFrom: '2026-01-01', name: 'Sales 2026', version: 'v1', isActive: true })).toThrow(/SALES_CONFIG_INVALID/);
    expect(validateOperationalConfig('sales', {
      policyId: 'SALE_V1', effectiveFrom: '2026-01-01', name: 'Sales 2026', version: 'v1', deviceProfitPercent: 4, accessoryProfitPercent: 8,
      onlineSaleSplitPercent: 50, maxDiscountPercent: 3, defaultMonthlyTarget: 800000000, isActive: true,
      commissionTags: [
        { id: 'may_full_bh', name: 'Máy full BH', appliesTo: 'DEVICE', calculationType: 'FLAT', value: 150000, isActive: true },
        { id: 'phu_kien', name: 'Phụ kiện', appliesTo: 'ACCESSORY', calculationType: 'PERCENT', value: 5, isActive: true }
      ]
    })).toMatchObject({
      id: 'sales', deviceProfitPercent: 4, isActive: true,
      commissionTags: [{ id: 'MAY_FULL_BH', appliesTo: 'DEVICE', value: 150000 }, { id: 'PHU_KIEN', appliesTo: 'ACCESSORY', value: 5 }]
    });
  });

  it('rejects duplicate, invalid and inactive-only Sales commission tags', () => {
    const base = {
      policyId: 'SALE_V1', effectiveFrom: '2026-01-01', name: 'Sales 2026', version: 'v1', deviceProfitPercent: 4, accessoryProfitPercent: 8,
      onlineSaleSplitPercent: 50, maxDiscountPercent: 3, defaultMonthlyTarget: 800000000, isActive: true
    };
    expect(() => validateOperationalConfig('sales', { ...base, commissionTags: [] })).toThrow(/SALES_COMMISSION_TAG_REQUIRED/);
    expect(() => validateOperationalConfig('sales', { ...base, commissionTags: [
      { id: 'MAY', name: 'Máy', appliesTo: 'DEVICE', calculationType: 'PERCENT', value: 101, isActive: true }
    ] })).toThrow(/SALES_COMMISSION_TAG_INVALID/);
    expect(() => validateOperationalConfig('sales', { ...base, commissionTags: [
      { id: 'MAY', name: 'Máy', appliesTo: 'DEVICE', calculationType: 'FLAT', value: 100000, isActive: false }
    ] })).toThrow(/SALES_ACTIVE_COMMISSION_TAG_REQUIRED/);
  });

  it('requires an explicit CSKH schedule', () => {
    expect(() => validateOperationalConfig('customerCare', {
      policyId: 'CSKH_V1', effectiveFrom: '2026-01-01', name: 'CSKH', version: 'v1', firstResponseMinutes: 15, followUpAttempts: 3, followUpDays: [], isActive: true
    })).toThrow(/CUSTOMER_CARE_CONFIG_INVALID/);
    expect(validateOperationalConfig('customerCare', {
      policyId: 'CSKH_V1', effectiveFrom: '2026-01-01', name: 'CSKH', version: 'v1', firstResponseMinutes: 15, followUpAttempts: 3,
      followUpDays: [7, 1, 7, 30], completedFollowUpCommission: 20000, requireEvidence: true, requireQaApproval: true, isActive: true
    })).toMatchObject({ id: 'customerCare', followUpDays: [1, 7, 30], isActive: true });
  });

  it('selects one effective policy and rejects overlapping enabled periods', () => {
    const versions = normalizeOperationalPolicyVersions('sales', { versions: [
      { policyId: 'SALE_H1', name: 'H1', version: '1', effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30', isActive: true },
      { policyId: 'SALE_H2', name: 'H2', version: '2', effectiveFrom: '2026-07-01', effectiveTo: '', isActive: true }
    ] });
    expect(selectEffectiveOperationalPolicy(versions, '2026-08-21')?.policyId).toBe('SALE_H2');
    expect(operationalPolicyPeriodsOverlap(versions[0], versions[1])).toBe(false);
    expect(operationalPolicyPeriodsOverlap(versions[1], { effectiveFrom: '2026-08-01', effectiveTo: '2026-12-31', isActive: true })).toBe(true);
  });

  it('rejects incomplete or reversed policy effective dates', () => {
    const sales = {
      policyId: 'SALE_V1', name: 'Sales 2026', version: 'v1', effectiveFrom: '2026-12-31', effectiveTo: '2026-01-01',
      deviceProfitPercent: 10, accessoryProfitPercent: 15, onlineSaleSplitPercent: 50,
      maxDiscountPercent: 5, defaultMonthlyTarget: 500000000, isActive: true,
      commissionTags: [{ id: 'MAY_TEST', name: 'Máy test', appliesTo: 'DEVICE', calculationType: 'FLAT', value: 100000, isActive: true }]
    };
    expect(() => validateOperationalConfig('sales', sales)).toThrow(/POLICY_EFFECTIVE_PERIOD_INVALID/);
    expect(() => validateOperationalConfig('sales', { ...sales, effectiveFrom: '' })).toThrow(/POLICY_EFFECTIVE_PERIOD_INVALID/);
  });

  it('allows an incomplete disabled policy and tag to be saved as a draft', () => {
    expect(validateOperationalConfig('sales', {
      policyId: 'SALE_DRAFT_1', isActive: false,
      commissionTags: [{ id: 'M', name: '', appliesTo: 'DEVICE', calculationType: 'FLAT', value: null, isActive: true }]
    })).toMatchObject({ policyId: 'SALE_DRAFT_1', isActive: false, commissionTags: [{ id: 'M', value: null }] });
  });
});
