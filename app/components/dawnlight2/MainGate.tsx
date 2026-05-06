"use client";

import { useDawnlight2 } from "@/src/lib/featureFlags";
import { TodaySky } from "@/app/components/redesign/TodaySky";
import { GuildTestBanner } from "@/app/components/redesign/GuildTestBanner";
import { ShootingStarLetter } from "@/app/components/redesign/ShootingStarLetter";
import { NebulaWhispers } from "@/app/components/redesign/NebulaWhispers";
import { WhispersToStars } from "@/app/components/redesign/WhispersToStars";
import { StarOfDay } from "@/app/components/redesign/StarOfDay";
import { Dawnlight2MainPage } from "./MainPage";
import { StarryBackground } from "./StarryBackground";

// Client-side gate that swaps the legacy 우주 테마 main page for the new
// 하늘섬 placeholder when the current user is on the Dawnlight 2
// allow-list. Logged-out and unlisted users see the legacy page exactly
// as before — the JSX below is the verbatim copy from app/page.tsx.
export function MainGate() {
  const dawnlight2 = useDawnlight2();
  if (dawnlight2) {
    // The `dawnlight2` class is what activates the new palette, sky
    // gradient, and Noto Sans/Serif KR font stack — see globals.css.
    // Wrapping the placeholder (rather than putting the class on
    // <body>) keeps the rest of the page's chrome unaffected; switch
    // routes and you're back on the cosmic theme without a flash.
    // Layering inside .dawnlight2:
    //   ::before  z-index: -1  → fixed twilight sky gradient
    //   <StarryBackground />  z-index:  0  → fixed twinkle layer
    //   <Dawnlight2MainPage /> z-index: 10 → page content (sets its own
    //     `relative z-10` so it floats above the stars)
    // Sticky chrome (TopHeader/BottomNav, z: 30+) lives outside this
    // wrapper and stacks above everything regardless.
    return (
      <div className="dawnlight2">
        <StarryBackground />
        <Dawnlight2MainPage />
      </div>
    );
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
