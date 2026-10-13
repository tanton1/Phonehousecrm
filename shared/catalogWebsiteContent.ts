import type { CatalogPublicContent } from './catalogPublicContent';
import type { StorefrontKind, StorefrontProduct } from './storefront';

export type WebsiteContentIssue = 'IMAGE' | 'DESCRIPTION' | 'SPECIFICATIONS' | 'COMPATIBILITY' | 'PRICE';
export const WEBSITE_CONTENT_ISSUES: Record<WebsiteContentIssue, string> = {
  IMAGE: 'Thiếu ảnh', DESCRIPTION: 'Thiếu mô tả', SPECIFICATIONS: 'Thiếu thông số',
  COMPATIBILITY: 'Chưa khai báo tương thích', PRICE: 'Chưa có giá bán'
};
export type WebsiteContentTarget = 'items' | 'models';
export interface WebsiteContentEditor {
  target: WebsiteContentTarget;
  id: string;
  name: string;
  revision: string;
  content: CatalogPublicContent;
  compatibleModelIds: string[];
  compatibleModels: string[];
  affectedProducts: number;
}
export interface WebsiteContentRow {
  product: StorefrontProduct;
  issues: WebsiteContentIssue[];
}
export interface WebsiteContentPage {
  items: WebsiteContentRow[];
  total: number;
  catalogTotal: number;
  counts: Record<WebsiteContentIssue, number>;
  nextCursor: string | null;
  generatedAt: string;
}
export interface WebsiteContentDetail {
  product: StorefrontProduct;
  item: WebsiteContentEditor;
  model: WebsiteContentEditor | null;
  models: { id: string; name: string }[];
}
export interface WebsiteContentQuery {
  search?: string;
  kind?: StorefrontKind | '';
  issue?: WebsiteContentIssue | '';
  cursor?: string;
}
export const MAX_CATALOG_IMAGE_BYTES = 2 * 1024 * 1024;
export const CATALOG_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function websiteContentIssues(product: StorefrontProduct): WebsiteContentIssue[] {
  const issues: WebsiteContentIssue[] = [];
  if (!product.images.length) issues.push('IMAGE');
  if (!product.description) issues.push('DESCRIPTION');
  if (!product.specifications.length) issues.push('SPECIFICATIONS');
  if (product.kind !== 'DEVICE' && !product.compatibleModels.length) issues.push('COMPATIBILITY');
  if (product.price === null) issues.push('PRICE');
  return issues;
}

/** The editor reads only explicitly public fields, never internal notes or albums. */
export function websiteContentDraft(row: CatalogPublicContent): CatalogPublicContent {
  return {
    imageUrl: row.imageUrl || '', imageUrls: [...(row.imageUrls || [])],
    publicDescription: row.publicDescription || '', publicHighlights: [...(row.publicHighlights || [])],
    publicSpecifications: (row.publicSpecifications || []).map(spec => ({ ...spec }))
  };
}
