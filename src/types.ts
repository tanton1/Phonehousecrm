export type WarehouseId = 'KHO_TONG' | 'KHO_PHONEHOUSE' | 'KHO_XSTORE' | string;

export interface WarehouseInfo {
  id: WarehouseId;
  name: string;
  shortName: string;
  code: string;
  address: string;
  manager: string;
  phone: string;
  color?: string;
  isMain?: boolean;
  type?: 'CENTRAL' | 'RETAIL_STORE' | 'REPAIR_WARRANTY' | 'TRANSIT';
  capacityNotes?: string;
  isActive?: boolean;
}

export interface StoreBranch {
  id: string;
  code: string; // CN-01, CN-02
  name: string; // PhoneHouse Cầu Giấy, PhoneHouse Trần Duy Hưng
  address: string;
  phone: string;
  email?: string;
  manager: string;
  openingHours: string;
  warehouseId: WarehouseId | string;
  isActive: boolean;
  isHeadquarter?: boolean;
  taxCode?: string;
  bankAccount?: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  };
  notes?: string;
}

export interface StoreSettings {
  companyName: string;
  brandName: string;
  hotline: string;
  supportEmail: string;
  website: string;
  taxCode: string;
  headquarterAddress: string;
  slogan: string;
  logoUrl?: string;
  printHeaderNote: string;
  printFooterNote: string;
  defaultWarrantyMonths: number;
  branches: StoreBranch[];
  warehouses: WarehouseInfo[];
}

export const WAREHOUSE_LIST: WarehouseInfo[] = [
  {
    id: 'KHO_TONG',
    name: 'Kho Tổng (Central Warehouse)',
    shortName: 'Kho Tổng',
    code: 'KT-01',
    address: 'Khu Công Nghệ Cao / Kho Phân Phối Trung Tâm, Hà Nội',
    manager: 'Nhật Tân (Giám Đốc Kho)',
    phone: '0988.999.888',
    color: 'from-orange-500 to-amber-500',
    isMain: true
  },
  {
    id: 'KHO_PHONEHOUSE',
    name: 'Kho PhoneHouse (Cầu Giấy)',
    shortName: 'Kho PhoneHouse',
    code: 'KPH-02',
    address: '136 Cầu Giấy, P. Quan Hoa, Q. Cầu Giấy, Hà Nội',
    manager: 'Tuấn Cửa Hàng Trưởng',
    phone: '0977.111.222',
    color: 'from-amber-500 to-orange-500'
  },
  {
    id: 'KHO_XSTORE',
    name: 'Kho Xstore (Trần Duy Hưng)',
    shortName: 'Kho Xstore',
    code: 'KXS-03',
    address: '88 Trần Duy Hưng, P. Trung Hòa, Q. Cầu Giấy, Hà Nội',
    manager: 'Hoàng Quản Lý Chi Nhánh',
    phone: '0966.333.444',
    color: 'from-blue-500 to-cyan-500'
  }
];

export interface StockTransferItem {
  type: 'device' | 'product';
  id: string; // Device ID or Product ID
  imei?: string;
  name: string;
  model?: string;
  color?: string;
  storage?: string;
  condition?: string;
  quantity: number;
  costPrice: number;
}

export interface StockTransferSlip {
  id: string;
  code: string; // CK-20250215-01
  fromWarehouse: WarehouseId;
  fromWarehouseName: string;
  toWarehouse: WarehouseId;
  toWarehouseName: string;
  createdDate: string;
  creator: string;
  transporter?: string;
  status: 'PENDING' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
  items: StockTransferItem[];
  totalQuantity: number;
  totalValue: number;
  notes?: string;
  receivedDate?: string;
  receiver?: string;
}

export interface ProductItem {
  id: string;
  sku: string;
  name: string;
  category: 'Phụ kiện' | 'Linh kiện' | 'Dịch vụ';
  brand: string;
  buyPrice: number;
  sellPrice: number;
  stockQuantity: number;
  minStockLevel: number;
  status: 'active' | 'inactive';
  warehouse?: WarehouseId | string;
  notes?: string;
}

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
  warehouse?: WarehouseId | string; // 'KHO_TONG' | 'KHO_PHONEHOUSE' | 'KHO_XSTORE'
  branch?: string;
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

