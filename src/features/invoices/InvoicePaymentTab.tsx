import React from 'react';
import { SalesInvoice, FundAccount } from '../../types';
import { CreditCard, Wallet, Receipt, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';

export interface InvoicePaymentTabProps {
  invoice: SalesInvoice;
  funds: FundAccount[];
}

export const InvoicePaymentTab: React.FC<InvoicePaymentTabProps> = ({ invoice, funds }) => {
  const fundUsed = invoice.paymentFundId ? funds.find(f => f.id === invoice.paymentFundId) : null;
  const isInstallment = invoice.paymentMethod?.includes('Trả góp');

  return (
    <div className="space-y-4 text-xs">
      {/* 1. Payment Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl">
          <span className="text-zinc-500 font-semibold block">Tổng tiền hàng</span>
          <span className="text-sm font-black font-mono text-zinc-900 mt-1 block">
            {(invoice.totalAmount || 0).toLocaleString('vi-VN')}đ
          </span>
        </div>

        <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl">
          <span className="text-zinc-500 font-semibold block">Giảm giá / Thu cũ</span>
          <span className="text-sm font-black font-mono text-rose-600 mt-1 block">
            -{((invoice.discountAmount || 0) + (invoice.tradeInDeduction || 0)).toLocaleString('vi-VN')}đ
          </span>
        </div>

        <div className="p-3 bg-orange-50/70 border border-orange-200/80 rounded-xl">
          <span className="text-[#ff4b16] font-bold block">Khách đã trả</span>
          <span className="text-sm font-black font-mono text-[#ff4b16] mt-1 block">
            {(invoice.paidAmount || invoice.finalAmount || 0).toLocaleString('vi-VN')}đ
          </span>
        </div>

        <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl">
          <span className="text-zinc-500 font-semibold block">Còn nợ / Chờ giải ngân</span>
          <span className="text-sm font-black font-mono text-zinc-900 mt-1 block">
            {(invoice.debtAmount || invoice.installmentExpectedAmount || 0).toLocaleString('vi-VN')}đ
          </span>
        </div>
      </div>

      {/* 2. Payment Method & Fund Account Detail */}
      <div className="p-4 bg-white border border-zinc-200/80 rounded-2xl space-y-3">
        <h4 className="font-bold text-zinc-900 flex items-center space-x-1.5">
          <CreditCard className="w-4 h-4 text-[#ff4b16]" />
          <span>Chi Tiết Thanh Toán & Dòng Tiền</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-zinc-500 font-medium block">Hình thức thanh toán:</span>
            <span className="font-bold text-zinc-800 mt-0.5 block">{invoice.paymentMethod}</span>
          </div>

          <div>
            <span className="text-zinc-500 font-medium block">Tài khoản / Quỹ thu tiền:</span>
            <span className="font-bold text-zinc-800 mt-0.5 block">
              {fundUsed ? `${fundUsed.name} (${fundUsed.type === 'CASH' ? 'Tiền mặt' : 'Ngân hàng'})` : (invoice.paymentFundId ? `Quỹ: ${invoice.paymentFundId}` : 'Chưa gắn mã quỹ (Legacy)')}
            </span>
          </div>

          {invoice.paymentTransactionId && (
            <div>
              <span className="text-zinc-500 font-medium block">Mã phiếu thu sổ quỹ:</span>
              <span className="font-mono font-bold text-blue-600 mt-0.5 block">{invoice.paymentTransactionId}</span>
            </div>
          )}

          <div>
            <span className="text-zinc-500 font-medium block">Thu ngân lập đơn:</span>
            <span className="font-bold text-zinc-800 mt-0.5 block">{invoice.cashier || invoice.sellerName || 'Admin'}</span>
          </div>
        </div>
      </div>

      {/* 3. Installment Partner Details (If Applicable) */}
      {isInstallment && (
        <div className="p-4 bg-orange-50/50 border border-orange-200/80 rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-zinc-900 flex items-center space-x-1.5">
              <Receipt className="w-4 h-4 text-[#ff4b16]" />
              <span>Hồ Sơ Mua Trả Góp</span>
            </h4>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
              invoice.installmentDisbursementStatus === 'DISBURSED'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            }`}>
              {invoice.installmentDisbursementStatus === 'DISBURSED' ? 'ĐÃ GIẢI NGÂN' : 'CHỜ GIẢI NGÂN'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
            <div>
              <span className="text-zinc-500 block">Khách trả trước:</span>
              <span className="font-mono font-bold text-zinc-900">{(invoice.paidAmount || 0).toLocaleString('vi-VN')}đ</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Số tiền Cty Tài Chính nợ:</span>
              <span className="font-mono font-bold text-[#ff4b16]">{(invoice.installmentExpectedAmount || invoice.debtAmount || 0).toLocaleString('vi-VN')}đ</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Đối tác tài chính:</span>
              <span className="font-bold text-zinc-800">{invoice.installmentCompany || 'Home Credit / HD Saison'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
