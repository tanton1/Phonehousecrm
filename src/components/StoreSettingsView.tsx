import React, { useEffect, useState } from 'react';
import {
  Building2,
  Store,
  Warehouse,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  Phone,
  Mail,
  MapPin,
  Clock,
  ShieldCheck,
  Printer,
  Save,
  CreditCard,
  FileText,
  Sparkles,
  X,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Info,
  Layers,
  Database,
  Bell,
  Send,
  Wallet,
  Bot,
  Mic,
  Archive,
  RotateCcw
} from 'lucide-react';
import {
  StoreBranch,
  WarehouseInfo,
  StoreSettings,
  WarehouseId,
  FundAccount,
  SalesInvoice,
  DeviceItem,
  WarrantyTicket,
  AttendanceRecord,
  StaffMember,
  ProductItem
} from '../types';
import { PhoneHouseLogo } from './PhoneHouseLogo';
import { ExecutiveAIAssistantModal } from './ExecutiveAIAssistantModal';
import { isWarehouseActive, isWarehouseArchived } from '../utils/warehouseLifecycle';
import {
  requestDeleteTelegramConfiguration,
  requestRegisterTelegramWebhook,
  requestSaveTelegramConfiguration,
  requestTelegramStatus,
  requestTelegramTest,
  requestTestGeminiAi,
  TelegramRuntimeStatus
} from '../services/telegramApiClient';

export type StoreSettingsTab = 'branches' | 'warehouses' | 'company' | 'preview_print' | 'warranty' | 'notifications';

export interface StoreSettingsViewProps {
  initialTab?: StoreSettingsTab;
  branches: StoreBranch[];
  warehouses: WarehouseInfo[];
  settings: StoreSettings;
  funds?: FundAccount[];
  invoices?: SalesInvoice[];
  devices?: DeviceItem[];
  warrantyTickets?: WarrantyTicket[];
  attendanceRecords?: AttendanceRecord[];
  staffMembers?: StaffMember[];
  products?: ProductItem[];
  onAddBranch: (branch: StoreBranch) => Promise<void> | void;
  onUpdateBranch: (branch: StoreBranch) => Promise<void> | void;
  onDeleteBranch: (branchId: string) => Promise<void> | void;
  onAddWarehouse: (warehouse: WarehouseInfo) => Promise<void> | void;
  onUpdateWarehouse: (warehouse: WarehouseInfo) => Promise<void> | void;
  onDeleteWarehouse: (warehouseId: string) => Promise<void> | void;
  onRestoreWarehouse: (warehouseId: string) => Promise<void> | void;
  onSaveSettings: (settings: StoreSettings) => void;
  onNavigateToCashbook?: (branchId?: string) => void;
  isFirebaseConnected?: boolean;
}

