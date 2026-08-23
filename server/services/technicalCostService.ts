import crypto from 'crypto';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { canTransitionTaskLine } from './technicalStateMachine';

export interface TechnicalCostActor {
  uid: string;
  name?: string;
  role?: string;
  branchId?: string;
  assignedBranchIds?: string[];
}

export type TechnicalPartIssueStatus =
  | 'ISSUED'
  | 'PARTIALLY_SETTLED'
  | 'CONSUMED'
  | 'RETURNED'
  | 'SETTLED'
  | 'CANCELLED';

export type TechnicalPartReservationStatus =
  | 'RESERVED'
  | 'PARTIALLY_ISSUED'
  | 'FULFILLED'
  | 'CANCELLED';

export interface TechnicalCostBreakdown {
  openingDeviceCost: number;
  partsCost: number;
  laborCost: number;
  externalCost: number;
  otherCost: number;
  recoveryAmount: number;
  totalActualCost: number;
  closingDeviceCost: number;
}

const ACTIVE_PART_WORK_ORDER_STATUSES = new Set([
  'ACCEPTED',
  'DIAGNOSING',
  'IN_PROGRESS',
  'QC_FAILED_REWORK'
]);

const ACTIVE_PART_LINE_STATUSES = new Set([
  'ACCEPTED',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'REWORK_REQUIRED'
]);
const ACTIVE_COST_WORK_ORDER_STATUSES = new Set([
  ...ACTIVE_PART_WORK_ORDER_STATUSES,
  'TECH_COMPLETED',
  'QC_PENDING'
]);

const INTERNAL_ASSET_TYPES = new Set([
  'INBOUND_PREP',
  'TRADE_IN_REFURB',
  'SHOP_RETURN_REWORK'
]);

function numberOrZero(value: unknown): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) throw new Error('TECHNICAL_COST_NUMBER_INVALID');
  return numeric;
}

function positiveInteger(value: unknown, code = 'INVALID_QUANTITY'): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) throw new Error(code);
  return numeric;
}

function normalizedRole(actor: TechnicalCostActor): string {
  return String(actor.role || '').toUpperCase();
}

function isElevated(actor: TechnicalCostActor): boolean {
  return ['ADMIN', 'MANAGER', 'TECH_LEAD', 'INVENTORY_MANAGER'].includes(normalizedRole(actor));
}

function canViewTechnicalCost(actor: TechnicalCostActor): boolean {
  return ['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(normalizedRole(actor));
}

function canAccessBranch(actor: TechnicalCostActor, branchId: string): boolean {
  const role = normalizedRole(actor);
  return role === 'ADMIN' || role === 'REGIONAL_MANAGER' || actor.branchId === branchId || (actor.assignedBranchIds || []).includes(branchId);
}

/**
 * A technical task must explicitly describe the parts it may consume.  `partId`
 * is retained only for backwards compatibility; part ids are warehouse-scoped,
 * therefore new policies should use `sku` and/or `category`.
 */
type TaskPartTemplate = {
  partId?: string;
  sku?: string;
  category?: string;
  quantity?: number;
  maxQuantity?: number;
  allowSubstitution?: boolean;
};

function normalizePartToken(value: unknown): string {
  return String(value || '').trim().toLocaleUpperCase('vi');
}

/**
 * Model compatibility must not depend on how a technician happens to type a
 * model name.  For example, `12 prm`, `iPhone 12 Pro Max` and `IP12PM` are
 * one model.  Product Master codes still take precedence where available;
 * this compact normalizer keeps legacy stock and existing work orders safe
 * until all records carry those codes.
 */
function compactModelToken(value: unknown): string {
  return normalizePartToken(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Z0-9]/g, '');
}

function canonicalIphoneModelCode(value: unknown): string {
  const compact = compactModelToken(value);
  if (!compact) return '';
  const directAliases: Record<string, string> = {
    IPX: 'IPX', IPHONEX: 'IPX',
    IPXR: 'IPXR', IPHONEXR: 'IPXR',
    IPXS: 'IPXS', IPHONEXS: 'IPXS',
    IPXSM: 'IPXSM', IPHONEXSMAX: 'IPXSM'
  };
  if (directAliases[compact]) return directAliases[compact];
  const se = compact.match(/^(?:IPHONE)?(?:IP)?SE([23])$/);
  if (se) return `IPSE${se[1]}`;
  const numeric = compact.replace(/^IPHONE/, '').replace(/^IP/, '');
  const match = numeric.match(/^(\d{1,2})(MINI|M|PLUS|PL|PROMAX|PRM|PM|PRO|P|E)?$/);
  if (!match) return '';
  const suffixes: Record<string, string> = {
    MINI: 'M', M: 'M', PLUS: 'PL', PL: 'PL',
    PROMAX: 'PM', PRM: 'PM', PM: 'PM', PRO: 'P', P: 'P', E: 'E'
  };
  return `IP${match[1]}${suffixes[match[2] || ''] || ''}`;
}

function modelTokens(values: unknown[]): string[] {
  const tokens = values.flatMap(value => {
    const raw = normalizePartToken(value);
    const compact = compactModelToken(value);
    const iphoneCode = canonicalIphoneModelCode(value);
    return [raw, compact, iphoneCode].filter(Boolean);
  });
  return [...new Set(tokens)];
}

function workOrderModelTokens(workOrder: any, line: any): string[] {
  return modelTokens([
    workOrder?.catalogModelCode,
    workOrder?.modelCode,
    workOrder?.deviceSnapshot?.catalogModelCode,
    workOrder?.deviceSnapshot?.modelCode,
    line?.catalogModelCode,
    line?.modelCode,
    workOrder?.deviceModel,
    workOrder?.model,
    line?.deviceModel,
    line?.model,
    workOrder?.deviceSnapshot?.model
  ]);
}

function partModelTokens(part: any): string[] {
  const compatibleModels = [
    ...(Array.isArray(part?.compatibleModelCodes) ? part.compatibleModelCodes : []),
    ...(Array.isArray(part?.compatibleModelIds) ? part.compatibleModelIds : []),
    ...(Array.isArray(part?.compatibleModels) ? part.compatibleModels : []),
    part?.catalogModelCode,
    part?.modelCode
  ];
  return modelTokens(compatibleModels);
}

/**
 * Tồn cũ có thể dùng mã nhóm ngắn (MH, CS, CAM), còn task mới dùng tên
 * dễ đọc (MAN_HINH, CAP_SAC, CAMERA). Quy về một mã trước khi đối chiếu để
 * tránh buộc KTV phải gửi duyệt ngoại lệ cho đúng linh kiện.
 */
function canonicalPartCategory(value: unknown): string {
  const compact = normalizePartToken(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Z0-9]/g, '');
  const aliases: Record<string, string> = {
    MH: 'MANHINH', MANHINH: 'MANHINH', SCREEN: 'MANHINH', DISPLAY: 'MANHINH',
    PIN: 'PIN', BATTERY: 'PIN',
    CAM: 'CAMERA', CAMERA: 'CAMERA',
    CS: 'CAPSAC', CAPSAC: 'CAPSAC', CHANSAC: 'CAPSAC', CHARGINGPORT: 'CAPSAC',
    LOA: 'LOA', LT: 'LOA', LN: 'LOA', SPEAKER: 'LOA',
    MIC: 'MIC', MICRO: 'MIC',
    FACE: 'FACE', FACEID: 'FACE',
    VO: 'VO', KHUNG: 'VO', VOVO: 'VO', FRAME: 'VO', HOUSING: 'VO',
    KINH: 'KINH', KINHLUNG: 'KINH', GLASS: 'KINH',
    MAIN: 'MAINBOARD', MAINBOARD: 'MAINBOARD',
    IC: 'IC', ANT: 'ANTEN', ANTEN: 'ANTEN', RUNG: 'RUNG'
  };
  return aliases[compact] || compact;
}

function partCategoryTokens(part: any): string[] {
  return [...new Set([
    part?.category,
    part?.catalogGroupCode,
    part?.groupCode,
    part?.categoryCode
  ].map(canonicalPartCategory).filter(Boolean))];
}

function taskPartTemplates(line: any): TaskPartTemplate[] {
  return Array.isArray(line?.requiredParts)
    ? line.requiredParts.filter((rule: any) => rule && typeof rule === 'object')
    : [];
}

function partMatchesTaskTemplate(part: any, template: TaskPartTemplate): boolean {
  const expectedPartId = String(template.partId || '').trim();
  const expectedSku = normalizePartToken(template.sku);
  const expectedCategory = canonicalPartCategory(template.category);
  const actualPartId = String(part?.id || '').trim();
  const actualSku = normalizePartToken(part?.sku);
  const actualCategories = partCategoryTokens(part);
  // A rule may be category-only (PIN), SKU-only (PIN-15-PRO), or exact.
  const skuMustMatch = !!expectedSku && !(template.allowSubstitution === true && !!expectedCategory);
  return (!expectedPartId || expectedPartId === actualPartId)
    && (!skuMustMatch || expectedSku === actualSku)
    && (!expectedCategory || actualCategories.includes(expectedCategory));
}

function matchingTaskTemplate(line: any, part: any): TaskPartTemplate | null {
  return taskPartTemplates(line).find(template => partMatchesTaskTemplate(part, template)) || null;
}

function assertTaskPartModelCompatibility(workOrder: any, line: any, part: any): void {
  const compatibleModels = partModelTokens(part);
  if (compatibleModels.length === 0) return;
  const models = workOrderModelTokens(workOrder, line);
  // Older work orders can lack a model snapshot. Do not falsely reject them;
  // all new work orders should carry one before a compatibility policy is used.
  if (models.length > 0 && !models.some(model => compatibleModels.includes(model))) {
    throw new Error('SPARE_PART_MODEL_INCOMPATIBLE');
  }
}

function assertTechnicianUsesOwnWarehouse(actor: TechnicalCostActor, warehouse: any): void {
  // Technical leads are still technicians for physical issue purposes.  Only
  // stock-management roles may issue directly from a central warehouse.
  if (isPartStockApprover(actor)) return;
  if (String(warehouse?.type || '') !== 'TECHNICIAN_SUB') throw new Error('TECHNICIAN_PERSONAL_WAREHOUSE_REQUIRED');
  if (String(warehouse?.custodianUid || '') !== actor.uid) throw new Error('TECHNICIAN_PERSONAL_WAREHOUSE_FORBIDDEN');
}

