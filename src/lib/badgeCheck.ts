import {
  arrayUnion,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { logActivity } from "./activity";
import { BADGE_BY_ID } from "./badges";

let notifier: ((badgeId: string) => void) | null = null;
export function registerBadgeNotifier(fn: ((badgeId: string) => void) | null) {
  notifier = fn;
}

type UserCounters = {
  totalComments?: number;
  totalPhotos?: number;
  totalGuestbooks?: number;
  totalAdventures?: number;
  totalPostsRead?: number;
  profileChangeCount?: number;
  statusChangeCount?: number;
  bgmChangeCount?: number;
  totalLols?: number;
  consecutiveAttendDays?: number;
  consecutiveCommentDays?: number;
  lastCommentDate?: string;
  lastAttendDate?: string;
  nightActivityDays?: number;
  nightActivityLastDate?: string;
  visitedMinihomepages?: string[];
  guestbookTargets?: string[];
  dailyActivities?: Record<string, string[]>;
  usedMoods?: string[];
  sleepyMoodStreak?: number;
  sleepyMoodLastDate?: string;
  points?: number;
  createdAt?: Timestamp;
  taggedPhotoCount?: number;
  photographerCount?: number;
  allnightChatCount?: number;
  lastChatTimeMs?: number;
  recentChatTimesMs?: number[];
  badgesRetroactiveDone?: boolean;
};

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function findMemberIdByNickname(nickname: string): Promise<string | null> {
  const q = query(
    collection(db, "members"),
    where("nickname", "==", nickname),
    limit(1),
  );
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0].id;
}

export async function awardBadge(nickname: string, badgeId: string): Promise<boolean> {
  const meta = BADGE_BY_ID[badgeId];
  if (!meta) return false;
  const badgeRef = doc(db, "users", nickname, "badges", badgeId);
  const snap = await getDoc(badgeRef);
  if (snap.exists()) return false;
  await setDoc(badgeRef, { badgeId, earnedAt: serverTimestamp() });

  const memberId = await findMemberIdByNickname(nickname);
  const link = memberId ? `/members/${memberId}` : "/";
  try {
    await logActivity(
      "badge",
      nickname,
      `${nickname}님이 배지를 획득했습니다: ${meta.name}`,
      link,
      `users/${nickname}/badges/${badgeId}`,
    );
  } catch {
    /* non-fatal */
  }

  notifier?.(badgeId);
  return true;
}

async function loadUser(nickname: string): Promise<UserCounters> {
  const snap = await getDoc(doc(db, "users", nickname));
  return (snap.data() ?? {}) as UserCounters;
}

async function updateUser(nickname: string, patch: Record<string, unknown>) {
  await setDoc(doc(db, "users", nickname), patch, { merge: true });
}

function isNightHour(h: number): boolean {
  return h >= 3 && h < 5;
}

function isEarlyHour(h: number): boolean {
  return h >= 6 && h < 7;
}

async function evaluateTimeBadges(nickname: string, when: Date) {
  const h = when.getHours();
  const mo = when.getMonth() + 1;
  const d = when.getDate();
  if (isNightHour(h)) await awardBadge(nickname, "night_owl");
  if (isEarlyHour(h)) await awardBadge(nickname, "early_bird");
  if (mo === 10 && d === 31) await awardBadge(nickname, "halloween");
  if (mo === 12 && d === 25) await awardBadge(nickname, "christmas");
}

async function evaluatePointBadges(nickname: string, points: number) {
  if (points >= 100) await awardBadge(nickname, "point_100");
  if (points >= 500) await awardBadge(nickname, "point_500");
  if (points >= 1000) await awardBadge(nickname, "point_1000");
}

async function trackNightActivity(nickname: string, when: Date, user: UserCounters) {
  if (!isNightHour(when.getHours())) return;
  const k = dateKey(when);
  if (user.nightActivityLastDate === k) return;
  const nextCount = (user.nightActivityDays ?? 0) + 1;
  await updateUser(nickname, {
    nightActivityLastDate: k,
    nightActivityDays: nextCount,
  });
  if (nextCount >= 10) await awardBadge(nickname, "night_guard");
}

