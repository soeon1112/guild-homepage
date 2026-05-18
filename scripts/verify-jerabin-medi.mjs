#!/usr/bin/env node
// Post-apply automated verification for jerabin-medi-2026-05-18 (2명 길탈).
// Run: node scripts/verify-jerabin-medi.mjs

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = resolve(
  __dirname, "..", "..", "dawnlight-app", "dawnlight-guild-3181d3388f9f.json",
);
const sa = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
initializeApp({
  credential: existsSync(serviceAccountPath) ? cert(sa) : applicationDefault(),
  storageBucket: `${sa.project_id}.firebasestorage.app`,
});
const db = getFirestore();
const bucket = getStorage().bucket();

const DELETED = [
  { nickname: "제라빈", slot: "7" },
  { nickname: "메디퀸", slot: "6" },
];

const PRESERVE = [
  "Annakiria", "Hoddang", "남손검", "딩굴", "뭉신냥아치",
  "언쏘", "은매", "자카니", "아라비온", "테스트",
];

const PET_TRACE_MEDI_EXPECTED = 10; // dry-run 결과

let pass = 0, fail = 0;
function ok(label) { console.log(`  ✓ ${label}`); pass++; }
function ng(label) { console.log(`  ✗ ${label}`); fail++; }

// ── 1. users 2명 삭제 확인 ────────────────────────────────────
console.log("\n[1/6] users/* — 2명 삭제 확인");
for (const t of DELETED) {
  const snap = await db.doc(`users/${t.nickname}`).get();
  if (!snap.exists) ok(`users/${t.nickname}: gone`);
  else ng(`users/${t.nickname}: STILL EXISTS`);
}

// ── 2. members/{slot} 2개 삭제 확인 ────────────────────────────
console.log("\n[2/6] members/{slot} — 2개 삭제 확인");
for (const t of DELETED) {
  const snap = await db.doc(`members/${t.slot}`).get();
  if (!snap.exists) ok(`members/${t.slot} (${t.nickname}): gone`);
  else ng(`members/${t.slot} (${t.nickname}): STILL EXISTS`);
}

// ── 3. characters/letters/activity/guestbook/album 정리 확인 ──
console.log("\n[3/6] characters / letters / activity / guestbook / album");
for (const t of DELETED) {
  const c = await db.collection("characters").where("owner", "==", t.nickname).get();
  const lf = await db.collection("letters").where("from", "==", t.nickname).get();
  const lt = await db.collection("letters").where("to", "==", t.nickname).get();
  const a = await db.collection("activity").where("nickname", "==", t.nickname).get();
  const g = await db.collection("guestbook").where("nickname", "==", t.nickname).get();
  const al = await db.collection("album").where("photographer", "==", t.nickname).get();
  const sum = c.size + lf.size + lt.size + a.size + g.size + al.size;
  if (sum === 0) ok(`${t.nickname}: all collections clean (c=0 lF=0 lT=0 act=0 gb=0 alb=0)`);
  else ng(`${t.nickname}: residue c=${c.size} lF=${lf.size} lT=${lt.size} act=${a.size} gb=${g.size} alb=${al.size}`);
}

// ── 4. Storage members/{slot}/* 0건 ──────────────────────────
console.log("\n[4/6] Storage members/{slot}/* — 2개 폴더 비어있음");
for (const t of DELETED) {
  const [files] = await bucket.getFiles({ prefix: `members/${t.slot}/` });
  if (files.length === 0) ok(`Storage members/${t.slot}/: empty`);
  else ng(`Storage members/${t.slot}/: ${files.length} files remain`);
}

// ── 5. preserve 10명 데이터 무변동 (존재 확인) ─────────────────
console.log("\n[5/6] preserve 10명 users doc 존재 (배지/별빛 보존)");
for (const p of PRESERVE) {
  const snap = await db.doc(`users/${p}`).get();
  if (snap.exists) ok(`users/${p}: alive`);
  else ng(`users/${p}: GONE (예상치 못한 손상)`);
}

// ── 6. 펫 컬렉션 보존 (메디퀸 흔적) ────────────────────────────
console.log("\n[6/6] 펫 컬렉션 보존 (메디퀸 흔적, dry-run 10건 기준)");
let mediTraces = 0;
const ppMedi = await db.doc("playgroundPets/메디퀸").get();
if (ppMedi.exists) mediTraces++;
const pcMedi = await db.doc("petChatLogs/메디퀸").get();
if (pcMedi.exists) {
  mediTraces++;
  const subs = await pcMedi.ref.listCollections();
  for (const s of subs) {
    const sn = await s.get();
    mediTraces += sn.size;
  }
}
const prFromMedi = await db.collection("playgroundRequests").where("from", "==", "메디퀸").get();
const prToMedi = await db.collection("playgroundRequests").where("to", "==", "메디퀸").get();
const pgChatMedi = await db.collection("playgroundChat").where("nickname", "==", "메디퀸").get();
mediTraces += prFromMedi.size + prToMedi.size + pgChatMedi.size;
if (mediTraces === PET_TRACE_MEDI_EXPECTED) ok(`메디퀸 펫 흔적 ${mediTraces}건 (dry-run ${PET_TRACE_MEDI_EXPECTED}와 일치)`);
else if (mediTraces >= PET_TRACE_MEDI_EXPECTED) ok(`메디퀸 펫 흔적 ${mediTraces}건 (dry-run ${PET_TRACE_MEDI_EXPECTED} 이상 — playgroundChat 증분 가능)`);
else ng(`메디퀸 펫 흔적 ${mediTraces}건 (dry-run ${PET_TRACE_MEDI_EXPECTED} 미만 — 손실 가능)`);

console.log(`\n=== 결과: pass=${pass} fail=${fail} ===`);
process.exit(fail > 0 ? 1 : 0);
