"use client";

import { Headphones, Mic, MicOff, PhoneOff, Settings } from "lucide-react";

type VoiceControlsProps = {
  muted: boolean;
  onToggleMute: () => void;
  onLeave: () => void;
  /** 마이크 없이 듣기 전용으로 참가한 상태 — 마이크 버튼을 잠근다. */
  listenOnly?: boolean;
  /** 잠긴 마이크 버튼을 눌렀을 때 — 같은 안내를 다시 띄우는 용도. */
  onListenOnlyNotice?: () => void;
  /** 음성 설정 시트 열기. 출력 음량/입력 감도/노이즈 억제가 그 안에 있다. */
  onOpenSettings: () => void;
  settingsOpen: boolean;
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
  listenOnly = false,
  onListenOnlyNotice,
  onOpenSettings,
  settingsOpen,
}: VoiceControlsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-center gap-8">
      {/* 듣기 전용이면 끌 마이크 자체가 없다 — 버튼을 없애는 대신 잠긴
          모습으로 남겨두고(레이아웃 유지) 누르면 이유를 다시 알려준다. */}
      <button
        type="button"
        onClick={listenOnly ? onListenOnlyNotice : onToggleMute}
        aria-label={listenOnly ? "듣기 전용으로 참가 중" : muted ? "음소거 해제" : "음소거"}
        aria-disabled={listenOnly}
        className="group flex flex-col items-center gap-1.5"
      >
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200 group-active:scale-95"
          style={{
            color: "#fef5e6",
            opacity: listenOnly ? 0.45 : 1,
            border: muted || listenOnly
              ? "1px solid rgba(254, 245, 230, 0.4)"
              : "1px solid rgba(254, 245, 230, 0.7)",
            background: listenOnly
              ? "rgba(11, 8, 33, 0.5)"
              : muted ? "rgba(220, 80, 80, 0.35)" : "rgba(11, 8, 33, 0.5)",
            boxShadow: listenOnly
              ? "none"
              : muted ? "0 0 10px rgba(220, 80, 80, 0.3)" : "0 0 8px rgba(254, 245, 230, 0.22)",
          }}
        >
          {listenOnly ? <Headphones size={22} /> : muted ? <MicOff size={22} /> : <Mic size={22} />}
        </span>
        <span className="font-serif text-[9px] tracking-wider" style={{ color: "rgba(254, 245, 230, 0.75)" }}>
          {listenOnly ? "듣기 전용" : muted ? "음소거됨" : "음소거"}
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

        {/* 음성 설정 — 출력 음량/입력 감도/노이즈 억제. 원래 컨트롤 바에
            직접 붙어 있던 음량 슬라이더가 이 시트 안으로 들어갔다. */}
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="음성 설정"
          aria-expanded={settingsOpen}
          className="group flex flex-col items-center gap-1.5"
        >
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200 group-active:scale-95"
            style={{
              color: "#fef5e6",
              border: "1px solid rgba(254, 245, 230, 0.7)",
              background: settingsOpen ? "rgba(255, 199, 133, 0.25)" : "rgba(11, 8, 33, 0.5)",
              boxShadow: "0 0 8px rgba(254, 245, 230, 0.22)",
            }}
          >
            <Settings size={22} />
          </span>
          <span className="font-serif text-[9px] tracking-wider" style={{ color: "rgba(254, 245, 230, 0.75)" }}>
            설정
          </span>
        </button>
      </div>
    </div>
  );
}
