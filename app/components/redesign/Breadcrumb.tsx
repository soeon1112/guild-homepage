"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebase";

type Segment = { label: string; href?: string };

/**
 * Map path segments to a breadcrumb trail. `memberNickLabel` is used to
 * replace the raw member id in `/members/[id]` with a human-readable nickname
 * (resolved via Firestore in the component).
 *
 * Segments may include `href` on every entry; the render step strips it from
 * the last entry so the current page is always non-clickable.
 */
function resolveSegments(
  parts: string[],
  memberNickLabel: string | null,
): Segment[] | null {
  if (parts.length === 0) return null;
  const home: Segment = { label: "홈", href: "/" };

  switch (parts[0]) {
    case "members": {
      const segs: Segment[] = [home, { label: "길드원", href: "/members" }];
      if (parts[1]) {
        segs.push({
          label: memberNickLabel ?? "...",
          href: `/members/${parts[1]}`,
        });
        if (parts[2] === "detail") segs.push({ label: "소개" });
      }
      return segs;
    }
    case "combat":
      return [home, { label: "투력 및 지옥 현황" }];
    case "notice": {
      const segs: Segment[] = [home, { label: "공지", href: "/notice" }];
      if (parts[1] === "write") segs.push({ label: "작성" });
      else if (parts[1] === "edit") segs.push({ label: "수정" });
      else if (parts[1]) segs.push({ label: "상세" });
      return segs;
    }
    case "schedule":
      return [home, { label: "일정" }];
    case "album":
      return [home, { label: "앨범" }];
    case "board": {
      const segs: Segment[] = [home, { label: "게시판", href: "/board" }];
      if (parts[1] === "write") segs.push({ label: "작성" });
      else if (parts[1] === "edit") segs.push({ label: "수정" });
      else if (parts[1]) segs.push({ label: "상세" });
      return segs;
    }
    case "mypage":
      return [home, { label: "MY" }];
    case "shop":
      return [home, { label: "상점" }];
    default:
      return null;
  }
}

export function Breadcrumb() {
  const pathname = usePathname() ?? "/";
  const parts = pathname.split("/").filter(Boolean);

  // Resolve member nickname for /members/[id] routes
  const memberId =
    parts[0] === "members" && parts[1] ? parts[1] : null;
  const [memberNick, setMemberNick] = useState<string | null>(null);

  useEffect(() => {
    if (!memberId) {
      setMemberNick(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "members", memberId));
        if (cancelled) return;
        setMemberNick((snap.data()?.nickname as string) ?? memberId);
      } catch {
        if (!cancelled) setMemberNick(memberId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  if (pathname === "/") return null;

  const segments = resolveSegments(parts, memberNick);
  if (!segments || segments.length === 0) return null;

  // Enforce: last segment is the current page, not clickable
  const displaySegments = segments.map((s, i) =>
    i === segments.length - 1 ? { label: s.label } : s,
  );

  return (
    <nav
      aria-label="breadcrumb"
      className="relative z-10 mx-auto w-full max-w-md px-4 pt-3"
    >
      <ol className="flex items-center gap-2 font-serif text-[11px] tracking-wider text-text-sub">
        {displaySegments.map((seg, i) => (
          <li key={i} className="flex items-center gap-2">
            {seg.href ? (
              <Link
                href={seg.href}
                className="transition-colors hover:text-stardust"
              >
                {seg.label}
              </Link>
            ) : (
              <span className="text-peach-accent">{seg.label}</span>
            )}
            {i < displaySegments.length - 1 && (
              <span aria-hidden className="text-text-sub/50">
                ›
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
