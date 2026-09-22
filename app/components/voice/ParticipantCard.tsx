"use client";

import { useState } from "react";
import { Headphones, MicOff, Volume2, VolumeX } from "lucide-react";
import { VolumeSlider } from "@/app/components/voice/VolumeSlider";
import { VOICE_VOLUME_DEFAULT, VOICE_VOLUME_MAX } from "@/src/lib/voiceVolume";

// 말할 때 프사 테두리에 두르는 글로우 색. spring-green — 디코의 쨍한
// 초록보다 절제됐고 dl2 석양/크림 팔레트와 부딪히지 않음. 발화 감지 자체
// (getVolumeLevel 폴링/임계값)는 VoiceRoom.tsx가 담당 — 이 컴포넌트는
// 이미 계산된 boolean만 받는 순수 표시용.
const SPEAKING_GLOW = "rgba(134, 214, 150, 0.85)";

type ParticipantCardProps = {
  nickname: string;
  imageUrl?: string;
  muted: boolean;
  speaking: boolean;
  isMe?: boolean;
  /** 프사 지름(px). 기본 40 — 왼쪽 참가자 목록(row) 기준. */
  size?: number;
  /** 이 사람의 개별 음량(%). 주어지면 스피커 토글 + 슬라이더가 붙는다. */
  userVolume?: number;
  /** 없으면(참가 전 프리뷰 등) 음량 컨트롤 자체를 렌더하지 않는다. */
  onUserVolumeChange?: (volume: number) => void;
  /** 마이크 없이 듣기 전용으로 참가 중인지 — 마이크 아이콘 대신 헤드셋. */
  listenOnly?: boolean;
};

// 디코 사이드바 스타일 — 원형 프사(글로우 테두리) + 닉네임 + 마이크 상태
// 아이콘을 한 줄로. 이전 라운드의 중앙 그리드(ParticipantGrid.tsx)는 이번
// 재작업에서 좌측 패널의 세로 리스트로 완전히 대체돼 삭제했다.
export function ParticipantCard({
  nickname,
  imageUrl,
  muted,
  speaking,
  isMe = false,
  size = 40,
  userVolume,
  onUserVolumeChange,
  listenOnly = false,
}: ParticipantCardProps) {
  const glowActive = speaking && !muted;
  const ringWidth = Math.max(2, Math.round(size * 0.06));
  const [volumeOpen, setVolumeOpen] = useState(false);
  // 본인 항목에는 음량 컨트롤을 붙이지 않는다 — 자기 목소리는 애초에
  // 로컬 재생되지 않으므로(Agora가 자기 트랙을 되돌려주지 않음) 조절할
  // 대상 자체가 없다.
  const volumeControlEnabled = !isMe && onUserVolumeChange != null;
  const effectiveVolume = userVolume ?? VOICE_VOLUME_DEFAULT;

  return (
    <div className="rounded-xl" style={{ background: isMe ? "rgba(255, 199, 133, 0.10)" : "transparent" }}>
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div
          aria-hidden
          className="absolute -inset-1 rounded-full transition-all duration-150 ease-out"
          style={{
            boxShadow: glowActive
              ? `0 0 0 ${ringWidth}px ${SPEAKING_GLOW}, 0 0 ${size * 0.3}px ${ringWidth * 0.5}px ${SPEAKING_GLOW}`
              : "0 0 0 0 rgba(134, 214, 150, 0)",
          }}
        />
        <div
          className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full"
          style={{
            background: "transparent",
            border: isMe ? "1.5px solid rgba(255, 199, 133, 0.65)" : "1.5px solid rgba(254, 245, 230, 0.4)",
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
            // 통일감만 복제).
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
      </div>
      <span
        className="min-w-0 flex-1 truncate text-[13px]"
        style={{ color: "#fef5e6", opacity: isMe ? 1 : 0.9, fontWeight: isMe ? 600 : 400 }}
      >
        {nickname}
        {isMe ? " (나)" : ""}
      </span>
      {/* 듣기 전용이 음소거보다 우선 — 듣기 전용인 사람은 muted 필드가
          false여도 애초에 말을 못 하므로 헤드셋 하나로 보여주는 게 정확하다. */}
      {listenOnly ? (
        <Headphones size={14} color="rgba(254, 245, 230, 0.55)" className="shrink-0" aria-label="듣기 전용" />
      ) : (
        muted && <MicOff size={14} color="rgba(254, 245, 230, 0.55)" className="shrink-0" />
      )}
      {volumeControlEnabled && (
        <button
          type="button"
          onClick={() => setVolumeOpen((v) => !v)}
          aria-label={`${nickname} 음량 조절`}
          aria-expanded={volumeOpen}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-150"
          style={{
            color: effectiveVolume === 0 ? "rgba(254, 245, 230, 0.45)" : "#ffc785",
            background: volumeOpen ? "rgba(255, 199, 133, 0.18)" : "transparent",
          }}
        >
          {effectiveVolume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      )}
    </div>
    {volumeControlEnabled && volumeOpen && (
      <div className="flex items-center gap-2 px-2 pb-1.5 pl-3">
        <div className="min-w-0 flex-1">
          <VolumeSlider
            value={effectiveVolume}
            max={VOICE_VOLUME_MAX}
            onChange={(v) => onUserVolumeChange?.(v)}
            ariaLabel={`${nickname} 음량`}
          />
        </div>
        <span
          className="w-10 shrink-0 text-right font-serif text-[10px] tabular-nums"
          style={{ color: "rgba(254, 245, 230, 0.7)" }}
        >
          {effectiveVolume}%
        </span>
      </div>
    )}
    </div>
  );
}
