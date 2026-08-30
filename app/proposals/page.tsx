"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  type Timestamp,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "../components/AuthProvider";
import { db } from "@/src/lib/firebase";
import { useDawnlight2 } from "@/src/lib/featureFlags";
import { useBackdropClose } from "@/src/lib/useBackdropClose";
import { useUserCharacters } from "@/src/lib/useCharacters";
import {
  canCancelJoin,
  canJoin,
  canPromote,
  canSeeProposals,
  canTransitionTo,
  getParticipantCharacter,
  getPromoteCooldownRemainingMs,
  isProposer,
  normalizeCategory,
  participantCount,
  participantDisplayName,
  type ProposalCategory,
  type ProposalDoc,
  type ProposalParticipants,
  type ProposalStatus,
  STATUS_LABEL,
} from "@/src/lib/proposals";

// 제안 시스템 Phase 2 — 목록 페이지에서 모든 액션 처리.
// - 참가/취소: 누구나, status==="recruiting"일 때만
// - 제안자 전환: recruiting → in_progress|cancelled, in_progress → completed|incomplete
// - 진행 전환 시 isAnonymous는 자동 false (취소 전환은 유지)
// - 정렬: recruiting(scheduledAt asc) → in_progress(updatedAt desc) → finished(updatedAt desc)
// - 페이지네이션은 client-side slice (onSnapshot으로 전체 받아옴)

const PAGE_SIZE = 10;

type ProposalListItem = {
  id: string;
  title: string;
  // 상세 내용 — Phase 후반에 추가된 선택 필드. 옛 데이터는 빈 문자열로
  // fallback 되며 카드에서는 비어있을 때 영역 자체를 숨긴다.
  description: string;
  category: ProposalCategory;
  scheduledAt: Date | null;
  scheduledAtMs: number;
  maxParticipants: number;
  proposer: string;
  proposerCharacter: string;
  isAnonymous: boolean;
  participants: ProposalParticipants;
  status: ProposalStatus;
  updatedAtMs: number;
  // canPromote / getPromoteCooldownRemainingMs 헬퍼가 toMillis()를 호출하므로
  // Timestamp 그대로 들고 다닌다.
  promotedAt: Timestamp | null;
};

type PendingTransition = {
  id: string;
  target: ProposalStatus;
  wasAnonymous: boolean;
};

type SelectingCharacter = {
  id: string;
  current: string;
};

export default function ProposalsListPage() {
  const { nickname, ready } = useAuth();
  // dl2 reskin: wrap the root with `dawnlight2 dl2-proposals` so the
  // CSS overrides in globals.css attach. The cosmic gradient title is
  // replaced with a centered cream "제안 게시판" + lavender PROPOSALS
  // sub line — same pattern as /notice.
  const isDawnlight2 = useDawnlight2();
  const rootClass =
    "board-content" + (isDawnlight2 ? " dl2-proposals" : "");

  if (!ready) {
    return (
      <div className={rootClass}>
        <p className="board-loading">불러오는 중...</p>
      </div>
    );
  }

  if (!canSeeProposals(nickname)) {
    return (
      <div className={rootClass}>
        {isDawnlight2 ? (
          <header className="dl2-proposals-page-head">
            <h1 className="dl2-proposals-page-title">제안 게시판</h1>
            <p className="dl2-proposals-page-sub">PROPOSALS</p>
          </header>
        ) : (
          <h1 className="board-title">제안 게시판</h1>
        )}
        <div className="proposals-locked-card">
          <p className="proposals-locked-text">준비 중입니다.</p>
        </div>
      </div>
    );
  }

  return <ListView loginNick={nickname!} isDawnlight2={isDawnlight2} />;
}

