"use client";

import { ParticipantCard } from "@/app/components/voice/ParticipantCard";

export type ParticipantPanelItem = {
  nickname: string;
  imageUrl?: string;
  muted: boolean;
  speaking: boolean;
  isMe?: boolean;
};

type ParticipantPanelProps = {
  participants: ParticipantPanelItem[];
  emptyLabel?: string;
};

// 디코 사이드바 스타일 세로 리스트 — 이전 라운드의 중앙 그리드
// (ParticipantGrid.tsx, 삭제됨)를 완전히 대체. 참가 전 프리뷰(G-1)와
// 참가 후 좌측 패널(C-1) 양쪽에서 재사용.
export function ParticipantPanel({ participants, emptyLabel }: ParticipantPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pt-3 pb-1">
        <span
          className="font-serif text-[10px] tracking-wider"
          style={{ color: "rgba(254, 245, 230, 0.5)" }}
        >
          참가자 {participants.length > 0 ? `— ${participants.length}명` : ""}
        </span>
      </div>
      {participants.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-center text-sm italic" style={{ color: "rgba(254, 245, 230, 0.55)" }}>
            {emptyLabel ?? "아직 아무도 없습니다"}
          </p>
        </div>
      ) : (
        <div className="flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-2">
          {participants.map((p) => (
            <ParticipantCard
              key={p.nickname}
              nickname={p.nickname}
              imageUrl={p.imageUrl}
              muted={p.muted}
              speaking={p.speaking}
              isMe={p.isMe}
            />
          ))}
        </div>
      )}
    </div>
  );
}
