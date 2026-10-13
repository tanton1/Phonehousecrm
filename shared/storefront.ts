import type { PublicProductSpecification } from './catalogPublicContent';
export type StorefrontKind = 'DEVICE' | 'ACCESSORY' | 'PART';
export interface StorefrontProduct {
  id: string;
  sku: string;
  name: string;
  kind: StorefrontKind;
  category: string;
  brand: string;
  model: string;
  modelId: string;
  storage: string;
  color: string;
  condition: string;
  region: string;
  imageUrl: string | null;
  images: string[];
  imageNote: string;
  description: string;
  highlights: string[];
  specifications: PublicProductSpecification[];
  compatibleModels: string[];
  warrantyMonths: number | null;
  price: number | null;
  priceIsStartingFrom: boolean;
  inStock: boolean;
  availableBranchIds: string[];
}
export interface StorefrontProductDetail {
  product: StorefrontProduct;
  variants: StorefrontProduct[];
  relatedAccessories: StorefrontProduct[];
  compatibleDevices: StorefrontProduct[];
}
export interface StorefrontPage {
  items: StorefrontProduct[];
  total: number;
  catalogTotal: number;
  nextCursor: string | null;
  facets: { kinds: { id: StorefrontKind; name: string; count: number }[]; brands: string[] };
  generatedAt: string;
}
export interface StorefrontCartLine { productId: string; quantity: number }
export interface StorefrontOrderInput {
  idempotencyKey: string;
  branchId: string;
  customerName: string;
  customerPhone: string;
  fulfillment: 'PICKUP' | 'DELIVERY';
  address: string;
  note: string;
  contactConsent: boolean;
  website: string;
  lines: { productId: string; quantity: number; expectedPrice: number | null }[];
}
export interface StorefrontOrderReceipt {
  code: string;
  status: 'NEW';
  estimatedTotal: number;
  hasUnpricedItems: boolean;
}
export const STOREFRONT_KIND_NAMES: Record<StorefrontKind, string> = {
  DEVICE: 'Điện thoại', ACCESSORY: 'Phụ kiện', PART: 'Linh kiện'
};

/** Only persist identifiers/quantities. Names, prices and availability are always reloaded. */
export function normalizeStorefrontCart(value: unknown): StorefrontCartLine[] {
  if (!Array.isArray(value)) return [];
  const result = new Map<string, number>();
  for (const row of value.slice(0, 30)) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const id = typeof item.productId === 'string' ? item.productId.trim() : '';
    const quantity = Number(item.quantity);
    if (!id || id.length > 160 || id.includes('/') || !Number.isInteger(quantity) || quantity < 1) continue;
    result.set(id, Math.min(10, (result.get(id) || 0) + quantity));
  }
  return [...result].slice(0, 20).map(([productId, quantity]) => ({ productId, quantity }));
}
