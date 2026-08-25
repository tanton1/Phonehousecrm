import { StoreBranch, WarehouseInfo } from '../types';

type BranchScopedRecord = {
  branchId?: unknown;
  branch?: unknown;
  branchName?: unknown;
  warehouseId?: unknown;
  warehouse?: unknown;
  currentLocationId?: unknown;
};

function compact(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '');
}

function findBranchByReference(reference: unknown, branches: StoreBranch[]): StoreBranch | undefined {
  const raw = String(reference || '').trim();
  if (!raw) return undefined;

  const direct = branches.find(branch => branch.id === raw || branch.code === raw);
  if (direct) return direct;

  const token = compact(raw);
  if (!token) return undefined;
  const matches = branches.filter(branch => [branch.id, branch.code, branch.name].some(value => compact(value) === token));
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Resolves the canonical branch from identifiers first, then warehouse and
 * finally legacy display names. A stale legacy `branch` label can therefore
 * never override a valid `branchId`.
 */
export function resolveRecordBranch(
  record: BranchScopedRecord | null | undefined,
  branches: StoreBranch[],
  warehouses: WarehouseInfo[] = []
): StoreBranch | undefined {
  if (!record) return undefined;

  const explicitReference = String(record.branchId || '').trim();
  if (explicitReference) return findBranchByReference(explicitReference, branches);

  const locationId = String(record.currentLocationId || record.warehouseId || record.warehouse || '').trim();
  if (locationId) {
    const warehouse = warehouses.find(item => item.id === locationId || item.code === locationId);
    const warehouseBranch = warehouse ? findBranchByReference(warehouse.branchId, branches) : undefined;
    if (warehouseBranch) return warehouseBranch;
  }

  return findBranchByReference(record.branchName, branches) || findBranchByReference(record.branch, branches);
}

export function resolveRecordBranchId(
  record: BranchScopedRecord | null | undefined,
  branches: StoreBranch[],
  warehouses: WarehouseInfo[] = []
): string {
  return resolveRecordBranch(record, branches, warehouses)?.id || '';
}

export function recordBelongsToBranch(
  record: BranchScopedRecord | null | undefined,
  branchId: string | null | undefined,
  branches: StoreBranch[],
  warehouses: WarehouseInfo[] = []
): boolean {
  if (!branchId || branchId === 'ALL') return true;
  const target = findBranchByReference(branchId, branches);
  if (!target) return false;
  return resolveRecordBranchId(record, branches, warehouses) === target.id;
}
