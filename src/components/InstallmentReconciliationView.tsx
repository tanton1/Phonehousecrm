import React, { useState } from 'react';
import { CheckCircle2, ChevronRight, X, Calendar, Search, Building2 } from 'lucide-react';
import { SalesInvoice, CashTransaction, FundAccount, Partner } from '../types';

interface Props {
  invoices: SalesInvoice[];
  funds: FundAccount[];
  partners: Partner[];
  onUpdateInvoice: (invoice: SalesInvoice) => void;
  onAddTransaction: (transaction: CashTransaction) => void;
  onUpdateFunds: (funds: FundAccount[]) => void;
  onUpdatePartner: (partner: Partner) => void;
}

export const InstallmentReconciliationView: React.FC<Props> = ({ invoices, funds, partners, onUpdateInvoice, onAddTransaction, onUpdateFunds, onUpdatePartner }) => {
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [actualAmount, setActualAmount] = useState('');
  const [feeAmount, setFeeAmount] = useState('');
  const [selectedFund, setSelectedFund] = useState('');

  const pendingInvoices = invoices.filter(inv => inv.installmentDisbursementStatus === 'PENDING');
  const disbursedInvoices = invoices.filter(inv => inv.installmentDisbursementStatus === 'DISBURSED');

  const [activeTab, setActiveTab] = useState<'PENDING' | 'DISBURSED'>('PENDING');

  const handleOpenConfirm = (inv: SalesInvoice) => {
    setSelectedInvoice(inv);
    setActualAmount(inv.installmentExpectedAmount?.toString() || '0');
    setFeeAmount('0');
    setSelectedFund(funds.find(f => f.type === 'BANK')?.name || funds[0]?.name || '');
  };

  const handleConfirmDisbursement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    const amountNum = parseFloat(actualAmount.replace(/[^0-9]/g, '')) || 0;
    const feeNum = parseFloat(feeAmount.replace(/[^0-9]/g, '')) || 0;
    if (amountNum <= 0) {
      alert('Vui lòng nhập số tiền hợp lệ lớn hơn 0');
      return;
    }

    const fund = funds.find(f => f.name === selectedFund);
    if (!fund) return;

    const now = new Date();
    const dateStr = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;

    // 1. Ghi nhận tiền thu về
    const txIn: CashTransaction = {
      id: `TX-${Date.now()}-DISB`,
      code: `PT-${Math.floor(1000 + Math.random() * 9000)}`,
      type: 'RECEIPT',
      category: 'OTHER_INCOME',
      categoryName: 'Giải ngân trả góp/MPOS',
      amount: amountNum,
      fundType: fund.type,
      fundName: fund.name,
      date: dateStr,
      creator: 'Nhật Tân (Admin)',
      notes: `Giải ngân HĐ ${selectedInvoice.installmentContractCode || selectedInvoice.invoiceCode} (${selectedInvoice.installmentDetails?.financeCompany || selectedInvoice.installmentCompany || 'Tài chính'})`,
      status: 'COMPLETED'
    };
    onAddTransaction(txIn);

    // 2. Ghi nhận chi phí (nếu có)
    if (feeNum > 0) {
      const txFee: CashTransaction = {
        id: `TX-${Date.now()}-FEE`,
        code: `PC-${Math.floor(1000 + Math.random() * 9000)}`,
        type: 'PAYMENT',
        category: 'OTHER_EXPENSE',
        categoryName: 'Phí trả góp/MPOS',
        amount: feeNum,
        fundType: fund.type,
        fundName: fund.name,
        date: dateStr,
        creator: 'Nhật Tân (Admin)',
        notes: `Phí dịch vụ giải ngân HĐ ${selectedInvoice.installmentContractCode || selectedInvoice.invoiceCode}`,
        status: 'COMPLETED'
      };
      setTimeout(() => {
        onAddTransaction(txFee);
      }, 100);
    }

    // 3. Cập nhật trạng thái Invoice
    const updatedInvoice = {
      ...selectedInvoice,
      installmentDisbursementStatus: 'DISBURSED' as const,
      status: 'completed' as const
    };
    onUpdateInvoice(updatedInvoice);

    
    // 4. Giảm công nợ khách hàng
    const customerPhone = selectedInvoice.customerPhone || selectedInvoice.phone;
    if (customerPhone) {
      const customer = partners.find(p => p.phone === customerPhone);
      if (customer && selectedInvoice.installmentExpectedAmount) {
        onUpdatePartner({
          ...customer,
          outstandingDebt: (customer.outstandingDebt || 0) - selectedInvoice.installmentExpectedAmount
        });
      }
    }

    setSelectedInvoice(null);

  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  return (
    <div className="h-full flex flex-col bg-zinc-50">
      <div className="bg-white border-b border-zinc-200 p-4 sm:p-6 pb-0">
        <h2 className="text-xl sm:text-2xl font-black text-[#171717] tracking-tight">Đối soát Giải ngân & MPOS</h2>
        <p className="text-sm text-zinc-500 mt-1 mb-4">Quản lý các hồ sơ trả góp, quẹt thẻ chờ đối tác tài chính giải ngân.</p>
        <div className="flex space-x-6">
          <button
            onClick={() => setActiveTab('PENDING')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'PENDING' ? 'border-[#EA580C] text-[#EA580C]' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
          >
            Chờ giải ngân ({pendingInvoices.length})
          </button>
          <button
            onClick={() => setActiveTab('DISBURSED')}
            className={`pb-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'DISBURSED' ? 'border-orange-500 text-orange-500' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
          >
            Đã giải ngân ({disbursedInvoices.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(activeTab === 'PENDING' ? pendingInvoices : disbursedInvoices).map(inv => (
            <div key={inv.id} className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className={`text-[10px] uppercase font-black tracking-wider px-2 py-1 rounded-md ${inv.installmentDetails?.financeCompany === 'HD Saison' ? 'bg-rose-100 text-rose-600' : 'bg-orange-100 text-orange-600'}`}>
                    {inv.installmentCompany || inv.installmentDetails?.financeCompany || 'MPOS'}
                  </span>
                  <p className="font-bold text-[#171717] mt-2">{inv.customerName}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500">Mã HĐ</p>
                  <p className="text-sm font-bold font-mono">{inv.installmentContractCode || inv.invoiceCode}</p>
                </div>
              </div>
              <div className="bg-zinc-50 p-3 rounded-xl mb-4 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Giá trị đơn máy:</span>
                  <span className="font-bold">{formatCurrency(inv.finalAmount)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Đã thu trước:</span>
                  <span className="font-bold text-orange-600">{formatCurrency(inv.downPayment || inv.installmentDetails?.downPayment || 0)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-zinc-200 pt-2">
                  <span className="font-bold text-zinc-700">Chờ giải ngân:</span>
                  <span className="font-black text-[#EA580C]">{formatCurrency(inv.installmentExpectedAmount || 0)}</span>
                </div>
              </div>
              {activeTab === 'PENDING' ? (
                <button
                  onClick={() => handleOpenConfirm(inv)}
                  className="w-full py-2.5 bg-[#171717] hover:bg-black text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Xác nhận giải ngân
                </button>
              ) : (
                <div className="flex items-center justify-center space-x-1.5 text-xs font-bold text-zinc-500 bg-zinc-100 py-2.5 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 text-[#EA580C]" />
                  <span>Đã nhận tiền</span>
                </div>
              )}
            </div>
          ))}
        </div>
        
        {(activeTab === 'PENDING' ? pendingInvoices : disbursedInvoices).length === 0 && (
          <div className="text-center py-20 text-zinc-400">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>Không có hồ sơ nào.</p>
          </div>
        )}
      </div>

      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">Xác nhận Giải ngân</h3>
                <p className="text-xs text-zinc-500">Khách: {selectedInvoice.customerName}</p>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="p-1.5 hover:bg-zinc-100 rounded-xl cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmDisbursement} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Số tiền đối tác báo về</label>
                <input
                  required
                  type="text"
                  value={actualAmount}
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setActualAmount(val ? parseInt(val).toLocaleString('vi-VN') : '');
                  }}
                  className="w-full px-4 py-3 bg-white border border-orange-200 rounded-xl text-xl font-black text-[#EA580C] focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Phí dịch vụ/Chiết khấu (nếu có)</label>
                <input
                  type="text"
                  value={feeAmount}
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setFeeAmount(val ? parseInt(val).toLocaleString('vi-VN') : '');
                  }}
                  className="w-full px-4 py-3 bg-white border border-rose-200 rounded-xl text-lg font-bold text-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Tiền về Tài khoản / Quỹ</label>
                <select
                  value={selectedFund}
                  onChange={e => setSelectedFund(e.target.value)}
                  className="w-full px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-semibold"
                >
                  {funds.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                </select>
              </div>
              <div className="bg-orange-50 p-3 rounded-xl border border-orange-100">
                <p className="text-[11px] text-orange-800 leading-relaxed">
                  <strong>Lưu ý:</strong> Hành động này sẽ tạo 1 phiếu Thu (tiền về) và 1 phiếu Chi (tiền phí) tự động. Khoản nợ chờ giải ngân của khách sẽ được xóa.
                </p>
              </div>
              <button
                type="submit"
                className="w-full py-3.5 bg-[#EA580C] hover:bg-[#128a59] text-white font-bold rounded-xl shadow-lg shadow-orange-500/30 cursor-pointer"
              >
                Hoàn tất & Cập nhật sổ sách
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
