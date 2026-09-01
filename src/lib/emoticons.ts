// Firebase Storage에 업로드된 이모티콘 12종. 새 이모티콘 추가 시 이 배열에
// id만 늘리면 됨 — 이미지 자체는 Storage emoticons/{id}.png 로 콘솔 업로드.
export const EMOTICON_IDS = [
  "01", "02", "03", "04", "05", "06",
  "07", "08", "09", "10", "11", "12",
];

// src/lib/firebase.ts storageBucket verbatim.
const BUCKET = "dawnlight-guild.firebasestorage.app";

export function getEmoticonUrl(id: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/emoticons%2F${id}.png?alt=media`;
}
