const fs = require('fs');
let code = fs.readFileSync('src/data/initialData.ts', 'utf-8');

// Ensure StockTransferSlip is imported in initialData
if (!code.includes('StockTransferSlip')) {
  code = code.replace("import { \n  DeviceItem,", "import { \n  DeviceItem,\n  StockTransferSlip,");
  if (!code.includes('StockTransferSlip')) {
    code = code.replace("import {", "import {\n  StockTransferSlip,");
  }
}

// Add warehouses to devices if not present
const warehouses = ['KHO_TONG', 'KHO_PHONEHOUSE', 'KHO_XSTORE'];
code = code.replace(/(\{\s*id:\s*'DEV-\d+',[\s\S]*?status:\s*'(?:in_stock|reserved|sold|warranty|repairing)',)(?![\s\S]*?warehouse:)/g, (match, p1) => {
  // pick a warehouse based on id
  const idNum = parseInt(match.match(/DEV-(\d+)/)[1]);
  const wh = warehouses[idNum % 3];
  return p1 + `\n    warehouse: '${wh}',`;
});

// Append INITIAL_TRANSFERS & REPAIR_SERVICES_PRICELIST
if (!code.includes('INITIAL_TRANSFERS')) {
  const extraData = `

export interface RepairServiceItem {
  id: string;
  category: 'THAY_MAN_HINH' | 'THAY_PIN' | 'EP_KINH' | 'FACE_ID' | 'MAINBOARD_NGUON' | 'CAMERA_LOA';
  categoryName: string;
  name: string;
  compatibleModels: string;
  costPrice: number;
  sellPrice: number;
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

export const INITIAL_TRANSFERS: StockTransferSlip[] = [
  {
    id: 'TRF-001',
    code: 'CK-20250214-001',
    fromWarehouse: 'KHO_TONG',
    fromWarehouseName: 'Kho Tổng (Central Warehouse)',
    toWarehouse: 'KHO_PHONEHOUSE',
    toWarehouseName: 'Kho PhoneHouse (Cầu Giấy)',
    createdDate: '2025-02-14 09:30',
    creator: 'Nhật Tân (Giám Đốc Kho)',
    transporter: 'Nguyễn Văn Hùng (Shipper Nội Bộ)',
    status: 'COMPLETED',
    items: [
      {
        type: 'device',
        id: 'DEV-001',
        imei: '356890123456789',
        name: 'iPhone 16 Pro Max 256GB Titan Sa Mạc VN/A',
        model: 'iPhone 16 Pro Max',
        color: 'Titan Sa Mạc (Desert)',
        storage: '256GB',
        condition: 'New Seal',
        quantity: 1,
        costPrice: 31000000
      },
      {
        type: 'device',
        id: 'DEV-002',
        imei: '357901234567890',
        name: 'iPhone 16 Pro 128GB Titan Tự Nhiên LL/A',
        model: 'iPhone 16 Pro',
        color: 'Titan Tự Nhiên (Natural)',
        storage: '128GB',
        condition: 'Like New 99%',
        quantity: 1,
        costPrice: 24200000
      }
    ],
    totalQuantity: 2,
    totalValue: 55200000,
    notes: 'Điều chuyển bổ sung máy iPhone 16 Series phục vụ mở bán tại showroom Phone House Cầu Giấy',
    receivedDate: '2025-02-14 11:15',
    receiver: 'Tuấn (Cửa Hàng Trưởng Cầu Giấy)'
  },
  {
    id: 'TRF-002',
    code: 'CK-20250214-002',
    fromWarehouse: 'KHO_TONG',
    fromWarehouseName: 'Kho Tổng (Central Warehouse)',
    toWarehouse: 'KHO_XSTORE',
    toWarehouseName: 'Kho Xstore (Trần Duy Hưng)',
    createdDate: '2025-02-14 14:00',
    creator: 'Nhật Tân (Giám Đốc Kho)',
    transporter: 'Trần Minh Đức (KTV Điều Vận)',
    status: 'IN_TRANSIT',
    items: [
      {
        type: 'device',
        id: 'DEV-003',
        imei: '354567890123456',
        name: 'iPhone 15 Pro Max 256GB Titan Tự Nhiên VN/A',
        model: 'iPhone 15 Pro Max',
        color: 'Titan Tự Nhiên',
        storage: '256GB',
        condition: 'Like New 99%',
        quantity: 1,
        costPrice: 22800000
      },
      {
        type: 'device',
        id: 'DEV-004',
        imei: '358901234567891',
        name: 'iPhone 15 Pro 128GB Titan Xanh LL/A',
        model: 'iPhone 15 Pro',
        color: 'Titan Xanh (Blue)',
        storage: '128GB',
        condition: '98% Cấn Nhẹ',
        quantity: 1,
        costPrice: 17800000
      }
    ],
    totalQuantity: 2,
    totalValue: 40600000,
    notes: 'Chuyển gấp cho chi nhánh Xstore Trần Duy Hưng trả khách đã đặt cọc giữ máy',
    receiver: 'Hoàng (Quản Lý Xstore)'
  },
  {
    id: 'TRF-003',
    code: 'CK-20250215-001',
    fromWarehouse: 'KHO_PHONEHOUSE',
    fromWarehouseName: 'Kho PhoneHouse (Cầu Giấy)',
    toWarehouse: 'KHO_XSTORE',
    toWarehouseName: 'Kho Xstore (Trần Duy Hưng)',
    createdDate: '2025-02-15 08:30',
    creator: 'Tuấn (Cửa Hàng Trưởng)',
    status: 'PENDING',
    items: [
      {
        type: 'device',
        id: 'DEV-006',
        imei: '359012345678902',
        name: 'iPhone 13 128GB Trắng Starlight VN/A',
        model: 'iPhone 13',
        color: 'Trắng Starlight',
        storage: '128GB',
        condition: 'Like New 99%',
        quantity: 1,
        costPrice: 9800000
      }
    ],
    totalQuantity: 1,
    totalValue: 9800000,
    notes: 'Điều chuyển cân đối hàng tồn máy tầm trung cho Xstore'
  }
];
`;
  code += extraData;
}

fs.writeFileSync('src/data/initialData.ts', code, 'utf-8');
console.log('Successfully updated initialData.ts');
