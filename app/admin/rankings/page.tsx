"use client";

// /admin/rankings — 관리자 페이지: 지난 주 별빛 랭킹 1~10위.
// 접근: 언쏘(MANAGER_NICK, noticePermissions.canManageNotice)만. 그 외는 "/"로 리다이렉트.
// 데이터: weeklyRankingsReset(functions/src/scheduled/weeklyReset.ts)가
// 매주 일요일 00:00 KST에 weekly_rankings 에 최신 1건만 남긴다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/app/components/BackLink";
import { useAuth } from "@/app/components/AuthProvider";
import { canManageNotice } from "@/src/lib/noticePermissions";
import { db } from "@/src/lib/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";

type TopEntry = { nickname: string; points: number; rank: number };

type WeeklyRanking = {
  period: string;
  startDate: Timestamp | null;
  endDate: Timestamp | null;
  top10: TopEntry[];
  resetAt: Timestamp | null;
};

function formatDateTime(ts: Timestamp | null): string {
  if (!ts) return "-";
  const d = ts.toDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

export default function AdminRankingsPage() {
  const router = useRouter();
  const { nickname, ready } = useAuth();

  const [ranking, setRanking] = useState<WeeklyRanking | null>(null);
  const [loaded, setLoaded] = useState(false);

  const allowed = canManageNotice(nickname);

  useEffect(() => {
    if (!ready) return;
    if (!allowed) {
      router.replace("/");
    }
  }, [ready, allowed, router]);

  useEffect(() => {
    if (!ready || !allowed) return;
    const q = query(
      collection(db, "weekly_rankings"),
      orderBy("startDate", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const first = snap.docs[0];
      if (!first) {
        setRanking(null);
      } else {
        const data = first.data();
        setRanking({
          period: typeof data.period === "string" ? data.period : "",
          startDate: (data.startDate as Timestamp | undefined) ?? null,
          endDate: (data.endDate as Timestamp | undefined) ?? null,
          top10: Array.isArray(data.top10) ? (data.top10 as TopEntry[]) : [],
          resetAt: (data.resetAt as Timestamp | undefined) ?? null,
        });
      }
      setLoaded(true);
    });
    return () => unsub();
  }, [ready, allowed]);

  if (!ready || !allowed) {
    return null;
  }

  return (
    <div className="admin-exchange">
      <BackLink href="/" className="back-link">
        ← 홈으로
      </BackLink>
      <h1 className="admin-exchange-title">별빛 랭킹 (지난 주)</h1>

      {!loaded ? (
        <p className="admin-exchange-empty">불러오는 중...</p>
      ) : !ranking ? (
        <p className="admin-exchange-empty">
          아직 집계된 주간 랭킹이 없습니다. 첫 리셋(일요일 00:00 KST) 이후부터
          표시됩니다.
        </p>
      ) : (
        <>
          <p className="admin-users-count">
            기간: {ranking.period} · 리셋: {formatDateTime(ranking.resetAt)}
          </p>
          {ranking.top10.length === 0 ? (
            <p className="admin-exchange-empty">지난 주 별빛 활동이 없습니다.</p>
          ) : (
            <div className="admin-exchange-table-wrap">
              <table className="admin-exchange-table">
                <thead>
                  <tr>
                    <th>순위</th>
                    <th>닉네임</th>
                    <th>별빛</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.top10.map((row) => (
                    <tr key={row.rank}>
                      <td>{row.rank}</td>
                      <td>{row.nickname}</td>
                      <td>{row.points} 별빛</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
