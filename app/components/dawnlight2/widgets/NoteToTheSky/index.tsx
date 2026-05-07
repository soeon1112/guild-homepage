"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useAuth } from "@/app/components/AuthProvider";
import { Dl2TitlePrefix } from "../WhispersFeed/Dl2TitlePrefix";

// Note to the Sky — port of v0/components/dawnlight/star-scroll.tsx,
// retoned for production. Visual chrome (radial parchment gradient,
// SVG noise + grain layers, edge vignette, star marks beside each
// message, italic-serif type, gold/coral CTA pill, hairline dividers,
// pagination row) lifted verbatim from v0. The data plumbing is
// rewired to the cosmic WhispersToStars Firestore source ("guestbook"
// collection, onSnapshot live, addDoc with nickname from useAuth +
// trimmed message + serverTimestamp). Only the button gets a coral
// repaint; everything else stays in the v0 ink-brown palette so the
// note reads as a single piece of stationery.

type Entry = {
  id: string;
  nickname: string;
  message: string;
  createdAt: Timestamp | null;
};

const PAGE_SIZE = 5;
const MAX_LENGTH = 80;

function StarMark() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="mt-[3px] h-3 w-3 flex-shrink-0"
      aria-hidden
      fill="#5c3a1f"
      opacity="0.5"
    >
      <path d="M6 0 L6.9 5.1 L12 6 L6.9 6.9 L6 12 L5.1 6.9 L0 6 L5.1 5.1 Z" />
    </svg>
  );
}

function QuillIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 flex-shrink-0"
      aria-hidden
      fill="#5c3a1f"
      opacity="0.45"
    >
      <path d="M13.5 1.5 C12 0 9 1 8 3 L2 13 L5 14 L6 11 L10 7 C12 5 14.5 3.5 13.5 1.5Z" />
      <path d="M2 13 L3.5 11.5 L5 14Z" opacity="0.6" />
    </svg>
  );
}

