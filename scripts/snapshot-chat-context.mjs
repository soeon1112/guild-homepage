#!/usr/bin/env node
// Read-only snapshot of state surrounding wipe-chat — captures pre-state so
// we can verify the wipe didn't touch anything outside chat/fishing_chat.
//
// Usage:
//   node scripts/snapshot-chat-context.mjs > /tmp/pre.json
//   (then later: ... > /tmp/post.json ; diff)
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(
  resolve(__dirname, "..", "..", "dawnlight-app", "dawnlight-guild-3181d3388f9f.json"),
  "utf8",
));
initializeApp({ credential: cert(sa), storageBucket: `${sa.project_id}.firebasestorage.app` });
const db = getFirestore();
const bucket = getStorage().bucket();

const PRESERVE = [
  "Annakiria", "Hoddang", "남손검", "딩굴", "메디퀸", "뭉신냥아치",
  "언쏘", "은매", "자카니", "제라빈", "아라비온", "테스트",
];

const OTHER_COLLECTIONS = [
  "users", "members", "activity", "letters", "notice", "board", "album",
  "playgroundChat", "playgroundPets", "playgroundRequests", "petChatLogs",
  "characters", "proposals", "schedule", "guestbook",
  "exchangeRequests", "fishing_players",
];

const out = { collections: {}, lastChatRead: {}, storage: {} };

for (const name of OTHER_COLLECTIONS) {
  const s = await db.collection(name).get();
  out.collections[name] = s.size;
}

for (const nick of PRESERVE) {
  const s = await db.doc(`users/${nick}`).get();
  if (s.exists) {
    const d = s.data();
    out.lastChatRead[nick] = d.lastChatRead?.toMillis?.() ?? d.lastChatRead ?? null;
  } else {
    out.lastChatRead[nick] = "(no user doc)";
  }
}

// also capture chat/fishing_chat sizes for completeness
out.collections.chat = (await db.collection("chat").get()).size;
out.collections.fishing_chat = (await db.collection("fishing_chat").get()).size;

// Storage tallies for affected prefixes
const [chatFiles] = await bucket.getFiles({ prefix: "chat/" });
const [fishingFiles] = await bucket.getFiles({ prefix: "fishing_chat/" });
out.storage["chat/"] = chatFiles.length;
out.storage["fishing_chat/"] = fishingFiles.length;

// Storage NOT touched (sanity: album / board / members storage tallies)
const [albumFiles] = await bucket.getFiles({ prefix: "album/" });
const [boardFiles] = await bucket.getFiles({ prefix: "board/" });
out.storage["album/"] = albumFiles.length;
out.storage["board/"] = boardFiles.length;

console.log(JSON.stringify(out, null, 2));
process.exit(0);
