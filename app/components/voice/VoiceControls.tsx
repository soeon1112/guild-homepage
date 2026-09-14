"use client";

import { Mic, MicOff, PhoneOff } from "lucide-react";

type VoiceControlsProps = {
  muted: boolean;
  onToggleMute: () => void;
  onLeave: () => void;
};

// Topbar.tsx의 CreamIconButton 시각 톤(cream 테두리 + abyss 반투명 배경)을
// 참고했지만 그 컴포넌트를 직접 import하지 않고 새로 작성 — Topbar.tsx는
// 이번 Phase 2에서 미접촉 대상(진입점은 Phase 6).
export function VoiceControls({ muted, onToggleMute, onLeave }: VoiceControlsProps) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-4 px-4 py-4">
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted ? "음소거 해제" : "음소거"}
        className="flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200"
        style={{
          color: "#fef5e6",
          border: muted
            ? "1px solid rgba(254, 245, 230, 0.4)"
            : "1px solid rgba(254, 245, 230, 0.7)",
          background: muted ? "rgba(220, 80, 80, 0.35)" : "rgba(11, 8, 33, 0.45)",
          boxShadow: "0 0 8px rgba(254, 245, 230, 0.22)",
        }}
      >
        {muted ? <MicOff size={20} /> : <Mic size={20} />}
      </button>

      <button
        type="button"
        onClick={onLeave}
        aria-label="통화방 나가기"
        className="flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200"
        style={{
          color: "#fef5e6",
          border: "1px solid rgba(220, 38, 38, 0.6)",
          background: "rgba(220, 38, 38, 0.55)",
          boxShadow: "0 0 8px rgba(220, 38, 38, 0.35)",
        }}
      >
        <PhoneOff size={20} />
      </button>
    </div>
  );
}
