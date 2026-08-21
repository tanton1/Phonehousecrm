import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Barcode,
  Boxes,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Loader2,
  MapPin,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  Truck,
  UserRound,
  Wrench,
  X
} from 'lucide-react';
import {
  DeviceItem,
  StockTransferSlip,
  StoreBranch,
  TechnicalPriority,
  TechnicalTaskTypeConfig,
  UserAccount,
  WarehouseInfo
} from '../types';
import {
  createIdempotencyKey,
  fetchInventoryTransferMetadata,
  fetchInventoryTransfers,
  requestAcceptTechnicalTransfer,
  requestCancelTechnicalTransfer,
  requestCompleteInterBranchTransfer,
  requestCreateInterBranchTransfer,
  requestCreateTechnicalTransfer,
  requestReceiveInterBranchTransfer
} from '../services/inventoryTransferApiClient';
import { isWarehouseActive } from '../utils/warehouseLifecycle';

type TransferTab = 'TECHNICAL' | 'INTER_BRANCH';
type ReceiptDraft = Record<string, { result: 'RECEIVED' | 'MISSING' | 'WRONG_DEVICE' | 'DAMAGED'; scannedImei: string; notes: string }>;
type TaskDraft = { taskType: string; priority: TechnicalPriority };

interface WarehouseTransfersViewProps {
  transfers: StockTransferSlip[];
  devices: DeviceItem[];
  warehouses: WarehouseInfo[];
  branches: StoreBranch[];
  currentUser: UserAccount;
  onTransferSynced: (transfer: StockTransferSlip) => void;
  onInventoryRefresh?: () => Promise<void> | void;
}

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const PRIORITY_LABELS: Record<TechnicalPriority, string> = {
  NORMAL: 'Bình thường',
  PRIORITY: 'Ưu tiên',
  URGENT: 'Khẩn cấp'
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Nháp', className: 'bg-zinc-100 text-zinc-700 border-zinc-200' },
  APPROVED: { label: 'Đã duyệt', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  PENDING: { label: 'Chờ giao', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  WAITING_KTV_ACCEPT: { label: 'Chờ KTV nhận', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  IN_PROGRESS: { label: 'Đang xử lý', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  WAITING_QC: { label: 'Chờ QC', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  QC_FAILED: { label: 'QC không đạt', className: 'bg-red-50 text-red-700 border-red-200' },
  RETURNED_TO_MAIN_WAREHOUSE: { label: 'Đã trả Kho Tổng', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  IN_TRANSIT: { label: 'Đang vận chuyển', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  PARTIALLY_RECEIVED: { label: 'Nhận một phần', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  RECEIVED: { label: 'Đã nhận đủ', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  DISPUTED: { label: 'Đang tranh chấp', className: 'bg-red-50 text-red-700 border-red-200' },
  COMPLETED: { label: 'Hoàn tất', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CANCELLED: { label: 'Đã hủy', className: 'bg-zinc-100 text-zinc-500 border-zinc-200' }
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] || { label: status, className: 'bg-zinc-100 text-zinc-700 border-zinc-200' };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${meta.className}`}>{meta.label}</span>;
}

function getDeviceLocation(device: DeviceItem): string {
  return String(device.currentLocationId || device.warehouseId || device.warehouse || '');
}

function getTransferType(transfer: StockTransferSlip, warehouses: WarehouseInfo[]): TransferTab {
  if (transfer.transferType) return transfer.transferType;
  const destination = warehouses.find(item => item.id === (transfer.destinationLocationId || transfer.toWarehouse));
  return destination?.type === 'TECHNICIAN_SUB' ? 'TECHNICAL' : 'INTER_BRANCH';
}

function toDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function Drawer({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-zinc-950/30 backdrop-blur-[2px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className={`flex h-full w-full flex-col bg-[#fbfaf8] shadow-2xl ${wide ? 'max-w-4xl' : 'max-w-2xl'}`} role="dialog" aria-modal="true">
        <header className="flex items-start justify-between border-b border-zinc-200 bg-white px-5 py-4 sm:px-7">
          <div>
            <h2 className="text-lg font-black tracking-tight text-zinc-950">{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-xl border border-zinc-200 p-2 text-zinc-500 transition hover:bg-zinc-100" aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function EmptyList({ tab }: { tab: TransferTab }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 bg-white px-6 text-center">
      <div className="mb-3 rounded-2xl bg-orange-50 p-3 text-orange-600">{tab === 'TECHNICAL' ? <Wrench className="h-6 w-6" /> : <Truck className="h-6 w-6" />}</div>
      <p className="font-bold text-zinc-900">Chưa có phiếu phù hợp</p>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">Tạo phiếu mới hoặc thay đổi bộ lọc để xem dữ liệu điều chuyển.</p>
    </div>
  );
}

export const WarehouseTransfersView: React.FC<WarehouseTransfersViewProps> = ({
  transfers,
  devices,
  warehouses,
  branches,
  currentUser,
  onTransferSynced,
  onInventoryRefresh
}) => {
  const [activeTab, setActiveTab] = useState<TransferTab>('TECHNICAL');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTransfer, setDetailTransfer] = useState<StockTransferSlip | null>(null);
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [scopeFilter, setScopeFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [deviceSearch, setDeviceSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [taskTypes, setTaskTypes] = useState<TechnicalTaskTypeConfig[]>([]);
  const [metadataError, setMetadataError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const activeBranches = useMemo(() => branches.filter(branch => branch.isActive !== false), [branches]);
  const mainBranch = useMemo(() => activeBranches.find(branch => branch.isHeadquarter) || activeBranches.find(branch => warehouses.some(warehouse => warehouse.isMain && isWarehouseActive(warehouse) && warehouse.branchId === branch.id)) || activeBranches[0], [activeBranches, warehouses]);
  const mainWarehouse = useMemo(() => warehouses.find(item => item.isMain && isWarehouseActive(item) && item.branchId === mainBranch?.id), [warehouses, mainBranch]);
  const role = String(currentUser.role || '').toUpperCase();
  const isAdmin = role === 'ADMIN';
  const canCreateTransfer = ['ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'TECH_LEAD'].includes(role);

  const [sourceBranchId, setSourceBranchId] = useState('');
  const [destinationBranchId, setDestinationBranchId] = useState('');
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraft[]>>({});
  const [notes, setNotes] = useState('');
  const [transporter, setTransporter] = useState('');
  const [expectedDeliveryAt, setExpectedDeliveryAt] = useState('');
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft>({});
  const [technicalScan, setTechnicalScan] = useState('');
  const [scannedTechnicalImeis, setScannedTechnicalImeis] = useState<string[]>([]);

  useEffect(() => {
    fetchInventoryTransferMetadata(currentUser)
      .then(data => {
        setTaskTypes(data.taskTypes.filter(item => item.isActive));
        setMetadataError('');
      })
      .catch(error => {
        setMetadataError(error instanceof Error ? error.message : 'Không tải được cấu hình task kỹ thuật.');
        setTaskTypes([]);
      });
  }, [currentUser.id]);

  useEffect(() => {
    let active = true;
    const refresh = () => fetchInventoryTransfers(currentUser)
      .then(data => {
        if (active) data.transfers.forEach(onTransferSynced);
      })
      .catch(error => {
        if (active) setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Không tải được danh sách điều chuyển.' });
      });
    void refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
    // onTransferSynced intentionally omitted: App recreates the optimistic sync callback on render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!detailTransfer) return;
    const fresh = transfers.find(item => item.id === detailTransfer.id);
    if (fresh) setDetailTransfer(fresh);
  }, [transfers]);

  const locationsForBranch = (branchId: string) => {
    return warehouses.filter(location => isWarehouseActive(location) && location.branchId === branchId);
  };

  const technicalLocations = useMemo(() => warehouses.filter(location =>
    location.type === 'TECHNICIAN_SUB' && isWarehouseActive(location) && (
      !mainBranch?.id || location.branchId === mainBranch.id || location.parentWarehouseId === mainWarehouse?.id
    )
  ), [warehouses, mainBranch, mainWarehouse]);

  const openCreate = () => {
    const defaultSourceBranch = activeTab === 'TECHNICAL'
      ? mainBranch?.id || ''
      : (!isAdmin && currentUser.branchId ? currentUser.branchId : activeBranches[0]?.id || '');
    const sourceLocations = locationsForBranch(defaultSourceBranch);
    const defaultSourceLocation = activeTab === 'TECHNICAL'
      ? String(mainWarehouse?.id || sourceLocations[0]?.id || '')
      : String(activeBranches.find(branch => branch.id === defaultSourceBranch)?.warehouseId || sourceLocations[0]?.id || '');
    const defaultDestinationBranch = activeBranches.find(branch => branch.id !== defaultSourceBranch)?.id || '';
    const destinationLocations = locationsForBranch(defaultDestinationBranch);
    setSourceBranchId(defaultSourceBranch);
    setSourceLocationId(defaultSourceLocation);
    setDestinationBranchId(activeTab === 'TECHNICAL' ? defaultSourceBranch : defaultDestinationBranch);
    setDestinationLocationId(activeTab === 'TECHNICAL' ? String(technicalLocations[0]?.id || '') : String(activeBranches.find(branch => branch.id === defaultDestinationBranch)?.warehouseId || destinationLocations[0]?.id || ''));
    setSelectedDeviceIds([]);
    setTaskDrafts({});
    setDeviceSearch('');
    setBarcode('');
    setNotes('');
    setTransporter('');
    setExpectedDeliveryAt('');
    setStep(1);
    setNotice(null);
    setCreateOpen(true);
  };

  const technicalTransfers = useMemo(() => transfers.filter(transfer => getTransferType(transfer, warehouses) === 'TECHNICAL'), [transfers, warehouses]);
  const interBranchTransfers = useMemo(() => transfers.filter(transfer => getTransferType(transfer, warehouses) === 'INTER_BRANCH'), [transfers, warehouses]);
  const tabTransfers = activeTab === 'TECHNICAL' ? technicalTransfers : interBranchTransfers;

  const filteredTransfers = useMemo(() => tabTransfers.filter(transfer => {
    const normalized = search.trim().toLowerCase();
    const matchesSearch = !normalized || [
      transfer.code,
      transfer.creator,
      transfer.fromWarehouseName,
      transfer.toWarehouseName,
      transfer.sourceBranchName,
      transfer.destinationBranchName,
      transfer.notes,
      ...(transfer.items || []).flatMap(item => [item.imei, item.name])
    ].some(value => String(value || '').toLowerCase().includes(normalized));
    const matchesStatus = statusFilter === 'ALL' || transfer.status === statusFilter;
    const matchesScope = scopeFilter === 'ALL' || [transfer.sourceLocationId, transfer.destinationLocationId, transfer.sourceBranchId, transfer.destinationBranchId, (transfer as any).technicianUid].includes(scopeFilter);
    const created = String(transfer.createdDate || (transfer as any).createdAt || '').slice(0, 10);
    return matchesSearch && matchesStatus && matchesScope && (!dateFilter || created === dateFilter);
  }), [tabTransfers, search, statusFilter, scopeFilter, dateFilter]);

  const stats = useMemo(() => {
    const now = Date.now();
    if (activeTab === 'TECHNICAL') {
      return [
        { label: 'Chờ KTV nhận', value: tabTransfers.filter(item => item.status === 'WAITING_KTV_ACCEPT').length, icon: Clock3, tone: 'amber' },
        { label: 'Đang xử lý', value: tabTransfers.filter(item => item.status === 'IN_PROGRESS').length, icon: Wrench, tone: 'blue' },
        { label: 'Chờ QC / trả kho', value: tabTransfers.filter(item => ['WAITING_QC', 'COMPLETED', 'QC_FAILED'].includes(item.status)).length, icon: ClipboardCheck, tone: 'violet' },
        { label: 'Quá hạn', value: tabTransfers.filter(item => { const deadline = toDate(item.nearestDeadlineAt); return deadline && deadline.getTime() < now && !['RETURNED_TO_MAIN_WAREHOUSE', 'CANCELLED'].includes(item.status); }).length, icon: AlertTriangle, tone: 'red' }
      ];
    }
    return [
      { label: 'Chờ giao', value: tabTransfers.filter(item => ['DRAFT', 'APPROVED', 'PENDING'].includes(item.status)).length, icon: Boxes, tone: 'amber' },
      { label: 'Đang vận chuyển', value: tabTransfers.filter(item => item.status === 'IN_TRANSIT').length, icon: Truck, tone: 'blue' },
      { label: 'Chờ xử lý nhận', value: tabTransfers.filter(item => ['PARTIALLY_RECEIVED', 'RECEIVED', 'DISPUTED'].includes(item.status)).length, icon: PackageCheck, tone: 'violet' },
      { label: 'Quá hạn', value: tabTransfers.filter(item => { const deadline = toDate(item.expectedDeliveryAt); return deadline && deadline.getTime() < now && ['IN_TRANSIT', 'PARTIALLY_RECEIVED', 'DISPUTED'].includes(item.status); }).length, icon: AlertTriangle, tone: 'red' }
    ];
  }, [activeTab, tabTransfers]);

  const selectableDevices = useMemo(() => devices.filter(device => {
    const matchBranch = !sourceBranchId || !device.branchId || device.branchId === sourceBranchId;
    const matchLocation = getDeviceLocation(device) === sourceLocationId;
    const matchStatus = activeTab === 'TECHNICAL' ? ['in_stock', 'awaiting_technical'].includes(device.status) : device.status === 'in_stock';
    const unlocked = !device.activeTransferId && !device.activeWorkOrderId && !device.reservedForLeadId && !device.reservedUntil && !device.technicianAssigned;
    const term = deviceSearch.trim().toLowerCase();
    const matchSearch = !term || [device.imei, device.model, device.color, device.storage].some(value => String(value).toLowerCase().includes(term));
    return matchBranch && matchLocation && matchStatus && unlocked && matchSearch;
  }), [devices, sourceBranchId, sourceLocationId, activeTab, deviceSearch]);

  const selectedDevices = useMemo(() => selectedDeviceIds.map(id => devices.find(device => device.id === id)).filter(Boolean) as DeviceItem[], [selectedDeviceIds, devices]);
  const actionableReceiptResults = useMemo(() => (
    Object.entries(receiptDraft) as Array<[string, ReceiptDraft[string]]>
  ).filter(([, value]) => value.result === 'MISSING' || Boolean(value.scannedImei.trim()))
    .map(([imei, value]) => ({ imei, ...value, scannedImei: value.scannedImei.trim() })), [receiptDraft]);

  const addOrRemoveDevice = (device: DeviceItem) => {
    setSelectedDeviceIds(current => {
      if (current.includes(device.id)) {
        setTaskDrafts(tasks => { const next = { ...tasks }; delete next[device.id]; return next; });
        return current.filter(id => id !== device.id);
      }
      if (activeTab === 'TECHNICAL' && taskTypes[0]) {
        setTaskDrafts(tasks => ({ ...tasks, [device.id]: [{ taskType: taskTypes[0].taskType, priority: 'NORMAL' }] }));
      }
      return [...current, device.id];
    });
  };

  const scanDevice = () => {
    const value = barcode.trim();
    if (!value) return;
    const device = selectableDevices.find(item => item.imei === value);
    if (!device) {
      setNotice({ type: 'error', message: `IMEI ${value} không đủ điều kiện hoặc không nằm tại kho đã chọn.` });
    } else if (!selectedDeviceIds.includes(device.id)) {
      addOrRemoveDevice(device);
    }
    setBarcode('');
  };

  const updateTask = (deviceId: string, index: number, patchValue: Partial<TaskDraft>) => {
    setTaskDrafts(current => ({ ...current, [deviceId]: (current[deviceId] || []).map((task, taskIndex) => taskIndex === index ? { ...task, ...patchValue } : task) }));
  };

  const previewTotals = useMemo(() => {
    let commission = 0;
    let tasks = 0;
    let nearest = '';
    (Object.values(taskDrafts) as TaskDraft[][]).flat().forEach(task => {
      const config = taskTypes.find(item => item.taskType === task.taskType);
      if (!config) return;
      const multiplier = config.priorityMultiplier?.[task.priority] || 1;
      const sla = task.priority === 'URGENT' ? config.urgentSlaHours : task.priority === 'PRIORITY' ? (config.prioritySlaHours || config.normalSlaHours) : config.normalSlaHours;
      const deadline = new Date(Date.now() + sla * 60 * 60 * 1000).toISOString();
      commission += Math.round(config.baseCommission * multiplier);
      tasks += 1;
      if (!nearest || deadline < nearest) nearest = deadline;
    });
    return { commission, tasks, nearest, cost: selectedDevices.reduce((sum, device) => sum + Number(device.currentCost ?? device.buyPrice ?? 0), 0) };
  }, [taskDrafts, taskTypes, selectedDevices]);

  const maxStep = activeTab === 'TECHNICAL' ? 4 : 3;
  const canContinue = () => {
    if (step === 1) return Boolean(sourceBranchId && sourceLocationId && destinationLocationId && (activeTab === 'TECHNICAL' || destinationBranchId) && (activeTab === 'TECHNICAL' || sourceBranchId !== destinationBranchId));
    if (step === 2) return selectedDeviceIds.length > 0;
    if (activeTab === 'TECHNICAL' && step === 3) return selectedDeviceIds.every(id => (taskDrafts[id] || []).length > 0);
    return true;
  };

  const submitCreate = async () => {
    setBusy(true);
    try {
      if (activeTab === 'TECHNICAL') {
        const result = await requestCreateTechnicalTransfer({
          sourceBranchId,
          sourceLocationId,
          destinationLocationId,
          items: selectedDeviceIds.map(deviceId => ({ deviceId, tasks: taskDrafts[deviceId] || [] })),
          notes,
          idempotencyKey: createIdempotencyKey('create-technical')
        }, currentUser);
        onTransferSynced(result.transfer);
        setDetailTransfer(result.transfer);
        setNotice({ type: 'success', message: `Đã tạo phiếu ${result.code}; IMEI được khóa và chờ KTV quét nhận.` });
      } else {
        const result = await requestCreateInterBranchTransfer({
          sourceBranchId,
          destinationBranchId,
          sourceLocationId,
          destinationLocationId,
          deviceIds: selectedDeviceIds,
          expectedDeliveryAt: expectedDeliveryAt || undefined,
          transporter,
          notes,
          idempotencyKey: createIdempotencyKey('create-inter-branch')
        }, currentUser);
        onTransferSynced(result.transfer);
        setDetailTransfer(result.transfer);
        setNotice({ type: 'success', message: `Đã xuất chuyển ${result.code}; phiếu nhập chờ nhận và công nợ tạm tính đã tạo đồng thời.` });
      }
      await onInventoryRefresh?.();
      setCreateOpen(false);
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Không thể tạo phiếu điều chuyển.' });
    } finally {
      setBusy(false);
    }
  };

  const prepareReceipt = (transfer: StockTransferSlip) => {
    const draft: ReceiptDraft = {};
    transfer.items.filter(item => !['RECEIVED', 'DAMAGED'].includes(item.receiptStatus || '')).forEach(item => {
      if (!item.imei) return;
      draft[item.imei] = { result: 'RECEIVED', scannedImei: '', notes: '' };
    });
    setReceiptDraft(draft);
  };

  const addTechnicalScan = () => {
    if (!detailTransfer) return;
    const imei = technicalScan.trim();
    const isPending = detailTransfer.items.some(item => item.imei === imei && item.itemStatus === 'WAITING_KTV_ACCEPT');
    if (!isPending) {
      setNotice({ type: 'error', message: `IMEI ${imei || '(trống)'} không thuộc danh sách đang chờ KTV nhận.` });
    } else if (!scannedTechnicalImeis.includes(imei)) {
      setScannedTechnicalImeis(current => [...current, imei]);
    }
    setTechnicalScan('');
  };

  const runDetailAction = async (action: 'ACCEPT_TECH' | 'CANCEL_TECH' | 'RECEIVE' | 'COMPLETE') => {
    if (!detailTransfer) return;
    setBusy(true);
    try {
      let next: StockTransferSlip;
      if (action === 'ACCEPT_TECH') {
        const result = await requestAcceptTechnicalTransfer(detailTransfer.id, scannedTechnicalImeis, currentUser);
        next = result.transfer;
        setScannedTechnicalImeis([]);
        setNotice({ type: 'success', message: `Đã xác nhận KTV nhận ${result.acceptedCount} máy; vị trí vật lý đã chuyển sang kho KTV.` });
      } else if (action === 'CANCEL_TECH') {
        const result = await requestCancelTechnicalTransfer(detailTransfer.id, 'Hủy trước khi KTV nhận máy', currentUser);
        next = result.transfer;
        setNotice({ type: 'success', message: 'Đã hủy phiếu và giải phóng toàn bộ IMEI.' });
      } else if (action === 'RECEIVE') {
        const result = await requestReceiveInterBranchTransfer(detailTransfer.id, actionableReceiptResults, currentUser);
        next = result.transfer;
        prepareReceipt(next);
        setNotice({ type: 'success', message: `Đã đối soát nhận hàng. Công nợ chính thức: ${currency.format(result.postedAmount)}.` });
      } else {
        const result = await requestCompleteInterBranchTransfer(detailTransfer.id, currentUser);
        next = result.transfer;
        setNotice({ type: 'success', message: 'Phiếu đã hoàn tất và công nợ hai chiều đã cân bằng.' });
      }
      onTransferSynced(next);
      setDetailTransfer(next);
      await onInventoryRefresh?.();
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Không thể cập nhật phiếu.' });
    } finally {
      setBusy(false);
    }
  };

  const statusOptions: string[] = Array.from(new Set(tabTransfers.map(item => String(item.status))));
  const scopeOptions = activeTab === 'TECHNICAL' ? technicalLocations.map(item => ({ id: String(item.id), name: item.shortName || item.name })) : activeBranches.map(item => ({ id: item.id, name: item.name }));

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 pb-16">
      {notice && (
        <div className={`fixed right-4 top-20 z-[120] flex max-w-md items-start gap-3 rounded-2xl border bg-white p-4 shadow-xl ${notice.type === 'error' ? 'border-red-200' : 'border-emerald-200'}`}>
          {notice.type === 'error' ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />}
          <p className="text-sm font-semibold text-zinc-800">{notice.message}</p>
          <button onClick={() => setNotice(null)} className="ml-2 text-zinc-400"><X className="h-4 w-4" /></button>
        </div>
      )}

      <header className="overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm">
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-zinc-950 text-white shadow-lg shadow-zinc-900/10"><ArrowLeftRight className="h-6 w-6" /></div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-600">Inventory custody</p>
              <h1 className="text-xl font-black tracking-tight text-zinc-950 sm:text-2xl">Điều chuyển hàng hóa</h1>
              <p className="mt-1 text-xs text-zinc-500">Tách biệt vị trí giữ máy, chi nhánh sở hữu và công nợ nội bộ theo từng IMEI.</p>
            </div>
          </div>
          {canCreateTransfer && <button onClick={openCreate} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-orange-600 px-5 text-sm font-black text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-700">
            <Plus className="h-4 w-4" /> Tạo phiếu
          </button>}
        </div>
        <div className="flex gap-1 border-t border-zinc-100 bg-zinc-50/70 px-3 pt-2 sm:px-6">
          {([
            { id: 'TECHNICAL', label: 'Hàng xử lý kỹ thuật', caption: 'Kho Tổng → Kho KTV', icon: Wrench },
            { id: 'INTER_BRANCH', label: 'Chuyển hàng nội bộ', caption: 'Giữa 3 chi nhánh', icon: Building2 }
          ] as const).map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setStatusFilter('ALL'); setScopeFilter('ALL'); }} className={`relative flex min-w-0 flex-1 items-center justify-center gap-3 rounded-t-2xl px-3 py-3 text-left transition sm:flex-none sm:min-w-64 sm:justify-start ${active ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:bg-white/60'}`}>
                <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-orange-600' : ''}`} />
                <span className="min-w-0"><span className="block truncate text-sm font-black">{tab.label}</span><span className="hidden text-[11px] text-zinc-400 sm:block">{tab.caption}</span></span>
                {active && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-orange-600" />}
              </button>
            );
          })}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(stat => {
          const Icon = stat.icon;
          const tones: Record<string, string> = { amber: 'bg-amber-50 text-amber-700 border-amber-100', blue: 'bg-blue-50 text-blue-700 border-blue-100', violet: 'bg-violet-50 text-violet-700 border-violet-100', red: 'bg-red-50 text-red-700 border-red-100' };
          return <div key={stat.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div className={`rounded-xl border p-2 ${tones[stat.tone]}`}><Icon className="h-4 w-4" /></div><span className="text-2xl font-black text-zinc-950">{stat.value}</span></div><p className="mt-3 text-xs font-bold text-zinc-600">{stat.label}</p></div>;
        })}
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_210px_170px]">
          <label className="relative"><Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm mã phiếu, IMEI, kho, người tạo..." className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-10 pr-3 text-sm outline-none transition focus:border-orange-300 focus:bg-white" /></label>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold outline-none"><option value="ALL">Tất cả trạng thái</option>{statusOptions.map(status => <option key={status} value={status}>{STATUS_META[status]?.label || status}</option>)}</select>
          <select value={scopeFilter} onChange={event => setScopeFilter(event.target.value)} className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold outline-none"><option value="ALL">{activeTab === 'TECHNICAL' ? 'Tất cả kho KTV' : 'Tất cả chi nhánh'}</option>{scopeOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <label className="relative"><CalendarDays className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input type="date" value={dateFilter} onChange={event => setDateFilter(event.target.value)} className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-9 pr-2 text-sm outline-none" /></label>
        </div>
      </section>

      {filteredTransfers.length === 0 ? <EmptyList tab={activeTab} /> : (
        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[150px_minmax(260px,1fr)_110px_140px_150px_32px] gap-4 border-b border-zinc-100 bg-zinc-50 px-5 py-3 text-[11px] font-black uppercase tracking-wider text-zinc-500 lg:grid">
            <span>Mã phiếu</span><span>Luồng điều chuyển</span><span>Số máy</span><span>{activeTab === 'TECHNICAL' ? 'Task / hoa hồng' : 'Giá vốn'}</span><span>Trạng thái</span><span />
          </div>
          <div className="divide-y divide-zinc-100">
            {filteredTransfers.map(transfer => (
              <button key={transfer.id} onClick={() => { setDetailTransfer(transfer); setScannedTechnicalImeis([]); setTechnicalScan(''); if (getTransferType(transfer, warehouses) === 'INTER_BRANCH') prepareReceipt(transfer); }} className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-orange-50/30 sm:px-5 lg:grid-cols-[150px_minmax(260px,1fr)_110px_140px_150px_32px] lg:items-center lg:gap-4">
                <div><p className="font-black text-zinc-950">{transfer.code}</p><p className="mt-1 text-[11px] text-zinc-400">{toDate(transfer.createdDate) ? dateTime.format(toDate(transfer.createdDate)!) : transfer.createdDate}</p></div>
                <div className="min-w-0"><div className="flex items-center gap-2 text-sm font-bold text-zinc-800"><span className="truncate">{transfer.fromWarehouseName || transfer.sourceBranchName}</span><ArrowRight className="h-4 w-4 shrink-0 text-orange-500" /><span className="truncate">{transfer.toWarehouseName || transfer.destinationBranchName}</span></div><p className="mt-1 truncate text-xs text-zinc-500">{activeTab === 'TECHNICAL' ? `${(transfer as any).technicianName || 'KTV'} · ${transfer.nearestDeadlineAt ? `Hạn ${dateTime.format(new Date(transfer.nearestDeadlineAt))}` : 'Theo SLA cấu hình'}` : `${transfer.transporter || 'Điều vận nội bộ'} · ${transfer.destinationBranchName || ''}`}</p></div>
                <div className="flex items-center gap-2 text-sm font-black text-zinc-800"><Smartphone className="h-4 w-4 text-zinc-400" />{transfer.totalQuantity}</div>
                <div>{activeTab === 'TECHNICAL' ? <><p className="text-sm font-black text-zinc-900">{transfer.totalTasks || 0} task</p><p className="text-[11px] text-zinc-500">{currency.format(transfer.totalEstimatedCommission || 0)}</p></> : <><p className="text-sm font-black text-zinc-900">{currency.format(transfer.totalValue || 0)}</p><p className="text-[11px] text-zinc-500">Đã ghi {currency.format(transfer.postedLedgerAmount || 0)}</p></>}</div>
                <div><StatusBadge status={transfer.status} /></div>
                <ChevronRight className="hidden h-5 w-5 text-zinc-300 lg:block" />
              </button>
            ))}
          </div>
        </section>
      )}

      {createOpen && (
        <Drawer title={activeTab === 'TECHNICAL' ? 'Tạo phiếu hàng xử lý kỹ thuật' : 'Tạo phiếu chuyển hàng nội bộ'} subtitle={activeTab === 'TECHNICAL' ? 'Chỉ đổi location/người giữ; không đổi branchId hoặc giá vốn.' : 'Xuất, nhập chờ nhận và đối soát công nợ được tạo trong một transaction.'} onClose={() => !busy && setCreateOpen(false)} wide>
          <div className="border-b border-zinc-200 bg-white px-5 py-4 sm:px-7">
            <div className="flex items-center gap-2">{Array.from({ length: maxStep }, (_, index) => index + 1).map(number => <React.Fragment key={number}><div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${number <= step ? 'bg-orange-600 text-white' : 'bg-zinc-100 text-zinc-400'}`}>{number < step ? <Check className="h-4 w-4" /> : number}</div>{number < maxStep && <div className={`h-0.5 flex-1 ${number < step ? 'bg-orange-500' : 'bg-zinc-200'}`} />}</React.Fragment>)}</div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            {step === 1 && (
              <div className="space-y-5">
                <div><h3 className="font-black text-zinc-950">{activeTab === 'TECHNICAL' ? 'Chọn Kho Tổng và kho KTV nhận' : 'Chọn chi nhánh và kho xuất/nhập'}</h3><p className="mt-1 text-sm text-zinc-500">`branchId` xác định đơn vị sở hữu; `locationId` xác định nơi vật lý giữ máy.</p></div>
                {activeTab === 'INTER_BRANCH' && <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2"><span className="text-xs font-black text-zinc-700">Chi nhánh chuyển</span><select disabled={!isAdmin} value={sourceBranchId} onChange={event => { const id = event.target.value; setSourceBranchId(id); setSourceLocationId(String(activeBranches.find(branch => branch.id === id)?.warehouseId || locationsForBranch(id)[0]?.id || '')); if (destinationBranchId === id) { const other = activeBranches.find(branch => branch.id !== id); setDestinationBranchId(other?.id || ''); setDestinationLocationId(String(other?.warehouseId || '')); } }} className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold disabled:bg-zinc-100">{activeBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label className="space-y-2"><span className="text-xs font-black text-zinc-700">Chi nhánh nhận</span><select value={destinationBranchId} onChange={event => { const id = event.target.value; setDestinationBranchId(id); setDestinationLocationId(String(activeBranches.find(branch => branch.id === id)?.warehouseId || locationsForBranch(id)[0]?.id || '')); }} className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold"><option value="">Chọn chi nhánh</option>{activeBranches.filter(branch => branch.id !== sourceBranchId).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div>}
                <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2"><span className="text-xs font-black text-zinc-700">Kho giao / xuất cụ thể</span><select value={sourceLocationId} disabled={activeTab === 'TECHNICAL'} onChange={event => setSourceLocationId(event.target.value)} className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold disabled:bg-zinc-100">{(activeTab === 'TECHNICAL' ? warehouses.filter(location => location.id === mainWarehouse?.id) : locationsForBranch(sourceBranchId).filter(location => location.type !== 'TECHNICIAN_SUB')).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label className="space-y-2"><span className="text-xs font-black text-zinc-700">{activeTab === 'TECHNICAL' ? 'Kho KTV nhận' : 'Kho nhập mặc định'}</span><select value={destinationLocationId} onChange={event => setDestinationLocationId(event.target.value)} className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold"><option value="">Chọn kho nhận</option>{(activeTab === 'TECHNICAL' ? technicalLocations : locationsForBranch(destinationBranchId).filter(location => location.type !== 'TECHNICIAN_SUB')).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label></div>
                {activeTab === 'TECHNICAL' && <div className="grid gap-3 sm:grid-cols-3">{technicalLocations.map(location => { const held = devices.filter(device => getDeviceLocation(device) === location.id).length; const selected = destinationLocationId === location.id; return <button key={location.id} onClick={() => setDestinationLocationId(String(location.id))} className={`rounded-2xl border p-4 text-left transition ${selected ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-100' : 'border-zinc-200 bg-white hover:border-orange-200'}`}><div className="flex items-center justify-between"><UserRound className={`h-5 w-5 ${selected ? 'text-orange-600' : 'text-zinc-400'}`} />{selected && <CheckCircle2 className="h-4 w-4 text-orange-600" />}</div><p className="mt-3 text-sm font-black text-zinc-900">{location.technicianName || location.shortName}</p><p className="mt-1 text-xs text-zinc-500">Đang giữ {held} máy · {location.isActive === false ? 'Ngừng hoạt động' : 'Đang hoạt động'}</p></button>; })}</div>}
                <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p>{activeTab === 'TECHNICAL' ? 'Máy vẫn thuộc Chi nhánh Tổng. Vị trí chỉ đổi sang kho KTV sau khi KTV quét và xác nhận nhận máy.' : 'Chi nhánh chuyển và nhận không thể trùng nhau. Quyền đổi chi nhánh chuyển được kiểm tra lại ở server.'}</p></div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4"><div><h3 className="font-black text-zinc-950">Chọn máy theo IMEI</h3><p className="mt-1 text-sm text-zinc-500">Chỉ hiển thị máy thực tế tại kho, chưa bán/giữ chỗ và chưa nằm trong phiếu khác.</p></div><div className="grid gap-3 sm:grid-cols-[1fr_1fr]"><label className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-zinc-400" /><input value={deviceSearch} onChange={event => setDeviceSearch(event.target.value)} placeholder="IMEI, tên máy, màu, dung lượng" className="h-11 w-full rounded-xl border border-zinc-200 pl-10 pr-3 text-sm outline-none focus:border-orange-300" /></label><div className="flex gap-2"><label className="relative flex-1"><Barcode className="absolute left-3 top-3.5 h-4 w-4 text-zinc-400" /><input value={barcode} onChange={event => setBarcode(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); scanDevice(); } }} placeholder="Quét barcode / IMEI" className="h-11 w-full rounded-xl border border-zinc-200 pl-10 pr-3 text-sm outline-none focus:border-orange-300" /></label><button onClick={scanDevice} className="rounded-xl bg-zinc-900 px-4 text-sm font-black text-white">Thêm</button></div></div><div className="flex items-center justify-between rounded-xl bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-600"><span>{selectableDevices.length} máy đủ điều kiện</span><span className="text-orange-700">Đã chọn {selectedDeviceIds.length}</span></div><div className="max-h-[430px] overflow-auto rounded-2xl border border-zinc-200"><div className="divide-y divide-zinc-100">{selectableDevices.map(device => { const selected = selectedDeviceIds.includes(device.id); return <button key={device.id} onClick={() => addOrRemoveDevice(device)} className={`grid w-full grid-cols-[28px_1fr_auto] items-center gap-3 p-4 text-left transition ${selected ? 'bg-orange-50' : 'bg-white hover:bg-zinc-50'}`}><span className={`grid h-5 w-5 place-items-center rounded-md border ${selected ? 'border-orange-600 bg-orange-600 text-white' : 'border-zinc-300'}`}>{selected && <Check className="h-3.5 w-3.5" />}</span><span><span className="block text-sm font-black text-zinc-900">{device.model} {device.storage} · {device.color}</span><span className="mt-1 block font-mono text-xs text-zinc-500">{device.imei} · {device.condition}</span></span><span className="text-right"><span className="block text-sm font-black text-zinc-800">{currency.format(device.currentCost ?? device.buyPrice)}</span><span className="text-[10px] font-bold uppercase text-zinc-400">Server xác nhận lại</span></span></button>; })}{selectableDevices.length === 0 && <div className="p-10 text-center text-sm text-zinc-500">Không có IMEI đủ điều kiện tại kho này.</div>}</div></div></div>
            )}

            {activeTab === 'TECHNICAL' && step === 3 && (
              <div className="space-y-5"><div><h3 className="font-black text-zinc-950">Chọn task, ưu tiên và SLA</h3><p className="mt-1 text-sm text-zinc-500">Hoa hồng và deadline lấy từ cấu hình phiên bản trên server; trình duyệt chỉ hiển thị dự kiến.</p></div>{metadataError && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{metadataError}</div>}{selectedDevices.map(device => <div key={device.id} className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-black text-zinc-900">{device.model} {device.storage}</p><p className="font-mono text-xs text-zinc-500">{device.imei}</p></div><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">{(taskDrafts[device.id] || []).length} task</span></div><div className="mt-4 space-y-2">{(taskDrafts[device.id] || []).map((task, index) => { const config = taskTypes.find(item => item.taskType === task.taskType); const multiplier = config?.priorityMultiplier?.[task.priority] || 1; const commission = Math.round((config?.baseCommission || 0) * multiplier); const sla = task.priority === 'URGENT' ? config?.urgentSlaHours : task.priority === 'PRIORITY' ? config?.prioritySlaHours : config?.normalSlaHours; return <div key={`${device.id}-${index}`} className="grid gap-2 rounded-xl bg-zinc-50 p-3 sm:grid-cols-[1fr_150px_135px_36px] sm:items-center"><select value={task.taskType} onChange={event => updateTask(device.id, index, { taskType: event.target.value })} className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold">{taskTypes.filter(candidate => !(taskDrafts[device.id] || []).some((existing, existingIndex) => existingIndex !== index && existing.taskType === candidate.taskType)).map(candidate => <option key={candidate.taskType} value={candidate.taskType}>{candidate.name}</option>)}</select><select value={task.priority} onChange={event => updateTask(device.id, index, { priority: event.target.value as TechnicalPriority })} className="h-10 rounded-lg border border-zinc-200 bg-white px-2 text-sm font-bold">{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className="text-right"><p className="text-xs font-black text-zinc-900">{currency.format(commission)}</p><p className="text-[10px] text-zinc-500">SLA {sla || 0} giờ</p></div><button onClick={() => setTaskDrafts(current => ({ ...current, [device.id]: current[device.id].filter((_, taskIndex) => taskIndex !== index) }))} className="grid h-9 w-9 place-items-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>; })}</div><button disabled={!taskTypes.length || (taskDrafts[device.id] || []).length >= taskTypes.length} onClick={() => { const used = new Set((taskDrafts[device.id] || []).map(task => task.taskType)); const next = taskTypes.find(item => !used.has(item.taskType)); if (next) setTaskDrafts(current => ({ ...current, [device.id]: [...(current[device.id] || []), { taskType: next.taskType, priority: 'NORMAL' }] })); }} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-black text-zinc-700 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Thêm task</button></div>)}</div>
            )}

            {step === maxStep && (
              <div className="space-y-5"><div><h3 className="font-black text-zinc-950">Kiểm tra và xác nhận</h3><p className="mt-1 text-sm text-zinc-500">Server sẽ kiểm tra lại IMEI, vị trí, khóa cạnh tranh và giá vốn trước khi ghi.</p></div><div className="rounded-2xl border border-zinc-200 bg-white p-5"><div className="flex items-center gap-3 text-sm font-black text-zinc-900"><span className="truncate">{warehouses.find(item => item.id === sourceLocationId)?.shortName || sourceLocationId}</span><ArrowRight className="h-4 w-4 text-orange-500" /><span className="truncate">{warehouses.find(item => item.id === destinationLocationId)?.shortName || destinationLocationId}</span></div><div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4"><div><p className="text-[10px] font-black uppercase text-zinc-400">Số IMEI</p><p className="mt-1 text-lg font-black">{selectedDevices.length}</p></div>{activeTab === 'TECHNICAL' ? <><div><p className="text-[10px] font-black uppercase text-zinc-400">Tổng task</p><p className="mt-1 text-lg font-black">{previewTotals.tasks}</p></div><div><p className="text-[10px] font-black uppercase text-zinc-400">Hoa hồng dự kiến</p><p className="mt-1 text-lg font-black">{currency.format(previewTotals.commission)}</p></div><div><p className="text-[10px] font-black uppercase text-zinc-400">Deadline gần nhất</p><p className="mt-1 text-sm font-black">{previewTotals.nearest ? dateTime.format(new Date(previewTotals.nearest)) : '—'}</p></div></> : <><div><p className="text-[10px] font-black uppercase text-zinc-400">Tổng giá vốn</p><p className="mt-1 text-lg font-black">{currency.format(previewTotals.cost)}</p></div><div><p className="text-[10px] font-black uppercase text-zinc-400">Người tạo</p><p className="mt-1 text-sm font-black">{currentUser.displayName}</p></div><div><p className="text-[10px] font-black uppercase text-zinc-400">Công nợ</p><p className="mt-1 text-sm font-black">Tạm tính → chính thức khi nhận</p></div></>}</div></div>{activeTab === 'INTER_BRANCH' && <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2"><span className="text-xs font-black text-zinc-700">Người giao / đơn vị vận chuyển</span><input value={transporter} onChange={event => setTransporter(event.target.value)} placeholder="Điều vận nội bộ" className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm" /></label><label className="space-y-2"><span className="text-xs font-black text-zinc-700">Dự kiến giao</span><input type="datetime-local" value={expectedDeliveryAt} onChange={event => setExpectedDeliveryAt(event.target.value)} className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm" /></label></div>}<label className="block space-y-2"><span className="text-xs font-black text-zinc-700">Ghi chú bàn giao</span><textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} placeholder="Tình trạng máy, yêu cầu xử lý hoặc lưu ý vận chuyển..." className="w-full rounded-xl border border-zinc-200 p-3 text-sm outline-none focus:border-orange-300" /></label><div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p>{activeTab === 'TECHNICAL' ? 'Xác nhận sẽ reserve IMEI, tạo work order/task và hoa hồng PENDING. Chưa thay đổi vị trí máy cho đến khi KTV nhận.' : 'Phiếu xuất, phiếu nhập chờ nhận, kho IN_TRANSIT và một giao dịch đối soát liên chi nhánh sẽ cùng thành công hoặc cùng rollback.'}</p></div></div>
            )}
          </div>
          <footer className="flex items-center justify-between border-t border-zinc-200 bg-white px-5 py-4 sm:px-7"><button disabled={busy} onClick={() => step === 1 ? setCreateOpen(false) : setStep(value => value - 1)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-200 px-4 text-sm font-black text-zinc-700 disabled:opacity-50"><ArrowLeft className="h-4 w-4" />{step === 1 ? 'Hủy' : 'Quay lại'}</button>{step < maxStep ? <button disabled={!canContinue()} onClick={() => setStep(value => value + 1)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">Tiếp tục <ArrowRight className="h-4 w-4" /></button> : <button disabled={busy || !canContinue()} onClick={submitCreate} className="inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-black text-white shadow-lg shadow-orange-600/20 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{activeTab === 'TECHNICAL' ? 'Xác nhận điều chuyển' : 'Xác nhận xuất chuyển'}</button>}</footer>
        </Drawer>
      )}

      {detailTransfer && (
        <Drawer title={`${detailTransfer.code} · ${getTransferType(detailTransfer, warehouses) === 'TECHNICAL' ? 'Hàng kỹ thuật' : 'Chuyển nội bộ'}`} subtitle={`${detailTransfer.fromWarehouseName} → ${detailTransfer.toWarehouseName}`} onClose={() => !busy && setDetailTransfer(null)} wide>
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7"><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-5"><div><StatusBadge status={detailTransfer.status} /><p className="mt-3 text-sm font-black text-zinc-950">{detailTransfer.fromWarehouseName} <ArrowRight className="mx-1 inline h-4 w-4 text-orange-500" /> {detailTransfer.toWarehouseName}</p><p className="mt-1 text-xs text-zinc-500">Tạo bởi {detailTransfer.creator} · {toDate(detailTransfer.createdDate) ? dateTime.format(toDate(detailTransfer.createdDate)!) : detailTransfer.createdDate}</p></div><div className="text-right"><p className="text-2xl font-black text-zinc-950">{detailTransfer.totalQuantity}</p><p className="text-xs font-bold text-zinc-500">IMEI trong phiếu</p></div></div>
            {getTransferType(detailTransfer, warehouses) === 'INTER_BRANCH' && <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-zinc-200 bg-white p-4"><CircleDollarSign className="h-5 w-5 text-orange-600" /><p className="mt-3 text-xs font-bold text-zinc-500">Giá trị tạm tính</p><p className="mt-1 font-black text-zinc-950">{currency.format(detailTransfer.totalValue)}</p></div><div className="rounded-2xl border border-zinc-200 bg-white p-4"><Building2 className="h-5 w-5 text-blue-600" /><p className="mt-3 text-xs font-bold text-zinc-500">Phải thu / phải trả</p><p className="mt-1 font-black text-zinc-950">{currency.format(detailTransfer.postedLedgerAmount || 0)}</p></div><div className="rounded-2xl border border-zinc-200 bg-white p-4"><ShieldCheck className="h-5 w-5 text-emerald-600" /><p className="mt-3 text-xs font-bold text-zinc-500">Tham chiếu chung</p><p className="mt-1 truncate font-mono text-xs font-black text-zinc-950">{detailTransfer.interBranchLedgerEntryId || '—'}</p></div></div>}
            {getTransferType(detailTransfer, warehouses) === 'TECHNICAL' && detailTransfer.status === 'WAITING_KTV_ACCEPT' && <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-4"><p className="text-sm font-black text-orange-900">KTV quét IMEI thực nhận</p><p className="mt-1 text-xs text-orange-700">Chỉ các IMEI đã quét mới đổi `currentLocationId` sang kho KTV.</p><div className="mt-3 flex gap-2"><label className="relative flex-1"><Barcode className="absolute left-3 top-3 h-4 w-4 text-orange-500" /><input value={technicalScan} onChange={event => setTechnicalScan(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTechnicalScan(); } }} placeholder="Quét IMEI trên máy" className="h-10 w-full rounded-xl border border-orange-200 bg-white pl-10 pr-3 font-mono text-sm outline-none focus:border-orange-400" /></label><button onClick={addTechnicalScan} className="rounded-xl bg-orange-600 px-4 text-sm font-black text-white">Ghi nhận</button></div>{scannedTechnicalImeis.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{scannedTechnicalImeis.map(imei => <button key={imei} onClick={() => setScannedTechnicalImeis(current => current.filter(item => item !== imei))} className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-white px-2.5 py-1 font-mono text-[11px] font-bold text-orange-800">{imei}<X className="h-3 w-3" /></button>)}</div>}</div>}
            <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white"><div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3 text-xs font-black uppercase tracking-wider text-zinc-500">Đối soát từng IMEI</div><div className="divide-y divide-zinc-100">{detailTransfer.items.map(item => { const receipt = item.imei ? receiptDraft[item.imei] : undefined; const canReceive = getTransferType(detailTransfer, warehouses) === 'INTER_BRANCH' && ['IN_TRANSIT', 'PARTIALLY_RECEIVED', 'DISPUTED'].includes(detailTransfer.status) && !['RECEIVED', 'DAMAGED'].includes(item.receiptStatus || ''); const techScanned = Boolean(item.imei && scannedTechnicalImeis.includes(item.imei)); return <div key={item.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-black text-zinc-900">{item.name}</p><p className="mt-1 font-mono text-xs text-zinc-500">{item.imei}</p>{techScanned && <p className="mt-1 text-[11px] font-black text-emerald-600">✓ Đã quét thực tế</p>}</div><div className="text-right"><p className="text-sm font-black text-zinc-900">{currency.format(item.costAtTransfer ?? item.costPrice)}</p><p className="text-[10px] text-zinc-400">{item.itemStatus ? STATUS_META[item.itemStatus]?.label || item.itemStatus : item.receiptStatus || 'Chờ nhận'}</p></div></div>{getTransferType(detailTransfer, warehouses) === 'TECHNICAL' && <div className="mt-3 flex flex-wrap gap-2">{(item.tasks || []).map(task => <span key={task.lineId || `${task.taskType}-${task.priority}`} className="rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">{task.taskName} · {PRIORITY_LABELS[task.priority]} · {currency.format(task.commissionAmount)}</span>)}</div>}{canReceive && receipt && <div className="mt-3 grid gap-2 rounded-xl bg-zinc-50 p-3 sm:grid-cols-[170px_1fr]"><select value={receipt.result} onChange={event => setReceiptDraft(current => ({ ...current, [item.imei!]: { ...current[item.imei!], result: event.target.value as ReceiptDraft[string]['result'], scannedImei: event.target.value === 'MISSING' ? '' : current[item.imei!].scannedImei } }))} className="h-10 rounded-lg border border-zinc-200 bg-white px-2 text-sm font-bold"><option value="RECEIVED">Đã nhận đủ</option><option value="MISSING">Không nhận được</option><option value="WRONG_DEVICE">Sai máy</option><option value="DAMAGED">Lỗi/hư khi vận chuyển</option></select><input value={receipt.scannedImei} disabled={receipt.result === 'MISSING'} onChange={event => setReceiptDraft(current => ({ ...current, [item.imei!]: { ...current[item.imei!], scannedImei: event.target.value } }))} placeholder={receipt.result === 'WRONG_DEVICE' ? 'Quét IMEI máy nhận sai' : 'Quét IMEI thực nhận'} className="h-10 rounded-lg border border-zinc-200 bg-white px-3 font-mono text-sm disabled:bg-zinc-100" /></div>}</div>; })}</div></div>
            {detailTransfer.notes && <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-xs font-black uppercase tracking-wide text-zinc-400">Ghi chú</p><p className="mt-2 text-sm text-zinc-700">{detailTransfer.notes}</p></div>}
          </div>
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-white px-5 py-4 sm:px-7"><button onClick={() => setDetailTransfer(null)} className="h-10 rounded-xl border border-zinc-200 px-4 text-sm font-black text-zinc-700">Đóng</button>{getTransferType(detailTransfer, warehouses) === 'TECHNICAL' && detailTransfer.status === 'WAITING_KTV_ACCEPT' && <><button disabled={busy} onClick={() => runDetailAction('CANCEL_TECH')} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-black text-red-700"><RotateCcw className="h-4 w-4" /> Hủy phiếu</button><button disabled={busy || scannedTechnicalImeis.length === 0} onClick={() => runDetailAction('ACCEPT_TECH')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-black text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Barcode className="h-4 w-4" />} Xác nhận {scannedTechnicalImeis.length} máy đã nhận</button></>}{getTransferType(detailTransfer, warehouses) === 'INTER_BRANCH' && ['IN_TRANSIT', 'PARTIALLY_RECEIVED', 'DISPUTED'].includes(detailTransfer.status) && <button disabled={busy || actionableReceiptResults.length === 0} onClick={() => runDetailAction('RECEIVE')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-black text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} Xác nhận {actionableReceiptResults.length} IMEI đã quét</button>}{getTransferType(detailTransfer, warehouses) === 'INTER_BRANCH' && detailTransfer.status === 'RECEIVED' && <button disabled={busy} onClick={() => runDetailAction('COMPLETE')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white"><CheckCircle2 className="h-4 w-4" /> Hoàn tất đối soát</button>}</footer>
        </Drawer>
      )}
    </div>
  );
};
