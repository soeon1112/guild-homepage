"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CosmicBackground } from "./CosmicBackground";
import { TopHeader } from "./TopHeader";
import { BottomNav } from "./BottomNav";
import { Breadcrumb } from "./Breadcrumb";
import { useDawnlight2 } from "@/src/lib/featureFlags";
import { Dawnlight2Topbar } from "@/app/components/dawnlight2/Topbar";

/**
 * Legacy logo bar — kept for `/admin/*` routes so the admin UI remains
 * unchanged by the redesign. Previously lived directly in `app/layout.tsx`.
 */
function LegacyHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-header-title">
          새벽빛
        </Link>
        <span className="site-header-sub">마비노기 모바일 길드</span>
      </div>
    </header>
  );
}

function LegacyFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p>&copy; 2026 새벽빛 길드. All rights reserved.</p>
      </div>
    </footer>
  );
}

/**
 * Swaps between two layout chromes based on pathname:
 *  - `/admin/*`  → legacy bg-scene + header/footer (unchanged admin UX)
 *  - everything else → redesigned cosmic chrome (background, top header, bottom nav)
 *
 * `FloatingChat`, `BadgeToast`, `AuthProvider`, and `ScrollRestorer` remain
 * in the root layout — they are global on every page regardless of chrome.
 */
export function ChromeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin") ?? false;
  // Topbar reskin gate — only 언쏘 (DAWNLIGHT2_USERS) sees the
  // dawnlight2 topbar. Everyone else keeps cosmic TopHeader byte-
  // identical. Branch lives in ChromeShell because Topbar mounts
  // globally for every non-admin page; running the gate here means
  // every page picks up the reskin without per-page changes.
  const isDawnlight2 = useDawnlight2();

  if (isAdmin) {
    return (
      <>
        <div className="bg-scene" aria-hidden="true" />
        <LegacyHeader />
        <main className="relative z-10 flex-1">{children}</main>
        <LegacyFooter />
      </>
    );
  }

  return (
    <>
      <CosmicBackground />
      {isDawnlight2 ? <Dawnlight2Topbar /> : <TopHeader />}
      <Breadcrumb />
      {/* Bottom padding clears BOTH the floating BottomNav AND the floating
          chat icon (FloatingChat lives at right-4 bottom-24 with a 56px
          button → top edge sits 152px above screen bottom). 12rem (192px)
          covers chat-icon top (152) + ~40px breathing room; env(safe-area-
          inset-bottom) tacks on the iOS home indicator. Last page item
          never gets clipped by either floating element. */}
      <main className="relative z-10 flex-1 pb-[calc(12rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomNav />
    </>
  );
}
