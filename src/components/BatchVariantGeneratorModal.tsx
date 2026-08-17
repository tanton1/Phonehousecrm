import React, { useState, useMemo } from 'react';
import { 
  X, Sparkles, CheckSquare, Square, Layers, Smartphone, 
  DollarSign, Check, AlertCircle, Plus, Trash2, Eye, Boxes,
  ShieldCheck, RefreshCw, CornerDownRight, Tag
} from 'lucide-react';
import { MasterCatalogItem, CatalogCategory, CatalogSubCategory } from '../types';

interface BatchVariantGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  subCategories: CatalogSubCategory[];
  onAddItems: (newItems: MasterCatalogItem[]) => void;
  onToast: (msg: string) => void;
}

const PRESET_MODELS = [
  { name: 'iPhone 17 Pro Max', subCode: 'IP17', storages: ['256GB', '512GB', '1TB', '2TB'], colors: ['Titan Đồng Sa Mạc', 'Titan Tự Nhiên', 'Titan Đen', 'Titan Bạc'], baseImport: 35500000, baseRetail: 38990000 },
  { name: 'iPhone 17 Pro', subCode: 'IP17', storages: ['256GB', '512GB', '1TB'], colors: ['Titan Đồng Sa Mạc', 'Titan Tự Nhiên', 'Titan Đen', 'Titan Bạc'], baseImport: 30500000, baseRetail: 33490000 },
  { name: 'iPhone 17 Air (Slim)', subCode: 'IP17', storages: ['256GB', '512GB'], colors: ['Bạc Ánh Kim', 'Titan Đen', 'Xanh Băng'], baseImport: 27500000, baseRetail: 29990000 },
  { name: 'iPhone 17', subCode: 'IP17', storages: ['128GB', '256GB', '512GB'], colors: ['Tím Oải Hương', 'Bạc Ánh Kim', 'Xanh Băng', 'Đen'], baseImport: 22000000, baseRetail: 24490000 },
  { name: 'iPhone 16 Pro Max', subCode: 'IP16', storages: ['256GB', '512GB', '1TB'], colors: ['Titan Sa Mạc', 'Titan Tự Nhiên', 'Titan Đen', 'Titan Trắng'], baseImport: 32500000, baseRetail: 34990000 },
  { name: 'iPhone 16 Pro', subCode: 'IP16', storages: ['128GB', '256GB', '512GB', '1TB'], colors: ['Titan Sa Mạc', 'Titan Tự Nhiên', 'Titan Đen', 'Titan Trắng'], baseImport: 26500000, baseRetail: 28990000 },
  { name: 'iPhone 16 Plus', subCode: 'IP16', storages: ['128GB', '256GB', '512GB'], colors: ['Xanh Lưu Ly', 'Xanh Mòng Két', 'Hồng', 'Trắng', 'Đen'], baseImport: 23500000, baseRetail: 25990000 },
  { name: 'iPhone 16', subCode: 'IP16', storages: ['128GB', '256GB', '512GB'], colors: ['Xanh Lưu Ly', 'Xanh Mòng Két', 'Hồng', 'Trắng', 'Đen'], baseImport: 20500000, baseRetail: 22490000 },
  { name: 'iPhone 15 Pro Max', subCode: 'IP15', storages: ['256GB', '512GB', '1TB'], colors: ['Titan Tự Nhiên', 'Titan Xanh', 'Titan Trắng', 'Titan Đen'], baseImport: 22800000, baseRetail: 25490000 },
  { name: 'iPhone 15 Pro', subCode: 'IP15', storages: ['128GB', '256GB', '512GB', '1TB'], colors: ['Titan Tự Nhiên', 'Titan Xanh', 'Titan Trắng', 'Titan Đen'], baseImport: 18500000, baseRetail: 20990000 },
  { name: 'iPhone 15 Plus', subCode: 'IP15', storages: ['128GB', '256GB', '512GB'], colors: ['Hồng Pastel', 'Xanh Mint', 'Vàng', 'Xanh Dương', 'Đen'], baseImport: 16500000, baseRetail: 18790000 },
  { name: 'iPhone 15', subCode: 'IP15', storages: ['128GB', '256GB', '512GB'], colors: ['Hồng Pastel', 'Xanh Mint', 'Vàng', 'Xanh Dương', 'Đen'], baseImport: 14500000, baseRetail: 16490000 },
  { name: 'iPhone 14 Pro Max', subCode: 'IP14', storages: ['128GB', '256GB', '512GB', '1TB'], colors: ['Tím Deep Purple', 'Vàng Gold', 'Bạc Silver', 'Đen Space Black'], baseImport: 18200000, baseRetail: 20490000 },
  { name: 'iPhone 14 Pro', subCode: 'IP14', storages: ['128GB', '256GB', '512GB'], colors: ['Tím Deep Purple', 'Vàng Gold', 'Bạc Silver', 'Đen Space Black'], baseImport: 15200000, baseRetail: 17290000 },
  { name: 'iPhone 14 Plus', subCode: 'IP14', storages: ['128GB', '256GB', '512GB'], colors: ['Xanh Dương', 'Tím', 'Vàng', 'Ánh Sao Starlight', 'Đen Midnight'], baseImport: 13500000, baseRetail: 15390000 },
  { name: 'iPhone 14', subCode: 'IP14', storages: ['128GB', '256GB', '512GB'], colors: ['Xanh Dương', 'Tím', 'Vàng', 'Ánh Sao Starlight', 'Đen Midnight'], baseImport: 12200000, baseRetail: 13990000 },
  { name: 'iPhone 13 Pro Max', subCode: 'IP13', storages: ['128GB', '256GB', '512GB', '1TB'], colors: ['Xanh Sierra Blue', 'Xanh Alpine Green', 'Vàng Gold', 'Bạc Silver', 'Xám Graphite'], baseImport: 14500000, baseRetail: 16490000 },
  { name: 'iPhone 13 Pro', subCode: 'IP13', storages: ['128GB', '256GB', '512GB'], colors: ['Xanh Sierra Blue', 'Xanh Alpine Green', 'Vàng Gold', 'Bạc Silver', 'Xám Graphite'], baseImport: 12500000, baseRetail: 14290000 },
  { name: 'iPhone 13', subCode: 'IP13', storages: ['128GB', '256GB', '512GB'], colors: ['Hồng Pink', 'Xanh Green', 'Ánh Sao', 'Midnight', 'Xanh Blue', 'Đỏ'], baseImport: 10500000, baseRetail: 12290000 },
  { name: 'iPhone 13 Mini', subCode: 'IP13', storages: ['128GB', '256GB', '512GB'], colors: ['Hồng Pink', 'Xanh Green', 'Ánh Sao', 'Midnight', 'Xanh Blue'], baseImport: 8500000, baseRetail: 9990000 },
  { name: 'iPhone 12 Pro Max', subCode: 'IP12', storages: ['128GB', '256GB', '512GB'], colors: ['Xanh Pacific Blue', 'Vàng Gold', 'Than Chì Graphite', 'Bạc Silver'], baseImport: 11200000, baseRetail: 12990000 },
  { name: 'iPhone 12 Pro', subCode: 'IP12', storages: ['128GB', '256GB', '512GB'], colors: ['Xanh Pacific Blue', 'Vàng Gold', 'Than Chì Graphite', 'Bạc Silver'], baseImport: 9200000, baseRetail: 10790000 },
  { name: 'iPhone 12', subCode: 'IP12', storages: ['64GB', '128GB', '256GB'], colors: ['Tím Purple', 'Xanh Dương Blue', 'Trắng White', 'Đen Black', 'Xanh Mint'], baseImport: 7200000, baseRetail: 8490000 },
  { name: 'iPhone 12 Mini', subCode: 'IP12', storages: ['64GB', '128GB', '256GB'], colors: ['Tím Purple', 'Xanh Dương Blue', 'Trắng White', 'Đen Black'], baseImport: 5800000, baseRetail: 6990000 },
  { name: 'iPhone 11 Pro Max', subCode: 'IP11', storages: ['64GB', '256GB', '512GB'], colors: ['Xanh Midnight Green', 'Vàng Gold', 'Bạc Silver', 'Xám Space Gray'], baseImport: 8300000, baseRetail: 9790000 },
  { name: 'iPhone 11 Pro', subCode: 'IP11', storages: ['64GB', '256GB', '512GB'], colors: ['Xanh Midnight Green', 'Vàng Gold', 'Bạc Silver', 'Xám Space Gray'], baseImport: 6800000, baseRetail: 7990000 },
  { name: 'iPhone 11', subCode: 'IP11', storages: ['64GB', '128GB', '256GB'], colors: ['Tím Purple', 'Xanh Mint', 'Trắng White', 'Đen Black', 'Vàng', 'Đỏ'], baseImport: 5300000, baseRetail: 6290000 },
  { name: 'iPhone XS Max', subCode: 'IP8PX', storages: ['64GB', '256GB', '512GB'], colors: ['Vàng Gold', 'Bạc Silver', 'Xám Space Gray'], baseImport: 5200000, baseRetail: 6190000 },
  { name: 'iPhone XS', subCode: 'IP8PX', storages: ['64GB', '256GB', '512GB'], colors: ['Vàng Gold', 'Bạc Silver', 'Xám Space Gray'], baseImport: 4200000, baseRetail: 4990000 },
  { name: 'iPhone XR', subCode: 'IP8PX', storages: ['64GB', '128GB', '256GB'], colors: ['Đỏ Product RED', 'Đen Black', 'Trắng White', 'Vàng', 'Xanh Dương'], baseImport: 3900000, baseRetail: 4690000 },
  { name: 'iPhone X', subCode: 'IP8PX', storages: ['64GB', '256GB'], colors: ['Bạc Silver', 'Xám Space Gray'], baseImport: 3400000, baseRetail: 4190000 },
  { name: 'iPhone 8 Plus', subCode: 'IP8PX', storages: ['64GB', '128GB', '256GB'], colors: ['Vàng Gold', 'Đỏ Product RED', 'Xám Space Gray', 'Bạc Silver'], baseImport: 2800000, baseRetail: 3490000 },
  { name: 'iPad Pro M4 11 inch', subCode: 'IPAD', storages: ['256GB', '512GB', '1TB'], colors: ['Bạc Silver', 'Đen Space Black'], baseImport: 24500000, baseRetail: 27990000 },
  { name: 'iPad Air 6 M2', subCode: 'IPAD', storages: ['128GB', '256GB'], colors: ['Xanh Dương', 'Tím', 'Vàng Ánh Kim', 'Xám Không Gian'], baseImport: 15500000, baseRetail: 16990000 }
];

