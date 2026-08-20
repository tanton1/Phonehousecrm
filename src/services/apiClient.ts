import { auth } from '../lib/firebase';

const API_BASE = String((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Universal, Safe API Request Helper with Content-Type & Status Validation
 */
export async function apiJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await auth.currentUser?.getIdToken(false).catch(() => null);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = API_BASE ? `${API_BASE}${cleanPath}` : cleanPath;

  try {
    const response = await fetch(fullUrl, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {})
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
      throw new Error(errMsg);
    }

    return parsed as T;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Yêu cầu tới "${cleanPath}" đã quá thời gian chờ (15s). Vui lòng thử lại.`);
    }
    const finalMsg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err) || 'Lỗi kết nối không xác định.');
    throw new Error(finalMsg);
  } finally {
    window.clearTimeout(timeoutId);
  }
}
