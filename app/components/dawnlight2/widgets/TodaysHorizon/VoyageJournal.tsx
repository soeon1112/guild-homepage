"use client";

import { useEffect, useRef, useState } from "react";
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
import { HorizonIllustration } from "./HorizonIllustration";
import { getRandomVerse } from "./dailyVerse";

// Voyage Journal — Dawnlight 2 attendance widget.
//
// Shape mirrors v0/components/dawnlight/voyage-journal.tsx (parchment +
// ink stamp + post-stamp sky quote inside a horizon scene), but the
// idle/done split is driven by the same Firestore data the legacy
// TodaySky widget uses, so check-ins from either UI produce the same
// `users/{nickname}.lastAttendance` + points + pointHistory entries.
// `handleEvent({ type: "attend", … })` runs the badge / streak logic
// server-side just like the legacy path.
//
// State machine:
//   loading        — auth not ready or still reading lastAttendance
//   logged_out     — no nickname; button shows the sign-in hint
//   not_today      — has a nickname, hasn't attended today (parchment shown, button live)
//   stamping       — user just clicked; play stamp/glow/vanish animation (1.45s)
//   already_today  — server says today already covered (parchment hidden, sky quote shown)
//   just_attended  — same render as already_today, but reached via a successful click

type AttendState =
  | "loading"
  | "logged_out"
  | "not_today"
  | "stamping"
  | "already_today"
  | "just_attended";

