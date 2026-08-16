import React, { useState, useMemo, useRef } from 'react';
import { 
  Smartphone, 
  Upload, 
  Image as ImageIcon, 
  Trash2, 
  Eye, 
  X, 
  Plus, 
  Check, 
  AlertTriangle, 
  Layers, 
  Building2, 
  Warehouse, 
  Store, 
  Coins, 
  CreditCard, 
  Sparkles, 
  FileText, 
  Info, 
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  UserPlus,
  ArrowRight,
  ShieldCheck,
  Wrench,
  DollarSign,
  Package
} from 'lucide-react';
import { 
  DeviceItem, 
  Partner, 
  StoreBranch, 
  WarehouseInfo, 
  FundAccount, 
  CashTransaction, 
  WAREHOUSE_LIST,
  SystemBrand
} from '../types';

interface StockInModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingDevices: DeviceItem[];
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
  existingDevices = [],
  partners = [],
  branches = [],
  warehouses = [],
  funds = [],
  onAddDevice,
  onAddMultipleDevices,
  onAddCashTransaction,
  onUpdatePartner,
  onAddPartner
}) => {
  // Step Navigation: 1 (Máy & IMEI) -> 2 (Kho & Dòng Tiền) -> 3 (Ảnh & Xác Nhận)
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // Mode: Single Device vs Multi-IMEI Batch
  const [importMode, setImportMode] = useState<'single' | 'batch'>('batch');
  
  // Single mode IMEI & Serial
  const [singleImei, setSingleImei] = useState('');
  const [singleSerial, setSingleSerial] = useState('');

  // Batch mode raw text & parsed IMEIs
  const [batchRawImeis, setBatchRawImeis] = useState('');
  const [batchCode, setBatchCode] = useState(() => `LO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-01`);

  // Device Specifications (Essential fields only - Detailed technical testing will be done in Technician phase)
  const [model, setModel] = useState('iPhone 16 Pro Max');
  const [storage, setStorage] = useState('256GB');
  const [color, setColor] = useState('Titan Sa Mạc (Desert)');
  const [region, setRegion] = useState('VN/A (Chính hãng)');
  const [batteryHealth, setBatteryHealth] = useState(100);
  const [condition, setCondition] = useState<DeviceItem['condition']>('New Seal');
  const [buyPrice, setBuyPrice] = useState(31500000);
  const [sellPrice, setSellPrice] = useState(34500000);
  const [notes, setNotes] = useState('');

  // Destination Warehouse & System Brand
  const activeWarehouses = useMemo(() => {
    if (warehouses && warehouses.length > 0) return warehouses;
    return WAREHOUSE_LIST;
  }, [warehouses]);

  // System selection: 'TONG' | 'PHONEHOUSE' | 'XSTORE'
  const [selectedSystem, setSelectedSystem] = useState<SystemBrand>('TONG');
  
  // Filtered warehouses by system
  const systemWarehouses = useMemo(() => {
    return activeWarehouses.filter(w => (w.systemType || 'TONG') === selectedSystem);
  }, [activeWarehouses, selectedSystem]);

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(() => {
    return activeWarehouses[0]?.id || 'KHO_TONG';
  });

  const [selectedBranchName, setSelectedBranchName] = useState<string>(() => {
    return branches[0]?.name || 'Tổng Trụ Sở Trung Tâm';
  });

  // Supplier (NCC)
  const supplierList = useMemo(() => {
    return partners.filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH');
  }, [partners]);

  const [selectedPartnerId, setSelectedPartnerId] = useState<string>(() => supplierList[0]?.id || '');
  const [customSupplierName, setCustomSupplierName] = useState('FPT Synnex Distro');
  const [isQuickAddSupplierOpen, setIsQuickAddSupplierOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierAddress, setNewSupplierAddress] = useState('');

  // Payment / Cash flow options
  const [paymentOption, setPaymentOption] = useState<'fund_payment' | 'supplier_debt' | 'none'>('supplier_debt');
  const [selectedFundId, setSelectedFundId] = useState<string>(() => funds[0]?.id || '');

  // Local Uploaded Images (Base64)
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selected warehouse object
  const selectedWarehouseObj = useMemo(() => {
    return activeWarehouses.find(w => w.id === selectedWarehouseId) || activeWarehouses[0];
  }, [activeWarehouses, selectedWarehouseId]);

  // Selected partner object
  const selectedPartnerObj = useMemo(() => {
    return partners.find(p => p.id === selectedPartnerId);
  }, [partners, selectedPartnerId]);

  // Parse batch IMEIs
  const parsedImeis = useMemo(() => {
    if (!batchRawImeis.trim()) return [];
    const tokens = batchRawImeis
      .split(/[\n,;\t\s]+/)
      .map(t => t.trim())
      .filter(t => t.length > 0);
    return Array.from(new Set(tokens));
  }, [batchRawImeis]);

  // Check duplicate IMEIs against current inventory
  const duplicateImeisWithStock = useMemo(() => {
    const existingImeiSet = new Set(existingDevices.map(d => d.imei.toLowerCase().trim()));
    if (importMode === 'single') {
      return singleImei && existingImeiSet.has(singleImei.toLowerCase().trim()) ? [singleImei] : [];
    }
    return parsedImeis.filter(imei => existingImeiSet.has(imei.toLowerCase().trim()));
  }, [importMode, singleImei, parsedImeis, existingDevices]);

  // Calculate batch totals
  const totalQuantity = importMode === 'single' ? (singleImei.trim() ? 1 : 0) : parsedImeis.length;
  const totalCost = totalQuantity * buyPrice;
  const totalListedValue = totalQuantity * sellPrice;
  const totalExpectedProfit = totalListedValue - totalCost;

  // Handle image files selection
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingImage(true);
    try {
      const newBase64List: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          const compressed = await compressImageFile(file, 500, 0.5);
          newBase64List.push(compressed);
        }
      }
      setUploadedImages(prev => [...prev, ...newBase64List]);
    } catch (err) {
      console.error('Error compressing image:', err);
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setUploadedImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Generate Sample IMEIs
  const handleGenerateSampleImeis = (count: number) => {
    const generated: string[] = [];
    for (let i = 0; i < count; i++) {
      const randomImei = '35' + Math.floor(1000000000000 + Math.random() * 9000000000000).toString();
      generated.push(randomImei);
    }
    if (importMode === 'single') {
      setSingleImei(generated[0]);
      setSingleSerial('F' + Math.random().toString(36).substring(2, 10).toUpperCase());
    } else {
      setBatchRawImeis(prev => {
        const current = prev.trim();
        return current ? `${current}\n${generated.join('\n')}` : generated.join('\n');
      });
    }
  };

  // Quick add partner
  const handleSaveQuickSupplier = () => {
    if (!newSupplierName.trim()) {
      alert('Vui lòng nhập tên Nhà cung cấp!');
      return;
    }
    const newPartner: Partner = {
      id: `PARTNER-${Date.now().toString().slice(-4)}`,
      type: 'SUPPLIER',
      name: newSupplierName.trim(),
      phone: newSupplierPhone.trim() || '0988.000.111',
      address: newSupplierAddress.trim() || 'Hà Nội',
      outstandingDebt: 0,
      createdAt: new Date().toISOString().split('T')[0],
      notes: 'Thêm nhanh từ Form Nhập Hàng'
    };

    if (onAddPartner) {
      onAddPartner(newPartner);
    }
    setSelectedPartnerId(newPartner.id);
    setCustomSupplierName(newPartner.name);
    setIsQuickAddSupplierOpen(false);
    setNewSupplierName('');
    setNewSupplierPhone('');
    setNewSupplierAddress('');
  };

  // Submit Handler
  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const imeiListToCreate: string[] = [];
    if (importMode === 'single') {
      if (!singleImei.trim()) {
        alert('Vui lòng nhập số IMEI máy ở Bước 1!');
        setActiveStep(1);
        return;
      }
      imeiListToCreate.push(singleImei.trim());
    } else {
      if (parsedImeis.length === 0) {
        alert('Vui lòng nhập hoặc dán danh sách IMEI của lô hàng ở Bước 1!');
        setActiveStep(1);
        return;
      }
      imeiListToCreate.push(...parsedImeis);
    }

    if (duplicateImeisWithStock.length > 0) {
      const confirmProceed = confirm(
        `Cảnh báo: Có ${duplicateImeisWithStock.length} IMEI đã tồn tại trong kho (${duplicateImeisWithStock.slice(0, 3).join(', ')}...). Bạn có chắc muốn tiếp tục nhập?`
      );
      if (!confirmProceed) return;
    }

    const supplierDisplayName = selectedPartnerObj ? selectedPartnerObj.name : customSupplierName;
    const nowIsoDate = new Date().toISOString().split('T')[0];

    const newDevices: DeviceItem[] = imeiListToCreate.map((imeiStr, index) => {
      const uniqueSuffix = Date.now().toString().slice(-4) + index.toString().padStart(2, '0');
      const serialNumber = importMode === 'single' && singleSerial.trim()
        ? singleSerial.trim()
        : `SN-${model.replace(/\s+/g, '').slice(0, 4)}-${uniqueSuffix}`;

      return {
        id: `DEV-${uniqueSuffix}`,
        imei: imeiStr,
        serialNo: serialNumber,
        model,
        storage,
        color,
        region,
        batteryHealth: Number(batteryHealth) || 100,
        condition,
        buyPrice: Number(buyPrice) || 0,
        sellPrice: Number(sellPrice) || 0,
        status: 'in_stock',
        warehouse: selectedWarehouseId,
        warehouseName: selectedWarehouseObj?.name || 'Kho Tổng Trung Tâm',
        branch: selectedBranchName,
        supplier: supplierDisplayName,
        supplierId: selectedPartnerObj?.id,
        receivedDate: nowIsoDate,
        warrantyPeriodMonths: 6, // Default value
        icloudStatus: 'Chưa Check', // Default value
        screenStatus: 'Zin Màn Keng', // Default value
        notes: notes.trim() || undefined,
        images: uploadedImages.length > 0 ? (importMode === 'single' ? uploadedImages.slice(0, 2) : (index === 0 ? uploadedImages.slice(0, 1) : undefined)) : undefined,
        imageUrl: uploadedImages.length > 0 ? uploadedImages[0] : undefined,
        batchCode: importMode === 'batch' ? batchCode : undefined
      };
    });

    // 1. Add Devices to Inventory
    if (onAddMultipleDevices) {
      onAddMultipleDevices(newDevices);
    } else {
      newDevices.forEach(d => onAddDevice(d));
    }

    // 2. Handle Financial Cash Flow / Debt
    if (paymentOption === 'fund_payment' && onAddCashTransaction && totalCost > 0) {
      const fundObj = funds.find(f => f.id === selectedFundId) || funds[0];
      const newTx: CashTransaction = {
        id: `TX-STOCKIN-${Date.now().toString().slice(-6)}`,
        code: `PC-NHAP-${Date.now().toString().slice(-6)}`,
        date: nowIsoDate,
        type: 'PAYMENT',
        category: 'INVENTORY_PURCHASE',
        categoryName: 'Chi Nhập Hàng iPhone/Máy',
        amount: totalCost,
        fundType: fundObj ? fundObj.type : 'BANK',
        fundName: fundObj ? fundObj.name : 'Quỹ Ngân Hàng VietQR',
        partnerId: selectedPartnerObj?.id,
        partnerName: supplierDisplayName,
        partnerType: 'SUPPLIER',
        partnerPhone: selectedPartnerObj?.phone || '',
        referenceCode: batchCode,
        creator: 'Thủ Kho',
        notes: `Thanh toán lô nhập ${newDevices.length} máy ${model} (${batchCode})`,
        status: 'COMPLETED'
      };
      onAddCashTransaction(newTx);
    } else if (paymentOption === 'supplier_debt' && selectedPartnerObj && onUpdatePartner && totalCost > 0) {
      // Ghi nợ Nhà cung cấp
      const newDebtTx = {
        id: `TX-DEBT-${Date.now().toString().slice(-6)}`,
        date: nowIsoDate,
        type: 'DEBT_INCREASE' as const,
        amount: totalCost,
        note: `Nhập lô ${newDevices.length} máy ${model} (${batchCode})`,
        referenceId: batchCode
      };

      onUpdatePartner({
        ...selectedPartnerObj,
        outstandingDebt: (selectedPartnerObj.outstandingDebt || 0) + totalCost,
        totalPurchasedFrom: (selectedPartnerObj.totalPurchasedFrom || 0) + totalCost,
        debtTransactions: [newDebtTx, ...(selectedPartnerObj.debtTransactions || [])]
      });
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-orange-200">
        
        {/* ========================================================================= */}
        {/* MODAL HEADER */}
        {/* ========================================================================= */}
        <div className="bg-gradient-to-r from-[#F94A1F] via-[#ff5d36] to-orange-600 px-5 py-3.5 flex justify-between items-center text-white shrink-0 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-xs border border-white/30">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-black tracking-tight">
                  Nhập Hàng Vào Kho ({importMode === 'batch' ? 'Theo Lô' : '1 Máy Lẻ'})
                </h3>
                <span className="bg-white/25 text-[11px] font-bold px-2 py-0.5 rounded-full font-mono">
                  {totalQuantity > 0 ? `${totalQuantity} máy` : 'Chưa có IMEI'}
                </span>
              </div>
              <p className="text-[11px] text-orange-100 font-medium">
                Nhập nhanh máy & IMEI ban đầu • Thông tin test máy chi tiết sẽ thực hiện ở bước chuyển kho kỹ thuật
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-orange-100 p-1.5 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* STEP PROGRESSION TABS (3 TẬP TRUNG - KHÔNG KÉO DÀI TRANG) */}
        {/* ========================================================================= */}
        <div className="bg-zinc-50 border-b border-zinc-200 px-4 sm:px-6 py-2.5 flex items-center justify-between shrink-0">
          
          {/* Step 1 Tab */}
          <button
            type="button"
            onClick={() => setActiveStep(1)}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeStep === 1
                ? 'bg-[#F94A1F] text-white shadow-xs'
                : totalQuantity > 0
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  : 'text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
              activeStep === 1 ? 'bg-white text-[#F94A1F]' : totalQuantity > 0 ? 'bg-emerald-600 text-white' : 'bg-zinc-300 text-zinc-700'
            }`}>
              {totalQuantity > 0 && activeStep !== 1 ? <Check className="w-3 h-3 stroke-[3]" /> : '1'}
            </span>
            <span>1. Máy & Danh Sách IMEI</span>
          </button>

          <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0 mx-1 hidden sm:block" />

          {/* Step 2 Tab */}
          <button
            type="button"
            onClick={() => setActiveStep(2)}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeStep === 2
                ? 'bg-[#F94A1F] text-white shadow-xs'
                : 'text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
              activeStep === 2 ? 'bg-white text-[#F94A1F]' : 'bg-zinc-300 text-zinc-700'
            }`}>
              2
            </span>
            <span>2. Kho & Dòng Tiền</span>
          </button>

          <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0 mx-1 hidden sm:block" />

          {/* Step 3 Tab */}
          <button
            type="button"
            onClick={() => setActiveStep(3)}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeStep === 3
                ? 'bg-[#F94A1F] text-white shadow-xs'
                : 'text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
              activeStep === 3 ? 'bg-white text-[#F94A1F]' : 'bg-zinc-300 text-zinc-700'
            }`}>
              3
            </span>
            <span>3. Ảnh & Xác Nhận</span>
          </button>

          {/* Mode Switcher */}
          <div className="hidden md:flex items-center space-x-1 bg-white p-0.5 rounded-xl border border-zinc-200">
            <button
              type="button"
              onClick={() => setImportMode('batch')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                importMode === 'batch' ? 'bg-orange-100 text-[#F94A1F]' : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              Lô IMEI
            </button>
            <button
              type="button"
              onClick={() => setImportMode('single')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                importMode === 'single' ? 'bg-orange-100 text-[#F94A1F]' : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              1 Máy
            </button>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* COMPACT TAB CONTENT CONTAINER (FIXED FIT - NO LONG SCROLL) */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar bg-white">

          {/* ----------------------------------------------------------------------- */}
          {/* TAB 1: MÁY & IMEI (DÒNG MÁY, CẤU HÌNH, GIÁ VÀ DANH SÁCH IMEI) */}
          {/* ----------------------------------------------------------------------- */}
          {activeStep === 1 && (
            <div className="space-y-4 animate-fadeIn">
              
              {/* Device Spec Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200">
                {/* Dòng máy */}
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">Dòng Máy (Model) *</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="iPhone 16 Pro Max">iPhone 16 Pro Max</option>
                    <option value="iPhone 16 Pro">iPhone 16 Pro</option>
                    <option value="iPhone 16 Plus">iPhone 16 Plus</option>
                    <option value="iPhone 16">iPhone 16</option>
                    <option value="iPhone 15 Pro Max">iPhone 15 Pro Max</option>
                    <option value="iPhone 15 Pro">iPhone 15 Pro</option>
                    <option value="iPhone 15 Plus">iPhone 15 Plus</option>
                    <option value="iPhone 15">iPhone 15</option>
                    <option value="iPhone 14 Pro Max">iPhone 14 Pro Max</option>
                    <option value="iPhone 14 Pro">iPhone 14 Pro</option>
                    <option value="iPhone 13 Pro Max">iPhone 13 Pro Max</option>
                    <option value="iPhone 13">iPhone 13</option>
                    <option value="iPhone 12 Pro Max">iPhone 12 Pro Max</option>
                    <option value="iPhone 11 Pro Max">iPhone 11 Pro Max</option>
                  </select>
                </div>

                {/* Dung lượng */}
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">Dung Lượng *</label>
                  <select
                    value={storage}
                    onChange={(e) => setStorage(e.target.value)}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="128GB">128GB</option>
                    <option value="256GB">256GB</option>
                    <option value="512GB">512GB</option>
                    <option value="1TB">1TB</option>
                  </select>
                </div>

                {/* Màu sắc */}
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">Màu Sắc</label>
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="VD: Titan Sa Mạc"
                    className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* Mã Xuất Xứ */}
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">Xuất Xứ (Region)</label>
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="VN/A (Chính hãng)">VN/A (Việt Nam)</option>
                    <option value="LL/A (Mỹ - eSIM)">LL/A (Mỹ - eSIM)</option>
                    <option value="ZA/A (2 SIM Vật Lý)">ZA/A (Hồng Kông)</option>
                    <option value="KH/A (Hàn Quốc)">KH/A (Hàn Quốc)</option>
                    <option value="J/A (Nhật Bản)">J/A (Nhật Bản)</option>
                  </select>
                </div>

                {/* Ngoại quan sơ bộ */}
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">Ngoại Quan Cơ Bản</label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as any)}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="New Seal">New Seal (Nguyên Hộp)</option>
                    <option value="Like New 99%">Like New 99%</option>
                    <option value="98% Cấn Nhẹ">98% Cấn Nhẹ</option>
                    <option value="95% Trầy Xước">95% Trầy Xước</option>
                  </select>
                </div>

                {/* Tình trạng Pin */}
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">Pin (%)</label>
                  <input
                    type="number"
                    min="50"
                    max="100"
                    value={batteryHealth}
                    onChange={(e) => setBatteryHealth(Number(e.target.value))}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* Giá Vốn Nhập */}
                <div>
                  <label className="block text-[11px] font-bold text-orange-600 mb-1">Giá Vốn Nhập (VNĐ) *</label>
                  <input
                    type="number"
                    step="100000"
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(Number(e.target.value))}
                    className="w-full bg-orange-50 border border-orange-300 rounded-xl px-2.5 py-1.5 text-xs font-black font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* Giá Bán Niêm Yết */}
                <div>
                  <label className="block text-[11px] font-bold text-emerald-600 mb-1">Giá Niêm Yết Bán (VNĐ)</label>
                  <input
                    type="number"
                    step="100000"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(Number(e.target.value))}
                    className="w-full bg-emerald-50 border border-emerald-300 rounded-xl px-2.5 py-1.5 text-xs font-black font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

              </div>

              {/* IMEI Input Section */}
              <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Smartphone className="w-4 h-4 text-[#F94A1F]" />
                    <span className="font-bold text-xs text-zinc-900">
                      {importMode === 'batch' ? 'Danh Sách Số IMEI Lô Hàng (Dán từ Excel, Zalo, Notepad)' : 'Số IMEI & Serial Máy Đơn'}
                    </span>
                  </div>

                  {/* Sample Generator */}
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[11px] font-medium text-zinc-500">Mẫu:</span>
                    <button
                      type="button"
                      onClick={() => handleGenerateSampleImeis(1)}
                      className="text-[10px] bg-white border border-zinc-300 hover:border-orange-500 text-zinc-700 font-bold px-2 py-0.5 rounded-md"
                    >
                      +1 IMEI
                    </button>
                    {importMode === 'batch' && (
                      <button
                        type="button"
                        onClick={() => handleGenerateSampleImeis(5)}
                        className="text-[10px] bg-orange-100 border border-orange-300 text-[#F94A1F] font-bold px-2 py-0.5 rounded-md"
                      >
                        +5 IMEI Lô
                      </button>
                    )}
                  </div>
                </div>

                {importMode === 'batch' ? (
                  <div className="space-y-2">
                    <textarea
                      rows={3}
                      value={batchRawImeis}
                      onChange={(e) => setBatchRawImeis(e.target.value)}
                      placeholder="Dán danh sách IMEI tại đây (Mỗi IMEI 1 dòng hoặc cách nhau bởi dấu phẩy, khoảng trắng)..."
                      className="w-full bg-white border border-zinc-300 rounded-xl p-2.5 text-xs font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />

                    {/* Duplicate Warning */}
                    {duplicateImeisWithStock.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 flex items-start space-x-2 text-xs text-amber-800">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span className="font-medium">
                          Trùng {duplicateImeisWithStock.length} IMEI với kho hiện tại: {duplicateImeisWithStock.join(', ')}
                        </span>
                      </div>
                    )}

                    {/* Preview chips */}
                    {parsedImeis.length > 0 && (
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1.5 bg-white rounded-xl border border-zinc-200 custom-scrollbar">
                        {parsedImeis.map((imei, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-orange-50 border border-orange-200 text-zinc-800 text-[11px] font-mono"
                          >
                            <span className="text-orange-600 font-bold">#{idx + 1}</span>
                            <span>{imei}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = parsedImeis.filter((_, i) => i !== idx);
                                setBatchRawImeis(updated.join('\n'));
                              }}
                              className="text-zinc-400 hover:text-red-500 ml-1 cursor-pointer font-bold"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-700 mb-1">Số IMEI (15 số) *</label>
                      <input
                        type="text"
                        value={singleImei}
                        onChange={(e) => setSingleImei(e.target.value)}
                        placeholder="35xxxxxxxxxxxxx"
                        className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-700 mb-1">Số Serial No (Tùy chọn)</label>
                      <input
                        type="text"
                        value={singleSerial}
                        onChange={(e) => setSingleSerial(e.target.value)}
                        placeholder="F17XXXXXXX"
                        className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ----------------------------------------------------------------------- */}
          {/* TAB 2: HỆ THỐNG, KHO & DÒNG TIỀN (TỔNG, PHONEHOUSE, XSTORE & KHO KTV CON) */}
          {/* ----------------------------------------------------------------------- */}
          {activeStep === 2 && (
            <div className="space-y-4 animate-fadeIn">
              
              {/* System Selector Banner */}
              <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 space-y-3">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-700">
                  1. Chọn Hệ Thống Sở Hữu Nhập Hàng
                </label>
                
                <div className="grid grid-cols-3 gap-3">
                  {/* TỔNG */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSystem('TONG');
                      const tongWh = activeWarehouses.find(w => w.systemType === 'TONG');
                      if (tongWh) setSelectedWarehouseId(tongWh.id);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      selectedSystem === 'TONG'
                        ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-400 shadow-xs'
                        : 'bg-white border-zinc-200 hover:border-purple-200'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                      <span className="font-black text-xs text-purple-900">Tổng Hệ Thống</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1">Tổng Kho & Các Kho Kỹ Thuật Viên Con</p>
                  </button>

                  {/* PHONEHOUSE */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSystem('PHONEHOUSE');
                      const phWh = activeWarehouses.find(w => w.systemType === 'PHONEHOUSE');
                      if (phWh) setSelectedWarehouseId(phWh.id);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      selectedSystem === 'PHONEHOUSE'
                        ? 'bg-orange-50 border-orange-400 ring-2 ring-orange-400 shadow-xs'
                        : 'bg-white border-zinc-200 hover:border-orange-200'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#F94A1F]" />
                      <span className="font-black text-xs text-orange-900">PhoneHouse</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1">Kho Cửa Hàng Bán Lẻ PhoneHouse</p>
                  </button>

                  {/* XSTORE */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSystem('XSTORE');
                      const xsWh = activeWarehouses.find(w => w.systemType === 'XSTORE');
                      if (xsWh) setSelectedWarehouseId(xsWh.id);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      selectedSystem === 'XSTORE'
                        ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-400 shadow-xs'
                        : 'bg-white border-zinc-200 hover:border-blue-200'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      <span className="font-black text-xs text-blue-900">Xstore</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1">Kho Hệ Thống Cửa Hàng Xstore</p>
                  </button>
                </div>
              </div>

              {/* Warehouse & Supplier Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Destination Warehouse */}
                <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 space-y-2">
                  <label className="block text-xs font-bold text-zinc-800 flex items-center space-x-1.5">
                    <Warehouse className="w-4 h-4 text-orange-500" />
                    <span>Kho Lưu Trữ Nhập Hàng *</span>
                  </label>

                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {systemWarehouses.map(w => (
                      <option key={w.id} value={w.id}>
                        📦 {w.name} ({w.code} {w.type === 'TECHNICIAN_SUB' ? `• KTV: ${w.technicianName || w.manager}` : ''})
                      </option>
                    ))}
                  </select>

                  {selectedWarehouseObj && (
                    <div className="text-[11px] text-zinc-500 bg-white p-2.5 rounded-xl border border-zinc-200 space-y-0.5">
                      <div className="font-semibold text-zinc-800">Quản lý: {selectedWarehouseObj.manager} ({selectedWarehouseObj.phone})</div>
                      <div>Địa chỉ: {selectedWarehouseObj.address}</div>
                      {selectedWarehouseObj.type === 'TECHNICIAN_SUB' && (
                        <div className="text-indigo-600 font-bold">🔧 Kho con Kỹ Thuật Viên: {selectedWarehouseObj.technicianName}</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Supplier (NCC) */}
                <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-zinc-800 flex items-center space-x-1.5">
                      <Building2 className="w-4 h-4 text-orange-500" />
                      <span>Nhà Cung Cấp (NCC) *</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => setIsQuickAddSupplierOpen(true)}
                      className="text-[11px] text-[#F94A1F] hover:underline font-bold flex items-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Thêm nhanh NCC</span>
                    </button>
                  </div>

                  <select
                    value={selectedPartnerId}
                    onChange={(e) => {
                      setSelectedPartnerId(e.target.value);
                      const partner = partners.find(p => p.id === e.target.value);
                      if (partner) setCustomSupplierName(partner.name);
                    }}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">-- Chọn Nhà Cung Cấp --</option>
                    {supplierList.map(p => (
                      <option key={p.id} value={p.id}>
                        🏢 {p.name} ({p.phone}) - Nợ hiện tại: {new Intl.NumberFormat('vi-VN').format(p.outstandingDebt || 0)}đ
                      </option>
                    ))}
                  </select>

                  {!selectedPartnerId && (
                    <input
                      type="text"
                      placeholder="Hoặc nhập tên NCC tự do (VD: FPT Synnex, Minh Tùng...)"
                      value={customSupplierName}
                      onChange={(e) => setCustomSupplierName(e.target.value)}
                      className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  )}
                </div>

              </div>

              {/* Payment & Cash Flow */}
              <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 space-y-3">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-700 flex items-center space-x-1.5">
                  <Coins className="w-4 h-4 text-emerald-600" />
                  <span>2. Hình Thức Thanh Toán Tiền Hàng</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  
                  {/* Option 1: Ghi nợ NCC */}
                  <button
                    type="button"
                    onClick={() => setPaymentOption('supplier_debt')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      paymentOption === 'supplier_debt'
                        ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400'
                        : 'bg-white border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <div className="font-bold text-xs text-amber-900">Ghi Nợ Nhà Cung Cấp</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">Tăng công nợ phải trả NCC</div>
                  </button>

                  {/* Option 2: Trừ Quỹ */}
                  <button
                    type="button"
                    onClick={() => setPaymentOption('fund_payment')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      paymentOption === 'fund_payment'
                        ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400'
                        : 'bg-white border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <div className="font-bold text-xs text-emerald-900">Trừ Quỹ / Ngân Hàng</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">Tạo phiếu chi tiền mặt / VietQR</div>
                  </button>

                  {/* Option 3: Chưa thanh toán */}
                  <button
                    type="button"
                    onClick={() => setPaymentOption('none')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      paymentOption === 'none'
                        ? 'bg-zinc-100 border-zinc-400 ring-2 ring-zinc-400'
                        : 'bg-white border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <div className="font-bold text-xs text-zinc-800">Chưa Thanh Toán</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">Ghi nhận tạm thời</div>
                  </button>

                </div>

                {paymentOption === 'fund_payment' && (
                  <div className="pt-2 border-t border-zinc-200">
                    <label className="block text-[11px] font-bold text-zinc-700 mb-1">Chọn Quỹ / Tài Khoản Chi Tiền:</label>
                    <select
                      value={selectedFundId}
                      onChange={(e) => setSelectedFundId(e.target.value)}
                      className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-1.5 text-xs font-bold text-zinc-900"
                    >
                      {funds.map(f => (
                        <option key={f.id} value={f.id}>
                          💳 {f.name} (Số dư: {new Intl.NumberFormat('vi-VN').format(f.balance)}đ)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ----------------------------------------------------------------------- */}
          {/* TAB 3: ẢNH NGOẠI QUAN & TỔNG KẾT XÁC NHẬN */}
          {/* ----------------------------------------------------------------------- */}
          {activeStep === 3 && (
            <div className="space-y-4 animate-fadeIn">
              
              {/* Image Upload Box */}
              <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ImageIcon className="w-4 h-4 text-orange-500" />
                    <span className="font-bold text-xs text-zinc-900">Ảnh Ngoại Quan Thực Tế (Tùy Chọn)</span>
                  </div>
                  <span className="text-[11px] text-zinc-500">Đã tải: {uploadedImages.length} ảnh</span>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageFileChange}
                    multiple
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="px-3.5 py-2 bg-white border border-dashed border-orange-400 hover:bg-orange-50 text-[#F94A1F] text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploadingImage ? 'Đang nén ảnh...' : 'Chọn Ảnh / Chụp Máy'}</span>
                  </button>

                  {uploadedImages.map((img, idx) => (
                    <div key={idx} className="relative group w-12 h-12 rounded-xl overflow-hidden border border-zinc-300">
                      <img src={img} alt="preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        className="absolute inset-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Final Summary Card */}
              <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 text-white p-5 rounded-2xl shadow-md space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-700 pb-3">
                  <div className="flex items-center space-x-2">
                    <Package className="w-5 h-5 text-orange-400" />
                    <span className="font-extrabold text-sm text-white">Tóm Tắt Lô Hàng Nhập Kho</span>
                  </div>
                  <span className="text-xs bg-orange-500/30 text-orange-300 border border-orange-500/40 px-2.5 py-0.5 rounded-full font-bold">
                    Hệ Thống: {selectedSystem === 'TONG' ? 'Tổng Kho Central' : selectedSystem === 'PHONEHOUSE' ? 'PhoneHouse' : 'Xstore'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-zinc-400 text-[11px] block">Sản Phẩm:</span>
                    <span className="font-bold text-white text-sm">{model} ({storage})</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 text-[11px] block">Số Lượng Máy:</span>
                    <span className="font-black text-orange-400 text-base font-mono">{totalQuantity} máy</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 text-[11px] block">Tổng Tiền Vốn Nhập:</span>
                    <span className="font-black text-amber-300 text-sm font-mono">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalCost)}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 text-[11px] block">Lợi Nhuận Dự Kiến:</span>
                    <span className="font-black text-emerald-400 text-sm font-mono">
                      +{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalExpectedProfit)}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-700 text-xs text-zinc-300 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    Kho đích: <strong className="text-white">{selectedWarehouseObj?.name}</strong>
                  </div>
                  <div>
                    Nhà cung cấp: <strong className="text-white">{selectedPartnerObj ? selectedPartnerObj.name : customSupplierName}</strong>
                  </div>
                </div>
              </div>

              {/* Notes Input */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-700 mb-1">Ghi Chú Nhập Hàng (Tùy Chọn):</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="VD: Hàng mới nguyên seal nhập từ NPP chính hãng đợt 1..."
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

            </div>
          )}

        </div>

        {/* ========================================================================= */}
        {/* MODAL BOTTOM ACTION FOOTER */}
        {/* ========================================================================= */}
        <div className="bg-zinc-50 border-t border-zinc-200 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0">
          
          {/* Back Button */}
          {activeStep > 1 ? (
            <button
              type="button"
              onClick={() => setActiveStep((prev) => (prev - 1) as 1 | 2)}
              className="px-4 py-2 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-bold rounded-xl border border-zinc-300 transition-all flex items-center space-x-1 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Quay Lại</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-zinc-100 text-zinc-600 text-xs font-bold rounded-xl border border-zinc-300 transition-all cursor-pointer"
            >
              Hủy Bỏ
            </button>
          )}

          {/* Forward / Submit Buttons */}
          <div className="flex items-center space-x-2">
            {activeStep === 1 && (
              <button
                type="button"
                onClick={() => {
                  if (totalQuantity === 0) {
                    alert('Vui lòng nhập số IMEI máy ở Bước 1!');
                    return;
                  }
                  setActiveStep(2);
                }}
                className="px-5 py-2 bg-[#F94A1F] hover:bg-[#e03d14] text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <span>Tiếp Tục: Chọn Kho & NCC</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {activeStep === 2 && (
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="px-5 py-2 bg-[#F94A1F] hover:bg-[#e03d14] text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <span>Tiếp Tục: Ảnh & Xác Nhận</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {activeStep === 3 && (
              <button
                type="button"
                onClick={() => handleSubmit()}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Hoàn Tất Nhập Kho ({totalQuantity} máy)</span>
              </button>
            )}
          </div>

        </div>

        {/* Quick Add Supplier Modal */}
        {isQuickAddSupplierOpen && (
          <div className="fixed inset-0 bg-black/50 z-60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3 shadow-xl border border-zinc-200">
              <h4 className="font-extrabold text-sm text-zinc-900 flex items-center space-x-1.5">
                <Building2 className="w-4 h-4 text-orange-500" />
                <span>Thêm Nhanh Nhà Cung Cấp</span>
              </h4>
              <div>
                <label className="block text-[11px] font-bold text-zinc-700 mb-1">Tên Nhà Cung Cấp *</label>
                <input
                  type="text"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  placeholder="VD: NPP Viettel Digital"
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-zinc-700 mb-1">Số Điện Thoại</label>
                <input
                  type="text"
                  value={newSupplierPhone}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                  placeholder="0988.xxx.xxx"
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsQuickAddSupplierOpen(false)}
                  className="px-3 py-1.5 bg-zinc-100 text-zinc-700 text-xs font-bold rounded-lg"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuickSupplier}
                  className="px-3.5 py-1.5 bg-[#F94A1F] text-white text-xs font-bold rounded-lg"
                >
                  Lưu NCC
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