function isPartStockApprover(actor: TechnicalCostActor): boolean {
  return ['ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'WAREHOUSE'].includes(normalizedRole(actor));
}

function isPartSupplyApprover(actor: TechnicalCostActor): boolean {
  return isPartStockApprover(actor) || normalizedRole(actor) === 'ACCOUNTANT';
}

function assertIdempotencyKey(value: unknown): string {
  const key = String(value || '').trim();
  if (key.length < 8 || key.length > 160) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  return key;
}

function idempotencyId(scope: string, key: string): string {
  return crypto.createHash('sha256').update(`${scope}:${key}`).digest('hex');
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function deterministicId(prefix: string, value: string, length = 24): string {
  return `${prefix}_${crypto.createHash('sha256').update(value).digest('hex').slice(0, length).toUpperCase()}`;
}

function warehouseBranchId(warehouse: any): string {
  return String(warehouse?.branchId || warehouse?.owningBranchId || '');
}

function publicIssue(issue: any): any {
  return JSON.parse(JSON.stringify(issue));
}

function visiblePartIssue(issue: any, actor: TechnicalCostActor): any {
  const visible = publicIssue(issue);
  if (canViewTechnicalCost(actor)) return visible;
  delete visible.unitCostSnapshot;
  delete visible.totalConsumedCost;
  delete visible.costMethod;
  delete visible.costVersion;
  delete visible.quantityScrappedCapitalized;
  delete visible.capitalizeScrapToDevice;
  return visible;
}

function deriveIssueStatus(issue: {
  quantityIssued: number;
  quantityConsumed: number;
  quantityReturned: number;
  quantityScrapped?: number;
}): TechnicalPartIssueStatus {
  const settled = issue.quantityConsumed + issue.quantityReturned + Number(issue.quantityScrapped || 0);
  if (settled === 0) return 'ISSUED';
  if (settled < issue.quantityIssued) return 'PARTIALLY_SETTLED';
  if (issue.quantityConsumed === issue.quantityIssued) return 'CONSUMED';
  if (issue.quantityReturned === issue.quantityIssued) return 'RETURNED';
  return 'SETTLED';
}

export function calculateTechnicalCostBreakdown(input: {
  openingDeviceCost: number;
  partIssues?: any[];
  taskLines?: any[];
  externalCosts?: any[];
  recoveries?: any[];
}): TechnicalCostBreakdown {
  const openingDeviceCost = numberOrZero(input.openingDeviceCost);
  if (openingDeviceCost < 0) throw new Error('OPENING_DEVICE_COST_INVALID');

  const partsCost = (input.partIssues || []).reduce((sum, issue) => {
    if (issue.status === 'CANCELLED') return sum;
    const quantityConsumed = numberOrZero(issue.quantityConsumed);
    const quantityScrapped = issue.quantityScrappedCapitalized == null
      ? (issue.capitalizeScrapToDevice === true ? numberOrZero(issue.quantityScrapped) : 0)
      : numberOrZero(issue.quantityScrappedCapitalized);
    return sum + (quantityConsumed + quantityScrapped) * numberOrZero(issue.unitCostSnapshot);
  }, 0);
  const laborCost = (input.taskLines || []).reduce((sum, line) => {
    if (line.status !== 'VERIFIED' || line.capitalizeLaborCost === false) return sum;
    return sum + numberOrZero(line.laborCostToDevice);
  }, 0);
  const externalCost = (input.externalCosts || []).reduce((sum, cost) => {
    if (cost.approvalStatus !== 'APPROVED' || cost.capitalizeToDevice === false || cost.category === 'OTHER') return sum;
    return sum + numberOrZero(cost.amount);
  }, 0);
  const otherCost = (input.externalCosts || []).reduce((sum, cost) => {
    if (cost.approvalStatus !== 'APPROVED' || cost.capitalizeToDevice === false || cost.category !== 'OTHER') return sum;
    return sum + numberOrZero(cost.amount);
  }, 0);
  const recoveryAmount = (input.recoveries || []).reduce((sum, recovery) => {
    if (recovery.approvalStatus !== 'APPROVED') return sum;
    return sum + numberOrZero(recovery.amount);
  }, 0);
  const totalActualCost = partsCost + laborCost + externalCost + otherCost - recoveryAmount;
  const closingDeviceCost = openingDeviceCost + totalActualCost;
  if (closingDeviceCost < 0) throw new Error('CLOSING_DEVICE_COST_NEGATIVE');

  return {
    openingDeviceCost,
    partsCost,
    laborCost,
    externalCost,
    otherCost,
    recoveryAmount,
    totalActualCost,
    closingDeviceCost
  };
}

export async function processReceiveTechnicalSparePart(
  db: Firestore,
  input: {
    partId?: string;
    /** Product Master is the only source allowed to introduce a new SKU. */
    productMasterId?: string;
    sku?: string;
    name?: string;
    category?: string;
    branchId: string;
    warehouseId: string;
    lotId?: string;
    lotCode?: string;
    quantity: number;
    unitCost: number;
    supplierId?: string;
    sourceType: 'PART_PURCHASE' | 'OPENING_BALANCE' | 'MANUAL_ADJUSTMENT';
    sourceId: string;
    sourceCode?: string;
    note?: string;
    compatibleModels?: string[];
    compatibleModelCodes?: string[];
    compatibleModelIds?: string[];
    idempotencyKey: string;
  },
  actor: TechnicalCostActor
): Promise<{ part: any; lot: any; receiptId: string; idempotentReplay?: boolean }> {
  // Supplier/opening-balance receipts are posted by the stock function, not
  // by a KTV.  A KTV uses the replenishment request flow below instead.
  if (!isPartStockApprover(actor) && normalizedRole(actor) !== 'TECH_LEAD') throw new Error('SPARE_PART_RECEIPT_FORBIDDEN');
  const key = assertIdempotencyKey(input.idempotencyKey);
  const sku = String(input.sku || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  const productMasterId = String(input.productMasterId || '').trim();
  const branchId = String(input.branchId || '').trim();
  const warehouseId = String(input.warehouseId || '').trim();
  const sourceId = String(input.sourceId || '').trim();
  const quantity = positiveInteger(input.quantity);
  const unitCost = Number(input.unitCost);
  if (!branchId || !warehouseId || !sourceId || (!productMasterId && (!sku || !name))) throw new Error('SPARE_PART_RECEIPT_FIELDS_REQUIRED');
  if (!['PART_PURCHASE', 'OPENING_BALANCE', 'MANUAL_ADJUSTMENT'].includes(String(input.sourceType || ''))) throw new Error('SPARE_PART_RECEIPT_SOURCE_INVALID');
  if (!Number.isSafeInteger(unitCost) || unitCost < 0) throw new Error('SPARE_PART_COST_INVALID');
  if (!canAccessBranch(actor, branchId)) throw new Error('BRANCH_FORBIDDEN');
  if (input.sourceType === 'MANUAL_ADJUSTMENT' && String(input.note || '').trim().length < 5) throw new Error('SPARE_PART_ADJUSTMENT_NOTE_REQUIRED');
  const partId = String(input.partId || '').trim() || deterministicId('SP', `${branchId}:${warehouseId}:${productMasterId || sku}`);
  const lotCode = String(input.lotCode || '').trim() || `AUTO-${sourceId}`;
  const lotId = String(input.lotId || '').trim() || deterministicId('SPL', `${partId}:${lotCode}`);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId('SPARE_PART_RECEIPT', key));
  const partRef = db.collection('spareParts').doc(partId);
  const lotRef = db.collection('sparePartLots').doc(lotId);
  const warehouseRef = db.collection('warehouses').doc(warehouseId);
  const catalogRef = productMasterId ? db.collection('catalogItems').doc(productMasterId) : null;

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const [partReplay, lotReplay] = await Promise.all([
        transaction.get(partRef),
        transaction.get(lotRef)
      ]);
      if (!partReplay.exists || !lotReplay.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      const partData = { id: partReplay.id, ...partReplay.data() } as any;
      if (!canViewTechnicalCost(actor)) {
        delete partData.currentAverageCost;
        delete partData.costPrice;
      }
      const lotData = { id: lotReplay.id, ...lotReplay.data() } as any;
      if (!canViewTechnicalCost(actor)) delete lotData.unitCost;
      return { part: partData, lot: lotData, receiptId: String(idemSnap.data()?.receiptId || ''), idempotentReplay: true };
    }
    const [warehouseSnap, partSnap, lotSnap, catalogSnap] = await Promise.all([
      transaction.get(warehouseRef),
      transaction.get(partRef),
      transaction.get(lotRef),
      catalogRef ? transaction.get(catalogRef) : Promise.resolve(null)
    ]);
    if (!warehouseSnap.exists) throw new Error('PART_WAREHOUSE_NOT_FOUND');
    const warehouse = warehouseSnap.data()!;
    if (warehouse.isActive === false || warehouse.isArchived === true || warehouseBranchId(warehouse) !== branchId) throw new Error('PART_WAREHOUSE_BRANCH_MISMATCH');
    // Supplier receipts and opening balances always land in Kho Tổng.  Child
    // KTV stock is created only by an approved transfer, preserving custody
    // and the source lot/cost audit trail.
    if (String(warehouse.type || '') !== 'CENTRAL') throw new Error('SPARE_PART_RECEIPT_MUST_BE_CENTRAL');
    const existingPart = partSnap.exists ? partSnap.data()! : null;
    const catalogMaster = catalogSnap?.exists ? catalogSnap.data()! : null;
    // A legacy balance can still be topped up for a controlled migration, but
    // no new physical part balance may be invented from a typed SKU/name.
    if (!existingPart && !catalogMaster) throw new Error('SPARE_PART_CATALOG_REQUIRED');
    if (productMasterId && (!catalogMaster
      || String(catalogMaster.category || '').toUpperCase() !== 'PART'
      || catalogMaster.lifecycleStatus === 'ARCHIVED'
      || catalogMaster.status === 'inactive')) {
      throw new Error('SPARE_PART_CATALOG_ITEM_INVALID');
    }
    const canonicalSku = String(catalogMaster?.sku || sku || existingPart?.sku || '').trim().toUpperCase();
    const canonicalName = String(catalogMaster?.name || name || existingPart?.name || '').trim();
    if (!canonicalSku || !canonicalName) throw new Error('SPARE_PART_CATALOG_REQUIRED');
    if (existingPart && (
      String(existingPart.branchId || '') !== branchId
      || String(existingPart.warehouseId || '') !== warehouseId
      || String(existingPart.sku || '').toUpperCase() !== canonicalSku
    )) throw new Error('SPARE_PART_IDENTITY_MISMATCH');
    if (existingPart?.productMasterId && productMasterId && String(existingPart.productMasterId) !== productMasterId) {
      throw new Error('SPARE_PART_CATALOG_ITEM_MISMATCH');
    }
    const existingLot = lotSnap.exists ? lotSnap.data()! : null;
    if (existingLot && (existingLot.partId !== partId || existingLot.warehouseId !== warehouseId || existingLot.branchId !== branchId)) {
      throw new Error('SPARE_PART_LOT_MISMATCH');
    }
    const currentStock = numberOrZero(existingPart?.stockQuantity);
    const currentValue = currentStock * numberOrZero(existingPart?.currentAverageCost ?? existingPart?.costPrice);
    const nextStock = currentStock + quantity;
    const nextAverageCost = nextStock > 0 ? Math.round((currentValue + quantity * unitCost) / nextStock) : unitCost;
    const currentLotStock = numberOrZero(existingLot?.stockQuantity);
    const nextLotStock = currentLotStock + quantity;
    const nextLotCost = nextLotStock > 0
      ? Math.round((currentLotStock * numberOrZero(existingLot?.unitCost) + quantity * unitCost) / nextLotStock)
      : unitCost;
    const now = new Date().toISOString();
    const receiptId = randomId('SPR');
    const movementId = randomId('SPM');
    const costVersion = `PART_RECEIPT_${now}`;
    const compatibleModels = [...new Set([
      ...(Array.isArray(existingPart?.compatibleModels) ? existingPart.compatibleModels : []),
      ...(Array.isArray(catalogMaster?.compatibleModels) ? catalogMaster.compatibleModels.map(String) : []),
      ...(Array.isArray(input.compatibleModels) ? input.compatibleModels.map(String) : [])
    ])];
    const compatibleModelCodes = [...new Set([
      ...(Array.isArray(existingPart?.compatibleModelCodes) ? existingPart.compatibleModelCodes : []),
      ...(Array.isArray(catalogMaster?.compatibleModelCodes) ? catalogMaster.compatibleModelCodes.map(String) : []),
      ...(catalogMaster?.modelCode ? [String(catalogMaster.modelCode)] : []),
      ...(Array.isArray(input.compatibleModelCodes) ? input.compatibleModelCodes.map(String) : []),
      ...compatibleModels.map(canonicalIphoneModelCode).filter(Boolean)
    ])];
    const compatibleModelIds = [...new Set([
      ...(Array.isArray(existingPart?.compatibleModelIds) ? existingPart.compatibleModelIds : []),
      ...(Array.isArray(catalogMaster?.compatibleModelIds) ? catalogMaster.compatibleModelIds.map(String) : []),
      ...(catalogMaster?.modelId ? [String(catalogMaster.modelId)] : []),
      ...(Array.isArray(input.compatibleModelIds) ? input.compatibleModelIds.map(String) : [])
    ])];
    const part = {
      ...(existingPart || {}),
      id: partId,
      productMasterId: productMasterId || existingPart?.productMasterId || null,
      sku: canonicalSku,
      name: canonicalName,
      category: String(catalogMaster?.catalogGroupCode || catalogMaster?.categoryCode || input.category || existingPart?.category || 'KHAC'),
      catalogGroupCode: String(catalogMaster?.catalogGroupCode || existingPart?.catalogGroupCode || '') || null,
      catalogModelCode: String(catalogMaster?.modelCode || existingPart?.catalogModelCode || '') || null,
      branchId,
      warehouseId,
      stockQuantity: nextStock,
      reservedQuantity: numberOrZero(existingPart?.reservedQuantity),
      currentAverageCost: nextAverageCost,
      costPrice: nextAverageCost,
      costVersion,
      compatibleModels,
      compatibleModelCodes,
      compatibleModelIds,
      isActive: existingPart?.isActive !== false,
      createdAt: existingPart?.createdAt || now,
      updatedAt: now
    };
    const lot = {
      ...(existingLot || {}),
      id: lotId,
      lotCode,
      partId,
      productMasterId: productMasterId || existingLot?.productMasterId || existingPart?.productMasterId || null,
      sku: canonicalSku,
      branchId,
      warehouseId,
      supplierId: input.supplierId || existingLot?.supplierId || null,
      sourceType: input.sourceType,
      sourceId,
      sourceCode: input.sourceCode || null,
      stockQuantity: nextLotStock,
      reservedQuantity: numberOrZero(existingLot?.reservedQuantity),
      unitCost: nextLotCost,
      costVersion,
      receivedAt: now,
      createdAt: existingLot?.createdAt || now,
      updatedAt: now
    };
    const receipt = {
      id: receiptId,
      partId,
      lotId,
      productMasterId: productMasterId || existingPart?.productMasterId || null,
      sku: canonicalSku,
      partName: canonicalName,
      catalogGroupCode: String(catalogMaster?.catalogGroupCode || existingPart?.catalogGroupCode || '') || null,
      branchId,
      warehouseId,
      quantity,
      unitCostSnapshot: unitCost,
      totalCost: quantity * unitCost,
      supplierId: input.supplierId || null,
      sourceType: input.sourceType,
      sourceId,
      sourceCode: input.sourceCode || null,
      note: String(input.note || ''),
      receivedByUid: actor.uid,
      receivedAt: now,
      createdAt: now
    };
    transaction.set(partRef, part);
    transaction.set(lotRef, lot);
    transaction.set(db.collection('sparePartReceipts').doc(receiptId), receipt);
    transaction.set(db.collection('sparePartMovements').doc(movementId), {
      id: movementId,
      movementType: 'RECEIPT',
      partId,
      lotId,
      productMasterId: productMasterId || existingPart?.productMasterId || null,
      sku: canonicalSku,
      warehouseId,
      branchId,
      quantity,
      unitCostSnapshot: unitCost,
      sourceType: input.sourceType,
      sourceId,
      receiptId,
      actorUid: actor.uid,
      note: String(input.note || ''),
      occurredAt: now,
      createdAt: now
    });
    transaction.set(idemRef, { scope: 'SPARE_PART_RECEIPT', partId, lotId, receiptId, createdAt: now });
    const visiblePart = publicIssue(part);
    const visibleLot = publicIssue(lot);
    if (!canViewTechnicalCost(actor)) {
      delete visiblePart.currentAverageCost;
      delete visiblePart.costPrice;
      delete visibleLot.unitCost;
    }
    return { part: visiblePart, lot: visibleLot, receiptId };
  });
}

/**
 * A KTV never decrements the central balance directly.  They request a
 * replenishment to their own TECHNICIAN_SUB warehouse; approval fulfils a
 * traceable transfer and creates a usable destination balance/lot.
 */
