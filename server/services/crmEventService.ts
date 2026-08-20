import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { CustomerActivity, CRMTask } from '../../src/types';

export type CrmEventType = 
  | 'LEAD_CREATED'
  | 'CARE'
  | 'QUOTE_CREATED'
  | 'QUOTE_SENT'
  | 'QUOTE_CONVERTED'
  | 'APPOINTMENT_SCHEDULED'
  | 'APPOINTMENT_ARRIVED'
  | 'APPOINTMENT_NO_SHOW'
  | 'DEVICE_RESERVED'
  | 'DEVICE_RELEASED'
  | 'DEPOSIT_PAID'
  | 'INVOICE_COMPLETED'
  | 'WARRANTY_CREATED'
  | 'TRADE_IN_CREATED'
  | 'LEAD_STAGE_CHANGED'
  | 'LEAD_LOST'
  | 'NOTE';

export interface CrmEventPayload {
  type: CrmEventType;
  customerId: string;
  leadId?: string;
  entityId?: string;
  staffId: string;
  staffName: string;
  branchId: string;
  summary: string;
  details?: Record<string, any>;
  createTask?: {
    taskType: CRMTask['type'];
    priority: CRMTask['priority'];
    dueAt: string;
    title: string;
    description?: string;
  };
}

/**
 * Standardizes Customer ID to avoid using bare phone or lead IDs
 */
export function normalizeCustomerId(customerId?: string, customerPhone?: string): string {
  if (customerId && customerId.startsWith('CUST_')) {
    return customerId;
  }
  if (customerPhone) {
    const cleanPhone = customerPhone.replace(/\D/g, '');
    return `CUST_${cleanPhone}`;
  }
  if (customerId) {
    return `CUST_${customerId.replace(/\W/g, '')}`;
  }
  return `CUST_${Date.now()}`;
}

/**
 * Authoritative CRM Event Emitter:
 * - Writes to customerActivities ledger
 * - Dispatches automated CRMTasks when requested
 */
export async function emitCrmEvent(
  db: Firestore | null,
  event: CrmEventPayload
): Promise<{ activityId: string; taskId?: string }> {
  const {
    type,
    customerId,
    leadId,
    entityId,
    staffId,
    staffName,
    branchId,
    summary,
    details,
    createTask
  } = event;

  const validCustomerId = normalizeCustomerId(customerId);
  const nowIso = new Date().toISOString();
  const activityId = `CUST_ACT_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Map CrmEventType to CustomerActivity type
  const activityTypeMap: Record<CrmEventType, CustomerActivity['type']> = {
    LEAD_CREATED: 'LEAD_CREATED',
    CARE: 'CARE',
    QUOTE_CREATED: 'QUOTE',
    QUOTE_SENT: 'QUOTE',
    QUOTE_CONVERTED: 'QUOTE',
    APPOINTMENT_SCHEDULED: 'APPOINTMENT',
    APPOINTMENT_ARRIVED: 'APPOINTMENT',
    APPOINTMENT_NO_SHOW: 'APPOINTMENT',
    DEVICE_RESERVED: 'QUOTE',
    DEVICE_RELEASED: 'QUOTE',
    DEPOSIT_PAID: 'DEPOSIT',
    INVOICE_COMPLETED: 'INVOICE',
    WARRANTY_CREATED: 'WARRANTY',
    TRADE_IN_CREATED: 'TRADE_IN',
    LEAD_STAGE_CHANGED: 'CARE',
    LEAD_LOST: 'NOTE',
    NOTE: 'NOTE'
  };

  const activityRecord: CustomerActivity = {
    id: activityId,
    customerId: validCustomerId,
    leadId,
    type: activityTypeMap[type] || 'NOTE',
    entityId,
    staffId,
    staffName,
    branchId,
    summary,
    details,
    createdAt: nowIso
  };

  let createdTaskId: string | undefined;

  if (createTask) {
    createdTaskId = `TASK_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const taskRecord: CRMTask = {
      id: createdTaskId,
      leadId,
      customerId: validCustomerId,
      type: createTask.taskType,
      priority: createTask.priority,
      dueAt: createTask.dueAt,
      assignedStaffId: staffId,
      assignedStaffName: staffName,
      branchId,
      title: createTask.title,
      description: createTask.description,
      sourceEntityType: leadId ? 'LEAD' : undefined,
      sourceEntityId: leadId || entityId,
      status: 'PENDING',
      createdAt: nowIso
    };

    if (db) {
      await db.collection('crmTasks').doc(createdTaskId).set({
        ...taskRecord,
        createdAt: FieldValue.serverTimestamp()
      });
    }
  }

  if (db) {
    await db.collection('customerActivities').doc(activityId).set({
      ...activityRecord,
      createdAt: FieldValue.serverTimestamp()
    });
  }

  return { activityId, taskId: createdTaskId };
}
