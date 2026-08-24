export type SystemBrand = 'TONG' | 'PHONEHOUSE' | 'XSTORE';
export type WarehouseType = 'CENTRAL' | 'RETAIL_STORE' | 'TECHNICIAN_SUB' | 'REPAIR_WARRANTY' | 'TRANSIT';
export type WarehouseId = 'KHO_TONG' | 'KHO_PHONEHOUSE' | 'KHO_XSTORE' | 'KHO_KTV_NAM' | 'KHO_KTV_TRONG' | 'KHO_KTV_DUONG' | 'KHO_KT_TONG' | string;

export interface WarehouseInfo {
  id: WarehouseId;
  /** Chi nhánh sở hữu hàng tại location này. Bắt buộc với mọi kho vật lý. */
  branchId: string;
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
  /** Tài khoản Firebase/Firestore chịu trách nhiệm mặc định cho kho con. */
  custodianUid?: string;
  custodianName?: string;
  parentWarehouseId?: WarehouseId; // Kho cha (ví dụ KHO_TONG)
  capacityNotes?: string;
  isActive?: boolean;
  /** Legacy lifecycle flag retained for old Firestore records. */
  active?: boolean;
  /** Canonical archive marker used together with isActive=false. */
  isArchived?: boolean;
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
  allowedPublicIps?: string[]; // Canonical array of router public IPs (IPv4 / IPv6)
  attendanceRadius?: number; // Canonical GPS geofence radius in meters (default 50-100m)
  storePublicIp?: string; // Legacy string format for backward compatibility
  gpsLatitude?: number;
  gpsLongitude?: number;
  allowedGpsRadiusMeters?: number; // Legacy format for backward compatibility
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
  deviceId?: string;
  sourceBranchId?: string;
  destinationBranchId?: string;
  sourceLocationId?: WarehouseId | string;
  destinationLocationId?: WarehouseId | string;
  costAtTransfer?: number;
  costVersion?: string;
  costCalculatedAt?: string;
  receiptStatus?: TransferReceiptItemStatus;
  scannedImei?: string;
  workOrderId?: string;
  itemStatus?: TechnicalTransferItemStatus;
  acceptedAt?: string;
  returnedAt?: string;
  tasks?: TechnicalTransferTaskSnapshot[];
}

export interface SalesSetupConfig {
  id: 'sales';
  policyId: string;
  name: string;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string;
  deviceProfitPercent: number;
  accessoryProfitPercent: number;
  onlineSaleSplitPercent: number;
  maxDiscountPercent: number;
  defaultMonthlyTarget: number;
  commissionTags: SalesCommissionTag[];
  isActive: boolean;
}

export type SalesCommissionAppliesTo = 'DEVICE' | 'ACCESSORY';
export type SalesCommissionCalculation = 'FLAT' | 'PERCENT';

export interface SalesCommissionTag {
  id: string;
  name: string;
  appliesTo: SalesCommissionAppliesTo;
  calculationType: SalesCommissionCalculation;
  value: number;
  description?: string;
  isActive: boolean;
}

export interface SalesCommissionTagSnapshot extends SalesCommissionTag {
  policyId: string;
  policyVersion: string;
}

export interface CustomerCareSetupConfig {
  id: 'customerCare';
  policyId: string;
  name: string;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string;
  firstResponseMinutes: number;
  followUpAttempts: number;
  followUpDays: number[];
  completedFollowUpCommission: number;
  requireEvidence: boolean;
  requireQaApproval: boolean;
  isActive: boolean;
}

export type RetailPriceItemType = 'DEVICE' | 'ACCESSORY';
export type RetailPriceMatchType = 'ITEM_ID' | 'SKU' | 'MODEL_VARIANT';

export interface RetailPriceEntry {
  id: string;
  itemType: RetailPriceItemType;
  matchType: RetailPriceMatchType;
  itemKey: string;
  itemName: string;
  branchId: string;
  retailPrice: number;
  minimumPrice?: number;
  isActive: boolean;
}

export interface RetailPricingSetupConfig {
  id: 'retailPricing';
  policyId: string;
  name: string;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string;
  entries: RetailPriceEntry[];
  isActive: boolean;
}