export const StoreSettingsView: React.FC<StoreSettingsViewProps> = ({
  initialTab = 'branches',
  branches,
  warehouses,
  settings,
  funds = [],
  invoices = [],
  devices = [],
  warrantyTickets = [],
  attendanceRecords = [],
  staffMembers = [],
  onAddBranch,
  onUpdateBranch,
  onDeleteBranch,
  onAddWarehouse,
  onUpdateWarehouse,
  onDeleteWarehouse,
  onRestoreWarehouse,
  onSaveSettings,
  onNavigateToCashbook,
  isFirebaseConnected = true
}) => {
  const [activeTab, setActiveTab] = useState<StoreSettingsTab>(initialTab);
  const [warehouseBranchFilter, setWarehouseBranchFilter] = useState<string>('ALL');
  // Kho chưa phát sinh được xóa vĩnh viễn; dữ liệu lưu trữ cũ không còn hiển thị trong luồng thiết lập.
  const showArchivedWarehouses = false;

  // Executive AI Modal state
  const [isExecutiveModalOpen, setIsExecutiveModalOpen] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<TelegramRuntimeStatus | null>(null);
  const [telegramStatusLoading, setTelegramStatusLoading] = useState(false);
  const [telegramTestLoading, setTelegramTestLoading] = useState(false);
  const [telegramWebhookLoading, setTelegramWebhookLoading] = useState(false);
  const [telegramConfigSaving, setTelegramConfigSaving] = useState(false);
  const [telegramConfigDeleting, setTelegramConfigDeleting] = useState(false);
  const [geminiTestLoading, setGeminiTestLoading] = useState(false);
  const [telegramForm, setTelegramForm] = useState({
    botToken: '',
    chatId: '',
    ownerUserIds: '',
    alertsEnabled: true,
    queriesEnabled: true,
    geminiApiKey: '',
    aiModel: 'gemini-3.7-flash'
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadTelegramStatus = async () => {
    setTelegramStatusLoading(true);
    try {
      const nextStatus = await requestTelegramStatus();
      setTelegramStatus(nextStatus);
      setTelegramForm(current => ({
        ...current,
        chatId: nextStatus.chatId || current.chatId,
        ownerUserIds: nextStatus.ownerUserIds?.join(', ') || current.ownerUserIds,
        aiModel: nextStatus.aiModel || current.aiModel || 'gemini-3.7-flash',
        alertsEnabled: nextStatus.configured ? nextStatus.alertsEnabled !== false : true,
        queriesEnabled: nextStatus.configured ? nextStatus.queriesEnabled !== false : true
      }));
    } catch (error: any) {
      setTelegramStatus({ configured: false, connected: false, errorCode: error?.message || 'TELEGRAM_STATUS_FAILED' });
    } finally {
      setTelegramStatusLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'notifications') void loadTelegramStatus();
  }, [activeTab]);

  // Company info form state
  const [companyForm, setCompanyForm] = useState<StoreSettings>(settings);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Branch modal state
  const [toastMsg, setToastMsg] = useState<{text: string, type: 'success'|'error'} | null>(null);
  const showToast = (text: string, type: 'success'|'error' = 'success') => {
    setToastMsg({text, type});
    setTimeout(() => setToastMsg(null), 3000);
  };

  const [teleGroups, setTeleGroups] = useState<Array<{ id: string; name: string; chatIds: string }>>([]);

  const [teleTemplates, setTeleTemplates] = useState<Array<{ id: string; title: string; content: string }>>([]);
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [isSavingBranch, setIsSavingBranch] = useState(false);
  const [editingBranch, setEditingBranch] = useState<StoreBranch | null>(null);
  const [branchForm, setBranchForm] = useState<Partial<StoreBranch>>({
    code: '',
    name: '',
    address: '',
    phone: '',
    email: '',
    manager: '',
    openingHours: '',
    warehouseId: '',
    isActive: true,
    isHeadquarter: false,
    taxCode: '',
    allowedWifiSSID: '',
    attendanceRadius: 50,
    allowedGpsRadiusMeters: 50,
    notes: ''
  });

  const handleGetDeviceGPS = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setBranchForm(prev => ({
            ...prev,
            gpsLatitude: Number(position.coords.latitude.toFixed(6)),
            gpsLongitude: Number(position.coords.longitude.toFixed(6))
          }));
          alert(`Đã tự động lấy vị trí GPS hiện tại thành công:\nVĩ độ (Latitude): ${position.coords.latitude.toFixed(6)}\nKinh độ (Longitude): ${position.coords.longitude.toFixed(6)}`);
        },
        (error) => {
          alert('Không thể lấy vị trí GPS tự động: ' + error.message + '. Vui lòng nhập tọa độ thủ công.');
        },
        { enableHighAccuracy: true }
      );
    } else {
      alert('Trình duyệt không hỗ trợ Geolocation API.');
    }
  };

  // Warehouse modal state
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseInfo | null>(null);
  const [warehouseForm, setWarehouseForm] = useState<Partial<WarehouseInfo>>({
    id: '',
    code: '',
    branchId: '',
    name: '',
    shortName: '',
    address: '',
    manager: '',
    phone: '',
    color: 'from-orange-500 to-orange-500',
    type: 'CENTRAL',
    technicianName: '',
    technicianId: '',
    custodianUid: '',
    custodianName: '',
    parentWarehouseId: undefined,
    capacityNotes: '',
    isMain: false,
    isActive: true
  });

  const handleOpenAddBranch = () => {
    setEditingBranch(null);
    setBranchForm({
      id: `BR-${Date.now()}`,
      code: `CN-0${branches.length + 1}`,
      name: '',
      address: '',
      phone: '',
      email: '',
      manager: '',
      openingHours: '',
      warehouseId: '',
      isActive: true,
      isHeadquarter: false,
      taxCode: '',
      allowedWifiSSID: '',
      storePublicIp: '',
      allowedPublicIps: [],
      attendanceRadius: 50,
      allowedGpsRadiusMeters: 50,
      notes: ''
    });
    setIsBranchModalOpen(true);
  };

  const handleOpenEditBranch = (branch: StoreBranch) => {
    setEditingBranch(branch);
    setBranchForm({
      ...branch,
      storePublicIp: branch.storePublicIp || (Array.isArray(branch.allowedPublicIps) ? branch.allowedPublicIps.join(', ') : ''),
      allowedPublicIps: Array.isArray(branch.allowedPublicIps) ? branch.allowedPublicIps : (branch.storePublicIp ? branch.storePublicIp.split(',').map(s => s.trim()).filter(Boolean) : []),
      attendanceRadius: branch.attendanceRadius ?? branch.allowedGpsRadiusMeters ?? 50,
      allowedGpsRadiusMeters: branch.attendanceRadius ?? branch.allowedGpsRadiusMeters ?? 50
    });
    setIsBranchModalOpen(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchForm.name || !branchForm.address) {
      alert('Vui lòng điền đầy đủ Tên chi nhánh và Địa chỉ');
      return;
    }

    const ips = Array.isArray(branchForm.allowedPublicIps) && branchForm.allowedPublicIps.length > 0
      ? branchForm.allowedPublicIps
      : (branchForm.storePublicIp ? branchForm.storePublicIp.split(',').map(s => s.trim()).filter(Boolean) : []);
    const radius = Number(branchForm.attendanceRadius ?? branchForm.allowedGpsRadiusMeters ?? 50);
    if (!Number.isFinite(radius) || radius < 10 || radius > 5000) {
      alert('Bán kính GPS phải từ 10 đến 5.000 mét. Mặc định khuyến nghị là 50 mét.');
      return;
    }

    setIsSavingBranch(true);
    try {
      if (editingBranch) {
        const updated: StoreBranch = {
          ...editingBranch,
          ...(branchForm as StoreBranch),
          warehouseId: '',
          allowedPublicIps: ips,
          storePublicIp: ips.join(', '),
          attendanceRadius: radius,
          allowedGpsRadiusMeters: radius
        };
        await onUpdateBranch(updated);
      } else {
        const newBranch: StoreBranch = {
          id: branchForm.id || `BR-${Date.now()}`,
          code: branchForm.code || `CN-0${branches.length + 1}`,
          name: branchForm.name || '',
          address: branchForm.address || '',
          phone: branchForm.phone || '',
          email: branchForm.email || '',
          manager: branchForm.manager || '',
          openingHours: branchForm.openingHours || '',
          warehouseId: '',
          isActive: branchForm.isActive ?? true,
          isHeadquarter: branchForm.isHeadquarter ?? false,
          taxCode: branchForm.taxCode || '',
          allowedWifiSSID: branchForm.allowedWifiSSID || '',
          allowedPublicIps: ips,
          storePublicIp: ips.join(', '),
          gpsLatitude: branchForm.gpsLatitude,
          gpsLongitude: branchForm.gpsLongitude,
          attendanceRadius: radius,
          allowedGpsRadiusMeters: radius,
          notes: branchForm.notes || ''
        };
        await onAddBranch(newBranch);
      }
      setIsBranchModalOpen(false);
    } catch (err: any) {
      showToast(err?.message || 'Không thể lưu chi nhánh', 'error');
    } finally {
      setIsSavingBranch(false);
    }
  };

  const handleOpenAddWarehouse = () => {
    setEditingWarehouse(null);
    const newId = `KHO_CUSTOM_${Date.now()}`;
    setWarehouseForm({
      id: newId,
      code: `KHO-0${warehouses.length + 1}`,
      branchId: '',
      name: '',
      shortName: '',
      address: '',
      manager: '',
      phone: '',
      color: 'from-rose-600 to-rose-600',
      type: 'RETAIL_STORE',
      technicianName: '',
      technicianId: '',
      custodianUid: '',
      custodianName: '',
      parentWarehouseId: undefined,
      capacityNotes: '',
      isMain: false,
      isActive: true
    });
    setIsWarehouseModalOpen(true);
  };

  const handleOpenEditWarehouse = (warehouse: WarehouseInfo) => {
    setEditingWarehouse(warehouse);
    setWarehouseForm({
      ...warehouse,
      type: warehouse.isMain ? 'CENTRAL' : warehouse.type,
      custodianUid: warehouse.custodianUid || warehouse.technicianId || '',
      custodianName: warehouse.custodianName || warehouse.technicianName || ''
    });
    setIsWarehouseModalOpen(true);
  };

  const handleSaveWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseForm.branchId || warehouseForm.branchId === 'ALL' || !warehouseForm.name || !warehouseForm.address) {
      alert('Vui lòng chọn chi nhánh và điền đầy đủ Tên kho, Địa chỉ');
      return;
    }
    const isChild = warehouseForm.type === 'TECHNICIAN_SUB' || Boolean(warehouseForm.parentWarehouseId);
    const isMain = warehouseForm.type === 'CENTRAL';
    if (isChild && (!warehouseForm.parentWarehouseId || !warehouseForm.custodianUid)) {
      alert('Kho con bắt buộc chọn kho tổng cùng chi nhánh và nhân viên chịu trách nhiệm.');
      return;
    }

    const warehouseColor = isChild ? 'from-rose-600 to-rose-600' : 'from-orange-500 to-orange-500';

    try {
      const warehouse: WarehouseInfo = editingWarehouse ? {
        ...editingWarehouse,
        ...(warehouseForm as WarehouseInfo),
        technicianId: isChild ? warehouseForm.custodianUid : undefined,
        technicianName: isChild ? warehouseForm.custodianName : undefined,
        custodianUid: isChild ? warehouseForm.custodianUid : undefined,
        custodianName: isChild ? warehouseForm.custodianName : undefined,
        parentWarehouseId: isChild ? warehouseForm.parentWarehouseId : undefined,
        isMain: isChild ? false : isMain,
        color: warehouseColor
      } : {
        id: (warehouseForm.id || `KHO_${Date.now()}`) as WarehouseId,
        branchId: warehouseForm.branchId,
        code: warehouseForm.code || `KHO-0${warehouses.length + 1}`,
        name: warehouseForm.name || '',
        shortName: warehouseForm.shortName || warehouseForm.name || '',
        address: warehouseForm.address || '',
        manager: warehouseForm.manager || '',
        phone: warehouseForm.phone || '',
        color: warehouseColor,
        type: warehouseForm.type || 'RETAIL_STORE',
        technicianName: isChild ? warehouseForm.custodianName : undefined,
        technicianId: isChild ? warehouseForm.custodianUid : undefined,
        custodianName: isChild ? warehouseForm.custodianName : undefined,
        custodianUid: isChild ? warehouseForm.custodianUid : undefined,
        parentWarehouseId: isChild ? warehouseForm.parentWarehouseId : undefined,
        capacityNotes: warehouseForm.capacityNotes || '',
        isMain: isChild ? false : isMain,
        isActive: warehouseForm.isActive ?? true
      };
      if (editingWarehouse) await onUpdateWarehouse(warehouse);
      else await onAddWarehouse(warehouse);
      setIsWarehouseModalOpen(false);
      showToast(editingWarehouse ? 'Đã cập nhật kho' : 'Đã tạo kho', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Không thể lưu kho', 'error');
    }
  };

  const activeWarehouses = warehouses.filter(isWarehouseActive);
  const archivedWarehouses = warehouses.filter(isWarehouseArchived);
  const filteredWarehouses = activeWarehouses.filter(w => {
    if (warehouseBranchFilter === 'ALL') return true;
    return w.branchId === warehouseBranchFilter;
  });

  const handleSaveCompanySettings = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(companyForm);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-zinc-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full text-xs font-bold uppercase tracking-wider">
              <Building2 className="w-3.5 h-3.5" />
              <span>Cài Đặt Hệ Thống Phone House</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Cửa Hàng, Chi Nhánh & Hệ Thống Kho Bãi
            </h1>
            <p className="text-zinc-400 text-sm max-w-2xl leading-relaxed">
              Quản lý danh sách các điểm bán lẻ, kho hàng lưu trữ máy 15 số IMEI, thông tin công ty, hotline, mã số thuế và cấu hình mẫu in hóa đơn nhiệt K80.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-zinc-800/80 border border-zinc-700 rounded-2xl px-4 py-3 text-center">
              <div className="text-xs text-zinc-400 font-medium">Chi Nhánh</div>
              <div className="text-xl font-black text-orange-400">{branches.length} cửa hàng</div>
            </div>
            <div className="bg-zinc-800/80 border border-zinc-700 rounded-2xl px-4 py-3 text-center">
              <div className="text-xs text-zinc-400 font-medium">Kho Hàng</div>
              <div className="text-xl font-black text-orange-400">{warehouses.length} địa điểm</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
        <button
          onClick={() => setActiveTab('branches')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            activeTab === 'branches'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>Cửa Hàng / Chi Nhánh ({branches.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('warehouses')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            activeTab === 'warehouses'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <Warehouse className="w-4 h-4" />
          <span>Hệ Thống Kho Hàng ({warehouses.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('company')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            activeTab === 'company'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Thông Tin Doanh Nghiệp & Mẫu In K80</span>
        </button>

        <button
          onClick={() => setActiveTab('preview_print')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            activeTab === 'preview_print'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <Printer className="w-4 h-4" />
          <span>Xem Trước Mẫu In Hóa Đơn</span>
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            activeTab === 'notifications'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Thông báo Telegram</span>
        </button>
      </div>

      {/* ================= TAB 1: CỬA HÀNG & CHI NHÁNH ================= */}
      {activeTab === 'branches' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-zinc-200">
            <div>
              <h3 className="font-black text-zinc-900 text-base">Danh Sách Cửa Hàng & Showroom Bán Lẻ</h3>
              <p className="text-xs text-zinc-500">Tạo cửa hàng trước. Kho và tài khoản tài chính được tạo riêng rồi gắn bằng mã chi nhánh.</p>
            </div>
            <button
              onClick={handleOpenAddBranch}
              className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm shadow-md shadow-orange-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm Cửa Hàng Mới</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {branches.map((branch) => {
              const branchWarehouses = warehouses.filter(w => w.branchId === branch.id && isWarehouseActive(w));
              return (
                <div
                  key={branch.id}
                  className={`bg-white rounded-3xl p-5 border transition-all hover:shadow-lg flex flex-col justify-between ${
                    branch.isHeadquarter ? 'border-orange-300 ring-2 ring-orange-500/10' : 'border-zinc-200'
                  }`}
                >
                  <div className="space-y-4">
                    {/* Header with Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-3">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${
                          branch.isHeadquarter ? 'bg-orange-100 text-orange-600' : 'bg-zinc-100 text-zinc-700'
                        }`}>
                          <Store className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded-md">
                              {branch.code}
                            </span>
                            {branch.isHeadquarter && (
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                                ★ Trụ Sở Chính
                              </span>
                            )}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              branch.isActive ? 'bg-orange-100 text-orange-700' : 'bg-zinc-100 text-zinc-500'
                            }`}>
                              {branch.isActive ? 'Đang Hoạt Động' : 'Tạm Đóng'}
                            </span>
                          </div>
                          <h4 className="font-black text-zinc-900 text-base mt-1">{branch.name}</h4>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleOpenEditBranch(branch)}
                          className="p-2 text-zinc-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-colors cursor-pointer"
                          title="Chỉnh sửa thông tin"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Bạn có chắc muốn xóa cửa hàng "${branch.name}"?`)) {
                              onDeleteBranch(branch.id);
                            }
                          }}
                          className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                          title="Xóa chi nhánh"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Details Info List */}
                    <div className="space-y-2 text-xs text-zinc-600 bg-zinc-50 rounded-2xl p-3.5 border border-zinc-100">
                      <div className="flex items-start space-x-2">
                        <MapPin className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                        <span className="font-medium text-zinc-800">{branch.address}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-zinc-200/60">
                        <div className="flex items-center space-x-2">
                          <Phone className="w-3.5 h-3.5 text-zinc-400" />
                          <span className="font-bold text-zinc-800">{branch.phone || 'Chưa cập nhật'}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Clock className="w-3.5 h-3.5 text-zinc-400" />
                          <span>{branch.openingHours}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-zinc-200/60">
                        <div className="flex items-center space-x-2">
                          <ShieldCheck className="w-3.5 h-3.5 text-orange-500" />
                          <span>Quản lý: <strong>{branch.manager}</strong></span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Warehouse className="w-3.5 h-3.5 text-orange-500" />
                          <span>Kho thuộc cửa hàng: <strong>{branchWarehouses.length} kho</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Bank & Cash Fund Info */}
                    {(() => {
                      const cashFunds = funds.filter(f => f.branchId === branch.id && f.type === 'CASH' && f.isArchived !== true);
                      const bankFunds = funds.filter(f => f.branchId === branch.id && f.type === 'BANK' && f.isArchived !== true);
                      const cashBalance = cashFunds.reduce((sum, fund) => sum + (fund.currentBalance || 0), 0);
                      const bankBalance = bankFunds.reduce((sum, fund) => sum + (fund.currentBalance || 0), 0);
                      const formatCurrency = (amt: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amt);

                      return (
                        <div className="space-y-2 bg-gradient-to-br from-orange-50/80 to-amber-50/50 border border-orange-200/80 rounded-2xl p-3 text-xs text-orange-950 mt-2">
                          <div className="flex items-center justify-between pb-1.5 border-b border-orange-200/60">
                            <span className="font-extrabold text-orange-900 flex items-center space-x-1.5">
                              <Wallet className="w-3.5 h-3.5 text-orange-600" />
                              <span>Sổ Quỹ & Tài Khoản Liên Kết</span>
                            </span>
                            {onNavigateToCashbook && (
                              <button
                                onClick={() => onNavigateToCashbook(branch.id)}
                                className="text-[11px] text-orange-700 hover:text-orange-900 font-bold flex items-center space-x-1 hover:underline cursor-pointer"
                              >
                                <span>Xem Sổ Quỹ Shop</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                            <div className="bg-white/80 p-2 rounded-xl border border-orange-100">
                              <div className="text-zinc-500 text-[10px]">Quỹ tiền mặt tại quầy</div>
                              <div className="font-bold text-emerald-700 text-xs">
                                {cashFunds.length ? `${formatCurrency(cashBalance)} · ${cashFunds.length} quỹ` : '0 ₫ (Chưa tạo)'}
                              </div>
                            </div>
                            <div className="bg-white/80 p-2 rounded-xl border border-orange-100">
                              <div className="text-zinc-500 text-[10px]">
                                Tài khoản ngân hàng theo chi nhánh
                              </div>
                              <div className="font-bold text-orange-700 text-xs truncate">
                                {bankFunds.length ? `${bankFunds.length} tài khoản · ${formatCurrency(bankBalance)}` : 'Chưa cấu hình tài khoản'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* GPS check-in configuration summary */}
                    <div className="space-y-1.5 bg-orange-50/70 border border-orange-200/80 rounded-xl p-3 text-orange-950 mt-2 text-xs">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <div className="flex items-center space-x-2">
                          <MapPin className="w-4 h-4 text-[#ff4b16]" />
                          <span>GPS: <strong className="font-mono">{branch.gpsLatitude ?? 'Chưa cài'}, {branch.gpsLongitude ?? 'Chưa cài'}</strong> ({branch.attendanceRadius ?? branch.allowedGpsRadiusMeters ?? 50}m)</span>
                        </div>
                        <span className="text-[10px] bg-white border border-orange-200 text-[#ff4b16] font-extrabold px-2 py-0.5 rounded-md">
                          GPS & ảnh tại chỗ
                        </span>
                      </div>
                    </div>
                  </div>

                  {branch.notes && (
                    <div className="mt-3 pt-3 border-t border-zinc-100 text-[11px] text-zinc-500 italic">
                      "{branch.notes}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= TAB 2: HỆ THỐNG KHO HÀNG ================= */}
      {activeTab === 'warehouses' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-zinc-200">
            <div>
              <h3 className="font-black text-zinc-900 text-base">Danh Sách Hệ Thống Kho Hàng & Kho Kỹ Thuật</h3>
              <p className="text-xs text-zinc-500">
                Mỗi kho thuộc đúng một chi nhánh. Kho được đánh dấu là kho tổng mới có thể quản lý các kho con.
              </p>
            </div>
            <button
              onClick={handleOpenAddWarehouse}
              className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-rose-600 to-rose-600 hover:from-rose-700 hover:to-rose-700 text-white rounded-xl font-bold text-sm shadow-md shadow-rose-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm Kho / Kho KTV Mới</span>
            </button>
          </div>

          {/* Branch Filter Pills */}
          <div className={`${showArchivedWarehouses ? 'hidden' : 'flex'} flex-wrap gap-2 items-center bg-white p-2.5 rounded-2xl border border-zinc-200 text-xs font-bold`}>
            <span className="text-zinc-400 px-2 uppercase text-[11px] tracking-wider">Lọc theo chi nhánh:</span>
            <button
              onClick={() => setWarehouseBranchFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                warehouseBranchFilter === 'ALL'
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Tất cả chi nhánh ({activeWarehouses.length})
            </button>
            {branches.filter(branch => branch.isActive !== false).map(branch => (
              <button
                key={branch.id}
                onClick={() => setWarehouseBranchFilter(branch.id)}
                className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                  warehouseBranchFilter === branch.id
                    ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/30'
                    : 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-100'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current opacity-70"></span>
                <span>{branch.name} ({activeWarehouses.filter(w => w.branchId === branch.id).length})</span>
              </button>
            ))}
          </div>

          <div className={`${showArchivedWarehouses ? 'hidden' : 'grid'} grid-cols-1 md:grid-cols-3 gap-4`}>
            {filteredWarehouses.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
                Chi nhánh đang chọn chưa có kho hoạt động.
              </div>
            )}
            {filteredWarehouses.map((wh) => {
              const isTechSub = wh.type === 'TECHNICIAN_SUB';
              const branch = branches.find(item => item.id === wh.branchId);
              const parentWarehouse = warehouses.find(item => item.id === wh.parentWarehouseId);

              return (
                <div
                  key={wh.id}
                  className={`bg-white rounded-3xl p-5 border transition-all flex flex-col justify-between ${
                    isTechSub || wh.isMain
                      ? 'border-rose-200 hover:border-rose-400 hover:shadow-rose-500/5'
                      : 'border-orange-200 hover:border-orange-400 hover:shadow-orange-500/5'
                  } hover:shadow-lg`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                          isTechSub || wh.isMain
                            ? 'bg-rose-50 text-rose-600'
                            : 'bg-orange-50 text-orange-600'
                        }`}>
                          <Warehouse className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded-md">
                              {wh.code}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
                              {branch ? `${branch.name} (${branch.code})` : 'Chưa gán chi nhánh'}
                            </span>

                            {wh.isMain && (
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full">
                                Kho tổng
                              </span>
                            )}
                          </div>
                          <h4 className="font-black text-zinc-900 text-base mt-1">{wh.name}</h4>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleOpenEditWarehouse(wh)}
                          className="p-2 text-zinc-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-colors cursor-pointer"
                          title="Sửa kho"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Xóa vĩnh viễn kho "${wh.name}"? Chỉ kho chưa từng phát sinh dữ liệu hoặc liên kết mới được phép xóa.`)) return;
                            try {
                              await onDeleteWarehouse(wh.id);
                              showToast('Đã xóa vĩnh viễn kho chưa phát sinh', 'success');
                            } catch (error: any) {
                              const messages: Record<string, string> = {
                                WAREHOUSE_HAS_DEVICES: 'Kho vẫn còn máy/IMEI. Hãy chuyển hết tồn kho trước khi xóa.',
                                WAREHOUSE_HAS_CHILDREN: 'Kho đang có kho con. Hãy chuyển hoặc xóa các kho con trước.',
                                WAREHOUSE_HAS_TRANSFERS: 'Kho đã có phiếu chuyển hàng liên kết nên không thể xóa.',
                                WAREHOUSE_HAS_PURCHASE_ORDERS: 'Kho đã có phiếu nhập liên kết nên không thể xóa.',
                                WAREHOUSE_HAS_INVOICES: 'Kho đã có hóa đơn liên kết nên không thể xóa.',
                                WAREHOUSE_HAS_MOVEMENTS: 'Kho đã có lịch sử biến động tồn kho nên không thể xóa.'
                              };
                              showToast(messages[error?.message] || error?.message || 'Không thể xóa kho', 'error');
                            }
                          }}
                          className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                          title="Xóa kho"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Warehouse Type Label */}
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-xl flex items-center gap-1.5 ${
                        isTechSub
                          ? 'bg-rose-50 text-rose-700 border border-rose-100'
                          : wh.type === 'CENTRAL'
                            ? 'bg-rose-50 text-rose-700 border border-rose-100'
                            : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                        {isTechSub
                          ? 'Kho Kỹ Thuật Viên Con'
                          : wh.type === 'CENTRAL'
                            ? 'Kho Tổng Phân Phối'
                            : wh.type === 'REPAIR_WARRANTY'
                              ? 'Kho Bảo Hành & Tiếp Nhận'
                              : wh.type === 'TRANSIT'
                                ? 'Kho Trung Chuyển (Transit)'
                                : 'Kho Bán Lẻ Cửa Hàng'}
                      </span>

                      {isTechSub && wh.parentWarehouseId && (
                        <span className="text-[11px] text-zinc-500 font-medium">
                          Kho cha: <strong>{parentWarehouse ? `${parentWarehouse.name} (${parentWarehouse.code})` : wh.parentWarehouseId}</strong>
                        </span>
                      )}
                    </div>

                    {/* Assigned Technician Banner if Tech Sub */}
                    {isTechSub && (
                      <div className="bg-rose-50/80 border border-rose-100 rounded-2xl p-2.5 text-xs text-rose-900 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">👨‍🔧</span>
                          <div>
                            <div className="font-bold">KTV Phụ Trách: {wh.technicianName || wh.manager}</div>
                            <div className="text-[10px] text-rose-600 font-mono">{wh.technicianId || 'KTV Nội Bộ'}</div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-rose-200/60 text-rose-800 rounded-lg text-[10px] font-bold">
                          Test & Sửa máy
                        </span>
                      </div>
                    )}

                    <div className="space-y-2 text-xs text-zinc-600 bg-zinc-50 rounded-2xl p-3.5 border border-zinc-100">
                      <div className="flex items-start space-x-2">
                        <MapPin className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                        <span className="font-medium text-zinc-800">{wh.address}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60">
                        <span className="text-zinc-500">Người phụ trách / Thủ kho:</span>
                        <span className="font-bold text-zinc-900">{wh.manager || wh.technicianName || 'Chưa gán'}</span>
                      </div>
                      {wh.phone && (
                        <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60">
                          <span className="text-zinc-500">Điện thoại liên hệ:</span>
                          <span className="font-bold text-zinc-900">{wh.phone}</span>
                        </div>
                      )}
                      {wh.capacityNotes && (
                        <div className="pt-1 border-t border-zinc-200/60 text-zinc-500 text-[11px]">
                          Đặc điểm / Sức chứa: <span className="font-medium text-zinc-700">{wh.capacityNotes}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-mono">ID: {wh.id}</span>
                    <span className="px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full font-bold text-[10px]">
                      Đang Hoạt Động
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {showArchivedWarehouses && (
            <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              <div className="flex w-full items-center justify-between p-4 text-left">
                <span className="flex items-center gap-2 font-black text-zinc-800"><Archive className="h-4 w-4" /> Kho đã lưu trữ ({archivedWarehouses.length})</span>
              </div>
              {archivedWarehouses.length > 0 ? (
                <div className="grid gap-3 border-t border-zinc-200 bg-zinc-50 p-4 md:grid-cols-2 xl:grid-cols-3">
                  {archivedWarehouses.map(warehouse => {
                    const branch = branches.find(item => item.id === warehouse.branchId);
                    return <div key={warehouse.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="font-black text-zinc-900">{warehouse.name}</p><p className="mt-1 text-xs text-zinc-500">{warehouse.code} · {branch?.name || 'Chi nhánh không còn hoạt động'}</p></div>
                        <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black text-zinc-500">Đã lưu trữ</span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await onRestoreWarehouse(warehouse.id);
                            showToast(`Đã khôi phục kho "${warehouse.name}"`, 'success');
                          } catch (error: any) {
                            const message = error?.message === 'WAREHOUSE_CODE_DUPLICATE'
                              ? 'Không thể khôi phục vì chi nhánh đã có một kho hoạt động trùng mã.'
                              : error?.message || 'Không thể khôi phục kho';
                            showToast(message, 'error');
                          }
                        }}
                        className="mt-3 flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-black text-white hover:bg-orange-600"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Khôi phục kho
                      </button>
                    </div>;
                  })}
                </div>
              ) : (
                <div className="border-t border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-500">Chưa có kho nào bị ẩn.</div>
              )}
            </section>
          )}
        </div>
      )}

      {/* ================= TAB 3: THÔNG TIN DOANH NGHIỆP & MẪU IN ================= */}
      {activeTab === 'company' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200 shadow-sm animate-in fade-in duration-200">
          <form onSubmit={handleSaveCompanySettings} className="space-y-6 max-w-4xl">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
              <div>
                <h3 className="font-black text-zinc-900 text-lg">Thông Tin Doanh Nghiệp & Nhận Diện Thương Hiệu</h3>
                <p className="text-xs text-zinc-500">Thông tin này xuất hiện trên đầu hóa đơn K80, phiếu bảo hành và phiếu xuất kho</p>
              </div>
              {saveSuccess && (
                <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-xl text-xs font-bold animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Đã lưu thành công!</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">Tên công ty (Pháp nhân) *</label>
                <input
                  type="text"
                  required
                  value={companyForm.companyName}
                  onChange={(e) => setCompanyForm({ ...companyForm, companyName: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold text-zinc-900 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">Tên thương hiệu (Brand name) *</label>
                <input
                  type="text"
                  required
                  value={companyForm.brandName}
                  onChange={(e) => setCompanyForm({ ...companyForm, brandName: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold text-zinc-900 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">Mã số thuế (MST) *</label>
                <input
                  type="text"
                  required
                  value={companyForm.taxCode}
                  onChange={(e) => setCompanyForm({ ...companyForm, taxCode: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-mono font-bold text-zinc-900 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">Hotline CSKH / Bán hàng *</label>
                <input
                  type="text"
                  required
                  value={companyForm.hotline}
                  onChange={(e) => setCompanyForm({ ...companyForm, hotline: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold text-orange-600 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">Email Hỗ Trợ</label>
                <input
                  type="email"
                  value={companyForm.supportEmail}
                  onChange={(e) => setCompanyForm({ ...companyForm, supportEmail: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">Website / Fanpage</label>
                <input
                  type="text"
                  value={companyForm.website}
                  onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">Địa chỉ trụ sở chính</label>
              <input
                type="text"
                required
                value={companyForm.headquarterAddress}
                onChange={(e) => setCompanyForm({ ...companyForm, headquarterAddress: e.target.value })}
                className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">Slogan / Khẩu hiệu thương hiệu</label>
              <input
                type="text"
                value={companyForm.slogan}
                onChange={(e) => setCompanyForm({ ...companyForm, slogan: e.target.value })}
                className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>

            {/* Print Header & Footer notes */}
            <div className="pt-4 border-t border-zinc-100 space-y-4">
              <h4 className="font-bold text-zinc-900 text-sm">Cấu Hình Lời Nhắn Trên Mẫu In Hóa Đơn K80</h4>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">Lời cảm ơn & Lưu ý đầu trang (Header Note)</label>
                <textarea
                  rows={2}
                  value={companyForm.printHeaderNote}
                  onChange={(e) => setCompanyForm({ ...companyForm, printHeaderNote: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">Cam kết bảo hành chân trang (Footer Policy Note)</label>
                <textarea
                  rows={2}
                  value={companyForm.printFooterNote}
                  onChange={(e) => setCompanyForm({ ...companyForm, printFooterNote: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                className="flex items-center space-x-2 px-6 py-3 bg-zinc-900 hover:bg-black text-white font-bold text-sm rounded-xl shadow-lg transition-all cursor-pointer"
              >
                <Save className="w-4 h-4 text-orange-400" />
                <span>Lưu Cấu Hình Doanh Nghiệp</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ================= TAB 4: XEM TRƯỚC MẪU IN ================= */}
      {activeTab === 'preview_print' && (
        <div className="flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-zinc-200 w-full max-w-md font-mono text-xs text-zinc-800 space-y-4">
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-zinc-300">
              <h3 className="font-black text-base uppercase tracking-wider text-zinc-900">
                {companyForm.companyName}
              </h3>
              <p className="text-[11px] font-bold text-orange-600">{companyForm.slogan}</p>
              <p className="text-[10px] text-zinc-500">MST: {companyForm.taxCode} • Hotline: {companyForm.hotline}</p>
              <p className="text-[10px] text-zinc-500">Đ/C: {companyForm.headquarterAddress}</p>
              <div className="font-black text-sm mt-3 pt-2 border-t border-zinc-200">
                HÓA ĐƠN BÁN LẺ KIÊM PHIẾU BẢO HÀNH
              </div>
              <div className="text-[10px] text-zinc-400">Số: HD-20250215-088 • Ngày: 15/02/2025 10:30</div>
            </div>

            {/* Sample items */}
            <div className="space-y-2 py-2 border-b border-dashed border-zinc-300 text-[11px]">
              <div className="flex justify-between font-bold">
                <span>1. iPhone 16 Pro Max 256GB</span>
                <span>34.500.000 đ</span>
              </div>
              <div className="text-[10px] text-zinc-500 pl-3">
                IMEI: 356890123456789 (VN/A - New Seal)
              </div>
              <div className="flex justify-between font-bold">
                <span>2. Ốp Lưng Magsafe & Cường Lực KingKong</span>
                <span>450.000 đ</span>
              </div>
            </div>

            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span>Tổng tiền hàng:</span>
                <span>34.950.000 đ</span>
              </div>
              <div className="flex justify-between text-orange-600">
                <span>Chiết khấu khách VIP:</span>
                <span>-450.000 đ</span>
              </div>
              <div className="flex justify-between font-black text-sm text-zinc-900 pt-1 border-t border-zinc-200">
                <span>KHÁCH PHẢI TRẢ:</span>
                <span>34.500.000 đ</span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>Thanh toán:</span>
                <span>Chuyển khoản QR (Techcombank)</span>
              </div>
            </div>

            <div className="pt-3 border-t border-dashed border-zinc-300 text-[10px] text-zinc-600 text-center space-y-1">
              <p className="font-bold text-zinc-800">{companyForm.printHeaderNote}</p>
              <p className="text-zinc-500 italic">{companyForm.printFooterNote}</p>
            </div>

            <div className="pt-2 flex justify-around text-center text-[10px] text-zinc-600">
              <div>
                <p className="font-bold">Khách Hàng</p>
                <p className="text-zinc-400 mt-6">(Ký & ghi rõ họ tên)</p>
              </div>
              <div>
                <p className="font-bold">Thu Ngân / Cửa Hàng</p>
                <p className="text-zinc-400 mt-6">(Ký & đóng dấu)</p>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ================= TAB 5: THÔNG BÁO TELEGRAM ================= */}
      {activeTab === 'notifications' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-200 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center">
              <Send className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-zinc-900">Cài đặt Thông báo Telegram</h2>
              <p className="text-sm text-zinc-500">Tùy chỉnh các sự kiện hệ thống sẽ gửi tin nhắn cảnh báo đến Bot Telegram của bạn.</p>
            </div>
          </div>

          <div className="space-y-6 max-w-3xl">
            {/* Executive AI Voice Assistant Card (Idea 1) */}
            <div className="bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 text-white border border-orange-500/30 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/40">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-black flex items-center gap-2">
                      <span>Bot Telegram · Cảnh báo & tra cứu vận hành</span>
                      <span className="text-[10px] bg-orange-500/20 text-orange-400 px-2.5 py-0.5 rounded-full border border-orange-500/30 font-mono">
                        Server-authoritative
                      </span>
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Tra cứu doanh số, tồn kho IMEI và tiến độ kỹ thuật bằng lệnh hoặc câu hỏi tiếng Việt trong đúng group đã cấu hình.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 space-y-1">
                  <div className="text-[11px] font-bold text-orange-400 flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5" />
                    <span>Câu hỏi mẫu:</span>
                  </div>
                  <p className="text-xs text-zinc-300 italic">“@Bot doanh số PH109 hôm nay?”, “@Bot IMEI 12345 đang ở đâu?”</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 space-y-1">
                  <div className="text-[11px] font-bold text-green-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Webhook Endpoint:</span>
                  </div>
                  <code className="text-[11px] font-mono text-zinc-300 block truncate">/api/telegram/webhook</code>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setIsExecutiveModalOpen(true)}
                  className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-lg shadow-orange-500/30 cursor-pointer transition-all active:scale-95"
                >
                  <Mic className="w-4 h-4" />
                  <span>🎙️ Mở Trợ Lý Giám Đốc AI Voice (Thử Nghiệm Trực Tiếp)</span>
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 p-2.5 text-white"><Bot className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-zinc-900">Kết nối Bot ngay trên PhoneHouseCRM</h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-600">Token được mã hóa trên server và không hiển thị lại. Mã bảo vệ webhook được hệ thống tự sinh khi lưu.</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="text-xs font-black text-zinc-700">Bot Token từ @BotFather *</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={telegramForm.botToken}
                    onChange={event => setTelegramForm(current => ({ ...current, botToken: event.target.value.trim() }))}
                    placeholder={telegramStatus?.hasBotToken ? 'Đã lưu an toàn · để trống nếu không đổi token' : 'Ví dụ: 123456789:AA...'}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none focus:border-orange-500"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-black text-zinc-700">Chat ID nhóm Telegram *</span>
                  <input
                    inputMode="numeric"
                    value={telegramForm.chatId}
                    onChange={event => setTelegramForm(current => ({ ...current, chatId: event.target.value.replace(/[^0-9-]/g, '') }))}
                    placeholder="-1001234567890"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none focus:border-orange-500"
                  />
                  <p className="text-[11px] text-zinc-500">ID nhóm thường là số âm bắt đầu bằng -100.</p>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-black text-zinc-700">Telegram User ID của chủ hệ thống</span>
                  <input
                    inputMode="numeric"
                    value={telegramForm.ownerUserIds}
                    onChange={event => setTelegramForm(current => ({ ...current, ownerUserIds: event.target.value.replace(/[^0-9, ]/g, '') }))}
                    placeholder="123456789"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none focus:border-orange-500"
                  />
                  <p className="text-[11px] text-zinc-500">Nhiều ID thì cách nhau bằng dấu phẩy; chỉ các ID này được xem “all”.</p>
                </label>
              </div>

              {/* Gemini AI Deep Reasoning Configuration Section */}
              <div className="mt-5 pt-4 border-t border-orange-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-orange-600" />
                    <span className="text-xs font-black text-zinc-900 uppercase tracking-wide">🧠 Cấu Hình Gemini AI Trợ Lý Trả Lời Sâu</span>
                  </div>
                  {telegramStatus?.hasGeminiApiKey && (
                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Đã kết nối Gemini Key
                    </span>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-black text-zinc-700">Gemini API Key (Google AI Studio)</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={telegramForm.geminiApiKey}
                      onChange={event => setTelegramForm(current => ({ ...current, geminiApiKey: event.target.value.trim() }))}
                      placeholder={telegramStatus?.hasGeminiApiKey ? 'Đã lưu an toàn · để trống nếu không đổi key' : 'AIzaSy...'}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none focus:border-orange-500 font-mono"
                    />
                    <p className="text-[11px] text-zinc-500">Key dùng để phân tích số liệu kinh doanh và trả lời tự nhiên có chiều sâu.</p>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-xs font-black text-zinc-700">Mô hình AI (Model)</span>
                    <select
                      value={telegramForm.aiModel}
                      onChange={event => setTelegramForm(current => ({ ...current, aiModel: event.target.value }))}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none focus:border-orange-500 font-medium"
                    >
                      <option value="gemini-3.7-flash">🚀 Gemini 3.7 Flash (Mô hình cao nhất · Suy luận đỉnh cao & Tốc độ tức thì)</option>
                      <option value="gemini-3.6-flash">⚡ Gemini 3.6 Flash (Mô hình thế hệ 3.6 Flash)</option>
                      <option value="gemini-2.5-flash">✨ Gemini 2.5 Flash (Mô hình ổn định)</option>
                      <option value="gemini-2.5-pro">🧠 Gemini 2.5 Pro (Tư duy điều hành & Phân tích sâu)</option>
                    </select>
                    <p className="text-[11px] text-zinc-500">Mô hình xử lý câu hỏi điều hành và multi-turn function calling.</p>
                  </label>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={geminiTestLoading || (!telegramStatus?.hasGeminiApiKey && !telegramForm.geminiApiKey)}
                    onClick={async () => {
                      setGeminiTestLoading(true);
                      try {
                        const res = await requestTestGeminiAi(telegramForm.geminiApiKey || undefined);
                        if (res.success) {
                          showToast(`✅ Kết nối Gemini AI (${res.model}) thành công!`);
                        }
                      } catch (err: any) {
                        showToast(err?.message || 'Không kết nối được Gemini API Key.', 'error');
                      } finally {
                        setGeminiTestLoading(false);
                      }
                    }}
                    className="rounded-xl border border-orange-300 bg-white px-3.5 py-2 text-xs font-bold text-orange-700 hover:bg-orange-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                    <span>{geminiTestLoading ? 'Đang kiểm tra API Key…' : 'Kiểm tra kết nối Gemini AI'}</span>
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700">
                  <input type="checkbox" checked={telegramForm.alertsEnabled} onChange={event => setTelegramForm(current => ({ ...current, alertsEnabled: event.target.checked }))} /> Cảnh báo chấm công
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700">
                  <input type="checkbox" checked={telegramForm.queriesEnabled} onChange={event => setTelegramForm(current => ({ ...current, queriesEnabled: event.target.checked }))} /> Tra cứu vận hành
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={telegramConfigSaving || (!telegramStatus?.hasBotToken && !telegramForm.botToken) || !telegramForm.chatId}
                  onClick={async () => {
                    setTelegramConfigSaving(true);
                    try {
                      await requestSaveTelegramConfiguration(telegramForm);
                      setTelegramForm(current => ({ ...current, botToken: '', geminiApiKey: '' }));
                      showToast('Đã lưu cấu hình Bot & Gemini AI, xác minh và đồng bộ thành công.');
                      await loadTelegramStatus();
                    } catch (error: any) {
                      showToast(error?.message || 'Không lưu được cấu hình Telegram.', 'error');
                    } finally {
                      setTelegramConfigSaving(false);
                    }
                  }}
                  className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2.5 text-xs font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {telegramConfigSaving ? 'Đang xác minh & kết nối…' : 'Lưu cấu hình Bot & AI'}
                </button>
                {telegramStatus?.source === 'DATABASE' && <button
                  type="button"
                  disabled={telegramConfigDeleting}
                  onClick={async () => {
                    if (!window.confirm('Xóa cấu hình Bot Telegram đã lưu trên PhoneHouseCRM?')) return;
                    setTelegramConfigDeleting(true);
                    try {
                      await requestDeleteTelegramConfiguration();
                      setTelegramForm({ botToken: '', chatId: '', ownerUserIds: '', alertsEnabled: true, queriesEnabled: true, geminiApiKey: '', aiModel: 'gemini-3.7-flash' });
                      showToast('Đã xóa cấu hình Bot Telegram.');
                      await loadTelegramStatus();
                    } catch (error: any) {
                      showToast(error?.message || 'Không xóa được cấu hình Telegram.', 'error');
                    } finally {
                      setTelegramConfigDeleting(false);
                    }
                  }}
                  className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-black text-rose-600 disabled:opacity-40"
                >{telegramConfigDeleting ? 'Đang xóa…' : 'Xóa cấu hình'}</button>}
              </div>
            </div>

            {/* Status Card */}
            <div className={`rounded-2xl border p-5 flex items-start space-x-4 ${telegramStatus?.connected ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className={`w-2 h-2 rounded-full mt-2 ${telegramStatus?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className={`text-sm font-bold ${telegramStatus?.connected ? 'text-emerald-800' : 'text-amber-900'}`}>
                    {telegramStatusLoading ? 'Đang kiểm tra Telegram…' : telegramStatus?.connected ? `Đã kết nối${telegramStatus.botUsername ? ` · @${telegramStatus.botUsername}` : ''}` : 'Telegram chưa hoạt động'}
                  </h3>
                  <button type="button" onClick={() => void loadTelegramStatus()} disabled={telegramStatusLoading} className="inline-flex items-center gap-1 rounded-lg border border-current/20 px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-40"><RotateCcw className={`h-3.5 w-3.5 ${telegramStatusLoading ? 'animate-spin' : ''}`} /> Kiểm tra lại</button>
                </div>
                <p className={`text-xs mt-1 ${telegramStatus?.connected ? 'text-emerald-700' : 'text-amber-800'}`}>
                  {telegramStatus?.connected
                    ? `Webhook: ${telegramStatus.webhookConfigured ? 'đã đăng ký' : 'chưa đăng ký'} · Cảnh báo: ${telegramStatus.alertsEnabled ? 'bật' : 'tắt'} · Tra cứu: ${telegramStatus.queriesEnabled ? 'bật' : 'tắt'}`
                    : telegramStatus?.missing?.length
                      ? `Chưa đủ cấu hình: ${telegramStatus.missing.join(', ')}. Hãy nhập form phía trên.`
                      : telegramStatus?.errorCode || 'Không kết nối được Telegram API.'}
                </p>
                {telegramStatus?.connected && <p className="mt-1 text-[11px] text-zinc-500">Tin đang chờ webhook: {telegramStatus.pendingUpdateCount || 0} · Group: {telegramStatus.destinationFingerprint || '—'} · Nguồn: {telegramStatus.source === 'DATABASE' ? 'Cài trực tiếp trên CRM' : 'Biến Production'}</p>}
                <button
                  disabled={!telegramStatus?.connected || telegramTestLoading}
                  onClick={async (e) => {
                    e.preventDefault();
                    setTelegramTestLoading(true);
                    try {
                      await requestTelegramTest();
                      showToast('Telegram đã xác nhận gửi tin kiểm tra tới group.');
                    } catch (error: any) {
                      showToast(error?.message || 'Không gửi được tin kiểm tra Telegram.', 'error');
                    } finally {
                      setTelegramTestLoading(false);
                      void loadTelegramStatus();
                    }
                  }}
                  className="mt-3 px-4 py-2 bg-white border border-zinc-200 text-zinc-800 rounded-lg text-xs font-bold hover:bg-zinc-50 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {telegramTestLoading ? 'Đang gửi…' : 'Gửi tin kiểm tra'}
                </button>
                {telegramStatus?.configured && !telegramStatus?.webhookConfigured && (
                  <button
                    type="button"
                    disabled={telegramWebhookLoading}
                    onClick={async () => {
                      setTelegramWebhookLoading(true);
                      try {
                        await requestRegisterTelegramWebhook();
                        showToast('Đã đăng ký webhook Telegram cho Production.');
                        await loadTelegramStatus();
                      } catch (error: any) {
                        showToast(error?.message || 'Không đăng ký được webhook Telegram.', 'error');
                      } finally {
                        setTelegramWebhookLoading(false);
                      }
                    }}
                    className="ml-2 mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    {telegramWebhookLoading ? 'Đang đăng ký…' : 'Đăng ký webhook'}
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-bold text-zinc-900 border-b border-zinc-100 pb-2">Kênh Thông báo</h3>

              <div className="flex items-center justify-between p-4 rounded-2xl border border-zinc-100 hover:border-orange-200 transition-colors bg-zinc-50/50">
                <div>
                  <div className="font-bold text-zinc-800 text-sm">Cảnh báo rời chi nhánh (Geofencing)</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Thông báo theo bán kính GPS được cấu hình riêng tại từng chi nhánh; cần hai lần đo ngoài phạm vi liên tiếp.</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={Boolean(telegramStatus?.alertsEnabled)} disabled readOnly />
                  <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl border border-zinc-100 hover:border-orange-200 transition-colors bg-zinc-50/50">
                <div>
                  <div className="font-bold text-zinc-800 text-sm">Báo cáo doanh thu cuối ca</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Tự động tổng kết tiền mặt, chuyển khoản khi nhân viên chốt ca.</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={false} disabled readOnly />
                  <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl border border-zinc-100 hover:border-orange-200 transition-colors bg-zinc-50/50">
                <div>
                  <div className="font-bold text-zinc-800 text-sm">Thông báo khách hàng CRM mới</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Gửi thông báo khi có Khách hàng mới được thêm vào hệ thống.</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={false} disabled readOnly />
                  <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl border border-zinc-100 hover:border-orange-200 transition-colors bg-zinc-50/50">
                <div>
                  <div className="font-bold text-zinc-800 text-sm">Tiếp nhận Bảo hành & Sửa chữa</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Thông báo khi có phiếu biên nhận thiết bị mới từ khách hàng.</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={false} disabled readOnly />
                  <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
              Các công tắc trên phản ánh cấu hình thật của server. Token, group và quyền tra cứu được lưu trong biến môi trường Production, không lưu trong trình duyệt.
            </div>

            {/* Telegram Groups & Templates */}
            <div className="mt-8 pt-6 border-t border-zinc-200">
              <h3 className="text-lg font-extrabold text-zinc-900 mb-4">Quản lý Nhóm & Mẫu tin nhắn</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Groups */}
                <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-zinc-800 flex items-center gap-2">
                      <Database className="w-4 h-4 text-orange-500" /> Nhóm nhận tin
                    </h4>
                    <button className="text-xs text-orange-600 font-bold hover:underline flex items-center">
                      <Plus className="w-3 h-3 mr-1" /> Thêm nhóm
                    </button>
                  </div>
                  <div className="space-y-3">
                    {teleGroups.map(g => (
                      <div key={g.id} className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 flex justify-between items-center group">
                        <div>
                          <div className="text-sm font-bold text-zinc-800">{g.name}</div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{g.chatIds}</div>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                          <button className="p-1.5 text-zinc-400 hover:text-blue-600 bg-white rounded-lg border border-zinc-200"><Edit3 className="w-3 h-3" /></button>
                          <button className="p-1.5 text-zinc-400 hover:text-red-600 bg-white rounded-lg border border-zinc-200"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Templates */}
                <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-zinc-800 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-orange-500" /> Mẫu tin nhắn
                    </h4>
                    <button className="text-xs text-orange-600 font-bold hover:underline flex items-center">
                      <Plus className="w-3 h-3 mr-1" /> Tạo mẫu
                    </button>
                  </div>
                  <div className="space-y-3">
                    {teleTemplates.map(t => (
                      <div key={t.id} className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 group">
                        <div className="flex justify-between items-start mb-1.5">
                          <div className="text-sm font-bold text-zinc-800">{t.title}</div>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <button className="p-1 text-zinc-400 hover:text-blue-600"><Edit3 className="w-3 h-3" /></button>
                          </div>
                        </div>
                        <div className="text-[11px] text-zinc-600 bg-white p-2 border border-zinc-200 rounded-lg whitespace-pre-line font-mono">
                          {t.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
      {/* ================= MODAL: THÊM / SỬA CHI NHÁNH ================= */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-orange-100 flex flex-col max-h-[90vh]">
            <div className="p-5 bg-gradient-to-r from-orange-50 to-orange-50 border-b border-orange-100 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Store className="w-5 h-5 text-orange-600" />
                <h3 className="font-black text-zinc-900 text-base">
                  {editingBranch ? 'Cập Nhật Cửa Hàng' : 'Tạo Cửa Hàng / Chi Nhánh Mới'}
                </h3>
              </div>
              <button
                onClick={() => setIsBranchModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-white rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBranch} className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              <div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Mã chi nhánh *</label>
                  <input
                    type="text"
                    required
                    placeholder="CN-01"
                    value={branchForm.code}
                    onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold text-zinc-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Tên cửa hàng / Showroom *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Phone House - Chi Nhánh Cầu Giấy"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold text-zinc-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Địa chỉ chi tiết *</label>
                <input
                  type="text"
                  required
                  placeholder="Số nhà, đường, phường, quận, tỉnh/TP"
                  value={branchForm.address}
                  onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Hotline chi nhánh</label>
                  <input
                    type="text"
                    placeholder="0988.xxx.xxx"
                    value={branchForm.phone}
                    onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Cửa hàng trưởng</label>
                  <input
                    type="text"
                    placeholder="Tên quản lý"
                    value={branchForm.manager}
                    onChange={(e) => setBranchForm({ ...branchForm, manager: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Giờ mở cửa</label>
                  <input
                    type="text"
                    placeholder="08:30 - 21:30"
                    value={branchForm.openingHours}
                    onChange={(e) => setBranchForm({ ...branchForm, openingHours: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Mã số thuế chi nhánh</label>
                  <input
                    type="text"
                    placeholder="0109888999-001"
                    value={branchForm.taxCode}
                    onChange={(e) => setBranchForm({ ...branchForm, taxCode: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900"
                  />
                </div>
              </div>

              <div className="p-3 bg-orange-50/60 rounded-2xl border border-orange-100 space-y-2">
                <div className="text-xs font-bold text-orange-900 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Tài khoản tiền mặt và ngân hàng</span>
                </div>
                <p className="text-[11px] leading-relaxed text-orange-800">
                  Mỗi tài khoản được tạo và định danh riêng theo chi nhánh trong Sổ quỹ. Một chi nhánh có thể có nhiều tài khoản ngân hàng và nhiều quỹ tiền mặt.
                </p>
                {editingBranch && onNavigateToCashbook && (
                  <button
                    type="button"
                    onClick={() => onNavigateToCashbook(editingBranch.id)}
                    className="text-[11px] font-bold text-orange-700 hover:underline"
                  >
                    Mở Sổ quỹ để quản lý tài khoản
                  </button>
                )}
              </div>

              {/* GPS check-in configuration */}
              <div className="p-3.5 bg-orange-50/80 rounded-2xl border border-orange-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-black text-orange-950 flex items-center gap-1.5 uppercase tracking-wider">
                    <MapPin className="w-4 h-4 text-[#ff4b16]" />
                    <span>Tọa Độ GPS Chấm Công</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleGetDeviceGPS}
                    className="text-[10px] font-bold text-[#ff4b16] bg-white px-2 py-1 rounded-lg border border-orange-200 hover:bg-orange-100 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-orange-500" /> Lấy GPS hiện tại
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-700 mb-0.5">Vĩ độ GPS (Latitude)</label>
                    <input
                      type="number"
                      step="0.000001"
                      placeholder="16.061200"
                      value={branchForm.gpsLatitude ?? ''}
                      onChange={(e) => setBranchForm({ ...branchForm, gpsLatitude: parseFloat(e.target.value) || undefined })}
                      className="w-full px-3 py-1.5 bg-white border border-orange-200 rounded-xl text-xs font-mono font-bold text-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-700 mb-0.5">Kinh độ GPS (Longitude)</label>
                    <input
                      type="number"
                      step="0.000001"
                      placeholder="108.217000"
                      value={branchForm.gpsLongitude ?? ''}
                      onChange={(e) => setBranchForm({ ...branchForm, gpsLongitude: parseFloat(e.target.value) || undefined })}
                      className="w-full px-3 py-1.5 bg-white border border-orange-200 rounded-xl text-xs font-mono font-bold text-zinc-900"
                    />
                  </div>
                </div>

                <div>
                    <label className="block text-[11px] font-bold text-zinc-700 mb-0.5">Bán kính GPS (mét)</label>
                    <input
                      type="number"
                      placeholder="50"
                      min={10}
                      max={5000}
                      value={branchForm.attendanceRadius ?? 50}
                      onChange={(e) => {
                        const value = e.target.value === '' ? 50 : Number(e.target.value);
                        setBranchForm({ ...branchForm, attendanceRadius: value, allowedGpsRadiusMeters: value });
                      }}
                      className="w-full px-3 py-1.5 bg-white border border-orange-200 rounded-xl text-xs font-bold text-zinc-900"
                    />
                </div>
              </div>

              <div className="flex items-center space-x-4 pt-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={branchForm.isHeadquarter}
                    onChange={(e) => setBranchForm({ ...branchForm, isHeadquarter: e.target.checked })}
                    className="w-4 h-4 text-orange-500 rounded"
                  />
                  <span className="text-xs font-bold text-zinc-700">Đặt làm Trụ sở chính</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={branchForm.isActive}
                    onChange={(e) => setBranchForm({ ...branchForm, isActive: e.target.checked })}
                    className="w-4 h-4 text-orange-500 rounded"
                  />
                  <span className="text-xs font-bold text-zinc-700">Đang hoạt động</span>
                </label>
              </div>
              <p className="-mt-2 text-[11px] text-zinc-500">Trụ sở chính là chi nhánh đại diện mặc định cho báo cáo và điều phối. Tồn kho, doanh thu và tài khoản vẫn tách riêng như mọi chi nhánh khác. Chỉ có một trụ sở chính.</p>

              <div className="pt-3 border-t border-zinc-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsBranchModalOpen(false)}
                  className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-sm"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingBranch}
                  className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm shadow-md shadow-orange-500/20"
                >
                  {isSavingBranch ? 'Đang lưu...' : editingBranch ? 'Lưu Thay Đổi' : 'Tạo Cửa Hàng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: THÊM / SỬA KHO HÀNG ================= */}
      {isWarehouseModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-rose-100 flex flex-col max-h-[90vh]">
            <div className="p-5 bg-gradient-to-r from-rose-50 via-rose-50 to-orange-50 border-b border-rose-100 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Warehouse className="w-5 h-5 text-rose-600" />
                <h3 className="font-black text-zinc-900 text-base">
                  {editingWarehouse ? 'Cập Nhật Kho Hàng' : 'Tạo Kho Hàng / Kho KTV Mới'}
                </h3>
              </div>
              <button
                onClick={() => setIsWarehouseModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-white rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWarehouse} className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Cửa hàng / Chi nhánh sở hữu kho <span className="text-rose-600">*</span>
                </label>
                <select
                  required
                  value={warehouseForm.branchId || ''}
                  onChange={(e) => setWarehouseForm({
                    ...warehouseForm,
                    branchId: e.target.value,
                    parentWarehouseId: undefined,
                    custodianUid: '',
                    custodianName: '',
                    technicianId: '',
                    technicianName: ''
                  })}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold text-zinc-900"
                >
                  <option value="">Bắt buộc chọn cửa hàng trước</option>
                  {branches.filter(branch => branch.isActive !== false).map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>
                  ))}
                </select>
                {editingWarehouse && (
                  <p className="mt-1 text-[10px] text-zinc-500">Có thể đổi cửa hàng khi kho không còn máy, kho con hoặc phiếu chuyển đang mở.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Mã kho / Mã KTV *</label>
                  <input
                    type="text"
                    required
                    placeholder="KT-01, KTV-NAM..."
                    value={warehouseForm.code}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold text-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Phân loại kho</label>
                  <select
                    value={warehouseForm.type}
                    onChange={(e) => {
                      const type = e.target.value as WarehouseInfo['type'];
                      setWarehouseForm({
                        ...warehouseForm,
                        type,
                        isMain: type === 'CENTRAL',
                        parentWarehouseId: type === 'TECHNICIAN_SUB' ? warehouseForm.parentWarehouseId : undefined,
                        custodianUid: type === 'TECHNICIAN_SUB' ? warehouseForm.custodianUid : undefined,
                        custodianName: type === 'TECHNICIAN_SUB' ? warehouseForm.custodianName : undefined
                      });
                    }}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900"
                  >
                    <option value="CENTRAL">Kho tổng – được phép có kho con</option>
                    <option value="TECHNICIAN_SUB">Kho Con Kỹ Thuật Viên (Gán cho từng KTV)</option>
                    <option value="RETAIL_STORE">Kho Cửa Hàng Bán Lẻ (Showroom)</option>
                    <option value="REPAIR_WARRANTY">Kho Tiếp Nhận & Bảo Hành</option>
                    <option value="TRANSIT">Kho Trung Chuyển (Transit)</option>
                  </select>
                </div>
              </div>

              {/* Special Section if TECHNICIAN_SUB */}
              {warehouseForm.type === 'TECHNICIAN_SUB' && (
                <div className="p-3.5 bg-rose-50/80 border border-rose-200 rounded-2xl space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-950">
                    <span>👨‍🔧</span>
                    <span>Thiết Lập Kỹ Thuật Viên Phụ Trách Kho Này</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-rose-900 mb-1">Kho tổng trực thuộc *</label>
                    <select
                      required
                      value={warehouseForm.parentWarehouseId || ''}
                      onChange={(e) => setWarehouseForm({ ...warehouseForm, parentWarehouseId: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-rose-200 rounded-xl text-xs text-zinc-900 font-medium"
                    >
                      <option value="">Chọn kho tổng cùng chi nhánh</option>
                      {warehouses.filter(w => w.isMain && isWarehouseActive(w) && w.branchId === warehouseForm.branchId && w.id !== warehouseForm.id).map(w => (
                        <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-rose-900 mb-1">Nhân viên chịu trách nhiệm *</label>
                    <select
                      required
                      value={warehouseForm.custodianUid || ''}
                      onChange={(e) => {
                        const staff = staffMembers.find(item => item.id === e.target.value);
                        const staffName = staff?.name || '';
                        setWarehouseForm({
                          ...warehouseForm,
                          custodianUid: staff?.id || '',
                          custodianName: staffName,
                          technicianId: staff?.id || '',
                          technicianName: staffName,
                          manager: staffName || warehouseForm.manager,
                          name: warehouseForm.name || (staffName ? `Kho ${staffName}` : ''),
                          shortName: warehouseForm.shortName || (staffName ? `Kho ${staffName}` : '')
                        });
                      }}
                      className="w-full px-3 py-1.5 bg-white border border-rose-200 rounded-xl text-xs text-zinc-900 font-medium"
                    >
                      <option value="">Chọn nhân viên đang hoạt động</option>
                      {staffMembers
                        .filter(staff => staff.status === 'ACTIVE' && (staff.branchId === warehouseForm.branchId || staff.assignedBranchIds?.includes(warehouseForm.branchId || '')))
                        .map(staff => (
                          <option key={staff.id} value={staff.id}>{staff.name} ({staff.code})</option>
                        ))}
                    </select>
                    <p className="mt-1 text-[10px] text-rose-700">IMEI trong kho con sẽ quy trách nhiệm mặc định cho nhân viên này.</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Tên kho hàng đầy đủ *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Kho KTV Nam (Kỹ Thuật Phần Cứng), Kho Tổng..."
                  value={warehouseForm.name}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold text-zinc-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Tên viết tắt (Hiển thị thẻ máy) *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Kho KTV Nam, Kho Tổng, Kho Cầu Giấy..."
                  value={warehouseForm.shortName}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, shortName: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Địa chỉ / Vị trí bàn làm việc *</label>
                <input
                  type="text"
                  required
                  placeholder="Bàn Kỹ Thuật 01 - Trạm Kỹ Thuật Tổng / Địa chỉ kho"
                  value={warehouseForm.address}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, address: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Thủ kho / Người phụ trách</label>
                  <input
                    type="text"
                    placeholder="Tên người phụ trách"
                    value={warehouseForm.manager}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, manager: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Số điện thoại liên hệ</label>
                  <input
                    type="text"
                    placeholder="0988.xxx.xxx"
                    value={warehouseForm.phone}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Ghi chú sức chứa / Chuyên môn kho</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Kho tiếp nhận máy kiểm tra Face ID, Mainboard, Ép kính..."
                  value={warehouseForm.capacityNotes}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, capacityNotes: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900"
                />
              </div>

              <div className="flex items-center space-x-4 pt-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={warehouseForm.isActive}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, isActive: e.target.checked })}
                    className="w-4 h-4 text-orange-500 rounded"
                  />
                  <span className="text-xs font-bold text-zinc-700">Đang hoạt động</span>
                </label>
              </div>
              <p className="-mt-2 text-[11px] text-zinc-500">Kho tổng là kho cha có thể quản lý kho con. Kho bán lẻ chỉ giữ tồn tại cửa hàng và không có kho con. Chọn “Kho tổng” trong Phân loại là đủ.</p>

              <div className="pt-3 border-t border-zinc-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsWarehouseModalOpen(false)}
                  className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-sm"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-gradient-to-r from-rose-600 to-rose-600 hover:from-rose-700 hover:to-rose-700 text-white font-bold rounded-xl text-sm shadow-md shadow-rose-500/20"
                >
                  {editingWarehouse ? 'Lưu Thay Đổi' : 'Tạo Kho Hàng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXECUTIVE AI VOICE ASSISTANT MODAL (IDEA 1) */}
      <ExecutiveAIAssistantModal
        isOpen={isExecutiveModalOpen}
        onClose={() => setIsExecutiveModalOpen(false)}
        invoices={invoices}
        devices={devices}
        funds={funds}
        warrantyTickets={warrantyTickets}
        attendanceRecords={attendanceRecords}
        staffMembers={staffMembers}
      />
    </div>
  );
};
