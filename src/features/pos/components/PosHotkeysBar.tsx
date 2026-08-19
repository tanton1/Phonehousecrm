import React from 'react';

export interface PosHotkeysBarProps {
  onSearch?: () => void;
  onCustomer?: () => void;
  onVoucher?: () => void;
  onPayment?: () => void;
  onCheckout?: () => void;
}

export const PosHotkeysBar: React.FC<PosHotkeysBarProps> = ({
  onSearch,
  onCustomer,
  onVoucher,
  onPayment,
  onCheckout
}) => {
  const hotkeys = [
    { key: 'F2', label: 'Tìm IMEI/Barcode', action: onSearch, bg: 'bg-blue-600' },
    { key: 'F4', label: 'Khách Hàng', action: onCustomer, bg: 'bg-purple-600' },
    { key: 'F7', label: 'Voucher', action: onVoucher, bg: 'bg-amber-600' },
    { key: 'F8', label: 'Đổi PT Thanh Toán', action: onPayment, bg: 'bg-indigo-600' },
    { key: 'F9', label: 'Thanh Toán & In Bill', action: onCheckout, bg: 'bg-emerald-600' },
    { key: 'Esc', label: 'Đóng/Hủy', action: undefined, bg: 'bg-slate-600' }
  ];

  return (
    <div className="bg-slate-900 border-t border-slate-800 px-4 py-2 flex items-center justify-between text-xs text-slate-300 select-none no-print overflow-x-auto gap-2">
      <div className="flex items-center gap-1.5 font-bold text-slate-400 uppercase tracking-wider text-[10px] whitespace-nowrap">
        <span>⚡ Phím Tắt Thu Ngân:</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {hotkeys.map((h, i) => (
          <button
            key={i}
            onClick={h.action}
            type="button"
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded border border-slate-700 transition-all cursor-pointer whitespace-nowrap text-[11px]"
          >
            <kbd className={`px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow ${h.bg}`}>{h.key}</kbd>
            <span className="text-slate-300 font-medium">{h.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
