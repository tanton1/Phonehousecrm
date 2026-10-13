import { apiJson } from './apiClient';
import type { StorefrontOrderInput, StorefrontOrderReceipt, StorefrontPage, StorefrontProduct, StorefrontProductDetail } from '../../shared/storefront';

type Envelope<T> = { success: boolean; data: T };
export async function storefrontProducts(query: Record<string, string> = {}) {
  return (await apiJson<Envelope<StorefrontPage>>(`/api/storefront/products?${new URLSearchParams(query)}`)).data;
}
export async function storefrontProduct(id: string, branchId = '') {
  return (await apiJson<Envelope<StorefrontProductDetail>>(`/api/storefront/products/${encodeURIComponent(id)}?${new URLSearchParams({ branchId })}`)).data;
}
export async function submitStorefrontOrder(input: StorefrontOrderInput) {
  return (await apiJson<Envelope<StorefrontOrderReceipt>>('/api/storefront/orders', { method: 'POST', body: JSON.stringify(input), timeoutMs: 30_000 })).data;
}
export async function askStorefrontAssistant(message: string, branchId: string) {
  return (await apiJson<Envelope<{ reply: string; products: StorefrontProduct[]; handoff: boolean }>>('/api/storefront/assistant', { method: 'POST', body: JSON.stringify({ message, branchId }), timeoutMs: 25_000 })).data;
}
