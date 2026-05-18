"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import { db } from "@/src/lib/firebase";
import { useDawnlight2 } from "@/src/lib/featureFlags";
import { formatSmart } from "@/src/lib/formatSmart";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";

type HistoryEntry = {
  id: string;
  type: string;
  points: number;
  description: string;
  createdAt: Timestamp | null;
};

function formatDate(ts: Timestamp | null): string {
  if (!ts) return "";
  return formatSmart(ts.toDate());
}

export default function MyPage() {
  const { nickname, ready, changePassword } = useAuth();
  const isDawnlight2 = useDawnlight2();
  const [points, setPoints] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [pwOpen, setPwOpen] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);

  const wrapperClass = isDawnlight2
    ? "mypage-content dl2-mypage"
    : "mypage-content";

  useEffect(() => {
    if (!nickname) return;
    const unsub = onSnapshot(doc(db, "users", nickname), (snap) => {
      const d = snap.data();
      setPoints(typeof d?.points === "number" ? d.points : 0);
    });
    return () => unsub();
  }, [nickname]);

  useEffect(() => {
    if (!nickname) return;
    const q = query(
      collection(db, "users", nickname, "pointHistory"),
      orderBy("createdAt", "desc"),
      limit(20),
    );
    const unsub = onSnapshot(q, (snap) => {
      setHistory(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as HistoryEntry[],
      );
    });
    return () => unsub();
  }, [nickname]);

  const handleChangePassword = async () => {
    setPwError("");
    if (!curPw.trim() || !newPw.trim() || !confirmPw.trim()) {
      setPwError("모든 칸을 입력해주세요.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    setPwSubmitting(true);
    const r = await changePassword(curPw, newPw);
    setPwSubmitting(false);
    if (!r.ok) {
      setPwError(r.error ?? "비밀번호 변경에 실패했습니다.");
      return;
    }
    setCurPw("");
    setNewPw("");
    setConfirmPw("");
    setPwOpen(false);
    alert("비밀번호가 변경되었습니다.");
  };

  if (!ready) {
    return (
      <div className={wrapperClass}>
        <p className="mypage-hint">불러오는 중...</p>
      </div>
    );
  }

  if (!nickname) {
    return (
      <div className={wrapperClass}>
        <p className="login-required">로그인이 필요합니다.</p>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      {isDawnlight2 && (
        <header className="dl2-mypage-head">
          <h1 className="dl2-mypage-title">마이페이지</h1>
          <p className="dl2-mypage-sub">MY PAGE</p>
        </header>
      )}

      {/* Card 1: nickname + password change + nickname hint */}
      <section className="mypage-card">
        <h1 className="mypage-nick">{nickname}</h1>

        <button
          type="button"
          className="mypage-password-toggle"
          onClick={() => {
            setPwOpen((v) => !v);
            setPwError("");
          }}
        >
          비밀번호 변경 {pwOpen ? "▲" : "▼"}
        </button>

        {pwOpen && (
          <div className="mypage-password-form">
            <input
              type="password"
              className="mypage-password-input"
              placeholder="현재 비밀번호"
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
              autoComplete="current-password"
            />
            <input
              type="password"
              className="mypage-password-input"
              placeholder="새 비밀번호"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
            />
            <input
              type="password"
              className="mypage-password-input"
              placeholder="새 비밀번호 확인"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              autoComplete="new-password"
            />
            {pwError && <p className="mypage-password-error">{pwError}</p>}
            <button
              type="button"
              className="mypage-password-submit"
              onClick={handleChangePassword}
              disabled={pwSubmitting}
            >
              {pwSubmitting ? "변경 중..." : "변경하기"}
            </button>
          </div>
        )}

        <p className="mypage-nickname-hint">
          닉네임 변경은 관리자(언쏘)에게 요청해주세요
        </p>
      </section>

      {/* Card 2: notification settings — 앱만 (홈피는 푸시 미지원, 섹션 자체 없음) */}

      {/* Card 3: total points + history (merged) */}
      <section className="mypage-card">
        <div className="mypage-points-wrap">
          <span className="mypage-points-label">총 별빛</span>
          <span className="mypage-points">{points.toLocaleString()}</span>
          <span className="mypage-points-unit">별빛</span>
        </div>

        <div className="mypage-divider" />

        <h2 className="mypage-section-title">별빛 내역</h2>
        {history.length === 0 ? (
          <p className="mypage-hint">아직 내역이 없습니다.</p>
        ) : (
          <ul className="mypage-history">
            {history.map((h) => (
              <li key={h.id} className="mypage-history-item">
                <div className="mypage-history-main">
                  <span className="mypage-history-type">{h.type}</span>
                  <span className="mypage-history-desc">{h.description}</span>
                </div>
                <div className="mypage-history-meta">
                  <span className="mypage-history-date">
                    {formatDate(h.createdAt)}
                  </span>
                  <span
                    className={
                      h.points >= 0
                        ? "mypage-history-points mypage-history-points-plus"
                        : "mypage-history-points mypage-history-points-minus"
                    }
                  >
                    {h.points > 0 ? `+${h.points}` : h.points} 별빛
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!isDawnlight2 && (
        <div className="mypage-footer-actions">
          <Link href="/" className="minihome-btn">홈으로</Link>
        </div>
      )}
    </div>
  );
}
