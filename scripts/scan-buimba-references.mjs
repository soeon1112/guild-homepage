#!/usr/bin/env node
// Side-effect scan: where does '버음바' appear in OTHER users' /
// members' / posts' data as a referenced value? Looking for:
//   - album.people array-contains
//   - members/{x}/photos.people array-contains
//   - users/*.guestbookTargets array-contains
//   - users/*.visitedMinihomepages array-contains
//   - members/*.statusMessage / mood mentioning 버음바 (text scan)
//
// These are NOT deletion targets — they're stats/refs on OTHER members'
// docs that may need to know 버음바 is gone.
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const sibling = resolve(__dirname, "..", "..", "dawnlight-app", "dawnlight-guild-3181d3388f9f.json");
const credential = existsSync(sibling) ? cert(JSON.parse(readFileSync(sibling, "utf8"))) : applicationDefault();
initializeApp({ credential });
const db = getFirestore();

const NICK = "버음바";

console.log(`\n=== SIDE-EFFECT scan: where does '${NICK}' appear in others' data? ===\n`);

// 1. album.people
console.log("-- album posts that tag 버음바 --");
const albumTags = await db.collection("album").where("people", "array-contains", NICK).get();
if (albumTags.size === 0) console.log("  (none)");
albumTags.forEach((d) => {
  const data = d.data();
  console.log(`  album/${d.id}: photographer=${data.photographer}, people=${JSON.stringify(data.people)}, caption='${(data.caption || "").slice(0, 50)}'`);
});

// 2. members/{x}/photos.people — collectionGroup of photos
console.log("\n-- mini-hompi photos that tag 버음바 (manual walk) --");
const allMembers = await db.collection("members").get();
let photoTagCount = 0;
for (const m of allMembers.docs) {
  const photos = await db.collection(`members/${m.id}/photos`).get();
  for (const p of photos.docs) {
    const data = p.data();
    if (Array.isArray(data.people) && data.people.includes(NICK)) {
      photoTagCount++;
      console.log(`  members/${m.id}/photos/${p.id}: people=${JSON.stringify(data.people)}, caption='${(data.caption || "").slice(0, 50)}'`);
    }
  }
}
if (photoTagCount === 0) console.log("  (none)");

// 3. users/*.guestbookTargets array-contains 버음바
console.log("\n-- users with 버음바 in their guestbookTargets list --");
const allUsers = await db.collection("users").get();
let gtHits = [];
allUsers.forEach((u) => {
  if (u.id === NICK) return;
  const data = u.data();
  if (Array.isArray(data.guestbookTargets) && data.guestbookTargets.includes(NICK)) {
    gtHits.push(u.id);
  }
});
if (gtHits.length === 0) console.log("  (none)");
else console.log(`  ${gtHits.join(", ")}`);

// 4. visitedMinihomepages
console.log("\n-- users who visited 버음바's mini-hompi --");
let vmHits = [];
allUsers.forEach((u) => {
  if (u.id === NICK) return;
  const data = u.data();
  if (Array.isArray(data.visitedMinihomepages) && data.visitedMinihomepages.includes(NICK)) {
    vmHits.push(u.id);
  }
});
if (vmHits.length === 0) console.log("  (none)");
else console.log(`  ${vmHits.join(", ")}`);

// 5. members/*.statusMessage or .bio mentioning '버음바' as text
console.log("\n-- member docs whose statusMessage/bio/mood mentions 버음바 --");
let textHits = 0;
allMembers.forEach((m) => {
  const data = m.data();
  for (const f of ["statusMessage", "mood", "bio"]) {
    const v = data[f];
    if (typeof v === "string" && v.includes(NICK)) {
      console.log(`  members/${m.id}.${f}: '${v}'`);
      textHits++;
    }
  }
});
if (textHits === 0) console.log("  (none)");

// 6. board posts content/title scanning
console.log("\n-- board posts mentioning '버음바' in title/content --");
const boardAll = await db.collection("board").get();
let boardHits = 0;
boardAll.forEach((d) => {
  const data = d.data();
  if ((data.title || "").includes(NICK) || (data.content || "").includes(NICK)) {
    console.log(`  board/${d.id}: title='${data.title}' nickname=${data.nickname}`);
    boardHits++;
  }
});
if (boardHits === 0) console.log("  (none)");

// 7. notice — admin notices may mention member by name
console.log("\n-- notice posts mentioning '버음바' --");
const noticeAll = await db.collection("notice").get();
let noticeHits = 0;
noticeAll.forEach((d) => {
  const data = d.data();
  if ((data.title || "").includes(NICK) || (data.content || "").includes(NICK)) {
    console.log(`  notice/${d.id}: title='${data.title}'`);
    noticeHits++;
  }
});
if (noticeHits === 0) console.log("  (none)");

// 8. chat messages mentioning 버음바
console.log("\n-- chat messages mentioning '버음바' (text) --");
const chatAll = await db.collection("chat").get();
let chatHits = 0;
chatAll.forEach((d) => {
  const data = d.data();
  if ((data.message || "").includes(NICK)) {
    chatHits++;
  }
});
console.log(`  ${chatHits} message(s) mention '${NICK}' in chat (kept as-is)`);

console.log("\n=== side-effect scan done ===\n");
process.exit(0);
