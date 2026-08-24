import { Firestore } from 'firebase-admin/firestore';

export interface StockItemActor {
  uid: string;
  name?: string;
  role?: string;
  branchId?: string;
  assignedBranchIds?: string[];
}

const normalizedRole = (actor: StockItemActor) => String(actor.role || '').toUpperCase();

const canAccessBranch = (actor: StockItemActor, branchId: string) => {
  const role = normalizedRole(actor);
  return role === 'ADMIN'
    || role === 'REGIONAL_MANAGER'
    || actor.branchId === branchId
    || (actor.assignedBranchIds || []).includes(branchId);
};

const canViewCost = (actor: StockItemActor) => ['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(normalizedRole(actor));

const actorBranchIds = (actor: StockItemActor) => [...new Set([
  actor.branchId,
  ...(actor.assignedBranchIds || [])
].filter(Boolean))] as string[];

const toIsoString = (value: any): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (typeof value?._seconds === 'number') return new Date(value._seconds * 1000).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

async function getDocuments(db: Firestore, collectionName: string, ids: string[]): Promise<Map<string, any>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const result = new Map<string, any>();
  for (let offset = 0; offset < uniqueIds.length; offset += 200) {
    const chunk = uniqueIds.slice(offset, offset + 200);
    const snapshots = await db.getAll(...chunk.map(id => db.collection(collectionName).doc(id)));
    snapshots.forEach(snapshot => {
      if (snapshot.exists) result.set(snapshot.id, { id: snapshot.id, ...snapshot.data() });
    });
  }
  return result;
}

async function listAccessibleBalanceDocuments(db: Firestore, actor: StockItemActor, warehouseId?: string): Promise<any[]> {
  const role = normalizedRole(actor);
  let docs: any[] = [];
  if (role === 'ADMIN' || role === 'REGIONAL_MANAGER') {
    const snapshot = await db.collection('inventoryBalances').limit(2000).get();
    docs = snapshot.docs;
  } else {
    const branchIds = actorBranchIds(actor);
    if (branchIds.length === 0) return [];
    const snapshots = await Promise.all(branchIds.map(branchId => db.collection('inventoryBalances').where('branchId', '==', branchId).limit(1000).get()));
    const byId = new Map<string, any>();
    snapshots.forEach(snapshot => snapshot.docs.forEach(doc => byId.set(doc.id, doc)));
    docs = [...byId.values()];
  }
  return docs.filter(doc => !warehouseId || String(doc.data()?.warehouseId || '') === warehouseId);
}

/**
 * Accessory Product Master is global, but physical quantities live in
 * inventoryBalances.  Returning one row per location lets the UI group the
 * same SKU without treating each warehouse as a different product.
 */
export async function listAccessoryStockBalances(
  db: Firestore,
  actor: StockItemActor,
  warehouseId?: string
): Promise<any[]> {
  const balanceDocs = await listAccessibleBalanceDocuments(db, actor, warehouseId);
  const productIds = balanceDocs.map(doc => String(doc.data()?.productId || '')).filter(Boolean);
  const products = await getDocuments(db, 'products', productIds);
  const mayViewCost = canViewCost(actor);

  return balanceDocs.map(balanceDoc => {
    const balance = balanceDoc.data() || {};
    const productId = String(balance.productId || '');
    const product = products.get(productId) || {};
    const onHand = Number(balance.onHand || 0);
    const available = Number(balance.available ?? onHand);
    const reserved = Math.max(0, Number(balance.reserved ?? onHand - available));
    const row: any = {
      id: balanceDoc.id,
      productId,
      productMasterId: balance.productMasterId || product.productMasterId || null,
      sku: balance.sku || product.sku || productId,
      name: balance.name || product.name || productId,
      category: product.category || 'Phụ kiện',
      catalogGroupCode: product.catalogGroupCode || null,
      catalogModelCode: product.catalogModelCode || null,
      brand: product.brand || null,
      branchId: balance.branchId || null,
      warehouseId: balance.warehouseId || null,
      stockQuantity: onHand,
      reservedQuantity: reserved,
      availableQuantity: available,
      sellPrice: Number(product.retailPrice ?? product.sellPrice ?? 0),
      minStockLevel: Number(product.minStockLevel || 0),
      status: product.status || 'active',
      compatibleModels: Array.isArray(product.compatibleModels) ? product.compatibleModels : []
    };
    if (mayViewCost) row.currentCost = Number(product.buyPrice || 0);
    return row;
  }).filter(row => row.productId && row.sku);
}

