"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Camera, Send, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
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
import { useAuth } from "@/app/components/AuthProvider";
import NicknameLink from "@/app/components/NicknameLink";
import { CommentImageView } from "@/app/components/CommentImage";
import { formatSmart } from "@/src/lib/formatSmart";
import { handleEvent } from "@/src/lib/badgeCheck";

type ChatFileType = "image" | "gif" | "video";

type ChatMessage = {
  id: string;
  nickname: string;
  message: string;
  imageUrl?: string;
  fileType?: ChatFileType;
  createdAt: Timestamp | null;
};

const LAST_READ_KEY = "chat:lastRead";

function formatTime(ts: Timestamp | null): string {
  if (!ts) return "";
  return formatSmart(ts.toDate());
}

function detectFileType(file: File): ChatFileType {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/") || name.endsWith(".mp4")) return "video";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  return "image";
}

/** v0's chat-bubble SVG (kept verbatim from floating-chat.tsx). */
function ChatIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 18 L4 7 Q 4 5 6 5 L 18 5 Q 20 5 20 7 L 20 14 Q 20 16 18 16 L 9 16 L 4 20 Z" />
      <circle cx="9" cy="10.5" r="0.8" fill="currentColor" />
      <circle cx="12" cy="10.5" r="0.8" fill="currentColor" />
      <circle cx="15" cy="10.5" r="0.8" fill="currentColor" />
    </svg>
  );
}

