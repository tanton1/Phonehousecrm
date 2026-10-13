import { describe, expect, it } from 'vitest';
import { catalogPublicContentErrorMessage, catalogPublicContentPatch } from '../shared/catalogPublicContent';
import { getStorefrontProduct, listStorefrontProducts } from '../server/services/storefrontService';
import { storefrontAccessoryMatches } from '../server/services/storefrontContentService';
import { processUpdateCatalogItem, processUpdateCatalogModel } from '../server/services/catalogService';
import { getWebsiteContentDetail, listWebsiteContent, updateWebsiteContent } from '../server/services/catalogWebsiteContentService';
import { validateCatalogImage } from '../server/services/catalogImageService';
import { websiteContentIssues } from '../shared/catalogWebsiteContent';
import { storefrontMemoryDb } from './helpers/storefrontMemoryDb';

const device = (id = 'PHONE', extra = {}) => ({ id, sku: `SKU-${id}`, name: 'iPhone 14 128GB Đen', category: 'DEVICE', brand: 'Apple', model: 'iPhone 14', modelId: 'MODEL14', modelCode: 'IP14', color: 'Đen', storage: '128GB', condition: '99%', defaultRetailPrice: 9_000_000, status: 'active', ...extra });
const accessory = (id: string, extra = {}) => ({ id, sku: id, name: `Phụ kiện ${id}`, category: 'ACCESSORY', status: 'active', defaultRetailPrice: 200_000, ...extra });
const model = { id: 'MODEL14', modelName: 'iPhone 14', modelCode: 'IP14', brandName: 'Apple', active: true };
const seed = () => ({ catalogItems: { PHONE: device() }, catalogModels: { MODEL14: model }, branches: { CN1: { name: 'CN1', isActive: true }, CN2: { name: 'CN2', isActive: true } } });
const actor = { uid: 'ADMIN', role: 'ADMIN', branchId: 'CN1' };

