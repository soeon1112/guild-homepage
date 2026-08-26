"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { pickFreeSlotId } from "@/src/lib/pickFreeSlotId";

type AuthResult = { ok: boolean; error?: string };

type AuthState = {
  nickname: string | null;
  ready: boolean;
  login: (nickname: string, password: string) => Promise<AuthResult>;
  signup: (
    nickname: string,
    password: string,
    guildId?: string,
  ) => Promise<AuthResult>;
  logout: () => void;
  changePassword: (current: string, next: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthState | null>(null);
const STORAGE_KEY = "auth:nickname";
const PASSWORD_STORAGE_KEY = "auth:password";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [nickname, setNickname] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 자동 로그인은 users/{stored} 가 실제 가입 회원 (password 필드 보유)일
    // 때만 진행한다. 길탈 정리 (mass-quit-2026-05-10) 직후, 떠난 사용자
    // 브라우저에 localStorage 닉네임이 남아 있으면 mount 시 runRetroactiveScan
    // 이 자동 실행되며 보존된 orphan 글을 카운트해 배지·user doc 을 재생성하는
    // 함정이 있다. password 없는 placeholder(예: '기타') 도 같은 이유로 자동
    // 로그인 대상에서 제외한다.
    (async () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const storedPassword = localStorage.getItem(PASSWORD_STORAGE_KEY);
          const snap = await getDoc(doc(db, "users", stored));
          if (
            !snap.exists() ||
            !snap.data().password ||
            snap.data().disabled === true ||
            snap.data().password !== storedPassword
          ) {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(PASSWORD_STORAGE_KEY);
            setReady(true);
            return;
          }
          setNickname(stored);
        } catch (e) {
          console.warn("[AuthProvider] auth check failed", e);
        }
      }
      setReady(true);
    })();
  }, []);

  const login = useCallback(
    async (nick: string, password: string): Promise<AuthResult> => {
      const n = nick.trim();
      const p = password.trim();
      if (!n || !p) return { ok: false, error: "닉네임과 비밀번호를 입력해주세요." };
      try {
        const snap = await getDoc(doc(db, "users", n));
        if (!snap.exists() || snap.data().disabled === true)
          return { ok: false, error: "존재하지 않는 닉네임입니다." };
        if (snap.data().password !== p) {
          return { ok: false, error: "비밀번호가 일치하지 않습니다." };
        }
        localStorage.setItem(STORAGE_KEY, n);
        localStorage.setItem(PASSWORD_STORAGE_KEY, p);
        setNickname(n);
        return { ok: true };
      } catch (e) {
        console.error(e);
        return { ok: false, error: "로그인 중 오류가 발생했습니다." };
      }
    },
    [],
  );

  const signup = useCallback(
    async (
      nick: string,
      password: string,
      guildId?: string,
    ): Promise<AuthResult> => {
      const n = nick.trim();
      const p = password.trim();
      if (!n || !p) return { ok: false, error: "닉네임과 비밀번호를 입력해주세요." };
      if (!guildId) return { ok: false, error: "길드를 선택해주세요." };
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
          guildId,
          createdAt: serverTimestamp(),
        });
        // members doc 자동 생성 → 바로 "하늘 섬의 동료들" 목록에 표시
        try {
          const slotId = await pickFreeSlotId();
          await setDoc(doc(db, "members", slotId), {
            nickname: n,
            statusMessage: "",
            profileImage: "",
            createdAt: serverTimestamp(),
          });
        } catch (e) {
          console.warn("[signup] members doc 생성 실패 — 미니홈피에서 직접 등록 가능:", e);
        }
        localStorage.setItem(STORAGE_KEY, n);
        localStorage.setItem(PASSWORD_STORAGE_KEY, p);
        setNickname(n);
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
    localStorage.removeItem(PASSWORD_STORAGE_KEY);
    setNickname(null);
  }, []);

  const changePassword = useCallback(
    async (current: string, next: string): Promise<AuthResult> => {
      if (!nickname) return { ok: false, error: "로그인이 필요합니다." };
      const c = current.trim();
      const n = next.trim();
      if (!c || !n) return { ok: false, error: "비밀번호를 입력해주세요." };
      try {
        const ref = doc(db, "users", nickname);
        const snap = await getDoc(ref);
        if (!snap.exists())
          return { ok: false, error: "사용자를 찾을 수 없습니다." };
        if (snap.data().password !== c) {
          return { ok: false, error: "현재 비밀번호가 일치하지 않습니다." };
        }
        await updateDoc(ref, { password: n });
        localStorage.setItem(PASSWORD_STORAGE_KEY, n);
        return { ok: true };
      } catch (e) {
        console.error(e);
        return {
          ok: false,
          error: "비밀번호 변경 중 오류가 발생했습니다.",
        };
      }
    },
    [nickname],
  );

  return (
    <AuthContext.Provider
      value={{ nickname, ready, login, signup, logout, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
