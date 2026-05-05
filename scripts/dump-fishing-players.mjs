#!/usr/bin/env node
// Quick dump of fishing_players docs — focus on character.rodType to
// diagnose why peer bobbers all show the same colour. Read-only.
//
// USAGE: node scripts/dump-fishing-players.mjs
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sibling = resolve(
  __dirname,
  "..",
  "..",
  "dawnlight-app",
  "dawnlight-guild-3181d3388f9f.json",
);
const credential = existsSync(sibling)
  ? cert(JSON.parse(readFileSync(sibling, "utf8")))
  : applicationDefault();
initializeApp({ credential });
const db = getFirestore();

const presence = await db.collection("fishing_players").get();
console.log(`fishing_players: ${presence.size} docs\n`);
for (const d of presence.docs) {
  const data = d.data();
  const char = data.character;
  const rodType = char && typeof char === "object" ? char.rodType : "(no character)";
  const charKeys = char && typeof char === "object" ? Object.keys(char).join(",") : "-";
  console.log(`  ${d.id}: rodType=${JSON.stringify(rodType)} | keys=[${charKeys}] | isFishing=${data.isFishing}`);
}

console.log("\nusers/*/fishing/current.character:");
const users = await db.collection("users").get();
for (const u of users.docs) {
  const fc = await u.ref.collection("fishing").doc("current").get();
  if (!fc.exists) continue;
  const char = fc.data()?.character;
  if (!char) continue;
  const rodType = typeof char === "object" ? char.rodType : "(not-object)";
  console.log(`  ${u.id}: rodType=${JSON.stringify(rodType)}`);
}
