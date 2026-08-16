import React, { useState } from 'react';
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
  RefreshCw, 
  CreditCard, 
  FileText, 
  Sparkles, 
  X, 
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Info,
  Layers,
  Database
} from 'lucide-react';
import { StoreBranch, WarehouseInfo, StoreSettings, WarehouseId } from '../types';
import { PhoneHouseLogo } from './PhoneHouseLogo';

interface StoreSettingsViewProps {
  branches: StoreBranch[];
  warehouses: WarehouseInfo[];
  settings: StoreSettings;
  onAddBranch: (branch: StoreBranch) => void;
  onUpdateBranch: (branch: StoreBranch) => void;
  onDeleteBranch: (branchId: string) => void;
  onAddWarehouse: (warehouse: WarehouseInfo) => void;
  onUpdateWarehouse: (warehouse: WarehouseInfo) => void;
  onDeleteWarehouse: (warehouseId: string) => void;
  onSaveSettings: (settings: StoreSettings) => void;
  isFirebaseConnected?: boolean;
}

export const StoreSettingsView: React.FC<StoreSettingsViewProps> = ({
  branches,
  warehouses,
  settings,
  onAddBranch,
  onUpdateBranch,
  onDeleteBranch,
  onAddWarehouse,
  onUpdateWarehouse,
  onDeleteWarehouse,
  onSaveSettings,
  isFirebaseConnected = true
}) => {
  const [activeTab, setActiveTab] = useState<'branches' | 'warehouses' | 'company' | 'preview_print'>('branches');
  const [warehouseSystemFilter, setWarehouseSystemFilter] = useState<'ALL' | 'TONG' | 'PHONEHOUSE' | 'XSTORE'>('ALL');
  
  // Company info form state
  const [companyForm, setCompanyForm] = useState<StoreSettings>(settings);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Branch modal state
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<StoreBranch | null>(null);
  const [branchForm, setBranchForm] = useState<Partial<StoreBranch>>({
    code: '',
    name: '',
    address: '',
    phone: '',
    email: '',
    manager: '',
    openingHours: '08:30 - 21:30',
    warehouseId: 'KHO_PHONEHOUSE',
    systemType: 'PHONEHOUSE',
    isActive: true,
    isHeadquarter: false,
    taxCode: '',
    bankAccount: {
      bankName: 'Techcombank',
      accountNumber: '',
      accountHolder: ''
    },
    notes: ''
  });

  // Warehouse modal state
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseInfo | null>(null);
  const [warehouseForm, setWarehouseForm] = useState<Partial<WarehouseInfo>>({
    id: '',
    code: '',
    name: '',
    shortName: '',
    address: '',
    manager: '',
    phone: '',
    color: 'from-orange-500 to-amber-500',
    systemType: 'TONG',
    type: 'CENTRAL',
    technicianName: '',
    technicianId: '',
    parentWarehouseId: 'KHO_TONG',
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
      openingHours: '08:30 - 21:30',
      warehouseId: warehouses[0]?.id || 'KHO_PHONEHOUSE',
      systemType: 'PHONEHOUSE',
      isActive: true,
      isHeadquarter: false,
      taxCode: '',
      bankAccount: {
        bankName: 'Techcombank',
        accountNumber: '',
        accountHolder: ''
      },
      notes: ''
    });
    setIsBranchModalOpen(true);
  };

  const handleOpenEditBranch = (branch: StoreBranch) => {
    setEditingBranch(branch);
    setBranchForm({ ...branch });
    setIsBranchModalOpen(true);
  };

  const handleSaveBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchForm.name || !branchForm.address) {
      alert('Vui lòng điền đầy đủ Tên chi nhánh và Địa chỉ');
      return;
    }

    if (editingBranch) {
      const updated: StoreBranch = {
        ...editingBranch,
        ...(branchForm as StoreBranch)
      };
      onUpdateBranch(updated);
    } else {
      const newBranch: StoreBranch = {
        id: branchForm.id || `BR-${Date.now()}`,
        code: branchForm.code || `CN-0${branches.length + 1}`,
        name: branchForm.name || '',
        address: branchForm.address || '',
        phone: branchForm.phone || '',
        email: branchForm.email || '',
        manager: branchForm.manager || '',
        openingHours: branchForm.openingHours || '08:30 - 21:30',
        warehouseId: branchForm.warehouseId || 'KHO_PHONEHOUSE',
        systemType: branchForm.systemType || 'PHONEHOUSE',
        isActive: branchForm.isActive ?? true,
        isHeadquarter: branchForm.isHeadquarter ?? false,
        taxCode: branchForm.taxCode || '',
        bankAccount: branchForm.bankAccount || { bankName: '', accountNumber: '', accountHolder: '' },
        notes: branchForm.notes || ''
      };
      onAddBranch(newBranch);
    }
    setIsBranchModalOpen(false);
  };

  const handleOpenAddWarehouse = () => {
    setEditingWarehouse(null);
    const newId = `KHO_CUSTOM_${Date.now()}`;
    setWarehouseForm({
      id: newId,
      code: `KHO-0${warehouses.length + 1}`,
      name: '',
      shortName: '',
      address: '',
      manager: '',
      phone: '',
      color: 'from-purple-600 to-indigo-600',
      systemType: 'TONG',
      type: 'TECHNICIAN_SUB',
      technicianName: '',
      technicianId: '',
      parentWarehouseId: 'KHO_TONG',
      capacityNotes: '',
      isMain: false,
      isActive: true
    });
    setIsWarehouseModalOpen(true);
  };

  const handleOpenEditWarehouse = (warehouse: WarehouseInfo) => {
    setEditingWarehouse(warehouse);
    setWarehouseForm({ ...warehouse });
    setIsWarehouseModalOpen(true);
  };

  const handleSaveWarehouse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseForm.name || !warehouseForm.address) {
      alert('Vui lòng điền đầy đủ Tên kho và Địa chỉ');
      return;
    }

    const systemColor = warehouseForm.systemType === 'TONG' 
      ? 'from-purple-600 to-indigo-600' 
      : warehouseForm.systemType === 'PHONEHOUSE' 
        ? 'from-orange-500 to-amber-500' 
        : 'from-blue-600 to-cyan-500';

    if (editingWarehouse) {
      const updated: WarehouseInfo = {
        ...editingWarehouse,
        ...(warehouseForm as WarehouseInfo),
        color: systemColor
      };
      onUpdateWarehouse(updated);
    } else {
      const newWh: WarehouseInfo = {
        id: (warehouseForm.id || `KHO_${Date.now()}`) as WarehouseId,
        code: warehouseForm.code || `KHO-0${warehouses.length + 1}`,
        name: warehouseForm.name || '',
        shortName: warehouseForm.shortName || warehouseForm.name || '',
        address: warehouseForm.address || '',
        manager: warehouseForm.manager || '',
        phone: warehouseForm.phone || '',
        color: systemColor,
        systemType: warehouseForm.systemType || 'TONG',
        systemName: warehouseForm.systemType === 'TONG' ? 'Tổng Hệ Thống' : warehouseForm.systemType === 'PHONEHOUSE' ? 'PhoneHouse Retail' : 'Xstore Premium',
        type: warehouseForm.type || 'RETAIL_STORE',
        technicianName: warehouseForm.technicianName,
        technicianId: warehouseForm.technicianId,
        parentWarehouseId: warehouseForm.type === 'TECHNICIAN_SUB' ? (warehouseForm.parentWarehouseId || 'KHO_TONG') : undefined,
        capacityNotes: warehouseForm.capacityNotes || '',
        isMain: warehouseForm.isMain ?? false,
        isActive: warehouseForm.isActive ?? true
      };
      onAddWarehouse(newWh);
    }
    setIsWarehouseModalOpen(false);
  };

  const filteredWarehouses = warehouses.filter(w => {
    if (warehouseSystemFilter === 'ALL') return true;
    return (w.systemType || 'TONG') === warehouseSystemFilter;
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
              <div className="text-xl font-black text-amber-400">{warehouses.length} địa điểm</div>
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
      </div>

      {/* ================= TAB 1: CỬA HÀNG & CHI NHÁNH ================= */}
      {activeTab === 'branches' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-zinc-200">
            <div>
              <h3 className="font-black text-zinc-900 text-base">Danh Sách Cửa Hàng & Showroom Bán Lẻ</h3>
              <p className="text-xs text-zinc-500">Mỗi chi nhánh được liên kết với một kho hàng riêng và tài khoản ngân hàng nhận tiền</p>
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
              const matchedWh = warehouses.find(w => w.id === branch.warehouseId);
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
                              branch.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
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
                        {branches.length > 1 && (
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
                        )}
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
                          <Warehouse className="w-3.5 h-3.5 text-blue-500" />
                          <span>Kho liên kết: <strong>{matchedWh ? matchedWh.shortName : branch.warehouseId}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Bank info */}
                    {branch.bankAccount?.accountNumber && (
                      <div className="flex items-center justify-between text-xs bg-blue-50/70 border border-blue-100 rounded-xl px-3 py-2 text-blue-900">
                        <div className="flex items-center space-x-2">
                          <CreditCard className="w-4 h-4 text-blue-600" />
                          <span>TK Ngân Hàng: <strong>{branch.bankAccount.bankName} - {branch.bankAccount.accountNumber}</strong></span>
                        </div>
                        <span className="text-[10px] text-blue-600 font-bold">{branch.bankAccount.accountHolder}</span>
                      </div>
                    )}
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
                Quản lý kho Tổng, các kho con cho từng Kỹ thuật viên, kho bán lẻ PhoneHouse và kho Xstore độc lập.
              </p>
            </div>
            <button
              onClick={handleOpenAddWarehouse}
              className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-purple-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm Kho / Kho KTV Mới</span>
            </button>
          </div>

          {/* System Filter Pills */}
          <div className="flex flex-wrap gap-2 items-center bg-white p-2.5 rounded-2xl border border-zinc-200 text-xs font-bold">
            <span className="text-zinc-400 px-2 uppercase text-[11px] tracking-wider">Lọc theo hệ thống:</span>
            <button
              onClick={() => setWarehouseSystemFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                warehouseSystemFilter === 'ALL'
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Tất Cả Hệ Thống ({warehouses.length})
            </button>

            <button
              onClick={() => setWarehouseSystemFilter('TONG')}
              className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                warehouseSystemFilter === 'TONG'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                  : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-100'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
              <span>Tổng Kho & Kho KTV Con ({warehouses.filter(w => (w.systemType || 'TONG') === 'TONG').length})</span>
            </button>

            <button
              onClick={() => setWarehouseSystemFilter('PHONEHOUSE')}
              className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                warehouseSystemFilter === 'PHONEHOUSE'
                  ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/30'
                  : 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-100'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-orange-400"></span>
              <span>Hệ Thống PhoneHouse ({warehouses.filter(w => w.systemType === 'PHONEHOUSE').length})</span>
            </button>

            <button
              onClick={() => setWarehouseSystemFilter('XSTORE')}
              className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                warehouseSystemFilter === 'XSTORE'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              <span>Hệ Thống Xstore ({warehouses.filter(w => w.systemType === 'XSTORE').length})</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredWarehouses.map((wh) => {
              const isTong = (wh.systemType || 'TONG') === 'TONG';
              const isPhoneHouse = wh.systemType === 'PHONEHOUSE';
              const isXstore = wh.systemType === 'XSTORE';
              const isTechSub = wh.type === 'TECHNICIAN_SUB';

              return (
                <div 
                  key={wh.id}
                  className={`bg-white rounded-3xl p-5 border transition-all flex flex-col justify-between ${
                    isTechSub 
                      ? 'border-indigo-200 hover:border-indigo-400 hover:shadow-indigo-500/5'
                      : isTong 
                        ? 'border-purple-200 hover:border-purple-400 hover:shadow-purple-500/5'
                        : isPhoneHouse 
                          ? 'border-orange-200 hover:border-orange-400 hover:shadow-orange-500/5'
                          : 'border-blue-200 hover:border-blue-400 hover:shadow-blue-500/5'
                  } hover:shadow-lg`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                          isTechSub 
                            ? 'bg-indigo-50 text-indigo-600'
                            : isTong
                              ? 'bg-purple-50 text-purple-600'
                              : isPhoneHouse
                                ? 'bg-orange-50 text-orange-600'
                                : 'bg-blue-50 text-blue-600'
                        }`}>
                          <Warehouse className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded-md">
                              {wh.code}
                            </span>
                            {/* System Badge */}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isTong 
                                ? 'bg-purple-100 text-purple-800' 
                                : isPhoneHouse 
                                  ? 'bg-orange-100 text-orange-800' 
                                  : 'bg-blue-100 text-blue-800'
                            }`}>
                              {isTong ? 'Tổng Hệ Thống' : isPhoneHouse ? 'PhoneHouse' : 'Xstore'}
                            </span>

                            {wh.isMain && (
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">
                                Kho Trung Tâm
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
                        {warehouses.length > 1 && (
                          <button
                            onClick={() => {
                              if (confirm(`Bạn có chắc muốn xóa kho "${wh.name}"?`)) {
                                onDeleteWarehouse(wh.id);
                              }
                            }}
                            className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                            title="Xóa kho"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Warehouse Type Label */}
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-xl flex items-center gap-1.5 ${
                        isTechSub
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                          : wh.type === 'CENTRAL'
                            ? 'bg-purple-50 text-purple-700 border border-purple-100'
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
                          Kho cha: <strong>Kho Tổng (KT-01)</strong>
                        </span>
                      )}
                    </div>

                    {/* Assigned Technician Banner if Tech Sub */}
                    {isTechSub && (
                      <div className="bg-indigo-50/80 border border-indigo-100 rounded-2xl p-2.5 text-xs text-indigo-900 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">👨‍🔧</span>
                          <div>
                            <div className="font-bold">KTV Phụ Trách: {wh.technicianName || wh.manager}</div>
                            <div className="text-[10px] text-indigo-600 font-mono">{wh.technicianId || 'KTV Nội Bộ'}</div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-indigo-200/60 text-indigo-800 rounded-lg text-[10px] font-bold">
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
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full font-bold text-[10px]">
                      Đang Hoạt Động
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
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
                <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold animate-in fade-in">
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

      {/* ================= MODAL: THÊM / SỬA CHI NHÁNH ================= */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-orange-100 flex flex-col max-h-[90vh]">
            <div className="p-5 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100 flex items-center justify-between shrink-0">
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
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Kho hàng liên kết</label>
                  <select
                    value={branchForm.warehouseId}
                    onChange={(e) => setBranchForm({ ...branchForm, warehouseId: e.target.value as any })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
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

              {/* Bank Account */}
              <div className="p-3 bg-blue-50/60 rounded-2xl border border-blue-100 space-y-2">
                <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Tài Khoản Ngân Hàng Nhận Tiền Tại Quầy</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Tên ngân hàng (Techcombank)"
                    value={branchForm.bankAccount?.bankName}
                    onChange={(e) => setBranchForm({
                      ...branchForm,
                      bankAccount: { ...branchForm.bankAccount!, bankName: e.target.value }
                    })}
                    className="w-full px-3 py-1.5 bg-white border border-blue-200 rounded-xl text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Số tài khoản"
                    value={branchForm.bankAccount?.accountNumber}
                    onChange={(e) => setBranchForm({
                      ...branchForm,
                      bankAccount: { ...branchForm.bankAccount!, accountNumber: e.target.value }
                    })}
                    className="w-full px-3 py-1.5 bg-white border border-blue-200 rounded-xl text-xs"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Chủ tài khoản (viết hoa không dấu)"
                  value={branchForm.bankAccount?.accountHolder}
                  onChange={(e) => setBranchForm({
                    ...branchForm,
                    bankAccount: { ...branchForm.bankAccount!, accountHolder: e.target.value }
                  })}
                  className="w-full px-3 py-1.5 bg-white border border-blue-200 rounded-xl text-xs"
                />
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
                    className="w-4 h-4 text-emerald-500 rounded"
                  />
                  <span className="text-xs font-bold text-zinc-700">Đang hoạt động</span>
                </label>
              </div>

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
                  className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm shadow-md shadow-orange-500/20"
                >
                  {editingBranch ? 'Lưu Thay Đổi' : 'Tạo Cửa Hàng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: THÊM / SỬA KHO HÀNG ================= */}
      {isWarehouseModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-purple-100 flex flex-col max-h-[90vh]">
            <div className="p-5 bg-gradient-to-r from-purple-50 via-indigo-50 to-orange-50 border-b border-purple-100 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Warehouse className="w-5 h-5 text-purple-600" />
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
              {/* System Brand Selection */}
              <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-2">
                <label className="block text-xs font-bold text-zinc-800">
                  Thuộc Hệ Thống Nào? <span className="text-purple-600">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setWarehouseForm({ ...warehouseForm, systemType: 'TONG', type: warehouseForm.type || 'TECHNICIAN_SUB' })}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center gap-1 cursor-pointer ${
                      warehouseForm.systemType === 'TONG'
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 ring-2 ring-purple-600 ring-offset-1'
                        : 'bg-white text-zinc-700 hover:bg-purple-50 border border-zinc-200'
                    }`}
                  >
                    <span>🟣 TỔNG KHO</span>
                    <span className="text-[10px] opacity-80 font-normal">Central & KTV</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWarehouseForm({ ...warehouseForm, systemType: 'PHONEHOUSE', type: 'RETAIL_STORE' })}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center gap-1 cursor-pointer ${
                      warehouseForm.systemType === 'PHONEHOUSE'
                        ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30 ring-2 ring-orange-500 ring-offset-1'
                        : 'bg-white text-zinc-700 hover:bg-orange-50 border border-zinc-200'
                    }`}
                  >
                    <span>🟠 PHONEHOUSE</span>
                    <span className="text-[10px] opacity-80 font-normal">Hệ thống Retail</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWarehouseForm({ ...warehouseForm, systemType: 'XSTORE', type: 'RETAIL_STORE' })}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center gap-1 cursor-pointer ${
                      warehouseForm.systemType === 'XSTORE'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-2 ring-blue-600 ring-offset-1'
                        : 'bg-white text-zinc-700 hover:bg-blue-50 border border-zinc-200'
                    }`}
                  >
                    <span>🔵 XSTORE</span>
                    <span className="text-[10px] opacity-80 font-normal">Store Độc Lập</span>
                  </button>
                </div>
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
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, type: e.target.value as any })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900"
                  >
                    <option value="CENTRAL">Kho Tổng Phân Phối (Central Hub)</option>
                    <option value="TECHNICIAN_SUB">Kho Con Kỹ Thuật Viên (Gán cho từng KTV)</option>
                    <option value="RETAIL_STORE">Kho Cửa Hàng Bán Lẻ (Showroom)</option>
                    <option value="REPAIR_WARRANTY">Kho Tiếp Nhận & Bảo Hành</option>
                    <option value="TRANSIT">Kho Trung Chuyển (Transit)</option>
                  </select>
                </div>
              </div>

              {/* Special Section if TECHNICIAN_SUB */}
              {warehouseForm.type === 'TECHNICIAN_SUB' && (
                <div className="p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-2xl space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                    <span>👨‍🔧</span>
                    <span>Thiết Lập Kỹ Thuật Viên Phụ Trách Kho Này</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-indigo-900 mb-1">Tên Kỹ Thuật Viên *</label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Lê Hoàng Nam, Trọng, Dương..."
                        value={warehouseForm.technicianName || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setWarehouseForm({ 
                            ...warehouseForm, 
                            technicianName: val,
                            manager: warehouseForm.manager || val,
                            name: warehouseForm.name || (val ? `Kho KTV ${val}` : ''),
                            shortName: warehouseForm.shortName || (val ? `Kho KTV ${val}` : '')
                          });
                        }}
                        className="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs text-zinc-900 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-indigo-900 mb-1">Mã KTV / Nhân viên</label>
                      <input
                        type="text"
                        placeholder="STAFF_003, KTV-01..."
                        value={warehouseForm.technicianId || ''}
                        onChange={(e) => setWarehouseForm({ ...warehouseForm, technicianId: e.target.value })}
                        className="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs text-zinc-900 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-indigo-900 mb-1">Kho cha trực thuộc</label>
                    <select
                      value={warehouseForm.parentWarehouseId || 'KHO_TONG'}
                      onChange={(e) => setWarehouseForm({ ...warehouseForm, parentWarehouseId: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs text-zinc-900 font-medium"
                    >
                      <option value="KHO_TONG">Kho Tổng Trung Tâm (KHO_TONG - KT-01)</option>
                      {warehouses.filter(w => w.type === 'CENTRAL' && w.id !== warehouseForm.id).map(w => (
                        <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                      ))}
                    </select>
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
                    checked={warehouseForm.isMain}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, isMain: e.target.checked })}
                    className="w-4 h-4 text-purple-600 rounded"
                  />
                  <span className="text-xs font-bold text-zinc-700">Kho Trung Tâm Trực Thuộc</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={warehouseForm.isActive}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, isActive: e.target.checked })}
                    className="w-4 h-4 text-emerald-500 rounded"
                  />
                  <span className="text-xs font-bold text-zinc-700">Đang hoạt động</span>
                </label>
              </div>

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
                  className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl text-sm shadow-md shadow-purple-500/20"
                >
                  {editingWarehouse ? 'Lưu Thay Đổi' : 'Tạo Kho Hàng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
