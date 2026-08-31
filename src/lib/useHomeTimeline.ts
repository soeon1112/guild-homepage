import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// Home 채팅 메인 리뉴얼 Phase 1 — 채팅(`chat`) + 최신 소식(`activity`) 병합
// 타임라인 hook. 사용처는 아직 없음(Phase 3에서 렌더링에 붙인다) — 이 파일은
// 신규 hook만 추가하고 기존 FloatingChat.tsx / activity.ts 는 건드리지 않는다.
//
// 컬렉션명 정정: Phase 0 진단 기획서의 "latestActivities" 는 실제로는 별개의
// 레거시/관리용 컬렉션이고, 길드원이 보는 "최신 소식" 피드가 실제 구독하는
// 컬렉션은 `activity` 다 (src/lib/activity.ts 의 logActivity() 가 쓰는 곳,
// WhispersFeed 위젯이 구독하는 곳). 이 hook 도 `activity` 를 구독한다.
//
// chat 스키마: { nickname, message, imageUrl?, fileType?, replyTo?, createdAt }
// activity 스키마: { type, nickname, message, link?, targetPath?, createdAt }

type ChatFileType = "image" | "gif" | "video";

type ChatReplyTo = {
  messageId: string;
  nickname: string;
  snippet: string;
  fileType?: ChatFileType;
};

export type TimelineItem =
  | {
      kind: "chat";
      id: string;
      nickname: string;
      message: string;
      imageUrl?: string;
      fileType?: ChatFileType;
      replyTo?: ChatReplyTo;
      ts: Timestamp | null;
    }
  | {
      kind: "activity";
      id: string;
      type: string;
      nickname: string;
      message: string;
      link?: string;
      targetPath?: string;
      ts: Timestamp | null;
    };

// 기존 FloatingChat 채팅 pagination과 동일한 상수 (initial 30 + 30씩 증가,
// 상한 500). 두 컬렉션이 같은 limit 값을 공유해 "동시에 늘어난다".
const LIMIT_STEP = 30;
const LIMIT_MAX = 500;

function parseReplyTo(raw: unknown): ChatReplyTo | undefined {
  const rt = raw as
    | {
        messageId?: unknown;
        nickname?: unknown;
        snippet?: unknown;
        fileType?: unknown;
      }
    | undefined;
  if (
    rt &&
    typeof rt.messageId === "string" &&
    typeof rt.nickname === "string" &&
    typeof rt.snippet === "string"
  ) {
    return {
      messageId: rt.messageId,
      nickname: rt.nickname,
      snippet: rt.snippet,
      fileType: typeof rt.fileType === "string" ? (rt.fileType as ChatFileType) : undefined,
    };
  }
  return undefined;
}

export function useHomeTimeline(initialLimit = 30): {
  items: TimelineItem[];
  loadOlder: () => void;
  hasMoreOlder: boolean;
  loadingMore: boolean;
} {
  const [limitValue, setLimitValue] = useState(initialLimit);
  const [chatDocs, setChatDocs] = useState<TimelineItem[]>([]);
  const [activityDocs, setActivityDocs] = useState<TimelineItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "chat"),
      orderBy("createdAt", "desc"),
      fsLimit(limitValue),
    );
    const unsub = onSnapshot(q, (snap) => {
      setChatDocs(
        snap.docs.map((d): TimelineItem => {
          const data = d.data();
          return {
            kind: "chat",
            id: d.id,
            nickname: data.nickname,
            message: data.message,
            imageUrl: data.imageUrl || undefined,
            fileType: (data.fileType as ChatFileType | undefined) || undefined,
            replyTo: parseReplyTo(data.replyTo),
            ts: data.createdAt ?? null,
          };
        }),
      );
      setLoadingMore(false);
    });
    return unsub;
  }, [limitValue]);

  useEffect(() => {
    const q = query(
      collection(db, "activity"),
      orderBy("createdAt", "desc"),
      fsLimit(limitValue),
    );
    const unsub = onSnapshot(q, (snap) => {
      setActivityDocs(
        snap.docs.map((d): TimelineItem => {
          const data = d.data();
          return {
            kind: "activity",
            id: d.id,
            type: data.type,
            nickname: data.nickname,
            message: data.message,
            link: data.link || undefined,
            targetPath: data.targetPath || undefined,
            ts: data.createdAt ?? null,
          };
        }),
      );
      setLoadingMore(false);
    });
    return unsub;
  }, [limitValue]);

  // ts DESC 병합 정렬. createdAt 이 아직 서버에서 안 돌아온(pending
  // serverTimestamp) 문서는 ts=null → 맨 뒤(가장 오래된 취급)로 밀리는데,
  // 실제로는 방금 막 쓰인 문서라 화면 맨 위/아래 어느 쪽이든 두 컬렉션이
  // 같은 규칙을 쓰므로 상대 순서는 일관된다.
  const items = useMemo(() => {
    return [...chatDocs, ...activityDocs].sort((a, b) => {
      const at = a.ts ? a.ts.toMillis() : 0;
      const bt = b.ts ? b.ts.toMillis() : 0;
      return bt - at;
    });
  }, [chatDocs, activityDocs]);

  // 두 스트림 중 하나라도 현재 limit 만큼 꽉 채워 돌아왔다면 더 오래된
  // 문서가 있을 가능성이 있다 — FloatingChat.loadOlder 의
  // `messages.length < messageLimit` 정지 조건과 동일한 판단을 스트림별로.
  const hasMoreOlder =
    limitValue < LIMIT_MAX &&
    (chatDocs.length >= limitValue || activityDocs.length >= limitValue);

  const loadOlder = () => {
    if (loadingMore) return;
    if (!hasMoreOlder) return;
    setLoadingMore(true);
    setLimitValue((prev) => Math.min(prev + LIMIT_STEP, LIMIT_MAX));
  };

  return { items, loadOlder, hasMoreOlder, loadingMore };
}
