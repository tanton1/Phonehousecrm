import { describe, expect, it } from 'vitest';
import { validateChecklistInput } from '../server/routes/attendance';
import { validateFinanceCategoryDraft, validateRepairServiceDraft, validateSopTemplateDraft } from '../server/routes/configuration';
import { validateTradeInDraft } from '../server/routes/tradeIns';

describe('operational single-writer validation', () => {
  it('normalizes an appraisal but never accepts invalid money or conditions', () => {
    const draft = validateTradeInDraft({
      customerName: 'Nguyễn Văn A', phone: '0905000001', oldModel: 'iPhone 15 Pro', storage: '256GB', color: 'Titan',
      batteryPercent: 91, bodyCondition: 'Keng Không Vết Xước', screenCondition: 'Màn Zin Đẹp',
      faceIdWorking: true, cameraWorking: true, icloudUnlocked: true, truetoneWorking: true, speakersWorking: true,
      estimatedValue: 18_000_000, targetNewModel: 'iPhone 16 Pro', targetNewModelPrice: 25_000_000
    });
    expect(draft).toMatchObject({ phone: '0905000001', estimatedValue: 18_000_000, upgradeDiffPrice: 7_000_000 });
    expect(() => validateTradeInDraft({ ...draft, bodyCondition: 'Tự nhập tùy ý' })).toThrow('TRADE_IN_CONDITION_INVALID');
    expect(() => validateTradeInDraft({ ...draft, estimatedValue: -1 })).toThrow('TRADE_IN_ESTIMATED_VALUE_INVALID');
  });

  it('builds canonical SOP labels and rejects arbitrary role/category values', () => {
    const draft = validateSopTemplateDraft({
      code: 'sop-sales-open', title: 'Mở cửa đầu ca', targetRole: 'SALES', category: 'OPENING', priority: 'HIGH',
      description: 'Kiểm tra quầy', guidelines: ['Mở cửa', 'Kiểm tra két'], orderIndex: 1
    });
    expect(draft).toMatchObject({ code: 'SOP-SALES-OPEN', targetRoleName: 'Nhân viên bán hàng Showroom', categoryName: 'Đầu ca trực' });
    expect(() => validateSopTemplateDraft({ ...draft, targetRole: 'SUPER_USER' })).toThrow('SOP_CLASSIFICATION_INVALID');
  });

  it('requires a dated checklist with a supported workflow classification', () => {
    expect(validateChecklistInput({
      date: '2026-08-26', title: 'Đối soát quầy', category: 'CLOSING', priority: 'NORMAL', isCompleted: false
    })).toMatchObject({ categoryName: 'Cuối ca trực & Bàn giao', isCompleted: false });
    expect(() => validateChecklistInput({ date: '26/08/2026', title: 'Sai ngày', category: 'CLOSING' })).toThrow('CHECKLIST_REQUIRED_FIELDS');
  });

  it('rejects repair-service prices below their configured cost', () => {
    expect(validateRepairServiceDraft({
      category: 'THAY_PIN', categoryName: 'Thay pin', name: 'Thay pin iPhone', compatibleModels: 'iPhone',
      costPrice: 500_000, sellPrice: 750_000, techCommission: 80_000, warrantyPeriodMonths: 6, durationMinutes: 45
    })).toMatchObject({ category: 'THAY_PIN', sellPrice: 750_000 });
    expect(() => validateRepairServiceDraft({
      category: 'THAY_PIN', categoryName: 'Thay pin', name: 'Sai giá', costPrice: 900_000, sellPrice: 500_000
    })).toThrow('REPAIR_SERVICE_PRICE_BELOW_COST');
  });

  it('normalizes finance categories and rejects unknown transaction types', () => {
    expect(validateFinanceCategoryDraft({ type: 'receipt', name: '  Thu thanh lý   tài sản  ' }))
      .toEqual({ type: 'RECEIPT', name: 'Thu thanh lý tài sản' });
    expect(() => validateFinanceCategoryDraft({ type: 'TRANSFER', name: 'Điều chuyển' }))
      .toThrow('FINANCE_CATEGORY_TYPE_INVALID');
    expect(() => validateFinanceCategoryDraft({ type: 'PAYMENT', name: ' ' }))
      .toThrow('FINANCE_CATEGORY_NAME_REQUIRED');
  });
});
