"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { handleEvent, runRetroactiveScan } from "@/src/lib/badgeCheck";

type AuthResult = { ok: boolean; error?: string };

type AuthState = {
  nickname: string | null;
  ready: boolean;
  login: (nickname: string, password: string) => Promise<AuthResult>;
  signup: (nickname: string, password: string) => Promise<AuthResult>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);
const STORAGE_KEY = "auth:nickname";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [nickname, setNickname] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setNickname(stored);
      runRetroactiveScan(stored).catch(() => {});
      handleEvent({ type: "login", nickname: stored });
    }
    setReady(true);
  }, []);

  const login = useCallback(
    async (nick: string, password: string): Promise<AuthResult> => {
      const n = nick.trim();
      const p = password.trim();
      if (!n || !p) return { ok: false, error: "닉네임과 비밀번호를 입력해주세요." };
      try {
        const snap = await getDoc(doc(db, "users", n));
        if (!snap.exists()) return { ok: false, error: "존재하지 않는 닉네임입니다." };
        if (snap.data().password !== p) {
          return { ok: false, error: "비밀번호가 일치하지 않습니다." };
        }
        localStorage.setItem(STORAGE_KEY, n);
        setNickname(n);
        runRetroactiveScan(n).catch(() => {});
        handleEvent({ type: "login", nickname: n });
        return { ok: true };
      } catch (e) {
        console.error(e);
        return { ok: false, error: "로그인 중 오류가 발생했습니다." };
      }
    },
    [],
  );

  const signup = useCallback(
    async (nick: string, password: string): Promise<AuthResult> => {
      const n = nick.trim();
      const p = password.trim();
      if (!n || !p) return { ok: false, error: "닉네임과 비밀번호를 입력해주세요." };
      try {
        const snap = await getDoc(doc(db, "users", n));
        if (snap.exists()) return { ok: false, error: "이미 사용 중인 닉네임입니다." };
        // Only write users/{n}. The members doc is intentionally NOT
        // created here — it's the explicit "프로필 등록" / claim button
        // inside 미니홈피 that creates members/{n}. Until then this
        // signup shows up in the 잠든 별들 section (the page lists
        // every users doc that has no matching members doc).
        await setDoc(doc(db, "users", n), {
          nickname: n,
          password: p,
          createdAt: serverTimestamp(),
        });
        localStorage.setItem(STORAGE_KEY, n);
        setNickname(n);
        handleEvent({ type: "login", nickname: n });
        return { ok: true };
      } catch (e) {
        console.error(e);
        return { ok: false, error: "회원가입 중 오류가 발생했습니다." };
      }
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setNickname(null);
  }, []);

  return (
    <AuthContext.Provider value={{ nickname, ready, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