describe('storefront public product content', () => {
  it('inherits model content and gallery, with a clear model-reference caption', async () => {
    const store = storefrontMemoryDb(seed());
    store.set('catalogModels', 'MODEL14', { ...model, imageUrl: '/images/model.webp', imageUrls: ['/images/rear.webp'], publicDescription: 'Mô tả đã duyệt', publicHighlights: ['Đặc điểm đã duyệt'], publicSpecifications: [{ label: 'Cổng kết nối', value: 'Thông tin kiểm thử' }], notes: 'PRIVATE_MODEL_NOTE' });
    const result = await getStorefrontProduct(store.db, 'PHONE');
    expect(result.product).toMatchObject({ images: ['/images/model.webp', '/images/rear.webp'], description: 'Mô tả đã duyệt', highlights: ['Đặc điểm đã duyệt'], specifications: [{ label: 'Cổng kết nối', value: 'Thông tin kiểm thử' }] });
    expect(result.product.imageNote).toContain('chung của model');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_MODEL_NOTE');
  });
  it('prioritizes SKU content, deduplicates galleries and overrides model specifications', async () => {
    const store = storefrontMemoryDb(seed());
    store.set('catalogModels', 'MODEL14', { ...model, imageUrl: '/model.webp', publicDescription: 'MODEL', publicSpecifications: Array.from({ length: 24 }, (_, i) => ({ label: `Thông số ${i}`, value: 'MODEL' })) });
    store.set('catalogItems', 'PHONE', device('PHONE', { imageUrl: '/sku.webp', imageUrls: ['/sku.webp', 'javascript:alert(1)', '/rear.webp'], publicDescription: 'SKU', publicSpecifications: [{ label: 'Thông số 23', value: 'SKU' }] }));
    const { product } = await getStorefrontProduct(store.db, 'PHONE');
    expect(product.images).toEqual(['/sku.webp', '/rear.webp']);
    expect(product.description).toBe('SKU');
    expect(product.specifications).toHaveLength(24);
    expect(product.specifications.find(row => row.label === 'Thông số 23')?.value).toBe('SKU');
  });
  it('reuses same-model/same-colour catalogue media but never another colour or Pro model', async () => {
    const store = storefrontMemoryDb(seed());
    store.set('catalogItems', 'BLUE', device('BLUE', { color: 'Xanh', imageUrl: '/blue.webp' }));
    store.set('catalogItems', 'PRO', device('PRO', { model: 'iPhone 14 Pro', modelId: 'MODEL14PRO', imageUrl: '/pro.webp' }));
    expect((await getStorefrontProduct(store.db, 'PHONE')).product.imageUrl).toBeNull();
    const store2 = storefrontMemoryDb({ ...seed(), catalogItems: { PHONE: device(), BLACK: device('BLACK', { storage: '256GB', imageUrl: '/black.webp' }) } });
    expect((await getStorefrontProduct(store2.db, 'PHONE')).product.imageUrl).toBe('/black.webp');
  });
  it('does not expose unpublished inventory photos, notes, or arbitrary internal attributes', async () => {
    const store = storefrontMemoryDb(seed());
    store.set('devices', 'IMEI', { catalogItemId: 'PHONE', branchId: 'CN1', status: 'in_stock', imageUrl: '/private-imei.webp', publicDescription: 'UNPUBLISHED', notes: 'PRIVATE_NOTE' });
    store.set('catalogItems', 'PHONE', device('PHONE', { notes: 'PRIVATE_NOTE', attributes: { costPrice: 'SECRET_COST', supplier: 'SECRET_SUPPLIER' } }));
    expect(JSON.stringify(await getStorefrontProduct(store.db, 'PHONE'))).not.toMatch(/private-imei|UNPUBLISHED|PRIVATE_NOTE|SECRET/);
  });
  it('uses only the published stock cover, not its inspection album, in the selected branch', async () => {
    const store = storefrontMemoryDb(seed());
    store.set('devices', 'UNIT', { catalogItemId: 'PHONE', branchId: 'CN1', status: 'in_stock', publicVisible: true, images: ['/public-front.webp', '/private-inspection.webp'], imageUrls: ['/private-import.webp'], publicDescription: 'Thông tin công khai' });
    expect((await getStorefrontProduct(store.db, 'PHONE', 'CN1')).product.images).toEqual(['/public-front.webp']);
    expect((await getStorefrontProduct(store.db, 'PHONE', 'CN2')).product.images).toEqual([]);
  });
  it('synchronizes published miniweb variant content without implying the reference image matches the colour', async () => {
    const store = storefrontMemoryDb(seed());
    store.set('quickQuoteDeviceVariants', 'V', { variantKey: 'IPHONE 14|128GB|99%', publicBranchIds: ['CN1'], publicPresentationByBranch: { CN1: { imageUrl: '/miniweb.webp', publicDescription: 'Thông tin từ miniweb' }, CN2: { imageUrl: '/not-public.webp' } } });
    expect((await getStorefrontProduct(store.db, 'PHONE', 'CN1')).product).toMatchObject({ imageUrl: '/miniweb.webp', description: 'Thông tin từ miniweb' });
    expect((await getStorefrontProduct(store.db, 'PHONE', 'CN1')).product.imageNote).toContain('màu');
    expect((await getStorefrontProduct(store.db, 'PHONE')).product.imageUrl).toBe('/miniweb.webp');
    expect((await getStorefrontProduct(store.db, 'PHONE', 'CN2')).product.imageUrl).toBeNull();
  });
  it('uses published variant media for imported attributes and an exact model reference', async () => {
    const store = storefrontMemoryDb(seed());
    store.set('catalogItems', 'PHONE', device('PHONE', { model: '', storage: '', condition: '', attributes: { storage: '128GB', condition: '99%' } }));
    store.set('quickQuoteDeviceVariants', 'V', { variantKey: 'IPHONE 14|128GB|99%', publicBranchIds: ['CN1'], publicPresentationByBranch: { CN1: { imageUrl: '/imported.webp' } } });
    expect((await getStorefrontProduct(store.db, 'PHONE', 'CN1')).product.imageUrl).toBe('/imported.webp');
  });
  it('does not inherit a phone image/specification into an accessory that references that phone model', async () => {
    const store = storefrontMemoryDb(seed());
    store.set('catalogModels', 'MODEL14', { ...model, imageUrl: '/phone.webp', publicSpecifications: [{ label: 'Chip', value: 'Test' }] });
    store.set('catalogItems', 'CASE', accessory('CASE', { modelId: 'MODEL14', compatibleModelIds: ['MODEL14'] }));
    const result = await getStorefrontProduct(store.db, 'CASE');
    expect(result.product).toMatchObject({ imageUrl: null, model: '', specifications: [], compatibleModels: ['iPhone 14'] });
    expect(result.variants.map(row => row.id)).toEqual(['CASE']);
  });
  it('only recommends active accessories with confirmed model compatibility; shows live scoped prices/stock', async () => {
    const store = storefrontMemoryDb(seed());
    store.set('catalogItems', 'MATCH', accessory('MATCH', { compatibleModelIds: ['MODEL14'], imageUrl: '/case.webp' }));
    store.set('catalogItems', 'BROAD', accessory('BROAD', { name: 'Ốp lưng Apple iPhone 14 Pro' }));
    store.set('catalogItems', 'WRONG', accessory('WRONG', { compatibleModelIds: ['MODEL14PRO'], compatibleModels: ['iPhone 14'] }));
    store.set('catalogItems', 'OFF', accessory('OFF', { status: 'inactive', compatibleModelIds: ['MODEL14'] }));
    store.set('catalogItems', 'ARCHIVED', accessory('ARCHIVED', { isArchived: true, compatibleModelIds: ['MODEL14'] }));
    store.set('products', 'P1', { productMasterId: 'MATCH', status: 'active' });
    store.set('inventoryBalances', 'B1', { productId: 'P1', branchId: 'CN1', onHand: 3, reserved: 1 });
    const result = await getStorefrontProduct(store.db, 'PHONE', 'CN1');
    expect(result.relatedAccessories.map(row => row.id)).toEqual(['MATCH']);
    expect(result.relatedAccessories[0]).toMatchObject({ imageUrl: '/case.webp', price: 200_000, inStock: true });
    expect((await getStorefrontProduct(store.db, 'PHONE', 'CN2')).relatedAccessories[0].inStock).toBe(false);
    expect((await getStorefrontProduct(store.db, 'MATCH')).compatibleDevices.map(row => row.id)).toEqual(['PHONE']);
  });
  it('matches declared legacy codes/names exactly, never substring guessing', () => {
    expect(storefrontAccessoryMatches(device(), accessory('A', { compatibleModelCodes: ['IP14'] }))).toBe(true);
    expect(storefrontAccessoryMatches(device(), accessory('A', { compatibleModels: ['iPhone 14 Pro'] }))).toBe(false);
    expect(storefrontAccessoryMatches(device(), accessory('A', { compatibleModels: ['iPhone 14'] }))).toBe(true);
    expect(storefrontAccessoryMatches(device(), accessory('A', { compatibleModelIds: ['WRONG'], compatibleModelCodes: ['IP14'] }))).toBe(false);
    expect(storefrontAccessoryMatches(device('LEGACY', { modelId: '' }), accessory('A', { compatibleModelIds: ['WRONG'], compatibleModelCodes: ['IP14'] }))).toBe(false);
  });
  it('does not silently resolve a bad explicit model reference using a similarly named record', async () => {
    const store = storefrontMemoryDb(seed());
    store.set('catalogItems', 'PHONE', device('PHONE', { modelId: 'WRONG' }));
    store.set('catalogModels', 'MODEL14', { ...model, imageUrl: '/wrong-link.webp' });
    expect((await getStorefrontProduct(store.db, 'PHONE')).product.imageUrl).toBeNull();
  });
});

