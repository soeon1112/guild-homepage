"use client";

import { AnimatePresence } from "framer-motion";
import {
  Calendar,
  LogIn,
  LogOut,
  Menu,
  ShoppingBag,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import {
  AuthModal,
  ErrorToast,
} from "@/app/components/redesign/TopHeader";

// Dawnlight 2 Topbar — same structure as cosmic's TopHeader (left
// logo + right icon nav), v0-toned background. Only 언쏘
// (DAWNLIGHT2_USERS) sees this; everyone else keeps cosmic TopHeader
// byte-identical.
//
// Color reskin (this round):
//   • Logo: peach→purple gradient → solid cream (#fef5e6).
//   • Right-side icons: nebula-pink/abyss-deep purple → cream-tinted
//     border + cream-tinted bg + cream icon glyphs. We render the
//     4-icon nav + mobile hamburger + dropdown INLINE here instead
//     of reusing cosmic AuthArea, so cosmic users keep purple icons
//     and only dawnlight2 mounts cream icons.
//
// Borrowed from v0 (design tone):
//   • softer twilight bg `rgba(42,31,74,0.55)`
//   • subtler `backdrop-blur-md`
//   • mist-lavender hairline bottom border
// Stays cosmic (per spec):
//   • 56 px height, max-w-md inner row
//   • 새벽빛 logo size 22-26 px, weight 300, drop-shadow
//   • "Dawnlight" subtitle 10 px tracking-[0.3em] mist-lavender
//   • 4-icon order (내공간 / 상점 / MY / 로그아웃), hover scale,
//     mobile hamburger → dropdown layout
//   • AuthModal + ErrorToast for the logged-out edge case (rare —
//     in practice dawnlight2 only mounts when nickname is set)

type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
};

// Tooltip label below an icon button. Duplicated from cosmic so we
// can recolor the surface without touching it.
function CreamTooltip({ text }: { text: string }) {
  return (
    <span
      className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 -translate-y-1 whitespace-nowrap rounded-md px-3 py-1.5 text-[12px] opacity-0 backdrop-blur-md transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
      style={{
        zIndex: 100,
        background: "rgba(11,8,33,0.92)",
        border: "1px solid rgba(254, 245, 230, 0.25)",
      }}
    >
      <span
        className="font-serif tracking-wider"
        style={{ color: "#fef5e6" }}
      >
        {text}
      </span>
      <span
        className="absolute left-1/2 bottom-full h-1.5 w-1.5 -translate-x-1/2 translate-y-1/2 rotate-45"
        aria-hidden
        style={{
          background: "rgba(11,8,33,0.92)",
          borderLeft: "1px solid rgba(254, 245, 230, 0.25)",
          borderTop: "1px solid rgba(254, 245, 230, 0.25)",
        }}
      />
    </span>
  );
}

