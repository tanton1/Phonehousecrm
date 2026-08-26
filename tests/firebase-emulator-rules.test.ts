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
    await setDoc(doc(context.firestore(), 'technicalSecrets/WO-1'), { branchId: 'CN01', encryptedSecret: 'never-browser-readable' });
    await setDoc(doc(context.firestore(), 'catalogItems/SKU-1'), { branchId: 'CN01', lifecycleStatus: 'ACTIVE' });
    await setDoc(doc(context.firestore(), 'branches/CN01'), { id: 'CN01', name: 'PhoneHouse', isActive: true });
    await setDoc(doc(context.firestore(), 'partners/PT-1'), { id: 'PT-1', branchId: 'CN01', name: 'Nhà cung cấp' });
    await setDoc(doc(context.firestore(), 'leaveRequests/LR-1'), { id: 'LR-1', branchId: 'CN01', staffId: 'staff-1', status: 'PENDING' });
    await setDoc(doc(context.firestore(), 'tradeIns/TR-1'), { id: 'TR-1', branchId: 'CN01', createdByUid: 'staff-1', status: 'pending' });
    await setDoc(doc(context.firestore(), 'sopTemplates/SOP-1'), { id: 'SOP-1', code: 'SOP-OPEN', isActive: true });
    await setDoc(doc(context.firestore(), 'dailyShiftChecklists/CL-1'), { id: 'CL-1', branchId: 'CN01', staffId: 'staff-1', isCompleted: false });
    await setDoc(doc(context.firestore(), 'shiftHandover/HO-1'), { id: 'HO-1', branchId: 'CN01', staffId: 'staff-1', status: 'SUBMITTED' });
  });
});

afterAll(async () => { await env?.cleanup(); });

  it('ADMIN browser cannot read server-only technical secrets', async () => {
    const db = env.authenticatedContext('admin-1').firestore();
    await assertFails(getDoc(doc(db, 'technicalSecrets/WO-1')));
  });

  it('active authenticated users retain explicit safe catalog reads', async () => {
    const db = env.authenticatedContext('admin-1').firestore();
    await assertSucceeds(getDoc(doc(db, 'catalogItems/SKU-1')));
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
});