export interface SystemSetupCheck {
  id: 'company' | 'branches' | 'warehouses' | 'funds' | 'sop' | 'technicalTasks' | 'sales' | 'retailPricing' | 'customerCare';
  label: string;
  complete: boolean;
  detail: string;
}

export interface SystemSetupStatus {
  complete: boolean;
  checks: SystemSetupCheck[];
}

export type StockTransferType = 'TECHNICAL' | 'INTER_BRANCH';
export type TechnicalPriority = 'NORMAL' | 'PRIORITY' | 'URGENT';
export type TechnicalTransferItemStatus =
  | 'WAITING_KTV_ACCEPT'
  | 'IN_PROGRESS'
  | 'WAITING_QC'
  | 'QC_FAILED'
  | 'QC_PASSED'
  | 'RETURNED_TO_MAIN_WAREHOUSE'
  | 'CANCELLED';
export type TransferReceiptItemStatus = 'PENDING' | 'RECEIVED' | 'MISSING' | 'WRONG_DEVICE' | 'DAMAGED';
export type StockTransferStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'WAITING_KTV_ACCEPT'
  | 'IN_PROGRESS'
  | 'WAITING_QC'
  | 'QC_FAILED'
  | 'RETURNED_TO_MAIN_WAREHOUSE'
  | 'IN_TRANSIT'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'DISPUTED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface TechnicalTaskTypeConfig {
  id: string;
  taskType: string;
  name: string;
  taskCode: string;
  baseCommission: number;
  laborCostToDevice?: number;
  capitalizeLaborCost?: boolean;
  reworkCommissionPolicy?: 'NO_EXTRA_COMMISSION' | 'REPEAT_COMMISSION' | 'MANAGER_APPROVAL';
  requiredEvidenceTypes?: Array<'BEFORE_PHOTO' | 'AFTER_PHOTO' | 'RESULT_NOTES' | 'REPLACEMENT_SERIAL'>;
  /**
   * Danh mục linh kiện được phép dùng cho task. Đây là policy nghiệp vụ,
   * không phải tồn kho: KTV chỉ được giữ/xuất linh kiện khớp một rule này.
   * Ưu tiên định danh bằng category/SKU; partId chỉ giữ lại để tương thích
   * với các cấu hình cũ đã lưu.
   */
  requiredPartTemplates?: Array<{
    category?: string;
    sku?: string;
    partId?: string;
    /** Số lượng tối đa theo rule cho một task line (legacy: số lượng yêu cầu). */
    quantity: number;
    maxQuantity?: number;
    /** Cho phép dùng SKU thay thế khi vẫn cùng nhóm linh kiện. */
    allowSubstitution?: boolean;
  }>;
  /** Nhóm lỗi có thể gợi ý nhanh task này tại phiếu tiếp nhận. */
  intakeIssueTypes?: WarrantyTicket['issueType'][];
  qcChecklistTemplateId?: string;
  normalSlaHours: number;
  prioritySlaHours?: number;
  urgentSlaHours: number;
  priorityMultiplier: Record<TechnicalPriority, number>;
  requiresQc: boolean;
  isActive: boolean;
  version: string;
}

export interface TechnicalTransferTaskSnapshot {
  taskType: string;
  taskCode: string;
  taskName: string;
  priority: TechnicalPriority;
  commissionAmount: number;
  slaHours: number;
  deadlineAt: string;
  requiresQc: boolean;
  configVersion: string;
  lineId?: string;
  commissionLedgerId?: string;
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
  status: StockTransferStatus | 'PENDING';
  items: StockTransferItem[];
  totalQuantity: number;
  totalValue: number;
  notes?: string;
  receivedDate?: string;
  receiver?: string;
  transferType?: StockTransferType;
  branchId?: string;
  sourceBranchId?: string;
  sourceBranchName?: string;
  destinationBranchId?: string;
  destinationBranchName?: string;
  sourceLocationId?: WarehouseId | string;
  destinationLocationId?: WarehouseId | string;
  approvedBy?: string;
  approvedAt?: string;
  expectedDeliveryAt?: string;
  nearestDeadlineAt?: string;
  totalTasks?: number;
  totalEstimatedCommission?: number;
  idempotencyKey?: string;
  stockIssueId?: string;
  stockReceiptId?: string;
  interBranchLedgerEntryId?: string;
  provisionalLedgerAmount?: number;
  postedLedgerAmount?: number;
  handoverImageUrls?: string[];
  updatedAt?: string;
}

