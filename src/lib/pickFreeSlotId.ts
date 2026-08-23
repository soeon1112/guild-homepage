import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";

/** 현재 members 컬렉션에서 사용 중인 숫자 슬롯 ID를 제외한
 *  가장 작은 양의 정수 슬롯 ID를 반환. */
export async function pickFreeSlotId(): Promise<string> {
  const snap = await getDocs(collection(db, "members"));
  const used = new Set<string>();
  snap.forEach((d) => used.add(d.id));
  for (let i = 1; i < 10000; i++) {
    const candidate = String(i);
    if (!used.has(candidate)) return candidate;
  }
  return `slot-${Date.now()}`;
}
