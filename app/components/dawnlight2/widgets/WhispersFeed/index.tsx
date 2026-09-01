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
// 멘션 활동 전용 — "X님이 Y님을 언급했습니다" / "X님이 연합원들을 언급했습니다".
// NICKNAME_RE 보다 먼저 시도해서 누구2/연합원들도 강조한다. 다른 카테고리는
// 모두 "...했어요" 끝맺음이라 false positive 0.
const MENTION_RE = /^(.+?)님이 (.+?)(님을|을) 언급했습니다$/;
// "연합원들"로 통일 전엔 "우리길원들"이었다 — Firestore activity 문서는
// 마이그레이션 안 하므로, 과거에 이미 저장된 문구도 계속 전체-멘션
// 강조색으로 표시되도록 옛 문구도 같이 확인한다(functions/src/lib/
// mentions.ts 의 LEGACY_ALL_MENTION_KEYWORDS 와 같은 이유).
const ALL_MENTION_TARGETS = new Set(["연합원들", "우리길원들"]);
// 멘션 활동 색상 — MentionText dl2 모드와 일치. 다른 row 영향 없게 별도 토큰.
const MENTION_TARGET = "#2a4570"; // 개별 닉
const MENTION_TARGET_ALL = "#b85420"; // 연합원들

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
      {/* Header — outside the box, on the noctilucent gradient.
          Cream + mist-lavender so the section label reads against
          the dark sky; same sizing rules as the NoteToTheSky header
          (Korean title 18-20 px / English subtitle 10 px / 0.32 em
          tracking) so the two widgets stack as siblings. The LIVE
          chip rides on the title baseline; "총 N건" is gone. */}
      <header className="mb-3 px-1">
        <div className="flex items-center gap-3">
          <h2
            id="dl2-whispers-feed"
            className="text-lg font-semibold leading-tight text-cream sm:text-xl"
          >
            바람결 소식
          </h2>
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-red-400">
              Live
            </span>
          </span>
        </div>
        <p className="mt-1 text-[10px] uppercase tracking-[0.32em] text-mist-lavender">
          Whispers on the Wind
        </p>
      </header>

      <div
        className="overflow-hidden rounded-2xl"
        style={{
          background: "rgba(255, 212, 184, 0.72)",
          border: "1px solid rgba(74, 90, 140, 0.18)",
        }}
      >
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
                const mm = MENTION_RE.exec(a.message);
                const mentionAuthor = mm?.[1] ?? null;
                const mentionTarget = mm?.[2] ?? null;
                const mentionTargetSuffix = mm?.[3] ?? "";
                const isAllMention =
                  !!mentionTarget && ALL_MENTION_TARGETS.has(mentionTarget);
                const nm = mm ? null : NICKNAME_RE.exec(a.message);
                const matchedNick = nm?.[2] ?? null;
                const nickPrefix = nm?.[1] ?? "";
                const nickSuffix = nm?.[3] ?? "";
                const timeLabel = a.createdAt
                  ? formatSmart(a.createdAt.toDate())
                  : "";
                const live = isLiveItem(a);

                const planeRotate = 30 + (index % 3) * 10;
                const indent = 2 + (index % 3) * 4;

                const rowBody = (
                  <>
                    {/* Paper airplane + dashed trail */}
                    <div
                      className="relative flex-shrink-0"
                      style={{ transform: `rotate(${planeRotate}deg)` }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 sm:h-5 sm:w-5"
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
                        className="absolute right-full top-1/2 h-px w-5"
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
                        {mentionAuthor && mentionTarget ? (
                          <>
                            <span className="font-semibold" style={{ color: INK }}>
                              {mentionAuthor}
                            </span>
                            <span style={{ color: INK_SOFT }}>님이 </span>
                            <span
                              className="font-semibold"
                              style={{
                                color: isAllMention
                                  ? MENTION_TARGET_ALL
                                  : MENTION_TARGET,
                              }}
                            >
                              {mentionTarget}
                            </span>
                            <span style={{ color: INK_SOFT }}>
                              {mentionTargetSuffix} 언급했습니다
                            </span>
                          </>
                        ) : matchedNick ? (
                          <>
                            {nickPrefix}
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
                        className="hidden text-[11px] md:inline"
                        style={{ color: INK_SOFT }}
                      >
                        {timeLabel}
                      </time>
                    </div>
                  </>
                );

                const rowProps = {
                  className:
                    "group relative flex items-center gap-2 rounded-lg py-2 transition-colors hover:bg-[rgba(92,58,31,0.06)]",
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
