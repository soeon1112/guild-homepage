"use client";

import { motion } from "framer-motion";
import { MemberAvatar } from "@/app/components/redesign/MemberAvatar";
import { useUserMbti } from "@/src/lib/userMbti";
import { guildAccent, type Guild } from "@/src/lib/useGuilds";
import { getTagColor } from "@/src/lib/memberTags";

// 길드원 한 줄 목록 — 2줄 카드 한 항목. 1:1 대응하는 RN 컴포넌트는
// src/components/members/MemberRow.tsx (dawnlight-app).
// 1줄: 프사(MemberAvatar, 클릭 로직 그대로) + 닉네임 + 길드 뱃지 + MBTI 뱃지
// 2줄: 프사 자리만큼 들여쓰기 후 한마디 + 플레이 시간대 + 취향 태그

const INK = "#5c3a1f";
const INK_SOFT = "#8a6a4a";
const INK_BORDER = "rgba(92, 58, 31, 0.10)";
const CARD_SURFACE = "#f8f2e8"; // dl2 카드 표면 — CabinLogs MAT 톤과 동일

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
      className="flex flex-col rounded-2xl p-3.5"
      style={{ backgroundColor: CARD_SURFACE, border: `1px solid ${INK_BORDER}` }}
    >
      <div className="flex items-center gap-2">
        <MemberAvatar
          imageUrl={member.profileImage}
          nickname={member.nickname}
          size={40}
          dl2
        />
        <span
          className="truncate text-sm font-bold"
          style={{ color: INK }}
        >
          {member.nickname}
        </span>
        {guild && <GuildBadge guild={guild} />}
        {mbti && <MbtiBadge value={mbti} />}
      </div>

      <div className="mt-1.5 flex gap-2.5 pl-[48px]">
        <div className="min-w-0 flex-1">
          {member.statusMessage && (
            <p className="truncate text-xs italic" style={{ color: INK_SOFT }}>
              {member.statusMessage}
            </p>
          )}
          {hasMeta && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {member.playTime && (
                <span className="text-[10.5px]" style={{ color: INK_SOFT }}>
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
      </div>
    </motion.div>
  );
}

function GuildBadge({ guild }: { guild: Guild }) {
  const accent = guildAccent(guild.id, guild.isUnion);
  return (
    <span
      className="shrink-0 truncate rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{
        backgroundColor: `rgba(${accent.rgb}, 0.16)`,
        border: `1px solid rgba(${accent.rgb}, 0.4)`,
        color: accent.hex,
        maxWidth: 96,
      }}
    >
      {guild.name}
    </span>
  );
}

function MbtiBadge({ value }: { value: string }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: "rgba(255, 199, 133, 0.25)", color: "#8a5a2a" }}
    >
      ✦ {value}
    </span>
  );
}
