"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Camera, Send, X } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import NicknameLink from "@/app/components/NicknameLink";
import { CommentImageView } from "@/app/components/CommentImage";
import { formatSmart } from "@/src/lib/formatSmart";
import { handleEvent } from "@/src/lib/badgeCheck";
import {
  getOpenPanel,
  setChatInputFocused,
  setOpenPanel,
  useChatInputFocused,
} from "@/src/lib/uiBus";
import { useDawnlight2 } from "@/src/lib/featureFlags";
import {
  MentionPicker,
  applyMentionInsert,
} from "@/app/components/mention/MentionPicker";
import { MentionText } from "@/app/components/mention/MentionText";
import { MemberAvatar } from "@/app/components/redesign/MemberAvatar";
import { useMemberAvatars } from "@/src/lib/useMemberAvatars";
import {
  useChatReactions,
  type MessageReactions,
} from "@/src/lib/useChatReactions";

type ChatFileType = "image" | "gif" | "video";

// Chat-p2 답글 비정규화 — 원본 메시지 삭제돼도 인용 표시가 깨지지
// 않도록 snippet + nickname + fileType 을 답글 작성 시점에 스냅샷.
type ChatReplyTo = {
  messageId: string;
  nickname: string;
  snippet: string;
  fileType?: ChatFileType;
};

type ChatMessage = {
  id: string;
  nickname: string;
  message: string;
  imageUrl?: string;
  fileType?: ChatFileType;
  createdAt: Timestamp | null;
  replyTo?: ChatReplyTo;
};

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

/** Decorative twinkle particles around the button when unread messages exist.
 *  `dl2` swaps the cream tint to dawnlight2's softer #fef5e6 — same
 *  glow halo, just a hair lighter so it doesn't pop against the
 *  reskinned cream FAB. */
function TwinkleParticles({ dl2 = false }: { dl2?: boolean }) {
  const particles = [
    { left: -6, top: 6, size: 4, delay: 0 },
    { left: 58, top: 14, size: 5, delay: 0.5 },
    { left: 6, top: 54, size: 4, delay: 1.1 },
  ];
  const tint = dl2 ? "#fef5e6" : "#FFE5C4";
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
            background: tint,
            filter: `drop-shadow(0 0 ${p.size + 2}px ${tint})`,
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
  // Step 4-D: dawnlight2 reskin flag. When true, the meta row uses a
  // 12 px ink-brown nick (was 9 px stardust), and the bubble swaps the
  // cosmic peach/abyss surfaces for cream-tone surfaces that read
  // against the cream panel bg.
  dl2: boolean;
  // Chat-p1 카톡 풍 연속 묶기 — 같은 분 안 같은 sender 의 2번째 이후
  // 메시지는 프사/닉 숨김, 마지막 메시지에만 시간 표시. 부모 useMemo
  // 에서 미리 계산.
  showAvatar: boolean;
  showNickname: boolean;
  showTime: boolean;
  avatar:
    | { imageUrl: string; registered: boolean; docId: string }
    | undefined;
  // p2: bubble 옆 작은 ↩ 버튼 클릭 → 답글 모드 진입.
  onReply: (m: ChatMessage) => void;
  // p2.5: row DOM 노드 등록 + 인용 박스 클릭 → 원본 점프 + 강조 토글.
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  onJumpToOriginal: (messageId: string) => void;
  highlighted: boolean;
  // p3.2: 리액션 배지 표시 (토글은 p3.3) — undefined 면 row 자체 안 그림.
  messageReactions: MessageReactions | undefined;
};

const CHAT_AVATAR_SIZE = 36;

