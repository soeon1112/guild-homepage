"use client";

import { useEffect, useState } from "react";
import BackLink from "@/app/components/BackLink";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import { handleEvent } from "@/src/lib/badgeCheck";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

const ADMIN_PASSWORD = "dawnlight2024";

type ExchangeRequest = {
  id: string;
  nickname: string;
  points: number;
  status: string;
  createdAt: Timestamp | null;
  processedAt?: Timestamp | null;
};

function formatDate(ts: Timestamp | null | undefined): string {
  if (!ts) return "-";
  const d = ts.toDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${h}:${min}`;
}

export default function AdminExchangePage() {
  const { nickname } = useAuth();
  const [pw, setPw] = useState("");
  const [verified, setVerified] = useState(false);
  const [err, setErr] = useState("");
  const [requests, setRequests] = useState<ExchangeRequest[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (!nickname) return;
    handleEvent({ type: "adminVisit", nickname });
  }, [nickname]);

  useEffect(() => {
    if (!verified) return;
    const q = query(
      collection(db, "exchangeRequests"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setRequests(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ExchangeRequest[],
      );
    });
    return () => unsub();
  }, [verified]);

  const handleVerify = () => {
    if (pw !== ADMIN_PASSWORD) {
      setErr("관리자 비밀번호가 일치하지 않습니다.");
      return;
    }
    setErr("");
    setVerified(true);
  };

  const handleComplete = async (id: string) => {
    setProcessingId(id);
    try {
      await updateDoc(doc(db, "exchangeRequests", id), {
        status: "완료",
        processedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      alert("처리 실패");
    }
    setProcessingId(null);
  };

  if (!verified) {
    return (
      <div className="admin-exchange">
        <BackLink href="/" className="back-link">← 홈으로</BackLink>
        <h1 className="admin-exchange-title">환전 관리</h1>
        <div className="admin-exchange-gate">
          <input
            type="password"
            className="loginbar-input"
            placeholder="관리자 비밀번호"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleVerify();
            }}
            autoFocus
          />
          <button className="minihome-btn" onClick={handleVerify}>
            확인
          </button>
          {err && <p className="loginbar-error">{err}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-exchange">
      <BackLink href="/" className="back-link">← 홈으로</BackLink>
      <h1 className="admin-exchange-title">환전 신청 관리</h1>

      {requests.length === 0 ? (
        <p className="admin-exchange-empty">환전 신청이 없습니다.</p>
      ) : (
        <div className="admin-exchange-table-wrap">
          <table className="admin-exchange-table">
            <thead>
              <tr>
                <th>닉네임</th>
                <th>포인트</th>
                <th>신청일</th>
                <th>상태</th>
                <th>처리</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.nickname}</td>
                  <td>{r.points}점</td>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>
                    <span
                      className={
                        r.status === "완료"
                          ? "admin-exchange-status-done"
                          : "admin-exchange-status-pending"
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {r.status === "완료" ? (
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>
                        {formatDate(r.processedAt)}
                      </span>
                    ) : (
                      <button
                        className="minihome-btn minihome-btn-small"
                        onClick={() => handleComplete(r.id)}
                        disabled={processingId === r.id}
                      >
                        {processingId === r.id ? "처리 중..." : "처리 완료"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
