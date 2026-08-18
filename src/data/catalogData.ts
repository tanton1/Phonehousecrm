import { MasterCatalogItem, CatalogSubCategory } from '../types';

export const INITIAL_CATALOG_SUBCATEGORIES: CatalogSubCategory[] = [
  // 1. Cấp con của Thiết Bị (DEVICE)
  { id: 'SUB_IP17', parentCategory: 'DEVICE', name: 'iPhone 17 Series (Mới)', code: 'IP17', description: 'iPhone 17, 17 Air (Slim), 17 Pro, 17 Pro Max' },
  { id: 'SUB_IP16', parentCategory: 'DEVICE', name: 'iPhone 16 Series', code: 'IP16', description: 'iPhone 16, 16 Plus, 16 Pro, 16 Pro Max' },
  { id: 'SUB_IP15', parentCategory: 'DEVICE', name: 'iPhone 15 Series', code: 'IP15', description: 'iPhone 15, 15 Plus, 15 Pro, 15 Pro Max' },
  { id: 'SUB_IP14', parentCategory: 'DEVICE', name: 'iPhone 14 Series', code: 'IP14', description: 'iPhone 14, 14 Plus, 14 Pro, 14 Pro Max' },
  { id: 'SUB_IP13', parentCategory: 'DEVICE', name: 'iPhone 13 Series', code: 'IP13', description: 'iPhone 13, 13 Mini, 13 Pro, 13 Pro Max' },
  { id: 'SUB_IP12', parentCategory: 'DEVICE', name: 'iPhone 12 Series', code: 'IP12', description: 'iPhone 12, 12 Mini, 12 Pro, 12 Pro Max' },
  { id: 'SUB_IP11', parentCategory: 'DEVICE', name: 'iPhone 11 Series', code: 'IP11', description: 'iPhone 11, 11 Pro, 11 Pro Max' },
  { id: 'SUB_IPX_8P', parentCategory: 'DEVICE', name: 'iPhone 8P / X / XS Series', code: 'IP8PX', description: 'iPhone 8 Plus, iPhone X, XR, XS, XS Max' },
  { id: 'SUB_IPAD', parentCategory: 'DEVICE', name: 'iPad Pro / Air / Mini', code: 'IPAD', description: 'iPad Pro M4/M2, iPad Air 6, iPad Mini 6/7' },
  { id: 'SUB_MAC', parentCategory: 'DEVICE', name: 'MacBook & iMac', code: 'MAC', description: 'MacBook Pro, MacBook Air M2/M3' },
  { id: 'SUB_WATCH', parentCategory: 'DEVICE', name: 'Apple Watch Series', code: 'WATCH', description: 'Apple Watch Series 9/10, Ultra 2, SE' },

  // 2. Cấp con của Linh Kiện (PART)
  { id: 'SUB_PART_BAT', parentCategory: 'PART', name: 'Pin Zin & Pin Dung Lượng Cao', code: 'PIN', description: 'Pin Pisen, DeSay, Bison, Zin bóc máy' },
  { id: 'SUB_PART_SCR', parentCategory: 'PART', name: 'Màn Hình Zin / GX / OLED', code: 'MAN', description: 'Màn hình zin ép kính, zin bóc, màn GX OLED' },
  { id: 'SUB_PART_CAM', parentCategory: 'PART', name: 'Cụm Camera Trước & Sau', code: 'CAM', description: 'Camera góc rộng, tele, TrueDepth Face ID' },
  { id: 'SUB_PART_GLS', parentCategory: 'PART', name: 'Kính Ép & Kính Lưng Sau', code: 'KINH', description: 'Kính màn hình, nắp lưng kính laser' },
  { id: 'SUB_PART_CBL', parentCategory: 'PART', name: 'Cáp Sạc / Cụm Loa Mic', code: 'CAP', description: 'Chân sạc trong, loa trong, mic thoại' },
  { id: 'SUB_PART_MAIN', parentCategory: 'PART', name: 'Mainboard & IC Phần Cứng', code: 'MAIN', description: 'Main zin, IC sạc, IC Wifi, IC Nguồn' },

  // 3. Cấp con của Phụ Kiện (ACCESSORY)
  { id: 'SUB_ACC_CHG', parentCategory: 'ACCESSORY', name: 'Củ Sạc Nhanh 20W - 67W', code: 'CU_SAC', description: 'Củ sạc Apple Type-C, Anker, Baseus, Uorange' },
  { id: 'SUB_ACC_CBL', parentCategory: 'ACCESSORY', name: 'Cáp Sạc & Dây Chuyển Đổi', code: 'CAP_SAC', description: 'Cáp C-to-C bọc dù, C-to-Lightning, Hub OTG' },
  { id: 'SUB_ACC_AIR', parentCategory: 'ACCESSORY', name: 'Tai Nghe AirPods & Bluetooth', code: 'TAI_NGHE', description: 'AirPods Pro 2, AirPods 3/4, AirPods Max' },
  { id: 'SUB_ACC_CASE', parentCategory: 'ACCESSORY', name: 'Ốp Lưng MagSafe & Chống Sốc', code: 'OP_LUNG', description: 'Ốp từ tính MagSafe, UAG, Torras, Youngkit' },
  { id: 'SUB_ACC_GLS', parentCategory: 'ACCESSORY', name: 'Kính Cường Lực & Dán PPF', code: 'CUONG_LUC', description: 'Cường lực KingKong, MIPOW, Hoda, Dán PPF' },
  { id: 'SUB_ACC_BNK', parentCategory: 'ACCESSORY', name: 'Sạc Dự Phòng & Giá Đỡ', code: 'PIN_DP', description: 'Sạc dự phòng MagSafe, giá đỡ ô tô, đế sạc 3in1' },
  { id: 'SUB_ACC_CARE', parentCategory: 'ACCESSORY', name: 'Gói Bảo Hành VIP Care', code: 'VIP_CARE', description: 'Bảo hành 1 đổi 1 12 tháng, rơi vỡ ngấm nước' }
];

