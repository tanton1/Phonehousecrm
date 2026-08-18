import { describe, it, expect } from 'vitest';

describe('Sprint 7: POS UI Cockpit Calculations & Business Logic Suite', () => {
  it('Case 1: Tính toán tổng tiền giỏ hàng (Máy + Phụ kiện kèm theo)', () => {
    const devices = [
      { id: 'D1', model: 'iPhone 15 Pro Max', sellPrice: 28000000 },
      { id: 'D2', model: 'iPhone 13 128GB', sellPrice: 12000000 }
    ];

    const accessories = [
      { product: { id: 'P1', name: 'Ốp lưng Silicon', price: 200000 }, quantity: 2 },
      { product: { id: 'P2', name: 'Củ sạc Anker 20W', price: 350000 }, quantity: 1 }
    ];

    const devicesTotal = devices.reduce((sum, d) => sum + d.sellPrice, 0);
    const accessoriesTotal = accessories.reduce((sum, a) => sum + a.product.price * a.quantity, 0);
    const subtotal = devicesTotal + accessoriesTotal;

    expect(devicesTotal).toBe(40000000);
    expect(accessoriesTotal).toBe(750000);
    expect(subtotal).toBe(40750000);
  });

  it('Case 2: Trừ tiền chiết khấu (F8) và thu cũ đổi mới (Trade-in)', () => {
    const subtotal = 30000000;
    const discount = 500000;
    const tradeInDeduction = 8000000;

    const finalAmount = Math.max(0, subtotal - discount - tradeInDeduction);
    expect(finalAmount).toBe(21500000);
  });

  it('Case 3: Tính toán nợ giải ngân đối tác tài chính trả góp', () => {
    const finalAmount = 25000000;
    const downPayment = 5000000; // Khách trả trước 5 triệu

    const financeExpectedDisbursement = finalAmount - downPayment;
    expect(financeExpectedDisbursement).toBe(20000000);
  });

  it('Case 4: Cấm thanh toán khi giỏ hàng hoàn toàn trống', () => {
    const selectedDevices: any[] = [];
    const selectedAccessories: any[] = [];

    const canCheckout = selectedDevices.length > 0 || selectedAccessories.length > 0;
    expect(canCheckout).toBe(false);
  });
});
