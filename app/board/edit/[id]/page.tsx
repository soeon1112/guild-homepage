"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import { useDawnlight2 } from "@/src/lib/featureFlags";
import {
  PollEditor,
  createInitialPollState,
  validatePollForm,
  type PollFormState,
} from "@/app/components/board/PollEditor";

type AttachmentType = "image" | "video" | "gif";

type Attachment = {
  fileUrl: string;
  fileType: AttachmentType;
};

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

export default function BoardEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { nickname: loginNick, ready } = useAuth();
  const isDawnlight2 = useDawnlight2();
  const [authorNick, setAuthorNick] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [existing, setExisting] = useState<Attachment[]>([]);
  const [removed, setRemoved] = useState<Attachment[]>([]);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // poll/p4: 투표 게시글 수정 — isPoll 식별 + 폼 상태. 시작된 투표는
  // 옵션 변경 불가 (lockOptions=true), 질문/마감일/익명/변경 가능만 수정.
  const [isPoll, setIsPoll] = useState(false);
  const [pollForm, setPollForm] = useState<PollFormState>(
    createInitialPollState(),
  );

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "board", id));
      if (snap.exists()) {
        const d = snap.data();
        setAuthorNick(d.nickname);
        setTitle(d.title);
        setContent(d.content);
        setExisting(Array.isArray(d.attachments) ? (d.attachments as Attachment[]) : []);
        // poll/p4: 투표 게시글이면 poll 메타 → pollForm 으로 복원.
        if (d.type === "poll" && d.poll) {
          const p = d.poll as {
            question?: string;
            options?: Array<{ id: string; text: string }>;
            deadline?: Timestamp;
            anonymous?: boolean;
            allowChange?: boolean;
            allowMultiple?: boolean;
          };
          let deadlineStr = "";
          if (p.deadline && typeof p.deadline.toDate === "function") {
            const dl = p.deadline.toDate();
            const y = dl.getFullYear();
            const m = String(dl.getMonth() + 1).padStart(2, "0");
            const day = String(dl.getDate()).padStart(2, "0");
            deadlineStr = `${y}-${m}-${day}`;
          }
          setIsPoll(true);
          setPollForm({
            question: p.question ?? "",
            options: Array.isArray(p.options) ? p.options : [],
            deadline: deadlineStr,
            anonymous: !!p.anonymous,
            allowChange: p.allowChange !== false,
            allowMultiple: !!p.allowMultiple,
          });
        }
      }
      setLoading(false);
    })();
  }, [id]);

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

  const removeExisting = (url: string) => {
    setExisting((prev) => {
      const target = prev.find((a) => a.fileUrl === url);
      if (target) setRemoved((r) => [...r, target]);
      return prev.filter((a) => a.fileUrl !== url);
    });
  };

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      alert("제목과 내용을 입력해주세요.");
      return;
    }
    // poll/p4: 투표 게시글이면 질문/마감일/익명/변경 가능 validate.
    // 옵션은 lockOptions=true 라 변경 불가 — 기존 options 그대로 사용.
    if (isPoll) {
      const pollErr = validatePollForm(pollForm);
      if (pollErr) {
        alert(pollErr);
        return;
      }
    }

    setSubmitting(true);
    try {
      const uploaded: Attachment[] = [];
      for (const p of pending) {
        const ext = p.file.name.includes(".")
          ? p.file.name.substring(p.file.name.lastIndexOf("."))
          : "";
        const filename = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}${ext}`;
        const storageRef = ref(storage, `board/${id}/${filename}`);
        await uploadBytes(storageRef, p.file);
        const url = await getDownloadURL(storageRef);
        uploaded.push({ fileUrl: url, fileType: p.fileType });
      }

      await Promise.all(
        removed.map(async (a) => {
          try {
            await deleteObject(ref(storage, a.fileUrl));
          } catch (e) {
            console.warn("attachment storage delete failed", e);
          }
        }),
      );

      // poll/p4: 투표 게시글이면 poll 메타 업데이트. 옵션은 기존 그대로
      // 유지 (lockOptions). 질문/마감일/익명/변경 가능만 변경.
      const pollPayload: Record<string, unknown> = {};
      if (isPoll) {
        const meta: Record<string, unknown> = {
          question: pollForm.question.trim(),
          options: pollForm.options, // 기존 그대로 보존
          anonymous: pollForm.anonymous,
          allowChange: pollForm.allowChange,
          allowMultiple: pollForm.allowMultiple,
        };
        if (pollForm.deadline) {
          const [yy, mm, dd] = pollForm.deadline.split("-").map(Number);
          if (yy && mm && dd) {
            meta.deadline = Timestamp.fromDate(
              new Date(yy, mm - 1, dd, 23, 59, 59),
            );
          }
        }
        pollPayload["poll"] = meta;
      }

      await updateDoc(doc(db, "board", id), {
        title: title.trim(),
        content: content.trim(),
        attachments: [...existing, ...uploaded],
        updatedAt: serverTimestamp(),
        ...pollPayload,
      });
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      router.push(`/board/${id}`);
    } catch (e) {
      console.error(e);
      alert("수정에 실패했습니다.");
      setSubmitting(false);
    }
  };

  const rootClass =
    "board-content" + (isDawnlight2 ? " dl2-board" : "");
  const renderHead = () =>
    isDawnlight2 ? (
      <header className="dl2-board-page-head">
        <h1 className="dl2-board-page-title">게시글 수정</h1>
        <p className="dl2-board-page-sub">EDIT POST</p>
      </header>
    ) : (
      <h1 className="board-title">글 수정</h1>
    );

  if (loading || !ready) {
    return (
      <div className={rootClass}>
        <p className="board-loading">불러오는 중...</p>
      </div>
    );
  }

  if (authorNick === null) {
    return (
      <div className={rootClass}>
        <p className="board-loading">존재하지 않는 게시글입니다.</p>
      </div>
    );
  }

  if (!loginNick || loginNick !== authorNick) {
    return (
      <div className={rootClass}>
        <p className="login-required">작성자만 수정할 수 있습니다.</p>
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

        {/* poll/p4: 투표 게시글이면 PollEditor 표시 (lockOptions=true).
            옵션 변경 불가, 질문/마감일/익명/변경 가능만 수정. */}
        {isPoll && (
          <PollEditor
            value={pollForm}
            onChange={setPollForm}
            isDawnlight2={isDawnlight2}
            lockOptions
          />
        )}

        <div className="board-attach">
          <label className="board-attach-label">
            <span className="board-attach-label-text">첨부파일 추가 (이미지/GIF/MP4)</span>
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
          {(existing.length > 0 || pending.length > 0) && (
            <ul className="board-attach-list">
              {existing.map((a) => (
                <li key={a.fileUrl} className="board-attach-item">
                  {a.fileType === "video" ? (
                    <video
                      src={a.fileUrl}
                      className="board-attach-preview"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={a.fileUrl}
                      alt=""
                      className="board-attach-preview"
                    />
                  )}
                  <span className="board-attach-name">기존 첨부</span>
                  <button
                    type="button"
                    className="board-attach-remove"
                    onClick={() => removeExisting(a.fileUrl)}
                    aria-label="첨부 제거"
                  >
                    ×
                  </button>
                </li>
              ))}
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
