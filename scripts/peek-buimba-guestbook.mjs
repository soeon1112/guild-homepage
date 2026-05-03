#!/usr/bin/env node
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

const snap = await db.collection("members/18/guestbook").get();
console.log(`members/18/guestbook: ${snap.size} entries\n`);
for (const d of snap.docs) {
  const data = d.data();
  const date = data.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 10) || "?";
  console.log(`[${date}] ${data.nickname || "(?)"} → "${(data.message || "").slice(0, 80)}"`);
  // any replies
  const reps = await db.collection(`members/18/guestbook/${d.id}/replies`).get();
  reps.forEach((r) => {
    const rd = r.data();
    const rdate = rd.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 10) || "?";
    console.log(`   ↳ [${rdate}] ${rd.nickname || "(?)"} → "${(rd.message || "").slice(0, 80)}"`);
  });
}
process.exit(0);
