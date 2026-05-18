// useGuilds.ts
// guilds 컬렉션 onSnapshot subscribe hook.
// 회원가입 길드 선택 + 가계도 + 관리자 페이지에서 재사용.

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

export function useGuilds(): Guild[] {
  const [guilds, setGuilds] = useState<Guild[]>([]);

  useEffect(() => {
    const q = query(collection(db, "guilds"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setGuilds(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Guild),
      );
    });
    return unsub;
  }, []);

  return guilds;
}
