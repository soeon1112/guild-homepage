"use client";

import { type Timestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Camera, Plus, Send, Smile, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { MessageText } from "@/app/components/MessageText";
import { Dawnlight2BottomNav } from "@/app/components/dawnlight2/BottomNav";
import { LinkPreviewCard } from "@/app/components/LinkPreviewCard";
import { EmoticonPicker } from "@/app/components/EmoticonPicker";
import { ImageGallery } from "@/app/components/ImageGallery";
import { GalleryViewer } from "@/app/components/GalleryViewer";
import { useMemberAvatars } from "@/src/lib/useMemberAvatars";
import { useChatReactions, type MessageReactions } from "@/src/lib/useChatReactions";
import { getEmoticonUrl } from "@/src/lib/emoticons";
import { MAX_IMAGES_PER_MESSAGE } from "@/src/lib/dm";
import { storage } from "@/src/lib/firebase";
import {
  VOICE_CHAT_COLLECTION,
  sendVoiceChatMessage,
  subscribeVoiceChatMessages,
  type VoiceChatMessageRow,
} from "@/src/lib/voiceChat";

// 보이스방 전용 채팅(voiceRoomChat, 플랫 컬렉션 — 통화방 하나뿐이라 DM
// 같은 room 문서 개념 없음). Firestore 스키마/구독/전송은
// src/lib/voiceChat.ts(subscribeVoiceChatMessages/sendVoiceChatMessage)에
// 있고 이 파일은 그걸 쓰는 렌더 전용. app/dm/[roomId]/page.tsx와 같은
// 전략: "MessageItem 재사용"은 문자 그대로 못 한다 — 실제 렌더 로직이
// NewHomeChat.tsx(그 자체가 "기존 채팅 시스템", 미접촉 대상) 안에 export
// 없이 inline으로만 있어서다. 그 파일 대신 진짜로 import(=재사용)하는
// 것: MessageText, LinkPreviewCard, EmoticonPicker, ImageGallery,
// GalleryViewer, useChatReactions(3번째 인자로 collectionRoot="voiceRoomChat"
// 교체), useMemberAvatars, getEmoticonUrl. 렌더 JSX/전송 로직 자체는
// dm/[roomId]/page.tsx를 본떠 새로 작성(그 파일도 같은 방식으로 만들어진
// 전례라 재사용).
//
// DM과 다른 점:
//   - room/partner 개념 없음 — 그룹 채팅이라 항상 voiceRoomChat 플랫
//     컬렉션 하나.
//   - subscribeVoiceChatMessages가 Firestore 레벨 limit(50) 사용(DM은
//     room당 메시지 수가 적어 전체 구독 후 클라이언트 slice(0,50)해도
//     무리 없지만, voiceRoomChat은 통화 종료 후에도 유지되는 전역 단일
//     컬렉션이라 시간이 지날수록 문서 수가 계속 늘어난다 — 서버 사이드
//     limit로 구독 비용을 고정).
//   - 별빛 적립 + 링크 프리뷰는 functions/src/triggers/voiceChat.ts
//     (onVoiceChatMessageCreated)가 처리 — chat.ts 트리거는 완전 미접촉.
//   - push 알림 없음(통화 중인 사람만 보는 채팅이라 비참가자에게 알림 X).
//   - MemberAvatar.tsx를 그대로 쓰지 않는다 — 그 컴포넌트는 프사 클릭 시
//     /dm으로 라우팅하는 전역 동작이 있어서, 통화 중 채팅에서 상대 프사를
//     눌렀다가 페이지가 이동하면 VoiceRoom의 unmount cleanup이 조용히
//     통화를 끊어버린다. 그래서 클릭 불가능한 프사를 인라인으로 그린다.

const INK_ON_DARK = "#fef5e6";
const INK_SOFT_ON_DARK = "rgba(254, 245, 230, 0.6)";
const CHAT_REACTION_EMOJIS = ["❤️", "😂", "😢", "👍", "🎉", "😮"] as const;
const AVATAR_SIZE = 28;

type ReplyTarget = {
  id: string;
  nickname: string;
  message: string;
  fileType?: "image" | "sticker";
  imageUrl?: string;
};

// Firestore가 addDoc 직후 아직 서버 확정 전인 로컬 스냅샷에선
// serverTimestamp() placeholder가 null로 온다 — voiceChat.ts의
// VoiceChatMessage.createdAt 타입은 non-null이지만 런타임은 그렇지
// 않을 수 있어(DM 원본도 동일 사유로 ts를 nullable로 뒀음) 방어적으로
// null/undefined 둘 다 받는다.
function formatTime(ts: Timestamp | null | undefined): string {
  if (!ts) return "";
  const date = ts.toDate();
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "방금 전";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}시간 전`;
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${m}.${d}`;
}

