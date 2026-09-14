"use client";

import dynamic from "next/dynamic";

// Agora SDK는 브라우저 전용(WebRTC) — SSR 시 렌더링하면 즉시 에러난다.
// ssr:false로 서버 번들에서 완전히 제외(Phase 0 진단: 이 레포에 dynamic
// (ssr:false) 선례 0건 — 이 페이지가 최초 도입).
const VoiceRoom = dynamic(() => import("@/app/components/voice/VoiceRoom"), {
  ssr: false,
});

export default function VoicePage() {
  return <VoiceRoom />;
}
