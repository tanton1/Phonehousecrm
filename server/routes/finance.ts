import { Router, Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';

function canAccessBranch(user: any, targetBranchId?: string): boolean {
  if (!targetBranchId) return true;
  if (user?.role === 'ADMIN') return true;
  const userBranchId = user?.branchId;
  const assigned = user?.assignedBranchIds || [];
  return userBranchId === targetBranchId || assigned.includes(targetBranchId);
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
        isPLAccounted = true
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
        const fundRef = db.collection('funds').doc(fundId);
        const fundDoc = await transaction.get(fundRef);

        if (!fundDoc.exists) {
          throw new Error('NOT_FOUND: Tài khoản / Quỹ tiền không tồn tại.');
        }

        const fundData = fundDoc.data()!;
        if (fundData.active === false || fundData.isArchived) {
          throw new Error('FUND_INACTIVE: Quỹ tiền này đang bị khóa hoặc ngưng hoạt động.');
        }

        // Branch Isolation Check on Authoritative Fund Document
        const fundBranchId = fundData.branchId || req.user?.branchId;
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
        isPLAccounted = true
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
        const fundRef = db.collection('funds').doc(fundId);
        const fundDoc = await transaction.get(fundRef);

        if (!fundDoc.exists) {
          throw new Error('NOT_FOUND: Tài khoản / Quỹ tiền không tồn tại.');
        }

        const fundData = fundDoc.data()!;
        if (fundData.active === false || fundData.isArchived) {
          throw new Error('FUND_INACTIVE: Quỹ tiền này đang bị khóa hoặc ngưng hoạt động.');
        }

        // Branch Isolation Check
        const fundBranchId = fundData.branchId || req.user?.branchId;
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
      const { fromFundId, toFundId, amount, notes } = req.body;
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
        const fromRef = db.collection('funds').doc(fromFundId);
        const toRef = db.collection('funds').doc(toFundId);

        const fromDoc = await transaction.get(fromRef);
        const toDoc = await transaction.get(toRef);

        if (!fromDoc.exists || !toDoc.exists) {
          throw new Error('NOT_FOUND: Một trong hai tài khoản quỹ không tồn tại.');
        }

        const fromData = fromDoc.data()!;
        const toData = toDoc.data()!;

        if (fromData.active === false || toData.active === false) {
          throw new Error('FUND_INACTIVE: Quỹ chuyển hoặc nhận đang bị khóa.');
        }

        // Branch Isolation Check on both funds
        if (!canAccessBranch(req.user, fromData.branchId) || !canAccessBranch(req.user, toData.branchId)) {
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
          branchId: fromData.branchId || req.user?.branchId,
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
          branchId: toData.branchId || req.user?.branchId,
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
      const { fundId, actualBalance, notes } = req.body;
      const numActual = Number(actualBalance);

      if (!fundId || isNaN(numActual) || numActual < 0) {
        return res.status(400).json({ success: false, error: 'Thông tin quỹ hoặc số dư thực tế không hợp lệ' });
      }

      const now = getVietnamDateTime();
      let adjustmentTx: any = null;

      await db.runTransaction(async (transaction) => {
        const fundRef = db.collection('funds').doc(fundId);
        const fundDoc = await transaction.get(fundRef);

        if (!fundDoc.exists) {
          throw new Error('NOT_FOUND: Tài khoản / Quỹ tiền không tồn tại.');
        }

        const fundData = fundDoc.data()!;
        if (!canAccessBranch(req.user, fundData.branchId)) {
          throw new Error(`BRANCH_FORBIDDEN: Bạn không có quyền đối soát quỹ thuộc chi nhánh "${fundData.branchId}".`);
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
            branchId: fundData.branchId || req.user?.branchId,
            notes: notes || `Điều chỉnh đối soát số dư ca: ${diff > 0 ? '+' : ''}${diff.toLocaleString('vi-VN')} đ`,
            isPLAccounted: true,
            status: 'COMPLETED'
          };

          transaction.set(db.collection('cashTransactions').doc(txId), {
            ...adjustmentTx,
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
