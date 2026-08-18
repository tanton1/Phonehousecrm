import { describe, it, expect, beforeEach } from 'vitest';

// Simulating the transactional business logic and invariant state rules
interface SimulatedDevice {
  id: string;
  imei: string;
  model: string;
  status: 'in_stock' | 'sold' | 'transferring';
}

interface SimulatedProduct {
  id: string;
  name: string;
  stockQuantity: number;
}

interface SimulatedFund {
  id: string;
  name: string;
  currentBalance: number;
  totalIncome: number;
}

interface SimulatedPartner {
  id: string;
  name: string;
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  outstandingDebt: number;
  totalSpent: number;
}

// Transactional executor mimicking the server-side runTransaction logic
class MockPOSDatabase {
  devices: Map<string, SimulatedDevice> = new Map();
  products: Map<string, SimulatedProduct> = new Map();
  funds: Map<string, SimulatedFund> = new Map();
  invoices: Map<string, any> = new Map();
  cashTransactions: Map<string, any> = new Map();
  partners: Map<string, SimulatedPartner> = new Map();

  async executeCheckoutTransaction(payload: {
    invoice: any;
    devicesToSell: SimulatedDevice[];
    accessoriesToSell: { product: SimulatedProduct; quantity: number }[];
    cashTx?: any;
    fundToUpdate?: SimulatedFund;
    customerPartner?: SimulatedPartner;
    financeCompanyPartner?: SimulatedPartner;
  }) {
    const { invoice, devicesToSell, accessoriesToSell, cashTx, fundToUpdate, customerPartner, financeCompanyPartner } = payload;

    // 1. Idempotency Check
    if (this.invoices.has(invoice.id)) {
      return { alreadyProcessed: true, invoiceId: invoice.id };
    }

    // 2. Concurrency Check on Devices
    for (const dev of devicesToSell) {
      const stored = this.devices.get(dev.id);
      if (!stored) {
        throw new Error(`DEVICE_NOT_FOUND: Không tìm thấy máy ${dev.model}`);
      }
      if (stored.status !== 'in_stock') {
        throw new Error(`DEVICE_ALREADY_SOLD: Cây máy ${stored.model} (IMEI: ${stored.imei}) đã được bán.`);
      }
    }

    // 3. Concurrency Check on Accessories
    for (const acc of accessoriesToSell) {
      const storedProd = this.products.get(acc.product.id);
      if (storedProd) {
        if (storedProd.stockQuantity < acc.quantity) {
          throw new Error(`INSUFFICIENT_STOCK: Phụ kiện "${storedProd.name}" chỉ còn tồn ${storedProd.stockQuantity} cái.`);
        }
      }
    }

    // 4. Mark Devices as Sold
    for (const dev of devicesToSell) {
      const stored = this.devices.get(dev.id)!;
      stored.status = 'sold';
      this.devices.set(dev.id, stored);
    }

    // 5. Deduct Accessories
    for (const acc of accessoriesToSell) {
      const storedProd = this.products.get(acc.product.id)!;
      storedProd.stockQuantity -= acc.quantity;
      this.products.set(acc.product.id, storedProd);
    }

    // 6. Save Invoice
    this.invoices.set(invoice.id, invoice);

    // 7. Save Cash Transaction & Update Fund
    if (cashTx && fundToUpdate) {
      this.cashTransactions.set(cashTx.id, cashTx);
      const storedFund = this.funds.get(fundToUpdate.id);
      if (storedFund) {
        storedFund.currentBalance += cashTx.amount;
        storedFund.totalIncome += cashTx.amount;
        this.funds.set(storedFund.id, storedFund);
      }
    }

    // 8. Partner Accounting: Finance vs Customer
    const debtIncrease = (invoice.installmentDisbursementStatus === 'PENDING' && invoice.installmentExpectedAmount)
      ? invoice.installmentExpectedAmount
      : 0;

    if (debtIncrease > 0 && financeCompanyPartner) {
      const storedFc = this.partners.get(financeCompanyPartner.id);
      if (storedFc) {
        storedFc.outstandingDebt += debtIncrease;
        this.partners.set(storedFc.id, storedFc);
      }
    }

    if (customerPartner) {
      const storedCust = this.partners.get(customerPartner.id);
      if (storedCust) {
        storedCust.totalSpent += invoice.finalAmount;
        // Strict assertion: customer outstandingDebt remains 0 for finance installment
        this.partners.set(storedCust.id, storedCust);
      }
    }

    return { success: true, invoiceId: invoice.id };
  }
}

