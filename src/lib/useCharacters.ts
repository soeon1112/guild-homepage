import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/src/lib/firebase";

// characters/{id}: { owner (계정 닉네임), nickname (캐릭터명), job, ... }
// 제안 참가 캐릭터 선택 모달용. 대표(계정 닉네임 자체)는 characters 문서가
// 아니라 로그인 닉네임 그 자체이므로 이 훅이 반환하는 목록에는 없다 —
// 호출 쪽에서 "대표" 옵션을 별도로 추가한다.
export type CharacterDoc = {
  id: string;
  owner: string;
  nickname: string;
  job?: string;
};

export function useUserCharacters(nickname: string | null): CharacterDoc[] {
  const [characters, setCharacters] = useState<CharacterDoc[]>([]);

  useEffect(() => {
    if (!nickname) {
      setCharacters([]);
      return;
    }
    const q = query(collection(db, "characters"), where("owner", "==", nickname));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setCharacters(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CharacterDoc),
        );
      },
      (e) => {
        console.error("[useUserCharacters]", e);
      },
    );
    return unsub;
  }, [nickname]);

  return characters;
}
