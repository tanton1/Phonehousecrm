import { publicProductHighlights, publicProductImages, publicProductSpecifications } from '../../shared/catalogPublicContent';
import { canonicalDeviceVariantKey } from '../../shared/retailPricing';

type Row = Record<string, any> & { id: string };
type ContentData = { catalog: Row[]; models?: Row[]; variantContent?: Row[]; products: Row[]; devices: Row[]; parts: Row[]; branches: Row[] };
const key = (value: unknown) => typeof value === 'string' ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() : '';
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 100) : [];
const text = (value: unknown, max = 6000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const active = (row: Row) => row.active !== false && row.isActive !== false && row.isArchived !== true && !['inactive', 'INACTIVE'].includes(row.status) && !['INACTIVE', 'ARCHIVED'].includes(row.lifecycleStatus);

/** Exact model resolution only: an invalid explicit ID must not match a different model by name. */
export function resolveStorefrontModel(master: Row, models: Row[]): Row | undefined {
  if (master.modelId) return models.find(model => model.id === master.modelId && active(model));
  const candidates = models.filter(model => active(model)
    && (!master.brand || key(master.brand) === key(model.brandName))
    && (master.modelCode ? key(master.modelCode) === key(model.modelCode) : key(master.model) && key(master.model) === key(model.modelName)));
  return candidates.length === 1 ? candidates[0] : undefined;
}
function modelIdentity(master: Row, models: Row[]) {
  const model = resolveStorefrontModel(master, models);
  return { id: master.modelId || model?.id || '', code: master.modelCode || model?.modelCode || '', name: model?.modelName || master.model || '', brand: master.brand || model?.brandName || '' };
}
export function storefrontAccessoryMatches(device: Row, accessory: Row, models: Row[] = []): boolean {
  if (device.category !== 'DEVICE' || !['ACCESSORY', 'PART'].includes(accessory.category)) return false;
  const target = modelIdentity(device, models);
  const ids = strings(accessory.compatibleModelIds), codes = strings(accessory.compatibleModelCodes), names = strings(accessory.compatibleModels);
  // A stronger reference mismatch cannot be overridden by a broad legacy name.
  if (ids.length) return !!target.id && ids.includes(target.id);
  if (codes.length) return !!target.code && codes.some(code => key(code) === key(target.code));
  return !!key(target.name) && names.some(name => key(name) === key(target.name));
}

export function createStorefrontContentResolver(data: ContentData, branchId: string, linked: (row: Row, kind: 'DEVICE' | 'ACCESSORY' | 'PART') => string | null) {
  const models = data.models || [], branches = new Set(data.branches.map(branch => branch.id));
  const siblingKey = (row: Row) => row.category !== 'DEVICE' || !key(row.color || row.attributes?.color) || !(row.modelId || key(row.model)) ? ''
    : JSON.stringify([row.modelId || `legacy:${key(row.brand)}:${key(row.model)}`, key(row.color || row.attributes?.color)]);
  const siblingMedia = new Map<string, Row>();
  // Index once instead of scanning every SKU for every product on every page.
  for (const row of data.catalog.slice().sort((a, b) => a.id.localeCompare(b.id))) {
    const group = siblingKey(row);
    if (group && !siblingMedia.has(group) && publicProductImages(row).length) siblingMedia.set(group, row);
  }
  const sources = new Map<string, Row[]>();
  for (const [rows, kind] of [[data.devices, 'DEVICE'], [data.products, 'ACCESSORY'], [data.parts, 'PART']] as const) {
    for (const row of rows) {
      if (!active(row) || row.publicVisible !== true) continue;
      if (row.branchId && (!branches.has(row.branchId) || branchId && row.branchId !== branchId)) continue;
      const allowed = strings(row.publicBranchIds).filter(id => branches.has(id));
      if (Array.isArray(row.publicBranchIds) && (branchId ? !allowed.includes(branchId) : !allowed.length)) continue;
      const id = linked(row, kind);
      if (id) {
        // Existing miniweb publication exposes only the cover (or the first
        // legacy device image), not the whole unit inspection photo album.
        // Additional approved gallery images belong on the public master/model.
        const publishedRow = { ...row, imageUrl: row.imageUrl || (kind === 'DEVICE' && Array.isArray(row.images) ? row.images[0] : undefined), images: [], imageUrls: [] };
        sources.set(id, [...(sources.get(id) || []), publishedRow]);
      }
    }
  }
  return (master: Row) => {
    const model = master.category === 'DEVICE' ? resolveStorefrontModel(master, models) : undefined;
    const published = (sources.get(master.id) || []).sort((a, b) => a.id.localeCompare(b.id));
    const presentation = (row: Row) => {
      if (branchId && row.publicPresentationByBranch?.[branchId]) return row.publicPresentationByBranch[branchId];
      if (branchId || publicProductImages(row).length || text(row.publicDescription)) return row;
      // No branch selected: use a deterministic, explicitly published active-branch
      // presentation. Do not read a draft presentation from another branch.
      const publishedBranch = strings(row.publicBranchIds).filter(id => branches.has(id)).sort().find(id => {
        const value = row.publicPresentationByBranch?.[id];
        return value && (publicProductImages(value).length || text(value.publicDescription));
      });
      return publishedBranch ? row.publicPresentationByBranch[publishedBranch] : row;
    };
    // Older catalogue imports keep configuration fields under attributes.
    // Normalize locally without changing pricing/ledger variant identifiers.
    const configuration = {
      model: text(master.model) || model?.modelName || text(master.attributes?.model),
      storage: text(master.storage) || text(master.attributes?.storage),
      color: text(master.color) || text(master.attributes?.color),
      condition: text(master.condition) || text(master.attributes?.condition)
    };
    const variantKey = canonicalDeviceVariantKey(configuration);
    const variant = master.category === 'DEVICE' && configuration.model && configuration.storage && configuration.condition ? (data.variantContent || []).find(row => active(row)
      && (branchId ? strings(row.publicBranchIds).includes(branchId) : strings(row.publicBranchIds).some(id => branches.has(id)))
      && (row.variantKey || canonicalDeviceVariantKey(row)) === variantKey) : undefined;
    const variantData = variant ? presentation(variant) : undefined;
    const sibling = siblingMedia.get(siblingKey(master));
    const mediaChoices = [
      { row: master, note: 'Ảnh danh mục của cấu hình sản phẩm.' },
      ...(sibling ? [{ row: sibling, note: 'Ảnh tham khảo cùng model và màu; tình trạng máy thực tế do cửa hàng xác nhận.' }] : []),
      ...published.map(row => ({ row: presentation(row), note: 'Ảnh đã công khai từ hệ thống cửa hàng; nhân viên xác nhận sản phẩm thực tế trước khi giao.' })),
      ...(variantData ? [{ row: variantData, note: 'Ảnh tham khảo của dòng máy từ miniweb; màu và tình trạng thực tế cần xác nhận.' }] : []),
      ...(model ? [{ row: model, note: 'Ảnh tham khảo chung của model; màu và tình trạng thực tế có thể khác.' }] : [])
    ];
    const media = mediaChoices.find(choice => publicProductImages(choice.row).length);
    const content = [master, variantData, ...published.map(presentation), model].filter(Boolean);
    const description = content.map(row => text(row.publicDescription)).find(Boolean) || '';
    const highlights = content.map(row => publicProductHighlights(row.publicHighlights)).find(items => items.length) || [];
    const specificationsByLabel = new Map<string, { label: string; value: string }>();
    // Higher-priority records win, including when a model has a full 24-row table.
    for (const row of content) for (const spec of publicProductSpecifications(row.publicSpecifications)) {
      if (!specificationsByLabel.has(key(spec.label))) specificationsByLabel.set(key(spec.label), spec);
    }
    const specifications = [...specificationsByLabel.values()].slice(0, 24);
    const compatibleModels = strings(master.compatibleModelIds).length
      ? strings(master.compatibleModelIds).flatMap(id => { const found = models.find(row => row.id === id && active(row)); return found ? [text(found.modelName, 160)] : []; })
      : strings(master.compatibleModelCodes).length ? strings(master.compatibleModelCodes).flatMap(code => { const matches = models.filter(row => key(row.modelCode) === key(code) && active(row)); return matches.length === 1 ? [text(matches[0].modelName, 160)] : []; })
        : strings(master.compatibleModels);
    return { model, images: media ? publicProductImages(media.row) : [], imageNote: media?.note || '', description, highlights, specifications, compatibleModels: [...new Set(compatibleModels)] };
  };
}
