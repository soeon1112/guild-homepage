"use client";

import Link from "next/link";

// Home 채팅 메인 리뉴얼 Phase 2 — 최신 소식(activity) 카드. 사용처는 아직
// 없음(Phase 3에서 useHomeTimeline 의 TimelineItem[kind="activity"] 를
// 렌더링에 연결한다). `link`은 activity.ts 의 logActivity()가 쓰던 그대로
// 신뢰 — 별도 파싱/변환 없이 Next.js Link href에 바로 사용.
//
// dl2 톤 — 배포 후 실사용 확인 결과 cream/peach 조합이 채팅 버블
// (mine=#ffd4b8 배경, other=#f0e4cc 배경)과 거의 같은 색으로 읽혀 구분이
// 안 됐다. mist-lavender(#c8b8e8) 계열로 교체 — 채팅 버블 두 색 어느
// 쪽과도 겹치지 않으면서, 다른 dl2 위젯(Topbar 서브타이틀 등)이 이미
// 보조 톤으로 쓰는 팔레트라 이탈 없음. 폰트도 버블(12px)보다 작게(12px
// 동일선상, text-xs)+ rounded-full로 "시스템 메시지" 느낌을 살림 —
// 라벨/시간 없음, 문구만 중앙 배열.

type Props = {
  message: string;
  link: string;
  // P4.2 답글 — 실제 액션시트(useCommentActionSheet) 인스턴스는 부모
  // (NewHomeChat) 하나만 갖고 있고, 이 콜백은 그 open() 을 이 카드에
  // 바인딩해서 내려받은 것 — ActivityCard 는 훅 자체를 모른다(재사용만,
  // 시스템 미접촉).
  onOpenMenu?: () => void;
};

export function ActivityCard({ message, link, onOpenMenu }: Props) {
  return (
    <div className="my-2 flex justify-center">
      <Link
        href={link}
        className="group relative inline-flex max-w-[80%] items-center gap-1.5 rounded-full border border-[#c8b8e8]/50 bg-[#c8b8e8]/15 py-2 pl-4 pr-2 text-center font-serif text-xs transition-colors hover:bg-[#c8b8e8]/25"
        style={{ color: "#5c3a1f" }}
      >
        <span className="min-w-0">{message}</span>
        {onOpenMenu && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenMenu();
            }}
            aria-label="답글"
            className="shrink-0 rounded-full px-1.5 py-0.5 opacity-0 transition-opacity hover:bg-[#5c3a1f]/10 group-hover:opacity-60"
            style={{ color: "#5c3a1f", fontSize: 14, lineHeight: 1 }}
          >
            ⋯
          </button>
        )}
      </Link>
    </div>
  );
}
