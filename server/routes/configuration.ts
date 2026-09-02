import { Router, Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import {
  normalizeOperationalPolicyVersions,
  operationalPolicyPeriodsOverlap,
  selectEffectiveOperationalPolicy,
  OperationalPolicyKind
} from '../services/operationalPolicyService';
import { MIN_DEVICE_RETAIL_PRICE_VND } from '../../shared/retailPricing';

function requiredBranchId(value: unknown): string {
  const branchId = String(value || '').trim();
  if (!branchId || branchId === 'ALL') throw new Error('WAREHOUSE_BRANCH_REQUIRED');
  return branchId;
}

function optionalText(value: unknown, maxLength = 500): string {
  return String(value || '').trim().slice(0, maxLength);
}

export function validateBranchDraft(input: any) {
  const id = optionalText(input?.id, 80);
  const code = optionalText(input?.code, 30).toUpperCase();
  const name = optionalText(input?.name, 160);
  const address = optionalText(input?.address, 500);
  const phone = optionalText(input?.phone, 30);
  const attendanceRadius = Number(input?.attendanceRadius ?? input?.allowedGpsRadiusMeters ?? 50);
  const gpsLatitude = input?.gpsLatitude === '' || input?.gpsLatitude == null ? null : Number(input.gpsLatitude);
  const gpsLongitude = input?.gpsLongitude === '' || input?.gpsLongitude == null ? null : Number(input.gpsLongitude);
  if (!id || !/^[A-Z0-9_-]{2,30}$/.test(code) || !name || !address || !phone) throw new Error('BRANCH_REQUIRED_FIELDS');
  if (!Number.isFinite(attendanceRadius) || attendanceRadius < 10 || attendanceRadius > 5000) throw new Error('BRANCH_ATTENDANCE_RADIUS_INVALID');
  if (gpsLatitude !== null && (!Number.isFinite(gpsLatitude) || gpsLatitude < -90 || gpsLatitude > 90)) throw new Error('BRANCH_LATITUDE_INVALID');
  if (gpsLongitude !== null && (!Number.isFinite(gpsLongitude) || gpsLongitude < -180 || gpsLongitude > 180)) throw new Error('BRANCH_LONGITUDE_INVALID');
  const allowedPublicIps = Array.isArray(input?.allowedPublicIps)
    ? [...new Set(input.allowedPublicIps.map((value: unknown) => optionalText(value, 80)).filter(Boolean))]
    : optionalText(input?.storePublicIp, 500).split(/[,;\s]+/).filter(Boolean);
  return {
    id, code, name, address, phone,
    email: optionalText(input?.email, 160),
    manager: optionalText(input?.manager, 160),
    openingHours: optionalText(input?.openingHours, 100),
    warehouseId: optionalText(input?.warehouseId, 80),
    systemType: optionalText(input?.systemType, 30),
    taxCode: optionalText(input?.taxCode, 50),
    notes: optionalText(input?.notes, 1000),
    allowedWifiSSID: optionalText(input?.allowedWifiSSID, 160),
    allowedPublicIps,
    attendanceRadius,
    ...(gpsLatitude === null ? {} : { gpsLatitude }),
    ...(gpsLongitude === null ? {} : { gpsLongitude }),
    isActive: input?.isActive !== false,
    isHeadquarter: input?.isHeadquarter === true
  };
}

export function validateStoreSettingsDraft(input: any) {
  const companyName = optionalText(input?.companyName, 200);
  const hotline = optionalText(input?.hotline, 30);
  const headquarterAddress = optionalText(input?.headquarterAddress, 500);
  if (!companyName || !hotline || !headquarterAddress) throw new Error('STORE_SETTINGS_REQUIRED_FIELDS');
  const defaultWarrantyMonths = Number(input?.defaultWarrantyMonths ?? 0);
  if (!Number.isFinite(defaultWarrantyMonths) || defaultWarrantyMonths < 0 || defaultWarrantyMonths > 120) throw new Error('DEFAULT_WARRANTY_INVALID');
  return {
    companyName,
    brandName: optionalText(input?.brandName, 160),
    hotline,
    supportEmail: optionalText(input?.supportEmail, 160),
    website: optionalText(input?.website, 300),
    taxCode: optionalText(input?.taxCode, 50),
    headquarterAddress,
    slogan: optionalText(input?.slogan, 300),
    logoUrl: optionalText(input?.logoUrl, 1000),
    printHeaderNote: optionalText(input?.printHeaderNote, 1000),
    printFooterNote: optionalText(input?.printFooterNote, 1000),
    defaultWarrantyMonths,
    warrantyPackages: Array.isArray(input?.warrantyPackages) ? input.warrantyPackages.slice(0, 50).map((item: any) => ({
      name: optionalText(item?.name, 160),
      price: Math.max(0, Number(item?.price || 0))
    })).filter((item: any) => item.name && Number.isFinite(item.price)) : []
  };
}

const SOP_ROLES = new Set(['ALL', 'SALES', 'SALE_ONLINE', 'TECHNICIAN', 'CASHIER', 'WAREHOUSE', 'MANAGER']);
const SOP_CATEGORIES = new Set(['OPENING', 'MID_SHIFT', 'CLOSING']);
const SOP_PRIORITIES = new Set(['HIGH', 'MEDIUM', 'NORMAL']);

export function validateSopTemplateDraft(input: any) {
  const code = optionalText(input?.code, 50).toUpperCase().replace(/[^A-Z0-9_-]/g, '-');
  const title = optionalText(input?.title, 200);
  const targetRole = optionalText(input?.targetRole, 30).toUpperCase();
  const category = optionalText(input?.category, 30).toUpperCase();
  const priority = optionalText(input?.priority || 'NORMAL', 20).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,49}$/.test(code) || !title) throw new Error('SOP_REQUIRED_FIELDS');
  if (!SOP_ROLES.has(targetRole) || !SOP_CATEGORIES.has(category) || !SOP_PRIORITIES.has(priority)) throw new Error('SOP_CLASSIFICATION_INVALID');
  const roleNames: Record<string, string> = {
    ALL: 'Toàn bộ nhân sự', SALES: 'Nhân viên bán hàng Showroom', SALE_ONLINE: 'Sale Online & Chăm sóc CRM',
    TECHNICIAN: 'Kỹ thuật viên & KCS', CASHIER: 'Thu ngân Showroom', WAREHOUSE: 'Thủ kho & Kiểm kê', MANAGER: 'Cửa hàng trưởng'
  };
  const categoryNames: Record<string, string> = { OPENING: 'Đầu ca trực', MID_SHIFT: 'Trong ca làm', CLOSING: 'Cuối ca trực & Bàn giao' };
  const penaltyPoints = Number(input?.penaltyPoints || 0);
  const bonusPoints = Number(input?.bonusPoints || 0);
  const orderIndex = Number(input?.orderIndex || 0);
  if (![penaltyPoints, bonusPoints, orderIndex].every(Number.isFinite) || penaltyPoints < 0 || bonusPoints < 0 || orderIndex < 0) throw new Error('SOP_NUMERIC_VALUE_INVALID');
  return {
    code, title, targetRole, targetRoleName: roleNames[targetRole], category, categoryName: categoryNames[category], priority,
    timeHint: optionalText(input?.timeHint, 100),
    description: optionalText(input?.description, 2000),
    guidelines: Array.isArray(input?.guidelines) ? input.guidelines.map((item: unknown) => optionalText(item, 500)).filter(Boolean).slice(0, 30) : [],
    requiresPhotoProof: input?.requiresPhotoProof === true,
    requiresNote: input?.requiresNote === true,
    penaltyPoints, bonusPoints, orderIndex,
    isActive: input?.isActive !== false,
    version: optionalText(input?.version || '1.0', 30)
  };
}

