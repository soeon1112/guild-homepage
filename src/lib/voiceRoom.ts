// voiceRoom.ts
// 하늘섬 공용 통화방(voiceRooms/skyisle, 단일 고정 문서) Firestore I/O +
// nickname → Agora uid 매핑. UI(app/components/voice/*)는 이 파일을 통해서만
// Firestore를 건드린다 — useUnreadDMTotal / dm.ts 와 같은 "business logic는
// src/lib, 렌더는 app/components" 분리 패턴.

import {
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";

export const VOICE_CHANNEL_NAME = "skyisle-public";
const ROOM_DOC_ID = "skyisle";

export type VoiceRoomParticipant = {
  joinedAt: Timestamp | null;
  muted: boolean;
  uid: number;
  /**
   * 듣기 전용 참가 여부. 마이크가 없거나 권한이 거부됐을 때만 true로
   * 기록된다 — 평범한 참가자의 문서에는 이 필드 자체가 없다(기존 참가
   * 경로의 write 페이로드를 한 바이트도 바꾸지 않기 위해 의도적으로
   * optional). 읽는 쪽은 반드시 `=== true` 로 판정할 것.
   */
  listenOnly?: boolean;
};

export type VoiceRoomDoc = {
  channelName: string;
  participants: Record<string, VoiceRoomParticipant>;
  createdAt: Timestamp | null;
  lastActivityAt: Timestamp | null;
};

function roomRef() {
  return doc(db, "voiceRooms", ROOM_DOC_ID);
}

// nickname → 32-bit unsigned Agora uid. FNV-1a 해시 — 브라우저엔 Node
// crypto의 동기 API가 없고(Web Crypto subtle.digest는 비동기라 join 흐름을
// 불필요하게 복잡하게 만듦), 보안 목적이 아니라 "같은 닉네임 → 같은 uid"
// 결정성만 필요하므로 비암호화 해시로 충분(11명 규모 길드라 충돌 가능성
// 무시 가능). 0은 Agora가 "SDK 자동 배정"으로 예약해두므로 [1, 2^31-1]로
// 클램프.
function hashNicknameToUid(nickname: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < nickname.length; i++) {
    hash ^= nickname.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const unsigned = hash >>> 0;
  return (unsigned % 0x7ffffffe) + 1;
}

// users/{nickname}.agoraUid가 없으면 해시로 발급해 채워 넣고 반환.
export async function ensureAgoraUid(nickname: string): Promise<number> {
  const ref = doc(db, "users", nickname);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data().agoraUid : undefined;
  if (typeof existing === "number" && existing > 0) return existing;

  const uid = hashNicknameToUid(nickname);
  await setDoc(ref, { agoraUid: uid }, { merge: true });
  return uid;
}

export function subscribeVoiceRoom(
  onChange: (room: VoiceRoomDoc | null) => void,
): Unsubscribe {
  return onSnapshot(roomRef(), (snap) => {
    onChange(snap.exists() ? (snap.data() as VoiceRoomDoc) : null);
  });
}

// 문서가 없으면(첫 참가자) 생성, 있으면 participants.{nickname}만 갱신.
export async function joinVoiceRoomDoc(
  nickname: string,
  uid: number,
  listenOnly = false,
): Promise<void> {
  const ref = roomRef();
  const snap = await getDoc(ref);
  // listenOnly가 false면 필드를 아예 빼서 기존과 동일한 모양으로 쓴다 —
  // 마이크 있는 사람의 참가 경로가 1바이트도 달라지지 않게 하기 위함.
  const participantEntry = {
    joinedAt: serverTimestamp(),
    muted: false,
    uid,
    ...(listenOnly ? { listenOnly: true } : {}),
  };

  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        channelName: VOICE_CHANNEL_NAME,
        participants: { [nickname]: participantEntry },
        createdAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    await updateDoc(ref, {
      [`participants.${nickname}`]: participantEntry,
      lastActivityAt: serverTimestamp(),
    });
  }
}

export async function leaveVoiceRoomDoc(nickname: string): Promise<void> {
  await updateDoc(roomRef(), {
    [`participants.${nickname}`]: deleteField(),
    lastActivityAt: serverTimestamp(),
  });
}

export async function setVoiceRoomMuted(
  nickname: string,
  muted: boolean,
): Promise<void> {
  await updateDoc(roomRef(), {
    [`participants.${nickname}.muted`]: muted,
  });
}
