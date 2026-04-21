"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { formatSmart } from "@/src/lib/formatSmart";
import TitlePrefix from "./TitlePrefix";

type ActivityItem = {
  id: string;
  type: string;
  nickname: string;
  message: string;
  link?: string;
  createdAt: Timestamp | null;
};

function formatTime(ts: Timestamp | null): string {
  if (!ts) return "";
  return formatSmart(ts.toDate());
}

function renderMessage(it: ActivityItem) {
  const prefix = `${it.nickname}님`;
  if (it.nickname && it.message.startsWith(prefix)) {
    const rest = it.message.slice(prefix.length);
    return (
      <>
        <TitlePrefix nickname={it.nickname} />
        <span className="feed-nick">{it.nickname}</span>
        <span>님{rest}</span>
      </>
    );
  }
  return <span>{it.message}</span>;
}

const PAGE_SIZE = 20;

export default function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const q = query(
      collection(db, "activity"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setItems(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ActivityItem[],
      );
    });
    return () => unsub();
  }, []);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages - 1) setPage(totalPages - 1);
  }, [page, totalPages]);
  const pagedItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <section className="feed">
      <h2 className="feed-title">최신 현황</h2>
      {items.length === 0 ? (
        <p className="feed-empty">아직 활동이 없습니다.</p>
      ) : (
        <>
          <ul className="feed-list">
            {pagedItems.map((it) => (
              <li key={it.id} className="feed-item">
                {it.link ? (
                  <Link href={it.link} className="feed-link">
                    <span className="feed-text">{renderMessage(it)}</span>
                    <span className="feed-time">{formatTime(it.createdAt)}</span>
                  </Link>
                ) : (
                  <>
                    <span className="feed-text">{renderMessage(it)}</span>
                    <span className="feed-time">{formatTime(it.createdAt)}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
          {totalPages > 1 && (
            <div className="feed-pagination">
              <button
                className="feed-page-btn"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
              >
                이전
              </button>
              <span className="feed-page-info">
                {page + 1} / {totalPages}
              </span>
              <button
                className="feed-page-btn"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages - 1}
              >
                다음
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
