"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronDown,
  Crown,
  Flame,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useGuildGrowthData } from "@/src/lib/useGuildGrowthData";
import { JobIcon } from "./JobIcon";

type Challenge = "있음" | "다소 있음" | "없음";

type RuneBuild = {
  name: string;
  dps: number;
  isPublic: boolean;
};

export type GrowthCharacter = {
  id: string;
  owner: string;
  nickname: string;
  job: string;
  combatPower: number;
  hellStage: string;
  challenge: Challenge;
  runeBuilds?: RuneBuild[];
};

type HistoryEntry = {
  combatPower: number;
  recordedAt: Timestamp | null;
};

type Point = {
  ts: number;
  date: string; // v0 uses "date" key on XAxis
  power: number;
};

type Grower = {
  owner: string;
  name: string;
  job: string;
  delta: number;
};

const HELL_INDEX: Record<string, number> = (() => {
  const map: Record<string, number> = { "매어 이하": 0 };
  for (let i = 1; i <= 15; i++) map[`지옥${i}`] = i;
  return map;
})();

function hellLabelFromAverage(avg: number): string {
  if (!Number.isFinite(avg)) return "-";
  const rounded = Math.round(avg);
  if (rounded <= 0) return "0";
  if (rounded >= 15) return "15";
  return String(rounded);
}

