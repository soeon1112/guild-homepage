"use client";

import { Inbox, Mail, X } from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
import { formatSmart } from "@/src/lib/formatSmart";
import { useAuth } from "@/app/components/AuthProvider";
import { useModalBodyLock } from "@/src/lib/useModalBodyLock";
import { useBackdropClose } from "@/src/lib/useBackdropClose";

// Paper Plane Letters — Dawnlight 2 anonymous letter widget.
//
// Same Firestore wiring as the cosmic ShootingStarLetter:
//   • collection "letters" with { from, to, content, status, read,
//     createdAt, deliveredAt }
//   • inbox subscription where("to", nick), where("status", "approved"),
//     onSnapshot live, sorted by deliveredAt desc
//   • compose: addDoc with status:"approved" + read:false + both
//     timestamps from serverTimestamp
//   • mark read: updateDoc({ read: true }) on the selected letter
//
// Visual: hazy sky-blue card on the noctilucent gradient (header
// outside the box like the other dawnlight2 widgets), large paper
// plane SVG floating with the dl2-plane-float keyframe, navy CTA
// pill ("띄우기") + outlined navy "편지함" pill that mirrors the
// NoteToTheSky button shape exactly.

type Letter = {
  id: string;
  from: string;
  to: string;
  content: string;
  status: string;
  read: boolean;
  createdAt: Timestamp | null;
  deliveredAt: Timestamp | null;
};

const NAVY = "#2a4570";
const NAVY_SOFT = "#5a7090";
const CREAM = "#fef5e6";

function LargePaperPlane() {
  return (
    <div style={{ transform: "rotate(-15deg)" }}>
      <svg
        viewBox="0 0 100 100"
        className="w-16 sm:w-20"
        aria-hidden
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="dl2-ppl-top" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fef5e6" />
            <stop offset="100%" stopColor="#f0d8b0" />
          </linearGradient>
          <linearGradient id="dl2-ppl-bot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8c888" />
            <stop offset="100%" stopColor="#d4aa66" />
          </linearGradient>
        </defs>
        <path
          d="M 5,50 L 95,15 L 60,55 Z"
          fill="url(#dl2-ppl-top)"
          stroke="rgba(180,140,70,0.5)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path
          d="M 5,50 L 60,55 L 50,82 Z"
          fill="url(#dl2-ppl-bot)"
          stroke="rgba(160,120,50,0.5)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <line
          x1="5"
          y1="50"
          x2="95"
          y2="15"
          stroke="rgba(150,110,50,0.4)"
          strokeWidth="0.8"
          strokeDasharray="5 3"
        />
        <line
          x1="60"
          y1="55"
          x2="50"
          y2="82"
          stroke="rgba(150,110,50,0.3)"
          strokeWidth="0.7"
        />
      </svg>
    </div>
  );
}

