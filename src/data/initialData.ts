import { 
  DeviceItem,
  StockTransferSlip, 
  Lead, 
  TradeInAppraisal, 
  WarrantyTicket, 
  SalesInvoice, 
  Partner, 
  FundAccount, 
  CashTransaction,
  StoreBranch,
  WarehouseInfo,
  StoreSettings,
  SparePart,
  PurchaseOrder,
  UserAccount,
  RolePermissionInfo,
  ERPNextModuleDocType
} from '../types';

export const ERPNEXT_BLUEPRINT_DOCTYPES: ERPNextModuleDocType[] = [
  {
    doctypeName: 'iPhone Inventory Item',
    module: 'Stock & Serial',
    description: 'Quản lý từng cây iPhone theo IMEI độc nhất, xuất xứ, pin, ngoại hình, iCloud',
    fields: [
      { fieldname: 'imei_number', label: 'IMEI (15 số)', fieldtype: 'Data', reqd: 1 },
      { fieldname: 'serial_number', label: 'Serial Number', fieldtype: 'Data', reqd: 1 },
      { fieldname: 'model_name', label: 'Dòng iPhone (VD: 16 Pro Max)', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'storage_capacity', label: 'Dung Lượng (128G/256G/512G/1TB)', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'color', label: 'Màu Sắc (Desert, Natural, Black...)', fieldtype: 'Data', reqd: 1 },
      { fieldname: 'region_code', label: 'Mã Xuất Xứ (VN/A, LL/A, ZA/A...)', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'battery_health_percentage', label: 'Tình Trạng Pin (% BH)', fieldtype: 'Percent', reqd: 1 },
      { fieldname: 'grade_condition', label: 'Ngoại Hình (New, 99%, 98%)', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'icloud_status', label: 'Trạng Thái iCloud (Clean/Locked)', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'purchase_price', label: 'Giá Vốn Nhập Kho (VNĐ)', fieldtype: 'Currency', reqd: 1 },
      { fieldname: 'valuation_rate', label: 'Giá Bán Niêm Yết (VNĐ)', fieldtype: 'Currency', reqd: 1 },
      { fieldname: 'stock_status', label: 'Trạng Thái (In Stock, Reserved, Sold, Warranty)', fieldtype: 'Select', reqd: 1 }
    ]
  },
  {
    doctypeName: 'iPhone CRM Lead',
    module: 'CRM & Marketing',
    description: 'Thu thập và nuôi dưỡng khách hàng tiềm năng qua Zalo/TikTok/Facebook',
    fields: [
      { fieldname: 'lead_name', label: 'Tên Khách Hàng', fieldtype: 'Data', reqd: 1 },
      { fieldname: 'mobile_no', label: 'Số Điện Thoại / Zalo', fieldtype: 'Data', reqd: 1 },
      { fieldname: 'source', label: 'Nguồn Lead (FB Ads, TikTok, Walk-in)', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'interested_iphone', label: 'Dòng Máy Khách Quan Tâm', fieldtype: 'Link', reqd: 1 },
      { fieldname: 'budget_range', label: 'Ngân Sách Dự Kiến', fieldtype: 'Currency' },
      { fieldname: 'has_trade_in', label: 'Có Thu Cũ Đổi Mới Không', fieldtype: 'Check' },
      { fieldname: 'pipeline_status', label: 'Tiến Trình (Mới, Đang Tư Vấn, Cọc, Chốt)', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'assigned_sales_rep', label: 'Nhân Viên Phụ Trách', fieldtype: 'Link' }
    ]
  },
  {
    doctypeName: 'iPhone Trade In Appraisal',
    module: 'Buying & Valuation',
    description: 'Kiểm định 12 bước thu cũ đổi mới, tính giá bù trừ lên đời tự động',
    fields: [
      { fieldname: 'customer', label: 'Khách Hàng', fieldtype: 'Link', reqd: 1 },
      { fieldname: 'old_device_model', label: 'Dòng Máy Thu Cũ', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'old_device_imei', label: 'IMEI Máy Cũ', fieldtype: 'Data' },
      { fieldname: 'battery_health', label: 'Pin Thực Tế (%)', fieldtype: 'Int' },
      { fieldname: 'screen_grade', label: 'Màn Hình (Zin/Ép Kính/Lỗi)', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'housing_grade', label: 'Vỏ Máy (Keng/Trầy/Cấn)', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'face_id_ok', label: 'FaceID Hoạt Động', fieldtype: 'Check' },
      { fieldname: 'truetone_ok', label: 'TrueTone Hoạt Động', fieldtype: 'Check' },
      { fieldname: 'appraisal_value', label: 'Giá Thu Định Mức', fieldtype: 'Currency', reqd: 1 },
      { fieldname: 'upgrade_to_device', label: 'Máy Khách Muốn Lên Đời', fieldtype: 'Link' },
      { fieldname: 'difference_amount', label: 'Số Tiền Bù Thêm', fieldtype: 'Currency' }
    ]
  },
  {
    doctypeName: 'iPhone Warranty & Repair Ticket',
    module: 'Support & Service',
    description: 'Tiếp nhận bảo hành 1 đổi 1, sửa chữa phần cứng, báo cáo kỹ thuật',
    fields: [
      { fieldname: 'ticket_code', label: 'Mã Phiếu Bảo Hành', fieldtype: 'Data', reqd: 1 },
      { fieldname: 'device_imei', label: 'IMEI Máy', fieldtype: 'Link', reqd: 1 },
      { fieldname: 'customer_phone', label: 'SĐT Khách', fieldtype: 'Data', reqd: 1 },
      { fieldname: 'symptom_category', label: 'Nhóm Lỗi (Nguồn/Màn/Pin/FaceID)', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'detailed_issue', label: 'Mô Tả Lỗi Chi Tiết', fieldtype: 'Small Text', reqd: 1 },
      { fieldname: 'assigned_technician', label: 'Kỹ Thuật Viên', fieldtype: 'Link' },
      { fieldname: 'repair_status', label: 'Trạng Thái (Tiếp nhận -> Sửa -> Xong -> Trả)', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'is_free_warranty', label: 'Bảo Hành Miễn Phí (1 Đổi 1/BH Gói)', fieldtype: 'Check' },
      { fieldname: 'repair_cost', label: 'Chi Phí Sửa Chữa (nếu có)', fieldtype: 'Currency' }
    ]
  }
];

