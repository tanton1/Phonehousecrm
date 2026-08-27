import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Database,
  Edit3,
  FileSpreadsheet,
  Filter,
  Layers,
  ListFilter,
  Package,
  PackagePlus,
  Plus,
  Power,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
  Tag,
  Tags,
  Trash2,
  Wrench,
  Headphones,
  X
} from 'lucide-react';
import { FundAccount, MasterCatalogItem, Partner, PurchaseOrder, StoreBranch, UserAccount, WarehouseInfo } from '../types';
import { DeviceImageThumbnail } from './DeviceImageThumbnail';
import { StockItemPurchaseEntryForm } from './StockItemPurchaseEntryForm';
import {
  catalogApi,
  CatalogBootstrap,
  CatalogCandidateInput,
  CatalogDictionaryRecord,
  CatalogDictionaryScope,
  CatalogIphoneSeedPreview,
  CatalogItemKind,
  CatalogListResult,
  CatalogModelRecord,
  CatalogPreviewItem,
  CatalogPreviewResult
} from '../services/catalogApiClient';

interface CatalogCenterViewProps {
  items: MasterCatalogItem[];
  currentUser?: UserAccount | null;
  partners?: Partner[];
  branches?: StoreBranch[];
  warehouses?: WarehouseInfo[];
  funds?: FundAccount[];
  onAddPurchaseOrder?: (order: PurchaseOrder, postToInventory: boolean) => Promise<PurchaseOrder | void> | PurchaseOrder | void;
  onAddPartner?: (partner: Partner) => Partner | void | Promise<Partner | void>;
}

type CenterTab = 'CATALOG' | 'MODELS' | 'BULK' | 'TOOLS';

interface CodeValue {
  id: string;
  label: string;
  code: string;
}

const CATEGORY_META: Record<CatalogItemKind, { label: string; description: string; icon: typeof Smartphone; tone: string }> = {
  DEVICE: {
    label: 'Máy',
    description: 'Model + cấu hình + màu',
    icon: Smartphone,
    tone: 'bg-orange-50 text-orange-700 border-orange-200'
  },
  PART: {
    label: 'Linh kiện',
    description: 'Loại + model tương thích + hãng + cấp',
    icon: Wrench,
    tone: 'bg-amber-50 text-amber-800 border-amber-200'
  },
  ACCESSORY: {
    label: 'Phụ kiện',
    description: 'Loại + model + hãng/phiên bản',
    icon: Headphones,
    tone: 'bg-sky-50 text-sky-800 border-sky-200'
  }
};

const DICTIONARY_SCOPE_META: Record<CatalogDictionaryScope, { label: string; shortLabel: string }> = {
  FAMILY: { label: 'Dòng sản phẩm', shortLabel: 'Dòng' },
  CATEGORY: { label: 'Nhóm hàng', shortLabel: 'Nhóm' },
  BRAND: { label: 'Thương hiệu', shortLabel: 'Hãng' },
  ATTRIBUTE: { label: 'Thuộc tính', shortLabel: 'Thuộc tính' },
  TEMPLATE: { label: 'Mẫu tạo hàng', shortLabel: 'Mẫu' }
};

const dictionaryScopeLabel = (scope: CatalogDictionaryScope) => DICTIONARY_SCOPE_META[scope]?.label || 'Thiết lập khác';

const compactSeedCount = (preview: CatalogIphoneSeedPreview | null, ...keys: string[]) => {
  if (!preview) return 0;
  return keys.reduce((total, key) => total + Number(preview.summary[key] || 0), 0);
};

const csv = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);

const codeLabel = (value?: string) => value?.trim().toUpperCase().replace(/\s+/g, '-') || '';

const searchableText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'd')
  .toLowerCase();

const money = (value?: number) => new Intl.NumberFormat('vi-VN').format(Number(value || 0));

