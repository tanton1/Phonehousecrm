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
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { PurchaseOrdersView } from './components/PurchaseOrdersView';
import { InventoryView } from './components/InventoryView';
import { WarehouseTransfersView } from './components/WarehouseTransfersView';

import { MasterCatalogView } from './components/MasterCatalogView';
import { INITIAL_CATALOG_ITEMS } from './data/catalogData';
import { MasterCatalogItem } from './types';
import { ProductsView } from './components/ProductsView';
import { CRMLeadsView } from './components/CRMLeadsView';
import { OmnichannelChatView } from './components/OmnichannelChatView';
import { TradeInView } from './components/TradeInView';
import { WarrantyServiceView } from './components/WarrantyServiceView';
import { POSSalesView } from './components/POSSalesView';
import { InvoicesView } from './components/InvoicesView';
import { InstallmentReconciliationView } from './components/InstallmentReconciliationView';
import { ERPNextPlanView } from './components/ERPNextPlanView';
import { UserManagementView } from './components/UserManagementView';
import { PartnersView } from './components/PartnersView';
import { CashbookView } from './components/CashbookView';
import { StoreSettingsView } from './components/StoreSettingsView';
import { MoreHubView } from './components/MoreHubView';
import { HRHubView } from './components/HRHubView';
import { SOPManagementView } from './components/SOPManagementView';
import { StandaloneCheckInView } from './components/StandaloneCheckInView';
import { EmployeeDashboardView } from './components/EmployeeDashboardView';
import { TechWorkspaceView } from './components/TechWorkspaceView';
import { SalesWorkspaceView } from './components/SalesWorkspaceView';
import { AICopilotModal } from './components/AICopilotModal';
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
  updateSparePartInFirestore
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
  const [isAICopilotOpen, setIsAICopilotOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [posPreSelectedDevice, setPosPreSelectedDevice] = useState<DeviceItem | null>(null);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(true);

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
      if (existing) {
        return prev.map(a => a.id === existing.id ? { ...a, checkInTime: time, status: 'ON_TIME' } : a);
      } else {
        // Create new record
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
      }
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

    return () => {
      
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
    if (matched) {
      setPosPreSelectedDevice(matched);
    } else {
      setPosPreSelectedDevice(devices.find(d => d.status === 'in_stock') || null);
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

  const handleUpdateInvoice = (invoice: SalesInvoice) => {
    setInvoices(invoices.map(inv => (inv.id === invoice.id ? invoice : inv)));
    updateInvoiceInFirestore(invoice);
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
  };

  const handleUpdateTransfer = (updatedSlip: StockTransferSlip) => {
    setTransfers(prev => prev.map(t => (t.id === updatedSlip.id ? updatedSlip : t)));
    updateTransferInFirestore(updatedSlip);
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
      const targetFund = funds.find(f => f.id === order.fundId) || funds.find(f => f.type === order.paymentMethod) || funds[0];
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
  };

  const handleDeletePurchaseOrder = (orderId: string) => {
    setPurchaseOrders(prev => prev.filter(o => o.id !== orderId));
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
    const targetFund = funds.find(f => f.id === fundId || f.name === fundId) || funds[0];
    const supplier = partners.find(p => p.id === supplierId || (p.name && p.type === 'SUPPLIER'));

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
      <RoleSwitcher currentMode={workspaceMode} onModeChange={setWorkspaceMode} />

      {workspaceMode === 'SALES' && (
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
  onAutoPayDebt={handleAutoPayDebt}
          onOpenNewDeviceModal={() => setActiveTab('inventory')}
          onOpenCheckIn={() => setIsCheckInModalOpen(true)}
          onAddLead={handleAddLead}
          onUpdateLead={handleUpdateLead}
          onConvertLeadToSale={handleConvertLeadToSale}
            onUpdateUser={handleUpdateUser}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
          attendanceRecord={currentAttendance}
          attendanceRecords={attendanceRecords}
          tradeIns={tradeIns}
          onAddTradeIn={handleAddTradeIn}
          onUpdateTradeIn={handleUpdateTradeIn}
          onAddDevice={handleAddDevice}
        />
      )}

      {workspaceMode === 'TECH' && (
        <TechWorkspaceView
  tasks={filteredWarrantyTickets}
  currentUser={currentUser}
  devices={filteredDevices}
  branches={branches}
  onCheckIn={handleCheckIn}
  onCheckOut={handleCheckOut}
  onOpenCheckIn={() => setIsCheckInModalOpen(true)}
          attendanceRecord={currentAttendance}
          attendanceRecords={attendanceRecords}
        />
      )}

      {workspaceMode === 'ADMIN' && (
        <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col font-sans selection:bg-orange-500 selection:text-white">
      <GeofenceBackgroundTracker currentUser={currentUser} />
          {/* Top Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenQuickSearch={() => setIsQuickSearchOpen(true)}
        onOpenNewDeviceModal={() => setActiveTab('inventory')}
        onOpenNewLeadModal={() => setActiveTab('crm')}
        onOpenPOSModal={() => {
          setPosPreSelectedDevice(null);
          setActiveTab('pos');
        }}
        onOpenAICopilot={() => setIsAICopilotOpen(true)}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        currentUser={currentUser}
            onLogout={() => {
          setCurrentUser(null);
          localStorage.removeItem('phonehouse_active_user');
          setIsLoginModalOpen(true);
        }}
        stockCount={filteredDevices.filter(d => d.status === 'in_stock').length}
        leadCount={filteredLeads.filter(l => l.status !== 'won' && l.status !== 'lost').length}
        warrantyCount={filteredWarrantyTickets.filter(w => w.status !== 'delivered').length}
        transferCount={filteredTransfers.length}
        userCount={filteredUsers.length}
        isFirebaseSyncing={isFirebaseConnected}
        selectedBranchId={selectedBranchId}
        onBranchChange={setSelectedBranchId}
        branches={branches}
            />

      {/* Main Content View Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-1 sm:px-4 lg:px-8 pt-2 sm:pt-6 pb-20 md:pb-8">

        

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
          <DashboardView
  currentUser={currentUser}
  devices={filteredDevices}
  branches={branches}
  leads={filteredLeads}
  tradeIns={filteredTradeIns}
  warrantyTickets={filteredWarrantyTickets}
  invoices={filteredInvoices}
  onNavigate={(tab) => setActiveTab(tab)}
            onOpenPOS={() => {
              setPosPreSelectedDevice(null);
              setActiveTab('pos');
            }}
            onOpenTradeIn={() => setActiveTab('tradein')}
            onOpenNewDevice={() => setActiveTab('inventory')}
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
            onQuickSell={handleQuickSell}
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
  onAddItem={(item) => setCatalogItems([...catalogItems, item])}
            onUpdateItem={(item) => setCatalogItems(catalogItems.map(i => i.id === item.id ? item : i))}
            onDeleteItem={(id) => setCatalogItems(catalogItems.filter(i => i.id !== id))}
          />
        )}

        {activeTab === 'products' && (
          <ProductsView
  products={products}
  onAddProduct={(p) => {
              setProducts([...products, p]);
              addProductToFirestore(p);
            }}
            onUpdateProduct={(p) => {
              setProducts(products.map(prod => prod.id === p.id ? p : prod));
              updateProductInFirestore(p);
            }}
            onDeleteProduct={(id) => {
              setProducts(products.filter(p => p.id !== id));
              deleteProductFromFirestore(id);
            }}
          />
        )}

        {activeTab === 'crm' && (
          <CRMLeadsView
  currentUser={currentUser}
  branches={branches}
  leads={filteredLeads}
  devices={filteredDevices}
  onAddLead={handleAddLead}
  onUpdateLead={handleUpdateLead}
  onConvertLeadToSale={handleConvertLeadToSale}
  onNavigateToOmnichannelChat={() => setActiveTab('omnichannel-chat')}
/>
        )}

        {activeTab === 'omnichannel-chat' && (
          <OmnichannelChatView
  currentUser={currentUser}
  devices={filteredDevices}
  branches={branches}
  leads={filteredLeads}
  invoices={filteredInvoices}
  onConvertChatToPOS={(device, customer) => {
              setPosPreSelectedDevice(device);
              setActiveTab('pos');
            }
}
            onConvertChatToLead={(newLead) => {
              handleAddLead(newLead);
              setActiveTab('crm');
            }}
            onConvertChatToTradeIn={(customerName, phone, oldModel) => {
              setActiveTab('tradein');
            }}
          />
        )}

        {activeTab === 'tradein' && (
          <TradeInView
  currentUser={currentUser}
  branches={branches}
  tradeIns={filteredTradeIns}
  devices={filteredDevices}
  onAddTradeIn={handleAddTradeIn}
  onUpdateTradeIn={handleUpdateTradeIn}
  onImportToInventory={handleAddDevice}
/>
        )}

        {activeTab === 'warranty' && (
          <WarrantyServiceView
  currentUser={currentUser}
  branches={branches}
  warrantyTickets={filteredWarrantyTickets}
  devices={filteredDevices}
  funds={funds}
  users={users}
  spareParts={spareParts}
  onUpdateSparePart={(updatedPart) => updateSparePartInFirestore(updatedPart)}
            onAddTicket={handleAddWarrantyTicket}
            onUpdateTicket={handleUpdateWarrantyTicket}
            onAddTransaction={handleAddCashTransaction}
            onOpenCheckIn={() => setActiveTab('checkin-portal')}
/>
        )}

        {activeTab === 'pos' && (
          <POSSalesView
  currentUser={currentUser}
  devices={filteredDevices}
  branches={branches}
  invoices={filteredInvoices}
  leads={filteredLeads}
  warehouses={warehouses}
  storeSettings={storeSettings}
  products={products}
  partners={partners}
  onCreateInvoice={handleCreateInvoice}
  onUpdateDeviceStatus={handleUpdateDeviceStatus}
  preSelectedDevice={posPreSelectedDevice}
  onNavigateToInvoices={() => setActiveTab('invoices')}
            funds={funds}
            onAddTransaction={handleAddCashTransaction}
            onAddTradeIn={handleAddTradeIn}
            onAddDevice={handleAddDevice}
            onOpenCheckIn={() => setActiveTab('checkin-portal')}
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
            }
}
            onUpdateInvoice={handleUpdateInvoice}
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
            }
}
            onUpdatePartner={handleUpdatePartner}
          />
        )}

        {activeTab === 'cashbook' && (
          <CashbookView
  currentUser={currentUser}
  branches={branches}
  transactions={filteredCashTransactions}
  funds={funds}
  partners={partners}
  onAddTransaction={handleAddCashTransaction}
  onUpdateFunds={(updatedFunds) => {
              setFunds(updatedFunds);
              updatedFunds.forEach(f => updateFundInFirestore(f));
            }
}
            onTransferFunds={handleTransferFunds}
          />
        )}

        {activeTab === 'partners' && (
          <PartnersView
  partners={filteredPartners}
  currentUser={currentUser}
  devices={filteredDevices}
  onAddPartner={handleAddPartner}
  onUpdatePartner={handleUpdatePartner}
  onDeletePartner={handleDeletePartner}
  funds={funds}
  onAddTransaction={handleAddCashTransaction}
/>
        )}

        {activeTab === 'store-settings' && (
          <StoreSettingsView
  branches={branches}
  warehouses={warehouses}
  settings={storeSettings}
  onAddBranch={handleAddBranch}
  onUpdateBranch={handleUpdateBranch}
  onDeleteBranch={handleDeleteBranch}
  onAddWarehouse={handleAddWarehouse}
  onUpdateWarehouse={handleUpdateWarehouse}
  onDeleteWarehouse={handleDeleteWarehouse}
  onSaveSettings={handleSaveStoreSettings}
  onBack={() => setActiveTab('more')}
          />
        )}

        {activeTab === 'more' && (
          <MoreHubView
  currentUser={currentUser}
  onSelectTab={(tabId) => setActiveTab(tabId)}
            onOpenPOSModal={() => setActiveTab('pos')}
            onOpenNewDeviceModal={() => setActiveTab('inventory')}
            onOpenAICopilot={() => setIsAICopilotOpen(true)}
            onOpenLoginModal={() => setIsLoginModalOpen(true)}
            onLogout={() => {
              setCurrentUser(null);
              setIsLoginModalOpen(true);
            }}
            partners={filteredPartners}
              branches={branches}
              invoices={filteredInvoices}
            devices={filteredDevices}
          />
        )}

        {activeTab === 'users' && (
          <UserManagementView
  users={filteredUsers}
  branches={branches}
  onAddUser={handleAddUser}
  onUpdateUser={handleUpdateUser}
  onDeleteUser={handleDeleteUser}
/>
        )}

        {activeTab === 'sop-management' && (
          <SOPManagementView
            branches={branches}
            staffMembers={filteredUsers.map(u => ({
              id: u.id,
              name: u.displayName,
              role: u.role,
              roleTitle: u.role === 'ADMIN' ? 'Ban Giám Đốc' : u.role === 'MANAGER' ? 'Cửa Hàng Trưởng' : u.role === 'TECHNICIAN' ? 'Kỹ Thuật Viên' : 'Chuyên Viên Bán Hàng',
              branchId: u.branchId || 'BRANCH_01',
              branchName: branches.find(b => b.id === u.branchId)?.name || 'Chi nhánh Hải Châu',
              avatar: u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
              phone: u.phone || '0905000111',
              email: u.email || 'staff@phonehouse.vn',
              allowedWifiSSID: 'PhoneHouse_Internal_5G'
            }))}
          />
        )}

        {activeTab === 'checkin-portal' && (
          <StandaloneCheckInView
            currentUser={currentUser}
            branches={branches}
            attendanceRecords={attendanceRecords}
            onCheckInSuccess={(record) => {
              setAttendanceRecords([record, ...attendanceRecords]);
            }}
            onNavigateToHR={() => setActiveTab('hr-attendance')}
          />
        )}

        {activeTab === 'hr-attendance' && (
          <HRHubView 
            attendanceRecords={attendanceRecords} 
            currentUser={currentUser}
            branches={branches}
            invoices={filteredInvoices}
            warrantyTickets={warrantyTickets}
            onNavigateToCheckIn={() => setActiveTab('checkin-portal')}
          />
        )}

        {(activeTab === 'employee-dashboard' || activeTab === 'employee-kpi') && (
          <EmployeeDashboardView
  currentUser={currentUser}
  branches={branches}
  invoices={filteredInvoices}
  warrantyTickets={filteredWarrantyTickets}
  users={filteredUsers}
  devices={filteredDevices}
  onNavigate={(tab) => setActiveTab(tab)}
            onOpenPOS={() => {
              setPosPreSelectedDevice(null);
              setActiveTab('pos');
            }}
            onOpenNewWarranty={() => setActiveTab('warranty')}
            onOpenCheckIn={() => setActiveTab('checkin-portal')}
          />
        )}

        {activeTab === 'tech-workspace' && (
          <TechWorkspaceView
  tasks={filteredWarrantyTickets}
  currentUser={currentUser}
  devices={filteredDevices}
  branches={branches}
  onOpenCheckIn={() => setActiveTab('checkin-portal')}
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
              tradeIns={filteredTradeIns}
            onAddTradeIn={handleAddTradeIn}
            onUpdateTradeIn={handleUpdateTradeIn}
            onAddDevice={handleAddDevice}
          />
        )}

        {activeTab === 'erpnext-plan' && (
          <ERPNextPlanView />
        )}
      </main>

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

      {/* Desktop Footer */}
      <footer className="hidden md:block border-t border-orange-100 bg-white py-4 text-center text-xs text-zinc-500 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-medium text-zinc-600">iStore Pro CRM & ERP • Kế thừa Frappe Framework & Cloud Firestore Enterprise</span>
          <div className="flex items-center space-x-3 text-zinc-500">
            <span className="font-semibold text-orange-600 flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
              <span>Firestore Connected</span>
            </span>
            <span>•</span>
            <button 
              onClick={() => setActiveTab('partners')} 
              className="text-orange-600 hover:text-orange-700 hover:underline font-bold cursor-pointer"
            >
              Đối Tác & NCC
            </button>
            <span>•</span>
            <button 
              onClick={() => setActiveTab('users')} 
              className="text-orange-600 hover:text-orange-700 hover:underline font-bold cursor-pointer"
            >
              Phân Quyền User
            </button>
            <span>•</span>
            <button 
              onClick={() => setActiveTab('erpnext-plan')} 
              className="text-orange-600 hover:text-orange-700 hover:underline font-bold cursor-pointer"
            >
              Xem Bản Vẽ ERPNext & Docker
            </button>
          </div>
        </div>
      </footer>
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


