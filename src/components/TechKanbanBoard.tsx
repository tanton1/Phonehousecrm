import React, { useState, useMemo } from 'react';
import { WarrantyTicket } from '../types';
import { KanbanSquare, Wrench, Package, ArrowRight, CheckCircle2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface TechKanbanBoardProps {
  tasks: WarrantyTicket[];
  onTaskClick: (task: WarrantyTicket) => void;
  onOpenAddTaskModal?: () => void;
}

export const TechKanbanBoard: React.FC<TechKanbanBoardProps> = ({ tasks, onTaskClick, onOpenAddTaskModal }) => {
  // Columns Definition
  const COLUMNS = [
    { id: 'TODO', title: 'Chờ Tiếp Nhận', statuses: ['received'] },
    { id: 'IN_PROGRESS', title: 'Đang Xử Lý', statuses: ['inspecting', 'repairing'] },
    { id: 'PENDING_PARTS', title: 'Chờ Linh Kiện', statuses: ['waiting_parts'] },
    { id: 'DONE', title: 'Hoàn Thành (QC)', statuses: ['ready', 'delivered'] }
  ];

  const groupedTasks = useMemo(() => {
    const groups: Record<string, WarrantyTicket[]> = {
      'TODO': [],
      'IN_PROGRESS': [],
      'PENDING_PARTS': [],
      'DONE': []
    };

    tasks.forEach(task => {
      if (COLUMNS[0].statuses.includes(task.status)) groups['TODO'].push(task);
      else if (COLUMNS[1].statuses.includes(task.status)) groups['IN_PROGRESS'].push(task);
      else if (COLUMNS[2].statuses.includes(task.status)) groups['PENDING_PARTS'].push(task);
      else if (COLUMNS[3].statuses.includes(task.status)) groups['DONE'].push(task);
      else groups['TODO'].push(task); // fallback
    });

    return groups;
  }, [tasks]);

  const handleStatusChange = async (taskId: string, newStatus: WarrantyTicket['status']) => {
    try {
      const taskRef = doc(db, 'warrantyTickets', taskId);
      await updateDoc(taskRef, { status: newStatus });
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const getStatusAction = (columnId: string, task: WarrantyTicket) => {
    switch (columnId) {
      case 'TODO':
        return (
          <button 
            onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, 'inspecting'); }}
            className="w-full mt-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-semibold rounded hover:bg-blue-100 flex items-center justify-center transition-colors"
          >
            <Wrench className="w-3.5 h-3.5 mr-1" />
            Nhận Xử Lý
          </button>
        );
      case 'IN_PROGRESS':
        return (
          <div className="flex space-x-2 mt-3">
            <button 
              onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, 'waiting_parts'); }}
              className="flex-1 py-1.5 bg-amber-50 text-amber-600 text-xs font-semibold rounded hover:bg-amber-100 flex items-center justify-center transition-colors"
            >
              <Package className="w-3.5 h-3.5 mr-1" />
              Chờ LK
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, 'ready'); }}
              className="flex-1 py-1.5 bg-emerald-50 text-emerald-600 text-xs font-semibold rounded hover:bg-emerald-100 flex items-center justify-center transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Xong
            </button>
          </div>
        );
      case 'PENDING_PARTS':
        return (
          <button 
            onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, 'repairing'); }}
            className="w-full mt-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-semibold rounded hover:bg-blue-100 flex items-center justify-center transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5 mr-1" />
            Tiếp Tục
          </button>
        );
      case 'DONE':
        return (
          <div className="mt-3 text-center text-xs font-medium text-zinc-400">
            {task.status === 'delivered' ? 'Đã giao khách' : 'Chờ giao khách'}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      {onOpenAddTaskModal && (
        <div className="px-4 pt-3 pb-1 flex justify-between items-center bg-white border-b border-zinc-200">
          <div className="text-xs text-zinc-500 font-medium">
            Bảng điều phối kỹ thuật viên & theo dõi tiến độ sửa chữa
          </div>
          <button
            onClick={onOpenAddTaskModal}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
          >
            <span>+ Phân Công Task Hoa Hồng KTV</span>
          </button>
        </div>
      )}

      <div className="flex-1 flex w-full overflow-x-auto gap-4 p-4 min-h-[500px]">
        {COLUMNS.map(col => (
          <div key={col.id} className="flex-1 min-w-[280px] flex flex-col bg-zinc-100/50 rounded-xl border border-zinc-200">
            {/* Column Header */}
            <div className="p-3 border-b border-zinc-200 bg-white/50 flex items-center justify-between rounded-t-xl">
              <h3 className="text-sm font-semibold text-zinc-700 flex items-center">
                {col.id === 'TODO' && <KanbanSquare className="w-4 h-4 mr-2 text-zinc-500" />}
                {col.id === 'IN_PROGRESS' && <Wrench className="w-4 h-4 mr-2 text-blue-500" />}
                {col.id === 'PENDING_PARTS' && <Package className="w-4 h-4 mr-2 text-amber-500" />}
                {col.id === 'DONE' && <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500" />}
                {col.title}
              </h3>
              <span className="bg-zinc-200 text-zinc-600 text-xs px-2 py-0.5 rounded-full font-medium">
                {groupedTasks[col.id].length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 p-3 overflow-y-auto space-y-3">
              {groupedTasks[col.id].map(task => (
                <div 
                  key={task.id} 
                  onClick={() => onTaskClick(task)}
                  className="bg-white p-3 rounded-lg border border-zinc-200 shadow-sm cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {task.ticketNumber}
                    </span>
                    <span className="text-[10px] font-medium text-zinc-400">
                      {task.receivedDate}
                    </span>
                  </div>
                  
                  <h4 className="text-sm font-bold text-zinc-800 mb-1 leading-tight">
                    {task.model}
                  </h4>
                  
                  <div className="text-xs text-zinc-500 mb-2 line-clamp-2">
                    <span className="font-semibold text-zinc-600">Lỗi: </span> 
                    {task.faultDescription}
                  </div>

                  {Boolean(task.commissionAmount) && (
                    <div className="my-2 p-1.5 bg-amber-50 rounded-lg border border-amber-200/60 flex items-center justify-between text-[11px] font-bold text-amber-800">
                      <span>💰 Hoa hồng KTV:</span>
                      <span className="font-mono text-xs">{task.commissionAmount?.toLocaleString('vi-VN')} đ</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100">
                    <div className="text-xs text-zinc-500">
                      KTV: <span className="font-semibold text-zinc-700">{task.technician || 'Chưa nhận'}</span>
                    </div>
                    {task.taskType === 'INBOUND_QC' ? (
                      <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                        QC Nhập
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                        Sửa Chữa
                      </span>
                    )}
                  </div>

                  {/* Status Action Buttons */}
                  {getStatusAction(col.id, task)}
                </div>
              ))}
              
              {groupedTasks[col.id].length === 0 && (
                <div className="h-full flex items-center justify-center text-xs text-zinc-400 italic py-8">
                  Trống
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
