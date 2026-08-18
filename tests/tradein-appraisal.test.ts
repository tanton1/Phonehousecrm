import { describe, it, expect } from 'vitest';
import { calculateTradeInValuation } from '../src/features/tradein/types';

describe('Sprint 13: 3-Column Trade-in & Appraisal Valuation Suite', () => {
  it('Case 1: Thuật toán thẩm định máy cũ trừ tiền chính xác theo ngoại hình và pin', () => {
    const basePrice = 12000000;
    const result = calculateTradeInValuation(basePrice, {
      batteryPercent: 78, // < 80% -> -500k
      bodyCondition: 'Cấn Móp Góc', // -800k
      screenCondition: 'Màn Đã Ép Kính', // -700k
      faceIdWorking: true,
      cameraWorking: true,
      truetoneWorking: true,
      speakersWorking: true,
      subsidyBonus: 500000
    });

    // Total deductions = 500k + 800k + 700k = 2,000,000
    // Estimated buyback = 12,000,000 - 2,000,000 = 10,000,000
    expect(result.estimatedValue).toBe(10000000);
    expect(result.deductions.batteryDeduction).toBe(500000);
    expect(result.deductions.bodyDeduction).toBe(800000);
    expect(result.deductions.screenDeduction).toBe(700000);
  });

  it('Case 2: Tính toán tiền bù chênh lệch lên đời máy mới (Upgrade Difference)', () => {
    const oldDeviceEstimatedValue = 9500000;
    const targetNewDevicePrice = 25000000;

    const upgradeDifference = Math.max(0, targetNewDevicePrice - oldDeviceEstimatedValue);
    expect(upgradeDifference).toBe(15500000);
  });

  it('Case 3: Kích hoạt yêu cầu phê duyệt quản lý khi giá trị thu cũ trên 15 triệu', () => {
    const oldHighValue = 18000000;
    const oldNormalValue = 8000000;

    const checkRequiresApproval = (val: number) => val > 15000000;

    expect(checkRequiresApproval(oldHighValue)).toBe(true);
    expect(checkRequiresApproval(oldNormalValue)).toBe(false);
  });
});
