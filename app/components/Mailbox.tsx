"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "./AuthProvider";
import { formatSmart } from "@/src/lib/formatSmart";

type LetterDoc = {
  id: string;
  from: string;
  to: string;
  content: string;
  status: string;
  createdAt: Timestamp | null;
  deliveredAt: Timestamp | null;
  read: boolean;
};

export default function Mailbox() {
  const { nickname } = useAuth();
  const [composeOpen, setComposeOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inbox, setInbox] = useState<LetterDoc[]>([]);
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!nickname) return;
    const q = query(
      collection(db, "letters"),
      where("to", "==", nickname),
      where("status", "==", "approved"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: LetterDoc[] = snap.docs.map((d) => {
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
      list.sort((a, b) => {
        const at = a.deliveredAt?.toMillis?.() ?? 0;
        const bt = b.deliveredAt?.toMillis?.() ?? 0;
        return bt - at;
      });
      setInbox(list);
    });
    return () => unsub();
  }, [nickname]);

  const hasUnread = useMemo(
    () => !!nickname && inbox.some((l) => !l.read),
    [nickname, inbox],
  );

  const handleMailboxClick = () => {
    if (!nickname) {
      setAuthMsg("로그인이 필요합니다");
      setTimeout(() => setAuthMsg(null), 2400);
      return;
    }
    setComposeOpen(true);
  };

  const handlePlaneClick = () => {
    if (!nickname) {
      setAuthMsg("로그인이 필요합니다");
      setTimeout(() => setAuthMsg(null), 2400);
      return;
    }
    setInboxOpen(true);
  };

  return (
    <section className="mailbox-card">
      <button
        type="button"
        className="mailbox-side mailbox-side-left"
        onClick={handleMailboxClick}
        aria-label="편지 쓰기"
      >
        <img
          src="/images/postbox.png"
          alt="우체통"
          className="mailbox-icon-img"
        />
      </button>

      <img
        src="/images/wind-trail.png"
        alt=""
        aria-hidden="true"
        className="mailbox-wind"
      />

      <button
        type="button"
        className={
          "mailbox-side mailbox-side-right" +
          (hasUnread ? " mailbox-side-unread" : "")
        }
        onClick={handlePlaneClick}
        aria-label="받은 편지함"
      >
        <img
          src="/images/paper-plane.png"
          alt="종이비행기"
          className="mailbox-icon-img"
        />
        {hasUnread && <span className="mailbox-n-badge">N</span>}
      </button>

      {authMsg && <span className="mailbox-auth-msg">{authMsg}</span>}

      {composeOpen && nickname && (
        <ComposeModal
          nickname={nickname}
          onClose={() => setComposeOpen(false)}
        />
      )}

      {inboxOpen && nickname && (
        <InboxModal
          letters={inbox}
          onClose={() => setInboxOpen(false)}
        />
      )}
    </section>
  );
}

function ComposeModal({
  nickname,
  onClose,
}: {
  nickname: string;
  onClose: () => void;
}) {
  const [users, setUsers] = useState<string[]>([]);
  const [to, setTo] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        const nicks = snap.docs
          .map((d) => (d.data().nickname as string | undefined) ?? d.id)
          .filter((n) => !!n && n !== nickname)
          .sort((a, b) => a.localeCompare(b, "ko"));
        setUsers(nicks);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [nickname]);

  const handleSend = async () => {
    if (!to || !content.trim()) {
      alert("받는 사람과 내용을 입력해주세요.");
      return;
    }
    setSending(true);
    try {
      await addDoc(collection(db, "letters"), {
        from: nickname,
        to,
        content: content.trim(),
        status: "pending",
        read: false,
        createdAt: serverTimestamp(),
        deliveredAt: null,
      });
      setDoneMsg("편지가 우체통에 넣어졌습니다. 곧 전달될 거예요!");
      setContent("");
      setTo("");
      setTimeout(() => {
        setDoneMsg(null);
        onClose();
      }, 1800);
    } catch (e) {
      console.error(e);
      alert("전송에 실패했습니다.");
    }
    setSending(false);
  };

  return (
    <div className="letter-modal-backdrop" onClick={onClose}>
      <div
        className="letter-modal letter-paper"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="letter-modal-header">
          <h3 className="letter-modal-title">편지 쓰기</h3>
          <button
            type="button"
            className="letter-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className="letter-modal-body">
          <label className="letter-label">
            받는 사람
            <select
              className="letter-input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={sending || !!doneMsg}
            >
              <option value="">선택</option>
              {users.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="letter-label">
            편지 내용
            <textarea
              className="letter-input letter-textarea"
              rows={6}
              placeholder="익명으로 전달돼요"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={sending || !!doneMsg}
            />
          </label>
          {doneMsg && <p className="letter-done-msg">{doneMsg}</p>}
          <div className="letter-actions">
            <button
              type="button"
              className="letter-send-btn"
              onClick={handleSend}
              disabled={sending || !!doneMsg}
            >
              {sending ? "보내는 중..." : "보내기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InboxModal({
  letters,
  onClose,
}: {
  letters: LetterDoc[];
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [marking, setMarking] = useState(false);

  const safeIdx = Math.max(0, Math.min(idx, letters.length - 1));

  if (letters.length === 0) {
    return (
      <div className="letter-modal-backdrop" onClick={onClose}>
        <div
          className="letter-modal letter-paper"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="letter-modal-header">
            <h3 className="letter-modal-title">받은 편지</h3>
            <button
              type="button"
              className="letter-modal-close"
              onClick={onClose}
              aria-label="닫기"
            >
              ×
            </button>
          </div>
          <div className="letter-modal-body">
            <p className="letter-empty">아직 도착한 편지가 없어요.</p>
          </div>
        </div>
      </div>
    );
  }

  const current = letters[safeIdx];
  const stamp =
    current.deliveredAt?.toDate?.() ?? current.createdAt?.toDate?.() ?? null;

  const handleRead = async () => {
    if (current.read || marking) return;
    setMarking(true);
    try {
      await updateDoc(doc(db, "letters", current.id), { read: true });
    } catch (e) {
      console.error(e);
    }
    setMarking(false);
  };

  return (
    <div className="letter-modal-backdrop" onClick={onClose}>
      <div
        className="letter-modal letter-paper"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="letter-modal-header">
          <h3 className="letter-modal-title">익명의 누군가로부터</h3>
          <button
            type="button"
            className="letter-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className="letter-modal-body">
          <div className="letter-meta">
            {stamp && <span>{formatSmart(stamp)}</span>}
            <span className="letter-meta-index">
              {safeIdx + 1} / {letters.length}
              {!current.read && <span className="letter-unread-dot" aria-hidden="true" />}
            </span>
          </div>
          <div className="letter-content">{current.content}</div>
          <div className="letter-actions letter-actions-split">
            <button
              type="button"
              className="letter-nav-btn"
              disabled={safeIdx <= 0}
              onClick={() => setIdx(Math.max(0, safeIdx - 1))}
            >
              이전
            </button>
            <button
              type="button"
              className="letter-send-btn"
              onClick={handleRead}
              disabled={current.read || marking}
            >
              {current.read ? "읽음" : marking ? "처리 중..." : "읽었습니다"}
            </button>
            <button
              type="button"
              className="letter-nav-btn"
              disabled={safeIdx >= letters.length - 1}
              onClick={() => setIdx(Math.min(letters.length - 1, safeIdx + 1))}
            >
              다음
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
