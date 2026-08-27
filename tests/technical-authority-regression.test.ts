import { describe, expect, it } from 'vitest';
import { processCompleteTaskLine, processStartTaskLine } from '../server/services/technicalService';

type Ref = { col: string; id: string };

function authorityDb(workOrder: Record<string, unknown>, line: Record<string, unknown>) {
  const docs = new Map<string, Record<string, unknown>>([
    [`technicalWorkOrders/${String(workOrder.id)}`, workOrder],
    [`technicalWorkOrderLines/${String(line.id)}`, line]
  ]);
  const snapshot = (ref: Ref) => ({ id: ref.id, exists: docs.has(`${ref.col}/${ref.id}`), data: () => docs.get(`${ref.col}/${ref.id}`) });
  const db: any = {
    collection: (col: string) => ({
      doc: (id: string) => ({ col, id }),
      where: () => { throw new Error('QUERY_MUST_NOT_RUN_BEFORE_AUTHORITY_GUARD'); }
    }),
    runTransaction: async (callback: any) => callback({
      get: async (ref: Ref) => snapshot(ref),
      update: () => { throw new Error('WRITE_MUST_NOT_RUN'); },
      create: () => { throw new Error('WRITE_MUST_NOT_RUN'); }
    })
  };
  return db;
}

const tech = { uid: 'TECH_01', role: 'TECHNICIAN', branchId: 'CN01' };

describe('Technical custody authority regression', () => {
  it('rejects starting a task before physical custody acceptance', async () => {
    const db = authorityDb(
      { id: 'WO_01', branchId: 'CN01', status: 'ASSIGNED', currentCustodianUid: null },
      { id: 'LINE_01', workOrderId: 'WO_01', branchId: 'CN01', status: 'ASSIGNED', assigneeUid: 'TECH_01' }
    );
    await expect(processStartTaskLine(db, 'WO_01', 'LINE_01', tech)).rejects.toThrow('CUSTODY_ACCEPTANCE_REQUIRED');
  });

  it('rejects a technician who is assigned but is not the current physical custodian', async () => {
    const db = authorityDb(
      { id: 'WO_01', branchId: 'CN01', status: 'ACCEPTED', currentCustodianUid: 'TECH_02' },
      { id: 'LINE_01', workOrderId: 'WO_01', branchId: 'CN01', status: 'ASSIGNED', assigneeUid: 'TECH_01' }
    );
    await expect(processStartTaskLine(db, 'WO_01', 'LINE_01', tech)).rejects.toThrow('CURRENT_CUSTODIAN_REQUIRED');
  });

  it('does not let a manager complete work in place of the assigned technician', async () => {
    const db = authorityDb(
      { id: 'WO_01', branchId: 'CN01', status: 'IN_PROGRESS', currentCustodianUid: 'TECH_01' },
      { id: 'LINE_01', workOrderId: 'WO_01', branchId: 'CN01', status: 'IN_PROGRESS', assigneeUid: 'TECH_01' }
    );
    await expect(processCompleteTaskLine(
      db, 'WO_01', 'LINE_01', [], 'Quản lý hoàn thành thay KTV.',
      { uid: 'MANAGER_01', role: 'MANAGER', branchId: 'CN01' }
    )).rejects.toThrow('CURRENT_CUSTODIAN_REQUIRED');
  });
});
