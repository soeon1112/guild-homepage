"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AgoraRTC, {
  type IAgoraRTCClient,
  type IMicrophoneAudioTrack,
  type IRemoteAudioTrack,
} from "agora-rtc-sdk-ng";
import { useAuth } from "@/app/components/AuthProvider";
import { useMemberAvatars } from "@/src/lib/useMemberAvatars";
import { fetchAgoraToken } from "@/src/lib/getAgoraToken";
import {
  VOICE_CHANNEL_NAME,
  ensureAgoraUid,
  joinVoiceRoomDoc,
  leaveVoiceRoomDoc,
  setVoiceRoomMuted,
  subscribeVoiceRoom,
  type VoiceRoomDoc,
} from "@/src/lib/voiceRoom";
import { ParticipantPanel, type ParticipantPanelItem } from "@/app/components/voice/ParticipantPanel";
import { VoiceChatPanel } from "@/app/components/voice/VoiceChatPanel";
import { MobileTabs } from "@/app/components/voice/MobileTabs";
import { VoiceControls } from "@/app/components/voice/VoiceControls";

// 앱(dawnlight-app)과 동일 프로젝트(dawnlight-guild)에 배포된 Agora App ID.
// 클라이언트 노출은 Agora 공식 방식(Phase 0 진단 A-4) — Certificate만 서버
// 전용(functions/src/api/agoraToken.ts, Secret Manager).
const AGORA_APP_ID = "16f1acbc49064e1898b97831abf943a1";

// 발화 감지 — client.on("volume-indicator")는 쓰지 않는다. Agora 공식
// 문서(enableAudioVolumeIndicator) 확인 결과 이 이벤트는 고정 2초
// 간격이고 파라미터로 줄일 수 없다 — 대화 중 2초보다 짧은 숨 고르기에도
// "계속 켜진 것처럼" 보이는 게 이번 버그의 실제 원인이었다. 대신 공식
// 문서가 실시간 미터링용으로 권장하는 ILocalAudioTrack/IRemoteAudioTrack.
// getVolumeLevel()(0~1, "0.6 이상이면 발화 중"이 공식 가이드 문구)을
// 100ms 간격으로 직접 폴링한다.
const SPEAKING_LEVEL_THRESHOLD = 0.6;
const POLL_INTERVAL_MS = 100;
// 폴링 스냅샷 사이 순간적으로 threshold 아래로 떨어지는 것(단어 사이
// 숨 고르기 등)만으로 글로우가 깜빡이지 않게 하는 유예 시간.
const SPEAKING_HOLD_MS = 450;

// BottomNav.tsx가 이제 /voice에서 항상 숨김(early return)이라 더 이상
// 그 높이를 클리어할 필요가 없다 — 기기 하단 제스처 바/홈 인디케이터용
// 안전 여백만 남긴다.
const SAFE_BOTTOM_PADDING = "calc(16px + env(safe-area-inset-bottom))";

// 다른 dl2 페이지(app/dm/page.tsx, app/dm/[roomId]/page.tsx)와 동일한
// 폭 — "max-w-2xl"(672px). 배경까지 이 폭에 맞춰 좁혀 DM과 동일하게
// 바깥은 ChromeShell의 twilight 배경이 비친다.
const VOICE_ROOM_MAX_WIDTH = "max-w-2xl";

// FloatingChat.tsx(app/layout.tsx에 전역 마운트)의 FAB 버튼이 z-[100],
// fixed right-4 bottom-96(또는 8)에 56px 원형으로 항상 떠 있다 — 통화방
// 컨트롤(나가기/전송 등)이 우하단 쪽에 오면 이 FAB이 물리적으로 겹쳐
// 클릭을 가로챌 수 있다(이번 "클릭 안 됨" 버그의 유력 원인). FloatingChat
// 자체는 미접촉 대상이라, 통화방 페이지 전체를 그보다 위 z로 올려 이
// 페이지에 있는 동안은 통화방 컨트롤이 항상 이긴다.
const VOICE_ROOM_Z_INDEX = "z-[110]";

type SpeakingHoldMap = Record<number, number>; // uid -> 마지막으로 threshold 넘긴 timestamp(ms)

