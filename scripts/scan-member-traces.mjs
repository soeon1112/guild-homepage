#!/usr/bin/env node
// READ-ONLY scan: enumerate every Firestore doc that mentions a given
// nickname so we know exactly what would be touched on guild-leave.
//
//   node scripts/scan-member-traces.mjs 버음바
//
// Output is grouped into:
//   (1) "core identity" docs — users/{nick}, members/{slot|nick},
//       playgroundPets/{nick}, fishing_players/{nick} + subcollections
//   (2) "authored" docs — posts/comments/replies/letters where this
//       nickname is the writer (author/from)
//   (3) "addressed" docs — letters/requests where this nickname is the
//       recipient (to)
//   (4) "owned title" — titleWords doc whose `owner` field matches.
//
// Uses collectionGroup queries to catch nested comments/replies.
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sibling = resolve(
  __dirname,
  "..",
  "..",
  "dawnlight-app",
  "dawnlight-guild-3181d3388f9f.json",
);
const credential = existsSync(sibling)
  ? cert(JSON.parse(readFileSync(sibling, "utf8")))
  : applicationDefault();
initializeApp({ credential });
const db = getFirestore();

const NICK = process.argv[2];
if (!NICK) {
  console.error("usage: node scripts/scan-member-traces.mjs <nickname>");
  process.exit(1);
}

console.log(`\n========== scanning Firestore for '${NICK}' ==========\n`);

// ── 1. CORE IDENTITY ───────────────────────────────────────────
console.log("── (1) core identity ───────────────────────────────");

// users/{nick}
const userSnap = await db.doc(`users/${NICK}`).get();
console.log(`users/${NICK}: ${userSnap.exists ? "EXISTS" : "(none)"}`);
if (userSnap.exists) {
  const d = userSnap.data();
  const masked = { ...d };
  if (masked.password) masked.password = "<hidden>";
  console.log(`   keys: ${Object.keys(d).join(", ")}`);
  console.log(`   pushToken: ${masked.pushToken ? "yes" : "no"}, points: ${masked.points ?? "-"}`);
}

// users/{nick}/* subcollections
const USER_SUBS = [
  "pointHistory",
  "badges",
  "pet",
  "keywords",
  "playgroundLog",
  "petGifts",
  "fishing",
];
for (const sub of USER_SUBS) {
  const snap = await db.collection(`users/${NICK}/${sub}`).get();
  if (snap.size > 0) {
    console.log(`users/${NICK}/${sub}: ${snap.size} docs`);
    snap.docs.slice(0, 3).forEach((d) => {
      console.log(`   ${d.id}`);
    });
    if (snap.size > 3) console.log(`   … +${snap.size - 3} more`);
  }
}

// members — try both nick-id and slot-id (nickname field)
const memberHits = [];
const memberDirect = await db.doc(`members/${NICK}`).get();
if (memberDirect.exists) {
  memberHits.push({ id: NICK, source: "nick-keyed" });
}
const allMembers = await db.collection("members").get();
allMembers.forEach((d) => {
  if (d.id === NICK) return; // already added
  const data = d.data();
  if (data.nickname === NICK) {
    memberHits.push({ id: d.id, source: `nickname-field` });
  }
});
console.log(`\nmembers/* matching '${NICK}':`);
if (memberHits.length === 0) console.log("   (none)");
for (const hit of memberHits) {
  console.log(`   members/${hit.id}  [${hit.source}]`);
  const MEMBER_SUBS = ["guestbook", "adventures", "photos", "keywords"];
  for (const sub of MEMBER_SUBS) {
    const sub1 = await db.collection(`members/${hit.id}/${sub}`).get();
    if (sub1.size > 0) {
      console.log(`      └ ${sub}: ${sub1.size} docs`);
      // Check 1 nesting level (replies/comments)
      for (const d of sub1.docs) {
        const reps = sub === "guestbook" ? "replies" : sub === "photos" ? "comments" : null;
        if (!reps) continue;
        const r = await db.collection(`members/${hit.id}/${sub}/${d.id}/${reps}`).get();
        if (r.size > 0) {
          console.log(`         └ ${sub}/${d.id}/${reps}: ${r.size} docs`);
          if (sub === "photos") {
            for (const c of r.docs) {
              const r2 = await db.collection(`members/${hit.id}/${sub}/${d.id}/${reps}/${c.id}/replies`).get();
              if (r2.size > 0) console.log(`            └ comments/${c.id}/replies: ${r2.size}`);
            }
          }
        }
      }
    }
  }
}

