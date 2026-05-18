#!/usr/bin/env node
// Wipe chat + fishing_chat collections (post-mass-quit cleanup 2026-05-10).
//
// Targets ONLY:
//   - chat/*                    (FloatingChat / GuildChat global chat)
//   - fishing_chat/*            (낚시 게임 채팅)
//   - chat/* doc.imageUrl → Storage chat/{filename}  (optional, see flags)
//
// PRESERVED (never touched):
//   - users / members / activity / letters / notice / board / album /
//     playgroundChat / playgroundPets / playgroundRequests / pets /
//     petChatLogs / characters / proposals / schedule /
//     guestbook(root) / exchangeRequests / fishing_players
//   - users/{nickname}.lastChatRead  (user explicit: leave alone)
//   - chat trigger functions (no onDelete trigger exists — safe; only
//     onCreate fan-out for push/mention, which is irrelevant for delete)
//
// Trigger analysis (functions/src):
//   - chat:           onChatMessageCreated (onCreate only, push fan-out)
//                     onChatMentioned     (onCreate only, mention dispatch)
//   - fishing_chat:   onFishingChatCreated (onCreate only, prune helper)
//   ⇒ DELETE operations fire ZERO triggers. Safe to bulk-delete.
//
// onSnapshot impact (clients):
//   - guild-homepage GuildChat: query(orderBy(createdAt,desc), limit(50))
//     → batched delete fires snap update repeatedly, active users see
//       messages disappearing. UX only, not functional.
//   - RN FloatingChat: similar listener pattern.
//   - mitigation: batch size 100 keeps each snap update digestible.
//
// Usage:
//   node scripts/wipe-chat.mjs                    # dry-run (no writes)
//   node scripts/wipe-chat.mjs --apply            # delete docs only (Storage left)
//   node scripts/wipe-chat.mjs --apply --storage  # also wipe Storage chat/*

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { existsSync, readFileSync, writeFileSync, mkdirSync, createWriteStream } from "node:fs";
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

const APPLY = process.argv.includes("--apply");
const STORAGE = process.argv.includes("--storage");

// Hardcoded — DO NOT add similar-named collections (chats / chatLogs / chat_history)
const COLLECTIONS = ["chat", "fishing_chat"];

const BATCH_DIR = resolve(__dirname, "..", "backups", "chat-wipe-2026-05-10");
const BATCH_SIZE = 100;

console.log(`\n========== chat wipe (post-mass-quit cleanup) ==========`);
console.log(APPLY ? "MODE: APPLY (will delete + backup)" : "MODE: dry-run (no writes)");
if (APPLY && STORAGE) console.log("STORAGE: also wipe Storage chat/* files");
else if (APPLY) console.log("STORAGE: kept (use --storage to also wipe)");
console.log(`backup dir: ${BATCH_DIR}`);
console.log(`target collections: [${COLLECTIONS.join(", ")}]`);
console.log(`batch size: ${BATCH_SIZE}\n`);

// ── safety gate: target list must be exactly these two
const FORBIDDEN_NEAR = ["chats", "chatLogs", "chat_history", "playgroundChat", "fishing_chats"];
for (const c of COLLECTIONS) {
  if (FORBIDDEN_NEAR.includes(c)) {
    console.error(`🛑 SAFETY: '${c}' is in forbidden-near list. Aborting.`);
    process.exit(2);
  }
}
console.log(`[gate] target collections allowed (no overlap with forbidden-near list): ✓\n`);

// ── stats per collection
async function diagnoseCollection(name) {
  const snap = await db.collection(name).get();
  const docs = snap.docs;
  let oldestMs = Infinity, newestMs = -Infinity, oldestId = null, newestId = null;
  let imageDocCount = 0;
  const imageUrls = [];
  for (const d of docs) {
    const data = d.data();
    const ts = data.createdAt;
    let ms = null;
    if (ts?.toMillis) ms = ts.toMillis();
    else if (typeof ts === "number") ms = ts;
    if (ms !== null) {
      if (ms < oldestMs) { oldestMs = ms; oldestId = d.id; }
      if (ms > newestMs) { newestMs = ms; newestId = d.id; }
    }
    if (typeof data.imageUrl === "string" && data.imageUrl) {
      imageDocCount++;
      imageUrls.push(data.imageUrl);
    }
  }
  return {
    name,
    docs,
    size: docs.length,
    oldestMs: oldestMs === Infinity ? null : oldestMs,
    newestMs: newestMs === -Infinity ? null : newestMs,
    oldestId,
    newestId,
    imageDocCount,
    imageUrls,
  };
}

