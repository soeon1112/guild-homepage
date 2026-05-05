#!/usr/bin/env node
// One-shot migration: rewrite legacy activity.message strings into the
// new format introduced in dac0c09. For comment/guestbook types, the
// new format embeds nickname + content excerpts, which old messages
// don't carry — we resolve them by reading the source doc via the
// activity's `targetPath` field.
//
// Usage:
//   node scripts/migrate-activity-messages.mjs --dry-run
//   node scripts/migrate-activity-messages.mjs --apply
//
// Always run --dry-run first.
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sibling = resolve(__dirname, "..", "..", "dawnlight-app", "dawnlight-guild-3181d3388f9f.json");
const credential = existsSync(sibling)
  ? cert(JSON.parse(readFileSync(sibling, "utf8")))
  : applicationDefault();
initializeApp({ credential });
const db = getFirestore();

const APPLY = process.argv.includes("--apply");
const DRY = !APPLY;

// ── text helpers (mirror of src/lib/text.ts) ──────────────────────
function truncate(text, maxLen) {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}
function hasFinalConsonant(word) {
  if (!word) return false;
  // trailing 따옴표/괄호/구두점/이모지는 발음에 기여 X — 그 앞 letter 로 판단.
  let i = word.length - 1;
  while (i >= 0) {
    const c = word[i];
    const code = c.charCodeAt(0);
    const isHangul = code >= 0xac00 && code <= 0xd7a3;
    const isCjk = code >= 0x3040 && code <= 0x9fff;
    const isDigit = c >= "0" && c <= "9";
    const lower = c.toLowerCase();
    const isAscii = lower >= "a" && lower <= "z";
    if (isHangul || isCjk || isDigit || isAscii) break;
    i--;
  }
  if (i < 0) return false;
  const last = word[i];
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (code >= 0x3040) return true;
  if (last >= "0" && last <= "9") return ["0", "1", "3", "6", "7", "8"].includes(last);
  const lower = last.toLowerCase();
  if (lower >= "a" && lower <= "z") return !["a", "e", "i", "o", "u", "w", "y"].includes(lower);
  return true;
}
function josa(word, type) {
  const has = hasFinalConsonant(word);
  if (type === "을/를") return has ? "을" : "를";
  if (type === "이/가") return has ? "이" : "가";
  if (type === "은/는") return has ? "은" : "는";
}

// ── per-type rewriter ─────────────────────────────────────────────
// Each rewriter is async — even if it doesn't fetch — so we can call
// them uniformly. Returns the new message, or `null` if the legacy
// shape isn't recognised (already migrated / hand-edited / admin).

async function rewriteNotice(msg) {
  const m = /^새로운 공지가 등록되었습니다: (.+)$/.exec(msg);
  if (!m) return null;
  const title = m[1].trim();
  return `공지 '${truncate(title, 15)}'${josa(title, "이/가")} 올라왔어요`;
}

async function rewriteBoard(msg) {
  const m = /^게시판에 새 글이 등록되었습니다: (.+)$/.exec(msg);
  if (!m) return null;
  const title = m[1].trim();
  return `게시글 '${truncate(title, 15)}'${josa(title, "이/가")} 올라왔어요`;
}

// board_comment: targetPath = board/{postId}/comments/{cId}[/replies/{rId}]
// source doc fields: nickname, content
async function rewriteBoardComment(msg, doc) {
  if (msg !== "게시판에 새 댓글이 달렸습니다") return null;
  const tp = doc.targetPath;
  if (tp) {
    try {
      const src = (await db.doc(tp).get()).data();
      const nickname = src?.nickname || doc.nickname;
      const content = (src?.content || "").trim();
      if (nickname && content) {
        return `게시글 댓글에 ${nickname}님이 '${truncate(content, 25)}'${josa(content, "을/를")} 달았어요`;
      }
      if (nickname) return `게시글 댓글에 ${nickname}님이 댓글을 달았어요`;
    } catch {/* ignore */}
  }
  const nick = doc.nickname;
  return nick
    ? `게시글 댓글에 ${nick}님이 댓글을 달았어요`
    : "게시글에 새 댓글이 달렸어요";
}

