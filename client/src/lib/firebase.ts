import { getApp, getApps, initializeApp } from "firebase/app";
import { isSupported, getAnalytics, type Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyC2Iul4izEMcdvuVyOwibQPuTEFgEhrlEY",
  authDomain: "rewally-bfafb.firebaseapp.com",
  projectId: "rewally-bfafb",
  storageBucket: "rewally-bfafb.firebasestorage.app",
  messagingSenderId: "142646765615",
  appId: "1:142646765615:web:5c64928442eaef240e7eda",
  measurementId: "G-MVSFGX83BX",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

let analyticsPromise: Promise<Analytics | null> | null = null;

// Analytics only works in the browser (it reads window/indexedDB), so this
// must never run during SSR/static generation - callers await this from a
// "use client" component's useEffect, not from render.
export function getFirebaseAnalytics() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!analyticsPromise) {
    analyticsPromise = isSupported().then((supported) => (supported ? getAnalytics(firebaseApp) : null));
  }
  return analyticsPromise;
}