export async function processCreateTechnicalPartStockRequest(
  db: Firestore,
  input: {
    sourceWarehouseId: string;
    targetWarehouseId: string;
    partId: string;
    lotId?: string;
    quantity: number;
    reason: string;
    workOrderId?: string;
    workOrderLineId?: string;
    idempotencyKey: string;
  },
  actor: TechnicalCostActor
): Promise<{ request: any; idempotentReplay?: boolean }> {
  const key = assertIdempotencyKey(input.idempotencyKey);
  const quantity = positiveInteger(input.quantity);
  const sourceWarehouseId = String(input.sourceWarehouseId || '').trim();
  const targetWarehouseId = String(input.targetWarehouseId || '').trim();
  const partId = String(input.partId || '').trim();
  const lotId = String(input.lotId || '').trim() || null;
  const reason = String(input.reason || '').trim();
  const workOrderId = String(input.workOrderId || '').trim() || null;
  const workOrderLineId = String(input.workOrderLineId || '').trim() || null;
  if (!sourceWarehouseId || !targetWarehouseId || !partId || reason.length < 5) throw new Error('PART_STOCK_REQUEST_FIELDS_REQUIRED');
  if ((workOrderId && !workOrderLineId) || (!workOrderId && workOrderLineId)) throw new Error('PART_STOCK_REQUEST_TASK_REFERENCE_INVALID');
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId('PART_STOCK_REQUEST', key));
  const sourceWarehouseRef = db.collection('warehouses').doc(sourceWarehouseId);
  const targetWarehouseRef = db.collection('warehouses').doc(targetWarehouseId);
  const partRef = db.collection('spareParts').doc(partId);
  const lotRef = lotId ? db.collection('sparePartLots').doc(lotId) : null;
  const workOrderRef = workOrderId ? db.collection('technicalWorkOrders').doc(workOrderId) : null;
  const lineRef = workOrderLineId ? db.collection('technicalWorkOrderLines').doc(workOrderLineId) : null;

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const requestRef = db.collection('technicalPartStockRequests').doc(String(idemSnap.data()?.requestId || ''));
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { request: publicIssue(requestSnap.data()), idempotentReplay: true };
    }
    const [sourceWarehouseSnap, targetWarehouseSnap, partSnap, lotSnap, workOrderSnap, lineSnap] = await Promise.all([
      transaction.get(sourceWarehouseRef),
      transaction.get(targetWarehouseRef),
      transaction.get(partRef),
      lotRef ? transaction.get(lotRef) : Promise.resolve(null),
      workOrderRef ? transaction.get(workOrderRef) : Promise.resolve(null),
      lineRef ? transaction.get(lineRef) : Promise.resolve(null)
    ]);
    if (!sourceWarehouseSnap.exists || !targetWarehouseSnap.exists) throw new Error('PART_TRANSFER_WAREHOUSE_NOT_FOUND');
    if (!partSnap.exists) throw new Error('SPARE_PART_NOT_FOUND');
    if (lotRef && !lotSnap?.exists) throw new Error('SPARE_PART_LOT_NOT_FOUND');
    const sourceWarehouse = sourceWarehouseSnap.data()!;
    const targetWarehouse = targetWarehouseSnap.data()!;
    const part = partSnap.data()!;
    const lot = lotSnap?.data();
    const branchId = warehouseBranchId(sourceWarehouse);
    if (!branchId || branchId !== warehouseBranchId(targetWarehouse)) throw new Error('PART_TRANSFER_BRANCH_MISMATCH');
    if (!canAccessBranch(actor, branchId)) throw new Error('BRANCH_FORBIDDEN');
    if (sourceWarehouse.isActive === false || targetWarehouse.isActive === false || sourceWarehouse.isArchived || targetWarehouse.isArchived) throw new Error('PART_TRANSFER_WAREHOUSE_INACTIVE');
    if (String(sourceWarehouse.type || '') !== 'CENTRAL') throw new Error('PART_TRANSFER_SOURCE_MUST_BE_CENTRAL');
    if (String(targetWarehouse.type || '') !== 'TECHNICIAN_SUB' || String(targetWarehouse.parentWarehouseId || '') !== sourceWarehouseId) throw new Error('PART_TRANSFER_TARGET_MUST_BE_CHILD_TECHNICIAN_WAREHOUSE');
    if (!isPartStockApprover(actor) && String(targetWarehouse.custodianUid || '') !== actor.uid) throw new Error('TECHNICIAN_PERSONAL_WAREHOUSE_FORBIDDEN');
    if (String(part.branchId || '') !== branchId || String(part.warehouseId || '') !== sourceWarehouseId) throw new Error('SPARE_PART_WAREHOUSE_MISMATCH');
    if (lot && (String(lot.partId || '') !== partId || String(lot.warehouseId || '') !== sourceWarehouseId)) throw new Error('SPARE_PART_LOT_MISMATCH');
    const workOrder = workOrderSnap?.data();
    const line = lineSnap?.data();
    if (workOrderId) {
      if (!workOrderSnap?.exists || !lineSnap?.exists || !workOrder || !line) throw new Error('PART_STOCK_REQUEST_WORK_ORDER_NOT_FOUND');
      if (String(line.workOrderId || '') !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
      if (!canAccessBranch(actor, String(workOrder.branchId || line.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
      if (!isElevated(actor) && String(line.assigneeUid || '') !== actor.uid) throw new Error('TECHNICIAN_NOT_ASSIGNED');
      // A KTV may request a part as soon as a task is assigned, before they
      // begin hands-on work.  Reserve/issue remains restricted to active
      // task states below; this exception is only for a stock request.
      const lineCanRequestParts = ACTIVE_PART_LINE_STATUSES.has(String(line.status || ''))
        || String(line.status || '') === 'ASSIGNED';
      const workOrderCanRequestParts = ACTIVE_PART_WORK_ORDER_STATUSES.has(String(workOrder.status || ''))
        || String(workOrder.status || '') === 'ASSIGNED';
      if (!workOrderCanRequestParts || !lineCanRequestParts) {
        throw new Error('TASK_NOT_OPEN_FOR_PARTS');
      }
      const taskTemplate = matchingTaskTemplate(line, { ...part, id: partSnap.id || partId });
      if (!taskTemplate) throw new Error(taskPartTemplates(line).length === 0 ? 'TASK_PART_POLICY_NOT_CONFIGURED' : 'TASK_PART_NOT_ALLOWED');
      assertTaskPartModelCompatibility(workOrder, line, part);
    }
    const availableQuantity = numberOrZero(lot?.stockQuantity ?? part.stockQuantity) - numberOrZero(lot?.reservedQuantity ?? part.reservedQuantity);
    const now = new Date().toISOString();
    const requestId = randomId('PSR');
    const request = {
      id: requestId,
      status: 'PENDING',
      branchId,
      sourceWarehouseId,
      targetWarehouseId,
      targetCustodianUid: targetWarehouse.custodianUid || null,
      targetCustodianName: targetWarehouse.custodianName || null,
      partId,
      lotId,
      productMasterId: part.productMasterId || null,
      sku: part.sku || partId,
      partName: part.name || partId,
      category: part.category || 'KHAC',
      catalogGroupCode: part.catalogGroupCode || null,
      compatibleModels: Array.isArray(part.compatibleModels) ? part.compatibleModels : [],
      compatibleModelCodes: Array.isArray(part.compatibleModelCodes) ? part.compatibleModelCodes : [],
      compatibleModelIds: Array.isArray(part.compatibleModelIds) ? part.compatibleModelIds : [],
      quantityRequested: quantity,
      quantityApproved: 0,
      sourceAvailableSnapshot: Math.max(0, availableQuantity),
      workOrderId,
      workOrderLineId,
      workOrderCode: workOrder?.code || null,
      deviceId: workOrder?.deviceId || null,
      imei: workOrder?.imei || null,
      deviceModel: workOrder?.deviceModel || workOrder?.model || workOrder?.deviceSnapshot?.model || null,
      reason,
      requestedByUid: actor.uid,
      requestedByName: actor.name || null,
      requestedAt: now,
      createdAt: now,
      updatedAt: now
    };
    transaction.set(db.collection('technicalPartStockRequests').doc(requestId), request);
    if (lineRef && workOrderRef && line && workOrder) {
      const lineStatus = String(line.status || '');
      if (lineStatus !== 'WAITING_PARTS') {
        const transition = canTransitionTaskLine(lineStatus as any, 'WAITING_PARTS');
        if (!transition.allowed) throw new Error(transition.reason || 'TASK_WAITING_PARTS_TRANSITION_INVALID');
        transaction.update(lineRef, {
          status: 'WAITING_PARTS',
          partsWaitingAt: now,
          partsWaitingReason: reason,
          lastPartStockRequestId: requestId,
          updatedAt: now
        });
      }
      transaction.update(workOrderRef, {
        status: 'IN_PROGRESS',
        lastPartStockRequestId: requestId,
        updatedAt: now
      });
    }
    transaction.set(idemRef, { scope: 'PART_STOCK_REQUEST', requestId, createdAt: now });
    return { request };
  });
}

export async function processDecideTechnicalPartStockRequest(
  db: Firestore,
  requestId: string,
  input: { decision: 'APPROVED' | 'REJECTED'; quantityApproved?: number; note?: string; idempotencyKey: string },
  actor: TechnicalCostActor
): Promise<{ request: any; transferId?: string; idempotentReplay?: boolean }> {
  if (!isPartSupplyApprover(actor)) throw new Error('PART_STOCK_REQUEST_DECISION_FORBIDDEN');
  const key = assertIdempotencyKey(input.idempotencyKey);
  const decision = String(input.decision || '').toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new Error('PART_STOCK_REQUEST_DECISION_INVALID');
  const requestRef = db.collection('technicalPartStockRequests').doc(requestId);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`PART_STOCK_REQUEST_DECISION:${requestId}`, key));

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const replaySnap = await transaction.get(requestRef);
      if (!replaySnap.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { request: publicIssue(replaySnap.data()), transferId: String(idemSnap.data()?.transferId || '') || undefined, idempotentReplay: true };
    }
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists) throw new Error('PART_STOCK_REQUEST_NOT_FOUND');
    const request = requestSnap.data()!;
    if (!canAccessBranch(actor, String(request.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (String(request.status || '') !== 'PENDING') throw new Error('PART_STOCK_REQUEST_NOT_PENDING');
    const sourceWarehouseRef = db.collection('warehouses').doc(String(request.sourceWarehouseId));
    const targetWarehouseRef = db.collection('warehouses').doc(String(request.targetWarehouseId));
    const sourcePartRef = db.collection('spareParts').doc(String(request.partId));
    const sourceLotRef = request.lotId ? db.collection('sparePartLots').doc(String(request.lotId)) : null;
    const targetPartId = deterministicId('SP', `${request.branchId}:${request.targetWarehouseId}:${String(request.sku || '').toUpperCase()}`);
    const targetPartRef = db.collection('spareParts').doc(targetPartId);
    const targetLotCode = request.lotId ? `FROM-${String(request.lotId)}` : `TRANSFER-${requestId}`;
    const targetLotId = deterministicId('SPL', `${targetPartId}:${targetLotCode}`);
    const targetLotRef = db.collection('sparePartLots').doc(targetLotId);
    // All document reads are queued before mutations; this is required by
    // Firestore transaction semantics and prevents partially posted transfers.
    const [sourceWarehouseSnap, targetWarehouseSnap, sourcePartSnap, sourceLotSnap, targetPartSnap, targetLotSnap] = await Promise.all([
      transaction.get(sourceWarehouseRef),
      transaction.get(targetWarehouseRef),
      transaction.get(sourcePartRef),
      sourceLotRef ? transaction.get(sourceLotRef) : Promise.resolve(null),
      transaction.get(targetPartRef),
      transaction.get(targetLotRef)
    ]);
    const sourceWarehouse = sourceWarehouseSnap.exists ? sourceWarehouseSnap.data()! : null;
    const targetWarehouse = targetWarehouseSnap.exists ? targetWarehouseSnap.data()! : null;
    const sourcePart = sourcePartSnap.exists ? sourcePartSnap.data()! : null;
    const sourceLot = sourceLotSnap?.data();
    if (decision === 'APPROVED') {
      if (!sourceWarehouse || !targetWarehouse) throw new Error('PART_TRANSFER_WAREHOUSE_NOT_FOUND');
      if (!sourcePart || sourcePart.isActive === false) throw new Error('SPARE_PART_NOT_FOUND');
      if (sourceWarehouse.isActive === false || targetWarehouse.isActive === false || sourceWarehouse.isArchived || targetWarehouse.isArchived) throw new Error('PART_TRANSFER_WAREHOUSE_INACTIVE');
      if (String(sourceWarehouse.type || '') !== 'CENTRAL' || String(targetWarehouse.type || '') !== 'TECHNICIAN_SUB' || String(targetWarehouse.parentWarehouseId || '') !== String(request.sourceWarehouseId)) throw new Error('PART_TRANSFER_WAREHOUSE_HIERARCHY_INVALID');
      if (warehouseBranchId(sourceWarehouse) !== request.branchId || warehouseBranchId(targetWarehouse) !== request.branchId || String(sourcePart.warehouseId || '') !== String(request.sourceWarehouseId)) throw new Error('PART_TRANSFER_BRANCH_MISMATCH');
      if (sourceLot && (String(sourceLot.partId || '') !== String(request.partId) || String(sourceLot.warehouseId || '') !== String(request.sourceWarehouseId))) throw new Error('SPARE_PART_LOT_MISMATCH');
    }
    const now = new Date().toISOString();
    const note = String(input.note || '').trim();
    if (decision === 'REJECTED') {
      const rejected = { ...request, status: 'REJECTED', decidedByUid: actor.uid, decidedByName: actor.name || null, decidedAt: now, decisionNote: note, updatedAt: now };
      transaction.update(requestRef, rejected);
      transaction.set(idemRef, { scope: 'PART_STOCK_REQUEST_DECISION', requestId, createdAt: now });
      return { request: rejected };
    }
    const quantityApproved = positiveInteger(input.quantityApproved ?? request.quantityRequested, 'PART_STOCK_REQUEST_APPROVED_QUANTITY_INVALID');
    if (quantityApproved > numberOrZero(request.quantityRequested)) throw new Error('PART_STOCK_REQUEST_APPROVED_QUANTITY_EXCEEDS_REQUEST');
    const sourceStock = numberOrZero(sourceLot?.stockQuantity ?? sourcePart.stockQuantity);
    const sourceReserved = numberOrZero(sourceLot?.reservedQuantity ?? sourcePart.reservedQuantity);
    const aggregateStock = numberOrZero(sourcePart.stockQuantity);
    const aggregateReserved = numberOrZero(sourcePart.reservedQuantity);
    if (sourceStock - sourceReserved < quantityApproved || (sourceLotRef && aggregateStock - aggregateReserved < quantityApproved)) throw new Error('INSUFFICIENT_AVAILABLE_PARTS_STOCK');
    const unitCostSnapshot = numberOrZero(sourceLot?.unitCost ?? sourcePart.currentAverageCost ?? sourcePart.costPrice);
    if (unitCostSnapshot < 0) throw new Error('SPARE_PART_COST_INVALID');
    const targetPart = targetPartSnap.exists ? targetPartSnap.data()! : null;
    const targetLot = targetLotSnap.exists ? targetLotSnap.data()! : null;
    const targetStock = numberOrZero(targetPart?.stockQuantity);
    const targetAverage = numberOrZero(targetPart?.currentAverageCost ?? targetPart?.costPrice);
    const nextTargetStock = targetStock + quantityApproved;
    const nextTargetAverage = nextTargetStock > 0 ? Math.round((targetStock * targetAverage + quantityApproved * unitCostSnapshot) / nextTargetStock) : unitCostSnapshot;
    const targetLotStock = numberOrZero(targetLot?.stockQuantity);
    const nextTargetLotStock = targetLotStock + quantityApproved;
    const targetLotAverage = nextTargetLotStock > 0 ? Math.round((targetLotStock * numberOrZero(targetLot?.unitCost) + quantityApproved * unitCostSnapshot) / nextTargetLotStock) : unitCostSnapshot;
    const transferId = randomId('SPT');
    const sourceMovementId = randomId('SPM');
    const destinationMovementId = randomId('SPM');
    const costVersion = `PART_TRANSFER_${now}`;
    const nextTargetPart = {
      ...(targetPart || {}),
      id: targetPartId,
      productMasterId: request.productMasterId || sourcePart.productMasterId || targetPart?.productMasterId || null,
      sku: String(request.sku || sourcePart.sku || '').toUpperCase(),
      name: request.partName || sourcePart.name || request.partId,
      category: request.category || sourcePart.category || 'KHAC',
      catalogGroupCode: request.catalogGroupCode || sourcePart.catalogGroupCode || targetPart?.catalogGroupCode || null,
      catalogModelCode: sourcePart.catalogModelCode || targetPart?.catalogModelCode || null,
      branchId: request.branchId,
      warehouseId: request.targetWarehouseId,
      stockQuantity: nextTargetStock,
      reservedQuantity: numberOrZero(targetPart?.reservedQuantity),
      currentAverageCost: nextTargetAverage,
      costPrice: nextTargetAverage,
      costVersion,
      compatibleModels: Array.isArray(targetPart?.compatibleModels) && targetPart.compatibleModels.length ? targetPart.compatibleModels : (request.compatibleModels || sourcePart.compatibleModels || []),
      compatibleModelCodes: Array.isArray(targetPart?.compatibleModelCodes) && targetPart.compatibleModelCodes.length
        ? targetPart.compatibleModelCodes
        : (sourcePart.compatibleModelCodes || (request.compatibleModels || sourcePart.compatibleModels || []).map(canonicalIphoneModelCode).filter(Boolean)),
      compatibleModelIds: Array.isArray(targetPart?.compatibleModelIds) && targetPart.compatibleModelIds.length
        ? targetPart.compatibleModelIds
        : (sourcePart.compatibleModelIds || []),
      isActive: targetPart?.isActive !== false,
      createdAt: targetPart?.createdAt || now,
      updatedAt: now
    };
    const nextTargetLot = {
      ...(targetLot || {}),
      id: targetLotId,
      lotCode: targetLotCode,
      partId: targetPartId,
      productMasterId: request.productMasterId || sourcePart.productMasterId || targetLot?.productMasterId || null,
      sku: nextTargetPart.sku,
      branchId: request.branchId,
      warehouseId: request.targetWarehouseId,
      supplierId: sourceLot?.supplierId || targetLot?.supplierId || null,
      sourceType: 'PART_TRANSFER',
      sourceId: transferId,
      sourceCode: requestId,
      stockQuantity: nextTargetLotStock,
      reservedQuantity: numberOrZero(targetLot?.reservedQuantity),
      unitCost: targetLotAverage,
      costVersion,
      receivedAt: now,
      createdAt: targetLot?.createdAt || now,
      updatedAt: now
    };
    transaction.update(sourcePartRef, { stockQuantity: aggregateStock - quantityApproved, updatedAt: now });
    if (sourceLotRef) transaction.update(sourceLotRef, { stockQuantity: sourceStock - quantityApproved, updatedAt: now });
    transaction.set(targetPartRef, nextTargetPart);
    transaction.set(targetLotRef, nextTargetLot);
    const fulfilled = {
      ...request,
      status: 'FULFILLED',
      quantityApproved,
      transferId,
      targetPartId,
      targetLotId,
      unitCostSnapshot,
      decidedByUid: actor.uid,
      decidedByName: actor.name || null,
      decidedAt: now,
      fulfilledAt: now,
      decisionNote: note,
      updatedAt: now
    };
    transaction.update(requestRef, fulfilled);
    transaction.set(db.collection('sparePartTransfers').doc(transferId), {
      id: transferId,
      requestId,
      branchId: request.branchId,
      sourceWarehouseId: request.sourceWarehouseId,
      targetWarehouseId: request.targetWarehouseId,
      sourcePartId: request.partId,
      sourceLotId: request.lotId || null,
      targetPartId,
      targetLotId,
      productMasterId: request.productMasterId || sourcePart.productMasterId || null,
      sku: nextTargetPart.sku,
      partName: nextTargetPart.name,
      catalogGroupCode: request.catalogGroupCode || sourcePart.catalogGroupCode || null,
      quantity: quantityApproved,
      workOrderId: request.workOrderId || null,
      workOrderLineId: request.workOrderLineId || null,
      workOrderCode: request.workOrderCode || null,
      deviceId: request.deviceId || null,
      imei: request.imei || null,
      deviceModel: request.deviceModel || null,
      unitCostSnapshot,
      totalCost: quantityApproved * unitCostSnapshot,
      approvedByUid: actor.uid,
      approvedAt: now,
      createdAt: now
    });
    transaction.set(db.collection('sparePartMovements').doc(sourceMovementId), {
      id: sourceMovementId, movementType: 'TRANSFER_OUT', branchId: request.branchId,
      warehouseId: request.sourceWarehouseId, counterpartyWarehouseId: request.targetWarehouseId,
      partId: request.partId, lotId: request.lotId || null, quantity: quantityApproved,
      productMasterId: request.productMasterId || sourcePart.productMasterId || null,
      sku: nextTargetPart.sku,
      workOrderId: request.workOrderId || null,
      workOrderLineId: request.workOrderLineId || null,
      workOrderCode: request.workOrderCode || null,
      deviceId: request.deviceId || null,
      imei: request.imei || null,
      unitCostSnapshot, sourceType: 'PART_STOCK_REQUEST', sourceId: requestId, transferId,
      actorUid: actor.uid, occurredAt: now, createdAt: now
    });
    transaction.set(db.collection('sparePartMovements').doc(destinationMovementId), {
      id: destinationMovementId, movementType: 'TRANSFER_IN', branchId: request.branchId,
      warehouseId: request.targetWarehouseId, counterpartyWarehouseId: request.sourceWarehouseId,
      partId: targetPartId, lotId: targetLotId, quantity: quantityApproved,
      productMasterId: request.productMasterId || sourcePart.productMasterId || null,
      sku: nextTargetPart.sku,
      workOrderId: request.workOrderId || null,
      workOrderLineId: request.workOrderLineId || null,
      workOrderCode: request.workOrderCode || null,
      deviceId: request.deviceId || null,
      imei: request.imei || null,
      unitCostSnapshot, sourceType: 'PART_STOCK_REQUEST', sourceId: requestId, transferId,
      actorUid: actor.uid, occurredAt: now, createdAt: now
    });
    transaction.set(idemRef, { scope: 'PART_STOCK_REQUEST_DECISION', requestId, transferId, createdAt: now });
    return { request: fulfilled, transferId };
  });
}

