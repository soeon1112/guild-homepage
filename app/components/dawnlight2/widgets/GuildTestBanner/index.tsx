"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/app/components/AuthProvider";
import { canSeeGuildTest } from "@/src/lib/guildTest";

// 마음 들여다보기 — entry banner for /guild-test self-check.
//
// Verbatim copy from the deleted cosmic GuildTestBanner ("나는 새벽빛에
// 어울리는 별일까?", "솔직한 마음을 들려주세요 ✨", "마음 들여다보기 →").
// Visible to every signed-in member (canSeeGuildTest open since the
// 2026-05-03 full release). Click → /guild-test.
//
// V2 — distinct from WhispersFeed's flat peach card:
//   • Surface: warm 노을 linear-gradient (peach → coral → deep rose), 135°.
//     Same warm family as the other dl2 widgets so it doesn't look out
//     of place, but the gradient direction + deeper rose endpoint make
//     it read as a CTA banner rather than an activity card.
//   • Icon: deep twilight disc (`#2a2748`) — "window into night sky" —
//     with a cream SVG crescent (full circle masked by an offset black
//     circle = bite) + 2 tiny cream sparkle dots. Replaces the cream-
//     yellow disc that was reading as a banana.
//   • CTA pill: dark ink bg + cream text — high contrast against the
//     warm gradient so the click target stands out.
//   • Soft warm-rose drop-shadow under the card to lift it above the
//     noctilucent gradient without overpowering siblings.

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
        className="group block overflow-hidden rounded-2xl transition-shadow hover:shadow-xl active:opacity-90"
        style={{
          background:
            "linear-gradient(135deg, #ffc8a8 0%, #ed9b85 55%, #d27a78 100%)",
          border: "1px solid rgba(120, 50, 50, 0.22)",
          boxShadow:
            "0 6px 22px -10px rgba(210, 122, 120, 0.55), 0 2px 6px -2px rgba(120, 50, 30, 0.18)",
        }}
      >
        <div className="flex items-center gap-4 px-5 py-4 sm:px-6 sm:py-5">
          {/* Night-sky window with crescent moon. The mask-based
              crescent (full cream circle masked by an offset black
              circle = bite) renders identically on web SVG and
              react-native-svg, so the RN port stays 1:1. */}
          <span
            className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center sm:h-14 sm:w-14"
            aria-hidden
          >
            <svg viewBox="0 0 48 48" className="h-full w-full">
              <defs>
                <mask id="dl2-gtb-moon-bite">
                  <rect width="48" height="48" fill="white" />
                  <circle cx="28" cy="24" r="11" fill="black" />
                </mask>
              </defs>
              <circle cx="24" cy="24" r="24" fill="#2a2748" />
              <circle
                cx="24"
                cy="24"
                r="23"
                fill="none"
                stroke="rgba(255,245,216,0.20)"
                strokeWidth="0.8"
              />
              <circle
                cx="24"
                cy="24"
                r="13"
                fill="#fff5d8"
                mask="url(#dl2-gtb-moon-bite)"
              />
              <circle cx="38" cy="13" r="1.3" fill="#fff5d8" opacity="0.9" />
              <circle cx="40" cy="33" r="0.9" fill="#fff5d8" opacity="0.65" />
            </svg>
          </span>

          <span className="min-w-0 flex-1">
            <span
              className="block font-serif-kr text-[15px] italic leading-snug sm:text-base"
              style={{ color: "#3a1810" }}
            >
              나는 새벽빛에 어울리는 별일까?
            </span>
            <span
              className="mt-1 block text-[12px] leading-snug sm:text-[13px]"
              style={{ color: "#7a3838" }}
            >
              솔직한 마음을 들려주세요 ✨
            </span>
          </span>

          <span
            className="hidden flex-shrink-0 items-center gap-1 rounded-full px-4 py-2 text-[11px] font-semibold transition-transform group-hover:translate-x-0.5 sm:inline-flex"
            style={{
              background: "#3a1810",
              color: "#fff5d8",
              boxShadow: "0 2px 8px -2px rgba(58, 24, 16, 0.5)",
            }}
          >
            마음 들여다보기 →
          </span>
          <ChevronRight
            className="h-5 w-5 flex-shrink-0 transition-transform group-hover:translate-x-0.5 sm:hidden"
            style={{ color: "#3a1810" }}
            aria-hidden
          />
        </div>
      </Link>
    </section>
  );
}
