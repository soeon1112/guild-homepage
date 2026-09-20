// useUnreadDMTotal.ts
// DM 시스템 Phase 4 — 로그인 사용자의 dmRooms 전체에서 본인
// unreadCount 합계를 실시간 구독하는 hook. Topbar 아이콘 배지용.
//
// 앱 repo와 동일하게 src/lib에 둠 — 순수 Firestore 구독 hook이라
// (JSX 없음) 이 코드베이스의 useChatReactions/useMemberAvatars/
// useGuilds 관례를 따랐다. src/hooks/는 UI 상호작용(.tsx) hook 전용.

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { getUnreadTotal, type DMRoom } from "./dm";

// roomId는 한글 닉네임 기반("언쏘_자카니")이라 pathname에서 꺼낸 값은
// percent-encoded일 수 있고 iOS는 NFD로 올 수 있다 — 비교 전에 디코드 +
// NFC로 맞춘다.
function normalizeRoomId(id: string): string {
  let s = id;
  try {
    s = decodeURIComponent(id);
  } catch {
    // 이미 디코드된 문자열에 '%'가 섞인 경우 — 원문 그대로
  }
  return s.normalize("NFC");
}

// `/dm/{roomId}` 대화 화면 pathname에서 roomId만 뽑는다. 목록(`/dm`)이나
// 다른 경로는 null.
export function getActiveDmRoomId(
  pathname: string | null | undefined,
): string | null {
  const m = pathname?.match(/^\/dm\/([^/?#]+)/);
  return m ? normalizeRoomId(m[1]) : null;
}

export function useUnreadDMTotal(
  nickname: string | null | undefined,
  // 지금 보고 있는 DM 방 id. 그 방의 unread는 합계에서만 뺀다 — 실시간으로
  // 보고 있는 방의 새 메시지가 배지를 올리지 않게. Firestore unreadCount
  // 필드는 그대로(목록 화면 등 다른 곳에선 정확한 값 유지). 렌더 시점에만
  // 제외하므로 방을 나가면 다시 합산된다.
  activeRoomId?: string | null,
): number {
  // 방별 unread를 들고 있다가 합계는 파생으로 계산 — activeRoomId(pathname)
  // 가 바뀔 때마다 onSnapshot을 다시 구독하지 않으려고 구독 effect의 deps
  // 에서 뺐다.
  const [unreadByRoom, setUnreadByRoom] = useState<Record<string, number>>({});

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
      const next: Record<string, number> = {};
      snap.forEach((d) => {
        next[normalizeRoomId(d.id)] = getUnreadTotal(d.data() as DMRoom, nickname);
      });
      setUnreadByRoom(next);
    });
    return unsub;
  }, [nickname]);

  const activeKey = activeRoomId ? normalizeRoomId(activeRoomId) : null;
  const total = useMemo(() => {
    let sum = 0;
    for (const [id, n] of Object.entries(unreadByRoom)) {
      if (id !== activeKey) sum += n;
    }
    return sum;
  }, [unreadByRoom, activeKey]);

  return nickname ? total : 0;
}
