import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  type DocumentReference,
  type Query,
  type QueryDocumentSnapshot,
  type WriteBatch,
} from "firebase/firestore";
import { db } from "./firebase";

const BATCH_LIMIT = 450;

type Patch = {
  ref: DocumentReference;
  data: Record<string, unknown>;
};

async function commitPatches(patches: Patch[]): Promise<void> {
  for (let i = 0; i < patches.length; i += BATCH_LIMIT) {
    const batch: WriteBatch = writeBatch(db);
    for (const p of patches.slice(i, i + BATCH_LIMIT)) {
      batch.update(p.ref, p.data);
    }
    await batch.commit();
  }
}

async function copyAndDeleteSubcollection(
  oldNick: string,
  newNick: string,
  sub: "badges" | "pointHistory",
): Promise<void> {
  const src = await getDocs(collection(db, "users", oldNick, sub));
  if (src.empty) return;

  for (let i = 0; i < src.docs.length; i += BATCH_LIMIT) {
    const chunk = src.docs.slice(i, i + BATCH_LIMIT);
    const copy = writeBatch(db);
    for (const d of chunk) {
      copy.set(doc(db, "users", newNick, sub, d.id), d.data());
    }
    await copy.commit();

    const del = writeBatch(db);
    for (const d of chunk) {
      del.delete(d.ref);
    }
    await del.commit();
  }
}

export type RenameReport = {
  guestbookEntries: number;
  comments: number;
  replies: number;
  chatMessages: number;
  activities: number;
  boardPosts: number;
  members: number;
  albumPhotos: number;
  albumPeopleTags: number;
  characters: number;
  exchangeRequests: number;
  letters: number;
  oldDocDeleted: boolean;
  errors: string[];
};

async function safeUpdateField(
  label: string,
  q: Query,
  field: string,
  newValue: string,
  errors: string[],
): Promise<number> {
  try {
    const snap = await getDocs(q);
    if (snap.empty) return 0;
    const patches: Patch[] = snap.docs.map((d: QueryDocumentSnapshot) => ({
      ref: d.ref,
      data: { [field]: newValue },
    }));
    await commitPatches(patches);
    return patches.length;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`${label}: ${msg}`);
    console.error(`[renameUser] ${label} failed`, e);
    return 0;
  }
}

async function renameInCollectionGroup(
  label: string,
  name: "guestbook" | "comments" | "replies",
  oldN: string,
  newN: string,
  errors: string[],
): Promise<number> {
  try {
    const snap = await getDocs(collectionGroup(db, name));
    const patches: Patch[] = [];
    for (const d of snap.docs) {
      if (d.data().nickname === oldN) {
        patches.push({ ref: d.ref, data: { nickname: newN } });
      }
    }
    if (patches.length === 0) return 0;
    await commitPatches(patches);
    return patches.length;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`${label}: ${msg}`);
    console.error(`[renameUser] ${label} failed`, e);
    return 0;
  }
}

function replaceNicknamePrefix(
  message: unknown,
  oldNick: string,
  newNick: string,
): string | null {
  if (typeof message !== "string") return null;
  const prefixes = [`${oldNick}님`, oldNick];
  for (const p of prefixes) {
    if (message.startsWith(p)) {
      return newNick + message.slice(oldNick.length);
    }
  }
  return null;
}

