"use client";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Send, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { formatSmart } from "@/src/lib/formatSmart";
import { addPoints } from "@/src/lib/points";
import { useAuth } from "@/app/components/AuthProvider";

type GuestbookEntry = {
  id: string;
  nickname: string;
  message: string;
  createdAt: Timestamp | null;
};

const PAGE_SIZE = 6;

/** Deterministic 0..1 from a string (djb2-style). */
function hashToUnit(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return (Math.abs(h) % 10000) / 10000;
}

/** Derive stable floating-card position/timing from the Firestore id.
 *  Matches v0's hardcoded ranges (x: 4..66, y: 4..86, delay: 0..2, duration: 5..7). */
function whisperPlacement(id: string) {
  return {
    x: 4 + hashToUnit(id + "x") * 62,
    y: 4 + hashToUnit(id + "y") * 82,
    delay: hashToUnit(id + "d") * 2,
    duration: 5 + hashToUnit(id + "u") * 2,
  };
}

export function WhispersToStars() {
  const { nickname, ready } = useAuth();
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Drag constraint target — cards can only be dragged within this container
  const fieldRef = useRef<HTMLDivElement>(null);

  // Subscribe to Firestore home guestbook
  useEffect(() => {
    const q = query(
      collection(db, "guestbook"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          nickname: (data.nickname as string) ?? "",
          message: (data.message as string) ?? "",
          createdAt: (data.createdAt as Timestamp | null) ?? null,
        };
      });
      setEntries(list);
      setLoaded(true);
    });
    return () => unsub();
  }, []);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));

  // Clamp current page if entries shrink
  useEffect(() => {
    if (!loaded) return;
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [loaded, currentPage, totalPages]);

  const visibleEntries = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return entries.slice(start, start + PAGE_SIZE);
  }, [currentPage, entries]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!nickname || submitting) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, "guestbook"), {
        nickname,
        message: trimmed,
        createdAt: serverTimestamp(),
      });
      setDraft("");
      setCurrentPage(1); // show new whisper immediately
      // Preserve legacy behaviour — 2 pts per home-guestbook entry
      await addPoints(nickname, "방명록", 2, "홈 방명록에 글 작성");
    } catch (err) {
      console.error(err);
    }
    setSubmitting(false);
  };

  const canSubmit = ready && !!nickname && !submitting && draft.trim().length > 0;
  const isFirst = currentPage === 1;
  const isLast = currentPage === totalPages;

  const placeholder = !ready
    ? "..."
    : nickname
      ? "이 밤, 당신의 별에 남길 한마디..."
      : "로그인 후 한마디를 남길 수 있어요";

  return (
    <section className="relative px-4 pb-4">
      <div className="mb-2 flex items-end justify-between">
        <div>
          <h2 className="font-serif text-base tracking-wide text-text-primary text-glow-soft">
            별에게 한마디
          </h2>
          <span className="font-serif text-[10px] tracking-[0.4em] text-text-sub uppercase">
            Whispers to the Stars
          </span>
        </div>
        <span className="font-serif text-[10px] text-text-sub">
          {entries.length}개의 속삭임
        </span>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-nebula-pink/25 bg-abyss-deep/45 p-3 backdrop-blur-sm">
        {/* Soft nebula backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 15% 20%, rgba(216,150,200,0.22) 0%, transparent 55%), radial-gradient(ellipse at 85% 80%, rgba(255,181,167,0.18) 0%, transparent 55%)",
          }}
        />

        {/* Tiny background stars */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {Array.from({ length: 20 }).map((_, i) => {
            const cx = (i * 53) % 100;
            const cy = (i * 37) % 100;
            const r = (i % 3) * 0.15 + 0.2;
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="#FFE5C4"
                opacity={0.3 + ((i * 7) % 5) * 0.1}
              />
            );
          })}
        </svg>

        {/* Hint: cards are draggable */}
        <p className="relative mb-1 text-right font-serif text-[9px] italic text-text-sub/60">
          카드를 움직여 가려진 속삭임을 확인할 수 있어요
        </p>

        {/* Floating whisper cards field (drag area) */}
        <div ref={fieldRef} className="relative h-[180px] w-full">
          {visibleEntries.length === 0 && loaded && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="font-serif text-[11px] italic text-text-sub/70">
                아직 띄워진 한마디가 없어요
              </p>
            </div>
          )}

          {visibleEntries.map((entry) => {
            const p = whisperPlacement(entry.id);
            const time = entry.createdAt
              ? formatSmart(entry.createdAt.toDate())
              : "";
            return (
              <motion.article
                key={entry.id}
                className="absolute max-w-[180px] cursor-grab touch-none select-none rounded-xl border border-nebula-pink/25 bg-abyss/55 px-2.5 py-1.5 backdrop-blur-md active:cursor-grabbing"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  boxShadow:
                    "0 4px 18px rgba(0,0,0,0.4), 0 0 10px rgba(216,150,200,0.2)",
                }}
                drag
                dragConstraints={fieldRef}
                dragElastic={0.08}
                dragMomentum={false}
                whileDrag={{
                  scale: 1.06,
                  zIndex: 50,
                  boxShadow:
                    "0 10px 30px rgba(0,0,0,0.55), 0 0 24px rgba(216,150,200,0.55)",
                }}
                initial={{ opacity: 0, y: 8 }}
                animate={{
                  opacity: 1,
                  y: [0, -6, 0, 6, 0],
                }}
                transition={{
                  opacity: { duration: 0.6 },
                  y: {
                    duration: p.duration,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                    delay: p.delay,
                  },
                }}
              >
                <div className="flex items-center gap-1">
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 10 10"
                    aria-hidden
                    className="shrink-0"
                  >
                    <path
                      d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z"
                      fill="#FFE5C4"
                      style={{ filter: "drop-shadow(0 0 3px #FFE5C4)" }}
                      className="animate-twinkle"
                    />
                  </svg>
                  <span className="truncate font-serif text-[10px] tracking-wider text-stardust">
                    {entry.nickname}
                  </span>
                  <span className="ml-auto shrink-0 font-serif text-[8px] text-text-sub">
                    {time}
                  </span>
                </div>
                <p className="wrap-anywhere mt-0.5 font-serif text-[11px] leading-snug text-text-primary text-pretty">
                  {entry.message}
                </p>
              </motion.article>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="relative mt-3 flex items-center justify-between gap-3">
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
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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

        {/* Input row */}
        <form
          onSubmit={handleSubmit}
          className="relative mt-3 flex items-center gap-2 rounded-full border border-nebula-pink/40 bg-abyss/60 py-1.5 pl-3 pr-1.5 backdrop-blur-md focus-within:border-stardust/70"
        >
          <Sparkles
            className="h-3.5 w-3.5 shrink-0 text-nebula-pink"
            aria-hidden
          />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={80}
            disabled={!ready || !nickname || submitting}
            placeholder={placeholder}
            aria-label="별에게 남길 한마디"
            className="min-w-0 flex-1 bg-transparent font-serif text-[12px] text-text-primary placeholder:text-text-sub/70 focus:outline-none disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className="group flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 font-serif text-[11px] tracking-wider text-abyss transition-all disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, #FFE5C4 0%, #FFB5A7 60%, #D896C8 120%)",
              boxShadow: "0 0 12px rgba(255,181,167,0.5)",
            }}
          >
            <Send className="h-3 w-3" />
            {submitting ? "..." : "띄우기"}
          </button>
        </form>
      </div>
    </section>
  );
}
