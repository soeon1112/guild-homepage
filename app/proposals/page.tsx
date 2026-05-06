"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  collection,
  type DocumentData,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  startAfter,
} from "firebase/firestore";
import { useAuth } from "../components/AuthProvider";
import { db } from "@/src/lib/firebase";
import {
  canSeeProposals,
  normalizeCategory,
  type ProposalCategory,
  type ProposalDoc,
  type ProposalStatus,
  STATUS_LABEL,
} from "@/src/lib/proposals";

// 제안 시스템 Phase 1 — 목록 페이지 (홈피).
// 권한: nickname === "언쏘"만 진입 (canSeeProposals).
// URL 직접 입력으로만 접근 (메뉴 미노출).
// 정렬: Phase 1은 "recruiting"만 존재하므로 scheduledAt 임박순 단일 정렬.
// 페이지네이션: notice/board 패턴 (PAGE_SIZE 10, startAfter 커서).

const PAGE_SIZE = 10;

type ProposalListItem = {
  id: string;
  title: string;
  category: ProposalCategory;
  scheduledAt: Date | null;
  maxParticipants: number;
  proposer: string;
  isAnonymous: boolean;
  participantsCount: number;
  status: ProposalStatus;
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

  return <ListView />;
}

function ListView() {
  const [items, setItems] = useState<ProposalListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSnapshots, setPageSnapshots] = useState<
    (QueryDocumentSnapshot<DocumentData> | null)[]
  >([null]);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const countSnap = await getCountFromServer(
          collection(db, "proposals"),
        );
        if (cancelled) return;
        setTotalCount(countSnap.data().count);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const col = collection(db, "proposals");
        const cursor = pageSnapshots[currentPage - 1];
        const q = cursor
          ? query(
              col,
              orderBy("scheduledAt", "asc"),
              startAfter(cursor),
              limit(PAGE_SIZE),
            )
          : query(col, orderBy("scheduledAt", "asc"), limit(PAGE_SIZE));
        const snap = await getDocs(q);
        if (cancelled) return;
        setItems(
          snap.docs.map((d) => {
            const data = d.data() as Partial<ProposalDoc>;
            return {
              id: d.id,
              title: data.title ?? "",
              category: normalizeCategory(data.category),
              scheduledAt: data.scheduledAt?.toDate?.() ?? null,
              maxParticipants: data.maxParticipants ?? 0,
              proposer: data.proposer ?? "",
              isAnonymous: !!data.isAnonymous,
              participantsCount: Array.isArray(data.participants)
                ? data.participants.length
                : 0,
              status: (data.status as ProposalStatus) ?? "recruiting",
            };
          }),
        );
        if (snap.docs.length > 0) {
          setPageSnapshots((prev) => {
            const next = [...prev];
            next[currentPage] = snap.docs[snap.docs.length - 1];
            return next;
          });
        }
      } catch (e) {
        console.error(e);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

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
      ) : items.length === 0 ? (
        <div className="proposals-empty-card">
          <p className="proposals-empty-text">아직 등록된 제안이 없습니다.</p>
        </div>
      ) : (
        <div className="proposals-card-grid">
          {items.map((p) => (
            <ProposalCard key={p.id} item={p} />
          ))}
        </div>
      )}

      <div className="board-pagination">
        <button
          className="board-page-btn"
          disabled={currentPage <= 1}
          onClick={() => setCurrentPage((p) => p - 1)}
        >
          이전
        </button>
        <span className="board-page-info">
          {currentPage} / {totalPages}
        </span>
        <button
          className="board-page-btn"
          disabled={currentPage >= totalPages}
          onClick={() => setCurrentPage((p) => p + 1)}
        >
          다음
        </button>
      </div>
    </div>
  );
}

function ProposalCard({ item }: { item: ProposalListItem }) {
  const dateStr = formatScheduled(item.scheduledAt);
  const proposerLabel = item.isAnonymous ? "익명" : item.proposer;
  return (
    <div className="proposals-card">
      <div className="proposals-card-top-row">
        <span className="proposals-category-tag">[{item.category}]</span>
        <span
          className={`proposals-status-badge proposals-status-${item.status}`}
        >
          {STATUS_LABEL[item.status]}
        </span>
      </div>
      <p className="proposals-card-title">{item.title}</p>
      <div className="proposals-card-meta">
        <MetaRow label="일시" value={dateStr} />
        <MetaRow
          label="인원"
          value={`${item.participantsCount} / ${item.maxParticipants}`}
        />
        <MetaRow label="제안자" value={proposerLabel} />
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="proposals-meta-row">
      <span className="proposals-meta-label">{label}</span>
      <span className="proposals-meta-value">{value}</span>
    </div>
  );
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
