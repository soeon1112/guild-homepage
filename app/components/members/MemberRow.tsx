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
// 배지 전용 잉크 — CabinLogs INK와 동일 값(가장 어두워 대비 여유가 큼).
const INK = "#3a2a1a";
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

// 배지 가독성 fix — 이전엔 accent 색을 반투명 배경 + 같은 accent 색
// 텍스트로 썼는데, 카드 뒤로 어두운 twilight 배경이 비치는 정도가
// 스크롤 위치마다 달라서 대비가 들쭉날쭉했다(peace/erin은 배경에 따라
// 거의 안 보임). 배경을 불투명으로 고정하고, 그 배경의 상대 휘도를 계산해
// 밝은 accent(sunsetGold/mistLavender류)는 잉크 텍스트, 어두운 accent
// (end/erin/peace류)는 조금 더 눌러서(×0.72) 크림 텍스트를 얹어 항상
// WCAG AA(4.5:1) 이상을 확보한다.
function relativeLuminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function badgeColors(accent: { hex: string; rgb: string }): {
  bg: string;
  text: string;
} {
  if (relativeLuminance(accent.hex) > 0.4) {
    // 밝은 accent(sunsetGold #ffc785, mistLavender #c8b8e8) — 그대로
    // 불투명 배경, 잉크 텍스트. 대비 ≈9:1.
    return { bg: accent.hex, text: INK };
  }
  // 어두운/진한 accent(end/erin/peace) — 0.72배 더 눌러 크림 텍스트와
  // 항상 6:1 이상 확보(원색 그대로면 4.5:1 근처라 배경에 따라 위험).
  const darker = accent.rgb
    .split(",")
    .map((v) => Math.round(parseInt(v.trim(), 10) * 0.72))
    .join(", ");
  return { bg: `rgb(${darker})`, text: CREAM };
}

function GuildBadge({ guild }: { guild: Guild }) {
  const accent = guildAccent(guild.id, guild.isUnion);
  const { bg, text } = badgeColors(accent);
  return (
    <span
      className="inline-block max-w-full truncate rounded-full px-1.5 py-0.5 text-[9.5px] font-medium"
      style={{ backgroundColor: bg, color: text }}
    >
      {guild.name}
    </span>
  );
}

// MBTI는 길드가 아니라서 accent 색과 겹치면 혼동되므로, 어느 길드에도
// 안 쓰이는 peach(#ffd4b8, dl2Colors.cloudPink)를 단일 색으로 고정
// 사용 — 잉크 텍스트 대비 ≈10:1.
const MBTI_BADGE_BG = "#ffd4b8";

function MbtiBadge({ value }: { value: string }) {
  return (
    <span
      className="inline-block max-w-full truncate rounded-full px-1.5 py-0.5 text-[9.5px] font-medium"
      style={{ backgroundColor: MBTI_BADGE_BG, color: INK }}
    >
      ✦ {value}
    </span>
  );
}
