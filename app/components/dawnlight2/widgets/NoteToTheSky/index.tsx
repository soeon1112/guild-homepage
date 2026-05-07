"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
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

// Note to the Sky — Dawnlight 2 guestbook widget.
//
// Same Firestore source as the cosmic WhispersToStars
// (collection "guestbook", orderBy createdAt desc, onSnapshot live)
// + same write payload (nickname from useAuth, message trimmed,
// createdAt: serverTimestamp). Different visual: parchment-tone
// feather-note card with ink-brown type, coral submit button, no
// drag-and-drop floating layer (cosmic's drag UI is intentionally
// not ported — the dawnlight2 surface reads as a written note, not
// a star field).
//
// Pagination 6/page mirrors cosmic 1:1; max length 80 also matches.

type Entry = {
  id: string;
  nickname: string;
  message: string;
  createdAt: Timestamp | null;
};

const PAGE_SIZE = 6;
const MAX_LENGTH = 80;

// Pre-mixed ink palette so the only translucent surface is the card
// (and even that is opaque parchment for readability — see card style).
const INK = "#5c3a1f";
const INK_SOFT = "#8a6a4a";
const NICK = "#3d4a8c"; // deeper navy ink for the author name — distinguishes from WhispersFeed brown
const ACCENT = "#b85420"; // coral, also used by Dl2TitlePrefix

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

  const isFirst = currentPage === 1;
  const isLast = currentPage === totalPages;

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
      <div
        className="relative overflow-hidden"
        style={{
          // Asymmetric corner radii — light "feather note" suggestion
          // without going full quill-shape (which we tried in v0 and
          // didn't read clearly). Top-right and bottom-left stay
          // tighter so the eye reads the top-left + bottom-right curve
          // as the note's natural curl.
          borderRadius: "26px 12px 28px 14px",
          background: "#f0e4cc",
          boxShadow: "0 4px 16px rgba(42, 20, 10, 0.10)",
        }}
      >
        <div className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
          {/* Header */}
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2
                id="dl2-note-to-the-sky"
                className="text-lg font-semibold leading-tight sm:text-xl"
                style={{ color: INK }}
              >
                하늘에 새긴 한마디
              </h2>
              <p
                className="mt-0.5 text-[10px] uppercase tracking-[0.32em]"
                style={{ color: INK_SOFT }}
              >
                A Note to the Sky
              </p>
            </div>
            <span
              className="mt-1 shrink-0 text-[11px] italic"
              style={{ color: INK_SOFT }}
            >
              {entries.length}개의 속삭임
            </span>
          </div>

          <div
            className="mb-3"
            style={{ borderTop: "1px solid rgba(92, 58, 31, 0.2)" }}
          />

          {/* Message list */}
          {entries.length === 0 ? (
            <p
              className="py-8 text-center text-xs italic"
              style={{ color: INK_SOFT }}
            >
              {loaded ? "아직 한마디도 남지 않았어요." : "불러오는 중..."}
            </p>
          ) : (
            <ul className="flex flex-col" aria-label="한마디 목록">
              {pageItems.map((m) => (
                <li
                  key={m.id}
                  className="border-b py-2.5 last:border-b-0"
                  style={{ borderColor: "rgba(92, 58, 31, 0.10)" }}
                >
                  <p
                    className="text-[14px] leading-relaxed"
                    style={{ color: INK }}
                  >
                    {m.message}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1 text-[11px]">
                    <span aria-hidden style={{ color: INK_SOFT }}>
                      —
                    </span>
                    <Dl2TitlePrefix nickname={m.nickname} />
                    <span className="font-semibold" style={{ color: NICK }}>
                      {m.nickname}
                    </span>
                    {m.createdAt && (
                      <span
                        className="hidden md:inline"
                        style={{ color: INK_SOFT }}
                      >
                        · {formatSmart(m.createdAt.toDate())}
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              className="mt-3 flex items-center justify-between gap-3 pt-2"
              style={{ borderTop: "1px solid rgba(92, 58, 31, 0.2)" }}
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

          {/* Input form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-stretch"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_LENGTH}
              rows={2}
              placeholder={
                nickname ? "한마디를 남겨주세요" : "로그인 후 남길 수 있어요"
              }
              disabled={!nickname || busy}
              className="min-h-[44px] flex-1 resize-none rounded-xl px-3 py-2 text-[13px] leading-relaxed outline-none transition-colors focus:border-[rgba(184,84,32,0.55)]"
              style={{
                background: "rgba(255, 246, 224, 0.7)",
                color: INK,
                border: "1px solid rgba(92, 58, 31, 0.18)",
              }}
            />
            <button
              type="submit"
              disabled={!canSubmit}
              className={`rounded-xl px-5 py-2 text-sm font-medium tracking-wide text-cream transition-all sm:self-stretch ${
                canSubmit
                  ? "hover:brightness-110"
                  : "cursor-not-allowed opacity-50"
              }`}
              style={{
                background: ACCENT,
                color: "#fef5e6",
              }}
            >
              남기기
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
