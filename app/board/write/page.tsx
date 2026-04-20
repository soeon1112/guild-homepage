"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BackLink from "@/app/components/BackLink";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import { logActivity } from "@/src/lib/activity";

export default function BoardWritePage() {
  const router = useRouter();
  const { nickname, ready } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!nickname) return;
    if (!title.trim() || !content.trim()) {
      alert("제목과 내용을 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const cleanTitle = title.trim();
      const newRef = await addDoc(collection(db, "board"), {
        title: cleanTitle,
        content: content.trim(),
        nickname,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logActivity(
        "board",
        nickname,
        `정보 게시판에 새 글이 등록되었습니다: ${cleanTitle}`,
        `/board/${newRef.id}`,
      );
      router.push("/board");
    } catch {
      alert("등록에 실패했습니다.");
      setSubmitting(false);
    }
  };

  if (!ready) {
    return (
      <div className="board-content">
        <p className="board-loading">불러오는 중...</p>
      </div>
    );
  }

  if (!nickname) {
    return (
      <div className="board-content">
        <BackLink href="/board" className="back-link">
          ← 목록으로
        </BackLink>
        <h1 className="board-title">글쓰기</h1>
        <p className="login-required">로그인이 필요합니다.</p>
      </div>
    );
  }

  return (
    <div className="board-content">
      <BackLink href="/board" className="back-link">
        ← 목록으로
      </BackLink>

      <h1 className="board-title">글쓰기</h1>

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
            {submitting ? "등록 중..." : "등록"}
          </button>
          <Link href="/board" className="board-btn board-btn-cancel">
            취소
          </Link>
        </div>
      </div>
    </div>
  );
}
