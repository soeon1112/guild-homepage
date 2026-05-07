"use client";

import { useAuth } from "@/app/components/AuthProvider";

// Dawnlight 2 (하늘섬 redesign) — soft-launched to a single nickname while
// the new look is being built. Add nicknames here to widen the rollout.
// Match is exact (case + Hangul NFC). Other guild members keep the
// existing 우주 테마 main page, including the impostor case where
// someone *types* "언쏘" but doesn't actually log in as that user — the
// nickname here is whatever AuthProvider stored on successful login,
// which is the Firestore users doc id, so it's authoritative.
export const DAWNLIGHT2_USERS: readonly string[] = ["언쏘"];

export function isDawnlight2Enabled(nickname: string | null): boolean {
  if (!nickname) return false;
  // 2026-05-08 — 전체 길드원 공개. DAWNLIGHT2_USERS 리스트는
  // historical 참고용 (cosmic 분기와 함께 다음 라운드에서 폐기).
  // nickname null (비로그인) 은 cosmic 유지 (로그인 페이지 등).
  return true;
}

export function useDawnlight2(): boolean {
  const { nickname } = useAuth();
  return isDawnlight2Enabled(nickname);
}
