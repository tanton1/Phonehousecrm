import { describe, it, expect, beforeEach } from 'vitest';

// Simulation of Firestore Security Rules logic for v4.2 (Authoritative Single Writer & Active User Invariant)
interface SimulatedAuth {
  uid: string;
  token?: { role?: string };
}

interface SimulatedUserDoc {
  role: string;
  branchId: string;
  assignedBranchIds?: string[];
  active?: boolean;
  mustChangePassword?: boolean;
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
    // Strict Active Invariant: active MUST be strictly true (not undefined, not false)
    return doc !== undefined && doc.active === true && doc.mustChangePassword !== true;
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
    // In v4.0+: allow write: if false; (Only Server Atomic Transaction executeAtomicCheckout via Admin SDK)
    return false;
  }

  // Rules for Cash Transactions write: Strict Single Writer Principle
  canWriteCashTransactions(auth: SimulatedAuth | null): boolean {
    // In v4.0+: allow write: if false; (Only Server Finance API /api/finance/... via Admin SDK)
    return false;
  }

  // Rules for Funds write: Strict Single Writer Principle
  canWriteFunds(auth: SimulatedAuth | null): boolean {
    // In v4.0+: allow write: if false; (Only Server Admin SDK)
    return false;
  }

  // Rules for Products create/update
  canWriteProducts(auth: SimulatedAuth | null): boolean {
    return this.canManageInventory(auth);
  }

  // Canonical spare-parts stock/cost is written only by the server Part Ledger.
  canWriteSpareParts(auth: SimulatedAuth | null): boolean {
    return false;
  }

  // Rules for Users collection creation
  canCreateUser(auth: SimulatedAuth | null): boolean {
    return false;
  }

  // Rules for Chat Conversations read
  canReadConversation(auth: SimulatedAuth | null, conv: { branchId?: string; assignedStaffId?: string; participants?: string[] }): boolean {
    if (this.isAdmin(auth)) return true;
    if (!this.isAuthenticated(auth) || !auth || !this.isActiveUser(auth)) return false;

    if (conv.assignedStaffId && conv.assignedStaffId === auth.uid) return true;
    if (conv.participants && conv.participants.includes(auth.uid)) return true;
    if (conv.branchId && this.canAccessBranch(auth, conv.branchId)) return true;

    return false;
  }

  // Rules for Stock Transfers read
  canReadStockTransfer(auth: SimulatedAuth | null, transfer: { sourceBranchId: string; destinationBranchId: string }): boolean {
    if (this.isAdmin(auth)) return true;
    if (!this.isAuthenticated(auth) || !auth || !this.isActiveUser(auth)) return false;

    return this.canAccessBranch(auth, transfer.sourceBranchId) || this.canAccessBranch(auth, transfer.destinationBranchId);
  }
}

