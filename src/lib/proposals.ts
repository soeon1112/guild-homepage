// 제안 시스템 — Phase 1은 페이지 골격 + Firestore 스키마 + 작성/조회까지.
// 참가/취소/상태 전환/푸시/홍보는 다음 단계.
//
// Mirrored verbatim in dawnlight-app/src/lib/proposals.ts (keep in sync;
// see memory/feedback_auto_dual_deploy.md).

import type { Timestamp } from "firebase/firestore";

// ── Visibility gate ──────────────────────────────────────────
// Phase 1 한정 allowlist — "언쏘" + "테스트". 추후 전체 공개 시
// `null`로 바꾸면 모든 로그인 멤버가 볼 수 있게 게이트가 통과한다
// (canSeePets / canSeeGuildTest 와 동일 톤이지만 다중 닉네임이라
// 배열로 둠).
export const PROPOSALS_ADMIN_NICKNAMES: readonly string[] | null = [
  "언쏘",
  "테스트",
];

export function canSeeProposals(
  nickname: string | null | undefined,
): boolean {
  if (!nickname) return false;
  if (PROPOSALS_ADMIN_NICKNAMES === null) return true;
  return PROPOSALS_ADMIN_NICKNAMES.includes(nickname);
}

// ── Status ───────────────────────────────────────────────────
// Phase 1은 "recruiting"만 사용. 나머지는 다음 단계에서 작성.
export type ProposalStatus =
  | "recruiting"
  | "in_progress"
  | "completed"
  | "incomplete"
  | "cancelled";

export const STATUS_LABEL: Record<ProposalStatus, string> = {
  recruiting: "모집중",
  in_progress: "진행중",
  completed: "완료",
  incomplete: "불발",
  cancelled: "취소",
};

// ── Category ─────────────────────────────────────────────────
// 7개 고정 카테고리. 작성 시 필수, 목록에서는 카드 좌상단 [태그]로
// 표시. 기존 데이터(category 없는 문서)는 "기타"로 fallback.
export const PROPOSAL_CATEGORIES = [
  "어비스",
  "레이드",
  "시어터",
  "늑대게임",
  "친목",
  "타게임",
  "기타",
] as const;

export type ProposalCategory = (typeof PROPOSAL_CATEGORIES)[number];

export function normalizeCategory(value: unknown): ProposalCategory {
  if (typeof value === "string" && (PROPOSAL_CATEGORIES as readonly string[]).includes(value)) {
    return value as ProposalCategory;
  }
  return "기타";
}

// ── Firestore doc shape ──────────────────────────────────────
// 컬렉션: proposals
export type ProposalDoc = {
  title: string;
  category: ProposalCategory;
  scheduledAt: Timestamp;
  maxParticipants: number;
  proposer: string;
  isAnonymous: boolean;
  participants: string[];
  status: ProposalStatus;
  promotedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
