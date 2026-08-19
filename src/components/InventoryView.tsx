import { DeviceImageThumbnail } from "./DeviceImageThumbnail";
import React, { useState, useMemo } from 'react';
import { 
  DeviceItem, 
  StoreBranch, 
  WarehouseInfo, 
  WAREHOUSE_LIST, 
  Partner, 
  FundAccount, 
  CashTransaction, 
  StockTransferSlip, 
  WarrantyTicket, 
  SalesInvoice, 
  UserAccount, 
  PurchaseOrder 
} from '../types';
import { 
  Smartphone, 
  Search, 
  Plus, 
  Box, 
  Layers, 
  PieChart, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  Filter, 
  SlidersHorizontal, 
  MoreVertical, 
  Copy, 
  Check, 
  ShoppingCart, 
  Printer, 
  Trash2, 
  Edit2, 
  Eye, 
  EyeOff, 
  BarChart3, 
  Boxes, 
  TrendingUp, 
  Sparkles,
  X,
  Building2,
  Warehouse,
  ArrowLeftRight,
  Camera,
  Image as ImageIcon,
  History,
  ShieldCheck,
  UserCheck,
  LayoutGrid,
  Table2,
  Battery,
  Zap,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  MapPin
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { UniformEntryForm } from './UniformEntryForm';
import { WarehouseVsBranchAnalysisModal } from './WarehouseVsBranchAnalysisModal';
import { DeviceDetailModal } from './DeviceDetailModal';

interface InventoryViewProps {
  devices: DeviceItem[];
  branches?: StoreBranch[];
  warehouses?: WarehouseInfo[];
  partners?: Partner[];
  funds?: FundAccount[];
  transfers?: StockTransferSlip[];
  warrantyTickets?: WarrantyTicket[];
  invoices?: SalesInvoice[];
  users?: UserAccount[];
  selectedBranchId?: string;
  onSelectBranchId?: (branchId: string) => void;
  onAddDevice: (device: DeviceItem) => void;
  onAddMultipleDevices?: (devices: DeviceItem[]) => void;
  onAddPurchaseOrder?: (order: PurchaseOrder, autoCreateDevices: boolean) => void;
  onUpdateDevice: (device: DeviceItem) => void;
  onDeleteDevice: (id: string) => void;
  onQuickSell: (device: DeviceItem) => void;
  onOpenTransferModal?: (device: DeviceItem) => void;
  onAddCashTransaction?: (tx: CashTransaction) => void;
  onUpdatePartner?: (partner: Partner) => void;
  onAddPartner?: (partner: Partner) => void;
  catalogItems?: import('../types').MasterCatalogItem[];
  currentUser?: UserAccount | null;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  devices,
  branches = [],
  warehouses = [],
  partners = [],
  funds = [],
  transfers = [],
  warrantyTickets = [],
  invoices = [],
  users = [],
  selectedBranchId = 'ALL',
  onSelectBranchId,
  onAddDevice,
  onAddMultipleDevices,
  onAddPurchaseOrder,
  onUpdateDevice,
  onDeleteDevice,
  onQuickSell,
  onOpenTransferModal,
  onAddCashTransaction,
  onUpdatePartner,
  onAddPartner,
  catalogItems = [],
  currentUser
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeries, setSelectedSeries] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedCondition, setSelectedCondition] = useState('ALL');
  const [showCostPrice, setShowCostPrice] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [previewingPhoto, setPreviewingPhoto] = useState<string | null>(null);
  const [selectedDeviceForBarcode, setSelectedDeviceForBarcode] = useState<DeviceItem | null>(null);
  const [selectedDeviceForDetail, setSelectedDeviceForDetail] = useState<DeviceItem | null>(null);
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [selectedChartModel, setSelectedChartModel] = useState<string | null>(null);
  const [activeMenuDeviceId, setActiveMenuDeviceId] = useState<string | null>(null);
  const [copiedImei, setCopiedImei] = useState<string | null>(null);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'IN_STOCK_ONLY' | 'NEW_ARRIVALS' | 'HIGH_BATTERY' | 'AGING_STOCK' | 'LIKE_NEW'>('ALL');

  // 1. Accurate Device to Branch Resolver
  const getDeviceBranchInfo = (dev: DeviceItem): { id: string; name: string; shortName: string } => {
    // A. Match direct branchId
    if (dev.branchId) {
      const b = branches.find(item => item.id === dev.branchId);
      if (b) return { id: b.id, name: b.name, shortName: b.name.replace(/^Phone\s*House\s*/i, '').replace(/^PhoneHouse\s*/i, '').trim() };
    }
    // B. Match warehouseId linked to branch or parent warehouse
    if (dev.warehouse) {
      const b = branches.find(item => item.warehouseId === dev.warehouse || item.id === dev.warehouse);
      if (b) return { id: b.id, name: b.name, shortName: b.name.replace(/^Phone\s*House\s*/i, '').replace(/^PhoneHouse\s*/i, '').trim() };
      
      const w = warehouses.find(item => item.id === dev.warehouse);
      if (w) {
        if (w.parentWarehouseId) {
          const pb = branches.find(item => item.id === w.parentWarehouseId || item.warehouseId === w.parentWarehouseId);
          if (pb) return { id: pb.id, name: pb.name, shortName: pb.name.replace(/^Phone\s*House\s*/i, '').replace(/^PhoneHouse\s*/i, '').trim() };
        }
        return { id: w.id, name: w.name, shortName: w.shortName || w.name };
      }
    }
    // C. Match branch string field
    if (dev.branch) {
      const b = branches.find(item => item.name === dev.branch || dev.branch?.includes(item.name) || item.name.includes(dev.branch!));
      if (b) return { id: b.id, name: b.name, shortName: b.name.replace(/^Phone\s*House\s*/i, '').replace(/^PhoneHouse\s*/i, '').trim() };
      return { id: 'custom', name: dev.branch, shortName: dev.branch.replace(/^Phone\s*House\s*/i, '').replace(/^PhoneHouse\s*/i, '').trim() };
    }
    // D. Default to primary branch
    const defaultBranch = branches[0];
    return defaultBranch 
      ? { id: defaultBranch.id, name: defaultBranch.name, shortName: defaultBranch.name.replace(/^Phone\s*House\s*/i, '').replace(/^PhoneHouse\s*/i, '').trim() }
      : { id: 'CN01', name: 'Chi Nhánh 1', shortName: 'CN1' };
  };

  // Active warehouse options
  const activeWarehouses = useMemo(() => {
    if (warehouses && warehouses.length > 0) return warehouses;
    return WAREHOUSE_LIST;
  }, [warehouses]);

  // Real Branch In-Stock Counts for Branch Bar
  const branchStockCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: 0 };
    devices.forEach(d => {
      if (d.status === 'in_stock') {
        counts.ALL = (counts.ALL || 0) + 1;
        const branchInfo = getDeviceBranchInfo(d);
        counts[branchInfo.id] = (counts[branchInfo.id] || 0) + 1;
      }
    });
    return counts;
  }, [devices, branches, warehouses]);

  // 2. Base Scoped Devices based on global selectedBranchId
  const branchScopedDevices = useMemo(() => {
    if (selectedBranchId === 'ALL' || !selectedBranchId) {
      return devices;
    }
    return devices.filter(d => {
      const bInfo = getDeviceBranchInfo(d);
      return bInfo.id === selectedBranchId || d.branchId === selectedBranchId || d.warehouse === selectedBranchId;
    });
  }, [devices, selectedBranchId, branches, warehouses]);

  // In-stock devices in current scope
  const inStockDevices = useMemo(() => {
    return branchScopedDevices.filter(d => d.status === 'in_stock');
  }, [branchScopedDevices]);

  // Distinct models count
  const distinctModelsCount = useMemo(() => {
    return new Set(inStockDevices.map(d => d.model)).size;
  }, [inStockDevices]);

  // Accurate Financial Calculations
  const totalStockCostValue = useMemo(() => {
    return inStockDevices.reduce((sum, d) => sum + (d.buyPrice || (d as any).costPrice || 0), 0);
  }, [inStockDevices]);

  const totalStockSellingValue = useMemo(() => {
    return inStockDevices.reduce((sum, d) => sum + (d.sellPrice || 0), 0);
  }, [inStockDevices]);

  const potentialGrossProfit = Math.max(0, totalStockSellingValue - totalStockCostValue);

  // Aging Stock (> 30 days)
  const thirtyDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  }, []);

  const agingDevices = useMemo(() => {
    return inStockDevices.filter(d => d.receivedDate && d.receivedDate < thirtyDaysAgoStr);
  }, [inStockDevices, thirtyDaysAgoStr]);

  const agingStockCost = useMemo(() => {
    return agingDevices.reduce((sum, d) => sum + (d.buyPrice || (d as any).costPrice || 0), 0);
  }, [agingDevices]);

  // Condition breakdown
  const conditionStats = useMemo(() => {
    const total = inStockDevices.length || 1;
    const likeNew = inStockDevices.filter(d => d.condition === 'Like New 99%' || d.condition?.includes('99%')).length;
    const newSeal = inStockDevices.filter(d => d.condition === 'New Seal').length;
    const other = inStockDevices.length - likeNew - newSeal;

    return {
      likeNewCount: likeNew,
      likeNewPct: Math.round((likeNew / total) * 100),
      newSealCount: newSeal,
      newSealPct: Math.round((newSeal / total) * 100),
      otherCount: other,
      otherPct: Math.round((other / total) * 100)
    };
  }, [inStockDevices]);

  // Model stock data for chart
  const modelStockData = useMemo(() => {
    const modelMap: Record<string, { model: string; shortModel: string; totalCount: number; newSeal: number; likeNew: number; otherCondition: number }> = {};
    inStockDevices.forEach(d => {
      const modelName = d.model || 'Khác';
      if (!modelMap[modelName]) {
        modelMap[modelName] = {
          model: modelName,
          shortModel: modelName.replace(/^iPhone\s+/i, ''),
          totalCount: 0,
          newSeal: 0,
          likeNew: 0,
          otherCondition: 0
        };
      }
      modelMap[modelName].totalCount += 1;
      if (d.condition === 'New Seal') modelMap[modelName].newSeal += 1;
      else if (d.condition === 'Like New 99%' || d.condition?.includes('99%')) modelMap[modelName].likeNew += 1;
      else modelMap[modelName].otherCondition += 1;
    });

    return Object.values(modelMap).sort((a, b) => b.totalCount - a.totalCount);
  }, [inStockDevices]);

  // Filtered devices with Search, Series, Condition, Quick Filters
  const filteredDevices = useMemo(() => {
    return branchScopedDevices.filter(d => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch = 
        !q ||
        d.imei.toLowerCase().includes(q) ||
        (d.serialNo && d.serialNo.toLowerCase().includes(q)) ||
        d.model.toLowerCase().includes(q) ||
        d.color.toLowerCase().includes(q) ||
        (d.supplier && d.supplier.toLowerCase().includes(q)) ||
        (d.customerName && d.customerName.toLowerCase().includes(q));

      const matchesSeries = 
        selectedSeries === 'ALL' ||
        (selectedSeries === '16' && d.model.includes('16')) ||
        (selectedSeries === '15' && d.model.includes('15')) ||
        (selectedSeries === '14' && d.model.includes('14')) ||
        (selectedSeries === '13' && d.model.includes('13')) ||
        (selectedSeries === '12' && d.model.includes('12')) ||
        (selectedSeries === 'OTHER' && !['16', '15', '14', '13', '12'].some(v => d.model.includes(v)));

      const matchesStatus = selectedStatus === 'ALL' || d.status === selectedStatus;
      const matchesCondition = selectedCondition === 'ALL' || d.condition === selectedCondition;
      const matchesChartModel = !selectedChartModel || d.model === selectedChartModel;

      if (quickFilter === 'IN_STOCK_ONLY' && d.status !== 'in_stock') return false;
      if (quickFilter === 'HIGH_BATTERY' && (d.batteryHealth || 0) < 90) return false;
      if (quickFilter === 'LIKE_NEW' && !d.condition.includes('99%')) return false;
      if (quickFilter === 'NEW_ARRIVALS' && !d.condition.includes('New Seal')) return false;
      if (quickFilter === 'AGING_STOCK' && (!d.receivedDate || d.receivedDate >= thirtyDaysAgoStr)) return false;

      return matchesSearch && matchesSeries && matchesStatus && matchesCondition && matchesChartModel;
    });
  }, [branchScopedDevices, searchTerm, selectedSeries, selectedStatus, selectedCondition, selectedChartModel, quickFilter, thirtyDaysAgoStr]);

  // Group devices by Model + Storage + Color
  const groupedDevices = useMemo(() => {
    const groups: Record<string, {
      id: string;
      model: string;
      storage: string;
      color: string;
      devices: DeviceItem[];
      minPrice: number;
      maxPrice: number;
      minCost: number;
      maxCost: number;
      inStockCount: number;
      totalCount: number;
      branchBreakdown: Record<string, number>;
    }> = {};

    filteredDevices.forEach(d => {
      const key = `${d.model}-${d.storage}-${d.color}`;
      if (!groups[key]) {
        groups[key] = {
          id: key,
          model: d.model,
          storage: d.storage,
          color: d.color,
          devices: [],
          minPrice: d.sellPrice,
          maxPrice: d.sellPrice,
          minCost: d.buyPrice || 0,
          maxCost: d.buyPrice || 0,
          inStockCount: 0,
          totalCount: 0,
          branchBreakdown: {}
        };
      }
      
      groups[key].devices.push(d);
      groups[key].totalCount += 1;
      
      if (d.sellPrice < groups[key].minPrice) groups[key].minPrice = d.sellPrice;
      if (d.sellPrice > groups[key].maxPrice) groups[key].maxPrice = d.sellPrice;
      if (d.buyPrice && d.buyPrice < groups[key].minCost) groups[key].minCost = d.buyPrice;
      if (d.buyPrice && d.buyPrice > groups[key].maxCost) groups[key].maxCost = d.buyPrice;
      
      if (d.status === 'in_stock') {
        groups[key].inStockCount += 1;
        const bInfo = getDeviceBranchInfo(d);
        groups[key].branchBreakdown[bInfo.shortName] = (groups[key].branchBreakdown[bInfo.shortName] || 0) + 1;
      }
    });

    return Object.values(groups).sort((a, b) => b.model.localeCompare(a.model) || b.inStockCount - a.inStockCount);
  }, [filteredDevices, branches, warehouses]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  const handleCopyImei = (imei: string) => {
    navigator.clipboard.writeText(imei);
    setCopiedImei(imei);
    setTimeout(() => setCopiedImei(null), 2000);
  };

  const getStatusBadge = (status: DeviceItem['status']) => {
    switch (status) {
      case 'in_stock':
        return (
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-bold text-[10px] px-2 py-0.5 rounded-full flex items-center space-x-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
            <span>Sẵn hàng</span>
          </span>
        );
      case 'reserved':
        return (
          <span className="bg-amber-50 text-amber-700 border border-amber-200/80 font-bold text-[10px] px-2 py-0.5 rounded-full flex items-center space-x-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            <span>Đã cọc</span>
          </span>
        );
      case 'sold':
        return (
          <span className="bg-zinc-100 text-zinc-500 border border-zinc-200 font-bold text-[10px] px-2 py-0.5 rounded-full flex items-center space-x-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 inline-block" />
            <span>Đã bán</span>
          </span>
        );
      case 'warranty':
      case 'repairing':
        return (
          <span className="bg-rose-50 text-rose-600 border border-rose-200 font-bold text-[10px] px-2 py-0.5 rounded-full flex items-center space-x-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
            <span>Bảo hành</span>
          </span>
        );
      default:
        return null;
    }
  };

  // Currency Formatter Helper
  const formatCompactVND = (num: number) => {
    if (num >= 1_000_000_000) {
      return `${(num / 1_000_000_000).toFixed(2)} Tỷ`;
    }
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(1).replace('.0', '')} Tr`;
    }
    return num.toLocaleString('vi-VN') + ' đ';
  };

  return (
    <div className="w-full space-y-3.5 sm:space-y-4 pb-20">
      
      {/* 1. Header Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-lg sm:text-2xl font-black text-zinc-950 tracking-tight">
              Quản Lý Kho IMEI
            </h1>
            <span className="bg-orange-50 text-[#ff4b16] border border-orange-200 text-xs font-black px-2.5 py-0.5 rounded-full">
              {inStockDevices.length} máy sẵn sàng
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-zinc-500 font-medium mt-0.5">
            Dữ liệu định danh 100% thời gian thực theo từng cây IMEI.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsAnalysisModalOpen(true)}
            className="bg-white hover:bg-orange-50 text-zinc-700 hover:text-[#ff4b16] border border-zinc-200/80 text-xs font-bold px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-2xl flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-[#ff4b16]" />
            <span className="hidden sm:inline">Phân Tích Chi Nhánh</span>
            <span className="sm:hidden">Phân Tích</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-gradient-to-r from-orange-500 to-[#ff4b16] hover:brightness-110 text-white text-xs font-black px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl flex items-center space-x-1.5 shadow-md shadow-orange-500/25 transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Nhập Hàng / IMEI</span>
          </button>
        </div>
      </div>

      {/* 2. Unified Branch Switcher Bar */}
      {branches.length > 0 && (
        <div className="bg-white p-1.5 sm:p-2 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            
            {/* Option: Gộp Tất Cả Các Shop */}
            <button
              onClick={() => onSelectBranchId?.('ALL')}
              className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center space-x-1.5 cursor-pointer ${
                selectedBranchId === 'ALL'
                  ? 'bg-zinc-950 text-white shadow-sm'
                  : 'bg-zinc-100/70 text-zinc-700 hover:bg-zinc-200/70'
              }`}
            >
              <Building2 className={`w-3.5 h-3.5 ${selectedBranchId === 'ALL' ? 'text-[#ff4b16]' : 'text-zinc-500'}`} />
              <span>Toàn Hệ Thống (Gộp tất cả)</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-black ${
                selectedBranchId === 'ALL' ? 'bg-[#ff4b16] text-white' : 'bg-zinc-200 text-zinc-800'
              }`}>
                {branchStockCounts.ALL || devices.filter(d => d.status === 'in_stock').length}
              </span>
            </button>

            {/* Individual Branches */}
            {branches.map(b => {
              const count = branchStockCounts[b.id] || 0;
              const isSelected = selectedBranchId === b.id;
              const shortName = b.name.replace(/^Phone\s*House\s*/i, '').replace(/^PhoneHouse\s*/i, '').trim();

              return (
                <button
                  key={b.id}
                  onClick={() => onSelectBranchId?.(b.id)}
                  className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center space-x-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-[#ff4b16] text-white shadow-md shadow-orange-500/25'
                      : 'bg-zinc-100/70 text-zinc-700 hover:bg-orange-50 hover:text-[#ff4b16]'
                  }`}
                >
                  <MapPin className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-[#ff4b16]'}`} />
                  <span>{shortName}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-black ${
                    isSelected ? 'bg-white text-[#ff4b16]' : 'bg-zinc-200 text-zinc-800'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. 4 Cockpit Executive KPI Cards (Redesigned & Mobile Optimized) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        
        {/* Card 1: Máy Sẵn Bán */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-zinc-200/80 shadow-2xs space-y-1.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-500 font-bold">
            <span className="truncate">Sẵn Xuất Quầy</span>
            <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-mono font-bold text-[10px] shrink-0">
              {distinctModelsCount} Model
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-zinc-950 flex items-baseline space-x-1">
            <span>{inStockDevices.length}</span>
            <span className="text-xs font-sans text-zinc-400 font-medium">máy</span>
          </div>
          <div className="text-[10px] sm:text-[11px] text-zinc-500 font-medium truncate pt-0.5 border-t border-zinc-100">
            🔥 Seal: <b className="text-zinc-900 font-mono">{conditionStats.newSealCount}</b> • ✨ 99%: <b className="text-zinc-900 font-mono">{conditionStats.likeNewCount}</b>
          </div>
        </div>

        {/* Card 2: Vốn Tồn Kho */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-zinc-200/80 shadow-2xs space-y-1.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-500 font-bold">
            <span className="truncate">Vốn Tồn Kho</span>
            <button
              onClick={() => setShowCostPrice(!showCostPrice)}
              className="text-zinc-400 hover:text-zinc-700 p-0.5 rounded cursor-pointer shrink-0"
              title={showCostPrice ? 'Ẩn giá vốn' : 'Hiện giá vốn'}
            >
              {showCostPrice ? <EyeOff className="w-3.5 h-3.5 text-zinc-600" /> : <Eye className="w-3.5 h-3.5 text-[#ff4b16]" />}
            </button>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-zinc-950 truncate">
            {showCostPrice ? (
              formatCompactVND(totalStockCostValue)
            ) : (
              <span className="tracking-widest text-zinc-400 text-base sm:text-lg">•••••••• đ</span>
            )}
          </div>
          <div className="text-[10px] sm:text-[11px] text-zinc-400 font-medium truncate pt-0.5 border-t border-zinc-100">
            {showCostPrice ? `Vốn nhập: ${totalStockCostValue.toLocaleString('vi-VN')} đ` : 'Chạm 👁️ để mở khóa giá'}
          </div>
        </div>

        {/* Card 3: Giá Trị Bán & Lợi Nhuận */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-zinc-200/80 shadow-2xs space-y-1.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-500 font-bold">
            <span className="truncate">Giá Trị Bán</span>
            <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-mono font-bold text-[10px] shrink-0">
              LN: +{formatCompactVND(potentialGrossProfit)}
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-zinc-950 truncate">
            {formatCompactVND(totalStockSellingValue)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-emerald-600 font-bold truncate pt-0.5 border-t border-zinc-100">
            Lợi nhuận dự kiến: +{potentialGrossProfit.toLocaleString('vi-VN')} đ
          </div>
        </div>

        {/* Card 4: Tồn Kho >30 Ngày */}
        <div className={`p-3.5 sm:p-4 rounded-2xl border shadow-2xs space-y-1.5 flex flex-col justify-between ${
          agingDevices.length > 0 ? 'bg-rose-50/50 border-rose-200/80' : 'bg-white border-zinc-200/80'
        }`}>
          <div className="flex items-center justify-between text-xs font-bold">
            <span className={agingDevices.length > 0 ? 'text-rose-700' : 'text-zinc-500'}>
              Tồn &gt;30 Ngày
            </span>
            {agingDevices.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-rose-500 text-white font-mono font-bold text-[10px] shrink-0">
                Cần xả
              </span>
            )}
          </div>
          <div className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${agingDevices.length > 0 ? 'text-rose-600' : 'text-zinc-950'}`}>
            {agingDevices.length} <span className="text-xs font-sans font-medium text-zinc-400">máy</span>
          </div>
          <div className={`text-[10px] sm:text-[11px] font-medium truncate pt-0.5 border-t ${agingDevices.length > 0 ? 'border-rose-200/60 text-rose-600 font-bold' : 'border-zinc-100 text-zinc-400'}`}>
            {agingDevices.length > 0 ? `Đọng vốn ~${(agingStockCost / 1_000_000).toFixed(0)}Tr VNĐ` : '✅ Vòng quay kho tốt'}
          </div>
        </div>
      </div>

      {/* 4. Chart Analytics Toggle Bar */}
      <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-zinc-200/80 shadow-2xs flex items-center justify-between">
        <button
          onClick={() => setIsChartExpanded(!isChartExpanded)}
          className="text-xs font-bold text-zinc-700 hover:text-[#ff4b16] transition-colors flex items-center space-x-1.5 cursor-pointer"
        >
          <BarChart3 className="w-4 h-4 text-[#ff4b16]" />
          <span>{isChartExpanded ? 'Thu gọn biểu đồ' : 'Biểu đồ cơ cấu Model & Ngoại hình'}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isChartExpanded ? 'rotate-180 text-[#ff4b16]' : ''}`} />
        </button>

        <span className="text-[10px] sm:text-[11px] text-zinc-400 font-medium truncate">
          {selectedBranchId === 'ALL' ? 'Toàn hệ thống' : 'Chi nhánh đang lọc'}
        </span>
      </div>

      {/* Extended Chart Analytics */}
      {isChartExpanded && (
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900">
              Phân Phối Tồn Kho Theo Model (Seal / 99% / Khác)
            </h3>
            {selectedChartModel && (
              <button
                onClick={() => setSelectedChartModel(null)}
                className="text-[11px] bg-orange-50 text-[#ff4b16] px-2.5 py-1 rounded-xl font-bold cursor-pointer"
              >
                Xóa lọc ({selectedChartModel}) ✕
              </button>
            )}
          </div>

          <div className="h-60 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={modelStockData}
                margin={{ top: 10, right: 10, left: -25, bottom: 20 }}
                onClick={(data: any) => {
                  if (data && data.activePayload && data.activePayload[0]) {
                    const clickedModel = data.activePayload[0].payload.model;
                    setSelectedChartModel(selectedChartModel === clickedModel ? null : clickedModel);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="shortModel" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-zinc-900 text-white p-3 rounded-2xl shadow-xl text-xs space-y-1.5">
                          <div className="font-bold text-[#ff4b16] border-b border-zinc-700 pb-1">{d.model} ({d.totalCount} máy)</div>
                          <div>New Seal: <strong className="text-amber-400">{d.newSeal}</strong></div>
                          <div>Like New 99%: <strong className="text-orange-400">{d.likeNew}</strong></div>
                          {d.otherCondition > 0 && <div>Khác: <strong>{d.otherCondition}</strong></div>}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar name="New Seal" dataKey="newSeal" stackId="a" fill="#f59e0b" cursor="pointer" />
                <Bar name="Like New 99%" dataKey="likeNew" stackId="a" fill="#ff4b16" cursor="pointer" />
                <Bar name="Khác" dataKey="otherCondition" stackId="a" fill="#a1a1aa" radius={[4, 4, 0, 0]} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 5. Command Bar: Search, Quick Chips & View Switcher */}
      <div className="space-y-2">
        
        {/* Search Bar + Mode Switcher */}
        <div className="flex items-center space-x-1.5 sm:space-x-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm IMEI, Serial, Model, Màu sắc, NCC..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-zinc-200/80 rounded-xl pl-8 pr-8 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[#ff4b16] shadow-2xs font-medium transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* View Mode (Grouped Table vs Cards) */}
          <div className="flex items-center bg-white p-0.5 sm:p-1 rounded-xl border border-zinc-200/80 shadow-2xs shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 sm:p-2 rounded-lg transition-all cursor-pointer ${
                viewMode === 'table' ? 'bg-zinc-950 text-white shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
              }`}
              title="Xem dạng Bảng Gom Model"
            >
              <Table2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-1.5 sm:p-2 rounded-lg transition-all cursor-pointer ${
                viewMode === 'cards' ? 'bg-zinc-950 text-white shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
              }`}
              title="Xem dạng Thẻ Máy"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Advanced Filters Button */}
          <button
            onClick={() => setShowFilterDrawer(!showFilterDrawer)}
            className={`p-2 rounded-xl border transition-all cursor-pointer shrink-0 ${
              showFilterDrawer 
                ? 'bg-[#ff4b16] text-white border-transparent' 
                : 'bg-white text-zinc-700 border-zinc-200/80 hover:bg-zinc-50 shadow-2xs'
            }`}
            title="Bộ lọc nâng cao"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* Series Pill Tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {[
            { id: 'ALL', label: 'Tất cả model' },
            { id: '16', label: 'iPhone 16 Series' },
            { id: '15', label: 'iPhone 15 Series' },
            { id: '14', label: 'iPhone 14 Series' },
            { id: '13', label: 'iPhone 13 Series' },
            { id: '12', label: 'iPhone 12 Series' },
            { id: 'OTHER', label: 'Dòng khác' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedSeries(item.id)}
              className={`text-xs px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedSeries === item.id
                  ? 'bg-zinc-950 text-white shadow-xs'
                  : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200/80'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* 1-Tap Quick Filter Chips */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-0.5 text-xs scrollbar-none">
          {[
            { id: 'ALL', label: 'Tất cả' },
            { id: 'IN_STOCK_ONLY', label: '⚡ Sẵn hàng xuất quầy' },
            { id: 'NEW_ARRIVALS', label: '🔥 New Seal' },
            { id: 'LIKE_NEW', label: '✨ Like New 99%' },
            { id: 'HIGH_BATTERY', label: '🔋 Pin Trâu (≥90%)' },
            { id: 'AGING_STOCK', label: '⏳ Tồn lâu (>30N)' }
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setQuickFilter(chip.id as any)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                quickFilter === chip.id
                  ? 'bg-[#ff4b16] text-white shadow-xs'
                  : 'bg-white hover:bg-orange-50 text-zinc-600 border border-zinc-200/80'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Advanced Filter Drawer */}
        {showFilterDrawer && (
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-zinc-200 shadow-sm grid grid-cols-2 gap-2.5 text-xs animate-in fade-in zoom-in-95 duration-150">
            <div>
              <label className="block text-[11px] font-bold text-zinc-600 mb-1">Trạng thái máy</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 font-bold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="in_stock">Sẵn hàng (Trong kho)</option>
                <option value="reserved">Đã giữ cọc</option>
                <option value="sold">Đã xuất bán</option>
                <option value="warranty">Đang bảo hành / sửa chữa</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-600 mb-1">Tình trạng ngoại quan</label>
              <select
                value={selectedCondition}
                onChange={(e) => setSelectedCondition(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 font-bold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
              >
                <option value="ALL">Mọi tình trạng</option>
                <option value="New Seal">New Seal</option>
                <option value="Like New 99%">Like New 99%</option>
                <option value="98% Cấn Nhẹ">98% Cấn Nhẹ</option>
                <option value="95% Trầy Xước">95% Trầy Xước</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 6. List of Devices: Grouped Model View OR Cards Grid View */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredDevices.length === 0 ? (
            <div className="col-span-full p-10 text-center bg-white rounded-3xl border border-zinc-200/80 text-zinc-400 text-xs font-medium">
              Không tìm thấy cây máy nào khớp với điều kiện tìm kiếm.
            </div>
          ) : (
            filteredDevices.map((device) => {
              const battery = device.batteryHealth || 100;
              const batteryColor = battery >= 90 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : battery >= 80 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-rose-700 bg-rose-50 border-rose-200';
              const branchInfo = getDeviceBranchInfo(device);
              const isAging = device.receivedDate && device.receivedDate < thirtyDaysAgoStr;
              
              return (
                <div 
                  key={device.id}
                  className="bg-white rounded-2xl sm:rounded-3xl p-3.5 border border-zinc-200/80 shadow-2xs hover:border-orange-300 hover:shadow-md transition-all flex flex-col justify-between space-y-2.5 relative group"
                >
                  <div className="flex items-start space-x-2.5">
                    <div className="shrink-0">
                      <DeviceImageThumbnail model={device.model} color={device.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#ff4b16] bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100 truncate">
                          🏪 {branchInfo.shortName}
                        </span>
                        {getStatusBadge(device.status)}
                      </div>
                      <h4 className="font-black text-zinc-950 text-xs sm:text-sm tracking-tight truncate group-hover:text-[#ff4b16] transition-colors mt-1">
                        {device.model}
                      </h4>
                      <p className="text-[11px] text-zinc-500 font-medium truncate">
                        {device.storage} • {device.color}
                      </p>
                    </div>
                  </div>

                  {/* Device Specs Chips */}
                  <div className="flex flex-wrap gap-1 text-[10px] font-bold">
                    <span className={`px-2 py-0.5 rounded-md border flex items-center gap-1 ${batteryColor}`}>
                      <Battery className="w-3 h-3" />
                      <span>Pin {battery}%</span>
                    </span>
                    <span className="bg-zinc-100 text-zinc-800 px-2 py-0.5 rounded-md border border-zinc-200 font-mono">
                      *{device.imei.slice(-6)}
                    </span>
                    <span className="bg-orange-50 text-orange-800 px-2 py-0.5 rounded-md border border-orange-200">
                      {device.condition}
                    </span>
                    {isAging && (
                      <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md border border-rose-200 font-bold flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>Tồn &gt;30N</span>
                      </span>
                    )}
                  </div>

                  {/* Price & Quick Actions */}
                  <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] text-zinc-400 font-bold uppercase">Giá Niêm Yết:</div>
                      <div className="text-xs sm:text-sm font-black text-[#ff4b16] font-mono truncate">
                        {(device.sellPrice || 0).toLocaleString('vi-VN')} đ
                      </div>
                      {showCostPrice && (
                        <div className="text-[10px] text-zinc-400 font-mono truncate">
                          Vốn: {(device.buyPrice || 0).toLocaleString('vi-VN')} đ
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      {device.status === 'in_stock' && (
                        <button
                          type="button"
                          onClick={() => onQuickSell(device)}
                          className="px-2.5 py-1.5 bg-[#ff4b16] hover:bg-[#e03d14] text-white rounded-xl text-xs font-bold flex items-center space-x-1 shadow-xs transition-all cursor-pointer active:scale-95"
                          title="Bán ngay trên POS"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          <span>Bán</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedDeviceForDetail(device)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
                        title="Xem chi tiết máy"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-2.5 sm:space-y-3">
          {groupedDevices.length === 0 ? (
            <div className="p-10 text-center bg-white rounded-3xl border border-zinc-200/80 text-zinc-400 text-xs font-medium">
              Không tìm thấy cây máy nào khớp với điều kiện tìm kiếm.
            </div>
          ) : (
            groupedDevices.map((group) => {
              const isExpanded = expandedGroups.includes(group.id);
              const priceRange = group.minPrice === group.maxPrice 
                ? `${group.minPrice.toLocaleString('vi-VN')} đ`
                : `${group.minPrice.toLocaleString('vi-VN')} đ - ${group.maxPrice.toLocaleString('vi-VN')} đ`;

              // Show cross-store breakdown when viewing all branches or when multiple branches exist
              const branchEntries = Object.entries(group.branchBreakdown);
              const showBreakdown = selectedBranchId === 'ALL' && branchEntries.length > 0;

              return (
                <div 
                  key={group.id} 
                  className="bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-4 border border-zinc-200/80 shadow-2xs hover:border-orange-300 transition-all space-y-2.5 relative"
                >
                  {/* Group Summary Row */}
                  <div 
                    className="flex gap-2.5 sm:gap-3.5 items-center cursor-pointer group"
                    onClick={() => toggleGroup(group.id)}
                  >
                    <div className="shrink-0">
                      <DeviceImageThumbnail model={group.model} color={group.color} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div className="min-w-0">
                          <h3 className="font-black text-zinc-950 text-xs sm:text-base tracking-tight truncate group-hover:text-[#ff4b16] transition-colors">
                            {group.model} {group.storage}
                          </h3>
                          <p className="text-[11px] sm:text-xs text-zinc-500 font-medium truncate">
                            Màu: <strong className="text-zinc-800">{group.color}</strong>
                          </p>
                        </div>
                        
                        <div className="self-start sm:self-auto bg-orange-50 text-[#ff4b16] border border-orange-200 font-black text-[10px] sm:text-xs px-2 py-0.5 rounded-full shrink-0">
                          {group.inStockCount} Sẵn / {group.totalCount} Tổng
                        </div>
                      </div>

                      {/* Cross-Store Stock Distribution Badge (Wrapping safe) */}
                      {showBreakdown && (
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] sm:text-[11px] text-zinc-600 font-bold">
                          <span className="text-zinc-400 font-normal">Tại shop:</span>
                          {branchEntries.map(([bName, bCount]) => (
                            <span key={bName} className="bg-zinc-100 text-zinc-800 px-1.5 py-0.2 rounded-md border border-zinc-200 font-mono">
                              {bName}: <b>{bCount}</b>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1.5">
                        <div className="min-w-0">
                          <span className="text-[#ff4b16] font-black text-xs sm:text-base tracking-tight font-mono truncate block sm:inline">
                            {priceRange}
                          </span>
                          {showCostPrice && group.minCost > 0 && (
                            <span className="text-[10px] text-zinc-400 font-mono sm:ml-2">
                              (Vốn: {group.minCost.toLocaleString('vi-VN')} đ)
                            </span>
                          )}
                        </div>

                        <div className="text-zinc-400 hover:text-[#ff4b16] transition-colors flex items-center text-[11px] sm:text-xs font-bold space-x-1 shrink-0">
                          <span>{isExpanded ? 'Thu gọn' : `Xem ${group.devices.length} cây`}</span>
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180 text-[#ff4b16]' : ''}`} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Individual IMEI Devices (Expanded State) */}
                  {isExpanded && (
                    <div className="pt-2.5 border-t border-zinc-100 space-y-2">
                      {group.devices.map(device => {
                        const branchInfo = getDeviceBranchInfo(device);
                        const isAging = device.receivedDate && device.receivedDate < thirtyDaysAgoStr;
                        const battery = device.batteryHealth || 100;
                        const batteryColor = battery >= 90 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : battery >= 80 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-rose-700 bg-rose-50 border-rose-200';

                        return (
                          <div 
                            key={device.id} 
                            className="bg-zinc-50/80 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 border border-zinc-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 relative"
                          >
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                {getStatusBadge(device.status)}
                                
                                {/* Branch Tag */}
                                <span className="bg-white text-zinc-800 border border-zinc-200/80 text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center space-x-1">
                                  <MapPin className="w-3 h-3 text-[#ff4b16]" />
                                  <span>{branchInfo.shortName}</span>
                                </span>

                                <span className="text-xs font-mono font-bold text-zinc-900">
                                  IMEI: {device.imei}
                                </span>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyImei(device.imei);
                                  }}
                                  className="text-zinc-400 hover:text-[#ff4b16] transition-colors cursor-pointer p-0.5"
                                  title="Sao chép IMEI"
                                >
                                  {copiedImei === device.imei ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>

                              <div className="flex items-center gap-1 flex-wrap text-[10px]">
                                <span className="font-bold px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-800 border border-orange-100">
                                  {device.condition}
                                </span>

                                <span className={`font-bold px-1.5 py-0.5 rounded-md border ${batteryColor}`}>
                                  Pin {battery}%
                                </span>

                                <span className="bg-white text-zinc-700 font-semibold px-1.5 py-0.5 rounded-md border border-zinc-200/80 font-mono">
                                  {device.region}
                                </span>

                                {device.supplier && (
                                  <span className="bg-zinc-100 text-zinc-600 font-medium px-1.5 py-0.5 rounded-md border border-zinc-200 truncate max-w-[150px]">
                                    NCC: {device.supplier}
                                  </span>
                                )}

                                {isAging && (
                                  <span className="bg-rose-50 text-rose-700 font-bold px-1.5 py-0.5 rounded-md border border-rose-200 flex items-center space-x-1">
                                    <Clock className="w-3 h-3" />
                                    <span>Tồn &gt;30N</span>
                                  </span>
                                )}

                                {device.images && device.images.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewingPhoto(device.images![0]);
                                    }}
                                    className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-950 font-bold border border-orange-300 hover:bg-orange-200 transition-colors cursor-pointer"
                                    title="Xem ảnh chụp thực tế"
                                  >
                                    <Camera className="w-3 h-3 text-[#ff4b16]" />
                                    <span>📸 {device.images.length} Ảnh</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Price & Action Row */}
                            <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto border-t sm:border-t-0 border-zinc-200/60 pt-1.5 sm:pt-0">
                              <div className="text-left sm:text-right min-w-0">
                                <div className="text-[#ff4b16] font-black text-xs sm:text-sm font-mono truncate">
                                  {(device.sellPrice || 0).toLocaleString('vi-VN')} đ
                                </div>
                                {showCostPrice && (
                                  <div className="text-[10px] text-zinc-400 font-mono truncate">
                                    Vốn: {(device.buyPrice || 0).toLocaleString('vi-VN')} đ
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center space-x-1 shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedDeviceForDetail(device);
                                  }}
                                  className="px-2 py-1 bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-lg text-[10px] sm:text-[11px] font-bold flex items-center space-x-1 transition-all cursor-pointer shadow-2xs"
                                  title="Xem Chi Tiết & Lịch Sử Máy"
                                >
                                  <History className="w-3.5 h-3.5 text-[#ff4b16]" />
                                  <span>Lịch Sử</span>
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedDeviceForBarcode(device);
                                  }}
                                  className="p-1 bg-white text-zinc-600 hover:text-[#ff4b16] border border-zinc-200 rounded-lg cursor-pointer transition-colors shadow-2xs"
                                  title="In Tem Barcode"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>

                                {device.status === 'in_stock' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onQuickSell(device);
                                    }}
                                    className="bg-[#ff4b16] hover:bg-[#e03d14] text-white text-[10px] sm:text-[11px] font-black px-2.5 py-1 rounded-lg flex items-center space-x-1 shadow-xs transition-all cursor-pointer active:scale-95"
                                    title="Bán ngay trên POS"
                                  >
                                    <ShoppingCart className="w-3 h-3" />
                                    <span>Bán</span>
                                  </button>
                                )}

                                <div className="relative">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuDeviceId(activeMenuDeviceId === device.id ? null : device.id);
                                    }}
                                    className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </button>
                                  {activeMenuDeviceId === device.id && (
                                    <div className="absolute right-0 top-8 w-32 bg-white border border-zinc-200 rounded-xl shadow-xl z-20 p-1 space-y-0.5 text-xs text-left">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onDeleteDevice(device.id);
                                          setActiveMenuDeviceId(null);
                                        }}
                                        className="w-full px-3 py-1.5 hover:bg-rose-50 text-rose-600 rounded-lg flex items-center space-x-2 font-medium cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Xóa máy</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* MODAL: Nhập Hàng Mới Uniform Entry Form */}
      <UniformEntryForm 
        currentUser={currentUser}
        catalogItems={catalogItems}
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        branches={branches}
        warehouses={activeWarehouses}
        partners={partners}
        funds={funds}
        onAddPurchaseOrder={onAddPurchaseOrder}
      />

      {/* MODAL: Phân Tích Kho vs Chi Nhánh Chuyên Sâu */}
      <WarehouseVsBranchAnalysisModal
        isOpen={isAnalysisModalOpen}
        onClose={() => setIsAnalysisModalOpen(false)}
      />

      {/* MODAL: Xem Ảnh Thực Tế Máy */}
      {previewingPhoto && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewingPhoto(null)}
        >
          <div className="relative max-w-2xl w-full bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
            <div className="p-4 bg-zinc-800 flex items-center justify-between text-white border-b border-zinc-700">
              <div className="flex items-center space-x-2">
                <Camera className="w-5 h-5 text-orange-500" />
                <span className="font-bold text-sm">Hình Ảnh Thực Tế Thiết Bị</span>
              </div>
              <button 
                onClick={() => setPreviewingPhoto(null)}
                className="p-1.5 hover:bg-zinc-700 rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-black/40 min-h-[300px]">
              <img 
                src={previewingPhoto} 
                alt="Ảnh thiết bị" 
                className="max-h-[70vh] w-auto object-contain rounded-2xl shadow-lg"
              />
            </div>
            <div className="p-3 bg-zinc-800 text-center text-xs text-zinc-400">
              Ảnh kiểm định ngoại quan khi nhập hàng được lưu trữ an toàn.
            </div>
          </div>
        </div>
      )}

      {/* MODAL: In Tem Nhãn Barcode IMEI K80 */}
      {selectedDeviceForBarcode && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-orange-200 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <span className="font-black text-sm text-zinc-950">Tem Nhãn Mã Vạch K80</span>
              <button onClick={() => setSelectedDeviceForBarcode(null)} className="text-zinc-400 hover:text-zinc-600 font-bold">✕</button>
            </div>

            <div className="bg-zinc-50 text-black p-4 rounded-xl border border-zinc-300 text-center font-sans space-y-2 shadow-inner">
              <div className="font-black text-sm tracking-tight text-[#ff4b16]">PHONE HOUSE • APPLE PREMIUM</div>
              <div className="font-bold text-xs">{selectedDeviceForBarcode.model} {selectedDeviceForBarcode.storage}</div>
              <div className="text-[10px] text-zinc-600">{selectedDeviceForBarcode.color} • {selectedDeviceForBarcode.region} • Pin {selectedDeviceForBarcode.batteryHealth}%</div>

              <div className="py-2 flex flex-col items-center">
                <div className="h-10 w-48 bg-repeat-x flex items-center justify-center border-y border-black font-mono tracking-widest text-[10px] font-bold">
                  ||| | |||| | ||| |||| | |||
                </div>
                <span className="font-mono text-xs font-black mt-1">IMEI: {selectedDeviceForBarcode.imei}</span>
              </div>

              <div className="text-sm font-black text-zinc-900 pt-1 border-t border-dashed border-zinc-300">
                {(selectedDeviceForBarcode.sellPrice || 0).toLocaleString('vi-VN')} đ
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-[#ff4b16] hover:bg-[#e03d14] text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer"
              >
                In Tem Máy
              </button>
              <button
                onClick={() => setSelectedDeviceForBarcode(null)}
                className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Chi Tiết Máy & Lịch Sử Timeline Toàn Diện */}
      {selectedDeviceForDetail && (
        <DeviceDetailModal
          device={selectedDeviceForDetail}
          isOpen={true}
          onClose={() => setSelectedDeviceForDetail(null)}
          transfers={transfers}
          warrantyTickets={warrantyTickets}
          invoices={invoices}
          warehouses={warehouses}
          users={users}
          onUpdateDevice={onUpdateDevice}
          onQuickSell={onQuickSell}
          onOpenTransferModal={onOpenTransferModal}
          onPrintBarcode={(dev) => {
            setSelectedDeviceForDetail(null);
            setSelectedDeviceForBarcode(dev);
          }}
        />
      )}
    </div>
  );
};
