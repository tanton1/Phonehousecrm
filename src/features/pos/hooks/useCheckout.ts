import { useState, useCallback } from 'react';
import { CheckoutState, POSCheckoutPayload, POSCheckoutStateInfo } from '../types/checkout';
import { processCheckoutTransaction } from '../../../services/firestoreService';

export function useCheckout() {
  const [checkoutInfo, setCheckoutInfo] = useState<POSCheckoutStateInfo>({
    state: 'IDLE',
    progressStep: 0,
    statusMessage: '',
    error: null,
    createdInvoice: null
  });

  const runCheckout = useCallback(async (payload: POSCheckoutPayload): Promise<POSCheckoutPayload['invoice'] | null> => {
    // Step 1: Validating
    setCheckoutInfo({
      state: 'VALIDATING',
      progressStep: 1,
      statusMessage: 'Đang kiểm tra thông tin khách hàng & bảng giá...',
      error: null,
      createdInvoice: null
    });

    if (!payload.invoice || !payload.invoice.id) {
      setCheckoutInfo(prev => ({ ...prev, state: 'FAILED', error: 'Thiếu thông tin hóa đơn bán lẻ.' }));
      return null;
    }

    try {
      // Step 2: Locking Stock & Checking Concurrency
      setCheckoutInfo(prev => ({
        ...prev,
        state: 'LOCKING_STOCK',
        progressStep: 2,
        statusMessage: `Đang khóa ${payload.devicesToSell.length} cây máy và kiểm tra tồn kho phụ kiện...`
      }));

      // Step 3: Committing Atomic Transaction
      setCheckoutInfo(prev => ({
        ...prev,
        state: 'COMMITTING',
        progressStep: 3,
        statusMessage: 'Đang ghi nhận phiếu thu & số dư Quỹ vào sổ cái...'
      }));

      const result = await processCheckoutTransaction({
        invoice: payload.invoice,
        devicesToSell: payload.devicesToSell,
        accessoriesToSell: payload.accessoriesToSell,
        cashTx: payload.cashTx,
        warehouseId: payload.warehouseId,
        tradeInAppraisalId: payload.tradeInAppraisalId,
        tradeInDevice: payload.tradeInDevice,
        customerPartner: payload.customerPartner,
        financeCompanyPartner: payload.financeCompanyPartner,
        fundToUpdate: payload.fundToUpdate,
        payments: payload.invoice?.splitPayments as any,
        idempotencyKey: payload.idempotencyKey,
        commissionTagSelections: payload.commissionTagSelections,
        priceAdjustments: payload.priceAdjustments
      });

      const canonicalInvoice = result?.invoice || payload.invoice;

      // Step 4: Success with Authoritative Server Invoice
      setCheckoutInfo({
        state: 'SUCCESS',
        progressStep: 4,
        statusMessage: `Xuất hóa đơn thành công! Mã đơn: ${canonicalInvoice.invoiceCode || canonicalInvoice.id}`,
        error: null,
        createdInvoice: canonicalInvoice
      });

      return canonicalInvoice;
    } catch (err: any) {
      console.error('POS Checkout Critical Error:', err);
      const errorMessage = err?.message || 'Giao dịch thanh toán thất bại. Vui lòng kiểm tra lại.';
      setCheckoutInfo({
        state: 'FAILED',
        progressStep: 0,
        statusMessage: 'Thanh toán thất bại',
        error: errorMessage,
        createdInvoice: null
      });
      return null;
    }
  }, []);

  const resetCheckout = useCallback(() => {
    setCheckoutInfo({
      state: 'IDLE',
      progressStep: 0,
      statusMessage: '',
      error: null,
      createdInvoice: null
    });
  }, []);

  return {
    checkoutInfo,
    runCheckout,
    resetCheckout,
    isProcessing: checkoutInfo.state !== 'IDLE' && checkoutInfo.state !== 'SUCCESS' && checkoutInfo.state !== 'FAILED'
  };
}
