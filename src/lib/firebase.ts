import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  type ConfirmationResult
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import type { AppCheck } from 'firebase/app-check';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App singleton
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Customer OTP must not replace the authenticated staff session when a shop
// employee previews PhoneHouse Care in the same browser profile.
let customerApp: FirebaseApp | null = null;
export const customerAuth = (() => {
  if (typeof window === 'undefined') return getAuth(app);
  customerApp = getApps().find(instance => instance.name === 'phonehouse-care')
    || initializeApp(firebaseConfig, 'phonehouse-care');
  const instance = getAuth(customerApp);
  instance.languageCode = 'vi';
  return instance;
})();

// CRITICAL: The app will break without firebaseConfig.firestoreDatabaseId
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

let appCheck: AppCheck | null = null;
let appCheckInitialization: Promise<AppCheck | null> | null = null;
const recaptchaSiteKey = String(
  (import.meta as any).env?.VITE_FIREBASE_APPCHECK_SITE_KEY
  || firebaseConfig.recaptchaSiteKey
  || ''
).trim();

async function resolveAppCheck(): Promise<AppCheck | null> {
  if (appCheck) return appCheck;
  if (typeof window === 'undefined' || !recaptchaSiteKey) return null;
  if (!appCheckInitialization) {
    appCheckInitialization = import('firebase/app-check')
      .then(({ ReCaptchaEnterpriseProvider, initializeAppCheck }) => {
        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
          isTokenAutoRefreshEnabled: true
        });
        return appCheck;
      })
      .catch(error => {
        console.warn('[Firebase App Check] Không thể khởi tạo:', error);
        return null;
      });
  }
  return appCheckInitialization;
}

export async function getPhoneHouseAppCheckToken(): Promise<string | null> {
  const instance = await resolveAppCheck();
  if (!instance) return null;
  try {
    const { getToken } = await import('firebase/app-check');
    return (await getToken(instance, false)).token;
  } catch (error) {
    console.warn('[Firebase App Check] Không thể lấy token:', error);
    return null;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    authenticated: boolean;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): FirestoreErrorInfo | void {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const lowerMsg = errorMsg.toLowerCase();

  // Gracefully ignore or warn on transient IndexedDB closure, tab hidden, or offline lifecycle states
  if (
    lowerMsg.includes('closing') ||
    lowerMsg.includes('hidden') ||
    lowerMsg.includes('database is closing') ||
    lowerMsg.includes('client is offline') ||
    lowerMsg.includes('terminated') ||
    lowerMsg.includes('unavailable')
  ) {
    console.warn(`[Firestore Lifecycle] Non-critical state (${operationType} at ${path}):`, errorMsg);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorMsg,
    authInfo: {
      authenticated: Boolean(auth.currentUser),
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  return errInfo;
}

// Test Connection on boot
export async function testFirestoreConnection(): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser) return false;
  try {
    await getDocFromServer(doc(db, 'users', currentUser.uid));
    console.log('✅ Firestore connection verified with database:', firebaseConfig.firestoreDatabaseId);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore is currently offline or connecting in cache mode.');
    } else {
      console.warn('Firestore connection check failed.');
    }
    return false;
  }
}

// Auth Helpers
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Google Sign-in error:', error);
    throw error;
  }
}

export async function loginWithEmail(email: string, pass: string) {
  try {
    const res = await signInWithEmailAndPassword(auth, email, pass);
    return res.user;
  } catch (error: any) {
    throw error;
  }
}

export async function requestPasswordReset(email: string) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) throw new Error('auth/invalid-email');
  await sendPasswordResetEmail(auth, normalizedEmail, {
    url: typeof window !== 'undefined' ? window.location.origin : undefined,
    handleCodeInApp: false
  });
}

export async function registerWithEmail(email: string, pass: string, name: string) {
  try {
    const res = await createUserWithEmailAndPassword(auth, email, pass);
    if (res.user) {
      await updateProfile(res.user, { displayName: name });
    }
    return res.user;
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
}

export async function logOut() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
}

