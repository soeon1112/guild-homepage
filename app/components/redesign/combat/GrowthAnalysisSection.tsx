"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
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
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
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
}: {
  characters: GrowthCharacter[];
  owner: string | null;
  ready: boolean;
}) {
  const myCharacters = useMemo(
    () => (owner ? characters.filter((c) => c.owner === owner) : []),
    [characters, owner],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [rangeMode, setRangeMode] = useState<"30d" | "all">("30d");
  const [topGrowers, setTopGrowers] = useState<Grower[]>([]);
  const [nowMs, setNowMs] = useState<number | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (characters.length === 0) {
        if (!cancelled) setTopGrowers([]);
        return;
      }
      const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const results = await Promise.all(
        characters.map(async (c) => {
          try {
            const snap = await getDocs(
              query(
                collection(db, "characters", c.id, "history"),
                orderBy("recordedAt", "asc"),
              ),
            );
            const entries = snap.docs.map((d) => d.data() as HistoryEntry);
            const firstRecent = entries.find((e) => {
              const ms = e.recordedAt?.toMillis();
              return typeof ms === "number" && ms >= sevenDaysAgoMs;
            });
            if (!firstRecent) return null;
            const delta = c.combatPower - firstRecent.combatPower;
            if (delta <= 0) return null;
            return {
              owner: c.owner,
              name: c.nickname,
              job: c.job,
              delta,
            } as Grower;
          } catch (e) {
            console.error(e);
            return null;
          }
        }),
      );
      if (cancelled) return;
      const filtered = results.filter((r): r is Grower => r !== null);
      filtered.sort((a, b) => b.delta - a.delta);
      setTopGrowers(filtered.slice(0, 5));
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [characters]);

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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Top-left: power graph */}
          <GlassCard>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-serif text-sm tracking-wider text-stardust">
                투력 변화
              </h3>
              <div className="flex items-center gap-1 rounded-full border border-nebula-pink/20 bg-abyss-deep/40 p-0.5">
                <TogglePill
                  active={rangeMode === "30d"}
                  onClick={() => setRangeMode("30d")}
                >
                  최근 30일
                </TogglePill>
                <TogglePill
                  active={rangeMode === "all"}
                  onClick={() => setRangeMode("all")}
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
                        <stop offset="0%" stopColor="#FFB5A7" />
                        <stop offset="100%" stopColor="#D896C8" />
                      </linearGradient>
                      <linearGradient
                        id="powerAreaGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor="#D896C8" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#6B4BA8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="rgba(216,150,200,0.08)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      stroke="rgba(155, 143, 184, 0.6)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={{ stroke: "rgba(216,150,200,0.15)" }}
                      interval={Math.max(Math.floor(series.length / 6), 0)}
                    />
                    <YAxis
                      stroke="rgba(155, 143, 184, 0.6)"
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
                        stroke: "rgba(216,150,200,0.35)",
                        strokeDasharray: "3 3",
                      }}
                      contentStyle={{
                        background: "rgba(11,8,33,0.94)",
                        border: "1px solid rgba(216,150,200,0.3)",
                        borderRadius: 8,
                        fontSize: 11,
                        fontFamily: "'Noto Serif KR', serif",
                        backdropFilter: "blur(10px)",
                        padding: "8px 10px",
                      }}
                      labelStyle={{ color: "#9B8FB8" }}
                      itemStyle={{ color: "#FFE5C4" }}
                      formatter={(v) => [
                        typeof v === "number" ? v.toLocaleString() : String(v),
                        "투력",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="power"
                      stroke="url(#powerLineGradient)"
                      strokeWidth={2}
                      fill="url(#powerAreaGradient)"
                      dot={{
                        r: 2,
                        fill: "#FFE5C4",
                        stroke: "#D896C8",
                        strokeWidth: 1,
                      }}
                      activeDot={{
                        r: 4,
                        fill: "#FFE5C4",
                        stroke: "#FFB5A7",
                        strokeWidth: 2,
                      }}
                      animationDuration={900}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </GlassCard>

          {/* Top-right: growth deltas */}
          <GlassCard>
            <div className="mb-3 flex items-center justify-between gap-3">
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
              />
              <GrowthRow
                label="이번 달"
                value={growth.hasData ? growth.month : null}
              />
              <GrowthRow
                label="전체"
                value={growth.hasData ? growth.total : null}
              />
            </div>
          </GlassCard>

          {/* Bottom-left: top 5 */}
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
                  <TopGrowthRow key={`${g.owner}-${g.name}-${i}`} rank={i + 1} entry={g} />
                ))}
              </ol>
            )}
          </GlassCard>

          {/* Bottom-right: guild stats */}
          <GlassCard>
            <h3 className="mb-4 font-serif text-sm tracking-wider text-stardust">
              길드 통계
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                icon={<Zap className="h-3.5 w-3.5 text-peach-accent" />}
                label="평균 투력"
                value={stats.avgPower.toLocaleString()}
              />
              <StatTile
                icon={<Flame className="h-3.5 w-3.5 text-peach-accent" />}
                label="평균 지옥"
                value={stats.avgAbyss === "-" ? "-" : `지옥 ${stats.avgAbyss}`}
              />
              <StatTile
                icon={<Users className="h-3.5 w-3.5 text-nebula-pink" />}
                label="길드원"
                value={`${stats.totalMembers}명`}
              />
              <StatTile
                icon={<TrendingUp className="h-3.5 w-3.5 text-nebula-pink" />}
                label="캐릭터"
                value={`${stats.totalCharacters}개`}
              />
            </div>
          </GlassCard>
        </div>
      )}
    </section>
  );
}

