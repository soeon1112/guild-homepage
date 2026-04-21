"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { db } from "@/src/lib/firebase";

type RuneBuild = {
  name: string;
  dps: number;
  isPublic: boolean;
};

export type CombatCharacter = {
  id: string;
  owner: string;
  nickname: string;
  job: string;
  combatPower: number;
  hellStage: string;
  challenge: string;
  runeBuilds?: RuneBuild[];
};

type HistoryEntry = {
  combatPower: number;
  recordedAt: Timestamp | null;
};

type Point = {
  ts: number;
  label: string;
  combatPower: number;
};

type Grower = {
  owner: string;
  nickname: string;
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
  if (rounded <= 0) return "매어 이하";
  if (rounded >= 15) return "지옥15";
  return `지옥${rounded}`;
}

function formatDayLabel(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatSignedDelta(n: number): string {
  if (n > 0) return `+${n.toLocaleString()}`;
  if (n < 0) return n.toLocaleString();
  return "0";
}

function ArrowIndicator({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span className="growth-arrow growth-arrow-up" aria-label="상승">
        ▲
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="growth-arrow growth-arrow-down" aria-label="하락">
        ▼
      </span>
    );
  }
  return (
    <span className="growth-arrow growth-arrow-flat" aria-label="변동 없음">
      ▬
    </span>
  );
}

type Props = {
  characters: CombatCharacter[];
  owner: string | null;
  ready: boolean;
};

