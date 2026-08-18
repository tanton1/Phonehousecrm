import React from 'react';
import { Smartphone, Battery, ShieldAlert, Check, X } from 'lucide-react';
import { calculateTradeInValuation } from '../types';

export interface OldDeviceAppraisalState {
  customerName: string;
  customerPhone: string;
  oldModel: string;
  storage: string;
  color: string;
  batteryPercent: number;
  bodyCondition: 'Keng Không Vết Xước' | 'Trầy Nhẹ Lông Mèo' | 'Cấn Móp Góc' | 'Cong Vỏ';
  screenCondition: 'Màn Zin Đẹp' | 'Màn Trầy Xước' | 'Màn Đã Ép Kính' | 'Màn Lô / Mực / Sọc';
  faceIdWorking: boolean;
  cameraWorking: boolean;
  icloudUnlocked: boolean;
  truetoneWorking: boolean;
  speakersWorking: boolean;
  basePrice: number;
  subsidyBonus: number;
}

export interface OldDeviceAppraisalPanelProps {
  state: OldDeviceAppraisalState;
  onChange: (updates: Partial<OldDeviceAppraisalState>) => void;
}

export const OldDeviceAppraisalPanel: React.FC<OldDeviceAppraisalPanelProps> = ({
  state,
  onChange
}) => {
  const valuation = calculateTradeInValuation(state.basePrice, {
    batteryPercent: state.batteryPercent,
    bodyCondition: state.bodyCondition,
    screenCondition: state.screenCondition,
    faceIdWorking: state.faceIdWorking,
    cameraWorking: state.cameraWorking,
    truetoneWorking: state.truetoneWorking,
    speakersWorking: state.speakersWorking,
    subsidyBonus: state.subsidyBonus
  });

  return (
    <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 flex flex-col h-full space-y-4 shadow-2xs">
      {/* 1. Header */}
      <div className="border-b border-zinc-100 pb-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#ff4b16] font-bold text-xs flex items-center justify-center">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
              1. Thẩm Định Máy Cũ Của Khách
            </h3>
            <p className="text-[10px] text-zinc-400">Kiểm tra ngoại hình, màn hình & chức năng</p>
          </div>
        </div>
      </div>

      {/* 2. Customer Info */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <input
          type="text"
          placeholder="Tên khách hàng (*)..."
          value={state.customerName}
          onChange={e => onChange({ customerName: e.target.value })}
          className="h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-none focus:border-[#ff4b16]"
        />
        <input
          type="tel"
          placeholder="Số điện thoại (*)..."
          value={state.customerPhone}
          onChange={e => onChange({ customerPhone: e.target.value })}
          className="h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl font-mono focus:bg-white focus:outline-none focus:border-[#ff4b16]"
        />
      </div>

      {/* 3. Old Device Spec */}
      <div className="space-y-2 text-xs">
        <div className="grid grid-cols-3 gap-2">
          <input
            type="text"
            placeholder="Dòng máy (e.g. iPhone 13)"
            value={state.oldModel}
            onChange={e => onChange({ oldModel: e.target.value })}
            className="h-9 px-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-semibold focus:border-[#ff4b16]"
          />
          <input
            type="text"
            placeholder="Dung lượng (128GB)"
            value={state.storage}
            onChange={e => onChange({ storage: e.target.value })}
            className="h-9 px-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-[#ff4b16]"
          />
          <input
            type="text"
            placeholder="Màu sắc"
            value={state.color}
            onChange={e => onChange({ color: e.target.value })}
            className="h-9 px-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-[#ff4b16]"
          />
        </div>

        {/* Battery Health Slider */}
        <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-700 flex items-center space-x-1">
              <Battery className="w-3.5 h-3.5 text-zinc-500" />
              <span>Tình Trạng Pin Thực Tế:</span>
            </span>
            <span className="font-mono font-black text-emerald-600">{state.batteryPercent}%</span>
          </div>
          <input
            type="range"
            min={60}
            max={100}
            value={state.batteryPercent}
            onChange={e => onChange({ batteryPercent: parseInt(e.target.value, 10) })}
            className="w-full accent-[#ff4b16] cursor-pointer"
          />
        </div>
      </div>

      {/* 4. Body & Screen Condition */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="space-y-1">
          <label className="font-bold text-zinc-700 block">Ngoại hình vỏ:</label>
          <select
            value={state.bodyCondition}
            onChange={e => onChange({ bodyCondition: e.target.value as any })}
            className="w-full h-9 px-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-medium focus:border-[#ff4b16]"
          >
            <option value="Keng Không Vết Xước">Keng Không Vết Xước (Chuẩn A)</option>
            <option value="Trầy Nhẹ Lông Mèo">Trầy Nhẹ Lông Mèo (-300k)</option>
            <option value="Cấn Móp Góc">Cấn Móp Góc (-800k)</option>
            <option value="Cong Vỏ">Cong Vỏ (-1.5tr)</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="font-bold text-zinc-700 block">Tình trạng màn:</label>
          <select
            value={state.screenCondition}
            onChange={e => onChange({ screenCondition: e.target.value as any })}
            className="w-full h-9 px-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-medium focus:border-[#ff4b16]"
          >
            <option value="Màn Zin Đẹp">Màn Zin Đẹp Keng</option>
            <option value="Màn Trầy Xước">Màn Trầy Xước (-400k)</option>
            <option value="Màn Đã Ép Kính">Màn Đã Ép Kính (-700k)</option>
            <option value="Màn Lô / Mực / Sọc">Màn Lô / Sọc (-2tr)</option>
          </select>
        </div>
      </div>

      {/* 5. Functional Checks */}
      <div className="space-y-1.5 text-xs">
        <span className="font-bold text-zinc-700 block">Kiểm Tra Chức Năng Cốt Lõi:</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { key: 'faceIdWorking', label: 'Face ID' },
            { key: 'cameraWorking', label: 'Camera x1/x3' },
            { key: 'truetoneWorking', label: 'TrueTone' },
            { key: 'speakersWorking', label: 'Loa & Mic' },
            { key: 'icloudUnlocked', label: 'iCloud Sạch' }
          ].map(chk => {
            const isOk = (state as any)[chk.key];

            return (
              <button
                key={chk.key}
                type="button"
                onClick={() => onChange({ [chk.key]: !isOk })}
                className={`p-2 rounded-xl border flex items-center justify-between text-[11px] font-semibold transition-all cursor-pointer ${
                  isOk
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}
              >
                <span>{chk.label}</span>
                {isOk ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-rose-600" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 6. Estimated Valuation Result Card */}
      <div className="p-3.5 bg-zinc-900 text-white rounded-2xl flex items-center justify-between mt-auto shadow-sm">
        <div>
          <span className="text-[10px] text-zinc-400 block uppercase font-bold">Giá Thu Mua Đề Xuất</span>
          <span className="text-base font-black font-mono text-[#ff4b16]">
            {valuation.estimatedValue.toLocaleString('vi-VN')}đ
          </span>
        </div>
        <div className="text-right text-[10px] text-zinc-400 font-mono">
          <span>Gốc: {(state.basePrice / 1_000_000).toFixed(1)}tr</span>
          <span className="block text-emerald-400">+Trợ giá: {(state.subsidyBonus / 1_000).toFixed(0)}k</span>
        </div>
      </div>
    </div>
  );
};
