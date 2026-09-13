"use client";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Camera, ChevronLeft, Plus, Send, Smile, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { MemberAvatar } from "@/app/components/redesign/MemberAvatar";
import { MessageText } from "@/app/components/MessageText";
import { LinkPreviewCard } from "@/app/components/LinkPreviewCard";
import { EmoticonPicker } from "@/app/components/EmoticonPicker";
import { Dawnlight2BottomNav } from "@/app/components/dawnlight2/BottomNav";
import { useMemberAvatars } from "@/src/lib/useMemberAvatars";
import { useChatReactions, type MessageReactions } from "@/src/lib/useChatReactions";
import { getEmoticonUrl } from "@/src/lib/emoticons";
import { getPartnerNickname, type DMRoom } from "@/src/lib/dm";
import { useAuth } from "@/app/components/AuthProvider";
import { db, storage } from "@/src/lib/firebase";

// DM 대화 화면 — Phase 3 (앱 app/(tabs)/dm/[roomId].tsx와 1:1 포트).
//
// "MessageItem 재사용"을 문자 그대로는 못 했다 — 기존 채팅의 실제 렌더
// 로직은 NewHomeChat.tsx(1265줄) 안에 export 없이 inline으로만 있고,
// 그 파일 자체가 "기존 채팅 시스템"이라 미접촉 대상이다. 그 파일이 자기
// 앞선 채팅 컴포넌트를 포팅할 때 쓴 것과 같은 방식(import/수정 없이
// 렌더 JSX와 저장 로직만 verbatim 복사)을 여기서도 그대로 썼다.
//
// 실제로 코드 재사용(=import, 미접촉)한 것: MessageText, LinkPreviewCard,
// EmoticonPicker, useChatReactions(3번째 인자 collectionRoot로 서브
// 컬렉션 경로만 교체), useMemberAvatars, getEmoticonUrl.
//
// 이번 Phase 범위에서 뺀 것(앱 버전과 동일 사유) — 멘션 피커, GIF/영상
// 첨부, 무한 스크롤 페이지네이션.

const INK = "#5c3a1f";
const INK_SOFT = "#8a6a4a";
const CREAM = "#fef5e6";
// mistLavender(dl2Colors.mistLavender, #c8b8e8)를 rgb로 풀어 alpha만
// 조정 — 앱 [roomId].tsx의 DM_BG, ActivityCard의 LAVENDER_BG(0.15)와
// 동일 강도. 채팅 화면의 cream 배경과 명확히 구분되는 톤(Phase 6, D절).
const DM_BG = "rgba(200, 184, 232, 0.35)";
const CHAT_REACTION_EMOJIS = ["❤️", "😂", "😢", "👍", "🎉", "😮"] as const;
const AVATAR_SIZE = 32;

type DMMessageRow = {
  id: string;
  nickname: string;
  message: string;
  imageUrl?: string;
  fileType?: "image" | "sticker";
  ts: Timestamp | null;
  linkPreview?: {
    type: "youtube" | "vimeo" | "image" | "opengraph";
    url: string;
    title?: string;
    description?: string;
    thumbnail?: string;
    videoId?: string;
  };
  replyTo?: {
    messageId: string;
    nickname: string;
    snippet: string;
    fileType?: string;
    imageUrl?: string;
  };
};

type ReplyTarget = {
  id: string;
  nickname: string;
  message: string;
  fileType?: "image" | "sticker";
  imageUrl?: string;
};

