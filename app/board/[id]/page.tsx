"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

interface PostData {
  title: string;
  content: string;
  nickname: string;
  password: string;
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
  const [post, setPost] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentNick, setCommentNick] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "board", id));
      if (snap.exists()) {
        const d = snap.data();
        setPost({
          title: d.title,
          content: d.content,
          nickname: d.nickname,
          password: d.password,
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

  const handleEdit = () => {
    const pw = prompt("비밀번호를 입력하세요.");
    if (pw === null) return;
    if (pw === post?.password) {
      router.push(`/board/edit/${id}`);
    } else {
      alert("비밀번호가 일치하지 않습니다.");
    }
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
    if (!commentNick.trim() || !commentContent.trim()) {
      alert("닉네임과 댓글을 입력해주세요.");
      return;
    }
    setCommentSubmitting(true);
    try {
      await addDoc(collection(db, "board", id, "comments"), {
        nickname: commentNick.trim(),
        content: commentContent.trim(),
        createdAt: serverTimestamp(),
      });
      setCommentContent("");
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
        <Link href="/board" className="board-btn" style={{ display: "inline-block", marginTop: "1rem" }}>
          목록으로
        </Link>
      </div>
    );
  }

  return (
    <div className="board-content">
      <Link href="/board" className="back-link">
        ← 목록으로
      </Link>

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
          <button className="board-btn" onClick={handleEdit}>
            수정
          </button>
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
        <h2 className="board-comments-title">댓글 ({comments.length})</h2>

        <div className="board-comment-list">
          {comments.map((c) => (
            <div key={c.id} className="board-comment-item">
              <div className="board-comment-header">
                <span className="board-comment-nick">{c.nickname}</span>
                <span className="board-comment-date">{formatDate(c.createdAt)}</span>
              </div>
              <p className="board-comment-body">{c.content}</p>
            </div>
          ))}
        </div>

        <div className="board-comment-form">
          <input
            className="board-input board-comment-nick-input"
            placeholder="닉네임"
            value={commentNick}
            onChange={(e) => setCommentNick(e.target.value)}
          />
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
      </div>
    </div>
  );
}