export default function VoiceRoom() {
  const router = useRouter();
  const { nickname: me, ready } = useAuth();

  const [room, setRoom] = useState<VoiceRoomDoc | null>(null);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speakingUids, setSpeakingUids] = useState<Set<number>>(new Set());
  const [mobileTab, setMobileTab] = useState<"participants" | "chat">("participants");

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const myUidRef = useRef<number | null>(null);
  const remoteTracksRef = useRef<Map<number, IRemoteAudioTrack>>(new Map());
  const lastLoudAtRef = useRef<SpeakingHoldMap>({});

  // 로그인 필수 라우트 가드 — app/dm/page.tsx verbatim 패턴.
  useEffect(() => {
    if (ready && !me) {
      router.replace("/");
    }
  }, [ready, me, router]);

  // voiceRooms/skyisle 실시간 구독 — 참가 여부와 무관하게 항상 켜둬서
  // 참가 전 프리뷰(G-1)와 참가 중 실시간 목록(H-1)을 같은 상태로 그린다.
  useEffect(() => {
    const unsub = subscribeVoiceRoom(setRoom);
    return unsub;
  }, []);

  const participantEntries = room ? Object.entries(room.participants ?? {}) : [];
  const avatarMap = useMemberAvatars(participantEntries.map(([nickname]) => nickname));

  // 발화 감지 폴링 — join 중일 때만 동작. localTrack + 구독된 remote
  // 트랙들의 getVolumeLevel()을 100ms마다 읽어 hold map을 갱신하고,
  // hold 유예 안에 있는 uid 집합만 "말하는 중"으로 커밋한다.
  useEffect(() => {
    if (!joined) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const localTrack = localTrackRef.current;
      const myUid = myUidRef.current;
      if (localTrack && myUid != null) {
        if (localTrack.getVolumeLevel() > SPEAKING_LEVEL_THRESHOLD) {
          lastLoudAtRef.current[myUid] = now;
        }
      }
      for (const [uid, track] of remoteTracksRef.current) {
        if (track.getVolumeLevel() > SPEAKING_LEVEL_THRESHOLD) {
          lastLoudAtRef.current[uid] = now;
        }
      }
      const next = new Set<number>();
      for (const [uidStr, ts] of Object.entries(lastLoudAtRef.current)) {
        if (now - ts < SPEAKING_HOLD_MS) next.add(Number(uidStr));
      }
      setSpeakingUids(next);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [joined]);

  const handleLeave = useCallback(async () => {
    const client = clientRef.current;
    const localTrack = localTrackRef.current;
    try {
      localTrack?.close();
      if (client) {
        await client.leave();
      }
    } catch (e) {
      console.error("[VoiceRoom] leave 중 오류", e);
    }
    clientRef.current = null;
    localTrackRef.current = null;
    myUidRef.current = null;
    remoteTracksRef.current.clear();
    lastLoudAtRef.current = {};
    if (me) {
      try {
        await leaveVoiceRoomDoc(me);
      } catch (e) {
        console.error("[VoiceRoom] leaveVoiceRoomDoc 실패", e);
      }
    }
    setJoined(false);
    setMuted(false);
    setSpeakingUids(new Set());
  }, [me]);

  // 페이지 이탈(뒤로가기/다른 링크 클릭)로 컴포넌트가 언마운트될 때도
  // 참가자 문서에 유령으로 안 남게 best-effort 정리. 탭을 그냥 닫는
  // 경우(beforeunload)까지의 완전한 방어는 Phase 3(floating widget, 세션
  // 수명 관리)에서 다룰 예정 — Phase 2는 known gap으로 남겨둠.
  useEffect(() => {
    return () => {
      if (clientRef.current || localTrackRef.current) {
        void handleLeave();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoin = useCallback(async () => {
    if (!me || joining || joined) return;
    setError(null);
    setJoining(true);
    try {
      const uid = await ensureAgoraUid(me);
      const { token } = await fetchAgoraToken(VOICE_CHANNEL_NAME, uid);

      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "audio" && user.audioTrack) {
          user.audioTrack.play();
          remoteTracksRef.current.set(user.uid as number, user.audioTrack);
        }
      });
      client.on("user-unpublished", (user, mediaType) => {
        if (mediaType === "audio") {
          remoteTracksRef.current.delete(user.uid as number);
        }
      });
      client.on("user-left", (user) => {
        remoteTracksRef.current.delete(user.uid as number);
      });

      await client.join(AGORA_APP_ID, VOICE_CHANNEL_NAME, token, uid);

      // AEC(에코 제거)/ANS(노이즈 억제)/AGC(자동 게인)는 SDK가 기본으로도
      // 켜주긴 하지만 명시적으로 선언해 의도를 고정 — speech_standard는
      // 32kHz/모노/24Kbps로 노이즈 억제가 특히 잘 드러나는 음성 통화용
      // 프리셋(SDK 공식 문서 기준, 기본 speech_low_quality의 16kHz보다
      // 한 단계 위).
      const localTrack = await AgoraRTC.createMicrophoneAudioTrack({
        AEC: true,
        ANS: true,
        AGC: true,
        encoderConfig: "speech_standard",
      });
      await client.publish([localTrack]);

      clientRef.current = client;
      localTrackRef.current = localTrack;
      myUidRef.current = uid;

      await joinVoiceRoomDoc(me, uid);
      setJoined(true);
    } catch (e) {
      console.error("[VoiceRoom] 참가 실패", e);
      setError(
        e instanceof Error && e.message.toLowerCase().includes("permission")
          ? "마이크 권한이 필요합니다. 브라우저 설정에서 마이크 접근을 허용해주세요."
          : "통화방 참가에 실패했습니다. 잠시 후 다시 시도해주세요.",
      );
      localTrackRef.current?.close();
      clientRef.current = null;
      localTrackRef.current = null;
    } finally {
      setJoining(false);
    }
  }, [me, joining, joined]);

  const handleToggleMute = useCallback(async () => {
    const localTrack = localTrackRef.current;
    if (!localTrack || !me) return;
    const next = !muted;
    await localTrack.setEnabled(!next);
    setMuted(next);
    try {
      await setVoiceRoomMuted(me, next);
    } catch (e) {
      console.error("[VoiceRoom] mute 동기화 실패", e);
    }
  }, [muted, me]);

  if (!ready || !me) return null;

  const participantItems: ParticipantPanelItem[] = participantEntries.map(([nickname, p]) => ({
    nickname,
    imageUrl: avatarMap.get(nickname)?.imageUrl,
    muted: nickname === me ? muted : p.muted,
    speaking: joined && speakingUids.has(p.uid),
    isMe: nickname === me,
  }));

  return (
    // 고정 레이아웃(C절) — Topbar.tsx가 sticky top-0 56px이라 top:56로
    // 바로 아래부터 화면 끝까지 position:fixed. overflow-hidden이라
    // 콘텐츠가 넘쳐도 페이지 자체는 절대 스크롤되지 않는다. mx-auto +
    // max-w-2xl — DM(app/dm/page.tsx 등)과 동일 폭, 넓은 화면에서는
    // 좌우로 ChromeShell의 twilight 배경이 비친다. BottomNav는 이제
    // /voice에서 완전히 숨김(BottomNav.tsx early return)이라 그 높이를
    // 더 이상 신경 쓸 필요 없음 — z-index는 FloatingChat FAB(z-[100])
    // 보다 위로만 고정.
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
          하늘섬 통화방
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

      {joined ? (
        // 참가 후 — 디코 스타일 분할(C/D절). 데스크탑: 좌(참가자+컨트롤)
        // 35~40% / 우(채팅) 나머지, 항상 동시 노출. 모바일: MobileTabs로
        // 탭 전환(D-3, 세로 분할은 둘 다 너무 좁아져 비실용적이라 기각),
        // 컨트롤만은 탭 무관하게 하단 고정(F-1) — 채팅 탭에서도 나가기/
        // 음소거는 항상 눌러야 하므로.
        <>
          <MobileTabs active={mobileTab} onChange={setMobileTab} participantCount={participantEntries.length} />

          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <div
              className={`min-h-0 flex-col md:flex md:w-[36%] md:max-w-sm md:shrink-0 ${
                mobileTab === "participants" ? "flex flex-1" : "hidden"
              }`}
              style={{ borderRight: "1px solid rgba(254, 245, 230, 0.14)" }}
            >
              <ParticipantPanel participants={participantItems} emptyLabel="아직 아무도 없습니다" />
              {/* 데스크탑 전용 — 좌측 패널 하단에 컨트롤(C-1). 모바일은
                  아래 별도 고정 바가 담당(패널이 탭 전환으로 숨을 수
                  있어서). */}
              <div className="hidden shrink-0 border-t px-4 py-4 md:block" style={{ borderColor: "rgba(254, 245, 230, 0.14)" }}>
                <VoiceControls muted={muted} onToggleMute={handleToggleMute} onLeave={handleLeave} />
              </div>
            </div>

            <div className={`min-h-0 flex-col md:flex md:flex-1 ${mobileTab === "chat" ? "flex flex-1" : "hidden"}`}>
              <VoiceChatPanel me={me} />
            </div>
          </div>

          {/* 모바일 전용 — 탭과 무관하게 항상 보이는 하단 고정 컨트롤.
              BottomNav가 이제 항상 숨김이라 기기 안전 여백만 확보. */}
          <div className="shrink-0 px-4 pt-2 md:hidden" style={{ paddingBottom: SAFE_BOTTOM_PADDING }}>
            <VoiceControls muted={muted} onToggleMute={handleToggleMute} onLeave={handleLeave} />
          </div>
        </>
      ) : (
        // 참가 전(G절) — 참가자 프리뷰(컨트롤 없이) + 큰 참가하기 버튼.
        // 채팅은 참가 후에만 노출(G-2).
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ParticipantPanel participants={participantItems} emptyLabel="아직 아무도 없습니다" />
          </div>
          <div className="shrink-0 px-4 pt-2" style={{ paddingBottom: SAFE_BOTTOM_PADDING }}>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleJoin}
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
