import { initializeApp, getApps, getApp, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase Admin SDK using modular subpaths
let adminApp: App;

if (getApps().length === 0) {
  try {
    adminApp = initializeApp({
      projectId: firebaseConfig.projectId
    });
  } catch (error) {
    console.warn('[Firebase Admin] Initializing with default app:', error);
    adminApp = initializeApp();
  }
} else {
  adminApp = getApp();
}

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export default adminApp;