export function VoiceChatPanel({ me }: { me: string }) {
  const [messages, setMessages] = useState<VoiceChatMessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState<{ uri: string; name: string; raw: File } | null>(null);
  const [imageFiles, setImageFiles] = useState<{ uri: string; name: string; raw: File }[]>([]);
  const [isEmoticonOpen, setIsEmoticonOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null);
  const [actionMenuFor, setActionMenuFor] = useState<VoiceChatMessageRow | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = subscribeVoiceChatMessages((rows) => {
      setMessages(rows);
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      });
    });
    return unsub;
  }, []);

  const senders = useMemo(() => Array.from(new Set(messages.map((m) => m.data.nickname))), [messages]);
  const avatars = useMemberAvatars(senders);

  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const { reactions, toggleReaction } = useChatReactions(messageIds, me, VOICE_CHAT_COLLECTION);

  const handlePickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    if (picked.length > 1) {
      const files = picked.slice(0, MAX_IMAGES_PER_MESSAGE);
      if (picked.length > MAX_IMAGES_PER_MESSAGE) {
        alert(`최대 ${MAX_IMAGES_PER_MESSAGE}장까지 보낼 수 있어요`);
      }
      setImageFiles(files.map((f) => ({ uri: URL.createObjectURL(f), name: f.name, raw: f })));
      return;
    }
    const f = picked[0];
    setFile({ uri: URL.createObjectURL(f), name: f.name, raw: f });
  };

  const handleRemoveImageFile = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // app/dm/[roomId]/page.tsx:166-174 verbatim(상호배타) — + 는 하단 네비
  // 슬라이드업(빠른 이동), 이모티콘은 그림/사진 첨부. 한쪽이 열리면
  // 다른 쪽은 자동으로 닫힌다.
  const togglePanel = () => {
    if (!isNavOpen) messageInputRef.current?.blur();
    setIsEmoticonOpen(false);
    setIsNavOpen((v) => !v);
  };
  const toggleEmoticon = () => {
    setIsNavOpen(false);
    setIsEmoticonOpen((v) => !v);
  };

  const buildReplyTo = (r: ReplyTarget | null) =>
    r
      ? {
          replyTo: {
            messageId: r.id,
            nickname: r.nickname,
            snippet: r.fileType === "sticker" ? "이모티콘" : (r.message || "").slice(0, 50),
            ...(r.fileType ? { fileType: r.fileType } : {}),
            ...(r.fileType === "sticker" && r.imageUrl ? { imageUrl: r.imageUrl } : {}),
          },
        }
      : {};

  const handleSend = async () => {
    if (!me || sending) return;
    const text = draft.trim();
    const pendingFile = file;
    const pendingImageFiles = imageFiles;
    if (!text && !pendingFile && pendingImageFiles.length === 0) return;

    const replySnapshot = replyingTo;
    setDraft("");
    setFile(null);
    setImageFiles([]);
    setReplyingTo(null);
    setSending(true);

    try {
      let imageUrl = "";
      let fileType: "image" | undefined;
      if (pendingFile) {
        fileType = "image";
        const safeName = pendingFile.name.replace(/[^\w.\-]/g, "_");
        const path = `voiceRoomChat/${Date.now()}_${safeName}`;
        const r = ref(storage, path);
        await uploadBytes(r, pendingFile.raw);
        imageUrl = await getDownloadURL(r);
      }
      let imageUrls: string[] = [];
      if (pendingImageFiles.length > 0) {
        fileType = "image";
        imageUrls = await Promise.all(
          pendingImageFiles.map(async (pendingImageFile, i) => {
            const safeName = pendingImageFile.name.replace(/[^\w.\-]/g, "_");
            const path = `voiceRoomChat/${Date.now()}_${i}_${safeName}`;
            const r = ref(storage, path);
            await uploadBytes(r, pendingImageFile.raw);
            return getDownloadURL(r);
          }),
        );
      }
      await sendVoiceChatMessage({
        nickname: me,
        message: text,
        imageUrl,
        ...(imageUrls.length > 0 ? { imageUrls } : {}),
        ...(fileType ? { fileType } : {}),
        ...buildReplyTo(replySnapshot),
        // 별빛 적립 + 링크 프리뷰는 functions/src/triggers/voiceChat.ts
        // (onVoiceChatMessageCreated)가 자동 처리 — 여기서 직접 안 건드림.
      });
    } catch (e) {
      console.error("[voiceChat] send failed", e);
      setDraft(text);
      setFile(pendingFile);
      setImageFiles(pendingImageFiles);
      setReplyingTo(replySnapshot);
      alert("전송 실패");
    }
    setSending(false);
  };

  const handleEmoticonSelect = async (id: string) => {
    if (!me) return;
    setIsEmoticonOpen(false);
    const replySnapshot = replyingTo;
    setReplyingTo(null);
    try {
      await sendVoiceChatMessage({
        nickname: me,
        message: "",
        imageUrl: getEmoticonUrl(id),
        fileType: "sticker",
        ...buildReplyTo(replySnapshot),
      });
    } catch (e) {
      console.error("[voiceChat] sticker send failed", e);
      setReplyingTo(replySnapshot);
    }
  };

  const handleOpenImage = (urls: string[], index: number) => setViewer({ urls, index });

  const handleJumpToOriginal = (messageId: string) => {
    messageRefs.current[messageId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(messageId);
    setTimeout(() => setHighlightedMessageId((cur) => (cur === messageId ? null : cur)), 1500);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div
        className="flex shrink-0 items-center px-3 py-2.5"
        style={{ borderBottom: "1px solid rgba(254, 245, 230, 0.14)" }}
      >
        <span className="text-[13px] font-semibold" style={{ color: INK_ON_DARK }}>
          보이스방 채팅
        </span>
      </div>

      <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <p className="pt-6 text-center text-xs italic" style={{ color: INK_SOFT_ON_DARK }}>
            아직 메시지가 없습니다
          </p>
        )}
        {messages.map((m) => (
          <VoiceChatMessageView
            key={m.id}
            m={m}
            mine={m.data.nickname === me}
            avatarImageUrl={avatars.get(m.data.nickname)?.imageUrl}
            registerRef={(el) => {
              messageRefs.current[m.id] = el;
            }}
            onOpenImage={handleOpenImage}
            onLongPress={setActionMenuFor}
            onJumpToOriginal={handleJumpToOriginal}
            highlighted={highlightedMessageId === m.id}
            messageReactions={reactions.get(m.id)}
          />
        ))}
      </div>

      {/* app/dm/[roomId]/page.tsx:512-525 verbatim — 0-height transform
          wrapper가 fixed 자손인 Dawnlight2BottomNav의 containing block이
          돼, forceVisible로 재mount된 nav가 "화면 맨 아래"가 아니라 이
          지점 기준 슬라이드업된다. 닫히면 composeArea 뒤로 완전히 숨음. */}
      <div
        style={{
          transform: isNavOpen ? "translateY(0)" : "translateY(110px)",
          transition: "transform 200ms ease",
          pointerEvents: isNavOpen ? "auto" : "none",
        }}
      >
        <Dawnlight2BottomNav forceVisible />
      </div>

      <div
        className="relative shrink-0 space-y-1.5 px-2.5 pb-2.5 pt-2"
        style={{
          borderTop: "1px solid rgba(254, 245, 230, 0.14)",
          // DM(app/dm/[roomId]/page.tsx:528-529)의 composeArea는
          // background: "rgba(254, 245, 230, 0.9)"(불투명 cream)라 위
          // 슬라이드업 wrapper가 닫힌 상태(translateY(110px))로 이 뒤에
          // 깔려도 실제로 안 보였다 — 우리 composer엔 그 배경이 없어서
          // (border만 있었음) "닫혀도 비쳐 보이는" 게 이번 버그의 실제
          // 원인이었다. 통화방 dark 톤에 맞춰 twilight 그라디언트 최하단
          // 색(#1c1530)을 불투명에 가깝게 재사용.
          background: "rgba(28, 21, 48, 0.97)",
        }}
      >
        {isEmoticonOpen && (
          <div className="absolute bottom-full left-0 right-0 px-2.5 pt-2 pb-1">
            <div className="mb-1.5 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsEmoticonOpen(false);
                  fileInputRef.current?.click();
                }}
                disabled={sending}
                aria-label={file || imageFiles.length > 0 ? "첨부 제거" : "사진 첨부"}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-50"
                style={{
                  background: "#ffffff",
                  border:
                    file || imageFiles.length > 0
                      ? "1px solid rgba(184,84,32,0.4)"
                      : "1px solid rgba(92,58,31,0.20)",
                  color: file || imageFiles.length > 0 ? "#b85420" : "#5c3a1f",
                }}
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <EmoticonPicker onSelect={handleEmoticonSelect} />
          </div>
        )}

        {replyingTo && (
          <div className="flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-1.5" style={{ background: "rgba(254, 245, 230, 0.08)" }}>
            <span className="truncate text-[11px]" style={{ color: INK_SOFT_ON_DARK }}>
              ↪ {replyingTo.nickname}: {replyingTo.fileType === "sticker" ? "이모티콘" : replyingTo.message}
            </span>
            <button type="button" onClick={() => setReplyingTo(null)} aria-label="답글 취소">
              <X size={14} color={INK_SOFT_ON_DARK} />
            </button>
          </div>
        )}

        {file && (
          <div className="flex items-center gap-2 rounded-[10px] p-1.5" style={{ background: "rgba(254, 245, 230, 0.08)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={file.uri} alt="" className="h-9 w-9 rounded-md object-cover" />
            <span className="flex-1 truncate text-[11px]" style={{ color: INK_SOFT_ON_DARK }}>{file.name}</span>
            <button type="button" onClick={() => setFile(null)} aria-label="첨부 제거">
              <X size={12} color={INK_SOFT_ON_DARK} />
            </button>
          </div>
        )}

        {imageFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {imageFiles.map((f, i) => (
              <div key={`${f.uri}-${i}`} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.uri} alt="" className="h-14 w-14 rounded-[10px] object-cover" />
                <button
                  type="button"
                  onClick={() => handleRemoveImageFile(i)}
                  aria-label="사진 제거"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full"
                  style={{ background: "rgba(0,0,0,0.6)" }}
                >
                  <X size={12} color="#fef5e6" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePickImage}
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePanel();
            }}
            aria-label={isNavOpen ? "빠른 이동 닫기" : "빠른 이동 열기"}
            aria-pressed={isNavOpen}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all"
            style={{
              background: isNavOpen ? "rgba(255,199,133,0.3)" : "rgba(254, 245, 230, 0.08)",
              color: isNavOpen ? "#ffc785" : INK_ON_DARK,
            }}
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleEmoticon}
            aria-label={isEmoticonOpen ? "이모티콘 닫기" : "이모티콘 열기"}
            aria-pressed={isEmoticonOpen}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: isEmoticonOpen ? "rgba(255,199,133,0.3)" : "rgba(254, 245, 230, 0.08)" }}
          >
            <Smile size={16} color={isEmoticonOpen ? "#ffc785" : INK_ON_DARK} />
          </button>
          <input
            ref={messageInputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="메시지를 입력하세요"
            className="min-w-0 flex-1 rounded-full px-3 py-2 text-[13px] focus:outline-none"
            style={{ background: "rgba(254, 245, 230, 0.10)", border: "1px solid rgba(254, 245, 230, 0.18)", color: INK_ON_DARK }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || (!draft.trim() && !file && imageFiles.length === 0)}
            aria-label="메시지 전송"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 disabled:opacity-50"
            style={{ background: "#ffc785" }}
          >
            <Send size={16} color="#2a1f4a" />
          </button>
        </div>
      </div>

      {actionMenuFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.3)" }}
          onClick={() => setActionMenuFor(null)}
        >
          <div
            className="flex items-center gap-2 rounded-full p-2.5"
            style={{ background: "#fef5e6", border: "1px solid rgba(92,58,31,0.15)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {CHAT_REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="p-1.5 text-lg transition-opacity hover:opacity-60"
                onClick={() => {
                  toggleReaction(actionMenuFor.id, emoji);
                  setActionMenuFor(null);
                }}
              >
                {emoji}
              </button>
            ))}
            <div className="h-5 w-px" style={{ background: "rgba(92,58,31,0.15)" }} />
            <button
              type="button"
              className="p-1.5 text-base transition-opacity hover:opacity-60"
              style={{ color: "#5c3a1f" }}
              onClick={() => {
                setReplyingTo({
                  id: actionMenuFor.id,
                  nickname: actionMenuFor.data.nickname,
                  message: actionMenuFor.data.message,
                  fileType: actionMenuFor.data.fileType,
                  imageUrl: actionMenuFor.data.imageUrl,
                });
                setActionMenuFor(null);
              }}
            >
              ↩
            </button>
          </div>
        </div>
      )}

      {viewer && (
        <GalleryViewer urls={viewer.urls} initialIndex={viewer.index} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}

const VoiceChatMessageView = memo(function VoiceChatMessageView({
  m,
  mine,
  avatarImageUrl,
  registerRef,
  onOpenImage,
  onLongPress,
  onJumpToOriginal,
  highlighted,
  messageReactions,
}: {
  m: VoiceChatMessageRow;
  mine: boolean;
  avatarImageUrl: string | undefined;
  registerRef: (el: HTMLDivElement | null) => void;
  onOpenImage: (urls: string[], index: number) => void;
  onLongPress: (m: VoiceChatMessageRow) => void;
  onJumpToOriginal: (messageId: string) => void;
  highlighted: boolean;
  messageReactions: MessageReactions | undefined;
}) {
  const d = m.data;
  const replyQuote = d.replyTo ? (
    <button
      type="button"
      onClick={() => onJumpToOriginal(d.replyTo!.messageId)}
      className="mb-0.5 block max-w-[220px] rounded-[10px] px-2.5 py-1.5 text-left"
      style={{ background: mine ? "rgba(255, 199, 133, 0.2)" : "rgba(254, 245, 230, 0.08)" }}
    >
      <span className="block truncate text-[10px] font-semibold" style={{ color: INK_SOFT_ON_DARK }}>
        ↪ {d.replyTo.nickname}
      </span>
      {d.replyTo.fileType === "sticker" && d.replyTo.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.replyTo.imageUrl} alt="" className="h-7 w-7 object-contain" />
      ) : (
        <span className="block truncate text-[10px]" style={{ color: INK_SOFT_ON_DARK }}>
          {d.replyTo.snippet || (d.replyTo.fileType === "image" ? "[사진]" : "")}
        </span>
      )}
    </button>
  ) : null;

  const content = (
    <div
      className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}
      style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}
    >
      {!mine && (
        <span className="text-[10px] font-medium" style={{ color: INK_SOFT_ON_DARK }}>
          {d.nickname}
        </span>
      )}
      {replyQuote}
      {!!d.message && (
        <div
          className="max-w-full rounded-2xl px-3 py-2 text-[12px] leading-[17px]"
          style={{
            background: mine ? "#ffd4b8" : "rgba(254, 245, 230, 0.12)",
            border: mine ? "1px solid rgba(92,58,31,0.10)" : "1px solid rgba(254, 245, 230, 0.14)",
            color: mine ? "#5c3a1f" : INK_ON_DARK,
          }}
        >
          <MessageText text={d.message} dl2 />
        </div>
      )}
      {!!d.linkPreview && <LinkPreviewCard preview={d.linkPreview} />}
      {d.imageUrls && d.imageUrls.length > 0 ? (
        <ImageGallery urls={d.imageUrls} onImageClick={(i) => onOpenImage(d.imageUrls!, i)} />
      ) : (
        !!d.imageUrl &&
        (d.fileType === "sticker" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.imageUrl} alt="" className="h-20 w-20 object-contain" />
        ) : (
          <button type="button" onClick={() => onOpenImage([d.imageUrl!], 0)} aria-label="사진 크게 보기">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.imageUrl} alt="" className="h-[160px] w-[160px] rounded-xl object-cover" />
          </button>
        ))
      )}
      {messageReactions && messageReactions.byEmoji.size > 0 && (
        <div className={`flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
          {Array.from(messageReactions.byEmoji.entries()).map(([emoji, nicks]) => (
            <span
              key={emoji}
              className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px]"
              style={{
                background: "rgba(254, 245, 230, 0.10)",
                border: `1px solid ${messageReactions.myEmoji === emoji ? "#ffc785" : "rgba(254, 245, 230, 0.16)"}`,
                color: INK_SOFT_ON_DARK,
              }}
            >
              <span className="text-[10px]">{emoji}</span>
              {nicks.length}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div
      ref={registerRef}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPress(m);
      }}
      className={`flex items-end gap-1.5 rounded-xl transition-colors ${mine ? "justify-end" : ""} ${highlighted ? "bg-[rgba(255,199,133,0.18)]" : ""}`}
      style={{ flexShrink: 0 }}
    >
      {/* MemberAvatar.tsx는 클릭 시 /dm 라우팅 전역 동작이 있어 재사용
          안 함(위 파일 상단 주석) — 클릭 불가능한 프사만 인라인. */}
      {!mine && (
        <div
          className="shrink-0 overflow-hidden rounded-full"
          style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, border: "1.5px solid rgba(254, 245, 230, 0.4)" }}
          aria-hidden
        >
          {avatarImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarImageUrl}
              alt=""
              style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <svg viewBox="0 0 96 96" style={{ width: "100%", height: "100%" }}>
              <rect width="96" height="96" fill="#d4a870" />
              <circle cx="48" cy="36" r="18" fill="#b88850" opacity="0.8" />
              <path d="M 20 96 Q 20 64 48 64 Q 76 64 76 96 Z" fill="#a87840" opacity="0.7" />
            </svg>
          )}
        </div>
      )}
      <div className="flex max-w-[85%] items-end gap-1" style={{ flexShrink: 0 }}>
        {content}
        <span className="whitespace-nowrap text-[9px]" style={{ color: INK_SOFT_ON_DARK }}>{formatTime(d.createdAt)}</span>
      </div>
    </div>
  );
});
