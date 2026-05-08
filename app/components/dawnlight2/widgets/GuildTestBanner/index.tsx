"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/app/components/AuthProvider";
import { canSeeGuildTest } from "@/src/lib/guildTest";

// 마음 들여다보기 — entry banner for /guild-test self-check.
//
// V3 — escapes the "3-tier peach sandwich" between TodaysHorizon's
// noctilucent sky and WhispersFeed's flat peach. The card now reads
// as a quiet night-sky panel (lavender → deep navy-purple vertical
// gradient) with a glowing breathing moon, and a warm peach CTA pill
// snaps the click target back into the eye after the cool surface.
//
// Body copy + visibility gate verbatim from the cosmic original
// (canSeeGuildTest is open to every signed-in member since the
// 2026-05-03 full release). Click → /guild-test.
//
// Moon icon — reuses the existing /guild-test intro asset verbatim.
// `.guildtest-intro-emoji` (defined in app/globals.css for the
// guildtest intro card) bundles font-size + the pinkish-purple
// `filter: drop-shadow(0 0 16px rgba(216, 150, 200, 0.6))` recipe;
// we apply the class directly so any future tweak to that rule
// flows through to both the banner and the /guild-test page.
//
// Animation: a single keyframe drives BOTH transform: translateY
// (0 → -3 px) and filter: drop-shadow (rgba(216, 150, 200, *), same
// pinkish-purple as the source class, alpha 0.6 → 1.0, blur 12 →
// 18 px) on the SAME wrapper element — so the crescent and its glow
// are mathematically inseparable. 5 s mirrored cycle, ease-in-out
// sine. Mirrors the RN counterpart's single Animated.View driven
// by one `useSharedValue` that animates translateY +
// shadowOpacity + shadowRadius together with the same numeric ranges.

const ANIM_KEYFRAMES = `
@keyframes dl2-gtb-moon-breath {
  0%, 100% {
    transform: translateY(0);
    filter: drop-shadow(0 0 12px rgba(216, 150, 200, 0.6));
  }
  50% {
    transform: translateY(-3px);
    filter: drop-shadow(0 0 18px rgba(216, 150, 200, 1.0));
  }
}
`;

export function GuildTestBanner() {
  const { nickname, ready } = useAuth();
  if (!ready) return null;
  if (!canSeeGuildTest(nickname)) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ANIM_KEYFRAMES }} />
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
          className="group block overflow-hidden rounded-2xl transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-2xl active:translate-y-0 active:opacity-95"
          style={{
            background:
              "linear-gradient(180deg, #6e5f9a 0%, #4a3f78 50%, #2e2c50 100%)",
            border: "1px solid rgba(200, 184, 232, 0.28)",
            boxShadow:
              "0 10px 30px -12px rgba(140, 120, 200, 0.55), 0 2px 8px -2px rgba(40, 30, 80, 0.4)",
          }}
        >
          <div className="flex items-center gap-4 px-5 py-4 sm:px-6 sm:py-5">
            {/* The /guild-test intro asset reused as-is: the
                `.guildtest-intro-emoji` class (font-size + pinkish-
                purple drop-shadow) wraps the same 🌙 emoji used on
                the intro card. Inline overrides shrink it for the
                banner row and zero out the intro-specific margin;
                the keyframe owns `filter` for the breathing glow. */}
            <span
              aria-hidden
              className="guildtest-intro-emoji flex h-14 w-14 flex-shrink-0 items-center justify-center"
              style={{
                fontSize: "2.25rem",
                lineHeight: 1,
                margin: 0,
                animation: "dl2-gtb-moon-breath 5s ease-in-out infinite",
                willChange: "transform, filter",
              }}
            >
              🌙
            </span>

            <span className="min-w-0 flex-1">
              <span
                className="block font-serif-kr text-[15px] italic leading-snug sm:text-base"
                style={{ color: "#fef5e6" }}
              >
                나는 새벽빛에 어울리는 별일까?
              </span>
              <span
                className="mt-1 block text-[12px] leading-snug sm:text-[13px]"
                style={{ color: "rgba(254, 245, 230, 0.72)" }}
              >
                솔직한 마음을 들려주세요 ✨
              </span>
            </span>

            <span
              className="hidden flex-shrink-0 items-center gap-1 rounded-full px-4 py-2 text-[11px] font-semibold transition-transform group-hover:translate-x-0.5 sm:inline-flex"
              style={{
                background: "#ffd4b8",
                color: "#3a1810",
                boxShadow: "0 2px 10px -2px rgba(120, 80, 60, 0.5)",
              }}
            >
              마음 들여다보기 →
            </span>
            <ChevronRight
              className="h-5 w-5 flex-shrink-0 transition-transform group-hover:translate-x-0.5 sm:hidden"
              style={{ color: "#ffd4b8" }}
              aria-hidden
            />
          </div>
        </Link>
      </section>
    </>
  );
}
