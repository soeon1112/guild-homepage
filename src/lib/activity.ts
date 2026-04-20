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
  targetPath?: string,
): Promise<void> {
  try {
    await addDoc(collection(db, "activity"), {
      type,
      nickname,
      message,
      link: link ?? "",
      targetPath: targetPath ?? "",
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

export async function deleteActivitiesByTargetPath(path: string): Promise<void> {
  if (!path) return;
  try {
    const exact = query(
      collection(db, "activity"),
      where("targetPath", "==", path),
    );
    const prefix = query(
      collection(db, "activity"),
      where("targetPath", ">=", `${path}/`),
      where("targetPath", "<", `${path}/\uf8ff`),
    );
    const [exactSnap, prefixSnap] = await Promise.all([
      getDocs(exact),
      getDocs(prefix),
    ]);
    const seen = new Set<string>();
    const docs = [...exactSnap.docs, ...prefixSnap.docs].filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
    await Promise.all(docs.map((d) => deleteDoc(d.ref)));
  } catch (e) {
    console.error("Failed to delete activities by target path:", e);
  }
}
