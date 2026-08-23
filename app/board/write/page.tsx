"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import { useDawnlight2 } from "@/src/lib/featureFlags";
import { logActivity } from "@/src/lib/activity";
import { addPoints } from "@/src/lib/points";
import { josa, truncate } from "@/src/lib/text";
import {
  MentionPicker,
  applyMentionInsert,
} from "@/app/components/mention/MentionPicker";
import {
  PollEditor,
  createInitialPollState,
  validatePollForm,
  type PollFormState,
} from "@/app/components/board/PollEditor";

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
  // 멘션 자동완성용 cursor 추적. content textarea 의 selectionStart.
  const [contentMentionCursor, setContentMentionCursor] = useState<
    number | null
  >(null);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // poll/p2: 투표 게시글 토글 + 폼 상태. isPoll=false 면 일반 게시글 흐름
  // 그대로 (payload 변경 0). isPoll=true 면 submit 시 type:"poll" + poll
  // 메타데이터 추가.
  const [isPoll, setIsPoll] = useState(false);
  const [pollForm, setPollForm] = useState<PollFormState>(
    createInitialPollState(),
  );

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
    // poll/p2: 투표 모드면 폼 validate.
    if (isPoll) {
      const pollErr = validatePollForm(pollForm);
      if (pollErr) {
        alert(pollErr);
        return;
      }
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

      // poll/p2: isPoll=true 일 때만 type:"poll" + poll 메타데이터 추가.
      // 일반 게시글 흐름은 payload 동일.
      const pollPayload = isPoll
        ? (() => {
            const filledOptions = pollForm.options
              .filter((o) => o.text.trim())
              .map((o, i) => ({
                id: String(i + 1),
                text: o.text.trim(),
              }));
            const meta: Record<string, unknown> = {
              question: pollForm.question.trim(),
              options: filledOptions,
              anonymous: pollForm.anonymous,
              allowChange: pollForm.allowChange,
            };
            if (pollForm.deadline) {
              // 마감일 = 해당 날짜 23:59:59 (해당 날짜 끝까지 유효).
              meta.deadline = Timestamp.fromDate(
                new Date(`${pollForm.deadline}T23:59:59`),
              );
            }
            return { type: "poll" as const, poll: meta };
          })()
        : {};

      await setDoc(newRef, {
        title: cleanTitle,
        content: content.trim(),
        nickname,
        attachments,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...pollPayload,
      });
      await logActivity(
        "board",
        nickname,
        `게시글 '${truncate(cleanTitle, 15)}'${josa(cleanTitle, "이/가")} 올라왔어요`,
        `/board/${newRef.id}`,
        `board/${newRef.id}`,
      );
      await addPoints(nickname, "게시글", 2, `게시판 글 작성: ${cleanTitle}`);
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      router.push("/board");
    } catch (e) {
      console.error(e);
      alert("등록에 실패했습니다.");
      setSubmitting(false);
    }
  };

  const rootClass =
    "board-content" + (isDawnlight2 ? " dl2-board" : "");
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
        {/* @-mention 자동완성 — textarea 위 sibling. */}
        <MentionPicker
          text={content}
          cursor={contentMentionCursor}
          onSelect={(nickname, range) => {
            const result = applyMentionInsert(
              content,
              range.start,
              range.end,
              nickname,
            );
            setContent(result.text);
            setContentMentionCursor(result.cursor);
            requestAnimationFrame(() => {
              if (contentRef.current) {
                contentRef.current.focus();
                contentRef.current.setSelectionRange(
                  result.cursor,
                  result.cursor,
                );
              }
            });
          }}
          dl2
        />
        <textarea
          ref={contentRef}
          className="board-input board-textarea"
          placeholder="내용을 입력하세요"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setContentMentionCursor(e.target.selectionStart);
          }}
          onSelect={(e) =>
            setContentMentionCursor(e.currentTarget.selectionStart)
          }
          onClick={(e) =>
            setContentMentionCursor(e.currentTarget.selectionStart)
          }
          onKeyUp={(e) =>
            setContentMentionCursor(e.currentTarget.selectionStart)
          }
          rows={10}
        />

        {/* poll/p2: 투표 토글 + 폼. 일반 게시글 흐름 영향 0. */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "8px 0",
            fontSize: 14,
            color: isDawnlight2 ? "#5c3a1f" : "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={isPoll}
            onChange={(e) => setIsPoll(e.target.checked)}
          />
          📊 투표로 만들기
        </label>
        {isPoll && (
          <PollEditor
            value={pollForm}
            onChange={setPollForm}
            isDawnlight2={isDawnlight2}
          />
        )}

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
