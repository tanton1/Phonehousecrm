export interface DeviceItem {
  id: string;
  imei: string;
  serialNo: string;
  model: string;
  storage: string;
  color: string;
  region: string; // VN/A, LL/A, ZA/A, J/A, KH/A
  batteryHealth: number; // e.g. 88%
  condition: 'New Seal' | 'Like New 99%' | '98% Cấn Nhẹ' | '95% Trầy Xước' | 'Hàng Cũ Trưng Bày';
  buyPrice: number;
  sellPrice: number;
  status: 'in_stock' | 'reserved' | 'sold' | 'warranty' | 'repairing';
  supplier: string;
  receivedDate: string;
  soldDate?: string;
  customerName?: string;
  customerPhone?: string;
  warrantyPeriodMonths: number;
  notes?: string;
  icloudStatus: 'Clean / Đã Thoát' | 'Chưa Check';
  screenStatus: 'Zin Màn Keng' | 'Zin Ép Kính' | 'Màn Thay GX/OLED' | 'Trầy Phẩy';
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  zalo?: string;
  source: 'Facebook Ads' | 'TikTok' | 'Zalo OA' | 'Khách Vãng Lai' | 'Khách Quen Giới Thiệu';
  interestedModel: string;
  budget: number;
  tradeInRequired: boolean;
  tradeInModel?: string;
  status: 'new' | 'contacted' | 'negotiating' | 'deposit' | 'won' | 'lost';
  assignedStaff: string;
  followUpDate: string;
  createdAt: string;
  notes: string;
  lastMessageSnippet?: string;
}

export interface TradeInAppraisal {
  id: string;
  customerName: string;
  phone: string;
  oldModel: string;
  storage: string;
  color: string;
  batteryPercent: number;
  bodyCondition: 'Keng Không Vết Xước' | 'Trầy Nhẹ Lông Mèo' | 'Cấn Móp Góc' | 'Cong Vỏ';
  screenCondition: 'Màn Zin Đẹp' | 'Màn Trầy Xước' | 'Màn Đã Ép Kính' | 'Màn Lô / Mực / Sọc';
  faceIdWorking: boolean;
  cameraWorking: boolean;
  icloudUnlocked: boolean;
  truetoneWorking: boolean;
  speakersWorking: boolean;
  estimatedValue: number;
  targetNewModel: string;
  targetNewModelPrice: number;
  upgradeDiffPrice: number;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  createdDate: string;
  inspectedBy: string;
  aiSuggestedPrice?: number;
  aiReasoning?: string;
}

export interface WarrantyTicket {
  id: string;
  ticketNumber: string;
  customerName: string;
  phone: string;
  imei: string;
  model: string;
  issueType: 'Nguồn / Mất Nguồn' | 'Màn Hình / Cảm Ứng' | 'Pin / Phù Pin' | 'Face ID / Camera' | 'Sóng / Wifi' | 'Loa / Mic' | 'Khác';
  faultDescription: string;
  technician: string;
  status: 'received' | 'inspecting' | 'waiting_parts' | 'repairing' | 'ready' | 'delivered';
  isWarrantyFree: boolean; // Bảo hành miễn phí hay sửa dịch vụ
  estimatedCost: number;
  finalCost: number;
  receivedDate: string;
  expectedReturnDate: string;
  completedDate?: string;
  solutionNotes?: string;
  aiDiagnostic?: string;
}

export interface SalesInvoice {
  id: string;
  invoiceCode?: string;
  customerName: string;
  customerPhone?: string;
  phone?: string;
  imeiList?: string[];
  devices?: {
    model: string;
    imei: string;
    price: number;
    color?: string;
    storage?: string;
  }[];
  items?: {
    model: string;
    imei: string;
    price: number;
    color?: string;
    storage?: string;
  }[];
  accessories: {
    name: string;
    price: number;
  }[];
  warrantyPackage: string; // Gói tiêu chuẩn 6T, Gói VIP 1 Đổi 1 12 Tháng...
  totalAmount: number;
  discountAmount: number;
  tradeInDiscount?: number;
  tradeInDeduction?: number;
  finalAmount: number;
  paymentMethod: 'Tiền mặt' | 'Chuyển khoản QR' | 'Thẻ POS' | 'Quẹt thẻ POS' | 'Trả góp 0% / CCCD' | 'Trả góp 0% Thẻ tín dụng' | 'Trả góp qua Cty Tài Chính (HD/Home/Mpos)';
  downPayment?: number;
  installmentCompany?: string;
  installmentTenorMonths?: number;
  monthlyPayment?: number;
  installmentDetails?: {
    financeCompany: string;
    tenorMonths: number;
    downPayment: number;
    monthlyPayment: number;
  };
  cashier?: string;
  salesStaff?: string;
  createdAt?: string;
  createdDate?: string;
  notes?: string;
}

export interface ERPNextModuleDocType {
  doctypeName: string;
  title?: string;
  module: string;
  description: string;
  fields: {
    fieldname: string;
    label: string;
    fieldtype: string;
    options?: string;
    reqd?: number;
  }[];
}

export type UserRole = 'ADMIN' | 'MANAGER' | 'SALES' | 'TECHNICIAN' | 'ACCOUNTANT';

export interface UserAccount {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  phone?: string;
  active: boolean;
  createdAt: string;
  avatarUrl?: string;
  lastLogin?: string;
  notes?: string;
}

export interface RolePermissionInfo {
  role: UserRole;
  nameVi: string;
  badgeColor: string;
  description: string;
  canManageUsers: boolean;
  canViewCostPrice: boolean;
  canViewRevenue: boolean;
  canManageInventory: boolean;
  canCreatePOS: boolean;
  canManageCRM: boolean;
  canApproveTradeIn: boolean;
  canManageWarranty: boolean;
  canExportData: boolean;
}

export type PartnerType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
export type CustomerTier = 'STANDARD' | 'SILVER' | 'GOLD' | 'DIAMOND' | 'WHOLESALE';
export type SupplierCategory = 'OFFICIAL_DISTRIBUTOR' | 'LIKE_NEW_WHOLESALER' | 'COMPONENTS' | 'FINANCE_PARTNER';

export interface PartnerDebtTransaction {
  id: string;
  date: string;
  type: 'DEBT_INCREASE' | 'PAYMENT';
  amount: number;
  note: string;
  referenceId?: string; // Invoice ID or PO ID
}

export interface Partner {
  id: string;
  type: PartnerType;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  taxCode?: string;
  // Customer Specifics
  customerTier?: CustomerTier;
  loyaltyPoints?: number;
  totalSpent?: number;
  deviceHistory?: string[]; // Array of purchased/trade-in IMEIs
  favoriteModel?: string;
  // Supplier Specifics
  supplierCategory?: SupplierCategory;
  totalPurchasedFrom?: number;
  qualityRating?: number; // 1 to 5
  warrantyPolicyDays?: number;
  // Financial & Debt Management
  outstandingDebt: number; // Positive: They owe us / We owe supplier
  creditLimit?: number;
  debtTransactions?: PartnerDebtTransaction[];
  // Meta
  createdAt: string;
  lastInteraction?: string;
  notes?: string;
  tags?: string[];
}