const MessageItem = memo(
  function MessageItem({
    m,
    mine,
    dl2,
    showAvatar,
    showNickname,
    showTime,
    avatar,
    onReply,
    registerRef,
    onJumpToOriginal,
    highlighted,
    messageReactions,
  }: MessageItemProps) {
    // p2.5: row DOM 노드 등록 — mount/m.id 변동 시 register, unmount 시
    // unregister. callback ref 를 직접 ref={...} 에 박으면 매 렌더마다
    // detach/attach 반복되어 memo 효과 깎임 — useEffect 패턴 안전.
    const rowRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      registerRef(m.id, rowRef.current);
      return () => registerRef(m.id, null);
    }, [m.id, registerRef]);

    // p2.5: 강조 wash — 1.5초 후 자동 해제. transition 으로 부드럽게.
    const highlightStyle: React.CSSProperties = highlighted
      ? {
          background: dl2
            ? "rgba(255,212,184,0.32)"
            : "rgba(216,150,200,0.18)",
          borderRadius: 10,
          marginInline: -4,
          paddingInline: 4,
          paddingBlock: 2,
        }
      : {};
    const bubbleStyle: React.CSSProperties = dl2
      ? mine
        ? {
            background: "#ffd4b8",
            border: "1px solid rgba(92,58,31,0.10)",
            color: "#5c3a1f",
          }
        : {
            background: "#f0e4cc",
            border: "1px solid rgba(92,58,31,0.10)",
            color: "#5c3a1f",
          }
      : mine
        ? {
            background:
              "linear-gradient(135deg, rgba(255,229,196,0.22), rgba(255,181,167,0.18))",
            border: "1px solid rgba(255,181,167,0.4)",
            color: "#f4efff",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            backdropFilter: "blur(4px)",
          }
        : {
            background: "rgba(26,15,61,0.7)",
            border: "1px solid rgba(216,150,200,0.25)",
            color: "#f4efff",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            backdropFilter: "blur(4px)",
          };
    const imageWrapStyle: React.CSSProperties = {
      border: dl2
        ? "1px solid rgba(92,58,31,0.10)"
        : "1px solid rgba(216,150,200,0.25)",
      boxShadow: dl2
        ? "0 2px 8px rgba(92,58,31,0.10)"
        : "0 2px 8px rgba(0,0,0,0.25)",
    };
    const timeStyle: React.CSSProperties = {
      color: dl2 ? "#8a6a4a" : "rgb(155,143,184)",
      fontSize: 9,
    };

    // p2: 답글 인용 박스 — bubble 위. 새 토큰 X, 기존 dawnlight2/cosmic
    // 팔레트 옅게 사용.
    const replyQuoteStyle: React.CSSProperties = dl2
      ? mine
        ? {
            background: "rgba(255,212,184,0.45)",
            borderLeft: "3px solid #ffb88a",
            color: "#5c3a1f",
          }
        : {
            background: "rgba(254,245,230,0.55)",
            borderLeft: "3px solid rgba(255,212,184,0.85)",
            color: "#5c3a1f",
          }
      : {
          background: "rgba(26,15,61,0.55)",
          borderLeft: "3px solid rgba(216,150,200,0.7)",
          color: "#FFE5C4",
        };
    const replyQuoteSnippetColor = dl2
      ? "rgba(92,58,31,0.85)"
      : "rgba(244,239,255,0.8)";

    const replyQuote = m.replyTo ? (
      <button
        type="button"
        onClick={() => onJumpToOriginal(m.replyTo!.messageId)}
        className="block max-w-full rounded-md px-2 py-1.5 text-left font-serif transition-opacity hover:opacity-80"
        style={replyQuoteStyle}
      >
        <div
          className="truncate text-[10px] font-semibold"
          style={{ color: replyQuoteStyle.color as string | undefined }}
        >
          ↪ {m.replyTo.nickname}
        </div>
        <div
          className="truncate text-[11px]"
          style={{ color: replyQuoteSnippetColor, marginTop: 1 }}
        >
          {m.replyTo.snippet ||
            (m.replyTo.fileType === "video"
              ? "[영상]"
              : m.replyTo.fileType === "gif" || m.replyTo.fileType === "image"
                ? "[사진]"
                : "")}
        </div>
      </button>
    ) : null;

    const contentColumn = (
      <div className="flex flex-col items-start gap-1">
        {replyQuote}
        {m.message && (
          <div
            className="wrap-anywhere max-w-full rounded-2xl px-3 py-2 font-serif text-[12px] leading-relaxed"
            style={bubbleStyle}
          >
            <MentionText text={m.message} dl2={dl2} />
          </div>
        )}
        {m.imageUrl && (
          <div
            className="max-w-full overflow-hidden rounded-xl"
            style={imageWrapStyle}
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
        {/* p3.2: 리액션 배지 row — bubble 아래, contentColumn 안. mine
            정렬은 row 외부 (parent) 에서 처리하지만 contentColumn 의
            items-start 라 자동으로 왼쪽. mine 인 경우 self-end. */}
        {messageReactions && messageReactions.byEmoji.size > 0 && (
          <div
            className={`mt-0.5 flex flex-wrap items-center gap-1 ${
              mine ? "self-end" : ""
            }`}
          >
            {Array.from(messageReactions.byEmoji.entries()).map(
              ([emoji, nicks]) => {
                const isMine = messageReactions.myEmoji === emoji;
                return (
                  <span
                    key={emoji}
                    className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-serif"
                    style={
                      dl2
                        ? {
                            background: "rgba(254,245,230,0.85)",
                            border: isMine
                              ? "1px solid rgba(255,184,138,0.85)"
                              : "1px solid rgba(92,58,31,0.2)",
                            color: "#5c3a1f",
                          }
                        : {
                            background: "rgba(26,15,61,0.75)",
                            border: isMine
                              ? "1px solid rgba(255,181,167,0.8)"
                              : "1px solid rgba(216,150,200,0.3)",
                            color: "#FFE5C4",
                          }
                    }
                  >
                    <span style={{ fontSize: 12 }}>{emoji}</span>
                    <span style={{ fontSize: 11 }}>{nicks.length}</span>
                  </span>
                );
              },
            )}
          </div>
        )}
      </div>
    );

    // p2: 메시지 옆 작은 답글 ↩ 버튼 — opacity 0.4 (모바일 항상 보이게)
    // → hover 시 진해짐. 새 토큰 X.
    const replyBtn = (
      <button
        type="button"
        onClick={() => onReply(m)}
        aria-label="답글"
        className="self-end opacity-40 transition-opacity hover:opacity-100"
        style={{
          padding: 4,
          color: dl2 ? "#8a6a4a" : "rgb(155,143,184)",
          lineHeight: 1,
          fontSize: 14,
        }}
      >
        ↩
      </button>
    );

    // p1.5: 그룹 시작 row 는 그룹 사이 여백 크게, 그룹 내부는 촘촘.
    const rowMarginTop = showAvatar ? 14 : 2;

    if (mine) {
      // 본인 — 오른쪽 정렬, 프사·닉 없음 (빈자리도 X). 시간 bubble 왼쪽
      // (showTime 일 때만, gap 4). 답글 버튼은 contentColumn 왼쪽 (= 더
      // 안쪽), 시간 오른쪽엔 시각적 균형 위해 가장자리 가까이 배치.
      return (
        <div
          ref={rowRef}
          className="group flex w-full justify-end transition-[background] duration-300"
          style={{ marginTop: rowMarginTop, ...highlightStyle }}
        >
          <div className="flex max-w-[82%] items-end gap-1">
            {showTime && (
              <span
                className="whitespace-nowrap pb-1 font-serif tracking-wider"
                style={timeStyle}
              >
                {formatTime(m.createdAt)}
              </span>
            )}
            {replyBtn}
            {contentColumn}
          </div>
        </div>
      );
    }

    // 타인 — [프사 column 36] [body column = [nick][bubble + time]].
    return (
      <div
        ref={rowRef}
        className="flex w-full items-start gap-2 transition-[background] duration-300"
        style={{ marginTop: rowMarginTop, ...highlightStyle }}
      >
        <div
          className="shrink-0"
          style={{ width: CHAT_AVATAR_SIZE, height: CHAT_AVATAR_SIZE }}
        >
          {showAvatar ? (
            avatar?.registered ? (
              <MemberAvatar
                imageUrl={avatar.imageUrl}
                nickname={m.nickname}
                size={CHAT_AVATAR_SIZE}
                dl2={dl2}
              />
            ) : (
              // 미등록 (잠든 별) — MemberAvatar dl2 transparent disc 가
              // cream surface 위에서 안 보이는 문제. 잉크 / cosmic 별빛
              // 톤 회색 원 + 닉 첫 글자 (신규 디자인 토큰 0).
              <div
                className="flex h-full w-full items-center justify-center rounded-full font-serif font-semibold"
                style={
                  dl2
                    ? {
                        background: "rgba(92,58,31,0.18)",
                        border: "1px solid rgba(92,58,31,0.28)",
                        color: "rgba(92,58,31,0.75)",
                        fontSize: 14,
                      }
                    : {
                        background: "rgba(26,15,61,0.6)",
                        border: "1px solid rgba(216,150,200,0.35)",
                        color: "#FFE5C4",
                        fontSize: 14,
                      }
                }
              >
                {m.nickname.slice(0, 1)}
              </div>
            )
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          {showNickname &&
            (dl2 ? (
              <div
                className="px-1"
                style={{ color: "#5c3a1f", fontSize: 12 }}
              >
                <NicknameLink
                  nickname={m.nickname}
                  className="font-semibold"
                />
              </div>
            ) : (
              <div className="px-1 font-serif text-[11px] tracking-wider">
                <NicknameLink
                  nickname={m.nickname}
                  className="text-stardust"
                />
              </div>
            ))}
          <div className="flex max-w-full items-end gap-1">
            {contentColumn}
            {replyBtn}
            {showTime && (
              <span
                className="whitespace-nowrap pb-1 font-serif tracking-wider"
                style={timeStyle}
              >
                {formatTime(m.createdAt)}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.mine === next.mine &&
    prev.dl2 === next.dl2 &&
    prev.showAvatar === next.showAvatar &&
    prev.showNickname === next.showNickname &&
    prev.showTime === next.showTime &&
    prev.avatar?.imageUrl === next.avatar?.imageUrl &&
    prev.avatar?.registered === next.avatar?.registered &&
    prev.avatar?.docId === next.avatar?.docId &&
    prev.m.id === next.m.id &&
    prev.m.message === next.m.message &&
    prev.m.imageUrl === next.m.imageUrl &&
    prev.m.fileType === next.m.fileType &&
    prev.m.nickname === next.m.nickname &&
    prev.m.createdAt?.toMillis() === next.m.createdAt?.toMillis() &&
    prev.m.replyTo?.messageId === next.m.replyTo?.messageId &&
    prev.m.replyTo?.nickname === next.m.replyTo?.nickname &&
    prev.m.replyTo?.snippet === next.m.replyTo?.snippet &&
    prev.m.replyTo?.fileType === next.m.replyTo?.fileType &&
    prev.highlighted === next.highlighted &&
    // p3.2: reactions 비교 — Map 자체 매번 새 reference 라 byEmoji size /
    // 각 emoji 카운트 / myEmoji 만 얕게 비교. 배지 표시상 충분.
    reactionsEqual(prev.messageReactions, next.messageReactions) &&
    prev.onReply === next.onReply &&
    prev.registerRef === next.registerRef &&
    prev.onJumpToOriginal === next.onJumpToOriginal,
);

// p3.2 helper — MessageReactions 두 객체 표시 동등성 비교.
function reactionsEqual(
  a: MessageReactions | undefined,
  b: MessageReactions | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.myEmoji !== b.myEmoji) return false;
  if (a.byEmoji.size !== b.byEmoji.size) return false;
  for (const [emoji, nicks] of a.byEmoji) {
    const other = b.byEmoji.get(emoji);
    if (!other || other.length !== nicks.length) return false;
  }
  return true;
}

export default function FloatingChat() {
  const { nickname, ready } = useAuth();
  // Dawnlight 2 reskin gate — for 언쏘 the FAB swaps to a flat cream
  // surface (peach radial gradient + 3D inset → solid #fef5e6 + soft
  // shadow). Pulse rings, twinkles, badge animations all keep their
  // exact timing; only the colors are remapped. The chat panel
  // itself stays cosmic for now (separate scope).
  const isDawnlight2 = useDawnlight2();
  const [open, setOpen] = useState(false);
  // Coordinate with the pet floating UI: when chat opens, the pet
  // icon hides; when pet opens, the chat icon hides. The shared
  // uiBus tracks which panel currently owns the screen.
  // FAB icons stay visible always. When a panel opens, its higher
  // z-index surface covers the icon visually, but the icon itself is
  // never removed from the layout. On wide screens both panels may be
  // open simultaneously since they live in opposite corners.
  useEffect(() => {
    if (open) setOpenPanel("chat");
    else if (getOpenPanel() === "chat") setOpenPanel(null);
  }, [open]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  // 멘션 자동완성용 — input 의 cursor 위치를 추적해 MentionPicker 가
  // `@<query>` 꼬리 감지에 쓴다. null 이면 picker 가 항상 안 뜸.
  const [mentionCursor, setMentionCursor] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  // Whether the message input currently holds focus AND the device is
  // mobile-class. Drives two things:
  //  1. The panel slides down to sit just above the keyboard top
  //     (instead of leaving a 96px gap meant for the chat icon).
  //  2. A bus signal (setChatInputFocused) tells BottomNav to hide
  //     immediately, without waiting for visualViewport to shrink.
  // PC users never satisfy `isMobile`, so neither effect fires there.
  const [inputFocused, setInputFocused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Bus reflects this FloatingChat's own input focus on mobile.
  // Used to drop the FAB icon when the input focuses (own input
  // already drops the panel via `inputFocused && isMobile`).
  const anyChatInputFocused = useChatInputFocused();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const touch =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(pointer: coarse)").matches;
      const narrow = window.innerWidth < 768;
      setIsMobile(touch || narrow);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  // Mirror inputFocused into the shared bus so BottomNav (any sibling
  // tree) can subscribe without prop-drilling. Only emit `true` on
  // mobile — desktop focus must never hide the nav.
  useEffect(() => {
    setChatInputFocused(inputFocused && isMobile);
    return () => setChatInputFocused(false);
  }, [inputFocused, isMobile]);
  // Belt-and-braces: when the panel closes, drop the focus signal even
  // if the input's onBlur fires after the unmount path.
  useEffect(() => {
    if (!open) {
      setInputFocused(false);
      setChatInputFocused(false);
    }
  }, [open]);
  // null = subscription hasn't delivered yet — keeps the badge dark while
  // Firestore loads on cold start instead of flashing every historical
  // message as unread for a few hundred ms.
  const [lastReadMs, setLastReadMs] = useState<number | null>(null);

  // Last-read time, account-scoped via users/{nickname}/lastChatRead.
  // Subscribing means reading on the phone instantly clears the unread
  // badge in the browser too — same account, same source of truth.
  useEffect(() => {
    if (!nickname) return;
    const unsub = onSnapshot(doc(db, "users", nickname), (snap) => {
      const data = snap.data() as { lastChatRead?: Timestamp } | undefined;
      const ts = data?.lastChatRead;
      if (ts && typeof ts.toMillis === "function") {
        // Monotonic: only ever raise lastReadMs. A pending serverTimestamp()
        // write briefly resolves to null on the local snapshot before the
        // server confirms — without the prev guard, that fall-through
        // would downgrade an optimistic value back below recent messages
        // and re-light the badge on close→reopen.
        const serverMs = ts.toMillis();
        setLastReadMs((prev) =>
          prev === null ? serverMs : Math.max(prev, serverMs),
        );
      } else {
        // Field missing (brand-new account) OR pending write. Seed only
        // when nothing is set — never overwrite a higher optimistic value.
        setLastReadMs((prev) => (prev === null ? Date.now() : prev));
      }
    });
    return unsub;
  }, [nickname]);

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
        // p2: replyTo 가 doc 에 있을 때만 매핑 — 기존 메시지는 undefined.
        const rt = data.replyTo as
          | {
              messageId?: unknown;
              nickname?: unknown;
              snippet?: unknown;
              fileType?: unknown;
            }
          | undefined;
        const replyTo: ChatReplyTo | undefined =
          rt &&
          typeof rt.messageId === "string" &&
          typeof rt.nickname === "string" &&
          typeof rt.snippet === "string"
            ? {
                messageId: rt.messageId,
                nickname: rt.nickname,
                snippet: rt.snippet,
                fileType:
                  typeof rt.fileType === "string"
                    ? (rt.fileType as ChatFileType)
                    : undefined,
              }
            : undefined;
        return {
          id: d.id,
          nickname: data.nickname,
          message: data.message,
          imageUrl: data.imageUrl || "",
          fileType: (data.fileType as ChatFileType | undefined) || undefined,
          createdAt: data.createdAt ?? null,
          replyTo,
        };
      });
      list.reverse();
      setMessages(list);
    });
    return unsub;
  }, []);

  // ── Chat-p1: 작성자 프사 + 카톡 연속 묶기 ──
  // 메시지 50개치 unique 닉네임을 한 번 fetch (useMemberAvatars 가 in-query
  // chunking + 미등록 닉 채움). 결과 Map 으로 MessageItem 에 프사 + slot
  // doc id 를 내려준다. 닉 클릭은 기존 NicknameLink popup 유지 (홈피만,
  // 앱은 바로 router.push).
  const allNicknames = useMemo(
    () => Array.from(new Set(messages.map((m) => m.nickname))),
    [messages],
  );
  const avatars = useMemberAvatars(allNicknames);

  // p3.2: 리액션 배지 표시 (토글은 p3.3) — 메시지 50개 각각 chat/{id}/
  // reactions onSnapshot. 비용은 PhotosSectionD2 댓글 카운트와 동일 규모.
  const allMessageIds = useMemo(
    () => messages.map((m) => m.id),
    [messages],
  );
  const { reactions: chatReactions } = useChatReactions(
    allMessageIds,
    nickname ?? "",
  );

  // 같은 분(minute) 안 같은 sender 묶기 — group 첫 메시지에 프사+닉,
  // group 마지막에 시간 표시. createdAt 이 null(pending serverTimestamp)
  // 인 메시지는 group 시작 으로 취급(직전 비교 결과가 항상 다름).
  const decoratedMessages = useMemo(() => {
    const minuteOf = (t: Timestamp | null) =>
      t && typeof t.toMillis === "function"
        ? Math.floor(t.toMillis() / 60000)
        : null;
    const sameMinuteSameSender = (a: ChatMessage, b: ChatMessage) => {
      if (a.nickname !== b.nickname) return false;
      const ma = minuteOf(a.createdAt);
      const mb = minuteOf(b.createdAt);
      return ma !== null && ma === mb;
    };
    return messages.map((m, i) => {
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const startsGroup = !prev || !sameMinuteSameSender(prev, m);
      const endsGroup = !next || !sameMinuteSameSender(m, next);
      return {
        m,
        showAvatar: startsGroup,
        showNickname: startsGroup,
        showTime: endsGroup,
      };
    });
  }, [messages]);

  // ── Chat-p2 답글 ──
  // 메시지 옆 작은 ↩ 버튼 클릭 → 답글 모드 진입. replyingTo set 되면
  // compose 위 인용 박스 표시 + 전송 시 addDoc 에 비정규화 snapshot 동봉.
  // useCallback 으로 MessageItem memo comparator 안정 (onReply 식별자
  // 매 렌더마다 새로 만들어지면 메모 깨져서 전체 리스트가 리렌더).
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const handleReply = useCallback((m: ChatMessage) => setReplyingTo(m), []);
  const handleClearReply = useCallback(() => setReplyingTo(null), []);

  // ── Chat-p2.5 답글 점프 + 강조 ──
  // 각 MessageItem 의 row DOM 노드를 useEffect 로 등록. 인용 박스 클릭
  // 시 element.scrollIntoView({behavior:"smooth", block:"center"}) + 1.5초
  // 강조. registerMessageRef 는 useCallback 으로 stable identity (memo
  // comparator 안정).
  const messageRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // p2.5-fix: 점프 후 자동 scroll-to-bottom 복귀 방지. 옵션 C —
  // 사용자가 직접 끝까지 스크롤할 때까지 lock (카톡 표준). onScroll 에서
  // 끝 근처 (within 80px) 도달 시 unlock. 자기가 메시지 전송하면 즉시 unlock.
  // isJumping=true 동안: useEffect[open, messages] 의 pin 호출이 모두 skip.
  //
  // p2.5-fix2: handleListScroll 자기 발화 차단 — 점프 자체 scrollIntoView
  // ({behavior:"smooth"}) 가 onScroll 다수 fire → distanceFromBottom 80 안
  // (원본이 끝 근처) 이면 unlock 발동했음. listRef <div> 에 pointerdown
  // 리스너 등록해 사용자가 직접 손을 댄 후의 스크롤만 unlock 후보로 인정.
  const isJumpingRef = useRef(false);
  const userTouchedRef = useRef(false);
  const registerMessageRef = useCallback(
    (id: string, el: HTMLDivElement | null) => {
      if (el) messageRefsMap.current.set(id, el);
      else messageRefsMap.current.delete(id);
    },
    [],
  );
  const handleJumpToOriginal = useCallback((messageId: string) => {
    const el = messageRefsMap.current.get(messageId);
    if (!el) {
      // limit(50) 밖 옛 메시지 — DOM 에 없음.
      alert("오래된 메시지라 찾을 수 없어요");
      return;
    }
    // 점프 lock 활성화 — 사용자가 끝까지 스크롤하거나 메시지 보낼 때까지.
    isJumpingRef.current = true;
    // p2.5-fix2: 점프 자체 smooth scroll 이 발생시킨 onScroll 은 unlock
    // 후보 아님. 사용자가 다음에 직접 손 대기 전까지 userTouched=false.
    userTouchedRef.current = false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedMessageId(messageId);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedMessageId(null);
      highlightTimerRef.current = null;
    }, 1500);
  }, []);
  const handleListScroll = useCallback(() => {
    if (!isJumpingRef.current) return;
    // p2.5-fix2: 사용자가 직접 손을 댄(pointerdown) 후의 스크롤만 unlock
    // 후보. 점프 smooth scroll 자기 발화 차단.
    if (!userTouchedRef.current) return;
    const list = listRef.current;
    if (!list) return;
    const distanceFromBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight;
    if (distanceFromBottom < 80) {
      isJumpingRef.current = false;
      userTouchedRef.current = false;
    }
  }, []);
  // p2.5-fix2: 사용자 포인터가 list 에 닿는 순간 — 이후의 onScroll 은
  // 사용자 직접 스크롤로 간주. 점프 직후 자기 발화 onScroll 과 구분.
  // mouse/touch/pen 통합 pointer 이벤트로 데스크탑+모바일 호환.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handlePointerDown = () => {
      userTouchedRef.current = true;
    };
    el.addEventListener("pointerdown", handlePointerDown);
    return () => el.removeEventListener("pointerdown", handlePointerDown);
  }, []);
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const markRead = () => {
    if (!nickname) return;
    // Optimistic local update so the badge clears the moment the user
    // opens the panel. Date.now() alone is unsafe: messages carry
    // serverTimestamp() which can be ahead of the device clock, so
    // `Date.now() < latestMsg` and recent messages stay marked unread
    // on close→reopen. Ceiling the optimistic value above every message
    // we've already loaded.
    const latestSeenMs = messages.reduce((max, m) => {
      const c = m.createdAt;
      if (!c || typeof c.toMillis !== "function") return max;
      const ms = c.toMillis();
      return ms > max ? ms : max;
    }, 0);
    const optimistic = Math.max(Date.now(), latestSeenMs);
    setLastReadMs((prev) =>
      prev === null ? optimistic : Math.max(prev, optimistic),
    );
    // updateDoc 은 doc 이 없으면 실패한다 — setDoc(..., { merge: true }) 처럼
    // 사라진 user doc 을 lastChatRead 만으로 재생성하지 않도록 가드.
    // (mass-quit-2026-05-10 직후 떠난 사용자가 채팅창 열며 user doc 부활
    //  → AuthProvider 자동 로그인 분기에서 다시 재해석되는 함정 방지)
    updateDoc(doc(db, "users", nickname), {
      lastChatRead: serverTimestamp(),
    }).catch((e) => {
      // 일반적으로 not-found (user 삭제됨) — subscription 이 다음 snapshot 으로
      // 화해. 그 외 에러도 본인 unread 동기화 외에는 영향 없음.
      console.warn("[FloatingChat] lastChatRead skipped", e);
    });
  };

  // Unread count — excludes own messages, only counted when panel is closed
  const unreadCount = useMemo(() => {
    if (open) return 0;
    if (lastReadMs === null) return 0;
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
      // p2.5-fix: 점프 lock 활성화 중에는 모든 pin skip — 사용자가 머문
      // 위치 유지, 새 메시지 와도 아래로 안 끌려감.
      if (isJumpingRef.current) return;
      const end = endRef.current;
      if (end) {
        end.scrollIntoView({ block: "end", behavior: "smooth" });
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
  }, [open, messages]);

  // One extra pin after framer-motion's enter animation settles. On mobile
  // this is the first frame where the panel's scale/opacity are final, which
  // is the most reliable frame if earlier pins were fighting the animation.
  // p2.5-fix: 점프 lock 중에는 enter 애니메이션 직후도 끝으로 안 끌어감.
  const handlePanelAnimationComplete = () => {
    if (!open) return;
    if (isJumpingRef.current) return;
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

    // p2: snapshot 답글 대상 — 전송 도중 사용자가 다른 답글을 시작/취소
    // 해도 이 메시지의 replyTo 는 처음 상태 그대로 들어가야 함.
    const replySnapshot = replyingTo;
    // p2.5-fix: 자기가 메시지를 보낸다 = 끝까지 따라가야 함 → 점프 lock 해제.
    isJumpingRef.current = false;
    setDraft("");
    setFile(null);
    setReplyingTo(null);
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
        // p2: replyTo 는 답글 모드일 때만 페이로드에 포함 (기존 메시지
        // 흐름 backward-compat — 답글 아닌 메시지에 빈 객체 안 들어감).
        ...(replySnapshot
          ? {
              replyTo: {
                messageId: replySnapshot.id,
                nickname: replySnapshot.nickname,
                snippet: (replySnapshot.message || "").slice(0, 50),
                ...(replySnapshot.fileType
                  ? { fileType: replySnapshot.fileType }
                  : {}),
              },
            }
          : {}),
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
      // 전송 실패 시 답글 모드 복구 (사용자 의도 보존).
      setReplyingTo(replySnapshot);
    }
    setSending(false);
    messageInputRef.current?.focus({ preventScroll: true });
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
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
        data-floating-fab="chat"
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
          // Drop to bottom: 8 whenever the chat input is focused on
          // a mobile-class device (bus is gated on mobile inside the
          // setter, so PC mouse focus never trips this). Otherwise
          // stay at 96 to leave room for BottomNav. Animated for
          // continuity with the chat panel's own bottom shift.
          bottom: anyChatInputFocused ? 8 : 96,
          transition: "bottom 160ms ease",
        }}
        className="group fixed right-4 z-[100] flex h-14 w-14 items-center justify-center rounded-full"
      >
        {/* Pulse ring — soft aura. dl2: cream-tinted halo (no peach
            tint) at the same animation timing as cosmic. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: isDawnlight2
              ? hasUnread
                ? "radial-gradient(circle, rgba(254,245,230,0.85) 0%, rgba(254,245,230,0.45) 45%, transparent 75%)"
                : "radial-gradient(circle, rgba(254,245,230,0.4) 0%, transparent 70%)"
              : hasUnread
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
            borderColor: isDawnlight2
              ? hasUnread
                ? "rgba(254,245,230,0.95)"
                : "rgba(254,245,230,0.55)"
              : hasUnread
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
              borderColor: isDawnlight2
                ? "rgba(254,245,230,0.85)"
                : "rgba(255,229,196,0.9)",
              animation: "pulse-ring 1s cubic-bezier(0,0,0.2,1) -0.5s infinite",
            }}
          />
        )}

        {/* Twinkle particles — only when unread */}
        {hasUnread && <TwinkleParticles dl2={isDawnlight2} />}

        {/* Main round button. dl2: flat cream surface with a soft
            drop-shadow (the peach→pink radial gradient + bevel inset
            from cosmic is what reads as 3D, so we strip both for the
            "단순화" the dawnlight2 spec asks for). Glyph color stays
            text-abyss — readable against cream, same dark-on-light
            contrast cosmic gives against peach. */}
        <span
          className="relative flex h-12 w-12 items-center justify-center rounded-full text-abyss transition-transform group-hover:scale-105"
          style={{
            background: isDawnlight2
              ? "#fef5e6"
              : "radial-gradient(circle at 30% 30%, #FFE5C4 0%, #FFB5A7 55%, #D896C8 100%)",
            boxShadow: isDawnlight2
              ? hasUnread
                ? "0 4px 14px rgba(0,0,0,0.18), 0 0 24px rgba(254,245,230,0.45)"
                : "0 2px 8px rgba(0,0,0,0.15)"
              : hasUnread
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
            className="fixed right-4 z-[200] flex flex-col overflow-hidden rounded-2xl"
            style={{
              width: "min(380px, calc(100vw - 2rem))",
              // When the mobile keyboard is up we drop the 96 px reserve
              // for the chat icon (the icon is hidden behind the panel
              // anyway) so the panel bottom sits just above the keyboard
              // top. `dvh` adjusts for the keyboard so the panel can't
              // overflow the visible area on small phones — using `vh`
              // here let it run off the top of a small iPhone with the
              // keyboard up. Stay on `vh` + 96 px in the default
              // (no-keyboard) case so the panel keeps its existing
              // gap above the BottomNav.
              bottom: inputFocused && isMobile ? 8 : 96,
              height:
                inputFocused && isMobile
                  ? "min(500px, calc(100dvh - 1rem))"
                  : "min(500px, calc(100vh - 7rem))",
              transition: "bottom 200ms ease, height 200ms ease",
              background: isDawnlight2 ? "#fef5e6" : "rgba(26,15,61,0.94)",
              border: isDawnlight2
                ? "1px solid rgba(92,58,31,0.10)"
                : "1px solid rgba(216,150,200,0.3)",
              // dl2: warm ink shadow, no purple aura. The cream surface
              // already reads as a flat sheet, so we drop the heavy
              // double-layer glow for a single soft warm shadow.
              boxShadow: isDawnlight2
                ? "0 8px 28px rgba(92,58,31,0.18)"
                : "0 12px 40px rgba(0,0,0,0.55), 0 0 40px rgba(107,75,168,0.35)",
              backdropFilter: isDawnlight2 ? undefined : "blur(16px)",
              WebkitBackdropFilter: isDawnlight2 ? undefined : "blur(16px)",
            }}
            initial={{ y: 20, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onAnimationComplete={handlePanelAnimationComplete}
            role="dialog"
            aria-label="길드 채팅"
          >
            {/* Nebula glow decorations — cosmic only. The dl2 cream
                panel reads cleanest with no inner color washes. */}
            {!isDawnlight2 && (
              <>
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
              </>
            )}

            {/* Header */}
            <div
              className="relative flex shrink-0 items-center justify-between px-4 py-3"
              style={{
                borderBottom: isDawnlight2
                  ? "1px solid rgba(92,58,31,0.15)"
                  : "1px solid rgba(216,150,200,0.2)",
              }}
            >
              <h3
                className="leading-none"
                style={
                  isDawnlight2
                    ? {
                        fontFamily: "'Noto Serif KR', serif",
                        fontSize: "15px",
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        color: "#5c3a1f",
                      }
                    : {
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
                      }
                }
              >
                길드 채팅
              </h3>
              <button
                type="button"
                onClick={closePanel}
                aria-label="닫기"
                className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
                style={
                  isDawnlight2
                    ? {
                        background: "transparent",
                        border: "1px solid rgba(92,58,31,0.15)",
                        color: "#8a6a4a",
                      }
                    : {
                        background: "rgba(11,8,33,0.5)",
                        border: "1px solid rgba(216,150,200,0.3)",
                        color: "#FFE5C4",
                      }
                }
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Messages list — vertical scroll only, no horizontal */}
            <div
              ref={listRef}
              onScroll={handleListScroll}
              className="nebula-scroll relative flex-1 overflow-y-auto overflow-x-hidden px-3 py-2"
            >
              <div ref={contentRef}>
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p
                      className="font-serif text-[12px] italic"
                      style={{
                        color: isDawnlight2
                          ? "#8a6a4a"
                          : "rgba(155,143,184,0.7)",
                      }}
                    >
                      아직 채팅이 없어요
                    </p>
                  </div>
                ) : (
                  decoratedMessages.map(
                    ({ m, showAvatar, showNickname, showTime }) => (
                      <MessageItem
                        key={m.id}
                        m={m}
                        mine={!!nickname && m.nickname === nickname}
                        dl2={isDawnlight2}
                        showAvatar={showAvatar}
                        showNickname={showNickname}
                        showTime={showTime}
                        avatar={avatars.get(m.nickname)}
                        onReply={handleReply}
                        registerRef={registerMessageRef}
                        onJumpToOriginal={handleJumpToOriginal}
                        highlighted={highlightedMessageId === m.id}
                        messageReactions={chatReactions.get(m.id)}
                      />
                    ),
                  )
                )}
                <div ref={endRef} aria-hidden />
              </div>
            </div>

            {/* Compose area / auth gate */}
            {!ready ? (
              <div
                className="shrink-0 px-4 py-4 text-center font-serif text-[11px] italic"
                style={{
                  borderTop: isDawnlight2
                    ? "1px solid rgba(92,58,31,0.15)"
                    : "1px solid rgba(216,150,200,0.2)",
                  color: isDawnlight2 ? "#8a6a4a" : "rgb(155,143,184)",
                }}
              >
                불러오는 중...
              </div>
            ) : nickname ? (
              <div
                className="relative shrink-0 px-3 py-3"
                style={{
                  borderTop: isDawnlight2
                    ? "1px solid rgba(92,58,31,0.15)"
                    : "1px solid rgba(216,150,200,0.2)",
                }}
              >
                {/* p2: 답글 모드 인라인 박스 — compose 위, X 버튼으로 해제. */}
                {replyingTo && (
                  <div
                    className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2"
                    style={
                      isDawnlight2
                        ? {
                            background: "rgba(255,212,184,0.35)",
                            borderLeft: "3px solid #ffb88a",
                          }
                        : {
                            background: "rgba(26,15,61,0.55)",
                            borderLeft: "3px solid rgba(216,150,200,0.7)",
                          }
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate font-serif text-[11px] font-semibold"
                        style={{
                          color: isDawnlight2 ? "#5c3a1f" : "#FFE5C4",
                        }}
                      >
                        ↪ {replyingTo.nickname}님에게 답글
                      </div>
                      <div
                        className="truncate font-serif text-[11px]"
                        style={{
                          color: isDawnlight2
                            ? "rgba(92,58,31,0.8)"
                            : "rgba(244,239,255,0.8)",
                          marginTop: 1,
                        }}
                      >
                        {replyingTo.message ||
                          (replyingTo.fileType === "video"
                            ? "[영상]"
                            : replyingTo.fileType === "gif" ||
                                replyingTo.fileType === "image"
                              ? "[사진]"
                              : "")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearReply}
                      aria-label="답글 취소"
                      className="shrink-0"
                      style={{
                        padding: 2,
                        color: isDawnlight2 ? "#8a6a4a" : "#D896C8",
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* File preview */}
                {file && filePreview && (
                  <div
                    className="mb-2 flex items-center gap-2 overflow-hidden rounded-xl p-2"
                    style={
                      isDawnlight2
                        ? {
                            border: "1px solid rgba(92,58,31,0.10)",
                            background: "#f0e4cc",
                          }
                        : {
                            border: "1px solid rgba(216,150,200,0.2)",
                            background: "rgba(11,8,33,0.5)",
                            backdropFilter: "blur(4px)",
                          }
                    }
                  >
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
                    <span
                      className="min-w-0 flex-1 truncate font-serif text-[10px]"
                      style={{ color: isDawnlight2 ? "#8a6a4a" : "rgb(155,143,184)" }}
                    >
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      aria-label="첨부 제거"
                      disabled={sending}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50"
                      style={{ color: isDawnlight2 ? "#8a6a4a" : "#FFE5C4" }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* @-mention 자동완성 — input row 위 sibling. MentionPicker 가
                    cursor==null 또는 멘션 꼬리 없을 때 null 을 돌려주므로
                    conditional 없이 항상 mount. */}
                <MentionPicker
                  text={draft}
                  cursor={mentionCursor}
                  onSelect={(nickname, range) => {
                    const result = applyMentionInsert(
                      draft,
                      range.start,
                      range.end,
                      nickname,
                    );
                    setDraft(result.text);
                    setMentionCursor(result.cursor);
                    requestAnimationFrame(() => {
                      if (messageInputRef.current) {
                        messageInputRef.current.focus();
                        messageInputRef.current.setSelectionRange(
                          result.cursor,
                          result.cursor,
                        );
                      }
                    });
                  }}
                  dl2={isDawnlight2}
                />

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
                    className={
                      isDawnlight2
                        ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-50"
                        : `flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-abyss/50 text-stardust backdrop-blur-sm transition-all disabled:opacity-50 ${
                            file
                              ? "border-peach-accent/70 text-peach-accent"
                              : "border-nebula-pink/30 hover:border-nebula-pink/60"
                          }`
                    }
                    style={
                      isDawnlight2
                        ? {
                            background: "#ffffff",
                            border: file
                              ? "1px solid rgba(184,84,32,0.4)"
                              : "1px solid rgba(92,58,31,0.20)",
                            color: file ? "#b85420" : "#5c3a1f",
                          }
                        : undefined
                    }
                  >
                    <Camera className="h-4 w-4" />
                  </button>

                  <input
                    ref={messageInputRef}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setMentionCursor(e.target.selectionStart);
                    }}
                    onSelect={(e) =>
                      setMentionCursor(e.currentTarget.selectionStart)
                    }
                    onClick={(e) =>
                      setMentionCursor(e.currentTarget.selectionStart)
                    }
                    onKeyUp={(e) =>
                      setMentionCursor(e.currentTarget.selectionStart)
                    }
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="메시지를 입력하세요"
                    aria-busy={sending}
                    className={
                      isDawnlight2
                        ? "min-w-0 flex-1 rounded-full px-3 py-2 font-serif text-[12px] focus:outline-none placeholder:text-[#8a6a4a]"
                        : "min-w-0 flex-1 rounded-full border border-nebula-pink/30 bg-abyss/50 px-3 py-2 font-serif text-[12px] text-text-primary placeholder:text-text-sub/70 backdrop-blur-sm focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30"
                    }
                    style={
                      isDawnlight2
                        ? {
                            background: "#ffffff",
                            border: "1px solid rgba(92,58,31,0.20)",
                            color: "#5c3a1f",
                            caretColor: "#5c3a1f",
                          }
                        : undefined
                    }
                  />

                  <button
                    type="button"
                    // preventDefault on pointer-down stops the button from
                    // stealing focus (and thereby dismissing the mobile
                    // keyboard) when the user taps Send. onTouchStart
                    // covers Safari iOS — onMouseDown alone misses some
                    // mobile flows where touchstart fires but no synthetic
                    // mousedown follows quickly enough to keep focus.
                    onMouseDown={(e) => e.preventDefault()}
                    onTouchStart={(e) => e.preventDefault()}
                    onClick={handleSend}
                    disabled={sending || (!draft.trim() && !file)}
                    aria-label="메시지 전송"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                    style={
                      isDawnlight2
                        ? {
                            // Flat peach disc + ink glyph — same CTA tone
                            // as the 한마디 남기기 button. No gradient,
                            // no halo: the cream panel reads cleaner with
                            // a single-tone surface.
                            background: "#ffd4b8",
                            color: "#5c3a1f",
                          }
                        : {
                            background:
                              "linear-gradient(135deg, #FFE5C4, #FFB5A7, #D896C8)",
                            boxShadow: "0 0 12px rgba(255,181,167,0.5)",
                            color: "#1a0f3d",
                          }
                    }
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="shrink-0 px-4 py-4 text-center font-serif text-[11px] italic"
                style={{
                  borderTop: isDawnlight2
                    ? "1px solid rgba(92,58,31,0.15)"
                    : "1px solid rgba(216,150,200,0.2)",
                  color: isDawnlight2 ? "#8a6a4a" : "rgb(155,143,184)",
                }}
              >
                로그인이 필요합니다
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
