import { NextFunction, Request, Response } from 'express';
import { adminAppCheck, adminAuth, adminDb } from '../firebaseAdmin';
import { normalizePartyPhone } from '../services/branchPartyService';

export interface CustomerIdentity {
  uid: string;
  phoneNumber: string;
  phoneNormalized: string;
  authTime?: number;
}
export interface CustomerAccountAuthority extends CustomerIdentity {
  account: Record<string, any>;
}

declare global {
  namespace Express {
    interface Request {
      customerIdentity?: CustomerIdentity;
      customer?: CustomerAccountAuthority;
    }
  }
}

function authError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, code, error: code, message });
}

async function verifyAppCheck(req: Request, res: Response, productionRequired = false): Promise<boolean> {
  const globallyEnforced = String(process.env.APP_CHECK_ENFORCED || '').toLowerCase() === 'true';
  if (!globallyEnforced && !(productionRequired && process.env.NODE_ENV === 'production')) return true;
  const appCheckToken = String(req.headers['x-firebase-appcheck'] || '').trim();
  if (!appCheckToken) {
    authError(res, 401, 'APP_CHECK_REQUIRED', 'Thiết bị chưa vượt qua bước xác minh ứng dụng.');
    return false;
  }
  try {
    await adminAppCheck.verifyToken(appCheckToken);
    return true;
  } catch {
    authError(res, 401, 'APP_CHECK_INVALID', 'Mã xác minh ứng dụng không hợp lệ hoặc đã hết hạn.');
    return false;
  }
}

/**
 * Public PhoneHouse Care mutations do not require a customer login, but they
 * still require an authentic application client whenever App Check is
 * enforced. Keeping this separate from Phone Auth prevents public lead forms
 * from accidentally inheriting staff/customer identity rules.
 */
export async function requireCustomerAppCheck(req: Request, res: Response, next: NextFunction) {
  // Public lead mutations are always App Check protected in production even
  // while the rest of the portal is being rolled out with global enforcement
  // disabled. Development remains usable without a reCAPTCHA site key.
  if (!(await verifyAppCheck(req, res, true))) return;
  return next();
}

/**
 * Verifies a Firebase Phone Auth principal without consulting users/{uid}.
 * Customer identities deliberately live outside the staff authority model.
 */
export async function authenticateCustomerIdentity(req: Request, res: Response, next: NextFunction) {
  if (!(await verifyAppCheck(req, res))) return;
  const authHeader = String(req.headers.authorization || '');

  if (!authHeader.startsWith('Bearer ')) {
    const devUid = String(req.headers['x-customer-uid'] || '').trim();
    const devPhone = normalizePartyPhone(req.headers['x-customer-phone']);
    if (process.env.NODE_ENV !== 'production' && devUid && /^0\d{9}$/.test(devPhone)) {
      req.customerIdentity = { uid: devUid, phoneNumber: devPhone, phoneNormalized: devPhone, authTime: Math.floor(Date.now() / 1000) };
      return next();
    }
    return authError(res, 401, 'CUSTOMER_UNAUTHENTICATED', 'Vui lòng xác thực số điện thoại để tiếp tục.');
  }

  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7).trim());
    const phoneNumber = String(decoded.phone_number || '').trim();
    const phoneNormalized = normalizePartyPhone(phoneNumber);
    if (!/^0\d{9}$/.test(phoneNormalized)) {
      return authError(res, 403, 'CUSTOMER_PHONE_AUTH_REQUIRED', 'Tài khoản phải được xác thực bằng OTP điện thoại.');
    }
    req.customerIdentity = {
      uid: decoded.uid,
      phoneNumber,
      phoneNormalized,
      authTime: Number(decoded.auth_time || 0) || undefined
    };
    return next();
  } catch {
    return authError(res, 401, 'CUSTOMER_TOKEN_INVALID', 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ.');
  }
}

export async function authenticateCustomer(req: Request, res: Response, next: NextFunction) {
  return authenticateCustomerIdentity(req, res, async () => {
    const identity = req.customerIdentity!;
    try {
      const snapshot = await adminDb.collection('customerAccounts').doc(identity.uid).get();
      if (!snapshot.exists) {
        return authError(res, 403, 'CUSTOMER_ACCOUNT_LINK_REQUIRED', 'Tài khoản khách hàng chưa được liên kết với dữ liệu PhoneHouse.');
      }
      const account = snapshot.data() || {};
      if (account.status === 'BLOCKED' || account.isActive === false) {
        return authError(res, 403, 'CUSTOMER_ACCOUNT_BLOCKED', 'Tài khoản khách hàng đang bị tạm khóa.');
      }
      if (normalizePartyPhone(account.phoneNormalized) !== identity.phoneNormalized) {
        return authError(res, 403, 'CUSTOMER_ACCOUNT_PHONE_MISMATCH', 'Số điện thoại đăng nhập không khớp hồ sơ đã liên kết.');
      }
      req.customer = { ...identity, account: { id: snapshot.id, ...account } };
      return next();
    } catch (error) {
      console.error('[Customer account lookup]', error);
      return authError(res, 503, 'CUSTOMER_ACCOUNT_LOOKUP_FAILED', 'Không thể kiểm tra hồ sơ khách hàng lúc này.');
    }
  });
}
