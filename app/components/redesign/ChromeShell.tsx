"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Breadcrumb } from "./Breadcrumb";
import { Dawnlight2Topbar } from "@/app/components/dawnlight2/Topbar";
import { Dawnlight2BottomNav } from "@/app/components/dawnlight2/BottomNav";
import { StarryBackground } from "@/app/components/dawnlight2/StarryBackground";

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
 *  - everything else → dawnlight2 chrome (twilight gradient via .dawnlight2
 *    CSS scope ::before, StarryBackground twinkle overlay, dl2 Topbar +
 *    BottomNav).
 *
 * 2026-05-08 dl2 전체 공개 후 cosmic 분기 (CosmicBackground / 옛 TopHeader /
 * 옛 BottomNav) 는 dead code 라 제거됨. `FloatingChat`, `BadgeToast`,
 * `AuthProvider`, `ScrollRestorer` 는 root layout 에 남아 있음.
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
    <div className="dawnlight2">
      <StarryBackground />
      <Dawnlight2Topbar />
      <Breadcrumb />
      <main className="relative z-10 flex-1 pb-[calc(12rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <Dawnlight2BottomNav />
    </div>
  );
}