async function recordDailyActivity(
  nickname: string,
  when: Date,
  kind: "attend" | "comment" | "guestbook" | "photo" | "post",
  user: UserCounters,
) {
  const k = dateKey(when);
  const existing = user.dailyActivities?.[k] ?? [];
  if (!existing.includes(kind)) {
    const next = [...existing, kind];
    await updateUser(nickname, {
      [`dailyActivities.${k}`]: next,
    });
    if (
      next.includes("attend") &&
      next.includes("comment") &&
      next.includes("guestbook") &&
      next.includes("photo") &&
      next.includes("post")
    ) {
      await awardBadge(nickname, "all_in_one");
    }
  }
}

async function checkDaysSinceJoin(nickname: string, user: UserCounters) {
  if (!user.createdAt) return;
  const joined = user.createdAt.toDate();
  const now = new Date();
  const days = Math.floor((now.getTime() - joined.getTime()) / 86400000);
  if (days >= 30) await awardBadge(nickname, "hidden_30days");
  if (days >= 100) await awardBadge(nickname, "hidden_100days");
  if (days === 100) await awardBadge(nickname, "day_100");
}

async function handleCommentContent(
  nickname: string,
  content: string,
  user: UserCounters,
) {
  const trimmed = content.trim();
  const lolCount = (trimmed.match(/ㅋ/g) ?? []).length;
  if (lolCount >= 100) await awardBadge(nickname, "lol_master");
  if (trimmed.length >= 200) await awardBadge(nickname, "novelist");
  if (trimmed.length === 1) await awardBadge(nickname, "one_char");
  if (trimmed.includes("새벽빛")) await awardBadge(nickname, "guild_name");
  if (lolCount > 0) {
    const next = (user.totalLols ?? 0) + lolCount;
    await updateUser(nickname, { totalLols: next });
    if (next >= 500) await awardBadge(nickname, "lol_500");
  }
}

async function handleCommentStreak(
  nickname: string,
  when: Date,
  user: UserCounters,
) {
  const k = dateKey(when);
  if (user.lastCommentDate === k) return;
  const y = new Date(when);
  y.setDate(y.getDate() - 1);
  const yk = dateKey(y);
  const prev = user.consecutiveCommentDays ?? 0;
  const next = user.lastCommentDate === yk ? prev + 1 : 1;
  await updateUser(nickname, {
    lastCommentDate: k,
    consecutiveCommentDays: next,
  });
  if (next >= 3) await awardBadge(nickname, "streak_3");
  if (next >= 7) await awardBadge(nickname, "streak_7");
  if (next >= 14) await awardBadge(nickname, "streak_14");
}

export type BadgeEvent =
  | { type: "login"; nickname: string }
  | { type: "attend"; nickname: string; when: Date }
  | { type: "comment"; nickname: string; content: string; when: Date }
  | { type: "post"; nickname: string; when: Date }
  | { type: "read"; nickname: string }
  | { type: "noticeRead"; nickname: string; noticeCreatedAt: Date | null }
  | {
      type: "photo";
      nickname: string;
      when: Date;
      source: "album" | "minihome";
      people?: string[];
      photographer?: string;
    }
  | { type: "profileCreate"; nickname: string; when: Date }
  | { type: "profileImageChange"; nickname: string }
  | { type: "bgmChange"; nickname: string; first: boolean }
  | { type: "statusChange"; nickname: string }
  | { type: "moodChange"; nickname: string; mood: string; when: Date }
  | {
      type: "minihomeGuestbook";
      nickname: string;
      target: string;
      existingCountOnTargetToday: number;
      existingCountOnTargetTotal: number;
      when: Date;
    }
  | { type: "adventure"; nickname: string; entryDate: string; when: Date }
  | { type: "minihomeVisit"; nickname: string; targetNickname: string }
  | { type: "adminVisit"; nickname: string }
  | { type: "pointsChanged"; nickname: string; newPoints: number }
  | { type: "chat"; nickname: string; when: Date; totalChatCountBeforeThis: number };

export async function handleEvent(ev: BadgeEvent) {
  try {
    await dispatch(ev);
  } catch (e) {
    console.error("[badges] handleEvent error", e);
  }
}

