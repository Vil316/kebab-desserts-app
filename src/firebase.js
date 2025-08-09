import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCIxUJPz2Ckr_1roTdoOLYxAQn-b7i6ly8",
  authDomain: "kdos-28f1d.firebaseapp.com",
  projectId: "kdos-28f1d",
  storageBucket: "kdos-28f1d.firebasestorage.app",
  messagingSenderId: "445966692721",
  appId: "1:445966692721:web:ef6e1d313bd00a3f07c6d0",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

const auth = getAuth(app);
export function ensureAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (u) => {
      if (u) return resolve(u);
      await signInAnonymously(auth);
    });
  });
}