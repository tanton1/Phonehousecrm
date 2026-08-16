import React, { useMemo, useState } from 'react';
import { WarrantyTicket, UserAccount } from '../types';
import { UserCheck, DollarSign, Wrench, CheckCircle2, TrendingUp, Search, Calendar, Clock } from 'lucide-react';

interface TechKPIReportProps {
  tickets: WarrantyTicket[];
  users: UserAccount[];
  onOpenAddTaskModal?: () => void;
}

interface TechStats {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  totalTickets: number;
  completedTickets: number;
  pendingTickets: number;
  totalCommission: number;
  qcCount: number;
  repairCount: number;
}

export const TechKPIReport: React.FC<TechKPIReportProps> = ({ tickets, users, onOpenAddTaskModal }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTech, setSelectedTech] = useState<TechStats | null>(null);

  // Filter technicians
  const technicians = useMemo(() => {
    return users.filter(u => u.role === 'TECHNICIAN' || u.role === 'ADMIN' || u.role === 'MANAGER');
  }, [users]);

  // Calculate stats per technician
  const techStats = useMemo(() => {
    const statsMap: Record<string, TechStats> = {};

    // Initialize map
    technicians.forEach(tech => {
      statsMap[tech.email] = { // Using email as ID for assigneeId mapping (since assigneeId is email in initialData)
        userId: tech.id,
        displayName: tech.displayName,
        email: tech.email,
        role: tech.role,
        totalTickets: 0,
        completedTickets: 0,
        pendingTickets: 0,
        totalCommission: 0,
        qcCount: 0,
        repairCount: 0
      };
    });

    tickets.forEach(ticket => {
      // Find who this ticket is assigned to
      // assigneeId might be an email, let's check against email or id
      const techKey = ticket.assigneeId || '';
      
      let stat = statsMap[techKey];
      
      // Fallback: match by technician name if assigneeId isn't an email
      if (!stat && ticket.technician) {
        const found = Object.values(statsMap).find(t => t.displayName.includes(ticket.technician) || ticket.technician.includes(t.displayName));
        if (found) stat = statsMap[found.email];
      }

      if (stat) {
        stat.totalTickets++;
        
        if (ticket.status === 'ready' || ticket.status === 'delivered') {
          stat.completedTickets++;
          stat.totalCommission += (ticket.commissionAmount || 0);
        } else {
          stat.pendingTickets++;
        }

        if (ticket.taskType === 'INBOUND_QC') {
          stat.qcCount++;
        } else {
          stat.repairCount++;
        }
      }
    });

    // Convert to array and filter out those with 0 tickets (optional, but let's keep all techs)
    return Object.values(statsMap)
      .filter(s => s.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || s.email.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => b.totalCommission - a.totalCommission); // Sort by highest commission

  }, [tickets, technicians, searchTerm]);

  // Selected tech's tickets
  const selectedTechTickets = useMemo(() => {
    if (!selectedTech) return [];
    return tickets.filter(t => 
      t.assigneeId === selectedTech.email || 
      (t.technician && (selectedTech.displayName.includes(t.technician) || t.technician.includes(selectedTech.displayName)))
    ).sort((a, b) => new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime());
  }, [selectedTech, tickets]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50/50">
      <div className="p-4 border-b border-zinc-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-800 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-indigo-500" />
            Báo Cáo Hoa Hồng Kỹ Thuật
          </h2>
          <p className="text-sm text-zinc-500">Tổng hợp KPI, Phiếu sửa chữa & Lương hiệu suất</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {onOpenAddTaskModal && (
            <button
              onClick={onOpenAddTaskModal}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              + Phân Công Task KTV
            </button>
          )}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm kỹ thuật viên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full sm:w-64"
            />
          </div>
          <button className="px-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-600 hover:bg-zinc-50 flex items-center">
            <Calendar className="w-4 h-4 mr-2" />
            Tháng Này
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* Left Panel: Tech List */}
        <div className="w-full lg:w-1/2 xl:w-2/5 border-r border-zinc-200 bg-white overflow-y-auto">
          <div className="p-4 space-y-3">
            {techStats.map(stat => (
              <div 
                key={stat.userId}
                onClick={() => setSelectedTech(stat)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedTech?.userId === stat.userId 
                    ? 'border-indigo-500 bg-indigo-50 shadow-sm' 
                    : 'border-zinc-200 hover:border-indigo-300 hover:shadow-sm bg-white'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm ${
                      selectedTech?.userId === stat.userId ? 'bg-indigo-600' : 'bg-zinc-800'
                    }`}>
                      {stat.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-zinc-800 text-sm">{stat.displayName}</h3>
                      <div className="text-xs text-zinc-500">{stat.email}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">Tạm tính</div>
                    <div className={`font-bold ${stat.totalCommission > 0 ? 'text-emerald-600' : 'text-zinc-400'}`}>
                      {formatCurrency(stat.totalCommission)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-2 pt-3 border-t border-zinc-100">
                  <div className="text-center p-2 rounded-lg bg-zinc-50">
                    <div className="text-xs text-zinc-500 mb-1">Tổng Phiếu</div>
                    <div className="font-semibold text-zinc-700">{stat.totalTickets}</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-emerald-50">
                    <div className="text-xs text-emerald-600 mb-1">Hoàn Thành</div>
                    <div className="font-semibold text-emerald-700">{stat.completedTickets}</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-amber-50">
                    <div className="text-xs text-amber-600 mb-1">Đang Xử Lý</div>
                    <div className="font-semibold text-amber-700">{stat.pendingTickets}</div>
                  </div>
                </div>
              </div>
            ))}

            {techStats.length === 0 && (
              <div className="text-center py-12 text-zinc-400 text-sm">
                Không tìm thấy dữ liệu kỹ thuật viên.
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Detail View */}
        <div className="w-full lg:w-1/2 xl:w-3/5 bg-zinc-50/50 overflow-y-auto">
          {selectedTech ? (
            <div className="p-4 sm:p-6 space-y-6">
              {/* Header Stats */}
              <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-zinc-800">Chi Tiết: {selectedTech.displayName}</h3>
                    <p className="text-sm text-zinc-500">Danh sách phiếu đã xử lý trong kỳ</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-zinc-500 mb-1 font-medium">TỔNG HOA HỒNG</div>
                    <div className="text-2xl font-bold text-emerald-600">{formatCurrency(selectedTech.totalCommission)}</div>
                  </div>
                </div>

                <div className="flex space-x-6 border-t border-zinc-100 pt-4">
                  <div className="flex items-center text-sm">
                    <CheckCircle2 className="w-4 h-4 text-purple-500 mr-2" />
                    <span className="text-zinc-600 mr-2">Test QC Nhập:</span>
                    <span className="font-bold text-zinc-800">{selectedTech.qcCount} máy</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Wrench className="w-4 h-4 text-orange-500 mr-2" />
                    <span className="text-zinc-600 mr-2">Sửa Chữa / Dịch Vụ:</span>
                    <span className="font-bold text-zinc-800">{selectedTech.repairCount} máy</span>
                  </div>
                </div>
              </div>

              {/* Tickets List */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-zinc-700 uppercase tracking-wider mb-4">Lịch Sử Phiếu ({selectedTechTickets.length})</h4>
                {selectedTechTickets.map(ticket => {
                  const isCompleted = ticket.status === 'ready' || ticket.status === 'delivered';
                  return (
                    <div key={ticket.id} className="bg-white p-4 rounded-xl border border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:shadow-sm transition-all">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                            {ticket.ticketNumber}
                          </span>
                          <span className="text-xs text-zinc-500">{ticket.receivedDate}</span>
                          {ticket.taskType === 'INBOUND_QC' ? (
                            <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">QC Nhập</span>
                          ) : (
                            <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">Sửa Chữa</span>
                          )}
                        </div>
                        <div className="font-bold text-zinc-800 text-sm mb-1">{ticket.model}</div>
                        <div className="text-xs text-zinc-500 line-clamp-1"><span className="font-semibold">Lỗi:</span> {ticket.faultDescription}</div>
                      </div>
                      
                      <div className="flex items-center sm:flex-col sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-zinc-100 pt-3 sm:pt-0 pl-0 sm:pl-4 sm:border-l">
                        <div className="flex flex-col items-start sm:items-end mb-1">
                          <span className="text-[10px] font-medium text-zinc-400 uppercase">Hoa hồng</span>
                          <span className={`font-bold text-sm ${isCompleted && (ticket.commissionAmount || 0) > 0 ? 'text-emerald-600' : 'text-zinc-400'}`}>
                            {isCompleted ? formatCurrency(ticket.commissionAmount || 0) : 'Chưa chốt'}
                          </span>
                        </div>
                        <div className="text-xs">
                          {isCompleted ? (
                            <span className="text-emerald-600 flex items-center bg-emerald-50 px-2 py-1 rounded font-medium">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Đã hoàn thành
                            </span>
                          ) : (
                            <span className="text-amber-600 flex items-center bg-amber-50 px-2 py-1 rounded font-medium">
                              <Clock className="w-3 h-3 mr-1" /> Đang xử lý
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {selectedTechTickets.length === 0 && (
                  <div className="text-center py-8 text-zinc-400 text-sm bg-white rounded-xl border border-dashed border-zinc-200">
                    Chưa có phiếu kỹ thuật nào được giao.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400 p-6">
              <UserCheck className="w-16 h-16 mb-4 text-zinc-300" />
              <p className="text-base font-medium text-zinc-500">Chọn một kỹ thuật viên để xem chi tiết KPI</p>
              <p className="text-sm mt-2 text-center max-w-sm">Hệ thống sẽ tự động tổng hợp số phiếu đã làm và tính toán hoa hồng thực nhận trong kỳ.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Assuming Clock icon needs to be imported:
// import { Clock } from 'lucide-react';
// Wait, I forgot Clock in the imports at top! I'll fix this.
