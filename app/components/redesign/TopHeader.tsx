"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  LogIn,
  LogOut,
  Menu,
  ShoppingBag,
  User,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";

type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
};

type AuthModalState = { open: boolean; mode: "login" | "signup" };

/**
 * Tooltip label below an icon button. Used with a `.group` parent.
 * Appears on hover via CSS, no JS state required.
 */
function TooltipLabel({ text }: { text: string }) {
  return (
    <span
      className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 -translate-y-1 whitespace-nowrap rounded-md border border-nebula-pink/30 bg-abyss-deep/95 px-3 py-1.5 text-[12px] opacity-0 backdrop-blur-md transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
      style={{ zIndex: 100 }}
    >
      <span className="font-serif tracking-wider text-stardust">{text}</span>
      <span
        className="absolute left-1/2 bottom-full h-1.5 w-1.5 -translate-x-1/2 translate-y-1/2 rotate-45 border-l border-t border-nebula-pink/30 bg-abyss-deep/95"
        aria-hidden
      />
    </span>
  );
}

function IconButton({
  item,
  hovered,
  onHover,
}: {
  item: NavItem;
  hovered: string | null;
  onHover: (id: string | null) => void;
}) {
  const isHovered = hovered === item.id;

  const content = (
    <>
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full border border-nebula-pink/40 bg-abyss-deep/60 text-stardust backdrop-blur-sm transition-all duration-300 group-hover:border-nebula-pink group-hover:scale-110"
        style={{
          boxShadow: isHovered
            ? "0 0 12px rgba(216,150,200,0.85), inset 0 0 6px rgba(255,229,196,0.45)"
            : "0 0 5px rgba(216,150,200,0.22)",
        }}
      >
        {item.icon}
      </span>
      <TooltipLabel text={item.label} />
    </>
  );

  const commonProps = {
    onMouseEnter: () => onHover(item.id),
    onMouseLeave: () => onHover(null),
    className: "group relative",
    "aria-label": item.label,
  };

  if (item.href) {
    return (
      <Link href={item.href} {...commonProps}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={item.onClick} {...commonProps}>
      {content}
    </button>
  );
}

/**
 * Shared input class for auth forms (inline header + modal).
 * Glassmorphism + peach focus ring.
 */
const AUTH_INPUT_CLASS =
  "rounded-full border border-nebula-pink/25 bg-abyss-deep/50 font-serif text-text-primary placeholder:text-text-sub/70 placeholder:italic backdrop-blur-sm transition-all focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30";

function LoginFormInline({
  onSignupClick,
  onError,
}: {
  onSignupClick: () => void;
  onError: (msg: string) => void;
}) {
  const { login } = useAuth();
  const [nick, setNick] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await login(nick, pw);
    setBusy(false);
    if (r.ok) {
      setNick("");
      setPw("");
    } else {
      onError(r.error || "로그인 실패");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
      <input
        type="text"
        placeholder="닉네임"
        value={nick}
        onChange={(e) => setNick(e.target.value)}
        maxLength={20}
        aria-label="닉네임"
        autoComplete="username"
        className={`${AUTH_INPUT_CLASS} h-8 w-[95px] shrink-0 px-3 text-[11px]`}
      />
      <input
        type="password"
        placeholder="비밀번호"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        maxLength={40}
        aria-label="비밀번호"
        autoComplete="current-password"
        className={`${AUTH_INPUT_CLASS} h-8 w-[95px] shrink-0 px-3 text-[11px]`}
      />

      {/* Login: primary peach-gradient icon button (submits form) */}
      <button
        type="submit"
        disabled={busy}
        aria-label="로그인"
        className="group relative shrink-0"
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full text-abyss-deep transition-all duration-300 group-hover:scale-110 group-disabled:opacity-60 group-disabled:hover:scale-100"
          style={{
            background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
            boxShadow: "0 0 10px rgba(255,181,167,0.4)",
          }}
        >
          <LogIn className="h-3.5 w-3.5" />
        </span>
        <TooltipLabel text="로그인" />
      </button>

      {/* Signup: secondary icon button matching logged-in nav style */}
      <button
        type="button"
        onClick={onSignupClick}
        aria-label="가입"
        className="group relative shrink-0"
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full border border-nebula-pink/40 bg-abyss-deep/60 text-stardust backdrop-blur-sm transition-all duration-300 group-hover:border-nebula-pink group-hover:scale-110"
          style={{ boxShadow: "0 0 5px rgba(216,150,200,0.22)" }}
        >
          <UserPlus className="h-3.5 w-3.5" />
        </span>
        <TooltipLabel text="처음 오셨나요?" />
      </button>
    </form>
  );
}

function AuthModal({
  initialMode,
  onClose,
}: {
  initialMode: "login" | "signup";
  onClose: () => void;
}) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [nick, setNick] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    if (mode === "signup" && pw !== pw2) {
      setErr("비밀번호가 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    const r = mode === "login" ? await login(nick, pw) : await signup(nick, pw);
    setBusy(false);
    if (r.ok) {
      onClose();
    } else {
      setErr(r.error || (mode === "login" ? "로그인 실패" : "회원가입 실패"));
    }
  };

  const switchMode = (next: "login" | "signup") => {
    setMode(next);
    setErr(null);
    setPw("");
    setPw2("");
  };

  return (
    <motion.div
      className="modal-safe-frame fixed inset-0 z-[70] flex items-center justify-center"
      style={{
        background: "rgba(11,8,33,0.8)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={mode === "login" ? "로그인" : "회원가입"}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl"
        style={{
          background: "rgba(26,15,61,0.92)",
          border: "1px solid rgba(216,150,200,0.3)",
          boxShadow:
            "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(107,75,168,0.4)",
        }}
        initial={{ scale: 0.95, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 20, opacity: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        {/* Decorative nebula glow */}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(216,150,200,0.3) 0%, transparent 65%)",
            filter: "blur(28px)",
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-12 -left-12 h-48 w-48 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(107,75,168,0.35) 0%, transparent 65%)",
            filter: "blur(32px)",
          }}
        />

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-stardust transition-colors hover:bg-nebula-pink/20"
          style={{
            background: "rgba(11,8,33,0.6)",
            border: "1px solid rgba(216,150,200,0.3)",
          }}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Title */}
        <div className="relative px-6 pb-3 pt-9 text-center">
          <h2
            className="leading-none"
            style={{
              fontFamily: "'Noto Serif KR', serif",
              fontSize: "28px",
              fontWeight: 300,
              letterSpacing: "0.06em",
              backgroundImage:
                "linear-gradient(135deg, #FFE5C4, #D896C8, #6B4BA8)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
              filter: "drop-shadow(0 0 10px rgba(216,150,200,0.45))",
            }}
          >
            {mode === "login" ? "로그인" : "가입"}
          </h2>
          <p className="mt-2 font-serif text-[10px] tracking-[0.35em] text-nebula-pink/80 uppercase">
            {mode === "login" ? "Welcome Back" : "Join Dawnlight"}
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="relative flex flex-col gap-3 px-6 pb-6 pt-3"
        >
          <input
            type="text"
            placeholder="닉네임"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            maxLength={20}
            aria-label="닉네임"
            autoComplete={mode === "login" ? "username" : "new-username"}
            autoFocus
            className={`${AUTH_INPUT_CLASS} w-full px-4 py-2.5 text-sm`}
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            maxLength={40}
            aria-label="비밀번호"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className={`${AUTH_INPUT_CLASS} w-full px-4 py-2.5 text-sm`}
          />
          {mode === "signup" && (
            <input
              type="password"
              placeholder="비밀번호 확인"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              maxLength={40}
              aria-label="비밀번호 확인"
              autoComplete="new-password"
              className={`${AUTH_INPUT_CLASS} w-full px-4 py-2.5 text-sm`}
            />
          )}

          {err && (
            <p
              className="text-center font-serif text-[11px] italic"
              style={{ color: "#E8A8B8" }}
            >
              {err}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 w-full rounded-full py-2.5 font-serif text-sm font-medium tracking-wider text-abyss-deep transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
              boxShadow: "0 0 14px rgba(255,181,167,0.5)",
            }}
          >
            {busy ? "처리 중..." : mode === "login" ? "로그인" : "가입하기"}
          </button>

          <div className="pt-2 text-center">
            {mode === "login" ? (
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="font-serif text-[11px] italic text-text-sub transition-colors hover:text-stardust"
              >
                처음 오셨나요? <span className="text-stardust">가입하기</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="font-serif text-[11px] italic text-text-sub transition-colors hover:text-stardust"
              >
                이미 계정이 있나요? <span className="text-stardust">로그인</span>
              </button>
            )}
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function ErrorToast({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="fixed left-1/2 top-[68px] z-[60] -translate-x-1/2 rounded-full px-4 py-2 font-serif text-[11px] tracking-wider"
      role="status"
      aria-live="polite"
      style={{
        background: "rgba(26,15,61,0.88)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(216,150,200,0.4)",
        color: "#FFE5C4",
        boxShadow:
          "0 4px 18px rgba(216,150,200,0.3), 0 0 14px rgba(255,181,167,0.25)",
      }}
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: "#E8A8B8",
            boxShadow: "0 0 6px rgba(232,168,184,0.9)",
          }}
        />
        {message}
      </span>
    </motion.div>
  );
}

