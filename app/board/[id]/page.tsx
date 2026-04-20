"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/app/components/BackLink";
import {
  doc,
  getDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
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
import { formatSmart } from "@/src/lib/formatSmart";

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
}

interface Comment {
  id: string;
  nickname: string;
  content: string;
  imageUrl?: string;
  createdAt: Date;
}

export default function BoardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { nickname: loginNick } = useAuth();
  const [post, setPost] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentContent, setCommentContent] = useState("");
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
        setPost({
          title: d.title,
          content: d.content,
          nickname: d.nickname,
          attachments: Array.isArray(d.attachments) ? (d.attachments as Attachment[]) : [],
          createdAt: d.createdAt?.toDate?.() ?? new Date(),
          updatedAt: d.updatedAt?.toDate?.() ?? new Date(),
        });
      }
      setLoading(false);
    })();
  }, [id]);

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
      await logActivity(
        "board_comment",
        loginNick,
        "게시판에 새 댓글이 달렸습니다",
        `/board/${id}`,
        `board/${id}/comments/${commentRef.id}`,
      );
      await addPoints(loginNick, "댓글", 1, "게시판에 댓글 작성");
    } catch {
      alert("댓글 등록에 실패했습니다.");
    }
    setCommentSubmitting(false);
  };

  if (loading) {
    return (
      <div className="board-content">
        <p className="board-loading">불러오는 중...</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="board-content">
        <p className="board-loading">존재하지 않는 게시글입니다.</p>
        <BackLink href="/board" className="board-btn" style={{ display: "inline-block", marginTop: "1rem" }}>
          목록으로
        </BackLink>
      </div>
    );
  }

  return (
    <div className="board-content">
      <BackLink href="/board" className="back-link">
        ← 목록으로
      </BackLink>

      <div className="board-detail">
        <h1 className="board-detail-title">{post.title}</h1>
        <div className="board-detail-meta">
          <NicknameLink nickname={post.nickname} />
          <span>{formatDate(post.createdAt)}</span>
        </div>
        <div className="board-detail-body">
          {post.content.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
            if (!/^https?:\/\//.test(part)) return part;
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
          <BackLink href="/board" className="board-btn">
            목록으로
          </BackLink>
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
              formatDate={formatDate}
              replyOpen={openReplyId === c.id}
              onToggleReply={() =>
                setOpenReplyId((cur) => (cur === c.id ? null : c.id))
              }
              onCloseReply={() => setOpenReplyId(null)}
              onReplyCountChange={reportReplyCount}
            />
          ))}
        </div>

        {loginNick ? (
          <div className="board-comment-form">
            <input
              className="board-input board-comment-content-input"
              placeholder="댓글을 입력하세요"
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
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
              className="board-btn"
              onClick={handleAddComment}
              disabled={commentSubmitting}
            >
              등록
            </button>
          </div>
        ) : (
          <p className="login-required">로그인이 필요합니다.</p>
        )}
      </div>
    </div>
  );
}

function BoardCommentItem({
  boardId,
  comment,
  loginNick,
  formatDate,
  replyOpen,
  onToggleReply,
  onCloseReply,
  onReplyCountChange,
}: {
  boardId: string;
  comment: Comment;
  loginNick: string | null;
  formatDate: (d: Date) => string;
  replyOpen: boolean;
  onToggleReply: () => void;
  onCloseReply: () => void;
  onReplyCountChange: (commentId: string, count: number) => void;
}) {
  const [replies, setReplies] = useState<Comment[]>([]);
  const [msg, setMsg] = useState("");
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      await logActivity(
        "board_comment",
        loginNick,
        "게시판에 새 댓글이 달렸습니다",
        `/board/${boardId}`,
        `board/${boardId}/comments/${comment.id}/replies/${replyRef.id}`,
      );
      await addPoints(loginNick, "대댓글", 1, "게시판에 대댓글 작성");
    } catch {
      alert("대댓글 등록에 실패했습니다.");
    }
    setSubmitting(false);
  };

  const handleDeleteComment = async () => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
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
    if (!confirm("정말 삭제하시겠습니까?")) return;
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
    <div className="board-comment-item">
      <div className="board-comment-header">
        <NicknameLink nickname={comment.nickname} className="board-comment-nick" />
        <span className="board-comment-date">{formatDate(comment.createdAt)}</span>
        {loginNick && (
          <button
            type="button"
            className="board-reply-btn"
            onClick={onToggleReply}
          >
            답글
          </button>
        )}
        {loginNick === comment.nickname && (
          <button
            type="button"
            className="board-reply-btn"
            onClick={handleDeleteComment}
          >
            삭제
          </button>
        )}
      </div>
      <p className="board-comment-body">{comment.content}</p>
      {comment.imageUrl && <CommentImageView url={comment.imageUrl} />}
      {(replies.length > 0 || replyOpen) && (
        <div className="board-reply-list">
          {replies.map((r) => (
            <div key={r.id} className="board-reply-item">
              <div className="board-comment-header">
                <NicknameLink nickname={r.nickname} className="board-comment-nick" prefix="↳ " />
                <span className="board-comment-date">{formatDate(r.createdAt)}</span>
                {loginNick === r.nickname && (
                  <button
                    type="button"
                    className="board-reply-btn"
                    onClick={() => handleDeleteReply(r.id)}
                  >
                    삭제
                  </button>
                )}
              </div>
              <p className="board-comment-body">{r.content}</p>
              {r.imageUrl && <CommentImageView url={r.imageUrl} />}
            </div>
          ))}
          {replyOpen && loginNick && (
            <div className="board-comment-form board-reply-form">
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
                className="board-btn"
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
