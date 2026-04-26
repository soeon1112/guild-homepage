// Firebase Storage URL builder for avatar images.
// Paths mirror the upload layout: avatars/<category>/<filename>.png.
// Kept in sync with the app's src/lib/avatarAssets.ts — do not diverge.

const BUCKET = "dawnlight-guild.firebasestorage.app";
const BASE = `https://storage.googleapis.com/${BUCKET}/avatars`;

// Bump when avatar PNGs are re-uploaded so browsers fetch the new copies
// instead of serving the previous response from cache (Firebase Storage
// sends Cache-Control: max-age=3600 by default).
export const AVATAR_VERSION = "202604261307";

export type AvatarCategory =
  | "bodies"
  | "eyes"
  | "mouths"
  | "cheeks"
  | "hair"
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
