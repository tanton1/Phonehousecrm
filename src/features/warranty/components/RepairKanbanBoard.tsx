import React, { useState } from 'react';
import { WarrantyTicket, StoreBranch, StaffMember } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { 
  Wrench, 
  Plus, 
  Phone, 
  Smartphone, 
  Lock, 
  ShieldCheck, 
  User, 
  Clock, 
  DollarSign,
  ChevronRight,
  Filter
} from 'lucide-react';

export interface RepairKanbanBoardProps {
  tickets: WarrantyTicket[];
  branches: StoreBranch[];
  selectedBranchId?: string;
  onSelectTicket: (ticket: WarrantyTicket) => void;
  onOpenCreateModal: () => void;
}

const STAGES: { id: WarrantyTicket['status']; label: string; color: string; badgeBg: string }[] = [
  { id: 'received', label: '1. Tiếp Nhận', color: 'border-blue-500', badgeBg: 'bg-blue-50 text-blue-700' },
  { id: 'inspecting', label: '2. Thẩm Định & Báo Giá', color: 'border-purple-500', badgeBg: 'bg-purple-50 text-purple-700' },
  { id: 'waiting_parts', label: '3. Chờ Linh Kiện', color: 'border-amber-500', badgeBg: 'bg-amber-50 text-amber-700' },
  { id: 'repairing', label: '4. Đang Sửa Chữa', color: 'border-orange-500', badgeBg: 'bg-orange-50 text-orange-700' },
  { id: 'ready', label: '5. Sửa Xong KCS (Chờ Giao)', color: 'border-emerald-500', badgeBg: 'bg-emerald-50 text-emerald-700' },
  { id: 'delivered', label: '6. Đã Giao Khách', color: 'border-zinc-500', badgeBg: 'bg-zinc-100 text-zinc-700' }
];

