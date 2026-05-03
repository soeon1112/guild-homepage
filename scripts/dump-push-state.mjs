#!/usr/bin/env node
// Dump push-related fields for a nickname AND verify how the recipients
// query sees them. Used to diagnose double-push: are 2 tokens stored?
// Are there 2 user docs that resolve to the same nickname? etc.
//
//   node scripts/dump-push-state.mjs 언쏘
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

const NICK = process.argv[2] || "언쏘";

console.log(`\n=== push state for '${NICK}' ===\n`);

// Direct doc
const u = await db.doc(`users/${NICK}`).get();
console.log(`users/${NICK} exists: ${u.exists}`);
if (u.exists) {
  const d = u.data();
  console.log("  pushToken:", d.pushToken ? d.pushToken.slice(0, 40) + "..." : "(none)");
  console.log("  pushTokenUpdatedAt:", d.pushTokenUpdatedAt?.toDate?.()?.toISOString?.() ?? d.pushTokenUpdatedAt ?? "(none)");
  console.log("  pushTokenClearedAt:", d.pushTokenClearedAt?.toDate?.()?.toISOString?.() ?? d.pushTokenClearedAt ?? "(none)");
  console.log("  notificationSettings:", JSON.stringify(d.notificationSettings ?? "(none)"));
}

// Are there OTHER user docs whose nickname FIELD == NICK (legacy / duplicates)?
console.log("\n-- scanning users/* for any doc whose nickname FIELD == nickname --");
const all = await db.collection("users").get();
let nicknameFieldHits = 0;
all.forEach((d) => {
  const data = d.data();
  if (data.nickname === NICK && d.id !== NICK) {
    nicknameFieldHits++;
    console.log(`  FOUND: users/${d.id} has nickname field = '${NICK}' (NFC=${(d.id || "").normalize("NFC") === NICK})`);
    console.log(`    pushToken: ${data.pushToken ? data.pushToken.slice(0, 40) + "..." : "(none)"}`);
  }
});
if (nicknameFieldHits === 0) console.log("  (none)");

// Are there NFC/NFD variants of the doc id?
console.log("\n-- NFC/NFD variants --");
const nfc = NICK.normalize("NFC");
const nfd = NICK.normalize("NFD");
console.log(`  nickname raw: '${NICK}' bytes=${[...NICK].map((c) => c.codePointAt(0).toString(16)).join(",")}`);
console.log(`  NFC '${nfc}' bytes=${[...nfc].map((c) => c.codePointAt(0).toString(16)).join(",")}`);
console.log(`  NFD '${nfd}' bytes=${[...nfd].map((c) => c.codePointAt(0).toString(16)).join(",")}`);
console.log(`  raw==NFC: ${NICK === nfc}, raw==NFD: ${NICK === nfd}`);
if (NICK !== nfc) {
  const altNfc = await db.doc(`users/${nfc}`).get();
  console.log(`  users/${nfc} exists: ${altNfc.exists}`);
}
if (NICK !== nfd) {
  const altNfd = await db.doc(`users/${nfd}`).get();
  console.log(`  users/${nfd} exists: ${altNfd.exists}`);
}

// What does the recipients query return?
console.log("\n-- recipients query: where('pushToken','!=',null) --");
const tokenSnap = await db.collection("users").where("pushToken", "!=", null).get();
console.log(`  total candidates: ${tokenSnap.size}`);
const tokenCounts = new Map();
tokenSnap.forEach((d) => {
  const data = d.data();
  const t = data.pushToken;
  if (typeof t !== "string" || !t) return;
  const list = tokenCounts.get(t) || [];
  list.push(d.id);
  tokenCounts.set(t, list);
});
console.log("\n-- duplicate tokens (same token shared by multiple users) --");
let dups = 0;
for (const [token, users] of tokenCounts) {
  if (users.length > 1) {
    dups++;
    console.log(`  token ${token.slice(0, 40)}... shared by ${users.length} users: ${users.join(", ")}`);
  }
}
if (dups === 0) console.log("  (none)");

// Are any users in tokenSnap visible twice? (Should never happen unless schema weird)
console.log("\n-- duplicate user docs in candidates --");
const seenUsers = new Map();
tokenSnap.forEach((d) => {
  seenUsers.set(d.id, (seenUsers.get(d.id) || 0) + 1);
});
let dupUsers = 0;
for (const [id, count] of seenUsers) {
  if (count > 1) {
    dupUsers++;
    console.log(`  ${id} appears ${count} times`);
  }
}
if (dupUsers === 0) console.log("  (none)");

// Also check whether NICK appears in that recipient list
const inList = tokenSnap.docs.find((d) => d.id === NICK);
console.log(`\n  '${NICK}' present in recipient query result: ${!!inList}`);

console.log("\n=== done ===\n");
process.exit(0);
