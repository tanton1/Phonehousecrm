import { describe, expect, it } from 'vitest';
import { buildInventoryVisualLedger } from '../src/components/InventoryVisualLedger';
import { DeviceItem, MasterCatalogItem } from '../src/types';

const device = (id: string, overrides: Partial<DeviceItem>): DeviceItem => ({
  id,
  imei: id,
  model: 'iPhone 15 Pro Max',
  storage: '256GB',
  color: 'Titan tự nhiên',
  condition: 'Like New',
  status: 'in_stock',
  ...overrides
} as DeviceItem);

describe('visual inventory ledger', () => {
  it('groups IMEIs by model, storage and color while keeping condition columns separate', () => {
    const result = buildInventoryVisualLedger([
      device('11111', { condition: 'Like New' }),
      device('22222', { condition: '99% Keng' }),
      device('33333', { condition: '98% Cấn Nhẹ', color: 'Titan đen' })
    ]);

    expect(result.modelCount).toBe(1);
    expect(result.variantCount).toBe(2);
    expect(result.conditionCounts.LIKE_NEW).toBe(1);
    expect(result.conditionCounts.GRADE_99).toBe(1);
    expect(result.conditionCounts.GRADE_98).toBe(1);
    const naturalRow = result.rows.find(row => row.color === 'Titan tự nhiên');
    expect(result.rows[0].modelRowSpan).toBe(2);
    expect(naturalRow?.cells.LIKE_NEW.map(item => item.imei)).toEqual(['11111']);
    expect(naturalRow?.cells.GRADE_99.map(item => item.imei)).toEqual(['22222']);
  });

  it('orders models, storage, colors and IMEIs naturally for predictable visual scanning', () => {
    const result = buildInventoryVisualLedger([
      device('99999', { model: 'iPhone 15', storage: '256GB', color: 'Đen' }),
      device('22222', { model: 'iPhone 14', storage: '128GB', color: 'Trắng' }),
      device('11111', { model: 'iPhone 14', storage: '128GB', color: 'Trắng' })
    ]);

    expect(result.rows.map(row => row.model)).toEqual(['iPhone 14', 'iPhone 15']);
    expect(result.rows[0].cells.LIKE_NEW.map(item => item.imei)).toEqual(['11111', '22222']);
  });

  it('can project active Product Master variants with zero stock like the printed stock sheet', () => {
    const catalogItem = {
      id: 'CAT-IP15-128-BLUE',
      sku: 'IP15-128-BLUE',
      name: 'iPhone 15 128GB Blue',
      category: 'DEVICE',
      model: 'iPhone 15',
      storage: '128GB',
      color: 'Blue',
      lifecycleStatus: 'ACTIVE',
      status: 'active',
      defaultImportPrice: 0,
      defaultRetailPrice: 0
    } as MasterCatalogItem;

    const result = buildInventoryVisualLedger([], [catalogItem]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ model: 'iPhone 15', storage: '128GB', color: 'Blue', total: 0 });
  });
});
