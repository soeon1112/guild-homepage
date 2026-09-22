"use client";

// VoiceSettingsSheet — 통화방 오디오 설정(디코의 "음성 설정"에 해당).
// 컨트롤 바의 톱니 버튼으로 열고 닫는 패널이다. 여기 들어있는 것:
//   1) 전체 출력 음량 — 원래 컨트롤 바에 직접 붙어 있던 걸 옮겨왔다.
//   2) 입력 감도 — 임계값 슬라이더 + 실시간 입력 레벨 바(임계선 표시).
//   3) 노이즈 억제 토글.
// 사람별 음량은 참가자 목록 각 항목에 그대로 남는다(대상이 사람마다
// 달라서 시트에 모아봐야 오히려 찾기 어려움).
//
// Modal/포털을 쓰지 않고 컨트롤 바 위에 absolute로 띄운다 — 통화방은
// 이미 fixed 레이아웃(z-[110])이라 포털로 빼면 z 관리가 더 복잡해진다.

import { Volume2, VolumeX, X } from "lucide-react";
import { VolumeSlider } from "@/app/components/voice/VolumeSlider";
import {
  VOICE_INPUT_THRESHOLD_MAX,
  VOICE_INPUT_THRESHOLD_STEP,
  VOICE_VOLUME_MAX,
} from "@/src/lib/voiceVolume";

// 레벨 바 색 — 게이트가 열려 송출 중이면 초록, 아니면 회색(디코와 동일).
const LEVEL_OPEN = "#86d696";
const LEVEL_CLOSED = "rgba(254, 245, 230, 0.35)";

type VoiceSettingsSheetProps = {
  onClose: () => void;
  outputVolume: number;
  onOutputVolumeChange: (volume: number) => void;
  inputLevel: number;
  inputThreshold: number;
  onInputThresholdChange: (value: number) => void;
  gateOpen: boolean;
  noiseSuppression: boolean;
  onNoiseSuppressionChange: (enabled: boolean) => void;
  /** 듣기 전용이면 입력 관련 설정은 의미가 없어 잠근다. */
  listenOnly: boolean;
};

export function VoiceSettingsSheet({
  onClose,
  outputVolume,
  onOutputVolumeChange,
  inputLevel,
  inputThreshold,
  onInputThresholdChange,
  gateOpen,
  noiseSuppression,
  onNoiseSuppressionChange,
  listenOnly,
}: VoiceSettingsSheetProps) {
  const levelPct = Math.min(100, (inputLevel / VOICE_INPUT_THRESHOLD_MAX) * 100);
  const thresholdPct = Math.min(100, (inputThreshold / VOICE_INPUT_THRESHOLD_MAX) * 100);
  const outputMuted = outputVolume === 0;

  return (
    <div
      className="absolute inset-x-3 bottom-3 z-10 rounded-xl border p-4 shadow-lg"
      style={{
        borderColor: "rgba(254, 245, 230, 0.2)",
        background: "rgba(28, 21, 48, 0.97)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="mb-3 flex items-center">
        <span className="flex-1 font-serif text-[13px] font-semibold" style={{ color: "#fef5e6" }}>
          음성 설정
        </span>
        <button type="button" onClick={onClose} aria-label="설정 닫기" className="p-1">
          <X size={16} color="rgba(254, 245, 230, 0.7)" />
        </button>
      </div>

      {/* 1) 전체 출력 음량 */}
      <p className="mb-1 font-serif text-[10px] tracking-wider" style={{ color: "rgba(254, 245, 230, 0.55)" }}>
        전체 출력 음량
      </p>
      <div className="mb-4 flex items-center gap-2.5">
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

      {/* 2) 입력 감도 */}
      <p className="mb-1 font-serif text-[10px] tracking-wider" style={{ color: "rgba(254, 245, 230, 0.55)" }}>
        입력 감도
      </p>
      {listenOnly ? (
        <p className="mb-4 text-[11px]" style={{ color: "rgba(254, 245, 230, 0.5)" }}>
          듣기 전용으로 참가 중이라 입력 설정은 사용할 수 없어요
        </p>
      ) : (
        <>
          {/* 실시간 레벨 바 — 임계선(세로 막대)을 넘으면 초록으로 차오른다.
              게이트가 열려 있을 때만 초록이므로 "지금 내 목소리가 나가고
              있는지"를 눈으로 바로 확인할 수 있다. */}
          <div
            className="relative mb-1.5 h-2 w-full overflow-hidden rounded-full"
            style={{ background: "rgba(254, 245, 230, 0.12)" }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100"
              style={{ width: `${levelPct}%`, background: gateOpen ? LEVEL_OPEN : LEVEL_CLOSED }}
            />
            <div
              aria-hidden
              className="absolute inset-y-0 w-0.5"
              style={{ left: `${thresholdPct}%`, background: "#ffc785" }}
            />
          </div>
          <div className="mb-4 flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <VolumeSlider
                value={inputThreshold}
                max={VOICE_INPUT_THRESHOLD_MAX}
                step={VOICE_INPUT_THRESHOLD_STEP}
                onChange={onInputThresholdChange}
                ariaLabel="입력 감도 임계값"
              />
            </div>
            <span
              className="w-10 shrink-0 text-right font-serif text-[10px] tabular-nums"
              style={{ color: "rgba(254, 245, 230, 0.7)" }}
            >
              {Math.round(thresholdPct)}%
            </span>
          </div>
          <p className="-mt-3 mb-4 text-[10px] leading-4" style={{ color: "rgba(254, 245, 230, 0.45)" }}>
            노란 선보다 큰 소리만 상대에게 전달돼요. 숨소리·키보드 소리가 새면 오른쪽으로,
            말이 끊기면 왼쪽으로 옮겨보세요.
          </p>
        </>
      )}

      {/* 3) 노이즈 억제 */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-serif text-[10px] tracking-wider" style={{ color: "rgba(254, 245, 230, 0.55)" }}>
            노이즈 억제
          </p>
          <p className="text-[10px]" style={{ color: "rgba(254, 245, 230, 0.45)" }}>
            선풍기·키보드 같은 배경 소음을 지워요
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={noiseSuppression}
          aria-label="노이즈 억제"
          disabled={listenOnly}
          onClick={() => onNoiseSuppressionChange(!noiseSuppression)}
          className="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40"
          style={{
            background: noiseSuppression ? "#ffc785" : "rgba(254, 245, 230, 0.2)",
          }}
        >
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full transition-all duration-200"
            style={{
              left: noiseSuppression ? 22 : 2,
              background: noiseSuppression ? "#2a1f4a" : "#fef5e6",
            }}
          />
        </button>
      </div>
    </div>
  );
}
