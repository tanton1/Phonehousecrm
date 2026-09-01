import crypto from 'crypto';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { normalizeImei } from './inventoryDeviceService';

export interface DeviceLifecycleActor {
  uid: string;
  name?: string;
  role?: string;
  branchId?: string;
  assignedBranchIds?: string[];
}

export type DeviceLifecycleCategory =
  | 'INVENTORY'
  | 'TRANSFER'
  | 'CUSTODY'
  | 'TECHNICAL'
  | 'PARTS'
  | 'QC'
  | 'COST'
  | 'SALE'
  | 'NOTE';

export interface DeviceLifecycleEvent {
  id: string;
  occurredAt: string;
  category: DeviceLifecycleCategory;
  eventType: string;
  title: string;
  description: string;
  actorUid?: string | null;
  actorName?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  fromLocationId?: string | null;
  fromLocationName?: string | null;
  toLocationId?: string | null;
  toLocationName?: string | null;
  workOrderId?: string | null;
  workOrderCode?: string | null;
  taskLineId?: string | null;
  documentType: string;
  documentId: string;
  documentCode?: string | null;
  status?: string | null;
  durationMinutes?: number | null;
  quantity?: number | null;
  amount?: number | null;
  costAfter?: number | null;
  note?: string | null;
}

export interface DeviceLifecycleBundle {
  device?: Record<string, any> | null;
  workOrders?: Array<Record<string, any>>;
  movements?: Array<Record<string, any>>;
  costEvents?: Array<Record<string, any>>;
  taskLines?: Array<Record<string, any>>;
  taskSessions?: Array<Record<string, any>>;
  workOrderEvents?: Array<Record<string, any>>;
  qcInspections?: Array<Record<string, any>>;
  partIssues?: Array<Record<string, any>>;
  partMovements?: Array<Record<string, any>>;
  custodyHandovers?: Array<Record<string, any>>;
  invoices?: Array<Record<string, any>>;
  notes?: Array<Record<string, any>>;
  auditEvents?: Array<Record<string, any>>;
  repairPayments?: Array<Record<string, any>>;
  branchNames?: Record<string, string>;
  locationNames?: Record<string, string>;
  actorNames?: Record<string, string>;
  mayViewCost?: boolean;
  now?: string;
}

const MOVEMENT_LABELS: Record<string, { category: DeviceLifecycleCategory; title: string }> = {
  STOCK_RECEIPT: { category: 'INVENTORY', title: 'Nhập máy vào kho' },
  STOCK_RECEIPT_CANCELLED: { category: 'INVENTORY', title: 'Hủy nhập kho' },
  STOCK_SALE: { category: 'SALE', title: 'Xuất bán tại POS' },
  STOCK_REFUND: { category: 'INVENTORY', title: 'Hoàn máy về kho' },
  INTER_BRANCH_DISPATCH: { category: 'TRANSFER', title: 'Xuất chuyển sang chi nhánh khác' },
  INTER_BRANCH_RECEIPT: { category: 'TRANSFER', title: 'Chi nhánh đích nhận máy' },
  INTER_BRANCH_RECEIPT_DAMAGED: { category: 'TRANSFER', title: 'Nhận máy chuyển chi nhánh có hư hỏng' },
  TECH_INTAKE_REGISTERED: { category: 'TECHNICAL', title: 'Tiếp nhận vào luồng kỹ thuật' },
  TECH_ACCEPT: { category: 'CUSTODY', title: 'KTV quét nhận máy' },
  TECH_ACCEPT_CORRECTION: { category: 'CUSTODY', title: 'Hiệu chỉnh xác nhận KTV nhận máy' },
  TECH_CUSTODY_HANDOFF: { category: 'CUSTODY', title: 'Bàn giao máy giữa kỹ thuật viên' },
  QC_PASS_RETURN_STOCK: { category: 'INVENTORY', title: 'Kho nhận lại máy sau KCS' }
};

function role(actor: DeviceLifecycleActor): string {
  return String(actor.role || '').toUpperCase();
}

function mayViewCost(actor: DeviceLifecycleActor): boolean {
  return ['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(role(actor));
}

function canAccessBranch(actor: DeviceLifecycleActor, branchId: string): boolean {
  return role(actor) === 'ADMIN'
    || role(actor) === 'REGIONAL_MANAGER'
    || actor.branchId === branchId
    || (actor.assignedBranchIds || []).includes(branchId);
}

export function lifecycleTimestamp(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof (value as any)?.toDate === 'function') return (value as any).toDate().toISOString();
  if (Number.isFinite(Number((value as any)?.seconds))) return new Date(Number((value as any).seconds) * 1000).toISOString();
  return '';
}

function numberOrZero(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function text(value: unknown): string {
  return String(value || '').trim();
}

function durationBetween(start: unknown, end: unknown): number | null {
  const startAt = lifecycleTimestamp(start);
  const endAt = lifecycleTimestamp(end);
  if (!startAt || !endAt) return null;
  return Math.max(0, Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60_000));
}

function locationDescription(fromName: string, toName: string): string {
  if (!fromName && !toName) return '';
  return `${fromName || 'Không xác định'} → ${toName || 'Không xác định'}`;
}

