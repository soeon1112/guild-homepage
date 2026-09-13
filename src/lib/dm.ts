// dm.ts
// DM(1:1 쪽지) 시스템 — Phase 1: 타입 정의 + roomId 유틸. 사용처 0
// (Phase 2 Cloud Function 트리거, Phase 3 대화 화면에서 소비 예정).
//
// linkPreview 타입은 app/components/LinkPreviewCard.tsx에 동일한 모양이
// 이미 있지만 그 파일 안에 export 없이 로컬로만 선언돼 있다 — 그걸
// export하려면 채팅 컴포넌트 파일을 건드려야 해서(기존 채팅 미접촉)
// 여기 그대로 다시 선언했다. 두 타입은 shape이 100% 동일하니 나중에
// 한쪽을 공유 타입으로 승격해도 무리 없음.

import type { Timestamp } from "firebase/firestore";

type DMLinkPreviewType = "youtube" | "vimeo" | "image" | "opengraph";

type DMLinkPreview = {
  type: DMLinkPreviewType;
  url: string;
  title?: string;
  description?: string;
  thumbnail?: string;
  videoId?: string;
};

// dmRooms/{roomId} 문서.
export type DMRoom = {
  participants: [string, string];
  lastMessage?: string;
  lastMessageAt?: Timestamp;
  lastMessageBy?: string;
  unreadCount: {
    [nickname: string]: number;
  };
  createdAt?: Timestamp;
};

// dmRooms/{roomId}/messages/{messageId} 서브컬렉션 문서.
export type DMMessage = {
  nickname: string;
  message: string;
  imageUrl?: string;
  fileType?: "image" | "sticker";
  createdAt: Timestamp;
  replyTo?: {
    messageId: string;
    nickname: string;
    snippet: string;
    fileType?: string;
  };
  linkPreview?: DMLinkPreview;
};

// 두 닉네임으로 결정적 roomId 생성 — 순서 무관하게 항상 같은 id.
// roomIdFor("언쏘","자카니") === roomIdFor("자카니","언쏘").
// 자기 자신에게 DM(roomIdFor("언쏘","언쏘") === "언쏘_언쏘") 허용 여부는
// Phase 1에서 결정 안 함 — Phase 2/5에서 호출부가 막든지 정함.
export function roomIdFor(a: string, b: string): string {
  const sorted = [a, b].sort((x, y) => x.localeCompare(y));
  return `${sorted[0]}_${sorted[1]}`;
}

// unreadCount 맵에서 특정 닉네임의 안 읽은 수만 안전하게 꺼낸다.
export function getUnreadTotal(
  room: DMRoom | undefined,
  nickname: string,
): number {
  if (!room?.unreadCount) return 0;
  return room.unreadCount[nickname] ?? 0;
}

// participants 튜플에서 "나"의 상대방 닉네임을 찾는다.
export function getPartnerNickname(
  participants: [string, string],
  me: string,
): string {
  return participants[0] === me ? participants[1] : participants[0];
}
