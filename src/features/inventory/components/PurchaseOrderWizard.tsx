import React, { useState } from 'react';
import { Partner, StoreBranch, FundAccount, DeviceItem, PurchaseOrder, DeviceCondition } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { ShoppingBag, Plus, Trash2, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, X } from 'lucide-react';

export interface PurchaseOrderWizardProps {
  isOpen: boolean;
  onClose: () => void;
  partners: Partner[];
  branches: StoreBranch[];
  funds: FundAccount[];
  onCompletePO: (po: PurchaseOrder, newDevices: DeviceItem[], paymentFundId?: string, paidAmount?: number) => Promise<void> | void;
}

const DEVICE_CONDITION_OPTIONS: DeviceCondition[] = [
  'New Seal',
  'Like New',
  '99% Keng',
  '98% Cấn Nhẹ',
  '95% Trầy Xước',
  'Hàng Cũ Trưng Bày'
];

export const PurchaseOrderWizard: React.FC<PurchaseOrderWizardProps> = ({
  isOpen,
  onClose,
  partners,
  branches,
  funds,
  onCompletePO
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Supplier & Meta
  const suppliers = partners.filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH');
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [branchId, setBranchId] = useState('');
  const [orderCode, setOrderCode] = useState(`PO-${Date.now().toString().slice(-6)}`);
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Step 2: Devices to import
  const [deviceRows, setDeviceRows] = useState<{
    id: string;
    model: string;
    color: string;
    storage: string;
    imei: string;
    buyPrice: number;
    sellPrice: number;
    condition: DeviceCondition;
    batteryHealth: number;
  }[]>([
    {
      id: 'row-1',
      model: 'iPhone 15 Pro Max',
      color: 'Titan Tự Nhiên',
      storage: '256GB',
      imei: '',
      buyPrice: 24000000,
      sellPrice: 26500000,
      condition: 'Like New 99%',
      batteryHealth: 95
    }
  ]);

  // Step 3: Payment & Debt
  const totalAmount = deviceRows.reduce((sum, r) => sum + (r.buyPrice || 0), 0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentFundId, setPaymentFundId] = useState(funds[0]?.id || '');

  if (!isOpen) return null;

  const selectedSupplier = suppliers.find(s => s.id === supplierId) || suppliers[0];
  const selectedBranch = branches.find(b => b.id === branchId);
  const remainingDebt = Math.max(0, totalAmount - paidAmount);

  const handleAddRow = () => {
    setDeviceRows(prev => [
      ...prev,
      {
        id: `row-${Date.now()}`,
        model: 'iPhone 14 Pro Max',
        color: 'Tím Deep Purple',
        storage: '128GB',
        imei: '',
        buyPrice: 18000000,
        sellPrice: 20500000,
        condition: 'Like New 99%',
        batteryHealth: 90
      }
    ]);
  };

  const handleRemoveRow = (id: string) => {
    if (deviceRows.length === 1) return;
    setDeviceRows(prev => prev.filter(r => r.id !== id));
  };

  const handleUpdateRow = (id: string, field: string, value: any) => {
    setDeviceRows(prev =>
      prev.map(r => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleFinish = async () => {
    if (!selectedBranch?.id || !selectedBranch.warehouseId) {
      alert('Vui lòng chọn chi nhánh và kho nhận hàng trước khi tạo phiếu.');
      setStep(1);
      return;
    }
    // Validate IMEIs
    const emptyImeis = deviceRows.filter(r => !/^\d{5,15}$/.test(r.imei.trim()));
    if (emptyImeis.length > 0) {
      alert('Vui lòng nhập IMEI/Serial từ 5 đến 15 chữ số cho tất cả các máy.');
      setStep(2);
      return;
    }

    setIsSubmitting(true);
    try {
      const newDevices: DeviceItem[] = deviceRows.map((r, idx) => ({
        id: `DEV-PO-${Date.now()}-${idx}`,
        imei: r.imei.trim(),
        serialNo: r.imei.trim(),
        model: r.model,
        color: r.color,
        storage: r.storage,
        condition: r.condition,
        batteryHealth: r.batteryHealth,
        buyPrice: r.buyPrice,
        sellPrice: r.sellPrice,
        status: 'in_stock',
        supplier: selectedSupplier?.name || 'NCC',
        supplierId: selectedSupplier?.id,
        branchId: selectedBranch?.id,
        branch: selectedBranch?.name,
        currentLocationId: selectedBranch?.warehouseId,
        warehouseId: selectedBranch?.warehouseId,
        warehouse: selectedBranch?.warehouseId,
        receivedDate: orderDate,
        warrantyPeriodMonths: 12,
        icloudStatus: 'Clean / Đã Thoát',
        screenStatus: 'Zin Màn Keng'
      }));

      const newPO: PurchaseOrder = {
        id: `PO-${Date.now()}`,
        code: orderCode,
        supplierId: selectedSupplier?.id || '',
        supplierName: selectedSupplier?.name || 'NCC',
        branchId: selectedBranch?.id,
        branchName: selectedBranch?.name,
        warehouseId: selectedBranch?.warehouseId || '',
        warehouseName: selectedBranch?.name || '',
        orderDate,
        creatorName: 'Quản Lý Thu Mua',
        status: 'COMPLETED',
        paymentStatus: paidAmount >= totalAmount ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID',
        items: deviceRows.map((r, i) => ({
          id: `item-${i}`,
          type: 'device',
          name: r.model,
          model: r.model,
          color: r.color,
          storage: r.storage,
          condition: r.condition,
          imei: r.imei,
          quantity: 1,
          importPrice: r.buyPrice,
          suggestedRetailPrice: r.sellPrice,
          totalAmount: r.buyPrice
        })),
        totalQuantity: deviceRows.length,
        subTotal: totalAmount,
        totalAmount,
        paidAmount,
        debtAmount: remainingDebt,
        notes
      };

      await onCompletePO(newPO, newDevices, paidAmount > 0 ? paymentFundId : undefined, paidAmount);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-zinc-100">
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-100 text-[#ff4b16] flex items-center justify-center font-bold">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900">Tạo Phiếu Nhập Hàng NCC</h3>
              <p className="text-xs text-zinc-500">Quy trình 3 bước nhập kho và ghi nhận công nợ</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Progress Indicator */}
        <div className="px-5 py-3 bg-zinc-50/80 border-b border-zinc-100 flex items-center justify-around text-xs font-bold">
          <span className={step >= 1 ? 'text-[#ff4b16]' : 'text-zinc-400'}>
            1. Nhà Cung Cấp & Chi Nhánh
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-zinc-300" />
          <span className={step >= 2 ? 'text-[#ff4b16]' : 'text-zinc-400'}>
            2. Danh Sách IMEI ({deviceRows.length} máy)
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-zinc-300" />
          <span className={step >= 3 ? 'text-[#ff4b16]' : 'text-zinc-400'}>
            3. Thanh Toán & Công Nợ
          </span>
        </div>

        {/* Wizard Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700 block">Nhà Cung Cấp:</label>
                  <select
                    value={supplierId}
                    onChange={e => setSupplierId(e.target.value)}
                    className="w-full h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#ff4b16]"
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} (Nợ hiện tại: {(s.outstandingDebt || 0).toLocaleString('vi-VN')}đ)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700 block">Chi Nhánh Nhận Hàng:</label>
                  <select
                    value={branchId}
                    onChange={e => setBranchId(e.target.value)}
                    className="w-full h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#ff4b16]"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700 block">Mã Phiếu Nhập:</label>
                  <input
                    type="text"
                    value={orderCode}
                    onChange={e => setOrderCode(e.target.value)}
                    className="w-full h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-[#ff4b16]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700 block">Ngày Nhập:</label>
                  <input
                    type="date"
                    value={orderDate}
                    onChange={e => setOrderDate(e.target.value)}
                    className="w-full h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:border-[#ff4b16]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700 block">Ghi Chú Đơn Nhập:</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ghi chú về lô hàng, chất lượng hoặc thỏa thuận đổi trả..."
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:border-[#ff4b16] resize-none"
                />
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Danh Sách Thiết Bị Nhập Kho
                </span>
                <Button variant="outline" size="sm" onClick={handleAddRow} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                  Thêm Dòng Máy
                </Button>
              </div>

              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {deviceRows.map((row, idx) => (
                  <div key={row.id} className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-2xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-zinc-700">Máy #{idx + 1}</span>
                      {deviceRows.length > 1 && (
                        <button
                          onClick={() => handleRemoveRow(row.id)}
                          className="text-zinc-400 hover:text-rose-600 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <input
                        type="text"
                        placeholder="Model (e.g. iPhone 15 Pro)"
                        value={row.model}
                        onChange={e => handleUpdateRow(row.id, 'model', e.target.value)}
                        className="h-8 px-2 bg-white border border-zinc-200 rounded-lg font-medium"
                      />
                      <input
                        type="text"
                        placeholder="Màu (e.g. Titan)"
                        value={row.color}
                        onChange={e => handleUpdateRow(row.id, 'color', e.target.value)}
                        className="h-8 px-2 bg-white border border-zinc-200 rounded-lg"
                      />
                      <input
                        type="text"
                        placeholder="Dung lượng (128GB)"
                        value={row.storage}
                        onChange={e => handleUpdateRow(row.id, 'storage', e.target.value)}
                        className="h-8 px-2 bg-white border border-zinc-200 rounded-lg"
                      />
                      <input
                        type="text"
                        placeholder="IMEI (15 số)"
                        value={row.imei}
                        onChange={e => handleUpdateRow(row.id, 'imei', e.target.value)}
                        className="h-8 px-2 bg-white border border-orange-300 font-mono font-bold text-[#ff4b16] rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <span className="text-[10px] text-zinc-400 block">Ngoại hình:</span>
                        <select
                          value={row.condition}
                          onChange={e => handleUpdateRow(row.id, 'condition', e.target.value as DeviceCondition)}
                          className="w-full h-8 px-2 bg-white border border-zinc-200 font-bold rounded-lg"
                        >
                          {DEVICE_CONDITION_OPTIONS.map(condition => <option key={condition} value={condition}>{condition}</option>)}
                        </select>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 block">Giá nhập (VNĐ):</span>
                        <input
                          type="number"
                          value={row.buyPrice}
                          onChange={e => handleUpdateRow(row.id, 'buyPrice', parseInt(e.target.value, 10) || 0)}
                          className="w-full h-8 px-2 bg-white border border-zinc-200 font-mono font-bold rounded-lg"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 block">Giá bán đề xuất:</span>
                        <input
                          type="number"
                          value={row.sellPrice}
                          onChange={e => handleUpdateRow(row.id, 'sellPrice', parseInt(e.target.value, 10) || 0)}
                          className="w-full h-8 px-2 bg-white border border-zinc-200 font-mono font-bold rounded-lg text-emerald-700"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 block">Pin (%):</span>
                        <input
                          type="number"
                          value={row.batteryHealth}
                          onChange={e => handleUpdateRow(row.id, 'batteryHealth', parseInt(e.target.value, 10) || 100)}
                          className="w-full h-8 px-2 bg-white border border-zinc-200 font-mono rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-between text-xs font-bold">
                <span>Tổng giá trị đơn nhập:</span>
                <span className="text-base font-black font-mono text-[#ff4b16]">
                  {totalAmount.toLocaleString('vi-VN')}đ
                </span>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="p-4 bg-zinc-50 border border-zinc-200/80 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between text-zinc-600">
                  <span>Nhà cung cấp:</span>
                  <span className="font-bold text-zinc-800">{selectedSupplier?.name}</span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Tổng tiền hàng ({deviceRows.length} máy):</span>
                  <span className="font-mono font-bold text-zinc-900">{totalAmount.toLocaleString('vi-VN')}đ</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700 block">Số Tiền Trả Ngay (VNĐ):</label>
                  <input
                    type="number"
                    value={paidAmount}
                    onChange={e => setPaidAmount(Math.min(totalAmount, parseInt(e.target.value, 10) || 0))}
                    className="w-full h-10 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-mono font-bold text-emerald-700 focus:outline-none focus:border-[#ff4b16]"
                  />
                </div>

                {paidAmount > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700 block">Quỹ Trừ Tiền Chi:</label>
                    <select
                      value={paymentFundId}
                      onChange={e => setPaymentFundId(e.target.value)}
                      className="w-full h-10 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#ff4b16]"
                    >
                      {funds.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.name} (Số dư: {f.currentBalance.toLocaleString('vi-VN')}đ)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-amber-900 block">Ghi nhận công nợ NCC:</span>
                  <span className="text-[11px] text-amber-700">Tự động cộng vào sổ nợ của {selectedSupplier?.name}</span>
                </div>
                <span className="text-base font-black font-mono text-amber-800">
                  {remainingDebt.toLocaleString('vi-VN')}đ
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 flex items-center justify-between">
          {step > 1 ? (
            <Button variant="outline" size="md" onClick={() => setStep((step - 1) as any)} leftIcon={<ChevronLeft className="w-4 h-4" />}>
              Quay Lại
            </Button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <Button variant="primary" size="md" onClick={() => setStep((step + 1) as any)} rightIcon={<ChevronRight className="w-4 h-4" />}>
              Tiếp Tục
            </Button>
          ) : (
            <Button variant="primary" size="md" isLoading={isSubmitting} onClick={handleFinish} leftIcon={<CheckCircle2 className="w-4 h-4" />}>
              Hoàn Tất Nhập Hàng
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
