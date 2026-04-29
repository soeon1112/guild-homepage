"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { formatSmart } from "@/src/lib/formatSmart";
import TitlePrefix from "@/app/components/TitlePrefix";

type ActivityItem = {
  id: string;
  type: string;
  nickname: string;
  message: string;
  link?: string;
  createdAt: Timestamp | null;
};

const PAGE_SIZE = 10;
const PAGE_STORAGE_KEY = "activityPage";
const LIVE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function MiniStar({ size = 10, bright = false }: { size?: number; bright?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden>
      <path
        d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z"
        fill={bright ? "#FFE5C4" : "#D896C8"}
        style={bright ? { filter: "drop-shadow(0 0 3px #FFE5C4)" } : undefined}
      />
    </svg>
  );
}

function HeaderConstellation() {
  const pts: [number, number][] = [
    [6, 60],
    [18, 30],
    [32, 55],
    [50, 25],
    [68, 50],
    [84, 35],
    [96, 60],
  ];
  const links: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
  ];
  return (
    <svg viewBox="0 0 100 80" className="h-5 w-20 opacity-70" aria-hidden>
      {links.map(([a, b], i) => (
        <line
          key={i}
          x1={pts[a][0]}
          y1={pts[a][1]}
          x2={pts[b][0]}
          y2={pts[b][1]}
          stroke="#D896C8"
          strokeOpacity="0.4"
          strokeWidth="0.6"
          strokeDasharray="1.5 1"
        />
      ))}
      {pts.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={i === 3 ? 1.8 : 1.1}
          fill="#FFE5C4"
          opacity={i === 3 ? 1 : 0.75}
        />
      ))}
    </svg>
  );
}

export function NebulaWhispers() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(() => {
    if (typeof window === "undefined") return 1;
    const saved = window.sessionStorage.getItem(PAGE_STORAGE_KEY);
    const n = saved === null ? NaN : parseInt(saved, 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  });

  // Subscribe to Firestore activity feed
  useEffect(() => {
    const q = query(collection(db, "activity"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setItems(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ActivityItem[],
      );
      setLoaded(true);
    });
    return () => unsub();
  }, []);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  // Clamp currentPage after items change (e.g., deletion shrinking total)
  useEffect(() => {
    if (!loaded) return;
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [loaded, currentPage, totalPages]);

  // Persist page position across navigation (same behaviour as legacy ActivityFeed)
  useEffect(() => {
    if (!loaded) return;
    window.sessionStorage.setItem(PAGE_STORAGE_KEY, String(currentPage));
  }, [loaded, currentPage]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [currentPage, items]);

  const isFirst = currentPage === 1;
  const isLast = currentPage === totalPages;
  const now = Date.now();
  const isLiveItem = (it: ActivityItem) =>
    !!it.createdAt && now - it.createdAt.toMillis() < LIVE_THRESHOLD_MS;

  return (
    <section className="relative px-4 pb-4">
      <div className="relative overflow-hidden rounded-2xl border border-nebula-pink/25 bg-abyss-deep/40 backdrop-blur-sm">
        {/* Section header */}
        <div className="flex items-center justify-between border-b border-nebula-pink/15 px-3 py-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 rounded-full bg-peach-accent animate-pulse-ring" />
              <span className="relative h-2 w-2 rounded-full bg-peach-accent" />
            </span>
            <span className="font-serif text-[11px] tracking-wider text-stardust">
              성운의 속삭임
            </span>
            <HeaderConstellation />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-serif text-[9px] text-text-sub">
              총 {items.length}건
            </span>
            <span className="font-serif text-[10px] tracking-widest text-peach-accent">
              LIVE
            </span>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="px-3 py-10 text-center font-serif text-[11px] italic text-text-sub/70">
            {loaded ? "아직 활동이 없습니다." : "불러오는 중..."}
          </p>
        ) : (
          <>
            {/* Activity list */}
            <ul
              className="flex flex-col gap-1.5 p-2.5"
              aria-label="최근 활동 목록"
            >
              {pageItems.map((a) => {
                const isLive = isLiveItem(a);
                const isHovered = hovered === a.id;
                const nicknamePrefix = `${a.nickname}님`;
                const hasNicknamePrefix =
                  !!a.nickname && a.message.startsWith(nicknamePrefix);
                const rest = hasNicknamePrefix
                  ? a.message.slice(nicknamePrefix.length)
                  : "";
                const timeLabel = a.createdAt
                  ? formatSmart(a.createdAt.toDate())
                  : "";

                const rowClass = `group flex items-start gap-2.5 rounded-lg border border-nebula-pink/10 bg-abyss/30 px-2.5 py-2 backdrop-blur-sm transition-all md:items-center ${
                  isHovered ? "border-nebula-pink/40 bg-abyss/60" : ""
                }`;

                const rowHandlers = {
                  onMouseEnter: () => setHovered(a.id),
                  onMouseLeave: () => setHovered(null),
                };

                const rowContent = (
                  <>
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center ${
                        isLive ? "animate-pulse" : ""
                      }`}
                    >
                      <MiniStar size={isLive ? 11 : 9} bright={isLive} />
                    </span>

                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="font-serif text-[11px] text-text-primary md:truncate">
                        {hasNicknamePrefix ? (
                          <>
                            <TitlePrefix nickname={a.nickname} />
                            <span className="text-stardust">{a.nickname}</span>
                            <span className="text-text-sub">님</span>
                            <span className="text-text-primary">{rest}</span>
                          </>
                        ) : (
                          <span>{a.message}</span>
                        )}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {isLive && (
                        <span className="rounded-full border border-peach-accent/60 bg-peach-accent/10 px-1.5 py-0.5 font-serif text-[8px] tracking-widest text-peach-accent">
                          LIVE
                        </span>
                      )}
                      <span className="font-serif text-[9px] text-text-sub">
                        {timeLabel}
                      </span>
                    </div>
                  </>
                );

                return (
                  <li key={a.id}>
                    {a.link ? (
                      <Link
                        href={a.link}
                        className={rowClass}
                        {...rowHandlers}
                      >
                        {rowContent}
                      </Link>
                    ) : (
                      <div className={rowClass} {...rowHandlers}>
                        {rowContent}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-nebula-pink/15 bg-abyss/20 px-3 py-3">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={isFirst}
                  aria-label="이전 페이지"
                  className={`group inline-flex items-center gap-1.5 rounded-full border border-nebula-pink/40 bg-abyss-deep/50 px-3 py-1.5 font-serif text-[10px] tracking-widest text-stardust backdrop-blur-sm transition-all ${
                    isFirst
                      ? "cursor-not-allowed opacity-30"
                      : "hover:border-nebula-pink/80 hover:shadow-[0_0_12px_rgba(216,150,200,0.35)]"
                  }`}
                >
                  <ChevronLeft className="h-3 w-3" />
                  이전
                </button>

                <span className="font-serif text-[11px] tracking-widest text-text-sub">
                  <span className="text-stardust">{currentPage}</span>
                  <span className="mx-1.5 opacity-50">/</span>
                  <span>{totalPages}</span>
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={isLast}
                  aria-label="다음 페이지"
                  className={`group inline-flex items-center gap-1.5 rounded-full border border-nebula-pink/40 bg-abyss-deep/50 px-3 py-1.5 font-serif text-[10px] tracking-widest text-stardust backdrop-blur-sm transition-all ${
                    isLast
                      ? "cursor-not-allowed opacity-30"
                      : "hover:border-nebula-pink/80 hover:shadow-[0_0_12px_rgba(216,150,200,0.35)]"
                  }`}
                >
                  다음
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
