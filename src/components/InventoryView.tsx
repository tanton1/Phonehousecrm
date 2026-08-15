import React, { useState, useMemo } from 'react';
import { DeviceItem } from '../types';
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
  X
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

interface InventoryViewProps {
  devices: DeviceItem[];
  onAddDevice: (device: DeviceItem) => void;
  onUpdateDevice: (device: DeviceItem) => void;
  onDeleteDevice: (id: string) => void;
  onQuickSell: (device: DeviceItem) => void;
}

// Device Image Thumbnail Component
const DeviceImageThumbnail: React.FC<{ model: string; color: string }> = ({ model, color }) => {
  const colorLower = color.toLowerCase();
  const isDesert = colorLower.includes('sa mạc') || colorLower.includes('desert');
  const isNatural = colorLower.includes('tự nhiên') || colorLower.includes('natural');
  const isBlue = colorLower.includes('xanh') || colorLower.includes('blue');
  const isPurple = colorLower.includes('tím') || colorLower.includes('purple');
  const isBlack = colorLower.includes('đen') || colorLower.includes('black');
  const isWhite = colorLower.includes('trắng') || colorLower.includes('white');

  let bgGradient = 'from-[#d2b48c] via-[#c5a059] to-[#a8823b]';
  let borderColor = '#c5a059';

  if (isDesert) {
    bgGradient = 'from-[#e2cfb7] via-[#d0b497] to-[#b79673]';
    borderColor = '#c0a588';
  } else if (isNatural) {
    bgGradient = 'from-[#cfceca] via-[#b2b1ac] to-[#8e8d88]';
    borderColor = '#9e9d98';
  } else if (isBlue) {
    bgGradient = 'from-[#3a4f66] via-[#243342] to-[#121c24]';
    borderColor = '#34495e';
  } else if (isPurple) {
    bgGradient = 'from-[#5b4a64] via-[#3c2f44] to-[#251a2d]';
    borderColor = '#5c4866';
  } else if (isBlack) {
    bgGradient = 'from-[#444444] via-[#222222] to-[#0d0d0d]';
    borderColor = '#444444';
  } else if (isWhite) {
    bgGradient = 'from-[#ffffff] via-[#f1f3f5] to-[#dee2e6]';
    borderColor = '#ced4da';
  }

  return (
    <div className="relative w-16 h-20 sm:w-20 sm:h-24 shrink-0 rounded-2xl p-1 flex items-center justify-center bg-gradient-to-b from-zinc-100 to-zinc-200 border border-zinc-200/80 shadow-xs group-hover:scale-105 transition-transform overflow-hidden">
      {/* Device Body */}
      <div 
        className={`w-full h-full rounded-xl bg-gradient-to-b ${bgGradient} relative shadow-md p-1 border flex flex-col justify-between`} 
        style={{ borderColor }}
      >
        {/* Top Camera Bump */}
        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-black/25 backdrop-blur-xs p-0.5 grid grid-cols-2 gap-0.5 border border-white/20 shadow-inner">
          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center">
            <div className="w-0.5 h-0.5 rounded-full bg-blue-900/80" />
          </div>
          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center">
            <div className="w-0.5 h-0.5 rounded-full bg-blue-900/80" />
          </div>
          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center col-span-2 mx-auto">
            <div className="w-0.5 h-0.5 rounded-full bg-blue-900/80" />
          </div>
        </div>

        {/* Apple Logo Watermark */}
        <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
          <svg className="w-3.5 h-3.5 text-white fill-current" viewBox="0 0 170 170">
            <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.34.13-9.14-1.9-14.4-6.08-3.38-2.73-7.3-7.42-11.78-14.07-6.09-9.03-10.87-19.12-14.34-30.27-3.47-11.16-5.2-21.84-5.2-32.06 0-14.54 3.66-26.28 10.98-35.22 7.32-8.94 16.54-13.48 27.67-13.62 4.79 0 10.02 1.18 15.68 3.55 5.66 2.37 9.4 3.61 11.22 3.73 1.95 0 5.86-1.32 11.73-3.95 5.88-2.63 10.88-3.87 15.01-3.72 10.32.53 18.91 4.3 25.77 11.31-9.28 5.6-13.82 13.51-13.62 23.73.26 8.08 3.34 14.88 9.24 20.4 5.9 5.52 13.06 8.65 21.48 9.39-2.12 6.27-4.8 12.51-8.04 18.72zM119.22 31.84c0-7.32 2.65-14.28 7.95-20.88 5.3-6.6 11.89-10.4 19.77-11.4 0.26 1.05.39 2.04.39 2.96 0 7.25-2.71 14.24-8.13 20.97-5.42 6.73-12.01 10.43-19.77 11.1-0.13-0.8-.21-1.7-.21-2.75z" />
          </svg>
        </div>

        {/* Bottom Specs Reflection */}
        <div className="w-full text-center text-[7px] font-mono text-white/60 tracking-tighter truncate">
          {model.replace('iPhone ', '')}
        </div>
      </div>
    </div>
  );
};

