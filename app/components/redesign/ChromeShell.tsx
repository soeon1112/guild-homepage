"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CosmicBackground } from "./CosmicBackground";
import { TopHeader } from "./TopHeader";
import { BottomNav } from "./BottomNav";
import { Breadcrumb } from "./Breadcrumb";

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
      <TopHeader />
      <Breadcrumb />
      {/* Bottom padding clears the floating BottomNav on every page in one
          spot. 8rem (128px) covers the nav (~72–80px) plus comfortable
          buffer; env(safe-area-inset-bottom) tacks on the iOS home indicator
          so the last page item never sits under the nav even on the tallest
          iPhones. */}
      <main className="relative z-10 flex-1 pb-[calc(8rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomNav />
    </>
  );
}