let phoneRecaptcha: RecaptchaVerifier | null = null;
let phoneRecaptchaContainerId = '';
let phoneRecaptchaInitialization: Promise<RecaptchaVerifier> | null = null;
let phoneRecaptchaLibraryInitialization: Promise<void> | null = null;

type RecaptchaV2 = {
  render?: (...args: unknown[]) => unknown;
  ready?: (callback: () => void) => void;
};

function hasPhoneRecaptchaLibrary() {
  if (typeof window === 'undefined') return false;
  const recaptcha = (window as Window & { grecaptcha?: RecaptchaV2 }).grecaptcha;
  return typeof recaptcha?.render === 'function' && typeof recaptcha?.ready === 'function';
}

function waitForPhoneRecaptchaLibrary(timeoutMs = 8_000): Promise<void> {
  if (hasPhoneRecaptchaLibrary()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (hasPhoneRecaptchaLibrary()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('RECAPTCHA_LIBRARY_TIMEOUT'));
        return;
      }
      window.setTimeout(check, 100);
    };
    check();
  });
}

function loadPhoneRecaptchaScript(url: string): Promise<void> {
  const baseUrl = url.split('?')[0];
  const existing = Array.from(document.scripts).find(script => script.src.startsWith(baseUrl));
  if (existing) return waitForPhoneRecaptchaLibrary();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.defer = true;
    script.type = 'text/javascript';
    script.charset = 'UTF-8';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('RECAPTCHA_SCRIPT_LOAD_FAILED'));
    document.head.appendChild(script);
  });
}

/**
 * Firebase Auth normally loads reCAPTCHA from www.google.com. Some mobile
 * webviews, privacy browsers and carrier networks block that host while still
 * allowing the official recaptcha.net mirror. Load the mirror first so the
 * Firebase SDK can reuse the same grecaptcha v2 instance.
 */
async function ensurePhoneRecaptchaLibrary() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('PHONE_AUTH_BROWSER_REQUIRED');
  }
  if (hasPhoneRecaptchaLibrary()) return;
  if (!phoneRecaptchaLibraryInitialization) {
    phoneRecaptchaLibraryInitialization = (async () => {
      const urls = [
        'https://www.recaptcha.net/recaptcha/api.js?render=explicit&hl=vi',
        'https://www.google.com/recaptcha/api.js?render=explicit&hl=vi'
      ];
      let lastError: unknown = null;
      for (const url of urls) {
        try {
          await loadPhoneRecaptchaScript(url);
          await waitForPhoneRecaptchaLibrary();
          return;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error('RECAPTCHA_LIBRARY_UNAVAILABLE');
    })().catch(error => {
      phoneRecaptchaLibraryInitialization = null;
      throw error;
    });
  }
  await phoneRecaptchaLibraryInitialization;
}

function withPhoneAuthTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      value => { window.clearTimeout(timeoutId); resolve(value); },
      error => { window.clearTimeout(timeoutId); reject(error); }
    );
  });
}

function customerPhoneAuthError(error: unknown): Error {
  const code = String(
    (error as { code?: unknown })?.code
    || (error as { message?: unknown })?.message
    || ''
  );
  if (code === 'auth/network-request-failed') {
    return new Error('Không kết nối được dịch vụ xác minh OTP. Hãy tắt VPN/chặn quảng cáo nếu có, kiểm tra mạng rồi bấm gửi lại.');
  }
  if (code === 'auth/too-many-requests') {
    return new Error('Số điện thoại này đã yêu cầu OTP quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.');
  }
  if (code === 'auth/captcha-check-failed' || code === 'auth/missing-app-credential') {
    return new Error('Phiên xác minh chống spam chưa hợp lệ. Vui lòng bấm gửi lại mã OTP.');
  }
  if (code === 'RECAPTCHA_LIBRARY_TIMEOUT' || code === 'RECAPTCHA_SCRIPT_LOAD_FAILED' || code === 'RECAPTCHA_LIBRARY_UNAVAILABLE') {
    return new Error('Không tải được bước xác minh chống spam. Hãy mở trang bằng Chrome/Safari, tắt chặn quảng cáo hoặc VPN rồi thử lại.');
  }
  if (error instanceof Error) return error;
  return new Error('Không thể gửi OTP lúc này. Vui lòng thử lại.');
}