const statusMeta: Record<CatalogPreviewItem['status'], { label: string; className: string }> = {
  NEW: { label: 'Sẵn sàng tạo', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  EXISTS: { label: 'Đã tồn tại', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  CONFLICT: { label: 'Xung đột', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  INVALID: { label: 'Thiếu cấu hình', className: 'bg-zinc-100 text-zinc-600 border-zinc-200' }
};

function IconButton({
  label,
  onClick,
  children,
  disabled = false,
  className = ''
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-xl transition-all disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}

function EmptyState({ icon: Icon, title, description, action }: {
  icon: typeof Database;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-orange-500 shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-black text-zinc-800">{title}</p>
      <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-zinc-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function CodeBadge({ code, muted = false }: { code?: string; muted?: boolean }) {
  return (
    <span className={`inline-flex max-w-full items-center rounded-lg border px-2 py-1 font-mono text-[10px] font-black tracking-wide ${
      muted || !code ? 'border-zinc-200 bg-zinc-100 text-zinc-400' : 'border-zinc-200 bg-white text-zinc-700'
    }`}>
      {code || 'CHƯA GÁN MÃ'}
    </span>
  );
}

function FieldLabel({ children, required = false, hint }: { children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <div className="mb-1 flex items-center gap-1">
      <label className="text-[11px] font-bold text-zinc-700">{children}{required && <span className="ml-0.5 text-rose-500">*</span>}</label>
      {hint && <span title={hint} className="cursor-help text-[10px] text-zinc-400">ⓘ</span>}
    </div>
  );
}

function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100 ${className}`} />;
}

function Select({ className = '', children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100 ${className}`}>{children}</select>;
}

/**
 * Product Master center.
 *
 * `items` is retained only to avoid breaking the parent during the migration.
 * The list below deliberately comes from the paginated server API, never a
 * browser-wide Firestore subscription. New master data and generated SKUs are
 * also sent to that same server API, which owns uniqueness and audit.
 */
export const CatalogCenterView: React.FC<CatalogCenterViewProps> = ({
  items: _items,
  currentUser,
  partners = [],
  branches = [],
  warehouses = [],
  funds = [],
  onAddPurchaseOrder,
  onAddPartner
}) => {
  const [activeTab, setActiveTab] = useState<CenterTab>('CATALOG');
  const [bootstrap, setBootstrap] = useState<CatalogBootstrap | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastOperation, setLastOperation] = useState<{ operationKey: string; createdCount: number; label: string } | null>(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);

  const [catalogSearchInput, setCatalogSearchInput] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogKind, setCatalogKind] = useState<CatalogItemKind | 'ALL'>('ALL');
  const [catalogPage, setCatalogPage] = useState<CatalogListResult | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false);
  const [stockReceiptOpen, setStockReceiptOpen] = useState(false);
  const catalogRequestId = useRef(0);

  const [isModelFormOpen, setIsModelFormOpen] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [modelDraft, setModelDraft] = useState({
    brandName: '',
    brandCode: '',
    seriesName: '',
    modelName: '',
    modelCode: '',
    releaseYear: '',
    aliases: ''
  });
  const [isDictionaryFormOpen, setIsDictionaryFormOpen] = useState(false);
  const [editingDictionaryId, setEditingDictionaryId] = useState<string | null>(null);
  const [dictionaryDraft, setDictionaryDraft] = useState<{
    scope: CatalogDictionaryScope;
    group: string;
    label: string;
    code: string;
    aliases: string;
    parentId: string;
  }>({ scope: 'CATEGORY', group: '', label: '', code: '', aliases: '', parentId: '' });

  const [iphoneSeedPreview, setIphoneSeedPreview] = useState<CatalogIphoneSeedPreview | null>(null);
  const [iphoneSeedLoading, setIphoneSeedLoading] = useState(false);
  const [iphoneSeedCreating, setIphoneSeedCreating] = useState(false);
  const [catalogItemEdit, setCatalogItemEdit] = useState<MasterCatalogItem | null>(null);
  const [catalogItemEditLoading, setCatalogItemEditLoading] = useState(false);

  const [bulkKind, setBulkKind] = useState<CatalogItemKind>('PART');
  const [bulkCategoryName, setBulkCategoryName] = useState('');
  const [bulkCategoryCode, setBulkCategoryCode] = useState('');
  const [bulkCategorySearch, setBulkCategorySearch] = useState('');
  const [bulkUnit, setBulkUnit] = useState<CodeValue | null>(null);
  const [bulkModelIds, setBulkModelIds] = useState<string[]>([]);
  const [bulkManufacturerValues, setBulkManufacturerValues] = useState<CodeValue[]>([]);
  const [bulkQualityValues, setBulkQualityValues] = useState<CodeValue[]>([]);
  const [bulkStorageValues, setBulkStorageValues] = useState<CodeValue[]>([]);
  const [bulkColorValues, setBulkColorValues] = useState<CodeValue[]>([]);
  const [bulkCondition, setBulkCondition] = useState<CodeValue | null>(null);
  const [bulkImportPrice, setBulkImportPrice] = useState('');
  const [bulkRetailPrice, setBulkRetailPrice] = useState('');
  const [bulkNotes, setBulkNotes] = useState('');
  const [preview, setPreview] = useState<CatalogPreviewResult | null>(null);
  // A preview is a real matrix, not an all-or-nothing batch. Keep the exact
  // candidate snapshot that was reviewed so deselected cells are never
  // recreated from a newer browser state at submit time.
  const [bulkPreviewCandidates, setBulkPreviewCandidates] = useState<CatalogCandidateInput[]>([]);
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const [cloneSourceId, setCloneSourceId] = useState('');
  const [cloneTargetId, setCloneTargetId] = useState('');
  const [clonePreview, setClonePreview] = useState<CatalogPreviewResult | null>(null);
  const [cloneSelected, setCloneSelected] = useState<string[]>([]);
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneCreateLoading, setCloneCreateLoading] = useState(false);

  const [pasteText, setPasteText] = useState('');
  const [pastePreview, setPastePreview] = useState<CatalogPreviewResult | null>(null);
  const [pastePreviewLoading, setPastePreviewLoading] = useState(false);
  const [pasteCreateLoading, setPasteCreateLoading] = useState(false);

  const loadCatalogPage = useCallback(async (cursor?: string, append = false) => {
    const requestId = ++catalogRequestId.current;
    if (append) setCatalogLoadingMore(true);
    else {
      setCatalogLoading(true);
      setCatalogPage(null);
    }
    try {
      const result = await catalogApi.listItems({
        limit: 50,
        cursor,
        search: catalogSearch || undefined,
        kind: catalogKind === 'ALL' ? undefined : catalogKind
      });
      if (requestId !== catalogRequestId.current) return;
      setCatalogPage(current => append && current
        ? { ...result, items: [...current.items, ...result.items] }
        : result);
    } catch (error: any) {
      if (requestId === catalogRequestId.current) setApiError(error?.message || 'Không thể tải danh mục hàng hóa từ máy chủ.');
    } finally {
      if (requestId === catalogRequestId.current) {
        setCatalogLoading(false);
        setCatalogLoadingMore(false);
      }
    }
  }, [catalogKind, catalogSearch]);

  const loadBootstrap = async () => {
    setLoadingBootstrap(true);
    setApiError(null);
    try {
      const result = await catalogApi.bootstrap();
      setBootstrap({
        ...result,
        models: result.models || [],
        dictionaries: result.dictionaries || [],
        itemSummary: result.itemSummary
      });
    } catch (error: any) {
      setApiError(error?.message || 'Không thể tải cấu hình danh mục hàng hóa từ máy chủ.');
    } finally {
      setLoadingBootstrap(false);
    }
  };

  useEffect(() => {
    void loadBootstrap();
  }, []);

  useEffect(() => {
    void loadCatalogPage();
  }, [loadCatalogPage]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3500);
  };

  const models = bootstrap?.models || [];
  const activeModels = models.filter(model => model.active !== false && model.status !== 'INACTIVE');
  const dictionaries = bootstrap?.dictionaries || [];
  const catalogItems = catalogPage?.items || [];
  const itemStats = catalogPage?.summary || { total: 0, DEVICE: 0, PART: 0, ACCESSORY: 0, archived: 0, matching: 0 };

  const dictionaryGroups = useMemo(() => {
    const groups = new Map<string, CatalogDictionaryRecord[]>();
    dictionaries.forEach(entry => {
      const label = entry.scope === 'ATTRIBUTE' && entry.group
        ? `${dictionaryScopeLabel(entry.scope)} · ${entry.group}`
        : dictionaryScopeLabel(entry.scope);
      groups.set(label, [...(groups.get(label) || []), entry]);
    });
    return [...groups.entries()];
  }, [dictionaries]);

  const dictionaryForScope = (scope: CatalogDictionaryRecord['scope']) => dictionaries.filter(entry => entry.scope === scope && entry.status !== 'INACTIVE');
  const dictionaryOptionsFor = (scope: CatalogDictionaryRecord['scope'], group?: string, strictGroup = false): CodeValue[] => {
    const expectedGroup = String(group || '').trim().toUpperCase();
    const scoped = dictionaryForScope(scope);
    const matching = expectedGroup
      ? scoped.filter(entry => String(entry.group || '').trim().toUpperCase() === expectedGroup)
      : scoped;
    return (matching.length || strictGroup ? matching : scoped).map(entry => ({ id: entry.id, label: entry.label, code: entry.code }));
  };
  const bulkCategoryOptions = useMemo(() => {
    const query = searchableText(bulkCategorySearch).trim();
    return dictionaryForScope('CATEGORY')
      .filter(entry => !entry.kind || entry.kind === bulkKind)
      .filter(entry => !query || searchableText([entry.label, entry.code, ...(entry.aliases || [])].join(' ')).includes(query));
  }, [dictionaries, bulkCategorySearch, bulkKind]);

  const selectedModels = useMemo(() => activeModels.filter(model => bulkModelIds.includes(model.id)), [activeModels, bulkModelIds]);

  const toggleBulkModel = (modelId: string) => {
    setPreview(null);
    setBulkModelIds(current => current.includes(modelId) ? current.filter(id => id !== modelId) : [...current, modelId]);
  };

  // Biến thể chỉ được lấy từ Bộ từ điển. Chọn/bỏ chọn trực tiếp giúp tạo ma
  // trận nhanh hơn, đồng thời không mở lại đường nhập mã tự do ở frontend.
  const toggleCodeValue = (setter: React.Dispatch<React.SetStateAction<CodeValue[]>>, option: CodeValue) => {
    const normalized = codeLabel(option.code);
    setter(current => current.some(row => codeLabel(row.code) === normalized)
      ? current.filter(row => codeLabel(row.code) !== normalized)
      : [...current, { id: option.id, label: option.label, code: option.code }]);
    setPreview(null);
  };

  useEffect(() => {
    const configuredUnits = dictionaryOptionsFor('ATTRIBUTE', 'UNIT', true);
    if (!bulkUnit && configuredUnits.length === 1) setBulkUnit(configuredUnits[0]);
  }, [dictionaries, bulkUnit]);

  const buildBulkCandidates = (): CatalogCandidateInput[] => {
    const modelRows = selectedModels;
    const nonEmpty = (rows: CodeValue[]) => rows.filter(row => row.label.trim() || row.code.trim());
    const manufacturers = nonEmpty(bulkManufacturerValues);
    const qualities = nonEmpty(bulkQualityValues);
    const storages = nonEmpty(bulkStorageValues);
    const colors = nonEmpty(bulkColorValues);
    const base = {
      kind: bulkKind,
      categoryName: bulkCategoryName.trim(),
      categoryCode: codeLabel(bulkCategoryCode),
      unit: bulkUnit?.label || undefined,
      unitCode: codeLabel(bulkUnit?.code),
      conditionName: bulkCondition?.label || undefined,
      conditionCode: codeLabel(bulkCondition?.code),
      defaultImportPrice: bulkImportPrice ? Number(bulkImportPrice) : undefined,
      defaultRetailPrice: bulkRetailPrice ? Number(bulkRetailPrice) : undefined,
      notes: bulkNotes.trim() || undefined
    };
    const outputs: CatalogCandidateInput[] = [];
    let counter = 0;

    const push = (model: CatalogModelRecord, extra: Partial<CatalogCandidateInput>) => {
      outputs.push({
        clientKey: `matrix-${Date.now()}-${counter++}`,
        ...base,
        modelId: model.id,
        modelName: model.modelName,
        modelCode: codeLabel(model.modelCode),
        brandName: model.brandName,
        brandCode: codeLabel(model.brandCode),
        compatibleModelIds: bulkKind === 'DEVICE' ? undefined : [model.id],
        compatibleModelCodes: bulkKind === 'DEVICE' ? undefined : [codeLabel(model.modelCode)],
        compatibleModelNames: bulkKind === 'DEVICE' ? undefined : [model.modelName],
        ...extra
      });
    };

    modelRows.forEach(model => {
      if (bulkKind === 'DEVICE') {
        (storages.length ? storages : [{ id: 'none-storage', label: '', code: '' }]).forEach(storage => {
          (colors.length ? colors : [{ id: 'none-color', label: '', code: '' }]).forEach(color => {
            push(model, {
              storageName: storage.label.trim() || undefined,
              storageCode: codeLabel(storage.code),
              colorName: color.label.trim() || undefined,
              colorCode: codeLabel(color.code)
            });
          });
        });
        return;
      }

      (manufacturers.length ? manufacturers : [{ id: 'none-manufacturer', label: '', code: '' }]).forEach(manufacturer => {
        (qualities.length ? qualities : [{ id: 'none-quality', label: '', code: '' }]).forEach(quality => {
          push(model, {
            manufacturerName: manufacturer.label.trim() || undefined,
            manufacturerCode: codeLabel(manufacturer.code),
            qualityName: quality.label.trim() || undefined,
            qualityCode: codeLabel(quality.code)
          });
        });
      });
    });
    return outputs;
  };

  const validateBulkSetup = () => {
    if (!bulkCategoryName.trim() || !codeLabel(bulkCategoryCode)) return 'Chọn nhóm hàng đã được thiết lập trước khi kiểm tra.';
    if (!dictionaryForScope('CATEGORY').some(entry => codeLabel(entry.code) === codeLabel(bulkCategoryCode))) {
      return 'Mã nhóm phải lấy từ danh sách đã thiết lập, không dùng giá trị tự gõ.';
    }
    if (!selectedModels.length) return 'Chọn ít nhất một Model.';
    if (!bulkUnit?.label) return 'Chọn đơn vị tính đã được thiết lập.';
    const missingModelCode = selectedModels.find(model => !codeLabel(model.modelCode));
    if (missingModelCode) return `Model “${missingModelCode.modelName}” chưa có mã. Hãy hoàn tất thông tin Model.`;
    const broken = [...bulkManufacturerValues, ...bulkQualityValues, ...bulkStorageValues, ...bulkColorValues]
      .find(row => (row.label.trim() && !codeLabel(row.code)) || (!row.label.trim() && row.code.trim()));
    if (broken) return 'Mỗi biến thể phải có đủ tên hiển thị và mã từ điển.';
    const hasStorageOrColor = bulkStorageValues.some(row => row.label.trim() && codeLabel(row.code)) || bulkColorValues.some(row => row.label.trim() && codeLabel(row.code));
    const hasManufacturerOrQuality = bulkManufacturerValues.some(row => row.label.trim() && codeLabel(row.code)) || bulkQualityValues.some(row => row.label.trim() && codeLabel(row.code));
    if (bulkKind === 'DEVICE' && !hasStorageOrColor) return 'SKU máy cần ít nhất một thuộc tính cấu hình hoặc màu đã có mã.';
    if (bulkKind !== 'DEVICE' && !hasManufacturerOrQuality) return 'SKU linh kiện/phụ kiện cần ít nhất một hãng hoặc cấp chất lượng đã có mã.';
    return null;
  };

  const handleBulkPreview = async () => {
    const validation = validateBulkSetup();
    if (validation) {
      showNotice(validation);
      return;
    }
    const candidates = buildBulkCandidates();
    if (!candidates.length) {
      showNotice('Chưa có tổ hợp biến thể để kiểm tra.');
      return;
    }
    setPreviewLoading(true);
    setApiError(null);
    try {
      const result = await catalogApi.previewBulk(candidates);
      setPreview(result);
      setBulkPreviewCandidates(candidates);
      setBulkSelected(result.items.filter(item => item.status === 'NEW').map(item => item.clientKey));
    } catch (error: any) {
      setApiError(error?.message || 'Không thể kiểm tra SKU trên máy chủ.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleBulkCreate = async () => {
    if (!preview) {
      showNotice('Hãy kiểm tra SKU trước khi tạo.');
      return;
    }
    const candidates = bulkPreviewCandidates.filter(candidate => bulkSelected.includes(candidate.clientKey));
    if (!preview.summary.createable || !candidates.length) {
      showNotice('Không có SKU mới hợp lệ để tạo.');
      return;
    }
    setCreateLoading(true);
    setApiError(null);
    try {
      // The server repeats preview and performs the final uniqueness check.
      // Do not trust browser client keys to decide which records are writable.
      const result = await catalogApi.createBulk(candidates);
      showNotice(`Đã tạo ${result.created?.length || 0} mã hàng. Các SKU trùng được bỏ qua an toàn.`);
      if (result.operationKey) setLastOperation({ operationKey: result.operationKey, createdCount: result.created?.length || 0, label: 'ma trận SKU' });
      setPreview(null);
      setBulkPreviewCandidates([]);
      setBulkSelected([]);
      await loadBootstrap();
      await loadCatalogPage();
    } catch (error: any) {
      setApiError(error?.message || 'Không thể tạo mã hàng.');
    } finally {
      setCreateLoading(false);
    }
  };

  const resetModelForm = () => {
    setEditingModelId(null);
    setModelDraft({ brandName: '', brandCode: '', seriesName: '', modelName: '', modelCode: '', releaseYear: '', aliases: '' });
    setIsModelFormOpen(false);
  };

  const openModelEditor = (model?: CatalogModelRecord) => {
    if (!model) {
      setEditingModelId(null);
      setModelDraft({ brandName: '', brandCode: '', seriesName: '', modelName: '', modelCode: '', releaseYear: '', aliases: '' });
    } else {
      setEditingModelId(model.id);
      setModelDraft({
        brandName: model.brandName,
        brandCode: model.brandCode,
        seriesName: model.seriesName || '',
        modelName: model.modelName,
        modelCode: model.modelCode,
        releaseYear: model.releaseYear ? String(model.releaseYear) : '',
        aliases: (model.aliases || []).filter(alias => alias !== model.modelName && alias !== model.brandName).join(', ')
      });
    }
    setIsModelFormOpen(true);
  };

  const handleCreateModel = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!modelDraft.brandName.trim() || !codeLabel(modelDraft.brandCode) || !modelDraft.modelName.trim() || !codeLabel(modelDraft.modelCode)) {
      showNotice('Chọn thương hiệu đã thiết lập, rồi nhập tên model và modelCode.');
      return;
    }
    if (!editingModelId && !dictionaryForScope('BRAND').some(entry => codeLabel(entry.code) === codeLabel(modelDraft.brandCode))) {
      showNotice('Tạo thương hiệu trước, sau đó mới tạo Model.');
      return;
    }
    setApiError(null);
    try {
      const payload = {
        brandName: modelDraft.brandName.trim(),
        brandCode: codeLabel(modelDraft.brandCode),
        seriesName: modelDraft.seriesName.trim() || undefined,
        modelName: modelDraft.modelName.trim(),
        modelCode: codeLabel(modelDraft.modelCode),
        releaseYear: modelDraft.releaseYear ? Number(modelDraft.releaseYear) : undefined,
        aliases: csv(modelDraft.aliases),
        status: 'ACTIVE' as const
      };
      const model = editingModelId
        ? await catalogApi.updateModel(editingModelId, {
          brandName: payload.brandName,
          seriesName: payload.seriesName,
          modelName: payload.modelName,
          releaseYear: payload.releaseYear,
          aliases: payload.aliases
        })
        : await catalogApi.createModel(payload);
      setBootstrap(current => current
        ? { ...current, models: editingModelId ? current.models.map(row => row.id === model.id ? model : row) : [model, ...current.models] }
        : { models: [model], dictionaries: [] });
      resetModelForm();
      showNotice(editingModelId ? `Đã cập nhật Model: ${model.modelName}` : `Đã tạo Model: ${model.modelName}`);
    } catch (error: any) {
      setApiError(error?.message || 'Không thể lưu Model.');
    }
  };

  const toggleModelActive = async (model: CatalogModelRecord) => {
    setApiError(null);
    try {
      const updated = await catalogApi.updateModel(model.id, { active: model.active === false });
      setBootstrap(current => current ? { ...current, models: current.models.map(row => row.id === updated.id ? updated : row) } : current);
      showNotice(updated.active === false ? `Đã ngừng dùng model ${updated.modelName}.` : `Đã mở lại model ${updated.modelName}.`);
    } catch (error: any) {
      setApiError(error?.message || 'Không thể đổi trạng thái model.');
    }
  };

  const deleteModel = async (model: CatalogModelRecord) => {
    const approved = window.confirm(
      `Xóa Model “${model.modelName}”?\n\nNếu Model đã được dùng để tạo mã hàng, hệ thống sẽ chỉ chuyển nó sang Ngừng dùng để giữ lịch sử.`
    );
    if (!approved) return;
    setApiError(null);
    try {
      const result = await catalogApi.deleteModel(model.id);
      setBootstrap(current => current ? {
        ...current,
        models: result.deleted
          ? current.models.filter(row => row.id !== model.id)
          : current.models.map(row => row.id === model.id ? { ...row, active: false } : row)
      } : current);
      showNotice(result.deleted ? `Đã xóa Model ${model.modelName}.` : `Model ${model.modelName} đang được dùng nên đã chuyển sang Ngừng dùng.`);
    } catch (error: any) {
      setApiError(error?.message || 'Không thể xóa Model.');
    }
  };

  const resetDictionaryForm = () => {
    setEditingDictionaryId(null);
    setDictionaryDraft({ scope: 'CATEGORY', group: '', label: '', code: '', aliases: '', parentId: '' });
    setIsDictionaryFormOpen(false);
  };

  const openDictionaryEditor = (entry?: CatalogDictionaryRecord) => {
    if (!entry) {
      setEditingDictionaryId(null);
      setDictionaryDraft({ scope: 'CATEGORY', group: '', label: '', code: '', aliases: '', parentId: '' });
    } else {
      setEditingDictionaryId(entry.id);
      setDictionaryDraft({
        scope: entry.scope,
        group: entry.group || '',
        label: entry.label,
        code: entry.code,
        aliases: (entry.aliases || []).filter(alias => alias !== entry.label && alias !== entry.code).join(', '),
        parentId: entry.parentId || ''
      });
    }
    setIsDictionaryFormOpen(true);
  };

  const handleCreateDictionary = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dictionaryDraft.label.trim() || !codeLabel(dictionaryDraft.code)) {
      showNotice('Tên hiển thị và mã chuẩn là bắt buộc.');
      return;
    }
    setApiError(null);
    try {
      const payload = {
        scope: dictionaryDraft.scope,
        group: dictionaryDraft.group.trim() || undefined,
        label: dictionaryDraft.label.trim(),
        code: codeLabel(dictionaryDraft.code),
        aliases: csv(dictionaryDraft.aliases),
        parentId: dictionaryDraft.parentId.trim() || undefined,
        status: 'ACTIVE' as const
      };
      const entry = editingDictionaryId
        ? await catalogApi.updateDictionary(editingDictionaryId, {
          label: payload.label,
          aliases: payload.aliases,
          parentId: payload.parentId,
          active: true
        })
        : await catalogApi.createDictionary(payload);
      setBootstrap(current => current
        ? { ...current, dictionaries: editingDictionaryId ? current.dictionaries.map(row => row.id === entry.id ? entry : row) : [entry, ...current.dictionaries] }
        : { models: [], dictionaries: [entry] });
      resetDictionaryForm();
      showNotice(editingDictionaryId ? `Đã cập nhật ${dictionaryScopeLabel(entry.scope).toLowerCase()}: ${entry.label}` : `Đã thêm ${dictionaryScopeLabel(entry.scope).toLowerCase()}: ${entry.label}`);
    } catch (error: any) {
      setApiError(error?.message || 'Không thể lưu danh mục.');
    }
  };

  const toggleDictionaryActive = async (entry: CatalogDictionaryRecord) => {
    setApiError(null);
    try {
      const updated = await catalogApi.updateDictionary(entry.id, { active: entry.active === false });
      setBootstrap(current => current ? { ...current, dictionaries: current.dictionaries.map(row => row.id === updated.id ? updated : row) } : current);
      showNotice(updated.active === false ? `Đã ngừng dùng ${updated.label}.` : `Đã mở lại ${updated.label}.`);
    } catch (error: any) {
      setApiError(error?.message || 'Không thể đổi trạng thái danh mục.');
    }
  };

  const deleteDictionary = async (entry: CatalogDictionaryRecord) => {
    const approved = window.confirm(
      `Xóa “${entry.label}”?\n\nNếu lựa chọn này đang được dùng, hệ thống sẽ chỉ chuyển sang Ngừng dùng để không làm sai dữ liệu cũ.`
    );
    if (!approved) return;
    setApiError(null);
    try {
      const result = await catalogApi.deleteDictionary(entry.id);
      setBootstrap(current => current ? {
        ...current,
        dictionaries: result.deleted
          ? current.dictionaries.filter(row => row.id !== entry.id)
          : current.dictionaries.map(row => row.id === entry.id ? { ...row, active: false } : row)
      } : current);
      showNotice(result.deleted ? `Đã xóa ${entry.label}.` : `${entry.label} đang được dùng nên đã chuyển sang Ngừng dùng.`);
    } catch (error: any) {
      setApiError(error?.message || 'Không thể xóa lựa chọn này.');
    }
  };

  const handleIphoneSeedPreview = async () => {
    setIphoneSeedLoading(true);
    setApiError(null);
    try {
      setIphoneSeedPreview(await catalogApi.previewIphoneSeed());
    } catch (error: any) {
      setApiError(error?.message || 'Không thể xem trước danh mục iPhone chuẩn.');
    } finally {
      setIphoneSeedLoading(false);
    }
  };

  const handleIphoneSeedConfirm = async () => {
    if (!iphoneSeedPreview || iphoneSeedCreating) return;
    const modelCount = compactSeedCount(iphoneSeedPreview, 'models');
    const confirmed = window.confirm(
      `Khởi tạo danh mục iPhone chuẩn?\n\nHệ thống sẽ chỉ bổ sung dữ liệu còn thiếu, không tạo tồn kho, IMEI, giá vốn hoặc SKU bán hàng. Dự kiến có ${modelCount || 'các'} model iPhone.`
    );
    if (!confirmed) return;
    setIphoneSeedCreating(true);
    setApiError(null);
    try {
      const operationKey = iphoneSeedPreview.operationKey || `IPHONE-SEED-${Date.now()}`;
      const result = await catalogApi.confirmIphoneSeed(operationKey);
      const created = Number(result.totalCreated || result.summary?.create || Object.values(result.created || {}).reduce<number>((sum, value) => {
        const count = typeof value === 'object' ? value?.total ?? value?.create ?? 0 : value;
        return sum + Number(count || 0);
      }, 0));
      showNotice(result.alreadySeeded ? 'Danh mục iPhone chuẩn đã có sẵn. Hệ thống đã kiểm tra và giữ nguyên dữ liệu.' : `Đã khởi tạo ${created || 'các'} dữ liệu iPhone chuẩn.`);
      setIphoneSeedPreview(null);
      await loadBootstrap();
      await loadCatalogPage();
    } catch (error: any) {
      setApiError(error?.message || 'Không thể khởi tạo danh mục iPhone chuẩn.');
    } finally {
      setIphoneSeedCreating(false);
    }
  };

  const handleCatalogItemSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!catalogItemEdit || catalogItemEditLoading) return;
    setCatalogItemEditLoading(true);
    setApiError(null);
    try {
      const updated = await catalogApi.updateItem(catalogItemEdit.id, {
        name: catalogItemEdit.name,
        posShortName: catalogItemEdit.posShortName,
        aliases: catalogItemEdit.aliases,
        unit: catalogItemEdit.unit,
        defaultImportPrice: Number(catalogItemEdit.defaultImportPrice || 0),
        defaultRetailPrice: Number(catalogItemEdit.defaultRetailPrice || 0),
        notes: catalogItemEdit.notes,
        status: catalogItemEdit.status || 'active'
      });
      setCatalogPage(current => current ? { ...current, items: current.items.map(item => item.id === updated.id ? { ...item, ...updated } : item) } : current);
      setCatalogItemEdit(null);
      showNotice(`Đã cập nhật ${updated.name}.`);
    } catch (error: any) {
      setApiError(error?.message || 'Không thể cập nhật hàng trong danh mục.');
    } finally {
      setCatalogItemEditLoading(false);
    }
  };

  const handleArchiveCatalogItem = async (item: MasterCatalogItem) => {
    const confirmed = window.confirm(`Ngừng dùng “${item.name}”?\n\nMã hàng sẽ không còn dùng để tạo mới. Dữ liệu kho và chứng từ cũ không bị thay đổi.`);
    if (!confirmed) return;
    setApiError(null);
    try {
      await catalogApi.archiveItem(item.id, 'Người dùng ngừng dùng từ trang Danh mục hàng hóa');
      setCatalogPage(current => current ? { ...current, items: current.items.filter(row => row.id !== item.id) } : current);
      showNotice(`Đã ngừng dùng ${item.name}.`);
      await loadCatalogPage();
    } catch (error: any) {
      setApiError(error?.message || 'Không thể ngừng dùng mã hàng này.');
    }
  };

  const handleClonePreview = async () => {
    if (!cloneSourceId || !cloneTargetId || cloneSourceId === cloneTargetId) {
      showNotice('Chọn hai Model khác nhau để nhân bản.');
      return;
    }
    setCloneLoading(true);
    setApiError(null);
    try {
      const result = await catalogApi.previewClone(cloneSourceId, cloneTargetId);
      setClonePreview(result);
      setCloneSelected(result.items.filter(item => item.status === 'NEW').map(item => item.clientKey));
    } catch (error: any) {
      setApiError(error?.message || 'Không thể lập preview nhân bản model.');
    } finally {
      setCloneLoading(false);
    }
  };

  const handleCloneCreate = async () => {
    if (!clonePreview || !cloneSelected.length) {
      showNotice('Chọn ít nhất một SKU mới trong preview.');
      return;
    }
    setCloneCreateLoading(true);
    setApiError(null);
    try {
      const selectedSkus = clonePreview.items.filter(item => cloneSelected.includes(item.clientKey)).map(item => item.sku).filter(Boolean);
      const result = await catalogApi.createClone(cloneSourceId, cloneTargetId, cloneSelected, selectedSkus);
      showNotice(`Đã nhân bản ${result.created?.length || 0} mã hàng sang Model mới.`);
      if (result.operationKey) setLastOperation({ operationKey: result.operationKey, createdCount: result.created?.length || 0, label: 'nhân bản model' });
      setClonePreview(null);
      setCloneSelected([]);
      await loadBootstrap();
      await loadCatalogPage();
    } catch (error: any) {
      setApiError(error?.message || 'Không thể tạo các SKU đã chọn.');
    } finally {
      setCloneCreateLoading(false);
    }
  };

  const parsedPasteRows = useMemo(() => {
    const lines = pasteText.replace(/\r/g, '').split('\n').filter(line => line.trim());
    return lines.map(line => line.includes('\t') ? line.split('\t') : line.split(';')).map(row => row.map(cell => cell.trim()));
  }, [pasteText]);

  const pasteHeaderError = useMemo(() => {
    if (!parsedPasteRows.length) return null;
    const normalized = parsedPasteRows[0].map(cell => cell.toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''));
    const has = (...keys: string[]) => keys.some(key => normalized.includes(key));
    if (!has('category', 'kind', 'nhom')) return 'Thiếu cột category / kind / nhóm.';
    if (!has('categorycode', 'manhom', 'madanhmuc')) return 'Thiếu cột categoryCode / mã nhóm.';
    if (!has('modelid') && !(has('modelcode') && has('modelname'))) return 'Cần modelId hoặc đồng thời modelCode và modelName.';
    if (!has('unitcode', 'madonvitinh')) return 'Thiếu cột unitCode / mã đơn vị tính.';
    return null;
  }, [parsedPasteRows]);

  const handlePastePreview = async () => {
    if (parsedPasteRows.length < 2) {
      showNotice('Dán dòng tiêu đề và ít nhất một dòng dữ liệu Excel trước khi kiểm tra.');
      return;
    }
    if (pasteHeaderError) {
      showNotice(`Bảng chưa đúng cấu trúc: ${pasteHeaderError}`);
      return;
    }
    setPastePreviewLoading(true);
    setApiError(null);
    try {
      const result = await catalogApi.previewImport(parsedPasteRows);
      setPastePreview(result);
    } catch (error: any) {
      setApiError(error?.message || 'Không thể phân tích bảng đã dán.');
    } finally {
      setPastePreviewLoading(false);
    }
  };

  const handlePasteCreate = async () => {
    if (!pastePreview || !pastePreview.summary.createable) {
      showNotice('Không có dòng mới hợp lệ để nhập.');
      return;
    }
    setPasteCreateLoading(true);
    setApiError(null);
    try {
      const result = await catalogApi.createImport(parsedPasteRows);
      showNotice(`Đã nhập ${result.created?.length || 0} mã hàng từ bảng.`);
      if (result.operationKey) setLastOperation({ operationKey: result.operationKey, createdCount: result.created?.length || 0, label: 'nhập Excel' });
      setPastePreview(null);
      setPasteText('');
      await loadBootstrap();
      await loadCatalogPage();
    } catch (error: any) {
      setApiError(error?.message || 'Không thể nhập danh mục từ bảng.');
    } finally {
      setPasteCreateLoading(false);
    }
  };

  const handleRollbackLastOperation = async () => {
    if (!lastOperation || rollbackLoading) return;
    const approved = window.confirm(
      `Hoàn tác lần ${lastOperation.label} này?\n\nHệ thống chỉ ngừng dùng các mã hàng tạo trong lần này. Không thay đổi tồn kho, lô hàng, IMEI hay chứng từ. Những mã đã được liên kết tồn kho sẽ được giữ lại.`
    );
    if (!approved) return;
    setRollbackLoading(true);
    setApiError(null);
    try {
      const result = await catalogApi.rollbackOperation(lastOperation.operationKey);
      const blockedHint = result.summary.blocked ? `; ${result.summary.blocked} mã đã liên kết tồn kho nên được giữ lại` : '';
      showNotice(`Đã hoàn tác ${result.summary.archived} mã hàng${blockedHint}.`);
      setLastOperation(null);
      await loadBootstrap();
      await loadCatalogPage();
    } catch (error: any) {
      setApiError(error?.message || 'Không thể hoàn tác lần tạo mã hàng này.');
    } finally {
      setRollbackLoading(false);
    }
  };

  const TabButton = ({ tab, icon: Icon, children }: { tab: CenterTab; icon: typeof Database; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => setActiveTab(tab)}
      className={`flex min-w-max items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
        activeTab === tab ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-100'
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${activeTab === tab ? 'text-orange-400' : 'text-zinc-400'}`} />
      {children}
    </button>
  );

  return (
    <div className="space-y-3 pb-24 text-zinc-900 animate-fadeIn">
      {notice && (
        <div className="fixed right-4 top-4 z-[80] flex max-w-sm items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-3 text-xs font-bold text-white shadow-2xl">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{notice}</span>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-orange-200 bg-gradient-to-br from-zinc-950 via-zinc-900 to-orange-950 text-white shadow-lg">
        <div className="relative p-3.5 sm:p-5">
          <div className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-36 w-36 rounded-full bg-amber-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-300/30 bg-orange-400/10 px-3 py-1 text-[10px] font-black tracking-[0.16em] text-orange-200">
                <Database className="h-3.5 w-3.5" /> DANH MỤC HÀNG HÓA · KHÔNG PHẢI TỒN KHO
              </div>
              <h1 className="text-lg font-black tracking-tight sm:text-2xl">Danh mục hàng hóa</h1>
              <p className="mt-0.5 max-w-2xl text-[11px] leading-4 text-zinc-300 sm:text-sm sm:leading-5">
                Chọn nhóm hàng, thương hiệu, model và thuộc tính. Hệ thống tự sinh mã hàng, còn tồn kho và IMEI được quản lý riêng.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:flex sm:gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-center">
                <div className="text-base font-black text-white">{itemStats.DEVICE}</div>
                <div className="text-[10px] font-bold text-zinc-400">SKU máy</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-center">
                <div className="text-base font-black text-white">{itemStats.PART}</div>
                <div className="text-[10px] font-bold text-zinc-400">SKU linh kiện</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-center">
                <div className="text-base font-black text-white">{itemStats.ACCESSORY}</div>
                <div className="text-[10px] font-bold text-zinc-400">SKU phụ kiện</div>
              </div>
            </div>
          </div>
        </div>
        <div className="relative flex gap-1 overflow-x-auto border-t border-white/10 bg-black/10 px-2 py-1.5 sm:px-4 sm:py-2">
          <TabButton tab="CATALOG" icon={Package}>Hàng đã tạo</TabButton>
          <TabButton tab="MODELS" icon={Layers}>Nhóm hàng &amp; Model</TabButton>
          <TabButton tab="BULK" icon={Sparkles}>Tạo hàng loạt</TabButton>
          <TabButton tab="TOOLS" icon={ClipboardPaste}>Nhân bản &amp; Excel</TabButton>
        </div>
      </section>

      {onAddPurchaseOrder && (
        <section className="flex flex-col gap-2 rounded-2xl border border-orange-200 bg-orange-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="text-xs font-black text-orange-950">Đã có mã hàng? Nhập kho ngay</p><p className="mt-0.5 text-[11px] text-orange-800/80">Linh kiện, phụ kiện, nhà cung cấp, quỹ và công nợ sẽ cùng nằm trong Phiếu nhập hàng.</p></div>
          <button type="button" onClick={() => setStockReceiptOpen(true)} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-2.5 text-xs font-black text-white shadow-sm hover:bg-orange-700"><PackagePlus className="h-4 w-4" /> Nhập linh kiện / phụ kiện</button>
        </section>
      )}

      <section className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-indigo-50 p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-sky-700 shadow-sm"><Smartphone className="h-5 w-5" /></div>
            <div>
              <h2 className="text-sm font-black text-sky-950">Danh mục iPhone chuẩn</h2>
              <p className="mt-0.5 max-w-3xl text-[11px] leading-5 text-sky-900/75">Khởi tạo Apple, iPhone, model từ iPhone 8 Plus đến iPhone 17 Pro Max, nhóm hàng, thuộc tính và mẫu tạo hàng. Dữ liệu tạo ra vẫn có thể sửa hoặc ngừng dùng sau này.</p>
            </div>
          </div>
          {!iphoneSeedPreview ? (
            <button type="button" disabled={iphoneSeedLoading || Boolean(apiError)} onClick={() => void handleIphoneSeedPreview()} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-sky-700 px-3.5 py-2.5 text-xs font-black text-white hover:bg-sky-800 disabled:opacity-50">
              {iphoneSeedLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Xem dữ liệu sẽ tạo
            </button>
          ) : (
            <div className="flex shrink-0 flex-wrap gap-2">
              <button type="button" onClick={() => setIphoneSeedPreview(null)} className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100">Đóng</button>
              <button type="button" disabled={iphoneSeedCreating || iphoneSeedPreview.ready === false} onClick={() => void handleIphoneSeedConfirm()} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-700 px-3.5 py-2 text-xs font-black text-white hover:bg-sky-800 disabled:opacity-50">
                {iphoneSeedCreating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {iphoneSeedPreview.alreadySeeded ? 'Kiểm tra và bổ sung phần thiếu' : 'Khởi tạo danh mục iPhone'}
              </button>
            </div>
          )}
        </div>
        {iphoneSeedPreview && (
          <div className="mt-3 border-t border-sky-200/80 pt-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SeedCount label="Model iPhone" count={compactSeedCount(iphoneSeedPreview, 'models')} />
              <SeedCount label="Nhóm hàng" count={compactSeedCount(iphoneSeedPreview, 'groups', 'categories')} />
              <SeedCount label="Thuộc tính" count={compactSeedCount(iphoneSeedPreview, 'attributes')} />
              <SeedCount label="Mẫu tạo hàng" count={compactSeedCount(iphoneSeedPreview, 'templates')} />
            </div>
            <p className="mt-2 text-[10px] leading-4 text-sky-900/75">Không tạo tồn kho, IMEI, giá vốn hoặc mã hàng bán. Hệ thống chỉ bổ sung bản ghi thiếu và không ghi đè nội dung anh đã chỉnh sửa.</p>
            {iphoneSeedPreview.warnings?.length ? <div className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-[10px] text-sky-900">{iphoneSeedPreview.warnings.join(' · ')}</div> : null}
          </div>
        )}
      </section>

      {apiError && (
        <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-xs text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span><b>Không thể dùng thao tác tạo/sửa danh mục:</b> {apiError}</span>
          </div>
          <button type="button" onClick={() => void loadBootstrap()} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100">
            <RefreshCw className="h-3.5 w-3.5" /> Tải lại cấu hình
          </button>
        </div>
      )}

      {lastOperation && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-xs font-black text-amber-950">Lần tạo gần nhất: {lastOperation.createdCount} mã hàng từ {lastOperation.label}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-amber-800">Có thể hoàn tác an toàn. Chỉ ngừng dùng mã hàng chưa liên kết; không tác động tồn kho, IMEI, lô hoặc chứng từ.</p>
            </div>
          </div>
          <button type="button" disabled={rollbackLoading} onClick={() => void handleRollbackLastOperation()} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-900 hover:bg-amber-100 disabled:opacity-50">
            {rollbackLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5 -scale-x-100" />}
            Hoàn tác lần tạo này
          </button>
        </div>
      )}

      {catalogItemEdit && (
        <div className="fixed inset-0 z-[90] flex items-end bg-zinc-950/45 p-0 sm:items-center sm:justify-center sm:p-4">
          <form onSubmit={handleCatalogItemSave} className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:max-w-xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-black text-zinc-900">Sửa hàng trong danh mục</p><p className="mt-0.5 text-[11px] text-zinc-500">SKU và Model không đổi để giữ đúng lịch sử. Chỉ sửa tên, tìm kiếm và giá gợi ý.</p></div>
              <button type="button" onClick={() => setCatalogItemEdit(null)} className="rounded-xl p-2 text-zinc-500 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><FieldLabel required>Tên hiển thị</FieldLabel><Input value={catalogItemEdit.name} onChange={event => setCatalogItemEdit(current => current ? { ...current, name: event.target.value } : current)} /></div>
              <div><FieldLabel>SKU</FieldLabel><Input readOnly value={catalogItemEdit.sku} className="bg-zinc-50 font-mono text-zinc-500" /></div>
              <div><FieldLabel>Model</FieldLabel><Input readOnly value={catalogItemEdit.model || catalogItemEdit.compatibleModels?.join(', ') || '—'} className="bg-zinc-50 text-zinc-500" /></div>
              <div><FieldLabel>Tên ngắn khi bán</FieldLabel><Input value={catalogItemEdit.posShortName || ''} onChange={event => setCatalogItemEdit(current => current ? { ...current, posShortName: event.target.value } : current)} placeholder="Không bắt buộc" /></div>
              <div><FieldLabel>Đơn vị tính</FieldLabel><Input value={catalogItemEdit.unit || ''} onChange={event => setCatalogItemEdit(current => current ? { ...current, unit: event.target.value } : current)} placeholder="Ví dụ: Cái, Bộ" /></div>
              <div><FieldLabel>Giá nhập gợi ý</FieldLabel><Input inputMode="numeric" value={String(catalogItemEdit.defaultImportPrice || '')} onChange={event => setCatalogItemEdit(current => current ? { ...current, defaultImportPrice: Number(event.target.value.replace(/[^0-9]/g, '') || 0) } : current)} /></div>
              <div><FieldLabel>Giá bán lẻ gợi ý</FieldLabel><Input inputMode="numeric" value={String(catalogItemEdit.defaultRetailPrice || '')} onChange={event => setCatalogItemEdit(current => current ? { ...current, defaultRetailPrice: Number(event.target.value.replace(/[^0-9]/g, '') || 0) } : current)} /></div>
              <div className="sm:col-span-2"><FieldLabel>Alias tìm kiếm</FieldLabel><Input value={(catalogItemEdit.aliases || []).join(', ')} onChange={event => setCatalogItemEdit(current => current ? { ...current, aliases: csv(event.target.value) } : current)} placeholder="Ví dụ: màn 15pm gx, 15 prm gx" /></div>
              <div className="sm:col-span-2"><FieldLabel>Ghi chú</FieldLabel><Input value={catalogItemEdit.notes || ''} onChange={event => setCatalogItemEdit(current => current ? { ...current, notes: event.target.value } : current)} placeholder="Không bắt buộc" /></div>
            </div>
            <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setCatalogItemEdit(null)} className="rounded-xl px-3 py-2 text-xs font-bold text-zinc-600">Hủy</button><button type="submit" disabled={catalogItemEditLoading || !catalogItemEdit.name.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3 py-2 text-xs font-black text-white hover:bg-orange-700 disabled:opacity-50">{catalogItemEditLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Lưu thay đổi</button></div>
          </form>
        </div>
      )}

      {activeTab === 'CATALOG' && (
        <section className="space-y-3">
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
            <form
              className="flex flex-1 gap-2"
              onSubmit={event => {
                event.preventDefault();
                const nextSearch = catalogSearchInput.trim();
                if (nextSearch === catalogSearch) void loadCatalogPage();
                else setCatalogSearch(nextSearch);
              }}
            >
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input value={catalogSearchInput} onChange={event => setCatalogSearchInput(event.target.value)} placeholder="Tìm SKU / tên / model / alias đã khai báo..." className="pl-9" />
              </div>
              <button type="submit" disabled={catalogLoading} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
                {catalogLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5 text-orange-500" />} Tìm
              </button>
            </form>
            <div className="flex gap-1 overflow-x-auto rounded-xl bg-zinc-100 p-1">
              {(['ALL', 'DEVICE', 'PART', 'ACCESSORY'] as const).map(kind => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setCatalogKind(kind)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${catalogKind === kind ? 'bg-white text-orange-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
                >
                  {kind === 'ALL' ? `Tất cả (${itemStats.total})` : `${CATEGORY_META[kind].label} (${itemStats[kind]})`}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setActiveTab('BULK')} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-orange-700">
              <Sparkles className="h-3.5 w-3.5" /> Tạo SKU có kiểm soát
            </button>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-black text-zinc-800">Danh sách mã hàng</h2>
                <p className="text-[11px] text-zinc-500">
                  {catalogLoading ? 'Đang tải dữ liệu theo trang từ máy chủ…' : `Đang hiển thị ${catalogItems.length}${itemStats.matching > catalogItems.length ? ` / ${itemStats.matching}` : ''} bản ghi khớp bộ lọc.`}
                  {' '}Tìm theo SKU, tên, model hoặc alias đã khai báo; giá/tồn thực tế không được chỉnh sửa tại đây.
                </p>
              </div>
              <span className="hidden rounded-lg bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-500 sm:inline-flex">Dữ liệu được kiểm tra an toàn</span>
            </div>
            {catalogLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-12 text-xs font-bold text-zinc-500"><RefreshCw className="h-4 w-4 animate-spin text-orange-500" /> Đang tải danh mục…</div>
            ) : catalogItems.length === 0 ? (
              <EmptyState icon={Package} title="Chưa có mã hàng phù hợp" description="Thiết lập nhóm hàng, thương hiệu, Model và thuộc tính; sau đó tạo hàng loạt để sinh SKU không trùng." action={<button type="button" onClick={() => setActiveTab('MODELS')} className="rounded-xl bg-zinc-950 px-3 py-2 text-xs font-bold text-white">Thiết lập danh mục</button>} />
            ) : (
              <>
                <div className="divide-y divide-zinc-100 md:hidden">
                  {catalogItems.map(item => {
                    const category = CATEGORY_META[item.category];
                    const Icon = category.icon;
                    return (
                      <article key={item.id} className="p-3">
                        <div className="flex items-start gap-2.5">
                          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${category.tone}`}><Icon className="h-4 w-4" /></span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-black text-zinc-800">{item.name}</p><p className="mt-0.5 truncate text-[10px] text-zinc-500">{item.brand || 'Chưa gán thương hiệu'}{item.model ? ` · ${item.model}` : ''}</p></div><span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${category.tone}`}>{category.label}</span></div>
                            <div className="mt-2 flex items-center justify-between gap-2"><button type="button" onClick={() => void navigator.clipboard?.writeText(item.sku)} className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[10px] font-black text-zinc-700 active:bg-orange-50">{item.sku}</button><div className="flex shrink-0 gap-1"><IconButton label={`Sửa ${item.name}`} onClick={() => setCatalogItemEdit({ ...item, aliases: item.aliases || [] })} className="h-8 w-8 rounded-lg border border-zinc-200 text-zinc-500"><Edit3 className="h-3.5 w-3.5" /></IconButton><IconButton label={`Ngừng dùng ${item.name}`} onClick={() => void handleArchiveCatalogItem(item)} className="h-8 w-8 rounded-lg border border-zinc-200 text-rose-500"><Trash2 className="h-3.5 w-3.5" /></IconButton></div></div>
                            {(item.aliases?.length || item.subCategory) ? <p className="mt-1.5 truncate text-[10px] text-zinc-400">{item.subCategory || ''}{item.subCategory && item.aliases?.length ? ' · ' : ''}{(item.aliases || []).slice(0, 2).join(' · ')}</p> : null}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-[900px] w-full text-left">
                  <thead className="bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 font-black">SKU &amp; tên</th>
                      <th className="px-3 py-3 font-black">Nhóm</th>
                      <th className="px-3 py-3 font-black">Model / tương thích</th>
                      <th className="px-3 py-3 font-black">Alias tìm kiếm</th>
                      <th className="px-3 py-3 text-right font-black">Giá đề xuất</th>
                      <th className="px-3 py-3 text-right font-black">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {catalogItems.map(item => {
                      const category = CATEGORY_META[item.category];
                      const Icon = category.icon;
                      return (
                        <tr key={item.id} className="group hover:bg-orange-50/40">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <DeviceImageThumbnail model={item.model} color={item.color} fallbackName={item.name} />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <CodeBadge code={item.sku} />
                                  <IconButton label="Sao chép SKU" onClick={() => void navigator.clipboard?.writeText(item.sku)} className="h-6 w-6 text-zinc-400 hover:bg-white hover:text-orange-600"><Copy className="h-3.5 w-3.5" /></IconButton>
                                </div>
                                <p className="mt-1 max-w-[340px] truncate text-xs font-bold text-zinc-800">{item.name}</p>
                                <p className="mt-0.5 text-[10px] text-zinc-400">{item.brand || 'Chưa gán thương hiệu'}{item.barcode ? ` · ${item.barcode}` : ''}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3"><span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold ${category.tone}`}><Icon className="h-3 w-3" />{category.label}</span><p className="mt-1 max-w-36 truncate text-[10px] text-zinc-500">{item.subCategory || 'Chưa phân loại'}</p></td>
                          <td className="px-3 py-3"><p className="text-xs font-semibold text-zinc-700">{item.model || '—'}</p><p className="mt-0.5 max-w-52 truncate text-[10px] text-zinc-500">{item.compatibleModels?.length ? item.compatibleModels.join(' · ') : [item.storage, item.color].filter(Boolean).join(' · ') || '—'}</p></td>
                          <td className="px-3 py-3"><div className="flex max-w-48 flex-wrap gap-1">{(item.aliases?.length ? item.aliases : [item.sku.toLocaleLowerCase('vi-VN'), item.model || '']).filter(Boolean).slice(0, 3).map(alias => <span key={alias} className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">{alias}</span>)}</div></td>
                          <td className="px-3 py-3 text-right"><p className="text-xs font-black text-zinc-800">{money(item.defaultRetailPrice)} ₫</p><p className="mt-0.5 text-[10px] text-zinc-400">Vốn gợi ý: {money(item.defaultImportPrice)} ₫</p></td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <IconButton label={`Sửa ${item.name}`} onClick={() => setCatalogItemEdit({ ...item, aliases: item.aliases || [] })} className="h-8 w-8 border border-zinc-200 bg-white text-zinc-500 hover:border-orange-200 hover:text-orange-700"><Edit3 className="h-3.5 w-3.5" /></IconButton>
                              <IconButton label={`Ngừng dùng ${item.name}`} onClick={() => void handleArchiveCatalogItem(item)} className="h-8 w-8 border border-zinc-200 bg-white text-zinc-500 hover:border-rose-200 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /></IconButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  </table>
                </div>
                {catalogPage?.hasMore && catalogPage.nextCursor && (
                  <div className="border-t border-zinc-100 p-3 text-center">
                    <button type="button" disabled={catalogLoadingMore} onClick={() => void loadCatalogPage(catalogPage.nextCursor, true)} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
                      {catalogLoadingMore ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-orange-500" /> : <ArrowRight className="h-3.5 w-3.5 text-orange-500" />}
                      {catalogLoadingMore ? 'Đang tải thêm…' : 'Tải thêm 50 SKU'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {activeTab === 'MODELS' && (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-orange-500" /><h2 className="text-sm font-black">Model iPhone</h2></div>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Mỗi model chỉ khai báo một lần. Linh kiện, phụ kiện, giá bán và tìm kiếm sẽ dùng chung đúng model này.</p>
              </div>
              <button type="button" disabled={loadingBootstrap || Boolean(apiError)} onClick={() => openModelEditor()} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-zinc-950 px-3 py-2 text-xs font-bold text-white hover:bg-black"><Plus className="h-3.5 w-3.5 text-orange-400" /> Thêm Model</button>
            </div>
            {isModelFormOpen && (
              <form onSubmit={handleCreateModel} className="rounded-2xl border border-orange-200 bg-orange-50/50 p-3">
                <div className="mb-2 flex items-center justify-between"><p className="text-xs font-black text-orange-900">{editingModelId ? 'Sửa Model' : 'Khai báo Model mới'}</p><button type="button" onClick={resetModelForm} className="rounded-lg p-1 text-zinc-500 hover:bg-white"><X className="h-4 w-4" /></button></div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="sm:col-span-2"><FieldLabel required>Thương hiệu</FieldLabel><Select disabled={Boolean(editingModelId)} value={modelDraft.brandCode} onChange={event => { const selected = dictionaryForScope('BRAND').find(entry => codeLabel(entry.code) === event.target.value); setModelDraft(draft => ({ ...draft, brandCode: selected?.code || '', brandName: selected?.label || '' })); }}><option value="">Chọn thương hiệu</option>{dictionaryForScope('BRAND').map(entry => <option key={entry.id} value={codeLabel(entry.code)}>{entry.label} · {entry.code}</option>)}</Select><p className="mt-1 text-[10px] text-zinc-500">{editingModelId ? 'Thương hiệu và mã Model đã dùng sẽ không đổi.' : 'Chưa có thương hiệu? Tạo trong mục Nhóm hàng bên cạnh.'}</p></div>
                  <div><FieldLabel>Series</FieldLabel><Input value={modelDraft.seriesName} onChange={event => setModelDraft(draft => ({ ...draft, seriesName: event.target.value }))} placeholder="Có thể để trống" /></div>
                  <div><FieldLabel>Năm ra mắt</FieldLabel><Input type="number" value={modelDraft.releaseYear} onChange={event => setModelDraft(draft => ({ ...draft, releaseYear: event.target.value }))} placeholder="2026" /></div>
                  <div><FieldLabel required>Tên model</FieldLabel><Input value={modelDraft.modelName} onChange={event => setModelDraft(draft => ({ ...draft, modelName: event.target.value }))} placeholder="Tên hiển thị chính thức" /></div>
                  <div><FieldLabel required hint="Mã đã dùng sẽ không đổi">Mã Model</FieldLabel><Input readOnly={Boolean(editingModelId)} value={modelDraft.modelCode} onChange={event => setModelDraft(draft => ({ ...draft, modelCode: event.target.value }))} placeholder="Mã do admin tự đặt" className={editingModelId ? 'bg-zinc-50 text-zinc-500' : ''} /></div>
                  <div className="sm:col-span-2"><FieldLabel>Alias tìm kiếm</FieldLabel><Input value={modelDraft.aliases} onChange={event => setModelDraft(draft => ({ ...draft, aliases: event.target.value }))} placeholder="Ngăn cách bằng dấu phẩy; ví dụ: tên ngắn, cách gọi nội bộ" /></div>
                </div>
                <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={resetModelForm} className="rounded-xl px-3 py-2 text-xs font-bold text-zinc-600">Hủy</button><button type="submit" className="rounded-xl bg-orange-600 px-3 py-2 text-xs font-bold text-white">{editingModelId ? 'Lưu Model' : 'Lưu Model mới'}</button></div>
              </form>
            )}
            {loadingBootstrap ? <div className="py-10 text-center text-xs text-zinc-400">Đang tải Model…</div> : models.length === 0 ? <EmptyState icon={Layers} title="Chưa có Model" description="Có thể khởi tạo bộ iPhone chuẩn phía trên, hoặc thêm Model riêng của anh." /> : (
              <div className="max-h-[510px] overflow-y-auto rounded-xl border border-zinc-100">
                {models.map(model => (
                  <div key={model.id} className="flex items-center justify-between gap-3 border-b border-zinc-100 px-3 py-3 last:border-0">
                    <div className="min-w-0"><p className="truncate text-xs font-black text-zinc-800">{model.modelName}{model.active === false ? <span className="ml-1.5 rounded bg-zinc-200 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500">Ngừng dùng</span> : null}</p><p className="mt-0.5 text-[10px] text-zinc-500">{model.brandName}{model.seriesName ? ` · ${model.seriesName}` : ''}{model.releaseYear ? ` · ${model.releaseYear}` : ''}</p><div className="mt-1 flex flex-wrap gap-1">{(model.aliases || []).slice(0, 3).map(alias => <span key={alias} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">{alias}</span>)}</div></div>
                    <div className="flex shrink-0 items-center gap-1"><div className="text-right"><CodeBadge code={model.modelCode} /><div className="mt-1"><CodeBadge code={model.brandCode} muted={!model.brandCode} /></div></div><IconButton label={`Sửa ${model.modelName}`} onClick={() => openModelEditor(model)} className="h-8 w-8 border border-zinc-200 bg-white text-zinc-500 hover:border-orange-200 hover:text-orange-700"><Edit3 className="h-3.5 w-3.5" /></IconButton><IconButton label={model.active === false ? `Mở lại ${model.modelName}` : `Ngừng dùng ${model.modelName}`} onClick={() => void toggleModelActive(model)} className={`h-8 w-8 border bg-white ${model.active === false ? 'border-emerald-200 text-emerald-700' : 'border-zinc-200 text-zinc-500 hover:border-amber-200 hover:text-amber-700'}`}><Power className="h-3.5 w-3.5" /></IconButton><IconButton label={`Xóa ${model.modelName}`} onClick={() => void deleteModel(model)} className="h-8 w-8 border border-zinc-200 bg-white text-zinc-500 hover:border-rose-200 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /></IconButton></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><Tags className="h-4 w-4 text-orange-500" /><h2 className="text-sm font-black">Nhóm hàng, thương hiệu &amp; thuộc tính</h2></div>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">Đây là các lựa chọn dùng chung khi tạo hàng. Có thể sửa tên, từ khóa tìm kiếm hoặc ngừng dùng khi không cần nữa.</p>
              </div>
              <button type="button" disabled={loadingBootstrap || Boolean(apiError)} onClick={() => openDictionaryEditor()} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50"><Plus className="h-3.5 w-3.5 text-orange-500" /> Thêm lựa chọn</button>
            </div>
            {isDictionaryFormOpen && (
              <form onSubmit={handleCreateDictionary} className="rounded-2xl border border-orange-200 bg-orange-50/50 p-3">
                <div className="mb-2 flex items-center justify-between"><p className="text-xs font-black text-orange-900">{editingDictionaryId ? 'Sửa lựa chọn' : 'Thêm lựa chọn'}</p><button type="button" onClick={resetDictionaryForm} className="rounded-lg p-1 text-zinc-500 hover:bg-white"><X className="h-4 w-4" /></button></div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div><FieldLabel required>Loại thông tin</FieldLabel><Select disabled={Boolean(editingDictionaryId)} value={dictionaryDraft.scope} onChange={event => setDictionaryDraft(draft => ({ ...draft, scope: event.target.value as CatalogDictionaryScope }))}><option value="FAMILY">Dòng sản phẩm</option><option value="CATEGORY">Nhóm hàng</option><option value="BRAND">Thương hiệu</option><option value="ATTRIBUTE">Thuộc tính</option><option value="TEMPLATE">Mẫu tạo hàng</option></Select></div>
                  <div><FieldLabel hint="Chỉ dùng để gom các thuộc tính tương tự">Nhóm phụ</FieldLabel><Input value={dictionaryDraft.group} onChange={event => setDictionaryDraft(draft => ({ ...draft, group: event.target.value }))} placeholder={dictionaryDraft.scope === 'ATTRIBUTE' ? 'Ví dụ: COLOR, STORAGE...' : 'Không bắt buộc'} /></div>
                  <div><FieldLabel required>Tên hiển thị</FieldLabel><Input value={dictionaryDraft.label} onChange={event => setDictionaryDraft(draft => ({ ...draft, label: event.target.value }))} placeholder="Tên dùng trên UI" /></div>
                  <div><FieldLabel required>Mã</FieldLabel><Input readOnly={Boolean(editingDictionaryId)} value={dictionaryDraft.code} onChange={event => setDictionaryDraft(draft => ({ ...draft, code: event.target.value }))} placeholder="Mã do admin định nghĩa" className={editingDictionaryId ? 'bg-zinc-50 text-zinc-500' : ''} /></div>
                  <div className="sm:col-span-2"><FieldLabel>Alias</FieldLabel><Input value={dictionaryDraft.aliases} onChange={event => setDictionaryDraft(draft => ({ ...draft, aliases: event.target.value }))} placeholder="Từ khóa tìm kiếm, ngăn cách bằng dấu phẩy" /></div>
                </div>
                <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={resetDictionaryForm} className="rounded-xl px-3 py-2 text-xs font-bold text-zinc-600">Hủy</button><button type="submit" className="rounded-xl bg-orange-600 px-3 py-2 text-xs font-bold text-white">{editingDictionaryId ? 'Lưu thay đổi' : 'Lưu lựa chọn'}</button></div>
              </form>
            )}
            {loadingBootstrap ? <div className="py-10 text-center text-xs text-zinc-400">Đang tải nhóm hàng…</div> : dictionaryGroups.length === 0 ? <EmptyState icon={Tags} title="Chưa có nhóm hàng" description="Có thể khởi tạo danh mục iPhone chuẩn phía trên, hoặc thêm từng nhóm, thương hiệu và thuộc tính riêng." /> : (
              <div className="max-h-[510px] space-y-3 overflow-y-auto">
                {dictionaryGroups.map(([group, entries]) => <div key={group} className="rounded-xl border border-zinc-100"><div className="border-b border-zinc-100 bg-zinc-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-zinc-500">{group}</div>{entries.map(entry => <div key={entry.id} className={`flex items-center justify-between gap-3 px-3 py-2.5 ${entry.active === false ? 'bg-zinc-50 opacity-65' : ''}`}><div className="min-w-0"><p className="truncate text-xs font-bold text-zinc-700">{entry.label}{entry.active === false ? <span className="ml-1.5 rounded bg-zinc-200 px-1.5 py-0.5 text-[9px] text-zinc-500">Ngừng dùng</span> : null}</p>{entry.aliases?.length ? <p className="truncate text-[10px] text-zinc-400">{entry.aliases.join(' · ')}</p> : null}</div><div className="flex shrink-0 items-center gap-1"><CodeBadge code={entry.code} /><IconButton label={`Sửa ${entry.label}`} onClick={() => openDictionaryEditor(entry)} className="h-8 w-8 border border-zinc-200 bg-white text-zinc-500 hover:border-orange-200 hover:text-orange-700"><Edit3 className="h-3.5 w-3.5" /></IconButton><IconButton label={entry.active === false ? `Mở lại ${entry.label}` : `Ngừng dùng ${entry.label}`} onClick={() => void toggleDictionaryActive(entry)} className={`h-8 w-8 border bg-white ${entry.active === false ? 'border-emerald-200 text-emerald-700' : 'border-zinc-200 text-zinc-500 hover:border-amber-200 hover:text-amber-700'}`}><Power className="h-3.5 w-3.5" /></IconButton><IconButton label={`Xóa ${entry.label}`} onClick={() => void deleteDictionary(entry)} className="h-8 w-8 border border-zinc-200 bg-white text-zinc-500 hover:border-rose-200 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /></IconButton></div></div>)}</div>)}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'BULK' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 text-xs leading-5 text-orange-900">
            <div className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" /><div><b>Tạo nhiều hàng cùng lúc.</b> Chọn nhóm hàng, thuộc tính và Model; hệ thống kiểm tra trùng trước khi tạo mã. Thao tác này không tạo số lượng tồn, IMEI hay giá vốn.</div></div>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="space-y-4 xl:col-span-5">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2"><Filter className="h-4 w-4 text-orange-500" /><h2 className="text-sm font-black">1. Chọn cấu trúc SKU</h2></div>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(CATEGORY_META) as CatalogItemKind[]).map(kind => {
                    const meta = CATEGORY_META[kind];
                    const Icon = meta.icon;
                    return <button key={kind} type="button" onClick={() => { setBulkKind(kind); setBulkCategoryCode(''); setBulkCategoryName(''); setBulkCategorySearch(''); setPreview(null); }} className={`rounded-xl border p-2 text-left transition ${bulkKind === kind ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-100' : 'border-zinc-200 hover:bg-zinc-50'}`}><Icon className={`h-4 w-4 ${bulkKind === kind ? 'text-orange-600' : 'text-zinc-400'}`} /><p className="mt-1 text-xs font-black">{meta.label}</p><p className="mt-0.5 text-[9px] leading-3 text-zinc-500">{meta.description}</p></button>;
                  })}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div><FieldLabel required>Nhóm hàng</FieldLabel><Input value={bulkCategorySearch} onChange={event => setBulkCategorySearch(event.target.value)} placeholder="Tìm nhanh: màn, pin, ốp, sạc..." className="mb-1.5" /><Select value={bulkCategoryCode} onChange={event => { const selected = bulkCategoryOptions.find(entry => codeLabel(entry.code) === event.target.value); setBulkCategoryCode(selected?.code || ''); setBulkCategoryName(selected?.label || ''); setPreview(null); }}><option value="">{bulkCategoryOptions.length ? 'Chọn nhóm hàng' : 'Không tìm thấy nhóm phù hợp'}</option>{bulkCategoryOptions.map(entry => <option key={entry.id} value={codeLabel(entry.code)}>{entry.label} · {entry.code}</option>)}</Select><p className="mt-1 text-[10px] text-zinc-500">{bulkCategoryOptions.length} nhóm phù hợp với loại hàng đang chọn.</p></div>
                  <div><FieldLabel required hint="Mã được dùng để tạo SKU">Mã nhóm hàng</FieldLabel><Input readOnly value={bulkCategoryCode} placeholder="Chọn nhóm hàng bên trái" className="bg-zinc-50 font-mono text-zinc-600" /></div>
                </div>
                <div className="mt-2"><FieldLabel required>Đơn vị tính</FieldLabel><Select value={bulkUnit?.code || ''} onChange={event => { const option = dictionaryOptionsFor('ATTRIBUTE', 'UNIT', true).find(item => item.code === event.target.value); setBulkUnit(option || null); setPreview(null); }}><option value="">Chọn đơn vị từ Bộ từ điển</option>{dictionaryOptionsFor('ATTRIBUTE', 'UNIT', true).map(option => <option key={option.id} value={option.code}>{option.label} · {option.code}</option>)}</Select></div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div><FieldLabel>Giá nhập mặc định</FieldLabel><Input inputMode="numeric" value={bulkImportPrice} onChange={event => { setBulkImportPrice(event.target.value.replace(/[^0-9]/g, '')); setPreview(null); }} placeholder="Không bắt buộc" /></div>
                  <div><FieldLabel>Giá bán lẻ gợi ý</FieldLabel><Input inputMode="numeric" value={bulkRetailPrice} onChange={event => { setBulkRetailPrice(event.target.value.replace(/[^0-9]/g, '')); setPreview(null); }} placeholder="Không bắt buộc" /></div>
                </div>
                <div className="mt-2"><FieldLabel>Tình trạng / phiên bản</FieldLabel><Select value={bulkCondition?.code || ''} onChange={event => { const option = dictionaryOptionsFor('ATTRIBUTE', 'CONDITION', true).find(item => item.code === event.target.value); setBulkCondition(option || null); setPreview(null); }}><option value="">Không dùng tình trạng trong SKU</option>{dictionaryOptionsFor('ATTRIBUTE', 'CONDITION', true).map(option => <option key={option.id} value={option.code}>{option.label} · {option.code}</option>)}</Select></div>
                <div className="mt-2"><FieldLabel>Ghi chú chung</FieldLabel><Input value={bulkNotes} onChange={event => { setBulkNotes(event.target.value); setPreview(null); }} placeholder="Không bắt buộc" /></div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><Layers className="h-4 w-4 text-orange-500" /><h2 className="text-sm font-black">2. Chọn Model</h2></div><span className="rounded-lg bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-500">{bulkModelIds.length} đã chọn</span></div>
                {!activeModels.length ? <EmptyState icon={Layers} title="Cần Model trước" description="Không thể tạo SKU từ tên tự gõ. Vào Nhóm hàng & Model để thiết lập Model." action={<button type="button" onClick={() => setActiveTab('MODELS')} className="rounded-xl bg-zinc-950 px-3 py-2 text-xs font-bold text-white">Mở Model</button>} /> : <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-zinc-100 p-1.5">{activeModels.map(model => <button key={model.id} type="button" onClick={() => toggleBulkModel(model.id)} className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition ${bulkModelIds.includes(model.id) ? 'bg-orange-50 text-orange-900' : 'hover:bg-zinc-50'}`}><div className="min-w-0"><p className="truncate text-xs font-bold">{model.modelName}</p><p className="text-[10px] text-zinc-500">{model.brandName}{model.seriesName ? ` · ${model.seriesName}` : ''}</p></div><div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${bulkModelIds.includes(model.id) ? 'border-orange-500 bg-orange-600 text-white' : 'border-zinc-300 bg-white text-transparent'}`}><Check className="h-3.5 w-3.5" /></div></button>)}</div>}
              </div>
            </div>

            <div className="space-y-4 xl:col-span-7">
              {bulkKind === 'DEVICE' ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <VariantPicker title="3. Dung lượng / cấu hình" description="Tick các mã thuộc tính STORAGE đã được thiết lập." selectedCodes={bulkStorageValues.map(row => row.code)} options={dictionaryOptionsFor('ATTRIBUTE', 'STORAGE', true)} onToggle={option => toggleCodeValue(setBulkStorageValues, option)} />
                  <VariantPicker title="4. Màu sắc" description="Tick các mã thuộc tính COLOR đã được thiết lập." selectedCodes={bulkColorValues.map(row => row.code)} options={dictionaryOptionsFor('ATTRIBUTE', 'COLOR', true)} onToggle={option => toggleCodeValue(setBulkColorValues, option)} />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <VariantPicker title="3. Hãng / nhà sản xuất" description="Tick các thương hiệu/nhà sản xuất đã được thiết lập." selectedCodes={bulkManufacturerValues.map(row => row.code)} options={dictionaryOptionsFor('BRAND')} onToggle={option => toggleCodeValue(setBulkManufacturerValues, option)} />
                  <VariantPicker title="4. Công nghệ / cấp chất lượng" description="Tick các mã QUALITY đã được thiết lập." selectedCodes={bulkQualityValues.map(row => row.code)} options={dictionaryOptionsFor('ATTRIBUTE', 'QUALITY', true)} onToggle={option => toggleCodeValue(setBulkQualityValues, option)} />
                </div>
              )}
              <MatrixSummary kind={bulkKind} modelCount={selectedModels.length} firstCount={bulkKind === 'DEVICE' ? Math.max(bulkStorageValues.filter(row => row.label || row.code).length, 1) : Math.max(bulkManufacturerValues.filter(row => row.label || row.code).length, 1)} secondCount={bulkKind === 'DEVICE' ? Math.max(bulkColorValues.filter(row => row.label || row.code).length, 1) : Math.max(bulkQualityValues.filter(row => row.label || row.code).length, 1)} />
              <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-xs font-black text-zinc-800">Preview trước khi tạo</p><p className="text-[11px] text-zinc-500">Máy chủ là nguồn sự thật: kiểm tra SKU trùng, gần trùng và cấu hình thiếu.</p></div>
                <button type="button" disabled={previewLoading || Boolean(apiError)} onClick={() => void handleBulkPreview()} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-black text-white hover:bg-black disabled:opacity-50">{previewLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5 text-orange-400" />} Kiểm tra SKU</button>
              </div>
            </div>
          </div>
          {preview && <BulkMatrixSelectionPanel preview={preview} selected={bulkSelected} onToggle={key => setBulkSelected(current => current.includes(key) ? current.filter(value => value !== key) : [...current, key])} onSelectAll={() => setBulkSelected(preview.items.filter(item => item.status === 'NEW').map(item => item.clientKey))} onClear={() => setBulkSelected([])} createLoading={createLoading} onCreate={() => void handleBulkCreate()} />}
        </section>
      )}

      {activeTab === 'TOOLS' && (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2"><Copy className="h-4 w-4 text-orange-500" /><div><h2 className="text-sm font-black">Nhân bản hàng theo Model</h2><p className="mt-0.5 text-[11px] text-zinc-500">Chỉ nhân các mã hàng phù hợp; không nhân tồn kho, lô, giá vốn hay IMEI.</p></div></div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><div><FieldLabel required>Model nguồn</FieldLabel><Select value={cloneSourceId} onChange={event => { setCloneSourceId(event.target.value); setClonePreview(null); }}><option value="">Chọn Model nguồn</option>{activeModels.map(model => <option key={model.id} value={model.id}>{model.modelName} ({model.modelCode || 'chưa mã'})</option>)}</Select></div><div><FieldLabel required>Model đích</FieldLabel><Select value={cloneTargetId} onChange={event => { setCloneTargetId(event.target.value); setClonePreview(null); }}><option value="">Chọn Model đích</option>{activeModels.map(model => <option key={model.id} value={model.id}>{model.modelName} ({model.modelCode || 'chưa mã'})</option>)}</Select></div></div>
            <button type="button" disabled={cloneLoading || Boolean(apiError)} onClick={() => void handleClonePreview()} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-black text-white hover:bg-black disabled:opacity-50">{cloneLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5 text-orange-400" />} Lập preview nhân bản</button>
            {clonePreview && <ClonePreviewPanel preview={clonePreview} selected={cloneSelected} onToggle={key => setCloneSelected(current => current.includes(key) ? current.filter(value => value !== key) : [...current, key])} createLoading={cloneCreateLoading} onCreate={() => void handleCloneCreate()} />}
          </div>

          <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2"><ClipboardPaste className="h-4 w-4 text-orange-500" /><div><h2 className="text-sm font-black">Paste Excel có kiểm tra</h2><p className="mt-0.5 text-[11px] text-zinc-500">Dán bảng từ Excel. Hệ thống đối chiếu Model và nhóm hàng trước khi cho nhập.</p></div></div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] leading-4 text-sky-800"><b>Bắt buộc dòng đầu là tiêu đề:</b> category · categoryCode · unitCode · modelId <i>hoặc</i> modelCode + modelName. Cột gợi ý: categoryName, manufacturerCode/name, qualityCode/name, storageCode/name, colorCode/name, conditionCode/name, unit, defaultImportPrice, defaultRetailPrice, name, posShortName, barcode, notes.</div>
            <textarea value={pasteText} onChange={event => { setPasteText(event.target.value); setPastePreview(null); }} rows={9} placeholder={'Dán trực tiếp từ Excel (các cột cách nhau bằng TAB)\ncategory\tcategoryCode\tunitCode\tmodelCode\tmodelName\tmanufacturerCode\tmanufacturerName\tqualityCode\tqualityName'} className="w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-[11px] leading-5 text-zinc-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" />
            <div className="flex items-center justify-between gap-2"><span className={`text-[11px] ${pasteHeaderError ? 'font-bold text-rose-600' : 'text-zinc-500'}`}>{pasteHeaderError || `${Math.max(0, parsedPasteRows.length - 1)} dòng dữ liệu được nhận diện`}</span><button type="button" disabled={pastePreviewLoading || Boolean(apiError) || Boolean(pasteHeaderError)} onClick={() => void handlePastePreview()} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">{pastePreviewLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 text-orange-500" />} Phân tích bảng</button></div>
            {pastePreview && <PreviewPanel preview={pastePreview} createLoading={pasteCreateLoading} onCreate={() => void handlePasteCreate()} title="Kết quả nhập từ Excel" compact />}
          </div>
        </section>
      )}
      {onAddPurchaseOrder && (
        <StockItemPurchaseEntryForm
          isOpen={stockReceiptOpen}
          onClose={() => setStockReceiptOpen(false)}
          currentUser={currentUser}
          partners={partners}
          branches={branches}
          warehouses={warehouses}
          funds={funds}
          onAddPurchaseOrder={onAddPurchaseOrder}
          onAddPartner={onAddPartner}
        />
      )}
    </div>
  );
};

function VariantPicker({
  title,
  description,
  selectedCodes,
  options,
  onToggle
}: {
  title: string;
  description: string;
  selectedCodes: string[];
  options: CodeValue[];
  onToggle: (option: CodeValue) => void;
}) {
  const selected = new Set(selectedCodes.map(codeLabel));
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3"><h2 className="text-sm font-black">{title}</h2><p className="mt-0.5 text-[11px] leading-4 text-zinc-500">{description}</p></div>
      {!options.length && <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-800">Chưa có lựa chọn phù hợp. Hãy tạo thuộc tính hoặc thương hiệu trước.</div>}
      {options.length > 0 && <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">{options.map(option => { const isSelected = selected.has(codeLabel(option.code)); return <button key={option.id} type="button" onClick={() => onToggle(option)} className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${isSelected ? 'border-orange-500 bg-orange-50 text-orange-900' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50'}`}><span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isSelected ? 'border-orange-600 bg-orange-600 text-white' : 'border-zinc-300 bg-white text-transparent'}`}><Check className="h-3 w-3" /></span><span className="min-w-0 flex-1 truncate text-[11px] font-bold">{option.label}</span><CodeBadge code={option.code} /></button>; })}</div>}
    </div>
  );
}

function SeedCount({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-xl border border-sky-200 bg-white/80 px-3 py-2">
      <p className="text-base font-black text-sky-950">{count}</p>
      <p className="text-[10px] font-bold text-sky-800/70">{label}</p>
    </div>
  );
}

function MatrixSummary({ kind, modelCount, firstCount, secondCount }: { kind: CatalogItemKind; modelCount: number; firstCount: number; secondCount: number }) {
  const total = modelCount * firstCount * secondCount;
  const labels = kind === 'DEVICE' ? ['Model', 'Dung lượng', 'Màu'] : ['Model', 'Hãng', 'Cấp'];
  return <div className="rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-4"><div className="flex flex-wrap items-center gap-2 text-xs font-bold text-zinc-700"><span>{labels[0]}: <b className="text-orange-700">{modelCount}</b></span><X className="h-3.5 w-3.5 text-zinc-400" /><span>{labels[1]}: <b className="text-orange-700">{firstCount}</b></span><X className="h-3.5 w-3.5 text-zinc-400" /><span>{labels[2]}: <b className="text-orange-700">{secondCount}</b></span><ArrowRight className="h-3.5 w-3.5 text-orange-500" /><span className="rounded-lg bg-orange-600 px-2 py-1 text-white">{total} tổ hợp</span></div><p className="mt-1.5 text-[11px] text-zinc-600">Đây là số tổ hợp dự kiến; SKU chỉ được tạo sau khi server xác nhận từng mã không trùng.</p></div>;
}

function PreviewPanel({ preview, title, onCreate, createLoading, compact = false }: { preview: CatalogPreviewResult; title: string; onCreate: () => void; createLoading: boolean; compact?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? preview.items : preview.items.slice(0, compact ? 5 : 12);
  return <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-zinc-100 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black text-zinc-800">{title}</p><div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-bold"><span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700">Mới {preview.summary.createable}</span><span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-700">Đã có {preview.summary.existing}</span>{Boolean(preview.summary.conflicts) && <span className="rounded-lg bg-rose-50 px-2 py-1 text-rose-700">Xung đột {preview.summary.conflicts}</span>}{Boolean(preview.summary.invalid) && <span className="rounded-lg bg-zinc-100 px-2 py-1 text-zinc-600">Thiếu mã {preview.summary.invalid}</span>}</div></div><button type="button" disabled={!preview.summary.createable || createLoading} onClick={onCreate} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-3 py-2 text-xs font-black text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40">{createLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Tạo {preview.summary.createable} SKU mới</button></div><div className="overflow-x-auto"><table className="min-w-[700px] w-full text-left"><thead className="bg-zinc-50 text-[10px] uppercase text-zinc-500"><tr><th className="px-3 py-2 font-black">SKU</th><th className="px-3 py-2 font-black">Tên hiển thị</th><th className="px-3 py-2 font-black">Alias</th><th className="px-3 py-2 font-black">Kết quả</th></tr></thead><tbody className="divide-y divide-zinc-100">{rows.map(row => { const state = statusMeta[row.status]; return <tr key={row.clientKey}><td className="px-3 py-2"><CodeBadge code={row.sku} muted={!row.sku} /></td><td className="px-3 py-2 text-xs font-semibold text-zinc-700">{row.name || '—'}{row.reason && <p className="mt-0.5 max-w-xs text-[10px] text-rose-600">{row.reason}</p>}</td><td className="px-3 py-2"><div className="flex max-w-48 flex-wrap gap-1">{(row.aliases || []).slice(0, 3).map(alias => <span key={alias} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">{alias}</span>)}</div></td><td className="px-3 py-2"><span className={`inline-flex rounded-lg border px-2 py-1 text-[10px] font-bold ${state.className}`}>{state.label}</span></td></tr>; })}</tbody></table></div>{preview.items.length > rows.length && <div className="border-t border-zinc-100 p-2 text-center"><button type="button" onClick={() => setShowAll(true)} className="text-xs font-bold text-orange-700 hover:text-orange-800">Xem thêm {preview.items.length - rows.length} dòng</button></div>}</div>;
}

/**
 * Excel-like review grid for bulk generation. Each NEW row is an individual
 * matrix cell; users may uncheck combinations that are not needed before the
 * server receives the create request.
 */
function BulkMatrixSelectionPanel({
  preview,
  selected,
  onToggle,
  onSelectAll,
  onClear,
  createLoading,
  onCreate
}: {
  preview: CatalogPreviewResult;
  selected: string[];
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  createLoading: boolean;
  onCreate: () => void;
}) {
  const selectedSet = new Set(selected);
  const newRows = preview.items.filter(row => row.status === 'NEW');
  const existingRows = preview.items.filter(row => row.status === 'EXISTS');
  const conflictRows = preview.items.filter(row => row.status === 'CONFLICT');
  const invalidRows = preview.items.filter(row => row.status === 'INVALID');
  const cellLabel = (row: CatalogPreviewItem) => [
    row.storageName,
    row.colorName,
    row.manufacturerName,
    row.qualityName,
    row.conditionName
  ].filter(Boolean).join(' · ') || 'Biến thể chuẩn';

  return (
    <div className="overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-orange-100 bg-orange-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black text-orange-950">Ma trận biến thể — chọn từng ô trước khi tạo</p>
          <p className="mt-0.5 text-[11px] leading-4 text-orange-800">Đã chọn <b>{selected.length}</b> mã để tạo · Có thể tạo <b>{newRows.length}</b> · Đã có <b>{existingRows.length}</b>{conflictRows.length ? ` · Cần kiểm tra ${conflictRows.length}` : ''}{invalidRows.length ? ` · Thiếu thông tin ${invalidRows.length}` : ''}.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onSelectAll} className="rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-orange-800 hover:bg-orange-100">Chọn tất cả</button>
          <button type="button" onClick={onClear} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-zinc-600 hover:bg-zinc-50">Bỏ chọn</button>
        </div>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="min-w-[780px] w-full text-left">
          <thead className="sticky top-0 z-10 bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="w-12 px-3 py-2.5 text-center font-black">Chọn</th>
              <th className="px-3 py-2.5 font-black">Model</th>
              <th className="px-3 py-2.5 font-black">Ô biến thể</th>
              <th className="px-3 py-2.5 font-black">SKU dự kiến</th>
              <th className="px-3 py-2.5 font-black">Kết quả</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {preview.items.map(row => {
              const selectable = row.status === 'NEW';
              const state = statusMeta[row.status];
              return (
                <tr key={row.clientKey} className={selectable && selectedSet.has(row.clientKey) ? 'bg-orange-50/40' : ''}>
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      disabled={!selectable}
                      checked={selectable && selectedSet.has(row.clientKey)}
                      onChange={() => onToggle(row.clientKey)}
                      className="h-4 w-4 rounded border-zinc-300 accent-orange-600 disabled:cursor-not-allowed"
                      aria-label={`Chọn ${row.sku || row.name}`}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-xs font-semibold text-zinc-700">{row.modelName || '—'}</td>
                  <td className="px-3 py-2.5 text-[11px] text-zinc-600">{cellLabel(row)}</td>
                  <td className="px-3 py-2.5"><CodeBadge code={row.sku} muted={!row.sku} /></td>
                  <td className="px-3 py-2.5"><span className={`inline-flex rounded-lg border px-2 py-1 text-[10px] font-bold ${state.className}`}>{state.label}</span>{row.reason && <p className="mt-1 max-w-48 text-[10px] leading-4 text-rose-600">{row.reason}</p>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2 border-t border-zinc-100 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[10px] leading-4 text-zinc-500">Hệ thống vẫn kiểm tra SKU và cấu hình một lần nữa trước khi tạo mã hàng.</p>
        <button type="button" disabled={!selected.length || createLoading} onClick={onCreate} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-3 py-2 text-xs font-black text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40">
          {createLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Tạo {selected.length} SKU đã chọn
        </button>
      </div>
    </div>
  );
}

function ClonePreviewPanel({ preview, selected, onToggle, createLoading, onCreate }: { preview: CatalogPreviewResult; selected: string[]; onToggle: (key: string) => void; createLoading: boolean; onCreate: () => void }) {
  const selectedSet = new Set(selected);
  return <div className="overflow-hidden rounded-xl border border-zinc-200"><div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-3 py-2"><span className="text-[11px] font-black text-zinc-700">{preview.summary.createable} SKU mới có thể nhân bản</span><span className="text-[10px] text-zinc-500">Đã chọn {selected.length}</span></div><div className="max-h-64 overflow-y-auto divide-y divide-zinc-100">{preview.items.map(row => { const isNew = row.status === 'NEW'; return <label key={row.clientKey} className={`flex cursor-pointer items-center gap-2 px-3 py-2 ${isNew ? 'hover:bg-orange-50/50' : 'opacity-55'}`}><input type="checkbox" disabled={!isNew} checked={selectedSet.has(row.clientKey)} onChange={() => onToggle(row.clientKey)} className="h-3.5 w-3.5 accent-orange-600" /><div className="min-w-0 flex-1"><p className="truncate font-mono text-[10px] font-bold text-zinc-700">{row.sku || '—'}</p><p className="truncate text-[10px] text-zinc-500">{row.name || row.reason || 'Không thể tạo'}</p></div><span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${statusMeta[row.status].className}`}>{statusMeta[row.status].label}</span></label>; })}</div><div className="border-t border-zinc-100 p-2"><button type="button" disabled={!selected.length || createLoading} onClick={onCreate} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-3 py-2 text-xs font-black text-white hover:bg-orange-700 disabled:opacity-40">{createLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />} Tạo {selected.length} SKU đã chọn</button></div></div>;
}
