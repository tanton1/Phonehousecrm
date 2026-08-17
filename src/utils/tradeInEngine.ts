// 12-Step Trade-In Appraisal & Auto Valuation Engine for iStore Pro

export interface TradeInAssessmentInput {
  oldModel: string;
  storage: string;
  color: string;
  batteryPercent: number;
  bodyCondition: 'Keng Không Vết Xước' | 'Trầy Nhẹ Lông Mèo' | 'Cấn Móp Góc' | 'Cong Vỏ';
  screenCondition: 'Màn Zin Đẹp' | 'Màn Trầy Xước' | 'Màn Đã Ép Kính' | 'Màn Lô / Mực / Sọc';
  faceIdWorking: boolean;
  cameraWorking: boolean;
  truetoneWorking: boolean;
  speakersWorking: boolean;
  icloudUnlocked: boolean;
  wifiWorking: boolean;
  chargingPortWorking: boolean;
  mainZin: boolean;
  subsidyBonus: number; // Shop subsidy bonus (e.g. 500,000đ, 1,000,000đ...)
}

export interface TradeInAssessmentResult {
  basePrice: number;
  totalDeduction: number;
  subsidyBonus: number;
  finalValuation: number;
  gradeLabel: string;
  deductionDetails: { step: number; name: string; amount: number; note: string }[];
}

export const IPHONE_BASE_TRADEIN_PRICES: Record<string, number> = {
  'iPhone 16 Pro Max': 28500000,
  'iPhone 16 Pro': 24000000,
  'iPhone 16 Plus': 19500000,
  'iPhone 16': 17500000,
  'iPhone 15 Pro Max': 20500000,
  'iPhone 15 Pro': 17500000,
  'iPhone 15 Plus': 14500000,
  'iPhone 15': 13200000,
  'iPhone 14 Pro Max': 16800000,
  'iPhone 14 Pro': 14200000,
  'iPhone 14 Plus': 11800000,
  'iPhone 14': 10800000,
  'iPhone 13 Pro Max': 13800000,
  'iPhone 13 Pro': 11800000,
  'iPhone 13': 9500000,
  'iPhone 13 mini': 7200000,
  'iPhone 12 Pro Max': 10800000,
  'iPhone 12 Pro': 8800000,
  'iPhone 12': 7500000,
  'iPhone 11 Pro Max': 8200000,
  'iPhone 11 Pro': 6800000,
  'iPhone 11': 5600000,
  'iPhone XS Max': 5200000,
  'iPhone XR': 4200000,
  'iPhone X': 3500000,
  'iPhone 8 Plus': 3000000,
};