export const ROLE_PERMISSIONS_CONFIG: RolePermissionInfo[] = [
  {
    role: 'ADMIN',
    nameVi: 'Quản Trị Viên (Root Admin)',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
    description: 'Toàn quyền cấu hình hệ thống, quản lý tài khoản nhân viên, xem giá vốn, doanh thu, lợi nhuận và xuất dữ liệu.',
    canManageUsers: true,
    canViewCostPrice: true,
    canViewRevenue: true,
    canManageInventory: true,
    canCreatePOS: true,
    canManageCRM: true,
    canApproveTradeIn: true,
    canManageWarranty: true,
    canExportData: true
  },
  {
    role: 'MANAGER',
    nameVi: 'Quản Lý Cửa Hàng (Store Manager)',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
    description: 'Quản lý toàn bộ vận hành chi nhánh, duyệt giá thu cũ đổi mới, quản lý kho máy và xem doanh số bán hàng.',
    canManageUsers: false,
    canViewCostPrice: true,
    canViewRevenue: true,
    canManageInventory: true,
    canCreatePOS: true,
    canManageCRM: true,
    canApproveTradeIn: true,
    canManageWarranty: true,
    canExportData: true
  },
  {
    role: 'SALES',
    nameVi: 'Nhân Viên Bán Hàng (Sales Rep)',
    badgeColor: 'bg-orange-50 text-orange-700 border-orange-200',
    description: 'Tạo đơn bán POS, in hóa đơn K80, tư vấn phễu khách hàng CRM, tra cứu kho máy (ẩn giá nhập gốc).',
    canManageUsers: false,
    canViewCostPrice: false,
    canViewRevenue: false,
    canManageInventory: false,
    canCreatePOS: true,
    canManageCRM: true,
    canApproveTradeIn: false,
    canManageWarranty: false,
    canExportData: false
  },
  {
    role: 'TECHNICIAN',
    nameVi: 'Kỹ Thuật Viên (Technician)',
    badgeColor: 'bg-orange-50 text-orange-700 border-orange-200',
    description: 'Tiếp nhận máy bảo hành, chẩn đoán phần cứng AI, thực hiện sửa chữa, cập nhật trạng thái phiếu tiếp nhận.',
    canManageUsers: false,
    canViewCostPrice: false,
    canViewRevenue: false,
    canManageInventory: false,
    canCreatePOS: false,
    canManageCRM: false,
    canApproveTradeIn: false,
    canManageWarranty: true,
    canExportData: false
  },
  {
    role: 'ACCOUNTANT',
    nameVi: 'Kế Toán / Thu Ngân (Accountant)',
    badgeColor: 'bg-orange-50 text-orange-700 border-orange-200',
    description: 'Theo dõi hóa đơn, dòng tiền mặt, chuyển khoản QR, đối soát hồ sơ trả góp HD Saison / Mpos.',
    canManageUsers: false,
    canViewCostPrice: true,
    canViewRevenue: true,
    canManageInventory: false,
    canCreatePOS: true,
    canManageCRM: false,
    canApproveTradeIn: false,
    canManageWarranty: false,
    canExportData: true
  }
];

