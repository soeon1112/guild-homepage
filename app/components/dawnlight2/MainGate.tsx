"use client";

import { useDawnlight2 } from "@/src/lib/featureFlags";
import { TodaySky } from "@/app/components/redesign/TodaySky";
import { GuildTestBanner } from "@/app/components/redesign/GuildTestBanner";
import { ShootingStarLetter } from "@/app/components/redesign/ShootingStarLetter";
import { NebulaWhispers } from "@/app/components/redesign/NebulaWhispers";
import { WhispersToStars } from "@/app/components/redesign/WhispersToStars";
import { StarOfDay } from "@/app/components/redesign/StarOfDay";
import { Dawnlight2MainPage } from "./MainPage";

// Client-side gate that swaps the legacy 우주 테마 main page for the new
// 하늘섬 placeholder when the current user is on the Dawnlight 2
// allow-list. Logged-out and unlisted users see the legacy page exactly
// as before — the JSX below is the verbatim copy from app/page.tsx.
//
// Step 4-G: the `.dawnlight2` wrapper + StarryBackground used to live
// here, but only mounted on `/`. Album / notice / board pages were
// missing the gradient bg as a result. ChromeShell now owns both for
// every dl2 page; this gate just renders the page content.
export function MainGate() {
  const dawnlight2 = useDawnlight2();
  if (dawnlight2) {
    return <Dawnlight2MainPage />;
  }
  return (
    <div className="main-content">
      <TodaySky />
      <GuildTestBanner />
      <ShootingStarLetter />
      <NebulaWhispers />
      <WhispersToStars />
      <StarOfDay />
    </div>
  );
}
