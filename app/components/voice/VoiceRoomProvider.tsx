"use client";

// VoiceRoomProvider — Phase 3. Agora client/localTrack/denoiser 인스턴스와
// join/leave/toggleMute 로직을 VoiceRoom.tsx(페이지 UI)에서 이 Provider로
//옮겼다. app/layout.tsx 최상위에 마운트돼 Next.js App Router의 layout은
// 라우트 이동 시 리마운트되지 않으므로(children만 스왑), 이 Provider의
// state/ref는 /voice를 떠나 다른 페이지로 이동해도 그대로 살아있다 —
// Phase 2까지는 VoiceRoom.tsx가 unmount될 때(다른 페이지로 이동) 스스로
// client.leave()를 호출했는데, 이제 그 effect를 완전히 제거했다: 통화는
// "나가기" 버튼(leave())을 명시적으로 눌러야만 끊긴다.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
// 타입만 import(런타임 0바이트, tsc가 완전히 지운다) — 실제 값(AgoraRTC,
// AIDenoiserExtension)은 join() 안에서 동적 import()로만 불러온다. 이
// Provider는 app/layout.tsx 최상위(서버에서도 렌더)에 마운트되는데, 이
// 두 패키지는 import되는 즉시 top-level에서 window를 건드려 SSR 시
// "window is not defined"로 빌드가 죽는다 — Phase 2까지는 VoiceRoom.tsx
// 가 next/dynamic({ssr:false})로 감싸져 있어 문제가 없었지만, Provider는
// 페이지가 아니라 레이아웃이라 그 우회가 안 통한다.
import type { IAgoraRTCClient, IMicrophoneAudioTrack, IRemoteAudioTrack } from "agora-rtc-sdk-ng";
import type { AIDenoiserProcessor } from "agora-extension-ai-denoiser";
import { useAuth } from "@/app/components/AuthProvider";
import { useMemberAvatars, type MemberAvatarInfo } from "@/src/lib/useMemberAvatars";
import { fetchAgoraToken } from "@/src/lib/getAgoraToken";
import {
  VOICE_VOLUME_DEFAULT,
  clampVoiceVolume,
  combineVoiceVolume,
  loadOutputVolume,
  loadUserVolumes,
  saveOutputVolume,
  saveUserVolumes,
} from "@/src/lib/voiceVolume";
import {
  VOICE_CHANNEL_NAME,
  ensureAgoraUid,
  joinVoiceRoomDoc,
  leaveVoiceRoomDoc,
  setVoiceRoomMuted,
  subscribeVoiceRoom,
  type VoiceRoomDoc,
  type VoiceRoomParticipant,
} from "@/src/lib/voiceRoom";

// 앱(dawnlight-app)과 동일 프로젝트(dawnlight-guild)에 배포된 Agora App ID.
// 클라이언트 노출은 Agora 공식 방식(Phase 0 진단 A-4) — Certificate만 서버
// 전용(functions/src/api/agoraToken.ts, Secret Manager).
const AGORA_APP_ID = "16f1acbc49064e1898b97831abf943a1";

// 발화 감지 — client.on("volume-indicator")는 쓰지 않는다(Phase 2-UX-fix
// 진단: 고정 2초 간격이라 부정확). ILocalAudioTrack/IRemoteAudioTrack.
// getVolumeLevel()(0~1, "0.6 이상이면 발화 중"이 Agora 공식 가이드)을
// 100ms 간격으로 직접 폴링.
const SPEAKING_LEVEL_THRESHOLD = 0.6;
const POLL_INTERVAL_MS = 100;
const SPEAKING_HOLD_MS = 450;

// AI Denoiser 모델(wasm, ~5.8MB) — public/agora-extension-ai-denoiser/
// external/에 수동 복사돼 있음(패키지 버전 올릴 때 재복사 필요).
// registerExtensions는 앱 전체에서 한 번만 호출해야 해서 모듈 스코프
// 지연 싱글톤으로 관리 — 인스턴스 자체는 동적 import 이후에만 만들 수
// 있어 join() 안에서 초기화한다.
let aiDenoiserExtension: InstanceType<
  typeof import("agora-extension-ai-denoiser").AIDenoiserExtension