function eventFromMovement(movement: Record<string, any>, names: DeviceLifecycleBundle): DeviceLifecycleEvent | null {
  const occurredAt = lifecycleTimestamp(movement.occurredAt || movement.createdAt || movement.updatedAt);
  if (!occurredAt) return null;
  const eventType = text(movement.movementType || 'INVENTORY_MOVEMENT').toUpperCase();
  const mapping = MOVEMENT_LABELS[eventType] || { category: 'INVENTORY' as const, title: `Biến động kho: ${eventType}` };
  const fromLocationId = text(movement.fromLocationId) || null;
  const toLocationId = text(movement.toLocationId) || null;
  const fromLocationName = fromLocationId ? names.locationNames?.[fromLocationId] || fromLocationId : null;
  const toLocationName = toLocationId ? names.locationNames?.[toLocationId] || toLocationId : null;
  const actorUid = text(movement.performedByUid || movement.confirmedByUid || movement.actorUid) || null;
  const sourceId = text(movement.sourceId || movement.transferId || movement.workOrderId) || movement.id;
  return {
    id: `MOVEMENT:${movement.id}`,
    occurredAt,
    category: mapping.category,
    eventType,
    title: mapping.title,
    description: [
      locationDescription(fromLocationName || '', toLocationName || ''),
      movement.note || movement.notes,
      movement.transferId ? `Phiếu chuyển ${movement.transferId}` : '',
      movement.sourceType === 'SALES_INVOICE' ? `Hóa đơn ${movement.sourceCode || movement.sourceId || ''}` : ''
    ].filter(Boolean).join(' · '),
    actorUid,
    actorName: text(movement.actorName) || (actorUid ? names.actorNames?.[actorUid] || actorUid : null),
    branchId: text(movement.branchId) || null,
    branchName: names.branchNames?.[text(movement.branchId)] || null,
    fromLocationId,
    fromLocationName,
    toLocationId,
    toLocationName,
    workOrderId: text(movement.workOrderId || (movement.sourceType === 'WORK_ORDER' ? movement.sourceId : '')) || null,
    workOrderCode: text(movement.workOrderCode) || null,
    documentType: text(movement.sourceType) || 'INVENTORY_MOVEMENT',
    documentId: sourceId,
    documentCode: text(movement.sourceCode || movement.transferCode) || null,
    status: text(movement.status) || null,
    quantity: movement.quantity == null ? null : numberOrZero(movement.quantity),
    amount: names.mayViewCost && movement.costAtTransfer != null ? numberOrZero(movement.costAtTransfer) : null,
    note: text(movement.note || movement.notes) || null
  };
}

function addEvent(target: Map<string, DeviceLifecycleEvent>, event: DeviceLifecycleEvent | null) {
  if (!event?.occurredAt) return;
  const key = `${event.category}|${event.eventType}|${event.documentType}|${event.documentId}|${event.occurredAt}|${event.taskLineId || ''}`;
  if (!target.has(key)) target.set(key, event);
}

