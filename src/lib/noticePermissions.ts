// noticePermissions.ts
// 공지 작성/수정/삭제 권한 헬퍼.
//
// 정책 (Phase 3b, 2026-05-18 확정):
//   - 작성 (write):
//     * union 카테고리 → 언쏘 (운영진)만
//     * 길드 카테고리 → 해당 길드의 길마/부길마
//   - 수정/삭제 (manage) → 언쏘만 (전 카테고리 통합 관리)
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
