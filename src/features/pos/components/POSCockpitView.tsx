import React, { useState, useRef, useEffect } from 'react';
import { DeviceItem, ProductItem, FundAccount, Partner, StoreBranch, StaffMember, SalesInvoice, CashTransaction } from '../../../types';
import { ProductSearchPanel } from './ProductSearchPanel';
import { CartPanel } from './CartPanel';
import { PaymentPanel } from './PaymentPanel';
import { useCheckout } from '../hooks/useCheckout';
import { Receipt, Sparkles, CheckCircle2, AlertCircle, Printer } from 'lucide-react';
import { ThermalReceiptK80 } from './ThermalReceiptK80';
import { usePosHotkeys } from '../hooks/usePosHotkeys';
import { PosHotkeysBar } from './PosHotkeysBar';
import { CreatePartnerModal } from '../../../components/CreatePartnerModal';
import { getCachedOperationalConfigs } from '../../../services/configurationApiClient';

export interface POSCockpitViewProps {
  devices: DeviceItem[];
  products: ProductItem[];
  funds: FundAccount[];
  partners: Partner[];
  currentBranch: StoreBranch;
  currentUser?: StaffMember | null;
  preSelectedDevice?: DeviceItem | null;
  initialCustomer?: { name?: string; phone?: string } | null;
  tradeInAppraisal?: any | null;
  onNavigateToInvoices?: () => void;
  onAddPartner?: (partner: Partner) => void | Promise<void>;
  onCheckoutSuccess?: (
    invoice: SalesInvoice,
    devicesSold: DeviceItem[],
    accessoriesSold: { product: ProductItem; quantity: number }[],
    cashTx: CashTransaction | null,
    updatedFund: FundAccount | null
  ) => void;
}

