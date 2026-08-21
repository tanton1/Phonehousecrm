import React, { useState, useEffect, useMemo } from 'react';
import { DeviceItem, SalesInvoice, Lead, StoreBranch, WarehouseInfo, StoreSettings, TradeInAppraisal, ProductItem, Partner, UserAccount } from '../types';
import { processCheckoutTransaction } from '../services/firestoreService';
import { TradeInAssessmentModal } from './TradeInAssessmentModal';
import { isWarehouseActive } from '../utils/warehouseLifecycle';
import { 
  ShoppingCart, 
  Search, 
  Smartphone, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard, 
  QrCode, 
  CheckCircle2, 
  Printer, 
  ShieldCheck, 
  Package, 
  Percent,
  Receipt,
  Zap,
  Sparkles,
  User,
  Tag,
  Gift,
  Camera,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Scan,
  ArrowRight,
  X,
  Phone,
  MapPin,
  Check,
  SlidersHorizontal,
  BatteryCharging,
  AlertCircle,
  FileText,
  BadgePercent,
  RefreshCw,
  Clock,
  Sparkle,
  Building2,
  Warehouse,
  Store,
  ScanFace
} from 'lucide-react';

interface POSSalesViewProps {
  currentUser?: UserAccount | null;
  devices: DeviceItem[];
  invoices: SalesInvoice[];
  leads?: Lead[];
  branches?: StoreBranch[];
  warehouses?: WarehouseInfo[];
  storeSettings?: StoreSettings;
  products: ProductItem[];
  partners: Partner[];
  onCreateInvoice: (invoice: SalesInvoice) => void;
  onUpdateDeviceStatus: (imei: string, status: DeviceItem['status'], customerName?: string, phone?: string) => void;
  preSelectedDevice?: DeviceItem | null;
  onNavigateToInvoices?: () => void;
  funds: import('../types').FundAccount[];
  onAddTransaction: (tx: import('../types').CashTransaction) => void;
  onAddTradeIn?: (tradeIn: TradeInAppraisal) => void;
  onAddDevice?: (device: DeviceItem) => void;
  onOpenCheckIn?: () => void;
  onUpdateProduct?: (product: ProductItem) => void;
}

// Phone model image mapping helper
const getPhoneImage = (model: string, color: string = '') => {
  const m = model.toLowerCase();
  const c = color.toLowerCase();

  if (m.includes('16 pro max') || m.includes('16 pro')) {
    if (c.includes('sa mạc') || c.includes('desert') || c.includes('vàng')) {
      return 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=300&auto=format&fit=crop&q=80';
    }
    if (c.includes('tự nhiên') || c.includes('natural')) {
      return 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=300&auto=format&fit=crop&q=80';
    }
    return 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=300&auto=format&fit=crop&q=80';
  }
  if (m.includes('15 pro')) {
    return 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=300&auto=format&fit=crop&q=80';
  }
  if (m.includes('14') || m.includes('13')) {
    return 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=300&auto=format&fit=crop&q=80';
  }
  return 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=300&auto=format&fit=crop&q=80';
};

