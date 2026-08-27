import React, { useEffect, useState, useMemo } from 'react';
import { 
  DeviceItem, 
  StockTransferSlip, 
  WarrantyTicket, 
  SalesInvoice, 
  WarehouseInfo, 
  UserAccount 
} from '../types';
import {
  DeviceLifecycleTimeline,
  fetchDeviceLifecycleTimeline,
  requestAddDeviceLifecycleNote
} from '../services/inventoryApiClient';
import { 
  X, 
  Smartphone, 
  ArrowLeftRight, 
  Wrench, 
  ShieldCheck, 
  UserCheck, 
  User, 
  Calendar, 
  MapPin, 
  Warehouse, 
  Clock, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  DollarSign, 
  Tag, 
  Copy, 
  Check, 
  Printer, 
  ShoppingCart, 
  Layers, 
  Activity, 
  Award, 
  Sparkles, 
  Camera, 
  Lock, 
  Zap, 
  CheckSquare, 
  ArrowRight,
  Filter,
  History,
  Shield,
  Eye,
  Info
} from 'lucide-react';

interface DeviceDetailModalProps {
  device: DeviceItem | null;
  isOpen: boolean;
  onClose: () => void;
  transfers?: StockTransferSlip[];
  warrantyTickets?: WarrantyTicket[];
  invoices?: SalesInvoice[];
  warehouses?: WarehouseInfo[];
  users?: UserAccount[];
  onUpdateDevice?: (device: DeviceItem) => void;
  onQuickSell?: (device: DeviceItem) => void;
  onOpenTransferModal?: (device: DeviceItem) => void;
  onPrintBarcode?: (device: DeviceItem) => void;
}

