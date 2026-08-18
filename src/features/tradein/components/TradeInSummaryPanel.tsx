import React, { useState } from 'react';
import { DeviceItem, StaffMember, TradeInAppraisal } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { Repeat, ShieldCheck, CheckCircle2, Lock, ArrowRight, ShoppingCart } from 'lucide-react';
import { calculateTradeInValuation, TradeInGradingFactors } from '../types';
import { OldDeviceAppraisalState } from './OldDeviceAppraisalPanel';

export interface TradeInSummaryPanelProps {
  appraisalState: OldDeviceAppraisalState;
  targetDevice: DeviceItem | null;
  currentUser?: StaffMember | null;
  onCompleteTradeInToPOS: (appraisal: TradeInAppraisal, targetDevice: DeviceItem) => void;
}

export const TradeInSummaryPanel: React.FC<TradeInSummaryPanelProps> = ({
  appraisalState,
  targetDevice,
  currentUser,
  onCompleteTradeInToPOS
}) => {
  const [managerPin, setManagerPin] = useState('');
  const [isApproved, setIsApproved] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const valuation = calculateTradeInValuation(appraisalState.basePrice, {
    batteryPercent: appraisalState.batteryPercent,
    bodyCondition: appraisalState.bodyCondition,
    screenCondition: appraisalState.screenCondition,
    faceIdWorking: appraisalState.faceIdWorking,
    cameraWorking: appraisalState.cameraWorking,
    truetoneWorking: appraisalState.truetoneWorking,
    speakersWorking: appraisalState.speakersWorking,
    subsidyBonus: appraisalState.subsidyBonus
  });

  const oldBuybackValue = valuation.estimatedValue;
  const targetPrice = targetDevice?.sellPrice || 0;
  const subsidyAmount = appraisalState.subsidyBonus;
  const upgradeDifference = Math.max(0, targetPrice - oldBuybackValue);

  // Require manager approval if oldBuybackValue > 15,000,000 or subsidy > 500,000
  const requiresApproval = oldBuybackValue > 15_000_000 || subsidyAmount > 500_000;
  const canProceed = !requiresApproval || isApproved || currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER';

  const handleManagerApprove = () => {
    if (managerPin === '8888' || currentUser?.role === 'ADMIN') {
      setIsApproved(true);
      alert('Đã phê duyệt định giá thành công.');
    } else {
      alert('Mã PIN quản lý không chính xác.');
    }
  };

  const handleFinish = () => {
    if (!targetDevice) {
      alert('Vui lòng chọn máy đời mới muốn lên đời từ cột giữa.');
      return;
    }
    if (!appraisalState.customerName || !appraisalState.customerPhone) {
      alert('Vui lòng nhập tên và số điện thoại khách hàng ở cột 1.');
      return;
    }

    const newAppraisal: TradeInAppraisal = {
      id: `APPRAISAL-${Date.now()}`,
      customerName: appraisalState.customerName,
      phone: appraisalState.customerPhone,
      oldModel: appraisalState.oldModel,
      storage: appraisalState.storage,
      color: appraisalState.color,
      batteryPercent: appraisalState.batteryPercent,
      bodyCondition: appraisalState.bodyCondition,
      screenCondition: appraisalState.screenCondition,
      faceIdWorking: appraisalState.faceIdWorking,
      cameraWorking: appraisalState.cameraWorking,
      icloudUnlocked: appraisalState.icloudUnlocked,
      truetoneWorking: appraisalState.truetoneWorking,
      speakersWorking: appraisalState.speakersWorking,
      estimatedValue: oldBuybackValue,
      targetNewModel: targetDevice.model,
      targetNewModelPrice: targetPrice,
      upgradeDiffPrice: upgradeDifference,
      status: 'accepted',
      createdDate: new Date().toISOString().split('T')[0],
      inspectedBy: currentUser?.displayName || 'KTV Thẩm Định'
    };

    onCompleteTradeInToPOS(newAppraisal, targetDevice);
  };

  return (
    <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 flex flex-col h-full space-y-4 shadow-2xs">
      {/* Header */}
      <div className="border-b border-zinc-100 pb-3 flex items-center space-x-2">
        <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#ff4b16] font-bold text-xs flex items-center justify-center">
          <Repeat className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
            3. Tiền Bù & Duyệt Bán
          </h3>
          <p className="text-[10px] text-zinc-400">Tính chênh lệch và chuyển sang POS</p>
        </div>
      </div>

      {/* Calculations Breakdown */}
      <div className="p-3.5 bg-zinc-50 border border-zinc-200/80 rounded-2xl space-y-2 text-xs">
        <div className="flex justify-between text-zinc-600">
          <span>Giá máy đời mới ({targetDevice?.model || 'Chưa chọn'}):</span>
          <span className="font-mono font-bold text-zinc-900">{targetPrice.toLocaleString('vi-VN')}đ</span>
        </div>

        <div className="flex justify-between text-emerald-700 font-semibold">
          <span>Trừ giá thu máy cũ ({appraisalState.oldModel}):</span>
          <span className="font-mono font-bold">-{oldBuybackValue.toLocaleString('vi-VN')}đ</span>
        </div>

        <div className="flex justify-between text-amber-700 font-semibold text-[11px]">
          <span>(Bao gồm trợ giá Trade-in PhoneHouse):</span>
          <span className="font-mono font-bold">{subsidyAmount.toLocaleString('vi-VN')}đ</span>
        </div>

        <div className="pt-2 border-t border-zinc-200 flex justify-between items-baseline">
          <span className="font-bold text-xs uppercase text-zinc-900">Khách Cần Bù:</span>
          <span className="text-xl font-black font-mono text-[#ff4b16]">
            {upgradeDifference.toLocaleString('vi-VN')}đ
          </span>
        </div>
      </div>

      {/* Manager Approval Gate if required */}
      {requiresApproval && !canProceed && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs">
          <div className="flex items-center space-x-1.5 text-amber-800 font-bold">
            <Lock className="w-4 h-4 text-amber-600" />
            <span>Cần Quản Lý Phê Duyệt Giá</span>
          </div>
          <p className="text-[11px] text-amber-700">
            Đơn thu cũ giá trị cao hoặc trợ giá đặc biệt cần mã PIN quản lý để xác nhận.
          </p>

          <div className="flex space-x-2">
            <input
              type="password"
              placeholder="Nhập mã PIN quản lý..."
              value={managerPin}
              onChange={e => setManagerPin(e.target.value)}
              className="flex-1 h-8 px-2.5 bg-white border border-amber-300 rounded-lg font-mono text-xs"
            />
            <Button variant="primary" size="sm" onClick={handleManagerApprove} className="h-8">
              Duyệt
            </Button>
          </div>
        </div>
      )}

      {/* Conversion Button */}
      <div className="pt-2 mt-auto border-t border-zinc-100">
        <Button
          variant="primary"
          size="lg"
          disabled={!canProceed || !targetDevice}
          onClick={handleFinish}
          leftIcon={<ShoppingCart className="w-4 h-4" />}
          className="w-full"
        >
          Tạo Đơn Thu Cũ Sang POS (F2)
        </Button>
      </div>
    </div>
  );
};