// ---------- Sub components ----------

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-nebula-pink/20 bg-abyss-deep/40 p-4 backdrop-blur-xl sm:p-5"
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
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 font-serif text-[10px] tracking-wider transition-all ${
        active
          ? "border border-peach-accent/60 text-stardust"
          : "border border-transparent text-text-sub hover:text-stardust"
      }`}
      style={
        active
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
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string; job: string }[];
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
        className="flex items-center gap-2 rounded-full border border-nebula-pink/30 bg-abyss-deep/50 px-3 py-1.5 font-serif text-xs tracking-wider text-stardust backdrop-blur-md transition-all hover:border-nebula-pink/60"
      >
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full text-stardust"
          style={{
            background:
              "linear-gradient(135deg, rgba(107, 75, 168, 0.5), rgba(216, 150, 200, 0.3))",
            border: "1px solid rgba(216, 150, 200, 0.35)",
          }}
        >
          <JobIcon job={current.job} size={11} />
        </span>
        {current.name}{" "}
        <span className="text-text-sub">({current.job})</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-nebula-pink transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <>
          <div
            aria-hidden
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
          />
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            role="listbox"
            className="absolute right-0 top-full z-30 mt-2 flex min-w-[180px] flex-col gap-0.5 rounded-xl border border-nebula-pink/25 bg-abyss-deep/95 p-1 backdrop-blur-xl"
            style={{
              boxShadow:
                "0 8px 24px rgba(0, 0, 0, 0.4), 0 0 18px rgba(216, 150, 200, 0.2)",
            }}
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
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-serif text-xs tracking-wider transition-colors ${
                      active
                        ? "bg-nebula-pink/15 text-stardust"
                        : "text-text-sub hover:bg-nebula-pink/10 hover:text-stardust"
                    }`}
                  >
                    <span className="flex h-4 w-4 items-center justify-center text-nebula-pink">
                      <JobIcon job={o.job} size={11} />
                    </span>
                    {o.name}
                    <span className="ml-auto text-[10px] text-text-sub">
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
}: {
  label: string;
  value: number | null;
  series?: { power: number }[];
}) {
  const up = (value ?? 0) >= 0;
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="font-serif text-[11px] tracking-wider text-text-sub">
        {label}
      </span>
      {value === null ? (
        <span className="font-serif text-[11px] italic text-text-sub/70">
          기록 부족
        </span>
      ) : (
        <div className="flex items-center gap-2">
          {series && series.length > 1 && <MiniSparkline series={series} />}
          <span
            className="font-mono text-sm font-medium tabular-nums"
            style={{ color: up ? "#A8E8C0" : "#E8A8B8" }}
          >
            {up && value > 0 ? "+" : ""}
            {value.toLocaleString()}
          </span>
          <span aria-hidden style={{ color: up ? "#A8E8C0" : "#E8A8B8" }}>
            <TrendingUp className={`h-3.5 w-3.5 ${up ? "" : "rotate-180"}`} />
          </span>
        </div>
      )}
    </div>
  );
}

function MiniSparkline({ series }: { series: { power: number }[] }) {
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
        stroke="#A8E8C0"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: "drop-shadow(0 0 4px rgba(168, 232, 192, 0.6))" }}
      />
    </svg>
  );
}

function TopGrowthRow({
  rank,
  entry,
}: {
  rank: number;
  entry: { name: string; job: string; delta: number };
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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className="rounded-xl border border-nebula-pink/15 bg-abyss/50 p-3"
      style={{ boxShadow: "inset 0 1px 0 rgba(255, 229, 196, 0.04)" }}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="font-serif text-[10px] tracking-wider text-text-sub">
          {label}
        </span>
      </div>
      <div
        className="mt-1.5 font-mono text-lg font-medium tabular-nums"
        style={{
          backgroundImage: "linear-gradient(135deg, #FFE5C4, #D896C8)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
        }}
      >
        {value}
      </div>
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
