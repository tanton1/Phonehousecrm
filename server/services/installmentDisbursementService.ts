import crypto from 'node:crypto';
import { Firestore } from 'firebase-admin/firestore';

export interface InstallmentDisbursementActor {
  uid: string;
  role: string;
  branchId?: string;
  assignedBranchIds?: string[];
  name?: string;
}

export interface InstallmentDisbursementInput {
  invoiceId: string;
  fundId: string;
  receivedAmount: number;
  feeAmount: number;
  note?: string;
  idempotencyKey: string;
}

function canAccessBranch(actor: InstallmentDisbursementActor, branchId: string): boolean {
  if (!branchId || branchId === 'ALL') return false;
  if (String(actor.role || '').toUpperCase() === 'ADMIN') return true;
  return actor.branchId === branchId || (actor.assignedBranchIds || []).includes(branchId);
}

function wholeVnd(value: unknown, code: string, allowZero = false): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || (!allowZero && amount === 0)) throw new Error(code);
  return amount;
}

export async function processInstallmentDisbursement(
  db: Firestore,
  raw: Partial<InstallmentDisbursementInput>,
  actor: InstallmentDisbursementActor
): Promise<any> {
  const input: InstallmentDisbursementInput = {
    invoiceId: String(raw.invoiceId || '').trim(),
    fundId: String(raw.fundId || '').trim(),
    receivedAmount: wholeVnd(raw.receivedAmount, 'INSTALLMENT_RECEIVED_AMOUNT_INVALID'),
    feeAmount: wholeVnd(raw.feeAmount ?? 0, 'INSTALLMENT_FEE_AMOUNT_INVALID', true),
    note: String(raw.note || '').trim().slice(0, 500),
    idempotencyKey: String(raw.idempotencyKey || '').trim()
  };
  if (!input.invoiceId) throw new Error('INSTALLMENT_INVOICE_REQUIRED');
  if (!input.fundId) throw new Error('INSTALLMENT_FUND_REQUIRED');
  if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 160) throw new Error('INSTALLMENT_IDEMPOTENCY_REQUIRED');

  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const requestId = crypto.createHash('sha256').update(`INSTALLMENT:${input.invoiceId}:${input.idempotencyKey}`).digest('hex');
  const disbursementId = `IDB_${requestId.slice(0, 24).toUpperCase()}`;
  const idemRef = db.collection('installmentDisbursementRequests').doc(requestId);
  const invoiceRef = db.collection('invoices').doc(input.invoiceId);
  const fundRef = db.collection('funds').doc(input.fundId);

  return db.runTransaction(async transaction => {
    const [idemSnap, invoiceSnap, fundSnap] = await Promise.all([
      transaction.get(idemRef), transaction.get(invoiceRef), transaction.get(fundRef)
    ]);
    if (!invoiceSnap.exists) throw new Error('INSTALLMENT_INVOICE_NOT_FOUND');
    if (!fundSnap.exists) throw new Error('INSTALLMENT_FUND_NOT_FOUND');
    if (idemSnap.exists) {
      const idem = idemSnap.data()!;
      if (idem.payloadHash !== payloadHash) throw new Error('INSTALLMENT_IDEMPOTENCY_CONFLICT');
      return { ...idem.result, idempotentReplay: true };
    }

    const invoice = invoiceSnap.data()!;
    const fund = fundSnap.data()!;
    const branchId = String(invoice.branchId || '').trim();
    if (!canAccessBranch(actor, branchId)) throw new Error('INSTALLMENT_BRANCH_FORBIDDEN');
    if (String(fund.branchId || '') !== branchId) throw new Error('INSTALLMENT_FUND_BRANCH_MISMATCH');
    if (fund.isActive === false || fund.active === false || fund.isArchived === true) throw new Error('INSTALLMENT_FUND_INACTIVE');
    if (String(fund.type || '').toUpperCase() !== 'BANK') throw new Error('INSTALLMENT_BANK_FUND_REQUIRED');
    if (invoice.installmentDisbursementStatus === 'DISBURSED') throw new Error('INSTALLMENT_ALREADY_DISBURSED');
    if (invoice.installmentDisbursementStatus !== 'PENDING') throw new Error('INSTALLMENT_NOT_PENDING');

    const expectedAmount = wholeVnd(
      invoice.installmentExpectedAmount ?? invoice.installmentFinanceAmount ?? invoice.financeAmount,
      'INSTALLMENT_EXPECTED_AMOUNT_INVALID'
    );
    if (input.receivedAmount + input.feeAmount !== expectedAmount) throw new Error('INSTALLMENT_RECONCILIATION_MISMATCH');
    const financePartnerId = String(invoice.installmentFinancePartnerId || '').trim();
    if (!financePartnerId) throw new Error('INSTALLMENT_FINANCE_PARTNER_REQUIRED');
    const partnerRef = db.collection('partners').doc(financePartnerId);
    const partnerSnap = await transaction.get(partnerRef);
    if (!partnerSnap.exists) throw new Error('INSTALLMENT_FINANCE_PARTNER_NOT_FOUND');
    const partner = partnerSnap.data()!;
    if (String(partner.branchId || '') !== branchId) throw new Error('INSTALLMENT_PARTNER_BRANCH_MISMATCH');
    const partnerDebt = Number(partner.outstandingDebt || 0);
    if (!Number.isSafeInteger(partnerDebt) || partnerDebt < expectedAmount) throw new Error('INSTALLMENT_PARTNER_DEBT_MISMATCH');
    const fundBalance = Number(fund.currentBalance || 0);
    if (!Number.isSafeInteger(fundBalance) || fundBalance < 0) throw new Error('INSTALLMENT_FUND_BALANCE_INVALID');

    const now = new Date().toISOString();
    const receiptId = `TX_${disbursementId}_IN`;
    const feeId = input.feeAmount > 0 ? `TX_${disbursementId}_FEE` : '';
    const receiptTransaction = {
      id: receiptId,
      code: `PT-TG-${requestId.slice(0, 8).toUpperCase()}`,
      type: 'RECEIPT',
      category: 'SALES_REVENUE',
      categoryName: 'Thu giải ngân trả góp',
      amount: expectedAmount,
      fundId: input.fundId,
      fundName: fund.name || '',
      fundType: fund.type,
      branchId,
      date: now,
      partnerId: financePartnerId,
      partnerName: partner.name || '',
      partnerType: partner.type || 'SUPPLIER',
      invoiceId: input.invoiceId,
      installmentDisbursementId: disbursementId,
      referenceCode: invoice.invoiceCode || input.invoiceId,
      creator: actor.name || actor.uid,
      creatorUid: actor.uid,
      notes: input.note || `Giải ngân hóa đơn ${invoice.invoiceCode || input.invoiceId}`,
      isPLAccounted: false,
      status: 'COMPLETED',
      createdAt: now
    };
    const feeTransaction = input.feeAmount > 0 ? {
      id: feeId,
      code: `PC-TG-${requestId.slice(0, 8).toUpperCase()}`,
      type: 'PAYMENT',
      category: 'OTHER_EXPENSE',
      categoryName: 'Phí dịch vụ trả góp',
      amount: input.feeAmount,
      fundId: input.fundId,
      fundName: fund.name || '',
      fundType: fund.type,
      branchId,
      date: now,
      partnerId: financePartnerId,
      partnerName: partner.name || '',
      partnerType: partner.type || 'SUPPLIER',
      invoiceId: input.invoiceId,
      installmentDisbursementId: disbursementId,
      referenceCode: invoice.invoiceCode || input.invoiceId,
      creator: actor.name || actor.uid,
      creatorUid: actor.uid,
      notes: `Phí giải ngân hóa đơn ${invoice.invoiceCode || input.invoiceId}`,
      isPLAccounted: true,
      status: 'COMPLETED',
      createdAt: now
    } : null;
    const debtTransaction = {
      id: `FINANCE_PAY_${disbursementId}`,
      date: now.slice(0, 10),
      type: 'PAYMENT',
      amount: expectedAmount,
      note: input.note || `Đã giải ngân hóa đơn ${invoice.invoiceCode || input.invoiceId}`,
      referenceId: input.invoiceId,
      referenceCode: invoice.invoiceCode || input.invoiceId,
      referenceType: 'INVOICE',
      cashTransactionId: receiptId
    };
    const nextInvoice = {
      ...invoice,
      id: invoiceSnap.id,
      installmentDisbursementStatus: 'DISBURSED',
      installmentReceivedAmount: input.receivedAmount,
      installmentFeeAmount: input.feeAmount,
      installmentDisbursementId: disbursementId,
      installmentDisbursedAt: now,
      installmentDisbursedByUid: actor.uid,
      paidAmount: Number(invoice.paidAmount || 0) + expectedAmount,
      paymentStatus: 'PAID',
      updatedAt: now
    };
    const nextFund = {
      ...fund,
      id: fundSnap.id,
      currentBalance: fundBalance + input.receivedAmount,
      totalIncome: Number(fund.totalIncome || 0) + expectedAmount,
      totalExpense: Number(fund.totalExpense || 0) + input.feeAmount,
      updatedAt: now
    };
    const nextPartner = {
      ...partner,
      id: partnerSnap.id,
      outstandingDebt: partnerDebt - expectedAmount,
      debtTransactions: [debtTransaction, ...(Array.isArray(partner.debtTransactions) ? partner.debtTransactions : [])].slice(0, 200),
      lastInteraction: now.slice(0, 10),
      updatedAt: now
    };

    transaction.update(invoiceRef, {
      installmentDisbursementStatus: nextInvoice.installmentDisbursementStatus,
      installmentReceivedAmount: nextInvoice.installmentReceivedAmount,
      installmentFeeAmount: nextInvoice.installmentFeeAmount,
      installmentDisbursementId: nextInvoice.installmentDisbursementId,
      installmentDisbursedAt: nextInvoice.installmentDisbursedAt,
      installmentDisbursedByUid: nextInvoice.installmentDisbursedByUid,
      paidAmount: nextInvoice.paidAmount,
      paymentStatus: nextInvoice.paymentStatus,
      updatedAt: now
    });
    transaction.update(fundRef, {
      currentBalance: nextFund.currentBalance,
      totalIncome: nextFund.totalIncome,
      totalExpense: nextFund.totalExpense,
      updatedAt: now
    });
    transaction.update(partnerRef, {
      outstandingDebt: nextPartner.outstandingDebt,
      debtTransactions: nextPartner.debtTransactions,
      lastInteraction: nextPartner.lastInteraction,
      updatedAt: now
    });
    transaction.set(db.collection('cashTransactions').doc(receiptId), receiptTransaction);
    if (feeTransaction) transaction.set(db.collection('cashTransactions').doc(feeId), feeTransaction);
    transaction.set(db.collection('installmentDisbursements').doc(disbursementId), {
      id: disbursementId,
      invoiceId: input.invoiceId,
      invoiceCode: invoice.invoiceCode || input.invoiceId,
      financePartnerId,
      branchId,
      fundId: input.fundId,
      expectedAmount,
      receivedAmount: input.receivedAmount,
      feeAmount: input.feeAmount,
      receiptTransactionId: receiptId,
      feeTransactionId: feeId || null,
      status: 'COMPLETED',
      actorUid: actor.uid,
      createdAt: now
    });
    const result = {
      disbursementId,
      invoice: nextInvoice,
      fund: nextFund,
      financePartner: nextPartner,
      cashTransactions: [receiptTransaction, ...(feeTransaction ? [feeTransaction] : [])]
    };
    transaction.set(idemRef, { id: requestId, payloadHash, result, createdAt: now, actorUid: actor.uid });
    return result;
  });
}