// Cream-tinted variant of cosmic's IconButton. Same hit-area, same
// shape, same tooltip behavior — only the colors change.
function CreamIconButton({
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
        className="flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition-all duration-300 group-hover:scale-110"
        style={{
          color: "#fef5e6",
          border: isHovered
            ? "1px solid rgba(254, 245, 230, 0.7)"
            : "1px solid rgba(254, 245, 230, 0.4)",
          background: "rgba(11, 8, 33, 0.45)",
          boxShadow: isHovered
            ? "0 0 12px rgba(254, 245, 230, 0.55), inset 0 0 6px rgba(254, 245, 230, 0.18)"
            : "0 0 5px rgba(254, 245, 230, 0.22)",
        }}
      >
        {item.icon}
      </span>
      <CreamTooltip text={item.label} />
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

export function Dawnlight2Topbar() {
  const { nickname, ready, logout } = useAuth();
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [mySpaceId, setMySpaceId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authModal, setAuthModal] = useState<{
    open: boolean;
    mode: "login" | "signup";
  }>({ open: false, mode: "login" });
  const [toastErr, setToastErr] = useState<string | null>(null);

  // Hide legacy <Header /> (the admin/legacy CSS one) on pages that
  // mount our Topbar — same body class cosmic TopHeader uses, so the
  // CSS rule that suppresses the legacy bar still applies here.
  useEffect(() => {
    document.body.classList.add("has-redesigned-header");
    return () => {
      document.body.classList.remove("has-redesigned-header");
    };
  }, []);

  // Resolve the current user's member-slot id for the "내공간" link —
  // same query cosmic TopHeader runs.
  useEffect(() => {
    if (!nickname) {
      setMySpaceId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const q = query(
          collection(db, "members"),
          where("nickname", "==", nickname),
        );
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

  useEffect(() => {
    if (!toastErr) return;
    const t = setTimeout(() => setToastErr(null), 3000);
    return () => clearTimeout(t);
  }, [toastErr]);

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const navItems: NavItem[] = [
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
      onClick: handleLogout,
    },
  ];

  return (
    <>
      <header
        className="sticky top-0 z-40 backdrop-blur-md"
        style={{
          background: "rgba(42, 31, 74, 0.55)",
          borderBottom: "1px solid rgba(200, 184, 232, 0.15)",
        }}
      >
        <div className="relative mx-auto flex h-[56px] max-w-md items-center justify-between gap-3 px-4 py-2">
          {/* Logo → home. Solid cream this round (was peach→purple
              gradient); shape / size / weight / position / subtitle
              all preserved per spec. */}
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
                color: "#fef5e6",
                filter:
                  "drop-shadow(0 0 8px rgba(254, 245, 230, 0.35)) drop-shadow(0 0 14px rgba(254, 245, 230, 0.18))",
              }}
            >
              새벽빛
            </span>
            <span className="font-serif text-[10px] tracking-[0.3em] text-text-sub uppercase">
              Dawnlight
            </span>
          </Link>

          {/* Right side — auth state dependent. Hides during
              hydration to avoid flicker. Logged-out branch still
              uses cosmic AuthModal so the rare "언쏘 logs out, then
              an admin restores them mid-session" path keeps working. */}
          {ready && nickname && (
            <>
              {/* Desktop: 4 cream icons in a row */}
              <nav className="hidden shrink-0 items-center gap-2.5 sm:flex">
                {navItems.map((it) => (
                  <CreamIconButton
                    key={it.id}
                    item={it}
                    hovered={hovered}
                    onHover={setHovered}
                  />
                ))}
              </nav>

              {/* Mobile hamburger trigger */}
              <button
                type="button"
                aria-label={mobileOpen ? "메뉴 닫기" : "메뉴 열기"}
                onClick={() => setMobileOpen((v) => !v)}
                className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full backdrop-blur-sm transition-all duration-300 sm:hidden"
                style={{
                  color: "#fef5e6",
                  border: "1px solid rgba(254, 245, 230, 0.4)",
                  background: "rgba(11, 8, 33, 0.45)",
                  boxShadow: "0 0 5px rgba(254, 245, 230, 0.22)",
                }}
              >
                {mobileOpen ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <Menu className="h-3.5 w-3.5" />
                )}
              </button>

              {/* Mobile dropdown — cream tones throughout */}
              {mobileOpen && (
                <div
                  className="absolute right-4 top-full mt-2 flex flex-col gap-1 rounded-xl p-2 backdrop-blur-xl sm:hidden"
                  style={{
                    zIndex: 100,
                    border: "1px solid rgba(254, 245, 230, 0.25)",
                    background: "rgba(11, 8, 33, 0.92)",
                    boxShadow:
                      "0 8px 24px rgba(0, 0, 0, 0.4), 0 0 18px rgba(254, 245, 230, 0.18)",
                  }}
                >
                  {navItems.map((it) => {
                    const inner = (
                      <>
                        <span
                          className="flex h-6 w-6 items-center justify-center"
                          style={{ color: "#fef5e6" }}
                        >
                          {it.icon}
                        </span>
                        <span
                          className="font-serif text-xs tracking-wider"
                          style={{ color: "#fef5e6" }}
                        >
                          {it.label}
                        </span>
                      </>
                    );
                    if (it.href) {
                      return (
                        <Link
                          key={it.id}
                          href={it.href}
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[rgba(254,245,230,0.08)]"
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
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[rgba(254,245,230,0.08)]"
                      >
                        {inner}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Logged-out fallback — cream-tinted single LogIn icon.
              Practically not reached because the gate hides this
              Topbar when nickname is null, but kept for resilience
              during the brief logout race. */}
          {ready && !nickname && (
            <button
              type="button"
              aria-label="로그인"
              onClick={() => setAuthModal({ open: true, mode: "login" })}
              className="group relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-300 hover:scale-110"
              style={{
                color: "#fef5e6",
                border: "1px solid rgba(254, 245, 230, 0.5)",
                background: "rgba(11, 8, 33, 0.45)",
                boxShadow: "0 0 8px rgba(254, 245, 230, 0.3)",
              }}
            >
              <LogIn className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>

      <AnimatePresence>
        {toastErr && <ErrorToast message={toastErr} />}
      </AnimatePresence>

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
