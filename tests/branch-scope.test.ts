import { describe, expect, it } from 'vitest';
import { recordBelongsToBranch, resolveRecordBranch } from '../src/utils/branchScope';

const branches = [
  { id: 'BR_TONG', code: 'TONG', name: 'Tổng Kho', isActive: true },
  { id: 'BR_PH', code: 'PH109', name: 'PhoneHouse Đà Nẵng - 109 Hàm Nghi', isActive: true },
  { id: 'BR_XS', code: 'XSTORE', name: 'XStore', isActive: true }
] as any[];

const warehouses = [
  { id: 'WH_PH', code: 'KHO_PH', name: 'Kho PhoneHouse', branchId: 'BR_PH' },
  { id: 'WH_XS', code: 'KHO_XS', name: 'Kho XStore', branchId: 'BR_XS' }
] as any[];

describe('canonical branch scope', () => {
  it('prioritizes branchId over a stale legacy branch label', () => {
    const invoice = { branchId: 'BR_PH', branch: 'Tổng Kho', warehouseId: 'WH_PH' };
    expect(resolveRecordBranch(invoice, branches, warehouses)?.id).toBe('BR_PH');
    expect(recordBelongsToBranch(invoice, 'BR_PH', branches, warehouses)).toBe(true);
    expect(recordBelongsToBranch(invoice, 'BR_TONG', branches, warehouses)).toBe(false);
  });

  it('does not leak a different branch invoice merely because the legacy label is blank', () => {
    const invoice = { branchId: 'BR_XS', branch: '', warehouseId: 'WH_XS' };
    expect(recordBelongsToBranch(invoice, 'BR_PH', branches, warehouses)).toBe(false);
  });

  it('does not let a legacy label override an unknown canonical branchId', () => {
    const invoice = { branchId: 'REMOVED_BRANCH', branch: 'PhoneHouse Đà Nẵng - 109 Hàm Nghi' };
    expect(resolveRecordBranch(invoice, branches, warehouses)).toBeUndefined();
    expect(recordBelongsToBranch(invoice, 'BR_PH', branches, warehouses)).toBe(false);
  });

  it('recovers legacy invoices from warehouse or an exact normalized branch name', () => {
    expect(resolveRecordBranch({ warehouseId: 'WH_PH' }, branches, warehouses)?.id).toBe('BR_PH');
    expect(resolveRecordBranch({ branch: 'PhoneHouse Da Nang 109 Ham Nghi' }, branches, warehouses)?.id).toBe('BR_PH');
  });

  it('keeps unresolved legacy invoices out of a branch-specific scope', () => {
    expect(recordBelongsToBranch({ branch: 'Không xác định' }, 'BR_PH', branches, warehouses)).toBe(false);
    expect(recordBelongsToBranch({ branch: 'Không xác định' }, 'ALL', branches, warehouses)).toBe(true);
  });
});
