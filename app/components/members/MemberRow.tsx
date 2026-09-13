"use client";

import { motion } from "framer-motion";
import { Clock, Heart } from "lucide-react";
import { MemberAvatar } from "@/app/components/redesign/MemberAvatar";
import { useUserMbti } from "@/src/lib/userMbti";
import { guildAccent, type Guild } from "@/src/lib/useGuilds";

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

// Phase 2.4 — 길드/MBTI 배지 열 폭 고정. 필드가 없어도 열 자리를
// 그대로 유지해야 해서(카드마다 폭이 변하면 안 됨) 배지 유무와 무관한
// 고정 폭 컬럼 2개로 분리했다(이전 Phase 2.3은 배지가 하나만 있으면
// 그 하나가 오른쪽 끝으로 붙어버려 자리가 안 고정됨).
const GUILD_COL_WIDTH = 100;
const MBTI_COL_WIDTH = 80;
// Phase 2.5 — 2줄 시간대/태그는 더 이상 고정폭 컬럼이 아니라(요청에
// 따라 폐기) 내용만큼만 폭을 차지하는 두 그룹. 이 gap은 그 두 그룹
// 사이 간격만 담당(그룹 내부 pill 간격은 gap-1로 별도).
const META_GROUP_GAP = 16;

// Phase 2.3 — 태그/시간대 pill 색.
// 취향 태그: 순환(mistLavender/peach/sunsetGold) 폐기 → mistLavender
// 단일색 고정. peach는 이미 MBTI 배지가 쓰고 있어서(MBTI_BADGE_BG,
// 아래) 겹치면 "이게 배지야 태그야" 헷갈리니 제외했다.
const TAG_BG = "#c8b8e8"; // mistLavender
const TAG_TEXT = INK;
// 시간대 pill: 사용자가 준 예시(rgba(92,58,31,...) 잉크 테두리)는 이
// 카드가 실제로는 어두운 twilight 배경이 비치는 반투명 카드라서(위 주석
// 참고) 어두운 테두리+텍스트를 쓰면 안 보인다 — 크림 계열로 정정.
const TIME_BORDER = "rgba(254, 245, 230, 0.35)";
const TIME_TEXT = "rgba(254, 245, 230, 0.85)";
// Phase 2.4 — 카테고리 아이콘. 이모지(🕐)는 OS가 그리는 고정 색 그림
// 글자라 color 스타일이 아예 안 먹는다(Phase 2.3에서 CREAM_SOFT를
// 줬지만 시각적으로 아무 효과가 없었던 이유) — 그래서 진하게 만들
// 수도 없었다. 색을 통제할 수 있는 lucide 벡터 아이콘으로 교체하고,
// 다른 dl2 페이지의 "아이콘 accent" 관례(검색창/가계도 카드 아이콘
// 전부 sunsetGold)를 그대로 따라 sunsetGold + 100% 불투명으로 진하게.
const CATEGORY_ICON_COLOR = "#ffc785"; // sunsetGold

export type MemberRowData = {
  nickname: string;
  // members/{memberDocId} 문서 id — 편집 모달이 profileImage/statusMessage를
  // 쓸 대상. members 존재 여부로 이 리스트에 들어온 멤버는 항상 있음.
  memberDocId?: string;
  guildId?: string;
  profileImage?: string;
  statusMessage?: string;
  // Phase 3 — 여러 시간대 선택 가능하도록 string[]로 변경(Phase 1/2의
  // string은 사용처가 없어 그대로 폐기, 마이그 불필요).
  playTime?: string[];
  tags?: string[];
};

export function MemberRow({
  member,
  guild,
  isOwnRow,
  onEditPress,
}: {
  member: MemberRowData;
  guild?: Guild;
  /** 로그인 사용자 본인 행이면 true — 프사 클릭이 편집 모달을 연다. */
  isOwnRow?: boolean;
  onEditPress?: () => void;
}) {
  const mbti = useUserMbti(member.nickname);
  const tags = member.tags ?? [];
  const playTimes = member.playTime ?? [];
  const hasMeta = playTimes.length > 0 || tags.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col rounded-2xl px-3.5 py-3"
      style={{
        background: CARD_BG,
        boxShadow: "0 4px 18px rgba(11, 8, 33, 0.28)",
      }}
    >
      {/* 1줄: 프사 + 닉네임 + 한마디(truncate) | 오른쪽: 길드+MBTI 배지.
          middleRow에 min-w-0 + flex-1을 줘서 justify-between과 동일한
          효과 — 배지 그룹은 항상 카드 오른쪽 끝에 붙는다. */}
      <div className="flex items-center gap-2.5">
        <div className="relative shrink-0" style={{ width: 40 }}>
          <MemberAvatar
            imageUrl={member.profileImage}
            nickname={member.nickname}
            size={40}
            dl2
          />
          {/* MemberAvatar 미접촉 — 대신 같은 자리에 투명 오버레이 버튼을
              얹어 본인 행일 때만 클릭을 가로챈다. 타인 행은 오버레이가
              없어 MemberAvatar 자체의 개인 공간 이동이 그대로 동작. */}
          {isOwnRow && onEditPress && (
            <button
              type="button"
              onClick={onEditPress}
              aria-label="내 프로필 편집"
              className="absolute inset-0 z-10 cursor-pointer rounded-full"
              style={{ background: "transparent", border: "none" }}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span
            className="shrink-0 truncate text-sm font-bold"
            style={{ color: CREAM }}
          >
            {member.nickname}
          </span>
          {member.statusMessage && (
            <span
              className="min-w-0 flex-1 truncate text-xs italic"
              style={{ color: CREAM_SOFT }}
            >
              {member.statusMessage}
            </span>
          )}
        </div>

        {/* 길드(100px)/MBTI(80px) 고정폭 컬럼 — 배지가 없어도 폭을
            그대로 차지해서, 예: MBTI 없는 행에서 길드 배지가 그 자리로
            밀려오지 않는다. */}
        <div className="flex shrink-0 items-center justify-end" style={{ width: GUILD_COL_WIDTH }}>
          {guild && <GuildBadge guild={guild} />}
        </div>
        <div className="flex shrink-0 items-center justify-end" style={{ width: MBTI_COL_WIDTH }}>
          {mbti && <MbtiBadge value={mbti} />}
        </div>
      </div>

      {/* 2줄 (Phase 2.5) — 프사 자리 spacer 없이 시간대 그룹 / 태그
          그룹이 나란히. 각 그룹은 자기 내용만큼만 폭을 차지하고(고정폭
          컬럼 아님), wrap도 그룹 안에서만 일어난다 — 두 그룹을 하나의
          flex-wrap 컨테이너로 합치면 시간대 pill과 태그 pill이 섞여서
          줄바꿈되므로 그룹마다 별도 div로 분리. 빈 그룹은 렌더 안 함
          (Phase 2.4의 "필드 없어도 고정폭 유지" 요구는 이번 지시로
          폐기). */}
      {hasMeta && (
        <div className="mt-2 flex items-start" style={{ gap: META_GROUP_GAP }}>
          {playTimes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <Clock size={11} color={CATEGORY_ICON_COLOR} strokeWidth={2.5} />
              {playTimes.map((t) => (
                <span
                  key={t}
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ border: `1px solid ${TIME_BORDER}`, color: TIME_TEXT }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <Heart size={11} color={CATEGORY_ICON_COLOR} fill={CATEGORY_ICON_COLOR} />
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: TAG_BG, color: TAG_TEXT }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
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