export async function listTechnicalPartStockRequests(db: Firestore, actor: TechnicalCostActor, status?: string): Promise<any[]> {
  const snapshot = await db.collection('technicalPartStockRequests').limit(300).get();
  const role = normalizedRole(actor);
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as any))
    .filter(request => canAccessBranch(actor, String(request.branchId || '')))
    .filter(request => role === 'ADMIN' || role === 'REGIONAL_MANAGER' || isPartSupplyApprover(actor) || String(request.targetCustodianUid || '') === actor.uid || String(request.targetWarehouseCustodianUid || '') === actor.uid || String(request.requestedByUid || '') === actor.uid)
    .filter(request => !status || String(request.status || '') === status)
    .sort((left, right) => String(right.requestedAt || right.createdAt || '').localeCompare(String(left.requestedAt || left.createdAt || '')));
}

/**
 * Read-only evidence for one physical part balance.  Each movement retains a
 * work-order and IMEI snapshot when it came from a repair, so a stock count
 * can always be traced back without relying on a mutable work-order screen.
 */
export async function getTechnicalSparePartTrace(db: Firestore, partId: string, actor: TechnicalCostActor): Promise<any> {
  const normalizedPartId = String(partId || '').trim();
  if (!normalizedPartId) throw new Error('SPARE_PART_NOT_FOUND');
  const partSnap = await db.collection('spareParts').doc(normalizedPartId).get();
  if (!partSnap.exists) throw new Error('SPARE_PART_NOT_FOUND');
  const part = { id: partSnap.id, ...partSnap.data() } as any;
  if (!canAccessBranch(actor, String(part.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');

  const [lotsSnap, receiptsSnap, movementsSnap] = await Promise.all([
    db.collection('sparePartLots').where('partId', '==', normalizedPartId).get(),
    db.collection('sparePartReceipts').where('partId', '==', normalizedPartId).get(),
    db.collection('sparePartMovements').where('partId', '==', normalizedPartId).get()
  ]);
  const visible = (value: any) => {
    const next = publicIssue(value);
    if (!canViewTechnicalCost(actor)) {
      delete next.unitCost;
      delete next.unitCostSnapshot;
      delete next.totalCost;
      delete next.currentAverageCost;
      delete next.costPrice;
    }
    return next;
  };
  const byNewest = (left: any, right: any) => String(right.occurredAt || right.receivedAt || right.createdAt || '')
    .localeCompare(String(left.occurredAt || left.receivedAt || left.createdAt || ''));
  return {
    part: visible(part),
    lots: lotsSnap.docs.map((doc: any) => visible({ id: doc.id, ...doc.data() })).sort(byNewest),
    receipts: receiptsSnap.docs.map((doc: any) => visible({ id: doc.id, ...doc.data() })).sort(byNewest),
    movements: movementsSnap.docs.map((doc: any) => visible({ id: doc.id, ...doc.data() })).sort(byNewest).slice(0, 80)
  };
}

export async function processCreateTechnicalPartException(
  db: Firestore,
  workOrderId: string,
  input: { lineId: string; partId: string; warehouseId: string; lotId?: string; quantity: number; reason: string; idempotencyKey: string },
  actor: TechnicalCostActor
): Promise<{ exception: any; idempotentReplay?: boolean }> {
  const key = assertIdempotencyKey(input.idempotencyKey);
  const quantity = positiveInteger(input.quantity);
  const reason = String(input.reason || '').trim();
  if (!input.lineId || !input.partId || !input.warehouseId || reason.length < 5) throw new Error('PART_EXCEPTION_FIELDS_REQUIRED');
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`PART_EXCEPTION:${workOrderId}`, key));
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const lineRef = db.collection('technicalWorkOrderLines').doc(input.lineId);
  const partRef = db.collection('spareParts').doc(input.partId);
  const warehouseRef = db.collection('warehouses').doc(input.warehouseId);
  const lotRef = input.lotId ? db.collection('sparePartLots').doc(input.lotId) : null;
  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const exceptionSnap = await transaction.get(db.collection('technicalPartExceptions').doc(String(idemSnap.data()?.exceptionId || '')));
      if (!exceptionSnap.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { exception: publicIssue(exceptionSnap.data()), idempotentReplay: true };
    }
    const [woSnap, lineSnap, partSnap, warehouseSnap, lotSnap] = await Promise.all([
      transaction.get(woRef), transaction.get(lineRef), transaction.get(partRef), transaction.get(warehouseRef), lotRef ? transaction.get(lotRef) : Promise.resolve(null)
    ]);
    if (!woSnap.exists || !lineSnap.exists || !partSnap.exists || !warehouseSnap.exists || (lotRef && !lotSnap?.exists)) throw new Error('PART_EXCEPTION_REFERENCE_NOT_FOUND');
    const workOrder = woSnap.data()!;
    const line = lineSnap.data()!;
    const part = partSnap.data()!;
    const warehouse = warehouseSnap.data()!;
    const lot = lotSnap?.data();
    if (line.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (!isElevated(actor) && line.assigneeUid !== actor.uid) throw new Error('TECHNICIAN_NOT_ASSIGNED');
    if (!ACTIVE_PART_WORK_ORDER_STATUSES.has(String(workOrder.status)) || !ACTIVE_PART_LINE_STATUSES.has(String(line.status))) throw new Error('TASK_NOT_OPEN_FOR_PARTS');
    if (warehouseBranchId(warehouse) !== String(workOrder.branchId) || warehouse.isActive === false) throw new Error('PART_WAREHOUSE_BRANCH_MISMATCH');
    assertTechnicianUsesOwnWarehouse(actor, warehouse);
    if (String(part.warehouseId || '') !== String(input.warehouseId) || String(part.branchId || '') !== String(workOrder.branchId)) throw new Error('SPARE_PART_WAREHOUSE_MISMATCH');
    if (lot && (String(lot.partId || '') !== String(input.partId) || String(lot.warehouseId || '') !== String(input.warehouseId))) throw new Error('SPARE_PART_LOT_MISMATCH');
    // An exception can approve a different task category, never a different
    // device model.  That keeps a screen for 12 Pro Max from being used on a
    // different model by mistake.
    assertTaskPartModelCompatibility(workOrder, line, part);
    if (matchingTaskTemplate(line, { ...part, id: partSnap.id || input.partId })) throw new Error('PART_ALREADY_ALLOWED_BY_TASK');
    const now = new Date().toISOString();
    const exceptionId = randomId('TPE');
    const exception = {
      id: exceptionId,
      status: 'PENDING',
      workOrderId,
      workOrderLineId: input.lineId,
      deviceId: workOrder.deviceId || null,
      imei: workOrder.imei || null,
      branchId: workOrder.branchId,
      partId: input.partId,
      sku: part.sku || input.partId,
      partName: part.name || input.partId,
      category: part.category || 'KHAC',
      warehouseId: input.warehouseId,
      lotId: input.lotId || null,
      quantityRequested: quantity,
      quantityApproved: 0,
      quantityIssued: 0,
      taskPartRulesSnapshot: taskPartTemplates(line),
      reason,
      requestedByUid: actor.uid,
      requestedByName: actor.name || null,
      requestedAt: now,
      createdAt: now,
      updatedAt: now
    };
    transaction.set(db.collection('technicalPartExceptions').doc(exceptionId), exception);
    transaction.set(idemRef, { scope: 'PART_EXCEPTION', workOrderId, exceptionId, createdAt: now });
    return { exception };
  });
}

export async function processDecideTechnicalPartException(
  db: Firestore,
  workOrderId: string,
  exceptionId: string,
  input: { decision: 'APPROVED' | 'REJECTED'; quantityApproved?: number; note?: string; idempotencyKey: string },
  actor: TechnicalCostActor
): Promise<{ exception: any; idempotentReplay?: boolean }> {
  if (!isPartStockApprover(actor)) throw new Error('PART_EXCEPTION_DECISION_FORBIDDEN');
  const key = assertIdempotencyKey(input.idempotencyKey);
  const decision = String(input.decision || '').toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new Error('PART_EXCEPTION_DECISION_INVALID');
  const exceptionRef = db.collection('technicalPartExceptions').doc(exceptionId);
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`PART_EXCEPTION_DECISION:${exceptionId}`, key));
  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const replaySnap = await transaction.get(exceptionRef);
      if (!replaySnap.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { exception: publicIssue(replaySnap.data()), idempotentReplay: true };
    }
    const [exceptionSnap, woSnap] = await Promise.all([transaction.get(exceptionRef), transaction.get(woRef)]);
    if (!exceptionSnap.exists || !woSnap.exists) throw new Error('PART_EXCEPTION_REFERENCE_NOT_FOUND');
    const exception = exceptionSnap.data()!;
    const workOrder = woSnap.data()!;
    if (exception.workOrderId !== workOrderId || String(exception.branchId || '') !== String(workOrder.branchId || '')) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (String(exception.status || '') !== 'PENDING') throw new Error('PART_EXCEPTION_NOT_PENDING');
    const now = new Date().toISOString();
    const quantityApproved = decision === 'APPROVED'
      ? positiveInteger(input.quantityApproved ?? exception.quantityRequested, 'PART_EXCEPTION_APPROVED_QUANTITY_INVALID')
      : 0;
    if (quantityApproved > numberOrZero(exception.quantityRequested)) throw new Error('PART_EXCEPTION_APPROVED_QUANTITY_EXCEEDS_REQUEST');
    const updated = {
      ...exception,
      status: decision,
      quantityApproved,
      decidedByUid: actor.uid,
      decidedByName: actor.name || null,
      decidedAt: now,
      decisionNote: String(input.note || '').trim(),
      // Exception authority is intentionally short-lived and single-purpose.
      expiresAt: decision === 'APPROVED' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
      updatedAt: now
    };
    transaction.update(exceptionRef, updated);
    transaction.set(idemRef, { scope: 'PART_EXCEPTION_DECISION', workOrderId, exceptionId, createdAt: now });
    return { exception: updated };
  });
}