export function PaperPlaneLetters() {
  const { nickname } = useAuth();
  const [inbox, setInbox] = useState<Letter[]>([]);
  const [modal, setModal] = useState<"compose" | "inbox" | null>(null);

  // Deep-link auto-open from letter push tap. Push payload carries
  // /?letter=true; we flip the inbox modal open once per arrival.
  // Lazy-init useState (instead of useSearchParams) because the home
  // page is a server component without a Suspense wrapper and the flag
  // is set at navigation time and never changes — same pattern cosmic
  // ShootingStarLetter uses for this same param.
  const [initialLetterFlag] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("letter") === "true";
  });
  const lastLetterHandledRef = useRef(false);
  useEffect(() => {
    if (!initialLetterFlag) return;
    if (!nickname) return;
    if (lastLetterHandledRef.current) return;
    lastLetterHandledRef.current = true;
    setModal("inbox");
  }, [initialLetterFlag, nickname]);

  // Live inbox subscription so the unread badge keeps updating even
  // while the user has the inbox modal closed. Same shape the cosmic
  // ShootingStarLetter uses; the two widgets share the same view.
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
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Letter));
      // Client-side sort by deliveredAt desc (avoids a composite index
      // requirement on the where+orderBy combo).
      items.sort((a, b) => {
        const at = a.deliveredAt?.toMillis() ?? a.createdAt?.toMillis() ?? 0;
        const bt = b.deliveredAt?.toMillis() ?? b.createdAt?.toMillis() ?? 0;
        return bt - at;
      });
      setInbox(items);
    });
    return () => unsub();
  }, [nickname]);

  const unreadCount = inbox.filter((l) => !l.read).length;

  return (
    <>
      <section
        aria-labelledby="dl2-paper-plane-letters"
        className="mx-auto w-full max-w-2xl px-5 pb-12 pt-2 sm:px-6 sm:pb-16"
      >
        {/* Header outside the card */}
        <header className="mb-3 px-1">
          <h2
            id="dl2-paper-plane-letters"
            className="text-lg font-semibold leading-tight text-cream sm:text-xl"
          >
            종이비행기 편지
          </h2>
          <p className="mt-1 text-[10px] uppercase tracking-[0.32em] text-mist-lavender">
            Paper Plane Letters
          </p>
        </header>

        {/* Hazy sky card. On mobile the plane + right column are
            centered as one bundle (right column is content-fit, items
            inside left-aligned). From sm: up the right column expands
            so buttons sit at the far right of the row. */}
        <div
          className="overflow-hidden rounded-2xl"
          style={{
            background: "rgba(205, 216, 224, 0.65)",
            border: "1px solid rgba(42, 69, 112, 0.18)",
          }}
        >
          <div className="flex items-center justify-center gap-5 px-4 py-4 sm:justify-start sm:gap-6 sm:px-7 sm:py-5">
            <div className="flex-shrink-0 self-center animate-plane-float">
              <LargePaperPlane />
            </div>

            <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-1 sm:flex-row sm:items-center sm:gap-6">
              <div className="min-w-0 text-left sm:flex-1">
                <h3
                  className="text-base font-semibold leading-snug sm:text-lg"
                  style={{ color: NAVY }}
                >
                  익명의 마음을 띄워요
                </h3>
                <p
                  className="mt-1 text-[11px] leading-relaxed sm:text-xs"
                  style={{ color: NAVY_SOFT }}
                >
                  누군가의 마음에 닿을 편지 한 통
                </p>
              </div>

              {/* Buttons — match the NoteToTheSky pill shape
                  (rounded-full px-4 py-1.5 text-xs font-medium).
                  Filled navy primary, outlined navy secondary. */}
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!nickname) {
                      alert("로그인이 필요합니다.");
                      return;
                    }
                    setModal("compose");
                  }}
                  className="rounded-full px-4 py-1.5 text-xs font-medium transition-opacity active:scale-95 hover:opacity-90"
                  style={{ background: NAVY, color: CREAM }}
                >
                  ✦ 띄우기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!nickname) {
                      alert("로그인이 필요합니다.");
                      return;
                    }
                    setModal("inbox");
                  }}
                  className="relative rounded-full px-4 py-1.5 text-xs font-medium transition-colors active:scale-95 hover:bg-[rgba(42,69,112,0.08)]"
                  style={{
                    border: `1px solid ${NAVY}`,
                    color: NAVY,
                    background: "transparent",
                  }}
                >
                  ✉ 편지함
                  {unreadCount > 0 && (
                    <span
                      className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold"
                      style={{ background: "#dc2626", color: CREAM }}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {modal === "compose" && nickname && (
        <ComposeModal
          nickname={nickname}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "inbox" && nickname && (
        <InboxModal
          letters={inbox}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

/* ─── Compose modal ────────────────────────────────────────────── */

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

  useModalBodyLock(true);
  const backdropHandlers = useBackdropClose(onClose);

  // Recipient list — same source/filter the cosmic ComposeModal uses.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        if (cancelled) return;
        const nicks = snap.docs
          .map((d) => (d.data().nickname as string | undefined) ?? d.id)
          .filter((n): n is string => !!n && n !== nickname)
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
        status: "approved",
        read: false,
        createdAt: serverTimestamp(),
        deliveredAt: serverTimestamp(),
      });
      setDoneMsg("편지가 종이비행기로 날아갔어요");
      setContent("");
      setTo("");
      setTimeout(() => {
        setDoneMsg(null);
        onClose();
      }, 1800);
    } catch (e2) {
      console.error(e2);
      setErr("전송에 실패했어요. 잠시 후 다시 시도해주세요.");
    }
    setSending(false);
  };

  // Portal-mount to body so the modal escapes the parent .main-content
  // z-10 stacking-context trap. Without this, even z-[1000] inside the
  // main column would still render below sibling-of-main fixed FABs
  // (FloatingChat z-[200], BottomNav z-40).
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center px-4 py-6"
      style={{ background: "rgba(11, 8, 33, 0.65)" }}
      {...backdropHandlers}
    >
      <div
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: "rgba(205, 216, 224, 0.98)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "rgba(42, 69, 112, 0.18)" }}>
          <h3 className="text-base font-semibold" style={{ color: NAVY }}>
            ✦ 종이비행기 띄우기
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-full p-1 transition-colors hover:bg-[rgba(42,69,112,0.08)]"
            style={{ color: NAVY }}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={handleSend} className="flex flex-col gap-3 p-5">
          <label className="flex flex-col gap-1.5 text-xs" style={{ color: NAVY }}>
            받을 사람
            <select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm focus:outline-none"
              style={{
                color: NAVY,
                background: "rgba(255,255,255,0.7)",
                borderColor: "rgba(42, 69, 112, 0.25)",
              }}
            >
              <option value="">받을 사람을 선택하세요</option>
              {users.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-xs" style={{ color: NAVY }}>
            편지 내용
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              maxLength={500}
              placeholder="익명으로 전달돼요. 마음을 담은 한 마디를 적어주세요."
              className="resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none"
              style={{
                color: NAVY,
                background: "rgba(255,255,255,0.7)",
                borderColor: "rgba(42, 69, 112, 0.25)",
              }}
            />
          </label>

          {err && (
            <p className="text-xs" style={{ color: "#dc2626" }}>
              {err}
            </p>
          )}
          {doneMsg && (
            <p className="text-xs font-medium" style={{ color: NAVY }}>
              ✦ {doneMsg}
            </p>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="rounded-full px-4 py-1.5 text-xs font-medium transition-colors hover:bg-[rgba(42,69,112,0.08)] disabled:opacity-50"
              style={{
                border: `1px solid ${NAVY}`,
                color: NAVY,
              }}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={sending || !!doneMsg}
              className="rounded-full px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: NAVY, color: CREAM }}
            >
              {sending ? "보내는 중..." : doneMsg ? "전송됨" : "✦ 보내기"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

/* ─── Inbox modal ──────────────────────────────────────────────── */

function InboxModal({
  letters,
  onClose,
}: {
  letters: Letter[];
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => letters.find((l) => l.id === selectedId) ?? null,
    [letters, selectedId],
  );

  useModalBodyLock(true);
  const backdropHandlers = useBackdropClose(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const markRead = async (l: Letter) => {
    if (l.read) return;
    try {
      await updateDoc(doc(db, "letters", l.id), { read: true });
    } catch (e) {
      console.error(e);
    }
  };

  // Portal-mount to body — see ComposeModal for the same z-index trap.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center px-4 py-6"
      style={{ background: "rgba(11, 8, 33, 0.65)" }}
      {...backdropHandlers}
    >
      <div
        className="relative flex h-[min(80vh,560px)] w-full max-w-md flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: "rgba(205, 216, 224, 0.98)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "rgba(42, 69, 112, 0.18)" }}
        >
          <h3 className="flex items-center gap-2 text-base font-semibold" style={{ color: NAVY }}>
            <Inbox className="h-4 w-4" />
            편지함
            {letters.length > 0 && (
              <span className="text-xs font-normal" style={{ color: NAVY_SOFT }}>
                · {letters.length}통
              </span>
            )}
          </h3>
          <button
            type="button"
            onClick={selected ? () => setSelectedId(null) : onClose}
            aria-label={selected ? "목록으로" : "닫기"}
            className="rounded-full p-1 transition-colors hover:bg-[rgba(42,69,112,0.08)]"
            style={{ color: NAVY }}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {letters.length === 0 ? (
            <p
              className="px-6 py-16 text-center text-sm italic"
              style={{ color: NAVY_SOFT }}
            >
              아직 도착한 편지가 없어요
            </p>
          ) : selected ? (
            <article className="flex flex-col gap-3 px-5 py-4">
              <p className="text-[11px]" style={{ color: NAVY_SOFT }}>
                {selected.deliveredAt
                  ? formatSmart(selected.deliveredAt.toDate())
                  : selected.createdAt
                    ? formatSmart(selected.createdAt.toDate())
                    : ""}
              </p>
              <div
                className="rounded-xl p-4"
                style={{
                  background: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(42, 69, 112, 0.15)",
                }}
              >
                <p
                  className="whitespace-pre-wrap text-sm leading-relaxed"
                  style={{ color: NAVY }}
                >
                  {selected.content}
                </p>
              </div>
              <p className="text-right text-xs italic" style={{ color: NAVY_SOFT }}>
                익명의 누군가로부터
              </p>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => markRead(selected)}
                  disabled={selected.read}
                  className="rounded-full px-4 py-1.5 text-xs font-medium transition-opacity disabled:opacity-50"
                  style={{
                    background: selected.read ? "transparent" : NAVY,
                    color: selected.read ? NAVY_SOFT : CREAM,
                    border: selected.read
                      ? `1px solid ${NAVY_SOFT}`
                      : "1px solid transparent",
                  }}
                >
                  {selected.read ? "읽음" : "읽었습니다"}
                </button>
              </div>
            </article>
          ) : (
            <ul className="divide-y" style={{ borderColor: "rgba(42, 69, 112, 0.12)" }}>
              {letters.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(l.id);
                      markRead(l);
                    }}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[rgba(42,69,112,0.05)]"
                  >
                    <Mail
                      className="h-4 w-4 flex-shrink-0"
                      style={{ color: l.read ? NAVY_SOFT : NAVY }}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm"
                        style={{
                          color: l.read ? NAVY_SOFT : NAVY,
                          fontWeight: l.read ? 400 : 600,
                        }}
                      >
                        {l.content}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {!l.read && (
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: "#dc2626" }}
                        />
                      )}
                      <span className="text-[10px]" style={{ color: NAVY_SOFT }}>
                        {l.deliveredAt
                          ? formatSmart(l.deliveredAt.toDate())
                          : ""}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
