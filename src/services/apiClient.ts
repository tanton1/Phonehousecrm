import { auth, customerAuth, getPhoneHouseAppCheckToken } from '../lib/firebase';

const API_BASE = String((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Most API calls should fail fast, but a deliberate one-time setup may write
 * many records. It can opt into a longer client wait without weakening the
 * timeout for normal POS and inventory actions.
 */
export interface ApiRequestInit extends RequestInit {
  timeoutMs?: number;
}

export class ApiClientError extends Error {
  status: number;
  code: string;
  data?: unknown;

  constructor(message: string, status: number, code = '', data?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

/**
 * Universal, Safe API Request Helper with Content-Type & Status Validation
 */
export async function apiJson<T>(
  path: string,
  init: ApiRequestInit = {}
): Promise<T> {
  const { timeoutMs = 15000, ...requestInit } = init;
  const isCustomerPortal = path.startsWith('/api/customer-portal');
  const isStaffPortal = path.startsWith('/api/customer-portal/staff');
  const method = String(requestInit.method || 'GET').toUpperCase();
  const isPublicCustomerRead = path.startsWith('/api/customer-portal/public/') && method === 'GET';
  const authPrincipal = isCustomerPortal && !isStaffPortal ? customerAuth.currentUser : auth.currentUser;
  const [token, appCheckToken] = await Promise.all([
    authPrincipal?.getIdToken(false).catch(() => null),
    // Public catalog/bootstrap reads are intentionally unauthenticated on the
    // server. They must not leave the guest portal blank when the attestation
    // provider is slow or blocked. Protected mutations still wait for App Check.
    isPublicCustomerRead ? Promise.resolve(null) : getPhoneHouseAppCheckToken()
  ]);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = API_BASE ? `${API_BASE}${cleanPath}` : cleanPath;

  try {
    const response = await fetch(fullUrl, {
      ...requestInit,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {}),
        ...(requestInit.headers || {})
      }
    });

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (!contentType.includes('application/json')) {
      if (text.startsWith('<!doctype html>') || text.startsWith('<html')) {
        throw new Error(
          `Lỗi kết nối máy chủ: Endpoint "${cleanPath}" trả về HTML (HTTP ${response.status}) thay vì JSON. Vui lòng kiểm tra backend deployment.`
        );
      }
      throw new Error(`API trả về Content-Type "${contentType || 'unknown'}", không phải JSON.`);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`Phản hồi từ máy chủ không đúng định dạng JSON: ${text.slice(0, 100)}`);
    }

    if (!response.ok) {
      let errMsg = '';
      if (typeof parsed?.error === 'string') {
        errMsg = parsed.error;
      } else if (typeof parsed?.message === 'string') {
        errMsg = parsed.message;
      } else if (typeof parsed?.error?.message === 'string') {
        errMsg = parsed.error.message;
      } else if (parsed) {
        errMsg = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
      } else {
        errMsg = `HTTP ${response.status}: Yêu cầu thất bại.`;
      }
      throw new ApiClientError(errMsg, response.status, String(parsed?.code || parsed?.error || ''), parsed?.data);
    }

    return parsed as T;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Yêu cầu tới "${cleanPath}" đã quá thời gian chờ (${Math.round(timeoutMs / 1000)}s). Vui lòng thử lại.`);
    }
    if (err instanceof ApiClientError) throw err;
    const finalMsg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err) || 'Lỗi kết nối không xác định.');
    throw new Error(finalMsg);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/** Authenticated binary upload helper for evidence fallback routes. */
export async function apiBinary<T>(path: string, body: Blob, contentType: string, timeoutMs = 45_000): Promise<T> {
  const isCustomerPortal = path.startsWith('/api/customer-portal');
  const isStaffPortal = path.startsWith('/api/customer-portal/staff');
  const authPrincipal = isCustomerPortal && !isStaffPortal ? customerAuth.currentUser : auth.currentUser;
  const [token, appCheckToken] = await Promise.all([
    authPrincipal?.getIdToken(false).catch(() => null),
    getPhoneHouseAppCheckToken()
  ]);
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = API_BASE ? `${API_BASE}${cleanPath}` : cleanPath;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(fullUrl, {
      method: 'PUT', body, signal: controller.signal,
      headers: {
        Accept: 'application/json', 'Content-Type': contentType,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {})
      }
    });
    const parsed = await response.json().catch(() => null);
    if (!response.ok || !parsed) throw new Error(parsed?.message || parsed?.error || `Tải tệp thất bại (HTTP ${response.status}).`);
    return parsed as T;
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('Tải tệp quá thời gian chờ. Vui lòng thử lại.');
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
