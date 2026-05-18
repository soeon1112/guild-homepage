#!/usr/bin/env node
// Post-apply automated verification for mass-quit-2026-05-10 (12 members).
// Run: node scripts/verify-purge.mjs
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

const DELETED_12 = [
  { nickname: "녹차라떼", slot: "5" },
  { nickname: "잔바람", slot: "17-1" },
  { nickname: "햇빛한줌", slot: "21" },
  { nickname: "왓따도", slot: "14-1" },
  { nickname: "꾹뽀뽀", slot: "1-2" },
  { nickname: "권쏠든", slot: "2" },
  { nickname: "미르감", slot: "9" },
  { nickname: "소색", slot: "12" },
  { nickname: "헤비스커스", slot: "22" },
  { nickname: "검성", slot: "1" },
  { nickname: "육월야", slot: "15" },
  { nickname: "쿵임", slot: "20" },
];

const PRESERVE = [
  "Annakiria", "Hoddang", "남손검", "딩굴", "메디퀸", "뭉신냥아치",
  "언쏘", "은매", "자카니", "제라빈", "아라비온", "테스트",
];

let pass = 0, fail = 0;
function ok(label) { console.log(`  ✓ ${label}`); pass++; }
function ng(label) { console.log(`  ✗ ${label}`); fail++; }

// ── Check 1: 12 users gone ────────────────────────────────────
console.log("\n[1/5] users/* — deleted 12 names should be gone");
for (const t of DELETED_12) {
  const snap = await db.doc(`users/${t.nickname}`).get();
  if (!snap.exists) ok(`users/${t.nickname}: gone`);
  else ng(`users/${t.nickname}: STILL EXISTS`);
}

// ── Check 2: 12 member slots gone ─────────────────────────────
console.log("\n[2/5] members/{slot} — deleted 12 slots should be gone");
for (const t of DELETED_12) {
  const snap = await db.doc(`members/${t.slot}`).get();
  if (!snap.exists) ok(`members/${t.slot} (${t.nickname}): gone`);
  else ng(`members/${t.slot} (${t.nickname}): STILL EXISTS`);
}

// ── Check 3: letters count unchanged ──────────────────────────
console.log("\n[3/5] letters — preserve totals");
const allLetters = await db.collection("letters").get();
console.log(`     letters total: ${allLetters.size}`);
// preserved-letters-by-target (from earlier dry-run: 녹차라떼=1, bulk=68 → total 69 expected)
let lettersByDeletedTarget = 0;
for (const t of DELETED_12) {
  const a = await db.collection("letters").where("to", "==", t.nickname).get();
  const b = await db.collection("letters").where("from", "==", t.nickname).get();
  lettersByDeletedTarget += a.size + b.size;
}
console.log(`     letters touching deleted targets (kept): ${lettersByDeletedTarget}`);
if (lettersByDeletedTarget >= 68) ok(`letters preserved (>=68 expected from dry-run + 녹차라떼 1)`);
else ng(`letters preserved = ${lettersByDeletedTarget}, expected ~69`);

// ── Check 4: users count = 13 (12 preserve + 기타 placeholder) ─
console.log("\n[4/5] users count — should be 13 (12 preserve + 기타)");
const allUsers = await db.collection("users").get();
console.log(`     users total: ${allUsers.size}`);
const userIds = allUsers.docs.map((d) => d.id).sort((a, b) => a.localeCompare(b, "ko"));
console.log(`     ids: ${userIds.join(", ")}`);
if (allUsers.size === 13) ok(`users count = 13`);
else ng(`users count = ${allUsers.size}, expected 13`);
// also check each preserve exists, 기타 placeholder exists
for (const p of PRESERVE) {
  const snap = await db.doc(`users/${p}`).get();
  if (snap.exists) ok(`users/${p}: still here`);
  else ng(`users/${p}: MISSING (should be preserved)`);
}
const etcSnap = await db.doc(`users/기타`).get();
if (etcSnap.exists) ok(`users/기타 placeholder: still here`);
else ng(`users/기타 placeholder: MISSING`);

// ── Bonus: members count + remaining slots ─────────────────────
console.log("\n[bonus] members collection state");
const allMembers = await db.collection("members").get();
console.log(`     members total: ${allMembers.size}`);
for (const d of allMembers.docs) {
  console.log(`        members/${d.id}: nickname='${d.data().nickname}'`);
}

// ── Bonus: Storage members/{deleted slot}/* = 0 files ─────────
console.log("\n[bonus] Storage members/{deleted slot}/* — should all be 0 files");
for (const t of DELETED_12) {
  const [files] = await bucket.getFiles({ prefix: `members/${t.slot}/` });
  if (files.length === 0) ok(`Storage members/${t.slot}/: 0 files`);
  else ng(`Storage members/${t.slot}/: ${files.length} files REMAIN`);
}

console.log(`\n========== verification: ${pass} pass / ${fail} fail ==========\n`);
process.exit(fail > 0 ? 1 : 0);
