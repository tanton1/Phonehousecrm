import { describe, expect, it, vi } from 'vitest';
import {
  resolveTelegramPrincipal,
  telegramLinkCodeId,
  telegramPrincipalCanAccessBranch,
  telegramSenderLinkId,
  type TelegramPrincipal
} from '../server/services/telegramAuthorityService';
import { answerTelegramQuery, parseTelegramIntent } from '../server/services/telegramService';
import { toolGetCashflowSummary, toolGetCrmPipeline, toolCheckInventory } from '../server/services/telegramAiAssistant';

const salesPrincipal: TelegramPrincipal = {
  senderId: '123456', senderFingerprint: 'fingerprint', uid: 'SALE_1', name: 'Sale Một', role: 'SALES',
  branchId: 'BR_1', assignedBranchIds: ['BR_1'], isOwner: false, linked: true
};

describe('Telegram CRM identity and canonical tool authority', () => {
  it('creates deterministic opaque ids and parses the one-time link command', () => {
    expect(telegramSenderLinkId('123')).toBe(telegramSenderLinkId('123'));
    expect(telegramSenderLinkId('123')).not.toContain('123');
    expect(telegramLinkCodeId('ABCDEF1234')).toBe(telegramLinkCodeId('abcdef1234'));
    expect(parseTelegramIntent('/lienket ABCDEF1234')).toEqual({ kind: 'LINK', code: 'ABCDEF1234' });
  });

  it('resolves configured owners without reading a user document', async () => {
    const db: any = { collection: vi.fn(() => { throw new Error('SHOULD_NOT_READ_DB'); }) };
    const principal = await resolveTelegramPrincipal(db, '999', new Set(['999']));
    expect(principal).toMatchObject({ role: 'ADMIN', isOwner: true, senderId: '999' });
  });

  it('resolves linked staff from users/{uid} and enforces assigned branches', async () => {
    const link = { uid: 'SALE_1', active: true };
    const user = { active: true, role: 'SALE', branchId: 'BR_1', assignedBranchIds: ['BR_1'], displayName: 'Sale Một' };
    const db: any = {
      collection: vi.fn((name: string) => ({
        doc: (id: string) => ({
          get: async () => name === 'telegramUserLinks'
            ? { exists: true, data: () => link }
            : name === 'users' && id === 'SALE_1'
              ? { exists: true, data: () => user }
              : { exists: false, data: () => ({}) }
        })
      }))
    };
    const principal = await resolveTelegramPrincipal(db, '123456', new Set());
    expect(principal).toMatchObject({ uid: 'SALE_1', role: 'SALES', branchId: 'BR_1', linked: true });
    expect(telegramPrincipalCanAccessBranch(principal!, 'BR_1')).toBe(true);
    expect(telegramPrincipalCanAccessBranch(principal!, 'BR_2')).toBe(false);
  });

  it('requires a linked principal for production webhook-style queries', async () => {
    const db: any = {};
    const answer = await answerTelegramQuery(db, '/soquy homnay', 'UNLINKED', null);
    expect(answer.intent).toBe('LINK_REQUIRED');
    expect(answer.reply).toContain('/lienket');
  });

  it('denies finance to sales before any financial collection is read', async () => {
    const db: any = { collection: vi.fn(() => { throw new Error('FINANCE_SHOULD_NOT_BE_READ'); }) };
    const result = await toolGetCashflowSummary(db, { period: 'TODAY' }, '123456', salesPrincipal);
    expect(result).toContain('không có quyền');
    expect(db.collection).not.toHaveBeenCalled();
  });

  it('denies cross-branch inventory before devices are queried', async () => {
    const branchDocs = [
      { id: 'BR_1', data: () => ({ name: 'Chi nhánh 1', code: 'CN-01', isActive: true }) },
      { id: 'BR_2', data: () => ({ name: 'Chi nhánh 2', code: 'CN-02', isActive: true }) }
    ];
    const collection = vi.fn((name: string) => {
      if (name === 'branches') return { limit: () => ({ get: async () => ({ docs: branchDocs }) }) };
      throw new Error(`UNEXPECTED_${name}`);
    });
    const result = await toolCheckInventory({ collection } as any, { branchQuery: 'CN-02' }, '123456', salesPrincipal);
    expect(result).toContain('không có quyền');
    expect(collection).toHaveBeenCalledTimes(1);
  });

  it('builds CRM pipeline from canonical leads/tasks instead of crm_leads', async () => {
    const collections: string[] = [];
    const docsByCollection: Record<string, any[]> = {
      branches: [{ id: 'BR_1', data: () => ({ name: 'Chi nhánh 1', code: 'CN-01', isActive: true }) }],
      leads: [{ id: 'LEAD_1', data: () => ({ branchId: 'BR_1', status: 'won', createdAt: new Date().toISOString() }) }],
      leadCareActivities: [], invoices: [], crmTasks: []
    };
    const db: any = {
      collection: vi.fn((name: string) => {
        collections.push(name);
        const chain: any = {
          where: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          get: async () => ({ docs: docsByCollection[name] || [] })
        };
        return chain;
      })
    };
    const manager = { ...salesPrincipal, uid: 'MGR_1', role: 'MANAGER', name: 'Quản lý' };
    const result = await toolGetCrmPipeline(db, { branchQuery: 'CN-01', period: 'MONTH' }, manager);
    expect(result).toContain('CRM PIPELINE');
    expect(collections).toContain('leads');
    expect(collections).toContain('crmTasks');
    expect(collections).not.toContain('crm_leads');
  });
});
