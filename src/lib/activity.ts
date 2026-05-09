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

// 알려진 type 키 (서버 activityNormalize MESSAGE_REWRITERS 와 동기화):
//   notice, board, board_comment, schedule, album, album_comment,
//   combat, title, status, mood, bgm, mbti, profile_image, guestbook,
//   adventure, photo, minihome_photo_comment, photo_comment, keyword,
//   badge, proposal, mention.
//
// "mention" 은 서버 트리거(functions/src/triggers/mention.ts) 가 admin SDK 로
// 직접 add — 클라이언트는 logActivity("mention", ...) 호출 X. 이 클라 함수에
// 멘션 type 으로 호출이 들어오면 보안 규칙(activity 쓰기 권한)을 통과해도
// 서버측 직접 트리거가 똑같은 활동을 한 번 더 만들 수 있다.

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
