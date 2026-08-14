import React, { useState, useMemo } from 'react';
import { DeviceItem } from '../types';
import { 
  Smartphone, 
  Search, 
  Plus, 
  QrCode, 
  Tag, 
  ShieldCheck, 
  BatteryMedium, 
  Eye, 
  EyeOff, 
  Check, 
  AlertCircle,
  Edit2,
  Trash2,
  ShoppingCart,
  Printer,
  Sparkles,
  Zap,
  BarChart3,
  Layers,
  TrendingUp,
  Boxes,
  ChevronDown,
  ChevronUp,
  Filter,
  CheckCircle2
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell
} from 'recharts';

interface InventoryViewProps {
  devices: DeviceItem[];
  onAddDevice: (device: DeviceItem) => void;
  onUpdateDevice: (device: DeviceItem) => void;
  onDeleteDevice: (id: string) => void;
  onQuickSell: (device: DeviceItem) => void;
}

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
  const [chartScope, setChartScope] = useState<'in_stock' | 'all'>('in_stock');
  const [isChartExpanded, setIsChartExpanded] = useState(true);
  const [selectedChartModel, setSelectedChartModel] = useState<string | null>(null);

  // Group devices by model for the bar chart
  const modelStockData = useMemo(() => {
    const targetDevices = chartScope === 'in_stock' 
      ? devices.filter(d => d.status === 'in_stock') 
      : devices;

    const modelMap: { 
      [model: string]: { 
        model: string; 
        shortModel: string;
        inStock: number;
        newSeal: number;
        likeNew: number;
        otherCondition: number;
        totalValue: number;
        totalCost: number;
        storages: { [st: string]: number };
        totalCount: number;
      } 
    } = {};

    targetDevices.forEach(d => {
      const modelName = d.model || 'Khác';
      if (!modelMap[modelName]) {
        // Shorten name for x-axis if needed (e.g. "iPhone 16 Pro Max" -> "16 Pro Max")
        const short = modelName.replace(/^iPhone\s+/i, '');
        modelMap[modelName] = {
          model: modelName,
          shortModel: short,
          inStock: 0,
          newSeal: 0,
          likeNew: 0,
          otherCondition: 0,
          totalValue: 0,
          totalCost: 0,
          storages: {},
          totalCount: 0,
        };
      }

      modelMap[modelName].totalCount += 1;
      if (d.status === 'in_stock') {
        modelMap[modelName].inStock += 1;
      }
      if (d.condition === 'New Seal') {
        modelMap[modelName].newSeal += 1;
      } else if (d.condition === 'Like New 99%') {
        modelMap[modelName].likeNew += 1;
      } else {
        modelMap[modelName].otherCondition += 1;
      }

      modelMap[modelName].totalValue += d.sellPrice || 0;
      modelMap[modelName].totalCost += d.buyPrice || 0;

      const st = d.storage || '128GB';
      modelMap[modelName].storages[st] = (modelMap[modelName].storages[st] || 0) + 1;
    });

    return Object.values(modelMap).sort((a, b) => b.totalCount - a.totalCount);
  }, [devices, chartScope]);

  // Key metrics for the inventory overview
  const totalStockCount = useMemo(() => {
    return devices.filter(d => d.status === 'in_stock').length;
  }, [devices]);

  const totalStockValue = useMemo(() => {
    return devices
      .filter(d => d.status === 'in_stock')
      .reduce((sum, d) => sum + (showCostPrice ? d.buyPrice : d.sellPrice), 0);
  }, [devices, showCostPrice]);

  const topStockModel = useMemo(() => {
    if (modelStockData.length === 0) return null;
    return modelStockData[0];
  }, [modelStockData]);

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
  const filteredDevices = devices.filter(d => {
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
      (selectedSeries === '12' && d.model.includes('12')) ||
      (selectedSeries === '11' && d.model.includes('11'));

    const matchesStatus = selectedStatus === 'ALL' || d.status === selectedStatus;
    const matchesCondition = selectedCondition === 'ALL' || d.condition === selectedCondition;
    const matchesChartModel = !selectedChartModel || d.model === selectedChartModel;

    return matchesSearch && matchesSeries && matchesStatus && matchesCondition && matchesChartModel;
  });

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
      model: formData.model || 'iPhone 15 Pro Max',
      storage: formData.storage || '128GB',
      color: formData.color || 'Titan Tự Nhiên',
      region: formData.region || 'VN/A',
      batteryHealth: Number(formData.batteryHealth) || 99,
      condition: (formData.condition as any) || 'Like New 99%',
      buyPrice: Number(formData.buyPrice) || 15000000,
      sellPrice: Number(formData.sellPrice) || 18000000,
      status: (formData.status as any) || 'in_stock',
      supplier: formData.supplier || 'Kho Sỉ',
      receivedDate: new Date().toISOString().split('T')[0],
      warrantyPeriodMonths: Number(formData.warrantyPeriodMonths) || 6,
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
        return <span className="bg-orange-50 text-orange-700 border border-orange-200 text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase">Sẵn Hàng</span>;
      case 'reserved':
        return <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase">Đã Giữ Cọc</span>;
      case 'sold':
        return <span className="bg-zinc-100 text-zinc-600 border border-zinc-200 text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase">Đã Bán</span>;
      case 'warranty':
      case 'repairing':
        return <span className="bg-red-50 text-red-700 border border-red-200 text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase">Bảo Hành</span>;
    }
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 flex items-center space-x-2">
            <span>Kho Quản Lý IMEI & Serial Number</span>
            <span className="bg-orange-50 text-orange-700 border border-orange-200 text-xs px-2.5 py-0.5 rounded-full font-bold">
              {filteredDevices.length} máy
            </span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Quản lý độc nhất từng cây máy: Pin %, Màn hình, Xuất xứ VN/A/Mỹ và Lịch sử bảo hành
          </p>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          {/* Toggle Cost Price */}
          <button
            onClick={() => setShowCostPrice(!showCostPrice)}
            className="flex-1 sm:flex-initial bg-white hover:bg-orange-50 text-zinc-700 hover:text-orange-600 text-xs px-3 py-2 rounded-xl flex items-center justify-center space-x-1.5 transition-all border border-zinc-200 shadow-xs font-semibold"
          >
            {showCostPrice ? <EyeOff className="w-3.5 h-3.5 text-orange-600" /> : <Eye className="w-3.5 h-3.5 text-zinc-400" />}
            <span>{showCostPrice ? 'Ẩn Giá Vốn' : 'Xem Giá Vốn'}</span>
          </button>

          {/* Add Device Button */}
          <button
            onClick={() => {
              handleGenerateImei();
              setIsAddModalOpen(true);
            }}
            className="flex-1 sm:flex-initial bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-black px-3.5 py-2 rounded-xl flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-orange-500/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ Nhập Máy IMEI Mới</span>
          </button>
        </div>
      </div>

      {/* Visual iPhone Stock by Model Bar Chart & Analytics Card */}
      <div className="bg-white border border-orange-200/90 rounded-2xl p-4 sm:p-5 shadow-xs transition-all">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-100/80 text-orange-600 flex items-center justify-center font-bold">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h3 className="text-sm sm:text-base font-black text-zinc-900">
                  Biểu Đồ Tồn Kho iPhone Theo Model
                </h3>
                {selectedChartModel && (
                  <span className="bg-orange-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center space-x-1 shadow-xs">
                    <span>Đang lọc: {selectedChartModel}</span>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedChartModel(null);
                      }}
                      className="hover:text-zinc-200 ml-1 font-black cursor-pointer"
                      title="Bỏ lọc model này"
                    >
                      ✕
                    </button>
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                Thống kê trực quan số lượng máy, cơ cấu New Seal / Like New 99% và giá trị hàng theo từng model
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 self-end sm:self-auto">
            {/* Scope toggle */}
            <div className="bg-zinc-100 p-0.5 rounded-xl flex items-center text-xs font-semibold">
              <button
                onClick={() => setChartScope('in_stock')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  chartScope === 'in_stock'
                    ? 'bg-white text-orange-600 shadow-xs font-bold'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Sẵn hàng ({totalStockCount})
              </button>
              <button
                onClick={() => setChartScope('all')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  chartScope === 'all'
                    ? 'bg-white text-orange-600 shadow-xs font-bold'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Tất cả ({devices.length})
              </button>
            </div>

            {/* Collapse toggle */}
            <button
              onClick={() => setIsChartExpanded(!isChartExpanded)}
              className="p-1.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-500 transition-colors cursor-pointer"
              title={isChartExpanded ? 'Thu gọn biểu đồ' : 'Mở rộng biểu đồ'}
            >
              {isChartExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* 4 Mini Metric Summary Badges */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 pt-3.5 pb-1">
          <div className="bg-zinc-50/80 rounded-xl p-2.5 border border-zinc-100">
            <div className="text-[11px] text-zinc-500 font-medium flex items-center space-x-1">
              <Boxes className="w-3.5 h-3.5 text-zinc-400" />
              <span>Dòng Model Hiện Có</span>
            </div>
            <div className="text-base sm:text-lg font-black text-zinc-800 mt-0.5">
              {modelStockData.length} <span className="text-xs font-semibold text-zinc-500">model</span>
            </div>
          </div>

          <div className="bg-orange-50/60 rounded-xl p-2.5 border border-orange-100">
            <div className="text-[11px] text-orange-700 font-medium flex items-center space-x-1">
              <TrendingUp className="w-3.5 h-3.5 text-orange-500" />
              <span>Tồn Nhiều Nhất</span>
            </div>
            <div className="text-xs sm:text-sm font-black text-orange-950 mt-0.5 truncate" title={topStockModel?.model || '-'}>
              {topStockModel ? `${topStockModel.model.replace('iPhone ', '')} (${topStockModel.totalCount} cây)` : 'Chưa có'}
            </div>
          </div>

          <div className="bg-amber-50/60 rounded-xl p-2.5 border border-amber-100">
            <div className="text-[11px] text-amber-700 font-medium flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Cơ Cấu New Seal</span>
            </div>
            <div className="text-base sm:text-lg font-black text-amber-900 mt-0.5">
              {devices.filter(d => (chartScope === 'in_stock' ? d.status === 'in_stock' : true) && d.condition === 'New Seal').length}
              <span className="text-xs font-semibold text-amber-600 ml-1">
                ({Math.round((devices.filter(d => (chartScope === 'in_stock' ? d.status === 'in_stock' : true) && d.condition === 'New Seal').length / (chartScope === 'in_stock' ? (totalStockCount || 1) : (devices.length || 1))) * 100)}%)
              </span>
            </div>
          </div>

          <div className="bg-emerald-50/60 rounded-xl p-2.5 border border-emerald-100">
            <div className="text-[11px] text-emerald-700 font-medium flex items-center space-x-1">
              <Layers className="w-3.5 h-3.5 text-emerald-500" />
              <span>{showCostPrice ? 'Tổng Vốn Tồn Kho' : 'Ước Tính Giá Trị Tồn'}</span>
            </div>
            <div className="text-xs sm:text-sm font-black text-emerald-950 mt-0.5 truncate">
              {totalStockValue.toLocaleString('vi-VN')} đ
            </div>
          </div>
        </div>

        {/* Chart Body */}
        {isChartExpanded && (
          <div className="pt-3">
            {modelStockData.length === 0 ? (
              <div className="py-12 text-center text-zinc-400 text-xs">
                Không có dữ liệu máy nào phù hợp để hiển thị biểu đồ.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="h-64 sm:h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={modelStockData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                      onClick={(data: any) => {
                        if (data && data.activePayload && data.activePayload[0]) {
                          const clickedModel = data.activePayload[0].payload.model;
                          if (selectedChartModel === clickedModel) {
                            setSelectedChartModel(null);
                          } else {
                            setSelectedChartModel(clickedModel);
                          }
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="shortModel" 
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                        height={40}
                      />
                      <YAxis 
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-zinc-900/95 backdrop-blur-sm text-white p-3 rounded-xl shadow-xl border border-zinc-800 text-xs space-y-2 min-w-[220px] z-50">
                                <div className="font-black text-amber-400 text-sm flex items-center justify-between border-b border-zinc-700 pb-1.5">
                                  <span>{d.model}</span>
                                  <span className="bg-orange-500/30 text-orange-300 text-[11px] px-2 py-0.5 rounded-full font-bold">
                                    {d.totalCount} máy
                                  </span>
                                </div>

                                <div className="space-y-1 text-zinc-300 text-[11px]">
                                  <div className="flex justify-between">
                                    <span className="flex items-center space-x-1.5">
                                      <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                                      <span>New Seal:</span>
                                    </span>
                                    <span className="font-bold text-white">{d.newSeal} máy</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="flex items-center space-x-1.5">
                                      <span className="w-2 h-2 rounded-full bg-orange-500 inline-block"></span>
                                      <span>Like New 99%:</span>
                                    </span>
                                    <span className="font-bold text-white">{d.likeNew} máy</span>
                                  </div>
                                  {d.otherCondition > 0 && (
                                    <div className="flex justify-between">
                                      <span className="flex items-center space-x-1.5">
                                        <span className="w-2 h-2 rounded-full bg-zinc-400 inline-block"></span>
                                        <span>Ngoại hình khác:</span>
                                      </span>
                                      <span className="font-bold text-white">{d.otherCondition} máy</span>
                                    </div>
                                  )}
                                </div>

                                <div className="pt-1.5 border-t border-zinc-800 flex justify-between text-[11px]">
                                  <span className="text-zinc-400">Dung lượng:</span>
                                  <span className="font-medium text-amber-200">
                                    {Object.entries(d.storages).map(([st, cnt]) => `${st}: ${cnt}`).join(', ')}
                                  </span>
                                </div>

                                <div className="flex justify-between text-[11px] text-emerald-400 font-bold">
                                  <span>{showCostPrice ? 'Vốn tồn:' : 'Giá trị bán:'}</span>
                                  <span>{(showCostPrice ? d.totalCost : d.totalValue).toLocaleString('vi-VN')} đ</span>
                                </div>

                                <div className="text-[10px] text-zinc-400 italic pt-1 text-center bg-zinc-800/60 rounded py-0.5">
                                  💡 Nhấp cột để lọc danh sách máy theo model này
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend 
                        verticalAlign="top" 
                        align="right"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                      />
                      <Bar 
                        name="New Seal" 
                        dataKey="newSeal" 
                        stackId="a" 
                        fill="#f59e0b" 
                        radius={[0, 0, 0, 0]}
                        cursor="pointer"
                      />
                      <Bar 
                        name="Like New 99%" 
                        dataKey="likeNew" 
                        stackId="a" 
                        fill="#ea580c" 
                        radius={[0, 0, 0, 0]}
                        cursor="pointer"
                      />
                      <Bar 
                        name="Ngoại hình khác" 
                        dataKey="otherCondition" 
                        stackId="a" 
                        fill="#a1a1aa" 
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Quick Model filter chips below chart */}
                <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-zinc-100">
                  <span className="text-[11px] font-semibold text-zinc-400 flex items-center mr-1">
                    <Filter className="w-3 h-3 mr-1" />
                    Lọc nhanh theo Model:
                  </span>
                  {selectedChartModel && (
                    <button
                      onClick={() => setSelectedChartModel(null)}
                      className="text-xs bg-zinc-200 hover:bg-zinc-300 text-zinc-800 px-2.5 py-0.5 rounded-lg font-bold transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <span>✕ Bỏ chọn ({selectedChartModel})</span>
                    </button>
                  )}
                  {modelStockData.map((item) => {
                    const isSelected = selectedChartModel === item.model;
                    return (
                      <button
                        key={item.model}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedChartModel(null);
                          } else {
                            setSelectedChartModel(item.model);
                          }
                        }}
                        className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-orange-600 text-white shadow-xs'
                            : 'bg-zinc-100 hover:bg-orange-50 text-zinc-700 hover:text-orange-600 border border-zinc-200/80'
                        }`}
                      >
                        <span>{item.shortModel}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          isSelected ? 'bg-white/30 text-white' : 'bg-zinc-200 text-zinc-700'
                        }`}>
                          {item.totalCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="bg-white border border-orange-100 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-sm">
        <div className="flex flex-col md:flex-row gap-2.5">
          {/* Search input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo số IMEI (15 số), Serial, Dòng máy, Màu sắc, Tên khách..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-orange-500 transition-colors"
            />
          </div>

          {/* Status & Condition Filters */}
          <div className="grid grid-cols-2 md:flex items-center gap-2">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:bg-white focus:border-orange-500 font-bold"
            >
              <option value="ALL">Tất Cả Trạng Thái</option>
              <option value="in_stock">Sẵn Hàng (Trong Kho)</option>
              <option value="reserved">Đã Giữ Cọc</option>
              <option value="sold">Đã Bán</option>
              <option value="warranty">Đang Bảo Hành</option>
            </select>

            <select
              value={selectedCondition}
              onChange={(e) => setSelectedCondition(e.target.value)}
              className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:bg-white focus:border-orange-500"
            >
              <option value="ALL">Mọi Ngoại Hình</option>
              <option value="New Seal">New Seal</option>
              <option value="Like New 99%">Like New 99%</option>
              <option value="98% Cấn Nhẹ">98% Cấn Nhẹ</option>
              <option value="95% Trầy Xước">95% Trầy Xước</option>
            </select>
          </div>
        </div>

        {/* Series Quick Filter Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none pt-1">
          {[
            { id: 'ALL', label: 'Tất Cả Series' },
            { id: '16', label: 'iPhone 16' },
            { id: '15', label: 'iPhone 15' },
            { id: '14', label: 'iPhone 14' },
            { id: '13', label: 'iPhone 13' },
            { id: '12', label: 'iPhone 12' },
            { id: '11', label: 'iPhone 11' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedSeries(item.id)}
              className={`text-xs px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                selectedSeries === item.id
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/20'
                  : 'bg-zinc-100 text-zinc-600 hover:text-orange-600 hover:bg-orange-50 border border-zinc-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* MOBILE CARDS VIEW (md:hidden) */}
      <div className="md:hidden space-y-3">
        {filteredDevices.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-zinc-200 text-zinc-500 text-xs">
            Không tìm thấy cây máy nào khớp điều kiện tìm kiếm.
          </div>
        ) : (
          filteredDevices.map((device) => (
            <div 
              key={device.id} 
              className="bg-white border border-orange-100 hover:border-orange-300 rounded-2xl p-4 space-y-3 shadow-xs"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-black text-zinc-900 text-sm">{device.model} {device.storage}</div>
                  <div className="text-[11px] text-zinc-500">{device.color} • <strong className="text-zinc-800">{device.region}</strong></div>
                </div>
                {getStatusBadge(device.status)}
              </div>

              {/* Specs & IMEI */}
              <div className="p-2.5 bg-orange-50/50 rounded-xl border border-orange-100 text-xs space-y-1">
                <div className="flex justify-between text-zinc-600 font-mono">
                  <span>IMEI:</span>
                  <strong className="text-orange-600 font-bold">{device.imei}</strong>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Tình trạng:</span>
                  <span className="text-zinc-900 font-medium">{device.condition} • Pin {device.batteryHealth}%</span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Màn hình:</span>
                  <span className="text-emerald-600 font-medium">{device.screenStatus}</span>
                </div>
              </div>

              {/* Pricing & Actions */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <div className="text-[10px] text-zinc-400 uppercase font-bold">Giá Bán</div>
                  <div className="text-base font-black text-zinc-900">
                    {device.sellPrice.toLocaleString('vi-VN')} <span className="text-xs text-orange-600">đ</span>
                  </div>
                  {showCostPrice && (
                    <div className="text-[10px] text-zinc-500">Vốn: {device.buyPrice.toLocaleString('vi-VN')}đ</div>
                  )}
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => setSelectedDeviceForBarcode(device)}
                    className="p-2 bg-zinc-50 text-zinc-700 hover:text-orange-600 border border-zinc-200 rounded-xl"
                    title="In Tem Barcode"
                  >
                    <Printer className="w-4 h-4 text-orange-600" />
                  </button>

                  {device.status === 'in_stock' && (
                    <button
                      onClick={() => onQuickSell(device)}
                      className="px-3 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-black rounded-xl flex items-center space-x-1 shadow-sm active:scale-95"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>Bán POS</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* DESKTOP TABLE VIEW (hidden md:block) */}
      <div className="hidden md:block bg-white border border-orange-100 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-700">
            <thead className="bg-orange-50/60 text-zinc-600 uppercase font-bold border-b border-orange-100 text-[11px]">
              <tr>
                <th className="px-4 py-3.5">Mẫu Máy & Màu Sắc</th>
                <th className="px-4 py-3.5">Số IMEI & Serial No</th>
                <th className="px-4 py-3.5">Pin & Ngoại Hình</th>
                <th className="px-4 py-3.5">Xuất Xứ & Màn</th>
                {showCostPrice && <th className="px-4 py-3.5">Giá Vốn</th>}
                <th className="px-4 py-3.5">Giá Bán Niêm Yết</th>
                <th className="px-4 py-3.5">Trạng Thái</th>
                <th className="px-4 py-3.5 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-medium">
              {filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-zinc-400">
                    <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>Không có máy nào trong danh sách.</p>
                  </td>
                </tr>
              ) : (
                filteredDevices.map(device => (
                  <tr key={device.id} className="hover:bg-orange-50/40 transition-colors">
                    {/* Dòng máy */}
                    <td className="px-4 py-3">
                      <div className="font-bold text-zinc-900 text-sm">{device.model} {device.storage}</div>
                      <div className="text-[11px] text-zinc-500">{device.color}</div>
                    </td>

                    {/* IMEI */}
                    <td className="px-4 py-3 font-mono">
                      <span className="font-bold text-orange-600 text-xs block">{device.imei}</span>
                      <span className="text-[11px] text-zinc-400">SN: {device.serialNo}</span>
                    </td>

                    {/* Pin & Ngoại hình */}
                    <td className="px-4 py-3">
                      <div className="font-bold text-zinc-900">
                        Pin {device.batteryHealth}%
                      </div>
                      <div className="text-[11px] text-zinc-500">{device.condition}</div>
                    </td>

                    {/* Xuất xứ */}
                    <td className="px-4 py-3">
                      <span className="bg-zinc-100 text-zinc-700 font-bold px-2 py-0.5 rounded text-[10px] border border-zinc-200">
                        {device.region}
                      </span>
                      <div className="text-[11px] text-emerald-600 font-semibold mt-1">{device.screenStatus}</div>
                    </td>

                    {/* Giá vốn */}
                    {showCostPrice && (
                      <td className="px-4 py-3 font-mono text-zinc-500">
                        {device.buyPrice.toLocaleString('vi-VN')}đ
                      </td>
                    )}

                    {/* Giá bán */}
                    <td className="px-4 py-3 font-bold text-sm text-zinc-900 font-mono">
                      {device.sellPrice.toLocaleString('vi-VN')} <span className="text-orange-600 text-xs">đ</span>
                    </td>

                    {/* Trạng thái */}
                    <td className="px-4 py-3">
                      {getStatusBadge(device.status)}
                    </td>

                    {/* Thao tác */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => setSelectedDeviceForBarcode(device)}
                          className="p-1.5 bg-zinc-50 hover:bg-orange-50 text-zinc-600 hover:text-orange-600 rounded-lg border border-zinc-200"
                          title="In Tem Barcode K80"
                        >
                          <Printer className="w-3.5 h-3.5 text-orange-600" />
                        </button>

                        {device.status === 'in_stock' && (
                          <button
                            onClick={() => onQuickSell(device)}
                            className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all shadow-xs"
                          >
                            Bán POS
                          </button>
                        )}

                        <button
                          onClick={() => onDeleteDevice(device.id)}
                          className="p-1.5 bg-zinc-50 hover:bg-red-50 text-zinc-400 hover:text-red-600 rounded-lg border border-zinc-200"
                          title="Xóa máy"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Nhập Máy IMEI Mới */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-orange-200 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-4 flex justify-between items-center text-white">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <Smartphone className="w-4 h-4 text-white" />
                </div>
                <h3 className="font-black text-base">Nhập Định Danh Máy Theo Số IMEI</h3>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-white hover:text-orange-100 text-lg font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveNewDevice} className="p-5 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* IMEI & Generator */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-zinc-800">Số IMEI (15 số) *</label>
                    <button
                      type="button"
                      onClick={handleGenerateImei}
                      className="text-[11px] text-orange-600 hover:underline font-bold"
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
                    <option value="LL/A (Bản Mỹ e-SIM)">LL/A (Mỹ)</option>
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
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs text-orange-600 font-mono font-bold focus:outline-none focus:bg-white focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold rounded-xl text-xs shadow-md shadow-orange-500/20"
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
              <span className="font-black text-sm text-zinc-900">Tem Nhãn Mã Vạch K80</span>
              <button onClick={() => setSelectedDeviceForBarcode(null)} className="text-zinc-400 hover:text-zinc-600 font-bold">✕</button>
            </div>

            {/* Virtual Thermal Sticker */}
            <div className="bg-zinc-50 text-black p-4 rounded-xl border border-zinc-300 text-center font-sans space-y-2 shadow-inner">
              <div className="font-black text-sm tracking-tight text-orange-600">iStore Pro • APPLE STORE</div>
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
                className="flex-1 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold rounded-xl text-xs shadow-md shadow-orange-500/20"
              >
                In Tem Máy
              </button>
              <button
                onClick={() => setSelectedDeviceForBarcode(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold"
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