export async function processReserveTechnicalPart(
  db: Firestore,
  workOrderId: string,
  input: {
    lineId: string;
    partId: string;
    warehouseId: string;
    lotId?: string;
    quantity: number;
    idempotencyKey: string;
  },
  actor: TechnicalCostActor
): Promise<{ reservation: any; availableQuantity: number; idempotentReplay?: boolean }> {
  const quantity = positiveInteger(input.quantity);
  const key = assertIdempotencyKey(input.idempotencyKey);
  if (!input.lineId || !input.partId || !input.warehouseId) throw new Error('PART_RESERVATION_FIELDS_REQUIRED');
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`PART_RESERVE:${workOrderId}`, key));
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const lineRef = db.collection('technicalWorkOrderLines').doc(input.lineId);
  const partRef = db.collection('spareParts').doc(input.partId);
  const warehouseRef = db.collection('warehouses').doc(input.warehouseId);
  const lotRef = input.lotId ? db.collection('sparePartLots').doc(input.lotId) : null;
  const lineIssuesQuery = db.collection('technicalPartIssues').where('workOrderLineId', '==', input.lineId);
  const lineReservationsQuery = db.collection('technicalPartReservations').where('workOrderLineId', '==', input.lineId);
  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const reservationSnap = await transaction.get(db.collection('technicalPartReservations').doc(String(idemSnap.data()?.reservationId || '')));
      if (!reservationSnap.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { reservation: publicIssue(reservationSnap.data()), availableQuantity: Number(idemSnap.data()?.availableQuantity || 0), idempotentReplay: true };
    }
    const [woSnap, lineSnap, partSnap, warehouseSnap, lotSnap, lineIssuesSnap, lineReservationsSnap] = await Promise.all([
      transaction.get(woRef),
      transaction.get(lineRef),
      transaction.get(partRef),
      transaction.get(warehouseRef),
      lotRef ? transaction.get(lotRef) : Promise.resolve(null),
      transaction.get(lineIssuesQuery),
      transaction.get(lineReservationsQuery)
    ]);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    if (!lineSnap.exists) throw new Error('LINE_NOT_FOUND');
    if (!partSnap.exists) throw new Error('SPARE_PART_NOT_FOUND');
    if (!warehouseSnap.exists) throw new Error('PART_WAREHOUSE_NOT_FOUND');
    if (lotRef && !lotSnap?.exists) throw new Error('SPARE_PART_LOT_NOT_FOUND');
    const workOrder = woSnap.data()!;
    const line = lineSnap.data()!;
    const part = partSnap.data()!;
    const warehouse = warehouseSnap.data()!;
    const lot = lotSnap?.data();
    if (workOrder.activeHandoffId) throw new Error('TECH_HANDOFF_PENDING');
    if (line.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(workOrder.branchId || line.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (!isElevated(actor) && line.assigneeUid !== actor.uid) throw new Error('TECHNICIAN_NOT_ASSIGNED');
    if (!ACTIVE_PART_WORK_ORDER_STATUSES.has(String(workOrder.status))) throw new Error('WORK_ORDER_NOT_OPEN_FOR_PARTS');
    if (!ACTIVE_PART_LINE_STATUSES.has(String(line.status))) throw new Error('TASK_NOT_OPEN_FOR_PARTS');
    if (warehouse.isActive === false || warehouseBranchId(warehouse) !== String(workOrder.branchId)) throw new Error('PART_WAREHOUSE_BRANCH_MISMATCH');
    assertTechnicianUsesOwnWarehouse(actor, warehouse);
    if (part.branchId && part.branchId !== workOrder.branchId) throw new Error('SPARE_PART_BRANCH_MISMATCH');
    if (part.warehouseId && part.warehouseId !== input.warehouseId) throw new Error('SPARE_PART_WAREHOUSE_MISMATCH');
    if (lot && (lot.partId !== input.partId || lot.warehouseId !== input.warehouseId)) throw new Error('SPARE_PART_LOT_MISMATCH');
    const taskTemplate = matchingTaskTemplate(line, { ...part, id: partSnap.id || input.partId });
    if (!taskTemplate) {
      throw new Error(taskPartTemplates(line).length === 0 ? 'TASK_PART_POLICY_NOT_CONFIGURED' : 'TASK_PART_NOT_ALLOWED');
    }
    assertTaskPartModelCompatibility(workOrder, line, part);
    const maxQuantity = Number(taskTemplate.maxQuantity ?? taskTemplate.quantity ?? 0);
    if (Number.isFinite(maxQuantity) && maxQuantity > 0) {
      const issuedQuantity = lineIssuesSnap.docs.reduce((sum: number, doc: any) => {
        const issue = doc.data();
        return issue?.status === 'CANCELLED' || String(issue?.partId || '') !== input.partId ? sum : sum + numberOrZero(issue?.quantityIssued);
      }, 0);
      const reservedQuantityForTask = lineReservationsSnap.docs.reduce((sum: number, doc: any) => {
        const reservation = doc.data();
        if (String(reservation?.partId || '') !== input.partId || ['FULFILLED', 'CANCELLED'].includes(String(reservation?.status || ''))) return sum;
        return sum + Math.max(0, numberOrZero(reservation?.quantityReserved) - numberOrZero(reservation?.quantityIssued) - numberOrZero(reservation?.quantityCancelled));
      }, 0);
      if (issuedQuantity + reservedQuantityForTask + quantity > maxQuantity) throw new Error('TASK_PART_QUANTITY_LIMIT_EXCEEDED');
    }
    const stockQuantity = numberOrZero(lot?.stockQuantity ?? part.stockQuantity);
    const reservedQuantity = numberOrZero(lot?.reservedQuantity ?? part.reservedQuantity);
    const aggregateStock = numberOrZero(part.stockQuantity);
    const aggregateReserved = numberOrZero(part.reservedQuantity);
    if (!Number.isInteger(stockQuantity) || stockQuantity - reservedQuantity < quantity) throw new Error('INSUFFICIENT_AVAILABLE_PARTS_STOCK');
    if (lotRef && (!Number.isInteger(aggregateStock) || aggregateStock - aggregateReserved < quantity)) throw new Error('INSUFFICIENT_AVAILABLE_PARTS_STOCK');
    const now = new Date().toISOString();
    const reservationId = randomId('TPR');
    const movementId = randomId('SPM');
    const reservation = {
      id: reservationId,
      workOrderId,
      workOrderLineId: input.lineId,
      workOrderCode: workOrder.code || null,
      deviceId: workOrder.deviceId || null,
      imei: workOrder.imei,
      branchId: workOrder.branchId,
      warehouseId: input.warehouseId,
      partId: input.partId,
      productMasterId: part.productMasterId || null,
      sku: part.sku || input.partId,
      partName: part.name || input.partId,
      lotId: input.lotId || null,
      quantityReserved: quantity,
      quantityIssued: 0,
      quantityCancelled: 0,
      reservedForUid: line.assigneeUid,
      reservedByUid: actor.uid,
      reservedAt: now,
      status: 'RESERVED' as TechnicalPartReservationStatus,
      createdAt: now,
      updatedAt: now
    };
    if (lotRef) {
      transaction.update(lotRef, { reservedQuantity: reservedQuantity + quantity, updatedAt: now });
      transaction.update(partRef, { reservedQuantity: aggregateReserved + quantity, updatedAt: now });
    } else {
      transaction.update(partRef, { reservedQuantity: reservedQuantity + quantity, updatedAt: now });
    }
    transaction.set(db.collection('technicalPartReservations').doc(reservationId), reservation);
    transaction.set(db.collection('sparePartMovements').doc(movementId), {
      id: movementId,
      movementType: 'RESERVE',
      partId: input.partId,
      lotId: input.lotId || null,
      warehouseId: input.warehouseId,
      branchId: workOrder.branchId,
      quantity,
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      reservationId,
      workOrderLineId: input.lineId,
      workOrderCode: workOrder.code || null,
      deviceId: workOrder.deviceId || null,
      imei: workOrder.imei || null,
      productMasterId: part.productMasterId || null,
      sku: part.sku || input.partId,
      actorUid: actor.uid,
      occurredAt: now,
      createdAt: now
    });
    const availableQuantity = stockQuantity - reservedQuantity - quantity;
    transaction.set(idemRef, { scope: 'PART_RESERVE', workOrderId, reservationId, availableQuantity, createdAt: now });
    return { reservation, availableQuantity };
  });
}

export async function processCancelTechnicalPartReservation(
  db: Firestore,
  workOrderId: string,
  reservationId: string,
  input: { reason: string; idempotencyKey: string },
  actor: TechnicalCostActor
): Promise<{ reservation: any; releasedQuantity: number; idempotentReplay?: boolean }> {
  const reason = String(input.reason || '').trim();
  if (reason.length < 5) throw new Error('PART_RESERVATION_CANCELLATION_REASON_REQUIRED');
  const key = assertIdempotencyKey(input.idempotencyKey);
  const reservationRef = db.collection('technicalPartReservations').doc(reservationId);
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`PART_RESERVATION_CANCEL:${reservationId}`, key));
  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const replay = await transaction.get(reservationRef);
      if (!replay.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { reservation: publicIssue(replay.data()), releasedQuantity: Number(idemSnap.data()?.releasedQuantity || 0), idempotentReplay: true };
    }
    const [reservationSnap, woSnap] = await Promise.all([
      transaction.get(reservationRef),
      transaction.get(woRef)
    ]);
    if (!reservationSnap.exists) throw new Error('PART_RESERVATION_NOT_FOUND');
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const reservation = reservationSnap.data()!;
    if (reservation.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(reservation.branchId || woSnap.data()?.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (!isElevated(actor) && reservation.reservedForUid !== actor.uid && reservation.reservedByUid !== actor.uid) throw new Error('TECHNICIAN_NOT_ASSIGNED');
    const releasedQuantity = numberOrZero(reservation.quantityReserved)
      - numberOrZero(reservation.quantityIssued)
      - numberOrZero(reservation.quantityCancelled);
    if (releasedQuantity <= 0 || ['FULFILLED', 'CANCELLED'].includes(String(reservation.status || ''))) {
      return { reservation: publicIssue(reservation), releasedQuantity: 0, idempotentReplay: true };
    }
    const partRef = db.collection('spareParts').doc(String(reservation.partId));
    const lotRef = reservation.lotId ? db.collection('sparePartLots').doc(String(reservation.lotId)) : null;
    const [partSnap, lotSnap] = await Promise.all([
      transaction.get(partRef),
      lotRef ? transaction.get(lotRef) : Promise.resolve(null)
    ]);
    if (!partSnap.exists || (lotRef && !lotSnap?.exists)) throw new Error('SPARE_PART_STOCK_RECORD_NOT_FOUND');
    const part = partSnap.data()!;
    const lot = lotSnap?.data();
    const partReserved = numberOrZero(part.reservedQuantity);
    const lotReserved = numberOrZero(lot?.reservedQuantity);
    if (partReserved < releasedQuantity || (lotRef && lotReserved < releasedQuantity)) throw new Error('SPARE_PART_RESERVED_BALANCE_MISMATCH');
    const now = new Date().toISOString();
    const movementId = randomId('SPM');
    if (lotRef) {
      transaction.update(lotRef, { reservedQuantity: lotReserved - releasedQuantity, updatedAt: now });
    }
    transaction.update(partRef, { reservedQuantity: partReserved - releasedQuantity, updatedAt: now });
    const updatedReservation = {
      ...reservation,
      quantityCancelled: numberOrZero(reservation.quantityCancelled) + releasedQuantity,
      status: 'CANCELLED' as TechnicalPartReservationStatus,
      cancellationReason: reason,
      cancelledByUid: actor.uid,
      cancelledAt: now,
      updatedAt: now
    };
    transaction.update(reservationRef, {
      quantityCancelled: updatedReservation.quantityCancelled,
      status: updatedReservation.status,
      cancellationReason: reason,
      cancelledByUid: actor.uid,
      cancelledAt: now,
      updatedAt: now
    });
    transaction.set(db.collection('sparePartMovements').doc(movementId), {
      id: movementId,
      movementType: 'RELEASE_RESERVATION',
      partId: reservation.partId,
      lotId: reservation.lotId || null,
      warehouseId: reservation.warehouseId,
      branchId: reservation.branchId,
      quantity: releasedQuantity,
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      reservationId,
      workOrderLineId: reservation.workOrderLineId || null,
      workOrderCode: woSnap.data()?.code || null,
      deviceId: reservation.deviceId || null,
      imei: reservation.imei || null,
      productMasterId: part.productMasterId || null,
      sku: part.sku || reservation.partId,
      actorUid: actor.uid,
      reason,
      occurredAt: now,
      createdAt: now
    });
    transaction.set(idemRef, { scope: 'PART_RESERVATION_CANCEL', workOrderId, reservationId, releasedQuantity, createdAt: now });
    return { reservation: updatedReservation, releasedQuantity };
  });
}