export function assembleDeviceLifecycleTimeline(bundle: DeviceLifecycleBundle): {
  events: DeviceLifecycleEvent[];
  summary: Record<string, any>;
  canViewCost: boolean;
} {
  const names = bundle;
  const device = bundle.device || {};
  const now = lifecycleTimestamp(bundle.now || new Date().toISOString());
  const events = new Map<string, DeviceLifecycleEvent>();
  const workOrders = bundle.workOrders || [];
  const lineById = new Map((bundle.taskLines || []).map(line => [text(line.id), line]));
  const workOrderById = new Map(workOrders.map(workOrder => [text(workOrder.id), workOrder]));

  const deviceCreatedAt = lifecycleTimestamp(device.createdAt || device.receivedDate);
  if (deviceCreatedAt) addEvent(events, {
    id: `DEVICE:${device.id || device.imei}:REGISTERED`, occurredAt: deviceCreatedAt,
    category: 'INVENTORY', eventType: 'DEVICE_REGISTERED', title: 'Tạo hồ sơ IMEI',
    description: `${text(device.model)} ${text(device.storage)} ${text(device.color)}`.trim(),
    actorUid: text(device.createdByUid) || null,
    actorName: text(device.createdByName) || null,
    branchId: text(device.branchId) || null,
    branchName: names.branchNames?.[text(device.branchId)] || text(device.branchName) || null,
    toLocationId: text(device.currentLocationId || device.warehouseId || device.warehouse) || null,
    toLocationName: names.locationNames?.[text(device.currentLocationId || device.warehouseId || device.warehouse)] || null,
    documentType: 'DEVICE', documentId: text(device.id || device.imei),
    documentCode: text(device.imei) || null,
    amount: names.mayViewCost ? numberOrZero(device.buyPrice) : null,
    costAfter: names.mayViewCost ? numberOrZero(device.buyPrice) : null
  });

  (bundle.movements || []).forEach(movement => addEvent(events, eventFromMovement(movement, names)));

  workOrders.forEach(workOrder => {
    const workOrderId = text(workOrder.id);
    const branchId = text(workOrder.branchId);
    const actorUid = text(workOrder.createdByUid) || null;
    const createdAt = lifecycleTimestamp(workOrder.createdAt);
    if (createdAt) addEvent(events, {
      id: `WORK_ORDER:${workOrderId}:CREATED`, occurredAt: createdAt,
      category: 'TECHNICAL', eventType: 'WORK_ORDER_CREATED', title: 'Tạo phiếu kỹ thuật',
      description: `${text(workOrder.code || workOrderId)} · ${text(workOrder.workOrderType)}${workOrder.notes ? ` · ${text(workOrder.notes)}` : ''}`,
      actorUid, actorName: text(workOrder.createdByName) || (actorUid ? names.actorNames?.[actorUid] || actorUid : null),
      branchId, branchName: names.branchNames?.[branchId] || null,
      workOrderId, workOrderCode: text(workOrder.code) || null,
      documentType: 'TECHNICAL_WORK_ORDER', documentId: workOrderId, documentCode: text(workOrder.code) || null,
      status: text(workOrder.status) || null
    });

    const milestones: Array<[unknown, string, DeviceLifecycleCategory, string, string, unknown, unknown]> = [
      [workOrder.firstAcceptedAt || workOrder.acceptedAt, 'CUSTODY_ACCEPTED', 'CUSTODY', 'KTV xác nhận nhận máy', text(workOrder.currentCustodianName), workOrder.currentCustodianUid, null],
      [workOrder.techCompletedAt, 'TECH_COMPLETED', 'TECHNICAL', 'Hoàn thành toàn bộ hạng mục kỹ thuật', '', workOrder.currentCustodianUid, null],
      [workOrder.qcPassedAt, 'QC_PASSED', 'QC', 'KCS xác nhận máy đạt', text(workOrder.qcInspectorName), workOrder.qcInspectorUid, 'PASS'],
      [workOrder.returnedToStockAt, 'RETURNED_TO_STOCK', 'INVENTORY', 'Máy đã được kho nhận lại', text(workOrder.currentLocationId), workOrder.currentCustodianUid, 'RETURNED_TO_STOCK'],
      [workOrder.deliveredAt, 'DELIVERED_TO_CUSTOMER', 'SALE', 'Trả máy cho khách hàng', text(workOrder.customerName), workOrder.deliveredByUid, 'DELIVERED_TO_CUSTOMER']
    ];
    milestones.forEach(([time, eventType, category, title, description, milestoneActorUid, status]) => {
      const occurredAt = lifecycleTimestamp(time);
      if (!occurredAt) return;
      const uid = text(milestoneActorUid) || null;
      addEvent(events, {
        id: `WORK_ORDER:${workOrderId}:${eventType}`, occurredAt, category, eventType, title,
        description: description || text(workOrder.code || workOrderId),
        actorUid: uid, actorName: uid ? names.actorNames?.[uid] || uid : null,
        branchId, branchName: names.branchNames?.[branchId] || null,
        workOrderId, workOrderCode: text(workOrder.code) || null,
        documentType: 'TECHNICAL_WORK_ORDER', documentId: workOrderId, documentCode: text(workOrder.code) || null,
        status: text(status) || null
      });
    });
  });

  (bundle.taskLines || []).forEach(line => {
    const workOrder = workOrderById.get(text(line.workOrderId)) || {};
    const branchId = text(line.branchId || workOrder.branchId);
    const workOrderId = text(line.workOrderId);
    const lineId = text(line.id);
    const actorUid = text(line.assigneeUid) || null;
    const common = {
      actorUid,
      actorName: text(line.assigneeName) || (actorUid ? names.actorNames?.[actorUid] || actorUid : null),
      branchId,
      branchName: names.branchNames?.[branchId] || null,
      workOrderId,
      workOrderCode: text(workOrder.code) || null,
      taskLineId: lineId,
      documentType: 'TECHNICAL_TASK_LINE',
      documentId: lineId,
      documentCode: text(line.taskCode || line.taskType) || null
    };
    const assignedAt = lifecycleTimestamp(line.assignedAt || line.createdAt);
    if (assignedAt) addEvent(events, {
      ...common, id: `TASK:${lineId}:ASSIGNED`, occurredAt: assignedAt,
      category: 'TECHNICAL', eventType: 'TASK_ASSIGNED', title: `Giao task: ${text(line.taskName || line.taskType)}`,
      description: `KTV ${text(line.assigneeName || actorUid)} · SLA ${text(line.deadlineAt) || 'chưa đặt'}`,
      status: 'ASSIGNED'
    });
    const waitingAt = lifecycleTimestamp(line.partsWaitingAt);
    if (waitingAt) addEvent(events, {
      ...common, id: `TASK:${lineId}:WAITING_PARTS`, occurredAt: waitingAt,
      category: 'PARTS', eventType: 'TASK_WAITING_PARTS', title: `Chờ linh kiện: ${text(line.taskName || line.taskType)}`,
      description: text(line.partsWaitingReason) || 'Task tạm dừng để chờ linh kiện.', status: 'WAITING_PARTS'
    });
    const completedAt = lifecycleTimestamp(line.completedAt);
    if (completedAt) addEvent(events, {
      ...common, id: `TASK:${lineId}:COMPLETED`, occurredAt: completedAt,
      category: 'TECHNICAL', eventType: 'TASK_COMPLETED', title: `Hoàn thành: ${text(line.taskName || line.taskType)}`,
      description: text(line.completionNotes) || 'KTV đã hoàn thành hạng mục.', status: 'COMPLETED',
      durationMinutes: numberOrZero(line.activeWorkMinutes) || null
    });
    const verifiedAt = lifecycleTimestamp(line.qcVerifiedAt);
    if (verifiedAt) addEvent(events, {
      ...common, id: `TASK:${lineId}:VERIFIED`, occurredAt: verifiedAt,
      category: 'QC', eventType: 'TASK_QC_VERIFIED', title: `KCS đạt: ${text(line.taskName || line.taskType)}`,
      description: Number(line.reworkCycle || 0) > 0 ? `Đạt sau ${numberOrZero(line.reworkCycle)} lần làm lại.` : 'Đạt ngay lần kiểm tra đầu.',
      status: 'VERIFIED'
    });
  });

  (bundle.taskSessions || []).forEach(session => {
    const line = lineById.get(text(session.lineId)) || {};
    const workOrder = workOrderById.get(text(session.workOrderId)) || {};
    const branchId = text(session.branchId || workOrder.branchId);
    const workOrderId = text(session.workOrderId);
    const actorUid = text(session.technicianUid) || null;
    const startedAt = lifecycleTimestamp(session.startedAt);
    if (startedAt) addEvent(events, {
      id: `SESSION:${session.id}:START`, occurredAt: startedAt,
      category: 'TECHNICAL', eventType: session.resumedByPartIssueId ? 'TASK_RESUMED' : 'TASK_STARTED',
      title: `${session.resumedByPartIssueId ? 'Tiếp tục' : 'Bắt đầu'}: ${text(line.taskName || line.taskType || 'task kỹ thuật')}`,
      description: session.resumedByPartIssueId ? 'Linh kiện đã sẵn sàng, KTV tiếp tục xử lý.' : 'Bắt đầu tính thời gian thực làm.',
      actorUid, actorName: actorUid ? names.actorNames?.[actorUid] || text(line.assigneeName) || actorUid : null,
      branchId, branchName: names.branchNames?.[branchId] || null,
      workOrderId, workOrderCode: text(workOrder.code) || null, taskLineId: text(session.lineId) || null,
      documentType: 'TECHNICAL_TASK_SESSION', documentId: text(session.id), status: text(session.status) || null
    });
    const endedAt = lifecycleTimestamp(session.endedAt);
    if (endedAt) addEvent(events, {
      id: `SESSION:${session.id}:END`, occurredAt: endedAt,
      category: session.endReason === 'WAITING_PARTS' ? 'PARTS' : 'TECHNICAL', eventType: `TASK_SESSION_${text(session.endReason || 'ENDED')}`,
      title: session.endReason === 'WAITING_PARTS' ? 'Tạm dừng để chờ linh kiện' : 'Kết thúc phiên làm kỹ thuật',
      description: `${text(line.taskName || line.taskType || 'Task')} · ${numberOrZero(session.durationMinutes)} phút thực làm`,
      actorUid, actorName: actorUid ? names.actorNames?.[actorUid] || text(line.assigneeName) || actorUid : null,
      branchId, branchName: names.branchNames?.[branchId] || null,
      workOrderId, workOrderCode: text(workOrder.code) || null, taskLineId: text(session.lineId) || null,
      documentType: 'TECHNICAL_TASK_SESSION', documentId: text(session.id), status: 'CLOSED',
      durationMinutes: numberOrZero(session.durationMinutes)
    });
  });

  (bundle.workOrderEvents || []).forEach(item => {
    const occurredAt = lifecycleTimestamp(item.occurredAt || item.createdAt);
    if (!occurredAt) return;
    const eventType = text(item.eventType || 'WORK_ORDER_EVENT');
    const branchId = text(item.branchId);
    const actorUid = text(item.actorUid) || null;
    const titles: Record<string, string> = {
      INTAKE_PHOTOS_ATTACHED: 'Bổ sung ảnh lúc tiếp nhận',
      TASK_WAITING_PARTS: 'Task chuyển sang chờ linh kiện',
      TASK_ADDITION_REQUESTED: 'KTV báo lỗi phát sinh',
      TASK_ADDITION_APPROVED: 'Duyệt task phát sinh',
      WORK_ORDER_REOPENED_FOR_ADDITIONAL_TASK: 'Mở lại phiếu vì có lỗi phát sinh'
    };
    addEvent(events, {
      id: `WORK_ORDER_EVENT:${item.id}`, occurredAt,
      category: eventType.includes('PART') ? 'PARTS' : 'TECHNICAL', eventType,
      title: titles[eventType] || eventType,
      description: text(item.reason || item.note || (item.photoCount ? `${item.photoCount} ảnh` : '') || item.taskName),
      actorUid, actorName: text(item.actorName) || (actorUid ? names.actorNames?.[actorUid] || actorUid : null),
      branchId, branchName: names.branchNames?.[branchId] || null,
      workOrderId: text(item.workOrderId) || null,
      workOrderCode: text(workOrderById.get(text(item.workOrderId))?.code) || null,
      taskLineId: text(item.lineId) || null,
      documentType: 'TECHNICAL_WORK_ORDER_EVENT', documentId: text(item.id), status: text(item.status) || null
    });
  });

  (bundle.qcInspections || []).forEach(inspection => {
    const occurredAt = lifecycleTimestamp(inspection.inspectedAt || inspection.createdAt);
    if (!occurredAt) return;
    const branchId = text(inspection.branchId);
    const actorUid = text(inspection.inspectorUid) || null;
    const result = text(inspection.overallResult).toUpperCase();
    const workOrder = workOrderById.get(text(inspection.workOrderId)) || {};
    addEvent(events, {
      id: `QC:${inspection.id}`, occurredAt, category: 'QC', eventType: `QC_${result || 'INSPECTION'}`,
      title: result === 'PASS' ? 'KCS đạt' : 'KCS không đạt — yêu cầu làm lại',
      description: text(inspection.failedReason) || (result === 'PASS' ? 'Máy đạt checklist KCS.' : 'Có hạng mục cần xử lý lại.'),
      actorUid, actorName: text(inspection.inspectorName) || (actorUid ? names.actorNames?.[actorUid] || actorUid : null),
      branchId, branchName: names.branchNames?.[branchId] || null,
      workOrderId: text(inspection.workOrderId) || null, workOrderCode: text(workOrder.code) || null,
      documentType: 'QC_INSPECTION', documentId: text(inspection.id), status: result || null,
      note: text(inspection.failedReason) || null
    });
  });

  (bundle.partIssues || []).forEach(issue => {
    const occurredAt = lifecycleTimestamp(issue.issuedAt || issue.createdAt);
    if (!occurredAt) return;
    const branchId = text(issue.branchId);
    const actorUid = text(issue.issuedByUid) || null;
    addEvent(events, {
      id: `PART_ISSUE:${issue.id}`, occurredAt, category: 'PARTS', eventType: 'PART_ISSUED',
      title: `Xuất linh kiện: ${text(issue.partName || issue.sku)}`,
      description: `${numberOrZero(issue.quantityIssued)} ${text(issue.sku)} · Trạng thái ${text(issue.status)}`,
      actorUid, actorName: actorUid ? names.actorNames?.[actorUid] || actorUid : null,
      branchId, branchName: names.branchNames?.[branchId] || null,
      workOrderId: text(issue.workOrderId) || null, workOrderCode: text(issue.workOrderCode) || null,
      taskLineId: text(issue.workOrderLineId) || null,
      documentType: 'TECHNICAL_PART_ISSUE', documentId: text(issue.id), documentCode: text(issue.sku) || null,
      status: text(issue.status) || null, quantity: numberOrZero(issue.quantityIssued),
      amount: names.mayViewCost ? numberOrZero(issue.unitCostSnapshot) * numberOrZero(issue.quantityIssued) : null
    });
  });

  (bundle.partMovements || []).forEach(movement => {
    const occurredAt = lifecycleTimestamp(movement.occurredAt || movement.createdAt);
    if (!occurredAt) return;
    const branchId = text(movement.branchId);
    const actorUid = text(movement.actorUid) || null;
    const eventType = text(movement.movementType).toUpperCase();
    const actionLabels: Record<string, string> = { CONSUME: 'Xác nhận đã dùng linh kiện', RETURN: 'Trả lại linh kiện thừa', SCRAP: 'Ghi nhận linh kiện hỏng', REVERSAL: 'Hoàn tác xuất linh kiện', ISSUE: 'Xuất linh kiện cho task' };
    addEvent(events, {
      id: `PART_MOVEMENT:${movement.id}`, occurredAt, category: 'PARTS', eventType: `PART_${eventType}`,
      title: actionLabels[eventType] || `Biến động linh kiện: ${eventType}`,
      description: `${numberOrZero(movement.quantity)} × ${text(movement.sku || movement.partId)}${movement.note ? ` · ${text(movement.note)}` : ''}`,
      actorUid, actorName: actorUid ? names.actorNames?.[actorUid] || actorUid : null,
      branchId, branchName: names.branchNames?.[branchId] || null,
      workOrderId: text(movement.sourceId) || null, workOrderCode: text(movement.workOrderCode) || null,
      taskLineId: text(movement.workOrderLineId) || null,
      documentType: 'SPARE_PART_MOVEMENT', documentId: text(movement.id), documentCode: text(movement.sku) || null,
      quantity: numberOrZero(movement.quantity),
      amount: names.mayViewCost ? numberOrZero(movement.unitCostSnapshot) * numberOrZero(movement.quantity) : null,
      note: text(movement.note) || null
    });
  });

  (bundle.custodyHandovers || []).forEach(handoff => {
    const occurredAt = lifecycleTimestamp(handoff.acceptedAt || handoff.requestedAt || handoff.createdAt);
    if (!occurredAt) return;
    const branchId = text(handoff.branchId);
    const actorUid = text(handoff.acceptedByUid || handoff.requestedByUid) || null;
    addEvent(events, {
      id: `HANDOFF:${handoff.id}`, occurredAt, category: 'CUSTODY', eventType: `CUSTODY_HANDOFF_${text(handoff.status || 'REQUESTED')}`,
      title: handoff.acceptedAt ? 'KTV mới xác nhận nhận bàn giao' : 'Yêu cầu bàn giao sang KTV khác',
      description: `${text(handoff.sourceTechnicianName || handoff.sourceTechnicianUid)} → ${text(handoff.targetTechnicianName || handoff.targetTechnicianUid)}${handoff.reason ? ` · ${text(handoff.reason)}` : ''}`,
      actorUid, actorName: actorUid ? names.actorNames?.[actorUid] || actorUid : null,
      branchId, branchName: names.branchNames?.[branchId] || null,
      fromLocationId: text(handoff.sourceWarehouseId) || null,
      fromLocationName: names.locationNames?.[text(handoff.sourceWarehouseId)] || null,
      toLocationId: text(handoff.targetWarehouseId) || null,
      toLocationName: names.locationNames?.[text(handoff.targetWarehouseId)] || null,
      workOrderId: text(handoff.workOrderId) || null,
      workOrderCode: text(workOrderById.get(text(handoff.workOrderId))?.code) || null,
      documentType: 'TECHNICAL_CUSTODY_HANDOVER', documentId: text(handoff.id), status: text(handoff.status) || null
    });
  });

  (bundle.costEvents || []).forEach(costEvent => {
    if (!names.mayViewCost) return;
    const occurredAt = lifecycleTimestamp(costEvent.createdAt || costEvent.occurredAt);
    if (!occurredAt) return;
    const branchId = text(costEvent.branchId);
    const actorUid = text(costEvent.createdByUid) || null;
    addEvent(events, {
      id: `COST:${costEvent.id}`, occurredAt, category: 'COST', eventType: text(costEvent.eventType || 'COST_UPDATED'),
      title: costEvent.eventType === 'ACQUISITION' ? 'Ghi nhận giá vốn nhập máy' : 'Kết chuyển chi phí kỹ thuật vào IMEI',
      description: `Giá vốn ${numberOrZero(costEvent.costBefore).toLocaleString('vi-VN')}đ → ${numberOrZero(costEvent.costAfter).toLocaleString('vi-VN')}đ`,
      actorUid, actorName: actorUid ? names.actorNames?.[actorUid] || actorUid : null,
      branchId, branchName: names.branchNames?.[branchId] || null,
      workOrderId: costEvent.sourceType === 'TECHNICAL_WORK_ORDER' ? text(costEvent.sourceId) || null : null,
      documentType: 'DEVICE_COST_EVENT', documentId: text(costEvent.id), documentCode: text(costEvent.costVersion) || null,
      amount: numberOrZero(costEvent.amount), costAfter: numberOrZero(costEvent.costAfter)
    });
  });

  (bundle.invoices || []).forEach(invoice => {
    const occurredAt = lifecycleTimestamp(invoice.createdAt || invoice.createdDate);
    if (!occurredAt) return;
    const branchId = text(invoice.branchId);
    const actorUid = text(invoice.creatorUid) || null;
    addEvent(events, {
      id: `INVOICE:${invoice.id}`, occurredAt, category: 'SALE', eventType: invoice.status === 'cancelled' ? 'SALE_CANCELLED' : 'DEVICE_SOLD',
      title: invoice.status === 'cancelled' ? 'Hóa đơn đã hủy/hoàn' : 'Bán máy tại POS',
      description: `${text(invoice.invoiceCode || invoice.invoiceNumber || invoice.id)} · ${text(invoice.customerName || 'Khách vãng lai')}`,
      actorUid, actorName: text(invoice.creatorName || invoice.salesPerson) || (actorUid ? names.actorNames?.[actorUid] || actorUid : null),
      branchId, branchName: names.branchNames?.[branchId] || text(invoice.branchName || invoice.branch) || null,
      documentType: 'SALES_INVOICE', documentId: text(invoice.id), documentCode: text(invoice.invoiceCode || invoice.invoiceNumber) || null,
      status: text(invoice.status) || null,
      amount: numberOrZero(invoice.totalAmount || invoice.finalAmount)
    });
  });

  (bundle.repairPayments || []).forEach(payment => {
    const occurredAt = lifecycleTimestamp(payment.collectedAt || payment.createdAt);
    if (!occurredAt) return;
    const branchId = text(payment.branchId);
    const actorUid = text(payment.collectedByUid) || null;
    addEvent(events, {
      id: `REPAIR_PAYMENT:${payment.id}`, occurredAt, category: 'SALE', eventType: 'REPAIR_PAYMENT_COLLECTED',
      title: 'Thu tiền sửa chữa',
      description: `${text(payment.paymentMethod)} · ${text(payment.status)}`,
      actorUid, actorName: text(payment.collectedByName) || (actorUid ? names.actorNames?.[actorUid] || actorUid : null),
      branchId, branchName: names.branchNames?.[branchId] || null,
      workOrderId: text(payment.workOrderId) || null, workOrderCode: text(payment.workOrderCode) || null,
      documentType: 'REPAIR_PAYMENT', documentId: text(payment.id), status: text(payment.status) || null,
      amount: numberOrZero(payment.amount ?? payment.paidAmount)
    });
  });

  (bundle.notes || []).forEach(note => {
    const occurredAt = lifecycleTimestamp(note.occurredAt || note.createdAt);
    if (!occurredAt) return;
    const branchId = text(note.branchId);
    const actorUid = text(note.actorUid) || null;
    addEvent(events, {
      id: `NOTE:${note.id}`, occurredAt, category: 'NOTE', eventType: text(note.noteType || 'MANUAL_NOTE'),
      title: text(note.title) || 'Ghi chú vòng đời máy', description: text(note.note),
      actorUid, actorName: text(note.actorName) || (actorUid ? names.actorNames?.[actorUid] || actorUid : null),
      branchId, branchName: names.branchNames?.[branchId] || null,
      workOrderId: text(note.workOrderId) || null,
      documentType: 'DEVICE_LIFECYCLE_NOTE', documentId: text(note.id), note: text(note.note) || null
    });
  });

  (bundle.auditEvents || []).forEach(audit => {
    const occurredAt = lifecycleTimestamp(audit.createdAt || audit.occurredAt);
    if (!occurredAt) return;
    const branchId = text(audit.branchId);
    const actorUid = text(audit.actorUid) || null;
    addEvent(events, {
      id: `AUDIT:${audit.id}`, occurredAt, category: 'NOTE', eventType: text(audit.eventType || 'DEVICE_AUDIT'),
      title: 'Cập nhật thông tin máy',
      description: Array.isArray(audit.changedFields) ? `Thay đổi: ${audit.changedFields.join(', ')}` : text(audit.note),
      actorUid, actorName: actorUid ? names.actorNames?.[actorUid] || actorUid : null,
      branchId, branchName: names.branchNames?.[branchId] || null,
      documentType: 'INVENTORY_AUDIT_EVENT', documentId: text(audit.id)
    });
  });

  const sortedEvents = [...events.values()].sort((left, right) => {
    const time = right.occurredAt.localeCompare(left.occurredAt);
    return time || right.id.localeCompare(left.id);
  });
  const sessions = bundle.taskSessions || [];
  const activeWorkMinutes = sessions.reduce((sum, session) => {
    if (Number.isFinite(Number(session.durationMinutes)) && Number(session.durationMinutes) > 0) return sum + Number(session.durationMinutes);
    if (session.status === 'ACTIVE') return sum + (durationBetween(session.startedAt, now) || 0);
    return sum;
  }, 0);
  const qcPassCount = (bundle.qcInspections || []).filter(item => text(item.overallResult).toUpperCase() === 'PASS').length;
  const qcFailCount = (bundle.qcInspections || []).filter(item => text(item.overallResult).toUpperCase() === 'FAIL').length;
  const partsConsumed = (bundle.partIssues || []).reduce((sum, issue) => sum + numberOrZero(issue.quantityConsumed), 0);
  const currentLocationId = text(device.currentLocationId || device.warehouseId || device.warehouse) || null;
  const currentCustodianUid = text(device.currentCustodianUid) || null;
  const currentCustodianName = text(device.currentCustodianName || device.currentCustodian || device.technicianAssigned)
    || (device.status === 'sold' ? text(device.customerName) || 'Khách hàng' : '')
    || (currentCustodianUid ? names.actorNames?.[currentCustodianUid] || currentCustodianUid : 'Chưa xác định');
  const acquisitionCost = numberOrZero(device.buyPrice || bundle.costEvents?.find(item => item.eventType === 'ACQUISITION')?.costAfter);
  const currentCost = numberOrZero(device.currentCost || bundle.costEvents?.slice().sort((a, b) => lifecycleTimestamp(b.createdAt).localeCompare(lifecycleTimestamp(a.createdAt)))[0]?.costAfter || acquisitionCost);
  const firstAt = sortedEvents.length ? sortedEvents[sortedEvents.length - 1].occurredAt : null;
  const lastAt = sortedEvents.length ? sortedEvents[0].occurredAt : null;
  return {
    events: sortedEvents,
    canViewCost: names.mayViewCost === true,
    summary: {
      eventCount: sortedEvents.length,
      firstEventAt: firstAt,
      lastEventAt: lastAt,
      currentStatus: text(device.status || workOrders[0]?.status) || 'UNKNOWN',
      currentLocationId,
      currentLocationName: currentLocationId ? names.locationNames?.[currentLocationId] || currentLocationId : 'Chưa xác định',
      currentCustodianUid,
      currentCustodianName,
      workOrderCount: workOrders.length,
      activeWorkMinutes,
      waitingPartsMinutes: (bundle.taskLines || []).reduce((sum, line) => sum + numberOrZero(line.waitingPartsMinutes), 0),
      qcPassCount,
      qcFailCount,
      reworkCount: workOrders.reduce((sum, workOrder) => sum + numberOrZero(workOrder.reworkCount), 0),
      partsConsumed,
      transferCount: sortedEvents.filter(event => event.category === 'TRANSFER').length,
      ...(names.mayViewCost ? {
        acquisitionCost,
        currentCost,
        technicalCostAdded: currentCost - acquisitionCost
      } : {})
    }
  };
}

