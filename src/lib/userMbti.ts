// userMbti.ts
// 사용자 MBTI 필드 구독 hook.
// 옛 useAvatarData hook에서 mbti 필드만 분리 (Phase 3, 2026-05-18 아바타 시스템 제거).

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";

export function useUserMbti(
  nickname: string | undefined | null,
): string {
  const [mbti, setMbti] = useState<string>("");

  useEffect(() => {
    if (!nickname) {
      setMbti("");
      return;
    }

    const ref = doc(db, "users", nickname);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data();
      setMbti((data?.mbti as string) ?? "");
    });

    return unsub;
  }, [nickname]);

  return mbti;
}
