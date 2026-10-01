import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

// Firebase is used for sign-in only; all data goes through the API (src/lib/data.ts).
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyASk304evj73LHi7cdiqz_Yzc6IVFuJYjk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "acts-bible-school-portal.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "acts-bible-school-portal",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "acts-bible-school-portal.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "370934730766",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:370934730766:web:161e8329df3d89d7146c5f"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Local development against the Firebase Auth emulator (never set in production).
if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
