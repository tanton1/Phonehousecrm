import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('dedicated IMEI inventory matrix page', () => {
  it('is a separate route from the operational IMEI inventory page', () => {
    const app = source('src/App.tsx');
    const navigation = source('src/app/navigationConfig.ts');
    const inventory = source('src/components/InventoryView.tsx');

    expect(navigation).toContain("id: 'inventory-matrix'");
    expect(app).toContain("activeTab === 'inventory-matrix'");
    expect(inventory).not.toContain("import { InventoryVisualLedger }");
  });

  it('defines the requested vertical and horizontal axes and keeps IMEI history links in cells', () => {
    const page = source('src/components/InventoryMatrixPage.tsx');
    const grid = source('src/components/InventoryVisualLedger.tsx');

    expect(page).toContain('Trục tung: Máy → Dung lượng → Màu');
    expect(page).toContain('Trục hoành: Ngoại hình máy');
    expect(grid).toContain('<ImeiLink');
    expect(grid).toContain('visibleConditionColumns.map');
  });
});
