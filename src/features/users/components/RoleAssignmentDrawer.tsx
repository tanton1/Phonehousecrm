import React, { useState } from 'react';
import { StaffMember, StoreBranch } from '../../../types';
import { UserRole } from '../types';
import { Button } from '../../../shared/ui/Button/Button';
import { User, Phone, Shield, Building2, DollarSign, CheckCircle2, Lock, X } from 'lucide-react';

export interface RoleAssignmentDrawerProps {
  staff: StaffMember | null;
  isOpen: boolean;
  onClose: () => void;
  branches: StoreBranch[];
  onSaveStaffSettings: (staff: StaffMember) => Promise<void> | void;
}

export const RoleAssignmentDrawer: React.FC<RoleAssignmentDrawerProps> = ({
  staff,
  isOpen,
  onClose,
  branches,
  onSaveStaffSettings
}) => {
  const [role, setRole] = useState<UserRole>((staff?.role as UserRole) || 'SALE');
  const [branchId, setBranchId] = useState(staff?.branchId || branches[0]?.id || '');
  const [baseSalary, setBaseSalary] = useState(staff?.baseSalary || 7000000);
  const [isActive, setIsActive] = useState(staff?.status !== 'INACTIVE');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !staff) return null;

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const updatedStaff: StaffMember = {
        ...staff,
        role: role as any,
        branchId,
        baseSalary,
        status: isActive ? 'ACTIVE' : 'INACTIVE'
      };

      await onSaveStaffSettings(updatedStaff);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl border-l border-zinc-200 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-100 text-[#ff4b16] font-bold text-base flex items-center justify-center">
              {(staff.displayName || staff.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900 leading-snug">
                {staff.displayName || staff.name}
              </h3>
              <p className="text-xs text-zinc-500 font-mono flex items-center space-x-1">
                <Phone className="w-3 h-3 text-zinc-400" />
                <span>{staff.phone || 'Chưa có SĐT'}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Account Status Switch */}
          <div className="p-3.5 bg-zinc-50 border border-zinc-200/80 rounded-2xl flex items-center justify-between">
            <div>
              <span className="font-bold text-zinc-800 block">Trạng Thái Tài Khoản</span>
              <span className="text-[11px] text-zinc-500">
                {isActive ? 'Đang hoạt động bình thường' : 'Đã khóa truy cập hệ thống'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                isActive ? 'bg-emerald-500' : 'bg-zinc-300'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  isActive ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Role selector */}
          <div className="space-y-1">
            <label className="font-bold text-zinc-800 block">Vai Trò Hệ Thống (Role):</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as UserRole)}
              className="w-full h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-xl font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
            >
              <option value="ADMIN">Quản Trị Viên (Admin)</option>
              <option value="MANAGER">Cửa Hàng Trưởng (Manager)</option>
              <option value="ACCOUNTANT">Kế Toán / Thu Ngân (Accountant)</option>
              <option value="SALE">Chuyên Viên Tư Vấn (Sale)</option>
              <option value="TECH_LEAD">Trưởng Nhóm Kỹ Thuật (Tech Lead)</option>
              <option value="TECH">Kỹ Thuật Viên Sửa Chữa (Tech)</option>
              <option value="WAREHOUSE">Thủ Kho Thiết Bị (Warehouse)</option>
            </select>
          </div>

          {/* Branch Assignment */}
          <div className="space-y-1">
            <label className="font-bold text-zinc-800 block">Chi Nhánh Làm Việc Trực Thuộc:</label>
            <select
              value={branchId}
              onChange={e => setBranchId(e.target.value)}
              className="w-full h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-xl font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.address})
                </option>
              ))}
            </select>
          </div>

          {/* Base Salary */}
          <div className="space-y-1">
            <label className="font-bold text-zinc-800 block">Mức Lương Cơ Bản (VNĐ / Tháng):</label>
            <input
              type="number"
              value={baseSalary}
              onChange={e => setBaseSalary(parseInt(e.target.value, 10) || 0)}
              className="w-full h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-xl font-mono font-bold text-zinc-900 focus:bg-white focus:outline-none focus:border-[#ff4b16]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 flex items-center justify-end space-x-2.5">
          <Button variant="outline" size="md" onClick={onClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button
            variant="primary"
            size="md"
            isLoading={isSubmitting}
            onClick={handleSave}
            leftIcon={<CheckCircle2 className="w-4 h-4" />}
          >
            Lưu Thiết Lập Nhân Viên
          </Button>
        </div>
      </div>
    </div>
  );
};
