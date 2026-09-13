import { MemberListNewPage } from "@/app/components/members/MemberListNewPage";

// 임시 개발 접근 라우트 (Phase 2). 기존 /members는 미접촉. ChromeShell이
// 경로별 예외를 두는 곳은 /admin과 / 뿐이라 이 라우트는 별도 등록 없이
// 기본 dl2 챙(Topbar/BottomNav)을 그대로 받는다. Phase 4에서 언쏘 A/B
// 라우팅이 붙으면 이 파일은 정리될 예정.
export default function MembersNewRoute() {
  return <MemberListNewPage />;
}
