import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/src/lib/firebase";

// 하단 네비 "제안" 아이콘 강조용 — 모집중(recruiting) 제안이 하나라도
// 있는지만 필요하므로 limit(1)로 read 비용을 최소화한다.
export function useHasRecruitingProposals(): boolean {
  const [hasRecruiting, setHasRecruiting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "proposals"),
      where("status", "==", "recruiting"),
      limit(1),
    );
    const unsub = onSnapshot(
      q,
      (snap) => setHasRecruiting(!snap.empty),
      (e) => console.error("[useHasRecruitingProposals]", e),
    );
    return unsub;
  }, []);

  return hasRecruiting;
}