export function validateRepairServiceDraft(input: any) {
  const category = optionalText(input?.category, 80).toUpperCase();
  const categoryName = optionalText(input?.categoryName, 160);
  const name = optionalText(input?.name, 240);
  const compatibleModels = optionalText(input?.compatibleModels, 1000);
  if (!category || !categoryName || !name) throw new Error('REPAIR_SERVICE_REQUIRED_FIELDS');
  const numeric = (value: unknown, field: string, max: number) => {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) throw new Error(`${field}_INVALID`);
    return Math.round(parsed);
  };
  const costPrice = numeric(input?.costPrice, 'REPAIR_SERVICE_COST', 10_000_000_000);
  const sellPrice = numeric(input?.sellPrice, 'REPAIR_SERVICE_PRICE', 10_000_000_000);
  if (sellPrice < costPrice) throw new Error('REPAIR_SERVICE_PRICE_BELOW_COST');
  return {
    category, categoryName, name, compatibleModels, costPrice, sellPrice,
    techCommission: numeric(input?.techCommission, 'REPAIR_SERVICE_COMMISSION', 1_000_000_000),
    warrantyPeriodMonths: numeric(input?.warrantyPeriodMonths, 'REPAIR_SERVICE_WARRANTY', 120),
    durationMinutes: numeric(input?.durationMinutes, 'REPAIR_SERVICE_DURATION', 525_600),
    notes: optionalText(input?.notes, 2000),
    isActive: input?.isActive !== false
  };
}

export function validateWarehouseDraft(input: any) {
  const id = String(input?.id || '').trim();
  const branchId = requiredBranchId(input?.branchId);
  const code = String(input?.code || '').trim().toUpperCase();
  const name = String(input?.name || '').trim();
  const shortName = String(input?.shortName || name).trim();
  const type = String(input?.type || 'RETAIL_STORE').trim().toUpperCase();
  const isMain = type === 'CENTRAL';
  const parentWarehouseId = String(input?.parentWarehouseId || '').trim();
  const custodianUid = String(input?.custodianUid || input?.technicianId || '').trim();
  const isChild = Boolean(parentWarehouseId) || type === 'TECHNICIAN_SUB';

  if (!id || !code || !name || !shortName) throw new Error('WAREHOUSE_REQUIRED_FIELDS');
  if (isMain && parentWarehouseId) throw new Error('MAIN_WAREHOUSE_CANNOT_HAVE_PARENT');
  if (isChild && !parentWarehouseId) throw new Error('CHILD_WAREHOUSE_PARENT_REQUIRED');
  if (isChild && !custodianUid) throw new Error('CHILD_WAREHOUSE_CUSTODIAN_REQUIRED');
  if (parentWarehouseId === id) throw new Error('WAREHOUSE_PARENT_SELF_REFERENCE');

  return {
    id,
    branchId,
    code,
    name,
    shortName,
    type,
    isMain,
    parentWarehouseId: isChild ? parentWarehouseId : '',
    custodianUid: isChild ? custodianUid : '',
    isChild
  };
}

export function warehouseHasBlockingDevices(devices: any[]): boolean {
  return devices.some(item => String(item?.status || '').toLowerCase() !== 'sold');
}

export function isWarehouseRecordActive(item: any): boolean {
  return item?.isActive !== false && item?.active !== false && item?.isArchived !== true;
}

export function calculateBranchWarehouseCoverage(branchIds: string[], warehouses: any[]) {
  const activeWarehouseBranches = new Set(
    warehouses.filter(item => isWarehouseRecordActive(item) && branchIds.includes(String(item?.branchId || ''))).map(item => String(item.branchId))
  );
  return {
    coveredBranches: activeWarehouseBranches.size,
    totalBranches: branchIds.length,
    complete: branchIds.length > 0 && branchIds.every(branchId => activeWarehouseBranches.has(branchId))
  };
}

const OPERATIONAL_CONFIG_KEYS = new Set(['sales', 'customerCare', 'retailPricing']);

export type FinanceCategoryType = 'RECEIPT' | 'PAYMENT';

function normalizeFinanceCategoryList(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawValue of source) {
    const name = optionalText(rawValue, 100).replace(/\s+/g, ' ');
    const normalized = name.toLocaleLowerCase('vi-VN');
    if (!name || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(name);
    if (result.length >= 100) break;
  }
  return result;
}

export function validateFinanceCategoryDraft(input: any): { type: FinanceCategoryType; name: string } {
  const type = optionalText(input?.type, 20).toUpperCase() as FinanceCategoryType;
  const name = optionalText(input?.name, 100).replace(/\s+/g, ' ');
  if (!['RECEIPT', 'PAYMENT'].includes(type)) throw new Error('FINANCE_CATEGORY_TYPE_INVALID');
  if (name.length < 2) throw new Error('FINANCE_CATEGORY_NAME_REQUIRED');
  return { type, name };
}

