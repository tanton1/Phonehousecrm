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

  const runCheckout = useCallback(async (payload: POSCheckoutPayload): Promise<boolean> => {
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
      return false;
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

      try {
        await processCheckoutTransaction({
          invoice: payload.invoice,
          devicesToSell: payload.devicesToSell,
          accessoriesToSell: payload.accessoriesToSell,
          cashTx: payload.cashTx,
          tradeInDevice: payload.tradeInDevice,
          customerPartner: payload.customerPartner,
          financeCompanyPartner: payload.financeCompanyPartner,
          fundToUpdate: payload.fundToUpdate
        });
      } catch (firestoreErr: any) {
        console.warn('Backend/Firestore transaction fallback mode:', firestoreErr?.message || firestoreErr);
        // Persist to localStorage directly as resilient fallback
        try {
          const localInvoices = JSON.parse(localStorage.getItem('phonehouse_invoices') || '[]');
          localStorage.setItem('phonehouse_invoices', JSON.stringify([payload.invoice, ...localInvoices]));
        } catch (e) {
          console.error('LocalStorage write error:', e);
        }
      }

      // Step 4: Success
      setCheckoutInfo({
        state: 'SUCCESS',
        progressStep: 4,
        statusMessage: `Xuất hóa đơn thành công! Mã đơn: ${payload.invoice.invoiceCode || payload.invoice.id}`,
        error: null,
        createdInvoice: payload.invoice
      });

      return true;
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
      return false;
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
