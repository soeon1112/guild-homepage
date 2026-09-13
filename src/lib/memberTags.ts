// memberTags.ts
// 길드원 한 줄 목록 — 취향 태그 상수 + 색상 순환 (Phase 1, 사용처는 Phase 2/3).
// 태그 값은 users/{nickname}.tags (string[])에 저장 예정.

export const MEMBER_TAGS = [
  "악기 연주",
  "수다",
  "지옥 도전",
  "종합 게임",
  "사이드게임",
  "솔플",
  "파티",
  "꾸미기",
  "불멍",
  "시어터",
] as const;

export type MemberTag = (typeof MEMBER_TAGS)[number];

// dl2 톤 순환 — mistLavender → peach → sunsetGold 반복.
// dl2Colors(src/components/dawnlight2/theme.ts)의 mistLavender/cloudPink/
// sunsetGold와 동일 값.
const TAG_COLORS = [
  { bg: "#c8b8e8", ink: "#5c3a1f" }, // mistLavender
  { bg: "#ffd4b8", ink: "#5c3a1f" }, // peach (dl2Colors.cloudPink)
  { bg: "#ffc785", ink: "#5c3a1f" }, // sunsetGold
] as const;

export function getTagColor(tagIndex: number) {
  return TAG_COLORS[tagIndex % TAG_COLORS.length];
}
