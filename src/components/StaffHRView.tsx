import React, { useState } from 'react';
import { Clock, Calendar, CheckCircle, FileText, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';
import { UserAccount } from '../types';

interface StaffHRViewProps {
  currentUser?: UserAccount | null;
  roleType: 'SALES' | 'TECH';
  onCheckIn?: (time: string) => void;
  onCheckOut?: (time: string) => void;
  checkedInState?: boolean;
  initialCheckInTime?: string | null;
}

export const StaffHRView: React.FC<StaffHRViewProps> = ({ currentUser, roleType, onCheckIn, onCheckOut, checkedInState = false, initialCheckInTime = null }) => {
  const [isCheckedIn, setIsCheckedIn] = useState(checkedInState);
  const [checkInTime, setCheckInTime] = useState<string | null>(initialCheckInTime);

  // Sync state if props change
  React.useEffect(() => {
    setIsCheckedIn(checkedInState);
    setCheckInTime(initialCheckInTime);
  }, [checkedInState, initialCheckInTime]);

  const handleCheckIn = () => {
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    if (isCheckedIn) {
      setIsCheckedIn(false);
      // We don't nullify checkInTime locally so they can see when they checked in, or just keep it simple
      if (onCheckOut) onCheckOut(timeString);
    } else {
      setIsCheckedIn(true);
      setCheckInTime(timeString);
      if (onCheckIn) onCheckIn(timeString);
    }
  };

  const roleName = roleType === 'SALES' ? 'Nhân Viên Bán Hàng' : 'Kỹ Thuật Viên';
  const roleColor = roleType === 'SALES' ? 'text-orange-600 bg-orange-100' : 'text-indigo-600 bg-indigo-100';
  const btnColor = roleType === 'SALES' ? 'bg-[#FF4B16] hover:bg-orange-600' : 'bg-indigo-600 hover:bg-indigo-700';

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6 animate-fadeIn pb-24">
      {/* HEADER INFO */}
      <div className="bg-white rounded-3xl p-6 shadow-xl shadow-zinc-200/40 border border-zinc-200/60 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center font-black text-2xl text-zinc-400 overflow-hidden shrink-0">
          {currentUser?.avatarUrl ? (
            <img src={currentUser.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            currentUser?.displayName?.charAt(0) || 'U'
          )}
        </div>
        <div>
          <h2 className="text-xl font-black text-zinc-900">{currentUser?.displayName || 'Nhân Viên'}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${roleColor}`}>
              {roleName}
            </span>
            <span className="text-[10px] font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
              Chi nhánh: {currentUser?.branchId || 'Mặc định'}
            </span>
          </div>
        </div>
      </div>

      {/* CHECK-IN CARD */}
      <div className="bg-white rounded-3xl p-6 shadow-xl shadow-zinc-200/40 border border-zinc-200/60 text-center">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-6">Chấm công hôm nay</h3>
        
        <div className="flex justify-center mb-6">
          <div className={`w-40 h-40 rounded-full flex flex-col items-center justify-center border-[8px] transition-all duration-500 ${isCheckedIn ? 'border-emerald-400 bg-emerald-50' : 'border-zinc-100 bg-zinc-50'}`}>
            <Clock className={`w-10 h-10 mb-2 ${isCheckedIn ? 'text-emerald-500' : 'text-zinc-300'}`} />
            <div className="text-3xl font-black text-zinc-900">
              {isCheckedIn ? checkInTime : '--:--'}
            </div>
            <div className={`text-xs font-bold mt-1 ${isCheckedIn ? 'text-emerald-600' : 'text-zinc-400'}`}>
              {isCheckedIn ? 'Đã Vào Ca' : 'Chưa Vào Ca'}
            </div>
          </div>
        </div>

        <button 
          onClick={handleCheckIn}
          className={`w-full max-w-xs mx-auto py-4 rounded-2xl font-black text-white shadow-lg transition-transform hover:scale-105 active:scale-95 ${isCheckedIn ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' : `${btnColor} shadow-current/30`}`}
        >
          {isCheckedIn ? 'Check-out (Kết thúc ca)' : 'Check-in (Vào ca)'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* SHIFTS */}
        <div className="bg-white rounded-3xl p-5 shadow-xl shadow-zinc-200/40 border border-zinc-200/60">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-blue-500" />
            <h3 className="font-bold text-zinc-900">Lịch làm việc tuần này</h3>
          </div>
          <div className="space-y-3">
            {[
              { day: 'Thứ 2 (Hôm nay)', shift: 'Ca Sáng (08:00 - 15:00)', active: true },
              { day: 'Thứ 3', shift: 'Ca Chiều (14:30 - 21:30)', active: false },
              { day: 'Thứ 4', shift: 'Ca Sáng (08:00 - 15:00)', active: false },
            ].map((s, i) => (
              <div key={i} className={`flex justify-between items-center p-3 rounded-xl border ${s.active ? 'border-blue-200 bg-blue-50' : 'border-zinc-100 bg-zinc-50'}`}>
                <div className="text-sm">
                  <div className={`font-bold ${s.active ? 'text-blue-700' : 'text-zinc-700'}`}>{s.day}</div>
                  <div className={`text-xs ${s.active ? 'text-blue-600' : 'text-zinc-500'}`}>{s.shift}</div>
                </div>
                {s.active && <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>}
              </div>
            ))}
          </div>
        </div>

        {/* LEAVE REQUEST */}
        <div className="bg-white rounded-3xl p-5 shadow-xl shadow-zinc-200/40 border border-zinc-200/60">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-zinc-900">Đơn từ / Nghỉ phép</h3>
          </div>
          <button className="w-full py-3 mb-4 rounded-xl border-2 border-dashed border-zinc-200 text-zinc-500 font-bold hover:bg-zinc-50 hover:border-zinc-300 transition-colors text-sm">
            + Tạo đơn xin nghỉ phép
          </button>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50">
              <div>
                <div className="text-sm font-bold text-zinc-700">Nghỉ ốm (1 ngày)</div>
                <div className="text-xs text-zinc-500">12/08/2026</div>
              </div>
              <div className="flex items-center gap-1 text-emerald-600 bg-emerald-100 px-2 py-1 rounded-lg text-[10px] font-bold">
                <CheckCircle2 className="w-3 h-3" /> Đã duyệt
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
