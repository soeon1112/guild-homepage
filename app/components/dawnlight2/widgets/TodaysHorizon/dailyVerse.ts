// Daily-rotating verse for the Today's Horizon widget.
//
// The legacy cosmic TodaySky.tsx ships an identical 4-line array indexed
// by `new Date().getDate() % 4` — when the redesign sweeps through the
// rest of the page we'll lift this into a shared module (or a Firestore
// `dailyVerses/{YYYY-MM-DD}` collection) and have both call sites read
// from it. For now the array is duplicated on purpose: keeping the
// dawnlight2 widget self-contained means we can tune copy without
// touching the cosmic widget that other guild members still see.
const DAILY_VERSES = [
  "밤이 깊을수록 별은 선명하다.",
  "우리는 각자의 궤도로 빛난다.",
  "오늘의 어둠도 내일의 여명이 된다.",
  "작은 빛들이 모여 길을 만든다.",
] as const;

export function getDailyVerse(now: Date = new Date()): string {
  return DAILY_VERSES[now.getDate() % DAILY_VERSES.length];
}