export async function processIssueTechnicalPart(
  db: Firestore,
  workOrderId: string,
  input: {
    lineId: string;
    partId: string;
    warehouseId: string;
    lotId?: string;
    reservationId?: string;
    exceptionApprovalId?: string;
    quantity: number;
    idempotencyKey: string;
  },
  actor: TechnicalCostActor
): Promise<{ issue: any; remainingStock: number; idempotentReplay?: boolean }> {
  const quantity = positiveInteger(input.quantity);
  const key = assertIdempotencyKey(input.idempotencyKey);
  if (!input.lineId || !input.partId || !input.warehouseId) throw new Error('PART_ISSUE_FIELDS_REQUIRED');

  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`PART_ISSUE:${workOrderId}`, key));
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const lineRef = db.collection('technicalWorkOrderLines').doc(input.lineId);
  const partRef = db.collection('spareParts').doc(input.partId);
  const warehouseRef = db.collection('warehouses').doc(input.warehouseId);
  const lotRef = input.lotId ? db.collection('sparePartLots').doc(input.lotId) : null;
  const reservationRef = input.reservationId ? db.collection('technicalPartReservations').doc(input.reservationId) : null;
  const exceptionRef = input.exceptionApprovalId ? db.collection('technicalPartExceptions').doc(input.exceptionApprovalId) : null;
  const lineIssuesQuery = db.collection('technicalPartIssues').where('workOrderLineId', '==', input.lineId);
  const lineReservationsQuery = db.collection('technicalPartReservations').where('workOrderLineId', '==', input.lineId);

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const idem = idemSnap.data()!;
      const issueSnap = await transaction.get(db.collection('technicalPartIssues').doc(idem.issueId));
      if (!issueSnap.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { issue: visiblePartIssue(issueSnap.data(), actor), remainingStock: Number(idem.remainingStock), idempotentReplay: true };
    }

    // Keep every read ahead of every write. Firestore transactions reject a
    // late read after a mutation and this is a financial/cost posting path.
    const [woSnap, lineSnap, partSnap, warehouseSnap, lotSnap, reservationSnap, exceptionSnap, lineIssuesSnap, lineReservationsSnap] = await Promise.all([
      transaction.get(woRef),
      transaction.get(lineRef),
      transaction.get(partRef),
      transaction.get(warehouseRef),
      lotRef ? transaction.get(lotRef) : Promise.resolve(null),
      reservationRef ? transaction.get(reservationRef) : Promise.resolve(null),
      exceptionRef ? transaction.get(exceptionRef) : Promise.resolve(null),
      transaction.get(lineIssuesQuery),
      transaction.get(lineReservationsQuery)
    ]);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    if (!lineSnap.exists) throw new Error('LINE_NOT_FOUND');
    if (!partSnap.exists) throw new Error('SPARE_PART_NOT_FOUND');
    if (!warehouseSnap.exists) throw new Error('PART_WAREHOUSE_NOT_FOUND');
    if (lotRef && !lotSnap?.exists) throw new Error('SPARE_PART_LOT_NOT_FOUND');
    if (reservationRef && !reservationSnap?.exists) throw new Error('PART_RESERVATION_NOT_FOUND');

    const workOrder = woSnap.data()!;
    const line = lineSnap.data()!;
    const part = partSnap.data()!;
    const warehouse = warehouseSnap.data()!;
    const lot = lotSnap?.data();
    const reservation = reservationSnap?.data();
    if (workOrder.activeHandoffId) throw new Error('TECH_HANDOFF_PENDING');
    if (line.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(workOrder.branchId || line.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (!isElevated(actor) && line.assigneeUid !== actor.uid) throw new Error('TECHNICIAN_NOT_ASSIGNED');
    if (!ACTIVE_PART_WORK_ORDER_STATUSES.has(String(workOrder.status))) throw new Error('WORK_ORDER_NOT_OPEN_FOR_PARTS');
    if (!ACTIVE_PART_LINE_STATUSES.has(String(line.status))) throw new Error('TASK_NOT_OPEN_FOR_PARTS');
    if (warehouse.isActive === false || warehouseBranchId(warehouse) !== String(workOrder.branchId)) throw new Error('PART_WAREHOUSE_BRANCH_MISMATCH');
    assertTechnicianUsesOwnWarehouse(actor, warehouse);
    if (part.branchId && part.branchId !== workOrder.branchId) throw new Error('SPARE_PART_BRANCH_MISMATCH');
    if (part.warehouseId && part.warehouseId !== input.warehouseId) throw new Error('SPARE_PART_WAREHOUSE_MISMATCH');
    if (lot && (lot.partId !== input.partId || (lot.warehouseId && lot.warehouseId !== input.warehouseId))) throw new Error('SPARE_PART_LOT_MISMATCH');
    if (reservation && (
      reservation.workOrderId !== workOrderId
      || reservation.workOrderLineId !== input.lineId
      || reservation.partId !== input.partId
      || reservation.warehouseId !== input.warehouseId
      || String(reservation.lotId || '') !== String(input.lotId || '')
      || !['RESERVED', 'PARTIALLY_ISSUED'].includes(String(reservation.status || ''))
    )) throw new Error('PART_RESERVATION_MISMATCH');

    // Model compatibility is non-negotiable.  A task-category exception is
    // intentionally narrower and cannot turn a wrong-model part into a
    // usable one.
    assertTaskPartModelCompatibility(workOrder, line, part);

    const taskTemplate = matchingTaskTemplate(line, { ...part, id: partSnap.id || input.partId });
    const partException = exceptionSnap?.data();
    if (!taskTemplate) {
      if (!exceptionRef || !exceptionSnap?.exists) throw new Error('TASK_PART_EXCEPTION_APPROVAL_REQUIRED');
      const expiresAt = String(partException?.expiresAt || '');
      const approvedRemaining = numberOrZero(partException?.quantityApproved) - numberOrZero(partException?.quantityIssued);
      if (
        partException?.status !== 'APPROVED'
        || partException?.workOrderId !== workOrderId
        || partException?.workOrderLineId !== input.lineId
        || partException?.partId !== input.partId
        || partException?.warehouseId !== input.warehouseId
        || String(partException?.lotId || '') !== String(input.lotId || '')
        || (expiresAt && expiresAt <= new Date().toISOString())
        || approvedRemaining < quantity
      ) throw new Error('TASK_PART_EXCEPTION_NOT_APPROVED');
    } else {
      const maxQuantity = Number(taskTemplate.maxQuantity ?? taskTemplate.quantity ?? 0);
      if (Number.isFinite(maxQuantity) && maxQuantity > 0) {
        const issuedQuantity = lineIssuesSnap.docs.reduce((sum: number, doc: any) => {
          const issue = doc.data();
          return issue?.status === 'CANCELLED' || String(issue?.partId || '') !== input.partId ? sum : sum + numberOrZero(issue?.quantityIssued);
        }, 0);
        const reservedQuantityForTask = lineReservationsSnap.docs.reduce((sum: number, doc: any) => {
          const reserved = doc.data();
          if (String(reserved?.partId || '') !== input.partId || ['FULFILLED', 'CANCELLED'].includes(String(reserved?.status || ''))) return sum;
          return sum + Math.max(0, numberOrZero(reserved?.quantityReserved) - numberOrZero(reserved?.quantityIssued) - numberOrZero(reserved?.quantityCancelled));
        }, 0);
        const addedQuantity = reservation ? 0 : quantity;
        if (issuedQuantity + reservedQuantityForTask + addedQuantity > maxQuantity) throw new Error('TASK_PART_QUANTITY_LIMIT_EXCEEDED');
      }
    }

    const stockQuantity = numberOrZero(lot?.stockQuantity ?? part.stockQuantity);
    const reservedQuantity = numberOrZero(lot?.reservedQuantity ?? part.reservedQuantity);
    const aggregateStockQuantity = numberOrZero(part.stockQuantity);
    const aggregateReservedQuantity = numberOrZero(part.reservedQuantity);
    const reservationOutstanding = reservation
      ? numberOrZero(reservation.quantityReserved) - numberOrZero(reservation.quantityIssued) - numberOrZero(reservation.quantityCancelled)
      : 0;
    if (reservation && reservationOutstanding < quantity) throw new Error('PART_ISSUE_EXCEEDS_RESERVATION');
    if (reservation && (reservedQuantity < quantity || (lotRef && aggregateReservedQuantity < quantity))) {
      throw new Error('SPARE_PART_RESERVED_BALANCE_MISMATCH');
    }
    const stockAvailable = reservation ? stockQuantity : stockQuantity - reservedQuantity;
    const aggregateAvailable = reservation ? aggregateStockQuantity : aggregateStockQuantity - aggregateReservedQuantity;
    if (!Number.isInteger(stockQuantity) || stockAvailable < quantity || (lotRef && (!Number.isInteger(aggregateStockQuantity) || aggregateAvailable < quantity))) throw new Error('INSUFFICIENT_PARTS_STOCK');
    const unitCostSnapshot = numberOrZero(lot?.unitCost ?? lot?.costPrice ?? part.currentAverageCost ?? part.costPrice);
    if (unitCostSnapshot < 0) throw new Error('SPARE_PART_COST_INVALID');
    const remainingStock = stockQuantity - quantity;
    const now = new Date().toISOString();
    const issueId = randomId('TPI');
    const movementId = randomId('SPM');
    const issue = {
      id: issueId,
      workOrderId,
      workOrderLineId: input.lineId,
      workOrderCode: workOrder.code || null,
      deviceId: workOrder.deviceId || null,
      imei: workOrder.imei,
      branchId: workOrder.branchId,
      warehouseId: input.warehouseId,
      partId: input.partId,
      productMasterId: part.productMasterId || null,
      sku: part.sku || input.partId,
      partName: part.name || input.partId,
      lotId: input.lotId || null,
      reservationId: input.reservationId || null,
      exceptionApprovalId: input.exceptionApprovalId || null,
      quantityIssued: quantity,
      quantityConsumed: 0,
      quantityReturned: 0,
      quantityScrapped: 0,
      quantityScrappedCapitalized: 0,
      unitCostSnapshot,
      totalConsumedCost: 0,
      costMethod: input.lotId ? 'FIFO' : 'MOVING_AVERAGE',
      costVersion: String(lot?.costVersion || part.costVersion || 'PART_COST_V2'),
      issuedToUid: line.assigneeUid,
      issuedByUid: actor.uid,
      issuedAt: now,
      status: 'ISSUED' as TechnicalPartIssueStatus,
      createdAt: now,
      updatedAt: now
    };

    if (lotRef) {
      transaction.update(lotRef, {
        stockQuantity: remainingStock,
        ...(reservation ? { reservedQuantity: reservedQuantity - quantity } : {}),
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.update(partRef, {
        stockQuantity: aggregateStockQuantity - quantity,
        ...(reservation ? { reservedQuantity: aggregateReservedQuantity - quantity } : {}),
        updatedAt: FieldValue.serverTimestamp()
      });
    } else {
      transaction.update(partRef, {
        stockQuantity: remainingStock,
        ...(reservation ? { reservedQuantity: reservedQuantity - quantity } : {}),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    if (reservationRef && reservation) {
      const quantityIssued = numberOrZero(reservation.quantityIssued) + quantity;
      const quantityCancelled = numberOrZero(reservation.quantityCancelled);
      const status: TechnicalPartReservationStatus = quantityIssued + quantityCancelled >= numberOrZero(reservation.quantityReserved)
        ? 'FULFILLED'
        : 'PARTIALLY_ISSUED';
      transaction.update(reservationRef, { quantityIssued, status, updatedAt: now });
    }
    if (exceptionRef && partException) {
      transaction.update(exceptionRef, {
        quantityIssued: numberOrZero(partException.quantityIssued) + quantity,
        updatedAt: now,
        lastIssuedAt: now,
        lastIssueId: issueId
      });
    }
    // A task that was waiting for a requested part becomes actionable again
    // only when the KTV actually issues it from their own warehouse.
    if (String(line.status || '') === 'WAITING_PARTS') {
      transaction.update(lineRef, {
        status: 'IN_PROGRESS',
        partsAvailableAt: now,
        updatedAt: now
      });
      transaction.update(woRef, { status: 'IN_PROGRESS', updatedAt: now });
    }
    transaction.set(db.collection('technicalPartIssues').doc(issueId), issue);
    transaction.set(db.collection('sparePartMovements').doc(movementId), {
      id: movementId,
      movementType: 'ISSUE',
      partId: input.partId,
      lotId: input.lotId || null,
      warehouseId: input.warehouseId,
      branchId: workOrder.branchId,
      quantity,
      unitCostSnapshot,
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      issueId,
      reservationId: input.reservationId || null,
      exceptionApprovalId: input.exceptionApprovalId || null,
      workOrderLineId: input.lineId,
      workOrderCode: workOrder.code || null,
      deviceId: workOrder.deviceId || null,
      imei: workOrder.imei || null,
      productMasterId: part.productMasterId || null,
      sku: part.sku || input.partId,
      actorUid: actor.uid,
      occurredAt: now,
      createdAt: now
    });
    transaction.set(idemRef, { scope: 'PART_ISSUE', workOrderId, issueId, remainingStock, createdAt: now });
    return { issue: visiblePartIssue(issue, actor), remainingStock };
  });
}

async function settleTechnicalPart(
  db: Firestore,
  workOrderId: string,
  issueId: string,
  quantityInput: number,
  idempotencyKeyInput: string,
  action: 'CONSUME' | 'RETURN',
  actor: TechnicalCostActor,
  note?: string
): Promise<{ issue: any; idempotentReplay?: boolean }> {
  const quantity = positiveInteger(quantityInput);
  const key = assertIdempotencyKey(idempotencyKeyInput);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`PART_${action}:${issueId}`, key));
  const issueRef = db.collection('technicalPartIssues').doc(issueId);
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const replayIssue = await transaction.get(issueRef);
      if (!replayIssue.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { issue: visiblePartIssue(replayIssue.data(), actor), idempotentReplay: true };
    }
    const issueSnap = await transaction.get(issueRef);
    const woSnap = await transaction.get(woRef);
    if (!issueSnap.exists) throw new Error('PART_ISSUE_NOT_FOUND');
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const issue = issueSnap.data()!;
    const workOrder = woSnap.data()!;
    if (issue.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(issue.branchId || workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (!isElevated(actor) && issue.issuedToUid !== actor.uid) throw new Error('TECHNICIAN_NOT_ASSIGNED');
    if (!ACTIVE_PART_WORK_ORDER_STATUSES.has(String(workOrder.status))) throw new Error('WORK_ORDER_NOT_OPEN_FOR_PARTS');

    const issued = numberOrZero(issue.quantityIssued);
    const consumed = numberOrZero(issue.quantityConsumed);
    const returned = numberOrZero(issue.quantityReturned);
    const scrapped = numberOrZero(issue.quantityScrapped);
    const outstanding = issued - consumed - returned - scrapped;
    if (quantity > outstanding) throw new Error('PART_SETTLEMENT_EXCEEDS_OUTSTANDING');

    const next = {
      ...issue,
      quantityIssued: issued,
      quantityScrapped: scrapped,
      quantityConsumed: consumed + (action === 'CONSUME' ? quantity : 0),
      quantityReturned: returned + (action === 'RETURN' ? quantity : 0)
    };
    const status = deriveIssueStatus(next);
    const now = new Date().toISOString();
    const movementId = randomId('SPM');
    const partRef = db.collection('spareParts').doc(issue.partId);
    const lotRef = issue.lotId ? db.collection('sparePartLots').doc(issue.lotId) : null;
    const stockSnap = action === 'RETURN' ? await transaction.get(lotRef || partRef) : null;
    const aggregatePartSnap = action === 'RETURN' && lotRef ? await transaction.get(partRef) : null;
    if (action === 'RETURN' && (!stockSnap?.exists || (lotRef && !aggregatePartSnap?.exists))) throw new Error('SPARE_PART_STOCK_RECORD_NOT_FOUND');

    if (action === 'RETURN') {
      const currentStock = numberOrZero(stockSnap!.data()?.stockQuantity);
      transaction.update(lotRef || partRef, { stockQuantity: currentStock + quantity, updatedAt: FieldValue.serverTimestamp() });
      if (lotRef) {
        transaction.update(partRef, { stockQuantity: numberOrZero(aggregatePartSnap!.data()?.stockQuantity) + quantity, updatedAt: FieldValue.serverTimestamp() });
      }
    }
    transaction.update(issueRef, {
      quantityConsumed: next.quantityConsumed,
      quantityReturned: next.quantityReturned,
      totalConsumedCost: next.quantityConsumed * numberOrZero(issue.unitCostSnapshot),
      status,
      updatedAt: now
    });
    transaction.set(db.collection('sparePartMovements').doc(movementId), {
      id: movementId,
      movementType: action,
      partId: issue.partId,
      lotId: issue.lotId || null,
      warehouseId: issue.warehouseId,
      branchId: issue.branchId,
      quantity,
      unitCostSnapshot: issue.unitCostSnapshot,
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      issueId,
      workOrderLineId: issue.workOrderLineId,
      workOrderCode: workOrder.code || issue.workOrderCode || null,
      deviceId: issue.deviceId || null,
      imei: issue.imei || workOrder.imei || null,
      productMasterId: issue.productMasterId || null,
      sku: issue.sku || null,
      actorUid: actor.uid,
      note: String(note || ''),
      occurredAt: now,
      createdAt: now
    });
    transaction.set(idemRef, { scope: `PART_${action}`, workOrderId, issueId, createdAt: now });
    return { issue: visiblePartIssue({ ...next, status, totalConsumedCost: next.quantityConsumed * numberOrZero(issue.unitCostSnapshot), updatedAt: now }, actor) };
  });
}

export function processConsumeTechnicalPart(
  db: Firestore,
  workOrderId: string,
  issueId: string,
  input: { quantity: number; idempotencyKey: string; note?: string },
  actor: TechnicalCostActor
) {
  return settleTechnicalPart(db, workOrderId, issueId, input.quantity, input.idempotencyKey, 'CONSUME', actor, input.note);
}

export function processReturnTechnicalPart(
  db: Firestore,
  workOrderId: string,
  issueId: string,
  input: { quantity: number; idempotencyKey: string; note?: string },
  actor: TechnicalCostActor
) {
  return settleTechnicalPart(db, workOrderId, issueId, input.quantity, input.idempotencyKey, 'RETURN', actor, input.note);
}

export async function processScrapTechnicalPart(
  db: Firestore,
  workOrderId: string,
  issueId: string,
  input: { quantity: number; reason: string; capitalizeToDevice?: boolean; idempotencyKey: string },
  actor: TechnicalCostActor
): Promise<{ issue: any; idempotentReplay?: boolean }> {
  if (!isElevated(actor)) throw new Error('PART_SCRAP_APPROVAL_FORBIDDEN');
  const quantity = positiveInteger(input.quantity);
  if (!input.reason?.trim()) throw new Error('PART_SCRAP_REASON_REQUIRED');
  const key = assertIdempotencyKey(input.idempotencyKey);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`PART_SCRAP:${issueId}`, key));
  const issueRef = db.collection('technicalPartIssues').doc(issueId);
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const replay = await transaction.get(issueRef);
      if (!replay.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { issue: publicIssue(replay.data()), idempotentReplay: true };
    }
    const issueSnap = await transaction.get(issueRef);
    const woSnap = await transaction.get(woRef);
    if (!issueSnap.exists) throw new Error('PART_ISSUE_NOT_FOUND');
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const issue = issueSnap.data()!;
    const workOrder = woSnap.data()!;
    if (issue.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(issue.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (!ACTIVE_PART_WORK_ORDER_STATUSES.has(String(workOrder.status))) throw new Error('WORK_ORDER_NOT_OPEN_FOR_PARTS');
    const outstanding = numberOrZero(issue.quantityIssued) - numberOrZero(issue.quantityConsumed) - numberOrZero(issue.quantityReturned) - numberOrZero(issue.quantityScrapped);
    if (quantity > outstanding) throw new Error('PART_SETTLEMENT_EXCEEDS_OUTSTANDING');
    const quantityScrapped = numberOrZero(issue.quantityScrapped) + quantity;
    const previouslyCapitalizedScrap = issue.quantityScrappedCapitalized == null && issue.capitalizeScrapToDevice === true
      ? numberOrZero(issue.quantityScrapped)
      : numberOrZero(issue.quantityScrappedCapitalized);
    const quantityScrappedCapitalized = previouslyCapitalizedScrap + (input.capitalizeToDevice === true ? quantity : 0);
    const next = {
      ...issue,
      quantityIssued: numberOrZero(issue.quantityIssued),
      quantityConsumed: numberOrZero(issue.quantityConsumed),
      quantityReturned: numberOrZero(issue.quantityReturned),
      quantityScrapped
    };
    const status = deriveIssueStatus(next);
    const now = new Date().toISOString();
    const movementId = randomId('SPM');
    transaction.update(issueRef, { quantityScrapped, quantityScrappedCapitalized, scrapReason: input.reason.trim(), status, updatedAt: now });
    transaction.set(db.collection('sparePartMovements').doc(movementId), {
      id: movementId, movementType: 'SCRAP', partId: issue.partId, lotId: issue.lotId || null,
      warehouseId: issue.warehouseId, branchId: issue.branchId, quantity, unitCostSnapshot: issue.unitCostSnapshot,
      sourceType: 'WORK_ORDER', sourceId: workOrderId, issueId, actorUid: actor.uid,
      capitalizeToDevice: input.capitalizeToDevice === true, reason: input.reason.trim(), occurredAt: now, createdAt: now
    });
    transaction.set(idemRef, { scope: 'PART_SCRAP', workOrderId, issueId, createdAt: now });
    return { issue: visiblePartIssue({ ...next, quantityScrappedCapitalized, status, scrapReason: input.reason.trim(), updatedAt: now }, actor) };
  });
}

