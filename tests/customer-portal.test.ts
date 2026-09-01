import fs from 'node:fs';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  answerPublicCustomerQuestion,
  createCustomerServiceRequest,
  customerFriendlyRepairStage,
  getCustomerRepair,
  maskCustomerImei,
  projectCustomerWorkOrder
} from '../server/services/customerPortalService';
import { processDecideTechnicalQuoteAdjustment } from '../server/services/technicalService';

const authority = (uid: string) => ({ uid, phoneNormalized: uid === 'customer-a' ? '0905000001' : '0905000002', account: { displayName: uid, linkedBranchIds: ['CN01'] } });

const customerDeviceId = (imei: string) => `CDEV_${crypto.createHash('sha256').update(imei).digest('hex').slice(0, 32).toUpperCase()}`;

function customerRequestDb(seed: Record<string, any[]> = {}) {
  const documents = new Map<string, any>();
  const documentSnapshot = (reference: any) => ({ id: reference.id, exists: documents.has(reference.path), data: () => documents.get(reference.path) });
  const querySnapshot = (rows: any[]) => ({ docs: rows.map(row => {
    const { id, ...data } = row;
    return { id, data: () => data };
  }) });
  return {
    documents,
    db: {
      collection(name: string) {
        return {
          doc(id: string) {
            const reference: any = { collection: name, id, path: `${name}/${id}` };
            if (name === 'branches') reference.get = async () => ({ id, exists: id === 'CN01', data: () => ({ name: 'PhoneHouse CN01', isActive: true }) });
            return reference;
          },
          where(field: string, _operator: string, value: unknown) {
            return {
              limit() {
                return {
                  get: async () => querySnapshot((seed[name] || []).filter(row => row[field] === value))
                };
              }
            };
          }
        };
      },
      runTransaction: async (callback: any) => callback({
        get: async (reference: any) => documentSnapshot(reference),
        create: (reference: any, value: any) => {
          if (documents.has(reference.path)) throw new Error('already-exists');
          documents.set(reference.path, value);
        }
      })
    } as any
  };
}

