"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import {
  deleteActivitiesByTargetPath,
  logActivity,
} from "@/src/lib/activity";
import { addPoints } from "@/src/lib/points";
import { uploadCommentImage } from "@/src/lib/commentImage";
import {
  CommentImageAttach,
  CommentImageView,
} from "@/app/components/CommentImage";
import NicknameLink from "@/app/components/NicknameLink";
import { formatSmart } from "@/src/lib/formatSmart";
import { handleEvent } from "@/src/lib/badgeCheck";
import { josa, truncate } from "@/src/lib/text";

// dawnlight2 미니홈피 5단계 — 유리병 쪽지 (sky blue + 점선 dashed
// 항목 + 답글 좌측 들여쓰기). logic 1:1 cosmic GuestbookSection
// (Firestore subscribe / autoJumpEntryId scroll / submit / delete).

type GuestbookEntry = {
  id: string;
  nickname: string;
  message: string;
  imageUrl?: string;
  createdAt: Timestamp | null;
};

type ReplyEntry = {
  id: string;
  nickname: string;
  message: string;
  imageUrl?: string;
  createdAt: Timestamp | null;
};

function formatTime(ts: Timestamp | null): string {
  if (!ts) return "";
  return formatSmart(ts.toDate());
}

const PER_PAGE = 10;

// v0 유리병 SVG (dawnlight2-v0/components/minihome/guestbook.tsx:38-47)
function BottleIcon() {
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden>
      <path
        d="M5 1h4v2l2 3v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6l2-3V1z"
        stroke="#2a4570"
        strokeWidth="1.1"
        fill="rgba(200,230,240,0.35)"
      />
      <line x1="5" y1="1" x2="9" y2="1" stroke="#2a4570" strokeWidth="1.1" strokeLinecap="round" />
      <path
        d="M4.5 9 Q7 11 9.5 9"
        stroke="#2a4570"
        strokeWidth="0.9"
        strokeLinecap="round"
        fill="none"
        opacity="0.6"
      />
    </svg>
  );
}

