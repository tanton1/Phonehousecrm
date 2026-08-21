import React, { useEffect, useState, useMemo } from 'react';
import { SalesInvoice, DeviceItem } from '../types';
import { ActivityLog } from "./ActivityLog";
import { DocumentHeader } from './shared/DocumentHeader';
import { StatusBadge } from './shared/StatusBadge';
import { History,  
  FileText, 
  Search, 
  ChevronRight, 
  ChevronLeft, 
  QrCode, 
  Printer, 
  CheckCircle2, 
  Smartphone, 
  Package, 
  Calendar, 
  User as UserIcon, 
  Phone, 
  DollarSign, 
  Clock, 
  Receipt, 
  ShieldCheck, 
  MoreVertical, 
  Share2, 
  Edit3, 
  X, 
  Trash2, 
  Check, 
  Zap, 
  CreditCard, 
  Building2, 
  Tag, 
  Copy, 
  Plus,
  Gift,
  BadgePercent,
  MapPin,
  CloudCheck,
  AlertCircle,
  Truck,
  RotateCcw,
  Sparkles,
  ChevronDown,
  List,
  SlidersHorizontal,
  ScanLine
} from 'lucide-react';

interface InvoicesViewProps {
  invoices: SalesInvoice[];
  devices: DeviceItem[];
  onNavigateToPOS: () => void;
  onUpdateInvoice?: (invoice: SalesInvoice) => void;
  onDeleteInvoice?: (invoiceId: string) => void;
  onCancelInvoice?: (invoice: SalesInvoice, reason: string) => Promise<void> | void;
  initialSelectedInvoiceId?: string | null;
  currentUser?: any;
  branches?: any[];
}