const DEFAULT_COLOR_PALETTE = [
  'Titan Sa Mạc', 'Titan Tự Nhiên', 'Titan Đen', 'Titan Trắng', 'Titan Xanh', 'Titan Đồng Sa Mạc',
  'Hồng Pastel', 'Xanh Mint', 'Xanh Lưu Ly', 'Xanh Mòng Két', 'Xanh Dương', 'Xanh Sierra Blue',
  'Tím Deep Purple', 'Tím Oải Hương', 'Vàng Gold', 'Bạc Silver', 'Đen Midnight', 'Trắng Starlight', 'Đỏ Product RED'
];

const DEFAULT_STORAGE_OPTIONS = ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB'];

export const BatchVariantGeneratorModal: React.FC<BatchVariantGeneratorModalProps> = ({
  isOpen,
  onClose,
  subCategories,
  onAddItems,
  onToast
}) => {
  const [model, setModel] = useState('iPhone 16 Pro Max');
  const [parentCategory, setParentCategory] = useState<CatalogCategory>('DEVICE');
  const [subCategoryId, setSubCategoryId] = useState<string>(() => {
    const sub = subCategories.find(s => s.code === 'IP16') || subCategories.find(s => s.parentCategory === 'DEVICE');
    return sub ? sub.id : '';
  });

  const [selectedStorages, setSelectedStorages] = useState<string[]>(['256GB', '512GB', '1TB']);
  const [selectedColors, setSelectedColors] = useState<string[]>([
    'Titan Sa Mạc', 'Titan Tự Nhiên', 'Titan Đen', 'Titan Trắng'
  ]);

  const [customStorage, setCustomStorage] = useState('');
  const [customColor, setCustomColor] = useState('');

  const [condition, setCondition] = useState('New Seal');
  const [region, setRegion] = useState('VN/A (Chính hãng)');
  const [brand, setBrand] = useState('Apple');
  const [unit, setUnit] = useState('Chiếc');

  const [baseImportPrice, setBaseImportPrice] = useState(32500000);
  const [baseRetailPrice, setBaseRetailPrice] = useState(34990000);
  const [storageStepPrice, setStorageStepPrice] = useState(3000000); // Giá tăng theo từng bậc dung lượng

  // Excluded keys
  const [deselectedKeys, setDeselectedKeys] = useState<Set<string>>(new Set());

  // Apply preset
  const handleApplyPreset = (preset: typeof PRESET_MODELS[0]) => {
    setModel(preset.name);
    setParentCategory('DEVICE');
    const matchedSub = subCategories.find(s => s.code === preset.subCode) || 
                       subCategories.find(s => s.name.includes(preset.name.split(' ')[1])) ||
                       subCategories.find(s => s.parentCategory === 'DEVICE');
    if (matchedSub) {
      setSubCategoryId(matchedSub.id);
    }
    setSelectedStorages(preset.storages);
    setSelectedColors(preset.colors);
    setBaseImportPrice(preset.baseImport);
    setBaseRetailPrice(preset.baseRetail);
    setDeselectedKeys(new Set());
    onToast(`Đã nạp cấu hình mẫu: ${preset.name}`);
  };

  // Add custom storage
  const handleAddCustomStorage = (e: React.FormEvent) => {
    e.preventDefault();
    if (customStorage.trim() && !selectedStorages.includes(customStorage.trim())) {
      setSelectedStorages(prev => [...prev, customStorage.trim()]);
      setCustomStorage('');
    }
  };

  // Add custom color
  const handleAddCustomColor = (e: React.FormEvent) => {
    e.preventDefault();
    if (customColor.trim() && !selectedColors.includes(customColor.trim())) {
      setSelectedColors(prev => [...prev, customColor.trim()]);
      setCustomColor('');
    }
  };

  // Generate Matrix items list for preview
  const matrixItems = useMemo(() => {
    const subObj = subCategories.find(s => s.id === subCategoryId);
    const subPrefix = subObj?.code || 'DEV';
    const cleanModel = (model || 'IPHONE').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
    const regionClean = region.includes('VN/A') ? 'VNA' : region.includes('LL/A') ? 'LLA' : 'GEN';

    const list: Array<{
      key: string;
      sku: string;
      name: string;
      storage: string;
      color: string;
      importPrice: number;
      retailPrice: number;
      profit: number;
      marginPct: number;
      barcode: string;
    }> = [];

    selectedStorages.forEach((st, sIdx) => {
      // Step pricing calculation
      const stepCost = sIdx * storageStepPrice;
      const calcImport = baseImportPrice + stepCost;
      const calcRetail = baseRetailPrice + stepCost;
      const profit = calcRetail - calcImport;
      const marginPct = calcRetail > 0 ? Math.round((profit / calcRetail) * 100) : 0;

      selectedColors.forEach((col, cIdx) => {
        const colorCode = col.slice(0, 3).toUpperCase();
        const rand = 100 + (sIdx * 10) + cIdx;
        const key = `${st}_${col}`;
        const sku = `${subPrefix}-${cleanModel}-${st}-${colorCode}-${regionClean}`;
        const name = `${model} ${st} Màu ${col} (${condition}) [${region.split(' ')[0]}]`;
        const barcode = `893${Date.now().toString().slice(-6)}${sIdx}${cIdx}`;

        list.push({
          key,
          sku,
          name,
          storage: st,
          color: col,
          importPrice: calcImport,
          retailPrice: calcRetail,
          profit,
          marginPct,
          barcode
        });
      });
    });

    return list;
  }, [model, subCategoryId, subCategories, selectedStorages, selectedColors, baseImportPrice, baseRetailPrice, storageStepPrice, condition, region]);

  const activeItemsToGenerate = useMemo(() => {
    return matrixItems.filter(item => !deselectedKeys.has(item.key));
  }, [matrixItems, deselectedKeys]);

  const toggleItemSelection = (key: string) => {
    setDeselectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (deselectedKeys.size > 0) {
      setDeselectedKeys(new Set());
    } else {
      setDeselectedKeys(new Set(matrixItems.map(m => m.key)));
    }
  };

  // Submit and create all SKUs
  const handleGenerateConfirm = () => {
    if (activeItemsToGenerate.length === 0) {
      alert('Vui lòng chọn ít nhất 1 biến thể SKU để sinh!');
      return;
    }

    const subObj = subCategories.find(s => s.id === subCategoryId);

    const generatedItems: MasterCatalogItem[] = activeItemsToGenerate.map((item, idx) => {
      return {
        id: `CAT_${Date.now()}_${idx}`,
        sku: item.sku,
        name: item.name,
        category: parentCategory,
        parentCategoryId: parentCategory,
        subCategory: subObj ? subObj.name : 'Thiết bị Apple',
        subCategoryId: subCategoryId,
        brand: brand || 'Apple',
        unit: unit || 'Chiếc',
        barcode: item.barcode,
        model: model,
        storage: item.storage,
        color: item.color,
        condition: condition,
        region: region,
        defaultImportPrice: item.importPrice,
        defaultRetailPrice: item.retailPrice,
        wholesalePrice: Math.round(item.importPrice * 1.04),
        minStockLevel: 5,
        maxStockLevel: 30,
        warrantyPeriodMonths: 12,
        vatRate: 10,
        status: 'active'
      };
    });

    onAddItems(generatedItems);
    onToast(`⚡ Đã tự động sinh và lưu thành công ${generatedItems.length} mã SKU biến thể!`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white w-full h-full sm:h-[95vh] sm:max-w-6xl sm:rounded-3xl shadow-2xl border border-orange-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#F94A1F] via-orange-500 to-amber-500 p-4 sm:p-5 text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white text-orange-600 rounded-2xl shadow-sm">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base sm:text-lg font-black uppercase tracking-tight">
                  Sinh Biến Thể Hàng Loạt (Matrix SKU Generator)
                </h3>
                <span className="px-2 py-0.5 bg-white/20 text-white text-[10px] font-black rounded-md">
                  1-Click Auto SKU
                </span>
              </div>
              <p className="text-xs text-orange-100 mt-0.5">
                Chọn dòng máy, các dung lượng & màu sắc. Hệ thống tự động nhân ma trận và tạo hàng chục mã SKU chuẩn.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: Left form, Right matrix preview */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-zinc-50/50">
          {/* Quick Presets Row */}
          <div className="bg-white p-3.5 rounded-2xl border border-orange-100 shadow-2xs mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black uppercase text-zinc-700 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-orange-500" /> Chọn Nhanh Dòng Máy Phổ Biến:
              </span>
              <span className="text-[11px] text-zinc-400 font-medium hidden sm:inline">
                (Tự động điền danh mục, dung lượng, màu & giá chuẩn)
              </span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {PRESET_MODELS.map(preset => {
                const isActive = model === preset.name;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer ${
                      isActive 
                        ? 'bg-orange-600 text-white shadow-xs' 
                        : 'bg-orange-50/80 text-orange-950 hover:bg-orange-100 border border-orange-200/70'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* LEFT CONFIG COLUMN (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              {/* Base Model & Subcategory */}
              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs space-y-3">
                <div className="text-xs font-black text-zinc-800 uppercase flex items-center gap-1.5 border-b border-zinc-100 pb-2">
                  <Layers className="w-4 h-4 text-orange-500" />
                  <span>1. Thông Tin Dòng Máy Cơ Sở</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Tên Model Máy: <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Ví dụ: iPhone 16 Pro Max..."
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-orange-500 rounded-xl text-xs font-bold"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Danh mục Cha:</label>
                    <select
                      value={parentCategory}
                      onChange={(e) => {
                        const newP = e.target.value as CatalogCategory;
                        setParentCategory(newP);
                        const firstSub = subCategories.find(s => s.parentCategory === newP);
                        if (firstSub) setSubCategoryId(firstSub.id);
                      }}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold"
                    >
                      <option value="DEVICE">📱 Thiết Bị (Máy)</option>
                      <option value="PART">🔧 Linh Kiện</option>
                      <option value="ACCESSORY">🎧 Phụ Kiện</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Danh mục Con:</label>
                    <select
                      value={subCategoryId}
                      onChange={(e) => setSubCategoryId(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-orange-800"
                    >
                      {subCategories.filter(s => s.parentCategory === parentCategory).map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Tình trạng:</label>
                    <select
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-emerald-700"
                    >
                      <option value="New Seal">New Seal (Chưa Active)</option>
                      <option value="Like New 99%">Like New 99% Keng</option>
                      <option value="98% Cấn Nhẹ">98% Cấn Nhẹ</option>
                      <option value="95% Trầy Xước">95% Trầy Xước</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Mã thị trường:</label>
                    <select
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold font-mono"
                    >
                      <option value="VN/A (Chính hãng)">VN/A (Chính hãng)</option>
                      <option value="LL/A (Quốc Tế Mỹ)">LL/A (Quốc Tế Mỹ)</option>
                      <option value="ZA/A (2 SIM Vật Lý)">ZA/A (2 SIM Vật Lý)</option>
                      <option value="J/A (Nhật Bản)">J/A (Nhật Bản)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Storage Selection & Pricing Offsets */}
              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs space-y-3">
                <div className="text-xs font-black text-zinc-800 uppercase flex items-center justify-between border-b border-zinc-100 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Boxes className="w-4 h-4 text-orange-500" />
                    <span>2. Chọn Các Dung Lượng Bộ Nhớ</span>
                  </div>
                  <span className="text-[10px] text-orange-600 font-bold">
                    Đã chọn: {selectedStorages.length}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_STORAGE_OPTIONS.map(st => {
                    const isChecked = selectedStorages.includes(st);
                    return (
                      <button
                        type="button"
                        key={st}
                        onClick={() => {
                          if (isChecked) {
                            setSelectedStorages(prev => prev.filter(x => x !== st));
                          } else {
                            setSelectedStorages(prev => [...prev, st]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          isChecked 
                            ? 'bg-orange-600 text-white shadow-xs font-extrabold' 
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                        }`}
                      >
                        {isChecked ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 text-zinc-400" />}
                        <span>{st}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Storage Input */}
                <div className="flex gap-1.5 pt-1">
                  <input
                    type="text"
                    placeholder="Dung lượng khác (ví dụ: 64GB)..."
                    value={customStorage}
                    onChange={(e) => setCustomStorage(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomStorage}
                    className="px-3 py-1.5 bg-zinc-800 text-white text-xs font-bold rounded-xl hover:bg-black cursor-pointer"
                  >
                    + Thêm
                  </button>
                </div>
              </div>

              {/* Colors Selection */}
              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs space-y-3">
                <div className="text-xs font-black text-zinc-800 uppercase flex items-center justify-between border-b border-zinc-100 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-orange-500" />
                    <span>3. Chọn Các Màu Sắc</span>
                  </div>
                  <span className="text-[10px] text-orange-600 font-bold">
                    Đã chọn: {selectedColors.length}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {DEFAULT_COLOR_PALETTE.map(col => {
                    const isChecked = selectedColors.includes(col);
                    return (
                      <button
                        type="button"
                        key={col}
                        onClick={() => {
                          if (isChecked) {
                            setSelectedColors(prev => prev.filter(x => x !== col));
                          } else {
                            setSelectedColors(prev => [...prev, col]);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                          isChecked 
                            ? 'bg-zinc-900 text-white shadow-xs font-bold' 
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${
                          col.includes('Sa Mạc') ? 'bg-amber-400' :
                          col.includes('Tự Nhiên') ? 'bg-stone-300' :
                          col.includes('Đen') ? 'bg-zinc-800' :
                          col.includes('Trắng') ? 'bg-zinc-200' :
                          col.includes('Hồng') ? 'bg-pink-300' :
                          col.includes('Xanh') ? 'bg-sky-400' :
                          col.includes('Tím') ? 'bg-purple-400' :
                          col.includes('Vàng') ? 'bg-yellow-400' : 'bg-orange-400'
                        }`} />
                        <span>{col}</span>
                        {isChecked && <Check className="w-3 h-3 text-orange-400" />}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Color Input */}
                <div className="flex gap-1.5 pt-1">
                  <input
                    type="text"
                    placeholder="Màu sắc khác (ví dụ: Xám Không Gian)..."
                    value={customColor}
                    onChange={(e) => setCustomColor(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomColor}
                    className="px-3 py-1.5 bg-zinc-800 text-white text-xs font-bold rounded-xl hover:bg-black cursor-pointer"
                  >
                    + Thêm
                  </button>
                </div>
              </div>

              {/* Pricing Base */}
              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs space-y-3">
                <div className="text-xs font-black text-zinc-800 uppercase flex items-center gap-1.5 border-b border-zinc-100 pb-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>4. Định Mức Giá Cơ Sở & Bậc Dung Lượng</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-600 mb-1">
                      Giá vốn cơ sở (bản thấp nhất):
                    </label>
                    <input
                      type="number"
                      value={baseImportPrice}
                      onChange={(e) => setBaseImportPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-orange-700 mb-1">
                      Giá bán lẻ cơ sở:
                    </label>
                    <input
                      type="number"
                      value={baseRetailPrice}
                      onChange={(e) => setBaseRetailPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-orange-50 border border-orange-300 rounded-xl text-xs font-black text-orange-600 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-600 mb-1">
                    Giá tăng thêm mỗi bậc dung lượng (Step Price):
                  </label>
                  <input
                    type="number"
                    value={storageStepPrice}
                    onChange={(e) => setStorageStepPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold font-mono text-zinc-700"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">
                    Ví dụ: 256GB = Cơ sở | 512GB = Cơ sở + 3 triệu | 1TB = Cơ sở + 6 triệu
                  </p>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: LIVE MATRIX TABLE PREVIEW (7 cols) */}
            <div className="lg:col-span-7 space-y-3">
              <div className="bg-white p-4 rounded-2xl border border-orange-100 shadow-2xs flex flex-col h-full">
                {/* Table Header Summary */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-zinc-100 pb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <Eye className="w-4 h-4 text-orange-600" />
                      <h4 className="text-xs font-black uppercase text-zinc-900">
                        Bảng Xem Trước Ma Trận Biến Thể ({activeItemsToGenerate.length} / {matrixItems.length} SKU)
                      </h4>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Đã sinh ma trận: {selectedStorages.length} Dung lượng × {selectedColors.length} Màu sắc
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={toggleAll}
                    className="px-2.5 py-1 text-xs font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer"
                  >
                    {deselectedKeys.size > 0 ? 'Chọn tất cả' : 'Bỏ chọn tất cả'}
                  </button>
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-x-auto mt-2 max-h-[500px] divide-y divide-zinc-100">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-zinc-100/90 backdrop-blur-xs text-[10px] uppercase font-black text-zinc-600 z-10">
                      <tr>
                        <th className="p-2 text-center w-8">#</th>
                        <th className="p-2">Mã SKU</th>
                        <th className="p-2">Dung Lượng / Màu</th>
                        <th className="p-2 text-right">Giá Vốn</th>
                        <th className="p-2 text-right">Giá Bán Lẻ</th>
                        <th className="p-2 text-center">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {matrixItems.map((item, idx) => {
                        const isSelected = !deselectedKeys.has(item.key);
                        return (
                          <tr 
                            key={item.key} 
                            onClick={() => toggleItemSelection(item.key)}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? 'hover:bg-orange-50/50' : 'opacity-40 bg-zinc-50 line-through'
                            }`}
                          >
                            <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <button 
                                type="button"
                                onClick={() => toggleItemSelection(item.key)}
                                className="cursor-pointer"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-orange-600" />
                                ) : (
                                  <Square className="w-4 h-4 text-zinc-400" />
                                )}
                              </button>
                            </td>
                            <td className="p-2 font-mono font-bold text-zinc-900">
                              <span className="bg-zinc-100 px-1.5 py-0.5 rounded text-[11px]">
                                {item.sku}
                              </span>
                            </td>
                            <td className="p-2">
                              <div className="font-bold text-zinc-800">{item.storage}</div>
                              <div className="text-[11px] text-zinc-500">{item.color}</div>
                            </td>
                            <td className="p-2 text-right font-mono text-zinc-600 font-bold">
                              {item.importPrice.toLocaleString('vi-VN')} đ
                            </td>
                            <td className="p-2 text-right font-mono text-orange-600 font-black">
                              {item.retailPrice.toLocaleString('vi-VN')} đ
                            </td>
                            <td className="p-2 text-center font-bold">
                              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] rounded">
                                +{item.marginPct}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}

                      {matrixItems.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-zinc-400">
                            Vui lòng chọn ít nhất 1 dung lượng và 1 màu sắc ở cột bên trái
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Bottom preview summary */}
                <div className="mt-3 pt-3 border-t border-zinc-100 bg-orange-50/60 p-3 rounded-xl flex items-center justify-between">
                  <div className="text-xs">
                    <span className="text-zinc-500 font-medium">Tổng số mã SKU sẽ được thêm: </span>
                    <strong className="text-orange-600 font-black text-sm">{activeItemsToGenerate.length} SKU</strong>
                  </div>
                  <div className="text-xs text-zinc-500 font-mono">
                    Model: <strong className="text-zinc-900">{model}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-white border-t border-zinc-200 p-3.5 sm:p-4 px-6 flex items-center justify-between shrink-0 shadow-lg">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Hủy Bỏ
          </button>

          <button
            type="button"
            onClick={handleGenerateConfirm}
            disabled={activeItemsToGenerate.length === 0}
            className="px-6 py-2.5 bg-gradient-to-r from-[#F94A1F] to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-orange-500/20 active:scale-95 transition-all cursor-pointer flex items-center space-x-2 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>⚡ Sinh & Thêm {activeItemsToGenerate.length} Mã SKU Vào Danh Mục</span>
          </button>
        </div>
      </div>
    </div>
  );
};
