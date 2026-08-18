import React, { useState } from 'react';
import { StoreBranch, StaffMember } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { Sun, Moon, CheckCircle2, ShieldCheck, Camera, FileCheck, AlertCircle } from 'lucide-react';

export interface SopItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  requiredPhoto?: boolean;
}

export interface ShiftSopChecklistCardProps {
  branch: StoreBranch;
  currentUser?: StaffMember | null;
  onSaveSopSubmission?: (shiftType: 'OPENING' | 'CLOSING', completedItems: string[], notes: string) => void;
}

const DEFAULT_OPENING_ITEMS: SopItem[] = [
  { id: 'op-1', title: 'Kiểm đếm két tiền đầu ca', description: 'Kiểm tra đủ tiền mặt lẻ thối đầu ca khớp với số dư bàn giao tối hôm trước.', completed: false },
  { id: 'op-2', title: 'Mở nguồn hệ thống tủ máy trưng bày', description: 'Bật nguồn các máy demo iPhone 15/16 Pro Max, cắm sạc đầy đủ.', completed: false },
  { id: 'op-3', title: 'Vệ sinh không gian showroom', description: 'Lau sạch mặt kính tủ trưng bày, bàn tư vấn và sàn nhà sạch sẽ.', completed: false },
  { id: 'op-4', title: 'Hệ thống âm thanh & ánh sáng', description: 'Bật nhạc nền PhoneHouse âm lượng vừa phải, bật hệ thống đèn chiếu sáng.', completed: false },
  { id: 'op-5', title: 'Kiểm tra camera an ninh', description: 'Đảm bảo camera quay két tiền, quầy thu ngân và cửa ra vào hoạt động tốt.', completed: false, requiredPhoto: true }
];

const DEFAULT_CLOSING_ITEMS: SopItem[] = [
  { id: 'cl-1', title: 'Đối soát két tiền & hóa đơn POS', description: 'Kiểm đếm tổng tiền mặt khớp với Báo cáo Doanh thu POS cuối ngày.', completed: false },
  { id: 'cl-2', title: 'Cất máy trưng bày vào két an toàn', description: 'Toàn bộ máy mẫu đắt tiền được cất vào két sắt khóa bảo mật.', completed: false },
  { id: 'cl-3', title: 'Tắt điều hòa & ngắt điện phụ', description: 'Tắt toàn bộ điều hòa, biển quảng cáo, giữ nguồn cho camera & server.', completed: false },
  { id: 'cl-4', title: 'Khóa cửa & kích hoạt báo động', description: 'Khóa cửa cuốn, khóa cửa kính và bật hệ thống báo động chống trộm.', completed: false, requiredPhoto: true }
];

export const ShiftSopChecklistCard: React.FC<ShiftSopChecklistCardProps> = ({
  branch,
  currentUser,
  onSaveSopSubmission
}) => {
  const [shiftType, setShiftType] = useState<'OPENING' | 'CLOSING'>('OPENING');
  const [items, setItems] = useState<SopItem[]>(DEFAULT_OPENING_ITEMS);
  const [notes, setNotes] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSwitchShift = (type: 'OPENING' | 'CLOSING') => {
    setShiftType(type);
    setItems(type === 'OPENING' ? DEFAULT_OPENING_ITEMS : DEFAULT_CLOSING_ITEMS);
    setIsSubmitted(false);
  };

  const handleToggleItem = (id: string) => {
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  };

  const completedCount = items.filter(i => i.completed).length;
  const isAllCompleted = completedCount === items.length;
  const progressPercent = Math.round((completedCount / items.length) * 100);

  const handleSubmit = () => {
    if (!isAllCompleted) {
      alert('Vui lòng hoàn thành đầy đủ tất cả các bước SOP trước khi bàn giao ca.');
      return;
    }

    if (onSaveSopSubmission) {
      onSaveSopSubmission(
        shiftType,
        items.map(i => i.id),
        notes
      );
    }
    setIsSubmitted(true);
  };

  return (
    <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4 max-w-xl mx-auto">
      {/* 1. Shift Selector Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#ff4b16] font-bold text-xs flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
              Quy Trình Tiêu Chuẩn SOP Ca Làm Việc
            </h3>
            <p className="text-[10px] text-zinc-400">Chi nhánh: {branch.name}</p>
          </div>
        </div>

        {/* Toggle Shift Buttons */}
        <div className="flex items-center bg-zinc-100 p-1 rounded-xl text-xs font-bold">
          <button
            onClick={() => handleSwitchShift('OPENING')}
            className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer ${
              shiftType === 'OPENING' ? 'bg-amber-500 text-white shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>Mở Ca Sáng</span>
          </button>
          <button
            onClick={() => handleSwitchShift('CLOSING')}
            className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer ${
              shiftType === 'CLOSING' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
            <span>Đóng Ca Tối</span>
          </button>
        </div>
      </div>

      {/* 2. Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-zinc-700">Tiến Độ Hoàn Thành SOP:</span>
          <span className="font-mono font-bold text-[#ff4b16]">
            {completedCount}/{items.length} Bước ({progressPercent}%)
          </span>
        </div>
        <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isAllCompleted ? 'bg-emerald-500' : 'bg-[#ff4b16]'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 3. SOP Items Checklist */}
      <div className="space-y-2.5">
        {items.map(item => (
          <div
            key={item.id}
            onClick={() => handleToggleItem(item.id)}
            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start space-x-3 select-none ${
              item.completed
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : 'bg-zinc-50 border-zinc-200/80 hover:border-zinc-300'
            }`}
          >
            <div className="pt-0.5">
              <input
                type="checkbox"
                checked={item.completed}
                onChange={() => {}} // Handled by container click
                className="w-4 h-4 rounded text-[#ff4b16] accent-[#ff4b16] cursor-pointer"
              />
            </div>
            <div className="flex-1 min-w-0 text-xs">
              <div className="flex items-center space-x-2">
                <h4 className="font-bold text-zinc-900">{item.title}</h4>
                {item.requiredPhoto && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-orange-100 text-[#ff4b16] flex items-center space-x-0.5">
                    <Camera className="w-2.5 h-2.5" />
                    <span>Cần ảnh</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{item.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 4. Notes input */}
      <div className="space-y-1 text-xs">
        <label className="font-bold text-zinc-700 block">Ghi Chú Bàn Giao Ca (Nếu có):</label>
        <textarea
          rows={2}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Khách hẹn chiều lấy 1 cây 15 Pro Max, máy demo 1 cây pin yếu..."
          className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl resize-none text-xs focus:outline-none focus:border-[#ff4b16]"
        />
      </div>

      {/* 5. Submit Action */}
      <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
        <span className="text-[11px] text-zinc-500">
          Nhân sự ký duyệt: <strong className="text-zinc-800">{currentUser?.displayName || 'Trưởng Ca'}</strong>
        </span>

        <Button
          variant={isAllCompleted ? 'primary' : 'outline'}
          size="md"
          disabled={!isAllCompleted || isSubmitted}
          onClick={handleSubmit}
          leftIcon={<CheckCircle2 className="w-4 h-4" />}
        >
          {isSubmitted ? 'Đã Bàn Giao Xong' : 'Xác Nhận & Bàn Giao Ca'}
        </Button>
      </div>
    </div>
  );
};