// playgroundPets/{nick}
const pp = await db.doc(`playgroundPets/${NICK}`).get();
console.log(`\nplaygroundPets/${NICK}: ${pp.exists ? "EXISTS" : "(none)"}`);

// fishing_players/{nick}
const fp = await db.doc(`fishing_players/${NICK}`).get();
console.log(`fishing_players/${NICK}: ${fp.exists ? "EXISTS" : "(none)"}`);

// ── 2. AUTHORED ────────────────────────────────────────────────
console.log("\n── (2) authored docs (nickname=='" + NICK + "') ──");

async function countWhere(col, field, val, label) {
  const snap = await db.collection(col).where(field, "==", val).get();
  if (snap.size === 0) {
    console.log(`${label || col}: (none)`);
    return [];
  }
  console.log(`${label || col}: ${snap.size} docs`);
  snap.docs.slice(0, 5).forEach((d) => {
    const data = d.data();
    const preview = data.message || data.content || data.title || data.caption || data.text || "";
    const date = data.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 10) || "?";
    console.log(`   ${d.id} [${date}] ${String(preview).slice(0, 60)}`);
  });
  if (snap.size > 5) console.log(`   … +${snap.size - 5} more`);
  return snap.docs;
}

// chat: nickname
await countWhere("chat", "nickname", NICK);
// activity: nickname
await countWhere("activity", "nickname", NICK);
// guestbook (top-level "별의 속삭임"): nickname
await countWhere("guestbook", "nickname", NICK, "guestbook (whispers)");
// playgroundChat: nickname
await countWhere("playgroundChat", "nickname", NICK);
// fishing_chat: nickname
await countWhere("fishing_chat", "nickname", NICK);

// album posts: photographer
const albumDocs = await countWhere("album", "photographer", NICK);
// board posts: nickname
const boardDocs = await countWhere("board", "nickname", NICK);
// schedule: no author field per source — skip

// characters: owner
const charDocs = await countWhere("characters", "owner", NICK);
for (const c of charDocs) {
  const hist = await db.collection(`characters/${c.id}/history`).get();
  if (hist.size > 0) console.log(`   └ characters/${c.id}/history: ${hist.size} docs`);
}

// letters: from
await countWhere("letters", "from", NICK, "letters (sent)");

// playgroundRequests: from
await countWhere("playgroundRequests", "from", NICK, "playgroundRequests (sent)");

// ── nested comments/replies — manual walk ───────────────
// (collectionGroup queries need composite indexes per field; we walk
// manually instead so this scan stays index-free.)
console.log("\n-- nested comments/replies (manual walk) --");
const nested = [];

async function scanCommentsTree(parentPath) {
  const cmtSnap = await db.collection(`${parentPath}/comments`).get();
  for (const c of cmtSnap.docs) {
    const data = c.data();
    if (data.nickname === NICK) {
      nested.push({ path: `${parentPath}/comments/${c.id}`, kind: "comment", preview: (data.content || data.message || "").slice(0, 60) });
    }
    const repSnap = await db.collection(`${parentPath}/comments/${c.id}/replies`).get();
    for (const r of repSnap.docs) {
      const rdata = r.data();
      if (rdata.nickname === NICK) {
        nested.push({ path: `${parentPath}/comments/${c.id}/replies/${r.id}`, kind: "reply", preview: (rdata.content || "").slice(0, 60) });
      }
    }
  }
}

