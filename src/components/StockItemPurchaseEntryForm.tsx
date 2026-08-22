import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Coins, CreditCard, PackagePlus, Search, Trash2, Wrench, X } from 'lucide-react';
import { FundAccount, MasterCatalogItem, Partner, PurchaseOrder, StoreBranch, UserAccount, WarehouseInfo } from '../types';
import { catalogApi } from '../services/catalogApiClient';
import { isWarehouseActive } from '../utils/warehouseLifecycle';

type DraftLine = {
  key: string;
  catalogItemId: string;
  quantity: number;
  unitCost: number;
};

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

/** Supplier receipt for parts and accessories.  It uses the same Purchase
 * Order posting endpoint as device receipts, so stock, supplier debt and the
 * selected cash/bank fund succeed or fail as one operation. */
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
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suppliers = useMemo(() => partners.filter(partner => partner.type === 'SUPPLIER' || partner.type === 'BOTH'), [partners]);
  const activeWarehouses = useMemo(() => warehouses.filter(warehouse => warehouse.branchId === branchId && isWarehouseActive(warehouse)), [warehouses, branchId]);
  const selectedWarehouse = activeWarehouses.find(warehouse => warehouse.id === warehouseId);
  const selectedItems = useMemo(() => new Map(catalog.map(item => [item.id, item])), [catalog]);
  const visibleCatalog = useMemo(() => catalog.filter(item => searchable(item, query)), [catalog, query]);
  const total = useMemo(() => lines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity || 0)) * Math.max(0, Number(line.unitCost || 0)), 0), [lines]);
  const debt = Math.max(0, total - (payment === 'DEBT' ? 0 : Math.min(total, Number(paidAmount || 0))));
  const matchingFunds = useMemo(() => funds.filter(fund => fund.branchId === branchId && fund.isArchived !== true && fund.isActive !== false && fund.type === payment), [funds, branchId, payment]);

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
    if (!isOpen) return;
    const initialBranch = currentUser?.branchId || branches[0]?.id || '';
    setBranchId(initialBranch);
    setWarehouseId('');
    setSupplierId(suppliers[0]?.id || '');
    setPayment('DEBT');
    setFundId('');
    setPaidAmount(0);
    setLines([]);
    setQuery('');
    setError(null);
    void loadCatalog();
  }, [isOpen]);

  useEffect(() => {
    if (!activeWarehouses.some(warehouse => warehouse.id === warehouseId)) setWarehouseId(activeWarehouses[0]?.id || '');
  }, [activeWarehouses, warehouseId]);

  useEffect(() => {
    const first = matchingFunds[0]?.id || '';
    if (!matchingFunds.some(fund => fund.id === fundId)) setFundId(first);
  }, [matchingFunds, fundId]);

  useEffect(() => {
    if (payment !== 'DEBT') setPaidAmount(total);
    else setPaidAmount(0);
  }, [payment, total]);

  if (!isOpen) return null;

  const addItem = (item: MasterCatalogItem) => {
    setLines(current => {
      const existing = current.find(line => line.catalogItemId === item.id);
      if (existing) return current.map(line => line.catalogItemId === item.id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, { key: `${item.id}-${Date.now()}`, catalogItemId: item.id, quantity: 1, unitCost: Number(item.defaultImportPrice || 0) }];
    });
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line));

  const submit = async () => {
    const supplier = suppliers.find(item => item.id === supplierId);
    const branch = branches.find(item => item.id === branchId);
    if (!supplier || !branch || !selectedWarehouse) {
      setError('Hãy chọn đủ chi nhánh, kho nhận và nhà cung cấp.');
      return;
    }
    if (!lines.length) {
      setError('Hãy chọn ít nhất một linh kiện hoặc phụ kiện để nhập.');
      return;
    }
    const resolved = lines.map(line => ({ line, item: selectedItems.get(line.catalogItemId) })).filter((entry): entry is { line: DraftLine; item: MasterCatalogItem } => Boolean(entry.item));
    if (resolved.length !== lines.length || resolved.some(entry => !Number.isInteger(entry.line.quantity) || entry.line.quantity <= 0 || !Number.isSafeInteger(entry.line.unitCost) || entry.line.unitCost < 0)) {
      setError('Số lượng phải là số nguyên dương, giá nhập là số tiền hợp lệ.');
      return;
    }
    if (resolved.some(entry => entry.item.category === 'PART') && selectedWarehouse.type !== 'CENTRAL') {
      setError('Linh kiện từ nhà cung cấp phải nhập vào Kho tổng. Sau đó Kho tổng điều phối sang kho KTV.');
      return;
    }
    const actualPaid = payment === 'DEBT' ? 0 : Math.min(total, Number(paidAmount || 0));
    const fund = actualPaid > 0 ? matchingFunds.find(item => item.id === fundId) : null;
    if (actualPaid > 0 && !fund) {
      setError('Chọn đúng quỹ tiền mặt hoặc tài khoản ngân hàng nhận/chi của chi nhánh.');
      return;
    }
    const now = new Date();
    const order: PurchaseOrder = {
      id: `PO-STOCK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      code: 'SERVER_GENERATED',
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierPhone: supplier.phone,
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
      items: resolved.map(({ line, item }, index) => ({
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
        expectedSellPrice: Number(item.defaultRetailPrice || 0),
        totalAmount: Number(line.quantity) * Number(line.unitCost)
      })),
      totalQuantity: resolved.reduce((sum, entry) => sum + Number(entry.line.quantity), 0),
      subTotal: total,
      totalAmount: total,
      paidAmount: actualPaid,
      debtAmount: debt,
      notes: 'Nhập linh kiện/phụ kiện từ Danh mục hàng hóa'
    };
    try {
      setSubmitting(true);
      setError(null);
      await onAddPurchaseOrder(order, true);
      onClose();
    } catch (submitError: any) {
      setError(submitError?.message || 'Không thể tạo phiếu nhập. Dữ liệu chưa được ghi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex h-[100dvh] w-screen items-end bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-5">
      <div className="flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-zinc-50 shadow-2xl sm:max-h-[92vh] sm:rounded-3xl">
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-950 px-4 py-3 text-white sm:px-5">
          <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500"><PackagePlus className="h-5 w-5" /></span><div><h2 className="text-sm font-black">Nhập linh kiện &amp; phụ kiện</h2><p className="text-[10px] text-zinc-400">Tạo phiếu nhập NCC và cộng tồn vào kho đã chọn</p></div></div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-zinc-300 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</div>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-bold text-zinc-700">Chi nhánh<select value={branchId} onChange={event => setBranchId(event.target.value)} disabled={currentUser?.role !== 'ADMIN'} className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold"><option value="">Chọn chi nhánh</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label className="text-xs font-bold text-zinc-700">Kho nhận<select value={warehouseId} onChange={event => setWarehouseId(event.target.value)} className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold"><option value="">Chọn kho</option>{activeWarehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.type === 'CENTRAL' ? ' · Kho tổng' : ''}</option>)}</select></label>
            <label className="text-xs font-bold text-zinc-700">Nhà cung cấp<select value={supplierId} onChange={event => setSupplierId(event.target.value)} className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold"><option value="">Chọn nhà cung cấp</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2"><p className="text-[10px] font-bold uppercase text-orange-700">Tổng phiếu nhập</p><p className="mt-0.5 text-lg font-black text-orange-700">{money(total)} ₫</p></div>
          </div>

          <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-black text-zinc-900">Chọn hàng cần nhập</h3><p className="text-[11px] text-zinc-500">Gõ tên hoặc SKU, sau đó chạm để thêm vào phiếu.</p></div><form onSubmit={event => { event.preventDefault(); void loadCatalog(query); }} className="flex gap-2"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm mã hàng..." className="w-48 rounded-xl border border-zinc-200 py-2 pl-8 pr-2 text-xs font-semibold outline-none focus:border-orange-500" /></div><button className="rounded-xl border border-zinc-200 px-3 text-xs font-bold text-zinc-700">{loadingCatalog ? 'Đang tải' : 'Tìm'}</button></form></div>
            <div className="mt-3 grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {visibleCatalog.map(item => <button type="button" key={item.id} onClick={() => addItem(item)} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-zinc-200 p-2 text-left hover:border-orange-300 hover:bg-orange-50"><div className="min-w-0"><span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${item.category === 'PART' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>{item.category === 'PART' ? 'Linh kiện' : 'Phụ kiện'}</span><p className="mt-1 truncate text-xs font-bold text-zinc-800">{item.name}</p><p className="truncate font-mono text-[10px] text-zinc-500">{item.sku}</p></div><span className="shrink-0 rounded-lg bg-zinc-950 px-2 py-1 text-[10px] font-black text-white">Thêm</span></button>)}
              {!loadingCatalog && visibleCatalog.length === 0 && <p className="col-span-full py-5 text-center text-xs text-zinc-500">Chưa có SKU linh kiện/phụ kiện phù hợp. Hãy tạo mã hàng trước trong Danh mục.</p>}
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-zinc-200 bg-white"><div className="border-b border-zinc-100 px-3 py-2"><h3 className="text-sm font-black text-zinc-900">Hàng trên phiếu ({lines.length})</h3></div><div className="divide-y divide-zinc-100">{lines.map(line => { const item = selectedItems.get(line.catalogItemId); if (!item) return null; return <div key={line.key} className="grid grid-cols-[1fr_72px_100px_34px] items-center gap-2 p-3"><div className="min-w-0"><p className="truncate text-xs font-bold text-zinc-800">{item.name}</p><p className="font-mono text-[10px] text-zinc-500">{item.sku} · {item.category === 'PART' ? 'Linh kiện' : 'Phụ kiện'}</p></div><input aria-label={`Số lượng ${item.name}`} type="number" min="1" value={line.quantity} onChange={event => updateLine(line.key, { quantity: Number(event.target.value) })} className="w-full rounded-lg border border-zinc-200 px-2 py-2 text-right text-xs font-bold" /><input aria-label={`Giá nhập ${item.name}`} type="number" min="0" value={line.unitCost} onChange={event => updateLine(line.key, { unitCost: Number(event.target.value) })} className="w-full rounded-lg border border-zinc-200 px-2 py-2 text-right text-xs font-bold" /><button type="button" onClick={() => setLines(current => current.filter(itemLine => itemLine.key !== line.key))} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></div>; })}{!lines.length && <p className="p-5 text-center text-xs text-zinc-500">Chưa chọn hàng.</p>}</div></section>

          <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPayment('DEBT')} className={`rounded-xl px-3 py-2 text-xs font-bold ${payment === 'DEBT' ? 'bg-zinc-950 text-white' : 'border border-zinc-200 text-zinc-600'}`}><Building2 className="mr-1 inline h-3.5 w-3.5" />Ghi nợ NCC</button><button type="button" onClick={() => setPayment('CASH')} className={`rounded-xl px-3 py-2 text-xs font-bold ${payment === 'CASH' ? 'bg-orange-600 text-white' : 'border border-zinc-200 text-zinc-600'}`}><Coins className="mr-1 inline h-3.5 w-3.5" />Tiền mặt</button><button type="button" onClick={() => setPayment('BANK')} className={`rounded-xl px-3 py-2 text-xs font-bold ${payment === 'BANK' ? 'bg-sky-600 text-white' : 'border border-zinc-200 text-zinc-600'}`}><CreditCard className="mr-1 inline h-3.5 w-3.5" />Chuyển khoản</button></div>{payment !== 'DEBT' && <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"><select value={fundId} onChange={event => setFundId(event.target.value)} className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold"><option value="">Chọn quỹ/tài khoản</option>{matchingFunds.map(fund => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select><input type="number" value={paidAmount} min="0" max={total} onChange={event => setPaidAmount(Number(event.target.value))} className="rounded-xl border border-zinc-200 px-3 py-2 text-right text-xs font-bold" /></div>}<div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs"><span className="font-bold text-zinc-500">Còn nợ NCC</span><span className="font-black text-rose-600">{money(debt)} ₫</span></div></section>
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-white p-4"><div className="hidden text-xs text-zinc-500 sm:block">Linh kiện phải vào Kho tổng trước; phụ kiện vào kho đã chọn.</div><button type="button" disabled={submitting || !lines.length} onClick={() => void submit()} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-xs font-black text-white shadow-sm hover:bg-orange-700 disabled:opacity-50">{submitting ? 'Đang lưu phiếu…' : <><CheckCircle2 className="h-4 w-4" />Xác nhận nhập hàng</>}</button></footer>
      </div>
    </div>
  );
};