export function GuestbookSectionD2({
  id,
  loginNick,
  memberNickname,
  autoJumpEntryId,
}: {
  id: string;
  loginNick: string | null;
  memberNickname: string | null;
  autoJumpEntryId?: string | null;
}) {
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [msg, setMsg] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(0);
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "members", id, "guestbook"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setEntries(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as GuestbookEntry[],
      );
    });
    return () => unsub();
  }, [id]);

  // Deep-link auto-jump (cosmic 패턴 1:1)
  const jumpHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoJumpEntryId) return;
    if (entries.length === 0) return;
    if (jumpHandledRef.current === autoJumpEntryId) return;
    const idx = entries.findIndex((e) => e.id === autoJumpEntryId);
    if (idx < 0) return;
    jumpHandledRef.current = autoJumpEntryId;
    const targetPage = Math.floor(idx / PER_PAGE);
    setPage(targetPage);

    const tryScroll = () => {
      const el = document.querySelector(
        `[data-gb-entry-id="${autoJumpEntryId}"]`,
      );
      if (!(el instanceof HTMLElement)) return;
      const rect = el.getBoundingClientRect();
      const targetY = Math.max(0, Math.round(rect.top + window.scrollY - 80));
      window.scrollTo(0, targetY);
      document.documentElement.scrollTop = targetY;
      document.body.scrollTop = targetY;
    };
    const handles: ReturnType<typeof setTimeout>[] = [];
    for (const ms of [250, 700, 1500, 3000]) {
      handles.push(setTimeout(tryScroll, ms));
    }
    return () => {
      for (const h of handles) clearTimeout(h);
    };
  }, [autoJumpEntryId, entries]);

  const handleSubmit = async () => {
    if (!loginNick) return;
    if (!msg.trim() && !image) return;
    setSubmitting(true);
    try {
      let imageUrl = "";
      if (image) {
        imageUrl = await uploadCommentImage(image);
      }
      const entryRef = await addDoc(
        collection(db, "members", id, "guestbook"),
        {
          nickname: loginNick,
          message: msg.trim(),
          imageUrl,
          createdAt: serverTimestamp(),
        },
      );
      setMsg("");
      setImage(null);
      if (memberNickname) {
        const trimmed = msg.trim();
        await logActivity(
          "guestbook",
          loginNick,
          `${memberNickname}님의 방명록에 '${truncate(trimmed, 25)}'${josa(trimmed, "이/가")} 달렸어요`,
          `/members/${id}?guestbook=${entryRef.id}`,
          `members/${id}/guestbook/${entryRef.id}`,
        );
      }
      await addPoints(
        loginNick,
        "방명록",
        2,
        `${memberNickname ?? "미니홈피"}님의 방명록에 글 남김`,
      );
      const todayKey = new Date().toISOString().slice(0, 10);
      const todaySameTarget = entries.filter((e) => {
        if (e.nickname !== loginNick) return false;
        const c = e.createdAt?.toDate?.();
        if (!c) return false;
        return c.toISOString().slice(0, 10) === todayKey;
      }).length;
      handleEvent({
        type: "minihomeGuestbook",
        nickname: loginNick,
        target: memberNickname ?? "",
        existingCountOnTargetToday: todaySameTarget,
        existingCountOnTargetTotal: entries.length,
        when: new Date(),
      });
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  const totalPages = Math.max(1, Math.ceil(entries.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages - 1);
  const visible = entries.slice(
    currentPage * PER_PAGE,
    currentPage * PER_PAGE + PER_PAGE,
  );

  const handleToggle = () => {
    setInteractive(true);
    setOpen((v) => !v);
  };

  const body = (
    <div className="px-4 pb-5 pt-4 sm:px-5 sm:pb-6">
      {/* Input — 가로 한 줄 */}
      {loginNick ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="mb-4 flex items-center gap-2"
        >
          <input
            type="text"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="유리병에 담아 띄울 한 줄..."
            aria-label="유리병 쪽지 내용"
            maxLength={200}
            disabled={submitting}
            className="min-w-0 flex-1 rounded-md px-3 py-2 text-[13px] focus:outline-none disabled:opacity-60"
            style={{
              background: "rgba(255, 255, 255, 0.5)",
              border: "1px solid rgba(42, 69, 112, 0.25)",
              color: "#2a4570",
            }}
          />
          <CommentImageAttach
            file={image}
            setFile={setImage}
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting || (!msg.trim() && !image)}
            className="flex-shrink-0 rounded-md px-4 py-1.5 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "rgba(42, 69, 112, 0.15)",
              border: "1px solid rgba(42, 69, 112, 0.4)",
              color: "#2a4570",
            }}
            onMouseEnter={(e) => {
              if (!submitting && (msg.trim() || image))
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(42, 69, 112, 0.24)";
            }}
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.background =
                "rgba(42, 69, 112, 0.15)")
            }
          >
            {submitting ? "..." : "보내기"}
          </button>
        </form>
      ) : (
        <p
          className="mb-4 text-center text-[12px] italic"
          style={{ color: "rgba(42, 69, 112, 0.6)" }}
        >
          로그인 후 쪽지를 띄울 수 있습니다
        </p>
      )}

      {/* Entries */}
      {entries.length === 0 ? (
        <p
          className="py-8 text-center text-[11px] italic"
          style={{ color: "rgba(42, 69, 112, 0.5)" }}
        >
          아직 띄워진 쪽지가 없어요. 첫 쪽지를 보내보세요.
        </p>
      ) : (
        <ul className="flex flex-col">
          {visible.map((e, idx) => (
            <li
              key={e.id}
              data-gb-entry-id={e.id}
              className="py-2"
              style={
                idx < visible.length - 1
                  ? { borderBottom: "1px dashed rgba(42, 69, 112, 0.25)" }
                  : undefined
              }
            >
              <GuestbookItemD2
                memberId={id}
                entry={e}
                loginNick={loginNick}
                memberNickname={memberNickname}
                replyOpen={openReplyId === e.id}
                onToggleReply={() =>
                  setOpenReplyId((cur) => (cur === e.id ? null : e.id))
                }
                onCloseReply={() => setOpenReplyId(null)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          className="mt-6 flex items-center justify-center gap-5 text-[11px] tracking-wider"
          style={{ color: "rgba(42, 69, 112, 0.7)" }}
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            ← 이전
          </button>
          <span style={{ color: "#2a4570" }}>
            {currentPage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            className="transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            다음 →
          </button>
        </div>
      )}
    </div>
  );

  return (
    <section
      id="minihome-guestbook"
      className="overflow-hidden rounded-2xl"
      style={{
        background: "rgba(205, 216, 224, 0.85)",
        boxShadow: "0 4px 12px rgba(42, 69, 112, 0.2)",
      }}
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:brightness-105"
      >
        <span className="flex items-center gap-2">
          <BottleIcon />
          <span
            className="text-[15px] font-semibold tracking-wide"
            style={{ color: "#2a4570" }}
          >
            유리병 쪽지
          </span>
          <span
            className="text-xs font-normal"
            style={{ color: "rgba(42, 69, 112, 0.7)" }}
          >
            ({entries.length}개)
          </span>
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          aria-hidden
          style={{ display: "inline-flex", color: "#2a4570" }}
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid rgba(42, 69, 112, 0.25)" }} />
      )}

      {interactive ? (
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              {body}
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        open && body
      )}
    </section>
  );
}

function GuestbookItemD2({
  memberId,
  entry,
  loginNick,
  memberNickname,
  replyOpen,
  onToggleReply,
  onCloseReply,
}: {
  memberId: string;
  entry: GuestbookEntry;
  loginNick: string | null;
  memberNickname: string | null;
  replyOpen: boolean;
  onToggleReply: () => void;
  onCloseReply: () => void;
}) {
  const [replies, setReplies] = useState<ReplyEntry[]>([]);
  const [msg, setMsg] = useState("");
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "members", memberId, "guestbook", entry.id, "replies"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setReplies(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ReplyEntry[],
      );
    });
    return () => unsub();
  }, [memberId, entry.id]);

  const handleReply = async () => {
    if (!loginNick) return;
    if (!msg.trim() && !replyImage) return;
    setSubmitting(true);
    try {
      let imageUrl = "";
      if (replyImage) {
        imageUrl = await uploadCommentImage(replyImage);
      }
      const replyRef = await addDoc(
        collection(db, "members", memberId, "guestbook", entry.id, "replies"),
        {
          nickname: loginNick,
          message: msg.trim(),
          imageUrl,
          createdAt: serverTimestamp(),
        },
      );
      setMsg("");
      setReplyImage(null);
      onCloseReply();
      if (memberNickname) {
        const trimmed = msg.trim();
        await logActivity(
          "guestbook",
          loginNick,
          `${memberNickname}님의 방명록 댓글에 '${truncate(trimmed, 25)}'${josa(trimmed, "이/가")} 달렸어요`,
          `/members/${memberId}?guestbook=${entry.id}`,
          `members/${memberId}/guestbook/${entry.id}/replies/${replyRef.id}`,
        );
      }
      await addPoints(
        loginNick,
        "대댓글",
        1,
        `${memberNickname ?? "미니홈피"}님 방명록에 대댓글 작성`,
      );
      handleEvent({
        type: "comment",
        nickname: loginNick,
        content: msg,
        when: new Date(),
      });
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  const handleDeleteEntry = async () => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, "members", memberId, "guestbook", entry.id));
      await deleteActivitiesByTargetPath(
        `members/${memberId}/guestbook/${entry.id}`,
      );
    } catch (e) {
      console.error(e);
      alert("방명록 삭제에 실패했습니다.");
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(
        doc(db, "members", memberId, "guestbook", entry.id, "replies", replyId),
      );
      await deleteActivitiesByTargetPath(
        `members/${memberId}/guestbook/${entry.id}/replies/${replyId}`,
      );
    } catch (e) {
      console.error(e);
      alert("대댓글 삭제에 실패했습니다.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* 한 줄 가로: [칭호닉네임]: 본문… [시간 답글 삭제] */}
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          <span className="flex-shrink-0">
            <NicknameLink nickname={entry.nickname} />
          </span>
          <span
            className="truncate text-[12px] leading-relaxed"
            style={{ color: "#4a2a1a" }}
          >
            : {entry.message}
          </span>
        </div>
        <time
          className="flex-shrink-0 text-[10px] tabular-nums"
          style={{ color: "#5a7090" }}
        >
          {formatTime(entry.createdAt)}
        </time>
        {loginNick && (
          <button
            type="button"
            onClick={onToggleReply}
            className="flex-shrink-0 text-[11px] transition-opacity"
            style={{ color: "#5a7090" }}
          >
            {replyOpen ? "닫기" : "답글"}
          </button>
        )}
        {loginNick === entry.nickname && (
          <button
            type="button"
            onClick={handleDeleteEntry}
            className="flex-shrink-0 text-[11px] transition-opacity"
            style={{ color: "#5a7090" }}
          >
            삭제
          </button>
        )}
      </div>
      {entry.imageUrl && (
        <div className="mt-2">
          <CommentImageView url={entry.imageUrl} />
        </div>
      )}

      {/* Replies — 좌측 들여쓰기 + 세로선 */}
      {(replies.length > 0 || replyOpen) && (
        <div
          className="mt-2 flex flex-col gap-2 pl-3"
          style={{ borderLeft: "2px solid rgba(42, 69, 112, 0.2)" }}
        >
          {replies.map((r) => (
            <div key={r.id}>
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                  <span className="flex-shrink-0">
                    <NicknameLink nickname={r.nickname} />
                  </span>
                  <span
                    className="truncate text-[12px] leading-relaxed"
                    style={{ color: "#4a2a1a" }}
                  >
                    : {r.message}
                  </span>
                </div>
                <time
                  className="flex-shrink-0 text-[10px] tabular-nums"
                  style={{ color: "#5a7090" }}
                >
                  {formatTime(r.createdAt)}
                </time>
                {loginNick === r.nickname && (
                  <button
                    type="button"
                    onClick={() => handleDeleteReply(r.id)}
                    className="flex-shrink-0 text-[11px]"
                    style={{ color: "#5a7090" }}
                  >
                    삭제
                  </button>
                )}
              </div>
              {r.imageUrl && (
                <div className="mt-1">
                  <CommentImageView url={r.imageUrl} />
                </div>
              )}
            </div>
          ))}

          <AnimatePresence>
            {replyOpen && loginNick && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: "hidden" }}
              >
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleReply();
                      }
                    }}
                    placeholder="답장"
                    maxLength={200}
                    disabled={submitting}
                    autoFocus
                    className="min-w-0 flex-1 rounded-md px-2.5 py-1.5 text-[11px] focus:outline-none disabled:opacity-60"
                    style={{
                      background: "rgba(255, 255, 255, 0.5)",
                      border: "1px solid rgba(42, 69, 112, 0.25)",
                      color: "#2a4570",
                    }}
                  />
                  <CommentImageAttach
                    file={replyImage}
                    setFile={setReplyImage}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={handleReply}
                    disabled={submitting || (!msg.trim() && !replyImage)}
                    className="flex-shrink-0 rounded-md px-3 py-1 text-[10px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      background: "rgba(42, 69, 112, 0.15)",
                      border: "1px solid rgba(42, 69, 112, 0.4)",
                      color: "#2a4570",
                    }}
                  >
                    {submitting ? "..." : "보내기"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
