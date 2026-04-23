/**
 * Renewal anniversary gift event — "별똥별 편지 선물"
 *
 * One-time 50-point gift delivered as a special letter to every user that
 * exists at event-start time. User must open the letter and click "별빛 받기"
 * to claim. Dedup is enforced at claim time via a Firestore transaction.
 *
 * Firestore shape:
 *   events/{EVENT_ID}                — event metadata (startedAt, totals)
 *   events/{EVENT_ID}/claims/{nick}  — dedup record (presence = claimed)
 *   letters/{letterId}               — the in-UI letter, marked eventType
 *   users/{nick}.points              — incremented on claim (+50)
 *   users/{nick}/pointHistory/{id}   — ledger entry "리뉴얼 기념 선물"
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { logActivity } from "./activity";

export const RENEWAL_EVENT_ID = "renewal2026-04";
export const RENEWAL_EVENT_TYPE = "renewal50";
export const RENEWAL_EVENT_AMOUNT = 50;
export const RENEWAL_EVENT_SENDER = "새벽빛";
export const RENEWAL_EVENT_TITLE = "새벽의 선물이 도착했어요 ✨";
export const RENEWAL_EVENT_PREVIEW = "리뉴얼을 축하하며 작은 선물을...";
export const RENEWAL_EVENT_CONTENT = [
  "✨ 새벽의 선물 ✨",
  "",
  "안녕하세요, 별빛 가족 여러분.",
  "",
  "작은 소우주에서",
  "새로운 여정이 시작되었습니다.",
  "",
  "그동안 새벽빛과 함께해 주신",
  "여러분께 감사의 마음을 담아",
  "작은 선물을 준비했습니다.",
  "",
  "✦ 별빛 50 ✦",
  "",
  "앞으로도 함께 빛나는",
  "아름다운 시간이 되기를 바랍니다.",
  "",
  "- 새벽빛",
].join("\n");

export type RenewalEventDoc = {
  startedAt: Timestamp | null;
  eligibleCount: number;
  amount: number;
  status: "active" | "closed";
};

export type RenewalInitResult = {
  ok: true;
  alreadyStarted: boolean;
  eligibleCount: number;
  lettersCreated: number;
  failures: Array<{ nickname: string; error: string }>;
};

export type RenewalEventStatus = {
  started: boolean;
  startedAt: Date | null;
  eligibleCount: number;
  claimedCount: number;
  amount: number;
};

/**
 * Admin action: start the event.
 *
 * Snapshots all users present *now* and creates one letter per user
 * (eventType = "renewal50", status = "approved", read = false) alongside an
 * `events/{id}` metadata doc. Idempotent — if the event doc already exists,
 * returns its current state without duplicating letters.
 *
 * Letters are written in batches of 400 (Firestore per-batch write ceiling
 * is 500). Failures per-user are collected and returned.
 */