function formatDayLabel(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function GrowthAnalysisSection({
  characters,
  owner,
  ready,
  dl2 = false,
}: {
  characters: GrowthCharacter[];
  owner: string | null;
  ready: boolean;
  dl2?: boolean;
}) {
  const myCharacters = useMemo(
    () => (owner ? characters.filter((c) => c.owner === owner) : []),
    [characters, owner],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [rangeMode, setRangeMode] = useState<"30d" | "all">("30d");
  const [nowMs, setNowMs] = useState<number | null>(null);

  // Shared history fetch for 빛난 별 (top 7d) + 직업별 성장 (avg 7d/30d).
  const { topGrowers, jobGrowth } = useGuildGrowthData(characters);

  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  useEffect(() => {
    if (!owner || myCharacters.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((cur) => {
      if (cur && myCharacters.some((c) => c.id === cur)) return cur;
      const match = myCharacters.find((c) => c.nickname === owner);
      return match ? match.id : myCharacters[0].id;
    });
  }, [myCharacters, owner]);

  useEffect(() => {
    if (!selectedId) {
      setHistory([]);
      return;
    }
    const q = query(
      collection(db, "characters", selectedId, "history"),
      orderBy("recordedAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map((d) => d.data() as HistoryEntry));
    });
    return () => unsub();
  }, [selectedId]);

  const selectedChar = useMemo(
    () => characters.find((c) => c.id === selectedId) ?? null,
    [characters, selectedId],
  );

  const fullSeries = useMemo<Point[]>(() => {
    if (!selectedChar || nowMs === null) return [];
    const points: Point[] = history
      .map((h) => {
        const ts = h.recordedAt?.toMillis();
        if (typeof ts !== "number") return null;
        const d = new Date(ts);
        return {
          ts,
          date: formatDayLabel(d),
          power: h.combatPower,
        };
      })
      .filter((p): p is Point => p !== null);
    // Current snapshot as latest point
    points.push({
      ts: nowMs,
      date: formatDayLabel(new Date(nowMs)),
      power: selectedChar.combatPower,
    });
    return points;
  }, [history, selectedChar, nowMs]);

  const series = useMemo(() => {
    if (rangeMode !== "30d" || nowMs === null) return fullSeries;
    const cutoff = nowMs - 30 * 24 * 60 * 60 * 1000;
    return fullSeries.filter((p) => p.ts >= cutoff);
  }, [fullSeries, rangeMode, nowMs]);

  const weekSeries = useMemo(() => {
    if (nowMs === null) return [];
    const cutoff = nowMs - 7 * 24 * 60 * 60 * 1000;
    return fullSeries.filter((p) => p.ts >= cutoff);
  }, [fullSeries, nowMs]);

  const growth = useMemo(() => {
    if (!selectedChar || nowMs === null) {
      return {
        hasData: false,
        week: 0,
        month: 0,
        total: 0,
      };
    }
    const current = selectedChar.combatPower;
    const withTs = history
      .map((h) => ({ ts: h.recordedAt?.toMillis(), cp: h.combatPower }))
      .filter((h): h is { ts: number; cp: number } => typeof h.ts === "number");

    const valueAt = (cutoff: number): number | null => {
      const firstAfter = withTs.find((h) => h.ts >= cutoff);
      if (firstAfter) return firstAfter.cp;
      if (withTs.length === 0) return null;
      return current;
    };

    const week = valueAt(nowMs - 7 * 24 * 60 * 60 * 1000);
    const month = valueAt(nowMs - 30 * 24 * 60 * 60 * 1000);
    const first = withTs.length > 0 ? withTs[0].cp : null;

    return {
      hasData: true,
      week: week === null ? null : current - week,
      month: month === null ? null : current - month,
      total: first === null ? null : current - first,
    } as {
      hasData: boolean;
      week: number | null;
      month: number | null;
      total: number | null;
    };
  }, [selectedChar, history, nowMs]);

  const stats = useMemo(() => {
    const n = characters.length;
    if (n === 0) {
      return {
        avgPower: 0,
        avgAbyss: "-",
        totalCharacters: 0,
        totalMembers: 0,
      };
    }
    const avgPower = Math.round(
      characters.reduce((s, c) => s + (c.combatPower || 0), 0) / n,
    );
    const hellVals = characters
      .map((c) => HELL_INDEX[c.hellStage])
      .filter((v): v is number => typeof v === "number");
    const avgAbyss =
      hellVals.length > 0
        ? hellLabelFromAverage(
            hellVals.reduce((s, v) => s + v, 0) / hellVals.length,
          )
        : "-";
    const owners = new Set(characters.map((c) => c.owner));
    return {
      avgPower,
      avgAbyss,
      totalCharacters: n,
      totalMembers: owners.size,
    };
  }, [characters]);

  if (!ready) return null;

  const characterOptions = myCharacters.map((c) => ({
    id: c.id,
    name: c.nickname,
    job: c.job,
  }));

  return (
    <section className="mb-14">
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
            성장 분석
          </h2>
          <p className="mt-2 font-serif text-[10px] tracking-[0.3em] text-text-sub uppercase">
            Growth Analysis
          </p>
        </div>

        {characterOptions.length > 0 && (
          <CharacterSelect
            value={selectedId ?? ""}
            onChange={setSelectedId}
            options={characterOptions}
            dl2={dl2}
          />
        )}
      </div>

      {/* Empty / gating states */}
      {!owner ? (
        <GlassCard>
          <p className="py-6 text-center font-serif text-sm italic text-text-sub">
            로그인하면 성장 분석을 볼 수 있습니다
          </p>
        </GlassCard>
      ) : myCharacters.length === 0 ? (
        <GlassCard>
          <p className="py-6 text-center font-serif text-sm italic text-text-sub">
            캐릭터를 등록하면 성장 분석을 볼 수 있습니다
          </p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Row 1: 투력+성장폭 묶음 + 빛난 별 (1:1) */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Merged: 투력 변화 + 성장폭 */}
            <GlassCard>
              {/* 투력 변화 */}
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-serif text-sm tracking-wider text-stardust">
                  투력 변화
                </h3>
                <div className="flex items-center gap-1 rounded-full border border-nebula-pink/20 bg-abyss-deep/40 p-0.5">
                  <TogglePill
                    active={rangeMode === "30d"}
                    onClick={() => setRangeMode("30d")}
                    dl2={dl2}
                  >
                    최근 30일
                  </TogglePill>
                  <TogglePill
                    active={rangeMode === "all"}
                    onClick={() => setRangeMode("all")}
                    dl2={dl2}
                  >
                    전체
                  </TogglePill>
                </div>
              </div>

              <div className="h-[180px] w-full">
                {series.length < 2 ? (
                  <EmptyChartState />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={series}
                      margin={{ top: 10, right: 8, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="powerLineGradient"
                          x1="0"
                          y1="0"
                          x2="1"
                          y2="0"
                        >
                          <stop offset="0%" stopColor={dl2 ? "#ffc785" : "#FFB5A7"} />
                          <stop offset="100%" stopColor={dl2 ? "#b85420" : "#D896C8"} />
                        </linearGradient>
                        <linearGradient
                          id="powerAreaGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={dl2 ? "#ff9a6c" : "#D896C8"} stopOpacity={dl2 ? 0.35 : 0.5} />
                          <stop offset="100%" stopColor={dl2 ? "#b85420" : "#6B4BA8"} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke={dl2 ? "rgba(42,69,112,0.1)" : "rgba(216,150,200,0.08)"}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        stroke={dl2 ? "#5a7090" : "rgba(155, 143, 184, 0.6)"}
                        fontSize={10}
                        tickLine={false}
                        axisLine={{ stroke: dl2 ? "rgba(42,69,112,0.15)" : "rgba(216,150,200,0.15)" }}
                        interval={Math.max(Math.floor(series.length / 6), 0)}
                      />
                      <YAxis
                        stroke={dl2 ? "#5a7090" : "rgba(155, 143, 184, 0.6)"}
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        domain={["dataMin - 200", "dataMax + 200"]}
                        tickFormatter={(v) =>
                          typeof v === "number" && v >= 1000
                            ? `${(v / 1000).toFixed(1)}k`
                            : String(v)
                        }
                        width={48}
                      />
                      <Tooltip
                        cursor={{
                          stroke: dl2 ? "rgba(184,84,32,0.45)" : "rgba(216,150,200,0.35)",
                          strokeDasharray: "3 3",
                        }}
                        contentStyle={{
                          background: dl2 ? "rgba(205,216,224,0.98)" : "rgba(11,8,33,0.94)",
                          border: dl2 ? "1px solid rgba(42,69,112,0.22)" : "1px solid rgba(216,150,200,0.3)",
                          borderRadius: 8,
                          fontSize: 11,
                          fontFamily: dl2
                            ? "'Pretendard Variable', Pretendard, 'Noto Sans KR', sans-serif"
                            : "'Noto Serif KR', serif",
                          backdropFilter: "blur(10px)",
                          padding: "8px 10px",
                        }}
                        labelStyle={{ color: dl2 ? "#5a7090" : "#9B8FB8" }}
                        itemStyle={{ color: dl2 ? "#b85420" : "#FFE5C4" }}
                        formatter={(v) => [
                          typeof v === "number" ? v.toLocaleString() : String(v),
                          "투력",
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="power"
                        stroke="url(#powerLineGradient)"
                        strokeWidth={2.5}
                        fill="url(#powerAreaGradient)"
                        dot={{
                          r: 2,
                          fill: dl2 ? "#b85420" : "#FFE5C4",
                          stroke: dl2 ? "#b85420" : "#D896C8",
                          strokeWidth: 1,
                        }}
                        activeDot={{
                          r: 4,
                          fill: dl2 ? "#b85420" : "#FFE5C4",
                          stroke: dl2 ? "#ff9a6c" : "#FFB5A7",
                          strokeWidth: 2,
                        }}
                        animationDuration={900}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* divider + 성장폭 */}
              <div
                className={
                  dl2
                    ? "mt-5 border-t pt-4"
                    : "mt-5 border-t border-nebula-pink/15 pt-4"
                }
                style={dl2 ? { borderColor: "rgba(92,58,31,0.15)" } : undefined}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="font-serif text-sm tracking-wider text-stardust">
                    성장폭
                  </h3>
                  {selectedChar && (
                    <span className="font-serif text-[9px] tracking-wider text-text-sub">
                      {selectedChar.nickname} 기준
                    </span>
                  )}
                </div>
                <div className="flex flex-col divide-y divide-nebula-pink/10">
                  <GrowthRow
                    label="이번 주"
                    value={growth.hasData ? growth.week : null}
                    series={weekSeries}
                    dl2={dl2}
                  />
                  <GrowthRow
                    label="이번 달"
                    value={growth.hasData ? growth.month : null}
                    dl2={dl2}
                  />
                  <GrowthRow
                    label="전체"
                    value={growth.hasData ? growth.total : null}
                    dl2={dl2}
                  />
                </div>
              </div>
            </GlassCard>

            {/* 가장 빛난 별들 */}
            <GlassCard>
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-peach-accent" />
                <h3 className="font-serif text-sm tracking-wider text-stardust">
                  가장 빛난 별들
                </h3>
                <span className="font-serif text-[9px] tracking-wider text-text-sub">
                  최근 7일
                </span>
              </div>
              {topGrowers.length === 0 ? (
                <p className="py-4 text-center font-serif text-[12px] italic text-text-sub/70">
                  최근 성장 기록이 없습니다
                </p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {topGrowers.map((g, i) => (
                    <TopGrowthRow
                      key={`${g.owner}-${g.name}-${i}`}
                      rank={i + 1}
                      entry={g}
                      dl2={dl2}
                    />
                  ))}
                </ol>
              )}
            </GlassCard>
          </div>

          {/* Row 2: 길드 통계 전체 폭 */}
          <GlassCard>
            <h3 className="mb-4 font-serif text-sm tracking-wider text-stardust">
              길드 통계
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile
                icon={
                  <Zap
                    className={`h-3.5 w-3.5 ${dl2 ? "" : "text-peach-accent"}`}
                    style={dl2 ? { color: "#8a6710" } : undefined}
                  />
                }
                label="평균 투력"
                value={stats.avgPower.toLocaleString()}
                dl2={dl2}
              />
              <StatTile
                icon={
                  <Flame
                    className={`h-3.5 w-3.5 ${dl2 ? "" : "text-peach-accent"}`}
                    style={dl2 ? { color: "#8a6710" } : undefined}
                  />
                }
                label="평균 지옥"
                value={stats.avgAbyss === "-" ? "-" : `지옥 ${stats.avgAbyss}`}
                dl2={dl2}
              />
              <StatTile
                icon={
                  <Users
                    className={`h-3.5 w-3.5 ${dl2 ? "" : "text-nebula-pink"}`}
                    style={dl2 ? { color: "#8a6710" } : undefined}
                  />
                }
                label="길드원"
                value={`${stats.totalMembers}명`}
                dl2={dl2}
              />
              <StatTile
                icon={
                  <TrendingUp
                    className={`h-3.5 w-3.5 ${dl2 ? "" : "text-nebula-pink"}`}
                    style={dl2 ? { color: "#8a6710" } : undefined}
                  />
                }
                label="캐릭터"
                value={`${stats.totalCharacters}개`}
                dl2={dl2}
              />
            </div>

            <JobDistributionPanel characters={characters} dl2={dl2} />
            <JobPowerStatsPanel characters={characters} dl2={dl2} />
            <JobGrowthPanel jobGrowth={jobGrowth} dl2={dl2} />
          </GlassCard>
        </div>
      )}
    </section>
  );
}

// ---------- Sub components ----------

function GlassCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border border-nebula-pink/20 bg-abyss-deep/40 p-4 backdrop-blur-xl sm:p-5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        boxShadow:
          "0 6px 24px rgba(11, 8, 33, 0.4), inset 0 1px 0 rgba(255, 229, 196, 0.04), inset 0 0 30px rgba(107, 75, 168, 0.08)",
      }}
    >
      {children}
    </div>
  );
}

function TogglePill({
  active,
  onClick,
  children,
  dl2 = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dl2?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        dl2
          ? "rounded-full px-2.5 py-1 font-serif text-[10px] tracking-wider transition-all"
          : `rounded-full px-2.5 py-1 font-serif text-[10px] tracking-wider transition-all ${
              active
                ? "border border-peach-accent/60 text-stardust"
                : "border border-transparent text-text-sub hover:text-stardust"
            }`
      }
      style={
        dl2
          ? active
            ? {
                background: "#2a4570",
                border: "1px solid #2a4570",
                color: "#fef5e6",
                boxShadow: "none",
              }
            : {
                background: "transparent",
                border: "1px solid #2a4570",
                color: "#2a4570",
              }
          : active
            ? {
                background: "rgba(255, 181, 167, 0.1)",
                boxShadow: "0 0 10px rgba(255, 181, 167, 0.25)",
              }
            : undefined
      }
    >
      {children}
    </button>
  );
}

function CharacterSelect({
  value,
  onChange,
  options,
  dl2 = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string; job: string }[];
  dl2?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value) ?? options[0];
  if (!current) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          dl2
            ? "flex items-center gap-2 rounded-full px-3 py-1.5 font-serif text-xs tracking-wider transition-all"
            : "flex items-center gap-2 rounded-full border border-nebula-pink/30 bg-abyss-deep/50 px-3 py-1.5 font-serif text-xs tracking-wider text-stardust backdrop-blur-md transition-all hover:border-nebula-pink/60"
        }
        style={
          dl2
            ? {
                background: "rgba(255, 255, 255, 0.55)",
                border: "1px solid rgba(92, 58, 31, 0.2)",
                color: "#5c3a1f",
              }
            : undefined
        }
      >
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full"
          style={{
            background: dl2
              ? "rgba(196, 153, 47, 0.18)"
              : "linear-gradient(135deg, rgba(107, 75, 168, 0.5), rgba(216, 150, 200, 0.3))",
            border: dl2
              ? "1px solid rgba(196, 153, 47, 0.4)"
              : "1px solid rgba(216, 150, 200, 0.35)",
            color: dl2 ? "#8a6710" : "#ffe5c4",
          }}
        >
          <JobIcon job={current.job} size={11} />
        </span>
        {current.name}{" "}
        <span style={{ color: dl2 ? "#8a6a4a" : undefined }} className={dl2 ? "" : "text-text-sub"}>
          ({current.job})
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${
            open ? "rotate-180" : ""
          } ${dl2 ? "" : "text-nebula-pink"}`}
          style={dl2 ? { color: "#5c3a1f" } : undefined}
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
            role="listbox"
            className={
              dl2
                ? "absolute right-0 top-full z-[50] mt-2 flex min-w-[180px] flex-col gap-0.5 rounded-xl p-1 backdrop-blur-xl"
                : "absolute right-0 top-full z-[50] mt-2 flex min-w-[180px] flex-col gap-0.5 rounded-xl border border-nebula-pink/25 bg-abyss-deep/95 p-1 backdrop-blur-xl"
            }
            style={
              dl2
                ? {
                    background: "rgba(255, 255, 255, 0.96)",
                    border: "1px solid rgba(92, 58, 31, 0.18)",
                    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
                  }
                : {
                    boxShadow:
                      "0 8px 24px rgba(0, 0, 0, 0.4), 0 0 18px rgba(216, 150, 200, 0.2)",
                  }
            }
          >
            {options.map((o) => {
              const active = o.id === value;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    className={
                      dl2
                        ? "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-serif text-xs tracking-wider transition-colors"
                        : `flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-serif text-xs tracking-wider transition-colors ${
                            active
                              ? "bg-nebula-pink/15 text-stardust"
                              : "text-text-sub hover:bg-nebula-pink/10 hover:text-stardust"
                          }`
                    }
                    style={
                      dl2
                        ? {
                            background: active
                              ? "rgba(196, 153, 47, 0.18)"
                              : "transparent",
                            color: active ? "#5c3a1f" : "#5c3a1f",
                          }
                        : undefined
                    }
                  >
                    <span
                      className="flex h-4 w-4 items-center justify-center"
                      style={{
                        color: dl2 ? "#8a6710" : undefined,
                      }}
                    >
                      <JobIcon job={o.job} size={11} />
                    </span>
                    {o.name}
                    <span
                      className={dl2 ? "ml-auto text-[10px]" : "ml-auto text-[10px] text-text-sub"}
                      style={{ color: dl2 ? "#8a6a4a" : undefined }}
                    >
                      {o.job}
                    </span>
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

function GrowthRow({
  label,
  value,
  series,
  dl2 = false,
}: {
  label: string;
  value: number | null;
  series?: { power: number }[];
  dl2?: boolean;
}) {
  const up = (value ?? 0) >= 0;
  const dl2UpColor = "#8a6710";
  const dl2DownColor = "#a8691f";
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span
        className={
          dl2
            ? "font-serif text-[11px] tracking-wider"
            : "font-serif text-[11px] tracking-wider text-text-sub"
        }
        style={dl2 ? { color: "#5c3a1f" } : undefined}
      >
        {label}
      </span>
      {value === null ? (
        <span
          className={
            dl2
              ? "font-serif text-[11px] italic"
              : "font-serif text-[11px] italic text-text-sub/70"
          }
          style={dl2 ? { color: "#8a6a4a" } : undefined}
        >
          기록 부족
        </span>
      ) : (
        <div className="flex items-center gap-2">
          {series && series.length > 1 && <MiniSparkline series={series} dl2={dl2} />}
          <span
            className={
              dl2
                ? "font-mono text-sm tabular-nums"
                : "font-mono text-sm font-medium tabular-nums"
            }
            style={{
              color: dl2
                ? up
                  ? dl2UpColor
                  : dl2DownColor
                : up
                  ? "#A8E8C0"
                  : "#E8A8B8",
              fontWeight: dl2 ? 700 : undefined,
            }}
          >
            {up && value > 0 ? "+" : ""}
            {value.toLocaleString()}
          </span>
          <span
            aria-hidden
            style={{
              color: dl2
                ? up
                  ? dl2UpColor
                  : dl2DownColor
                : up
                  ? "#A8E8C0"
                  : "#E8A8B8",
            }}
          >
            <TrendingUp className={`h-3.5 w-3.5 ${up ? "" : "rotate-180"}`} />
          </span>
        </div>
      )}
    </div>
  );
}

function MiniSparkline({
  series,
  dl2 = false,
}: {
  series: { power: number }[];
  dl2?: boolean;
}) {
  const values = series.map((s) => s.power);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const w = 60;
  const h = 18;
  const denom = Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => {
      const x = (i / denom) * w;
      const y = h - ((v - min) / Math.max(max - min, 1)) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={dl2 ? "#8a6710" : "#A8E8C0"}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          filter: dl2
            ? "drop-shadow(0 0 3px rgba(138, 103, 16, 0.35))"
            : "drop-shadow(0 0 4px rgba(168, 232, 192, 0.6))",
        }}
      />
    </svg>
  );
}

function TopGrowthRow({
  rank,
  entry,
  dl2 = false,
}: {
  rank: number;
  entry: { name: string; job: string; delta: number };
  dl2?: boolean;
}) {
  const isGold = rank === 1;
  const medalColor =
    rank === 1
      ? "#FFE5C4"
      : rank === 2
        ? "#D8D8E8"
        : rank === 3
          ? "#E8B088"
          : "#9B8FB8";

  if (dl2) {
    const isTopTier = rank === 1;
    const isMidTier = rank === 2 || rank === 3;
    const nickColor = isMidTier ? "#5c3a1f" : "#8a6a4a";
    const nickWeight = isTopTier || isMidTier ? 700 : 500;
    const jobLabelColor = "#8a6a4a";
    const scoreColor = "#8a6710";
    const scoreWeight = isTopTier || isMidTier ? 700 : 500;
    const scoreOpacity = isTopTier || isMidTier ? 1 : 0.75;

    return (
      <li
        className="group flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors"
        style={{
          background: isTopTier
            ? "radial-gradient(circle at 30% 30%, rgba(196, 153, 47, 0.32) 0%, rgba(196, 153, 47, 0.18) 100%)"
            : "#ffffff",
          border: isTopTier
            ? "1px solid rgba(196, 153, 47, 0.55)"
            : "1px solid rgba(92, 58, 31, 0.12)",
          boxShadow: isTopTier
            ? "0 1px 8px rgba(196, 153, 47, 0.25)"
            : "0 1px 2px rgba(92, 58, 31, 0.06)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-6 w-6 items-center justify-center">
            {isGold && (
              <Crown
                className="absolute -top-1.5 h-3 w-3"
                style={{
                  color: "#c4992f",
                  filter: "drop-shadow(0 0 5px rgba(196, 153, 47, 0.7))",
                }}
                aria-hidden
              />
            )}
            <span
              className="flex h-full w-full items-center justify-center rounded-full font-serif text-[10px]"
              style={{
                background: isTopTier
                  ? "radial-gradient(circle, rgba(255, 229, 196, 0.6) 0%, rgba(196, 153, 47, 0.25) 100%)"
                  : "rgba(255, 255, 255, 0.6)",
                border: isTopTier
                  ? "1px solid rgba(196, 153, 47, 0.6)"
                  : "1px solid rgba(92, 58, 31, 0.18)",
                color: isTopTier ? "#8a6710" : nickColor,
                fontWeight: 700,
                boxShadow: isTopTier
                  ? "0 0 8px rgba(196, 153, 47, 0.4)"
                  : "none",
              }}
            >
              {rank}
            </span>
          </span>
          <span
            className="flex h-5 w-5 items-center justify-center"
            style={{ color: "#8a6710" }}
          >
            <JobIcon job={entry.job} size={12} />
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span
              className="truncate font-serif text-[12px] tracking-wide"
              style={{
                color: isTopTier ? "#fef5e6" : nickColor,
                fontWeight: nickWeight,
                textShadow: isTopTier
                  ? "0 1px 2px rgba(92, 58, 31, 0.3)"
                  : "none",
              }}
            >
              {entry.name}
            </span>
            <span
              className="font-serif text-[9px] tracking-wider"
              style={{
                color: isTopTier ? "rgba(255, 245, 230, 0.8)" : jobLabelColor,
              }}
            >
              {entry.job}
            </span>
          </div>
        </div>
        <span
          className="font-mono text-sm tabular-nums"
          style={{
            color: isTopTier ? "#fef5e6" : scoreColor,
            fontWeight: scoreWeight,
            opacity: scoreOpacity,
            textShadow: isTopTier
              ? "0 1px 2px rgba(92, 58, 31, 0.3)"
              : "none",
          }}
        >
          +{entry.delta.toLocaleString()}
        </span>
      </li>
    );
  }

  return (
    <li className="group flex items-center justify-between gap-3 rounded-lg px-1.5 py-1 transition-colors hover:bg-nebula-pink/10">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-6 w-6 items-center justify-center">
          {isGold && (
            <Crown
              className="absolute -top-1.5 h-3 w-3 text-peach-accent"
              style={{ filter: "drop-shadow(0 0 5px rgba(255, 229, 196, 0.8))" }}
              aria-hidden
            />
          )}
          <span
            className="flex h-full w-full items-center justify-center rounded-full font-serif text-[10px] font-semibold"
            style={{
              background: isGold
                ? "radial-gradient(circle, rgba(255, 229, 196, 0.4) 0%, rgba(255, 181, 167, 0.15) 100%)"
                : "rgba(26, 15, 61, 0.6)",
              border: `1px solid ${medalColor}55`,
              color: medalColor,
              boxShadow: isGold ? "0 0 10px rgba(255, 229, 196, 0.5)" : "none",
            }}
          >
            {rank}
          </span>
        </span>
        <span className="flex h-5 w-5 items-center justify-center text-nebula-pink/80">
          <JobIcon job={entry.job} size={12} />
        </span>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-serif text-[12px] tracking-wide text-stardust">
            {entry.name}
          </span>
          <span className="font-serif text-[9px] tracking-wider text-text-sub">
            {entry.job}
          </span>
        </div>
      </div>
      <span
        className="font-mono text-sm font-semibold tabular-nums"
        style={{ color: "#A8E8C0" }}
      >
        +{entry.delta.toLocaleString()}
      </span>
    </li>
  );
}

function StatTile({
  icon,
  label,
  value,
  dl2 = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  dl2?: boolean;
}) {
  return (
    <div
      className={
        dl2
          ? "rounded-xl p-3"
          : "rounded-xl border border-nebula-pink/15 bg-abyss/50 p-3"
      }
      style={
        dl2
          ? {
              background: "rgba(255, 255, 255, 0.4)",
              border: "1px solid rgba(92, 58, 31, 0.12)",
              boxShadow: "0 1px 2px rgba(92, 58, 31, 0.04)",
            }
          : { boxShadow: "inset 0 1px 0 rgba(255, 229, 196, 0.04)" }
      }
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span
          className={
            dl2
              ? "font-serif text-[10px] tracking-wider"
              : "font-serif text-[10px] tracking-wider text-text-sub"
          }
          style={dl2 ? { color: "#5c3a1f" } : undefined}
        >
          {label}
        </span>
      </div>
      <div
        className={
          dl2
            ? "mt-1.5 font-mono text-lg tabular-nums"
            : "mt-1.5 font-mono text-lg font-medium tabular-nums"
        }
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
        {value}
      </div>
    </div>
  );
}

// Job-specific colors — consistent across donut + legend, both themes.
// Picked for visual recognition (e.g. 빙결=ice blue, 전격=lightning yellow).
const JOB_COLORS: Record<string, string> = {
  대검: "#6B7280",
  검술: "#9CA3AF",
  궁수: "#65A30D",
  장궁: "#16A34A",
  석궁: "#0D9488",
  화법: "#DC2626",
  빙결: "#3B82F6",
  전격: "#FBBF24",
  법사: "#A855F7",
  힐러: "#22D3EE",
  사제: "#F59E0B",
  수도: "#92400E",
  암흑: "#7C3AED",
  음유: "#EC4899",
  악사: "#F97316",
  댄서: "#E11D48",
  도적: "#525252",
  듀블: "#1F2937",
  격가: "#EF4444",
  전사: "#B45309",
  기사: "#CA8A04",
};

function jobColor(job: string, dl2: boolean): string {
  return (
    JOB_COLORS[job] ?? (dl2 ? "rgba(92,58,31,0.45)" : "rgba(155,143,184,0.5)")
  );
}

function JobDistributionPanel({
  characters,
  dl2 = false,
}: {
  characters: GrowthCharacter[];
  dl2?: boolean;
}) {
  const distribution = useMemo(() => {
    if (characters.length === 0) return [] as {
      job: string;
      count: number;
      percent: number;
    }[];
    const counts = new Map<string, number>();
    for (const c of characters) {
      const job = c.job || "(미입력)";
      counts.set(job, (counts.get(job) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const total = characters.length;
    return sorted.map(([job, count]) => ({
      job,
      count,
      percent: total > 0 ? (count / total) * 100 : 0,
    }));
  }, [characters]);

  if (distribution.length === 0) return null;

  return (
    <div
      className={
        dl2
          ? "mt-5 border-t pt-4"
          : "mt-5 border-t border-nebula-pink/15 pt-4"
      }
      style={dl2 ? { borderColor: "rgba(92,58,31,0.15)" } : undefined}
    >
      <h4
        className="mb-3 font-serif text-[11px] tracking-[0.18em]"
        style={dl2 ? { color: "#5c3a1f" } : { color: "#9B8FB8" }}
      >
        직업 분포
      </h4>
      <div className="flex flex-col items-center gap-5 md:flex-row md:items-start md:justify-center md:gap-8">
        <div className="relative flex-shrink-0" style={{ width: 180, height: 180 }}>
          <PieChart width={180} height={180}>
            <Pie
              data={distribution}
              dataKey="count"
              nameKey="job"
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={82}
              stroke={dl2 ? "rgba(92,58,31,0.18)" : "rgba(11,8,33,0.55)"}
              strokeWidth={1}
              isAnimationActive
              animationDuration={700}
            >
              {distribution.map((entry) => (
                <Cell key={entry.job} fill={jobColor(entry.job, dl2)} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: dl2 ? "rgba(255,245,230,0.98)" : "rgba(11,8,33,0.94)",
                border: dl2
                  ? "1px solid rgba(92,58,31,0.2)"
                  : "1px solid rgba(216,150,200,0.3)",
                borderRadius: 8,
                fontSize: 11,
                fontFamily: dl2
                  ? "'Pretendard Variable', Pretendard, 'Noto Sans KR', sans-serif"
                  : "'Noto Serif KR', serif",
                padding: "6px 10px",
              }}
              labelStyle={{ color: dl2 ? "#5a7090" : "#9B8FB8" }}
              itemStyle={{ color: dl2 ? "#5c3a1f" : "#FFE5C4" }}
              formatter={(v) => [
                typeof v === "number" ? `${v}명` : String(v),
                "캐릭터",
              ]}
            />
          </PieChart>
          <div
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
            aria-hidden
          >
            <span
              className="font-mono text-xl tabular-nums"
              style={{
                color: dl2 ? "#8a6710" : "#FFE5C4",
                fontWeight: 700,
              }}
            >
              {characters.length}
            </span>
            <span
              className="font-serif text-[9px] tracking-[0.18em]"
              style={{ color: dl2 ? "#8a6a4a" : "#9B8FB8" }}
            >
              CHARS
            </span>
          </div>
        </div>
        <ul className="grid w-full max-w-[520px] grid-cols-1 gap-1.5 px-4 sm:grid-cols-2 md:max-w-none md:flex-1 md:px-0">
          {distribution.map((item) => (
            <li
              key={item.job}
              className="grid items-center gap-2 font-serif text-[11px]"
              style={{
                gridTemplateColumns: "12px 1fr 56px 56px",
                color: dl2 ? "#5c3a1f" : "#FFE5C4",
              }}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: jobColor(item.job, dl2) }}
              />
              <span className="truncate">{item.job}</span>
              <span
                className="text-right font-mono tabular-nums"
                style={{ color: dl2 ? "#8a6710" : "#D896C8" }}
              >
                {item.count}명
              </span>
              <span
                className="text-right font-mono text-[10px] tabular-nums opacity-70"
                style={{ color: dl2 ? "#8a6a4a" : "#9B8FB8" }}
              >
                {item.percent.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

type JobPowerStat = {
  job: string;
  count: number;
  avgPower: number;
  maxPower: number;
  avgHellLabel: string;
};

function computeJobPowerStats(characters: GrowthCharacter[]): JobPowerStat[] {
  if (characters.length === 0) return [];
  const groups = new Map<string, GrowthCharacter[]>();
  for (const c of characters) {
    const job = c.job || "(미입력)";
    const arr = groups.get(job);
    if (arr) arr.push(c);
    else groups.set(job, [c]);
  }
  const stats: JobPowerStat[] = [...groups.entries()].map(([job, chars]) => {
    const powers = chars.map((c) => c.combatPower || 0);
    const avgPower = Math.round(
      powers.reduce((a, b) => a + b, 0) / chars.length,
    );
    const maxPower = powers.length > 0 ? Math.max(...powers) : 0;
    const hellIndices = chars
      .map((c) => HELL_INDEX[c.hellStage])
      .filter((v): v is number => typeof v === "number");
    const avgHellIndex =
      hellIndices.length > 0
        ? hellIndices.reduce((a, b) => a + b, 0) / hellIndices.length
        : Number.NaN;
    return {
      job,
      count: chars.length,
      avgPower,
      maxPower,
      avgHellLabel: hellLabelFromAverage(avgHellIndex),
    };
  });
  stats.sort((a, b) => b.avgPower - a.avgPower);
  return stats;
}

function JobPowerStatsPanel({
  characters,
  dl2 = false,
}: {
  characters: GrowthCharacter[];
  dl2?: boolean;
}) {
  const stats = useMemo(() => computeJobPowerStats(characters), [characters]);

  if (stats.length === 0) return null;

  const globalMax = Math.max(...stats.map((s) => s.avgPower), 1);

  return (
    <div
      className={
        dl2
          ? "mt-5 border-t pt-4"
          : "mt-5 border-t border-nebula-pink/15 pt-4"
      }
      style={dl2 ? { borderColor: "rgba(92,58,31,0.15)" } : undefined}
    >
      <h4
        className="mb-3 font-serif text-[11px] tracking-[0.18em]"
        style={dl2 ? { color: "#5c3a1f" } : { color: "#9B8FB8" }}
      >
        직업별 투력
      </h4>
      <ul className="flex flex-col gap-2">
        {stats.map((s) => {
          const pct = Math.min((s.avgPower / globalMax) * 100, 100);
          const color = jobColor(s.job, dl2);
          return (
            <li
              key={s.job}
              className="grid items-center gap-3 font-serif"
              style={{
                gridTemplateColumns: "16px 56px 1fr 88px 64px",
              }}
            >
              <span
                className="flex h-4 w-4 items-center justify-center"
                style={{ color }}
              >
                <JobIcon job={s.job} size={12} />
              </span>
              <span
                className="truncate text-[11px]"
                style={{ color: dl2 ? "#5c3a1f" : "#FFE5C4" }}
              >
                {s.job}
              </span>
              <div
                aria-hidden
                className="h-2 w-full overflow-hidden rounded-full"
                style={{
                  background: dl2
                    ? "rgba(92,58,31,0.1)"
                    : "rgba(155,143,184,0.15)",
                }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: color,
                    transition: "width 700ms ease",
                  }}
                />
              </div>
              <div className="flex flex-col items-end leading-tight">
                <span
                  className="font-mono text-[11px] tabular-nums"
                  style={{ color: dl2 ? "#8a6710" : "#FFE5C4" }}
                >
                  {s.avgPower.toLocaleString()}
                </span>
                <span
                  className="font-mono text-[9px] tabular-nums opacity-65"
                  style={{ color: dl2 ? "#8a6a4a" : "#9B8FB8" }}
                >
                  max {s.maxPower.toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col items-end leading-tight">
                <span
                  className="font-mono text-[10px] tabular-nums"
                  style={{ color: dl2 ? "#5c3a1f" : "#D896C8" }}
                >
                  {s.count}명
                </span>
                <span
                  className="font-mono text-[9px] tabular-nums opacity-65"
                  style={{ color: dl2 ? "#8a6a4a" : "#9B8FB8" }}
                >
                  {s.avgHellLabel === "-"
                    ? "지옥 -"
                    : `지옥 ${s.avgHellLabel}`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function JobGrowthPanel({
  jobGrowth,
  dl2 = false,
}: {
  jobGrowth: { job: string; count: number; avg7d: number; avg30d: number }[];
  dl2?: boolean;
}) {
  const [mode, setMode] = useState<"7d" | "30d">("7d");

  if (jobGrowth.length === 0) return null;

  const sorted = [...jobGrowth].sort((a, b) =>
    mode === "7d" ? b.avg7d - a.avg7d : b.avg30d - a.avg30d,
  );
  const globalMax = Math.max(
    ...sorted.map((s) => (mode === "7d" ? s.avg7d : s.avg30d)),
    1,
  );

  const positiveColor = dl2 ? "#8a6710" : "#A8E8C0";
  const negativeColor = dl2 ? "#a8691f" : "#E8A8B8";

  return (
    <div
      className={
        dl2
          ? "mt-5 border-t pt-4"
          : "mt-5 border-t border-nebula-pink/15 pt-4"
      }
      style={dl2 ? { borderColor: "rgba(92,58,31,0.15)" } : undefined}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4
          className="font-serif text-[11px] tracking-[0.18em]"
          style={dl2 ? { color: "#5c3a1f" } : { color: "#9B8FB8" }}
        >
          직업별 성장
        </h4>
        <div className="flex items-center gap-1 rounded-full border border-nebula-pink/20 bg-abyss-deep/40 p-0.5">
          <TogglePill
            active={mode === "7d"}
            onClick={() => setMode("7d")}
            dl2={dl2}
          >
            7일
          </TogglePill>
          <TogglePill
            active={mode === "30d"}
            onClick={() => setMode("30d")}
            dl2={dl2}
          >
            30일
          </TogglePill>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {sorted.map((s) => {
          const avg = mode === "7d" ? s.avg7d : s.avg30d;
          const pct = Math.min(Math.max((avg / globalMax) * 100, 0), 100);
          const color = jobColor(s.job, dl2);
          const valueColor =
            avg >= 0 ? (avg === 0 ? color : positiveColor) : negativeColor;
          return (
            <li
              key={s.job}
              className="grid items-center gap-3 font-serif"
              style={{
                gridTemplateColumns: "16px 56px 1fr 88px 48px",
              }}
            >
              <span
                className="flex h-4 w-4 items-center justify-center"
                style={{ color }}
              >
                <JobIcon job={s.job} size={12} />
              </span>
              <span
                className="truncate text-[11px]"
                style={{ color: dl2 ? "#5c3a1f" : "#FFE5C4" }}
              >
                {s.job}
              </span>
              <div
                aria-hidden
                className="h-2 w-full overflow-hidden rounded-full"
                style={{
                  background: dl2
                    ? "rgba(92,58,31,0.1)"
                    : "rgba(155,143,184,0.15)",
                }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: color,
                    transition: "width 700ms ease",
                  }}
                />
              </div>
              <div className="flex flex-col items-end leading-tight">
                <span
                  className="font-mono text-[11px] tabular-nums"
                  style={{ color: valueColor, fontWeight: 600 }}
                >
                  {avg >= 0 && avg > 0 ? "+" : ""}
                  {avg.toLocaleString()}
                </span>
                <span
                  className="font-mono text-[9px] tabular-nums opacity-60"
                  style={{ color: dl2 ? "#8a6a4a" : "#9B8FB8" }}
                >
                  평균
                </span>
              </div>
              <span
                className="text-right font-mono text-[10px] tabular-nums"
                style={{ color: dl2 ? "#5c3a1f" : "#D896C8" }}
              >
                {s.count}명
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmptyChartState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <svg width="90" height="60" viewBox="0 0 90 60" aria-hidden>
        <g stroke="rgba(216, 150, 200, 0.35)" strokeWidth="0.8" fill="none">
          <line x1="12" y1="40" x2="30" y2="20" strokeDasharray="2 3" />
          <line x1="30" y1="20" x2="55" y2="35" strokeDasharray="2 3" />
          <line x1="55" y1="35" x2="78" y2="18" strokeDasharray="2 3" />
        </g>
        <g fill="#FFE5C4">
          <circle cx="12" cy="40" r="1.5" />
          <circle cx="30" cy="20" r="2" />
          <circle cx="55" cy="35" r="1.5" />
          <circle cx="78" cy="18" r="2" />
        </g>
      </svg>
      <p className="max-w-[220px] break-keep font-serif text-[11px] italic leading-relaxed text-text-sub">
        투력을 2번 이상 업데이트하면 성장 그래프를 볼 수 있어요
      </p>
    </div>
  );
}
