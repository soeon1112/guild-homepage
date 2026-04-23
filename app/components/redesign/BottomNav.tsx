"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
};

// Custom astronomical-instrument-style icons
const icons = {
  notice: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 12 Q 6 6, 9 12 T 15 12 T 21 12" />
      <circle cx="3" cy="12" r="1" fill="currentColor" />
      <circle cx="21" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  schedule: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="7" />
      <path d="M12 5 A 7 7 0 0 1 12 19 A 4 7 0 0 0 12 5" fill="currentColor" />
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
  { id: "schedule", label: "일정", icon: icons.schedule, href: "/schedule" },
  { id: "members", label: "길드원", icon: icons.members, href: "/members" },
  { id: "combat", label: "투력", icon: icons.combat, href: "/combat" },
  { id: "album", label: "앨범", icon: icons.album, href: "/album" },
  { id: "board", label: "게시판", icon: icons.board, href: "/board" },
];

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (item: NavItem) => {
    if (!pathname) return false;
    if (item.id === "notice") return pathname.startsWith("/notice");
    if (item.id === "schedule") return pathname.startsWith("/schedule");
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
    >
      <div
        className="relative mx-auto flex max-w-md items-center justify-around rounded-2xl border border-nebula-pink/25 bg-abyss/85 px-1.5 py-2 backdrop-blur-md"
        style={{
          boxShadow:
            "0 -8px 28px rgba(11,8,33,0.6), 0 0 30px rgba(107,75,168,0.3), inset 0 1px 0 rgba(255,229,196,0.08)",
        }}
      >
        {items.map((it) => {
          const active = isActive(it);
          return (
            <Link
              key={it.id}
              href={it.href}
              aria-label={it.label}
              aria-current={active ? "page" : undefined}
              className="group relative flex flex-1 flex-col items-center gap-0.5 py-1"
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300 ${
                  active ? "text-stardust" : "text-text-sub group-hover:text-nebula-pink"
                }`}
                style={
                  active
                    ? {
                        background:
                          "radial-gradient(circle, rgba(255,229,196,0.25) 0%, rgba(216,150,200,0.12) 60%, transparent 100%)",
                        filter: "drop-shadow(0 0 8px rgba(255,229,196,0.6))",
                      }
                    : undefined
                }
              >
                {it.icon}
              </span>
              <span
                className={`font-serif text-[9px] tracking-wider transition-colors ${
                  active ? "text-stardust" : "text-text-sub"
                }`}
              >
                {it.label}
              </span>
              {active && (
                <span
                  className="absolute -top-1 h-1 w-1 rounded-full bg-stardust"
                  style={{ boxShadow: "0 0 6px #FFE5C4" }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