describe('public content management and cache synchronization', () => {
  it('audits missing public content and protects edits with a revision', async () => {
    const store = storefrontMemoryDb({ ...seed(), catalogItems: { ...seed().catalogItems, CASE: accessory('CASE', { compatibleModelIds: ['MODEL14'] }) } });
    const page = await listWebsiteContent(store.db, {});
    expect(page.total).toBe(2);
    expect(page.counts).toMatchObject({ IMAGE: 2, DESCRIPTION: 2, SPECIFICATIONS: 2 });
    const detail = await getWebsiteContentDetail(store.db, 'PHONE');
    await updateWebsiteContent(store.db, 'items', 'PHONE', { confirmed: true, expectedRevision: detail.item.revision, content: { imageUrl: '/phone.webp', publicDescription: 'Đã duyệt', publicSpecifications: [{ label: 'Màn hình', value: '6.1 inch' }] } }, actor);
    expect((await getWebsiteContentDetail(store.db, 'PHONE')).product.images).toEqual(['/phone.webp']);
    await expect(updateWebsiteContent(store.db, 'items', 'PHONE', { confirmed: true, expectedRevision: detail.item.revision, content: { publicDescription: 'Bản cũ' } }, actor)).rejects.toThrow('CATALOG_WEBSITE_CONTENT_CONFLICT');
  });

  it('requires exact compatibility IDs when saving an accessory', async () => {
    const store = storefrontMemoryDb({ ...seed(), catalogItems: { ...seed().catalogItems, CASE: accessory('CASE') } });
    const detail = await getWebsiteContentDetail(store.db, 'CASE');
    await expect(updateWebsiteContent(store.db, 'items', 'CASE', { confirmed: true, expectedRevision: detail.item.revision, content: { imageUrl: '/case.webp' }, compatibleModelIds: ['MISSING'] }, actor)).rejects.toThrow('CATALOG_COMPATIBILITY_INVALID');
    expect(websiteContentIssues(detail.product)).toContain('COMPATIBILITY');
  });

  it('accepts only bounded image signatures for public media', () => {
    expect(validateCatalogImage(Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]), 'image/jpeg')).toBeInstanceOf(Buffer);
    expect(() => validateCatalogImage(Buffer.from('not-an-image'), 'image/png')).toThrow('CATALOG_IMAGE_BODY_INVALID');
    expect(() => validateCatalogImage(Buffer.alloc(20), 'image/gif')).toThrow('CATALOG_IMAGE_TYPE_INVALID');
  });

  it('validates public content bounds, images and compatibility input on the server', async () => {
    expect(catalogPublicContentErrorMessage(new Error('CATALOG_PUBLIC_IMAGE_INVALID'))).toContain('HTTPS');
    expect(catalogPublicContentErrorMessage(new Error('UNEXPECTED'))).toBeNull();
    for (const input of [{ imageUrl: 'javascript:alert(1)' }, { imageUrls: ['http://insecure.test/a.jpg'] }, { publicDescription: 'x'.repeat(6001) }, { publicSpecifications: [{ label: 'Screen', value: '' }] }, { publicHighlights: Array(9).fill('x') }]) expect(() => catalogPublicContentPatch(input)).toThrow(/CATALOG_PUBLIC/);
    const store = storefrontMemoryDb(seed());
    await expect(processUpdateCatalogItem(store.db, 'PHONE', { compatibleModelIds: 'WRONG' }, actor)).rejects.toThrow('CATALOG_COMPATIBILITY_INVALID');
  });
  it('publishes edited item content immediately without copying private notes or touching inventory', async () => {
    const store = storefrontMemoryDb(seed());
    await listStorefrontProducts(store.db, {});
    await processUpdateCatalogItem(store.db, 'PHONE', { imageUrls: ['/front.webp', '/rear.webp'], publicDescription: 'Nội dung mới', notes: 'INTERNAL', publicSpecifications: [{ label: 'Thông số', value: 'Đã duyệt' }] }, actor);
    const result = await getStorefrontProduct(store.db, 'PHONE');
    expect(result.product).toMatchObject({ images: ['/front.webp', '/rear.webp'], description: 'Nội dung mới' });
    expect(JSON.stringify(result)).not.toContain('INTERNAL');
    expect(store.rows('devices')).toHaveLength(0);
  });
  it('refreshes inherited model content across configurations after a model edit', async () => {
    const store = storefrontMemoryDb(seed());
    await listStorefrontProducts(store.db, {});
    await processUpdateCatalogModel(store.db, 'MODEL14', { publicDescription: 'Nội dung model mới', imageUrl: '/model-new.webp' }, actor);
    expect((await getStorefrontProduct(store.db, 'PHONE')).product).toMatchObject({ description: 'Nội dung model mới', imageUrl: '/model-new.webp' });
  });
});
