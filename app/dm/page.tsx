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

// DM 목록 화면 — Phase 4 (앱 app/(tabs)/dm/index.tsx와 1:1 포트),
// 전체 공개(언쏘 A/B 하드코딩 제거) 이후 로그인만 필요.

const INK = "#5c3a1f";
const INK_SOFT = "#8a6a4a";
// mistLavender 톤 — [roomId]/page.tsx의 DM_BG와 동일(D-2, 목록/대화 통일감).
const DM_BG = "rgba(200, 184, 232, 0.35)";

type RoomRow = { id: string; data: DMRoom };

export default function DMListPage() {
  const router = useRouter();
  const { nickname: me, ready } = useAuth();
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [newDMOpen, setNewDMOpen] = useState(false);

  // 로그인 필수 라우트 가드 — 앱 dm/index.tsx의 letter.tsx verbatim
  // 패턴과 동일(비로그인이면 홈으로). ready 후에만 판단(세션 복원 전
  // nickname이 일시적으로 null이라 너무 이른 redirect 방지). 전역
  // AuthGuard.tsx(미접촉)가 보통 /login으로 먼저 보내지만, 이 페이지
  // 자체도 독립적으로 안전망을 갖는다.
  useEffect(() => {
    if (ready && !me) {
      router.replace("/");
    }
  }, [ready, me, router]);

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

  // GuildTestBanner/TopHeader 등 verbatim 패턴 — ready 전엔 빈 화면(auth
  // 결정 직후 자동 redirect 또는 본문).
  if (!ready) return null;

  return (
    <div className="mx-auto flex h-[calc(100dvh-56px)] w-full max-w-2xl flex-col" style={{ background: DM_BG }}>
      <div
        className="flex shrink-0 items-center gap-2.5 px-3 py-2.5"
        style={{ borderBottom: "1px solid rgba(92,58,31,0.10)", background: "rgba(254, 245, 230, 0.9)" }}
      >
        <button type="button" onClick={() => router.push("/")} aria-label="뒤로가기" className="p-1">
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
        // 카드형 방 목록(D절) — 각 항목이 불투명 cream 카드가 돼(DMRoomListItem.tsx
        // 참고, WCAG 대비 확보 목적) divide-y 대신 gap+padding으로 카드
        // 사이/좌우 여백에서 mistLavender 배경이 드러나게 한다.
        <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5">
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
