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
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import { logActivity } from "@/src/lib/activity";

interface PostData {
  title: string;
  content: string;
  nickname: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Comment {
  id: string;
  nickname: string;
  content: string;
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
          createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
        }))
      );
    });
    return unsub;
  }, [id]);

  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}.${m}.${day} ${h}:${min}`;
  };

  const isAuthor = !!loginNick && !!post && post.nickname === loginNick;

  const handleEdit = () => {
    router.push(`/board/edit/${id}`);
  };

  const handleDelete = async () => {
    const pw = prompt("관리자 비밀번호를 입력하세요.");
    if (pw === null) return;
    if (pw === "dawnlight2024") {
      if (confirm("정말 삭제하시겠습니까?")) {
        await deleteDoc(doc(db, "board", id));
        router.push("/board");
      }
    } else {
      alert("관리자 비밀번호가 일치하지 않습니다.");
    }
  };

  const handleAddComment = async () => {
    if (!loginNick || !commentContent.trim()) return;
    setCommentSubmitting(true);
    try {
      await addDoc(collection(db, "board", id, "comments"), {
        nickname: loginNick,
        content: commentContent.trim(),
        createdAt: serverTimestamp(),
      });
      setCommentContent("");
      await logActivity(
        "board_comment",
        loginNick,
        "정보 게시판에 새 댓글이 달렸습니다",
        `/board/${id}`,
      );
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
          <span>{post.nickname}</span>
          <span>{formatDate(post.createdAt)}</span>
        </div>
        <div className="board-detail-body">
          {post.content.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
            /^https?:\/\//.test(part) ? (
              <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="board-link">
                {part}
              </a>
            ) : (
              part
            )
          )}
        </div>

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
          createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
        })),
      );
      onReplyCountChange(comment.id, snap.size);
    });
    return unsub;
  }, [boardId, comment.id, onReplyCountChange]);

  const handleReply = async () => {
    if (!loginNick || !msg.trim()) return;
    setSubmitting(true);
    try {
      await addDoc(
        collection(db, "board", boardId, "comments", comment.id, "replies"),
        {
          nickname: loginNick,
          content: msg.trim(),
          createdAt: serverTimestamp(),
        },
      );
      setMsg("");
      onCloseReply();
      await logActivity(
        "board_comment",
        loginNick,
        "정보 게시판에 새 댓글이 달렸습니다",
        `/board/${boardId}`,
      );
    } catch {
      alert("대댓글 등록에 실패했습니다.");
    }
    setSubmitting(false);
  };

  return (
    <div className="board-comment-item">
      <div className="board-comment-header">
        <span className="board-comment-nick">{comment.nickname}</span>
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
      </div>
      <p className="board-comment-body">{comment.content}</p>
      {(replies.length > 0 || replyOpen) && (
        <div className="board-reply-list">
          {replies.map((r) => (
            <div key={r.id} className="board-reply-item">
              <div className="board-comment-header">
                <span className="board-comment-nick">↳ {r.nickname}</span>
                <span className="board-comment-date">{formatDate(r.createdAt)}</span>
              </div>
              <p className="board-comment-body">{r.content}</p>
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