const STAMP_TO_DONE_MS = 1450;

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function VoyageJournal() {
  const { nickname, ready } = useAuth();
  const [state, setState] = useState<AttendState>("loading");
  const [busy, setBusy] = useState(false);
  const stampTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Verse is picked client-side to avoid a server/client Math.random
  // mismatch — SSR renders an empty quote (the parchment shows just
  // the stamp slot during the brief pre-hydration window) and the
  // useEffect below fills it in on mount.
  const [verse, setVerse] = useState<string>("");
  useEffect(() => {
    setVerse(getRandomVerse());
  }, []);

  // Initial Firestore read — same fields TodaySky checks.
  useEffect(() => {
    if (!ready) return;
    if (!nickname) {
      setState("logged_out");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", nickname));
        if (cancelled) return;
        const last = snap.data()?.lastAttendance as Timestamp | undefined;
        const alreadyToday = !!last && isSameLocalDay(last.toDate(), new Date());
        setState(alreadyToday ? "already_today" : "not_today");
      } catch (e) {
        console.error(e);
        if (!cancelled) setState("not_today");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nickname, ready]);

  // Cancel the stamp→done timeout if the component unmounts mid-animation
  // (route change). Without this, a pending setState on an unmounted node
  // would log a warning even though the Firestore write already succeeded.
  useEffect(() => {
    return () => {
      if (stampTimerRef.current) clearTimeout(stampTimerRef.current);
    };
  }, []);

  const handleStamp = async () => {
    if (!nickname || busy || state !== "not_today") return;
    setBusy(true);
    try {
      // Re-check server state (guards against stale tabs)
      const preSnap = await getDoc(doc(db, "users", nickname));
      const last = preSnap.data()?.lastAttendance as Timestamp | undefined;
      if (last && isSameLocalDay(last.toDate(), new Date())) {
        setState("already_today");
        setBusy(false);
        return;
      }

      // Same write sequence as the cosmic TodaySky widget — keeping the
      // payload identical means streak counters, badge dispatch, and the
      // pointHistory subcollection stay consistent between the two UIs.
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
      await handleEvent({ type: "attend", nickname, when: new Date() });

      // Play the stamp animation, then transition to the post-stamp view.
      // 1.45s covers stamp-press (0.55s) + ink-splat + glow + parchment-vanish.
      setState("stamping");
      stampTimerRef.current = setTimeout(() => {
        setState("just_attended");
        stampTimerRef.current = null;
      }, STAMP_TO_DONE_MS);
    } catch (e) {
      console.error(e);
    }
    setBusy(false);
  };

  const showParchment = state === "not_today" || state === "stamping";
  const showQuote = state === "already_today" || state === "just_attended";
  const isDone = showQuote;
  const buttonDisabled =
    state === "loading" ||
    state === "logged_out" ||
    state === "stamping" ||
    isDone ||
    busy;

  let buttonLabel: string;
  switch (state) {
    case "loading":
      buttonLabel = "...";
      break;
    case "logged_out":
      buttonLabel = "로그인이 필요합니다";
      break;
    case "already_today":
    case "just_attended":
      buttonLabel = "오늘의 항해를 기록했어요";
      break;
    default:
      buttonLabel = "오늘의 항해 기록하기";
  }

  return (
    <div className="w-full">
      {/* Scenery + bounded overlay */}
      <div className="relative isolate w-full overflow-hidden rounded-[28px]">
        <HorizonIllustration />

        {showParchment && (
          <div
            aria-hidden={state !== "not_today"}
            className={[
              "pointer-events-none absolute inset-0 flex items-center justify-center",
              state === "stamping" ? "animate-parchment-vanish" : "",
            ].join(" ")}
          >
            <Parchment stamping={state === "stamping"} />
          </div>
        )}

        {showQuote && verse && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-3">
            <p
              className="dl2-quote-text font-serif-kr animate-sky-quote-fade text-center font-light italic text-cream"
              style={{
                textShadow:
                  "0 0 18px rgba(255, 199, 133, 0.55), 0 0 36px rgba(255, 199, 133, 0.28), 0 1px 2px rgba(42, 31, 74, 0.45)",
              }}
            >
              {verse}
            </p>
          </div>
        )}

        {/* Warm-glow flash — only mounts on the just_attended transition,
            not on already_today (page reload). The keyframe ends at
            opacity 0 so the overlay is invisible afterwards even though
            it stays in the DOM, and animation-fill-mode: both keeps it
            from snapping back to opacity 1 mid-cleanup. */}
        {state === "just_attended" && (
          <div
            aria-hidden
            className="animate-sunset-glow pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 50%, rgba(255, 199, 133, 0.85) 0%, rgba(255, 199, 133, 0.45) 35%, rgba(255, 199, 133, 0) 75%)",
              mixBlendMode: "screen",
            }}
          />
        )}
      </div>

      {/* Action button below scenery — cream pill on the twilight sky.
          Active state owns the contrast (cream fill, ink-deep text) so
          the call to action reads at first glance against the sunset
          gradient; disabled state drops to a translucent variant of
          the same pair so it still feels part of the same family. */}
      <div className="mt-8 flex justify-center sm:mt-10">
        <button
          type="button"
          onClick={handleStamp}
          disabled={buttonDisabled}
          aria-live="polite"
          className={[
            // `select-none` lives on the base class string so it covers
            // both active and disabled branches (and the inner +/label
            // <span>s inherit it) — clicks on the button never engage
            // the browser's text-selection / caret path.
            "group inline-flex select-none items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium tracking-wide transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream/70 focus-visible:ring-offset-2 focus-visible:ring-offset-twilight-deep",
            buttonDisabled
              ? "cursor-not-allowed bg-cream/35 text-twilight-deep/55"
              : "bg-cream text-twilight-deep shadow-[0_6px_18px_-8px_rgba(254,245,230,0.45)] hover:-translate-y-0.5 hover:bg-cream/95 hover:shadow-[0_10px_28px_-10px_rgba(254,245,230,0.7)]",
          ].join(" ")}
        >
          {!buttonDisabled && (
            <span
              aria-hidden
              className="text-base font-light text-twilight-deep/65 transition-transform duration-300 group-hover:rotate-90"
            >
              +
            </span>
          )}
          <span>{buttonLabel}</span>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Parchment({ stamping }: { stamping: boolean }) {
  return (
    <div
      className={[
        "relative flex aspect-[4/3] w-[42%] min-w-[160px] max-w-[260px] items-center justify-center sm:w-[34%] sm:max-w-[280px]",
        stamping ? "" : "animate-parchment-bob",
      ].join(" ")}
      style={{
        background:
          "radial-gradient(120% 90% at 30% 25%, #fbecd0 0%, #f5e8d0 45%, #ead4ae 100%)",
        borderRadius: "14px 18px 12px 16px / 16px 12px 18px 14px",
        boxShadow:
          "0 18px 36px -18px rgba(42, 31, 74, 0.55), 0 4px 14px -6px rgba(42, 31, 74, 0.35), inset 0 0 0 1px rgba(200, 168, 122, 0.45)",
      }}
    >
      {/* Aged paper noise overlay */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-multiply"
        style={{
          borderRadius: "inherit",
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>\")",
        }}
      />

      {/* Folded top-right corner */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-px -top-px h-[22%] w-[22%]"
        style={{
          background: "linear-gradient(135deg, #d8bf95 0%, #c8a87a 70%, #b89868 100%)",
          clipPath: "polygon(100% 0, 100% 100%, 0 0)",
          borderTopRightRadius: "16px",
          filter: "drop-shadow(-2px 2px 3px rgba(42, 31, 74, 0.25))",
        }}
      />

      {/* Faint compass-rose watermark */}
      <svg
        aria-hidden
        viewBox="0 0 80 80"
        className="absolute h-[58%] w-[58%] opacity-[0.13]"
        fill="none"
        stroke="#5c3a1f"
        strokeWidth="0.7"
      >
        <circle cx="40" cy="40" r="28" />
        <circle cx="40" cy="40" r="18" />
        <path d="M40 8 L44 38 L40 72 L36 38 Z" fill="#5c3a1f" opacity="0.6" />
        <path d="M8 40 L38 36 L72 40 L38 44 Z" fill="#5c3a1f" opacity="0.6" />
        <path d="M16 16 L40 36 L64 64 L40 44 Z" fill="#5c3a1f" opacity="0.45" />
        <path d="M64 16 L44 36 L16 64 L36 44 Z" fill="#5c3a1f" opacity="0.45" />
      </svg>

      {/* Stamp slot — visible until stamping starts; compresses under impact */}
      <div
        className={[
          "relative flex h-[44%] w-[44%] items-center justify-center",
          stamping ? "animate-paper-press" : "",
        ].join(" ")}
      >
        {!stamping && (
          <div
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-dashed"
            style={{ borderColor: "rgba(92, 58, 31, 0.35)" }}
          />
        )}
        {stamping && (
          <>
            <InkStamp />
            <InkSplatter />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Flat ink-stamp impression — like a librarian's date stamp pressed into a book.
 */
function InkStamp() {
  return (
    <div
      className="animate-stamp-press absolute inset-[-6%] mix-blend-multiply"
      style={{ filter: "none" }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
        <defs>
          <filter id="dl2-ink-rough" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
            <feDisplacementMap in="SourceGraphic" scale="3.2" />
          </filter>
          <filter id="dl2-ink-patchy">
            <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="9" />
            <feColorMatrix
              values="0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 1.4 -0.35"
            />
            <feComposite in="SourceGraphic" in2="result" operator="in" />
          </filter>
        </defs>

        <g filter="url(#dl2-ink-rough)">
          <circle cx="50" cy="50" r="40" fill="#a0383a" fillOpacity="0.32" />
          <circle
            cx="50"
            cy="50"
            r="36"
            fill="none"
            stroke="#a0383a"
            strokeWidth="4.2"
            strokeOpacity="0.92"
          />
          <circle
            cx="50"
            cy="50"
            r="28"
            fill="none"
            stroke="#a0383a"
            strokeWidth="1.4"
            strokeOpacity="0.85"
          />

          <g fill="#7a2828" fillOpacity="0.92">
            <circle
              cx="50"
              cy="50"
              r="23"
              fill="none"
              stroke="#a0383a"
              strokeWidth="0.7"
              strokeOpacity="0.6"
            />
            <path d="M50 28 L52.2 50 L50 52 L47.8 50 Z" />
            <path d="M50 72 L52.2 50 L50 48 L47.8 50 Z" />
            <path d="M72 50 L50 52.2 L48 50 L50 47.8 Z" />
            <path d="M28 50 L50 52.2 L52 50 L50 47.8 Z" />
            <path d="M59.2 40.8 L51.06 51.06 L48.94 48.94 Z" />
            <path d="M40.8 40.8 L51.06 48.94 L48.94 51.06 Z" />
            <path d="M59.2 59.2 L51.06 48.94 L48.94 51.06 Z" />
            <path d="M40.8 59.2 L51.06 51.06 L48.94 48.94 Z" />
            <circle cx="50" cy="50" r="1.8" />
            <text
              x="50"
              y="22.5"
              textAnchor="middle"
              fontSize="5.5"
              fontFamily="ui-serif, Georgia, serif"
              fontWeight="700"
              fillOpacity="0.88"
            >
              N
            </text>
          </g>
        </g>

        <g filter="url(#dl2-ink-patchy)" opacity="0.45">
          <circle cx="50" cy="50" r="40" fill="#fbecd0" />
        </g>
      </svg>
    </div>
  );
}

/** Ink splatter — six tiny dark-red dots burst outward on stamp impact. */
function InkSplatter() {
  const dots = [
    { dx: -42, dy: -28, size: 3, delay: 50 },
    { dx: 38, dy: -34, size: 2.4, delay: 0 },
    { dx: 48, dy: 18, size: 3.4, delay: 80 },
    { dx: -36, dy: 38, size: 2, delay: 120 },
    { dx: 12, dy: 46, size: 2.6, delay: 60 },
    { dx: -52, dy: 6, size: 2.2, delay: 30 },
  ] as const;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 mix-blend-multiply">
      {dots.map((d, i) => (
        <span
          key={i}
          className="animate-ink-splat absolute left-1/2 top-1/2 rounded-full"
          style={
            {
              width: `${d.size}px`,
              height: `${d.size}px`,
              backgroundColor: "#7a2828",
              "--dx": `${d.dx}px`,
              "--dy": `${d.dy}px`,
              animationDelay: `${d.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
