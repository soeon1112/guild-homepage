// useUnreadDMTotal.ts
// DM 시스템 Phase 4 — 로그인 사용자의 dmRooms 전체에서 본인
// unreadCount 합계를 실시간 구독하는 hook. Topbar 아이콘 배지용.
//
// 앱 repo와 동일하게 src/lib에 둠 — 순수 Firestore 구독 hook이라
// (JSX 없음) 이 코드베이스의 useChatReactions/useMemberAvatars/
// useGuilds 관례를 따랐다. src/hooks/는 UI 상호작용(.tsx) hook 전용.

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { getUnreadTotal, type DMRoom } from "./dm";

export function useUnreadDMTotal(nickname: string | null | undefined): number {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    // nickname 없을 때 setState를 여기서 동기 호출하지 않는다(react-
    // hooks/set-state-in-effect) — 대신 아래 return에서 nickname 없으면
    // 무조건 0을 내려줘서 stale total이 새어나가지 않게 한다.
    if (!nickname) return;
    const q = query(
      collection(db, "dmRooms"),
      where("participants", "array-contains", nickname),
    );
    const unsub = onSnapshot(q, (snap) => {
      let sum = 0;
      snap.forEach((d) => {
        sum += getUnreadTotal(d.data() as DMRoom, nickname);
      });
      setTotal(sum);
    });
    return unsub;
  }, [nickname]);

  return nickname ? total : 0;
}
