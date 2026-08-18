import { Firestore, doc, runTransaction, increment } from 'firebase/firestore';
import { CheckoutPayload } from '../validation/checkoutSchema';

export interface CheckoutResult {
  success: boolean;
  invoiceId: string;
  alreadyProcessed?: boolean;
}

export async function executeAtomicCheckout(db: Firestore, payload: CheckoutPayload): Promise<CheckoutResult> {
  const {
    invoice,
    devicesToSell = [],
    accessoriesToSell = [],
    cashTx,
    tradeInDevice,
    customerPartner,
    financeCompanyPartner,
    fundToUpdate
  } = payload;

  return await runTransaction(db, async (transaction) => {
    // 1. Idempotency Check: Verify if invoice is already registered
    const invRef = doc(db, 'invoices', invoice.id);
    const existingInvSnap = await transaction.get(invRef);
    if (existingInvSnap.exists()) {
      return { success: true, invoiceId: invoice.id, alreadyProcessed: true };
    }

    // 2. Concurrency Check: Read each device and verify 'in_stock' status
    for (const dev of devicesToSell) {
      if (!dev.id) continue;
      const devRef = doc(db, 'devices', dev.id);
      const devSnap = await transaction.get(devRef);
      if (!devSnap.exists()) {
        throw new Error(`DEVICE_NOT_FOUND: Không tìm thấy máy ${dev.model} (IMEI: ${dev.imei || dev.id}) trong hệ thống.`);
      }
      const devData = devSnap.data();
      if (devData.status !== 'in_stock') {
        throw new Error(`DEVICE_ALREADY_SOLD: Cây máy ${dev.model} (IMEI: ${dev.imei}) đã được bán hoặc chuyển trạng thái (${devData.status}).`);
      }
    }

    // 3. Concurrency Check: Read each accessory and verify stock availability
    for (const acc of accessoriesToSell) {
      if (acc.product && acc.product.id) {
        const prodRef = doc(db, 'products', acc.product.id);
        const prodSnap = await transaction.get(prodRef);
        if (prodSnap.exists()) {
          const prodData = prodSnap.data();
          const currentStock = prodData.stockQuantity || 0;
          if (currentStock < (acc.quantity || 1)) {
            throw new Error(`INSUFFICIENT_STOCK: Phụ kiện "${acc.product.name}" chỉ còn tồn ${currentStock} cái (yêu cầu ${acc.quantity}).`);
          }
        }
      }
    }

    // 4. Mark Devices as Sold
    for (const dev of devicesToSell) {
      if (!dev.id) continue;
      const devRef = doc(db, 'devices', dev.id);
      transaction.update(devRef, {
        status: 'sold',
        soldDate: new Date().toISOString(),
        customerName: invoice.customerName || null,
        customerPhone: invoice.customerPhone || null,
        soldInvoiceId: invoice.id
      });
    }

    // 5. Deduct Accessory Stock
    for (const acc of accessoriesToSell) {
      if (acc.product && acc.product.id) {
        const prodRef = doc(db, 'products', acc.product.id);
        transaction.update(prodRef, {
          stockQuantity: increment(-(acc.quantity || 1))
        });
      }
    }

    // 6. Save Invoice Record
    transaction.set(invRef, invoice);

    // 7. Save Cash Transaction & Increment Fund Balance
    if (cashTx && cashTx.id) {
      const txRef = doc(db, 'cashTransactions', cashTx.id);
      transaction.set(txRef, cashTx);

      if (fundToUpdate && fundToUpdate.id && cashTx.amount > 0) {
        const fundRef = doc(db, 'funds', fundToUpdate.id);
        transaction.update(fundRef, {
          currentBalance: increment(cashTx.amount),
          totalIncome: increment(cashTx.amount)
        });
      }
    }

    // 8. Auto-ingest Trade-In Device (if any)
    if (tradeInDevice && tradeInDevice.id) {
      const trdRef = doc(db, 'devices', tradeInDevice.id);
      transaction.set(trdRef, tradeInDevice);
    }

    // 9. Partner Accounting: Installment Receivable vs Customer TotalSpent
    const debtIncrease = (invoice.installmentDisbursementStatus === 'PENDING' && invoice.installmentExpectedAmount)
      ? invoice.installmentExpectedAmount
      : 0;

    if (debtIncrease > 0 && financeCompanyPartner && financeCompanyPartner.id) {
      const fcRef = doc(db, 'partners', financeCompanyPartner.id);
      const newDebtTx = {
        id: `TX-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split('T')[0],
        type: 'DEBT_INCREASE',
        amount: debtIncrease,
        note: `Mua trả góp đơn ${invoice.invoiceCode || invoice.id} - ${invoice.customerName}`,
        referenceId: invoice.id
      };
      transaction.update(fcRef, {
        outstandingDebt: increment(debtIncrease)
      });
    }

    if (customerPartner && customerPartner.id) {
      const custRef = doc(db, 'partners', customerPartner.id);
      transaction.update(custRef, {
        type: customerPartner.type === 'SUPPLIER' ? 'BOTH' : customerPartner.type,
        totalSpent: increment(invoice.finalAmount || 0)
      });
    } else if (invoice.customerPhone) {
      const newPartnerId = `PARTNER-${Date.now()}`;
      const newCustRef = doc(db, 'partners', newPartnerId);
      transaction.set(newCustRef, {
        id: newPartnerId,
        type: 'CUSTOMER',
        name: invoice.customerName || 'Khách Hàng',
        phone: invoice.customerPhone,
        outstandingDebt: 0,
        totalSpent: invoice.finalAmount || 0,
        debtTransactions: [],
        branchId: invoice.branchId || '',
        createdAt: new Date().toISOString()
      });
    }

    return { success: true, invoiceId: invoice.id };
  });
}
