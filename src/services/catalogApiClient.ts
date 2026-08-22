import { apiJson } from './apiClient';
import type { MasterCatalogItem } from '../types';

/**
 * Product master API client.
 *
 * Inventory is deliberately not represented here: catalog data describes what
 * an item is, while inventory services own balances, lots and IMEIs.
 */
export type CatalogItemKind = 'DEVICE' | 'PART' | 'ACCESSORY';
export type CatalogDictionaryScope = 'FAMILY' | 'CATEGORY' | 'BRAND' | 'ATTRIBUTE' | 'TEMPLATE';

export interface CatalogModelRecord {
  id: string;
  brandName: string;
  brandCode: string;
  familyId?: string;
  familyName?: string;
  familyCode?: string;
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
  scope: CatalogDictionaryScope;
  group?: string;
  parentId?: string;
  familyId?: string;
  kind?: CatalogItemKind | 'SERVICE';
  config?: Record<string, unknown>;
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
  /** Optional convenience arrays returned by the iPhone seed API. */
  families?: CatalogDictionaryRecord[];
  groups?: CatalogDictionaryRecord[];
  attributeDefinitions?: CatalogDictionaryRecord[];
  templates?: CatalogDictionaryRecord[];
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

export interface CatalogIphoneSeedPreview {
  version?: string;
  ready?: boolean;
  alreadySeeded?: boolean;
  operationKey?: string;
  summary: {
    brands?: number;
    families?: number;
    groups?: number;
    categories?: number;
    attributes?: number;
    templates?: number;
    models?: number;
    [key: string]: number | undefined;
  };
  models?: Array<Pick<CatalogModelRecord, 'id' | 'modelName' | 'modelCode'>>;
  warnings?: string[];
}

export interface CatalogIphoneSeedResult {
  operationKey?: string;
  alreadySeeded?: boolean;
  totalCreated?: number;
  totalExisting?: number;
  summary?: CatalogIphoneSeedPreview['summary'];
  created?: Record<string, number | { total?: number; create?: number; existing?: number }>;
  existing?: Record<string, number | { total?: number; create?: number; existing?: number }>;
}

/** A setup record is removed only when unused; otherwise the server archives it. */
export interface CatalogSetupDeleteResult {
  id: string;
  deleted: boolean;
  archived: boolean;
  links?: Array<{ collection: string; count: number }>;
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
    familyId: raw?.familyId || undefined,
    familyName: raw?.familyName || undefined,
    familyCode: raw?.familyCode || undefined,
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
  const normalizedScope: CatalogDictionaryScope = ['FAMILY', 'CATEGORY', 'BRAND', 'ATTRIBUTE', 'TEMPLATE'].includes(scope)
    ? scope as CatalogDictionaryScope
    : 'ATTRIBUTE';
  return {
    id: String(raw?.id || ''),
    scope: normalizedScope,
    group: raw?.group || raw?.key || undefined,
    parentId: raw?.parentId || undefined,
    familyId: raw?.familyId || undefined,
    kind: raw?.kind || undefined,
    config: raw?.config && typeof raw.config === 'object' ? raw.config : undefined,
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
  const collection = (value: unknown, scope: CatalogDictionaryScope) => Array.isArray(value)
    ? value.map(entry => normalizeDictionary({ ...entry, scope: entry?.scope || entry?.dictionaryType || scope }))
    : [];
  const dictionaries = [
    ...(Array.isArray(raw?.dictionaries) ? raw.dictionaries.map(normalizeDictionary) : []),
    ...collection(raw?.families, 'FAMILY'),
    ...collection(raw?.groups, 'CATEGORY'),
    ...collection(raw?.attributeDefinitions, 'ATTRIBUTE'),
    ...collection(raw?.templates, 'TEMPLATE')
  ].filter((entry, index, all) => entry.id && all.findIndex(candidate => candidate.id === entry.id) === index);
  return {
    models: Array.isArray(raw?.models) ? raw.models.map(normalizeModel) : [],
    dictionaries,
    families: collection(raw?.families, 'FAMILY'),
    groups: collection(raw?.groups, 'CATEGORY'),
    attributeDefinitions: collection(raw?.attributeDefinitions, 'ATTRIBUTE'),
    templates: collection(raw?.templates, 'TEMPLATE'),
    itemSummary: raw?.itemSummary || (raw ? {
      total: raw.itemCount,
      devices: raw?.items?.filter?.((item: any) => item?.category === 'DEVICE').length,
      parts: raw?.items?.filter?.((item: any) => item?.category === 'PART').length,
      accessories: raw?.items?.filter?.((item: any) => item?.category === 'ACCESSORY').length
    } : undefined)
  };
}

function normalizeIphoneSeedPreview(raw: any): CatalogIphoneSeedPreview {
  const source = raw?.preview || raw || {};
  const summarySource = source?.summary || source?.counts || source?.toCreate || {};
  const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : undefined;
  const sectionCount = (...keys: string[]) => {
    for (const key of keys) {
      const value = summarySource?.[key];
      if (value && typeof value === 'object') {
        const fromCreate = numberValue(value.create ?? value.toCreate ?? value.total ?? value.count);
        if (fromCreate !== undefined) return fromCreate;
      }
      const scalar = numberValue(value);
      if (scalar !== undefined) return scalar;
    }
    return undefined;
  };
  const summary: CatalogIphoneSeedPreview['summary'] = {
    brands: sectionCount('brands', 'brand'),
    families: sectionCount('families', 'family'),
    groups: sectionCount('groups', 'group', 'categories', 'category'),
    categories: sectionCount('categories', 'category'),
    attributes: sectionCount('attributes', 'attribute'),
    templates: sectionCount('templates', 'template'),
    models: sectionCount('models', 'model'),
    total: sectionCount('total'),
    create: sectionCount('create')
  };
  return {
    version: source?.version ? String(source.version) : undefined,
    ready: source?.ready !== false,
    alreadySeeded: source?.alreadySeeded === true || source?.alreadyInitialized === true || source?.idempotentReplay === true,
    operationKey: source?.operationKey ? String(source.operationKey) : undefined,
    summary,
    models: Array.isArray(source?.models) ? source.models.map(normalizeModel) : [],
    warnings: Array.isArray(source?.warnings) ? source.warnings.map(String) : []
  };
}

function normalizeIphoneSeedResult(raw: any): CatalogIphoneSeedResult {
  const source = raw?.result || raw || {};
  const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : undefined;
  return {
    operationKey: source?.operationKey ? String(source.operationKey) : undefined,
    alreadySeeded: source?.alreadySeeded === true || source?.alreadyInitialized === true || source?.idempotentReplay === true,
    totalCreated: numeric(source?.totalCreated ?? source?.createdCount),
    totalExisting: numeric(source?.totalExisting ?? source?.existingCount),
    summary: normalizeIphoneSeedPreview(source).summary,
    created: source?.created && typeof source.created === 'object' ? source.created : undefined,
    existing: source?.existing && typeof source.existing === 'object' ? source.existing : undefined
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
  updateModel: async (modelId: string, patch: Partial<Omit<CatalogModelRecord, 'id' | 'modelCode' | 'brandCode'>>) => {
    const raw = await request<any>(`/api/catalog/models/${encodeURIComponent(modelId)}`, { method: 'PATCH', body: JSON.stringify(patch) });
    return normalizeModel(raw?.model || raw);
  },
  deleteModel: (modelId: string) => request<CatalogSetupDeleteResult>(`/api/catalog/models/${encodeURIComponent(modelId)}`, { method: 'DELETE' }),
  createDictionary: async (entry: Omit<CatalogDictionaryRecord, 'id'>) => normalizeDictionary(await post<any>('/api/catalog/dictionaries', {
    ...entry,
    dictionaryType: entry.scope,
    key: entry.group || entry.scope,
    name: entry.label,
    active: entry.status !== 'INACTIVE'
  })),
  updateDictionary: async (dictionaryId: string, patch: Partial<Omit<CatalogDictionaryRecord, 'id' | 'code' | 'scope' | 'dictionaryType' | 'key'>>) => {
    const raw = await request<any>(`/api/catalog/dictionaries/${encodeURIComponent(dictionaryId)}`, { method: 'PATCH', body: JSON.stringify(patch) });
    return normalizeDictionary(raw?.dictionary || raw);
  },
  deleteDictionary: (dictionaryId: string) => request<CatalogSetupDeleteResult>(`/api/catalog/dictionaries/${encodeURIComponent(dictionaryId)}`, { method: 'DELETE' }),
  updateItem: async (itemId: string, patch: Partial<Pick<MasterCatalogItem,
    'name' | 'posShortName' | 'aliases' | 'unit' | 'defaultImportPrice' | 'defaultRetailPrice' | 'notes' | 'status' | 'warrantyPeriodMonths' | 'imageUrl' | 'barcode'>>
  ) => request<MasterCatalogItem>(`/api/catalog/items/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  archiveItem: (itemId: string, reason?: string) => post<MasterCatalogItem>(`/api/catalog/items/${encodeURIComponent(itemId)}/archive`, { reason }),
  previewIphoneSeed: async () => normalizeIphoneSeedPreview(await request<any>('/api/catalog/iphone-seed/preview')),
  confirmIphoneSeed: async (operationKey: string) => normalizeIphoneSeedResult(await request<any>('/api/catalog/iphone-seed/confirm', {
    method: 'POST',
    body: JSON.stringify({ confirmed: true, operationKey })
  })),
  previewBulk: async (items: CatalogCandidateInput[]) => normalizePreview(await post<any>('/api/catalog/bulk/preview', { items, candidates: items })),
  createBulk: (items: CatalogCandidateInput[]) => post<CatalogCreateResult>('/api/catalog/bulk/create', { items, candidates: items }),
  previewClone: async (sourceModelId: string, targetModelId: string) => normalizePreview(await post<any>('/api/catalog/clone/preview', { sourceModelId, targetModelId })),
  createClone: (sourceModelId: string, targetModelId: string, selectedClientKeys?: string[], selectedSkus?: string[]) => post<CatalogCreateResult>('/api/catalog/clone/create', { sourceModelId, targetModelId, selectedClientKeys, selectedSkus }),
  previewImport: async (rows: string[][]) => normalizePreview(await post<any>('/api/catalog/import/preview', { rows })),
  createImport: (rows: string[][]) => post<CatalogCreateResult>('/api/catalog/import/create', { rows }),
  rollbackOperation: (operationKey: string) => post<CatalogRollbackResult>(`/api/catalog/operations/${encodeURIComponent(operationKey)}/rollback`, {})
};
