import { describe, expect, it } from 'vitest';
import {
  previewCatalogBulk,
  previewCatalogCandidates,
  previewCatalogClone,
  listCatalogItems,
  processCatalogBulkCreate,
  processCatalogCandidates,
  processCatalogClone,
  processRollbackCatalogOperation,
  processCreateCatalogDictionary,
  processUpdateCatalogDictionary,
  previewIphoneCatalogSeed,
  processIphoneCatalogSeed,
  processDeleteCatalogDictionary,
  processDeleteCatalogModel
} from '../server/services/catalogService';

type Ref = { col: string; id: string; get: () => Promise<any> };
type Query = { col: string; field: string; value: unknown; limit: (_count: number) => Query; get: () => Promise<any> };

function containsUndefined(value: any): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(containsUndefined);
  if (value && typeof value === 'object') return Object.values(value).some(containsUndefined);
  return false;
}

function createCatalogDb(seed: Record<string, Record<string, any>>) {
  const data = new Map<string, any>();
  Object.entries(seed).forEach(([collection, docs]) => Object.entries(docs).forEach(([id, value]) => {
    data.set(`${collection}/${id}`, { ...value });
  }));
  const read = (col: string, id: string) => ({
    id,
    exists: data.has(`${col}/${id}`),
    data: () => data.get(`${col}/${id}`)
  });
  const ref = (col: string, id: string): Ref => ({ col, id, get: async () => read(col, id) });
  const docsFor = (col: string, predicate: (value: any) => boolean = () => true) => [...data.entries()]
    .filter(([key, value]) => key.startsWith(`${col}/`) && predicate(value))
    .map(([key]) => read(col, key.slice(col.length + 1)));
  const query = (col: string, field: string, value: unknown): Query => ({
    col,
    field,
    value,
    limit: () => query(col, field, value),
    get: async () => ({ docs: docsFor(col, item => item?.[field] === value) })
  });
  const db: any = {
    collection: (col: string) => ({
      doc: (id: string) => ref(col, id),
      get: async () => ({ docs: docsFor(col) }),
      where: (field: string, _operator: string, value: unknown) => query(col, field, value)
    }),
    runTransaction: async (callback: any) => callback({
      get: async (target: Ref | Query) => 'field' in target
        ? target.get()
        : read((target as Ref).col, (target as Ref).id),
      set: (target: Ref, value: any, options?: { merge?: boolean }) => {
        if (containsUndefined(value)) throw new Error('FIRESTORE_UNDEFINED_VALUE');
        const key = `${target.col}/${target.id}`;
        data.set(key, options?.merge ? { ...(data.get(key) || {}), ...value } : { ...value });
      },
      update: (target: Ref, value: any) => {
        const key = `${target.col}/${target.id}`;
        data.set(key, { ...(data.get(key) || {}), ...value });
      },
      delete: (target: Ref) => {
        data.delete(`${target.col}/${target.id}`);
      }
    }),
    batch: () => {
      const writes: Array<{ target: Ref; value: any; merge?: boolean }> = [];
      return {
        set: (target: Ref, value: any, options?: { merge?: boolean }) => {
          if (containsUndefined(value)) throw new Error('FIRESTORE_UNDEFINED_VALUE');
          writes.push({ target, value, merge: options?.merge });
        },
        commit: async () => {
          writes.forEach(({ target, value, merge }) => {
            const key = `${target.col}/${target.id}`;
            data.set(key, merge ? { ...(data.get(key) || {}), ...value } : { ...value });
          });
        }
      };
    }
  };
  return {
    db,
    values: (collection: string) => docsFor(collection).map(doc => ({ id: doc.id, ...doc.data() })),
    get: (collection: string, id: string) => data.get(`${collection}/${id}`),
    set: (collection: string, id: string, value: any) => data.set(`${collection}/${id}`, { ...value })
  };
}

const actor = { uid: 'ADMIN_01', role: 'ADMIN', name: 'Quản trị', branchId: 'CN01' };