export function NoteToTheSky() {
  const { nickname } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const q = query(collection(db, "guestbook"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setEntries(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            nickname: (data.nickname as string) ?? "",
            message: (data.message as string) ?? "",
            createdAt: (data.createdAt as Timestamp | null) ?? null,
          };
        }),
      );
      setLoaded(true);
    });
    return () => unsub();
  }, []);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));

  useEffect(() => {
    if (!loaded) return;
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [loaded, currentPage, totalPages]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return entries.slice(start, start + PAGE_SIZE);
  }, [currentPage, entries]);

  const submit = async () => {
    if (!nickname || busy) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await addDoc(collection(db, "guestbook"), {
        nickname,
        message: trimmed,
        createdAt: serverTimestamp(),
      });
      setDraft("");
      setCurrentPage(1);
    } catch (e) {
      console.error(e);
    }
    setBusy(false);
  };

  const canSubmit = !!nickname && draft.trim().length > 0 && !busy;

  return (
    <section
      aria-labelledby="dl2-note-to-the-sky"
      className="mx-auto w-full max-w-2xl px-5 pb-12 pt-2 sm:px-6 sm:pb-16"
    >
      {/* Header outside the parchment, on the noctilucent gradient.
          Cream Korean title + mist-lavender uppercase subtitle so the
          two dawnlight2 widgets (this + WhispersFeed) read as a
          stacked pair with identical label rhythm. */}
      <header className="mb-3 px-1">
        <h2
          id="dl2-note-to-the-sky"
          className="text-lg font-semibold leading-tight text-cream sm:text-xl"
        >
          하늘에 새긴 한마디
        </h2>
        <p className="mt-1 text-[10px] uppercase tracking-[0.32em] text-mist-lavender">
          A Note to the Sky
        </p>
      </header>

      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 45%, #fbecd0 0%, #f5e4c4 55%, #ead4ae 100%)",
          boxShadow:
            "0 8px 32px rgba(42, 20, 10, 0.28), 0 2px 8px rgba(42, 20, 10, 0.18)",
        }}
      >
        {/* Fine grain noise overlay (v0) */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
          style={{ opacity: 0.055, mixBlendMode: "multiply" }}
        >
          <filter id="dl2-parchment-noise">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.68"
              numOctaves={4}
              seed={3}
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#dl2-parchment-noise)" />
        </svg>

        {/* Horizontal grain lines (v0) */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
          style={{ opacity: 0.07, mixBlendMode: "multiply" }}
        >
          <filter id="dl2-parchment-grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.015 0.6"
              numOctaves={2}
              seed={11}
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#dl2-parchment-grain)" />
        </svg>

        {/* Edge yellowing vignette (v0) */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 88% 75% at 50% 50%, transparent 55%, rgba(160, 110, 40, 0.13) 100%)",
          }}
        />

        {/* Content — header lives outside the card now; start
            straight at the message list with comfortable top padding. */}
        <div className="relative px-6 pb-4 pt-4 sm:px-10 sm:pb-5 sm:pt-5">
          {/* Message list */}
          {entries.length === 0 ? (
            <p
              className="py-6 text-center text-xs italic"
              style={{ color: "#8a6040" }}
            >
              {loaded ? "아직 한마디도 남지 않았어요." : "불러오는 중..."}
            </p>
          ) : (
            pageItems.map((m, index) => {
              const dateLabel = m.createdAt
                ? formatSmart(m.createdAt.toDate())
                : "";
              return (
                <div key={m.id}>
                  <div className="flex items-start gap-3 py-3">
                    <StarMark />
                    <div className="min-w-0 flex-1">
                      <p
                        className="font-serif-kr text-[15px] italic leading-relaxed sm:text-base"
                        style={{
                          color: "#3a2010",
                          paddingLeft: `${[0, 4, 2, 6, 0][index % 5]}px`,
                        }}
                      >
                        {m.message}
                      </p>
                      <p
                        className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[11px] italic"
                        style={{ color: "#8a6040" }}
                      >
                        <span aria-hidden>—</span>
                        <Dl2TitlePrefix nickname={m.nickname} />
                        <span style={{ color: "#3a2010", fontWeight: 600 }}>
                          {m.nickname}
                        </span>
                        {dateLabel && (
                          <span className="hidden md:inline">· {dateLabel}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  {index < pageItems.length - 1 && (
                    <div
                      style={{ borderTop: "1px solid rgba(92, 58, 31, 0.14)" }}
                    />
                  )}
                </div>
              );
            })
          )}

          {/* Input row */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="mt-3 flex items-center gap-3 pt-3"
            style={{ borderTop: "1px solid rgba(92, 58, 31, 0.22)" }}
          >
            <QuillIcon />
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                nickname ? "한마디를 남겨주세요" : "로그인 후 남길 수 있어요"
              }
              maxLength={MAX_LENGTH}
              disabled={!nickname || busy}
              className="min-w-0 flex-1 bg-transparent text-sm placeholder:opacity-50 focus:outline-none disabled:cursor-not-allowed"
              style={{ color: "#3a2010", caretColor: "#5c3a1f" }}
              aria-label="하늘에 남길 한마디 입력"
            />
            <button
              type="submit"
              disabled={!canSubmit}
              className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-opacity active:scale-95 ${
                canSubmit
                  ? "hover:opacity-90"
                  : "cursor-not-allowed opacity-40"
              }`}
              style={{
                background: "#b85420",
                color: "#fef5e6",
              }}
            >
              ✦ 남기기
            </button>
          </form>

          {/* Pagination — only when more than one page */}
          {totalPages > 1 && (
            <div
              className="mt-4 flex items-center justify-center gap-1.5 pt-3"
              style={{ borderTop: "1px solid rgba(92, 58, 31, 0.15)" }}
            >
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-full px-3 py-1 text-[11px] transition-opacity hover:opacity-70 disabled:opacity-30"
                style={{ color: "#5c3a1f", background: "rgba(92,58,31,0.08)" }}
              >
                이전
              </button>
              <button
                type="button"
                aria-current="page"
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: "rgba(92,58,31,0.14)", color: "#3a2010" }}
              >
                {currentPage}
              </button>
              <span
                className="px-0.5 text-[11px]"
                style={{ color: "rgba(92,58,31,0.4)" }}
              >
                /
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="rounded-full px-2.5 py-1 text-[11px] transition-opacity hover:opacity-70 disabled:opacity-30"
                style={{ color: "#5c3a1f", background: "rgba(92,58,31,0.08)" }}
              >
                {totalPages}
              </button>
              <button
                type="button"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="rounded-full px-3 py-1 text-[11px] transition-opacity hover:opacity-70 disabled:opacity-30"
                style={{ color: "#5c3a1f", background: "rgba(92,58,31,0.08)" }}
              >
                다음
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
