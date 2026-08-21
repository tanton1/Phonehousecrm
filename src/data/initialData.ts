import {
  AttendanceRecord,
  CashTransaction,
  DeviceItem,
  ERPNextModuleDocType,
  FundAccount,
  Lead,
  Partner,
  PurchaseOrder,
  SalesInvoice,
  SparePart,
  StockTransferSlip,
  StoreBranch,
  StoreSettings,
  TradeInAppraisal,
  UserAccount,
  WarehouseInfo,
  WarrantyTicket
} from '../types';

/**
 * Compatibility exports only. Operational records are intentionally empty:
 * administrators create them from System Settings or their owning module.
 */
export const ERPNEXT_BLUEPRINT_DOCTYPES: ERPNextModuleDocType[] = [
  {
    doctypeName: 'iPhone Inventory Item', module: 'Stock & Serial',
    description: 'Quản lý từng cây iPhone theo IMEI độc nhất, xuất xứ, pin, ngoại hình, iCloud',
    fields: [
      { fieldname: 'imei_number', label: 'IMEI (15 số)', fieldtype: 'Data', reqd: 1 },
      { fieldname: 'serial_number', label: 'Serial Number', fieldtype: 'Data', reqd: 1 },
      { fieldname: 'model_name', label: 'Dòng iPhone', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'storage_capacity', label: 'Dung Lượng', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'color', label: 'Màu Sắc', fieldtype: 'Data', reqd: 1 },
      { fieldname: 'region_code', label: 'Mã Xuất Xứ', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'battery_health_percentage', label: 'Tình Trạng Pin', fieldtype: 'Percent', reqd: 1 },
      { fieldname: 'grade_condition', label: 'Ngoại Hình', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'icloud_status', label: 'Trạng Thái iCloud', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'purchase_price', label: 'Giá Vốn Nhập Kho', fieldtype: 'Currency', reqd: 1 },
      { fieldname: 'valuation_rate', label: 'Giá Bán Niêm Yết', fieldtype: 'Currency', reqd: 1 },
      { fieldname: 'stock_status', label: 'Trạng Thái', fieldtype: 'Select', reqd: 1 }
    ]
  },
  {
    doctypeName: 'iPhone CRM Lead', module: 'CRM & Marketing',
    description: 'Thu thập và nuôi dưỡng khách hàng tiềm năng qua nhiều kênh',
    fields: [
      { fieldname: 'lead_name', label: 'Tên Khách Hàng', fieldtype: 'Data', reqd: 1 },
      { fieldname: 'mobile_no', label: 'Số Điện Thoại / Zalo', fieldtype: 'Data', reqd: 1 },
      { fieldname: 'source', label: 'Nguồn Lead', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'interested_iphone', label: 'Dòng Máy Quan Tâm', fieldtype: 'Link', reqd: 1 },
      { fieldname: 'budget_range', label: 'Ngân Sách Dự Kiến', fieldtype: 'Currency' },
      { fieldname: 'has_trade_in', label: 'Có Thu Cũ Đổi Mới', fieldtype: 'Check' },
      { fieldname: 'pipeline_status', label: 'Tiến Trình', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'assigned_sales_rep', label: 'Nhân Viên Phụ Trách', fieldtype: 'Link' }
    ]
  },
  {
    doctypeName: 'iPhone Trade In Appraisal', module: 'Buying & Valuation',
    description: 'Kiểm định thu cũ đổi mới và tính giá bù trừ',
    fields: [
      { fieldname: 'customer', label: 'Khách Hàng', fieldtype: 'Link', reqd: 1 },
      { fieldname: 'old_device_model', label: 'Dòng Máy Thu Cũ', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'old_device_imei', label: 'IMEI Máy Cũ', fieldtype: 'Data' },
      { fieldname: 'battery_health', label: 'Pin Thực Tế', fieldtype: 'Int' },
      { fieldname: 'screen_grade', label: 'Màn Hình', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'housing_grade', label: 'Vỏ Máy', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'face_id_ok', label: 'FaceID Hoạt Động', fieldtype: 'Check' },
      { fieldname: 'truetone_ok', label: 'TrueTone Hoạt Động', fieldtype: 'Check' },
      { fieldname: 'appraisal_value', label: 'Giá Thu Định Mức', fieldtype: 'Currency', reqd: 1 },
      { fieldname: 'upgrade_to_device', label: 'Máy Muốn Lên Đời', fieldtype: 'Link' },
      { fieldname: 'difference_amount', label: 'Số Tiền Bù Thêm', fieldtype: 'Currency' }
    ]
  },
  {
    doctypeName: 'iPhone Warranty & Repair Ticket', module: 'Support & Service',
    description: 'Tiếp nhận bảo hành và sửa chữa phần cứng',
    fields: [
      { fieldname: 'ticket_code', label: 'Mã Phiếu Bảo Hành', fieldtype: 'Data', reqd: 1 },
      { fieldname: 'device_imei', label: 'IMEI Máy', fieldtype: 'Link', reqd: 1 },
      { fieldname: 'customer_phone', label: 'SĐT Khách', fieldtype: 'Data', reqd: 1 },
      { fieldname: 'symptom_category', label: 'Nhóm Lỗi', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'detailed_issue', label: 'Mô Tả Lỗi Chi Tiết', fieldtype: 'Small Text', reqd: 1 },
      { fieldname: 'assigned_technician', label: 'Kỹ Thuật Viên', fieldtype: 'Link' },
      { fieldname: 'repair_status', label: 'Trạng Thái', fieldtype: 'Select', reqd: 1 },
      { fieldname: 'is_free_warranty', label: 'Bảo Hành Miễn Phí', fieldtype: 'Check' },
      { fieldname: 'repair_cost', label: 'Chi Phí Sửa Chữa', fieldtype: 'Currency' }
    ]
  }
];
export const ROLE_PERMISSIONS_CONFIG = [];
export const INITIAL_USERS: UserAccount[] = [];
export const INITIAL_DEVICES: DeviceItem[] = [];
export const INITIAL_LEADS: Lead[] = [];
export const INITIAL_TRADE_INS: TradeInAppraisal[] = [];
export const INITIAL_WARRANTY_TICKETS: WarrantyTicket[] = [];
export const INITIAL_INVOICES: SalesInvoice[] = [];
export const INITIAL_PARTNERS: Partner[] = [];
export const INITIAL_FUNDS: FundAccount[] = [];
export const INITIAL_CASH_TRANSACTIONS: CashTransaction[] = [];
export const INITIAL_TRANSFERS: StockTransferSlip[] = [];
export const INITIAL_BRANCHES: StoreBranch[] = [];
export const INITIAL_WAREHOUSES: WarehouseInfo[] = [];
export const INITIAL_SPARE_PARTS: SparePart[] = [];
export const INITIAL_PURCHASE_ORDERS: PurchaseOrder[] = [];
export const INITIAL_ATTENDANCE: AttendanceRecord[] = [];

export const INITIAL_STORE_SETTINGS: StoreSettings = {
  companyName: '', brandName: '', hotline: '', supportEmail: '', website: '', taxCode: '',
  headquarterAddress: '', slogan: '', printHeaderNote: '', printFooterNote: '',
  defaultWarrantyMonths: 0, warrantyPackages: [], branches: [], warehouses: []
};

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

export const REPAIR_SERVICES_PRICELIST: RepairServiceItem[] = [];
