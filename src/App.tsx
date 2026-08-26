import { MapPin, Sparkles } from "lucide-react";
import { GeofenceBackgroundTracker } from "./components/GeofenceBackgroundTracker";
import { RoleSwitcher, WorkspaceMode } from './components/RoleSwitcher';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  DeviceItem, 
  Lead, 
  TradeInAppraisal, 
  WarrantyTicket, 
  SalesInvoice, 
  UserAccount, 
  Partner, 
  PartnerDebtTransaction,
  FundAccount, 
  CashTransaction,
  ProductItem,
  StockTransferSlip,
  StoreBranch,
  WarehouseInfo,
  StoreSettings,
  PurchaseOrder,
  StaffMember,
  AttendanceRecord,
  LeaveRequest,
  SystemSetupStatus
} from './types';
import { AppShell } from './app/AppShell';
import { RepairIntakeModal } from './features/warranty/components/RepairIntakeModal';
import { AICopilotModal } from './components/AICopilotModal';
import { ExecutiveAIAssistantModal } from './components/ExecutiveAIAssistantModal';
import { QuickSearchModal } from './components/QuickSearchModal';
import { PhoneHouseLoginPage } from './components/PhoneHouseLoginPage';

import { fetchOperationalConfigs, fetchSystemSetupStatus } from './services/configurationApiClient';
import { testFirestoreConnection, auth } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { 
  subscribeToLeads,
  subscribeToTradeIns,
  subscribeToInvoices,
  cancelInvoiceInFirestore,
  subscribeToUsers,
  subscribeToPartners,
  addPartnerToFirestore,
  updatePartnerInFirestore,
  deletePartnerFromFirestore,
  subscribeToFunds,
  addFundToFirestore,
  updateFundInFirestore,
  deleteFundFromFirestore,
  subscribeToCashTransactions,
  addCashTransactionToFirestore,
  executeFundTransferInFirestore,
  subscribeToTransfers,
  subscribeToBranches,
  addBranchToFirestore,
  updateBranchInFirestore,
  deleteBranchFromFirestore,
  subscribeToWarehouses,
  addWarehouseToFirestore,
  updateWarehouseInFirestore,
  deleteWarehouseFromFirestore,
  restoreWarehouseFromFirestore,
  subscribeToStoreSettings,
  saveStoreSettingsToFirestore,
  subscribeToPurchaseOrders,
  subscribeToAttendance,
  subscribeToLeaveRequests
} from './services/firestoreService';
import { requestCreateTradeIn, requestUpdateTradeIn } from './services/tradeInApiClient';
import { getVietnamDateString, getVietnamTimeString } from './utils/dateTimeUtils';
import { recordBelongsToBranch } from './utils/branchScope';
import { requestCreateLeaveRequest, requestReviewLeaveRequest, requestServerCheckIn, requestServerCheckOut } from './services/attendanceApiClient';
import {
  createInventoryIdempotencyKey,
  fetchInventoryAccessoryBalances,
  fetchInventoryDevices,
  type InventoryDeviceSummary,
  requestImportInventoryDevices,
  requestReceivePurchaseOrder,
  requestCancelPurchaseOrder,
  requestPayPurchaseOrderDebt,
  requestUpdateInventoryDeviceMetadata,
  requestUpdatePurchaseOrderNote
} from './services/inventoryApiClient';
import { requestInstallmentDisbursement, requestSettlePartnerDebt, type PartnerDebtSettlementDirection } from './services/financeApiClient';
import { fetchAdminOperationalSnapshot, type AdminOperationalSnapshot } from './services/adminOperationalApiClient';
import { requestUpdateInvoiceNote } from './services/posApiClient';
import { requestLeadStateTransition } from './services/crmApiClient';
import { isWarehouseActive } from './utils/warehouseLifecycle';

const DashboardPage = React.lazy(() => import('./features/dashboard/DashboardPage').then(module => ({ default: module.DashboardPage })));
const POSCockpitView = React.lazy(() => import('./features/pos/components/POSCockpitView').then(module => ({ default: module.POSCockpitView })));
const RetailRepairView = React.lazy(() => import('./features/warranty/components/RetailRepairView').then(module => ({ default: module.RetailRepairView })));
const TradeInCockpitView = React.lazy(() => import('./features/tradein/components/TradeInCockpitView').then(module => ({ default: module.TradeInCockpitView })));
const CashLedgerTable = React.lazy(() => import('./features/finance/components/CashLedgerTable').then(module => ({ default: module.CashLedgerTable })));
const CashbookView = React.lazy(() => import('./components/CashbookView').then(module => ({ default: module.CashbookView })));
const OmnichannelChatView = React.lazy(() => import('./features/chat/components/OmnichannelChatView').then(module => ({ default: module.OmnichannelChatView })));
const ChannelConnectionsView = React.lazy(() => import('./features/chat/components/ChannelConnectionsView').then(module => ({ default: module.ChannelConnectionsView })));
const ReportsPage = React.lazy(() => import('./features/reports/ReportsPage').then(module => ({ default: module.ReportsPage })));
const StaffHRView = React.lazy(() => import('./components/StaffHRView').then(module => ({ default: module.StaffHRView })));
const PurchaseOrdersView = React.lazy(() => import('./components/PurchaseOrdersView').then(module => ({ default: module.PurchaseOrdersView })));
const InventoryView = React.lazy(() => import('./components/InventoryView').then(module => ({ default: module.InventoryView })));
const WarehouseTransfersView = React.lazy(() => import('./components/WarehouseTransfersView').then(module => ({ default: module.WarehouseTransfersView })));
const MasterCatalogView = React.lazy(() => import('./components/MasterCatalogView').then(module => ({ default: module.MasterCatalogView })));
const PartsInventoryHub = React.lazy(() => import('./components/PartsInventoryHub').then(module => ({ default: module.PartsInventoryHub })));
const InvoicesView = React.lazy(() => import('./components/InvoicesView').then(module => ({ default: module.InvoicesView })));
const InstallmentReconciliationView = React.lazy(() => import('./components/InstallmentReconciliationView').then(module => ({ default: module.InstallmentReconciliationView })));
const UserManagementView = React.lazy(() => import('./components/UserManagementView').then(module => ({ default: module.UserManagementView })));
const PartnersView = React.lazy(() => import('./components/PartnersView').then(module => ({ default: module.PartnersView })));
const SystemSettingsHub = React.lazy(() => import('./components/SystemSettingsHub').then(module => ({ default: module.SystemSettingsHub })));
const MoreHubView = React.lazy(() => import('./components/MoreHubView').then(module => ({ default: module.MoreHubView })));
const HRHubView = React.lazy(() => import('./components/HRHubView').then(module => ({ default: module.HRHubView })));
const StandaloneCheckInView = React.lazy(() => import('./components/StandaloneCheckInView').then(module => ({ default: module.StandaloneCheckInView })));
const TechWorkspaceView = React.lazy(() => import('./components/TechWorkspaceView').then(module => ({ default: module.TechWorkspaceView })));
const SalesWorkspaceView = React.lazy(() => import('./components/SalesWorkspaceView').then(module => ({ default: module.SalesWorkspaceView })));
const CRMLeadsView = React.lazy(() => import('./components/CRMLeadsView').then(module => ({ default: module.CRMLeadsView })));

function PageLoadingFallback() {
  return (
    <div className="flex min-h-[45vh] items-center justify-center bg-zinc-50 px-4">
      <div className="rounded-2xl border border-orange-100 bg-white px-5 py-4 text-sm font-bold text-zinc-600 shadow-sm">
        Đang mở trang…
      </div>
    </div>
  );
}

const BUSINESS_DATA_RESET_MARKER = 'phonehouse_business_data_reset_2026_08_21_v1';
const BUSINESS_CACHE_KEYS = [
  'istore_devices',
  'istore_leads',
  'istore_tradeins',
  'istore_warranty',
  'istore_invoices',
  'istore_users',
  'istore_partners',
  'phonehouse_funds',
  'phonehouse_cash_transactions',
  'phonehouse_products',
  'phonehouse_transfers',
  'phonehouse_purchase_orders',
  'phonehouse_branches',
  'phonehouse_warehouses',
  'phonehouse_store_settings',
  'phonehouse_active_user'
] as const;

function clearLegacyBusinessCacheOnce() {
  // Device documents may contain role-restricted cost fields from older builds.
  localStorage.removeItem('istore_devices');
  // Product Master is now paginated through the server API; never keep a full
  // catalog copy in each browser after upgrading.
  localStorage.removeItem('phonehouse_catalog');
  if (localStorage.getItem(BUSINESS_DATA_RESET_MARKER) === 'done') return;
  BUSINESS_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.setItem(BUSINESS_DATA_RESET_MARKER, 'done');
}