function normalizeFinanceCategories(data: any) {
  return {
    receiptCategories: normalizeFinanceCategoryList(data?.receiptCategories),
    paymentCategories: normalizeFinanceCategoryList(data?.paymentCategories)
  };
}

export function validateOperationalConfig(configKey: string, input: any) {
  if (!OPERATIONAL_CONFIG_KEYS.has(configKey)) throw new Error('CONFIG_KEY_INVALID');
  const name = String(input?.name || '').trim();
  const version = String(input?.version || '').trim();
  const policyId = String(input?.policyId || '').trim().toUpperCase();
  const effectiveFrom = String(input?.effectiveFrom || '').trim();
  const effectiveTo = String(input?.effectiveTo || '').trim();
  const isActive = input?.isActive === true;
  if (!/^[A-Z0-9_]{2,60}$/.test(policyId)) throw new Error('POLICY_ID_INVALID');
  if (isActive && (!name || !version)) throw new Error('CONFIG_NAME_VERSION_REQUIRED');
  if (isActive && (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || (effectiveTo && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo)) || (effectiveTo && effectiveTo < effectiveFrom))) {
    throw new Error('POLICY_EFFECTIVE_PERIOD_INVALID');
  }
  const policyIdentity = { policyId, name, version, effectiveFrom, effectiveTo, isActive };

  if (configKey === 'sales') {
    const draftTags = Array.isArray(input?.commissionTags) ? input.commissionTags.map((tag: any) => ({
      id: String(tag?.id || '').trim().toUpperCase(),
      name: String(tag?.name || '').trim(),
      appliesTo: String(tag?.appliesTo || 'DEVICE').trim().toUpperCase(),
      calculationType: String(tag?.calculationType || 'FLAT').trim().toUpperCase(),
      value: typeof tag?.value === 'number' && Number.isFinite(tag.value) ? Number(tag.value) : null,
      description: String(tag?.description || '').trim(),
      isActive: tag?.isActive === true
    })) : [];
    if (!isActive) {
      const optionalNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Number(value) : null;
      return {
        id: configKey, ...policyIdentity,
        deviceProfitPercent: optionalNumber(input?.deviceProfitPercent),
        accessoryProfitPercent: optionalNumber(input?.accessoryProfitPercent),
        onlineSaleSplitPercent: optionalNumber(input?.onlineSaleSplitPercent),
        maxDiscountPercent: optionalNumber(input?.maxDiscountPercent),
        defaultMonthlyTarget: optionalNumber(input?.defaultMonthlyTarget),
        commissionTags: draftTags
      };
    }
    const requiredKeys = ['deviceProfitPercent', 'accessoryProfitPercent', 'onlineSaleSplitPercent', 'maxDiscountPercent', 'defaultMonthlyTarget'];
    if (requiredKeys.some(key => typeof input?.[key] !== 'number')) throw new Error('SALES_CONFIG_INVALID');
    const deviceProfitPercent = Number(input?.deviceProfitPercent);
    const accessoryProfitPercent = Number(input?.accessoryProfitPercent);
    const onlineSaleSplitPercent = Number(input?.onlineSaleSplitPercent);
    const maxDiscountPercent = Number(input?.maxDiscountPercent);
    const defaultMonthlyTarget = Number(input?.defaultMonthlyTarget);
    const numbers = [deviceProfitPercent, accessoryProfitPercent, onlineSaleSplitPercent, maxDiscountPercent, defaultMonthlyTarget];
    if (numbers.some(value => !Number.isFinite(value) || value < 0) || deviceProfitPercent > 100 || accessoryProfitPercent > 100 || onlineSaleSplitPercent > 100 || maxDiscountPercent > 100) {
      throw new Error('SALES_CONFIG_INVALID');
    }
    if (draftTags.length === 0) throw new Error('SALES_COMMISSION_TAG_REQUIRED');
    const tagIds = new Set<string>();
    const commissionTags = draftTags.map((tag: any) => {
      const { id, name: tagName, appliesTo, calculationType, value } = tag;
      if (!tag.isActive) return tag;
      if (!/^[A-Z0-9_]{2,50}$/.test(id) || !tagName || !['DEVICE', 'ACCESSORY'].includes(appliesTo) || !['FLAT', 'PERCENT'].includes(calculationType)) {
        throw new Error('SALES_COMMISSION_TAG_INVALID');
      }
      if (!Number.isFinite(value) || value < 0 || (calculationType === 'PERCENT' && value > 100) || tagIds.has(id)) {
        throw new Error('SALES_COMMISSION_TAG_INVALID');
      }
      tagIds.add(id);
      return tag;
    });
    if (!commissionTags.some((tag: any) => tag.isActive)) throw new Error('SALES_ACTIVE_COMMISSION_TAG_REQUIRED');
    return { id: configKey, ...policyIdentity, deviceProfitPercent, accessoryProfitPercent, onlineSaleSplitPercent, maxDiscountPercent, defaultMonthlyTarget, commissionTags };
  }

  if (configKey === 'retailPricing') {
    const entries = (Array.isArray(input?.entries) ? input.entries : []).map((entry: any, index: number) => ({
      id: String(entry?.id || `PRICE_${index + 1}`).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
      itemType: String(entry?.itemType || 'DEVICE').trim().toUpperCase(),
      matchType: String(entry?.matchType || 'ITEM_ID').trim().toUpperCase(),
      itemKey: String(entry?.itemKey || '').trim(),
      itemName: String(entry?.itemName || '').trim(),
      branchId: String(entry?.branchId || 'ALL').trim(),
      retailPrice: typeof entry?.retailPrice === 'number' && Number.isFinite(entry.retailPrice) ? Number(entry.retailPrice) : null,
      minimumPrice: typeof entry?.minimumPrice === 'number' && Number.isFinite(entry.minimumPrice) ? Number(entry.minimumPrice) : null,
      isActive: entry?.isActive === true
    }));
    if (!isActive) return { id: configKey, ...policyIdentity, entries };
    const activeEntries = entries.filter((entry: any) => entry.isActive);
    if (activeEntries.length === 0) throw new Error('RETAIL_PRICE_ENTRY_REQUIRED');
    const uniqueKeys = new Set<string>();
    for (const entry of activeEntries) {
      const uniqueKey = `${entry.branchId}:${entry.itemType}:${entry.matchType}:${entry.itemKey.toUpperCase()}`;
      if (
        !entry.id || !entry.itemKey || !entry.itemName ||
        !['DEVICE', 'ACCESSORY'].includes(entry.itemType) ||
        !['ITEM_ID', 'SKU', 'MODEL_VARIANT'].includes(entry.matchType) ||
        !Number.isFinite(entry.retailPrice) || entry.retailPrice <= 0 ||
        (entry.itemType === 'DEVICE' && entry.retailPrice < MIN_DEVICE_RETAIL_PRICE_VND) ||
        (entry.itemType === 'DEVICE' && entry.minimumPrice !== null && entry.minimumPrice > 0 && entry.minimumPrice < MIN_DEVICE_RETAIL_PRICE_VND) ||
        (entry.minimumPrice !== null && (!Number.isFinite(entry.minimumPrice) || entry.minimumPrice < 0 || entry.minimumPrice > entry.retailPrice)) ||
        uniqueKeys.has(uniqueKey)
      ) throw new Error('RETAIL_PRICE_ENTRY_INVALID');
      uniqueKeys.add(uniqueKey);
    }
    return { id: configKey, ...policyIdentity, entries };
  }

  if (!isActive) {
    const optionalNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Number(value) : null;
    const followUpDays = Array.isArray(input?.followUpDays) ? input.followUpDays.map(Number).filter(Number.isFinite) : [];
    return {
      id: configKey, ...policyIdentity,
      firstResponseMinutes: optionalNumber(input?.firstResponseMinutes),
      followUpAttempts: optionalNumber(input?.followUpAttempts),
      completedFollowUpCommission: optionalNumber(input?.completedFollowUpCommission),
      followUpDays: [...new Set(followUpDays)].sort((a: number, b: number) => a - b),
      requireEvidence: input?.requireEvidence === true,
      requireQaApproval: input?.requireQaApproval === true
    };
  }
  if (typeof input?.firstResponseMinutes !== 'number' || typeof input?.followUpAttempts !== 'number' || typeof input?.completedFollowUpCommission !== 'number') throw new Error('CUSTOMER_CARE_CONFIG_INVALID');
  const firstResponseMinutes = Number(input.firstResponseMinutes);
  const followUpAttempts = Number(input.followUpAttempts);
  const completedFollowUpCommission = Number(input.completedFollowUpCommission);
  const followUpDays = Array.isArray(input?.followUpDays)
    ? input.followUpDays.map(Number)
    : String(input?.followUpDays || '').split(',').map((value: string) => Number(value.trim())).filter(Number.isFinite);
  if (!Number.isFinite(firstResponseMinutes) || firstResponseMinutes <= 0 || !Number.isInteger(followUpAttempts) || followUpAttempts <= 0 || !Number.isFinite(completedFollowUpCommission) || completedFollowUpCommission < 0 || !followUpDays.length || followUpDays.some((value: number) => value < 0)) {
    throw new Error('CUSTOMER_CARE_CONFIG_INVALID');
  }
  return {
    id: configKey, ...policyIdentity, firstResponseMinutes, followUpAttempts, completedFollowUpCommission,
    followUpDays: [...new Set(followUpDays)].sort((a: number, b: number) => a - b),
    requireEvidence: input?.requireEvidence === true,
    requireQaApproval: input?.requireQaApproval === true
  };
}

