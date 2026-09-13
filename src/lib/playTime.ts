// playTime.ts
// 길드원 한 줄 목록 — 플레이 시간대 상수 (Phase 1, 사용처는 Phase 2/3).
// 값은 users/{nickname}.playTime (string, 단일 선택)에 저장 예정.

export const PLAY_TIME_OPTIONS = [
  "월",
  "화",
  "수",
  "목",
  "금",
  "토",
  "일",
  "주중",
  "주말",
  "항상",
  "오전",
  "오후",
  "저녁",
  "새벽",
  "틈날 때",
] as const;

export type PlayTime = (typeof PLAY_TIME_OPTIONS)[number];
