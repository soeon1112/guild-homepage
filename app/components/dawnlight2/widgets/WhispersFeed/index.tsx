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
          background: "rgba(255, 212, 184, 0.82)",
          border: "1px solid rgba(74, 90, 140, 0.18)",
        }}
      >
        {/* Header — title + LIVE + count, all inside the box per v0 */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
          <div>
            <h2
              id="dl2-whispers-feed"
              className="font-serif-kr text-lg font-medium leading-tight text-twilight-deep sm:text-xl"
            >
              바람결 소식
            </h2>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.32em] text-twilight-mid/70">
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
            <span className="text-[11px] text-twilight-mid/75">
              총 {items.length}건
            </span>
          </div>
        </div>

        <div style={{ borderTop: "1px solid rgba(74, 90, 140, 0.15)" }} />

        {items.length === 0 ? (
          <p className="px-5 py-10 text-center font-serif-kr text-xs italic text-twilight-mid/70">
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
                          fill="rgba(42, 31, 74, 0.78)"
                          stroke="rgba(42, 31, 74, 0.45)"
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <div
                        className="absolute right-full top-1/2 h-px w-7"
                        style={{
                          background:
                            "repeating-linear-gradient(to left, rgba(42,31,74,0.4) 0px, rgba(42,31,74,0.4) 3px, transparent 3px, transparent 6px)",
                          transform: "translateY(-50%)",
                        }}
                      />
                    </div>

                    {/* Activity text */}
                    <div className="min-w-0 flex-1">
                      <p className="font-serif-kr text-[13px] leading-snug text-twilight-deep sm:text-sm">
                        {matchedNick ? (
                          <>
                            {nickPrefix}
                            <span className="font-semibold text-twilight-deep">
                              {matchedNick}
                            </span>
                            <span className="text-twilight-mid">님</span>
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
                      <time className="text-[10px] text-twilight-mid/75 sm:text-[11px]">
                        {timeLabel}
                      </time>
                    </div>
                  </>
                );

                const rowProps = {
                  className:
                    "group relative flex items-center gap-3 rounded-lg py-2 transition-colors hover:bg-twilight-deep/5",
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
                style={{ borderTop: "1px solid rgba(74, 90, 140, 0.15)" }}
              >
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={isFirst}
                  aria-label="이전 페이지"
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] tracking-wider text-twilight-mid transition-all ${
                    isFirst
                      ? "cursor-not-allowed opacity-30"
                      : "hover:bg-twilight-deep/5 hover:text-twilight-deep"
                  }`}
                >
                  <ChevronLeft className="h-3 w-3" />
                  이전
                </button>

                <span className="text-[11px] tracking-widest text-twilight-mid/70">
                  <span className="font-semibold text-twilight-deep">
                    {currentPage}
                  </span>
                  <span className="mx-1.5 opacity-60">/</span>
                  <span>{totalPages}</span>
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={isLast}
                  aria-label="다음 페이지"
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] tracking-wider text-twilight-mid transition-all ${
                    isLast
                      ? "cursor-not-allowed opacity-30"
                      : "hover:bg-twilight-deep/5 hover:text-twilight-deep"
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