function fmtTs(ms) {
  if (ms === null) return "(no timestamp)";
  return new Date(ms).toISOString();
}

// ── (A,B) diagnosis ────────────────────────────────────────────
console.log("(A,B) collection diagnosis:\n");
const colStats = [];
for (const name of COLLECTIONS) {
  const r = await diagnoseCollection(name);
  colStats.push(r);
  console.log(`  ${name}:`);
  console.log(`     total docs: ${r.size}`);
  console.log(`     oldest: ${fmtTs(r.oldestMs)}  (${r.oldestId ?? "—"})`);
  console.log(`     newest: ${fmtTs(r.newestMs)}  (${r.newestId ?? "—"})`);
  console.log(`     docs with imageUrl: ${r.imageDocCount}`);
}

// ── (C) Storage chat/* files ────────────────────────────────────
console.log("\n(C) Storage chat/* files (chat doc.imageUrl mapped):\n");
const [allChatFiles] = await bucket.getFiles({ prefix: "chat/" });
console.log(`  Storage chat/ total: ${allChatFiles.length} file(s)`);
let chatStorageBytes = 0;
for (const f of allChatFiles) chatStorageBytes += parseInt(f.metadata.size ?? "0", 10);
console.log(`  Storage chat/ size: ${(chatStorageBytes / 1024 / 1024).toFixed(2)} MB`);

// cross-check: doc.imageUrl that map back to chat/<filename>
const chatStats = colStats.find((s) => s.name === "chat");
const referencedFiles = new Set();
for (const url of chatStats?.imageUrls ?? []) {
  // imageUrl is a Storage download URL — extract path
  const m = url.match(/\/o\/([^?]+)\?/);
  if (m) {
    const decoded = decodeURIComponent(m[1]);
    referencedFiles.add(decoded);
  }
}
let referencedCount = 0;
for (const f of allChatFiles) {
  if (referencedFiles.has(f.name)) referencedCount++;
}
console.log(`  Storage chat/ files referenced by chat docs: ${referencedCount}`);
console.log(`  Storage chat/ files orphan (not referenced):  ${allChatFiles.length - referencedCount}`);

// fishing_chat: confirm zero Storage
const [fishingStorage] = await bucket.getFiles({ prefix: "fishing_chat/" });
console.log(`  Storage fishing_chat/ files: ${fishingStorage.length}  (expected 0)`);

// sample preview of referenced URLs
if (chatStats && chatStats.imageUrls.length > 0) {
  console.log(`\n  sample imageUrl (first 3):`);
  for (const u of chatStats.imageUrls.slice(0, 3)) {
    const short = u.length > 100 ? u.slice(0, 100) + "…" : u;
    console.log(`     ${short}`);
  }
}

// ── (D) trigger analysis (static) ──────────────────────────────
console.log("\n(D) Cloud Function triggers on chat / fishing_chat:\n");
console.log("  chat/*:        onChatMessageCreated (onCreate only)   — push fan-out");
console.log("                 onChatMentioned       (onCreate only)   — mention dispatch");
console.log("  fishing_chat/* onFishingChatCreated  (onCreate only)   — prune helper");
console.log("  onDelete / onUpdate: NONE");
console.log("  ⇒ DELETE operations fire ZERO triggers. No fan-out risk.");

// ── (E) onSnapshot listener impact ─────────────────────────────
console.log("\n(E) Client onSnapshot listeners:\n");
console.log("  guild-homepage GuildChat: query(orderBy(createdAt,desc),limit(50))");
console.log("  RN FloatingChat: similar");
console.log("  → batched delete fires repeated snap updates; active users see ");
console.log("    messages vanish in real-time. UX-only, not functional.");
console.log("  → batch size 100 keeps each update digestible.");

