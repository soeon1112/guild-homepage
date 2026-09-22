"use client";

// VoiceRoom.tsx — Phase 3부터는 순수 UI 컴포넌트다. Agora client/트랙/
// join·leave·toggleMute 로직은 전부 VoiceRoomProvider.tsx(app/layout.tsx
// 최상위 마운트)로 옮겨졌다 — 이 페이지를 벗어나도(다른 페이지로 이동)
// Provider가 살아있는 한 통화가 끊기지 않는다. 이 파일은 useVoiceRoom()
// 으로 상태/액션을 소비하기만 한다.

import { useCallback, useEffect, useRef, useState } from "react";
import { Headphones } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import { useVoiceRoom } from "@/app/components/voice/VoiceRoomProvider";
import { ParticipantPanel, type ParticipantPanelItem } from "@/app/components/voice/ParticipantPanel";
import { VoiceChatPanel } from "@/app/components/voice/VoiceChatPanel";
import { MobileTabs } from "@/app/components/voice/MobileTabs";
import { VoiceControls } from "@/app/components/voice/VoiceControls";
import { VoiceSettingsSheet } from "@/app/components/voice/VoiceSettingsSheet";
import {
  KakaoBrowserNotice,
  useIsKakaoInAppBrowser,
} from "@/app/components/voice/KakaoBrowserNotice";

// BottomNav.tsx가 /voice에서 항상 숨김(early return)이라 그 높이를 클리어할
// 필요가 없다 — 기기 하단 제스처 바/홈 인디케이터용 안전 여백만 남긴다.
const SAFE_BOTTOM_PADDING = "calc(16px + env(safe-area-inset-bottom))";

// 다른 dl2 페이지(app/dm/page.tsx, app/dm/[roomId]/page.tsx)와 동일한
// 폭 — "max-w-2xl"(672px). 배경까지 이 폭에 맞춰 좁혀 DM과 동일하게
// 바깥은 ChromeShell의 twilight 배경이 비친다.
const VOICE_ROOM_MAX_WIDTH = "max-w-2xl";

// FloatingChat.tsx(app/layout.tsx에 전역 마운트)의 FAB 버튼이 z-[100],
// fixed right-4 bottom-96(또는 8)에 56px 원형으로 항상 떠 있다 — 통화방
// 컨트롤이 우하단 쪽에 오면 이 FAB이 물리적으로 겹쳐 클릭을 가로챌 수
// 있어서, 통화방 페이지 전체를 그보다 위 z로 올려 항상 이기게 한다.
const VOICE_ROOM_Z_INDEX = "z-[110]";

// 듣기 전용 안내 문구 — 배너와 (잠긴 마이크 버튼을 눌렀을 때의) 토스트가
// 같은 문장을 쓴다.
const LISTEN_ONLY_MESSAGE = {
  permission: "마이크 권한이 없어 듣기 전용으로 참가했어요",
  "no-device": "마이크를 찾을 수 없어 듣기 전용으로 참가했어요",
} as const;

const LISTEN_ONLY_TOAST_MS = 2600;

