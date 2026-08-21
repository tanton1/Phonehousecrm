import { MapPin, Sparkles } from "lucide-react";
import { GeofenceBackgroundTracker } from "./components/GeofenceBackgroundTracker";
import { INITIAL_TODAY_ATTENDANCE_LIST } from "./data/attendanceData";
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
  SparePart,
  PurchaseOrder,
  StaffMember,
  AttendanceRecord,
  SystemSetupStatus
} from './types';
import { AppShell } from './app/AppShell';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { POSCockpitView } from './features/pos/components/POSCockpitView';
import { LeadKanbanBoard } from './features/crm/components/LeadKanbanBoard';
import { CreateLeadModal } from './features/crm/components/CreateLeadModal';
import { Customer360Drawer } from './features/crm/components/Customer360Drawer';
import { CRMLeadsView } from './components/CRMLeadsView';
import { RepairKanbanBoard } from './features/warranty/components/RepairKanbanBoard';
import { TradeInCockpitView } from './features/tradein/components/TradeInCockpitView';
import { CashLedgerTable } from './features/finance/components/CashLedgerTable';
import { CashbookView } from './components/CashbookView';
import { OmnichannelChatView } from './features/chat/components/OmnichannelChatView';
import { MonthlyPayrollTable } from './features/payroll/components/MonthlyPayrollTable';
import { ReportsPage } from './features/reports/ReportsPage';
import { StaffHRView } from './components/StaffHRView';

import { PurchaseOrdersView } from './components/PurchaseOrdersView';
import { InventoryView } from './components/InventoryView';
import { WarehouseTransfersView } from './components/WarehouseTransfersView';
import { MasterCatalogView } from './components/MasterCatalogView';
import { MasterCatalogItem } from './types';
import { ProductsView } from './components/ProductsView';
import { InvoicesView } from './components/InvoicesView';
import { InstallmentReconciliationView } from './components/InstallmentReconciliationView';
import { UserManagementView } from './components/UserManagementView';
import { PartnersView } from './components/PartnersView';
import { SystemSettingsHub } from './components/SystemSettingsHub';
import { MoreHubView } from './components/MoreHubView';
import { HRHubView } from './components/HRHubView';
import { StandaloneCheckInView } from './components/StandaloneCheckInView';
import { TechWorkspaceView } from './components/TechWorkspaceView';
import { SalesWorkspaceView } from './components/SalesWorkspaceView';
import { AICopilotModal } from './components/AICopilotModal';
import { ExecutiveAIAssistantModal } from './components/ExecutiveAIAssistantModal';
import { QuickSearchModal } from './components/QuickSearchModal';
import { PhoneHouseLoginPage } from './components/PhoneHouseLoginPage';
import { fetchOperationalConfigs, fetchSystemSetupStatus } from './services/configurationApiClient';
import { testFirestoreConnection, auth } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { 
  subscribeToDevices,
  updateDeviceInFirestore,
  deleteDeviceFromFirestore,
  subscribeToLeads,
  addLeadToFirestore,
  updateLeadInFirestore,
  subscribeToTradeIns,
  addTradeInToFirestore,
  updateTradeInInFirestore,
  subscribeToWarrantyTickets,
  addWarrantyTicketToFirestore,
  updateWarrantyTicketInFirestore,
  subscribeToInvoices,
  addInvoiceToFirestore,
  updateInvoiceInFirestore,
  deleteInvoiceFromFirestore,
  cancelInvoiceInFirestore,
  subscribeToUsers,
  addUserToFirestore,
  updateUserInFirestore,
  deleteUserFromFirestore,
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
  subscribeToProducts,
  addProductToFirestore,
  updateProductInFirestore,
  deleteProductFromFirestore,
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
  subscribeToSpareParts,
  updateSparePartInFirestore,
  subscribeToPurchaseOrders,
  addPurchaseOrderToFirestore,
  updatePurchaseOrderInFirestore,
  deletePurchaseOrderFromFirestore,
  subscribeToCatalog,
  addCatalogItemToFirestore,
  updateCatalogItemInFirestore,
  deleteCatalogItemFromFirestore,
  subscribeToAttendance,
  addAttendanceRecordToFirestore,
  updateAttendanceRecordInFirestore,
  deleteAttendanceRecordFromFirestore,
  subscribeToShiftHandovers,
  addShiftHandoverToFirestore,
  subscribeToSOPTemplates,
  subscribeToDailyChecklists
} from './services/firestoreService';
import { getVietnamDateString, getVietnamTimeString } from './utils/dateTimeUtils';
import { requestServerCheckIn, requestServerCheckOut } from './services/attendanceApiClient';
import {
  createInventoryIdempotencyKey,
  fetchInventoryDevices,
  requestImportInventoryDevices,
  requestReceivePurchaseOrder,
  requestCancelPurchaseOrder
} from './services/inventoryApiClient';

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
  'phonehouse_catalog',
  'phonehouse_products',
  'phonehouse_transfers',
  'phonehouse_purchase_orders',
  'phonehouse_branches',
  'phonehouse_warehouses',
  'phonehouse_store_settings',
  'phonehouse_active_user'
] as const;

function clearLegacyBusinessCacheOnce() {
  if (localStorage.getItem(BUSINESS_DATA_RESET_MARKER) === 'done') return;
  BUSINESS_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.setItem(BUSINESS_DATA_RESET_MARKER, 'done');
}

