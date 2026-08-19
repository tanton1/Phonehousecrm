import React from 'react';
import { Printer, CheckCircle, Smartphone, QrCode, ShieldCheck } from 'lucide-react';

export interface ReceiptItem {
  id: string;
  name: string;
  imei?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isDevice?: boolean;
}

export interface ThermalReceiptProps {
  invoice: {
    id: string;
    invoiceCode: string;
    createdAt?: string;
    branchName?: string;
    branchAddress?: string;
    branchPhone?: string;
    creatorName?: string;
    customerName?: string;
    customerPhone?: string;
    items: ReceiptItem[];
    subTotal: number;
    discountAmount: number;
    tradeInDeduction: number;
    finalAmount: number;
    paymentMethod: string;
    downPayment?: number;
    financeAmount?: number;
    financePartnerName?: string;
    notes?: string;
  };
  onClose?: () => void;
}

export const ThermalReceiptK80: React.FC<ThermalReceiptProps> = ({ invoice, onClose }) => {
  const handlePrint = () => {
    window.print();
  };

  const formattedDate = invoice.createdAt
    ? new Date(invoice.createdAt).toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    : new Date().toLocaleString('vi-VN');

  // Dynamic VietQR payment URL for BANK method
  const qrBankUrl = `https://api.vietqr.io/image/970422-0905123456-compact2.jpg?amount=${invoice.finalAmount}&addInfo=${encodeURIComponent(invoice.invoiceCode)}&accountName=PHONEHOUSE%20RETAIL`;

  // Warranty lookup QR code
  const qrWarrantyUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`https://phonehouse.vn/warranty?code=${invoice.invoiceCode}`)}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Top Actions */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-sm">Xem Trước Hóa Đơn Nhiệt K80 (80mm)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-md active:scale-95"
            >
              <Printer className="w-4 h-4" />
              In Ngay (F9)
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-all"
              >
                Đóng (Esc)
              </button>
            )}
          </div>
        </div>

        {/* Printable Receipt Paper Container */}
        <div className="p-6 overflow-y-auto bg-slate-50 flex justify-center">
          <div
            id="k80-thermal-receipt"
            className="w-[80mm] max-w-[80mm] bg-white p-4 shadow-sm border border-slate-200 text-slate-900 font-mono text-[11px] leading-tight"
            style={{ minWidth: '72mm' }}
          >
            {/* Store Header */}
            <div className="text-center pb-3 border-b border-dashed border-slate-400">
              <h1 className="text-sm font-black tracking-wider uppercase">PHONEHOUSE VIỆT NAM</h1>
              <p className="text-[10px] text-slate-600 font-sans mt-0.5 font-medium">Hệ Thống iPhone & Thiết Bị Apple Chính Hãng</p>
              <p className="text-[9px] text-slate-500 font-sans mt-1">Đ/C: {invoice.branchAddress || '456 Nguyễn Tri Phương, Hải Châu, Đà Nẵng'}</p>
              <p className="text-[9px] text-slate-500 font-sans">Hotline: {invoice.branchPhone || '1900 8888 99'} - MST: 0401987654</p>
            </div>

            {/* Invoice Meta */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1">
              <div className="text-center font-bold text-xs">HÓA ĐƠN BÁN HÀNG & BẢO HÀNH</div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-600">Mã HĐ:</span>
                <span className="font-bold">{invoice.invoiceCode}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-600">Ngày in:</span>
                <span>{formattedDate}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-600">Thu ngân:</span>
                <span>{invoice.creatorName || 'Thu Ngân PhoneHouse'}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-600">Khách hàng:</span>
                <span className="font-bold">{invoice.customerName || 'Khách vãng lai'}</span>
              </div>
              {invoice.customerPhone && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-600">Điện thoại:</span>
                  <span>{invoice.customerPhone}</span>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="py-2.5 border-b border-dashed border-slate-400">
              <div className="grid grid-cols-12 font-bold text-[10px] pb-1 border-b border-slate-300 mb-1.5">
                <div className="col-span-6">Sản phẩm / IMEI</div>
                <div className="col-span-2 text-center">SL</div>
                <div className="col-span-4 text-right">T.Tiền</div>
              </div>

              <div className="space-y-2">
                {invoice.items.map((item, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <div className="grid grid-cols-12 font-sans font-medium text-[10.5px]">
                      <div className="col-span-6 leading-tight">{item.name}</div>
                      <div className="col-span-2 text-center font-mono">x{item.quantity}</div>
                      <div className="col-span-4 text-right font-mono font-bold">{item.totalPrice.toLocaleString('vi-VN')}</div>
                    </div>
                    {item.imei && (
                      <div className="text-[9px] text-slate-600 font-mono pl-1 flex items-center gap-1">
                        <Smartphone className="w-2.5 h-2.5 inline text-slate-400" />
                        <span>IMEI: <b>{item.imei}</b></span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Calculations Breakdown */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[10px]">
              <div className="flex justify-between">
                <span className="text-slate-600">Tổng tiền hàng:</span>
                <span className="font-mono">{invoice.subTotal.toLocaleString('vi-VN')} đ</span>
              </div>

              {invoice.discountAmount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Chiết khấu / Voucher:</span>
                  <span className="font-mono">-{invoice.discountAmount.toLocaleString('vi-VN')} đ</span>
                </div>
              )}

              {invoice.tradeInDeduction > 0 && (
                <div className="flex justify-between text-indigo-600">
                  <span>Trừ thu cũ đổi mới:</span>
                  <span className="font-mono">-{invoice.tradeInDeduction.toLocaleString('vi-VN')} đ</span>
                </div>
              )}

              <div className="flex justify-between text-xs font-bold pt-1.5 border-t border-slate-300">
                <span>THANH TOÁN:</span>
                <span className="font-mono text-emerald-700">{invoice.finalAmount.toLocaleString('vi-VN')} đ</span>
              </div>

              <div className="flex justify-between text-[9px] text-slate-600 pt-0.5">
                <span>Hình thức:</span>
                <span className="font-bold uppercase">{invoice.paymentMethod}</span>
              </div>

              {invoice.paymentMethod === 'INSTALLMENT' && (
                <div className="bg-slate-100 p-1.5 rounded mt-1 text-[9px] space-y-0.5 font-sans">
                  <div className="flex justify-between">
                    <span>Trả trước (Down payment):</span>
                    <b className="font-mono">{invoice.downPayment?.toLocaleString('vi-VN') || 0} đ</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Khoản vay tài chính:</span>
                    <b className="font-mono">{invoice.financeAmount?.toLocaleString('vi-VN') || 0} đ</b>
                  </div>
                  {invoice.financePartnerName && (
                    <div className="flex justify-between text-slate-500">
                      <span>Đối tác tài chính:</span>
                      <b>{invoice.financePartnerName}</b>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* QR Electronic Warranty Lookup */}
            <div className="py-3 text-center border-b border-dashed border-slate-400 space-y-1">
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-800">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>TRA CỨU BẢO HÀNH ĐIỆN TỬ</span>
              </div>
              <div className="flex justify-center my-1">
                <img
                  src={qrWarrantyUrl}
                  alt="QR Warranty Lookup"
                  className="w-16 h-16 border border-slate-300 p-0.5 bg-white rounded"
                />
              </div>
              <p className="text-[8.5px] text-slate-500 font-sans">Quét mã QR bằng Camera để tra cứu tiến độ bảo hành & hạn bảo hành 12 tháng.</p>
            </div>

            {/* Footer Policy & Gratitude */}
            <div className="pt-2 text-center text-[8.5px] text-slate-500 font-sans space-y-0.5">
              <p className="font-semibold text-slate-700">★ 1 ĐỔI 1 TRONG 30 NGÀY NẾU LỖI PHẦN CỨNG ★</p>
              <p>Quý khách vui lòng giữ lại hóa đơn này để được hỗ trợ tốt nhất.</p>
              <p className="font-bold text-[9.5px] text-slate-800 pt-1 font-mono">CẢM ƠN QUÝ KHÁCH & HẸN GẶP LẠI!</p>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded CSS for ESC/POS K80 Thermal Printing */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .no-print {
            display: none !important;
          }
          #k80-thermal-receipt, #k80-thermal-receipt * {
            visibility: visible;
          }
          #k80-thermal-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 4mm !important;
            box-shadow: none !important;
            border: none !important;
          }
          @page {
            size: 80mm auto;
            margin: 0mm;
          }
        }
      `}</style>
    </div>
  );
};
