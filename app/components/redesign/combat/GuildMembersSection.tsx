"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, Lock } from "lucide-react";
import NicknameLink from "@/app/components/NicknameLink";
import { JobIcon, parseAbyssFloor, ABYSS_MAX } from "./JobIcon";

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
}: {
  characters: GuildCharacter[];
  loginNick: string | null;
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
            style={{
              fontFamily: "'Noto Serif KR', serif",
              fontSize: "clamp(22px, 4vw, 28px)",
              fontWeight: 300,
              letterSpacing: "0.06em",
              backgroundImage: "linear-gradient(135deg, #FFE5C4, #D896C8)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
            }}
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
                className={`rounded-full px-2.5 py-1 font-serif text-[10px] tracking-wider transition-all ${
                  active ? "text-stardust" : "text-text-sub hover:text-stardust"
                }`}
                style={
                  active
                    ? {
                        background: "rgba(255, 181, 167, 0.12)",
                        border: "1px solid rgba(255, 181, 167, 0.5)",
                        boxShadow: "0 0 10px rgba(255, 181, 167, 0.25)",
                      }
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
}: {
  group: Group;
  collapsed: boolean;
  onToggle: () => void;
  loginNick: string | null;
}) {
  const topPower = Math.max(
    ...group.characters.map((c) => c.combatPower || 0),
  );
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden rounded-2xl border border-nebula-pink/20 bg-abyss-deep/35 backdrop-blur-xl"
      style={{
        boxShadow:
          "0 6px 20px rgba(11, 8, 33, 0.4), inset 0 1px 0 rgba(255, 229, 196, 0.04), inset 0 0 30px rgba(107, 75, 168, 0.06)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-nebula-violet/10 sm:px-5"
        style={{
          background:
            "linear-gradient(90deg, rgba(61, 46, 107, 0.35) 0%, rgba(61, 46, 107, 0.18) 60%, transparent 100%)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="text-peach-accent"
            style={{ filter: "drop-shadow(0 0 6px rgba(255, 181, 167, 0.65))" }}
            aria-hidden
          >
            ◆
          </span>
          <NicknameLink
            nickname={group.representative}
            hideTitle
            className="font-serif text-[15px] font-medium tracking-wide text-stardust"
          />
          <span className="font-mono text-[10px] tracking-wider text-text-sub">
            최고{" "}
            <span className="text-stardust">
              {topPower.toLocaleString()}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="rounded-full border border-nebula-pink/30 bg-abyss-deep/60 px-2 py-0.5 font-serif text-[10px] tracking-wider text-stardust"
            style={{ boxShadow: "inset 0 0 6px rgba(216, 150, 200, 0.15)" }}
          >
            {group.characters.length} 캐릭
          </span>
          <motion.span
            animate={{ rotate: collapsed ? -90 : 0 }}
            transition={{ duration: 0.22 }}
            className="text-nebula-pink/80"
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
                  <CharacterRow char={c} loginNick={loginNick} />
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
}: {
  char: GuildCharacter;
  loginNick: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const floor = parseAbyssFloor(char.hellStage);
  const progress = Math.min(floor / ABYSS_MAX, 1);

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
          className="flex h-7 w-7 items-center justify-center rounded-full text-stardust"
          style={{
            background:
              "linear-gradient(135deg, rgba(107, 75, 168, 0.45), rgba(216, 150, 200, 0.25))",
            border: "1px solid rgba(216, 150, 200, 0.3)",
          }}
        >
          <JobIcon job={char.job} size={14} />
        </span>

        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className="truncate font-serif text-[13px] tracking-wide text-stardust"
              style={{ fontFamily: "'Noto Serif KR', serif" }}
            >
              {char.nickname}
            </span>
            <span className="rounded-full border border-nebula-pink/20 px-1.5 py-0.5 font-serif text-[9px] tracking-wider text-text-sub sm:hidden">
              {char.job}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 sm:hidden">
            <PowerNumber value={char.combatPower || 0} small />
            <div className="flex items-center gap-2">
              <AbyssInline floor={floor} progress={progress} />
              <ChallengeDot challenge={char.challenge} />
            </div>
          </div>
        </div>

        <span className="hidden items-center justify-center rounded-full border border-nebula-pink/20 px-2 py-0.5 font-serif text-[10px] tracking-wider text-text-sub sm:inline-flex">
          {char.job}
        </span>
        <div className="hidden justify-end sm:flex">
          <PowerNumber value={char.combatPower || 0} />
        </div>
        <div className="hidden justify-start sm:flex">
          <AbyssInline floor={floor} progress={progress} />
        </div>
        <div className="hidden justify-center sm:flex">
          <ChallengeDot challenge={char.challenge} />
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

function PowerNumber({ value, small }: { value: number; small?: boolean }) {
  return (
    <span
      className={`font-mono font-medium tabular-nums ${small ? "text-[11px]" : "text-sm"}`}
      style={{
        backgroundImage: "linear-gradient(135deg, #FFE5C4, #D896C8)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
      }}
    >
      {value.toLocaleString()}
    </span>
  );
}

function AbyssInline({
  floor,
  progress,
}: {
  floor: number;
  progress: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] tabular-nums text-stardust">
        {floor > 0 ? (
          `지옥${floor}`
        ) : (
          <span className="text-text-sub/70">미도전</span>
        )}
      </span>
      <div
        className="relative h-1.5 w-16 overflow-hidden rounded-full"
        style={{ background: "rgba(107, 75, 168, 0.2)" }}
      >
        <motion.div
          initial={{ width: "0%" }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{
            background: "linear-gradient(90deg, #6B4BA8 0%, #D896C8 70%, #FFB5A7 100%)",
            boxShadow: "0 0 6px rgba(216, 150, 200, 0.55)",
          }}
        />
      </div>
    </div>
  );
}

function ChallengeDot({ challenge }: { challenge: Challenge }) {
  const map: Record<
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
