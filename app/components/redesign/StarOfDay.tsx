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

// KST day number — same integer for every visitor on the same Korean
// calendar day, regardless of browser timezone.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
function kstDayNumber(date = new Date()): number {
  return Math.floor((date.getTime() + KST_OFFSET_MS) / 86400000);
}

// FNV-1a 32-bit string hash — non-linear so consecutive cycle indices
// produce uncorrelated seeds. The previous hash was effectively linear
// in the date, which collapsed 30-day windows onto a handful of members.
function fnv1a(str: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledIndices(n: number, rand: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Daily star picker. Pool of size N reshuffles every N days, every
// member appears exactly once per cycle, and pool size can change
// freely between days because nothing is persisted across days.
function pickStarIndex(poolSize: number, date = new Date()): number {
  if (poolSize <= 0) return -1;
  const day = kstDayNumber(date);
  const cycle = Math.floor(day / poolSize);
  const pos = ((day % poolSize) + poolSize) % poolSize;
  const seed = fnv1a(`star-of-day:${cycle}`);
  const order = shuffledIndices(poolSize, mulberry32(seed));
  return order[pos];
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
    const idx = pickStarIndex(members.length);
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
                <p className="wrap-anywhere mt-0.5 font-serif text-[12px] leading-snug text-text-sub text-pretty">
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
