"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "../components/AuthProvider";
import { db } from "@/src/lib/firebase";
import {
  canCancelJoin,
  canJoin,
  canSeeProposals,
  canTransitionTo,
  isProposer,
  normalizeCategory,
  type ProposalCategory,
  type ProposalDoc,
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
  category: ProposalCategory;
  scheduledAt: Date | null;
  scheduledAtMs: number;
  maxParticipants: number;
  proposer: string;
  isAnonymous: boolean;
  participants: string[];
  status: ProposalStatus;
  updatedAtMs: number;
};

type PendingTransition = {
  id: string;
  target: ProposalStatus;
  wasAnonymous: boolean;
};

export default function ProposalsListPage() {
  const { nickname, ready } = useAuth();

  if (!ready) {
    return (
      <div className="board-content">
        <p className="board-loading">불러오는 중...</p>
      </div>
    );
  }

  if (!canSeeProposals(nickname)) {
    return (
      <div className="board-content">
        <h1 className="board-title">제안 게시판</h1>
        <div className="proposals-locked-card">
          <p className="proposals-locked-text">준비 중입니다.</p>
        </div>
      </div>
    );
  }

  return <ListView loginNick={nickname!} />;
}

function ListView({ loginNick }: { loginNick: string }) {
  const [allItems, setAllItems] = useState<ProposalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pending, setPending] = useState<PendingTransition | null>(null);

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
            category: normalizeCategory(data.category),
            scheduledAt: scheduled,
            scheduledAtMs: scheduled?.getTime() ?? 0,
            maxParticipants: data.maxParticipants ?? 0,
            proposer: data.proposer ?? "",
            isAnonymous: !!data.isAnonymous,
            participants: Array.isArray(data.participants)
              ? (data.participants as string[])
              : [],
            status: (data.status as ProposalStatus) ?? "recruiting",
            updatedAtMs: data.updatedAt?.toMillis?.() ?? 0,
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

  const handleJoin = async (id: string) => {
    try {
      await updateDoc(doc(db, "proposals", id), {
        participants: arrayUnion(loginNick),
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
        participants: arrayRemove(loginNick),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      alert("참가 취소에 실패했습니다.");
    }
  };

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

  return (
    <div className="board-content">
      <h1 className="board-title">제안 게시판</h1>

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
              onJoin={() => handleJoin(p.id)}
              onCancelJoin={() => handleCancelJoin(p.id)}
              onTransition={(target) =>
                askTransition(p.id, target, p.isAnonymous)
              }
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
    </div>
  );
}

function ProposalCard({
  item,
  loginNick,
  onJoin,
  onCancelJoin,
  onTransition,
}: {
  item: ProposalListItem;
  loginNick: string;
  onJoin: () => void;
  onCancelJoin: () => void;
  onTransition: (target: ProposalStatus) => void;
}) {
  const dateStr = formatScheduled(item.scheduledAt);
  const proposerLabel =
    item.isAnonymous && item.status === "recruiting" ? "익명" : item.proposer;
  const participantsLine =
    item.participants.length > 0 ? item.participants.join(", ") : "없음";

  const showJoin = canJoin(item, loginNick);
  const showCancelJoin = canCancelJoin(item, loginNick);
  const showFull =
    item.status === "recruiting" &&
    !showJoin &&
    !showCancelJoin &&
    !isProposer(item, loginNick) &&
    item.participants.length >= item.maxParticipants;

  const proposerActions: ProposalStatus[] =
    isProposer(item, loginNick) && item.status === "recruiting"
      ? ["in_progress", "cancelled"]
      : isProposer(item, loginNick) && item.status === "in_progress"
        ? ["completed", "incomplete"]
        : [];

  const isCancelled = item.status === "cancelled";
  const hasActions =
    !isCancelled && (showJoin || showCancelJoin || showFull || proposerActions.length > 0);

  return (
    <div className="proposals-card">
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

      <div className="proposals-card-meta">
        <MetaRow label="일시" value={dateStr} />
        <MetaRow
          label="인원"
          value={`${item.participants.length} / ${item.maxParticipants}`}
        />
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
        </div>
      ) : null}
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
      onClick={onCancel}
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
  const recruiting = items
    .filter((i) => i.status === "recruiting")
    .sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);
  const inProgress = items
    .filter((i) => i.status === "in_progress")
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  const finished = items
    .filter(
      (i) =>
        i.status === "completed" ||
        i.status === "incomplete" ||
        i.status === "cancelled",
    )
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  return [...recruiting, ...inProgress, ...finished];
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
