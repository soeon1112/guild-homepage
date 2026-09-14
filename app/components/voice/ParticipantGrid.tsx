"use client";

import { ParticipantCard } from "@/app/components/voice/ParticipantCard";

export type ParticipantGridItem = {
  nickname: string;
  imageUrl?: string;
  muted: boolean;
  speaking: boolean;
  isMe?: boolean;
};

type ParticipantGridProps = {
  participants: ParticipantGridItem[];
  emptyLabel?: string;
};

// D-4: 참가자 수에 따라 프사 크기 + 한 줄에 들어가는 개수(maxWidth로 강제
// wrap)를 바꿔 1명일 땐 중앙에 큼직하게, 5명 이상이면 촘촘한 3열+로 자동
// 재배치. flex-wrap이 폭을 기준으로 자연스럽게 줄바꿈하므로 별도 grid
// column-count 계산 없이 maxWidth만 tier별로 캡.
function tierFor(count: number): { size: number; cols: number } {
  if (count <= 1) return { size: 112, cols: 1 };
  if (count <= 4) return { size: 80, cols: 2 };
  if (count <= 6) return { size: 68, cols: 3 };
  return { size: 56, cols: 4 };
}

export function ParticipantGrid({ participants, emptyLabel }: ParticipantGridProps) {
  if (participants.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm italic" style={{ color: "rgba(254, 245, 230, 0.6)" }}>
          {emptyLabel ?? "아직 아무도 없습니다"}
        </p>
      </div>
    );
  }

  const { size, cols } = tierFor(participants.length);
  const cardWidth = size + 16;
  const gapPx = 20;
  const maxWidth = cols * cardWidth + (cols - 1) * gapPx;

  return (
    <div
      className="mx-auto flex flex-wrap items-start justify-center gap-x-5 gap-y-6 px-4 py-6"
      style={{ maxWidth }}
    >
      {participants.map((p) => (
        <ParticipantCard
          key={p.nickname}
          nickname={p.nickname}
          imageUrl={p.imageUrl}
          muted={p.muted}
          speaking={p.speaking}
          isMe={p.isMe}
          size={size}
        />
      ))}
    </div>
  );
}
