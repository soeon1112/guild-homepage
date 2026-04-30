#!/usr/bin/env node
// scripts/reset-fishing-characters.mjs
//
// One-shot Firestore admin script — wipes the `character` field
// from every users/{nickname}/fishing/current doc. Other state
// (inventory, codex, exp, level, stamina, lastPosition, …) is
// preserved. Run manually after a customizer schema change or
// to force every player back through the creator screen on
// next entry.
//
// USAGE
//   cd ../guild-homepage
//   node scripts/reset-fishing-characters.mjs
//
// Optional flags:
//   --cred=/path/to/serviceAccount.json   override credentials path
//   --dry-run                              list affected users, no writes
//   --clear-earned-stars                   wipe `earnedStars` instead of
//                                          `character` (use after the
//                                          buggy seed shipped values
//                                          from totalStars and corrupted
//                                          the income-only counter).
//
// Requires firebase-admin. Install transiently if needed:
//   npm install --no-save firebase-admin
//
// Credentials resolution order:
//   1. --cred=<path> CLI arg
//   2. GOOGLE_APPLICATION_CREDENTIALS env var
//   3. ../dawnlight-app/dawnlight-guild-3181d3388f9f.json (sibling repo)
//   4. applicationDefault() — fallback (gcloud auth, GCE metadata, …)

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const credArg = args.find((a) => a.startsWith("--cred="));
const dryRun = args.includes("--dry-run");
const clearEarned = args.includes("--clear-earned-stars");

function resolveCredentials() {
  if (credArg) return credArg.slice("--cred=".length);
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  // Default — sibling dawnlight-app repo holds the service account
  // file used by the mobile app's admin tooling. Falls back to
  // applicationDefault() below if the file isn't present.
  const sibling = resolve(
    __dirname,
    "..",
    "..",
    "dawnlight-app",
    "dawnlight-guild-3181d3388f9f.json",
  );
  return existsSync(sibling) ? sibling : null;
}

const credPath = resolveCredentials();
let credential;
if (credPath) {
  try {
    const sa = JSON.parse(readFileSync(credPath, "utf8"));
    credential = cert(sa);
    console.log(`[reset] using service account: ${credPath}`);
  } catch (err) {
    console.error(
      `[reset] failed to load service account from ${credPath}:`,
      err.message,
    );
    console.error("[reset] falling back to application-default credentials");
    credential = applicationDefault();
  }
} else {
  console.log(
    "[reset] no service account file found; using application-default credentials",
  );
  credential = applicationDefault();
}

initializeApp({ credential });
const db = getFirestore();

async function main() {
  console.log(`[reset] mode: ${dryRun ? "DRY RUN" : "WRITE"}`);
  console.log("[reset] querying users collection...");
  const usersSnap = await db.collection("users").get();
  console.log(`[reset] found ${usersSnap.size} user docs`);

  let cleared = 0;
  let noFishingDoc = 0;
  let noCharacterField = 0;
  let errors = 0;
  const clearedNicknames = [];

  for (const userDoc of usersSnap.docs) {
    const nickname = userDoc.id;
    const fishingRef = userDoc.ref.collection("fishing").doc("current");
    try {
      const fishingSnap = await fishingRef.get();
      if (!fishingSnap.exists) {
        noFishingDoc++;
        continue;
      }
      const data = fishingSnap.data() || {};
      // Decide what update to apply based on flags. --clear-earned-stars
      // wipes the earnedStars field (leaves character intact); the
      // default mode wipes the character field.
      if (clearEarned) {
        if (typeof data.earnedStars !== "number") {
          noCharacterField++; // counter reused — "no field to clear"
          continue;
        }
        if (dryRun) {
          clearedNicknames.push(`${nickname}(earnedStars=${data.earnedStars})`);
          cleared++;
          continue;
        }
        await fishingRef.update({ earnedStars: FieldValue.delete() });
        cleared++;
        clearedNicknames.push(nickname);
        console.log(`[reset] cleared earnedStars for: ${nickname}`);
      } else {
        if (data.character == null) {
          noCharacterField++;
          continue;
        }
        if (dryRun) {
          clearedNicknames.push(nickname);
          cleared++;
          continue;
        }
        await fishingRef.update({ character: FieldValue.delete() });
        cleared++;
        clearedNicknames.push(nickname);
        console.log(`[reset] cleared character for: ${nickname}`);
      }
    } catch (err) {
      errors++;
      console.error(`[reset] failed for ${nickname}:`, err.message);
    }
  }

  console.log("\n[reset] SUMMARY");
  console.log(`  cleared:           ${cleared}`);
  console.log(`  no fishing doc:    ${noFishingDoc}`);
  console.log(`  no character field: ${noCharacterField}`);
  console.log(`  errors:            ${errors}`);
  if (dryRun && clearedNicknames.length > 0) {
    console.log(`\n[reset] would-clear users:\n  ${clearedNicknames.join(", ")}`);
  }
}

main().catch((err) => {
  console.error("[reset] fatal:", err);
  process.exit(1);
});
