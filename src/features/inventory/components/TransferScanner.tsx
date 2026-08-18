import React, { useState } from 'react';
import { StoreBranch, DeviceItem, StockTransferSlip, WarehouseId } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { ArrowRightLeft, Search, Plus, Trash2, Smartphone, CheckCircle2, AlertTriangle, X } from 'lucide-react';

export interface TransferScannerProps {
  isOpen: boolean;
  onClose: () => void;
  branches: StoreBranch[];
  devices: DeviceItem[];
  currentBranch: StoreBranch;
  onExecuteTransfer: (transfer: StockTransferSlip, deviceImeis: string[]) => Promise<void> | void;
}

export const TransferScanner: React.FC<TransferScannerProps> = ({
  isOpen,
  onClose,
  branches,
  devices,
  currentBranch,
  onExecuteTransfer
}) => {
  const [sourceBranchId, setSourceBranchId] = useState(currentBranch.id);
  const [targetBranchId, setTargetBranchId] = useState(
    branches.find(b => b.id !== currentBranch.id)?.id || branches[0]?.id || ''
  );
  const [scanImeiInput, setScanImeiInput] = useState('');
  const [selectedImeis, setSelectedImeis] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const sourceBranch = branches.find(b => b.id === sourceBranchId) || currentBranch;
  const targetBranch = branches.find(b => b.id === targetBranchId) || branches[0];

  // In-stock devices in source branch
  const sourceAvailableDevices = devices.filter(
    d => d.status === 'in_stock' && (!d.branchId || d.branchId === sourceBranchId)
  );

  const handleAddImei = () => {
    const q = scanImeiInput.trim();
    if (!q) return;

    // Find device in source branch
    const matchedDevice = sourceAvailableDevices.find(
      d => d.imei.toLowerCase() === q.toLowerCase() || d.imei.endsWith(q)
    );

    if (!matchedDevice) {
      alert(`Không tìm thấy máy có IMEI "${q}" đang có sẵn trong kho của ${sourceBranch.name}.`);
      return;
    }

    if (selectedImeis.includes(matchedDevice.imei)) {
      alert('Máy này đã được thêm vào danh sách chuyển kho.');
      return;
    }

    setSelectedImeis(prev => [...prev, matchedDevice.imei]);
    setScanImeiInput('');
  };

  const handleRemoveImei = (imei: string) => {
    setSelectedImeis(prev => prev.filter(i => i !== imei));
  };

  const handleConfirmTransfer = async () => {
    if (selectedImeis.length === 0) {
      alert('Vui lòng quét ít nhất 1 mã IMEI để tạo phiếu chuyển kho.');
      return;
    }
    if (sourceBranchId === targetBranchId) {
      alert('Chi nhánh nguồn và chi nhánh đích không được trùng nhau.');
      return;
    }

    setIsSubmitting(true);
    try {
      const transferId = `TR-${Date.now().toString().slice(-6)}`;
      const transferCode = `CK-${new Date().toISOString().slice(2, 7).replace('-', '')}-${Date.now().toString().slice(-4)}`;

      const transferDevices = selectedImeis.map(imei => {
        const d = devices.find(dev => dev.imei === imei);
        return {
          id: d?.id || imei,
          type: 'device' as const,
          imei,
          name: d?.model || 'iPhone',
          model: d?.model,
          color: d?.color,
          storage: d?.storage,
          condition: d?.condition,
          quantity: 1,
          costPrice: d?.buyPrice || 0
        };
      });

      const newTransfer: StockTransferSlip = {
        id: transferId,
        code: transferCode,
        fromWarehouse: sourceBranchId as WarehouseId,
        fromWarehouseName: sourceBranch.name,
        toWarehouse: targetBranchId as WarehouseId,
        toWarehouseName: targetBranch.name,
        createdDate: new Date().toISOString(),
        creator: 'Thủ Kho Chi Nhánh',
        status: 'PENDING',
        items: transferDevices,
        totalQuantity: selectedImeis.length,
        totalValue: transferDevices.reduce((sum, it) => sum + it.costPrice, 0),
        notes
      };

      await onExecuteTransfer(newTransfer, selectedImeis);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-zinc-100">
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-100 text-[#ff4b16] flex items-center justify-center font-bold">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900">Tạo Phiếu Chuyển Kho Chi Nhánh</h3>
              <p className="text-xs text-zinc-500">Quét mã IMEI và điều chuyển máy liên chi nhánh</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Branch Source -> Dest */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-zinc-50 border border-zinc-200/80 rounded-2xl">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-zinc-400 block">Kho Xuất (Nguồn):</span>
              <select
                value={sourceBranchId}
                onChange={e => {
                  setSourceBranchId(e.target.value);
                  setSelectedImeis([]);
                }}
                className="w-full h-9 px-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-zinc-400 block">Kho Nhận (Đích):</span>
              <select
                value={targetBranchId}
                onChange={e => setTargetBranchId(e.target.value)}
                className="w-full h-9 px-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-[#ff4b16]"
              >
                {branches.filter(b => b.id !== sourceBranchId).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* IMEI Scanner Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-700 block">Quét / Nhập IMEI Cần Chuyển:</label>
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Quét mã vạch IMEI hoặc nhập 6 số cuối..."
                  value={scanImeiInput}
                  onChange={e => setScanImeiInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddImei();
                    }
                  }}
                  className="w-full h-10 pl-9 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono font-medium focus:bg-white focus:outline-none focus:border-[#ff4b16]"
                />
              </div>
              <Button variant="primary" size="md" onClick={handleAddImei} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                Thêm
              </Button>
            </div>
          </div>

          {/* Selected Devices List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-700">
              <span>Danh Sách Máy Chuyển Đi ({selectedImeis.length})</span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {selectedImeis.length === 0 ? (
                <div className="p-4 bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl text-center text-zinc-400 text-xs">
                  Chưa có máy nào được quét.
                </div>
              ) : (
                selectedImeis.map(imei => {
                  const dev = devices.find(d => d.imei === imei);
                  return (
                    <div
                      key={imei}
                      className="p-2.5 bg-zinc-50 border border-zinc-200/80 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center space-x-2">
                        <Smartphone className="w-4 h-4 text-[#ff4b16]" />
                        <div>
                          <span className="font-bold text-zinc-800">{dev?.model || 'iPhone'}</span>
                          <span className="text-[10px] text-zinc-500 font-mono block">IMEI: {imei}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveImei(imei)}
                        className="p-1 text-zinc-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 flex items-center justify-end space-x-2.5">
          <Button variant="outline" size="md" onClick={onClose} disabled={isSubmitting}>
            Hủy Bỏ
          </Button>
          <Button
            variant="primary"
            size="md"
            isLoading={isSubmitting}
            onClick={handleConfirmTransfer}
            leftIcon={<ArrowRightLeft className="w-4 h-4" />}
          >
            Tạo Phiếu Chuyển ({selectedImeis.length} máy)
          </Button>
        </div>
      </div>
    </div>
  );
};