function docs(snapshot: any): Array<Record<string, any>> {
  return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
}

async function queryByValues(db: Firestore, collection: string, field: string, values: string[], limit = 500): Promise<Array<Record<string, any>>> {
  const unique = [...new Set(values.map(text).filter(Boolean))];
  if (unique.length === 0) return [];
  const snapshots = await Promise.all(unique.map(value => db.collection(collection).where(field, '==', value).limit(limit).get()));
  const merged = new Map<string, Record<string, any>>();
  snapshots.forEach(snapshot => docs(snapshot).forEach(item => merged.set(text(item.id), item)));
  return [...merged.values()];
}

async function resolveDeviceAndWorkOrder(
  db: Firestore,
  query: { deviceId?: string; imei?: string; workOrderId?: string }
): Promise<{ device: Record<string, any> | null; seedWorkOrder: Record<string, any> | null; imei: string; deviceId: string }> {
  let device: Record<string, any> | null = null;
  let seedWorkOrder: Record<string, any> | null = null;
  const requestedDeviceId = text(query.deviceId);
  const requestedWorkOrderId = text(query.workOrderId);
  let imei = normalizeImei(query.imei);
  if (requestedDeviceId) {
    const snapshot = await db.collection('devices').doc(requestedDeviceId).get();
    if (snapshot.exists) device = { id: snapshot.id, ...snapshot.data() };
    if (!device) {
      const tombstone = await db.collection('inventoryDeviceTombstones').doc(requestedDeviceId).get();
      if (tombstone.exists) device = { id: tombstone.id, ...tombstone.data(), lifecycleStatus: 'VOIDED' };
    }
  }
  if (requestedWorkOrderId) {
    const snapshot = await db.collection('technicalWorkOrders').doc(requestedWorkOrderId).get();
    if (snapshot.exists) seedWorkOrder = { id: snapshot.id, ...snapshot.data() };
  }
  const requestedImei = normalizeImei(imei);
  const deviceImei = normalizeImei(device?.imeiNormalized || device?.imei);
  const workOrderImei = normalizeImei(seedWorkOrder?.imei);
  if (requestedImei && deviceImei && requestedImei !== deviceImei) throw new Error('DEVICE_LIFECYCLE_IDENTITY_MISMATCH');
  if (requestedImei && workOrderImei && requestedImei !== workOrderImei) throw new Error('DEVICE_LIFECYCLE_IDENTITY_MISMATCH');
  if (deviceImei && workOrderImei && deviceImei !== workOrderImei) throw new Error('DEVICE_LIFECYCLE_IDENTITY_MISMATCH');
  if (device && seedWorkOrder && text(seedWorkOrder.deviceId) && text(seedWorkOrder.deviceId) !== text(device.id)) {
    throw new Error('DEVICE_LIFECYCLE_IDENTITY_MISMATCH');
  }
  imei = normalizeImei(requestedImei || deviceImei || workOrderImei);
  if (!device && imei) {
    const normalized = await db.collection('devices').where('imeiNormalized', '==', imei).limit(1).get();
    const legacy = normalized.empty ? await db.collection('devices').where('imei', '==', imei).limit(1).get() : null;
    const match = !normalized.empty ? normalized.docs[0] : legacy && !legacy.empty ? legacy.docs[0] : null;
    if (match) device = { id: match.id, ...match.data() };
    if (!device) {
      const voidedNormalized = await db.collection('inventoryDeviceTombstones').where('imeiNormalized', '==', imei).limit(1).get();
      const voidedLegacy = voidedNormalized.empty
        ? await db.collection('inventoryDeviceTombstones').where('imei', '==', imei).limit(1).get()
        : null;
      const voidedMatch = !voidedNormalized.empty
        ? voidedNormalized.docs[0]
        : voidedLegacy && !voidedLegacy.empty ? voidedLegacy.docs[0] : null;
      if (voidedMatch) device = { id: voidedMatch.id, ...voidedMatch.data(), lifecycleStatus: 'VOIDED' };
    }
  }
  if (!device && !seedWorkOrder && imei) {
    const workOrderSnapshot = await db.collection('technicalWorkOrders').where('imei', '==', imei).limit(1).get();
    if (!workOrderSnapshot.empty) seedWorkOrder = { id: workOrderSnapshot.docs[0].id, ...workOrderSnapshot.docs[0].data() };
  }
  const deviceId = text(device?.id || seedWorkOrder?.deviceId || requestedDeviceId);
  if (!device && !seedWorkOrder) throw new Error('DEVICE_LIFECYCLE_NOT_FOUND');
  return { device, seedWorkOrder, imei, deviceId };
}

