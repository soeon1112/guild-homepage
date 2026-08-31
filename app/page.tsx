"use client";

// Main page — feature-gated between legacy 우주 테마 and the new 하늘섬
// (Dawnlight 2) layout. The decision needs the logged-in nickname, so
// it lives in a client gate; this file stays a thin server shell.
//
// Home 채팅 메인 리뉴얼 Phase 4 — 언쏘(로그인 nickname === "언쏘")만 홈을
// NewHomeChat(풀스크린 채팅+최신소식 병합 화면, P3)으로 대체. 다른 모든
// 사용자는 기존 <MainGate /> 그대로(내부 로직 미접촉). MainGate 자체는
// 2026-05-08 dl2 전체 공개 이후 자체 게이트 로직이 없는 thin wrapper라
// 이 분기를 이 파일에서 직접 처리한다.
//
// 높이: NewHomeChat 은 내부 스크롤 영역(overflow-y-auto)이 h-full 을
// 기준으로 동작하는데, ChromeShell 의 `.dawnlight2` 래퍼는 고정 높이가
// 없어(문서 스크롤 전제) 그대로 두면 h-full 이 무한정 자란다. 홈
// 라우트에서는 Breadcrumb 가 렌더되지 않아(parts.length===0) Topbar
// (56px, Topbar.tsx:234 h-[56px]) 만 위에 남으므로, 뷰포트에서 그만큼만
// 뺀 고정 높이 박스로 감싸 "채팅만 스크롤, 페이지는 고정"을 만든다.
import { useAuth } from "@/app/components/AuthProvider";
import { MainGate } from "./components/dawnlight2/MainGate";
import { NewHomeChat } from "./components/redesign/NewHomeChat";

const TOPBAR_HEIGHT = 56;

export default function Home() {
  const { nickname } = useAuth();

  if (nickname === "언쏘") {
    return (
      <div style={{ height: `calc(100dvh - ${TOPBAR_HEIGHT}px)` }}>
        <NewHomeChat />
      </div>
    );
  }

  return <MainGate />;
}
