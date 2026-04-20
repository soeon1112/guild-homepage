"use client";

import { useEffect, useState } from "react";
import BackLink from "@/app/components/BackLink";
import { db } from "@/src/lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { formatSmart } from "@/src/lib/formatSmart";

const ADMIN_PASSWORD = "dawnlight2024";

type PendingLetter = {
  id: string;
  from: string;
  to: string;
  content: string;
  createdAt: Timestamp | null;
};

export default function AdminLettersPage() {
  const [pw, setPw] = useState("");
  const [verified, setVerified] = useState(false);
  const [err, setErr] = useState("");
  const [letters, setLetters] = useState<PendingLetter[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    if (!verified) return;
    const q = query(
      collection(db, "letters"),
      where("status", "==", "pending"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: PendingLetter[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            from: data.from ?? "",
            to: data.to ?? "",
            content: data.content ?? "",
            createdAt: (data.createdAt as Timestamp | null) ?? null,
          };
        });
        list.sort((a, b) => {
          const at = a.createdAt?.toMillis?.() ?? 0;
          const bt = b.createdAt?.toMillis?.() ?? 0;
          return at - bt;
        });
        setLetters(list);
        setLoadErr(null);
      },
      (e) => {
        console.error("letters snapshot error", e);
        setLoadErr("편지를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      },
    );
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

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await updateDoc(doc(db, "letters", id), {
        status: "approved",
        deliveredAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      alert("처리 실패");
    }
    setProcessingId(null);
  };

  const handleReject = async (id: string) => {
    if (!confirm("이 편지를 거절할까요?")) return;
    setProcessingId(id);
    try {
      await updateDoc(doc(db, "letters", id), { status: "rejected" });
    } catch (e) {
      console.error(e);
      alert("처리 실패");
    }
    setProcessingId(null);
  };

  if (!verified) {
    return (
      <div className="admin-exchange">
        <BackLink href="/" className="back-link">
          ← 홈으로
        </BackLink>
        <h1 className="admin-exchange-title">편지 관리</h1>
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
      <BackLink href="/" className="back-link">
        ← 홈으로
      </BackLink>
      <h1 className="admin-exchange-title">대기 편지 관리</h1>

      {loadErr && <p className="loginbar-error">{loadErr}</p>}

      {letters.length === 0 ? (
        <p className="admin-exchange-empty">대기 중인 편지가 없습니다.</p>
      ) : (
        <div className="admin-exchange-table-wrap">
          <table className="admin-letters-table">
            <thead>
              <tr>
                <th>보낸 사람</th>
                <th>받는 사람</th>
                <th>내용</th>
                <th>작성일</th>
                <th>처리</th>
              </tr>
            </thead>
            <tbody>
              {letters.map((l) => (
                <tr key={l.id}>
                  <td>{l.from}</td>
                  <td>{l.to}</td>
                  <td className="admin-letters-content">{l.content}</td>
                  <td>{l.createdAt ? formatSmart(l.createdAt.toDate()) : "-"}</td>
                  <td>
                    <div className="admin-letters-actions">
                      <button
                        type="button"
                        className="minihome-btn minihome-btn-small"
                        onClick={() => handleApprove(l.id)}
                        disabled={processingId === l.id}
                      >
                        {processingId === l.id ? "..." : "승인"}
                      </button>
                      <button
                        type="button"
                        className="admin-letters-reject"
                        onClick={() => handleReject(l.id)}
                        disabled={processingId === l.id}
                      >
                        거절
                      </button>
                    </div>
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
