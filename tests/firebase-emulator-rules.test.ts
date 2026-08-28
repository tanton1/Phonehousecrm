import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

let env: RulesTestEnvironment;
const hasRulesEmulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST);
const describeWithEmulators = hasRulesEmulators ? describe : describe.skip;

describeWithEmulators('deployed Firestore and Storage rules', () => {
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'phonehouse-rules-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    storage: { rules: fs.readFileSync('storage.rules', 'utf8') }
  });
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users/admin-1'), { role: 'ADMIN', active: true, branchId: 'CN01', assignedBranchIds: ['CN01'] });
    await setDoc(doc(context.firestore(), 'users/manager-1'), { role: 'MANAGER', active: true, branchId: 'CN01', assignedBranchIds: ['CN01'] });
    await setDoc(doc(context.firestore(), 'users/manager-2'), { role: 'MANAGER', active: true, branchId: 'CN02', assignedBranchIds: ['CN02'] });
    await setDoc(doc(context.firestore(), 'users/staff-1'), { role: 'SALES', active: true, branchId: 'CN01', assignedBranchIds: ['CN01'] });
    await setDoc(doc(context.firestore(), 'users/tech-1'), { role: 'TECHNICIAN', active: true, branchId: 'CN01', assignedBranchIds: ['CN01'] });
    await setDoc(doc(context.firestore(), 'users/accountant-1'), { role: 'ACCOUNTANT', active: true, branchId: 'CN01', assignedBranchIds: ['CN01'] });
    await setDoc(doc(context.firestore(), 'technicalSecrets/WO-1'), { branchId: 'CN01', encryptedSecret: 'never-browser-readable' });
    await setDoc(doc(context.firestore(), 'catalogItems/SKU-1'), { branchId: 'CN01', lifecycleStatus: 'ACTIVE' });
    await setDoc(doc(context.firestore(), 'branches/CN01'), { id: 'CN01', name: 'PhoneHouse', isActive: true });
    await setDoc(doc(context.firestore(), 'partners/PT-1'), { id: 'PT-1', branchId: 'CN01', name: 'Nhà cung cấp' });
    await setDoc(doc(context.firestore(), 'partyMasters/PTY-1'), { id: 'PTY-1', displayName: 'Danh tính dùng chung', phoneNormalized: '0905000001' });
    await setDoc(doc(context.firestore(), 'branchPartyAccounts/BPA-1'), { id: 'BPA-1', branchId: 'CN01', partyMasterId: 'PTY-1', type: 'SUPPLIER', status: 'ACTIVE' });
    await setDoc(doc(context.firestore(), 'debtLedgerEntries/DLE-1'), { id: 'DLE-1', branchId: 'CN01', partyAccountId: 'BPA-1', direction: 'PAYABLE', debitIncrease: 1000, creditDecrease: 0 });
    await setDoc(doc(context.firestore(), 'branchProducts/BPR-1'), { id: 'BPR-1', branchId: 'CN01', productMasterId: 'SKU-1', status: 'ACTIVE' });
    await setDoc(doc(context.firestore(), 'leaveRequests/LR-1'), { id: 'LR-1', branchId: 'CN01', staffId: 'staff-1', status: 'PENDING' });
    await setDoc(doc(context.firestore(), 'tradeIns/TR-1'), { id: 'TR-1', branchId: 'CN01', createdByUid: 'staff-1', status: 'pending' });
    await setDoc(doc(context.firestore(), 'sopTemplates/SOP-1'), { id: 'SOP-1', code: 'SOP-OPEN', isActive: true });
    await setDoc(doc(context.firestore(), 'dailyShiftChecklists/CL-1'), { id: 'CL-1', branchId: 'CN01', staffId: 'staff-1', isCompleted: false });
    await setDoc(doc(context.firestore(), 'shiftHandover/HO-1'), { id: 'HO-1', branchId: 'CN01', staffId: 'staff-1', status: 'SUBMITTED' });
    await setDoc(doc(context.firestore(), 'funds/FUND-1'), { id: 'FUND-1', branchId: 'CN01', currentBalance: 1_000_000 });
    await setDoc(doc(context.firestore(), 'cashTransactions/TX-1'), { id: 'TX-1', branchId: 'CN01', amount: 100_000 });
    await setDoc(doc(context.firestore(), 'leadAssignmentHistory/AH-1'), { id: 'AH-1', branchId: 'CN01', leadId: 'LEAD-1' });
    await setDoc(doc(context.firestore(), 'commissionLedger/COMM-1'), { id: 'COMM-1', branchId: 'CN01', staffUid: 'tech-1', amount: 50_000 });
    await setDoc(doc(context.firestore(), 'telegramOutboxEvents/TG-1'), { id: 'TG-1', branchId: 'CN01', staffId: 'staff-1', status: 'PENDING' });
    await setDoc(doc(context.firestore(), 'telegramQueryAudit/TQA-1'), { id: 'TQA-1', senderFingerprint: 'masked' });
    await setDoc(doc(context.firestore(), 'telegramRateLimits/TRL-1'), { id: 'TRL-1', count: 1 });
    await setDoc(doc(context.firestore(), 'attendanceLocationState/ATT-1'), { id: 'ATT-1', branchId: 'CN01', staffId: 'staff-1', lastLatitude: 16.0, lastLongitude: 108.0 });
  });
});

