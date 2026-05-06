// 통합 공지/일정 페이지의 "일정 추가" 버튼 노출용 닉네임 allowlist.
// 비밀번호 게이트(dawnlight2024)는 별도 — 버튼 노출 X 사용자도 URL 직접
// 입력으로는 모달까지 도달 가능하니, 실제 작성/수정/삭제는 비밀번호로
// 한 번 더 보호한다 (이중 보호).
//
// dawnlight-app/src/lib/scheduleAdmin.ts 와 verbatim mirror — 한쪽 변경 시
// 양쪽 동일하게 갱신.

export const SCHEDULE_ADMIN_NICKNAMES: readonly string[] = [
  "언쏘",
  "테스트",
];

export function canAddSchedule(
  nickname: string | null | undefined,
): boolean {
  if (!nickname) return false;
  return SCHEDULE_ADMIN_NICKNAMES.includes(nickname);
}
