"use client";

import { TodaysHorizon } from "./widgets/TodaysHorizon";
import { WhispersFeed } from "./widgets/WhispersFeed";
import { NoteToTheSky } from "./widgets/NoteToTheSky";
import { PaperPlaneLetters } from "./widgets/PaperPlaneLetters";
import { TodaysVoyager } from "./widgets/TodaysVoyager";
import { CabinLogs } from "./widgets/CabinLogs";

// 하늘섬 (Dawnlight 2) main page. Widgets land here in sequence:
//   1. Today's Horizon (3-C)  — attendance parchment + sky quote
//   2. 바람결 소식 (3-E)        — paper-airplane activity feed
//   ... 별에게 한마디, 종이비행기, 오늘의 항해자, 선실의 기록 follow.
// `relative z-10` keeps the column above the StarryBackground (z-0).
export function Dawnlight2MainPage() {
  return (
    <main className="relative z-10 mx-auto w-full max-w-2xl px-0 pb-32 pt-8 sm:pt-12">
      <TodaysHorizon />
      <WhispersFeed />
      <NoteToTheSky />
      <PaperPlaneLetters />
      <TodaysVoyager />
      <CabinLogs />
    </main>
  );
}