/** Decorative twinkle particles around the button when unread messages exist. */
function TwinkleParticles() {
  const particles = [
    { left: -6, top: 6, size: 4, delay: 0 },
    { left: 58, top: 14, size: 5, delay: 0.5 },
    { left: 6, top: 54, size: 4, delay: 1.1 },
  ];
  return (
    <>
      {particles.map((p, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            background: "#FFE5C4",
            filter: `drop-shadow(0 0 ${p.size + 2}px #FFE5C4)`,
            animation: `twinkle 2s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </>
  );
}

type MessageItemProps = {
  m: ChatMessage;
  mine: boolean;
};

const MessageItem = memo(
  function MessageItem({ m, mine }: MessageItemProps) {
    return (
      <div
        className={`flex flex-col gap-1 py-1.5 ${mine ? "items-end" : "items-start"}`}
      >
        <div
          className={`flex items-center gap-2 px-1 font-serif text-[9px] tracking-wider ${
            mine ? "flex-row-reverse" : ""
          }`}
        >
          <NicknameLink nickname={m.nickname} className="text-stardust" />
          <span className="text-text-sub">{formatTime(m.createdAt)}</span>
        </div>
        {m.message && (
          <div
            className="wrap-anywhere max-w-[82%] rounded-2xl px-3 py-2 font-serif text-[12px] leading-relaxed backdrop-blur-sm"
            style={
              mine
                ? {
                    background:
                      "linear-gradient(135deg, rgba(255,229,196,0.22), rgba(255,181,167,0.18))",
                    border: "1px solid rgba(255,181,167,0.4)",
                    color: "#f4efff",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                  }
                : {
                    background: "rgba(26,15,61,0.7)",
                    border: "1px solid rgba(216,150,200,0.25)",
                    color: "#f4efff",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                  }
            }
          >
            {m.message}
          </div>
        )}
        {m.imageUrl && (
          <div
            className="max-w-[82%] overflow-hidden rounded-xl"
            style={{
              border: "1px solid rgba(216,150,200,0.25)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            }}
          >
            {m.fileType === "video" ? (
              <video
                src={m.imageUrl}
                controls
                playsInline
                className="block max-h-[220px] w-full"
              />
            ) : (
              <CommentImageView url={m.imageUrl} />
            )}
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.mine === next.mine &&
    prev.m.id === next.m.id &&
    prev.m.message === next.m.message &&
    prev.m.imageUrl === next.m.imageUrl &&
    prev.m.fileType === next.m.fileType &&
    prev.m.nickname === next.m.nickname &&
    prev.m.createdAt?.toMillis() === next.m.createdAt?.toMillis(),
);

export default function FloatingChat() {
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
  const contentRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  // Sentinel div at the end of the message list — scrollIntoView target.
  // Cheaper and more reliable on mobile than scrollTop=scrollHeight when the
  // panel/keyboard are mid-animation, since the browser does the geometry math.
  const endRef = useRef<HTMLDivElement | null>(null);

  // Debug helper — enable with `localStorage.setItem("chat:debug","1")` in
  // the console. Each pin attempt logs scrollTop/scrollHeight so we can see
  // which frame actually settled on the latest message.
  const debugLog = (label: string) => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem("chat:debug") !== "1") return;
    } catch {
      return;
    }
    const list = listRef.current;
    if (!list) {
      // eslint-disable-next-line no-console
      console.log(`[chat-scroll] ${label} — list ref missing`);
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[chat-scroll] ${label}`, {
      scrollTop: list.scrollTop,
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight,
      distanceFromBottom:
        list.scrollHeight - list.scrollTop - list.clientHeight,
      messages: messages.length,
    });
  };

  // Subscribe to the guild chat collection (last 50 messages, asc for display)
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

  // Unread count — excludes own messages, only counted when panel is closed
  const unreadCount = useMemo(() => {
    if (open) return 0;
    return messages.filter((m) => {
      if (!m.createdAt) return false;
      if (nickname && m.nickname === nickname) return false;
      return m.createdAt.toMillis() > lastReadMs;
    }).length;
  }, [messages, open, nickname, lastReadMs]);

  const hasUnread = unreadCount > 0;

  // Auto-pin the message list to the latest message.
  //
  // Runs whenever the panel opens OR messages change (new send/receive via
  // onSnapshot). Double RAF lets layout settle after React commits; the
  // ResizeObserver catches late image/video loads inflating scrollHeight.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const content = contentRef.current;
    if (!list) return;

    const pin = (label: string) => {
      const end = endRef.current;
      if (end) {
        end.scrollIntoView({ block: "end", behavior: "auto" });
      } else {
        const l = listRef.current;
        if (l) l.scrollTop = l.scrollHeight;
      }
      debugLog(label);
    };

    debugLog("effect-start");
    pin("sync");

    const raf1 = requestAnimationFrame(() => {
      pin("raf1");
    });
    let raf2Inner = 0;
    const raf2 = requestAnimationFrame(() => {
      raf2Inner = requestAnimationFrame(() => pin("raf2"));
    });

    // Catch-all for image/video lazy loads inflating scrollHeight.
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => pin("resize"))
        : null;
    if (ro && content) ro.observe(content);

    // Auto-focus only on devices with a real pointer (desktop). On touch,
    // popping the virtual keyboard on open shifts the viewport and makes the
    // list scroll jump upward while the keyboard animates in.
    const canAutoFocus =
      typeof window !== "undefined" &&
      !!window.matchMedia &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (canAutoFocus) {
      requestAnimationFrame(() => {
        messageInputRef.current?.focus({ preventScroll: true });
      });
    }
    // Note: this initial-open auto-focus is intentionally desktop-only. On
    // mobile, popping the keyboard the moment the panel opens makes the
    // viewport jump while framer-motion is still animating — instead the
    // user taps the input themselves. Once focused, we keep the focus
    // through send (see handleSend + the input's lack of disabled).

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (raf2Inner) cancelAnimationFrame(raf2Inner);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, messages.length]);

  // One extra pin after framer-motion's enter animation settles. On mobile
  // this is the first frame where the panel's scale/opacity are final, which
  // is the most reliable frame if earlier pins were fighting the animation.
  const handlePanelAnimationComplete = () => {
    if (!open) return;
    endRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
    debugLog("animation-complete");
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
      debugLog("animation-complete+raf");
    });
  };

  // Revoke blob URL on file change
  useEffect(() => {
    if (!filePreview) return;
    return () => URL.revokeObjectURL(filePreview);
  }, [filePreview]);

  // Escape closes the panel (but page remains fully interactive while open)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        markRead();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
    if (sending) return;
    const text = draft.trim();
    const pendingFile = file;
    if (!text && !pendingFile) return;

    setDraft("");
    setFile(null);
    setSending(true);
    // Re-focus inside the user-gesture frame so iOS keeps the soft keyboard
    // open. preventScroll avoids the document jumping on focus.
    messageInputRef.current?.focus({ preventScroll: true });

    try {
      let imageUrl = "";
      let fileType: ChatFileType | undefined;
      if (pendingFile) {
        fileType = detectFileType(pendingFile);
        const safeName = pendingFile.name.replace(/[^\w.\-]/g, "_");
        const path = `chat/${Date.now()}_${safeName}`;
        const r = ref(storage, path);
        await uploadBytes(r, pendingFile);
        imageUrl = await getDownloadURL(r);
      }
      await addDoc(collection(db, "chat"), {
        nickname,
        message: text,
        imageUrl,
        fileType: fileType ?? "",
        createdAt: serverTimestamp(),
      });
      handleEvent({
        type: "chat",
        nickname,
        when: new Date(),
        totalChatCountBeforeThis: messages.length,
      });
    } catch (e) {
      console.error(e);
      alert("메시지 전송에 실패했습니다.");
      setDraft(text);
      setFile(pendingFile);
    }
    setSending(false);
    messageInputRef.current?.focus({ preventScroll: true });
  };

  const openPanel = () => {
    markRead();
    setOpen(true);
  };

  const closePanel = () => {
    markRead();
    setOpen(false);
  };

  return (
    <>
      {/* Floating button — fades out when the panel is open (panel replaces it visually) */}
      <motion.button
        type="button"
        onClick={openPanel}
        aria-label={
          hasUnread
            ? `길드 채팅 열기, 새 메시지 ${unreadCount}건`
            : "길드 채팅 열기"
        }
        animate={{
          opacity: open ? 0 : 1,
          scale: open ? 0.7 : 1,
          x: hasUnread && !open ? [0, -3, 3, -2, 2, 0] : [0],
        }}
        transition={{
          opacity: { duration: 0.2, ease: "easeOut" },
          scale: { duration: 0.2, ease: "easeOut" },
          x:
            hasUnread && !open
              ? {
                  duration: 0.45,
                  repeat: Number.POSITIVE_INFINITY,
                  repeatDelay: 0.55,
                  ease: "easeInOut",
                }
              : { duration: 0.2 },
        }}
        style={{
          pointerEvents: open ? "none" : "auto",
        }}
        className="group fixed right-4 bottom-24 z-50 flex h-14 w-14 items-center justify-center rounded-full"
      >
        {/* Pulse ring — soft aura */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: hasUnread
              ? "radial-gradient(circle, rgba(216,150,200,0.9) 0%, rgba(255,181,167,0.5) 45%, transparent 75%)"
              : "radial-gradient(circle, rgba(255,181,167,0.4) 0%, transparent 70%)",
            animation: hasUnread
              ? "pulse-ring 0.8s cubic-bezier(0,0,0.2,1) infinite"
              : "pulse-ring 2.4s cubic-bezier(0,0,0.2,1) infinite",
          }}
        />
        {/* Pulse ring — border */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border"
          style={{
            borderColor: hasUnread
              ? "rgba(216,150,200,1)"
              : "rgba(255,181,167,0.6)",
            animation: hasUnread
              ? "pulse-ring 0.8s cubic-bezier(0,0,0.2,1) -0.3s infinite"
              : "pulse-ring 2.4s cubic-bezier(0,0,0.2,1) -0.8s infinite",
          }}
        />
        {/* Extra offset ring — only when unread, layered glow */}
        {hasUnread && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border"
            style={{
              borderColor: "rgba(255,229,196,0.9)",
              animation: "pulse-ring 1s cubic-bezier(0,0,0.2,1) -0.5s infinite",
            }}
          />
        )}

        {/* Twinkle particles — only when unread */}
        {hasUnread && <TwinkleParticles />}

        {/* Main round button */}
        <span
          className="relative flex h-12 w-12 items-center justify-center rounded-full text-abyss transition-transform group-hover:scale-105"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, #FFE5C4 0%, #FFB5A7 55%, #D896C8 100%)",
            boxShadow: hasUnread
              ? "0 8px 36px rgba(216,150,200,0.75), 0 0 56px rgba(255,181,167,0.7), 0 0 80px rgba(216,150,200,0.45), inset 0 1px 2px rgba(255,255,255,0.5)"
              : "0 8px 24px rgba(255,181,167,0.45), 0 0 24px rgba(216,150,200,0.5), inset 0 1px 2px rgba(255,255,255,0.4)",
          }}
        >
          <ChatIcon size={22} />
        </span>

        {/* Unread badge — number with gentle float */}
        {hasUnread && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -right-1 -top-1 flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1 font-serif text-[10px] font-bold leading-none text-abyss-deep"
            style={{
              background: "linear-gradient(135deg, #FFB5A7 0%, #D896C8 100%)",
              boxShadow:
                "0 0 10px rgba(255,181,167,0.95), 0 0 18px rgba(216,150,200,0.75), 0 0 30px rgba(216,150,200,0.5), 0 0 44px rgba(255,181,167,0.35)",
              border: "2px solid rgba(255,255,255,0.95)",
            }}
            animate={{ y: [0, -3, 0] }}
            transition={{
              duration: 1.2,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </motion.span>
        )}

        {/* Tooltip */}
        <span className="pointer-events-none absolute right-16 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-peach-accent/40 bg-abyss/80 px-2.5 py-1 font-serif text-[10px] tracking-wider text-stardust opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100">
          {hasUnread ? `새 메시지 ${unreadCount}건` : "길드 채팅"}
        </span>
      </motion.button>

      {/* Corner panel — messenger style, no backdrop, page stays interactive */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed right-4 bottom-24 z-50 flex flex-col overflow-hidden rounded-2xl"
            style={{
              width: "min(380px, calc(100vw - 2rem))",
              height: "min(500px, calc(100vh - 7rem))",
              background: "rgba(26,15,61,0.94)",
              border: "1px solid rgba(216,150,200,0.3)",
              boxShadow:
                "0 12px 40px rgba(0,0,0,0.55), 0 0 40px rgba(107,75,168,0.35)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
            }}
            initial={{ y: 20, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onAnimationComplete={handlePanelAnimationComplete}
            role="dialog"
            aria-label="길드 채팅"
          >
            {/* Nebula glow decorations */}
            <span
              aria-hidden
              className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(216,150,200,0.28) 0%, transparent 65%)",
                filter: "blur(28px)",
              }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-12 -left-12 h-44 w-44 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(107,75,168,0.3) 0%, transparent 65%)",
                filter: "blur(32px)",
              }}
            />

            {/* Header */}
            <div className="relative flex shrink-0 items-center justify-between border-b border-nebula-pink/20 px-4 py-3">
              <h3
                className="leading-none"
                style={{
                  fontFamily: "'Noto Serif KR', serif",
                  fontSize: "15px",
                  fontWeight: 400,
                  letterSpacing: "0.06em",
                  backgroundImage:
                    "linear-gradient(135deg, #FFE5C4, #D896C8, #6B4BA8)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  color: "transparent",
                  filter: "drop-shadow(0 0 8px rgba(216,150,200,0.4))",
                }}
              >
                길드 채팅
              </h3>
              <button
                type="button"
                onClick={closePanel}
                aria-label="닫기"
                className="flex h-7 w-7 items-center justify-center rounded-full text-stardust transition-colors hover:bg-nebula-pink/20"
                style={{
                  background: "rgba(11,8,33,0.5)",
                  border: "1px solid rgba(216,150,200,0.3)",
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Messages list — vertical scroll only, no horizontal */}
            <div
              ref={listRef}
              className="nebula-scroll relative flex-1 overflow-y-auto overflow-x-hidden px-3 py-2"
            >
              <div ref={contentRef}>
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="font-serif text-[12px] italic text-text-sub/70">
                      아직 채팅이 없어요
                    </p>
                  </div>
                ) : (
                  messages.map((m) => (
                    <MessageItem
                      key={m.id}
                      m={m}
                      mine={!!nickname && m.nickname === nickname}
                    />
                  ))
                )}
                <div ref={endRef} aria-hidden />
              </div>
            </div>

            {/* Compose area / auth gate */}
            {!ready ? (
              <div className="shrink-0 border-t border-nebula-pink/20 px-4 py-4 text-center font-serif text-[11px] italic text-text-sub">
                불러오는 중...
              </div>
            ) : nickname ? (
              <div className="relative shrink-0 border-t border-nebula-pink/20 px-3 py-3">
                {/* File preview */}
                {file && filePreview && (
                  <div className="mb-2 flex items-center gap-2 overflow-hidden rounded-xl border border-nebula-pink/20 bg-abyss/50 p-2 backdrop-blur-sm">
                    {detectFileType(file) === "video" ? (
                      <video
                        src={filePreview}
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={filePreview}
                        alt={file.name}
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate font-serif text-[10px] text-text-sub">
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      aria-label="첨부 제거"
                      disabled={sending}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-stardust transition-colors hover:bg-nebula-pink/20 disabled:opacity-50"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Input row */}
                <div className="flex items-center gap-1.5">
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
                    onClick={pickFile}
                    disabled={sending}
                    aria-label={file ? "첨부 제거" : "파일 첨부"}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-abyss/50 text-stardust backdrop-blur-sm transition-all disabled:opacity-50 ${
                      file
                        ? "border-peach-accent/70 text-peach-accent"
                        : "border-nebula-pink/30 hover:border-nebula-pink/60"
                    }`}
                  >
                    <Camera className="h-4 w-4" />
                  </button>

                  <input
                    ref={messageInputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="메시지를 입력하세요"
                    aria-busy={sending}
                    className="min-w-0 flex-1 rounded-full border border-nebula-pink/30 bg-abyss/50 px-3 py-2 font-serif text-[12px] text-text-primary placeholder:text-text-sub/70 backdrop-blur-sm focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30"
                  />

                  <button
                    type="button"
                    // preventDefault on pointer-down stops the button from
                    // stealing focus (and thereby dismissing the mobile
                    // keyboard) when the user taps Send.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleSend}
                    disabled={sending || (!draft.trim() && !file)}
                    aria-label="메시지 전송"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-abyss-deep transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      background:
                        "linear-gradient(135deg, #FFE5C4, #FFB5A7, #D896C8)",
                      boxShadow: "0 0 12px rgba(255,181,167,0.5)",
                    }}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="shrink-0 border-t border-nebula-pink/20 px-4 py-4 text-center font-serif text-[11px] italic text-text-sub">
                로그인이 필요합니다
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
