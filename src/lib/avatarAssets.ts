// Firebase Storage URL builder for avatar images.
// Paths mirror the upload layout: avatars/<category>/<filename>.png.
// Kept in sync with the app's src/lib/avatarAssets.ts — do not diverge.

const BUCKET = "dawnlight-guild.firebasestorage.app";
const BASE = `https://storage.googleapis.com/${BUCKET}/avatars`;

export type AvatarCategory = "bodies" | "eyes" | "mouths" | "cheeks" | "hair";

export function avatarUrl(category: AvatarCategory, filename: string): string {
  return `${BASE}/${category}/${filename}.png`;
}
