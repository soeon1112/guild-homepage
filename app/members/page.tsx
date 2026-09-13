"use client";

import { MemberListNewPage } from "@/app/components/members/MemberListNewPage";

// 길드원 페이지 — 언쏘 A/B 검증(Phase 4)을 거쳐 전체 공개. app/page.tsx
// (home, 언쏘 전체 공개 때 옛 cosmic 위젯 스택 완전 삭제)와 같은 정리 —
// 옛 카드 페이지(cosmic 그리드 + dl2 그리드 두 분기, MemberCard 렌더)는
// dead code라 완전히 삭제하고 새 한 줄 목록(MemberListNewPage, 자체
// 완결형 컴포넌트)으로 대체.
export default function MembersPage() {
  return <MemberListNewPage />;
}
