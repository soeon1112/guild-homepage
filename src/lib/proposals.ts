// 제안 시스템 — Phase 1은 페이지 골격 + Firestore 스키마 + 작성/조회까지.
// 참가/취소/상태 전환/푸시/홍보는 다음 단계.
//
// Mirrored verbatim in dawnlight-app/src/lib/proposals.ts (keep in sync;
// see memory/feedback_auto_dual_deploy.md).

import type { Timestamp } from "firebase/firestore";

// ── Visibility gate ──────────────────────────────────────────
// Phase 2-B (메뉴 정식 추가) 시점에 전체 공개로 풀림 — null = 모든
// 로그인 멤버 진입 가능. 다시 allowlist 로 막으려면 배열로 되돌리면 됨
// (canSeePets / canSeeGuildTest 와 동일 escape hatch 패턴).
export const PROPOSALS_ADMIN_NICKNAMES: readonly string[] | null = null;

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
  // 상세 내용 — 선택 입력. 작성 폼이 둘로 분리(제목 한 줄 + 내용 멀티라인)
  // 되기 전 데이터에는 이 필드가 없을 수 있어 reader 쪽에서는 항상
  // (data.description ?? "") 형태로 fallback 한다. 푸시/최신현황 트리거는
  // title 만 사용하고 description 은 알림에 절대 들어가지 않는다.
  description: string;
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
// 헬퍼는 ProposalDoc + UI 리스트 아이템(둘 다 같은 필드를 갖는다)
// 어느 쪽으로 호출해도 동작하도록 minimal shape만 받는다.
export type ProposalLike = {
  proposer: string;
  participants?: readonly string[];
  maxParticipants: number;
  status: ProposalStatus;
  promotedAt?: Timestamp | null;
};

// 홍보 1시간 쿨타임 (Phase 3-B). 클라이언트는 이 값 기준으로 버튼
// enable/disable + 카운트다운만 표시하고, 실제 푸시·최신현황은
// onProposalPromoted 트리거(Phase 3-A)가 promotedAt 단조 증가 감지로
// 처리한다.
export const PROMOTE_COOLDOWN_MS = 60 * 60 * 1000;

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

// 홍보(promote) 가능 여부 — 제안자 본인 + recruiting/in_progress + 마지막
// 홍보로부터 PROMOTE_COOLDOWN_MS 경과. terminal 상태는 막힘.
export function canPromote(
  p: ProposalLike,
  nickname: string | null | undefined,
): boolean {
  if (!nickname) return false;
  if (!isProposer(p, nickname)) return false;
  if (p.status !== "recruiting" && p.status !== "in_progress") return false;
  const last = p.promotedAt?.toMillis?.() ?? 0;
  return Date.now() - last >= PROMOTE_COOLDOWN_MS;
}

// 남은 쿨타임(ms). 0이면 즉시 가능.
export function getPromoteCooldownRemainingMs(p: ProposalLike): number {
  const last = p.promotedAt?.toMillis?.() ?? 0;
  return Math.max(0, PROMOTE_COOLDOWN_MS - (Date.now() - last));
}
