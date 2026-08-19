import React, { useState, useMemo, useEffect } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { 
  Search, Check, Box, X, Store, Hash, DollarSign, Plus, Trash2, MapPin, ChevronDown,
  Building2, CreditCard, Coins, ArrowRight, ShieldCheck, QrCode, Sparkles, Smartphone,
  CheckCircle2, PackagePlus, Receipt, Layers
} from 'lucide-react';
import { 
  DeviceItem, Partner, StoreBranch, WarehouseInfo, FundAccount, PurchaseOrder, MasterCatalogItem, UserAccount
} from '../types';
import { CreatePartnerModal } from './CreatePartnerModal';

interface UniformEntryFormProps {
  isOpen: boolean;
  onClose: () => void;
  partners?: Partner[];
  branches?: StoreBranch[];
  warehouses?: WarehouseInfo[];
  funds?: FundAccount[];
  catalogItems?: MasterCatalogItem[];
  currentUser?: UserAccount | null;
  onAddPurchaseOrder?: (order: PurchaseOrder, autoCreateDevices: boolean) => void;
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
  supplierId: string;
  items: FormItem[];
  paymentMethod: 'BANK' | 'CASH' | 'DEBT';
  amountPaid: number;
}

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
  const defaultBranchId = currentUser?.branchId || branches[0]?.id || '';
  const [isCreateSupplierModalOpen, setIsCreateSupplierModalOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'CATALOG' | 'ITEMS' | 'PAYMENT'>('ITEMS');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogSeriesFilter, setCatalogSeriesFilter] = useState('ALL');

  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      branchId: defaultBranchId,
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
  const [selectedFundId, setSelectedFundId] = useState<string>('');
  
  useEffect(() => {
    const matchingFunds = funds.filter(f => f.type === watchPaymentMethod && (!f.branchId || f.branchId === watchBranchId));
    if (matchingFunds.length > 0) {
      if (!matchingFunds.find(f => f.id === selectedFundId)) {
        setSelectedFundId(matchingFunds[0].id);
      }
    } else {
      setSelectedFundId('');
    }
  }, [watchPaymentMethod, watchBranchId, funds]);

  useEffect(() => {
    if (isOpen) {
      reset({
        branchId: defaultBranchId,
        supplierId: suppliers[0]?.id || '',
        items: [{ catalogItemId: '', searchQuery: '', imeisInput: '', buyPrice: 0 }],
        paymentMethod: 'BANK',
        amountPaid: 0
      });
      setMobileTab('ITEMS');
    }
  }, [isOpen, reset, defaultBranchId]);

  const suppliers = useMemo(() => partners.filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH'), [partners]);

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

  const [isCustomPaid, setIsCustomPaid] = useState(false);

  useEffect(() => {
    if (watchPaymentMethod === 'DEBT') {
      setValue('amountPaid', 0);
      setIsCustomPaid(false);
    } else if (!isCustomPaid && (watchPaymentMethod === 'BANK' || watchPaymentMethod === 'CASH')) {
      setValue('amountPaid', totalAmount);
    }
  }, [watchPaymentMethod, totalAmount, isCustomPaid, setValue]);

  const rawAmountPaid = Number(watchAmountPaid) || 0;
  const actualPaidAmount = watchPaymentMethod === 'DEBT' ? 0 : Math.min(rawAmountPaid, totalAmount);
  const remainingDebtAmount = Math.max(0, totalAmount - actualPaidAmount);

  const filteredCatalogItems = useMemo(() => {
    const q = catalogSearch.toLowerCase().trim();
    return catalogItems.filter(item => {
      const matchQuery = !q || item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
      const matchSeries = catalogSeriesFilter === 'ALL' || item.name.includes(catalogSeriesFilter);
      return matchQuery && matchSeries;
    });
  }, [catalogItems, catalogSearch, catalogSeriesFilter]);

  const handleSelectCatalogItemForNewRow = (item: MasterCatalogItem) => {
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

  const onSubmit = (data: FormValues) => {
    if (totalQuantity === 0) {
      alert('Vui lòng nhập ít nhất 1 IMEI hợp lệ!');
      return;
    }

    const supplier = suppliers.find(s => s.id === data.supplierId);
    if (!supplier) {
      alert('Vui lòng chọn nhà cung cấp!');
      return;
    }

    const targetBranch = branches.find(b => b.id === data.branchId) || branches[0];
    const targetWarehouseId = targetBranch?.warehouseId || warehouses[0]?.id || 'KHO_TONG';
    const targetWarehouseName = warehouses.find(w => w.id === targetWarehouseId)?.name || 'Kho Tổng';

    const debtAmount = remainingDebtAmount;

    if (onAddPurchaseOrder) {
      const fund = (selectedFundId ? funds.find(f => f.id === selectedFundId) : null) || 
                   funds.find(f => f.type === data.paymentMethod) || null;
      
      const orderItems = data.items.map((item, idx) => {
        const catalogItem = catalogItems.find(c => c.id === item.catalogItemId);
        const imeis = item.imeisInput.split(/[\n,]+/).map(i => i.trim()).filter(i => i.length > 0);
        return {
          id: `POI-${Date.now()}-${idx}`,
          type: 'device' as const,
          modelOrName: catalogItem?.name || item.searchQuery || 'Thiết bị',
          color: catalogItem?.color,
          storage: catalogItem?.storage,
          condition: (catalogItem?.condition as any) || 'Like New 99%',
          region: '', 
          imeiList: imeis,
          quantity: imeis.length,
          importPrice: Number(item.buyPrice) || 0,
          expectedSellPrice: item.buyPrice * 1.1, 
          totalAmount: imeis.length * (Number(item.buyPrice) || 0)
        };
      }).filter(item => item.quantity > 0);

      const purchaseOrder: PurchaseOrder = {
        id: `PO-${Date.now()}`,
        code: `PN-${Date.now().toString().slice(-6)}`,
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierPhone: supplier.phone,
        warehouseId: targetWarehouseId,
        warehouseName: targetWarehouseName,
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
        totalQuantity: totalQuantity
      };
      
      onAddPurchaseOrder(purchaseOrder, true);
    }
    
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950/60 backdrop-blur-xs flex flex-col h-screen w-screen overflow-hidden select-none animate-in fade-in duration-200">
      
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-zinc-950 via-zinc-900 to-black text-white border-b border-zinc-800 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-orange-500 to-[#ff4b16] text-white flex items-center justify-center font-black">
            <PackagePlus className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-black tracking-tight text-white uppercase">Phiếu Nhập Hàng Kho</span>
              <span className="px-2 py-0.2 text-[10px] font-mono font-bold bg-[#ff4b16]/20 text-[#ff4b16] border border-[#ff4b16]/30 rounded-full">
                Mã: PN-{Date.now().toString().slice(-6)}
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 font-medium">
              Nhập máy theo danh sách IMEI & cập nhật giá vốn tức thì
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Đóng phiếu nhập (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="lg:hidden flex items-center p-1 bg-zinc-100 border-b border-zinc-200 text-xs font-bold shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab('CATALOG')}
          className={`flex-1 py-1.5 rounded-lg transition-all ${
            mobileTab === 'CATALOG' ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-600'
          }`}
        >
          📱 Chọn SKU
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('ITEMS')}
          className={`flex-1 py-1.5 rounded-lg transition-all ${
            mobileTab === 'ITEMS' ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-600'
          }`}
        >
          📝 Nhập IMEI ({totalQuantity})
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('PAYMENT')}
          className={`flex-1 py-1.5 rounded-lg transition-all ${
            mobileTab === 'PAYMENT' ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-600'
          }`}
        >
          💵 Nhà Cung Cấp
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.4fr_380px] divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/80 items-stretch flex-1 min-h-0 overflow-y-auto lg:overflow-hidden bg-white w-full">
        
        <div className={`p-3 sm:p-4 flex flex-col h-full overflow-hidden space-y-3 bg-zinc-50/40 ${mobileTab !== 'CATALOG' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-[#ff4b16]" />
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900">
                Danh Mục SKU Master
              </h3>
            </div>
            <span className="text-[10px] font-mono text-zinc-400">
              {filteredCatalogItems.length} model
            </span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Tìm Model, SKU, dung lượng..."
              value={catalogSearch}
              onChange={e => setCatalogSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-3 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[#ff4b16]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px] font-bold">
            {['ALL', '16', '15', '14', '13', '12'].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setCatalogSeriesFilter(s)}
                className={`px-2.5 py-1 rounded-lg shrink-0 transition-colors cursor-pointer ${
                  catalogSeriesFilter === s ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                {s === 'ALL' ? 'Tất cả' : `iPhone ${s}`}
              </button>
            ))}
          </div>

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
                  className="p-2.5 rounded-xl bg-white border border-zinc-200 hover:border-orange-300 hover:bg-orange-50/40 transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-black text-zinc-900 group-hover:text-[#ff4b16] transition-colors truncate">
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
                    <span className="text-xs font-bold font-mono text-zinc-900 block">
                      {(item.defaultImportPrice || 0).toLocaleString('vi-VN')} đ
                    </span>
                    <span className="text-[10px] font-bold text-[#ff4b16] opacity-0 group-hover:opacity-100 transition-opacity">
                      + Thêm nhập ↵
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={`p-3 sm:p-4 flex flex-col h-full overflow-hidden space-y-3 bg-white ${mobileTab !== 'ITEMS' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-lg bg-[#ff4b16] text-white flex items-center justify-center font-black text-xs">
                {fields.length}
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900">
                  Danh Sách Máy & Dán IMEI Hàng Loạt
                </h3>
                <span className="text-[10px] text-zinc-400 font-medium">
                  Tổng {totalQuantity} cây máy chuẩn bị nhập kho
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => append({ catalogItemId: '', searchQuery: '', imeisInput: '', buyPrice: 0 })}
              className="px-2.5 py-1 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#ff4b16] font-bold text-xs flex items-center space-x-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm Dòng</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {fields.map((field, index) => {
              const currentImeis = watchItems[index]?.imeisInput || '';
              const parsedImeis = currentImeis.split(/[\n,]+/).map(i => i.trim()).filter(i => i.length > 0);
              const itemCount = parsedImeis.length;
              const unitPrice = Number(watchItems[index]?.buyPrice) || 0;
              const rowTotal = itemCount * unitPrice;

              return (
                <div 
                  key={field.id} 
                  className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 hover:border-zinc-300 transition-all space-y-2.5 relative"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1">
                      <input
                        type="text"
                        {...register(`items.${index}.searchQuery` as const, { required: true })}
                        placeholder="Tên Model / Sản phẩm nhập (ví dụ: iPhone 15 Pro Max 256GB)..."
                        className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 focus:outline-none focus:border-[#ff4b16]"
                      />
                    </div>

                    <div className="w-36">
                      <input
                        type="number"
                        {...register(`items.${index}.buyPrice` as const, { required: true })}
                        placeholder="Giá vốn (VNĐ)..."
                        className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-mono font-bold text-[#ff4b16] focus:outline-none focus:border-[#ff4b16]"
                      />
                    </div>

                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                        title="Xóa dòng này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <textarea
                      {...register(`items.${index}.imeisInput` as const)}
                      rows={3}
                      placeholder="Dán danh sách mã IMEI vào đây (mỗi IMEI một dòng hoặc ngăn cách bằng dấu phẩy)..."
                      className="w-full p-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-mono font-bold text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-[#ff4b16] resize-none"
                    />
                    <div className="flex items-center justify-between text-[11px] text-zinc-500 font-medium px-1">
                      <span>Đã nhận diện: <b className="text-zinc-900 font-mono font-bold">{itemCount} IMEI</b></span>
                      <span>Thành tiền dòng: <b className="text-[#ff4b16] font-mono font-bold">{rowTotal.toLocaleString('vi-VN')} đ</b></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={`p-3 sm:p-4 flex flex-col h-full overflow-hidden space-y-3.5 bg-zinc-50/50 ${mobileTab !== 'PAYMENT' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-xl bg-orange-50 text-[#ff4b16] flex items-center justify-center font-black">
                <Store className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900">
                Nhà Cung Cấp & Thanh Toán
              </h3>
            </div>
            <span className="text-[10px] font-mono text-zinc-400">F9: Nhập kho</span>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-zinc-700">Chi Nhánh Nhập</label>
            {isAdmin ? (
              <select
                {...register("branchId", { required: true })}
                className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            ) : (
              <div className="px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800">
                {branches.find(b => b.id === defaultBranchId)?.name || 'Showroom Chi Nhánh'}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-zinc-700">Nhà Cung Cấp</label>
              <button
                type="button"
                onClick={() => setIsCreateSupplierModalOpen(true)}
                className="text-[11px] font-bold text-[#ff4b16] hover:underline cursor-pointer"
              >
                + Thêm NCC
              </button>
            </div>
            <select
              {...register("supplierId", { required: "Vui lòng chọn nhà cung cấp" })}
              className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
            >
              <option value="">-- Chọn Nhà Cung Cấp --</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.phone || 'N/A'})</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-zinc-700">Phương Thức Thanh Toán</label>
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
                    className={`py-2 px-1 rounded-xl text-[11px] font-bold flex flex-col items-center justify-center transition-all cursor-pointer ${
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

          {/* 4. Financial Summary Card */}
          <div className="p-3 bg-white rounded-2xl border border-zinc-200 space-y-2 mt-auto">
            <div className="flex items-center justify-between text-xs text-zinc-600 font-medium">
              <span>Tổng số lượng máy:</span>
              <span className="font-mono font-bold text-zinc-900">{totalQuantity} cây máy</span>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-600 font-medium">
              <span>Tổng tiền hàng:</span>
              <span className="font-mono font-black text-sm text-[#ff4b16]">
                {totalAmount.toLocaleString('vi-VN')} đ
              </span>
            </div>

            {watchPaymentMethod !== 'DEBT' && (
              <div className="flex items-center justify-between text-xs text-zinc-600 font-medium pt-1 border-t border-zinc-100">
                <span>Số tiền thanh toán:</span>
                <input
                  type="number"
                  {...register("amountPaid")}
                  onChange={e => {
                    setValue("amountPaid", Number(e.target.value) || 0);
                    setIsCustomPaid(true);
                  }}
                  className="w-28 h-7 text-right px-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-mono font-bold text-emerald-700 focus:outline-none focus:border-[#ff4b16]"
                />
              </div>
            )}

            {remainingDebtAmount > 0 && (
              <div className="flex items-center justify-between text-[11px] text-rose-600 font-bold pt-1 border-t border-zinc-100">
                <span>Công nợ ghi nhận:</span>
                <span className="font-mono">{remainingDebtAmount.toLocaleString('vi-VN')} đ</span>
              </div>
            )}
          </div>

          {/* 5. Complete Button (F9) */}
          <button
            type="submit"
            disabled={totalQuantity === 0}
            className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-md active:scale-98 cursor-pointer ${
              totalQuantity > 0
                ? 'bg-[#ff4b16] hover:bg-[#e03e0e] text-white shadow-orange-500/25'
                : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
            }`}
          >
            <PackagePlus className="w-4 h-4" />
            <span>Xác Nhận & Nhập Kho Ngay ({totalQuantity} máy)</span>
          </button>
        </div>
      </form>

      {/* Supplier Creation Dialog */}
      <CreatePartnerModal
        isOpen={isCreateSupplierModalOpen}
        onClose={() => setIsCreateSupplierModalOpen(false)}
        onAddPartner={async (newPartner) => {
          if (onAddPartner) {
            await onAddPartner({ ...newPartner, type: 'SUPPLIER' });
          }
          setValue('supplierId', newPartner.id);
          setIsCreateSupplierModalOpen(false);
        }}
        branches={branches}
        defaultType="SUPPLIER"
      />
    </div>
  );
};
