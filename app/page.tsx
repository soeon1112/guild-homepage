"use client";

// Main page — feature-gated between legacy 우주 테마 and the new 하늘섬
// (Dawnlight 2) layout. The decision needs the logged-in nickname, so
// it lives in a client gate; this file stays a thin server shell.
//
// Home 채팅 메인 리뉴얼 — 언쏘 대상 A/B 검증(Phase 4)을 거쳐 전체 공개.
// 로그인한 모든 길드원의 홈을 NewHomeChat(풀스크린 채팅+최신소식 병합
// 화면, P3)으로 대체. 비로그인만 기존 <MainGate /> 그대로(내부 로직
// 미접촉). MainGate 자체는 2026-05-08 dl2 전체 공개 이후 자체 게이트
// 로직이 없는 thin wrapper라 이 분기를 이 파일에서 직접 처리한다.
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
  const { nickname, ready } = useAuth();

  // ready 게이팅 — 세션 복원(localStorage 읽기 + Firestore 재검증 왕복)
  // 이 끝나기 전엔 nickname 이 항상 null 이라 아래 분기가 무조건
  // MainGate(옛 홈)로 잘못 추측했다가, 복원이 끝나면 로그인 사용자는
  // NewHomeChat 으로 다시 스위치되는 flash 가 있었다(진단 완료). ready
  // 될 때까지는 아무것도 추측하지 않고 빈 화면만 보여준다 — useAuth
  // 자체 로직은 미접촉, 이미 있던 ready 플래그만 소비.
  if (!ready) {
    return (
      <div
        style={{
          height: `calc(100dvh - ${TOPBAR_HEIGHT}px)`,
          background: "#fef5e6",
        }}
      />
    );
  }

  // 전체 공개 — 언쏘 전용 A/B("언쏘"만) 조건을 로그인 여부로 완화.
  // 비로그인만 옛 홈(MainGate) 유지.
  if (nickname) {
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
