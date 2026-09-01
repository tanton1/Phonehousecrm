import crypto from 'node:crypto';
import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminMessaging } from '../firebaseAdmin';
import { normalizePartyPhone } from './branchPartyService';
import { getVietnamDateString } from '../../shared/vietnamTime';
import { customerRepairIssueByCode } from '../../shared/customerRepairIssues';

export type CustomerRepairStage =
  | 'SUBMITTED'
  | 'RECEIVED'
  | 'DIAGNOSING'
  | 'WAITING_QUOTE_APPROVAL'
  | 'IN_REPAIR'
  | 'WAITING_PARTS'
  | 'QUALITY_CHECK'
  | 'READY_FOR_PICKUP'
  | 'COMPLETED';

type CustomerAuthority = {
  uid: string;
  phoneNormalized: string;
  account: Record<string, any>;
};

type StaffActor = {
  uid: string;
  name?: string;
  role?: string;
  branchId?: string;
  assignedBranchIds?: string[];
};

const PROMOTION_STATUSES = new Set(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'EXPIRED', 'ARCHIVED']);
const PROMOTION_CATEGORIES = new Set(['DEVICE', 'REPAIR', 'ACCESSORY', 'LOYALTY', 'GENERAL']);
const CUSTOMER_REQUEST_TYPES = new Set(['WARRANTY', 'REPAIR']);
const CUSTOMER_REQUEST_STATUSES = new Set(['SUBMITTED', 'UNDER_REVIEW', 'CONVERTED', 'REJECTED', 'CANCELLED']);

function text(value: unknown, max = 500): string {
  return String(value || '').trim().slice(0, max);
}

function list(value: unknown, limit = 100, maxLength = 160): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => text(item, maxLength)).filter(Boolean))].slice(0, limit);
}

function safeInt(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function hashId(prefix: string, ...parts: unknown[]): string {
  const value = parts.map(part => String(part || '')).join('|');
  return `${prefix}_${crypto.createHash('sha256').update(value).digest('hex').slice(0, 32).toUpperCase()}`;
}

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Number.isFinite(Number(value))) return new Date(Number(value)).toISOString();
  return null;
}

function timestampMillis(value: any): number {
  const iso = toIso(value);
  return iso ? new Date(iso).getTime() : 0;
}

function canAccessBranch(actor: StaffActor, branchId: string): boolean {
  const role = text(actor.role, 40).toUpperCase();
  return role === 'ADMIN' || role === 'REGIONAL_MANAGER' || actor.branchId === branchId || (actor.assignedBranchIds || []).includes(branchId);
}

function canManageGlobalPromotions(actor: StaffActor): boolean {
  return ['ADMIN', 'REGIONAL_MANAGER'].includes(text(actor.role, 40).toUpperCase());
}

function accountIdentifiers(authority: CustomerAuthority) {
  return {
    uid: authority.uid,
    phone: normalizePartyPhone(authority.phoneNormalized),
    partyMasterId: text(authority.account.partyMasterId, 120),
    legacyPartnerIds: new Set(list(authority.account.legacyPartnerIds, 50, 120))
  };
}

export function projectCustomerAccount(uid: string, account: Record<string, any>) {
  const phone = normalizePartyPhone(account.phoneNormalized);
  return {
    uid,
    displayName: text(account.displayName || 'Khách hàng PhoneHouse', 160),
    phoneMasked: phone ? `${phone.slice(0, 3)}•••${phone.slice(-3)}` : '',
    linkStatus: text(account.linkStatus || 'LINKED', 50),
    notificationConsent: account.notificationConsent !== false,
    marketingConsent: account.marketingConsent === true,
    linkedBranchIds: list(account.linkedBranchIds, 50, 120)
  };
}

export function maskCustomerImei(value: unknown): string {
  const imei = text(value, 30);
  if (imei.length <= 4) return imei;
  return `${'•'.repeat(Math.min(11, imei.length - 4))}${imei.slice(-4)}`;
}

export function customerFriendlyRepairStage(workOrder: any, lines: any[] = []): CustomerRepairStage {
  const status = text(workOrder?.status, 50).toUpperCase();
  const quoteStatus = text(workOrder?.quoteStatus, 50).toUpperCase();
  const lineStatuses = lines.map(line => text(line?.status, 50).toUpperCase());
  if (['DELIVERED_TO_CUSTOMER', 'RETURNED_TO_STOCK', 'RETURNED_TO_BRANCH', 'CLOSED'].includes(status)) return 'COMPLETED';
  if (['QC_PASSED', 'CUSTOMER_READY'].includes(status)) return 'READY_FOR_PICKUP';
  if (['TECH_COMPLETED', 'QC_PENDING'].includes(status)) return 'QUALITY_CHECK';
  if (lineStatuses.length && lineStatuses.every(item => item === 'WAITING_PARTS')) return 'WAITING_PARTS';
  if (quoteStatus === 'PENDING_APPROVAL' && text(workOrder?.workOrderType).toUpperCase() === 'CUSTOMER_SERVICE') return 'WAITING_QUOTE_APPROVAL';
  if (['ACCEPTED', 'IN_PROGRESS', 'QC_FAILED_REWORK'].includes(status) || lineStatuses.some(item => ['IN_PROGRESS', 'REWORK_REQUIRED', 'ACCEPTED'].includes(item))) return 'IN_REPAIR';
  if (['DIAGNOSING', 'DRAFT'].includes(status)) return 'DIAGNOSING';
  return 'RECEIVED';
}

const STAGE_LABELS: Record<CustomerRepairStage, string> = {
  SUBMITTED: 'Đã gửi yêu cầu',
  RECEIVED: 'Đã tiếp nhận',
  DIAGNOSING: 'Đang kiểm tra',
  WAITING_QUOTE_APPROVAL: 'Chờ duyệt báo giá',
  IN_REPAIR: 'Đang sửa chữa',
  WAITING_PARTS: 'Chờ linh kiện',
  QUALITY_CHECK: 'Kiểm tra chất lượng',
  READY_FOR_PICKUP: 'Sẵn sàng nhận máy',
  COMPLETED: 'Đã hoàn tất'
};

function publicTimeline(workOrder: any, stage: CustomerRepairStage) {
  const candidates = [
    { key: 'RECEIVED', label: 'PhoneHouse tiếp nhận máy', at: workOrder.receivedAt || workOrder.createdAt },
    { key: 'DIAGNOSING', label: 'Kiểm tra và chẩn đoán', at: workOrder.diagnosedAt || workOrder.acceptedAt },
    { key: 'QUOTE', label: workOrder.customerApprovalStatus === 'ACCEPTED' ? 'Khách đã xác nhận báo giá' : 'Báo giá được cập nhật', at: workOrder.customerApprovedAt || workOrder.quoteApprovedAt || workOrder.quoteUpdatedAt },
    { key: 'REPAIR', label: 'Tiến hành sửa chữa', at: workOrder.firstStartedAt || workOrder.startedAt },
    { key: 'QC', label: 'Kiểm tra chất lượng', at: workOrder.techCompletedAt || workOrder.qcPassedAt },
    { key: 'READY', label: 'Sẵn sàng trả máy', at: workOrder.customerReadyAt || workOrder.qcPassedAt },
    { key: 'DONE', label: 'Hoàn tất và trả máy', at: workOrder.deliveredAt || workOrder.returnedAt }
  ];
  const result = candidates
    .filter(item => item.at)
    .map(item => ({ ...item, at: toIso(item.at) }));
  if (!result.length) result.push({ key: stage, label: STAGE_LABELS[stage], at: toIso(workOrder.updatedAt || workOrder.createdAt) });
  return result;
}

export function projectCustomerWorkOrder(workOrder: any, lines: any[] = []) {
  const stage = customerFriendlyRepairStage(workOrder, lines);
  const isWarranty = text(workOrder.workOrderType).toUpperCase() === 'WARRANTY';
  const quoteAmount = isWarranty ? 0 : safeInt(workOrder.proposedQuoteAmount ?? workOrder.approvedFinalAmount ?? workOrder.customerApprovedQuote ?? workOrder.totalEstimatedCost);
  const quoteVersion = safeInt(workOrder.quoteVersion);
  return {
    id: text(workOrder.id || workOrder.workOrderId, 120),
    customerDeviceId: text(workOrder.imei, 30) ? hashId('CDEV', text(workOrder.imei, 30)) : null,
    code: text(workOrder.code || workOrder.id, 120),
    model: text(workOrder.model, 200),
    imeiMasked: maskCustomerImei(workOrder.imei),
    type: isWarranty ? 'WARRANTY' : 'REPAIR',
    branchId: text(workOrder.branchId, 120),
    stage,
    stageLabel: STAGE_LABELS[stage],
    promisedAt: toIso(workOrder.customerPromisedAt || workOrder.intakeDetails?.expectedReturnDate),
    receivedAt: toIso(workOrder.receivedAt || workOrder.createdAt),
    completedAt: toIso(workOrder.deliveredAt || workOrder.returnedAt),
    diagnosis: text(workOrder.customerVisibleDiagnosis || workOrder.intakeDetails?.faultDescription || workOrder.intakeDetails?.issueType, 1500),
    quote: {
      status: text(workOrder.quoteStatus || (isWarranty ? 'NOT_REQUIRED' : 'PENDING_APPROVAL'), 50),
      customerDecision: text(workOrder.customerApprovalStatus, 50) || null,
      amount: quoteAmount,
      version: quoteVersion,
      updatedAt: toIso(workOrder.quoteUpdatedAt || workOrder.updatedAt),
      mayDecide: !isWarranty && ['PENDING_APPROVAL', 'APPROVED'].includes(text(workOrder.quoteStatus).toUpperCase()) && workOrder.customerApprovalStatus !== 'ACCEPTED'
    },
    payment: {
      finalAmount: safeInt(workOrder.approvedFinalAmount ?? quoteAmount),
      paidAmount: safeInt(workOrder.paidAmount),
      balanceDue: safeInt(workOrder.balanceDue),
      status: text(workOrder.paymentStatus, 50) || (safeInt(workOrder.balanceDue) > 0 ? 'PARTIAL' : 'UNPAID')
    },
    tasks: lines.map(line => ({
      id: text(line.id, 120),
      name: text(line.taskName || line.taskType, 200),
      status: ['COMPLETED', 'VERIFIED'].includes(text(line.status).toUpperCase()) ? 'COMPLETED' : 'IN_PROGRESS'
    })),
    timeline: publicTimeline(workOrder, stage),
    updatedAt: toIso(workOrder.updatedAt || workOrder.createdAt)
  };
}

