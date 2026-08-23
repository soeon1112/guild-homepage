"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, Lock } from "lucide-react";
import NicknameLink from "@/app/components/NicknameLink";
import { JobIcon, parseAbyssFloor } from "./JobIcon";

type Challenge = "있음" | "다소 있음" | "없음";

type RuneBuild = {
  name: string;
  dps: number;
  isPublic: boolean;
};

export type GuildCharacter = {
  id: string;
  owner: string;
  nickname: string;
  job: string;
  combatPower: number;
  hellStage: string;
  challenge: Challenge;
  runeBuilds?: RuneBuild[];
  magicResist?: number;
};

type SortKey = "nickname" | "power" | "abyss";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "nickname", label: "닉네임순" },
  { key: "power", label: "투력순" },
  { key: "abyss", label: "지옥단계순" },
];

const JOB_FILTERS = [
  "전체",
  "대검",
  "검술",
  "궁수",
  "장궁",
  "석궁",
  "화법",
  "빙결",
  "전격",
  "법사",
  "힐러",
  "사제",
  "수도",
  "암흑",
  "음유",
  "악사",
  "댄서",
  "도적",
  "듀블",
  "격가",
  "전사",
  "기사",
];

function nicknameGroup(s: string): number {
  const ch = s.trim().charCodeAt(0);
  if ((ch >= 0x41 && ch <= 0x5a) || (ch >= 0x61 && ch <= 0x7a)) return 0;
  if (ch >= 0xac00 && ch <= 0xd7a3) return 1;
  return 2;
}

function nicknameCompare(a: string, b: string): number {
  const ga = nicknameGroup(a);
  const gb = nicknameGroup(b);
  if (ga !== gb) return ga - gb;
  if (ga === 0) return a.localeCompare(b, "en", { sensitivity: "base" });
  return a.localeCompare(b, "ko");
}

type Group = {
  representative: string;
  characters: GuildCharacter[];
};

