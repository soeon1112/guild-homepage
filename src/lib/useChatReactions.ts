// useChatReactions.ts
// 채팅 메시지 리액션 (Phase 3) — Firestore 서브컬렉션 fetch + 토글 hook.
//
// 데이터 구조 (옵션 B 결정):
//   chat/{messageId}/reactions/{nickname}
//     { emoji: string, createdAt: serverTimestamp }
//
// P4.2.1 (Home 채팅 리뉴얼) — 3번째 인자 collectionRoot(기본 "chat")로
// activity 카드 리액션도 같은 훅으로 지원. 병렬 구조:
//   activity/{activityId}/reactions/{nickname}
// chat 문서와는 분리된 서브컬렉션이라 서로 안 섞인다(F안 채택).
//
// 정책:
//   - 단일 (한 메시지에 본인 1 reaction만). 다른 emoji 클릭 시 교체.
//   - 같은 emoji 재클릭 → 제거 (deleteDoc).
//   - 6 emoji 후보 (호출처 결정): ❤️ 😂 😢 👍 🎉 😮
//
// 패턴 출처:
//   - PhotosSectionD2.tsx 의 nested onSnapshot (사진첩 댓글 카운트) verbatim
//     차용. 50 메시지 listener 동시 구독은 단일 client 100 listener 한도
//     안. 11명 비공개 길드라 reads/day 무관.
//
// 호출 예:
//   const ids = useMemo(() => messages.map((m) => m.id), [messages]);
//   const { reactions, toggleReaction } = useChatReactions(ids, loginNick);
//   const r = reactions.get(m.id);
//   r?.byEmoji.get("❤️")?.length; // 하트 개수
//   r?.myEmoji;                   // 본인이 한 emoji (null 가능)
//   await toggleReaction(m.id, "❤️");

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export type MessageReactions = {
  // emoji → reaction을 한 사용자 닉네임 배열
  byEmoji: Map<string, string[]>;
  // 본인이 한 emoji (단일 정책, 없으면 null)
  myEmoji: string | null;
};

export type ChatReactionsState = {
  // messageId → MessageReactions
  reactions: Map<string, MessageReactions>;
  // 본인이 emoji 클릭 시 호출. 같은 emoji 재클릭 → 제거, 다른 emoji → 교체.
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
};

export function useChatReactions(
  messageIds: string[],
  loginNick: string,
  // P4.2.1 — Home 채팅 리뉴얼: activity 카드도 같은 리액션 UX 를 쓰기
  // 위해 컬렉션 루트를 선택적 3번째 인자로 노출. 기존 호출부(전부
  // "chat" 생략)는 동작 변화 없음 — 채팅 리액션 로직 자체는 무수정,
  // 병렬 서브컬렉션(activity/{id}/reactions/{nickname})으로만 확장.
  collectionRoot: string = "chat",
): ChatReactionsState {
  const [reactions, setReactions] = useState<Map<string, MessageReactions>>(
    new Map(),
  );
  const unsubsRef = useRef<Map<string, () => void>>(new Map());

  // messageIds 안정화 — 배열 identity 매 렌더 새로워도 내용 동일하면 deps 무변경.
  const idsKey = useMemo(
    () => Array.from(new Set(messageIds)).sort().join(","),
    [messageIds],
  );

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    const live = new Set(ids);

    // 사라진 id 의 onSnapshot 정리 (limit(50) 밖으로 밀려난 메시지).
    for (const [id, unsub] of Array.from(unsubsRef.current.entries())) {
      if (!live.has(id)) {
        unsub();
        unsubsRef.current.delete(id);
        setReactions((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }
    }

    // 새 id 에 onSnapshot 등록.
    for (const id of ids) {
      if (unsubsRef.current.has(id)) continue;
      const unsub = onSnapshot(
        collection(db, collectionRoot, id, "reactions"),
        (snap) => {
          const byEmoji = new Map<string, string[]>();
          let myEmoji: string | null = null;
          snap.forEach((d) => {
            const data = d.data();
            const emoji =
              typeof data.emoji === "string" ? data.emoji : "";
            const nick = d.id;
            if (!emoji || !nick) return;
            const arr = byEmoji.get(emoji) ?? [];
            arr.push(nick);
            byEmoji.set(emoji, arr);
            if (nick === loginNick) myEmoji = emoji;
          });
          setReactions((prev) => {
            const next = new Map(prev);
            next.set(id, { byEmoji, myEmoji });
            return next;
          });
        },
      );
      unsubsRef.current.set(id, unsub);
    }
    // cleanup 은 unmount useEffect (아래) 에서 일괄. deps 변경 시 effect
    // 본문이 다시 실행되며 live/dead diff 처리하므로 별도 cleanup 불필요.
  }, [idsKey, loginNick, collectionRoot]);

  // unmount 시 전체 unsub — listener leak 방지.
  useEffect(() => {
    const unsubs = unsubsRef.current;
    return () => {
      for (const unsub of Array.from(unsubs.values())) {
        unsub();
      }
      unsubs.clear();
    };
  }, []);

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!loginNick || !messageId || !emoji) return;
    const refDoc = doc(db, collectionRoot, messageId, "reactions", loginNick);
    const current = reactions.get(messageId)?.myEmoji ?? null;
    if (current === emoji) {
      // 같은 emoji 다시 클릭 → 제거.
      await deleteDoc(refDoc);
    } else {
      // 다른 emoji 또는 새 emoji → 교체/추가 (단일 정책).
      await setDoc(refDoc, {
        emoji,
        createdAt: serverTimestamp(),
      });
    }
  };

  return { reactions, toggleReaction };
}
