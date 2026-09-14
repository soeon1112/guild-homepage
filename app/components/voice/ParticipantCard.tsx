"use client";

import { MicOff } from "lucide-react";

// 디코 스타일 "말할 때 글로우" 임계값. Agora volume-indicator level은
// 0-100 스케일이라 5는 숨소리 정도의 잡음은 걸러내고 실제 발화만 반응하게
// 하는 낮은 문턱값(과제서 F-2 예시값).
export const SPEAKING_VOLUME_THRESHOLD = 5;

// 말할 때 참가자 프사에 두르는 글로우 색. 과제서 예시(rgba(100,200,100,0.6))
// 그대로 쓰면 twilight-deep(#2a1f4a) 배경 위에서 탁하게 죽어 보여서, 채도/
// 밝기를 살짝 올린 spring-green으로 조정(Claude Code 판단, F-3) — 디코의
// 쨍한 초록보다는 dl2 전체 톤(석양/크림)과 부딪히지 않는 부드러운 초록.
const SPEAKING_GLOW = "rgba(134, 214, 150, 0.85)";

type ParticipantCardProps = {
  nickname: string;
  imageUrl?: string;
  muted: boolean;
  speaking: boolean;
  isMe?: boolean;
};

export function ParticipantCard({
  nickname,
  imageUrl,
  muted,
  speaking,
  isMe = false,
}: ParticipantCardProps) {
  const glowActive = speaking && !muted;

  return (
    <div className="flex w-20 flex-col items-center gap-1.5">
      <div className="relative">
        <div
          aria-hidden
          className="absolute -inset-1 rounded-full transition-all duration-200 ease-out"
          style={{
            boxShadow: glowActive
              ? `0 0 0 4px ${SPEAKING_GLOW}, 0 0 14px 2px ${SPEAKING_GLOW}`
              : "0 0 0 0 rgba(134, 214, 150, 0)",
          }}
        />
        <div
          className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full"
          style={{
            background: "transparent",
            border: "1.5px solid rgba(254, 245, 230, 0.45)",
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
            className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full"
            style={{
              background: "rgba(11, 8, 33, 0.85)",
              border: "1px solid rgba(254, 245, 230, 0.5)",
            }}
          >
            <MicOff size={11} color="#fef5e6" />
          </div>
        )}
      </div>
      <span
        className="max-w-full truncate text-[11px]"
        style={{ color: "#fef5e6", opacity: isMe ? 1 : 0.85, fontWeight: isMe ? 600 : 400 }}
      >
        {nickname}
        {isMe ? " (나)" : ""}
      </span>
    </div>
  );
}