export const INITIAL_USERS: UserAccount[] = [
  {
    id: 'USR-ADMIN',
    email: 'admin@phonehouse.vn',
    displayName: 'Quản Trị Viên (Admin)',
    role: 'ADMIN',
    branchId: 'BRANCH_1',
    assignedBranchIds: ['BRANCH_1', 'BRANCH_2'],
    phone: '0988.888.999',
    active: true,
    createdAt: '2025-01-01',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
  }
];

export const INITIAL_DEVICES: DeviceItem[] = [];

export const INITIAL_LEADS: Lead[] = [];

export const INITIAL_TRADE_INS: TradeInAppraisal[] = [];

export const INITIAL_WARRANTY_TICKETS: WarrantyTicket[] = [];

export const INITIAL_INVOICES: SalesInvoice[] = [];

export const INITIAL_PARTNERS: Partner[] = [];

// INITIAL CASHBOOK FUND ACCOUNTS (Tài khoản Sổ Quỹ sẵn sàng hoạt động)
export const INITIAL_FUNDS: FundAccount[] = [
  {
    id: 'FUND-CASH-STORE',
    name: 'Quỹ Tiền Mặt Tại Két Cửa Hàng',
    type: 'CASH',
    currentBalance: 0,
    openingBalance: 0,
    totalIncome: 0,
    totalExpense: 0,
    isActive: true,
    color: 'orange'
  },
  {
    id: 'FUND-BANK-TECHCOM',
    name: 'Tài Khoản Ngân Hàng Techcombank (VietQR Chính)',
    type: 'BANK',
    accountNumber: '190388889999',
    bankName: 'Techcombank',
    branch: 'Chi nhánh Hà Nội / Đà Nẵng',
    currentBalance: 0,
    openingBalance: 0,
    totalIncome: 0,
    totalExpense: 0,
    isActive: true,
    color: 'rose'
  },
  {
    id: 'FUND-BANK-MB',
    name: 'Tài Khoản MBBank (Phone House QR)',
    type: 'BANK',
    accountNumber: '0932435377',
    bankName: 'MBBank',
    branch: 'Chi nhánh Trung Tâm',
    currentBalance: 0,
    openingBalance: 0,
    totalIncome: 0,
    totalExpense: 0,
    isActive: true,
    color: 'orange'
  },
  {
    id: 'FUND-POS-CARD',
    name: 'Cổng MPOS / Quẹt Thẻ Tín Dụng',
    type: 'POS_CARD',
    accountNumber: 'MPOS-POS889',
    bankName: 'MPOS Vietnam',
    currentBalance: 0,
    openingBalance: 0,
    totalIncome: 0,
    totalExpense: 0,
    isActive: true,
    color: 'orange'
  },
  {
    id: 'FUND-CREDIT-HDSAISON',
    name: 'Tài Khoản Trả Góp HD Saison / Home Credit',
    type: 'INSTALLMENT_CREDIT',
    bankName: 'HD SAISON Finance',
    currentBalance: 0,
    openingBalance: 0,
    totalIncome: 0,
    totalExpense: 0,
    isActive: true,
    color: 'rose'
  }
];

