// useGuilds.ts
// guilds 컬렉션 onSnapshot subscribe hook.
// 회원가입 길드 선택 + 가계도 + 관리자 페이지 + 공지 카테고리에서 재사용.
//
// 옵션 includeUnion: guilds/union (isUnion=true 특수 doc) 포함 여부.
//   - 디폴트 false: 가계도/회원가입/admin (실제 길드만 표시)
//   - true: 공지 카테고리 (연합 분류용 가상 길드 포함, 항상 맨 위)
//
// 정렬: union 우선 → 영문 → 한글 (members 페이지 nicknameCompare 와 동일 결).

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";

export interface Guild {
  id: string;
  name: string;
  leader: string | null;
  viceLeaders: string[];
  isUnion?: boolean;
  createdAt?: Timestamp;
}

function guildNameCompare(a: Guild, b: Guild): number {
  // union 우선 (항상 맨 위)
  if (a.isUnion && !b.isUnion) return -1;
  if (!a.isUnion && b.isUnion) return 1;
  // 같은 부류면 영문 → 한글
  const aKo = /[가-힯]/.test(a.name.charAt(0));
  const bKo = /[가-힯]/.test(b.name.charAt(0));
  if (aKo !== bKo) return aKo ? 1 : -1;
  return a.name.localeCompare(b.name, aKo ? "ko" : "en");
}

export function useGuilds(opts?: { includeUnion?: boolean }): Guild[] {
  const includeUnion = opts?.includeUnion ?? false;
  const [guilds, setGuilds] = useState<Guild[]>([]);

  useEffect(() => {
    // createdAt asc 는 백업 안정성용 (서버 정렬). 표시는 client-side
    // guildNameCompare 로 다시 정렬 (union 우선 → 영문 → 한글).
    const q = query(collection(db, "guilds"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      let list = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Guild,
      );
      if (!includeUnion) {
        list = list.filter((g) => !g.isUnion);
      }
      list.sort(guildNameCompare);
      setGuilds(list);
    });
    return unsub;
  }, [includeUnion]);

  return guilds;
}
