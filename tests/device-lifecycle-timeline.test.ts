import { describe, expect, it } from 'vitest';
import {
  assembleDeviceLifecycleTimeline,
  lifecycleTimestamp
} from '../server/services/deviceLifecycleService';

const baseBundle = () => ({
  device: {
    id: 'DEV-01',
    imei: '356789012345678',
    model: 'iPhone 15 Pro Max',
    status: 'sold',
    branchId: 'PH109',
    currentLocationId: 'KHO-PH109',
    currentCustodianName: 'Khách hàng Nguyễn An',
    buyPrice: 20_000_000,
    currentCost: 21_250_000,
    createdAt: '2026-08-27T02:00:00.000Z'
  },
  workOrders: [{
    id: 'WO-01',
    code: 'SC-0001',
    branchId: 'PH109',
    status: 'DELIVERED_TO_CUSTOMER',
    workOrderType: 'INBOUND_PREP',
    createdAt: '2026-08-27T03:00:00.000Z',
    reworkCount: 1,
    deliveredAt: '2026-08-27T10:00:00.000Z'
  }],
  movements: [{
    id: 'MOV-01',
    movementType: 'INTER_BRANCH_RECEIPT',
    branchId: 'PH109',
    fromLocationId: 'KHO-TONG',
    toLocationId: 'KHO-PH109',
    occurredAt: '2026-08-27T09:00:00.000Z',
    sourceId: 'TRF-01',
    sourceCode: 'DC-0001'
  }],
  taskLines: [{
    id: 'LINE-01',
    workOrderId: 'WO-01',
    branchId: 'PH109',
    taskName: 'Thay pin',
    assigneeUid: 'TECH-01',
    assigneeName: 'KTV Tùng',
    startedAt: '2026-08-27T03:05:00.000Z',
    completedAt: '2026-08-27T04:00:00.000Z',
    qcVerifiedAt: '2026-08-27T05:00:00.000Z',
    activeWorkMinutes: 55,
    waitingPartsMinutes: 20,
    reworkCycle: 1
  }],
  taskSessions: [{
    id: 'SESSION-01',
    workOrderId: 'WO-01',
    lineId: 'LINE-01',
    technicianUid: 'TECH-01',
    branchId: 'PH109',
    startedAt: '2026-08-27T03:05:00.000Z',
    endedAt: '2026-08-27T04:00:00.000Z',
    durationMinutes: 55,
    status: 'CLOSED',
    endReason: 'COMPLETED'
  }],
  qcInspections: [
    { id: 'QC-FAIL', workOrderId: 'WO-01', branchId: 'PH109', overallResult: 'FAIL', failedReason: 'Pin báo bảo trì', inspectedAt: '2026-08-27T04:10:00.000Z' },
    { id: 'QC-PASS', workOrderId: 'WO-01', branchId: 'PH109', overallResult: 'PASS', inspectedAt: '2026-08-27T05:00:00.000Z' }
  ],
  partIssues: [{
    id: 'ISSUE-01',
    workOrderId: 'WO-01',
    workOrderLineId: 'LINE-01',
    branchId: 'PH109',
    partName: 'Pin iPhone 15 Pro Max',
    sku: 'PIN-IP15PM-ZIN',
    quantityIssued: 1,
    quantityConsumed: 1,
    unitCostSnapshot: 1_000_000,
    status: 'CONSUMED',
    issuedAt: '2026-08-27T03:10:00.000Z'
  }],
  costEvents: [{
    id: 'COST-01',
    branchId: 'PH109',
    eventType: 'TECHNICAL_COST_POSTED',
    sourceType: 'TECHNICAL_WORK_ORDER',
    sourceId: 'WO-01',
    costBefore: 20_000_000,
    costAfter: 21_250_000,
    amount: 1_250_000,
    createdAt: '2026-08-27T06:00:00.000Z'
  }],
  invoices: [{
    id: 'INV-01',
    invoiceNumber: 'HD-0001',
    branchId: 'PH109',
    customerName: 'Nguyễn An',
    totalAmount: 25_000_000,
    createdAt: '2026-08-27T11:00:00.000Z'
  }],
  notes: [{
    id: 'NOTE-01',
    branchId: 'PH109',
    noteType: 'INSPECTION_NOTE',
    title: 'Kiểm tra ngoại hình',
    note: 'Không trầy xước mới.',
    actorUid: 'WH-01',
    createdAt: '2026-08-27T09:05:00.000Z'
  }],
  branchNames: { PH109: 'PhoneHouse 109' },
  locationNames: { 'KHO-TONG': 'Kho Tổng', 'KHO-PH109': 'Kho PH109' },
  actorNames: { 'TECH-01': 'KTV Tùng', 'WH-01': 'Kho Hương' },
  now: '2026-08-27T12:00:00.000Z'
});

describe('authoritative IMEI event timeline', () => {
  it('merges stock, technical, QC, parts, cost, transfer, notes and sale in stable time order', () => {
    const result = assembleDeviceLifecycleTimeline({ ...baseBundle(), mayViewCost: true });

    expect(result.events[0].eventType).toBe('DEVICE_SOLD');
    expect(result.events.at(-1)?.eventType).toBe('DEVICE_REGISTERED');
    expect(new Set(result.events.map(event => event.category))).toEqual(expect.objectContaining(new Set([
      'INVENTORY', 'TRANSFER', 'TECHNICAL', 'PARTS', 'QC', 'COST', 'SALE', 'NOTE'
    ])));
    expect(result.summary.activeWorkMinutes).toBe(55);
    expect(result.summary.waitingPartsMinutes).toBe(20);
    expect(result.summary.qcFailCount).toBe(1);
    expect(result.summary.qcPassCount).toBe(1);
    expect(result.summary.reworkCount).toBe(1);
    expect(result.summary.partsConsumed).toBe(1);
    expect(result.summary.currentLocationName).toBe('Kho PH109');
    expect(result.summary.currentCustodianName).toBe('Khách hàng Nguyễn An');
    expect(result.summary.currentCost).toBe(21_250_000);
  });

  it('redacts all price and cost events for roles without cost permission', () => {
    const result = assembleDeviceLifecycleTimeline({ ...baseBundle(), mayViewCost: false });

    expect(result.canViewCost).toBe(false);
    expect(result.events.some(event => event.category === 'COST')).toBe(false);
    expect(result.events.filter(event => ['COST', 'PARTS', 'INVENTORY'].includes(event.category)).every(event => event.amount == null)).toBe(true);
    expect(result.summary.currentCost).toBeUndefined();
    expect(result.summary.acquisitionCost).toBeUndefined();
  });

  it('accepts Firestore Timestamp-like values and keeps server-created notes in chronology', () => {
    const date = new Date('2026-08-28T01:02:03.000Z');
    expect(lifecycleTimestamp({ toDate: () => date })).toBe(date.toISOString());

    const bundle: any = baseBundle();
    bundle.notes = [{
      id: 'NOTE-LATEST',
      branchId: 'PH109',
      noteType: 'FOLLOW_UP_NOTE',
      title: 'Theo dõi pin',
      note: 'Kiểm tra lại sau 7 ngày.',
      createdAt: { toDate: () => date }
    }];
    const result = assembleDeviceLifecycleTimeline({ ...bundle, mayViewCost: false });
    expect(result.events[0]).toMatchObject({
      eventType: 'FOLLOW_UP_NOTE',
      documentType: 'DEVICE_LIFECYCLE_NOTE',
      title: 'Theo dõi pin'
    });
  });
});
