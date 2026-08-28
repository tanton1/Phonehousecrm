import React, { useEffect, useState, useMemo } from 'react';
import { SalesInvoice, DeviceItem, StoreBranch, WarehouseInfo } from '../types';
import { invoiceDateTime } from '../utils/dateValue';
import { asInvoiceMoney, formatVnd, getInvoiceFinalAmount, getInvoiceLines, getInvoiceSubtotal } from '../utils/invoicePresentation';
import { ActivityLog } from "./ActivityLog";
import { DocumentHeader } from './shared/DocumentHeader';
import { StatusBadge } from './shared/StatusBadge';
import { DateRangeFilter } from './shared/DateRangeFilter';
import { InventoryMetricCarousel } from './InventoryMetricCarousel';
import { DEFAULT_DATE_FILTER, matchesDateFilter } from '../utils/dateRangeFilter';
import { resolveRecordBranch } from '../utils/branchScope';
import { ImeiLink } from './GlobalImeiHistory';
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
  List,
  ScanLine
} from 'lucide-react';

interface InvoicesViewProps {
  invoices: SalesInvoice[];
  devices: DeviceItem[];
  branches?: StoreBranch[];
  warehouses?: WarehouseInfo[];
  onNavigateToPOS: () => void;
  onUpdateInvoiceNote?: (invoiceId: string, notes: string) => Promise<SalesInvoice>;
  onCancelInvoice?: (invoice: SalesInvoice, reason: string) => Promise<void> | void;
  initialSelectedInvoiceId?: string | null;
}

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
  branches = [],
  warehouses = [],
  onNavigateToPOS,
  onUpdateInvoiceNote,
  onCancelInvoice,
  initialSelectedInvoiceId
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState(DEFAULT_DATE_FILTER);
  const [statusFilter, setStatusFilter] = useState<string>('all');
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

  // Filter & Search Logic
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      // 1. Search Query
      const query = searchQuery.toLowerCase().trim();
      const code = (inv.invoiceCode || inv.id).toLowerCase();
      const name = (inv.customerName || '').toLowerCase();
      const phone = (inv.customerPhone || inv.phone || '').toLowerCase();
      const imeiMatch = inv.imeiList?.some(imei => String(imei || '').includes(query)) ||
        inv.items?.some((it: any) => String(it.imei || '').includes(query)) ||
        inv.detailedItems?.some(it => String(it.imei || '').includes(query));
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
        if (statusFilter === 'installment') {
          const paymentMethod = (inv.paymentMethod || '').toLowerCase();
          if (!paymentMethod.includes('trả góp') && !paymentMethod.includes('installment')) return false;
        }
      }

      // 3. Date Filter: one range drives both the invoice list and metrics.
      return matchesDateFilter(inv.createdDate || inv.createdAt, dateFilter);
    });
  }, [invoices, searchQuery, dateFilter, statusFilter]);

  // Aggregate totals: Exclude cancelled / refunded from Net Revenue
  const validInvoices = useMemo(() => {
    return filteredInvoices.filter(inv => {
      const s = (inv.status || '').toLowerCase();
      return s !== 'cancelled' && s !== 'refunded';
    });
  }, [filteredInvoices]);

  const netRevenue = useMemo(() => {
    return validInvoices.reduce((sum, inv) => sum + getInvoiceFinalAmount(inv), 0);
  }, [validInvoices]);

  const paidRevenue = useMemo(() => {
    return validInvoices.reduce((sum, inv) => {
      const paid = inv.paidAmount !== undefined ? asInvoiceMoney(inv.paidAmount) : getInvoiceFinalAmount(inv);
      return sum + paid;
    }, 0);
  }, [validInvoices]);

  const debtRevenue = useMemo(() => {
    return Math.max(0, netRevenue - paidRevenue);
  }, [netRevenue, paidRevenue]);

  // Group invoices by date string
  const groupedInvoices = useMemo(() => {
    const groups: { [key: string]: SalesInvoice[] } = {};

    filteredInvoices.forEach(inv => {
      const rawDate = invoiceDateTime(inv.createdDate || inv.createdAt, '2026-08-14').replace('T', ' ').split(' ')[0];

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
        const label = `${String(it.name || 'Sản phẩm').toUpperCase()}${details ? ` - ${details}` : ''} x${qty}`;
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
          itemNames.push(`${String(a.name || 'Phụ kiện').toUpperCase()} x${qty}`);
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

  const handleSaveNote = async () => {
    if (!selectedInvoice || !onUpdateInvoiceNote) return;
    try {
      const updated = await onUpdateInvoiceNote(selectedInvoice.id, noteContent);
      setSelectedInvoice(updated);
      setIsEditingNote(false);
      triggerSyncToast('Đã lưu ghi chú hóa đơn qua máy chủ');
    } catch (error: any) {
      alert(error?.message || 'Không thể lưu ghi chú hóa đơn.');
    }
  };

  // ----------------------------------------------------
  // RENDER: DETAIL DRAWER VIEW
  // ----------------------------------------------------
  const renderInvoiceDetail = (selectedInvoice: SalesInvoice) => {
    const summary = getInvoiceSummary(selectedInvoice);
    const invoiceCode = selectedInvoice.invoiceCode || selectedInvoice.id;
    const rawDate = invoiceDateTime(selectedInvoice.createdDate || selectedInvoice.createdAt, '— Chưa xác định');
    const customerPhone = selectedInvoice.customerPhone || selectedInvoice.phone || '— Chưa có SĐT';
    const customerName = selectedInvoice.customerName || 'Khách lẻ vãng lai';
    const statusKey = selectedInvoice.status || 'completed';
    const currentStatusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG.completed;

    const displayItems = getInvoiceLines(selectedInvoice);
    const subTotal = getInvoiceSubtotal(selectedInvoice, displayItems);
    const finalAmount = getInvoiceFinalAmount(selectedInvoice, subTotal);

    const totalQty = displayItems.reduce((sum, it) => sum + (it.quantity || 1), 0);
    const invoiceBranch = resolveRecordBranch(selectedInvoice, branches, warehouses);
    const invoiceBranchName = invoiceBranch?.name
      || selectedInvoice.branchName
      || selectedInvoice.branch
      || 'Chưa xác định chi nhánh';
    const invoiceWarehouse = warehouses.find(warehouse => warehouse.id === selectedInvoice.warehouseId);
    const invoiceWarehouseName = invoiceWarehouse?.name
      || selectedInvoice.warehouseName
      || selectedInvoice.warehouseId
      || 'Chưa xác định kho xuất';

    return (
      <div className="flex min-h-full w-full flex-col space-y-3 pb-6 sm:space-y-4">
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
          branchName={invoiceBranchName}
          statusBadge={
            <div className="relative">
              <div
                className={`${currentStatusConfig.bg} ${currentStatusConfig.text} border ${currentStatusConfig.border} text-[11px] font-medium px-2.5 py-0.5 rounded-full flex items-center space-x-1.5 shadow-2xs`}
                title="Trạng thái kế toán chỉ thay đổi qua nghiệp vụ thanh toán/hủy hoàn"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${currentStatusConfig.dot}`}></span>
                <span>{currentStatusConfig.label}</span>
              </div>
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
                      className="w-full px-3.5 py-2 text-left font-medium text-zinc-700 hover:bg-orange-50 hover:text-[#ff4b16] flex items-center space-x-2 cursor-pointer"
                    >
                      <QrCode className="w-4 h-4 text-[#ff4b16]" />
                      <span>Tạo mã VietQR thu tiền</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreDropdown(false);
                        handleCopy(`${window.location.origin}?invoice=${invoiceCode}`, 'link');
                      }}
                      className="w-full px-3.5 py-2 text-left font-medium text-zinc-700 hover:bg-orange-50 hover:text-[#ff4b16] flex items-center space-x-2 cursor-pointer"
                    >
                      <Share2 className="w-4 h-4 text-zinc-400" />
                      <span>{copiedText === 'link' ? 'Đã sao chép link!' : 'Chia sẻ liên kết'}</span>
                    </button>
                    {onCancelInvoice && (
                      <button
                        type="button"
                        onClick={async () => {
                          if ((selectedInvoice.status as string || '').toLowerCase() === 'cancelled') {
                            alert('Hóa đơn này đã ở trạng thái ĐÃ HỦY.');
                            return;
                          }
                          const reason = window.prompt(`Nhập lý do hủy/hoàn hóa đơn ${invoiceCode}:`, 'Khách đổi ý trả hàng hoàn tiền');
                          if (reason !== null && reason.trim()) {
                            await onCancelInvoice(selectedInvoice, reason.trim());
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

        <section className="mx-0 rounded-none border border-orange-100 bg-gradient-to-br from-white to-orange-50/70 p-4 shadow-sm sm:mx-4 sm:rounded-2xl sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-[#ff4b16] text-white flex items-center justify-center font-bold text-sm shadow-sm shadow-orange-500/20">
                <UserIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className="truncate font-bold text-zinc-900 text-sm sm:text-base">
                    {customerName}
                  </h3>
                  <span className="shrink-0 text-[10px] font-bold bg-orange-100/70 text-[#ff4b16] px-2 py-0.5 rounded-md border border-orange-200/60">
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
              className="shrink-0 p-2 rounded-xl text-zinc-400 hover:text-[#ff4b16] hover:bg-orange-100 transition-colors cursor-pointer"
              title="Sao chép SĐT"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* 3. Line Items Breakdown List */}
        <section className="mx-0 divide-y divide-zinc-100 overflow-hidden rounded-none border border-zinc-200/80 bg-white shadow-sm sm:mx-4 sm:rounded-2xl">
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
                  {item.type === 'device' ? (
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
                        IMEI: <ImeiLink imei={item.imei}>{item.imei}</ImeiLink>
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
                    {formatVnd(item.unitPrice)}đ x {item.quantity || 1}
                  </div>
                </div>
              </div>

              {/* Line item subtotal */}
              <div className="text-right font-semibold text-zinc-800 text-xs sm:text-sm font-mono shrink-0">
                {formatVnd(item.totalPrice)}đ
              </div>
            </div>
          ))}
        </section>

        {/* 4. Financial & Payment Summary Card with Soft Brand Gradient */}
        <section className="mx-0 space-y-2.5 rounded-none border border-orange-200/60 bg-gradient-to-br from-white via-orange-50/20 to-white p-3.5 text-xs shadow-sm sm:mx-4 sm:rounded-2xl sm:p-4 sm:text-sm">
          <div className="flex justify-between items-center py-1">
            <span className="text-zinc-600 flex items-center space-x-1.5 font-normal">
              <span>Tổng tiền hàng ({totalQty} món)</span>
            </span>
            <span className="font-semibold text-zinc-800 font-mono">
              {formatVnd(subTotal)}đ
            </span>
          </div>

          {(selectedInvoice.discountAmount || 0) > 0 && (
            <div className="flex justify-between items-center py-1 text-rose-600 font-normal">
              <span className="flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" />
                <span>Giảm giá Voucher / Khuyến mãi</span>
              </span>
              <span className="font-semibold font-mono">
                -{formatVnd(selectedInvoice.discountAmount)}đ
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
                -{formatVnd(selectedInvoice.tradeInDiscount ?? selectedInvoice.tradeInDeduction)}đ
              </span>
            </div>
          )}

          <div className="pt-2 border-t border-orange-200/50 flex justify-between items-center text-sm sm:text-base font-semibold">
            <span className="text-zinc-900 font-bold">Tổng thanh toán</span>
            <span className="text-[#ff4b16] font-mono text-base sm:text-lg font-black">
              {formatVnd(finalAmount)}đ
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
                      {formatVnd(sp.amount)}đ
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
                {formatVnd(selectedInvoice.paidAmount ?? finalAmount)}đ
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
                  <span className="font-semibold font-mono">{formatVnd(selectedInvoice.installmentDetails.downPayment)}đ</span>
                </div>
                <div>
                  <span className="text-orange-700 block font-normal">Mỗi tháng:</span>
                  <span className="font-semibold text-orange-800 font-mono">{formatVnd(selectedInvoice.installmentDetails.monthlyPayment)}đ</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 5. Notes Card */}
        <section className="mx-0 space-y-2 rounded-none border border-zinc-200/80 bg-white p-3.5 shadow-sm sm:mx-4 sm:rounded-2xl sm:p-4">
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
        </section>

        {/* 6a. Activity Log / History Card */}
        {selectedInvoice.history && selectedInvoice.history.length > 0 && (
          <div className="mx-0 rounded-none border border-zinc-200/80 bg-white p-3.5 shadow-sm sm:mx-4 sm:rounded-2xl sm:p-4">
            <ActivityLog logs={selectedInvoice.history} className="space-y-2.5" />
          </div>
        )}

        {/* 6. Metadata Details Card */}
        <section className="mx-0 grid grid-cols-2 gap-3 rounded-none border border-zinc-200/80 bg-white p-3.5 text-xs shadow-sm sm:mx-4 sm:rounded-2xl sm:gap-4 sm:p-4">
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
              🏪 {invoiceBranchName}
            </span>
          </div>

          <div className="pt-2 border-t border-zinc-100">
            <span className="text-zinc-400 block text-[11px] font-normal">Kho xuất trừ tồn</span>
            <span className="font-semibold text-orange-700 mt-0.5 block">
              🏢 {invoiceWarehouseName}
            </span>
          </div>
        </section>

        {/* 7. Sticky Bottom Action Bar (Docked above bottom menu on mobile) */}
        <div className="relative border border-zinc-200/80 bg-white/95 px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-sm backdrop-blur-md sm:mx-4 sm:rounded-2xl">
          <div className="grid grid-cols-2 gap-3">
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
                  <h4 className="font-semibold text-sm uppercase">{invoiceBranchName}</h4>
                  <p className="text-[10px] text-zinc-600">Đ/c: {invoiceBranch?.address || 'Chưa cấu hình địa chỉ'}</p>
                  <p className="text-[10px] text-zinc-600">Hotline: {invoiceBranch?.phone || 'Chưa cấu hình'}</p>
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
                        {it.imei && <div className="text-[10px] text-zinc-600">IMEI: <ImeiLink imei={it.imei}>{it.imei}</ImeiLink></div>}
                        <div className="text-[10px] text-zinc-500">{formatVnd(it.unitPrice)}đ x {it.quantity || 1}</div>
                      </div>
                      <div className="font-semibold font-mono">
                        {formatVnd(it.totalPrice)}đ
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-1 text-[11px] pt-1">
                  <div className="flex justify-between font-medium text-zinc-600">
                    <span>Tổng tiền niêm yết:</span>
                    <span>{formatVnd(subTotal)}đ</span>
                  </div>

                  {(selectedInvoice.discountAmount || 0) > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>- Giảm giá Voucher:</span>
                       <span>-{formatVnd(selectedInvoice.discountAmount)}đ</span>
                    </div>
                  )}

                  {((selectedInvoice.tradeInDiscount || (selectedInvoice as any).tradeInDeduction || 0) > 0) && (
                    <div className="flex justify-between text-orange-600 font-bold">
                      <span>- Trừ Thu Cũ ({(selectedInvoice as any).tradeInModel || 'Thu cũ đổi mới'}):</span>
                       <span>-{formatVnd(selectedInvoice.tradeInDiscount ?? (selectedInvoice as any).tradeInDeduction)}đ</span>
                    </div>
                  )}

                  <div className="flex justify-between font-bold text-sm text-zinc-900 pt-1 border-t border-zinc-200">
                    <span>Khách Cần Thanh Toán:</span>
                    <span>{formatVnd(finalAmount)}đ</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-500 pt-0.5">
                    <span>Phương thức:</span>
                     <span>{selectedInvoice.paymentMethod || 'Chưa xác định'}</span>
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
                    src={`https://api.vietqr.io/image/970422-0909123456-compact2.jpg?amount=${finalAmount}&addInfo=THANH%20TOAN%20${invoiceCode}&accountName=PHONE%20HOUSE`}
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
                    <span className="font-semibold text-orange-600">{formatVnd(finalAmount)} đ</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500 font-normal">Nội dung:</span>
                    <span className="font-semibold text-zinc-800">THANH TOAN {invoiceCode}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsQRModalOpen(false)}
                className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-orange-500 text-white text-xs font-semibold rounded-xl shadow-md cursor-pointer"
              >
                Đóng mã QR
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
    <div className="relative w-full space-y-4 pb-28 animate-fadeIn">
      <section className="relative overflow-hidden rounded-none bg-gradient-to-br from-zinc-950 via-zinc-900 to-orange-950 p-4 text-white shadow-xl sm:rounded-[1.75rem] sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-orange-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-64 rounded-full bg-amber-300/10 blur-3xl" />
        <div className="relative flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-orange-300"><Receipt className="h-3.5 w-3.5" /> Sổ bán hàng</div>
            <h1 className="truncate text-xl font-black tracking-tight sm:text-2xl">Quản lý hóa đơn</h1>
            <p className="mt-1 hidden max-w-xl text-xs text-zinc-300 sm:block">Tra cứu chứng từ và dòng tiền theo thời gian thực.</p>
          </div>
          <button type="button" onClick={onNavigateToPOS} className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-3 text-xs font-black text-white shadow-lg shadow-orange-950/40 transition hover:bg-orange-400 active:scale-[0.98]"><Plus className="h-4 w-4" /><span className="sm:hidden">Bán POS</span><span className="hidden sm:inline">Lên đơn tại POS</span></button>
        </div>

        <InventoryMetricCarousel className="relative mt-3" label="Báo cáo hóa đơn, vuốt để xem thêm">
          <article className="h-full rounded-2xl border border-white/10 bg-white/[0.07] p-3 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-orange-200"><DollarSign className="h-3.5 w-3.5" /> Doanh thu thuần</div>
            <p className="mt-1.5 truncate font-mono text-xl font-black text-white">{formatVnd(netRevenue)}đ</p>
            <p className="mt-0.5 text-[9px] font-semibold text-zinc-400">Không tính hóa đơn hủy/hoàn</p>
          </article>
          <article className="h-full rounded-2xl border border-emerald-300/15 bg-emerald-400/10 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-200"><CheckCircle2 className="h-3.5 w-3.5" /> Đã thu thực tế</div>
            <p className="mt-1.5 truncate font-mono text-xl font-black text-emerald-100">{formatVnd(paidRevenue)}đ</p>
            <p className="mt-0.5 text-[9px] font-semibold text-zinc-400">Tiền đã ghi nhận</p>
          </article>
          <article className="h-full rounded-2xl border border-amber-300/15 bg-amber-400/10 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-amber-200"><Clock className="h-3.5 w-3.5" /> Còn phải thu</div>
            <p className="mt-1.5 truncate font-mono text-xl font-black text-amber-100">{formatVnd(debtRevenue)}đ</p>
            <p className="mt-0.5 text-[9px] font-semibold text-zinc-400">Công nợ và khoản chờ thu</p>
          </article>
          <article className="h-full rounded-2xl border border-orange-300/15 bg-orange-400/10 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-orange-200"><Receipt className="h-3.5 w-3.5" /> Hóa đơn hiển thị</div>
            <p className="mt-1.5 font-mono text-xl font-black text-white">{filteredInvoices.length}</p>
            <p className="mt-0.5 text-[9px] font-semibold text-zinc-400">{validInvoices.length} hóa đơn hợp lệ</p>
          </article>
        </InventoryMetricCarousel>
      </section>

      {/* 2. Filter Bar (Segmented Pills & Filter Button) */}
      <div className="flex items-center gap-1.5 overflow-x-auto rounded-none border border-zinc-200 bg-white p-2 shadow-sm scrollbar-none sm:rounded-2xl">
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

        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-zinc-200" />
        <DateRangeFilter value={dateFilter} onChange={setDateFilter} />
      </div>

      {/* 3. Search Bar with Barcode Scanner Icon */}
      <div className="relative w-full rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm mã HĐ, khách, SĐT, IMEI..."
          className="w-full rounded-xl border-0 bg-zinc-50 py-2.5 pl-9 pr-9 text-sm font-medium text-zinc-800 outline-none transition focus:bg-white focus:ring-2 focus:ring-orange-300"
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

      {/* Invoices Grouped by Date */}
      {Object.keys(groupedInvoices).length === 0 ? (
        <div className="space-y-3 rounded-none border border-zinc-200/80 bg-white p-8 text-center sm:rounded-2xl">
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
                <div className="space-y-2">
                  {invoiceList.map((inv) => {
                    const summary = getInvoiceSummary(inv);
                    const invoiceCode = inv.invoiceCode || inv.id;
                    const createdText = invoiceDateTime(inv.createdDate || inv.createdAt, '2026-08-14T14:13:00');
                    const timeSnippet = (createdText.includes('T') ? createdText.split('T')[1] : createdText.split(' ')[1])?.slice(0, 5) || '14:13';
                    const customerName = inv.customerName || 'Khách Vãng Lai';
                    const amount = inv.finalAmount || inv.totalAmount || 0;
                    const st = inv.status || 'completed';
                    const stCfg = STATUS_CONFIG[st] || STATUS_CONFIG.completed;
                    const isInstallment = (inv.paymentMethod || '').toLowerCase().includes('installment') || (inv.paymentMethod || '').includes('Trả góp');

                    return (
                      <div
                        key={inv.id}
                        onClick={() => setSelectedInvoice(inv)}
                        className={`group flex cursor-pointer items-center justify-between gap-3 rounded-none border p-3.5 shadow-sm transition-all sm:rounded-2xl sm:p-4 ${
                          selectedInvoice?.id === inv.id ? 'border-orange-400 bg-orange-50 shadow-orange-100' : 'border-zinc-200 bg-white hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md'
                        }`}
                      >
                        {/* Left: Time, Customer, Status, Product */}
                        <div className="space-y-1 min-w-0 flex-1 pr-3">
                          {/* Code, Time & Customer Name */}
                          <div className="flex items-center space-x-2">
                            <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-black text-zinc-900 font-mono group-hover:bg-orange-100 group-hover:text-orange-700">
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
                            <div className="text-sm sm:text-base font-black text-zinc-900 font-mono tracking-tight group-hover:text-orange-600 transition-colors">
                              {formatVnd(amount)}đ
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end animate-in fade-in duration-200">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedInvoice(null)}
          />
          {/* Drawer / Sheet Panel */}
          <div className="relative z-50 flex h-[100dvh] w-full flex-col overflow-hidden rounded-none border-0 bg-[#FAFAFA] shadow-2xl sm:h-full sm:w-[640px] sm:border-l sm:border-zinc-200 lg:w-[720px]">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {renderInvoiceDetail(selectedInvoice)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
