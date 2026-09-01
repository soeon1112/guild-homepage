"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useChatInputFocused } from "@/src/lib/uiBus";
import { useHasRecruitingProposals } from "@/src/lib/useHasRecruitingProposals";
import { useAuth } from "@/app/components/AuthProvider";

// Dawnlight 2 BottomNav (web) — same shape/size/icons/layout as cosmic
// BottomNav, only the palette swaps to the warm ink tones. Mounted
// only when useDawnlight2() is true; cosmic users keep BottomNav
// unchanged.
//
// Color reskin (this round):
//   • Bar bg: bg-abyss/85 → #fef5e6 (cream)
//   • Border: nebula-pink/25 → rgba(92,58,31,0.10) (subtle ink hairline)
//   • Shadow: purple stack → 0 -4px 12px rgba(92,58,31,0.12)
//   • Active icon/label: text-stardust → #5c3a1f (ink brown)
//   • Inactive icon/label: text-text-sub → #8a6a4a (faded ink brown)
//   • Hover (inactive): subtle warm ink wash rgba(92,58,31,0.06)
//   • Active radial halo: cream/pink → warm sunset tone
//   • Active top dot: stardust → ink brown
//
// Stays cosmic (per spec):
//   • fixed inset-x-0 bottom-0 z-40 px-3 pb-3 pt-2 outer
//   • max-w-md inner row, rounded-2xl, px-1.5 py-2
//   • 6 items in same order with same SVG paths and 20×20 size
//   • h-9 w-9 icon wrap, 9 px serif label tracking-wider
//   • -top-1 active top dot, 4×4 round
//   • visualViewport hide-on-keyboard + chatInputFocused gate

type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
};

const ACTIVE = "#5c3a1f";
const INACTIVE = "#8a6a4a";

const icons = {
  notice: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 12 Q 6 6, 9 12 T 15 12 T 21 12" />
      <circle cx="3" cy="12" r="1" fill="currentColor" />
      <circle cx="21" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  proposals: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M12 4 L13.2 7.5 L17 7.8 L14 10.2 L15.2 13.8 L12 11.7 L8.8 13.8 L10 10.2 L7 7.8 L10.8 7.5 Z" fill="currentColor" stroke="none" />
      <path d="M5 17 Q 12 21 19 17" opacity="0.55" />
    </svg>
  ),
  members: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <circle cx="5" cy="7" r="1.5" fill="currentColor" />
      <circle cx="12" cy="4" r="1.2" fill="currentColor" />
      <circle cx="19" cy="8" r="1.5" fill="currentColor" />
      <circle cx="8" cy="17" r="1.3" fill="currentColor" />
      <circle cx="17" cy="18" r="1.4" fill="currentColor" />
      <path d="M5 7 L12 4 L19 8 L17 18 L8 17 Z" opacity="0.6" />
    </svg>
  ),
  combat: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M12 3 L14 9 L20 9 L15 13 L17 19 L12 15 L7 19 L9 13 L4 9 L10 9 Z" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  ),
  album: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M12 4 C 18 4 20 10 18 14 C 16 18 10 20 7 17 C 5 15 5 12 8 10" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </svg>
  ),
  board: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
      <circle cx="16" cy="7" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="7" cy="16" r="1.2" fill="currentColor" />
      <circle cx="17" cy="16" r="1.4" fill="currentColor" />
      <path d="M8 8 L12 12 M16 7 L12 12 M7 16 L12 12 M17 16 L12 12" opacity="0.5" />
    </svg>
  ),
};

const items: NavItem[] = [
  { id: "notice", label: "공지", icon: icons.notice, href: "/notice" },
  { id: "proposals", label: "제안", icon: icons.proposals, href: "/proposals" },
  { id: "members", label: "길드원", icon: icons.members, href: "/members" },
  { id: "combat", label: "투력", icon: icons.combat, href: "/combat" },
  { id: "album", label: "앨범", icon: icons.album, href: "/album" },
  { id: "board", label: "게시판", icon: icons.board, href: "/board" },
];

