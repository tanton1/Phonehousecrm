import { apiJson } from './apiClient';
import type { MasterCatalogItem } from '../types';

/**
 * Product master API client.
 *
 * Inventory is deliberately not represented here: catalog data describes what
 * an item is, while inventory services own balances, lots and IMEIs.
 */
export type CatalogItemKind = 'DEVICE' | 'PART' | 'ACCESSORY';

export interface CatalogModelRecord {
  id: string;
  brandName: string;
  brandCode: string;
  seriesName?: string;
  seriesCode?: string;
  modelName: string;
  modelCode: string;
  releaseYear?: number | null;
  aliases?: string[];
  status?: 'ACTIVE' | 'INACTIVE';
  active?: boolean;
}

export interface CatalogDictionaryRecord {
  id: string;
  scope: 'CATEGORY' | 'BRAND' | 'ATTRIBUTE';
  group?: string;
  label: string;
  code: string;
  aliases?: string[];
  status?: 'ACTIVE' | 'INACTIVE';
  /** Native server schema aliases, retained to keep the UI adapter resilient. */
  dictionaryType?: string;
  key?: string;
  name?: string;
  active?: boolean;
}

export interface CatalogCandidateInput {
  clientKey: string;
  kind: CatalogItemKind;
  categoryId?: string;
  categoryName: string;
  categoryCode: string;
  modelId?: string;
  modelName?: string;
  modelCode?: string;
  brandName?: string;
  brandCode?: string;
  manufacturerName?: string;
  manufacturerCode?: string;
  qualityName?: string;
  qualityCode?: string;
  storageName?: string;
  storageCode?: string;
  colorName?: string;
  colorCode?: string;
  conditionName?: string;
  conditionCode?: string;
  compatibleModelIds?: string[];
  compatibleModelCodes?: string[];
  compatibleModelNames?: string[];
  unit?: string;
  unitCode?: string;
  defaultImportPrice?: number;
  defaultRetailPrice?: number;
  posShortName?: string;
  notes?: string;
}

export interface CatalogPreviewItem extends CatalogCandidateInput {
  sku: string;
  name: string;
  aliases: string[];
  status: 'NEW' | 'EXISTS' | 'CONFLICT' | 'INVALID';
  reason?: string;
  existingItemId?: string;
}

export interface CatalogPreviewResult {
  items: CatalogPreviewItem[];
  summary: {
    requested: number;
    createable: number;
    existing: number;
    conflicts: number;
    invalid: number;
  };
}

export interface CatalogBootstrap {
  models: CatalogModelRecord[];
  dictionaries: CatalogDictionaryRecord[];
  itemSummary?: {
    total?: number;
    devices?: number;
    parts?: number;
    accessories?: number;
  };
}

export interface CatalogListOptions {
  limit?: number;
  cursor?: string;
  search?: string;
  kind?: CatalogItemKind;
  includeArchived?: boolean;
  activeOnly?: boolean;
}

export interface CatalogListSummary {
  total: number;
  DEVICE: number;
  PART: number;
  ACCESSORY: number;
  archived: number;
  matching: number;
}

export interface CatalogListResult {
  items: MasterCatalogItem[];
  nextCursor?: string;
  hasMore: boolean;
  summary: CatalogListSummary;
}

export interface CatalogCreateResult {
  created: CatalogPreviewItem[];
  skipped?: CatalogPreviewItem[];
  summary?: CatalogPreviewResult['summary'];
  operationKey?: string;
  idempotentReplay?: boolean;
}