function AuthArea({
  ready,
  nickname,
  mySpaceId,
  hovered,
  onHover,
  onLogout,
  onAuthModal,
  onError,
}: {
  ready: boolean;
  nickname: string | null;
  mySpaceId: string | null;
  hovered: string | null;
  onHover: (id: string | null) => void;
  onLogout: () => void;
  onAuthModal: (mode: "login" | "signup") => void;
  onError: (msg: string) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Prevent auth-state flicker during initial hydration
  if (!ready) return null;

  // ── Logged in ──
  if (nickname) {
    const items: NavItem[] = [
      ...(mySpaceId
        ? [
            {
              id: "space",
              label: "내공간",
              icon: <Calendar className="h-3.5 w-3.5" />,
              href: `/members/${mySpaceId}`,
            } as NavItem,
          ]
        : []),
      {
        id: "shop",
        label: "상점",
        icon: <ShoppingBag className="h-3.5 w-3.5" />,
        href: "/shop",
      },
      {
        id: "my",
        label: "MY",
        icon: <User className="h-3.5 w-3.5" />,
        href: "/mypage",
      },
      {
        id: "logout",
        label: "로그아웃",
        icon: <LogOut className="h-3.5 w-3.5" />,
        onClick: onLogout,
      },
    ];

    return (
      <>
        {/* Desktop icons */}
        <nav className="hidden shrink-0 items-center gap-2.5 sm:flex">
          {items.map((it) => (
            <IconButton key={it.id} item={it} hovered={hovered} onHover={onHover} />
          ))}
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label={mobileOpen ? "메뉴 닫기" : "메뉴 열기"}
          onClick={() => setMobileOpen((v) => !v)}
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-nebula-pink/40 bg-abyss-deep/60 text-stardust backdrop-blur-sm transition-all duration-300 hover:border-nebula-pink sm:hidden"
          style={{ boxShadow: "0 0 5px rgba(216,150,200,0.22)" }}
        >
          {mobileOpen ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
        </button>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div
            className="absolute right-4 top-full mt-2 flex flex-col gap-1 rounded-xl border border-nebula-pink/25 bg-abyss-deep/95 p-2 backdrop-blur-xl sm:hidden"
            style={{
              zIndex: 100,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4), 0 0 18px rgba(216,150,200,0.2)",
            }}
          >
            {items.map((it) => {
              const inner = (
                <>
                  <span className="flex h-6 w-6 items-center justify-center text-nebula-pink">
                    {it.icon}
                  </span>
                  <span className="font-serif text-xs tracking-wider">{it.label}</span>
                </>
              );
              if (it.href) {
                return (
                  <Link
                    key={it.id}
                    href={it.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-stardust transition-colors hover:bg-nebula-pink/10"
                  >
                    {inner}
                  </Link>
                );
              }
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => {
                    it.onClick?.();
                    setMobileOpen(false);
                  }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-stardust transition-colors hover:bg-nebula-pink/10"
                >
                  {inner}
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  }

  // ── Logged out ──
  return (
    <>
      {/* Desktop: inline form with two inputs + login/signup icons */}
      <div className="hidden shrink-0 sm:block">
        <LoginFormInline
          onSignupClick={() => onAuthModal("signup")}
          onError={onError}
        />
      </div>

      {/* Mobile: single LogIn icon → opens auth modal */}
      <button
        type="button"
        aria-label="로그인"
        onClick={() => onAuthModal("login")}
        className="group relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-abyss-deep transition-all duration-300 hover:scale-110 sm:hidden"
        style={{
          background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
          boxShadow: "0 0 10px rgba(255,181,167,0.4)",
        }}
      >
        <LogIn className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

export function TopHeader() {
  const { nickname, ready, logout } = useAuth();
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [mySpaceId, setMySpaceId] = useState<string | null>(null);
  const [authModal, setAuthModal] = useState<AuthModalState>({
    open: false,
    mode: "login",
  });
  const [toastErr, setToastErr] = useState<string | null>(null);

  // Hide legacy <Header /> from layout.tsx on pages that mount TopHeader
  useEffect(() => {
    document.body.classList.add("has-redesigned-header");
    return () => {
      document.body.classList.remove("has-redesigned-header");
    };
  }, []);

  // Resolve current user's member-slot id for the "내공간" link
  useEffect(() => {
    if (!nickname) {
      setMySpaceId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const q = query(collection(db, "members"), where("nickname", "==", nickname));
        const snap = await getDocs(q);
        if (cancelled) return;
        setMySpaceId(snap.empty ? null : snap.docs[0].id);
      } catch (e) {
        console.error(e);
        if (!cancelled) setMySpaceId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nickname]);

  // Auto-dismiss error toast after 3s
  useEffect(() => {
    if (!toastErr) return;
    const t = setTimeout(() => setToastErr(null), 3000);
    return () => clearTimeout(t);
  }, [toastErr]);

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <>
      <header
        className="sticky top-0 z-40 backdrop-blur-xl"
        style={{
          background:
            "linear-gradient(to bottom, rgba(11,8,33,0.85) 0%, rgba(11,8,33,0.7) 70%, rgba(11,8,33,0) 100%)",
        }}
      >
        <div className="relative mx-auto flex h-[56px] max-w-md items-center justify-between gap-3 px-4 py-2">
          {/* Logo → home (non-shrinking, no wrap) */}
          <Link
            href="/"
            className="flex shrink-0 items-baseline gap-2 whitespace-nowrap leading-none"
          >
            <span
              className="font-serif"
              style={{
                fontFamily: "'Noto Serif KR', serif",
                fontSize: "clamp(22px, 3.6vw, 26px)",
                fontWeight: 300,
                letterSpacing: "0.08em",
                lineHeight: 1,
                backgroundImage: "linear-gradient(135deg, #FFE5C4, #D896C8, #6B4BA8)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                color: "transparent",
                filter:
                  "drop-shadow(0 0 8px rgba(216,150,200,0.45)) drop-shadow(0 0 14px rgba(107,75,168,0.25))",
              }}
            >
              새벽빛
            </span>
            <span className="font-serif text-[10px] tracking-[0.3em] text-text-sub uppercase">
              Dawnlight
            </span>
          </Link>

          {/* Right side: auth-state dependent */}
          <AuthArea
            ready={ready}
            nickname={nickname}
            mySpaceId={mySpaceId}
            hovered={hovered}
            onHover={setHovered}
            onLogout={handleLogout}
            onAuthModal={(mode) => setAuthModal({ open: true, mode })}
            onError={setToastErr}
          />
        </div>

        {/* Soft edge fade below header — design fix for hard bottom edge */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-full h-6"
          style={{
            background:
              "linear-gradient(to bottom, rgba(11,8,33,0.65) 0%, rgba(11,8,33,0.3) 50%, rgba(11,8,33,0) 100%)",
          }}
        />
      </header>

      {/* Error toast (below header, auto-dismiss 3s) */}
      <AnimatePresence>
        {toastErr && <ErrorToast message={toastErr} />}
      </AnimatePresence>

      {/* Auth modal */}
      <AnimatePresence>
        {authModal.open && (
          <AuthModal
            initialMode={authModal.mode}
            onClose={() => setAuthModal((s) => ({ ...s, open: false }))}
          />
        )}
      </AnimatePresence>
    </>
  );
}