describe('PhoneHouse Care authority and projection', () => {
  it('keeps every customer portal collection API-only in Firestore Rules', () => {
    const rules = fs.readFileSync('firestore.rules', 'utf8');
    const serverOnlyCollections = [
      'customerAccounts',
      'customerAccountPhoneLinks',
      'customerAccountPartyLinks',
      'customerServiceRequests',
      'customerQuoteApprovalChallenges',
      'customerQuoteApprovals',
      'promotionCampaigns',
      'customerConversations',
      'customerMessages',
      'customerNotifications',
      'customerPushSubscriptions',
      'customerEvidenceUploadSessions',
      'customerEvidenceRecords',
      'customerPortalIdempotency',
      'customerQuoteRequests',
      'customerQuoteRequestOperations',
      'customerQuoteRequestDedup',
      'customerQuoteRateLimits',
      'customerPortalConfigs',
      'customerQuoteAnalytics'
    ];
    for (const collection of serverOnlyCollections) {
      const marker = `match /${collection}/{`;
      const offset = rules.indexOf(marker);
      expect(offset, `Missing explicit API-only rule for ${collection}`).toBeGreaterThanOrEqual(0);
      expect(rules.slice(offset, offset + 180)).toContain('allow read, write: if false;');
    }
    expect(fs.readFileSync('storage.rules', 'utf8')).toContain('allow read, write: if false;');
  });

  it('masks IMEI and never exposes internal technical or financial fields', () => {
    expect(maskCustomerImei('356789012345678')).toBe('•••••••••••5678');
    const projection = projectCustomerWorkOrder({
      id: 'WO-1', code: 'SC-1', model: 'iPhone 15 Pro', imei: '356789012345678',
      status: 'IN_PROGRESS', quoteStatus: 'APPROVED', approvedFinalAmount: 1_500_000,
      currentCustodianUid: 'secret-tech', sourceWarehouseId: 'KHO_NOI_BO', totalActualCost: 300_000,
      auditEvents: [{ secret: true }], internalParts: [{ cost: 10 }]
    }, [{ id: 'L-1', taskName: 'Thay màn hình', status: 'IN_PROGRESS', assigneeUid: 'secret-tech', laborCost: 500_000 }]);
    expect(projection.imeiMasked).toBe('•••••••••••5678');
    expect(projection.tasks).toEqual([{ id: 'L-1', name: 'Thay màn hình', status: 'IN_PROGRESS' }]);
    for (const forbidden of ['currentCustodianUid', 'sourceWarehouseId', 'totalActualCost', 'auditEvents', 'internalParts', 'assigneeUid', 'laborCost']) {
      expect(JSON.stringify(projection)).not.toContain(forbidden);
    }
  });

  it('maps internal state into customer-friendly repair stages', () => {
    expect(customerFriendlyRepairStage({ status: 'IN_PROGRESS' })).toBe('IN_REPAIR');
    expect(customerFriendlyRepairStage({ status: 'QC_PENDING' })).toBe('QUALITY_CHECK');
    expect(customerFriendlyRepairStage({ status: 'QC_PASSED' })).toBe('READY_FOR_PICKUP');
    expect(customerFriendlyRepairStage({ status: 'DELIVERED_TO_CUSTOMER' })).toBe('COMPLETED');
  });

  it('guest chatbot refuses personal repair, quote and warranty data', async () => {
    const db: any = {};
    for (const question of ['Máy của tôi sửa tới đâu?', 'Báo giá hiện tại bao nhiêu?', 'Máy còn bảo hành không?']) {
      const result = await answerPublicCustomerQuestion(db, question);
      expect(result.intent).toBe('AUTH_REQUIRED');
      expect(result.reply).toContain('đăng nhập');
    }
  });

  it('customer A can read own repair while customer B is denied', async () => {
    const row = { customerAccountUid: 'customer-a', code: 'SC-1', model: 'iPhone 15', imei: '356789012345678', status: 'IN_PROGRESS' };
    const db: any = {
      collection(name: string) {
        if (name === 'technicalWorkOrders') return { doc: (id: string) => ({ get: async () => ({ id, exists: true, data: () => row }) }) };
        if (name === 'technicalWorkOrderLines') return { where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) };
        throw new Error(`Unexpected collection ${name}`);
      }
    };
    await expect(getCustomerRepair(db, authority('customer-a'), 'WO-1')).resolves.toMatchObject({ code: 'SC-1' });
    await expect(getCustomerRepair(db, authority('customer-b'), 'WO-1')).rejects.toThrow('CUSTOMER_REPAIR_ACCESS_DENIED');
    await expect(getCustomerRepair(db, {
      uid: 'customer-b',
      phoneNormalized: '0905000001',
      account: { displayName: 'customer-b', linkedBranchIds: ['CN01'] }
    }, 'WO-1')).rejects.toThrow('CUSTOMER_REPAIR_ACCESS_DENIED');
  });

  it('does not fall back to phone when the canonical party belongs to another customer', async () => {
    const row = { partyMasterId: 'party-a', customerPhone: '0905000001', code: 'SC-2', model: 'iPhone 16', imei: '356789012345679', status: 'IN_PROGRESS' };
    const db: any = {
      collection(name: string) {
        if (name === 'technicalWorkOrders') return { doc: (id: string) => ({ get: async () => ({ id, exists: true, data: () => row }) }) };
        if (name === 'technicalWorkOrderLines') return { where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) };
        throw new Error(`Unexpected collection ${name}`);
      }
    };
    await expect(getCustomerRepair(db, {
      uid: 'customer-b',
      phoneNormalized: '0905000001',
      account: { partyMasterId: 'party-b', linkedBranchIds: ['CN01'] }
    }, 'WO-2')).rejects.toThrow('CUSTOMER_REPAIR_ACCESS_DENIED');
  });

  it('replays the same service request idempotently instead of creating a duplicate', async () => {
    const documents = new Map<string, any>();
    const ref = (collection: string, id: string) => ({ collection, id, path: `${collection}/${id}` });
    const snapshot = (reference: any) => ({ id: reference.id, exists: documents.has(reference.path), data: () => documents.get(reference.path) });
    const db: any = {
      collection(name: string) {
        return {
          doc(id: string) {
            const reference: any = ref(name, id);
            if (name === 'branches') reference.get = async () => ({ id, exists: true, data: () => ({ name: 'PhoneHouse CN01', isActive: true }) });
            return reference;
          }
        };
      },
      runTransaction: async (callback: any) => callback({
        get: async (reference: any) => snapshot(reference),
        create: (reference: any, value: any) => {
          if (documents.has(reference.path)) throw new Error('already-exists');
          documents.set(reference.path, value);
        }
      })
    };
    const input = { idempotencyKey: 'same-operation-001', requestType: 'REPAIR', imei: '356789012345678', model: 'iPhone 15', description: 'Máy không nhận sạc', branchId: 'CN01' };
    const first: any = await createCustomerServiceRequest(db, authority('customer-a'), input);
    const second: any = await createCustomerServiceRequest(db, authority('customer-a'), input);
    expect(second.id).toBe(first.id);
    expect(second.idempotentReplay).toBe(true);
    expect([...documents.keys()].filter(path => path.startsWith('customerServiceRequests/'))).toHaveLength(1);
  });

  it('creates a request from a linked device without asking for IMEI or model again', async () => {
    const imei = '356789012345678';
    const { db } = customerRequestDb({
      invoices: [{ id: 'INV-1', customerAccountUid: 'customer-a', devices: [{ imei, model: 'iPhone 15 Pro' }] }]
    });
    await expect(createCustomerServiceRequest(db, authority('customer-a'), {
      idempotencyKey: 'linked-device-request-001',
      requestType: 'REPAIR',
      deviceId: customerDeviceId(imei),
      issueCode: 'SCREEN_DISPLAY',
      description: 'Màn hình xuất hiện sọc xanh',
      branchId: 'CN01'
    })).resolves.toMatchObject({
      deviceId: customerDeviceId(imei),
      imei,
      model: 'iPhone 15 Pro',
      issueCode: 'SCREEN_DISPLAY',
      issueLabel: 'Màn hình / cảm ứng'
    });
  });

  it('overwrites spoofed IMEI and model with the authoritative linked device', async () => {
    const imei = '356789012345678';
    const { db } = customerRequestDb({
      invoices: [{ id: 'INV-1', customerAccountUid: 'customer-a', devices: [{ imei, model: 'iPhone 15 Pro' }] }]
    });
    await expect(createCustomerServiceRequest(db, authority('customer-a'), {
      idempotencyKey: 'linked-device-spoof-001',
      requestType: 'WARRANTY',
      deviceId: customerDeviceId(imei),
      imei: '351111111111111',
      model: 'iPhone giả',
      issueCode: 'BATTERY_POWER',
      description: 'Máy bị sập nguồn liên tục',
      branchId: 'CN01'
    })).resolves.toMatchObject({ imei, model: 'iPhone 15 Pro' });
  });

  it('rejects a linked device that does not belong to the signed-in customer', async () => {
    const { db } = customerRequestDb({
      invoices: [{ id: 'INV-B', customerAccountUid: 'customer-b', devices: [{ imei: '351111111111111', model: 'iPhone 16' }] }]
    });
    await expect(createCustomerServiceRequest(db, authority('customer-a'), {
      idempotencyKey: 'foreign-device-request-001',
      requestType: 'REPAIR',
      deviceId: customerDeviceId('351111111111111'),
      issueCode: 'GENERAL_CHECK',
      description: 'Cần kiểm tra tổng quát máy',
      branchId: 'CN01'
    })).rejects.toThrow('CUSTOMER_REQUEST_DEVICE_NOT_OWNED');
  });

  it('rejects an unknown canonical repair issue code', async () => {
    const { db } = customerRequestDb();
    await expect(createCustomerServiceRequest(db, authority('customer-a'), {
      idempotencyKey: 'invalid-issue-request-001',
      requestType: 'REPAIR',
      imei: '356789012345678',
      model: 'iPhone 15',
      issueCode: 'NOT_A_REAL_ISSUE',
      description: 'Mô tả tình trạng hợp lệ',
      branchId: 'CN01'
    })).rejects.toThrow('CUSTOMER_REQUEST_ISSUE_INVALID');
  });

  it('manager approval of a portal quote waits for fresh customer OTP and supersedes the old decision', async () => {
    const updates = new Map<string, any>();
    const records: Record<string, any> = {
      'technicalWorkOrders/WO-1': { id: 'WO-1', branchId: 'CN01', customerAccountUid: 'customer-a', quoteVersion: 2, customerApprovalStatus: 'ACCEPTED', approvedFinalAmount: 500_000 },
      'technicalQuoteAdjustments/TQA-1': { id: 'TQA-1', workOrderId: 'WO-1', branchId: 'CN01', requestedAmount: 700_000, status: 'PENDING' }
    };
    const db: any = {
      collection: (collection: string) => ({ doc: (id: string) => ({ collection, id, path: `${collection}/${id}` }) }),
      runTransaction: async (callback: any) => callback({
        get: async (reference: any) => ({ exists: Boolean(records[reference.path]), data: () => records[reference.path] }),
        update: (reference: any, value: any) => updates.set(reference.path, { ...(updates.get(reference.path) || {}), ...value }),
        create: () => undefined
      })
    };
    await expect(processDecideTechnicalQuoteAdjustment(db, 'WO-1', 'TQA-1', {
      decision: 'APPROVED', idempotencyKey: 'portal-quote-manager-approval-001'
    }, { uid: 'manager-1', role: 'MANAGER', branchId: 'CN01' })).resolves.toMatchObject({ status: 'APPROVED' });
    expect(updates.get('technicalWorkOrders/WO-1')).toMatchObject({
      proposedQuoteAmount: 700_000,
      quoteStatus: 'PENDING_APPROVAL',
      quoteVersion: 3,
      customerApprovalStatus: 'SUPERSEDED',
      approvedFinalAmount: null
    });
  });
});