async function assertBranchActive(transaction: any, db: Firestore, branchId: string) {
  const branchSnap = await transaction.get(db.collection('branches').doc(branchId));
  if (!branchSnap.exists || branchSnap.data()?.isActive === false) throw new Error('BRANCH_NOT_ACTIVE');
}

async function assertCustodian(transaction: any, db: Firestore, uid: string, branchId: string) {
  const userSnap = await transaction.get(db.collection('users').doc(uid));
  if (!userSnap.exists || userSnap.data()?.active !== true) throw new Error('CUSTODIAN_NOT_ACTIVE');
  const user = userSnap.data()!;
  const assigned = Array.isArray(user.assignedBranchIds) ? user.assignedBranchIds : [];
  if (user.role !== 'ADMIN' && user.branchId !== branchId && !assigned.includes(branchId)) {
    throw new Error('CUSTODIAN_BRANCH_MISMATCH');
  }
  return user.displayName || user.name || user.email || uid;
}

async function assertParentWarehouse(transaction: any, db: Firestore, parentId: string, branchId: string) {
  const parentSnap = await transaction.get(db.collection('warehouses').doc(parentId));
  if (!parentSnap.exists) throw new Error('PARENT_WAREHOUSE_NOT_FOUND');
  const parent = parentSnap.data()!;
  if (parent.isMain !== true || !isWarehouseRecordActive(parent)) throw new Error('PARENT_MUST_BE_ACTIVE_MAIN_WAREHOUSE');
  if (requiredBranchId(parent.branchId) !== branchId) throw new Error('PARENT_WAREHOUSE_BRANCH_MISMATCH');
}

