/**
 * The first PhoneHouse catalog starter set.  It deliberately creates only
 * editable setup records: it never creates a sellable SKU, stock balance,
 * IMEI or serial number.
 */

export type IphoneCatalogKind = 'DEVICE' | 'PART' | 'ACCESSORY' | 'SERVICE';

export interface IphoneSeedDictionary {
  id: string;
  dictionaryType: 'BRAND' | 'FAMILY' | 'CATEGORY' | 'ATTRIBUTE' | 'TEMPLATE';
  key: string;
  code: string;
  name: string;
  aliases?: string[];
  parentId?: string;
  kind?: IphoneCatalogKind;
  familyId?: string;
  familyCode?: string;
  groupId?: string;
  groupCode?: string;
  config?: Record<string, unknown>;
}

export interface IphoneSeedModel {
  id: string;
  brandCode: 'APP';
  brandName: 'Apple';
  seriesCode: 'IPHONE';
  seriesName: 'iPhone';
  modelCode: string;
  modelName: string;
  releaseYear: number;
  aliases: string[];
}

export const IPHONE_SEED_VERSION = 'IPHONE_STANDARD_V1';
export const IPHONE_FAMILY_ID = 'CAT_FAMILY_IPHONE';

const familyConfig = { familyCode: 'IPHONE', familyName: 'iPhone', editable: true };
const groupConfig = (kind: IphoneCatalogKind, parentGroupId?: string, extra: Record<string, unknown> = {}) => ({
  kind,
  familyId: IPHONE_FAMILY_ID,
  ...(parentGroupId ? { parentGroupId } : {}),
  editable: true,
  ...extra
});

const group = (id: string, code: string, name: string, kind: IphoneCatalogKind, parentId?: string, extra: Record<string, unknown> = {}): IphoneSeedDictionary => ({
  id,
  dictionaryType: 'CATEGORY',
  key: 'GROUP',
  code,
  name,
  ...(parentId ? { parentId } : {}),
  // Kept at the top level as well as in config so the screen can filter
  // groups without understanding the template configuration.
  kind,
  familyId: IPHONE_FAMILY_ID,
  familyCode: 'IPHONE',
  config: groupConfig(kind, parentId, extra)
});

const attribute = (id: string, key: string, code: string, name: string, inputType: string, extra: Record<string, unknown> = {}): IphoneSeedDictionary => ({
  id,
  dictionaryType: 'ATTRIBUTE',
  key,
  code,
  name,
  config: { inputType, definition: true, editable: true, ...extra }
});

const attributeValue = (id: string, key: string, code: string, name: string, definitionId: string): IphoneSeedDictionary => ({
  id,
  dictionaryType: 'ATTRIBUTE',
  key,
  code,
  name,
  parentId: definitionId,
  config: { valueOf: definitionId, editable: true }
});

const template = (
  id: string,
  code: string,
  name: string,
  kind: IphoneCatalogKind,
  groupId: string,
  requiredAttributeKeys: string[],
  optionalAttributeKeys: string[],
  skuSegments: string[],
  extra: Record<string, unknown> = {}
): IphoneSeedDictionary => ({
  id,
  dictionaryType: 'TEMPLATE',
  key: 'IPHONE_TEMPLATE',
  code,
  name,
  parentId: groupId,
  kind,
  familyId: IPHONE_FAMILY_ID,
  familyCode: 'IPHONE',
  groupId,
  groupCode: groups.find(item => item.id === groupId)?.code,
  config: {
    kind,
    familyId: IPHONE_FAMILY_ID,
    groupId,
    requiredAttributeKeys,
    optionalAttributeKeys,
    skuSegments,
    inventoryTracked: kind !== 'SERVICE',
    editable: true,
    ...extra
  }
});

