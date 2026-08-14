import React, { useState } from 'react';
import { DeviceItem, SalesInvoice } from '../types';
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
  Sparkles
} from 'lucide-react';

interface POSSalesViewProps {
  devices: DeviceItem[];
  invoices: SalesInvoice[];
  onCreateInvoice: (invoice: SalesInvoice) => void;
  onUpdateDeviceStatus: (imei: string, status: DeviceItem['status'], customerName?: string, phone?: string) => void;
  preSelectedDevice?: DeviceItem | null;
}

export const POSSalesView: React.FC<POSSalesViewProps> = ({
  devices,
  invoices,
  onCreateInvoice,
  onUpdateDeviceStatus,
  preSelectedDevice
}) => {
  // Available stock items
  const inStockDevices = devices.filter(d => d.status === 'in_stock');

  // Cart & Customer State
  const [customerName, setCustomerName] = useState('Nguyễn Văn Tuấn');
  const [phone, setPhone] = useState('0909123456');
  const [selectedDevices, setSelectedDevices] = useState<DeviceItem[]>(
    preSelectedDevice ? [preSelectedDevice] : (inStockDevices.slice(0, 1))
  );

  // Accessories bundle
  const [accessories, setAccessories] = useState<Array<{ name: string; price: number; selected: boolean }>>([
    { name: 'Củ sạc nhanh Apple / Anker 30W Type-C', price: 350000, selected: true },
    { name: 'Kính cường lực KingKong chống nhìn trộm', price: 150000, selected: true },
    { name: 'Ốp lưng từ tính MagSafe chống sốc', price: 180000, selected: true },
    { name: 'Cáp sạc bọc dù Type-C to C siêu bền', price: 200000, selected: false }
  ]);

  // Warranty pack
  const [warrantyPackage, setWarrantyPackage] = useState('Gói VIP 1 Đổi 1 trong 12 Tháng (Bao Nguồn + Màn + FaceID)');
  const [warrantyPrice, setWarrantyPrice] = useState(0);

  // Discounts
  const [discountAmount, setDiscountAmount] = useState(200000);
  const [tradeInDiscount, setTradeInDiscount] = useState(0);

  // Payment Method
  const [paymentMethod, setPaymentMethod] = useState<SalesInvoice['paymentMethod']>('Chuyển khoản QR');
  const [installmentCompany, setInstallmentCompany] = useState('Home Credit (CCCD gắn chip)');
  const [installmentTenor, setInstallmentTenor] = useState(6);
  const [downPaymentPercent, setDownPaymentPercent] = useState(30);

  const [createdInvoiceForPrint, setCreatedInvoiceForPrint] = useState<SalesInvoice | null>(null);

  // Add device to cart
  const handleAddDeviceToCart = (device: DeviceItem) => {
    if (!selectedDevices.some(d => d.imei === device.imei)) {
      setSelectedDevices([...selectedDevices, device]);
    }
  };

  const handleRemoveDeviceFromCart = (imei: string) => {
    setSelectedDevices(selectedDevices.filter(d => d.imei !== imei));
  };

  // Price calculations
  const devicesTotal = selectedDevices.reduce((sum, d) => sum + d.sellPrice, 0);
  const accessoriesTotal = accessories.filter(a => a.selected).reduce((sum, a) => sum + a.price, 0);
  const rawTotal = devicesTotal + accessoriesTotal + warrantyPrice;
  const finalAmount = Math.max(0, rawTotal - discountAmount - tradeInDiscount);

  // Installment calculations
  const downPaymentAmount = Math.round((finalAmount * downPaymentPercent) / 100);
  const remainingLoan = finalAmount - downPaymentAmount;
  const monthlyPaymentAmount = installmentTenor > 0 ? Math.round(remainingLoan / installmentTenor) : 0;

  const handleCheckout = () => {
    if (selectedDevices.length === 0) {
      alert('Vui lòng chọn ít nhất 1 cây máy để thanh toán!');
      return;
    }
    if (!customerName || !phone) {
      alert('Vui lòng nhập tên và số điện thoại khách hàng!');
      return;
    }

    const newInvoice: SalesInvoice = {
      id: `INV-${Date.now().toString().slice(-4)}`,
      customerName,
      customerPhone: phone,
      devices: selectedDevices.map(d => ({
        imei: d.imei,
        model: d.model,
        storage: d.storage,
        price: d.sellPrice
      })),
      accessories: accessories.filter(a => a.selected).map(a => ({ name: a.name, price: a.price })),
      totalAmount: rawTotal,
      discountAmount,
      tradeInDeduction: tradeInDiscount,
      finalAmount,
      paymentMethod,
      installmentDetails: paymentMethod === 'Trả góp 0% / CCCD' ? {
        financeCompany: installmentCompany,
        tenorMonths: installmentTenor,
        downPayment: downPaymentAmount,
        monthlyPayment: monthlyPaymentAmount
      } : undefined,
      warrantyPackage,
      salesStaff: 'Tuấn Bán Hàng',
      createdAt: new Date().toISOString().split('T')[0]
    };

    // Mark devices as sold
    selectedDevices.forEach(d => {
      onUpdateDeviceStatus(d.imei, 'sold', customerName, phone);
    });

    onCreateInvoice(newInvoice);
    setCreatedInvoiceForPrint(newInvoice);
  };

  return (
    <div className="space-y-5 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 flex items-center space-x-2">
            <span>Điểm Bán Hàng & Xuất Hóa Đơn (POS)</span>
            <span className="bg-orange-50 text-orange-700 border border-orange-200 text-xs px-2.5 py-0.5 rounded-full font-bold">
              Xuất Theo IMEI 15 Số
            </span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Quét mã IMEI xuất kho, tự động tạo gói bảo hành 1 đổi 1 & kích hoạt hợp đồng trả góp 0%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols: Cart, Device Selection, Accessories & Payment method */}
        <div className="lg:col-span-2 space-y-4">
          {/* Customer info */}
          <div className="bg-white border border-orange-100 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
            <h3 className="font-black text-zinc-900 text-sm flex items-center space-x-2">
              <Receipt className="w-4 h-4 text-orange-600" />
              <span>1. Thông Tin Khách Hàng Xuất Hóa Đơn</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Tên Khách Hàng *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Số Điện Thoại / Zalo *</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Selected Devices in Cart */}
          <div className="bg-white border border-orange-100 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-zinc-900 text-sm flex items-center space-x-2">
                <Smartphone className="w-4 h-4 text-orange-600" />
                <span>2. Máy Đã Chọn Xuất Bán ({selectedDevices.length})</span>
              </h3>
            </div>

            {selectedDevices.length === 0 ? (
              <div className="p-6 text-center bg-zinc-50 rounded-2xl border border-zinc-200 text-xs text-zinc-500">
                Chưa có máy nào trong giỏ. Hãy chọn một máy bên dưới!
              </div>
            ) : (
              <div className="space-y-2">
                {selectedDevices.map((d) => (
                  <div 
                    key={d.imei}
                    className="p-3 bg-orange-50/50 rounded-2xl border border-orange-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-zinc-900 text-sm">{d.model} {d.storage}</div>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        IMEI: <strong className="text-orange-600">{d.imei}</strong> • Pin {d.batteryHealth}% • {d.color}
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <span className="font-black text-zinc-900 font-mono text-sm">
                        {d.sellPrice.toLocaleString('vi-VN')} đ
                      </span>
                      <button
                        onClick={() => handleRemoveDeviceFromCart(d.imei)}
                        className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quick Picker from Stock */}
            <div className="pt-2">
              <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-2">
                Chọn Nhanh Máy Trong Kho Để Thêm Vào Đơn:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {inStockDevices
                  .filter(d => !selectedDevices.some(s => s.imei === d.imei))
                  .slice(0, 6)
                  .map((d) => (
                    <button
                      key={d.id}
                      onClick={() => handleAddDeviceToCart(d)}
                      className="p-2.5 bg-zinc-50 hover:bg-orange-50/60 border border-zinc-200 hover:border-orange-300 rounded-xl text-left text-xs flex items-center justify-between transition-all"
                    >
                      <div className="truncate pr-2">
                        <strong className="text-zinc-900 block truncate">{d.model} {d.storage}</strong>
                        <span className="text-[10px] text-zinc-500 font-mono">{d.imei.slice(-6)} • Pin {d.batteryHealth}%</span>
                      </div>
                      <span className="font-bold text-orange-600 shrink-0">
                        {Math.round(d.sellPrice / 1000000)}M
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* Accessories & Warranty Combos */}
          <div className="bg-white border border-orange-100 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
            <h3 className="font-black text-zinc-900 text-sm flex items-center space-x-2">
              <Package className="w-4 h-4 text-orange-600" />
              <span>3. Gói Phụ Kiện Tặng Kèm & Bảo Hành</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {accessories.map((acc, idx) => (
                <label 
                  key={idx}
                  className={`p-2.5 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-all ${
                    acc.selected 
                      ? 'bg-orange-50 border-orange-200 text-zinc-900 font-medium' 
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
                    <span className="truncate">{acc.name}</span>
                  </div>
                  <span className="text-orange-600 font-mono font-bold shrink-0">
                    +{acc.price.toLocaleString('vi-VN')}đ
                  </span>
                </label>
              ))}
            </div>

            {/* Warranty Package */}
            <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs space-y-1.5">
              <label className="font-bold text-zinc-900 flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-orange-600" />
                <span>Gói Bảo Hành Kèm Theo:</span>
              </label>
              <select
                value={warrantyPackage}
                onChange={(e) => setWarrantyPackage(e.target.value)}
                className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-orange-500 font-bold"
              >
                <option value="Gói VIP 1 Đổi 1 trong 12 Tháng (Bao Nguồn + Màn + FaceID)">
                  Gói VIP: 1 Đổi 1 trong 12 Tháng (Bao Nguồn + Màn Hình + FaceID) [Miễn Phí]
                </option>
                <option value="Gói Kim Cương 24 Tháng + Rơi Vỡ Vào Nước">
                  Gói Kim Cương: 24 Tháng + Bảo Hành Rơi Vỡ / Vào Nước
                </option>
                <option value="Bảo hành tiêu chuẩn 6 tháng phần cứng">
                  Bảo hành tiêu chuẩn 6 tháng phần cứng
                </option>
              </select>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Billing Summary & Payment Calculator */}
        <div className="space-y-4">
          <div className="bg-white border border-orange-200 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="font-black text-zinc-900 text-base">Tổng Kết Thanh Toán</h3>

            {/* Price lines */}
            <div className="space-y-2 text-xs text-zinc-600">
              <div className="flex justify-between">
                <span>Tiền máy ({selectedDevices.length} cây):</span>
                <span className="font-mono text-zinc-900 font-semibold">{devicesTotal.toLocaleString('vi-VN')} đ</span>
              </div>
              <div className="flex justify-between">
                <span>Phụ kiện kèm theo:</span>
                <span className="font-mono text-zinc-900 font-semibold">{accessoriesTotal.toLocaleString('vi-VN')} đ</span>
              </div>
              
              {/* Discount inputs */}
              <div className="pt-2 border-t border-zinc-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-amber-700 font-bold">Giảm giá / Voucher:</span>
                  <input
                    type="number"
                    step="50000"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(Number(e.target.value))}
                    className="w-28 bg-zinc-50 border border-zinc-300 rounded-lg px-2 py-1 text-right text-xs text-zinc-900 font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-orange-700 font-bold">Trừ tiền thu cũ:</span>
                  <input
                    type="number"
                    step="100000"
                    value={tradeInDiscount}
                    onChange={(e) => setTradeInDiscount(Number(e.target.value))}
                    className="w-28 bg-zinc-50 border border-zinc-300 rounded-lg px-2 py-1 text-right text-xs text-zinc-900 font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Total */}
              <div className="pt-3 border-t border-zinc-200 flex justify-between items-baseline">
                <span className="font-black text-zinc-900 text-sm uppercase">Tổng Tiền Cần Thu:</span>
                <div className="text-right">
                  <span className="text-2xl font-black text-orange-600 font-mono">
                    {finalAmount.toLocaleString('vi-VN')}
                  </span>
                  <span className="text-xs text-zinc-900 ml-1">đ</span>
                </div>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2 pt-2">
              <label className="block text-xs font-bold text-zinc-900">Hình Thức Thanh Toán</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  'Chuyển khoản QR',
                  'Tiền mặt',
                  'Quẹt thẻ POS',
                  'Trả góp 0% / CCCD'
                ].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m as any)}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all ${
                      paymentMethod === m 
                        ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white border-transparent shadow-xs' 
                        : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-orange-50/50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* If QR Code */}
            {paymentMethod === 'Chuyển khoản QR' && (
              <div className="p-3 bg-orange-50/50 rounded-2xl border border-orange-100 text-center space-y-2">
                <span className="text-[11px] text-zinc-700 font-bold block">Quét VietQR Tự Động Điền Nội Dung</span>
                <div className="w-28 h-28 mx-auto bg-white p-2 rounded-xl border border-orange-200 flex items-center justify-center shadow-xs">
                  <QrCode className="w-full h-full text-zinc-900" />
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">
                  Techcombank: 1903xxxxxx • iStore Pro
                </div>
              </div>
            )}

            {/* If Installment */}
            {paymentMethod === 'Trả góp 0% / CCCD' && (
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs space-y-2">
                <span className="font-bold text-amber-900 block">Mô Phỏng Hợp Đồng Trả Góp 0%:</span>
                <div className="flex justify-between text-zinc-700">
                  <span>Trả trước ({downPaymentPercent}%):</span>
                  <strong className="text-zinc-900 font-mono">{downPaymentAmount.toLocaleString('vi-VN')}đ</strong>
                </div>
                <div className="flex justify-between text-zinc-700">
                  <span>Góp mỗi tháng ({installmentTenor} tháng):</span>
                  <strong className="text-orange-600 font-mono">{monthlyPaymentAmount.toLocaleString('vi-VN')}đ / tháng</strong>
                </div>
              </div>
            )}

            {/* Checkout Button */}
            <button
              onClick={handleCheckout}
              className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-sm rounded-xl flex items-center justify-center space-x-2 shadow-md shadow-orange-500/20 active:scale-95 transition-all"
            >
              <Receipt className="w-4 h-4" />
              <span>Xuất Hóa Đơn & Trừ Kho IMEI</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL: In Hóa Đơn Bán Hàng K80 */}
      {createdInvoiceForPrint && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-orange-200 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <span className="font-black text-sm text-zinc-900">Hóa Đơn Bán Hàng K80</span>
              <button onClick={() => setCreatedInvoiceForPrint(null)} className="text-zinc-400 hover:text-zinc-600 font-bold">✕</button>
            </div>

            {/* Virtual Thermal Slip */}
            <div className="bg-zinc-50 text-black p-4 rounded-xl border border-zinc-300 text-xs font-mono space-y-2 shadow-inner">
              <div className="text-center font-black text-base text-orange-600">iStore Pro • APPLE STORE</div>
              <div className="text-center text-[10px] text-zinc-600">Đ/c: 123 Phố Huế, Q. Hai Bà Trưng, Hà Nội</div>
              <div className="text-center text-[10px] text-zinc-600">Hotline: 0909.888.999</div>
              <div className="border-b border-dashed border-zinc-400 my-2" />

              <div className="flex justify-between font-bold">
                <span>Số Hóa Đơn:</span>
                <span>{createdInvoiceForPrint.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Khách hàng:</span>
                <span>{createdInvoiceForPrint.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span>SĐT:</span>
                <span>{createdInvoiceForPrint.customerPhone}</span>
              </div>
              <div className="flex justify-between">
                <span>Ngày mua:</span>
                <span>{createdInvoiceForPrint.createdAt}</span>
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
                <div className="flex justify-between text-sm font-black pt-1 border-t border-black">
                  <span>THÀNH TIỀN:</span>
                  <span>{createdInvoiceForPrint.finalAmount.toLocaleString('vi-VN')} đ</span>
                </div>
              </div>

              <div className="pt-2 text-[10px] text-zinc-600 font-sans border-t border-dashed border-zinc-400">
                <strong>Bảo hành:</strong> {createdInvoiceForPrint.warrantyPackage}
              </div>

              <div className="text-[9px] text-zinc-500 pt-2 text-center font-sans">
                Cảm ơn quý khách đã tin tưởng mua sắm tại iStore Pro!
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold rounded-xl text-xs shadow-md shadow-orange-500/20"
              >
                In Hóa Đơn K80
              </button>
              <button
                onClick={() => setCreatedInvoiceForPrint(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