function configuredSeed() {
  return {
    catalogDictionaries: {
      CAT_MH: { id: 'CAT_MH', dictionaryType: 'CATEGORY', key: 'SCREEN', code: 'MH', name: 'Màn hình', active: true },
      BRAND_APP: { id: 'BRAND_APP', dictionaryType: 'BRAND', key: 'APPLE', code: 'APP', name: 'Apple', active: true },
      BRAND_GX: { id: 'BRAND_GX', dictionaryType: 'BRAND', key: 'GX', code: 'GX', name: 'GX', active: true },
      ATTR_OLED: { id: 'ATTR_OLED', dictionaryType: 'ATTRIBUTE', key: 'TECHNOLOGY', code: 'OLED', name: 'OLED', active: true },
      ATTR_256: { id: 'ATTR_256', dictionaryType: 'ATTRIBUTE', key: 'STORAGE', code: '256', name: '256GB', active: true },
      ATTR_UNIT_CUM: { id: 'ATTR_UNIT_CUM', dictionaryType: 'ATTRIBUTE', key: 'UNIT', code: 'CUM', name: 'Cụm', active: true }
    },
    catalogModels: {
      MODEL_IP15PM: {
        id: 'MODEL_IP15PM', brandCode: 'APP', brandName: 'Apple', modelCode: 'IP15PM', modelName: 'iPhone 15 Pro Max', aliases: ['15PM'], active: true
      },
      MODEL_IP16PM: {
        id: 'MODEL_IP16PM', brandCode: 'APP', brandName: 'Apple', modelCode: 'IP16PM', modelName: 'iPhone 16 Pro Max', active: true
      }
    }
  };
}

function screenMatrixInput() {
  return {
    category: 'PART' as const,
    categoryCode: 'MH',
    categoryName: 'Màn hình',
    unit: 'Cụm',
    unitCode: 'CUM',
    modelIds: ['MODEL_IP15PM'],
    brandCode: 'GX',
    brandName: 'GX',
    variants: [{
      skuSegments: [
        { code: 'GX', label: 'GX', key: 'manufacturer' },
        { code: 'OLED', label: 'OLED', key: 'technology' }
      ],
      nameSegments: ['GX', 'OLED'],
      attributes: { technology: 'OLED' },
      defaultImportPrice: 2_000_000,
      defaultRetailPrice: 3_000_000
    }]
  };
}

