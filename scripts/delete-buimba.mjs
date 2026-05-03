#!/usr/bin/env node
// One-shot guild-leave deletion for '버음바'.
//
// Approved deletion targets (per user decision 2026-05-03):
//   1. users/버음바  + subcollections (pointHistory, badges)
//   2. members/18    + subcollections (guestbook x5)
//   3. characters/lJgMBWGH9pxyC2cpwpli + history (1)
//   4. activity/9z0oyif9BvI9QvuykHBa
//
// stale stat fields on other users (guestbookTargets / visited
// Minihomepages) are intentionally LEFT untouched per user decision.
//
//   node scripts/delete-buimba.mjs           # dry run
//   node scripts/delete-buimba.mjs --apply   # actually delete
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const sibling = resolve(__dirname, "..", "..", "dawnlight-app", "dawnlight-guild-3181d3388f9f.json");
const credential = existsSync(sibling) ? cert(JSON.parse(readFileSync(sibling, "utf8"))) : applicationDefault();
initializeApp({ credential });
const db = getFirestore();

const APPLY = process.argv.includes("--apply");
const NICK = "버음바";
const BACKUP_DIR = resolve(__dirname, "..", "backups", `buimba-${new Date().toISOString().slice(0, 10)}`);

console.log(`\n=== guild-leave: '${NICK}' ===`);
console.log(APPLY ? "MODE: APPLY (will delete)" : "MODE: dry-run (no writes)");
console.log(`backup dir: ${BACKUP_DIR}`);
console.log();

let totalDocs = 0;

async function dumpDocAndSubs(path, captured = {}) {
  const ref = db.doc(path);
  const snap = await ref.get();
  if (snap.exists) {
    captured[path] = snap.data();
  }
  // Recursively walk subcollections
  const subs = await ref.listCollections();
  for (const sub of subs) {
    const colSnap = await sub.get();
    for (const child of colSnap.docs) {
      await dumpDocAndSubs(`${path}/${sub.id}/${child.id}`, captured);
    }
  }
  return captured;
}

async function deletePathRecursive(path, kind = "doc") {
  totalDocs++;
  // Backup
  const captured = await dumpDocAndSubs(path);
  const docCount = Object.keys(captured).length;
  console.log(`  ${APPLY ? "DEL" : "would-del"} [${kind}] ${path} (${docCount} doc${docCount === 1 ? "" : "s"} including subs)`);
  if (APPLY) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const fname = path.replace(/\//g, "__") + ".json";
    writeFileSync(resolve(BACKUP_DIR, fname), JSON.stringify(captured, null, 2));
    await db.recursiveDelete(db.doc(path));
  }
}

// 1. users/버음바 (recursiveDelete handles all subcollections)
console.log("(1) users/버음바 + subcollections");
await deletePathRecursive(`users/${NICK}`, "user-root");

// 2. members/18 (the slot doc, recursiveDelete cascades guestbook etc.)
console.log("\n(2) members/18 + subcollections");
await deletePathRecursive("members/18", "member-slot");

// 3. characters/lJgMBWGH9pxyC2cpwpli + history
console.log("\n(3) characters/lJgMBWGH9pxyC2cpwpli + history");
await deletePathRecursive("characters/lJgMBWGH9pxyC2cpwpli", "character");

// 4. activity/9z0oyif9BvI9QvuykHBa
console.log("\n(4) activity/9z0oyif9BvI9QvuykHBa");
await deletePathRecursive("activity/9z0oyif9BvI9QvuykHBa", "activity");

console.log(`\n=== ${APPLY ? "deleted" : "would delete"} ${totalDocs} root path(s) (subcollections cascaded) ===`);
if (!APPLY) console.log("\nrun with --apply to actually delete\n");
process.exit(0);
