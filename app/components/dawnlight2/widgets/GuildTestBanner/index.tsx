"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/app/components/AuthProvider";
import { canSeeGuildTest } from "@/src/lib/guildTest";

// 마음 들여다보기 — entry banner for /guild-test self-check.
//
// Originally lived in the deleted cosmic GuildTestBanner; reborn here
// retoned for dawnlight2. Verbatim copy from the cosmic version (eyebrow
// "SELF CHECK" → outer English subtitle, title "나는 새벽빛에 어울리는
// 별일까?", desc "솔직한 마음을 들려주세요 ✨", CTA "마음 들여다보기 →").
// Visible to every signed-in member (canSeeGuildTest is open since the
// 2026-05-03 full release). Click → /guild-test.
//
// Dl2 design grammar: cream Korean h2 + mist-lavender uppercase English
// subtitle in an outside header (mirrors WhispersFeed / NoteToTheSky /
// PaperPlaneLetters), peach `rgba(255,212,184,0.72)` rounded-2xl card
// with the same navy-tinted hairline border WhispersFeed uses, INK
// ink-brown text tier (#3a2010 / #5c3a1f / #8a6040). Moon glyph sits in
// a cream disk on the left so the banner reads as the contemplative
// sibling of the activity feed below it.

export function GuildTestBanner() {
  const { nickname, ready } = useAuth();
  if (!ready) return null;
  if (!canSeeGuildTest(nickname)) return null;

  return (
    <section
      aria-labelledby="dl2-guildtest-banner"
      className="mx-auto w-full max-w-2xl px-5 pb-12 pt-2 sm:px-6 sm:pb-16"
    >
      <header className="mb-3 px-1">
        <h2
          id="dl2-guildtest-banner"
          className="text-lg font-semibold leading-tight text-cream sm:text-xl"
        >
          마음 들여다보기
        </h2>
        <p className="mt-1 text-[10px] uppercase tracking-[0.32em] text-mist-lavender">
          Self Check
        </p>
      </header>

      <Link
        href="/guild-test"
        aria-label="셀프 점검: 나는 새벽빛에 어울리는 별일까?"
        className="group block overflow-hidden rounded-2xl transition-opacity hover:opacity-95 active:opacity-85"
        style={{
          background: "rgba(255, 212, 184, 0.72)",
          border: "1px solid rgba(74, 90, 140, 0.18)",
        }}
      >
        <div className="flex items-center gap-4 px-5 py-4 sm:px-6 sm:py-5">
          <span
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-2xl sm:h-14 sm:w-14 sm:text-[26px]"
            style={{
              background: "rgba(254, 245, 230, 0.9)",
              boxShadow: "inset 0 0 0 1px rgba(92, 58, 31, 0.08)",
            }}
            aria-hidden
          >
            🌙
          </span>

          <span className="min-w-0 flex-1">
            <span
              className="block font-serif-kr text-[15px] italic leading-snug sm:text-base"
              style={{ color: "#3a2010" }}
            >
              나는 새벽빛에 어울리는 별일까?
            </span>
            <span
              className="mt-1 block text-[12px] leading-snug sm:text-[13px]"
              style={{ color: "#8a6040" }}
            >
              솔직한 마음을 들려주세요 ✨
            </span>
          </span>

          <span
            className="hidden flex-shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium transition-transform group-hover:translate-x-0.5 sm:inline-flex"
            style={{ background: "#ffd4b8", color: "#5c3a1f" }}
          >
            마음 들여다보기 →
          </span>
          <ChevronRight
            className="h-5 w-5 flex-shrink-0 transition-transform group-hover:translate-x-0.5 sm:hidden"
            style={{ color: "#5c3a1f" }}
            aria-hidden
          />
        </div>
      </Link>
    </section>
  );
}