async function rewriteSchedule(msg) {
  const m = /^새로운 일정이 등록되었습니다: (.+)$/.exec(msg);
  if (!m) return null;
  const title = m[1].trim();
  return `일정 '${truncate(title, 15)}'${josa(title, "이/가")} 올라왔어요`;
}

// album: targetPath = album/{photoId}
// source doc has photographer (and caption — gaide doesn't include it)
async function rewriteAlbum(msg, doc) {
  if (msg !== "새 앨범 사진이 업로드되었습니다") return null;
  const tp = doc.targetPath;
  if (tp) {
    try {
      const src = (await db.doc(tp).get()).data();
      const ph = src?.photographer;
      if (ph) return `${ph}님이 앨범에 사진을 올렸어요`;
    } catch {/* ignore */}
  }
  const nick = doc.nickname;
  return nick
    ? `${nick}님이 앨범에 사진을 올렸어요`
    : "앨범에 사진이 올라왔어요";
}

// album_comment: targetPath = album/{photoId}/comments/{cId}[/replies/{rId}]
// source doc fields: nickname, content
async function rewriteAlbumComment(msg, doc) {
  if (msg !== "앨범에 새 댓글이 달렸습니다") return null;
  const tp = doc.targetPath;
  if (tp) {
    try {
      const src = (await db.doc(tp).get()).data();
      const nickname = src?.nickname || doc.nickname;
      const content = (src?.content || "").trim();
      if (nickname && content) {
        return `앨범 댓글에 ${nickname}님이 '${truncate(content, 25)}'${josa(content, "을/를")} 달았어요`;
      }
      if (nickname) return `앨범 댓글에 ${nickname}님이 댓글을 달았어요`;
    } catch {/* ignore */}
  }
  const nick = doc.nickname;
  return nick
    ? `앨범 댓글에 ${nick}님이 댓글을 달았어요`
    : "앨범에 새 댓글이 달렸어요";
}

async function rewriteCombat(msg) {
  const m = /^(.+?)님이 투력을 업데이트했습니다$/.exec(msg);
  if (!m) return null;
  return `${m[1]}님이 투력을 업데이트했어요`;
}

async function rewriteTitle(msg) {
  const m = /^(.+?)님이 새 칭호를 장착했습니다: (.+)$/.exec(msg);
  if (!m) return null;
  const nick = m[1];
  const combined = m[2].trim();
  return `${nick}님이 새 칭호 '${combined}'${josa(combined, "을/를")} 장착했어요`;
}

async function rewriteStatus(msg) {
  const m = /^(.+?)님이 한마디를 수정했습니다$/.exec(msg);
  if (!m) return null;
  return `${m[1]}님이 한마디를 수정했어요`;
}

async function rewriteMood(msg) {
  const m = /^(.+?)님이 오늘 기분을 (.+)으로 설정했습니다$/.exec(msg);
  if (!m) return null;
  return `${m[1]}님이 오늘 기분을 ${m[2]}으로 설정했어요`;
}

async function rewriteBgm(msg) {
  const m = /^(.+?)님이 배경음악을 (변경|설정)했습니다$/.exec(msg);
  if (!m) return null;
  return `${m[1]}님이 배경음악을 ${m[2]}했어요`;
}

async function rewriteMbti(msg) {
  const m = /^(.+?)님의 MBTI가 (변경|추가)되었습니다$/.exec(msg);
  if (!m) return null;
  const nick = m[1];
  const verb = m[2] === "추가" ? "설정" : "변경";
  return `${nick}님이 MBTI를 ${verb}했어요`;
}

async function rewriteProfileImage(msg) {
  // Old message has no first-vs-update info. Default to "변경" (the
  // common case after the first photo set).
  const m = /^(.+?)님이 프로필 사진을 수정했습니다$/.exec(msg);
  if (!m) return null;
  return `${m[1]}님이 프로필 사진을 변경했어요`;
}

