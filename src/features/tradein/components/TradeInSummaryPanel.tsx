import React from 'react';
import { DeviceItem, StaffMember, TradeInAppraisal } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { Repeat, ShoppingCart } from 'lucide-react';
import { calculateTradeInValuation } from '../types';
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

  const role = String(currentUser?.role || '').toUpperCase();
  const isManager = ['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER'].includes(role);

  const handleFinish = () => {
    if (!targetDevice) {
      alert('Vui lòng chọn máy đời mới muốn lên đời từ cột giữa.');
      return;
    }
    if (!appraisalState.customerName || !appraisalState.customerPhone) {
      alert('Vui lòng nhập tên và số điện thoại khách hàng ở cột 1.');
      return;
    }
    if (!/^\d{5,15}$/.test(appraisalState.imei)) {
      alert('IMEI máy thu cũ phải gồm từ 5 đến 15 chữ số.');
      return;
    }
    if (!appraisalState.receiveWarehouseId) {
      alert('Vui lòng chọn kho nhận máy thu cũ.');
      return;
    }
    if (!appraisalState.oldModel.trim() || !appraisalState.storage.trim() || appraisalState.basePrice <= 0) {
      alert('Vui lòng nhập dòng máy, dung lượng và giá gốc thẩm định hợp lệ.');
      return;
    }

    const newAppraisal: TradeInAppraisal = {
      id: `APPRAISAL-${Date.now()}`,
      imei: appraisalState.imei,
      receiveWarehouseId: appraisalState.receiveWarehouseId,
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
      status: isManager ? 'accepted' : 'pending',
      createdDate: new Date().toISOString().split('T')[0],
      inspectedBy: currentUser?.displayName || currentUser?.name || 'Nhân viên thẩm định'
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

      {!isManager && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold leading-5 text-amber-800">Nhân viên có thể lưu phiếu ngay. Quản lý sẽ duyệt giá trên hệ thống trước khi phiếu được đưa vào POS.</div>}

      {/* Conversion Button */}
      <div className="pt-2 mt-auto border-t border-zinc-100">
        <Button
          variant="primary"
          size="lg"
          disabled={!targetDevice}
          onClick={handleFinish}
          leftIcon={<ShoppingCart className="w-4 h-4" />}
          className="w-full"
        >
          {isManager ? 'Duyệt & đưa sang POS (F2)' : 'Lưu phiếu chờ duyệt'}
        </Button>
      </div>
    </div>
  );
};
