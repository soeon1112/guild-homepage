"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { formatSmart } from "@/src/lib/formatSmart";

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
        <span className="feed-nick">{it.nickname}</span>
        <span>님{rest}</span>
      </>
    );
  }
  return <span>{it.message}</span>;
}

export default function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, "activity"),
      orderBy("createdAt", "desc"),
      limit(20),
    );
    const unsub = onSnapshot(q, (snap) => {
      setItems(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ActivityItem[],
      );
    });
    return () => unsub();
  }, []);

  return (
    <section className="feed">
      <h2 className="feed-title">최신 현황</h2>
      {items.length === 0 ? (
        <p className="feed-empty">아직 활동이 없습니다.</p>
      ) : (
        <ul className="feed-list">
          {items.map((it) => (
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
      )}
    </section>
  );
}
