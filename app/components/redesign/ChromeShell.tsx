"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Breadcrumb } from "./Breadcrumb";
import { Dawnlight2Topbar } from "@/app/components/dawnlight2/Topbar";
import { Dawnlight2BottomNav } from "@/app/components/dawnlight2/BottomNav";
import { StarryBackground } from "@/app/components/dawnlight2/StarryBackground";
import { useAuth } from "@/app/components/AuthProvider";

/**
 * Legacy logo bar — kept for `/admin/*` routes so the admin UI remains
 * unchanged by the redesign. Previously lived directly in `app/layout.tsx`.
 */
function LegacyHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-header-title">
          하늘섬
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
        <p>&copy; 2026 하늘섬. All rights reserved.</p>
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
  const { nickname } = useAuth();
  const isAdmin = pathname?.startsWith("/admin") ?? false;
  // P7-B 데스크탑 하단 공백 fix — NewHomeChat(app/page.tsx, pathname==="/"
  // && nickname==="언쏘")은 이미 자체 calc(100dvh-56px) 고정 높이 박스로
  // 뷰포트를 딱 채우고, Dawnlight2BottomNav도 이 조건에서 스스로 null을
  // 반환한다(BottomNav.tsx의 얼리 리턴, P7-A). 아래 main의 pb-[calc(12rem
  // +...)] 는 "스크롤 있는 다른 페이지들이 떠 있는 BottomNav에 안 가려지게"
  // 하려는 클리어런스인데, 이 케이스는 클리어할 BottomNav 자체가 없어서
  // 순수하게 페이지를 뷰포트보다 ~192px 더 길게 만드는 낭비 공백이었다 —
  // 데스크탑에서 특히 두드러지게 보이고, 그 아래로 (닫힌 상태로 밀려나
  // 있어야 할) 슬라이드업 네비 잔상까지 비쳐 보였다.
  const isNewHomeChat = pathname === "/" && nickname === "언쏘";

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
      <main
        className={`relative z-10 flex-1 ${isNewHomeChat ? "" : "pb-[calc(12rem+env(safe-area-inset-bottom))]"}`}
      >
        {children}
      </main>
      <Dawnlight2BottomNav />
    </div>
  );
}
