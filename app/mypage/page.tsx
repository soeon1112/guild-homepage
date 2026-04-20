"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BackLink from "@/app/components/BackLink";
import { useAuth } from "@/app/components/AuthProvider";
import { db } from "@/src/lib/firebase";
import { formatSmart } from "@/src/lib/formatSmart";
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  increment,
  setDoc,
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

const EXCHANGE_COST = 150;

export default function MyPage() {
  const { nickname, ready } = useAuth();
  const [points, setPoints] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  const handleExchange = useCallback(async () => {
    if (!nickname) return;
    if (points < EXCHANGE_COST) return;
    if (!confirm(`${EXCHANGE_COST}점을 차감하여 환전을 신청하시겠습니까?`)) {
      return;
    }
    setRequesting(true);
    setMessage(null);
    try {
      await addDoc(collection(db, "exchangeRequests"), {
        nickname,
        points: EXCHANGE_COST,
        status: "대기중",
        createdAt: serverTimestamp(),
      });
      await setDoc(
        doc(db, "users", nickname),
        { points: increment(-EXCHANGE_COST) },
        { merge: true },
      );
      await addDoc(collection(db, "users", nickname, "pointHistory"), {
        type: "환전",
        points: -EXCHANGE_COST,
        description: "캐시 환전 신청",
        createdAt: serverTimestamp(),
      });
      setMessage(
        "환전 신청이 완료되었습니다. 길드마스터가 확인 후 캐시를 선물해드립니다.",
      );
    } catch (e) {
      console.error(e);
      setMessage("환전 신청에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
    setRequesting(false);
  }, [nickname, points]);

  if (!ready) {
    return (
      <div className="mypage-content">
        <p className="mypage-hint">불러오는 중...</p>
      </div>
    );
  }

  if (!nickname) {
    return (
      <div className="mypage-content">
        <BackLink href="/" className="back-link">← 홈으로</BackLink>
        <p className="login-required">로그인이 필요합니다.</p>
      </div>
    );
  }

  const canExchange = points >= EXCHANGE_COST;

  return (
    <div className="mypage-content">
      <BackLink href="/" className="back-link">← 홈으로</BackLink>

      <section className="mypage-card">
        <h1 className="mypage-nick">{nickname}</h1>
        <div className="mypage-points-wrap">
          <span className="mypage-points-label">총 포인트</span>
          <span className="mypage-points">{points.toLocaleString()}</span>
          <span className="mypage-points-unit">점</span>
        </div>

        <div className="mypage-exchange">
          <button
            type="button"
            className="minihome-btn mypage-exchange-btn"
            onClick={handleExchange}
            disabled={!canExchange || requesting}
          >
            {requesting ? "신청 중..." : "캐시 환전 신청"}
          </button>
          {!canExchange && (
            <p className="mypage-exchange-hint">
              {EXCHANGE_COST}점 이상 필요합니다. (현재 {points}점)
            </p>
          )}
          {message && <p className="mypage-exchange-msg">{message}</p>}
        </div>
      </section>

      <section className="mypage-card">
        <h2 className="mypage-section-title">포인트 내역</h2>
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
                    {h.points > 0 ? `+${h.points}` : h.points}점
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mypage-footer-actions">
        <Link href="/" className="minihome-btn">홈으로</Link>
      </div>
    </div>
  );
}
