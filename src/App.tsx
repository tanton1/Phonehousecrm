import { MapPin, Sparkles } from "lucide-react";
import { GeofenceBackgroundTracker } from "./components/GeofenceBackgroundTracker";
import { INITIAL_TODAY_ATTENDANCE_LIST } from "./data/attendanceData";
import { RoleSwitcher, WorkspaceMode } from './components/RoleSwitcher';
import React, { useState, useEffect, useCallback } from 'react';
import { 
  INITIAL_DEVICES, 
  INITIAL_LEADS, 
  INITIAL_TRADE_INS, 
  INITIAL_WARRANTY_TICKETS, 
  INITIAL_INVOICES,
  INITIAL_USERS,
  INITIAL_PARTNERS,
  INITIAL_FUNDS,
  INITIAL_CASH_TRANSACTIONS,
  INITIAL_TRANSFERS,
  INITIAL_BRANCHES,
  INITIAL_WAREHOUSES,
  INITIAL_STORE_SETTINGS,
  INITIAL_PURCHASE_ORDERS
} from './data/initialData';
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
  WarehouseId,
  StoreBranch,
  WarehouseInfo,
  StoreSettings,
  SparePart,
  PurchaseOrder
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
import { INITIAL_CATALOG_ITEMS } from './data/catalogData';
import { MasterCatalogItem } from './types';
import { ProductsView } from './components/ProductsView';
import { InvoicesView } from './components/InvoicesView';
import { InstallmentReconciliationView } from './components/InstallmentReconciliationView';
import { UserManagementView } from './components/UserManagementView';
import { PartnersView } from './components/PartnersView';
import { StoreSettingsView } from './components/StoreSettingsView';
import { MoreHubView } from './components/MoreHubView';
import { HRHubView } from './components/HRHubView';
import { SOPManagementView } from './components/SOPManagementView';
import { StandaloneCheckInView } from './components/StandaloneCheckInView';
import { TechWorkspaceView } from './components/TechWorkspaceView';
import { SalesWorkspaceView } from './components/SalesWorkspaceView';
import { AICopilotModal } from './components/AICopilotModal';
import { ExecutiveAIAssistantModal } from './components/ExecutiveAIAssistantModal';
import { QuickSearchModal } from './components/QuickSearchModal';
import { PhoneHouseLoginPage } from './components/PhoneHouseLoginPage';
import { testFirestoreConnection, auth } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  seedInitialDataIfEmpty,
  subscribeToDevices,
  addDeviceToFirestore,
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
  transferFundsInFirestore,
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
  updateCashTransactionInFirestore,
  deleteCashTransactionFromFirestore,
  executeFundTransferInFirestore,
  subscribeToTransfers,
  addTransferToFirestore,
  updateTransferInFirestore,
  deleteTransferFromFirestore,
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

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('ADMIN');

  // Persistence State
  const [devices, setDevices] = useState<DeviceItem[]>(() => {
    const saved = localStorage.getItem('istore_devices');
    return saved ? JSON.parse(saved) : INITIAL_DEVICES;
  });

  const [leads, setLeads] = useState<Lead[]>(() => {
    const saved = localStorage.getItem('istore_leads');
    return saved ? JSON.parse(saved) : INITIAL_LEADS;
  });

  const [tradeIns, setTradeIns] = useState<TradeInAppraisal[]>(() => {
    const saved = localStorage.getItem('istore_tradeins');
    return saved ? JSON.parse(saved) : INITIAL_TRADE_INS;
  });

  const [warrantyTickets, setWarrantyTickets] = useState<WarrantyTicket[]>(() => {
    const saved = localStorage.getItem('istore_warranty');
    return saved ? JSON.parse(saved) : INITIAL_WARRANTY_TICKETS;
  });

  const [invoices, setInvoices] = useState<SalesInvoice[]>(() => {
    const saved = localStorage.getItem('istore_invoices');
    return saved ? JSON.parse(saved) : INITIAL_INVOICES;
  });

  const [users, setUsers] = useState<UserAccount[]>(() => {
    const saved = localStorage.getItem('istore_users');
    return saved ? JSON.parse(saved) : INITIAL_USERS;
  });

  const [partners, setPartners] = useState<Partner[]>(() => {
    const saved = localStorage.getItem('istore_partners');
    return saved ? JSON.parse(saved) : INITIAL_PARTNERS;
  });

  const [funds, setFunds] = useState<FundAccount[]>(() => {
    const saved = localStorage.getItem('phonehouse_funds');
    return saved ? JSON.parse(saved) : INITIAL_FUNDS;
  });

  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>(() => {
    const saved = localStorage.getItem('phonehouse_cash_transactions');
    return saved ? JSON.parse(saved) : INITIAL_CASH_TRANSACTIONS;
  });

  
  const [catalogItems, setCatalogItems] = useState<MasterCatalogItem[]>(() => {
    const saved = localStorage.getItem('phonehouse_catalog');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Force update if the cached version has fewer items than our new programmatic 400+ SKU generation
      if (parsed.length < 100) return INITIAL_CATALOG_ITEMS;
      return parsed;
    }
    return INITIAL_CATALOG_ITEMS;
  });

  const [products, setProducts] = useState<ProductItem[]>(() => {
    const saved = localStorage.getItem('phonehouse_products');
    if (saved) return JSON.parse(saved);
    return [
      {
        id: 'PROD-1A2B3C',
        sku: 'PK-OP15PM-TR',
        name: 'Ốp lưng iPhone 15 Pro Max Trong Suốt Magsafe',
        category: 'Phụ kiện',
        brand: 'Torras',
        buyPrice: 150000,
        sellPrice: 350000,
        stockQuantity: 45,
        minStockLevel: 10,
        status: 'active'
      },
      {
        id: 'PROD-4D5E6F',
        sku: 'PK-SAC20W-AP',
        name: 'Củ sạc Apple 20W Type-C Chính hãng (VN/A)',
        category: 'Phụ kiện',
        brand: 'Apple',
        buyPrice: 380000,
        sellPrice: 550000,
        stockQuantity: 28,
        minStockLevel: 15,
        status: 'active'
      },
      {
        id: 'PROD-7G8H9I',
        sku: 'LK-PIN-13PM-ZN',
        name: 'Pin thay thế iPhone 13 Pro Max',
        category: 'Linh kiện',
        brand: 'Zin bóc máy',
        buyPrice: 650000,
        sellPrice: 1200000,
        stockQuantity: 5,
        minStockLevel: 10,
        status: 'active'
      }
    ];
  });

  const [transfers, setTransfers] = useState<StockTransferSlip[]>(() => {
    const saved = localStorage.getItem('phonehouse_transfers');
    return saved ? JSON.parse(saved) : INITIAL_TRANSFERS;
  });

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => {
    const saved = localStorage.getItem('phonehouse_purchase_orders');
    return saved ? JSON.parse(saved) : INITIAL_PURCHASE_ORDERS;
  });

  const [branches, setBranches] = useState<StoreBranch[]>(() => {
    const saved = localStorage.getItem('phonehouse_branches');
    return saved ? JSON.parse(saved) : INITIAL_BRANCHES;
  });

  const [warehouses, setWarehouses] = useState<WarehouseInfo[]>(() => {
    const saved = localStorage.getItem('phonehouse_warehouses');
    return saved ? JSON.parse(saved) : INITIAL_WAREHOUSES;
  });

  const [spareParts, setSpareParts] = useState<SparePart[]>([]);

  const [storeSettings, setStoreSettings] = useState<StoreSettings>(() => {
    const saved = localStorage.getItem('phonehouse_store_settings');
    return saved ? JSON.parse(saved) : INITIAL_STORE_SETTINGS;
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

  // Current Logged-in User Account (Default to Admin nhattank16.1@gmail.com)
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem('phonehouse_active_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved user:', e);
      }
    }
    // Default to Primary Admin Nhật Tân
    return INITIAL_USERS.find(u => u.email === 'nhattank16.1@gmail.com') || INITIAL_USERS[0];
  });

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
  
  // Calculate the currently active branch to filter by (ADMIN can select, others use their assigned branch)
  
    const [attendanceRecords, setAttendanceRecords] = useState(INITIAL_TODAY_ATTENDANCE_LIST);

  // Time-tracking functions
  const handleCheckIn = (time: string) => {
    if (!currentUser) return;
    setAttendanceRecords(prev => {
      const today = new Date().toISOString().split('T')[0];
      const existing = prev.find(a => a.staffId === currentUser.id && a.date === today);
      if (existing && existing.checkInTime) {
        alert(`Bạn đã chấm công vào ca hôm nay lúc ${existing.checkInTime}. Không thể chấm công lại.`);
        return prev;
      }
        return [...prev, {
          id: `ATT_${Date.now()}`,
          staffId: currentUser.id,
          staffName: currentUser.displayName,
          role: currentUser.role,
          branchId: currentUser.branchId || 'CN01',
          branchName: 'Chi nhánh hiện tại',
          date: today,
          shiftName: 'Ca làm việc',
          scheduledStart: '08:00',
          scheduledEnd: '17:30',
          checkInTime: time,
          status: 'ON_TIME',
          workDurationMinutes: 0,
          breakDurationMinutes: 0,
          netWorkMinutes: 0,
          verification: { method: 'WIFI_IP', verified: true }
        }];
    });
  };

  const handleCheckOut = (time: string) => {
    if (!currentUser) return;
    setAttendanceRecords(prev => {
      const today = new Date().toISOString().split('T')[0];
      return prev.map(a => 
        (a.staffId === currentUser.id && a.date === today) 
          ? { ...a, checkOutTime: time } 
          : a
      );
    });
  };

  const currentAttendance = attendanceRecords.find(a => a.staffId === currentUser?.id && a.date === new Date().toISOString().split('T')[0]);

  const activeBranchId = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER' 
    ? (currentUser.role === 'MANAGER' && selectedBranchId === 'ALL' ? currentUser.branchId : selectedBranchId)
    : currentUser?.branchId;

  // Filtered Data based on Active Branch
  const filteredDevices = activeBranchId === 'ALL' || !activeBranchId 
    ? devices 
    : devices.filter(d => 
        d.branchId === activeBranchId || 
        (d.warehouse && warehouses.find(w => w.id === d.warehouse)?.parentWarehouseId === activeBranchId) ||
        (d.warehouse && warehouses.find(w => w.id === d.warehouse)?.systemType === branches.find(b => b.id === activeBranchId)?.systemType)
      );

  const filteredLeads = activeBranchId === 'ALL' || !activeBranchId 
    ? leads 
    : leads.filter(l => l.branchId === activeBranchId || !l.branchId); // Fallback to all if lead has no branch yet

  const filteredTradeIns = activeBranchId === 'ALL' || !activeBranchId 
    ? tradeIns 
    : tradeIns.filter(t => t.branchId === activeBranchId || !t.branchId);

  const filteredWarrantyTickets = activeBranchId === 'ALL' || !activeBranchId 
    ? warrantyTickets 
    : warrantyTickets.filter(w => w.branchId === activeBranchId || !w.branchId);

  const filteredInvoices = activeBranchId === 'ALL' || !activeBranchId 
    ? invoices 
    : invoices.filter(i => {
        const currentBranchName = branches.find(b => b.id === activeBranchId)?.name;
        return i.branch === currentBranchName || !i.branch; // Assuming invoice.branch holds the branch name currently
      });

  const filteredCashTransactions = activeBranchId === 'ALL' || !activeBranchId 
    ? cashTransactions 
    : cashTransactions.filter(c => c.branchId === activeBranchId || !c.branchId);

  const filteredUsers = activeBranchId === 'ALL' || !activeBranchId 
    ? users 
    : users.filter(u => u.branchId === activeBranchId);

    const filteredPurchaseOrders = activeBranchId === 'ALL' || !activeBranchId
    ? purchaseOrders
    : purchaseOrders.filter(o => {
        const currentWarehouseId = branches.find(b => b.id === activeBranchId)?.warehouseId;
        return o.warehouseId === currentWarehouseId || !o.warehouseId;
      });

  const filteredPartners = activeBranchId === 'ALL' || !activeBranchId 
    ? partners 
    : partners.filter(p => p.branchId === activeBranchId || !p.branchId);

  const filteredTransfers = activeBranchId === 'ALL' || !activeBranchId 
    ? transfers 
    : transfers.filter(t => {
        // A transfer is visible if the branch's warehouse is either the source or the destination
        const currentWarehouseId = branches.find(b => b.id === activeBranchId)?.warehouseId;
        return t.fromWarehouse === currentWarehouseId || t.toWarehouse === currentWarehouseId;
      });

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

    // 2. Setup real-time Firestore subscriptions (bypassing auth check since local login might be used)
    seedInitialDataIfEmpty();

    unsubDevices = subscribeToDevices((remoteDevices) => {
      if (remoteDevices && remoteDevices.length > 0) {
        setDevices(remoteDevices);
      }
    });

    unsubLeads = subscribeToLeads((remoteLeads) => {
      if (remoteLeads && remoteLeads.length > 0) {
        setLeads(remoteLeads);
      }
    });

    unsubTradeIns = subscribeToTradeIns((remoteTradeIns) => {
      if (remoteTradeIns && remoteTradeIns.length > 0) {
        setTradeIns(remoteTradeIns);
      }
    });

    unsubWarranty = subscribeToWarrantyTickets((remoteWarranty) => {
      if (remoteWarranty && remoteWarranty.length > 0) {
        setWarrantyTickets(remoteWarranty);
      }
    });

    unsubInvoices = subscribeToInvoices((remoteInvoices) => {
      if (remoteInvoices && remoteInvoices.length > 0) {
        setInvoices(remoteInvoices);
      }
    });

    unsubUsers = subscribeToUsers((remoteUsers) => {
      if (remoteUsers && remoteUsers.length > 0) {
        setUsers(remoteUsers);
      }
    });

    unsubPartners = subscribeToPartners((remotePartners) => {
      if (remotePartners && remotePartners.length > 0) {
        setPartners(remotePartners);
      }
    });

    unsubFunds = subscribeToFunds((remoteFunds) => {
      if (remoteFunds && remoteFunds.length > 0) {
        setFunds(remoteFunds);
      }
    });

    unsubCashTxs = subscribeToCashTransactions((remoteTxs) => {
      if (remoteTxs && remoteTxs.length > 0) {
        setCashTransactions(remoteTxs);
      }
    });

    unsubTransfers = subscribeToTransfers((remoteTransfers) => {
      if (remoteTransfers && remoteTransfers.length > 0) {
        setTransfers(remoteTransfers);
      }
    });

    unsubProducts = subscribeToProducts((remoteProducts) => {
      if (remoteProducts && remoteProducts.length > 0) {
        setProducts(remoteProducts);
      }
    });

    unsubBranches = subscribeToBranches((remoteBranches) => {
      if (remoteBranches) {
        setBranches(remoteBranches);
      }
    });

    unsubWarehouses = subscribeToWarehouses((remoteWarehouses) => {
      if (remoteWarehouses && remoteWarehouses.length > 0) {
        setWarehouses(remoteWarehouses);
      }
    });

    unsubStoreSettings = subscribeToStoreSettings((remoteSettings) => {
      if (remoteSettings) {
        setStoreSettings(remoteSettings);
      }
    });

    unsubPurchaseOrders = subscribeToPurchaseOrders((remoteOrders) => {
      if (remoteOrders && remoteOrders.length > 0) {
        setPurchaseOrders(remoteOrders);
      }
    });

    unsubCatalog = subscribeToCatalog((remoteCatalog) => {
      if (remoteCatalog && remoteCatalog.length > 0) {
        setCatalogItems(remoteCatalog);
      }
    });

    unsubAttendance = subscribeToAttendance((remoteAttendance) => {
      if (remoteAttendance && remoteAttendance.length > 0) {
        setAttendanceRecords(remoteAttendance);
      }
    });

    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        setUsers(currentUsers => {
          const matched = currentUsers.find(u => u.email?.toLowerCase() === fbUser.email?.toLowerCase() || u.id === fbUser.uid);
          if (matched) {
            setCurrentUser(matched);
          }
          return currentUsers;
        });
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
      unsubAttendance();
    };
  }, []);

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
  const handleAddDevice = (device: DeviceItem) => {
    setDevices([device, ...devices]);
    addDeviceToFirestore(device);
  };

  const handleAddMultipleDevices = (newDevices: DeviceItem[]) => {
    setDevices(prev => [...newDevices, ...prev]);
    newDevices.forEach(d => addDeviceToFirestore(d));
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
    // 1. Add invoice to state
    setInvoices(prev => [invoice, ...prev]);

    // 2. Mark sold devices
    const soldIds = devicesSold.map(d => d.id);
    setDevices(prev => prev.map(d => soldIds.includes(d.id) ? { ...d, status: 'sold', customerName: invoice.customerName, customerPhone: invoice.customerPhone } : d));

    // 3. Decrease accessory stock
    if (accessoriesSold.length > 0) {
      setProducts(prev => prev.map(p => {
        const soldItem = accessoriesSold.find(acc => acc.product.id === p.id);
        return soldItem ? { ...p, stockQuantity: Math.max(0, p.stockQuantity - soldItem.quantity) } : p;
      }));
    }

    // 4. Record cash transaction
    if (cashTx) {
      setCashTransactions(prev => [cashTx, ...prev]);
    }

    // 5. Update fund balance
    if (updatedFund) {
      setFunds(prev => prev.map(f => f.id === updatedFund.id ? { ...f, currentBalance: (f.currentBalance || 0) + (cashTx?.amount || 0) } : f));
    }
  };

  const handleUpdateInvoice = (invoice: SalesInvoice) => {
    setInvoices(invoices.map(inv => (inv.id === invoice.id ? invoice : inv)));
    updateInvoiceInFirestore(invoice);
  };

  const handleCancelInvoice = async (invoice: SalesInvoice, reason: string) => {
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
      fundToDeduct = funds.find(f => f.id === invoice.paymentFundId) || null;
      if (!fundToDeduct) {
        alert(`Lỗi kế toán: Không tìm thấy Quỹ gốc (Mã: ${invoice.paymentFundId}) của đơn hàng để hoàn tiền. Vui lòng kiểm tra cấu hình Quỹ.`);
        return;
      }
    } else {
      // Legacy invoice without paymentFundId: Prompt Admin to explicitly select refund fund
      const candidateFunds = funds.filter(f => !invoice.branchId || f.branchId === invoice.branchId || f.branchId === 'ALL');
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
        branchId: invoice.branchId || 'CN01',
        creator: currentUser?.displayName || 'Admin',
        status: 'COMPLETED',
        referenceCode: invoice.invoiceCode || invoice.id
      };
    }

    const customerPartner = partners.find(p => p.phone === invoice.customerPhone) || null;

    try {
      await cancelInvoiceInFirestore({
        invoiceId: invoice.id,
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
        status: 'CANCELLED',
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

      if (refundTx) {
        setCashTransactions(prev => [refundTx!, ...prev]);
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

  const handleAddPartner = (newPartner: Partner) => {
    setPartners([newPartner, ...partners]);
    addPartnerToFirestore(newPartner);
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
    setCashTransactions(prev => [newTx, ...prev]);
    addCashTransactionToFirestore(newTx);

    // 1. Update matching fund balance
    const fundToUpdate = funds.find(f => (newTx.fundId && f.id === newTx.fundId) || f.name === newTx.fundName || f.id === newTx.fundType || f.type === newTx.fundType);
    if (fundToUpdate) {
       const balanceDelta = newTx.type === 'RECEIPT' ? newTx.amount : -newTx.amount;
       const updatedFund = {
          ...fundToUpdate,
          currentBalance: fundToUpdate.currentBalance + balanceDelta,
          totalIncome: newTx.type === 'RECEIPT' ? (fundToUpdate.totalIncome || 0) + newTx.amount : fundToUpdate.totalIncome,
          totalExpense: newTx.type === 'PAYMENT' ? (fundToUpdate.totalExpense || 0) + newTx.amount : fundToUpdate.totalExpense
       };
       setFunds(prevFunds => prevFunds.map(f => f.id === updatedFund.id ? updatedFund : f));
       updateFundInFirestore(updatedFund);
    }
  };

  const handleAddTransfer = (slip: StockTransferSlip) => {
    setTransfers(prev => [slip, ...prev]);
    addTransferToFirestore(slip);

    // If transfer is in transit, lock devices by setting status to in_transit
    if (slip.status === 'IN_TRANSIT' && slip.items && slip.items.length > 0) {
      const deviceImeis = slip.items.map(i => i.imei).filter(Boolean);
      if (deviceImeis.length > 0) {
        setDevices(prev => prev.map(d => {
          if (deviceImeis.includes(d.imei)) {
            const updated = { ...d, status: 'in_transit' as any };
            updateDeviceInFirestore(updated);
            return updated;
          }
          return d;
        }));
      }
    }
  };

  const handleUpdateTransfer = (updatedSlip: StockTransferSlip) => {
    setTransfers(prev => prev.map(t => (t.id === updatedSlip.id ? updatedSlip : t)));
    updateTransferInFirestore(updatedSlip);

    // When completed, update warehouse and restore to in_stock
    if (updatedSlip.status === 'COMPLETED' && updatedSlip.items && updatedSlip.items.length > 0) {
      const deviceImeis = updatedSlip.items.map(i => i.imei).filter(Boolean);
      if (deviceImeis.length > 0) {
        setDevices(prev => prev.map(d => {
          if (deviceImeis.includes(d.imei)) {
            const targetBranch = branches.find(b => b.warehouseId === updatedSlip.toWarehouse);
            const updated: DeviceItem = { 
              ...d, 
              warehouseId: updatedSlip.toWarehouse, 
              status: 'in_stock',
              branchId: targetBranch?.id || d.branchId,
              branchName: targetBranch?.name || d.branchName
            };
            updateDeviceInFirestore(updated);
            return updated;
          }
          return d;
        }));
      }
    }
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

  const handleAddBranch = (newBranch: StoreBranch) => {
    setBranches(prev => [...prev, newBranch]);
    addBranchToFirestore(newBranch);
  };

  const handleUpdateBranch = (updatedBranch: StoreBranch) => {
    setBranches(prev => prev.map(b => b.id === updatedBranch.id ? updatedBranch : b));
    updateBranchInFirestore(updatedBranch);
  };

  const handleDeleteBranch = (branchId: string) => {
    setBranches(prev => prev.filter(b => b.id !== branchId));
    deleteBranchFromFirestore(branchId);
  };

  const handleAddWarehouse = (newWarehouse: WarehouseInfo) => {
    setWarehouses(prev => [...prev, newWarehouse]);
    addWarehouseToFirestore(newWarehouse);
  };

  const handleUpdateWarehouse = (updatedWarehouse: WarehouseInfo) => {
    setWarehouses(prev => prev.map(w => w.id === updatedWarehouse.id ? updatedWarehouse : w));
    updateWarehouseInFirestore(updatedWarehouse);
  };

  const handleDeleteWarehouse = (warehouseId: string) => {
    setWarehouses(prev => prev.filter(w => w.id !== warehouseId));
    deleteWarehouseFromFirestore(warehouseId);
  };

  const handleSaveStoreSettings = (newSettings: StoreSettings) => {
    setStoreSettings(newSettings);
    saveStoreSettingsToFirestore(newSettings);
  };

  // ==========================================
  // PURCHASE ORDERS (NHẬP HÀNG & NCC) HANDLERS
  // ==========================================
  const handleAddPurchaseOrder = (order: PurchaseOrder, autoCreateDevices: boolean) => {
    setPurchaseOrders(prev => [order, ...prev]);
    addPurchaseOrderToFirestore(order);

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
              warehouse: (order.warehouseId as WarehouseId) || 'KHO_TONG',
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
        }
      });

      if (newDevicesToAdd.length > 0) {
        handleAddMultipleDevices(newDevicesToAdd);
      }
    }
  };

  const handleUpdatePurchaseOrder = (updatedOrder: PurchaseOrder) => {
    setPurchaseOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    updatePurchaseOrderInFirestore(updatedOrder);
  };

  const handleDeletePurchaseOrder = (orderId: string) => {
    setPurchaseOrders(prev => prev.filter(o => o.id !== orderId));
    deletePurchaseOrderFromFirestore(orderId);
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

  const handleUpdateDevicesWarehouse = (deviceImeis: string[], targetWarehouse: WarehouseId) => {
    setDevices(prevDevices =>
      prevDevices.map(d => {
        if (deviceImeis.includes(d.imei)) {
          const updated = { ...d, warehouse: targetWarehouse };
          updateDeviceInFirestore(updated);
          return updated;
        }
        return d;
      })
    );
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
        currentBranch={branches.find(b => b.id === (selectedBranchId === 'ALL' ? branches[0]?.id : selectedBranchId)) || branches[0]}
        branches={branches}
        onSelectBranch={(b) => setSelectedBranchId(b.id)}
        onLogout={() => {
          setCurrentUser(null);
          localStorage.removeItem('phonehouse_active_user');
          setIsLoginModalOpen(true);
        }}
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
            devices={filteredDevices}
            branches={branches}
            warehouses={warehouses}
            partners={partners}
            funds={funds}
            transfers={transfers}
            warrantyTickets={warrantyTickets}
            invoices={invoices}
            users={filteredUsers}
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
            transfers={filteredTransfers}
            currentUser={currentUser}
            devices={filteredDevices}
            products={products}
            warehouses={warehouses}
            users={filteredUsers}
            onAddTransfer={handleAddTransfer}
            onUpdateTransfer={handleUpdateTransfer}
            onUpdateDevicesWarehouse={handleUpdateDevicesWarehouse}
            onAddWarrantyTicket={handleAddWarrantyTicket}
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
              currentBranch={branches.find(b => b.id === (selectedBranchId === 'ALL' ? branches[0]?.id : selectedBranchId)) || branches[0]}
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
            currentBranch={branches.find(b => b.id === (selectedBranchId === 'ALL' ? branches[0]?.id : selectedBranchId)) || branches[0]}
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
            currentBranch={branches.find(b => b.id === (selectedBranchId === 'ALL' ? branches[0]?.id : selectedBranchId)) || branches[0]}
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
              updatedFunds.forEach(f => updateFundInFirestore(f));
            }}
            onUpdatePartner={handleUpdatePartner}
          />
        )}

        {(activeTab === 'funds' || activeTab === 'cashbook') && (
          <CashbookView
            currentUser={currentUser}
            branches={branches}
            transactions={filteredCashTransactions}
            funds={funds}
            partners={partners}
            onAddTransaction={handleAddCashTransaction}
            onAddPartner={handleAddPartner}
            onUpdateFunds={(updatedFunds) => {
              setFunds(updatedFunds);
              updatedFunds.forEach(f => updateFundInFirestore(f));
            }}
            onTransferFunds={async (fromId, toId, amount, notes, creator) => {
              const fromFund = funds.find(f => f.id === fromId);
              const toFund = funds.find(f => f.id === toId);
              await transferFundsInFirestore({
                fromFundId: fromId,
                toFundId: toId,
                fromFundName: fromFund?.name || 'Quỹ nguồn',
                toFundName: toFund?.name || 'Quỹ đích',
                amount,
                note: notes,
                transferredBy: creator || currentUser?.displayName || 'Thủ quỹ',
                branchId: branches[0]?.id || 'CN01',
                branchName: branches[0]?.name || 'PhoneHouse'
              });
              setFunds(prev => prev.map(f => {
                if (f.id === fromId) return { ...f, currentBalance: (f.currentBalance || 0) - amount };
                if (f.id === toId) return { ...f, currentBalance: (f.currentBalance || 0) + amount };
                return f;
              }));
            }}
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

        {activeTab === 'store-settings' && (
          <StoreSettingsView
            branches={branches}
            warehouses={warehouses}
            settings={storeSettings}
            funds={funds}
            invoices={invoices}
            devices={devices}
            warrantyTickets={warrantyTickets}
            attendanceRecords={attendanceRecords}
            staffMembers={users as any}
            onAddBranch={handleAddBranch}
            onUpdateBranch={handleUpdateBranch}
            onDeleteBranch={handleDeleteBranch}
            onAddWarehouse={handleAddWarehouse}
            onUpdateWarehouse={handleUpdateWarehouse}
            onDeleteWarehouse={handleDeleteWarehouse}
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
            onLogout={() => {
              setCurrentUser(null);
              localStorage.removeItem('phonehouse_active_user');
              setActiveTab('login');
            }}
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

        {(activeTab === 'sop-management' || activeTab === 'sop') && (
          <SOPManagementView
            currentUser={currentUser}
            branches={branches}
          />
        )}

        {activeTab === 'checkin-portal' && (
          <StandaloneCheckInView
            currentUser={currentUser}
            branches={branches}
            attendanceRecords={attendanceRecords}
            onCheckInSuccess={(record) => {
              handleCheckIn(record.checkInTime);
            }}
            onClose={() => setActiveTab('dashboard')}
            onNavigateToHR={() => setActiveTab('hr-attendance')}
          />
        )}

        {(activeTab === 'hr-attendance' || activeTab === 'attendance') && (
          <HRHubView
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
            devices={filteredDevices}
            branches={branches}
            invoices={filteredInvoices}
            leads={filteredLeads}
            warehouses={warehouses}
            storeSettings={storeSettings}
            onCreateInvoice={handleCreateInvoice}
            onUpdateDeviceStatus={handleUpdateDeviceStatus}
            preSelectedDevice={posPreSelectedDevice}
            onNavigateToInvoices={() => setActiveTab('invoices')}
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
        staffMembers={users as any}
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
              onCheckInSuccess={(record) => {
                handleCheckIn(record.checkInTime);
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


