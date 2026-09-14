"use client";

import { MicOff } from "lucide-react";

// 말할 때 참가자 프사에 두르는 글로우 색. spring-green — 디코의 쨍한
// 초록보다 절제됐고 dl2 석양/크림 팔레트와 부딪히지 않음(Phase 2 판단
// 유지). 발화 감지 자체(임계값/폴링)는 VoiceRoom.tsx로 옮겨졌다 —
// ParticipantCard는 이미 계산된 boolean만 받는 순수 표시 컴포넌트.
const SPEAKING_GLOW = "rgba(134, 214, 150, 0.85)";

type ParticipantCardProps = {
  nickname: string;
  imageUrl?: string;
  muted: boolean;
  speaking: boolean;
  isMe?: boolean;
  /** 프사 지름(px). 참가자 수에 따라 ParticipantGrid가 결정(D-4). */
  size?: number;
};

export function ParticipantCard({
  nickname,
  imageUrl,
  muted,
  speaking,
  isMe = false,
  size = 64,
}: ParticipantCardProps) {
  const glowActive = speaking && !muted;
  const ringWidth = Math.max(3, Math.round(size * 0.055));
  const badgeSize = Math.max(16, Math.round(size * 0.32));

  return (
    <div className="flex flex-col items-center gap-2" style={{ width: size + 16 }}>
      <div className="relative" style={{ width: size, height: size }}>
        <div
          aria-hidden
          className="absolute -inset-1.5 rounded-full transition-all duration-200 ease-out"
          style={{
            boxShadow: glowActive
              ? `0 0 0 ${ringWidth}px ${SPEAKING_GLOW}, 0 0 ${size * 0.28}px ${ringWidth * 0.5}px ${SPEAKING_GLOW}`
              : `0 0 0 0 rgba(134, 214, 150, 0)`,
          }}
        />
        <div
          className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full"
          style={{
            background: "transparent",
            border: "1.5px solid rgba(254, 245, 230, 0.45)",
            boxShadow: isMe ? "0 0 0 1px rgba(255, 199, 133, 0.55)" : undefined,
          }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={`${nickname}의 프로필 사진`}
              style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            // MemberAvatar.tsx dl2 기본 프사 SVG와 동일(파일 미접촉, 시각적
            // 통일감만 복제) — 개인 공간/채팅/통화방이 같은 얼굴을 쓴다.
            <svg viewBox="0 0 96 96" style={{ width: "100%", height: "100%" }} aria-hidden>
              <rect width="96" height="96" fill="#d4a870" />
              <circle cx="48" cy="36" r="18" fill="#b88850" opacity="0.8" />
              <path d="M 20 96 Q 20 64 48 64 Q 76 64 76 96 Z" fill="#a87840" opacity="0.7" />
              <circle cx="42" cy="33" r="2.5" fill="#3a2a1a" opacity="0.7" />
              <circle cx="54" cy="33" r="2.5" fill="#3a2a1a" opacity="0.7" />
              <path
                d="M 43 41 Q 48 46 53 41"
                stroke="#3a2a1a"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
                opacity="0.7"
              />
            </svg>
          )}
        </div>
        {muted && (
          <div
            className="absolute flex items-center justify-center rounded-full"
            style={{
              right: -badgeSize * 0.15,
              bottom: -badgeSize * 0.15,
              width: badgeSize,
              height: badgeSize,
              background: "rgba(11, 8, 33, 0.9)",
              border: "1px solid rgba(254, 245, 230, 0.5)",
            }}
          >
            <MicOff size={Math.round(badgeSize * 0.55)} color="#fef5e6" />
          </div>
        )}
      </div>
      <span
        className="max-w-full truncate text-center text-[11px]"
        style={{ color: "#fef5e6", opacity: isMe ? 1 : 0.85, fontWeight: isMe ? 600 : 400 }}
      >
        {nickname}
        {isMe ? " (나)" : ""}
      </span>
    </div>
  );
}
