import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { registerTokenProvider } from '../lib/api';

declare const firebase: any;

type DeepCastUser = {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  isAnonymous: boolean;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
};

type AuthContextValue = {
  user: DeepCastUser | null;
  loading: boolean;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  createAccount: (email: string, password: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  ensureIdentity: () => Promise<DeepCastUser>;
};

const firebaseConfig = {
  apiKey: 'AIzaSyDPomHZbHwGKL4pB0bSQ0jW2g1TQQ6yH5E',
  authDomain: 'gen-lang-client-0517688749.firebaseapp.com',
  projectId: 'gen-lang-client-0517688749',
  storageBucket: 'gen-lang-client-0517688749.firebasestorage.app',
  messagingSenderId: '756332446494',
  appId: '1:756332446494:web:1d4e47a7b4513245b9ff0f',
};

let auth: any = null;
function getAuth() {
  if (auth) return auth;
  if (typeof firebase === 'undefined') throw new Error('Firebase Authentication failed to load.');
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => undefined);
  return auth;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DeepCastUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub = () => undefined;
    try { unsub = getAuth().onAuthStateChanged((next: DeepCastUser | null) => { setUser(next); setLoading(false); }); }
    catch { setLoading(false); }
    return () => unsub();
  }, []);
  useEffect(() => registerTokenProvider(async () => {
    const a = getAuth();
    if (!a.currentUser) await a.signInAnonymously();
    return a.currentUser ? a.currentUser.getIdToken() : null;
  }), []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    signInGoogle: async () => {
      const a = getAuth();
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (a.currentUser?.isAnonymous) {
        if (mobile) await a.currentUser.linkWithRedirect(provider);
        else await a.currentUser.linkWithPopup(provider);
      } else if (mobile) await a.signInWithRedirect(provider);
      else await a.signInWithPopup(provider);
    },
    signInEmail: async (email, password) => { await getAuth().signInWithEmailAndPassword(email, password); },
    createAccount: async (email, password) => {
      const a = getAuth();
      const credential = a.currentUser?.isAnonymous
        ? await a.currentUser.linkWithCredential(firebase.auth.EmailAuthProvider.credential(email, password))
        : await a.createUserWithEmailAndPassword(email, password);
      await credential.user?.sendEmailVerification().catch(() => undefined);
    },
    continueAsGuest: async () => { await getAuth().signInAnonymously(); },
    resetPassword: async email => { await getAuth().sendPasswordResetEmail(email); },
    signOut: async () => { await getAuth().signOut(); },
    ensureIdentity: async () => {
      if (getAuth().currentUser) return getAuth().currentUser as DeepCastUser;
      const credential = await getAuth().signInAnonymously();
      return credential.user as DeepCastUser;
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
