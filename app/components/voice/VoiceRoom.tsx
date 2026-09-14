"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AgoraRTC, { type IAgoraRTCClient, type IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
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
import { ParticipantGrid, type ParticipantGridItem } from "@/app/components/voice/ParticipantGrid";
import { VoiceControls } from "@/app/components/voice/VoiceControls";
import { SPEAKING_VOLUME_THRESHOLD } from "@/app/components/voice/ParticipantCard";

// 앱(dawnlight-app)과 동일 프로젝트(dawnlight-guild)에 배포된 Agora App ID.
// 클라이언트 노출은 Agora 공식 방식(Phase 0 진단 A-4) — Certificate만 서버
// 전용(functions/src/api/agoraToken.ts, Secret Manager).
const AGORA_APP_ID = "16f1acbc49064e1898b97831abf943a1";

type SpeakingLevels = Record<number, number>;

export default function VoiceRoom() {
  const router = useRouter();
  const { nickname: me, ready } = useAuth();

  const [room, setRoom] = useState<VoiceRoomDoc | null>(null);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speakingLevels, setSpeakingLevels] = useState<SpeakingLevels>({});

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const myUidRef = useRef<number | null>(null);

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
    if (me) {
      try {
        await leaveVoiceRoomDoc(me);
      } catch (e) {
        console.error("[VoiceRoom] leaveVoiceRoomDoc 실패", e);
      }
    }
    setJoined(false);
    setMuted(false);
    setSpeakingLevels({});
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
      client.enableAudioVolumeIndicator();

      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "audio") {
          user.audioTrack?.play();
        }
      });

      client.on("volume-indicator", (result) => {
        setSpeakingLevels(() => {
          const next: SpeakingLevels = {};
          for (const r of result) next[r.uid as number] = r.level;
          return next;
        });
      });

      await client.join(AGORA_APP_ID, VOICE_CHANNEL_NAME, token, uid);

      const localTrack = await AgoraRTC.createMicrophoneAudioTrack();
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

  const gridItems: ParticipantGridItem[] = participantEntries.map(([nickname, p]) => {
    const speaking = joined && (speakingLevels[p.uid] ?? 0) > SPEAKING_VOLUME_THRESHOLD;
    return {
      nickname,
      imageUrl: avatarMap.get(nickname)?.imageUrl,
      muted: nickname === me ? muted : p.muted,
      speaking,
      isMe: nickname === me,
    };
  });

  return (
    <div
      className="mx-auto flex h-[calc(100dvh-56px)] w-full max-w-2xl flex-col"
      style={{ background: "var(--twilight-deep, #2a1f4a)" }}
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

      <ParticipantGrid participants={gridItems} emptyLabel="아직 아무도 없습니다" />

      {error && (
        <p className="px-4 pb-2 text-center text-xs" style={{ color: "#ffb5a7" }}>
          {error}
        </p>
      )}

      {joined ? (
        <VoiceControls muted={muted} onToggleMute={handleToggleMute} onLeave={handleLeave} />
      ) : (
        <div className="flex shrink-0 flex-col items-center gap-2 px-4 py-6">
          <button
            type="button"
            onClick={handleJoin}
            disabled={joining}
            className="rounded-full px-8 py-3 text-sm font-semibold transition-all duration-200 disabled:opacity-60"
            style={{
              color: "#2a1f4a",
              background: "#ffc785",
              boxShadow: "0 0 12px rgba(255, 199, 133, 0.45)",
            }}
          >
            {joining ? "연결 중..." : "참가하기"}
          </button>
        </div>
      )}
    </div>
  );
}