export const POSSalesView: React.FC<POSSalesViewProps> = ({
  currentUser,
  devices,
  invoices,
  leads = [],
  branches = [],
  warehouses = [],
  storeSettings,
  onCreateInvoice,
  onUpdateDeviceStatus,
  preSelectedDevice,
  onNavigateToInvoices,
  funds,
  onAddTransaction,
  onAddTradeIn,
  onAddDevice,
  onOpenCheckIn,
  products,
  partners,
  onUpdateProduct
}) => {
  // Available stock items
  const inStockDevices = devices.filter(d => d.status === 'in_stock');

  // Warehouses list
  const activeWarehouses = useMemo(() => {
    return (warehouses || []).filter(isWarehouseActive);
  }, [warehouses]);

  // Selected Branch & Warehouse state
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    if (branches && branches.length > 0) return branches[0].id;
    return 'BRANCH_1';
  });

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(() => {
    if (warehouses && warehouses.length > 0) return warehouses[0].id;
    return 'KHO_PHONEHOUSE';
  });

  const currentBranch = useMemo(() => {
    return branches.find(b => b.id === selectedBranchId) || branches[0] || {
      id: 'BRANCH_1',
      name: 'Phone House Cầu Giấy (Apple Premium)',
      address: '136 Cầu Giấy, Q. Cầu Giấy, Hà Nội',
      phone: '0909.123.456',
      code: 'HN-CG'
    };
  }, [branches, selectedBranchId]);

  const currentWarehouse = useMemo(() => {
    return activeWarehouses.find(w => w.id === currentBranch.warehouseId) || activeWarehouses[0];
  }, [activeWarehouses, currentBranch]);

  // Active Stepper stage (1: Chọn máy, 2: Khách hàng, 3: Phụ kiện & Ưu đãi, 4: Thanh toán)
  const [activeStep, setActiveStep] = useState<number>(1);

  // Cart & Devices State
  const [selectedDevices, setSelectedDevices] = useState<DeviceItem[]>(() => {
    if (preSelectedDevice) return [preSelectedDevice];
    return [];
  });

  // Customer State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerType, setCustomerType] = useState<'Thân thiết' | 'VIP' | 'Khách lẻ'>('Khách lẻ');
  const [customerNotes, setCustomerNotes] = useState('');

  // Accessories bundle
  const [accessories, setAccessories] = useState<Array<{ id: string; name: string; price: number; selected: boolean; note?: string; productRef?: ProductItem }>>([]);

  useEffect(() => {
    const prodAccs = products.filter(p => p.category === 'Phụ kiện' && p.status === 'active' && p.stockQuantity > 0).map(p => ({ 
      id: p.id, 
      name: p.name, 
      price: p.sellPrice, 
      selected: false, 
      note: `Tồn kho: ${p.stockQuantity}`, 
      productRef: p 
    }));
    setAccessories(prodAccs.length > 0 ? prodAccs : []);
  }, [products]);

  // Warranty Package
  const [warrantyPackage, setWarrantyPackage] = useState(() => storeSettings?.warrantyPackages?.[0]?.name || 'Bảo hành tiêu chuẩn 6 tháng');
  
  React.useEffect(() => {
    if (storeSettings?.warrantyPackages && storeSettings.warrantyPackages.length > 0) {
      if (!storeSettings.warrantyPackages.find(p => p.name === warrantyPackage)) {
        setWarrantyPackage(storeSettings.warrantyPackages[0].name);
        setWarrantyPrice(storeSettings.warrantyPackages[0].price);
      }
    }
  }, [storeSettings, warrantyPackage]);
  const [warrantyPrice, setWarrantyPrice] = useState(0);

  // Discounts & Trade-in
  const [voucherCode, setVoucherCode] = useState('VOUCHER200K');
  const [voucherDiscount, setVoucherDiscount] = useState(200000);
  const [tradeInModel, setTradeInModel] = useState('');
  const [tradeInDiscount, setTradeInDiscount] = useState(0);
  const [tradeInImei, setTradeInImei] = useState('');

  // Modals & Drawers State
  const [showDevicePickerModal, setShowDevicePickerModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [scannerQuery, setScannerQuery] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showAccessoriesModal, setShowAccessoriesModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showTradeInAssessmentModal, setShowTradeInAssessmentModal] = useState(false);
  const [lastAppraisal, setLastAppraisal] = useState<TradeInAppraisal | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDetailsDropdown, setShowDetailsDropdown] = useState(false);
  const [showRecentInvoicesDrawer, setShowRecentInvoicesDrawer] = useState(false);

  // Payment Method
  const [paymentMethod, setPaymentMethod] = useState<SalesInvoice['paymentMethod']>('Chuyển khoản QR');
  const [selectedFundId, setSelectedFundId] = useState<string>('');
  const [cashGiven, setCashGiven] = useState<number>(0);
  const [installmentCompany, setInstallmentCompany] = useState('Home Credit (CCCD gắn chip)');
  const [installmentTenor, setInstallmentTenor] = useState(6);
  const [installmentContractCode, setInstallmentContractCode] = useState('');
  const [customDownPayment, setCustomDownPayment] = useState<number | null>(null);
  const [downPaymentPercent, setDownPaymentPercent] = useState(30);

  // Thermal Slip Modal
  const [createdInvoiceForPrint, setCreatedInvoiceForPrint] = useState<SalesInvoice | null>(null);
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);

  // If preSelectedDevice changes from outside
  useEffect(() => {
    if (preSelectedDevice) {
      if (!selectedDevices.some(d => d.imei === preSelectedDevice.imei)) {
        setSelectedDevices([preSelectedDevice, ...selectedDevices]);
      }
    }
  }, [preSelectedDevice]);

  // Calculations
  const devicesTotal = selectedDevices.reduce((sum, d) => sum + d.sellPrice, 0);
  const selectedAccessoriesList = accessories.filter(a => a.selected);
  const accessoriesTotal = selectedAccessoriesList.reduce((sum, a) => sum + a.price, 0);
  const rawTotal = devicesTotal + accessoriesTotal + warrantyPrice;
  const finalAmount = Math.max(0, rawTotal - voucherDiscount - tradeInDiscount);

  // Installment calculations
  const defaultDownPayment = Math.round((finalAmount * downPaymentPercent) / 100);
  const downPaymentAmount = customDownPayment !== null ? customDownPayment : defaultDownPayment;
  const remainingLoan = finalAmount - downPaymentAmount;
  const monthlyPaymentAmount = installmentTenor > 0 ? Math.round(remainingLoan / installmentTenor) : 0;
  const cashChange = Math.max(0, cashGiven - finalAmount);

  // Keyboard Shortcuts Hook (F2, F4, F8, F9, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        if (e.key === 'Escape') {
          (document.activeElement as HTMLElement)?.blur();
        }
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        setShowDevicePickerModal(true);
      } else if (e.key === 'F4') {
        e.preventDefault();
        setShowCustomerModal(true);
      } else if (e.key === 'F8') {
        e.preventDefault();
        setShowDiscountModal(true);
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (selectedDevices.length > 0) {
          handleCheckout();
        }
      } else if (e.key === 'Escape') {
        setShowDevicePickerModal(false);
        setShowScannerModal(false);
        setShowCustomerModal(false);
        setShowAccessoriesModal(false);
        setShowDiscountModal(false);
        setShowPaymentModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDevices, customerName, customerPhone, finalAmount]);

  // Handlers
  const resetForm = () => {
    setSelectedDevices([]);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerNotes('');
    setCashGiven(0);
    setPaymentMethod('Chuyển khoản QR');
    setActiveStep(1);
    setCustomDownPayment(null);
  };
  
  const handleAddDevice = (device: DeviceItem) => {
    if (!selectedDevices.some(d => d.imei === device.imei)) {
      setSelectedDevices([...selectedDevices, device]);
    }
    setShowDevicePickerModal(false);
    setShowScannerModal(false);
  };

  const handleRemoveDevice = (imei: string) => {
    setSelectedDevices(selectedDevices.filter(d => d.imei !== imei));
  };

  const handleApplyVoucher = (code: string, amount: number) => {
    setVoucherCode(code);
    setVoucherDiscount(amount);
    setShowDiscountModal(false);
  };

  const handleCheckout = () => {
    if (isProcessingCheckout) return;
    if (selectedDevices.length === 0) {
      alert('Vui lòng chọn ít nhất 1 cây máy để thanh toán!');
      return;
    }
    if (!customerName || !customerPhone) {
      alert('Vui lòng nhập thông tin khách hàng trước khi thanh toán!');
      setShowCustomerModal(true);
      return;
    }
    if (tradeInDiscount > 0 && !tradeInImei.trim()) {
      alert('Vui lòng nhập IMEI máy thu cũ để nhập kho!');
      setShowDiscountModal(true);
      return;
    }

    setIsProcessingCheckout(true);

    let receiptAmount = 0;
    let fundTypeToUse: import('../types').PaymentFundType = 'CASH';
    
    if (paymentMethod === 'Trả góp') {
      receiptAmount = downPaymentAmount; // Thu tiền trả trước ngay lập tức
      fundTypeToUse = 'CASH'; // Tạm thời mặc định tiền mặt cho khoản trả trước
    } else {
      receiptAmount = finalAmount;
      if (paymentMethod === 'Chuyển khoản QR') fundTypeToUse = 'BANK';
      if (paymentMethod === 'Tiền mặt') fundTypeToUse = 'CASH';
      if (paymentMethod === 'Quẹt thẻ POS') fundTypeToUse = 'POS_CARD';
    }

    // Resolve exact matching fund without arbitrary funds[0] fallback
    const eligibleFunds = funds.filter(f =>
      f.type === fundTypeToUse &&
      f.branchId === currentBranch.id &&
      f.isArchived !== true &&
      f.isActive !== false
    );
    const fund = (selectedFundId ? eligibleFunds.find(f => f.id === selectedFundId) : null) ||
                 eligibleFunds.find(f => f.isDefault) || eligibleFunds[0] || null;

    let cashTx: import('../types').CashTransaction | null = null;
    if (receiptAmount > 0) {
      if (!fund) {
        alert('Lỗi kế toán: Không tìm thấy Quỹ Tiền Mặt hoặc Tài Khoản Ngân Hàng phù hợp để thu tiền.');
        setIsProcessingCheckout(false);
        return;
      }
      cashTx = {
        id: `TX-${Date.now()}`,
        code: `PT-${Math.floor(1000 + Math.random() * 9000)}`,
        type: 'RECEIPT',
        category: 'SALES_REVENUE',
        categoryName: 'Thu tiền bán hàng',
        amount: receiptAmount,
        fundId: fund.id,
        fundType: fund.type,
        fundName: fund.name,
        date: new Date().toLocaleString('sv-SE').replace(' ', 'T'), // YYYY-MM-DDTHH:mm
        partnerName: customerName,
        partnerPhone: customerPhone,
        creator: currentUser?.displayName || 'Thu Ngân PhoneHouse',
        branchId: currentBranch.id,
        notes: `Thu tiền khách mua hàng (Đơn ${customerPhone})`,
        status: 'COMPLETED'
      };
    }

    const newInvoice: SalesInvoice = {
      id: `INV-${Date.now().toString().slice(-6)}`,
      invoiceCode: `HD-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Date.now().toString().slice(-4)}`,
      customerName,
      customerPhone,
      phone: customerPhone,
      paymentFundId: fund?.id || '',
      paymentTransactionId: cashTx?.id || '',
      devices: selectedDevices.map(d => ({
        imei: d.imei,
        model: d.model,
        storage: d.storage,
        price: d.sellPrice
      })),
      imeiList: selectedDevices.map(d => d.imei),
      items: [
        ...selectedDevices.map(d => ({
          name: `${d.model} ${d.storage} (${d.color})`,
          quantity: 1,
          unitPrice: d.sellPrice,
          totalPrice: d.sellPrice,
          imei: d.imei,
          type: 'phone' as const,
          storage: d.storage,
          color: d.color
        })),
        ...selectedAccessoriesList.map(a => ({
          name: a.name,
          quantity: 1,
          unitPrice: a.price,
          totalPrice: a.price,
          type: 'accessory' as const
        }))
      ],
      accessories: selectedAccessoriesList.map(a => ({ name: a.name, price: a.price })),
      totalAmount: rawTotal,
      discountAmount: voucherDiscount,
      tradeInDeduction: tradeInDiscount,
      finalAmount,
      paymentMethod,
      installmentDetails: paymentMethod === 'Trả góp' ? {
        financeCompany: installmentCompany,
        tenorMonths: installmentTenor,
        downPayment: downPaymentAmount,
        monthlyPayment: monthlyPaymentAmount
      } : undefined,
      warrantyPackage,
      salesStaff: 'Nhật ADMIN (Tuấn Bán Hàng)',
      createdAt: new Date().toISOString().split('T')[0],
      createdDate: new Date().toLocaleString('vi-VN', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      status: paymentMethod === 'Trả góp' ? 'pending' : 'completed',
      installmentDisbursementStatus: paymentMethod === 'Trả góp' ? 'PENDING' : undefined,
      installmentExpectedAmount: paymentMethod === 'Trả góp' ? (finalAmount - downPaymentAmount) : undefined,
      installmentContractCode: paymentMethod === 'Trả góp' ? installmentContractCode : undefined,
      branch: currentBranch.name,
      branchId: currentBranch.id,
      warehouseId: currentWarehouse.id,
      warehouseName: currentWarehouse.name,
      history: [{
        time: new Date().toLocaleString("sv-SE").replace("T", " ").slice(0, 16),
        action: paymentMethod === 'Trả góp' ? 'Tạo đơn trả góp' : 'Tạo đơn hàng thành công',
        user: "Nhật ADMIN"
      }]
    };

    // 1. Prepare Accessories to sell payload
    const accessoriesToSell: { product: ProductItem; quantity: number }[] = [];
    selectedAccessoriesList.forEach(acc => {
      if (acc.productRef) {
        accessoriesToSell.push({ product: acc.productRef, quantity: 1 });
      }
    });

    // 2. Prepare Trade-in Device payload (if any)
    let tradeInDevice: DeviceItem | null = null;
    if (tradeInDiscount > 0) {
      tradeInDevice = {
        id: `DEV-TRD-${Date.now().toString().slice(-5)}`,
        imei: tradeInImei,
        serialNo: 'SN-TRD-' + Date.now().toString().slice(-4),
        model: tradeInModel || 'iPhone Thu Cũ',
        storage: '128GB',
        color: 'Thu Cũ Khách',
        region: 'LL/A (Thu Cũ)',
        batteryHealth: 85,
        condition: '98% Cấn Nhẹ',
        buyPrice: tradeInDiscount,
        sellPrice: Math.round((tradeInDiscount * 1.25) / 100000) * 100000,
        status: 'in_stock',
        warehouse: currentWarehouse.id,
        branch: currentBranch.name,
        branchId: currentBranch.id,
        supplier: `Thu Cũ Đổi Mới Khách (${customerName} - ${customerPhone})`,
        receivedDate: new Date().toISOString().split('T')[0],
        warrantyPeriodMonths: 3,
        icloudStatus: 'Clean / Đã Thoát',
        screenStatus: 'Zin Màn Keng',
        notes: `Tự động nhập kho từ đơn hàng POS ${newInvoice.id}. Khách: ${customerName} (${customerPhone}). Giá thu: ${tradeInDiscount.toLocaleString('vi-VN')}đ`
      };
    }

    // 3. Single Atomic Writer: Execute atomic transaction (NO PRE-WRITES)
    const customerPartner = partners.find(p => p.phone === customerPhone) || null;
    const financeCompanyPartner = paymentMethod === 'Trả góp' ? (partners.find(p => p.name.toLowerCase().includes(installmentCompany.toLowerCase()) || p.supplierCategory === 'FINANCE_PARTNER') || null) : null;
    const fundToUpdate = fund;

    processCheckoutTransaction({
      invoice: newInvoice,
      devicesToSell: selectedDevices,
      accessoriesToSell,
      cashTx,
      tradeInDevice,
      customerPartner,
      financeCompanyPartner,
      fundToUpdate
    })
      .then(() => {
        setCreatedInvoiceForPrint(newInvoice);
        setShowPaymentModal(false);
      })
      .catch(err => {
        console.error('Firestore atomic checkout error:', err);
        alert('Lỗi lưu đơn hàng vào hệ thống: ' + (err?.message || 'Vui lòng kiểm tra kết nối mạng.'));
      })
      .finally(() => setIsProcessingCheckout(false));
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-3 sm:space-y-4 pb-32">
      {/* 0. Top Bar Quick Actions */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">POS Thu Ngân</h2>
        </div>
        <div className="flex items-center space-x-2">
          {onNavigateToInvoices && (
            <button
              onClick={() => setShowRecentInvoicesDrawer(true)}
              className="text-xs font-medium text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200/80 px-2.5 py-1 rounded-xl flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Đơn hôm nay</span>
            </button>
          )}
          {onNavigateToInvoices && (
            <button
              onClick={onNavigateToInvoices}
              className="text-xs font-medium text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200/80 px-2.5 py-1 rounded-xl flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Quản lý hóa đơn ({invoices.length})</span>
              <span className="sm:hidden">Tất cả</span>
            </button>
          )}
        </div>
      </div>

      {/* ⚡ KEYBOARD SHORTCUTS BAR (F2 - F9) */}
      <div className="bg-zinc-900 text-white rounded-2xl p-2.5 px-4 shadow-sm flex items-center justify-between overflow-x-auto text-[11px] gap-2">
        <div className="flex items-center space-x-1.5 font-bold text-orange-400 shrink-0">
          <Zap className="w-3.5 h-3.5 animate-pulse" />
          <span>Phím Tắt Thu Ngân:</span>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <button type="button" onClick={() => setShowDevicePickerModal(true)} className="bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg flex items-center gap-1 font-mono transition-colors cursor-pointer">
            <kbd className="bg-orange-500 text-white px-1.5 rounded text-[10px] font-bold">F2</kbd>
            <span>Chọn IMEI</span>
          </button>
          <button type="button" onClick={() => setShowCustomerModal(true)} className="bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg flex items-center gap-1 font-mono transition-colors cursor-pointer">
            <kbd className="bg-orange-500 text-white px-1.5 rounded text-[10px] font-bold">F4</kbd>
            <span>Khách Hàng</span>
          </button>
          <button type="button" onClick={() => setShowDiscountModal(true)} className="bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg flex items-center gap-1 font-mono transition-colors cursor-pointer">
            <kbd className="bg-orange-500 text-white px-1.5 rounded text-[10px] font-bold">F8</kbd>
            <span>Voucher</span>
          </button>
          <button type="button" onClick={handleCheckout} disabled={selectedDevices.length === 0} className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-3 py-1 rounded-lg flex items-center gap-1.5 font-mono font-bold shadow-xs transition-transform active:scale-95 disabled:opacity-40 cursor-pointer">
            <kbd className="bg-black/30 text-white px-1.5 rounded text-[10px] font-bold">F9</kbd>
            <span>Thanh Toán (F9)</span>
          </button>
        </div>
      </div>

      {/* Store & Warehouse Selection Bar */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-orange-200/80 p-3 shadow-2xs grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="flex items-center space-x-2 bg-orange-50/50 p-2 rounded-xl border border-orange-100">
          <Store className="w-4 h-4 text-orange-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Cửa hàng xuất bán:</span>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full bg-transparent font-bold text-zinc-900 focus:outline-none truncate text-xs cursor-pointer"
            >
              {branches && branches.length > 0 ? (
                branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))
              ) : (
                <option value="">Chưa có cửa hàng</option>
              )}
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-2 bg-orange-50/50 p-2 rounded-xl border border-orange-100">
          <Warehouse className="w-4 h-4 text-orange-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Kho trừ tồn hàng:</span>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full bg-transparent font-bold text-zinc-900 focus:outline-none truncate text-xs cursor-pointer"
            >
              {activeWarehouses.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 1. TOP STEPPER (1 Chọn máy -> 2 Khách hàng -> 3 Phụ kiện -> 4 Thanh toán) */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-zinc-100 shadow-2xs p-3.5 sm:p-4">
        <div className="relative flex items-center justify-between">
          {/* Progress bar line */}
          <div className="absolute left-8 right-8 top-3.5 -translate-y-1/2 h-0.5 bg-zinc-100 -z-0" />
          <div 
            className="absolute left-8 top-3.5 -translate-y-1/2 h-0.5 bg-orange-500 transition-all duration-300 -z-0"
            style={{ 
              width: activeStep === 1 ? '0%' : activeStep === 2 ? '33%' : activeStep === 3 ? '66%' : '100%' 
            }}
          />

          {/* Step 1: Chọn máy */}
          <button 
            onClick={() => setActiveStep(1)}
            className="flex flex-col items-center group relative z-10 focus:outline-none"
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
              selectedDevices.length > 0 
                ? 'bg-orange-500 text-white ring-4 ring-orange-100 shadow-xs' 
                : 'bg-orange-500 text-white'
            }`}>
              1
            </div>
            <span className={`text-[11px] mt-1.5 font-bold transition-colors ${
              activeStep === 1 ? 'text-orange-600 font-extrabold' : 'text-zinc-700'
            }`}>
              Chọn máy
            </span>
          </button>

          {/* Step 2: Khách hàng */}
          <button 
            onClick={() => {
              setActiveStep(2);
              setShowCustomerModal(true);
            }}
            className="flex flex-col items-center group relative z-10 focus:outline-none"
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
              customerName 
                ? 'bg-zinc-100 text-zinc-700 border border-zinc-200 group-hover:bg-orange-50 group-hover:text-orange-600' 
                : 'bg-zinc-100 text-zinc-400'
            }`}>
              2
            </div>
            <span className={`text-[11px] mt-1.5 font-medium transition-colors ${
              activeStep === 2 ? 'text-orange-600 font-bold' : 'text-zinc-500'
            }`}>
              Khách hàng
            </span>
          </button>

          {/* Step 3: Phụ kiện */}
          <button 
            onClick={() => {
              setActiveStep(3);
              setShowAccessoriesModal(true);
            }}
            className="flex flex-col items-center group relative z-10 focus:outline-none"
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
              selectedAccessoriesList.length > 0 
                ? 'bg-zinc-100 text-zinc-700 border border-zinc-200 group-hover:bg-orange-50 group-hover:text-orange-600' 
                : 'bg-zinc-100 text-zinc-400'
            }`}>
              3
            </div>
            <span className={`text-[11px] mt-1.5 font-medium transition-colors ${
              activeStep === 3 ? 'text-orange-600 font-bold' : 'text-zinc-500'
            }`}>
              Phụ kiện
            </span>
          </button>

          {/* Step 4: Thanh toán */}
          <button 
            onClick={() => {
              setActiveStep(4);
              setShowPaymentModal(true);
            }}
            className="flex flex-col items-center group relative z-10 focus:outline-none"
          >
            <div className="w-7 h-7 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center text-xs font-black transition-all group-hover:bg-orange-50 group-hover:text-orange-600">
              4
            </div>
            <span className={`text-[11px] mt-1.5 font-medium transition-colors ${
              activeStep === 4 ? 'text-orange-600 font-bold' : 'text-zinc-500'
            }`}>
              Thanh toán
            </span>
          </button>
        </div>
      </div>

      {/* 2. SCAN IMEI / SEARCH IMEI CARD */}
      <div 
        onClick={() => setShowScannerModal(true)}
        className="bg-white hover:bg-orange-50/20 border border-zinc-200/90 hover:border-orange-300 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs flex items-center justify-between cursor-pointer transition-all group"
      >
        <div className="flex items-center space-x-3">
          {/* Orange scanner viewfinder icon in square */}
          <div className="w-11 h-11 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shrink-0 group-hover:scale-105 transition-transform">
            <Scan className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="font-black text-zinc-900 text-sm group-hover:text-orange-600 transition-colors">
              Quét IMEI hoặc nhập IMEI
            </div>
            <div className="text-[11px] text-zinc-500">
              Tự động kiểm tra kho & thông tin bảo hành
            </div>
          </div>
        </div>

        {/* Camera square icon button on right */}
        <div className="w-10 h-10 rounded-xl border border-zinc-200 bg-white flex items-center justify-center text-zinc-700 group-hover:border-orange-300 group-hover:text-orange-600 shadow-2xs">
          <Camera className="w-5 h-5" />
        </div>
      </div>

      {/* 3. SELECTED PRODUCT CARD(S) */}
      {selectedDevices.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-zinc-200 rounded-3xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-zinc-900 text-sm">Chưa có máy nào trong đơn bán</h4>
            <p className="text-xs text-zinc-500 mt-0.5">Vui lòng quét IMEI hoặc chọn máy từ kho iPhone có sẵn</p>
          </div>
          <button
            onClick={() => setShowDevicePickerModal(true)}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl shadow-xs"
          >
            + Chọn máy từ kho
          </button>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs space-y-3">
          {/* List of selected devices */}
          {selectedDevices.map((device) => {
            const phoneImg = getPhoneImage(device.model, device.color);

            return (
              <div 
                key={device.imei}
                className="flex items-center justify-between gap-3 pb-3 border-b border-zinc-100 last:border-0 last:pb-0"
              >
                {/* Left: Phone Image */}
                <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center p-1.5 shrink-0 overflow-hidden shadow-2xs">
                  <img
                    src={phoneImg}
                    alt={device.model}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain drop-shadow-md"
                  />
                </div>

                {/* Middle: Details */}
                <div className="flex-1 min-w-0 space-y-1">
                  <h4 className="font-black text-zinc-900 text-sm sm:text-base tracking-tight truncate">
                    {device.model} {device.storage}
                  </h4>
                  <div className="text-xs text-zinc-500 truncate">
                    {device.color}
                  </div>
                  <div className="flex items-center space-x-1.5 text-[11px] text-zinc-500 font-mono">
                    <span>IMEI: <strong className="text-orange-600 font-bold">{device.imei}</strong></span>
                    <span>•</span>
                    <span className="flex items-center text-orange-700 font-bold">
                      Pin {device.batteryHealth}%
                      <span className="ml-1 inline-block w-4 h-2 bg-orange-500 rounded-2xs align-middle" />
                    </span>
                  </div>

                  {/* Price */}
                  <div className="text-base sm:text-lg font-black text-orange-600 font-mono pt-0.5">
                    {device.sellPrice.toLocaleString('vi-VN')}đ
                  </div>
                </div>

                {/* Right: Delete button */}
                <button
                  onClick={() => handleRemoveDevice(device.imei)}
                  className="w-10 h-10 rounded-xl border border-zinc-200 hover:border-rose-200 bg-white hover:bg-rose-50 text-zinc-400 hover:text-rose-600 flex items-center justify-center transition-all shrink-0 shadow-2xs"
                  title="Xóa máy khỏi giỏ"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}

          {/* "+ Thêm sản phẩm" button with dashed outline border */}
          <button
            onClick={() => setShowDevicePickerModal(true)}
            className="w-full py-2.5 sm:py-3 border-2 border-dashed border-orange-200 hover:border-orange-400 bg-orange-50/30 hover:bg-orange-50 text-orange-600 font-bold text-xs sm:text-sm rounded-xl sm:rounded-2xl flex items-center justify-center space-x-1.5 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Thêm sản phẩm</span>
          </button>
        </div>
      )}

      {/* 4. SECTION CARDS (Khách hàng, Phụ kiện & Bảo hành, Ưu đãi & Thu cũ) */}
      <div className="space-y-2.5">
        {/* Card 1: Khách hàng */}
        <div 
          onClick={() => setShowCustomerModal(true)}
          className="bg-white hover:bg-orange-50/20 border border-zinc-200/90 hover:border-orange-300 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs flex items-center justify-between cursor-pointer transition-all group"
        >
          <div className="flex items-start space-x-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 mt-0.5">
              <User className="w-4 h-4" />
            </div>
            <div>
              <div className="font-black text-zinc-900 text-sm">
                Khách hàng
              </div>
              <div className="text-xs text-zinc-800 font-semibold mt-0.5">
                {customerName}
              </div>
              <div className="text-[11px] text-zinc-500 font-mono">
                {customerPhone}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1 text-xs font-bold text-orange-600 group-hover:translate-x-0.5 transition-transform">
            <span>Chọn / Thêm</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>

        {/* Card 2: Phụ kiện & Bảo hành */}
        <div 
          onClick={() => setShowAccessoriesModal(true)}
          className="bg-white hover:bg-orange-50/20 border border-zinc-200/90 hover:border-orange-300 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs flex items-center justify-between cursor-pointer transition-all group"
        >
          <div className="flex items-start space-x-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 mt-0.5">
              <Gift className="w-4 h-4" />
            </div>
            <div>
              <div className="font-black text-zinc-900 text-sm">
                Phụ kiện & Bảo hành
              </div>
              <div className="text-xs text-zinc-800 font-semibold mt-0.5">
                {selectedAccessoriesList.length} phụ kiện
              </div>
              <div className="text-[11px] text-zinc-500 truncate max-w-[180px] sm:max-w-xs">
                {warrantyPackage}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1 text-xs font-black text-orange-600 group-hover:translate-x-0.5 transition-transform font-mono">
            <span>{accessoriesTotal.toLocaleString('vi-VN')}đ</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>

        {/* Card 3: Ưu đãi & Thu cũ */}
        <div 
          onClick={() => setShowDiscountModal(true)}
          className="bg-white hover:bg-orange-50/20 border border-zinc-200/90 hover:border-orange-300 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs flex items-center justify-between cursor-pointer transition-all group"
        >
          <div className="flex items-start space-x-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 mt-0.5">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <div className="font-black text-zinc-900 text-sm">
                Ưu đãi & Thu cũ
              </div>
              <div className="text-xs text-zinc-800 font-semibold mt-0.5">
                {voucherDiscount > 0 ? `Voucher (${voucherCode})` : 'Voucher'}
              </div>
              <div className="text-[11px] text-zinc-500">
                {tradeInDiscount > 0 ? `Thu cũ (${tradeInModel})` : 'Thu cũ đổi mới'}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1 text-right group-hover:translate-x-0.5 transition-transform">
            <div>
              <span className="block text-xs font-black text-rose-600 font-mono">
                {voucherDiscount > 0 ? `-${voucherDiscount.toLocaleString('vi-VN')}đ` : '0đ'}
              </span>
              <span className="text-[10px] text-zinc-400 font-medium">
                {tradeInDiscount > 0 ? `Trừ -${tradeInDiscount.toLocaleString('vi-VN')}đ` : 'Chưa áp dụng'}
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-orange-600 ml-1" />
          </div>
        </div>
      </div>

      {/* 5. Sticky Floating Quick Action Bar */}
      <div className="fixed bottom-14 sm:bottom-4 left-0 right-0 z-40 px-3 sm:px-4 max-w-5xl mx-auto">
        <div className="bg-zinc-900 text-white rounded-3xl p-3.5 sm:p-4 shadow-2xl border border-zinc-800 backdrop-blur-md">
          {/* Collapsible Order Breakdown Details */}
          {showDetailsDropdown && (
            <div className="mb-3.5 pb-3.5 border-b border-zinc-800 space-y-2 text-xs">
              <div className="flex justify-between items-center text-zinc-400">
                <span>Tiền máy ({selectedDevices.length} cây):</span>
                <span className="font-mono text-zinc-200 font-bold">{devicesTotal.toLocaleString('vi-VN')} đ</span>
              </div>
              <div className="flex justify-between items-center text-zinc-400">
                <span>Phụ kiện ({selectedAccessoriesList.length} món):</span>
                <span className="font-mono text-zinc-200 font-bold">+{accessoriesTotal.toLocaleString('vi-VN')} đ</span>
              </div>
              {voucherDiscount > 0 && (
                <div className="flex justify-between items-center text-rose-400">
                  <span>Giảm giá Voucher:</span>
                  <span className="font-mono font-bold">-{voucherDiscount.toLocaleString('vi-VN')} đ</span>
                </div>
              )}
              {tradeInDiscount > 0 && (
                <div className="flex justify-between items-center text-orange-400">
                  <span>Trừ tiền Thu cũ đổi mới:</span>
                  <span className="font-mono font-bold">-{tradeInDiscount.toLocaleString('vi-VN')} đ</span>
                </div>
              )}
              <div className="flex justify-between items-center text-zinc-400">
                <span>Gói bảo hành:</span>
                <span className="text-orange-400 font-bold">{warrantyPackage}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            {/* Left: Total Price & Collapsible trigger */}
            <div className="space-y-0.5">
              <div className="text-[11px] text-zinc-400 font-medium">
                Tổng thanh toán
              </div>
              <div className="text-xl sm:text-2xl font-black text-orange-500 font-mono tracking-tight">
                {finalAmount.toLocaleString('vi-VN')}đ
              </div>
              <button
                onClick={() => setShowDetailsDropdown(!showDetailsDropdown)}
                className="flex items-center space-x-1 text-[11px] text-zinc-400 hover:text-white font-medium transition-colors"
              >
                <span>{showDetailsDropdown ? 'Thu gọn chi tiết' : '^ Chi tiết đơn hàng'}</span>
                {showDetailsDropdown ? <ChevronDown className="w-3.5 h-3.5" /> : null}
              </button>
            </div>

            {/* Right: Large Orange Checkout Button */}
            <button
              onClick={() => setShowPaymentModal(true)}
              className="bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white font-black text-sm sm:text-base px-6 sm:px-8 py-3.5 rounded-2xl shadow-lg shadow-orange-500/25 flex items-center space-x-2 active:scale-95 transition-all cursor-pointer"
            >
              <span>Thanh toán</span>
              <ChevronRight className="w-4 h-4 stroke-[3]" />
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: SCANNER & FAST SEARCH IMEI */}
      {/* ======================================================== */}
      {showScannerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3.5 sm:p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-4 sm:p-5 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                  <Scan className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-zinc-900">Quét & Nhập IMEI 15 Số</h3>
                  <p className="text-[10px] text-zinc-500">Tra cứu nhanh từ kho Phone House</p>
                </div>
              </div>
              <button 
                onClick={() => setShowScannerModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Simulated Camera Viewfinder */}
            <div className="relative h-36 bg-zinc-900 rounded-2xl overflow-hidden flex flex-col items-center justify-center text-white border-2 border-orange-500/50 shadow-inner">
              <div className="absolute inset-x-8 inset-y-4 border-2 border-dashed border-orange-400/80 rounded-xl flex items-center justify-center animate-pulse">
                <div className="w-full h-0.5 bg-orange-500 shadow-[0_0_8px_#f97316] animate-bounce" />
              </div>
              <Camera className="w-6 h-6 text-orange-400 mb-1" />
              <span className="text-[11px] font-bold text-zinc-300">Đang nhận diện Barcode / IMEI</span>
            </div>

            {/* Search input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700">Hoặc nhập thủ công IMEI / Tên máy:</label>
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Nhập 15 số IMEI hoặc '16 Pro'..."
                  value={scannerQuery}
                  onChange={(e) => setScannerQuery(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500 font-mono"
                  autoFocus
                />
              </div>
            </div>

            {/* Quick in-stock suggestions */}
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Máy Có Sẵn Trong Kho:
              </span>
              {inStockDevices
                .filter(d => 
                  !scannerQuery || 
                  d.imei.includes(scannerQuery) || 
                  d.model.toLowerCase().includes(scannerQuery.toLowerCase())
                )
                .slice(0, 4)
                .map((device) => (
                  <div
                    key={device.imei}
                    onClick={() => handleAddDevice(device)}
                    className="p-2.5 bg-zinc-50 hover:bg-orange-50 border border-zinc-200 hover:border-orange-300 rounded-xl flex items-center justify-between cursor-pointer transition-all"
                  >
                    <div>
                      <div className="font-bold text-xs text-zinc-900">{device.model} {device.storage}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">IMEI: {device.imei} • {device.color}</div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-xs text-orange-600 font-mono">{device.sellPrice.toLocaleString('vi-VN')}đ</span>
                      <span className="block text-[9px] text-orange-600 font-bold">Chọn +</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: DEVICE PICKER FROM INVENTORY */}
      {/* ======================================================== */}
      {showDevicePickerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3.5 sm:p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl p-4 sm:p-5 space-y-3.5 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-zinc-900">Chọn Thêm Máy Từ Kho ({inStockDevices.length})</h3>
                  <p className="text-[10px] text-zinc-500">Tất cả máy trạng thái 'Sẵn sàng bán'</p>
                </div>
              </div>
              <button 
                onClick={() => setShowDevicePickerModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* List */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {inStockDevices.map((device) => {
                const isSelected = selectedDevices.some(d => d.imei === device.imei);
                return (
                  <div
                    key={device.imei}
                    onClick={() => {
                      if (!isSelected) handleAddDevice(device);
                      else handleRemoveDevice(device.imei);
                    }}
                    className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-orange-50 border-orange-300 ring-2 ring-orange-200' 
                        : 'bg-zinc-50 hover:bg-orange-50/50 border-zinc-200 hover:border-orange-200'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center shrink-0">
                        <Smartphone className="w-5 h-5 text-orange-500" />
                      </div>
                      <div>
                        <div className="font-bold text-xs sm:text-sm text-zinc-900">{device.model} {device.storage}</div>
                        <div className="text-[11px] text-zinc-500 font-mono flex items-center space-x-1.5 flex-wrap gap-y-0.5">
                          <span>IMEI: {device.imei.slice(-6)}</span>
                          <span>• Pin {device.batteryHealth}%</span>
                          <span>• {device.condition}</span>
                          <span className="bg-orange-100/80 text-orange-800 text-[9px] font-bold px-1.5 py-0.2 rounded font-sans">
                            🏢 {device.warehouse === 'KHO_XSTORE' ? 'Kho Xstore' : device.warehouse === 'KHO_TONG' ? 'Kho Tổng' : 'Kho Cầu Giấy'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-black text-xs sm:text-sm text-orange-600 font-mono">
                        {device.sellPrice.toLocaleString('vi-VN')} đ
                      </span>
                      <span className={`block text-[10px] font-bold ${isSelected ? 'text-orange-600' : 'text-zinc-500'}`}>
                        {isSelected ? '✓ Đã chọn' : '+ Chọn'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setShowDevicePickerModal(false)}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs"
            >
              Hoàn tất chọn máy ({selectedDevices.length})
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: CUSTOMER SELECTION & ADD MODAL */}
      {/* ======================================================== */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3.5 sm:p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-4 sm:p-5 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-zinc-900">Thông Tin Khách Hàng</h3>
                  <p className="text-[10px] text-zinc-500">Lưu vào sổ CRM & in lên hóa đơn K80</p>
                </div>
              </div>
              <button 
                onClick={() => setShowCustomerModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Tên khách hàng *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn Tuấn"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Số điện thoại / Zalo *</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0909 123 456"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Địa chỉ nhận máy / Giao hàng</label>
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="123 Cầu Giấy, Hà Nội"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                />
              </div>

              {/* Quick Select from CRM Leads */}
              {leads.length > 0 && (
                <div className="pt-2 border-t border-zinc-100 space-y-1.5">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Khách Hàng Gần Đây Từ CRM:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {leads.slice(0, 3).map(l => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => {
                          setCustomerName(l.name);
                          setCustomerPhone(l.phone);
                        }}
                        className="px-2.5 py-1 bg-zinc-100 hover:bg-orange-50 border border-zinc-200 hover:border-orange-300 rounded-lg text-[11px] text-zinc-700 font-medium transition-all"
                      >
                        {l.name} ({l.phone})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowCustomerModal(false)}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs shadow-xs"
            >
              Lưu Thông Tin Khách Hàng
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: ACCESSORIES & WARRANTY BUNDLE */}
      {/* ======================================================== */}
      {showAccessoriesModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3.5 sm:p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-4 sm:p-5 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                  <Gift className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-zinc-900">Phụ Kiện & Gói Bảo Hành</h3>
                  <p className="text-[10px] text-zinc-500">Combo tặng kèm và bảo hành toàn diện</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAccessoriesModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Accessories list */}
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Phụ kiện đính kèm:</span>
              {accessories.map((acc, idx) => (
                <label
                  key={acc.id}
                  className={`p-2.5 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-all ${
                    acc.selected 
                      ? 'bg-orange-50 border-orange-200 text-zinc-900 font-semibold' 
                      : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate pr-2">
                    <input
                      type="checkbox"
                      checked={acc.selected}
                      onChange={() => {
                        const updated = [...accessories];
                        updated[idx].selected = !updated[idx].selected;
                        setAccessories(updated);
                      }}
                      className="rounded text-orange-500 focus:ring-orange-400"
                    />
                    <div className="truncate">
                      <span className="block truncate">{acc.name}</span>
                      {acc.note && <span className="text-[10px] text-zinc-400 font-normal">{acc.note}</span>}
                    </div>
                  </div>
                  <span className="text-orange-600 font-mono font-bold shrink-0">
                    +{acc.price.toLocaleString('vi-VN')}đ
                  </span>
                </label>
              ))}
            </div>

            {/* Warranty selector */}
            <div className="space-y-2 pt-2 border-t border-zinc-100">
              <label className="text-xs font-bold text-zinc-700 flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-orange-600" />
                <span>Gói Bảo Hành Kèm Theo:</span>
              </label>
              <select
                value={warrantyPackage}
                onChange={(e) => {
                  setWarrantyPackage(e.target.value);
                  const pkg = storeSettings?.warrantyPackages?.find(p => p.name === e.target.value);
                  if (pkg) setWarrantyPrice(pkg.price);
                }}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-orange-500 font-bold"
              >
                {storeSettings?.warrantyPackages?.map((pkg, idx) => (
                  <option key={idx} value={pkg.name}>
                    {pkg.name} {pkg.price > 0 ? `[+${pkg.price.toLocaleString('vi-VN')}đ]` : '[Miễn Phí]'}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setShowAccessoriesModal(false)}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs shadow-xs"
            >
              Xác Nhận ({accessoriesTotal.toLocaleString('vi-VN')}đ)
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 5: DISCOUNTS & TRADE-IN */}
      {/* ======================================================== */}
      {showDiscountModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3.5 sm:p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-4 sm:p-5 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-zinc-900">Ưu Đãi Voucher & Thu Cũ</h3>
                  <p className="text-[10px] text-zinc-500">Giảm trừ trực tiếp vào hóa đơn bán hàng</p>
                </div>
              </div>
              <button 
                onClick={() => setShowDiscountModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Voucher Presets */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-700">Mã Giảm Giá / Voucher:</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { code: 'VOUCHER100K', amount: 100000, label: '-100.000đ' },
                  { code: 'VOUCHER200K', amount: 200000, label: '-200.000đ' },
                  { code: 'VIP500K', amount: 500000, label: '-500.000đ' },
                ].map(v => (
                  <button
                    key={v.code}
                    type="button"
                    onClick={() => {
                      setVoucherCode(v.code);
                      setVoucherDiscount(v.amount);
                    }}
                    className={`p-2 rounded-xl border text-xs font-bold transition-all ${
                      voucherDiscount === v.amount 
                        ? 'bg-orange-50 border-orange-300 text-orange-700' 
                        : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-orange-50/50'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              {/* Custom voucher input */}
              <div className="pt-1">
                <input
                  type="number"
                  placeholder="Số tiền giảm tùy chỉnh (VNĐ)"
                  value={voucherDiscount || ''}
                  onChange={(e) => setVoucherDiscount(Number(e.target.value))}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 font-mono focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            {/* Trade In Deduction */}
            <div className="space-y-2 pt-2 border-t border-zinc-100">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-zinc-700">Thu Cũ Đổi Mới (Trừ tiền máy cũ):</label>
                <button
                  type="button"
                  onClick={() => setShowTradeInAssessmentModal(true)}
                  className="px-2.5 py-1 bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white rounded-lg text-[10px] font-black shadow-2xs flex items-center space-x-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>⚡ Thẩm Định 12 Bước</span>
                </button>
              </div>
              <input
                type="text"
                placeholder="Tên máy thu cũ (Ví dụ: iPhone 14 Pro 128GB VN/A)"
                value={tradeInModel}
                onChange={(e) => setTradeInModel(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-orange-500 mb-1.5 font-medium"
              />
              <input
                type="text"
                placeholder="Nhập số IMEI (Bắt buộc để nhập kho)"
                value={tradeInImei}
                onChange={(e) => setTradeInImei(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-orange-500 mb-1.5 font-mono"
              />
              <input
                type="number"
                placeholder="Số tiền định giá thu vào (VNĐ)"
                value={tradeInDiscount || ''}
                onChange={(e) => setTradeInDiscount(Number(e.target.value))}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 font-mono focus:outline-none focus:border-orange-500"
              />
            </div>

            <button
              onClick={() => setShowDiscountModal(false)}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs shadow-xs"
            >
              Áp Dụng Khuyến Mãi
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 6: PAYMENT & CHECKOUT MODAL */}
      {/* ======================================================== */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3.5 sm:p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-4 sm:p-5 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-zinc-900">Chọn Hình Thức Thanh Toán</h3>
                  <p className="text-[10px] text-zinc-500">Tổng tiền cần thanh toán: <strong className="text-orange-600 font-mono">{finalAmount.toLocaleString('vi-VN')}đ</strong></p>
                </div>
              </div>
              <button 
                onClick={() => setShowPaymentModal(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Payment method tabs */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'Chuyển khoản QR', label: 'Chuyển khoản VietQR', icon: QrCode },
                { id: 'Tiền mặt', label: 'Tiền mặt', icon: Receipt },
                { id: 'Quẹt thẻ POS', label: 'Quẹt thẻ MPOS', icon: CreditCard },
                { id: 'Trả góp', label: 'Trả góp', icon: Percent }
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id as any)}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center space-x-2 transition-all ${
                      isSelected 
                        ? 'bg-gradient-to-r from-orange-500 to-orange-500 text-white border-transparent shadow-xs' 
                        : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-orange-50/50'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Dynamic Payment Details */}
            {/* Fund Selector */}
            {paymentMethod !== 'Trả góp' && (
              <div className="mt-3 p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2 animate-in fade-in zoom-in duration-200">
                <label className="block text-xs font-bold text-zinc-600">
                  Tài khoản nhận tiền (Chuẩn kế toán)
                </label>
                <select
                  value={selectedFundId}
                  onChange={(e) => setSelectedFundId(e.target.value)}
                  className="w-full p-2.5 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-900 focus:outline-none focus:border-orange-500"
                >
                  {funds
                    .filter(f => {
                       const t = paymentMethod === 'Chuyển khoản QR' ? 'BANK' : paymentMethod === 'Tiền mặt' ? 'CASH' : paymentMethod === 'Quẹt thẻ POS' ? 'POS_CARD' : 'CASH';
                       return f.type === t && f.branchId === currentBranch.id && f.isArchived !== true && f.isActive !== false;
                    })
                    .sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)))
                    .map(f => {
                      return (
                        <option key={f.id} value={f.id}>
                          {f.isDefault ? '[Mặc định] ' : ''}{f.name} {f.accountNumber ? ` - ${f.accountNumber}` : ''}
                        </option>
                      );
                  })}
                </select>
                <p className="text-[10px] text-zinc-500">
                  Chỉ định chính xác tài khoản ngân hàng hoặc két tiền mặt để lập Phiếu Thu.
                </p>
              </div>
            )}

            {paymentMethod === 'Chuyển khoản QR' && (
              <div className="p-3.5 bg-orange-50/60 rounded-2xl border border-orange-200 text-center space-y-2">
                <span className="text-[11px] text-zinc-700 font-bold block">Quét VietQR Tự Động Điền Số Tiền & Nội Dung</span>
                <div className="w-32 h-32 mx-auto bg-white p-2 rounded-xl border border-orange-200 flex items-center justify-center shadow-xs">
                  <img
                    src={`https://api.vietqr.io/image/970407-1903666888999-compact2.jpg?amount=${finalAmount}&addInfo=PhoneHouse%20${customerPhone.replace(/\s+/g, '')}&accountName=PHONE%20HOUSE%20APPLE`}
                    alt="VietQR"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="text-[10px] text-zinc-600 font-mono">
                  Techcombank: <strong>1903666888999</strong> • PHONE HOUSE APPLE
                </div>
              </div>
            )}

            {paymentMethod === 'Tiền mặt' && (
              <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-600">Tiền khách đưa:</span>
                  <input
                    type="number"
                    value={cashGiven}
                    onChange={(e) => setCashGiven(Number(e.target.value))}
                    className="w-32 bg-white border border-zinc-300 rounded-lg px-2 py-1 text-right text-xs font-mono font-bold"
                  />
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-zinc-200 font-bold">
                  <span>Tiền thối lại:</span>
                  <span className="text-orange-600 font-mono text-sm">{cashChange.toLocaleString('vi-VN')} đ</span>
                </div>
              </div>
            )}

            {paymentMethod === 'Trả góp' && (
              <div className="p-3 bg-orange-50 rounded-2xl border border-orange-200 text-xs space-y-3">
                <div>
                  <label className="block text-zinc-600 mb-1 font-bold">Đối tác trả góp (HD Saison, HomeCredit...)</label>
                  <select
                    value={installmentCompany}
                    onChange={(e) => setInstallmentCompany(e.target.value)}
                    className="w-full bg-white border border-zinc-200 rounded-lg p-2 text-xs font-bold"
                  >
                    <option value="HD Saison">HD Saison</option>
                    <option value="HomeCredit">HomeCredit</option>
                    <option value="MPOS">MPOS Trả Góp Thẻ</option>
                    <option value="Kredivo">Kredivo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-600 mb-1 font-bold">Mã Hợp Đồng / Chuẩn chi</label>
                  <input
                    type="text"
                    placeholder="Nhập mã HĐ hoặc để trống nhập sau..."
                    value={installmentContractCode}
                    onChange={(e) => setInstallmentContractCode(e.target.value)}
                    className="w-full bg-white border border-zinc-200 rounded-lg p-2 text-xs"
                  />
                </div>
                <div className="space-y-1.5 bg-white p-2.5 border border-zinc-200 rounded-xl">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-700 font-bold text-xs">Số tiền trả trước (Khách thanh toán):</span>
                    <div className="flex items-center space-x-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={customDownPayment !== null ? customDownPayment.toLocaleString('vi-VN') : defaultDownPayment.toLocaleString('vi-VN')}
                        onChange={(e) => {
                          const rawVal = e.target.value.replace(/[^0-9]/g, '');
                          setCustomDownPayment(rawVal === '' ? 0 : parseInt(rawVal, 10));
                        }}
                        className="w-32 bg-orange-50/70 border border-orange-300 focus:border-orange-500 focus:bg-white rounded-lg px-2.5 py-1 text-right text-xs font-mono font-black text-orange-700 focus:outline-none"
                      />
                      <span className="text-xs font-bold text-zinc-500">đ</span>
                    </div>
                  </div>
                  {/* Quick percentage buttons */}
                  <div className="flex items-center justify-end space-x-1 pt-1 border-t border-zinc-100">
                    {[0, 10, 20, 30, 50].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          setDownPaymentPercent(pct);
                          setCustomDownPayment(Math.round((finalAmount * pct) / 100));
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors ${
                          downPaymentAmount === Math.round((finalAmount * pct) / 100)
                            ? 'bg-orange-500 text-white'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-orange-100 hover:text-orange-700'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between text-zinc-700 bg-white p-2 border border-zinc-200 rounded-lg font-bold">
                  <span>Số tiền chờ đối tác giải ngân:</span>
                  <strong className="text-zinc-900 font-mono text-sm">{(finalAmount - downPaymentAmount).toLocaleString('vi-VN')}đ</strong>
                </div>
              </div>
            )}

            {/* Action Checkout Button */}
            <button
              onClick={handleCheckout}
              disabled={isProcessingCheckout}
              className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 disabled:opacity-50 text-white font-black text-sm rounded-xl flex items-center justify-center space-x-2 shadow-md shadow-orange-500/25 active:scale-95 transition-all cursor-pointer"
            >
              {isProcessingCheckout ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Đang xử lý giao dịch & khóa kho...</span>
                </>
              ) : (
                <>
                  <Receipt className="w-4 h-4" />
                  <span>Xác Nhận & Xuất Hóa Đơn (F9)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 7: THERMAL RECEIPT SLIP K80 */}
      {/* ======================================================== */}
      {createdInvoiceForPrint && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3.5 sm:p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-4 sm:p-5 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <div className="flex items-center space-x-2">
                <Printer className="w-5 h-5 text-orange-600" />
                <span className="font-black text-sm text-zinc-900">Hóa Đơn Bán Hàng K80</span>
              </div>
              <button 
                onClick={() => { setCreatedInvoiceForPrint(null); resetForm(); }} 
                className="w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Virtual Thermal Slip */}
            <div className="bg-zinc-50 text-black p-4 rounded-2xl border border-zinc-300 text-xs font-mono space-y-2 shadow-inner">
              <div className="text-center font-black text-base text-orange-600">
                {storeSettings?.brandName || 'PHONE HOUSE'} • APPLE STORE
              </div>
              <div className="text-center text-[10px] text-zinc-600 font-bold">
                {createdInvoiceForPrint.branch || currentBranch.name}
              </div>
              <div className="text-center text-[10px] text-zinc-500">
                {currentBranch.address || '136 Cầu Giấy, Q. Cầu Giấy, Hà Nội'} • Hotline: {currentBranch.phone || '0909.123.456'}
              </div>
              <div className="border-b border-dashed border-zinc-400 my-2" />

              <div className="flex justify-between font-bold">
                <span>Số HĐ:</span>
                <span>{createdInvoiceForPrint.invoiceCode || createdInvoiceForPrint.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Kho xuất:</span>
                <span className="font-bold text-orange-700">{createdInvoiceForPrint.warehouseName || currentWarehouse.name}</span>
              </div>
              <div className="flex justify-between">
                <span>Khách hàng:</span>
                <span className="font-bold">{createdInvoiceForPrint.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span>SĐT:</span>
                <span>{createdInvoiceForPrint.customerPhone || createdInvoiceForPrint.phone}</span>
              </div>
              <div className="flex justify-between">
                <span>Thời gian:</span>
                <span>{createdInvoiceForPrint.createdDate || createdInvoiceForPrint.createdAt}</span>
              </div>

              {/* Items */}
              <div className="border-t border-b border-dashed border-zinc-400 py-2 space-y-1.5">
                {createdInvoiceForPrint.devices.map((d, i) => (
                  <div key={i}>
                    <div className="font-bold">{d.model} {d.storage}</div>
                    <div className="flex justify-between text-[10px] text-zinc-600">
                      <span>IMEI: {d.imei}</span>
                      <span>{d.price.toLocaleString('vi-VN')} đ</span>
                    </div>
                  </div>
                ))}

                {createdInvoiceForPrint.accessories.map((a, i) => (
                  <div key={i} className="flex justify-between text-[10px]">
                    <span className="truncate pr-2">• {a.name}</span>
                    <span>{a.price.toLocaleString('vi-VN')} đ</span>
                  </div>
                ))}
              </div>

              {/* Total Amount */}
              <div className="space-y-1 pt-1 font-bold">
                <div className="flex justify-between">
                  <span>Tổng tiền:</span>
                  <span>{createdInvoiceForPrint.totalAmount.toLocaleString('vi-VN')} đ</span>
                </div>
                {createdInvoiceForPrint.discountAmount > 0 && (
                  <div className="flex justify-between text-zinc-600">
                    <span>Voucher:</span>
                    <span>-{createdInvoiceForPrint.discountAmount.toLocaleString('vi-VN')} đ</span>
                  </div>
                )}
                {createdInvoiceForPrint.tradeInDeduction > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Trừ thu cũ:</span>
                    <span>-{createdInvoiceForPrint.tradeInDeduction.toLocaleString('vi-VN')} đ</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black pt-1 border-t border-black text-orange-600">
                  <span>THÀNH TIỀN:</span>
                  <span>{createdInvoiceForPrint.finalAmount.toLocaleString('vi-VN')} đ</span>
                </div>
              </div>

              <div className="pt-2 text-[10px] text-zinc-600 font-sans border-t border-dashed border-zinc-400">
                <strong>Bảo hành:</strong> {createdInvoiceForPrint.warrantyPackage}
              </div>

              <div className="text-[9px] text-zinc-500 pt-2 text-center font-sans">
                Cảm ơn quý khách đã mua sắm tại Phone House!
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white font-bold rounded-xl text-xs shadow-md shadow-orange-500/20"
              >
                In Hóa Đơn K80
              </button>
              <button
                onClick={() => {
                  setCreatedInvoiceForPrint(null);
                  resetForm();
                  if (onNavigateToInvoices) onNavigateToInvoices();
                }}
                className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECENT INVOICES DRAWER */}
      {showRecentInvoicesDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-zinc-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white w-full max-w-sm h-full flex flex-col shadow-2xl animate-slideInRight">
            <div className="flex items-center justify-between p-4 border-b border-zinc-100 bg-zinc-50/50">
              <div className="flex items-center space-x-2">
                <Receipt className="w-5 h-5 text-orange-600" />
                <h3 className="font-bold text-zinc-900">Đơn Hàng Hôm Nay</h3>
              </div>
              <button
                onClick={() => setShowRecentInvoicesDrawer(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 hover:text-zinc-700 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-zinc-50">
              {invoices.length > 0 ? (
                invoices.slice(0, 5).map((inv) => (
                  <div key={inv.id} className="bg-white p-3 rounded-xl border border-zinc-200/80 shadow-2xs space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-bold text-sm text-zinc-900">{inv.customerName}</span>
                        <span className="block text-[10px] text-zinc-500 font-mono mt-0.5">{inv.invoiceCode || inv.id}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        inv.status === 'completed' ? 'bg-orange-50 text-orange-600 border border-orange-100' :
                        inv.status === 'pending' ? 'bg-orange-50 text-orange-600 border border-orange-100' :
                        'bg-zinc-100 text-zinc-600'
                      }`}>
                        {inv.status === 'completed' ? 'Hoàn tất' : inv.status === 'pending' ? 'Chờ xử lý' : inv.status}
                      </span>
                    </div>

                    <div className="flex justify-between items-end border-t border-zinc-100 pt-2">
                      <div className="text-[11px] text-zinc-500 space-y-0.5">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{inv.createdDate || inv.createdAt}</span>
                        </div>
                        <div className="font-medium text-zinc-700">
                          {inv.paymentMethod}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="block text-xs font-black text-orange-600 font-mono">
                          {inv.finalAmount.toLocaleString('vi-VN')} đ
                        </span>
                      </div>
                    </div>

                    <div className="flex space-x-2 pt-2">
                      <button
                        onClick={() => {
                          setCreatedInvoiceForPrint(inv);
                          setShowRecentInvoicesDrawer(false);
                        }}
                        className="flex-1 py-1.5 text-[11px] font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Printer className="w-3 h-3" />
                        <span>In Phiếu</span>
                      </button>
                      <button
                        onClick={() => {
                          if (onNavigateToInvoices) {
                            setShowRecentInvoicesDrawer(false);
                            onNavigateToInvoices();
                          }
                        }}
                        className="flex-1 py-1.5 text-[11px] font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Chi Tiết</span>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-zinc-500 py-10 text-xs flex flex-col items-center">
                  <Receipt className="w-8 h-8 text-zinc-300 mb-2" />
                  <span>Chưa có hóa đơn nào hôm nay.</span>
                </div>
              )}
            </div>
            
            {invoices.length > 5 && onNavigateToInvoices && (
              <div className="p-3 bg-white border-t border-zinc-100">
                <button
                  onClick={() => {
                    setShowRecentInvoicesDrawer(false);
                    onNavigateToInvoices();
                  }}
                  className="w-full py-2.5 text-xs font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors cursor-pointer"
                >
                  Xem Tất Cả Hóa Đơn
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 12-STEP TRADE-IN ASSESSMENT MODAL */}
      <TradeInAssessmentModal
        isOpen={showTradeInAssessmentModal}
        onClose={() => setShowTradeInAssessmentModal(false)}
        defaultCustomerName={customerName || 'Khách Thu Cũ'}
        defaultCustomerPhone={customerPhone || '0900000000'}
        defaultTargetNewModel={selectedDevices[0] ? `${selectedDevices[0].model} ${selectedDevices[0].storage}` : 'iPhone 16 Pro Max 256GB'}
        defaultTargetNewModelPrice={selectedDevices[0] ? selectedDevices[0].sellPrice : 34500000}
        onApplyValuation={({ tradeInModel: modelName, tradeInAmount, appraisal }) => {
          setTradeInModel(modelName);
          setTradeInDiscount(tradeInAmount);
          setLastAppraisal(appraisal);
          if (onAddTradeIn) {
            onAddTradeIn(appraisal);
          }
        }}
      />

      {/* 🚀 STICKY FLOATING QUICK ACTION BAR (WHEN ITEMS IN CART) */}
      {selectedDevices.length > 0 && (
        <div className="sticky bottom-0 z-30 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800 p-3.5 px-4 sm:px-6 text-white shadow-2xl rounded-2xl mt-4 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center font-black text-sm shadow-md shadow-orange-500/30">
              {selectedDevices.length}
            </div>
            <div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">Tổng Thanh Toán POS:</div>
              <div className="text-base sm:text-lg font-black text-orange-400 font-mono">
                {finalAmount.toLocaleString('vi-VN')} đ
              </div>
            </div>
            <div className="hidden sm:flex items-center space-x-1.5 pl-3 border-l border-zinc-800 text-xs text-zinc-300">
              <span>Phương thức:</span>
              <span className="font-bold text-white bg-white/10 px-2 py-0.5 rounded-lg">{paymentMethod}</span>
              {customerName && (
                <span className="text-zinc-400">• Khách: <b className="text-white">{customerName}</b></span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleCheckout}
              disabled={isProcessingCheckout}
              className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-black text-xs sm:text-sm rounded-xl flex items-center space-x-2 shadow-lg shadow-orange-500/30 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <Receipt className="w-4 h-4" />
              <span>Xác Nhận & Xuất Hóa Đơn (F9)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
