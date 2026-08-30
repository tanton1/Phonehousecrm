import type { UserAccount } from '../types';
import { apiJson } from './apiClient';

type ErrorLike = {
  code?: unknown;
  message?: unknown;
};

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Địa chỉ Email không đúng định dạng.',
  'auth/invalid-credential': 'Email hoặc mật khẩu không chính xác.',
  'auth/wrong-password': 'Email hoặc mật khẩu không chính xác.',
  'auth/user-not-found': 'Email hoặc mật khẩu không chính xác.',
  'auth/user-disabled': 'Tài khoản Firebase này đã bị vô hiệu hóa. Vui lòng liên hệ Quản trị viên.',
  'auth/too-many-requests': 'Đăng nhập thất bại quá nhiều lần. Vui lòng chờ ít phút rồi thử lại.',
  'auth/network-request-failed': 'Không kết nối được dịch vụ đăng nhập. Vui lòng kiểm tra Internet.',
  'auth/popup-blocked': 'Trình duyệt đã chặn cửa sổ Google. Hãy cho phép popup cho trang này.',
  'auth/popup-closed-by-user': 'Cửa sổ đăng nhập Google đã bị đóng trước khi hoàn tất.',
  'auth/cancelled-popup-request': 'Yêu cầu đăng nhập Google trước đó đã bị hủy. Vui lòng thử lại.',
  'auth/unauthorized-domain': 'Tên miền này chưa được cho phép trong Firebase Authentication.',
  'auth/operation-not-allowed': 'Phương thức đăng nhập này chưa được bật trong Firebase.',
  'auth/account-exists-with-different-credential': 'Email này đã dùng một phương thức đăng nhập khác.',
  'auth/web-storage-unsupported': 'Trình duyệt đang chặn bộ nhớ cần thiết cho đăng nhập. Hãy cho phép cookie và dữ liệu trang web.',
  'auth/operation-not-supported-in-this-environment': 'Trình duyệt hiện tại không hỗ trợ phương thức đăng nhập này.',
  UNAUTHENTICATED: 'Phiên Firebase chưa sẵn sàng. Vui lòng đăng nhập lại.',
  USER_NOT_PROVISIONED: 'Tài khoản đã có trên Firebase nhưng chưa có hồ sơ nhân viên trong PhoneHouse. Quản trị viên cần cấp tài khoản bằng đúng Email này.',
  USER_INACTIVE: 'Tài khoản PhoneHouse này đã bị tạm khóa. Vui lòng liên hệ Quản trị viên.',
  ROLE_NOT_ASSIGNED: 'Tài khoản chưa được phân vai trò trong PhoneHouse.',
  BRANCH_NOT_ASSIGNED: 'Tài khoản chưa được gán chi nhánh làm việc.',
  INVALID_TOKEN: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
  AUTH_SERVICE_UNAVAILABLE: 'Dịch vụ xác thực PhoneHouse đang tạm thời không khả dụng. Vui lòng thử lại sau.',
  USER_PROFILE_INVALID: 'Hồ sơ nhân viên không đầy đủ thông tin bắt buộc. Vui lòng liên hệ Quản trị viên.'
};

export function getLoginErrorMessage(error: unknown): string {
  const errorLike = (error || {}) as ErrorLike;
  const code = String(errorLike.code || errorLike.message || '').trim();
  if (LOGIN_ERROR_MESSAGES[code]) return LOGIN_ERROR_MESSAGES[code];

  const firebaseCode = code.match(/\((auth\/[a-z-]+)\)/i)?.[1];
  if (firebaseCode && LOGIN_ERROR_MESSAGES[firebaseCode]) return LOGIN_ERROR_MESSAGES[firebaseCode];

  if (/quá thời gian chờ|failed to fetch|networkerror|fetch failed/i.test(code)) {
    return 'Không kết nối được máy chủ PhoneHouse. Vui lòng kiểm tra Internet và thử lại.';
  }
  if (/trả về html|content-type|endpoint api.*không tồn tại/i.test(code)) {
    return 'Máy chủ đăng nhập chưa được triển khai đúng. Vui lòng kiểm tra lại bản Vercel.';
  }

  return 'Đăng nhập chưa thành công. Vui lòng thử lại hoặc liên hệ Quản trị viên.';
}

export function assertValidAuthenticatedProfile(value: unknown): UserAccount {
  const profile = value as Partial<UserAccount> | null;
  if (
    !profile
    || !String(profile.id || '').trim()
    || !String(profile.email || '').trim()
    || !String(profile.displayName || '').trim()
    || !String(profile.role || '').trim()
    || profile.active !== true
  ) {
    throw new Error('USER_PROFILE_INVALID');
  }
  return profile as UserAccount;
}

export async function fetchAuthenticatedUserProfile(): Promise<UserAccount> {
  const response = await apiJson<{ success: boolean; user?: UserAccount }>('/api/users/me', {
    method: 'GET',
    timeoutMs: 15000
  });
  return assertValidAuthenticatedProfile(response.user);
}
