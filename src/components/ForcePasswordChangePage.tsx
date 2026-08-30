import React, { useState } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut
} from 'firebase/auth';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, LogOut, Mail } from 'lucide-react';
import { auth, requestPasswordReset } from '../lib/firebase';
import {
  changeRequiredPassword,
  getLoginErrorMessage
} from '../services/authApiClient';
import type { UserAccount } from '../types';
import { PhoneHouseLogo } from './PhoneHouseLogo';

interface ForcePasswordChangePageProps {
  user: UserAccount;
  onComplete: () => void;
  onLogout: () => void;
}

function validatePassword(password: string): string | null {
  if (password.length < 10) return 'Mật khẩu mới phải có ít nhất 10 ký tự.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Mật khẩu mới cần có chữ hoa, chữ thường và chữ số.';
  }
  return null;
}

export const ForcePasswordChangePage: React.FC<ForcePasswordChangePageProps> = ({
  user,
  onComplete,
  onLogout
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const passwordError = validatePassword(newPassword);
    if (passwordError) return setError(passwordError);
    if (newPassword !== confirmPassword) return setError('Mật khẩu xác nhận chưa trùng khớp.');
    if (newPassword === currentPassword) return setError('Mật khẩu mới phải khác mật khẩu hiện tại.');

    const firebaseUser = auth.currentUser;
    const email = String(firebaseUser?.email || user.email || '').trim();
    if (!firebaseUser || !email) return setError('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');

    setBusy(true);
    try {
      await reauthenticateWithCredential(firebaseUser, EmailAuthProvider.credential(email, currentPassword));
      await firebaseUser.getIdToken(true);
      await changeRequiredPassword(newPassword);
      await signOut(auth).catch(() => undefined);
      setNotice('Đã đổi mật khẩu thành công. Hệ thống sẽ chuyển về trang đăng nhập.');
      window.setTimeout(onComplete, 900);
    } catch (caught) {
      setError(getLoginErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async () => {
    setResetBusy(true);
    setError(null);
    try {
      await requestPasswordReset(user.email);
      setNotice('Nếu Email hợp lệ, Firebase đã gửi liên kết đặt lại mật khẩu. Sau khi đặt lại, hãy đăng nhập lại để hệ thống xác nhận.');
    } catch (caught) {
      const message = getLoginErrorMessage(caught);
      // Do not reveal whether an email is registered.
      if (/Email hoặc mật khẩu|chưa thành công/i.test(message)) {
        setNotice('Nếu Email hợp lệ, Firebase sẽ gửi liên kết đặt lại mật khẩu.');
      } else {
        setError(message);
      }
    } finally {
      setResetBusy(false);
    }
  };

  const logout = async () => {
    await signOut(auth).catch(() => undefined);
    onLogout();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 sm:p-6">
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-orange-100 bg-white shadow-xl shadow-zinc-200/60">
        <div className="h-1.5 bg-gradient-to-r from-orange-400 to-orange-600" />
        <div className="px-7 pb-7 pt-8 sm:px-8">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl border border-orange-100 bg-orange-50 p-2.5">
              <PhoneHouseLogo size="md" showText={false} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-orange-600">
                <KeyRound className="h-3.5 w-3.5" /> Bảo vệ tài khoản
              </div>
              <h1 className="mt-1 text-xl font-black text-zinc-900">Đổi mật khẩu lần đầu</h1>
            </div>
          </div>

          <p className="mb-5 text-sm leading-6 text-zinc-600">
            Chào <strong>{user.displayName}</strong>. Bạn cần thay mật khẩu khởi tạo trước khi truy cập dữ liệu PhoneHouse.
          </p>

          {error && (
            <div className="mb-4 flex gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold leading-5 text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          {notice && (
            <div className="mb-4 flex gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold leading-5 text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {notice}
            </div>
          )}

          <form onSubmit={submit} className="space-y-3.5">
            {[
              { label: 'Mật khẩu hiện tại', value: currentPassword, setValue: setCurrentPassword, autoComplete: 'current-password' },
              { label: 'Mật khẩu mới', value: newPassword, setValue: setNewPassword, autoComplete: 'new-password' },
              { label: 'Nhập lại mật khẩu mới', value: confirmPassword, setValue: setConfirmPassword, autoComplete: 'new-password' }
            ].map(field => (
              <label key={field.label} className="block text-xs font-bold text-zinc-700">
                {field.label}
                <div className="relative mt-1.5">
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={field.value}
                    onChange={event => field.setValue(event.target.value)}
                    autoComplete={field.autoComplete}
                    required
                    className="h-12 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3.5 pr-11 text-sm outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(value => !value)}
                    aria-label={showPasswords ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-zinc-400"
                  >
                    {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
            ))}

            <p className="rounded-xl bg-zinc-50 px-3 py-2 text-[11px] font-semibold leading-5 text-zinc-500">
              Tối thiểu 10 ký tự, gồm chữ hoa, chữ thường và chữ số.
            </p>
            <button
              type="submit"
              disabled={busy}
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-zinc-900 text-sm font-black text-white disabled:opacity-60"
            >
              {busy ? 'Đang xác minh và cập nhật…' : 'Đổi mật khẩu và tiếp tục'}
            </button>
          </form>

          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void sendReset()}
              disabled={resetBusy}
              className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 disabled:opacity-60"
            >
              <Mail className="h-3.5 w-3.5" /> {resetBusy ? 'Đang gửi…' : 'Quên mật khẩu'}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex h-10 items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-zinc-500 hover:bg-zinc-50"
            >
              <LogOut className="h-3.5 w-3.5" /> Đăng xuất
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