function ListView({
  loginNick,
  isDawnlight2,
}: {
  loginNick: string;
  isDawnlight2: boolean;
}) {
  const [allItems, setAllItems] = useState<ProposalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pending, setPending] = useState<PendingTransition | null>(null);
  const [pendingPromote, setPendingPromote] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<SelectingCharacter | null>(null);
  // 부캐 후보 — 대표(loginNick 자체)는 characters 문서가 아니므로 목록에서
  // 제외하고, 캐릭터명이 로그인 닉네임과 같은(=대표 역할) 캐릭터도 대표
  // 옵션과 중복되지 않도록 뺀다.
  const characters = useUserCharacters(loginNick);
  const subChars = useMemo(
    () => characters.filter((c) => c.nickname !== loginNick),
    [characters, loginNick],
  );
  // 30초 단위 tick — 홍보 쿨타임 카운트다운이 자동으로 줄어든다.
  // setNow는 단순 forceUpdate 트리거 — 카드 안에서 헬퍼는 직접 Date.now()를
  // 호출하므로 prop drill 불필요.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "proposals"),
      (snap) => {
        const items: ProposalListItem[] = snap.docs.map((d) => {
          const data = d.data() as Partial<ProposalDoc>;
          const scheduled = data.scheduledAt?.toDate?.() ?? null;
          return {
            id: d.id,
            title: data.title ?? "",
            description: data.description ?? "",
            category: normalizeCategory(data.category),
            scheduledAt: scheduled,
            scheduledAtMs: scheduled?.getTime() ?? 0,
            maxParticipants: data.maxParticipants ?? 0,
            proposer: data.proposer ?? "",
            proposerCharacter: data.proposerCharacter ?? data.proposer ?? "",
            isAnonymous: !!data.isAnonymous,
            // 마이그레이션 전 옛 array 문서 방어 — 변환 전에는 빈 맵으로
            // fallback (canJoin이 count 0으로 보고 정상 동작, 참가자만 안 보임).
            participants:
              data.participants &&
              typeof data.participants === "object" &&
              !Array.isArray(data.participants)
                ? (data.participants as ProposalParticipants)
                : {},
            status: (data.status as ProposalStatus) ?? "recruiting",
            updatedAtMs: data.updatedAt?.toMillis?.() ?? 0,
            promotedAt: data.promotedAt ?? null,
          };
        });
        setAllItems(sortGrouped(items));
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageItems = useMemo(
    () => allItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [allItems, safePage],
  );

  const handleJoin = async (id: string, character: string) => {
    try {
      await updateDoc(doc(db, "proposals", id), {
        [`participants.${loginNick}`]: { character },
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      alert("참가에 실패했습니다.");
    }
  };

  const handleCancelJoin = async (id: string) => {
    try {
      await updateDoc(doc(db, "proposals", id), {
        [`participants.${loginNick}`]: deleteField(),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      alert("참가 취소에 실패했습니다.");
    }
  };

  // 부캐가 없으면 모달 없이 바로 대표로 참가. 있으면 선택 모달을 연다.
  const openJoin = (id: string) => {
    if (subChars.length === 0) {
      handleJoin(id, loginNick);
      return;
    }
    setSelecting({ id, current: loginNick });
  };

  const openChangeCharacter = (id: string, current: string) => {
    setSelecting({ id, current });
  };

  const confirmSelect = async (character: string) => {
    if (!selecting) return;
    await handleJoin(selecting.id, character);
    setSelecting(null);
  };

  const dismissSelect = () => setSelecting(null);

  const askTransition = (
    id: string,
    target: ProposalStatus,
    wasAnonymous: boolean,
  ) => {
    setPending({ id, target, wasAnonymous });
  };

  const confirmTransition = async () => {
    if (!pending) return;
    const { id, target, wasAnonymous } = pending;
    const patch: Record<string, unknown> = {
      status: target,
      updatedAt: serverTimestamp(),
    };
    // 진행으로 넘어갈 때만 익명 자동 해제. 취소는 익명 유지(사양).
    if (target === "in_progress" && wasAnonymous) {
      patch.isAnonymous = false;
    }
    try {
      await updateDoc(doc(db, "proposals", id), patch);
      setPending(null);
    } catch (e) {
      console.error(e);
      alert("상태 변경에 실패했습니다.");
    }
  };

  const dismissTransition = () => setPending(null);

  const askPromote = (id: string) => setPendingPromote(id);
  const dismissPromote = () => setPendingPromote(null);
  const confirmPromote = async () => {
    if (!pendingPromote) return;
    try {
      await updateDoc(doc(db, "proposals", pendingPromote), {
        promotedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setPendingPromote(null);
    } catch (e) {
      console.error(e);
      alert("홍보에 실패했습니다.");
    }
  };

  return (
    <div
      className={
        "board-content" + (isDawnlight2 ? " dl2-proposals" : "")
      }
    >
      {isDawnlight2 ? (
        <header className="dl2-proposals-page-head">
          <h1 className="dl2-proposals-page-title">제안 게시판</h1>
          <p className="dl2-proposals-page-sub">PROPOSALS</p>
        </header>
      ) : (
        <h1 className="board-title">제안 게시판</h1>
      )}

      <div className="board-write-btn-wrap">
        <Link href="/proposals/new" className="board-btn">
          제안하기
        </Link>
      </div>

      {loading ? (
        <p className="board-loading">불러오는 중...</p>
      ) : pageItems.length === 0 ? (
        <div className="proposals-empty-card">
          <p className="proposals-empty-text">아직 등록된 제안이 없습니다.</p>
        </div>
      ) : (
        <div className="proposals-card-grid">
          {pageItems.map((p) => (
            <ProposalCard
              key={p.id}
              item={p}
              loginNick={loginNick}
              hasSubChars={subChars.length > 0}
              onJoin={() => openJoin(p.id)}
              onCancelJoin={() => handleCancelJoin(p.id)}
              onChangeCharacter={() =>
                openChangeCharacter(
                  p.id,
                  getParticipantCharacter(p, loginNick) ?? loginNick,
                )
              }
              onTransition={(target) =>
                askTransition(p.id, target, p.isAnonymous)
              }
              onPromote={() => askPromote(p.id)}
            />
          ))}
        </div>
      )}

      <div className="board-pagination">
        <button
          className="board-page-btn"
          disabled={safePage <= 1}
          onClick={() => setCurrentPage(safePage - 1)}
        >
          이전
        </button>
        <span className="board-page-info">
          {safePage} / {totalPages}
        </span>
        <button
          className="board-page-btn"
          disabled={safePage >= totalPages}
          onClick={() => setCurrentPage(safePage + 1)}
        >
          다음
        </button>
      </div>

      {pending !== null ? (
        <ConfirmModal
          pending={pending}
          onConfirm={confirmTransition}
          onCancel={dismissTransition}
        />
      ) : null}

      {pendingPromote !== null ? (
        <PromoteConfirmModal
          onConfirm={confirmPromote}
          onCancel={dismissPromote}
        />
      ) : null}

      <CharacterSelectModal
        selecting={selecting}
        loginNick={loginNick}
        subChars={subChars}
        onConfirm={confirmSelect}
        onCancel={dismissSelect}
      />
    </div>
  );
}

function ProposalCard({
  item,
  loginNick,
  hasSubChars,
  onJoin,
  onCancelJoin,
  onChangeCharacter,
  onTransition,
  onPromote,
}: {
  item: ProposalListItem;
  loginNick: string;
  hasSubChars: boolean;
  onJoin: () => void;
  onCancelJoin: () => void;
  onChangeCharacter: () => void;
  onTransition: (target: ProposalStatus) => void;
  onPromote: () => void;
}) {
  const dateStr = formatScheduled(item.scheduledAt);
  // 익명 + 모집중일 때만 마스킹. 진행중으로 넘어가면 isAnonymous는 자동
  // false이므로 자연스럽게 닉네임 공개. 익명은 누구에게도(관리자 포함)
  // 닉네임 노출 X — 익명성 보장 우선.
  const showAnonymous = item.isAnonymous && item.status === "recruiting";
  const proposerLabel = showAnonymous
    ? "익명"
    : participantDisplayName(item.proposer, item.proposerCharacter);
  // 익명 + 모집중일 때만 참가자 리스트 안의 제안자 본인 닉네임을 "익명"으로
  // 치환. 다른 참가자는 본인 의지로 참가했으니 그대로 노출. 대표는 닉네임만,
  // 부캐는 "닉네임(캐릭터명)"으로 표시.
  const maskedParticipants = Object.entries(item.participants).map(
    ([owner, v]) =>
      showAnonymous && owner === item.proposer
        ? "익명"
        : participantDisplayName(owner, v.character),
  );
  const participantsLine =
    maskedParticipants.length > 0 ? maskedParticipants.join(", ") : "없음";

  const showJoin = canJoin(item, loginNick);
  const showCancelJoin = canCancelJoin(item, loginNick);
  const showChangeCharacter = showCancelJoin && hasSubChars;
  const showFull =
    item.status === "recruiting" &&
    !showJoin &&
    !showCancelJoin &&
    !isProposer(item, loginNick) &&
    participantCount(item) >= item.maxParticipants;

  const proposerActions: ProposalStatus[] =
    isProposer(item, loginNick) && item.status === "recruiting"
      ? ["in_progress", "cancelled"]
      : isProposer(item, loginNick) && item.status === "in_progress"
        ? ["completed", "incomplete"]
        : [];

  // 홍보 — 제안자 본인 + recruiting/in_progress일 때만 노출. 쿨타임 중에도
  // 비활성으로 노출돼서 남은 시간 표시.
  const showPromote =
    isProposer(item, loginNick) &&
    (item.status === "recruiting" || item.status === "in_progress");
  const promoteEnabled = showPromote && canPromote(item, loginNick);
  const promoteRemainingMs = showPromote
    ? getPromoteCooldownRemainingMs(item)
    : 0;

  const isCancelled = item.status === "cancelled";
  const hasActions =
    !isCancelled &&
    (showJoin ||
      showCancelJoin ||
      showChangeCharacter ||
      showFull ||
      proposerActions.length > 0 ||
      showPromote);

  return (
    <div className="proposals-card" data-status={item.status}>
      <div className="proposals-card-top-row">
        <span className="proposals-category-tag">{item.category}</span>
        <span
          className={`proposals-status-badge proposals-status-${item.status}`}
        >
          {STATUS_LABEL[item.status]}
        </span>
      </div>

      {isCancelled ? (
        <div className="proposals-cancelled-banner">
          이 제안은 취소되었습니다
        </div>
      ) : null}

      <p className="proposals-card-title">{item.title}</p>

      {/* 상세 내용 — 옛 데이터는 빈 문자열로 fallback 되어 영역이 통째로
          숨는다. CSS의 -webkit-line-clamp 로 3줄에서 잘라(... 처리) 카드
          비율 보호. 줄바꿈(\n)은 white-space: pre-line 으로 보존. */}
      {item.description ? (
        <p className="proposals-card-description">{item.description}</p>
      ) : null}

      {/* 일시 / 인원 — 가장 중요한 두 정보를 sub-card 2열로 강조 */}
      <div className="proposals-highlight-row">
        <div className="proposals-highlight-card">
          <span className="proposals-highlight-label">일시</span>
          <span className="proposals-highlight-value">{dateStr}</span>
        </div>
        <div className="proposals-highlight-card">
          <span className="proposals-highlight-label">인원</span>
          <span className="proposals-highlight-value">
            {participantCount(item)} / {item.maxParticipants}
          </span>
        </div>
      </div>

      <hr className="proposals-divider" />

      <div className="proposals-card-meta">
        <MetaRow label="제안자" value={proposerLabel} />
        <MetaRow label="참가자" value={participantsLine} multiline />
      </div>

      {hasActions ? (
        <div className="proposals-actions-row">
          {showJoin ? (
            <button className="proposals-action-primary" onClick={onJoin}>
              참가하기
            </button>
          ) : null}
          {showCancelJoin ? (
            <button className="proposals-action-default" onClick={onCancelJoin}>
              참가 취소
            </button>
          ) : null}
          {showChangeCharacter ? (
            <button className="proposals-action-default" onClick={onChangeCharacter}>
              캐릭터 변경
            </button>
          ) : null}
          {showFull ? (
            <button className="proposals-action-disabled" disabled>
              마감
            </button>
          ) : null}
          {proposerActions.map((target) => {
            const variant = proposerActionVariant(target);
            const cls =
              variant === "primary"
                ? "proposals-action-primary"
                : "proposals-action-default";
            // 가드: proposer 전환은 헬퍼로 한 번 더 체크 (UI/비즈 로직 일치)
            if (!canTransitionTo(item, loginNick, target)) return null;
            return (
              <button
                key={target}
                className={cls}
                onClick={() => onTransition(target)}
              >
                {proposerActionLabel(target)}
              </button>
            );
          })}
          {showPromote ? (
            promoteEnabled ? (
              <button className="proposals-action-primary" onClick={onPromote}>
                홍보
              </button>
            ) : (
              <button
                className="proposals-action-promote-disabled"
                disabled
              >
                홍보 ({formatPromoteRemaining(promoteRemainingMs)})
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatPromoteRemaining(ms: number): string {
  if (ms <= 0) return "";
  // Math.round — 클라이언트/서버 시계 미세 차이로 3600초가 3600.x초로
  // 잡혀서 ceil이 61분으로 만드는 문제 회피. 30초 미만 오차는 반올림으로
  // 흡수.
  const min = Math.round(ms / 60000);
  if (min < 1) return "곧 가능";
  return `${min}분 후`;
}

function PromoteConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const backdropHandlers = useBackdropClose(onCancel, !submitting);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="proposals-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proposals-promote-title"
      {...backdropHandlers}
    >
      <div
        className="proposals-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="proposals-modal-close"
          onClick={onCancel}
          aria-label="닫기"
          disabled={submitting}
        >
          ×
        </button>
        <h2 id="proposals-promote-title" className="proposals-modal-title">
          제안 홍보
        </h2>
        <p className="proposals-modal-body" style={{ whiteSpace: "pre-line" }}>
          {"이 제안을 홍보하시겠습니까?\n다음 홍보까지 1시간 대기합니다."}
        </p>
        <div className="proposals-modal-footer-two">
          <button
            type="button"
            className="proposals-modal-cancel"
            onClick={onCancel}
            disabled={submitting}
          >
            취소
          </button>
          <button
            type="button"
            className="proposals-modal-confirm"
            onClick={handleConfirm}
            autoFocus
            disabled={submitting}
          >
            {submitting ? "처리 중..." : "확인"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 참가 캐릭터 선택 — 대표(loginNick) + 부캐 라디오. selecting이 null이면
// 렌더 자체를 안 해서(다른 모달과 동일 패턴) 백드롭이 안 뜬다.
function CharacterSelectModal({
  selecting,
  loginNick,
  subChars,
  onConfirm,
  onCancel,
}: {
  selecting: SelectingCharacter | null;
  loginNick: string;
  subChars: ReturnType<typeof useUserCharacters>;
  onConfirm: (character: string) => void;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState(selecting?.current ?? loginNick);
  const [submitting, setSubmitting] = useState(false);
  const backdropHandlers = useBackdropClose(onCancel, !submitting);

  // selecting이 바뀔 때(다른 제안 클릭 / 재오픈)마다 현재 참가 캐릭터로
  // 라디오 초기값을 다시 맞춘다.
  useEffect(() => {
    if (selecting) {
      setChoice(selecting.current);
      setSubmitting(false);
    }
  }, [selecting]);

  if (!selecting) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(choice);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="proposals-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proposals-character-title"
      {...backdropHandlers}
    >
      <div
        className="proposals-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="proposals-modal-close"
          onClick={onCancel}
          aria-label="닫기"
          disabled={submitting}
        >
          ×
        </button>
        <h2 id="proposals-character-title" className="proposals-modal-title">
          참가 캐릭터 선택
        </h2>
        <div className="proposals-character-options">
          <label className="proposals-character-option">
            <input
              type="radio"
              name="proposal-character"
              checked={choice === loginNick}
              onChange={() => setChoice(loginNick)}
            />
            <span>{loginNick} (대표)</span>
          </label>
          {subChars.map((c) => (
            <label key={c.id} className="proposals-character-option">
              <input
                type="radio"
                name="proposal-character"
                checked={choice === c.nickname}
                onChange={() => setChoice(c.nickname)}
              />
              <span>
                {c.nickname}
                {c.job ? ` (${c.job})` : ""}
              </span>
            </label>
          ))}
        </div>
        <div className="proposals-modal-footer-two">
          <button
            type="button"
            className="proposals-modal-cancel"
            onClick={onCancel}
            disabled={submitting}
          >
            취소
          </button>
          <button
            type="button"
            className="proposals-modal-confirm"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "처리 중..." : "이 캐릭터로 참가"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MetaRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="proposals-meta-row">
      <span className="proposals-meta-label">{label}</span>
      <span
        className={
          multiline
            ? "proposals-meta-value proposals-meta-value-multi"
            : "proposals-meta-value"
        }
      >
        {value}
      </span>
    </div>
  );
}

function ConfirmModal({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingTransition;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const copy = transitionCopy(pending.target, pending.wasAnonymous);
  const backdropHandlers = useBackdropClose(onCancel, !submitting);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="proposals-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proposals-confirm-title"
      {...backdropHandlers}
    >
      <div
        className="proposals-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="proposals-modal-close"
          onClick={onCancel}
          aria-label="닫기"
          disabled={submitting}
        >
          ×
        </button>
        <h2 id="proposals-confirm-title" className="proposals-modal-title">
          {copy.title}
        </h2>
        <p className="proposals-modal-body" style={{ whiteSpace: "pre-line" }}>
          {copy.message}
        </p>
        <div className="proposals-modal-footer-two">
          <button
            type="button"
            className="proposals-modal-cancel"
            onClick={onCancel}
            disabled={submitting}
          >
            취소
          </button>
          <button
            type="button"
            className="proposals-modal-confirm"
            onClick={handleConfirm}
            autoFocus
            disabled={submitting}
          >
            {submitting ? "처리 중..." : "확인"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sort / labels / copy ─────────────────────────────────────

function sortGrouped(items: ProposalListItem[]): ProposalListItem[] {
  // 4개 그룹으로 분리 — recruiting(맨 위) → in_progress → completed/
  // incomplete(같이) → cancelled(맨 뒤). 같은 상태 안에서는 updatedAt
  // 최신 먼저. recruiting도 임박순 → 최신순으로 정책 변경(2단계 보정).
  const byUpdatedDesc = (a: ProposalListItem, b: ProposalListItem) =>
    b.updatedAtMs - a.updatedAtMs;
  const recruiting = items
    .filter((i) => i.status === "recruiting")
    .sort(byUpdatedDesc);
  const inProgress = items
    .filter((i) => i.status === "in_progress")
    .sort(byUpdatedDesc);
  const completedOrIncomplete = items
    .filter((i) => i.status === "completed" || i.status === "incomplete")
    .sort(byUpdatedDesc);
  const cancelled = items
    .filter((i) => i.status === "cancelled")
    .sort(byUpdatedDesc);
  return [...recruiting, ...inProgress, ...completedOrIncomplete, ...cancelled];
}

function proposerActionLabel(target: ProposalStatus): string {
  switch (target) {
    case "in_progress":
      return "진행";
    case "completed":
      return "완료";
    case "incomplete":
      return "미완료";
    case "cancelled":
      return "취소";
    default:
      return "";
  }
}

function proposerActionVariant(
  target: ProposalStatus,
): "primary" | "default" {
  if (target === "in_progress" || target === "completed") return "primary";
  return "default";
}

function transitionCopy(
  target: ProposalStatus,
  wasAnonymous: boolean,
): { title: string; message: string } {
  switch (target) {
    case "in_progress": {
      let message = "이 제안을 진행으로 변경하시겠습니까? 되돌릴 수 없습니다.";
      if (wasAnonymous) {
        message += "\n익명 설정도 해제되어 닉네임이 공개됩니다.";
      }
      return { title: "진행 변경 확인", message };
    }
    case "completed":
      return {
        title: "완료 처리 확인",
        message: "이 제안을 완료 처리하시겠습니까? 되돌릴 수 없습니다.",
      };
    case "incomplete":
      return {
        title: "미완료 처리 확인",
        message: "이 제안을 미완료 처리하시겠습니까? 되돌릴 수 없습니다.",
      };
    case "cancelled":
      return {
        title: "취소 확인",
        message: "이 제안을 취소하시겠습니까? 되돌릴 수 없습니다.",
      };
    default:
      return { title: "", message: "" };
  }
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function formatScheduled(d: Date | null): string {
  if (!d) return "-";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const w = WEEKDAY_KO[d.getDay()];
  return `${m}-${day} (${w}) ${h}:${min}`;
}