// guestbook: two shapes
//   "공간에 방명록이 달렸습니다"  → entry
//   "공간에 댓글이 달렸습니다"    → reply (subcollection)
// targetPath ends in /guestbook/{eId} or .../replies/{rId}
// source doc fields: nickname, message
async function rewriteGuestbook(msg, doc) {
  const isEntry = /^(.+?)님의 공간에 방명록이 달렸습니다$/.test(msg);
  const isReply = /^(.+?)님의 공간에 댓글이 달렸습니다$/.test(msg);
  if (!isEntry && !isReply) return null;
  const m = (isEntry
    ? /^(.+?)님의 공간에 방명록이 달렸습니다$/
    : /^(.+?)님의 공간에 댓글이 달렸습니다$/).exec(msg);
  const memberNick = m[1];
  const tp = doc.targetPath;
  if (tp) {
    try {
      const src = (await db.doc(tp).get()).data();
      const content = (src?.message || "").trim();
      if (content) {
        if (isEntry) {
          return `${memberNick}님의 방명록에 '${truncate(content, 25)}'${josa(content, "이/가")} 달렸어요`;
        }
        return `${memberNick}님의 방명록 댓글에 '${truncate(content, 25)}'${josa(content, "이/가")} 달렸어요`;
      }
    } catch {/* ignore */}
  }
  return isEntry
    ? `${memberNick}님의 방명록에 글이 달렸어요`
    : `${memberNick}님의 방명록에 댓글이 달렸어요`;
}

async function rewriteAdventure(msg) {
  const m = /^(.+?)님이 새로운 모험 기록을 남겼습니다$/.exec(msg);
  if (!m) return null;
  return `${m[1]}님이 새로운 모험 기록을 남겼어요`;
}

async function rewritePhoto(msg) {
  // Old (web): "${actor}님의 공간이 업데이트되었습니다"
  // Old (RN app): "${nick}님이 새 사진을 올렸습니다"
  const m1 = /^(.+?)님의 공간이 업데이트되었습니다$/.exec(msg);
  if (m1) return `${m1[1]}님의 사진첩에 사진이 올라왔어요`;
  const m2 = /^(.+?)님이 새 사진을 올렸습니다$/.exec(msg);
  if (m2) return `${m2[1]}님의 사진첩에 사진이 올라왔어요`;
  return null;
}

// minihome_photo_comment / legacy photo_comment:
//   "공간에 댓글이 달렸습니다" or "사진에 댓글이 달렸습니다"
// targetPath: members/{id}/photos/{pId}/comments/{cId}[/replies/{rId}]
// source doc fields: nickname, content
async function rewritePhotoComment(msg, doc) {
  const m1 = /^(.+?)님의 공간에 댓글이 달렸습니다$/.exec(msg);
  const m2 = /^(.+?)님의 사진에 댓글이 달렸습니다$/.exec(msg);
  const m = m1 || m2;
  if (!m) return null;
  const memberNick = m[1];
  const tp = doc.targetPath;
  if (tp) {
    try {
      const src = (await db.doc(tp).get()).data();
      const content = (src?.content || "").trim();
      if (content) {
        return `${memberNick}님의 사진첩 댓글에 '${truncate(content, 25)}'${josa(content, "이/가")} 달렸어요`;
      }
    } catch {/* ignore */}
  }
  return `${memberNick}님의 사진첩 댓글이 달렸어요`;
}

async function rewriteKeyword(msg) {
  // Old message has no keyword text; targetPath also empty.
  const m = /^(.+?)님에게 키워드가 추가되었습니다$/.exec(msg);
  if (!m) return null;
  return `${m[1]}님의 키워드가 추가되었어요`;
}

async function rewriteBadge(msg) {
  const m1 = /^(.+?)님이 배지를 획득했습니다: (.+)$/.exec(msg);
  if (m1) return `${m1[1]}님이 배지를 획득했어요: ${m1[2]}`;
  const m2 = /^(.+?)님이 숨겨진 배지를 획득했습니다$/.exec(msg);
  if (m2) return `${m2[1]}님이 숨겨진 배지를 획득했어요`;
  return null;
}

const REWRITERS = {
  notice: rewriteNotice,
  board: rewriteBoard,
  board_comment: rewriteBoardComment,
  schedule: rewriteSchedule,
  album: rewriteAlbum,
  album_comment: rewriteAlbumComment,
  combat: rewriteCombat,
  title: rewriteTitle,
  status: rewriteStatus,
  mood: rewriteMood,
  bgm: rewriteBgm,
  mbti: rewriteMbti,
  profile_image: rewriteProfileImage,
  guestbook: rewriteGuestbook,
  adventure: rewriteAdventure,
  photo: rewritePhoto,
  minihome_photo_comment: rewritePhotoComment,
  photo_comment: rewritePhotoComment,
  keyword: rewriteKeyword,
  badge: rewriteBadge,
  // admin: free-form, leave alone
};

