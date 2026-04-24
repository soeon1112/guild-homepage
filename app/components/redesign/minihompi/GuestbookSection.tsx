"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import { CollapsibleSection } from "./CollapsibleSection";

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

export function GuestbookSection({
  id,
  loginNick,
  memberNickname,
}: {
  id: string;
  loginNick: string | null;
  memberNickname: string | null;
}) {
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [msg, setMsg] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(0);
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);

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
        await logActivity(
          "guestbook",
          loginNick,
          `${memberNickname}님의 공간에 방명록이 달렸습니다`,
          `/members/${id}`,
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

  return (
    <CollapsibleSection
      title="방명록"
      rightSlot={<span>{entries.length}개</span>}
      defaultOpen
    >
      {/* Input pill */}
      {loginNick ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="mb-5 flex items-center gap-2 rounded-full px-2 py-1.5"
          style={{
            background: "rgba(11,8,33,0.45)",
            border: "1px solid rgba(216,150,200,0.22)",
            backdropFilter: "blur(14px)",
            boxShadow: "inset 0 1px 0 rgba(255,229,196,0.04)",
          }}
        >
          <input
            type="text"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="한마디를 남겨주세요"
            aria-label="방명록 내용"
            maxLength={200}
            disabled={submitting}
            className="min-w-0 flex-1 border-none bg-transparent px-2 py-1.5 font-serif text-[13px] text-text-primary placeholder:text-text-sub/70 focus:outline-none disabled:opacity-60 sm:px-3"
          />
          <CommentImageAttach
            file={image}
            setFile={setImage}
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting || (!msg.trim() && !image)}
            className="flex-shrink-0 rounded-full px-3 py-1.5 font-serif text-[11px] font-medium tracking-wider text-abyss-deep transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
            style={{
              background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
              boxShadow: "0 0 10px rgba(255,181,167,0.5)",
            }}
          >
            {submitting ? "..." : "등록"}
          </button>
        </form>
      ) : (
        <p className="mb-5 text-center font-serif text-[12px] italic text-text-sub">
          로그인 후 방명록을 남길 수 있습니다
        </p>
      )}

      {/* Entries */}
      {entries.length === 0 ? (
        <p className="py-6 text-center font-serif text-[12px] italic text-text-sub">
          아직 방명록이 없습니다
        </p>
      ) : (
        <ul className="flex flex-col">
          {visible.map((e, idx) => (
            <li key={e.id} className="relative">
              <GuestbookItem
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
              {idx < visible.length - 1 && (
                <div
                  className="my-3 h-px"
                  style={{
                    background:
                      "linear-gradient(to right, transparent, rgba(216,150,200,0.2), transparent)",
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-5 font-serif text-[11px] tracking-wider text-text-sub">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="transition-colors hover:text-stardust disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="이전 페이지"
          >
            ← 이전
          </button>
          <span className="text-stardust">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            className="transition-colors hover:text-stardust disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="다음 페이지"
          >
            다음 →
          </button>
        </div>
      )}
    </CollapsibleSection>
  );
}

function GuestbookItem({
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
      collection(
        db,
        "members",
        memberId,
        "guestbook",
        entry.id,
        "replies",
      ),
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
        collection(
          db,
          "members",
          memberId,
          "guestbook",
          entry.id,
          "replies",
        ),
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
        await logActivity(
          "guestbook",
          loginNick,
          `${memberNickname}님의 공간에 댓글이 달렸습니다`,
          `/members/${memberId}`,
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
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="wrap-anywhere min-w-0 flex-1 font-serif text-[13px] leading-relaxed text-text-primary">
            <NicknameLink
              nickname={entry.nickname}
              className="font-medium text-stardust"
            />
            <span className="ml-2 text-[10px] tracking-wider text-text-sub">
              {formatTime(entry.createdAt)}
            </span>
            <span className="text-text-sub"> : </span>
            {entry.message}
          </p>
          {(loginNick || loginNick === entry.nickname) && (
            <div className="flex shrink-0 items-center gap-2 font-serif text-[11px] tracking-wider">
              {loginNick && (
                <button
                  type="button"
                  onClick={onToggleReply}
                  className="text-text-sub transition-colors hover:text-peach-accent"
                >
                  {replyOpen ? "닫기" : "답글"}
                </button>
              )}
              {loginNick === entry.nickname && (
                <button
                  type="button"
                  onClick={handleDeleteEntry}
                  className="text-text-sub transition-colors hover:text-peach-accent"
                >
                  삭제
                </button>
              )}
            </div>
          )}
        </div>
        {entry.imageUrl && (
          <div className="mt-2">
            <CommentImageView url={entry.imageUrl} />
          </div>
        )}
      </div>

      {/* Replies */}
      {(replies.length > 0 || replyOpen) && (
        <div className="mt-3 ml-3 flex flex-col gap-2 sm:ml-5">
          {replies.map((r) => (
            <div key={r.id} className="flex items-start gap-2">
              <span
                className="shrink-0 font-serif text-xs leading-relaxed text-text-sub/70"
                aria-hidden
              >
                └
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="wrap-anywhere min-w-0 flex-1 font-serif text-[12px] leading-relaxed text-text-primary">
                    <NicknameLink
                      nickname={r.nickname}
                      className="font-medium text-stardust"
                    />
                    <span className="ml-2 text-[10px] tracking-wider text-text-sub">
                      {formatTime(r.createdAt)}
                    </span>
                    <span className="text-text-sub"> : </span>
                    {r.message}
                  </p>
                  {loginNick === r.nickname && (
                    <button
                      type="button"
                      onClick={() => handleDeleteReply(r.id)}
                      className="shrink-0 font-serif text-[11px] tracking-wider text-text-sub transition-colors hover:text-peach-accent"
                    >
                      삭제
                    </button>
                  )}
                </div>
                {r.imageUrl && (
                  <div className="mt-2">
                    <CommentImageView url={r.imageUrl} />
                  </div>
                )}
              </div>
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
                <div
                  className="mt-1 flex w-full min-w-0 items-center gap-1.5 rounded-full px-1.5 py-1 sm:gap-2 sm:px-2 sm:py-1.5"
                  style={{
                    background: "rgba(11,8,33,0.45)",
                    border: "1px solid rgba(216,150,200,0.22)",
                    backdropFilter: "blur(14px)",
                  }}
                >
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
                    placeholder="대댓글"
                    maxLength={200}
                    disabled={submitting}
                    autoFocus
                    className="min-w-0 flex-1 border-none bg-transparent px-2 py-1 font-serif text-[12px] text-text-primary placeholder:text-text-sub/70 focus:outline-none disabled:opacity-60 sm:px-3"
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
                    className="flex-shrink-0 rounded-full px-2.5 py-1 font-serif text-[10px] font-medium tracking-wider text-abyss-deep transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
                    style={{
                      background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
                      boxShadow: "0 0 10px rgba(255,181,167,0.5)",
                    }}
                  >
                    {submitting ? "..." : "등록"}
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
