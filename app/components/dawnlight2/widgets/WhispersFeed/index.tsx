"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { Dl2TitlePrefix } from "./Dl2TitlePrefix";

// Ink-brown palette for the warm peach card. Pre-mixed with their
// effective alpha so we can render every text node fully opaque (only
// the card surface is translucent — text legibility wins everywhere).
const INK = "#5c3a1f"; // primary ink (title, nick, body)
const INK_SOFT = "#8a6a4a"; // secondary ink (subtitle, time, count)
const INK_PLANE_FILL = "rgba(253, 246, 240, 0.95)"; // cloud, opaque-ish on peach
const INK_PLANE_STROKE = "rgba(92, 58, 31, 0.55)"; // ink outline so plane reads against the cream
const TRAIL_DASH = "rgba(253, 246, 240, 0.85)";

// Whispers Feed — Dawnlight 2 activity stream.
//
// Same Firestore subscription the cosmic NebulaWhispers uses
// (collection "activity", orderBy createdAt desc, onSnapshot live), so
// the two widgets show the same data in the same order. The render
// flips to v0's "paper airplane on dashed trail" layout, retoned for
// the noctilucent palette: warm peach surface, deep ink type.
//
// Pagination, MAX_PAGES, and the LIVE threshold mirror NebulaWhispers
// 1:1 — sessionStorage page persistence is intentionally not ported
// here so the cosmic and dawnlight2 widgets keep independent page
// memory; they may be open in different routes.

type ActivityItem = {
  id: string;
  type: string;
  nickname: string;
  message: string;
  link?: string;
  createdAt: Timestamp | null;
};

const PAGE_SIZE = 10;
const MAX_PAGES = 30;
const LIVE_THRESHOLD_MS = 5 * 60 * 1000;

