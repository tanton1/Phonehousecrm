import React, { useEffect, useMemo, useState } from 'react';
import { DeviceItem, StoreBranch, StaffMember, TradeInAppraisal, WarehouseInfo } from '../../../types';
import { OldDeviceAppraisalPanel, OldDeviceAppraisalState } from './OldDeviceAppraisalPanel';
import { TargetDevicePickerPanel } from './TargetDevicePickerPanel';
import { TradeInSummaryPanel } from './TradeInSummaryPanel';
import { Repeat, CheckCircle2 } from 'lucide-react';

export interface TradeInCockpitViewProps {
  devices: DeviceItem[];
  warehouses: WarehouseInfo[];
  currentBranch: StoreBranch;
  currentUser?: StaffMember | null;
  onCompleteTradeInToPOS: (appraisal: TradeInAppraisal, targetDevice: DeviceItem) => void;
}

export const TradeInCockpitView: React.FC<TradeInCockpitViewProps> = ({
  devices,
  warehouses,
  currentBranch,
  currentUser,
  onCompleteTradeInToPOS
}) => {
  const [appraisalState, setAppraisalState] = useState<OldDeviceAppraisalState>({
    customerName: '',
    customerPhone: '',
    imei: '',
    receiveWarehouseId: '',
    oldModel: '',
    storage: '',
    color: '',
    batteryPercent: 100,
    bodyCondition: 'Keng Không Vết Xước',
    screenCondition: 'Màn Zin Đẹp',
    faceIdWorking: true,
    cameraWorking: true,
    icloudUnlocked: true,
    truetoneWorking: true,
    speakersWorking: true,
    basePrice: 0,
    subsidyBonus: 0
  });

  const receiptWarehouses = useMemo(() => warehouses.filter(warehouse => (
    warehouse.branchId === currentBranch.id
    && warehouse.isActive !== false
    && warehouse.active !== false
    && warehouse.isArchived !== true
    && ['CENTRAL', 'RETAIL_STORE'].includes(String(warehouse.type || 'RETAIL_STORE'))
  )), [currentBranch.id, warehouses]);

  useEffect(() => {
    setAppraisalState(current => receiptWarehouses.some(warehouse => String(warehouse.id) === current.receiveWarehouseId)
      ? current
      : { ...current, receiveWarehouseId: String(receiptWarehouses.find(warehouse => String(warehouse.id) === String(currentBranch.warehouseId))?.id || receiptWarehouses[0]?.id || '') });
  }, [currentBranch.warehouseId, receiptWarehouses]);

  const [selectedTargetDevice, setSelectedTargetDevice] = useState<DeviceItem | null>(null);

  const handleUpdateAppraisal = (updates: Partial<OldDeviceAppraisalState>) => {
    setAppraisalState(prev => ({ ...prev, ...updates }));
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-4">
      {/* Top Banner */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff4b16] animate-pulse" />
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-800">
            Thu Cũ Đổi Mới Trade-in Cockpit (3 Cột)
          </h2>
          <span className="text-xs text-zinc-400 font-medium hidden sm:inline-block">
            • Chi nhánh {currentBranch.name}
          </span>
        </div>
      </div>

      {/* 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.1fr_360px] gap-4 items-start">
        {/* Column 1: Customer Old Device Appraisal */}
        <div className="w-full">
          <OldDeviceAppraisalPanel
            state={appraisalState}
            warehouses={receiptWarehouses}
            onChange={handleUpdateAppraisal}
          />
        </div>

        {/* Column 2: Target Device Picker */}
        <div className="w-full">
          <TargetDevicePickerPanel
            devices={devices}
            selectedDevice={selectedTargetDevice}
            onSelectDevice={setSelectedTargetDevice}
          />
        </div>

        {/* Column 3: Upgrade Difference & Manager Approval */}
        <div className="w-full">
          <TradeInSummaryPanel
            appraisalState={appraisalState}
            targetDevice={selectedTargetDevice}
            currentUser={currentUser}
            onCompleteTradeInToPOS={onCompleteTradeInToPOS}
          />
        </div>
      </div>
    </div>
  );
};