export async function getAccessoryStockTrace(
  db: Firestore,
  productId: string,
  actor: StockItemActor
): Promise<any> {
  const normalizedProductId = String(productId || '').trim();
  if (!normalizedProductId) throw new Error('ACCESSORY_PRODUCT_NOT_FOUND');
  const [productSnap, balanceSnap, movementSnap] = await Promise.all([
    db.collection('products').doc(normalizedProductId).get(),
    db.collection('inventoryBalances').where('productId', '==', normalizedProductId).limit(500).get(),
    db.collection('inventoryMovements').where('productId', '==', normalizedProductId).limit(500).get()
  ]);
  if (!productSnap.exists) throw new Error('ACCESSORY_PRODUCT_NOT_FOUND');

  const balances = balanceSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as any))
    .filter(balance => canAccessBranch(actor, String(balance.branchId || '')));
  if (balances.length === 0 && normalizedRole(actor) !== 'ADMIN' && normalizedRole(actor) !== 'REGIONAL_MANAGER') {
    throw new Error('INVENTORY_BRANCH_FORBIDDEN');
  }
  const accessibleBranches = new Set(balances.map(balance => String(balance.branchId || '')).filter(Boolean));
  const movements = movementSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as any))
    .filter(movement => canAccessBranch(actor, String(movement.branchId || '')));

  // Older POS invoices did not write an inventory movement.  Read a bounded
  // history on detail-open and synthesize those sale events so operators can
  // still trace legacy quantities without changing historical documents.
  const invoiceSnapshots = normalizedRole(actor) === 'ADMIN' || normalizedRole(actor) === 'REGIONAL_MANAGER'
    ? [await db.collection('invoices').limit(500).get()]
    : await Promise.all([...accessibleBranches].map(branchId => db.collection('invoices').where('branchId', '==', branchId).limit(300).get()));
  const knownSaleSources = new Set(movements
    .filter(movement => String(movement.sourceType || '').toUpperCase() === 'SALES_INVOICE')
    .map(movement => String(movement.sourceId || '')));
  const legacyEvents: any[] = [];
  invoiceSnapshots.forEach(snapshot => snapshot.docs.forEach(doc => {
    const invoice = doc.data() || {};
    const line = (Array.isArray(invoice.accessories) ? invoice.accessories : [])
      .find((item: any) => String(item.productId || item.id || '') === normalizedProductId);
    if (!line || knownSaleSources.has(doc.id)) return;
    const occurredAt = toIsoString(invoice.createdAt || invoice.date || invoice.invoiceDate);
    legacyEvents.push({
      id: `LEGACY_SALE_${doc.id}`,
      movementType: 'STOCK_SALE',
      productId: normalizedProductId,
      branchId: invoice.branchId || null,
      warehouseId: invoice.warehouseId || null,
      quantity: Number(line.quantity || 1),
      sourceType: 'SALES_INVOICE',
      sourceId: doc.id,
      sourceCode: invoice.invoiceCode || invoice.code || doc.id,
      actorName: invoice.staffName || invoice.salesperson || null,
      occurredAt,
      status: invoice.status || null,
      legacyDerived: true
    });
    if (String(invoice.status || '').toLowerCase() === 'cancelled') {
      legacyEvents.push({
        id: `LEGACY_SALE_REVERSAL_${doc.id}`,
        movementType: 'STOCK_SALE_REVERSAL',
        productId: normalizedProductId,
        branchId: invoice.branchId || null,
        warehouseId: invoice.warehouseId || null,
        quantity: Number(line.quantity || 1),
        sourceType: 'SALES_INVOICE',
        sourceId: doc.id,
        sourceCode: invoice.invoiceCode || invoice.code || doc.id,
        actorName: invoice.cancelledBy || null,
        occurredAt: toIsoString(invoice.cancelledAt) || occurredAt,
        note: invoice.cancellationReason || null,
        status: 'CANCELLED',
        legacyDerived: true
      });
    }
  }));

  const sourceIdsByCollection = {
    purchaseOrders: [...new Set(movements.filter(item => String(item.sourceType || '').toUpperCase() === 'PURCHASE_ORDER').map(item => String(item.sourceId || '')).filter(Boolean))],
    invoices: [...new Set(movements.filter(item => String(item.sourceType || '').toUpperCase() === 'SALES_INVOICE').map(item => String(item.sourceId || '')).filter(Boolean))]
  };
  const [purchaseOrders, invoices] = await Promise.all([
    getDocuments(db, 'purchaseOrders', sourceIdsByCollection.purchaseOrders),
    getDocuments(db, 'invoices', sourceIdsByCollection.invoices)
  ]);
  const warehouseIds = [...new Set([
    ...balances.map(balance => String(balance.warehouseId || '')),
    ...movements.flatMap(movement => [String(movement.warehouseId || ''), String(movement.fromLocationId || ''), String(movement.toLocationId || '')]),
    ...legacyEvents.map(event => String(event.warehouseId || ''))
  ].filter(Boolean))];
  const warehouses = await getDocuments(db, 'warehouses', warehouseIds);
  const sourceCode = (movement: any) => {
    if (movement.sourceCode) return movement.sourceCode;
    const sourceType = String(movement.sourceType || '').toUpperCase();
    const source = sourceType === 'PURCHASE_ORDER'
      ? purchaseOrders.get(String(movement.sourceId || ''))
      : sourceType === 'SALES_INVOICE'
        ? invoices.get(String(movement.sourceId || ''))
        : null;
    return source?.code || source?.invoiceCode || movement.sourceId || null;
  };
  const normalizedMovements = [...movements, ...legacyEvents].map(movement => ({
    id: movement.id,
    type: movement.movementType || movement.type || 'INVENTORY_MOVEMENT',
    occurredAt: toIsoString(movement.occurredAt || movement.createdAt),
    quantity: Number(movement.quantity || 0),
    warehouseId: movement.warehouseId || movement.toLocationId || movement.fromLocationId || null,
    warehouseName: warehouses.get(String(movement.warehouseId || movement.toLocationId || movement.fromLocationId || ''))?.name || null,
    counterpartyWarehouseName: warehouses.get(String(movement.counterpartyWarehouseId || ''))?.name || null,
    sourceCode: sourceCode(movement),
    sourceId: movement.sourceId || null,
    actorName: movement.actorName || movement.performedByName || movement.createdByName || null,
    imei: movement.imei || null,
    note: movement.note || movement.reversalReason || null,
    status: movement.status || null,
    legacyDerived: movement.legacyDerived === true
  })).sort((left, right) => String(right.occurredAt || '').localeCompare(String(left.occurredAt || '')));
  const product: any = { id: productSnap.id, ...productSnap.data() };
  if (!canViewCost(actor)) delete product.buyPrice;

  return {
    product,
    balances,
    movements: normalizedMovements.slice(0, 120),
    notice: legacyEvents.length > 0
      ? 'Một số hóa đơn cũ được phục dựng từ chứng từ bán vì phiên bản trước chưa ghi sổ biến động phụ kiện.'
      : undefined
  };
}
