// useUserServer.ts
// 닉네임 배열 → users/{nickname}.server 값 Map 반환 hook.
// useMemberAvatars.ts 와 동일한 batch(10개 chunk) + in-query 캐시 패턴 —
// 차이는 members가 아니라 users 컬렉션을 doc id("in" on documentId())로
// 직접 조회한다는 점 (users doc id === nickname, 필드 쿼리 불필요).
//
// 호출부(NicknameLabel)가 툴팁이 열렸을 때만 [nickname] 1개짜리 배열을
// 넘기는 lazy 패턴으로 쓴다 — nicknames가 빈 배열이면 fetch 자체를
// 스킵해 닫힌 상태에서는 Firestore 비용이 0.
//
// Phase 5 마이그(서버 개념) 이후 모든 users 문서에 server 필드가 있다는
// 전제. 필드가 없거나 값이 "duncan"/"aira" 둘 다 아니면 null.

import { useEffect, useState } from "react";
import { collection, documentId, getDocs, query, where } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import type { Server } from "@/src/lib/guilds";

function isServer(v: unknown): v is Server {
  return v === "duncan" || v === "aira";
}

export function useUserServer(
  nicknames: string[],
): Map<string, Server | null> {
  const [map, setMap] = useState<Map<string, Server | null>>(new Map());

  useEffect(() => {
    if (nicknames.length === 0) {
      setMap(new Map());
      return;
    }

    const unique = Array.from(new Set(nicknames));
    let cancelled = false;

    (async () => {
      try {
        const newMap = new Map<string, Server | null>();

        const chunks: string[][] = [];
        for (let i = 0; i < unique.length; i += 10) {
          chunks.push(unique.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const q = query(
            collection(db, "users"),
            where(documentId(), "in", chunk),
          );
          const snap = await getDocs(q);
          snap.forEach((d) => {
            const server = d.data().server;
            newMap.set(d.id, isServer(server) ? server : null);
          });
        }

        for (const nick of unique) {
          if (!newMap.has(nick)) newMap.set(nick, null);
        }

        if (!cancelled) setMap(newMap);
      } catch (e) {
        console.error("[useUserServer] failed", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nicknames.join("|")]);

  return map;
}
