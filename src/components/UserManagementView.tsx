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
import { auth, loginWithEmail, registerWithEmail } from '../lib/firebase';
import { FaceRegistrationModal } from './FaceRegistrationModal';

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
    const updated: UserAccount = {
      ...faceModalUser,
      facePhotoUrl: faceData.facePhotoUrl,
      faceFeatureVector: faceData.faceFeatureVector,
      faceEnrollmentDate: faceData.faceEnrollmentDate,
      assignedFaceEmbedding: true
    };
    onUpdateUser(updated);
  };

  // Quick Copy Feedback State
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form State for Adding / Editing
  const defaultBranchId = availableBranches[0]?.id || 'CN01';
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    phone: '',
    role: 'SALES' as UserRole,
    branchId: defaultBranchId,
    assignedBranchIds: [defaultBranchId] as string[],
    password: '',
    notes: '',
    active: true
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Login Test Panel State
  const [loginEmail, setLoginEmail] = useState('nhattank16.1@gmail.com');
  const [loginPassword, setLoginPassword] = useState('Tan889603$');
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
        branchId: newAssigned[0] || prev.branchId
      };
    });
  };

  const handleOpenAdd = () => {
    setEditingUser(null);
    const initialBranch = availableBranches[0]?.id || 'CN01';
    setFormData({
      displayName: '',
      email: '',
      phone: '',
      role: 'SALES',
      branchId: initialBranch,
      assignedBranchIds: [initialBranch],
      password: '',
      notes: '',
      active: true
    });
    setSubmitMessage(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (user: UserAccount) => {
    setEditingUser(user);
    const userBranchIds = user.assignedBranchIds && user.assignedBranchIds.length > 0
      ? user.assignedBranchIds
      : user.branchId ? [user.branchId] : [availableBranches[0]?.id || 'CN01'];

    setFormData({
      displayName: user.displayName,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      branchId: user.branchId || userBranchIds[0] || 'CN01',
      assignedBranchIds: userBranchIds,
      password: '',
      notes: user.notes || '',
      active: user.active
    });
    setSubmitMessage(null);
    setIsAddModalOpen(true);
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
          assignedBranchIds: formData.assignedBranchIds,
          workplaceAddresses: selectedAddresses,
          notes: formData.notes,
          active: formData.active
        };
        onUpdateUser(updated);
        setSubmitMessage({ type: 'success', text: 'Cập nhật tài khoản và địa chỉ làm việc thành công!' });
        setTimeout(() => setIsAddModalOpen(false), 800);
      } else {
        // 1. Attempt Server Provisioning via Firebase Admin API
        let userCreated = false;
        try {
          const token = await auth.currentUser?.getIdToken();
          if (token) {
            const resp = await fetch('/api/users/create', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                email: formData.email.trim().toLowerCase(),
                password: formData.password || 'PhoneHouse@2026',
                displayName: formData.displayName,
                phone: formData.phone,
                role: formData.role,
                branchId: formData.assignedBranchIds[0] || formData.branchId,
                assignedBranchIds: formData.assignedBranchIds,
                workplaceAddresses: selectedAddresses,
                notes: formData.notes
              })
            });

            if (resp.ok) {
              const data = await resp.json();
              if (data.user) {
                onAddUser(data.user);
                userCreated = true;
              }
            }
          }
        } catch (apiErr) {
          console.warn('[User API creation fallback]:', apiErr);
        }

        // 2. Direct Auth & Firestore fallback
        if (!userCreated) {
          let firebaseUid = `USR-${Date.now().toString().slice(-6)}`;
          try {
            const regUser = await registerWithEmail(
              formData.email.trim().toLowerCase(),
              formData.password || 'PhoneHouse@2026',
              formData.displayName
            );
            if (regUser?.uid) {
              firebaseUid = regUser.uid;
            }
          } catch (authRegErr: any) {
            console.warn('[Firebase Auth Register fallback warning]:', authRegErr?.message);
          }

          const newUser: UserAccount = {
            id: firebaseUid,
            email: formData.email.trim().toLowerCase(),
            displayName: formData.displayName,
            phone: formData.phone,
            role: formData.role,
            branchId: formData.assignedBranchIds[0] || formData.branchId,
            assignedBranchIds: formData.assignedBranchIds,
            workplaceAddresses: selectedAddresses,
            active: true,
            createdAt: new Date().toISOString().split('T')[0],
            notes: formData.notes || ''
          };
          onAddUser(newUser);
        }

        setSubmitMessage({ type: 'success', text: `Đã tạo tài khoản và cấp phép đăng nhập thành công cho ${formData.displayName}!` });
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
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-700 flex items-center justify-center text-white shadow-sm shadow-indigo-500/25">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">Quản Lý Người Dùng & Phân Quyền</h1>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-full">
                RBAC Matrix V1
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Quản lý tài khoản nhân viên, gán vai trò và cấu hình ma trận phân quyền chi nhánh.
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenAdd}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center justify-center space-x-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
        >
          <UserPlus className="w-4 h-4" />
          <span>Tạo Tài Khoản Mới</span>
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center space-x-2 bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer ${
            activeTab === 'users' 
              ? 'bg-indigo-600 text-white shadow-sm' 
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Danh Sách Người Dùng ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('matrix')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer ${
            activeTab === 'matrix' 
              ? 'bg-indigo-600 text-white shadow-sm' 
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
                  user.email === 'nhattank16.1@gmail.com'
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
                          {user.email === 'nhattank16.1@gmail.com' && (
                            <span className="w-2 h-2 rounded-full bg-orange-500" title="Admin Root"></span>
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
                          <Building2 className="w-3 h-3 text-[#FF4B16]" />
                          <span>Địa chỉ làm việc ({matchedBranches.length || 1}):</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {matchedBranches.length > 0 ? (
                            matchedBranches.map(b => (
                              <span key={b.id} className="text-[10px] font-bold bg-orange-50 text-[#FF4B16] border border-orange-200/80 px-2 py-0.5 rounded-lg flex items-center gap-1">
                                <MapPin className="w-2.5 h-2.5 shrink-0" />
                                <span>{b.name}</span>
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] font-bold bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-lg flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5 shrink-0" />
                              <span>Showroom Hải Châu</span>
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
                          : 'bg-orange-50 text-[#FF4B16] border-orange-300 hover:bg-orange-100'
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
                    {user.email !== 'nhattank16.1@gmail.com' && (
                      <button
                        onClick={() => {
                          if (confirm(`Bạn có chắc muốn xóa tài khoản ${user.displayName}?`)) {
                            onDeleteUser(user.id);
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
                  <option value="TECHNICIAN">🔵 Kỹ Thuật Viên (Technician - Tiếp nhận bảo hành, sửa chữa)</option>
                  <option value="ACCOUNTANT">🟢 Kế Toán / Thu Ngân (Accountant - Kiểm soát hóa đơn, dòng tiền)</option>
                </select>
              </div>

              {/* MULTI-BRANCH WORKPLACE SELECTION */}
              <div className="p-3.5 bg-orange-50/80 border border-orange-200/80 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-xs text-orange-950 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-[#FF4B16]" />
                    <span>Gắn Địa Chỉ / Chi Nhánh Làm Việc Cụ Thể</span>
                  </label>
                  <span className="text-[10px] bg-white text-[#FF4B16] font-extrabold px-2 py-0.5 rounded-full border border-orange-200 shadow-2xs">
                    Đã chọn {formData.assignedBranchIds.length} địa điểm
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-snug">
                  Chọn 1 hoặc nhiều địa điểm cửa hàng mà nhân viên này được phép đến trực ca và thực hiện check-in chấm công GPS/Wi-Fi:
                </p>

                <div className="space-y-1.5 pt-1">
                  {availableBranches.map((branch) => {
                    const isChecked = formData.assignedBranchIds.includes(branch.id);
                    return (
                      <div
                        key={branch.id}
                        onClick={() => handleToggleBranch(branch.id)}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                          isChecked
                            ? 'bg-white border-[#FF4B16] ring-1 ring-[#FF4B16]/20 shadow-xs'
                            : 'bg-zinc-50/70 border-zinc-200/80 hover:bg-white hover:border-orange-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Handled by container onClick
                          className="w-4 h-4 text-[#FF4B16] rounded border-zinc-300 focus:ring-orange-400 mt-0.5 cursor-pointer"
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
                            <MapPin className="w-3 h-3 text-[#FF4B16] shrink-0" />
                            <span className="truncate">{branch.address}</span>
                          </div>
                          {branch.gpsLatitude && branch.gpsLongitude && (
                            <div className="text-[10px] text-zinc-400 font-mono mt-1 flex items-center gap-2">
                              <span>📍 GPS: {branch.gpsLatitude}, {branch.gpsLongitude}</span>
                              <span className="text-orange-600 font-bold">📶 Wi-Fi: {branch.allowedWifiSSID || 'PH_HAICHAU_5G'}</span>
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
                      placeholder="Nhập mật khẩu (tối thiểu 6 ký tự)"
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
