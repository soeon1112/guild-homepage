"use client";

// "나는 새벽빛에 어울리는 별일까?" — soft-launched self-check banner
// occupying the slot the rebirth-stone event used to live in.
// Visibility gated to GUILD_TEST_ADMIN_NICKNAME via canSeeGuildTest()
// while we QA. Click → /guild-test.

import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import { canSeeGuildTest } from "@/src/lib/guildTest";

export function GuildTestBanner() {
  const { nickname, ready } = useAuth();
  if (!ready) return null;
  if (!canSeeGuildTest(nickname)) return null;

  return (
    <Link
      href="/guild-test"
      className="guildtest-banner"
      aria-label="셀프 점검: 나는 새벽빛에 어울리는 별일까?"
    >
      <span className="guildtest-banner-glow" aria-hidden />
      <span className="guildtest-banner-moon" aria-hidden>
        🌙
      </span>
      <span className="guildtest-banner-text">
        <span className="guildtest-banner-eyebrow">SELF CHECK</span>
        <span className="guildtest-banner-title">
          나는 새벽빛에 어울리는 별일까?
        </span>
        <span className="guildtest-banner-desc">
          솔직한 마음을 들려주세요 ✨
        </span>
      </span>
      <span className="guildtest-banner-cta">
        마음 들여다보기 →
      </span>
      <span className="guildtest-banner-sparkles" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={`guildtest-sparkle guildtest-sparkle-${i}`}
          />
        ))}
      </span>
    </Link>
  );
}
