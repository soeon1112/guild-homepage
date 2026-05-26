import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";

// Single-pass `characters/{id}/history` fetch shared by 가장 빛난 별들 (7d
// top growers) and 직업별 성장 (7d/30d per-job averages). One Promise.all
// per characters[] change — no double-fetch.

export type GrowthCharLite = {
  id: string;
  owner: string;
  nickname: string;
  job: string;
  combatPower: number;
};

export type TopGrower = {
  owner: string;
  name: string;
  job: string;
  delta: number;
};

export type JobGrowthStat = {
  job: string;
  count: number;
  avg7d: number;
  max7d: number;
  avg30d: number;
  max30d: number;
};

type HistoryEntry = { combatPower: number; recordedAt: Timestamp | null };

export function useGuildGrowthData(characters: GrowthCharLite[]): {
  topGrowers: TopGrower[];
  jobGrowth: JobGrowthStat[];
  loading: boolean;
} {
  const [topGrowers, setTopGrowers] = useState<TopGrower[]>([]);
  const [jobGrowth, setJobGrowth] = useState<JobGrowthStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (characters.length === 0) {
        if (!cancelled) {
          setTopGrowers([]);
          setJobGrowth([]);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

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
            const withTs = entries
              .map((e) => ({
                ts: e.recordedAt?.toMillis(),
                cp: e.combatPower,
              }))
              .filter(
                (e): e is { ts: number; cp: number } =>
                  typeof e.ts === "number",
              );

            const valueAt = (cutoff: number): number | null => {
              const first = withTs.find((e) => e.ts >= cutoff);
              if (first) return first.cp;
              if (withTs.length === 0) return null;
              return c.combatPower;
            };

            const v7 = valueAt(sevenDaysAgo);
            const v30 = valueAt(thirtyDaysAgo);

            return {
              c,
              delta7d: v7 === null ? null : c.combatPower - v7,
              delta30d: v30 === null ? null : c.combatPower - v30,
            };
          } catch (e) {
            console.error(e);
            return { c, delta7d: null, delta30d: null };
          }
        }),
      );

      if (cancelled) return;

      // 빛난 별 — 7d delta > 0 desc top 5 (기존 동작 그대로)
      const top: TopGrower[] = results
        .filter((r): r is typeof r & { delta7d: number } =>
          typeof r.delta7d === "number" && r.delta7d > 0,
        )
        .map((r) => ({
          owner: r.c.owner,
          name: r.c.nickname,
          job: r.c.job,
          delta: r.delta7d,
        }))
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5);

      // 직업별 성장 — group by job, avg delta (null 제외)
      const groups = new Map<string, typeof results>();
      for (const r of results) {
        const job = r.c.job || "(미입력)";
        const arr = groups.get(job);
        if (arr) arr.push(r);
        else groups.set(job, [r]);
      }
      const stats: JobGrowthStat[] = [...groups.entries()].map(
        ([job, members]) => {
          const d7s = members
            .map((m) => m.delta7d)
            .filter((v): v is number => typeof v === "number");
          const d30s = members
            .map((m) => m.delta30d)
            .filter((v): v is number => typeof v === "number");
          const avg7d =
            d7s.length > 0
              ? Math.round(d7s.reduce((a, b) => a + b, 0) / d7s.length)
              : 0;
          const avg30d =
            d30s.length > 0
              ? Math.round(d30s.reduce((a, b) => a + b, 0) / d30s.length)
              : 0;
          const max7d = d7s.length > 0 ? Math.max(...d7s) : 0;
          const max30d = d30s.length > 0 ? Math.max(...d30s) : 0;
          return {
            job,
            count: members.length,
            avg7d,
            max7d,
            avg30d,
            max30d,
          };
        },
      );

      setTopGrowers(top);
      setJobGrowth(stats);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [characters]);

  return { topGrowers, jobGrowth, loading };
}
