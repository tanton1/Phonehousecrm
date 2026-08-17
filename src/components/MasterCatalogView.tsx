import { DeviceImageThumbnail } from "./DeviceImageThumbnail";
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, Plus, Package, Smartphone, Wrench, Headphones,
  Edit2, Trash2, Tag, ChevronDown, Check, X, Building2, AlignLeft,
  Copy, Sparkles, Filter, ArrowUpDown, ShieldCheck, AlertCircle,
  Database, Layers, CheckCircle2, DollarSign, BarChart3, Info,
  Maximize2, Minimize2, Save, FolderTree, PlusCircle, ArrowRight,
  Barcode, RefreshCw, Eye, Grid, ListFilter, Boxes, ChevronRight,
  TrendingUp, CheckSquare, SlidersHorizontal, Share2, CornerDownRight, Settings
} from 'lucide-react';
import { MasterCatalogItem, CatalogCategory, CatalogSubCategory } from '../types';
import { INITIAL_CATALOG_SUBCATEGORIES } from '../data/catalogData';
import { BatchVariantGeneratorModal } from './BatchVariantGeneratorModal';
import { ManageSubCategoriesModal } from './ManageSubCategoriesModal';

interface MasterCatalogViewProps {
  items: MasterCatalogItem[];
  onAddItem: (item: MasterCatalogItem) => void;
  onUpdateItem: (item: MasterCatalogItem) => void;
  onDeleteItem: (id: string) => void;
}

