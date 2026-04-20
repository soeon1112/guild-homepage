import {
  addDoc,
  collection,
  doc,
  increment,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export type PointType = "댓글" | "대댓글" | "방명록" | "사진" | "게시글";

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
  } catch (e) {
    console.error("Failed to add points:", e);
  }
}