export const POSCockpitView: React.FC<POSCockpitViewProps> = ({
  devices,
  products,
  funds,
  partners,
  currentBranch,
  currentUser,
  preSelectedDevice,
  initialCustomer,
  tradeInAppraisal,
  onNavigateToInvoices,
  onAddPartner,
  onCheckoutSuccess
}) => {
  // 1. Cart State
  const [selectedDevices, setSelectedDevices] = useState<DeviceItem[]>([]);
  const [selectedAccessories, setSelectedAccessories] = useState<{ product: ProductItem; quantity: number }[]>([]);
  const [commissionTagSelections, setCommissionTagSelections] = useState<Record<string, string[]>>({});
  const [warrantyPackage, setWarrantyPackage] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [tradeInDeduction, setTradeInDeduction] = useState(0);
  const [tradeInDevice, setTradeInDevice] = useState<DeviceItem | null>(null);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);

  // 2. Customer & Payment State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isCreateCustomerModalOpen, setIsCreateCustomerModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'Tiền mặt' | 'Chuyển khoản QR' | 'Quẹt thẻ POS' | 'Trả góp qua Cty Tài Chính (HD/Home/Mpos)'>('Tiền mặt');
  const [selectedFundId, setSelectedFundId] = useState<string>(() => {
    const branchFunds = funds.filter(f => f.branchId === currentBranch.id && f.isArchived !== true && f.isActive !== false);
    return branchFunds.find(f => f.isDefault)?.id || branchFunds[0]?.id || '';
  });
  const [downPaymentAmount, setDownPaymentAmount] = useState(0);

  // Sync incoming contexts
  useEffect(() => {
    if (preSelectedDevice) {
      setSelectedDevices(prev => {
        if (!prev.some(d => d.id === preSelectedDevice.id)) {
          return [...prev, preSelectedDevice];
        }
        return prev;
      });
    }
  }, [preSelectedDevice]);

  useEffect(() => {
    if (initialCustomer) {
      if (initialCustomer.name) setCustomerName(initialCustomer.name);
      if (initialCustomer.phone) setCustomerPhone(initialCustomer.phone);
    }
  }, [initialCustomer]);

  useEffect(() => {
    if (tradeInAppraisal) {
      setTradeInDeduction(tradeInAppraisal.suggestedTradeInPrice || tradeInAppraisal.finalAppraisalPrice || 0);
    }
  }, [tradeInAppraisal]);

  // 3. Thermal Receipt Preview State
  const [receiptData, setReceiptData] = useState<any | null>(null);

  // 4. Refs for Keyboard Shortcuts
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  // 5. Hook for Atomic Checkout
  const { checkoutInfo, runCheckout, resetCheckout, isProcessing } = useCheckout();

  // Calculations
  const devicesTotal = selectedDevices.reduce((sum, d) => sum + (d.sellPrice || 0), 0);
  const accessoriesTotal = selectedAccessories.reduce(
    (sum, acc) => sum + ((acc.product.price || acc.product.salePrice || 0) * acc.quantity),
    0
  );
  const totalAmount = devicesTotal + accessoriesTotal;
  const finalAmount = Math.max(0, totalAmount - discountAmount - tradeInDeduction);
  const salesConfig = getCachedOperationalConfigs().sales;
  const activeCommissionTags = (salesConfig?.commissionTags || []).filter(tag => tag.isActive);
  const setValidatedDiscount = (amount: number) => {
    if (!salesConfig?.isActive) {
      alert('Chưa có chính sách Sales được kích hoạt.');
      return;
    }
    const maxDiscount = totalAmount * salesConfig.maxDiscountPercent / 100;
    if (amount > maxDiscount) {
      alert(`Mức giảm tối đa theo chính sách là ${salesConfig.maxDiscountPercent}% (${Math.round(maxDiscount).toLocaleString('vi-VN')} đ).`);
      return;
    }
    setDiscountAmount(Math.max(0, amount));
  };

  // Helper to switch payment methods via F8 hotkey
  const handleCyclePaymentMethod = () => {
    const methods: Array<'Tiền mặt' | 'Chuyển khoản QR' | 'Quẹt thẻ POS' | 'Trả góp qua Cty Tài Chính (HD/Home/Mpos)'> = [
      'Tiền mặt',
      'Chuyển khoản QR',
      'Quẹt thẻ POS',
      'Trả góp qua Cty Tài Chính (HD/Home/Mpos)'
    ];
    const currentIndex = methods.indexOf(paymentMethod);
    const nextIndex = (currentIndex + 1) % methods.length;
    setPaymentMethod(methods[nextIndex]);
  };

  // 6. Register Cashier Hotkeys (F2, F4, F7, F8, F9, Esc)
  usePosHotkeys({
    onSearchFocus: () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    },
    onCustomerOpen: () => {
      phoneInputRef.current?.focus();
      phoneInputRef.current?.select();
    },
    onVoucherOpen: () => {
      setIsDiscountModalOpen(true);
    },
    onPaymentSwitch: handleCyclePaymentMethod,
    onCheckoutSubmit: () => {
      if (!isProcessing && (selectedDevices.length > 0 || selectedAccessories.length > 0)) {
        handleExecuteCheckout();
      }
    },
    onEscape: () => {
      if (receiptData) {
        setReceiptData(null);
      }
      if (isDiscountModalOpen) {
        setIsDiscountModalOpen(false);
      }
    }
  });

  // Handlers
  const handleToggleSelectDevice = (device: DeviceItem) => {
    setSelectedDevices(prev => {
      const exists = prev.some(d => d.id === device.id);
      if (exists) {
        return prev.filter(d => d.id !== device.id);
      }
      return [...prev, device];
    });
  };

  const handleAddAccessory = (product: ProductItem) => {
    setSelectedAccessories(prev => {
      const existsIndex = prev.findIndex(item => item.product.id === product.id);
      if (existsIndex >= 0) {
        const next = [...prev];
        next[existsIndex].quantity += 1;
        return next;
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const handleRemoveDevice = (deviceId: string) => {
    setSelectedDevices(prev => prev.filter(d => d.id !== deviceId));
    setCommissionTagSelections(prev => { const next = { ...prev }; delete next[`DEVICE:${deviceId}`]; return next; });
  };

  const handleUpdateAccessoryQty = (productId: string, delta: number) => {
    setSelectedAccessories(prev =>
      prev.map(item => {
        if (item.product.id === productId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean) as { product: ProductItem; quantity: number }[]
    );
  };

  const handleRemoveAccessory = (productId: string) => {
    setSelectedAccessories(prev => prev.filter(item => item.product.id !== productId));
    setCommissionTagSelections(prev => { const next = { ...prev }; delete next[`ACCESSORY:${productId}`]; return next; });
  };

  const handleToggleCommissionTag = (itemType: 'DEVICE' | 'ACCESSORY', itemId: string, tagId: string) => {
    const key = `${itemType}:${itemId}`;
    setCommissionTagSelections(prev => ({ ...prev, [key]: prev[key]?.includes(tagId) ? [] : [tagId] }));
  };

  const handleClearCart = () => {
    setSelectedDevices([]);
    setSelectedAccessories([]);
    setDiscountAmount(0);
    setTradeInDeduction(0);
    setTradeInDevice(null);
    setCommissionTagSelections({});
    resetCheckout();
  };

  const handleExecuteCheckout = async (splitData?: any) => {
    if (selectedDevices.length === 0 && selectedAccessories.length === 0) {
      alert('Giỏ hàng đang trống. Vui lòng chọn máy hoặc phụ kiện.');
      return;
    }
    if (!salesConfig?.isActive) {
      alert('Chưa có chính sách Sales được kích hoạt trong Cài đặt.');
      return;
    }
    const missingDevice = selectedDevices.find(device => activeCommissionTags.some(tag => tag.appliesTo === 'DEVICE') && (commissionTagSelections[`DEVICE:${device.id}`] || []).length !== 1);
    const missingAccessory = selectedAccessories.find(accessory => activeCommissionTags.some(tag => tag.appliesTo === 'ACCESSORY') && (commissionTagSelections[`ACCESSORY:${accessory.product.id}`] || []).length !== 1);
    if (missingDevice || missingAccessory) {
      alert(`Bắt buộc chọn đúng một tag hoa hồng cho ${missingDevice ? `máy ${missingDevice.model}` : `phụ kiện ${missingAccessory!.product.name}`}.`);
      return;
    }

    const isSplit = splitData?.isSplitMode;
    const isInstallment = !isSplit && paymentMethod.includes('Trả góp');
    if (isInstallment && downPaymentAmount > finalAmount) {
      alert('Số tiền trả trước không thể lớn hơn tổng giá trị đơn hàng.');
      return;
    }

    const currentFund = funds.find(f => f.id === selectedFundId) || funds[0];
    const invoiceCode = `HD-${Date.now().toString().slice(-6)}`;
    const invoiceId = `INV-${Date.now()}`;

    // Build Split Payments List if in Multi-Payment Mode
    const splitPaymentsList = isSplit ? [
      ...(splitData.splitCash > 0 ? [{
        method: 'CASH',
        amount: splitData.splitCash,
        fundId: splitData.splitCashFundId,
        fundName: funds.find(f => f.id === splitData.splitCashFundId)?.name || 'Két Tiền Mặt'
      }] : []),
      ...(splitData.splitBank1 > 0 ? [{
        method: 'BANK',
        amount: splitData.splitBank1,
        fundId: splitData.splitBankFundId1,
        fundName: funds.find(f => f.id === splitData.splitBankFundId1)?.name || 'Tài Khoản Ngân Hàng 1',
        bankName: funds.find(f => f.id === splitData.splitBankFundId1)?.bankName,
        accountNumber: funds.find(f => f.id === splitData.splitBankFundId1)?.accountNumber
      }] : []),
      ...(splitData.splitBank2 > 0 ? [{
        method: 'BANK',
        amount: splitData.splitBank2,
        fundId: splitData.splitBankFundId2,
        fundName: funds.find(f => f.id === splitData.splitBankFundId2)?.name || 'Tài Khoản Ngân Hàng 2',
        bankName: funds.find(f => f.id === splitData.splitBankFundId2)?.bankName,
        accountNumber: funds.find(f => f.id === splitData.splitBankFundId2)?.accountNumber
      }] : []),
      ...(splitData.splitCard > 0 ? [{
        method: 'CARD',
        amount: splitData.splitCard,
        fundId: splitData.splitCardFundId,
        fundName: funds.find(f => f.id === splitData.splitCardFundId)?.name || 'Máy POS'
      }] : []),
      ...(splitData.splitDebt > 0 ? [{
        method: 'DEBT',
        amount: splitData.splitDebt,
        fundId: '',
        fundName: 'Công nợ'
      }] : [])
    ] : undefined;

    const paidAmt = isSplit
      ? finalAmount - (splitData.splitDebt || 0)
      : isInstallment
      ? downPaymentAmount
      : finalAmount;

    const debtAmt = isSplit
      ? (splitData.splitDebt || 0)
      : isInstallment
      ? Math.max(0, finalAmount - downPaymentAmount)
      : 0;

    const newInvoice: SalesInvoice = {
      id: invoiceId,
      invoiceCode,
      createdAt: new Date().toISOString(),
      branchId: currentBranch.id,
      branch: currentBranch.name,
      creatorName: currentUser?.name || 'Thu Ngân',
      customerName: customerName.trim() || 'Khách vãng lai',
      customerPhone: customerPhone.trim() || '',
      phone: customerPhone.trim() || '',
      status: 'completed',
      totalAmount,
      discountAmount,
      tradeInDeduction,
      tradeInDiscount: tradeInDeduction,
      finalAmount,
      paidAmount: paidAmt,
      debtAmount: debtAmt,
      paymentMethod: isSplit ? ('Đa phương thức' as any) : (paymentMethod as any),
      paymentFundId: isSplit ? (splitData.splitBankFundId1 || splitData.splitCashFundId || selectedFundId) : selectedFundId,
      splitPayments: splitPaymentsList,
      warrantyPackage,
      downPayment: isInstallment ? downPaymentAmount : undefined,
      installmentCompany: isInstallment ? 'Home Credit / HD Saison / Mpos' : undefined,
      imeiList: selectedDevices.map(d => d.imei).filter(Boolean),
      devices: selectedDevices.map(d => ({
        model: d.model,
        imei: d.imei,
        price: d.sellPrice || 0,
        color: d.color,
        storage: d.storage
      })),
      accessories: selectedAccessories.map(acc => ({
        name: acc.product.name,
        price: acc.product.price || acc.product.salePrice || 0,
        quantity: acc.quantity
      })),
      items: [
        ...selectedDevices.map(d => ({
          model: d.model,
          imei: d.imei,
          price: d.sellPrice || 0,
          color: d.color,
          storage: d.storage
        })),
        ...selectedAccessories.map(acc => ({
          model: acc.product.name,
          imei: '',
          price: acc.product.price || acc.product.salePrice || 0,
          color: '',
          storage: ''
        }))
      ],
      detailedItems: [
        ...selectedDevices.map(d => ({
          sku: d.sku || d.model,
          name: d.model,
          quantity: 1,
          unitPrice: d.sellPrice || 0,
          totalPrice: d.sellPrice || 0,
          imei: d.imei,
          type: 'device' as const,
          color: d.color,
          storage: d.storage
        })),
        ...selectedAccessories.map(acc => ({
          sku: acc.product.sku || acc.product.name,
          name: acc.product.name,
          quantity: acc.quantity,
          unitPrice: acc.product.price || acc.product.salePrice || 0,
          totalPrice: (acc.product.price || acc.product.salePrice || 0) * acc.quantity,
          type: 'accessory' as const
        }))
      ]
    };

    const cashTx: CashTransaction | null = paidAmt > 0 ? {
      id: `TX-${Date.now()}`,
      code: invoiceCode,
      branchId: currentBranch.id,
      type: 'RECEIPT',
      category: 'SALES_REVENUE',
      categoryName: isSplit ? 'Thu bán hàng (Đa phương thức)' : 'Thu bán hàng POS',
      amount: paidAmt,
      fundType: isSplit ? 'BANK' : (currentFund?.type || 'CASH'),
      fundName: isSplit ? 'Thanh toán phân bổ quỹ' : (currentFund?.name || 'Quỹ Tiền Mặt Tại Két'),
      fundId: isSplit ? (splitData.splitBankFundId1 || splitData.splitCashFundId || selectedFundId) : selectedFundId,
      date: new Date().toISOString(),
      creator: currentUser?.name || 'Thu Ngân',
      notes: `Thu tiền đơn hàng ${invoiceCode} - Khách: ${customerName || 'Vãng lai'} ${isSplit ? `(Phân bổ: ${splitPaymentsList?.map(s => `${s.method}: ${s.amount.toLocaleString('vi-VN')}đ`).join(', ')})` : ''}`,
      referenceCode: invoiceCode,
      status: 'COMPLETED'
    } : null;

    let customerPartner: Partner | null = null;
    if (customerPhone.trim()) {
      const existingPartner = partners?.find(p => p.phone === customerPhone.trim());
      if (existingPartner) {
        customerPartner = existingPartner;
      } else {
        customerPartner = {
          id: `CUST-${customerPhone.replace(/\D/g, '') || Date.now().toString()}`,
          name: customerName.trim() || `Khách ${customerPhone}`,
          phone: customerPhone.trim(),
          type: 'CUSTOMER',
          branchId: currentBranch.id,
          createdAt: new Date().toISOString(),
          customerTier: 'STANDARD',
          loyaltyPoints: Math.floor(finalAmount / 100000),
          totalSpent: finalAmount,
          outstandingDebt: debtAmt
        };
        onAddPartner?.(customerPartner);
      }
    }

    const payload = {
      invoice: newInvoice,
      devicesToSell: selectedDevices,
      accessoriesToSell: selectedAccessories,
      cashTx,
      tradeInDevice: tradeInDevice,
      customerPartner: customerPartner,
      financeCompanyPartner: null,
      fundToUpdate: currentFund ? { ...currentFund, balance: currentFund.currentBalance + paidAmt } : null,
      idempotencyKey: `POS-${invoiceId}-${Date.now()}`,
      commissionTagSelections: [
        ...selectedDevices.filter(() => activeCommissionTags.some(tag => tag.appliesTo === 'DEVICE')).map(device => ({ itemType: 'DEVICE' as const, itemId: device.id, tagIds: commissionTagSelections[`DEVICE:${device.id}`] || [] })),
        ...selectedAccessories.filter(() => activeCommissionTags.some(tag => tag.appliesTo === 'ACCESSORY')).map(accessory => ({ itemType: 'ACCESSORY' as const, itemId: accessory.product.id, tagIds: commissionTagSelections[`ACCESSORY:${accessory.product.id}`] || [] }))
      ]
    };

    const completedInvoice = await runCheckout(payload as any);

    if (completedInvoice) {
      setReceiptData(completedInvoice);
      onCheckoutSuccess?.(
        completedInvoice,
        selectedDevices,
        selectedAccessories,
        cashTx,
        payload.fundToUpdate
      );

      // Clear Cart after success
      setSelectedDevices([]);
      setSelectedAccessories([]);
      setDiscountAmount(0);
      setTradeInDeduction(0);
      setTradeInDevice(null);
      setCommissionTagSelections({});
      setCustomerName('');
      setCustomerPhone('');
      setDownPaymentAmount(0);
      setMobileTab('PRODUCTS');
    }
  };

  const [mobileTab, setMobileTab] = useState<'PRODUCTS' | 'CART' | 'PAYMENT'>('PRODUCTS');
  const totalItemsCount = selectedDevices.length + selectedAccessories.reduce((s, a) => s + a.quantity, 0);

  return (
    <div className="flex flex-col w-full h-[calc(100vh-64px)] overflow-hidden select-none bg-zinc-50">
      {/* 1. Slim Full-Bleed POS Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-zinc-950 via-zinc-900 to-black text-white border-b border-zinc-800 shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-orange-500 to-[#ff4b16] text-white flex items-center justify-center font-black">
            <Receipt className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs sm:text-sm font-black tracking-tight text-white">POS Thu Ngân</span>
          <span className="px-2 py-0.2 text-[10px] font-bold bg-orange-500/20 text-[#ff4b16] border border-orange-500/30 rounded-full hidden sm:inline-block">
            {currentBranch.name}
          </span>
          <span className="text-[11px] text-zinc-400 font-medium hidden md:inline-block">
            • <b className="text-zinc-200">{currentUser?.name || 'Thu Ngân'}</b>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onNavigateToInvoices && (
            <button
              onClick={onNavigateToInvoices}
              className="text-[11px] font-bold text-orange-200 bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700/80 px-2.5 py-1 rounded-xl flex items-center space-x-1 transition-all cursor-pointer active:scale-95"
            >
              <Receipt className="w-3 h-3 text-[#ff4b16]" />
              <span>Sổ Đơn</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Segmented Navigation Bar (<1024px) */}
      <div className="lg:hidden flex items-center p-1 bg-zinc-100 border-b border-zinc-200 text-[11px] font-bold shrink-0">
        <button
          onClick={() => setMobileTab('PRODUCTS')}
          className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
            mobileTab === 'PRODUCTS'
              ? 'bg-zinc-900 text-white shadow-xs'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          📱 Chọn Máy
        </button>

        <button
          onClick={() => setMobileTab('CART')}
          className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer relative ${
            mobileTab === 'CART'
              ? 'bg-zinc-900 text-white shadow-xs'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          🛒 Giỏ Hàng {totalItemsCount > 0 && <span className="ml-1 px-1.5 py-0.2 rounded-full bg-[#ff4b16] text-white text-[9px]">{totalItemsCount}</span>}
        </button>

        <button
          onClick={() => setMobileTab('PAYMENT')}
          className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
            mobileTab === 'PAYMENT'
              ? 'bg-zinc-900 text-white shadow-xs'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          💵 Thu Tiền
        </button>
      </div>

      {/* 2. Success Banner If Just Checked Out */}
      {checkoutInfo.state === 'SUCCESS' && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between animate-in fade-in duration-200 shrink-0">
          <div className="flex items-center space-x-2 text-emerald-800 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{checkoutInfo.statusMessage}</span>
          </div>
          <button
            onClick={resetCheckout}
            className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Error Banner If Checkout Failed */}
      {checkoutInfo.state === 'FAILED' && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between animate-in fade-in duration-200 shrink-0">
          <div className="flex items-center space-x-2 text-rose-800 text-xs font-bold">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{checkoutInfo.error || 'Thanh toán thất bại. Vui lòng kiểm tra lại.'}</span>
          </div>
          <button
            onClick={resetCheckout}
            className="text-xs font-bold text-rose-700 hover:underline cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Discount Voucher Dialog */}
      {isDiscountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-zinc-200 space-y-4">
            <h3 className="text-sm font-bold text-zinc-900">Áp Dụng Chiết Khấu / Voucher</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Số tiền giảm giá (VNĐ):</label>
                <input
                  type="number"
                  value={discountAmount || ''}
                  onChange={(e) => setValidatedDiscount(Number(e.target.value) || 0)}
                  placeholder="Nhập số tiền..."
                  className="w-full h-11 px-3 border border-zinc-300 rounded-2xl font-bold text-sm text-[#ff4b16] focus:outline-none focus:border-[#ff4b16]"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex space-x-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setDiscountAmount(0)}
                className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-2xl font-bold text-xs cursor-pointer"
              >
                Xóa giảm
              </button>
              <button
                type="button"
                onClick={() => setIsDiscountModalOpen(false)}
                className="flex-1 py-2.5 bg-[#ff4b16] hover:bg-[#e03e0e] text-white rounded-2xl font-bold text-xs cursor-pointer shadow-md shadow-orange-500/25"
              >
                Xác Nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Three-Column Responsive Full-Bleed Layout (Tràn viền 2 bên) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr_370px] divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/80 items-stretch flex-1 min-h-0 overflow-y-auto lg:overflow-hidden bg-white w-full">
        {/* Column 1: Product Search & Inventory Grid */}
        <div className={`w-full h-full min-h-0 flex flex-col ${mobileTab !== 'PRODUCTS' ? 'hidden lg:flex' : 'flex'}`}>
          <ProductSearchPanel
            devices={devices}
            products={products}
            selectedDeviceIds={selectedDevices.map(d => d.id)}
            onToggleSelectDevice={handleToggleSelectDevice}
            onAddAccessory={handleAddAccessory}
            searchInputRef={searchInputRef}
          />
        </div>

        {/* Column 2: Cart Panel & Warranty */}
        <div className={`w-full h-full min-h-0 flex flex-col ${mobileTab !== 'CART' ? 'hidden lg:flex' : 'flex'}`}>
          <CartPanel
            selectedDevices={selectedDevices}
            selectedAccessories={selectedAccessories}
            warrantyPackage={warrantyPackage}
            discountAmount={discountAmount}
            tradeInDeduction={tradeInDeduction}
            tradeInDevice={tradeInDevice}
            onRemoveDevice={handleRemoveDevice}
            onUpdateAccessoryQty={handleUpdateAccessoryQty}
            onRemoveAccessory={handleRemoveAccessory}
            onSelectWarranty={setWarrantyPackage}
            onOpenDiscountModal={() => setIsDiscountModalOpen(true)}
            onOpenTradeInModal={() => {
              alert('Vui lòng chọn tính năng Thu Cũ Đổi Mới từ danh mục hoặc tạo phiếu thẩm định.');
            }}
            onClearCart={handleClearCart}
            commissionTags={activeCommissionTags}
            commissionTagSelections={commissionTagSelections}
            onToggleCommissionTag={handleToggleCommissionTag}
          />
        </div>

        {/* Column 3: Payment, Customer & Checkout */}
        <div className={`w-full h-full min-h-0 flex flex-col ${mobileTab !== 'PAYMENT' ? 'hidden lg:flex' : 'flex'}`} id="pos-payment-section">
          <PaymentPanel
            customerName={customerName}
            customerPhone={customerPhone}
            onChangeCustomerName={setCustomerName}
            onChangeCustomerPhone={setCustomerPhone}
            onOpenCreateCustomerModal={() => setIsCreateCustomerModalOpen(true)}
            paymentMethod={paymentMethod}
            onChangePaymentMethod={setPaymentMethod}
            funds={funds}
            selectedFundId={selectedFundId}
            onSelectFundId={setSelectedFundId}
            finalAmount={finalAmount}
            downPaymentAmount={downPaymentAmount}
            onChangeDownPayment={setDownPaymentAmount}
            isProcessing={isProcessing}
            onExecuteCheckout={handleExecuteCheckout}
            phoneInputRef={phoneInputRef}
            partners={partners}
          />
        </div>
      </div>

      {/* 4. Mobile Sticky Bottom Checkout Bar (Docked at bottom-20 above MobileBottomNav) */}
      {totalItemsCount > 0 && mobileTab !== 'PAYMENT' && (
        <div className="lg:hidden fixed bottom-20 left-2 right-2 z-40 bg-zinc-950/95 backdrop-blur-xl text-white p-3 rounded-2xl shadow-2xl border border-zinc-800 flex items-center justify-between animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex flex-col pl-1">
            <span className="text-[11px] text-zinc-400 font-medium">
              🛒 {totalItemsCount} món hàng
            </span>
            <span className="text-sm font-semibold font-mono text-[#ff4b16]">
              {finalAmount.toLocaleString('vi-VN')} đ
            </span>
          </div>
          <button
            onClick={() => {
              if (mobileTab === 'PRODUCTS') {
                setMobileTab('CART');
              } else if (mobileTab === 'CART') {
                setMobileTab('PAYMENT');
              }
            }}
            disabled={isProcessing}
            className="bg-gradient-to-r from-orange-500 to-[#ff4b16] hover:brightness-110 active:scale-95 text-white font-semibold text-xs px-4 py-2.5 rounded-xl flex items-center space-x-1.5 shadow-lg shadow-orange-500/30 transition-all cursor-pointer"
          >
            <span>{mobileTab === 'PRODUCTS' ? 'Xem Giỏ Hàng ➔' : 'Thu Tiền & Quỹ ➔'}</span>
          </button>
        </div>
      )}

      {/* 5. Thermal Receipt K80 Printable Preview Modal */}
      {receiptData && (
        <ThermalReceiptK80
          invoice={receiptData}
          onClose={() => setReceiptData(null)}
        />
      )}

      {/* 6. Quick Create Customer Modal */}
      <CreatePartnerModal
        isOpen={isCreateCustomerModalOpen}
        onClose={() => setIsCreateCustomerModalOpen(false)}
        defaultType="CUSTOMER"
        initialPhone={customerPhone}
        initialName={customerName}
        onSavePartner={async (newPartner) => {
          if (onAddPartner) {
            await onAddPartner(newPartner);
          }
          setCustomerName(newPartner.name);
          setCustomerPhone(newPartner.phone || '');
        }}
      />

      {/* 6. Sticky Bottom Hotkeys Bar for Instant Cashier Productivity (Desktop) */}
      <div className="hidden lg:block fixed bottom-0 left-0 right-0 z-40">
        <PosHotkeysBar
          onSearch={() => {
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
          }}
          onCustomer={() => {
            phoneInputRef.current?.focus();
            phoneInputRef.current?.select();
          }}
          onVoucher={() => {
            const disc = window.prompt('Nhập số tiền giảm giá / Voucher (VNĐ):', discountAmount.toString());
            if (disc !== null) setValidatedDiscount(parseInt(disc.replace(/\D/g, ''), 10) || 0);
          }}
          onPayment={handleCyclePaymentMethod}
          onCheckout={() => {
            if (!isProcessing && (selectedDevices.length > 0 || selectedAccessories.length > 0)) {
              handleExecuteCheckout();
            }
          }}
        />
      </div>
    </div>
  );
};