type TimeFilter = 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string; icon: any }> = {
  completed: {
    label: 'Hoàn thành',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    icon: CheckCircle2
  },
  COMPLETED: {
    label: 'Hoàn thành',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    icon: CheckCircle2
  },
  pending: {
    label: 'Chờ xử lý',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    icon: Clock
  },
  PENDING: {
    label: 'Chờ xử lý',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    icon: Clock
  },
  delivering: {
    label: 'Đang giao hàng',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
    icon: Truck
  },
  DELIVERING: {
    label: 'Đang giao hàng',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
    icon: Truck
  },
  installment_approved: {
    label: 'Trả góp đã duyệt',
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    dot: 'bg-teal-500',
    icon: CreditCard
  },
  cancelled: {
    label: 'Đã hủy đơn',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
    icon: AlertCircle
  },
  CANCELLED: {
    label: 'Đã hủy đơn',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
    icon: AlertCircle
  },
  refunded: {
    label: 'Đã hoàn tiền',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
    icon: RotateCcw
  },
  REFUNDED: {
    label: 'Đã hoàn tiền',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
    icon: RotateCcw
  }
};

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  invoices,
  devices,
  currentUser,
  branches = [],
  onNavigateToPOS,
  onUpdateInvoice,
  onDeleteInvoice,
  onCancelInvoice,
  initialSelectedInvoiceId
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(() => {
    if (initialSelectedInvoiceId) {
      return invoices.find(inv => inv.id === initialSelectedInvoiceId || inv.invoiceCode === initialSelectedInvoiceId) || null;
    }
    return null;
  });

  useEffect(() => {
    if (!initialSelectedInvoiceId) return;
    const matched = invoices.find(invoice => invoice.id === initialSelectedInvoiceId || invoice.invoiceCode === initialSelectedInvoiceId);
    if (matched) setSelectedInvoice(matched);
  }, [initialSelectedInvoiceId, invoices]);

  // Modals inside InvoicesView
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [showMoreDropdown, setShowMoreDropdown] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  const triggerSyncToast = (msg: string) => {
    setSyncToast(msg);
    setTimeout(() => setSyncToast(null), 3000);
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Quick Status Change directly on UI -> Persists to Firestore
  const handleQuickChangeStatus = (newStatus: string) => {
    if (!selectedInvoice) return;
    if (['cancelled', 'CANCELLED', 'refunded', 'REFUNDED'].includes(newStatus)) {
      alert('Không thể hủy hoặc hoàn tiền đơn hàng bằng thao tác nhanh. Vui lòng sử dụng tính năng "Hủy đơn hàng" để xử lý trả hàng và hoàn tiền đúng quy trình.');
      return;
    }
    const updatedInvoice: SalesInvoice = {
      ...selectedInvoice,
      status: newStatus,
      history: [ 
        ...(selectedInvoice.history || []), 
        { time: new Date().toLocaleString("sv-SE").replace("T", " ").slice(0, 16), action: `Chuyển trạng thái: ${STATUS_CONFIG[newStatus]?.label || newStatus}`, user: currentUser?.displayName || "Admin" } 
      ]
    };
    setSelectedInvoice(updatedInvoice);
    if (onUpdateInvoice) {
      onUpdateInvoice(updatedInvoice);
    }
    setShowStatusPicker(false);
    const statusLabel = STATUS_CONFIG[newStatus]?.label || newStatus;
    triggerSyncToast(`Đã cập nhật trạng thái: "${statusLabel}" & đồng bộ Firestore`);
  };

  // Filter & Search Logic
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      // 1. Search Query
      const query = searchQuery.toLowerCase().trim();
      const code = (inv.invoiceCode || inv.id).toLowerCase();
      const name = (inv.customerName || '').toLowerCase();
      const phone = (inv.customerPhone || inv.phone || '').toLowerCase();
      const imeiMatch = inv.imeiList?.some(imei => imei.includes(query)) ||
        inv.items?.some((it: any) => it.imei?.includes(query)) ||
        inv.detailedItems?.some(it => it.imei?.includes(query));
      const modelMatch = inv.items?.some((it: any) => (it.model || it.name)?.toLowerCase().includes(query)) ||
        inv.detailedItems?.some(it => it.model?.toLowerCase().includes(query));

      if (query && !code.includes(query) && !name.includes(query) && !phone.includes(query) && !imeiMatch && !modelMatch) {
        return false;
      }

      // 2. Status Filter
      if (statusFilter !== 'all') {
        const invStatus = (inv.status || '').toLowerCase();
        if (statusFilter === 'completed' && invStatus !== 'completed') return false;
        if (statusFilter === 'pending' && invStatus !== 'pending') return false;
        if (statusFilter === 'delivering' && invStatus !== 'delivering') return false;
        if (statusFilter === 'cancelled' && invStatus !== 'cancelled') return false;
        if (statusFilter === 'installment' && !inv.paymentMethod.includes('Trả góp')) return false;
      }

      // 3. Time Filter
      if (timeFilter === 'all') return true;
      
      const dateStr = inv.createdDate || inv.createdAt || '';
      if (!dateStr) return true;

      // Parse invoice date
      const invDate = new Date(dateStr.split(' ')[0]);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      if (timeFilter === 'today') {
        return invDate.getTime() >= today.getTime();
      }
      if (timeFilter === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return invDate.getDate() === yesterday.getDate() && 
               invDate.getMonth() === yesterday.getMonth() && 
               invDate.getFullYear() === yesterday.getFullYear();
      }
      if (timeFilter === 'this_week') {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return invDate.getTime() >= weekAgo.getTime();
      }
      if (timeFilter === 'this_month') {
        return invDate.getMonth() === now.getMonth() && invDate.getFullYear() === now.getFullYear();
      }

      return true;
    });
  }, [invoices, searchQuery, timeFilter, statusFilter]);

  // Aggregate totals: Exclude cancelled / refunded from Net Revenue
  const validInvoices = useMemo(() => {
    return filteredInvoices.filter(inv => {
      const s = (inv.status || '').toLowerCase();
      return s !== 'cancelled' && s !== 'refunded';
    });
  }, [filteredInvoices]);

  const netRevenue = useMemo(() => {
    return validInvoices.reduce((sum, inv) => sum + (inv.finalAmount || inv.totalAmount || 0), 0);
  }, [validInvoices]);

  const paidRevenue = useMemo(() => {
    return validInvoices.reduce((sum, inv) => {
      const paid = inv.paidAmount !== undefined ? inv.paidAmount : (inv.finalAmount || inv.totalAmount || 0);
      return sum + paid;
    }, 0);
  }, [validInvoices]);

  const debtRevenue = useMemo(() => {
    return Math.max(0, netRevenue - paidRevenue);
  }, [netRevenue, paidRevenue]);

  const totalRevenue = netRevenue;

  // Group invoices by date string
  const groupedInvoices = useMemo(() => {
    const groups: { [key: string]: SalesInvoice[] } = {};

    filteredInvoices.forEach(inv => {
      const rawDate = (inv.createdDate || inv.createdAt || '2026-08-14').split(' ')[0];
      
      // Compute friendly date header matching screenshot uppercase format
      let header = rawDate;
      try {
        const [year, month, day] = rawDate.split('-').map(Number);
        if (year && month && day) {
          const d = new Date(year, month - 1, day);
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const diffDays = Math.round((today.getTime() - d.getTime()) / (1000 * 3600 * 24));

          const formattedDate = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
          
          if (diffDays === 0) {
            header = `HÔM NAY, ${formattedDate}`;
          } else if (diffDays === 1) {
            header = `HÔM QUA, ${formattedDate}`;
          } else {
            const daysOfWeek = ['CHỦ NHẬT', 'THỨ HAI', 'THỨ BA', 'THỨ TƯ', 'THỨ NĂM', 'THỨ SÁU', 'THỨ BẢY'];
            const dayName = daysOfWeek[d.getDay()];
            header = `${dayName}, ${formattedDate}`;
          }
        }
      } catch (e) {
        header = rawDate;
      }

      if (!groups[header]) {
        groups[header] = [];
      }
      groups[header].push(inv);
    });

    return groups;
  }, [filteredInvoices]);

  // Helper to extract items count & summary label in clean format
  const getInvoiceSummary = (inv: SalesInvoice) => {
    let totalItems = 0;
    const itemNames: string[] = [];

    // 1. If detailedItems exists
    if (inv.detailedItems && inv.detailedItems.length > 0) {
      inv.detailedItems.forEach(it => {
        const qty = it.quantity || 1;
        totalItems += qty;
        const details = [it.storage, it.color].filter(Boolean).join(' - ');
        const label = `${it.name.toUpperCase()}${details ? ` - ${details}` : ''} x${qty}`;
        itemNames.push(label);
      });
    } 
    // 2. If combined items exists (from POS flow)
    else if (inv.items && inv.items.length > 0) {
      inv.items.forEach((it: any) => {
        const name = it.name || it.model || 'Sản phẩm';
        const qty = it.quantity || 1;
        totalItems += qty;
        const details = [it.storage, it.color].filter(Boolean).join(' - ');
        const label = `${name.toUpperCase()}${details ? ` - ${details}` : ''} x${qty}`;
        itemNames.push(label);
      });
    } 
    // 3. Fallback to separate devices & accessories
    else {
      if (inv.devices && inv.devices.length > 0) {
        inv.devices.forEach(d => {
          totalItems += 1;
          const details = [d.storage, d.color].filter(Boolean).join(' - ');
          itemNames.push(`${d.model.toUpperCase()}${details ? ` - ${details}` : ''} x1`);
        });
      }
      if (inv.accessories && inv.accessories.length > 0) {
        inv.accessories.forEach(a => {
          const qty = a.quantity || 1;
          totalItems += qty;
          itemNames.push(`${a.name.toUpperCase()} x${qty}`);
        });
      }
    }

    const firstItem = itemNames[0] || '1 SẢN PHẨM';
    const remainingCount = itemNames.length - 1;

    return {
      totalItems,
      firstItem,
      remainingCount: remainingCount > 0 ? `+ ${remainingCount} món khác` : null,
      allItems: itemNames
    };
  };

  const handleSaveNote = () => {
    if (!selectedInvoice) return;
    const updated = {
      ...selectedInvoice,
      notes: noteContent, history: [ ...(selectedInvoice.history || []), { time: new Date().toLocaleString("sv-SE").replace("T", " ").slice(0, 16), action: "Cập nhật ghi chú", note: noteContent, user: "Admin (Current User)" } ]
    };
    setSelectedInvoice(updated);
    if (onUpdateInvoice) {
      onUpdateInvoice(updated);
    }
    setIsEditingNote(false);
    triggerSyncToast('Đã lưu ghi chú đơn hàng lên Firestore');
  };

  // ----------------------------------------------------
  // RENDER: DETAIL DRAWER VIEW
  // ----------------------------------------------------
  const renderInvoiceDetail = (selectedInvoice: SalesInvoice) => {
    const summary = getInvoiceSummary(selectedInvoice);
    const invoiceCode = selectedInvoice.invoiceCode || selectedInvoice.id;
    const rawDate = selectedInvoice.createdDate || selectedInvoice.createdAt || '— Chưa xác định';
    const customerPhone = selectedInvoice.customerPhone || selectedInvoice.phone || '— Chưa có SĐT';
    const customerName = selectedInvoice.customerName || 'Khách lẻ vãng lai';
    const statusKey = selectedInvoice.status || 'completed';
    const currentStatusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG.completed;

    // Normalize items for detailed breakdown
    interface UnifiedItem {
      sku: string;
      name: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      imei?: string;
      color?: string;
      storage?: string;
      type: 'phone' | 'accessory' | 'service' | 'tradein' | 'device' | 'repair';
    }

    let displayItems: UnifiedItem[] = [];

    if (selectedInvoice.items && selectedInvoice.items.length > 0) {
      displayItems = selectedInvoice.items.map((it: any, i: number) => ({
        sku: it.imei ? `IMEI-${it.imei.slice(-6)}` : `SP00${5950 + i}`,
        name: it.name || it.model || 'Sản phẩm Apple',
        quantity: it.quantity || 1,
        unitPrice: it.unitPrice || it.price || 0,
        totalPrice: it.totalPrice || (it.unitPrice ? it.unitPrice * (it.quantity || 1) : it.price || 0),
        imei: it.imei,
        color: it.color,
        storage: it.storage,
        type: (it.type as 'phone' | 'accessory') || (it.imei ? 'phone' : 'accessory')
      }));
    } else if (selectedInvoice.detailedItems && selectedInvoice.detailedItems.length > 0) {
      displayItems = selectedInvoice.detailedItems.map((it, i) => ({
        sku: it.sku || (it.imei ? `IMEI-${it.imei.slice(-6)}` : `SP00${5950 + i}`),
        name: it.name,
        quantity: it.quantity || 1,
        unitPrice: it.unitPrice,
        totalPrice: it.totalPrice,
        imei: it.imei,
        color: it.color,
        storage: it.storage,
        type: it.type || (it.imei ? 'phone' : 'accessory')
      }));
    } else {
      const devItems: UnifiedItem[] = (selectedInvoice.devices || []).map((d, i) => ({
        sku: d.imei ? `IMEI-${d.imei.slice(-6)}` : `SP00${5950 + i}`,
        name: `${d.model} ${d.storage || ''} ${d.color ? `(${d.color})` : ''}`.trim(),
        quantity: 1,
        unitPrice: d.price,
        totalPrice: d.price,
        imei: d.imei,
        color: d.color,
        storage: d.storage,
        type: 'phone'
      }));

      const accItems: UnifiedItem[] = (selectedInvoice.accessories || []).map((a, i) => ({
        sku: `PK00${1200 + i}`,
        name: a.name,
        quantity: a.quantity || 1,
        unitPrice: a.price / (a.quantity || 1) || a.price,
        totalPrice: a.price,
        type: 'accessory'
      }));

      displayItems = [...devItems, ...accItems];
    }

    const totalQty = displayItems.reduce((sum, it) => sum + (it.quantity || 1), 0);

    return (
      <div className="w-full flex flex-col min-h-full space-y-4 pb-20">
        {/* Firestore Sync Toast Notification */}
        {syncToast && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-zinc-900/90 backdrop-blur-md text-white text-xs px-4 py-2 rounded-full shadow-lg flex items-center space-x-2 animate-fadeIn border border-white/10">
            <CheckCircle2 className="w-4 h-4 text-orange-400 shrink-0" />
            <span className="font-medium">{syncToast}</span>
          </div>
        )}

        {/* 1. Standard Document Header */}
        <DocumentHeader
          icon={Receipt}
          code={invoiceCode}
          typeLabel="Hóa Đơn Bán Hàng"
          date={rawDate}
          branchName={selectedInvoice.branch || 'Phone House'}
          statusBadge={
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowStatusPicker(!showStatusPicker)}
                className={`${currentStatusConfig.bg} ${currentStatusConfig.text} border ${currentStatusConfig.border} text-[11px] font-medium px-2.5 py-0.5 rounded-full flex items-center space-x-1.5 hover:opacity-85 transition-all cursor-pointer shadow-2xs`}
                title="Nhấn để đổi trạng thái đơn hàng (Đồng bộ Firestore)"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${currentStatusConfig.dot}`}></span>
                <span>{currentStatusConfig.label}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              {/* Status Picker Dropdown Menu */}
              {showStatusPicker && (
                <div className="absolute left-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-zinc-200 py-1.5 z-50 animate-fadeIn text-xs text-zinc-900">
                  <div className="px-3 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-100">
                    Chuyển Trạng Thái Đơn:
                  </div>
                  {Object.entries(STATUS_CONFIG)
                    .filter(([key]) => !['cancelled', 'CANCELLED', 'refunded', 'REFUNDED'].includes(key) && key === key.toLowerCase())
                    .map(([key, cfg]) => {
                    const isSelected = key === statusKey;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleQuickChangeStatus(key)}
                        className={`w-full px-3 py-2 text-left font-medium flex items-center justify-between transition-colors ${
                          isSelected ? `${cfg.bg} ${cfg.text} font-semibold` : 'text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <span className={`w-2 h-2 rounded-full ${cfg.dot}`}></span>
                          <span>{cfg.label}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          }
          onPrint={() => setIsPrintModalOpen(true)}
          onClose={() => setSelectedInvoice(null)}
          actions={
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMoreDropdown(!showMoreDropdown)}
                className="p-2 text-zinc-300 hover:text-white hover:bg-zinc-800/80 rounded-xl transition-all cursor-pointer"
                title="Thao tác khác"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

                {showMoreDropdown && (
                  <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-zinc-200 py-1.5 z-50 animate-fadeIn text-xs text-zinc-900">
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreDropdown(false);
                        setIsQRModalOpen(true);
                      }}
                      className="w-full px-3.5 py-2 text-left font-medium text-zinc-700 hover:bg-orange-50 hover:text-[#FF4B16] flex items-center space-x-2 cursor-pointer"
                    >
                      <QrCode className="w-4 h-4 text-[#FF4B16]" />
                      <span>Tạo mã VietQR thu tiền</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreDropdown(false);
                        handleCopy(`${window.location.origin}?invoice=${invoiceCode}`, 'link');
                      }}
                      className="w-full px-3.5 py-2 text-left font-medium text-zinc-700 hover:bg-orange-50 hover:text-[#FF4B16] flex items-center space-x-2 cursor-pointer"
                    >
                      <Share2 className="w-4 h-4 text-zinc-400" />
                      <span>{copiedText === 'link' ? 'Đã sao chép link!' : 'Chia sẻ liên kết'}</span>
                    </button>
                    {(onCancelInvoice || onDeleteInvoice) && (
                      <button
                        type="button"
                        onClick={async () => {
                          if ((selectedInvoice.status as string || '').toLowerCase() === 'cancelled') {
                            alert('Hóa đơn này đã ở trạng thái ĐÃ HỦY.');
                            return;
                          }
                          const reason = window.prompt(`Nhập lý do hủy/hoàn hóa đơn ${invoiceCode}:`, 'Khách đổi ý trả hàng hoàn tiền');
                          if (reason !== null && reason.trim()) {
                            if (onCancelInvoice) {
                              await onCancelInvoice(selectedInvoice, reason.trim());
                            } else if (onDeleteInvoice) {
                              onDeleteInvoice(selectedInvoice.id);
                            }
                            setSelectedInvoice(null);
                          }
                        }}
                        className="w-full px-3.5 py-2 text-left font-medium text-rose-600 hover:bg-rose-50 flex items-center space-x-2 border-t border-zinc-100 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Hủy & Hoàn trả hóa đơn</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            }
          />

        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-[#ff4b16] text-white flex items-center justify-center font-bold text-sm shadow-sm shadow-orange-500/20">
              <UserIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-zinc-900 text-sm sm:text-base">
                  {customerName}
                </h3>
                <span className="text-[10px] font-bold bg-orange-100/70 text-[#ff4b16] px-2 py-0.5 rounded-md border border-orange-200/60">
                  Khách thân thiết
                </span>
              </div>
              <p className="text-xs text-zinc-500 font-mono flex items-center gap-1.5 mt-0.5">
                <Phone className="w-3 h-3 text-[#ff4b16]" />
                <span>{customerPhone}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={() => handleCopy(customerPhone, 'phone')}
            className="p-2 rounded-xl text-zinc-400 hover:text-[#ff4b16] hover:bg-orange-50 transition-colors cursor-pointer"
            title="Sao chép SĐT"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* 3. Line Items Breakdown List */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-2xs divide-y divide-zinc-100 overflow-hidden">
          <div className="px-4 py-2.5 bg-zinc-50/80 flex items-center justify-between border-b border-zinc-200/60">
            <span className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-orange-600" />
              <span>Sản phẩm & Phụ kiện xuất bán</span>
            </span>
            <span className="text-[11px] font-medium text-zinc-600 bg-white px-2 py-0.5 rounded-full border border-zinc-200">
              {displayItems.length} mặt hàng ({totalQty} món)
            </span>
          </div>

          {displayItems.map((item, idx) => (
            <div key={idx} className="p-3.5 sm:p-4 flex items-start justify-between gap-3 hover:bg-zinc-50/60 transition-colors">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 rounded-xl bg-orange-50/80 border border-orange-100 text-orange-600 flex items-center justify-center shrink-0 mt-0.5">
                  {item.type === 'phone' ? (
                    <Smartphone className="w-4 h-4" />
                  ) : (
                    <Package className="w-4 h-4" />
                  )}
                </div>

                <div className="space-y-1">
                  <h4 className="font-semibold text-zinc-800 text-xs sm:text-sm leading-snug">
                    {item.name}
                  </h4>
                  
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                    {item.imei && (
                      <span className="font-mono text-orange-700 bg-orange-50 border border-orange-200/80 px-1.5 py-0.2 rounded font-medium">
                        IMEI: {item.imei}
                      </span>
                    )}
                    {item.color && (
                      <span className="text-zinc-500 font-normal">Màu: {item.color}</span>
                    )}
                    {item.storage && (
                      <span className="text-zinc-500 font-normal">Bộ nhớ: {item.storage}</span>
                    )}
                  </div>

                  <div className="text-xs text-zinc-500 font-mono">
                    {item.unitPrice.toLocaleString('vi-VN')}đ x {item.quantity || 1}
                  </div>
                </div>
              </div>

              {/* Line item subtotal */}
              <div className="text-right font-semibold text-zinc-800 text-xs sm:text-sm font-mono shrink-0">
                {item.totalPrice.toLocaleString('vi-VN')}đ
              </div>
            </div>
          ))}
        </div>

        {/* 4. Financial & Payment Summary Card with Soft Brand Gradient */}
        <div className="bg-gradient-to-br from-white via-orange-50/20 to-white rounded-2xl p-3.5 sm:p-4 border border-orange-200/60 shadow-2xs space-y-2.5 text-xs sm:text-sm">
          <div className="flex justify-between items-center py-1">
            <span className="text-zinc-600 flex items-center space-x-1.5 font-normal">
              <span>Tổng tiền hàng ({totalQty} món)</span>
            </span>
            <span className="font-semibold text-zinc-800 font-mono">
              {(selectedInvoice.totalAmount || selectedInvoice.finalAmount).toLocaleString('vi-VN')}đ
            </span>
          </div>

          {(selectedInvoice.discountAmount || 0) > 0 && (
            <div className="flex justify-between items-center py-1 text-rose-600 font-normal">
              <span className="flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" />
                <span>Giảm giá Voucher / Khuyến mãi</span>
              </span>
              <span className="font-semibold font-mono">
                -{(selectedInvoice.discountAmount || 0).toLocaleString('vi-VN')}đ
              </span>
            </div>
          )}

          {(selectedInvoice.tradeInDiscount || selectedInvoice.tradeInDeduction || 0) > 0 && (
            <div className="flex justify-between items-center py-1 text-[#ff4b16] font-normal">
              <span className="flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Trừ tiền Thu cũ đổi mới</span>
              </span>
              <span className="font-semibold font-mono">
                -{(selectedInvoice.tradeInDiscount || selectedInvoice.tradeInDeduction || 0).toLocaleString('vi-VN')}đ
              </span>
            </div>
          )}

          <div className="pt-2 border-t border-orange-200/50 flex justify-between items-center text-sm sm:text-base font-semibold">
            <span className="text-zinc-900 font-bold">Tổng thanh toán</span>
            <span className="text-[#ff4b16] font-mono text-base sm:text-lg font-black">
              {selectedInvoice.finalAmount.toLocaleString('vi-VN')}đ
            </span>
          </div>

          {/* Split Payment Allocation Breakdown */}
          {selectedInvoice.splitPayments && selectedInvoice.splitPayments.length > 0 ? (
            <div className="mt-3 p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-xs space-y-2">
              <div className="font-bold text-zinc-800 flex items-center justify-between pb-1.5 border-b border-zinc-200">
                <span className="flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Phân bổ thanh toán</span>
                </span>
                <span className="text-[10px] font-mono font-bold bg-zinc-200 text-zinc-700 px-2 py-0.5 rounded-full">
                  {selectedInvoice.splitPayments.length} nguồn
                </span>
              </div>
              <div className="space-y-1.5 pt-1">
                {selectedInvoice.splitPayments.map((sp: any, spIdx: number) => (
                  <div key={spIdx} className="flex justify-between items-center text-xs">
                    <span className="text-zinc-600 font-medium">
                      {sp.fundName || (sp.method === 'CASH' ? 'Tiền mặt tại két' : sp.method === 'BANK' ? 'Chuyển khoản VietQR' : sp.method === 'CREDIT' ? 'Công nợ ghi sổ' : 'Trả góp')}
                    </span>
                    <span className="font-mono font-bold text-zinc-900">
                      {Number(sp.amount || 0).toLocaleString('vi-VN')}đ
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center py-1 text-zinc-600 font-normal">
              <span className="flex items-center gap-1.5">
                <span>Phương thức thanh toán:</span>
                <span className="text-[10px] bg-zinc-100 text-zinc-800 px-2 py-0.5 rounded-full font-bold border border-zinc-200">
                  {selectedInvoice.paymentMethod || 'Tiền mặt / Chuyển khoản'}
                </span>
              </span>
              <span className="font-bold text-zinc-900 font-mono">
                {(selectedInvoice.paidAmount ?? selectedInvoice.finalAmount).toLocaleString('vi-VN')}đ
              </span>
            </div>
          )}

          {/* Warranty Package Info */}
          {selectedInvoice.warrantyPackage && (
            <div className="mt-2 pt-2 border-t border-zinc-100 flex items-center justify-between text-xs bg-orange-50/50 p-2.5 rounded-xl border border-orange-100">
              <span className="font-semibold text-zinc-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-orange-600" />
                <span>Gói bảo hành:</span>
              </span>
              <span className="font-medium text-orange-700 text-right">
                {selectedInvoice.warrantyPackage}
              </span>
            </div>
          )}

          {/* Installment breakdown if applicable */}
          {selectedInvoice.installmentDetails && (
            <div className="mt-2 p-3 bg-orange-50/70 rounded-xl border border-orange-200/80 text-xs space-y-1.5 text-orange-950">
              <div className="font-semibold flex items-center gap-1 text-orange-800">
                <CreditCard className="w-3.5 h-3.5" />
                <span>Trả góp 0%: {selectedInvoice.installmentDetails.financeCompany}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                <div>
                  <span className="text-orange-700 block font-normal">Kỳ hạn:</span>
                  <span className="font-semibold">{selectedInvoice.installmentDetails.tenorMonths} tháng</span>
                </div>
                <div>
                  <span className="text-orange-700 block font-normal">Trả trước:</span>
                  <span className="font-semibold font-mono">{selectedInvoice.installmentDetails.downPayment.toLocaleString('vi-VN')}đ</span>
                </div>
                <div>
                  <span className="text-orange-700 block font-normal">Mỗi tháng:</span>
                  <span className="font-semibold text-orange-800 font-mono">{selectedInvoice.installmentDetails.monthlyPayment.toLocaleString('vi-VN')}đ</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 5. Notes Card */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200/80 shadow-2xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Ghi chú đơn hàng
            </span>
            {!isEditingNote && (
              <button
                onClick={() => {
                  setNoteContent(selectedInvoice.notes || '');
                  setIsEditingNote(true);
                }}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700 cursor-pointer flex items-center space-x-1"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Sửa</span>
              </button>
            )}
          </div>

          {isEditingNote ? (
            <div className="space-y-2 pt-1">
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Nhập ghi chú cho hóa đơn này..."
                className="w-full p-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-orange-500 focus:bg-white resize-none h-20 font-normal text-zinc-800"
              />
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setIsEditingNote(false)}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveNote}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white rounded-xl shadow-xs"
                >
                  Lưu Ghi Chú
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-600 leading-relaxed font-normal">
              {selectedInvoice.notes || 'Chưa có ghi chú kèm theo.'}
            </p>
          )}
        </div>

        {/* 6a. Activity Log / History Card */}
        {selectedInvoice.history && selectedInvoice.history.length > 0 && (
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200/80 shadow-2xs">
            <ActivityLog logs={selectedInvoice.history} className="space-y-2.5" />
          </div>
        )}

        {/* 6. Metadata Details Card */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200/80 shadow-2xs grid grid-cols-2 gap-3 sm:gap-4 text-xs">
          <div>
            <span className="text-zinc-400 block text-[11px] font-normal">Bảng giá</span>
            <span className="font-medium text-zinc-800 mt-0.5 block">
              {selectedInvoice.priceList || 'Bảng giá bán lẻ tiêu chuẩn'}
            </span>
          </div>

          <div>
            <span className="text-zinc-400 block text-[11px] font-normal">Kênh bán</span>
            <span className="font-medium text-zinc-800 mt-0.5 block">
              {selectedInvoice.salesChannel || 'Bán trực tiếp tại cửa hàng'}
            </span>
          </div>

          <div>
            <span className="text-zinc-400 block text-[11px] font-normal">Nhân viên bán</span>
            <span className="font-medium text-zinc-800 mt-0.5 block">
              {selectedInvoice.salesStaff || selectedInvoice.sellerName || 'Nhật ADMIN'}
            </span>
          </div>

          <div>
            <span className="text-zinc-400 block text-[11px] font-normal">Thu ngân / Tạo đơn</span>
            <span className="font-medium text-zinc-800 mt-0.5 block">
              {selectedInvoice.cashier || selectedInvoice.creatorName || 'Nhật ADMIN'}
            </span>
          </div>

          <div className="pt-2 border-t border-zinc-100">
            <span className="text-zinc-400 block text-[11px] font-normal">Chi nhánh xuất hàng</span>
            <span className="font-semibold text-zinc-800 mt-0.5 block">
              🏪 {selectedInvoice.branch || 'Phone House Cầu Giấy (Apple Premium)'}
            </span>
          </div>

          <div className="pt-2 border-t border-zinc-100">
            <span className="text-zinc-400 block text-[11px] font-normal">Kho xuất trừ tồn</span>
            <span className="font-semibold text-orange-700 mt-0.5 block">
              🏢 {selectedInvoice.warehouseName || (selectedInvoice.warehouseId === 'KHO_XSTORE' ? 'Kho Xstore (Đống Đa)' : selectedInvoice.warehouseId === 'KHO_TONG' ? 'Kho Tổng (Hà Nội)' : 'Kho PhoneHouse (Cầu Giấy)')}
            </span>
          </div>
        </div>

        {/* 7. Sticky Bottom Action Bar (Docked above bottom menu on mobile) */}
        <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-zinc-200/80 py-2.5 px-4 z-40 shadow-lg">
          <div className="max-w-2xl mx-auto grid grid-cols-2 gap-3">
            <button
              onClick={() => setIsPrintModalOpen(true)}
              className="py-2.5 px-4 bg-white hover:bg-orange-50 text-orange-600 border border-orange-200 font-semibold rounded-xl text-xs sm:text-sm flex items-center justify-center space-x-2 transition-all shadow-2xs active:scale-95 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-orange-600" />
              <span>In Hóa Đơn (K80)</span>
            </button>

            <button
              onClick={() => setIsQRModalOpen(true)}
              className="py-2.5 px-4 bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white font-semibold rounded-xl text-xs sm:text-sm flex items-center justify-center space-x-2 transition-all shadow-md shadow-orange-500/20 active:scale-95 cursor-pointer"
            >
              <QrCode className="w-4 h-4" />
              <span>Tạo QR Thu Tiền</span>
            </button>
          </div>
        </div>

        {/* MODAL: Thermal Print K80 Preview */}
        {isPrintModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-zinc-200 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
                <h3 className="font-semibold text-zinc-900 text-sm flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-orange-600" />
                  <span>Xem Trước Hóa Đơn Nhiệt K80</span>
                </h3>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="w-7 h-7 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center hover:bg-zinc-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Thermal Paper Look */}
              <div className="p-4 bg-orange-50/40 border border-dashed border-zinc-300 rounded-2xl font-mono text-xs space-y-3 text-zinc-900">
                <div className="text-center space-y-0.5">
                  <h4 className="font-semibold text-sm uppercase">PHONE HOUSE STORE</h4>
                  <p className="text-[10px] text-zinc-600">Đ/c: 123 Cầu Giấy, Hà Nội</p>
                  <p className="text-[10px] text-zinc-600">Hotline: 0909.123.456</p>
                  <div className="border-b border-zinc-400 my-2"></div>
                  <h5 className="font-semibold text-xs">HÓA ĐƠN BÁN LẺ & BẢO HÀNH</h5>
                  <p className="text-[11px] font-semibold text-orange-700">{invoiceCode}</p>
                  <p className="text-[10px] text-zinc-500">{rawDate}</p>
                </div>

                <div className="text-[11px] space-y-0.5 pt-1">
                  <div>Khách hàng: <span className="font-semibold">{customerName}</span></div>
                  <div>Điện thoại: <span className="font-semibold">{customerPhone}</span></div>
                  <div>Thu ngân: <span>{selectedInvoice.cashier || 'Nhật ADMIN'}</span></div>
                </div>

                <div className="border-t border-b border-dashed border-zinc-400 py-2 space-y-1.5">
                  {displayItems.map((it, i) => (
                    <div key={i} className="flex justify-between text-[11px]">
                      <div>
                        <div className="font-medium">{it.name}</div>
                        {it.imei && <div className="text-[10px] text-zinc-600">IMEI: {it.imei}</div>}
                        <div className="text-[10px] text-zinc-500">{it.unitPrice.toLocaleString('vi-VN')}đ x {it.quantity || 1}</div>
                      </div>
                      <div className="font-semibold font-mono">
                        {it.totalPrice.toLocaleString('vi-VN')}đ
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-1 text-[11px] pt-1">
                  <div className="flex justify-between font-medium text-zinc-600">
                    <span>Tổng tiền niêm yết:</span>
                    <span>{(selectedInvoice.totalAmount || selectedInvoice.finalAmount).toLocaleString('vi-VN')}đ</span>
                  </div>

                  {(selectedInvoice.discountAmount || 0) > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>- Giảm giá Voucher:</span>
                      <span>-{(selectedInvoice.discountAmount || 0).toLocaleString('vi-VN')}đ</span>
                    </div>
                  )}

                  {((selectedInvoice.tradeInDiscount || (selectedInvoice as any).tradeInDeduction || 0) > 0) && (
                    <div className="flex justify-between text-orange-600 font-bold">
                      <span>- Trừ Thu Cũ ({(selectedInvoice as any).tradeInModel || 'Thu cũ đổi mới'}):</span>
                      <span>-{((selectedInvoice.tradeInDiscount || (selectedInvoice as any).tradeInDeduction || 0)).toLocaleString('vi-VN')}đ</span>
                    </div>
                  )}

                  <div className="flex justify-between font-bold text-sm text-zinc-900 pt-1 border-t border-zinc-200">
                    <span>Khách Cần Thanh Toán:</span>
                    <span>{selectedInvoice.finalAmount.toLocaleString('vi-VN')}đ</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-500 pt-0.5">
                    <span>Phương thức:</span>
                    <span>{selectedInvoice.paymentMethod}</span>
                  </div>
                  {selectedInvoice.warrantyPackage && (
                    <div className="text-[10px] text-zinc-700 bg-white p-1.5 rounded border border-zinc-200 mt-1">
                      🛡️ {selectedInvoice.warrantyPackage}
                    </div>
                  )}
                </div>

                <div className="text-center text-[10px] text-zinc-500 pt-2 border-t border-dashed border-zinc-300">
                  <p className="font-semibold text-zinc-800">Cảm ơn Quý Khách & Hẹn Gặp Lại!</p>
                  <p>Bao test 1 đổi 1 trong 30 ngày đầu</p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-600 hover:bg-zinc-100"
                >
                  Đóng
                </button>
                <button
                  onClick={() => {
                    window.print();
                    setIsPrintModalOpen(false);
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-500 text-white text-xs font-semibold rounded-xl shadow-md flex items-center space-x-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>In Máy K80 Ngay</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Dynamic VietQR Payment */}
        {isQRModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-zinc-200 space-y-4 text-center">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
                <h3 className="font-semibold text-zinc-900 text-sm flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-orange-600" />
                  <span>Mã Chuyển Khoản VietQR</span>
                </h3>
                <button
                  onClick={() => setIsQRModalOpen(false)}
                  className="w-7 h-7 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center hover:bg-zinc-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* VietQR Generated Box */}
              <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-100 flex flex-col items-center space-y-3">
                <div className="w-48 h-48 bg-white p-2.5 rounded-2xl shadow-md border border-orange-200 flex flex-col items-center justify-center relative">
                  <img
                    src={`https://api.vietqr.io/image/970422-0909123456-compact2.jpg?amount=${selectedInvoice.finalAmount}&addInfo=THANH%20TOAN%20${invoiceCode}&accountName=PHONE%20HOUSE`}
                    alt="VietQR Phone House"
                    className="w-full h-full object-contain rounded-lg"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>

                <div className="space-y-1 text-xs">
                  <div className="font-semibold text-zinc-800">MBBANK - Ngân Hàng Quân Đội</div>
                  <div className="font-mono text-orange-600 font-semibold text-sm">0909 123 456</div>
                  <div className="text-zinc-500 font-medium uppercase text-[11px]">PHONE HOUSE APPLE STORE</div>
                </div>

                <div className="w-full bg-white p-2.5 rounded-xl border border-zinc-200 text-left text-xs space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span className="text-zinc-500 font-normal">Số tiền:</span>
                    <span className="font-semibold text-orange-600">{selectedInvoice.finalAmount.toLocaleString('vi-VN')} đ</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500 font-normal">Nội dung:</span>
                    <span className="font-semibold text-zinc-800">THANH TOAN {invoiceCode}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  handleQuickChangeStatus('completed');
                  setIsQRModalOpen(false);
                }}
                className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-orange-500 text-white text-xs font-semibold rounded-xl shadow-md cursor-pointer"
              >
                Đã Thu Tiền Xong
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDER: INVOICES LIST VIEW
  // ----------------------------------------------------
  return (
    <div className="w-full space-y-3 sm:space-y-3.5 pb-24 relative animate-fadeIn">
      {/* 1. Header: "Hóa đơn" + badge "5 đơn" + "+ POS" button */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight">
            Hóa đơn
          </h1>
          <span className="text-xs font-semibold text-orange-600 bg-orange-100/90 px-2.5 py-0.5 rounded-full">
            {filteredInvoices.length} đơn
          </span>
        </div>

        
      </div>

      {/* 2. Filter Bar (Segmented Pills & Filter Button) */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
        <button
          onClick={() => setStatusFilter('all')}
          className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all shrink-0 cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-orange-50 text-orange-600 border border-orange-300 shadow-2xs'
              : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          <List className="w-3.5 h-3.5 text-orange-500" />
          <span>Tất cả</span>
        </button>

        <button
          onClick={() => setStatusFilter('completed')}
          className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all shrink-0 cursor-pointer ${
            statusFilter === 'completed'
              ? 'bg-orange-50 text-orange-700 border border-orange-300 shadow-2xs'
              : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-orange-500" />
          <span>Hoàn thành</span>
        </button>

        <button
          onClick={() => setStatusFilter('pending')}
          className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all shrink-0 cursor-pointer ${
            statusFilter === 'pending'
              ? 'bg-orange-50 text-orange-700 border border-orange-300 shadow-2xs'
              : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-orange-500" />
          <span>Chờ xử lý</span>
        </button>

        <button
          onClick={() => setStatusFilter('installment')}
          className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all shrink-0 cursor-pointer ${
            statusFilter === 'installment'
              ? 'bg-rose-50 text-rose-700 border border-rose-300 shadow-2xs'
              : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5 text-rose-500" />
          <span>Trả góp 0%</span>
        </button>

        {/* Filter Sliders Button with Dropdown */}
        <div className="relative shrink-0 ml-auto">
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className="p-1.5 bg-white border border-zinc-200 hover:border-orange-300 rounded-full text-zinc-600 hover:text-orange-600 transition-all cursor-pointer shadow-2xs"
            title="Lọc thời gian & nâng cao"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>

          {showFilterDropdown && (
            <div className="absolute right-0 top-9 z-30 bg-white rounded-2xl shadow-xl border border-zinc-200 p-2.5 w-48 space-y-1 animate-fadeIn">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block px-2 py-0.5">Thời gian</span>
              {(['all', 'today', 'yesterday', 'this_week', 'this_month'] as TimeFilter[]).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTimeFilter(t);
                    setShowFilterDropdown(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    timeFilter === t ? 'bg-orange-50 text-orange-600 font-bold' : 'text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  {t === 'all' && 'Toàn thời gian'}
                  {t === 'today' && 'Hôm nay'}
                  {t === 'yesterday' && 'Hôm qua'}
                  {t === 'this_week' && '7 ngày qua'}
                  {t === 'this_month' && 'Tháng này'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Search Bar with Barcode Scanner Icon */}
      <div className="relative w-full">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm mã HĐ, khách, SĐT, IMEI..."
          className="w-full pl-8 pr-8 py-1.5 text-xs bg-white border border-zinc-200/90 rounded-2xl focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-normal text-zinc-800 shadow-2xs"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-1.5">
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="text-zinc-400 hover:text-zinc-600 mr-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
          <button
            onClick={() => {
              setSearchQuery(searchQuery ? '' : 'HD019533');
            }}
            className="text-orange-500 hover:text-orange-600 p-0.5 cursor-pointer"
            title="Quét barcode / IMEI"
          >
            <ScanLine className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 4. 3 Clean Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs">
          <div className="text-xs font-bold text-zinc-500 mb-1">Doanh Thu Thuần (Net)</div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-zinc-900 tracking-tight">
            {netRevenue.toLocaleString('vi-VN')} <span className="text-xs font-sans font-bold">đ</span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {validInvoices.length} hóa đơn hợp lệ
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs">
          <div className="text-xs font-bold text-emerald-700 mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Đã Thu Thực Tế</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-700 tracking-tight">
            {paidRevenue.toLocaleString('vi-VN')} <span className="text-xs font-sans font-bold">đ</span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Tiền mặt, VietQR & Chuyển khoản
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs">
          <div className="text-xs font-bold text-amber-700 mb-1 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Chờ Thu / Công Nợ</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-amber-700 tracking-tight">
            {debtRevenue.toLocaleString('vi-VN')} <span className="text-xs font-sans font-bold">đ</span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Đơn trả góp 0% & Công nợ khách
          </div>
        </div>
      </div>

      {/* 5. Invoices Grouped by Date */}
      {Object.keys(groupedInvoices).length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-zinc-200/80 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-zinc-800 text-sm">Không tìm thấy hóa đơn nào</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto font-normal">
            Chưa có hóa đơn phù hợp với bộ lọc thời gian hoặc từ khóa tìm kiếm.
          </p>
          <button
            onClick={onNavigateToPOS}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-500 text-white font-medium text-xs rounded-xl shadow-xs cursor-pointer"
          >
            + Lên Đơn Mới Tại POS
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedInvoices).map(([dateGroup, items]) => {
            const invoiceList = items as SalesInvoice[];
            return (
              <div key={dateGroup} className="space-y-1.5">
                {/* Date Header matching image format */}
                <div className="px-1 text-[11px] sm:text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📅</span>
                  <span>{dateGroup}</span>
                </div>

                {/* Invoices in this Date Group */}
                <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-2xs divide-y divide-zinc-100 overflow-hidden">
                  {invoiceList.map((inv) => {
                    const summary = getInvoiceSummary(inv);
                    const invoiceCode = inv.invoiceCode || inv.id;
                    const timeSnippet = (inv.createdDate || inv.createdAt || '14/08/2026 14:13').split(' ')[1] || '14:13';
                    const customerName = inv.customerName || 'Khách Vãng Lai';
                    const amount = inv.finalAmount || inv.totalAmount || 0;
                    const st = inv.status || 'completed';
                    const stCfg = STATUS_CONFIG[st] || STATUS_CONFIG.completed;
                    const isInstallment = (inv.paymentMethod || '').toLowerCase().includes('installment') || (inv.paymentMethod || '').includes('Trả góp');

                    return (
                      <div
                        key={inv.id}
                        onClick={() => setSelectedInvoice(inv)}
                        className={`p-3 sm:p-3.5 flex items-center justify-between hover:bg-orange-50/40 cursor-pointer transition-all group ${
                          selectedInvoice?.id === inv.id ? 'bg-orange-50/70 border-l-4 border-l-[#FF4B16]' : ''
                        }`}
                      >
                        {/* Left: Time, Customer, Status, Product */}
                        <div className="space-y-1 min-w-0 flex-1 pr-3">
                          {/* Code, Time & Customer Name */}
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-zinc-900 font-mono">
                              {invoiceCode}
                            </span>
                            <span className="text-[11px] text-zinc-400 font-mono">
                              • {timeSnippet}
                            </span>
                            <span className="text-xs text-zinc-700 font-semibold truncate">
                              • {customerName}
                            </span>
                          </div>

                          {/* Status Badges Row */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`${stCfg.bg} ${stCfg.text} border ${stCfg.border} text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${stCfg.dot}`}></span>
                              <span>{stCfg.label}</span>
                            </span>

                            {isInstallment && (
                              <span className="text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">
                                Trả góp 0%
                              </span>
                            )}
                          </div>

                          {/* Product Line Item */}
                          <div className="text-xs text-zinc-600 font-normal truncate pt-0.5">
                            <span>{summary.firstItem}</span>
                            {summary.remainingCount && (
                              <span className="text-orange-600 font-medium ml-1.5">
                                {summary.remainingCount}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right: Amount, Currency and Chevron */}
                        <div className="text-right shrink-0 flex items-center space-x-1">
                          <div className="flex flex-col items-end justify-center">
                            <div className="text-sm sm:text-base font-bold text-zinc-900 font-mono tracking-tight group-hover:text-orange-600 transition-colors">
                              {amount.toLocaleString('vi-VN')}đ
                            </div>
                            <span className="text-[10px] text-zinc-400 font-normal">VNĐ</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-orange-400 group-hover:translate-x-0.5 transition-all" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. Desktop Right Drawer & Mobile Sheet for Invoice Detail */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-200">
          {/* Backdrop overlay */}
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity" 
            onClick={() => setSelectedInvoice(null)}
          />
          {/* Drawer / Sheet Panel */}
          <div className="relative w-full sm:w-[600px] lg:w-[680px] bg-[#FAFAFA] h-full shadow-2xl flex flex-col z-50 border-l border-zinc-200 overflow-y-auto">
            {renderInvoiceDetail(selectedInvoice)}
          </div>
        </div>
      )}
    </div>
  );
};