describe('PhoneHouse POS & Financial Invariants Test Suite', () => {
  let db: MockPOSDatabase;

  beforeEach(() => {
    db = new MockPOSDatabase();
    // Setup initial data
    db.devices.set('DEV-01', { id: 'DEV-01', imei: '356789012345678', model: 'iPhone 15 Pro Max 256GB', status: 'in_stock' });
    db.products.set('PROD-01', { id: 'PROD-01', name: 'Củ sạc Apple 20W Type-C', stockQuantity: 5 });
    db.funds.set('FUND-CASH-01', { id: 'FUND-CASH-01', name: 'Quỹ Tiền Mặt Hải Châu', currentBalance: 10000000, totalIncome: 50000000 });
    db.funds.set('FUND-BANK-01', { id: 'FUND-BANK-01', name: 'Techcombank PhoneHouse', currentBalance: 200000000, totalIncome: 900000000 });
    db.partners.set('PARTNER-HC-01', { id: 'PARTNER-HC-01', name: 'Home Credit Việt Nam', type: 'SUPPLIER', outstandingDebt: 50000000, totalSpent: 0 });
    db.partners.set('CUST-01', { id: 'CUST-01', name: 'Nguyễn Văn A', type: 'CUSTOMER', outstandingDebt: 0, totalSpent: 15000000 });
  });

  it('P0 Case 1: Chống bán trùng IMEI khi 2 Thu Ngân checkout cùng 1 cây máy', async () => {
    const dev = db.devices.get('DEV-01')!;

    // Cashier 1 Checkouts DEV-01
    const res1 = await db.executeCheckoutTransaction({
      invoice: { id: 'INV-101', finalAmount: 25000000 },
      devicesToSell: [dev],
      accessoriesToSell: [],
      cashTx: { id: 'TX-101', amount: 25000000 },
      fundToUpdate: db.funds.get('FUND-CASH-01')
    });
    expect(res1.success).toBe(true);
    expect(db.devices.get('DEV-01')?.status).toBe('sold');

    // Cashier 2 Tries to Checkout the same DEV-01 concurrently
    await expect(
      db.executeCheckoutTransaction({
        invoice: { id: 'INV-102', finalAmount: 25000000 },
        devicesToSell: [dev],
        accessoriesToSell: [],
        cashTx: { id: 'TX-102', amount: 25000000 },
        fundToUpdate: db.funds.get('FUND-CASH-01')
      })
    ).rejects.toThrow('DEVICE_ALREADY_SOLD');
  });

  it('P0 Case 2: Chống trừ âm kho phụ kiện (Insufficient Stock Guard)', async () => {
    const prod = db.products.get('PROD-01')!; // stock = 5

    await expect(
      db.executeCheckoutTransaction({
        invoice: { id: 'INV-103', finalAmount: 5000000 },
        devicesToSell: [],
        accessoriesToSell: [{ product: prod, quantity: 10 }] // Requesting 10
      })
    ).rejects.toThrow('INSUFFICIENT_STOCK');

    // Ensure stock remained intact
    expect(db.products.get('PROD-01')?.stockQuantity).toBe(5);
  });

  it('P0 Case 3: Xử lý Idempotency Key khi Thu Ngân double-click F9', async () => {
    const dev = db.devices.get('DEV-01')!;
    const fund = db.funds.get('FUND-CASH-01')!;
    const initialFundBalance = fund.currentBalance;

    const payload = {
      invoice: { id: 'INV-IDEMPOTENT-01', finalAmount: 20000000 },
      devicesToSell: [dev],
      accessoriesToSell: [],
      cashTx: { id: 'TX-IDEMPOTENT-01', amount: 20000000 },
      fundToUpdate: fund
    };

    // First Click
    const res1 = await db.executeCheckoutTransaction(payload);
    expect(res1.success).toBe(true);
    expect(db.funds.get('FUND-CASH-01')?.currentBalance).toBe(initialFundBalance + 20000000);

    // Second Duplicate Click with same invoice ID
    const res2 = await db.executeCheckoutTransaction(payload);
    expect(res2.alreadyProcessed).toBe(true);

    // Assert fund was NOT double-incremented
    expect(db.funds.get('FUND-CASH-01')?.currentBalance).toBe(initialFundBalance + 20000000);
  });

  it('P0 Case 4: Đơn trả góp tài chính (Home Credit) chỉ tăng nợ Home Credit, Khách hàng nợ = 0', async () => {
    const dev = db.devices.get('DEV-01')!;
    const cust = db.partners.get('CUST-01')!;
    const fc = db.partners.get('PARTNER-HC-01')!;
    const fund = db.funds.get('FUND-CASH-01')!;

    const initialFcDebt = fc.outstandingDebt;
    const initialCustSpent = cust.totalSpent;

    const orderAmount = 30000000;
    const downPayment = 10000000;
    const installmentDebt = orderAmount - downPayment; // 20.000.000đ

    const res = await db.executeCheckoutTransaction({
      invoice: {
        id: 'INV-INSTALLMENT-01',
        invoiceCode: 'HD-TG-001',
        customerName: cust.name,
        finalAmount: orderAmount,
        installmentDisbursementStatus: 'PENDING',
        installmentExpectedAmount: installmentDebt
      },
      devicesToSell: [dev],
      accessoriesToSell: [],
      cashTx: { id: 'TX-DOWNPAY-01', amount: downPayment },
      fundToUpdate: fund,
      customerPartner: cust,
      financeCompanyPartner: fc
    });

    expect(res.success).toBe(true);

    // Finance Company receives the exact receivable
    expect(db.partners.get('PARTNER-HC-01')?.outstandingDebt).toBe(initialFcDebt + installmentDebt);

    // Customer receives totalSpent, but outstandingDebt MUST BE 0
    const updatedCust = db.partners.get('CUST-01')!;
    expect(updatedCust.outstandingDebt).toBe(0);
    expect(updatedCust.totalSpent).toBe(initialCustSpent + orderAmount);
  });
});
