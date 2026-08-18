import { TradeInAppraisal } from '../../types';

export interface TradeInGradingFactors {
  basePrice: number;
  batteryDeduction: number;
  bodyDeduction: number;
  screenDeduction: number;
  functionalDeduction: number; // Face ID, Camera, Truetone, Speakers
  subsidyBonus: number; // Trợ giá thu cũ đổi mới từ cửa hàng (e.g. 500k - 1tr)
}

export function calculateTradeInValuation(
  basePrice: number,
  factors: {
    batteryPercent: number;
    bodyCondition: 'Keng Không Vết Xước' | 'Trầy Nhẹ Lông Mèo' | 'Cấn Móp Góc' | 'Cong Vỏ';
    screenCondition: 'Màn Zin Đẹp' | 'Màn Trầy Xước' | 'Màn Đã Ép Kính' | 'Màn Lô / Mực / Sọc';
    faceIdWorking: boolean;
    cameraWorking: boolean;
    truetoneWorking: boolean;
    speakersWorking: boolean;
    subsidyBonus?: number;
  }
): { estimatedValue: number; deductions: TradeInGradingFactors } {
  let batteryDeduction = 0;
  if (factors.batteryPercent < 80) batteryDeduction = 500_000;
  else if (factors.batteryPercent < 85) batteryDeduction = 250_000;

  let bodyDeduction = 0;
  if (factors.bodyCondition === 'Trầy Nhẹ Lông Mèo') bodyDeduction = 300_000;
  else if (factors.bodyCondition === 'Cấn Móp Góc') bodyDeduction = 800_000;
  else if (factors.bodyCondition === 'Cong Vỏ') bodyDeduction = 1_500_000;

  let screenDeduction = 0;
  if (factors.screenCondition === 'Màn Trầy Xước') screenDeduction = 400_000;
  else if (factors.screenCondition === 'Màn Đã Ép Kính') screenDeduction = 700_000;
  else if (factors.screenCondition === 'Màn Lô / Mực / Sọc') screenDeduction = 2_000_000;

  let functionalDeduction = 0;
  if (!factors.faceIdWorking) functionalDeduction += 1_000_000;
  if (!factors.cameraWorking) functionalDeduction += 800_000;
  if (!factors.truetoneWorking) functionalDeduction += 200_000;
  if (!factors.speakersWorking) functionalDeduction += 200_000;

  const totalDeductions = batteryDeduction + bodyDeduction + screenDeduction + functionalDeduction;
  const subsidy = factors.subsidyBonus || 500_000;
  const estimatedValue = Math.max(1_000_000, basePrice - totalDeductions);

  return {
    estimatedValue,
    deductions: {
      basePrice,
      batteryDeduction,
      bodyDeduction,
      screenDeduction,
      functionalDeduction,
      subsidyBonus: subsidy
    }
  };
}