export async function processCancelTechnicalPartIssue(
  db: Firestore,
  workOrderId: string,
  issueId: string,
  input: { reason: string; idempotencyKey: string },
  actor: TechnicalCostActor
): Promise<{ issueId: string; status: 'CANCELLED'; idempotentReplay?: boolean }> {
  if (!isElevated(actor)) throw new Error('PART_ISSUE_CANCELLATION_FORBIDDEN');
  if (!input.reason?.trim()) throw new Error('PART_CANCELLATION_REASON_REQUIRED');
  const key = assertIdempotencyKey(input.idempotencyKey);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`PART_CANCEL:${issueId}`, key));
  const issueRef = db.collection('technicalPartIssues').doc(issueId);
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) return { issueId, status: 'CANCELLED', idempotentReplay: true };
    const issueSnap = await transaction.get(issueRef);
    const woSnap = await transaction.get(woRef);
    if (!issueSnap.exists) throw new Error('PART_ISSUE_NOT_FOUND');
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const issue = issueSnap.data()!;
    if (issue.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(issue.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (numberOrZero(issue.quantityConsumed) > 0 || numberOrZero(issue.quantityReturned) > 0 || numberOrZero(issue.quantityScrapped) > 0) throw new Error('PART_ISSUE_ALREADY_SETTLED');
    if (issue.status === 'CANCELLED') return { issueId, status: 'CANCELLED', idempotentReplay: true };
    const partRef = db.collection('spareParts').doc(issue.partId);
    const lotRef = issue.lotId ? db.collection('sparePartLots').doc(issue.lotId) : null;
    const stockSnap = await transaction.get(lotRef || partRef);
    const aggregatePartSnap = lotRef ? await transaction.get(partRef) : null;
    if (!stockSnap.exists || (lotRef && !aggregatePartSnap?.exists)) throw new Error('SPARE_PART_STOCK_RECORD_NOT_FOUND');
    const quantity = numberOrZero(issue.quantityIssued);
    const now = new Date().toISOString();
    const movementId = randomId('SPM');
    transaction.update(lotRef || partRef, { stockQuantity: numberOrZero(stockSnap.data()?.stockQuantity) + quantity, updatedAt: FieldValue.serverTimestamp() });
    if (lotRef) {
      transaction.update(partRef, { stockQuantity: numberOrZero(aggregatePartSnap!.data()?.stockQuantity) + quantity, updatedAt: FieldValue.serverTimestamp() });
    }
    transaction.update(issueRef, { status: 'CANCELLED', cancellationReason: input.reason.trim(), cancelledByUid: actor.uid, cancelledAt: now, updatedAt: now });
    transaction.set(db.collection('sparePartMovements').doc(movementId), {
      id: movementId, movementType: 'REVERSAL', reversesMovementType: 'ISSUE', partId: issue.partId,
      lotId: issue.lotId || null, warehouseId: issue.warehouseId, branchId: issue.branchId, quantity,
      unitCostSnapshot: issue.unitCostSnapshot, sourceType: 'WORK_ORDER', sourceId: workOrderId, issueId,
      actorUid: actor.uid, reason: input.reason.trim(), occurredAt: now, createdAt: now
    });
    transaction.set(idemRef, { scope: 'PART_CANCEL', workOrderId, issueId, createdAt: now });
    return { issueId, status: 'CANCELLED' };
  });
}

export async function processAddTechnicalExternalCost(
  db: Firestore,
  workOrderId: string,
  input: {
    category: 'OUTSOURCED_REPAIR' | 'TRANSPORT' | 'MATERIAL' | 'OTHER';
    supplierId?: string;
    amount: number;
    invoiceUrl?: string;
    note: string;
    capitalizeToDevice?: boolean;
    idempotencyKey: string;
  },
  actor: TechnicalCostActor
): Promise<{ cost: any; idempotentReplay?: boolean }> {
  const amount = numberOrZero(input.amount);
  if (amount <= 0 || !input.note?.trim() || !['OUTSOURCED_REPAIR', 'TRANSPORT', 'MATERIAL', 'OTHER'].includes(input.category)) throw new Error('EXTERNAL_COST_DATA_INVALID');
  const key = assertIdempotencyKey(input.idempotencyKey);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`EXTERNAL_COST:${workOrderId}`, key));
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const costSnap = await transaction.get(db.collection('technicalExternalCosts').doc(idemSnap.data()!.costId));
      if (!costSnap.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { cost: publicIssue(costSnap.data()), idempotentReplay: true };
    }
    const woSnap = await transaction.get(woRef);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const workOrder = woSnap.data()!;
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (!isElevated(actor) && !canViewTechnicalCost(actor) && workOrder.currentCustodianUid !== actor.uid && workOrder.assignedTechnicianUid !== actor.uid) {
      throw new Error('TECHNICIAN_NOT_ASSIGNED');
    }
    if (!ACTIVE_COST_WORK_ORDER_STATUSES.has(String(workOrder.status))) throw new Error('WORK_ORDER_NOT_OPEN_FOR_COSTS');
    const now = new Date().toISOString();
    const costId = randomId('TEC');
    const cost = {
      id: costId,
      workOrderId,
      deviceId: workOrder.deviceId || null,
      imei: workOrder.imei,
      branchId: workOrder.branchId,
      category: input.category,
      supplierId: input.supplierId || null,
      amount,
      invoiceUrl: input.invoiceUrl || null,
      note: input.note.trim(),
      capitalizeToDevice: input.capitalizeToDevice !== false,
      approvalStatus: isElevated(actor) ? 'APPROVED' : 'PENDING',
      requestedByUid: actor.uid,
      approvedByUid: isElevated(actor) ? actor.uid : null,
      createdAt: now,
      updatedAt: now
    };
    transaction.set(db.collection('technicalExternalCosts').doc(costId), cost);
    transaction.set(idemRef, { scope: 'EXTERNAL_COST', workOrderId, costId, createdAt: now });
    return { cost: publicIssue(cost) };
  });
}

export async function processApproveTechnicalExternalCost(
  db: Firestore,
  workOrderId: string,
  costId: string,
  decision: 'APPROVED' | 'REJECTED',
  actor: TechnicalCostActor
): Promise<{ costId: string; approvalStatus: string }> {
  if (!canViewTechnicalCost(actor)) throw new Error('EXTERNAL_COST_APPROVAL_FORBIDDEN');
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new Error('EXTERNAL_COST_DECISION_INVALID');
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const costRef = db.collection('technicalExternalCosts').doc(costId);
  return db.runTransaction(async transaction => {
    const woSnap = await transaction.get(woRef);
    const costSnap = await transaction.get(costRef);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    if (!costSnap.exists) throw new Error('EXTERNAL_COST_NOT_FOUND');
    const workOrder = woSnap.data()!;
    const cost = costSnap.data()!;
    if (cost.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (cost.approvalStatus !== 'PENDING') throw new Error('EXTERNAL_COST_ALREADY_DECIDED');
    transaction.update(costRef, { approvalStatus: decision, approvedByUid: actor.uid, approvedAt: new Date().toISOString(), updatedAt: FieldValue.serverTimestamp() });
    return { costId, approvalStatus: decision };
  });
}

export async function processAddTechnicalRecovery(
  db: Firestore,
  workOrderId: string,
  input: {
    category: 'SUPPLIER_RECOVERY' | 'WARRANTY_COMPENSATION' | 'OTHER';
    supplierId?: string;
    amount: number;
    note: string;
    evidenceUrl?: string;
    idempotencyKey: string;
  },
  actor: TechnicalCostActor
): Promise<{ recovery: any; idempotentReplay?: boolean }> {
  const amount = numberOrZero(input.amount);
  if (amount <= 0 || !input.note?.trim() || !['SUPPLIER_RECOVERY', 'WARRANTY_COMPENSATION', 'OTHER'].includes(input.category)) throw new Error('RECOVERY_DATA_INVALID');
  const key = assertIdempotencyKey(input.idempotencyKey);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`RECOVERY:${workOrderId}`, key));
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const recoverySnap = await transaction.get(db.collection('technicalRecoveries').doc(idemSnap.data()!.recoveryId));
      if (!recoverySnap.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { recovery: publicIssue(recoverySnap.data()), idempotentReplay: true };
    }
    const woSnap = await transaction.get(woRef);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const workOrder = woSnap.data()!;
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (!isElevated(actor) && !canViewTechnicalCost(actor) && workOrder.currentCustodianUid !== actor.uid && workOrder.assignedTechnicianUid !== actor.uid) {
      throw new Error('TECHNICIAN_NOT_ASSIGNED');
    }
    if (!ACTIVE_COST_WORK_ORDER_STATUSES.has(String(workOrder.status))) throw new Error('WORK_ORDER_NOT_OPEN_FOR_RECOVERY');
    const now = new Date().toISOString();
    const recoveryId = randomId('TRC');
    const mayApprove = canViewTechnicalCost(actor);
    const recovery = {
      id: recoveryId,
      workOrderId,
      deviceId: workOrder.deviceId || null,
      imei: workOrder.imei,
      branchId: workOrder.branchId,
      category: input.category,
      supplierId: input.supplierId || null,
      amount,
      note: input.note.trim(),
      evidenceUrl: input.evidenceUrl || null,
      approvalStatus: mayApprove ? 'APPROVED' : 'PENDING',
      requestedByUid: actor.uid,
      approvedByUid: mayApprove ? actor.uid : null,
      createdAt: now,
      updatedAt: now
    };
    transaction.set(db.collection('technicalRecoveries').doc(recoveryId), recovery);
    transaction.set(idemRef, { scope: 'RECOVERY', workOrderId, recoveryId, createdAt: now });
    return { recovery: publicIssue(recovery) };
  });
}

export async function processApproveTechnicalRecovery(
  db: Firestore,
  workOrderId: string,
  recoveryId: string,
  decision: 'APPROVED' | 'REJECTED',
  actor: TechnicalCostActor
): Promise<{ recoveryId: string; approvalStatus: string }> {
  if (!canViewTechnicalCost(actor)) throw new Error('RECOVERY_APPROVAL_FORBIDDEN');
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new Error('RECOVERY_DECISION_INVALID');
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const recoveryRef = db.collection('technicalRecoveries').doc(recoveryId);
  return db.runTransaction(async transaction => {
    const woSnap = await transaction.get(woRef);
    const recoverySnap = await transaction.get(recoveryRef);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    if (!recoverySnap.exists) throw new Error('RECOVERY_NOT_FOUND');
    const workOrder = woSnap.data()!;
    const recovery = recoverySnap.data()!;
    if (recovery.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (recovery.approvalStatus !== 'PENDING') throw new Error('RECOVERY_ALREADY_DECIDED');
    transaction.update(recoveryRef, { approvalStatus: decision, approvedByUid: actor.uid, approvedAt: new Date().toISOString(), updatedAt: FieldValue.serverTimestamp() });
    return { recoveryId, approvalStatus: decision };
  });
}

export async function processFinalizeTechnicalCost(
  db: Firestore,
  workOrderId: string,
  idempotencyKeyInput: string,
  actor: TechnicalCostActor
): Promise<{ postingId: string; breakdown: TechnicalCostBreakdown; idempotentReplay?: boolean }> {
  const key = assertIdempotencyKey(idempotencyKeyInput);
  if (!canViewTechnicalCost(actor)) throw new Error('COST_POSTING_FORBIDDEN');
  const postingRef = db.collection('technicalCostPostings').doc(workOrderId);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`FINALIZE_COST:${workOrderId}`, key));
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    const existingPosting = await transaction.get(postingRef);
    if (idemSnap.exists || existingPosting.exists) {
      if (!existingPosting.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      const data = existingPosting.data()!;
      return { postingId: existingPosting.id, breakdown: data.breakdown, idempotentReplay: true };
    }
    const woSnap = await transaction.get(woRef);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const workOrder = woSnap.data()!;
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    const companyOwned = workOrder.assetOwnership === 'COMPANY' || INTERNAL_ASSET_TYPES.has(String(workOrder.workOrderType));
    if (!companyOwned) throw new Error('CUSTOMER_DEVICE_COST_POSTING_FORBIDDEN');
    if (workOrder.status !== 'QC_PASSED') throw new Error('QC_PASS_REQUIRED_FOR_COST_POSTING');
    if (!workOrder.deviceId) throw new Error('WORK_ORDER_DEVICE_REQUIRED');

    const deviceRef = db.collection('devices').doc(workOrder.deviceId);
    const financialRef = db.collection('deviceFinancials').doc(workOrder.deviceId);
    const deviceSnap = await transaction.get(deviceRef);
    const financialSnap = await transaction.get(financialRef);
    const linesSnap = await transaction.get(db.collection('technicalWorkOrderLines').where('workOrderId', '==', workOrderId));
    const issuesSnap = await transaction.get(db.collection('technicalPartIssues').where('workOrderId', '==', workOrderId));
    const reservationsSnap = await transaction.get(db.collection('technicalPartReservations').where('workOrderId', '==', workOrderId));
    const externalSnap = await transaction.get(db.collection('technicalExternalCosts').where('workOrderId', '==', workOrderId));
    const recoverySnap = await transaction.get(db.collection('technicalRecoveries').where('workOrderId', '==', workOrderId));
    if (!deviceSnap.exists) throw new Error('DEVICE_NOT_FOUND');

    const device = deviceSnap.data()!;
    const financial = financialSnap.exists ? financialSnap.data()! : null;
    const lines: any[] = linesSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
    const issues: any[] = issuesSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
    const reservations: any[] = reservationsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
    const externalCosts: any[] = externalSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
    const recoveries: any[] = recoverySnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
    if (lines.some(line => line.status !== 'VERIFIED')) throw new Error('ALL_TASKS_MUST_BE_VERIFIED');
    if (issues.some(issue => issue.status !== 'CANCELLED' && numberOrZero(issue.quantityIssued) !== numberOrZero(issue.quantityConsumed) + numberOrZero(issue.quantityReturned) + numberOrZero(issue.quantityScrapped))) {
      throw new Error('PART_ISSUES_NOT_SETTLED');
    }
    if (reservations.some(reservation => numberOrZero(reservation.quantityReserved) !== numberOrZero(reservation.quantityIssued) + numberOrZero(reservation.quantityCancelled))) {
      throw new Error('PART_RESERVATIONS_NOT_SETTLED');
    }
    if (externalCosts.some(cost => cost.approvalStatus === 'PENDING')) throw new Error('EXTERNAL_COSTS_PENDING_APPROVAL');
    if (recoveries.some(recovery => recovery.approvalStatus === 'PENDING')) throw new Error('RECOVERIES_PENDING_APPROVAL');

    const currentCost = numberOrZero(financial?.currentCost ?? device.currentCost ?? device.buyPrice);
    const currentVersion = String(financial?.costVersion || device.costVersion || 'LEGACY_CURRENT_COST_V1');
    const expectedOpeningCost = workOrder.openingDeviceCost == null ? currentCost : numberOrZero(workOrder.openingDeviceCost);
    const expectedVersion = String(workOrder.openingCostVersion || currentVersion);
    if (Math.abs(currentCost - expectedOpeningCost) > 0.5 || currentVersion !== expectedVersion) throw new Error('DEVICE_COST_VERSION_CONFLICT');

    const breakdown = calculateTechnicalCostBreakdown({
      openingDeviceCost: expectedOpeningCost,
      partIssues: issues,
      taskLines: lines,
      externalCosts,
      recoveries
    });
    const now = new Date().toISOString();
    const calculationHash = crypto.createHash('sha256').update(JSON.stringify({ workOrderId, currentVersion, breakdown, issueIds: issues.map(item => item.id), lineIds: lines.map(item => item.id), externalIds: externalCosts.map(item => item.id), recoveryIds: recoveries.map(item => item.id) })).digest('hex');
    const costVersion = `TECH_COST_V2:${workOrderId}:${calculationHash.slice(0, 12)}`;
    const eventId = randomId('DCE');
    const posting = {
      id: workOrderId,
      workOrderId,
      deviceId: workOrder.deviceId,
      imei: workOrder.imei,
      branchId: workOrder.branchId,
      openingCostVersion: currentVersion,
      closingCostVersion: costVersion,
      calculationHash,
      breakdown,
      status: 'POSTED',
      postedByUid: actor.uid,
      postedAt: now,
      createdAt: now
    };

    transaction.set(postingRef, posting);
    transaction.set(db.collection('deviceCostEvents').doc(eventId), {
      id: eventId,
      deviceId: workOrder.deviceId,
      imei: workOrder.imei,
      eventType: 'WORK_ORDER_COST_POSTED',
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      costBefore: breakdown.openingDeviceCost,
      amount: breakdown.totalActualCost,
      costAfter: breakdown.closingDeviceCost,
      breakdown,
      costVersion,
      createdByUid: actor.uid,
      createdAt: now
    });
    transaction.set(financialRef, {
      deviceId: workOrder.deviceId,
      imei: workOrder.imei,
      branchId: workOrder.branchId,
      acquisitionCost: numberOrZero(financial?.acquisitionCost ?? device.buyPrice ?? breakdown.openingDeviceCost),
      technicalAddedCost: numberOrZero(financial?.technicalAddedCost) + breakdown.totalActualCost,
      currentCost: breakdown.closingDeviceCost,
      costVersion,
      calculatedAt: now,
      updatedAt: now
    }, { merge: true });
    // Compatibility projection until every inventory/report reader consumes deviceFinancials.
    transaction.update(deviceRef, { currentCost: breakdown.closingDeviceCost, costVersion, costCalculatedAt: now, updatedAt: FieldValue.serverTimestamp() });
    transaction.update(woRef, {
      ...breakdown,
      costPostingStatus: 'POSTED',
      costPostingId: workOrderId,
      costCalculationHash: calculationHash,
      costPostedAt: now,
      costPostedByUid: actor.uid,
      updatedAt: FieldValue.serverTimestamp()
    });
    transaction.set(idemRef, { scope: 'FINALIZE_COST', workOrderId, postingId: workOrderId, createdAt: now });
    return { postingId: workOrderId, breakdown };
  });
}

