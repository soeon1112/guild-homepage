"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { logActivity } from "@/src/lib/activity";
import { josa, truncate } from "@/src/lib/text";
import { useDawnlight2 } from "@/src/lib/featureFlags";
import { useAuth } from "@/app/components/AuthProvider";
import { useGuilds, guildAccent } from "@/src/lib/useGuilds";
import { writableCategories } from "@/src/lib/noticePermissions";

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

export default function NoticeWritePage() {
  const router = useRouter();
  const isDawnlight2 = useDawnlight2();
  const rootClass = "board-content" + (isDawnlight2 ? " dl2-notice" : "");
  const { nickname: loginNick } = useAuth();
  const guilds = useGuilds({ includeUnion: true });
  const writable = writableCategories(loginNick, guilds);

  const [selectedCategory, setSelectedCategory] = useState<string>("");
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
    if (!selectedCategory) {
      alert("카테고리를 먼저 선택해주세요.");
      return;
    }
    if (!title.trim() || !content.trim()) {
      alert("제목과 내용을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const cleanTitle = title.trim();
      const newRef = doc(collection(db, "notice"));

      const attachments: { fileUrl: string; fileType: AttachmentType }[] = [];
      for (const p of pending) {
        const ext = p.file.name.includes(".")
          ? p.file.name.substring(p.file.name.lastIndexOf("."))
          : "";
        const filename = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}${ext}`;
        const storageRef = ref(storage, `notice/${newRef.id}/${filename}`);
        await uploadBytes(storageRef, p.file);
        const url = await getDownloadURL(storageRef);
        attachments.push({ fileUrl: url, fileType: p.fileType });
      }

      // notice/order: 카테고리 안 현재 최소 order - 1 로 맨 위 배치.
      // 기존 공지에 order 없으면 fallback (-createdAt.toMillis()) 사용.
      // 11명 비공개 길드라 카테고리당 fetch 비용 무관.
      let minOrder = 0;
      try {
        const existing = await getDocs(
          query(
            collection(db, "notice"),
            where("category", "==", selectedCategory),
          ),
        );
        existing.forEach((d) => {
          const data = d.data();
          const ord =
            typeof data.order === "number"
              ? data.order
              : -(data.createdAt?.toMillis?.() ?? 0);
          if (ord < minOrder) minOrder = ord;
        });
      } catch (e) {
        console.warn("[Notice order] min lookup failed", e);
      }
      const newOrder = minOrder - 1;

      await setDoc(newRef, {
        title: cleanTitle,
        content: content.trim(),
        category: selectedCategory,
        attachments,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        order: newOrder,
      });
      const selectedGuildName =
        guilds.find((g) => g.id === selectedCategory)?.name ?? "";
      const actPrefix = selectedGuildName
        ? `[공지·${selectedGuildName}]`
        : "공지";
      await logActivity(
        "notice",
        loginNick ?? "관리자",
        `${actPrefix} '${truncate(cleanTitle, 15)}'${josa(cleanTitle, "이/가")} 올라왔어요`,
        `/notice/${newRef.id}`,
        `notice/${newRef.id}`,
      );
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      router.push(`/notice/${newRef.id}`);
    } catch (e) {
      console.error(e);
      alert("등록에 실패했습니다.");
      setSubmitting(false);
    }
  };

  // 권한 가드 — 작성 가능한 카테고리 0개면 차단
  if (!loginNick || writable.length === 0) {
    return (
      <div className={rootClass}>
        {isDawnlight2 ? (
          <header className="dl2-notice-page-head">
            <h1 className="dl2-notice-page-title">공지 작성</h1>
            <p className="dl2-notice-page-sub">WRITE NOTICE</p>
          </header>
        ) : (
          <h1 className="board-title">공지 작성</h1>
        )}
        <p style={{ padding: "2rem 0", color: "rgba(255,255,255,0.7)" }}>
          작성 권한이 없습니다.
        </p>
        <Link href="/notice" className="board-btn board-btn-cancel">
          돌아가기
        </Link>
      </div>
    );
  }

  // 카테고리 선택 stage — 작성 가능한 카테고리가 여러 개거나 미선택
  if (!selectedCategory) {
    return (
      <div className={rootClass}>
        {isDawnlight2 ? (
          <header className="dl2-notice-page-head">
            <h1 className="dl2-notice-page-title">공지 작성</h1>
            <p className="dl2-notice-page-sub">SELECT CATEGORY</p>
          </header>
        ) : (
          <h1 className="board-title">공지 작성</h1>
        )}
        <p style={{ margin: "1rem 0", color: "rgba(255,255,255,0.7)" }}>
          카테고리를 선택해주세요.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {writable.map((g) => {
            const gTone = guildAccent(g.id, g.isUnion);
            const accent = gTone.rgb;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedCategory(g.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "12px 16px",
                  background: `rgba(${accent}, 0.12)`,
                  border: `1px solid rgba(${accent}, 0.35)`,
                  borderRadius: 10,
                  color: gTone.hex,
                  fontFamily:
                    "'Pretendard Variable', Pretendard, 'Noto Sans KR', sans-serif",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 3,
                    height: 14,
                    background: gTone.hex,
                    borderRadius: 2,
                  }}
                />
                {g.name}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: "1rem" }}>
          <Link href="/notice" className="board-btn board-btn-cancel">
            취소
          </Link>
        </div>
      </div>
    );
  }

  const selectedGuild = guilds.find((g) => g.id === selectedCategory);
  const selectedAccent = selectedGuild
    ? guildAccent(selectedGuild.id, selectedGuild.isUnion).hex
    : "#ffc785";

  return (
    <div className={rootClass}>
      {isDawnlight2 ? (
        <header className="dl2-notice-page-head">
          <h1 className="dl2-notice-page-title">공지 작성</h1>
          <p className="dl2-notice-page-sub">WRITE NOTICE</p>
        </header>
      ) : (
        <h1 className="board-title">공지 작성</h1>
      )}

      <p
        style={{
          margin: "0 0 1rem",
          padding: "8px 12px",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
          color: "rgba(255,255,255,0.85)",
          fontSize: "13px",
        }}
      >
        카테고리:{" "}
        <strong style={{ color: selectedAccent }}>
          {selectedGuild?.name ?? selectedCategory}
        </strong>
        {writable.length > 1 && (
          <button
            type="button"
            onClick={() => setSelectedCategory("")}
            style={{
              marginLeft: "0.8rem",
              padding: "2px 10px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 999,
              color: "rgba(255,255,255,0.7)",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            변경
          </button>
        )}
      </p>

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
          <Link href="/notice" className="board-btn board-btn-cancel">
            취소
          </Link>
        </div>
      </div>
    </div>
  );
}
