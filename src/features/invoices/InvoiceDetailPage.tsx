import React, { useState } from 'react';
import { SalesInvoice, FundAccount, StoreBranch, StaffMember } from '../../types';
import { InvoicePaymentTab } from './InvoicePaymentTab';
import { InvoiceHistoryTab } from './InvoiceHistoryTab';
import { InvoiceRefundDialog } from './InvoiceRefundDialog';
import { StatusBadge } from '../../shared/ui/StatusBadge/StatusBadge';
import { Button } from '../../shared/ui/Button/Button';
import { 
  Receipt, 
  Printer, 
  RotateCcw, 
  User, 
  Phone, 
  Building2, 
  Smartphone, 
  Package, 
  ShieldCheck, 
  X 
} from 'lucide-react';

export interface InvoiceDetailPageProps {
  invoice: SalesInvoice | null;
  funds: FundAccount[];
  branches: StoreBranch[];
  currentUser?: StaffMember | null;
  isOpen: boolean;
  onClose: () => void;
  onPrintThermal?: (invoice: SalesInvoice) => void;
  onCancelAndRefund: (invoice: SalesInvoice, refundFundId: string, reason: string) => Promise<void> | void;
}

export const InvoiceDetailPage: React.FC<InvoiceDetailPageProps> = ({
  invoice,
  funds,
  branches,
  currentUser,
  isOpen,
  onClose,
  onPrintThermal,
  onCancelAndRefund
}) => {
  const [activeTab, setActiveTab] = useState<'ITEMS' | 'PAYMENT' | 'HISTORY'>('ITEMS');
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [isRefunding, setIsRefunding] = useState(false);

  if (!isOpen || !invoice) return null;

  const branchObj = branches.find(b => b.id === invoice.branchId);

  const handleExecuteRefund = async (inv: SalesInvoice, fundId: string, reason: string) => {
    setIsRefunding(true);
    try {
      await onCancelAndRefund(inv, fundId, reason);
    } finally {
      setIsRefunding(false);
      setIsRefundDialogOpen(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-zinc-200/80">
          {/* 1. Modal Top Bar with Dark Obsidian Brand Gradient */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-zinc-950 via-zinc-900 to-black text-white border-b border-zinc-800 flex items-center justify-between relative overflow-hidden">
            <div className="absolute top-0 right-1/3 w-64 h-12 bg-orange-500/10 blur-2xl pointer-events-none" />

            <div className="flex items-center space-x-3 relative z-10">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-[#ff4b16] text-white flex items-center justify-center font-bold shadow-md shadow-orange-500/30">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-black text-white font-mono">
                    {invoice.invoiceCode || invoice.id}
                  </h3>
                  <StatusBadge status={invoice.status || 'completed'} />
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Ngày lập: <span className="font-mono text-zinc-300">{invoice.createdAt || invoice.createdDate || 'N/A'}</span> • Chi nhánh: <span className="font-bold text-orange-300">{branchObj?.name || invoice.branch || 'Toàn Hệ Thống'}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 relative z-10">
              {onPrintThermal && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPrintThermal(invoice)}
                  leftIcon={<Printer className="w-3.5 h-3.5" />}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700"
                >
                  In K80
                </Button>
              )}

              {invoice.status !== 'cancelled' && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setIsRefundDialogOpen(true)}
                  leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                >
                  Hủy & Hoàn Tiền
                </Button>
              )}

              <button
                onClick={onClose}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 2. Customer Summary Card with Soft Gradient */}
          <div className="bg-gradient-to-r from-orange-50/40 via-zinc-50 to-white px-5 py-3 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1.5 text-zinc-800">
                <User className="w-3.5 h-3.5 text-[#ff4b16]" />
                <span className="font-bold">{invoice.customerName}</span>
              </div>
              {invoice.customerPhone && (
                <div className="flex items-center space-x-1.5 text-zinc-600 font-mono">
                  <Phone className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{invoice.customerPhone}</span>
                </div>
              )}
            </div>

            <div className="text-zinc-600">
              Thu ngân: <span className="font-semibold text-zinc-800">{invoice.cashier || invoice.sellerName || 'Admin'}</span>
            </div>
          </div>

          {/* 3. Navigation Tabs */}
          <div className="flex items-center space-x-1 px-5 border-b border-zinc-100 text-xs font-semibold bg-white">
            <button
              onClick={() => setActiveTab('ITEMS')}
              className={`py-3 px-3 border-b-2 transition-all cursor-pointer ${
                activeTab === 'ITEMS'
                  ? 'border-[#ff4b16] text-[#ff4b16]'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              Sản Phẩm & Bảo Hành ({invoice.devices?.length || 0})
            </button>

            <button
              onClick={() => setActiveTab('PAYMENT')}
              className={`py-3 px-3 border-b-2 transition-all cursor-pointer ${
                activeTab === 'PAYMENT'
                  ? 'border-[#ff4b16] text-[#ff4b16]'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              Thanh Toán & Quỹ Thu
            </button>

            <button
              onClick={() => setActiveTab('HISTORY')}
              className={`py-3 px-3 border-b-2 transition-all cursor-pointer ${
                activeTab === 'HISTORY'
                  ? 'border-[#ff4b16] text-[#ff4b16]'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              Lịch Sử Thao Tác
            </button>
          </div>

          {/* 4. Tab Content Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 pb-20 sm:pb-6">
            {activeTab === 'ITEMS' && (
              <div className="space-y-3">
                {/* Devices */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Máy iPhone Bán Ra</h4>
                  {invoice.devices && invoice.devices.length > 0 ? (
                    <div className="space-y-2">
                      {invoice.devices.map((dev, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-2xl flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center space-x-2.5">
                            <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#ff4b16] flex items-center justify-center shrink-0">
                              <Smartphone className="w-4 h-4" />
                            </div>
                            <div>
                              <h5 className="font-semibold text-zinc-800">{dev.model}</h5>
                              <p className="text-[11px] text-zinc-500 font-mono">
                                IMEI: <span className="font-semibold text-zinc-700">{dev.imei}</span> • {dev.color || 'Đen'} • {dev.storage || '128GB'}
                              </p>
                            </div>
                          </div>
                          <span className="font-semibold font-mono text-zinc-900">
                            {(dev.price || 0).toLocaleString('vi-VN')}đ
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400 italic">Không có máy trong hóa đơn này</p>
                  )}
                </div>

                {/* Accessories */}
                {invoice.accessories && invoice.accessories.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-zinc-100">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Phụ Kiện Đi Kèm</h4>
                    <div className="space-y-2">
                      {invoice.accessories.map((acc, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-2xl flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center space-x-2.5">
                            <Package className="w-4 h-4 text-blue-600 shrink-0" />
                            <div>
                              <h5 className="font-bold text-zinc-900">{acc.name}</h5>
                              <span className="text-[10px] text-zinc-500 font-mono">Số lượng: {acc.quantity || 1}</span>
                            </div>
                          </div>
                          <span className="font-bold font-mono text-zinc-800">
                            {((acc.price || 0) * (acc.quantity || 1)).toLocaleString('vi-VN')}đ
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warranty Package */}
                <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2 text-emerald-800">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Gói bảo hành: <strong>{invoice.warrantyPackage || 'Gói Tiêu Chuẩn 6 Tháng'}</strong></span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'PAYMENT' && (
              <InvoicePaymentTab invoice={invoice} funds={funds} />
            )}

            {activeTab === 'HISTORY' && (
              <InvoiceHistoryTab invoice={invoice} />
            )}
          </div>
        </div>
      </div>

      {/* Refund Confirmation Modal */}
      <InvoiceRefundDialog
        isOpen={isRefundDialogOpen}
        invoice={invoice}
        funds={funds}
        isLoading={isRefunding}
        onConfirmRefund={handleExecuteRefund}
        onClose={() => setIsRefundDialogOpen(false)}
      />
    </>
  );
};
