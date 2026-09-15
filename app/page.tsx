// Main page — feature-gated between legacy 우주 테마 and the new 하늘섬
// (Dawnlight 2) layout. The decision needs the logged-in nickname, so
// it lives in a client gate; this file stays a thin server shell.
//
// Home 채팅 리뉴얼 되돌리기 (Phase 1) — NewHomeChat(풀스크린 채팅+최신소식
// 병합 화면)을 홈 메인에서 제거하고 옛 <MainGate /> 로 단일화. 채팅은
// FloatingChat(전역 FAB)으로만 접근. NewHomeChat.tsx 자체는 삭제하지 않고
// dead file로 남겨둠(components/redesign/NewHomeChat.tsx, 사용처 0).
import { MainGate } from "./components/dawnlight2/MainGate";

export default function Home() {
  return <MainGate />;
}
