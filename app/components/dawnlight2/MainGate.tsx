"use client";

import { Dawnlight2MainPage } from "./MainPage";

// 2026-05-08 dl2 전체 공개 후 cosmic 메인 (TodaySky / GuildTestBanner /
// ShootingStarLetter / NebulaWhispers / WhispersToStars / StarOfDay) 위젯 stack
// 은 dead code 가 되어 모두 정리됨. 게이트 자체는 향후 다른 분기 추가 시
// 재활용할 수 있도록 thin wrapper 로 남겨둠.
export function MainGate() {
  return <Dawnlight2MainPage />;
}
