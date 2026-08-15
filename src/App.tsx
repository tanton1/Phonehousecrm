import React, { useState, useEffect } from 'react';
import { 
  INITIAL_DEVICES, 
  INITIAL_LEADS, 
  INITIAL_TRADE_INS, 
  INITIAL_WARRANTY_TICKETS, 
  INITIAL_INVOICES,
  INITIAL_USERS,
  INITIAL_PARTNERS,
  INITIAL_FUNDS,
  INITIAL_CASH_TRANSACTIONS
} from './data/initialData';
import { 
  DeviceItem, 
  Lead, 
  TradeInAppraisal, 
  WarrantyTicket, 
  SalesInvoice, 
  UserAccount, 
  Partner, 
  FundAccount, 
  CashTransaction,
  ProductItem
} from './types';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { InventoryView } from './components/InventoryView';
import { ProductsView } from './components/ProductsView';
import { CRMLeadsView } from './components/CRMLeadsView';
import { TradeInView } from './components/TradeInView';
import { WarrantyServiceView } from './components/WarrantyServiceView';
import { POSSalesView } from './components/POSSalesView';
import { InvoicesView } from './components/InvoicesView';
import { InstallmentReconciliationView } from './components/InstallmentReconciliationView';
import { ERPNextPlanView } from './components/ERPNextPlanView';
import { UserManagementView } from './components/UserManagementView';
import { PartnersView } from './components/PartnersView';
import { CashbookView } from './components/CashbookView';
import { MoreHubView } from './components/MoreHubView';
import { AICopilotModal } from './components/AICopilotModal';
import { QuickSearchModal } from './components/QuickSearchModal';
import { PhoneHouseLoginPage } from './components/PhoneHouseLoginPage';
import { testFirestoreConnection } from './lib/firebase';
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
  deleteCashTransactionFromFirestore
} from './services/firestoreService';

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<string>('dashboard');

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
  const [posPreSelectedDevice, setPosPreSelectedDevice] = useState<DeviceItem | null>(null);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(true);

  // Initialize Firebase and subscribe to real-time collections
  useEffect(() => {
    // 1. Test connection to Firestore on boot
    testFirestoreConnection().then((ok) => {
      setIsFirebaseConnected(ok);
      // 2. Seed initial data if Firestore is empty
      seedInitialDataIfEmpty();
    });

    // 3. Setup real-time Firestore subscriptions
    const unsubDevices = subscribeToDevices((remoteDevices) => {
      if (remoteDevices && remoteDevices.length > 0) {
        setDevices(remoteDevices);
      }
    });

    const unsubLeads = subscribeToLeads((remoteLeads) => {
      if (remoteLeads && remoteLeads.length > 0) {
        setLeads(remoteLeads);
      }
    });

    const unsubTradeIns = subscribeToTradeIns((remoteTradeIns) => {
      if (remoteTradeIns && remoteTradeIns.length > 0) {
        setTradeIns(remoteTradeIns);
      }
    });

    const unsubWarranty = subscribeToWarrantyTickets((remoteWarranty) => {
      if (remoteWarranty && remoteWarranty.length > 0) {
        setWarrantyTickets(remoteWarranty);
      }
    });

    const unsubInvoices = subscribeToInvoices((remoteInvoices) => {
      if (remoteInvoices && remoteInvoices.length > 0) {
        setInvoices(remoteInvoices);
      }
    });

    const unsubUsers = subscribeToUsers((remoteUsers) => {
      if (remoteUsers && remoteUsers.length > 0) {
        setUsers(remoteUsers);
      }
    });

    const unsubPartners = subscribeToPartners((remotePartners) => {
      if (remotePartners && remotePartners.length > 0) {
        setPartners(remotePartners);
      }
    });

    const unsubFunds = subscribeToFunds((remoteFunds) => {
      if (remoteFunds && remoteFunds.length > 0) {
        setFunds(remoteFunds);
      }
    });

    const unsubCashTxs = subscribeToCashTransactions((remoteTxs) => {
      if (remoteTxs && remoteTxs.length > 0) {
        setCashTransactions(remoteTxs);
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
    };
  }, []);

  // Sync to localStorage as offline cache
  useEffect(() => {
    localStorage.setItem('istore_devices', JSON.stringify(devices));
  }, [devices]);

  useEffect(() => {
    localStorage.setItem('istore_leads', JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem('istore_tradeins', JSON.stringify(tradeIns));
  }, [tradeIns]);

  useEffect(() => {
    localStorage.setItem('istore_warranty', JSON.stringify(warrantyTickets));
  }, [warrantyTickets]);

  useEffect(() => {
    localStorage.setItem('istore_invoices', JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem('istore_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem('istore_partners', JSON.stringify(partners));
  }, [partners]);

  useEffect(() => {
    localStorage.setItem('phonehouse_funds', JSON.stringify(funds));
  }, [funds]);

  useEffect(() => {
    localStorage.setItem('phonehouse_cash_transactions', JSON.stringify(cashTransactions));
  }, [cashTransactions]);

  useEffect(() => {
    localStorage.setItem('phonehouse_products', JSON.stringify(products));
  }, [products]);

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
    const fundToUpdate = funds.find(f => f.name === newTx.fundName);
    if (fundToUpdate) {
       const balanceDelta = newTx.type === 'RECEIPT' ? newTx.amount : -newTx.amount;
       const updatedFund = {
          ...fundToUpdate,
          currentBalance: fundToUpdate.currentBalance + balanceDelta,
          totalIncome: newTx.type === 'RECEIPT' ? (fundToUpdate.totalIncome || 0) + newTx.amount : fundToUpdate.totalIncome,
          totalExpense: newTx.type === 'PAYMENT' ? (fundToUpdate.totalExpense || 0) + newTx.amount : fundToUpdate.totalExpense
       };
       setFunds(funds.map(f => f.id === updatedFund.id ? updatedFund : f));
       updateFundInFirestore(updatedFund);
    }

    // 2. If it's paying debt or collecting debt from a partner, auto-deduct outstandingDebt
    if (newTx.partnerId) {
      setPartners(prevPartners =>
        prevPartners.map(p => {
          if (p.id === newTx.partnerId) {
            const debtDelta = newTx.amount;
            const newDebt = Math.max(0, (p.outstandingDebt || 0) - debtDelta);
            const updated = { ...p, outstandingDebt: newDebt };
            updatePartnerInFirestore(updated);
            return updated;
          }
          return p;
        })
      );
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

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col font-sans selection:bg-orange-500 selection:text-white">
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
        stockCount={devices.filter(d => d.status === 'in_stock').length}
        leadCount={leads.filter(l => l.status !== 'won' && l.status !== 'lost').length}
        warrantyCount={warrantyTickets.filter(w => w.status !== 'delivered').length}
        userCount={users.length}
        isFirebaseSyncing={isFirebaseConnected}
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
            devices={devices}
            leads={leads}
            tradeIns={tradeIns}
            warrantyTickets={warrantyTickets}
            invoices={invoices}
            onNavigate={(tab) => setActiveTab(tab)}
            onOpenPOS={() => {
              setPosPreSelectedDevice(null);
              setActiveTab('pos');
            }}
            onOpenTradeIn={() => setActiveTab('tradein')}
            onOpenNewDevice={() => setActiveTab('inventory')}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            devices={devices}
            onAddDevice={handleAddDevice}
            onUpdateDevice={handleUpdateDevice}
            onDeleteDevice={handleDeleteDevice}
            onQuickSell={handleQuickSell}
          />
        )}

        {activeTab === 'products' && (
          <ProductsView
            products={products}
            onAddProduct={(p) => setProducts([...products, p])}
            onUpdateProduct={(p) => setProducts(products.map(prod => prod.id === p.id ? p : prod))}
            onDeleteProduct={(id) => setProducts(products.filter(p => p.id !== id))}
          />
        )}

        {activeTab === 'crm' && (
          <CRMLeadsView
            leads={leads}
            devices={devices}
            onAddLead={handleAddLead}
            onUpdateLead={handleUpdateLead}
            onConvertLeadToSale={handleConvertLeadToSale}
          />
        )}

        {activeTab === 'tradein' && (
          <TradeInView
            tradeIns={tradeIns}
            devices={devices}
            onAddTradeIn={handleAddTradeIn}
            onUpdateTradeIn={handleUpdateTradeIn}
            onImportToInventory={handleAddDevice}
          />
        )}

        {activeTab === 'warranty' && (
          <WarrantyServiceView
            warrantyTickets={warrantyTickets}
            devices={devices}
            onAddTicket={handleAddWarrantyTicket}
            onUpdateTicket={handleUpdateWarrantyTicket}
          />
        )}

        {activeTab === 'pos' && (
          <POSSalesView
            devices={devices}
            invoices={invoices}
            leads={leads}
            onCreateInvoice={handleCreateInvoice}
            onUpdateDeviceStatus={handleUpdateDeviceStatus}
            preSelectedDevice={posPreSelectedDevice}
            onNavigateToInvoices={() => setActiveTab('invoices')}
            funds={funds}
            onAddTransaction={handleAddCashTransaction}
          />
        )}

        {activeTab === 'invoices' && (
          <InvoicesView
            invoices={invoices}
            devices={devices}
            onNavigateToPOS={() => {
              setPosPreSelectedDevice(null);
              setActiveTab('pos');
            }}
            onUpdateInvoice={handleUpdateInvoice}
            onDeleteInvoice={handleDeleteInvoice}
          />
        )}

        {activeTab === 'installments' && (
          <InstallmentReconciliationView
            invoices={invoices}
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

        {activeTab === 'cashbook' && (
          <CashbookView
            transactions={cashTransactions}
            funds={funds}
            partners={partners}
            onAddTransaction={handleAddCashTransaction}
            onUpdateFunds={setFunds}
          />
        )}

        {activeTab === 'partners' && (
          <PartnersView
            partners={partners}
            devices={devices}
            onAddPartner={handleAddPartner}
            onUpdatePartner={handleUpdatePartner}
            onDeletePartner={handleDeletePartner}
            funds={funds}
            onAddTransaction={handleAddCashTransaction}
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
            partners={partners}
            invoices={invoices}
            devices={devices}
          />
        )}

        {activeTab === 'users' && (
          <UserManagementView
            users={users}
            onAddUser={handleAddUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
          />
        )}

        {activeTab === 'erpnext-plan' && (
          <ERPNextPlanView />
        )}
      </main>

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
            <span className="font-semibold text-emerald-600 flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
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
  );
}


