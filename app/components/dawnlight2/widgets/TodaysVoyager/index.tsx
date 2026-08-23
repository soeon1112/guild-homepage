"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";

// Today's Voyager — Dawnlight 2 daily-rotating spotlight.
//
// Rotation algorithm + member pool 1:1 with cosmic StarOfDay (KST
// day number, FNV-1a → mulberry32 → Fisher-Yates pick over the
// `members` collection sorted by id). Visual lifts v0's lighthouse-
// keeper.tsx wholesale: the floating-island scene SVG (clouds /
// island / sailboat / lantern), the parchment-bob wrapper, and the
// 2-column PC layout (left island, right two input cards stacked).
// Buttons are unified to the same NoteToTheSky / PaperPlaneLetters
// pill so all three CTAs across the page share one shape.

type MemberCard = {
  id: string;
  nickname: string;
  statusMessage: string;
  profileImage: string;
};

const NAVY = "#2a4570";
const CREAM = "#fef5e6";

// Standardized CTA pill — same shape across the three voyager
// buttons + the NoteToTheSky / PaperPlaneLetters CTAs elsewhere on
// the page. Defined once here so future tone tweaks land in one
// place.
const PILL_CLASS =
  "inline-flex items-center justify-center gap-1 rounded-full px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";

// ── KST + deterministic shuffle (verbatim from cosmic StarOfDay) ──
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
function kstDayNumber(date = new Date()): number {
  return Math.floor((date.getTime() + KST_OFFSET_MS) / 86400000);
}
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
function pickStarIndex(poolSize: number, date = new Date()): number {
  if (poolSize <= 0) return -1;
  const day = kstDayNumber(date);
  const cycle = Math.floor(day / poolSize);
  const pos = ((day % poolSize) + poolSize) % poolSize;
  const seed = fnv1a(`star-of-day:${cycle}`);
  const order = shuffledIndices(poolSize, mulberry32(seed));
  return order[pos];
}

export function TodaysVoyager() {
  const [members, setMembers] = useState<MemberCard[]>([]);
  const [loaded, setLoaded] = useState(false);

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

  const today = useMemo(() => {
    if (members.length === 0) return null;
    return members[pickStarIndex(members.length)];
  }, [members]);

  return (
    <section
      aria-labelledby="dl2-todays-voyager"
      className="mx-auto w-full max-w-2xl px-5 pb-12 pt-2 sm:px-6 sm:pb-16"
    >
      <header className="mb-3 px-1">
        <h2
          id="dl2-todays-voyager"
          className="text-lg font-semibold leading-tight text-cream sm:text-xl"
        >
          오늘의 항해자
        </h2>
        <p className="mt-1 text-[10px] uppercase tracking-[0.32em] text-mist-lavender">
          Today&apos;s Voyager
        </p>
      </header>

      <FloatingIsland voyager={today} loaded={loaded} />
    </section>
  );
}

/* ─── Floating island scene (port of v0 FloatingIsland) ─────────── */

