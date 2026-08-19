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
  const [warrantyPackage, setWarrantyPackage] = useState('Gói Tiêu Chuẩn 6 Tháng');
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
    const defaultFund = funds.find(f => !f.branchId || f.branchId === currentBranch.id || f.branchId === 'ALL');
    return defaultFund?.id || funds[0]?.id || '';
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
  };

  const handleClearCart = () => {
    setSelectedDevices([]);
    setSelectedAccessories([]);
    setDiscountAmount(0);
    setTradeInDeduction(0);
    setTradeInDevice(null);
    resetCheckout();
  };

  const handleExecuteCheckout = async () => {
    if (selectedDevices.length === 0 && selectedAccessories.length === 0) {
      alert('Giỏ hàng đang trống. Vui lòng chọn máy hoặc phụ kiện.');
      return;
    }

    const isInstallment = paymentMethod.includes('Trả góp');
    if (isInstallment && downPaymentAmount > finalAmount) {
      alert('Số tiền trả trước không thể lớn hơn tổng giá trị đơn hàng.');
      return;
    }

    const currentFund = funds.find(f => f.id === selectedFundId) || funds[0];
    const invoiceCode = `HD-${Date.now().toString().slice(-6)}`;
    const invoiceId = `INV-${Date.now()}`;

    // Map Payment Method to Backend Standard
    const backendPaymentMethod = isInstallment
      ? 'INSTALLMENT'
      : paymentMethod.includes('QR')
      ? 'BANK'
      : paymentMethod.includes('thẻ')
      ? 'CARD'
      : 'CASH';

    // Prepare Items for K80 Receipt
    const receiptItems = [
      ...selectedDevices.map(d => ({
        id: d.id,
        name: d.model,
        imei: d.imei,
        quantity: 1,
        unitPrice: d.sellPrice || 0,
        totalPrice: d.sellPrice || 0,
        isDevice: true
      })),
      ...selectedAccessories.map(acc => ({
        id: acc.product.id,
        name: acc.product.name,
        quantity: acc.quantity,
        unitPrice: acc.product.price || acc.product.salePrice || 0,
        totalPrice: (acc.product.price || acc.product.salePrice || 0) * acc.quantity,
        isDevice: false
      }))
    ];

    const newInvoice: SalesInvoice = {
      id: invoiceId,
      invoiceCode,
      createdAt: new Date().toISOString(),
      branchId: currentBranch.id,
      branch: currentBranch.name,
      creatorName: currentUser?.name || 'Thu Ngân',
      customerName: customerName || 'Khách vãng lai',
      customerPhone: customerPhone || '',
      items: [
        ...selectedDevices.map(d => ({
          deviceId: d.id,
          model: d.model,
          imei: d.imei,
          color: d.color,
          price: d.sellPrice || 0,
          warranty: warrantyPackage
        })),
        ...selectedAccessories.map(acc => ({
          productId: acc.product.id,
          name: acc.product.name,
          quantity: acc.quantity,
          unitPrice: acc.product.price || acc.product.salePrice || 0,
          totalPrice: (acc.product.price || acc.product.salePrice || 0) * acc.quantity
        }))
      ] as any,
      paidAmount: isInstallment ? downPaymentAmount : finalAmount,
      debtAmount: isInstallment ? Math.max(0, finalAmount - downPaymentAmount) : 0,
      status: 'completed'
    } as any;

    const cashTx: CashTransaction | null = finalAmount > 0 ? {
      id: `TX-${Date.now()}`,
      code: invoiceCode,
      branchId: currentBranch.id,
      type: 'RECEIPT',
      category: 'SALES_REVENUE',
      categoryName: 'Thu bán hàng POS',
      amount: isInstallment ? downPaymentAmount : finalAmount,
      fundType: 'CASH',
      fundName: currentFund?.name || 'Quỹ Tiền Mặt Tại Két',
      fundId: selectedFundId,
      date: new Date().toISOString(),
      creator: currentUser?.name || 'Thu Ngân',
      notes: `Thu tiền đơn hàng ${invoiceCode} - Khách: ${customerName || 'Vãng lai'}`,
      referenceCode: invoiceCode,
      status: 'COMPLETED'
    } : null;

    const payload = {
      invoice: newInvoice,
      devicesToSell: selectedDevices,
      accessoriesToSell: selectedAccessories,
      cashTx,
      tradeInDevice: tradeInDevice,
      customerPartner: null,
      financeCompanyPartner: null,
      fundToUpdate: currentFund ? { ...currentFund, balance: currentFund.currentBalance + (isInstallment ? downPaymentAmount : finalAmount) } : null,
      idempotencyKey: `POS-${invoiceId}-${Date.now()}`
    };

    const isSuccess = await runCheckout(payload as any);

    if (isSuccess) {
      // Notify parent app state
      onCheckoutSuccess?.(
        newInvoice,
        selectedDevices,
        selectedAccessories,
        cashTx,
        currentFund ? { ...currentFund, currentBalance: (currentFund.currentBalance || 0) + (isInstallment ? downPaymentAmount : finalAmount) } : null
      );

      // Trigger K80 Thermal Receipt Modal
      setReceiptData({
        id: invoiceId,
        invoiceCode,
        createdAt: new Date().toISOString(),
        branchName: currentBranch.name,
        branchAddress: currentBranch.address,
        branchPhone: currentBranch.phone,
        creatorName: currentUser?.name || 'Thu Ngân',
        customerName: customerName || 'Khách vãng lai',
        customerPhone,
        items: receiptItems,
        subTotal: totalAmount,
        discountAmount,
        tradeInDeduction,
        finalAmount,
        paymentMethod: backendPaymentMethod,
        downPayment: isInstallment ? downPaymentAmount : undefined,
        financeAmount: isInstallment ? Math.max(0, finalAmount - downPaymentAmount) : undefined,
        financePartnerName: isInstallment ? 'Home Credit / HD Saison' : undefined
      });

      // Clear Cart after success
      setSelectedDevices([]);
      setSelectedAccessories([]);
      setDiscountAmount(0);
      setTradeInDeduction(0);
      setCustomerName('');
      setCustomerPhone('');
    }
  };

  return (
    <div className="flex flex-col space-y-3 p-2 sm:p-4 max-w-[1600px] mx-auto min-h-screen">
      {/* 1. Header Bar with Brand Recognition */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-3 sm:p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-[#ff4b16] text-white flex items-center justify-center shadow-sm font-bold">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold text-zinc-900 tracking-tight">Bán Hàng POS Thu Ngân</h1>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-50 text-[#ff4b16] border border-orange-200/60 rounded-full">
                {currentBranch.name}
              </span>
            </div>
            <p className="text-xs text-zinc-500 font-medium">
              Thu ngân: <b className="text-zinc-700">{currentUser?.name || 'Chưa đăng nhập'}</b>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onNavigateToInvoices && (
            <button
              onClick={onNavigateToInvoices}
              className="text-xs font-semibold text-[#ff4b16] bg-orange-50 hover:bg-orange-100 border border-orange-200 px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Lịch Sử Hóa Đơn</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Success Banner If Just Checked Out */}
      {checkoutInfo.state === 'SUCCESS' && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between animate-in fade-in duration-200">
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
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between animate-in fade-in duration-200">
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
          <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl border border-zinc-200 space-y-4">
            <h3 className="text-sm font-bold text-zinc-900">Áp Dụng Chiết Khấu / Voucher</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Số tiền giảm giá (VNĐ):</label>
                <input
                  type="number"
                  value={discountAmount || ''}
                  onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                  placeholder="Nhập số tiền..."
                  className="w-full h-10 px-3 border border-zinc-300 rounded-xl font-bold text-sm text-[#ff4b16] focus:outline-none focus:border-[#ff4b16]"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                {[100000, 200000, 500000].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setDiscountAmount(amt)}
                    className="flex-1 py-1.5 bg-zinc-100 hover:bg-orange-50 hover:text-[#ff4b16] rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    +{(amt/1000).toLocaleString()}k
                  </button>
                ))}
              </div>
            </div>
            <div className="flex space-x-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setDiscountAmount(0)}
                className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-bold text-xs cursor-pointer"
              >
                Xóa giảm
              </button>
              <button
                type="button"
                onClick={() => setIsDiscountModalOpen(false)}
                className="flex-1 py-2 bg-[#ff4b16] hover:bg-[#e03e0e] text-white rounded-xl font-bold text-xs cursor-pointer"
              >
                Xác Nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Three-Column Desktop Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_360px] gap-4 items-start pb-12">
        {/* Column 1: Product Search & Inventory Grid */}
        <div className="w-full">
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
        <div className="w-full">
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
            onOpenDiscountModal={() => {
              const disc = window.prompt('Nhập số tiền giảm giá (VNĐ):', discountAmount.toString());
              if (disc !== null) setDiscountAmount(parseInt(disc.replace(/\D/g, ''), 10) || 0);
            }}
            onOpenTradeInModal={() => {
              alert('Tính năng định giá máy thu cũ (Sprint 13).');
            }}
            onClearCart={handleClearCart}
          />
        </div>

        {/* Column 3: Payment, Customer & Checkout */}
        <div className="w-full" id="pos-payment-section">
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
          />
        </div>
      </div>

      {/* 4. Mobile Sticky Bottom Checkout Bar */}
      {(selectedDevices.length > 0 || selectedAccessories.length > 0) && (
        <div className="lg:hidden fixed bottom-14 left-2 right-2 z-40 bg-zinc-900/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-2xl border border-zinc-700 flex items-center justify-between animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex flex-col">
            <span className="text-[11px] text-zinc-400 font-medium">
              🛒 {selectedDevices.length + selectedAccessories.reduce((s, a) => s + a.quantity, 0)} món hàng
            </span>
            <span className="text-sm font-black text-[#ff4b16]">
              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(finalAmount)}
            </span>
          </div>
          <button
            onClick={() => {
              if (!isProcessing) {
                const paymentSection = document.getElementById('pos-payment-section');
                if (paymentSection) {
                  paymentSection.scrollIntoView({ behavior: 'smooth' });
                } else {
                  handleExecuteCheckout();
                }
              }
            }}
            disabled={isProcessing}
            className="bg-[#ff4b16] hover:bg-[#e03e0e] active:scale-95 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center space-x-1.5 shadow-md shadow-orange-500/25 transition-all cursor-pointer"
          >
            <span>{isProcessing ? 'Đang Xử Lý...' : 'Thanh Toán Ngay ➔'}</span>
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
            if (disc !== null) setDiscountAmount(parseInt(disc.replace(/\D/g, ''), 10) || 0);
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
