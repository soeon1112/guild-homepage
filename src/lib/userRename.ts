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

async function updateByField(
  docs: QueryDocumentSnapshot[],
  field: string,
  newNick: string,
): Promise<number> {
  if (docs.length === 0) return 0;
  const patches: Patch[] = docs.map((d) => ({
    ref: d.ref,
    data: { [field]: newNick },
  }));
  await commitPatches(patches);
  return patches.length;
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
};

export async function renameUser(
  oldNick: string,
  newNick: string,
): Promise<RenameReport> {
  const oldN = oldNick.trim();
  const newN = newNick.trim();
  if (!oldN || !newN) throw new Error("닉네임이 비어 있습니다.");
  if (oldN === newN) throw new Error("기존 닉네임과 동일합니다.");

  const oldRef = doc(db, "users", oldN);
  const newRef = doc(db, "users", newN);
  const [oldSnap, newSnap] = await Promise.all([getDoc(oldRef), getDoc(newRef)]);
  if (!oldSnap.exists()) throw new Error("기존 유저를 찾을 수 없습니다.");
  if (newSnap.exists()) throw new Error("이미 존재하는 닉네임입니다.");

  const createBatch = writeBatch(db);
  createBatch.set(newRef, { ...oldSnap.data(), nickname: newN });
  await createBatch.commit();

  await copyAndDeleteSubcollection(oldN, newN, "badges");
  await copyAndDeleteSubcollection(oldN, newN, "pointHistory");

  const [
    gbSnap,
    commentsSnap,
    repliesSnap,
    chatSnap,
    activitySnap,
    boardSnap,
    membersSnap,
    albumByPhotographerSnap,
    albumByPeopleSnap,
    charactersSnap,
    exchangeSnap,
    lettersFromSnap,
    lettersToSnap,
  ] = await Promise.all([
    getDocs(query(collectionGroup(db, "guestbook"), where("nickname", "==", oldN))),
    getDocs(query(collectionGroup(db, "comments"), where("nickname", "==", oldN))),
    getDocs(query(collectionGroup(db, "replies"), where("nickname", "==", oldN))),
    getDocs(query(collection(db, "chat"), where("nickname", "==", oldN))),
    getDocs(query(collection(db, "activity"), where("nickname", "==", oldN))),
    getDocs(query(collection(db, "board"), where("nickname", "==", oldN))),
    getDocs(query(collection(db, "members"), where("nickname", "==", oldN))),
    getDocs(query(collection(db, "album"), where("photographer", "==", oldN))),
    getDocs(query(collection(db, "album"), where("people", "array-contains", oldN))),
    getDocs(query(collection(db, "characters"), where("owner", "==", oldN))),
    getDocs(query(collection(db, "exchangeRequests"), where("nickname", "==", oldN))),
    getDocs(query(collection(db, "letters"), where("from", "==", oldN))),
    getDocs(query(collection(db, "letters"), where("to", "==", oldN))),
  ]);

  const guestbookEntries = await updateByField(gbSnap.docs, "nickname", newN);
  const comments = await updateByField(commentsSnap.docs, "nickname", newN);
  const replies = await updateByField(repliesSnap.docs, "nickname", newN);
  const chatMessages = await updateByField(chatSnap.docs, "nickname", newN);
  const activities = await updateByField(activitySnap.docs, "nickname", newN);
  const boardPosts = await updateByField(boardSnap.docs, "nickname", newN);
  const members = await updateByField(membersSnap.docs, "nickname", newN);
  const albumPhotos = await updateByField(
    albumByPhotographerSnap.docs,
    "photographer",
    newN,
  );
  const characters = await updateByField(charactersSnap.docs, "owner", newN);
  const exchangeRequests = await updateByField(
    exchangeSnap.docs,
    "nickname",
    newN,
  );

  const letterPatches: Patch[] = [];
  for (const d of lettersFromSnap.docs) {
    letterPatches.push({ ref: d.ref, data: { from: newN } });
  }
  for (const d of lettersToSnap.docs) {
    letterPatches.push({ ref: d.ref, data: { to: newN } });
  }
  await commitPatches(letterPatches);
  const letters = letterPatches.length;

  const peoplePatches: Patch[] = albumByPeopleSnap.docs.map((d) => {
    const arr = (d.data().people as string[] | undefined) ?? [];
    const next = arr.map((p) => (p === oldN ? newN : p));
    return { ref: d.ref, data: { people: next } };
  });
  await commitPatches(peoplePatches);
  const albumPeopleTags = peoplePatches.length;

  const delBatch = writeBatch(db);
  delBatch.delete(oldRef);
  await delBatch.commit();

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
  };
}
