export type SystemBrand = 'TONG' | 'PHONEHOUSE' | 'XSTORE';
export type WarehouseType = 'CENTRAL' | 'RETAIL_STORE' | 'TECHNICIAN_SUB' | 'REPAIR_WARRANTY' | 'TRANSIT';
export type WarehouseId = 'KHO_TONG' | 'KHO_PHONEHOUSE' | 'KHO_XSTORE' | 'KHO_KTV_NAM' | 'KHO_KTV_TRONG' | 'KHO_KTV_DUONG' | 'KHO_KT_TONG' | string;

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
  systemType?: SystemBrand; // 'TONG' | 'PHONEHOUSE' | 'XSTORE'
  systemName?: string;
  type?: WarehouseType;
  technicianId?: string; // ID của Kỹ thuật viên nếu là kho con KTV
  technicianName?: string; // Tên KTV phụ trách
  parentWarehouseId?: WarehouseId; // Kho cha (ví dụ KHO_TONG)
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
  systemType?: SystemBrand; // 'TONG' | 'PHONEHOUSE' | 'XSTORE'
  isActive: boolean;
  isHeadquarter?: boolean;
  taxCode?: string;
  bankAccount?: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  };
  notes?: string;
  // GPS & Wi-Fi Check-in anti-spoofing config
  allowedWifiSSID?: string;
  storePublicIp?: string; // IP Tĩnh Router Wi-Fi cửa hàng (e.g. 113.161.45.88 hoặc nhiều IP phân cách dấu phẩy)
  gpsLatitude?: number;
  gpsLongitude?: number;
  allowedGpsRadiusMeters?: number;
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
  warrantyPackages?: { name: string; price: number }[];
  branches: StoreBranch[];
  warehouses: WarehouseInfo[];
}

