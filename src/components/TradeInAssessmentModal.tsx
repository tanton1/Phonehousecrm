import React, { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, AlertCircle, ArrowRight, ShieldCheck, X, DollarSign, Smartphone } from 'lucide-react';
import { 
  calculate12StepTradeIn, 
  IPHONE_BASE_TRADEIN_PRICES, 
  TradeInAssessmentInput, 
  TradeInAssessmentResult 
} from '../utils/tradeInEngine';
import { TradeInAppraisal } from '../types';

interface TradeInAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyValuation: (result: {
    tradeInModel: string;
    tradeInAmount: number;
    appraisal: TradeInAppraisal;
  }) => void;
  defaultCustomerName?: string;
  defaultCustomerPhone?: string;
  defaultTargetNewModel?: string;
  defaultTargetNewModelPrice?: number;
}

export const TradeInAssessmentModal: React.FC<TradeInAssessmentModalProps> = ({
  isOpen,
  onClose,
  onApplyValuation,
  defaultCustomerName = 'Khách Thu Cũ',
  defaultCustomerPhone = '0900000000',
  defaultTargetNewModel = 'iPhone 16 Pro Max 256GB',
  defaultTargetNewModelPrice = 34500000,
}) => {
  const [customerName, setCustomerName] = useState(defaultCustomerName);
  const [customerPhone, setCustomerPhone] = useState(defaultCustomerPhone);

  const [oldModel, setOldModel] = useState('iPhone 13 Pro Max');
  const [storage, setStorage] = useState('128GB');
  const [color, setColor] = useState('Sierra Blue');
  const [batteryPercent, setBatteryPercent] = useState<number>(84);

  const [bodyCondition, setBodyCondition] = useState<
    'Keng Không Vết Xước' | 'Trầy Nhẹ Lông Mèo' | 'Cấn Móp Góc' | 'Cong Vỏ'
  >('Trầy Nhẹ Lông Mèo');

  const [screenCondition, setScreenCondition] = useState<
    'Màn Zin Đẹp' | 'Màn Trầy Xước' | 'Màn Đã Ép Kính' | 'Màn Lô / Mực / Sọc'
  >('Màn Zin Đẹp');

  const [faceIdWorking, setFaceIdWorking] = useState(true);
  const [cameraWorking, setCameraWorking] = useState(true);
  const [truetoneWorking, setTruetoneWorking] = useState(true);
  const [speakersWorking, setSpeakersWorking] = useState(true);
  const [icloudUnlocked, setIcloudUnlocked] = useState(true);
  const [wifiWorking, setWifiWorking] = useState(true);
  const [chargingPortWorking, setChargingPortWorking] = useState(true);
  const [mainZin, setMainZin] = useState(true);

  // Subsidy Bonus (Trợ giá)
  const [subsidyBonus, setSubsidyBonus] = useState<number>(1000000);

  const [assessmentResult, setAssessmentResult] = useState<TradeInAssessmentResult | null>(null);

  // Recalculate on any state change
  useEffect(() => {
    const input: TradeInAssessmentInput = {
      oldModel,
      storage,
      color,
      batteryPercent,
      bodyCondition,
      screenCondition,
      faceIdWorking,
      cameraWorking,
      truetoneWorking,
      speakersWorking,
      icloudUnlocked,
      wifiWorking,
      chargingPortWorking,
      mainZin,
      subsidyBonus,
    };

    const res = calculate12StepTradeIn(input);
    setAssessmentResult(res);
  }, [
    oldModel,
    storage,
    color,
    batteryPercent,
    bodyCondition,
    screenCondition,
    faceIdWorking,
    cameraWorking,
    truetoneWorking,
    speakersWorking,
    icloudUnlocked,
    wifiWorking,
    chargingPortWorking,
    mainZin,
    subsidyBonus,
  ]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!assessmentResult) return;

    const fullModelName = `${oldModel} ${storage} ${color} (Pin ${batteryPercent}%)`;
    const diffPrice = Math.max(0, defaultTargetNewModelPrice - assessmentResult.finalValuation);

    const newAppraisal: TradeInAppraisal = {
      id: `TRD-${Date.now().toString().slice(-5)}`,
      customerName: customerName || 'Khách Vãng Lai',
      phone: customerPhone || '0900000000',
      oldModel: fullModelName,
      storage,
      color,
      batteryPercent,
      bodyCondition,
      screenCondition,
      faceIdWorking,
      cameraWorking,
      icloudUnlocked,
      truetoneWorking,
      speakersWorking,
      estimatedValue: assessmentResult.finalValuation,
      targetNewModel: defaultTargetNewModel,
      targetNewModelPrice: defaultTargetNewModelPrice,
      upgradeDiffPrice: diffPrice,
      status: 'accepted',
      createdDate: new Date().toISOString().split('T')[0],
      inspectedBy: 'NVBH / KTV',
      baseValue: assessmentResult.basePrice,
      subsidyBonus: assessmentResult.subsidyBonus,
      totalDeduction: assessmentResult.totalDeduction,
      deductionDetails: assessmentResult.deductionDetails,
    };

    onApplyValuation({
      tradeInModel: fullModelName,
      tradeInAmount: assessmentResult.finalValuation,
      appraisal: newAppraisal,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl space-y-0 my-auto animate-in fade-in zoom-in duration-200 border border-zinc-100">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-4 sm:p-5 text-white flex justify-between items-center">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base leading-snug">
                Thẩm Định Thu Cũ Đổi Mới (Checklist 12 Bước)
              </h3>
              <p className="text-[11px] text-orange-100 font-medium">
                Tự động khấu trừ lỗi ngoại quan & áp dụng trợ giá Shop
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 max-h-[75vh] overflow-y-auto custom-scrollbar space-y-4 text-xs">
          {/* Customer & Machine Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-zinc-50 p-3 rounded-2xl border border-zinc-200">
            <div>
              <label className="block text-[11px] font-bold text-zinc-700 mb-1">Tên Khách Hàng:</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 font-bold text-zinc-900"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-zinc-700 mb-1">Số Điện Thoại:</label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 font-bold text-zinc-900"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-zinc-700 mb-1">Máy Định Lên Đời:</label>
              <div className="px-2.5 py-1.5 bg-orange-100 text-orange-900 font-black rounded-xl text-center truncate">
                {defaultTargetNewModel}
              </div>
            </div>
          </div>

          {/* Model Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block font-bold text-zinc-800 mb-1">1. Dòng Máy Cũ:</label>
              <select
                value={oldModel}
                onChange={(e) => setOldModel(e.target.value)}
                className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 font-bold text-zinc-900 focus:border-orange-500"
              >
                {Object.keys(IPHONE_BASE_TRADEIN_PRICES).map((m) => (
                  <option key={m} value={m}>
                    📱 {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-zinc-800 mb-1">2. Dung Lượng:</label>
              <select
                value={storage}
                onChange={(e) => setStorage(e.target.value)}
                className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 font-bold text-zinc-900 focus:border-orange-500"
              >
                <option value="64GB">64GB</option>
                <option value="128GB">128GB (+0đ)</option>
                <option value="256GB">256GB (+1tr)</option>
                <option value="512GB">512GB (+1.8tr)</option>
                <option value="1TB">1TB (+2.8tr)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-zinc-800 mb-1">3. Dung Lượng Pin (%):</label>
              <div className="flex items-center space-x-1.5">
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={batteryPercent}
                  onChange={(e) => setBatteryPercent(Number(e.target.value))}
                  className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 font-bold text-zinc-900 font-mono text-center"
                />
                <span className="font-bold text-zinc-500">%</span>
              </div>
            </div>

            <div>
              <label className="block font-bold text-zinc-800 mb-1">4. Trợ Giá Đổi Mới:</label>
              <select
                value={subsidyBonus}
                onChange={(e) => setSubsidyBonus(Number(e.target.value))}
                className="w-full bg-emerald-50 border border-emerald-300 rounded-xl px-2.5 py-1.5 font-black text-emerald-900 focus:border-emerald-500"
              >
                <option value={0}>Không trợ giá (0đ)</option>
                <option value={500000}>Trợ giá +500.000đ</option>
                <option value={1000000}>Trợ giá +1.000.000đ</option>
                <option value={1500000}>Trợ giá +1.500.000đ</option>
                <option value={2000000}>Trợ giá +2.000.000đ (Đặc biệt)</option>
              </select>
            </div>
          </div>

          {/* Exterior & Hardware Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Vỏ máy */}
            <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 space-y-1.5">
              <label className="block font-bold text-zinc-800">5. Tình Trạng Vỏ Máy (Khung sườn/Lưng):</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'Keng Không Vết Xước', label: 'Zin Keng 99%', sub: 'Không trừ tiền' },
                  { id: 'Trầy Nhẹ Lông Mèo', label: 'Trầy Lông Mèo', sub: 'Trừ xước nhẹ (2%)' },
                  { id: 'Cấn Móp Góc', label: 'Cấn Móp Góc', sub: 'Trừ móp góc (4.5%)' },
                  { id: 'Cong Vỏ', label: 'Cong / Lệch Khung', sub: 'Trừ sườn/vỏ (10%)' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setBodyCondition(item.id as any)}
                    className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                      bodyCondition === item.id
                        ? 'bg-orange-500 text-white border-orange-600 font-bold shadow-2xs'
                        : 'bg-white text-zinc-800 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="text-[11px] font-bold">{item.label}</div>
                    <div className={`text-[10px] ${bodyCondition === item.id ? 'text-orange-100' : 'text-zinc-500'}`}>
                      {item.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Màn hình */}
            <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 space-y-1.5">
              <label className="block font-bold text-zinc-800">6. Tình Trạng Màn Hình:</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'Màn Zin Đẹp', label: 'Màn Zin Đẹp', sub: 'Không trừ tiền' },
                  { id: 'Màn Trầy Xước', label: 'Màn Trầy Xước', sub: 'Trừ xước màn (3%)' },
                  { id: 'Màn Đã Ép Kính', label: 'Màn Zin Ép Kính', sub: 'Trừ ép kính (8%)' },
                  { id: 'Màn Lô / Mực / Sọc', label: 'Màn Lô / Sọc Mực', sub: 'Trừ thay màn (28%)' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setScreenCondition(item.id as any)}
                    className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                      screenCondition === item.id
                        ? 'bg-orange-500 text-white border-orange-600 font-bold shadow-2xs'
                        : 'bg-white text-zinc-800 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="text-[11px] font-bold">{item.label}</div>
                    <div className={`text-[10px] ${screenCondition === item.id ? 'text-orange-100' : 'text-zinc-500'}`}>
                      {item.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Functional Check Toggles (Steps 7 - 12) */}
          <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 space-y-2">
            <span className="block font-bold text-zinc-800 text-[11px]">
              7-12. Test Chức Năng Cắt Lỗi Linh Kiện (Bấm chọn nếu OK, bỏ chọn nếu lỗi):
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'FaceID / TouchID', state: faceIdWorking, setter: setFaceIdWorking, err: '-1.5tr' },
                { label: 'Hệ thống Camera', state: cameraWorking, setter: setCameraWorking, err: '-600k' },
                { label: 'TrueTone Màn', state: truetoneWorking, setter: setTruetoneWorking, err: '-200k' },
                { label: 'Loa / Micro', state: speakersWorking, setter: setSpeakersWorking, err: '-200k' },
                { label: 'iCloud Sạch', state: icloudUnlocked, setter: setIcloudUnlocked, err: '-4tr' },
                { label: 'Wifi & Bluetooth', state: wifiWorking, setter: setWifiWorking, err: '-500k' },
                { label: 'Cổng Sạc OK', state: chargingPortWorking, setter: setChargingPortWorking, err: '-300k' },
                { label: 'Mainboard Zin', state: mainZin, setter: setMainZin, err: '-1.2tr' },
              ].map((t, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => t.setter(!t.state)}
                  className={`p-2 rounded-xl text-left border flex justify-between items-center transition-all cursor-pointer ${
                    t.state
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold'
                      : 'bg-red-50 text-red-900 border-red-300 font-bold'
                  }`}
                >
                  <div className="truncate">
                    <div className="text-[10px] uppercase font-mono text-zinc-500">
                      {t.state ? '✓ Hoạt động' : '✗ Lỗi/Mất'}
                    </div>
                    <div className="text-[11px] font-bold">{t.label}</div>
                  </div>
                  {!t.state && (
                    <span className="text-[10px] font-black font-mono text-red-600 bg-red-100 px-1.5 py-0.5 rounded-md shrink-0">
                      {t.err}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* REALTIME VALUATION SUMMARY BOX */}
          {assessmentResult && (
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-4 rounded-3xl text-white space-y-3 shadow-lg">
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 border-b border-white/20 pb-2.5">
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-mono text-orange-100 font-bold">
                    Kết Quả Định Giá {assessmentResult.gradeLabel}
                  </span>
                  <h4 className="text-xl sm:text-2xl font-black font-mono">
                    {assessmentResult.finalValuation.toLocaleString('vi-VN')} VNĐ
                  </h4>
                </div>

                <div className="text-right sm:text-right text-[11px] font-medium bg-black/20 px-3 py-1.5 rounded-2xl backdrop-blur-md">
                  <div>Giá Máy Zin: {assessmentResult.basePrice.toLocaleString('vi-VN')}đ</div>
                  <div className="text-orange-200">
                    Trừ Khấu Hao: -{assessmentResult.totalDeduction.toLocaleString('vi-VN')}đ
                  </div>
                  {assessmentResult.subsidyBonus > 0 && (
                    <div className="text-emerald-300 font-bold">
                      + Trợ Giá Shop: +{assessmentResult.subsidyBonus.toLocaleString('vi-VN')}đ
                    </div>
                  )}
                </div>
              </div>

              {/* Deduction details breakdown */}
              {assessmentResult.deductionDetails.length > 0 ? (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-orange-100 uppercase">
                    Chi tiết các khoản khấu trừ ({assessmentResult.deductionDetails.length} mục):
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {assessmentResult.deductionDetails.map((d, i) => (
                      <span
                        key={i}
                        className="bg-black/20 text-white border border-white/20 text-[10px] font-bold px-2 py-0.5 rounded-lg flex items-center space-x-1"
                      >
                        <span>{d.name}:</span>
                        <span className="text-orange-200 font-mono">-{d.amount.toLocaleString('vi-VN')}đ</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-emerald-100 font-bold flex items-center space-x-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>Máy zin keng nguyên bản, thu giá tối đa kịch trần!</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-zinc-300 hover:bg-zinc-100 text-zinc-700 font-bold rounded-2xl text-xs cursor-pointer"
          >
            Hủy Bỏ
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black rounded-2xl text-xs shadow-md shadow-orange-500/20 cursor-pointer flex items-center space-x-2"
          >
            <span>⚡ Áp Dụng Giá Thu Cũ ({assessmentResult?.finalValuation.toLocaleString('vi-VN')} đ)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