export const MasterCatalogView: React.FC<MasterCatalogViewProps> = ({
  items,
  onAddItem,
  onUpdateItem,
  onDeleteItem
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<CatalogCategory | 'ALL'>('ALL');
  const [activeSubCategoryId, setActiveSubCategoryId] = useState<string | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<'sku' | 'name' | 'retail_asc' | 'retail_desc' | 'category'>('sku');
  const [copiedSku, setCopiedSku] = useState<string | null>(null);

  // Subcategories management state
  const [subCategories, setSubCategories] = useState<CatalogSubCategory[]>(() => {
    const saved = localStorage.getItem('phonehouse_catalog_subcategories');
    return saved ? JSON.parse(saved) : INITIAL_CATALOG_SUBCATEGORIES;
  });

  // Modals State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(true);
  const [formMode, setFormMode] = useState<'single' | 'batch'>('single');
  const [editingItem, setEditingItem] = useState<MasterCatalogItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Dedicated Matrix Generator Modal State
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

  // Subcategories management modal state
  const [isManageSubModalOpen, setIsManageSubModalOpen] = useState(false);
  const [isAddSubModalOpen, setIsAddSubModalOpen] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubParent, setNewSubParent] = useState<CatalogCategory>('DEVICE');
  const [newSubCode, setNewSubCode] = useState('');

  // Single Item Form State
  const [formData, setFormData] = useState<Partial<MasterCatalogItem>>({
    category: 'DEVICE',
    subCategory: 'iPhone 16 Series',
    subCategoryId: 'SUB_IP16',
    brand: 'Apple',
    unit: 'Chiếc',
    barcode: '',
    sku: '',
    name: '',
    model: 'iPhone 16 Pro Max',
    storage: '256GB',
    color: 'Titan Sa Mạc (Desert)',
    condition: 'New Seal',
    region: 'VN/A (Chính hãng)',
    defaultImportPrice: 32500000,
    defaultRetailPrice: 34990000,
    wholesalePrice: 33800000,
    minStockLevel: 5,
    maxStockLevel: 30,
    warrantyPeriodMonths: 12,
    vatRate: 10,
    compatibleModels: [],
    status: 'active',
    notes: ''
  });

  // Batch Variant Generator State
  const [batchBaseModel, setBatchBaseModel] = useState('iPhone 16 Pro Max');
  const [batchCategory, setBatchCategory] = useState<CatalogCategory>('DEVICE');
  const [batchSubCategoryId, setBatchSubCategoryId] = useState('SUB_IP16');
  const [batchSelectedStorages, setBatchSelectedStorages] = useState<string[]>(['256GB', '512GB']);
  const [batchSelectedColors, setBatchSelectedColors] = useState<string[]>(['Titan Sa Mạc', 'Titan Tự Nhiên', 'Titan Đen', 'Titan Trắng']);
  const [batchRegion, setBatchRegion] = useState('VN/A (Chính hãng)');
  const [batchCondition, setBatchCondition] = useState('New Seal');
  const [batchBaseImportPrice, setBatchBaseImportPrice] = useState(32500000);
  const [batchBaseRetailPrice, setBatchBaseRetailPrice] = useState(34990000);

  // Sync subcategories to localStorage
  useEffect(() => {
    localStorage.setItem('phonehouse_catalog_subcategories', JSON.stringify(subCategories));
  }, [subCategories]);

  // Reset activeSubCategory when activeCategory changes
  useEffect(() => {
    setActiveSubCategoryId('ALL');
  }, [activeCategory]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopySku = (sku: string) => {
    navigator.clipboard.writeText(sku);
    setCopiedSku(sku);
    showToast(`Đã sao chép mã SKU: ${sku}`);
    setTimeout(() => setCopiedSku(null), 2000);
  };

  // Open Full-Page Quick Entry Form for Create
  const handleOpenCreateForm = () => {
    setEditingItem(null);
    setFormMode('single');
    const defaultSub = subCategories.find(s => s.parentCategory === 'DEVICE') || subCategories[0];
    setFormData({
      category: 'DEVICE',
      subCategory: defaultSub ? defaultSub.name : 'iPhone 16 Series',
      subCategoryId: defaultSub ? defaultSub.id : 'SUB_IP16',
      brand: 'Apple',
      unit: 'Chiếc',
      barcode: `893${Date.now().toString().slice(-9)}`,
      sku: '',
      name: '',
      model: 'iPhone 16 Pro Max',
      storage: '256GB',
      color: 'Titan Sa Mạc (Desert)',
      condition: 'New Seal',
      region: 'VN/A (Chính hãng)',
      defaultImportPrice: 32500000,
      defaultRetailPrice: 34990000,
      wholesalePrice: 33800000,
      minStockLevel: 5,
      maxStockLevel: 30,
      warrantyPeriodMonths: 12,
      vatRate: 10,
      compatibleModels: [],
      imageUrl: '',
      status: 'active',
      notes: ''
    });
    setIsFormOpen(true);
  };

  // Open Form for Edit
  const handleOpenEditForm = (item: MasterCatalogItem) => {
    setEditingItem(item);
    setFormMode('single');
    setFormData({ ...item });
    setIsFormOpen(true);
  };

  // Auto Generate SKU based on Hierarchy & Attributes
  const handleAutoGenerateSku = () => {
    const catPrefix = formData.category === 'DEVICE' ? 'DEV' : formData.category === 'PART' ? 'PART' : 'ACC';
    const subObj = subCategories.find(s => s.id === formData.subCategoryId);
    const subPrefix = subObj?.code ? `-${subObj.code}` : '';
    
    let modelClean = (formData.model || 'IPHONE').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
    const storageClean = formData.storage ? `-${formData.storage}` : '';
    const colorClean = formData.color ? `-${formData.color.slice(0, 3).toUpperCase()}` : '';
    const regionClean = formData.region?.includes('VN/A') ? '-VNA' : formData.region?.includes('LL/A') ? '-LLA' : '';
    const randomSuffix = Math.floor(100 + Math.random() * 900);

    const generated = `${catPrefix}${subPrefix}-${modelClean}${storageClean}${colorClean}${regionClean}-${randomSuffix}`;
    setFormData(prev => ({ ...prev, sku: generated }));
    showToast(`Đã tự sinh mã SKU: ${generated}`);
  };

  // Auto Generate Barcode
  const handleAutoGenerateBarcode = () => {
    const randomEAN = `893${Date.now().toString().slice(-9)}`;
    setFormData(prev => ({ ...prev, barcode: randomEAN }));
    showToast(`Đã tạo mã Barcode: ${randomEAN}`);
  };

  // Auto Generate Full Name
  const handleAutoGenerateName = () => {
    if (formData.category === 'DEVICE') {
      const parts = [
        formData.model || 'iPhone 16 Pro Max',
        formData.storage,
        formData.color ? `Màu ${formData.color}` : '',
        formData.condition === 'New Seal' ? 'New Seal' : `(${formData.condition})`,
        formData.region ? `[${formData.region.split(' ')[0]}]` : ''
      ].filter(Boolean);
      setFormData(prev => ({ ...prev, name: parts.join(' ') }));
    } else if (formData.category === 'PART') {
      const comp = formData.compatibleModels?.length ? `cho ${formData.compatibleModels.join(', ')}` : '';
      setFormData(prev => ({ 
        ...prev, 
        name: `${formData.subCategory || 'Linh kiện'} ${formData.model || ''} ${comp}`.trim() 
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        name: `${formData.subCategory || 'Phụ kiện'} ${formData.model || ''} chính hãng ${formData.brand || 'Apple'}`.trim()
      }));
    }
    showToast('Đã tự động chuẩn hóa tên hàng hóa!');
  };

  // Save Item Handler
  const handleSaveForm = (e?: React.FormEvent, continueAdding: boolean = false) => {
    if (e) e.preventDefault();

    if (!formData.name?.trim() || !formData.sku?.trim()) {
      alert('Vui lòng nhập Tên sản phẩm và Mã SKU!');
      return;
    }

    if (editingItem) {
      const updated: MasterCatalogItem = {
        ...editingItem,
        ...formData as MasterCatalogItem
      };
      onUpdateItem(updated);
      showToast(`Đã cập nhật SKU ${updated.sku}`);
      setIsFormOpen(false);
    } else {
      const newItem: MasterCatalogItem = {
        id: `CAT_${Date.now()}`,
        sku: formData.sku?.trim().toUpperCase() || `SKU_${Date.now()}`,
        name: formData.name?.trim() || '',
        category: formData.category || 'DEVICE',
        parentCategoryId: formData.category || 'DEVICE',
        subCategory: formData.subCategory,
        subCategoryId: formData.subCategoryId,
        brand: formData.brand || 'Apple',
        unit: formData.unit || 'Chiếc',
        barcode: formData.barcode || `893${Date.now().toString().slice(-9)}`,
        model: formData.model,
        storage: formData.storage,
        color: formData.color,
        condition: formData.condition,
        region: formData.region,
        imageUrl: formData.imageUrl?.trim() || '',
        defaultImportPrice: Number(formData.defaultImportPrice) || 0,
        defaultRetailPrice: Number(formData.defaultRetailPrice) || 0,
        wholesalePrice: Number(formData.wholesalePrice) || 0,
        minStockLevel: Number(formData.minStockLevel) || 5,
        maxStockLevel: Number(formData.maxStockLevel) || 50,
        warrantyPeriodMonths: Number(formData.warrantyPeriodMonths) || 12,
        vatRate: Number(formData.vatRate) || 0,
        compatibleModels: formData.compatibleModels,
        status: formData.status || 'active',
        notes: formData.notes
      };
      onAddItem(newItem);
      showToast(`Đã thêm mới mã SKU ${newItem.sku}`);

      if (continueAdding) {
        // Reset form for next item
        handleOpenCreateForm();
      } else {
        setIsFormOpen(false);
      }
    }
  };

  // Handle Update Subcategory (Name, Code, Parent)
  const handleUpdateSubCategory = (updatedSub: CatalogSubCategory) => {
    setSubCategories(prev => prev.map(s => s.id === updatedSub.id ? updatedSub : s));
  };

  // Handle Delete Subcategory
  const handleDeleteSubCategory = (subId: string) => {
    setSubCategories(prev => prev.filter(s => s.id !== subId));
    if (activeSubCategoryId === subId) {
      setActiveSubCategoryId('ALL');
    }
  };

  // Handle Quick Add New Subcategory
  const handleCreateSubCategory = (newSub: CatalogSubCategory) => {
    setSubCategories(prev => [...prev, newSub]);
    setFormData(prev => ({
      ...prev,
      category: newSub.parentCategory,
      subCategory: newSub.name,
      subCategoryId: newSub.id
    }));
  };

  // Handle Quick Form Add Subcategory
  const handleFormCreateSubCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim()) return;

    const newSub: CatalogSubCategory = {
      id: `SUB_${Date.now()}`,
      name: newSubName.trim(),
      parentCategory: newSubParent,
      code: newSubCode.trim().toUpperCase() || newSubName.slice(0, 4).toUpperCase()
    };

    handleCreateSubCategory(newSub);
    setNewSubName('');
    setNewSubCode('');
    setIsAddSubModalOpen(false);
    showToast(`Đã tạo danh mục con: ${newSub.name}`);
  };

  // Batch Add multiple items from Matrix Generator
  const handleBatchAddItems = (newItems: MasterCatalogItem[]) => {
    newItems.forEach(item => {
      onAddItem(item);
    });
  };

  // Handle Batch Generate Variants from Form Tab
  const handleGenerateBatchVariants = () => {
    if (batchSelectedStorages.length === 0 || batchSelectedColors.length === 0) {
      alert('Vui lòng chọn ít nhất 1 dung lượng và 1 màu sắc!');
      return;
    }

    const subObj = subCategories.find(s => s.id === batchSubCategoryId);
    let count = 0;

    batchSelectedStorages.forEach((storage, sIdx) => {
      // Adjust price by storage
      const storageMultiplier = sIdx === 0 ? 1 : sIdx === 1 ? 1.15 : 1.35;
      const importP = Math.round(batchBaseImportPrice * storageMultiplier);
      const retailP = Math.round(batchBaseRetailPrice * storageMultiplier);

      batchSelectedColors.forEach((color) => {
        const cleanModel = batchBaseModel.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
        const colorCode = color.slice(0, 3).toUpperCase();
        const rand = Math.floor(100 + Math.random() * 900);
        const sku = `DEV-${subObj?.code || 'IP'}-${cleanModel}-${storage}-${colorCode}-${rand}`;

        const newItem: MasterCatalogItem = {
          id: `CAT_${Date.now()}_${count}`,
          sku,
          name: `${batchBaseModel} ${storage} Màu ${color} (${batchCondition}) [${batchRegion.split(' ')[0]}]`,
          category: batchCategory,
          parentCategoryId: batchCategory,
          subCategory: subObj ? subObj.name : 'iPhone 16 Series',
          subCategoryId: batchSubCategoryId,
          brand: 'Apple',
          unit: 'Chiếc',
          barcode: `893${Date.now().toString().slice(-8)}${count}`,
          model: batchBaseModel,
          storage,
          color,
          condition: batchCondition,
          region: batchRegion,
          defaultImportPrice: importP,
          defaultRetailPrice: retailP,
          wholesalePrice: Math.round(importP * 1.05),
          minStockLevel: 5,
          maxStockLevel: 30,
          warrantyPeriodMonths: 12,
          vatRate: 10,
          status: 'active'
        };

        onAddItem(newItem);
        count++;
      });
    });

    showToast(`⚡ Đã tự động sinh thành công ${count} mã biến thể SKU!`);
    setIsFormOpen(false);
  };

  // Confirm delete
  const handleDeleteConfirm = () => {
    if (deletingId) {
      onDeleteItem(deletingId);
      showToast('Đã xóa mã hàng thành công');
      setDeletingId(null);
    }
  };

  // Available subcategories for the active parent category
  const availableSubCategories = useMemo(() => {
    if (activeCategory === 'ALL') return subCategories;
    return subCategories.filter(s => s.parentCategory === activeCategory);
  }, [subCategories, activeCategory]);

  // Form available subcategories based on form parent category
  const formSubCategories = useMemo(() => {
    return subCategories.filter(s => s.parentCategory === formData.category);
  }, [subCategories, formData.category]);

  // Filtered & Sorted items
  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const result = items.filter(i => {
      const matchSearch = !term || 
        i.name.toLowerCase().includes(term) || 
        i.sku.toLowerCase().includes(term) ||
        (i.barcode && i.barcode.toLowerCase().includes(term)) ||
        (i.subCategory && i.subCategory.toLowerCase().includes(term)) ||
        (i.brand && i.brand.toLowerCase().includes(term)) ||
        (i.model && i.model.toLowerCase().includes(term)) ||
        (i.color && i.color.toLowerCase().includes(term)) ||
        (i.storage && i.storage.toLowerCase().includes(term));
      
      const matchCategory = activeCategory === 'ALL' || i.category === activeCategory;
      const matchSubCategory = activeSubCategoryId === 'ALL' || i.subCategoryId === activeSubCategoryId || i.subCategory === activeSubCategoryId;

      return matchSearch && matchCategory && matchSubCategory;
    });

    return result.sort((a, b) => {
      if (sortBy === 'sku') return a.sku.localeCompare(b.sku);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'category') return a.category.localeCompare(b.category);
      if (sortBy === 'retail_asc') return a.defaultRetailPrice - b.defaultRetailPrice;
      if (sortBy === 'retail_desc') return b.defaultRetailPrice - a.defaultRetailPrice;
      return 0;
    });
  }, [items, searchTerm, activeCategory, activeSubCategoryId, sortBy]);

  // Statistics & counts
  const stats = useMemo(() => {
    const total = items.length;
    const devices = items.filter(i => i.category === 'DEVICE').length;
    const parts = items.filter(i => i.category === 'PART').length;
    const accessories = items.filter(i => i.category === 'ACCESSORY').length;
    return { total, devices, parts, accessories };
  }, [items]);

  // Count per subcategory
  const subCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach(item => {
      if (item.subCategoryId) {
        counts[item.subCategoryId] = (counts[item.subCategoryId] || 0) + 1;
      }
      if (item.subCategory) {
        counts[item.subCategory] = (counts[item.subCategory] || 0) + 1;
      }
    });
    return counts;
  }, [items]);

  const getCategoryBadge = (cat: CatalogCategory) => {
    switch (cat) {
      case 'DEVICE': 
        return (
          <span className="px-2 py-0.5 bg-orange-100/80 text-orange-700 text-[10px] font-bold rounded-lg border border-orange-200 inline-flex items-center gap-1">
            <Smartphone className="w-3 h-3 text-orange-600" /> Thiết Bị (Máy)
          </span>
        );
      case 'PART': 
        return (
          <span className="px-2 py-0.5 bg-amber-100/80 text-amber-800 text-[10px] font-bold rounded-lg border border-amber-200 inline-flex items-center gap-1">
            <Wrench className="w-3 h-3 text-amber-700" /> Linh Kiện Thay Thế
          </span>
        );
      case 'ACCESSORY': 
        return (
          <span className="px-2 py-0.5 bg-emerald-100/80 text-emerald-800 text-[10px] font-bold rounded-lg border border-emerald-200 inline-flex items-center gap-1">
            <Headphones className="w-3 h-3 text-emerald-700" /> Phụ Kiện Apple
          </span>
        );
    }
  };

  // Estimated profit and margin
  const estProfit = (Number(formData.defaultRetailPrice) || 0) - (Number(formData.defaultImportPrice) || 0);
  const estMargin = (Number(formData.defaultRetailPrice) || 0) > 0 
    ? Math.round((estProfit / (Number(formData.defaultRetailPrice) || 1)) * 100)
    : 0;

  return (
    <div className="space-y-3 sm:space-y-4 pb-24 animate-fadeIn text-zinc-900">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-zinc-900 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center space-x-2 text-xs font-bold animate-bounce border border-zinc-700">
          <CheckCircle2 className="w-4 h-4 text-orange-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ================= 1. CLEAN HEADER WITH ACTION BUTTONS ================= */}
      <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 rounded-2xl p-3 sm:p-4 text-white shadow-sm border border-orange-400/30">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
          {/* Left: App Title & Total Count */}
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/20 backdrop-blur-xs text-white flex items-center justify-center font-black shadow-xs shrink-0 border border-white/30">
              <Package className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base md:text-lg font-black text-white tracking-tight uppercase truncate">
                Danh Mục Hàng Hóa
              </h1>
              <span className="text-[11px] sm:text-xs text-orange-100 font-medium truncate block">
                Hệ thống quản lý {stats.total} mã SKU & định danh chuẩn Phone House
              </span>
            </div>
          </div>

          {/* Right: 3 Action Buttons on 1 Single Row (No overflow, equal grid on mobile) */}
          <div className="grid grid-cols-3 gap-1.5 sm:flex sm:items-center sm:gap-2 w-full sm:w-auto shrink-0">
            {/* 1. Sinh biến thể (Matrix) */}
            <button
              type="button"
              onClick={() => setIsBatchModalOpen(true)}
              className="flex items-center justify-center space-x-1 px-2 py-1.5 sm:px-3 sm:py-2 bg-white text-orange-700 hover:bg-orange-50 font-bold text-[11px] sm:text-xs rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer border border-white/80 whitespace-nowrap min-w-0"
              title="Sinh hàng chục mã SKU biến thể theo ma trận Dung lượng x Màu sắc"
            >
              <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-500 fill-amber-500 shrink-0" />
              <span className="truncate">Sinh biến thể</span>
            </button>

            {/* 2. Danh mục cấp 2 (Quản lý nhóm con) */}
            <button
              type="button"
              onClick={() => setIsManageSubModalOpen(true)}
              className="flex items-center justify-center space-x-1 px-2 py-1.5 sm:px-3 sm:py-2 bg-white/15 hover:bg-white/25 text-white font-bold text-[11px] sm:text-xs rounded-xl backdrop-blur-xs transition-all border border-white/30 cursor-pointer whitespace-nowrap min-w-0"
              title="Chỉnh sửa tên, mã tiền tố hoặc xóa các danh mục con"
            >
              <Settings className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-200 shrink-0" />
              <span className="truncate">Nhóm cấp 2</span>
            </button>

            {/* 3. Tạo mã SKU */}
            <button
              type="button"
              onClick={handleOpenCreateForm}
              className="flex items-center justify-center space-x-1 px-2 py-1.5 sm:px-3.5 sm:py-2 bg-zinc-950 hover:bg-black text-white font-bold text-[11px] sm:text-xs rounded-xl shadow-md active:scale-95 transition-all cursor-pointer border border-zinc-700 whitespace-nowrap min-w-0"
            >
              <Plus className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <span className="truncate">+ Tạo SKU</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================= 2. 4 LARGE SQUARE CATEGORY TILES (Ô VUÔNG LỚN THEO DÃY MÀU CAM TRẮNG) ================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          {
            id: 'ALL',
            label: 'Tất Cả Hàng Hóa',
            desc: 'Toàn bộ danh mục SKU',
            count: stats.total,
            icon: Boxes,
            activeBg: 'bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 text-white shadow-lg shadow-orange-500/25 border-orange-600',
            inactiveBg: 'bg-white hover:border-orange-300 text-zinc-900 border-orange-100/90 shadow-2xs',
            iconBgActive: 'bg-white/25 text-white shadow-xs',
            iconBgInactive: 'bg-orange-50 text-orange-600 border border-orange-100',
            badgeBgActive: 'bg-white/25 text-white',
            badgeBgInactive: 'bg-orange-50 text-orange-800'
          },
          {
            id: 'DEVICE',
            label: 'Thiết Bị (Máy)',
            desc: 'iPhone, iPad, Watch, Mac',
            count: stats.devices,
            icon: Smartphone,
            activeBg: 'bg-gradient-to-br from-orange-600 via-amber-600 to-orange-700 text-white shadow-lg shadow-orange-600/25 border-orange-700',
            inactiveBg: 'bg-white hover:border-orange-300 text-zinc-900 border-orange-100/90 shadow-2xs',
            iconBgActive: 'bg-white/25 text-white shadow-xs',
            iconBgInactive: 'bg-orange-50/80 text-orange-700 border border-orange-100',
            badgeBgActive: 'bg-white/25 text-white',
            badgeBgInactive: 'bg-orange-50 text-orange-800'
          },
          {
            id: 'PART',
            label: 'Linh Kiện',
            desc: 'Màn hình, Pin, Kính, Vỏ',
            count: stats.parts,
            icon: Wrench,
            activeBg: 'bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 text-white shadow-lg shadow-amber-500/25 border-amber-600',
            inactiveBg: 'bg-white hover:border-amber-300 text-zinc-900 border-orange-100/90 shadow-2xs',
            iconBgActive: 'bg-white/25 text-white shadow-xs',
            iconBgInactive: 'bg-amber-50 text-amber-600 border border-amber-100',
            badgeBgActive: 'bg-white/25 text-white',
            badgeBgInactive: 'bg-amber-50 text-amber-800'
          },
          {
            id: 'ACCESSORY',
            label: 'Phụ Kiện',
            desc: 'Củ cáp, Tai nghe, Ốp lưng',
            count: stats.accessories,
            icon: Headphones,
            activeBg: 'bg-gradient-to-br from-amber-600 via-orange-500 to-amber-700 text-white shadow-lg shadow-orange-500/25 border-orange-600',
            inactiveBg: 'bg-white hover:border-orange-300 text-zinc-900 border-orange-100/90 shadow-2xs',
            iconBgActive: 'bg-white/25 text-white shadow-xs',
            iconBgInactive: 'bg-orange-50 text-orange-600 border border-orange-100',
            badgeBgActive: 'bg-white/25 text-white',
            badgeBgInactive: 'bg-orange-50 text-orange-800'
          }
        ].map(tile => {
          const isSelected = activeCategory === tile.id;
          const IconComponent = tile.icon;

          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => {
                setActiveCategory(tile.id as any);
                setActiveSubCategoryId('ALL');
              }}
              className={`p-4 sm:p-5 rounded-2xl sm:rounded-3xl border transition-all duration-200 text-left flex flex-col justify-between cursor-pointer active:scale-98 shadow-xs relative overflow-hidden group min-h-[115px] sm:min-h-[130px] ${
                isSelected ? tile.activeBg : tile.inactiveBg
              }`}
            >
              {/* Top Row: Icon + Count */}
              <div className="flex items-center justify-between w-full">
                <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-105 shadow-xs ${
                  isSelected ? tile.iconBgActive : tile.iconBgInactive
                }`}>
                  <IconComponent className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${
                  isSelected ? 'text-white' : 'text-zinc-900'
                }`}>
                  {tile.count}
                </div>
              </div>

              {/* Bottom Row: Title + Description */}
              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <span className={`text-sm sm:text-base font-black tracking-tight ${
                    isSelected ? 'text-white' : 'text-zinc-900'
                  }`}>
                    {tile.label}
                  </span>
                  {isSelected && (
                    <div className="w-2 h-2 rounded-full bg-white animate-ping" />
                  )}
                </div>
                <p className={`text-xs mt-0.5 font-medium line-clamp-1 ${
                  isSelected ? 'text-white/80' : 'text-zinc-500'
                }`}>
                  {tile.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ================= 3. SEARCH & FILTER CONTROLS (THANH TÌM KIẾM DÒNG TRÊN, BỘ LỌC DÒNG DƯỚI) ================= */}
      <div className="bg-white rounded-2xl p-2.5 sm:p-3 shadow-2xs border border-orange-100/90 space-y-2">
        {/* DÒNG 1 (TRÊN): THANH TÌM KIẾM TOÀN DIỆN */}
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Tìm kiếm mã SKU, tên sản phẩm, barcode, model máy, dung lượng, màu sắc..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-9 py-2 bg-zinc-50 border border-zinc-200 focus:border-orange-500 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 font-medium placeholder:text-zinc-400"
          />
          {searchTerm && (
            <button 
              type="button" 
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* DÒNG 2 (DƯỚI): BỘ LỌC NHÓM CẤP 2 & SẮP XẾP */}
        <div className="flex flex-row items-center justify-between gap-2 pt-1 border-t border-zinc-100">
          {/* Bộ Lọc Nhóm Con (Dropdown / Select) */}
          <div className="flex items-center space-x-1.5 bg-orange-50/80 border border-orange-200/90 rounded-xl px-2.5 py-1 flex-1 sm:flex-none">
            <FolderTree className="w-3.5 h-3.5 text-orange-600 shrink-0" />
            <select
              value={activeSubCategoryId}
              onChange={(e) => setActiveSubCategoryId(e.target.value)}
              className="bg-transparent text-[11px] font-normal text-orange-950 focus:outline-none cursor-pointer pr-1 w-full sm:w-auto sm:max-w-[280px] truncate"
            >
              <option value="ALL">Tất cả nhóm con ({availableSubCategories.length})</option>
              {availableSubCategories.map(sub => {
                const count = subCategoryCounts[sub.id] || subCategoryCounts[sub.name] || 0;
                return (
                  <option key={sub.id} value={sub.id}>
                    {sub.name} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Sắp Xếp Thu Gọn */}
          <div className="flex items-center space-x-1.5 bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1 text-[11px] font-normal text-zinc-700 shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-[11px] font-normal text-zinc-700 focus:outline-none cursor-pointer pr-1"
            >
              <option value="sku">SKU (A-Z)</option>
              <option value="name">Tên (A-Z)</option>
              <option value="category">Nhóm hàng</option>
              <option value="retail_asc">Giá bán ↑</option>
              <option value="retail_desc">Giá bán ↓</option>
            </select>
          </div>
        </div>
      </div>

      {/* ================= 3. MOBILE SKU CARDS ================= */}
      <div className="lg:hidden space-y-3">
        {filteredItems.map(item => {
          const margin = item.defaultRetailPrice - item.defaultImportPrice;
          const marginPct = item.defaultRetailPrice > 0 
            ? Math.round((margin / item.defaultRetailPrice) * 100) 
            : 0;

          return (
            <div 
              key={item.id}
              className="bg-white rounded-2xl p-3.5 shadow-2xs border border-orange-100 space-y-2.5 transition-all"
            >
              {/* Top row: SKU + Actions */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => handleCopySku(item.sku)}
                    className="flex items-center space-x-1 px-2.5 py-1 bg-zinc-900 active:bg-orange-600 text-white font-mono text-xs font-black rounded-lg transition-all"
                  >
                    <span>{item.sku}</span>
                    <Copy className="w-3 h-3 text-orange-300" />
                  </button>
                  {item.subCategory && (
                    <span className="px-2 py-0.5 bg-orange-50 border border-orange-200 text-orange-800 text-[10px] font-bold rounded-md truncate max-w-[120px]">
                      {item.subCategory}
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleOpenEditForm(item)}
                    className="p-1.5 text-zinc-400 hover:text-orange-600 rounded-lg hover:bg-orange-50"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeletingId(item.id)}
                    className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Title & Hierarchy with Image */}
              <div className="flex items-start gap-2.5">
                <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center relative">
                  {item.imageUrl ? (
                    <div className="w-full h-full rounded-xl border border-zinc-200 overflow-hidden relative">
                      <img 
                        src={item.imageUrl} 
                        alt={item.name} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <div className="scale-75 origin-center">
                      <DeviceImageThumbnail model={item.category === 'DEVICE' ? item.name : undefined} color={item.color || ''} fallbackName={item.name} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-zinc-900 leading-snug">{item.name}</h4>
                  <div className="flex items-center flex-wrap gap-1.5 text-[11px] text-zinc-500 mt-1">
                    {getCategoryBadge(item.category)}
                    {item.brand && <span className="font-semibold text-zinc-700">• {item.brand}</span>}
                    {item.unit && <span>({item.unit})</span>}
                    {item.storage && <span className="font-bold text-orange-600">• {item.storage}</span>}
                    {item.color && <span>• Màu {item.color}</span>}
                  </div>
                </div>
              </div>

              {/* Pricing Box */}
              <div className="bg-orange-50/40 rounded-xl p-2.5 border border-orange-100/80 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-zinc-500 block font-medium">Giá vốn ước tính</span>
                  <span className="font-bold text-zinc-700 font-mono">
                    {item.defaultImportPrice.toLocaleString('vi-VN')} đ
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-zinc-500 block font-medium">Giá bán lẻ niêm yết</span>
                  <div className="flex items-center space-x-1.5 justify-end">
                    <span className="font-black text-orange-600 font-mono">
                      {item.defaultRetailPrice.toLocaleString('vi-VN')} đ
                    </span>
                    {margin > 0 && (
                      <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-700 px-1 py-0.2 rounded-sm">
                        +{marginPct}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center border border-orange-100">
            <Package className="w-10 h-10 text-orange-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-zinc-800">Không tìm thấy mã hàng nào</h4>
            <p className="text-xs text-zinc-500 mt-1">Thử đổi từ khóa tìm kiếm hoặc chọn danh mục khác</p>
            <button
              onClick={handleOpenCreateForm}
              className="mt-3 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl text-xs font-bold shadow-sm inline-flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm hàng hóa mới</span>
            </button>
          </div>
        )}
      </div>

      {/* ================= 4. DESKTOP TABLE VIEW ================= */}
      <div className="hidden lg:block bg-white rounded-3xl shadow-2xs border border-orange-100/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-orange-50/50 border-b border-orange-100 text-[11px] text-zinc-600 font-extrabold uppercase tracking-wider">
                <th className="p-3.5">Mã SKU & Barcode</th>
                <th className="p-3.5">Tên Hàng Hóa & Cấu Hình</th>
                <th className="p-3.5">Phân Cấp Cha - Con</th>
                <th className="p-3.5">Hãng & ĐVT</th>
                <th className="p-3.5">Giá Vốn Ước Tính</th>
                <th className="p-3.5">Giá Bán Lẻ Niêm Yết</th>
                <th className="p-3.5 text-center">Tồn Min/Max</th>
                <th className="p-3.5 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-xs">
              {filteredItems.map(item => {
                const margin = item.defaultRetailPrice - item.defaultImportPrice;
                const marginPct = item.defaultRetailPrice > 0 
                  ? Math.round((margin / item.defaultRetailPrice) * 100) 
                  : 0;

                return (
                  <tr key={item.id} className="hover:bg-orange-50/30 transition-colors group">
                    {/* SKU & Barcode */}
                    <td className="p-3.5">
                      <button
                        onClick={() => handleCopySku(item.sku)}
                        className="flex items-center space-x-1.5 px-2 py-1 bg-zinc-900 group-hover:bg-[#F94A1F] text-white font-mono text-xs font-black rounded-lg transition-all cursor-pointer"
                        title="Bấm để sao chép SKU"
                      >
                        <span>{item.sku}</span>
                        <Copy className="w-3 h-3 text-orange-300 opacity-70 group-hover:opacity-100" />
                      </button>
                      {item.barcode && (
                        <div className="flex items-center space-x-1 text-[10px] text-zinc-400 font-mono mt-1">
                          <Barcode className="w-3 h-3" />
                          <span>{item.barcode}</span>
                        </div>
                      )}
                    </td>

                    {/* Name & Details with Image Thumbnail */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-50/80 border border-orange-100/90 flex-shrink-0 flex items-center justify-center overflow-hidden">
                          {item.imageUrl ? (
                            <img 
                              src={item.imageUrl} 
                              alt={item.name} 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : item.category === 'DEVICE' ? (
                            <Smartphone className="w-5 h-5 text-orange-400" />
                          ) : item.category === 'PART' ? (
                            <Wrench className="w-5 h-5 text-orange-400" />
                          ) : (
                            <Headphones className="w-5 h-5 text-orange-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-zinc-900 text-sm">{item.name}</div>
                          <div className="flex items-center space-x-2 text-[11px] text-zinc-500 mt-0.5">
                            {item.model && <span>{item.model}</span>}
                            {item.storage && <span className="font-semibold text-orange-600">• {item.storage}</span>}
                            {item.color && <span>• Màu {item.color}</span>}
                            {item.condition && <span className="text-emerald-600 font-medium">({item.condition})</span>}
                            {item.region && <span className="font-mono bg-zinc-100 px-1 py-0.2 rounded text-[10px]">{item.region.split(' ')[0]}</span>}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Hierarchy: Parent & Child */}
                    <td className="p-3.5">
                      <div className="space-y-1">
                        <div>{getCategoryBadge(item.category)}</div>
                        {item.subCategory && (
                          <div className="text-[11px] font-bold text-zinc-700 flex items-center gap-1">
                            <CornerDownRight className="w-3 h-3 text-orange-500" />
                            <span className="bg-orange-50 text-orange-900 px-1.5 py-0.5 rounded border border-orange-200">
                              {item.subCategory}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Brand & Unit */}
                    <td className="p-3.5">
                      <div className="font-bold text-zinc-800">{item.brand || 'Apple'}</div>
                      <div className="text-[10px] text-zinc-500">ĐVT: {item.unit || 'Chiếc'}</div>
                    </td>

                    {/* Import Cost */}
                    <td className="p-3.5 font-semibold text-zinc-700 font-mono">
                      {item.defaultImportPrice.toLocaleString('vi-VN')} đ
                    </td>

                    {/* Retail Price & Margin */}
                    <td className="p-3.5">
                      <div className="font-black text-orange-600 text-sm font-mono">
                        {item.defaultRetailPrice.toLocaleString('vi-VN')} đ
                      </div>
                      {margin > 0 && (
                        <div className="text-[10px] text-emerald-600 font-bold">
                          Lãi: +{margin.toLocaleString('vi-VN')} đ ({marginPct}%)
                        </div>
                      )}
                    </td>

                    {/* Min / Max Stock */}
                    <td className="p-3.5 text-center font-bold text-zinc-700">
                      <span className="px-2 py-0.5 bg-zinc-100 rounded-md font-mono text-[11px]">
                        {item.minStockLevel || 5} / {item.maxStockLevel || 30}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button 
                          onClick={() => handleOpenEditForm(item)}
                          className="p-1.5 text-zinc-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors cursor-pointer"
                          title="Sửa mã hàng"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setDeletingId(item.id)}
                          className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Xóa mã hàng"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-500">
                    <Package className="w-8 h-8 text-zinc-300 mx-auto mb-1" />
                    Không tìm thấy mã hàng nào phù hợp với bộ lọc danh mục và từ khóa
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= 5. FULLSCREEN SKU ENTRY & EDIT MODAL ================= */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs animate-fadeIn p-0 sm:p-2 md:p-3">
          <div className="bg-white w-full h-full sm:h-[97vh] sm:max-w-7xl sm:rounded-3xl shadow-2xl border border-orange-200 overflow-hidden flex flex-col transition-all">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 px-4 sm:px-6 py-3.5 text-white flex items-center justify-between shrink-0 shadow-md">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-white/20 text-white rounded-xl backdrop-blur-xs shadow-xs border border-white/25">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm sm:text-base font-black uppercase tracking-tight">
                      {editingItem ? `Chỉnh Sửa SKU: ${editingItem.sku}` : 'Tạo Mã Hàng Hóa Mới'}
                    </h3>
                    <span className="px-2 py-0.5 bg-white/20 text-white text-[10px] font-black rounded-md">
                      Full-Screen Editor
                    </span>
                  </div>
                  <p className="text-xs text-orange-100 hidden sm:block">
                    Khai báo chi tiết thông số kỹ thuật, định danh SKU, giá nhập, giá bán lẻ và định mức tồn kho
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {!editingItem && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsFormOpen(false);
                      setIsBatchModalOpen(true);
                    }}
                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-orange-700 hover:bg-orange-50 text-xs font-bold transition-all shadow-xs cursor-pointer border border-white/80"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    <span>Mở Bộ Sinh Biến Thể Hàng Loạt</span>
                  </button>
                )}

                <button 
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-white transition-colors cursor-pointer"
                  title="Đóng (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Form Body - Spacious 2 Columns */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-zinc-50/60">
              <form id="sku-single-form" onSubmit={(e) => handleSaveForm(e, false)} className="space-y-4 max-w-6xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  
                  {/* ===== CỘT 1: PHÂN LOẠI & ĐẶC TÍNH SẢN PHẨM ===== */}
                  <div className="space-y-3">
                    {/* Nhóm Cấp 1 (Cha) */}
                    <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-2xs space-y-2">
                      <label className="block text-[11px] font-bold text-zinc-700">
                        Danh Mục Cấp 1 (Cha): <span className="text-rose-500">*</span>
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: 'DEVICE', label: '📱 Thiết Bị', icon: Smartphone },
                          { id: 'PART', label: '🔧 Linh Kiện', icon: Wrench },
                          { id: 'ACCESSORY', label: '🎧 Phụ Kiện', icon: Headphones }
                        ].map(c => {
                          const isSel = formData.category === c.id;
                          return (
                            <button
                              type="button"
                              key={c.id}
                              onClick={() => {
                                const sub = subCategories.find(s => s.parentCategory === c.id);
                                setFormData({ 
                                  ...formData, 
                                  category: c.id as any,
                                  subCategory: sub?.name || '',
                                  subCategoryId: sub?.id || ''
                                });
                              }}
                              className={`py-1.5 px-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                                isSel 
                                  ? 'bg-orange-50 border-[#F94A1F] text-orange-700 font-extrabold shadow-2xs' 
                                  : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                              }`}
                            >
                              <span>{c.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Nhóm Cấp 2 (Con) */}
                      <div className="pt-1.5 border-t border-zinc-100">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-zinc-700">
                            Danh Mục Cấp 2 (Nhóm Con): <span className="text-rose-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setNewSubParent(formData.category || 'DEVICE');
                              setIsAddSubModalOpen(true);
                            }}
                            className="text-[10px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-0.5 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Tạo mới
                          </button>
                        </div>
                        <select
                          value={formData.subCategoryId || ''}
                          onChange={(e) => {
                            const sel = subCategories.find(s => s.id === e.target.value);
                            setFormData({
                              ...formData,
                              subCategoryId: e.target.value,
                              subCategory: sel ? sel.name : ''
                            });
                          }}
                          className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 focus:border-orange-500 rounded-lg text-xs font-bold"
                          required
                        >
                          <option value="">-- Chọn danh mục con --</option>
                          {formSubCategories.map(sub => (
                            <option key={sub.id} value={sub.id}>
                              {sub.name} {sub.code ? `(${sub.code})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Model & Đặc Tính Kỹ Thuật */}
                    <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-2xs space-y-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-700 mb-1">Model / Tên Dòng:</label>
                        <input
                          type="text"
                          placeholder="Ví dụ: iPhone 16 Pro Max, Màn hình GX..."
                          value={formData.model || ''}
                          onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold"
                        />
                      </div>

                      {/* Chi tiết cho Thiết Bị (Máy) */}
                      {formData.category === 'DEVICE' && (
                        <div className="space-y-2 pt-1 border-t border-zinc-100">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-600 mb-1">Dung lượng:</label>
                              <select
                                value={formData.storage || '256GB'}
                                onChange={(e) => setFormData({ ...formData, storage: e.target.value })}
                                className="w-full px-2 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold"
                              >
                                <option value="64GB">64GB</option>
                                <option value="128GB">128GB</option>
                                <option value="256GB">256GB</option>
                                <option value="512GB">512GB</option>
                                <option value="1TB">1TB</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-600 mb-1">Màu sắc:</label>
                              <input
                                type="text"
                                placeholder="Titan Sa Mạc, Đen..."
                                value={formData.color || ''}
                                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                className="w-full px-2 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-semibold"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-600 mb-1">Tình trạng:</label>
                              <select
                                value={formData.condition || 'New Seal'}
                                onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                                className="w-full px-2 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold text-emerald-700"
                              >
                                <option value="New Seal">New Seal (Chưa Active)</option>
                                <option value="Like New 99%">Like New 99%</option>
                                <option value="98% Cấn Nhẹ">98% Cấn Nhẹ</option>
                                <option value="95% Trầy Xước">95% Trầy Xước</option>
                                <option value="Hàng Trưng Bày">Hàng Trưng Bày (Demo)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-600 mb-1">Mã thị trường:</label>
                              <select
                                value={formData.region || 'VN/A (Chính hãng)'}
                                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                                className="w-full px-2 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold font-mono"
                              >
                                <option value="VN/A (Chính hãng)">VN/A (Chính hãng)</option>
                                <option value="LL/A (Quốc Tế Mỹ)">LL/A (Quốc Tế Mỹ)</option>
                                <option value="ZA/A (2 SIM Vật Lý)">ZA/A (2 SIM Vật Lý)</option>
                                <option value="J/A (Nhật Bản)">J/A (Nhật Bản)</option>
                                <option value="KH/A (Hàn Quốc)">KH/A (Hàn Quốc)</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Chi tiết cho Linh Kiện / Phụ Kiện */}
                      {(formData.category === 'PART' || formData.category === 'ACCESSORY') && (
                        <div className="pt-1 border-t border-zinc-100">
                          <label className="block text-[10px] font-bold text-zinc-600 mb-1">Model tương thích:</label>
                          <input
                            type="text"
                            placeholder="iPhone 13, 14, 15, 16 Pro Max..."
                            value={(formData.compatibleModels || []).join(', ')}
                            onChange={(e) => setFormData({ 
                              ...formData, 
                              compatibleModels: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                            })}
                            className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-semibold"
                          />
                        </div>
                      )}

                      {/* Brand & ĐVT */}
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-100">
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-600 mb-1">Thương hiệu:</label>
                          <input
                            type="text"
                            placeholder="Apple, Pisen..."
                            value={formData.brand || 'Apple'}
                            onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                            className="w-full px-2 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-600 mb-1">Đơn vị tính:</label>
                          <select
                            value={formData.unit || 'Chiếc'}
                            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                            className="w-full px-2 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold"
                          >
                            <option value="Chiếc">Chiếc</option>
                            <option value="Bộ">Bộ</option>
                            <option value="Cụm">Cụm</option>
                            <option value="Viên">Viên</option>
                            <option value="Sợi">Sợi</option>
                            <option value="Miếng">Miếng</option>
                            <option value="Gói">Gói</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ===== CỘT 2: ĐỊNH DANH, GIÁ & TỒN KHO ===== */}
                  <div className="space-y-3">
                    {/* Tên & SKU */}
                    <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-2xs space-y-2.5">
                      {/* Tên Hàng Hóa */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-zinc-700">
                            Tên Hàng Hóa Chuẩn: <span className="text-rose-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={handleAutoGenerateName}
                            className="text-[10px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-0.5 cursor-pointer"
                          >
                            <Sparkles className="w-3 h-3 text-amber-500" /> Tự ghép tên
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="iPhone 16 Pro Max 256GB Sa Mạc..."
                          value={formData.name || ''}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 focus:border-orange-500 rounded-lg text-xs font-bold"
                          required
                        />
                      </div>

                      {/* Mã SKU */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-zinc-700">
                            Mã SKU Chuẩn: <span className="text-rose-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={handleAutoGenerateSku}
                            className="text-[10px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-0.5 cursor-pointer"
                          >
                            <Sparkles className="w-3 h-3 text-amber-500" /> Tự sinh SKU
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="DEV-IP16-16PM-256-DESERT"
                          value={formData.sku || ''}
                          onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                          className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 focus:border-orange-500 rounded-lg text-xs font-mono font-black uppercase"
                          required
                        />
                      </div>

                      {/* Barcode */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-bold text-zinc-600">Mã Barcode (EAN-13):</label>
                          <button
                            type="button"
                            onClick={handleAutoGenerateBarcode}
                            className="text-[10px] font-bold text-zinc-500 hover:text-zinc-700 flex items-center gap-0.5 cursor-pointer"
                          >
                            <RefreshCw className="w-2.5 h-2.5" /> Sinh Barcode
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="893600000..."
                          value={formData.barcode || ''}
                          onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-mono"
                        />
                      </div>
                    </div>

                    {/* Bảng Giá & Tồn Kho (KHÔNG BẮT BUỘC GIÁ BÁN LẺ) */}
                    <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-2xs space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        {/* Giá Vốn */}
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-600 mb-1">
                            Giá vốn ước tính (VNĐ):
                          </label>
                          <input
                            type="number"
                            placeholder="0"
                            value={formData.defaultImportPrice || ''}
                            onChange={(e) => setFormData({ ...formData, defaultImportPrice: Number(e.target.value) })}
                            className="w-full px-2 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold font-mono text-zinc-800"
                          />
                        </div>

                        {/* Giá Bán Lẻ - KHÔNG BẮT BUỘC */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold text-orange-800">
                              Giá bán lẻ (VNĐ):
                            </label>
                            <span className="text-[9px] text-zinc-400 font-medium">Tùy chọn</span>
                          </div>
                          <input
                            type="number"
                            placeholder="Chưa định giá / 0"
                            value={formData.defaultRetailPrice || ''}
                            onChange={(e) => setFormData({ ...formData, defaultRetailPrice: Number(e.target.value) })}
                            className="w-full px-2 py-1.5 bg-orange-50/50 border border-orange-200 focus:border-orange-500 rounded-lg text-xs font-bold font-mono text-orange-600"
                          />
                        </div>
                      </div>

                      {/* Live Margin Indicator (Chỉ hiện khi có giá bán) */}
                      {Number(formData.defaultRetailPrice) > 0 && (
                        <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-100 flex items-center justify-between text-xs">
                          <span className="text-[11px] font-bold text-emerald-900">
                            Lãi gộp: +{estProfit.toLocaleString('vi-VN')} đ
                          </span>
                          <span className="text-[10px] font-black bg-emerald-600 text-white px-1.5 py-0.2 rounded">
                            Margin {estMargin}%
                          </span>
                        </div>
                      )}

                      {/* Tồn Kho Min/Max & Bảo hành */}
                      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-100">
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-600 mb-1">Tồn Min:</label>
                          <input
                            type="number"
                            value={formData.minStockLevel ?? 5}
                            onChange={(e) => setFormData({ ...formData, minStockLevel: Number(e.target.value) })}
                            className="w-full px-2 py-1 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-600 mb-1">Tồn Max:</label>
                          <input
                            type="number"
                            value={formData.maxStockLevel ?? 30}
                            onChange={(e) => setFormData({ ...formData, maxStockLevel: Number(e.target.value) })}
                            className="w-full px-2 py-1 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-600 mb-1">Bảo hành (th):</label>
                          <input
                            type="number"
                            value={formData.warrantyPeriodMonths ?? 12}
                            onChange={(e) => setFormData({ ...formData, warrantyPeriodMonths: Number(e.target.value) })}
                            className="w-full px-2 py-1 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Hình ảnh sản phẩm (URL / Link ảnh) */}
                    <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-2xs space-y-2">
                      <label className="block text-[11px] font-bold text-zinc-700">
                        Hình ảnh sản phẩm (URL / Link):
                      </label>
                      <div className="flex items-center gap-2.5">
                        <div className="w-12 h-12 rounded-xl bg-orange-50/80 border border-orange-200 flex-shrink-0 flex items-center justify-center overflow-hidden">
                          {formData.imageUrl ? (
                            <img 
                              src={formData.imageUrl} 
                              alt="Preview" 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <Smartphone className="w-5 h-5 text-orange-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <input
                            type="url"
                            placeholder="https://images.unsplash.com/... hoặc link ảnh CDN"
                            value={formData.imageUrl || ''}
                            onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 focus:border-orange-500 rounded-lg text-xs font-mono"
                          />
                          <p className="text-[10px] text-zinc-400 mt-0.5">Dán đường dẫn ảnh đại diện hiển thị trong danh mục</p>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </form>
            </div>

            {/* Modal Sticky Footer */}
            <div className="bg-white border-t border-zinc-200 px-4 py-2.5 sm:py-3 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-zinc-400 hidden sm:inline">
                * Giá bán lẻ không bắt buộc, có thể cập nhật sau khi nhập kho
              </span>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-3.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Hủy Bỏ
                </button>

                {!editingItem && (
                  <button
                    type="button"
                    onClick={() => handleSaveForm(undefined, true)}
                    className="px-3.5 py-1.5 bg-zinc-900 hover:bg-black text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Lưu & Tạo Tiếp
                  </button>
                )}

                <button
                  type="submit"
                  form="sku-single-form"
                  className="px-5 py-1.5 bg-gradient-to-r from-[#F94A1F] to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black text-xs rounded-xl shadow-md active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingItem ? 'Lưu Thay Đổi' : 'Lưu Mã SKU'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= 6. QUICK ADD SUBCATEGORY MODAL ================= */}
      {isAddSubModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-orange-200 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-orange-100 text-orange-600 rounded-xl">
                  <FolderTree className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-zinc-900">Thêm Danh Mục Con Mới</h3>
                  <p className="text-[11px] text-zinc-500">Mở rộng cấp bậc phân loại Phone House</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAddSubModalOpen(false)}
                className="w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleFormCreateSubCategory} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Thuộc Danh mục Cha: <span className="text-rose-500">*</span>
                </label>
                <select
                  value={newSubParent}
                  onChange={(e) => setNewSubParent(e.target.value as any)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold"
                >
                  <option value="DEVICE">📱 Thiết Bị (Máy iPhone / iPad / Mac)</option>
                  <option value="PART">🔧 Linh Kiện Thay Thế</option>
                  <option value="ACCESSORY">🎧 Phụ Kiện Apple</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Tên Danh mục Con: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: iPhone 16 Series, Màn Hình OLED GX, Sạc Nhanh 35W..."
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-orange-500 rounded-xl text-xs font-bold focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Mã tiền tố (Prefix Code):
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: IP16, MAN, SAC, PIN..."
                  value={newSubCode}
                  onChange={(e) => setNewSubCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono font-bold uppercase"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsAddSubModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl transition-colors"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Tạo Danh Mục Con
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= 7. DEDICATED BATCH MATRIX GENERATOR MODAL ================= */}
      <BatchVariantGeneratorModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        subCategories={subCategories}
        onAddItems={handleBatchAddItems}
        onToast={showToast}
      />

      {/* ================= 8. MANAGE SUBCATEGORIES MODAL (EDIT / DELETE / ADD) ================= */}
      <ManageSubCategoriesModal
        isOpen={isManageSubModalOpen}
        onClose={() => setIsManageSubModalOpen(false)}
        subCategories={subCategories}
        items={items}
        onUpdateSubCategory={handleUpdateSubCategory}
        onDeleteSubCategory={handleDeleteSubCategory}
        onCreateSubCategory={handleCreateSubCategory}
        onToast={showToast}
      />

      {/* ================= 9. DELETE CONFIRMATION MODAL ================= */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-rose-200 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-zinc-900">Xác nhận xóa mã hàng hóa?</h3>
            <p className="text-xs text-zinc-500">
              Mã SKU này sẽ bị xóa khỏi danh mục gốc. Các đơn hàng và máy đã nhập trước đó vẫn được lưu giữ.
            </p>
            <div className="flex items-center justify-center space-x-2 pt-2">
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