async function nameMap(db: Firestore, collection: string, ids: string[], fields: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.map(text).filter(Boolean))].slice(0, 200);
  const snapshots = await Promise.all(unique.map(id => db.collection(collection).doc(id).get()));
  const result: Record<string, string> = {};
  snapshots.forEach(snapshot => {
    if (!snapshot.exists) return;
    const data = snapshot.data() || {};
    const value = fields.map(field => text(data[field])).find(Boolean);
    if (value) result[snapshot.id] = value;
  });
  return result;
}

export async function getDeviceLifecycleTimeline(
  db: Firestore,
  query: { deviceId?: string; imei?: string; workOrderId?: string },
  actor: DeviceLifecycleActor
): Promise<Record<string, any>> {
  const identity = await resolveDeviceAndWorkOrder(db, query);
  const currentBranchId = text(identity.device?.branchId || identity.seedWorkOrder?.branchId);
  if (!currentBranchId || !canAccessBranch(actor, currentBranchId)) throw new Error('DEVICE_LIFECYCLE_BRANCH_FORBIDDEN');
  if (identity.seedWorkOrder && !canAccessBranch(actor, text(identity.seedWorkOrder.branchId))) {
    throw new Error('DEVICE_LIFECYCLE_BRANCH_FORBIDDEN');
  }
  const workOrders = await queryByValues(db, 'technicalWorkOrders', 'deviceId', [identity.deviceId], 100);
  const workOrdersByImei = await queryByValues(db, 'technicalWorkOrders', 'imei', [identity.imei], 100);
  const workOrderMap = new Map<string, Record<string, any>>();
  [...workOrders, ...workOrdersByImei, ...(identity.seedWorkOrder ? [identity.seedWorkOrder] : [])].forEach(item => workOrderMap.set(text(item.id), item));
  const accessibleWorkOrders = [...workOrderMap.values()].filter(item => canAccessBranch(actor, text(item.branchId)));
  const workOrderIds = accessibleWorkOrders.map(item => text(item.id));

  const [movementsByDevice, movementsByImei, costByDevice, costByImei, taskLines, taskSessions, workOrderEvents, qcInspections, partIssues, partMovements, custodyHandovers, notesByDevice, notesByImei, auditEvents, repairPayments] = await Promise.all([
    queryByValues(db, 'inventoryMovements', 'deviceId', [identity.deviceId], 500),
    queryByValues(db, 'inventoryMovements', 'imei', [identity.imei], 500),
    queryByValues(db, 'deviceCostEvents', 'deviceId', [identity.deviceId], 300),
    queryByValues(db, 'deviceCostEvents', 'imei', [identity.imei], 300),
    queryByValues(db, 'technicalWorkOrderLines', 'workOrderId', workOrderIds, 100),
    queryByValues(db, 'technicalTaskSessions', 'workOrderId', workOrderIds, 300),
    queryByValues(db, 'technicalWorkOrderEvents', 'workOrderId', workOrderIds, 300),
    queryByValues(db, 'qcInspections', 'workOrderId', workOrderIds, 100),
    queryByValues(db, 'technicalPartIssues', 'workOrderId', workOrderIds, 300),
    queryByValues(db, 'sparePartMovements', 'sourceId', workOrderIds, 500),
    queryByValues(db, 'technicalCustodyHandovers', 'workOrderId', workOrderIds, 100),
    queryByValues(db, 'deviceLifecycleNotes', 'deviceId', [identity.deviceId], 200),
    queryByValues(db, 'deviceLifecycleNotes', 'imei', [identity.imei], 200),
    queryByValues(db, 'inventoryAuditEvents', 'deviceId', [identity.deviceId], 200),
    queryByValues(db, 'repairPayments', 'workOrderId', workOrderIds, 200)
  ]);
  const merge = (...groups: Array<Array<Record<string, any>>>) => {
    const map = new Map<string, Record<string, any>>();
    groups.flat().forEach(item => map.set(text(item.id), item));
    return [...map.values()];
  };
  const movements = merge(movementsByDevice, movementsByImei).filter(item => canAccessBranch(actor, text(item.branchId || item.sourceBranchId || item.destinationBranchId)));
  const costEvents = merge(costByDevice, costByImei).filter(item => canAccessBranch(actor, text(item.branchId)));
  const notes = merge(notesByDevice, notesByImei).filter(item => canAccessBranch(actor, text(item.branchId)));
  const invoiceIds = [...new Set([
    text(identity.device?.soldInvoiceId),
    ...movements.filter(item => text(item.sourceType) === 'SALES_INVOICE').map(item => text(item.sourceId))
  ].filter(Boolean))];
  const invoiceSnapshots = await Promise.all(invoiceIds.slice(0, 100).map(id => db.collection('invoices').doc(id).get()));
  const invoices = invoiceSnapshots
    .filter(snapshot => snapshot.exists)
    .map(snapshot => ({ id: snapshot.id, ...(snapshot.data() || {}) }) as Record<string, any>)
    .filter(item => canAccessBranch(actor, text(item.branchId)));

  const locationIds = [
    text(identity.device?.currentLocationId || identity.device?.warehouseId || identity.device?.warehouse),
    ...movements.flatMap(item => [text(item.fromLocationId), text(item.toLocationId)]),
    ...custodyHandovers.flatMap(item => [text(item.sourceWarehouseId), text(item.targetWarehouseId)])
  ];
  const branchIds = [currentBranchId, ...movements.map(item => text(item.branchId)), ...accessibleWorkOrders.map(item => text(item.branchId))];
  const actorIds = [
    text(identity.device?.currentCustodianUid),
    ...movements.flatMap(item => [text(item.actorUid), text(item.performedByUid), text(item.confirmedByUid)]),
    ...taskLines.map(item => text(item.assigneeUid)),
    ...taskSessions.map(item => text(item.technicianUid)),
    ...qcInspections.map(item => text(item.inspectorUid)),
    ...partIssues.flatMap(item => [text(item.issuedByUid), text(item.issuedToUid)]),
    ...partMovements.map(item => text(item.actorUid)),
    ...notes.map(item => text(item.actorUid))
  ];
  const [locationNames, branchNames, actorNames] = await Promise.all([
    nameMap(db, 'warehouses', locationIds, ['name', 'shortName']),
    nameMap(db, 'branches', branchIds, ['name', 'shortName']),
    nameMap(db, 'users', actorIds, ['name', 'displayName', 'email'])
  ]);
  const projection = assembleDeviceLifecycleTimeline({
    device: identity.device || { id: identity.deviceId, imei: identity.imei, branchId: currentBranchId, model: identity.seedWorkOrder?.model, status: identity.seedWorkOrder?.status },
    workOrders: accessibleWorkOrders,
    movements,
    costEvents,
    taskLines,
    taskSessions,
    workOrderEvents,
    qcInspections,
    partIssues,
    partMovements,
    custodyHandovers,
    invoices,
    notes,
    auditEvents: auditEvents.filter(item => canAccessBranch(actor, text(item.branchId || currentBranchId))),
    repairPayments,
    locationNames,
    branchNames,
    actorNames,
    mayViewCost: mayViewCost(actor)
  });
  return {
    device: {
      id: identity.deviceId || null,
      imei: identity.imei,
      model: text(identity.device?.model || identity.seedWorkOrder?.model),
      status: text(identity.device?.status || identity.seedWorkOrder?.status),
      branchId: currentBranchId,
      branchName: branchNames[currentBranchId] || text(identity.device?.branchName || identity.device?.branch) || currentBranchId
    },
    ...projection,
    generatedAt: new Date().toISOString(),
    sourceOfTruth: 'LEDGER_PROJECTION_V1'
  };
}

