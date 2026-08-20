import { describe, it, expect, beforeEach } from 'vitest';

// Simulation of Firestore Security Rules logic for v4.0 (Authoritative Single Writer & Active User Invariant)
interface SimulatedAuth {
  uid: string;
  token?: { role?: string };
}

interface SimulatedUserDoc {
  role: string;
  branchId: string;
  assignedBranchIds?: string[];
  active?: boolean;
}

class SecurityRulesValidator {
  users: Map<string, SimulatedUserDoc> = new Map();

  isAuthenticated(auth: SimulatedAuth | null): boolean {
    return auth !== null && auth.uid !== undefined;
  }

  isSelf(auth: SimulatedAuth | null, userId: string): boolean {
    return this.isAuthenticated(auth) && auth?.uid === userId;
  }

  getUserDoc(auth: SimulatedAuth | null): SimulatedUserDoc | undefined {
    if (!this.isAuthenticated(auth) || !auth) return undefined;
    return this.users.get(auth.uid);
  }

  isActiveUser(auth: SimulatedAuth | null): boolean {
    const doc = this.getUserDoc(auth);
    return doc !== undefined && doc.active !== false;
  }

  getUserRole(auth: SimulatedAuth | null): string {
    return this.getUserDoc(auth)?.role || '';
  }

  getUserBranch(auth: SimulatedAuth | null): string {
    return this.getUserDoc(auth)?.branchId || '';
  }

  isAdmin(auth: SimulatedAuth | null): boolean {
    return this.isAuthenticated(auth) && this.isActiveUser(auth) && this.getUserRole(auth) === 'ADMIN';
  }

  isManager(auth: SimulatedAuth | null): boolean {
    return this.isAdmin(auth) || (
      this.isAuthenticated(auth) && this.isActiveUser(auth) && this.getUserRole(auth) === 'MANAGER'
    );
  }

  canManageInventory(auth: SimulatedAuth | null): boolean {
    const role = this.getUserRole(auth);
    return this.isAdmin(auth) || this.isManager(auth) || (this.isActiveUser(auth) && role === 'INVENTORY_MANAGER');
  }

  canManageTechnicalStock(auth: SimulatedAuth | null): boolean {
    const role = this.getUserRole(auth);
    return this.isAdmin(auth) || this.isManager(auth) || (this.isActiveUser(auth) && (role === 'TECH_LEAD' || role === 'TECH'));
  }

  canAccessBranch(auth: SimulatedAuth | null, targetBranchId: string): boolean {
    if (this.isAdmin(auth)) return true;
    if (!this.isAuthenticated(auth) || !auth || !this.isActiveUser(auth)) return false;
    if (!targetBranchId || typeof targetBranchId !== 'string') return false;

    const userDoc = this.users.get(auth.uid);
    if (!userDoc) return false;

    return userDoc.branchId === targetBranchId || (
      Array.isArray(userDoc.assignedBranchIds) && userDoc.assignedBranchIds.includes(targetBranchId)
    );
  }

  // Rules for Invoices write: Strict Single Writer Principle
  canWriteInvoices(auth: SimulatedAuth | null): boolean {
    // In v4.0: allow write: if false; (Only Server Atomic Transaction executeAtomicCheckout via Admin SDK)
    return false;
  }

  // Rules for Cash Transactions write: Strict Single Writer Principle
  canWriteCashTransactions(auth: SimulatedAuth | null): boolean {
    // In v4.0: allow write: if false; (Only Server Finance API /api/finance/... via Admin SDK)
    return false;
  }

  // Rules for Funds write: Strict Single Writer Principle
  canWriteFunds(auth: SimulatedAuth | null): boolean {
    // In v4.0: allow write: if false; (Only Server Admin SDK)
    return false;
  }

  // Rules for Products create/update
  canWriteProducts(auth: SimulatedAuth | null): boolean {
    return this.canManageInventory(auth);
  }

  // Rules for Spare Parts create/update
  canWriteSpareParts(auth: SimulatedAuth | null): boolean {
    return this.canManageTechnicalStock(auth);
  }

  // Rules for Users collection creation
  canCreateUser(auth: SimulatedAuth | null): boolean {
    // In v4.0: allow create: if false;
    return false;
  }
}

