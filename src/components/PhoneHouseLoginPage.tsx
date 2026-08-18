import React, { useState } from 'react';
import { PhoneHouseLogo } from './PhoneHouseLogo';
import { UserAccount } from '../types';
import { 
  ShieldCheck, 
  Lock, 
  Mail, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Eye,
  EyeOff,
  Building2
} from 'lucide-react';
import { loginWithEmail, signInWithGoogle } from '../lib/firebase';

interface PhoneHouseLoginPageProps {
  users: UserAccount[];
  currentUser: UserAccount | null;
  onLoginSuccess: (user: UserAccount) => void;
  onClose?: () => void;
  isModal?: boolean;
}

export const PhoneHouseLoginPage: React.FC<PhoneHouseLoginPageProps> = ({
  users,
  currentUser,
  onLoginSuccess,
  onClose,
  isModal = false
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage('Vui lòng nhập địa chỉ Email');
      return;
    }
    if (!password) {
      setErrorMessage('Vui lòng nhập mật khẩu');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 1. Authenticate with Firebase Auth
      const firebaseUser = await loginWithEmail(email.trim(), password);

      // 2. Find profile from registered users in Firestore matching authenticated email or uid
      const matchedUser = users.find(
        u => u.email.toLowerCase() === email.toLowerCase().trim() || u.id === firebaseUser?.uid
      );

      if (matchedUser) {
        if (!matchedUser.active) {
          setErrorMessage('Tài khoản này đã bị tạm khóa. Vui lòng liên hệ Quản trị viên.');
          return;
        }
        setSuccessMessage(`Đăng nhập thành công! Chào mừng ${matchedUser.displayName}.`);
        setTimeout(() => {
          onLoginSuccess(matchedUser);
          if (onClose) onClose();
        }, 400);
      } else {
        // Fallback user account profile for newly authenticated user
        const newAccount: UserAccount = {
          id: firebaseUser?.uid || `USR-${Date.now()}`,
          email: email.trim(),
          displayName: firebaseUser?.displayName || email.split('@')[0],
          role: 'SALES', // Default role is sales
          active: true,
          createdAt: new Date().toISOString().split('T')[0],
          notes: 'Tài khoản nhân viên'
        };
        setSuccessMessage(`Đăng nhập thành công!`);
        setTimeout(() => {
          onLoginSuccess(newAccount);
          if (onClose) onClose();
        }, 400);
      }
    } catch (err: any) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setErrorMessage('Mật khẩu không chính xác hoặc tài khoản không tồn tại.');
      } else if (err.code === 'auth/user-not-found') {
        setErrorMessage('Không tìm thấy tài khoản với địa chỉ Email này.');
      } else if (err.code === 'auth/too-many-requests') {
        setErrorMessage('Đăng nhập thất bại quá nhiều lần. Vui lòng thử lại sau ít phút.');
      } else {
        setErrorMessage(err?.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const googleUser = await signInWithGoogle();
      if (googleUser && googleUser.email) {
        const matched = users.find(u => u.email.toLowerCase() === googleUser.email?.toLowerCase());
        const userToSet: UserAccount = matched || {
          id: googleUser.uid,
          email: googleUser.email,
          displayName: googleUser.displayName || googleUser.email.split('@')[0],
          role: 'SALES',
          avatarUrl: googleUser.photoURL || undefined,
          active: true,
          createdAt: new Date().toISOString().split('T')[0]
        };
        setSuccessMessage(`Đăng nhập Google thành công!`);
        setTimeout(() => {
          onLoginSuccess(userToSet);
          if (onClose) onClose();
        }, 400);
      }
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      if (err?.code === 'auth/popup-blocked' || err?.message?.includes('popup')) {
        setErrorMessage('Trình duyệt đã chặn cửa sổ Popup. Vui lòng cho phép popup để đăng nhập Google.');
      } else {
        setErrorMessage('Không thể kết nối Google Auth. Vui lòng thử lại.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`w-full ${isModal ? 'p-0' : 'min-h-[90vh] flex items-center justify-center p-4 sm:p-6 bg-zinc-50'}`}>
      <div className="w-full max-w-md mx-auto bg-white rounded-[2rem] shadow-xl shadow-zinc-200/50 border border-zinc-100 overflow-hidden relative">
        
        {/* Simple Top Accent Line */}
        <div className="h-1.5 w-full bg-gradient-to-r from-orange-400 via-orange-500 to-orange-500"></div>

        {/* Header Content */}
        <div className="p-8 pb-6 text-center">
          <div className="flex justify-center mb-5 hover:scale-105 transition-transform duration-300">
            <div className="bg-orange-50 p-3 rounded-2xl border border-orange-100">
              <PhoneHouseLogo size="lg" showText={false} />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">PhoneHouse CRM & ERP</h1>
          <p className="text-[13px] text-zinc-500 mt-2 font-medium">Đăng nhập tài khoản để truy cập hệ thống</p>
        </div>

        {/* Main Form Content */}
        <div className="px-8 pb-8">
          
          {/* Alerts */}
          {errorMessage && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start space-x-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="leading-relaxed font-medium">{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-5 p-3.5 bg-orange-50 border border-orange-200 rounded-2xl flex items-center space-x-2.5 text-xs text-orange-700">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span className="font-semibold">{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleEmailPasswordLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5 ml-1">Địa chỉ Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@phonehouse.vn"
                  required
                  autoComplete="username"
                  className="w-full pl-10 pr-3.5 py-3 bg-zinc-50 border border-zinc-200 focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 rounded-2xl text-[13px] font-medium text-zinc-900 outline-none transition-all placeholder:text-zinc-400"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5 ml-1 mr-1">
                <label className="text-xs font-semibold text-zinc-700">Mật khẩu</label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu..."
                  required
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-3 bg-zinc-50 border border-zinc-200 focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 rounded-2xl text-[13px] font-medium text-zinc-900 outline-none transition-all placeholder:text-zinc-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-zinc-600 cursor-pointer transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-zinc-900 hover:bg-zinc-800 active:bg-black text-white text-[13px] font-semibold rounded-2xl shadow-md transition-all flex justify-center items-center gap-2 cursor-pointer disabled:opacity-70 mt-2"
            >
              {isLoading ? 'Đang xử lý...' : 'Đăng Nhập Hệ Thống'}
              {!isLoading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="relative py-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-white text-zinc-400 font-medium">Hoặc tiếp tục với</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-3 px-4 bg-white border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-[13px] font-semibold rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-70"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Tài khoản Google
          </button>

        </div>

        {/* Footer info */}
        <div className="bg-zinc-50/80 p-4 border-t border-zinc-100 flex items-center justify-center gap-4 text-[11px] text-zinc-400 font-medium">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-orange-500" />
            <span>Xác thực Firebase Auth</span>
          </div>
          <div className="w-1 h-1 rounded-full bg-zinc-300"></div>
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            <span>Phone House</span>
          </div>
        </div>

      </div>
    </div>
  );
};