clearLegacyBusinessCacheOnce();

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isRepairIntakeOpen, setIsRepairIntakeOpen] = useState(false);
  const [retailRepairRefreshKey, setRetailRepairRefreshKey] = useState(0);
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<string | null>(null);
  const [linkedPurchaseOrderId, setLinkedPurchaseOrderId] = useState<string | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('ADMIN');

  // Persistence State
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [inventorySummary, setInventorySummary] = useState<InventoryDeviceSummary | undefined>();

  const [leads, setLeads] = useState<Lead[]>([]);

  const [tradeIns, setTradeIns] = useState<TradeInAppraisal[]>([]);

  // Legacy warrantyTickets are intentionally no longer loaded into the application.
  // New repair work is technicalWorkOrders only.
  const [warrantyTickets] = useState<WarrantyTicket[]>([]);

  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);

  const [users, setUsers] = useState<UserAccount[]>([]);

  const [partners, setPartners] = useState<Partner[]>([]);

  const [funds, setFunds] = useState<FundAccount[]>([]);

  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([]);
  const [adminOperationalSummary, setAdminOperationalSummary] = useState<AdminOperationalSnapshot['summary'] | null>(null);

  
  const [products, setProducts] = useState<ProductItem[]>([]);

  const [transfers, setTransfers] = useState<StockTransferSlip[]>([]);

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);

  const [branches, setBranches] = useState<StoreBranch[]>([]);

  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>([]);

  const [storeSettings, setStoreSettings] = useState<StoreSettings>(() => ({
      companyName: '', brandName: '', hotline: '', supportEmail: '', website: '', taxCode: '',
      headquarterAddress: '', slogan: '', printHeaderNote: '', printFooterNote: '',
      defaultWarrantyMonths: 0, warrantyPackages: [], branches: [], warehouses: []
    }));

  // Current Logged-in User Account
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);

  const [authReady, setAuthReady] = useState(false);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(() => auth.currentUser?.uid || null);
  const [systemSetupStatus, setSystemSetupStatus] = useState<SystemSetupStatus | null>(null);

  useEffect(() => {
    if (!authReady || !firebaseUid || !currentUser) {
      setSystemSetupStatus(null);
      return;
    }
    let active = true;
    void fetchOperationalConfigs().catch((error) => console.warn('[Operational configs]', error));
    fetchSystemSetupStatus()
      .then((status) => {
        if (!active) return;
        setSystemSetupStatus(status);
        const role = String(currentUser.role || '').toUpperCase();
        if (!status.complete && (role === 'ADMIN' || role === 'MANAGER')) {
          setActiveTab(current => current === 'funds' ? current : 'store-settings');
        }
      })
      .catch((error) => console.warn('[System setup status]', error));
    return () => { active = false; };
  }, [authReady, firebaseUid, currentUser?.id, currentUser?.role]);

  useEffect(() => {
    const role = String(currentUser?.role || '').toUpperCase();
    if (systemSetupStatus && !systemSetupStatus.complete && (role === 'ADMIN' || role === 'MANAGER') && !['store-settings', 'funds'].includes(activeTab)) {
      setActiveTab('store-settings');
    }
  }, [activeTab, currentUser?.role, systemSetupStatus]);

  // Modals & Triggers
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false);

  // Dynamic Workspace Mode Synchronization based on Logged-in User Role
  useEffect(() => {
    if (!currentUser) {
      setWorkspaceMode('ADMIN');
      return;
    }
    const role = currentUser.role?.toUpperCase();
    if (role === 'TECHNICIAN') {
      setWorkspaceMode('TECH');
    } else if (role === 'CUSTOMER_CARE') {
      setWorkspaceMode('SALES');
      setActiveTab('crm');
    } else if (role === 'SALES') {
      setWorkspaceMode('SALES');
    } else {
      setWorkspaceMode('ADMIN');
    }
  }, [currentUser]);
  const [isAICopilotOpen, setIsAICopilotOpen] = useState(false);
  const [isExecutiveAIOpen, setIsExecutiveAIOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [posPreSelectedDevice, setPosPreSelectedDevice] = useState<DeviceItem | null>(null);
  const [posCustomerContext, setPosCustomerContext] = useState<{ name?: string; phone?: string } | null>(null);
  const [posTradeInContext, setPosTradeInContext] = useState<any | null>(null);
  const [selectedPosWarehouseId, setSelectedPosWarehouseId] = useState('');
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(true);

  // Global Branch Selection for ADMIN
  const [selectedBranchId, setSelectedBranchId] = useState<string>('ALL');
  
  // Realtime Attendance State
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);

  // Time-tracking functions with Authoritative Server Integration & Vietnam Timezone
  const handleCheckIn = async (recordOrDraft: string | any): Promise<AttendanceRecord> => {
    if (!currentUser) {
      throw new Error('UNAUTHENTICATED: Bạn chưa đăng nhập vào hệ thống.');
    }
    const authUid = auth.currentUser?.uid || currentUser.id;
    const today = getVietnamDateString();
    
    // Check if already checked in locally before network request
    const existing = attendanceRecords.find(a => a.staffId === authUid && a.date === today);
    if (existing && existing.checkInTime) {
      const msg = `Bạn đã chấm công vào ca hôm nay lúc ${existing.checkInTime}. Không thể chấm công lại.`;
      alert(msg);
      throw new Error(`ALREADY_CHECKED_IN: ${msg}`);
    }

    let evidencePayload: any;
    const attendanceBranchId = recordOrDraft?.branchId || currentUser.branchId || '';
    if (!attendanceBranchId) throw new Error('BRANCH_REQUIRED: Cần chọn chi nhánh trước khi chấm công.');
    if (typeof recordOrDraft === 'object' && recordOrDraft !== null) {
      evidencePayload = {
        branchId: attendanceBranchId,
        branchName: recordOrDraft.branchName || branches.find(b => b.id === (recordOrDraft.branchId || currentUser.branchId))?.name,
        staffName: currentUser.displayName,
        role: currentUser.role,
        userCoords: recordOrDraft.verification?.userCoords,
        faceCaptureBase64: recordOrDraft.verification?.snapshotUrl,
        qrScanned: recordOrDraft.verification?.qrScanned
      };
    } else {
      evidencePayload = {
        branchId: attendanceBranchId,
        branchName: branches.find(b => b.id === currentUser.branchId)?.name,
        staffName: currentUser.displayName,
        role: currentUser.role
      };
    }

    try {
      const serverRecord = await requestServerCheckIn(evidencePayload);

      // Only update local state once backend persistence is confirmed
      setAttendanceRecords(prev => {
        const exists = prev.some(a => a.id === serverRecord.id || (a.staffId === authUid && a.date === today));
        return exists ? prev.map(a => (a.staffId === authUid && a.date === today ? serverRecord : a)) : [serverRecord, ...prev];
      });

      return serverRecord;
    } catch (err: any) {
      console.error('[Attendance CheckIn Server Authority Error]:', err);
      const errMsg = err?.message || 'Lỗi xử lý điểm danh từ máy chủ.';
      alert(`Điểm danh chưa thành công: ${errMsg}`);
      throw err;
    }
  };

  const handleCheckOut = async () => {
    if (!currentUser) return;
    const authUid = auth.currentUser?.uid || currentUser.id;
    const today = getVietnamDateString();

    try {
      if (!currentUser.branchId) throw new Error('BRANCH_REQUIRED: Tài khoản chưa được gán chi nhánh.');
      const completedRecord = await requestServerCheckOut(currentUser.branchId);
      
      // Update state directly with the authoritative completed record from backend (retaining calculated workDurationMinutes)
      setAttendanceRecords(prev => prev.map(a => 
        (a.id === completedRecord.id || (a.staffId === authUid && a.date === today)) 
          ? completedRecord 
          : a
      ));
    } catch (err: any) {
      console.error('[Attendance CheckOut Error]:', err);
      alert(`Kết thúc ca chưa thành công: ${err.message || 'Lỗi cập nhật từ máy chủ'}`);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('[Firebase SignOut Error]:', e);
    }
    setCurrentUser(null);
    localStorage.removeItem('phonehouse_active_user');
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('phonehouse:draft:v1:') || key.startsWith('phonehouse_face_profile_')) {
        localStorage.removeItem(key);
      }
    });
    setLeads([]);
    setTradeIns([]);
    setInvoices([]);
    setPartners([]);
    setFunds([]);
    setCashTransactions([]);
    setProducts([]);
    setTransfers([]);
    setPurchaseOrders([]);
    setAttendanceRecords([]);
    setIsLoginModalOpen(true);
  };

  const currentAttendance = attendanceRecords.find(a => a.staffId === (auth.currentUser?.uid || currentUser?.id) && a.date === getVietnamDateString());

  const activeBranchId = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER' 
    ? (currentUser.role === 'MANAGER' && selectedBranchId === 'ALL' ? currentUser.branchId : selectedBranchId)
    : (currentUser?.branchId || (currentUser as any)?.branch);

  const resolvedCurrentBranch = useMemo<StoreBranch>(() => {
    // 1. Prioritize explicitly selected branch if not 'ALL'
    if (selectedBranchId && selectedBranchId !== 'ALL' && branches && branches.length > 0) {
      const found = branches.find(b => b.id === selectedBranchId || b.code === selectedBranchId);
      if (found) return found;
    }
    // 2. If 'ALL' or not found, fallback to currentUser assigned branch
    const userBranch = currentUser?.branchId || (currentUser as any)?.branch;
    if (userBranch && branches && branches.length > 0) {
      const found = branches.find(b => 
        b.id === userBranch || 
        b.code === userBranch || 
        (b.name && b.name.toLowerCase().includes(userBranch.toLowerCase()))
      );
      if (found) return found;
    }
    return {
      id: 'ALL',
      code: 'ALL',
      name: 'Toàn Hệ Thống',
      address: '',
      phone: '',
      email: '',
      manager: '',
      openingHours: '',
      warehouseId: '',
      isActive: true,
      isHeadquarter: false,
      notes: ''
    };
  }, [branches, selectedBranchId, currentUser]);
  const scopedBranch = branches.find(branch => branch.id === activeBranchId || branch.code === activeBranchId);
  const scopedBranchId = scopedBranch?.id || activeBranchId;

  // Filtered Data based on Active Branch
  const filteredDevices = activeBranchId === 'ALL' || !activeBranchId 
    ? devices 
    : devices.filter(d => 
        d.branchId === scopedBranchId ||
        (d.warehouse && warehouses.find(w => w.id === d.warehouse)?.branchId === scopedBranchId)
      );

  const activePosWarehouses = useMemo(() => warehouses.filter(warehouse => (
    warehouse.branchId === resolvedCurrentBranch.id
    && isWarehouseActive(warehouse)
    && (!warehouse.type || ['CENTRAL', 'RETAIL_STORE'].includes(warehouse.type))
  )), [resolvedCurrentBranch.id, warehouses]);

  const preferredPosWarehouseId = useMemo(() => {
    const activeIds = new Set(activePosWarehouses.map(warehouse => String(warehouse.id)));
    const configuredWarehouseId = String(resolvedCurrentBranch.warehouseId || '');
    if (activeIds.has(configuredWarehouseId)) return configuredWarehouseId;

    const inventoryWarehouseId = devices
      .filter(device => device.status === 'in_stock' && device.branchId === resolvedCurrentBranch.id)
      .map(device => String(device.currentLocationId || device.warehouseId || device.warehouse || ''))
      .find(locationId => activeIds.has(locationId));
    if (inventoryWarehouseId) return inventoryWarehouseId;

    return String(
      activePosWarehouses.find(warehouse => warehouse.type === 'RETAIL_STORE')?.id
      || activePosWarehouses.find(warehouse => warehouse.isMain)?.id
      || activePosWarehouses[0]?.id
      || ''
    );
  }, [activePosWarehouses, devices, resolvedCurrentBranch.id, resolvedCurrentBranch.warehouseId]);

  useEffect(() => {
    setSelectedPosWarehouseId(current => activePosWarehouses.some(warehouse => String(warehouse.id) === current)
      ? current
      : preferredPosWarehouseId);
  }, [activePosWarehouses, preferredPosWarehouseId]);

  const filteredLeads = activeBranchId === 'ALL' || !activeBranchId 
    ? leads 
    : leads.filter(lead => lead.branchId === scopedBranchId);

  const filteredTradeIns = activeBranchId === 'ALL' || !activeBranchId 
    ? tradeIns 
    : tradeIns.filter(tradeIn => tradeIn.branchId === scopedBranchId);

  const filteredWarrantyTickets = activeBranchId === 'ALL' || !activeBranchId 
    ? warrantyTickets 
    : warrantyTickets.filter(ticket => ticket.branchId === scopedBranchId);

  const filteredInvoices = activeBranchId === 'ALL' || !activeBranchId 
    ? invoices 
    : invoices.filter(invoice => recordBelongsToBranch(invoice, scopedBranchId, branches, warehouses));

  const filteredFunds = activeBranchId === 'ALL' || !activeBranchId
    ? funds
    : funds.filter(fund => fund.branchId === scopedBranchId);

  const filteredCashTransactions = activeBranchId === 'ALL' || !activeBranchId 
    ? cashTransactions 
    : cashTransactions.filter(transaction => transaction.branchId === scopedBranchId);

  const filteredUsers = activeBranchId === 'ALL' || !activeBranchId 
    ? users 
    : users.filter(u => u.branchId === scopedBranchId);

  const filteredPurchaseOrders = activeBranchId === 'ALL' || !activeBranchId
    ? purchaseOrders
    : purchaseOrders.filter(order => recordBelongsToBranch(order, scopedBranchId, branches, warehouses));

  const filteredPartners = activeBranchId === 'ALL' || !activeBranchId 
    ? partners 
    : partners.filter(partner => partner.branchId === scopedBranchId);

  const filteredTransfers = activeBranchId === 'ALL' || !activeBranchId 
    ? transfers 
    : transfers.filter(t => {
        const sourceWarehouseBranch = warehouses.find(warehouse => warehouse.id === (t.sourceLocationId || t.fromWarehouse))?.branchId;
        const destinationWarehouseBranch = warehouses.find(warehouse => warehouse.id === (t.destinationLocationId || t.toWarehouse))?.branchId;
        return t.sourceBranchId === scopedBranchId || t.destinationBranchId === scopedBranchId || sourceWarehouseBranch === scopedBranchId || destinationWarehouseBranch === scopedBranchId;
      });

  // Adapter mapping UserAccount to StaffMember Single Source of Truth
  const staffMembers = useMemo<StaffMember[]>(() => {
    return (users || [])
      .map(user => {
        if (!user || !user.id || !user.displayName) return null;
        const branch = branches.find(b => b && b.id === user.branchId);
        return {
          id: user.id,
          code: (user as any).employeeCode || (user as any).code || user.id,
          name: user.displayName,
          displayName: user.displayName,
          email: user.email,
          phone: user.phone || '',
          role: user.role,
          roleTitle:
            user.role === 'ADMIN'
              ? 'Quản trị viên'
              : user.role === 'MANAGER'
                ? 'Quản lý cửa hàng'
                : user.role === 'TECHNICIAN' || user.role === 'TECH'
                  ? 'Kỹ thuật viên'
                  : user.role === 'SALES'
                    ? 'Nhân viên bán hàng'
                    : user.role === 'CUSTOMER_CARE'
                      ? 'Chăm sóc khách hàng'
                    : 'Nhân viên',
          branchId: user.branchId || '',
          assignedBranchIds: user.assignedBranchIds || [],
          branchName: branch?.name || 'Chi Nhánh Showroom',
          avatar: user.avatarUrl || '',
          baseSalary: user.baseSalary || 0,
          monthlyTargetRevenue: user.kpiTargetRevenue || 0,
          monthlyTargetOrders: user.kpiTargetOrders || 0,
          status: user.active === false ? 'INACTIVE' : 'ACTIVE',
          joinDate: user.createdAt || '',
          departmentId: user.departmentId,
          departmentName: user.departmentName
        } as unknown as StaffMember;
      })
      .filter((s): s is StaffMember => Boolean(s && s.id && s.name));
  }, [users, branches]);

  // Initialize Firebase and subscribe to real-time collections
  useEffect(() => {
    // 1. Test connection to Firestore on boot
    testFirestoreConnection().then((ok) => {
      setIsFirebaseConnected(ok);
    });
    let unsubLeads = () => {};
    let unsubTradeIns = () => {};
    let unsubInvoices = () => {};
    let unsubUsers = () => {};
    let unsubPartners = () => {};
    let unsubFunds = () => {};
    let unsubCashTxs = () => {};
    let unsubTransfers = () => {};
    let unsubProducts = () => {};
    let unsubBranches = () => {};
    let unsubWarehouses = () => {};
    let unsubStoreSettings = () => {};
    let unsubPurchaseOrders = () => {};
    let unsubAttendance = () => {};

    // 2. Setup real-time Firestore subscriptions. An empty snapshot is authoritative.

    unsubBranches = subscribeToBranches((remoteBranches) => {
      if (remoteBranches) {
        setBranches(remoteBranches);
      }
    });

    unsubWarehouses = subscribeToWarehouses((remoteWarehouses) => {
      setWarehouses(remoteWarehouses || []);
    });

    unsubStoreSettings = subscribeToStoreSettings((remoteSettings) => {
      if (remoteSettings) {
        setStoreSettings(remoteSettings);
      }
    });

    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUid(fbUser?.uid || null);
      setAuthReady(true);
      if (fbUser) {
        unsubUsers();
        unsubUsers = subscribeToUsers((remoteUsers) => {
          setUsers(remoteUsers || []);
          const matched = remoteUsers[0];
          if (matched) setCurrentUser({ ...matched, id: fbUser.uid, authUid: fbUser.uid });
          else setCurrentUser(null);
        }, fbUser.uid);
      } else {
        setCurrentUser(null);
      }
    });

    return () => {
      unsubAuth();
      unsubLeads();
      unsubTradeIns();
      unsubInvoices();
      unsubUsers();
      unsubPartners();
      unsubFunds();
      unsubCashTxs();
      unsubTransfers();
      unsubProducts();
      unsubBranches();
      unsubWarehouses();
      unsubStoreSettings();
      unsubPurchaseOrders();
    };
  }, []);

  // Dedicated Authoritative Attendance Realtime Subscription (Scoped dynamically to current authenticated user & role)
  useEffect(() => {
    if (!authReady || !firebaseUid || !currentUser) {
      setAttendanceRecords([]);
      return;
    }
    const role = String(currentUser.role || '').toUpperCase();
    if (role === 'ADMIN' && activeBranchId === 'ALL') return;
    const attendanceBranchId = String(scopedBranchId || currentUser.branchId || '');
    if (!attendanceBranchId) {
      setAttendanceRecords([]);
      return;
    }

    const unsubAttendance = subscribeToAttendance(
      (remoteAttendance) => {
        setAttendanceRecords(remoteAttendance || []);
      },
      {
        uid: firebaseUid,
        role: currentUser.role,
        branchId: attendanceBranchId
      },
      (err) => {
        console.warn('[Attendance subscription notice]', err?.error || err);
      }
    );

    return () => unsubAttendance();
  }, [authReady, firebaseUid, currentUser?.role, currentUser?.branchId, activeBranchId, scopedBranchId]);

  // Leave requests are also authoritative Firestore data. Managers receive the
  // branch-wide list; employees receive only documents whose staffId is their UID.
  useEffect(() => {
    if (!authReady || !firebaseUid || !currentUser) {
      setLeaveRequests([]);
      return;
    }
    const role = String(currentUser.role || '').toUpperCase();
    if (role === 'ADMIN' && activeBranchId === 'ALL') return;
    const leaveBranchId = String(scopedBranchId || currentUser.branchId || '');
    if (!leaveBranchId) {
      setLeaveRequests([]);
      return;
    }
    return subscribeToLeaveRequests(
      (items) => setLeaveRequests(items || []),
      { uid: firebaseUid, role: currentUser.role, branchId: leaveBranchId },
      (error) => console.warn('[Leave request subscription notice]', error)
    );
  }, [authReady, firebaseUid, currentUser?.role, currentUser?.branchId, activeBranchId, scopedBranchId]);

  const handleCreateLeaveRequest = async (request: LeaveRequest) => {
    const saved = await requestCreateLeaveRequest(request);
    setLeaveRequests(previous => [saved, ...previous.filter(item => item.id !== saved.id)]);
  };

  const handleApproveLeaveRequest = async (request: LeaveRequest) => {
    const updated = await requestReviewLeaveRequest(request.id, 'APPROVE');
    setLeaveRequests(previous => previous.map(item => item.id === updated.id ? updated : item));
  };

  const refreshInventorySnapshot = useCallback(async () => {
    if (!currentUser) return;
    const snapshot = await fetchInventoryDevices(currentUser);
    setDevices(snapshot.devices || []);
    setInventorySummary(snapshot.summary);
  }, [currentUser]);

  useEffect(() => {
    if (!authReady || !currentUser) return;
    let active = true;
    const refresh = async () => {
      try {
        const snapshot = await fetchInventoryDevices(currentUser);
        if (active) {
          setDevices(snapshot.devices || []);
          setInventorySummary(snapshot.summary);
        }
      } catch (error) {
        console.warn('[Inventory snapshot notice]', error);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [authReady, currentUser]);

  useEffect(() => {
    // Remove only the browser cache of the retired legacy flow; no new ticket is stored there.
    localStorage.removeItem('istore_warranty');
  }, []);

  // Operational data is scoped before it reaches the browser. A concrete
  // branch keeps its realtime listener; ADMIN/ALL receives a bounded server
  // snapshot instead of opening unrestricted collection listeners.
  useEffect(() => {
    if (!authReady || !currentUser) {
      setLeads([]); setTradeIns([]); setInvoices([]); setPartners([]); setFunds([]);
      setCashTransactions([]); setTransfers([]); setProducts([]); setPurchaseOrders([]);
      setAdminOperationalSummary(null);
      return;
    }
    const role = String(currentUser.role || '').toUpperCase();
    const mayViewAll = role === 'ADMIN';
    const isAdminAll = mayViewAll && activeBranchId === 'ALL';
    const scope = isAdminAll ? '' : String(scopedBranchId || currentUser.branchId || '');
    if (!scope && !mayViewAll) return;
    if (isAdminAll) {
      let active = true;
      const loadSnapshot = async () => {
        try {
          const snapshot = await fetchAdminOperationalSnapshot(150);
          if (!active) return;
          setLeads(snapshot.collections.leads || []);
          setTradeIns(snapshot.collections.tradeIns || []);
          setInvoices(snapshot.collections.invoices || []);
          setPartners(snapshot.collections.partners || []);
          setFunds(snapshot.collections.funds || []);
          setCashTransactions(snapshot.collections.cashTransactions || []);
          setTransfers(snapshot.collections.transfers || []);
          setPurchaseOrders(snapshot.collections.purchaseOrders || []);
          setAttendanceRecords(snapshot.collections.attendance || []);
          setLeaveRequests(snapshot.collections.leaveRequests || []);
          setUsers(snapshot.collections.users || []);
          setAdminOperationalSummary(snapshot.summary);
        } catch (error) {
          if (active) console.warn('[Operational snapshot]', error);
        }
      };
      setLeads([]); setTradeIns([]); setInvoices([]); setPartners([]); setFunds([]);
      setCashTransactions([]); setTransfers([]); setPurchaseOrders([]);
      setAttendanceRecords([]); setLeaveRequests([]);
      void loadSnapshot();
      const timer = window.setInterval(loadSnapshot, 120000);
      return () => {
        active = false;
        window.clearInterval(timer);
      };
    }
    setAdminOperationalSummary(null);
    const unsubs = [
      subscribeToLeads(items => setLeads(items || []), scope),
      subscribeToTradeIns(items => setTradeIns(items || []), scope),
      subscribeToInvoices(items => setInvoices(items || []), scope),
      subscribeToPartners(items => setPartners(items || []), scope),
      subscribeToFunds(items => setFunds(items || []), scope),
      subscribeToCashTransactions(items => setCashTransactions(items || []), scope),
      subscribeToTransfers(items => setTransfers(items || []), scope),
      subscribeToPurchaseOrders(items => setPurchaseOrders(items || []), scope)
    ];
    if (['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER'].includes(role)) {
      unsubs.push(subscribeToUsers(items => setUsers(items || []), undefined, scope));
    }
    return () => unsubs.forEach(unsubscribe => unsubscribe());
  }, [authReady, currentUser?.id, currentUser?.role, currentUser?.branchId, activeBranchId, scopedBranchId]);

  // Product metadata is global but stock is not. POS receives a redacted,
  // location-scoped projection from the inventory API instead of reading the
  // global products collection (which also contains cost fields).
  useEffect(() => {
    if (!authReady || !currentUser || !resolvedCurrentBranch.id || resolvedCurrentBranch.id === 'ALL' || !selectedPosWarehouseId) {
      setProducts([]);
      return;
    }
    let active = true;
    fetchInventoryAccessoryBalances(currentUser, selectedPosWarehouseId)
      .then(rows => {
        if (!active) return;
        setProducts(rows.map(row => ({
          id: row.productId,
          productMasterId: row.productMasterId || undefined,
          catalogGroupCode: row.catalogGroupCode || undefined,
          catalogModelCode: row.catalogModelCode || undefined,
          sku: row.sku,
          name: row.name,
          category: ['Linh kiện', 'Dịch vụ'].includes(row.category) ? row.category as 'Linh kiện' | 'Dịch vụ' : 'Phụ kiện',
          brand: row.brand || '',
          buyPrice: Number(row.currentCost || 0),
          sellPrice: Number(row.sellPrice || 0),
          stockQuantity: Number(row.availableQuantity || 0),
          minStockLevel: Number(row.minStockLevel || 0),
          status: row.status === 'inactive' ? 'inactive' : 'active',
          warehouse: row.warehouseId || undefined
        })));
      })
      .catch(error => {
        if (active) {
          setProducts([]);
          console.warn('[POS accessory stock]', error);
        }
      });
    return () => { active = false; };
  }, [activeTab, authReady, currentUser?.id, resolvedCurrentBranch.id, selectedPosWarehouseId]);

  // Keyboard shortcut ⌘K or Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsQuickSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handlers with Firestore integration
  const resolveImportDestination = (device: DeviceItem) => {
    const locationId = String(
      device.currentLocationId ||
      device.warehouseId ||
      device.warehouse ||
      resolvedCurrentBranch.warehouseId ||
      ''
    );
    const location = warehouses.find(item => String(item.id) === locationId);
    const selectedBranch = activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : '';
    const branchId = String(device.branchId || location?.branchId || selectedBranch || currentUser?.branchId || '');
    if (!locationId || !branchId) throw new Error('Không xác định được chi nhánh/kho nhận cho IMEI.');
    return { branchId, locationId };
  };

  const mergeImportedDevices = (imported: DeviceItem[]) => {
    setDevices(current => {
      const importedIds = new Set(imported.map(item => item.id));
      const importedImeis = new Set(imported.map(item => item.imei));
      return [...imported, ...current.filter(item => !importedIds.has(item.id) && !importedImeis.has(item.imei))];
    });
  };

  const handleAddDevice = async (device: DeviceItem) => {
    if (!currentUser) throw new Error('Phiên đăng nhập đã hết hạn.');
    const destination = resolveImportDestination(device);
    const result = await requestImportInventoryDevices({
      ...destination,
      sourceType: 'MANUAL_IMPORT',
      sourceId: device.batchCode || device.id,
      idempotencyKey: createInventoryIdempotencyKey('manual-import'),
      devices: [device]
    }, currentUser);
    mergeImportedDevices(result.devices);
  };

  const handleAddMultipleDevices = async (newDevices: DeviceItem[]) => {
    if (!currentUser) throw new Error('Phiên đăng nhập đã hết hạn.');
    const groups = new Map<string, { branchId: string; locationId: string; devices: DeviceItem[] }>();
    newDevices.forEach(device => {
      const destination = resolveImportDestination(device);
      const key = `${destination.branchId}::${destination.locationId}`;
      const group = groups.get(key) || { ...destination, devices: [] };
      group.devices.push(device);
      groups.set(key, group);
    });
    const imported: DeviceItem[] = [];
    for (const group of groups.values()) {
      const result = await requestImportInventoryDevices({
        branchId: group.branchId,
        locationId: group.locationId,
        sourceType: 'MANUAL_IMPORT',
        sourceId: group.devices[0]?.batchCode || `BATCH-${Date.now()}`,
        idempotencyKey: createInventoryIdempotencyKey('batch-import'),
        devices: group.devices
      }, currentUser);
      imported.push(...result.devices);
    }
    mergeImportedDevices(imported);
  };

  const handleUpdateDevice = async (device: DeviceItem) => {
    if (!currentUser) throw new Error('Phiên đăng nhập đã hết hạn.');
    const saved = await requestUpdateInventoryDeviceMetadata(device, currentUser);
    setDevices(previous => previous.map(item => item.id === saved.id ? saved : item));
  };

  const handleDeleteDevice = (id: string) => {
    const device = devices.find(item => item.id === id);
    alert(`Không thể xóa trực tiếp máy ${device?.imei || id}. Hãy hủy phiếu nhập hoặc tạo chứng từ đảo để tồn kho, IMEI và giá vốn luôn khớp.`);
  };

  const handleQuickSell = (device: DeviceItem) => {
    setPosPreSelectedDevice(device);
    setActiveTab('pos');
  };

  // Compatibility callbacks for legacy shells. CRMLeadsView creates and edits
  // through /api/crm and passes the authoritative result back here.
  const handleAddLead = (lead: Lead) => {
    setLeads(previous => [lead, ...previous.filter(item => item.id !== lead.id)]);
  };

  const handleUpdateLead = (lead: Lead) => {
    setLeads(previous => previous.map(item => item.id === lead.id ? lead : item));
  };

  const handleConvertLeadToSale = async (lead: Lead) => {
    const matched = devices.find(d => 
      d.status === 'in_stock' && 
      (d.model.toLowerCase().includes(lead.interestedModel.toLowerCase()) || 
       lead.interestedModel.toLowerCase().includes(d.model.toLowerCase()))
    );
    setPosPreSelectedDevice(matched || null);
    
    // Update Lead status to negotiating if it was new or contacted
    if (lead.status === 'new' || lead.status === 'contacted') {
      try {
        const result = await requestLeadStateTransition(lead.id, lead.status, 'negotiating');
        setLeads(prev => prev.map(item => item.id === lead.id ? { ...item, status: result.status } : item));
      } catch (error: any) {
        alert(`Không thể chuyển trạng thái khách hàng: ${error?.message || 'Yêu cầu không hợp lệ.'}`);
        return;
      }
    }
    setActiveTab('pos');
  };

  const handleAddTradeIn = async (tradeIn: TradeInAppraisal): Promise<TradeInAppraisal> => {
    const branchId = activeBranchId && activeBranchId !== 'ALL' ? String(scopedBranchId || activeBranchId) : '';
    if (!branchId) throw new Error('BRANCH_REQUIRED: Hãy chọn một chi nhánh trước khi tạo phiếu thu cũ.');
    const saved = await requestCreateTradeIn({ ...tradeIn, branchId });
    setTradeIns(current => [saved, ...current.filter(item => item.id !== saved.id)]);
    return saved;
  };

  const handleUpdateTradeIn = async (tradeIn: TradeInAppraisal): Promise<TradeInAppraisal> => {
    const saved = await requestUpdateTradeIn(tradeIn);
    setTradeIns(current => current.map(item => item.id === saved.id ? saved : item));
    return saved;
  };

  const handleCreateInvoice = (invoice: SalesInvoice) => {
    // Compatibility callback only. The POS server transaction owns every write.
    setInvoices(previous => [invoice, ...previous.filter(item => item.id !== invoice.id)]);
  };

  const handlePOSCheckoutSuccess = (
    invoice: SalesInvoice,
    devicesSold: DeviceItem[],
    accessoriesSold: { product: ProductItem; quantity: number }[]
  ) => {
    // 1. Add invoice to state (deduplicated by id, Firestore write is handled atomically in processCheckoutTransaction)
    setInvoices(prev => [invoice, ...prev.filter(i => i.id !== invoice.id)]);

    // 2. Mark sold devices in state
    const soldIds = devicesSold.map(d => d.id);
    setDevices(prev => prev.map(d => soldIds.includes(d.id) ? { ...d, status: 'sold' as const, customerName: invoice.customerName, customerPhone: invoice.customerPhone } : d));

    // 3. Decrease accessory stock in state
    if (accessoriesSold.length > 0) {
      setProducts(prev => prev.map(p => {
        const soldItem = accessoriesSold.find(acc => acc.product.id === p.id);
        if (soldItem) {
          const updatedProd = { ...p, stockQuantity: Math.max(0, p.stockQuantity - soldItem.quantity) };
          return updatedProd;
        }
        return p;
      }));
    }

    // Cash transactions and fund balances are server-authoritative. Their
    // scoped realtime listeners will receive exactly the records committed by
    // checkout; never synthesize a second receipt in browser state.
  };

  const handleUpdateInvoiceNote = async (invoiceId: string, notes: string) => {
    const invoice = await requestUpdateInvoiceNote(invoiceId, notes);
    setInvoices(previous => previous.map(item => item.id === invoice.id ? invoice : item));
    return invoice;
  };

  const handleCancelInvoice = async (invoice: SalesInvoice, reason: string) => {
    if (!invoice.branchId || invoice.branchId === 'ALL') {
      alert('Không thể hoàn tiền: hóa đơn chưa được định danh chi nhánh. Cần xử lý dữ liệu hóa đơn trước.');
      return;
    }
    // 1. Devices to restore
    const invoiceImeis = (invoice.imeiList || invoice.devices?.map(d => d.imei) || invoice.items?.map(i => i.imei) || []).filter(Boolean);
    const devicesToRestore = devices.filter(d => invoiceImeis.includes(d.imei));

    // 2. Accessories to restore
    const accessoriesToRestore: { product: ProductItem; quantity: number }[] = [];
    if (invoice.accessories && invoice.accessories.length > 0) {
      invoice.accessories.forEach(acc => {
        const prod = products.find(p => p.name === acc.name);
        if (prod) {
          accessoriesToRestore.push({ product: prod, quantity: acc.quantity || 1 });
        }
      });
    }

    // 3. Exact Refund Fund Routing
    let fundToDeduct: FundAccount | null = null;
    if (invoice.paymentFundId) {
      fundToDeduct = funds.find(f => f.id === invoice.paymentFundId && f.branchId === invoice.branchId && f.isActive !== false && f.isArchived !== true) || null;
      if (!fundToDeduct) {
        alert(`Lỗi kế toán: Không tìm thấy Quỹ gốc (Mã: ${invoice.paymentFundId}) của đơn hàng để hoàn tiền. Vui lòng kiểm tra cấu hình Quỹ.`);
        return;
      }
    } else {
      // Legacy invoice without paymentFundId: Prompt Admin to explicitly select refund fund
      const candidateFunds = invoice.branchId
        ? funds.filter(f => f.branchId === invoice.branchId && f.isArchived !== true && f.isActive !== false)
        : [];
      if (candidateFunds.length === 0) {
        alert('Không tìm thấy Quỹ nào khả dụng để hoàn tiền.');
        return;
      }
      const fundOptions = candidateFunds.map((f, idx) => `${idx + 1}. ${f.name} (Số dư: ${f.currentBalance.toLocaleString('vi-VN')}đ)`).join('\n');
      const choice = window.prompt(
        `Cảnh báo: Hóa đơn cũ (${invoice.invoiceCode || invoice.id}) không có mã Quỹ gốc.\nAdmin vui lòng nhập số thứ tự Quỹ hoàn tiền:\n${fundOptions}`,
        '1'
      );
      if (!choice) {
        alert('Đã hủy thao tác hoàn tiền.');
        return;
      }
      const selectedIndex = parseInt(choice.trim(), 10) - 1;
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= candidateFunds.length) {
        alert('Lựa chọn Quỹ không hợp lệ. Hủy thao tác hoàn tiền.');
        return;
      }
      fundToDeduct = candidateFunds[selectedIndex];
    }

    const refundAmount = invoice.paidAmount || invoice.finalAmount || 0;
    
    let refundTx: CashTransaction | null = null;
    if (refundAmount > 0) {
      refundTx = {
        id: `TX-REFUND-${Date.now()}`,
        code: `PC-REFUND-${Date.now().toString().slice(-6)}`,
        type: 'PAYMENT',
        category: 'CUSTOMER_REFUND',
        categoryName: 'Chi hoàn tiền đổi trả cho khách',
        amount: refundAmount,
        fundType: fundToDeduct?.type || 'CASH',
        fundName: fundToDeduct?.name || 'Quỹ tiền mặt',
        fundId: fundToDeduct?.id || '',
        date: new Date().toISOString().split('T')[0],
        partnerName: invoice.customerName,
        partnerPhone: invoice.customerPhone || invoice.phone,
        notes: `Hoàn tiền hủy hóa đơn ${invoice.invoiceCode || invoice.id}: ${reason}`,
        branchId: invoice.branchId,
        creator: currentUser?.displayName || 'Admin',
        status: 'COMPLETED',
        referenceCode: invoice.invoiceCode || invoice.id
      };
    }

    const customerPartner = partners.find(p => p.phone === invoice.customerPhone) || null;

    try {
      const refundResult = await cancelInvoiceInFirestore({
        invoiceId: invoice.id,
        branchId: invoice.branchId || '',
        cancelledBy: currentUser?.displayName || 'Admin',
        reason,
        devicesToRestore,
        accessoriesToRestore,
        refundTx,
        fundToDeduct,
        customerPartner
      });

      // Update local state
      setInvoices(prev => prev.map(inv => inv.id === invoice.id ? {
        ...inv,
        status: 'cancelled',
        cancellationReason: reason,
        cancelledBy: currentUser?.displayName || 'Admin',
        cancelledAt: new Date().toISOString()
      } : inv));

      if (devicesToRestore.length > 0) {
        setDevices(prev => prev.map(d => {
          if (devicesToRestore.some(r => r.id === d.id)) {
            return { ...d, status: 'in_stock', customerName: undefined, customerPhone: undefined };
          }
          return d;
        }));
      }

      if (accessoriesToRestore.length > 0) {
        setProducts(prev => prev.map(product => {
          const restored = accessoriesToRestore.find(item => item.product.id === product.id);
          return restored ? { ...product, stockQuantity: product.stockQuantity + restored.quantity } : product;
        }));
      }

      const savedRefundTx = refundResult.data.refundTransaction;
      if (savedRefundTx) {
        setCashTransactions(prev => [savedRefundTx, ...prev.filter(tx => tx.id !== savedRefundTx.id)]);
        if (fundToDeduct) {
          setFunds(prev => prev.map(f => f.id === fundToDeduct.id ? {
            ...f,
            currentBalance: f.currentBalance - refundAmount,
            totalExpense: (f.totalExpense || 0) + refundAmount
          } : f));
        }
      }

      alert(`✅ Đã hủy hóa đơn ${invoice.invoiceCode} và tự động hoàn trả kho/sổ quỹ thành công!`);
    } catch (err: any) {
      console.error('Lỗi khi hủy hóa đơn:', err);
      alert(`Không thể hủy hóa đơn: ${err?.message || 'Lỗi không xác định'}`);
    }
  };

  const handleAddUser = (newUser: UserAccount) => {
    setUsers([newUser, ...users]);
  };

  const handleUpdateUser = (updatedUser: UserAccount) => {
    setUsers(users.map(u => (u.id === updatedUser.id ? updatedUser : u)));
  };

  const handleDeleteUser = (userId: string) => {
    setUsers(users.filter(u => u.id !== userId));
  };

  const handleAddPartner = async (newPartner: Partner) => {
    const saved = await addPartnerToFirestore(newPartner);
    setPartners(previous => [saved, ...previous.filter(partner => partner.id !== saved.id)]);
    return saved;
  };

  const handleUpdatePartner = async (updatedPartner: Partner) => {
    const saved = await updatePartnerInFirestore(updatedPartner);
    setPartners(previous => previous.map(partner => partner.id === saved.id ? saved : partner));
  };

  const handleDeletePartner = async (partnerId: string) => {
    await deletePartnerFromFirestore(partnerId);
    setPartners(previous => previous.filter(partner => partner.id !== partnerId));
  };

  const handleAddCashTransaction = (newTx: CashTransaction) => {
    setCashTransactions(prev => [newTx, ...prev.filter(tx => tx.id !== newTx.id)]);
    void addCashTransactionToFirestore(newTx)
      .then(savedTx => {
        setCashTransactions(prev => [savedTx, ...prev.filter(tx => tx.id !== newTx.id && tx.id !== savedTx.id)]);
      })
      .catch((err: any) => {
        setCashTransactions(prev => prev.filter(tx => tx.id !== newTx.id));
        console.error('Error adding cash transaction:', err);
        alert('Không thể ghi sổ: ' + (err?.message || 'Giao dịch không hợp lệ.'));
      });
  };

  const handleOpenDebtReference = (transaction: PartnerDebtTransaction) => {
    const reference = String(transaction.referenceId || transaction.referenceCode || '').trim();
    const purchaseOrder = purchaseOrders.find(order => order.id === reference || order.code === reference || order.code === transaction.referenceCode);
    const invoice = invoices.find(item => item.id === reference || item.invoiceCode === reference || item.invoiceCode === transaction.referenceCode);
    if (transaction.referenceType === 'PURCHASE_ORDER' || (!invoice && purchaseOrder)) {
      if (!purchaseOrder) return alert('Không tìm thấy phiếu nhập hàng gốc. Chứng từ có thể là dữ liệu cũ chưa đủ mã liên kết.');
      if (purchaseOrder.branchId) setSelectedBranchId(purchaseOrder.branchId);
      setLinkedPurchaseOrderId(purchaseOrder.id);
      setActiveTab('purchase-orders');
      return;
    }
    if (invoice) {
      if (invoice.branchId) setSelectedBranchId(invoice.branchId);
      setLinkedInvoiceId(invoice.id);
      setActiveTab('invoices');
      return;
    }
    alert('Không tìm thấy hóa đơn hoặc phiếu nhập gốc cho dòng công nợ này.');
  };

  const handleSaveFund = async (fund: FundAccount, isNew: boolean) => {
    try {
      const saved = isNew
        ? await addFundToFirestore(fund)
        : await updateFundInFirestore(fund);
      setFunds(prev => [saved, ...prev.filter(item => item.id !== saved.id)]);
    } catch (err: any) {
      console.error('Error saving finance account:', err);
      alert('Không thể lưu tài khoản: ' + (err?.message || 'Dữ liệu không hợp lệ.'));
      throw err;
    }
  };

  const handleDeleteFund = async (fundId: string) => {
    await deleteFundFromFirestore(fundId);
    setFunds(previous => previous.filter(fund => fund.id !== fundId));
  };

  // Transfer writes and device movements are server-authoritative. This only keeps
  // the optimistic view in sync until the Firestore subscription delivers the same record.
  const handleTransferServerSync = (transfer: StockTransferSlip) => {
    setTransfers(previous => {
      const exists = previous.some(item => item.id === transfer.id);
      return exists
        ? previous.map(item => item.id === transfer.id ? transfer : item)
        : [transfer, ...previous];
    });
  };

  const handleTransferFunds = async (
    fromFundId: string, 
    toFundId: string, 
    amount: number, 
    notes: string, 
    creator: string = 'Nhật Tân (Admin)'
  ) => {
    const fromFund = funds.find(f => f.id === fromFundId || f.name === fromFundId);
    const toFund = funds.find(f => f.id === toFundId || f.name === toFundId);
    if (!fromFund || !toFund) return;

    try {
      const { txOut, txIn } = await executeFundTransferInFirestore(fromFund, toFund, amount, notes, creator);
      setCashTransactions(prev => [txIn, txOut, ...prev]);
      setFunds(prevFunds => prevFunds.map(f => {
        if (f.id === fromFund.id) {
          return {
            ...f,
            currentBalance: f.currentBalance - amount,
            totalExpense: (f.totalExpense || 0) + amount
          };
        }
        if (f.id === toFund.id) {
          return {
            ...f,
            currentBalance: f.currentBalance + amount,
            totalIncome: (f.totalIncome || 0) + amount
          };
        }
        return f;
      }));
    } catch (err) {
      console.error('Error transferring funds:', err);
    }
  };

  const handleAddBranch = async (newBranch: StoreBranch) => {
    try {
      const saved = await addBranchToFirestore(newBranch, branches);
      setBranches(previous => [saved, ...previous.filter(branch => branch.id !== saved.id)]);
    } catch (err: any) {
      console.error('Error adding branch:', err);
      alert('Lỗi lưu chi nhánh: ' + (err?.message || 'Không có quyền thực hiện.'));
      throw err;
    }
  };

  const handleUpdateBranch = async (updatedBranch: StoreBranch) => {
    try {
      const saved = await updateBranchInFirestore(updatedBranch, branches);
      setBranches(previous => previous.map(branch => branch.id === saved.id ? saved : branch));
    } catch (err: any) {
      console.error('Error updating branch:', err);
      alert('Lỗi cập nhật chi nhánh: ' + (err?.message || 'Không có quyền thực hiện (Yêu cầu quyền ADMIN).'));
      throw err;
    }
  };

  const handleDeleteBranch = async (branchId: string) => {
    await deleteBranchFromFirestore(branchId);
    setBranches(previous => previous.filter(branch => branch.id !== branchId));
  };

  const handleAddWarehouse = async (newWarehouse: WarehouseInfo) => {
    const saved = await addWarehouseToFirestore(newWarehouse);
    setWarehouses(prev => [saved, ...prev.filter(w => w.id !== saved.id)]);
  };

  const handleUpdateWarehouse = async (updatedWarehouse: WarehouseInfo) => {
    const saved = await updateWarehouseInFirestore(updatedWarehouse);
    setWarehouses(prev => prev.map(w => w.id === saved.id ? saved : w));
  };

  const handleDeleteWarehouse = async (warehouseId: string) => {
    await deleteWarehouseFromFirestore(warehouseId);
    setWarehouses(prev => prev.filter(w => w.id !== warehouseId));
  };

  const handleRestoreWarehouse = async (warehouseId: string) => {
    const restored = await restoreWarehouseFromFirestore(warehouseId);
    setWarehouses(prev => prev.map(w => w.id === restored.id ? restored : w));
  };

  const handleSaveStoreSettings = async (newSettings: StoreSettings) => {
    const saved = await saveStoreSettingsToFirestore(newSettings);
    setStoreSettings(previous => ({ ...previous, ...saved, branches, warehouses }));
  };

  // ==========================================
  // PURCHASE ORDERS (NHẬP HÀNG & NCC) HANDLERS
  // ==========================================
  const handleAddPurchaseOrder = async (order: PurchaseOrder, autoCreateDevices: boolean) => {
    if (!currentUser) throw new Error('Phiên đăng nhập đã hết hạn. Phiếu chưa được tạo.');
    if (!autoCreateDevices || order.status !== 'COMPLETED') {
      throw new Error('Phiếu nhập kho chỉ được ghi khi đã hoàn tất và có danh sách hàng đầy đủ.');
    }
    const receipt = await requestReceivePurchaseOrder(order, currentUser);
    setPurchaseOrders(prev => [receipt.order, ...prev.filter(item => item.id !== receipt.order.id)]);
    mergeImportedDevices(receipt.devices);
    return receipt.order;
  };

  const handleUpdatePurchaseOrder = async (updatedOrder: PurchaseOrder) => {
    if (!currentUser) throw new Error('Phiên đăng nhập đã hết hạn.');
    const saved = await requestUpdatePurchaseOrderNote(updatedOrder.id, updatedOrder.notes || '', currentUser);
    setPurchaseOrders(previous => previous.map(order => order.id === saved.id ? { ...order, ...saved } : order));
    return saved;
  };

  const handleDeletePurchaseOrder = async (orderId: string) => {
    if (!currentUser) throw new Error('Phiên đăng nhập đã hết hạn.');
    const result = await requestCancelPurchaseOrder(orderId, 'Hủy phiếu nhập từ màn hình quản lý', currentUser);
    setPurchaseOrders(prev => prev.map(order => order.id === orderId ? result.order : order));
    if (result.removedDeviceIds.length > 0) {
      const removedIds = new Set(result.removedDeviceIds);
      setDevices(prev => prev.filter(device => !removedIds.has(device.id)));
    }
  };

  
  const handleSettlePartnerDebt = async (input: {
    partnerId: string;
    amount: number;
    fundId: string;
    direction: PartnerDebtSettlementDirection;
    note: string;
    idempotencyKey: string;
  }) => {
    const result = await requestSettlePartnerDebt(input);
    setPartners(previous => previous.map(partner => partner.id === result.partner.id ? result.partner : partner));
    setFunds(previous => previous.map(fund => fund.id === result.fund.id ? result.fund : fund));
    setCashTransactions(previous => [result.cashTransaction, ...previous.filter(transaction => transaction.id !== result.cashTransaction.id)]);

    const purchaseUpdates = new Map(result.allocations.filter(item => item.sourceType === 'PURCHASE_ORDER').map(item => [item.sourceId, item]));
    const invoiceUpdates = new Map(result.allocations.filter(item => item.sourceType === 'INVOICE').map(item => [item.sourceId, item]));
    setPurchaseOrders(previous => previous.map(order => {
      const update = purchaseUpdates.get(order.id);
      return update ? { ...order, paidAmount: update.paidAmount, debtAmount: update.remainingDebt, paymentStatus: update.paymentStatus } : order;
    }));
    setInvoices(previous => previous.map(invoice => {
      const update = invoiceUpdates.get(invoice.id);
      return update ? { ...invoice, paidAmount: update.paidAmount, debtAmount: update.remainingDebt, paymentStatus: update.paymentStatus } : invoice;
    }));
    return result.partner;
  };

  const handleInstallmentDisbursement = async (input: {
    invoiceId: string;
    fundId: string;
    receivedAmount: number;
    feeAmount: number;
    note: string;
    idempotencyKey: string;
  }) => {
    const result = await requestInstallmentDisbursement(input);
    setInvoices(previous => previous.map(invoice => invoice.id === result.invoice.id ? result.invoice : invoice));
    setFunds(previous => previous.map(fund => fund.id === result.fund.id ? result.fund : fund));
    setPartners(previous => previous.map(partner => partner.id === result.financePartner.id ? result.financePartner : partner));
    setCashTransactions(previous => [
      ...result.cashTransactions,
      ...previous.filter(transaction => !result.cashTransactions.some(created => created.id === transaction.id))
    ]);
  };

  const handlePaySupplierDebt = async (orderId: string, _supplierId: string, amount: number, fundId: string, note: string, idempotencyKey: string) => {
    if (!currentUser) throw new Error('Phiên đăng nhập đã hết hạn. Chưa ghi nhận thanh toán.');
    const targetFund = funds.find(f => f.id === fundId);
    if (!targetFund) {
      throw new Error(`Không tìm thấy quỹ thanh toán ${fundId}.`);
    }
    const method = targetFund.type === 'CASH' ? 'CASH' : 'BANK_TRANSFER';
    const result = await requestPayPurchaseOrderDebt(orderId, [{ fundId, method, amount }], note, currentUser, idempotencyKey);
    setPurchaseOrders(prev => prev.map(order => order.id === orderId ? result.order : order));
    return result.order;
  };

  const handleUpdateDeviceStatus = (
    imei: string, 
    status: DeviceItem['status'], 
    customerName?: string, 
    phone?: string
  ) => {
    const updated = devices.map(d => {
      if (d.imei === imei) {
        const updatedItem = {
          ...d,
          status,
          customerName: customerName || d.customerName,
          customerPhone: phone || d.customerPhone,
          soldDate: status === 'sold' ? new Date().toISOString().split('T')[0] : d.soldDate
        };
        return updatedItem;
      }
      return d;
    });
    setDevices(updated);
  };

  const setupRole = String(currentUser?.role || '').toUpperCase();
  const setupBlockedForStaff = Boolean(
    currentUser && systemSetupStatus && !systemSetupStatus.complete && setupRole !== 'ADMIN' && setupRole !== 'MANAGER'
  );

  if (setupBlockedForStaff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <MapPin className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-black text-zinc-900">Hệ thống chưa hoàn tất khởi tạo</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">Quản trị viên cần hoàn tất Chi nhánh, Kho, tài khoản tài chính, SOP, Task kỹ thuật, Sales và CSKH trước khi nhân viên có thể vận hành.</p>
          <button onClick={handleLogout} className="mt-6 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-black text-white">Đăng xuất</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <GeofenceBackgroundTracker
        currentUser={currentUser}
        isCheckedIn={Boolean(currentAttendance?.checkInTime && !currentAttendance?.checkOutTime)}
      />

      <AppShell
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        currentUser={currentUser ? {
          id: currentUser.id,
          uid: currentUser.id,
          name: currentUser.displayName,
          email: currentUser.email,
          role: currentUser.role,
          branchId: currentUser.branchId || '',
          assignedBranchIds: currentUser.assignedBranchIds || [currentUser.branchId || ''].filter(Boolean),
          isActive: currentUser.active
        } : null}
        currentBranch={resolvedCurrentBranch}
        branches={branches}
        selectedBranchId={selectedBranchId}
        onSelectBranchId={(id) => setSelectedBranchId(id)}
        onSelectBranch={(b) => setSelectedBranchId(b.id)}
        onLogout={handleLogout}
        onOpenQuickSearch={() => setIsQuickSearchOpen(true)}
      >
        <React.Suspense fallback={<PageLoadingFallback />}>
        {activeTab === 'login' && (
          <PhoneHouseLoginPage
            users={users}
            currentUser={currentUser}
            onLoginSuccess={(loggedUser) => {
              setCurrentUser(loggedUser);
              setActiveTab('dashboard');
            }}
          />
        )}

        {activeTab === 'dashboard' && (
          <DashboardPage
            invoices={filteredInvoices}
            devices={filteredDevices}
            leads={filteredLeads}
            warrantyTickets={filteredWarrantyTickets}
            funds={filteredFunds}
            partners={filteredPartners}
            branches={branches}
            users={filteredUsers}
            selectedBranchId={activeBranchId}
            currentUser={currentUser ? {
              id: currentUser.id,
              uid: currentUser.id,
              name: currentUser.displayName,
              displayName: currentUser.displayName,
              email: currentUser.email,
              role: currentUser.role,
              branchId: currentUser.branchId,
              branch: (currentUser as any).branch,
              assignedBranchIds: currentUser.assignedBranchIds || (currentUser.branchId ? [currentUser.branchId] : []),
              isActive: currentUser.active,
              kpiTargetRevenue: currentUser.kpiTargetRevenue,
              kpiTargetOrders: currentUser.kpiTargetOrders,
              kpiTargetWarranty: currentUser.kpiTargetWarranty,
              baseSalary: currentUser.baseSalary
            } as any : null}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onOpenAICopilot={() => setIsAICopilotOpen(true)}
            systemDataCoverage={activeBranchId === 'ALL' && adminOperationalSummary ? {
              partialDomainCount: (Object.keys(adminOperationalSummary) as Array<keyof typeof adminOperationalSummary>)
                .filter(key => adminOperationalSummary[key].partial).length,
              invoiceLoaded: adminOperationalSummary.invoices.loaded,
              invoiceTotal: adminOperationalSummary.invoices.total
            } : undefined}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsPage
            invoices={filteredInvoices}
            devices={filteredDevices}
            warrantyTickets={filteredWarrantyTickets}
            funds={filteredFunds}
            cashTransactions={filteredCashTransactions}
            branches={branches}
            selectedBranchId={selectedBranchId}
            currentUser={currentUser ? {
              id: currentUser.id,
              uid: currentUser.id,
              name: currentUser.displayName,
              email: currentUser.email,
              role: currentUser.role,
              branchId: currentUser.branchId || '',
              assignedBranchIds: currentUser.assignedBranchIds || [currentUser.branchId || ''].filter(Boolean),
              isActive: currentUser.active
            } : null}
          />
        )}

        {activeTab === 'purchase-orders' && (
          <PurchaseOrdersView
            purchaseOrders={filteredPurchaseOrders}
            partners={filteredPartners}
            warehouses={warehouses}
            funds={filteredFunds}
            branches={branches}
            selectedBranchId={selectedBranchId}
            currentUser={currentUser}
            onAddPurchaseOrder={handleAddPurchaseOrder}
            onUpdatePurchaseOrder={handleUpdatePurchaseOrder}
            onDeletePurchaseOrder={handleDeletePurchaseOrder}
            onPaySupplierDebt={handlePaySupplierDebt}
            initialSelectedOrderId={linkedPurchaseOrderId}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            currentUser={currentUser}
            serverSummary={inventorySummary}
            devices={devices}
            branches={branches}
            warehouses={warehouses}
            partners={filteredPartners}
            funds={filteredFunds}
            transfers={transfers}
            warrantyTickets={warrantyTickets}
            invoices={invoices}
            users={filteredUsers}
            selectedBranchId={selectedBranchId}
            onSelectBranchId={setSelectedBranchId}
            onAddDevice={handleAddDevice}
            onAddMultipleDevices={handleAddMultipleDevices}
            onAddPurchaseOrder={handleAddPurchaseOrder}
            onUpdateDevice={handleUpdateDevice}
            onDeleteDevice={handleDeleteDevice}
            onQuickSell={(device) => {
              setPosPreSelectedDevice(device);
              setPosCustomerContext(null);
              setPosTradeInContext(null);
              setActiveTab('pos');
            }}
            onOpenTransferModal={() => setActiveTab('transfers')}
            onAddCashTransaction={handleAddCashTransaction}
            onUpdatePartner={handleUpdatePartner}
            onAddPartner={handleAddPartner}
          />
        )}

        {activeTab === 'transfers' && (
          <WarehouseTransfersView
            transfers={currentUser.role === 'ADMIN' ? transfers : filteredTransfers}
            currentUser={currentUser}
            devices={currentUser.role === 'ADMIN' ? devices : filteredDevices}
            warehouses={warehouses}
            branches={branches}
            onTransferSynced={handleTransferServerSync}
            onInventoryRefresh={refreshInventorySnapshot}
          />
        )}

        {activeTab === 'master-catalog' && (
          <MasterCatalogView
            currentUser={currentUser}
            partners={filteredPartners}
            branches={branches}
            warehouses={warehouses}
            funds={filteredFunds}
            onAddPurchaseOrder={handleAddPurchaseOrder}
          />
        )}

        {(activeTab === 'products' || activeTab === 'spare-parts') && (
          <PartsInventoryHub
            products={products}
            warehouses={warehouses}
            partners={filteredPartners}
            branches={branches}
            funds={filteredFunds}
            currentUser={currentUser}
            preferredSection={activeTab === 'spare-parts' ? 'technical' : undefined}
            onAddPurchaseOrder={handleAddPurchaseOrder}
            onOpenPurchaseOrders={() => setActiveTab('purchase-orders')}
          />
        )}

        {activeTab === 'crm' && (
          <React.Suspense fallback={<div className="rounded-3xl bg-white p-12 text-center text-sm font-bold text-zinc-500">Đang mở trung tâm chăm sóc khách hàng…</div>}>
          <CRMLeadsView
            currentUser={currentUser}
            branches={branches}
            users={users}
            leads={filteredLeads}
            devices={filteredDevices}
            invoices={filteredInvoices}
            warrantyTickets={filteredWarrantyTickets}
            onAddLead={handleAddLead}
            onUpdateLead={handleUpdateLead}
            onConvertLeadToSale={(lead) => {
              setPosCustomerContext({ name: lead.name, phone: lead.phone });
              if (lead.interestedModel) {
                const found = devices.find(device => device.status === 'in_stock' && device.model.toLowerCase().includes(lead.interestedModel.toLowerCase()));
                if (found) setPosPreSelectedDevice(found);
              }
              setActiveTab('pos');
            }}
            onNavigateToOmnichannelChat={() => setActiveTab('omnichannel-chat')}
          />
          </React.Suspense>
        )}

        {(activeTab === 'omnichannel-chat' || activeTab === 'chat') && (
          <OmnichannelChatView
            devices={filteredDevices}
            currentBranchId={resolvedCurrentBranch?.id || currentUser?.branchId}
            currentUserRole={currentUser?.role}
            currentUserId={currentUser?.id}
            currentUserName={currentUser?.displayName}
            onConvertToPOS={(conversation, selectedDevice) => {
              if (selectedDevice) {
                setPosPreSelectedDevice(selectedDevice);
              }
              setPosCustomerContext({
                name: conversation.customerName,
                phone: conversation.customerPhone
              });
              setPosTradeInContext(null);
              setActiveTab('pos');
            }}
          />
        )}

        {activeTab === 'channel-connections' && (
          <ChannelConnectionsView
            branches={branches}
            currentUserRole={currentUser?.role}
          />
        )}

        {activeTab === 'tradein' && (
          <TradeInCockpitView
            devices={filteredDevices}
            warehouses={warehouses}
            currentBranch={resolvedCurrentBranch}
            currentUser={currentUser ? {
              id: currentUser.id,
              uid: currentUser.id,
              name: currentUser.displayName,
              email: currentUser.email,
              role: currentUser.role,
              branchId: currentUser.branchId || '',
              assignedBranchIds: currentUser.assignedBranchIds || [currentUser.branchId || ''].filter(Boolean),
              isActive: currentUser.active
            } : null}
            onCompleteTradeInToPOS={async (appraisal, targetDevice) => {
              try {
                const saved = await handleAddTradeIn(appraisal);
                if (saved.status !== 'accepted') {
                  window.alert('Phiếu thu cũ đã được lưu ở trạng thái chờ quản lý duyệt giá. Chỉ phiếu đã duyệt mới được trừ vào hóa đơn POS.');
                  return;
                }
              if (targetDevice) setPosPreSelectedDevice(targetDevice);
              setPosCustomerContext({
                  name: saved.customerName || 'Khách Thu Cũ',
                  phone: saved.phone || ''
              });
                setPosTradeInContext(saved);
              setActiveTab('pos');
              } catch (error: any) {
                window.alert(error?.message || 'Không lưu được phiếu thu cũ.');
              }
            }}
          />
        )}

        {activeTab === 'warranty' && <RetailRepairView currentUser={currentUser} branches={branches} funds={filteredFunds} refreshKey={retailRepairRefreshKey} onOpenIntake={() => setIsRepairIntakeOpen(true)} onOpenTechDesk={() => setActiveTab('tech-workspace')} />}

        {activeTab === 'pos' && (
          <POSCockpitView
            devices={filteredDevices}
            products={products}
            funds={filteredFunds}
            partners={filteredPartners}
            currentBranch={resolvedCurrentBranch}
            warehouses={activePosWarehouses}
            selectedWarehouseId={selectedPosWarehouseId}
            onWarehouseChange={setSelectedPosWarehouseId}
            currentUser={currentUser ? {
              id: currentUser.id,
              uid: currentUser.id,
              name: currentUser.displayName,
              email: currentUser.email,
              role: currentUser.role,
              branchId: currentUser.branchId || '',
              assignedBranchIds: currentUser.assignedBranchIds || [currentUser.branchId || ''].filter(Boolean),
              isActive: currentUser.active
            } : null}
            preSelectedDevice={posPreSelectedDevice}
            initialCustomer={posCustomerContext}
            tradeInAppraisal={posTradeInContext}
            onNavigateToInvoices={() => setActiveTab('invoices')}
            onAddPartner={handleAddPartner}
            onCheckoutSuccess={handlePOSCheckoutSuccess}
          />
        )}

        {activeTab === 'invoices' && (
          <InvoicesView
            invoices={filteredInvoices}
            devices={filteredDevices}
            branches={branches}
            warehouses={warehouses}
            onNavigateToPOS={() => {
              setPosPreSelectedDevice(null);
              setActiveTab('pos');
            }}
            onUpdateInvoiceNote={handleUpdateInvoiceNote}
            onCancelInvoice={handleCancelInvoice}
            initialSelectedInvoiceId={linkedInvoiceId}
          />
        )}

        {activeTab === 'installments' && (
          <InstallmentReconciliationView
            invoices={filteredInvoices}
            funds={filteredFunds}
            onConfirmDisbursement={handleInstallmentDisbursement}
          />
        )}

        {(activeTab === 'funds' || activeTab === 'cashbook') && (
          <CashbookView
            currentUser={currentUser}
            branches={branches}
            selectedBranchId={selectedBranchId}
            transactions={filteredCashTransactions}
            funds={filteredFunds}
            partners={filteredPartners}
            onAddTransaction={handleAddCashTransaction}
            onAddPartner={handleAddPartner}
            onSaveFund={handleSaveFund}
            onDeleteFund={handleDeleteFund}
            onTransferFunds={handleTransferFunds}
          />
        )}

        {activeTab === 'partners' && (
          <PartnersView
            partners={filteredPartners}
            branches={branches}
            selectedBranchId={selectedBranchId}
            devices={filteredDevices}
            onAddPartner={handleAddPartner}
            onUpdatePartner={handleUpdatePartner}
            onDeletePartner={handleDeletePartner}
            onSettleDebt={handleSettlePartnerDebt}
            onOpenInstallmentReconciliation={() => setActiveTab('installments')}
            funds={filteredFunds}
            onOpenReference={handleOpenDebtReference}
          />
        )}

        {(activeTab === 'store-settings' || activeTab === 'sop-management' || activeTab === 'sop') && (
          <SystemSettingsHub
            initialTab={activeTab === 'sop-management' || activeTab === 'sop' ? 'sop' : 'overview'}
            onNavigate={setActiveTab}
            onSetupStatusChange={setSystemSetupStatus}
            branches={branches}
            warehouses={warehouses}
            settings={storeSettings}
            funds={filteredFunds}
            invoices={invoices}
            devices={devices}
            products={products}
            warrantyTickets={warrantyTickets}
            attendanceRecords={attendanceRecords}
            staffMembers={staffMembers}
            currentUser={currentUser ? {
              ...currentUser,
              branchId: activeBranchId === 'ALL' ? '' : String(scopedBranchId || currentUser.branchId || '')
            } : null}
            onAddBranch={handleAddBranch}
            onUpdateBranch={handleUpdateBranch}
            onDeleteBranch={handleDeleteBranch}
            onAddWarehouse={handleAddWarehouse}
            onUpdateWarehouse={handleUpdateWarehouse}
            onDeleteWarehouse={handleDeleteWarehouse}
            onRestoreWarehouse={handleRestoreWarehouse}
            onSaveSettings={handleSaveStoreSettings}
          />
        )}

        {activeTab === 'more' && (
          <MoreHubView
            currentUser={currentUser}
            onSelectTab={(tabId) => setActiveTab(tabId)}
            onOpenPOSModal={() => {
              setPosPreSelectedDevice(null);
              setActiveTab('pos');
            }}
            onOpenNewDeviceModal={() => setActiveTab('inventory')}
            onOpenAICopilot={() => setIsAICopilotOpen(true)}
            onOpenLoginModal={() => setIsLoginModalOpen(true)}
            onLogout={handleLogout}
            partners={filteredPartners}
            invoices={filteredInvoices}
            devices={filteredDevices}
          />
        )}

        {activeTab === 'users' && (
          <UserManagementView
            users={users}
            branches={branches}
            currentUserEmail={currentUser?.email}
            onAddUser={handleAddUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
          />
        )}

        {activeTab === 'checkin-portal' && (
          <StandaloneCheckInView
            currentUser={currentUser}
            staffList={staffMembers}
            branches={branches}
            attendanceRecords={attendanceRecords}
            onCheckInSuccess={async (record) => {
              return await handleCheckIn(record);
            }}
            onClose={() => setActiveTab('dashboard')}
            onNavigateToHR={() => setActiveTab('hr-attendance')}
          />
        )}

        {(activeTab === 'hr-attendance' || activeTab === 'shift-scheduling' || activeTab === 'payroll' || activeTab === 'attendance' || activeTab === 'attendance-log' || activeTab === 'attendance-management') && (
          <HRHubView
            currentUser={currentUser}
            staffList={staffMembers}
            attendanceRecords={attendanceRecords}
            leaveRequests={leaveRequests}
            invoices={filteredInvoices}
            warrantyTickets={filteredWarrantyTickets}
            branches={branches}
            initialSubModule={activeTab === 'shift-scheduling' ? 'SHIFTS' : activeTab === 'payroll' ? 'PAYROLL' : undefined}
            onApproveLeave={handleApproveLeaveRequest}
          />
        )}

        {activeTab === 'staff-hr' && (
          <StaffHRView
            currentUser={currentUser}
            roleType={currentUser?.role === 'TECHNICIAN' || currentUser?.role === 'TECH' ? 'TECH' : 'SALES'}
            branches={branches}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
            checkedInState={!!currentAttendance?.checkInTime}
            initialCheckInTime={currentAttendance?.checkInTime || null}
            attendanceRecord={currentAttendance}
            leaveRequests={leaveRequests}
            onCreateLeaveRequest={handleCreateLeaveRequest}
            onOpenCheckInModal={() => setActiveTab('checkin-portal')}
          />
        )}

        {activeTab === 'tech-workspace' && (
          <TechWorkspaceView
            currentUser={currentUser}
            devices={filteredDevices}
            branches={branches}
            warehouses={warehouses}
            funds={filteredFunds}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
            onOpenCheckIn={() => setActiveTab('checkin-portal')}
            attendanceRecord={currentAttendance}
          />
        )}

        {activeTab === 'sales-workspace' && (
          <SalesWorkspaceView
            currentUser={currentUser}
            users={users}
            devices={filteredDevices}
            branches={branches}
            invoices={filteredInvoices}
            leads={filteredLeads}
            warrantyTickets={filteredWarrantyTickets}
            warehouses={warehouses}
            storeSettings={storeSettings}
            onCreateInvoice={handleCreateInvoice}
            onUpdateDeviceStatus={handleUpdateDeviceStatus}
            preSelectedDevice={posPreSelectedDevice}
            onNavigateToInvoices={() => setActiveTab('invoices')}
            onOpenPOS={() => setActiveTab('pos')}
            funds={filteredFunds}
            onAddTransaction={handleAddCashTransaction}
            onOpenNewDeviceModal={() => setActiveTab('inventory')}
            onOpenCheckIn={() => setActiveTab('checkin-portal')}
            onAddLead={handleAddLead}
            onUpdateLead={handleUpdateLead}
            onConvertLeadToSale={handleConvertLeadToSale}
            attendanceRecord={currentAttendance}
            attendanceRecords={attendanceRecords}
            tradeIns={filteredTradeIns}
            onAddTradeIn={handleAddTradeIn}
            onUpdateTradeIn={handleUpdateTradeIn}
            onAddDevice={handleAddDevice}
          />
        )}
        </React.Suspense>
      </AppShell>

      <RepairIntakeModal
        isOpen={isRepairIntakeOpen}
        onClose={() => setIsRepairIntakeOpen(false)}
        branches={branches}
        warehouses={warehouses}
        devices={devices}
        users={users}
        currentUser={currentUser}
        onCreated={async () => { setRetailRepairRefreshKey(value => value + 1); setActiveTab('warranty'); }}
      />

      {/* Floating AI Copilot Button */}
      <button
        onClick={() => setIsAICopilotOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-50 bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white shadow-lg shadow-orange-500/40 rounded-full w-12 h-12 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
        title="AI Copilot"
      >
        <Sparkles className="w-5 h-5 animate-pulse" />
      </button>

      {/* Quick Search Modal */}
      <QuickSearchModal
        isOpen={isQuickSearchOpen}
        onClose={() => setIsQuickSearchOpen(false)}
        devices={devices}
        leads={leads}
        warrantyTickets={warrantyTickets}
        invoices={invoices}
        onSelectDevice={() => setActiveTab('inventory')}
        onSelectLead={() => setActiveTab('crm')}
        onSelectWarranty={() => setActiveTab('warranty')}
        onSelectInvoice={() => setActiveTab('invoices')}
      />

      {/* AI Assistant Copilot Modal */}
      <AICopilotModal
        isOpen={isAICopilotOpen}
        onClose={() => setIsAICopilotOpen(false)}
      />

      {/* Executive AI Voice Assistant Modal (Idea 1) */}
      <ExecutiveAIAssistantModal
        isOpen={isExecutiveAIOpen}
        onClose={() => setIsExecutiveAIOpen(false)}
        invoices={filteredInvoices}
        devices={filteredDevices}
        funds={filteredFunds}
        warrantyTickets={filteredWarrantyTickets}
        attendanceRecords={attendanceRecords}
        staffMembers={staffMembers}
      />

      {/* Phone House Dedicated Login Modal */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/75 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-xl">
            <button
              onClick={() => setIsLoginModalOpen(false)}
              className="absolute -top-3 -right-3 sm:-top-4 sm:-right-4 w-9 h-9 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full flex items-center justify-center border border-zinc-600 shadow-xl z-20 transition-transform hover:scale-110 cursor-pointer"
              title="Đóng"
            >
              ✕
            </button>
            <PhoneHouseLoginPage
  users={users}
  currentUser={currentUser}
  isModal={true}
  onClose={() => setIsLoginModalOpen(false)}
              onLoginSuccess={(loggedUser) => {
                setCurrentUser(loggedUser);
                setIsLoginModalOpen(false);
              }}
            />
          </div>
        </div>
      )}


      {/* GLOBAL FACE ID CHECK-IN MODAL (Accessible across all roles) */}
      {isCheckInModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-zinc-950/80 backdrop-blur-sm animate-fadeIn overflow-y-auto">
          <div className="relative w-full max-w-4xl max-h-[95vh] overflow-y-auto bg-zinc-50 rounded-3xl shadow-2xl border border-zinc-700 my-auto">
            <StandaloneCheckInView
              currentUser={currentUser}
            branches={branches}
            attendanceRecords={attendanceRecords}
              onCheckInSuccess={async (record) => {
                return await handleCheckIn(record);
              }}
              onClose={() => setIsCheckInModalOpen(false)}
              onNavigateToHR={() => {
                setIsCheckInModalOpen(false);
                if (workspaceMode === 'ADMIN') {
                  setActiveTab('hr-attendance');
                }
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}


