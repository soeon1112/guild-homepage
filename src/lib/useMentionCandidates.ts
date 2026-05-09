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

let cached: MentionCandidate[] | null = null;
let inflight: Promise<MentionCandidate[]> | null = null;

/**
 * 자동완성 후보:
 *   - 빛나는 별 (members 문서가 있는 users) 만
 *   - HIDDEN_NICKNAMES 제외
 *   - 맨 앞에 `@우리길원들` 가상 엔트리 고정
 */
export function useMentionCandidates(): MentionCandidate[] {
  const [list, setList] = useState<MentionCandidate[]>(cached ?? []);
  useEffect(() => {
    if (cached) {
      setList(cached);
      return;
    }
    if (!inflight) {
      inflight = (async () => {
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
      })();
    }
    inflight.then((v) => setList(v)).catch(() => {});
  }, []);
  return list;
}
