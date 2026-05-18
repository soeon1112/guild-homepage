// useGuilds.ts
// guilds 컬렉션 onSnapshot subscribe hook.
// 회원가입 길드 선택 + 가계도 + 관리자 페이지에서 재사용.
// 정렬: 영문 → 한글 (members 페이지 nicknameCompare 와 동일 결).

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
  createdAt?: Timestamp;
}

function guildNameCompare(a: Guild, b: Guild): number {
  const aKo = /[가-힯]/.test(a.name.charAt(0));
  const bKo = /[가-힯]/.test(b.name.charAt(0));
  if (aKo !== bKo) return aKo ? 1 : -1;
  return a.name.localeCompare(b.name, aKo ? "ko" : "en");
}

export function useGuilds(): Guild[] {
  const [guilds, setGuilds] = useState<Guild[]>([]);

  useEffect(() => {
    // createdAt asc 는 백업 안정성용 (서버 정렬). 표시는 client-side
    // guildNameCompare 로 다시 정렬 (영문 → 한글).
    const q = query(collection(db, "guilds"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Guild,
      );
      list.sort(guildNameCompare);
      setGuilds(list);
    });
    return unsub;
  }, []);

  return guilds;
}
