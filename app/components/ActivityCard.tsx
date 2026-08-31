"use client";

import Link from "next/link";
import type { MessageReactions } from "@/src/lib/useChatReactions";

// Home 채팅 메인 리뉴얼 Phase 2 — 최신 소식(activity) 카드. `link`은
// activity.ts 의 logActivity()가 쓰던 그대로 신뢰 — 별도 파싱/변환 없이
// Next.js Link href에 바로 사용.
//
// dl2 톤 — 배포 후 실사용 확인 결과 cream/peach 조합이 채팅 버블
// (mine=#ffd4b8 배경, other=#f0e4cc 배경)과 거의 같은 색으로 읽혀 구분이
// 안 됐다. mist-lavender(#c8b8e8) 계열로 교체 — 채팅 버블 두 색 어느
// 쪽과도 겹치지 않으면서, 다른 dl2 위젯(Topbar 서브타이틀 등)이 이미
// 보조 톤으로 쓰는 팔레트라 이탈 없음. 폰트도 버블(12px)과 같은 선상
// (text-xs)+ rounded-full로 "시스템 메시지" 느낌을 살림 — 라벨/시간
// 없음, 문구만 중앙 배열.
//
// P4.2.1 — ⋯ 트리거를 채팅 메시지(MessageItem)의 replyBtn 과 동일한
// opacity-40 → hover:opacity-100(PC 에서 항상 최소한은 보임)로 이식했지만,
// flex 형제로 두면 [카드+⋯] 묶음 전체가 중앙 정렬 대상이 돼 카드 자체가
// 왼쪽으로 쏠리고, 폭을 나눠 갖게 돼 카드가 두 줄로 넘어가는 회귀가
// 났다(P4.2.2). 카드 wrapper 를 relative 로 두고 ⋯ 을 그 안에서 absolute
// 로 카드 오른쪽 "밖"에 붙이면 ⋯ 이 레이아웃 폭 계산에서 완전히
// 빠져(포지셔닝만, 공간 차지 X) 카드는 항상 자기 자신만으로 중앙
// 정렬·한 줄 유지된다. 클릭 시 부모가 채팅과 같은 actionMenuFor
// 팝오버(이모지+답글)를 연다 — ActivityCard 는 그 팝오버를 모르고
// 콜백만 받는다.

type Props = {
  message: string;
  link: string;
  onActionMenu?: () => void;
  messageReactions?: MessageReactions;
};

export function ActivityCard({ message, link, onActionMenu, messageReactions }: Props) {
  return (
    <div className="my-2 flex flex-col items-center gap-1">
      <div className="relative inline-block max-w-[80%]">
        <Link
          href={link}
          className="block rounded-full border border-[#c8b8e8]/50 bg-[#c8b8e8]/15 px-4 py-2 text-center font-serif text-xs transition-colors hover:bg-[#c8b8e8]/25"
          style={{ color: "#5c3a1f" }}
        >
          {message}
        </Link>
        {onActionMenu && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onActionMenu();
            }}
            aria-label="액션 메뉴"
            className="chat-action-trigger absolute right-[-32px] top-1/2 -translate-y-1/2 opacity-40 transition-opacity hover:opacity-100"
            style={{ padding: 4, color: "#8a6a4a", lineHeight: 1, fontSize: 14, letterSpacing: 1 }}
          >
            ⋯
          </button>
        )}
      </div>
      {messageReactions && messageReactions.byEmoji.size > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1">
          {Array.from(messageReactions.byEmoji.entries()).map(([emoji, nicks]) => {
            const isMine = messageReactions.myEmoji === emoji;
            return (
              <span
                key={emoji}
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-serif"
                style={{
                  background: "rgba(254,245,230,0.85)",
                  border: isMine
                    ? "1px solid rgba(255,184,138,0.85)"
                    : "1px solid rgba(92,58,31,0.2)",
                  color: "#5c3a1f",
                }}
              >
                <span style={{ fontSize: 12 }}>{emoji}</span>
                <span style={{ fontSize: 11 }}>{nicks.length}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