// INITIAL CASHBOOK TRANSACTIONS (Sổ Quỹ Thu - Chi)
export const INITIAL_CASH_TRANSACTIONS: CashTransaction[] = [];

export interface RepairServiceItem {
  id: string;
  category: 'THAY_MAN_HINH' | 'THAY_PIN' | 'EP_KINH' | 'FACE_ID' | 'MAINBOARD_NGUON' | 'CAMERA_LOA' | string;
  categoryName: string;
  name: string;
  compatibleModels: string;
  costPrice: number;
  sellPrice: number;
  techCommission?: number;
  warrantyPeriodMonths: number;
  durationMinutes: number;
  notes?: string;
}

export const REPAIR_SERVICES_PRICELIST: RepairServiceItem[] = [
  {
    id: 'REP-01',
    category: 'THAY_MAN_HINH',
    categoryName: 'Thay Màn Hình iPhone',
    name: 'Thay màn hình iPhone 13 Pro Max (Zin Bóc Máy)',
    compatibleModels: 'iPhone 13 Pro Max',
    costPrice: 4200000,
    sellPrice: 5500000,
    techCommission: 150000,
    warrantyPeriodMonths: 6,
    durationMinutes: 45,
    notes: 'Màn Zin 120Hz ProMotion bóc máy, TrueTone & cảm ứng mượt mà'
  },
  {
    id: 'REP-02',
    category: 'THAY_MAN_HINH',
    categoryName: 'Thay Màn Hình iPhone',
    name: 'Câu dây đồng Fix Màn Xanh/Trắng 13PM (Không Thay Màn)',
    compatibleModels: 'iPhone 13 Pro, iPhone 13 Pro Max',
    costPrice: 200000,
    sellPrice: 800000,
    techCommission: 120000,
    warrantyPeriodMonths: 6,
    durationMinutes: 30,
    notes: 'Công nghệ câu áp fix triệt để lỗi màn xanh trắng 13 Series trọn đời'
  },
  {
    id: 'REP-03',
    category: 'THAY_MAN_HINH',
    categoryName: 'Thay Màn Hình iPhone',
    name: 'Thay màn hình iPhone 14 Pro Max GX OLED 120Hz',
    compatibleModels: 'iPhone 14 Pro Max',
    costPrice: 2800000,
    sellPrice: 3800000,
    techCommission: 100000,
    warrantyPeriodMonths: 6,
    durationMinutes: 40,
    notes: 'Màn hình linh kiện OLED GX hiển thị sắc nét 9/10 so với màn zin'
  },
  {
    id: 'REP-04',
    category: 'THAY_PIN',
    categoryName: 'Thay Pin iPhone Chính Hãng',
    name: 'Thay Pin iPhone 13/14 Pro Max Dung Lượng Cao Pisen Dragon',
    compatibleModels: 'iPhone 13 Pro Max, iPhone 14 Pro Max',
    costPrice: 550000,
    sellPrice: 950000,
    techCommission: 50000,
    warrantyPeriodMonths: 12,
    durationMinutes: 30,
    notes: 'Bảo hành 12 tháng 1 đổi 1 kể cả chai phồng pin, fix 100% dung lượng'
  },
  {
    id: 'REP-05',
    category: 'THAY_PIN',
    categoryName: 'Thay Pin iPhone Chính Hãng',
    name: 'Thay Pin iPhone 15/15 Pro Max Zin Sàng Cáp',
    compatibleModels: 'iPhone 15, 15 Plus, 15 Pro, 15 Pro Max',
    costPrice: 850000,
    sellPrice: 1450000,
    techCommission: 80000,
    warrantyPeriodMonths: 12,
    durationMinutes: 45,
    notes: 'Sàng IC cáp pin gốc, không báo linh kiện không xác định trong Cài đặt'
  },
  {
    id: 'REP-06',
    category: 'EP_KINH',
    categoryName: 'Ép Kính / Ép Cảm Ứng',
    name: 'Ép Kính iPhone 14 Pro / 14 Pro Max Keo OCA Chuẩn Nhà Máy',
    compatibleModels: 'iPhone 14 Pro, 14 Pro Max',
    costPrice: 350000,
    sellPrice: 850000,
    warrantyPeriodMonths: 12,
    durationMinutes: 60,
    notes: 'Kính Zin phủ Nano hạn chế vân tay, máy ép chân không tiêu chuẩn'
  },
  {
    id: 'REP-07',
    category: 'FACE_ID',
    categoryName: 'Sửa Chữa Face ID & Camera',
    name: 'Sửa Face ID Không Định Vị / Di Chuyển Lên Xuống (Dot Projector)',
    compatibleModels: 'iPhone X đến iPhone 15 Pro Max',
    costPrice: 300000,
    sellPrice: 750000,
    warrantyPeriodMonths: 6,
    durationMinutes: 45,
    notes: 'Sử dụng cáp JCID / Luban không cần hàn đục keo thấu kính'
  },
  {
    id: 'REP-08',
    category: 'MAINBOARD_NGUON',
    categoryName: 'Sửa Chữa Phần Cứng Mainboard',
    name: 'Fix IC Nguồn / Chập VCC_MAIN / Mất Nguồn Sạc',
    compatibleModels: 'Tất cả dòng iPhone',
    costPrice: 600000,
    sellPrice: 1200000,
    warrantyPeriodMonths: 3,
    durationMinutes: 90,
    notes: 'Đo đạc dò chạm chập bằng camera nhiệt Flir One Pro'
  }
];

