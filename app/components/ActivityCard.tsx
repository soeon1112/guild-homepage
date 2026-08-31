"use client";

import Link from "next/link";

// Home 채팅 메인 리뉴얼 Phase 2 — 최신 소식(activity) 카드. 사용처는 아직
// 없음(Phase 3에서 useHomeTimeline 의 TimelineItem[kind="activity"] 를
// 렌더링에 연결한다). `link`은 activity.ts 의 logActivity()가 쓰던 그대로
// 신뢰 — 별도 파싱/변환 없이 Next.js Link href에 바로 사용.
//
// dl2 톤 — 채팅 버블(font-serif, rounded-2xl)과 시각적으로 조화되면서도
// 튀지 않게: cream 배경 + peach(cloud-pink) 테두리 + ink 텍스트, hover 시
// sunset-gold 옅게. 라벨/시간 없음 — 문구만 중앙 배열.

type Props = {
  message: string;
  link: string;
};

export function ActivityCard({ message, link }: Props) {
  return (
    <div className="my-2 flex justify-center">
      <Link
        href={link}
        className="inline-block max-w-[80%] rounded-2xl border border-cloud-pink bg-cream px-4 py-3 text-center font-serif text-sm transition-colors hover:bg-sunset-gold/25"
        style={{ color: "#5c3a1f" }}
      >
        {message}
      </Link>
    </div>
  );
}
