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
// overflow:hidden — P7-B 회귀 fix. + 버튼 슬라이드업(NewHomeChat 안,
// Dawnlight2BottomNav forceVisible)이 닫힌 상태에서 이 박스 바로 아래로
// translateY 만큼 밀려나 있는데, 이 박스에 클리핑이 없으면 페이지가
// 조금이라도 더 길어질 때(예: ChromeShell main 여분 패딩) 그 잔상이
// 비쳐 보일 수 있다 — 이 박스 경계에서 무조건 잘라 방지.
//
// 키보드 회피 근본 fix — `100dvh`만으로는 모바일 브라우저(특히 Android
// Chrome 다수 버전, 일부 iOS Safari)에서 소프트 키보드가 열려도 동적
// 뷰포트 높이가 안 줄어드는 비일관성이 있다. 이 페이지는 (App
// Router 다른 페이지들과 달리) 문서 레벨 스크롤이 아예 없이 뷰포트에
// 정확히 맞춰 고정된 박스라, 기존 두 키보드 전략(모달의
// `--keyboard-inset` padding-bottom, KeyboardScrollGuard의
// scrollIntoView) 둘 다 "스크롤 여유가 있는 박스"를 전제해서 여기선
// 스크롤할 대상 자체가 없어 무력화됐다(둘 다 미접촉, 그대로 둠).
// VisualViewportSync(app/components/VisualViewportSync.tsx)가 이미
// 실측 키보드 오버랩을 `--keyboard-inset`로 노출하고 있으므로, 이
// 박스의 높이 자체에서 그만큼을 직접 빼 채팅 영역(flex-1)이 줄고
// 입력창이 자연히 키보드 위로 밀려 올라가게 한다.
import { useAuth } from "@/app/components/AuthProvider";
import { MainGate } from "./components/dawnlight2/MainGate";
import { NewHomeChat } from "./components/redesign/NewHomeChat";

const TOPBAR_HEIGHT = 56;

export default function Home() {
  const { nickname } = useAuth();

  if (nickname === "언쏘") {
    return (
      <div
        style={{
          height: `calc(100dvh - ${TOPBAR_HEIGHT}px - var(--keyboard-inset, 0px))`,
          overflow: "hidden",
        }}
      >
        <NewHomeChat />
      </div>
    );
  }

  return <MainGate />;
}
