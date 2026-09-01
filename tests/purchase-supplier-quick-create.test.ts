import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARTNER_FINANCE_ROLES, PARTNER_OPERATION_ROLES } from '../server/routes/partners';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('Purchase-order quick supplier creation', () => {
  it('connects both purchase entry screens to the server-backed partner writer', () => {
    const app = source('src/App.tsx');
    const inventory = source('src/components/InventoryView.tsx');
    const purchaseOrders = source('src/components/PurchaseOrdersView.tsx');

    expect(app.match(/onAddPartner=\{handleAddPartner\}/g)?.length).toBeGreaterThanOrEqual(2);
    expect(inventory).toContain('onAddPartner={onAddPartner}');
    expect(purchaseOrders).toContain('onAddPartner={onAddPartner}');
  });

  it('selects a supplier only after the server returns a persisted branch partner', () => {
    const form = source('src/components/UniformEntryForm.tsx');

    expect(form).toContain("throw new Error('PARTNER_CREATE_HANDLER_MISSING')");
    expect(form).toContain("throw new Error('PARTNER_CREATE_NO_SERVER_RESPONSE')");
    expect(form).toContain("throw new Error('PARTNER_CREATE_BRANCH_MISMATCH')");
    expect(form).not.toContain('savedPartner || newPartner');
  });

  it('allows inventory operators to list and create branch suppliers', () => {
    expect(PARTNER_OPERATION_ROLES).toEqual(expect.arrayContaining([
      'INVENTORY_MANAGER',
      'WAREHOUSE',
      'STORE_MANAGER',
      'REGIONAL_MANAGER'
    ]));
  });

  it('keeps directional partner balances limited to finance-view roles', () => {
    expect(PARTNER_FINANCE_ROLES).toEqual(expect.arrayContaining([
      'ADMIN', 'REGIONAL_MANAGER', 'MANAGER', 'STORE_MANAGER', 'ACCOUNTANT'
    ]));
    ['SALES', 'CUSTOMER_CARE', 'CASHIER', 'INVENTORY_MANAGER', 'WAREHOUSE']
      .forEach(role => expect(PARTNER_FINANCE_ROLES).not.toContain(role));
  });
});
