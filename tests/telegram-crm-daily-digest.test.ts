import { describe, expect, it, vi } from 'vitest';
import {
  createCrmDailyDigestTelegramOutboxRecord,
  crmDailyDigestOutboxId,
  scanCrmDailyDigestAlerts
} from '../server/services/telegramService';

function document(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

describe('Telegram CRM daily operations digest', () => {
  it('creates a stable server-owned digest without customer contact data', () => {
    const first = crmDailyDigestOutboxId('2026-08-29');
    expect(first).toBe(crmDailyDigestOutboxId('2026-08-29'));
    expect(first).not.toBe(crmDailyDigestOutboxId('2026-08-30'));
    const record = createCrmDailyDigestTelegramOutboxRecord({
      reportDate: '2026-08-29', overdueCount: 2, dueTodayCount: 3, activeTaskCount: 10,
      coverageComplete: true,
      items: [{
        taskId: 'TASK_1', title: 'Gọi lại khách', assignedStaffName: 'Sale Một',
        branchName: 'CN-02', dueAt: '2026-08-29T02:00:00.000Z', overdue: false
      }]
    });
    expect(record).toMatchObject({
      eventType: 'CRM_DAILY_DIGEST', destination: 'PRIMARY_GROUP', status: 'PENDING',
      reportDate: '2026-08-29', overdueCount: 2, dueTodayCount: 3
    });
    expect(JSON.stringify(record)).not.toContain('phone');
    expect(JSON.stringify(record)).not.toContain('chatId');
  });

  it('scans canonical crmTasks using Vietnam day boundaries and writes one idempotent outbox event', async () => {
    const created: Array<{ id: string; data: any }> = [];
    const tasks = [
      document('OVERDUE', { status: 'PENDING', branchId: 'BR_1', title: 'Lead quá hạn', assignedStaffName: 'An', dueAt: '2026-08-29T00:00:00.000Z' }),
      document('DUE_TODAY', { status: 'IN_PROGRESS', branchId: 'BR_1', title: 'Gọi lại khách', assignedStaffName: 'Bình', dueAt: '2026-08-29T05:00:00.000Z' }),
      document('NEXT_DAY', { status: 'PENDING', branchId: 'BR_1', title: 'Ngày mai', assignedStaffName: 'Chi', dueAt: '2026-08-29T20:00:00.000Z' }),
      document('NO_DUE', { status: 'PENDING', branchId: 'BR_1', title: 'Chưa đặt hạn' })
    ];
    const branches = [document('BR_1', { name: 'PhoneHouse CN-02' })];
    const db: any = {
      collection: vi.fn((name: string) => {
        if (name === 'crmTasks') {
          const chain: any = {
            where: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            get: async () => ({ docs: tasks, size: tasks.length })
          };
          return chain;
        }
        if (name === 'branches') {
          return { limit: () => ({ get: async () => ({ docs: branches, size: branches.length }) }) };
        }
        if (name === 'telegramOutboxEvents') {
          return { doc: (id: string) => ({ create: async (data: any) => { created.push({ id, data }); } }) };
        }
        throw new Error(`UNEXPECTED_COLLECTION_${name}`);
      })
    };

    const result = await scanCrmDailyDigestAlerts(db, '2026-08-29T01:05:00.000Z');
    expect(result).toMatchObject({ scanned: 4, created: 1, overdueCount: 1, dueTodayCount: 1, coverageComplete: true });
    expect(created).toHaveLength(1);
    expect(created[0].id).toBe(crmDailyDigestOutboxId('2026-08-29'));
    expect(created[0].data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: 'OVERDUE', overdue: true, branchName: 'PhoneHouse CN-02' }),
      expect.objectContaining({ taskId: 'DUE_TODAY', overdue: false })
    ]));
    expect(created[0].data.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ taskId: 'NEXT_DAY' })]));
  });
});
