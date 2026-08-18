import React, { useState, useRef, useEffect } from 'react';
import { DeviceItem, ProductItem, FundAccount, Partner, StoreBranch, StaffMember, SalesInvoice, CashTransaction } from '../../../types';
import { ProductSearchPanel } from './ProductSearchPanel';
import { CartPanel } from './CartPanel';
import { PaymentPanel } from './PaymentPanel';
import { useCheckout } from '../hooks/useCheckout';
import { Receipt, Sparkles, CheckCircle2 } from 'lucide-react';

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

  // 3. Refs for Keyboard Shortcuts
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  // 4. Hook for Atomic Checkout
  const { checkoutInfo, runCheckout, resetCheckout, isProcessing } = useCheckout();

  // Calculations
  const devicesTotal = selectedDevices.reduce((sum, d) => sum + (d.sellPrice || 0), 0);
  const accessoriesTotal = selectedAccessories.reduce(
    (sum, acc) => sum + ((acc.product.price || acc.product.salePrice || 0) * acc.quantity),
    0
  );
  const totalAmount = devicesTotal + accessoriesTotal;
  const finalAmount = Math.max(0, totalAmount - discountAmount - tradeInDeduction);

  // Keyboard Shortcuts listener (F2, F4, F8, F9)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        phoneInputRef.current?.focus();
      } else if (e.key === 'F8') {
        e.preventDefault();
        const disc = window.prompt('Nhập số tiền chiết khấu / giảm giá (VNĐ):', discountAmount.toString());
        if (disc !== null) {
          setDiscountAmount(parseInt(disc.replace(/\D/g, ''), 10) || 0);
        }
      } else if (e.key === 'F9') {
        e.preventDefault();
        handleExecuteCheckout();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Cart actions
  const handleToggleSelectDevice = (device: DeviceItem) => {
    setSelectedDevices(prev => {
      const exists = prev.some(d => d.id === device.id);
      if (exists) {
        return prev.filter(d => d.id !== device.id);
      } else {
        return [...prev, device];
      }
    });
  };

  const handleAddAccessory = (product: ProductItem) => {
    setSelectedAccessories(prev => {
      const existingIndex = prev.findIndex(a => a.product.id === product.id);
      if (existingIndex > -1) {
        const next = [...prev];
        next[existingIndex].quantity += 1;
        return next;
      } else {
        return [...prev, { product, quantity: 1 }];
      }
    });
  };

  const handleUpdateAccessoryQty = (productId: string, delta: number) => {
    setSelectedAccessories(prev => {
      return prev
        .map(acc => {
          if (acc.product.id === productId) {
            const nextQty = acc.quantity + delta;
            return nextQty > 0 ? { ...acc, quantity: nextQty } : null;
          }
          return acc;
        })
        .filter(Boolean) as { product: ProductItem; quantity: number }[];
    });
  };

  const handleRemoveAccessory = (productId: string) => {
    setSelectedAccessories(prev => prev.filter(a => a.product.id !== productId));
  };

  const handleRemoveDevice = (deviceId: string) => {
    setSelectedDevices(prev => prev.filter(d => d.id !== deviceId));
  };

  const handleClearCart = () => {
    setSelectedDevices([]);
    setSelectedAccessories([]);
    setDiscountAmount(0);
    setTradeInDeduction(0);
    setTradeInDevice(null);
  };

  // Checkout Execution
  const handleExecuteCheckout = async () => {
    if (selectedDevices.length === 0 && selectedAccessories.length === 0) {
      alert('Vui lòng chọn ít nhất 1 cây máy hoặc 1 phụ kiện vào giỏ hàng.');
      return;
    }

    if (isProcessing) return;

    const fundToUse = funds.find(f => f.id === selectedFundId) || null;
    const invoiceId = `INV-${Date.now().toString().slice(-6)}`;
    const invoiceCode = `HD-${new Date().toISOString().slice(2, 7).replace('-', '')}-${Date.now().toString().slice(-4)}`;

    const isInstallment = paymentMethod.includes('Trả góp');
    const actualDownPayment = isInstallment ? downPaymentAmount : finalAmount;
    const installmentDebt = isInstallment ? Math.max(0, finalAmount - downPaymentAmount) : 0;

    const newInvoice: SalesInvoice = {
      id: invoiceId,
      invoiceCode,
      customerName: customerName.trim() || 'Khách Vãng Lai',
      customerPhone: customerPhone.trim(),
      status: 'completed',
      branchId: currentBranch.id,
      branch: currentBranch.name,
      devices: selectedDevices.map(d => ({
        model: d.model,
        imei: d.imei,
        price: d.sellPrice || 0,
        color: d.color,
        storage: d.storage
      })),
      accessories: selectedAccessories.map(a => ({
        name: a.product.name,
        price: a.product.price || a.product.salePrice || 0,
        quantity: a.quantity
      })),
      warrantyPackage,
      totalAmount,
      discountAmount,
      tradeInDeduction,
      finalAmount,
      paidAmount: actualDownPayment,
      debtAmount: installmentDebt,
      paymentMethod,
      paymentFundId: fundToUse?.id,
      installmentDisbursementStatus: isInstallment ? 'PENDING' : undefined,
      installmentExpectedAmount: isInstallment ? installmentDebt : undefined,
      cashier: currentUser?.displayName || 'Thu Ngân',
      createdAt: new Date().toISOString()
    };

    let cashTx: CashTransaction | null = null;
    if (actualDownPayment > 0 && fundToUse) {
      cashTx = {
        id: `TX-${Date.now()}`,
        code: `PT-${Date.now().toString().slice(-6)}`,
        type: 'RECEIPT',
        category: 'SALES_REVENUE',
        categoryName: 'Thu tiền bán hàng POS',
        amount: actualDownPayment,
        fundId: fundToUse.id,
        fundType: fundToUse.type,
        fundName: fundToUse.name,
        date: new Date().toISOString().split('T')[0],
        partnerName: newInvoice.customerName,
        partnerPhone: newInvoice.customerPhone,
        status: 'COMPLETED',
        notes: `Thu tiền đơn hàng ${invoiceCode}`,
        referenceCode: invoiceCode,
        branchId: currentBranch.id,
        creator: currentUser?.displayName || 'Thu Ngân'
      };
    }

    const customerPartner = partners.find(p => p.phone === customerPhone) || null;
    const financeCompanyPartner = partners.find(p => p.name.includes('Home Credit') || p.name.includes('Tài Chính')) || partners[0] || null;

    const success = await runCheckout({
      invoice: newInvoice,
      devicesToSell: selectedDevices,
      accessoriesToSell: selectedAccessories,
      cashTx,
      tradeInDevice,
      customerPartner,
      financeCompanyPartner: isInstallment ? financeCompanyPartner : null,
      fundToUpdate: fundToUse
    });

    if (success) {
      handleClearCart();
      setCustomerName('');
      setCustomerPhone('');
    }
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-4">
      {/* 1. Cockpit Header Bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff4b16] animate-pulse" />
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-800">
            Bàn Thu Ngân POS Cockpit (3 Cột)
          </h2>
          <span className="text-xs text-zinc-400 font-medium hidden sm:inline-block">
            • Chi nhánh {currentBranch.name}
          </span>
        </div>

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
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_360px] gap-4 items-start">
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
        <div className="w-full">
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
    </div>
  );
};
