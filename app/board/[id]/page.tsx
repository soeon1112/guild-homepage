"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useDeepLinkParam } from "@/src/lib/useDeepLinkParam";
import Link from "next/link";
import {
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import { deleteActivitiesByLink, deleteActivitiesByTargetPath, logActivity } from "@/src/lib/activity";
import { addPoints } from "@/src/lib/points";
import { uploadCommentImage } from "@/src/lib/commentImage";
import {
  CommentImageAttach,
  CommentImageView,
} from "@/app/components/CommentImage";
import NicknameLink from "@/app/components/NicknameLink";
import { MemberAvatar } from "@/app/components/redesign/MemberAvatar";
import { useMemberAvatars } from "@/src/lib/useMemberAvatars";
import {
  useCommentActionSheet,
  type CommentActionContext,
} from "@/src/lib/useCommentActionSheet";
import { useDawnlight2 } from "@/src/lib/featureFlags";
import { formatSmart } from "@/src/lib/formatSmart";
import { josa, truncate } from "@/src/lib/text";
import {
  MentionPicker,
  applyMentionInsert,
} from "@/app/components/mention/MentionPicker";
import { MentionText } from "@/app/components/mention/MentionText";
import { PollCard } from "@/app/components/board/PollCard";
import type { PollMeta, PollOption } from "@/src/lib/usePollVotes";
import type { Timestamp } from "firebase/firestore";

function extractYouTubeId(url: string): string | null {
  let m = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/youtube\.com/.test(url)) {
    m = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    m = url.match(/youtube\.com\/(?:embed|shorts|v|live)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return null;
}

type AttachmentType = "image" | "video" | "gif";

type Attachment = {
  fileUrl: string;
  fileType: AttachmentType;
};

interface PostData {
  title: string;
  content: string;
  nickname: string;
  attachments: Attachment[];
  createdAt: Date;
  updatedAt: Date;
  // poll/p3: 투표 게시글일 때만 채워짐.
  type?: "normal" | "poll";
  poll?: PollMeta;
}

interface Comment {
  id: string;
  nickname: string;
  content: string;
  imageUrl?: string;
  createdAt: Date;
}

function BoardDetailPageInner({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const isDawnlight2 = useDawnlight2();
  // Deep-link comment scroll: /board/X?comment=Y from NebulaWhispers
  // navigates here. useDeepLinkParam sealed the
  // useSearchParams-empty-on-first-render race once and for all.
  const commentParam = useDeepLinkParam("comment");
  const [scrollPending, setScrollPending] = useState<boolean>(
    !!commentParam,
  );
  const commentLandedRef = useRef<string | null>(null);
  const { nickname: loginNick } = useAuth();
  // [Phase 4] 댓글/대댓글 공용 ⋯ 액션시트 — page 당 한 번 렌더.
  const { open: openActionSheet, sheet: actionSheet } = useCommentActionSheet();
  const [post, setPost] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentContent, setCommentContent] = useState("");
  // 멘션 자동완성용 cursor 추적.
  const [commentMentionCursor, setCommentMentionCursor] = useState<
    number | null
  >(null);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const [commentImage, setCommentImage] = useState<File | null>(null);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);
  const [replyCounts, setReplyCounts] = useState<Record<string, number>>({});

  const reportReplyCount = useCallback((commentId: string, count: number) => {
    setReplyCounts((prev) =>
      prev[commentId] === count ? prev : { ...prev, [commentId]: count },
    );
  }, []);

  const totalCommentCount =
    comments.length +
    comments.reduce((n, c) => n + (replyCounts[c.id] ?? 0), 0);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "board", id));
      if (snap.exists()) {
        const d = snap.data();
        // poll/p3: type:"poll" + poll{...} 옵셔널. 유효한 poll meta 만 매핑.
        const rawPoll = d.poll as Record<string, unknown> | undefined;
        const isPollType = d.type === "poll";
        const pollMeta: PollMeta | undefined =
          isPollType &&
          rawPoll &&
          typeof rawPoll.question === "string" &&
          Array.isArray(rawPoll.options)
            ? {
                question: rawPoll.question,
                options: (rawPoll.options as PollOption[]).filter(
                  (o) =>
                    o &&
                    typeof o.id === "string" &&
                    typeof o.text === "string",
                ),
                deadline:
                  rawPoll.deadline as Timestamp | undefined,
                anonymous: !!rawPoll.anonymous,
                allowChange: rawPoll.allowChange !== false,
                allowMultiple: !!rawPoll.allowMultiple,
              }
            : undefined;
        setPost({
          title: d.title,
          content: d.content,
          nickname: d.nickname,
          attachments: Array.isArray(d.attachments) ? (d.attachments as Attachment[]) : [],
          createdAt: d.createdAt?.toDate?.() ?? new Date(),
          updatedAt: d.updatedAt?.toDate?.() ?? new Date(),
          type: isPollType ? "poll" : "normal",
          poll: pollMeta,
        });
      }
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!loginNick) return;
  }, [id, loginNick]);

  useEffect(() => {
    const q = query(
      collection(db, "board", id, "comments"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(
        snap.docs.map((d) => ({
          id: d.id,
          nickname: d.data().nickname,
          content: d.data().content,
          imageUrl: d.data().imageUrl || "",
          createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
        }))
      );
    });
    return unsub;
  }, [id]);

  // Deep-link scroll-to-comment. Recursive retry with landed flag
  // covers the snapshot + DOM-paint delay; brute-force scroll
  // methods cover Mobile Safari quirks. landedRef set only after
  // a real element is found + scrolled, so failed early attempts
  // don't seal the handler. Retries cancel themselves once landed.
  useEffect(() => {
    if (loading) return;
    if (typeof window === "undefined") return;
    if (!commentParam) return;
    if (commentLandedRef.current === commentParam) return;
    const target = commentParam;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const tryScroll = (attempt: number) => {
      if (cancelled) return;
      if (commentLandedRef.current === target) return;
      const el = document.querySelector(
        `[data-comment-id="${CSS.escape(target)}"]`,
      ) as HTMLElement | null;
      if (!el) {
        if (attempt >= 8) return;
        retryTimer = setTimeout(() => tryScroll(attempt + 1), 200);
        return;
      }
      const rect = el.getBoundingClientRect();
      const targetY = Math.max(0, Math.round(rect.top + window.scrollY - 80));
      window.scrollTo(0, targetY);
      document.documentElement.scrollTop = targetY;
      document.body.scrollTop = targetY;
      commentLandedRef.current = target;
    };

    const t = setTimeout(() => tryScroll(1), 100);
    const fadeT = setTimeout(() => setScrollPending(false), 700);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      clearTimeout(t);
      clearTimeout(fadeT);
    };
  }, [commentParam, loading, comments]);

  const formatDate = (d: Date) => formatSmart(d);

  const isAuthor = !!loginNick && !!post && post.nickname === loginNick;

  const handleEdit = () => {
    router.push(`/board/edit/${id}`);
  };

  const handleDelete = async () => {
    const pw = prompt("관리자 비밀번호를 입력하세요.");
    if (pw === null) return;
    if (pw === "dawnlight2024") {
      if (confirm("정말 삭제하시겠습니까?")) {
        if (post?.attachments?.length) {
          await Promise.all(
            post.attachments.map(async (a) => {
              try {
                await deleteObject(ref(storage, a.fileUrl));
              } catch (e) {
                console.warn("attachment storage delete failed", e);
              }
            }),
          );
        }
        // poll/p4: 투표 게시글이면 votes 서브컬렉션 cascade delete.
        // 11명 비공개 길드라 단일 batch 로 충분 (한 batch 500 write 한도 안).
        if (post?.type === "poll") {
          try {
            const votesSnap = await getDocs(
              collection(db, "board", id, "votes"),
            );
            if (!votesSnap.empty) {
              const batch = writeBatch(db);
              votesSnap.forEach((d) => batch.delete(d.ref));
              await batch.commit();
            }
          } catch (e) {
            console.warn("poll votes cascade delete failed", e);
          }
        }
        await deleteDoc(doc(db, "board", id));
        await deleteActivitiesByLink(`/board/${id}`);
        router.push("/board");
      }
    } else {
      alert("관리자 비밀번호가 일치하지 않습니다.");
    }
  };

  const handleAddComment = async () => {
    if (!loginNick) return;
    if (!commentContent.trim() && !commentImage) return;
    setCommentSubmitting(true);
    try {
      let imageUrl = "";
      if (commentImage) {
        imageUrl = await uploadCommentImage(commentImage);
      }
      const commentRef = await addDoc(collection(db, "board", id, "comments"), {
        nickname: loginNick,
        content: commentContent.trim(),
        imageUrl,
        createdAt: serverTimestamp(),
      });
      setCommentContent("");
      setCommentImage(null);
      {
        const trimmed = commentContent.trim();
        await logActivity(
          "board_comment",
          loginNick,
          `게시글 댓글에 ${loginNick}님이 '${truncate(trimmed, 25)}'${josa(trimmed, "을/를")} 달았어요`,
          `/board/${id}?comment=${commentRef.id}`,
          `board/${id}/comments/${commentRef.id}`,
        );
      }
      await addPoints(loginNick, "댓글", 1, "게시판에 댓글 작성");
    } catch {
      alert("댓글 등록에 실패했습니다.");
    }
    setCommentSubmitting(false);
  };

  const rootClass =
    "board-content" + (isDawnlight2 ? " dl2-board" : "");

  if (loading) {
    return (
      <div className={rootClass}>
        <p className="board-loading">불러오는 중...</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className={rootClass}>
        <p className="board-loading">존재하지 않는 게시글입니다.</p>
        <Link href="/board" className="board-btn" style={{ display: "inline-block", marginTop: "1rem" }}>
          목록으로
        </Link>
      </div>
    );
  }

  return (
    <div
      className={rootClass}
      style={{
        opacity: scrollPending ? 0 : 1,
        transition: "opacity 150ms ease-out",
      }}
    >
      <Link href="/board" className="back-link">
        ← 목록으로
      </Link>

      <div className="board-detail">
        <h1 className="board-detail-title">{post.title}</h1>
        <div className="board-detail-meta">
          {isDawnlight2 ? (
            <NicknameLink
              nickname={post.nickname}
              className="dl2-board-nick"
            />
          ) : (
            <NicknameLink nickname={post.nickname} />
          )}
          <span>{formatDate(post.createdAt)}</span>
        </div>

        {/* poll/p3: 투표 게시글이면 본문 위에 PollCard. 일반 게시글은 안 그림. */}
        {post.type === "poll" && post.poll && (
          <PollCard
            boardId={id}
            pollMeta={post.poll}
            loginNick={loginNick ?? ""}
            isDawnlight2={isDawnlight2}
          />
        )}

        <div className="board-detail-body">
          {post.content.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
            if (!/^https?:\/\//.test(part)) {
              // plain text 토큰 안에서 멘션 파싱. inline span 강조.
              return <MentionText key={i} text={part} dl2 />;
            }
            const ytId = extractYouTubeId(part);
            if (ytId) {
              return (
                <div key={i} className="board-youtube-embed">
                  <iframe
                    src={`https://www.youtube.com/embed/${ytId}`}
                    title="YouTube video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              );
            }
            return (
              <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="board-link">
                {part}
              </a>
            );
          })}
        </div>

        {post.attachments.length > 0 && (
          <div className="board-detail-attachments">
            {post.attachments.map((a, i) =>
              a.fileType === "video" ? (
                <video
                  key={i}
                  src={a.fileUrl}
                  controls
                  playsInline
                  className="board-detail-attachment"
                />
              ) : (
                <img
                  key={i}
                  src={a.fileUrl}
                  alt=""
                  className="board-detail-attachment"
                />
              ),
            )}
          </div>
        )}

        <div className="board-detail-actions">
          {isAuthor && (
            <button className="board-btn" onClick={handleEdit}>
              수정
            </button>
          )}
          <button className="board-btn board-btn-cancel" onClick={handleDelete}>
            삭제
          </button>
          <Link href="/board" className="board-btn">
            목록으로
          </Link>
        </div>
      </div>

      {/* Comments */}
      <div className="board-comments">
        <h2 className="board-comments-title">댓글 ({totalCommentCount})</h2>

        <div className="board-comment-list">
          {comments.map((c) => (
            <BoardCommentItem
              key={c.id}
              boardId={id}
              comment={c}
              loginNick={loginNick}
              isDawnlight2={isDawnlight2}
              formatDate={formatDate}
              replyOpen={openReplyId === c.id}
              onToggleReply={() =>
                setOpenReplyId((cur) => (cur === c.id ? null : c.id))
              }
              onCloseReply={() => setOpenReplyId(null)}
              onReplyCountChange={reportReplyCount}
              openActionSheet={openActionSheet}
            />
          ))}
        </div>

        {loginNick ? (
          <>
          {/* @-mention 자동완성 — comment input row 위 sibling. */}
          <MentionPicker
            text={commentContent}
            cursor={commentMentionCursor}
            onSelect={(nickname, range) => {
              const result = applyMentionInsert(
                commentContent,
                range.start,
                range.end,
                nickname,
              );
              setCommentContent(result.text);
              setCommentMentionCursor(result.cursor);
              requestAnimationFrame(() => {
                if (commentInputRef.current) {
                  commentInputRef.current.focus();
                  commentInputRef.current.setSelectionRange(
                    result.cursor,
                    result.cursor,
                  );
                }
              });
            }}
            dl2
          />
          <div className="board-comment-form cbar">
            <input
              ref={commentInputRef}
              className="board-input board-comment-content-input"
              placeholder="댓글을 입력하세요"
              value={commentContent}
              onChange={(e) => {
                setCommentContent(e.target.value);
                setCommentMentionCursor(e.target.selectionStart);
              }}
              onSelect={(e) =>
                setCommentMentionCursor(e.currentTarget.selectionStart)
              }
              onClick={(e) =>
                setCommentMentionCursor(e.currentTarget.selectionStart)
              }
              onKeyUp={(e) =>
                setCommentMentionCursor(e.currentTarget.selectionStart)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAddComment();
              }}
            />
            <CommentImageAttach
              file={commentImage}
              setFile={setCommentImage}
              disabled={commentSubmitting}
            />
            <button
              className="board-btn cbar-submit"
              onClick={handleAddComment}
              disabled={commentSubmitting}
            >
              등록
            </button>
          </div>
          </>
        ) : (
          <p className="login-required">로그인이 필요합니다.</p>
        )}
      </div>

      {/* [Phase 4] 댓글/대댓글 공용 ⋯ 액션시트 — page 당 한 번 렌더. */}
      {actionSheet}
    </div>
  );
}