// Same regex as NebulaWhispers — pulls the first "${X}님" out of the
// message because old activity docs store the wrong nickname field.
const NICKNAME_RE = /^(.*?)([^\s'"]+?)님(.*)$/;

export function WhispersFeed() {
  const router = useRouter();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

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

  const totalPages = Math.min(
    MAX_PAGES,
    Math.max(1, Math.ceil(items.length / PAGE_SIZE)),
  );

  useEffect(() => {
    if (!loaded) return;
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [loaded, currentPage, totalPages]);

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
    <section
      aria-labelledby="dl2-whispers-feed"
      className="mx-auto w-full max-w-2xl px-5 pb-12 pt-2 sm:px-6 sm:pb-16"
    >
      <div
        className="overflow-hidden rounded-2xl"
        style={{
          background: "rgba(255, 212, 184, 0.72)",
          border: "1px solid rgba(74, 90, 140, 0.18)",
        }}
      >
        {/* Header — title + LIVE + count, all inside the box per v0 */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
          <div>
            <h2
              id="dl2-whispers-feed"
              className="text-lg font-semibold leading-tight sm:text-xl"
              style={{ color: INK }}
            >
              바람결 소식
            </h2>
            <p
              className="mt-0.5 text-[10px] uppercase tracking-[0.32em]"
              style={{ color: INK_SOFT }}
            >
              Whispers on the Wind
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-red-600">
                Live
              </span>
            </div>
            <span className="text-[11px]" style={{ color: INK_SOFT }}>
              총 {items.length}건
            </span>
          </div>
        </div>

        <div style={{ borderTop: "1px solid rgba(92, 58, 31, 0.18)" }} />

        {items.length === 0 ? (
          <p
            className="px-5 py-10 text-center text-xs italic"
            style={{ color: INK_SOFT }}
          >
            {loaded ? "아직 활동이 없습니다." : "불러오는 중..."}
          </p>
        ) : (
          <>
            <ul
              className="flex flex-col gap-1 px-3 py-3 sm:px-5"
              aria-label="최근 활동 목록"
            >
              {pageItems.map((a, index) => {
                const nm = NICKNAME_RE.exec(a.message);
                const matchedNick = nm?.[2] ?? null;
                const nickPrefix = nm?.[1] ?? "";
                const nickSuffix = nm?.[3] ?? "";
                const timeLabel = a.createdAt
                  ? formatSmart(a.createdAt.toDate())
                  : "";
                const live = isLiveItem(a);

                const planeRotate = 30 + (index % 3) * 10;
                const indent = 4 + (index % 3) * 6;

                const rowBody = (
                  <>
                    {/* Paper airplane + dashed trail */}
                    <div
                      className="relative flex-shrink-0"
                      style={{ transform: `rotate(${planeRotate}deg)` }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5 sm:h-6 sm:w-6"
                        fill="none"
                        aria-hidden
                      >
                        <path
                          d="M3 3l18 9-18 9 3-9-3-9z"
                          fill={INK_PLANE_FILL}
                          stroke={INK_PLANE_STROKE}
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <div
                        className="absolute right-full top-1/2 h-px w-7"
                        style={{
                          background: `repeating-linear-gradient(to left, ${TRAIL_DASH} 0px, ${TRAIL_DASH} 3px, transparent 3px, transparent 6px)`,
                          transform: "translateY(-50%)",
                        }}
                      />
                    </div>

                    {/* Activity text */}
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-[13px] leading-snug sm:text-sm"
                        style={{ color: INK }}
                      >
                        {matchedNick ? (
                          <>
                            {nickPrefix}
                            <Dl2TitlePrefix nickname={matchedNick} />
                            <span className="font-semibold" style={{ color: INK }}>
                              {matchedNick}
                            </span>
                            <span style={{ color: INK_SOFT }}>님</span>
                            {nickSuffix}
                          </>
                        ) : (
                          <span>{a.message}</span>
                        )}
                      </p>
                    </div>

                    {/* Time + LIVE badge */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      {live && (
                        <span className="rounded-full border border-red-500/60 bg-red-500/10 px-1.5 py-0.5 text-[8px] font-medium tracking-widest text-red-600">
                          LIVE
                        </span>
                      )}
                      <time
                        className="text-[10px] sm:text-[11px]"
                        style={{ color: INK_SOFT }}
                      >
                        {timeLabel}
                      </time>
                    </div>
                  </>
                );

                const rowProps = {
                  className:
                    "group relative flex items-center gap-3 rounded-lg py-2 transition-colors hover:bg-[rgba(92,58,31,0.06)]",
                  style: { paddingLeft: `${indent}px` } as const,
                };

                return (
                  <li key={a.id}>
                    {a.link ? (
                      <a
                        href={a.link}
                        {...rowProps}
                        onClick={(e) => {
                          e.preventDefault();
                          router.push(a.link as string);
                        }}
                      >
                        {rowBody}
                      </a>
                    ) : (
                      <div {...rowProps}>{rowBody}</div>
                    )}
                  </li>
                );
              })}
            </ul>

            {totalPages > 1 && (
              <div
                className="flex items-center justify-between gap-3 px-5 py-3"
                style={{ borderTop: "1px solid rgba(92, 58, 31, 0.18)" }}
              >
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={isFirst}
                  aria-label="이전 페이지"
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] tracking-wider transition-all ${
                    isFirst
                      ? "cursor-not-allowed opacity-30"
                      : "hover:bg-[rgba(92,58,31,0.06)]"
                  }`}
                  style={{ color: INK }}
                >
                  <ChevronLeft className="h-3 w-3" />
                  이전
                </button>

                <span
                  className="text-[11px] tracking-widest"
                  style={{ color: INK_SOFT }}
                >
                  <span className="font-semibold" style={{ color: INK }}>
                    {currentPage}
                  </span>
                  <span className="mx-1.5">/</span>
                  <span>{totalPages}</span>
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={isLast}
                  aria-label="다음 페이지"
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] tracking-wider transition-all ${
                    isLast
                      ? "cursor-not-allowed opacity-30"
                      : "hover:bg-[rgba(92,58,31,0.06)]"
                  }`}
                  style={{ color: INK }}
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
