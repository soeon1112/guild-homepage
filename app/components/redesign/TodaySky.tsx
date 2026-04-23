"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import { handleEvent } from "@/src/lib/badgeCheck";

// ─── Constellation geometry (verbatim from v0) ───
type StarNode = { x: number; y: number; r: number };

const NODES: StarNode[] = [
  { x: 50, y: 20, r: 3.2 }, // top
  { x: 30, y: 42, r: 2.2 },
  { x: 72, y: 40, r: 2.6 },
  { x: 42, y: 60, r: 3 },
  { x: 62, y: 66, r: 2.2 },
  { x: 82, y: 72, r: 2 },
  { x: 22, y: 74, r: 2.4 },
];

const LINES: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 3],
  [3, 4],
  [4, 5],
  [3, 6],
];

const DAILY_VERSES = [
  "밤이 깊을수록 별은 선명하다.",
  "우리는 각자의 궤도로 빛난다.",
  "오늘의 어둠도 내일의 여명이 된다.",
  "작은 빛들이 모여 길을 만든다.",
];

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type AttendState =
  | "loading"
  | "logged_out"
  | "not_today"
  | "already_today"
  | "just_attended";

export function TodaySky() {
  const { nickname, ready } = useAuth();
  const [attendState, setAttendState] = useState<AttendState>("loading");
  const [busy, setBusy] = useState(false);
  const verse = DAILY_VERSES[new Date().getDate() % DAILY_VERSES.length];

  // Load attendance state on auth resolution / change
  useEffect(() => {
    if (!ready) return;
    if (!nickname) {
      setAttendState("logged_out");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", nickname));
        if (cancelled) return;
        const data = snap.data();
        const last = data?.lastAttendance as Timestamp | undefined;
        const alreadyToday =
          !!last && isSameLocalDay(last.toDate(), new Date());
        setAttendState(alreadyToday ? "already_today" : "not_today");
      } catch (e) {
        console.error(e);
        if (!cancelled) setAttendState("not_today"); // fallback — let user try
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nickname, ready]);

  const handleCheckin = async () => {
    if (!nickname || busy || attendState !== "not_today") return;
    setBusy(true);
    try {
      // Re-check server state (guards against stale tabs)
      const preSnap = await getDoc(doc(db, "users", nickname));
      const last = preSnap.data()?.lastAttendance as Timestamp | undefined;
      if (last && isSameLocalDay(last.toDate(), new Date())) {
        setAttendState("already_today");
        setBusy(false);
        return;
      }

      // Same write sequence as legacy AttendanceButton
      await setDoc(
        doc(db, "users", nickname),
        {
          points: increment(1),
          lastAttendance: serverTimestamp(),
        },
        { merge: true },
      );
      await addDoc(collection(db, "users", nickname, "pointHistory"), {
        type: "출석",
        points: 1,
        description: "출석 체크",
        createdAt: serverTimestamp(),
      });

      // Trigger badge dispatcher — still updates consecutiveAttendDays server-side
      // (for streak-based badges attend_7, attend_30, attend_100 etc.)
      await handleEvent({ type: "attend", nickname, when: new Date() });

      setAttendState("just_attended");
    } catch (e) {
      console.error(e);
    }
    setBusy(false);
  };

  // Bright constellation when user attended today (either just now or earlier)
  const lit = attendState === "just_attended" || attendState === "already_today";

  const buttonLabel =
    attendState === "logged_out"
      ? "로그인이 필요합니다"
      : attendState === "loading"
        ? "..."
        : attendState === "just_attended"
          ? "오늘의 별이 밝아졌습니다"
          : attendState === "already_today"
            ? "이미 밝아졌습니다"
            : "오늘의 별 밝히기";

  const buttonDisabled = attendState !== "not_today" || busy;

  return (
    <section className="relative px-4 pt-2 pb-4">
      {/* Section whisper label */}
      <div className="mb-1 flex items-center justify-between">
        <span className="font-serif text-[11px] tracking-[0.4em] text-text-sub uppercase">
          Today&apos;s Sky
        </span>
      </div>

      {/* Constellation circle */}
      <div className="relative mx-auto aspect-square w-full max-w-[320px]">
        {/* Outer rotating ring */}
        <div
          className="absolute inset-0"
          style={{
            animation: "orbit-rotate 120s linear infinite",
          }}
        >
          <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
            <circle
              cx="50"
              cy="50"
              r="48"
              fill="none"
              stroke="#D896C8"
              strokeOpacity="0.25"
              strokeWidth="0.2"
              strokeDasharray="1 2"
            />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="#6B4BA8"
              strokeOpacity="0.35"
              strokeWidth="0.15"
            />
            {/* tick marks — values rounded to 3 decimals for SSR/CSR stability */}
            {Array.from({ length: 12 }).map((_, i) => {
              const a = (i * 30 * Math.PI) / 180;
              const x1 = (50 + Math.cos(a) * 47).toFixed(3);
              const y1 = (50 + Math.sin(a) * 47).toFixed(3);
              const x2 = (50 + Math.cos(a) * 49).toFixed(3);
              const y2 = (50 + Math.sin(a) * 49).toFixed(3);
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#FFE5C4"
                  strokeOpacity="0.5"
                  strokeWidth="0.2"
                />
              );
            })}
          </svg>
        </div>

        {/* Nebula glow inside */}
        <div
          className="absolute inset-3 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 50% 40%, rgba(216,150,200,0.25) 0%, rgba(107,75,168,0.18) 45%, rgba(11,8,33,0) 75%)",
            filter: "blur(2px)",
          }}
        />

        {/* Inner ring */}
        <div className="absolute inset-[8%] rounded-full border border-nebula-pink/20" />

        {/* Constellation */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-[8%] h-[84%] w-[84%]"
          aria-hidden
        >
          <defs>
            <radialGradient id="starGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFE5C4" />
              <stop offset="60%" stopColor="#FFB5A7" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#FFB5A7" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Connecting lines */}
          {LINES.map(([a, b], i) => {
            const A = NODES[a];
            const B = NODES[b];
            return (
              <line
                key={i}
                x1={A.x}
                y1={A.y}
                x2={B.x}
                y2={B.y}
                stroke="#FFE5C4"
                strokeOpacity={lit ? 0.55 : 0.28}
                strokeWidth="0.3"
                strokeLinecap="round"
                style={{ transition: "stroke-opacity 1s ease" }}
              />
            );
          })}

          {/* Stars */}
          {NODES.map((n, i) => (
            <g key={i}>
              <circle
                cx={n.x}
                cy={n.y}
                r={n.r * 2.2}
                fill="url(#starGlow)"
                opacity={lit && i === 3 ? 1 : 0.4}
                style={{ transition: "opacity 1s ease" }}
              />
              <circle
                cx={n.x}
                cy={n.y}
                r={n.r}
                fill="#FFE5C4"
                className={
                  lit && i === 3 ? "animate-star-bright" : "animate-twinkle"
                }
                style={{
                  animationDelay: `${i * 0.3}s`,
                  transformOrigin: `${n.x}px ${n.y}px`,
                }}
              />
            </g>
          ))}
        </svg>

        {/* Center verse */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          <p className="wrap-anywhere max-w-[160px] font-serif text-[13px] leading-relaxed text-text-primary text-glow-soft text-balance">
            &ldquo;{verse}&rdquo;
          </p>
          <span className="mt-2 font-serif text-[10px] tracking-[0.3em] text-text-sub uppercase">
            Verse of the Day
          </span>
        </div>
      </div>

      {/* Check-in button */}
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={handleCheckin}
          disabled={buttonDisabled}
          className="group relative overflow-hidden rounded-full border border-nebula-pink/60 bg-gradient-to-r from-nebula-deep/60 via-nebula-violet/40 to-nebula-deep/60 px-6 py-2.5 backdrop-blur-sm transition-all duration-300 hover:border-stardust disabled:cursor-not-allowed disabled:opacity-80"
          style={{
            boxShadow: lit
              ? "0 0 20px rgba(255,229,196,0.6), inset 0 0 12px rgba(216,150,200,0.3)"
              : "0 0 10px rgba(216,150,200,0.35)",
          }}
        >
          <span className="relative flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path
                d="M7 0 L8.2 5.6 L14 7 L8.2 8.4 L7 14 L5.8 8.4 L0 7 L5.8 5.6 Z"
                fill={lit ? "#FFE5C4" : "#D896C8"}
                style={{ transition: "fill 0.6s ease" }}
              />
            </svg>
            <span className="font-serif text-sm tracking-wider text-text-primary">
              {buttonLabel}
            </span>
          </span>
        </button>
      </div>
    </section>
  );
}
