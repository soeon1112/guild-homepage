// Dawnlight 2 (하늘섬 redesign) — soft-launched to a single nickname while
// the new look is being built. Add nicknames here to widen the rollout.
// Match is exact (case + Hangul NFC). Other guild members keep the
// existing 우주 테마 main page, including the impostor case where
// someone *types* "언쏘" but doesn't actually log in as that user — the
// nickname here is whatever AuthProvider stored on successful login,
// which is the Firestore users doc id, so it's authoritative.
export const DAWNLIGHT2_USERS: readonly string[] = ["언쏘"];

export function isDawnlight2Enabled(_nickname: string | null): boolean {
  // 2026-05-08 — 모든 사용자 / 모든 시점 / 모든 페이지 dl2 강제.
  // 이전 라운드까지는 nickname null 가드로 비로그인 시 cosmic 을
  // 보여줬는데, hook 첫 render 가 항상 false 로 시작 → cosmic 분기
  // 잠깐 보였다가 dl2 로 hydrate 되는 깜빡임이 발생했음. 비로그인
  // 페이지(로그인/회원가입)는 자체 디자인이라 dl2/cosmic 분기를
  // 사용하지 않으므로, 항상 true 로 박아도 안전. cosmic 분기는
  // dead code (다음 라운드에서 폐기 예정).
  return true;
}

export function useDawnlight2(): boolean {
  // SSR / 첫 paint 시점부터 즉시 true. AuthProvider 의 nickname
  // 초기화(localStorage 동기 + useEffect ready)를 기다리지 않으므로
  // cosmic 분기가 절대 마운트되지 않음 → 깜빡임 X.
  return true;
}