describe('Sprint 4: Firestore Rules v4.0 Security & Single Writer Test Suite', () => {
  const validator = new SecurityRulesValidator();

  beforeEach(() => {
    validator.users.set('ADMIN-UID', { role: 'ADMIN', branchId: 'CN01', active: true });
    validator.users.set('MANAGER-UID', { role: 'MANAGER', branchId: 'CN01', active: true });
    validator.users.set('SALES-CN01', { role: 'SALES', branchId: 'CN01', active: true });
    validator.users.set('SALES-CN02', { role: 'SALES', branchId: 'CN02', active: true });
    validator.users.set('TECH-UID', { role: 'TECH', branchId: 'CN01', active: true });
    validator.users.set('INV-MGR-UID', { role: 'INVENTORY_MANAGER', branchId: 'CN01', active: true });
    validator.users.set('INACTIVE-STAFF', { role: 'SALES', branchId: 'CN01', active: false });
  });

  it('Case 1: Khóa hoàn toàn quyền Client ghi trực tiếp vào /invoices (Single Writer)', () => {
    expect(validator.canWriteInvoices({ uid: 'SALES-CN01' })).toBe(false);
    expect(validator.canWriteInvoices({ uid: 'MANAGER-UID' })).toBe(false);
    expect(validator.canWriteInvoices({ uid: 'ADMIN-UID' })).toBe(false);
  });

  it('Case 2: Khóa hoàn toàn quyền Client ghi trực tiếp vào /cashTransactions & /funds (Single Writer)', () => {
    expect(validator.canWriteCashTransactions({ uid: 'SALES-CN01' })).toBe(false);
    expect(validator.canWriteCashTransactions({ uid: 'ADMIN-UID' })).toBe(false);
    expect(validator.canWriteFunds({ uid: 'SALES-CN01' })).toBe(false);
    expect(validator.canWriteFunds({ uid: 'ADMIN-UID' })).toBe(false);
  });

  it('Case 3: Active User Invariant - Tài khoản bị vô hiệu hóa (active=false) bị từ chối mọi quyền', () => {
    const inactiveUser = { uid: 'INACTIVE-STAFF' };
    expect(validator.isActiveUser(inactiveUser)).toBe(false);
    expect(validator.canAccessBranch(inactiveUser, 'CN01')).toBe(false);
    expect(validator.canWriteProducts(inactiveUser)).toBe(false);
    expect(validator.canWriteSpareParts(inactiveUser)).toBe(false);
  });

  it('Case 4: Phân quyền Quản lý kho (canManageInventory)', () => {
    expect(validator.canWriteProducts({ uid: 'SALES-CN01' })).toBe(false);
    expect(validator.canWriteProducts({ uid: 'INV-MGR-UID' })).toBe(true);
    expect(validator.canWriteProducts({ uid: 'MANAGER-UID' })).toBe(true);
    expect(validator.canWriteProducts({ uid: 'ADMIN-UID' })).toBe(true);
  });

  it('Case 5: Phân quyền Kho Linh kiện kỹ thuật (canManageTechnicalStock)', () => {
    expect(validator.canWriteSpareParts({ uid: 'SALES-CN01' })).toBe(false);
    expect(validator.canWriteSpareParts({ uid: 'TECH-UID' })).toBe(true);
    expect(validator.canWriteSpareParts({ uid: 'MANAGER-UID' })).toBe(true);
    expect(validator.canWriteSpareParts({ uid: 'ADMIN-UID' })).toBe(true);
  });

  it('Case 6: Cách ly dữ liệu Chi nhánh (Branch Isolation)', () => {
    const saleCN01 = { uid: 'SALES-CN01' };
    const saleCN02 = { uid: 'SALES-CN02' };
    const admin = { uid: 'ADMIN-UID' };

    expect(validator.canAccessBranch(saleCN01, 'CN01')).toBe(true);
    expect(validator.canAccessBranch(saleCN01, 'CN02')).toBe(false);

    expect(validator.canAccessBranch(saleCN02, 'CN02')).toBe(true);
    expect(validator.canAccessBranch(saleCN02, 'CN01')).toBe(false);

    expect(validator.canAccessBranch(admin, 'CN01')).toBe(true);
    expect(validator.canAccessBranch(admin, 'CN02')).toBe(true);
  });
});
