"use client";

import { AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import {
  AuthArea,
  AuthModal,
  ErrorToast,
} from "@/app/components/redesign/TopHeader";

// Dawnlight 2 Topbar — same structure as cosmic's TopHeader (left
// logo + right auth-area icons), but reskinned with v0's softer
// twilight tone. Mounted by ChromeShell only when useDawnlight2()
// is true (currently 언쏘 alone via DAWNLIGHT2_USERS). All cosmic
// users keep TopHeader exactly as before — nothing about the
// cosmic component's runtime behavior changes; we only re-export
// AuthArea / AuthModal / ErrorToast so this Topbar can mount the
// literal same auth UI without duplicating it.
//
// What's borrowed from v0 (design tone only):
//   • softer twilight bg `rgba(42,31,74,0.55)`
//   • subtler `backdrop-blur-md` instead of cosmic's xl
//   • mist-lavender hairline border instead of the bottom fade-out
// What stays cosmic (per spec):
//   • 56 px height, max-w-md inner row
//   • 새벽빛 logo 22-26 px gradient text + "Dawnlight" subtitle
//   • the 4-icon nav + mobile hamburger from AuthArea verbatim
export function Dawnlight2Topbar() {
  const { nickname, ready, logout } = useAuth();
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [mySpaceId, setMySpaceId] = useState<string | null>(null);
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
          {/* Logo → home (cosmic structure verbatim — left-aligned,
              not centered; size + gradient unchanged). */}
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
                backgroundImage:
                  "linear-gradient(135deg, #FFE5C4, #D896C8, #6B4BA8)",
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

          {/* Right side — literal same component cosmic uses. The
              4-icon nav, mobile hamburger, login form, and dropdown
              all come from cosmic TopHeader's AuthArea unchanged. */}
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
