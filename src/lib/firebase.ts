import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import type { AppCheck } from 'firebase/app-check';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App singleton
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

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
      .then(({ ReCaptchaV3Provider, initializeAppCheck }) => {
        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(recaptchaSiteKey),
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