export function createConfigurationRouter(db: Firestore | null): Router {
  const router = Router();
  router.use(authenticateFirebase);

  router.post('/branches', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const branch = validateBranchDraft(req.body);
      const branchRef = db.collection('branches').doc(branch.id);
      await db.runTransaction(async transaction => {
        const [current, sameCode, allBranches] = await Promise.all([
          transaction.get(branchRef),
          transaction.get(db.collection('branches').where('code', '==', branch.code)),
          branch.isHeadquarter ? transaction.get(db.collection('branches')) : Promise.resolve(null)
        ]);
        if (current.exists) throw new Error('BRANCH_ID_DUPLICATE');
        if (!sameCode.empty) throw new Error('BRANCH_CODE_DUPLICATE');
        if (allBranches) allBranches.docs.filter(item => item.data().isHeadquarter === true).forEach(item => transaction.update(item.ref, { isHeadquarter: false, updatedAt: FieldValue.serverTimestamp() }));
        transaction.create(branchRef, { ...branch, createdByUid: req.user?.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      });
      return res.status(201).json({ success: true, branch });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'BRANCH_CREATE_FAILED' });
    }
  });

  router.patch('/branches/:branchId', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const branch = validateBranchDraft({ ...req.body, id: req.params.branchId });
      const branchRef = db.collection('branches').doc(branch.id);
      await db.runTransaction(async transaction => {
        const [current, sameCode, allBranches] = await Promise.all([
          transaction.get(branchRef),
          transaction.get(db.collection('branches').where('code', '==', branch.code)),
          branch.isHeadquarter ? transaction.get(db.collection('branches')) : Promise.resolve(null)
        ]);
        if (!current.exists) throw new Error('BRANCH_NOT_FOUND');
        if (sameCode.docs.some(item => item.id !== branch.id)) throw new Error('BRANCH_CODE_DUPLICATE');
        if (allBranches) allBranches.docs.filter(item => item.id !== branch.id && item.data().isHeadquarter === true).forEach(item => transaction.update(item.ref, { isHeadquarter: false, updatedAt: FieldValue.serverTimestamp() }));
        transaction.set(branchRef, { ...branch, updatedByUid: req.user?.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
      return res.json({ success: true, branch });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'BRANCH_UPDATE_FAILED' });
    }
  });

  router.post('/branches/:branchId/archive', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const branchRef = db.collection('branches').doc(req.params.branchId);
      await db.runTransaction(async transaction => {
        const [branchSnap, activeWarehouses, users, funds] = await Promise.all([
          transaction.get(branchRef),
          transaction.get(db.collection('warehouses').where('branchId', '==', req.params.branchId)),
          transaction.get(db.collection('users').where('branchId', '==', req.params.branchId)),
          transaction.get(db.collection('funds').where('branchId', '==', req.params.branchId))
        ]);
        if (!branchSnap.exists) throw new Error('BRANCH_NOT_FOUND');
        if (branchSnap.data()?.isHeadquarter === true) throw new Error('HEADQUARTER_CANNOT_ARCHIVE');
        if (activeWarehouses.docs.some(item => isWarehouseRecordActive(item.data()))) throw new Error('BRANCH_HAS_ACTIVE_WAREHOUSES');
        if (users.docs.some(item => item.data().active === true)) throw new Error('BRANCH_HAS_ACTIVE_USERS');
        if (funds.docs.some(item => item.data().isActive !== false && item.data().isArchived !== true)) throw new Error('BRANCH_HAS_ACTIVE_FUNDS');
        transaction.update(branchRef, { isActive: false, isArchived: true, archivedByUid: req.user?.uid, archivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'BRANCH_ARCHIVE_FAILED' });
    }
  });

  router.put('/store-settings', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const settings = validateStoreSettingsDraft(req.body);
      await db.collection('storeSettings').doc('main').set({ ...settings, updatedByUid: req.user?.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return res.json({ success: true, settings });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'STORE_SETTINGS_UPDATE_FAILED' });
    }
  });

  router.post('/sop-templates', requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const draft = validateSopTemplateDraft(req.body);
      const ref = db.collection('sopTemplates').doc();
      const record = { ...draft, id: ref.id, createdByUid: req.user?.uid, createdBy: req.user?.name || req.user?.email || req.user?.uid };
      await db.runTransaction(async transaction => {
        const sameCode = await transaction.get(db.collection('sopTemplates').where('code', '==', draft.code));
        if (sameCode.docs.some(item => item.data().isArchived !== true)) throw new Error('SOP_CODE_DUPLICATE');
        transaction.create(ref, { ...record, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      });
      return res.status(201).json({ success: true, data: record });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'SOP_CREATE_FAILED' });
    }
  });

  router.patch('/sop-templates/:templateId', requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const ref = db.collection('sopTemplates').doc(req.params.templateId);
      let result: any;
      await db.runTransaction(async transaction => {
        const current = await transaction.get(ref);
        if (!current.exists) throw new Error('SOP_NOT_FOUND');
        if (current.data()?.isArchived === true) throw new Error('SOP_ARCHIVED');
        const draft = validateSopTemplateDraft({ ...current.data(), ...req.body });
        const sameCode = await transaction.get(db.collection('sopTemplates').where('code', '==', draft.code));
        if (sameCode.docs.some(item => item.id !== ref.id && item.data().isArchived !== true)) throw new Error('SOP_CODE_DUPLICATE');
        result = { ...current.data(), ...draft, id: ref.id, updatedByUid: req.user?.uid };
        transaction.set(ref, { ...draft, id: ref.id, updatedByUid: req.user?.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(String(error.message).includes('NOT_FOUND') ? 404 : 400).json({ success: false, error: error.message || 'SOP_UPDATE_FAILED' });
    }
  });

  router.post('/sop-templates/:templateId/archive', requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const ref = db.collection('sopTemplates').doc(req.params.templateId);
      let archived = false;
      await db.runTransaction(async transaction => {
        const [current, linked] = await Promise.all([
          transaction.get(ref),
          transaction.get(db.collection('dailyShiftChecklists').where('templateId', '==', req.params.templateId).limit(1))
        ]);
        if (!current.exists) throw new Error('SOP_NOT_FOUND');
        if (linked.empty) transaction.delete(ref);
        else {
          archived = true;
          transaction.update(ref, { isActive: false, isArchived: true, archivedByUid: req.user?.uid, archivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        }
      });
      return res.json({ success: true, data: { id: req.params.templateId, archived } });
    } catch (error: any) {
      return res.status(String(error.message).includes('NOT_FOUND') ? 404 : 400).json({ success: false, error: error.message || 'SOP_ARCHIVE_FAILED' });
    }
  });

  router.post('/repair-services', requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const draft = validateRepairServiceDraft(req.body);
      const ref = db.collection('repairServices').doc();
      const record = { ...draft, id: ref.id, createdByUid: req.user?.uid };
      await ref.create({ ...record, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return res.status(201).json({ success: true, data: record });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'REPAIR_SERVICE_CREATE_FAILED' });
    }
  });

  router.patch('/repair-services/:serviceId', requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const ref = db.collection('repairServices').doc(req.params.serviceId);
      let result: any;
      await db.runTransaction(async transaction => {
        const current = await transaction.get(ref);
        if (!current.exists) throw new Error('REPAIR_SERVICE_NOT_FOUND');
        const draft = validateRepairServiceDraft({ ...current.data(), ...req.body });
        result = { ...current.data(), ...draft, id: ref.id, updatedByUid: req.user?.uid };
        transaction.set(ref, { ...draft, id: ref.id, updatedByUid: req.user?.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(String(error.message).includes('NOT_FOUND') ? 404 : 400).json({ success: false, error: error.message || 'REPAIR_SERVICE_UPDATE_FAILED' });
    }
  });

  router.post('/repair-services/:serviceId/archive', requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const ref = db.collection('repairServices').doc(req.params.serviceId);
      const current = await ref.get();
      if (!current.exists) throw new Error('REPAIR_SERVICE_NOT_FOUND');
      await ref.update({ isActive: false, isArchived: true, archivedByUid: req.user?.uid, archivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(String(error.message).includes('NOT_FOUND') ? 404 : 400).json({ success: false, error: error.message || 'REPAIR_SERVICE_ARCHIVE_FAILED' });
    }
  });

  router.get('/setup-status', async (_req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const [branchesSnap, warehousesSnap, fundsSnap, sopSnap, taskTypesSnap, settingsSnap, salesSnap, retailPricingSnap, careSnap] = await Promise.all([
        db.collection('branches').get(),
        db.collection('warehouses').get(),
        db.collection('funds').get(),
        db.collection('sopTemplates').get(),
        db.collection('technicalTaskTypes').get(),
        db.collection('storeSettings').doc('main').get(),
        db.collection('operationalConfigs').doc('sales').get(),
        db.collection('operationalConfigs').doc('retailPricing').get(),
        db.collection('operationalConfigs').doc('customerCare').get()
      ]);
      const activeBranches = branchesSnap.docs.filter(item => item.data().isActive !== false);
      const activeWarehouses = warehousesSnap.docs.filter(item => isWarehouseRecordActive(item.data()));
      const warehouseCoverage = calculateBranchWarehouseCoverage(activeBranches.map(item => item.id), warehousesSnap.docs.map(item => item.data()));
      const mainWarehouseBranches = new Set(activeWarehouses.filter(item => item.data().isMain === true).map(item => item.data().branchId));
      const cashAccountBranches = new Set(fundsSnap.docs.filter(item => {
        const data = item.data();
        return data.type === 'CASH' && data.isActive !== false && data.active !== false && data.isArchived !== true;
      }).map(item => item.data().branchId));
      const settings = settingsSnap.exists ? settingsSnap.data()! : {};
      const salesVersions = normalizeOperationalPolicyVersions('sales', salesSnap.exists ? salesSnap.data() : null);
      const retailPricingVersions = normalizeOperationalPolicyVersions('retailPricing', retailPricingSnap.exists ? retailPricingSnap.data() : null);
      const careVersions = normalizeOperationalPolicyVersions('customerCare', careSnap.exists ? careSnap.data() : null);
      const activeSales = selectEffectiveOperationalPolicy(salesVersions);
      const activeRetailPricing = selectEffectiveOperationalPolicy(retailPricingVersions);
      const activeCare = selectEffectiveOperationalPolicy(careVersions);
      const checks = [
        { id: 'company', label: 'Thông tin doanh nghiệp', complete: Boolean(settings.companyName && settings.hotline && settings.headquarterAddress), detail: 'Tên doanh nghiệp, hotline và địa chỉ trụ sở' },
        { id: 'branches', label: 'Chi nhánh', complete: activeBranches.length > 0, detail: `${activeBranches.length} chi nhánh hoạt động` },
        { id: 'warehouses', label: 'Kho theo chi nhánh', complete: warehouseCoverage.complete, detail: `${warehouseCoverage.coveredBranches}/${warehouseCoverage.totalBranches} chi nhánh có kho hoạt động · ${mainWarehouseBranches.size} chi nhánh có kho tổng` },
        { id: 'funds', label: 'Quỹ tiền mặt theo chi nhánh', complete: activeBranches.length > 0 && activeBranches.every(item => cashAccountBranches.has(item.id)), detail: `${cashAccountBranches.size}/${activeBranches.length} chi nhánh có quỹ tiền mặt` },
        { id: 'sop', label: 'Quy trình SOP', complete: sopSnap.docs.some(item => item.data().isActive !== false), detail: `${sopSnap.docs.filter(item => item.data().isActive !== false).length} SOP hoạt động` },
        { id: 'technicalTasks', label: 'Task và hoa hồng kỹ thuật', complete: taskTypesSnap.docs.some(item => item.data().isActive !== false), detail: `${taskTypesSnap.docs.filter(item => item.data().isActive !== false).length} task hoạt động` },
        { id: 'sales', label: 'Chính sách Sales', complete: Boolean(activeSales && activeSales.commissionTags?.some((tag: any) => tag.isActive === true)), detail: activeSales ? `${activeSales.commissionTags.filter((tag: any) => tag.isActive === true).length} tag · hiệu lực ${activeSales.effectiveFrom}${activeSales.effectiveTo ? ` đến ${activeSales.effectiveTo}` : ''}` : 'Không có chính sách đang hiệu lực' },
        { id: 'retailPricing', label: 'Bảng giá bán lẻ', complete: Boolean(activeRetailPricing && activeRetailPricing.entries?.some((entry: any) => entry.isActive === true)), detail: activeRetailPricing ? `${activeRetailPricing.entries.filter((entry: any) => entry.isActive === true).length} dòng giá · hiệu lực ${activeRetailPricing.effectiveFrom}${activeRetailPricing.effectiveTo ? ` đến ${activeRetailPricing.effectiveTo}` : ''}` : 'Không có bảng giá đang hiệu lực' },
        { id: 'customerCare', label: 'Quy trình & hoa hồng CSKH', complete: Boolean(activeCare && Number.isFinite(activeCare.completedFollowUpCommission)), detail: activeCare ? `Hiệu lực ${activeCare.effectiveFrom}${activeCare.effectiveTo ? ` đến ${activeCare.effectiveTo}` : ''} · ${Number(activeCare.completedFollowUpCommission || 0).toLocaleString('vi-VN')}đ/lượt đạt chuẩn` : 'Không có chính sách đang hiệu lực' }
      ];
      return res.json({ success: true, data: { complete: checks.every(item => item.complete), checks } });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'SETUP_STATUS_FAILED' });
    }
  });

  router.get('/operational-configs', async (_req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    const [salesSnap, retailPricingSnap, careSnap] = await Promise.all([
      db.collection('operationalConfigs').doc('sales').get(),
      db.collection('operationalConfigs').doc('retailPricing').get(),
      db.collection('operationalConfigs').doc('customerCare').get()
    ]);
    const policyVersions = {
      sales: normalizeOperationalPolicyVersions('sales', salesSnap.exists ? salesSnap.data() : null),
      retailPricing: normalizeOperationalPolicyVersions('retailPricing', retailPricingSnap.exists ? retailPricingSnap.data() : null),
      customerCare: normalizeOperationalPolicyVersions('customerCare', careSnap.exists ? careSnap.data() : null)
    };
    const configs = {
      sales: selectEffectiveOperationalPolicy(policyVersions.sales),
      retailPricing: selectEffectiveOperationalPolicy(policyVersions.retailPricing),
      customerCare: selectEffectiveOperationalPolicy(policyVersions.customerCare)
    };
    return res.json({ success: true, data: { configs, policyVersions } });
  });

  router.get('/finance-categories', async (_req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const snapshot = await db.collection('operationalConfigs').doc('financeCategories').get();
      return res.json({ success: true, data: normalizeFinanceCategories(snapshot.exists ? snapshot.data() : null) });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'FINANCE_CATEGORIES_LOAD_FAILED' });
    }
  });

  router.post('/finance-categories', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const draft = validateFinanceCategoryDraft(req.body);
      const configRef = db.collection('operationalConfigs').doc('financeCategories');
      let result = { receiptCategories: [] as string[], paymentCategories: [] as string[] };
      await db.runTransaction(async transaction => {
        const currentSnapshot = await transaction.get(configRef);
        const current = normalizeFinanceCategories(currentSnapshot.exists ? currentSnapshot.data() : null);
        const targetKey = draft.type === 'RECEIPT' ? 'receiptCategories' : 'paymentCategories';
        const duplicate = current[targetKey].some(name => name.toLocaleLowerCase('vi-VN') === draft.name.toLocaleLowerCase('vi-VN'));
        result = duplicate
          ? current
          : { ...current, [targetKey]: [...current[targetKey], draft.name] };
        transaction.set(configRef, {
          id: 'financeCategories',
          ...result,
          updatedAt: new Date().toISOString(),
          updatedByUid: req.user?.uid || null
        }, { merge: false });
      });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'FINANCE_CATEGORY_SAVE_FAILED' });
    }
  });

  router.put('/operational-configs/:configKey', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const configKey = String(req.params.configKey || '').trim() as OperationalPolicyKind;
      const config = validateOperationalConfig(configKey, req.body);
      const configRef = db.collection('operationalConfigs').doc(configKey);
      let versions: any[] = [];
      await db.runTransaction(async transaction => {
        const currentSnap = await transaction.get(configRef);
        const currentVersions = normalizeOperationalPolicyVersions(configKey, currentSnap.exists ? currentSnap.data() : null);
        const otherVersions = currentVersions.filter(policy => policy.policyId !== config.policyId);
        if (otherVersions.some(policy => operationalPolicyPeriodsOverlap(policy, config))) throw new Error('POLICY_EFFECTIVE_PERIOD_OVERLAP');
        versions = [...otherVersions, config].sort((left, right) => String(right.effectiveFrom).localeCompare(String(left.effectiveFrom)));
        transaction.set(configRef, { id: configKey, versions, updatedAt: new Date().toISOString(), updatedByUid: req.user?.uid }, { merge: false });
      });
      const activeConfig = selectEffectiveOperationalPolicy(versions);
      return res.json({ success: true, data: { config: activeConfig, policy: config, policyVersions: versions } });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'CONFIG_SAVE_FAILED' });
    }
  });

  router.post('/warehouses', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const draft = validateWarehouseDraft(req.body);
      let result: any;
      await db.runTransaction(async (transaction) => {
        const warehouseRef = db.collection('warehouses').doc(draft.id);
        const existing = await transaction.get(warehouseRef);
        if (existing.exists) throw new Error('WAREHOUSE_ID_DUPLICATE');
        await assertBranchActive(transaction, db, draft.branchId);

        const sameBranch = await transaction.get(db.collection('warehouses').where('branchId', '==', draft.branchId));
        if (sameBranch.docs.some((item) => item.data().code === draft.code && isWarehouseRecordActive(item.data()))) {
          throw new Error('WAREHOUSE_CODE_DUPLICATE');
        }

        let custodianName = '';
        if (draft.isChild) {
          await assertParentWarehouse(transaction, db, draft.parentWarehouseId, draft.branchId);
          custodianName = await assertCustodian(transaction, db, draft.custodianUid, draft.branchId);
        }

        result = {
          ...req.body,
          ...draft,
          parentWarehouseId: draft.parentWarehouseId || null,
          custodianUid: draft.custodianUid || null,
          custodianName: custodianName || null,
          technicianId: draft.custodianUid || null,
          technicianName: custodianName || null,
          isActive: req.body.isActive !== false,
          active: req.body.isActive !== false,
          isArchived: false,
          createdByUid: req.user?.uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        };
        transaction.set(warehouseRef, result);
      });
      return res.status(201).json({ success: true, warehouse: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'WAREHOUSE_CREATE_FAILED' });
    }
  });

  router.patch('/warehouses/:warehouseId', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      let result: any;
      await db.runTransaction(async (transaction) => {
        const warehouseRef = db.collection('warehouses').doc(req.params.warehouseId);
        const currentSnap = await transaction.get(warehouseRef);
        if (!currentSnap.exists) throw new Error('WAREHOUSE_NOT_FOUND');
        const current = currentSnap.data()!;
        const draft = validateWarehouseDraft({ ...current, ...req.body, id: req.params.warehouseId });
        await assertBranchActive(transaction, db, draft.branchId);

        const children = await transaction.get(db.collection('warehouses').where('parentWarehouseId', '==', req.params.warehouseId));
        const activeChildren = children.docs.filter(item => isWarehouseRecordActive(item.data()));
        if (current.isMain === true && draft.isMain === false && activeChildren.length > 0) {
          throw new Error('WAREHOUSE_HAS_CHILDREN');
        }

        const sameBranch = await transaction.get(db.collection('warehouses').where('branchId', '==', draft.branchId));
        if (sameBranch.docs.some(item => item.id !== req.params.warehouseId && item.data().code === draft.code && isWarehouseRecordActive(item.data()))) {
          throw new Error('WAREHOUSE_CODE_DUPLICATE');
        }

        if (draft.branchId !== current.branchId) {
          const [devices, sourceTransfers, destinationTransfers] = await Promise.all([
            transaction.get(db.collection('devices').where('currentLocationId', '==', req.params.warehouseId)),
            transaction.get(db.collection('transfers').where('sourceLocationId', '==', req.params.warehouseId)),
            transaction.get(db.collection('transfers').where('destinationLocationId', '==', req.params.warehouseId))
          ]);
          if (warehouseHasBlockingDevices(devices.docs.map(item => item.data()))) throw new Error('WAREHOUSE_HAS_DEVICES');
          if (activeChildren.length > 0) throw new Error('WAREHOUSE_HAS_CHILDREN');
          const openStatuses = new Set(['PENDING', 'WAITING_KTV_ACCEPT', 'IN_PROGRESS', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'DISPUTED']);
          if ([...sourceTransfers.docs, ...destinationTransfers.docs].some(item => openStatuses.has(item.data().status))) {
            throw new Error('WAREHOUSE_HAS_OPEN_TRANSFERS');
          }
        }

        let custodianName = '';
        if (draft.isChild) {
          await assertParentWarehouse(transaction, db, draft.parentWarehouseId, draft.branchId);
          custodianName = await assertCustodian(transaction, db, draft.custodianUid, draft.branchId);
        }
        result = {
          ...current,
          ...req.body,
          ...draft,
          parentWarehouseId: draft.parentWarehouseId || null,
          custodianUid: draft.custodianUid || null,
          custodianName: custodianName || null,
          technicianId: draft.custodianUid || null,
          technicianName: custodianName || null,
          updatedByUid: req.user?.uid,
          updatedAt: FieldValue.serverTimestamp()
        };
        transaction.set(warehouseRef, result, { merge: true });
      });
      return res.json({ success: true, warehouse: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'WAREHOUSE_UPDATE_FAILED' });
    }
  });

  router.post('/warehouses/:warehouseId/archive', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const warehouseRef = db.collection('warehouses').doc(req.params.warehouseId);
      await db.runTransaction(async (transaction) => {
        const currentSnap = await transaction.get(warehouseRef);
        if (!currentSnap.exists) throw new Error('WAREHOUSE_NOT_FOUND');
        const [canonicalDevices, legacyWarehouseIdDevices, legacyWarehouseDevices, purchaseOrders, children, sourceTransfers, destinationTransfers, invoices, incomingMovements, outgoingMovements] = await Promise.all([
          transaction.get(db.collection('devices').where('currentLocationId', '==', req.params.warehouseId)),
          transaction.get(db.collection('devices').where('warehouseId', '==', req.params.warehouseId)),
          transaction.get(db.collection('devices').where('warehouse', '==', req.params.warehouseId)),
          transaction.get(db.collection('purchaseOrders').where('warehouseId', '==', req.params.warehouseId)),
          transaction.get(db.collection('warehouses').where('parentWarehouseId', '==', req.params.warehouseId)),
          transaction.get(db.collection('transfers').where('sourceLocationId', '==', req.params.warehouseId)),
          transaction.get(db.collection('transfers').where('destinationLocationId', '==', req.params.warehouseId)),
          transaction.get(db.collection('invoices').where('warehouseId', '==', req.params.warehouseId)),
          transaction.get(db.collection('inventoryMovements').where('toLocationId', '==', req.params.warehouseId)),
          transaction.get(db.collection('inventoryMovements').where('fromLocationId', '==', req.params.warehouseId))
        ]);
        const linkedDevices = new Map<string, any>();
        [...canonicalDevices.docs, ...legacyWarehouseIdDevices.docs, ...legacyWarehouseDevices.docs].forEach(item => linkedDevices.set(item.id, item.data()));
        if (linkedDevices.size > 0) throw new Error('WAREHOUSE_HAS_DEVICES');
        if (!purchaseOrders.empty) throw new Error('WAREHOUSE_HAS_PURCHASE_ORDERS');
        if (!children.empty) throw new Error('WAREHOUSE_HAS_CHILDREN');
        if (!sourceTransfers.empty || !destinationTransfers.empty) throw new Error('WAREHOUSE_HAS_TRANSFERS');
        if (!invoices.empty) throw new Error('WAREHOUSE_HAS_INVOICES');
        if (!incomingMovements.empty || !outgoingMovements.empty) throw new Error('WAREHOUSE_HAS_MOVEMENTS');
        transaction.delete(warehouseRef);
      });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'WAREHOUSE_DELETE_FAILED' });
    }
  });

  router.post('/warehouses/:warehouseId/restore', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const warehouseRef = db.collection('warehouses').doc(req.params.warehouseId);
      let restored: any;
      await db.runTransaction(async transaction => {
        const currentSnap = await transaction.get(warehouseRef);
        if (!currentSnap.exists) throw new Error('WAREHOUSE_NOT_FOUND');
        const current = currentSnap.data()!;
        if (isWarehouseRecordActive(current)) {
          restored = { id: currentSnap.id, ...current };
          return;
        }
        await assertBranchActive(transaction, db, String(current.branchId || ''));
        const sameBranch = await transaction.get(db.collection('warehouses').where('branchId', '==', current.branchId));
        if (sameBranch.docs.some(item => item.id !== currentSnap.id && item.data().code === current.code && isWarehouseRecordActive(item.data()))) {
          throw new Error('WAREHOUSE_CODE_DUPLICATE');
        }
        if (current.parentWarehouseId) {
          await assertParentWarehouse(transaction, db, String(current.parentWarehouseId), String(current.branchId));
          await assertCustodian(transaction, db, String(current.custodianUid || current.technicianId || ''), String(current.branchId));
        }
        restored = { ...current, id: currentSnap.id, isActive: true, active: true, isArchived: false, updatedByUid: req.user?.uid };
        transaction.update(warehouseRef, {
          isActive: true,
          active: true,
          isArchived: false,
          archivedAt: FieldValue.delete(),
          archivedByUid: FieldValue.delete(),
          updatedByUid: req.user?.uid,
          updatedAt: FieldValue.serverTimestamp()
        });
      });
      return res.json({ success: true, warehouse: restored });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'WAREHOUSE_RESTORE_FAILED' });
    }
  });

  return router;
}