function recordBelongsToCustomer(record: any, authority: CustomerAuthority): boolean {
  const identifiers = accountIdentifiers(authority);
  const boundUid = text(record.customerAccountUid);
  if (boundUid) return boundUid === identifiers.uid;
  const canonicalPartyIds = [record.partyMasterId, record.customerPartyMasterId].map(value => text(value)).filter(Boolean);
  if (canonicalPartyIds.length) return Boolean(identifiers.partyMasterId && canonicalPartyIds.includes(identifiers.partyMasterId));
  const legacyIds = [record.customerId, record.legacyPartnerId].map(value => text(value)).filter(Boolean);
  if (legacyIds.length && identifiers.legacyPartnerIds.size) return legacyIds.some(value => identifiers.legacyPartnerIds.has(value));
  return Boolean(identifiers.phone && normalizePartyPhone(record.customerPhone || record.phone || record.phoneNormalized) === identifiers.phone);
}

async function queryEquals(db: Firestore, collection: string, field: string, value: string, limit = 150) {
  if (!value) return [] as any[];
  const snapshot = await db.collection(collection).where(field, '==', value).limit(limit).get();
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
}

async function loadOwnedRecords(db: Firestore, collection: string, authority: CustomerAuthority, limit = 150) {
  const identifiers = accountIdentifiers(authority);
  const phoneVariants = [...new Set([
    identifiers.phone,
    identifiers.phone.startsWith('0') ? `+84${identifiers.phone.slice(1)}` : '',
    identifiers.phone.startsWith('0') ? `84${identifiers.phone.slice(1)}` : ''
  ].filter(Boolean))];
  const promises: Array<Promise<any[]>> = [
    queryEquals(db, collection, 'customerAccountUid', identifiers.uid, limit)
  ];
  if (identifiers.partyMasterId) {
    promises.push(queryEquals(db, collection, 'partyMasterId', identifiers.partyMasterId, limit));
    promises.push(queryEquals(db, collection, 'customerPartyMasterId', identifiers.partyMasterId, limit));
  }
  for (const partnerId of [...identifiers.legacyPartnerIds].slice(0, 10)) promises.push(queryEquals(db, collection, 'customerId', partnerId, limit));
  for (const phone of phoneVariants) promises.push(queryEquals(db, collection, 'customerPhone', phone, limit));
  const rows = (await Promise.all(promises)).flat();
  const unique = new Map<string, any>();
  for (const row of rows) if (recordBelongsToCustomer(row, authority)) unique.set(row.id, row);
  return [...unique.values()].sort((left, right) => timestampMillis(right.updatedAt || right.createdAt || right.date) - timestampMillis(left.updatedAt || left.createdAt || left.date));
}

async function resolveOwnedCustomerDevice(db: Firestore, authority: CustomerAuthority, deviceId: string) {
  const normalizedDeviceId = text(deviceId, 120);
  if (!normalizedDeviceId) return null;
  const [invoices, workOrders] = await Promise.all([
    loadOwnedRecords(db, 'invoices', authority, 150),
    loadOwnedRecords(db, 'technicalWorkOrders', authority, 200)
  ]);
  for (const invoice of invoices) {
    const rows = [
      ...(Array.isArray(invoice.devices) ? invoice.devices : []),
      ...(Array.isArray(invoice.items) ? invoice.items : [])
    ];
    for (const row of rows) {
      const imei = text(row.imei, 30).replace(/\D/g, '');
      if (imei && hashId('CDEV', imei) === normalizedDeviceId) {
        return { imei, model: text(row.model || row.name, 200) };
      }
    }
  }
  for (const workOrder of workOrders) {
    const imei = text(workOrder.imei, 30).replace(/\D/g, '');
    if (imei && hashId('CDEV', imei) === normalizedDeviceId) {
      return { imei, model: text(workOrder.model, 200) };
    }
  }
  return null;
}

async function loadLines(db: Firestore, workOrderIds: string[]) {
  const byWorkOrder = new Map<string, any[]>();
  for (let offset = 0; offset < workOrderIds.length; offset += 25) {
    const ids = workOrderIds.slice(offset, offset + 25);
    if (!ids.length) continue;
    const snapshot = await db.collection('technicalWorkOrderLines').where('workOrderId', 'in', ids).limit(500).get();
    for (const document of snapshot.docs) {
      const row = { id: document.id, ...document.data() } as any;
      const current = byWorkOrder.get(text(row.workOrderId)) || [];
      current.push(row);
      byWorkOrder.set(text(row.workOrderId), current);
    }
  }
  return byWorkOrder;
}

export async function listCustomerRepairs(db: Firestore, authority: CustomerAuthority) {
  const workOrders = await loadOwnedRecords(db, 'technicalWorkOrders', authority, 200);
  const lines = await loadLines(db, workOrders.map(item => item.id));
  return workOrders.map(item => projectCustomerWorkOrder(item, lines.get(item.id) || []));
}

export async function getCustomerRepair(db: Firestore, authority: CustomerAuthority, workOrderId: string) {
  const snapshot = await db.collection('technicalWorkOrders').doc(text(workOrderId, 120)).get();
  if (!snapshot.exists) throw new Error('CUSTOMER_REPAIR_NOT_FOUND');
  const workOrder = { id: snapshot.id, ...snapshot.data() };
  if (!recordBelongsToCustomer(workOrder, authority)) throw new Error('CUSTOMER_REPAIR_ACCESS_DENIED');
  const linesSnapshot = await db.collection('technicalWorkOrderLines').where('workOrderId', '==', snapshot.id).limit(100).get();
  return projectCustomerWorkOrder(workOrder, linesSnapshot.docs.map(document => ({ id: document.id, ...document.data() })));
}

function addMonths(date: Date, months: number): Date {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}

export async function listCustomerDevices(db: Firestore, authority: CustomerAuthority) {
  const [invoices, workOrders, settingsSnapshot] = await Promise.all([
    loadOwnedRecords(db, 'invoices', authority, 150),
    loadOwnedRecords(db, 'technicalWorkOrders', authority, 200),
    db.collection('storeSettings').doc('main').get()
  ]);
  const defaultWarrantyMonths = safeInt(settingsSnapshot.data()?.defaultWarrantyMonths, 12) || 12;
  const deviceMap = new Map<string, any>();
  for (const invoice of invoices) {
    const invoiceDevices = Array.isArray(invoice.devices)
      ? invoice.devices
      : (Array.isArray(invoice.items) ? invoice.items.filter((item: any) => text(item.type).toLowerCase() === 'device' || item.imei) : []);
    const purchaseAt = toIso(invoice.completedAt || invoice.createdAt || invoice.date || invoice.saleDate) || new Date().toISOString();
    for (const row of invoiceDevices) {
      const imei = text(row.imei, 30);
      if (!imei) continue;
      const months = safeInt(row.warrantyPeriodMonths ?? invoice.warrantyPeriodMonths, defaultWarrantyMonths) || defaultWarrantyMonths;
      const warrantyUntil = addMonths(new Date(purchaseAt), months).toISOString();
      const daysRemaining = Math.ceil((new Date(warrantyUntil).getTime() - Date.now()) / 86_400_000);
      deviceMap.set(imei, {
        id: hashId('CDEV', imei),
        model: text(row.model || row.name, 200),
        imeiMasked: maskCustomerImei(imei),
        purchaseAt,
        branchId: text(invoice.branchId, 120),
        branchName: text(invoice.branchName || invoice.branch, 200),
        invoiceId: invoice.id,
        invoiceCode: text(invoice.invoiceCode || invoice.code || invoice.id, 120),
        warrantyMonths: months,
        warrantyUntil,
        warrantyStatus: daysRemaining < 0 ? 'EXPIRED' : daysRemaining <= 30 ? 'EXPIRING' : 'ACTIVE',
        daysRemaining: Math.max(0, daysRemaining),
        repairCount: workOrders.filter(order => text(order.imei) === imei).length,
        imei
      });
    }
  }
  for (const order of workOrders) {
    const imei = text(order.imei, 30);
    if (!imei || deviceMap.has(imei)) continue;
    deviceMap.set(imei, {
      id: hashId('CDEV', imei),
      model: text(order.model, 200),
      imeiMasked: maskCustomerImei(imei),
      purchaseAt: null,
      branchId: text(order.branchId, 120),
      branchName: '',
      invoiceId: null,
      invoiceCode: null,
      warrantyMonths: 0,
      warrantyUntil: null,
      warrantyStatus: 'UNKNOWN',
      daysRemaining: null,
      repairCount: workOrders.filter(item => text(item.imei) === imei).length,
      imei
    });
  }
  return [...deviceMap.values()].map(({ imei: _imei, ...safe }) => safe);
}

function validateVerificationEvidence(invoices: any[], verificationValue: string): boolean {
  const normalized = text(verificationValue, 120).toUpperCase();
  if (!normalized) return false;
  return invoices.some(invoice => {
    if ([invoice.id, invoice.invoiceCode, invoice.code].some(value => text(value).toUpperCase() === normalized)) return true;
    const rows = [...(Array.isArray(invoice.devices) ? invoice.devices : []), ...(Array.isArray(invoice.items) ? invoice.items : [])];
    return rows.some((item: any) => text(item.imei).toUpperCase() === normalized);
  });
}

