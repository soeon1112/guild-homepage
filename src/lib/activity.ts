import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
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

export async function deleteActivitiesByLink(link: string): Promise<void> {
  if (!link) return;
  try {
    const q = query(collection(db, "activity"), where("link", "==", link));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  } catch (e) {
    console.error("Failed to delete activities by link:", e);
  }
}