function formatTime(ts: Timestamp | null): string {
  if (!ts) return "";
  const date = ts.toDate();
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "방금 전";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}시간 전`;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

export default function DMRoomPage() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();
  const searchParams = useSearchParams();
  // 진단 결과 원인 ③ fix: useParams().roomId는 디코딩 없이 URL 세그먼트를
  // 그대로 돌려준다(확인됨 — NewDMModal의 encodeURIComponent(roomId) 없이
  // 넘긴 한글 roomId가 실제로 percent-encoded 문자열째로 Firestore 문서 ID가
  // 됐었다). "%"가 없는 일반 문자열에 decodeURIComponent를 걸어도 그대로
  // 돌아오니 이미 존재하는 방(목록에서 진입, 인코딩 안 된 예전 링크 등)도
  // 안전 — 혹시 모를 잘못된 % 시퀀스만 catch로 원본 유지.
  const roomIdParam = params.roomId ?? "";
  let roomId = roomIdParam;
  try {
    roomId = decodeURIComponent(roomIdParam);
  } catch {
    // malformed % 시퀀스 — 원본 그대로 사용.
  }
  const partnerParam = searchParams.get("partner") ?? "";
  const { nickname: me, ready } = useAuth();

  // 로그인 필수 라우트 가드 — dm/page.tsx와 동일 패턴(비로그인이면
  // 홈으로). ready 후에만 판단(세션 복원 전 nickname이 일시적으로
  // null이라 너무 이른 redirect 방지). URL 직접 접속/알림 딥링크
  // (/dm/{roomId}) 대비.
  useEffect(() => {
    if (ready && !me) {
      router.replace("/");
    }
  }, [ready, me, router]);

  const [room, setRoom] = useState<DMRoom | null>(null);
  const [roomLoading, setRoomLoading] = useState(true);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [messages, setMessages] = useState<DMMessageRow[]>([]);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState<{ uri: string; name: string; raw: File } | null>(null);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isEmoticonOpen, setIsEmoticonOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null);
  const [actionMenuFor, setActionMenuFor] = useState<DMMessageRow | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  // P7-B — NewHomeChat.tsx(redesign):452-462의 togglePanel/toggleEmoticon과
  // 동일 상호배타 로직(E-3). + 열림 시 이모티콘 닫힘, 반대도 마찬가지.
  const togglePanel = () => {
    if (!isNavOpen) messageInputRef.current?.blur();
    setIsEmoticonOpen(false);
    setIsNavOpen((v) => !v);
  };
  const toggleEmoticon = () => {
    setIsNavOpen(false);
    setIsEmoticonOpen((v) => !v);
  };

  // 방 존재 확인만 — Phase 5: 자동 생성 제거(지연 생성으로 변경, D절).
  // 방이 없어도 partnerParam이 있으면 정상 진입(첫 메시지 보낼 때
  // ensureRoomExists가 만든다). 방도 없고 partnerParam도 없을 때만
  // "잘못된 접근". 자기 자신 DM 방지도 제거(E절, 메모장 용도로 허용).
  useEffect(() => {
    if (!roomId || !me) return;
    let cancelled = false;
    (async () => {
      setRoomLoading(true);
      setRoomError(null);
      try {
        const roomRef = doc(db, "dmRooms", roomId);
        const snap = await getDoc(roomRef);
        if (snap.exists()) {
          if (!cancelled) setRoom(snap.data() as DMRoom);
        } else if (!partnerParam) {
          if (!cancelled) setRoomError("잘못된 접근입니다.");
        }
        // else: 방 없고 partnerParam 있음 → room은 null로 두고 그냥
        // 진입(빈 대화). 첫 메시지 전송 시 ensureRoomExists가 생성.
      } catch (e) {
        console.error("[dm] room load failed", e);
        if (!cancelled) setRoomError("대화방을 여는 데 실패했어요.");
      }
      if (!cancelled) setRoomLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, me, partnerParam]);

  // 방이 있으면 참가자 배열에서, 없으면(아직 미생성) 쿼리 파라미터에서
  // 상대 닉네임을 구한다.
  const partner = room && me ? getPartnerNickname(room.participants, me) : partnerParam;
  const isSelfMemo = !!me && !!partner && partner === me;

  useEffect(() => {
    if (!roomId || roomError) return;
    const unsub = onSnapshot(doc(db, "dmRooms", roomId), (snap) => {
      if (snap.exists()) setRoom(snap.data() as DMRoom);
    });
    return unsub;
  }, [roomId, roomError]);

  useEffect(() => {
    if (!roomId || roomError) return;
    const q = query(
      collection(db, "dmRooms", roomId, "messages"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows: DMMessageRow[] = snap.docs.slice(0, 50).map((d) => {
        const data = d.data();
        return {
          id: d.id,
          nickname: typeof data.nickname === "string" ? data.nickname : "",
          message: typeof data.message === "string" ? data.message : "",
          imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : undefined,
          fileType: data.fileType === "sticker" || data.fileType === "image" ? data.fileType : undefined,
          ts: (data.createdAt as Timestamp) ?? null,
          linkPreview: data.linkPreview ?? undefined,
          replyTo: data.replyTo ?? undefined,
        };
      });
      setMessages(rows.reverse());
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      });
    });
    return unsub;
  }, [roomId, roomError]);

  // 화면 열 때 본인 unreadCount 리셋 — 방이 있을 때만(D-3). hasRoom을
  // boolean으로 따로 둬서 room 객체 참조가 onSnapshot마다 바뀌어도
  // 이 effect가 다시 안 돌게 한다.
  const hasRoom = !!room;
  useEffect(() => {
    if (!roomId || !me || roomLoading || roomError || !hasRoom) return;
    updateDoc(doc(db, "dmRooms", roomId), {
      [`unreadCount.${me}`]: 0,
    }).catch((e) => console.error("[dm] unread reset failed", e));
  }, [roomId, me, roomLoading, roomError, hasRoom]);

  const avatars = useMemberAvatars(partner ? [partner] : []);
  const partnerAvatar = partner ? avatars.get(partner) : undefined;

  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const { reactions, toggleReaction } = useChatReactions(
    messageIds,
    me ?? "",
    `dmRooms/${roomId}/messages`,
  );

  // Phase 5 — 지연 생성(D절). 첫 메시지/이모티콘 전송 직전에 호출.
  // 이미 있으면(둘째 메시지부터) no-op. 자기 자신 DM(E절)이면
  // targetPartner === me라 participants가 [me, me], unreadCount 객체
  // 리터럴의 같은 키가 겹쳐써져도 둘 다 0이라 문제 없음. handleSend와
  // 동일하게 일반 함수로 둔다 — useCallback으로 감싸면 이걸 참조하는
  // handleEmoticonSelect 쪽 react-hooks/preserve-manual-memoization가
  // 깨져서(React Compiler가 setState를 엉뚱하게 추론) 오히려 더 꼬인다.
  const ensureRoomExists = async (targetPartner: string) => {
    if (!me) return;
    const roomRef = doc(db, "dmRooms", roomId);
    const snap = await getDoc(roomRef);
    if (snap.exists()) return;
    const created: DMRoom = {
      participants: [me, targetPartner].sort((a, b) => a.localeCompare(b)) as [string, string],
      unreadCount: { [me]: 0, [targetPartner]: 0 },
    };
    await setDoc(roomRef, { ...created, createdAt: serverTimestamp() });
    setRoom(created);
  };

  const handlePickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile({ uri: URL.createObjectURL(f), name: f.name, raw: f });
    e.target.value = "";
  };

  const handleSend = async () => {
    if (!me || !roomId || !partner) return;
    if (sending) return;
    const text = draft.trim();
    const pendingFile = file;
    if (!text && !pendingFile) return;

    const replySnapshot = replyingTo;
    setDraft("");
    setFile(null);
    setReplyingTo(null);
    setSending(true);

    try {
      await ensureRoomExists(partner);
      let imageUrl = "";
      let fileType: "image" | undefined;
      if (pendingFile) {
        fileType = "image";
        const safeName = pendingFile.name.replace(/[^\w.\-]/g, "_");
        // dm/ 전용 storage 경로 — chat/(그룹 채팅)이나 comments/(게시판·
        // 앨범 댓글)와 섞이지 않게 분리.
        const path = `dm/${roomId}/${Date.now()}_${safeName}`;
        const r = ref(storage, path);
        await uploadBytes(r, pendingFile.raw);
        imageUrl = await getDownloadURL(r);
      }
      await addDoc(collection(db, "dmRooms", roomId, "messages"), {
        nickname: me,
        message: text,
        imageUrl,
        fileType: fileType ?? "",
        createdAt: serverTimestamp(),
        ...(replySnapshot
          ? {
              replyTo: {
                messageId: replySnapshot.id,
                nickname: replySnapshot.nickname,
                snippet:
                  replySnapshot.fileType === "sticker"
                    ? "이모티콘"
                    : (replySnapshot.message || "").slice(0, 50),
                ...(replySnapshot.fileType ? { fileType: replySnapshot.fileType } : {}),
                ...(replySnapshot.fileType === "sticker" && replySnapshot.imageUrl
                  ? { imageUrl: replySnapshot.imageUrl }
                  : {}),
              },
            }
          : {}),
      });
      // dmRooms.lastMessage/lastMessageAt/lastMessageBy/unreadCount.partner
      // 갱신 + push + linkPreview는 Phase 2 트리거(onDMMessageCreated)가
      // 자동 처리 — 여기서 직접 안 건드림.
    } catch (e) {
      console.error("[dm] send failed", e);
      setDraft(text);
      setFile(pendingFile);
      setReplyingTo(replySnapshot);
      alert("전송 실패");
    }
    setSending(false);
  };

  const handleEmoticonSelect = async (id: string) => {
    if (!me || !roomId || !partner) return;
    setIsEmoticonOpen(false);
    const replySnapshot = replyingTo;
    setReplyingTo(null);
    try {
      await ensureRoomExists(partner);
      await addDoc(collection(db, "dmRooms", roomId, "messages"), {
        nickname: me,
        message: "",
        imageUrl: getEmoticonUrl(id),
        fileType: "sticker",
        createdAt: serverTimestamp(),
        ...(replySnapshot
          ? {
              replyTo: {
                messageId: replySnapshot.id,
                nickname: replySnapshot.nickname,
                snippet:
                  replySnapshot.fileType === "sticker"
                    ? "이모티콘"
                    : (replySnapshot.message || "").slice(0, 50),
                ...(replySnapshot.fileType ? { fileType: replySnapshot.fileType } : {}),
                ...(replySnapshot.fileType === "sticker" && replySnapshot.imageUrl
                  ? { imageUrl: replySnapshot.imageUrl }
                  : {}),
              },
            }
          : {}),
      });
    } catch (e) {
      console.error("[dm] sticker send failed", e);
      setReplyingTo(replySnapshot);
    }
  };

  const handleJumpToOriginal = (messageId: string) => {
    messageRefs.current[messageId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(messageId);
    setTimeout(() => setHighlightedMessageId((cur) => (cur === messageId ? null : cur)), 1500);
  };

  if (roomError) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm" style={{ color: INK_SOFT }}>{roomError}</p>
        <button
          type="button"
          onClick={() => router.push("/dm")}
          className="rounded-full px-4 py-2 text-xs font-semibold"
          style={{ background: "#ffd4b8", color: INK }}
        >
          돌아가기
        </button>
      </div>
    );
  }

  if (roomLoading || !me) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <p className="text-sm italic" style={{ color: INK_SOFT }}>불러오는 중...</p>
      </div>
    );
  }

  return (
    // 키보드 회피 — app/page.tsx(NewHomeChat 호스트, 미접촉·verbatim 참고만)의
    // `calc(100dvh - TOPBAR_HEIGHT - var(--keyboard-inset,0px))` 패턴 그대로.
    // 기존엔 100dvh만 썼는데, 다수 모바일 브라우저는 소프트 키보드가 열려도
    // 동적 뷰포트 높이가 안 줄어 컴포즈 바가 키보드 뒤로 사라졌다.
    // VisualViewportSync(app root, layout.tsx에 이미 마운트돼있어 전역
    // 사용 가능 — 이 화면에서 새로 마운트할 필요 없음)가 노출하는
    // --keyboard-inset을 박스 높이에서 직접 빼면 flex-1인 메시지 영역이
    // 줄고 입력줄이 자연히 키보드 위로 올라온다.
    <div
      className="mx-auto flex w-full max-w-2xl flex-col"
      style={{ height: "calc(100dvh - 56px - var(--keyboard-inset, 0px))", overflow: "hidden", background: DM_BG }}
    >
      {/* 상단 헤더 — 뒤로가기 + 상대방 프사/닉네임(G-2). Topbar는 그대로
          위에 남아있고(다른 시스템 미접촉), 이 헤더는 그 아래 대화 전용
          서브헤더. */}
      <div
        className="flex shrink-0 items-center gap-2.5 px-3 py-2.5"
        style={{ borderBottom: "1px solid rgba(92,58,31,0.10)", background: "rgba(254, 245, 230, 0.9)" }}
      >
        <button type="button" onClick={() => router.push("/dm")} aria-label="뒤로가기" className="p-1">
          <ChevronLeft size={22} color={INK} />
        </button>
        <MemberAvatar imageUrl={partnerAvatar?.imageUrl} nickname={partner} size={AVATAR_SIZE} dl2 />
        <span className="flex-1 truncate text-[15px] font-semibold" style={{ color: INK }}>
          {isSelfMemo ? "메모" : partner}
        </span>
      </div>

      <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        {messages.map((m) => (
          <DMMessageItemView
            key={m.id}
            m={m}
            mine={m.nickname === me}
            avatarImageUrl={partnerAvatar?.imageUrl}
            registerRef={(el) => {
              messageRefs.current[m.id] = el;
            }}
            onOpenImage={setViewerUri}
            onLongPress={setActionMenuFor}
            onJumpToOriginal={handleJumpToOriginal}
            highlighted={highlightedMessageId === m.id}
            messageReactions={reactions.get(m.id)}
          />
        ))}
      </div>

      {/* P7-B 슬라이드업 — NewHomeChat.tsx(redesign):1028-1036과 동일
          transform 트릭(0-height wrapper의 transform이 fixed 자손인
          Dawnlight2BottomNav의 containing block이 돼, 그 bottom:0이
          "화면 맨 아래"가 아니라 이 지점 기준으로 계산됨). 닫혔을 때는
          composeArea 뒤로 완전히 숨는다. */}
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
        style={{ borderTop: "1px solid rgba(92,58,31,0.10)", background: "rgba(254, 245, 230, 0.9)" }}
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
                aria-label={file ? "첨부 제거" : "사진 첨부"}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-50"
                style={{
                  background: "#ffffff",
                  border: file ? "1px solid rgba(184,84,32,0.4)" : "1px solid rgba(92,58,31,0.20)",
                  color: file ? "#b85420" : INK,
                }}
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <EmoticonPicker onSelect={handleEmoticonSelect} />
          </div>
        )}

        {replyingTo && (
          <div className="flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-1.5" style={{ background: "rgba(92,58,31,0.06)" }}>
            <span className="truncate text-[11px]" style={{ color: INK_SOFT }}>
              ↪ {replyingTo.nickname}: {replyingTo.fileType === "sticker" ? "이모티콘" : replyingTo.message}
            </span>
            <button type="button" onClick={() => setReplyingTo(null)} aria-label="답글 취소">
              <X size={14} color={INK_SOFT} />
            </button>
          </div>
        )}

        {file && (
          <div className="flex items-center gap-2 rounded-[10px] p-1.5" style={{ background: "#f0e4cc" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={file.uri} alt="" className="h-9 w-9 rounded-md object-cover" />
            <span className="flex-1 truncate text-[11px]" style={{ color: INK_SOFT }}>{file.name}</span>
            <button type="button" onClick={() => setFile(null)} aria-label="첨부 제거">
              <X size={12} color={INK_SOFT} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePickImage} style={{ display: "none" }} />
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
              background: isNavOpen ? "rgba(255,199,133,0.4)" : "rgba(92,58,31,0.06)",
              color: isNavOpen ? "#b85420" : INK,
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
            style={{ background: isEmoticonOpen ? "rgba(255,199,133,0.4)" : "rgba(92,58,31,0.06)" }}
          >
            <Smile size={16} color={isEmoticonOpen ? "#b85420" : INK} />
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
            style={{ background: CREAM, border: "1px solid rgba(92,58,31,0.15)", color: INK }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || (!draft.trim() && !file)}
            aria-label="메시지 전송"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 disabled:opacity-50"
            style={{ background: "#ffd4b8" }}
          >
            <Send size={16} color={INK} />
          </button>
        </div>
      </div>

      {/* 롱프레스 대신 클릭 액션 메뉴 — 6 이모지 리액션 + 답글. */}
      {actionMenuFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.15)" }}
          onClick={() => setActionMenuFor(null)}
        >
          <div
            className="flex items-center gap-2 rounded-full p-2.5"
            style={{ background: CREAM, border: "1px solid rgba(92,58,31,0.15)" }}
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
              style={{ color: INK }}
              onClick={() => {
                setReplyingTo({
                  id: actionMenuFor.id,
                  nickname: actionMenuFor.nickname,
                  message: actionMenuFor.message,
                  fileType: actionMenuFor.fileType,
                  imageUrl: actionMenuFor.imageUrl,
                });
                setActionMenuFor(null);
              }}
            >
              ↩
            </button>
          </div>
        </div>
      )}

      {/* 이미지 뷰어 */}
      {viewerUri && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setViewerUri(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewerUri} alt="" className="max-h-[80vh] max-w-[90vw] object-contain" />
        </div>
      )}
    </div>
  );
}

// DMMessageItemView — 앱 DMMessageItem과 같은 시각 언어(peach/cream
// 버블, 답글 인용, 리액션 줄)를 웹으로 이식.
const DMMessageItemView = memo(function DMMessageItemView({
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
  m: DMMessageRow;
  mine: boolean;
  avatarImageUrl: string | undefined;
  registerRef: (el: HTMLDivElement | null) => void;
  onOpenImage: (uri: string) => void;
  onLongPress: (m: DMMessageRow) => void;
  onJumpToOriginal: (messageId: string) => void;
  highlighted: boolean;
  messageReactions: MessageReactions | undefined;
}) {
  const replyQuote = m.replyTo ? (
    <button
      type="button"
      onClick={() => onJumpToOriginal(m.replyTo!.messageId)}
      className="mb-0.5 block max-w-[220px] rounded-[10px] px-2.5 py-1.5 text-left"
      style={{ background: mine ? "rgba(255, 199, 133, 0.25)" : "rgba(92, 58, 31, 0.08)" }}
    >
      <span className="block truncate text-[10px] font-semibold" style={{ color: INK_SOFT }}>
        ↪ {m.replyTo.nickname}
      </span>
      {m.replyTo.fileType === "sticker" && m.replyTo.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.replyTo.imageUrl} alt="" className="h-7 w-7 object-contain" />
      ) : (
        <span className="block truncate text-[10px]" style={{ color: INK_SOFT }}>
          {m.replyTo.snippet || (m.replyTo.fileType === "image" ? "[사진]" : "")}
        </span>
      )}
    </button>
  ) : null;

  const content = (
    <div className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
      {replyQuote}
      {!!m.message && (
        <div
          className="max-w-full rounded-2xl px-3 py-2 text-[12px] leading-[17px]"
          style={{
            background: mine ? "#ffd4b8" : "#f0e4cc",
            border: "1px solid rgba(92,58,31,0.10)",
            color: INK,
          }}
        >
          <MessageText text={m.message} dl2 />
        </div>
      )}
      {!!m.linkPreview && <LinkPreviewCard preview={m.linkPreview} />}
      {!!m.imageUrl &&
        (m.fileType === "sticker" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.imageUrl} alt="" className="h-24 w-24 object-contain" />
        ) : (
          <button type="button" onClick={() => onOpenImage(m.imageUrl!)} aria-label="사진 크게 보기">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.imageUrl} alt="" className="h-[180px] w-[180px] rounded-xl object-cover" />
          </button>
        ))}
      {messageReactions && messageReactions.byEmoji.size > 0 && (
        <div className={`flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
          {Array.from(messageReactions.byEmoji.entries()).map(([emoji, nicks]) => (
            <span
              key={emoji}
              className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px]"
              style={{
                background: "rgba(254, 245, 230, 0.7)",
                border: `1px solid ${messageReactions.myEmoji === emoji ? "#ffc785" : "rgba(92,58,31,0.10)"}`,
                color: INK_SOFT,
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
      className={`flex items-end gap-1.5 rounded-xl transition-colors ${mine ? "justify-end" : ""} ${highlighted ? "bg-[rgba(255,199,133,0.25)]" : ""}`}
    >
      {!mine && <MemberAvatar imageUrl={avatarImageUrl} nickname={m.nickname} size={AVATAR_SIZE} dl2 />}
      <div className="flex max-w-[82%] items-end gap-1">
        {content}
        <span className="whitespace-nowrap text-[9px]" style={{ color: INK_SOFT }}>{formatTime(m.ts)}</span>
      </div>
    </div>
  );
});