export const INITIAL_CATALOG_ITEMS: MasterCatalogItem[] = (() => {
  const PRESET_MODELS = [
    { name: 'iPhone 17 Pro Max', subCode: 'IP17', storages: ['256GB', '512GB', '1TB', '2TB'], colors: ['Titan Đồng Sa Mạc', 'Titan Tự Nhiên', 'Titan Đen', 'Titan Bạc'], baseImport: 35500000, baseRetail: 38990000 },
    { name: 'iPhone 17 Pro', subCode: 'IP17', storages: ['256GB', '512GB', '1TB'], colors: ['Titan Đồng Sa Mạc', 'Titan Tự Nhiên', 'Titan Đen', 'Titan Bạc'], baseImport: 30500000, baseRetail: 33490000 },
    { name: 'iPhone 17 Air (Slim)', subCode: 'IP17', storages: ['256GB', '512GB'], colors: ['Bạc Ánh Kim', 'Titan Đen', 'Xanh Băng'], baseImport: 27500000, baseRetail: 29990000 },
    { name: 'iPhone 17', subCode: 'IP17', storages: ['128GB', '256GB', '512GB'], colors: ['Tím Oải Hương', 'Bạc Ánh Kim', 'Xanh Băng', 'Đen'], baseImport: 22000000, baseRetail: 24490000 },
    { name: 'iPhone 16 Pro Max', subCode: 'IP16', storages: ['256GB', '512GB', '1TB'], colors: ['Titan Sa Mạc', 'Titan Tự Nhiên', 'Titan Đen', 'Titan Trắng'], baseImport: 32500000, baseRetail: 34990000 },
    { name: 'iPhone 16 Pro', subCode: 'IP16', storages: ['128GB', '256GB', '512GB', '1TB'], colors: ['Titan Sa Mạc', 'Titan Tự Nhiên', 'Titan Đen', 'Titan Trắng'], baseImport: 26500000, baseRetail: 28990000 },
    { name: 'iPhone 16 Plus', subCode: 'IP16', storages: ['128GB', '256GB', '512GB'], colors: ['Xanh Lưu Ly', 'Xanh Mòng Két', 'Hồng', 'Trắng', 'Đen'], baseImport: 23500000, baseRetail: 25990000 },
    { name: 'iPhone 16', subCode: 'IP16', storages: ['128GB', '256GB', '512GB'], colors: ['Xanh Lưu Ly', 'Xanh Mòng Két', 'Hồng', 'Trắng', 'Đen'], baseImport: 20500000, baseRetail: 22490000 },
    { name: 'iPhone 15 Pro Max', subCode: 'IP15', storages: ['256GB', '512GB', '1TB'], colors: ['Titan Tự Nhiên', 'Titan Xanh', 'Titan Trắng', 'Titan Đen'], baseImport: 22800000, baseRetail: 25490000 },
    { name: 'iPhone 15 Pro', subCode: 'IP15', storages: ['128GB', '256GB', '512GB', '1TB'], colors: ['Titan Tự Nhiên', 'Titan Xanh', 'Titan Trắng', 'Titan Đen'], baseImport: 18500000, baseRetail: 20990000 },
    { name: 'iPhone 15 Plus', subCode: 'IP15', storages: ['128GB', '256GB', '512GB'], colors: ['Hồng Pastel', 'Xanh Mint', 'Vàng', 'Xanh Dương', 'Đen'], baseImport: 16500000, baseRetail: 18790000 },
    { name: 'iPhone 15', subCode: 'IP15', storages: ['128GB', '256GB', '512GB'], colors: ['Hồng Pastel', 'Xanh Mint', 'Vàng', 'Xanh Dương', 'Đen'], baseImport: 14500000, baseRetail: 16490000 },
    { name: 'iPhone 14 Pro Max', subCode: 'IP14', storages: ['128GB', '256GB', '512GB', '1TB'], colors: ['Tím Deep Purple', 'Vàng Gold', 'Bạc Silver', 'Đen Space Black'], baseImport: 18200000, baseRetail: 20490000 },
    { name: 'iPhone 14 Pro', subCode: 'IP14', storages: ['128GB', '256GB', '512GB'], colors: ['Tím Deep Purple', 'Vàng Gold', 'Bạc Silver', 'Đen Space Black'], baseImport: 15200000, baseRetail: 17290000 },
    { name: 'iPhone 14 Plus', subCode: 'IP14', storages: ['128GB', '256GB', '512GB'], colors: ['Xanh Dương', 'Tím', 'Vàng', 'Ánh Sao Starlight', 'Đen Midnight'], baseImport: 13500000, baseRetail: 15390000 },
    { name: 'iPhone 14', subCode: 'IP14', storages: ['128GB', '256GB', '512GB'], colors: ['Xanh Dương', 'Tím', 'Vàng', 'Ánh Sao Starlight', 'Đen Midnight'], baseImport: 12200000, baseRetail: 13990000 },
    { name: 'iPhone 13 Pro Max', subCode: 'IP13', storages: ['128GB', '256GB', '512GB', '1TB'], colors: ['Xanh Sierra Blue', 'Xanh Alpine Green', 'Vàng Gold', 'Bạc Silver', 'Xám Graphite'], baseImport: 14500000, baseRetail: 16490000 },
    { name: 'iPhone 13 Pro', subCode: 'IP13', storages: ['128GB', '256GB', '512GB'], colors: ['Xanh Sierra Blue', 'Xanh Alpine Green', 'Vàng Gold', 'Bạc Silver', 'Xám Graphite'], baseImport: 12500000, baseRetail: 14290000 },
    { name: 'iPhone 13', subCode: 'IP13', storages: ['128GB', '256GB', '512GB'], colors: ['Hồng Pink', 'Xanh Green', 'Ánh Sao', 'Midnight', 'Xanh Blue', 'Đỏ'], baseImport: 10500000, baseRetail: 12290000 },
    { name: 'iPhone 13 Mini', subCode: 'IP13', storages: ['128GB', '256GB', '512GB'], colors: ['Hồng Pink', 'Xanh Green', 'Ánh Sao', 'Midnight', 'Xanh Blue'], baseImport: 8500000, baseRetail: 9990000 },
    { name: 'iPhone 12 Pro Max', subCode: 'IP12', storages: ['128GB', '256GB', '512GB'], colors: ['Xanh Pacific Blue', 'Vàng Gold', 'Than Chì Graphite', 'Bạc Silver'], baseImport: 11200000, baseRetail: 12990000 },
    { name: 'iPhone 12 Pro', subCode: 'IP12', storages: ['128GB', '256GB', '512GB'], colors: ['Xanh Pacific Blue', 'Vàng Gold', 'Than Chì Graphite', 'Bạc Silver'], baseImport: 9200000, baseRetail: 10790000 },
    { name: 'iPhone 12', subCode: 'IP12', storages: ['64GB', '128GB', '256GB'], colors: ['Tím Purple', 'Xanh Dương Blue', 'Trắng White', 'Đen Black', 'Xanh Mint'], baseImport: 7200000, baseRetail: 8490000 },
    { name: 'iPhone 12 Mini', subCode: 'IP12', storages: ['64GB', '128GB', '256GB'], colors: ['Tím Purple', 'Xanh Dương Blue', 'Trắng White', 'Đen Black'], baseImport: 5800000, baseRetail: 6990000 },
    { name: 'iPhone 11 Pro Max', subCode: 'IP11', storages: ['64GB', '256GB', '512GB'], colors: ['Xanh Midnight Green', 'Vàng Gold', 'Bạc Silver', 'Xám Space Gray'], baseImport: 8300000, baseRetail: 9790000 },
    { name: 'iPhone 11 Pro', subCode: 'IP11', storages: ['64GB', '256GB', '512GB'], colors: ['Xanh Midnight Green', 'Vàng Gold', 'Bạc Silver', 'Xám Space Gray'], baseImport: 6800000, baseRetail: 7990000 },
    { name: 'iPhone 11', subCode: 'IP11', storages: ['64GB', '128GB', '256GB'], colors: ['Tím Purple', 'Xanh Mint', 'Trắng White', 'Đen Black', 'Vàng', 'Đỏ'], baseImport: 5300000, baseRetail: 6290000 },
    { name: 'iPhone XS Max', subCode: 'IP8PX', storages: ['64GB', '256GB', '512GB'], colors: ['Vàng Gold', 'Bạc Silver', 'Xám Space Gray'], baseImport: 5200000, baseRetail: 6190000 },
    { name: 'iPhone XS', subCode: 'IP8PX', storages: ['64GB', '256GB', '512GB'], colors: ['Vàng Gold', 'Bạc Silver', 'Xám Space Gray'], baseImport: 4200000, baseRetail: 4990000 },
    { name: 'iPhone XR', subCode: 'IP8PX', storages: ['64GB', '128GB', '256GB'], colors: ['Đỏ Product RED', 'Đen Black', 'Trắng White', 'Vàng', 'Xanh Dương'], baseImport: 3900000, baseRetail: 4690000 },
    { name: 'iPhone X', subCode: 'IP8PX', storages: ['64GB', '256GB'], colors: ['Bạc Silver', 'Xám Space Gray'], baseImport: 3400000, baseRetail: 4190000 },
    { name: 'iPhone 8 Plus', subCode: 'IP8PX', storages: ['64GB', '128GB', '256GB'], colors: ['Vàng Gold', 'Đỏ Product RED', 'Xám Space Gray', 'Bạc Silver'], baseImport: 2800000, baseRetail: 3490000 }
  ];

  const generatedItems: MasterCatalogItem[] = [];
  let barcodeCounter = 89317001001;

  PRESET_MODELS.forEach((model, mIndex) => {
    model.storages.forEach((storage, sIndex) => {
      model.colors.forEach((color, cIndex) => {
        const importPrice = model.baseImport + (sIndex * 1500000);
        const retailPrice = model.baseRetail + (sIndex * 1800000);
        
        let shortModel = model.name.replace(/iPhone /g, 'IP');
        shortModel = shortModel.replace(/ Pro Max/g, 'PM');
        shortModel = shortModel.replace(/ Pro/g, 'P');
        shortModel = shortModel.replace(/ Plus/g, 'PLS');
        shortModel = shortModel.replace(/ Mini/g, 'MINI');
        shortModel = shortModel.replace(/ Air \(Slim\)/g, 'AIR');
        shortModel = shortModel.replace(/\s+/g, '');
        
        // short color name
        let shortColor = color.split(' ')[0].toUpperCase();
        if (shortColor === 'TITAN' && color.split(' ').length > 1) {
          shortColor = color.split(' ')[1].toUpperCase();
        }
        
        const condition = mIndex < 8 ? 'New Seal' : 'Like New 99%';
        const sku = `${shortModel}-${storage}-${shortColor}-${condition === 'New Seal' ? 'NEW' : '99'}`.replace(/\s+/g, '');
        const subCat = INITIAL_CATALOG_SUBCATEGORIES.find(s => s.code === model.subCode);

        // Simple default image mapping based on series
        let imageUrl = 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=600&auto=format&fit=crop&q=80';
        if (model.subCode === 'IP17' || model.subCode === 'IP16') {
          imageUrl = 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80';
        } else if (model.subCode === 'IP15' || model.subCode === 'IP14') {
          imageUrl = 'https://images.unsplash.com/photo-1696446701796-da61225697cc?w=600&auto=format&fit=crop&q=80';
        } else if (model.subCode === 'IP13') {
          imageUrl = 'https://images.unsplash.com/photo-1632661674596-df8be070a5c5?w=600&auto=format&fit=crop&q=80';
        } else if (model.subCode === 'IP12') {
          imageUrl = 'https://images.unsplash.com/photo-1603791440384-56cd371ee9a7?w=600&auto=format&fit=crop&q=80';
        }

        generatedItems.push({
          id: `CAT_${sku}_${barcodeCounter}`,
          sku: sku,
          name: `${model.name} ${storage} ${color} ${condition === 'Like New 99%' ? '(99%)' : '(New Seal)'}`,
          category: 'DEVICE',
          subCategory: subCat?.name || 'iPhone',
          subCategoryId: subCat?.id || 'SUB_IP17',
          brand: 'Apple',
          unit: 'Chiếc',
          barcode: barcodeCounter.toString(),
          model: model.name,
          storage: storage,
          color: color,
          condition: condition,
          region: cIndex % 2 === 0 ? 'VN/A' : 'LL/A',
          imageUrl: imageUrl,
          defaultImportPrice: importPrice,
          defaultRetailPrice: retailPrice,
          wholesalePrice: importPrice + 500000,
          minStockLevel: 5,
          maxStockLevel: 25,
          warrantyPeriodMonths: condition === 'New Seal' ? 12 : 6,
          vatRate: condition === 'New Seal' ? 10 : 0,
          status: 'active'
        });
        
        barcodeCounter++;
      });
    });
  });
  
  const staticItems: MasterCatalogItem[] = [
    // =========================================================================
    // 9. IPAD & MACBOOK & APPLE WATCH
    // =========================================================================
  {
    id: 'CAT_IPAD_M4_11',
    sku: 'IPAD-PRO-M4-11-256',
    name: 'iPad Pro 11 inch M4 256GB Wi-Fi Space Black (New Seal)',
    category: 'DEVICE',
    subCategory: 'iPad Pro / Air / Mini',
    subCategoryId: 'SUB_IPAD',
    brand: 'Apple',
    unit: 'Chiếc',
    barcode: '89320001001',
    model: 'iPad Pro M4',
    storage: '256GB',
    color: 'Space Black',
    condition: 'New Seal',
    region: 'ZA/A',
    imageUrl: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600&auto=format&fit=crop&q=80',
    defaultImportPrice: 24500000,
    defaultRetailPrice: 27990000,
    wholesalePrice: 26000000,
    minStockLevel: 2,
    maxStockLevel: 10,
    warrantyPeriodMonths: 12,
    vatRate: 10,
    status: 'active'
  },
  {
    id: 'CAT_WATCH_U2',
    sku: 'AW-ULTRA2-49-ORG',
    name: 'Apple Watch Ultra 2 49mm Titanium Dây Ocean Cam',
    category: 'DEVICE',
    subCategory: 'Apple Watch Series',
    subCategoryId: 'SUB_WATCH',
    brand: 'Apple',
    unit: 'Chiếc',
    barcode: '89320001002',
    model: 'Apple Watch Ultra 2',
    storage: '64GB',
    color: 'Titanium Dây Cam',
    condition: 'New Seal',
    region: 'VN/A',
    imageUrl: 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=600&auto=format&fit=crop&q=80',
    defaultImportPrice: 18500000,
    defaultRetailPrice: 20990000,
    wholesalePrice: 19500000,
    minStockLevel: 2,
    maxStockLevel: 8,
    warrantyPeriodMonths: 12,
    vatRate: 10,
    status: 'active'
  },

  // =========================================================================
  // 10. LINH KIỆN SỬA CHỮA CHÍNH HÃNG (PARTS)
  // =========================================================================
  {
    id: 'CAT_PART_SCR_15PM',
    sku: 'SCR-IP15PM-ORIG',
    name: 'Màn hình iPhone 15 Pro Max Zin Bóc Máy Ép Kính',
    category: 'PART',
    subCategory: 'Màn Hình Zin / GX / OLED',
    subCategoryId: 'SUB_PART_SCR',
    brand: 'Apple Original',
    unit: 'Cụm',
    barcode: '89330001001',
    model: 'Màn hình zin',
    imageUrl: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80',
    compatibleModels: ['iPhone 15 Pro Max'],
    defaultImportPrice: 5800000,
    defaultRetailPrice: 7200000,
    wholesalePrice: 6300000,
    minStockLevel: 4,
    maxStockLevel: 15,
    warrantyPeriodMonths: 6,
    status: 'active'
  },
  {
    id: 'CAT_PART_SCR_13PM',
    sku: 'SCR-IP13PM-GX',
    name: 'Màn hình GX OLED iPhone 13 Pro Max Tần số quét 120Hz',
    category: 'PART',
    subCategory: 'Màn Hình Zin / GX / OLED',
    subCategoryId: 'SUB_PART_SCR',
    brand: 'GX OLED',
    unit: 'Cụm',
    barcode: '89330001002',
    model: 'Màn GX 13PM',
    imageUrl: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80',
    compatibleModels: ['iPhone 13 Pro Max'],
    defaultImportPrice: 2200000,
    defaultRetailPrice: 3200000,
    wholesalePrice: 2500000,
    minStockLevel: 6,
    maxStockLevel: 20,
    warrantyPeriodMonths: 6,
    status: 'active'
  },
  {
    id: 'CAT_PART_BAT_13PM',
    sku: 'BAT-IP13PM-PISEN',
    name: 'Pin Pisen iPhone 13 Pro Max Dung Lượng Chuẩn (BH 12T)',
    category: 'PART',
    subCategory: 'Pin Zin & Pin Dung Lượng Cao',
    subCategoryId: 'SUB_PART_BAT',
    brand: 'Pisen',
    unit: 'Viên',
    barcode: '89330001003',
    model: 'Pin Pisen',
    imageUrl: 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=600&auto=format&fit=crop&q=80',
    compatibleModels: ['iPhone 13 Pro Max'],
    defaultImportPrice: 420000,
    defaultRetailPrice: 850000,
    wholesalePrice: 520000,
    minStockLevel: 15,
    maxStockLevel: 50,
    warrantyPeriodMonths: 12,
    status: 'active'
  },
  {
    id: 'CAT_PART_BAT_11',
    sku: 'BAT-IP11-DESAY',
    name: 'Pin DeSay iPhone 11 Dung Lượng Cao Siêu Bền',
    category: 'PART',
    subCategory: 'Pin Zin & Pin Dung Lượng Cao',
    subCategoryId: 'SUB_PART_BAT',
    brand: 'DeSay',
    unit: 'Viên',
    barcode: '89330001004',
    model: 'Pin DeSay',
    imageUrl: 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=600&auto=format&fit=crop&q=80',
    compatibleModels: ['iPhone 11'],
    defaultImportPrice: 280000,
    defaultRetailPrice: 550000,
    wholesalePrice: 350000,
    minStockLevel: 20,
    maxStockLevel: 60,
    warrantyPeriodMonths: 12,
    status: 'active'
  },
  {
    id: 'CAT_PART_CAM_14PM',
    sku: 'CAM-IP14PM-ORIG',
    name: 'Cụm Camera sau iPhone 14 Pro Max Zin Bóc Máy 48MP',
    category: 'PART',
    subCategory: 'Cụm Camera Trước & Sau',
    subCategoryId: 'SUB_PART_CAM',
    brand: 'Apple Original',
    unit: 'Cụm',
    barcode: '89330001005',
    model: 'Camera sau',
    imageUrl: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80',
    compatibleModels: ['iPhone 14 Pro Max'],
    defaultImportPrice: 1800000,
    defaultRetailPrice: 2500000,
    wholesalePrice: 2000000,
    minStockLevel: 3,
    maxStockLevel: 10,
    warrantyPeriodMonths: 3,
    status: 'active'
  },

  // =========================================================================
  // 11. PHỤ KIỆN HOT PHONE HOUSE (ACCESSORIES)
  // =========================================================================
  {
    id: 'CAT_ACC_CHG_20W',
    sku: 'ACC-CHG-20W-APPLE',
    name: 'Củ sạc nhanh Apple 20W USB-C Zin Chính Hãng VN/A',
    category: 'ACCESSORY',
    subCategory: 'Củ Sạc Nhanh 20W - 67W',
    subCategoryId: 'SUB_ACC_CHG',
    brand: 'Apple',
    unit: 'Củ',
    barcode: '89340001001',
    model: 'Sạc nhanh 20W',
    imageUrl: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop&q=80',
    compatibleModels: ['iPhone 8 Plus - iPhone 17 Pro Max'],
    defaultImportPrice: 240000,
    defaultRetailPrice: 490000,
    wholesalePrice: 320000,
    minStockLevel: 50,
    maxStockLevel: 200,
    warrantyPeriodMonths: 12,
    vatRate: 10,
    status: 'active'
  },
  {
    id: 'CAT_ACC_CBL_CTOC',
    sku: 'ACC-CBL-CTOC-60W',
    name: 'Cáp sạc bọc dù Apple USB-C to USB-C 1m (60W)',
    category: 'ACCESSORY',
    subCategory: 'Cáp Sạc & Dây Chuyển Đổi',
    subCategoryId: 'SUB_ACC_CBL',
    brand: 'Apple',
    unit: 'Sợi',
    barcode: '89340001002',
    model: 'Cáp C to C',
    imageUrl: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop&q=80',
    compatibleModels: ['iPhone 15/16/17, iPad, Mac'],
    defaultImportPrice: 190000,
    defaultRetailPrice: 390000,
    wholesalePrice: 260000,
    minStockLevel: 40,
    maxStockLevel: 150,
    warrantyPeriodMonths: 12,
    vatRate: 10,
    status: 'active'
  },
  {
    id: 'CAT_ACC_AIRPODS_PRO2',
    sku: 'ACC-AIRPODS-PRO-2',
    name: 'Tai nghe AirPods Pro 2 MagSafe Type-C (New Seal VN/A)',
    category: 'ACCESSORY',
    subCategory: 'Tai Nghe AirPods & Bluetooth',
    subCategoryId: 'SUB_ACC_AIR',
    brand: 'Apple',
    unit: 'Bộ',
    barcode: '89340001003',
    model: 'AirPods Pro 2',
    imageUrl: 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600&auto=format&fit=crop&q=80',
    compatibleModels: ['Apple All Ecosystem'],
    defaultImportPrice: 4850000,
    defaultRetailPrice: 5490000,
    wholesalePrice: 5100000,
    minStockLevel: 10,
    maxStockLevel: 50,
    warrantyPeriodMonths: 12,
    vatRate: 10,
    status: 'active'
  },
  {
    id: 'CAT_ACC_CASE_MAG',
    sku: 'ACC-CASE-IP16PM-MAG',
    name: 'Ốp lưng từ tính MagSafe Magnetic Phone House chống sốc',
    category: 'ACCESSORY',
    subCategory: 'Ốp Lưng MagSafe & Chống Sốc',
    subCategoryId: 'SUB_ACC_CASE',
    brand: 'Phone House Studio',
    unit: 'Chiếc',
    barcode: '89340001004',
    model: 'Ốp MagSafe',
    imageUrl: 'https://images.unsplash.com/photo-1603791440384-56cd371ee9a7?w=600&auto=format&fit=crop&q=80',
    compatibleModels: ['iPhone 16 Pro Max', 'iPhone 15 Pro Max', 'iPhone 14 Pro Max'],
    defaultImportPrice: 65000,
    defaultRetailPrice: 180000,
    wholesalePrice: 95000,
    minStockLevel: 80,
    maxStockLevel: 300,
    warrantyPeriodMonths: 3,
    status: 'active'
  },
  {
    id: 'CAT_ACC_GLS_KINGKONG',
    sku: 'ACC-GLS-KINGKONG-ALL',
    name: 'Kính cường lực tự dán KingKong 9D chống vỡ viền',
    category: 'ACCESSORY',
    subCategory: 'Kính Cường Lực & Dán PPF',
    subCategoryId: 'SUB_ACC_GLS',
    brand: 'KingKong',
    unit: 'Miếng',
    barcode: '89340001005',
    model: 'Kính cường lực',
    imageUrl: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80',
    compatibleModels: ['iPhone 8 Plus - iPhone 17 Pro Max'],
    defaultImportPrice: 25000,
    defaultRetailPrice: 90000,
    wholesalePrice: 40000,
    minStockLevel: 100,
    maxStockLevel: 500,
    warrantyPeriodMonths: 1,
    status: 'active'
  }];

  return [...generatedItems, ...staticItems];
})();
