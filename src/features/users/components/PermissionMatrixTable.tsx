import React, { useState } from 'react';
import { UserRole, PermissionAction, ResourceModule, DEFAULT_MODULE_PERMISSIONS, ModulePermission } from '../types';
import { Button } from '../../../shared/ui/Button/Button';
import { Shield, Check, Lock, Save, Users, KeyRound, AlertCircle } from 'lucide-react';

export interface PermissionMatrixTableProps {
  onSaveMatrix?: (role: UserRole, permissions: ModulePermission[]) => void;
}

const ROLES: { id: UserRole; label: string; badge: string }[] = [
  { id: 'ADMIN', label: 'Quản Trị Viên (Admin)', badge: 'bg-rose-100 text-rose-800' },
  { id: 'MANAGER', label: 'Cửa Hàng Trưởng (Manager)', badge: 'bg-purple-100 text-purple-800' },
  { id: 'ACCOUNTANT', label: 'Kế Toán / Thu Ngân', badge: 'bg-emerald-100 text-emerald-800' },
  { id: 'SALE', label: 'Chuyên Viên Tư Vấn (Sale)', badge: 'bg-blue-100 text-blue-800' },
  { id: 'TECH_LEAD', label: 'Trưởng Nhóm Kỹ Thuật', badge: 'bg-amber-100 text-amber-800' },
  { id: 'TECH', label: 'Kỹ Thuật Viên Sửa Chữa', badge: 'bg-orange-100 text-[#ff4b16]' },
  { id: 'WAREHOUSE', label: 'Thủ Kho Thiết Bị', badge: 'bg-zinc-100 text-zinc-800' }
];

export const PermissionMatrixTable: React.FC<PermissionMatrixTableProps> = ({
  onSaveMatrix
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('SALE');
  const [permissions, setPermissions] = useState<ModulePermission[]>(() =>
    DEFAULT_MODULE_PERMISSIONS.map(p => ({
      ...p,
      canView: true,
      canCreate: selectedRole === 'ADMIN' || selectedRole === 'MANAGER' || (selectedRole === 'SALE' && p.module === 'POS_SALES'),
      canEdit: selectedRole === 'ADMIN' || selectedRole === 'MANAGER',
      canDelete: selectedRole === 'ADMIN',
      canApprove: selectedRole === 'ADMIN' || (selectedRole === 'MANAGER' && p.module !== 'SYSTEM_USERS')
    }))
  );

  const handleToggle = (module: ResourceModule, key: keyof ModulePermission) => {
    if (selectedRole === 'ADMIN') return; // Admin has full access locked

    setPermissions(prev =>
      prev.map(p => {
        if (p.module === module) {
          return { ...p, [key]: !p[key] };
        }
        return p;
      })
    );
  };

  const handleRoleChange = (role: UserRole) => {
    setSelectedRole(role);
    setPermissions(
      DEFAULT_MODULE_PERMISSIONS.map(p => ({
        ...p,
        canView: true,
        canCreate: role === 'ADMIN' || role === 'MANAGER' || (role === 'SALE' && (p.module === 'POS_SALES' || p.module === 'CRM_LEADS')),
        canEdit: role === 'ADMIN' || role === 'MANAGER' || (role === 'TECH' && p.module === 'WARRANTY'),
        canDelete: role === 'ADMIN',
        canApprove: role === 'ADMIN' || (role === 'MANAGER' && p.module !== 'SYSTEM_USERS')
      }))
    );
  };

  const handleSave = () => {
    if (onSaveMatrix) {
      onSaveMatrix(selectedRole, permissions);
    }
    alert(`Đã lưu ma trận phân quyền thành công cho vai trò ${selectedRole}.`);
  };

  return (
    <div className="space-y-4">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-orange-100 text-[#ff4b16] font-bold text-xs flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
              Ma Trận Phân Quyền Vai Trò (Permission Matrix)
            </h3>
            <p className="text-[11px] text-zinc-500">Kiểm soát chi tiết quyền Xem, Tạo, Sửa, Xóa và Phê Duyệt cho 7 nhóm vai trò</p>
          </div>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          leftIcon={<Save className="w-3.5 h-3.5" />}
        >
          Lưu Cấu Hình Quyền
        </Button>
      </div>

      {/* 2. Role Selector Tabs */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs font-bold bg-zinc-100/70 p-1.5 rounded-2xl border border-zinc-200/80">
        {ROLES.map(r => {
          const isSelected = selectedRole === r.id;

          return (
            <button
              key={r.id}
              onClick={() => handleRoleChange(r.id)}
              className={`px-3 py-2 rounded-xl transition-all cursor-pointer shrink-0 flex items-center space-x-1.5 ${
                isSelected
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/50'
              }`}
            >
              <span>{r.label}</span>
            </button>
          );
        })}
      </div>

      {/* Admin Notice */}
      {selectedRole === 'ADMIN' && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-xs text-rose-800 font-medium">
          <KeyRound className="w-4 h-4 text-rose-600 shrink-0" />
          <span>Tài khoản Quản Trị Viên (Admin) sở hữu toàn quyền tuyệt đối (Superuser) trên tất cả phân hệ hệ thống.</span>
        </div>
      )}

      {/* 3. Permissions Matrix Table */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-50/80 border-b border-zinc-200/80 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                <th className="py-3 px-4">Phân Hệ Chức Năng</th>
                <th className="py-3 px-4">Nhóm Nghiệp Vụ</th>
                <th className="py-3 px-3 text-center">Xem (View)</th>
                <th className="py-3 px-3 text-center">Tạo (Create)</th>
                <th className="py-3 px-3 text-center">Sửa (Edit)</th>
                <th className="py-3 px-3 text-center">Xóa (Delete)</th>
                <th className="py-3 px-3 text-center">Phê Duyệt (Approve)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {permissions.map(perm => (
                <tr key={perm.module} className="hover:bg-zinc-50/80 transition-colors">
                  <td className="py-3 px-4 font-bold text-zinc-900">
                    {perm.label}
                  </td>

                  <td className="py-3 px-4">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                      {perm.category}
                    </span>
                  </td>

                  {/* Checkbox columns */}
                  {(['canView', 'canCreate', 'canEdit', 'canDelete', 'canApprove'] as (keyof ModulePermission)[]).map(actionKey => {
                    const isChecked = Boolean(perm[actionKey]);
                    const isDisabled = selectedRole === 'ADMIN';

                    return (
                      <td key={actionKey} className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={() => handleToggle(perm.module, actionKey)}
                          className="w-4 h-4 rounded text-[#ff4b16] accent-[#ff4b16] cursor-pointer disabled:cursor-not-allowed"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