clearLegacyBusinessCacheOnce();

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('ADMIN');

  // Persistence State
  const [devices, setDevices] = useState<DeviceItem[]>(() => {
    const saved = localStorage.getItem('istore_devices');
    return saved ? JSON.parse(saved) : [];
  });

  const [leads, setLeads] = useState<Lead[]>(() => {
    const saved = localStorage.getItem('istore_leads');
    return saved ? JSON.parse(saved) : [];
  });

  const [tradeIns, setTradeIns] = useState<TradeInAppraisal[]>(() => {
    const saved = localStorage.getItem('istore_tradeins');
    return saved ? JSON.parse(saved) : [];
  });

  const [warrantyTickets, setWarrantyTickets] = useState<WarrantyTicket[]>(() => {
    const saved = localStorage.getItem('istore_warranty');
    return saved ? JSON.parse(saved) : [];
  });

  const [invoices, setInvoices] = useState<SalesInvoice[]>(() => {
    const saved = localStorage.getItem('istore_invoices');
    return saved ? JSON.parse(saved) : [];
  });

  const [users, setUsers] = useState<UserAccount[]>(() => {
    const saved = localStorage.getItem('istore_users');
    return saved ? JSON.parse(saved) : [];
  });

  const [partners, setPartners] = useState<Partner[]>(() => {
    const saved = localStorage.getItem('istore_partners');
    return saved ? JSON.parse(saved) : [];
  });

  const [funds, setFunds] = useState<FundAccount[]>(() => {
    const saved = localStorage.getItem('phonehouse_funds');
    return saved ? JSON.parse(saved) : [];
  });

  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>(() => {
    const saved = localStorage.getItem('phonehouse_cash_transactions');
    return saved ? JSON.parse(saved) : [];
  });

  
  const [catalogItems, setCatalogItems] = useState<MasterCatalogItem[]>(() => {
    const saved = localStorage.getItem('phonehouse_catalog');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed;
    }
    return [];
  });

  const [products, setProducts] = useState<ProductItem[]>(() => {
    const saved = localStorage.getItem('phonehouse_products');
    if (saved) return JSON.parse(saved);
    return [];
  });

  const [transfers, setTransfers] = useState<StockTransferSlip[]>(() => {
    const saved = localStorage.getItem('phonehouse_transfers');
    return saved ? JSON.parse(saved) : [];
  });

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => {
    const saved = localStorage.getItem('phonehouse_purchase_orders');
    return saved ? JSON.parse(saved) : [];
  });

  const [branches, setBranches] = useState<StoreBranch[]>(() => {
    const saved = localStorage.getItem('phonehouse_branches');
    return saved ? JSON.parse(saved) : [];
  });

  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>(() => {
    const saved = localStorage.getItem('phonehouse_warehouses');
    return saved ? JSON.parse(saved) : [];
  });

  const [spareParts, setSpareParts] = useState<SparePart[]>([]);

  const [storeSettings, setStoreSettings] = useState<StoreSettings>(() => {
    const saved = localStorage.getItem('phonehouse_store_settings');
    return saved ? JSON.parse(saved) : {
      companyName: '', brandName: '', hotline: '', supportEmail: '', website: '', taxCode: '',
      headquarterAddress: '', slogan: '', printHeaderNote: '', printFooterNote: '',
      defaultWarrantyMonths: 0, warrantyPackages: [], branches: [], warehouses: []
    };
  });

  useEffect(() => {
    localStorage.setItem('phonehouse_purchase_orders', JSON.stringify(purchaseOrders));
  }, [purchaseOrders]);

  useEffect(() => {
    localStorage.setItem('phonehouse_transfers', JSON.stringify(transfers));
  }, [transfers]);

  useEffect(() => {
    localStorage.setItem('phonehouse_branches', JSON.stringify(branches));
  }, [branches]);

  useEffect(() => {
    localStorage.setItem('phonehouse_warehouses', JSON.stringify(warehouses));
  }, [warehouses]);

  useEffect(() => {
    localStorage.setItem('phonehouse_store_settings', JSON.stringify(storeSettings));
  }, [storeSettings]);

  // Current Logged-in User Account
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem('phonehouse_active_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved user:', e);
      }
    }
    return null;
  });

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
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(true);
  const [isCreateLeadModalOpen, setIsCreateLeadModalOpen] = useState(false);
  const [selectedCustomer360Lead, setSelectedCustomer360Lead] = useState<Lead | null>(null);
  const [crmViewMode, setCrmViewMode] = useState<'KANBAN' | 'TABLE'>('KANBAN');

  // Global Branch Selection for ADMIN
  const [selectedBranchId, setSelectedBranchId] = useState<string>('ALL');
  
  // Realtime Attendance State
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);

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
    if (typeof recordOrDraft === 'object' && recordOrDraft !== null) {
      evidencePayload = {
        branchId: recordOrDraft.branchId || currentUser.branchId || branches[0]?.id || 'CN01',
        branchName: recordOrDraft.branchName || branches.find(b => b.id === (recordOrDraft.branchId || currentUser.branchId))?.name,
        staffName: currentUser.displayName,
        role: currentUser.role,
        userCoords: recordOrDraft.verification?.userCoords,
        faceCaptureBase64: recordOrDraft.verification?.snapshotUrl,
        qrScanned: recordOrDraft.verification?.qrScanned
      };
    } else {
      evidencePayload = {
        branchId: currentUser.branchId || branches[0]?.id || 'CN01',
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
      const completedRecord = await requestServerCheckOut(currentUser.branchId || branches[0]?.id || 'CN01');
      
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
    if (branches && branches.length > 0) {
      return branches[0];
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

  const filteredLeads = activeBranchId === 'ALL' || !activeBranchId 
    ? leads 
    : leads.filter(l => l.branchId === scopedBranchId || !l.branchId); // Fallback to all if lead has no branch yet

  const filteredTradeIns = activeBranchId === 'ALL' || !activeBranchId 
    ? tradeIns 
    : tradeIns.filter(t => t.branchId === scopedBranchId || !t.branchId);

  const filteredWarrantyTickets = activeBranchId === 'ALL' || !activeBranchId 
    ? warrantyTickets 
    : warrantyTickets.filter(w => w.branchId === scopedBranchId || !w.branchId);

  const filteredInvoices = activeBranchId === 'ALL' || !activeBranchId 
    ? invoices 
    : invoices.filter(i => {
        const br = branches.find(b => b.id === activeBranchId || b.code === activeBranchId);
        const currentBranchName = br?.name;
        return i.branchId === scopedBranchId ||
               i.branch === currentBranchName || 
               (i.warehouseId && warehouses.find(warehouse => warehouse.id === i.warehouseId)?.branchId === scopedBranchId) ||
               !i.branch;
      });

  const filteredCashTransactions = activeBranchId === 'ALL' || !activeBranchId 
    ? cashTransactions 
    : cashTransactions.filter(c => c.branchId === scopedBranchId || !c.branchId);

  const filteredUsers = activeBranchId === 'ALL' || !activeBranchId 
    ? users 
    : users.filter(u => u.branchId === scopedBranchId);

    const filteredPurchaseOrders = activeBranchId === 'ALL' || !activeBranchId
    ? purchaseOrders
    : purchaseOrders.filter(o => {
        return warehouses.find(warehouse => warehouse.id === o.warehouseId)?.branchId === scopedBranchId || !o.warehouseId;
      });

  const filteredPartners = activeBranchId === 'ALL' || !activeBranchId 
    ? partners 
    : partners.filter(p => p.branchId === scopedBranchId || !p.branchId);

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
                    : 'Nhân viên',
          branchId: user.branchId || '',
          assignedBranchIds: user.assignedBranchIds || [],
          branchName: branch?.name || 'Chi Nhánh Showroom',
          avatar: user.avatarUrl || '',
          baseSalary: user.baseSalary || 0,
          monthlyTargetRevenue: user.kpiTargetRevenue || 0,
          monthlyTargetOrders: user.kpiTargetOrders || 0,
          status: user.active === false ? 'INACTIVE' : 'ACTIVE',
          joinDate: user.createdAt || ''
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
    let unsubDevices = () => {};
    let unsubLeads = () => {};
    let unsubTradeIns = () => {};
    let unsubWarranty = () => {};
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
    let unsubCatalog = () => {};
    let unsubAttendance = () => {};

    // 2. Setup real-time Firestore subscriptions. An empty snapshot is authoritative.

    unsubDevices = subscribeToDevices((remoteDevices) => {
      setDevices(remoteDevices || []);
    });

    unsubLeads = subscribeToLeads((remoteLeads) => {
      setLeads(remoteLeads || []);
    });

    unsubTradeIns = subscribeToTradeIns((remoteTradeIns) => {
      setTradeIns(remoteTradeIns || []);
    });

    unsubWarranty = subscribeToWarrantyTickets((remoteWarranty) => {
      setWarrantyTickets(remoteWarranty || []);
    });

    unsubInvoices = subscribeToInvoices((remoteInvoices) => {
      setInvoices(remoteInvoices || []);
    });

    unsubUsers = subscribeToUsers((remoteUsers) => {
      setUsers(remoteUsers || []);
    });

    unsubPartners = subscribeToPartners((remotePartners) => {
      setPartners(remotePartners || []);
    });

    unsubFunds = subscribeToFunds((remoteFunds) => {
      setFunds(remoteFunds || []);
    });

    unsubCashTxs = subscribeToCashTransactions((remoteTxs) => {
      setCashTransactions(remoteTxs || []);
    });

    unsubTransfers = subscribeToTransfers((remoteTransfers) => {
      setTransfers(remoteTransfers || []);
    });

    unsubProducts = subscribeToProducts((remoteProducts) => {
      setProducts(remoteProducts || []);
    });

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

    unsubPurchaseOrders = subscribeToPurchaseOrders((remoteOrders) => {
      setPurchaseOrders(remoteOrders || []);
    });

    unsubCatalog = subscribeToCatalog((remoteCatalog) => {
      setCatalogItems(remoteCatalog || []);
    });

    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUid(fbUser?.uid || null);
      setAuthReady(true);
      if (fbUser) {
        setUsers(currentUsers => {
          const matched = currentUsers.find(u => u.email?.toLowerCase() === fbUser.email?.toLowerCase() || u.id === fbUser.uid);
          if (matched) {
            setCurrentUser({
              ...matched,
              id: fbUser.uid,
              authUid: fbUser.uid
            });
          }
          return currentUsers;
        });
      } else {
        setCurrentUser(null);
      }
    });

    return () => {
      unsubAuth();
      unsubDevices();
      unsubLeads();
      unsubTradeIns();
      unsubWarranty();
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
      unsubCatalog();
    };
  }, []);

  // Dedicated Authoritative Attendance Realtime Subscription (Scoped dynamically to current authenticated user & role)
  useEffect(() => {
    if (!authReady || !firebaseUid || !currentUser) {
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
        branchId: currentUser.branchId
      },
      (err) => {
        console.warn('[Attendance subscription notice]', err?.error || err);
      }
    );

    return () => unsubAttendance();
  }, [authReady, firebaseUid, currentUser?.role, currentUser?.branchId]);

  const refreshInventorySnapshot = useCallback(async () => {
    if (!currentUser) return;
    const snapshot = await fetchInventoryDevices(currentUser);
    setDevices(snapshot.devices || []);
  }, [currentUser]);

  useEffect(() => {
    if (!authReady || !currentUser) return;
    let active = true;
    const refresh = async () => {
      try {
        const snapshot = await fetchInventoryDevices(currentUser);
        if (active) setDevices(snapshot.devices || []);
      } catch (error) {
        console.warn('[Inventory snapshot notice]', error);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [authReady, currentUser]);

  // Safe set localStorage helper to catch QuotaExceededError safely
  const safeSetLocalStorage = useCallback((key: string, data: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn(`localStorage full or quota exceeded for ${key}:`, e);
    }
  }, []);

  // Sync to localStorage as offline cache
  useEffect(() => {
    // Strip heavy base64 images for localStorage cache to preserve browser quota
    const sanitizedDevices = devices.map(d => {
      if (d.images && d.images.some(img => img.startsWith('data:'))) {
        return { ...d, images: undefined };
      }
      return d;
    });
    safeSetLocalStorage('istore_devices', sanitizedDevices);
  }, [devices, safeSetLocalStorage]);

  useEffect(() => {
    safeSetLocalStorage('istore_leads', leads);
  }, [leads, safeSetLocalStorage]);

  useEffect(() => {
    safeSetLocalStorage('istore_tradeins', tradeIns);
  }, [tradeIns, safeSetLocalStorage]);

  useEffect(() => {
    safeSetLocalStorage('istore_warranty', warrantyTickets);
  }, [warrantyTickets, safeSetLocalStorage]);

  useEffect(() => {
    safeSetLocalStorage('istore_invoices', invoices);
  }, [invoices, safeSetLocalStorage]);

  useEffect(() => {
    safeSetLocalStorage('istore_users', users);
  }, [users, safeSetLocalStorage]);

  useEffect(() => {
    safeSetLocalStorage('istore_partners', partners);
  }, [partners, safeSetLocalStorage]);

  useEffect(() => {
    safeSetLocalStorage('phonehouse_funds', funds);
  }, [funds, safeSetLocalStorage]);

  useEffect(() => {
    safeSetLocalStorage('phonehouse_cash_transactions', cashTransactions);
  }, [cashTransactions, safeSetLocalStorage]);

  useEffect(() => {
    safeSetLocalStorage('phonehouse_products', products);
  }, [products, safeSetLocalStorage]);

  useEffect(() => {
    safeSetLocalStorage('phonehouse_catalog', catalogItems);
  }, [catalogItems, safeSetLocalStorage]);

  useEffect(() => {
    safeSetLocalStorage('phonehouse_attendance', attendanceRecords);
  }, [attendanceRecords, safeSetLocalStorage]);

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

  const handleUpdateDevice = (device: DeviceItem) => {
    setDevices(devices.map(d => (d.id === device.id ? device : d)));
    updateDeviceInFirestore(device);
  };

  const handleDeleteDevice = (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa máy này khỏi hệ thống?')) {
      setDevices(devices.filter(d => d.id !== id));
      deleteDeviceFromFirestore(id);
    }
  };

  const handleQuickSell = (device: DeviceItem) => {
    setPosPreSelectedDevice(device);
    setActiveTab('pos');
  };

  const handleAddLead = (lead: Lead) => {
    setLeads([lead, ...leads]);
    addLeadToFirestore(lead);
  };

  const handleUpdateLead = (lead: Lead) => {
    setLeads(leads.map(l => (l.id === lead.id ? lead : l)));
    updateLeadInFirestore(lead);
  };

  const handleConvertLeadToSale = (lead: Lead) => {
    const matched = devices.find(d => 
      d.status === 'in_stock' && 
      (d.model.toLowerCase().includes(lead.interestedModel.toLowerCase()) || 
       lead.interestedModel.toLowerCase().includes(d.model.toLowerCase()))
    );
    setPosPreSelectedDevice(matched || null);
    
    // Update Lead status to negotiating if it was new or contacted
    if (lead.status === 'new' || lead.status === 'contacted') {
      const updatedLead: Lead = { ...lead, status: 'negotiating' };
      setLeads(prev => prev.map(l => l.id === lead.id ? updatedLead : l));
      updateLeadInFirestore(updatedLead);
    }
    setActiveTab('pos');
  };

  const handleAddTradeIn = (tradeIn: TradeInAppraisal) => {
    setTradeIns([tradeIn, ...tradeIns]);
    addTradeInToFirestore(tradeIn);
  };

  const handleUpdateTradeIn = (tradeIn: TradeInAppraisal) => {
    setTradeIns(tradeIns.map(t => (t.id === tradeIn.id ? tradeIn : t)));
    updateTradeInInFirestore(tradeIn);
  };

  const handleAddWarrantyTicket = (ticket: WarrantyTicket) => {
    setWarrantyTickets([ticket, ...warrantyTickets]);
    addWarrantyTicketToFirestore(ticket);
  };

  const handleUpdateWarrantyTicket = (ticket: WarrantyTicket) => {
    setWarrantyTickets(warrantyTickets.map(w => (w.id === ticket.id ? ticket : w)));
    updateWarrantyTicketInFirestore(ticket);
  };

  const handleCreateInvoice = (invoice: SalesInvoice) => {
    setInvoices([invoice, ...invoices]);
    addInvoiceToFirestore(invoice);

    // Luôn lưu hoặc cập nhật thông tin khách hàng khi phát sinh hóa đơn mới
    const phoneToUse = invoice.customerPhone || invoice.phone || '';
    if (phoneToUse) {
      const existingPartner = partners.find(p => p.phone === phoneToUse);
      const debtIncrease = (invoice.installmentDisbursementStatus === 'PENDING' && invoice.installmentExpectedAmount) ? invoice.installmentExpectedAmount : 0;
      
      if (existingPartner) {
        const newTx = debtIncrease > 0 ? {
          id: `TX-${Date.now().toString().slice(-6)}`,
          date: new Date().toISOString().split('T')[0],
          type: 'DEBT_INCREASE' as const,
          amount: debtIncrease,
          note: `Mua trả góp đơn ${invoice.invoiceCode}`,
          referenceId: invoice.id
        } : null;
        handleUpdatePartner({
          ...existingPartner,
          type: existingPartner.type === 'SUPPLIER' ? 'BOTH' : existingPartner.type, // Nếu đang là NCC mà mua hàng thì thành BOTH
          outstandingDebt: (existingPartner.outstandingDebt || 0) + debtIncrease,
          totalSpent: (existingPartner.totalSpent || 0) + invoice.finalAmount,
          debtTransactions: newTx ? [newTx, ...(existingPartner.debtTransactions || [])] : existingPartner.debtTransactions
        });
      } else {
        const newTx = debtIncrease > 0 ? {
          id: `TX-${Date.now().toString().slice(-6)}`,
          date: new Date().toISOString().split('T')[0],
          type: 'DEBT_INCREASE' as const,
          amount: debtIncrease,
          note: `Mua trả góp đơn ${invoice.invoiceCode}`,
          referenceId: invoice.id
        } : null;
        handleAddPartner({
          id: `PARTNER-${Date.now()}`,
          type: 'CUSTOMER',
          name: invoice.customerName,
          phone: phoneToUse,
          outstandingDebt: debtIncrease,
          totalSpent: invoice.finalAmount,
          debtTransactions: newTx ? [newTx] : [],
          createdAt: new Date().toISOString()
        });
      }
    }
  };

  const handlePOSCheckoutSuccess = (
    invoice: SalesInvoice,
    devicesSold: DeviceItem[],
    accessoriesSold: { product: ProductItem; quantity: number }[],
    cashTx: CashTransaction | null,
    updatedFund: FundAccount | null
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

    // 4. Record cash transaction in state (deduplicated by id)
    if (cashTx) {
      setCashTransactions(prev => [cashTx, ...prev.filter(t => t.id !== cashTx.id)]);
    }

    // 5. Update fund balance in state
    if (updatedFund) {
      setFunds(prev => prev.map(f => f.id === updatedFund.id ? { ...f, currentBalance: (f.currentBalance || 0) + (cashTx?.amount || 0) } : f));
    }
  };

  const handleUpdateInvoice = (invoice: SalesInvoice) => {
    setInvoices(invoices.map(inv => (inv.id === invoice.id ? invoice : inv)));
    updateInvoiceInFirestore(invoice);
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

  const handleDeleteInvoice = (invoiceId: string) => {
    setInvoices(invoices.filter(inv => inv.id !== invoiceId));
    deleteInvoiceFromFirestore(invoiceId);
  };

  const handleAddUser = (newUser: UserAccount) => {
    setUsers([newUser, ...users]);
    addUserToFirestore(newUser);
  };

  const handleUpdateUser = (updatedUser: UserAccount) => {
    setUsers(users.map(u => (u.id === updatedUser.id ? updatedUser : u)));
    updateUserInFirestore(updatedUser);
  };

  const handleDeleteUser = (userId: string) => {
    setUsers(users.filter(u => u.id !== userId));
    deleteUserFromFirestore(userId);
  };

  const handleAddPartner = async (newPartner: Partner) => {
    await addPartnerToFirestore(newPartner);
    setPartners(previous => [newPartner, ...previous.filter(partner => partner.id !== newPartner.id)]);
  };

  const handleUpdatePartner = (updatedPartner: Partner) => {
    setPartners(partners.map(p => (p.id === updatedPartner.id ? updatedPartner : p)));
    updatePartnerInFirestore(updatedPartner);
  };

  const handleDeletePartner = (partnerId: string) => {
    setPartners(partners.filter(p => p.id !== partnerId));
    deletePartnerFromFirestore(partnerId);
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
      await addBranchToFirestore(newBranch, branches);
    } catch (err: any) {
      console.error('Error adding branch:', err);
      alert('Lỗi lưu chi nhánh: ' + (err?.message || 'Không có quyền thực hiện.'));
      throw err;
    }
  };

  const handleUpdateBranch = async (updatedBranch: StoreBranch) => {
    try {
      await updateBranchInFirestore(updatedBranch, branches);
    } catch (err: any) {
      console.error('Error updating branch:', err);
      alert('Lỗi cập nhật chi nhánh: ' + (err?.message || 'Không có quyền thực hiện (Yêu cầu quyền ADMIN).'));
      throw err;
    }
  };

  const handleDeleteBranch = async (branchId: string) => {
    await deleteBranchFromFirestore(branchId);
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
    await saveStoreSettingsToFirestore(newSettings);
    setStoreSettings(newSettings);
  };

  // ==========================================
  // PURCHASE ORDERS (NHẬP HÀNG & NCC) HANDLERS
  // ==========================================
  const handleAddPurchaseOrder = async (order: PurchaseOrder, autoCreateDevices: boolean) => {
    if (!currentUser) throw new Error('Phiên đăng nhập đã hết hạn. Phiếu chưa được tạo.');
    if (!autoCreateDevices || order.status !== 'COMPLETED') {
      throw new Error('Phiếu nhập kho chỉ được ghi khi đã hoàn tất và có danh sách IMEI đầy đủ.');
    }
    const receipt = await requestReceivePurchaseOrder(order, currentUser);
    setPurchaseOrders(prev => [receipt.order, ...prev.filter(item => item.id !== receipt.order.id)]);
    mergeImportedDevices(receipt.devices);
    return;

    /* Luồng cũ phía dưới được giữ tạm để đối chiếu migration; không còn được thực thi.
       Trước đây phiếu được ghi trước quỹ/công nợ/IMEI nên có thể sinh phiếu ảo. */
    setPurchaseOrders(prev => [order, ...prev]);
    await addPurchaseOrderToFirestore(order);

    // 1. Ghi nhận Lịch sử Giao dịch & Công nợ của Nhà Cung Cấp (NCC)
    const supplier = partners.find(p => p.id === order.supplierId || (p.name && order.supplierName && p.name.trim().toLowerCase() === order.supplierName.trim().toLowerCase()));
    
    const buyTx: PartnerDebtTransaction = {
      id: `TX-BUY-${Date.now().toString().slice(-6)}`,
      date: order.orderDate,
      type: 'DEBT_INCREASE',
      amount: order.totalAmount,
      note: `Nhập hàng phiếu ${order.code}`,
      referenceId: order.code || order.id
    };

    const newTxs: PartnerDebtTransaction[] = [buyTx];

    if (order.paidAmount > 0) {
      const payTx: PartnerDebtTransaction = {
        id: `TX-PAY-${Date.now().toString().slice(-6)}`,
        date: order.orderDate,
        type: 'PAYMENT',
        amount: order.paidAmount,
        note: `Thanh toán ngay phiếu nhập ${order.code}`,
        referenceId: order.code || order.id
      };
      newTxs.unshift(payTx);
    }

    if (supplier) {
      const updatedDebt = Math.max(0, (supplier.outstandingDebt || 0) + order.totalAmount - order.paidAmount);
      handleUpdatePartner({
        ...supplier,
        outstandingDebt: updatedDebt,
        debtTransactions: [...newTxs, ...(supplier.debtTransactions || [])]
      });
    } else if (order.supplierName) {
      // Tự tạo NCC mới nếu chưa có trong danh sách
      const newSupplier: Partner = {
        id: order.supplierId || `SUP-${Date.now()}`,
        name: order.supplierName,
        phone: order.supplierPhone || '',
        type: 'SUPPLIER',
        outstandingDebt: Math.max(0, order.totalAmount - order.paidAmount),
        debtTransactions: newTxs,
        createdAt: order.orderDate || new Date().toISOString().split('T')[0]
      };
      handleAddPartner(newSupplier);
    }

    // 2. Nếu có thanh toán tiền ngay cho NCC -> Sinh Phiếu Chi ở Sổ Quỹ
    if (order.paidAmount > 0) {
      const targetFund = (order.fundId ? funds.find(f => f.id === order.fundId) : null) || 
                         funds.find(f => f.type === order.paymentMethod) || null;
      if (targetFund) {
        const cashTx: CashTransaction = {
          id: `CTX-${Date.now()}`,
          code: `PC-${Date.now().toString().slice(-6)}`,
          date: order.orderDate || new Date().toISOString().split('T')[0],
          type: 'PAYMENT',
          category: 'INVENTORY_PURCHASE',
          categoryName: 'Chi nhập hàng iPhone mới / Like New',
          amount: order.paidAmount,
          fundId: targetFund.id,
          fundType: targetFund.type,
          fundName: targetFund.name,
          partnerId: supplier?.id || order.supplierId,
          partnerName: order.supplierName,
          partnerType: 'SUPPLIER',
          partnerPhone: order.supplierPhone,
          referenceCode: order.code,
          notes: `Thanh toán phiếu nhập ${order.code} - NCC ${order.supplierName}`,
          creator: order.creatorName || (currentUser ? currentUser.displayName : 'Hệ thống'),
          branchId: activeBranchId || currentUser?.branchId,
          status: 'COMPLETED'
        };
        handleAddCashTransaction(cashTx);
      }
    }

    // 3. Nếu chọn autoCreateDevices và phiếu đã hoàn tất -> Tự động thêm DeviceItem vào kho
    if (autoCreateDevices && order.status === 'COMPLETED') {
      const newDevicesToAdd: DeviceItem[] = [];
      order.items.forEach((item, itemIdx) => {
        if (item.type === 'device') {
          const count = item.quantity || (item.imeiList && item.imeiList.length) || 1;
          for (let i = 0; i < count; i++) {
            const imei = item.imeiList && item.imeiList[i] 
              ? item.imeiList[i] 
              : `35${Math.floor(1000000000000 + Math.random() * 9000000000000)}`;
            
            const newDevice: DeviceItem = {
              id: `DEV-IMP-${Date.now()}-${itemIdx}-${i}`,
              imei,
              serialNo: `SN-${Date.now().toString().slice(-6)}${i}`,
              model: item.modelOrName,
              color: item.color || 'Titan Tự Nhiên',
              storage: item.storage || '128GB',
              condition: (item.condition as any) || 'New Seal',
              region: item.region || 'VN/A (Chính hãng)',
              batteryHealth: item.batteryHealth || 100,
              buyPrice: item.importPrice,
              sellPrice: item.expectedSellPrice || Math.round(item.importPrice * 1.15),
              status: 'in_stock',
              branchId: order.branchId || warehouses.find(location => String(location.id) === String(order.warehouseId))?.branchId || (scopedBranchId !== 'ALL' ? scopedBranchId : currentUser?.branchId),
              currentLocationId: String(order.warehouseId || resolvedCurrentBranch.warehouseId || ''),
              warehouseId: String(order.warehouseId || resolvedCurrentBranch.warehouseId || ''),
              warehouse: String(order.warehouseId || resolvedCurrentBranch.warehouseId || ''),
              supplier: order.supplierName,
              supplierId: order.supplierId,
              receivedDate: order.orderDate,
              warrantyPeriodMonths: 12,
              icloudStatus: 'Clean / Đã Thoát',
              screenStatus: 'Zin Màn Keng',
              notes: `Nhập tự động từ phiếu ${order.code}`
            };
            newDevicesToAdd.push(newDevice);
          }
        } else if ((item as any).type === 'accessory' || (item as any).type === 'product') {
          const qty = item.quantity || 1;
          setProducts(prevProducts => {
            const existing = prevProducts.find(p => p.name.trim().toLowerCase() === item.modelOrName.trim().toLowerCase() || (p.sku && p.sku === item.modelOrName));
            if (existing) {
              const updated: ProductItem = {
                ...existing,
                stockQuantity: (existing.stockQuantity || 0) + qty,
                buyPrice: item.importPrice || existing.buyPrice
              };
              updateProductInFirestore(updated);
              return prevProducts.map(p => p.id === existing.id ? updated : p);
            } else {
              const newProd: ProductItem = {
                id: `PROD-${Date.now()}-${itemIdx}`,
                name: item.modelOrName,
                category: 'Phụ kiện',
                sku: `ACC-${Date.now().toString().slice(-6)}`,
                brand: 'PhoneHouse / Apple',
                stockQuantity: qty,
                minStockLevel: 5,
                buyPrice: item.importPrice,
                sellPrice: item.expectedSellPrice || Math.round(item.importPrice * 1.3),
                status: 'active'
              };
              addProductToFirestore(newProd);
              return [newProd, ...prevProducts];
            }
          });
        }
      });

      if (newDevicesToAdd.length > 0) {
        if (!currentUser) throw new Error('Phiên đăng nhập đã hết hạn.');
        const destination = resolveImportDestination(newDevicesToAdd[0]);
        const result = await requestImportInventoryDevices({
          ...destination,
          sourceType: 'PURCHASE_ORDER',
          sourceId: order.id,
          idempotencyKey: `purchase-order:${order.id}`,
          devices: newDevicesToAdd
        }, currentUser);
        mergeImportedDevices(result.devices);
      }
    }
    /* end legacy purchase-order flow */
  };

  const handleUpdatePurchaseOrder = (updatedOrder: PurchaseOrder) => {
    setPurchaseOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    updatePurchaseOrderInFirestore(updatedOrder);
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

  // Master Catalog Handlers
  const handleAddCatalogItem = (newItem: MasterCatalogItem) => {
    setCatalogItems(prev => [newItem, ...prev]);
    addCatalogItemToFirestore(newItem);
  };

  const handleUpdateCatalogItem = (updatedItem: MasterCatalogItem) => {
    setCatalogItems(prev => prev.map(c => c.id === updatedItem.id ? updatedItem : c));
    updateCatalogItemInFirestore(updatedItem);
  };

  const handleDeleteCatalogItem = (itemId: string) => {
    setCatalogItems(prev => prev.filter(c => c.id !== itemId));
    deleteCatalogItemFromFirestore(itemId);
  };

  const handleUpdateProduct = (updatedProduct: ProductItem) => {
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    updateProductInFirestore(updatedProduct);
  };

  
  const handleAutoPayDebt = (partnerId: string, amount: number, direction: 'PAYMENT' | 'RECEIPT') => {
    let remainingAmount = amount;

    if (direction === 'PAYMENT') {
      // Payment to Supplier -> reduce debt on Purchase Orders
      setPurchaseOrders(prev => {
        const sortedOrders = [...prev]
          .filter(o => o.supplierId === partnerId && o.debtAmount > 0)
          .sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime());

        const updatedOrdersMap = new Map();
        for (const order of sortedOrders) {
          if (remainingAmount <= 0) break;
          const toPay = Math.min(order.debtAmount, remainingAmount);
          remainingAmount -= toPay;
          const newDebt = order.debtAmount - toPay;
          const newPaid = (order.paidAmount || 0) + toPay;
          updatedOrdersMap.set(order.id, {
            ...order,
            debtAmount: newDebt,
            paidAmount: newPaid,
            paymentStatus: newDebt === 0 ? 'PAID' : 'PARTIAL'
          });
        }

        return prev.map(o => updatedOrdersMap.has(o.id) ? updatedOrdersMap.get(o.id) : o);
      });
    } else {
      // Receipt from Customer -> reduce debt on Invoices
      setInvoices(prev => {
        const sortedInvoices = [...prev]
          .filter(i => i.customerId === partnerId && i.debtAmount > 0)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        const updatedInvoicesMap = new Map();
        for (const invoice of sortedInvoices) {
          if (remainingAmount <= 0) break;
          const toPay = Math.min(invoice.debtAmount, remainingAmount);
          remainingAmount -= toPay;
          const newDebt = invoice.debtAmount - toPay;
          const newPaid = (invoice.paidAmount || 0) + toPay;
          updatedInvoicesMap.set(invoice.id, {
            ...invoice,
            debtAmount: newDebt,
            paidAmount: newPaid,
            paymentStatus: newDebt === 0 ? 'PAID' : 'PARTIAL'
          });
        }

        return prev.map(i => updatedInvoicesMap.has(i.id) ? updatedInvoicesMap.get(i.id) : i);
      });
    }
  };

  const handlePaySupplierDebt = (orderId: string, supplierId: string, amount: number, fundId: string, note: string) => {
    const targetFund = funds.find(f => f.id === fundId);
    if (!targetFund) {
      alert(`Lỗi kế toán: Không tìm thấy Quỹ thanh toán có mã ${fundId}. Giao dịch bị hủy.`);
      return;
    }
    const supplier = partners.find(p => p.id === supplierId && (p.type === 'SUPPLIER' || p.type === 'BOTH'));
    if (!supplier) {
      alert(`Lỗi kế toán: Không tìm thấy Nhà Cung Cấp hợp lệ có mã ${supplierId}. Giao dịch bị hủy.`);
      return;
    }

    // 1. Thêm CashTransaction ở Sổ Quỹ (handleAddCashTransaction sẽ tự trừ quỹ)
    if (targetFund) {
      const cashTx: CashTransaction = {
        id: `CTX-PAY-${Date.now()}`,
        code: `PC-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split('T')[0],
        type: 'PAYMENT',
        category: 'SUPPLIER_DEBT_PAY',
        categoryName: 'Chi thanh toán nợ Nhà Cung Cấp',
        amount,
        fundId: targetFund.id,
        fundType: targetFund.type,
        fundName: targetFund.name,
        partnerId: supplier?.id || supplierId,
        partnerName: supplier?.name || 'Nhà Cung Cấp',
        partnerType: 'SUPPLIER',
        referenceCode: orderId,
        notes: note || `Thanh toán nợ NCC ${supplier?.name || ''}`,
        creator: currentUser ? currentUser.displayName : 'Admin PhoneHouse',
        branchId: activeBranchId || currentUser?.branchId,
        status: 'COMPLETED'
      };
      handleAddCashTransaction(cashTx);
    }

    // 2. Giảm công nợ NCC & ghi lịch sử
    if (supplier) {
      const newTx: PartnerDebtTransaction = {
        id: `TX-DEBT-PAY-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split('T')[0],
        type: 'PAYMENT',
        amount,
        note: note || `Trả nợ phiếu nhập hàng ${orderId}`,
        referenceId: orderId
      };
      handleUpdatePartner({
        ...supplier,
        outstandingDebt: Math.max(0, (supplier.outstandingDebt || 0) - amount),
        debtTransactions: [newTx, ...(supplier.debtTransactions || [])]
      });
    }
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
        updateDeviceInFirestore(updatedItem);
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
      <GeofenceBackgroundTracker currentUser={currentUser} />

      <AppShell
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        currentUser={currentUser ? {
          id: currentUser.id,
          uid: currentUser.id,
          name: currentUser.displayName,
          email: currentUser.email,
          role: currentUser.role,
          branchId: currentUser.branchId || 'CN01',
          assignedBranchIds: currentUser.assignedBranchIds || [currentUser.branchId || 'CN01'],
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
        {activeTab === 'login' && (
          <PhoneHouseLoginPage
            users={users}
            currentUser={currentUser}
            onLoginSuccess={(loggedUser) => {
              setCurrentUser(loggedUser);
              localStorage.setItem('phonehouse_active_user', JSON.stringify(loggedUser));
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
            funds={funds}
            partners={partners}
            branches={branches}
            users={users}
            selectedBranchId={selectedBranchId}
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
          />
        )}

        {activeTab === 'reports' && (
          <ReportsPage
            invoices={filteredInvoices}
            devices={filteredDevices}
            warrantyTickets={filteredWarrantyTickets}
            funds={funds}
            cashTransactions={filteredCashTransactions}
            branches={branches}
            selectedBranchId={selectedBranchId}
            currentUser={currentUser ? {
              id: currentUser.id,
              uid: currentUser.id,
              name: currentUser.displayName,
              email: currentUser.email,
              role: currentUser.role,
              branchId: currentUser.branchId || 'CN01',
              assignedBranchIds: currentUser.assignedBranchIds || [currentUser.branchId || 'CN01'],
              isActive: currentUser.active
            } : null}
          />
        )}

        {activeTab === 'purchase-orders' && (
          <PurchaseOrdersView
            purchaseOrders={filteredPurchaseOrders}
            partners={partners}
            warehouses={warehouses}
            funds={funds}
            branches={branches}
            selectedBranchId={selectedBranchId}
            currentUser={currentUser}
            catalogItems={catalogItems}
            onAddPurchaseOrder={handleAddPurchaseOrder}
            onUpdatePurchaseOrder={handleUpdatePurchaseOrder}
            onDeletePurchaseOrder={handleDeletePurchaseOrder}
            onPaySupplierDebt={handlePaySupplierDebt}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            catalogItems={catalogItems}
            currentUser={currentUser}
            devices={devices}
            branches={branches}
            warehouses={warehouses}
            partners={partners}
            funds={funds}
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
            items={catalogItems}
            onAddItem={handleAddCatalogItem}
            onUpdateItem={handleUpdateCatalogItem}
            onDeleteItem={handleDeleteCatalogItem}
          />
        )}

        {(activeTab === 'products' || activeTab === 'spare-parts') && (
          <ProductsView
            products={products}
            onAddProduct={(p) => {
              setProducts([...products, p]);
              addProductToFirestore(p);
            }}
            onUpdateProduct={handleUpdateProduct}
            onDeleteProduct={(id) => {
              setProducts(products.filter(p => p.id !== id));
              deleteProductFromFirestore(id);
            }}
          />
        )}

        {activeTab === 'crm' && (
          <div className="space-y-3">
            {/* View Mode Toggle Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-3 rounded-2xl border border-zinc-200/80 shadow-2xs">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCrmViewMode('KANBAN')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    crmViewMode === 'KANBAN'
                      ? 'bg-[#ff4b16] text-white shadow-xs'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  📊 Kanban Pipeline
                </button>
                <button
                  onClick={() => setCrmViewMode('TABLE')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    crmViewMode === 'TABLE'
                      ? 'bg-[#ff4b16] text-white shadow-xs'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  📋 Bảng Danh Sách & Chăm Sóc Lead
                </button>
              </div>

              <button
                onClick={() => setIsCreateLeadModalOpen(true)}
                className="bg-[#ff4b16] hover:bg-[#e03e0e] text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center justify-center space-x-1.5 shadow-sm shadow-orange-500/20 cursor-pointer transition-all active:scale-95"
              >
                <span>+ Thêm Lead Mới (F4)</span>
              </button>
            </div>

            {crmViewMode === 'KANBAN' ? (
              <LeadKanbanBoard
                leads={filteredLeads}
                onSelectLead={(lead) => {
                  setSelectedCustomer360Lead(lead);
                }}
                onUpdateLeadStatus={async (leadId, newStatus) => {
                  const lead = leads.find(l => l.id === leadId);
                  if (lead) {
                    await handleUpdateLead({ ...lead, status: newStatus });
                  }
                }}
                onOpenCreateModal={() => setIsCreateLeadModalOpen(true)}
              />
            ) : (
              <CRMLeadsView
                currentUser={currentUser}
                branches={branches}
                leads={filteredLeads}
                devices={filteredDevices}
                invoices={filteredInvoices}
                warrantyTickets={filteredWarrantyTickets}
                onAddLead={handleAddLead}
                onUpdateLead={handleUpdateLead}
                onConvertLeadToSale={(lead) => {
                  setPosCustomerContext({ name: lead.name, phone: lead.phone });
                  if (lead.interestedModel) {
                    const found = devices.find(d => d.status === 'in_stock' && d.model.toLowerCase().includes(lead.interestedModel.toLowerCase()));
                    if (found) setPosPreSelectedDevice(found);
                  }
                  setActiveTab('pos');
                }}
                onNavigateToOmnichannelChat={() => setActiveTab('omnichannel-chat')}
              />
            )}

            {/* Create Lead Modal */}
            <CreateLeadModal
              isOpen={isCreateLeadModalOpen}
              onClose={() => setIsCreateLeadModalOpen(false)}
              branches={branches}
              staffList={users as any}
              currentBranch={resolvedCurrentBranch}
              currentUser={currentUser ? {
                id: currentUser.id,
                uid: currentUser.id,
                name: currentUser.displayName,
                email: currentUser.email,
                role: currentUser.role,
                branchId: currentUser.branchId || 'CN01',
                assignedBranchIds: currentUser.assignedBranchIds || [currentUser.branchId || 'CN01'],
                isActive: currentUser.active
              } : null}
              onSaveLead={async (newLead) => {
                await handleAddLead(newLead);
                setIsCreateLeadModalOpen(false);
              }}
            />

            {/* Customer 360 Drawer */}
            <Customer360Drawer
              lead={selectedCustomer360Lead}
              leads={leads}
              isOpen={!!selectedCustomer360Lead}
              onClose={() => setSelectedCustomer360Lead(null)}
              invoices={filteredInvoices}
              warrantyTickets={filteredWarrantyTickets}
              onAddTimelineNote={async (leadId, note) => {
                const lead = leads.find(l => l.id === leadId);
                if (lead) {
                  const updatedNotes = lead.notes ? `${lead.notes}\n• [${new Date().toLocaleDateString('vi-VN')}]: ${note}` : note;
                  await handleUpdateLead({ ...lead, notes: updatedNotes });
                  setSelectedCustomer360Lead({ ...lead, notes: updatedNotes });
                }
              }}
              onTriggerNextBestAction={(action) => {
                if (action.actionType === 'TRADE_IN') {
                  setSelectedCustomer360Lead(null);
                  setActiveTab('pos');
                } else if (action.actionType === 'WARRANTY_CARE') {
                  setSelectedCustomer360Lead(null);
                  setActiveTab('warranty');
                }
              }}
            />
          </div>
        )}

        {(activeTab === 'omnichannel-chat' || activeTab === 'chat') && (
          <OmnichannelChatView
            devices={filteredDevices}
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

        {activeTab === 'tradein' && (
          <TradeInCockpitView
            devices={filteredDevices}
            currentBranch={resolvedCurrentBranch}
            currentUser={currentUser ? {
              id: currentUser.id,
              uid: currentUser.id,
              name: currentUser.displayName,
              email: currentUser.email,
              role: currentUser.role,
              branchId: currentUser.branchId || 'CN01',
              assignedBranchIds: currentUser.assignedBranchIds || [currentUser.branchId || 'CN01'],
              isActive: currentUser.active
            } : null}
            onCompleteTradeInToPOS={(appraisal, targetDevice) => {
              handleAddTradeIn(appraisal);
              if (targetDevice) setPosPreSelectedDevice(targetDevice);
              setPosCustomerContext({
                name: appraisal.customerName || 'Khách Thu Cũ',
                phone: appraisal.customerPhone || ''
              });
              setPosTradeInContext(appraisal);
              setActiveTab('pos');
            }}
          />
        )}

        {activeTab === 'warranty' && (
          <RepairKanbanBoard
            tickets={filteredWarrantyTickets}
            branches={branches}
            selectedBranchId={selectedBranchId}
            onSelectTicket={(ticket) => {
              alert(`Chi tiết phiếu ${ticket.ticketNumber}:\nKhách: ${ticket.customerName} (${ticket.phone})\nMáy: ${ticket.model}\nLỗi: ${ticket.faultDescription || ticket.issueType}\nKTV: ${ticket.technician || 'Chưa gán'}`);
            }}
            onUpdateTicketStatus={async (ticketId, newStatus) => {
              const t = warrantyTickets.find(w => w.id === ticketId);
              if (t) {
                await handleUpdateWarrantyTicket({ ...t, status: newStatus });
              }
            }}
            onOpenCreateModal={() => {
              const customerName = window.prompt('Tên khách hàng tiếp nhận máy:');
              if (!customerName) return;
              const phone = window.prompt('Số điện thoại khách:') || '';
              const model = window.prompt('Model máy (vd: iPhone 13 Pro 128GB):') || 'iPhone';
              const fault = window.prompt('Mô tả tình trạng lỗi (vd: Màn sọc xanh, liệt cảm ứng):') || 'Lỗi chức năng';
              const newTicket: WarrantyTicket = {
                id: `TICKET-${Date.now()}`,
                ticketNumber: `SC-${Date.now().toString().slice(-4)}`,
                customerName,
                phone,
                model,
                imei: '358' + Math.floor(100000000000 + Math.random() * 900000000000),
                faultDescription: fault,
                issueType: 'Màn Hình / Cảm Ứng',
                status: 'received',
                technician: currentUser?.displayName || 'KTV Ca trực',
                branchId: branches[0]?.id || 'CN01',
                isWarrantyFree: false,
                estimatedCost: 1500000,
                finalCost: 1500000,
                receivedDate: new Date().toISOString(),
                expectedReturnDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
              };
              handleAddWarrantyTicket(newTicket);
            }}
          />
        )}

        {activeTab === 'pos' && (
          <POSCockpitView
            devices={filteredDevices}
            products={products}
            funds={funds}
            partners={partners}
            currentBranch={resolvedCurrentBranch}
            currentUser={currentUser ? {
              id: currentUser.id,
              uid: currentUser.id,
              name: currentUser.displayName,
              email: currentUser.email,
              role: currentUser.role,
              branchId: currentUser.branchId || 'CN01',
              assignedBranchIds: currentUser.assignedBranchIds || [currentUser.branchId || 'CN01'],
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
            currentUser={currentUser}
            branches={branches}
            invoices={filteredInvoices}
            devices={filteredDevices}
            onNavigateToPOS={() => {
              setPosPreSelectedDevice(null);
              setActiveTab('pos');
            }}
            onUpdateInvoice={handleUpdateInvoice}
            onCancelInvoice={handleCancelInvoice}
            onDeleteInvoice={handleDeleteInvoice}
          />
        )}

        {activeTab === 'installments' && (
          <InstallmentReconciliationView
            currentUser={currentUser}
            branches={branches}
            invoices={filteredInvoices}
            funds={funds}
            partners={partners}
            onUpdateInvoice={handleUpdateInvoice}
            onAddTransaction={handleAddCashTransaction}
            onUpdateFunds={(updatedFunds) => {
              setFunds(updatedFunds);
            }}
            onUpdatePartner={handleUpdatePartner}
          />
        )}

        {(activeTab === 'funds' || activeTab === 'cashbook') && (
          <CashbookView
            currentUser={currentUser}
            branches={branches}
            selectedBranchId={selectedBranchId}
            transactions={filteredCashTransactions}
            funds={funds}
            partners={partners}
            onAddTransaction={handleAddCashTransaction}
            onAddPartner={handleAddPartner}
            onSaveFund={handleSaveFund}
            onDeleteFund={handleDeleteFund}
            onTransferFunds={handleTransferFunds}
          />
        )}

        {activeTab === 'partners' && (
          <PartnersView
            partners={partners}
            branches={branches}
            onAddPartner={handleAddPartner}
            onUpdatePartner={handleUpdatePartner}
            onDeletePartner={handleDeletePartner}
            onAddTransaction={handleAddCashTransaction}
            funds={funds}
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
            funds={funds}
            invoices={invoices}
            devices={devices}
            warrantyTickets={warrantyTickets}
            attendanceRecords={attendanceRecords}
            staffMembers={staffMembers}
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
            partners={partners}
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

        {(activeTab === 'hr-attendance' || activeTab === 'attendance' || activeTab === 'attendance-log' || activeTab === 'attendance-management') && (
          <HRHubView
            currentUser={currentUser}
            staffList={staffMembers}
            attendanceRecords={attendanceRecords}
            invoices={filteredInvoices}
            warrantyTickets={filteredWarrantyTickets}
            branches={branches}
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
            onOpenCheckInModal={() => setActiveTab('checkin-portal')}
          />
        )}

        {activeTab === 'payroll' && (
          <MonthlyPayrollTable
            staffList={users as any}
            branches={branches}
            selectedMonth="2026-08"
            onApproveAndPayPayroll={(month, records) => {
              alert(`Đã duyệt và thanh toán bảng lương tháng ${month} cho ${records.length} nhân sự thành công!`);
            }}
          />
        )}

        {activeTab === 'tech-workspace' && (
          <TechWorkspaceView
            tasks={filteredWarrantyTickets}
            currentUser={currentUser}
            devices={filteredDevices}
            branches={branches}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
            onOpenCheckIn={() => setActiveTab('checkin-portal')}
            attendanceRecord={currentAttendance}
            attendanceRecords={attendanceRecords}
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
            funds={funds}
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
      </AppShell>

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
        invoices={invoices}
        devices={devices}
        funds={funds}
        warrantyTickets={warrantyTickets}
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
                localStorage.setItem('phonehouse_active_user', JSON.stringify(loggedUser));
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