// Next.js App Router requires `useSearchParams` callers under a
// Suspense boundary; without one the route fails to prerender at
// build time. Wrap the inner component to keep the build green.
export default function BoardDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <BoardDetailPageInner {...props} />
    </Suspense>
  );
}

function BoardCommentItem({
  boardId,
  comment,
  loginNick,
  isDawnlight2,
  formatDate,
  replyOpen,
  onToggleReply,
  onCloseReply,
  onReplyCountChange,
  openActionSheet,
}: {
  boardId: string;
  comment: Comment;
  loginNick: string | null;
  isDawnlight2: boolean;
  formatDate: (d: Date) => string;
  replyOpen: boolean;
  onToggleReply: () => void;
  onCloseReply: () => void;
  onReplyCountChange: (commentId: string, count: number) => void;
  openActionSheet: (ctx: CommentActionContext) => void;
}) {
  const [replies, setReplies] = useState<Comment[]>([]);
  const [msg, setMsg] = useState("");
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 댓글 작성자 + 대댓글 작성자 닉네임 모음 → 프사 fetch.
  const avatarNicknames = useMemo(
    () => [comment.nickname, ...replies.map((r) => r.nickname)],
    [comment.nickname, replies],
  );
  const avatars = useMemberAvatars(avatarNicknames);
  const commentAvatar = avatars.get(comment.nickname);

  useEffect(() => {
    const q = query(
      collection(db, "board", boardId, "comments", comment.id, "replies"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setReplies(
        snap.docs.map((d) => ({
          id: d.id,
          nickname: d.data().nickname,
          content: d.data().content,
          imageUrl: d.data().imageUrl || "",
          createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
        })),
      );
      onReplyCountChange(comment.id, snap.size);
    });
    return unsub;
  }, [boardId, comment.id, onReplyCountChange]);

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
        collection(db, "board", boardId, "comments", comment.id, "replies"),
        {
          nickname: loginNick,
          content: msg.trim(),
          imageUrl,
          createdAt: serverTimestamp(),
        },
      );
      setMsg("");
      setReplyImage(null);
      onCloseReply();
      {
        const trimmed = msg.trim();
        await logActivity(
          "board_comment",
          loginNick,
          `게시글 댓글에 ${loginNick}님이 '${truncate(trimmed, 25)}'${josa(trimmed, "을/를")} 달았어요`,
          `/board/${boardId}?comment=${comment.id}`,
          `board/${boardId}/comments/${comment.id}/replies/${replyRef.id}`,
        );
      }
      await addPoints(loginNick, "대댓글", 1, "게시판에 대댓글 작성");
    } catch {
      alert("대댓글 등록에 실패했습니다.");
    }
    setSubmitting(false);
  };

  // [Phase 4] confirm 은 useCommentActionSheet 가 띄움 — 이중 confirm 회피.
  const handleDeleteComment = async () => {
    try {
      await deleteDoc(doc(db, "board", boardId, "comments", comment.id));
      await deleteActivitiesByTargetPath(
        `board/${boardId}/comments/${comment.id}`,
      );
    } catch {
      alert("댓글 삭제에 실패했습니다.");
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    try {
      await deleteDoc(
        doc(db, "board", boardId, "comments", comment.id, "replies", replyId),
      );
      await deleteActivitiesByTargetPath(
        `board/${boardId}/comments/${comment.id}/replies/${replyId}`,
      );
    } catch {
      alert("대댓글 삭제에 실패했습니다.");
    }
  };

  return (
    <div className="board-comment-item" data-comment-id={comment.id}>
      {/* [Phase 4] 새 레이아웃: [프사36] [닉 ⋯] / [시간] / [본문]. */}
      {isDawnlight2 ? (
        <div className="dl2-comment-row">
          <MemberAvatar
            imageUrl={commentAvatar?.imageUrl}
            nickname={comment.nickname}
            size={36}
            dl2
          />
          <div className="dl2-comment-left" style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <NicknameLink
                nickname={comment.nickname}
                className="board-comment-nick"
              />
              {loginNick && (
                <button
                  type="button"
                  onClick={() =>
                    openActionSheet({
                      content: comment.content ?? "",
                      isMine: loginNick === comment.nickname,
                      onReply: onToggleReply,
                      onDelete:
                        loginNick === comment.nickname
                          ? handleDeleteComment
                          : undefined,
                    })
                  }
                  aria-label="댓글 메뉴 열기"
                  style={{
                    flexShrink: 0,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    background: "rgba(42, 69, 112, 0.06)",
                    color: "#5a7090",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                >
                  ⋯
                </button>
              )}
            </div>
            <span
              className="board-comment-date"
              style={{ display: "block", marginTop: 2, marginBottom: 4 }}
            >
              {formatDate(comment.createdAt)}
            </span>
            <MentionText as="p" className="board-comment-body" text={comment.content} dl2 />
            {comment.imageUrl && <CommentImageView url={comment.imageUrl} />}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
          <MemberAvatar
            imageUrl={commentAvatar?.imageUrl}
            nickname={comment.nickname}
            size={36}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <NicknameLink
                nickname={comment.nickname}
                className="board-comment-nick"
              />
              {loginNick && (
                <button
                  type="button"
                  onClick={() =>
                    openActionSheet({
                      content: comment.content ?? "",
                      isMine: loginNick === comment.nickname,
                      onReply: onToggleReply,
                      onDelete:
                        loginNick === comment.nickname
                          ? handleDeleteComment
                          : undefined,
                      theme: "cosmic",
                    })
                  }
                  aria-label="댓글 메뉴 열기"
                  style={{
                    flexShrink: 0,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    background: "rgba(216, 150, 200, 0.10)",
                    color: "var(--text-sub, #9b8fb8)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                >
                  ⋯
                </button>
              )}
            </div>
            <span
              className="board-comment-date"
              style={{ display: "block", marginTop: 2, marginBottom: 4 }}
            >
              {formatDate(comment.createdAt)}
            </span>
            <MentionText as="p" className="board-comment-body" text={comment.content} dl2 />
            {comment.imageUrl && <CommentImageView url={comment.imageUrl} />}
          </div>
        </div>
      )}
      {(replies.length > 0 || replyOpen) && (
        <div className="board-reply-list">
          {replies.map((r) => {
            const replyAvatar = avatars.get(r.nickname);
            return (
            <div key={r.id} className="board-reply-item">
              {/* [Phase 4] 대댓글 ⋯ 메뉴는 답글 없음 (시스템상 대대댓글 X). */}
              {isDawnlight2 ? (
                <div className="dl2-comment-row">
                  <MemberAvatar
                    imageUrl={replyAvatar?.imageUrl}
                    nickname={r.nickname}
                    size={36}
                    dl2
                  />
                  <div className="dl2-comment-left" style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <NicknameLink
                        nickname={r.nickname}
                        className="board-comment-nick"
                      />
                      {loginNick && (
                        <button
                          type="button"
                          onClick={() =>
                            openActionSheet({
                              content: r.content ?? "",
                              isMine: loginNick === r.nickname,
                              onDelete:
                                loginNick === r.nickname
                                  ? () => handleDeleteReply(r.id)
                                  : undefined,
                            })
                          }
                          aria-label="대댓글 메뉴 열기"
                          style={{
                            flexShrink: 0,
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            background: "rgba(42, 69, 112, 0.06)",
                            color: "#5a7090",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 14,
                            lineHeight: 1,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                          }}
                        >
                          ⋯
                        </button>
                      )}
                    </div>
                    <span
                      className="board-comment-date"
                      style={{ display: "block", marginTop: 2, marginBottom: 4 }}
                    >
                      {formatDate(r.createdAt)}
                    </span>
                    <MentionText as="p" className="board-comment-body" text={r.content} dl2 />
                    {r.imageUrl && <CommentImageView url={r.imageUrl} />}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
                  <MemberAvatar
                    imageUrl={replyAvatar?.imageUrl}
                    nickname={r.nickname}
                    size={36}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <NicknameLink
                        nickname={r.nickname}
                        className="board-comment-nick"
                      />
                      {loginNick && (
                        <button
                          type="button"
                          onClick={() =>
                            openActionSheet({
                              content: r.content ?? "",
                              isMine: loginNick === r.nickname,
                              onDelete:
                                loginNick === r.nickname
                                  ? () => handleDeleteReply(r.id)
                                  : undefined,
                              theme: "cosmic",
                            })
                          }
                          aria-label="대댓글 메뉴 열기"
                          style={{
                            flexShrink: 0,
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            background: "rgba(216, 150, 200, 0.10)",
                            color: "var(--text-sub, #9b8fb8)",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 14,
                            lineHeight: 1,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                          }}
                        >
                          ⋯
                        </button>
                      )}
                    </div>
                    <span
                      className="board-comment-date"
                      style={{ display: "block", marginTop: 2, marginBottom: 4 }}
                    >
                      {formatDate(r.createdAt)}
                    </span>
                    <MentionText as="p" className="board-comment-body" text={r.content} dl2 />
                    {r.imageUrl && <CommentImageView url={r.imageUrl} />}
                  </div>
                </div>
              )}
            </div>
            );
          })}
          {replyOpen && loginNick && (
            <div className="board-comment-form board-reply-form cbar">
              <input
                className="board-input board-comment-content-input"
                placeholder="대댓글을 입력하세요"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) handleReply();
                }}
              />
              <CommentImageAttach
                file={replyImage}
                setFile={setReplyImage}
                disabled={submitting}
              />
              <button
                className="board-btn cbar-submit"
                onClick={handleReply}
                disabled={submitting}
              >
                등록
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