export const InventoryView: React.FC<InventoryViewProps> = ({
  devices,
  onAddDevice,
  onUpdateDevice,
  onDeleteDevice,
  onQuickSell
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeries, setSelectedSeries] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedCondition, setSelectedCondition] = useState('ALL');
  const [showCostPrice, setShowCostPrice] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedDeviceForBarcode, setSelectedDeviceForBarcode] = useState<DeviceItem | null>(null);
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [selectedChartModel, setSelectedChartModel] = useState<string | null>(null);
  const [activeMenuDeviceId, setActiveMenuDeviceId] = useState<string | null>(null);
  const [copiedImei, setCopiedImei] = useState<string | null>(null);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // In stock devices
  const inStockDevices = useMemo(() => {
    return devices.filter(d => d.status === 'in_stock');
  }, [devices]);

  // Distinct models in stock
  const distinctModelsCount = useMemo(() => {
    return new Set(inStockDevices.map(d => d.model)).size;
  }, [inStockDevices]);

  // Total stock sell value
  const totalStockValue = useMemo(() => {
    return inStockDevices.reduce((sum, d) => sum + (d.sellPrice || 0), 0);
  }, [inStockDevices]);

  // Value formatted in Million (tr)
  const totalStockValueTr = useMemo(() => {
    if (totalStockValue >= 1000000) {
      const trVal = (totalStockValue / 1000000);
      return trVal % 1 === 0 ? `${trVal}tr` : `${trVal.toFixed(1).replace('.', ',')}tr`;
    }
    return `${totalStockValue.toLocaleString('vi-VN')} đ`;
  }, [totalStockValue]);

  // Condition breakdown
  const conditionStats = useMemo(() => {
    const total = inStockDevices.length || 1;
    const likeNew = inStockDevices.filter(d => d.condition === 'Like New 99%').length;
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
    const modelMap: { [model: string]: { model: string; shortModel: string; totalCount: number; newSeal: number; likeNew: number; otherCondition: number } } = {};
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
      else if (d.condition === 'Like New 99%') modelMap[modelName].likeNew += 1;
      else modelMap[modelName].otherCondition += 1;
    });

    return Object.values(modelMap).sort((a, b) => b.totalCount - a.totalCount);
  }, [inStockDevices]);

  // Form State for new device
  const [formData, setFormData] = useState<Partial<DeviceItem>>({
    model: 'iPhone 16 Pro Max',
    storage: '256GB',
    color: 'Titan Sa Mạc (Desert)',
    region: 'VN/A (Chính hãng)',
    batteryHealth: 100,
    condition: 'New Seal',
    buyPrice: 31000000,
    sellPrice: 34500000,
    status: 'in_stock',
    supplier: 'FPT Synnex Distro',
    warrantyPeriodMonths: 12,
    icloudStatus: 'Clean / Đã Thoát',
    screenStatus: 'Zin Màn Keng',
    imei: '',
    serialNo: '',
    notes: ''
  });

  // Filtered devices
  const filteredDevices = useMemo(() => {
    return devices.filter(d => {
      const matchesSearch = 
        d.imei.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.serialNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.color.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.customerName && d.customerName.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesSeries = 
        selectedSeries === 'ALL' ||
        (selectedSeries === '16' && d.model.includes('16')) ||
        (selectedSeries === '15' && d.model.includes('15')) ||
        (selectedSeries === '14' && d.model.includes('14')) ||
        (selectedSeries === '13' && d.model.includes('13')) ||
        (selectedSeries === '12' && d.model.includes('12'));

      const matchesStatus = selectedStatus === 'ALL' || d.status === selectedStatus;
      const matchesCondition = selectedCondition === 'ALL' || d.condition === selectedCondition;
      const matchesChartModel = !selectedChartModel || d.model === selectedChartModel;

      return matchesSearch && matchesSeries && matchesStatus && matchesCondition && matchesChartModel;
    });
  }, [devices, searchTerm, selectedSeries, selectedStatus, selectedCondition, selectedChartModel]);

  const groupedDevices = useMemo(() => {
    const groups: Record<string, {
      id: string;
      model: string;
      storage: string;
      color: string;
      devices: DeviceItem[];
      minPrice: number;
      maxPrice: number;
      inStockCount: number;
      totalCount: number;
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
          inStockCount: 0,
          totalCount: 0
        };
      }
      
      groups[key].devices.push(d);
      groups[key].totalCount += 1;
      
      if (d.sellPrice < groups[key].minPrice) groups[key].minPrice = d.sellPrice;
      if (d.sellPrice > groups[key].maxPrice) groups[key].maxPrice = d.sellPrice;
      if (d.status === 'in_stock') groups[key].inStockCount += 1;
    });

    return Object.values(groups).sort((a, b) => b.model.localeCompare(a.model) || b.inStockCount - a.inStockCount);
  }, [filteredDevices]);

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

  const handleGenerateImei = () => {
    const randomImei = '35' + Math.floor(1000000000000 + Math.random() * 9000000000000).toString();
    const randomSerial = 'F' + Math.random().toString(36).substring(2, 10).toUpperCase();
    setFormData(prev => ({ ...prev, imei: randomImei, serialNo: randomSerial }));
  };

  const handleSaveNewDevice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.imei || !formData.model) {
      alert('Vui lòng nhập đầy đủ IMEI và Dòng máy!');
      return;
    }

    const newDevice: DeviceItem = {
      id: `DEV-${Date.now().toString().slice(-4)}`,
      imei: formData.imei,
      serialNo: formData.serialNo || 'SN-' + Date.now().toString().slice(-6),
      model: formData.model || 'iPhone 16 Pro Max',
      storage: formData.storage || '256GB',
      color: formData.color || 'Titan Sa Mạc (Desert)',
      region: formData.region || 'VN/A (Chính hãng)',
      batteryHealth: Number(formData.batteryHealth) || 100,
      condition: (formData.condition as any) || 'New Seal',
      buyPrice: Number(formData.buyPrice) || 31000000,
      sellPrice: Number(formData.sellPrice) || 34500000,
      status: (formData.status as any) || 'in_stock',
      supplier: formData.supplier || 'FPT Synnex',
      receivedDate: new Date().toISOString().split('T')[0],
      warrantyPeriodMonths: Number(formData.warrantyPeriodMonths) || 12,
      icloudStatus: (formData.icloudStatus as any) || 'Clean / Đã Thoát',
      screenStatus: (formData.screenStatus as any) || 'Zin Màn Keng',
      notes: formData.notes || ''
    };

    onAddDevice(newDevice);
    setIsAddModalOpen(false);
  };

  const getStatusBadge = (status: DeviceItem['status']) => {
    switch (status) {
      case 'in_stock':
        return (
          <span className="bg-emerald-50 text-emerald-600 border border-emerald-200/60 font-medium text-[11px] sm:text-xs px-2.5 py-0.5 rounded-full flex items-center space-x-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
            <span>Sẵn hàng</span>
          </span>
        );
      case 'reserved':
        return (
          <span className="bg-amber-50 text-amber-600 border border-amber-200/60 font-medium text-[11px] sm:text-xs px-2.5 py-0.5 rounded-full flex items-center space-x-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            <span>Đã giữ cọc</span>
          </span>
        );
      case 'sold':
        return (
          <span className="bg-zinc-100 text-zinc-500 border border-zinc-200 font-medium text-[11px] sm:text-xs px-2.5 py-0.5 rounded-full flex items-center space-x-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 inline-block" />
            <span>Đã bán</span>
          </span>
        );
      case 'warranty':
      case 'repairing':
        return (
          <span className="bg-red-50 text-red-600 border border-red-200/60 font-medium text-[11px] sm:text-xs px-2.5 py-0.5 rounded-full flex items-center space-x-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
            <span>Bảo hành</span>
          </span>
        );
    }
  };

  return (
    <div className="w-full space-y-3 sm:space-y-4 pb-12">
      
      {/* 1. Header Section */}
      <div className="flex items-center justify-between pt-0.5">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-900 tracking-tight">Kho IMEI</h2>
            <span className="bg-orange-50 text-[#F94A1F] border border-orange-200/60 text-xs font-bold px-2.5 py-0.5 rounded-full">
              {inStockDevices.length} máy
            </span>
          </div>
          <p className="text-xs text-zinc-500 font-medium mt-0.5">
            Giá trị tồn kho: <span className="font-bold text-zinc-800 font-mono">{totalStockValue.toLocaleString('vi-VN')} đ</span>
          </p>
        </div>

        <button
          onClick={() => {
            handleGenerateImei();
            setIsAddModalOpen(true);
          }}
          className="bg-[#F94A1F] hover:bg-[#e03d14] text-white text-xs sm:text-sm font-bold px-3.5 sm:px-4 py-2.5 rounded-2xl flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Nhập máy IMEI</span>
        </button>
      </div>

      {/* 2. Top Overview Card (4 Cols matching screenshot) */}
      <div className="bg-white rounded-3xl p-3.5 sm:p-4 border border-zinc-100/90 shadow-2xs space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 divide-y lg:divide-y-0 lg:divide-x divide-zinc-100">
          
          {/* Col 1: Máy tồn */}
          <div className="flex items-center space-x-3 pt-1 lg:pt-0">
            <div className="w-10 h-10 rounded-full bg-orange-50 text-[#F94A1F] flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-extrabold text-zinc-900 leading-none">{inStockDevices.length}</div>
              <div className="text-xs text-zinc-500 font-medium mt-1">Máy tồn</div>
            </div>
          </div>

          {/* Col 2: Model */}
          <div className="flex items-center space-x-3 pt-2 lg:pt-0 lg:pl-4">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-extrabold text-zinc-900 leading-none">{distinctModelsCount}</div>
              <div className="text-xs text-zinc-500 font-medium mt-1">Model</div>
            </div>
          </div>

          {/* Col 3: Giá trị tồn */}
          <div className="flex items-center space-x-3 pt-2 lg:pt-0 lg:pl-4">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-extrabold text-zinc-900 leading-none">{totalStockValueTr}</div>
              <div className="text-xs text-zinc-500 font-medium mt-1">Giá trị tồn</div>
            </div>
          </div>

          {/* Col 4: Condition breakdown */}
          <div className="flex items-center space-x-3 pt-2 lg:pt-0 lg:pl-4">
            <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
              <PieChart className="w-5 h-5" />
            </div>
            <div className="text-[11px] space-y-1 text-zinc-600 font-medium w-full">
              <div className="flex items-center justify-between">
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                  <span>Like New 99%</span>
                </span>
                <span className="font-bold text-zinc-900 font-mono ml-2">{conditionStats.likeNewCount} ({conditionStats.likeNewPct}%)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  <span>New Seal</span>
                </span>
                <span className="font-bold text-zinc-900 font-mono ml-2">{conditionStats.newSealCount} ({conditionStats.newSealPct}%)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-zinc-400 inline-block" />
                  <span>Ngoại hình khác</span>
                </span>
                <span className="font-bold text-zinc-900 font-mono ml-2">{conditionStats.otherCount} ({conditionStats.otherPct}%)</span>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Link: Xem báo cáo chi tiết */}
        <div className="pt-2 border-t border-zinc-100/80 text-center">
          <button
            onClick={() => setIsChartExpanded(!isChartExpanded)}
            className="text-xs font-semibold text-zinc-600 hover:text-[#F94A1F] transition-colors inline-flex items-center space-x-1 cursor-pointer"
          >
            <span>{isChartExpanded ? 'Thu gọn báo cáo' : 'Xem báo cáo chi tiết'}</span>
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isChartExpanded ? 'rotate-90 text-[#F94A1F]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Extended Chart Analytics Section */}
      {isChartExpanded && (
        <div className="bg-white rounded-3xl p-4 border border-zinc-100/90 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-[#F94A1F]" />
              <h3 className="text-xs sm:text-sm font-bold text-zinc-900">Phân Phối Tồn Kho Theo Model & Tình Trạng</h3>
            </div>
            {selectedChartModel && (
              <button
                onClick={() => setSelectedChartModel(null)}
                className="text-[11px] bg-orange-50 text-[#F94A1F] px-2 py-0.5 rounded-full font-bold"
              >
                Xóa lọc ({selectedChartModel}) ✕
              </button>
            )}
          </div>

          <div className="h-56 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={modelStockData}
                margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
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
                        <div className="bg-zinc-900 text-white p-2.5 rounded-xl shadow-xl text-xs space-y-1 font-sans">
                          <div className="font-bold text-amber-400 border-b border-zinc-700 pb-1">{d.model} ({d.totalCount} máy)</div>
                          <div>New Seal: <strong className="text-amber-300">{d.newSeal}</strong></div>
                          <div>Like New 99%: <strong className="text-orange-400">{d.likeNew}</strong></div>
                          {d.otherCondition > 0 && <div>Khác: <strong>{d.otherCondition}</strong></div>}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar name="New Seal" dataKey="newSeal" stackId="a" fill="#f59e0b" cursor="pointer" />
                <Bar name="Like New 99%" dataKey="likeNew" stackId="a" fill="#ea580c" cursor="pointer" />
                <Bar name="Ngoại hình khác" dataKey="otherCondition" stackId="a" fill="#a1a1aa" radius={[4, 4, 0, 0]} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 3. Search & Category Filters Bar */}
      <div className="space-y-2">
        
        {/* Search Input Box */}
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm IMEI, Serial, model, màu sắc..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-100/80 border border-transparent rounded-2xl pl-9 pr-4 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-orange-500 transition-all font-medium"
            />
          </div>

          <button
            onClick={() => setShowFilterDrawer(!showFilterDrawer)}
            className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
              showFilterDrawer 
                ? 'bg-[#F94A1F] text-white border-transparent' 
                : 'bg-zinc-100/80 hover:bg-zinc-200/80 text-zinc-700 border-transparent'
            }`}
            title="Bộ lọc nâng cao"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Drawer if Toggled */}
        {showFilterDrawer && (
          <div className="bg-white rounded-2xl p-3 border border-zinc-200/80 shadow-xs grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-zinc-600 mb-1">Trạng thái máy</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 font-semibold text-zinc-800"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="in_stock">Sẵn hàng (Trong kho)</option>
                <option value="reserved">Đã giữ cọc</option>
                <option value="sold">Đã bán</option>
                <option value="warranty">Bảo hành</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-600 mb-1">Tình trạng ngoại hình</label>
              <select
                value={selectedCondition}
                onChange={(e) => setSelectedCondition(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 font-semibold text-zinc-800"
              >
                <option value="ALL">Mọi ngoại hình</option>
                <option value="New Seal">New Seal</option>
                <option value="Like New 99%">Like New 99%</option>
                <option value="98% Cấn Nhẹ">98% Cấn Nhẹ</option>
                <option value="95% Trầy Xước">95% Trầy Xước</option>
              </select>
            </div>
          </div>
        )}

        {/* Category Series Filter Pills Row */}
        <div className="flex items-center justify-between gap-1.5 pt-0.5">
          <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none py-0.5">
            {[
              { id: 'ALL', label: 'Tất cả' },
              { id: '16', label: 'iPhone 16' },
              { id: '15', label: 'iPhone 15' },
              { id: '14', label: 'iPhone 14' },
              { id: '13', label: 'iPhone 13' },
              { id: '12', label: 'iPhone 12' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedSeries(item.id)}
                className={`text-xs px-3.5 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedSeries === item.id
                    ? 'bg-[#F94A1F] text-white shadow-2xs font-bold'
                    : 'bg-zinc-100/90 text-zinc-700 hover:bg-zinc-200/80'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowFilterDrawer(!showFilterDrawer)}
            className="text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-3 py-1.5 rounded-xl font-semibold flex items-center space-x-1 shrink-0 cursor-pointer"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Bộ lọc</span>
          </button>
        </div>

      </div>

      {/* 4. List of Grouped Device Cards */}
      <div className="space-y-3">
        {groupedDevices.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-3xl border border-zinc-100 text-zinc-500 text-xs">
            Không tìm thấy cây máy nào khớp điều kiện tìm kiếm.
          </div>
        ) : (
          groupedDevices.map((group) => {
            const isExpanded = expandedGroups.includes(group.id);
            const priceRange = group.minPrice === group.maxPrice 
              ? `${group.minPrice.toLocaleString('vi-VN')} đ`
              : `${group.minPrice.toLocaleString('vi-VN')} đ - ${group.maxPrice.toLocaleString('vi-VN')} đ`;
              
            return (
              <div 
                key={group.id} 
                className="bg-white rounded-3xl p-3.5 sm:p-4 border border-zinc-100/90 shadow-2xs hover:border-orange-200/80 transition-all space-y-3 relative"
              >
                {/* Group Summary Row */}
                <div 
                  className="flex gap-3 items-center cursor-pointer group"
                  onClick={() => toggleGroup(group.id)}
                >
                  <DeviceImageThumbnail model={group.model} color={group.color} />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1.5">
                      <h3 className="font-extrabold text-zinc-900 text-sm sm:text-base tracking-tight truncate group-hover:text-[#F94A1F] transition-colors">
                        {group.model} {group.storage}
                      </h3>
                      <div className="bg-orange-50 text-[#F94A1F] border border-orange-200/60 font-bold text-[11px] sm:text-xs px-2.5 py-0.5 rounded-full shrink-0">
                        {group.inStockCount} Sẵn / {group.totalCount} Tổng
                      </div>
                    </div>
                    <p className="text-xs text-zinc-500 font-medium">
                      Màu: <strong className="text-zinc-800">{group.color}</strong>
                    </p>
                    <div className="flex items-center justify-between pt-2">
                      <div className="text-[#F94A1F] font-extrabold text-sm sm:text-base tracking-tight font-mono">
                        {priceRange}
                      </div>
                      <div className="text-zinc-400 hover:text-[#F94A1F] transition-colors flex items-center text-xs font-bold space-x-1">
                        <span>{isExpanded ? 'Thu gọn' : 'Xem chi tiết'}</span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180 text-[#F94A1F]' : ''}`} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Individual Devices (Expanded State) */}
                {isExpanded && (
                  <div className="pt-3 border-t border-zinc-100/80 space-y-2.5">
                    {group.devices.map(device => (
                      <div key={device.id} className="bg-zinc-50/80 rounded-2xl p-3 border border-zinc-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            {getStatusBadge(device.status)}
                            <span className="text-xs font-mono font-bold text-zinc-800">IMEI: {device.imei.slice(-6)}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyImei(device.imei);
                              }}
                              className="text-zinc-400 hover:text-[#F94A1F] transition-colors cursor-pointer"
                              title="Sao chép IMEI"
                            >
                              {copiedImei === device.imei ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg ${
                              device.condition === 'New Seal'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                : device.condition === 'Like New 99%'
                                ? 'bg-orange-50 text-orange-600 border border-orange-100'
                                : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                              {device.condition}
                            </span>
                            <span className="bg-white text-zinc-700 text-[10px] font-semibold px-2 py-0.5 rounded-lg border border-zinc-200/80">
                              Pin {device.batteryHealth}%
                            </span>
                            <span className="bg-white text-zinc-700 text-[10px] font-semibold px-2 py-0.5 rounded-lg border border-zinc-200/80">
                              {device.region}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto border-t sm:border-t-0 border-zinc-200/60 pt-2 sm:pt-0">
                          <div className="text-right">
                            <div className="text-[#F94A1F] font-extrabold text-sm font-mono">
                              {device.sellPrice.toLocaleString('vi-VN')} đ
                            </div>
                            {showCostPrice && (
                              <div className="text-[10px] text-zinc-400 font-mono">Vốn: {device.buyPrice.toLocaleString('vi-VN')}đ</div>
                            )}
                          </div>

                          <div className="flex items-center space-x-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDeviceForBarcode(device);
                              }}
                              className="p-1.5 bg-white text-zinc-600 hover:text-[#F94A1F] border border-zinc-200 hover:border-orange-200 rounded-lg cursor-pointer transition-colors"
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
                                className="bg-white hover:bg-orange-50 text-[#F94A1F] border border-orange-200/90 text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1 shadow-2xs transition-all cursor-pointer"
                              >
                                <ShoppingCart className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Bán</span>
                              </button>
                            )}
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuDeviceId(activeMenuDeviceId === device.id ? null : device.id);
                                }}
                                className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors cursor-pointer"
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
                                    className="w-full px-3 py-1.5 hover:bg-red-50 text-red-600 rounded-lg flex items-center space-x-2 font-medium cursor-pointer"
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
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: Nhập Máy IMEI Mới */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-white sm:bg-black/60 sm:backdrop-blur-xs z-50 flex items-center justify-center sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-3xl sm:max-w-2xl overflow-hidden shadow-none sm:shadow-2xl flex flex-col border-0 sm:border sm:border-orange-200">
            <div className="bg-[#F94A1F] px-4 py-3.5 sm:px-5 sm:py-4 flex justify-between items-center text-white shrink-0">
              <div className="flex items-center space-x-2">
                <button onClick={() => setIsAddModalOpen(false)} className="sm:hidden p-1.5 -ml-2 hover:bg-white/10 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/20 flex items-center justify-center">
                  <Smartphone className="w-4 h-4 text-white" />
                </div>
                <h3 className="font-extrabold text-base">Nhập Định Danh Máy</h3>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="hidden sm:block text-white hover:text-orange-100 p-1.5 hover:bg-white/10 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewDevice} className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1 bg-white">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* IMEI & Generator */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-zinc-800">Số IMEI (15 số) *</label>
                    <button
                      type="button"
                      onClick={handleGenerateImei}
                      className="text-[11px] text-[#F94A1F] hover:underline font-bold"
                    >
                      Tạo IMEI Mẫu
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={formData.imei}
                    onChange={(e) => setFormData({ ...formData, imei: e.target.value })}
                    placeholder="35xxxxxxxxxxxxx"
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 font-mono focus:outline-none focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-800 mb-1">Dòng Máy *</label>
                  <select
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500 font-bold"
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
                    <option value="iPhone 13 Pro Max">iPhone 13 Pro Max</option>
                    <option value="iPhone 12 Pro Max">iPhone 12 Pro Max</option>
                    <option value="iPhone 11 Pro Max">iPhone 11 Pro Max</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-800 mb-1">Dung Lượng</label>
                  <select
                    value={formData.storage}
                    onChange={(e) => setFormData({ ...formData, storage: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                  >
                    <option value="128GB">128GB</option>
                    <option value="256GB">256GB</option>
                    <option value="512GB">512GB</option>
                    <option value="1TB">1TB</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-800 mb-1">Màu Sắc</label>
                  <input
                    type="text"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-800 mb-1">Mã Xuất Xứ</label>
                  <select
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                  >
                    <option value="VN/A (Chính hãng)">VN/A (Việt Nam)</option>
                    <option value="LL/A (Mỹ - eSIM)">LL/A (Mỹ)</option>
                    <option value="ZA/A (2 SIM Vật Lý)">ZA/A (Hồng Kông)</option>
                    <option value="KH/A (Hàn Quốc)">KH/A (Hàn Quốc)</option>
                    <option value="J/A (Nhật Bản)">J/A (Nhật Bản)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-800 mb-1">Pin (% Battery Health)</label>
                  <input
                    type="number"
                    min="50"
                    max="100"
                    value={formData.batteryHealth}
                    onChange={(e) => setFormData({ ...formData, batteryHealth: Number(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-800 mb-1">Giá Vốn Nhập (VNĐ)</label>
                  <input
                    type="number"
                    step="100000"
                    value={formData.buyPrice}
                    onChange={(e) => setFormData({ ...formData, buyPrice: Number(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 font-mono focus:outline-none focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-800 mb-1">Giá Bán Niêm Yết (VNĐ)</label>
                  <input
                    type="number"
                    step="100000"
                    value={formData.sellPrice}
                    onChange={(e) => setFormData({ ...formData, sellPrice: Number(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs text-[#F94A1F] font-mono font-bold focus:outline-none focus:bg-white focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="pt-3 sm:pt-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:pb-0 border-t border-zinc-200 flex justify-end space-x-2 mt-auto sticky bottom-0 bg-white z-10">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#F94A1F] hover:bg-[#e03d14] text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer"
                >
                  Lưu & Tạo Thẻ Kho
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: In Tem Nhãn Barcode IMEI K80 */}
      {selectedDeviceForBarcode && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-orange-200 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <span className="font-extrabold text-sm text-zinc-900">Tem Nhãn Mã Vạch K80</span>
              <button onClick={() => setSelectedDeviceForBarcode(null)} className="text-zinc-400 hover:text-zinc-600 font-bold">✕</button>
            </div>

            {/* Virtual Thermal Sticker */}
            <div className="bg-zinc-50 text-black p-4 rounded-xl border border-zinc-300 text-center font-sans space-y-2 shadow-inner">
              <div className="font-black text-sm tracking-tight text-[#F94A1F]">PHONE HOUSE • APPLE PREMIUM</div>
              <div className="font-bold text-xs">{selectedDeviceForBarcode.model} {selectedDeviceForBarcode.storage}</div>
              <div className="text-[10px] text-zinc-600">{selectedDeviceForBarcode.color} • {selectedDeviceForBarcode.region} • Pin {selectedDeviceForBarcode.batteryHealth}%</div>

              {/* Barcode lines */}
              <div className="py-2 flex flex-col items-center">
                <div className="h-10 w-48 bg-repeat-x flex items-center justify-center border-y border-black font-mono tracking-widest text-[10px] font-bold">
                  ||| | |||| | ||| |||| | |||
                </div>
                <span className="font-mono text-xs font-black mt-1">IMEI: {selectedDeviceForBarcode.imei}</span>
              </div>

              <div className="text-sm font-black text-zinc-900 pt-1 border-t border-dashed border-zinc-300">
                {selectedDeviceForBarcode.sellPrice.toLocaleString('vi-VN')} đ
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-[#F94A1F] hover:bg-[#e03d14] text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer"
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

    </div>
  );
};

