"use client";

import { motion } from "framer-motion";
import { MemberAvatar } from "@/app/components/redesign/MemberAvatar";
import { useUserMbti } from "@/src/lib/userMbti";
import { guildAccent, type Guild } from "@/src/lib/useGuilds";
import { getTagColor } from "@/src/lib/memberTags";

// 길드원 한 줄 목록 — 2줄 카드 한 항목 (Phase 2.1 재디자인).
//
// 카드 톤은 발명하지 않고 실제 dl2 카드 계열 중 "cream-glass on twilight"
// 를 그대로 가져왔다 — 이 계열은 앱 전역 배경(어두운 twilight 그라디언트,
// dawnlight-app/src/components/dawnlight2/GlobalBackground.tsx)이 카드
// 뒤로 비치는 걸 전제로 하기 때문에 텍스트는 잉크(#5c3a1f)가 아니라
// 크림(#fef5e6) 계열이어야 읽힌다:
//   - app/components/redesign/MemberCard.tsx dl2Styles — rgba(254,245,
//     230,0.12) bg, nick 색 #fef5e6
//   - app/guild-tree/page.tsx:313-321 — 멤버 엔트리 카드, 동일 계열
//   - app/album/page.tsx:49-64 — DL2_GRID_CARD_BG/BORDER 동일 값,
//     칩(사람 태그)만 예외적으로 크림 배경 + 잉크 텍스트
// (Phase 2에서 CabinLogs류의 불투명 파치먼트(#f8f2e8+잉크) 계열을
// 잘못 가져다 썼던 걸 여기서 바로잡음 — 그 계열은 편지/일지 위젯 전용.)
//
// 세로 정렬: 실제 CSS Grid(grid-template-columns: 40px 1fr 60px 60px)
// 사용. 닉네임 칼럼이 1fr이라 닉네임 길이와 무관하게 길드/MBTI 뱃지가
// 항상 같은 x 위치에서 시작한다.

const CREAM = "#fef5e6";
const CREAM_SOFT = "rgba(254, 245, 230, 0.7)";
const CARD_BG = "rgba(254, 245, 230, 0.12)";
const SUNSET_GOLD = "#ffc785";
const COL_WIDTH = "60px";

export type MemberRowData = {
  nickname: string;
  guildId?: string;
  profileImage?: string;
  statusMessage?: string;
  playTime?: string;
  tags?: string[];
};

export function MemberRow({
  member,
  guild,
}: {
  member: MemberRowData;
  guild?: Guild;
}) {
  const mbti = useUserMbti(member.nickname);
  const tags = member.tags ?? [];
  const hasMeta = !!member.playTime || tags.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="grid items-start rounded-2xl px-3.5 py-3"
      style={{
        gridTemplateColumns: `40px 1fr ${COL_WIDTH} ${COL_WIDTH}`,
        columnGap: 10,
        rowGap: 4,
        background: CARD_BG,
        boxShadow: "0 4px 18px rgba(11, 8, 33, 0.28)",
      }}
    >
      <div style={{ gridColumn: "1", gridRow: "1 / span 2" }}>
        <MemberAvatar
          imageUrl={member.profileImage}
          nickname={member.nickname}
          size={40}
          dl2
        />
      </div>

      <span
        className="truncate text-sm font-bold"
        style={{ gridColumn: "2", gridRow: "1", color: CREAM }}
      >
        {member.nickname}
      </span>

      <div style={{ gridColumn: "3", gridRow: "1", justifySelf: "end" }}>
        {guild && <GuildBadge guild={guild} />}
      </div>
      <div style={{ gridColumn: "4", gridRow: "1", justifySelf: "end" }}>
        {mbti && <MbtiBadge value={mbti} />}
      </div>

      <div className="min-w-0" style={{ gridColumn: "2 / span 3", gridRow: "2" }}>
        {member.statusMessage && (
          <p className="truncate text-xs italic" style={{ color: CREAM_SOFT }}>
            {member.statusMessage}
          </p>
        )}
        {hasMeta && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {member.playTime && (
              <span className="text-[10.5px]" style={{ color: CREAM_SOFT }}>
                🕐 {member.playTime}
              </span>
            )}
            {tags.map((tag, i) => {
              const c = getTagColor(i);
              return (
                <span
                  key={tag}
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: c.bg, color: c.ink }}
                >
                  {tag}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function GuildBadge({ guild }: { guild: Guild }) {
  const accent = guildAccent(guild.id, guild.isUnion);
  return (
    <span
      className="inline-block max-w-full truncate rounded-full px-1.5 py-0.5 text-[9.5px] font-medium"
      style={{ backgroundColor: `rgba(${accent.rgb}, 0.18)`, color: accent.hex }}
    >
      {guild.name}
    </span>
  );
}

function MbtiBadge({ value }: { value: string }) {
  return (
    <span
      className="inline-block max-w-full truncate rounded-full px-1.5 py-0.5 text-[9.5px] font-medium"
      style={{ backgroundColor: "rgba(255, 199, 133, 0.18)", color: SUNSET_GOLD }}
    >
      ✦ {value}
    </span>
  );
}
