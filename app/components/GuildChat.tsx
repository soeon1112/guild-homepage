"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, MessageCircle } from "lucide-react";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { useAuth } from "./AuthProvider";
import NicknameLink from "./NicknameLink";
import { CommentImageView } from "./CommentImage";

type ChatFileType = "image" | "gif" | "video";

type ChatMessage = {
  id: string;
  nickname: string;
  message: string;
  imageUrl?: string;
  fileType?: ChatFileType;
  createdAt: Timestamp | null;
};

function formatTime(ts: Timestamp | null): string {
  if (!ts) return "";
  const d = ts.toDate();
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return `${hh}:${mm}`;
  }
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  return `${M}/${D} ${hh}:${mm}`;
}

function detectFileType(file: File): ChatFileType {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/") || name.endsWith(".mp4")) return "video";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  return "image";
}

const LAST_READ_KEY = "chat:lastRead";

export default function GuildChat() {
  const { nickname, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [lastReadMs, setLastReadMs] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try {
      return Number(localStorage.getItem(LAST_READ_KEY)) || 0;
    } catch {
      return 0;
    }
  });

  const filePreview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, "chat"),
      orderBy("createdAt", "desc"),
      limit(50),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: ChatMessage[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          nickname: data.nickname,
          message: data.message,
          imageUrl: data.imageUrl || "",
          fileType: (data.fileType as ChatFileType | undefined) || undefined,
          createdAt: data.createdAt ?? null,
        };
      });
      list.reverse();
      setMessages(list);
    });
    return unsub;
  }, []);

  const markRead = () => {
    const now = Date.now();
    setLastReadMs(now);
    try {
      localStorage.setItem(LAST_READ_KEY, String(now));
    } catch {}
  };

  const hasUnread =
    !open &&
    messages.some((m) => {
      if (!m.createdAt) return false;
      if (nickname && m.nickname === nickname) return false;
      return m.createdAt.toMillis() > lastReadMs;
    });

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (!filePreview) return;
    return () => URL.revokeObjectURL(filePreview);
  }, [filePreview]);

  const pickFile = () => {
    if (sending) return;
    if (file) {
      setFile(null);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleSend = async () => {
    if (!nickname) return;
    const text = draft.trim();
    if (!text && !file) return;
    setSending(true);
    try {
      let imageUrl = "";
      let fileType: ChatFileType | undefined;
      if (file) {
        fileType = detectFileType(file);
        const safeName = file.name.replace(/[^\w.\-]/g, "_");
        const path = `chat/${Date.now()}_${safeName}`;
        const r = ref(storage, path);
        await uploadBytes(r, file);
        imageUrl = await getDownloadURL(r);
      }
      await addDoc(collection(db, "chat"), {
        nickname,
        message: text,
        imageUrl,
        fileType: fileType ?? "",
        createdAt: serverTimestamp(),
      });
      setDraft("");
      setFile(null);
    } catch (e) {
      console.error(e);
      alert("메시지 전송에 실패했습니다.");
    }
    setSending(false);
  };

  return (
    <>
      <button
        type="button"
        className="guild-chat-toggle"
        onClick={() => {
          setOpen((o) => {
            const next = !o;
            if (next) markRead();
            else markRead();
            return next;
          });
        }}
        aria-label={open ? "채팅 닫기" : "채팅 열기"}
      >
        <MessageCircle size={26} />
        {hasUnread && <span className="guild-chat-badge">N</span>}
      </button>

      {open && (
        <div className="guild-chat-panel">
          <div className="guild-chat-header">
            <h3 className="guild-chat-title">길드 채팅</h3>
            <button
              type="button"
              className="guild-chat-close"
              onClick={() => {
                setOpen(false);
                markRead();
              }}
              aria-label="닫기"
            >
              ×
            </button>
          </div>
          <div className="guild-chat-list" ref={listRef}>
            {messages.map((m) => {
              const mine = !!nickname && m.nickname === nickname;
              return (
                <div
                  key={m.id}
                  className={
                    "guild-chat-item" +
                    (mine ? " guild-chat-item-mine" : "")
                  }
                >
                  <div className="guild-chat-meta">
                    <NicknameLink
                      nickname={m.nickname}
                      className="guild-chat-nick"
                    />
                    <span className="guild-chat-time">
                      {formatTime(m.createdAt)}
                    </span>
                  </div>
                  {m.message && (
                    <div className="guild-chat-bubble">{m.message}</div>
                  )}
                  {m.imageUrl &&
                    (m.fileType === "video" ? (
                      <video
                        src={m.imageUrl}
                        controls
                        playsInline
                        className="guild-chat-media-video"
                      />
                    ) : (
                      <CommentImageView url={m.imageUrl} />
                    ))}
                </div>
              );
            })}
          </div>
          {!ready ? (
            <div className="guild-chat-empty">불러오는 중...</div>
          ) : nickname ? (
            <div className="guild-chat-compose">
              {file && filePreview && (
                <div className="guild-chat-pending">
                  {detectFileType(file) === "video" ? (
                    <video
                      src={filePreview}
                      className="guild-chat-pending-preview"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={filePreview}
                      alt={file.name}
                      className="guild-chat-pending-preview"
                    />
                  )}
                  <span className="guild-chat-pending-name">{file.name}</span>
                  <button
                    type="button"
                    className="guild-chat-pending-remove"
                    onClick={() => setFile(null)}
                    aria-label="첨부 제거"
                    disabled={sending}
                  >
                    ×
                  </button>
                </div>
              )}
              <div className="guild-chat-form">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/mp4,.gif"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                  disabled={sending}
                />
                <button
                  type="button"
                  className={
                    "comment-attach-btn" + (file ? " has-file" : "")
                  }
                  onClick={pickFile}
                  disabled={sending}
                  aria-label={file ? "첨부 제거" : "파일 첨부"}
                  title={file ? "첨부 제거" : "파일 첨부"}
                >
                  <Camera size={18} />
                </button>
                <input
                  className="guild-chat-input"
                  placeholder="메시지를 입력하세요"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSend();
                  }}
                  disabled={sending}
                />
                <button
                  type="button"
                  className="guild-chat-send"
                  onClick={handleSend}
                  disabled={sending || (!draft.trim() && !file)}
                >
                  {sending ? "전송 중" : "전송"}
                </button>
              </div>
            </div>
          ) : (
            <div className="guild-chat-empty">로그인이 필요합니다</div>
          )}
        </div>
      )}
    </>
  );
}
