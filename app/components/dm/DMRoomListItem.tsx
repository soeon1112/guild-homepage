"use client";

import { useRouter } from "next/navigation";
import { MemberAvatar } from "@/app/components/redesign/MemberAvatar";
import { getUnreadTotal, type DMRoom } from "@/src/lib/dm";

// DM 목록 한 항목 — Phase 4 (앱 DMRoomListItem.tsx와 1:1 포트).
//
// MemberAvatar 미접촉: 그 컴포넌트는 자체 onClick으로 상대 개인 공간
// 이동을 하는데, 이 행 전체는 DM 대화방으로 이동해야 한다. 안쪽
// (MemberAvatar)에 클릭이 먼저 잡히면 그쪽으로 가버리므로, 아바타를
// pointer-events:none로 감싸 그 자체 클릭을 비활성화(컴포넌트 코드는
// 안 건드림 — 호출부에서 감싸기만) — 그러면 클릭이 바깥 행의
// onClick으로 넘어가 항상 대화방으로 이동한다.

const INK = "#5c3a1f";
const INK_SOFT = "#8a6a4a";
const UNREAD_BADGE_BG = "#dc2626"; // PaperPlaneLetters 위젯과 동일한 빨강

function formatRoomTime(ts?: { toDate: () => Date }): string {
  if (!ts) return "";
  const date = ts.toDate();
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "어제";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

export function DMRoomListItem({
  roomId,
  room,
  partner,
  avatarImageUrl,
  loginNick,
}: {
  roomId: string;
  room: DMRoom;
  partner: string;
  avatarImageUrl: string | undefined;
  loginNick: string;
}) {
  const router = useRouter();
  const unread = getUnreadTotal(room, loginNick);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/dm/${roomId}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") router.push(`/dm/${roomId}`);
      }}
      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-[rgba(92,58,31,0.04)]"
    >
      <div className="relative shrink-0" style={{ pointerEvents: "none" }}>
        <MemberAvatar imageUrl={avatarImageUrl} nickname={partner} size={44} dl2 />
        {unread > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-bold"
            style={{ background: UNREAD_BADGE_BG, color: "#fef5e6" }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-semibold" style={{ color: INK }}>{partner}</p>
        <p className="truncate text-xs" style={{ color: INK_SOFT }}>
          {room.lastMessage || "대화를 시작해보세요"}
        </p>
      </div>
      <span className="shrink-0 text-[10px]" style={{ color: INK_SOFT }}>
        {formatRoomTime(room.lastMessageAt)}
      </span>
    </div>
  );
}
