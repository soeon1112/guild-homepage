"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, TreePine } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useGuilds } from "@/src/lib/useGuilds";
import { sortMembers } from "@/src/lib/sortMembers";
import { useAuth } from "@/app/components/AuthProvider";
import { MemberRow, type MemberRowData } from "@/app/components/members/MemberRow";
import { MemberSearchBar } from "@/app/components/members/MemberSearchBar";
import { MemberProfileEditModal } from "@/app/components/members/MemberProfileEditModal";

// 길드원 한 줄 목록 — Phase 2. 신규 컴포넌트, 기존 app/members/page.tsx는
// 미접촉. 데이터 fetch는 그 파일의 members+users join 패턴을 그대로
// 따르되 guildId/playTime/tags(Phase 1 신규 필드)를 추가로 읽는다.
// 정렬/검색 결과는 기존 페이지와 동일해야 하므로 users(회원가입 원본,
// password 필드 존재 = 정회원) 기준으로 순회하고 members 존재 여부로
// "빛나는 별"만 표시한다 — "잠든 별" 섹션은 기존 페이지에도 없다.
//
// 편집 모달(Phase 3), 언쏘 A/B 라우팅(Phase 4)은 아직 없음. 이 화면은
// /members-new 임시 라우트로만 접근 가능.

// Phase 2.1 — 카드 톤을 실제 dl2 계열(cream-glass on twilight)로 정정.
// 근거는 MemberRow.tsx 상단 주석 참고. 이 파일의 guildTreeCard/loading/
// empty 텍스트도 같은 이유로 잉크(#5c3a1f)가 아니라 크림 계열을 쓴다 —
// 원래 members/page.tsx dl2 분기와 동일한 값으로 맞춤.
const DL2_SUNSET_GOLD = "#ffc785";
const DL2_CREAM = "#fef5e6";
const DL2_MIST_LAVENDER = "rgba(200, 184, 232, 0.85)";

export function MemberListNewPage() {
  const { nickname: loginNick } = useAuth();
  const guilds = useGuilds();
  const guildById = useMemo(
    () => new Map(guilds.map((g) => [g.id, g])),
    [guilds],
  );

  const [members, setMembers] = useState<MemberRowData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  // Phase 3 — 본인 프사 클릭으로 여는 편집 모달의 대상. null이면 닫힘.
  const [editingMember, setEditingMember] = useState<MemberRowData | null>(
    null,
  );

  const loadMembers = useCallback(async () => {
    try {
      const [membersSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, "members")),
        getDocs(collection(db, "users")),
      ]);

      type MemberData = {
        nickname?: string;
        statusMessage?: string;
        profileImage?: string;
      };
      type UserData = {
        password?: string;
        guildId?: string;
        // Phase 3 — 여러 개 선택 가능하도록 string[]로 변경.
        playTime?: string[];
        tags?: string[];
      };

      const memberByNickname = new Map<
        string,
        { id: string; data: MemberData }
      >();
      membersSnap.forEach((d) => {
        const data = d.data() as MemberData;
        const nick = (data.nickname ?? "").trim();
        if (nick) memberByNickname.set(nick, { id: d.id, data });
      });

      const rows: MemberRowData[] = [];
      usersSnap.forEach((u) => {
        const userData = u.data() as UserData;
        if (typeof userData.password !== "string") return; // junk doc
        const nickname = u.id;
        const hit = memberByNickname.get(nickname);
        if (!hit) return; // 잠든 별 — 기존 페이지와 동일하게 목록 밖
        rows.push({
          nickname,
          memberDocId: hit.id,
          guildId: userData.guildId,
          playTime: userData.playTime,
          tags: userData.tags,
          statusMessage: hit.data.statusMessage || "",
          profileImage: hit.data.profileImage || "",
        });
      });

      setMembers(rows);
      setLoaded(true);
    } catch (e) {
      console.error(e);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // 마운트 시 1회 fetch — loadMembers는 저장 후 재사용을 위해 뽑아낸
    // 함수라 eslint의 set-state-in-effect 규칙이 오탐하지만, Phase 2의
    // 원래 인라인 IIFE와 동작은 동일한 표준 "fetch on mount" 패턴이다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMembers();
  }, [loadMembers]);

  const q = query.trim().toLowerCase();
  const filteredSorted = useMemo(() => {
    const filtered = members.filter((m) =>
      m.nickname.toLowerCase().includes(q),
    );
    return sortMembers(filtered);
  }, [members, q]);

  const hasAnyResult = filteredSorted.length > 0;

  return (
    <div
      className="dl2-members-new relative mx-auto w-full px-4 pt-3"
      style={{ maxWidth: 560 }}
    >
      <Link
        href="/guild-tree"
        className="mb-4 flex items-center gap-3 rounded-xl border px-4 py-3 transition-all hover:scale-[1.01]"
        style={{
          background: "rgba(255, 199, 133, 0.12)",
          borderColor: "rgba(255, 199, 133, 0.35)",
        }}
      >
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: "rgba(255, 199, 133, 0.2)" }}
        >
          <TreePine className="h-4 w-4" style={{ color: DL2_SUNSET_GOLD }} />
        </span>
        <span className="flex-1">
          <span
            className="block text-sm font-semibold leading-tight"
            style={{ color: DL2_CREAM }}
          >
            하늘섬 가계도
          </span>
          <span
            className="mt-0.5 block text-[10px] uppercase tracking-[0.28em]"
            style={{ color: DL2_MIST_LAVENDER }}
          >
            SKY ISLAND · 연합 길드 구성을 한눈에
          </span>
        </span>
        <ChevronRight className="h-4 w-4" style={{ color: DL2_SUNSET_GOLD }} />
      </Link>

      <MemberSearchBar value={query} onChange={setQuery} />

      {!loaded && (
        <p
          className="py-16 text-center text-xs italic"
          style={{ color: "rgba(254, 245, 230, 0.65)" }}
        >
          길드원을 불러오는 중...
        </p>
      )}

      {loaded && !hasAnyResult && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-16 text-center text-sm italic"
          style={{ color: "rgba(254, 245, 230, 0.65)" }}
        >
          찾는 길드원이 보이지 않아요
        </motion.p>
      )}

      {/* Phase 2.7 — 세로 1열 → 2열 그리드(모바일은 1열로 자동 축소).
          카드 내부(MemberRow)는 미접촉, 이 컨테이너 배치만 변경. */}
      <div className="grid grid-cols-1 gap-3 pb-10 md:grid-cols-2">
        {filteredSorted.map((m) => (
          <MemberRow
            key={m.nickname}
            member={m}
            guild={m.guildId ? guildById.get(m.guildId) : undefined}
            isOwnRow={!!loginNick && loginNick === m.nickname}
            onEditPress={() => setEditingMember(m)}
          />
        ))}
      </div>

      <MemberProfileEditModal
        visible={!!editingMember}
        member={editingMember}
        onClose={() => setEditingMember(null)}
        onSaved={loadMembers}
      />
    </div>
  );
}
