"use client";

import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DMRoomListItem } from "@/app/components/dm/DMRoomListItem";
import { NewDMModal } from "@/app/components/dm/NewDMModal";
import { useMemberAvatars } from "@/src/lib/useMemberAvatars";
import { getPartnerNickname, type DMRoom } from "@/src/lib/dm";
import { useAuth } from "@/app/components/AuthProvider";
import { db } from "@/src/lib/firebase";

// DM 목록 화면 — Phase 4 (앱 app/(tabs)/dm/index.tsx와 1:1 포트). 임시
// 접근: 지금은 조건부 없이 누구나 /dm 접속 가능(F절) — 언쏘 A/B는
// Phase 6에서 Topbar 진입점에만 건다.

const INK = "#5c3a1f";
const INK_SOFT = "#8a6a4a";
// mistLavender 톤 — [roomId]/page.tsx의 DM_BG와 동일(D-2, 목록/대화 통일감).
const DM_BG = "rgba(200, 184, 232, 0.15)";

type RoomRow = { id: string; data: DMRoom };

export default function DMListPage() {
  const router = useRouter();
  const { nickname: me } = useAuth();
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [newDMOpen, setNewDMOpen] = useState(false);

  useEffect(() => {
    if (!me) return;
    const q = query(
      collection(db, "dmRooms"),
      where("participants", "array-contains", me),
      orderBy("lastMessageAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setRooms(snap.docs.map((d) => ({ id: d.id, data: d.data() as DMRoom })));
    });
    return unsub;
  }, [me]);

  const partners = useMemo(
    () => (me ? rooms.map((r) => getPartnerNickname(r.data.participants, me)) : []),
    [rooms, me],
  );
  const avatars = useMemberAvatars(partners);

  return (
    <div className="mx-auto flex h-[calc(100dvh-56px)] w-full max-w-2xl flex-col" style={{ background: DM_BG }}>
      <div
        className="flex shrink-0 items-center gap-2.5 px-3 py-2.5"
        style={{ borderBottom: "1px solid rgba(92,58,31,0.10)", background: "rgba(254, 245, 230, 0.9)" }}
      >
        <button type="button" onClick={() => router.back()} aria-label="뒤로가기" className="p-1">
          <ChevronLeft size={22} color={INK} />
        </button>
        <span className="flex-1 text-[15px] font-semibold" style={{ color: INK }}>DM</span>
        <button
          type="button"
          onClick={() => setNewDMOpen(true)}
          aria-label="새 대화 시작"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: "rgba(255, 199, 133, 0.35)" }}
        >
          <Plus size={20} color={INK} />
        </button>
      </div>

      {!me ? null : rooms.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm italic" style={{ color: INK_SOFT }}>대화가 없습니다</p>
        </div>
      ) : (
        <div className="flex-1 divide-y overflow-y-auto" style={{ borderColor: "rgba(92,58,31,0.08)" }}>
          {rooms.map(({ id, data }) => {
            const partner = getPartnerNickname(data.participants, me);
            return (
              <DMRoomListItem
                key={id}
                roomId={id}
                room={data}
                partner={partner}
                avatarImageUrl={avatars.get(partner)?.imageUrl}
                loginNick={me}
              />
            );
          })}
        </div>
      )}

      <NewDMModal visible={newDMOpen} onClose={() => setNewDMOpen(false)} />
    </div>
  );
}