export function GuildMembersSection({
  characters,
  loginNick,
  dl2 = false,
}: {
  characters: GuildCharacter[];
  loginNick: string | null;
  dl2?: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("nickname");
  const [queryText, setQueryText] = useState("");
  const [jobFilter, setJobFilter] = useState("전체");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const sortedGroups = useMemo<Group[]>(() => {
    const byOwner = new Map<string, GuildCharacter[]>();
    for (const c of characters) {
      const key = c.owner || "(미지정)";
      const list = byOwner.get(key) ?? [];
      list.push(c);
      byOwner.set(key, list);
    }

    const q = queryText.trim().toLowerCase();
    const groups: Group[] = [];
    for (const [rep, chars] of byOwner) {
      const filtered = chars
        .filter((c) => (jobFilter === "전체" ? true : c.job === jobFilter))
        .filter((c) => {
          if (!q) return true;
          return (
            (c.nickname || "").toLowerCase().includes(q) ||
            rep.toLowerCase().includes(q) ||
            (c.job || "").toLowerCase().includes(q)
          );
        })
        .sort((a, b) => (b.combatPower || 0) - (a.combatPower || 0));
      if (filtered.length > 0) {
        groups.push({ representative: rep, characters: filtered });
      }
    }

    if (sortKey === "nickname") {
      groups.sort((a, b) => nicknameCompare(a.representative, b.representative));
    } else if (sortKey === "power") {
      groups.sort(
        (a, b) =>
          Math.max(...b.characters.map((c) => c.combatPower || 0)) -
          Math.max(...a.characters.map((c) => c.combatPower || 0)),
      );
    } else {
      groups.sort(
        (a, b) =>
          Math.max(...b.characters.map((c) => parseAbyssFloor(c.hellStage))) -
          Math.max(...a.characters.map((c) => parseAbyssFloor(c.hellStage))),
      );
    }

    return groups;
  }, [characters, sortKey, queryText, jobFilter]);

  const totalChars = sortedGroups.reduce(
    (n, g) => n + g.characters.length,
    0,
  );

  return (
    <section className="mb-10">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            className="font-serif leading-none"
            style={
              dl2
                ? {
                    fontFamily:
                      "'Pretendard Variable', Pretendard, 'Noto Sans KR', sans-serif",
                    fontSize: "clamp(20px, 4vw, 26px)",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    color: "#fef5e6",
                  }
                : {
                    fontFamily: "'Noto Serif KR', serif",
                    fontSize: "clamp(22px, 4vw, 28px)",
                    fontWeight: 300,
                    letterSpacing: "0.06em",
                    backgroundImage: "linear-gradient(135deg, #FFE5C4, #D896C8)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    color: "transparent",
                  }
            }
          >
            전체 길드원
          </h2>
          <p className="mt-2 font-serif text-[10px] tracking-[0.3em] text-text-sub uppercase">
            Guild Roster · {sortedGroups.length}명 · {totalChars}캐릭
          </p>
        </div>

        <div className="flex items-center gap-1.5 rounded-full border border-nebula-pink/20 bg-abyss-deep/40 p-1 backdrop-blur-md">
          {SORT_OPTIONS.map((o) => {
            const active = sortKey === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => setSortKey(o.key)}
                // dl2 mode drops `text-stardust` / `text-text-sub`
                // tailwind classes — those are caught by the
                // `.dl2-power [class*="text-stardust"]` !important
                // CSS override and would clobber the inline color
                // we set for the active cream-on-navy state. Inline
                // styles alone keep the chip readable.
                className={
                  dl2
                    ? "rounded-full px-2.5 py-1 font-serif text-[10px] tracking-wider transition-all"
                    : `rounded-full px-2.5 py-1 font-serif text-[10px] tracking-wider transition-all ${
                        active ? "text-stardust" : "text-text-sub hover:text-stardust"
                      }`
                }
                style={
                  active
                    ? dl2
                      ? {
                          background: "#2a4570",
                          border: "1px solid #2a4570",
                          color: "#fef5e6",
                          boxShadow: "none",
                        }
                      : {
                          background: "rgba(255, 181, 167, 0.12)",
                          border: "1px solid rgba(255, 181, 167, 0.5)",
                          boxShadow: "0 0 10px rgba(255, 181, 167, 0.25)",
                        }
                    : dl2
                      ? { border: "1px solid #2a4570", color: "#2a4570" }
                      : { border: "1px solid transparent" }
                }
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search + job filter */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-nebula-pink/70">
            <Search className="h-3.5 w-3.5" />
          </span>
          <input
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="닉네임 · 직업 검색"
            className="w-full rounded-full border border-nebula-pink/25 bg-abyss-deep/40 py-2 pl-9 pr-4 font-serif text-xs text-text-primary placeholder:text-text-sub/70 focus:border-nebula-pink/60 focus:outline-none focus:ring-2 focus:ring-nebula-pink/20"
            style={{
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              boxShadow: "inset 0 1px 0 rgba(255, 229, 196, 0.04)",
            }}
          />
        </div>
        <JobFilter value={jobFilter} onChange={setJobFilter} />
      </div>

      {/* Groups */}
      <motion.div layout className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {sortedGroups.map((g) => (
            <GroupBlock
              key={g.representative}
              group={g}
              collapsed={!!collapsed[g.representative]}
              onToggle={() =>
                setCollapsed((c) => ({
                  ...c,
                  [g.representative]: !c[g.representative],
                }))
              }
              loginNick={loginNick}
              dl2={dl2}
            />
          ))}
        </AnimatePresence>
      </motion.div>

      {sortedGroups.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-nebula-pink/15 bg-abyss-deep/30 px-6 py-14 text-center backdrop-blur-md">
          <span
            className="mb-3 text-2xl text-text-sub/60"
            style={{ filter: "drop-shadow(0 0 10px rgba(216, 150, 200, 0.5))" }}
            aria-hidden
          >
            ✦
          </span>
          <p className="font-serif text-sm italic text-text-sub text-balance">
            조건에 맞는 별이 없어요
          </p>
        </div>
      )}
    </section>
  );
}

function GroupBlock({
  group,
  collapsed,
  onToggle,
  loginNick,
  dl2 = false,
}: {
  group: Group;
  collapsed: boolean;
  onToggle: () => void;
  loginNick: string | null;
  dl2?: boolean;
}) {
  const topPower = Math.max(
    ...group.characters.map((c) => c.combatPower || 0),
  );
  const topMagicResist = Math.max(
    ...group.characters.map((c) => c.magicResist ?? 0),
  );
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25 }}
      data-nick={group.representative}
      className="overflow-hidden rounded-2xl backdrop-blur-xl"
      style={{
        background: dl2 ? "rgba(205, 216, 224, 0.7)" : undefined,
        border: dl2
          ? "1px solid rgba(42, 69, 112, 0.18)"
          : "1px solid rgba(216, 150, 200, 0.2)",
        boxShadow: dl2
          ? "none"
          : "0 6px 20px rgba(11, 8, 33, 0.4), inset 0 1px 0 rgba(255, 229, 196, 0.04), inset 0 0 30px rgba(107, 75, 168, 0.06)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors sm:px-5"
        style={{
          background: dl2
            ? "rgba(205, 216, 224, 0.95)"
            : "linear-gradient(90deg, rgba(61, 46, 107, 0.35) 0%, rgba(61, 46, 107, 0.18) 60%, transparent 100%)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            style={{
              color: dl2 ? "#c4992f" : undefined,
              filter: dl2
                ? "drop-shadow(0 0 4px rgba(196, 153, 47, 0.5))"
                : "drop-shadow(0 0 6px rgba(255, 181, 167, 0.65))",
            }}
            className={dl2 ? "" : "text-peach-accent"}
            aria-hidden
          >
            ◆
          </span>
          <NicknameLink
            nickname={group.representative}
            className={
              dl2
                ? "font-serif text-[16px] font-bold tracking-wide"
                : "font-serif text-[15px] font-medium tracking-wide text-stardust"
            }
          />
          <span
            className="font-mono text-[10px] tracking-wider"
            style={{ color: dl2 ? "#5a7090" : undefined }}
          >
            최고{" "}
            <span style={{ color: dl2 ? "#8a6710" : undefined, fontWeight: dl2 ? 700 : undefined }}>
              {topPower.toLocaleString()}
            </span>
            {topMagicResist > 0 && (
              <>
                {" · "}
                <span style={{ color: dl2 ? "#8a6710" : undefined, fontWeight: dl2 ? 700 : undefined }}>
                  {topMagicResist.toLocaleString()}
                </span>
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 font-serif text-[10px] tracking-wider"
            style={{
              background: dl2 ? "#fef5e6" : undefined,
              border: dl2
                ? "1px solid rgba(42, 69, 112, 0.2)"
                : "1px solid rgba(216, 150, 200, 0.3)",
              color: dl2 ? "#2a4570" : undefined,
              boxShadow: dl2 ? "none" : "inset 0 0 6px rgba(216, 150, 200, 0.15)",
            }}
          >
            {group.characters.length} 캐릭
          </span>
          <motion.span
            animate={{ rotate: collapsed ? -90 : 0 }}
            transition={{ duration: 0.22 }}
            className={dl2 ? "" : "text-nebula-pink/80"}
            style={dl2 ? { color: "#2a4570" } : undefined}
            aria-hidden
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <ul className="divide-y divide-nebula-pink/10 px-2 py-1 sm:px-3">
              {group.characters.map((c) => (
                <li key={c.id}>
                  <CharacterRow char={c} loginNick={loginNick} dl2={dl2} />
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CharacterRow({
  char,
  loginNick,
  dl2 = false,
}: {
  char: GuildCharacter;
  loginNick: string | null;
  dl2?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const floor = parseAbyssFloor(char.hellStage);

  const allBuilds = char.runeBuilds ?? [];
  const visibleBuilds =
    loginNick && char.owner === loginNick
      ? allBuilds
      : allBuilds.filter((b) => b.isPublic);

  const hasExpandable = visibleBuilds.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => hasExpandable && setExpanded((v) => !v)}
        disabled={!hasExpandable}
        className="grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors enabled:hover:bg-nebula-pink/10 disabled:cursor-default sm:grid-cols-[28px_minmax(0,1fr)_60px_90px_140px_28px] sm:gap-4 sm:px-3"
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{
            background: dl2
              ? "rgba(196, 153, 47, 0.15)"
              : "linear-gradient(135deg, rgba(107, 75, 168, 0.45), rgba(216, 150, 200, 0.25))",
            border: dl2
              ? "1px solid rgba(196, 153, 47, 0.4)"
              : "1px solid rgba(216, 150, 200, 0.3)",
            color: dl2 ? "#8a6710" : "#ffe5c4",
          }}
        >
          <JobIcon job={char.job} size={14} />
        </span>

        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className="truncate font-serif text-[13px] tracking-wide"
              style={{
                fontFamily: dl2
                  ? "'Pretendard Variable', Pretendard, 'Noto Sans KR', sans-serif"
                  : "'Noto Serif KR', serif",
                color: dl2 ? "#2a4570" : undefined,
                fontWeight: dl2 ? 600 : undefined,
              }}
            >
              {char.nickname}
            </span>
            <span
              className="rounded-full px-1.5 py-0.5 font-serif text-[9px] tracking-wider sm:hidden"
              style={{
                background: dl2 ? "#fef5e6" : undefined,
                border: dl2
                  ? "1px solid rgba(42, 69, 112, 0.2)"
                  : "1px solid rgba(216, 150, 200, 0.2)",
                color: dl2 ? "#5c3a1f" : undefined,
              }}
            >
              {char.job}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 sm:hidden">
            <PowerNumber value={char.combatPower || 0} small dl2={dl2} />
            <div className="flex items-center gap-2">
              {/* 마저: 투력과 동일 스타일, 숫자만 */}
              <span className="font-mono text-[11px] tabular-nums font-medium" style={{ color: dl2 ? "#8a6710" : "#FFE5C4", fontWeight: dl2 ? 700 : undefined }}>
                {char.magicResist != null ? char.magicResist.toLocaleString() : "-"}
              </span>
              {/* 지옥: 현재 스타일 그대로 */}
              <span className="font-mono text-[11px] tabular-nums" style={{ color: dl2 ? "#2a4570" : "#ffe5c4" }}>{floor > 0 ? `지옥${floor}` : <span style={{ color: dl2 ? "#5a7090" : "rgba(155,143,184,0.7)" }}>미도전</span>}</span>
              <ChallengeDot challenge={char.challenge} dl2={dl2} />
            </div>
          </div>
        </div>

        <span
          className="hidden items-center justify-center rounded-full px-2 py-0.5 font-serif text-[10px] tracking-wider sm:inline-flex"
          style={{
            background: dl2 ? "#fef5e6" : undefined,
            border: dl2
              ? "1px solid rgba(42, 69, 112, 0.2)"
              : "1px solid rgba(216, 150, 200, 0.2)",
            color: dl2 ? "#5c3a1f" : undefined,
          }}
        >
          {char.job}
        </span>
        <div className="hidden justify-end sm:flex">
          <PowerNumber value={char.combatPower || 0} dl2={dl2} />
        </div>
        <div className="hidden items-center gap-2 justify-start sm:flex">
          {/* 마저: 투력과 동일 스타일, 숫자만 */}
          <span className="font-mono text-sm tabular-nums font-medium" style={{ color: dl2 ? "#8a6710" : "#FFE5C4", fontWeight: dl2 ? 700 : undefined }}>
            {char.magicResist != null ? char.magicResist.toLocaleString() : "-"}
          </span>
          {/* 지옥: 현재 스타일 그대로 */}
          <span className="font-mono text-[11px] tabular-nums" style={{ color: dl2 ? "#2a4570" : "#ffe5c4" }}>{floor > 0 ? `지옥${floor}` : <span style={{ color: dl2 ? "#5a7090" : "rgba(155,143,184,0.7)" }}>미도전</span>}</span>
        </div>
        <div className="hidden justify-center sm:flex">
          <ChallengeDot challenge={char.challenge} dl2={dl2} />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && hasExpandable && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <ul className="mx-2 mb-2 flex flex-col gap-1.5 rounded-lg border border-nebula-pink/15 bg-abyss-deep/50 p-2.5 sm:mx-3">
              {visibleBuilds.map((b, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-md bg-abyss-deep/40 px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    {!b.isPublic && (
                      <Lock
                        className="h-3 w-3 text-text-sub/70"
                        aria-label="비공개"
                      />
                    )}
                    <span className="font-serif text-[12px] text-stardust">
                      {b.name}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-text-sub">
                    DPS {b.dps.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PowerNumber({
  value,
  small,
  dl2 = false,
}: {
  value: number;
  small?: boolean;
  dl2?: boolean;
}) {
  return (
    <span
      className={`font-mono tabular-nums ${dl2 ? "" : "font-medium"} ${small ? "text-[11px]" : "text-sm"}`}
      style={
        dl2
          ? { color: "#8a6710", fontWeight: 700 }
          : {
              backgroundImage: "linear-gradient(135deg, #FFE5C4, #D896C8)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
            }
      }
    >
      {value.toLocaleString()}
    </span>
  );
}

function ChallengeDot({
  challenge,
  dl2 = false,
}: {
  challenge: Challenge;
  dl2?: boolean;
}) {
  const cosmicMap: Record<
    Challenge,
    { bg: string; border: string; fg: string; glyph: string }
  > = {
    있음: {
      bg: "rgba(168, 232, 192, 0.2)",
      border: "rgba(168, 232, 192, 0.55)",
      fg: "#A8E8C0",
      glyph: "✓",
    },
    "다소 있음": {
      bg: "rgba(255, 229, 142, 0.2)",
      border: "rgba(255, 229, 142, 0.55)",
      fg: "#FFE58E",
      glyph: "△",
    },
    없음: {
      bg: "rgba(232, 168, 184, 0.2)",
      border: "rgba(232, 168, 184, 0.55)",
      fg: "#E8A8B8",
      glyph: "✕",
    },
  };
  // dl2 — sage / amber (hollow) / grey trio. amber renders as outlined
  // △ glyph (stroke-only feel) since it's a low-priority hint.
  const dl2Map: Record<
    Challenge,
    { bg: string; border: string; fg: string; glyph: string }
  > = {
    있음: {
      bg: "rgba(107, 155, 90, 0.2)",
      border: "rgba(107, 155, 90, 0.6)",
      fg: "#4f7541",
      glyph: "✓",
    },
    "다소 있음": {
      bg: "rgba(214, 138, 60, 0.2)",
      border: "rgba(214, 138, 60, 0.6)",
      fg: "#a8691f",
      glyph: "△",
    },
    없음: {
      bg: "rgba(106, 106, 106, 0.15)",
      border: "rgba(106, 106, 106, 0.55)",
      fg: "#5a5a5a",
      glyph: "✕",
    },
  };
  const map = dl2 ? dl2Map : cosmicMap;
  const c = map[challenge] ?? map["있음"];
  return (
    <span
      title={challenge}
      className="flex h-6 w-6 items-center justify-center rounded-full font-serif text-[11px] font-semibold"
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.fg,
      }}
    >
      {c.glyph}
    </span>
  );
}

function JobFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-nebula-pink/25 bg-abyss-deep/40 px-3 py-2 font-serif text-[11px] tracking-wider text-stardust backdrop-blur-md transition-colors hover:border-nebula-pink/50"
      >
        <span className="text-text-sub">직업</span>
        {value}
        <ChevronDown
          className={`h-3 w-3 text-nebula-pink transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <>
          <div
            aria-hidden
            className="fixed inset-0 z-[50]"
            onClick={() => setOpen(false)}
          />
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="nebula-scroll absolute right-0 top-full z-[50] mt-2 grid max-h-[260px] min-w-[200px] grid-cols-2 gap-0.5 overflow-y-auto rounded-xl border border-nebula-pink/25 bg-abyss-deep/95 p-1 backdrop-blur-xl"
            style={{
              boxShadow:
                "0 8px 24px rgba(0, 0, 0, 0.4), 0 0 18px rgba(216, 150, 200, 0.2)",
            }}
          >
            {JOB_FILTERS.map((j) => {
              const active = j === value;
              return (
                <li key={j}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(j);
                      setOpen(false);
                    }}
                    className={`w-full rounded-md px-2 py-1.5 text-center font-serif text-[11px] tracking-wider transition-colors ${
                      active
                        ? "bg-nebula-pink/15 text-stardust"
                        : "text-text-sub hover:bg-nebula-pink/10 hover:text-stardust"
                    }`}
                  >
                    {j}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        </>
      )}
    </div>
  );
}
