import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { 
  Search, Check, Box, X, Store, Hash, DollarSign, Plus, Trash2, MapPin, ChevronDown,
  Building2, CreditCard, Coins, ArrowRight, ShieldCheck, QrCode, Sparkles, Smartphone,
  CheckCircle2, PackagePlus, Receipt, Layers, Package, ScanLine, Wallet
} from 'lucide-react';
import { 
  DeviceItem, Partner, StoreBranch, WarehouseInfo, FundAccount, PurchaseOrder, MasterCatalogItem, UserAccount
} from '../types';
import { CreatePartnerModal } from './CreatePartnerModal';
import { isWarehouseActive } from '../utils/warehouseLifecycle';
import { catalogApi } from '../services/catalogApiClient';
import { browserDraftKey, readBrowserDraft, removeBrowserDraft, writeBrowserDraft } from '../utils/browserDraft';

interface UniformEntryFormProps {
  isOpen: boolean;
  onClose: () => void;
  partners?: Partner[];
  branches?: StoreBranch[];
  warehouses?: WarehouseInfo[];
  funds?: FundAccount[];
  catalogItems?: MasterCatalogItem[];
  currentUser?: UserAccount | null;
  onAddPurchaseOrder?: (order: PurchaseOrder, autoCreateDevices: boolean) => PurchaseOrder | void | Promise<PurchaseOrder | void>;
  onAddPartner?: (partner: Partner) => void | Promise<void>;
  onAddDevice?: () => void;
  onAddMultipleDevices?: (devices: import('../types').DeviceItem[]) => void;
  onAddCashTransaction?: (tx: import('../types').CashTransaction) => void;
  onUpdatePartner?: (partner: Partner) => void;
}

interface FormItem {
  catalogItemId: string;
  searchQuery: string;
  imeisInput: string;
  buyPrice: number;
}

interface FormValues {
  branchId: string;
  warehouseId: string;
  supplierId: string;
  items: FormItem[];
  paymentMethod: 'BANK' | 'CASH' | 'DEBT';
  amountPaid: number;
}

interface UniformEntryDraft {
  values: FormValues;
  selectedFundId: string;
  selectedCatalogItems: Record<string, MasterCatalogItem>;
  mobileTab: 'CATALOG' | 'ITEMS' | 'PAYMENT';
  catalogSearch: string;
  isCustomPaid: boolean;
}

/**
 * Product Master carries generated aliases/search tokens so staff can use the
 * short terms they actually say at the counter (for example "15pm gx").
 * Keep this matching local and defensive because older catalog rows only have
 * a name and SKU.
 */
const normalizeCatalogSearch = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .toLocaleLowerCase('vi-VN')
  .trim();

const matchesCatalogSearch = (item: MasterCatalogItem, query: string) => {
  const normalizedQuery = normalizeCatalogSearch(query);
  if (!normalizedQuery) return true;

  const searchableValues = [
    item.name,
    item.sku,
    item.posShortName,
    item.model,
    item.modelCode,
    item.brand,
    ...(item.aliases || []),
    ...(item.searchTokens || [])
  ];

  return searchableValues.some(value => normalizeCatalogSearch(value).includes(normalizedQuery));
};

