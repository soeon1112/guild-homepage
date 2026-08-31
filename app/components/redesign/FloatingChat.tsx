"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Camera, Send, X } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
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
  // p3.3: 기존 ↩ 답글 버튼 → ⋯ 액션 메뉴 트리거. 이모지 패널 자체는
  // p3.3-fix 에서 parent fixed inset-0 모달로 이동 (앱과 일관).
  onActionMenu: (m: ChatMessage) => void;
  // p2.5: row DOM 노드 등록 + 인용 박스 클릭 → 원본 점프 + 강조 토글.
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  onJumpToOriginal: (messageId: string) => void;
  highlighted: boolean;
  // p3.2: 리액션 배지 표시 (토글은 p3.3) — undefined 면 row 자체 안 그림.
  messageReactions: MessageReactions | undefined;
};

const CHAT_AVATAR_SIZE = 36;

// p3.3: 액션 메뉴 이모지 — 카톡 표준 6개 (사용자 결정).
const CHAT_REACTION_EMOJIS = ["❤️", "😂", "😢", "👍", "🎉", "😮"] as const;

// Chat-p5: 과거 메시지 페이지네이션 — 초기 30개, 위로 스크롤할 때마다
// 30개씩 limit 증가, 최대 500개에서 정지.
const CHAT_MESSAGE_LIMIT_INITIAL = 30;
const CHAT_MESSAGE_LIMIT_STEP = 30;
const CHAT_MESSAGE_LIMIT_MAX = 500;

