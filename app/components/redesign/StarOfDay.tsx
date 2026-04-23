"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { MemberAvatar } from "./MemberAvatar";

type MemberCard = {
  id: string;
  nickname: string;
  statusMessage: string;
  profileImage: string;
};

/**
 * Deterministic "today" seed — same for all visitors on the same local date,
 * changes at local midnight. Combines year/month/day into a stable integer.
 */
function dayIndexSeed(date = new Date()): number {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const base = y * 10000 + m * 100 + d;
  // small mix so consecutive days don't produce neighboring indices
  let h = base;
  h = ((h << 5) - h + base) | 0;
  h = (h * 9301 + 49297) & 0x7fffffff;
  return Math.abs(h);
}

export function StarOfDay() {
  const [members, setMembers] = useState<MemberCard[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Fetch all registered members (those with a nickname claimed)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "members"));
        if (cancelled) return;
        const list: MemberCard[] = snap.docs
          .map((d) => ({
            id: d.id,
            nickname: (d.data().nickname as string) ?? "",
            statusMessage: (d.data().statusMessage as string) ?? "",
            profileImage: (d.data().profileImage as string) ?? "",
          }))
          .filter((m) => !!m.nickname)
          // stable order so the daily index always points at the same member
          .sort((a, b) => a.id.localeCompare(b.id));
        setMembers(list);
        setLoaded(true);
      } catch (e) {
        console.error(e);
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pick today's star (deterministic — same for every visitor today)
  const today = useMemo(() => {
    if (members.length === 0) return null;
    const idx = dayIndexSeed() % members.length;
    return members[idx];
  }, [members]);

  return (
    <section className="relative px-4 pb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-serif text-[11px] tracking-[0.4em] text-text-sub uppercase">
          Star of the Day
        </span>
        <span className="font-serif text-[10px] text-text-sub">
          매일 새로운 동료
        </span>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-nebula-pink/30 p-4 backdrop-blur-sm">
        {/* Member-specific nebula background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse at 20% 30%, rgba(216,150,200,0.35) 0%, transparent 55%), radial-gradient(ellipse at 85% 70%, rgba(107,75,168,0.55) 0%, transparent 55%), linear-gradient(135deg, rgba(26,15,61,0.85) 0%, rgba(11,8,33,0.7) 100%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(circle at 80% 20%, rgba(255,181,167,0.2) 0%, transparent 40%)",
            filter: "blur(20px)",
          }}
        />

        {!loaded ? (
          <div className="flex h-20 items-center justify-center">
            <p className="font-serif text-[11px] italic text-text-sub/70">
              별을 찾는 중...
            </p>
          </div>
        ) : !today ? (
          <div className="flex h-20 items-center justify-center">
            <p className="font-serif text-[11px] italic text-text-sub/70">
              아직 빛나는 별이 없어요
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <MemberAvatar
              imageUrl={today.profileImage}
              nickname={today.nickname}
              size={64}
              ring
            />

            <div className="min-w-0 flex-1">
              <h3 className="truncate font-serif text-lg font-bold text-text-primary text-glow-soft">
                {today.nickname}
              </h3>
              {today.statusMessage && (
                <p className="mt-0.5 break-keep font-serif text-[12px] leading-snug text-text-sub text-pretty">
                  &ldquo;{today.statusMessage}&rdquo;
                </p>
              )}
            </div>

            <Link
              href={`/members/${today.id}`}
              className="group flex shrink-0 items-center gap-1 rounded-full border border-stardust/50 bg-stardust/5 px-3 py-1.5 font-serif text-[11px] tracking-wider text-stardust backdrop-blur-sm transition-all hover:border-stardust hover:bg-stardust/15"
              aria-label={`${today.nickname}의 공간 방문하기`}
            >
              방문
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