export const RepairKanbanBoard: React.FC<RepairKanbanBoardProps> = ({
  tickets,
  branches,
  selectedBranchId,
  onSelectTicket,
  onOpenCreateModal
}) => {
  const [issueFilter, setIssueFilter] = useState('ALL');
  const [selectedMobileStage, setSelectedMobileStage] = useState<string>('ALL');

  const filteredTickets = tickets.filter(t => {
    const matchBranch = !selectedBranchId || selectedBranchId === 'ALL' || !t.branchId || t.branchId === selectedBranchId;
    const matchIssue = issueFilter === 'ALL' || t.issueType === issueFilter;
    return matchBranch && matchIssue;
  });

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p className="font-black uppercase tracking-wide">Phiếu sửa cũ · chỉ để tra cứu</p>
        <p className="mt-1">Trang này không nhận phiếu mới và không xử lý công việc. Phiếu mới sau khi tiếp nhận sẽ chuyển thẳng vào <strong>Kanban kỹ thuật &amp; KCS</strong> trong Bàn kỹ thuật; KTV chỉ thao tác ở đó.</p>
      </div>
      {/* 1. Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#ff4b16] flex items-center justify-center font-bold">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
              Phiếu sửa cũ (lưu trữ) · {tickets.length} phiếu
            </h3>
            <p className="text-[11px] text-zinc-500">Theo dõi tiến độ sửa chữa từ tiếp nhận đến bàn giao khách</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={issueFilter}
            onChange={e => setIssueFilter(e.target.value)}
            className="h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 focus:outline-none focus:border-[#ff4b16]"
          >
            <option value="ALL">Tất Cả Loại Bệnh</option>
            <option value="Pin / Phù Pin">Pin / Chai Pin</option>
            <option value="Màn Hình / Cảm Ứng">Màn Hình</option>
            <option value="Ép Kính / Thay Lưng">Ép Kính</option>
            <option value="Nguồn / Mất Nguồn">Mất Nguồn</option>
            <option value="Face ID / Camera">Face ID</option>
            <option value="Mainboard / IC Sạc">Mainboard</option>
          </select>

          <Button
            variant="primary"
            size="sm"
            onClick={onOpenCreateModal}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Tiếp Nhận Máy
          </Button>
        </div>
      </div>

      {/* 2. Mobile Stage Tabs (lg:hidden) */}
      <div className="lg:hidden flex space-x-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedMobileStage('ALL')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            selectedMobileStage === 'ALL'
              ? 'bg-[#ff4b16] text-white shadow-xs'
              : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          Tất Cả ({filteredTickets.length})
        </button>
        {STAGES.map(stage => {
          const count = filteredTickets.filter(t => t.status === stage.id).length;
          return (
            <button
              key={stage.id}
              onClick={() => setSelectedMobileStage(stage.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
                selectedMobileStage === stage.id
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              <span>{stage.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                selectedMobileStage === stage.id ? 'bg-zinc-700 text-white' : 'bg-zinc-100 text-zinc-600'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Horizontal / Filtered Kanban Columns */}
      <div className="flex space-x-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-200 items-start min-h-[550px]">
        {STAGES.filter(stage => selectedMobileStage === 'ALL' || selectedMobileStage === stage.id).map(stage => {
          const stageTickets = filteredTickets.filter(t => t.status === stage.id);

          return (
            <div
              key={stage.id}
              className={`shrink-0 bg-zinc-100/70 border border-zinc-200/80 rounded-2xl p-3 flex flex-col max-h-[75vh] ${
                selectedMobileStage !== 'ALL' ? 'w-full' : 'w-72'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-200/80">
                <div className="flex items-center space-x-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full border-2 ${stage.color} bg-white`} />
                  <h4 className="text-xs font-bold text-zinc-800 truncate">{stage.label}</h4>
                </div>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-white text-zinc-600 border border-zinc-200">
                  {stageTickets.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin scrollbar-thumb-zinc-200">
                {stageTickets.length === 0 ? (
                  <div className="p-4 text-center text-zinc-400 text-[11px] italic">
                    Không có phiếu sửa chữa
                  </div>
                ) : (
                  stageTickets.map(ticket => {
                    return (
                      <div
                        key={ticket.id}
                        onClick={() => onSelectTicket(ticket)}
                        className="p-3 bg-white border border-zinc-200/80 hover:border-zinc-300 rounded-xl shadow-2xs hover:shadow-sm transition-all cursor-pointer space-y-2 select-none group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[#ff4b16] text-xs">{ticket.ticketNumber}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                            ticket.isWarrantyFree ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-[#ff4b16]'
                          }`}>
                            {ticket.isWarrantyFree ? 'BẢO HÀNH 0Đ' : 'SỬA DỊCH VỤ'}
                          </span>
                        </div>
                        <div>
                          <h5 className="font-bold text-zinc-900 text-xs">{ticket.model}</h5>
                          <div className="flex items-center space-x-1 text-[11px] text-zinc-500 font-mono mt-0.5">
                            <span>{ticket.customerName}</span>
                            <span>•</span>
                            <span>{ticket.phone}</span>
                          </div>
                        </div>

                        {/* Fault description */}
                        <div className="p-2 bg-zinc-50 rounded-lg text-[11px] text-zinc-700 font-medium">
                          <span className="text-[#ff4b16] font-bold block mb-0.5">[{ticket.issueType}]</span>
                          <p className="line-clamp-2 text-zinc-600">{ticket.faultDescription}</p>
                        </div>

                        {/* Legacy records are intentionally read-only. */}
                        <div className="pt-1.5 border-t border-zinc-100 flex items-center justify-between text-[10px]">
                          <div className="flex items-center space-x-1 text-zinc-500">
                            <User className="w-3 h-3 text-zinc-400" />
                            <span>KTV: <strong className="text-zinc-700">{ticket.technician || 'Chưa gán'}</strong></span>
                          </div>
                          <span className="rounded-md bg-zinc-100 px-2 py-1 font-bold text-zinc-500">Chỉ xem</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