export async function initRenewalEvent(): Promise<RenewalInitResult> {
  const eventRef = doc(db, "events", RENEWAL_EVENT_ID);
  const existing = await getDoc(eventRef);
  if (existing.exists()) {
    const data = existing.data() as RenewalEventDoc;
    return {
      ok: true,
      alreadyStarted: true,
      eligibleCount: data.eligibleCount ?? 0,
      lettersCreated: 0,
      failures: [],
    };
  }

  const usersSnap = await getDocs(collection(db, "users"));
  const nicknames = usersSnap.docs.map((d) => d.id);

  // Create letters in batches. A sentinel `renewalLetterId` on the user doc
  // isn't required — we locate a user's gift letter by querying by to+eventType.
  const BATCH_SIZE = 400;
  const failures: Array<{ nickname: string; error: string }> = [];
  let lettersCreated = 0;

  for (let i = 0; i < nicknames.length; i += BATCH_SIZE) {
    const chunk = nicknames.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const nick of chunk) {
      try {
        const letterRef = doc(collection(db, "letters"));
        batch.set(letterRef, {
          from: RENEWAL_EVENT_SENDER,
          to: nick,
          content: RENEWAL_EVENT_CONTENT,
          status: "approved",
          read: false,
          eventType: RENEWAL_EVENT_TYPE,
          eventId: RENEWAL_EVENT_ID,
          eventClaimed: false,
          createdAt: serverTimestamp(),
          deliveredAt: serverTimestamp(),
        });
      } catch (e) {
        failures.push({
          nickname: nick,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    try {
      await batch.commit();
      lettersCreated += chunk.length - failures.length;
    } catch (e) {
      // Whole batch failed — mark every nickname in this chunk as failed.
      const msg = e instanceof Error ? e.message : String(e);
      for (const nick of chunk) failures.push({ nickname: nick, error: msg });
    }
  }

  // Write the event metadata LAST, so a mid-batch crash doesn't lock the
  // admin out of retrying. (Second call would replay letter creation —
  // acceptable because we still gate the UI by event doc presence.)
  await setDoc(eventRef, {
    startedAt: serverTimestamp(),
    eligibleCount: nicknames.length,
    amount: RENEWAL_EVENT_AMOUNT,
    status: "active",
  } satisfies Omit<RenewalEventDoc, "startedAt"> & {
    startedAt: ReturnType<typeof serverTimestamp>;
  });

  return {
    ok: true,
    alreadyStarted: false,
    eligibleCount: nicknames.length,
    lettersCreated,
    failures,
  };
}

/**
 * User action: claim the renewal gift.
 *
 * Atomic:
 *   1. Reject if claims/{nickname} exists.
 *   2. Create claims/{nickname}.
 *   3. Increment users/{nickname}.points by +50.
 *   4. Mark letter as read + eventClaimed = true.
 *
 * pointHistory is written as a separate append (post-transaction) because
 * Firestore transactions can't create auto-ID docs. Losing the ledger
 * entry on network failure is acceptable since the canonical balance lives
 * on the user doc.
 */
export async function claimRenewalLetter(
  nickname: string,
  letterId: string,
): Promise<{ newPoints: number }> {
  const claimRef = doc(
    db,
    "events",
    RENEWAL_EVENT_ID,
    "claims",
    nickname,
  );
  const userRef = doc(db, "users", nickname);
  const letterRef = doc(db, "letters", letterId);

  const newPoints = await runTransaction(db, async (tx) => {
    const claimSnap = await tx.get(claimRef);
    if (claimSnap.exists()) {
      throw new Error("ALREADY_CLAIMED");
    }
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) {
      throw new Error("USER_NOT_FOUND");
    }
    const currentPoints = (userSnap.data().points as number | undefined) ?? 0;
    const next = currentPoints + RENEWAL_EVENT_AMOUNT;

    tx.set(claimRef, {
      claimedAt: serverTimestamp(),
      amount: RENEWAL_EVENT_AMOUNT,
      letterId,
    });
    tx.update(userRef, { points: next });
    tx.update(letterRef, {
      read: true,
      eventClaimed: true,
    });
    return next;
  });

  // Best-effort ledger + activity log.
  try {
    await setDoc(
      doc(collection(db, "users", nickname, "pointHistory")),
      {
        type: "이벤트",
        points: RENEWAL_EVENT_AMOUNT,
        description: "리뉴얼 기념 선물",
        createdAt: serverTimestamp(),
      },
    );
  } catch (e) {
    console.error("Failed to write pointHistory for renewal claim:", e);
  }
  try {
    await logActivity(
      "event",
      nickname,
      `리뉴얼 기념 별똥별 편지 수령 (+${RENEWAL_EVENT_AMOUNT})`,
      "",
      `events/${RENEWAL_EVENT_ID}/claims/${nickname}`,
    );
  } catch {}

  return { newPoints };
}

/** One-shot status read for the admin page. */
export async function getRenewalEventStatus(): Promise<RenewalEventStatus> {
  const eventSnap = await getDoc(doc(db, "events", RENEWAL_EVENT_ID));
  if (!eventSnap.exists()) {
    const usersSnap = await getDocs(collection(db, "users"));
    return {
      started: false,
      startedAt: null,
      eligibleCount: usersSnap.size,
      claimedCount: 0,
      amount: RENEWAL_EVENT_AMOUNT,
    };
  }
  const data = eventSnap.data() as RenewalEventDoc;
  const claimsSnap = await getDocs(
    collection(db, "events", RENEWAL_EVENT_ID, "claims"),
  );
  return {
    started: true,
    startedAt: data.startedAt ? data.startedAt.toDate() : null,
    eligibleCount: data.eligibleCount ?? 0,
    claimedCount: claimsSnap.size,
    amount: data.amount ?? RENEWAL_EVENT_AMOUNT,
  };
}

/**
 * Live subscription to unclaimed-user list for the admin dashboard.
 * Calls `onUpdate` with { eligible, claimed, unclaimed }.
 */
export function subscribeRenewalClaims(
  onUpdate: (state: {
    eligible: string[];
    claimed: string[];
    unclaimed: string[];
  }) => void,
): () => void {
  // We need both: the list of eligible users (all users as of event start)
  // and the live claim list. Eligible is derived from the letters we created
  // (to field on renewal letters), which is immutable once the event starts.
  let eligible: string[] = [];
  let eligibleLoaded = false;
  let claimedList: string[] = [];

  const emit = () => {
    if (!eligibleLoaded) return;
    const claimedSet = new Set(claimedList);
    const unclaimed = eligible.filter((n) => !claimedSet.has(n));
    onUpdate({ eligible, claimed: claimedList, unclaimed });
  };

  // One-shot eligible fetch from the letters collection.
  const lettersQ = query(
    collection(db, "letters"),
    where("eventId", "==", RENEWAL_EVENT_ID),
  );
  getDocs(lettersQ)
    .then((snap) => {
      eligible = snap.docs
        .map((d) => (d.data().to as string | undefined) ?? "")
        .filter(Boolean);
      eligibleLoaded = true;
      emit();
    })
    .catch((e) => {
      console.error("Failed to load renewal eligible users:", e);
      eligibleLoaded = true;
      emit();
    });

  // Live claim list.
  const unsub = onSnapshot(
    collection(db, "events", RENEWAL_EVENT_ID, "claims"),
    (snap) => {
      claimedList = snap.docs.map((d) => d.id);
      emit();
    },
    (e) => console.error("Failed to subscribe to renewal claims:", e),
  );

  return unsub;
}
