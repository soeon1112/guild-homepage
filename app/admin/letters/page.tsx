"use client";

import { useEffect, useMemo, useState } from "react";
import BackLink from "@/app/components/BackLink";
import { db } from "@/src/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  Timestamp,
} from "firebase/firestore";
import { formatSmart } from "@/src/lib/formatSmart";

const ADMIN_PASSWORD = "dawnlight2024";

type LetterRow = {
  id: string;
  from: string;
  to: string;
  content: string;
  status: string;
  createdAt: Timestamp | null;
  deliveredAt: Timestamp | null;
  read: boolean;
};

function tsMillis(t: Timestamp | null) {
  return t?.toMillis?.() ?? 0;
}

function dateInputToMillis(value: string, endOfDay: boolean) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d.getTime();
}

export default function AdminLettersPage() {
  const [pw, setPw] = useState("");
  const [verified, setVerified] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [fromQ, setFromQ] = useState("");
  const [toQ, setToQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (!verified) return;
    const q = query(collection(db, "letters"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: LetterRow[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            from: data.from ?? "",
            to: data.to ?? "",
            content: data.content ?? "",
            status: data.status ?? "",
            createdAt: (data.createdAt as Timestamp | null) ?? null,
            deliveredAt: (data.deliveredAt as Timestamp | null) ?? null,
            read: !!data.read,
          };
        });
        list.sort(
          (a, b) =>
            (tsMillis(b.deliveredAt) || tsMillis(b.createdAt)) -
            (tsMillis(a.deliveredAt) || tsMillis(a.createdAt)),
        );
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

  const filtered = useMemo(() => {
    const fromNeedle = fromQ.trim().toLowerCase();
    const toNeedle = toQ.trim().toLowerCase();
    const minMs = dateInputToMillis(dateFrom, false);
    const maxMs = dateInputToMillis(dateTo, true);
    return letters.filter((l) => {
      if (fromNeedle && !l.from.toLowerCase().includes(fromNeedle)) return false;
      if (toNeedle && !l.to.toLowerCase().includes(toNeedle)) return false;
      const stamp = tsMillis(l.deliveredAt) || tsMillis(l.createdAt);
      if (minMs !== null && stamp < minMs) return false;
      if (maxMs !== null && stamp > maxMs) return false;
      return true;
    });
  }, [letters, fromQ, toQ, dateFrom, dateTo]);

  const handleVerify = () => {
    if (pw !== ADMIN_PASSWORD) {
      setPwErr("관리자 비밀번호가 일치하지 않습니다.");
      return;
    }
    setPwErr("");
    setVerified(true);
  };

  const handleDelete = async (l: LetterRow) => {
    if (
      !confirm(
        `이 편지를 영구 삭제할까요?\n보낸이: ${l.from}\n받는이: ${l.to}\n\n수신자 편지함에서도 사라집니다.`,
      )
    )
      return;
    setDeletingId(l.id);
    try {
      await deleteDoc(doc(db, "letters", l.id));
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
    }
    setDeletingId(null);
  };

  const resetFilters = () => {
    setFromQ("");
    setToQ("");
    setDateFrom("");
    setDateTo("");
  };

  if (!verified) {
    return (
      <div className="admin-exchange">
        <BackLink href="/" className="back-link">
          ← 홈으로
        </BackLink>
        <h1 className="admin-exchange-title">편지 모니터링</h1>
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
          {pwErr && <p className="loginbar-error">{pwErr}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-exchange">
      <BackLink href="/" className="back-link">
        ← 홈으로
      </BackLink>
      <h1 className="admin-exchange-title">편지 모니터링</h1>
      <p className="admin-letters-hint">
        모든 편지는 발송 즉시 수신자에게 전달돼요. 부적절한 편지가 보이면 삭제할
        수 있어요.
      </p>

      <div className="admin-letters-toolbar">
        <input
          className="loginbar-input"
          placeholder="보낸이 닉네임"
          value={fromQ}
          onChange={(e) => setFromQ(e.target.value)}
        />
        <input
          className="loginbar-input"
          placeholder="받는이 닉네임"
          value={toQ}
          onChange={(e) => setToQ(e.target.value)}
        />
        <input
          type="date"
          className="loginbar-input"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="시작일"
        />
        <span className="admin-letters-toolbar-sep">~</span>
        <input
          type="date"
          className="loginbar-input"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="종료일"
        />
        <button
          type="button"
          className="minihome-btn minihome-btn-small"
          onClick={resetFilters}
        >
          초기화
        </button>
      </div>

      <p className="admin-letters-count">
        총 {letters.length}건 / 표시 {filtered.length}건
      </p>

      {loadErr && <p className="loginbar-error">{loadErr}</p>}

      {filtered.length === 0 ? (
        <p className="admin-exchange-empty">
          {letters.length === 0
            ? "아직 편지가 없습니다."
            : "조건에 맞는 편지가 없습니다."}
        </p>
      ) : (
        <div className="admin-exchange-table-wrap">
          <table className="admin-letters-table">
            <thead>
              <tr>
                <th>보낸이</th>
                <th>받는이</th>
                <th>내용</th>
                <th>전달 시각</th>
                <th>읽음</th>
                <th>삭제</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const stampTs = l.deliveredAt ?? l.createdAt;
                return (
                  <tr key={l.id}>
                    <td>{l.from}</td>
                    <td>{l.to}</td>
                    <td className="admin-letters-content">{l.content}</td>
                    <td>{stampTs ? formatSmart(stampTs.toDate()) : "-"}</td>
                    <td>{l.read ? "읽음" : "미확인"}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-letters-reject"
                        onClick={() => handleDelete(l)}
                        disabled={deletingId === l.id}
                      >
                        {deletingId === l.id ? "..." : "삭제"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
