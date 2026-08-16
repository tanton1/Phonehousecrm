import React, { useState, useMemo } from 'react';
import { 
  PurchaseOrder, 
  PurchaseOrderItem, 
  PurchaseOrderStatus, 
  PurchasePaymentStatus, 
  Partner, 
  WarehouseInfo, 
  FundAccount,
  UserAccount,
  WarehouseId,
  MasterCatalogItem
} from '../types';
import { ActivityLog } from './ActivityLog';
import { 
  Database,
  Plus, 
  Search, 
  Printer, 
  Building2, 
  Warehouse, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  ChevronRight, 
  ChevronLeft,
  Trash2, 
  Edit3, 
  Smartphone, 
  CreditCard, 
  ShieldCheck, 
  Sparkles, 
  X, 
  Phone, 
  MapPin, 
  Check, 
  Receipt, 
  TrendingDown, 
  Barcode, 
  QrCode, 
  PackageCheck, 
  User, 
  SlidersHorizontal, 
  List, 
  Copy, 
  MoreVertical, 
  Share2, 
  ScanLine, 
  ChevronDown,
  Coins,
  DollarSign,
  Package,
  Truck,
  RotateCcw
} from 'lucide-react';

interface PurchaseOrdersViewProps {
  purchaseOrders: PurchaseOrder[];
  partners: Partner[];
  warehouses: WarehouseInfo[];
  funds: FundAccount[];
  currentUser?: UserAccount | null;
  onAddPurchaseOrder: (order: PurchaseOrder, autoCreateDevices: boolean) => void;
  onUpdatePurchaseOrder: (order: PurchaseOrder) => void;
  onDeletePurchaseOrder: (orderId: string) => void;
  onPaySupplierDebt?: (orderId: string, supplierId: string, amount: number, fundId: string, note: string) => void;
  catalogItems: MasterCatalogItem[];
}

type TimeFilter = 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month';

const STATUS_CONFIG: Record<PurchaseOrderStatus, { label: string; bg: string; text: string; border: string; dot: string; icon: any }> = {
  COMPLETED: {
    label: 'Đã nhập kho',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    icon: CheckCircle2
  },
  QC_CHECKING: {
    label: 'Kiểm định KCS',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    icon: ShieldCheck
  },
  DRAFT: {
    label: 'Bản nháp',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
    icon: Clock
  },
  CANCELLED: {
    label: 'Đã hủy phiếu',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
    icon: AlertCircle
  }
};

const PAYMENT_STATUS_CONFIG: Record<PurchasePaymentStatus, { label: string; bg: string; text: string; border: string }> = {
  PAID: {
    label: 'Đã thanh toán',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200'
  },
  PARTIAL: {
    label: 'Thanh toán một phần',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200'
  },
  UNPAID: {
    label: 'Còn nợ NCC',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200'
  }
};

