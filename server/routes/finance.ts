import { Router, Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';

function canAccessBranch(user: any, targetBranchId?: string): boolean {
  if (!targetBranchId || targetBranchId === 'ALL') return false;
  if (user?.role === 'ADMIN') return true;
  const userBranchId = user?.branchId;
  const assigned = user?.assignedBranchIds || [];
  return userBranchId === targetBranchId || assigned.includes(targetBranchId);
}

const FINANCE_ACCOUNT_TYPES = new Set(['CASH', 'BANK', 'POS_CARD', 'INSTALLMENT_CREDIT']);

function requiredBranchId(value: unknown): string {
  const branchId = String(value || '').trim();
  if (!branchId || branchId === 'ALL') {
    throw new Error('BRANCH_REQUIRED: Tài khoản tài chính bắt buộc thuộc một chi nhánh cụ thể.');
  }
  return branchId;
}

function normalizedAccountNumber(value: unknown): string {
  return String(value || '').replace(/\s+/g, '').trim();
}

export function validateFinanceAccountDraft(input: any) {
  const branchId = requiredBranchId(input?.branchId);
  const type = String(input?.type || '').trim().toUpperCase();
  const name = String(input?.name || '').trim();
  if (!FINANCE_ACCOUNT_TYPES.has(type)) throw new Error('ACCOUNT_TYPE_INVALID');
  if (!name) throw new Error('ACCOUNT_NAME_REQUIRED');

  const bankName = String(input?.bankName || '').trim();
  const accountNumber = normalizedAccountNumber(input?.accountNumber);
  const accountHolder = String(input?.accountHolder || '').trim();
  if (type === 'BANK' && (!bankName || !accountNumber || !accountHolder)) {
    throw new Error('BANK_FIELDS_REQUIRED: Tài khoản ngân hàng cần tên ngân hàng, số tài khoản và chủ tài khoản.');
  }

  const openingBalance = Number(input?.openingBalance ?? input?.initialBalance ?? 0);
  if (!Number.isFinite(openingBalance) || openingBalance < 0) throw new Error('OPENING_BALANCE_INVALID');
  return {
    branchId,
    type,
    name,
    bankName: type === 'BANK' ? bankName : '',
    accountNumber: type === 'BANK' ? accountNumber : '',
    accountHolder: type === 'BANK' ? accountHolder : '',
    openingBalance,
    isDefault: input?.isDefault === true
  };
}

export function createFinanceRouter(db: Firestore | null): Router {
  const router = Router();

  // All finance endpoints require authentication
  router.use(authenticateFirebase);

  // Helper to format Vietnam date
  const getVietnamDateTime = () => {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date()).replace('T', ' ');
  };

  router.get('/accounts', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const requestedBranchId = String(req.query.branchId || '').trim();
      if (requestedBranchId && !canAccessBranch(req.user, requestedBranchId)) {
        return res.status(403).json({ success: false, error: 'BRANCH_FORBIDDEN' });
      }
      const snapshot = requestedBranchId
        ? await db.collection('funds').where('branchId', '==', requestedBranchId).get()
        : await db.collection('funds').get();
      const accounts = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item: any) => canAccessBranch(req.user, item.branchId));
      return res.json({ success: true, accounts });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'ACCOUNT_LIST_FAILED' });
    }
  });

  router.post('/accounts', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const draft = validateFinanceAccountDraft(req.body);
      const accountId = `FUND_${draft.branchId}_${draft.type}_${Date.now()}`;
      const now = getVietnamDateTime();
      let result: any;

      await db.runTransaction(async (transaction) => {
        const branchRef = db.collection('branches').doc(draft.branchId);
        const branchSnap = await transaction.get(branchRef);
        if (!branchSnap.exists || branchSnap.data()?.isActive === false) {
          throw new Error('BRANCH_NOT_ACTIVE: Chi nhánh không tồn tại hoặc đã ngừng hoạt động.');
        }

        const branchAccountsQuery = db.collection('funds').where('branchId', '==', draft.branchId);
        const branchAccounts = await transaction.get(branchAccountsQuery);
        if (draft.type === 'BANK' && branchAccounts.docs.some((item) => {
          const data = item.data();
          return data.type === 'BANK' && normalizedAccountNumber(data.accountNumber) === draft.accountNumber && data.isArchived !== true;
        })) {
          throw new Error('BANK_ACCOUNT_DUPLICATE: Số tài khoản đã được khai báo tại chi nhánh này.');
        }

        const sameTypeActive = branchAccounts.docs.filter((item) => {
          const data = item.data();
          return data.type === draft.type && data.isArchived !== true && data.isActive !== false;
        });
        const shouldBeDefault = draft.isDefault || sameTypeActive.length === 0;
        if (shouldBeDefault) {
          sameTypeActive.forEach((item) => transaction.update(item.ref, { isDefault: false, updatedAt: now }));
        }

        result = {
          id: accountId,
          branchId: draft.branchId,
          name: draft.name,
          type: draft.type,
          bankName: draft.bankName,
          accountNumber: draft.accountNumber,
          accountHolder: draft.accountHolder,
          openingBalance: draft.openingBalance,
          currentBalance: draft.openingBalance,
          totalIncome: draft.openingBalance,
          totalExpense: 0,
          isDefault: shouldBeDefault,
          isActive: true,
          active: true,
          isArchived: false,
          color: draft.type === 'CASH' ? 'orange' : 'blue',
          createdByUid: req.user?.uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: now
        };
        transaction.set(db.collection('funds').doc(accountId), result);

        if (draft.openingBalance > 0) {
          const txId = `OPENING_${accountId}`;
          transaction.set(db.collection('cashTransactions').doc(txId), {
            id: txId,
            code: `SDDK-${Date.now().toString().slice(-6)}`,
            type: 'RECEIPT',
            category: 'OPENING_BALANCE',
            categoryName: 'Số dư đầu kỳ',
            amount: draft.openingBalance,
            fundId: accountId,
            fundName: draft.name,
            fundType: draft.type,
            branchId: draft.branchId,
            date: now,
            creator: req.user?.name || req.user?.email || 'Quản trị viên',
            creatorUid: req.user?.uid,
            notes: 'Khởi tạo số dư tài khoản',
            isPLAccounted: false,
            status: 'COMPLETED',
            createdAt: FieldValue.serverTimestamp()
          });
        }
      });
      return res.status(201).json({ success: true, account: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'ACCOUNT_CREATE_FAILED' });
    }
  });

  router.patch('/accounts/:accountId', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const accountRef = db.collection('funds').doc(req.params.accountId);
      let updatedAccount: any;
      await db.runTransaction(async (transaction) => {
        const accountSnap = await transaction.get(accountRef);
        if (!accountSnap.exists) throw new Error('ACCOUNT_NOT_FOUND');
        const current = accountSnap.data()!;
        const draft = validateFinanceAccountDraft({ ...current, ...req.body, openingBalance: current.openingBalance || 0 });
        if (draft.branchId !== current.branchId) throw new Error('ACCOUNT_BRANCH_IMMUTABLE');
        if (draft.type !== current.type) throw new Error('ACCOUNT_TYPE_IMMUTABLE');
        if (req.body.isActive === false && Number(current.currentBalance || 0) !== 0) {
          throw new Error('ACCOUNT_BALANCE_MUST_BE_ZERO');
        }

        if (draft.isDefault) {
          const peers = await transaction.get(db.collection('funds').where('branchId', '==', current.branchId));
          peers.docs
            .filter((item) => item.id !== accountSnap.id && item.data().type === current.type && item.data().isDefault === true)
            .forEach((item) => transaction.update(item.ref, { isDefault: false }));
        }
        updatedAccount = {
          ...current,
          name: draft.name,
          bankName: draft.bankName,
          accountNumber: draft.accountNumber,
          accountHolder: draft.accountHolder,
          isDefault: draft.isDefault || current.isDefault === true,
          isActive: req.body.isActive !== false,
          active: req.body.isActive !== false,
          updatedAt: getVietnamDateTime()
        };
        transaction.set(accountRef, updatedAccount, { merge: true });
      });
      return res.json({ success: true, account: { id: req.params.accountId, ...updatedAccount } });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'ACCOUNT_UPDATE_FAILED' });
    }
  });

  router.post('/accounts/:accountId/archive', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const accountRef = db.collection('funds').doc(req.params.accountId);
      await db.runTransaction(async (transaction) => {
        const accountSnap = await transaction.get(accountRef);
        if (!accountSnap.exists) throw new Error('ACCOUNT_NOT_FOUND');
        const account = accountSnap.data()!;
        if (Number(account.currentBalance || 0) !== 0) throw new Error('ACCOUNT_BALANCE_MUST_BE_ZERO');
        const accountTransactions = await transaction.get(
          db.collection('cashTransactions').where('fundId', '==', req.params.accountId)
        );
        if (accountTransactions.docs.some((item) => item.data().status === 'PENDING')) {
          throw new Error('ACCOUNT_HAS_PENDING_TRANSACTIONS');
        }
        transaction.update(accountRef, {
          isArchived: true,
          isActive: false,
          active: false,
          isDefault: false,
          archivedAt: FieldValue.serverTimestamp(),
          archivedByUid: req.user?.uid
        });
      });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'ACCOUNT_ARCHIVE_FAILED' });
    }
  });

  /**
   * 1. POST /api/finance/receipt
   * Lập phiếu thu tiền (+), cộng số dư quỹ, ghi nhận cashTransactions atomically
   * Quyền: ADMIN, MANAGER, ACCOUNTANT
   */
  router.post('/receipt', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    if (!db) {
      return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE: Cơ sở dữ liệu chưa sẵn sàng.' });
    }

    try {
      const {
        fundId,
        amount,
        partnerId,
        partnerName,
        partnerType,
        category,
        categoryName,
        notes,
        isPLAccounted = true,
        idempotencyKey = req.headers['x-idempotency-key'] as string
      } = req.body;

      const numAmount = Number(amount);
      if (!fundId || isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ success: false, error: 'Thông tin quỹ hoặc số tiền thu không hợp lệ' });
      }

      const now = getVietnamDateTime();
      const code = `PT${Date.now().toString().slice(-6)}`;
      const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      let resultingTx: any = null;

      await db.runTransaction(async (transaction) => {
        // Idempotency Check
        if (idempotencyKey) {
          const idemRef = db.collection('financeRequests').doc(idempotencyKey);
          const idemSnap = await transaction.get(idemRef);
          if (idemSnap.exists && idemSnap.data()?.status === 'COMPLETED') {
            resultingTx = idemSnap.data()?.transaction;
            return;
          }
        }

        const fundRef = db.collection('funds').doc(fundId);
        const fundDoc = await transaction.get(fundRef);

        if (!fundDoc.exists) {
          throw new Error('NOT_FOUND: Tài khoản / Quỹ tiền không tồn tại.');
        }

        const fundData = fundDoc.data()!;
        if (fundData.isActive === false || fundData.active === false || fundData.isArchived) {
          throw new Error('FUND_INACTIVE: Quỹ tiền này đang bị khóa hoặc ngưng hoạt động.');
        }

        // Branch Isolation Check on Authoritative Fund Document
        const fundBranchId = requiredBranchId(fundData.branchId);
        if (!canAccessBranch(req.user, fundBranchId)) {
          throw new Error(`BRANCH_FORBIDDEN: Bạn không có quyền thao tác trên quỹ thuộc chi nhánh "${fundBranchId}".`);
        }

        const newBalance = (fundData.currentBalance || 0) + numAmount;
        const newTotalIncome = (fundData.totalIncome || 0) + numAmount;

        transaction.update(fundRef, {
          currentBalance: newBalance,
          totalIncome: newTotalIncome,
          updatedAt: now
        });

        resultingTx = {
          id: txId,
          code,
          type: 'RECEIPT',
          amount: numAmount,
          category: category || 'OTHER_INCOME',
          categoryName: categoryName || 'Thu tiền khác',
          fundId,
          fundName: fundData.name || 'Quỹ tiền mặt',
          fundType: fundData.type || 'CASH',
          partnerId: partnerId || '',
          partnerName: partnerName || 'Khách vãng lai / Đối tác',
          partnerType: partnerType || 'CUSTOMER',
          date: now,
          creator: req.user?.name || req.user?.email || 'Nhân viên thu ngân',
          creatorUid: req.user?.uid,
          branchId: fundBranchId,
          notes: notes || 'Thu tiền theo chứng từ',
          isPLAccounted: isPLAccounted !== false,
          status: 'COMPLETED'
        };

        const txRef = db.collection('cashTransactions').doc(txId);
        transaction.set(txRef, {
          ...resultingTx,
          createdAt: FieldValue.serverTimestamp()
        });

        if (idempotencyKey) {
          const idemRef = db.collection('financeRequests').doc(idempotencyKey);
          transaction.set(idemRef, {
            id: idempotencyKey,
            status: 'COMPLETED',
            type: 'RECEIPT',
            transaction: resultingTx,
            creatorUid: req.user?.uid,
            createdAt: FieldValue.serverTimestamp()
          });
        }
      });

      return res.json({
        success: true,
        message: 'Lập phiếu thu thành công',
        transaction: resultingTx
      });
    } catch (err: any) {
      console.error('[Finance Receipt Error]:', err);
      const isForbidden = err.message?.includes('BRANCH_FORBIDDEN') || err.message?.includes('PERMISSION');
      return res.status(isForbidden ? 403 : 400).json({ success: false, error: err.message || 'Lỗi xử lý phiếu thu' });
    }
  });

  /**
   * 2. POST /api/finance/payment
   * Lập phiếu chi tiền (-), trừ số dư quỹ, ghi nhận cashTransactions atomically
   * Quyền: ADMIN, MANAGER, ACCOUNTANT
   */
  router.post('/payment', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    if (!db) {
      return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE: Cơ sở dữ liệu chưa sẵn sàng.' });
    }

    try {
      const {
        fundId,
        amount,
        partnerId,
        partnerName,
        partnerType,
        category,
        categoryName,
        notes,
        isPLAccounted = true,
        idempotencyKey = req.headers['x-idempotency-key'] as string
      } = req.body;

      const numAmount = Number(amount);
      if (!fundId || isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ success: false, error: 'Thông tin quỹ hoặc số tiền chi không hợp lệ' });
      }

      const now = getVietnamDateTime();
      const code = `PC${Date.now().toString().slice(-6)}`;
      const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      let resultingTx: any = null;

      await db.runTransaction(async (transaction) => {
        // Idempotency Check
        if (idempotencyKey) {
          const idemRef = db.collection('financeRequests').doc(idempotencyKey);
          const idemSnap = await transaction.get(idemRef);
          if (idemSnap.exists && idemSnap.data()?.status === 'COMPLETED') {
            resultingTx = idemSnap.data()?.transaction;
            return;
          }
        }

        const fundRef = db.collection('funds').doc(fundId);
        const fundDoc = await transaction.get(fundRef);

        if (!fundDoc.exists) {
          throw new Error('NOT_FOUND: Tài khoản / Quỹ tiền không tồn tại.');
        }

        const fundData = fundDoc.data()!;
        if (fundData.isActive === false || fundData.active === false || fundData.isArchived) {
          throw new Error('FUND_INACTIVE: Quỹ tiền này đang bị khóa hoặc ngưng hoạt động.');
        }

        // Branch Isolation Check
        const fundBranchId = requiredBranchId(fundData.branchId);
        if (!canAccessBranch(req.user, fundBranchId)) {
          throw new Error(`BRANCH_FORBIDDEN: Bạn không có quyền thao tác trên quỹ thuộc chi nhánh "${fundBranchId}".`);
        }

        // Invariant: Non-Negative Fund Balance Protection
        const currentBalance = fundData.currentBalance || 0;
        if (currentBalance < numAmount) {
          throw new Error(`INSUFFICIENT_FUNDS: Số dư khả dụng trong quỹ "${fundData.name}" (${currentBalance.toLocaleString('vi-VN')} đ) không đủ để chi (${numAmount.toLocaleString('vi-VN')} đ).`);
        }

        const newBalance = currentBalance - numAmount;
        const newTotalExpense = (fundData.totalExpense || 0) + numAmount;

        transaction.update(fundRef, {
          currentBalance: newBalance,
          totalExpense: newTotalExpense,
          updatedAt: now
        });

        resultingTx = {
          id: txId,
          code,
          type: 'PAYMENT',
          amount: numAmount,
          category: category || 'OPERATING_EXPENSE',
          categoryName: categoryName || 'Chi phí hoạt động',
          fundId,
          fundName: fundData.name || 'Quỹ tiền mặt',
          fundType: fundData.type || 'CASH',
          partnerId: partnerId || '',
          partnerName: partnerName || 'Đối tác / Nhà cung cấp',
          partnerType: partnerType || 'SUPPLIER',
          date: now,
          creator: req.user?.name || req.user?.email || 'Nhân viên kế toán',
          creatorUid: req.user?.uid,
          branchId: fundBranchId,
          notes: notes || 'Chi tiền theo chứng từ',
          isPLAccounted: isPLAccounted !== false,
          status: 'COMPLETED'
        };

        const txRef = db.collection('cashTransactions').doc(txId);
        transaction.set(txRef, {
          ...resultingTx,
          createdAt: FieldValue.serverTimestamp()
        });

        if (idempotencyKey) {
          const idemRef = db.collection('financeRequests').doc(idempotencyKey);
          transaction.set(idemRef, {
            id: idempotencyKey,
            status: 'COMPLETED',
            type: 'PAYMENT',
            transaction: resultingTx,
            creatorUid: req.user?.uid,
            createdAt: FieldValue.serverTimestamp()
          });
        }
      });

      return res.json({
        success: true,
        message: 'Lập phiếu chi thành công',
        transaction: resultingTx
      });
    } catch (err: any) {
      console.error('[Finance Payment Error]:', err);
      const isForbidden = err.message?.includes('BRANCH_FORBIDDEN') || err.message?.includes('PERMISSION');
      return res.status(isForbidden ? 403 : 400).json({ success: false, error: err.message || 'Lỗi xử lý phiếu chi' });
    }
  });

  /**
   * 3. POST /api/finance/transfer
   * Chuyển quỹ nội bộ 2 chiều atomically
   * Quyền: ADMIN, MANAGER, ACCOUNTANT
   */
  router.post('/transfer', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    if (!db) {
      return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE: Cơ sở dữ liệu chưa sẵn sàng.' });
    }

    try {
      const {
        fromFundId,
        toFundId,
        amount,
        notes,
        idempotencyKey = req.headers['x-idempotency-key'] as string
      } = req.body;
      const numAmount = Number(amount);

      if (!fromFundId || !toFundId || fromFundId === toFundId || isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ success: false, error: 'Thông tin quỹ chuyển/nhận hoặc số tiền không hợp lệ' });
      }

      const now = getVietnamDateTime();
      const codeOut = `PC${Date.now().toString().slice(-6)}`;
      const codeIn = `PT${(Date.now() + 1).toString().slice(-6)}`;
      const txOutId = `tx_out_${Date.now()}`;
      const txInId = `tx_in_${Date.now() + 1}`;

      let txOut: any = null;
      let txIn: any = null;

      await db.runTransaction(async (transaction) => {
        // Idempotency Check
        if (idempotencyKey) {
          const idemRef = db.collection('financeRequests').doc(idempotencyKey);
          const idemSnap = await transaction.get(idemRef);
          if (idemSnap.exists && idemSnap.data()?.status === 'COMPLETED') {
            const data = idemSnap.data();
            txOut = data?.txOut;
            txIn = data?.txIn;
            return;
          }
        }

        const fromRef = db.collection('funds').doc(fromFundId);
        const toRef = db.collection('funds').doc(toFundId);

        const fromDoc = await transaction.get(fromRef);
        const toDoc = await transaction.get(toRef);

        if (!fromDoc.exists || !toDoc.exists) {
          throw new Error('NOT_FOUND: Một trong hai tài khoản quỹ không tồn tại.');
        }

        const fromData = fromDoc.data()!;
        const toData = toDoc.data()!;

        if (fromData.isActive === false || toData.isActive === false || fromData.active === false || toData.active === false || fromData.isArchived || toData.isArchived) {
          throw new Error('FUND_INACTIVE: Quỹ chuyển hoặc nhận đang bị khóa.');
        }

        // Branch Isolation Check on both funds
        const fromBranchId = requiredBranchId(fromData.branchId);
        const toBranchId = requiredBranchId(toData.branchId);
        if (!canAccessBranch(req.user, fromBranchId) || !canAccessBranch(req.user, toBranchId)) {
          throw new Error('BRANCH_FORBIDDEN: Bạn không có đủ thẩm quyền trên cả hai chi nhánh của quỹ chuyển và quỹ nhận.');
        }

        // Check sufficient balance
        const fromBalance = fromData.currentBalance || 0;
        if (fromBalance < numAmount) {
          throw new Error(`INSUFFICIENT_FUNDS: Quỹ nguồn "${fromData.name}" (${fromBalance.toLocaleString('vi-VN')} đ) không đủ số dư để chuyển ${numAmount.toLocaleString('vi-VN')} đ.`);
        }

        // Update fromFund
        transaction.update(fromRef, {
          currentBalance: fromBalance - numAmount,
          totalExpense: (fromData.totalExpense || 0) + numAmount,
          updatedAt: now
        });

        // Update toFund
        transaction.update(toRef, {
          currentBalance: (toData.currentBalance || 0) + numAmount,
          totalIncome: (toData.totalIncome || 0) + numAmount,
          updatedAt: now
        });

        txOut = {
          id: txOutId,
          code: codeOut,
          type: 'PAYMENT',
          category: 'INTERNAL_TRANSFER',
          categoryName: 'Chuyển quỹ nội bộ',
          amount: numAmount,
          fundId: fromFundId,
          fundName: fromData.name,
          fundType: fromData.type || 'CASH',
          partnerId: toFundId,
          partnerName: `Nạp vào: ${toData.name}`,
          partnerType: 'OTHER',
          date: now,
          creator: req.user?.name || req.user?.email || 'Quản trị viên',
          creatorUid: req.user?.uid,
          branchId: fromBranchId,
          transferGroupId: idempotencyKey || txOutId,
          counterpartyBranchId: toBranchId,
          notes: notes || `Chuyển quỹ sang ${toData.name}`,
          isPLAccounted: false,
          status: 'COMPLETED'
        };

        txIn = {
          id: txInId,
          code: codeIn,
          type: 'RECEIPT',
          category: 'INTERNAL_TRANSFER',
          categoryName: 'Chuyển quỹ nội bộ',
          amount: numAmount,
          fundId: toFundId,
          fundName: toData.name,
          fundType: toData.type || 'BANK',
          partnerId: fromFundId,
          partnerName: `Nhận từ: ${fromData.name}`,
          partnerType: 'OTHER',
          date: now,
          creator: req.user?.name || req.user?.email || 'Quản trị viên',
          creatorUid: req.user?.uid,
          branchId: toBranchId,
          transferGroupId: idempotencyKey || txOutId,
          counterpartyBranchId: fromBranchId,
          notes: notes || `Nhận chuyển quỹ từ ${fromData.name}`,
          isPLAccounted: false,
          status: 'COMPLETED'
        };

        transaction.set(db.collection('cashTransactions').doc(txOutId), {
          ...txOut,
          createdAt: FieldValue.serverTimestamp()
        });
        transaction.set(db.collection('cashTransactions').doc(txInId), {
          ...txIn,
          createdAt: FieldValue.serverTimestamp()
        });

        if (idempotencyKey) {
          const idemRef = db.collection('financeRequests').doc(idempotencyKey);
          transaction.set(idemRef, {
            id: idempotencyKey,
            status: 'COMPLETED',
            type: 'TRANSFER',
            txOut,
            txIn,
            creatorUid: req.user?.uid,
            createdAt: FieldValue.serverTimestamp()
          });
        }
      });

      return res.json({
        success: true,
        message: 'Chuyển quỹ nội bộ thành công',
        txOut,
        txIn
      });
    } catch (err: any) {
      console.error('[Finance Transfer Error]:', err);
      const isForbidden = err.message?.includes('BRANCH_FORBIDDEN') || err.message?.includes('PERMISSION');
      return res.status(isForbidden ? 403 : 400).json({ success: false, error: err.message || 'Lỗi chuyển quỹ' });
    }
  });

  /**
   * 4. POST /api/finance/reconcile
   * Đối soát số dư ca, cập nhật số dư thực tế và ghi nhận chênh lệch
   * Quyền: ADMIN, MANAGER
   */
  router.post('/reconcile', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
    if (!db) {
      return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE: Cơ sở dữ liệu chưa sẵn sàng.' });
    }

    try {
      const {
        fundId,
        actualBalance,
        notes,
        idempotencyKey = req.headers['x-idempotency-key'] as string
      } = req.body;
      const numActual = Number(actualBalance);

      if (!fundId || isNaN(numActual) || numActual < 0) {
        return res.status(400).json({ success: false, error: 'Thông tin quỹ hoặc số dư thực tế không hợp lệ' });
      }

      const now = getVietnamDateTime();
      let adjustmentTx: any = null;

      await db.runTransaction(async (transaction) => {
        // Idempotency Check
        if (idempotencyKey) {
          const idemRef = db.collection('financeRequests').doc(idempotencyKey);
          const idemSnap = await transaction.get(idemRef);
          if (idemSnap.exists && idemSnap.data()?.status === 'COMPLETED') {
            adjustmentTx = idemSnap.data()?.adjustmentTx;
            return;
          }
        }

        const fundRef = db.collection('funds').doc(fundId);
        const fundDoc = await transaction.get(fundRef);

        if (!fundDoc.exists) {
          throw new Error('NOT_FOUND: Tài khoản / Quỹ tiền không tồn tại.');
        }

        const fundData = fundDoc.data()!;
        if (fundData.isActive === false || fundData.active === false || fundData.isArchived) {
          throw new Error('FUND_INACTIVE');
        }
        const fundBranchId = requiredBranchId(fundData.branchId);
        if (!canAccessBranch(req.user, fundBranchId)) {
          throw new Error(`BRANCH_FORBIDDEN: Bạn không có quyền đối soát quỹ thuộc chi nhánh "${fundBranchId}".`);
        }

        const currentBalance = fundData.currentBalance || 0;
        const diff = numActual - currentBalance;

        transaction.update(fundRef, {
          currentBalance: numActual,
          lastReconciledAt: now,
          updatedAt: now
        });

        if (diff !== 0) {
          const isSurplus = diff > 0;
          const absDiff = Math.abs(diff);
          const code = isSurplus ? `PT${Date.now().toString().slice(-6)}` : `PC${Date.now().toString().slice(-6)}`;
          const txId = `tx_reconcile_${Date.now()}`;

          adjustmentTx = {
            id: txId,
            code,
            type: isSurplus ? 'RECEIPT' : 'PAYMENT',
            category: isSurplus ? 'INVENTORY_AUDIT_SURPLUS' : 'OPERATING_EXPENSE',
            categoryName: isSurplus ? 'Điều chỉnh kiểm kê (Thừa quỹ)' : 'Điều chỉnh kiểm kê (Thiếu quỹ)',
            amount: absDiff,
            fundId,
            fundName: fundData.name,
            fundType: fundData.type || 'CASH',
            partnerId: 'INTERNAL',
            partnerName: 'Đối soát ca PhoneHouse',
            partnerType: 'OTHER',
            date: now,
            creator: req.user?.name || req.user?.email || 'Kiểm soát viên',
            creatorUid: req.user?.uid,
            branchId: fundBranchId,
            notes: notes || `Điều chỉnh đối soát số dư ca: ${diff > 0 ? '+' : ''}${diff.toLocaleString('vi-VN')} đ`,
            isPLAccounted: true,
            status: 'COMPLETED'
          };

          transaction.set(db.collection('cashTransactions').doc(txId), {
            ...adjustmentTx,
            createdAt: FieldValue.serverTimestamp()
          });
        }

        if (idempotencyKey) {
          const idemRef = db.collection('financeRequests').doc(idempotencyKey);
          transaction.set(idemRef, {
            id: idempotencyKey,
            status: 'COMPLETED',
            type: 'RECONCILE',
            adjustmentTx,
            creatorUid: req.user?.uid,
            createdAt: FieldValue.serverTimestamp()
          });
        }
      });

      return res.json({
        success: true,
        message: 'Đối soát số dư thành công',
        adjustmentTx
      });
    } catch (err: any) {
      console.error('[Finance Reconcile Error]:', err);
      const isForbidden = err.message?.includes('BRANCH_FORBIDDEN') || err.message?.includes('PERMISSION');
      return res.status(isForbidden ? 403 : 400).json({ success: false, error: err.message || 'Lỗi đối soát số dư' });
    }
  });

  return router;
}