> | null = null;

type SpeakingHoldMap = Record<number, number>; // uid -> 마지막으로 threshold 넘긴 timestamp(ms)

type VoiceRoomContextValue = {
  room: VoiceRoomDoc | null;
  participantEntries: [string, VoiceRoomParticipant][];
  avatarMap: Map<string, MemberAvatarInfo>;
  joined: boolean;
  joining: boolean;
  muted: boolean;
  error: string | null;
  speakingUids: Set<number>;
  /** 전체 출력 음량(%) — 모든 원격 트랙에 일괄 적용. */
  outputVolume: number;
  setOutputVolume: (volume: number) => void;
  /** 닉네임 → 사람별 음량(%). 없는 닉네임은 기본 100%. */
  userVolumes: Record<string, number>;
  setUserVolume: (nickname: string, volume: number) => void;
  join: () => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => Promise<void>;
};

const VoiceRoomContext = createContext<VoiceRoomContextValue | null>(null);

export function VoiceRoomProvider({ children }: { children: React.ReactNode }) {
  const { nickname: me } = useAuth();

  const [room, setRoom] = useState<VoiceRoomDoc | null>(null);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speakingUids, setSpeakingUids] = useState<Set<number>>(new Set());
  const [outputVolume, setOutputVolumeState] = useState(VOICE_VOLUME_DEFAULT);
  const [userVolumes, setUserVolumesState] = useState<Record<string, number>>({});
  // remoteTracksRef는 ref라 트랙이 들고 나도 리렌더가 나지 않는다 — 새로
  // 입장한 사람에게도 저장된 음량을 자동 적용하려면 "트랙 맵이 바뀌었다"는
  // 신호가 따로 필요해서 카운터를 하나 둔다(아래 적용 effect의 deps).
  const [remoteTrackEpoch, setRemoteTrackEpoch] = useState(0);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const myUidRef = useRef<number | null>(null);
  const remoteTracksRef = useRef<Map<number, IRemoteAudioTrack>>(new Map());
  const lastLoudAtRef = useRef<SpeakingHoldMap>({});
  const denoiserProcessorRef = useRef<AIDenoiserProcessor | null>(null);

  // voiceRooms/skyisle 실시간 구독 — Provider가 앱 최상위에서 항상
  // 마운트돼 있으니 로그인 여부/현재 페이지와 무관하게 항상 켜둔다
  // (Floating widget이 다른 페이지에서도 참가자 수를 알아야 해서).
  useEffect(() => {
    const unsub = subscribeVoiceRoom(setRoom);
    return unsub;
  }, []);

  // localStorage 복원 — 렌더 중이 아니라 mount effect에서만 읽는다(이
  // Provider는 app/layout.tsx 최상위라 서버에서도 렌더된다).
  useEffect(() => {
    setOutputVolumeState(loadOutputVolume());
    setUserVolumesState(loadUserVolumes());
  }, []);

  const setOutputVolume = useCallback((volume: number) => {
    const next = clampVoiceVolume(volume);
    setOutputVolumeState(next);
    saveOutputVolume(next);
  }, []);

  const setUserVolume = useCallback((nickname: string, volume: number) => {
    setUserVolumesState((prev) => {
      const next = { ...prev, [nickname]: clampVoiceVolume(volume) };
      saveUserVolumes(next);
      return next;
    });
  }, []);

  const participantEntries: [string, VoiceRoomParticipant][] = room
    ? Object.entries(room.participants ?? {})
    : [];
  const avatarMap = useMemberAvatars(participantEntries.map(([nickname]) => nickname));

  // 음량 적용 — 웹 SDK에는 "전체 출력" API가 없고 트랙별
  // IRemoteAudioTrack.setVolume() 하나뿐이라, 전체 × 사람별을 여기서 직접
  // 곱해 각 트랙에 내려준다. room이 deps에 있어서 누가 새로 들어오거나
  // 나가도(Firestore 문서 갱신) 다시 돌고, remoteTrackEpoch 덕에 실제
  // 트랙 구독 시점에도 다시 돈다 — 재입장/재접속 복원이 이 두 신호로 커버된다.
  // uid→닉네임 역매핑이 필요한 이유는 저장 키가 닉네임이기 때문(uid는
  // 해시 재발급 시 바뀔 수 있음).
  useEffect(() => {
    const uidToNickname = new Map<number, string>();
    for (const [nickname, p] of Object.entries(room?.participants ?? {})) {
      uidToNickname.set(p.uid, nickname);
    }
    for (const [uid, track] of remoteTracksRef.current) {
      const nickname = uidToNickname.get(uid);
      const perUser = nickname != null ? userVolumes[nickname] ?? VOICE_VOLUME_DEFAULT : VOICE_VOLUME_DEFAULT;
      try {
        track.setVolume(combineVoiceVolume(outputVolume, perUser));
      } catch (e) {
        console.error("[VoiceRoomProvider] setVolume 실패", uid, e);
      }
    }
  }, [outputVolume, userVolumes, remoteTrackEpoch, room]);

  // 발화 감지 폴링 — join 중일 때만 동작.
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

  const leave = useCallback(async () => {
    const client = clientRef.current;
    const localTrack = localTrackRef.current;
    if (denoiserProcessorRef.current) {
      try {
        await denoiserProcessorRef.current.destroy();
      } catch (e) {
        console.error("[VoiceRoomProvider] AI Denoiser destroy 실패", e);
      }
      denoiserProcessorRef.current = null;
    }
    try {
      localTrack?.close();
      if (client) {
        await client.leave();
      }
    } catch (e) {
      console.error("[VoiceRoomProvider] leave 중 오류", e);
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
        console.error("[VoiceRoomProvider] leaveVoiceRoomDoc 실패", e);
      }
    }
    setJoined(false);
    setMuted(false);
    setSpeakingUids(new Set());
  }, [me]);

  // Phase 2까지 있었던 "컴포넌트 unmount 시 best-effort leave" effect는
  // 여기서 완전히 제거했다 — Provider는 앱 최상위에 딱 한 번 마운트되고
  // 페이지 이동으로는 절대 unmount되지 않으므로 그런 effect 자체가
  // 무의미해졌고(오히려 있으면 진짜 앱 종료 시점에만 뒤늦게 발동해
  // Firestore 유령 참가자를 오히려 늦게 지우는 꼴), 통화는 오직
  // "나가기" 버튼(leave() 명시 호출)으로만 끊긴다(Phase 3 요구사항).
  // 브라우저 탭을 그냥 닫는 경우(beforeunload)의 방어는 여전히 known
  // gap — 다음 라운드로 남겨둠.

  const join = useCallback(async () => {
    if (!me || joining || joined) return;
    setError(null);
    setJoining(true);
    try {
      // 동적 import — 브라우저 전용 SDK 두 개를 실제로 참가하는 시점
      // (버튼 클릭, 항상 클라이언트)에만 불러온다. registerExtensions는
      // 앱 생애주기당 한 번만 호출해야 해서 모듈 스코프 플래그로 가드.
      const [{ default: AgoraRTC }, { AIDenoiserExtension }] = await Promise.all([
        import("agora-rtc-sdk-ng"),
        import("agora-extension-ai-denoiser"),
      ]);
      if (!aiDenoiserExtension) {
        aiDenoiserExtension = new AIDenoiserExtension({
          assetsPath: "/agora-extension-ai-denoiser/external",
        });
        AgoraRTC.registerExtensions([aiDenoiserExtension]);
      }

      const uid = await ensureAgoraUid(me);
      const { token } = await fetchAgoraToken(VOICE_CHANNEL_NAME, uid);

      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "audio" && user.audioTrack) {
          user.audioTrack.play();
          remoteTracksRef.current.set(user.uid as number, user.audioTrack);
          // 저장된 음량을 이 트랙에도 적용하도록 적용 effect를 깨운다
          // (이 핸들러는 join 시점 클로저라 최신 음량 state를 직접 못 읽는다).
          setRemoteTrackEpoch((e) => e + 1);
        }
      });
      client.on("user-unpublished", (user, mediaType) => {
        if (mediaType === "audio") {
          remoteTracksRef.current.delete(user.uid as number);
          setRemoteTrackEpoch((e) => e + 1);
        }
      });
      client.on("user-left", (user) => {
        remoteTracksRef.current.delete(user.uid as number);
        setRemoteTrackEpoch((e) => e + 1);
      });

      await client.join(AGORA_APP_ID, VOICE_CHANNEL_NAME, token, uid);

      // AEC(에코 제거)/ANS(노이즈 억제)/AGC(자동 게인) 명시 활성 +
      // speech_standard(32kHz/모노/24Kbps) 프리셋.
      const localTrack = await AgoraRTC.createMicrophoneAudioTrack({
        AEC: true,
        ANS: true,
        AGC: true,
        encoderConfig: "speech_standard",
      });

      // AI Denoiser — 브라우저 미지원이면 checkCompatibility()가 false를
      // 반환하므로 조용히 건너뛰고 원본(AEC/ANS/AGC 적용) 트랙으로 계속.
      try {
        if (aiDenoiserExtension.checkCompatibility()) {
          const processor = aiDenoiserExtension.createProcessor();
          processor.on("pipeerror", (err: Error) => {
            console.error("[VoiceRoomProvider] AI Denoiser pipe 실패, 원본 오디오로 폴백", err);
            processor.unpipe();
            localTrack.unpipe();
            localTrack.pipe(localTrack.processorDestination);
          });
          localTrack.pipe(processor).pipe(localTrack.processorDestination);
          await processor.enable();
          denoiserProcessorRef.current = processor;
        }
      } catch (e) {
        console.error("[VoiceRoomProvider] AI Denoiser 초기화 실패, 원본 오디오로 진행", e);
      }

      await client.publish([localTrack]);

      clientRef.current = client;
      localTrackRef.current = localTrack;
      myUidRef.current = uid;

      await joinVoiceRoomDoc(me, uid);
      setJoined(true);
    } catch (e) {
      console.error("[VoiceRoomProvider] 참가 실패", e);
      setError(
        e instanceof Error && e.message.toLowerCase().includes("permission")
          ? "마이크 권한이 필요합니다. 브라우저 설정에서 마이크 접근을 허용해주세요."
          : "음성방 참가에 실패했습니다. 잠시 후 다시 시도해주세요.",
      );
      if (denoiserProcessorRef.current) {
        void denoiserProcessorRef.current.destroy().catch(() => {});
        denoiserProcessorRef.current = null;
      }
      localTrackRef.current?.close();
      clientRef.current = null;
      localTrackRef.current = null;
    } finally {
      setJoining(false);
    }
  }, [me, joining, joined]);

  const toggleMute = useCallback(async () => {
    const localTrack = localTrackRef.current;
    if (!localTrack || !me) return;
    const next = !muted;
    await localTrack.setEnabled(!next);
    setMuted(next);
    try {
      await setVoiceRoomMuted(me, next);
    } catch (e) {
      console.error("[VoiceRoomProvider] mute 동기화 실패", e);
    }
  }, [muted, me]);

  return (
    <VoiceRoomContext.Provider
      value={{
        room,
        participantEntries,
        avatarMap,
        joined,
        joining,
        muted,
        error,
        speakingUids,
        outputVolume,
        setOutputVolume,
        userVolumes,
        setUserVolume,
        join,
        leave,
        toggleMute,
      }}
    >
      {children}
    </VoiceRoomContext.Provider>
  );
}

export function useVoiceRoom(): VoiceRoomContextValue {
  const ctx = useContext(VoiceRoomContext);
  if (!ctx) throw new Error("useVoiceRoom must be used within VoiceRoomProvider");
  return ctx;
}
