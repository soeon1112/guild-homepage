"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/lib/firebase";

export default function BoardEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "board", id));
      if (snap.exists()) {
        const d = snap.data();
        setNickname(d.nickname);
        setPassword(d.password);
        setTitle(d.title);
        setContent(d.content);
      }
      setLoading(false);
    })();
  }, [id]);

  const handleSubmit = async () => {
    if (!nickname.trim() || !title.trim() || !content.trim()) {
      alert("모든 항목을 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await updateDoc(doc(db, "board", id), {
        title: title.trim(),
        content: content.trim(),
        nickname: nickname.trim(),
        password: password.trim(),
        updatedAt: serverTimestamp(),
      });
      router.push(`/board/${id}`);
    } catch {
      alert("수정에 실패했습니다.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="board-content">
        <p className="board-loading">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="board-content">
      <Link href={`/board/${id}`} className="back-link">
        ← 돌아가기
      </Link>

      <h1 className="board-title">글 수정</h1>

      <div className="board-form">
        <input
          className="board-input"
          placeholder="닉네임"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
        <input
          className="board-input"
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
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