const MessageItem = memo(
  function MessageItem({
    m,
    mine,
    dl2,
    showAvatar,
    showNickname,
    showTime,
    avatar,
    onActionMenu,
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
        {/* Home 채팅 리뉴얼(NewHomeChat) P4.2.1 — activity 카드에 대한
            답글은 nickname 을 빈 문자열로 저장해 이 줄이 안 보이게 한다.
            chat 원본은 nickname 이 항상 채워져 있어 동작 변화 없음. */}
        {m.replyTo.nickname && (
          <div
            className="truncate text-[10px] font-semibold"
            style={{ color: replyQuoteStyle.color as string | undefined }}
          >
            ↪ {m.replyTo.nickname}
          </div>
        )}
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

    // p3.3-fix3: mine 시 자식 우측 정렬 — 답글 인용 박스가 column 폭을
    // 결정해 bubble 이 왼쪽으로 밀리던 회귀. items-end 로 replyQuote /
    // bubble / image 모두 우측 끝 anchor.
    const contentColumn = (
      <div className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
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

    // p3.3-fix: 메시지 옆 ⋯ 트리거 버튼만. 패널 자체는 parent fixed
    // inset-0 가운데 모달 (앱과 일관). 메시지 옆 absolute popover 는 채팅
    // 패널 overflow 에 잘리거나 메시지 위치별로 일관성 떨어지던 회귀.
    // chat-action-trigger 클래스 — parent outside click handler 가 트리거
    // 자신을 외부 탭으로 오인하지 않도록.
    const replyBtn = (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onActionMenu(m);
        }}
        aria-label="액션 메뉴"
        className="chat-action-trigger self-end opacity-40 transition-opacity hover:opacity-100"
        style={{
          padding: 4,
          color: dl2 ? "#8a6a4a" : "rgb(155,143,184)",
          lineHeight: 1,
          fontSize: 16,
          letterSpacing: 1,
        }}
      >
        ⋯
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
    // p3.3-fix: popover 가 parent 가운데 모달로 이동 — MessageItem 은
    // 트리거 버튼만 들고 actionMenuOpen / onSelectEmoji 등 자체 비교 불요.
    prev.onActionMenu === next.onActionMenu &&
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
  // Chat-p5: 페이지네이션 — limit 자체를 늘려 같은 onSnapshot 구독을
  // 재활용 (별도 startAfter 쿼리 없음). loadingMore 는 다음 snapshot
  // 도달 시 해제.
  const [messageLimit, setMessageLimit] = useState(CHAT_MESSAGE_LIMIT_INITIAL);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  // 멘션 자동완성용 — input 의 cursor 위치를 추적해 MentionPicker 가
  // `@<query>` 꼬리 감지에 쓴다. null 이면 picker 가 항상 안 뜸.
  const [mentionCursor, setMentionCursor] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  // Whether the message input currently holds focus AND the device is
  // mobile-class. Drives a bus signal (setChatInputFocused) that tells
  // BottomNav to hide immediately, without waiting for visualViewport to
  // shrink. PC users never satisfy `isMobile`, so the effect never fires
  // there. (Chat-p4: the panel itself is always fullscreen on mobile now,
  // independent of input focus — this flag no longer affects panel size.)
  const [inputFocused, setInputFocused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Bus reflects this FloatingChat's own input focus on mobile.
  // Used to drop the FAB icon when the input focuses.
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

  // Subscribe to the guild chat collection (paginated, asc for display).
  // Chat-p5: startAfter 별도 쿼리 대신 같은 onSnapshot 의 limit 값 자체를
  // 늘려 재구독 — messageLimit 이 바뀔 때마다 이 effect 가 재실행된다.
  useEffect(() => {
    const q = query(
      collection(db, "chat"),
      orderBy("createdAt", "desc"),
      limit(messageLimit),
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
      // Chat-p5: limit 증가로 재구독한 snapshot 이 도달하면 로딩 해제.
      // 최초 구독(초기 30개) 시에도 무해 — 이미 false 라 no-op.
      setLoadingMore(false);
    });
    return unsub;
  }, [messageLimit]);

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
  const { reactions: chatReactions, toggleReaction } = useChatReactions(
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
  // p3.3: 진입 방식 변경 — 메시지 옆 ⋯ 버튼 → popover (이모지 6 + ↩ 답글).
  // handleSelectReplyFromMenu 가 popover 내부 ↩ 클릭으로 분기. handleAction
  // Menu 가 popover 자체 토글. 기존 handleReply (↩ 직접 버튼) 제거.
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [actionMenuFor, setActionMenuFor] = useState<ChatMessage | null>(null);
  const handleActionMenu = useCallback(
    (m: ChatMessage) => setActionMenuFor(m),
    [],
  );
  const handleClearReply = useCallback(() => setReplyingTo(null), []);
  const handleSelectEmoji = useCallback(
    async (emoji: string) => {
      const target = actionMenuFor;
      if (!target) return;
      setActionMenuFor(null);
      try {
        await toggleReaction(target.id, emoji);
      } catch (e) {
        console.error("[Reaction] failed", e);
      }
    },
    [actionMenuFor, toggleReaction],
  );
  const handleSelectReplyFromMenu = useCallback(() => {
    const target = actionMenuFor;
    if (!target) return;
    setReplyingTo(target);
    setActionMenuFor(null);
  }, [actionMenuFor]);

  // popover 외부 클릭 닫기 — 패널 자체 (.chat-action-menu) 클릭은 제외.
  useEffect(() => {
    if (!actionMenuFor) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.(".chat-action-menu")) return;
      if (target?.closest?.(".chat-action-trigger")) return;
      setActionMenuFor(null);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [actionMenuFor]);

  // Escape 키로 닫기.
  useEffect(() => {
    if (!actionMenuFor) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionMenuFor(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [actionMenuFor]);

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
  // Chat-p5-fix: 과거 메시지 페이지네이션 스크롤 위치 보정.
  // pendingOlderLoadRef 가 true 인 동안은 (a) "새 메시지 시 맨 아래로"
  // pin(sync/raf1/raf2/ResizeObserver 전부)을 억제하고 (b) 대신 늘어난
  // 높이만큼 scrollTop 을 보정한다. 첨부 이미지가 늦게 로드되며 컨텐츠
  // 높이가 한 번 더 늘어날 수 있는데, useLayoutEffect 에서 딱 한 번만
  // 보정하고 flag 를 바로 꺼버리면 그 뒤 이미지 로드로 커지는 높이가
  // ResizeObserver 의 "새 메시지" pin 경로로 흘러 맨 아래로 스크롤되는
  // 버그가 났다(과거 스크롤이 안 먹히는 것처럼 보임) — 그래서 flag 를
  // 넉넉한 시간(900ms) 동안 유지하고, 그 안의 모든 리사이즈 이벤트를
  // 누적 보정한다. prevContentHeightRef 를 매 보정마다 최신 높이로
  // 갱신해야 다음 발화의 델타가 정확하다.
  const pendingOlderLoadRef = useRef(false);
  const prevContentHeightRef = useRef(0);
  const prevScrollTopRef = useRef(0);
  // Chat-p6: 과거 로딩과 무관하게, "다른 사람이 보낸 새 메시지" auto-pin은
  // 페이지네이션이 끝난 뒤에도 무조건 하단으로 끌고 갔다 — 사용자가 과거
  // 기록을 읽으려고 위쪽에 머물러 있어도 새 메시지가 오면 튕겨나갔다.
  // openSettledRef 는 "패널을 막 연 직후의 정착 구간(항상 최신으로
  // 열려야 함)"을 표시 — 이 구간 동안은 거리와 무관하게 pin 허용. 웹은
  // listRef.current 에서 scrollTop/scrollHeight 를 언제든 동기적으로
  // 읽을 수 있어 RN 과 달리 별도 추적 ref 없이 pin() 안에서 바로 계산.
  const openSettledRef = useRef(false);
  const NEAR_BOTTOM_PIN_THRESHOLD = 150;
  // 리사이즈 이벤트(useLayoutEffect 또는 ResizeObserver, 둘 중 먼저 온
  // 쪽)를 pendingOlderLoadRef 로 가드된 채 보정하는 공용 함수.
  const compensateOlderLoadScroll = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const delta = list.scrollHeight - prevContentHeightRef.current;
    if (delta > 0) {
      list.scrollTop = prevScrollTopRef.current + delta;
      prevScrollTopRef.current = list.scrollTop;
    }
    prevContentHeightRef.current = list.scrollHeight;
  }, []);
  const loadOlder = useCallback(() => {
    if (loadingMore) return;
    // Chat-p5-fix2: loadingMore 는 Firestore 응답이 오면(보통 900ms 보다
    // 훨씬 빨리) 바로 꺼진다 — 그때 사용자가 여전히 상단 40% 안에 있으면
    // 이 가드가 없는 한 다음 loadOlder 가 또 트리거돼 prevXxxRef 를
    // 앞선 로드의 보정이 채 끝나기 전에 덮어써버린다(두 로드가 겹치며
    // 스크롤 튐의 실제 원인). pendingOlderLoadRef 창이 열려있는 동안은
    // 무조건 재진입 차단.
    if (pendingOlderLoadRef.current) return;
    if (messageLimit >= CHAT_MESSAGE_LIMIT_MAX) return;
    // 직전 snapshot 이 messageLimit 보다 적게 돌려줬다 = 더 이상 과거
    // 메시지가 없다는 뜻 — 조용히 정지 (안내 X, 사양).
    if (messages.length < messageLimit) return;
    const list = listRef.current;
    if (list) {
      prevContentHeightRef.current = list.scrollHeight;
      prevScrollTopRef.current = list.scrollTop;
    }
    pendingOlderLoadRef.current = true;
    setTimeout(() => {
      pendingOlderLoadRef.current = false;
    }, 900);
    setLoadingMore(true);
    setMessageLimit((prev) =>
      Math.min(prev + CHAT_MESSAGE_LIMIT_STEP, CHAT_MESSAGE_LIMIT_MAX),
    );
  }, [loadingMore, messageLimit, messages.length]);
  // useLayoutEffect(paint 전, 동기) — DOM 이 새 messages 로 갱신된 직후
  // scrollHeight 를 다시 재서 늘어난 만큼 scrollTop 을 더한다. 여기서
  // 보정해야 화면에 "위로 확 튀는" 프레임이 한 번도 그려지지 않는다.
  useLayoutEffect(() => {
    if (!pendingOlderLoadRef.current) return;
    compensateOlderLoadScroll();
  }, [messages, compensateOlderLoadScroll]);
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
      // 현재 messageLimit 밖 옛 메시지(200개 상한 밖 포함) — DOM 에 없음.
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
    const list = listRef.current;
    if (!list) return;

    // p2.5-fix2: 답글 점프 lock 해제 감지 — 기존 로직 그대로.
    if (isJumpingRef.current && userTouchedRef.current) {
      const distanceFromBottom =
        list.scrollHeight - list.scrollTop - list.clientHeight;
      if (distanceFromBottom < 80) {
        isJumpingRef.current = false;
        userTouchedRef.current = false;
      }
    }

    // Chat-p5: 상단 40% 안쪽 도달 시 과거 메시지 추가 로드. loadOlder
    // 자체가 loadingMore/messageLimit/messages.length 로 self-guard 하므로
    // 스크롤 중 반복 호출돼도 안전(no-op).
    if (list.scrollTop < list.scrollHeight * 0.4) {
      loadOlder();
    }
  }, [loadOlder]);
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
      // Chat-p5-fix: pendingOlderLoadRef 도 동일하게 skip — 과거 메시지
      // 로드로 messages 가 늘어난 경우 맨 아래로 끌려가지 않게.
      // Chat-p6: openSettledRef 정착 구간이 지난 뒤에는, 하단에서 멀리
      // 떨어져 있으면(과거 기록을 읽는 중) 다른 사람의 새 메시지로 인한
      // pin 도 skip — 본인이 보낸 메시지는 handleSend 의 별도
      // scrollIntoView 로 이미 처리되므로 이 조건의 영향을 안 받는다.
      if (isJumpingRef.current) return;
      if (pendingOlderLoadRef.current) return;
      if (openSettledRef.current) {
        const l = listRef.current;
        if (l) {
          const distanceFromBottom = l.scrollHeight - l.scrollTop - l.clientHeight;
          if (distanceFromBottom > NEAR_BOTTOM_PIN_THRESHOLD) return;
        }
      }
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
    // Chat-p5-fix: 과거 로드 대기 중(pendingOlderLoadRef)이면 이 리사이즈도
    // "새 메시지" pin 이 아니라 스크롤 위치 보정으로 처리 — 첨부 이미지가
    // 늦게 로드돼 useLayoutEffect 이후에도 컨텐츠가 한 번 더 커지는
    // 케이스를 여기서 잡는다.
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (pendingOlderLoadRef.current) {
              compensateOlderLoadScroll();
              return;
            }
            pin("resize");
          })
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

  // Chat-p6: openSettledRef 관리 — 패널이 막 열린 뒤 위 effect 의 지연
  // pin 스케줄(sync/raf1/raf2 + ResizeObserver)이 대체로 정착될 시간
  // (350ms) 동안은 "정착 전"으로 두어 거리 조건 없이 항상 최신으로
  // 열리게 하고, 그 뒤부터 거리 조건이 적용되도록 켠다.
  useEffect(() => {
    if (!open) {
      openSettledRef.current = false;
      return;
    }
    openSettledRef.current = false;
    const t = setTimeout(() => {
      openSettledRef.current = true;
    }, 350);
    return () => clearTimeout(t);
  }, [open]);

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
            ? `연합 채팅 열기, 새 메시지 ${unreadCount}건`
            : "연합 채팅 열기"
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
          {hasUnread ? `새 메시지 ${unreadCount}건` : "연합 채팅"}
        </span>
      </motion.button>

      {/* Corner panel — messenger style, no backdrop, page stays interactive */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed right-4 z-[200] flex flex-col overflow-hidden rounded-2xl"
            style={{
              // Chat-p4: 모바일은 좌우 인셋 0 으로 화면 폭 전체(풀스크린).
              // 데스크탑은 기존 우측 코너 anchor(className의 right-4)
              // 그대로 — undefined 로 두면 Tailwind 클래스 값이 적용된다.
              left: isMobile ? 0 : undefined,
              right: isMobile ? 0 : undefined,
              width: isMobile ? undefined : "min(380px, calc(100vw - 2rem))",
              // Chat-p4: 모바일은 항상 풀스크린 바닥 고정(statusBar
              // 세이프에어리어까지). `dvh` 가 키보드 등장 시 자동으로
              // 줄어들어(동적 뷰포트) 별도 키보드 케이스 불필요.
              bottom: isMobile ? 0 : 96,
              height: isMobile
                ? "calc(100dvh - env(safe-area-inset-top, 0px))"
                : "min(600px, calc(100vh - 7rem))",
              // Chat-p4: 모바일 풀스크린은 화면 가장자리까지 — 코너
              // rounded-2xl 제거.
              borderRadius: isMobile ? 0 : undefined,
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
            aria-label="연합 채팅"
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
                연합 채팅
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
                {/* Chat-p5: 과거 메시지 로딩 인디케이터 — 목록 맨 위. */}
                {loadingMore ? (
                  <p
                    className="py-2 text-center font-serif text-[11px] italic"
                    style={{
                      color: isDawnlight2 ? "#8a6a4a" : "rgb(155,143,184)",
                    }}
                  >
                    불러오는 중...
                  </p>
                ) : null}
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
                        onActionMenu={handleActionMenu}
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

            {/* p3.3-fix2: 이모지 액션 메뉴 — 채팅 패널 안 정중앙 (panel
                motion.div 의 직속 자식, absolute inset-0). 다른 모달 패턴
                과 일관 — viewport 전체가 아닌 panel 영역만 backdrop 어두워
                지고 패널 정중앙에 floating row. panel 의 overflow:hidden
                덕에 모달이 panel 밖으로 새지 않음. */}
            {actionMenuFor && (
              <div
                className="chat-action-menu absolute inset-0 z-30 flex items-center justify-center"
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setActionMenuFor(null);
                  }
                }}
                role="dialog"
                aria-modal="true"
                aria-label="메시지 액션 메뉴"
              >
                <div
                  className="flex items-center gap-1 rounded-full px-3 py-2"
                  style={
                    isDawnlight2
                      ? {
                          background: "rgba(254,245,230,0.98)",
                          border: "1px solid rgba(92,58,31,0.2)",
                          boxShadow: "0 8px 24px rgba(92,58,31,0.22)",
                        }
                      : {
                          background: "rgba(26,15,61,0.97)",
                          border: "1px solid rgba(216,150,200,0.35)",
                          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                          backdropFilter: "blur(4px)",
                        }
                  }
                  onClick={(e) => e.stopPropagation()}
                >
                  {CHAT_REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectEmoji(emoji);
                      }}
                      aria-label={`리액션 ${emoji}`}
                      className="flex h-10 w-10 items-center justify-center rounded-full transition-opacity hover:opacity-70"
                      style={{ fontSize: 22, lineHeight: 1 }}
                    >
                      {emoji}
                    </button>
                  ))}
                  <span
                    aria-hidden
                    className="mx-1 inline-block h-6 w-px"
                    style={{
                      background: isDawnlight2
                        ? "rgba(92,58,31,0.18)"
                        : "rgba(216,150,200,0.25)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectReplyFromMenu();
                    }}
                    aria-label="답글"
                    className="flex h-10 w-10 items-center justify-center rounded-full transition-opacity hover:opacity-70"
                    style={{
                      fontSize: 18,
                      color: isDawnlight2 ? "#5c3a1f" : "#FFE5C4",
                      lineHeight: 1,
                    }}
                  >
                    ↩
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
