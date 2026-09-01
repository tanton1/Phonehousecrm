import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Key,
  Lock,
  Mail,
  Phone,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Edit3,
  Trash2,
  ShieldAlert,
  Sparkles,
  Search,
  Filter,
  Eye,
  EyeOff,
  UserCheck,
  Smartphone,
  BadgePercent,
  Layers,
  ArrowRight,
  Building2,
  MapPin,
  ScanFace,
  X
} from 'lucide-react';
import { UserAccount, UserRole, RolePermissionInfo, StoreBranch } from '../types';
import { auth, loginWithEmail } from '../lib/firebase';
import { FaceRegistrationModal } from './FaceRegistrationModal';
import { fetchEmploymentCompensations, saveEmploymentCompensation } from '../services/payrollApiClient';

const currentVietnamMonthStart = () => `${new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).slice(0, 7)}-01`;

interface UserManagementViewProps {
  users: UserAccount[];
  branches?: StoreBranch[];
  currentUserEmail?: string;
  onAddUser: (user: UserAccount) => void;
  onUpdateUser: (user: UserAccount) => void;
  onDeleteUser: (userId: string) => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  users,
  branches = [],
  currentUserEmail,
  onAddUser,
  onUpdateUser,
  onDeleteUser
}) => {
  const availableBranches = branches;
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'users' | 'matrix' | 'auth-test'>('users');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [faceModalUser, setFaceModalUser] = useState<UserAccount | null>(null);

  const handleSaveFaceProfile = (faceData: { facePhotoUrl: string; faceFeatureVector: number[]; faceEnrollmentDate: string }) => {
    if (!faceModalUser) return;
    // Face photo is supplementary session evidence only; never persist a browser-generated vector.
    void faceData;
    setFaceModalUser(null);
  };

  const handleDeactivateUser = async (user: UserAccount) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('UNAUTHENTICATED');
    const response = await fetch('/api/users/update-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ uid: user.id, active: false })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) throw new Error(result.message || result.error || 'USER_DEACTIVATION_FAILED');
    onUpdateUser({ ...user, active: false });
  };

  // Quick Copy Feedback State
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form State for Adding / Editing
  const defaultBranchId = '';
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    phone: '',
    role: 'SALES' as UserRole,
    branchId: defaultBranchId,
    payrollBranchId: '',
    assignedBranchIds: [] as string[],
    password: '',
    notes: '',
    baseSalary: 0,
    allowance: 0,
    compensationEffectiveFrom: currentVietnamMonthStart(),
    active: true
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Login Test Panel State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState<string | null>(null);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleToggleBranch = (branchId: string) => {
    setFormData(prev => {
      const exists = prev.assignedBranchIds.includes(branchId);
      let newAssigned: string[];
      if (exists) {
        newAssigned = prev.assignedBranchIds.filter(id => id !== branchId);
        // Ensure at least 1 branch is selected
        if (newAssigned.length === 0) newAssigned = [branchId];
      } else {
        newAssigned = [...prev.assignedBranchIds, branchId];
      }
      return {
        ...prev,
        assignedBranchIds: newAssigned,
        branchId: newAssigned[0] || prev.branchId,
        payrollBranchId: newAssigned.includes(prev.payrollBranchId)
          ? prev.payrollBranchId
          : (newAssigned[0] || '')
      };
    });
  };

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormData({
      displayName: '',
      email: '',
      phone: '',
      role: 'SALES',
      branchId: '',
      payrollBranchId: '',
      assignedBranchIds: [],
      password: '',
      notes: '',
      baseSalary: 0,
      allowance: 0,
      compensationEffectiveFrom: currentVietnamMonthStart(),
      active: true
    });
    setSubmitMessage(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (user: UserAccount) => {
    setEditingUser(user);
    const userBranchIds = user.assignedBranchIds && user.assignedBranchIds.length > 0
      ? user.assignedBranchIds
      : user.branchId ? [user.branchId] : [];

    setFormData({
      displayName: user.displayName,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      branchId: user.branchId || userBranchIds[0] || '',
      payrollBranchId: user.payrollBranchId || (userBranchIds.length === 1 ? userBranchIds[0] : ''),
      assignedBranchIds: userBranchIds,
      password: '',
      notes: user.notes || '',
      baseSalary: Number((user as any).baseSalary || 0),
      allowance: Number((user as any).allowance || 0),
      compensationEffectiveFrom: currentVietnamMonthStart(),
      active: user.active
    });
    setSubmitMessage(null);
    setIsAddModalOpen(true);
    void fetchEmploymentCompensations({ staffUid: user.id })
      .then((entries) => {
        const current = entries.find((entry) => entry.status === 'ACTIVE');
        if (!current) return;
        setFormData((previous) => ({
          ...previous,
          baseSalary: current.baseSalary,
          allowance: current.allowance,
          compensationEffectiveFrom: current.effectiveFrom
        }));
      })
      .catch(() => {
        setSubmitMessage({ type: 'error', text: 'Không tải được cấu hình lương hiện hành; đang hiển thị dữ liệu hồ sơ cũ.' });
      });
  };

  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.displayName) {
      setSubmitMessage({ type: 'error', text: 'Vui lòng nhập đầy đủ Email và Họ Tên.' });
      return;
    }

    if (formData.assignedBranchIds.length === 0) {
      setSubmitMessage({ type: 'error', text: 'Vui lòng chọn ít nhất 1 địa chỉ / chi nhánh làm việc.' });
      return;
    }
    if (!formData.payrollBranchId || !formData.assignedBranchIds.includes(formData.payrollBranchId)) {
      setSubmitMessage({ type: 'error', text: 'Vui lòng chọn một chi nhánh trả lương chính trong các địa điểm làm việc.' });
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(null);

    // Map assigned branch IDs to full address texts
    const selectedAddresses = availableBranches
      .filter(b => formData.assignedBranchIds.includes(b.id))
      .map(b => `${b.name} - ${b.address}`);

    try {
      if (editingUser) {
        // Update user
        const updated: UserAccount = {
          ...editingUser,
          displayName: formData.displayName,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          branchId: formData.assignedBranchIds[0] || formData.branchId,
          payrollBranchId: formData.payrollBranchId,
          assignedBranchIds: formData.assignedBranchIds,
          workplaceAddresses: selectedAddresses,
          notes: formData.notes,
          baseSalary: formData.baseSalary,
          allowance: formData.allowance,
          active: formData.active
        };
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('UNAUTHENTICATED');
        const response = await fetch('/api/users/update-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            uid: editingUser.id,
            role: updated.role,
            branchId: updated.branchId,
            payrollBranchId: updated.payrollBranchId,
            active: updated.active,
            displayName: updated.displayName,
            phone: updated.phone,
            assignedBranchIds: updated.assignedBranchIds,
            workplaceAddresses: updated.workplaceAddresses,
            notes: updated.notes
          })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) throw new Error(result.message || result.error || 'USER_UPDATE_FAILED');
        await saveEmploymentCompensation(editingUser.id, {
          effectiveFrom: formData.compensationEffectiveFrom,
          baseSalary: formData.baseSalary,
          allowance: formData.allowance
        });
        onUpdateUser(updated);
        setSubmitMessage({ type: 'success', text: 'Cập nhật tài khoản và địa chỉ làm việc thành công!' });
        setTimeout(() => setIsAddModalOpen(false), 800);
      } else {
        // 1. Attempt Server Provisioning via Firebase Admin API
        let userCreated = false;
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.');
        const resp = await fetch('/api/users/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            email: formData.email.trim().toLowerCase(),
            password: formData.password,
            displayName: formData.displayName,
            phone: formData.phone,
            role: formData.role,
            branchId: formData.assignedBranchIds[0] || formData.branchId,
            payrollBranchId: formData.payrollBranchId,
            assignedBranchIds: formData.assignedBranchIds,
            workplaceAddresses: selectedAddresses,
            notes: formData.notes
          })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.success === false) {
          throw new Error(data.message || data.error || 'Máy chủ không thể tạo tài khoản.');
        }
        if (data.user) {
          await saveEmploymentCompensation(String(data.user.id || data.user.uid), {
            effectiveFrom: formData.compensationEffectiveFrom,
            baseSalary: formData.baseSalary,
            allowance: formData.allowance
          });
          onAddUser(data.user);
          userCreated = true;
          if (data.passwordSetupRequired) {
            setSubmitMessage({
              type: 'success',
              text: `Đã tạo hồ sơ cho ${formData.displayName}. Nhân viên chọn “Quên mật khẩu” trên trang đăng nhập để tự đặt mật khẩu.`
            });
          }
        }

        // Server is the only writer. Never create Auth/Firestore users from the browser.
        if (!userCreated) {
          throw new Error('USER_CREATION_FAILED: Máy chủ không tạo được tài khoản. Không có dữ liệu tạm nào được ghi từ trình duyệt.');
        }

        setSubmitMessage(current => current?.type === 'success'
          ? current
          : { type: 'success', text: `Đã tạo tài khoản và cấp phép đăng nhập thành công cho ${formData.displayName}!` });
        setTimeout(() => setIsAddModalOpen(false), 800);
      }
    } catch (err: any) {
      setSubmitMessage({ type: 'error', text: `Lỗi: ${err.message || 'Không thể lưu tài khoản'}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginStatus('Đang xác thực thông tin đăng nhập...');
    try {
      const user = await loginWithEmail(loginEmail, loginPassword);
      setLoginStatus(`✅ Đăng nhập thành công! Email: ${user.email} (UID: ${user.uid.slice(0, 8)}...)`);
    } catch (err: any) {
      setLoginStatus(`❌ Lỗi đăng nhập: ${err.message || 'Mật khẩu hoặc Email không đúng'}`);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchSearch =
      u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.phone && u.phone.includes(searchTerm));
    const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Quản Trị Viên</span>;
      case 'MANAGER':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Quản Lý Cửa Hàng</span>;
      case 'SALES':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-1"><BadgePercent className="w-3 h-3" /> Nhân Viên Bán Hàng</span>;
      case 'CUSTOMER_CARE':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-cyan-50 text-cyan-700 border border-cyan-200 flex items-center gap-1"><Users className="w-3 h-3" /> Chăm Sóc Khách Hàng</span>;
      case 'TECHNICIAN':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-1"><Smartphone className="w-3 h-3" /> Kỹ Thuật Viên</span>;
      case 'ACCOUNTANT':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-1"><Layers className="w-3 h-3" /> Kế Toán</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-zinc-100 text-zinc-700">{role}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Professional Header */}
      <div className="ph-page-header flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-[#ff4b16] to-[#e94112] text-white shadow-sm shadow-orange-500/25">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="ph-page-title">Người dùng & Phân quyền</h1>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-full">
                RBAC Matrix V1
              </span>
            </div>
            <p className="ph-page-subtitle">
              Quản lý tài khoản nhân viên, gán vai trò và cấu hình ma trận phân quyền chi nhánh.
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenAdd}
          className="ph-primary-button cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Tạo Tài Khoản Mới</span>
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center space-x-2 overflow-x-auto rounded-2xl border border-zinc-200/80 bg-white p-2 shadow-xs">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer ${
            activeTab === 'users'
              ? 'bg-[#ff4b16] text-white shadow-sm'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Danh Sách Người Dùng ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('matrix')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer ${
            activeTab === 'matrix'
              ? 'bg-[#ff4b16] text-white shadow-sm'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Ma Trận Phân Quyền Chi Tiết (RBAC)</span>
        </button>
      </div>

      {/* TAB 1: USER LIST */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Search & Role Filter */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm theo tên nhân viên, email, số điện thoại..."
                className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-white border border-zinc-200 rounded-xl focus:outline-hidden focus:border-orange-500 transition-colors"
              />
            </div>
            <div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full py-2 px-3 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-hidden focus:border-orange-500 font-medium text-zinc-700"
              >
                <option value="ALL">Tất cả vai trò ({users.length})</option>
                <option value="ADMIN">Quản Trị Viên (Admin)</option>
                <option value="MANAGER">Quản Lý Cửa Hàng (Manager)</option>
                <option value="SALES">Nhân Viên Bán Hàng (Sales)</option>
                <option value="CUSTOMER_CARE">Chăm Sóc Khách Hàng (CSKH)</option>
                <option value="TECHNICIAN">Kỹ Thuật Viên (Technician)</option>
                <option value="ACCOUNTANT">Kế Toán (Accountant)</option>
              </select>
            </div>
          </div>

          {/* User Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className={`bg-white rounded-2xl p-4 border transition-all hover:shadow-md flex flex-col justify-between ${
                  user.email === currentUserEmail
                    ? 'border-orange-300 ring-2 ring-orange-100'
                    : 'border-zinc-200/80 hover:border-orange-200'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center space-x-3">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.displayName}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full object-cover border border-orange-200"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-700 font-bold flex items-center justify-center text-sm border border-orange-200">
                          {user.displayName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <h3 className="font-bold text-zinc-800 text-sm flex items-center gap-1.5">
                          {user.displayName}
                          {user.email === currentUserEmail && (
                            <span className="w-2 h-2 rounded-full bg-orange-500" title="Tài khoản đang đăng nhập"></span>
                          )}
                        </h3>
                        <p className="text-xs text-zinc-500 font-mono">{user.email}</p>
                      </div>
                    </div>
                    {getRoleBadge(user.role)}
                  </div>

                  <div className="space-y-1.5 text-xs text-zinc-600 bg-zinc-50 p-2.5 rounded-xl border border-zinc-100 mb-3 font-medium">
                    {user.phone && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 flex items-center gap-1"><Phone className="w-3 h-3" /> Điện thoại:</span>
                        <span className="font-mono text-zinc-700">{user.phone}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Trạng thái:</span>
                      {user.active ? (
                        <span className="text-orange-700 flex items-center gap-1 font-bold">
                          <CheckCircle2 className="w-3 h-3 text-orange-500" /> Hoạt động
                        </span>
                      ) : (
                        <span className="text-rose-600 flex items-center gap-1 font-bold">
                          <XCircle className="w-3 h-3 text-rose-500" /> Tạm khóa
                        </span>
                      )}
                    </div>
                    {user.notes && (
                      <div className="pt-1 border-t border-zinc-200 text-zinc-500 text-[11px] italic">
                        {user.notes}
                      </div>
                    )}
                  </div>

                  {/* ASSIGNED WORKPLACE ADDRESSES BADGES */}
                  {(() => {
                    const assignedIds = user.assignedBranchIds && user.assignedBranchIds.length > 0
                      ? user.assignedBranchIds
                      : user.branchId ? [user.branchId] : [];
                    const matchedBranches = availableBranches.filter(b => assignedIds.includes(b.id));

                    return (
                      <div className="mb-3">
                        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-[#ff4b16]" />
                          <span>Địa chỉ làm việc ({matchedBranches.length}):</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {matchedBranches.length > 0 ? (
                            matchedBranches.map(b => (
                              <span key={b.id} className="text-[10px] font-bold bg-orange-50 text-[#ff4b16] border border-orange-200/80 px-2 py-0.5 rounded-lg flex items-center gap-1">
                                <MapPin className="w-2.5 h-2.5 shrink-0" />
                                <span>{b.name}</span>
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] font-bold bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-lg flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5 shrink-0" />
                              <span>Chưa gắn chi nhánh</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => setFaceModalUser(user)}
                      className={`text-[10px] font-extrabold px-2 py-1 rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                        user.assignedFaceEmbedding
                          ? 'bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100'
                          : 'bg-orange-50 text-[#ff4b16] border-orange-300 hover:bg-orange-100'
                      }`}
                      title="Đăng ký hoặc cập nhật dữ liệu gương mặt sinh trắc học"
                    >
                      <ScanFace className="w-3 h-3" />
                      <span>{user.assignedFaceEmbedding ? 'Face ID: Đã đăng ký' : 'Đăng Ký Face ID'}</span>
                    </button>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleOpenEdit(user)}
                      className="p-1.5 text-zinc-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                      title="Sửa thông tin / Đổi quyền"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {user.email !== currentUserEmail && (
                      <button
                        onClick={async () => {
                          if (confirm(`Bạn có chắc muốn xóa tài khoản ${user.displayName}?`)) {
                            try {
                              await handleDeactivateUser(user);
                            } catch (error: any) {
                              alert(`Không thể ngừng tài khoản: ${error?.message || 'Lỗi máy chủ'}`);
                            }
                          }
                        }}
                        className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Xóa tài khoản"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: RBAC PERMISSION MATRIX */}
      {activeTab === 'matrix' && (
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-2xs space-y-5">
          <div>
            <h3 className="font-bold text-zinc-800 text-base flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-orange-600" />
              Bảng Phân Quyền Vai Trò Hệ Thống (Role-Based Access Control)
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Quy định chi tiết các quyền hạn truy cập, bảo mật giá vốn, quyền duyệt giá thu cũ và thao tác dữ liệu.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-y border-zinc-200 text-zinc-600 font-bold">
                  <th className="py-3 px-3">Quyền Hạn / Chức Năng</th>
                  <th className="py-3 px-2 text-center text-rose-700 bg-rose-50/50">Admin</th>
                  <th className="py-3 px-2 text-center text-rose-700 bg-rose-50/50">Manager</th>
                  <th className="py-3 px-2 text-center text-orange-700 bg-orange-50/50">Sales</th>
                  <th className="py-3 px-2 text-center text-orange-700 bg-orange-50/50">Technician</th>
                  <th className="py-3 px-2 text-center text-orange-700 bg-orange-50/50">Accountant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                <tr className="hover:bg-zinc-50">
                  <td className="py-3 px-3 font-semibold text-zinc-800">Quản lý tài khoản & Phân quyền user</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                </tr>
                <tr className="hover:bg-zinc-50">
                  <td className="py-3 px-3 font-semibold text-zinc-800">Xem Giá Nhập Gốc (Giá Vốn Kho IMEI)</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-rose-400"><XCircle className="w-3.5 h-3.5 mx-auto text-rose-400" /></td>
                  <td className="py-3 px-2 text-center text-rose-400"><XCircle className="w-3.5 h-3.5 mx-auto text-rose-400" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                </tr>
                <tr className="hover:bg-zinc-50">
                  <td className="py-3 px-3 font-semibold text-zinc-800">Xem Báo Cáo Doanh Thu & Lợi Nhuận Gộp</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-rose-400"><XCircle className="w-3.5 h-3.5 mx-auto text-rose-400" /></td>
                  <td className="py-3 px-2 text-center text-rose-400"><XCircle className="w-3.5 h-3.5 mx-auto text-rose-400" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                </tr>
                <tr className="hover:bg-zinc-50">
                  <td className="py-3 px-3 font-semibold text-zinc-800">Nhập Kho IMEI Mới & Cập Nhật Tình Trạng</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                </tr>
                <tr className="hover:bg-zinc-50">
                  <td className="py-3 px-3 font-semibold text-zinc-800">Tạo Đơn Bán POS & In Hóa Đơn K80</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                </tr>
                <tr className="hover:bg-zinc-50">
                  <td className="py-3 px-3 font-semibold text-zinc-800">Quản Lý Phễu Khách Hàng CRM (Zalo/TikTok)</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                </tr>
                <tr className="hover:bg-zinc-50">
                  <td className="py-3 px-3 font-semibold text-zinc-800">Duyệt Giá Thẩm Định Thu Cũ Đổi Mới</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-zinc-300">(Chỉ định giá tạm)</td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                </tr>
                <tr className="hover:bg-zinc-50">
                  <td className="py-3 px-3 font-semibold text-zinc-800">Tiếp Nhận Bảo Hành & Chẩn Đoán AI</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-orange-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* End Tabs Content */}

      {/* CREATE / EDIT USER MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-white sm:bg-black/60 sm:backdrop-blur-xs z-50 flex items-center justify-center sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-3xl sm:max-w-lg overflow-hidden shadow-none sm:shadow-2xl flex flex-col border-0 sm:border sm:border-orange-200">
            <div className="bg-white px-4 py-3.5 sm:px-6 sm:py-5 border-b border-orange-100 flex items-center gap-3 shrink-0">
              <button onClick={() => setIsAddModalOpen(false)} className="sm:hidden p-1.5 -ml-2 text-zinc-400 hover:bg-zinc-100 rounded-lg">
                <X className="w-5 h-5 text-zinc-600" />
              </button>
              <div className="flex items-center space-x-2 flex-1">
                <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 text-base leading-tight">
                    {editingUser ? 'Sửa Nhân Viên' : 'Tạo Nhân Viên Mới'}
                  </h3>
                  <p className="text-[10px] text-zinc-500">Cấu hình vai trò và phân quyền</p>
                </div>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="hidden sm:block text-zinc-400 hover:text-zinc-600 p-1.5 hover:bg-zinc-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1 bg-white">

            <form onSubmit={handleSubmitUser} className="space-y-4 mt-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Họ và Tên <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    placeholder="VD: Nguyễn Văn Anh"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:border-orange-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Số Điện Thoại</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="VD: 0912345678"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:border-orange-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">Email Đăng Nhập <span className="text-rose-500">*</span></label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="VD: sale.anhnguyen@istore.vn"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:border-orange-500 focus:outline-hidden font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">Phân Cấp Vai Trò (Role RBAC)</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:border-orange-500 focus:outline-hidden font-bold text-zinc-800 bg-white"
                >
                  <option value="ADMIN">🔴 Quản Trị Viên (Root Admin - Toàn quyền)</option>
                  <option value="MANAGER">🟣 Quản Lý Cửa Hàng (Store Manager - Xem giá vốn, duyệt thu cũ)</option>
                  <option value="SALES">🟠 Nhân Viên Bán Hàng (Sales Rep - Bán POS, ẩn giá vốn)</option>
                  <option value="CUSTOMER_CARE">🩵 Chăm Sóc Khách Hàng (CRM trước/sau bán)</option>
                  <option value="TECHNICIAN">🔵 Kỹ Thuật Viên (Technician - Tiếp nhận bảo hành, sửa chữa)</option>
                  <option value="ACCOUNTANT">🟢 Kế Toán / Thu Ngân (Accountant - Kiểm soát hóa đơn, dòng tiền)</option>
                </select>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5">
                <div className="mb-3 text-xs font-black text-emerald-950">Cấu hình lương có hiệu lực</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="space-y-1"><span className="font-bold text-zinc-700">Lương cơ bản</span><input type="number" min="0" step="1000" value={formData.baseSalary} onChange={(event) => setFormData({ ...formData, baseSalary: Math.max(0, Number(event.target.value) || 0) })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 font-mono focus:border-emerald-500 focus:outline-hidden" /></label>
                  <label className="space-y-1"><span className="font-bold text-zinc-700">Phụ cấp</span><input type="number" min="0" step="1000" value={formData.allowance} onChange={(event) => setFormData({ ...formData, allowance: Math.max(0, Number(event.target.value) || 0) })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 font-mono focus:border-emerald-500 focus:outline-hidden" /></label>
                  <label className="space-y-1"><span className="font-bold text-zinc-700">Hiệu lực từ</span><input type="date" required value={formData.compensationEffectiveFrom} onChange={(event) => setFormData({ ...formData, compensationEffectiveFrom: event.target.value })} className="w-full rounded-xl border border-zinc-200 px-3 py-2 font-mono focus:border-emerald-500 focus:outline-hidden" /></label>
                </div>
                <p className="mt-2 text-[10px] font-semibold text-emerald-800">Mỗi lần đổi mức lương sẽ tạo phiên bản có ngày hiệu lực và audit trên máy chủ.</p>
              </div>

              {/* MULTI-BRANCH WORKPLACE SELECTION */}
              <div className="p-3.5 bg-orange-50/80 border border-orange-200/80 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-xs text-orange-950 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-[#ff4b16]" />
                    <span>Gắn Địa Chỉ / Chi Nhánh Làm Việc Cụ Thể</span>
                  </label>
                  <span className="text-[10px] bg-white text-[#ff4b16] font-extrabold px-2 py-0.5 rounded-full border border-orange-200 shadow-2xs">
                    Đã chọn {formData.assignedBranchIds.length} địa điểm
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-snug">
                  Chọn địa điểm nhân viên được phép trực ca và chấm công bằng GPS kèm ảnh tại chỗ:
                </p>

                <label className="block rounded-xl border border-orange-200 bg-white p-3">
                  <span className="mb-1 block text-xs font-black text-orange-950">Chi nhánh trả lương chính</span>
                  <select
                    required
                    value={formData.payrollBranchId}
                    onChange={(event) => setFormData({ ...formData, payrollBranchId: event.target.value })}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-900 focus:border-orange-500 focus:outline-hidden"
                  >
                    <option value="">Chọn chi nhánh trả lương</option>
                    {availableBranches
                      .filter((branch) => formData.assignedBranchIds.includes(branch.id))
                      .map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                  <span className="mt-1.5 block text-[10px] font-semibold leading-4 text-zinc-500">Lương cơ bản và hoa hồng phát sinh ở các chi nhánh khác được gom đúng một lần về kỳ lương này.</span>
                </label>

                <div className="space-y-1.5 pt-1">
                  {availableBranches.map((branch) => {
                    const isChecked = formData.assignedBranchIds.includes(branch.id);
                    return (
                      <div
                        key={branch.id}
                        onClick={() => handleToggleBranch(branch.id)}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                          isChecked
                            ? 'bg-white border-[#ff4b16] ring-1 ring-[#ff4b16]/20 shadow-xs'
                            : 'bg-zinc-50/70 border-zinc-200/80 hover:bg-white hover:border-orange-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Handled by container onClick
                          className="w-4 h-4 text-[#ff4b16] rounded border-zinc-300 focus:ring-orange-400 mt-0.5 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-extrabold text-xs text-zinc-900 leading-tight">
                              {branch.name}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-100 px-1.5 py-0.2 rounded">
                              {branch.id}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-[#ff4b16] shrink-0" />
                            <span className="truncate">{branch.address}</span>
                          </div>
                          {branch.gpsLatitude && branch.gpsLongitude && (
                            <div className="text-[10px] text-zinc-400 font-mono mt-1 flex items-center gap-2">
                              <span>📍 GPS: {branch.gpsLatitude}, {branch.gpsLongitude}</span>
                              <span className="text-orange-600 font-bold">Bán kính: {branch.attendanceRadius ?? branch.allowedGpsRadiusMeters ?? 50}m</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {!editingUser && (
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Mật Khẩu Khởi Tạo</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Để trống để nhân viên đặt qua Email"
                      className="w-full px-3 py-2 pr-9 border border-zinc-200 rounded-xl focus:border-orange-500 focus:outline-hidden font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10px] font-semibold leading-4 text-zinc-500">
                    Nếu nhập mật khẩu, cần tối thiểu 8 ký tự và nhân viên sẽ bị yêu cầu đổi ở lần đăng nhập đầu. Nếu để trống, nhân viên dùng “Quên mật khẩu” để tự đặt.
                  </p>
                </div>
              )}

              <div>
                <label className="block font-bold text-zinc-700 mb-1">Ghi Chú Nhân Sự</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Ghi chú về chi nhánh làm việc, ca trực..."
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:border-orange-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="userActive"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="w-4 h-4 text-orange-500 rounded border-zinc-300 focus:ring-orange-400"
                />
                <label htmlFor="userActive" className="text-zinc-700 font-semibold cursor-pointer">
                  Kích hoạt tài khoản ngay (Cho phép đăng nhập)
                </label>
              </div>

              {submitMessage && (
                <div className={`p-3 rounded-xl text-xs font-bold ${
                  submitMessage.type === 'success' ? 'bg-orange-50 text-orange-800 border border-orange-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {submitMessage.text}
                </div>
              )}

              <div className="pt-3 sm:pt-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:pb-0 border-t border-zinc-100 flex items-center justify-end space-x-2 mt-auto sticky bottom-0 bg-white z-10">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-700 font-semibold hover:bg-zinc-50"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition-all shadow-md shadow-orange-500/20 disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Đang Lưu...' : editingUser ? 'Lưu Thay Đổi' : 'Tạo Tài Khoản'}</span>
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* FACE REGISTRATION MODAL */}
      {faceModalUser && (
        <FaceRegistrationModal
          isOpen={!!faceModalUser}
          onClose={() => setFaceModalUser(null)}
          staffName={faceModalUser.displayName}
          staffEmail={faceModalUser.email}
          currentFacePhotoUrl={faceModalUser.facePhotoUrl || faceModalUser.avatarUrl}
          isAdminApproving={true}
          onSaveFaceProfile={handleSaveFaceProfile}
        />
      )}
    </div>
  );
};