export const PurchaseOrdersView: React.FC<PurchaseOrdersViewProps> = ({
  purchaseOrders,
  partners,
  warehouses,
  funds,
  currentUser,
  onAddPurchaseOrder,
  onUpdatePurchaseOrder,
  onDeletePurchaseOrder,
  onPaySupplierDebt
, catalogItems}) => {
  // Master-Detail State
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Modals & Interactivity State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isPayDebtModalOpen, setIsPayDebtModalOpen] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showMoreDropdown, setShowMoreDropdown] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  // Pay Debt Form State
  const [payAmount, setPayAmount] = useState<number>(0);
  const [selectedPayFundId, setSelectedPayFundId] = useState<string>(funds[0]?.id || 'FUND-01');
  const [payNote, setPayNote] = useState('');

  // Suppliers List
  const suppliers = useMemo(() => {
    return partners.filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH');
  }, [partners]);

  const triggerToast = (msg: string) => {
    setSyncToast(msg);
    setTimeout(() => setSyncToast(null), 3000);
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Quick Status Change on Detail View
  const handleQuickChangeStatus = (newStatus: PurchaseOrderStatus) => {
    if (!selectedOrder) return;
    const updatedOrder: PurchaseOrder = {
      ...selectedOrder,
      status: newStatus,
      receivedDate: newStatus === 'COMPLETED' ? new Date().toISOString().split('T')[0] : selectedOrder.receivedDate,
      history: [
        ...(selectedOrder.history || []),
        {
          time: new Date().toLocaleString('vi-VN'),
          action: `Chuyển trạng thái: ${STATUS_CONFIG[newStatus]?.label || newStatus}`,
          user: currentUser ? currentUser.displayName : 'Admin PhoneHouse'
        }
      ]
    };
    setSelectedOrder(updatedOrder);
    onUpdatePurchaseOrder(updatedOrder);
    setShowStatusPicker(false);
    triggerToast(`Đã chuyển trạng thái: "${STATUS_CONFIG[newStatus]?.label}"`);
  };

  // Save Note in Detail View
  const handleSaveNote = () => {
    if (!selectedOrder) return;
    const updatedOrder: PurchaseOrder = {
      ...selectedOrder,
      notes: noteContent,
      history: [
        ...(selectedOrder.history || []),
        {
          time: new Date().toLocaleString('vi-VN'),
          action: 'Cập nhật ghi chú phiếu nhập',
          note: noteContent,
          user: currentUser ? currentUser.displayName : 'Admin PhoneHouse'
        }
      ]
    };
    setSelectedOrder(updatedOrder);
    onUpdatePurchaseOrder(updatedOrder);
    setIsEditingNote(false);
    triggerToast('Đã lưu ghi chú phiếu nhập hàng');
  };

  // Handle Pay Debt Confirmation
  const handleConfirmPayDebt = () => {
    if (!selectedOrder || payAmount <= 0) return;
    if (payAmount > selectedOrder.debtAmount) {
      alert('Số tiền thanh toán không được vượt quá số nợ còn lại!');
      return;
    }

    const updatedPaid = selectedOrder.paidAmount + payAmount;
    const updatedDebt = Math.max(0, selectedOrder.totalAmount - updatedPaid);
    const updatedPaymentStatus: PurchasePaymentStatus = updatedDebt === 0 ? 'PAID' : 'PARTIAL';

    const updatedOrder: PurchaseOrder = {
      ...selectedOrder,
      paidAmount: updatedPaid,
      debtAmount: updatedDebt,
      paymentStatus: updatedPaymentStatus,
      history: [
        ...(selectedOrder.history || []),
        {
          time: new Date().toLocaleString('vi-VN'),
          action: 'Thanh toán nợ NCC',
          user: currentUser ? currentUser.displayName : 'Admin PhoneHouse',
          note: `Thanh toán thêm ${payAmount.toLocaleString('vi-VN')}đ. Nợ còn lại: ${updatedDebt.toLocaleString('vi-VN')}đ`
        }
      ]
    };

    setSelectedOrder(updatedOrder);
    onUpdatePurchaseOrder(updatedOrder);

    if (onPaySupplierDebt) {
      onPaySupplierDebt(selectedOrder.id, selectedOrder.supplierId, payAmount, selectedPayFundId, payNote);
    }

    setIsPayDebtModalOpen(false);
    triggerToast(`Đã chi thanh toán ${payAmount.toLocaleString('vi-VN')}đ cho NCC ${selectedOrder.supplierName}`);
  };

  // Filter Logic
  const filteredOrders = useMemo(() => {
    return purchaseOrders.filter(order => {
      // 1. Text Search
      const query = searchQuery.toLowerCase().trim();
      const code = (order.code || order.id).toLowerCase();
      const supName = (order.supplierName || '').toLowerCase();
      const supPhone = (order.supplierPhone || '').toLowerCase();
      const whName = (order.warehouseName || '').toLowerCase();
      const imeiMatch = order.items?.some(it => it.imeiList?.some(imei => imei.toLowerCase().includes(query)));
      const modelMatch = order.items?.some(it => it.modelOrName.toLowerCase().includes(query));

      const matchesSearch = !query || 
        code.includes(query) || 
        supName.includes(query) || 
        supPhone.includes(query) || 
        whName.includes(query) || 
        imeiMatch || 
        modelMatch;

      if (!matchesSearch) return false;

      // 2. Status Filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'DEBT' && order.debtAmount <= 0) return false;
        if (statusFilter !== 'DEBT' && order.status !== statusFilter) return false;
      }

      // 3. Supplier Filter
      if (supplierFilter !== 'all' && order.supplierId !== supplierFilter) return false;

      // 4. Time Filter
      if (timeFilter !== 'all') {
        const orderDateStr = order.orderDate || '';
        if (!orderDateStr) return true;
        const orderDate = new Date(orderDateStr);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (timeFilter === 'today') {
          return orderDate.getTime() >= today.getTime();
        }
        if (timeFilter === 'yesterday') {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          return orderDate.getDate() === yesterday.getDate() && 
                 orderDate.getMonth() === yesterday.getMonth() && 
                 orderDate.getFullYear() === yesterday.getFullYear();
        }
        if (timeFilter === 'this_week') {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          return orderDate.getTime() >= weekAgo.getTime();
        }
        if (timeFilter === 'this_month') {
          return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
        }
      }

      return true;
    }).sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [purchaseOrders, searchQuery, statusFilter, supplierFilter, timeFilter]);

  // Aggregate Totals
  const totalImportValue = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.status !== 'CANCELLED' ? o.totalAmount : 0), 0);
  }, [filteredOrders]);

  const totalOutstandingDebt = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.status !== 'CANCELLED' ? o.debtAmount : 0), 0);
  }, [filteredOrders]);

  const totalItemCount = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.status !== 'CANCELLED' ? o.totalQuantity : 0), 0);
  }, [filteredOrders]);

  // Group by Date for Mobile List View (Matching InvoicesView pattern)
  const groupedOrders = useMemo(() => {
    const groups: { [key: string]: PurchaseOrder[] } = {};

    filteredOrders.forEach(order => {
      const rawDate = (order.orderDate || '2026-08-16').split(' ')[0];
      let header = rawDate;

      try {
        const [year, month, day] = rawDate.split('-').map(Number);
        if (year && month && day) {
          const d = new Date(year, month - 1, day);
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const diffDays = Math.round((today.getTime() - d.getTime()) / (1000 * 3600 * 24));
          const formattedDate = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

          if (diffDays === 0) {
            header = `HÔM NAY, ${formattedDate}`;
          } else if (diffDays === 1) {
            header = `HÔM QUA, ${formattedDate}`;
          } else {
            const daysOfWeek = ['CHỦ NHẬT', 'THỨ HAI', 'THỨ BA', 'THỨ TƯ', 'THỨ NĂM', 'THỨ SÁU', 'THỨ BẢY'];
            header = `${daysOfWeek[d.getDay()]}, ${formattedDate}`;
          }
        }
      } catch (e) {
        header = rawDate;
      }

      if (!groups[header]) {
        groups[header] = [];
      }
      groups[header].push(order);
    });

    return groups;
  }, [filteredOrders]);

  // Helper to extract purchase order summary
  const getOrderSummary = (order: PurchaseOrder) => {
    const itemNames: string[] = [];
    (order.items || []).forEach(it => {
      const qty = it.quantity || 1;
      const details = [it.storage, it.color].filter(Boolean).join(' - ');
      const label = `${it.modelOrName.toUpperCase()}${details ? ` (${details})` : ''} x${qty}`;
      itemNames.push(label);
    });

    const firstItem = itemNames[0] || '1 MẶT HÀNG NHẬP';
    const remainingCount = itemNames.length - 1;

    return {
      firstItem,
      remainingCount: remainingCount > 0 ? `+ ${remainingCount} mặt hàng khác` : null,
      allItems: itemNames
    };
  };

  // ----------------------------------------------------
  // FORM STATE FOR CREATING NEW PURCHASE ORDER MODAL
  // ----------------------------------------------------
  const [newSupplierId, setNewSupplierId] = useState(suppliers[0]?.id || '');
  const [newWarehouseId, setNewWarehouseId] = useState<string>(warehouses[0]?.id || 'KHO_TONG');
  const [newOrderDate, setNewOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [newPaymentMethod, setNewPaymentMethod] = useState<'Tiền mặt tại két' | 'Chuyển khoản VietQR' | 'Ghi nhận công nợ NCC'>('Ghi nhận công nợ NCC');
  const [newFundId, setNewFundId] = useState(funds[0]?.id || 'FUND-01');
  const [newPaidAmount, setNewPaidAmount] = useState<number>(0);
  const [newDiscountAmount, setNewDiscountAmount] = useState<number>(0);
  const [newNotes, setNewNotes] = useState('');
  const [newStatus, setNewStatus] = useState<PurchaseOrderStatus>('COMPLETED');
  const [autoCreateDevices, setAutoCreateDevices] = useState(true);

  
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');

  const [orderItems, setOrderItems] = useState<PurchaseOrderItem[]>([
    {
      id: 'ITEM-TEMP-1',
      type: 'device',
      modelOrName: 'iPhone 16 Pro Max',
      color: 'Titan Sa Mạc (Desert)',
      storage: '256GB',
      condition: 'New Seal',
      region: 'VN/A (Chính hãng)',
      batteryHealth: 100,
      quantity: 1,
      importPrice: 30500000,
      expectedSellPrice: 34500000,
      totalAmount: 30500000,
      imeiList: [],
      notes: ''
    }
  ]);

  
  const handleSelectFromCatalog = (item: MasterCatalogItem) => {
    setOrderItems([
      ...orderItems,
      {
        id: `ITEM-TEMP-${Date.now()}`,
        type: item.category === 'DEVICE' ? 'device' : 'product',
        modelOrName: item.name,
        color: item.color || '',
        storage: item.storage || '',
        condition: (item.condition as any) || 'New Seal',
        region: item.region || '',
        batteryHealth: 100,
        quantity: 1,
        importPrice: item.defaultImportPrice,
        expectedSellPrice: item.defaultRetailPrice,
        totalAmount: item.defaultImportPrice,
        imeiList: [],
        notes: ''
      }
    ]);
    setShowCatalogModal(false);
    setCatalogSearch('');
  };

  const handleAddItemRow = () => {
    setOrderItems([
      ...orderItems,
      {
        id: `ITEM-TEMP-${Date.now()}`,
        type: 'device',
        modelOrName: 'iPhone 15 Pro Max',
        color: 'Titan Tự Nhiên (Natural)',
        storage: '256GB',
        condition: 'Like New 99%',
        region: 'LL/A (Mỹ - eSim)',
        batteryHealth: 99,
        quantity: 1,
        importPrice: 19500000,
        expectedSellPrice: 22800000,
        totalAmount: 19500000,
        imeiList: [],
        notes: ''
      }
    ]);
  };

  const handleUpdateItemRow = (index: number, updates: Partial<PurchaseOrderItem>) => {
    const updated = [...orderItems];
    const current = { ...updated[index], ...updates };
    if (updates.imeiList && updates.imeiList.length > 0) {
      current.quantity = updates.imeiList.length;
    }
    current.totalAmount = (current.quantity || 1) * (current.importPrice || 0);
    updated[index] = current;
    setOrderItems(updated);
  };

  const handleDeleteItemRow = (index: number) => {
    if (orderItems.length === 1) {
      alert('Phiếu nhập phải có ít nhất 1 mặt hàng!');
      return;
    }
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const formSubTotal = useMemo(() => {
    return orderItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
  }, [orderItems]);

  const formTotalAmount = useMemo(() => {
    return Math.max(0, formSubTotal - newDiscountAmount);
  }, [formSubTotal, newDiscountAmount]);

  const formDebtAmount = useMemo(() => {
    return Math.max(0, formTotalAmount - newPaidAmount);
  }, [formTotalAmount, newPaidAmount]);

  const handleSavePurchaseOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierId) {
      alert('Vui lòng chọn Nhà Cung Cấp!');
      return;
    }

    const supplierObj = partners.find(p => p.id === newSupplierId);
    const warehouseObj = warehouses.find(w => w.id === newWarehouseId);
    const fundObj = funds.find(f => f.id === newFundId);
    const totalQty = orderItems.reduce((sum, i) => sum + (i.quantity || 1), 0);

    let paymentStatus: PurchasePaymentStatus = 'UNPAID';
    if (newPaidAmount >= formTotalAmount && formTotalAmount > 0) {
      paymentStatus = 'PAID';
    } else if (newPaidAmount > 0) {
      paymentStatus = 'PARTIAL';
    }

    const newCode = `PN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(purchaseOrders.length + 1).padStart(2, '0')}`;

    const newOrder: PurchaseOrder = {
      id: `PO-${Date.now()}`,
      code: newCode,
      supplierId: newSupplierId,
      supplierName: supplierObj ? supplierObj.name : 'Nhà cung cấp',
      supplierPhone: supplierObj?.phone,
      supplierAddress: supplierObj?.address,
      supplierTaxCode: supplierObj?.taxCode,
      warehouseId: newWarehouseId,
      warehouseName: warehouseObj ? warehouseObj.name : 'Kho Tổng',
      orderDate: newOrderDate,
      receivedDate: newStatus === 'COMPLETED' ? newOrderDate : undefined,
      creatorName: currentUser ? currentUser.displayName : 'Admin PhoneHouse',
      status: newStatus,
      paymentStatus,
      paymentMethod: newPaidAmount > 0 ? newPaymentMethod : 'Ghi nhận công nợ NCC',
      fundId: newPaidAmount > 0 ? newFundId : undefined,
      fundName: newPaidAmount > 0 ? fundObj?.name : undefined,
      items: orderItems,
      totalQuantity: totalQty,
      subTotal: formSubTotal,
      discountAmount: newDiscountAmount,
      shippingFee: 0,
      totalAmount: formTotalAmount,
      paidAmount: newPaidAmount,
      debtAmount: formDebtAmount,
      notes: newNotes,
      history: [
        {
          time: new Date().toLocaleString('vi-VN'),
          action: 'Tạo phiếu nhập hàng',
          user: currentUser ? currentUser.displayName : 'Admin PhoneHouse',
          note: `Lập phiếu nhập ${totalQty} sản phẩm. Tổng tiền: ${formTotalAmount.toLocaleString('vi-VN')}đ`
        }
      ]
    };

    onAddPurchaseOrder(newOrder, autoCreateDevices && newStatus === 'COMPLETED');
    setIsCreateModalOpen(false);
    setSelectedOrder(newOrder); // Tự động mở xem chi tiết phiếu vừa tạo
    triggerToast(`Đã tạo thành công phiếu nhập ${newCode}`);
  };

  // ====================================================
  // RENDER: FULL DETAIL VIEW (When an order is selected)
  // Matching the exact look & feel of InvoicesView
  // ====================================================
  if (selectedOrder) {
    const summary = getOrderSummary(selectedOrder);
    const orderCode = selectedOrder.code || selectedOrder.id;
    const rawDate = selectedOrder.orderDate || '16/08/2026';
    const supplierName = selectedOrder.supplierName || 'Nhà Cung Cấp';
    const supplierPhone = selectedOrder.supplierPhone || '0988 888 999';
    const statusKey = selectedOrder.status || 'COMPLETED';
    const currentStatusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG.COMPLETED;
    const paymentStatusKey = selectedOrder.paymentStatus || 'UNPAID';
    const currentPaymentConfig = PAYMENT_STATUS_CONFIG[paymentStatusKey] || PAYMENT_STATUS_CONFIG.UNPAID;

    return (
      <div className="w-full max-w-2xl mx-auto space-y-3 sm:space-y-4 pb-28 animate-fadeIn px-3 sm:px-0">
        
        {/* Sync Toast Notification */}
        {syncToast && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-zinc-900/95 backdrop-blur-md text-white text-xs px-4 py-2 rounded-full shadow-lg flex items-center space-x-2 animate-fadeIn border border-white/10">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{syncToast}</span>
          </div>
        )}

        {/* 1. Top Bar: Back, Code, Quick Status Selector & Actions */}
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-zinc-200/80 shadow-2xs flex items-center justify-between sticky top-14 z-20">
          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => setSelectedOrder(null)}
              className="w-8 h-8 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-600 flex items-center justify-center transition-all cursor-pointer"
              title="Quay lại danh sách phiếu nhập"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-zinc-900 text-base sm:text-lg tracking-tight font-mono">
                  {orderCode}
                </span>

                {/* Quick Status Button with Dropdown Trigger */}
                <div className="relative">
                  <button
                    onClick={() => setShowStatusPicker(!showStatusPicker)}
                    className={`${currentStatusConfig.bg} ${currentStatusConfig.text} border ${currentStatusConfig.border} text-[11px] font-medium px-2.5 py-0.5 rounded-full flex items-center space-x-1.5 hover:opacity-85 transition-all cursor-pointer shadow-2xs`}
                    title="Nhấn để đổi trạng thái phiếu nhập"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${currentStatusConfig.dot}`}></span>
                    <span>{currentStatusConfig.label}</span>
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </button>

                  {/* Status Picker Dropdown Menu */}
                  {showStatusPicker && (
                    <div className="absolute left-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-zinc-200 py-1.5 z-40 animate-fadeIn text-xs">
                      <div className="px-3 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-100">
                        Chuyển Trạng Thái Phiếu:
                      </div>
                      {(Object.keys(STATUS_CONFIG) as PurchaseOrderStatus[]).map((key) => {
                        const cfg = STATUS_CONFIG[key];
                        const isSelected = key === statusKey;
                        return (
                          <button
                            key={key}
                            onClick={() => handleQuickChangeStatus(key)}
                            className={`w-full px-3 py-2 text-left font-medium flex items-center justify-between transition-colors ${
                              isSelected ? `${cfg.bg} ${cfg.text} font-semibold` : 'text-zinc-700 hover:bg-zinc-50'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <span className={`w-2 h-2 rounded-full ${cfg.dot}`}></span>
                              <span>{cfg.label}</span>
                            </div>
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-zinc-500 font-normal mt-0.5">
                Ngày nhập: {rawDate}
              </p>
            </div>
          </div>

          {/* Header Action Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMoreDropdown(!showMoreDropdown)}
              className="w-8 h-8 rounded-xl hover:bg-zinc-100 text-zinc-600 flex items-center justify-center transition-colors cursor-pointer"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {showMoreDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-zinc-200 py-1.5 z-30 animate-fadeIn text-xs">
                <button
                  onClick={() => {
                    setShowMoreDropdown(false);
                    setIsPrintModalOpen(true);
                  }}
                  className="w-full px-3.5 py-2 text-left font-medium text-zinc-700 hover:bg-orange-50 hover:text-orange-600 flex items-center space-x-2"
                >
                  <Printer className="w-4 h-4 text-orange-500" />
                  <span>In phiếu nhập kho (K80 / A4)</span>
                </button>
                {selectedOrder.debtAmount > 0 && (
                  <button
                    onClick={() => {
                      setShowMoreDropdown(false);
                      setPayAmount(selectedOrder.debtAmount);
                      setPayNote(`Thanh toán nợ phiếu ${selectedOrder.code} cho ${selectedOrder.supplierName}`);
                      setIsPayDebtModalOpen(true);
                    }}
                    className="w-full px-3.5 py-2 text-left font-medium text-amber-700 hover:bg-amber-50 flex items-center space-x-2"
                  >
                    <Coins className="w-4 h-4 text-amber-600" />
                    <span>Thanh toán nợ NCC</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowMoreDropdown(false);
                    handleCopy(`${window.location.origin}?po=${orderCode}`, 'link');
                  }}
                  className="w-full px-3.5 py-2 text-left font-medium text-zinc-700 hover:bg-orange-50 hover:text-orange-600 flex items-center space-x-2"
                >
                  <Share2 className="w-4 h-4 text-zinc-400" />
                  <span>{copiedText === 'link' ? 'Đã sao chép liên kết!' : 'Sao chép liên kết phiếu'}</span>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Bạn có chắc muốn xóa/hủy phiếu nhập ${orderCode}?`)) {
                      onDeletePurchaseOrder(selectedOrder.id);
                      setSelectedOrder(null);
                    }
                  }}
                  className="w-full px-3.5 py-2 text-left font-medium text-rose-600 hover:bg-rose-50 flex items-center space-x-2 border-t border-zinc-100"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Hủy / Xóa phiếu nhập</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 2. Supplier Information Card */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200/80 shadow-2xs flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-medium text-sm">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-zinc-800 text-sm sm:text-base">
                  {supplierName}
                </h3>
                <span className="text-[10px] font-medium bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md border border-orange-200">
                  Nhà Cung Cấp
                </span>
              </div>
              <p className="text-xs text-zinc-500 font-mono flex items-center gap-1.5 mt-0.5">
                <Phone className="w-3 h-3 text-orange-500" />
                <span>{supplierPhone}</span>
                {selectedOrder.supplierAddress && (
                  <span className="text-[11px] text-zinc-400 font-sans truncate max-w-[160px] sm:max-w-xs">
                    • {selectedOrder.supplierAddress}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button 
            onClick={() => handleCopy(supplierPhone, 'supplierPhone')}
            className="p-2 rounded-xl text-zinc-400 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
            title="Sao chép SĐT NCC"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>

        {/* 3. Products & Line Items Breakdown List */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-2xs divide-y divide-zinc-100 overflow-hidden">
          <div className="px-4 py-2.5 bg-zinc-50/80 flex items-center justify-between border-b border-zinc-200/60">
            <span className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
              <PackageCheck className="w-3.5 h-3.5 text-orange-600" />
              <span>Danh sách hàng hóa & Thiết bị nhập</span>
            </span>
            <span className="text-[11px] font-medium text-zinc-600 bg-white px-2 py-0.5 rounded-full border border-zinc-200">
              {selectedOrder.items?.length || 0} mặt hàng ({selectedOrder.totalQuantity} món)
            </span>
          </div>

          {(selectedOrder.items || []).map((item, idx) => (
            <div key={idx} className="p-3.5 sm:p-4 space-y-2 hover:bg-zinc-50/60 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-zinc-900 uppercase">
                      {item.modelOrName}
                    </span>
                    {item.storage && (
                      <span className="text-[10px] font-semibold bg-zinc-100 text-zinc-700 px-1.5 py-0.2 rounded">
                        {item.storage}
                      </span>
                    )}
                    {item.color && (
                      <span className="text-[10px] font-medium bg-orange-50 text-orange-700 px-1.5 py-0.2 rounded border border-orange-100">
                        {item.color}
                      </span>
                    )}
                    {item.condition && (
                      <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded border border-emerald-100">
                        {item.condition}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-zinc-500 flex items-center gap-2">
                    <span>Đơn giá: <strong className="text-zinc-800 font-mono">{item.importPrice.toLocaleString('vi-VN')}đ</strong></span>
                    <span>• SL: <strong className="text-zinc-800">{item.quantity}</strong></span>
                    {item.region && <span>• {item.region}</span>}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xs sm:text-sm font-bold text-zinc-900 font-mono">
                    {item.totalAmount.toLocaleString('vi-VN')} <span className="text-[10px]">đ</span>
                  </div>
                  {item.expectedSellPrice && (
                    <div className="text-[10px] text-zinc-400">
                      Bán dự kiến: {item.expectedSellPrice.toLocaleString('vi-VN')}đ
                    </div>
                  )}
                </div>
              </div>

              {/* IMEI List display if available */}
              {item.imeiList && item.imeiList.length > 0 && (
                <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/60 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-600">
                    <span className="flex items-center gap-1">
                      <Barcode className="w-3.5 h-3.5 text-orange-600" />
                      <span>Danh sách {item.imeiList.length} số IMEI:</span>
                    </span>
                    <button
                      onClick={() => handleCopy(item.imeiList!.join(', '), 'allImeis')}
                      className="text-[10px] text-orange-600 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedText === 'allImeis' ? 'Đã sao chép!' : 'Sao chép tất cả'}</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 font-mono">
                    {item.imeiList.map((imei, i) => (
                      <span
                        key={i}
                        onClick={() => handleCopy(imei, `imei-${i}`)}
                        className="text-[10px] bg-white border border-zinc-200 px-2 py-0.5 rounded-md hover:border-orange-400 hover:text-orange-600 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                        title="Bấm để sao chép IMEI"
                      >
                        <span>{imei}</span>
                        {copiedText === `imei-${i}` && <Check className="w-2.5 h-2.5 text-emerald-600" />}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 4. Payment & Financial Summary Card */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200/80 shadow-2xs space-y-2 text-xs">
          <div className="flex justify-between items-center text-zinc-500 font-normal">
            <span>Tiền hàng tạm tính</span>
            <span className="font-mono">{selectedOrder.subTotal.toLocaleString('vi-VN')} đ</span>
          </div>

          {selectedOrder.discountAmount ? (
            <div className="flex justify-between items-center text-emerald-600 font-medium">
              <span>Chiết khấu NCC</span>
              <span className="font-mono">- {selectedOrder.discountAmount.toLocaleString('vi-VN')} đ</span>
            </div>
          ) : null}

          <div className="border-t border-zinc-100 pt-2 flex justify-between items-center text-sm font-bold text-zinc-900">
            <span>Tổng Giá Trị Phiếu Nhập</span>
            <span className="font-mono text-base text-orange-600">
              {selectedOrder.totalAmount.toLocaleString('vi-VN')} đ
            </span>
          </div>

          <div className="bg-orange-50/50 p-2.5 rounded-xl border border-orange-100 space-y-1.5 mt-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-600">Đã thanh toán cho NCC</span>
              <span className="font-bold text-emerald-600 font-mono">
                {selectedOrder.paidAmount.toLocaleString('vi-VN')} đ
              </span>
            </div>

            {selectedOrder.fundName && (
              <div className="text-[11px] text-zinc-500 flex items-center justify-between">
                <span>Nguồn tiền chi:</span>
                <span className="font-medium text-zinc-700">💳 {selectedOrder.fundName}</span>
              </div>
            )}

            <div className="border-t border-orange-100 pt-1.5 flex justify-between items-center text-xs">
              <span className="font-semibold text-zinc-800">Công nợ NCC còn lại</span>
              <div className="flex items-center space-x-2">
                <span className={`font-black font-mono ${selectedOrder.debtAmount > 0 ? 'text-rose-600 text-sm' : 'text-emerald-600'}`}>
                  {selectedOrder.debtAmount.toLocaleString('vi-VN')} đ
                </span>
                {selectedOrder.debtAmount > 0 && (
                  <button
                    onClick={() => {
                      setPayAmount(selectedOrder.debtAmount);
                      setPayNote(`Thanh toán nợ phiếu ${selectedOrder.code} cho ${selectedOrder.supplierName}`);
                      setIsPayDebtModalOpen(true);
                    }}
                    className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded-lg shadow-2xs transition-all cursor-pointer"
                  >
                    Trả nợ ngay
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 5. Editable Notes Card */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-orange-600" />
              <span>Ghi chú phiếu nhập</span>
            </span>
            {!isEditingNote && (
              <button
                onClick={() => {
                  setNoteContent(selectedOrder.notes || '');
                  setIsEditingNote(true);
                }}
                className="text-[11px] text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3 h-3" />
                <span>Sửa</span>
              </button>
            )}
          </div>

          {isEditingNote ? (
            <div className="space-y-2 pt-1">
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Nhập ghi chú cho phiếu nhập này..."
                className="w-full p-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-orange-500 focus:bg-white resize-none h-20 font-normal text-zinc-800"
              />
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setIsEditingNote(false)}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveNote}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white rounded-xl shadow-xs"
                >
                  Lưu Ghi Chú
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-600 leading-relaxed font-normal">
              {selectedOrder.notes || 'Chưa có ghi chú kèm theo.'}
            </p>
          )}
        </div>

        {/* 6. Activity Log / History Card */}
        {selectedOrder.history && selectedOrder.history.length > 0 && (
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200/80 shadow-2xs">
            <ActivityLog logs={selectedOrder.history} className="space-y-2.5" />
          </div>
        )}

        {/* 7. Metadata Details Card */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200/80 shadow-2xs grid grid-cols-2 gap-3 sm:gap-4 text-xs">
          <div>
            <span className="text-zinc-400 block text-[11px] font-normal">Người lập phiếu</span>
            <span className="font-medium text-zinc-800 mt-0.5 block">
              {selectedOrder.creatorName || 'Admin PhoneHouse'}
            </span>
          </div>

          <div>
            <span className="text-zinc-400 block text-[11px] font-normal">KTV Kiểm định KCS</span>
            <span className="font-medium text-zinc-800 mt-0.5 block">
              {selectedOrder.qcInspector || 'KTV Hoàng Tuấn (Chờ duyệt)'}
            </span>
          </div>

          <div className="pt-2 border-t border-zinc-100 col-span-2">
            <span className="text-zinc-400 block text-[11px] font-normal">Kho tiếp nhận nhập hàng</span>
            <span className="font-semibold text-orange-700 mt-0.5 block">
              🏢 {selectedOrder.warehouseName || 'Kho Tổng (Hà Nội)'}
            </span>
          </div>
        </div>

        {/* 8. Sticky Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-zinc-200/80 py-2.5 px-4 z-30 shadow-lg">
          <div className="max-w-2xl mx-auto grid grid-cols-2 gap-3">
            <button
              onClick={() => setIsPrintModalOpen(true)}
              className="py-2.5 px-4 bg-white hover:bg-orange-50 text-orange-600 border border-orange-200 font-semibold rounded-xl text-xs sm:text-sm flex items-center justify-center space-x-2 transition-all shadow-2xs active:scale-95 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-orange-600" />
              <span>In Phiếu Nhập</span>
            </button>

            {selectedOrder.debtAmount > 0 ? (
              <button
                onClick={() => {
                  setPayAmount(selectedOrder.debtAmount);
                  setPayNote(`Thanh toán nợ phiếu ${selectedOrder.code} cho ${selectedOrder.supplierName}`);
                  setIsPayDebtModalOpen(true);
                }}
                className="py-2.5 px-4 bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white font-semibold rounded-xl text-xs sm:text-sm flex items-center justify-center space-x-2 transition-all shadow-md shadow-rose-500/20 active:scale-95 cursor-pointer"
              >
                <Coins className="w-4 h-4" />
                <span>Trả Nợ NCC</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  triggerToast('Phiếu nhập đã được hoàn tất và lưu trữ vào kho.');
                }}
                className="py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-xl text-xs sm:text-sm flex items-center justify-center space-x-2 transition-all shadow-md shadow-emerald-500/20 active:scale-95 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Đã Hoàn Tất Nhập</span>
              </button>
            )}
          </div>
        </div>

        {/* MODAL: In Phiếu Nhập K80 & A4 Preview */}
        {isPrintModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-zinc-200 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
                <h3 className="font-semibold text-zinc-900 text-sm flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-orange-600" />
                  <span>Xem Trước Phiếu Nhập Kho K80</span>
                </h3>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="w-7 h-7 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center hover:bg-zinc-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Thermal Paper Look */}
              <div className="p-4 bg-amber-50/40 border border-dashed border-zinc-300 rounded-2xl font-mono text-xs space-y-3 text-zinc-900">
                <div className="text-center space-y-0.5">
                  <h4 className="font-semibold text-sm uppercase">PHONE HOUSE STORE</h4>
                  <p className="text-[10px] text-zinc-600">Hệ thống phân phối iPhone chính hãng</p>
                  <div className="border-b border-zinc-400 my-2"></div>
                  <h5 className="font-semibold text-xs">PHIẾU NHẬP HÀNG TỪ NCC</h5>
                  <p className="text-[11px] font-semibold text-orange-700">{orderCode}</p>
                  <p className="text-[10px] text-zinc-500">Ngày: {rawDate}</p>
                </div>

                <div className="text-[11px] space-y-0.5 pt-1">
                  <div>Nhà cung cấp: <span className="font-semibold">{supplierName}</span></div>
                  <div>Điện thoại: <span className="font-semibold">{supplierPhone}</span></div>
                  <div>Kho nhận: <span>{selectedOrder.warehouseName}</span></div>
                  <div>Người lập: <span>{selectedOrder.creatorName}</span></div>
                </div>

                <div className="border-t border-b border-dashed border-zinc-400 py-2 space-y-1.5">
                  {(selectedOrder.items || []).map((it, i) => (
                    <div key={i} className="space-y-0.5 text-[11px]">
                      <div className="flex justify-between">
                        <span className="font-medium">{it.modelOrName} {it.storage || ''} ({it.color || ''})</span>
                        <span className="font-bold">{it.totalAmount.toLocaleString('vi-VN')}đ</span>
                      </div>
                      <div className="text-[10px] text-zinc-600 flex justify-between">
                        <span>{it.importPrice.toLocaleString('vi-VN')}đ x {it.quantity}</span>
                        {it.condition && <span>{it.condition}</span>}
                      </div>
                      {it.imeiList && it.imeiList.length > 0 && (
                        <div className="text-[9px] text-zinc-500 pl-2">
                          IMEI: {it.imeiList.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-1 text-[11px] pt-1">
                  <div className="flex justify-between">
                    <span>Tổng tiền hàng:</span>
                    <span>{selectedOrder.subTotal.toLocaleString('vi-VN')} đ</span>
                  </div>
                  {selectedOrder.discountAmount ? (
                    <div className="flex justify-between text-emerald-700">
                      <span>Chiết khấu:</span>
                      <span>-{selectedOrder.discountAmount.toLocaleString('vi-VN')} đ</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between font-bold text-sm border-t border-zinc-300 pt-1">
                    <span>Tổng thanh toán:</span>
                    <span>{selectedOrder.totalAmount.toLocaleString('vi-VN')} đ</span>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>Đã trả NCC:</span>
                    <span>{selectedOrder.paidAmount.toLocaleString('vi-VN')} đ</span>
                  </div>
                  <div className="flex justify-between font-bold text-rose-700">
                    <span>Công nợ còn lại:</span>
                    <span>{selectedOrder.debtAmount.toLocaleString('vi-VN')} đ</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-zinc-400 pt-3 flex justify-around text-center text-[10px]">
                  <div>
                    <p className="font-semibold">Đại diện NCC</p>
                    <p className="text-zinc-400 mt-6">(Ký & ghi rõ họ tên)</p>
                  </div>
                  <div>
                    <p className="font-semibold">Thủ Kho Nhận</p>
                    <p className="text-zinc-400 mt-6">(Ký & ghi rõ họ tên)</p>
                  </div>
                </div>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="flex-1 py-2 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl"
                >
                  Đóng
                </button>
                <button
                  onClick={() => {
                    window.print();
                    setIsPrintModalOpen(false);
                  }}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 rounded-xl shadow-xs flex items-center justify-center space-x-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Xác Nhận In</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Thanh toán nợ NCC */}
        {isPayDebtModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-zinc-200 space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
                <h3 className="font-semibold text-zinc-900 text-sm flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-orange-600" />
                  <span>Thanh Toán Công Nợ Nhà Cung Cấp</span>
                </h3>
                <button
                  onClick={() => setIsPayDebtModalOpen(false)}
                  className="w-7 h-7 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center hover:bg-zinc-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 bg-rose-50 rounded-2xl border border-rose-100 space-y-1 text-xs">
                <div className="text-zinc-600">Phiếu nhập: <strong className="text-zinc-900">{selectedOrder.code}</strong></div>
                <div className="text-zinc-600">Nhà cung cấp: <strong className="text-zinc-900">{selectedOrder.supplierName}</strong></div>
                <div className="text-rose-700 font-semibold flex justify-between pt-1 border-t border-rose-200">
                  <span>Số nợ cần trả:</span>
                  <span className="font-mono font-bold text-sm">{selectedOrder.debtAmount.toLocaleString('vi-VN')} đ</span>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-zinc-600 font-semibold mb-1">Số tiền thanh toán (VNĐ)</label>
                  <input
                    type="number"
                    value={payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value))}
                    max={selectedOrder.debtAmount}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-bold font-mono text-zinc-900 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-600 font-semibold mb-1">Nguồn tiền / Quỹ chi trả</label>
                  <select
                    value={selectedPayFundId}
                    onChange={(e) => setSelectedPayFundId(e.target.value)}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-medium text-zinc-900 focus:outline-none focus:border-orange-500"
                  >
                    {funds.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name} (Số dư: {f.currentBalance.toLocaleString('vi-VN')}đ)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-600 font-semibold mb-1">Ghi chú thanh toán</label>
                  <input
                    type="text"
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-900 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  onClick={() => setIsPayDebtModalOpen(false)}
                  className="flex-1 py-2.5 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  onClick={handleConfirmPayDebt}
                  className="flex-1 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 rounded-xl shadow-xs cursor-pointer"
                >
                  Xác Nhận Chi Trả
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // ====================================================
  // RENDER: CLEAN MOBILE-FIRST MASTER LIST VIEW
  // (Identical clean layout as InvoicesView)
  // ====================================================
  return (
    <div className="w-full max-w-2xl mx-auto space-y-3 sm:space-y-4 pb-28 animate-fadeIn px-3 sm:px-0">
      
      {/* Sync Toast Notification */}
      {syncToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-zinc-900/95 backdrop-blur-md text-white text-xs px-4 py-2 rounded-full shadow-lg flex items-center space-x-2 animate-fadeIn border border-white/10">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{syncToast}</span>
        </div>
      )}

      {/* 1. Quick Horizontal Status Filter Pills */}
      <div className="flex items-center space-x-2 overflow-x-auto scrollbar-none py-1">
        <button
          onClick={() => setStatusFilter('all')}
          className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all shrink-0 cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          <List className="w-3.5 h-3.5" />
          <span>Tất cả ({purchaseOrders.length})</span>
        </button>

        <button
          onClick={() => setStatusFilter('COMPLETED')}
          className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all shrink-0 cursor-pointer ${
            statusFilter === 'COMPLETED'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-2xs'
              : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span>Đã nhập kho</span>
        </button>

        <button
          onClick={() => setStatusFilter('QC_CHECKING')}
          className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all shrink-0 cursor-pointer ${
            statusFilter === 'QC_CHECKING'
              ? 'bg-amber-50 text-amber-700 border border-amber-300 shadow-2xs'
              : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
          <span>Kiểm định KCS</span>
        </button>

        <button
          onClick={() => setStatusFilter('DEBT')}
          className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all shrink-0 cursor-pointer ${
            statusFilter === 'DEBT'
              ? 'bg-rose-50 text-rose-700 border border-rose-300 shadow-2xs'
              : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
          <span>Còn nợ NCC</span>
        </button>

        {/* Filter Sliders Button with Dropdown */}
        <div className="relative shrink-0 ml-auto">
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className="p-1.5 bg-white border border-zinc-200 hover:border-orange-300 rounded-full text-zinc-600 hover:text-orange-600 transition-all cursor-pointer shadow-2xs"
            title="Lọc thời gian & Nhà Cung Cấp"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>

          {showFilterDropdown && (
            <div className="absolute right-0 top-9 z-30 bg-white rounded-2xl shadow-xl border border-zinc-200 p-2.5 w-56 space-y-2 animate-fadeIn text-xs">
              <div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block px-2 py-0.5">Thời gian</span>
                {(['all', 'today', 'yesterday', 'this_week', 'this_month'] as TimeFilter[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTimeFilter(t);
                      setShowFilterDropdown(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl font-medium transition-all ${
                      timeFilter === t ? 'bg-orange-50 text-orange-600 font-bold' : 'text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {t === 'all' && 'Toàn thời gian'}
                    {t === 'today' && 'Hôm nay'}
                    {t === 'yesterday' && 'Hôm qua'}
                    {t === 'this_week' && '7 ngày qua'}
                    {t === 'this_month' && 'Tháng này'}
                  </button>
                ))}
              </div>

              <div className="border-t border-zinc-100 pt-1.5">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block px-2 py-0.5">Lọc theo NCC</span>
                <select
                  value={supplierFilter}
                  onChange={(e) => {
                    setSupplierFilter(e.target.value);
                    setShowFilterDropdown(false);
                  }}
                  className="w-full p-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700"
                >
                  <option value="all">Tất cả Nhà Cung Cấp</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Search Bar with Barcode Scanner Icon */}
      <div className="relative w-full">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm mã PN, tên NCC, model máy, số IMEI..."
          className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm bg-white border border-zinc-200/90 rounded-2xl focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-normal text-zinc-800 shadow-2xs"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-1.5">
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="text-zinc-400 hover:text-zinc-600 mr-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
          <button
            onClick={() => {
              setSearchQuery(searchQuery ? '' : 'PN-');
            }}
            className="text-orange-500 hover:text-orange-600 p-0.5 cursor-pointer"
            title="Quét barcode / IMEI"
          >
            <ScanLine className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3. Total Amount Summary Card (Matching InvoicesView format) */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-zinc-700 flex items-center gap-1">
            <span>Tổng giá trị nhập hàng</span>
            <ChevronDown className="w-3 h-3 text-zinc-400" />
          </div>
          <div className="text-xs text-zinc-400 font-normal mt-0.5">
            {filteredOrders.length} phiếu nhập • {totalItemCount} sản phẩm
          </div>
          {totalOutstandingDebt > 0 && (
            <div className="text-[11px] font-bold text-rose-600 mt-1 flex items-center gap-1">
              <span>● Còn nợ NCC:</span>
              <span className="font-mono">{totalOutstandingDebt.toLocaleString('vi-VN')}đ</span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right">
            <div className="text-xl sm:text-2xl font-bold text-zinc-900 font-mono tracking-tight">
              {totalImportValue.toLocaleString('vi-VN')} <span className="text-xs text-zinc-900 font-bold">đ</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-100/90 text-orange-600 flex items-center justify-center shrink-0">
            <PackageCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 4. Purchase Orders Grouped by Date */}
      {Object.keys(groupedOrders).length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-zinc-200/80 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
            <PackageCheck className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-zinc-800 text-sm">Không tìm thấy phiếu nhập nào</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto font-normal">
            Chưa có phiếu nhập phù hợp với bộ lọc hoặc từ khóa tìm kiếm.
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium text-xs rounded-xl shadow-xs cursor-pointer"
          >
            + Tạo Phiếu Nhập Hàng Mới
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedOrders).map(([dateGroup, items]) => {
            const orderList = items as PurchaseOrder[];
            return (
              <div key={dateGroup} className="space-y-1.5">
                {/* Date Header */}
                <div className="px-1 text-[11px] sm:text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📅</span>
                  <span>{dateGroup}</span>
                </div>

                {/* Orders in this Date Group */}
                <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-2xs divide-y divide-zinc-100 overflow-hidden">
                  {orderList.map((order) => {
                    const summary = getOrderSummary(order);
                    const orderCode = order.code || order.id;
                    const timeSnippet = (order.orderDate || '2026-08-16').slice(5);
                    const supplierName = order.supplierName || 'Nhà Cung Cấp';
                    const amount = order.totalAmount || 0;
                    const st = order.status || 'COMPLETED';
                    const stCfg = STATUS_CONFIG[st] || STATUS_CONFIG.COMPLETED;
                    const paySt = order.paymentStatus || 'UNPAID';
                    const payCfg = PAYMENT_STATUS_CONFIG[paySt] || PAYMENT_STATUS_CONFIG.UNPAID;

                    return (
                      <div
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        className="p-3.5 sm:p-4 hover:bg-orange-50/20 transition-all cursor-pointer flex items-center justify-between gap-3 group active:bg-orange-50/50"
                      >
                        {/* Left: Orange document/package icon container */}
                        <div className="w-11 h-11 rounded-2xl bg-orange-50/90 border border-orange-100 flex items-center justify-center text-orange-500 shrink-0 group-hover:scale-105 transition-transform">
                          <PackageCheck className="w-5 h-5 text-orange-500" />
                        </div>

                        {/* Center: Supplier name, Code & time, Status tags, Product summary */}
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <h3 className="font-bold text-zinc-900 text-sm sm:text-base truncate group-hover:text-orange-600 transition-colors">
                              {supplierName}
                            </h3>
                            <span className="text-xs text-zinc-400 font-mono font-medium">
                              {orderCode} • {timeSnippet}
                            </span>
                          </div>

                          {/* Status Badges Row */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`${stCfg.bg} ${stCfg.text} border ${stCfg.border} text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${stCfg.dot}`}></span>
                              <span>{stCfg.label}</span>
                            </span>

                            <span className={`${payCfg.bg} ${payCfg.text} border ${payCfg.border} text-[10px] font-medium px-2 py-0.5 rounded-full`}>
                              {payCfg.label}
                            </span>

                            {order.warehouseName && (
                              <span className="text-[10px] text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200/60 truncate max-w-[130px]">
                                🏢 {order.warehouseName}
                              </span>
                            )}
                          </div>

                          {/* Line items summary string */}
                          <p className="text-xs text-zinc-500 font-normal truncate">
                            {summary.firstItem}{' '}
                            {summary.remainingCount && (
                              <span className="text-zinc-400 font-medium">{summary.remainingCount}</span>
                            )}
                          </p>
                        </div>

                        {/* Right: Total Amount and Chevron */}
                        <div className="flex items-center space-x-2 shrink-0">
                          <div className="text-right">
                            <div className="text-sm sm:text-base font-bold text-zinc-900 font-mono">
                              {amount.toLocaleString('vi-VN')} <span className="text-xs">đ</span>
                            </div>
                            {order.debtAmount > 0 && (
                              <div className="text-[10px] text-rose-600 font-semibold font-mono">
                                Nợ: {order.debtAmount.toLocaleString('vi-VN')}đ
                              </div>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating "+ Nhập Hàng Mới" Button on Mobile / Master View */}
      <div className="fixed bottom-4 right-4 z-40">
        <button
          onClick={() => {
            setNewSupplierId(suppliers[0]?.id || '');
            setIsCreateModalOpen(true);
          }}
          className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs sm:text-sm px-4 py-3 rounded-full shadow-lg shadow-orange-500/30 flex items-center space-x-2 active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>Nhập Hàng Mới</span>
        </button>
      </div>

      {/* ====================================================
          MODAL: TẠO PHIẾU NHẬP HÀNG MỚI (Mobile Friendly)
      ==================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-zinc-200 space-y-4 max-h-[92vh] overflow-y-auto">
            
            <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                  <PackageCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 text-base">Tạo Phiếu Nhập Hàng Mới</h3>
                  <p className="text-[11px] text-zinc-500">Nhập iPhone, phụ kiện & quản lý công nợ NCC</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center hover:bg-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePurchaseOrder} className="space-y-4 text-xs">
              
              {/* Section 1: NCC & Kho */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-50 p-3 rounded-2xl border border-zinc-200/70">
                <div>
                  <label className="block text-zinc-600 font-bold mb-1">Nhà Cung Cấp *</label>
                  <select
                    value={newSupplierId}
                    onChange={(e) => setNewSupplierId(e.target.value)}
                    required
                    className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-semibold text-zinc-800 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">-- Chọn Nhà Cung Cấp --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.outstandingDebt > 0 ? `(Đang nợ: ${Math.round(s.outstandingDebt/1000000)}Tr)` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-600 font-bold mb-1">Kho Tiếp Nhận *</label>
                  <select
                    value={newWarehouseId}
                    onChange={(e) => setNewWarehouseId(e.target.value)}
                    className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-semibold text-zinc-800 focus:outline-none focus:border-orange-500"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-600 font-bold mb-1">Ngày Nhập Hàng</label>
                  <input
                    type="date"
                    value={newOrderDate}
                    onChange={(e) => setNewOrderDate(e.target.value)}
                    className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-semibold text-zinc-800 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Section 2: Danh Sách Sản Phẩm Nhập */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-zinc-800 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-orange-600" />
                    <span>Danh Sách Thiết Bị / Hàng Hóa</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCatalogModal(true)}
                    className="px-2.5 py-1 bg-orange-50 text-orange-600 hover:bg-orange-100 font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>Chọn từ Danh Mục</span>
                  </button>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {orderItems.map((item, idx) => (
                    <div key={item.id} className="p-3 bg-zinc-50/80 rounded-2xl border border-zinc-200/80 space-y-2.5 relative">
                      {orderItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteItemRow(idx)}
                          className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-rose-600 p-1 cursor-pointer"
                          title="Xóa dòng này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div className="sm:col-span-2">
                          <label className="text-[11px] font-bold text-zinc-600 block mb-0.5">Tên Model / Thiết bị</label>
                          <input
                            type="text"
                            value={item.modelOrName}
                            onChange={(e) => handleUpdateItemRow(idx, { modelOrName: e.target.value })}
                            placeholder="VD: iPhone 16 Pro Max 256GB"
                            className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-bold text-zinc-900 focus:outline-none focus:border-orange-500"
                            required
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-zinc-600 block mb-0.5">Màu sắc</label>
                          <input
                            type="text"
                            value={item.color || ''}
                            onChange={(e) => handleUpdateItemRow(idx, { color: e.target.value })}
                            placeholder="Titan Sa Mạc..."
                            className="w-full p-2 bg-white border border-zinc-200 rounded-xl text-zinc-900 focus:outline-none focus:border-orange-500"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-zinc-600 block mb-0.5">Dung lượng</label>
                          <input
                            type="text"
                            value={item.storage || ''}
                            onChange={(e) => handleUpdateItemRow(idx, { storage: e.target.value })}
                            placeholder="128GB / 256GB"
                            className="w-full p-2 bg-white border border-zinc-200 rounded-xl text-zinc-900 focus:outline-none focus:border-orange-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-zinc-600 block mb-0.5">Tình trạng</label>
                          <select
                            value={item.condition || 'New Seal'}
                            onChange={(e) => handleUpdateItemRow(idx, { condition: e.target.value as any })}
                            className="w-full p-2 bg-white border border-zinc-200 rounded-xl text-zinc-900 focus:outline-none focus:border-orange-500"
                          >
                            <option value="New Seal">New Seal (Chưa Active)</option>
                            <option value="Like New 99%">Like New 99%</option>
                            <option value="98% Cấn Nhẹ">98% Cấn Nhẹ</option>
                            <option value="95% Trầy Xước">95% Trầy Xước</option>
                            <option value="Hàng Cũ Trưng Bày">Hàng Trưng Bày</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-zinc-600 block mb-0.5">Số Lượng</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleUpdateItemRow(idx, { quantity: Number(e.target.value) })}
                            className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-bold text-center text-zinc-900 focus:outline-none focus:border-orange-500"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-zinc-600 block mb-0.5">Giá vốn nhập (đ)</label>
                          <input
                            type="number"
                            value={item.importPrice}
                            onChange={(e) => handleUpdateItemRow(idx, { importPrice: Number(e.target.value) })}
                            className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-mono font-bold text-zinc-900 focus:outline-none focus:border-orange-500"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-zinc-600 block mb-0.5">Thành tiền (đ)</label>
                          <div className="w-full p-2 bg-zinc-100 border border-zinc-200 rounded-xl font-mono font-bold text-orange-600">
                            {item.totalAmount.toLocaleString('vi-VN')}
                          </div>
                        </div>
                      </div>

                      {/* Nhập danh sách IMEI */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[11px] font-bold text-zinc-600 flex items-center gap-1">
                            <Barcode className="w-3.5 h-3.5 text-orange-600" />
                            <span>Danh sách IMEI 15 số (Nhập cách nhau dấu phẩy hoặc xuống dòng):</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const randomImeis = Array.from({ length: item.quantity }, () => 
                                `35${Math.floor(1000000000000 + Math.random() * 9000000000000)}`
                              );
                              handleUpdateItemRow(idx, { imeiList: randomImeis });
                            }}
                            className="text-[10px] text-orange-600 hover:underline font-medium cursor-pointer"
                          >
                            + Sinh {item.quantity} IMEI ngẫu nhiên
                          </button>
                        </div>
                        <input
                          type="text"
                          value={item.imeiList?.join(', ') || ''}
                          onChange={(e) => {
                            const list = e.target.value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
                            handleUpdateItemRow(idx, { imeiList: list });
                          }}
                          placeholder="VD: 358921098492019, 358921098492020..."
                          className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-mono text-[11px] text-zinc-900 focus:outline-none focus:border-orange-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 3: Tài chính & Thanh toán */}
              <div className="bg-orange-50/40 p-3 rounded-2xl border border-orange-100 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-zinc-500 block mb-0.5">Tạm tính:</span>
                    <span className="font-bold text-zinc-900 font-mono text-sm">{formSubTotal.toLocaleString('vi-VN')} đ</span>
                  </div>

                  <div>
                    <label className="text-zinc-600 font-bold block mb-0.5">Chiết khấu (đ):</label>
                    <input
                      type="number"
                      value={newDiscountAmount}
                      onChange={(e) => setNewDiscountAmount(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-zinc-200 rounded-lg font-mono font-bold text-zinc-900"
                    />
                  </div>

                  <div>
                    <span className="text-zinc-500 block mb-0.5">Tổng thanh toán:</span>
                    <span className="font-black text-orange-600 font-mono text-sm">{formTotalAmount.toLocaleString('vi-VN')} đ</span>
                  </div>

                  <div>
                    <label className="text-zinc-600 font-bold block mb-0.5">Trả trước ngay (đ):</label>
                    <input
                      type="number"
                      value={newPaidAmount}
                      onChange={(e) => setNewPaidAmount(Number(e.target.value))}
                      className="w-full p-1.5 bg-white border border-zinc-200 rounded-lg font-mono font-bold text-emerald-600"
                    />
                  </div>
                </div>

                {newPaidAmount > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-orange-100">
                    <div>
                      <label className="text-zinc-600 font-bold block mb-0.5">Quỹ chi tiền</label>
                      <select
                        value={newFundId}
                        onChange={(e) => setNewFundId(e.target.value)}
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-semibold text-zinc-800"
                      >
                        {funds.map(f => (
                          <option key={f.id} value={f.id}>{f.name} ({f.currentBalance.toLocaleString('vi-VN')}đ)</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-zinc-600 font-bold block mb-0.5">Hình thức chi</label>
                      <select
                        value={newPaymentMethod}
                        onChange={(e) => setNewPaymentMethod(e.target.value as any)}
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-semibold text-zinc-800"
                      >
                        <option value="Tiền mặt tại két">Tiền mặt tại két</option>
                        <option value="Chuyển khoản VietQR">Chuyển khoản VietQR</option>
                        <option value="Ghi nhận công nợ NCC">Ghi nhận công nợ NCC</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-orange-200 font-bold">
                  <span className="text-zinc-700">Công nợ ghi nhận nợ NCC:</span>
                  <span className={`font-mono text-sm ${formDebtAmount > 0 ? 'text-rose-600 font-black' : 'text-emerald-600'}`}>
                    {formDebtAmount.toLocaleString('vi-VN')} đ
                  </span>
                </div>
              </div>

              {/* Section 4: Ghi chú & Cấu hình */}
              <div className="space-y-2">
                <div>
                  <label className="block text-zinc-600 font-bold mb-1">Ghi chú phiếu nhập</label>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Ghi chú về lô hàng, số hóa đơn đỏ..."
                    className="w-full p-2 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-900 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="autoCreate"
                    checked={autoCreateDevices}
                    onChange={(e) => setAutoCreateDevices(e.target.checked)}
                    className="w-4 h-4 text-orange-600 rounded cursor-pointer"
                  />
                  <label htmlFor="autoCreate" className="text-zinc-700 font-medium cursor-pointer">
                    Tự động tạo máy vào <strong>Kho IMEI</strong> khi hoàn tất phiếu nhập
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 py-2.5 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 rounded-xl shadow-md shadow-orange-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  Hoàn Tất & Lưu Phiếu Nhập
                </button>
              </div>

            </form>
          </div>
        </div>
      )}


      {/* CATALOG SELECT MODAL */}
      {showCatalogModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-zinc-900 tracking-tight">Chọn Hàng Hóa Từ Danh Mục (Catalog)</h2>
                  <p className="text-xs text-zinc-500 font-medium">Tìm và chọn mã hàng chuẩn để tự động điền thông tin</p>
                </div>
              </div>
              <button 
                onClick={() => setShowCatalogModal(false)}
                className="p-2 bg-white rounded-full text-zinc-400 hover:text-rose-500 shadow-sm border border-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 border-b border-zinc-100">
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input 
                  type="text"
                  placeholder="Tìm kiếm theo Tên, SKU..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-indigo-500 font-medium"
                  autoFocus
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
              {catalogItems
                .filter(i => i.name.toLowerCase().includes(catalogSearch.toLowerCase()) || i.sku.toLowerCase().includes(catalogSearch.toLowerCase()))
                .map(item => (
                <div key={item.id} className="p-3 border-b border-zinc-100 hover:bg-indigo-50/50 flex items-center justify-between group transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-zinc-100 rounded-lg text-zinc-500">
                      {item.category === 'DEVICE' ? <Smartphone className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="font-bold text-zinc-900">{item.name}</div>
                      <div className="text-xs text-zinc-500 mt-0.5 font-medium space-x-2">
                        <span className="text-indigo-600 font-mono bg-indigo-50 px-1 rounded">{item.sku}</span>
                        <span>{item.model}</span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleSelectFromCatalog(item)}
                    className="px-4 py-1.5 bg-white border border-zinc-200 text-indigo-600 font-bold rounded-lg shadow-sm hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all opacity-0 group-hover:opacity-100"
                  >
                    Chọn
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
