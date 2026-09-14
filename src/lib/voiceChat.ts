// voiceChat.ts
// 보이스방 전용 채팅(voiceRoomChat, 단일 컬렉션 — DM처럼 방 단위 서브
// 컬렉션이 아니라 통화방이 skyisle 하나뿐이라 최상위 컬렉션 하나로 충분)
// 의 타입 + Firestore 헬퍼. dm.ts의 DMMessage와 shape이 거의 동일 — 그
// 파일을 export로 승격하려면 채팅 시스템 쪽을 건드려야 해서(기존 관례 —
// dm.ts 자신의 주석에도 같은 이유로 LinkPreviewCard.tsx 타입을 재선언한
// 전례가 있음), 여기 다시 선언했다. app/components/voice/VoiceChatPanel.tsx
// 가 이 파일을 통해서만 voiceRoomChat Firestore에 접근한다.

import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  limit as fsLimit,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";

export const VOICE_CHAT_COLLECTION = "voiceRoomChat";
export const VOICE_CHAT_MESSAGE_LIMIT = 50;

type VoiceChatLinkPreviewType = "youtube" | "vimeo" | "image" | "opengraph";

type VoiceChatLinkPreview = {
  type: VoiceChatLinkPreviewType;
  url: string;
  title?: string;
  description?: string;
  thumbnail?: string;
  videoId?: string;
};

export type VoiceChatMessage = {
  nickname: string;
  message: string;
  imageUrl?: string;
  imageUrls?: string[];
  fileType?: "image" | "sticker";
  createdAt: Timestamp;
  replyTo?: {
    messageId: string;
    nickname: string;
    snippet: string;
    fileType?: string;
    // 스티커에 답글 달 때 미리보기 썸네일용 — DM(app/dm/[roomId]/page.tsx)
    // replyTo와 동일 필드.
    imageUrl?: string;
  };
  linkPreview?: VoiceChatLinkPreview;
};

export type VoiceChatMessageRow = { id: string; data: VoiceChatMessage };

export function subscribeVoiceChatMessages(
  onChange: (messages: VoiceChatMessageRow[]) => void,
) {
  const q = query(
    collection(db, VOICE_CHAT_COLLECTION),
    orderBy("createdAt", "desc"),
    fsLimit(VOICE_CHAT_MESSAGE_LIMIT),
  );
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, data: d.data() as VoiceChatMessage }));
    rows.reverse(); // 오래된 메시지가 위로 오게 — 렌더는 시간순.
    onChange(rows);
  });
}

export async function sendVoiceChatMessage(
  fields: Omit<VoiceChatMessage, "createdAt">,
): Promise<void> {
  await addDoc(collection(db, VOICE_CHAT_COLLECTION), {
    ...fields,
    createdAt: serverTimestamp(),
  });
}