export default function VoiceRoom() {
  const router = useRouter();
  const { nickname: me, ready } = useAuth();
  const {
    participantEntries,
    avatarMap,
    joined,
    joining,
    muted,
    error,
    speakingUids,
    listenOnly,
    listenOnlyReason,
    inputLevel,
    inputThreshold,
    setInputThreshold,
    gateOpen,
    noiseSuppression,
    setNoiseSuppression,
    outputVolume,
    setOutputVolume,
    userVolumes,
    setUserVolume,
    join,
    leave,
    toggleMute,
  } = useVoiceRoom();
  const [mobileTab, setMobileTab] = useState<"participants" | "chat">("participants");
  // 카카오톡 인앱 브라우저 안내 — 참가 전 1회. [계속]을 누르면 닫힌다.
  const isKakao = useIsKakaoInAppBrowser();
  const [kakaoNoticeDismissed, setKakaoNoticeDismissed] = useState(false);
  // 잠긴 마이크 버튼을 눌렀을 때 잠깐 뜨는 토스트.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listenOnlyToast, setListenOnlyToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashListenOnlyNotice = useCallback(() => {
    setListenOnlyToast(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setListenOnlyToast(false), LISTEN_ONLY_TOAST_MS);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const listenOnlyMessage = listenOnlyReason ? LISTEN_ONLY_MESSAGE[listenOnlyReason] : null;

  // 로그인 필수 라우트 가드 — app/dm/page.tsx verbatim 패턴. 전체
  // 공개(언쏘 A/B 해제, DM/길드원과 동일 패턴) — 로그인만 필요.
  useEffect(() => {
    if (!ready) return;
    if (!me) {
      router.replace("/");
    }
  }, [ready, me, router]);

  if (!ready || !me) return null;

  const participantItems: ParticipantPanelItem[] = participantEntries.map(([nickname, p]) => ({
    nickname,
    imageUrl: avatarMap.get(nickname)?.imageUrl,
    muted: nickname === me ? muted : p.muted,
    speaking: joined && speakingUids.has(p.uid),
    isMe: nickname === me,
    userVolume: userVolumes[nickname],
    // 본인은 Provider의 실시간 상태가 Firestore보다 빠르다 — 남은 문서값.
    listenOnly: nickname === me ? listenOnly : p.listenOnly === true,
  }));

  return (
    // 고정 레이아웃 — Topbar.tsx가 sticky top-0 56px이라 top:56로 바로
    // 아래부터 화면 끝까지 position:fixed. overflow-hidden이라 콘텐츠가
    // 넘쳐도 페이지 자체는 절대 스크롤되지 않는다. mx-auto + max-w-2xl —
    // DM과 동일 폭, 넓은 화면에서는 좌우로 ChromeShell의 twilight
    // 배경이 비친다.
    <div
      className={`fixed inset-x-0 bottom-0 ${VOICE_ROOM_Z_INDEX} mx-auto flex w-full ${VOICE_ROOM_MAX_WIDTH} flex-col overflow-hidden`}
      style={{
        top: 56,
        background:
          "linear-gradient(180deg, var(--twilight-deep, #2a1f4a) 0%, #241a3f 55%, #1c1530 100%)",
      }}
    >
      <div
        className="flex shrink-0 items-center gap-2.5 px-3 py-2.5"
        style={{ borderBottom: "1px solid rgba(254, 245, 230, 0.14)" }}
      >
        <span className="flex-1 text-[15px] font-semibold" style={{ color: "#fef5e6" }}>
          하늘섬 음성방
        </span>
        <span className="text-xs" style={{ color: "rgba(254, 245, 230, 0.6)" }}>
          {participantEntries.length > 0 ? `${participantEntries.length}명 참가 중` : ""}
        </span>
      </div>

      {error && (
        <p className="shrink-0 px-4 pt-2 text-center text-xs" style={{ color: "#ffb5a7" }}>
          {error}
        </p>
      )}

      {/* 듣기 전용 안내 — 마이크를 못 잡아 목소리 송출 없이 참가한 경우.
          토스트(잠긴 마이크 버튼 탭)도 같은 문구를 재사용한다. */}
      {joined && listenOnly && listenOnlyMessage && (
        <div
          className="mx-4 mt-2 shrink-0 rounded-lg border px-3 py-2 transition-all duration-200"
          style={{
            borderColor: listenOnlyToast ? "rgba(255, 199, 133, 0.9)" : "rgba(255, 199, 133, 0.45)",
            background: "rgba(11, 8, 33, 0.5)",
          }}
        >
          <p className="flex items-center gap-1.5 text-[11px]" style={{ color: "#ffc785" }}>
            <Headphones size={13} />
            {listenOnlyMessage}
          </p>
        </div>
      )}

      {joined && settingsOpen && (
        <VoiceSettingsSheet
          onClose={() => setSettingsOpen(false)}
          outputVolume={outputVolume}
          onOutputVolumeChange={setOutputVolume}
          inputLevel={inputLevel}
          inputThreshold={inputThreshold}
          onInputThresholdChange={setInputThreshold}
          gateOpen={gateOpen}
          noiseSuppression={noiseSuppression}
          onNoiseSuppressionChange={setNoiseSuppression}
          listenOnly={listenOnly}
        />
      )}

      {joined ? (
        // 참가 후 — 디코 스타일 분할. 데스크탑: 좌(참가자+컨트롤) 36% /
        // 우(채팅) 나머지, 항상 동시 노출. 모바일: MobileTabs로 탭
        // 전환(세로 분할은 둘 다 너무 좁아져 비실용적이라 기각), 참가자
        // 탭에서만 하단 고정 컨트롤(채팅 탭은 composer만 — 사용자 지시).
        <>
          <MobileTabs active={mobileTab} onChange={setMobileTab} participantCount={participantEntries.length} />

          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <div
              className={`min-h-0 flex-col md:flex md:w-[36%] md:max-w-sm md:shrink-0 ${
                mobileTab === "participants" ? "flex flex-1" : "hidden"
              }`}
              style={{ borderRight: "1px solid rgba(254, 245, 230, 0.14)" }}
            >
              <ParticipantPanel
                participants={participantItems}
                emptyLabel="아직 아무도 없습니다"
                onUserVolumeChange={setUserVolume}
              />
              {/* 데스크탑 전용 — 좌측 패널 하단에 컨트롤. 모바일은 아래
                  별도 고정 바가 담당(패널이 탭 전환으로 숨을 수 있어서). */}
              <div className="hidden shrink-0 border-t px-4 py-4 md:block" style={{ borderColor: "rgba(254, 245, 230, 0.14)" }}>
                <VoiceControls
                  muted={muted}
                  onToggleMute={toggleMute}
                  onLeave={leave}
                  listenOnly={listenOnly}
                  onListenOnlyNotice={flashListenOnlyNotice}
                  onOpenSettings={() => setSettingsOpen((v) => !v)}
                  settingsOpen={settingsOpen}
                />
              </div>
            </div>

            <div className={`min-h-0 flex-col md:flex md:flex-1 ${mobileTab === "chat" ? "flex flex-1" : "hidden"}`}>
              <VoiceChatPanel me={me} />
            </div>
          </div>

          {mobileTab === "participants" && (
            <div className="shrink-0 px-4 pt-2 md:hidden" style={{ paddingBottom: SAFE_BOTTOM_PADDING }}>
              <VoiceControls
                muted={muted}
                onToggleMute={toggleMute}
                onLeave={leave}
                listenOnly={listenOnly}
                onListenOnlyNotice={flashListenOnlyNotice}
                onOpenSettings={() => setSettingsOpen((v) => !v)}
                settingsOpen={settingsOpen}
              />
            </div>
          )}
        </>
      ) : (
        // 참가 전 — 참가자 프리뷰(컨트롤 없이) + 큰 참가하기 버튼. 채팅은
        // 참가 후에만 노출.
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ParticipantPanel participants={participantItems} emptyLabel="아직 아무도 없습니다" />
          </div>
          <div className="shrink-0 px-4 pt-2" style={{ paddingBottom: SAFE_BOTTOM_PADDING }}>
            {isKakao && !kakaoNoticeDismissed && (
              <KakaoBrowserNotice onContinue={() => setKakaoNoticeDismissed(true)} />
            )}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={join}
                disabled={joining}
                className="rounded-full px-10 py-3.5 text-sm font-semibold transition-all duration-200 disabled:opacity-60"
                style={{
                  color: "#2a1f4a",
                  background: "#ffc785",
                  boxShadow: "0 0 16px rgba(255, 199, 133, 0.5)",
                }}
              >
                {joining ? "연결 중..." : "참가하기"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
