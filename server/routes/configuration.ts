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

function requiredBranchId(value: unknown): string {
  const branchId = String(value || '').trim();
  if (!branchId || branchId === 'ALL') throw new Error('WAREHOUSE_BRANCH_REQUIRED');
  return branchId;
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