// ── per-collection backup preview ──────────────────────────────
console.log("\n(F) backup preview (per collection):\n");
for (const c of colStats) {
  console.log(`  backups/chat-wipe-2026-05-10/${c.name}/`);
  console.log(`     ├── {messageId}.json × ${c.size}`);
  if (c.name === "chat" && referencedCount > 0) {
    console.log(`     └── images/ (${referencedCount} Storage files, ${STORAGE ? "DEL" : "kept unless --storage"})`);
  }
}

// ── dry-run: stop here
if (!APPLY) {
  console.log("\n========== dry-run complete ==========");
  console.log("\nrun with --apply to delete docs (Storage kept)");
  console.log("run with --apply --storage to also delete Storage chat/* files");
  console.log();
  process.exit(0);
}

// ── APPLY MODE ─────────────────────────────────────────────────
console.log("\n========== APPLYING ==========\n");

let totalDeleted = 0;
let totalStorageDeleted = 0;
let totalStorageBytes = 0;

for (const c of colStats) {
  console.log(`\n── ${c.name} (${c.size} docs) ──`);
  const colBackupDir = resolve(BATCH_DIR, c.name);
  mkdirSync(colBackupDir, { recursive: true });

  // 1) backup all docs
  console.log(`  backing up ${c.size} docs → ${colBackupDir}`);
  for (const d of c.docs) {
    const data = d.data();
    // serializable form: convert Timestamps via toJSON-ish
    const safe = JSON.parse(JSON.stringify(data, (_k, v) => {
      if (v && typeof v === "object" && typeof v.toMillis === "function") {
        return { __ts__: v.toMillis() };
      }
      return v;
    }));
    writeFileSync(resolve(colBackupDir, `${d.id}.json`), JSON.stringify(safe, null, 2));
  }
  console.log(`  ✓ backup complete`);

  // 2) batched delete
  console.log(`  deleting in batches of ${BATCH_SIZE}…`);
  const docs = c.docs;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const d of chunk) batch.delete(d.ref);
    await batch.commit();
    totalDeleted += chunk.length;
    console.log(`     batch ${Math.floor(i / BATCH_SIZE) + 1}: deleted ${chunk.length} (cum ${totalDeleted})`);
  }
  console.log(`  ✓ ${c.name} wipe complete (${docs.length} docs)`);
}

// 3) Storage chat/* (optional)
if (STORAGE && referencedCount > 0) {
  console.log(`\n── Storage chat/* (${allChatFiles.length} files, ${(chatStorageBytes / 1024 / 1024).toFixed(2)} MB) ──`);
  const storageBackupDir = resolve(BATCH_DIR, "chat", "images");
  mkdirSync(storageBackupDir, { recursive: true });
  for (const f of allChatFiles) {
    const localName = f.name.split("/").pop();
    const localPath = resolve(storageBackupDir, localName);
    console.log(`  BACKUP ${f.name} → ${localPath}`);
    await new Promise((res, rej) => {
      f.createReadStream()
        .pipe(createWriteStream(localPath))
        .on("finish", res)
        .on("error", rej);
    });
    console.log(`  DEL    ${f.name}`);
    await f.delete();
    totalStorageDeleted++;
    totalStorageBytes += parseInt(f.metadata.size ?? "0", 10);
  }
  console.log(`  ✓ Storage wipe complete (${totalStorageDeleted} files, ${(totalStorageBytes / 1024 / 1024).toFixed(2)} MB)`);
} else if (STORAGE) {
  console.log(`\n── Storage chat/*: 0 files to delete ──`);
} else {
  console.log(`\n── Storage chat/*: kept (use --storage to also wipe) ──`);
}

console.log(
  `\n========== wipe complete ==========\n` +
    `Firestore: ${totalDeleted} docs deleted across ${COLLECTIONS.length} collections\n` +
    (STORAGE
      ? `Storage:   ${totalStorageDeleted} files (${(totalStorageBytes / 1024 / 1024).toFixed(2)} MB) deleted\n`
      : `Storage:   kept (${allChatFiles.length} files in chat/)\n`) +
    `Backups:   ${BATCH_DIR}\n`,
);
process.exit(0);
