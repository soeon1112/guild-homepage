#!/usr/bin/env node
// One-shot diagnostic: dump the most recent activity docs (default type=notice)
// to verify what message string is actually stored in Firestore. Used to
// distinguish "client wrote old format" vs "client wrote new format but UI
// shows wrong" vs "user saw an old doc that pre-dates the format change".
//
//   node scripts/dump-recent-notice-activity.mjs            # 5 most recent type=notice
//   node scripts/dump-recent-notice-activity.mjs board 10   # 10 most recent type=board
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

const TYPE = process.argv[2] || "notice";
const LIMIT = Number(process.argv[3] || "5");

// Composite index (type + createdAt) doesn't exist on the prod project,
// so just paginate the orderBy-only query and filter type client-side.
const snap = await db
  .collection("activity")
  .orderBy("createdAt", "desc")
  .limit(200)
  .get();

const matches = snap.docs.filter((d) => d.data().type === TYPE).slice(0, LIMIT);
console.log(`\n=== ${matches.length} most recent activity[type=${TYPE}] (scanned ${snap.size}) ===\n`);
for (const d of matches) {
  const data = d.data();
  const ts = data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? "(none)";
  console.log(`id: ${d.id}`);
  console.log(`  createdAt: ${ts}`);
  console.log(`  nickname:  ${JSON.stringify(data.nickname)}`);
  console.log(`  message:   ${JSON.stringify(data.message)}`);
  console.log(`  link:      ${JSON.stringify(data.link)}`);
  console.log("");
}
process.exit(0);
