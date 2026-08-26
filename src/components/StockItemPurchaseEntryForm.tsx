import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, Coins, CreditCard, PackagePlus, Search, Trash2, X } from 'lucide-react';
import { FundAccount, MasterCatalogItem, Partner, PurchaseOrder, StoreBranch, UserAccount, WarehouseInfo } from '../types';
import { catalogApi } from '../services/catalogApiClient';
import { isWarehouseActive } from '../utils/warehouseLifecycle';
import { HelpHint } from './HelpHint';
import { browserDraftKey, readBrowserDraft, removeBrowserDraft, writeBrowserDraft } from '../utils/browserDraft';

type DraftLine = {
  key: string;
  catalogItemId: string;
  quantity: number;
  unitCost: number;
  retailPrice: number;
};

type ReceiptStep = 'CONTEXT' | 'ITEMS' | 'PAYMENT' | 'REVIEW';

type StockReceiptDraft = {
  branchId: string;
  warehouseId: string;
  supplierId: string;
  payment: 'CASH' | 'BANK' | 'DEBT';
  fundId: string;
  paidAmount: number;
  notes: string;
  lines: DraftLine[];
  step: ReceiptStep;
  query: string;
  selectedCatalog: MasterCatalogItem[];
  isCustomPaid: boolean;
};

const RECEIPT_STEPS: Array<{ id: ReceiptStep; short: string; label: string }> = [
  { id: 'CONTEXT', short: '1', label: 'Thông tin' },
  { id: 'ITEMS', short: '2', label: 'SKU & giá' },
  { id: 'PAYMENT', short: '3', label: 'Thanh toán' },
  { id: 'REVIEW', short: '4', label: 'Kiểm tra' }
];

interface StockItemPurchaseEntryFormProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserAccount | null;
  partners: Partner[];
  branches: StoreBranch[];
  warehouses: WarehouseInfo[];
  funds: FundAccount[];
  onAddPurchaseOrder: (order: PurchaseOrder, postToInventory: boolean) => Promise<PurchaseOrder | void> | PurchaseOrder | void;
}

const money = (value: number) => new Intl.NumberFormat('vi-VN').format(Number(value || 0));

const searchable = (item: MasterCatalogItem, query: string) => {
  const normalized = query.trim().toLocaleLowerCase('vi');
  if (!normalized) return true;
  return [item.sku, item.name, item.model, item.posShortName, ...(item.aliases || [])]
    .some(value => String(value || '').toLocaleLowerCase('vi').includes(normalized));
};

/**
 * Full supplier-receipt flow for quantity-based goods. The final action uses
 * the same server Purchase Order transaction as device receipts: stock,
 * supplier debt and the selected fund are posted together or not at all.
 */
