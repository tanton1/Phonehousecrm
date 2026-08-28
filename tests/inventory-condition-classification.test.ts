import { describe, expect, it } from 'vitest';
import { classifyInventoryCondition, inventoryConditionLabel } from '../src/utils/inventoryCondition';

describe('inventory condition classification', () => {
  it.each([
    ['New Seal', 'NEW_SEAL'],
    ['Máy mới seal 100%', 'NEW_SEAL'],
    ['Like New', 'LIKE_NEW'],
    ['Like New 99% Keng', 'LIKE_NEW'],
    ['99% Keng', 'GRADE_99'],
    ['98% Cấn Nhẹ', 'GRADE_98'],
    ['95% Trầy Xước', 'GRADE_95'],
    ['Hàng Cũ Trưng Bày', 'DISPLAY'],
    ['Ngoại hình tùy chỉnh', 'OTHER']
  ])('maps %s to %s', (condition, expected) => {
    expect(classifyInventoryCondition(condition)).toBe(expected);
  });

  it('returns the compact Vietnamese label used by the matrix', () => {
    expect(inventoryConditionLabel('Like New 99%')).toBe('Like New');
    expect(inventoryConditionLabel('99% keng')).toBe('99%');
    expect(inventoryConditionLabel('98% cấn nhẹ')).toBe('98%');
  });
});
