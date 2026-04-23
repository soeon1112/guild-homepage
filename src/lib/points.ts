import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { handleEvent } from "./badgeCheck";

export type PointType =
  | "댓글"
  | "대댓글"
  | "방명록"
  | "사진"
  | "게시글"
  | "이벤트";

export async function addPoints(
  nickname: string | null | undefined,
  type: PointType,
  points: number,
  description: string,
): Promise<void> {
  if (!nickname) return;
  try {
    await setDoc(
      doc(db, "users", nickname),
      { points: increment(points) },
      { merge: true },
    );
    await addDoc(collection(db, "users", nickname, "pointHistory"), {
      type,
      points,
      description,
      createdAt: serverTimestamp(),
    });
    try {
      const snap = await getDoc(doc(db, "users", nickname));
      const newPoints = (snap.data()?.points as number | undefined) ?? 0;
      handleEvent({ type: "pointsChanged", nickname, newPoints });
    } catch {}
  } catch (e) {
    console.error("Failed to add points:", e);
  }
}