async function scanGuestbookTree(parentPath) {
  const gSnap = await db.collection(`${parentPath}/guestbook`).get();
  for (const g of gSnap.docs) {
    const data = g.data();
    if (data.nickname === NICK) {
      nested.push({ path: `${parentPath}/guestbook/${g.id}`, kind: "guestbook", preview: (data.message || "").slice(0, 60) });
    }
    const repSnap = await db.collection(`${parentPath}/guestbook/${g.id}/replies`).get();
    for (const r of repSnap.docs) {
      const rdata = r.data();
      if (rdata.nickname === NICK) {
        nested.push({ path: `${parentPath}/guestbook/${g.id}/replies/${r.id}`, kind: "guestbook-reply", preview: (rdata.message || "").slice(0, 60) });
      }
    }
  }
}

async function scanKeywords(parentPath) {
  const kSnap = await db.collection(`${parentPath}/keywords`).get();
  for (const k of kSnap.docs) {
    const data = k.data();
    if (data.authorNickname === NICK) {
      nested.push({ path: `${parentPath}/keywords/${k.id}`, kind: "keyword-on-other", preview: (data.text || "").slice(0, 60) });
    }
  }
}

// album/{x}/comments + replies
const allAlbum = await db.collection("album").get();
for (const a of allAlbum.docs) await scanCommentsTree(`album/${a.id}`);

// board/{x}/comments + replies
const allBoard = await db.collection("board").get();
for (const b of allBoard.docs) await scanCommentsTree(`board/${b.id}`);

// members/{x}/photos/{y}/comments + replies + members/{x}/guestbook + members/{x}/keywords
for (const m of allMembers.docs) {
  await scanGuestbookTree(`members/${m.id}`);
  await scanKeywords(`members/${m.id}`);
  const photoSnap = await db.collection(`members/${m.id}/photos`).get();
  for (const p of photoSnap.docs) await scanCommentsTree(`members/${m.id}/photos/${p.id}`);
}

// users/{nick}/keywords (others may have 버음바 written keywords on)
const allUsers = await db.collection("users").get();
for (const u of allUsers.docs) {
  if (u.id === NICK) continue;
  const ksnap = await db.collection(`users/${u.id}/keywords`).where("authorNickname", "==", NICK).get();
  ksnap.forEach((k) => {
    nested.push({ path: `users/${u.id}/keywords/${k.id}`, kind: "user-keyword", preview: ((k.data().text) || "").slice(0, 60) });
  });
}

// petGifts authored — others' subcollection
for (const u of allUsers.docs) {
  if (u.id === NICK) continue;
  const gsnap = await db.collection(`users/${u.id}/petGifts`).where("from", "==", NICK).get();
  gsnap.forEach((g) => {
    nested.push({ path: `users/${u.id}/petGifts/${g.id}`, kind: "petGift-sent", preview: g.data().itemId || "" });
  });
}

if (nested.length === 0) {
  console.log("(none)");
} else {
  console.log(`found ${nested.length} authored items in others' subcollections:`);
  for (const n of nested) console.log(`   [${n.kind}] ${n.path} — ${n.preview}`);
}

// ── 3. ADDRESSED ───────────────────────────────────────────────
console.log("\n── (3) addressed-to docs ──");
await countWhere("letters", "to", NICK, "letters (received)");
await countWhere("playgroundRequests", "to", NICK, "playgroundRequests (received)");

// ── 4. TITLE OWNERSHIP ─────────────────────────────────────────
console.log("\n── (4) titleWords ownership ──");
const titles = await db.collection("titleWords").where("owner", "==", NICK).get();
if (titles.size === 0) console.log("titleWords: (none)");
titles.forEach((d) => {
  const data = d.data();
  console.log(`   titleWords/${d.id}: word='${data.word}' type=${data.type} month=${data.purchasedMonth}`);
});

console.log("\n========== scan complete ==========\n");
process.exit(0);
