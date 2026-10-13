export interface PublicProductSpecification { label: string; value: string }
/** Explicitly public merchandising content, separate from internal notes and unit photos. */
export interface CatalogPublicContent {
  imageUrl?: string;
  imageUrls?: string[];
  publicDescription?: string;
  publicHighlights?: string[];
  publicSpecifications?: PublicProductSpecification[];
}

export function catalogPublicContentErrorMessage(error: unknown): string | null {
  const code = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const messages: Record<string, string> = {
    CATALOG_PUBLIC_IMAGE_INVALID: 'Kiểm tra ảnh: tối đa 8 đường dẫn thư viện, dùng URL HTTPS hoặc đường dẫn bắt đầu bằng /. Mỗi đường dẫn tối đa 2.000 ký tự.',
    CATALOG_PUBLIC_DESCRIPTION_INVALID: 'Mô tả sản phẩm chỉ được dài tối đa 6.000 ký tự.',
    CATALOG_PUBLIC_HIGHLIGHTS_INVALID: 'Nhập tối đa 8 điểm nổi bật, mỗi điểm không quá 240 ký tự.',
    CATALOG_PUBLIC_SPECIFICATIONS_INVALID: 'Mỗi thông số cần đủ tên và giá trị. Tối đa 24 dòng; tên tối đa 80 ký tự, giá trị tối đa 400 ký tự.',
    CATALOG_COMPATIBILITY_INVALID: 'Chọn tối đa 100 model tương thích hợp lệ, không để trống mã hoặc tên model.'
  };
  return messages[code] || null;
}

const clean = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
export function publicProductImageUrl(value: unknown): string | null {
  const url = clean(value, 2000);
  if (/^\/(?!\/)/.test(url) && !/[\\\r\n]/.test(url)) return url;
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : null; }
  catch { return null; }
}
export function publicProductImages(row: Record<string, unknown>): string[] {
  const candidates = [row.imageUrl, ...(Array.isArray(row.imageUrls) ? row.imageUrls : []), ...(Array.isArray(row.images) ? row.images : [])];
  return [...new Set(candidates.map(publicProductImageUrl).filter((url): url is string => url !== null))].slice(0, 8);
}
export function publicProductSpecifications(value: unknown): PublicProductSpecification[] {
  if (!Array.isArray(value)) return [];
  const entries = new Map<string, PublicProductSpecification>();
  for (const row of value.slice(0, 30)) {
    const label = clean(row?.label, 80), content = clean(row?.value, 400);
    if (label && content) entries.set(label.toLocaleLowerCase('vi'), { label, value: content });
  }
  return [...entries.values()].slice(0, 24);
}
export function publicProductHighlights(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map(item => clean(item, 240)).filter(Boolean))].slice(0, 8) : [];
}
export function catalogPublicContentPatch(input: Record<string, unknown>): CatalogPublicContent {
  const patch: CatalogPublicContent = {};
  if (input.imageUrl !== undefined) {
    if (typeof input.imageUrl !== 'string' || input.imageUrl.length > 2000 || (input.imageUrl.trim() && !publicProductImageUrl(input.imageUrl))) throw new Error('CATALOG_PUBLIC_IMAGE_INVALID');
    patch.imageUrl = publicProductImageUrl(input.imageUrl) || '';
  }
  if (input.imageUrls !== undefined) {
    if (!Array.isArray(input.imageUrls) || input.imageUrls.length > 8 || input.imageUrls.some(url => typeof url !== 'string' || url.length > 2000 || !publicProductImageUrl(url))) throw new Error('CATALOG_PUBLIC_IMAGE_INVALID');
    patch.imageUrls = publicProductImages({ imageUrls: input.imageUrls });
  }
  if (input.publicDescription !== undefined) {
    if (typeof input.publicDescription !== 'string' || input.publicDescription.length > 6000) throw new Error('CATALOG_PUBLIC_DESCRIPTION_INVALID');
    patch.publicDescription = input.publicDescription.trim();
  }
  if (input.publicHighlights !== undefined) {
    if (!Array.isArray(input.publicHighlights) || input.publicHighlights.length > 8 || input.publicHighlights.some(value => typeof value !== 'string' || value.length > 240)) throw new Error('CATALOG_PUBLIC_HIGHLIGHTS_INVALID');
    patch.publicHighlights = publicProductHighlights(input.publicHighlights);
  }
  if (input.publicSpecifications !== undefined) {
    if (!Array.isArray(input.publicSpecifications) || input.publicSpecifications.length > 24 || input.publicSpecifications.some(row => !row || typeof row.label !== 'string' || typeof row.value !== 'string' || !row.label.trim() || !row.value.trim() || row.label.length > 80 || row.value.length > 400)) throw new Error('CATALOG_PUBLIC_SPECIFICATIONS_INVALID');
    patch.publicSpecifications = publicProductSpecifications(input.publicSpecifications);
  }
  return patch;
}