export interface WarrantyTicketPart {
  id?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface WarrantyTicketTimeline {
  time: string;
  action: string;
  note?: string;
  user: string;
}

export interface WarrantyTicket {
  id: string;
  ticketNumber: string;
  customerName: string;
  phone: string;
  imei: string;
  model: string;
  color?: string;
  storage?: string;
  passcode?: string;
  icloudStatus?: string;
  deviceAppearance?: string;
  accessoriesIncluded?: string;
  issueType: 'Nguồn / Mất Nguồn' | 'Màn Hình / Cảm Ứng' | 'Pin / Phù Pin' | 'Face ID / Camera' | 'Sóng / Wifi' | 'Loa / Mic' | 'Khác' | 'Ép Kính / Thay Lưng' | 'Mainboard / IC Sạc';
  faultDescription: string;
  technician: string;
  status: 'received' | 'inspecting' | 'waiting_parts' | 'repairing' | 'ready' | 'delivered';
  isWarrantyFree: boolean; // Bảo hành miễn phí hay sửa dịch vụ
  repairCategory?: 'WARRANTY_FREE' | 'REPAIR_SERVICE';
  estimatedCost: number;
  finalCost: number;
  receivedDate: string;
  expectedReturnDate: string;
  completedDate?: string;
  deliveredDate?: string;
  solutionNotes?: string;
  technicianNotes?: string;
  aiDiagnostic?: string;
  partsUsed?: WarrantyTicketPart[];
  warrantyMonthsAfterRepair?: number;
  qcPassed?: boolean;
  paymentStatus?: 'UNPAID' | 'PAID';
  paymentFund?: string;
  timeline?: WarrantyTicketTimeline[];
}

export interface SalesInvoiceItem {
  sku?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  imei?: string;
  type?: 'phone' | 'accessory' | 'service';
  color?: string;
  storage?: string;
}

export interface SalesInvoice {
  id: string;
  invoiceCode?: string;
  customerName: string;
  customerPhone?: string;
  phone?: string;
  status?: 'completed' | 'pending' | 'cancelled';
  priceList?: string;
  salesChannel?: string;
  sellerName?: string;
  creatorName?: string;
  branch?: string;
  branchId?: string;
  warehouseId?: string;
  warehouseName?: string;
  paidAmount?: number;
  debtAmount?: number;
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
  detailedItems?: SalesInvoiceItem[];
  accessories: {
    name: string;
    price: number;
    quantity?: number;
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
  customerId?: string;
  installmentDisbursementStatus?: 'PENDING' | 'DISBURSED';
  installmentExpectedAmount?: number;
  installmentContractCode?: string;
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

// Cashbook (Sổ Quỹ) & Cashflow Management Types
export type CashTransactionType = 'RECEIPT' | 'PAYMENT'; // Phiếu Thu (RECEIPT) / Phiếu Chi (PAYMENT)
export type PaymentFundType = 'CASH' | 'BANK' | 'POS_CARD' | 'INSTALLMENT_CREDIT'; // Tiền mặt / Ngân hàng / Quẹt thẻ / Trả góp

export type CashReceiptCategory = 
  | 'SALES_REVENUE'        // Thu tiền bán hàng iPhone / Phụ kiện
  | 'CUSTOMER_DEBT_COLLECT'// Thu tiền nợ khách hàng
  | 'TRADEIN_DIFF_COLLECT' // Thu tiền bù chênh lệch Trade-in
  | 'DEPOSIT'              // Thu tiền đặt cọc giữ máy
  | 'REPAIR_SERVICE'       // Thu tiền dịch vụ sửa chữa / thay màn / pin
  | 'CAPITAL_INVEST'       // Thu bổ sung vốn chủ sở hữu / quỹ dự phòng
  | 'SUPPLIER_REFUND'      // NCC hoàn tiền hàng lỗi / chiết khấu
  | 'OTHER_INCOME';        // Thu nhập khác

export type CashPaymentCategory = 
  | 'INVENTORY_PURCHASE'   // Chi nhập hàng iPhone mới / Like New
  | 'SUPPLIER_DEBT_PAY'    // Chi thanh toán nợ Nhà Cung Cấp
  | 'TRADEIN_BUYBACK'      // Chi tiền mặt thu mua máy cũ của khách
  | 'STORE_RENT'           // Chi tiền thuê mặt bằng
  | 'SALARY_BONUS'         // Chi lương, thưởng nhân viên & hoa hồng bán lẻ
  | 'MARKETING_ADS'        // Chi quảng cáo Facebook / TikTok Ads / Seeding
  | 'UTILITIES'            // Chi điện, nước, internet, văn phòng phẩm
  | 'WARRANTY_PARTS'       // Chi mua linh kiện bảo hành / sửa chữa
  | 'CUSTOMER_REFUND'      // Chi hoàn tiền đổi trả cho khách
  | 'OTHER_EXPENSE';       // Chi phí khác

export interface CashTransaction {
  id: string;
  code: string; // PT-20250215-01 / PC-20250215-01
  type: CashTransactionType;
  category: CashReceiptCategory | CashPaymentCategory;
  categoryName: string;
  amount: number;
  fundType: PaymentFundType;
  fundName: string; // Quỹ Tiền Mặt Tại Két, VietQR Techcombank, MPOS Quẹt Thẻ, HD Saison...
  date: string; // ISO or YYYY-MM-DD HH:mm
  partnerId?: string;
  partnerName?: string;
  partnerType?: PartnerType;
  partnerPhone?: string;
  referenceCode?: string; // Mã Hóa đơn HD-..., Phiếu Nhập PN-..., Ticket BH-...
  creator: string; // Nhật Tân (Admin), Thu ngân Linh...
  notes: string;
  status: 'COMPLETED' | 'PENDING' | 'CANCELLED';
  attachments?: string[];
}

export interface FundAccount {
  id: string;
  name: string;
  type: PaymentFundType;
  accountNumber?: string;
  bankName?: string;
  branch?: string;
  qrCodeUrl?: string;
  currentBalance: number;
  openingBalance: number;
  totalIncome: number;
  totalExpense: number;
  isActive: boolean;
  color: string;
}

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

// ==========================================
// PHONEHOUSE HRM & PAYROLL SYSTEM TYPES
// ==========================================

export type StaffRole = 
  | 'SALES'          // Nhân viên bán hàng showroom
  | 'SALE_ONLINE'    // Sale Online / Trực page / Telesale
  | 'TECHNICIAN'     // Kỹ thuật viên sửa chữa & kiểm định
  | 'CASHIER'        // Thu ngân
  | 'WAREHOUSE'      // Thủ kho
  | 'STORE_MANAGER'  // Cửa hàng trưởng
  | 'ACCOUNTANT'     // Kế toán
  | 'ADMIN';         // Giám đốc / Ban quản trị

export interface StaffMember {
  id: string;
  code: string; // NV-001, NV-002
  name: string;
  avatar: string;
  role: StaffRole;
  roleTitle: string;
  phone: string;
  email: string;
  branchId: string;
  branchName: string;
  baseSalary: number;
  monthlyTargetRevenue: number;
  monthlyTargetOrders: number;
  status: 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';
  joinDate: string;
  allowedWifiSSID?: string;
  assignedFaceEmbedding?: boolean;
}

export type ShiftType = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FULL_DAY' | 'OFF';

export interface ShiftDefinition {
  id: string;
  name: string; // Ca sáng, Ca chiều, Ca tối
  type: ShiftType;
  startTime: string; // '08:00'
  endTime: string;   // '17:00'
  breakDurationMinutes: number;
  color: string;
  badgeBg: string;
  badgeText: string;
}

export interface DayShiftAssignment {
  shiftId: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  status: 'SCHEDULED' | 'CHECKED_IN' | 'COMPLETED' | 'SWAP_REQUESTED' | 'SWAP_APPROVED' | 'OFF';
}

export interface WeeklyShiftSchedule {
  id: string;
  staffId: string;
  staffName: string;
  role: StaffRole;
  branchId: string;
  weekStartDate: string; // YYYY-MM-DD
  days: {
    [dateStr: string]: DayShiftAssignment;
  };
}

export type AttendanceVerificationStatus = 'VERIFIED' | 'PENDING' | 'FAILED';

export interface AttendanceRecord {
  id: string;
  staffId: string;
  staffName: string;
  role: StaffRole;
  branchId: string;
  branchName: string;
  date: string; // YYYY-MM-DD
  shiftName: string;
  scheduledStart: string;
  scheduledEnd: string;
  
  // Realtime Timestamps
  checkInTime?: string; // HH:mm:ss
  checkOutTime?: string;
  workDurationMinutes: number;
  breakDurationMinutes: number;
  netWorkMinutes: number;
  
  // 4-Factor Verification Checklist
  verification: {
    gpsVerified: boolean;
    gpsDistanceMeters?: number;
    wifiVerified: boolean;
    wifiSSID?: string;
    faceVerified: boolean;
    qrScanned: boolean;
    checkInPhoto?: string;
  };

  // Status & Current Live Activity
  status: 'ON_TIME' | 'LATE' | 'EARLY_LEAVE' | 'ABSENT' | 'IN_PROGRESS' | 'COMPLETED';
  currentActivity?: 'WORKING' | 'BREAK' | 'OUTSIDE' | 'DELIVERY' | 'SUPPORT_TECH';
  lateMinutes: number;
  earlyMinutes: number;
  otMinutes: number;

  // Daily Live KPI Progress
  kpiProgress: {
    consultedCount: number;
    targetConsulted: number;
    orderCount: number;
    targetOrders: number;
    revenue: number;
    targetRevenue: number;
  };

  activityHistory: Array<{
    timestamp: string;
    action: string;
    notes?: string;
  }>;
}

export interface LeaveRequest {
  id: string;
  code: string; // NP-202608-01
  staffId: string;
  staffName: string;
  role: StaffRole;
  branchName: string;
  type: 'ANNUAL_LEAVE' | 'HALF_DAY' | 'UNPAID' | 'SHIFT_SWAP' | 'SICK_LEAVE';
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  swapWithStaffId?: string;
  swapWithStaffName?: string;
  swapDate?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

export type CommissionType = 
  | 'DEVICE_SALE'          // Hoa hồng bán máy iPhone / iPad / MacBook
  | 'ACCESSORY_SALE'       // Hoa hồng ốp, sạc, dán cường lực
  | 'CARE_PACKAGE'         // Gói bảo hành VIP / Rơi vỡ
  | 'ONLINE_LEAD_SPLIT'    // 30% Sale Online
  | 'STORE_CLOSER_SPLIT'   // 70% Nhân viên chốt đơn tại cửa hàng
  | 'TECH_REPAIR'          // Hoa hồng / Điểm kỹ thuật viên sửa chữa
  | 'TRADEIN_BONUS';       // Thưởng thu cũ đổi mới

export interface CommissionTransaction {
  id: string;
  employeeId: string;
  employeeName: string;
  role: StaffRole;
  orderId: string;
  orderCode: string;
  orderItemId?: string;
  productName: string;
  imei?: string;
  branchId: string;
  type: CommissionType;
  baseAmount: number;     // Doanh số bán hoặc Giá trị đơn
  profitAmount: number;   // Lợi nhuận gộp hợp lệ
  commissionRate: number; // 2%, 3%, 5% hoặc điểm
  commissionAmount: number; // Tiền hoa hồng thực nhận
  status: 'PENDING' | 'CONFIRMED' | 'REVERSED' | 'PAID';
  policyId: string;
  policyVersion: string;
  occurredAt: string;
  approvedAt?: string;
  notes?: string;
}

export interface TechnicianPerformanceRecord {
  id: string;
  repairOrderId: string;
  repairCode: string;
  customerName: string;
  deviceModel: string;
  imei: string;
  issueDescription: string;
  technicianId: string;
  technicianName: string;
  repairType: 'BATTERY' | 'SCREEN' | 'GLASS' | 'MAINBOARD' | 'CAMERA' | 'SPEAKER' | 'OTHER';
  difficultyPoints: number; // Thay pin 1pt, Màn hình 2pt, Main 4pt
  qualityScore: number;     // 100%
  slaHoursTarget: number;
  slaHoursActual: number;
  isSlaMet: boolean;
  revenue: number;
  profit: number;
  commissionAmount: number;
  warrantyStatus: 'CLEAN' | 'UNDER_REVIEW' | 'TECH_FAULT' | 'PART_FAULT' | 'CUSTOMER_FAULT';
  completedAt: string;
}

export interface SalaryPolicy {
  id: string;
  name: string;
  role: StaffRole;
  branchId?: string;
  effectiveFrom: string;
  version: string;
  status: 'ACTIVE' | 'DRAFT';
  baseSalary: number;
  attendanceBonus: number; // 500k
  deviceProfitPercent: number; // 2%
  accessoryProfitPercent: number; // 3-5%
  carePackagePercent: number; // 10%
  onlineSaleSplitPercent: number; // 30%
  storeCloserSplitPercent: number; // 70%
  techPointRateVnd: number; // 50.000đ/điểm
  overtimeHourlyRate: number; // 35.000đ - 50.000đ/h
  kpiBonusTiers: Array<{
    minPercent: number;
    bonusAmount: number;
  }>;
}

export interface PayrollLedgerItem {
  id: string;
  employeeId: string;
  type: 
    | 'BASE_SALARY'
    | 'ATTENDANCE_BONUS'
    | 'COMMISSION_DEVICE'
    | 'COMMISSION_ACCESSORY'
    | 'COMMISSION_TECH'
    | 'KPI_BONUS'
    | 'OVERTIME'
    | 'ALLOWANCE'
    | 'ORDER_RETURN_DEDUCTION'
    | 'LATE_PENALTY'
    | 'SALARY_ADVANCE'
    | 'MANUAL_ADJUSTMENT';
  title: string;
  amount: number;
  isAddition: boolean;
  sourceCode?: string; // Mã HĐ, Mã IMEI, Mã đơn sửa, Mã phiếu tạm ứng
  occurredAt: string;
  description: string;
}

export interface MonthlyPayrollSlip {
  id: string;
  periodMonth: string; // '2026-08'
  employeeId: string;
  employeeName: string;
  role: StaffRole;
  roleTitle: string;
  branchName: string;
  bankAccount?: string;
  bankName?: string;
  
  // Working days
  standardWorkDays: number; // 26
  actualWorkDays: number;   // 25.5
  lateMinutesTotal: number;
  otHoursTotal: number;

  // Earnings
  baseSalary: number;
  attendanceBonus: number;
  deviceCommissionTotal: number;
  accessoryCommissionTotal: number;
  techCommissionTotal: number;
  kpiBonus: number;
  overtimeAmount: number;
  allowance: number;

  // Deductions
  returnDeductions: number;
  advanceSalaryDeductions: number;
  penaltyDeductions: number;

  // Totals
  grossTotal: number;
  deductionsTotal: number;
  netReceivable: number;

  // Approval Pipeline
  approvalStep: 1 | 2 | 3 | 4 | 5; // 1: CHT, 2: Kế toán, 3: Giám đốc, 4: Khóa kỳ, 5: Đã chi
  status: 'DRAFT' | 'STORE_APPROVED' | 'ACCOUNTANT_APPROVED' | 'DIRECTOR_APPROVED' | 'LOCKED' | 'PAID';
  approvalHistory: Array<{
    step: number;
    stepName: string;
    approverName: string;
    approvedAt: string;
    notes?: string;
  }>;
}
