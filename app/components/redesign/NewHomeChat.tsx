"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Camera, Filter, Send, X } from "lucide-react";
import {
  addDoc,
  collection,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import NicknameLink from "@/app/components/NicknameLink";
import { CommentImageView } from "@/app/components/CommentImage";
import { formatSmart } from "@/src/lib/formatSmart";
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
import { useHomeTimeline, type TimelineItem } from "@/src/lib/useHomeTimeline";
import { ActivityCard } from "@/app/components/ActivityCard";
import { useCommentActionSheet } from "@/src/lib/useCommentActionSheet";

// Home 채팅 메인 리뉴얼 Phase 3 — 채팅(chat) + 최신 소식(activity) 카드가
// 시간순으로 섞인 풀스크린 채팅 컴포넌트. 사용처는 아직 없음(Phase 4에서
// 언쏘 조건부 홈으로 붙인다).
//
// 이 파일은 FloatingChat.tsx(기존 우측 하단 FAB+패널) 를 절대 import/수정
// 하지 않는다. 메시지 렌더 / 리액션 / 답글 / pagination / auto-pin / 사진
// 업로드 로직은 그 파일에서 verbatim 으로 복사해왔다 — 아래 각 블록의
// 주석에 원본 대응 위치를 남겨둔다. FloatingChat 은 "오버레이 패널"
// 전제(부모 코너 anchor, unread 배지, open/close 애니메이션)라 이 문서의
// "항상 열려 있는 풀스크린 홈" 요구와 맞지 않는 부분(FAB, 배지, lastRead
// 마킹)은 의도적으로 포팅하지 않았다 — 보고서 참고.
//
// 배경: 원본 FloatingChat 의 dl2 패널은 불투명 cream(#fef5e6) 배경을 썼지만
// (플로팅 시트 느낌), 이 컴포넌트는 dl2 홈 페이지의 공유 어두운 배경
// (StarryBackground) 위에 얹히는 페이지 콘텐츠라 컨테이너 자체는
// transparent — 메시지 버블 자체는 cream/peach 라 밝은 바탕이 없어도
// WhispersFeed/CabinLogs 카드처럼 그대로 잘 읽힌다.

type ChatItem = Extract<TimelineItem, { kind: "chat" }>;
type ActivityItem = Extract<TimelineItem, { kind: "activity" }>;

function isChatItem(item: TimelineItem): item is ChatItem {
  return item.kind === "chat";
}

// P4.2 답글 — chat/{id}.replyTo 는 이미 { messageId, nickname, snippet,
// fileType? } 스냅샷 객체라(FloatingChat.tsx, 채팅 답글 시스템 미접촉),
// activity 에 대한 답글도 스키마 변경 없이 이 모양 그대로 넣을 수 있다.
// ChatItem 은 이 4개 필드를 구조적으로 이미 만족하므로(초과 필드는
// 문제 없음), replyingTo 를 ChatItem 전용에서 이 최소 타입으로만
// 넓히면 activity 답글도 같은 handleSend 경로를 그대로 탄다.
type ReplyTarget = {
  id: string;
  nickname: string;
  message: string;
  fileType?: ChatFileType;
};

function formatTime(ts: Timestamp | null): string {
  if (!ts) return "";
  return formatSmart(ts.toDate());
}

type ChatFileType = "image" | "gif" | "video";

function detectFileType(file: File): ChatFileType {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/") || name.endsWith(".mp4")) return "video";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  return "image";
}

// FloatingChat.tsx:169 verbatim.
const CHAT_REACTION_EMOJIS = ["❤️", "😂", "😢", "👍", "🎉", "😮"] as const;
// FloatingChat.tsx:1121 verbatim — pin() 이 하단에서 얼마나 떨어지면
// "과거 기록을 읽는 중"으로 보고 자동 pin 을 skip 할지.
const NEAR_BOTTOM_PIN_THRESHOLD = 150;

// ═══════════════════════════════════════════════════════════════════
// MessageItem — FloatingChat.tsx:177-561 verbatim 복사(비-export 라
// import 불가, 원본은 절대 수정하지 않음). dl2 분기만 남기고 cosmic
// 분기는 제거 — 이 화면은 dl2 전용이라 항상 dl2=true 로 호출된다.
// ═══════════════════════════════════════════════════════════════════
type MessageItemProps = {
  m: ChatItem;
  mine: boolean;
  showAvatar: boolean;
  showNickname: boolean;
  showTime: boolean;
  avatar:
    | { imageUrl: string; registered: boolean; docId: string }
    | undefined;
  onActionMenu: (m: ChatItem) => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  onJumpToOriginal: (messageId: string) => void;
  highlighted: boolean;
  messageReactions: MessageReactions | undefined;
};

const CHAT_AVATAR_SIZE = 36;

const MessageItem = memo(
  function MessageItem({
    m,
    mine,
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
    const rowRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      registerRef(m.id, rowRef.current);
      return () => registerRef(m.id, null);
    }, [m.id, registerRef]);

    const highlightStyle: React.CSSProperties = highlighted
      ? {
          background: "rgba(255,212,184,0.32)",
          borderRadius: 10,
          marginInline: -4,
          paddingInline: 4,
          paddingBlock: 2,
        }
      : {};
    const bubbleStyle: React.CSSProperties = mine
      ? {
          background: "#ffd4b8",
          border: "1px solid rgba(92,58,31,0.10)",
          color: "#5c3a1f",
        }
      : {
          background: "#f0e4cc",
          border: "1px solid rgba(92,58,31,0.10)",
          color: "#5c3a1f",
        };
    const imageWrapStyle: React.CSSProperties = {
      border: "1px solid rgba(92,58,31,0.10)",
      boxShadow: "0 2px 8px rgba(92,58,31,0.10)",
    };
    const timeStyle: React.CSSProperties = { color: "#8a6a4a", fontSize: 9 };

    const replyQuoteStyle: React.CSSProperties = mine
      ? {
          background: "rgba(255,212,184,0.45)",
          borderLeft: "3px solid #ffb88a",
          color: "#5c3a1f",
        }
      : {
          background: "rgba(254,245,230,0.55)",
          borderLeft: "3px solid rgba(255,212,184,0.85)",
          color: "#5c3a1f",
        };
    const replyQuoteSnippetColor = "rgba(92,58,31,0.85)";

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
      <div className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
        {replyQuote}
        {m.message && (
          <div
            className="wrap-anywhere max-w-full rounded-2xl px-3 py-2 font-serif text-[12px] leading-relaxed"
            style={bubbleStyle}
          >
            <MentionText text={m.message} dl2 />
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
                    style={{
                      background: "rgba(254,245,230,0.85)",
                      border: isMine
                        ? "1px solid rgba(255,184,138,0.85)"
                        : "1px solid rgba(92,58,31,0.2)",
                      color: "#5c3a1f",
                    }}
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

    const replyBtn = (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onActionMenu(m);
        }}
        aria-label="액션 메뉴"
        className="chat-action-trigger self-end opacity-40 transition-opacity hover:opacity-100"
        style={{ padding: 4, color: "#8a6a4a", lineHeight: 1, fontSize: 16, letterSpacing: 1 }}
      >
        ⋯
      </button>
    );

    const rowMarginTop = showAvatar ? 14 : 2;

    if (mine) {
      return (
        <div
          ref={rowRef}
          className="group flex w-full justify-end transition-[background] duration-300"
          style={{ marginTop: rowMarginTop, ...highlightStyle }}
        >
          <div className="flex max-w-[82%] items-end gap-1">
            {showTime && (
              <span className="whitespace-nowrap pb-1 font-serif tracking-wider" style={timeStyle}>
                {formatTime(m.ts)}
              </span>
            )}
            {replyBtn}
            {contentColumn}
          </div>
        </div>
      );
    }

    return (
      <div
        ref={rowRef}
        className="flex w-full items-start gap-2 transition-[background] duration-300"
        style={{ marginTop: rowMarginTop, ...highlightStyle }}
      >
        <div className="shrink-0" style={{ width: CHAT_AVATAR_SIZE, height: CHAT_AVATAR_SIZE }}>
          {showAvatar ? (
            avatar?.registered ? (
              <MemberAvatar
                imageUrl={avatar.imageUrl}
                nickname={m.nickname}
                size={CHAT_AVATAR_SIZE}
                dl2
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center rounded-full font-serif font-semibold"
                style={{
                  background: "rgba(92,58,31,0.18)",
                  border: "1px solid rgba(92,58,31,0.28)",
                  color: "rgba(92,58,31,0.75)",
                  fontSize: 14,
                }}
              >
                {m.nickname.slice(0, 1)}
              </div>
            )
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          {showNickname && (
            <div className="px-1" style={{ color: "#5c3a1f", fontSize: 12 }}>
              <NicknameLink nickname={m.nickname} className="font-semibold" />
            </div>
          )}
          <div className="flex max-w-full items-end gap-1">
            {contentColumn}
            {replyBtn}
            {showTime && (
              <span className="whitespace-nowrap pb-1 font-serif tracking-wider" style={timeStyle}>
                {formatTime(m.ts)}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.mine === next.mine &&
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
    prev.m.ts?.toMillis() === next.m.ts?.toMillis() &&
    prev.m.replyTo?.messageId === next.m.replyTo?.messageId &&
    prev.m.replyTo?.nickname === next.m.replyTo?.nickname &&
    prev.m.replyTo?.snippet === next.m.replyTo?.snippet &&
    prev.m.replyTo?.fileType === next.m.replyTo?.fileType &&
    prev.highlighted === next.highlighted &&
    reactionsEqual(prev.messageReactions, next.messageReactions) &&
    prev.onActionMenu === next.onActionMenu &&
    prev.registerRef === next.registerRef &&
    prev.onJumpToOriginal === next.onJumpToOriginal,
);

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

// ═══════════════════════════════════════════════════════════════════
// NewHomeChat — 풀스크린 메인 컴포넌트
// ═══════════════════════════════════════════════════════════════════
export function NewHomeChat() {
  const { nickname, ready } = useAuth();
  const { items, loadOlder: timelineLoadOlder, hasMoreOlder, loadingMore } =
    useHomeTimeline(30);
  // useHomeTimeline.items 는 Firestore 페이지네이션(limit 증가)이 최신
  // N개를 가져오기 위해 createdAt DESC 로 정렬돼 있다(P1 미접촉 — 그대로
  // 둠). FloatingChat.tsx:752 가 `list.reverse()`로 화면 표시용 ASC를
  // 만드는 것과 동일하게, 여기서도 렌더/그룹핑 직전에만 뒤집는다 — 이
  // 반전이 없으면 최신이 DOM 맨 위, pin()이 스크롤하는 "맨 아래"는
  // 가장 오래된 메시지가 돼버린다(배포 후 발견된 버그).
  const displayItems = useMemo(() => [...items].reverse(), [items]);

  // P4.1: "최신 소식만 보기" 필터 — NewHomeChat 내부 자체 state(옵션 A).
  // URL query/Context 대신 이렇게 둔 이유: 상단 바를 ChromeShell/전역
  // Topbar 로 옮기면 그 파일은 dl2 의 모든 페이지가 공유하는 컴포넌트라
  // "다른 페이지 미접촉" 원칙에 어긋난다. NewHomeChat 자체가 이미
  // "홈 + 언쏘"에서만 마운트되므로, 필터 버튼을 이 컴포넌트 안에 두면
  // D-2 의 조건부 노출이 별도 분기 없이 구조적으로 만족된다.
  const [filterActivityOnly, setFilterActivityOnly] = useState(false);

  const [draft, setDraft] = useState("");
  const [mentionCursor, setMentionCursor] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null);
  const [actionMenuFor, setActionMenuFor] = useState<ChatItem | null>(null);
  // P4.2 — ActivityCard 전용 답글 액션시트. actionMenuFor(채팅 6-이모지+
  // 답글 팝오버)와는 완전히 별개 인스턴스 — 이모지 없음, 재사용만(이
  // hook 자체는 board.tsx 등에서 이미 쓰이는 기존 코드, 수정 X).
  const { open: openActivityReplyMenu, sheet: activityReplySheet } =
    useCommentActionSheet();
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const filePreview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!filePreview) return;
    return () => URL.revokeObjectURL(filePreview);
  }, [filePreview]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // ── FloatingChat.tsx:766-770 verbatim — 채팅 아이템만의 unique 닉네임 ──
  const chatNicknames = useMemo(
    () => Array.from(new Set(items.filter(isChatItem).map((i) => i.nickname))),
    [items],
  );
  const avatars = useMemberAvatars(chatNicknames);

  // ── FloatingChat.tsx:774-781 verbatim — 채팅 아이템만 리액션 대상 ──
  const chatMessageIds = useMemo(
    () => items.filter(isChatItem).map((i) => i.id),
    [items],
  );
  const { reactions: chatReactions, toggleReaction } = useChatReactions(
    chatMessageIds,
    nickname ?? "",
  );

  // ── 카톡 그룹핑 — FloatingChat.tsx:786-809 을 chat+activity 혼합
  // displayItems(ASC) 배열에 맞게 확장. sameMinuteSameSender 가 activity
  // 이웃을 만나면 무조건 false 를 돌려주므로, "채팅 A → 카드 → 채팅 A"
  // 순서는 카드가 그룹을 끊어 양쪽 채팅 모두 showAvatar/showNickname=true.
  const decoratedItems = useMemo(() => {
    const minuteOf = (t: Timestamp | null) =>
      t && typeof t.toMillis === "function" ? Math.floor(t.toMillis() / 60000) : null;
    const sameMinuteSameSender = (a: TimelineItem, b: TimelineItem) => {
      if (!isChatItem(a) || !isChatItem(b)) return false;
      if (a.nickname !== b.nickname) return false;
      const ma = minuteOf(a.ts);
      const mb = minuteOf(b.ts);
      return ma !== null && ma === mb;
    };
    return displayItems.map((item, i) => {
      if (!isChatItem(item)) {
        return { item, showAvatar: false, showNickname: false, showTime: false };
      }
      const prev = displayItems[i - 1];
      const next = displayItems[i + 1];
      const startsGroup = !prev || !sameMinuteSameSender(prev, item);
      const endsGroup = !next || !sameMinuteSameSender(item, next);
      return { item, showAvatar: startsGroup, showNickname: startsGroup, showTime: endsGroup };
    });
  }, [displayItems]);

  // P4.1 필터 — 그룹핑은 항상 전체 스트림(displayItems) 기준으로 유지한
  // 채(꺼져 있을 때 다시 켜도 그룹 경계가 안 흔들리도록), 렌더 직전에만
  // activity 만 걸러낸다. 채팅 입력창은 필터와 무관하게 항상 노출(D-6
  // 옵션 A) — 이 필터는 "보기"만 바꾸고 입력 가능 여부는 안 건드린다.
  const visibleDecoratedItems = useMemo(
    () =>
      filterActivityOnly
        ? decoratedItems.filter(({ item }) => !isChatItem(item))
        : decoratedItems,
    [decoratedItems, filterActivityOnly],
  );

  // ── 답글 액션 메뉴 — FloatingChat.tsx:811-863 verbatim ──
  const handleActionMenu = useCallback((m: ChatItem) => setActionMenuFor(m), []);
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
  useEffect(() => {
    if (!actionMenuFor) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionMenuFor(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [actionMenuFor]);

  // ── 답글 점프 + 강조 — FloatingChat.tsx:865-1020 verbatim ──
  const messageRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isJumpingRef = useRef(false);
  const userTouchedRef = useRef(false);
  const pendingOlderLoadRef = useRef(false);
  const prevContentHeightRef = useRef(0);
  const prevScrollTopRef = useRef(0);
  const openSettledRef = useRef(false);

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

  // ── pagination — FloatingChat.tsx:921-947 의 scroll-보정 wrapper.
  // 실제 limit 증가는 useHomeTimeline.loadOlder() 가 처리(P1 미접촉) —
  // 여기서는 "더 오래된 게 있는지/이미 로딩 중인지" 가드 후 스크롤
  // 위치 보정용 스냅샷만 잡는다.
  const loadOlder = useCallback(() => {
    if (loadingMore) return;
    if (pendingOlderLoadRef.current) return;
    if (!hasMoreOlder) return;
    const list = listRef.current;
    if (list) {
      prevContentHeightRef.current = list.scrollHeight;
      prevScrollTopRef.current = list.scrollTop;
    }
    pendingOlderLoadRef.current = true;
    setTimeout(() => {
      pendingOlderLoadRef.current = false;
    }, 900);
    timelineLoadOlder();
  }, [loadingMore, hasMoreOlder, timelineLoadOlder]);

  useLayoutEffect(() => {
    if (!pendingOlderLoadRef.current) return;
    compensateOlderLoadScroll();
  }, [items, compensateOlderLoadScroll]);

  const registerMessageRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) messageRefsMap.current.set(id, el);
    else messageRefsMap.current.delete(id);
  }, []);
  const handleJumpToOriginal = useCallback((messageId: string) => {
    const el = messageRefsMap.current.get(messageId);
    if (!el) {
      alert("오래된 메시지라 찾을 수 없어요");
      return;
    }
    isJumpingRef.current = true;
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
    if (isJumpingRef.current && userTouchedRef.current) {
      const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
      if (distanceFromBottom < 80) {
        isJumpingRef.current = false;
        userTouchedRef.current = false;
      }
    }
    // FloatingChat.tsx:999 verbatim threshold — "상단 40%".
    if (list.scrollTop < list.scrollHeight * 0.4) {
      loadOlder();
    }
  }, [loadOlder]);
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

  // ── auto-pin to bottom — FloatingChat.tsx:1065-1157 verbatim, `open`
  // 게이트만 제거(이 화면은 항상 열려 있음).
  useEffect(() => {
    const list = listRef.current;
    const content = contentRef.current;
    if (!list) return;

    const pin = () => {
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
      } else if (list) {
        list.scrollTop = list.scrollHeight;
      }
    };

    pin();
    const raf1 = requestAnimationFrame(() => pin());
    let raf2Inner = 0;
    const raf2 = requestAnimationFrame(() => {
      raf2Inner = requestAnimationFrame(pin);
    });

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (pendingOlderLoadRef.current) {
              compensateOlderLoadScroll();
              return;
            }
            pin();
          })
        : null;
    if (ro && content) ro.observe(content);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (raf2Inner) cancelAnimationFrame(raf2Inner);
      ro?.disconnect();
    };
  }, [items, compensateOlderLoadScroll]);

  // FloatingChat.tsx:1159-1173 verbatim — 마운트 직후 350ms 정착 구간.
  useEffect(() => {
    openSettledRef.current = false;
    const t = setTimeout(() => {
      openSettledRef.current = true;
    }, 350);
    return () => clearTimeout(t);
  }, []);

  // ── 파일 첨부 / 전송 — FloatingChat.tsx:1209-1281 verbatim ──
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

    const replySnapshot = replyingTo;
    isJumpingRef.current = false;
    setDraft("");
    setFile(null);
    setReplyingTo(null);
    setSending(true);
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
        ...(replySnapshot
          ? {
              replyTo: {
                messageId: replySnapshot.id,
                nickname: replySnapshot.nickname,
                snippet: (replySnapshot.message || "").slice(0, 50),
                ...(replySnapshot.fileType ? { fileType: replySnapshot.fileType } : {}),
              },
            }
          : {}),
      });
    } catch (e) {
      console.error(e);
      alert("메시지 전송에 실패했습니다.");
      setDraft(text);
      setFile(pendingFile);
      setReplyingTo(replySnapshot);
    }
    setSending(false);
    messageInputRef.current?.focus({ preventScroll: true });
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  };

  return (
    // PC 데스크탑에서 뷰포트 전체 폭으로 퍼지던 문제 — 원본 FloatingChat
    // 패널은 애초에 380px 코너 패널이었는데(FloatingChat.tsx:1450 min(380px,
    // ...)) 풀스크린으로 옮기며 폭 제한이 빠졌다. max-w-[480px] + mx-auto 로
    // 카톡/디스코드 스타일 중앙 컬럼 복원. 480px 는 대부분의 모바일 뷰포트
    // 폭보다 넓어 w-full 이 그 안에서 자연히 꽉 차므로 모바일은 별도 분기
    // 없이 그대로 풀폭 유지된다.
    //
    // P4.1: 배경을 원본 FloatingChat 의 dl2 패널 배경(#fef5e6, cream,
    // 불투명)과 동일하게 맞춤 — FloatingChat.tsx:1462 참고. 전 Phase의
    // transparent(어두운 dl2 홈 배경이 비치는 상태)는 카톡방인데 뒤가
    // 훤히 비쳐 보이는 문제로 관측돼, 원본과 동일한 불투명 패널로 되돌림.
    <div className="mx-auto flex h-full w-full max-w-[480px] flex-col" style={{ background: "#fef5e6" }}>
      {/* 상단 별도 라인 제거(P4.1.1 요청) — 필터 버튼은 메시지 영역 위에
          뜨는 floating 원형 버튼으로 이동. 이 wrapper 가 relative 포지셔닝
          기준이고, 버튼은 absolute 로 스크롤 영역 위에 고정되며 메시지가
          그 뒤로 지나간다(z-10). 헤더 바 자체가 사라져 스크롤 영역이
          그만큼 세로로 늘어난다. */}
      <div className="relative flex-1">
        <button
          type="button"
          onClick={() => setFilterActivityOnly((v) => !v)}
          aria-pressed={filterActivityOnly}
          aria-label={filterActivityOnly ? "전체 보기" : "최신 소식만 보기"}
          title={filterActivityOnly ? "전체 보기" : "최신 소식만 보기"}
          className={`absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition-colors ${
            filterActivityOnly
              ? "border-transparent bg-sunset-gold"
              : "border-cloud-pink bg-cream hover:bg-sunset-gold/25"
          }`}
          style={{ color: "#5c3a1f" }}
        >
          <Filter className="h-4 w-4" />
        </button>

        {/* 메시지 + 카드 리스트 — absolute inset-0 로 relative wrapper 를
            정확히 채워야 위 필터 버튼이 스크롤과 무관하게 같은 화면
            위치에 고정된다(부모가 스크롤 컨테이너 자신이면 absolute
            자식도 같이 스크롤돼버림). */}
        <div
          ref={listRef}
          onScroll={handleListScroll}
          className="nebula-scroll absolute inset-0 overflow-y-auto overflow-x-hidden px-3 py-2"
        >
        <div ref={contentRef}>
          {loadingMore ? (
            <p className="py-2 text-center font-serif text-[11px] italic" style={{ color: "#8a6a4a" }}>
              불러오는 중...
            </p>
          ) : null}
          {visibleDecoratedItems.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="font-serif text-[12px] italic" style={{ color: "#8a6a4a" }}>
                {filterActivityOnly ? "아직 최신 소식이 없어요" : "아직 대화가 없어요"}
              </p>
            </div>
          ) : (
            visibleDecoratedItems.map(({ item, showAvatar, showNickname, showTime }) => {
              if (!isChatItem(item)) {
                const activity = item as ActivityItem;
                return (
                  <ActivityCard
                    key={activity.id}
                    message={activity.message}
                    link={activity.link ?? ""}
                    onOpenMenu={() =>
                      openActivityReplyMenu({
                        content: activity.message,
                        isMine: false,
                        onReply: () =>
                          setReplyingTo({
                            id: activity.id,
                            nickname: activity.nickname,
                            message: activity.message,
                          }),
                      })
                    }
                  />
                );
              }
              return (
                <MessageItem
                  key={item.id}
                  m={item}
                  mine={!!nickname && item.nickname === nickname}
                  showAvatar={showAvatar}
                  showNickname={showNickname}
                  showTime={showTime}
                  avatar={avatars.get(item.nickname)}
                  onActionMenu={handleActionMenu}
                  registerRef={registerMessageRef}
                  onJumpToOriginal={handleJumpToOriginal}
                  highlighted={highlightedMessageId === item.id}
                  messageReactions={chatReactions.get(item.id)}
                />
              );
            })
          )}
          <div ref={endRef} aria-hidden />
        </div>
        </div>
      </div>

      {/* 입력창 — 다음 Phase(하단 네비 대체)에서 확장 예정, 지금은 기존
          FloatingChat 형태(카메라 + 텍스트 + 전송) 그대로. transparent
          컨테이너 위에서도 글자가 읽히도록 살짝 불투명한 cream 바탕을
          입력줄에만 부여 — 원본은 패널 자체가 cream 이라 별도 배경이
          필요 없었다(이 부분만 컨테이너 배경 변경에 따른 조정). */}
      {!ready ? (
        <div className="sticky bottom-0 shrink-0 px-4 py-4 text-center font-serif text-[11px] italic" style={{ color: "#8a6a4a", background: "rgba(254,245,230,0.92)" }}>
          불러오는 중...
        </div>
      ) : nickname ? (
        <div className="sticky bottom-0 relative shrink-0 px-3 py-3" style={{ background: "rgba(254,245,230,0.92)", borderTop: "1px solid rgba(92,58,31,0.15)" }}>
          {replyingTo && (
            <div className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(255,212,184,0.35)", borderLeft: "3px solid #ffb88a" }}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-serif text-[11px] font-semibold" style={{ color: "#5c3a1f" }}>
                  ↪ {replyingTo.nickname}님에게 답글
                </div>
                <div className="truncate font-serif text-[11px]" style={{ color: "rgba(92,58,31,0.8)", marginTop: 1 }}>
                  {replyingTo.message ||
                    (replyingTo.fileType === "video"
                      ? "[영상]"
                      : replyingTo.fileType === "gif" || replyingTo.fileType === "image"
                        ? "[사진]"
                        : "")}
                </div>
              </div>
              <button type="button" onClick={handleClearReply} aria-label="답글 취소" className="shrink-0" style={{ padding: 2, color: "#8a6a4a" }}>
                <X size={14} />
              </button>
            </div>
          )}

          {file && filePreview && (
            <div className="mb-2 flex items-center gap-2 overflow-hidden rounded-xl p-2" style={{ border: "1px solid rgba(92,58,31,0.10)", background: "#f0e4cc" }}>
              {detectFileType(file) === "video" ? (
                <video src={filePreview} className="h-10 w-10 shrink-0 rounded-lg object-cover" muted playsInline preload="metadata" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={filePreview} alt={file.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
              )}
              <span className="min-w-0 flex-1 truncate font-serif text-[10px]" style={{ color: "#8a6a4a" }}>
                {file.name}
              </span>
              <button type="button" onClick={() => setFile(null)} aria-label="첨부 제거" disabled={sending} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50" style={{ color: "#8a6a4a" }}>
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <MentionPicker
            text={draft}
            cursor={mentionCursor}
            onSelect={(nick, range) => {
              const result = applyMentionInsert(draft, range.start, range.end, nick);
              setDraft(result.text);
              setMentionCursor(result.cursor);
              requestAnimationFrame(() => {
                if (messageInputRef.current) {
                  messageInputRef.current.focus();
                  messageInputRef.current.setSelectionRange(result.cursor, result.cursor);
                }
              });
            }}
            dl2
          />

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
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-50"
              style={{
                background: "#ffffff",
                border: file ? "1px solid rgba(184,84,32,0.4)" : "1px solid rgba(92,58,31,0.20)",
                color: file ? "#b85420" : "#5c3a1f",
              }}
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
              onSelect={(e) => setMentionCursor(e.currentTarget.selectionStart)}
              onClick={(e) => setMentionCursor(e.currentTarget.selectionStart)}
              onKeyUp={(e) => setMentionCursor(e.currentTarget.selectionStart)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="메시지를 입력하세요"
              aria-busy={sending}
              className="min-w-0 flex-1 rounded-full px-3 py-2 font-serif text-[12px] focus:outline-none placeholder:text-[#8a6a4a]"
              style={{ background: "#ffffff", border: "1px solid rgba(92,58,31,0.20)", color: "#5c3a1f", caretColor: "#5c3a1f" }}
            />

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              onClick={handleSend}
              disabled={sending || (!draft.trim() && !file)}
              aria-label="메시지 전송"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "#ffd4b8", color: "#5c3a1f" }}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="sticky bottom-0 shrink-0 px-4 py-4 text-center font-serif text-[11px] italic" style={{ color: "#8a6a4a", background: "rgba(254,245,230,0.92)" }}>
          로그인이 필요합니다
        </div>
      )}

      {/* 이모지 액션 메뉴 — FloatingChat.tsx:1919-1996 verbatim (배경만
          패널 relative 대신 이 컨테이너 relative 에 맞춤). */}
      {actionMenuFor && (
        <div
          className="chat-action-menu absolute inset-0 z-30 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActionMenuFor(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="메시지 액션 메뉴"
        >
          <div
            className="flex items-center gap-1 rounded-full px-3 py-2"
            style={{ background: "rgba(254,245,230,0.98)", border: "1px solid rgba(92,58,31,0.2)", boxShadow: "0 8px 24px rgba(92,58,31,0.22)" }}
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
            <span aria-hidden className="mx-1 inline-block h-6 w-px" style={{ background: "rgba(92,58,31,0.18)" }} />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectReplyFromMenu();
              }}
              aria-label="답글"
              className="flex h-10 w-10 items-center justify-center rounded-full transition-opacity hover:opacity-70"
              style={{ fontSize: 18, color: "#5c3a1f", lineHeight: 1 }}
            >
              ↩
            </button>
          </div>
        </div>
      )}
      {/* P4.2 — ActivityCard 답글 전용 액션시트(useCommentActionSheet 는
          내부에서 createPortal(document.body) 하므로 이 위치는 무관). */}
      {activityReplySheet}
    </div>
  );
}
