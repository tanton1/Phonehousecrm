import { Router } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';

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
   */
  router.post('/receipt', async (req: any, res) => {
    if (!db) {
      return res.status(500).json({ success: false, message: 'Firestore Admin chưa khởi tạo' });
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
        branchId,
        isPLAccounted = true
      } = req.body;

      const numAmount = Number(amount);
      if (!fundId || isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Thông tin quỹ hoặc số tiền thu không hợp lệ' });
      }

      const effectiveBranchId = branchId || req.user.branchId || 'CN01';
      const now = getVietnamDateTime();
      const code = `PT${Date.now().toString().slice(-6)}`;
      const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      let resultingTx: any = null;

      await db.runTransaction(async (transaction) => {
        const fundRef = db.collection('funds').doc(fundId);
        const fundDoc = await transaction.get(fundRef);

        if (!fundDoc.exists) {
          throw new Error('Tài khoản / Quỹ tiền không tồn tại');
        }

        const fundData = fundDoc.data()!;
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
          creator: req.user.name || req.user.email || 'Nhân viên thu ngân',
          creatorUid: req.user.uid,
          branchId: effectiveBranchId,
          notes: notes || 'Thu tiền theo chứng từ',
          isPLAccounted: isPLAccounted !== false,
          status: 'COMPLETED'
        };

        const txRef = db.collection('cashTransactions').doc(txId);
        transaction.set(txRef, resultingTx);
      });

      return res.json({
        success: true,
        message: 'Lập phiếu thu thành công',
        transaction: resultingTx
      });
    } catch (err: any) {
      console.error('[Finance Receipt Error]:', err);
      return res.status(500).json({ success: false, message: err.message || 'Lỗi xử lý phiếu thu' });
    }
  });

  /**
   * 2. POST /api/finance/payment
   * Lập phiếu chi tiền (-), trừ số dư quỹ, ghi nhận cashTransactions atomically
   */
  router.post('/payment', async (req: any, res) => {
    if (!db) {
      return res.status(500).json({ success: false, message: 'Firestore Admin chưa khởi tạo' });
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
        branchId,
        isPLAccounted = true
      } = req.body;

      const numAmount = Number(amount);
      if (!fundId || isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Thông tin quỹ hoặc số tiền chi không hợp lệ' });
      }

      const effectiveBranchId = branchId || req.user.branchId || 'CN01';
      const now = getVietnamDateTime();
      const code = `PC${Date.now().toString().slice(-6)}`;
      const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      let resultingTx: any = null;

      await db.runTransaction(async (transaction) => {
        const fundRef = db.collection('funds').doc(fundId);
        const fundDoc = await transaction.get(fundRef);

        if (!fundDoc.exists) {
          throw new Error('Tài khoản / Quỹ tiền không tồn tại');
        }

        const fundData = fundDoc.data()!;
        const newBalance = (fundData.currentBalance || 0) - numAmount;
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
          creator: req.user.name || req.user.email || 'Nhân viên kế toán',
          creatorUid: req.user.uid,
          branchId: effectiveBranchId,
          notes: notes || 'Chi tiền theo chứng từ',
          isPLAccounted: isPLAccounted !== false,
          status: 'COMPLETED'
        };

        const txRef = db.collection('cashTransactions').doc(txId);
        transaction.set(txRef, resultingTx);
      });

      return res.json({
        success: true,
        message: 'Lập phiếu chi thành công',
        transaction: resultingTx
      });
    } catch (err: any) {
      console.error('[Finance Payment Error]:', err);
      return res.status(500).json({ success: false, message: err.message || 'Lỗi xử lý phiếu chi' });
    }
  });

  /**
   * 3. POST /api/finance/transfer
   * Chuyển quỹ nội bộ 2 chiều atomically
   */
  router.post('/transfer', async (req: any, res) => {
    if (!db) {
      return res.status(500).json({ success: false, message: 'Firestore Admin chưa khởi tạo' });
    }

    try {
      const { fromFundId, toFundId, amount, notes, branchId } = req.body;
      const numAmount = Number(amount);

      if (!fromFundId || !toFundId || fromFundId === toFundId || isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Thông tin quỹ chuyển/nhận hoặc số tiền không hợp lệ' });
      }

      const effectiveBranchId = branchId || req.user.branchId || 'CN01';
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
          throw new Error('Một trong hai tài khoản quỹ không tồn tại');
        }

        const fromData = fromDoc.data()!;
        const toData = toDoc.data()!;

        // Update fromFund
        transaction.update(fromRef, {
          currentBalance: (fromData.currentBalance || 0) - numAmount,
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
          creator: req.user.name || req.user.email || 'Quản trị viên',
          creatorUid: req.user.uid,
          branchId: effectiveBranchId,
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
          creator: req.user.name || req.user.email || 'Quản trị viên',
          creatorUid: req.user.uid,
          branchId: effectiveBranchId,
          notes: notes || `Nhận chuyển quỹ từ ${fromData.name}`,
          isPLAccounted: false,
          status: 'COMPLETED'
        };

        transaction.set(db.collection('cashTransactions').doc(txOutId), txOut);
        transaction.set(db.collection('cashTransactions').doc(txInId), txIn);
      });

      return res.json({
        success: true,
        message: 'Chuyển quỹ nội bộ thành công',
        txOut,
        txIn
      });
    } catch (err: any) {
      console.error('[Finance Transfer Error]:', err);
      return res.status(500).json({ success: false, message: err.message || 'Lỗi chuyển quỹ' });
    }
  });

  /**
   * 4. POST /api/finance/reconcile
   * Đối soát số dư ca, cập nhật số dư thực tế và ghi nhận chênh lệch
   */
  router.post('/reconcile', async (req: any, res) => {
    if (!db) {
      return res.status(500).json({ success: false, message: 'Firestore Admin chưa khởi tạo' });
    }

    try {
      const { fundId, actualBalance, notes, branchId } = req.body;
      const numActual = Number(actualBalance);

      if (!fundId || isNaN(numActual) || numActual < 0) {
        return res.status(400).json({ success: false, message: 'Thông tin quỹ hoặc số dư thực tế không hợp lệ' });
      }

      const effectiveBranchId = branchId || req.user.branchId || 'CN01';
      const now = getVietnamDateTime();
      let adjustmentTx: any = null;

      await db.runTransaction(async (transaction) => {
        const fundRef = db.collection('funds').doc(fundId);
        const fundDoc = await transaction.get(fundRef);

        if (!fundDoc.exists) {
          throw new Error('Tài khoản / Quỹ tiền không tồn tại');
        }

        const fundData = fundDoc.data()!;
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
            creator: req.user.name || req.user.email || 'Kiểm soát viên',
            creatorUid: req.user.uid,
            branchId: effectiveBranchId,
            notes: notes || `Điều chỉnh đối soát số dư ca: ${diff > 0 ? '+' : ''}${diff.toLocaleString('vi-VN')} đ`,
            isPLAccounted: true,
            status: 'COMPLETED'
          };

          transaction.set(db.collection('cashTransactions').doc(txId), adjustmentTx);
        }
      });

      return res.json({
        success: true,
        message: 'Đối soát số dư thành công',
        adjustmentTx
      });
    } catch (err: any) {
      console.error('[Finance Reconcile Error]:', err);
      return res.status(500).json({ success: false, message: err.message || 'Lỗi đối soát số dư' });
    }
  });

  return router;
}
