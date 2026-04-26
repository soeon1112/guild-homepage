"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Inbox, Mail, Sparkles, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { useAuth } from "@/app/components/AuthProvider";
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

export function ShootingStarLetter() {
  const { nickname } = useAuth();
  const [composeOpen, setComposeOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inbox, setInbox] = useState<LetterDoc[]>([]);
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  // Subscribe to user's approved inbox. Stays active even when Compose is open,
  // so unread count updates in real-time regardless of modal state.
  useEffect(() => {
    if (!nickname) {
      setInbox([]);
      return;
    }
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

  const unreadCount = useMemo(
    () => (nickname ? inbox.filter((l) => !l.read).length : 0),
    [nickname, inbox],
  );

  const requireLogin = () => {
    setAuthMsg("로그인이 필요합니다");
    setTimeout(() => setAuthMsg(null), 2400);
  };

  const handleCompose = () => {
    if (!nickname) return requireLogin();
    setComposeOpen(true);
  };

  const handleInbox = () => {
    if (!nickname) return requireLogin();
    setInboxOpen(true);
  };

  return (
    <section className="relative px-4 pb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-serif text-[11px] tracking-[0.4em] text-text-sub uppercase">
          Letters &amp; Whispers
        </span>
        <span className="font-serif text-[10px] text-text-sub">익명의 마음</span>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-nebula-pink/25 bg-abyss-deep/50 backdrop-blur-sm">
        {/* Comet tail decoration */}
        <svg
          className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 opacity-60"
          viewBox="0 0 120 120"
          aria-hidden
        >
          <defs>
            <linearGradient
              id="cometTailLong"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#FFE5C4" stopOpacity="0" />
              <stop offset="100%" stopColor="#FFB5A7" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          <path
            d="M 0 0 L 80 80"
            stroke="url(#cometTailLong)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="80" cy="80" r="4" fill="#FFE5C4" />
          <circle cx="80" cy="80" r="8" fill="#FFB5A7" opacity="0.3" />
        </svg>

        <div className="relative z-10 flex items-center gap-4 p-4">
          {/* Left: envelope illustration */}
          <div className="shrink-0">
            <svg width="88" height="60" viewBox="0 0 88 60" aria-hidden>
              <defs>
                <linearGradient
                  id="envBgWide"
                  x1="0%"
                  y1="0%"
                  x2="0%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#6B4BA8" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#3D2E6B" stopOpacity="0.9" />
                </linearGradient>
              </defs>
              <rect
                x="2"
                y="10"
                width="84"
                height="46"
                rx="3"
                fill="url(#envBgWide)"
                stroke="#D896C8"
                strokeOpacity="0.5"
              />
              <path
                d="M 2 12 L 44 38 L 86 12"
                fill="none"
                stroke="#D896C8"
                strokeOpacity="0.7"
                strokeWidth="1"
              />
              {/* Wax seal star */}
              <g transform="translate(44 36)">
                <circle r="10" fill="#0B0821" opacity="0.6" />
                <path
                  d="M0 -6 L1.5 -2 L6 -2 L2.5 1 L4 6 L0 3 L-4 6 L-2.5 1 L-6 -2 L-1.5 -2 Z"
                  fill="#FFE5C4"
                  style={{ filter: "drop-shadow(0 0 3px #FFE5C4)" }}
                />
              </g>
              {/* Small sparkles */}
              <circle cx="14" cy="20" r="0.8" fill="#FFE5C4" opacity="0.8" />
              <circle cx="74" cy="22" r="0.6" fill="#D896C8" opacity="0.7" />
              <circle cx="20" cy="46" r="0.5" fill="#FFE5C4" opacity="0.6" />
            </svg>
          </div>

          {/* Right: copy + actions */}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-nebula-pink" />
              <span className="font-serif text-[11px] tracking-wider text-stardust">
                별똥별 편지
              </span>
            </div>
            <h3 className="font-serif text-sm leading-snug text-text-primary text-pretty">
              익명의 마음을 밤하늘에 띄워요
            </h3>
            <p className="mt-1 font-sans text-[10px] leading-relaxed text-text-sub">
              누군가의 마음에 조용히 가닿을 편지 한 통.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleCompose}
                className="group relative flex flex-1 items-center justify-center gap-1.5 rounded-full border border-peach-accent/50 bg-peach-accent/10 px-3 py-2 text-[11px] font-serif tracking-wider text-stardust backdrop-blur-sm transition-all hover:border-peach-accent hover:bg-peach-accent/20"
              >
                <Sparkles className="h-3 w-3 shrink-0" />
                <span className="flex flex-col items-center leading-tight sm:flex-row sm:gap-1">
                  <span>마음</span>
                  <span>띄우기</span>
                </span>
              </button>
              <button
                type="button"
                onClick={handleInbox}
                className="group relative flex items-center justify-center gap-1.5 rounded-full border border-nebula-pink/30 bg-abyss/40 px-3 py-2 text-[11px] font-serif tracking-wider text-text-sub backdrop-blur-sm transition-all hover:border-nebula-pink/60 hover:text-stardust"
                aria-label={
                  unreadCount > 0
                    ? `편지함 열기, 미확인 ${unreadCount}건`
                    : "편지함 열기"
                }
              >
                <Inbox className="h-3 w-3" />
                편지함
                {unreadCount > 0 && (
                  <span
                    className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-peach-accent px-1 text-[9px] font-bold text-abyss"
                    style={{ boxShadow: "0 0 6px rgba(255,181,167,0.6)" }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Auth-needed hint (shown briefly when logged-out user clicks a button) */}
      <AnimatePresence>
        {authMsg && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="mt-2 text-center font-serif text-[11px] italic text-nebula-pink"
          >
            {authMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compose modal */}
      <AnimatePresence>
        {composeOpen && nickname && (
          <ComposeModal
            nickname={nickname}
            onClose={() => setComposeOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Inbox modal */}
      <AnimatePresence>
        {inboxOpen && nickname && (
          <InboxModal
            letters={inbox}
            onClose={() => setInboxOpen(false)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

// ─── Shared modal shell styles ───
const MODAL_BACKDROP: React.CSSProperties = {
  background: "rgba(11,8,33,0.8)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

// Inbox-specific: no dim/blur, so the main page stays visible behind the
// letter modal. Compose still uses the dimmed backdrop so the form has
// strong focus while the user is composing.
const INBOX_BACKDROP: React.CSSProperties = {
  background: "transparent",
};

const MODAL_CARD: React.CSSProperties = {
  background: "rgba(26,15,61,0.92)",
  border: "1px solid rgba(216,150,200,0.3)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(107,75,168,0.4)",
};

const MODAL_TITLE: React.CSSProperties = {
  fontFamily: "'Noto Serif KR', serif",
  fontSize: "26px",
  fontWeight: 300,
  letterSpacing: "0.06em",
  backgroundImage: "linear-gradient(135deg, #FFE5C4, #D896C8, #6B4BA8)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: "transparent",
  filter: "drop-shadow(0 0 10px rgba(216,150,200,0.45))",
};

function NebulaGlows() {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(216,150,200,0.3) 0%, transparent 65%)",
          filter: "blur(28px)",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-12 -left-12 h-48 w-48 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(107,75,168,0.35) 0%, transparent 65%)",
          filter: "blur(32px)",
        }}
      />
    </>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="닫기"
      className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-stardust transition-colors hover:bg-nebula-pink/20"
      style={{
        background: "rgba(11,8,33,0.6)",
        border: "1px solid rgba(216,150,200,0.3)",
      }}
    >
      <X className="h-4 w-4" />
    </button>
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
  const [err, setErr] = useState<string | null>(null);

  // Fetch users list for recipient dropdown (same query as legacy Mailbox)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        if (cancelled) return;
        const nicks = snap.docs
          .map((d) => (d.data().nickname as string | undefined) ?? d.id)
          .filter((n) => !!n && n !== nickname)
          .sort((a, b) => a.localeCompare(b, "ko"));
        setUsers(nicks);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nickname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleSend = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending || doneMsg) return;
    if (!to) {
      setErr("받을 사람을 선택해주세요");
      return;
    }
    if (!content.trim()) {
      setErr("편지 내용을 입력해주세요");
      return;
    }
    setErr(null);
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
      }, 2000);
    } catch (e) {
      console.error(e);
      setErr("전송에 실패했습니다");
    }
    setSending(false);
  };

  return (
    <motion.div
      className="modal-safe-frame fixed inset-0 z-[70] flex items-center justify-center"
      style={MODAL_BACKDROP}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="편지 쓰기"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl"
        style={MODAL_CARD}
        initial={{ scale: 0.95, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 20, opacity: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <NebulaGlows />
        <CloseButton onClose={onClose} />

        {/* Title */}
        <div className="relative px-6 pb-2 pt-9 text-center">
          <h2 className="leading-none" style={MODAL_TITLE}>
            별똥별 편지
          </h2>
          <p className="mt-2 font-serif text-[10px] tracking-[0.35em] text-nebula-pink/80 uppercase">
            To the Stars
          </p>
          <p className="mt-3 font-serif text-[11px] italic text-text-sub">
            익명으로 전달돼요
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSend}
          className="relative flex flex-col gap-3 px-6 pb-6 pt-3"
        >
          {/* Recipient select */}
          <label className="relative block">
            <span className="sr-only">받을 사람</span>
            <select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={sending || !!doneMsg}
              aria-label="받을 사람"
              className="w-full appearance-none rounded-full border border-nebula-pink/25 bg-abyss-deep/50 px-4 py-2.5 pr-10 font-serif text-sm text-text-primary backdrop-blur-sm transition-all focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30 disabled:opacity-60"
            >
              <option value="" className="bg-abyss-deep text-text-sub">
                받을 사람을 선택하세요
              </option>
              {users.map((u) => (
                <option
                  key={u}
                  value={u}
                  className="bg-abyss-deep text-text-primary"
                >
                  {u}
                </option>
              ))}
            </select>
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-nebula-pink"
            >
              <ChevronDown className="h-4 w-4" />
            </span>
          </label>

          {/* Content textarea */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={sending || !!doneMsg}
            placeholder="마음을 담은 한 마디를 적어주세요"
            rows={6}
            aria-label="편지 내용"
            className="nebula-scroll w-full resize-none rounded-2xl border border-nebula-pink/25 bg-abyss-deep/50 px-4 py-3 font-serif text-sm leading-relaxed text-text-primary placeholder:italic placeholder:text-text-sub/70 backdrop-blur-sm transition-all focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30 disabled:opacity-60"
          />

          {err && (
            <p
              className="text-center font-serif text-[11px] italic"
              style={{ color: "#E8A8B8" }}
            >
              {err}
            </p>
          )}

          {doneMsg && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-2"
            >
              <Sparkles
                className="h-3.5 w-3.5 text-peach-accent"
                style={{ filter: "drop-shadow(0 0 6px rgba(255,181,167,0.9))" }}
              />
              <p className="text-center font-serif text-[12px] italic text-stardust">
                {doneMsg}
              </p>
            </motion.div>
          )}

          <button
            type="submit"
            disabled={sending || !!doneMsg}
            className="mt-1 w-full rounded-full py-2.5 font-serif text-sm font-medium tracking-wider text-abyss-deep transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
              boxShadow: "0 0 14px rgba(255,181,167,0.5)",
            }}
          >
            {sending ? "보내는 중..." : doneMsg ? "전송됨" : "보내기"}
          </button>
        </form>
      </motion.div>
    </motion.div>
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const safeIdx = Math.max(0, Math.min(idx, letters.length - 1));
  const current = letters[safeIdx];

  const handleRead = async () => {
    if (!current || current.read || marking) return;
    setMarking(true);
    try {
      await updateDoc(doc(db, "letters", current.id), { read: true });
    } catch (e) {
      console.error(e);
    }
    setMarking(false);
  };

  return (
    <motion.div
      className="modal-safe-frame fixed inset-0 z-[70] flex items-center justify-center"
      style={INBOX_BACKDROP}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="받은 편지함"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl"
        style={MODAL_CARD}
        initial={{ scale: 0.95, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 20, opacity: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <NebulaGlows />
        <CloseButton onClose={onClose} />

        {/* Title */}
        <div className="relative px-6 pb-3 pt-9 text-center">
          <h2 className="leading-none" style={MODAL_TITLE}>
            도착한 마음
          </h2>
          <p className="mt-2 font-serif text-[10px] tracking-[0.35em] text-nebula-pink/80 uppercase">
            Letters from Afar
          </p>
        </div>

        {letters.length === 0 || !current ? (
          <div className="relative px-6 pb-10 pt-3 text-center">
            <span
              aria-hidden
              className="mb-3 inline-block text-3xl text-text-sub/60"
              style={{ filter: "drop-shadow(0 0 10px rgba(216,150,200,0.5))" }}
            >
              ✦
            </span>
            <p className="font-serif text-[13px] italic text-text-sub text-balance">
              아직 도착한 편지가 없어요
            </p>
          </div>
        ) : (
          <div className="relative px-6 pb-6 pt-3">
            {/* Meta row */}
            <div className="mb-2 flex items-center justify-between">
              <span className="font-serif text-[10px] italic text-text-sub">
                {current.deliveredAt
                  ? formatSmart(current.deliveredAt.toDate())
                  : current.createdAt
                    ? formatSmart(current.createdAt.toDate())
                    : ""}
              </span>
              <span className="inline-flex items-center gap-1.5 font-serif text-[10px] tracking-wider text-stardust">
                {safeIdx + 1} / {letters.length}
                {!current.read && (
                  <span
                    aria-label="미확인"
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{
                      background: "#FFB5A7",
                      boxShadow: "0 0 6px rgba(255,181,167,0.9)",
                    }}
                  />
                )}
              </span>
            </div>

            {/* Letter content */}
            <div
              className="nebula-scroll relative max-h-[45vh] overflow-y-auto rounded-xl p-5 backdrop-blur-sm"
              style={{
                background: "rgba(11,8,33,0.4)",
                border: "1px solid rgba(216,150,200,0.2)",
              }}
            >
              <p className="wrap-anywhere whitespace-pre-wrap font-serif text-[13px] leading-relaxed text-text-primary">
                {current.content}
              </p>
            </div>

            {/* Controls */}
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIdx(Math.max(0, safeIdx - 1))}
                disabled={safeIdx <= 0}
                aria-label="이전 편지"
                className="rounded-full border border-nebula-pink/30 bg-abyss-deep/50 px-3 py-1.5 font-serif text-[11px] tracking-wider text-stardust backdrop-blur-sm transition-all hover:border-nebula-pink/60 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ‹ 이전
              </button>

              <button
                type="button"
                onClick={handleRead}
                disabled={current.read || marking}
                className="rounded-full px-4 py-2 font-serif text-[11px] font-medium tracking-wider transition-all disabled:cursor-not-allowed"
                style={{
                  background: current.read
                    ? "rgba(26,15,61,0.5)"
                    : "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
                  border: current.read
                    ? "1px solid rgba(216,150,200,0.3)"
                    : "none",
                  boxShadow: current.read
                    ? "none"
                    : "0 0 12px rgba(255,181,167,0.5)",
                  color: current.read
                    ? "rgba(255,229,196,0.7)"
                    : "rgba(11,8,33,1)",
                }}
              >
                {current.read
                  ? "읽음"
                  : marking
                    ? "처리 중..."
                    : "읽었습니다"}
              </button>

              <button
                type="button"
                onClick={() =>
                  setIdx(Math.min(letters.length - 1, safeIdx + 1))
                }
                disabled={safeIdx >= letters.length - 1}
                aria-label="다음 편지"
                className="rounded-full border border-nebula-pink/30 bg-abyss-deep/50 px-3 py-1.5 font-serif text-[11px] tracking-wider text-stardust backdrop-blur-sm transition-all hover:border-nebula-pink/60 disabled:cursor-not-allowed disabled:opacity-30"
              >
                다음 ›
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
