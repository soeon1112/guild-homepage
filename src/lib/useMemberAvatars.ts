// useMemberAvatars.ts
// 닉네임 배열 → { imageUrl, registered } Map 반환 hook.
// 댓글 (방명록 / 게시판 / 사진첩 / 대댓글) 에서 작성자 프사 표시용.
//
// 동작:
//   - members 컬렉션을 nickname "in" 쿼리로 chunk fetch (10개 한도)
//   - registered=true: members doc 존재 (profileImage 있으면 imageUrl 채움)
//   - registered=false: members doc 없음 (잠든 별 / 미등록 사용자)
//
// 비용: 길드원 11명짜리라 한 번 fetch 비용 무시 가능.
// 의존성: nicknames 배열 내용이 바뀌면 재실행 (join("|") 키).

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/src/lib/firebase";

export type MemberAvatarInfo = {
  imageUrl: string;
  registered: boolean;
};

export function useMemberAvatars(
  nicknames: string[],
): Map<string, MemberAvatarInfo> {
  const [map, setMap] = useState<Map<string, MemberAvatarInfo>>(new Map());

  useEffect(() => {
    if (nicknames.length === 0) {
      setMap(new Map());
      return;
    }

    const unique = Array.from(new Set(nicknames));
    let cancelled = false;

    (async () => {
      try {
        const newMap = new Map<string, MemberAvatarInfo>();

        // Firestore "in" 쿼리는 최대 10개 — chunk 분할
        const chunks: string[][] = [];
        for (let i = 0; i < unique.length; i += 10) {
          chunks.push(unique.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const q = query(
            collection(db, "members"),
            where("nickname", "in", chunk),
          );
          const snap = await getDocs(q);
          snap.forEach((d) => {
            const data = d.data();
            if (typeof data.nickname === "string") {
              newMap.set(data.nickname, {
                imageUrl:
                  typeof data.profileImage === "string" ? data.profileImage : "",
                registered: true,
              });
            }
          });
        }

        // 미등록 닉네임은 registered: false 로 채움
        for (const nick of unique) {
          if (!newMap.has(nick)) {
            newMap.set(nick, { imageUrl: "", registered: false });
          }
        }

        if (!cancelled) setMap(newMap);
      } catch (e) {
        console.error("[useMemberAvatars] failed", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nicknames.join("|")]);

  return map;
}
