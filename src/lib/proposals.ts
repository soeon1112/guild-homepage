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

// ── Participation / transition helpers ───────────────────────
// 헬퍼는 ProposalDoc + UI 리스트 아이템(둘 다 같은 4개 필드를 갖는다)
// 어느 쪽으로 호출해도 동작하도록 minimal shape만 받는다.
export type ProposalLike = {
  proposer: string;
  participants?: readonly string[];
  maxParticipants: number;
  status: ProposalStatus;
};

export function isProposer(
  p: ProposalLike,
  nickname: string | null | undefined,
): boolean {
  if (!nickname) return false;
  return p.proposer === nickname;
}

export function isParticipant(
  p: ProposalLike,
  nickname: string | null | undefined,
): boolean {
  if (!nickname) return false;
  return Array.isArray(p.participants) && p.participants.includes(nickname);
}

export function canJoin(
  p: ProposalLike,
  nickname: string | null | undefined,
): boolean {
  if (!nickname) return false;
  if (p.status !== "recruiting") return false;
  // 제안자는 작성 시점에 자동 참가자로 들어가므로 "참가하기" 자체가 노출되면
  // 안 됨. isParticipant 체크가 정상 동작하면 같은 결과지만, 프록시/캐시 등
  // 어떤 사유로 participants가 비어 있을 때도 항상 false가 되도록 명시 추가.
  if (isProposer(p, nickname)) return false;
  if (isParticipant(p, nickname)) return false;
  const count = p.participants?.length ?? 0;
  if (count >= p.maxParticipants) return false;
  return true;
}

// 참가 취소: 모집중 + 본인이 참가자 리스트에 있고 + 본인이 제안자가 아닐 때만.
// 제안자는 자동으로 participants에 들어가 있지만, "참가 취소"로 빠지는 게
// 아니라 "취소" 액션으로 제안 자체를 닫아야 한다.
export function canCancelJoin(
  p: ProposalLike,
  nickname: string | null | undefined,
): boolean {
  if (!nickname) return false;
  if (p.status !== "recruiting") return false;
  if (isProposer(p, nickname)) return false;
  return isParticipant(p, nickname);
}

// 제안자 전용 상태 전환. terminal(completed/incomplete/cancelled)에서는
// 어떤 전환도 불가.
export function canTransitionTo(
  p: ProposalLike,
  nickname: string | null | undefined,
  target: ProposalStatus,
): boolean {
  if (!isProposer(p, nickname)) return false;
  if (p.status === "recruiting") {
    return target === "in_progress" || target === "cancelled";
  }
  if (p.status === "in_progress") {
    return target === "completed" || target === "incomplete";
  }
  return false;
}
