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
  ArrowRight
} from 'lucide-react';
import { UserAccount, UserRole, RolePermissionInfo } from '../types';
import { ROLE_PERMISSIONS_CONFIG } from '../data/initialData';
import { loginWithEmail, registerWithEmail } from '../lib/firebase';

interface UserManagementViewProps {
  users: UserAccount[];
  currentUserEmail?: string;
  onAddUser: (user: UserAccount) => void;
  onUpdateUser: (user: UserAccount) => void;
  onDeleteUser: (userId: string) => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  users,
  currentUserEmail,
  onAddUser,
  onUpdateUser,
  onDeleteUser
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'users' | 'matrix' | 'auth-test'>('users');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);

  // Quick Copy Feedback State
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form State for Adding / Editing
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    phone: '',
    role: 'SALES' as UserRole,
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

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormData({
      displayName: '',
      email: '',
      phone: '',
      role: 'SALES',
      password: '',
      notes: '',
      active: true
    });
    setSubmitMessage(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (user: UserAccount) => {
    setEditingUser(user);
    setFormData({
      displayName: user.displayName,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
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

    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      if (editingUser) {
        // Update user
        const updated: UserAccount = {
          ...editingUser,
          displayName: formData.displayName,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          notes: formData.notes,
          active: formData.active
        };
        onUpdateUser(updated);
        setSubmitMessage({ type: 'success', text: 'Cập nhật tài khoản thành công!' });
        setTimeout(() => setIsAddModalOpen(false), 800);
      } else {
        // Create new user in Firestore & optionally in Firebase Auth
        const newId = `USR-${Date.now().toString().slice(-6)}`;
        const newUser: UserAccount = {
          id: newId,
          email: formData.email,
          displayName: formData.displayName,
          phone: formData.phone,
          role: formData.role,
          active: formData.active,
          createdAt: new Date().toISOString().split('T')[0],
          notes: formData.notes || `Mật khẩu khởi tạo: ${formData.password || '123456'}`
        };

        if (formData.password && formData.password.length >= 6) {
          try {
            await registerWithEmail(formData.email, formData.password, formData.displayName);
          } catch (authErr: any) {
            console.warn('Firebase Auth user creation note:', authErr.message);
          }
        }

        onAddUser(newUser);
        setSubmitMessage({ type: 'success', text: 'Đã tạo tài khoản và phân quyền thành công!' });
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
        return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-red-50 text-red-700 border border-red-200 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Quản Trị Viên</span>;
      case 'MANAGER':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Quản Lý Cửa Hàng</span>;
      case 'SALES':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-1"><BadgePercent className="w-3 h-3" /> Nhân Viên Bán Hàng</span>;
      case 'TECHNICIAN':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1"><Smartphone className="w-3 h-3" /> Kỹ Thuật Viên</span>;
      case 'ACCOUNTANT':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1"><Layers className="w-3 h-3" /> Kế Toán</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-zinc-100 text-zinc-700">{role}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Admin Pre-configured Credentials Highlight Card */}
      <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center space-x-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-200" />
              <span>Tài Khoản Root Admin Cấp Cao Đã Thiết Lập</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight">
              Tài Khoản Quản Trị Hệ Thống: Nhật Tân
            </h2>
            <p className="text-xs md:text-sm text-orange-100 max-w-2xl">
              Hệ thống đã tự động cấu hình và gán quyền Quản Trị Viên Tối Cao (Root Admin) cho tài khoản này. Bạn có thể sử dụng thông tin bên dưới để đăng nhập hoặc phân quyền thêm nhân sự.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/20 space-y-2 text-xs w-full md:w-auto">
            <div className="flex items-center justify-between gap-4">
              <span className="text-orange-100">Email Admin:</span>
              <div className="flex items-center space-x-1.5 font-mono font-bold">
                <span className="text-white">nhattank16.1@gmail.com</span>
                <button 
                  onClick={() => handleCopy('nhattank16.1@gmail.com', 'admin-email')}
                  className="p-1 hover:bg-white/20 rounded transition-colors"
                  title="Sao chép email"
                >
                  {copiedField === 'admin-email' ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-orange-100">Mật khẩu:</span>
              <div className="flex items-center space-x-1.5 font-mono font-bold">
                <span className="text-amber-200">Tan889603$</span>
                <button 
                  onClick={() => handleCopy('Tan889603$', 'admin-pass')}
                  className="p-1 hover:bg-white/20 rounded transition-colors"
                  title="Sao chép mật khẩu"
                >
                  {copiedField === 'admin-pass' ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 pt-1 border-t border-white/15">
              <span className="text-orange-100">Quyền hạn:</span>
              <span className="bg-amber-400/30 text-amber-100 px-2 py-0.5 rounded font-bold">
                ROOT_ADMIN (Toàn quyền)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-orange-100 shadow-2xs">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 ${
              activeTab === 'users' 
                ? 'bg-orange-500 text-white shadow-sm' 
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Danh Sách Người Dùng ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 ${
              activeTab === 'matrix' 
                ? 'bg-orange-500 text-white shadow-sm' 
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Ma Trận Phân Quyền (RBAC)</span>
          </button>

          <button
            onClick={() => setActiveTab('auth-test')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 ${
              activeTab === 'auth-test' 
                ? 'bg-orange-500 text-white shadow-sm' 
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Thử Nghiệm Đăng Nhập</span>
          </button>
        </div>

        {activeTab === 'users' && (
          <button
            onClick={handleOpenAdd}
            className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center justify-center space-x-1.5 shadow-md shadow-orange-500/20 transition-all cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Tạo Tài Khoản Mới</span>
          </button>
        )}
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
                className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-hidden focus:border-orange-500 transition-colors"
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
                        <span className="text-emerald-700 flex items-center gap-1 font-bold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Hoạt động
                        </span>
                      ) : (
                        <span className="text-red-600 flex items-center gap-1 font-bold">
                          <XCircle className="w-3 h-3 text-red-500" /> Tạm khóa
                        </span>
                      )}
                    </div>
                    {user.notes && (
                      <div className="pt-1 border-t border-zinc-200 text-zinc-500 text-[11px] italic">
                        {user.notes}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400">
                    Tạo: {user.createdAt}
                  </span>
                  <div className="flex items-center space-x-1.5">
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
                        className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                  <th className="py-3 px-2 text-center text-red-700 bg-red-50/50">Admin</th>
                  <th className="py-3 px-2 text-center text-purple-700 bg-purple-50/50">Manager</th>
                  <th className="py-3 px-2 text-center text-orange-700 bg-orange-50/50">Sales</th>
                  <th className="py-3 px-2 text-center text-blue-700 bg-blue-50/50">Technician</th>
                  <th className="py-3 px-2 text-center text-emerald-700 bg-emerald-50/50">Accountant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                <tr className="hover:bg-zinc-50">
                  <td className="py-3 px-3 font-semibold text-zinc-800">Quản lý tài khoản & Phân quyền user</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                </tr>
                <tr className="hover:bg-zinc-50">
                  <td className="py-3 px-3 font-semibold text-zinc-800">Xem Giá Nhập Gốc (Giá Vốn Kho IMEI)</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-red-400"><XCircle className="w-3.5 h-3.5 mx-auto text-red-400" /></td>
                  <td className="py-3 px-2 text-center text-red-400"><XCircle className="w-3.5 h-3.5 mx-auto text-red-400" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                </tr>
                <tr className="hover:bg-zinc-50">
                  <td className="py-3 px-3 font-semibold text-zinc-800">Xem Báo Cáo Doanh Thu & Lợi Nhuận Gộp</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-red-400"><XCircle className="w-3.5 h-3.5 mx-auto text-red-400" /></td>
                  <td className="py-3 px-2 text-center text-red-400"><XCircle className="w-3.5 h-3.5 mx-auto text-red-400" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                </tr>
                <tr className="hover:bg-zinc-50">
                  <td className="py-3 px-3 font-semibold text-zinc-800">Nhập Kho IMEI Mới & Cập Nhật Tình Trạng</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                </tr>
                <tr className="hover:bg-zinc-50">
                  <td className="py-3 px-3 font-semibold text-zinc-800">Tạo Đơn Bán POS & In Hóa Đơn K80</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                </tr>
                <tr className="hover:bg-zinc-50">
                  <td className="py-3 px-3 font-semibold text-zinc-800">Quản Lý Phễu Khách Hàng CRM (Zalo/TikTok)</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                </tr>
                <tr className="hover:bg-zinc-50">
                  <td className="py-3 px-3 font-semibold text-zinc-800">Duyệt Giá Thẩm Định Thu Cũ Đổi Mới</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-zinc-300">(Chỉ định giá tạm)</td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                </tr>
                <tr className="hover:bg-zinc-50">
                  <td className="py-3 px-3 font-semibold text-zinc-800">Tiếp Nhận Bảo Hành & Chẩn Đoán AI</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                  <td className="py-3 px-2 text-center"><Check className="w-4 h-4 mx-auto text-emerald-600 font-bold" /></td>
                  <td className="py-3 px-2 text-center text-zinc-300">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: AUTH TEST & LOGIN PANEL */}
      {activeTab === 'auth-test' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-2xs space-y-4">
            <div>
              <h3 className="font-bold text-zinc-800 text-sm flex items-center gap-2">
                <Key className="w-4 h-4 text-orange-600" />
                Kiểm Tra Đăng Nhập Email / Mật Khẩu
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Xác thực trực tiếp với Firebase Authentication
              </p>
            </div>

            <form onSubmit={handleTestLogin} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Email Đăng Nhập</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl focus:border-orange-500 focus:outline-hidden font-mono"
                  placeholder="admin@istore.vn"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Mật Khẩu</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl focus:border-orange-500 focus:outline-hidden font-mono"
                  placeholder="••••••••"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs py-2.5 rounded-xl transition-colors shadow-sm"
              >
                Xác Thực Đăng Nhập
              </button>
            </form>

            {loginStatus && (
              <div className={`p-3 rounded-xl text-xs font-medium ${
                loginStatus.startsWith('✅') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                loginStatus.startsWith('❌') ? 'bg-red-50 text-red-800 border border-red-200' :
                'bg-blue-50 text-blue-800 border border-blue-200'
              }`}>
                {loginStatus}
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-2xl p-5 text-white shadow-lg space-y-4">
            <div className="flex items-center space-x-2 text-orange-400 text-xs font-bold">
              <Sparkles className="w-4 h-4" />
              <span>Chính Sách Bảo Mật Tài Khoản</span>
            </div>

            <h4 className="text-base font-bold">Bảo Mật Đa Tầng Cửa Hàng Điện Thoại</h4>

            <ul className="space-y-2.5 text-xs text-zinc-300">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Ẩn Giá Nhập:</strong> Nhân viên bán hàng chỉ thấy giá niêm yết bán lẻ và mức chiết khấu cho phép, bảo mật tuyệt đối biên lợi nhuận của cửa hàng.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Chống Gian Lận Thu Cũ:</strong> Mức giá thu máy cũ trên 15 triệu bắt buộc phải có tài khoản Cửa Hàng Trưởng (Manager) hoặc Admin duyệt.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Đồng Bộ Đám Mây:</strong> Toàn bộ thao tác tạo tài khoản và phân cấp được đồng bộ ngay tức khắc lên Firebase Cloud Firestore.</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* CREATE / EDIT USER MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-orange-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
              <div className="flex items-center space-x-2">
                <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 text-base">
                    {editingUser ? 'Chỉnh Sửa Tài Khoản Nhân Viên' : 'Tạo Tài Khoản & Phân Quyền Mới'}
                  </h3>
                  <p className="text-xs text-zinc-500">Cấu hình vai trò và quyền hạn chi tiết</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitUser} className="space-y-4 mt-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Họ và Tên <span className="text-red-500">*</span></label>
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
                <label className="block font-bold text-zinc-700 mb-1">Email Đăng Nhập <span className="text-red-500">*</span></label>
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
                  submitMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {submitMessage.text}
                </div>
              )}

              <div className="pt-3 border-t border-zinc-100 flex items-center justify-end space-x-2">
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
      )}
    </div>
  );
};