// forceVisible — P7-B 슬라이드업 패널이 NewHomeChat(pathname==="/" &&
// 로그인 상태) 안에서 이 컴포넌트를 재mount할 때, 아래 얼리 리턴이
// 그 위치에서도 그대로 걸려 항상 null이 되는 문제를 우회하기 위한 옵션.
// 기본값 false라 기존 호출부(레이아웃의 상시 마운트)는 동작 변화 없음.
export function Dawnlight2BottomNav({
  forceVisible = false,
}: { forceVisible?: boolean } = {}) {
  const pathname = usePathname();
  const { nickname } = useAuth();
  // 모집중 제안이 하나라도 있으면 "제안" 탭 아이콘 배경을 은은하게 강조.
  // 다른 탭에는 절대 적용 안 됨 — item.id === "proposals" 조건 안에서만.
  const hasRecruiting = useHasRecruitingProposals();

  // Same hide-on-keyboard logic as cosmic BottomNav — see
  // app/components/redesign/BottomNav.tsx for the reasoning behind
  // the 0.8 ratio + (pointer: coarse) gate.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isTouch =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    if (!isTouch) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const ratio = vv.height / window.innerHeight;
      setKeyboardOpen(ratio < 0.8);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const chatInputFocused = useChatInputFocused();
  const hidden = keyboardOpen || chatInputFocused;

  // 전체 공개 — 언쏘 전용 A/B 조건을 로그인 여부로 완화. 홈이
  // NewHomeChat(채팅 메인)이 되는 모든 로그인 사용자에서 하단 네비 숨김.
  if (!forceVisible && pathname === "/" && nickname) return null;

  const isActive = (item: NavItem) => {
    if (!pathname) return false;
    if (item.id === "notice") return pathname.startsWith("/notice");
    if (item.id === "proposals") return pathname.startsWith("/proposals");
    if (item.id === "members") return pathname.startsWith("/members");
    if (item.id === "combat") return pathname.startsWith("/combat");
    if (item.id === "album") return pathname.startsWith("/album");
    if (item.id === "board") return pathname.startsWith("/board");
    return false;
  };

  return (
    <nav
      aria-label="주요 내비게이션"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 pt-2"
      style={{
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : "auto",
        transition: "opacity 160ms ease",
      }}
    >
      <div
        className="relative mx-auto flex max-w-md items-center justify-around rounded-2xl px-1.5 py-2"
        style={{
          background: "#fef5e6",
          border: "1px solid rgba(92, 58, 31, 0.10)",
          // Soft warm shadow lifting the bar off the page — mirrors
          // the spec's `0 -4px 12px rgba(92,58,31,0.12)`. The inset
          // highlight is dropped because the cream-grey bg is already
          // bright; an extra inset would muddy the top edge.
          boxShadow: "0 -4px 12px rgba(92, 58, 31, 0.12)",
        }}
      >
        {items.map((it) => {
          const active = isActive(it);
          const showRecruitingHighlight =
            it.id === "proposals" && hasRecruiting && !active;
          return (
            <Link
              key={it.id}
              href={it.href}
              aria-label={it.label}
              aria-current={active ? "page" : undefined}
              className="group relative flex flex-1 flex-col items-center gap-0.5 py-1"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300"
                style={
                  active
                    ? {
                        color: ACTIVE,
                        // Warm sunset halo — same shape as cosmic's
                        // cream/pink radial, retoned to read against
                        // the cream-grey bar bg.
                        background:
                          "radial-gradient(circle, rgba(255,199,133,0.32) 0%, rgba(244,184,150,0.16) 60%, transparent 100%)",
                        filter:
                          "drop-shadow(0 0 8px rgba(255, 199, 133, 0.55))",
                      }
                    : showRecruitingHighlight
                      ? {
                          color: INACTIVE,
                          // 모집중 제안 강조 — active 방사형 halo와 구분되도록
                          // 단색 원형 배경만 사용 (같은 sunset gold 계열).
                          background: "rgba(255,199,133,0.35)",
                        }
                      : { color: INACTIVE }
                }
              >
                {it.icon}
              </span>
              <span
                className="font-serif text-[9px] tracking-wider transition-colors"
                style={{ color: active ? ACTIVE : INACTIVE }}
              >
                {it.label}
              </span>
              {active && (
                <span
                  className="absolute -top-1 h-1 w-1 rounded-full"
                  style={{
                    background: ACTIVE,
                    boxShadow: `0 0 6px ${ACTIVE}`,
                  }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