async function dispatch(ev: BadgeEvent) {
  const nickname = ev.nickname;
  const user = await loadUser(nickname);

  switch (ev.type) {
    case "login": {
      await awardBadge(nickname, "first_login");
      await checkDaysSinceJoin(nickname, user);
      return;
    }
    case "attend": {
      const k = dateKey(ev.when);
      if (user.lastAttendDate === k) return;
      const y = new Date(ev.when);
      y.setDate(y.getDate() - 1);
      const yk = dateKey(y);
      const prev = user.consecutiveAttendDays ?? 0;
      const next = user.lastAttendDate === yk ? prev + 1 : 1;
      await updateUser(nickname, {
        lastAttendDate: k,
        consecutiveAttendDays: next,
      });
      if (next >= 7) await awardBadge(nickname, "attend_7");
      if (next >= 30) await awardBadge(nickname, "attend_30");
      if (next >= 100) await awardBadge(nickname, "attend_100");
      await recordDailyActivity(nickname, ev.when, "attend", user);
      await evaluateTimeBadges(nickname, ev.when);
      await trackNightActivity(nickname, ev.when, user);
      return;
    }
    case "comment": {
      await updateUser(nickname, {
        totalComments: increment(1),
      });
      const totalComments = (user.totalComments ?? 0) + 1;
      if (totalComments >= 10) await awardBadge(nickname, "comment_10");
      if (totalComments >= 50) await awardBadge(nickname, "comment_50");
      if (totalComments >= 100) await awardBadge(nickname, "comment_100");
      await handleCommentContent(nickname, ev.content, user);
      await handleCommentStreak(nickname, ev.when, user);
      await evaluateTimeBadges(nickname, ev.when);
      await trackNightActivity(nickname, ev.when, user);
      await recordDailyActivity(nickname, ev.when, "comment", user);
      return;
    }
    case "post": {
      await awardBadge(nickname, "first_post");
      await evaluateTimeBadges(nickname, ev.when);
      await trackNightActivity(nickname, ev.when, user);
      await recordDailyActivity(nickname, ev.when, "post", user);
      return;
    }
    case "read": {
      await updateUser(nickname, { totalPostsRead: increment(1) });
      const total = (user.totalPostsRead ?? 0) + 1;
      if (total >= 20) await awardBadge(nickname, "read_20");
      return;
    }
    case "noticeRead": {
      if (!ev.noticeCreatedAt) return;
      const diffMs = Date.now() - ev.noticeCreatedAt.getTime();
      if (diffMs <= 60 * 1000 && diffMs >= 0) {
        await awardBadge(nickname, "hidden_quick_read");
      }
      return;
    }
    case "photo": {
      if (ev.source === "minihome") {
        await updateUser(nickname, { totalPhotos: increment(1) });
        const total = (user.totalPhotos ?? 0) + 1;
        await awardBadge(nickname, "first_photo");
        if (total >= 10) await awardBadge(nickname, "photo_10");
        await evaluateTimeBadges(nickname, ev.when);
        await trackNightActivity(nickname, ev.when, user);
        await recordDailyActivity(nickname, ev.when, "photo", user);
      } else {
        if (ev.photographer) {
          await updateUser(ev.photographer, { photographerCount: increment(1) });
          const p = await loadUser(ev.photographer);
          if ((p.photographerCount ?? 0) >= 5) {
            await awardBadge(ev.photographer, "photographer_5");
          }
        }
        for (const person of ev.people ?? []) {
          if (!person) continue;
          await updateUser(person, { taggedPhotoCount: increment(1) });
          const p = await loadUser(person);
          if ((p.taggedPhotoCount ?? 0) >= 5) {
            await awardBadge(person, "tagged_5");
          }
        }
      }
      return;
    }
    case "profileCreate": {
      await awardBadge(nickname, "first_profile");
      return;
    }
    case "profileImageChange": {
      await updateUser(nickname, { profileChangeCount: increment(1) });
      const n = (user.profileChangeCount ?? 0) + 1;
      if (n >= 5) await awardBadge(nickname, "profile_change_5");
      if (n >= 20) await awardBadge(nickname, "profile_change_20");
      return;
    }
    case "bgmChange": {
      if (ev.first) await awardBadge(nickname, "first_bgm");
      await updateUser(nickname, { bgmChangeCount: increment(1) });
      const n = (user.bgmChangeCount ?? 0) + 1;
      if (n >= 5) await awardBadge(nickname, "bgm_change_5");
      return;
    }
    case "statusChange": {
      await updateUser(nickname, { statusChangeCount: increment(1) });
      const n = (user.statusChangeCount ?? 0) + 1;
      if (n >= 10) await awardBadge(nickname, "status_10");
      return;
    }
    case "moodChange": {
      const existing = new Set(user.usedMoods ?? []);
      if (!existing.has(ev.mood)) {
        await updateUser(nickname, { usedMoods: arrayUnion(ev.mood) });
      }
      if (ev.mood === "cool" || ev.mood === "😎") {
        await awardBadge(nickname, "cool_mood");
      }
      if (ev.mood === "love" || ev.mood === "🥰") {
        await awardBadge(nickname, "love_mood");
      }

      const knownMoods = new Set([
        "happy",
        "excited",
        "sad",
        "angry",
        "tired",
        "thinking",
        "love",
        "cool",
      ]);
      const nextSet = new Set([...existing, ev.mood]);
      const allCovered = [...knownMoods].every((m) => nextSet.has(m));
      if (allCovered) await awardBadge(nickname, "all_moods");

      const k = dateKey(ev.when);
      if (ev.mood === "tired" || ev.mood === "😴") {
        const y = new Date(ev.when);
        y.setDate(y.getDate() - 1);
        const yk = dateKey(y);
        const prev = user.sleepyMoodStreak ?? 0;
        const next =
          user.sleepyMoodLastDate === k
            ? prev
            : user.sleepyMoodLastDate === yk
              ? prev + 1
              : 1;
        await updateUser(nickname, {
          sleepyMoodStreak: next,
          sleepyMoodLastDate: k,
        });
        if (next >= 3) await awardBadge(nickname, "sleepy_3days");
      }
      return;
    }
    case "minihomeGuestbook": {
      await updateUser(nickname, { totalGuestbooks: increment(1) });
      const total = (user.totalGuestbooks ?? 0) + 1;
      await awardBadge(nickname, "first_message");
      if (total >= 10) await awardBadge(nickname, "guestbook_10");
      if (total >= 30) await awardBadge(nickname, "guestbook_30");

      if (ev.target && ev.target !== nickname) {
        const targets = new Set(user.guestbookTargets ?? []);
        targets.add(ev.target);
        await updateUser(nickname, {
          guestbookTargets: arrayUnion(ev.target),
        });
        if (targets.size >= 10) await awardBadge(nickname, "social_10");
      }

      if (ev.existingCountOnTargetTotal === 0) {
        await awardBadge(nickname, "hidden_first_guest");
      }

      if (ev.existingCountOnTargetToday >= 2) {
        await awardBadge(nickname, "repeat_visit");
      }

      await evaluateTimeBadges(nickname, ev.when);
      await trackNightActivity(nickname, ev.when, user);
      await recordDailyActivity(nickname, ev.when, "guestbook", user);
      return;
    }
    case "adventure": {
      await updateUser(nickname, { totalAdventures: increment(1) });
      const total = (user.totalAdventures ?? 0) + 1;
      await awardBadge(nickname, "first_adventure");
      if (total >= 10) await awardBadge(nickname, "adventure_10");

      try {
        const entry = new Date(ev.entryDate);
        const now = new Date();
        const yearAgo = new Date(
          now.getFullYear() - 1,
          now.getMonth(),
          now.getDate(),
        );
        if (
          entry.getFullYear() === yearAgo.getFullYear() &&
          entry.getMonth() === yearAgo.getMonth() &&
          entry.getDate() === yearAgo.getDate()
        ) {
          await awardBadge(nickname, "hidden_time_travel");
        }
      } catch {}
      return;
    }
    case "minihomeVisit": {
      if (ev.targetNickname === nickname) return;
      const visited = new Set(user.visitedMinihomepages ?? []);
      if (visited.has(ev.targetNickname)) return;
      await updateUser(nickname, {
        visitedMinihomepages: arrayUnion(ev.targetNickname),
      });
      const members = await getDocs(collection(db, "members"));
      const allNicks = members.docs
        .map((d) => d.data().nickname as string)
        .filter((n) => !!n && n !== nickname);
      const next = new Set([...visited, ev.targetNickname]);
      if (allNicks.length > 0 && allNicks.every((n) => next.has(n))) {
        await awardBadge(nickname, "hidden_explorer");
      }
      return;
    }
    case "adminVisit": {
      await awardBadge(nickname, "hidden_admin");
      return;
    }
    case "pointsChanged": {
      await evaluatePointBadges(nickname, ev.newPoints);
      return;
    }
    case "chat": {
      if (ev.totalChatCountBeforeThis === 0) {
        await awardBadge(nickname, "hidden_first_chat");
      }
      const h = ev.when.getHours();
      if (h < 5) {
        const next = (user.allnightChatCount ?? 0) + 1;
        await updateUser(nickname, { allnightChatCount: increment(1) });
        if (next >= 10) await awardBadge(nickname, "hidden_allnight");
      }
      const nowMs = ev.when.getTime();
      const recent = [...(user.recentChatTimesMs ?? []), nowMs].filter(
        (t) => nowMs - t <= 60 * 1000,
      );
      await updateUser(nickname, { recentChatTimesMs: recent.slice(-10) });
      if (recent.length >= 5) await awardBadge(nickname, "hidden_spam");
      return;
    }
  }
}