export async function processAddDeviceLifecycleNote(
  db: Firestore,
  query: { deviceId?: string; imei?: string; workOrderId?: string },
  input: { title?: unknown; note?: unknown; noteType?: unknown; idempotencyKey?: unknown },
  actor: DeviceLifecycleActor
): Promise<Record<string, any>> {
  const identity = await resolveDeviceAndWorkOrder(db, query);
  const branchId = text(identity.device?.branchId || identity.seedWorkOrder?.branchId);
  if (!branchId || !canAccessBranch(actor, branchId)) throw new Error('DEVICE_LIFECYCLE_BRANCH_FORBIDDEN');
  const title = text(input.title).slice(0, 120);
  const note = text(input.note).slice(0, 2000);
  const noteType = text(input.noteType || 'MANUAL_NOTE').toUpperCase();
  const idempotencyKey = text(input.idempotencyKey);
  if (title.length < 3 || note.length < 3) throw new Error('DEVICE_LIFECYCLE_NOTE_REQUIRED');
  if (!['MANUAL_NOTE', 'INSPECTION_NOTE', 'FOLLOW_UP_NOTE'].includes(noteType)) throw new Error('DEVICE_LIFECYCLE_NOTE_TYPE_INVALID');
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify({
    deviceId: identity.deviceId, imei: identity.imei, branchId, title, note, noteType, actorUid: actor.uid
  })).digest('hex');
  const noteId = `DLN_${crypto.createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 28).toUpperCase()}`;
  const noteRef = db.collection('deviceLifecycleNotes').doc(noteId);
  return db.runTransaction(async transaction => {
    const existing = await transaction.get(noteRef);
    if (existing.exists) {
      if (text(existing.data()?.payloadHash) !== payloadHash) throw new Error('IDEMPOTENCY_PAYLOAD_MISMATCH');
      return { note: { id: existing.id, ...existing.data() }, idempotentReplay: true };
    }
    const now = new Date().toISOString();
    const record = {
      id: noteId,
      deviceId: identity.deviceId || null,
      imei: identity.imei,
      branchId,
      workOrderId: text(query.workOrderId) || null,
      noteType,
      title,
      note,
      actorUid: actor.uid,
      actorName: actor.name || actor.uid,
      occurredAt: now,
      immutable: true,
      payloadHash,
      createdAt: FieldValue.serverTimestamp()
    };
    transaction.create(noteRef, record);
    return { note: { ...record, createdAt: now } };
  });
}
