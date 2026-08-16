import React, { useState } from 'react';
import { 
  Wrench, Package, Search, Bell, CheckCircle2, 
  Activity, Zap, Clock, Smartphone
} from 'lucide-react';
import { TechKanbanBoard } from './TechKanbanBoard';
import { StaffHRView } from './StaffHRView';
import { UserAccount, WarrantyTicket, DeviceItem } from '../types';

interface TechWorkspaceViewProps {
  tasks: WarrantyTicket[];
  devices: DeviceItem[];
  currentUser?: UserAccount | null;
  onCheckIn?: (time: string) => void;
  onCheckOut?: (time: string) => void;
  attendanceRecord?: import('../types').AttendanceRecord;
}

export const TechWorkspaceView: React.FC<TechWorkspaceViewProps> = ({ tasks, devices, currentUser , onCheckIn, onCheckOut, attendanceRecord }) => {

  // KPI Calculations
  const techTasks = tasks.filter(t => t.technician === currentUser?.displayName || t.assigneeId === currentUser?.id);
  const kcsTasks = techTasks.filter(t => t.taskType === 'INBOUND_QC');
  const repairTasks = techTasks.filter(t => t.taskType !== 'INBOUND_QC');
  
  const kcsCommission = kcsTasks.reduce((acc, t) => acc + (t.commissionAmount || 25000), 0);
  const repairCommission = repairTasks.reduce((acc, t) => acc + (t.commissionAmount || 150000), 0);
  const totalCommission = kcsCommission + repairCommission;

  const [activeTab, setActiveTab] = useState<'KANBAN' | 'INVENTORY' | 'KPI' | 'HR'>('KANBAN');

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col font-sans">
      {/* TECH TOPBAR */}
      <div className="bg-indigo-900 text-white p-3 sm:px-6 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-800 rounded-xl flex items-center justify-center border border-indigo-700/50">
            <Wrench className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-wider text-indigo-100">Tech Station</h1>
            <div className="text-[10px] text-indigo-300 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Đang trong ca làm việc
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-4 mr-4 text-xs font-medium text-indigo-200">
            <div className="flex items-center gap-1.5"><Activity className="w-4 h-4 text-emerald-400"/> Hôm nay: 4 máy xong</div>
            <div className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-400"/> Tạm tính: 450.000 đ</div>
          </div>
          <button className="relative w-8 h-8 rounded-full bg-indigo-800 hover:bg-indigo-700 flex items-center justify-center transition-colors">
            <Bell className="w-4 h-4 text-indigo-200" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-indigo-900"></span>
          </button>
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-xs shadow-inner">
            TA
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden pb-16">
        {/* MAIN CONTENT AREA */}
        <div className="flex-1 overflow-auto bg-zinc-50/50 p-4">
          {activeTab === 'KANBAN' && (
            <div className="h-full flex flex-col">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black text-zinc-900">Kanban Board</h2>
                <div className="flex gap-2">
                  <div className="px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-600 flex items-center gap-2 shadow-2xs">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    SLA: 2 máy sắp trễ
                  </div>
                </div>
              </div>
              <div className="flex-1 min-h-0 bg-white rounded-2xl shadow-2xs border border-zinc-200/80 overflow-hidden">
                <TechKanbanBoard 
                  tasks={tasks}
                  onTaskClick={(t) => console.log('View task', t)}
                />
              </div>
            </div>
          )}

          {activeTab === 'KPI' && (
            <div className="max-w-4xl mx-auto space-y-4 animate-fadeIn">
              <h2 className="text-lg font-black text-zinc-900 mb-4">Ví Hoa Hồng Khóa Sổ Hôm Nay</h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
                  <div className="text-indigo-200 text-xs font-bold uppercase mb-1">Thực lãnh tạm tính</div>
                  <div className="text-3xl font-black">{totalCommission.toLocaleString()} đ</div>
                  <div className="mt-4 text-xs font-medium bg-white/20 inline-block px-2.5 py-1 rounded-full">
                    Ghi nhận từ {techTasks.length} task
                  </div>
                </div>
                
                <div className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-2xs">
                  <div className="flex items-center gap-2 text-blue-600 mb-2">
                    <Smartphone className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase">Kiểm định KCS</span>
                  </div>
                  <div className="text-2xl font-black text-zinc-900">{kcsTasks.length} máy</div>
                  <div className="text-sm font-semibold text-zinc-500 mt-1">~ {kcsCommission.toLocaleString()} đ</div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-2xs">
                  <div className="flex items-center gap-2 text-amber-600 mb-2">
                    <Wrench className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase">Sửa chữa / Thay thế</span>
                  </div>
                  <div className="text-2xl font-black text-zinc-900">{repairTasks.length} máy</div>
                  <div className="text-sm font-semibold text-zinc-500 mt-1">~ {repairCommission.toLocaleString()} đ</div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs p-4">
                <h3 className="font-bold text-sm text-zinc-900 mb-3">Lịch sử task hoàn thành</h3>
                <div className="space-y-2">
                  {techTasks.length === 0 && (
                    <div className="p-4 text-center text-zinc-500 text-sm">Chưa có dữ liệu task hoàn thành</div>
                  )}
                  {techTasks.map(t => (
                    <div key={t.id} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl text-sm">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${t.taskType === 'INBOUND_QC' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                          {t.taskType === 'INBOUND_QC' ? <Smartphone className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="font-bold text-zinc-900">{t.taskType === 'INBOUND_QC' ? 'KCS' : 'Sửa chữa'} {t.model}</div>
                          <div className="text-[10px] text-zinc-500">{t.ticketNumber}</div>
                        </div>
                      </div>
                      <div className={`font-black ${t.taskType === 'INBOUND_QC' ? 'text-blue-600' : 'text-amber-600'}`}>
                        +{(t.commissionAmount || (t.taskType === 'INBOUND_QC' ? 25000 : 150000)).toLocaleString()} đ
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'INVENTORY' && (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 space-y-4">
              <Package className="w-16 h-16 text-zinc-200" />
              <p className="font-medium text-sm">Kho linh kiện đang được đồng bộ ERP...</p>
            </div>
          )}
          
          {activeTab === 'HR' && (
            <div className="h-full bg-white rounded-2xl shadow-2xs border border-zinc-200/80 overflow-hidden">
              <StaffHRView 
                currentUser={currentUser} 
                roleType='TECH' 
                onCheckIn={onCheckIn}
                onCheckOut={onCheckOut}
                checkedInState={!!attendanceRecord?.checkInTime && !attendanceRecord?.checkOutTime}
                initialCheckInTime={attendanceRecord?.checkInTime || null}
              />
            </div>
          )}
        </div>
      </div>
      
      {/* BOTTOM TAB BAR */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-zinc-200 flex items-center justify-around z-40 px-2 pb-safe">
        <button 
          onClick={() => setActiveTab('KANBAN')}
          className={`flex flex-col items-center justify-center w-20 h-full gap-1 transition-all ${activeTab === 'KANBAN' ? 'text-indigo-600' : 'text-zinc-400'}`}
        >
          <CheckCircle2 className={`w-5 h-5 ${activeTab === 'KANBAN' ? 'scale-110' : ''}`} />
          <span className="text-[10px] font-bold">Kanban</span>
        </button>
        <button 
          onClick={() => setActiveTab('INVENTORY')}
          className={`flex flex-col items-center justify-center w-20 h-full gap-1 transition-all ${activeTab === 'INVENTORY' ? 'text-indigo-600' : 'text-zinc-400'}`}
        >
          <Package className={`w-5 h-5 ${activeTab === 'INVENTORY' ? 'scale-110' : ''}`} />
          <span className="text-[10px] font-bold">Kho Phụ Kiện</span>
        </button>
        <button 
          onClick={() => setActiveTab('KPI')}
          className={`flex flex-col items-center justify-center w-20 h-full gap-1 transition-all ${activeTab === 'KPI' ? 'text-indigo-600' : 'text-zinc-400'}`}
        >
          <Zap className={`w-5 h-5 ${activeTab === 'KPI' ? 'scale-110' : ''}`} />
          <span className="text-[10px] font-bold">Ví Hoa Hồng</span>
        </button>
        <button 
          onClick={() => setActiveTab('HR')}
          className={`flex flex-col items-center justify-center w-20 h-full gap-1 transition-all ${activeTab === 'HR' ? 'text-indigo-600' : 'text-zinc-400'}`}
        >
          <Activity className={`w-5 h-5 ${activeTab === 'HR' ? 'scale-110' : ''}`} />
          <span className="text-[10px] font-bold">Nhân Sự</span>
        </button>
      </div>
    </div>
  );
};
