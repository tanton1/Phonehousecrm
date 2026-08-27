import { Router, Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import { requirePermission } from '../middleware/requirePermission';
import { processPartnerDebtSettlement } from '../services/partnerDebtService';
import { processInstallmentDisbursement } from '../services/installmentDisbursementService';
import {
  assertFinanceIdempotencyRecord,
  financePayloadHash,
  parseVnd,
  requireFinanceIdempotencyKey
} from '../utils/financeIntegrity';

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

  const openingBalance = parseVnd(input?.openingBalance ?? input?.initialBalance ?? 0, { allowZero: true, field: 'OPENING_BALANCE' });
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

export function financeAccountIdFromDraft(branchId: string, type: string, requestId: unknown, now = Date.now()): string {
  const safeBranch = branchId.replace(/[^A-Z0-9_-]/gi, '_').slice(0, 60);
  const safeType = type.replace(/[^A-Z0-9_-]/gi, '_').slice(0, 30);
  const normalizedRequestId = String(requestId || '').trim();
  if (/^FUND-DRAFT-[A-Z0-9-]{8,100}$/i.test(normalizedRequestId)) {
    return `FUND_${safeBranch}_${safeType}_${normalizedRequestId.slice('FUND-DRAFT-'.length)}`;
  }
  return `FUND_${safeBranch}_${safeType}_${now}`;
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

  router.get('/accounts', requirePermission('FINANCE_VIEW'), async (req: Request, res: Response) => {
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

  // POS users only receive routing metadata. Balances and finance totals stay
  // behind FINANCE_VIEW and are never exposed by this endpoint.
  router.get('/payment-accounts', requirePermission('POS_CHECKOUT'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const branchId = requiredBranchId(req.query.branchId);
      if (!canAccessBranch(req.user, branchId)) {
        return res.status(403).json({ success: false, error: 'BRANCH_FORBIDDEN' });
      }
      const snapshot = await db.collection('funds').where('branchId', '==', branchId).get();
      const accounts = snapshot.docs
        .map(item => ({ id: item.id, ...item.data() } as any))
        .filter(item => item.isArchived !== true && item.isActive !== false && item.active !== false)
        .map(item => ({
          id: item.id,
          branchId,
          name: String(item.name || 'Tài khoản nhận tiền'),
          type: String(item.type || 'CASH'),
          bankName: String(item.bankName || ''),
          accountNumber: String(item.accountNumber || ''),
          accountHolder: String(item.accountHolder || ''),
          isDefault: item.isDefault === true,
          isActive: true,
          active: true,
          isArchived: false,
          balanceHidden: true
        }));
      return res.json({ success: true, accounts });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'PAYMENT_ACCOUNT_LIST_FAILED' });
    }
  });

  router.post('/accounts', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const draft = validateFinanceAccountDraft(req.body);
      const accountId = financeAccountIdFromDraft(draft.branchId, draft.type, req.body?.id);
      const now = getVietnamDateTime();
      let result: any;

      await db.runTransaction(async (transaction) => {
        const accountRef = db.collection('funds').doc(accountId);
        const existingAccount = await transaction.get(accountRef);
        if (existingAccount.exists) {
          const existing = existingAccount.data()!;
          if (existing.branchId !== draft.branchId || existing.type !== draft.type) throw new Error('ACCOUNT_CREATE_ID_CONFLICT');
          result = { id: existingAccount.id, ...existing };
          return;
        }
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
        transaction.set(accountRef, result);

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
        const peerAccounts = await transaction.get(db.collection('funds').where('branchId', '==', account.branchId));
        if (!accountTransactions.empty) throw new Error('ACCOUNT_HAS_TRANSACTIONS');
        if (account.isDefault === true) {
          const replacement = peerAccounts.docs.find(item => item.id !== accountSnap.id && item.data().type === account.type && item.data().isActive !== false && item.data().isArchived !== true);
          if (replacement) transaction.update(replacement.ref, { isDefault: true, updatedAt: getVietnamDateTime() });
        }
        transaction.delete(accountRef);
      });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'ACCOUNT_DELETE_FAILED' });
    }
  });

  router.post('/partner-debts/settle', requirePermission('FINANCE_POST'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processPartnerDebtSettlement(db, {
        ...req.body,
        idempotencyKey: req.body?.idempotencyKey || req.headers['x-idempotency-key']
      }, {
        uid: req.user!.uid,
        role: req.user!.role,
        branchId: req.user!.branchId,
        assignedBranchIds: req.user!.assignedBranchIds,
        name: req.user!.name || req.user!.email
      });
      return res.json({ success: true, ...result });
    } catch (error: any) {
      const message = error?.message || 'PARTNER_DEBT_SETTLEMENT_FAILED';
      const forbidden = message.includes('FORBIDDEN') || message.includes('BRANCH_MISMATCH');
      return res.status(forbidden ? 403 : 400).json({ success: false, error: message });
    }
  });

  router.post('/installments/disburse', requirePermission('FINANCE_POST'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processInstallmentDisbursement(db, {
        ...req.body,
        idempotencyKey: req.body?.idempotencyKey || req.headers['x-idempotency-key']
      }, {
        uid: req.user!.uid,
        role: req.user!.role,
        branchId: req.user!.branchId,
        assignedBranchIds: req.user!.assignedBranchIds,
        name: req.user!.name || req.user!.email
      });
      return res.json({ success: true, ...result });
    } catch (error: any) {
      const message = error?.message || 'INSTALLMENT_DISBURSEMENT_FAILED';
      return res.status(message.includes('FORBIDDEN') || message.includes('BRANCH_MISMATCH') ? 403 : 400).json({ success: false, error: message });
    }
  });

  /**
   * 1. POST /api/finance/receipt
   * Lập phiếu thu tiền (+), cộng số dư quỹ, ghi nhận cashTransactions atomically
   * Quyền: ADMIN, MANAGER, ACCOUNTANT
   */
  router.post('/receipt', requirePermission('FINANCE_POST'), async (req: Request, res: Response) => {
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
        isPLAccounted = true
      } = req.body;

      if (!fundId) return res.status(400).json({ success: false, error: 'FUND_REQUIRED' });
      const numAmount = parseVnd(amount);
      const idempotencyKey = requireFinanceIdempotencyKey(req.body?.idempotencyKey, req.headers['x-idempotency-key']);
      const payloadHash = financePayloadHash('RECEIPT', {
        fundId, amount: numAmount, partnerId: partnerId || '', partnerName: partnerName || '',
        partnerType: partnerType || 'CUSTOMER', category: category || 'OTHER_INCOME',
        categoryName: categoryName || 'Thu tiền khác', notes: notes || '', isPLAccounted: isPLAccounted !== false
      });
      if (category === 'CUSTOMER_DEBT_COLLECT') {
        return res.status(400).json({ success: false, error: 'USE_PARTNER_DEBT_SETTLEMENT: Thu nợ phải thực hiện từ Sổ nợ đối tác để cập nhật đồng thời công nợ và chứng từ gốc.' });
      }

      const now = getVietnamDateTime();
      const code = `PT${Date.now().toString().slice(-6)}`;
      const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      let resultingTx: any = null;

      await db.runTransaction(async (transaction) => {
        // Idempotency Check
        const idemRef = db.collection('financeRequests').doc(idempotencyKey);
        const idemSnap = await transaction.get(idemRef);
        if (idemSnap.exists) {
          const existing = idemSnap.data()!;
          assertFinanceIdempotencyRecord(existing, { operationType: 'RECEIPT', payloadHash, actorUid: req.user!.uid });
          if (existing.status !== 'COMPLETED') throw new Error('IDEMPOTENCY_REQUEST_IN_PROGRESS');
          resultingTx = existing.transaction;
          return;
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

        const currentBalance = parseVnd(fundData.currentBalance ?? 0, { allowZero: true, field: 'FUND_BALANCE' });
        const totalIncome = parseVnd(fundData.totalIncome ?? 0, { allowZero: true, field: 'FUND_TOTAL_INCOME' });
        const newBalance = currentBalance + numAmount;
        const newTotalIncome = totalIncome + numAmount;
        parseVnd(newBalance, { field: 'FUND_BALANCE' });
        parseVnd(newTotalIncome, { field: 'FUND_TOTAL_INCOME' });

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

        transaction.set(idemRef, {
          id: idempotencyKey,
          status: 'COMPLETED',
          type: 'RECEIPT',
          payloadHash,
          transaction: resultingTx,
          creatorUid: req.user?.uid,
          branchId: fundBranchId,
          createdAt: FieldValue.serverTimestamp()
        });
      });

      return res.json({
        success: true,
        message: 'Lập phiếu thu thành công',
        transaction: resultingTx
      });
    } catch (err: any) {
      console.error('[Finance Receipt Error]:', err);
      const isForbidden = err.message?.includes('BRANCH_FORBIDDEN') || err.message?.includes('PERMISSION');
      const isConflict = err.message?.includes('IDEMPOTENCY_KEY_CONFLICT');
      return res.status(isConflict ? 409 : isForbidden ? 403 : 400).json({ success: false, error: err.message || 'Lỗi xử lý phiếu thu' });
    }
  });

  /**
   * 2. POST /api/finance/payment
   * Lập phiếu chi tiền (-), trừ số dư quỹ, ghi nhận cashTransactions atomically
   * Quyền: ADMIN, MANAGER, ACCOUNTANT
   */
  router.post('/payment', requirePermission('FINANCE_POST'), async (req: Request, res: Response) => {
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
        isPLAccounted = true
      } = req.body;

      if (!fundId) return res.status(400).json({ success: false, error: 'FUND_REQUIRED' });
      const numAmount = parseVnd(amount);
      const idempotencyKey = requireFinanceIdempotencyKey(req.body?.idempotencyKey, req.headers['x-idempotency-key']);
      const payloadHash = financePayloadHash('PAYMENT', {
        fundId, amount: numAmount, partnerId: partnerId || '', partnerName: partnerName || '',
        partnerType: partnerType || 'SUPPLIER', category: category || 'OPERATING_EXPENSE',
        categoryName: categoryName || 'Chi phí hoạt động', notes: notes || '', isPLAccounted: isPLAccounted !== false
      });
      if (category === 'SUPPLIER_DEBT_PAY') {
        return res.status(400).json({ success: false, error: 'USE_PARTNER_DEBT_SETTLEMENT: Trả nợ NCC phải thực hiện từ Sổ nợ đối tác để cập nhật đồng thời công nợ và phiếu nhập.' });
      }

      const now = getVietnamDateTime();
      const code = `PC${Date.now().toString().slice(-6)}`;
      const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      let resultingTx: any = null;

      await db.runTransaction(async (transaction) => {
        // Idempotency Check
        const idemRef = db.collection('financeRequests').doc(idempotencyKey);
        const idemSnap = await transaction.get(idemRef);
        if (idemSnap.exists) {
          const existing = idemSnap.data()!;
          assertFinanceIdempotencyRecord(existing, { operationType: 'PAYMENT', payloadHash, actorUid: req.user!.uid });
          if (existing.status !== 'COMPLETED') throw new Error('IDEMPOTENCY_REQUEST_IN_PROGRESS');
          resultingTx = existing.transaction;
          return;
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
        const currentBalance = parseVnd(fundData.currentBalance ?? 0, { allowZero: true, field: 'FUND_BALANCE' });
        if (currentBalance < numAmount) {
          throw new Error(`INSUFFICIENT_FUNDS: Số dư khả dụng trong quỹ "${fundData.name}" (${currentBalance.toLocaleString('vi-VN')} đ) không đủ để chi (${numAmount.toLocaleString('vi-VN')} đ).`);
        }

        const newBalance = currentBalance - numAmount;
        const totalExpense = parseVnd(fundData.totalExpense ?? 0, { allowZero: true, field: 'FUND_TOTAL_EXPENSE' });
        const newTotalExpense = totalExpense + numAmount;
        parseVnd(newTotalExpense, { field: 'FUND_TOTAL_EXPENSE' });

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

        transaction.set(idemRef, {
          id: idempotencyKey,
          status: 'COMPLETED',
          type: 'PAYMENT',
          payloadHash,
          transaction: resultingTx,
          creatorUid: req.user?.uid,
          branchId: fundBranchId,
          createdAt: FieldValue.serverTimestamp()
        });
      });

      return res.json({
        success: true,
        message: 'Lập phiếu chi thành công',
        transaction: resultingTx
      });
    } catch (err: any) {
      console.error('[Finance Payment Error]:', err);
      const isForbidden = err.message?.includes('BRANCH_FORBIDDEN') || err.message?.includes('PERMISSION');
      const isConflict = err.message?.includes('IDEMPOTENCY_KEY_CONFLICT');
      return res.status(isConflict ? 409 : isForbidden ? 403 : 400).json({ success: false, error: err.message || 'Lỗi xử lý phiếu chi' });
    }
  });

  /**
   * 3. POST /api/finance/transfer
   * Chuyển quỹ nội bộ 2 chiều atomically
   * Quyền: ADMIN, MANAGER, ACCOUNTANT
   */
  router.post('/transfer', requirePermission('FINANCE_POST'), async (req: Request, res: Response) => {
    if (!db) {
      return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE: Cơ sở dữ liệu chưa sẵn sàng.' });
    }

    try {
      const {
        fromFundId,
        toFundId,
        amount,
        notes
      } = req.body;

      if (!fromFundId || !toFundId || fromFundId === toFundId) {
        return res.status(400).json({ success: false, error: 'Thông tin quỹ chuyển/nhận hoặc số tiền không hợp lệ' });
      }
      const numAmount = parseVnd(amount);
      const idempotencyKey = requireFinanceIdempotencyKey(req.body?.idempotencyKey, req.headers['x-idempotency-key']);
      const payloadHash = financePayloadHash('TRANSFER', { fromFundId, toFundId, amount: numAmount, notes: notes || '' });

      const now = getVietnamDateTime();
      const codeOut = `PC${Date.now().toString().slice(-6)}`;
      const codeIn = `PT${(Date.now() + 1).toString().slice(-6)}`;
      const txOutId = `tx_out_${Date.now()}`;
      const txInId = `tx_in_${Date.now() + 1}`;

      let txOut: any = null;
      let txIn: any = null;

      await db.runTransaction(async (transaction) => {
        // Idempotency Check
        const idemRef = db.collection('financeRequests').doc(idempotencyKey);
        const idemSnap = await transaction.get(idemRef);
        if (idemSnap.exists) {
          const existing = idemSnap.data()!;
          assertFinanceIdempotencyRecord(existing, { operationType: 'TRANSFER', payloadHash, actorUid: req.user!.uid });
          if (existing.status !== 'COMPLETED') throw new Error('IDEMPOTENCY_REQUEST_IN_PROGRESS');
          txOut = existing.txOut;
          txIn = existing.txIn;
          return;
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
        if (fromBranchId !== toBranchId) {
          throw new Error('INTER_BRANCH_TRANSFER_REQUIRES_SETTLEMENT: Chuyển tiền khác chi nhánh phải qua quy trình đối soát liên chi nhánh.');
        }

        // Check sufficient balance
        const fromBalance = parseVnd(fromData.currentBalance ?? 0, { allowZero: true, field: 'SOURCE_FUND_BALANCE' });
        const toBalance = parseVnd(toData.currentBalance ?? 0, { allowZero: true, field: 'DESTINATION_FUND_BALANCE' });
        const fromTotalExpense = parseVnd(fromData.totalExpense ?? 0, { allowZero: true, field: 'SOURCE_FUND_TOTAL_EXPENSE' });
        const toTotalIncome = parseVnd(toData.totalIncome ?? 0, { allowZero: true, field: 'DESTINATION_FUND_TOTAL_INCOME' });
        if (fromBalance < numAmount) {
          throw new Error(`INSUFFICIENT_FUNDS: Quỹ nguồn "${fromData.name}" (${fromBalance.toLocaleString('vi-VN')} đ) không đủ số dư để chuyển ${numAmount.toLocaleString('vi-VN')} đ.`);
        }
        parseVnd(fromTotalExpense + numAmount, { field: 'SOURCE_FUND_TOTAL_EXPENSE' });
        parseVnd(toBalance + numAmount, { field: 'DESTINATION_FUND_BALANCE' });
        parseVnd(toTotalIncome + numAmount, { field: 'DESTINATION_FUND_TOTAL_INCOME' });

        // Update fromFund
        transaction.update(fromRef, {
          currentBalance: fromBalance - numAmount,
          totalExpense: fromTotalExpense + numAmount,
          updatedAt: now
        });

        // Update toFund
        transaction.update(toRef, {
          currentBalance: toBalance + numAmount,
          totalIncome: toTotalIncome + numAmount,
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

        transaction.set(idemRef, {
          id: idempotencyKey,
          status: 'COMPLETED',
          type: 'TRANSFER',
          payloadHash,
          txOut,
          txIn,
          creatorUid: req.user?.uid,
          branchId: fromBranchId,
          createdAt: FieldValue.serverTimestamp()
        });
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
      const isConflict = err.message?.includes('IDEMPOTENCY_KEY_CONFLICT');
      return res.status(isConflict ? 409 : isForbidden ? 403 : 400).json({ success: false, error: err.message || 'Lỗi chuyển quỹ' });
    }
  });

  /**
   * 4. POST /api/finance/reconcile
   * Đối soát số dư ca, cập nhật số dư thực tế và ghi nhận chênh lệch
   * Quyền: ADMIN, MANAGER
   */
  router.post('/reconcile', requirePermission('FINANCE_POST'), requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
    if (!db) {
      return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE: Cơ sở dữ liệu chưa sẵn sàng.' });
    }

    try {
      const {
        fundId,
        actualBalance,
        notes
      } = req.body;

      if (!fundId) return res.status(400).json({ success: false, error: 'FUND_REQUIRED' });
      const numActual = parseVnd(actualBalance, { allowZero: true, field: 'ACTUAL_BALANCE' });
      const idempotencyKey = requireFinanceIdempotencyKey(req.body?.idempotencyKey, req.headers['x-idempotency-key']);
      const payloadHash = financePayloadHash('RECONCILE', { fundId, actualBalance: numActual, notes: notes || '' });

      const now = getVietnamDateTime();
      let adjustmentTx: any = null;

      await db.runTransaction(async (transaction) => {
        // Idempotency Check
        const idemRef = db.collection('financeRequests').doc(idempotencyKey);
        const idemSnap = await transaction.get(idemRef);
        if (idemSnap.exists) {
          const existing = idemSnap.data()!;
          assertFinanceIdempotencyRecord(existing, { operationType: 'RECONCILE', payloadHash, actorUid: req.user!.uid });
          if (existing.status !== 'COMPLETED') throw new Error('IDEMPOTENCY_REQUEST_IN_PROGRESS');
          adjustmentTx = existing.adjustmentTx;
          return;
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

        const currentBalance = parseVnd(fundData.currentBalance ?? 0, { allowZero: true, field: 'FUND_BALANCE' });
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

        transaction.set(idemRef, {
          id: idempotencyKey,
          status: 'COMPLETED',
          type: 'RECONCILE',
          payloadHash,
          adjustmentTx,
          creatorUid: req.user?.uid,
          branchId: fundBranchId,
          createdAt: FieldValue.serverTimestamp()
        });
      });

      return res.json({
        success: true,
        message: 'Đối soát số dư thành công',
        adjustmentTx
      });
    } catch (err: any) {
      console.error('[Finance Reconcile Error]:', err);
      const isForbidden = err.message?.includes('BRANCH_FORBIDDEN') || err.message?.includes('PERMISSION');
      const isConflict = err.message?.includes('IDEMPOTENCY_KEY_CONFLICT');
      return res.status(isConflict ? 409 : isForbidden ? 403 : 400).json({ success: false, error: err.message || 'Lỗi đối soát số dư' });
    }
  });

  return router;
}
