// Diagnostic: dump combat-type activity docs to verify migration applied.
// Reports total combat count, link-format distribution, and 5 most-recent
// docs (id / createdAt / link / message preview).
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

const snap = await db.collection("activity").where("type", "==", "combat").get();
console.log(`\ncombat docs total = ${snap.size}\n`);

const buckets = { withNick: 0, bareCombat: 0, other: 0, missing: 0 };
const samples = [];
for (const d of snap.docs) {
  const data = d.data();
  const link = data.link;
  if (!link) buckets.missing++;
  else if (link.includes("nick=")) buckets.withNick++;
  else if (link === "/combat") buckets.bareCombat++;
  else buckets.other++;
  samples.push({
    id: d.id,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
    link: link ?? "(none)",
    message: typeof data.message === "string" ? data.message.slice(0, 60) : "(none)",
    nickname: data.nickname ?? "(none)",
  });
}

console.log("link buckets:", buckets);

samples.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
console.log("\n10 most-recent combat docs:");
for (const s of samples.slice(0, 10)) {
  console.log(`  id=${s.id}  createdAt=${s.createdAt}`);
  console.log(`    link    = ${s.link}`);
  console.log(`    message = ${s.message}`);
  console.log(`    nickname= ${s.nickname}`);
}

console.log("\n5 oldest combat docs:");
for (const s of samples.slice(-5)) {
  console.log(`  id=${s.id}  createdAt=${s.createdAt}`);
  console.log(`    link    = ${s.link}`);
  console.log(`    message = ${s.message}`);
  console.log(`    nickname= ${s.nickname}`);
}

process.exit(0);