export const INITIAL_TRANSFERS: StockTransferSlip[] = [];

export const INITIAL_BRANCHES: StoreBranch[] = [
  {
    id: 'BRANCH_1',
    code: 'CN-01',
    name: 'Showroom Cầu Giấy (Phone House Flagship)',
    address: '136 Cầu Giấy, P. Quan Hoa, Q. Cầu Giấy, TP. Hà Nội',
    phone: '0988.888.999',
    email: 'caugiay@phonehouse.vn',
    manager: 'Cửa Hàng Trưởng',
    openingHours: '08:30 - 21:30 (Cả CN & Ngày Lễ)',
    warehouseId: 'KHO_PHONEHOUSE',
    systemType: 'PHONEHOUSE',
    isActive: true,
    isHeadquarter: true,
    taxCode: '0109888999',
    bankAccount: {
      bankName: 'Techcombank',
      accountNumber: '190388889999',
      accountHolder: 'PHONE HOUSE VIET NAM'
    },
    allowedWifiSSID: 'PHONEHOUSE_5G',
    storePublicIp: '',
    gpsLatitude: 21.0333,
    gpsLongitude: 105.7955,
    allowedGpsRadiusMeters: 300,
    notes: 'Showroom bán lẻ & bảo hành chính'
  },
  {
    id: 'BRANCH_2',
    code: 'CN-02',
    name: 'Chi Nhánh Trần Duy Hưng',
    address: '88 Trần Duy Hưng, P. Trung Hòa, Q. Cầu Giấy, TP. Hà Nội',
    phone: '0966.333.444',
    email: 'tranduyhung@phonehouse.vn',
    manager: 'Quản Lý Chi Nhánh',
    openingHours: '08:30 - 21:30',
    warehouseId: 'KHO_XSTORE',
    systemType: 'XSTORE',
    isActive: true,
    isHeadquarter: false,
    taxCode: '0109888999-001',
    bankAccount: {
      bankName: 'Techcombank',
      accountNumber: '190388889999',
      accountHolder: 'PHONE HOUSE VIET NAM'
    },
    allowedWifiSSID: 'XSTORE_5G',
    storePublicIp: '',
    gpsLatitude: 21.0112,
    gpsLongitude: 105.7988,
    allowedGpsRadiusMeters: 300,
    notes: 'Chi nhánh bán lẻ & trải nghiệm máy'
  }
];