describe('Firestore Security Rules v4.2 & Authority Invariant Test Suite', () => {
  const validator = new SecurityRulesValidator();

  beforeEach(() => {
    validator.users.set('ADMIN-UID', { role: 'ADMIN', branchId: 'CN01', active: true });
    validator.users.set('MANAGER-UID', { role: 'MANAGER', branchId: 'CN01', active: true });
    validator.users.set('SALES-CN01', { role: 'SALES', branchId: 'CN01', active: true });
    validator.users.set('SALES-CN02', { role: 'SALES', branchId: 'CN02', active: true });
    validator.users.set('TECH-UID', { role: 'TECH', branchId: 'CN01', active: true });
    validator.users.set('INV-MGR-UID', { role: 'INVENTORY_MANAGER', branchId: 'CN01', active: true });
    validator.users.set('INACTIVE-STAFF', { role: 'SALES', branchId: 'CN01', active: false });
    validator.users.set('LEGACY-STAFF-NO-ACTIVE-FIELD', { role: 'SALES', branchId: 'CN01' }); // active is undefined
    validator.users.set('PASSWORD-CHANGE-REQUIRED', { role: 'SALES', branchId: 'CN01', active: true, mustChangePassword: true });
  });

  it('Case 3B: Tài khoản bắt buộc đổi mật khẩu chưa được đọc dữ liệu vận hành', () => {
    const lockedUser = { uid: 'PASSWORD-CHANGE-REQUIRED' };
    expect(validator.isActiveUser(lockedUser)).toBe(false);
    expect(validator.canAccessBranch(lockedUser, 'CN01')).toBe(false);
    expect(validator.canReadConversation(lockedUser, { branchId: 'CN01' })).toBe(false);
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

  it('Case 3: Active User Invariant - Tài khoản active=false hoặc thiếu field active bị từ chối mọi quyền', () => {
    const inactiveUser = { uid: 'INACTIVE-STAFF' };
    const legacyUser = { uid: 'LEGACY-STAFF-NO-ACTIVE-FIELD' };

    expect(validator.isActiveUser(inactiveUser)).toBe(false);
    expect(validator.canAccessBranch(inactiveUser, 'CN01')).toBe(false);
    expect(validator.canWriteProducts(inactiveUser)).toBe(false);
    expect(validator.canWriteSpareParts(inactiveUser)).toBe(false);

    expect(validator.isActiveUser(legacyUser)).toBe(false);
    expect(validator.canAccessBranch(legacyUser, 'CN01')).toBe(false);
    expect(validator.canWriteProducts(legacyUser)).toBe(false);
  });

  it('Case 4: Phân quyền Quản lý kho (canManageInventory)', () => {
    expect(validator.canWriteProducts({ uid: 'SALES-CN01' })).toBe(false);
    expect(validator.canWriteProducts({ uid: 'INV-MGR-UID' })).toBe(true);
    expect(validator.canWriteProducts({ uid: 'MANAGER-UID' })).toBe(true);
    expect(validator.canWriteProducts({ uid: 'ADMIN-UID' })).toBe(true);
  });

  it('Case 5: Khóa mọi ghi trực tiếp vào kho linh kiện, kể cả Admin', () => {
    expect(validator.canWriteSpareParts({ uid: 'SALES-CN01' })).toBe(false);
    expect(validator.canWriteSpareParts({ uid: 'TECH-UID' })).toBe(false);
    expect(validator.canWriteSpareParts({ uid: 'MANAGER-UID' })).toBe(false);
    expect(validator.canWriteSpareParts({ uid: 'ADMIN-UID' })).toBe(false);
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

  it('Case 7: Phân quyền hội thoại Chat (Chat Conversation Scoping)', () => {
    const saleCN01 = { uid: 'SALES-CN01' };
    const saleCN02 = { uid: 'SALES-CN02' };

    const convCN01 = { branchId: 'CN01', assignedStaffId: 'SALES-CN01' };
    const convCN02 = { branchId: 'CN02', assignedStaffId: 'SALES-CN02' };

    expect(validator.canReadConversation(saleCN01, convCN01)).toBe(true);
    expect(validator.canReadConversation(saleCN01, convCN02)).toBe(false);
    expect(validator.canReadConversation(saleCN02, convCN02)).toBe(true);
    expect(validator.canReadConversation(saleCN02, convCN01)).toBe(false);
  });

  it('Case 8: Phân quyền Chuyển kho nội bộ (Transfers Scope - Source or Destination Branch)', () => {
    const saleCN01 = { uid: 'SALES-CN01' };
    const saleCN02 = { uid: 'SALES-CN02' };
    const transfer1to2 = { sourceBranchId: 'CN01', destinationBranchId: 'CN02' };
    const transfer3to4 = { sourceBranchId: 'CN03', destinationBranchId: 'CN04' };

    expect(validator.canReadStockTransfer(saleCN01, transfer1to2)).toBe(true);
    expect(validator.canReadStockTransfer(saleCN02, transfer1to2)).toBe(true);
    expect(validator.canReadStockTransfer(saleCN01, transfer3to4)).toBe(false);
  });
});
