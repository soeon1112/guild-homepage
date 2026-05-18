// check-adventure-links.mjs
//
// Read-only diagnostic tool: adventure docs link # 카운트 분석.
// 길드원 모험기록의 외부 링크 수를 집계해서 abnormal 패턴 식별.
// 재사용 가능 — 모험기록 진단 필요 시 노드로 실행.
//
// Usage: node scripts/check-adventure-links.mjs

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

const snap = await db.collection("activity").where("type", "==", "adventure").get();
console.log(`adventure docs total = ${snap.size}\n`);

const buckets = { single: 0, double: 0, none: 0, other: 0, missing: 0 };
const samples = [];
for (const d of snap.docs) {
  const data = d.data();
  const link = data.link;
  if (!link) buckets.missing++;
  else if (!link.includes("#")) buckets.none++;
  else {
    const hashCount = (link.match(/#/g) ?? []).length;
    if (hashCount === 1) buckets.single++;
    else if (hashCount >= 2) buckets.double++;
    else buckets.other++;
  }
  samples.push({
    id: d.id,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
    link: link ?? "(none)",
    nickname: data.nickname ?? "(none)",
  });
}

console.log("link buckets:", buckets);
samples.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
console.log("\n10 most-recent adventure docs:");
for (const s of samples.slice(0, 10)) {
  console.log(`  id=${s.id}  createdAt=${s.createdAt}`);
  console.log(`    link    = ${s.link}`);
  console.log(`    nickname= ${s.nickname}`);
}

console.log("\nALL doubles (if any):");
for (const s of samples) {
  if ((s.link.match(/#/g) ?? []).length >= 2) {
    console.log(`  id=${s.id}  link=${s.link}`);
  }
}
process.exit(0);
