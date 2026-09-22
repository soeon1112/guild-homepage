// voiceVolume.ts — 통화방 출력 음량(전체 + 사람별) 상수/영속화.
// dawnlight-app/src/lib/voiceVolume.ts 와 쌍. 값 의미(퍼센트, 기본 100,
// step 5, 닉네임 키)는 양쪽 동일하고, 다른 건 딱 두 가지다:
//   1) 상한 — 웹은 100, 앱은 200. Agora Web SDK의
//      IRemoteAudioTrack.setVolume()은 "The value ranges from 0 (mute) to
//      100 (maximum)"(rtc-sdk_en.d.ts:4302)이고 내부적으로
//      HTMLAudioElement.volume(브라우저가 1.0 하드캡)에 매핑돼 100 초과
//      증폭이 원천적으로 불가능하다. 앱은 react-native-agora의
//      adjustPlaybackSignalVolume/adjustUserPlaybackSignalVolume이 [0,400]
//      이라 200%까지 그대로 나간다.
//   2) 저장소 — 웹 localStorage(동기) / 앱 AsyncStorage(비동기).
// 사람별 음량 키를 uid가 아니라 닉네임으로 잡은 이유: uid는
// users/{nickname}.agoraUid 해시라 지금은 안정적이지만 재발급되면 바뀔 수
// 있고, 사용자에게 의미 있는 식별자는 닉네임이다.

export const VOICE_VOLUME_DEFAULT = 100;
export const VOICE_VOLUME_STEP = 5;

// 웹 상한 — 위 주석 1) 참고. 앱(dawnlight-app)은 200.
export const VOICE_VOLUME_MAX = 100;

const OUTPUT_VOLUME_KEY = "voice:outputVolume";
const USER_VOLUMES_KEY = "voice:userVolumes";

export function clampVoiceVolume(value: number): number {
  if (!Number.isFinite(value)) return VOICE_VOLUME_DEFAULT;
  return Math.min(VOICE_VOLUME_MAX, Math.max(0, Math.round(value)));
}

// 최종 볼륨 = 전체 × 사람별. 웹은 SDK가 곱해주지 않으니(트랙별
// setVolume 하나뿐) 여기서 직접 곱한다 — 앱은 SDK가
// adjustPlaybackSignalVolume(믹스 전체) × adjustUserPlaybackSignalVolume
// (개별 스트림)을 알아서 합성하므로 이 함수가 필요 없다.
export function combineVoiceVolume(outputVolume: number, userVolume: number): number {
  return Math.min(100, Math.max(0, Math.round((outputVolume * userVolume) / 100)));
}

// 아래 4개는 반드시 클라이언트(useEffect 안)에서만 호출할 것 — Provider가
// app/layout.tsx 최상위(서버에서도 렌더)에 마운트돼 있어 렌더 중에
// localStorage를 건드리면 SSR이 죽는다.
export function loadOutputVolume(): number {
  try {
    const raw = localStorage.getItem(OUTPUT_VOLUME_KEY);
    if (raw == null) return VOICE_VOLUME_DEFAULT;
    return clampVoiceVolume(Number(raw));
  } catch {
    return VOICE_VOLUME_DEFAULT;
  }
}

export function saveOutputVolume(volume: number): void {
  try {
    localStorage.setItem(OUTPUT_VOLUME_KEY, String(clampVoiceVolume(volume)));
  } catch {
    /* Safari 프라이빗 모드 등 — 음량은 저장 실패해도 통화에 영향 없음 */
  }
}

export function loadUserVolumes(): Record<string, number> {
  try {
    const raw = localStorage.getItem(USER_VOLUMES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [nickname, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number") out[nickname] = clampVoiceVolume(value);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveUserVolumes(volumes: Record<string, number>): void {
  try {
    localStorage.setItem(USER_VOLUMES_KEY, JSON.stringify(volumes));
  } catch {
    /* 위와 동일 */
  }
}
