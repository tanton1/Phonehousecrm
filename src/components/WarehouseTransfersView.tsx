import React, { useState, useMemo } from 'react';
import { 
  DeviceItem, 
  ProductItem, 
  StockTransferSlip, 
  StockTransferItem, 
  WarehouseId,
  WarehouseInfo,
  UserAccount,
  WarrantyTicket
} from '../types';
import { 
  ArrowLeftRight, 
  Plus, 
  Search, 
  Truck, 
  Building2, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  FileText, 
  Printer, 
  Smartphone, 
  Package, 
  Filter, 
  ArrowRight, 
  ChevronRight, 
  Calendar, 
  User, 
  ShieldCheck,
  Check,
  X,
  AlertCircle,
  BarChart3,
  Layers,
  MapPin,
  TrendingUp,
  Boxes,
  Wrench,
  Zap,
  Award,
  Sparkles,
  CheckSquare,
  DollarSign
} from 'lucide-react';
import { getLiveTechCommissionMatrix } from '../data/techCommissionMatrix';

interface WarehouseTransfersViewProps {
  transfers: StockTransferSlip[];
  devices: DeviceItem[];
  products: ProductItem[];
  warehouses: WarehouseInfo[];
  users?: UserAccount[];
  onAddTransfer: (slip: StockTransferSlip) => void;
  onUpdateTransfer: (slip: StockTransferSlip) => void;
  onUpdateDevicesWarehouse: (deviceIds: string[], targetWarehouse: WarehouseId) => void;
  onAddWarrantyTicket?: (ticket: WarrantyTicket) => void;
}

