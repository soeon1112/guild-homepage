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

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-5 px-4 py-6">
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
  );
}
