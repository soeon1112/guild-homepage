"use client";

import { collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MemberAvatar } from "@/app/components/redesign/MemberAvatar";
import { useMemberAvatars } from "@/src/lib/useMemberAvatars";
import { sortMembers } from "@/src/lib/sortMembers";
import { roomIdFor } from "@/src/lib/dm";
import { useAuth } from "@/app/components/AuthProvider";
import { db } from "@/src/lib/firebase";

// 새 DM 시작 모달 — Phase 5 (앱 NewDMModal.tsx와 1:1 포트). 길드원
// 선택(본인 포함, E절 자기자신 DM 허용) → roomId 계산 → 대화 화면
// 이동. 방 자체는 여기서 안 만든다 — 지연 생성(D절)이라 [roomId]/
// page.tsx의 ensureRoomExists가 첫 메시지 전송 시 만든다.
//
// sortMembers(src/lib/sortMembers.ts, 길드원 리스트 Phase 2에서 만든
// 유틸)를 재사용 — 길드원 시스템 자체는 미접촉(순수 함수 import만).

const INK = "#5c3a1f";
const INK_SOFT = "#8a6a4a";

export function NewDMModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { nickname: me } = useAuth();
  const [users, setUsers] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        const nicks: string[] = [];
        snap.forEach((d) => {
          const data = d.data();
          // password 필드 존재 = 실제 가입 계정(_orphan 등 시스템/placeholder
          // 문서 배제) — 길드원 목록(Members Phase 2)과 동일한 판별 기준.
          if (typeof data.password === "string") nicks.push(d.id);
        });
        setUsers(nicks);
      } catch (e) {
        console.error("[dm] user list fetch failed", e);
      }
    })();
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = users.filter((n) => n.toLowerCase().includes(q));
    return sortMembers(matched.map((n) => ({ nickname: n }))).map((x) => x.nickname);
  }, [users, query]);

  const avatars = useMemberAvatars(filtered);

  const handleSelect = (partnerNick: string) => {
    if (!me) return;
    const roomId = roomIdFor(me, partnerNick);
    setQuery("");
    onClose();
    // 진단 결과 원인 ③ fix: roomId가 한글(닉네임 기반)이라 인코딩 없이
    // 넣으면 브라우저가 pathname을 퍼센트 인코딩하는데 useParams().roomId는
    // 그걸 그대로(디코딩 없이) 돌려줘 [roomId]/page.tsx가 다른 Firestore
    // 문서(%EC%96%B8...)를 만들어버렸다 — encodeURIComponent로 명시 인코딩.
    router.push(`/dm/${encodeURIComponent(roomId)}?partner=${encodeURIComponent(partnerNick)}`);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(11, 8, 33, 0.55)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-[420px] flex-col gap-3 rounded-[20px] p-4"
        style={{ background: "#fef5e6" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-[15px] font-semibold" style={{ color: INK }}>새 대화</h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="닉네임 검색"
          className="rounded-full px-3.5 py-2 text-[13px] focus:outline-none"
          style={{ background: "#f8f2e8", border: "1px solid rgba(92, 58, 31, 0.2)", color: INK }}
        />
        <div className="flex-1 space-y-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs italic" style={{ color: INK_SOFT }}>검색 결과가 없어요</p>
          ) : (
            filtered.map((nick) => (
              <button
                key={nick}
                type="button"
                onClick={() => handleSelect(nick)}
                className="flex w-full items-center gap-2.5 rounded-xl px-1 py-2 text-left transition-colors hover:bg-[rgba(92,58,31,0.04)]"
              >
                {/* MemberAvatar 미접촉 — 아바타 자체 클릭(개인 공간 이동)
                    비활성화, 버튼 전체가 선택 동작을 담당. */}
                <span style={{ pointerEvents: "none" }}>
                  <MemberAvatar imageUrl={avatars.get(nick)?.imageUrl} nickname={nick} size={36} dl2 />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium" style={{ color: INK }}>
                  {nick === me ? `${nick} (나)` : nick}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
