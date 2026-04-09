"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BackLink from "@/app/components/BackLink";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/lib/firebase";

export default function BoardWritePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!nickname.trim() || !password.trim() || !title.trim() || !content.trim()) {
      alert("모든 항목을 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, "board"), {
        title: title.trim(),
        content: content.trim(),
        nickname: nickname.trim(),
        password: password.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      router.push("/board");
    } catch {
      alert("등록에 실패했습니다.");
      setSubmitting(false);
    }
  };

  return (
    <div className="board-content">
      <BackLink href="/board" className="back-link">
        ← 목록으로
      </BackLink>

      <h1 className="board-title">글쓰기</h1>

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
          placeholder="비밀번호 (수정/삭제 시 필요)"
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