/** Group headings and selectable groups.  Model names never appear here. */
const groups: IphoneSeedDictionary[] = [
  group('CAT_GROUP_IPHONE_DEVICE', 'IP-PHONE', 'Máy iPhone', 'DEVICE', undefined, { skuUsesModelFirst: true }),
  group('CAT_GROUP_IPHONE_NEW', 'IP-NEW', 'Máy mới', 'DEVICE', 'CAT_GROUP_IPHONE_DEVICE'),
  group('CAT_GROUP_IPHONE_ACTIVE', 'IP-ACTIVE', 'Máy Active', 'DEVICE', 'CAT_GROUP_IPHONE_DEVICE'),
  group('CAT_GROUP_IPHONE_USED', 'IP-USED', 'Máy cũ', 'DEVICE', 'CAT_GROUP_IPHONE_DEVICE'),
  group('CAT_GROUP_IPHONE_CPO', 'IP-CPO', 'Máy CPO / Refurbished', 'DEVICE', 'CAT_GROUP_IPHONE_DEVICE'),
  group('CAT_GROUP_IPHONE_OTHER_DEVICE', 'IP-OTHER', 'Máy khác', 'DEVICE', 'CAT_GROUP_IPHONE_DEVICE'),

  group('CAT_GROUP_IPHONE_PART', 'PART-IP', 'Linh kiện iPhone', 'PART'),
  group('CAT_GROUP_SCREEN', 'MH', 'Màn hình', 'PART', 'CAT_GROUP_IPHONE_PART'),
  group('CAT_GROUP_BATTERY', 'PIN', 'Pin', 'PART', 'CAT_GROUP_IPHONE_PART'),
  group('CAT_GROUP_CAMERA', 'CAM', 'Camera', 'PART', 'CAT_GROUP_IPHONE_PART'),
  group('CAT_GROUP_CAMERA_FRONT', 'CAM-FRONT', 'Camera trước', 'PART', 'CAT_GROUP_CAMERA'),
  group('CAT_GROUP_CAMERA_REAR', 'CAM-REAR', 'Camera sau', 'PART', 'CAT_GROUP_CAMERA'),
  group('CAT_GROUP_CAMERA_OTHER', 'CAM-OTHER', 'Camera / cảm biến khác', 'PART', 'CAT_GROUP_CAMERA'),
  group('CAT_GROUP_CHARGING', 'CHARGING', 'Cụm sạc', 'PART', 'CAT_GROUP_IPHONE_PART'),
  group('CAT_GROUP_CHARGING_PORT', 'CS', 'Chân sạc', 'PART', 'CAT_GROUP_CHARGING'),
  group('CAT_GROUP_CHARGING_FLEX', 'CHARGING-FLEX', 'Cáp chân sạc', 'PART', 'CAT_GROUP_CHARGING'),
  group('CAT_GROUP_CHARGING_IC', 'CHARGING-IC', 'IC / linh kiện sạc', 'PART', 'CAT_GROUP_CHARGING'),
  group('CAT_GROUP_SOUND', 'SOUND', 'Âm thanh', 'PART', 'CAT_GROUP_IPHONE_PART'),
  group('CAT_GROUP_EARPIECE', 'LT', 'Loa trong', 'PART', 'CAT_GROUP_SOUND'),
  group('CAT_GROUP_SPEAKER', 'LN', 'Loa ngoài', 'PART', 'CAT_GROUP_SOUND'),
  group('CAT_GROUP_MIC', 'MIC', 'Micro', 'PART', 'CAT_GROUP_SOUND'),
  group('CAT_GROUP_SOUND_FLEX', 'SOUND-FLEX', 'Cáp / cụm âm thanh', 'PART', 'CAT_GROUP_SOUND'),
  group('CAT_GROUP_FACE', 'FACE', 'Face ID / Cảm biến', 'PART', 'CAT_GROUP_IPHONE_PART'),
  group('CAT_GROUP_FACE_UNIT', 'FACE-UNIT', 'Cụm Face ID', 'PART', 'CAT_GROUP_FACE'),
  group('CAT_GROUP_DOT_PROJECTOR', 'DOT', 'Dot Projector', 'PART', 'CAT_GROUP_FACE'),
  group('CAT_GROUP_FLOOD', 'FLOOD', 'Flood Illuminator', 'PART', 'CAT_GROUP_FACE'),
  group('CAT_GROUP_PROXIMITY', 'PROX', 'Cảm biến tiệm cận', 'PART', 'CAT_GROUP_FACE'),
  group('CAT_GROUP_SENSOR_FLEX', 'SENSOR-FLEX', 'Cáp cảm biến', 'PART', 'CAT_GROUP_FACE'),
  group('CAT_GROUP_TOUCH', 'TOUCH', 'Touch ID / Home', 'PART', 'CAT_GROUP_IPHONE_PART'),
  group('CAT_GROUP_HOME', 'HOME', 'Nút Home', 'PART', 'CAT_GROUP_TOUCH'),
  group('CAT_GROUP_HOME_FLEX', 'HOME-FLEX', 'Cáp Home', 'PART', 'CAT_GROUP_TOUCH'),
  group('CAT_GROUP_POWER_BUTTON', 'POWER', 'Nguồn / Nút bấm', 'PART', 'CAT_GROUP_IPHONE_PART'),
  group('CAT_GROUP_POWER_FLEX', 'CN', 'Cáp nguồn', 'PART', 'CAT_GROUP_POWER_BUTTON'),
  group('CAT_GROUP_POWER_KEY', 'POWER-KEY', 'Nút nguồn', 'PART', 'CAT_GROUP_POWER_BUTTON'),
  group('CAT_GROUP_VOLUME_FLEX', 'VOLUME-FLEX', 'Cáp Volume', 'PART', 'CAT_GROUP_POWER_BUTTON'),
  group('CAT_GROUP_VOLUME_KEY', 'VOLUME-KEY', 'Nút Volume', 'PART', 'CAT_GROUP_POWER_BUTTON'),
  group('CAT_GROUP_ACTION_SILENT', 'ACTION', 'Action / Silent', 'PART', 'CAT_GROUP_POWER_BUTTON'),
  group('CAT_GROUP_VIBRATION', 'RUNG', 'Rung', 'PART', 'CAT_GROUP_IPHONE_PART'),
  group('CAT_GROUP_TAPTIC', 'TAPTIC', 'Taptic Engine', 'PART', 'CAT_GROUP_VIBRATION'),
  group('CAT_GROUP_VIBRATION_FLEX', 'RUNG-FLEX', 'Cáp rung', 'PART', 'CAT_GROUP_VIBRATION'),
  group('CAT_GROUP_FRAME_BODY', 'BODY', 'Khung / Vỏ', 'PART', 'CAT_GROUP_IPHONE_PART'),
  group('CAT_GROUP_FRAME', 'KH', 'Khung sườn', 'PART', 'CAT_GROUP_FRAME_BODY'),
  group('CAT_GROUP_CASE_BODY', 'VO', 'Vỏ', 'PART', 'CAT_GROUP_FRAME_BODY'),
  group('CAT_GROUP_BACK_GLASS', 'KL', 'Kính lưng', 'PART', 'CAT_GROUP_FRAME_BODY'),
  group('CAT_GROUP_CAMERA_GLASS', 'KC', 'Kính camera', 'PART', 'CAT_GROUP_FRAME_BODY'),
  group('CAT_GROUP_CAMERA_RING', 'CAM-RING', 'Viền camera', 'PART', 'CAT_GROUP_FRAME_BODY'),
  group('CAT_GROUP_OUTER_PART', 'OUTER-PART', 'Nắp / chi tiết ngoài', 'PART', 'CAT_GROUP_FRAME_BODY'),
  group('CAT_GROUP_SIM_SIGNAL', 'SIGNAL', 'SIM / Sóng', 'PART', 'CAT_GROUP_IPHONE_PART'),
  group('CAT_GROUP_SIM_TRAY', 'SIM', 'Khay SIM', 'PART', 'CAT_GROUP_SIM_SIGNAL'),
  group('CAT_GROUP_SIM_UNIT', 'SIM-UNIT', 'Cụm SIM', 'PART', 'CAT_GROUP_SIM_SIGNAL'),
  group('CAT_GROUP_ANTENNA', 'ANT', 'Anten', 'PART', 'CAT_GROUP_SIM_SIGNAL'),
  group('CAT_GROUP_ANTENNA_FLEX', 'ANT-FLEX', 'Cáp anten', 'PART', 'CAT_GROUP_SIM_SIGNAL'),
  group('CAT_GROUP_WIRELESS', 'WIRELESS', 'Sạc không dây', 'PART', 'CAT_GROUP_IPHONE_PART'),
  group('CAT_GROUP_WIRELESS_COIL', 'COIL', 'Cuộn sạc', 'PART', 'CAT_GROUP_WIRELESS'),
  group('CAT_GROUP_MAGSAFE', 'MAGSAFE', 'MagSafe', 'PART', 'CAT_GROUP_WIRELESS'),
  group('CAT_GROUP_NFC', 'NFC', 'NFC', 'PART', 'CAT_GROUP_WIRELESS'),
  group('CAT_GROUP_MAINBOARD', 'MAIN', 'Mainboard', 'PART', 'CAT_GROUP_IPHONE_PART'),
  group('CAT_GROUP_MAIN', 'MAIN-BOARD', 'Main', 'PART', 'CAT_GROUP_MAINBOARD'),
  group('CAT_GROUP_MAIN_DONOR', 'MAIN-DONOR', 'Main xác', 'PART', 'CAT_GROUP_MAINBOARD'),
  group('CAT_GROUP_IC', 'IC', 'IC / Chip', 'PART', 'CAT_GROUP_IPHONE_PART'),
  group('CAT_GROUP_IC_POWER', 'IC-POWER', 'IC nguồn', 'PART', 'CAT_GROUP_IC'),
  group('CAT_GROUP_IC_CHARGING', 'IC-CHARGING', 'IC sạc', 'PART', 'CAT_GROUP_IC'),
  group('CAT_GROUP_IC_USB', 'IC-USB', 'IC USB', 'PART', 'CAT_GROUP_IC'),
  group('CAT_GROUP_IC_AUDIO', 'IC-AUDIO', 'IC Audio', 'PART', 'CAT_GROUP_IC'),
  group('CAT_GROUP_IC_WIFI', 'IC-WIFI', 'IC Wi-Fi', 'PART', 'CAT_GROUP_IC'),
  group('CAT_GROUP_IC_SIGNAL', 'IC-SIGNAL', 'IC sóng', 'PART', 'CAT_GROUP_IC'),
  group('CAT_GROUP_IC_TOUCH', 'IC-TOUCH', 'IC cảm ứng', 'PART', 'CAT_GROUP_IC'),
  group('CAT_GROUP_IC_OTHER', 'IC-OTHER', 'IC khác', 'PART', 'CAT_GROUP_IC'),
  group('CAT_GROUP_SOCKET', 'SOCKET', 'Socket / Connector', 'PART', 'CAT_GROUP_IPHONE_PART'),
  group('CAT_GROUP_SCREW', 'SCREW', 'Ốc / Pát / Ron', 'PART', 'CAT_GROUP_IPHONE_PART'),
  group('CAT_GROUP_OTHER_PART', 'PART-OTHER', 'Linh kiện khác', 'PART', 'CAT_GROUP_IPHONE_PART'),

  group('CAT_GROUP_IPHONE_ACCESSORY', 'ACC-IP', 'Phụ kiện iPhone', 'ACCESSORY'),
  group('CAT_GROUP_CASE', 'OP', 'Ốp lưng', 'ACCESSORY', 'CAT_GROUP_IPHONE_ACCESSORY'),
  group('CAT_GROUP_SCREEN_PROTECTOR', 'CL', 'Cường lực màn hình', 'ACCESSORY', 'CAT_GROUP_IPHONE_ACCESSORY'),
  group('CAT_GROUP_CAMERA_PROTECTOR', 'CL-CAM', 'Cường lực camera', 'ACCESSORY', 'CAT_GROUP_IPHONE_ACCESSORY'),
  group('CAT_GROUP_CABLE', 'CAP', 'Cáp sạc', 'ACCESSORY', 'CAT_GROUP_IPHONE_ACCESSORY'),
  group('CAT_GROUP_CHARGER', 'SAC', 'Củ sạc', 'ACCESSORY', 'CAT_GROUP_IPHONE_ACCESSORY'),
  group('CAT_GROUP_CHARGER_SET', 'SAC-SET', 'Bộ sạc', 'ACCESSORY', 'CAT_GROUP_IPHONE_ACCESSORY'),
  group('CAT_GROUP_MAGSAFE_CHARGER', 'SAC-MAG', 'Sạc MagSafe', 'ACCESSORY', 'CAT_GROUP_IPHONE_ACCESSORY'),
  group('CAT_GROUP_WIRELESS_CHARGER', 'SAC-WL', 'Sạc không dây', 'ACCESSORY', 'CAT_GROUP_IPHONE_ACCESSORY'),
  group('CAT_GROUP_EARPHONE', 'TN', 'Tai nghe', 'ACCESSORY', 'CAT_GROUP_IPHONE_ACCESSORY'),
  group('CAT_GROUP_POWER_BANK', 'PB', 'Pin dự phòng', 'ACCESSORY', 'CAT_GROUP_IPHONE_ACCESSORY'),
  group('CAT_GROUP_STAND', 'STAND', 'Giá đỡ', 'ACCESSORY', 'CAT_GROUP_IPHONE_ACCESSORY'),
  group('CAT_GROUP_WATCH_STRAP', 'STRAP', 'Dây đeo', 'ACCESSORY', 'CAT_GROUP_IPHONE_ACCESSORY'),
  group('CAT_GROUP_ADAPTER', 'ADAPTER', 'Adapter', 'ACCESSORY', 'CAT_GROUP_IPHONE_ACCESSORY'),
  group('CAT_GROUP_HUB', 'HUB', 'Hub / chuyển đổi', 'ACCESSORY', 'CAT_GROUP_IPHONE_ACCESSORY'),
  group('CAT_GROUP_OTHER_ACCESSORY', 'ACC-OTHER', 'Phụ kiện khác', 'ACCESSORY', 'CAT_GROUP_IPHONE_ACCESSORY'),

  group('CAT_GROUP_IPHONE_SERVICE', 'SV-IP', 'Dịch vụ iPhone', 'SERVICE', undefined, { inventoryTracked: false }),
  group('CAT_SERVICE_CHECK', 'SV-CHECK', 'Kiểm tra / chẩn đoán', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_SCREEN', 'SV-SCREEN', 'Thay màn hình', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_GLASS', 'SV-GLASS', 'Ép kính', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_BATTERY', 'SV-BATTERY', 'Thay pin', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_FIX_BATTERY', 'SV-FIX-BATTERY', 'Fix pin', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_CAMERA', 'SV-CAMERA', 'Thay camera', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_CHARGING', 'SV-CHARGING', 'Thay chân sạc', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_SPEAKER', 'SV-SPEAKER', 'Thay loa', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_MIC', 'SV-MIC', 'Thay mic', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_FACE', 'SV-FACE', 'Sửa Face ID', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_TOUCH', 'SV-TOUCH', 'Sửa Touch ID', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_BACK_GLASS', 'SV-BACK-GLASS', 'Thay kính lưng', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_BODY', 'SV-BODY', 'Thay vỏ', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_FRAME', 'SV-FRAME', 'Thay khung', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_POWER', 'SV-POWER', 'Sửa nguồn', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_CHARGE', 'SV-CHARGE', 'Sửa sạc', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_SIGNAL', 'SV-SIGNAL', 'Sửa sóng', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_WIFI', 'SV-WIFI', 'Sửa Wi-Fi', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_MAIN', 'SV-MAIN', 'Sửa Main', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_IC', 'SV-IC', 'Thay IC', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_CLEAN', 'SV-CLEAN', 'Vệ sinh', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_WATER', 'SV-WATER', 'Xử lý vào nước', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_DATA', 'SV-DATA', 'Phục hồi dữ liệu', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE'),
  group('CAT_SERVICE_OTHER', 'SV-OTHER', 'Dịch vụ khác', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE')
];

const attributeDefinitions: IphoneSeedDictionary[] = [
  attribute('ATTR_DEF_MODEL', 'MODEL', 'MODEL', 'Model', 'MODEL'),
  attribute('ATTR_DEF_COMPATIBLE_MODEL', 'COMPATIBLE_MODEL', 'COMPATIBLE-MODEL', 'Model tương thích', 'MULTI_MODEL', { multiple: true }),
  attribute('ATTR_DEF_STORAGE', 'STORAGE', 'STORAGE', 'Dung lượng', 'SELECT'),
  attribute('ATTR_DEF_RAM', 'RAM', 'RAM', 'RAM', 'SELECT'),
  attribute('ATTR_DEF_COLOR', 'COLOR', 'COLOR', 'Màu', 'COLOR'),
  attribute('ATTR_DEF_CONDITION', 'CONDITION', 'CONDITION', 'Tình trạng', 'SELECT'),
  attribute('ATTR_DEF_COSMETIC', 'COSMETIC', 'COSMETIC', 'Ngoại hình', 'SELECT'),
  attribute('ATTR_DEF_BATTERY_PERCENT', 'BATTERY_PERCENT', 'BATTERY-PERCENT', 'Pin %', 'NUMBER'),
  attribute('ATTR_DEF_PART_BRAND', 'PART_BRAND', 'PART-BRAND', 'Hãng linh kiện', 'SELECT'),
  attribute('ATTR_DEF_PART_SOURCE', 'PART_SOURCE', 'PART-SOURCE', 'Nguồn linh kiện', 'SELECT'),
  attribute('ATTR_DEF_GRADE', 'GRADE', 'GRADE', 'Phân hạng', 'SELECT'),
  attribute('ATTR_DEF_SCREEN_TECH', 'SCREEN_TECH', 'SCREEN-TECH', 'Công nghệ màn', 'SELECT'),
  attribute('ATTR_DEF_BATTERY_TYPE', 'BATTERY_TYPE', 'BATTERY-TYPE', 'Loại pin', 'SELECT'),
  attribute('ATTR_DEF_BATTERY_CAPACITY', 'BATTERY_CAPACITY', 'BATTERY-CAPACITY', 'Dung lượng pin', 'NUMBER'),
  attribute('ATTR_DEF_POSITION', 'POSITION', 'POSITION', 'Vị trí', 'SELECT'),
  attribute('ATTR_DEF_MAGSAFE', 'MAGSAFE', 'MAGSAFE', 'MagSafe', 'BOOLEAN'),
  attribute('ATTR_DEF_POWER', 'POWER', 'POWER', 'Công suất', 'NUMBER'),
  attribute('ATTR_DEF_CONNECTOR', 'CONNECTOR', 'CONNECTOR', 'Đầu kết nối', 'SELECT'),
  attribute('ATTR_DEF_LENGTH', 'LENGTH', 'LENGTH', 'Chiều dài', 'SELECT'),
  attribute('ATTR_DEF_WARRANTY', 'WARRANTY', 'WARRANTY', 'Bảo hành', 'SELECT'),
  attribute('ATTR_DEF_IMEI', 'IMEI', 'IMEI', 'IMEI', 'IMEI', { inventoryOnly: true }),
  attribute('ATTR_DEF_SERIAL', 'SERIAL', 'SERIAL', 'Serial', 'SERIAL', { inventoryOnly: true })
];

const attributeValues: IphoneSeedDictionary[] = [
  ...[['64', '64GB'], ['128', '128GB'], ['256', '256GB'], ['512', '512GB'], ['1TB', '1TB']].map(([code, name]) => attributeValue(`ATTR_STORAGE_${code}`, 'STORAGE', code, name, 'ATTR_DEF_STORAGE')),
  ...[['BLK', 'Đen'], ['WHT', 'Trắng'], ['NAT', 'Titan tự nhiên'], ['BLU', 'Xanh'], ['PNK', 'Hồng'], ['GLD', 'Vàng'], ['PUR', 'Tím'], ['RED', 'Đỏ']].map(([code, name]) => attributeValue(`ATTR_COLOR_${code}`, 'COLOR', code, name, 'ATTR_DEF_COLOR')),
  ...[['NEW', 'Mới'], ['ACTIVE', 'Đã Active'], ['USED', 'Máy cũ'], ['CPO', 'CPO / Refurbished']].map(([code, name]) => attributeValue(`ATTR_CONDITION_${code}`, 'CONDITION', code, name, 'ATTR_DEF_CONDITION')),
  ...[['GX', 'GX'], ['JK', 'JK'], ['ZY', 'ZY'], ['ZIN', 'Apple / Zin'], ['PIS', 'Pisen'], ['ANK', 'Anker'], ['OTHER', 'Khác']].map(([code, name]) => attributeValue(`ATTR_PART_BRAND_${code}`, 'PART_BRAND', code, name, 'ATTR_DEF_PART_BRAND')),
  ...[['LCD', 'LCD'], ['INCELL', 'Incell'], ['HOLED', 'Hard OLED'], ['SOLED', 'Soft OLED'], ['OLED', 'OLED khác']].map(([code, name]) => attributeValue(`ATTR_SCREEN_TECH_${code}`, 'SCREEN_TECH', code, name, 'ATTR_DEF_SCREEN_TECH')),
  ...[['ZIN-BOC', 'Zin bóc'], ['ZIN-EP-KINH', 'Zin ép kính'], ['PREMIUM', 'Premium'], ['STANDARD', 'Standard'], ['ECONOMY', 'Economy']].map(([code, name]) => attributeValue(`ATTR_GRADE_${code}`, 'GRADE', code, name, 'ATTR_DEF_GRADE')),
  ...[['ZIN', 'Zin bóc'], ['STANDARD', 'Tiêu chuẩn'], ['HC', 'Dung lượng cao'], ['OTHER', 'Khác']].map(([code, name]) => attributeValue(`ATTR_BATTERY_TYPE_${code}`, 'BATTERY_TYPE', code, name, 'ATTR_DEF_BATTERY_TYPE')),
  ...[['FRONT', 'Trước'], ['REAR', 'Sau'], ['OTHER', 'Khác']].map(([code, name]) => attributeValue(`ATTR_POSITION_${code}`, 'POSITION', code, name, 'ATTR_DEF_POSITION')),
  ...[['USB-A', 'USB-A'], ['USB-C', 'USB-C'], ['LIGHTNING', 'Lightning'], ['MICRO-USB', 'Micro USB']].map(([code, name]) => attributeValue(`ATTR_CONNECTOR_${code}`, 'CONNECTOR', code, name, 'ATTR_DEF_CONNECTOR')),
  ...[['05M', '0.5m'], ['1M', '1m'], ['15M', '1.5m'], ['2M', '2m']].map(([code, name]) => attributeValue(`ATTR_LENGTH_${code}`, 'LENGTH', code, name, 'ATTR_DEF_LENGTH')),
  ...[['0M', 'Không bảo hành'], ['1M', '1 tháng'], ['3M', '3 tháng'], ['6M', '6 tháng'], ['12M', '12 tháng']].map(([code, name]) => attributeValue(`ATTR_WARRANTY_${code}`, 'WARRANTY', code, name, 'ATTR_DEF_WARRANTY')),
  attributeValue('ATTR_UNIT_PIECE', 'UNIT', 'C', 'Cái', 'ATTR_DEF_UNIT'),
  attributeValue('ATTR_UNIT_SET', 'UNIT', 'BO', 'Bộ', 'ATTR_DEF_UNIT'),
  attributeValue('ATTR_UNIT_COMPONENT', 'UNIT', 'CUM', 'Cụm', 'ATTR_DEF_UNIT')
];

// Unit is a normal attribute definition but needs to be available for the current SKU engine.
attributeDefinitions.push(attribute('ATTR_DEF_UNIT', 'UNIT', 'UNIT', 'Đơn vị tính', 'SELECT'));

const templates: IphoneSeedDictionary[] = [
  template('TPL_IPHONE_DEVICE', 'TPL-IP-DEVICE', 'Máy iPhone', 'DEVICE', 'CAT_GROUP_IPHONE_DEVICE', ['MODEL', 'STORAGE', 'COLOR'], ['CONDITION', 'BATTERY_PERCENT', 'COSMETIC', 'WARRANTY', 'IMEI', 'SERIAL'], ['MODEL', 'STORAGE', 'COLOR'], { skuUsesModelFirst: true }),
  template('TPL_IPHONE_SCREEN', 'TPL-MH', 'Màn hình', 'PART', 'CAT_GROUP_SCREEN', ['COMPATIBLE_MODEL', 'PART_BRAND', 'SCREEN_TECH'], ['GRADE', 'COLOR', 'WARRANTY'], ['MODEL', 'PART_BRAND', 'SCREEN_TECH']),
  template('TPL_IPHONE_BATTERY', 'TPL-PIN', 'Pin', 'PART', 'CAT_GROUP_BATTERY', ['COMPATIBLE_MODEL', 'PART_BRAND', 'BATTERY_TYPE'], ['BATTERY_CAPACITY', 'WARRANTY'], ['MODEL', 'PART_BRAND', 'BATTERY_TYPE']),
  template('TPL_IPHONE_CAMERA', 'TPL-CAM', 'Camera', 'PART', 'CAT_GROUP_CAMERA', ['COMPATIBLE_MODEL', 'POSITION'], ['PART_SOURCE', 'GRADE'], ['MODEL', 'POSITION', 'PART_SOURCE']),
  template('TPL_IPHONE_CHARGING', 'TPL-CS', 'Chân sạc', 'PART', 'CAT_GROUP_CHARGING_PORT', ['COMPATIBLE_MODEL', 'PART_SOURCE'], ['COLOR', 'GRADE'], ['MODEL', 'PART_SOURCE', 'COLOR']),
  template('TPL_IPHONE_SOUND', 'TPL-SOUND', 'Loa / Micro', 'PART', 'CAT_GROUP_SOUND', ['COMPATIBLE_MODEL'], ['PART_SOURCE', 'GRADE'], ['MODEL', 'PART_SOURCE']),
  template('TPL_IPHONE_BODY', 'TPL-BODY', 'Khung / Vỏ', 'PART', 'CAT_GROUP_FRAME_BODY', ['COMPATIBLE_MODEL', 'COLOR'], ['PART_SOURCE', 'GRADE'], ['MODEL', 'COLOR', 'PART_SOURCE']),
  template('TPL_IPHONE_MAIN_IC', 'TPL-MAIN-IC', 'Main / IC', 'PART', 'CAT_GROUP_MAINBOARD', ['COMPATIBLE_MODEL'], ['STORAGE', 'CONDITION', 'PART_SOURCE', 'SERIAL'], ['MODEL', 'PART_SOURCE']),
  template('TPL_IPHONE_CASE', 'TPL-OP', 'Ốp lưng', 'ACCESSORY', 'CAT_GROUP_CASE', ['COMPATIBLE_MODEL', 'COLOR'], ['PART_BRAND', 'MAGSAFE'], ['MODEL', 'COLOR', 'MAGSAFE'], { compatibleModelMultiple: true }),
  template('TPL_IPHONE_PROTECTOR', 'TPL-CL', 'Cường lực', 'ACCESSORY', 'CAT_GROUP_SCREEN_PROTECTOR', ['COMPATIBLE_MODEL'], ['PART_BRAND', 'GRADE'], ['MODEL', 'GRADE']),
  template('TPL_IPHONE_CABLE', 'TPL-CAP', 'Cáp sạc', 'ACCESSORY', 'CAT_GROUP_CABLE', ['CONNECTOR', 'POWER', 'LENGTH'], ['PART_BRAND', 'COLOR'], ['CONNECTOR', 'POWER', 'LENGTH']),
  template('TPL_IPHONE_CHARGER', 'TPL-SAC', 'Củ sạc', 'ACCESSORY', 'CAT_GROUP_CHARGER', ['PART_BRAND', 'POWER', 'CONNECTOR'], ['COLOR'], ['PART_BRAND', 'POWER', 'CONNECTOR']),
  template('TPL_IPHONE_EARPHONE', 'TPL-TN', 'Tai nghe', 'ACCESSORY', 'CAT_GROUP_EARPHONE', ['PART_BRAND'], ['COLOR', 'WARRANTY'], ['PART_BRAND']),
  template('TPL_IPHONE_SERVICE', 'TPL-SV', 'Dịch vụ iPhone', 'SERVICE', 'CAT_GROUP_IPHONE_SERVICE', ['MODEL'], ['WARRANTY'], ['MODEL'], { inventoryTracked: false, createsCatalogItem: false })
];

const modelRows: Array<[string, string, number, string[]]> = [
  ['IP8P', 'iPhone 8 Plus', 2017, ['8P', '8 Plus']],
  ['IPX', 'iPhone X', 2017, ['X']],
  ['IPXR', 'iPhone XR', 2018, ['XR']],
  ['IPXS', 'iPhone XS', 2018, ['XS']],
  ['IPXSM', 'iPhone XS Max', 2018, ['XSM', 'XS Max']],
  ['IP11', 'iPhone 11', 2019, ['11']],
  ['IP11P', 'iPhone 11 Pro', 2019, ['11P', '11 Pro']],
  ['IP11PM', 'iPhone 11 Pro Max', 2019, ['11PM', '11PRM', '11 PRM', '11 Pro Max', '11 ProMax']],
  ['IPSE2', 'iPhone SE 2', 2020, ['SE2', 'SE 2']],
  ['IP12M', 'iPhone 12 mini', 2020, ['12M', '12 mini']],
  ['IP12', 'iPhone 12', 2020, ['12']],
  ['IP12P', 'iPhone 12 Pro', 2020, ['12P', '12 Pro']],
  ['IP12PM', 'iPhone 12 Pro Max', 2020, ['12PM', '12PRM', '12 PRM', '12 Pro Max', '12 ProMax']],
  ['IP13M', 'iPhone 13 mini', 2021, ['13M', '13 mini']],
  ['IP13', 'iPhone 13', 2021, ['13']],
  ['IP13P', 'iPhone 13 Pro', 2021, ['13P', '13 Pro']],
  ['IP13PM', 'iPhone 13 Pro Max', 2021, ['13PM', '13PRM', '13 PRM', '13 Pro Max', '13 ProMax']],
  ['IPSE3', 'iPhone SE 3', 2022, ['SE3', 'SE 3']],
  ['IP14', 'iPhone 14', 2022, ['14']],
  ['IP14PL', 'iPhone 14 Plus', 2022, ['14PL', '14 Plus']],
  ['IP14P', 'iPhone 14 Pro', 2022, ['14P', '14 Pro']],
  ['IP14PM', 'iPhone 14 Pro Max', 2022, ['14PM', '14PRM', '14 PRM', '14 Pro Max', '14 ProMax']],
  ['IP15', 'iPhone 15', 2023, ['15']],
  ['IP15PL', 'iPhone 15 Plus', 2023, ['15PL', '15 Plus']],
  ['IP15P', 'iPhone 15 Pro', 2023, ['15P', '15 Pro']],
  ['IP15PM', 'iPhone 15 Pro Max', 2023, ['15PM', '15PRM', '15 PRM', '15 Pro Max', '15 ProMax']],
  ['IP16', 'iPhone 16', 2024, ['16']],
  ['IP16PL', 'iPhone 16 Plus', 2024, ['16PL', '16 Plus']],
  ['IP16P', 'iPhone 16 Pro', 2024, ['16P', '16 Pro']],
  ['IP16PM', 'iPhone 16 Pro Max', 2024, ['16PM', '16PRM', '16 PRM', '16 Pro Max', '16 ProMax']],
  ['IP16E', 'iPhone 16e', 2025, ['16E', '16 e']],
  ['IP17', 'iPhone 17', 2025, ['17']],
  ['IP17A', 'iPhone 17 Air', 2025, ['17A', '17 Air']],
  ['IP17P', 'iPhone 17 Pro', 2025, ['17P', '17 Pro']],
  ['IP17PM', 'iPhone 17 Pro Max', 2025, ['17PM', '17PRM', '17 PRM', '17 Pro Max', '17 ProMax']]
];

const brands: IphoneSeedDictionary[] = [
  { id: 'CAT_BRAND_APP', dictionaryType: 'BRAND', key: 'APPLE', code: 'APP', name: 'Apple', aliases: ['Apple', 'iPhone'], config: { editable: true } },
  { id: 'CAT_BRAND_GX', dictionaryType: 'BRAND', key: 'GX', code: 'GX', name: 'GX', config: { partBrand: true, editable: true } },
  { id: 'CAT_BRAND_JK', dictionaryType: 'BRAND', key: 'JK', code: 'JK', name: 'JK', config: { partBrand: true, editable: true } },
  { id: 'CAT_BRAND_ZY', dictionaryType: 'BRAND', key: 'ZY', code: 'ZY', name: 'ZY', config: { partBrand: true, editable: true } },
  { id: 'CAT_BRAND_ZIN', dictionaryType: 'BRAND', key: 'ZIN', code: 'ZIN', name: 'Apple / Zin', config: { partBrand: true, editable: true } },
  { id: 'CAT_BRAND_PIS', dictionaryType: 'BRAND', key: 'PISEN', code: 'PIS', name: 'Pisen', config: { partBrand: true, editable: true } },
  { id: 'CAT_BRAND_ANK', dictionaryType: 'BRAND', key: 'ANKER', code: 'ANK', name: 'Anker', config: { partBrand: true, editable: true } }
];

export function getIphoneCatalogSeed() {
  return {
    version: IPHONE_SEED_VERSION,
    dictionaries: [
      ...brands,
      { id: IPHONE_FAMILY_ID, dictionaryType: 'FAMILY' as const, key: 'PRODUCT_FAMILY', code: 'IPHONE', name: 'iPhone', aliases: ['iPhone', 'Apple iPhone'], config: familyConfig },
      ...groups,
      ...attributeDefinitions,
      ...attributeValues,
      ...templates
    ],
    models: modelRows.map(([modelCode, modelName, releaseYear, aliases]) => ({
      id: `MODEL_APP_${modelCode}`,
      brandCode: 'APP' as const,
      brandName: 'Apple' as const,
      seriesCode: 'IPHONE' as const,
      seriesName: 'iPhone' as const,
      modelCode,
      modelName,
      releaseYear,
      aliases: [modelCode, modelName, ...aliases]
    })) as IphoneSeedModel[]
  };
}
