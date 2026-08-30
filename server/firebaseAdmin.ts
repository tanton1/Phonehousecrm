import { cert, initializeApp, getApps, getApp, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase Admin SDK using modular subpaths
let adminApp: App;
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

function getServiceAccountCredential() {
  if (!serviceAccountJson) return undefined;
  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    if (typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    return cert(serviceAccount);
  } catch (error) {
    console.error('[Firebase Admin] FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON.', error);
    return undefined;
  }
}

if (getApps().length === 0) {
  try {
    const serviceAccountCredential = getServiceAccountCredential();
    adminApp = initializeApp({
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
      ...(serviceAccountCredential ? { credential: serviceAccountCredential } : {})
    });
  } catch (error) {
    console.warn('[Firebase Admin] Initializing with default app:', error);
    adminApp = initializeApp();
  }
} else {
  adminApp = getApp();
}

export const adminAuth = getAuth(adminApp);
export const adminAppCheck = getAppCheck(adminApp);
export const adminBucket = getStorage(adminApp).bucket();
export const adminDb = getFirestore(
  adminApp,
  process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId
);
export default adminApp;
