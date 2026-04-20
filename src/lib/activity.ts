import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export async function logActivity(
  type: string,
  nickname: string,
  message: string,
  link?: string,
): Promise<void> {
  try {
    await addDoc(collection(db, "activity"), {
      type,
      nickname,
      message,
      link: link ?? "",
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("Failed to log activity:", e);
  }
}
