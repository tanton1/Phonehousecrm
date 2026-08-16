import { MasterCatalogItem } from '../types';

export const INITIAL_CATALOG_ITEMS: MasterCatalogItem[] = [
  {
    id: 'CAT_001',
    sku: 'IP15PM-256-NAT',
    name: 'iPhone 15 Pro Max 256GB Titan Tự Nhiên',
    category: 'DEVICE',
    model: 'iPhone 15 Pro Max',
    storage: '256GB',
    color: 'Titan Tự Nhiên (Natural)',
    condition: 'New Seal',
    region: 'VN/A (Chính hãng)',
    defaultImportPrice: 28500000,
    defaultRetailPrice: 30500000,
    minStockLevel: 5
  },
  {
    id: 'CAT_002',
    sku: 'IP15PM-256-BLK',
    name: 'iPhone 15 Pro Max 256GB Titan Đen',
    category: 'DEVICE',
    model: 'iPhone 15 Pro Max',
    storage: '256GB',
    color: 'Titan Đen (Black)',
    condition: 'New Seal',
    region: 'VN/A (Chính hãng)',
    defaultImportPrice: 28200000,
    defaultRetailPrice: 30200000,
    minStockLevel: 5
  },
  {
    id: 'CAT_003',
    sku: 'BAT-IP13-PISEN',
    name: 'Pin Pisen iPhone 13 Dung Lượng Chuẩn',
    category: 'PART',
    model: 'Pin',
    compatibleModels: ['iPhone 13'],
    defaultImportPrice: 350000,
    defaultRetailPrice: 650000,
    minStockLevel: 20
  },
  {
    id: 'CAT_004',
    sku: 'SCR-IP14P-OLED',
    name: 'Màn hình OLED iPhone 14 Pro zin linh kiện',
    category: 'PART',
    model: 'Màn hình',
    compatibleModels: ['iPhone 14 Pro'],
    defaultImportPrice: 2500000,
    defaultRetailPrice: 3500000,
    minStockLevel: 10
  },
  {
    id: 'CAT_005',
    sku: 'ACC-CHG-20W',
    name: 'Củ sạc nhanh Apple 20W Type-C zin bóc máy',
    category: 'ACCESSORY',
    compatibleModels: ['All Type-C'],
    defaultImportPrice: 200000,
    defaultRetailPrice: 450000,
    minStockLevel: 50
  },
  {
    id: 'CAT_006',
    sku: 'ACC-CASE-IP15PM-CLR',
    name: 'Ốp lưng trong suốt Magsafe iPhone 15 Pro Max',
    category: 'ACCESSORY',
    compatibleModels: ['iPhone 15 Pro Max'],
    defaultImportPrice: 50000,
    defaultRetailPrice: 150000,
    minStockLevel: 100
  }
];