afterAll(async () => { await env?.cleanup(); });

  it('ADMIN browser cannot read server-only technical secrets', async () => {
    const db = env.authenticatedContext('admin-1').firestore();
    await assertFails(getDoc(doc(db, 'technicalSecrets/WO-1')));
  });

  it('Telegram operations and live attendance locations are server-only even for ADMIN', async () => {
    const adminDb = env.authenticatedContext('admin-1').firestore();
    const staffDb = env.authenticatedContext('staff-1').firestore();
    for (const path of [
      'telegramOutboxEvents/TG-1',
      'telegramQueryAudit/TQA-1',
      'telegramRateLimits/TRL-1',
      'attendanceLocationState/ATT-1'
    ]) {
      await assertFails(getDoc(doc(adminDb, path)));
      await assertFails(getDoc(doc(staffDb, path)));
      await assertFails(setDoc(doc(adminDb, path), { tampered: true }));
    }
  });

  it('active authenticated users retain explicit safe catalog reads', async () => {
    const db = env.authenticatedContext('admin-1').firestore();
    await assertSucceeds(getDoc(doc(db, 'catalogItems/SKU-1')));
  });

  it('shared identities stay server-only while branch accounts, ledgers and products stay branch-scoped', async () => {
    const ownManager = env.authenticatedContext('manager-1').firestore();
    const otherManager = env.authenticatedContext('manager-2').firestore();
    const admin = env.authenticatedContext('admin-1').firestore();
    await assertFails(getDoc(doc(admin, 'partyMasters/PTY-1')));
    await assertSucceeds(getDoc(doc(ownManager, 'branchPartyAccounts/BPA-1')));
    await assertSucceeds(getDoc(doc(ownManager, 'debtLedgerEntries/DLE-1')));
    await assertSucceeds(getDoc(doc(ownManager, 'branchProducts/BPR-1')));
    await assertFails(getDoc(doc(otherManager, 'branchPartyAccounts/BPA-1')));
    await assertFails(getDoc(doc(otherManager, 'debtLedgerEntries/DLE-1')));
    await assertFails(setDoc(doc(admin, 'debtLedgerEntries/DLE-2'), { branchId: 'CN01', debitIncrease: 1 }));
  });

  it('browser uploads are denied even for ADMIN', async () => {
    const storage = env.authenticatedContext('admin-1').storage();
    await assertFails(uploadBytes(ref(storage, 'technical-evidence/WO-1/L-1/a.jpg'), new Blob(['x'], { type: 'image/jpeg' })));
  });

  it('browser cannot write server-owned organization, partner or leave records', async () => {
    const db = env.authenticatedContext('admin-1').firestore();
    await assertFails(setDoc(doc(db, 'branches/CN02'), { id: 'CN02', name: 'Sai đường ghi' }));
    await assertFails(setDoc(doc(db, 'partners/PT-2'), { id: 'PT-2', branchId: 'CN01', outstandingDebt: 0 }));
    await assertFails(setDoc(doc(db, 'leaveRequests/LR-2'), { id: 'LR-2', branchId: 'CN01', staffId: 'admin-1', status: 'PENDING' }));
  });

  it('manager cannot read another branch leave request', async () => {
    const ownDb = env.authenticatedContext('manager-1').firestore();
    const otherDb = env.authenticatedContext('manager-2').firestore();
    await assertSucceeds(getDoc(doc(ownDb, 'leaveRequests/LR-1')));
    await assertFails(getDoc(doc(otherDb, 'leaveRequests/LR-1')));
  });

  it('trade-in, SOP, checklist and handover writes are server-only', async () => {
    const staffDb = env.authenticatedContext('staff-1').firestore();
    const managerDb = env.authenticatedContext('manager-1').firestore();
    await assertFails(setDoc(doc(staffDb, 'tradeIns/TR-2'), { id: 'TR-2', branchId: 'CN01', status: 'accepted', approvedPrice: 10_000_000 }));
    await assertFails(setDoc(doc(managerDb, 'sopTemplates/SOP-2'), { id: 'SOP-2', code: 'SOP-NEW', isActive: true }));
    await assertFails(setDoc(doc(staffDb, 'dailyShiftChecklists/CL-2'), { id: 'CL-2', branchId: 'CN01', staffId: 'staff-1' }));
    await assertFails(setDoc(doc(staffDb, 'shiftHandover/HO-2'), { id: 'HO-2', branchId: 'CN01', staffId: 'staff-1' }));
  });

  it('checklist and handover reads are scoped to owner or manager branch', async () => {
    const staffDb = env.authenticatedContext('staff-1').firestore();
    const ownManagerDb = env.authenticatedContext('manager-1').firestore();
    const otherManagerDb = env.authenticatedContext('manager-2').firestore();
    await assertSucceeds(getDoc(doc(staffDb, 'dailyShiftChecklists/CL-1')));
    await assertSucceeds(getDoc(doc(ownManagerDb, 'shiftHandover/HO-1')));
    await assertFails(getDoc(doc(otherManagerDb, 'dailyShiftChecklists/CL-1')));
    await assertFails(getDoc(doc(otherManagerDb, 'shiftHandover/HO-1')));
  });

  it('finance collections require finance role and matching branch', async () => {
    const salesDb = env.authenticatedContext('staff-1').firestore();
    const techDb = env.authenticatedContext('tech-1').firestore();
    const accountantDb = env.authenticatedContext('accountant-1').firestore();
    const otherManagerDb = env.authenticatedContext('manager-2').firestore();
    await assertFails(getDoc(doc(salesDb, 'funds/FUND-1')));
    await assertFails(getDoc(doc(techDb, 'cashTransactions/TX-1')));
    await assertSucceeds(getDoc(doc(accountantDb, 'funds/FUND-1')));
    await assertSucceeds(getDoc(doc(accountantDb, 'cashTransactions/TX-1')));
    await assertFails(getDoc(doc(otherManagerDb, 'funds/FUND-1')));
  });

  it('lead assignment and commission reads stay branch scoped while staff may read own commission', async () => {
    const ownManagerDb = env.authenticatedContext('manager-1').firestore();
    const otherManagerDb = env.authenticatedContext('manager-2').firestore();
    const technicianDb = env.authenticatedContext('tech-1').firestore();
    await assertSucceeds(getDoc(doc(ownManagerDb, 'leadAssignmentHistory/AH-1')));
    await assertFails(getDoc(doc(otherManagerDb, 'leadAssignmentHistory/AH-1')));
    await assertSucceeds(getDoc(doc(ownManagerDb, 'commissionLedger/COMM-1')));
    await assertFails(getDoc(doc(otherManagerDb, 'commissionLedger/COMM-1')));
    await assertSucceeds(getDoc(doc(technicianDb, 'commissionLedger/COMM-1')));
  });
});