const DeviceDetailModalContent: React.FC<Omit<DeviceDetailModalProps, 'device' | 'isOpen'> & { device: DeviceItem }> = ({
  device,
  onClose,
  transfers = [],
  warrantyTickets = [],
  invoices = [],
  warehouses = [],
  onQuickSell,
  onOpenTransferModal,
  onPrintBarcode
}) => {
  const [activeTab, setActiveTab] = useState<'TIMELINE' | 'SPECS' | 'WARRANTY_TASKS' | 'CUSTODY'>('TIMELINE');
  const [timelineFilter, setTimelineFilter] = useState<'ALL' | 'TRANSFER' | 'WARRANTY' | 'CUSTODY' | 'NOTE'>('ALL');
  const [sortOrder, setSortOrder] = useState<'DESC' | 'ASC'>('DESC');
  const [copiedImei, setCopiedImei] = useState(false);

  // New Log Entry Form State
  const [isAddLogOpen, setIsAddLogOpen] = useState(false);
  const [newLogType, setNewLogType] = useState<'MANUAL_NOTE' | 'INSPECTION_NOTE' | 'FOLLOW_UP_NOTE'>('MANUAL_NOTE');
  const [newLogTitle, setNewLogTitle] = useState('');
  const [newLogDesc, setNewLogDesc] = useState('');
  const [lifecycle, setLifecycle] = useState<DeviceLifecycleTimeline | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const [timelineNoteSaving, setTimelineNoteSaving] = useState(false);

  const loadLifecycle = async () => {
    setTimelineLoading(true);
    setTimelineError('');
    try {
      const result = await fetchDeviceLifecycleTimeline({ deviceId: device.id, imei: device.imei });
      setLifecycle(result);
    } catch (error: any) {
      setTimelineError(error?.message || 'Chưa tải được lịch sử chuẩn từ server. Đang hiển thị dữ liệu dự phòng trên máy.');
    } finally {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    setLifecycle(null);
    void loadLifecycle();
  }, [device.id, device.imei]);

  const handleCopyImei = () => {
    navigator.clipboard.writeText(device.imei);
    setCopiedImei(true);
    setTimeout(() => setCopiedImei(false), 2000);
  };

  // Find related warehouse info
  const currentWarehouseInfo = warehouses.find(w => 
    w.id === device.warehouse || 
    (w.id === 'KHO_PHONEHOUSE' && (!device.warehouse || device.warehouse.includes('PHONEHOUSE') || device.warehouse.includes('Cầu Giấy'))) ||
    (w.id === 'KHO_XSTORE' && (device.warehouse?.includes('XSTORE') || device.warehouse?.includes('Đống Đa'))) ||
    (w.id === 'KHO_TONG' && (device.warehouse?.includes('TONG') || device.warehouse?.includes('Tổng')))
  );

  // 1. Gather all related Transfer Slips
  const relatedTransfers = useMemo(() => {
    return transfers.filter(slip => 
      slip.items?.some(item => item.imei === device.imei || item.id === device.id)
    );
  }, [transfers, device.imei, device.id]);

  // 2. Gather all related Warranty / QC / Repair Tickets
  const relatedWarrantyTickets = useMemo(() => {
    return warrantyTickets.filter(t => t.imei === device.imei);
  }, [warrantyTickets, device.imei]);

  // 3. Gather related Invoices (if sold)
  const relatedInvoices = useMemo(() => {
    return invoices.filter(inv => 
      inv.items?.some(item => item.imei === device.imei || item.name?.includes(device.imei))
    );
  }, [invoices, device.imei]);

  // 4. Construct Consolidated Timeline
  const consolidatedTimeline = useMemo(() => {
    const events: Array<{
      id: string;
      timestamp: string;
      category: 'TRANSFER' | 'WARRANTY' | 'CUSTODY' | 'NOTE' | 'STOCK_IN' | 'SALE';
      title: string;
      description: string;
      performedBy: string;
      badgeText?: string;
      badgeColor?: string;
      icon: any;
      iconColor: string;
      meta?: any;
    }> = [];

    // Canonical timeline from immutable server ledgers. The older client-side
    // synthesis below is kept only as an offline/backward-compatible fallback.
    if (lifecycle?.events?.length) {
      const categoryMap: Record<string, 'TRANSFER' | 'WARRANTY' | 'CUSTODY' | 'NOTE' | 'STOCK_IN' | 'SALE'> = {
        INVENTORY: 'STOCK_IN',
        TRANSFER: 'TRANSFER',
        CUSTODY: 'CUSTODY',
        TECHNICAL: 'WARRANTY',
        PARTS: 'WARRANTY',
        QC: 'WARRANTY',
        COST: 'NOTE',
        SALE: 'SALE',
        NOTE: 'NOTE'
      };
      const iconMap: Record<string, any> = {
        INVENTORY: Warehouse,
        TRANSFER: ArrowLeftRight,
        CUSTODY: UserCheck,
        TECHNICAL: Wrench,
        PARTS: Layers,
        QC: ShieldCheck,
        COST: DollarSign,
        SALE: ShoppingCart,
        NOTE: FileText
      };
      const colorMap: Record<string, string> = {
        INVENTORY: 'bg-orange-500 text-white',
        TRANSFER: 'bg-orange-600 text-white',
        CUSTODY: 'bg-rose-600 text-white',
        TECHNICAL: 'bg-orange-500 text-white',
        PARTS: 'bg-amber-600 text-white',
        QC: 'bg-emerald-600 text-white',
        COST: 'bg-zinc-700 text-white',
        SALE: 'bg-rose-600 text-white',
        NOTE: 'bg-zinc-600 text-white'
      };
      const canonicalEvents = lifecycle.events.map(event => {
        const locations = [
          event.fromLocationName && `Từ ${event.fromLocationName}`,
          event.toLocationName && `đến ${event.toLocationName}`
        ].filter(Boolean).join(' ');
        const duration = Number(event.durationMinutes || 0) > 0
          ? `Thời gian: ${Number(event.durationMinutes).toLocaleString('vi-VN')} phút.`
          : '';
        return {
          id: event.id,
          timestamp: event.occurredAt ? new Date(event.occurredAt).toLocaleString('vi-VN') : '',
          rawTimestamp: event.occurredAt,
          category: categoryMap[event.category] || 'NOTE',
          title: event.title,
          description: [event.description, locations, duration].filter(Boolean).join(' · '),
          performedBy: event.actorName || event.actorUid || 'Hệ thống',
          badgeText: event.status || event.category,
          badgeColor: event.category === 'QC'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : event.category === 'SALE'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-orange-50 text-orange-800 border-orange-200',
          icon: iconMap[event.category] || FileText,
          iconColor: colorMap[event.category] || 'bg-zinc-600 text-white',
          meta: {
            slipCode: event.category === 'TRANSFER' ? event.documentCode : null,
            ticketNumber: event.workOrderCode || (event.category === 'TECHNICAL' ? event.documentCode : null),
            invoiceNumber: event.category === 'SALE' ? event.documentCode : null,
            documentCode: event.documentCode,
            amount: event.amount,
            costAfter: event.costAfter,
            quantity: event.quantity
          }
        };
      });
      canonicalEvents.sort((a, b) => {
        const timeA = new Date(a.rawTimestamp || '').getTime() || 0;
        const timeB = new Date(b.rawTimestamp || '').getTime() || 0;
        return sortOrder === 'DESC' ? timeB - timeA : timeA - timeB;
      });
      return canonicalEvents;
    }

    // A. Initial Stock In — only render when a real source timestamp exists.
    if (device.receivedDate) events.push({
      id: `EVT-STOCKIN-${device.id}`,
      timestamp: device.receivedDate,
      category: 'STOCK_IN',
      title: `Nhập kho ban đầu (${device.supplier || 'NCC Đối tác'})`,
      description: `Máy được nhập vào hệ thống tại ${currentWarehouseInfo?.name || 'Vị trí chưa xác định'}. ${Number(device.currentCost ?? device.buyPrice ?? 0) > 0 ? `Giá vốn ghi nhận: ${Number(device.currentCost ?? device.buyPrice).toLocaleString('vi-VN')} đ. ` : ''}Tình trạng: ${device.condition}, Pin: ${device.batteryHealth}%, Mã xuất xứ: ${device.region}.`,
      performedBy: (device as any).createdByName || 'Không có dữ liệu người thực hiện',
      badgeText: 'NHẬP KHO',
      badgeColor: 'bg-orange-100 text-orange-800 border-orange-200',
      icon: Warehouse,
      iconColor: 'bg-orange-500 text-white',
      meta: {
        supplier: device.supplier,
        buyPrice: device.buyPrice,
        condition: device.condition
      }
    });

    // B. Warehouse Transfers
    relatedTransfers.forEach(slip => {
      const fromName = slip.fromWarehouseName || slip.fromWarehouse;
      const toName = slip.toWarehouseName || slip.toWarehouse;
      const isCompleted = slip.status === 'COMPLETED';

      events.push({
        id: `EVT-TRF-${slip.id}`,
        timestamp: slip.createdDate || slip.createdAt || '',
        category: 'TRANSFER',
        title: `Điều chuyển kho: ${fromName} ➔ ${toName}`,
        description: `Mã phiếu chuyển: ${slip.code}. Người tạo: ${slip.creator}. Người vận chuyển / shipper: ${slip.transporter || 'Nội bộ'}. Ghi chú: ${slip.notes || 'Điều chuyển hàng theo kế hoạch'}. Trạng thái: ${isCompleted ? 'Đã nhận tại kho đích' : 'Đang trên đường vận chuyển'}.`,
        performedBy: slip.transporter || slip.creator,
        badgeText: isCompleted ? 'ĐÃ NHẬN KHO' : 'ĐANG CHUYỂN',
        badgeColor: isCompleted ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-orange-100 text-orange-800 border-orange-200',
        icon: ArrowLeftRight,
        iconColor: isCompleted ? 'bg-orange-600 text-white' : 'bg-orange-500 text-white',
        meta: {
          slipCode: slip.code,
          from: fromName,
          to: toName,
          status: slip.status,
          transporter: slip.transporter
        }
      });
    });

    // C. Warranty & QC Tasks
    relatedWarrantyTickets.forEach(ticket => {
      const taskLabel = 
        ticket.taskType === 'INBOUND_QC' ? 'KCS Hàng Nhập Kho (18 Bước)' :
        ticket.taskType === 'RETAIL_REPAIR' ? 'Sửa Chữa / Nâng Cấp Phần Cứng' :
        ticket.taskType === 'WARRANTY' ? 'Bảo Hành Khắc Phục Lỗi' : 'Dịch Vụ Kỹ Thuật';

      events.push({
        id: `EVT-TICK-${ticket.id}`,
        timestamp: ticket.receivedDate || '',
        category: 'WARRANTY',
        title: `Task Kỹ Thuật: ${taskLabel}`,
        description: `Mã phiếu: ${ticket.ticketNumber}. KTV phụ trách: ${ticket.technician}. Vấn đề/Sự cố: ${ticket.issueType} - ${ticket.faultDescription || 'Kiểm tra tổng thể'}. Thưởng hoa hồng KTV: ${ticket.commissionAmount ? `${ticket.commissionAmount.toLocaleString('vi-VN')} đ` : '0 đ'}. Trạng thái: ${ticket.status}. ${ticket.solutionNotes ? `[Giải pháp]: ${ticket.solutionNotes}` : ''}`,
        performedBy: ticket.technician || 'KTV Kỹ Thuật',
        badgeText: ticket.status === 'ready' || ticket.status === 'delivered' ? 'KCS HOÀN TẤT' : 'ĐANG XỬ LÝ',
        badgeColor: ticket.status === 'ready' || ticket.status === 'delivered' ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-orange-100 text-orange-800 border-orange-200',
        icon: Wrench,
        iconColor: 'bg-orange-500 text-white',
        meta: {
          ticketNumber: ticket.ticketNumber,
          technician: ticket.technician,
          commission: ticket.commissionAmount,
          checklist: ticket.techChecklist,
          status: ticket.status
        }
      });
    });

    // D. Sales Invoices (if sold)
    relatedInvoices.forEach(inv => {
      events.push({
        id: `EVT-INV-${inv.id}`,
        timestamp: inv.createdAt || inv.createdDate || '',
        category: 'SALE',
        title: `Xuất bán cho khách hàng: ${inv.customerName}`,
        description: `Mã hóa đơn: ${inv.invoiceNumber}. Số điện thoại: ${inv.customerPhone}. Giá bán: ${inv.totalAmount.toLocaleString('vi-VN')} đ. Nhân viên bán hàng: ${inv.salesPerson || 'Thu ngân'}. Thời hạn bảo hành: 12 tháng tại hệ thống.`,
        performedBy: inv.salesPerson || 'Nhân viên bán hàng',
        badgeText: 'ĐÃ XUẤT BÁN',
        badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
        icon: ShoppingCart,
        iconColor: 'bg-rose-600 text-white',
        meta: {
          invoiceNumber: inv.invoiceNumber,
          customer: inv.customerName,
          phone: inv.customerPhone,
          amount: inv.totalAmount
        }
      });
    });

    // E. Device's Explicit History Logs
    if (device.history && Array.isArray(device.history)) {
      device.history.forEach(log => {
        let cat: 'TRANSFER' | 'WARRANTY' | 'CUSTODY' | 'NOTE' = 'NOTE';
        let icon = FileText;
        let color = 'bg-zinc-600 text-white';

        if (log.type === 'WAREHOUSE_TRANSFER') {
          cat = 'TRANSFER';
          icon = ArrowLeftRight;
          color = 'bg-orange-600 text-white';
        } else if (log.type === 'WARRANTY_QC') {
          cat = 'WARRANTY';
          icon = Wrench;
          color = 'bg-orange-500 text-white';
        } else if (log.type === 'RESPONSIBILITY_CHANGE') {
          cat = 'CUSTODY';
          icon = UserCheck;
          color = 'bg-rose-600 text-white';
        }

        events.push({
          id: log.id || `EVT-HIST-${Math.random()}`,
          timestamp: log.timestamp || '',
          category: cat,
          title: log.title,
          description: log.description,
          performedBy: log.performedBy || 'Không có dữ liệu người thực hiện',
          badgeText: log.statusBadge || (cat === 'CUSTODY' ? 'BÀN GIAO' : 'NHẬT KÝ'),
          badgeColor: cat === 'CUSTODY' ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-zinc-100 text-zinc-800 border-zinc-200',
          icon: icon,
          iconColor: color,
          meta: log.metadata
        });
      });
    }

    // Sort by timestamp
    events.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      return sortOrder === 'DESC' ? timeB - timeA : timeA - timeB;
    });

    return events;
  }, [device, lifecycle, relatedTransfers, relatedWarrantyTickets, relatedInvoices, currentWarehouseInfo, sortOrder]);

  // Filtered timeline
  const filteredTimeline = useMemo(() => {
    if (timelineFilter === 'ALL') return consolidatedTimeline;
    if (timelineFilter === 'TRANSFER') return consolidatedTimeline.filter(e => e.category === 'TRANSFER' || e.category === 'STOCK_IN');
    if (timelineFilter === 'WARRANTY') return consolidatedTimeline.filter(e => e.category === 'WARRANTY');
    if (timelineFilter === 'CUSTODY') return consolidatedTimeline.filter(e => e.category === 'CUSTODY');
    if (timelineFilter === 'NOTE') return consolidatedTimeline.filter(e => e.category === 'NOTE' || e.category === 'SALE');
    return consolidatedTimeline;
  }, [consolidatedTimeline, timelineFilter]);

  // Calculate current custodian
  const currentResponsiblePerson = useMemo(() => {
    if (lifecycle?.summary.currentCustodianName) {
      return lifecycle.summary.currentCustodianName;
    }
    if (device.status === 'sold') {
      return `Khách hàng: ${device.customerName || 'Đã giao'}`;
    }
    if (device.technicianAssigned) {
      return `KTV: ${device.technicianAssigned}`;
    }
    if (device.currentCustodian) {
      return device.currentCustodian;
    }
    if (relatedWarrantyTickets.length > 0 && relatedWarrantyTickets[0].status !== 'ready' && relatedWarrantyTickets[0].status !== 'delivered') {
      return `KTV: ${relatedWarrantyTickets[0].technician}`;
    }
    return currentWarehouseInfo?.manager ? `${currentWarehouseInfo.manager} (${currentWarehouseInfo.shortName})` : 'Chưa có dữ liệu người chịu trách nhiệm';
  }, [device, lifecycle, currentWarehouseInfo, relatedWarrantyTickets]);

  // Handle Add New Log Event
  const handleSaveNewLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogTitle.trim()) {
      setTimelineError('Vui lòng nhập tiêu đề ghi chú.');
      return;
    }
    setTimelineNoteSaving(true);
    setTimelineError('');
    try {
      await requestAddDeviceLifecycleNote(device.id, {
        imei: device.imei,
        noteType: newLogType,
        title: newLogTitle.trim(),
        note: newLogDesc.trim() || newLogTitle.trim()
      });
      setNewLogTitle('');
      setNewLogDesc('');
      setIsAddLogOpen(false);
      await loadLifecycle();
    } catch (error: any) {
      setTimelineError(error?.message || 'Không thể lưu ghi chú lịch sử.');
    } finally {
      setTimelineNoteSaving(false);
    }
  };

  const getStatusBadge = (status: DeviceItem['status']) => {
    switch (status) {
      case 'in_stock':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">Sẵn Hàng</span>;
      case 'reserved':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">Đang Giữ Chờ Giao</span>;
      case 'sold':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-zinc-200 text-zinc-800 border border-zinc-300">Đã Bán</span>;
      case 'warranty':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">Đang Bảo Hành</span>;
      case 'repairing':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">KTV Sửa Chữa / KCS</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-zinc-100 text-zinc-700">{status}</span>;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-3xl sm:max-w-4xl overflow-hidden shadow-2xl flex flex-col border border-orange-200">
        
        {/* Top Header Card */}
        <div className="bg-gradient-to-r from-orange-600 via-orange-500 to-orange-500 text-white px-4 sm:px-6 py-4 shrink-0 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/30 shadow-inner shrink-0">
                <Smartphone className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <h2 className="font-black text-lg sm:text-xl tracking-tight truncate">
                    {device.model} {device.storage}
                  </h2>
                  <span className="bg-white/20 text-white font-bold text-xs px-2.5 py-0.5 rounded-full border border-white/30">
                    {device.color}
                  </span>
                  <span className="bg-orange-400 text-zinc-950 font-black text-[11px] px-2 py-0.5 rounded-full uppercase">
                    {device.condition}
                  </span>
                </div>
                <div className="flex items-center space-x-3 text-xs text-orange-100 mt-1 flex-wrap gap-y-1 font-mono">
                  <div className="flex items-center space-x-1">
                    <span>IMEI:</span>
                    <strong className="text-white font-black">{device.imei}</strong>
                    <button
                      onClick={handleCopyImei}
                      className="p-1 hover:bg-white/20 rounded-md transition-colors cursor-pointer"
                      title="Sao chép IMEI"
                    >
                      {copiedImei ? <Check className="w-3.5 h-3.5 text-orange-300" /> : <Copy className="w-3.5 h-3.5 text-white/80" />}
                    </button>
                  </div>
                  <span>•</span>
                  <span>SN: <strong className="text-white">{device.serialNo || 'N/A'}</strong></span>
                  <span>•</span>
                  <span>Pin: <strong className="text-white">{device.batteryHealth}%</strong></span>
                  <span>•</span>
                  <span>{device.region}</span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 text-white rounded-xl transition-colors cursor-pointer shrink-0"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Metrics Bar on Header */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-white/20 text-xs">
            <div className="bg-white/10 backdrop-blur-xs p-2 rounded-xl border border-white/15">
              <span className="text-[10px] text-orange-100 block">Vị trí kho hiện tại</span>
              <span className="font-black text-white flex items-center space-x-1 truncate mt-0.5">
                <Warehouse className="w-3.5 h-3.5 shrink-0 text-orange-200" />
                <span className="truncate">{currentWarehouseInfo?.shortName || device.currentLocationId || device.warehouse || 'Chưa xác định vị trí'}</span>
              </span>
            </div>

            <div className="bg-white/10 backdrop-blur-xs p-2 rounded-xl border border-white/15">
              <span className="text-[10px] text-orange-100 block">Chịu trách nhiệm trực tiếp</span>
              <span className="font-black text-white flex items-center space-x-1 truncate mt-0.5">
                <UserCheck className="w-3.5 h-3.5 shrink-0 text-orange-200" />
                <span className="truncate">{currentResponsiblePerson}</span>
              </span>
            </div>

            <div className="bg-white/10 backdrop-blur-xs p-2 rounded-xl border border-white/15">
              <span className="text-[10px] text-orange-100 block">Trạng thái máy</span>
              <div className="mt-0.5">{getStatusBadge(device.status)}</div>
            </div>

            <div className="bg-white/10 backdrop-blur-xs p-2 rounded-xl border border-white/15">
              <span className="text-[10px] text-orange-100 block">Giá niêm yết bán</span>
              <span className="font-black text-white font-mono text-sm mt-0.5 block">
                {device.sellPrice.toLocaleString('vi-VN')} đ
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-orange-50/60 border-b border-orange-200/80 px-4 sm:px-6 flex items-center justify-between overflow-x-auto scrollbar-none shrink-0">
          <div className="flex space-x-1 sm:space-x-2 py-2">
            {[
              { id: 'TIMELINE', label: 'Dòng Thời Gian (Timeline)', icon: History, count: consolidatedTimeline.length },
              { id: 'SPECS', label: 'Thông Số & KCS', icon: Info },
              { id: 'WARRANTY_TASKS', label: 'Bảo Hành & Task KTV', icon: Wrench, count: relatedWarrantyTickets.length },
              { id: 'CUSTODY', label: 'Bàn Giao & Trách Nhiệm', icon: UserCheck }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                    isActive 
                      ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20' 
                      : 'text-zinc-600 hover:bg-orange-100/70'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? 'bg-white text-orange-600' : 'bg-orange-200/80 text-orange-900'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center space-x-1.5 py-2">
            {onPrintBarcode && (
              <button
                onClick={() => onPrintBarcode(device)}
                className="p-1.5 bg-white text-zinc-700 hover:text-orange-600 border border-zinc-200 hover:border-orange-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                title="In Tem Barcode"
              >
                <Printer className="w-4 h-4" />
              </button>
            )}
            {onOpenTransferModal && device.status === 'in_stock' && (
              <button
                onClick={() => onOpenTransferModal(device)}
                className="px-2.5 py-1.5 bg-white text-orange-600 hover:bg-orange-50 border border-orange-200 rounded-xl text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Chuyển Kho</span>
              </button>
            )}
            {onQuickSell && device.status === 'in_stock' && (
              <button
                onClick={() => onQuickSell(device)}
                className="px-3 py-1.5 bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white rounded-xl text-xs font-black flex items-center space-x-1 shadow-sm transition-all cursor-pointer"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Bán Máy</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Content Container */}
        <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 bg-white space-y-4">
          
          {/* TAB 1: DÒNG THỜI GIAN (TIMELINE MINH BẠCH) */}
          {activeTab === 'TIMELINE' && (
            <div className="space-y-4">

              {timelineError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                  {timelineError}
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {[
                  {
                    label: 'Vị trí hiện tại',
                    value: lifecycle?.summary.currentLocationName || currentWarehouseInfo?.name || device.warehouse || 'Chưa xác định',
                    icon: MapPin
                  },
                  {
                    label: 'Người đang giữ',
                    value: lifecycle?.summary.currentCustodianName || currentResponsiblePerson,
                    icon: UserCheck
                  },
                  {
                    label: 'Thời gian xử lý',
                    value: lifecycle ? `${lifecycle.summary.activeWorkMinutes.toLocaleString('vi-VN')} phút` : 'Đang tổng hợp',
                    icon: Clock
                  },
                  {
                    label: lifecycle?.canViewCost ? 'Giá vốn hiện tại' : 'QC / sửa lại',
                    value: lifecycle?.canViewCost
                      ? `${Number(lifecycle.summary.currentCost || 0).toLocaleString('vi-VN')} đ`
                      : `${lifecycle?.summary.qcFailCount || 0} lỗi · ${lifecycle?.summary.reworkCount || 0} sửa lại`,
                    icon: lifecycle?.canViewCost ? DollarSign : ShieldCheck
                  }
                ].map(item => {
                  const SummaryIcon = item.icon;
                  return (
                    <div key={item.label} className="min-w-0 rounded-2xl border border-orange-100 bg-gradient-to-br from-white to-orange-50/70 p-3">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                        <SummaryIcon className="h-3.5 w-3.5 text-orange-500" />
                        <span>{item.label}</span>
                      </div>
                      <p className="mt-1 truncate text-xs font-black text-zinc-900" title={item.value}>{item.value}</p>
                    </div>
                  );
                })}
              </div>

              {timelineLoading && (
                <div className="flex items-center gap-2 text-xs font-semibold text-orange-700">
                  <Activity className="h-4 w-4 animate-pulse" />
                  Đang đối chiếu các sổ kho, kỹ thuật, KCS và hóa đơn…
                </div>
              )}
              
              {/* Timeline Action Header & Filters */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-zinc-100">
                <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none">
                  <span className="text-xs font-bold text-zinc-500 flex items-center space-x-1 mr-1">
                    <Filter className="w-3.5 h-3.5 text-orange-500" />
                    <span>Lọc:</span>
                  </span>
                  {[
                    { id: 'ALL', label: 'Tất cả sự kiện' },
                    { id: 'TRANSFER', label: 'Chuyển Kho (Luân Chuyển)' },
                    { id: 'WARRANTY', label: 'Kỹ Thuật & KCS' },
                    { id: 'CUSTODY', label: 'Bàn Giao Trách Nhiệm' },
                    { id: 'NOTE', label: 'Ghi Chú & Bán' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setTimelineFilter(f.id as any)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                        timelineFilter === f.id
                          ? 'bg-orange-500 text-white'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => setSortOrder(prev => prev === 'DESC' ? 'ASC' : 'DESC')}
                    className="text-xs text-zinc-600 hover:text-orange-600 font-bold px-2 py-1 bg-zinc-50 hover:bg-orange-50 rounded-lg border border-zinc-200 cursor-pointer flex items-center space-x-1"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{sortOrder === 'DESC' ? 'Mới nhất trước' : 'Cũ nhất trước'}</span>
                  </button>

                  <button
                    onClick={() => setIsAddLogOpen(value => !value)}
                    className="text-xs bg-orange-500 hover:bg-orange-600 text-white font-bold px-2.5 py-1 rounded-lg border border-orange-500 flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm ghi chú</span>
                  </button>
                </div>
              </div>

              {/* Add New Log Event Form Modal/Dropdown */}
              {isAddLogOpen && (
                <form onSubmit={handleSaveNewLog} className="p-4 bg-orange-50/70 border border-orange-200 rounded-2xl space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-orange-950 flex items-center space-x-1.5">
                      <Sparkles className="w-4 h-4 text-orange-600" />
                      <span>Thêm ghi chú vào lịch sử IMEI</span>
                    </h4>
                    <button 
                      type="button" 
                      onClick={() => setIsAddLogOpen(false)}
                      className="text-zinc-400 hover:text-zinc-600 text-xs p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-700 mb-1">Loại ghi chú *</label>
                      <select
                        value={newLogType}
                        onChange={(e) => setNewLogType(e.target.value as any)}
                        className="w-full bg-white border border-orange-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-900 focus:border-orange-500"
                      >
                        <option value="MANUAL_NOTE">Ghi chú chung</option>
                        <option value="INSPECTION_NOTE">Ghi chú kiểm tra</option>
                        <option value="FOLLOW_UP_NOTE">Ghi chú cần theo dõi</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-zinc-700 mb-1">Tiêu đề tóm tắt *</label>
                      <input
                        type="text"
                        value={newLogTitle}
                        onChange={(e) => setNewLogTitle(e.target.value)}
                        placeholder="VD: Kiểm tra ngoại hình trước khi chuyển kho"
                        className="w-full bg-white border border-orange-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-900 focus:border-orange-500"
                      />
                    </div>
                  </div>

                  <div>
                      <label className="block text-[11px] font-bold text-zinc-700 mb-1">Nội dung chi tiết</label>
                      <textarea
                        value={newLogDesc}
                        onChange={(e) => setNewLogDesc(e.target.value)}
                        placeholder="Nêu tình trạng, lý do và việc cần tiếp tục theo dõi…"
                        rows={3}
                        className="w-full resize-none bg-white border border-orange-200 rounded-xl px-2.5 py-2 text-xs text-zinc-900 focus:border-orange-500"
                      />
                      <p className="mt-1 text-[10px] text-zinc-500">Người ghi được lấy tự động từ tài khoản đăng nhập. Ghi chú không thay đổi người giữ máy; bàn giao phải dùng đúng luồng bàn giao IMEI.</p>
                  </div>

                  <div className="flex justify-end space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddLogOpen(false)}
                      className="px-3 py-1 bg-white hover:bg-zinc-100 text-zinc-700 rounded-lg text-xs font-bold border border-zinc-200 cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={timelineNoteSaving}
                      className="px-4 py-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-xs font-black shadow-xs cursor-pointer"
                    >
                      {timelineNoteSaving ? 'Đang lưu…' : 'Lưu ghi chú'}
                    </button>
                  </div>
                </form>
              )}

              {/* Vertical Visual Timeline */}
              <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-orange-200">
                {filteredTimeline.length === 0 ? (
                  <div className="p-6 text-center text-xs text-zinc-500 italic bg-zinc-50 rounded-2xl border border-zinc-200">
                    Không có sự kiện nào khớp bộ lọc này.
                  </div>
                ) : (
                  filteredTimeline.map((event) => {
                    const EventIcon = event.icon;

                    return (
                      <div key={event.id} className="relative group">
                        {/* Timeline Node Icon */}
                        <div className={`absolute -left-6 sm:-left-8 top-1 w-6 sm:w-8 h-6 sm:h-8 rounded-full ${event.iconColor} flex items-center justify-center shadow-md ring-4 ring-white z-10`}>
                          <EventIcon className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                        </div>

                        {/* Event Card */}
                        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200/80 shadow-2xs hover:border-orange-300 hover:shadow-xs transition-all space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase ${event.badgeColor || 'bg-zinc-100 text-zinc-700 border-zinc-200'}`}>
                                {event.badgeText || event.category}
                              </span>
                              <h4 className="font-bold text-xs sm:text-sm text-zinc-900">
                                {event.title}
                              </h4>
                            </div>

                            <div className="flex items-center space-x-2 text-[11px] text-zinc-500 font-mono">
                              <Clock className="w-3 h-3 text-orange-500" />
                              <span>{event.timestamp}</span>
                            </div>
                          </div>

                          <p className="text-xs text-zinc-700 leading-relaxed">
                            {event.description}
                          </p>

                          {/* Footer Meta Row */}
                          <div className="pt-2 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <div className="flex items-center space-x-1.5 text-zinc-600 font-medium">
                              <User className="w-3 h-3 text-orange-600" />
                              <span>Người phụ trách: <strong className="text-zinc-900 font-bold">{event.performedBy}</strong></span>
                            </div>

                            {event.meta && (
                              <div className="flex items-center space-x-2 text-zinc-500">
                                {event.meta.slipCode && (
                                  <span className="bg-orange-50 text-orange-700 font-mono px-2 py-0.5 rounded border border-orange-200 font-bold">
                                    {event.meta.slipCode}
                                  </span>
                                )}
                                {event.meta.ticketNumber && (
                                  <span className="bg-orange-50 text-orange-800 font-mono px-2 py-0.5 rounded border border-orange-200 font-bold">
                                    {event.meta.ticketNumber}
                                  </span>
                                )}
                                {event.meta.invoiceNumber && (
                                  <span className="bg-rose-50 text-rose-800 font-mono px-2 py-0.5 rounded border border-rose-200 font-bold">
                                    {event.meta.invoiceNumber}
                                  </span>
                                )}
                                {!event.meta.slipCode && !event.meta.ticketNumber && !event.meta.invoiceNumber && event.meta.documentCode && (
                                  <span className="bg-zinc-50 text-zinc-700 font-mono px-2 py-0.5 rounded border border-zinc-200 font-bold">
                                    {event.meta.documentCode}
                                  </span>
                                )}
                                {Number(event.meta.quantity || 0) > 0 && (
                                  <span className="font-bold text-zinc-700">SL {Number(event.meta.quantity).toLocaleString('vi-VN')}</span>
                                )}
                                {Number(event.meta.amount || 0) !== 0 && (
                                  <span className="font-black text-orange-700">{Number(event.meta.amount).toLocaleString('vi-VN')} đ</span>
                                )}
                                {Number(event.meta.costAfter || 0) > 0 && (
                                  <span className="font-black text-zinc-800">Vốn sau: {Number(event.meta.costAfter).toLocaleString('vi-VN')} đ</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: THÔNG SỐ PHẦN CỨNG & KCS */}
          {activeTab === 'SPECS' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Hardware Specs Card */}
                <div className="bg-zinc-50/70 p-4 rounded-2xl border border-zinc-200 space-y-3">
                  <h4 className="font-bold text-xs text-zinc-900 flex items-center space-x-1.5 uppercase tracking-wide">
                    <Smartphone className="w-4 h-4 text-orange-600" />
                    <span>Cấu Hình Phần Cứng & Định Danh</span>
                  </h4>
                  
                  <div className="space-y-2 text-xs divide-y divide-zinc-200/60">
                    <div className="flex justify-between py-1.5">
                      <span className="text-zinc-500">Model máy:</span>
                      <strong className="text-zinc-900 font-black">{device.model}</strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-zinc-500">Dung lượng:</span>
                      <strong className="text-zinc-900 font-bold">{device.storage}</strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-zinc-500">Màu sắc:</span>
                      <strong className="text-zinc-900 font-bold">{device.color}</strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-zinc-500">Mã thị trường / Xuất xứ:</span>
                      <strong className="text-orange-700 font-bold bg-orange-100 px-2 py-0.5 rounded">{device.region}</strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-zinc-500">Số IMEI (15 số):</span>
                      <strong className="text-zinc-900 font-mono font-bold">{device.imei}</strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-zinc-500">Serial Number:</span>
                      <strong className="text-zinc-900 font-mono">{device.serialNo || 'Chưa cập nhật'}</strong>
                    </div>
                  </div>
                </div>

                {/* Inspection & Condition Card */}
                <div className="bg-zinc-50/70 p-4 rounded-2xl border border-zinc-200 space-y-3">
                  <h4 className="font-bold text-xs text-zinc-900 flex items-center space-x-1.5 uppercase tracking-wide">
                    <ShieldCheck className="w-4 h-4 text-orange-600" />
                    <span>Tình Trạng KCS & Thẩm Định Kỹ Thuật</span>
                  </h4>

                  <div className="space-y-2 text-xs divide-y divide-zinc-200/60">
                    <div className="flex justify-between py-1.5">
                      <span className="text-zinc-500">Tình trạng ngoại hình:</span>
                      <span className="font-black text-orange-800 bg-orange-100 px-2 py-0.5 rounded">{device.condition}</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-zinc-500">Tình trạng Pin:</span>
                      <span className={`font-mono font-bold px-2 py-0.5 rounded ${device.batteryHealth >= 90 ? 'bg-orange-100 text-orange-800' : 'bg-orange-100 text-orange-800'}`}>
                        {device.batteryHealth}% Dung lượng
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-zinc-500">Tình trạng Màn hình:</span>
                      <strong className="text-zinc-900">{device.screenStatus || 'Zin Màn Keng'}</strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-zinc-500">Trạng thái iCloud:</span>
                      <span className="font-bold text-orange-700 flex items-center space-x-1">
                        <Lock className="w-3 h-3 inline" />
                        <span>{device.icloudStatus || 'Clean / Đã Thoát'}</span>
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-zinc-500">Nhà cung cấp (NCC):</span>
                      <strong className="text-zinc-900">{device.supplier || 'Đối tác phân phối'}</strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-zinc-500">Thời hạn bảo hành PhoneHouse:</span>
                      <strong className="text-orange-700 font-bold">{device.warrantyPeriodMonths || 12} Tháng</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial & Valuation Card */}
              <div className="p-4 bg-gradient-to-r from-orange-50 via-orange-50 to-orange-50 rounded-2xl border border-orange-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-white p-3 rounded-xl border border-orange-100">
                  <span className="text-[10px] text-zinc-500 block uppercase font-bold">1. Giá Vốn Nhập Gốc (Cost)</span>
                  <div className="font-mono font-black text-zinc-900 text-base mt-1">
                    {device.buyPrice.toLocaleString('vi-VN')} đ
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-orange-100">
                  <span className="text-[10px] text-zinc-500 block uppercase font-bold">2. Giá Niêm Yết Bán Lẻ</span>
                  <div className="font-mono font-black text-orange-600 text-base mt-1">
                    {device.sellPrice.toLocaleString('vi-VN')} đ
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-orange-100">
                  <span className="text-[10px] text-zinc-500 block uppercase font-bold">3. Lợi Nhuận Gộp Dự Kiến</span>
                  <div className="font-mono font-black text-orange-700 text-base mt-1">
                    +{(device.sellPrice - device.buyPrice).toLocaleString('vi-VN')} đ
                  </div>
                </div>
              </div>

              {/* Photo Gallery (if available) */}
              {device.images && device.images.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-zinc-800 flex items-center space-x-1.5">
                    <Camera className="w-4 h-4 text-orange-600" />
                    <span>Hình Ảnh Thực Tế Máy Khi Nhập Kho ({device.images.length} ảnh)</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {device.images.map((img, idx) => (
                      <a 
                        key={idx} 
                        href={img} 
                        target="_blank" 
                        rel="noreferrer"
                        className="group relative rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100 aspect-square block"
                      >
                        <img 
                          src={img} 
                          alt={`Device photo ${idx + 1}`} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                          <Eye className="w-4 h-4 mr-1" /> Phóng to
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BẢO HÀNH & TASK KTV */}
          {activeTab === 'WARRANTY_TASKS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-zinc-800 flex items-center space-x-1.5">
                  <Wrench className="w-4 h-4 text-orange-600" />
                  <span>Danh Sách Task KCS, Sửa Chữa & Bảo Hành Liên Quan ({relatedWarrantyTickets.length} phiếu)</span>
                </h4>
              </div>

              {relatedWarrantyTickets.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500 bg-zinc-50 rounded-2xl border border-zinc-200 italic space-y-1">
                  <div>Chưa có phiếu sửa chữa hay bảo hành nào cho cây máy IMEI này.</div>
                  <p className="text-[11px] text-zinc-400">Máy hoạt động ổn định và đạt chuẩn KCS từ khi nhập kho.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {relatedWarrantyTickets.map(ticket => (
                    <div key={ticket.id} className="p-4 bg-white rounded-2xl border border-orange-200/80 shadow-2xs space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-2.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-xs text-orange-700 bg-orange-50 px-2.5 py-0.5 rounded border border-orange-200">
                            {ticket.ticketNumber}
                          </span>
                          <h5 className="font-bold text-xs sm:text-sm text-zinc-900">
                            {ticket.issueType}
                          </h5>
                        </div>

                        <div className="flex items-center space-x-2 text-xs font-bold">
                          <span className="text-zinc-500">Trạng thái:</span>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                            ticket.status === 'ready' || ticket.status === 'delivered' 
                              ? 'bg-orange-100 text-orange-800' 
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {ticket.status === 'ready' ? 'Đã Xử Lý Xong' : ticket.status === 'repairing' ? 'Đang Sửa' : 'Đang Kiểm Tra'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                        <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/60">
                          <span className="text-[10px] text-zinc-500 block font-semibold">KTV Phụ Trách</span>
                          <strong className="text-zinc-900 font-bold">{ticket.technician}</strong>
                        </div>

                        <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/60">
                          <span className="text-[10px] text-zinc-500 block font-semibold">Thưởng Hoa Hồng KTV</span>
                          <strong className="text-orange-700 font-mono font-bold">
                            {ticket.commissionAmount ? `${ticket.commissionAmount.toLocaleString('vi-VN')} đ` : '0 đ'}
                          </strong>
                        </div>

                        <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/60">
                          <span className="text-[10px] text-zinc-500 block font-semibold">Hạn Trả Máy (Deadline)</span>
                          <strong className="text-zinc-900 font-mono">{ticket.expectedReturnDate || 'Trong ngày'}</strong>
                        </div>
                      </div>

                      {ticket.faultDescription && (
                        <div className="text-xs bg-orange-50/50 p-2.5 rounded-xl border border-orange-100 text-zinc-800">
                          <span className="font-bold text-orange-900">Mô tả sự cố & yêu cầu: </span>
                          <span>{ticket.faultDescription}</span>
                        </div>
                      )}

                      {/* Tech Checklist Preview */}
                      {ticket.techChecklist && ticket.techChecklist.length > 0 && (
                        <div className="pt-2 border-t border-zinc-100">
                          <span className="text-[11px] font-bold text-zinc-700 block mb-1.5 flex items-center space-x-1">
                            <CheckSquare className="w-3.5 h-3.5 text-orange-600" />
                            <span>Checklist Kiểm Tra 18 Bước Kỹ Thuật:</span>
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                            {ticket.techChecklist.map((step, idx) => (
                              <div key={idx} className="flex items-center space-x-1.5 p-1 bg-zinc-50 rounded-lg">
                                <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] font-bold ${
                                  step.isPassed ? 'bg-orange-500 text-white' : 'bg-zinc-300 text-zinc-700'
                                }`}>
                                  {step.isPassed ? '✓' : '-'}
                                </span>
                                <span className={step.isPassed ? 'text-zinc-800 font-medium' : 'text-zinc-500'}>
                                  {step.step}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: BÀN GIAO & QUẢN LÝ TRÁCH NHIỆM */}
          {activeTab === 'CUSTODY' && (
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-rose-50 via-rose-50 to-rose-50 rounded-2xl border border-rose-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-black text-sm text-rose-950 flex items-center space-x-1.5">
                    <UserCheck className="w-4 h-4 text-rose-600" />
                    <span>Chuỗi Bàn Giao & Người Chịu Trách Nhiệm Trực Tiếp (Chain of Custody)</span>
                  </h4>
                  <p className="text-xs text-rose-800/80 mt-0.5">
                    Đảm bảo tính minh bạch 100% khi xảy ra mất mát, trầy xước hoặc hư hỏng thiết bị
                  </p>
                </div>

                <div className="bg-white px-3.5 py-1.5 rounded-xl border border-rose-200 text-xs font-bold text-rose-900 shrink-0">
                  Hiện tại: <strong className="text-rose-600 font-black">{currentResponsiblePerson}</strong>
                </div>
              </div>

              {/* Custody Responsibility Steps */}
              <div className="space-y-3">
                <div className="bg-white p-3.5 rounded-2xl border border-zinc-200 flex items-center space-x-3 text-xs">
                  <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-800 flex items-center justify-center font-bold shrink-0">
                    1
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-zinc-900">Người nhập ban đầu: {(device as any).createdByName || 'Không có dữ liệu'}</div>
                    <div className="text-[11px] text-zinc-500">Tiếp nhận từ NCC {device.supplier || 'Đối tác'} vào ngày {device.receivedDate}</div>
                  </div>
                  <span className="text-[10px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded font-bold border border-orange-200 shrink-0">
                    Đã Nghiệm Thu
                  </span>
                </div>

                {relatedTransfers.map((trf, idx) => (
                  <div key={trf.id} className="bg-white p-3.5 rounded-2xl border border-zinc-200 flex items-center space-x-3 text-xs">
                    <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-800 flex items-center justify-center font-bold shrink-0">
                      {idx + 2}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-zinc-900">Điều Vận & Bàn Giao: {trf.transporter || 'KTV Vận Chuyển'}</div>
                      <div className="text-[11px] text-zinc-500">
                        Chuyển từ {trf.fromWarehouseName} ➔ {trf.toWarehouseName} ({trf.code})
                      </div>
                    </div>
                    <span className="text-[10px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded font-bold border border-orange-200 shrink-0">
                      {trf.status === 'COMPLETED' ? 'Đã Bàn Giao Kho Đích' : 'Đang Giữ Hàng'}
                    </span>
                  </div>
                ))}

                {relatedWarrantyTickets.map((t, idx) => (
                  <div key={t.id} className="bg-white p-3.5 rounded-2xl border border-zinc-200 flex items-center space-x-3 text-xs">
                    <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-800 flex items-center justify-center font-bold shrink-0">
                      KTV
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-zinc-900">KTV Tiếp Nhận Xử Lý: {t.technician}</div>
                      <div className="text-[11px] text-zinc-500">Task {t.ticketNumber} • {t.issueType}</div>
                    </div>
                    <span className="text-[10px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded font-bold border border-orange-200 shrink-0">
                      {t.status === 'ready' ? 'Đã Bàn Giao Lại Kho' : 'Đang Giữ Máy Sửa'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Sticky Bottom Action Footer */}
        <div className="p-3.5 sm:px-6 bg-zinc-50 border-t border-zinc-200 flex justify-between items-center shrink-0">
          <div className="text-xs text-zinc-500 font-mono">
            ID: <span className="font-bold text-zinc-800">{device.id}</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-white hover:bg-zinc-100 text-zinc-700 rounded-xl text-xs font-bold border border-zinc-200 transition-colors cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export const DeviceDetailModal: React.FC<DeviceDetailModalProps> = (props) => {
  if (!props.isOpen || !props.device) return null;
  return <DeviceDetailModalContent {...props} device={props.device} />;
};