export async function getTechnicalCostBreakdown(db: Firestore, workOrderId: string, actor: TechnicalCostActor): Promise<any> {
  const woSnap = await db.collection('technicalWorkOrders').doc(workOrderId).get();
  if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
  const workOrder = woSnap.data()!;
  if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
  const [linesSnap, issuesSnap, reservationsSnap, exceptionsSnap, additionRequestsSnap, externalSnap, recoverySnap, postingSnap, qcSnap, movementBySourceSnap, movementByWorkOrderSnap, costEventsSnap] = await Promise.all([
    db.collection('technicalWorkOrderLines').where('workOrderId', '==', workOrderId).get(),
    db.collection('technicalPartIssues').where('workOrderId', '==', workOrderId).get(),
    db.collection('technicalPartReservations').where('workOrderId', '==', workOrderId).get(),
    db.collection('technicalPartExceptions').where('workOrderId', '==', workOrderId).get(),
    db.collection('technicalTaskAdditionRequests').where('workOrderId', '==', workOrderId).get(),
    db.collection('technicalExternalCosts').where('workOrderId', '==', workOrderId).get(),
    db.collection('technicalRecoveries').where('workOrderId', '==', workOrderId).get(),
    db.collection('technicalCostPostings').doc(workOrderId).get(),
    db.collection('qcInspections').where('workOrderId', '==', workOrderId).get(),
    db.collection('inventoryMovements').where('sourceId', '==', workOrderId).get(),
    db.collection('inventoryMovements').where('workOrderId', '==', workOrderId).get(),
    db.collection('deviceCostEvents').where('sourceId', '==', workOrderId).get()
  ]);
  const taskLines: any[] = linesSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  const partIssues: any[] = issuesSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  const partReservations: any[] = reservationsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  const partExceptions: any[] = exceptionsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  const taskAdditionRequests: any[] = additionRequestsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  const externalCosts: any[] = externalSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  const recoveries: any[] = recoverySnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  const openingDeviceCost = numberOrZero(workOrder.openingDeviceCost ?? postingSnap.data()?.breakdown?.openingDeviceCost);
  const mayViewCost = canViewTechnicalCost(actor);
  const role = normalizedRole(actor);
  const mayReviewAnyWorkOrder = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'TECH_LEAD', 'INVENTORY_MANAGER'].includes(role);
  const isAssigned = taskLines.some(line => line.assigneeUid === actor.uid) || workOrder.currentCustodianUid === actor.uid;
  if (!mayReviewAnyWorkOrder && !isAssigned) throw new Error('WORK_ORDER_ACCESS_FORBIDDEN');
  const preview = postingSnap.exists ? postingSnap.data()!.breakdown : calculateTechnicalCostBreakdown({ openingDeviceCost, partIssues, taskLines, externalCosts, recoveries });
  const qcInspections: any[] = qcSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  const movementMap = new Map<string, any>();
  [...movementBySourceSnap.docs, ...movementByWorkOrderSnap.docs].forEach(doc => movementMap.set(doc.id, { id: doc.id, ...doc.data() }));
  const costEvents: any[] = costEventsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  const eventTime = (value: any): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    return '';
  };
  const timeline = [
    { id: `WO_CREATED_${workOrderId}`, type: 'WORK_ORDER_CREATED', title: 'Tạo phiếu kỹ thuật', occurredAt: eventTime(workOrder.createdAt), actorName: workOrder.createdByName || null },
    ...[...movementMap.values()].map(movement => ({ id: movement.id, type: movement.movementType, title: `Di chuyển: ${movement.movementType}`, occurredAt: eventTime(movement.occurredAt || movement.createdAt), actorUid: movement.performedByUid || null, fromLocationId: movement.fromLocationId || null, toLocationId: movement.toLocationId || null })),
    ...taskLines.flatMap(line => [
      line.startedAt ? { id: `${line.id}_STARTED`, type: 'TASK_STARTED', title: `Bắt đầu: ${line.taskName}`, occurredAt: eventTime(line.startedAt), actorUid: line.assigneeUid, actorName: line.assigneeName } : null,
      line.completedAt ? { id: `${line.id}_COMPLETED`, type: 'TASK_COMPLETED', title: `Hoàn thành: ${line.taskName}`, occurredAt: eventTime(line.completedAt), actorUid: line.assigneeUid, actorName: line.assigneeName } : null,
      line.qcVerifiedAt ? { id: `${line.id}_VERIFIED`, type: 'TASK_VERIFIED', title: `KCS xác nhận: ${line.taskName}`, occurredAt: eventTime(line.qcVerifiedAt) } : null
    ]),
    ...partIssues.map(issue => ({ id: issue.id, type: 'PART_ISSUE', title: `Linh kiện: ${issue.partName}`, occurredAt: eventTime(issue.issuedAt || issue.createdAt), actorUid: issue.issuedByUid || null, status: issue.status })),
    ...partReservations.map(reservation => ({ id: reservation.id, type: 'PART_RESERVATION', title: `Giữ linh kiện: ${reservation.partName}`, occurredAt: eventTime(reservation.reservedAt || reservation.createdAt), actorUid: reservation.reservedByUid || null, status: reservation.status })),
    ...partExceptions.map(exception => ({ id: exception.id, type: 'PART_EXCEPTION', title: `Ngoại lệ linh kiện: ${exception.partName}`, occurredAt: eventTime(exception.decidedAt || exception.requestedAt || exception.createdAt), actorUid: exception.decidedByUid || exception.requestedByUid || null, status: exception.status })),
    ...taskAdditionRequests.map(request => ({ id: request.id, type: 'TASK_ADDITION', title: `Lỗi phát sinh: ${request.taskName || request.taskType}`, occurredAt: eventTime(request.decidedAt || request.requestedAt || request.createdAt), actorUid: request.decidedByUid || request.requestedByUid || null, status: request.status })),
    ...qcInspections.map(inspection => ({ id: inspection.id, type: 'QC_INSPECTION', title: `KCS ${inspection.overallResult}`, occurredAt: eventTime(inspection.inspectedAt || inspection.createdAt), actorUid: inspection.inspectorUid || null, actorName: inspection.inspectorName || null, status: inspection.overallResult })),
    ...(mayViewCost ? costEvents.map(event => ({ id: event.id, type: event.eventType, title: 'Kết chuyển giá vốn', occurredAt: eventTime(event.createdAt), actorUid: event.createdByUid || null, amount: event.amount, costAfter: event.costAfter })) : [])
  ].filter((event): event is any => !!event && !!event.occurredAt)
    .sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt)));
  const visibleIssues = partIssues.map(issue => mayViewCost ? issue : ({
    id: issue.id, workOrderId: issue.workOrderId, workOrderLineId: issue.workOrderLineId,
    partId: issue.partId, sku: issue.sku, partName: issue.partName, warehouseId: issue.warehouseId,
    quantityIssued: issue.quantityIssued, quantityConsumed: issue.quantityConsumed,
    quantityReturned: issue.quantityReturned, quantityScrapped: issue.quantityScrapped,
    status: issue.status, issuedAt: issue.issuedAt
  }));
  const visibleWorkOrder = mayViewCost ? workOrder : (() => {
    const {
      openingDeviceCost: _openingDeviceCost,
      openingCostVersion: _openingCostVersion,
      totalEstimatedCost: _totalEstimatedCost,
      totalActualCost: _totalActualCost,
      totalCommissionAmount: _totalCommissionAmount,
      partsCost: _partsCost,
      laborCost: _laborCost,
      externalCost: _externalCost,
      otherCost: _otherCost,
      recoveryAmount: _recoveryAmount,
      closingDeviceCost: _closingDeviceCost,
      costCalculationHash: _costCalculationHash,
      ...operational
    } = workOrder;
    return operational;
  })();
  const visibleTaskLines = taskLines.map(line => {
    if (mayViewCost) return line;
    const {
      laborCostToDevice: _laborCostToDevice,
      capitalizeLaborCost: _capitalizeLaborCost,
      commissionAmount: hiddenCommissionAmount,
      ...operational
    } = line;
    return line.assigneeUid === actor.uid ? { ...operational, commissionAmount: hiddenCommissionAmount } : operational;
  });
  return {
    workOrder: publicIssue(visibleWorkOrder),
    taskLines: publicIssue(visibleTaskLines),
    partIssues: publicIssue(visibleIssues),
    partReservations: publicIssue(partReservations),
    partExceptions: publicIssue(partExceptions),
    taskAdditionRequests: publicIssue(taskAdditionRequests),
    externalCosts: mayViewCost ? publicIssue(externalCosts) : [],
    recoveries: mayViewCost ? publicIssue(recoveries) : [],
    qcInspections: publicIssue(qcInspections),
    timeline: publicIssue(timeline),
    breakdown: mayViewCost ? preview : null,
    canViewCost: mayViewCost,
    costPostingStatus: workOrder.costPostingStatus || 'NOT_READY'
  };
}

export async function listTechnicalSpareParts(db: Firestore, actor: TechnicalCostActor, warehouseId?: string): Promise<any[]> {
  let docs: any[] = [];
  let lotDocs: any[] = [];
  const role = normalizedRole(actor);
  if (role === 'ADMIN' || role === 'REGIONAL_MANAGER') {
    const [partSnap, lotSnap] = await Promise.all([
      db.collection('spareParts').limit(500).get(),
      warehouseId
        ? db.collection('sparePartLots').where('warehouseId', '==', warehouseId).limit(1000).get()
        : db.collection('sparePartLots').limit(1500).get()
    ]);
    docs = partSnap.docs;
    lotDocs = lotSnap.docs;
  } else {
    const branchIds = [...new Set([actor.branchId, ...(actor.assignedBranchIds || [])].filter(Boolean))] as string[];
    const [snapshots, lotSnapshots] = await Promise.all([
      Promise.all(branchIds.map(branchId => db.collection('spareParts').where('branchId', '==', branchId).limit(300).get())),
      Promise.all(branchIds.map(branchId => db.collection('sparePartLots').where('branchId', '==', branchId).limit(600).get()))
    ]);
    const byId = new Map<string, any>();
    snapshots.forEach(snapshot => snapshot.docs.forEach(doc => byId.set(doc.id, doc)));
    docs = [...byId.values()];
    const lotsById = new Map<string, any>();
    lotSnapshots.forEach(snapshot => snapshot.docs.forEach(doc => lotsById.set(doc.id, doc)));
    lotDocs = [...lotsById.values()];
  }
  const mayViewCost = canViewTechnicalCost(actor);
  const lotsByPartId = new Map<string, any[]>();
  lotDocs
    .map(doc => ({ id: doc.id, ...doc.data() } as any))
    .filter(lot => !warehouseId || lot.warehouseId === warehouseId)
    .forEach(lot => {
      const visibleLot: any = {
        id: lot.id,
        lotCode: lot.lotCode || lot.id,
        partId: lot.partId,
        branchId: lot.branchId || null,
        warehouseId: lot.warehouseId || null,
        stockQuantity: Number(lot.stockQuantity || 0),
        reservedQuantity: Number(lot.reservedQuantity || 0),
        availableQuantity: Math.max(0, Number(lot.stockQuantity || 0) - Number(lot.reservedQuantity || 0)),
        supplierId: lot.supplierId || null,
        receivedAt: lot.receivedAt || null
      };
      if (mayViewCost) visibleLot.unitCost = Number(lot.unitCost || 0);
      lotsByPartId.set(String(lot.partId || ''), [...(lotsByPartId.get(String(lot.partId || '')) || []), visibleLot]);
    });
  return docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(part => !warehouseId || part.warehouseId === warehouseId)
    .map(part => {
      const visible: any = {
        id: part.id,
        productMasterId: part.productMasterId || null,
        sku: part.sku || part.id,
        name: part.name || part.id,
        category: part.category || 'KHAC',
        catalogGroupCode: part.catalogGroupCode || null,
        branchId: part.branchId || null,
        warehouseId: part.warehouseId || null,
        stockQuantity: Number(part.stockQuantity || 0),
        reservedQuantity: Number(part.reservedQuantity || 0),
        availableQuantity: Math.max(0, Number(part.stockQuantity || 0) - Number(part.reservedQuantity || 0)),
        compatibleModels: Array.isArray(part.compatibleModels) ? part.compatibleModels : [],
        compatibleModelCodes: Array.isArray(part.compatibleModelCodes) ? part.compatibleModelCodes : [],
        compatibleModelIds: Array.isArray(part.compatibleModelIds) ? part.compatibleModelIds : [],
        lots: (lotsByPartId.get(part.id) || []).sort((left, right) => String(left.receivedAt || '').localeCompare(String(right.receivedAt || '')))
      };
      if (mayViewCost) visible.currentCost = Number(part.currentAverageCost ?? part.costPrice ?? 0);
      return visible;
    });
}
