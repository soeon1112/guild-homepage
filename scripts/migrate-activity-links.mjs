#!/usr/bin/env node
// One-shot link migration: back-fill the new deep-link formats introduced
// in Phase 1 onto pre-existing activity docs.
//
//   adventure  →  link gets `#minihome-adventure`
//   guestbook  →  link gets `#minihome-guestbook`
//   combat     →  link becomes `/combat?nick=${owner}` (nickname extracted
//                  from message via /^([^\s'"]+?)님/, falls back to
//                  activity.nickname)
//
// Other types are left alone — Phase 1 didn't touch their link format.
//
// Usage:
//   node scripts/migrate-activity-links.mjs --dry-run
//   node scripts/migrate-activity-links.mjs --apply
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

const APPLY = process.argv.includes("--apply");
const DRY = !APPLY;

// ── per-type link rewriter ────────────────────────────────────────
// Returns the new link string, or `null` to skip (already migrated /
// unrecognised shape / missing data).

function rewriteAdventureLink(link) {
  if (!link) return null;
  if (link.includes("#")) return null; // already has anchor
  if (!/^\/members\/[^/?#]+$/.test(link)) return null;
  return `${link}#minihome-adventure`;
}

function rewriteGuestbookLink(link, doc) {
  if (!link) return null;
  // New format: /members/<id>?guestbook=<entryId> — needs targetPath
  // to extract entry id. targetPath shapes:
  //   members/<id>/guestbook/<entryId>
  //   members/<id>/guestbook/<entryId>/replies/<replyId>  ← reply,
  //     parent entry id is the page-jump anchor.
  // If targetPath is missing/malformed, fall through to the old anchor
  // rewrite (so very old docs without targetPath still get the
  // section-level scroll).
  const targetPath =
    typeof doc.targetPath === "string" ? doc.targetPath : "";
  const m =
    /^members\/([^/]+)\/guestbook\/([^/]+)(?:\/replies\/[^/]+)?$/.exec(
      targetPath,
    );
  if (m) {
    const memberId = m[1];
    const entryId = m[2];
    const next = `/members/${memberId}?guestbook=${entryId}`;
    if (link === next) return null;
    return next;
  }
  // Legacy fallback: bare /members/<id> → add #minihome-guestbook
  // anchor (Phase 1 behaviour). Only applied when targetPath couldn't
  // give us the entry id.
  if (link.includes("#") || link.includes("?")) return null;
  if (!/^\/members\/[^/?#]+$/.test(link)) return null;
  return `${link}#minihome-guestbook`;
}

function rewriteCombatLink(link, doc) {
  if (!link) return null;
  // Already migrated (?nick=…)?
  if (link.includes("nick=")) return null;
  // Anything other than bare /combat we leave alone.
  if (link !== "/combat") return null;
  // Pull "${X}님" from the message; fall back to activity.nickname.
  const msg = typeof doc.message === "string" ? doc.message : "";
  const m = /^([^\s'"]+?)님/.exec(msg);
  const owner = m?.[1] || doc.nickname || "";
  if (!owner) return null;
  return `/combat?nick=${encodeURIComponent(owner)}`;
}

const REWRITERS = {
  adventure: (_link, doc) => rewriteAdventureLink(doc.link),
  guestbook: (_link, doc) => rewriteGuestbookLink(doc.link, doc),
  combat: (_link, doc) => rewriteCombatLink(doc.link, doc),
};

// ── main ──────────────────────────────────────────────────────────
console.log(`\n=== migrate-activity-links (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

const snap = await db.collection("activity").get();
console.log(`scanning ${snap.size} docs…\n`);

const stats = {};
const updates = [];

for (const d of snap.docs) {
  const data = d.data();
  const type = typeof data.type === "string" ? data.type : "(none)";
  if (!stats[type]) {
    stats[type] = { total: 0, changed: 0, skipped: 0, samples: [] };
  }
  const s = stats[type];
  s.total++;

  const rewriter = REWRITERS[type];
  if (!rewriter) {
    s.skipped++;
    continue;
  }
  const newLink = rewriter(data.link, data);
  if (newLink === null || newLink === data.link) {
    s.skipped++;
    continue;
  }
  s.changed++;
  if (s.samples.length < 5) {
    s.samples.push({ id: d.id, before: data.link ?? "(none)", after: newLink });
  }
  updates.push({ ref: d.ref, link: newLink });
}

const types = Object.keys(stats).sort();
let totalChanged = 0;
for (const t of types) {
  const s = stats[t];
  totalChanged += s.changed;
  if (REWRITERS[t]) {
    console.log(`[${t}] total=${s.total} changed=${s.changed} skipped=${s.skipped}`);
    for (const sm of s.samples) {
      console.log(`   ✏  ${sm.id}`);
      console.log(`      - ${sm.before}`);
      console.log(`      + ${sm.after}`);
    }
  } else {
    console.log(`[${t}] total=${s.total} (no rewriter — skipped)`);
  }
}

console.log(`\nsummary: total=${snap.size} willChange=${totalChanged}`);

if (DRY) {
  console.log(`\n[DRY-RUN] no writes. re-run with --apply to write.\n`);
  process.exit(0);
}

console.log(`\n[APPLY] writing ${updates.length} doc(s) in batches of 500…`);
let written = 0;
for (let i = 0; i < updates.length; i += 500) {
  const chunk = updates.slice(i, i + 500);
  const batch = db.batch();
  for (const u of chunk) batch.update(u.ref, { link: u.link });
  await batch.commit();
  written += chunk.length;
  console.log(`  committed ${written}/${updates.length}`);
}
console.log(`\n[APPLY] done. wrote ${written} doc(s).\n`);
process.exit(0);
