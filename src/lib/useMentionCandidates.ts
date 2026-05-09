"use client";

import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/src/lib/firebase";
import { ALL_MENTION_KEYWORD } from "@/src/lib/mentions";

const HIDDEN_NICKNAMES = new Set<string>(["테스트"]);

export type MentionCandidate = {
  nickname: string;
  isAll?: boolean;
  memberId?: string;
};

// fetch 전/실패 시에도 항상 노출되어야 하는 가상 엔트리. 빛나는 별 fetch
// 가 (firestore rules / 네트워크 등으로) 실패해도 `@우리길원들` 만큼은
// 드롭다운에 떠야 — 안 그러면 picker 가 영구 빈 리스트로 잠긴다.
const FALLBACK_LIST: MentionCandidate[] = [
  { nickname: ALL_MENTION_KEYWORD, isAll: true },
];

let cached: MentionCandidate[] | null = null;
let inflight: Promise<MentionCandidate[]> | null = null;

/**
 * 자동완성 후보:
 *   - 빛나는 별 (members 문서가 있는 users) 만
 *   - HIDDEN_NICKNAMES 제외
 *   - 맨 앞에 `@우리길원들` 가상 엔트리 고정 (fetch 결과와 무관 always-on)
 */
export function useMentionCandidates(): MentionCandidate[] {
  const [list, setList] = useState<MentionCandidate[]>(cached ?? FALLBACK_LIST);
  useEffect(() => {
    if (cached) {
      setList(cached);
      return;
    }
    if (!inflight) {
      inflight = (async () => {
        try {
          const [membersSnap, usersSnap] = await Promise.all([
            getDocs(collection(db, "members")),
            getDocs(collection(db, "users")),
          ]);
          const memberByNickname = new Map<string, string>();
          membersSnap.forEach((d) => {
            const data = d.data() as { nickname?: string };
            const nick = (data.nickname ?? "").trim();
            if (nick) memberByNickname.set(nick, d.id);
          });
          const out: MentionCandidate[] = [];
          usersSnap.forEach((u) => {
            const data = u.data() as { password?: string };
            if (typeof data.password !== "string") return;
            const nickname = u.id;
            if (HIDDEN_NICKNAMES.has(nickname)) return;
            const memberId = memberByNickname.get(nickname);
            if (!memberId) return;
            out.push({ nickname, memberId });
          });
          out.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));
          const final: MentionCandidate[] = [
            { nickname: ALL_MENTION_KEYWORD, isAll: true },
            ...out,
          ];
          cached = final;
          return final;
        } catch (e) {
          // 다음 mount 가 다시 시도하도록 inflight 만 reset. cached 는 안 박음.
          console.warn("[mention] candidates fetch failed:", e);
          inflight = null;
          return FALLBACK_LIST;
        }
      })();
    }
    inflight.then((v) => setList(v)).catch(() => {});
  }, []);
  return list;
}