export async function runRetroactiveScan(nickname: string) {
  const user = await loadUser(nickname);
  if (user.badgesRetroactiveDone) return;

  const patch: Record<string, unknown> = {};

  // Days since join
  await checkDaysSinceJoin(nickname, user);

  // Points
  if (typeof user.points === "number") {
    await evaluatePointBadges(nickname, user.points);
  }

  // First profile
  const memberSnap = await getDocs(
    query(collection(db, "members"), where("nickname", "==", nickname), limit(1)),
  );
  if (!memberSnap.empty) {
    await awardBadge(nickname, "first_profile");
    const m = memberSnap.docs[0].data();
    if (m.bgmUrl) await awardBadge(nickname, "first_bgm");
    if (m.mood === "😎") await awardBadge(nickname, "cool_mood");
    if (m.mood === "🥰") await awardBadge(nickname, "love_mood");
  }

  // Total comments (board + minihome photo + album photo + minihome guestbook replies)
  const timestamps: Date[] = [];
  try {
    const cgComments = await getDocs(
      query(collectionGroup(db, "comments"), where("nickname", "==", nickname)),
    );
    const cgReplies = await getDocs(
      query(collectionGroup(db, "replies"), where("nickname", "==", nickname)),
    );
    let totalLols = 0;
    let sawLolMaster = false;
    let sawNovelist = false;
    let sawOneChar = false;
    let sawGuildName = false;
    const scan = (data: Record<string, unknown>) => {
      const raw =
        typeof data.content === "string"
          ? (data.content as string)
          : typeof data.message === "string"
            ? (data.message as string)
            : "";
      const trimmed = raw.trim();
      const lols = (trimmed.match(/ㅋ/g) ?? []).length;
      totalLols += lols;
      if (lols >= 100) sawLolMaster = true;
      if (trimmed.length >= 200) sawNovelist = true;
      if (trimmed.length === 1) sawOneChar = true;
      if (trimmed.includes("새벽빛")) sawGuildName = true;
      const ts = (data.createdAt as Timestamp | undefined)?.toDate?.();
      if (ts) timestamps.push(ts);
    };
    cgComments.docs.forEach((d) => scan(d.data()));
    cgReplies.docs.forEach((d) => scan(d.data()));
    const total = cgComments.size + cgReplies.size;
    patch.totalComments = total;
    patch.totalLols = totalLols;
    if (total >= 10) await awardBadge(nickname, "comment_10");
    if (total >= 50) await awardBadge(nickname, "comment_50");
    if (total >= 100) await awardBadge(nickname, "comment_100");
    if (sawLolMaster) await awardBadge(nickname, "lol_master");
    if (sawNovelist) await awardBadge(nickname, "novelist");
    if (sawOneChar) await awardBadge(nickname, "one_char");
    if (sawGuildName) await awardBadge(nickname, "guild_name");
    if (totalLols >= 500) await awardBadge(nickname, "lol_500");
  } catch {}

  // First board post / posts count not tracked for badge, only first
  try {
    const posts = await getDocs(
      query(collection(db, "board"), where("nickname", "==", nickname), limit(1)),
    );
    if (!posts.empty) await awardBadge(nickname, "first_post");
  } catch {}

  // Album photographer credit (does not count toward first_photo / photo_10)
  try {
    const albums = await getDocs(
      query(collection(db, "album"), where("photographer", "==", nickname)),
    );
    patch.photographerCount = albums.size;
    if (albums.size >= 5) await awardBadge(nickname, "photographer_5");
  } catch {}

  // Minihome photos uploaded by this user (counts toward first_photo / photo_10)
  try {
    if (!memberSnap.empty) {
      const memberId = memberSnap.docs[0].id;
      const mhPhotos = await getDocs(
        collection(db, "members", memberId, "photos"),
      );
      patch.totalPhotos = mhPhotos.size;
      if (mhPhotos.size >= 1) await awardBadge(nickname, "first_photo");
      if (mhPhotos.size >= 10) await awardBadge(nickname, "photo_10");
    }
  } catch {}

  // Tagged photos (album people array contains nickname)
  try {
    const tagged = await getDocs(
      query(
        collection(db, "album"),
        where("people", "array-contains", nickname),
      ),
    );
    patch.taggedPhotoCount = tagged.size;
    if (tagged.size >= 5) await awardBadge(nickname, "tagged_5");
  } catch {}

  // Minihome guestbook entries authored by this user
  try {
    const cgGuestbook = await getDocs(
      query(collectionGroup(db, "guestbook"), where("nickname", "==", nickname)),
    );
    patch.totalGuestbooks = cgGuestbook.size;
    if (cgGuestbook.size >= 1) await awardBadge(nickname, "first_message");
    if (cgGuestbook.size >= 10) await awardBadge(nickname, "guestbook_10");
    if (cgGuestbook.size >= 30) await awardBadge(nickname, "guestbook_30");

    const targets = new Set<string>();
    const perTargetPerDay: Record<string, number> = {};
    const memberOwnerCache: Record<string, string> = {};
    for (const d of cgGuestbook.docs) {
      const p = d.ref.path;
      const seg = p.split("/");
      const memberIdx = seg.indexOf("members");
      const memberId = memberIdx !== -1 ? seg[memberIdx + 1] : null;
      let ownerNick: string | undefined;
      if (memberId) {
        if (memberOwnerCache[memberId]) {
          ownerNick = memberOwnerCache[memberId];
        } else {
          const ownerSnap = await getDoc(doc(db, "members", memberId));
          ownerNick = ownerSnap.data()?.nickname as string | undefined;
          if (ownerNick) memberOwnerCache[memberId] = ownerNick;
        }
      }
      if (ownerNick && ownerNick !== nickname) targets.add(ownerNick);

      const data = d.data();
      const ts = (data.createdAt as Timestamp | undefined)?.toDate?.();
      if (ts) {
        timestamps.push(ts);
        if (memberId) {
          const k = `${memberId}__${dateKey(ts)}`;
          perTargetPerDay[k] = (perTargetPerDay[k] ?? 0) + 1;
        }
      }

      // hidden_first_guest: if I was first to write on this minihome
      if (memberId) {
        const earliest = await getDocs(
          query(
            collection(db, "members", memberId, "guestbook"),
            orderBy("createdAt", "asc"),
            limit(1),
          ),
        );
        if (
          !earliest.empty &&
          earliest.docs[0].data().nickname === nickname
        ) {
          await awardBadge(nickname, "hidden_first_guest");
        }
      }
    }
    patch.guestbookTargets = [...targets];
    if (targets.size >= 10) await awardBadge(nickname, "social_10");
    if (Object.values(perTargetPerDay).some((c) => c >= 3)) {
      await awardBadge(nickname, "repeat_visit");
    }
  } catch {}

  // Adventures authored by this user (adventures are under members/{id}/adventures)
  try {
    if (!memberSnap.empty) {
      const memberId = memberSnap.docs[0].id;
      const adv = await getDocs(collection(db, "members", memberId, "adventures"));
      patch.totalAdventures = adv.size;
      if (adv.size >= 1) await awardBadge(nickname, "first_adventure");
      if (adv.size >= 10) await awardBadge(nickname, "adventure_10");

      for (const d of adv.docs) {
        const data = d.data();
        const ts = (data.createdAt as Timestamp | undefined)?.toDate?.();
        if (ts) timestamps.push(ts);
        const entryStr = data.date as string | undefined;
        const recordedAt = ts;
        if (entryStr && recordedAt) {
          try {
            const entryDate = new Date(entryStr);
            const yearAgo = new Date(
              recordedAt.getFullYear() - 1,
              recordedAt.getMonth(),
              recordedAt.getDate(),
            );
            if (
              entryDate.getFullYear() === yearAgo.getFullYear() &&
              entryDate.getMonth() === yearAgo.getMonth() &&
              entryDate.getDate() === yearAgo.getDate()
            ) {
              await awardBadge(nickname, "hidden_time_travel");
            }
          } catch {}
        }
      }
    }
  } catch {}

  // Chat-related: first chat, allnight count, spam window
  try {
    const userChats = await getDocs(
      query(collection(db, "chat"), where("nickname", "==", nickname)),
    );
    if (!userChats.empty) {
      const earliestAny = await getDocs(
        query(collection(db, "chat"), orderBy("createdAt", "asc"), limit(1)),
      );
      if (
        !earliestAny.empty &&
        earliestAny.docs[0].data().nickname === nickname
      ) {
        await awardBadge(nickname, "hidden_first_chat");
      }

      let allnight = 0;
      const msTimes: number[] = [];
      for (const d of userChats.docs) {
        const ts = (d.data().createdAt as Timestamp | undefined)?.toDate?.();
        if (!ts) continue;
        timestamps.push(ts);
        if (ts.getHours() < 5) allnight++;
        msTimes.push(ts.getTime());
      }
      if (allnight >= 10) await awardBadge(nickname, "hidden_allnight");

      msTimes.sort((a, b) => a - b);
      let sawSpam = false;
      for (let i = 0; i + 4 < msTimes.length; i++) {
        if (msTimes[i + 4] - msTimes[i] <= 60 * 1000) {
          sawSpam = true;
          break;
        }
      }
      if (sawSpam) await awardBadge(nickname, "hidden_spam");
    }
  } catch {}

  // Time-based badges across all collected activity timestamps
  const nightDays = new Set<string>();
  for (const ts of timestamps) {
    const h = ts.getHours();
    const mo = ts.getMonth() + 1;
    const d = ts.getDate();
    if (isNightHour(h)) {
      nightDays.add(dateKey(ts));
      await awardBadge(nickname, "night_owl");
    }
    if (isEarlyHour(h)) await awardBadge(nickname, "early_bird");
    if (mo === 10 && d === 31) await awardBadge(nickname, "halloween");
    if (mo === 12 && d === 25) await awardBadge(nickname, "christmas");
  }
  patch.nightActivityDays = nightDays.size;
  if (nightDays.size >= 10) await awardBadge(nickname, "night_guard");

  patch.badgesRetroactiveDone = true;
  await updateDoc(doc(db, "users", nickname), patch).catch(async () => {
    await setDoc(doc(db, "users", nickname), patch, { merge: true });
  });
}

export async function listEarnedBadges(
  nickname: string,
): Promise<{ id: string; earnedAt: Timestamp | null }[]> {
  const snap = await getDocs(collection(db, "users", nickname, "badges"));
  return snap.docs.map((d) => ({
    id: d.id,
    earnedAt: (d.data().earnedAt as Timestamp | null) ?? null,
  }));
}