// ── main ──────────────────────────────────────────────────────────
console.log(`\n=== migrate-activity-messages (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

const snap = await db.collection("activity").get();
console.log(`scanning ${snap.size} docs (with source-doc lookups)…\n`);

const stats = {};
const updates = [];
let sourceFetched = 0;
let sourceMissing = 0;

// Process all docs in parallel with bounded concurrency. Activity has
// ~300 docs, source reads add up to another ~211 — running them in
// chunks of 10 keeps the script under a second total.
async function processOne(doc) {
  const data = doc.data();
  const type = typeof data.type === "string" ? data.type : "(none)";
  const oldMsg = typeof data.message === "string" ? data.message : "";

  if (!stats[type]) {
    stats[type] = {
      total: 0,
      changed: 0,
      unchanged: 0,
      unmatched: 0,
      changedSamples: [],
      unmatchedSamples: [],
    };
  }
  const s = stats[type];
  s.total++;

  const rewriter = REWRITERS[type];
  if (!rewriter) {
    s.unchanged++;
    return;
  }
  // Track source fetch attempts for types that traverse targetPath.
  const fetchTypes = new Set([
    "board_comment",
    "album",
    "album_comment",
    "guestbook",
    "minihome_photo_comment",
    "photo_comment",
  ]);
  let willFetch = false;
  if (fetchTypes.has(type) && data.targetPath) willFetch = true;

  const newMsg = await rewriter(oldMsg, data);
  if (willFetch) {
    // crude: rewriter returned a long-form (with quoted content) only
    // when fetch succeeded. heuristic: contains '
    if (newMsg && /'/.test(newMsg)) sourceFetched++;
    else sourceMissing++;
  }

  if (newMsg === null) {
    s.unmatched++;
    if (s.unmatchedSamples.length < 3) {
      s.unmatchedSamples.push({ id: doc.id, before: oldMsg });
    }
    return;
  }
  if (newMsg === oldMsg) {
    s.unchanged++;
    return;
  }
  s.changed++;
  if (s.changedSamples.length < 5) {
    s.changedSamples.push({ id: doc.id, before: oldMsg, after: newMsg });
  }
  updates.push({ ref: doc.ref, message: newMsg });
}

const CONCURRENCY = 10;
const docs = snap.docs;
for (let i = 0; i < docs.length; i += CONCURRENCY) {
  await Promise.all(docs.slice(i, i + CONCURRENCY).map(processOne));
}

// ── report ────────────────────────────────────────────────────────
const types = Object.keys(stats).sort();
let totalChanged = 0;
let totalUnmatched = 0;
for (const t of types) {
  const s = stats[t];
  totalChanged += s.changed;
  totalUnmatched += s.unmatched;
  console.log(
    `[${t}] total=${s.total} changed=${s.changed} unchanged=${s.unchanged} unmatched=${s.unmatched}`,
  );
  for (const sm of s.changedSamples) {
    console.log(`   ✏  ${sm.id}`);
    console.log(`      - ${sm.before}`);
    console.log(`      + ${sm.after}`);
  }
  for (const sm of s.unmatchedSamples) {
    console.log(`   ?  ${sm.id} (no rule matched)`);
    console.log(`      = ${sm.before}`);
  }
}

console.log(
  `\nsummary: total=${snap.size} willChange=${totalChanged} unmatched=${totalUnmatched}`,
);
console.log(
  `source lookups: succeeded=${sourceFetched} missing/empty=${sourceMissing}`,
);

// ── apply ─────────────────────────────────────────────────────────
if (DRY) {
  console.log(`\n[DRY-RUN] no writes. re-run with --apply to write.\n`);
  process.exit(0);
}

console.log(`\n[APPLY] writing ${updates.length} doc(s) in batches of 500…`);
let written = 0;
for (let i = 0; i < updates.length; i += 500) {
  const chunk = updates.slice(i, i + 500);
  const batch = db.batch();
  for (const u of chunk) batch.update(u.ref, { message: u.message });
  await batch.commit();
  written += chunk.length;
  console.log(`  committed ${written}/${updates.length}`);
}
console.log(`\n[APPLY] done. wrote ${written} doc(s).\n`);
process.exit(0);