// ==========================================
// PURCHASE ORDER & STOCK-IN MANAGEMENT TYPES
// ==========================================

export type PurchaseOrderStatus = 'DRAFT' | 'QC_CHECKING' | 'COMPLETED' | 'CANCELLED';
export type PurchasePaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export interface PurchaseOrderItem {
  id: string;
  type: 'device' | 'product';
  /**
   * Optional Product Master references. Older purchase orders only keep the
   * display fields below, so these are intentionally additive.
   */
  catalogItemId?: string;
  catalogModelId?: string;
  catalogModelCode?: string;
  productFamilyCode?: string;
  catalogGroupCode?: string;
  /** Product Master kind for quantity-based goods.  Machines continue to use
   * `type: 'device'` and an IMEI list. */
  catalogCategory?: 'PART' | 'ACCESSORY';
  /** Snapshot fields for quantity-based receipts; the server verifies the
   * Product Master before it posts stock. */
  sku?: string;
  compatibleModels?: string[];
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
  vatAmount?: number;
  otherFees?: number;
  totalAmount: number; // Tổng giá trị phiếu nhập sau chiết khấu + ship
  paidAmount: number; // Tiền đã trả cho NCC
  debtAmount: number; // Tiền nợ NCC còn lại (totalAmount - paidAmount)
  paymentAllocations?: Array<{
    id: string;
    fundId: string;
    fundName?: string;
    method: 'CASH' | 'BANK_TRANSFER';
    amount: number;
    createdAt?: string;
    createdByUid?: string;
  }>;
  inventoryPostingStatus?: 'POSTED' | 'REVERSED';
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
  masterVersion?: number;
  lifecycleStatus?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  sku: string;
  /** Normalized server-issued SKU used for duplicate prevention. */
  skuNormalized?: string;
  name: string;
  category: CatalogCategory;
  categoryName?: string;
  parentCategoryId?: CatalogCategory;
  subCategory?: string; // e.g. "iPhone 16 Series", "Màn Hình OLED/Zin", "Củ Sạc & Cáp Nhanh"
  subCategoryId?: string;
  brand?: string; // Apple, Pisen, KingKong, Torras, Baseus, Anker...
  unit?: string; // Chiếc, Bộ, Cụm, Hộp...
  barcode?: string;
  // Specifications
  /** Canonical model reference. `model` stays for legacy purchase forms. */
  modelId?: string;
  modelCode?: string;
  /** Optional setup-owned grouping references used when a device is received. */
  productFamilyCode?: string;
  catalogGroupCode?: string;
  model?: string;
  storage?: string;
  color?: string;
  condition?: string;
  region?: string;
  imageUrl?: string;
  compatibleModels?: string[]; // For parts/accessories
  /** Stable model references used by compatibility and technical task rules. */
  compatibleModelIds?: string[];
  compatibleModelCodes?: string[];
  /** Search material is deterministic and does not participate in SKU generation. */
  aliases?: string[];
  searchTokens?: string[];
  posShortName?: string;
  /** Codes are supplied through the catalog dictionary, never inferred at checkout. */
  categoryCode?: string;
  brandCode?: string;
  unitCode?: string;
  manufacturerCode?: string;
  qualityCode?: string;
  storageCode?: string;
  colorCode?: string;
  attributes?: Record<string, string>;
  skuSegments?: Array<{ key?: string; code: string; label?: string }>;
  templateId?: string;
  skuRuleVersion?: string;
  sourceOperationId?: string;
  createdAt?: string;
  createdByUid?: string;
  updatedAt?: string;
  updatedByUid?: string;
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

/**
 * Product Master is deliberately independent from stock balances and IMEIs.
 * Model records are referenced by catalog items, technical part compatibility
 * and future pricing policies; no values here are pre-seeded in application code.
 */
export interface CatalogModelMaster {
  id: string;
  brandName: string;
  brandCode: string;
  seriesName?: string;
  seriesCode?: string;
  modelName: string;
  modelCode: string;
  releaseYear?: number | null;
  aliases?: string[];
  active?: boolean;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface CatalogDictionaryEntry {
  id: string;
  scope: 'CATEGORY' | 'BRAND' | 'ATTRIBUTE';
  dictionaryType?: string;
  key?: string;
  group?: string;
  label: string;
  code: string;
  aliases?: string[];
  active?: boolean;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface ProductItem {
  id: string;
  /** Optional bridge while legacy POS stock is progressively linked to Product Master. */
  productMasterId?: string;
  /** Additive Product Master snapshot for fast POS/search/reporting. */
  catalogGroupCode?: string;
  catalogModelCode?: string;
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
  /** Optional Product Master references retained from the purchase receipt. */
  catalogItemId?: string;
  catalogModelId?: string;
  catalogModelCode?: string;
  productFamilyCode?: string;
  catalogGroupCode?: string;
  model: string;
  storage: string;
  color: string;
  region: string; // VN/A, LL/A, ZA/A, J/A, KH/A
  batteryHealth: number; // e.g. 88%
  condition: 'New Seal' | 'Like New 99%' | '98% Cấn Nhẹ' | '95% Trầy Xước' | 'Hàng Cũ Trưng Bày';
  buyPrice: number;
  sellPrice: number;
  status: 'in_stock' | 'reserved' | 'sold' | 'warranty' | 'repairing' | 'in_repair' | 'in_transit' | 'awaiting_technical';
  supplier: string;
  warehouse?: WarehouseId | string; // 'KHO_TONG' | 'KHO_PHONEHOUSE' | 'KHO_XSTORE'
  /** Canonical physical location. `warehouse`/`warehouseId` are retained for legacy records. */
  currentLocationId?: WarehouseId | string;
  warehouseId?: WarehouseId | string;
  branch?: string;
  branchName?: string;
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
  reservedForLeadId?: string; // Giữ máy theo Lead Báo giá CRM
  reservedUntil?: string; // Thời hạn giữ máy (ISO)
  reservedByStaffId?: string; // Nhân viên sale giữ máy
  history?: DeviceHistoryLog[]; // Danh sách sự kiện lịch sử (Timeline)
  currentCost?: number;
  costVersion?: string;
  costCalculatedAt?: string;
  activeTransferId?: string;
  activeWorkOrderId?: string;
  transferState?: string;
}

export type CustomerVIPTier = 'REGULAR' | 'SILVER' | 'GOLD' | 'DIAMOND';

export interface CustomerTierConfig {
  tier: CustomerVIPTier;
  name: string;
  minSpend: number;
  discountPercent: number;
  perks: string[];
}

export interface Customer {
  id: string;
  name: string;
  primaryPhone: string;
  phoneNormalized: string;
  email?: string;
  address?: string;
  ownerStaffId?: string;
  branchIds: string[];
  tags: string[];
  vipTier: CustomerVIPTier;
  lifetimeValue: number;
  totalOrders: number;
  firstPurchaseAt?: string;
  lastPurchaseAt?: string;
  lastInteractionAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FaceEnrollmentRecord {
  id: string;
  staffId: string;
  facePhotoUrl: string;
  faceFeatureVector?: number[];
  faceEnrollmentDate: string;
  enrolledBy?: string;
  status: 'ACTIVE' | 'PENDING_APPROVAL' | 'REVOKED';
  deviceId?: string;
  version?: number;
}

export type LeadStatus = 'new' | 'contacted' | 'negotiating' | 'consulting' | 'appointment_scheduled' | 'deposit_paid' | 'deposit' | 'won' | 'lost';

export type CareStatus = 
  | 'NOT_STARTED'
  | 'CARE_1_PENDING'
  | 'CARE_1_DONE'
  | 'CARE_2_PENDING'
  | 'CARE_2_DONE'
  | 'CARE_3_PENDING'
  | 'CARE_3_DONE'
  | 'LONG_TERM_NURTURE'
  | 'CLOSED_WON'
  | 'CLOSED_LOST';

export type CareChannel = 'CALL' | 'ZALO' | 'FACEBOOK' | 'TIKTOK' | 'SMS' | 'IN_PERSON';

export type CareAction = 
  | 'CALL_CUSTOMER' 
  | 'SEND_MESSAGE' 
  | 'SEND_QUOTE' 
  | 'SEND_PRODUCT' 
  | 'BOOK_APPOINTMENT' 
  | 'FOLLOW_UP' 
  | 'STORE_VISIT';

export type CareOutcome = 
  | 'CONNECTED' 
  | 'NO_ANSWER' 
  | 'BUSY' 
  | 'SEEN_NO_REPLY' 
  | 'REPLIED' 
  | 'APPOINTMENT_CREATED' 
  | 'DEPOSIT_CREATED' 
  | 'FOLLOW_UP_REQUESTED' 
  | 'LOST_NOT_INTERESTED';

export type CustomerResponseCode = 
  | 'READY_TO_BUY'
  | 'THINKING'
  | 'COMPARING_PRICE'
  | 'WAITING_SALARY'
  | 'NEED_FAMILY_CONSULT'
  | 'WILL_VISIT_STORE'
  | 'ASK_TRADE_IN'
  | 'ASK_INSTALLMENT'
  | 'TOO_EXPENSIVE'
  | 'OUT_OF_BUDGET'
  | 'BOUGHT_OTHER_STORE'
  | 'NO_RESPONSE';

export type ObjectionCategory = 
  | 'PRICE' 
  | 'PRODUCT' 
  | 'FINANCE' 
  | 'DECISION_MAKER' 
  | 'TIMING' 
  | 'COMPETITOR' 
  | 'WARRANTY' 
  | 'OTHER';

export type ObjectionCode = 
  | 'PRICE_GAP'
  | 'PRICE_TOO_HIGH'
  | 'COMPETITOR_CHEAPER'
  | 'NO_STOCK_COLOR'
  | 'NO_STORAGE'
  | 'WANT_DIFFERENT_MODEL'
  | 'NOT_ENOUGH_CASH'
  | 'INSTALLMENT_REJECTED'
  | 'WAITING_PAYDAY'
  | 'NEED_ASK_SPOUSE'
  | 'NEED_PARENT_APPROVAL'
  | 'NOT_URGENT'
  | 'WAITING_FOR_PROMO'
  | 'WARRANTY_TERMS'
  | 'INSTALLMENT_FEES'
  | 'TRADE_IN_VALUATION'
  | 'OTHER';

export type EvidenceType = 
  | 'CALL_LOG'
  | 'CONVERSATION_ATTACHED'
  | 'MESSAGE_LOG'
  | 'QUOTE_ATTACHED'
  | 'APPOINTMENT_ATTACHED'
  | 'SCREENSHOT_UPLOAD'
  | 'STORE_VISIT_IN_PERSON'
  | 'SELF_REPORTED';

export type EvidenceVerificationStatus = 
  | 'PENDING_EVIDENCE'
  | 'SELF_REPORTED'
  | 'SYSTEM_CAPTURED'
  | 'MANAGER_VERIFIED'
  | 'NEEDS_EVIDENCE'
  | 'FLAGGED';

export interface LeadCareActivity {
  id: string;
  leadId: string;
  customerId?: string;
  sequence: number; // Legacy sequence counter
  attemptNo: number; // 1, 2, 3, 4, 5... (Every touch attempt)
  meaningfulCareNo?: number; // 1 (L1), 2 (L2), 3 (L3) - Only for successful connections
  isMeaningfulContact: boolean;
  staffId: string;
  staffName: string;
  branchId: string;
  channel: CareChannel;
  action: CareAction;
  outcome: CareOutcome;
  customerResponseCode?: CustomerResponseCode;
  customerResponseText?: string;
  objectionCategory?: ObjectionCategory;
  objectionCode?: ObjectionCode;
  priceDetails?: {
    storePrice?: number;
    competitorPrice?: number;
    customerExpectedPrice?: number;
    priceGap?: number;
    competitorName?: string;
  };
  opportunityContext?: {
    productInterestSnapshot: string;
    budgetSnapshot: number;
    leadStageSnapshot: LeadStatus;
  };
  evidenceType: EvidenceType;
  verificationStatus: EvidenceVerificationStatus;
  evidenceData?: {
    callDurationSeconds?: number;
    callStartedAt?: string;
    conversationId?: string;
    messageCount?: number;
    quoteId?: string;
    quoteCode?: string;
    appointmentId?: string;
    screenshotUrl?: string;
    screenshotFileName?: string;
    screenshotHash?: string;
    managerNote?: string;
    managerReviewedBy?: string;
    managerReviewedAt?: string;
  };
  qualityScoreBreakdown?: {
    processScore: number;   // Max 40
    evidenceScore: number;  // Max 30
    outcomeScore: number;   // Max 30
    totalScore: number;     // 0 - 100
  };
  qaReview?: {
    status: EvidenceVerificationStatus;
    reviewedBy: string;
    reviewedByName: string;
    reviewedAt: string;
    note?: string;
  };
  auditHistory?: Array<{
    previousStatus: string;
    newStatus: string;
    changedBy: string;
    changedByName: string;
    changedAt: string;
    note?: string;
  }>;
  nextActionType?: 'CALL' | 'ZALO' | 'SEND_QUOTE' | 'APPOINTMENT' | 'LONG_TERM_NURTURE' | 'CLOSE_DEAL';
  nextActionAt?: string;
  nextActionNotes?: string;
  notes?: string;
  createdAt: string;
}

export interface LeadAppointment {
  id: string;
  leadId: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  branchId: string;
  branchName?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  scheduledAt: string; // YYYY-MM-DD HH:mm
  interestedModel: string;
  reservationDeviceId?: string;
  notes?: string;
  status: 'SCHEDULED' | 'CONFIRMED' | 'ARRIVED' | 'NO_SHOW' | 'CANCELLED' | 'COMPLETED';
  arrivedAt?: string;
  noShowFollowUpTaskCreated?: boolean;
  createdAt: string;
}

export interface LeadQuote {
  id: string;
  quoteCode: string; // QT-XXXXX
  leadId: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  staffId: string;
  staffName: string;
  branchId: string;
  model: string;
  unitPrice: number;
  accessoriesPrice?: number;
  tradeInSubsidy?: number;
  discountAmount?: number;
  finalPrice: number;
  warrantyPackage?: string;
  validUntil: string;
  status: 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'EXPIRED' | 'REJECTED' | 'CONVERTED_POS';
  convertedInvoiceId?: string;
  reservedDeviceId?: string;
  reservedUntil?: string;
  notes?: string;
  createdAt: string;
}

export interface LeadEvidence {
  id: string;
  activityId: string;
  leadId: string;
  customerId?: string;
  branchId: string;
  type: EvidenceType;
  provider?: 'PANCAKE' | 'ZALO_OA' | 'STRINGEE_CALL' | 'MANUAL_UPLOAD' | 'POS_SYSTEM';
  externalId?: string;
  storagePath?: string;
  fileUrl?: string;
  mimeType?: string;
  fileSize?: number;
  immutableHash?: string;
  verificationStatus: EvidenceVerificationStatus;
  capturedAt: string;
  capturedBy: string;
}

export interface CustomerActivity {
  id: string;
  customerId: string;
  leadId?: string;
  type: 'LEAD_CREATED' | 'CARE' | 'QUOTE' | 'APPOINTMENT' | 'DEPOSIT' | 'INVOICE' | 'WARRANTY' | 'TRADE_IN' | 'NOTE';
  entityId?: string;
  staffId: string;
  staffName?: string;
  branchId: string;
  summary: string;
  details?: Record<string, any>;
  createdAt: string;
}

export interface DeviceReservation {
  id: string;
  deviceId: string;
  imei: string;
  model: string;
  leadId: string;
  quoteId?: string;
  customerId?: string;
  staffId: string;
  branchId: string;
  reservedAt: string;
  expiresAt: string; // Typically +30m
  status: 'ACTIVE' | 'EXPIRED' | 'CONVERTED' | 'CANCELLED';
}

export interface LeadAssignmentHistory {
  id: string;
  leadId: string;
  fromStaffId: string;
  fromStaffName: string;
  toStaffId: string;
  toStaffName: string;
  changedBy: string;
  changedByName: string;
  reason: 'SHIFT_END' | 'NO_RESPONSE' | 'MANAGER_REASSIGN' | 'BRANCH_TRANSFER' | 'STAFF_OFF' | 'OVERLOAD' | 'MANUAL_REASSIGN';
  notes?: string;
  changedAt: string;
}

export interface CRMTask {
  id: string;
  leadId?: string;
  customerId?: string;
  type: 'NEW_LEAD_SLA' | 'CARE_FOLLOW_UP' | 'APPOINTMENT_REMINDER' | 'NO_SHOW_RECOVERY' | 'QUOTE_EXPIRY' | 'PAYDAY_NURTURE' | 'STOCK_AVAILABLE';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  dueAt: string;
  assignedStaffId: string;
  assignedStaffName?: string;
  branchId: string;
  title: string;
  description?: string;
  sourceEntityType?: 'LEAD' | 'CARE_ACTIVITY' | 'APPOINTMENT' | 'QUOTE';
  sourceEntityId?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
}

export interface LeadNextAction {
  type: 'CALL' | 'MESSAGE' | 'APPOINTMENT' | 'SEND_QUOTE' | 'CHECK_STOCK' | 'LONG_TERM_NURTURE';
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
  careStatus?: CareStatus;
  careAttempts?: number;
  meaningfulCareCount?: number;
  careQualityScore?: number; // 0 - 100
  leadTemperature?: 'HOT' | 'WARM' | 'COLD';
  temperatureScore?: number; // 0 - 100
  priorityRank?: 'P0' | 'P1' | 'P2' | 'P3';
  priorityScore?: number; // 0 - 100
  lastCustomerResponse?: string;
  lastCustomerResponseCode?: CustomerResponseCode;
  lastEvidenceType?: EvidenceType;
  lastCareOutcome?: CareOutcome;
  lastCareAt?: string;
  lostReason?: string;
  lostReasonDetails?: string;
  assignedStaff: string;
  assignedStaffId?: string;
  followUpDate: string;
  nextAction?: LeadNextAction;
  nextActionAt?: string;
  nextActionNotes?: string;
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
  customerId?: string;
  branchId?: string;
  ticketNumber: string;
  taskType?: 'INBOUND_QC' | 'WARRANTY' | 'RETAIL_REPAIR' | 'STORE_ESCALATION'; // Phân loại Phiếu
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
  batteryHealth?: number;
  warrantyMonths?: number;
  warrantyExpiryDate?: string;
  commissionTags?: SalesCommissionTagSnapshot[];
  listPrice?: number;
  priceAdjusted?: boolean;
  priceAdjustmentReason?: string;
  pricePolicyId?: string;
  pricePolicyVersion?: string;
  priceAdjustedByUid?: string;
}

export interface SalesInvoice {
  id: string;
  customerId?: string;
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
  installmentDisbursementStatus?: 'PENDING' | 'DISBURSED' | 'CANCELLED';
  installmentExpectedAmount?: number;
  installmentFinanceAmount?: number;
  installmentFinancePartnerId?: string;
  installmentReceivedAmount?: number;
  installmentFeeAmount?: number;
  installmentDisbursementId?: string;
  installmentDisbursedAt?: string;
  installmentDisbursedByUid?: string;
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
  departmentId?: string;
  departmentName?: string;
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
  branchId: string;
  fundId: string;
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
  branchId: string;
  isCompanyFund?: boolean;
  name: string;
  type: PaymentFundType;
  accountNumber?: string;
  bankName?: string;
  accountHolder?: string;
  branch?: string;
  qrCodeUrl?: string;
  currentBalance: number;
  openingBalance: number;
  totalIncome: number;
  totalExpense: number;
  isActive: boolean;
  isDefault?: boolean;
  isArchived?: boolean;
  color: string;
}

export interface PartnerDebtTransaction {
  id: string;
  date: string;
  type: 'DEBT_INCREASE' | 'PAYMENT';
  amount: number;
  note: string;
  referenceId?: string; // Invoice ID or PO ID
  referenceCode?: string;
  referenceType?: 'INVOICE' | 'PURCHASE_ORDER' | 'PAYMENT' | 'MANUAL';
  direction?: 'PAYMENT' | 'RECEIPT';
  fundId?: string;
  cashTransactionId?: string;
  allocatedReferences?: Array<{
    sourceType: 'PURCHASE_ORDER' | 'INVOICE';
    sourceId: string;
    sourceCode: string;
    amount: number;
  }>;
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
  departmentId?: string;
  departmentName?: string;
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
  branchId?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DayShiftAssignment {
  shiftId: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  status: 'SCHEDULED' | 'CHECKED_IN' | 'COMPLETED' | 'SWAP_REQUESTED' | 'SWAP_APPROVED' | 'OFF';
  breakMinutes?: number;
  note?: string;
  isOff?: boolean;
}

export interface WeeklyShiftSchedule {
  id: string;
  staffId: string;
  staffName: string;
  role: StaffRole;
  branchId: string;
  weekStartDate?: string; // YYYY-MM-DD (legacy UI field)
  weekStart?: string; // YYYY-MM-DD (canonical server field)
  departmentId?: string;
  departmentName?: string;
  status?: 'DRAFT' | 'PUBLISHED';
  publishedAt?: string;
  publishedBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  days: {
    [dateStr: string]: DayShiftAssignment;
  };
}

export interface ShiftDepartmentPolicy {
  id: string;
  branchId: string;
  departmentId: string;
  departmentName: string;
  mode: 'FIXED' | 'ROTATING';
  defaultShiftId?: string;
  workDayIndexes: number[]; // 0 = Thứ 2 ... 6 = Chủ nhật
  active: boolean;
  updatedAt?: string;
  updatedBy?: string;
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
  shiftId?: string;
  shiftName: string;
  scheduledStart: string;
  scheduledEnd: string;
  scheduledBreakMinutes?: number;
  graceMinutes?: number;
  
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
  status: 'ON_TIME' | 'LATE' | 'EARLY_LEAVE' | 'ABSENT' | 'IN_PROGRESS' | 'COMPLETED' | 'PENDING_VERIFICATION';
  attendanceStatus?: 'CHECKED_IN' | 'COMPLETED' | 'ABSENT' | 'ON_LEAVE';
  punctualityStatus?: 'ON_TIME' | 'LATE' | 'EARLY';
  verificationStatus?: 'VERIFIED' | 'PENDING_REVIEW' | 'REJECTED';
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
  reviewData?: {
    reviewedByUid: string;
    reviewedByName: string;
    reviewedAt: string;
    decision: 'APPROVE' | 'REJECT';
    reason?: string;
  };
}

export interface StaffFaceProfile {
  staffUid: string;
  staffName?: string;
  enrollmentStatus: 'PENDING' | 'APPROVED' | 'REVOKED';
  facePhotoUrl?: string;
  faceEmbedding?: number[];
  faceFeatureVector?: number[];
  embeddingVersion: number;
  enrolledAt: string;
  approvedByUid?: string;
  approvedByName?: string;
  approvedAt?: string;
  revokedAt?: string;
  revocationReason?: string;
}

export interface AttendanceAuditLog {
  id: string;
  attendanceId: string;
  staffId: string;
  branchId: string;
  action: 'CHECK_IN' | 'CHECK_OUT' | 'REVIEW_APPROVED' | 'REVIEW_REJECTED';
  performedByUid: string;
  performedByName: string;
  previousStatus?: string;
  newStatus?: string;
  reason?: string;
  timestamp: string;
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
  sourceType?: 'INVOICE' | 'WARRANTY_TICKET' | 'TECHNICAL_WORK_ORDER' | 'TRADEIN' | 'MANUAL';
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

