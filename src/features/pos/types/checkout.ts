import { SalesInvoice, DeviceItem, ProductItem, CashTransaction, Partner, FundAccount } from '../../../types';

export type CheckoutState =
  | 'IDLE'
  | 'VALIDATING'
  | 'LOCKING_STOCK'
  | 'PROCESSING_PAYMENT'
  | 'COMMITTING'
  | 'SUCCESS'
  | 'FAILED';

export interface POSCheckoutPayload {
  invoice: SalesInvoice;
  devicesToSell: DeviceItem[];
  accessoriesToSell: { product: ProductItem; quantity: number }[];
  cashTx: CashTransaction | null;
  warehouseId: string;
  tradeInAppraisalId?: string;
  tradeInDevice: DeviceItem | null;
  customerPartner: Partner | null;
  financeCompanyPartner: Partner | null;
  fundToUpdate?: FundAccount | null;
  idempotencyKey?: string;
  commissionTagSelections?: Array<{
    itemType: 'DEVICE' | 'ACCESSORY';
    itemId: string;
    tagIds: string[];
  }>;
  priceAdjustments?: Array<{
    itemType: 'DEVICE' | 'ACCESSORY';
    itemId: string;
    unitPrice: number;
    reason?: string;
  }>;
}

export interface POSCheckoutStateInfo {
  state: CheckoutState;
  progressStep: number; // 0 to 4
  statusMessage: string;
  error?: string | null;
  createdInvoice?: SalesInvoice | null;
}