export async function linkCustomerAccount(
  db: Firestore,
  identity: { uid: string; phoneNormalized: string },
  input: { verificationValue?: string; displayName?: string }
) {
  const phone = normalizePartyPhone(identity.phoneNormalized);
  if (!/^0\d{9}$/.test(phone)) throw new Error('CUSTOMER_PHONE_INVALID');
  const masterSnapshot = await db.collection('partyMasters').where('phoneNormalized', '==', phone).limit(5).get();
  const masters = masterSnapshot.docs.map(document => ({ id: document.id, ...document.data() }));

  let selectedMaster: any = masters.length === 1 ? masters[0] : null;
  if (masters.length > 1) {
    const candidateInvoices = (await Promise.all(masters.flatMap(master => [
      queryEquals(db, 'invoices', 'customerPartyMasterId', master.id, 50),
      queryEquals(db, 'invoices', 'partyMasterId', master.id, 50)
    ]))).flat();
    if (!validateVerificationEvidence(candidateInvoices, text(input.verificationValue))) throw new Error('CUSTOMER_IDENTITY_ADDITIONAL_VERIFICATION_REQUIRED');
    selectedMaster = masters.find(master => candidateInvoices.some(invoice => [invoice.customerPartyMasterId, invoice.partyMasterId].includes(master.id) && validateVerificationEvidence([invoice], text(input.verificationValue)))) || null;
    if (!selectedMaster) throw new Error('CUSTOMER_IDENTITY_VERIFICATION_FAILED');
  }

  const partyMasterId = text(selectedMaster?.id, 120) || null;
  const accountsSnapshot = partyMasterId
    ? await db.collection('branchPartyAccounts').where('partyMasterId', '==', partyMasterId).limit(100).get()
    : null;
  const branchAccounts: any[] = accountsSnapshot?.docs.map(document => ({ id: document.id, ...document.data() } as any)) || [];
  const legacyPartnerIds = [...new Set(branchAccounts.map(account => text(account.legacyPartnerId, 120)).filter(Boolean))];
  const linkedBranchIds = [...new Set(branchAccounts.map(account => text(account.branchId, 120)).filter(Boolean))];
  const now = new Date().toISOString();
  const accountRef = db.collection('customerAccounts').doc(identity.uid);
  const existing = await accountRef.get();
  if (existing.exists && normalizePartyPhone(existing.data()?.phoneNormalized) && normalizePartyPhone(existing.data()?.phoneNormalized) !== phone) {
    throw new Error('CUSTOMER_ACCOUNT_RELINK_REQUIRES_SUPPORT');
  }
  const accountsWithPhone = await db.collection('customerAccounts').where('phoneNormalized', '==', phone).limit(3).get();
  const phoneConflict = accountsWithPhone.docs.find(document => document.id !== identity.uid && document.data()?.status !== 'BLOCKED');
  if (phoneConflict) throw new Error('CUSTOMER_ACCOUNT_ALREADY_LINKED');
  if (partyMasterId) {
    const linkedAccounts = await db.collection('customerAccounts').where('partyMasterId', '==', partyMasterId).limit(3).get();
    const conflict = linkedAccounts.docs.find(document => document.id !== identity.uid && document.data()?.status !== 'BLOCKED');
    if (conflict) throw new Error('CUSTOMER_ACCOUNT_ALREADY_LINKED');
  }
  const displayName = text(input.displayName || selectedMaster?.displayName || selectedMaster?.legalName || existing.data()?.displayName || 'Khách hàng PhoneHouse', 160);
  const account = {
    id: identity.uid,
    firebaseUid: identity.uid,
    phoneNormalized: phone,
    phoneVerified: true,
    partyMasterId,
    legacyPartnerIds,
    linkedBranchIds,
    displayName,
    status: 'ACTIVE',
    isActive: true,
    notificationConsent: existing.data()?.notificationConsent !== false,
    marketingConsent: existing.data()?.marketingConsent === true,
    linkStatus: partyMasterId ? 'LINKED' : 'NO_EXISTING_CUSTOMER_DATA',
    linkedAt: existing.data()?.linkedAt || now,
    updatedAt: now,
    lastLoginAt: now
  };
  const phoneLinkRef = db.collection('customerAccountPhoneLinks').doc(hashId('CAPL', phone));
  const partyLinkRef = partyMasterId
    ? db.collection('customerAccountPartyLinks').doc(hashId('CAPL_PARTY', partyMasterId))
    : null;
  await db.runTransaction(async transaction => {
    const [latestAccount, phoneLink, partyLink] = await Promise.all([
      transaction.get(accountRef),
      transaction.get(phoneLinkRef),
      partyLinkRef ? transaction.get(partyLinkRef) : Promise.resolve(null)
    ]);
    const latestPhone = normalizePartyPhone(latestAccount.data()?.phoneNormalized);
    if (latestAccount.exists && latestPhone && latestPhone !== phone) throw new Error('CUSTOMER_ACCOUNT_RELINK_REQUIRES_SUPPORT');
    if (phoneLink.exists && phoneLink.data()?.customerAccountUid !== identity.uid) throw new Error('CUSTOMER_ACCOUNT_ALREADY_LINKED');
    if (partyLink?.exists && partyLink.data()?.customerAccountUid !== identity.uid) throw new Error('CUSTOMER_ACCOUNT_ALREADY_LINKED');
    transaction.set(accountRef, account, { merge: true });
    transaction.set(phoneLinkRef, { phoneNormalized: phone, customerAccountUid: identity.uid, updatedAt: now }, { merge: true });
    if (partyLinkRef) transaction.set(partyLinkRef, { partyMasterId, customerAccountUid: identity.uid, updatedAt: now }, { merge: true });
  });

  // Backfill only records whose verified phone matches. This lets future state
  // transitions emit push notifications without broad phone scans.
  const phoneVariants = [...new Set([phone, `+84${phone.slice(1)}`, `84${phone.slice(1)}`])];
  const workOrders = (await Promise.all(phoneVariants.map(value => queryEquals(db, 'technicalWorkOrders', 'customerPhone', value, 150)))).flat();
  const linkAuthority: CustomerAuthority = { uid: identity.uid, phoneNormalized: phone, account };
  let batch = db.batch();
  let writes = 0;
  for (const workOrder of workOrders) {
    // Never let a phone-only backfill take over a record that is already bound
    // to another customer UID or another canonical party.
    if (!recordBelongsToCustomer(workOrder, linkAuthority)) continue;
    batch.set(db.collection('technicalWorkOrders').doc(workOrder.id), {
      customerAccountUid: identity.uid,
      ...(partyMasterId ? { partyMasterId } : {}),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    writes += 1;
  }
  if (writes) await batch.commit();
  return projectCustomerAccount(identity.uid, account);
}

export function projectPromotion(record: any, personalized = false) {
  return {
    id: text(record.id, 120),
    title: text(record.title, 200),
    summary: text(record.summary, 500),
    details: text(record.details, 5000),
    category: text(record.category || 'GENERAL', 30),
    bannerUrl: text(record.bannerUrl, 1000) || null,
    startsAt: toIso(record.startsAt),
    endsAt: toIso(record.endsAt),
    branchIds: list(record.branchIds, 100, 120),
    allBranches: record.allBranches === true || !Array.isArray(record.branchIds) || record.branchIds.length === 0,
    conditions: list(record.conditions, 30, 500),
    ctaLabel: text(record.ctaLabel || 'Xem chi tiết', 80),
    ctaType: text(record.ctaType || 'DETAIL', 30),
    voucherCode: text(record.voucherCode, 80) || null,
    personalized: personalized === true
  };
}

function promotionIsEffective(record: any, now = Date.now()) {
  const status = text(record.status).toUpperCase();
  return (status === 'PUBLISHED' || status === 'SCHEDULED')
    && (!record.startsAt || timestampMillis(record.startsAt) <= now)
    && (!record.endsAt || timestampMillis(record.endsAt) >= now);
}

function promotionMatchesCustomer(record: any, account: Record<string, any>, devices: any[]) {
  const targetBranches = new Set(list(record.branchIds, 100, 120));
  const linkedBranches = new Set(list(account.linkedBranchIds, 100, 120));
  const branchMatch = record.allBranches === true || targetBranches.size === 0 || [...linkedBranches].some(id => targetBranches.has(id));
  const models = list(record.targetModelKeywords, 50, 160).map(value => value.toLowerCase());
  const modelMatch = models.length === 0 || devices.some(device => models.some(keyword => text(device.model).toLowerCase().includes(keyword)));
  const tiers = new Set(list(record.targetCustomerTiers, 20, 40).map(value => value.toUpperCase()));
  const tierMatch = tiers.size === 0 || tiers.has(text(account.customerTier || 'STANDARD').toUpperCase());
  const activities = new Set(list(record.targetActivityTypes, 10, 40).map(value => value.toUpperCase()));
  const activityMatch = activities.size === 0
    || (activities.has('PURCHASE') && devices.some(device => Boolean(device.purchaseAt)))
    || (activities.has('REPAIR') && devices.some(device => safeInt(device.repairCount) > 0))
    || (activities.has('WARRANTY') && devices.some(device => safeInt(device.repairCount) > 0 && device.warrantyStatus !== 'UNKNOWN'));
  const hasPersonalTarget = record.allBranches === false || targetBranches.size > 0 || models.length > 0 || tiers.size > 0 || activities.size > 0;
  return hasPersonalTarget && branchMatch && modelMatch && tierMatch && activityMatch;
}

export async function listPublicPromotions(db: Firestore) {
  const snapshot = await db.collection('promotionCampaigns').where('status', 'in', ['PUBLISHED', 'SCHEDULED']).limit(200).get();
  return snapshot.docs
    .map(document => ({ id: document.id, ...document.data() } as any))
    .filter(promotionIsEffective)
    .sort((left, right) => safeInt(right.priority) - safeInt(left.priority) || timestampMillis(left.endsAt) - timestampMillis(right.endsAt))
    .map(item => projectPromotion(item));
}

export async function listPersonalizedPromotions(db: Firestore, authority: CustomerAuthority) {
  const [promotions, devices] = await Promise.all([listPublicPromotions(db), listCustomerDevices(db, authority)]);
  const rawSnapshot = await db.collection('promotionCampaigns').where('status', 'in', ['PUBLISHED', 'SCHEDULED']).limit(200).get();
  const rawById = new Map<string, any>(rawSnapshot.docs.map(document => [document.id, { id: document.id, ...document.data() } as any]));
  return promotions.map(promotion => ({
    ...promotion,
    personalized: promotionMatchesCustomer(rawById.get(promotion.id) || {}, authority.account, devices)
  })).sort((left, right) => Number(right.personalized) - Number(left.personalized));
}

export async function publicBootstrap(db: Firestore) {
  const [settingsSnapshot, branchesSnapshot, promotions] = await Promise.all([
    db.collection('storeSettings').doc('main').get(),
    db.collection('branches').where('isActive', '==', true).limit(100).get(),
    listPublicPromotions(db)
  ]);
  const settings = settingsSnapshot.data() || {};
  return {
    brand: {
      name: text(settings.brandName || settings.companyName || 'PhoneHouse', 160),
      slogan: text(settings.slogan || 'An tâm mua sắm · Tận tâm hậu mãi', 300),
      hotline: text(settings.hotline, 30),
      supportEmail: text(settings.supportEmail, 160),
      logoUrl: text(settings.logoUrl, 1000) || null
    },
    branches: branchesSnapshot.docs.map(document => {
      const branch = document.data();
      return {
        id: document.id,
        name: text(branch.name, 160),
        address: text(branch.address, 500),
        phone: text(branch.phone, 30),
        openingHours: text(branch.openingHours, 100),
        latitude: Number.isFinite(Number(branch.gpsLatitude)) ? Number(branch.gpsLatitude) : null,
        longitude: Number.isFinite(Number(branch.gpsLongitude)) ? Number(branch.gpsLongitude) : null
      };
    }),
    promotions: promotions.slice(0, 6),
    generatedAt: new Date().toISOString()
  };
}

export async function createCustomerServiceRequest(db: Firestore, authority: CustomerAuthority, input: any) {
  const operationKey = text(input.idempotencyKey, 160);
  if (operationKey.length < 8) throw new Error('CUSTOMER_REQUEST_IDEMPOTENCY_REQUIRED');
  const requestType = text(input.requestType, 20).toUpperCase();
  if (!CUSTOMER_REQUEST_TYPES.has(requestType)) throw new Error('CUSTOMER_REQUEST_TYPE_INVALID');
  const deviceId = text(input.deviceId, 120);
  let imei = text(input.imei, 30).replace(/\D/g, '');
  let model = text(input.model, 200);
  const description = text(input.description, 3000);
  const submittedIssueCode = text(input.issueCode || input.issueType, 120).toUpperCase();
  const canonicalIssue = customerRepairIssueByCode(submittedIssueCode);
  if (input.issueCode && !canonicalIssue) throw new Error('CUSTOMER_REQUEST_ISSUE_INVALID');
  const issueCode = canonicalIssue?.code || 'OTHER';
  const issueLabel = canonicalIssue?.label || text(input.issueLabel || input.issueType, 160) || 'Lỗi khác';
  const branchId = text(input.branchId, 120);
  if (deviceId) {
    const ownedDevice = await resolveOwnedCustomerDevice(db, authority, deviceId);
    if (!ownedDevice) throw new Error('CUSTOMER_REQUEST_DEVICE_NOT_OWNED');
    // A linked device is always resolved from customer-owned server records.
    // Never trust an IMEI/model pair submitted alongside the opaque device ID.
    imei = ownedDevice.imei;
    model = ownedDevice.model;
  }
  if (!/^\d{15}$/.test(imei) || !model || description.length < 5 || !branchId || !issueCode) throw new Error('CUSTOMER_REQUEST_REQUIRED_FIELDS');
  const branchSnapshot = await db.collection('branches').doc(branchId).get();
  if (!branchSnapshot.exists || branchSnapshot.data()?.isActive === false) throw new Error('CUSTOMER_REQUEST_BRANCH_INVALID');
  let preferredVisitAt: string | null = null;
  if (input.preferredVisitAt) {
    const parsed = new Date(input.preferredVisitAt);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() < Date.now() - 30 * 60_000) throw new Error('CUSTOMER_REQUEST_VISIT_TIME_INVALID');
    preferredVisitAt = parsed.toISOString();
  }
  const requestId = hashId('CSR', authority.uid, operationKey);
  const requestRef = db.collection('customerServiceRequests').doc(requestId);
  const idemRef = db.collection('customerPortalIdempotency').doc(hashId('CPI', authority.uid, operationKey));
  const now = new Date().toISOString();
  return db.runTransaction(async transaction => {
    const existingIdem = await transaction.get(idemRef);
    if (existingIdem.exists) {
      const existing = await transaction.get(requestRef);
      if (!existing.exists || existing.data()?.customerAccountUid !== authority.uid) throw new Error('CUSTOMER_REQUEST_IDEMPOTENCY_CORRUPTED');
      return { id: existing.id, ...existing.data(), idempotentReplay: true };
    }
    const request = {
      id: requestId,
      customerAccountUid: authority.uid,
      partyMasterId: authority.account.partyMasterId || null,
      customerName: text(authority.account.displayName, 160),
      customerPhone: authority.phoneNormalized,
      requestType,
      deviceId: deviceId || null,
      imei,
      model,
      issueType: issueCode,
      issueCode,
      issueLabel,
      description,
      branchId,
      branchName: text(branchSnapshot.data()?.name, 160),
      preferredVisitAt,
      evidenceIds: [],
      status: 'SUBMITTED',
      source: 'PHONEHOUSE_CARE',
      createdAt: now,
      updatedAt: now
    };
    transaction.create(requestRef, request);
    transaction.create(idemRef, { id: idemRef.id, customerAccountUid: authority.uid, operationKey, requestId, createdAt: now });
    return request;
  });
}

export async function listCustomerServiceRequests(db: Firestore, authority: CustomerAuthority) {
  const snapshot = await db.collection('customerServiceRequests')
    .where('customerAccountUid', '==', authority.uid)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() }))
    .sort((left: any, right: any) => timestampMillis(right.createdAt) - timestampMillis(left.createdAt))
    .map((request: any) => ({
      id: request.id,
      type: request.requestType,
      model: request.model,
      imeiMasked: maskCustomerImei(request.imei),
      issueType: request.issueCode || request.issueType,
      issueLabel: request.issueLabel || request.issueType,
      description: request.description,
      branchId: request.branchId,
      branchName: request.branchName,
      preferredVisitAt: toIso(request.preferredVisitAt),
      status: request.status,
      statusLabel: request.status === 'CONVERTED' ? 'Đã tiếp nhận' : request.status === 'REJECTED' ? 'Cần bổ sung thông tin' : 'Đã gửi yêu cầu',
      convertedWorkOrderId: request.convertedWorkOrderId || null,
      evidenceCount: Array.isArray(request.evidenceIds) ? request.evidenceIds.length : 0,
      createdAt: toIso(request.createdAt),
      updatedAt: toIso(request.updatedAt)
    }));
}