export default function GrowthAnalysis({ characters, owner, ready }: Props) {
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
      setHistory(
        snap.docs.map((d) => d.data() as HistoryEntry),
      );
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
            const entries = snap.docs.map(
              (d) => d.data() as HistoryEntry,
            );
            const firstRecent = entries.find((e) => {
              const ms = e.recordedAt?.toMillis();
              return typeof ms === "number" && ms >= sevenDaysAgoMs;
            });
            if (!firstRecent) return null;
            const delta = c.combatPower - firstRecent.combatPower;
            if (delta <= 0) return null;
            return {
              owner: c.owner,
              nickname: c.nickname,
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

  const chartPoints = useMemo<Point[]>(() => {
    if (!selectedChar || nowMs === null) return [];
    const points: Point[] = history
      .map((h) => {
        const ts = h.recordedAt?.toMillis();
        if (typeof ts !== "number") return null;
        const d = new Date(ts);
        return {
          ts,
          label: formatDayLabel(d),
          combatPower: h.combatPower,
        };
      })
      .filter((p): p is Point => p !== null);
    points.push({
      ts: nowMs,
      label: formatDayLabel(new Date(nowMs)),
      combatPower: selectedChar.combatPower,
    });
    if (rangeMode === "30d") {
      const cutoff = nowMs - 30 * 24 * 60 * 60 * 1000;
      return points.filter((p) => p.ts >= cutoff);
    }
    return points;
  }, [history, selectedChar, rangeMode, nowMs]);

  const growthMetrics = useMemo(() => {
    if (!selectedChar || nowMs === null) {
      return {
        week: null as number | null,
        month: null as number | null,
        all: null as number | null,
      };
    }
    const current = selectedChar.combatPower;
    const withTs = history
      .map((h) => ({ ts: h.recordedAt?.toMillis(), cp: h.combatPower }))
      .filter((h): h is { ts: number; cp: number } => typeof h.ts === "number");

    const windowStart = (days: number) => nowMs - days * 24 * 60 * 60 * 1000;
    const valueAt = (cutoff: number): number | null => {
      const firstAfter = withTs.find((h) => h.ts >= cutoff);
      if (firstAfter) return firstAfter.cp;
      if (withTs.length === 0) return null;
      return current;
    };

    const weekValue = valueAt(windowStart(7));
    const monthValue = valueAt(windowStart(30));
    const firstValue = withTs.length > 0 ? withTs[0].cp : null;

    return {
      week: weekValue === null ? null : current - weekValue,
      month: monthValue === null ? null : current - monthValue,
      all: firstValue === null ? null : current - firstValue,
    };
  }, [selectedChar, history, nowMs]);

  const guildStats = useMemo(() => {
    const n = characters.length;
    if (n === 0) {
      return {
        avgCp: 0,
        avgHell: "-",
        totalChars: 0,
        totalOwners: 0,
      };
    }
    const avgCp = characters.reduce((s, c) => s + (c.combatPower || 0), 0) / n;
    const hellVals = characters
      .map((c) => HELL_INDEX[c.hellStage])
      .filter((v): v is number => typeof v === "number");
    const avgHell =
      hellVals.length > 0
        ? hellLabelFromAverage(
            hellVals.reduce((s, v) => s + v, 0) / hellVals.length,
          )
        : "-";
    const owners = new Set(characters.map((c) => c.owner));
    return {
      avgCp,
      avgHell,
      totalChars: n,
      totalOwners: owners.size,
    };
  }, [characters]);

  if (!ready) return null;

  if (!owner) {
    return (
      <p className="combat-login-hint">
        로그인하면 성장 분석을 볼 수 있습니다
      </p>
    );
  }

  if (myCharacters.length === 0) {
    return (
      <p className="combat-login-hint">
        캐릭터를 등록하면 성장 분석을 볼 수 있습니다
      </p>
    );
  }

  const canShowChart = chartPoints.length >= 3;

  return (
    <div className="growth">
      <div className="growth-selector">
        <label className="combat-label-text" htmlFor="growth-char">
          캐릭터 선택
        </label>
        <select
          id="growth-char"
          className="board-input"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value || null)}
        >
          {myCharacters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nickname} ({c.job})
            </option>
          ))}
        </select>
      </div>

      <div className="growth-row">
        <div className="growth-card growth-chart">
          <div className="growth-card-head">
            <span className="growth-card-title">투력 변화</span>
            <div className="growth-range-toggle">
              <button
                type="button"
                className={`growth-range-btn${
                  rangeMode === "30d" ? " active" : ""
                }`}
                onClick={() => setRangeMode("30d")}
              >
                최근 30일
              </button>
              <button
                type="button"
                className={`growth-range-btn${
                  rangeMode === "all" ? " active" : ""
                }`}
                onClick={() => setRangeMode("all")}
              >
                전체
              </button>
            </div>
          </div>
          {canShowChart ? (
            <div className="growth-chart-body">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={chartPoints}
                  margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
                >
                  <CartesianGrid
                    stroke="rgba(255,255,255,0.1)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="label"
                    stroke="rgba(255,255,255,0.6)"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    stroke="rgba(255,255,255,0.6)"
                    tick={{ fontSize: 11 }}
                    domain={["auto", "auto"]}
                    tickFormatter={(v) =>
                      typeof v === "number" ? v.toLocaleString() : String(v)
                    }
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(0,0,0,0.85)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 8,
                      color: "#fff",
                      fontSize: 12,
                    }}
                    formatter={(v) => [
                      typeof v === "number" ? v.toLocaleString() : String(v),
                      "투력",
                    ]}
                    labelStyle={{ color: "rgba(255,255,255,0.7)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="combatPower"
                    stroke="#d4af37"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#4a90d9", stroke: "#4a90d9" }}
                    activeDot={{ r: 5, fill: "#4a90d9", stroke: "#fff" }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="growth-empty">
              투력을 2번 이상 업데이트하면 성장 그래프를 볼 수 있습니다
            </p>
          )}
        </div>

        <div className="growth-card growth-metrics">
          <div className="growth-card-head">
            <span className="growth-card-title">성장폭</span>
          </div>
          <ul className="growth-metrics-list">
            <li className="growth-metric">
              <span className="growth-metric-label">이번 주</span>
              {growthMetrics.week === null ? (
                <span className="growth-metric-empty">기록 부족</span>
              ) : (
                <span className="growth-metric-value">
                  <ArrowIndicator value={growthMetrics.week} />
                  {formatSignedDelta(growthMetrics.week)}
                </span>
              )}
            </li>
            <li className="growth-metric">
              <span className="growth-metric-label">이번 달</span>
              {growthMetrics.month === null ? (
                <span className="growth-metric-empty">기록 부족</span>
              ) : (
                <span className="growth-metric-value">
                  <ArrowIndicator value={growthMetrics.month} />
                  {formatSignedDelta(growthMetrics.month)}
                </span>
              )}
            </li>
            <li className="growth-metric">
              <span className="growth-metric-label">전체</span>
              {growthMetrics.all === null ? (
                <span className="growth-metric-empty">기록 부족</span>
              ) : (
                <span className="growth-metric-value">
                  <ArrowIndicator value={growthMetrics.all} />
                  {formatSignedDelta(growthMetrics.all)}
                </span>
              )}
            </li>
          </ul>
        </div>
      </div>

      <div className="growth-row">
        <div className="growth-card growth-top">
          <div className="growth-card-head">
            <span className="growth-card-title">최근 7일 성장 TOP 5</span>
          </div>
          {topGrowers.length === 0 ? (
            <p className="growth-empty">최근 성장 기록이 없습니다.</p>
          ) : (
            <ul className="growth-top-list">
              {topGrowers.map((g, i) => (
                <li key={`${g.owner}-${g.nickname}-${i}`} className="growth-top-item">
                  <span className="growth-top-rank">{i + 1}.</span>
                  <span className="growth-top-nick">
                    {g.nickname}
                    <span className="growth-top-job"> · {g.job}</span>
                  </span>
                  <span className="growth-top-delta">
                    +{g.delta.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="growth-card growth-stats">
          <div className="growth-card-head">
            <span className="growth-card-title">길드 통계</span>
          </div>
          <ul className="growth-stats-list">
            <li className="growth-stat">
              <span className="growth-stat-label">평균 투력</span>
              <span className="growth-stat-value">
                {guildStats.avgCp.toLocaleString(undefined, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </span>
            </li>
            <li className="growth-stat">
              <span className="growth-stat-label">평균 지옥 단계</span>
              <span className="growth-stat-value">{guildStats.avgHell}</span>
            </li>
            <li className="growth-stat">
              <span className="growth-stat-label">총 캐릭터 수</span>
              <span className="growth-stat-value">
                {guildStats.totalChars.toLocaleString()}
              </span>
            </li>
            <li className="growth-stat">
              <span className="growth-stat-label">총 길드원 수</span>
              <span className="growth-stat-value">
                {guildStats.totalOwners.toLocaleString()}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