export const UniformEntryForm: React.FC<UniformEntryFormProps> = ({
  isOpen,
  onClose,
  partners = [],
  branches = [],
  warehouses = [],
  funds = [],
  catalogItems = [],
  currentUser,
  onAddPurchaseOrder,
  onAddPartner
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const defaultBranchId = currentUser?.branchId || '';
  const [isCreateSupplierModalOpen, setIsCreateSupplierModalOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'CATALOG' | 'ITEMS' | 'PAYMENT'>('ITEMS');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [activeSearchRowIndex, setActiveSearchRowIndex] = useState<number | null>(null);
  const [remoteCatalogItems, setRemoteCatalogItems] = useState<MasterCatalogItem[]>([]);
  const [catalogNextCursor, setCatalogNextCursor] = useState<string | undefined>();
  const [catalogHasMore, setCatalogHasMore] = useState(false);
  const [catalogLoadState, setCatalogLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<Record<string, MasterCatalogItem>>({});
  const catalogRequestVersion = useRef(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCustomPaid, setIsCustomPaid] = useState(false);
  const entryDraftKey = browserDraftKey('purchase-imei', currentUser?.id, defaultBranchId);
  const wasOpenRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const skipPaymentSyncRef = useRef(false);

  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      branchId: defaultBranchId,
      warehouseId: '',
      supplierId: '',
      items: [{ catalogItemId: '', searchQuery: '', imeisInput: '', buyPrice: 0 }],
      paymentMethod: 'BANK',
      amountPaid: 0
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items"
  });

  const watchItems = useWatch({ control, name: "items" }) || [];
  const watchPaymentMethod = useWatch({ control, name: "paymentMethod" });
  const watchAmountPaid = useWatch({ control, name: "amountPaid" });
  const watchBranchId = useWatch({ control, name: "branchId" });
  const watchWarehouseId = useWatch({ control, name: "warehouseId" });
  const watchedFormValues = useWatch({ control }) as FormValues;
  const [selectedFundId, setSelectedFundId] = useState<string>('');

  const activeRowSearch = activeSearchRowIndex === null
    ? ''
    : String(watchItems[activeSearchRowIndex]?.searchQuery || '');
  const effectiveCatalogSearch = activeSearchRowIndex === null ? catalogSearch : activeRowSearch;

  const loadCatalogPage = useCallback(async (search: string, cursor?: string, append = false) => {
    const requestVersion = ++catalogRequestVersion.current;
    setCatalogLoadState('loading');
    setCatalogLoadError(null);

    try {
      const page = await catalogApi.listItems({
        limit: 50,
        cursor,
        search: normalizeCatalogSearch(search),
        kind: 'DEVICE',
        activeOnly: true
      });

      if (requestVersion !== catalogRequestVersion.current) return;

      setRemoteCatalogItems(current => {
        if (!append) return page.items;
        const byId = new Map(current.map(item => [item.id, item]));
        page.items.forEach(item => byId.set(item.id, item));
        return [...byId.values()];
      });
      setCatalogNextCursor(page.nextCursor);
      setCatalogHasMore(page.hasMore);
      setCatalogLoadState('ready');
    } catch (error: any) {
      if (requestVersion !== catalogRequestVersion.current) return;
      // A previous page remains useful after a failed "load more" request. Only
      // surface the legacy prop as a temporary safety fallback when no server
      // page is available at all.
      if (!append) {
        setRemoteCatalogItems([]);
        setCatalogNextCursor(undefined);
        setCatalogHasMore(false);
      }
      setCatalogLoadState('error');
      setCatalogLoadError(error?.message || 'Không thể tải Danh mục SKU từ máy chủ.');
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      catalogRequestVersion.current += 1;
      return;
    }

    const delay = effectiveCatalogSearch.trim() ? 300 : 0;
    const timer = window.setTimeout(() => {
      void loadCatalogPage(effectiveCatalogSearch);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [isOpen, effectiveCatalogSearch, loadCatalogPage]);

  const loadMoreCatalogItems = () => {
    if (!catalogNextCursor || catalogLoadState === 'loading') return;
    void loadCatalogPage(effectiveCatalogSearch, catalogNextCursor, true);
  };

  const suppliers = useMemo(() => partners.filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH'), [partners]);
  const branchWarehouses = useMemo(
    () => warehouses.filter(warehouse => warehouse.branchId === watchBranchId && isWarehouseActive(warehouse)),
    [warehouses, watchBranchId]
  );

  const defaultFormValues = useCallback((): FormValues => ({
    branchId: defaultBranchId,
    warehouseId: warehouses.find(warehouse => warehouse.branchId === defaultBranchId && isWarehouseActive(warehouse))?.id || '',
    supplierId: suppliers[0]?.id || '',
    items: [{ catalogItemId: '', searchQuery: '', imeisInput: '', buyPrice: 0 }],
    paymentMethod: 'BANK',
    amountPaid: 0
  }), [defaultBranchId, suppliers, warehouses]);
  
  useEffect(() => {
    if (!funds.length) return;
    const matchingFunds = funds.filter(f => f.type === watchPaymentMethod && f.branchId === watchBranchId && f.isArchived !== true && f.isActive !== false);
    if (matchingFunds.length > 0) {
      if (!matchingFunds.find(f => f.id === selectedFundId)) {
        setSelectedFundId(matchingFunds[0].id);
      }
    } else {
      setSelectedFundId('');
    }
  }, [watchPaymentMethod, watchBranchId, funds]);

  useEffect(() => {
    if (!warehouses.length) return;
    const selectedIsValid = branchWarehouses.some(warehouse => warehouse.id === watchWarehouseId);
    if (!selectedIsValid) setValue('warehouseId', branchWarehouses[0]?.id || '');
  }, [branchWarehouses, warehouses.length, watchWarehouseId, setValue]);

  useEffect(() => {
    if (!suppliers.length) return;
    const currentSupplierId = String(watchedFormValues?.supplierId || '');
    if (!suppliers.some(supplier => supplier.id === currentSupplierId)) {
      setValue('supplierId', suppliers[0]?.id || '');
    }
  }, [setValue, suppliers, watchedFormValues?.supplierId]);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      draftHydratedRef.current = false;
      return;
    }
    // Firestore refreshes replace warehouses/suppliers with new array
    // identities. Initialize only on the closed -> open transition so those
    // refreshes can never reset a form while staff are typing.
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    draftHydratedRef.current = false;

    const saved = readBrowserDraft<UniformEntryDraft>(entryDraftKey);
    const nextValues = saved?.values?.items?.length ? saved.values : defaultFormValues();
    skipPaymentSyncRef.current = true;
    reset(nextValues);
    setMobileTab(saved?.mobileTab || 'ITEMS');
    setSelectedFundId(saved?.selectedFundId || '');
    setSelectedCatalogItems(saved?.selectedCatalogItems || {});
    setCatalogSearch(saved?.catalogSearch || '');
    setActiveSearchRowIndex(null);
    setIsCustomPaid(saved?.isCustomPaid === true);
    setIsSubmitting(false);
    draftHydratedRef.current = true;
  }, [defaultFormValues, entryDraftKey, isOpen, reset]);

  const totalAmount = useMemo(() => {
    if (!Array.isArray(watchItems)) return 0;
    return watchItems.reduce((sum, item) => {
      if (!item) return sum;
      const quantity = (item.imeisInput || '').split(/[\n,]+/).map(i => i.trim()).filter(i => i.length > 0).length;
      const price = Number(item.buyPrice) || 0;
      return sum + (quantity * price);
    }, 0);
  }, [watchItems]);

  const totalQuantity = useMemo(() => {
    if (!Array.isArray(watchItems)) return 0;
    return watchItems.reduce((sum, item) => {
      if (!item) return sum;
      const quantity = (item.imeisInput || '').split(/[\n,]+/).map(i => i.trim()).filter(i => i.length > 0).length;
      return sum + quantity;
    }, 0);
  }, [watchItems]);

  useEffect(() => {
    if (skipPaymentSyncRef.current) {
      skipPaymentSyncRef.current = false;
      return;
    }
    if (watchPaymentMethod === 'DEBT') {
      setValue('amountPaid', 0);
      setIsCustomPaid(false);
    } else if (!isCustomPaid && (watchPaymentMethod === 'BANK' || watchPaymentMethod === 'CASH')) {
      setValue('amountPaid', totalAmount);
    }
  }, [watchPaymentMethod, totalAmount, isCustomPaid, setValue]);

  useEffect(() => {
    if (!isOpen || !draftHydratedRef.current || !watchedFormValues?.items) return;
    const timer = window.setTimeout(() => {
      writeBrowserDraft<UniformEntryDraft>(entryDraftKey, {
        values: watchedFormValues,
        selectedFundId,
        selectedCatalogItems,
        mobileTab,
        catalogSearch,
        isCustomPaid
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [catalogSearch, entryDraftKey, isCustomPaid, isOpen, mobileTab, selectedCatalogItems, selectedFundId, watchedFormValues]);

  const discardDraft = () => {
    draftHydratedRef.current = false;
    skipPaymentSyncRef.current = true;
    removeBrowserDraft(entryDraftKey);
    reset(defaultFormValues());
    setSelectedFundId('');
    setSelectedCatalogItems({});
    setCatalogSearch('');
    setActiveSearchRowIndex(null);
    setMobileTab('ITEMS');
    setIsCustomPaid(false);
    window.setTimeout(() => { draftHydratedRef.current = true; }, 0);
  };

  const rawAmountPaid = Number(watchAmountPaid) || 0;
  const actualPaidAmount = watchPaymentMethod === 'DEBT' ? 0 : Math.min(rawAmountPaid, totalAmount);
  const remainingDebtAmount = Math.max(0, totalAmount - actualPaidAmount);

  const isUsingCatalogFallback = catalogLoadState === 'error' && remoteCatalogItems.length === 0;
  const availableCatalogItems = isUsingCatalogFallback ? catalogItems : remoteCatalogItems;

  const filteredCatalogItems = useMemo(() => {
    const query = effectiveCatalogSearch.trim();
    return availableCatalogItems.filter(item => {
      // Phiếu nhập IMEI chỉ nhận Product Master nhóm máy. Linh kiện/phụ kiện
      // được quản lý bằng tồn theo kho, không thể trở thành một dòng máy có IMEI.
      if (item.category !== 'DEVICE' || item.lifecycleStatus === 'ARCHIVED' || item.status === 'inactive') return false;
      return matchesCatalogSearch(item, query);
    });
  }, [availableCatalogItems, effectiveCatalogSearch]);

  const rememberSelectedCatalogItem = (item: MasterCatalogItem) => {
    setSelectedCatalogItems(current => ({ ...current, [item.id]: item }));
  };

  const handleSelectCatalogItemForNewRow = (item: MasterCatalogItem) => {
    rememberSelectedCatalogItem(item);
    if (fields.length === 1 && !watchItems[0]?.catalogItemId && !watchItems[0]?.imeisInput) {
      setValue('items.0.catalogItemId', item.id);
      setValue('items.0.searchQuery', item.name);
      setValue('items.0.buyPrice', item.defaultImportPrice || 0);
    } else {
      append({
        catalogItemId: item.id,
        searchQuery: item.name,
        imeisInput: '',
        buyPrice: item.defaultImportPrice || 0
      });
    }
    setMobileTab('ITEMS');
  };

  const handleSelectCatalogItemForRow = (index: number, item: MasterCatalogItem) => {
    rememberSelectedCatalogItem(item);
    setValue(`items.${index}.catalogItemId`, item.id);
    setValue(`items.${index}.searchQuery`, item.name);
    setValue(`items.${index}.buyPrice`, item.defaultImportPrice || 0);
    setActiveSearchRowIndex(null);
  };

  const onSubmit = async (data: FormValues) => {
    if (totalQuantity === 0) {
      alert('Vui lòng nhập ít nhất 1 IMEI hợp lệ!');
      return;
    }

    // Collect and validate duplicate IMEIs within the form
    const duplicateImeis: string[] = [];
    const seenImeis = new Set<string>();

    for (const item of data.items) {
      const imeis = item.imeisInput.split(/[\n,]+/).map(i => i.trim()).filter(i => i.length > 0);
      for (const imei of imeis) {
        if (seenImeis.has(imei)) {
          duplicateImeis.push(imei);
        } else {
          seenImeis.add(imei);
        }
      }
    }

    if (duplicateImeis.length > 0) {
      alert(`Phát hiện IMEI bị trùng lặp trong phiếu nhập: ${duplicateImeis.slice(0, 5).join(', ')}${duplicateImeis.length > 5 ? '...' : ''}. Vui lòng kiểm tra lại!`);
      return;
    }

    const supplier = suppliers.find(s => s.id === data.supplierId);
    if (!supplier) {
      alert('Vui lòng chọn nhà cung cấp!');
      return;
    }

    const targetBranch = branches.find(b => b.id === data.branchId);
    if (!targetBranch) {
      alert('Vui lòng chọn đúng chi nhánh nhập hàng.');
      return;
    }

    const invalidImeis = [...seenImeis].filter(imei => !/^\d{5,15}$/.test(imei));
    if (invalidImeis.length > 0) {
      alert(`IMEI/Serial phải gồm từ 5 đến 15 chữ số. Mã chưa hợp lệ: ${invalidImeis.slice(0, 5).join(', ')}`);
      return;
    }
    const targetWarehouse = warehouses.find(w => w.id === data.warehouseId && w.branchId === targetBranch.id && isWarehouseActive(w));
    if (!targetWarehouse) {
      alert('Vui lòng chọn một kho đang hoạt động thuộc đúng chi nhánh nhập hàng. Hệ thống không tự chọn kho toàn hệ thống.');
      return;
    }

    const debtAmount = remainingDebtAmount;

    if (onAddPurchaseOrder) {
      const fund = selectedFundId ? funds.find(f => f.id === selectedFundId && f.branchId === targetBranch.id && f.type === data.paymentMethod && f.isArchived !== true && f.isActive !== false) : null;
      if (actualPaidAmount > 0 && !fund) {
        alert(`Chi nhánh "${targetBranch.name}" chưa có ${data.paymentMethod === 'CASH' ? 'quỹ tiền mặt' : 'tài khoản ngân hàng'} phù hợp. Phiếu chưa được tạo.`);
        return;
      }
      
      const orderItems = data.items.map((item, idx) => {
        const catalogItem = selectedCatalogItems[item.catalogItemId]
          || remoteCatalogItems.find(c => c.id === item.catalogItemId)
          || catalogItems.find(c => c.id === item.catalogItemId);
        const imeis = item.imeisInput.split(/[\n,]+/).map(i => i.trim()).filter(i => i.length > 0);
        // Product Master references are optional so legacy/manual receipt
        // payloads remain valid. Only include concrete values: Firestore does
        // not accept undefined document fields.
        const catalogReference = (value: unknown) => {
          const normalized = String(value || '').trim();
          return normalized || undefined;
        };
        const catalogFamilyCode = catalogReference(
          catalogItem?.productFamilyCode || (catalogItem as any)?.familyCode
        );
        const catalogGroupCode = catalogReference(
          catalogItem?.catalogGroupCode || catalogItem?.categoryCode
        );
        return {
          id: `POI-${Date.now()}-${idx}`,
          type: 'device' as const,
          ...(catalogReference(catalogItem?.id) ? { catalogItemId: catalogReference(catalogItem?.id) } : {}),
          ...(catalogReference(catalogItem?.modelId) ? { catalogModelId: catalogReference(catalogItem?.modelId) } : {}),
          ...(catalogReference(catalogItem?.modelCode) ? { catalogModelCode: catalogReference(catalogItem?.modelCode) } : {}),
          ...(catalogFamilyCode ? { productFamilyCode: catalogFamilyCode } : {}),
          ...(catalogGroupCode ? { catalogGroupCode } : {}),
          modelOrName: catalogItem?.name || item.searchQuery || 'Thiết bị',
          color: catalogItem?.color,
          storage: catalogItem?.storage,
          condition: (catalogItem?.condition as any) || 'Like New 99%',
          region: '', 
          imeiList: imeis,
          quantity: imeis.length,
          importPrice: Number(item.buyPrice) || 0,
          // Firestore money fields are whole VND. Multiplying by 1.1 can
          // produce binary artifacts such as 6820.000000000001.
          expectedSellPrice: Math.round((Number(item.buyPrice) || 0) * 1.1),
          totalAmount: imeis.length * (Number(item.buyPrice) || 0)
        };
      }).filter(item => item.quantity > 0);

      if (orderItems.length === 0) {
        alert('Vui lòng nhập ít nhất 1 sản phẩm kèm mã IMEI hợp lệ trước khi lưu phiếu nhập!');
        return;
      }

      const totalValidQuantity = orderItems.reduce((s, it) => s + it.quantity, 0);

      const purchaseOrder: PurchaseOrder = {
        id: `PO-${Date.now()}`,
        code: 'SERVER_GENERATED',
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierPhone: supplier.phone,
        branchId: targetBranch.id,
        branchName: targetBranch.name,
        warehouseId: targetWarehouse.id,
        warehouseName: targetWarehouse.name,
        orderDate: new Date().toISOString().split('T')[0],
        creatorName: currentUser ? currentUser.displayName : 'Hệ thống',
        status: 'COMPLETED',
        paymentStatus: actualPaidAmount >= totalAmount ? 'PAID' : (actualPaidAmount > 0 ? 'PARTIAL' : 'UNPAID'),
        paidAmount: actualPaidAmount,
        debtAmount: debtAmount,
        subTotal: totalAmount,
        totalAmount: totalAmount,
        fundId: fund?.id,
        paymentMethod: data.paymentMethod === 'BANK' ? 'Chuyển khoản VietQR' : data.paymentMethod === 'CASH' ? 'Tiền mặt tại két' : 'Ghi nhận công nợ NCC',
        items: orderItems,
        totalQuantity: totalValidQuantity
      };
      
      try {
        setIsSubmitting(true);
        await onAddPurchaseOrder(purchaseOrder, true);
        removeBrowserDraft(entryDraftKey);
        onClose();
      } catch (error: any) {
        alert(error?.message || 'Không thể tạo phiếu nhập. Không có dữ liệu nào được ghi.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex h-[100dvh] w-screen select-none flex-col overflow-hidden bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      
      {/* 1. Dark Document Header with Subtle Orange Glow */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-zinc-950 via-zinc-900 to-black text-white border-b border-zinc-800 shrink-0 shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-1/4 w-96 h-10 bg-orange-500/10 blur-2xl pointer-events-none" />
        
        <div className="relative z-10 flex min-w-0 items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-[#FF4B16] text-white flex items-center justify-center font-bold shadow-md shadow-[#FF4B16]/20 shrink-0">
            <PackagePlus className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <span className="truncate text-sm font-bold uppercase tracking-tight text-white">Phiếu Nhập Hàng Kho</span>
              <span className="hidden rounded-full border border-[#FF4B16]/30 bg-[#FF4B16]/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#FF4B16] sm:inline-block">
                Mã: cấp tự động khi lưu
              </span>
              <span className="hidden sm:inline-block px-2 py-0.2 text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-full">
                PhoneHouse CRM
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 font-normal hidden sm:inline-block mt-0.5">
              Nhập hàng theo IMEI, đối soát kiểm định KCS & cập nhật tồn kho tức thì
            </span>
          </div>
        </div>

        <div className="relative z-10 flex shrink-0 items-center space-x-1.5">
          <span className="hidden text-[10px] font-semibold text-emerald-300 sm:inline">Tự lưu nháp</span>
          <button
            type="button"
            onClick={discardDraft}
            className="rounded-xl border border-zinc-800 p-1.5 text-zinc-400 transition-colors hover:bg-rose-950/60 hover:text-rose-300"
            title="Xóa toàn bộ dữ liệu nháp"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer border border-zinc-800"
            title="Đóng phiếu nhập (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. Mobile Step Tabs with Professional Lucide Icons */}
      <div className="lg:hidden flex items-center p-1.5 bg-zinc-100 border-b border-zinc-200 text-xs font-semibold shrink-0 gap-1">
        <button
          type="button"
          onClick={() => setMobileTab('CATALOG')}
          className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
            mobileTab === 'CATALOG' ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>1. Chọn SKU</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('ITEMS')}
          className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
            mobileTab === 'ITEMS' ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <ScanLine className="w-3.5 h-3.5" />
          <span>2. IMEI ({totalQuantity})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('PAYMENT')}
          className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
            mobileTab === 'PAYMENT' ? 'bg-[#FF4B16] text-white shadow-xs' : 'text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>3. Nhập Kho</span>
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.4fr_390px] divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/80 items-stretch flex-1 min-h-0 overflow-y-auto lg:overflow-hidden bg-white w-full">
        
        <div className={`p-3 sm:p-4 flex flex-col h-full overflow-hidden space-y-3 bg-gradient-to-b from-white via-orange-50/15 to-zinc-50/50 ${mobileTab !== 'CATALOG' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-[#ff4b16]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                Danh Mục SKU Master
              </h3>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">
              {catalogLoadState === 'loading' ? 'Đang tải…' : `${filteredCatalogItems.length} SKU`}
            </span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Tìm Model, SKU, dung lượng..."
              value={catalogSearch}
              onFocus={() => setActiveSearchRowIndex(null)}
              onChange={e => {
                setActiveSearchRowIndex(null);
                setCatalogSearch(e.target.value);
              }}
              className="w-full h-10 pl-9 pr-3 bg-white border border-zinc-200 rounded-xl text-xs font-medium text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-[#ff4b16]"
            />
          </div>

          {catalogLoadState === 'loading' && (
            <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-zinc-500 bg-zinc-50 border border-zinc-100 rounded-lg">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-orange-200 border-t-[#ff4b16] animate-spin" />
              Đang tải Product Master đang hoạt động…
            </div>
          )}

          {catalogLoadState === 'error' && (
            <div className="px-2.5 py-2 text-[11px] leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-lg">
              {catalogLoadError || 'Không thể tải danh mục từ máy chủ.'}
              {isUsingCatalogFallback && catalogItems.length > 0 && ' Đang hiển thị dữ liệu tạm trên thiết bị; vui lòng kiểm tra kết nối trước khi lưu.'}
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {filteredCatalogItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400">
                Không tìm thấy mã SKU phù hợp.
              </div>
            ) : (
              filteredCatalogItems.map(item => (
                <div
                  key={item.id}
                  onClick={() => handleSelectCatalogItemForNewRow(item)}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-white to-orange-50/30 border border-zinc-200/90 hover:border-orange-300 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-semibold text-zinc-800 group-hover:text-[#ff4b16] transition-colors truncate">
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-[10px] text-zinc-500 font-mono mt-0.5">
                      <span>SKU: {item.sku}</span>
                      <span>•</span>
                      <span>{item.color || 'Mặc định'}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-semibold font-mono text-zinc-800 block">
                      {(item.defaultImportPrice || 0).toLocaleString('vi-VN')} đ
                    </span>
                    <span className="text-[10px] font-semibold text-[#ff4b16] opacity-0 group-hover:opacity-100 transition-opacity">
                      + Thêm nhập ↵
                    </span>
                  </div>
                </div>
              ))
            )}

            {catalogHasMore && !isUsingCatalogFallback && (
              <button
                type="button"
                onClick={loadMoreCatalogItems}
                disabled={catalogLoadState === 'loading'}
                className="w-full py-2 text-xs font-semibold text-[#ff4b16] border border-orange-200 bg-orange-50/60 hover:bg-orange-100 rounded-xl disabled:opacity-50 disabled:cursor-wait transition-colors"
              >
                {catalogLoadState === 'loading' ? 'Đang tải thêm…' : 'Tải thêm 50 SKU'}
              </button>
            )}
          </div>
        </div>

        <div className={`p-3 sm:p-4 flex flex-col h-full overflow-hidden space-y-3 bg-gradient-to-b from-white via-zinc-50/40 to-white ${mobileTab !== 'ITEMS' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-lg bg-[#ff4b16] text-white flex items-center justify-center font-bold text-xs shadow-sm shadow-orange-500/30">
                {fields.length}
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                  Danh Sách Máy & Dán IMEI Hàng Loạt
                </h3>
                <span className="text-[10px] text-zinc-500 font-normal">
                  Tổng {totalQuantity} cây máy chuẩn bị nhập kho
                </span>
              </div>
            </div>

            <span className="text-[10px] text-zinc-400 font-medium">
              💡 Gõ tên để tìm nhanh SKU hoặc bấm Cột 1
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-16 lg:pb-4">
            {fields.map((field, index) => {
              const currentQuery = watchItems[index]?.searchQuery || '';
              const currentImeis = watchItems[index]?.imeisInput || '';
              const parsedImeis = currentImeis.split(/[\n,]+/).map(i => i.trim()).filter(i => i.length > 0);
              const itemCount = parsedImeis.length;
              const unitPrice = Number(watchItems[index]?.buyPrice) || 0;
              const rowTotal = itemCount * unitPrice;

              const rowMatches = activeSearchRowIndex === index && currentQuery.trim().length >= 1
                ? filteredCatalogItems.slice(0, 5)
                : [];

              return (
                <div 
                  key={field.id} 
                  className="p-3.5 rounded-2xl bg-gradient-to-br from-white via-zinc-50/70 to-orange-50/20 border border-zinc-200/90 hover:border-orange-300 transition-all space-y-2.5 relative shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2 relative">
                    <div className="flex-1 relative">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-3 pointer-events-none" />
                        <input
                          type="text"
                          {...register(`items.${index}.searchQuery` as const, { required: true })}
                          onFocus={() => setActiveSearchRowIndex(index)}
                          placeholder="Gõ tên máy hoặc SKU..."
                          className="w-full h-9 pl-8 pr-3 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
                        />
                      </div>

                      {activeSearchRowIndex === index && currentQuery.trim().length >= 1 && catalogLoadState === 'loading' && (
                        <div className="absolute top-10 left-0 right-0 z-40 px-3 py-2 bg-white rounded-xl shadow-xl border border-zinc-200 text-[11px] text-zinc-500">
                          Đang tìm SKU trên máy chủ…
                        </div>
                      )}

                      {activeSearchRowIndex === index && catalogLoadState !== 'loading' && rowMatches.length > 0 && (
                        <div className="absolute top-10 left-0 right-0 z-40 bg-white rounded-2xl shadow-xl border border-zinc-200 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100 max-h-52 overflow-y-auto">
                          <div className="px-3 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
                            <span>Gợi ý mã SKU:</span>
                            <button
                              type="button"
                              onClick={() => setActiveSearchRowIndex(null)}
                              className="text-zinc-400 hover:text-zinc-600 font-bold"
                            >
                              ✕
                            </button>
                          </div>
                          {rowMatches.map(matched => (
                            <div
                              key={matched.id}
                              onClick={() => handleSelectCatalogItemForRow(index, matched)}
                              className="px-3 py-2 hover:bg-orange-50/80 transition-colors cursor-pointer flex items-center justify-between group border-b border-zinc-50 last:border-0"
                            >
                              <div>
                                <span className="text-xs font-semibold text-zinc-800 group-hover:text-[#ff4b16] transition-colors block">
                                  {matched.name}
                                </span>
                                <span className="text-[10px] font-mono text-zinc-500">
                                  SKU: {matched.sku} • {matched.color || 'Màu chuẩn'}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-mono font-semibold text-emerald-700 block">
                                  {(matched.defaultImportPrice || 0).toLocaleString('vi-VN')} đ
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {activeSearchRowIndex === index && currentQuery.trim().length >= 1 && catalogLoadState !== 'loading' && rowMatches.length === 0 && catalogLoadState !== 'error' && (
                        <div className="absolute top-10 left-0 right-0 z-40 px-3 py-2 bg-white rounded-xl shadow-xl border border-zinc-200 text-[11px] text-zinc-500">
                          Không tìm thấy Product Master đang hoạt động.
                        </div>
                      )}
                    </div>

                    <div className="w-36">
                      <input
                        type="number"
                        {...register(`items.${index}.buyPrice` as const, { required: true })}
                        placeholder="Giá vốn..."
                        className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-mono font-semibold text-[#ff4b16] focus:outline-none focus:border-[#ff4b16]"
                      />
                    </div>

                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <textarea
                      {...register(`items.${index}.imeisInput` as const)}
                      rows={3}
                      placeholder="Dán IMEI (dòng hoặc phẩy)..."
                      className="w-full p-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-mono font-medium text-zinc-700 placeholder:text-zinc-400 focus:outline-none focus:border-[#ff4b16] resize-none"
                    />
                    <div className="flex items-center justify-between text-[11px] text-zinc-500 font-normal px-1">
                      <span>Đã nhận diện: <b className="text-zinc-800 font-mono font-semibold">{itemCount} IMEI</b></span>
                      <span>Thành tiền: <b className="text-[#ff4b16] font-mono font-semibold">{rowTotal.toLocaleString('vi-VN')} đ</b></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={`p-3 sm:p-4 flex flex-col h-full overflow-y-auto space-y-3 bg-gradient-to-b from-orange-50/25 via-zinc-50/40 to-white pb-28 lg:pb-6 ${mobileTab !== 'PAYMENT' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2 shrink-0">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-xl bg-orange-50 text-[#ff4b16] flex items-center justify-center font-bold shadow-2xs">
                <Store className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                Nhà Cung Cấp & Thanh Toán
              </h3>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">Bước 3: Chốt nhập</span>
          </div>

          <div className="space-y-1 shrink-0">
            <label className="block text-xs font-semibold text-zinc-700">Chi Nhánh Nhập</label>
            {isAdmin ? (
              <select
                {...register("branchId", { required: true })}
                className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-medium text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            ) : (
              <div className="px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-medium text-zinc-800">
                {branches.find(b => b.id === defaultBranchId)?.name || 'Showroom Chi Nhánh'}
              </div>
            )}
          </div>

          <div className="space-y-1 shrink-0">
            <label className="block text-xs font-semibold text-zinc-700">Kho Nhận Hàng <span className="text-rose-600">*</span></label>
            <select
              {...register("warehouseId", { required: "Vui lòng chọn kho nhận hàng" })}
              className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-medium text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
            >
              <option value="">-- Chọn kho thuộc chi nhánh --</option>
              {branchWarehouses.map(warehouse => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>
              ))}
            </select>
            {branchWarehouses.length === 0 && (
              <p className="text-[11px] font-semibold text-rose-600">Chi nhánh này chưa có kho hoạt động. Hãy tạo/khôi phục kho trong Cài đặt trước.</p>
            )}
          </div>

          <div className="space-y-1 shrink-0">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-zinc-700">Nhà Cung Cấp</label>
              <button
                type="button"
                onClick={() => setIsCreateSupplierModalOpen(true)}
                className="text-[11px] font-semibold text-[#ff4b16] hover:underline cursor-pointer"
              >
                + Thêm NCC
              </button>
            </div>
            <select
              {...register("supplierId", { required: "Vui lòng chọn nhà cung cấp" })}
              className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-medium text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
            >
              <option value="">-- Chọn Nhà Cung Cấp --</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.phone || 'N/A'})</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 shrink-0">
            <label className="block text-xs font-semibold text-zinc-700">Hình Thức Thanh Toán</label>
            <div className="grid grid-cols-3 gap-1">
              {[
                { id: 'BANK', label: 'Chuyển Khoản', icon: CreditCard },
                { id: 'CASH', label: 'Tiền Mặt', icon: Coins },
                { id: 'DEBT', label: 'Ghi Nợ NCC', icon: Receipt }
              ].map(pm => {
                const Icon = pm.icon;
                const isSelected = watchPaymentMethod === pm.id;
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => {
                      setValue('paymentMethod', pm.id as any);
                      setIsCustomPaid(false);
                    }}
                    className={`py-2 px-1 rounded-xl text-[11px] font-semibold flex flex-col items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-900 text-white shadow-xs'
                        : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 mb-1 ${isSelected ? 'text-[#ff4b16]' : 'text-zinc-400'}`} />
                    <span>{pm.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 shrink-0 p-3 bg-white/80 rounded-2xl border border-zinc-200/80">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-700">Số Tiền Trả Ngay (VNĐ):</span>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => {
                    setValue('amountPaid', totalAmount);
                    setIsCustomPaid(false);
                  }}
                  className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-orange-50 text-[#ff4b16] border border-orange-200 hover:bg-orange-100 cursor-pointer"
                >
                  100%
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setValue('amountPaid', Math.round(totalAmount / 2));
                    setIsCustomPaid(true);
                  }}
                  className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-zinc-100 text-zinc-700 hover:bg-zinc-200 cursor-pointer"
                >
                  50%
                </button>
              </div>
            </div>

            <div className="relative">
              <input
                type="number"
                {...register("amountPaid")}
                disabled={watchPaymentMethod === 'DEBT'}
                onChange={e => {
                  setValue("amountPaid", Number(e.target.value) || 0);
                  setIsCustomPaid(true);
                }}
                placeholder="Nhập số tiền trả..."
                className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono font-semibold text-emerald-700 focus:outline-none focus:border-[#ff4b16] focus:bg-white disabled:bg-zinc-100 disabled:text-zinc-400"
              />
            </div>

            {watchPaymentMethod !== 'DEBT' && actualPaidAmount > 0 && (
              <div className="space-y-1 pt-1">
                <label className="block text-[11px] font-semibold text-zinc-700">Sổ quỹ / tài khoản chi tiền <span className="text-rose-600">*</span></label>
                <select
                  value={selectedFundId}
                  onChange={event => setSelectedFundId(event.target.value)}
                  className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-medium text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
                >
                  <option value="">-- Chọn tài khoản đúng chi nhánh --</option>
                  {funds.filter(fund => fund.branchId === watchBranchId && fund.type === watchPaymentMethod && fund.isArchived !== true && fund.isActive !== false).map(fund => (
                    <option key={fund.id} value={fund.id}>{fund.name} · {Number(fund.currentBalance || 0).toLocaleString('vi-VN')} đ</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="p-3.5 bg-gradient-to-br from-orange-500/10 via-white to-orange-50/20 rounded-2xl border border-orange-200/80 space-y-2 shrink-0 shadow-xs">
            <div className="flex items-center justify-between text-xs text-zinc-600 font-normal">
              <span>Tổng số lượng máy:</span>
              <span className="font-mono font-semibold text-zinc-800">{totalQuantity} cây máy</span>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-600 font-normal">
              <span>Tổng tiền hàng:</span>
              <span className="font-mono font-bold text-sm text-[#ff4b16]">
                {totalAmount.toLocaleString('vi-VN')} đ
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-600 font-normal pt-1.5 border-t border-orange-200/40">
              <span>Thực trả NCC:</span>
              <span className="font-mono font-semibold text-emerald-700">
                {actualPaidAmount.toLocaleString('vi-VN')} đ
              </span>
            </div>

            {remainingDebtAmount > 0 && (
              <div className="flex items-center justify-between text-[11px] text-rose-600 font-semibold pt-1 border-t border-orange-200/40">
                <span>Công nợ ghi nhận:</span>
                <span className="font-mono">{remainingDebtAmount.toLocaleString('vi-VN')} đ</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={totalQuantity === 0 || !watchWarehouseId || isSubmitting}
            className={`w-full py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-md active:scale-98 cursor-pointer shrink-0 ${
              totalQuantity > 0 && watchWarehouseId && !isSubmitting
                ? 'bg-gradient-to-r from-orange-500 via-[#ff4b16] to-[#e03e0e] text-white shadow-orange-500/30 hover:brightness-105'
                : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
            }`}
          >
            <PackagePlus className="w-4 h-4" />
            <span>{isSubmitting ? 'Đang ghi phiếu, quỹ và IMEI...' : `Xác Nhận & Nhập Kho (${totalQuantity} máy)`}</span>
          </button>
        </div>
      </form>

      <CreatePartnerModal
        isOpen={isCreateSupplierModalOpen}
        onClose={() => setIsCreateSupplierModalOpen(false)}
        branchId={watchBranchId}
        onSavePartner={async (newPartner) => {
          if (onAddPartner) {
            await onAddPartner({ ...newPartner, type: 'SUPPLIER', branchId: watchBranchId });
          }
          setValue('supplierId', newPartner.id);
          setIsCreateSupplierModalOpen(false);
        }}
        defaultType="SUPPLIER"
      />
    </div>
  );
};
