// noticePermissions.ts
// 공지 작성/수정/삭제 권한 헬퍼.
//
// 정책 (Phase 3b, 2026-05-18 확정 / manage 확장 2026-08-24):
//   - 작성 (write):
//     * union 카테고리 → 언쏘 (운영진)만
//     * 길드 카테고리 → 해당 길드의 길마/부길마
//   - 수정/삭제 (manage):
//     * 언쏘 → 전 카테고리 (기존 canManageNotice, 순서 변경 권한도 계속 이걸 사용)
//     * 길마 → 자기 길드 카테고리만 (canManageNoticeByCategory, 신규)
//
// 일정 (schedule) 비번 게이트는 별도 — 이 헬퍼 영향 X.

import type { Guild } from "@/src/lib/useGuilds";

const MANAGER_NICK = "언쏘";

export function canWriteCategory(
  loginNick: string | null | undefined,
  categoryId: string,
  guilds: Guild[],
): boolean {
  if (!loginNick) return false;
  if (categoryId === "union") return loginNick === MANAGER_NICK;
  const guild = guilds.find((g) => g.id === categoryId);
  if (!guild) return false;
  if (guild.isUnion) return loginNick === MANAGER_NICK;
  if (guild.leader === loginNick) return true;
  if ((guild.viceLeaders ?? []).includes(loginNick)) return true;
  return false;
}

export function writableCategories(
  loginNick: string | null | undefined,
  guilds: Guild[],
): Guild[] {
  return guilds.filter((g) => canWriteCategory(loginNick, g.id, guilds));
}

export function canManageNotice(
  loginNick: string | null | undefined,
): boolean {
  return loginNick === MANAGER_NICK;
}

// 공지 개별 수정/삭제 — 언쏘(전체) 또는 해당 카테고리 길드의 길마.
// categoryId는 notice.category 필드 그대로 (guild.id 와 동일 값 — union 포함).
export function canManageNoticeByCategory(
  loginNick: string | null | undefined,
  categoryId: string | null | undefined,
  guilds: Guild[],
): boolean {
  if (!loginNick) return false;
  if (loginNick === MANAGER_NICK) return true;
  if (!categoryId) return false;
  const guild = guilds.find((g) => g.id === categoryId);
  if (!guild || guild.isUnion) return false;
  return guild.leader === loginNick;
}