export async function createQuoteApprovalChallenge(db: Firestore, authority: CustomerAuthority, workOrderId: string) {
  const repair = await getCustomerRepair(db, authority, workOrderId);
  if (repair.type === 'WARRANTY' || !repair.quote.mayDecide) throw new Error('CUSTOMER_QUOTE_NOT_DECIDABLE');
  const challengeId = hashId('CQA_CH', authority.uid, workOrderId, repair.quote.version, Date.now(), crypto.randomBytes(8).toString('hex'));
  const nowMs = Date.now();
  await db.collection('customerQuoteApprovalChallenges').doc(challengeId).create({
    id: challengeId,
    customerAccountUid: authority.uid,
    workOrderId,
    quoteVersion: repair.quote.version,
    approvedFinalAmount: repair.quote.amount,
    phoneNormalized: authority.phoneNormalized,
    status: 'OPEN',
    createdAtMs: nowMs,
    createdAt: new Date(nowMs).toISOString(),
    expiresAtMs: nowMs + 5 * 60_000
  });
  return { challengeId, workOrderId, quoteVersion: repair.quote.version, approvedFinalAmount: repair.quote.amount, expiresAt: new Date(nowMs + 5 * 60_000).toISOString() };
}

export async function decideCustomerQuote(db: Firestore, authority: CustomerAuthority, workOrderId: string, input: any) {
  const decision = text(input.decision, 30).toUpperCase();
  if (!['ACCEPT', 'CONSULT', 'REJECT'].includes(decision)) throw new Error('CUSTOMER_QUOTE_DECISION_INVALID');
  const challengeId = text(input.challengeId, 120);
  const reauthToken = text(input.reauthToken, 5000);
  let verifiedReauthTime = 0;
  if (decision === 'ACCEPT') {
    if (!challengeId || !reauthToken) throw new Error('CUSTOMER_QUOTE_REAUTH_REQUIRED');
    const decoded = await adminAuth.verifyIdToken(reauthToken);
    if (decoded.uid !== authority.uid || normalizePartyPhone(decoded.phone_number) !== authority.phoneNormalized) throw new Error('CUSTOMER_QUOTE_REAUTH_IDENTITY_MISMATCH');
    verifiedReauthTime = Number(decoded.auth_time || 0) * 1000;
  }
  const workOrderRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const challengeRef = challengeId ? db.collection('customerQuoteApprovalChallenges').doc(challengeId) : null;
  const approvalId = decision === 'ACCEPT'
    ? hashId('CQA', authority.uid, workOrderId, challengeId)
    : hashId('CQA', authority.uid, workOrderId, decision, Date.now(), crypto.randomBytes(6).toString('hex'));
  const approvalRef = db.collection('customerQuoteApprovals').doc(approvalId);
  const now = new Date().toISOString();
  return db.runTransaction(async transaction => {
    const workOrderSnapshot = await transaction.get(workOrderRef);
    if (!workOrderSnapshot.exists) throw new Error('CUSTOMER_REPAIR_NOT_FOUND');
    const workOrder = { id: workOrderSnapshot.id, ...workOrderSnapshot.data() } as any;
    if (!recordBelongsToCustomer(workOrder, authority)) throw new Error('CUSTOMER_REPAIR_ACCESS_DENIED');
    let challenge: any = null;
    if (decision === 'ACCEPT') {
      const challengeSnapshot = await transaction.get(challengeRef!);
      if (!challengeSnapshot.exists) throw new Error('CUSTOMER_QUOTE_CHALLENGE_NOT_FOUND');
      challenge = challengeSnapshot.data()!;
      if (challenge.customerAccountUid !== authority.uid || challenge.workOrderId !== workOrderId) throw new Error('CUSTOMER_QUOTE_CHALLENGE_INVALID');
      if (challenge.status === 'USED' && challenge.approvalId === approvalId) {
        const existingApproval = await transaction.get(approvalRef);
        if (existingApproval.exists && existingApproval.data()?.customerAccountUid === authority.uid && existingApproval.data()?.workOrderId === workOrderId) {
          return { id: existingApproval.id, ...existingApproval.data(), idempotentReplay: true } as any;
        }
      }
      if (challenge.status !== 'OPEN') throw new Error('CUSTOMER_QUOTE_CHALLENGE_INVALID');
      if (Number(challenge.expiresAtMs || 0) < Date.now()) throw new Error('CUSTOMER_QUOTE_CHALLENGE_EXPIRED');
      if (verifiedReauthTime + 5_000 < Number(challenge.createdAtMs || 0)) throw new Error('CUSTOMER_QUOTE_FRESH_OTP_REQUIRED');
      const currentQuoteStatus = text(workOrder.quoteStatus, 50).toUpperCase();
      if (!['PENDING_APPROVAL', 'APPROVED'].includes(currentQuoteStatus) || workOrder.pendingQuoteAdjustmentId || workOrder.customerApprovalStatus === 'ACCEPTED') {
        throw new Error('CUSTOMER_QUOTE_VERSION_CHANGED');
      }
      const currentVersion = safeInt(workOrder.quoteVersion);
      const currentAmount = safeInt(workOrder.proposedQuoteAmount ?? workOrder.approvedFinalAmount ?? workOrder.customerApprovedQuote ?? workOrder.totalEstimatedCost);
      if (currentVersion !== safeInt(challenge.quoteVersion) || currentAmount !== safeInt(challenge.approvedFinalAmount)) throw new Error('CUSTOMER_QUOTE_VERSION_CHANGED');
      transaction.update(challengeRef!, { status: 'USED', usedAt: now, approvalId });
    }
    const amount = safeInt(workOrder.proposedQuoteAmount ?? workOrder.approvedFinalAmount ?? workOrder.customerApprovedQuote ?? workOrder.totalEstimatedCost);
    const approval = {
      id: approvalId,
      customerAccountUid: authority.uid,
      partyMasterId: authority.account.partyMasterId || null,
      workOrderId,
      quoteVersion: safeInt(workOrder.quoteVersion),
      approvedFinalAmount: amount,
      decision,
      challengeId: challengeId || null,
      reason: text(input.reason, 1000),
      approvedByVerifiedPhone: decision === 'ACCEPT' ? authority.phoneNormalized : null,
      createdAt: now
    };
    transaction.create(approvalRef, approval);
    transaction.update(workOrderRef, {
      customerApprovalStatus: decision === 'ACCEPT' ? 'ACCEPTED' : decision === 'CONSULT' ? 'CONSULT_REQUESTED' : 'REJECTED',
      customerApprovalId: approvalId,
      customerApprovalAt: now,
      customerApprovedAt: decision === 'ACCEPT' ? now : null,
      ...(decision === 'ACCEPT' ? { approvedFinalAmount: amount, customerApprovedQuote: amount, quoteStatus: 'APPROVED' } : {}),
      ...(decision === 'REJECT' ? { quoteStatus: 'REJECTED' } : {}),
      updatedAt: FieldValue.serverTimestamp()
    });
    return approval;
  });
}

