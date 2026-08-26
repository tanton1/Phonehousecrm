import React, { useState } from 'react';
import { TradeInAppraisal, DeviceItem } from '../types';
import { calculate12StepTradeIn } from '../utils/tradeInEngine';
import { 
  RefreshCw, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  Smartphone, 
  ArrowRight, 
  FileText, 
  Plus, 
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  Zap,
  ArrowUpRight,
  TrendingDown,
  Layers
} from 'lucide-react';

interface TradeInViewProps {
  tradeIns: TradeInAppraisal[];
  devices: DeviceItem[];
  onAddTradeIn: (tradeIn: TradeInAppraisal) => Promise<TradeInAppraisal> | void;
  onUpdateTradeIn: (tradeIn: TradeInAppraisal) => Promise<TradeInAppraisal> | void;
  onImportToInventory: (device: DeviceItem) => void;
}

export const TradeInView: React.FC<TradeInViewProps> = ({
  tradeIns,
  devices,
  onAddTradeIn,
  onUpdateTradeIn,
  onImportToInventory
}) => {
  // Trade-in Studio Assessment Form State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [oldModel, setOldModel] = useState('iPhone 13 Pro Max');
  const [storage, setStorage] = useState('128GB');
  const [color, setColor] = useState('Sierra Blue');
  const [batteryPercent, setBatteryPercent] = useState<number>(84);
  const [screenCondition, setScreenCondition] = useState<'Màn Zin Đẹp' | 'Màn Trầy Xước' | 'Màn Đã Ép Kính' | 'Màn Lô / Mực / Sọc'>('Màn Zin Đẹp');
  const [bodyCondition, setBodyCondition] = useState<'Keng Không Vết Xước' | 'Trầy Nhẹ Lông Mèo' | 'Cấn Móp Góc' | 'Cong Vỏ'>('Trầy Nhẹ Lông Mèo');
  const [faceIdWorking, setFaceIdWorking] = useState<boolean>(true);
  const [truetoneWorking, setTruetoneWorking] = useState<boolean>(true);
  const [cameraWorking, setCameraWorking] = useState<boolean>(true);
  const [speakersWorking, setSpeakersWorking] = useState<boolean>(true);
  const [icloudUnlocked, setIcloudUnlocked] = useState<boolean>(true);

  // Upgrade Target
  const [targetNewModel, setTargetNewModel] = useState('iPhone 16 Pro Max 256GB Desert');
  const [targetNewModelPrice, setTargetNewModelPrice] = useState<number>(34500000);

  // AI Evaluation Result
  const [isValuating, setIsValuating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<{
    suggestedValuation: number;
    minPrice: number;
    maxPrice: number;
    inspectionGrade: string;
    deductions: string[];
    salesPitchAdvice: string;
    confidenceScore: number;
  } | null>(null);

  const handleRunAIValuation = () => {
    setIsValuating(true);
    setTimeout(() => {
      const result = calculate12StepTradeIn({
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
        wifiWorking: true,
        chargingPortWorking: true,
        mainZin: true,
        subsidyBonus: 1000000,
      });

      const suggested = result.finalValuation;
      const deductionsList = result.deductionDetails.map(d => `${d.name}: -${d.amount.toLocaleString('vi-VN')}đ (${d.note})`);

      setEvaluationResult({
        suggestedValuation: suggested,
        minPrice: suggested - 300000,
        maxPrice: suggested + 300000,
        inspectionGrade: result.gradeLabel,
        deductions: deductionsList.length > 0 ? deductionsList : ['Máy đẹp hoàn hảo, giữ nguyên giá thu kịch trần (+Trợ giá Shop 1tr)'],
        salesPitchAdvice: `Trợ giá thêm 1.000.000đ khi lên đời ${targetNewModel}. Khách chỉ cần bù chênh lệch ${(targetNewModelPrice - suggested).toLocaleString('vi-VN')}đ, hỗ trợ trả góp 0% qua CCCD.`,
        confidenceScore: 98
      });
      setIsValuating(false);
    }, 400);
  };

  const handleSaveAppraisal = async () => {
    if (!customerName.trim() || !/^\+?\d{8,15}$/.test(customerPhone.replace(/\s+/g, ''))) {
      alert('Vui lòng nhập đúng tên và số điện thoại khách hàng.');
      return;
    }
    const valuation = evaluationResult ? evaluationResult.suggestedValuation : 12000000;
    const diff = targetNewModelPrice - valuation;

    const newAppraisal: TradeInAppraisal = {
      id: `TRD-${Date.now().toString().slice(-4)}`,
      customerName,
      phone: customerPhone,
      oldModel,
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
      estimatedValue: valuation,
      targetNewModel,
      targetNewModelPrice,
      upgradeDiffPrice: diff,
      status: 'pending',
      createdDate: new Date().toISOString().split('T')[0],
      inspectedBy: 'KTV Trưởng',
      aiSuggestedPrice: valuation,
      aiReasoning: evaluationResult?.salesPitchAdvice
    };

    try {
      const saved = await onAddTradeIn(newAppraisal);
      alert(saved?.status === 'accepted'
        ? 'Đã lưu và duyệt hồ sơ thẩm định thu cũ.'
        : 'Đã lưu hồ sơ. Phiếu đang chờ quản lý duyệt giá trước khi dùng tại POS.');
    } catch (error: any) {
      alert(error?.message || 'Không lưu được hồ sơ thẩm định thu cũ.');
    }
  };

  const handleConvertOldPhoneToInventory = (_t: TradeInAppraisal) => {
    alert('Không tự sinh IMEI hoặc tăng tồn kho. Hãy đưa phiếu đã duyệt vào POS, nhập IMEI thật và xác nhận hóa đơn; máy thu cũ sẽ được nhập kho trong cùng giao dịch.');
  };

  const currentValuation = evaluationResult?.suggestedValuation || 0;
  const currentDiff = targetNewModelPrice - currentValuation;

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-zinc-900 flex items-center space-x-2">
          <span>Trung Tâm Thẩm Định Thu Cũ Đổi Mới (Trade-In)</span>
          <span className="bg-orange-50 text-orange-700 border border-orange-200 text-xs px-2.5 py-0.5 rounded-full font-bold">
            Checklist 12 Bước
          </span>
        </h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Quy chuẩn định giá thu máy iPhone cũ, tự động trừ khấu hao linh kiện và tính tiền bù lên đời chính xác
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Column 1: Thông Tin Khách & Dòng Máy */}
        <div className="space-y-4">
          <div className="bg-white border border-orange-100 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3.5">
            <h3 className="font-black text-zinc-900 text-sm flex items-center space-x-2">
              <Smartphone className="w-4 h-4 text-orange-600" />
              <span>1. Khách Hàng & Máy Thu Cũ</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Tên Khách Hàng</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Số Điện Thoại</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Dòng iPhone Thu Cũ</label>
                <select
                  value={oldModel}
                  onChange={(e) => setOldModel(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500 font-bold"
                >
                  <option value="iPhone 16 Pro Max">iPhone 16 Pro Max</option>
                  <option value="iPhone 16 Pro">iPhone 16 Pro</option>
                  <option value="iPhone 16">iPhone 16</option>
                  <option value="iPhone 15 Pro Max">iPhone 15 Pro Max</option>
                  <option value="iPhone 15 Pro">iPhone 15 Pro</option>
                  <option value="iPhone 15">iPhone 15</option>
                  <option value="iPhone 14 Pro Max">iPhone 14 Pro Max</option>
                  <option value="iPhone 14 Pro">iPhone 14 Pro</option>
                  <option value="iPhone 14">iPhone 14</option>
                  <option value="iPhone 13 Pro Max">iPhone 13 Pro Max</option>
                  <option value="iPhone 13 Pro">iPhone 13 Pro</option>
                  <option value="iPhone 13">iPhone 13</option>
                  <option value="iPhone 12 Pro Max">iPhone 12 Pro Max</option>
                  <option value="iPhone 12">iPhone 12</option>
                  <option value="iPhone 11 Pro Max">iPhone 11 Pro Max</option>
                  <option value="iPhone 11">iPhone 11</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Dung Lượng</label>
                  <select
                    value={storage}
                    onChange={(e) => setStorage(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                  >
                    <option value="64GB">64GB</option>
                    <option value="128GB">128GB</option>
                    <option value="256GB">256GB</option>
                    <option value="512GB">512GB</option>
                    <option value="1TB">1TB</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Màu Sắc</label>
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Target Model to Upgrade */}
          <div className="bg-white border border-orange-100 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
            <h3 className="font-black text-zinc-900 text-sm flex items-center space-x-2">
              <Zap className="w-4 h-4 text-orange-600" />
              <span>2. Khách Muốn Lên Đời Gì?</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Dòng Máy Mới</label>
                <input
                  type="text"
                  value={targetNewModel}
                  onChange={(e) => setTargetNewModel(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Giá Bán Máy Mới (VNĐ)</label>
                <input
                  type="number"
                  step="100000"
                  value={targetNewModelPrice}
                  onChange={(e) => setTargetNewModelPrice(Number(e.target.value))}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 font-mono font-bold focus:outline-none focus:bg-white focus:border-orange-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: 12-Step Hardware Checklist */}
        <div className="space-y-4">
          <div className="bg-white border border-orange-100 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3.5">
            <h3 className="font-black text-zinc-900 text-sm flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-orange-600" />
              <span>3. Thẩm Định 12 Bước Phần Cứng</span>
            </h3>

            {/* Battery slider */}
            <div className="p-3 bg-orange-50/50 rounded-2xl border border-orange-100 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-zinc-700">Tình Trạng Pin (% Health):</span>
                <span className="font-mono text-base font-black text-orange-600">{batteryPercent}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="100"
                value={batteryPercent}
                onChange={(e) => setBatteryPercent(Number(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer h-2 bg-zinc-200 rounded-lg"
              />
            </div>

            {/* Screen & Body */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Màn Hình & Cảm Ứng</label>
                <select
                  value={screenCondition}
                  onChange={(e) => setScreenCondition(e.target.value as any)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                >
                  <option value="Màn Zin Đẹp">Màn Zin Keng Đẹp (Không trầy)</option>
                  <option value="Màn Trầy Xước">Màn Zin Trầy Xước</option>
                  <option value="Màn Đã Ép Kính">Màn Đã Ép Kính</option>
                  <option value="Màn Lô / Mực / Sọc">Màn Lô / Sọc Mực</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Khung Vỏ & Lưng Kính</label>
                <select
                  value={bodyCondition}
                  onChange={(e) => setBodyCondition(e.target.value as any)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                >
                  <option value="Keng Không Vết Xước">Keng Không Vết Xước (99.9%)</option>
                  <option value="Trầy Nhẹ Lông Mèo">Trầy Nhẹ Lông Mèo (99%)</option>
                  <option value="Cấn Móp Góc">Cấn Móp Góc / Tróc Sơn</option>
                  <option value="Cong Vỏ">Cong Vỏ / Vỡ Lưng</option>
                </select>
              </div>
            </div>

            {/* 4 Essential Functional Toggles */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {[
                { label: 'Face ID', state: faceIdWorking, set: setFaceIdWorking },
                { label: 'True Tone', state: truetoneWorking, set: setTruetoneWorking },
                { label: 'Camera 0.5x-5x', state: cameraWorking, set: setCameraWorking },
                { label: 'iCloud Sạch', state: icloudUnlocked, set: setIcloudUnlocked },
              ].map((func, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => func.set(!func.state)}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                    func.state
                      ? 'bg-orange-50 border-orange-200 text-orange-700'
                      : 'bg-rose-50 border-rose-200 text-rose-700'
                  }`}
                >
                  <span>{func.label}</span>
                  {func.state ? <CheckCircle2 className="w-3.5 h-3.5 text-orange-600" /> : <XCircle className="w-3.5 h-3.5 text-rose-500" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Col: AI Valuation Result & Upgrade Summary */}
        <div className="space-y-4">
          <div className="bg-white border border-orange-200 rounded-3xl p-5 shadow-sm space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="bg-gradient-to-r from-orange-500 to-orange-500 text-white text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shadow-xs">
                AI Thẩm Định Giá
              </span>
              <span className="text-xs text-zinc-500">Độ tin cậy 96%</span>
            </div>

            <button
              onClick={handleRunAIValuation}
              disabled={isValuating}
              className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-2 shadow-md shadow-orange-500/20 active:scale-95 transition-all"
            >
              <Sparkles className="w-4 h-4 text-white" />
              <span>{isValuating ? 'Đang thẩm định...' : 'Tính Giá Thu & Bù Tiền Lên Đời'}</span>
            </button>

            {evaluationResult && (
              <div className="space-y-3 pt-2">
                {/* Valuation amount */}
                <div className="bg-orange-50/60 p-4 rounded-2xl border border-orange-100 text-center space-y-1">
                  <span className="text-[11px] text-zinc-600 font-bold uppercase">Giá Thu Cũ Đề Xuất</span>
                  <div className="text-2xl font-black text-orange-600 font-mono tracking-tight">
                    {evaluationResult.suggestedValuation.toLocaleString('vi-VN')} <span className="text-sm">đ</span>
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Khoảng thu: {evaluationResult.minPrice.toLocaleString('vi-VN')}đ - {evaluationResult.maxPrice.toLocaleString('vi-VN')}đ
                  </div>
                </div>

                {/* Diff to Pay */}
                <div className="bg-gradient-to-r from-orange-50 to-orange-50 p-3.5 rounded-2xl border border-orange-200 space-y-1">
                  <div className="flex justify-between text-xs text-zinc-700">
                    <span>Giá máy mới ({targetNewModel}):</span>
                    <strong className="text-zinc-900 font-mono">{targetNewModelPrice.toLocaleString('vi-VN')}đ</strong>
                  </div>
                  <div className="flex justify-between text-xs text-zinc-700">
                    <span>Trừ giá thu máy cũ:</span>
                    <strong className="text-orange-600 font-mono">- {evaluationResult.suggestedValuation.toLocaleString('vi-VN')}đ</strong>
                  </div>
                  <div className="flex justify-between text-sm font-black text-zinc-900 pt-2 border-t border-orange-200">
                    <span>Khách Cần Bù:</span>
                    <span className="text-orange-600 font-mono text-base">{currentDiff.toLocaleString('vi-VN')} đ</span>
                  </div>
                </div>

                {/* Advice */}
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-xs text-zinc-700 space-y-1">
                  <strong className="text-orange-700 font-bold block">Kịch bản tư vấn chốt khách:</strong>
                  <p className="text-[11px] leading-relaxed text-zinc-600">{evaluationResult.salesPitchAdvice}</p>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  <button
                    onClick={handleSaveAppraisal}
                    className="w-full py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 border border-zinc-200 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-orange-600" />
                    <span>Lưu Hồ Sơ Thẩm Định</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* History of Trade-ins */}
          <div className="bg-white border border-orange-100 rounded-3xl p-4 shadow-xs space-y-3">
            <h4 className="font-bold text-zinc-900 text-xs flex items-center justify-between">
              <span>Hồ Sơ Thu Cũ Gần Đây</span>
              <span className="text-[10px] bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-bold">{tradeIns.length}</span>
            </h4>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {tradeIns.map((t) => (
                <div 
                  key={t.id}
                  className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs space-y-1.5 hover:border-orange-300 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <strong className="text-zinc-900 block">{t.customerName} ({t.phone})</strong>
                      <span className="text-[11px] text-zinc-500">Thu: {t.oldModel} {t.storage}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      t.status === 'completed' ? 'bg-zinc-100 text-zinc-600 border border-zinc-200' : 'bg-orange-50 text-orange-700 border border-orange-200'
                    }`}>
                      {t.status === 'completed' ? 'Đã Nhập Kho' : 'Chờ Nhập'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-1 border-t border-zinc-200">
                    <span className="text-orange-600 font-bold">{t.estimatedValue.toLocaleString('vi-VN')}đ</span>
                    {t.status !== 'completed' && (
                      <button
                        onClick={() => handleConvertOldPhoneToInventory(t)}
                        className="px-2 py-1 bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white text-[10px] font-bold rounded-lg shadow-xs"
                      >
                        Nhập Kho Bán
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