export interface CatalogRollbackResult {
  operationKey: string;
  archived: Array<{ itemId: string; sku?: string; status: 'ARCHIVED' }>;
  blocked: Array<{ itemId: string; sku?: string; status: 'BLOCKED'; reason: string; linkedTo?: string[] }>;
  summary: { archived: number; blocked: number };
  idempotentReplay?: boolean;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const result = await apiJson<ApiEnvelope<T> | T>(path, init);
  if (result && typeof result === 'object' && 'data' in result) {
    const envelope = result as ApiEnvelope<T>;
    if (envelope.success === false) throw new Error(envelope.error || envelope.message || 'Yêu cầu danh mục không thành công.');
    if (envelope.data === undefined) throw new Error(envelope.error || envelope.message || 'Máy chủ không trả dữ liệu danh mục.');
    return envelope.data;
  }
  return result as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

function normalizeModel(raw: any): CatalogModelRecord {
  return {
    id: String(raw?.id || ''),
    brandName: String(raw?.brandName || ''),
    brandCode: String(raw?.brandCode || ''),
    seriesName: raw?.seriesName || raw?.seriesCode || undefined,
    seriesCode: raw?.seriesCode || undefined,
    modelName: String(raw?.modelName || ''),
    modelCode: String(raw?.modelCode || ''),
    releaseYear: raw?.releaseYear === undefined || raw?.releaseYear === null ? null : Number(raw.releaseYear),
    aliases: Array.isArray(raw?.aliases) ? raw.aliases : [],
    active: raw?.active !== false,
    status: raw?.active === false || raw?.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'
  };
}

function normalizeDictionary(raw: any): CatalogDictionaryRecord {
  const scope = String(raw?.scope || raw?.dictionaryType || 'ATTRIBUTE').toUpperCase();
  return {
    id: String(raw?.id || ''),
    scope: scope === 'BRAND' || scope === 'CATEGORY' ? scope : 'ATTRIBUTE',
    group: raw?.group || raw?.key || undefined,
    label: String(raw?.label || raw?.name || ''),
    code: String(raw?.code || ''),
    aliases: Array.isArray(raw?.aliases) ? raw.aliases : [],
    active: raw?.active !== false,
    status: raw?.active === false || raw?.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    dictionaryType: raw?.dictionaryType,
    key: raw?.key,
    name: raw?.name
  };
}

function previewItemFromDraft(raw: any, status: CatalogPreviewItem['status'], reason?: string): CatalogPreviewItem {
  return {
    clientKey: String(raw?.clientKey || raw?.id || raw?.sku || `catalog-${Math.random().toString(36).slice(2)}`),
    kind: raw?.kind || raw?.category || 'PART',
    categoryId: raw?.categoryId,
    categoryName: String(raw?.categoryName || raw?.subCategory || ''),
    categoryCode: String(raw?.categoryCode || ''),
    modelId: raw?.modelId,
    modelName: raw?.modelName || raw?.model,
    modelCode: raw?.modelCode,
    brandName: raw?.brandName || raw?.brand,
    brandCode: raw?.brandCode,
    manufacturerName: raw?.manufacturerName,
    manufacturerCode: raw?.manufacturerCode,
    qualityName: raw?.qualityName,
    qualityCode: raw?.qualityCode,
    storageName: raw?.storageName || raw?.storage,
    storageCode: raw?.storageCode,
    colorName: raw?.colorName || raw?.color,
    colorCode: raw?.colorCode,
    conditionName: raw?.conditionName || raw?.condition,
    compatibleModelIds: raw?.compatibleModelIds,
    compatibleModelCodes: raw?.compatibleModelCodes,
    compatibleModelNames: raw?.compatibleModels,
    defaultImportPrice: raw?.defaultImportPrice,
    defaultRetailPrice: raw?.defaultRetailPrice,
    posShortName: raw?.posShortName,
    notes: raw?.notes,
    sku: String(raw?.sku || ''),
    name: String(raw?.name || raw?.displayName || ''),
    aliases: Array.isArray(raw?.aliases) ? raw.aliases : [],
    status,
    reason
  };
}

function normalizePreview(raw: any): CatalogPreviewResult {
  if (Array.isArray(raw?.items) && typeof raw?.summary?.createable === 'number') return raw as CatalogPreviewResult;
  const existing = new Map<string, any>((raw?.existing || []).map((item: any) => [String(item?.sku || ''), item]));
  const candidates = Array.isArray(raw?.candidates) ? raw.candidates : (Array.isArray(raw?.items) ? raw.items : []);
  const candidateItems = candidates.map((candidate: any) => previewItemFromDraft(candidate, existing.has(String(candidate?.sku || '')) ? 'EXISTS' : 'NEW', existing.get(String(candidate?.sku || ''))?.reason));
  const existingOnly = [...existing.entries()]
    .filter(([sku]) => !candidateItems.some(item => item.sku === sku))
    .map(([sku, item]) => previewItemFromDraft({ sku }, 'EXISTS', item?.reason));
  const invalid = Array.isArray(raw?.invalid) ? raw.invalid : [];
  const invalidItems = invalid.map((item: any, index: number) => previewItemFromDraft({ clientKey: `invalid-${item?.index ?? index}`, sku: item?.sku || '' }, 'INVALID', item?.error || 'Dòng không hợp lệ'));
  const conflicts = Array.isArray(raw?.nearDuplicates) ? raw.nearDuplicates : [];
  const conflictItems = conflicts.map((item: any, index: number) => previewItemFromDraft(item, 'CONFLICT', item?.similarTo ? `Gần giống ${item.similarTo}` : 'SKU gần giống'));
  const items = [...candidateItems, ...existingOnly, ...conflictItems, ...invalidItems];
  return {
    items,
    summary: {
      requested: Number(raw?.totalCount ?? raw?.summary?.total ?? items.length),
      createable: Number(raw?.newCount ?? raw?.summary?.new ?? candidateItems.filter((item: CatalogPreviewItem) => item.status === 'NEW').length),
      existing: Number(raw?.existingCount ?? raw?.summary?.existing ?? existingOnly.length),
      conflicts: Number(raw?.duplicateCount ?? raw?.summary?.duplicateInRequest ?? conflictItems.length),
      invalid: Number(raw?.summary?.invalid ?? invalidItems.length)
    }
  };
}

function normalizeBootstrap(raw: any): CatalogBootstrap {
  return {
    models: Array.isArray(raw?.models) ? raw.models.map(normalizeModel) : [],
    dictionaries: Array.isArray(raw?.dictionaries) ? raw.dictionaries.map(normalizeDictionary) : [],
    itemSummary: raw?.itemSummary || (raw ? {
      total: raw.itemCount,
      devices: raw?.items?.filter?.((item: any) => item?.category === 'DEVICE').length,
      parts: raw?.items?.filter?.((item: any) => item?.category === 'PART').length,
      accessories: raw?.items?.filter?.((item: any) => item?.category === 'ACCESSORY').length
    } : undefined)
  };
}

function normalizeCatalogList(raw: any): CatalogListResult {
  const summary = raw?.summary || {};
  return {
    items: Array.isArray(raw?.items) ? raw.items.map((item: any) => ({
      ...item,
      id: String(item?.id || ''),
      sku: String(item?.sku || ''),
      name: String(item?.name || item?.displayName || ''),
      category: item?.category || 'PART',
      defaultImportPrice: Number(item?.defaultImportPrice || 0),
      defaultRetailPrice: Number(item?.defaultRetailPrice || 0)
    })) : [],
    nextCursor: typeof raw?.nextCursor === 'string' && raw.nextCursor ? raw.nextCursor : undefined,
    hasMore: raw?.hasMore === true,
    summary: {
      total: Number(summary.total || 0),
      DEVICE: Number(summary.DEVICE || 0),
      PART: Number(summary.PART || 0),
      ACCESSORY: Number(summary.ACCESSORY || 0),
      archived: Number(summary.archived || 0),
      matching: Number(summary.matching || 0)
    }
  };
}

export const catalogApi = {
  bootstrap: async () => normalizeBootstrap(await request<any>('/api/catalog/bootstrap')),
  listItems: async (options: CatalogListOptions = {}) => {
    const query = new URLSearchParams();
    if (options.limit !== undefined) query.set('limit', String(options.limit));
    if (options.cursor) query.set('cursor', options.cursor);
    if (options.search?.trim()) query.set('search', options.search.trim());
    if (options.kind) query.set('kind', options.kind);
    if (options.includeArchived) query.set('includeArchived', 'true');
    if (options.activeOnly) query.set('activeOnly', 'true');
    const suffix = query.toString();
    return normalizeCatalogList(await request<any>(`/api/catalog/items${suffix ? `?${suffix}` : ''}`));
  },
  createModel: async (model: Omit<CatalogModelRecord, 'id'>) => {
    const raw = await post<any>('/api/catalog/models', {
    ...model,
    seriesCode: model.seriesCode || model.seriesName || undefined,
    active: model.status !== 'INACTIVE'
    });
    return normalizeModel(raw?.model || raw);
  },
  createDictionary: async (entry: Omit<CatalogDictionaryRecord, 'id'>) => normalizeDictionary(await post<any>('/api/catalog/dictionaries', {
    ...entry,
    dictionaryType: entry.scope,
    key: entry.group || entry.scope,
    name: entry.label,
    active: entry.status !== 'INACTIVE'
  })),
  previewBulk: async (items: CatalogCandidateInput[]) => normalizePreview(await post<any>('/api/catalog/bulk/preview', { items, candidates: items })),
  createBulk: (items: CatalogCandidateInput[]) => post<CatalogCreateResult>('/api/catalog/bulk/create', { items, candidates: items }),
  previewClone: async (sourceModelId: string, targetModelId: string) => normalizePreview(await post<any>('/api/catalog/clone/preview', { sourceModelId, targetModelId })),
  createClone: (sourceModelId: string, targetModelId: string, selectedClientKeys?: string[], selectedSkus?: string[]) => post<CatalogCreateResult>('/api/catalog/clone/create', { sourceModelId, targetModelId, selectedClientKeys, selectedSkus }),
  previewImport: async (rows: string[][]) => normalizePreview(await post<any>('/api/catalog/import/preview', { rows })),
  createImport: (rows: string[][]) => post<CatalogCreateResult>('/api/catalog/import/create', { rows }),
  rollbackOperation: (operationKey: string) => post<CatalogRollbackResult>(`/api/catalog/operations/${encodeURIComponent(operationKey)}/rollback`, {})
};