export async function renameUser(
  oldNick: string,
  newNick: string,
): Promise<RenameReport> {
  const oldN = oldNick.trim();
  const newN = newNick.trim();
  if (!oldN || !newN) throw new Error("닉네임이 비어 있습니다.");
  if (oldN === newN) throw new Error("기존 닉네임과 동일합니다.");

  const errors: string[] = [];
  const oldRef = doc(db, "users", oldN);
  const newRef = doc(db, "users", newN);
  const [oldSnap, newSnap] = await Promise.all([getDoc(oldRef), getDoc(newRef)]);
  if (!oldSnap.exists()) throw new Error("기존 유저를 찾을 수 없습니다.");
  if (newSnap.exists()) throw new Error("이미 존재하는 닉네임입니다.");

  const createBatch = writeBatch(db);
  createBatch.set(newRef, { ...oldSnap.data(), nickname: newN });
  await createBatch.commit();

  try {
    await copyAndDeleteSubcollection(oldN, newN, "badges");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`badges 복사: ${msg}`);
    console.error("[renameUser] badges copy failed", e);
  }
  try {
    await copyAndDeleteSubcollection(oldN, newN, "pointHistory");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`pointHistory 복사: ${msg}`);
    console.error("[renameUser] pointHistory copy failed", e);
  }

  const guestbookEntries = await renameInCollectionGroup(
    "방명록/흔적",
    "guestbook",
    oldN,
    newN,
    errors,
  );
  const comments = await renameInCollectionGroup(
    "댓글",
    "comments",
    oldN,
    newN,
    errors,
  );
  const replies = await renameInCollectionGroup(
    "답글",
    "replies",
    oldN,
    newN,
    errors,
  );
  const chatMessages = await safeUpdateField(
    "채팅",
    query(collection(db, "chat"), where("nickname", "==", oldN)),
    "nickname",
    newN,
    errors,
  );
  const boardPosts = await safeUpdateField(
    "게시글",
    query(collection(db, "board"), where("nickname", "==", oldN)),
    "nickname",
    newN,
    errors,
  );
  const members = await safeUpdateField(
    "멤버 프로필",
    query(collection(db, "members"), where("nickname", "==", oldN)),
    "nickname",
    newN,
    errors,
  );
  const albumPhotos = await safeUpdateField(
    "앨범 업로더",
    query(collection(db, "album"), where("photographer", "==", oldN)),
    "photographer",
    newN,
    errors,
  );
  const characters = await safeUpdateField(
    "캐릭터 소유자",
    query(collection(db, "characters"), where("owner", "==", oldN)),
    "owner",
    newN,
    errors,
  );
  const exchangeRequests = await safeUpdateField(
    "환전 요청",
    query(collection(db, "exchangeRequests"), where("nickname", "==", oldN)),
    "nickname",
    newN,
    errors,
  );

  let activities = 0;
  try {
    const snap = await getDocs(
      query(collection(db, "activity"), where("nickname", "==", oldN)),
    );
    const patches: Patch[] = snap.docs.map((d) => {
      const data: Record<string, unknown> = { nickname: newN };
      const nextMessage = replaceNicknamePrefix(d.data().message, oldN, newN);
      if (nextMessage !== null) data.message = nextMessage;
      return { ref: d.ref, data };
    });
    await commitPatches(patches);
    activities = patches.length;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`활동: ${msg}`);
    console.error("[renameUser] activity update failed", e);
  }

  let letters = 0;
  try {
    const [lettersFromSnap, lettersToSnap] = await Promise.all([
      getDocs(query(collection(db, "letters"), where("from", "==", oldN))),
      getDocs(query(collection(db, "letters"), where("to", "==", oldN))),
    ]);
    const letterPatches: Patch[] = [];
    for (const d of lettersFromSnap.docs) {
      letterPatches.push({ ref: d.ref, data: { from: newN } });
    }
    for (const d of lettersToSnap.docs) {
      letterPatches.push({ ref: d.ref, data: { to: newN } });
    }
    await commitPatches(letterPatches);
    letters = letterPatches.length;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`편지: ${msg}`);
    console.error("[renameUser] letters update failed", e);
  }

  let albumPeopleTags = 0;
  try {
    const snap = await getDocs(
      query(collection(db, "album"), where("people", "array-contains", oldN)),
    );
    const peoplePatches: Patch[] = snap.docs.map((d) => {
      const arr = (d.data().people as string[] | undefined) ?? [];
      const next = arr.map((p) => (p === oldN ? newN : p));
      return { ref: d.ref, data: { people: next } };
    });
    await commitPatches(peoplePatches);
    albumPeopleTags = peoplePatches.length;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`앨범 태그: ${msg}`);
    console.error("[renameUser] album people update failed", e);
  }

  let oldDocDeleted = false;
  try {
    const delBatch = writeBatch(db);
    delBatch.delete(oldRef);
    await delBatch.commit();
    oldDocDeleted = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`기존 유저 문서 삭제: ${msg}`);
    console.error("[renameUser] delete old user doc failed", e);
  }

  return {
    guestbookEntries,
    comments,
    replies,
    chatMessages,
    activities,
    boardPosts,
    members,
    albumPhotos,
    albumPeopleTags,
    characters,
    exchangeRequests,
    letters,
    oldDocDeleted,
    errors,
  };
}
