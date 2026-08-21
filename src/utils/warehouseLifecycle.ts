import { WarehouseInfo } from '../types';

type WarehouseLifecycleRecord = Partial<WarehouseInfo> & {
  active?: boolean;
  isArchived?: boolean;
};

export function isWarehouseArchived(warehouse: WarehouseLifecycleRecord): boolean {
  return warehouse.isActive === false || warehouse.active === false || warehouse.isArchived === true;
}

export function isWarehouseActive(warehouse: WarehouseLifecycleRecord): boolean {
  return !isWarehouseArchived(warehouse);
}
