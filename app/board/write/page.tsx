"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import { useDawnlight2 } from "@/src/lib/featureFlags";
import { logActivity } from "@/src/lib/activity";
import { addPoints } from "@/src/lib/points";
import { handleEvent } from "@/src/lib/badgeCheck";
import { josa, truncate } from "@/src/lib/text";

type AttachmentType = "image" | "video" | "gif";

type PendingFile = {
  key: string;
  file: File;
  fileType: AttachmentType;
  previewUrl: string;
};

function detectFileType(file: File): AttachmentType {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/") || name.endsWith(".mp4")) return "video";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  return "image";
}

export default function BoardWritePage() {
  const router = useRouter();
  const { nickname, ready } = useAuth();
  const isDawnlight2 = useDawnlight2();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleFilesSelected = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const added: PendingFile[] = Array.from(list).map((file) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      fileType: detectFileType(file),
      previewUrl: URL.createObjectURL(file),
    }));
    setPending((prev) => [...prev, ...added]);
  };

  const removePending = (key: string) => {
    setPending((prev) => {
      const target = prev.find((p) => p.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  };

  const handleSubmit = async () => {
    if (!nickname) return;
    if (!title.trim() || !content.trim()) {
      alert("제목과 내용을 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const cleanTitle = title.trim();
      const newRef = doc(collection(db, "board"));

      const attachments: { fileUrl: string; fileType: AttachmentType }[] = [];
      for (const p of pending) {
        const ext = p.file.name.includes(".")
          ? p.file.name.substring(p.file.name.lastIndexOf("."))
          : "";
        const filename = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}${ext}`;
        const storageRef = ref(storage, `board/${newRef.id}/${filename}`);
        await uploadBytes(storageRef, p.file);
        const url = await getDownloadURL(storageRef);
        attachments.push({ fileUrl: url, fileType: p.fileType });
      }

      await setDoc(newRef, {
        title: cleanTitle,
        content: content.trim(),
        nickname,
        attachments,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logActivity(
        "board",
        nickname,
        `게시글 '${truncate(cleanTitle, 15)}'${josa(cleanTitle, "이/가")} 올라왔어요`,
        `/board/${newRef.id}`,
        `board/${newRef.id}`,
      );
      await addPoints(nickname, "게시글", 2, `게시판 글 작성: ${cleanTitle}`);
      handleEvent({ type: "post", nickname, when: new Date() });
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      router.push("/board");
    } catch (e) {
      console.error(e);
      alert("등록에 실패했습니다.");
      setSubmitting(false);
    }
  };

  const rootClass =
    "board-content" + (isDawnlight2 ? " dawnlight2 dl2-board" : "");
  const renderHead = () =>
    isDawnlight2 ? (
      <header className="dl2-board-page-head">
        <h1 className="dl2-board-page-title">게시글 작성</h1>
        <p className="dl2-board-page-sub">WRITE POST</p>
      </header>
    ) : (
      <h1 className="board-title">글쓰기</h1>
    );

  if (!ready) {
    return (
      <div className={rootClass}>
        <p className="board-loading">불러오는 중...</p>
      </div>
    );
  }

  if (!nickname) {
    return (
      <div className={rootClass}>
        {renderHead()}
        <p className="login-required">로그인이 필요합니다.</p>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      {renderHead()}

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

        <div className="board-attach">
          <label className="board-attach-label">
            <span className="board-attach-label-text">첨부파일 (이미지/GIF/MP4, 여러 개 가능)</span>
            <input
              type="file"
              className="board-attach-input"
              accept="image/*,video/mp4,.gif"
              multiple
              onChange={(e) => {
                handleFilesSelected(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {pending.length > 0 && (
            <ul className="board-attach-list">
              {pending.map((p) => (
                <li key={p.key} className="board-attach-item">
                  {p.fileType === "video" ? (
                    <video
                      src={p.previewUrl}
                      className="board-attach-preview"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={p.previewUrl}
                      alt={p.file.name}
                      className="board-attach-preview"
                    />
                  )}
                  <span className="board-attach-name">{p.file.name}</span>
                  <button
                    type="button"
                    className="board-attach-remove"
                    onClick={() => removePending(p.key)}
                    aria-label="첨부 제거"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

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