export const INITIAL_WAREHOUSES: WarehouseInfo[] = [
  {
    id: 'KHO_TONG',
    name: 'Tổng Kho Trung Tâm (Central Hub)',
    shortName: 'Kho Tổng',
    code: 'KT-01',
    address: 'Tổng Kho Phân Phối Trung Tâm, Hà Nội',
    manager: 'Giám Đốc Kho',
    phone: '0988.999.888',
    color: 'from-rose-600 to-rose-600',
    systemType: 'TONG',
    systemName: 'Tổng Hệ Thống (Central)',
    type: 'CENTRAL',
    isMain: true,
    capacityNotes: 'Sức chứa phân phối thiết bị & linh kiện',
    isActive: true
  },
  {
    id: 'KHO_PHONEHOUSE',
    name: 'Kho PhoneHouse (Cầu Giấy)',
    shortName: 'Kho Cầu Giấy',
    code: 'KPH-01',
    address: '136 Cầu Giấy, P. Quan Hoa, Q. Cầu Giấy, Hà Nội',
    manager: 'Cửa Hàng Trưởng Cầu Giấy',
    phone: '0977.111.222',
    color: 'from-orange-500 to-orange-500',
    systemType: 'PHONEHOUSE',
    systemName: 'PhoneHouse Retail',
    type: 'RETAIL_STORE',
    capacityNotes: 'Kho bán lẻ tại Showroom Cầu Giấy',
    isActive: true
  },
  {
    id: 'KHO_XSTORE',
    name: 'Kho Trần Duy Hưng',
    shortName: 'Kho TDH',
    code: 'KXS-02',
    address: '88 Trần Duy Hưng, P. Trung Hòa, Q. Cầu Giấy, Hà Nội',
    manager: 'Quản Lý Chi Nhánh',
    phone: '0966.333.444',
    color: 'from-orange-600 to-orange-500',
    systemType: 'XSTORE',
    systemName: 'PhoneHouse Trần Duy Hưng',
    type: 'RETAIL_STORE',
    capacityNotes: 'Kho bán lẻ chi nhánh Trần Duy Hưng',
    isActive: true
  }
];

export const INITIAL_STORE_SETTINGS: StoreSettings = {
  companyName: 'CÔNG TY TNHH PHONE HOUSE VIỆT NAM',
  brandName: 'Phone House',
  hotline: '1900.8888 (0988.888.999)',
  supportEmail: 'hotro@phonehouse.vn',
  website: 'https://phonehouse.vn',
  taxCode: '0109888999',
  headquarterAddress: '136 Cầu Giấy, P. Quan Hoa, Q. Cầu Giấy, TP. Hà Nội',
  slogan: 'Hệ Thống iPhone Zin Keng • Thu Cũ Đổi Mới Hàng Đầu',
  printHeaderNote: 'Cảm ơn quý khách đã tin chọn Phone House! Kiểm tra máy và phụ kiện kỹ trước khi rời quầy.',
  printFooterNote: 'Bảo hành 1 đổi 1 trong 30 ngày đầu • Bảo hành nguồn & màn hình theo cam kết.',
  defaultWarrantyMonths: 12,
  warrantyPackages: [
    { name: 'Gói VIP: 12 tháng (Bao nguồn + Màn hình + FaceID)', price: 0 },
    { name: 'Gói Kim Cương: 24 tháng (Rơi Vỡ + Vào Nước)', price: 1500000 },
    { name: 'Bảo hành tiêu chuẩn 6 tháng phần cứng', price: 0 },
    { name: 'Gói mở rộng 12 tháng (Lỗi 1 đổi 1)', price: 2000000 }
  ],
  branches: INITIAL_BRANCHES,
  warehouses: INITIAL_WAREHOUSES
};

export const INITIAL_SPARE_PARTS: SparePart[] = [];

export const INITIAL_PURCHASE_ORDERS: PurchaseOrder[] = [];
