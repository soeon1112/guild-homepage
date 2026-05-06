"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  addDoc,
  collection,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { useAuth } from "../../components/AuthProvider";
import { db } from "@/src/lib/firebase";
import {
  canSeeProposals,
  PROPOSAL_CATEGORIES,
  type ProposalCategory,
} from "@/src/lib/proposals";

// 제안 시스템 Phase 1 — 작성 페이지 (홈피).
// 권한 게이트는 목록 페이지와 동일. URL 직접 입력으로만 접근.
//
// 날짜/시간 입력은 schedule 페이지와 동일하게 일반 input(type=date / time)
// 으로 받는다. 브라우저 native 픽커가 켜지므로 별도 라이브러리 불필요.

export default function ProposalsNewPage() {
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
        <h1 className="board-title">제안하기</h1>
        <div className="proposals-locked-card">
          <p className="proposals-locked-text">준비 중입니다.</p>
        </div>
      </div>
    );
  }

  return <FormView authorNick={nickname!} />;
}

function FormView({ authorNick }: { authorNick: string }) {
  const router = useRouter();

  const [category, setCategory] = useState<ProposalCategory | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [maxText, setMaxText] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [showAnonymousWarning, setShowAnonymousWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const toggleAnonymous = () => {
    if (!isAnonymous) {
      // 켜는 순간 안내 모달. 모달의 확인 버튼이 setIsAnonymous(true)를
      // 확정하고, X / 백드롭 닫기는 isAnonymous를 false 상태 유지.
      setShowAnonymousWarning(true);
    } else {
      setIsAnonymous(false);
    }
  };

  const confirmAnonymous = () => {
    setIsAnonymous(true);
    setShowAnonymousWarning(false);
  };
  const dismissAnonymous = () => {
    setShowAnonymousWarning(false);
  };

  const handleSubmit = async () => {
    if (!category) {
      alert("카테고리를 선택해주세요.");
      return;
    }
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      alert("제안 제목/내용을 입력해주세요.");
      return;
    }
    const scheduled = parseDateTime(date.trim(), time.trim());
    if (!scheduled) {
      alert("날짜는 YYYY-MM-DD, 시간은 HH:mm 형식으로 입력해주세요.");
      return;
    }
    const max = Number(maxText);
    if (!Number.isFinite(max) || max < 2 || !Number.isInteger(max)) {
      alert("모집 인원은 2 이상의 정수여야 합니다.");
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, "proposals"), {
        title: cleanTitle,
        category,
        scheduledAt: Timestamp.fromDate(scheduled),
        maxParticipants: max,
        proposer: authorNick,
        isAnonymous,
        participants: [],
        status: "recruiting",
        promotedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      router.replace("/proposals");
    } catch (e) {
      console.error(e);
      alert("등록에 실패했습니다.");
      setSubmitting(false);
    }
  };

  return (
    <div className="board-content">
      <h1 className="board-title">제안하기</h1>

      <div className="proposals-form-card">
        <div className="proposals-field">
          <span className="proposals-field-label">카테고리</span>
          <div className="proposals-chip-row">
            {PROPOSAL_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={
                  category === c
                    ? "proposals-chip proposals-chip-selected"
                    : "proposals-chip"
                }
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="proposals-field">
          <span className="proposals-field-label">제안 제목/내용</span>
          <textarea
            className="board-input board-textarea"
            placeholder="어떤 제안인지 자유롭게 적어주세요"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            rows={5}
          />
        </div>

        <div className="proposals-row">
          <div className="proposals-field">
            <span className="proposals-field-label">날짜</span>
            <input
              type="date"
              className="board-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="proposals-field">
            <span className="proposals-field-label">시간</span>
            <input
              type="time"
              className="board-input"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>

        <div className="proposals-field">
          <span className="proposals-field-label">모집 인원</span>
          <input
            type="number"
            className="board-input"
            placeholder="최소 2"
            min={2}
            step={1}
            value={maxText}
            onChange={(e) =>
              setMaxText(e.target.value.replace(/[^0-9]/g, ""))
            }
            style={{ maxWidth: "8rem" }}
          />
        </div>

        <label className="proposals-checkbox-row" onClick={(e) => {
          // span/box는 시각용 — 실제 토글은 onClick 한 번에서 처리.
          e.preventDefault();
          toggleAnonymous();
        }}>
          <span
            className="proposals-checkbox-box"
            data-checked={isAnonymous ? "true" : "false"}
          >
            {isAnonymous ? (
              <span className="proposals-checkbox-mark">✓</span>
            ) : null}
          </span>
          <span className="proposals-checkbox-label">익명 제안</span>
        </label>

        <div className="board-form-buttons">
          <button
            type="button"
            className="board-btn"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "등록 중..." : "등록"}
          </button>
          <Link href="/proposals" className="board-btn board-btn-cancel">
            취소
          </Link>
        </div>
      </div>

      {showAnonymousWarning ? (
        <AnonymousWarningModal
          onConfirm={confirmAnonymous}
          onDismiss={dismissAnonymous}
        />
      ) : null}
    </div>
  );
}

function AnonymousWarningModal({
  onConfirm,
  onDismiss,
}: {
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="proposals-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proposals-anon-title"
      onClick={onDismiss}
    >
      <div
        className="proposals-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="proposals-modal-close"
          onClick={onDismiss}
          aria-label="닫기"
        >
          ×
        </button>
        <h2 id="proposals-anon-title" className="proposals-modal-title">
          익명 제안 안내
        </h2>
        <p className="proposals-modal-body">
          익명 설정 시, 진행중으로 변경되면 닉네임이 공개됩니다.
        </p>
        <div className="proposals-modal-footer">
          <button
            type="button"
            className="proposals-modal-confirm"
            onClick={onConfirm}
            autoFocus
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

// "2026-05-10" + "15:00" → Date. 잘못된 입력은 null.
function parseDateTime(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const year = Number(dm[1]);
  const month = Number(dm[2]);
  const day = Number(dm[3]);
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day ||
    d.getHours() !== hour ||
    d.getMinutes() !== minute
  ) {
    return null;
  }
  return d;
}
