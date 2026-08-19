import React, { useState, useMemo, useEffect } from 'react';
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { 
  Search, Check, Box, X, Store, Hash, DollarSign, Plus, Trash2, MapPin, ChevronDown
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

  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      reset({
        branchId: defaultBranchId,
        supplierId: '',
        items: [{ catalogItemId: '', searchQuery: '', imeisInput: '', buyPrice: 0 }],
        paymentMethod: 'BANK',
        amountPaid: 0
      });
      setOpenDropdownIndex(null);
    }
  }, [isOpen, reset, defaultBranchId]);

  const suppliers = useMemo(() => partners.filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH'), [partners]);

  // Calculate totals
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

  // Auto update amountPaid when totalAmount or paymentMethod changes unless user customizes it
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
          modelOrName: catalogItem?.name || '',
          color: catalogItem?.color,
          storage: catalogItem?.storage,
          condition: catalogItem?.condition as any,
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl max-h-[95vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300 border border-white/20">
        
        {/* Header Gradient */}
        <div className="px-6 py-5 bg-gradient-to-r from-orange-400 to-orange-500 flex items-center justify-between shrink-0 shadow-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
          <div className="flex items-center space-x-3 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30 shadow-inner">
              <Box className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white drop-shadow-sm tracking-wide">Tạo Phiếu Nhập Hàng</h2>
              <p className="text-orange-50 font-medium text-sm drop-shadow-sm opacity-90">Nhập nhiều sản phẩm cùng lúc</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 bg-white/10 hover:bg-white/25 rounded-full transition-colors relative z-10 border border-transparent hover:border-white/20">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-zinc-50/50">
          <form id="stock-in-form" onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Branch Selection (Admin only) */}
              <section className="bg-white p-5 rounded-2xl border border-orange-100 shadow-sm shadow-orange-100/50">
                <h3 className="flex items-center text-sm font-bold text-zinc-800 mb-3 uppercase tracking-wider">
                  <MapPin className="w-4 h-4 mr-2 text-orange-500" />
                  Chi nhánh nhập
                </h3>
                {isAdmin ? (
                  <div className="relative">
                    <select 
                      {...register("branchId", { required: "Vui lòng chọn chi nhánh." })}
                      className="${errors.branchId ? 'border-rose-500' : 'border-zinc-200 focus:border-orange-500'} w-full px-4 py-3 bg-zinc-50 border rounded-xl text-sm font-semibold outline-none appearance-none transition-all"
                    >
                      <option value="">-- Chọn chi nhánh --</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-3.5 w-4 h-4 text-zinc-400 pointer-events-none" />
                  </div>
                ) : (
                  <div className="px-4 py-3 bg-orange-50 text-orange-800 rounded-xl text-sm font-bold border border-orange-100 flex items-center">
                    {branches.find(b => b.id === defaultBranchId)?.name || 'Chi nhánh mặc định'}
                  </div>
                )}
              </section>

              {/* 1. Supplier Selection */}
              <section className="bg-white p-5 rounded-2xl border border-orange-100 shadow-sm shadow-orange-100/50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="flex items-center text-sm font-bold text-zinc-800 uppercase tracking-wider">
                    <Store className="w-4 h-4 mr-2 text-orange-500" />
                    Nhà Cung Cấp
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsCreateSupplierModalOpen(true)}
                    className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Thêm NCC</span>
                  </button>
                </div>
                <div className="relative">
                  <select 
                    {...register("supplierId", { required: "Vui lòng chọn nhà cung cấp." })}
                    className={`${errors.supplierId ? 'border-rose-500' : 'border-zinc-200 focus:border-orange-500'} w-full px-4 py-3 bg-zinc-50 border rounded-xl text-sm font-semibold outline-none appearance-none transition-all`}
                  >
                    <option value="">-- Chọn nhà cung cấp --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} - {s.phone}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-3.5 w-4 h-4 text-zinc-400 pointer-events-none" />
                </div>
                {errors.supplierId && <p className="text-rose-500 text-xs mt-1.5 font-medium px-1">{errors.supplierId.message}</p>}
              </section>
            </div>

            {/* 2 & 3 & 4. SKU & IMEI & Price - Multiple Items */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
                <h3 className="flex items-center text-base font-black text-zinc-800 uppercase tracking-wide">
                  <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-400 to-orange-500 text-white flex items-center justify-center mr-3 shadow-md shadow-orange-500/20">
                    <Box className="w-4 h-4" />
                  </span>
                  Danh sách sản phẩm nhập
                </h3>
              </div>

              {fields.map((field, index) => {
                const query = watchItems[index]?.searchQuery || '';
                const selectedId = watchItems[index]?.catalogItemId;
                const selectedItem = catalogItems.find(c => c.id === selectedId);
                const currentImeis = watchItems[index]?.imeisInput || '';
                const parsed = currentImeis.split(/[\n,]+/).map(i => i.trim()).filter(i => i.length > 0);
                const itemQty = parsed.length;
                const itemPrice = watchItems[index]?.buyPrice || 0;

                const filtered = catalogItems.filter(item => 
                  item.name.toLowerCase().includes(query.toLowerCase()) || 
                  item.sku.toLowerCase().includes(query.toLowerCase())
                ).slice(0, 5);

                return (
                  <div key={field.id} className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm relative group transition-all hover:border-orange-300">
                    {fields.length > 1 && (
                      <button 
                        type="button" 
                        onClick={() => remove(index)}
                        className="absolute top-4 right-4 p-2 text-zinc-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                      
                      {/* Left: SKU Selection */}
                      <div className="md:col-span-5 space-y-3">
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Mã SKU Sản Phẩm</label>
                        <div className="relative">
                          <Search className="absolute left-3 top-3 w-5 h-5 text-zinc-400" />
                          <input 
                            type="text" 
                            {...register(`items.${index}.searchQuery` as const)}
                            onFocus={() => setOpenDropdownIndex(index)}
                            onChange={(e) => {
                              setValue(`items.${index}.searchQuery` as const, e.target.value, { shouldValidate: true, shouldDirty: true });
                              setValue(`items.${index}.catalogItemId` as const, '', { shouldValidate: true, shouldDirty: true });
                              setOpenDropdownIndex(index);
                            }}
                            placeholder="Gõ mã SKU hoặc Tên..." 
                            className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-semibold focus:border-orange-500 focus:bg-white transition-all outline-none"
                          />
                          
                          {openDropdownIndex === index && filtered.length > 0 && !selectedId && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                              {filtered.map(item => (
                                <button
                                  type="button"
                                  key={item.id}
                                  onClick={() => {
                                    setValue(`items.${index}.catalogItemId` as const, item.id, { shouldValidate: true });
                                    setValue(`items.${index}.searchQuery` as const, item.name);
                                    setValue(`items.${index}.buyPrice` as const, item.defaultImportPrice || 0, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
                                    setOpenDropdownIndex(null);
                                  }}
                                  className="w-full text-left px-4 py-3 hover:bg-orange-50 text-sm font-medium transition-colors border-b border-zinc-100 last:border-0 flex justify-between items-center"
                                >
                                  <span className="truncate pr-2">{item.name}</span>
                                  <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md font-mono shrink-0">{item.sku}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          <input type="hidden" {...register(`items.${index}.catalogItemId` as const, { required: "Chọn SKU." })} />
                        </div>
                        {errors.items?.[index]?.catalogItemId && <p className="text-rose-500 text-xs font-medium px-1">{errors.items[index]?.catalogItemId?.message}</p>}

                        {selectedItem && (
                          <div className="p-3 bg-gradient-to-r from-orange-50 to-orange-50 border border-orange-100 rounded-xl flex justify-between items-center">
                            <div className="flex flex-col overflow-hidden pr-2">
                              <span className="text-sm font-bold text-orange-900 truncate">{selectedItem.name}</span>
                              <span className="text-xs font-mono text-orange-600">SKU: {selectedItem.sku}</span>
                            </div>
                            <button type="button" onClick={() => {
                              setValue(`items.${index}.catalogItemId` as const, '', { shouldValidate: true, shouldDirty: true });
                              setValue(`items.${index}.searchQuery` as const, '', { shouldValidate: true, shouldDirty: true });
                            }} className="p-1.5 hover:bg-orange-100 rounded-full transition-colors shrink-0">
                              <X className="w-4 h-4 text-orange-600" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Middle: IMEIs */}
                      <div className="md:col-span-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Danh Sách IMEI</label>
                          {itemQty > 0 && (
                            <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-md">
                              {itemQty} máy
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <Hash className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
                          <textarea
                            {...register(`items.${index}.imeisInput` as const, { 
                              required: "Nhập IMEI.",
                              validate: (val) => {
                                const arr = val.split(/[\n,]+/).map(i => i.trim()).filter(i => i.length > 0);
                                if (arr.length === 0) return "Ít nhất 1 IMEI.";
                                return true;
                              }
                            })}
                            placeholder="Mỗi IMEI 1 dòng..."
                            className="${errors.items?.[index]?.imeisInput ? 'border-rose-500' : 'border-zinc-200 focus:border-orange-500'} w-full h-24 pl-9 pr-3 py-2.5 bg-zinc-50 border rounded-xl text-sm font-mono focus:bg-white transition-all outline-none resize-none"
                          />
                        </div>
                        {errors.items?.[index]?.imeisInput && <p className="text-rose-500 text-xs font-medium px-1">{errors.items[index]?.imeisInput?.message}</p>}
                      </div>

                      {/* Right: Buy Price */}
                      <div className="md:col-span-3 space-y-3">
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Đơn Giá Nhập (1 máy)</label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
                          <input 
                            type="number" 
                            {...register(`items.${index}.buyPrice` as const, { 
                              required: "Nhập giá.",
                              min: { value: 1000, message: "> 1,000đ" },
                              valueAsNumber: true
                            })}
                            placeholder="VNĐ"
                            className="${errors.items?.[index]?.buyPrice ? 'border-rose-500' : 'border-zinc-200 focus:border-rose-400'} w-full pl-9 pr-3 py-2.5 bg-rose-50 text-rose-700 border rounded-xl text-sm font-bold transition-all outline-none" 
                          />
                        </div>
                        {errors.items?.[index]?.buyPrice && <p className="text-rose-500 text-xs font-medium px-1">{errors.items[index]?.buyPrice?.message}</p>}
                        
                        {itemQty > 0 && itemPrice > 0 && (
                          <div className="mt-2 text-right">
                            <p className="text-xs text-zinc-400 font-medium mb-0.5">Thành tiền:</p>
                            <p className="text-sm font-black text-rose-600">{(itemQty * itemPrice).toLocaleString('vi-VN')}đ</p>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => append({ catalogItemId: '', searchQuery: '', imeisInput: '', buyPrice: 0 })}
                className="w-full py-4 border-2 border-dashed border-orange-200 rounded-2xl flex items-center justify-center text-sm font-bold text-orange-600 hover:bg-orange-50 hover:border-orange-400 transition-all shadow-sm"
              >
                <Plus className="w-5 h-5 mr-2" />
                Thêm Sản Phẩm Khác
              </button>
            </section>

            {/* 5. Thanh toán */}
            <section className="bg-gradient-to-br from-zinc-800 to-zinc-900 p-6 rounded-3xl shadow-xl border border-zinc-700 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl"></div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                <div>
                  <h3 className="text-sm font-bold text-zinc-400 mb-4 uppercase tracking-wider">Tổng Kết Lô Hàng Real-Time</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-zinc-300">Tổng số lượng máy:</span>
                      <span className="text-lg font-bold bg-white/10 px-3 py-1 rounded-lg">{totalQuantity} máy</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-white/10">
                      <span className="text-zinc-300 font-medium text-xs">TỔNG GIÁ TRỊ LÔ HÀNG:</span>
                      <span className="text-xl font-black text-orange-400">
                        {totalAmount.toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-300 font-medium text-xs">SỐ TIỀN TRẢ NGAY:</span>
                      <span className="text-lg font-bold text-emerald-400">
                        {actualPaidAmount.toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-white/10">
                      <span className="text-zinc-300 font-medium text-xs">CÒN NỢ NHÀ CUNG CẤP:</span>
                      <span className={`text-xl font-black ${remainingDebtAmount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {remainingDebtAmount.toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block text-sm font-bold text-zinc-400 uppercase tracking-wider">Hình Thức Thanh Toán</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['BANK', 'CASH', 'DEBT'] as const).map(m => (
                      <button
                        type="button"
                        key={m}
                        onClick={() => {
                          setValue('paymentMethod', m);
                          if (m === 'DEBT') {
                            setIsCustomPaid(false);
                            setValue('amountPaid', 0);
                          } else {
                            setIsCustomPaid(false);
                            setValue('amountPaid', totalAmount);
                          }
                        }}
                        className={`py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          watchPaymentMethod === m ? 'bg-gradient-to-r from-orange-500 to-orange-500 text-white border-transparent shadow-lg shadow-orange-500/20' : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {m === 'BANK' ? 'Chuyển Khoản' : m === 'CASH' ? 'Tiền Mặt' : 'Ghi Nợ NCC'}
                      </button>
                    ))}
                  </div>

                  
                  {watchPaymentMethod !== 'DEBT' && (
                    <div className="pt-2 animate-in fade-in slide-in-from-top-2">
                      <label className="block text-xs font-bold text-zinc-400 mb-1.5">Tài khoản thanh toán (Phiếu Chi)</label>
                      <select
                        value={selectedFundId}
                        onChange={(e) => setSelectedFundId(e.target.value)}
                        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm font-medium text-white focus:border-orange-400 focus:bg-white/20 transition-all outline-none"
                      >
                        {funds
                          .filter(f => f.type === watchPaymentMethod)
                          .sort((a, b) => {
                             const aWeight = a.branchId === watchBranchId ? 0 : (!a.branchId || a.isCompanyFund) ? 1 : 2;
                             const bWeight = b.branchId === watchBranchId ? 0 : (!b.branchId || b.isCompanyFund) ? 1 : 2;
                             return aWeight - bWeight;
                          })
                          .map(f => {
                            const isSameBranch = f.branchId === watchBranchId;
                            const isCompany = f.isCompanyFund || !f.branchId;
                            const prefix = isSameBranch ? '[Chi nhánh này] ' : isCompany ? '[Quỹ Công ty] ' : '[Chi nhánh khác] ';
                            return (
                              <option key={f.id} value={f.id} className="text-zinc-900">
                                {prefix} {f.name} {f.accountNumber ? ` - ${f.accountNumber}` : ''}
                              </option>
                            );
                        })}
                      </select>
                    </div>
                  )}

                  {watchPaymentMethod !== 'DEBT' && (
                    <div className="pt-2 animate-in fade-in slide-in-from-top-2 space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-bold text-zinc-400">Số Tiền Trả Ngay (VNĐ)</label>
                        <div className="flex space-x-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setValue('amountPaid', totalAmount);
                              setIsCustomPaid(false);
                            }}
                            className="px-2 py-0.5 bg-orange-500/20 text-orange-300 hover:bg-orange-500/40 rounded text-[11px] font-bold border border-orange-500/30 cursor-pointer"
                          >
                            Trả 100%
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setValue('amountPaid', Math.round(totalAmount / 2));
                              setIsCustomPaid(true);
                            }}
                            className="px-2 py-0.5 bg-white/10 text-zinc-300 hover:bg-white/20 rounded text-[11px] font-medium border border-white/20 cursor-pointer"
                          >
                            Trả 50%
                          </button>
                        </div>
                      </div>
                      <input 
                        type="number" 
                        {...register("amountPaid", { 
                          valueAsNumber: true,
                          onChange: () => setIsCustomPaid(true)
                        })}
                        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-base font-bold text-white focus:border-orange-400 focus:bg-white/20 transition-all outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>
            </section>
          </form>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-5 bg-white border-t border-zinc-100 flex justify-between items-center shrink-0">
          <button 
            type="button"
            onClick={onClose}
            className="px-6 py-3 rounded-xl font-bold text-sm text-zinc-500 hover:bg-zinc-100 transition-colors"
          >
            Hủy Bỏ
          </button>
          <button 
            type="submit"
            form="stock-in-form"
            className="px-8 py-3 rounded-xl font-bold text-sm flex items-center shadow-lg shadow-orange-500/30 transition-all bg-gradient-to-r from-orange-500 to-orange-500 text-white hover:from-orange-600 hover:to-orange-600 active:scale-95"
          >
            <Check className="w-5 h-5 mr-2 stroke-[3]" />
            Hoàn Tất Nhập Hàng
          </button>
        </div>
      </div>

      {/* Quick Create Supplier Modal */}
      <CreatePartnerModal
        isOpen={isCreateSupplierModalOpen}
        onClose={() => setIsCreateSupplierModalOpen(false)}
        defaultType="SUPPLIER"
        onSavePartner={async (newSupplier) => {
          if (onAddPartner) {
            await onAddPartner(newSupplier);
          }
          setValue('supplierId', newSupplier.id);
        }}
      />
    </div>
  );
};
