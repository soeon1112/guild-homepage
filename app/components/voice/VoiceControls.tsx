"use client";

import { Mic, MicOff, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { VolumeSlider } from "@/app/components/voice/VolumeSlider";
import { VOICE_VOLUME_MAX } from "@/src/lib/voiceVolume";

type VoiceControlsProps = {
  muted: boolean;
  onToggleMute: () => void;
  onLeave: () => void;
  /** 전체 출력 음량(%) — 모든 상대 목소리에 일괄 적용. */
  outputVolume: number;
  onOutputVolumeChange: (volume: number) => void;
};

// Topbar.tsx의 CreamIconButton 시각 톤(cream 테두리 + abyss 반투명 배경)을
// 참고했지만 그 컴포넌트를 직접 import하지 않고 새로 작성 — Topbar.tsx는
// 미접촉 대상(진입점은 Phase 6). 아이콘 아래 라벨은 BottomNav.tsx의
// "아이콘+9px 라벨" 조합과 톤을 맞추기 위한 재작업(D절) — 원형 버튼만
// 있던 Phase 2보다 눌렀을 때 무슨 동작인지 더 명확함.
export function VoiceControls({
  muted,
  onToggleMute,
  onLeave,
  outputVolume,
  onOutputVolumeChange,
}: VoiceControlsProps) {
  const outputMuted = outputVolume === 0;
  return (
    <div className="flex flex-col gap-3">
      {/* 전체 출력 음량 — 마이크 송출(음소거 버튼)과는 완전히 별개로,
          내 스피커로 들리는 상대 목소리 크기만 건드린다. */}
      <div className="flex items-center gap-2.5 px-1">
        <span className="shrink-0" style={{ color: outputMuted ? "rgba(254, 245, 230, 0.45)" : "#fef5e6" }}>
          {outputMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <VolumeSlider
            value={outputVolume}
            max={VOICE_VOLUME_MAX}
            onChange={onOutputVolumeChange}
            ariaLabel="전체 출력 음량"
          />
        </div>
        <span
          className="w-10 shrink-0 text-right font-serif text-[10px] tabular-nums"
          style={{ color: "rgba(254, 245, 230, 0.7)" }}
        >
          {outputVolume}%
        </span>
      </div>

      <div className="flex items-start justify-center gap-8">
      <button type="button" onClick={onToggleMute} aria-label={muted ? "음소거 해제" : "음소거"} className="group flex flex-col items-center gap-1.5">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200 group-active:scale-95"
          style={{
            color: "#fef5e6",
            border: muted ? "1px solid rgba(254, 245, 230, 0.4)" : "1px solid rgba(254, 245, 230, 0.7)",
            background: muted ? "rgba(220, 80, 80, 0.35)" : "rgba(11, 8, 33, 0.5)",
            boxShadow: muted ? "0 0 10px rgba(220, 80, 80, 0.3)" : "0 0 8px rgba(254, 245, 230, 0.22)",
          }}
        >
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </span>
        <span className="font-serif text-[9px] tracking-wider" style={{ color: "rgba(254, 245, 230, 0.75)" }}>
          {muted ? "음소거됨" : "음소거"}
        </span>
      </button>

      <button type="button" onClick={onLeave} aria-label="음성방 나가기" className="group flex flex-col items-center gap-1.5">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200 group-active:scale-95"
          style={{
            color: "#fef5e6",
            border: "1px solid rgba(220, 38, 38, 0.6)",
            background: "rgba(220, 38, 38, 0.6)",
            boxShadow: "0 0 10px rgba(220, 38, 38, 0.35)",
          }}
        >
          <PhoneOff size={22} />
        </span>
        <span className="font-serif text-[9px] tracking-wider" style={{ color: "rgba(254, 245, 230, 0.75)" }}>
          나가기
        </span>
        </button>
      </div>
    </div>
  );
}
