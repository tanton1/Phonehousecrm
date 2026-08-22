import { DeviceItem, ProductItem, RetailPriceEntry, RetailPricingSetupConfig } from '../types';

const normalize = (value: unknown) => String(value || '').trim().toUpperCase();

export function deviceModelVariantKey(device: Pick<DeviceItem, 'model' | 'storage' | 'condition'>): string {
  return [device.model, device.storage, device.condition].map(normalize).join('|');
}

function matchEntry(entry: RetailPriceEntry, itemType: 'DEVICE' | 'ACCESSORY', item: DeviceItem | ProductItem): boolean {
  if (!entry.isActive || entry.itemType !== itemType) return false;
  const key = normalize(entry.itemKey);
  if (entry.matchType === 'ITEM_ID') return key === normalize(item.id);
  if (entry.matchType === 'SKU') return key === normalize((item as any).sku);
  return itemType === 'DEVICE' && key === deviceModelVariantKey(item as DeviceItem);
}

export function resolveRetailPrice(
  config: RetailPricingSetupConfig | undefined,
  branchId: string,
  itemType: 'DEVICE' | 'ACCESSORY',
  item: DeviceItem | ProductItem
): { listPrice: number; minimumPrice?: number; entry?: RetailPriceEntry; source: 'POLICY' | 'ITEM' } {
  const fallback = Number(itemType === 'DEVICE'
    ? (item as DeviceItem).sellPrice
    : ((item as ProductItem).sellPrice ?? (item as any).retailPrice ?? (item as any).price ?? (item as any).salePrice)) || 0;
  if (!config?.isActive) return { listPrice: fallback, source: 'ITEM' };
  const matches = (config.entries || []).filter(entry =>
    (entry.branchId === branchId || entry.branchId === 'ALL') && matchEntry(entry, itemType, item)
  );
  const matchPriority = (entry: RetailPriceEntry) =>
    (entry.branchId === branchId ? 100 : 0) + (entry.matchType === 'ITEM_ID' ? 30 : entry.matchType === 'SKU' ? 20 : 10);
  const entry = matches.sort((left, right) => matchPriority(right) - matchPriority(left))[0];
  if (!entry) return { listPrice: fallback, source: 'ITEM' };
  return { listPrice: entry.retailPrice, minimumPrice: entry.minimumPrice, entry, source: 'POLICY' };
}