export const WAREHOUSE_LIST: WarehouseInfo[] = [
  // 1. HỆ THỐNG TỔNG (CENTRAL HEADQUARTERS)
  {
    id: 'KHO_TONG',
    name: 'Tổng Kho Trung Tâm (Central Hub)',
    shortName: 'Kho Tổng',
    code: 'KT-01',
    address: 'Khu Công Nghệ Cao / Kho Phân Phối Trung Tâm, Hà Nội',
    manager: 'Nhật Tân (Giám Đốc Kho)',
    phone: '0988.999.888',
    color: 'from-rose-600 to-rose-600',
    systemType: 'TONG',
    systemName: 'Tổng Hệ Thống (Central)',
    type: 'CENTRAL',
    isMain: true,
    capacityNotes: 'Sức chứa 2.000 thiết bị & linh kiện phân phối'
  },
  {
    id: 'KHO_KT_TONG',
    name: 'Kho Kỹ Thuật Tổng (Lab & KCS)',
    shortName: 'Kho KT Tổng',
    code: 'KT-LAB-01',
    address: 'Tầng 2 - Trung Tâm Kỹ Thuật & Thẩm Định Tổng Kho',
    manager: 'Trưởng Phòng Kỹ Thuật',
    phone: '0988.777.666',
    color: 'from-rose-500 to-orange-600',
    systemType: 'TONG',
    systemName: 'Tổng Hệ Thống (Central)',
    type: 'TECHNICIAN_SUB',
    parentWarehouseId: 'KHO_TONG',
    technicianName: 'Bộ Phận Kỹ Thuật & KCS',
    capacityNotes: 'Kho thẩm định, test chức năng & chạy phần mềm'
  },
  {
    id: 'KHO_KTV_NAM',
    name: 'Kho KTV Nam (Kỹ Thuật Phần Cứng)',
    shortName: 'Kho KTV Nam',
    code: 'KTV-NAM',
    address: 'Bàn Kỹ Thuật 01 - Trạm Kỹ Thuật Tổng',
    manager: 'KTV Nam (Main & Phần Cứng)',
    phone: '0912.345.678',
    color: 'from-rose-600 to-orange-500',
    systemType: 'TONG',
    systemName: 'Tổng Hệ Thống (Central)',
    type: 'TECHNICIAN_SUB',
    parentWarehouseId: 'KHO_TONG',
    technicianId: 'STAFF_003',
    technicianName: 'Lê Hoàng Nam (KTV Phần Cứng)',
    capacityNotes: 'Kho nhận máy chờ xử lý phần cứng, mainboard'
  },
  {
    id: 'KHO_KTV_TRONG',
    name: 'Kho KTV Trọng (Ép Kính & Màn Hình)',
    shortName: 'Kho KTV Trọng',
    code: 'KTV-TRONG',
    address: 'Bàn Kỹ Thuật 02 - Trạm Kỹ Thuật Tổng',
    manager: 'KTV Trọng (Ép Kính)',
    phone: '0912.888.999',
    color: 'from-orange-500 to-orange-500',
    systemType: 'TONG',
    systemName: 'Tổng Hệ Thống (Central)',
    type: 'TECHNICIAN_SUB',
    parentWarehouseId: 'KHO_TONG',
    technicianId: 'STAFF_004',
    technicianName: 'Phạm Văn Trọng (KTV Ép Kính)',
    capacityNotes: 'Kho máy đang bóc tách & thay kính/màn hình'
  },
  {
    id: 'KHO_KTV_DUONG',
    name: 'Kho KTV Dương (Thay Pin & Test KCS)',
    shortName: 'Kho KTV Dương',
    code: 'KTV-DUONG',
    address: 'Bàn Kỹ Thuật 03 - Trạm Kỹ Thuật Tổng',
    manager: 'KTV Dương (KCS & Linh Kiện)',
    phone: '0912.555.444',
    color: 'from-orange-500 to-orange-500',
    systemType: 'TONG',
    systemName: 'Tổng Hệ Thống (Central)',
    type: 'TECHNICIAN_SUB',
    parentWarehouseId: 'KHO_TONG',
    technicianId: 'STAFF_005',
    technicianName: 'Hoàng Minh Dương (KTV Linh Kiện)',
    capacityNotes: 'Kho máy kiểm tra KCS cuối trước khi bàn giao chi nhánh'
  },

  // 2. HỆ THỐNG PHONEHOUSE (RETAIL CHAIN)
  {
    id: 'KHO_PHONEHOUSE',
    name: 'Kho PhoneHouse (Cầu Giấy)',
    shortName: 'Kho PhoneHouse CG',
    code: 'KPH-02',
    address: '136 Cầu Giấy, P. Quan Hoa, Q. Cầu Giấy, Hà Nội',
    manager: 'Tuấn Cửa Hàng Trưởng',
    phone: '0977.111.222',
    color: 'from-orange-500 to-orange-500',
    systemType: 'PHONEHOUSE',
    systemName: 'PhoneHouse Retail',
    type: 'RETAIL_STORE',
    capacityNotes: 'Sức chứa 500 máy phục vụ bán lẻ & trải nghiệm'
  },

  // 3. HỆ THỐNG XSTORE (PREMIUM STORE)
  {
    id: 'KHO_XSTORE',
    name: 'Kho Xstore (Trần Duy Hưng)',
    shortName: 'Kho Xstore TDH',
    code: 'KXS-03',
    address: '88 Trần Duy Hưng, P. Trung Hòa, Q. Cầu Giấy, Hà Nội',
    manager: 'Hoàng Quản Lý Chi Nhánh',
    phone: '0966.333.444',
    color: 'from-orange-600 to-orange-500',
    systemType: 'XSTORE',
    systemName: 'Xstore Apple Premium',
    type: 'RETAIL_STORE',
    capacityNotes: 'Sức chứa 600 máy cao cấp & phụ kiện chính hãng'
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

// ==========================================
// PURCHASE ORDER & STOCK-IN MANAGEMENT TYPES
// ==========================================

export type PurchaseOrderStatus = 'DRAFT' | 'QC_CHECKING' | 'COMPLETED' | 'CANCELLED';
export type PurchasePaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export interface PurchaseOrderItem {
  id: string;
  type: 'device' | 'product';
  modelOrName: string; // e.g. "iPhone 16 Pro Max 256GB Titan Sa Mạc"
  color?: string;
  storage?: string;
  condition?: 'New Seal' | 'Like New 99%' | '98% Cấn Nhẹ' | '95% Trầy Xước' | 'Hàng Cũ Trưng Bày';
  region?: string; // 'VN/A (Chính hãng)', 'LL/A (Mỹ - eSim)', 'ZA/A (2 Sim vật lý)'...
  batteryHealth?: number;
  imeiList?: string[]; // Danh sách IMEI (15 số) cho thiết bị
  quantity: number;
  importPrice: number; // Giá vốn / Giá nhập từng sản phẩm
  expectedSellPrice?: number; // Giá bán lẻ niêm yết dự kiến
  totalAmount: number; // quantity * importPrice
  notes?: string;
}

export interface PurchaseOrder {
  id: string;
  code: string; // PN-20260816-01
  supplierId: string;
  supplierName: string;
  supplierPhone?: string;
  supplierAddress?: string;
  supplierTaxCode?: string;
  branchId?: string;
  branchName?: string;
  warehouseId: WarehouseId | string;
  warehouseName: string;
  orderDate: string; // YYYY-MM-DD
  receivedDate?: string;
  creatorName: string; // Nhật Tân (Giám Đốc), Cửa hàng trưởng...
  qcInspector?: string; // KTV kiểm định KCS
  status: PurchaseOrderStatus;
  paymentStatus: PurchasePaymentStatus;
  paymentMethod?: 'Tiền mặt tại két' | 'Chuyển khoản VietQR' | 'Ghi nhận công nợ NCC' | 'Hỗn hợp';
  fundId?: string; // Quỹ chi tiền nếu có thanh toán ngay
  fundName?: string;
  items: PurchaseOrderItem[];
  totalQuantity: number;
  subTotal: number;
  discountAmount?: number;
  shippingFee?: number;
  totalAmount: number; // Tổng giá trị phiếu nhập sau chiết khấu + ship
  paidAmount: number; // Tiền đã trả cho NCC
  debtAmount: number; // Tiền nợ NCC còn lại (totalAmount - paidAmount)
  notes?: string;
  attachments?: string[];
  history?: ActionLogEntry[];
}


export type CatalogCategory = 'DEVICE' | 'PART' | 'ACCESSORY';

export interface CatalogSubCategory {
  id: string;
  name: string;
  parentCategory: CatalogCategory;
  code: string;
  description?: string;
  iconName?: string;
  itemCount?: number;
}

export interface MasterCatalogItem {
  id: string;
  sku: string;
  name: string;
  category: CatalogCategory;
  parentCategoryId?: CatalogCategory;
  subCategory?: string; // e.g. "iPhone 16 Series", "Màn Hình OLED/Zin", "Củ Sạc & Cáp Nhanh"
  subCategoryId?: string;
  brand?: string; // Apple, Pisen, KingKong, Torras, Baseus, Anker...
  unit?: string; // Chiếc, Bộ, Cụm, Hộp...
  barcode?: string;
  // Specifications
  model?: string;
  storage?: string;
  color?: string;
  condition?: string;
  region?: string;
  imageUrl?: string;
  compatibleModels?: string[]; // For parts/accessories
  // Default Pricing
  defaultImportPrice: number;
  defaultRetailPrice: number;
  wholesalePrice?: number;
  minStockLevel?: number;
  maxStockLevel?: number;
  warrantyPeriodMonths?: number;
  vatRate?: number;
  notes?: string;
  status?: 'active' | 'inactive';
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

export interface DeviceHistoryLog {
  id: string;
  timestamp: string; // YYYY-MM-DD HH:mm or ISO string
  type: 'STOCK_IN' | 'WAREHOUSE_TRANSFER' | 'WARRANTY_QC' | 'RESPONSIBILITY_CHANGE' | 'STATUS_CHANGE' | 'SALE' | 'MANUAL_NOTE';
  title: string;
  description: string;
  performedBy: string; // Staff/KTV/Admin name
  fromWarehouse?: string;
  toWarehouse?: string;
  ticketCode?: string;
  slipCode?: string;
  invoiceCode?: string;
  statusBadge?: string;
  metadata?: Record<string, any>;
}

export interface DeviceItem {
  id: string;
  branchId?: string;
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
  images?: string[];
  imageUrl?: string;
  batchCode?: string;
  supplierId?: string;
  currentCustodian?: string; // Người hiện đang chịu trách nhiệm trực tiếp (Thủ kho / KTV / NV Bán)
  technicianAssigned?: string; // KTV đang giữ / xử lý máy
  history?: DeviceHistoryLog[]; // Danh sách sự kiện lịch sử (Timeline)
}

export type LeadStatus = 'new' | 'contacted' | 'negotiating' | 'appointment_scheduled' | 'deposit_paid' | 'deposit' | 'won' | 'lost';

export interface LeadNextAction {
  type: 'CALL' | 'MESSAGE' | 'APPOINTMENT' | 'SEND_QUOTE' | 'CHECK_STOCK';
  dueAt?: string;
  notes?: string;
  assignedTo?: string;
}

export interface Lead {
  id: string;
  customerId?: string;
  branchId?: string;
  name: string;
  phone: string;
  phoneNormalized?: string;
  zalo?: string;
  source: 'Facebook Ads' | 'TikTok' | 'Zalo OA' | 'Khách Vãng Lai' | 'Khách Quen Giới Thiệu';
  interestedModel: string;
  budget: number;
  tradeInRequirose: boolean;
  tradeInModel?: string;
  status: LeadStatus;
  lostReason?: string;
  lostReasonDetails?: string;
  assignedStaff: string;
  assignedStaffId?: string;
  followUpDate: string;
  nextAction?: LeadNextAction;
  createdAt: string;
  lastContactedAt?: string;
  notes: string;
  lastMessageSnippet?: string;
}

export interface TradeInAppraisal {
  id: string;
  branchId?: string;
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
  baseValue?: number;
  subsidyBonus?: number;
  totalDeduction?: number;
  deductionDetails?: { step: number; name: string; amount: number; note: string }[];
}

export interface WarrantyTicketPart {
  id?: string;
  sku?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  costPrice?: number;
  deductedFromStock?: boolean;
}

export interface ActionLogEntry {
  time: string;
  action: string;
  note?: string;
  user: string;
}

export interface WarrantyTicketTimeline {
  time: string;
  action: string;
  note?: string;
  user: string;
}

export interface SparePart {
  id: string;
  branchId?: string;
  sku: string;
  name: string;
  category: 'PIN' | 'MAN_HINH' | 'CAMERA' | 'CAP_SÁC' | 'VO_TRONG' | 'MAINBOARD' | 'KHAC';
  costPrice: number;
  retailPrice: number;
  stockQuantity: number;
  minStockLevel: number;
  compatibleModels: string[];
}

export interface TechChecklistStep {
  id: string;
  step: string;
  isPassed: boolean;
  notes?: string;
}

export interface WarrantyTicket {
  id: string;
  branchId?: string;
  ticketNumber: string;
  taskType?: 'INBOUND_QC' | 'WARRANTY' | 'RETAIL_REPAIR'; // Phân loại Phiếu
  assigneeId?: string; // ID của Kỹ Thuật Viên
  commissionAmount?: number;
  techTasks?: string[]; // Hoa hồng cho KTV
  techChecklist?: TechChecklistStep[]; // Checklist kiểm tra máy
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
  type?: 'phone' | 'device' | 'accessory' | 'service' | 'tradein' | 'repair';
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
  paymentFundId?: string;
  paymentTransactionId?: string;
  splitPayments?: {
    method: string;
    amount: number;
    fundId: string;
    fundName?: string;
    bankName?: string;
    accountNumber?: string;
  }[];
  history?: ActionLogEntry[];
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
  branchId?: string; // Primary branch ID (e.g. TONG, CN01)
  assignedBranchIds?: string[]; // Cho phép chọn 1 hoặc nhiều chi nhánh/địa chỉ làm việc
  workplaceAddresses?: string[]; // Danh sách các địa chỉ làm việc cụ thể được phân công
  phone?: string;
  active: boolean;
  createdAt: string;
  avatarUrl?: string;
  facePhotoUrl?: string; // Ảnh mẫu gương mặt đăng ký chuẩn
  assignedFaceEmbedding?: boolean; // Đã đăng ký dữ liệu sinh trắc học Face ID
  faceEnrollmentDate?: string; // Ngày đăng ký gương mặt
  faceEnrollmentStatus?: 'NOT_ENROLLED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'; // Trạng thái phê duyệt khuôn mặt
  faceApprovedBy?: string; // Người duyệt khuôn mặt
  faceApprovedAt?: string; // Thời gian duyệt
  faceFeatureVector?: number[]; // Vector đặc trưng khuôn mặt (Dữ liệu nhúng Face ID AI)
  lastLogin?: string;
  notes?: string;
  kpiTargetRevenue?: number;
  kpiTargetOrders?: number;
  kpiTargetWarranty?: number;
  baseSalary?: number;
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

export type PartnerType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH' | 'STAFF';
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
  | 'INTERNAL'             // Chi phí nội bộ / Phạt KTV
  | 'OTHER_EXPENSE';       // Chi phí khác

export interface CashTransaction {
  id: string;
  branchId?: string;
  fundId?: string;
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
  isPLAccounted?: boolean; // Mặc định: true (Có hạch toán vào Kết quả kinh doanh P&L)
  attachments?: string[];
}

export interface FundAccount {
  id: string;
  branchId?: string;
  isCompanyFund?: boolean;
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
  branchId?: string;
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
  assignedBranchIds?: string[];
  workplaceAddresses?: string[];
  baseSalary: number;
  monthlyTargetRevenue: number;
  monthlyTargetOrders: number;
  status: 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';
  joinDate: string;
  allowedWifiSSID?: string;
  assignedFaceEmbedding?: boolean;
  facePhotoUrl?: string;
  faceEnrollmentDate?: string;
  faceFeatureVector?: number[];
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

export type WalletCategory = 'TECH_WALLET' | 'SALES_WALLET';

export type CommissionType = 
  | 'DEVICE_SALE'          // Hoa hồng bán máy iPhone / iPad / MacBook
  | 'ACCESSORY_SALE'       // Hoa hồng ốp, sạc, dán cường lực
  | 'CARE_PACKAGE'         // Gói bảo hành VIP / Rơi vỡ
  | 'ONLINE_LEAD_SPLIT'    // 30% Sale Online
  | 'STORE_CLOSER_SPLIT'   // 70% Nhân viên chốt đơn tại cửa hàng
  | 'TECH_REPAIR'          // Hoa hồng / Điểm kỹ thuật viên sửa chữa
  | 'TECH_KCS'             // Hoa hồng kiểm định KCS nhập kho
  | 'TECH_WARRANTY'        // Hoa hồng xử lý bảo hành miễn phí
  | 'TRADEIN_BONUS'        // Thưởng thu cũ đổi mới
  | 'OTHER_BONUS';         // Thưởng khác

export interface CommissionTransaction {
  id: string;
  employeeId: string;
  employeeName: string;
  role: StaffRole;
  walletCategory?: WalletCategory; // TECH_WALLET hoặc SALES_WALLET
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
  sourceType?: 'INVOICE' | 'WARRANTY_TICKET' | 'TRADEIN' | 'MANUAL';
  sourceId?: string;
}

export interface StaffDualWalletSummary {
  staffId: string;
  staffName: string;
  role: StaffRole;
  // 1. Ví Kỹ Thuật (Tech Wallet)
  techWallet: {
    totalCommission: number;
    kcsCount: number;
    kcsAmount: number;
    repairCount: number;
    repairAmount: number;
    warrantyCount: number;
    warrantyAmount: number;
    tradeInCount: number;
    tradeInAmount: number;
    completedTicketCount: number;
    pendingCount: number;
    transactions: CommissionTransaction[];
  };
  // 2. Ví Kinh Doanh & Bán Hàng (Sales Wallet)
  salesWallet: {
    totalCommission: number;
    totalRevenue: number;
    completedOrderCount: number;
    deviceOrderCount: number;
    deviceCommission: number;
    deviceAmount: number;
    accessoryOrderCount: number;
    accessoryCommission: number;
    accessoryAmount: number;
    carePackageCount: number;
    carePackageCommission: number;
    carePackageAmount: number;
    onlineSplitCommission: number;
    transactions: CommissionTransaction[];
  };
  // Tổng hợp thực lãnh
  totalGrossCommission: number;
  totalTransactionsCount: number;
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

export type SOPCategory = 'OPENING' | 'MID_SHIFT' | 'CLOSING';
export type SOPTargetRole = 'ALL' | 'SALES' | 'SALE_ONLINE' | 'TECHNICIAN' | 'CASHIER' | 'WAREHOUSE' | 'MANAGER';
export type TaskPriority = 'HIGH' | 'MEDIUM' | 'NORMAL';

export interface SOPTemplateItem {
  id: string;
  code: string; // e.g. 'SOP-SALES-01'
  title: string;
  targetRole: SOPTargetRole;
  targetRoleName?: string;
  category: SOPCategory;
  categoryName: string; // 'Đầu ca trực' | 'Trong ca làm' | 'Cuối ca trực & Bàn giao'
  timeHint: string; // '08:00 - 08:30'
  priority: TaskPriority;
  description: string;
  guidelines?: string[];
  requiresPhotoProof?: boolean;
  requiresNote?: boolean;
  penaltyPoints?: number;
  bonusPoints?: number;
  isActive: boolean;
  orderIndex: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  version?: string;
}

export interface DailyShiftChecklistItem {
  id: string;
  templateId?: string;
  date: string;
  staffId: string;
  staffName: string;
  staffRole: string;
  branchId?: string;
  branchName?: string;
  title: string;
  category: SOPCategory;
  categoryName: string;
  timeHint: string;
  priority: TaskPriority;
  isCompleted: boolean;
  completedAt?: string;
  completedBy?: string;
  note?: string;
  photoProofUrl?: string;
  isCustomTask?: boolean;
  assignedByLeaderName?: string;
  verifiedByManager?: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
}

export interface ShiftHandoverReport {
  id: string;
  code: string;
  date: string;
  shiftName: string;
  branchId: string;
  branchName: string;
  staffId: string;
  staffName: string;
  staffRole: string;
  cashInSafe: number;
  cashRevenueToday: number;
  posCardRevenueToday: number;
  qrBankRevenueToday: number;
  totalRevenueToday: number;
  demoDevicesCount: number;
  demoDevicesLocked: boolean;
  glassShowcasesLocked: boolean;
  powerHeatDevicesTurnedOff: boolean;
  pendingRepairsCount: number;
  pendingTradeInsCount: number;
  pendingAppointmentsNote: string;
  generalNotes: string;
  completedTasksCount: number;
  totalTasksCount: number;
  status: 'SUBMITTED' | 'ACKNOWLEDGED' | 'APPROVED_BY_MANAGER';
  acknowledgedByStaffName?: string;
  managerApprovedBy?: string;
  managerFeedback?: string;
  createdAt: string;
}

// ==========================================
// OMNICHANNEL CHAT & MULTI-CHANNEL CRM TYPES
// ==========================================

export type ChatChannelType = 'FACEBOOK' | 'ZALO' | 'TIKTOK' | 'WEB' | 'SHOPEE' | 'INSTAGRAM' | 'HOTLINE';

export type ChatMessageType = 'text' | 'image' | 'product_card' | 'quote_card' | 'tradein_card' | 'order_summary' | 'system_alert';

export interface ChatMessage {
  id: string;
  conversationId: string;
  sender: 'CUSTOMER' | 'STAFF' | 'AI_BOT' | 'SYSTEM';
  senderName: string;
  senderAvatar?: string;
  content: string;
  timestamp: string;
  type: ChatMessageType;
  attachments?: string[];
  productData?: {
    name: string;
    price: number;
    image?: string;
    imei?: string;
    storage?: string;
    condition?: string;
    inStock?: boolean;
    warehouseName?: string;
  };
  quoteData?: {
    oldDeviceName?: string;
    tradeInEstimated?: number;
    newDeviceName?: string;
    newDevicePrice?: number;
    priceGap?: number;
    installmentMonthly?: number;
  };
  status?: 'sending' | 'sent' | 'delivered' | 'read';
}

export type ConversationStatus = 'NEW' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'APPOINTMENT_SET' | 'DEPOSIT_PAID' | 'WON' | 'CLOSED';

export interface ChatConversation {
  id: string;
  channel: ChatChannelType;
  channelAccountName: string; // VD: "Fanpage PhoneHouse Store", "Zalo OA PhoneHouse Care"
  channelExternalId?: string;
  customer: {
    id?: string;
    name: string;
    phone?: string;
    avatar?: string;
    facebookId?: string;
    zaloId?: string;
    tiktokId?: string;
    address?: string;
    isVip?: boolean;
    totalSpent?: number;
    orderCount?: number;
    tags?: string[];
  };
  lastMessage: {
    content: string;
    timestamp: string;
    sender: 'CUSTOMER' | 'STAFF' | 'AI_BOT' | 'SYSTEM';
    unread: boolean;
  };
  unreadCount: number;
  status: ConversationStatus;
  assignedStaff: {
    id: string;
    name: string;
    avatar?: string;
  };
  tags: string[];
  interestedProduct?: {
    model: string;
    storage?: string;
    color?: string;
    budget?: number;
  };
  tradeInOffer?: {
    oldModel: string;
    estimatedPrice: number;
    batteryHealth?: number;
    status: 'EVALUATING' | 'AGREED' | 'REJECTED';
  };
  branchId?: string;
  branchName?: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  aiSentiment?: 'HOT_LEAD' | 'PRICE_HUNTING' | 'NEED_CONSULTATION' | 'COMPLAINT';
  aiSummary?: string;
}

export interface ChannelConnectionConfig {
  id: string;
  channel: ChatChannelType;
  name: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'SYNCING' | 'ERROR';
  accountHandle: string;
  avatarUrl?: string;
  lastSyncedAt: string;
  totalMessagesSynced: number;
  webhookUrl: string;
  autoAiReply: boolean;
  assignRule: 'ROUND_ROBIN' | 'BRANCH_BASED' | 'FIRST_RESPONDER';
  color: string;
}