export const StockItemPurchaseEntryForm: React.FC<StockItemPurchaseEntryFormProps> = ({
  isOpen, onClose, currentUser, partners, branches, warehouses, funds, onAddPurchaseOrder
}) => {
  const [catalog, setCatalog] = useState<MasterCatalogItem[]>([]);
  const [query, setQuery] = useState('');
  const [branchId, setBranchId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [payment, setPayment] = useState<'CASH' | 'BANK' | 'DEBT'>('DEBT');
  const [fundId, setFundId] = useState('');
  const [paidAmount, setPaidAmount] = useState(0);
  const [isCustomPaid, setIsCustomPaid] = useState(false);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [step, setStep] = useState<ReceiptStep>('CONTEXT');
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const receiptDraftKey = browserDraftKey('purchase-stock', currentUser?.id, currentUser?.branchId);
  const wasOpenRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const skipPaymentSyncRef = useRef(false);

  const suppliers = useMemo(() => partners.filter(partner => partner.type === 'SUPPLIER' || partner.type === 'BOTH'), [partners]);
  const activeWarehouses = useMemo(() => warehouses.filter(warehouse => warehouse.branchId === branchId && isWarehouseActive(warehouse)), [warehouses, branchId]);
  const selectedItems = useMemo(() => new Map(catalog.map(item => [item.id, item])), [catalog]);
  const visibleCatalog = useMemo(() => catalog.filter(item => searchable(item, query)), [catalog, query]);
  const resolvedLines = useMemo(() => lines.map(line => ({ line, item: selectedItems.get(line.catalogItemId) }))
    .filter((entry): entry is { line: DraftLine; item: MasterCatalogItem } => Boolean(entry.item)), [lines, selectedItems]);
  const hasPartLine = useMemo(() => resolvedLines.some(({ item }) => item.category === 'PART'), [resolvedLines]);
  const receiptWarehouses = useMemo(() => activeWarehouses.filter(warehouse => !hasPartLine || warehouse.type === 'CENTRAL'), [activeWarehouses, hasPartLine]);
  const selectedWarehouse = receiptWarehouses.find(warehouse => warehouse.id === warehouseId);
  const total = useMemo(() => lines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity || 0)) * Math.max(0, Number(line.unitCost || 0)), 0), [lines]);
  const debt = Math.max(0, total - (payment === 'DEBT' ? 0 : Math.min(total, Number(paidAmount || 0))));
  const matchingFunds = useMemo(() => funds.filter(fund => fund.branchId === branchId && fund.isArchived !== true && fund.isActive !== false && fund.type === payment), [funds, branchId, payment]);
  const currentStepIndex = RECEIPT_STEPS.findIndex(item => item.id === step);
  const selectedSupplier = suppliers.find(item => item.id === supplierId);
  const lineDataValid = resolvedLines.length === lines.length && lines.length > 0 && resolvedLines.every(({ line }) =>
    Number.isInteger(line.quantity) && line.quantity > 0 &&
    Number.isSafeInteger(line.unitCost) && line.unitCost >= 0 &&
    Number.isSafeInteger(line.retailPrice) && line.retailPrice >= 0
  );
  const contextValid = Boolean(branchId && selectedWarehouse && selectedSupplier);
  const paymentValid = payment === 'DEBT' || (Number(paidAmount) >= 0 && Number(paidAmount) <= total && (Number(paidAmount) === 0 || matchingFunds.some(item => item.id === fundId)));

  const loadCatalog = async (search = '') => {
    setLoadingCatalog(true);
    setError(null);
    try {
      const [parts, accessories] = await Promise.all([
        catalogApi.listItems({ kind: 'PART', search: search || undefined, activeOnly: true, limit: 80 }),
        catalogApi.listItems({ kind: 'ACCESSORY', search: search || undefined, activeOnly: true, limit: 80 })
      ]);
      const all = [...parts.items, ...accessories.items];
      setCatalog(current => {
        const map = new Map(current.map(item => [item.id, item]));
        all.forEach(item => map.set(item.id, item));
        return [...map.values()];
      });
    } catch (requestError: any) {
      setError(requestError?.message || 'Không tải được danh mục linh kiện/phụ kiện.');
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      draftHydratedRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    draftHydratedRef.current = false;

    const initialBranch = currentUser?.branchId || '';
    const saved = readBrowserDraft<StockReceiptDraft>(receiptDraftKey);
    setBranchId(saved?.branchId || initialBranch);
    setWarehouseId(saved?.warehouseId || '');
    setSupplierId(saved?.supplierId || suppliers[0]?.id || '');
    setPayment(saved?.payment || 'DEBT');
    setFundId(saved?.fundId || '');
    setPaidAmount(Number(saved?.paidAmount || 0));
    setIsCustomPaid(saved?.isCustomPaid === true);
    setNotes(saved?.notes || '');
    setLines(Array.isArray(saved?.lines) ? saved.lines : []);
    setQuery(saved?.query || '');
    setStep(saved?.step || 'CONTEXT');
    setCatalog(Array.isArray(saved?.selectedCatalog) ? saved.selectedCatalog : []);
    setError(null);
    setSubmitting(false);
    skipPaymentSyncRef.current = true;
    draftHydratedRef.current = true;
    void loadCatalog(saved?.query || '');
  }, [isOpen, receiptDraftKey]);

  useEffect(() => {
    if (!warehouses.length) return;
    if (!receiptWarehouses.some(warehouse => warehouse.id === warehouseId)) setWarehouseId(receiptWarehouses[0]?.id || '');
  }, [receiptWarehouses, warehouseId, warehouses.length]);

  useEffect(() => {
    if (!suppliers.length) return;
    if (!suppliers.some(supplier => supplier.id === supplierId)) setSupplierId(suppliers[0]?.id || '');
  }, [supplierId, suppliers]);

  useEffect(() => {
    if (!funds.length) return;
    const first = matchingFunds[0]?.id || '';
    if (!matchingFunds.some(fund => fund.id === fundId)) setFundId(first);
  }, [matchingFunds, fundId, funds.length]);

  useEffect(() => {
    if (skipPaymentSyncRef.current) {
      skipPaymentSyncRef.current = false;
      return;
    }
    if (payment === 'DEBT') {
      setPaidAmount(0);
      setIsCustomPaid(false);
    } else if (!isCustomPaid) {
      setPaidAmount(total);
    }
  }, [isCustomPaid, payment, total]);

  useEffect(() => {
    if (!isOpen || !draftHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      const selectedIds = new Set(lines.map(line => line.catalogItemId));
      writeBrowserDraft<StockReceiptDraft>(receiptDraftKey, {
        branchId,
        warehouseId,
        supplierId,
        payment,
        fundId,
        paidAmount,
        notes,
        lines,
        step,
        query,
        selectedCatalog: catalog.filter(item => selectedIds.has(item.id)),
        isCustomPaid
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [branchId, catalog, fundId, isCustomPaid, isOpen, lines, notes, paidAmount, payment, query, receiptDraftKey, step, supplierId, warehouseId]);

  if (!isOpen) return null;

  const addItem = (item: MasterCatalogItem) => {
    setLines(current => {
      const existing = current.find(line => line.catalogItemId === item.id);
      if (existing) return current.map(line => line.catalogItemId === item.id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, {
        key: `${item.id}-${Date.now()}`,
        catalogItemId: item.id,
        quantity: 1,
        unitCost: Number(item.defaultImportPrice || 0),
        retailPrice: Number(item.defaultRetailPrice || 0)
      }];
    });
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line));

  const discardDraft = () => {
    draftHydratedRef.current = false;
    skipPaymentSyncRef.current = true;
    removeBrowserDraft(receiptDraftKey);
    const initialBranch = currentUser?.branchId || '';
    setBranchId(initialBranch);
    setWarehouseId('');
    setSupplierId(suppliers[0]?.id || '');
    setPayment('DEBT');
    setFundId('');
    setPaidAmount(0);
    setIsCustomPaid(false);
    setNotes('');
    setLines([]);
    setQuery('');
    setStep('CONTEXT');
    setError(null);
    window.setTimeout(() => { draftHydratedRef.current = true; }, 0);
  };

  const validateStep = (target: ReceiptStep): boolean => {
    if (target === 'CONTEXT' && !contextValid) {
      setError('Hãy chọn đủ chi nhánh, kho nhận và nhà cung cấp.');
      return false;
    }
    if (target === 'ITEMS' && !lineDataValid) {
      setError('Hãy chọn ít nhất một SKU và điền đúng số lượng, giá nhập, giá bán dự kiến.');
      return false;
    }
    if (target === 'PAYMENT' && !paymentValid) {
      setError(payment === 'DEBT' ? 'Kiểm tra lại phương thức thanh toán.' : 'Chọn quỹ/tài khoản và số tiền thanh toán hợp lệ.');
      return false;
    }
    return true;
  };

  const moveToNext = () => {
    const currentTarget = step === 'CONTEXT' ? 'CONTEXT' : step === 'ITEMS' ? 'ITEMS' : 'PAYMENT';
    if (!validateStep(currentTarget)) return;
    const next = RECEIPT_STEPS[currentStepIndex + 1];
    if (next) {
      setError(null);
      setStep(next.id);
    }
  };

  const submit = async () => {
    if (!validateStep('CONTEXT') || !validateStep('ITEMS') || !validateStep('PAYMENT') || !selectedSupplier || !selectedWarehouse) return;
    if (hasPartLine && selectedWarehouse.type !== 'CENTRAL') {
      setError('Linh kiện từ nhà cung cấp phải nhập vào Kho Tổng. Sau đó Kho Tổng điều phối sang kho KTV.');
      return;
    }
    const actualPaid = payment === 'DEBT' ? 0 : Math.min(total, Number(paidAmount || 0));
    const fund = actualPaid > 0 ? matchingFunds.find(item => item.id === fundId) : null;
    if (actualPaid > 0 && !fund) {
      setError('Chọn đúng quỹ tiền mặt hoặc tài khoản ngân hàng để chi phiếu nhập.');
      return;
    }
    const branch = branches.find(item => item.id === branchId);
    if (!branch) {
      setError('Không xác định được chi nhánh của phiếu nhập.');
      return;
    }
    const now = new Date();
    const order: PurchaseOrder = {
      id: `PO-STOCK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      code: 'SERVER_GENERATED',
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      supplierPhone: selectedSupplier.phone,
      branchId: branch.id,
      branchName: branch.name,
      warehouseId: selectedWarehouse.id,
      warehouseName: selectedWarehouse.name,
      orderDate: now.toISOString().slice(0, 10),
      creatorName: currentUser?.displayName || 'Hệ thống',
      status: 'COMPLETED',
      paymentStatus: actualPaid >= total ? 'PAID' : actualPaid > 0 ? 'PARTIAL' : 'UNPAID',
      paymentMethod: payment === 'CASH' ? 'Tiền mặt tại két' : payment === 'BANK' ? 'Chuyển khoản VietQR' : 'Ghi nhận công nợ NCC',
      ...(fund ? { fundId: fund.id, fundName: fund.name } : {}),
      items: resolvedLines.map(({ line, item }, index) => ({
        id: `POI-STOCK-${Date.now()}-${index + 1}`,
        type: 'product' as const,
        catalogItemId: item.id,
        catalogCategory: item.category as 'PART' | 'ACCESSORY',
        catalogGroupCode: item.catalogGroupCode || item.categoryCode,
        catalogModelId: item.modelId,
        catalogModelCode: item.modelCode,
        sku: item.sku,
        modelOrName: item.name,
        compatibleModels: item.compatibleModels || [],
        quantity: Number(line.quantity),
        importPrice: Number(line.unitCost),
        expectedSellPrice: Number(line.retailPrice),
        totalAmount: Number(line.quantity) * Number(line.unitCost)
      })),
      totalQuantity: resolvedLines.reduce((sum, entry) => sum + Number(entry.line.quantity), 0),
      subTotal: total,
      totalAmount: total,
      paidAmount: actualPaid,
      debtAmount: debt,
      notes: notes.trim() || 'Nhập linh kiện/phụ kiện từ Danh mục hàng hóa'
    };
    try {
      setSubmitting(true);
      setError(null);
      await onAddPurchaseOrder(order, true);
      removeBrowserDraft(receiptDraftKey);
      onClose();
    } catch (submitError: any) {
      setError(submitError?.message || 'Không thể tạo phiếu nhập. Dữ liệu chưa được ghi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-ph-fullscreen-form className="fixed inset-0 z-[110] flex h-[100dvh] w-screen bg-black/60 p-0 backdrop-blur-sm">
      <div className="flex h-[100dvh] w-full max-w-none flex-col overflow-hidden rounded-none bg-zinc-50 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-zinc-950 px-4 py-3 text-white sm:px-5">
          <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500"><PackagePlus className="h-5 w-5" /></span><div className="flex min-w-0 items-center gap-2"><h2 className="truncate text-sm font-black sm:text-base">Nhập linh kiện &amp; phụ kiện</h2><HelpHint title="Phiếu nhập nhà cung cấp">Phiếu này dùng SKU có sẵn từ Danh mục. Khi bấm xác nhận, máy chủ kiểm tra rồi ghi phiếu nhập, tồn kho, công nợ nhà cung cấp và quỹ cùng một lần.</HelpHint></div></div>
          <div className="flex shrink-0 items-center gap-1.5"><span className="hidden text-[10px] font-bold text-emerald-300 sm:inline">Tự lưu nháp</span><button type="button" onClick={discardDraft} title="Xóa toàn bộ dữ liệu nháp" className="rounded-xl p-2 text-zinc-300 hover:bg-rose-950/70 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button><button type="button" onClick={onClose} className="rounded-xl p-2 text-zinc-300 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button></div>
        </header>

        <nav aria-label="Các bước nhập hàng" className="flex gap-1 overflow-x-auto border-b bg-white p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {RECEIPT_STEPS.map((item, index) => {
            const active = item.id === step;
            const complete = index < currentStepIndex;
            return <button key={item.id} type="button" onClick={() => { if (index <= currentStepIndex) { setError(null); setStep(item.id); } }} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-black ${active ? 'bg-orange-600 text-white' : complete ? 'bg-emerald-50 text-emerald-700' : 'text-zinc-400'}`}><span className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] ${active ? 'bg-white/20' : complete ? 'bg-emerald-100' : 'bg-zinc-100'}`}>{complete ? '✓' : item.short}</span>{item.label}</button>;
          })}
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto px-0 py-3 sm:p-5">
          {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700">{error}</div>}

          {step === 'CONTEXT' && <section className="w-full space-y-4 px-3 sm:px-0">
            <div><h3 className="text-lg font-black text-zinc-900">Thông tin phiếu nhập</h3><p className="mt-1 text-xs text-zinc-500">Chọn nơi nhận hàng và nhà cung cấp trước khi chọn SKU.</p></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs font-bold text-zinc-700">Chi nhánh<select value={branchId} onChange={event => setBranchId(event.target.value)} disabled={currentUser?.role !== 'ADMIN'} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold"><option value="">Chọn chi nhánh</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
              <label className="text-xs font-bold text-zinc-700">Kho nhận<select value={warehouseId} onChange={event => setWarehouseId(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold"><option value="">Chọn kho</option>{receiptWarehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.type === 'CENTRAL' ? ' · Kho Tổng' : ''}</option>)}</select></label>
              <label className="text-xs font-bold text-zinc-700">Nhà cung cấp<select value={supplierId} onChange={event => setSupplierId(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold"><option value="">Chọn nhà cung cấp</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
            </div>
            <label className="block text-xs font-bold text-zinc-700">Ghi chú phiếu<textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm font-medium" placeholder="Ví dụ: Hóa đơn NCC, điều kiện bảo hành, ghi chú giao nhận..." /></label>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-xs leading-5 text-sky-900"><b>Quy tắc kho:</b> Linh kiện nhập từ nhà cung cấp phải vào Kho Tổng. Phụ kiện có thể nhận trực tiếp vào kho bán lẻ.</div>
          </section>}

          {step === 'ITEMS' && <section className="w-full space-y-4 px-3 sm:px-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-lg font-black text-zinc-900">Chọn SKU, số lượng và giá</h3><p className="mt-1 text-xs text-zinc-500">SKU chỉ được lấy từ Danh mục hàng hóa. Giá bán dự kiến có thể điều chỉnh cho từng dòng.</p></div><div className="rounded-xl bg-orange-50 px-3 py-2 text-right"><p className="text-[10px] font-black uppercase text-orange-700">Tổng nhập</p><p className="text-lg font-black text-orange-700">{money(total)} ₫</p></div></div>
            <section className="rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><h4 className="text-sm font-black text-zinc-900">Tìm mã hàng</h4><HelpHint title="Chọn SKU">Gõ tên, SKU hoặc model. Bấm Thêm để đưa hàng vào phiếu. Không thể tự tạo SKU trong form nhập.</HelpHint></div><form onSubmit={event => { event.preventDefault(); void loadCatalog(query); }} className="flex gap-2"><label className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm SKU / tên..." className="h-10 w-52 rounded-xl border border-zinc-200 py-2 pl-8 pr-2 text-xs font-semibold outline-none focus:border-orange-500" /></label><button className="rounded-xl border border-zinc-200 px-3 text-xs font-bold text-zinc-700">{loadingCatalog ? 'Đang tải' : 'Tìm'}</button></form></div>
              <div className="mt-3 grid max-h-52 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">{visibleCatalog.map(item => <button type="button" key={item.id} onClick={() => addItem(item)} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-zinc-200 p-2.5 text-left hover:border-orange-300 hover:bg-orange-50"><div className="min-w-0"><span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${item.category === 'PART' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>{item.category === 'PART' ? 'Linh kiện' : 'Phụ kiện'}</span><p className="mt-1 truncate text-xs font-bold text-zinc-800">{item.name}</p><p className="truncate font-mono text-[10px] text-zinc-500">{item.sku}</p></div><span className="shrink-0 rounded-lg bg-zinc-950 px-2 py-1 text-[10px] font-black text-white">Thêm</span></button>)}{!loadingCatalog && visibleCatalog.length === 0 && <p className="col-span-full py-5 text-center text-xs text-zinc-500">Chưa có SKU linh kiện/phụ kiện phù hợp. Hãy tạo mã hàng trước trong Danh mục.</p>}</div>
            </section>
            <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"><div className="flex items-center justify-between border-b border-zinc-100 px-3 py-3"><h4 className="text-sm font-black text-zinc-900">Hàng trên phiếu ({lines.length})</h4><span className="text-xs font-bold text-zinc-500">Tổng {money(total)} ₫</span></div><div className="divide-y divide-zinc-100">{lines.map(line => { const item = selectedItems.get(line.catalogItemId); if (!item) return null; return <article key={line.key} className="p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-zinc-900">{item.name}</p><p className="mt-1 font-mono text-[10px] text-zinc-500">{item.sku} · {item.category === 'PART' ? 'Linh kiện' : 'Phụ kiện'}</p></div><button type="button" onClick={() => setLines(current => current.filter(itemLine => itemLine.key !== line.key))} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></div><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3"><label className="text-[10px] font-black uppercase text-zinc-500">Số lượng<input aria-label={`Số lượng ${item.name}`} type="number" min="1" value={line.quantity} onChange={event => updateLine(line.key, { quantity: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-2 text-right text-sm font-bold" /></label><label className="text-[10px] font-black uppercase text-zinc-500">Giá nhập / đơn vị<input aria-label={`Giá nhập ${item.name}`} type="number" min="0" value={line.unitCost} onChange={event => updateLine(line.key, { unitCost: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-2 text-right text-sm font-bold" /></label><label className="text-[10px] font-black uppercase text-zinc-500">Giá bán dự kiến<input aria-label={`Giá bán dự kiến ${item.name}`} type="number" min="0" value={line.retailPrice} onChange={event => updateLine(line.key, { retailPrice: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-xl border border-zinc-200 px-2 text-right text-sm font-bold" /></label></div><p className="mt-2 text-right text-xs font-bold text-zinc-500">Thành tiền: <span className="text-zinc-900">{money(Number(line.quantity) * Number(line.unitCost))} ₫</span></p></article>; })}{!lines.length && <p className="p-8 text-center text-xs text-zinc-500">Chưa chọn hàng.</p>}</div></section>
            {hasPartLine && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-800">Phiếu có linh kiện: kho nhận sẽ được giới hạn là Kho Tổng để bảo đảm luồng cấp phát cho KTV.</div>}
          </section>}

          {step === 'PAYMENT' && <section className="w-full space-y-4 px-3 sm:px-0"><div><h3 className="text-lg font-black text-zinc-900">Thanh toán &amp; công nợ</h3><p className="mt-1 text-xs text-zinc-500">Chọn một nguồn tiền để chi ngay hoặc để toàn bộ số tiền thành công nợ nhà cung cấp.</p></div><section className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setPayment('DEBT'); setIsCustomPaid(false); }} className={`rounded-xl px-3 py-2.5 text-xs font-bold ${payment === 'DEBT' ? 'bg-zinc-950 text-white' : 'border border-zinc-200 text-zinc-600'}`}><Building2 className="mr-1 inline h-3.5 w-3.5" />Ghi nợ NCC</button><button type="button" onClick={() => { setPayment('CASH'); setIsCustomPaid(false); }} className={`rounded-xl px-3 py-2.5 text-xs font-bold ${payment === 'CASH' ? 'bg-orange-600 text-white' : 'border border-zinc-200 text-zinc-600'}`}><Coins className="mr-1 inline h-3.5 w-3.5" />Tiền mặt</button><button type="button" onClick={() => { setPayment('BANK'); setIsCustomPaid(false); }} className={`rounded-xl px-3 py-2.5 text-xs font-bold ${payment === 'BANK' ? 'bg-sky-600 text-white' : 'border border-zinc-200 text-zinc-600'}`}><CreditCard className="mr-1 inline h-3.5 w-3.5" />Chuyển khoản</button></div>{payment !== 'DEBT' && <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs font-black text-zinc-600">Quỹ / tài khoản chi<select value={fundId} onChange={event => setFundId(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold"><option value="">Chọn quỹ/tài khoản</option>{matchingFunds.map(fund => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></label><label className="text-xs font-black text-zinc-600">Số tiền thanh toán<input type="number" value={paidAmount} min="0" max={total} onChange={event => { setPaidAmount(Number(event.target.value)); setIsCustomPaid(true); }} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-right text-sm font-bold" /></label></div>}<div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-100 pt-4 text-center"><div><p className="text-[10px] font-black uppercase text-zinc-400">Tổng phiếu</p><p className="mt-1 text-sm font-black text-zinc-900">{money(total)} ₫</p></div><div><p className="text-[10px] font-black uppercase text-zinc-400">Chi ngay</p><p className="mt-1 text-sm font-black text-emerald-700">{money(payment === 'DEBT' ? 0 : paidAmount)} ₫</p></div><div><p className="text-[10px] font-black uppercase text-zinc-400">Còn nợ</p><p className="mt-1 text-sm font-black text-rose-600">{money(debt)} ₫</p></div></div></section></section>}

          {step === 'REVIEW' && <section className="w-full space-y-4 px-3 sm:px-0"><div><h3 className="text-lg font-black text-zinc-900">Kiểm tra trước khi nhập kho</h3><p className="mt-1 text-xs text-zinc-500">Đây là lần kiểm tra cuối. Khi xác nhận, hệ thống sẽ ghi toàn bộ chứng từ trong một giao dịch.</p></div><section className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-[10px] font-black uppercase text-zinc-400">Nhà cung cấp</p><p className="mt-1 font-black text-zinc-900">{selectedSupplier?.name || '—'}</p></div><div><p className="text-[10px] font-black uppercase text-zinc-400">Kho nhận</p><p className="mt-1 font-black text-zinc-900">{selectedWarehouse?.name || '—'}</p></div><div><p className="text-[10px] font-black uppercase text-zinc-400">Số dòng / số lượng</p><p className="mt-1 font-black text-zinc-900">{lines.length} SKU · {resolvedLines.reduce((sum, entry) => sum + Number(entry.line.quantity), 0)} đơn vị</p></div><div><p className="text-[10px] font-black uppercase text-zinc-400">Thanh toán</p><p className="mt-1 font-black text-zinc-900">{payment === 'DEBT' ? 'Ghi nhận công nợ NCC' : `${payment === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'} · ${money(paidAmount)} ₫`}</p></div></div><div className="mt-4 divide-y rounded-xl border border-zinc-100">{resolvedLines.map(({ line, item }) => <div key={line.key} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"><div className="min-w-0"><p className="truncate font-black text-zinc-900">{item.name}</p><p className="font-mono text-[10px] text-zinc-500">{item.sku} · SL {line.quantity} · Bán {money(line.retailPrice)} ₫</p></div><p className="shrink-0 font-black text-zinc-900">{money(line.quantity * line.unitCost)} ₫</p></div>)}</div><div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-4"><span className="text-sm font-bold text-zinc-500">Tổng giá trị phiếu</span><span className="text-xl font-black text-orange-700">{money(total)} ₫</span></div></section></section>}
        </main>

        <footer className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-white p-3 sm:p-4"><button type="button" onClick={() => currentStepIndex === 0 ? onClose() : setStep(RECEIPT_STEPS[currentStepIndex - 1].id)} className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-black text-zinc-700"><ChevronLeft className="h-4 w-4" /> {currentStepIndex === 0 ? 'Đóng' : 'Quay lại'}</button>{step !== 'REVIEW' ? <button type="button" onClick={moveToNext} className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-xl bg-orange-600 px-4 text-sm font-black text-white shadow-sm hover:bg-orange-700">Tiếp tục <ChevronRight className="h-4 w-4" /></button> : <button type="button" disabled={submitting} onClick={() => void submit()} className="ml-auto inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">{submitting ? 'Đang ghi phiếu…' : <><CheckCircle2 className="h-4 w-4" /> Xác nhận nhập hàng</>}</button>}</footer>
      </div>
    </div>
  );
};