export function calculate12StepTradeIn(input: TradeInAssessmentInput): TradeInAssessmentResult {
  let base = IPHONE_BASE_TRADEIN_PRICES[input.oldModel] || 8000000;

  // Storage bump
  if (input.storage === '256GB') base += 1000000;
  else if (input.storage === '512GB') base += 1800000;
  else if (input.storage === '1TB') base += 2800000;

  const deductionDetails: { step: number; name: string; amount: number; note: string }[] = [];

  // Determine Generation / Series for battery & specific part scale
  const is16or15Series = input.oldModel.includes('16') || input.oldModel.includes('15');
  const is13or14Series = input.oldModel.includes('14') || input.oldModel.includes('13');

  // Step 1: Battery Health (Scaled by model tier)
  if (input.batteryPercent < 80) {
    const amt = is16or15Series ? 600000 : is13or14Series ? 450000 : 300000;
    deductionDetails.push({ 
      step: 1, 
      name: 'Tình trạng Pin', 
      amount: amt, 
      note: `Pin ${input.batteryPercent}% (<80% - Phí thay pin zin ${input.oldModel})` 
    });
  } else if (input.batteryPercent < 85) {
    const amt = is16or15Series ? 300000 : 200000;
    deductionDetails.push({ 
      step: 1, 
      name: 'Tình trạng Pin', 
      amount: amt, 
      note: `Pin ${input.batteryPercent}% (80-84% - Hỗ trợ bảo dưỡng pin)` 
    });
  }

  // Step 2: Body / Shell Condition (Proportional to base value - Titan/Sườn zin)
  if (input.bodyCondition === 'Trầy Nhẹ Lông Mèo') {
    const amt = Math.max(150000, Math.round((base * 0.02) / 50000) * 50000);
    deductionDetails.push({ step: 2, name: 'Ngoại quan Vỏ máy', amount: amt, note: 'Trầy nhẹ lông mèo viền/lưng' });
  } else if (input.bodyCondition === 'Cấn Móp Góc') {
    const amt = Math.max(300000, Math.round((base * 0.045) / 50000) * 50000);
    deductionDetails.push({ step: 2, name: 'Ngoại quan Vỏ máy', amount: amt, note: 'Cấn móp góc sườn' });
  } else if (input.bodyCondition === 'Cong Vỏ') {
    const amt = Math.max(500000, Math.round((base * 0.10) / 50000) * 50000);
    deductionDetails.push({ step: 2, name: 'Ngoại quan Vỏ máy', amount: amt, note: 'Vỏ cong / biến dạng khung sườn' });
  }

  // Step 3: Screen Condition (DYNAMIC BY MODEL - Screen cost scales with generation!)
  // E.g., 16 Pro Max screen (~8M), 12 Pro Max screen (~3M), 11 screen (~1.2M)
  if (input.screenCondition === 'Màn Trầy Xước') {
    const amt = Math.max(200000, Math.round((base * 0.03) / 50000) * 50000);
    deductionDetails.push({ step: 3, name: 'Màn hình hiển thị', amount: amt, note: `Xước dăm màn hình ${input.oldModel}` });
  } else if (input.screenCondition === 'Màn Đã Ép Kính') {
    const amt = Math.max(400000, Math.round((base * 0.08) / 50000) * 50000);
    deductionDetails.push({ step: 3, name: 'Màn hình hiển thị', amount: amt, note: `Màn zin đã qua ép kính (${input.oldModel})` });
  } else if (input.screenCondition === 'Màn Lô / Mực / Sọc') {
    // Dynamic ratio ~28% of base value (reflects true screen replacement cost on high-end models!)
    const amt = Math.max(1200000, Math.round((base * 0.28) / 50000) * 50000);
    deductionDetails.push({ 
      step: 3, 
      name: 'Màn hình hiển thị', 
      amount: amt, 
      note: `Lỗi màn lô / tróc thủy / sọc mực (Thay màn mới cho ${input.oldModel})` 
    });
  }

  // Step 4: FaceID / TouchID (Dynamic ~9% of base value)
  if (!input.faceIdWorking) {
    const amt = Math.max(600000, Math.round((base * 0.09) / 50000) * 50000);
    deductionDetails.push({ step: 4, name: 'FaceID / TouchID', amount: amt, note: `Lỗi cảm biến khuôn mặt/vân tay` });
  }

  // Step 5: Camera (Dynamic ~7% of base value)
  if (!input.cameraWorking) {
    const amt = Math.max(400000, Math.round((base * 0.07) / 50000) * 50000);
    deductionDetails.push({ step: 5, name: 'Hệ thống Camera', amount: amt, note: `Camera đốm / mờ / lỗi zoom / đứt cáp` });
  }

  // Step 6: TrueTone / Cảm biến
  if (!input.truetoneWorking) {
    const amt = is16or15Series ? 350000 : 200000;
    deductionDetails.push({ step: 6, name: 'TrueTone / Cảm biến', amount: amt, note: 'Mất TrueTone cảm biến ánh sáng' });
  }

  // Step 7: Speakers & Mic
  if (!input.speakersWorking) {
    const amt = is16or15Series ? 300000 : 200000;
    deductionDetails.push({ step: 7, name: 'Loa / Micro / Rung', amount: amt, note: 'Loa thoại rè / micro bé' });
  }

  // Step 8: iCloud (Dynamic ~35% base value - dính iCloud bán giá xác)
  if (!input.icloudUnlocked) {
    const amt = Math.max(2000000, Math.round((base * 0.35) / 50000) * 50000);
    deductionDetails.push({ step: 8, name: 'Tài khoản iCloud', amount: amt, note: 'Dính iCloud / chưa thoát chính chủ' });
  }

  // Step 9: Wifi & Bluetooth
  if (!input.wifiWorking) {
    const amt = Math.max(300000, Math.round((base * 0.04) / 50000) * 50000);
    deductionDetails.push({ step: 9, name: 'Kết nối Wifi/Bluetooth', amount: amt, note: 'Lỗi chíp Wifi / bắt sóng yếu' });
  }

  // Step 10: Charging Port & Buttons
  if (!input.chargingPortWorking) {
    const amt = is16or15Series ? 400000 : 250000;
    deductionDetails.push({ step: 10, name: 'Chân sạc / Phím bấm', amount: amt, note: 'Chân sạc chập chờn / kẹt nút' });
  }

  // Step 11: Mainboard & Sửa chữa (Dynamic ~18% base value)
  if (!input.mainZin) {
    const amt = Math.max(800000, Math.round((base * 0.18) / 50000) * 50000);
    deductionDetails.push({ step: 11, name: 'Mainboard đã sửa', amount: amt, note: 'Mainboard đã qua sửa chữa / làm chân' });
  }

  const totalDeduction = deductionDetails.reduce((sum, item) => sum + item.amount, 0);
  const calculatedVal = base - totalDeduction + (input.subsidyBonus || 0);
  const finalValuation = Math.max(500000, Math.round(calculatedVal / 50000) * 50000);

  let gradeLabel = 'Loại 1 (Zin Keng 99%)';
  if (deductionDetails.length >= 3 || totalDeduction >= base * 0.25) {
    gradeLabel = 'Loại 3 (Cần Spave / KCS Kỹ)';
  } else if (deductionDetails.length >= 1) {
    gradeLabel = 'Loại 2 (Đã Khấu Trừ Khấu Hao)';
  }

  return {
    basePrice: base,
    totalDeduction,
    subsidyBonus: input.subsidyBonus || 0,
    finalValuation,
    gradeLabel,
    deductionDetails
  };
}

