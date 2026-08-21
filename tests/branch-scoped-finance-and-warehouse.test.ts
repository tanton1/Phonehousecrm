import { describe, expect, it } from 'vitest';
import { validateFinanceAccountDraft } from '../server/routes/finance';
import { validateOperationalConfig, validateWarehouseDraft } from '../server/routes/configuration';

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
      id: 'W1', branchId: 'CN01', code: 'W1', name: 'Kho', isMain: true, parentWarehouseId: 'MAIN', custodianUid: 'USER_01'
    })).toThrow(/MAIN_WAREHOUSE_CANNOT_HAVE_PARENT/);
  });
});

describe('Mandatory operational setup', () => {
  it('validates Sales configuration without injecting business defaults', () => {
    expect(() => validateOperationalConfig('sales', { name: 'Sales 2026', version: 'v1' })).toThrow(/SALES_CONFIG_INVALID/);
    expect(validateOperationalConfig('sales', {
      name: 'Sales 2026', version: 'v1', deviceProfitPercent: 4, accessoryProfitPercent: 8,
      onlineSaleSplitPercent: 50, maxDiscountPercent: 3, defaultMonthlyTarget: 800000000, isActive: true
    })).toMatchObject({ id: 'sales', deviceProfitPercent: 4, isActive: true });
  });

  it('requires an explicit CSKH schedule', () => {
    expect(() => validateOperationalConfig('customerCare', {
      name: 'CSKH', version: 'v1', firstResponseMinutes: 15, followUpAttempts: 3, followUpDays: []
    })).toThrow(/CUSTOMER_CARE_CONFIG_INVALID/);
    expect(validateOperationalConfig('customerCare', {
      name: 'CSKH', version: 'v1', firstResponseMinutes: 15, followUpAttempts: 3,
      followUpDays: [7, 1, 7, 30], requireEvidence: true, requireQaApproval: true, isActive: true
    })).toMatchObject({ id: 'customerCare', followUpDays: [1, 7, 30], isActive: true });
  });
});
