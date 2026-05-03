#!/usr/bin/env node
// One-shot scrub for stale Expo push tokens that two user docs share.
// Backs up the affected docs first, then keeps the doc with the most
// recent `pushTokenUpdatedAt` and clears the token from the others.
//
// Same dedupe policy as functions/src/lib/recipients.ts so the scrub
// matches the runtime behaviour.
//
//   node scripts/scrub-stale-push-tokens.mjs           # dry run
//   node scripts/scrub-stale-push-tokens.mjs --apply   # actually scrub
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const sibling = resolve(__dirname, "..", "..", "dawnlight-app", "dawnlight-guild-3181d3388f9f.json");
const credential = existsSync(sibling) ? cert(JSON.parse(readFileSync(sibling, "utf8"))) : applicationDefault();
initializeApp({ credential });
const db = getFirestore();

const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = resolve(__dirname, "..", "backups", `stale-push-${new Date().toISOString().slice(0, 10)}`);

console.log(`\n=== scrub stale push tokens ===`);
console.log(APPLY ? "MODE: APPLY (will write)" : "MODE: dry-run (no writes)");
console.log();

const snap = await db.collection("users").where("pushToken", "!=", null).get();
console.log(`scanning ${snap.size} users with pushToken set\n`);

// Group docs by pushToken value
const byToken = new Map();
for (const d of snap.docs) {
  const data = d.data();
  const t = data.pushToken;
  if (typeof t !== "string" || !t) continue;
  const list = byToken.get(t) || [];
  list.push({
    id: d.id,
    updatedAt: data.pushTokenUpdatedAt?.toMillis?.() ?? 0,
    updatedAtIso: data.pushTokenUpdatedAt?.toDate?.()?.toISOString?.() ?? "(none)",
    data,
  });
  byToken.set(t, list);
}

let toScrub = [];
let groupCount = 0;
for (const [token, list] of byToken) {
  if (list.length < 2) continue;
  groupCount++;
  // Keep the doc with the most recent pushTokenUpdatedAt; tie-break by id (matches recipients.ts).
  list.sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
    return a.id.localeCompare(b.id, "ko");
  });
  const keeper = list[0];
  const losers = list.slice(1);
  console.log(`token ${token.slice(0, 40)}... shared by ${list.length}:`);
  console.log(`  KEEP   ${keeper.id} (updated ${keeper.updatedAtIso})`);
  for (const l of losers) {
    console.log(`  SCRUB  ${l.id} (updated ${l.updatedAtIso})`);
    toScrub.push({ id: l.id, data: l.data });
  }
}

if (groupCount === 0) {
  console.log("✓ no shared tokens — nothing to scrub.");
  process.exit(0);
}

console.log(`\nwill scrub ${toScrub.length} doc(s)`);

if (!APPLY) {
  console.log("\nrun with --apply to actually write");
  process.exit(0);
}

// Backup before write
mkdirSync(BACKUP_DIR, { recursive: true });
for (const item of toScrub) {
  const fname = `users__${item.id}.json`;
  writeFileSync(resolve(BACKUP_DIR, fname), JSON.stringify(item.data, null, 2));
}
console.log(`backup: ${BACKUP_DIR}`);

// Apply scrub: clear pushToken + record clearedAt + reason
const batch = db.batch();
for (const item of toScrub) {
  batch.update(db.collection("users").doc(item.id), {
    pushToken: null,
    pushTokenClearedAt: new Date(),
    pushTokenClearedReason: "duplicate-token-scrub",
  });
}
await batch.commit();
console.log(`✓ scrubbed ${toScrub.length} doc(s)`);
process.exit(0);
