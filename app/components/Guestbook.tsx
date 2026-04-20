"use client";

import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { addPoints } from "@/src/lib/points";
import { useAuth } from "./AuthProvider";
import NicknameLink from "./NicknameLink";
import { formatSmart } from "@/src/lib/formatSmart";

interface GuestbookEntry {
  id: string;
  nickname: string;
  message: string;
  createdAt: Timestamp | null;
}

function formatTime(timestamp: Timestamp | null): string {
  if (!timestamp) return "";
  return formatSmart(timestamp.toDate());
}

const PAGE_SIZE = 5;

export default function Guestbook() {
  const { nickname } = useAuth();
  const [message, setMessage] = useState("");
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const q = query(
      collection(db, "guestbook"),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as GuestbookEntry[];
      setEntries(data);
    });
    return () => unsubscribe();
  }, []);

  const totalPages = Math.ceil(entries.length / PAGE_SIZE);
  const pagedEntries = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSubmit = async () => {
    if (!nickname || !message.trim()) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, "guestbook"), {
        nickname,
        message: message.trim(),
        createdAt: serverTimestamp(),
      });
      setMessage("");
      await addPoints(nickname, "방명록", 2, "홈 방명록에 글 작성");
    } catch (e) {
      console.error("Failed to add guestbook entry:", e);
    }
    setSubmitting(false);
  };

  return (
    <section className="guestbook">
      <div className="guestbook-box">
        <h2 className="guestbook-title">흔적 남기기</h2>
        {nickname ? (
          <div className="guestbook-form cbar">
            <input
              className="guestbook-input guestbook-message"
              type="text"
              placeholder="한마디를 남겨주세요"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={100}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
            <button
              className="guestbook-btn cbar-submit"
              onClick={handleSubmit}
              disabled={submitting}
            >
              등록
            </button>
          </div>
        ) : (
          <p className="login-required">로그인이 필요합니다.</p>
        )}
      </div>
      <ul className="guestbook-list">
        {pagedEntries.map((entry) => (
          <li key={entry.id} className="guestbook-entry">
            <NicknameLink nickname={entry.nickname} className="guestbook-nick" />
            <span className="guestbook-msg">: {entry.message}</span>
            <span className="guestbook-time">
              {formatTime(entry.createdAt)}
            </span>
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <div className="guestbook-pagination">
          <button
            className="guestbook-page-btn"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
          >
            이전
          </button>
          <span className="guestbook-page-info">
            {page + 1} / {totalPages}
          </span>
          <button
            className="guestbook-page-btn"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
          >
            다음
          </button>
        </div>
      )}
    </section>
  );
}