describe('Product Master & deterministic catalog SKU engine', () => {
  it('requires setup-owned dictionary codes before it will preview a SKU', async () => {
    const store = createCatalogDb({
      catalogModels: {
        MODEL_IP15PM: { id: 'MODEL_IP15PM', brandCode: 'APP', brandName: 'Apple', modelCode: 'IP15PM', modelName: 'iPhone 15 Pro Max', active: true }
      }
    });
    await expect(previewCatalogBulk(store.db, screenMatrixInput())).rejects.toThrow('CATALOG_CATEGORY_CODE_NOT_CONFIGURED:MH');
  });

  it('omits optional dictionary parentId on create, normal edit, and explicit removal', async () => {
    const store = createCatalogDb({});
    const created = await processCreateCatalogDictionary(store.db, {
      dictionaryType: 'ATTRIBUTE', key: 'UNIT', code: 'CUM', name: 'Cụm'
    }, actor);
    expect(created).not.toHaveProperty('parentId');
    expect(store.get('catalogDictionaries', created.id)).not.toHaveProperty('parentId');

    const renamed = await processUpdateCatalogDictionary(store.db, created.id, { name: 'Cụm linh kiện' }, actor);
    expect(renamed).not.toHaveProperty('parentId');
    expect(store.get('catalogDictionaries', created.id)).not.toHaveProperty('parentId');

    store.set('catalogDictionaries', 'DICT_CHILD', {
      id: 'DICT_CHILD', dictionaryType: 'ATTRIBUTE', key: 'QUALITY', code: 'OLED', name: 'OLED', parentId: 'DICT_ROOT', active: true
    });
    const cleared = await processUpdateCatalogDictionary(store.db, 'DICT_CHILD', { parentId: '' }, actor);
    expect(cleared).not.toHaveProperty('parentId');
    expect(store.get('catalogDictionaries', 'DICT_CHILD')).not.toHaveProperty('parentId');
  });

  it('creates a deterministic master SKU and treats an automatic retry as idempotent', async () => {
    const store = createCatalogDb(configuredSeed());
    const preview = await previewCatalogBulk(store.db, screenMatrixInput());
    expect(preview).toMatchObject({ totalCount: 1, newCount: 1 });
    expect(preview.candidates[0]).toMatchObject({
      sku: 'MH-IP15PM-GX-OLED',
      modelId: 'MODEL_IP15PM',
      compatibleModelCodes: ['IP15PM'],
      masterVersion: 2
    });
    expect(preview.candidates[0].aliases).toContain('MH-IP15PM-GX-OLED');
    expect(preview.candidates[0].searchTokens).toContain('15pm gx');

    const first = await processCatalogBulkCreate(store.db, screenMatrixInput(), actor);
    expect(first).toMatchObject({ createdCount: 1, skippedExistingCount: 0 });
    expect(store.values('catalogItems')).toHaveLength(1);
    expect(store.values('products')).toHaveLength(0);
    expect(store.values('spareParts')).toHaveLength(0);

    const replay = await processCatalogBulkCreate(store.db, screenMatrixInput(), actor);
    expect(replay.idempotentReplay).toBe(true);
    expect(store.values('catalogItems')).toHaveLength(1);
    expect(store.values('catalogSkuRegistry')).toHaveLength(1);
  });

  it('accepts matrix-cell candidate payloads without generating codes from labels', async () => {
    const store = createCatalogDb(configuredSeed());
    const preview = await previewCatalogCandidates(store.db, {
      items: [{
        kind: 'PART', categoryCode: 'MH', categoryName: 'Màn hình', unit: 'Cụm', unitCode: 'CUM', modelId: 'MODEL_IP15PM',
        manufacturerCode: 'GX', manufacturerName: 'GX', qualityCode: 'OLED', qualityName: 'OLED',
        defaultImportPrice: 2_000_000, defaultRetailPrice: 3_000_000
      }]
    });
    expect(preview.candidates[0].sku).toBe('MH-IP15PM-GX-OLED');
  });

  it('writes selected matrix cells through the same endpoint used by the bulk screen', async () => {
    const store = createCatalogDb(configuredSeed());
    const input = {
      items: [{
        clientKey: 'matrix-01',
        kind: 'PART',
        categoryCode: 'MH',
        categoryName: 'Màn hình',
        unit: 'Cụm',
        unitCode: 'CUM',
        modelId: 'MODEL_IP15PM',
        manufacturerCode: 'GX',
        manufacturerName: 'GX',
        qualityCode: 'OLED',
        qualityName: 'OLED',
        defaultImportPrice: 2_000_000,
        defaultRetailPrice: 3_000_000
      }]
    };
    const preview = await previewCatalogCandidates(store.db, input);
    expect(preview.candidates[0]).toMatchObject({ clientKey: 'matrix-01', sku: 'MH-IP15PM-GX-OLED' });

    const result = await processCatalogCandidates(store.db, input, actor);

    expect(result).toMatchObject({ createdCount: 1, skippedExistingCount: 0 });
    expect(store.values('catalogItems')).toHaveLength(1);
    expect(store.values('catalogItems')[0]).toMatchObject({ sku: 'MH-IP15PM-GX-OLED' });
    expect(store.values('catalogItems')[0]).not.toHaveProperty('clientKey');
  });

  it('honours clone preview selection keys so deselected variants are never written', async () => {
    const store = createCatalogDb(configuredSeed());
    await processCatalogBulkCreate(store.db, screenMatrixInput(), actor);
    const preview = await previewCatalogClone(store.db, { sourceModelId: 'MODEL_IP15PM', targetModelId: 'MODEL_IP16PM' });
    expect(preview.candidates).toHaveLength(1);
    const selectedKey = preview.candidates[0].id;
    const cloned = await processCatalogClone(store.db, {
      sourceModelId: 'MODEL_IP15PM', targetModelId: 'MODEL_IP16PM', selectedClientKeys: [selectedKey]
    }, actor);
    expect(cloned.createdCount).toBe(1);
    expect(store.values('catalogItems').map(item => item.sku).sort()).toEqual(['MH-IP15PM-GX-OLED', 'MH-IP16PM-GX-OLED']);
  });

  it('rolls back only its own created Product Master rows by archive and preserves the SKU registry', async () => {
    const store = createCatalogDb(configuredSeed());
    const created = await processCatalogBulkCreate(store.db, screenMatrixInput(), actor);
    const itemId = created.created[0].catalogItemId;
    const rollback = await processRollbackCatalogOperation(store.db, created.operationKey, actor);
    expect(rollback).toMatchObject({ archivedCount: 1, blockedCount: 0 });
    expect(store.get('catalogItems', itemId)).toMatchObject({ lifecycleStatus: 'ARCHIVED', status: 'inactive' });
    expect(store.values('catalogSkuRegistry')).toHaveLength(1);
    const replay = await processRollbackCatalogOperation(store.db, created.operationKey, actor);
    expect(replay.idempotentReplay).toBe(true);
  });

  it('blocks rollback when a created master has a physical inventory link', async () => {
    const store = createCatalogDb(configuredSeed());
    const created = await processCatalogBulkCreate(store.db, screenMatrixInput(), actor);
    const item = created.created[0].item;
    store.set('spareParts', 'PART_STOCK_01', { catalogItemId: item.id, sku: item.sku, stockQuantity: 2 });
    const rollback = await processRollbackCatalogOperation(store.db, created.operationKey, actor);
    expect(rollback).toMatchObject({ archivedCount: 0, blockedCount: 1 });
    expect(rollback.blocked[0]).toMatchObject({ reason: 'CATALOG_ITEM_HAS_INVENTORY_LINKS' });
    expect(store.get('catalogItems', item.id)).toMatchObject({ lifecycleStatus: 'ACTIVE' });
  });

  it('lists Product Master through a bounded cursor and finds configured model-alias phrases', async () => {
    const store = createCatalogDb(configuredSeed());
    await processCatalogBulkCreate(store.db, screenMatrixInput(), actor);
    await processCatalogClone(store.db, { sourceModelId: 'MODEL_IP15PM', targetModelId: 'MODEL_IP16PM' }, actor);

    const first = await listCatalogItems(store.db, { limit: 1, kind: 'PART' });
    expect(first.items).toHaveLength(1);
    expect(first).toMatchObject({ hasMore: true, summary: { PART: 2, matching: 2 } });
    expect(first.nextCursor).toBeTruthy();

    const second = await listCatalogItems(store.db, { limit: 1, kind: 'PART', cursor: first.nextCursor });
    expect(second.items).toHaveLength(1);
    expect(second.items[0].id).not.toBe(first.items[0].id);

    const aliasSearch = await listCatalogItems(store.db, { limit: 50, kind: 'PART', search: '15pm gx' });
    expect(aliasSearch.items.map(item => item.sku)).toContain('MH-IP15PM-GX-OLED');
  });

  it('previews and confirms the editable iPhone setup without creating stock, IMEI or sellable SKU rows', async () => {
    const store = createCatalogDb({});
    const preview = await previewIphoneCatalogSeed(store.db);
    expect(preview).toMatchObject({
      create: expect.any(Number),
      summary: {
        brand: { create: 7 },
        family: { create: 1 },
        model: { create: 35 }
      },
      guarantees: { createsInventory: false, createsImei: false, createsSku: false }
    });

    const created = await processIphoneCatalogSeed(store.db, { confirmed: true }, actor);
    expect(created).toMatchObject({ totalCreated: preview.create, idempotentReplay: false });
    expect(store.values('catalogItems')).toHaveLength(0);
    expect(store.values('products')).toHaveLength(0);
    expect(store.values('spareParts')).toHaveLength(0);
    expect(store.values('devices')).toHaveLength(0);
    expect(store.values('catalogDictionaries')).toEqual(expect.arrayContaining([
      expect.objectContaining({ dictionaryType: 'FAMILY', code: 'IPHONE', name: 'iPhone' }),
      expect.objectContaining({ dictionaryType: 'CATEGORY', code: 'MH', name: 'Màn hình' }),
      expect.objectContaining({ dictionaryType: 'TEMPLATE', code: 'TPL-MH', name: 'Màn hình' })
    ]));
    expect(store.values('catalogModels')).toEqual(expect.arrayContaining([
      expect.objectContaining({ modelCode: 'IP8P', modelName: 'iPhone 8 Plus', familyCode: 'IPHONE' }),
      expect.objectContaining({ modelCode: 'IP17PM', modelName: 'iPhone 17 Pro Max', aliases: expect.arrayContaining(['17PM', '17PRM']) })
    ]));

    const replay = await processIphoneCatalogSeed(store.db, { confirmed: true }, actor);
    expect(replay).toMatchObject({ totalCreated: 0, idempotentReplay: true });
  });

  it('deletes unused iPhone setup records and changes used records to Ngừng dùng', async () => {
    const store = createCatalogDb({});
    await processIphoneCatalogSeed(store.db, { confirmed: true }, actor);

    const deleted = await processDeleteCatalogDictionary(store.db, 'ATTR_DEF_RAM', actor);
    expect(deleted).toMatchObject({ deleted: true, archived: false });
    expect(store.get('catalogDictionaries', 'ATTR_DEF_RAM')).toBeUndefined();

    const archived = await processDeleteCatalogDictionary(store.db, 'CAT_GROUP_SCREEN', actor);
    expect(archived).toMatchObject({ deleted: false, archived: true });
    expect(store.get('catalogDictionaries', 'CAT_GROUP_SCREEN')).toMatchObject({ active: false, lifecycleStatus: 'ARCHIVED' });

    const removedModel = await processDeleteCatalogModel(store.db, 'MODEL_APP_IP17PM', actor);
    expect(removedModel).toMatchObject({ deleted: true, archived: false });
    expect(store.get('catalogModels', 'MODEL_APP_IP17PM')).toBeUndefined();
  });
});
