"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BackLink from "@/app/components/BackLink";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";

export default function BoardEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { nickname: loginNick, ready } = useAuth();
  const [authorNick, setAuthorNick] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "board", id));
      if (snap.exists()) {
        const d = snap.data();
        setAuthorNick(d.nickname);
        setTitle(d.title);
        setContent(d.content);
      }
      setLoading(false);
    })();
  }, [id]);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      alert("제목과 내용을 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await updateDoc(doc(db, "board", id), {
        title: title.trim(),
        content: content.trim(),
        updatedAt: serverTimestamp(),
      });
      router.push(`/board/${id}`);
    } catch {
      alert("수정에 실패했습니다.");
      setSubmitting(false);
    }
  };

  if (loading || !ready) {
    return (
      <div className="board-content">
        <p className="board-loading">불러오는 중...</p>
      </div>
    );
  }

  if (authorNick === null) {
    return (
      <div className="board-content">
        <BackLink href="/board" className="back-link">← 목록으로</BackLink>
        <p className="board-loading">존재하지 않는 게시글입니다.</p>
      </div>
    );
  }

  if (!loginNick || loginNick !== authorNick) {
    return (
      <div className="board-content">
        <BackLink href={`/board/${id}`} className="back-link">← 돌아가기</BackLink>
        <p className="login-required">작성자만 수정할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="board-content">
      <BackLink href={`/board/${id}`} className="back-link">
        ← 돌아가기
      </BackLink>

      <h1 className="board-title">글 수정</h1>

      <div className="board-form">
        <input
          className="board-input"
          placeholder="제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="board-input board-textarea"
          placeholder="내용을 입력하세요"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
        />
        <div className="board-form-buttons">
          <button className="board-btn" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "저장 중..." : "저장"}
          </button>
          <Link href={`/board/${id}`} className="board-btn board-btn-cancel">
            취소
          </Link>
        </div>
      </div>
    </div>
  );
}
