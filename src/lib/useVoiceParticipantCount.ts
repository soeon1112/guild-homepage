// useVoiceParticipantCount.ts
// Topbar 배지용 — voiceRooms/skyisle 참가자 수만 필요한 가벼운 구독.
// VoiceRoomProvider(app/components/voice/VoiceRoomProvider.tsx)가 이미
// 같은 문서를 구독하지만, Topbar는 통화 미참가 상태에서도(그리고 어느
// 페이지에서든) 배지를 그려야 해서 useUnreadDMTotal.ts와 동일한 패턴으로
// 독립된 경량 hook을 둔다 — 앱(dawnlight-app)의
// src/lib/useVoiceParticipantCount.ts와 동일 구현(플랫폼 무관, 순수
// Firestore 구독이라 그대로 포팅).
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";

export function useVoiceParticipantCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "voiceRooms", "skyisle"), (snap) => {
      const data = snap.data();
      setCount(Object.keys(data?.participants ?? {}).length);
    });
    return unsub;
  }, []);

  return count;
}
