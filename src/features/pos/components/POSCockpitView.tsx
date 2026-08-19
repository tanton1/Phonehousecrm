import React, { useState, useRef, useEffect } from 'react';
import { DeviceItem, ProductItem, FundAccount, Partner, StoreBranch, StaffMember, SalesInvoice, CashTransaction } from '../../../types';
import { ProductSearchPanel } from './ProductSearchPanel';
import { CartPanel } from './CartPanel';
import { PaymentPanel } from './PaymentPanel';
import { useCheckout } from '../hooks/useCheckout';
import { Receipt, Sparkles, CheckCircle2, Printer } from 'lucide-react';
import { ThermalReceiptK80 } from './ThermalReceiptK80';
import { usePosHotkeys } from '../hooks/usePosHotkeys';
import { PosHotkeysBar } from './PosHotkeysBar';

export interface POSCockpitViewProps {
  devices: DeviceItem[];
  products: ProductItem[];
  funds: FundAccount[];
  partners: Partner[];
  currentBranch: StoreBranch;
  currentUser?: StaffMember | null;
  onNavigateToInvoices?: () => void;
}

export const POSCockpitView: React.FC<POSCockpitViewProps> = ({
  devices,
  products,
  funds,
  partners,
  currentBranch,
  currentUser,
  onNavigateToInvoices
}) => {
  // 1. Cart State
  const [selectedDevices, setSelectedDevices] = useState<DeviceItem[]>([]);
  const [selectedAccessories, setSelectedAccessories] = useState<{ product: ProductItem; quantity: number }[]>([]);
  const [warrantyPackage, setWarrantyPackage] = useState('Gói Tiêu Chuẩn 6 Tháng');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [tradeInDeduction, setTradeInDeduction] = useState(0);
  const [tradeInDevice, setTradeInDevice] = useState<DeviceItem | null>(null);

  // 2. Customer & Payment State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Tiền mặt' | 'Chuyển khoản QR' | 'Quẹt thẻ POS' | 'Trả góp qua Cty Tài Chính (HD/Home/Mpos)'>('Tiền mặt');
  const [selectedFundId, setSelectedFundId] = useState<string>(() => {
    const defaultFund = funds.find(f => !f.branchId || f.branchId === currentBranch.id || f.branchId === 'ALL');
    return defaultFund?.id || funds[0]?.id || '';
  });
  const [downPaymentAmount, setDownPaymentAmount] = useState(0);

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
      const disc = window.prompt('Nhập số tiền giảm giá / Voucher (VNĐ):', discountAmount.toString());
      if (disc !== null) setDiscountAmount(parseInt(disc.replace(/\D/g, ''), 10) || 0);
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

  const handleUpdateAccessoryQty = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveAccessory(productId);
      return;
    }
    setSelectedAccessories(prev =>
      prev.map(item => (item.product.id === productId ? { ...item, quantity } : item))
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

    const currentFund = funds.find(f => f.id === selectedFundId);
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

    // Form Pure Intent Payload
    const purePayload = {
      idempotencyKey: `POS-${invoiceId}-${Date.now()}`,
      branchId: currentBranch.id,
      warehouseId: 'WH01',
      deviceIds: selectedDevices.map(d => d.id),
      accessoryLines: selectedAccessories.map(acc => ({
        productId: acc.product.id,
        quantity: acc.quantity
      })),
      customerId: undefined,
      customerName: customerName || 'Khách vãng lai',
      customerPhone: customerPhone || '',
      payment: {
        method: backendPaymentMethod as any,
        fundId: selectedFundId,
        downPayment: isInstallment ? downPaymentAmount : undefined
      },
      discountAmount,
      tradeInDeduction
    };

    const result = await runCheckout(purePayload);

    if (result.success) {
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
      {/* 1. Header Bar with Cockpit Indicators */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center shadow-sm">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold text-slate-800 tracking-tight">Bán Hàng POS & Cockpit Thu Ngân</h1>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60 rounded-full">
                V1 Enterprise
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Chi nhánh: <b className="text-slate-700">{currentBranch.name}</b> • Thu ngân: <b className="text-slate-700">{currentUser?.name || 'Chưa đăng nhập'}</b>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onNavigateToInvoices && (
            <button
              onClick={onNavigateToInvoices}
              className="text-xs font-semibold text-[#ff4b16] bg-orange-50 hover:bg-orange-100 border border-orange-200 px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer shadow-2xs"
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