function FloatingIsland({
  voyager,
  loaded,
}: {
  voyager: MemberCard | null;
  loaded: boolean;
}) {
  return (
    <div
      className="animate-parchment-bob relative mx-auto flex w-full max-w-[420px] flex-col items-center"
      style={{ animationDuration: "7s" }}
    >
      {/* Profile cluster — sits ABOVE the island scene, slight
          negative margin lets the avatar overlap the SVG top edge. */}
      <div className="relative z-10 mb-[-20px] flex flex-col items-center gap-2">
        <Avatar
          src={voyager?.profileImage}
          nickname={voyager?.nickname ?? ""}
        />
        {voyager ? (
          <>
            <div className="text-center">
              <p
                className="font-serif-kr text-base font-medium leading-none sm:text-lg"
                style={{ color: CREAM }}
              >
                {voyager.nickname}
              </p>
              {voyager.statusMessage && (
                <p
                  className="mt-1 text-xs italic leading-snug"
                  style={{ color: "#c8b8e8" }}
                >
                  {voyager.statusMessage}
                </p>
              )}
            </div>
            <Link
              href={`/members/${voyager.id}`}
              className={PILL_CLASS}
              style={{ background: NAVY, color: CREAM }}
            >
              ✦ 항해자의 섬으로
            </Link>
          </>
        ) : (
          <p className="text-xs italic" style={{ color: "#c8b8e8" }}>
            {loaded ? "아직 빛나는 별이 없어요" : "별을 찾는 중..."}
          </p>
        )}
      </div>

      {/* Island scene — clouds, island silhouette, sailboat with
          lantern. All paths verbatim from v0; gradient ids prefixed
          dl2- to keep them out of any other SVG's id namespace. */}
      <svg
        viewBox="0 0 380 220"
        className="w-full"
        aria-label="노을빛 하늘에 떠있는 작은 섬과 돛단배"
        role="img"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="dl2-lk-island" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7a5898" />
            <stop offset="45%" stopColor="#5a3878" />
            <stop offset="100%" stopColor="#3a2058" />
          </linearGradient>
          <linearGradient id="dl2-lk-grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a87848" />
            <stop offset="100%" stopColor="#8a5838" />
          </linearGradient>
          <radialGradient id="dl2-lk-shadow" cx="50%" cy="30%" r="50%">
            <stop offset="0%" stopColor="#1a0f3d" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#1a0f3d" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="dl2-lk-cloud" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fdf6f0" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#ffd4b8" stopOpacity="0.75" />
          </linearGradient>
          <radialGradient id="dl2-lk-lantern" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff5a0" stopOpacity="1" />
            <stop offset="60%" stopColor="#ffd060" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ffa030" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Drop shadow under the island */}
        <ellipse cx="190" cy="208" rx="115" ry="14" fill="url(#dl2-lk-shadow)" />

        {/* Small cloud left — drift-slow */}
        <g className="animate-drift-slow" style={{ animationDelay: "-3s" }}>
          <path
            d="M 34 100 Q 28 100 28 93 Q 22 84 32 79 Q 33 70 42 68
               Q 48 60 58 64 Q 67 60 74 66 Q 82 66 84 74
               Q 92 75 90 84 Q 94 88 88 94
               Q 84 100 74 98 Q 60 102 46 98 Z"
            fill="url(#dl2-lk-cloud)"
            opacity="0.88"
          />
        </g>

        {/* Small cloud right — drift-slower */}
        <g className="animate-drift-slower" style={{ animationDelay: "-8s" }}>
          <path
            d="M 276 72 Q 270 72 270 66 Q 264 57 274 53 Q 275 45 283 43
               Q 289 36 297 39 Q 305 36 311 41 Q 318 41 320 48
               Q 327 49 325 57 Q 328 61 322 66
               Q 319 72 311 70 Q 298 74 284 70 Z"
            fill="url(#dl2-lk-cloud)"
            opacity="0.78"
          />
        </g>

        {/* Island body */}
        <path
          d="M 75 192 Q 68 180 72 164 Q 78 148 95 140
             Q 108 134 130 132 Q 148 128 170 130
             Q 200 128 220 132 Q 246 134 264 142
             Q 284 150 292 166 Q 298 180 294 192 Z"
          fill="url(#dl2-lk-island)"
        />
        <path
          d="M 95 140 Q 108 134 130 132 Q 148 128 170 130
             Q 200 128 220 132 Q 246 134 264 142
             Q 246 136 220 128 Q 200 124 170 126
             Q 148 124 130 128 Q 108 130 95 140 Z"
          fill="url(#dl2-lk-grass)"
          opacity="0.7"
        />

        {/* Tiny trees on island edges */}
        <g fill="#2a1840" opacity="0.75">
          <path d="M 118 134 l 3 -12 l 3 12 z" />
          <path d="M 130 130 l 3 -14 l 3 14 z" />
          <path d="M 248 136 l 3 -11 l 3 11 z" />
          <path d="M 260 140 l 3 -9 l 3 9 z" />
        </g>

        {/* Cast shadow on island top — sells the airborne sailboat */}
        <ellipse cx="190" cy="133" rx="30" ry="4" fill="#1a0f3d" opacity="0.22" />

        {/* Sailboat — bobs over the island. The translateY(-14)
            lifts the hull just clear of the island top; the boat-bob
            keyframe rocks it ±2° + ±6 px around (190, 108). */}
        <g
          className="animate-boat-bob"
          style={{
            transformOrigin: "190px 108px",
            transform: "translateY(-14px)",
          }}
        >
          {/* Hull */}
          <path
            d="M 168 112 Q 165 116 168 120 L 212 120 Q 215 116 212 112 Z"
            fill="#2a1840"
            opacity="0.92"
          />
          <line x1="171" y1="116" x2="209" y2="116" stroke="rgba(200,184,232,0.22)" strokeWidth="0.7" />
          {/* Mast */}
          <line x1="190" y1="112" x2="190" y2="62" stroke="#2a1840" strokeWidth="1.8" strokeLinecap="round" />
          {/* Main sail (cream) */}
          <path
            d="M 190 64 Q 218 78 214 110 L 190 110 Z"
            fill="#fef5e6"
            fillOpacity="0.93"
            stroke="rgba(180,160,100,0.3)"
            strokeWidth="0.7"
          />
          {/* Fore sail (jib) */}
          <path
            d="M 190 69 Q 172 85 174 110 L 190 110 Z"
            fill="#f5e8d0"
            fillOpacity="0.82"
            stroke="rgba(180,160,100,0.25)"
            strokeWidth="0.6"
          />
          {/* Masthead pennant */}
          <path d="M 190 62 L 202 67 L 190 72 Z" fill="#e8604a" opacity="0.85" />
          {/* Lantern halo (twinkles) + dot */}
          <circle
            className="animate-twinkle"
            cx="190"
            cy="62"
            r="11"
            fill="url(#dl2-lk-lantern)"
            opacity="0.55"
          />
          <circle cx="190" cy="62" r="2.8" fill="#fff5a0" opacity="0.9" />
        </g>
      </svg>
    </div>
  );
}

function Avatar({ src, nickname }: { src?: string; nickname: string }) {
  const initials = nickname.trim().slice(0, 2) || "·";
  return (
    <div
      className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full text-xl font-semibold sm:h-20 sm:w-20"
      style={{
        background: "linear-gradient(135deg, #ffc785 0%, #f4a87a 100%)",
        color: "#2a1f4a",
        boxShadow: "0 4px 18px rgba(255,199,133,0.45)",
        border: "3px solid rgba(255,245,220,0.7)",
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={nickname} className="h-full w-full object-cover" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