export const WarehouseTransfersView: React.FC<WarehouseTransfersViewProps> = ({
  transfers,
  devices,
  products,
  warehouses,
  users = [],
  onAddTransfer,
  onUpdateTransfer,
  onUpdateDevicesWarehouse,
  onAddWarrantyTicket
}) => {
  // Tabs: 'SLIPS' | 'WAREHOUSES' | 'ANALYTICS'
  const [activeTab, setActiveTab] = useState<'SLIPS' | 'WAREHOUSES' | 'ANALYTICS'>('SLIPS');
  const [searchTerm, setSearchTerm] = useState('');
  const [fromWarehouseFilter, setFromWarehouseFilter] = useState<string>('ALL');
  const [toWarehouseFilter, setToWarehouseFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedWarehouseDetail, setSelectedWarehouseDetail] = useState<WarehouseId>('KHO_TONG');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const [activeSlipDetails, setActiveSlipDetails] = useState<StockTransferSlip | null>(null);
  const [printSlip, setPrintSlip] = useState<StockTransferSlip | null>(null);

  // New Slip Form State
  const [fromWarehouse, setFromWarehouse] = useState<WarehouseId>('KHO_TONG');
  const [toWarehouse, setToWarehouse] = useState<WarehouseId>('KHO_PHONEHOUSE');
  const [transporter, setTransporter] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [deviceSearchTerm, setDeviceSearchTerm] = useState('');

  // Integrated Tech Task Auto-Assignment State
  const [autoCreateTechTask, setAutoCreateTechTask] = useState(true);
  const [taskType, setTaskType] = useState<'INBOUND_QC' | 'RETAIL_REPAIR' | 'WARRANTY' | 'SPECIAL_COMPONENT'>('INBOUND_QC');
  const [selectedTechnician, setSelectedTechnician] = useState('KTV Trọng (Chuyên Màn & Ép Kính)');
  const [taskCommission, setTaskCommission] = useState<number>(100000);
  const [expectedReturnDate, setExpectedReturnDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [taskInstructions, setTaskInstructions] = useState('QC Kiểm tra 18 chức năng hàng nhập kho & làm mới máy trước khi xuất bán.');

  // Available devices in selected fromWarehouse
  const availableDevicesInSource = useMemo(() => {
    return devices.filter(d => {
      const devWarehouse = d.warehouse || 'KHO_TONG';
      const isMatchWarehouse = devWarehouse === fromWarehouse;
      const isAvailable = d.status === 'in_stock';
      return isMatchWarehouse && isAvailable;
    });
  }, [devices, fromWarehouse]);

  // Tech Commission Matrix
  const techMatrix = useMemo(() => getLiveTechCommissionMatrix(), []);

  // Auto-calculate commission based on matrix
  React.useEffect(() => {
    if (!autoCreateTechTask || selectedDeviceIds.length === 0) return;
    
    // Attempt to map taskType to Matrix Task Name
    let matrixTaskKeywords = [''];
    if (taskType === 'INBOUND_QC') matrixTaskKeywords = ['kcs', 'kiểm tra'];
    else if (taskType === 'RETAIL_REPAIR') matrixTaskKeywords = ['sửa chữa', 'main'];
    else if (taskType === 'WARRANTY') matrixTaskKeywords = ['bảo hành', 'khắc phục'];
    else if (taskType === 'SPECIAL_COMPONENT') matrixTaskKeywords = ['thay', 'pin', 'kính'];

    const matrixTask = techMatrix.tasks.find(t => 
      matrixTaskKeywords.some(kw => t.name.toLowerCase().includes(kw))
    );

    if (matrixTask) {
      // Find the model group for the first selected device
      const firstDevice = devices.find(d => d.id === selectedDeviceIds[0]);
      if (firstDevice) {
        const modelGroup = techMatrix.models.find(m => 
          m.keywords.some(k => firstDevice.model.toLowerCase().includes(k))
        );
        if (modelGroup) {
          const rate = matrixTask.rates[modelGroup.id];
          if (rate !== undefined && rate > 0) {
            setTaskCommission(rate);
          }
        }
      }
    }
  }, [taskType, selectedDeviceIds, autoCreateTechTask, techMatrix, devices]);

  // Filtered available devices by search in modal
  const modalFilteredDevices = useMemo(() => {
    if (!deviceSearchTerm) return availableDevicesInSource;
    const term = deviceSearchTerm.toLowerCase();
    return availableDevicesInSource.filter(d => 
      d.model.toLowerCase().includes(term) ||
      d.imei.includes(term) ||
      d.color.toLowerCase().includes(term) ||
      d.storage.toLowerCase().includes(term)
    );
  }, [availableDevicesInSource, deviceSearchTerm]);

  // Warehouses Inventory Summary Statistics
  const warehouseStats = useMemo(() => {
    const stats: Record<WarehouseId, {
      count: number;
      value: number;
      models: Record<string, number>;
      activeTransfersIn: number;
      activeTransfersOut: number;
    }> = {
      KHO_TONG: { count: 0, value: 0, models: {}, activeTransfersIn: 0, activeTransfersOut: 0 },
      KHO_PHONEHOUSE: { count: 0, value: 0, models: {}, activeTransfersIn: 0, activeTransfersOut: 0 },
      KHO_XSTORE: { count: 0, value: 0, models: {}, activeTransfersIn: 0, activeTransfersOut: 0 }
    };

    // Calculate devices
    devices.forEach(d => {
      if (d.status === 'in_stock') {
        const wh = (d.warehouse as WarehouseId) || 'KHO_TONG';
        if (stats[wh]) {
          stats[wh].count += 1;
          stats[wh].value += d.buyPrice || 0;
          stats[wh].models[d.model] = (stats[wh].models[d.model] || 0) + 1;
        }
      }
    });

    // Calculate active transfers
    transfers.forEach(t => {
      if (t.status === 'PENDING' || t.status === 'IN_TRANSIT') {
        if (stats[t.fromWarehouse]) {
          stats[t.fromWarehouse].activeTransfersOut += t.totalQuantity;
        }
        if (stats[t.toWarehouse]) {
          stats[t.toWarehouse].activeTransfersIn += t.totalQuantity;
        }
      }
    });

    return stats;
  }, [devices, transfers]);

  // Filtered Transfer Slips
  const filteredTransfers = useMemo(() => {
    return transfers.filter(slip => {
      const matchSearch = 
        slip.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        slip.creator.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (slip.transporter && slip.transporter.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (slip.notes && slip.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
        slip.items.some(item => 
          item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.imei && item.imei.includes(searchTerm))
        );

      const matchFrom = fromWarehouseFilter === 'ALL' || slip.fromWarehouse === fromWarehouseFilter;
      const matchTo = toWarehouseFilter === 'ALL' || slip.toWarehouse === toWarehouseFilter;
      const matchStatus = statusFilter === 'ALL' || slip.status === statusFilter;

      return matchSearch && matchFrom && matchTo && matchStatus;
    });
  }, [transfers, searchTerm, fromWarehouseFilter, toWarehouseFilter, statusFilter]);

  // Handle Toggle Device Selection in Modal
  const handleToggleSelectDevice = (id: string) => {
    if (selectedDeviceIds.includes(id)) {
      setSelectedDeviceIds(selectedDeviceIds.filter(dId => dId !== id));
    } else {
      setSelectedDeviceIds([...selectedDeviceIds, id]);
    }
  };

  const handleSelectAllDevicesInModal = () => {
    if (selectedDeviceIds.length === modalFilteredDevices.length) {
      setSelectedDeviceIds([]);
    } else {
      setSelectedDeviceIds(modalFilteredDevices.map(d => d.id));
    }
  };

  // Handle Create New Transfer Slip + Auto Tech Task Assignment (1-Step Flow)
  const handleCreateTransfer = (e: React.FormEvent) => {
    e.preventDefault();

    if (fromWarehouse === toWarehouse) {
      alert('Kho xuất và Kho nhận không được trùng nhau!');
      return;
    }

    if (selectedDeviceIds.length === 0) {
      alert('Vui lòng chọn ít nhất 1 thiết bị/máy để chuyển kho!');
      return;
    }

    const selectedDevicesList = devices.filter(d => selectedDeviceIds.includes(d.id));
    const transferItems: StockTransferItem[] = selectedDevicesList.map(d => ({
      type: 'device',
      id: d.id,
      imei: d.imei,
      name: `${d.model} ${d.storage} ${d.color}`,
      model: d.model,
      color: d.color,
      storage: d.storage,
      condition: d.condition,
      quantity: 1,
      costPrice: d.buyPrice
    }));

    const fromWhInfo = warehouses.find(w => w.id === fromWarehouse);
    const toWhInfo = warehouses.find(w => w.id === toWarehouse);

    const totalVal = transferItems.reduce((sum, item) => sum + item.costPrice * item.quantity, 0);
    const slipCode = `CK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    const newSlip: StockTransferSlip = {
      id: `TRF-${Date.now()}`,
      code: slipCode,
      fromWarehouse,
      fromWarehouseName: fromWhInfo ? fromWhInfo.name : fromWarehouse,
      toWarehouse,
      toWarehouseName: toWhInfo ? toWhInfo.name : toWarehouse,
      createdDate: new Date().toLocaleString('sv-SE').replace('T', ' '),
      creator: 'Nhật Tân (Admin Kho)',
      transporter: transporter || 'KTV Điều Vận Nội Bộ',
      status: 'IN_TRANSIT',
      items: transferItems,
      totalQuantity: transferItems.length,
      totalValue: totalVal,
      notes: notes || (autoCreateTechTask ? `[GIAO TASK KTV 1-BƯỚC] ${taskInstructions}` : 'Điều chuyển phân phối hàng hóa nội bộ giữa các chi nhánh')
    };

    // 1. Save Transfer Slip
    onAddTransfer(newSlip);

    // 2. Auto-generate Tech Tasks for each device if enabled
    if (autoCreateTechTask && onAddWarrantyTicket) {
      const issueTypeMapped = 
        taskType === 'INBOUND_QC' ? 'Khác' :
        taskType === 'RETAIL_REPAIR' ? 'Mainboard / IC Sạc' :
        taskType === 'WARRANTY' ? 'Màn Hình / Cảm Ứng' : 'Ép Kính / Thay Lưng';

      selectedDevicesList.forEach((dev, idx) => {
        const ticket: WarrantyTicket = {
          id: `TICK-TRF-${Date.now()}-${idx}`,
          ticketNumber: `TASK-${slipCode}-${idx + 1}`,
          customerName: `Hàng Lô Phân Phối (${fromWhInfo?.shortName || 'Kho Tổng'})`,
          phone: '0900000000',
          model: dev.model,
          imei: dev.imei,
          issueType: issueTypeMapped,
          taskType: taskType === 'INBOUND_QC' ? 'INBOUND_QC' : taskType === 'WARRANTY' ? 'WARRANTY' : 'RETAIL_REPAIR',
          faultDescription: `[CHUYỂN KHO 1-BƯỚC từ ${fromWhInfo?.shortName || 'Kho'} ➔ ${toWhInfo?.shortName || 'KTV'}] ${taskInstructions}`,
          status: 'received',
          isWarrantyFree: taskType === 'WARRANTY',
          receivedDate: new Date().toISOString().slice(0, 10),
          expectedReturnDate: expectedReturnDate || new Date().toISOString().slice(0, 10),
          estimatedCost: dev.buyPrice + taskCommission,
          finalCost: dev.buyPrice + taskCommission,
          technician: selectedTechnician,
          commissionAmount: taskCommission,
          techChecklist: [
            { id: '1', step: 'Kiểm tra màn hình & cảm ứng', isPassed: false },
            { id: '2', step: 'Kiểm tra Pin & Dòng sạc', isPassed: false },
            { id: '3', step: 'Kiểm tra FaceID / TouchID', isPassed: false },
            { id: '4', step: 'Kiểm tra Camera & Loa', isPassed: false },
            { id: '5', step: 'Nâng cấp / Vệ sinh máy', isPassed: false }
          ],
          solutionNotes: `Mã phiếu chuyển: ${slipCode} | Hoa hồng KTV: ${taskCommission.toLocaleString('vi-VN')} đ | Hạn hoàn thành: ${expectedReturnDate}`
        };
        onAddWarrantyTicket(ticket);
      });
    }

    // Reset & Close
    setIsCreateModalOpen(false);
    setCreateStep(1);
    setSelectedDeviceIds([]);
    setTransporter('');
    setNotes('');
    setDeviceSearchTerm('');
    
    alert(`✅ Đã xuất thành công Phiếu Chuyển Kho ${slipCode} (${selectedDevicesList.length} máy)!${autoCreateTechTask ? `\n⚡ Tự động phân công ${selectedDevicesList.length} Task lên Bảng Kanban KTV (${selectedTechnician}) với mức thưởng hoa hồng ${taskCommission.toLocaleString('vi-VN')} đ/máy.` : ''}`);
  };

  // Handle Mark Slip as Completed (Auto update warehouse of devices)
  const handleCompleteTransfer = (slip: StockTransferSlip) => {
    if (confirm(`Xác nhận đã nhận đủ ${slip.totalQuantity} máy tại ${slip.toWarehouseName} và hoàn tất nhập kho?`)) {
      const deviceIds = slip.items.filter(i => i.type === 'device').map(i => i.id);
      
      // Update devices warehouse property
      onUpdateDevicesWarehouse(deviceIds, slip.toWarehouse);

      // Update transfer slip status
      const updatedSlip: StockTransferSlip = {
        ...slip,
        status: 'COMPLETED',
        receivedDate: new Date().toLocaleString('sv-SE').replace('T', ' '),
        receiver: 'Thủ Kho Nhận Hàng (Đã Kiểm Đếm)'
      };
      onUpdateTransfer(updatedSlip);

      if (activeSlipDetails?.id === slip.id) {
        setActiveSlipDetails(updatedSlip);
      }
    }
  };

  // Handle Cancel Transfer
  const handleCancelTransfer = (slip: StockTransferSlip) => {
    if (confirm(`Bạn có chắc chắn muốn hủy phiếu chuyển kho ${slip.code}?`)) {
      const updatedSlip: StockTransferSlip = {
        ...slip,
        status: 'CANCELLED',
        notes: (slip.notes ? slip.notes + ' - ' : '') + '[ĐÃ HỦY ĐIỀU CHUYỂN]'
      };
      onUpdateTransfer(updatedSlip);
      if (activeSlipDetails?.id === slip.id) {
        setActiveSlipDetails(updatedSlip);
      }
    }
  };

  const getStatusBadge = (status: StockTransferSlip['status']) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="bg-orange-50 text-orange-800 border border-orange-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center space-x-1">
            <Clock className="w-3 h-3" />
            <span>Chờ Xuất Kho</span>
          </span>
        );
      case 'IN_TRANSIT':
        return (
          <span className="bg-orange-50 text-orange-700 border border-orange-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center space-x-1 animate-pulse">
            <Truck className="w-3 h-3" />
            <span>Đang Vận Chuyển</span>
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="bg-orange-50 text-orange-700 border border-orange-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Đã Nhập Kho Đích</span>
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="bg-zinc-100 text-zinc-600 border border-zinc-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-medium inline-flex items-center space-x-1">
            <XCircle className="w-3 h-3" />
            <span>Đã Hủy</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fadeIn pb-16">
      {/* 1. TOP HEADER & METRICS BAR */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-orange-100 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-orange-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg sm:text-xl font-black text-zinc-900 tracking-tight">
                  Quản Lý Chuyển Kho & Điều Vận 3 Chi Nhánh
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                  {transfers.length} Phiếu
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Điều chuyển máy iPhone theo 15 số IMEI & linh phụ kiện giữa <strong>Kho Tổng</strong>, <strong>Kho PhoneHouse</strong> & <strong>Kho Xstore</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center space-x-2 w-full md:w-auto">
          <button
            onClick={() => {
              setFromWarehouse('KHO_TONG');
              setToWarehouse('KHO_PHONEHOUSE');
              setSelectedDeviceIds([]);
              setIsCreateModalOpen(true);
            }}
            className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white text-xs font-black px-4 py-2.5 rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md shadow-orange-500/20 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tạo Phiếu Chuyển Kho</span>
          </button>
        </div>
      </div>

      {/* 2. 3 WAREHOUSES OVERVIEW CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
        {warehouses.map((wh) => {
          const stats = warehouseStats[wh.id] || { count: 0, value: 0, activeTransfersIn: 0, activeTransfersOut: 0 };
          const isMain = wh.isMain;

          return (
            <div 
              key={wh.id}
              onClick={() => {
                setSelectedWarehouseDetail(wh.id);
                setActiveTab('WAREHOUSES');
              }}
              className={`bg-white border rounded-2xl sm:rounded-3xl p-4 sm:p-5 relative overflow-hidden transition-all hover:shadow-md cursor-pointer ${
                selectedWarehouseDetail === wh.id && activeTab === 'WAREHOUSES'
                  ? 'border-orange-500 ring-2 ring-orange-500/20'
                  : 'border-orange-100 hover:border-orange-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-1.5">
                    <Building2 className={`w-4 h-4 ${isMain ? 'text-orange-600' : 'text-zinc-700'}`} />
                    <span className="font-mono text-[10px] font-bold text-zinc-600 uppercase tracking-wider">{wh.code}</span>
                    {isMain && (
                      <span className="bg-orange-100 text-orange-700 text-[9px] font-bold px-1.5 py-0.2 rounded border border-orange-200">
                        Kho Trung Tâm
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-black text-zinc-900 mt-1">{wh.name}</h3>
                  <p className="text-[11px] text-zinc-500 flex items-center mt-0.5 line-clamp-1">
                    <MapPin className="w-3 h-3 mr-1 text-zinc-400 shrink-0" />
                    {wh.address}
                  </p>
                </div>

                <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-xs">
                  {stats.count}
                </div>
              </div>

              {/* Stats Numbers */}
              <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-zinc-100">
                <div className="bg-zinc-50/80 p-2.5 rounded-xl border border-zinc-100">
                  <div className="text-[10px] font-bold text-zinc-600 uppercase">Tồn Kho Khả Dụng</div>
                  <div className="text-sm font-black text-zinc-900 mt-0.5 flex items-baseline space-x-1">
                    <span>{stats.count}</span>
                    <span className="text-[10px] text-zinc-500 font-normal">máy</span>
                  </div>
                </div>

                <div className="bg-orange-50/60 p-2.5 rounded-xl border border-orange-100">
                  <div className="text-[10px] font-bold text-orange-800 uppercase">Tổng Giá Vốn Tồn</div>
                  <div className="text-xs font-black text-orange-600 mt-0.5 font-mono">
                    {(stats.value / 1000000).toFixed(1)} tr
                  </div>
                </div>
              </div>

              {/* Transit badge */}
              {(stats.activeTransfersIn > 0 || stats.activeTransfersOut > 0) && (
                <div className="mt-2 text-[10px] flex items-center justify-between text-zinc-500 bg-orange-50/60 p-1.5 rounded-lg border border-orange-100 font-medium">
                  <span className="text-orange-700">Đang điều vận:</span>
                  <span className="font-bold text-orange-800">
                    +{stats.activeTransfersIn} máy đến / -{stats.activeTransfersOut} máy đi
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 3. NAVIGATION TABS */}
      <div className="flex items-center space-x-2 border-b border-zinc-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('SLIPS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'SLIPS'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Danh Sách Phiếu Chuyển Kho ({transfers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('WAREHOUSES')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'WAREHOUSES'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Tồn Kho Theo Từng Chi Nhánh</span>
        </button>

        <button
          onClick={() => setActiveTab('ANALYTICS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'ANALYTICS'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Luồng Luân Chuyển Hàng Hóa</span>
        </button>
      </div>

      {/* TAB 1: SLIPS LIST */}
      {activeTab === 'SLIPS' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-orange-100 shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              {/* Search */}
              <div className="relative sm:col-span-1">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm mã CK, IMEI, Model máy, KTV..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-8 pr-3 py-1.5 text-[11px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-orange-500"
                />
              </div>

              {/* From Warehouse Filter */}
              <div>
                <select
                  value={fromWarehouseFilter}
                  onChange={(e) => setFromWarehouseFilter(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-bold focus:outline-none focus:border-orange-500"
                >
                  <option value="ALL">Từ: Tất Cả Kho Xuất</option>
                  <option value="KHO_TONG">Từ: Kho Tổng</option>
                  <option value="KHO_PHONEHOUSE">Từ: Kho PhoneHouse</option>
                  <option value="KHO_XSTORE">Từ: Kho Xstore</option>
                </select>
              </div>

              {/* To Warehouse Filter */}
              <div>
                <select
                  value={toWarehouseFilter}
                  onChange={(e) => setToWarehouseFilter(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-bold focus:outline-none focus:border-orange-500"
                >
                  <option value="ALL">Đến: Tất Cả Kho Nhận</option>
                  <option value="KHO_TONG">Đến: Kho Tổng</option>
                  <option value="KHO_PHONEHOUSE">Đến: Kho PhoneHouse</option>
                  <option value="KHO_XSTORE">Đến: Kho Xstore</option>
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-bold focus:outline-none focus:border-orange-500"
                >
                  <option value="ALL">Tất Cả Trạng Thái</option>
                  <option value="PENDING">Chờ Xuất Kho</option>
                  <option value="IN_TRANSIT">Đang Vận Chuyển</option>
                  <option value="COMPLETED">Đã Nhập Kho Đích</option>
                  <option value="CANCELLED">Đã Hủy</option>
                </select>
              </div>
            </div>
          </div>

          {/* Transfers Table (Desktop) */}
          <div className="hidden md:block bg-white border border-orange-100 rounded-3xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs text-zinc-700">
              <thead className="bg-zinc-50 text-zinc-500 uppercase font-bold border-b border-zinc-200 text-[11px]">
                <tr>
                  <th className="px-4 py-3.5">Mã Phiếu & Ngày Tạo</th>
                  <th className="px-4 py-3.5">Lộ Trình Điều Chuyển</th>
                  <th className="px-4 py-3.5">Chi Tiết Thiết Bị & IMEI</th>
                  <th className="px-4 py-3.5 text-center">Số Lượng</th>
                  <th className="px-4 py-3.5">Tổng Giá Trị</th>
                  <th className="px-4 py-3.5">Trạng Thái</th>
                  <th className="px-4 py-3.5 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredTransfers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-zinc-500">
                      <Truck className="w-8 h-8 mx-auto mb-2 opacity-30 text-zinc-400" />
                      <p>Không tìm thấy phiếu chuyển kho nào phù hợp bộ lọc.</p>
                    </td>
                  </tr>
                ) : (
                  filteredTransfers.map((slip) => (
                    <tr key={slip.id} className="hover:bg-orange-50/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-mono font-black text-orange-600 text-xs">{slip.code}</div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">{slip.createdDate}</div>
                        <div className="text-[10px] text-zinc-400">Tạo: {slip.creator}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center space-x-1.5 font-bold text-xs text-zinc-900">
                          <span className="px-2 py-0.5 bg-zinc-100 rounded text-zinc-700 border border-zinc-200">
                            {slip.fromWarehouseName.replace(/\(.*?\)/g, '')}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-orange-500" />
                          <span className="px-2 py-0.5 bg-orange-50 rounded text-orange-700 border border-orange-200">
                            {slip.toWarehouseName.replace(/\(.*?\)/g, '')}
                          </span>
                        </div>
                        {slip.transporter && (
                          <div className="text-[10px] text-zinc-500 mt-1 flex items-center">
                            <Truck className="w-3 h-3 mr-1 text-zinc-400" />
                            <span>Vận chuyển: <strong>{slip.transporter}</strong></span>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 max-w-xs">
                        <div className="space-y-1">
                          {slip.items.slice(0, 2).map((item, i) => (
                            <div key={i} className="text-[11px] font-medium text-zinc-800 truncate">
                              • <strong>{item.model || item.name}</strong> 
                              {item.imei && <span className="font-mono text-[10px] text-zinc-500 ml-1">({item.imei.slice(-6)})</span>}
                            </div>
                          ))}
                          {slip.items.length > 2 && (
                            <span className="text-[10px] text-orange-600 font-bold">
                              + {slip.items.length - 2} máy khác...
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span className="font-black text-xs px-2.5 py-1 bg-zinc-100 rounded-lg text-zinc-900">
                          {slip.totalQuantity} máy
                        </span>
                      </td>

                      <td className="px-4 py-3.5 font-mono font-bold text-zinc-900">
                        {slip.totalValue.toLocaleString('vi-VN')} đ
                      </td>

                      <td className="px-4 py-3.5">
                        {getStatusBadge(slip.status)}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => setActiveSlipDetails(slip)}
                            className="p-1.5 bg-zinc-50 hover:bg-orange-50 text-zinc-700 rounded-lg border border-zinc-200 transition-colors"
                            title="Xem Chi Tiết Phiếu"
                          >
                            <FileText className="w-3.5 h-3.5 text-orange-600" />
                          </button>

                          <button
                            onClick={() => setPrintSlip(slip)}
                            className="p-1.5 bg-zinc-50 hover:bg-orange-50 text-zinc-700 rounded-lg border border-zinc-200 transition-colors"
                            title="In Phiếu Điều Chuyển K80/A5"
                          >
                            <Printer className="w-3.5 h-3.5 text-zinc-600" />
                          </button>

                          {slip.status === 'IN_TRANSIT' && (
                            <button
                              onClick={() => handleCompleteTransfer(slip)}
                              className="bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-black px-2.5 py-1 rounded-lg transition-all shadow-xs flex items-center space-x-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>Nhập Kho</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Transfers Cards (Mobile) */}
          <div className="md:hidden space-y-3">
            {filteredTransfers.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-zinc-300 text-zinc-500 text-xs">
                Không tìm thấy phiếu chuyển kho nào.
              </div>
            ) : (
              filteredTransfers.map((slip) => (
                <div 
                  key={slip.id} 
                  className="bg-white border border-orange-100 rounded-2xl p-4 space-y-3 shadow-xs"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono text-xs font-black text-orange-600">{slip.code}</span>
                      <div className="text-[11px] text-zinc-500 mt-0.5">{slip.createdDate}</div>
                    </div>
                    {getStatusBadge(slip.status)}
                  </div>

                  <div className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-200 text-xs space-y-1.5">
                    <div className="flex items-center space-x-1.5 font-bold text-zinc-900">
                      <span className="text-zinc-600 truncate">{slip.fromWarehouseName.replace(/\(.*?\)/g, '')}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      <span className="text-orange-700 truncate">{slip.toWarehouseName.replace(/\(.*?\)/g, '')}</span>
                    </div>

                    <div className="text-[11px] text-zinc-600 pt-1 border-t border-zinc-200 flex justify-between">
                      <span>Tổng hàng hóa: <strong>{slip.totalQuantity} máy</strong></span>
                      <span className="font-mono font-bold text-zinc-900">{slip.totalValue.toLocaleString('vi-VN')} đ</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="text-[11px] text-zinc-500">
                      Vận chuyển: <strong>{slip.transporter || 'Nội bộ'}</strong>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => setActiveSlipDetails(slip)}
                        className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-lg"
                      >
                        Chi Tiết
                      </button>

                      <button
                        onClick={() => setPrintSlip(slip)}
                        className="p-1.5 bg-zinc-100 hover:bg-orange-50 text-zinc-700 rounded-lg"
                      >
                        <Printer className="w-4 h-4 text-orange-600" />
                      </button>

                      {slip.status === 'IN_TRANSIT' && (
                        <button
                          onClick={() => handleCompleteTransfer(slip)}
                          className="px-3 py-1 bg-orange-600 text-white text-xs font-black rounded-lg shadow-xs"
                        >
                          Nhập Kho
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: WAREHOUSES INVENTORY DETAIL */}
      {activeTab === 'WAREHOUSES' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {warehouses.map((wh) => {
              const isSelected = selectedWarehouseDetail === wh.id;
              const isTong = (wh.systemType || 'TONG') === 'TONG';
              const isPhoneHouse = wh.systemType === 'PHONEHOUSE';
              const isTechSub = wh.type === 'TECHNICIAN_SUB';

              return (
                <button
                  key={wh.id}
                  onClick={() => setSelectedWarehouseDetail(wh.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? isTong 
                        ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/30'
                        : isPhoneHouse 
                          ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/30'
                          : 'bg-orange-600 text-white shadow-sm shadow-orange-600/30'
                      : isTechSub
                        ? 'bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100'
                        : isTong
                          ? 'bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100'
                          : isPhoneHouse
                            ? 'bg-orange-50 text-orange-700 border border-orange-100 hover:bg-orange-100'
                            : 'bg-orange-50 text-orange-700 border border-orange-100 hover:bg-orange-100'
                  }`}
                >
                  {isTechSub && <span>👨‍🔧</span>}
                  <span>{wh.shortName}</span>
                  <span className={`px-1.5 py-0.5 rounded-lg text-[10px] ml-1 ${
                    isSelected 
                      ? 'bg-white/20 text-white' 
                      : 'bg-white/60 text-current mix-blend-multiply'
                  }`}>
                    {warehouseStats[wh.id]?.count || 0}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Device inventory in selected warehouse */}
          <div className="bg-white border border-orange-100 rounded-3xl p-4 sm:p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-4 pb-3 border-b border-zinc-100">
              <div>
                <h3 className="font-black text-zinc-900 text-base flex items-center space-x-2">
                  <span>Danh Sách Máy Tồn Tại {warehouses.find(w => w.id === selectedWarehouseDetail)?.name}</span>
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Theo dõi chính xác từng cây iPhone đang lưu trữ thực tế tại chi nhánh này
                </p>
              </div>

              <div className="text-xs font-mono font-bold text-orange-600 bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-200">
                Tổng giá trị vốn: {((warehouseStats[selectedWarehouseDetail]?.value || 0) / 1000000).toFixed(1)} triệu đ
              </div>
            </div>

            {/* Device list table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-700">
                <thead className="bg-zinc-50 text-zinc-500 uppercase font-bold border-b border-zinc-200 text-[11px]">
                  <tr>
                    <th className="px-3 py-3">Mã & Số IMEI (15 số)</th>
                    <th className="px-3 py-3">Model & Phiên Bản</th>
                    <th className="px-3 py-3">Màu Sắc & Dung Lượng</th>
                    <th className="px-3 py-3">Tình Trạng & Pin</th>
                    <th className="px-3 py-3">Giá Vốn</th>
                    <th className="px-3 py-3">Giá Bán Niêm Yết</th>
                    <th className="px-3 py-3 text-right">Hành Động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {devices.filter(d => (d.warehouse || 'KHO_TONG') === selectedWarehouseDetail && d.status === 'in_stock').length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                        Kho hiện đang trống hoặc chưa có máy nào nhập kho này.
                      </td>
                    </tr>
                  ) : (
                    devices
                      .filter(d => (d.warehouse || 'KHO_TONG') === selectedWarehouseDetail && d.status === 'in_stock')
                      .map((d) => (
                        <tr key={d.id} className="hover:bg-orange-50/30">
                          <td className="px-3 py-3">
                            <div className="font-mono font-black text-orange-600">{d.id}</div>
                            <div className="font-mono text-zinc-900 font-bold">{d.imei}</div>
                          </td>

                          <td className="px-3 py-3 font-bold text-zinc-900">
                            {d.model}
                            <span className="text-[10px] text-zinc-500 ml-1 font-normal">({d.region})</span>
                          </td>

                          <td className="px-3 py-3">
                            <div>{d.color}</div>
                            <span className="font-mono text-xs font-bold text-orange-700">{d.storage}</span>
                          </td>

                          <td className="px-3 py-3">
                            <span className="px-2 py-0.5 bg-zinc-100 text-zinc-800 rounded text-[10px] font-bold border border-zinc-200">
                              {d.condition}
                            </span>
                            <div className="text-[10px] text-orange-700 font-bold mt-0.5">Pin {d.batteryHealth}%</div>
                          </td>

                          <td className="px-3 py-3 font-mono text-zinc-600">
                            {d.buyPrice.toLocaleString('vi-VN')} đ
                          </td>

                          <td className="px-3 py-3 font-mono font-bold text-zinc-900">
                            {d.sellPrice.toLocaleString('vi-VN')} đ
                          </td>

                          <td className="px-3 py-3 text-right">
                            <button
                              onClick={() => {
                                setFromWarehouse(selectedWarehouseDetail);
                                setToWarehouse(selectedWarehouseDetail === 'KHO_TONG' ? 'KHO_PHONEHOUSE' : 'KHO_TONG');
                                setSelectedDeviceIds([d.id]);
                                setIsCreateModalOpen(true);
                              }}
                              className="px-2.5 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-[11px] rounded-lg border border-orange-200 transition-colors"
                            >
                              Chuyển Kho
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ANALYTICS & TRANSFER ROUTES */}
      {activeTab === 'ANALYTICS' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Route 1: Kho Tổng -> PhoneHouse */}
            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-orange-100 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-orange-600 uppercase">Tuyến Phân Phối 1</span>
                <span className="p-1.5 bg-orange-50 text-orange-600 rounded-lg">
                  <ArrowRight className="w-4 h-4" />
                </span>
              </div>
              <h4 className="text-sm font-bold text-zinc-900">Kho Tổng ➔ Kho PhoneHouse (Cầu Giấy)</h4>
              <p className="text-xs text-zinc-500">
                Xuất hàng bán lẻ cho showroom chính Cầu Giấy
              </p>
              <div className="pt-2 border-t border-zinc-100 flex justify-between text-xs">
                <span className="text-zinc-500">Số phiếu đã thực hiện:</span>
                <strong className="text-zinc-900 font-bold">
                  {transfers.filter(t => t.fromWarehouse === 'KHO_TONG' && t.toWarehouse === 'KHO_PHONEHOUSE').length} phiếu
                </strong>
              </div>
            </div>

            {/* Route 2: Kho Tổng -> Xstore */}
            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-orange-100 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-orange-600 uppercase">Tuyến Phân Phối 2</span>
                <span className="p-1.5 bg-orange-50 text-orange-600 rounded-lg">
                  <ArrowRight className="w-4 h-4" />
                </span>
              </div>
              <h4 className="text-sm font-bold text-zinc-900">Kho Tổng ➔ Kho Xstore (Trần Duy Hưng)</h4>
              <p className="text-xs text-zinc-500">
                Xuất hàng cho chi nhánh Xstore Trần Duy Hưng
              </p>
              <div className="pt-2 border-t border-zinc-100 flex justify-between text-xs">
                <span className="text-zinc-500">Số phiếu đã thực hiện:</span>
                <strong className="text-zinc-900 font-bold">
                  {transfers.filter(t => t.fromWarehouse === 'KHO_TONG' && t.toWarehouse === 'KHO_XSTORE').length} phiếu
                </strong>
              </div>
            </div>

            {/* Route 3: PhoneHouse <-> Xstore */}
            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-orange-100 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-orange-600 uppercase">Tuyến Cân Đối Chi Nhánh</span>
                <span className="p-1.5 bg-orange-50 text-orange-600 rounded-lg">
                  <ArrowLeftRight className="w-4 h-4" />
                </span>
              </div>
              <h4 className="text-sm font-bold text-zinc-900">PhoneHouse ⮀ Xstore</h4>
              <p className="text-xs text-zinc-500">
                Điều chuyển hỗ trợ khách xem máy hoặc cân bằng tồn kho
              </p>
              <div className="pt-2 border-t border-zinc-100 flex justify-between text-xs">
                <span className="text-zinc-500">Số phiếu đã thực hiện:</span>
                <strong className="text-zinc-900 font-bold">
                  {transfers.filter(t => (t.fromWarehouse === 'KHO_PHONEHOUSE' && t.toWarehouse === 'KHO_XSTORE') || (t.fromWarehouse === 'KHO_XSTORE' && t.toWarehouse === 'KHO_PHONEHOUSE')).length} phiếu
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: TẠO PHIẾU CHUYỂN KHO & PHÂN CÔNG TASK KTV (1 BƯỚC) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-3xl sm:max-w-3xl overflow-hidden shadow-2xl flex flex-col border border-orange-200">
            {/* Header with PhoneHouse Brand Gradient */}
            <div className="bg-gradient-to-r from-orange-600 via-orange-500 to-orange-500 text-white px-5 py-3.5 flex items-center justify-between shrink-0 shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/30 shadow-inner">
                  <ArrowLeftRight className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-black text-base tracking-tight">Quy Trình Điều Chuyển & Giao Task KTV (1-Bước)</h3>
                    <span className="px-2 py-0.5 bg-white/20 text-white text-[10px] font-black rounded-full border border-white/30 uppercase">
                      PHONEHOUSE OPTIMIZED
                    </span>
                  </div>
                  <p className="text-[11px] text-orange-100">
                    Phân phối hàng hóa kho tổng, giao việc KTV & gắn hoa hồng tự động chỉ với 1 lượt thao tác
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setCreateStep(1);
                }}
                className="text-white/80 hover:text-white p-1.5 hover:bg-white/10 rounded-xl cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stepper Navigation Bar */}
            <div className="bg-orange-50/70 border-b border-orange-100 px-4 py-2.5 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-1 sm:space-x-2 w-full max-w-xl mx-auto justify-between">
                {/* Step 1 */}
                <button
                  type="button"
                  onClick={() => setCreateStep(1)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    createStep === 1 
                      ? 'bg-gradient-to-r from-orange-500 to-orange-500 text-white shadow-md shadow-orange-500/20' 
                      : 'text-zinc-600 hover:bg-orange-100/60'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    createStep === 1 ? 'bg-white text-orange-600' : 'bg-orange-200 text-orange-800'
                  }`}>1</span>
                  <span className="hidden sm:inline">Kho & IMEI Máy</span>
                  <span className="inline sm:hidden">Kho & IMEI</span>
                </button>

                <ChevronRight className="w-4 h-4 text-orange-300 shrink-0" />

                {/* Step 2 */}
                <button
                  type="button"
                  onClick={() => {
                    if (selectedDeviceIds.length === 0) {
                      alert('Vui lòng chọn ít nhất 1 máy ở Bước 1!');
                      return;
                    }
                    setCreateStep(2);
                  }}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    createStep === 2 
                      ? 'bg-gradient-to-r from-orange-500 to-orange-500 text-white shadow-md shadow-orange-500/20' 
                      : 'text-zinc-600 hover:bg-orange-100/60'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    createStep === 2 ? 'bg-white text-orange-600' : 'bg-orange-200 text-orange-800'
                  }`}>2</span>
                  <span className="flex items-center space-x-1">
                    <span className="hidden sm:inline">Task KTV & Hoa Hồng</span>
                    <span className="inline sm:hidden">Giao Việc</span>
                    {autoCreateTechTask && (
                      <span className="bg-orange-400 text-zinc-900 text-[9px] px-1.5 py-0.2 rounded-full font-black">
                        ⚡ ON
                      </span>
                    )}
                  </span>
                </button>

                <ChevronRight className="w-4 h-4 text-orange-300 shrink-0" />

                {/* Step 3 */}
                <button
                  type="button"
                  onClick={() => {
                    if (selectedDeviceIds.length === 0) {
                      alert('Vui lòng chọn ít nhất 1 máy ở Bước 1!');
                      return;
                    }
                    setCreateStep(3);
                  }}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    createStep === 3 
                      ? 'bg-gradient-to-r from-orange-500 to-orange-500 text-white shadow-md shadow-orange-500/20' 
                      : 'text-zinc-600 hover:bg-orange-100/60'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    createStep === 3 ? 'bg-white text-orange-600' : 'bg-orange-200 text-orange-800'
                  }`}>3</span>
                  <span className="hidden sm:inline">Xác Nhận 1-Bước</span>
                  <span className="inline sm:hidden">Xác Nhận</span>
                </button>
              </div>
            </div>

            {/* Modal Form Container */}
            <form onSubmit={handleCreateTransfer} className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1 bg-white space-y-4">
              
              {/* STEP 1: CHỌN KHO & DANH SÁCH MÁY IMEI */}
              {createStep === 1 && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  {/* Warehouse Selection Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-gradient-to-r from-orange-50/60 to-orange-50/40 rounded-2xl border border-orange-200/80">
                    <div>
                      <label className="block text-xs font-bold text-zinc-800 mb-1 flex items-center justify-between">
                        <span>Kho Xuất Hàng (Kho Nguồn) *</span>
                        <span className="text-[10px] text-orange-600 font-semibold">Tồn khả dụng</span>
                      </label>
                      <select
                        value={fromWarehouse}
                        onChange={(e) => {
                          setFromWarehouse(e.target.value as WarehouseId);
                          setSelectedDeviceIds([]);
                        }}
                        className="w-full bg-white border border-orange-200 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 focus:border-orange-500 shadow-xs"
                      >
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({warehouseStats[w.id]?.count || 0} máy khả dụng)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-800 mb-1 flex items-center justify-between">
                        <span>Kho Nhận Hàng (Kho Đích) *</span>
                        {toWarehouse.includes('KTV') && (
                          <span className="text-[10px] text-orange-700 font-bold bg-orange-100 px-1.5 py-0.5 rounded">
                            🛠️ Kho Kỹ Thuật
                          </span>
                        )}
                      </label>
                      <select
                        value={toWarehouse}
                        onChange={(e) => {
                          const targetWh = e.target.value as WarehouseId;
                          setToWarehouse(targetWh);
                          if (targetWh.includes('KTV') || targetWh.includes('TECH')) {
                            setAutoCreateTechTask(true);
                          }
                        }}
                        className="w-full bg-white border border-orange-200 rounded-xl px-3 py-2 text-xs font-bold text-orange-700 focus:border-orange-500 shadow-xs"
                      >
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id} disabled={w.id === fromWarehouse}>
                            {w.name} {w.id === fromWarehouse ? '(Trùng kho xuất)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Transporter & Notes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">KTV / Người Vận Chuyển Nội Bộ</label>
                      <input
                        type="text"
                        value={transporter}
                        onChange={(e) => setTransporter(e.target.value)}
                        placeholder="VD: KTV Minh Đức (Chuyển nội bộ)"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-1.5 text-xs text-zinc-900 focus:bg-white focus:border-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">Ghi Chú Đơn Hàng / Lý Do</label>
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="VD: Chuyển lô 13PM kiểm tra fix màn xanh"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-1.5 text-xs text-zinc-900 focus:bg-white focus:border-orange-500"
                      />
                    </div>
                  </div>

                  {/* Device List Picker */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-zinc-50 p-2.5 rounded-xl border border-zinc-200">
                      <div className="flex items-center space-x-2 shrink-0">
                        <Smartphone className="w-4 h-4 text-orange-600" />
                        <span className="text-xs font-bold text-zinc-900">
                          <span className="hidden sm:inline">Chọn Máy Trong Kho</span>
                          <span className="inline sm:hidden">Chọn Máy</span>
                           ({selectedDeviceIds.length}/{modalFilteredDevices.length})
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={deviceSearchTerm}
                            onChange={(e) => setDeviceSearchTerm(e.target.value)}
                            placeholder="Lọc IMEI, model..."
                            className="bg-white border border-zinc-200 rounded-lg pl-8 pr-2 py-1 text-[11px] text-zinc-800 w-36 sm:w-44 focus:border-orange-500"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleSelectAllDevicesInModal}
                          className="text-[11px] text-orange-700 font-bold px-2.5 py-1 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 cursor-pointer"
                        >
                          {selectedDeviceIds.length === modalFilteredDevices.length ? 'Bỏ chọn' : 'Chọn tất cả'}
                        </button>
                      </div>
                    </div>

                    <div className="border border-zinc-200 rounded-2xl max-h-48 sm:max-h-56 overflow-y-auto divide-y divide-zinc-100 bg-white">
                      {modalFilteredDevices.length === 0 ? (
                        <div className="p-6 text-center text-xs text-zinc-500 italic">
                          Không tìm thấy máy phù hợp nào trong kho xuất này.
                        </div>
                      ) : (
                        modalFilteredDevices.map((dev) => {
                          const isSelected = selectedDeviceIds.includes(dev.id);

                          return (
                            <div 
                              key={dev.id}
                              onClick={() => handleToggleSelectDevice(dev.id)}
                              className={`p-2.5 flex items-center justify-between transition-colors cursor-pointer text-xs ${
                                isSelected ? 'bg-orange-50/90 text-zinc-900 font-medium' : 'hover:bg-zinc-50 text-zinc-700'
                              }`}
                            >
                              <div className="flex items-center space-x-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="rounded text-orange-500 focus:ring-orange-400 w-4 h-4 cursor-pointer"
                                />
                                <div>
                                  <div className="font-bold text-zinc-900">{dev.model} {dev.storage} <span className="text-zinc-500 font-normal">({dev.color})</span></div>
                                  <div className="text-[11px] text-zinc-500 font-mono">
                                    IMEI: <strong className="text-zinc-800">{dev.imei}</strong> • Pin {dev.batteryHealth}% • {dev.condition}
                                  </div>
                                </div>
                              </div>

                              <div className="text-right font-mono">
                                <div className="font-bold text-zinc-900">{dev.buyPrice.toLocaleString('vi-VN')} đ</div>
                                <span className="text-[10px] text-zinc-400">Giá nhập gốc</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: PHÂN CÔNG TASK KTV & ĐỊNH MỨC HOA HỒNG */}
              {createStep === 2 && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  {/* Auto Task Toggle Box */}
                  <div className="p-3.5 bg-gradient-to-r from-orange-500 to-orange-500 rounded-2xl text-white shadow-md flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl">
                        <Zap className="w-5 h-5 text-orange-200" />
                      </div>
                      <div>
                        <h4 className="font-black text-sm">Tự Động Tạo Task & Phân Công KTV</h4>
                        <p className="text-[11px] text-orange-100">
                          Tự động đẩy {selectedDeviceIds.length} máy lên Bảng Kanban KTV & tính hoa hồng ngay khi xuất phiếu
                        </p>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={autoCreateTechTask} 
                        onChange={(e) => setAutoCreateTechTask(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-white/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-white/90"></div>
                    </label>
                  </div>

                  {autoCreateTechTask ? (
                    <div className="p-4 bg-orange-50/40 border border-orange-200 rounded-2xl space-y-3.5">
                      {/* Task Type Grid */}
                      <div>
                        <label className="block text-xs font-bold text-zinc-800 mb-1.5 flex items-center space-x-1">
                          <Wrench className="w-3.5 h-3.5 text-orange-600" />
                          <span>Loại Task Kỹ Thuật Cần Xử Lý *</span>
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { id: 'INBOUND_QC', name: 'KCS Hàng Nhập Kho', desc: 'Kiểm tra 18 bước', defaultComm: 50000 },
                            { id: 'RETAIL_REPAIR', name: 'Sửa Chữa Nâng Cấp', desc: 'Sàng cáp, fix màn', defaultComm: 120000 },
                            { id: 'WARRANTY', name: 'Bảo Hành Khắc Phục', desc: 'Xử lý lỗi bảo hành', defaultComm: 80000 },
                            { id: 'SPECIAL_COMPONENT', name: 'Thay Linh Kiện Special', desc: 'Pin Pisen, Kính', defaultComm: 100000 }
                          ].map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setTaskType(t.id as any);
                                setTaskCommission(t.defaultComm);
                              }}
                              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                taskType === t.id
                                  ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                                  : 'bg-white text-zinc-800 border-zinc-200 hover:border-orange-300'
                              }`}
                            >
                              <div className="font-bold text-xs">{t.name}</div>
                              <div className={`text-[10px] mt-0.5 ${taskType === t.id ? 'text-orange-100' : 'text-zinc-500'}`}>
                                {t.desc}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tech Assignee & Commission Inputs */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-xs font-bold text-zinc-800 mb-1">
                            Kỹ Thuật Viên Phụ Trách Task *
                          </label>
                          <select
                            value={selectedTechnician}
                            onChange={(e) => setSelectedTechnician(e.target.value)}
                            className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 focus:border-orange-500"
                          >
                            <option value="KTV Trọng (Chuyên Màn & Ép Kính)">KTV Trọng (Chuyên Màn & Ép Kính)</option>
                            <option value="KTV Nam (Chuyên Mainboard & FaceID)">KTV Nam (Chuyên Mainboard & FaceID)</option>
                            <option value="KTV Dương (Chuyên Thay Pin & Chỉnh Chuẩn KCS)">KTV Dương (Chuyên Thay Pin & KCS)</option>
                            {users.filter(u => u.role === 'TECHNICIAN' || u.role === 'ADMIN').map(u => (
                              <option key={u.id} value={`${u.name} (${u.role})`}>{u.name} - {u.email}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-zinc-800 mb-1 flex items-center justify-between">
                            <span className="flex items-center space-x-1">
                              <Award className="w-3.5 h-3.5 text-orange-600" />
                              <span>Mức Thưởng Hoa Hồng KTV / Máy (VNĐ) *</span>
                            </span>
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              value={taskCommission}
                              onChange={(e) => setTaskCommission(Number(e.target.value))}
                              step={10000}
                              className="w-full bg-white border border-orange-300 rounded-xl px-3 py-2 text-xs font-mono font-black text-orange-700 focus:border-orange-500"
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                              {[50000, 100000, 150000].map((amt) => (
                                <button
                                  key={amt}
                                  type="button"
                                  onClick={() => setTaskCommission(amt)}
                                  className="px-1.5 py-0.5 bg-orange-100 hover:bg-orange-200 text-orange-800 text-[9px] font-bold rounded"
                                >
                                  {(amt/1000).toFixed(0)}k
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Deadline & Instructions */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-zinc-700 mb-1">Hạn Trả Máy (Deadline)</label>
                          <input
                            type="date"
                            value={expectedReturnDate}
                            onChange={(e) => setExpectedReturnDate(e.target.value)}
                            className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-1.5 text-xs text-zinc-900 focus:border-orange-500"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-zinc-700 mb-1">Mô Tả Yêu Cầu Kỹ Thuật Chi Tiết</label>
                          <input
                            type="text"
                            value={taskInstructions}
                            onChange={(e) => setTaskInstructions(e.target.value)}
                            placeholder="VD: Kiểm tra sàng cáp IC màn gốc, dán ron áp suất kỹ..."
                            className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-1.5 text-xs text-zinc-900 focus:border-orange-500"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-zinc-500 bg-zinc-50 rounded-2xl border border-zinc-200 border-dashed">
                      Đã tắt tính năng tự động tạo Task KTV. Phiếu chỉ thực hiện chuyển kho thuần túy.
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: XÁC NHẬN PHIẾU XUẤT 1-BƯỚC */}
              {createStep === 3 && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="bg-gradient-to-r from-orange-50 via-orange-50 to-orange-50 p-4 rounded-2xl border border-orange-200 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-orange-200/60">
                      <div className="flex items-center space-x-2">
                        <Sparkles className="w-5 h-5 text-orange-600" />
                        <h4 className="font-black text-sm text-zinc-900">Tóm Tắt Phiếu Xuất & Phân Công Tự Động</h4>
                      </div>
                      <span className="text-xs font-black text-orange-700 bg-orange-100 px-2.5 py-0.5 rounded-full">
                        {selectedDeviceIds.length} Máy Chọn
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Transfer Summary */}
                      <div className="bg-white p-3 rounded-xl border border-orange-100 space-y-1.5">
                        <div className="text-[10px] text-zinc-500 uppercase font-bold">1. Tuyến Vận Chuyển</div>
                        <div className="font-bold text-zinc-900 flex items-center space-x-1">
                          <span>{warehouses.find(w => w.id === fromWarehouse)?.shortName}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-orange-500" />
                          <span className="text-orange-700">{warehouses.find(w => w.id === toWarehouse)?.shortName}</span>
                        </div>
                        <div className="text-[11px] text-zinc-600">
                          Người vận chuyển: <strong className="text-zinc-800">{transporter || 'Nội bộ'}</strong>
                        </div>
                        <div className="text-[11px] text-zinc-600">
                          Tổng giá vốn nhập: <strong className="text-orange-600 font-mono">
                            {devices.filter(d => selectedDeviceIds.includes(d.id)).reduce((s, d) => s + d.buyPrice, 0).toLocaleString('vi-VN')} đ
                          </strong>
                        </div>
                      </div>

                      {/* Tech Task Summary */}
                      <div className="bg-white p-3 rounded-xl border border-orange-100 space-y-1.5">
                        <div className="text-[10px] text-zinc-500 uppercase font-bold">2. Task KTV & Thưởng</div>
                        {autoCreateTechTask ? (
                          <>
                            <div className="font-bold text-zinc-900">{selectedTechnician}</div>
                            <div className="text-[11px] text-zinc-600">
                              Loại công việc: <strong className="text-orange-700">{taskType}</strong>
                            </div>
                            <div className="text-[11px] text-zinc-600">
                              Hoa hồng mỗi máy: <strong className="text-orange-700 font-mono font-bold">+{taskCommission.toLocaleString('vi-VN')} đ</strong>
                            </div>
                          </>
                        ) : (
                          <div className="text-zinc-400 italic text-[11px]">Không tạo Task KTV</div>
                        )}
                      </div>
                    </div>

                    {/* Final Cost Calculation Preview Formula */}
                    <div className="p-3 bg-white rounded-xl border border-orange-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase block">Dự Báo Giá Vốn Cuối Cùng Trung Bình / Máy (Cost_Final)</span>
                        <div className="font-mono font-bold text-zinc-900 text-sm mt-0.5">
                          {selectedDeviceIds.length > 0 ? (
                            Math.round(
                              (devices.filter(d => selectedDeviceIds.includes(d.id)).reduce((s, d) => s + d.buyPrice, 0) / selectedDeviceIds.length) + (autoCreateTechTask ? taskCommission : 0)
                            ).toLocaleString('vi-VN')
                          ) : 0} đ <span className="text-zinc-500 text-[10px] font-normal">(Chưa gồm linh kiện tiêu hao khi KTV xử lý)</span>
                        </div>
                      </div>

                      <div className="text-[10px] bg-orange-50 text-orange-800 p-2 rounded-lg border border-orange-200 font-mono font-semibold">
                        Cost_Final = Cost_Goc + Commission_KTV + Cost_LinhKien
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Sticky Bottom Navigation */}
              <div className="pt-3 border-t border-zinc-200 flex justify-between items-center bg-white sticky bottom-0 z-10 shrink-0">
                <div className="text-xs text-zinc-600 flex items-center space-x-2">
                  <span className="font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                    Đã chọn {selectedDeviceIds.length} máy
                  </span>
                  <span className="text-zinc-400">|</span>
                  <span>Bước {createStep}/3</span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateModalOpen(false);
                      setCreateStep(1);
                    }}
                    className="px-3.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Hủy
                  </button>

                  {createStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setCreateStep((createStep - 1) as 1 | 2)}
                      className="px-3.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      ⬅ Quay Lại
                    </button>
                  )}

                  {createStep < 3 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedDeviceIds.length === 0) {
                          alert('Vui lòng chọn ít nhất 1 máy để tiếp tục!');
                          return;
                        }
                        setCreateStep((createStep + 1) as 2 | 3);
                      }}
                      className="px-4 py-1.5 bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white font-bold rounded-xl text-xs shadow-md shadow-orange-500/20 active:scale-95 transition-all cursor-pointer flex items-center space-x-1"
                    >
                      <span>Tiếp Tục</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="px-5 py-2 bg-gradient-to-r from-orange-600 via-orange-500 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white font-black rounded-xl text-xs shadow-md shadow-orange-500/20 active:scale-95 transition-all cursor-pointer flex items-center space-x-1.5"
                    >
                      <Zap className="w-4 h-4 text-orange-200" />
                      <span>Xác Nhận Tạo Phiếu & Giao Task KTV (1-Bước)</span>
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CHI TIẾT PHIẾU CHUYỂN KHO */}
      {activeSlipDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl border border-orange-200 flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-orange-50 via-orange-50/50 to-white px-5 py-4 border-b border-orange-100 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <FileText className="w-5 h-5 text-orange-600" />
                <div>
                  <h3 className="font-black text-zinc-900 text-base">
                    Chi Tiết Phiếu Chuyển Kho {activeSlipDetails.code}
                  </h3>
                  <span className="text-[11px] text-zinc-500">{activeSlipDetails.createdDate}</span>
                </div>
              </div>
              <button 
                onClick={() => setActiveSlipDetails(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1.5 hover:bg-zinc-100 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1 text-xs">
              {/* Route Banner */}
              <div className="p-3.5 bg-orange-50/70 border border-orange-200 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase font-bold">Kho Xuất Hàng</div>
                  <strong className="text-zinc-900 text-sm">{activeSlipDetails.fromWarehouseName}</strong>
                </div>
                <div className="p-2 bg-white rounded-full border border-orange-200 text-orange-600 shadow-xs">
                  <ArrowRight className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase font-bold">Kho Nhận Hàng</div>
                  <strong className="text-orange-700 text-sm">{activeSlipDetails.toWarehouseName}</strong>
                </div>
              </div>

              {/* Status and Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-zinc-50 p-3 rounded-xl border border-zinc-200">
                <div>
                  <span className="text-zinc-500 text-[10px] block">Trạng thái:</span>
                  <div className="mt-0.5">{getStatusBadge(activeSlipDetails.status)}</div>
                </div>
                <div>
                  <span className="text-zinc-500 text-[10px] block">Người tạo phiếu:</span>
                  <strong className="text-zinc-800">{activeSlipDetails.creator}</strong>
                </div>
                <div>
                  <span className="text-zinc-500 text-[10px] block">Người vận chuyển:</span>
                  <strong className="text-zinc-800">{activeSlipDetails.transporter || 'Nội bộ'}</strong>
                </div>
                <div>
                  <span className="text-zinc-500 text-[10px] block">Tổng giá trị vốn:</span>
                  <strong className="text-orange-600 font-mono">{activeSlipDetails.totalValue.toLocaleString('vi-VN')} đ</strong>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <h4 className="font-black text-zinc-900 uppercase text-[11px] tracking-wider flex items-center space-x-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-orange-600" />
                  <span>Danh Sách Máy Trong Phiếu ({activeSlipDetails.items.length} thiết bị)</span>
                </h4>

                <div className="border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-100">
                  {activeSlipDetails.items.map((item, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between hover:bg-zinc-50">
                      <div>
                        <div className="font-bold text-zinc-900">{item.name}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">
                          IMEI: <strong className="text-zinc-800">{item.imei}</strong> {item.condition && `• ${item.condition}`}
                        </div>
                      </div>
                      <div className="text-right font-mono font-bold text-zinc-900">
                        {item.costPrice.toLocaleString('vi-VN')} đ
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {activeSlipDetails.notes && (
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                  <span className="text-[10px] text-zinc-500 font-bold block mb-0.5">Ghi chú điều chuyển:</span>
                  <p className="text-zinc-700 italic">{activeSlipDetails.notes}</p>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex justify-between items-center">
              <button
                onClick={() => {
                  setPrintSlip(activeSlipDetails);
                  setActiveSlipDetails(null);
                }}
                className="px-3.5 py-2 bg-white hover:bg-orange-50 text-zinc-700 border border-zinc-200 rounded-xl font-bold flex items-center space-x-1.5"
              >
                <Printer className="w-4 h-4 text-orange-600" />
                <span>In Phiếu Điều Chuyển</span>
              </button>

              <div className="flex items-center space-x-2">
                {activeSlipDetails.status === 'IN_TRANSIT' && (
                  <>
                    <button
                      onClick={() => handleCancelTransfer(activeSlipDetails)}
                      className="px-3.5 py-2 bg-zinc-200 hover:bg-rose-50 hover:text-rose-600 text-zinc-700 rounded-xl font-bold"
                    >
                      Hủy Phiếu
                    </button>

                    <button
                      onClick={() => handleCompleteTransfer(activeSlipDetails)}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-black shadow-md shadow-orange-600/20 flex items-center space-x-1"
                    >
                      <Check className="w-4 h-4" />
                      <span>Xác Nhận Nhập Kho Đích</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => setActiveSlipDetails(null)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-bold"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: IN PHIẾU ĐIỀU CHUYỂN HÀNG HÓA K80 / A5 */}
      {printSlip && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-orange-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <span className="font-black text-sm text-zinc-900">Phiếu Giao Nhận Điều Chuyển Kho</span>
              <button onClick={() => setPrintSlip(null)} className="text-zinc-400 hover:text-zinc-600 font-bold">✕</button>
            </div>

            {/* Virtual Slip */}
            <div className="bg-zinc-50 text-black p-4 rounded-xl border border-zinc-300 text-xs font-mono space-y-2 shadow-inner">
              <div className="text-center font-black text-sm uppercase text-orange-600">PHONE HOUSE APPLE PREMIUM</div>
              <div className="text-center text-[10px] text-zinc-600">BIÊN BẢN ĐIỀU CHUYỂN HÀNG HÓA NỘI BỘ</div>
              <div className="border-b border-dashed border-zinc-400 my-2" />

              <div className="flex justify-between font-bold">
                <span>Số Phiếu:</span>
                <span>{printSlip.code}</span>
              </div>
              <div className="flex justify-between">
                <span>Ngày tạo:</span>
                <span>{printSlip.createdDate}</span>
              </div>
              <div className="flex justify-between">
                <span>Kho Xuất:</span>
                <span className="font-bold">{printSlip.fromWarehouseName}</span>
              </div>
              <div className="flex justify-between">
                <span>Kho Nhận:</span>
                <span className="font-bold text-orange-600">{printSlip.toWarehouseName}</span>
              </div>
              <div className="flex justify-between">
                <span>Vận chuyển:</span>
                <span>{printSlip.transporter || 'KTV Điều Vận'}</span>
              </div>

              <div className="pt-2 border-t border-dashed border-zinc-400">
                <div className="font-bold mb-1">Danh sách thiết bị ({printSlip.items.length} cây):</div>
                <div className="space-y-1">
                  {printSlip.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between text-[11px]">
                      <span>{idx + 1}. {it.model} ({it.imei?.slice(-6)})</span>
                      <span className="font-bold">{it.costPrice.toLocaleString('vi-VN')}đ</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-dashed border-zinc-400 flex justify-between font-bold">
                <span>Tổng giá trị vốn:</span>
                <span>{printSlip.totalValue.toLocaleString('vi-VN')} đ</span>
              </div>

              {/* Signatures */}
              <div className="pt-4 grid grid-cols-3 gap-2 text-center text-[9px] text-zinc-600 font-sans">
                <div>
                  <div className="font-bold">Người Lập Phiếu</div>
                  <div className="h-10"></div>
                  <div>(Ký, ghi rõ họ tên)</div>
                </div>
                <div>
                  <div className="font-bold">Người Vận Chuyển</div>
                  <div className="h-10"></div>
                  <div>(Ký, ghi rõ họ tên)</div>
                </div>
                <div>
                  <div className="font-bold">Thủ Kho Nhận</div>
                  <div className="h-10"></div>
                  <div>(Ký, ghi rõ họ tên)</div>
                </div>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white font-bold rounded-xl text-xs shadow-md shadow-orange-500/20"
              >
                In Phiếu (Print)
              </button>
              <button
                onClick={() => setPrintSlip(null)}
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