async function sendPushForNotification(db: Firestore, customerAccountUid: string, notification: any) {
  const subscriptions = await db.collection('customerPushSubscriptions').where('customerAccountUid', '==', customerAccountUid).where('status', '==', 'ACTIVE').limit(500).get();
  const tokens = [...new Set(subscriptions.docs.map(document => text(document.data().token, 4096)).filter(Boolean))];
  if (!tokens.length) return { attempted: 0, success: 0 };
  try {
    const result = await adminMessaging.sendEachForMulticast({
      tokens,
      notification: { title: notification.title, body: notification.body },
      data: { notificationId: notification.id, type: notification.type, url: notification.url || '/khach-hang' },
      webpush: { fcmOptions: { link: notification.url || '/khach-hang' } }
    });
    const invalidTokens: string[] = [];
    result.responses.forEach((response, index) => {
      if (!response.success && /registration-token-not-registered|invalid-registration-token/.test(String(response.error?.code || ''))) invalidTokens.push(tokens[index]);
    });
    if (invalidTokens.length) {
      const batch = db.batch();
      for (const document of subscriptions.docs) if (invalidTokens.includes(text(document.data().token, 4096))) batch.set(document.ref, { status: 'INVALID', invalidatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await batch.commit();
    }
    return { attempted: tokens.length, success: result.successCount };
  } catch (error: any) {
    console.warn('[Customer push]', error?.message || error);
    return { attempted: tokens.length, success: 0 };
  }
}

export async function emitCustomerNotification(db: Firestore, input: {
  customerAccountUid: string;
  idempotencyKey: string;
  type: string;
  title: string;
  body: string;
  url?: string;
  branchId?: string;
  workOrderId?: string;
  marketing?: boolean;
}) {
  const uid = text(input.customerAccountUid, 128);
  if (!uid) return null;
  const accountSnapshot = await db.collection('customerAccounts').doc(uid).get();
  if (!accountSnapshot.exists || accountSnapshot.data()?.status === 'BLOCKED') return null;
  if (input.marketing && accountSnapshot.data()?.marketingConsent !== true) return null;
  const id = hashId('CNT', uid, input.idempotencyKey);
  const reference = db.collection('customerNotifications').doc(id);
  const notification = {
    id,
    customerAccountUid: uid,
    type: text(input.type, 80),
    title: text(input.title, 200),
    body: text(input.body, 500),
    url: text(input.url || '/khach-hang', 500),
    branchId: text(input.branchId, 120) || null,
    workOrderId: text(input.workOrderId, 120) || null,
    marketing: input.marketing === true,
    read: false,
    createdAt: new Date().toISOString()
  };
  try {
    await reference.create(notification);
  } catch {
    return { ...notification, duplicate: true };
  }
  if (accountSnapshot.data()?.notificationConsent !== false) {
    const push = await sendPushForNotification(db, uid, notification);
    await reference.set({ pushAttempted: push.attempted, pushSuccess: push.success, pushSentAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return notification;
}

export async function syncCustomerWorkOrderNotification(db: Firestore, workOrderId: string, eventHint = '') {
  const snapshot = await db.collection('technicalWorkOrders').doc(workOrderId).get();
  if (!snapshot.exists) return null;
  const workOrder = { id: snapshot.id, ...snapshot.data() } as any;
  const uid = text(workOrder.customerAccountUid, 128);
  if (!uid) return null;
  const stage = customerFriendlyRepairStage(workOrder);
  return emitCustomerNotification(db, {
    customerAccountUid: uid,
    idempotencyKey: `WORK_ORDER:${workOrderId}:${stage}:${safeInt(workOrder.quoteVersion)}:${eventHint}`,
    type: stage === 'WAITING_QUOTE_APPROVAL' ? 'QUOTE_UPDATED' : 'REPAIR_STATUS_UPDATED',
    title: stage === 'READY_FOR_PICKUP' ? 'Máy đã sẵn sàng nhận' : stage === 'WAITING_QUOTE_APPROVAL' ? 'Có báo giá mới cần xác nhận' : 'Tiến độ sửa chữa đã cập nhật',
    body: `${text(workOrder.model, 120)} · ${STAGE_LABELS[stage]}`,
    url: `/khach-hang/sua-chua?repair=${encodeURIComponent(workOrderId)}`,
    branchId: workOrder.branchId,
    workOrderId
  });
}

export async function listCustomerNotifications(db: Firestore, authority: CustomerAuthority) {
  const snapshot = await db.collection('customerNotifications')
    .where('customerAccountUid', '==', authority.uid)
    .orderBy('createdAt', 'desc')
    .limit(150)
    .get();
  return snapshot.docs.map(document => ({ id: document.id, ...document.data(), createdAt: toIso(document.data().createdAt) }))
    .sort((left: any, right: any) => timestampMillis(right.createdAt) - timestampMillis(left.createdAt));
}

export async function savePushSubscription(db: Firestore, authority: CustomerAuthority, input: any) {
  const token = text(input.token, 4096);
  if (token.length < 40) throw new Error('CUSTOMER_PUSH_TOKEN_INVALID');
  // One browser token may belong to only one active customer account. This
  // prevents a shared phone from receiving the previous customer's updates.
  const id = hashId('CPS', token);
  const record = {
    id,
    customerAccountUid: authority.uid,
    token,
    provider: 'FCM',
    status: 'ACTIVE',
    userAgent: text(input.userAgent, 500),
    deviceLabel: text(input.deviceLabel, 160),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const sameToken = await db.collection('customerPushSubscriptions').where('token', '==', token).limit(20).get();
  const batch = db.batch();
  for (const document of sameToken.docs) {
    if (document.id !== id) batch.set(document.ref, { status: 'REPLACED', replacedAt: FieldValue.serverTimestamp(), replacedBySubscriptionId: id }, { merge: true });
  }
  batch.set(db.collection('customerPushSubscriptions').doc(id), record, { merge: true });
  await batch.commit();
  return { id, status: 'ACTIVE' };
}

export async function updateCustomerProfile(db: Firestore, authority: CustomerAuthority, input: any) {
  const updates = {
    displayName: text(input.displayName || authority.account.displayName, 160),
    notificationConsent: input.notificationConsent !== false,
    marketingConsent: input.marketingConsent === true,
    updatedAt: new Date().toISOString()
  };
  await db.collection('customerAccounts').doc(authority.uid).set(updates, { merge: true });
  return projectCustomerAccount(authority.uid, { ...authority.account, ...updates });
}

async function defaultChatBranch(db: Firestore, authority: CustomerAuthority, requestedBranchId?: string) {
  const candidates = [text(requestedBranchId, 120), ...list(authority.account.linkedBranchIds, 50, 120)].filter(Boolean);
  for (const id of candidates) {
    const snapshot = await db.collection('branches').doc(id).get();
    if (snapshot.exists && snapshot.data()?.isActive !== false) return { id: snapshot.id, name: text(snapshot.data()?.name, 160) };
  }
  const snapshot = await db.collection('branches').where('isActive', '==', true).limit(1).get();
  if (snapshot.empty) throw new Error('CUSTOMER_CHAT_BRANCH_UNAVAILABLE');
  return { id: snapshot.docs[0].id, name: text(snapshot.docs[0].data().name, 160) };
}

export async function answerPublicCustomerQuestion(db: Firestore, messageInput: unknown) {
  const message = text(messageInput, 1000).toLowerCase();
  if (!message) throw new Error('CUSTOMER_CHAT_MESSAGE_REQUIRED');
  if (/cửa hàng|chi nhánh|địa chỉ|mở cửa/.test(message)) {
    const bootstrap = await publicBootstrap(db);
    const branchLines = bootstrap.branches.slice(0, 5).map(branch => `• ${branch.name}: ${branch.address}${branch.openingHours ? ` (${branch.openingHours})` : ''}`);
    return { intent: 'BRANCHES', reply: branchLines.length ? `Các cửa hàng PhoneHouse:\n${branchLines.join('\n')}` : 'Hiện chưa tải được danh sách cửa hàng. Bạn vui lòng gọi hotline PhoneHouse.' };
  }
  if (/khuyến mãi|ưu đãi|voucher|giảm giá/.test(message)) {
    const promotions = await listPublicPromotions(db);
    return { intent: 'PROMOTIONS', reply: promotions.length ? `Ưu đãi đang áp dụng:\n${promotions.slice(0, 4).map(item => `• ${item.title}`).join('\n')}` : 'Hiện chưa có chương trình ưu đãi công khai đang hiệu lực.' };
  }
  if (/bảo hành|sửa|tiến độ|báo giá|nhận máy/.test(message)) {
    return { intent: 'AUTH_REQUIRED', reply: 'Để xem đúng bảo hành, báo giá và tiến độ máy của bạn, vui lòng đăng nhập bằng OTP điện thoại.' };
  }
  return { intent: 'UNKNOWN', reply: 'Tôi có thể hỗ trợ tra cứu cửa hàng, ưu đãi, bảo hành và tiến độ sửa chữa. Với dữ liệu cá nhân, bạn vui lòng đăng nhập bằng OTP.' };
}

async function answerAuthenticatedQuestion(db: Firestore, authority: CustomerAuthority, messageInput: unknown) {
  const message = text(messageInput, 1000).toLowerCase();
  if (/cửa hàng|chi nhánh|địa chỉ|mở cửa/.test(message) || /khuyến mãi|ưu đãi|voucher|giảm giá/.test(message)) return answerPublicCustomerQuestion(db, message);
  if (/bảo hành|còn hạn|hết hạn/.test(message)) {
    const devices = await listCustomerDevices(db, authority);
    if (!devices.length) return { intent: 'WARRANTY', reply: 'Tôi chưa tìm thấy thiết bị đã mua được liên kết với số điện thoại này.' };
    return { intent: 'WARRANTY', reply: devices.slice(0, 5).map(device => `• ${device.model}: ${device.warrantyStatus === 'ACTIVE' ? `còn bảo hành đến ${new Date(device.warrantyUntil).toLocaleDateString('vi-VN')}` : device.warrantyStatus === 'EXPIRING' ? `sắp hết hạn ${new Date(device.warrantyUntil).toLocaleDateString('vi-VN')}` : 'đã hết hoặc chưa xác định bảo hành'}`).join('\n') };
  }
  if (/báo giá|bao nhiêu|chi phí/.test(message)) {
    const repairs = await listCustomerRepairs(db, authority);
    const active = repairs.find(item => item.stage !== 'COMPLETED');
    return active ? { intent: 'QUOTE', reply: `${active.model}: báo giá hiện tại ${active.quote.amount.toLocaleString('vi-VN')}đ, trạng thái ${active.quote.status}.` } : { intent: 'QUOTE', reply: 'Bạn chưa có phiếu sửa chữa đang hoạt động.' };
  }
  if (/khi nào|hẹn trả|nhận máy/.test(message)) {
    const repairs = await listCustomerRepairs(db, authority);
    const active = repairs.find(item => item.stage !== 'COMPLETED');
    return active ? { intent: 'PROMISED_TIME', reply: active.promisedAt ? `${active.model} dự kiến hoàn tất vào ${new Date(active.promisedAt).toLocaleString('vi-VN')}.` : `${active.model} chưa có thời gian hẹn trả chính thức. Bạn có thể chuyển sang CSKH để được cập nhật.` } : { intent: 'PROMISED_TIME', reply: 'Bạn chưa có phiếu sửa chữa đang hoạt động.' };
  }
  if (/sửa|tiến độ|tới đâu|tình trạng/.test(message)) {
    const repairs = await listCustomerRepairs(db, authority);
    const active = repairs.find(item => item.stage !== 'COMPLETED') || repairs[0];
    return active ? { intent: 'REPAIR_STATUS', reply: `${active.model} · ${active.code}: ${active.stageLabel}${active.promisedAt ? `. Hẹn trả ${new Date(active.promisedAt).toLocaleString('vi-VN')}` : ''}.` } : { intent: 'REPAIR_STATUS', reply: 'Tôi chưa tìm thấy phiếu sửa chữa nào được liên kết với tài khoản này.' };
  }
  if (/nhân viên|cskh|tư vấn|người thật/.test(message)) return { intent: 'HANDOFF', reply: 'Tôi sẽ chuyển cuộc trò chuyện này cho nhân viên CSKH. Bạn vui lòng chờ phản hồi trong ứng dụng.' };
  return { intent: 'UNKNOWN', reply: 'Tôi chưa đủ dữ liệu để trả lời chắc chắn. Bạn có thể hỏi về tiến độ sửa chữa, bảo hành, báo giá, thời gian nhận máy, ưu đãi hoặc chuyển sang CSKH.' };
}

export async function createCustomerConversation(db: Firestore, authority: CustomerAuthority, input: any) {
  const branch = await defaultChatBranch(db, authority, input.branchId);
  const id = hashId('CCV', authority.uid, Date.now(), crypto.randomBytes(8).toString('hex'));
  const now = new Date().toISOString();
  const conversation = {
    id,
    customerAccountUid: authority.uid,
    partyMasterId: authority.account.partyMasterId || null,
    customerName: text(authority.account.displayName, 160),
    customerPhone: authority.phoneNormalized,
    branchId: branch.id,
    branchName: branch.name,
    status: 'BOT',
    lastMessageSnippet: '',
    createdAt: now,
    updatedAt: now
  };
  await db.collection('customerConversations').doc(id).create(conversation);
  return conversation;
}

async function customerConversationMessages(db: Firestore, conversationId: string) {
  const snapshot = await db.collection('customerMessages')
    .where('conversationId', '==', conversationId)
    .orderBy('timestamp', 'asc')
    .limit(500)
    .get();
  return snapshot.docs.map(document => ({ id: document.id, ...document.data(), timestamp: toIso(document.data().timestamp || document.data().createdAt) }))
    .sort((left: any, right: any) => timestampMillis(left.timestamp) - timestampMillis(right.timestamp));
}

function chatMessageDocument(id: string, conversation: any, sender: 'CUSTOMER' | 'BOT' | 'STAFF', senderName: string, content: string, now: string) {
  return { id, conversationId: conversation.id, customerAccountUid: conversation.customerAccountUid, sender, senderName, content, timestamp: now, createdAt: now, attachments: [] };
}

function omnichannelMessageDocument(message: any, conversation: any) {
  return {
    ...message,
    provider: 'CUSTOMER_PORTAL',
    externalMessageId: message.id,
    pageId: 'CUSTOMER_PORTAL',
    branchId: conversation.branchId,
    timestamp: Timestamp.fromDate(new Date(message.timestamp)),
    timestampIso: message.timestamp,
    messageKind: 'MESSAGE'
  };
}

export async function postCustomerMessage(db: Firestore, authority: CustomerAuthority, conversationId: string, input: any) {
  const content = text(input.content, 2000);
  const operationKey = text(input.operationKey, 160);
  if (!content || operationKey.length < 8) throw new Error('CUSTOMER_CHAT_MESSAGE_INVALID');
  const conversationRef = db.collection('customerConversations').doc(conversationId);
  const snapshot = await conversationRef.get();
  if (!snapshot.exists || snapshot.data()?.customerAccountUid !== authority.uid) throw new Error('CUSTOMER_CHAT_ACCESS_DENIED');
  const conversation = { id: snapshot.id, ...snapshot.data() } as any;
  const customerMessageId = hashId('CMSG', conversationId, authority.uid, operationKey);
  const existing = await db.collection('customerMessages').doc(customerMessageId).get();
  if (existing.exists) return { conversation, messages: await customerConversationMessages(db, conversationId), idempotentReplay: true };
  const now = new Date().toISOString();
  const customerMessage = chatMessageDocument(customerMessageId, conversation, 'CUSTOMER', text(authority.account.displayName || 'Khách hàng', 160), content, now);
  const humanMode = ['WAITING_AGENT', 'AGENT'].includes(text(conversation.status).toUpperCase());
  const answer = humanMode ? null : await answerAuthenticatedQuestion(db, authority, content);
  const botMessage = answer ? chatMessageDocument(hashId('CMSG', conversationId, customerMessageId, 'BOT'), conversation, 'BOT', 'PhoneHouse Care', answer.reply, new Date(Date.now() + 1).toISOString()) : null;
  const batch = db.batch();
  batch.create(db.collection('customerMessages').doc(customerMessage.id), customerMessage);
  if (botMessage) batch.create(db.collection('customerMessages').doc(botMessage.id), botMessage);
  batch.set(conversationRef, {
    lastMessageSnippet: botMessage?.content || content,
    lastMessageTime: botMessage?.timestamp || now,
    updatedAt: botMessage?.timestamp || now,
    ...(answer?.intent === 'HANDOFF' ? { status: 'WAITING_AGENT' } : {})
  }, { merge: true });
  if (conversation.omnichannelConversationId) {
    batch.set(db.collection('chatMessages').doc(customerMessage.id), omnichannelMessageDocument(customerMessage, conversation), { merge: true });
    batch.set(db.collection('chatConversations').doc(conversation.omnichannelConversationId), {
      lastMessageSnippet: content,
      lastMessageTime: now,
      lastCustomerMessageAt: Timestamp.fromDate(new Date(now)),
      awaitingStaffReply: true,
      unreadCount: FieldValue.increment(1),
      updatedAt: Timestamp.fromDate(new Date(now))
    }, { merge: true });
  }
  await batch.commit();
  if (answer?.intent === 'HANDOFF') await handoffCustomerConversation(db, authority, conversationId);
  return { conversation: { ...conversation, status: answer?.intent === 'HANDOFF' ? 'WAITING_AGENT' : conversation.status }, messages: await customerConversationMessages(db, conversationId) };
}

export async function listCustomerConversationMessages(db: Firestore, authority: CustomerAuthority, conversationId: string) {
  const snapshot = await db.collection('customerConversations').doc(conversationId).get();
  if (!snapshot.exists || snapshot.data()?.customerAccountUid !== authority.uid) throw new Error('CUSTOMER_CHAT_ACCESS_DENIED');
  return { conversation: { id: snapshot.id, ...snapshot.data() }, messages: await customerConversationMessages(db, conversationId) };
}

export async function handoffCustomerConversation(db: Firestore, authority: CustomerAuthority, conversationId: string) {
  const conversationRef = db.collection('customerConversations').doc(conversationId);
  const snapshot = await conversationRef.get();
  if (!snapshot.exists || snapshot.data()?.customerAccountUid !== authority.uid) throw new Error('CUSTOMER_CHAT_ACCESS_DENIED');
  const conversation = { id: snapshot.id, ...snapshot.data() } as any;
  if (conversation.omnichannelConversationId) return { conversationId, omnichannelConversationId: conversation.omnichannelConversationId, idempotentReplay: true };
  const messages = await customerConversationMessages(db, conversationId);
  const chatConversationId = hashId('CP_CONV', conversationId);
  const now = new Date().toISOString();
  const batch = db.batch();
  batch.set(db.collection('chatConversations').doc(chatConversationId), {
    id: chatConversationId,
    provider: 'CUSTOMER_PORTAL',
    pageId: 'CUSTOMER_PORTAL',
    pageName: 'PhoneHouse Care',
    externalConversationId: conversationId,
    customerConversationId: conversationId,
    customerAccountUid: authority.uid,
    branchId: conversation.branchId,
    branchName: conversation.branchName,
    channel: 'WEB',
    conversationType: 'INBOX',
    customerName: conversation.customerName,
    customerPhone: conversation.customerPhone,
    lastMessageSnippet: conversation.lastMessageSnippet || 'Khách yêu cầu hỗ trợ',
    lastMessageTime: conversation.lastMessageTime || now,
    unreadCount: 1,
    workflowStatus: 'NEW',
    priority: 'NORMAL',
    awaitingStaffReply: true,
    firstCustomerMessageAt: messages[0]?.timestamp ? Timestamp.fromDate(new Date(messages[0].timestamp)) : Timestamp.fromDate(new Date(now)),
    lastCustomerMessageAt: Timestamp.fromDate(new Date(now)),
    createdAt: Timestamp.fromDate(new Date(conversation.createdAt || now)),
    updatedAt: Timestamp.fromDate(new Date(now))
  }, { merge: true });
  for (const message of messages.slice(-100)) batch.set(db.collection('chatMessages').doc(message.id), omnichannelMessageDocument(message, conversation), { merge: true });
  batch.set(conversationRef, { status: 'WAITING_AGENT', omnichannelConversationId: chatConversationId, handedOffAt: now, updatedAt: now }, { merge: true });
  await batch.commit();
  return { conversationId, omnichannelConversationId: chatConversationId };
}

export async function sendCustomerPortalChatMessage(db: Firestore, input: { conversationId: string; text: string; operationKey: string }, actor: StaffActor) {
  const content = text(input.text, 5000);
  if (!content) throw new Error('CUSTOMER_PORTAL_MESSAGE_REQUIRED');
  const chatSnapshot = await db.collection('chatConversations').doc(input.conversationId).get();
  if (!chatSnapshot.exists || chatSnapshot.data()?.provider !== 'CUSTOMER_PORTAL') throw new Error('CUSTOMER_PORTAL_CONVERSATION_NOT_FOUND');
  const chatConversation = { id: chatSnapshot.id, ...chatSnapshot.data() } as any;
  if (!canAccessBranch(actor, text(chatConversation.branchId))) throw new Error('CUSTOMER_PORTAL_CHAT_BRANCH_FORBIDDEN');
  const customerConversationId = text(chatConversation.customerConversationId || chatConversation.externalConversationId, 120);
  const customerConversationRef = db.collection('customerConversations').doc(customerConversationId);
  const operationId = hashId('CP_SEND', input.conversationId, actor.uid, input.operationKey || content);
  const messageRef = db.collection('customerMessages').doc(operationId);
  const existing = await messageRef.get();
  if (existing.exists) return { message: { id: existing.id, ...existing.data() }, idempotentReplay: true };
  const now = new Date().toISOString();
  const message = {
    id: operationId,
    conversationId: customerConversationId,
    customerAccountUid: chatConversation.customerAccountUid,
    sender: 'STAFF',
    senderName: text(actor.name || 'CSKH PhoneHouse', 160),
    senderUid: actor.uid,
    content,
    timestamp: now,
    createdAt: now,
    attachments: []
  };
  const batch = db.batch();
  batch.create(messageRef, message);
  batch.create(db.collection('chatMessages').doc(operationId), omnichannelMessageDocument(message, chatConversation));
  batch.set(customerConversationRef, { status: 'AGENT', lastMessageSnippet: content, lastMessageTime: now, updatedAt: now }, { merge: true });
  batch.set(chatSnapshot.ref, {
    lastMessageSnippet: content,
    lastMessageTime: now,
    lastStaffMessageAt: Timestamp.fromDate(new Date(now)),
    awaitingStaffReply: false,
    unreadCount: 0,
    workflowStatus: ['WON', 'LOST', 'CLOSED'].includes(text(chatConversation.workflowStatus).toUpperCase()) ? 'OPEN' : (chatConversation.workflowStatus || 'OPEN'),
    assignedStaffId: chatConversation.assignedStaffId || actor.uid,
    assignedStaffName: chatConversation.assignedStaffName || actor.name || actor.uid,
    firstResponseAt: chatConversation.firstResponseAt || Timestamp.fromDate(new Date(now)),
    updatedAt: Timestamp.fromDate(new Date(now))
  }, { merge: true });
  await batch.commit();
  await emitCustomerNotification(db, {
    customerAccountUid: text(chatConversation.customerAccountUid, 128),
    idempotencyKey: `CHAT_REPLY:${operationId}`,
    type: 'CHAT_REPLY',
    title: 'CSKH PhoneHouse đã phản hồi',
    body: content.slice(0, 160),
    url: '/khach-hang?chat=open',
    branchId: chatConversation.branchId
  });
  return { message: { ...message, externalMessageId: message.id, messageKind: 'MESSAGE' }, idempotentReplay: false };
}

export async function markCustomerPortalConversationRead(db: Firestore, conversationId: string, actor: StaffActor) {
  const snapshot = await db.collection('chatConversations').doc(conversationId).get();
  if (!snapshot.exists || snapshot.data()?.provider !== 'CUSTOMER_PORTAL') throw new Error('CUSTOMER_PORTAL_CONVERSATION_NOT_FOUND');
  if (!canAccessBranch(actor, text(snapshot.data()?.branchId))) throw new Error('CUSTOMER_PORTAL_CHAT_BRANCH_FORBIDDEN');
  await snapshot.ref.set({ unreadCount: 0, readAt: FieldValue.serverTimestamp(), readByUid: actor.uid }, { merge: true });
  return { conversationId, unreadCount: 0 };
}

export async function listStaffCustomerRequests(db: Firestore, actor: StaffActor, input: { branchId?: string; status?: string }) {
  const branchId = text(input.branchId || actor.branchId, 120);
  if (!branchId || !canAccessBranch(actor, branchId)) throw new Error('CUSTOMER_REQUEST_BRANCH_FORBIDDEN');
  let query: any = db.collection('customerServiceRequests').where('branchId', '==', branchId);
  const status = text(input.status, 30).toUpperCase();
  if (status) {
    if (!CUSTOMER_REQUEST_STATUSES.has(status)) throw new Error('CUSTOMER_REQUEST_STATUS_INVALID');
    query = query.where('status', '==', status);
  }
  const snapshot = await query.orderBy('createdAt', 'desc').limit(200).get();
  return snapshot.docs.map((document: any) => ({ id: document.id, ...document.data() }))
    .sort((left: any, right: any) => timestampMillis(right.createdAt) - timestampMillis(left.createdAt));
}

export async function reviewCustomerRequest(db: Firestore, actor: StaffActor, requestId: string, input: any) {
  const status = text(input.status, 30).toUpperCase();
  if (!['UNDER_REVIEW', 'REJECTED', 'SUBMITTED'].includes(status)) throw new Error('CUSTOMER_REQUEST_REVIEW_STATUS_INVALID');
  const reference = db.collection('customerServiceRequests').doc(requestId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new Error('CUSTOMER_REQUEST_NOT_FOUND');
  const request = snapshot.data()!;
  if (!canAccessBranch(actor, text(request.branchId))) throw new Error('CUSTOMER_REQUEST_BRANCH_FORBIDDEN');
  if (request.status === 'CONVERTED') throw new Error('CUSTOMER_REQUEST_ALREADY_CONVERTED');
  await reference.set({ status, reviewNote: text(input.note, 1500), reviewedByUid: actor.uid, reviewedByName: actor.name || actor.uid, reviewedAt: new Date().toISOString(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (request.customerAccountUid) await emitCustomerNotification(db, {
    customerAccountUid: request.customerAccountUid,
    idempotencyKey: `REQUEST_REVIEW:${requestId}:${status}`,
    type: 'SERVICE_REQUEST_UPDATED',
    title: status === 'REJECTED' ? 'Yêu cầu cần bổ sung thông tin' : 'PhoneHouse đang xem yêu cầu của bạn',
    body: text(input.note, 300) || `${request.model} · ${status === 'REJECTED' ? 'Vui lòng liên hệ CSKH để bổ sung thông tin.' : 'Nhân viên sẽ sớm xác nhận với bạn.'}`,
    url: '/khach-hang/sua-chua',
    branchId: request.branchId
  });
  return { id: snapshot.id, ...request, status };
}

function validatePromotionDraft(input: any, existing?: any) {
  const title = text(input.title ?? existing?.title, 200);
  const summary = text(input.summary ?? existing?.summary, 500);
  const category = text(input.category ?? existing?.category ?? 'GENERAL', 30).toUpperCase();
  const startsAt = toIso(input.startsAt ?? existing?.startsAt);
  const endsAt = toIso(input.endsAt ?? existing?.endsAt);
  if (title.length < 3 || !summary || !PROMOTION_CATEGORIES.has(category) || !startsAt || !endsAt || new Date(startsAt).getTime() >= new Date(endsAt).getTime()) throw new Error('PROMOTION_REQUIRED_FIELDS_INVALID');
  return {
    title,
    summary,
    details: text(input.details ?? existing?.details, 5000),
    category,
    bannerUrl: text(input.bannerUrl ?? existing?.bannerUrl, 1000),
    startsAt,
    endsAt,
    allBranches: input.allBranches === undefined ? existing?.allBranches !== false : input.allBranches === true,
    branchIds: list(input.branchIds ?? existing?.branchIds, 100, 120),
    targetModelKeywords: list(input.targetModelKeywords ?? existing?.targetModelKeywords, 50, 160),
    targetCustomerTiers: list(input.targetCustomerTiers ?? existing?.targetCustomerTiers, 20, 40),
    targetActivityTypes: list(input.targetActivityTypes ?? existing?.targetActivityTypes, 10, 40).map(value => value.toUpperCase()).filter(value => ['PURCHASE', 'REPAIR', 'WARRANTY'].includes(value)),
    conditions: list(input.conditions ?? existing?.conditions, 30, 500),
    ctaLabel: text(input.ctaLabel ?? existing?.ctaLabel ?? 'Xem chi tiết', 80),
    ctaType: text(input.ctaType ?? existing?.ctaType ?? 'DETAIL', 30).toUpperCase(),
    voucherCode: text(input.voucherCode ?? existing?.voucherCode, 80).toUpperCase(),
    priority: Math.min(100, safeInt(input.priority ?? existing?.priority))
  };
}

export async function listStaffPromotions(db: Firestore, actor: StaffActor) {
  const snapshot = await db.collection('promotionCampaigns').limit(300).get();
  return snapshot.docs.map(document => ({ id: document.id, ...document.data(), startsAt: toIso(document.data().startsAt), endsAt: toIso(document.data().endsAt) }))
    .filter((promotion: any) => promotion.allBranches === true || list(promotion.branchIds, 100, 120).some(branchId => canAccessBranch(actor, branchId)))
    .sort((left: any, right: any) => timestampMillis(right.updatedAt || right.createdAt) - timestampMillis(left.updatedAt || left.createdAt));
}

export async function createPromotion(db: Firestore, actor: StaffActor, input: any) {
  const draft = validatePromotionDraft(input);
  if (draft.allBranches && !canManageGlobalPromotions(actor)) throw new Error('PROMOTION_GLOBAL_SCOPE_FORBIDDEN');
  for (const branchId of draft.branchIds) if (!canAccessBranch(actor, branchId)) throw new Error('PROMOTION_BRANCH_FORBIDDEN');
  const id = hashId('PRM', draft.title, draft.startsAt, crypto.randomBytes(6).toString('hex'));
  const now = new Date().toISOString();
  const record = { id, ...draft, status: 'DRAFT', createdByUid: actor.uid, createdByName: actor.name || actor.uid, createdAt: now, updatedAt: now };
  await db.collection('promotionCampaigns').doc(id).create(record);
  return record;
}

export async function updatePromotion(db: Firestore, actor: StaffActor, promotionId: string, input: any) {
  const reference = db.collection('promotionCampaigns').doc(promotionId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new Error('PROMOTION_NOT_FOUND');
  const current = snapshot.data()!;
  if (current.status === 'ARCHIVED') throw new Error('PROMOTION_ARCHIVED_IMMUTABLE');
  const draft = validatePromotionDraft(input, current);
  if (draft.allBranches && !canManageGlobalPromotions(actor)) throw new Error('PROMOTION_GLOBAL_SCOPE_FORBIDDEN');
  for (const branchId of draft.branchIds) if (!canAccessBranch(actor, branchId)) throw new Error('PROMOTION_BRANCH_FORBIDDEN');
  await reference.set({ ...draft, updatedByUid: actor.uid, updatedAt: new Date().toISOString() }, { merge: true });
  return { id: snapshot.id, ...current, ...draft };
}

async function dispatchPublishedPromotion(db: Firestore, promotion: any) {
  const accounts = await db.collection('customerAccounts').where('marketingConsent', '==', true).limit(500).get();
  const needsDevices = list(promotion.targetModelKeywords, 50, 160).length > 0 || list(promotion.targetActivityTypes, 10, 40).length > 0;
  const hasExplicitTarget = promotion.allBranches === false
    || list(promotion.branchIds, 100, 120).length > 0
    || list(promotion.targetModelKeywords, 50, 160).length > 0
    || list(promotion.targetCustomerTiers, 20, 40).length > 0
    || list(promotion.targetActivityTypes, 10, 40).length > 0;
  let eligible = 0;
  let sent = 0;
  for (let offset = 0; offset < accounts.docs.length; offset += 10) {
    const group = accounts.docs.slice(offset, offset + 10);
    const results = await Promise.all(group.map(async document => {
      const account = document.data();
      if (account.status === 'BLOCKED' || account.isActive === false) return false;
      const authority: CustomerAuthority = { uid: document.id, phoneNormalized: normalizePartyPhone(account.phoneNormalized), account };
      const devices = needsDevices ? await listCustomerDevices(db, authority) : [];
      if (hasExplicitTarget && !promotionMatchesCustomer(promotion, account, devices)) return false;
      eligible += 1;
      const notification = await emitCustomerNotification(db, {
        customerAccountUid: document.id,
        idempotencyKey: `PROMOTION_PUBLISHED:${promotion.id}`,
        type: 'PROMOTION_PUBLISHED',
        title: text(promotion.title, 200),
        body: text(promotion.summary, 300),
        url: `/khach-hang/uu-dai?promotion=${encodeURIComponent(promotion.id)}`,
        marketing: true
      });
      return Boolean(notification && !(notification as any).duplicate);
    }));
    sent += results.filter(Boolean).length;
  }
  return { considered: accounts.size, eligible, sent, coverageLimited: accounts.size >= 500 };
}

export async function changePromotionStatus(db: Firestore, actor: StaffActor, promotionId: string, nextStatusInput: unknown) {
  const nextStatus = text(nextStatusInput, 30).toUpperCase();
  if (!PROMOTION_STATUSES.has(nextStatus)) throw new Error('PROMOTION_STATUS_INVALID');
  const transitions: Record<string, string[]> = {
    DRAFT: ['SCHEDULED', 'PUBLISHED', 'ARCHIVED'],
    SCHEDULED: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
    PUBLISHED: ['EXPIRED', 'ARCHIVED'],
    EXPIRED: ['ARCHIVED'],
    ARCHIVED: []
  };
  const reference = db.collection('promotionCampaigns').doc(promotionId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new Error('PROMOTION_NOT_FOUND');
  const current = text(snapshot.data()?.status || 'DRAFT', 30).toUpperCase();
  if (!transitions[current]?.includes(nextStatus)) throw new Error('PROMOTION_STATUS_TRANSITION_INVALID');
  const branchIds = list(snapshot.data()?.branchIds, 100, 120);
  if (snapshot.data()?.allBranches === true && !canManageGlobalPromotions(actor)) throw new Error('PROMOTION_GLOBAL_SCOPE_FORBIDDEN');
  for (const branchId of branchIds) if (!canAccessBranch(actor, branchId)) throw new Error('PROMOTION_BRANCH_FORBIDDEN');
  const now = new Date().toISOString();
  await reference.set({ status: nextStatus, statusChangedAt: now, statusChangedByUid: actor.uid, updatedAt: now }, { merge: true });
  const updated = { id: snapshot.id, ...snapshot.data(), status: nextStatus };
  const notificationDispatch = nextStatus === 'PUBLISHED' ? await dispatchPublishedPromotion(db, updated) : null;
  return { ...updated, notificationDispatch };
}

export function publicCustomerStageLabel(stage: CustomerRepairStage) {
  return STAGE_LABELS[stage];
}

export function customerRequestConversionInput(request: any, input: any) {
  if (!request || !CUSTOMER_REQUEST_STATUSES.has(text(request.status).toUpperCase())) throw new Error('CUSTOMER_REQUEST_INVALID');
  if (!['SUBMITTED', 'UNDER_REVIEW'].includes(text(request.status).toUpperCase())) throw new Error('CUSTOMER_REQUEST_NOT_CONVERTIBLE');
  return {
    sourceCustomerServiceRequestId: text(request.id, 120),
    deviceId: text(request.deviceId, 120) || undefined,
    imei: text(request.imei, 30),
    model: text(request.model, 200),
    workOrderType: text(request.requestType).toUpperCase() === 'WARRANTY' ? 'WARRANTY' : 'CUSTOMER_SERVICE',
    assetOwnership: 'CUSTOMER',
    branchId: text(request.branchId, 120),
    sourceWarehouseId: text(input.sourceWarehouseId, 120),
    destinationWarehouseId: text(input.destinationWarehouseId, 120),
    customerName: text(request.customerName, 160),
    customerPhone: normalizePartyPhone(request.customerPhone),
    customerId: text(request.customerId, 120) || undefined,
    partyMasterId: text(request.partyMasterId, 120) || undefined,
    customerAccountUid: text(request.customerAccountUid, 128),
    customerApprovedQuote: safeInt(input.customerApprovedQuote),
    totalEstimatedCost: safeInt(input.totalEstimatedCost),
    intakeDetails: {
      issueType: text(request.issueLabel || request.issueType, 160),
      issueCode: text(request.issueCode || request.issueType, 120),
      faultDescription: text(request.description, 3000),
      expectedReturnDate: toIso(input.expectedReturnDate),
      customerServiceRequestId: text(request.id, 120),
      evidenceIds: Array.isArray(request.evidenceIds) ? request.evidenceIds : []
    },
    notes: text(input.notes, 1500),
    lines: Array.isArray(input.lines) ? input.lines : []
  };
}

export const customerPortalToday = () => getVietnamDateString();
