"use client";

import { TodaysHorizon } from "./widgets/TodaysHorizon";

// 하늘섬 (Dawnlight 2) main page. Step 3-C wires the first real widget
// — Today's Horizon (parchment + ink-stamp attendance). The rest of
// the column (바람결 소식, 별에게 한마디, 종이비행기, 오늘의 항해자,
// 선실의 기록) lands in follow-up steps; the `relative z-10` keeps
// everything floating above the StarryBackground (z-0) layer.
export function Dawnlight2MainPage() {
  return (
    <main className="relative z-10 mx-auto w-full max-w-2xl px-0 pb-32 pt-8 sm:pt-12">
      <TodaysHorizon />
    </main>
  );
}
