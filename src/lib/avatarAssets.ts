// Firebase Storage URL builder for avatar images.
// Paths mirror the upload layout: avatars/<category>/<filename>.png.
// Kept in sync with the app's src/lib/avatarAssets.ts — do not diverge.

const BUCKET = "dawnlight-guild.firebasestorage.app";
const BASE = `https://storage.googleapis.com/${BUCKET}/avatars`;

// Build-time timestamp injected by next.config.ts (`Date.now()` at the
// moment Vercel runs `next build`). Used as a `?v=` cache-bust suffix
// so re-uploaded PNGs are fetched fresh on each deploy without manual
// version bumps. Falls back to "0" only if the env var is missing
// (shouldn't happen — Next.js inlines NEXT_PUBLIC_* at build time).
export const AVATAR_VERSION = process.env.NEXT_PUBLIC_AVATAR_VERSION ?? "0";

export type AvatarCategory =
  | "bodies"
  | "eyes"
  | "mouths"
  | "cheeks"
  | "hair_back"
  | "hair_front"
  | "parts";

export function avatarUrl(category: AvatarCategory, filename: string): string {
  return `${BASE}/${category}/${filename}.png?v=${AVATAR_VERSION}`;
}

// Fashion parts live at avatars/parts/<body>/<category>/<id>.png — one
// folder per body since each garment is drawn for a specific silhouette.
export function partUrl(
  body: string,
  category: "tops" | "bottoms" | "shoes" | "accessories",
  id: string,
): string {
  return avatarUrl("parts", `${body}/${category}/${id}`);
}
