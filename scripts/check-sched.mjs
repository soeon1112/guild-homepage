import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const credPath = resolve(
  __dirname,
  "..",
  "..",
  "dawnlight-app",
  "dawnlight-guild-3181d3388f9f.json",
);
initializeApp({ credential: cert(JSON.parse(readFileSync(credPath, "utf8"))) });
const db = getFirestore();
const snap = await db
  .collection("activity")
  .where("type", "==", "schedule")
  .get();
console.log(`schedule activity docs total = ${snap.size}`);
for (const d of snap.docs.slice(0, 5)) {
  const data = d.data();
  console.log(
    `  id=${d.id} link=${data.link} message=${data.message?.slice(0, 50)}`,
  );
}
process.exit(0);
