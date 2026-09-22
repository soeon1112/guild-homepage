"use client";

// VolumeSlider — 통화방 음량 슬라이더. <input type="range">를 쓰지 않고
// div + Pointer Events로 직접 그린 이유는 두 가지다:
//   1) range의 thumb/track은 ::-webkit-slider-thumb 같은 벤더 의사요소로만
//      스타일링되는데, globals.css는 Tailwind v4의 @layer 캐스케이드 함정이
//      있어(utility가 @layer utilities 안으로 들어가 unlayered 룰에 짐)
//      전역 CSS를 새로 추가하지 않고는 dl2 톤을 확실히 못 박는다.
//   2) dawnlight-app 쪽은 PanResponder로 같은 모양을 그려야 해서, 양쪽을
//      동일한 형상 스펙(track 6px / thumb 24px / step 5%)으로 맞추려면
//      네이티브 위젯보다 직접 그리는 쪽이 어긋날 여지가 없다.
// thumb 24px는 모바일 터치 타겟 요구치(≥24px) — 트랙은 6px로 얇게 두고
// 감싸는 행 전체(32px)를 히트 존으로 쓴다.

import { useCallback, useRef } from "react";
import { VOICE_VOLUME_STEP } from "@/src/lib/voiceVolume";

const TRACK_HEIGHT = 6;
const THUMB_SIZE = 24;
const ROW_HEIGHT = 32;

type VolumeSliderProps = {
  value: number;
  max: number;
  onChange: (value: number) => void;
  ariaLabel: string;
};

export function VolumeSlider({ value, max, onChange, ariaLabel }: VolumeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      const nextRatio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const stepped = Math.round((nextRatio * max) / VOICE_VOLUME_STEP) * VOICE_VOLUME_STEP;
      onChange(Math.min(max, Math.max(0, stepped)));
    },
    [max, onChange],
  );

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value}%`}
      className="relative flex w-full cursor-pointer touch-none select-none items-center"
      style={{ height: ROW_HEIGHT }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        updateFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        // buttons 비트마스크가 0이면 드래그 중이 아님 — 단순 호버로
        // 음량이 바뀌는 사고를 막는다.
        if (e.buttons !== 0) updateFromClientX(e.clientX);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          onChange(Math.max(0, value - VOICE_VOLUME_STEP));
        } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          onChange(Math.min(max, value + VOICE_VOLUME_STEP));
        }
      }}
    >
      <div
        className="w-full rounded-full"
        style={{ height: TRACK_HEIGHT, background: "rgba(254, 245, 230, 0.18)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          left: 0,
          height: TRACK_HEIGHT,
          width: `${ratio * 100}%`,
          background: "#ffc785",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          // 0%/100%에서 thumb이 트랙 밖으로 삐져나가지 않도록 좌우 끝에서
          // 반지름만큼 안쪽으로 보정.
          left: `calc(${ratio * 100}% - ${ratio * THUMB_SIZE}px)`,
          background: "#ffc785",
          border: "1px solid rgba(42, 31, 74, 0.35)",
          boxShadow: "0 0 8px rgba(255, 199, 133, 0.45)",
        }}
      />
    </div>
  );
}
