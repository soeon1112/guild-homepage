"use client";

import { ParticipantCard } from "@/app/components/voice/ParticipantCard";

export type ParticipantPanelItem = {
  nickname: string;
  imageUrl?: string;
  muted: boolean;
  speaking: boolean;
  isMe?: boolean;
  /** 이 사람의 개별 음량(%). 참가 전 프리뷰에서는 넘기지 않는다. */
  userVolume?: number;
  /** 마이크 없이 듣기 전용으로 참가 중인지. */
  listenOnly?: boolean;
};

type ParticipantPanelProps = {
  participants: ParticipantPanelItem[];
  emptyLabel?: string;
  /** 없으면 사람별 음량 컨트롤이 렌더되지 않는다(참가 전 프리뷰). */
  onUserVolumeChange?: (nickname: string, volume: number) => void;
};

// 디코 사이드바 스타일 세로 리스트 — 이전 라운드의 중앙 그리드
// (ParticipantGrid.tsx, 삭제됨)를 완전히 대체. 참가 전 프리뷰(G-1)와
// 참가 후 좌측 패널(C-1) 양쪽에서 재사용.
export function ParticipantPanel({ participants, emptyLabel, onUserVolumeChange }: ParticipantPanelProps) {
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
              userVolume={p.userVolume}
              listenOnly={p.listenOnly}
              onUserVolumeChange={
                onUserVolumeChange ? (volume) => onUserVolumeChange(p.nickname, volume) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
