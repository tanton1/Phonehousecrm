import sys

def main():
    content = """import React, { useState, useMemo } from 'react';
import { 
  Smartphone, Upload, Image as ImageIcon, Trash2, X, Check, Building2, 
  Warehouse, Store, Coins, CreditCard, Sparkles, FileText, Package
} from 'lucide-react';
import { 
  DeviceItem, Partner, StoreBranch, WarehouseInfo, FundAccount, CashTransaction
} from '../types';

interface StockInModalProps {
  isOpen: boolean;
  onClose: () => void;
  partners?: Partner[];
  branches?: StoreBranch[];
  warehouses?: WarehouseInfo[];
  funds?: FundAccount[];
  onAddDevice: (device: DeviceItem) => void;
  onAddMultipleDevices?: (devices: DeviceItem[]) => void;
  onAddCashTransaction?: (tx: CashTransaction) => void;
  onUpdatePartner?: (partner: Partner) => void;
  onAddPartner?: (partner: Partner) => void;
}

// Compress image to Base64 using HTML5 Canvas to keep Firestore payloads light (<50KB per photo)
async function compressImageFile(file: File, maxWidth = 500, quality = 0.5): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(event.target?.result as string);
      img.src = event.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const StockInModal: React.FC<StockInModalProps> = ({
  isOpen,
  onClose,
  partners = [],
  branches = [],
  warehouses = [],
  funds = [],
  onAddMultipleDevices,
  onAddCashTransaction,
  onUpdatePartner,
  onAddPartner
}) => {
  // Batch mode raw text & parsed IMEIs
  const [batchRawImeis, setBatchRawImeis] = useState('');
  const [batchCode, setBatchCode] = useState(() => `LO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-01`);

  // Device Specifications
  const [model, setModel] = useState('iPhone 15 Pro Max');
  const [storage, setStorage] = useState('256GB');
  const [color, setColor] = useState('Titan Tự Nhiên');
  const [region, setRegion] = useState('VN/A');
  const [condition, setCondition] = useState<DeviceItem['condition']>('New Seal');
  const [batteryHealth, setBatteryHealth] = useState<number>(100);
  const [buyPrice, setBuyPrice] = useState<number>(29500000);
  const [sellPrice, setSellPrice] = useState<number>(33500000);

  // Supplier & Finance
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => branches[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK' | 'DEBT'>('BANK');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  
  // Photos
  const [photos, setPhotos] = useState<string[]>([]);

  // Computed Values
  const parsedImeis = useMemo(() => {
    return batchRawImeis
      .split('\\n')
      .map(s => s.trim())
      .filter(s => s.length >= 5);
  }, [batchRawImeis]);

  const totalQuantity = parsedImeis.length;
  const totalAmount = totalQuantity * buyPrice;

  // Auto-set amountPaid when payment method changes or totalAmount changes
  React.useEffect(() => {
    if (paymentMethod === 'DEBT') {
      setAmountPaid(0);
    } else {
      setAmountPaid(totalAmount);
    }
  }, [paymentMethod, totalAmount]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newPhotos: string[] = [];
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        if (file.type.startsWith('image/')) {
          const b64 = await compressImageFile(file);
          newPhotos.push(b64);
        }
      }
      setPhotos([...photos, ...newPhotos].slice(0, 5)); // max 5 photos
    }
  };

  const handleFinalSubmit = () => {
    if (totalQuantity === 0) {
      alert('Vui lòng nhập ít nhất 1 mã IMEI!');
      return;
    }
    if (!supplierName) {
      alert('Vui lòng nhập tên nhà cung cấp!');
      return;
    }

    const branch = branches.find(b => b.id === selectedBranchId) || branches[0];
    const targetWarehouseId = branch?.warehouseId || warehouses[0]?.id;
    const targetWarehouseName = warehouses.find(w => w.id === targetWarehouseId)?.name || 'Kho Nội Bộ';

    // 1. Create devices
    const newDevices: DeviceItem[] = parsedImeis.map((imei, idx) => ({
      id: `DEV-${Date.now().toString().slice(-6)}-${idx}`,
      imei,
      serialNo: `SN-${Date.now().toString().slice(-6)}-${idx}`,
      model,
      storage,
      color,
      region,
      batteryHealth,
      condition,
      buyPrice,
      sellPrice,
      status: 'in_stock',
      supplier: `${supplierName} - ${supplierPhone}`,
      warehouse: targetWarehouseId,
      branch: branch?.name,
      branchId: branch?.id,
      receivedDate: new Date().toISOString().split('T')[0],
      batchCode,
      notes: `Lô nhập ${batchCode} - Tự động tạo bằng Tool Nhập Kho`,
      photos
    }));

    if (onAddMultipleDevices) {
      onAddMultipleDevices(newDevices);
    }

    // 2. Partner / Supplier Accounting
    let existingPartner = partners.find(p => p.phone === supplierPhone || p.name === supplierName);
    
    // Nếu nợ một phần hoặc nợ toàn bộ
    const debtAmount = totalAmount - amountPaid;

    if (existingPartner) {
      if (onUpdatePartner) {
        onUpdatePartner({
          ...existingPartner,
          outstandingDebt: (existingPartner.outstandingDebt || 0) + debtAmount,
          totalSpent: (existingPartner.totalSpent || 0) + totalAmount,
          type: existingPartner.type === 'CUSTOMER' ? 'BOTH' : existingPartner.type
        });
      }
    } else if (onAddPartner) {
      onAddPartner({
        id: `PN-${Date.now()}`,
        code: `NCC-${Math.floor(1000 + Math.random() * 9000)}`,
        name: supplierName,
        phone: supplierPhone || '0000000000',
        type: 'SUPPLIER',
        totalSpent: totalAmount,
        outstandingDebt: debtAmount,
        createdAt: new Date().toISOString().split('T')[0]
      });
    }

    // 3. Cash Transaction if amountPaid > 0
    if (amountPaid > 0 && onAddCashTransaction) {
      const fund = funds.find(f => f.type === paymentMethod) || funds[0];
      if (fund) {
        onAddCashTransaction({
          id: `TX-${Date.now()}`,
          code: `PC-${Math.floor(1000 + Math.random() * 9000)}`,
          type: 'PAYMENT',
          category: 'INVENTORY_COST',
          categoryName: 'Chi tiền nhập hàng',
          amount: amountPaid,
          fundType: fund.type,
          fundName: fund.name,
          date: new Date().toLocaleString('sv-SE').replace(' ', 'T'),
          partnerName: supplierName,
          partnerPhone: supplierPhone,
          creator: 'Hệ thống',
          notes: `Thanh toán lô hàng ${batchCode}`,
          status: 'COMPLETED'
        });
      }
    }

    alert(`Nhập kho thành công ${totalQuantity} thiết bị!`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-zinc-50 rounded-3xl w-full max-w-6xl shadow-2xl flex flex-col my-auto border border-zinc-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-white px-5 py-4 border-b border-zinc-200 flex justify-between items-center sticky top-0 z-10 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-zinc-900 tracking-tight">Form Nhập Hàng Tối Ưu (One-Page)</h2>
              <p className="text-[11px] font-medium text-zinc-500">Mã Lô: <span className="font-mono text-orange-600 font-bold">{batchCode}</span> • Thiết kế thao tác nhanh gọn trên 1 màn hình</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: 3 Columns Grid */}
        <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 h-full lg:max-h-[75vh] overflow-y-auto custom-scrollbar bg-zinc-50">
          
          {/* COL 1: Nhập IMEI & Ảnh (Span 4) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-800 mb-1.5 flex justify-between">
                  <span>Mã IMEI Thiết Bị</span>
                  <span className="text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md">SL: {totalQuantity}</span>
                </label>
                <textarea
                  placeholder="Dán (Paste) danh sách IMEI vào đây...&#10;Mỗi IMEI là 1 dòng&#10;Ví dụ:&#10;3589000000001&#10;3589000000002"
                  value={batchRawImeis}
                  onChange={(e) => setBatchRawImeis(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-3 text-sm font-mono text-zinc-800 focus:outline-none focus:border-orange-500 min-h-[220px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-800 mb-1.5">Ảnh Kiện Hàng / Sản Phẩm (Tối đa 5)</label>
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((p, idx) => (
                    <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-zinc-200">
                      <img src={p} alt={`Photo ${idx}`} className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full text-white flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {photos.length < 5 && (
                    <label className="aspect-square rounded-xl border-2 border-dashed border-zinc-300 flex flex-col items-center justify-center text-zinc-500 hover:bg-zinc-50 hover:border-orange-400 cursor-pointer transition-colors">
                      <Upload className="w-5 h-5 mb-1" />
                      <span className="text-[10px] font-bold">Thêm ảnh</span>
                      <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* COL 2: Thông số Cấu Hình (Span 4) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm space-y-3.5">
              <h3 className="font-bold text-sm text-zinc-900 flex items-center border-b border-zinc-100 pb-2">
                <Smartphone className="w-4 h-4 text-orange-500 mr-1.5" />
                Cấu Hình Chung
              </h3>
              
              <div>
                <label className="block text-xs font-bold text-zinc-600 mb-1">Dòng Máy</label>
                <input type="text" value={model} onChange={e => setModel(e.target.value)} className="w-full bg-zinc-50 border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-900 font-semibold focus:border-orange-500" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-600 mb-1">Dung Lượng</label>
                  <select value={storage} onChange={e => setStorage(e.target.value)} className="w-full bg-zinc-50 border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-900 font-semibold focus:border-orange-500">
                    <option value="64GB">64GB</option>
                    <option value="128GB">128GB</option>
                    <option value="256GB">256GB</option>
                    <option value="512GB">512GB</option>
                    <option value="1TB">1TB</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-600 mb-1">Mã Vùng</label>
                  <select value={region} onChange={e => setRegion(e.target.value)} className="w-full bg-zinc-50 border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-900 font-semibold focus:border-orange-500">
                    <option value="VN/A">VN/A (Việt Nam)</option>
                    <option value="LL/A">LL/A (Mỹ)</option>
                    <option value="ZA/A">ZA/A (Singapore)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-600 mb-1">Màu Sắc</label>
                  <input type="text" value={color} onChange={e => setColor(e.target.value)} className="w-full bg-zinc-50 border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-900 font-semibold focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-600 mb-1">Tình Trạng</label>
                  <select value={condition} onChange={e => setCondition(e.target.value as any)} className="w-full bg-zinc-50 border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-900 font-semibold focus:border-orange-500">
                    <option value="New Seal">New Seal</option>
                    <option value="Like New 99%">Like New 99%</option>
                    <option value="98% Cấn Nhẹ">98% Cấn Nhẹ</option>
                    <option value="Hàng Cũ Trưng Bày">Hàng Cũ Trưng Bày</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-600 mb-1">Pin (%)</label>
                <input type="number" value={batteryHealth} onChange={e => setBatteryHealth(Number(e.target.value))} className="w-full bg-zinc-50 border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-900 font-semibold focus:border-orange-500" />
              </div>
            </div>
          </div>

          {/* COL 3: Nhà Cung Cấp & Thanh Toán (Span 4) */}
          <div className="lg:col-span-4 space-y-4 flex flex-col">
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm space-y-3.5">
              <h3 className="font-bold text-sm text-zinc-900 flex items-center border-b border-zinc-100 pb-2">
                <Store className="w-4 h-4 text-orange-500 mr-1.5" />
                Giao Dịch & Nhập Kho
              </h3>
              
              <div>
                <label className="block text-xs font-bold text-zinc-600 mb-1">Chi Nhánh Nhập</label>
                <select 
                  value={selectedBranchId} 
                  onChange={e => setSelectedBranchId(e.target.value)} 
                  className="w-full bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-sm text-orange-900 font-black focus:border-orange-500"
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name} - {warehouses.find(w => w.id === b.warehouseId)?.name || 'Kho Nội Bộ'}</option>
                  ))}
                </select>
                <p className="text-[10px] text-zinc-500 mt-1 italic">* Máy sẽ được gán tự động vào kho tương ứng của chi nhánh.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-600 mb-1">Tên Nhà Cung Cấp</label>
                  <input type="text" placeholder="Nhập tên..." value={supplierName} onChange={e => setSupplierName(e.target.value)} className="w-full bg-zinc-50 border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-900 font-semibold focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-600 mb-1">SĐT Liên Hệ</label>
                  <input type="text" placeholder="Số điện thoại..." value={supplierPhone} onChange={e => setSupplierPhone(e.target.value)} className="w-full bg-zinc-50 border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-900 font-semibold focus:border-orange-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-600 mb-1">Đơn Giá Nhập (VNĐ)</label>
                  <input type="number" value={buyPrice} onChange={e => setBuyPrice(Number(e.target.value))} className="w-full bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 font-mono font-bold focus:border-red-400" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-600 mb-1">Giá Bán Niêm Yết (VNĐ)</label>
                  <input type="number" value={sellPrice} onChange={e => setSellPrice(Number(e.target.value))} className="w-full bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-700 font-mono font-bold focus:border-emerald-400" />
                </div>
              </div>
            </div>

            <div className="bg-orange-50 p-4 rounded-2xl border border-orange-200 shadow-sm mt-auto space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-zinc-700">Tổng Số Lượng:</span>
                <span className="font-black text-orange-600">{totalQuantity} máy</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-zinc-700">Tổng Tiền Cần Trả:</span>
                <span className="font-black text-red-600 font-mono">{totalAmount.toLocaleString('vi-VN')}đ</span>
              </div>
              
              <div className="border-t border-orange-200/50 pt-3 mt-1">
                <label className="block text-xs font-bold text-zinc-700 mb-2">Hình Thức Thanh Toán</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['BANK', 'CASH', 'DEBT'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        paymentMethod === m ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50'
                      }`}
                    >
                      {m === 'BANK' ? 'Chuyển Khoản' : m === 'CASH' ? 'Tiền Mặt' : 'Ghi Nợ'}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod !== 'DEBT' && (
                <div className="pt-1">
                  <label className="block text-[10px] font-bold text-zinc-500 mb-1 uppercase tracking-wider">Số Tiền Thực Trả (VNĐ)</label>
                  <input 
                    type="number" 
                    value={amountPaid} 
                    onChange={e => setAmountPaid(Number(e.target.value))} 
                    className="w-full bg-white border border-orange-300 rounded-lg px-3 py-2 text-sm text-zinc-900 font-mono font-bold focus:border-orange-500" 
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-white p-4 sm:p-5 border-t border-zinc-200 flex justify-end space-x-3 rounded-b-3xl shrink-0">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-zinc-300 text-zinc-700 font-bold text-sm hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            Hủy Bỏ
          </button>
          <button 
            onClick={handleFinalSubmit}
            disabled={totalQuantity === 0}
            className={`px-8 py-2.5 rounded-xl font-black text-sm flex items-center space-x-2 transition-all cursor-pointer shadow-md ${
              totalQuantity > 0 
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-orange-500/20 active:scale-95' 
                : 'bg-zinc-300 text-zinc-500 cursor-not-allowed'
            }`}
          >
            <Check className="w-5 h-5 stroke-[3]" />
            <span>Xác Nhận Nhập Kho ({totalQuantity})</span>
          </button>
        </div>

      </div>
    </div>
  );
};
