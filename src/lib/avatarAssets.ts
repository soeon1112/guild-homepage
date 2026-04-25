// Firebase Storage URL builder for avatar images.
// Paths mirror the upload layout: avatars/<category>/<filename>.png.
// Kept in sync with the app's src/lib/avatarAssets.ts — do not diverge.

const BUCKET = "dawnlight-guild.firebasestorage.app";
const BASE = `https://storage.googleapis.com/${BUCKET}/avatars`;

export type AvatarCategory =
  | "bodies"
  | "eyes"
  | "mouths"
  | "cheeks"
  | "hair"
  | "parts";

export function avatarUrl(category: AvatarCategory, filename: string): string {
  return `${BASE}/${category}/${filename}.png`;
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