export async function prepareCustomerPhoneRecaptcha(containerId: string): Promise<RecaptchaVerifier> {
  if (typeof window === 'undefined') throw new Error('PHONE_AUTH_BROWSER_REQUIRED');
  if (!document.getElementById(containerId)) throw new Error('PHONE_AUTH_RECAPTCHA_CONTAINER_MISSING');
  if (phoneRecaptcha && phoneRecaptchaContainerId === containerId) {
    return phoneRecaptchaInitialization || phoneRecaptcha;
  }
  await ensurePhoneRecaptchaLibrary().catch(error => { throw customerPhoneAuthError(error); });
  resetCustomerPhoneRecaptcha();
  phoneRecaptchaContainerId = containerId;
  phoneRecaptcha = new RecaptchaVerifier(customerAuth, containerId, {
    size: window.innerWidth < 380 ? 'compact' : 'normal',
    'expired-callback': resetCustomerPhoneRecaptcha
  });
  const verifier = phoneRecaptcha;
  phoneRecaptchaInitialization = withPhoneAuthTimeout(
    verifier.render().then(() => verifier),
    20_000,
    'Dịch vụ xác minh OTP phản hồi quá chậm. Vui lòng kiểm tra mạng rồi thử lại.'
  ).catch(error => {
    resetCustomerPhoneRecaptcha();
    throw customerPhoneAuthError(error);
  });
  return phoneRecaptchaInitialization;
}

export async function requestCustomerPhoneOtp(phone: string, containerId: string): Promise<ConfirmationResult> {
  const digits = String(phone || '').replace(/\D/g, '');
  const normalized = digits.startsWith('84') ? `+${digits}` : digits.startsWith('0') ? `+84${digits.slice(1)}` : `+84${digits}`;
  if (!/^\+84\d{9}$/.test(normalized)) throw new Error('Số điện thoại Việt Nam chưa hợp lệ.');
  try {
    const verifier = await prepareCustomerPhoneRecaptcha(containerId);
    return await withPhoneAuthTimeout(
      signInWithPhoneNumber(customerAuth, normalized, verifier),
      45_000,
      'Yêu cầu gửi OTP quá thời gian chờ. Vui lòng kiểm tra mạng rồi bấm gửi lại.'
    );
  } catch (error) {
    resetCustomerPhoneRecaptcha();
    throw customerPhoneAuthError(error);
  }
}

export function resetCustomerPhoneRecaptcha() {
  phoneRecaptcha?.clear();
  phoneRecaptcha = null;
  phoneRecaptchaContainerId = '';
  phoneRecaptchaInitialization = null;
}

/**
 * Requests browser notification permission only after an explicit customer
 * action, then binds the FCM token to the customer-scoped service worker.
 */
export async function requestCustomerPushToken(): Promise<string> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window)) {
    throw new Error('Thiết bị này chưa hỗ trợ thông báo đẩy trên trình duyệt.');
  }
  const vapidKey = String((import.meta as any).env?.VITE_FIREBASE_MESSAGING_VAPID_KEY || '').trim();
  const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) throw new Error('Trình duyệt này chưa hỗ trợ thông báo đẩy.');
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Bạn chưa cho phép PhoneHouse Care gửi thông báo.');
  const registration = await navigator.serviceWorker.register('/customer-sw.js', { scope: '/khach-hang' });
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(customerApp || app), {
    serviceWorkerRegistration: registration,
    ...(vapidKey ? { vapidKey } : {})
  });
  if (!token) throw new Error('Không tạo được mã nhận thông báo cho thiết bị này.');
  return token;
}

