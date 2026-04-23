"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Inbox, Mail, Sparkles, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/app/components/AuthProvider";
import { formatSmart } from "@/src/lib/formatSmart";
import {
  claimRenewalLetter,
  RENEWAL_EVENT_AMOUNT,
  RENEWAL_EVENT_TYPE,
} from "@/src/lib/renewalEvent";

type LetterDoc = {
  id: string;
  from: string;
  to: string;
  content: string;
  status: string;
  createdAt: Timestamp | null;
  deliveredAt: Timestamp | null;
  read: boolean;
  eventType?: string;
  eventId?: string;
  eventClaimed?: boolean;
};

export function ShootingStarLetter() {
  const { nickname } = useAuth();
  const [composeOpen, setComposeOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inbox, setInbox] = useState<LetterDoc[]>([]);
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  // Subscribe to user's approved inbox. Stays active even when Compose is open,
  // so unread count updates in real-time regardless of modal state.
  useEffect(() => {
    if (!nickname) {
      setInbox([]);
      return;
    }
    const q = query(
      collection(db, "letters"),
      where("to", "==", nickname),
      where("status", "==", "approved"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: LetterDoc[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          from: data.from ?? "",
          to: data.to ?? "",
          content: data.content ?? "",
          status: data.status ?? "",
          createdAt: (data.createdAt as Timestamp | null) ?? null,
          deliveredAt: (data.deliveredAt as Timestamp | null) ?? null,
          read: !!data.read,
          eventType: (data.eventType as string | undefined) ?? undefined,
          eventId: (data.eventId as string | undefined) ?? undefined,
          eventClaimed: !!data.eventClaimed,
        };
      });
      // Sort: unclaimed event gifts first (nudge user to open), then by
      // delivery time desc. Keeps a claimed event letter chronologically
      // placed like any other keepsake.
      list.sort((a, b) => {
        const ap = a.eventType && !a.eventClaimed ? 0 : 1;
        const bp = b.eventType && !b.eventClaimed ? 0 : 1;
        if (ap !== bp) return ap - bp;
        const at = a.deliveredAt?.toMillis?.() ?? 0;
        const bt = b.deliveredAt?.toMillis?.() ?? 0;
        return bt - at;
      });
      setInbox(list);
    });
    return () => unsub();
  }, [nickname]);

  const unreadCount = useMemo(
    () => (nickname ? inbox.filter((l) => !l.read).length : 0),
    [nickname, inbox],
  );

  // Has an unclaimed renewal gift waiting? Used to add an extra gold pulse
  // around the inbox button on top of the normal unread-count badge.
  const hasUnreadGift = useMemo(
    () =>
      inbox.some(
        (l) => l.eventType === RENEWAL_EVENT_TYPE && !l.eventClaimed,
      ),
    [inbox],
  );

  const requireLogin = () => {
    setAuthMsg("로그인이 필요합니다");
    setTimeout(() => setAuthMsg(null), 2400);
  };

  const handleCompose = () => {
    if (!nickname) return requireLogin();
    setComposeOpen(true);
  };

  const handleInbox = () => {
    if (!nickname) return requireLogin();
    setInboxOpen(true);
  };

  return (
    <section className="relative px-4 pb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-serif text-[11px] tracking-[0.4em] text-text-sub uppercase">
          Letters &amp; Whispers
        </span>
        <span className="font-serif text-[10px] text-text-sub">익명의 마음</span>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-nebula-pink/25 bg-abyss-deep/50 backdrop-blur-sm">
        {/* Comet tail decoration */}
        <svg
          className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 opacity-60"
          viewBox="0 0 120 120"
          aria-hidden
        >
          <defs>
            <linearGradient
              id="cometTailLong"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#FFE5C4" stopOpacity="0" />
              <stop offset="100%" stopColor="#FFB5A7" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          <path
            d="M 0 0 L 80 80"
            stroke="url(#cometTailLong)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="80" cy="80" r="4" fill="#FFE5C4" />
          <circle cx="80" cy="80" r="8" fill="#FFB5A7" opacity="0.3" />
        </svg>

        <div className="relative z-10 flex items-center gap-4 p-4">
          {/* Left: envelope illustration */}
          <div className="shrink-0">
            <svg width="88" height="60" viewBox="0 0 88 60" aria-hidden>
              <defs>
                <linearGradient
                  id="envBgWide"
                  x1="0%"
                  y1="0%"
                  x2="0%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#6B4BA8" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#3D2E6B" stopOpacity="0.9" />
                </linearGradient>
              </defs>
              <rect
                x="2"
                y="10"
                width="84"
                height="46"
                rx="3"
                fill="url(#envBgWide)"
                stroke="#D896C8"
                strokeOpacity="0.5"
              />
              <path
                d="M 2 12 L 44 38 L 86 12"
                fill="none"
                stroke="#D896C8"
                strokeOpacity="0.7"
                strokeWidth="1"
              />
              {/* Wax seal star */}
              <g transform="translate(44 36)">
                <circle r="10" fill="#0B0821" opacity="0.6" />
                <path
                  d="M0 -6 L1.5 -2 L6 -2 L2.5 1 L4 6 L0 3 L-4 6 L-2.5 1 L-6 -2 L-1.5 -2 Z"
                  fill="#FFE5C4"
                  style={{ filter: "drop-shadow(0 0 3px #FFE5C4)" }}
                />
              </g>
              {/* Small sparkles */}
              <circle cx="14" cy="20" r="0.8" fill="#FFE5C4" opacity="0.8" />
              <circle cx="74" cy="22" r="0.6" fill="#D896C8" opacity="0.7" />
              <circle cx="20" cy="46" r="0.5" fill="#FFE5C4" opacity="0.6" />
            </svg>
          </div>

          {/* Right: copy + actions */}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-nebula-pink" />
              <span className="font-serif text-[11px] tracking-wider text-stardust">
                별똥별 편지
              </span>
            </div>
            <h3 className="font-serif text-sm leading-snug text-text-primary text-pretty">
              익명의 마음을 밤하늘에 띄워요
            </h3>
            <p className="mt-1 font-sans text-[10px] leading-relaxed text-text-sub">
              누군가의 마음에 조용히 가닿을 편지 한 통.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleCompose}
                className="group relative flex flex-1 items-center justify-center gap-1.5 rounded-full border border-peach-accent/50 bg-peach-accent/10 px-3 py-2 text-[11px] font-serif tracking-wider text-stardust backdrop-blur-sm transition-all hover:border-peach-accent hover:bg-peach-accent/20"
              >
                <Sparkles className="h-3 w-3 shrink-0" />
                <span className="flex flex-col items-center leading-tight sm:flex-row sm:gap-1">
                  <span>마음</span>
                  <span>띄우기</span>
                </span>
              </button>
              <div className="relative">
                {/* Renewal gift signal — a layered glow + repeating particle
                    emitter + the button self-animating. Removed on claim so
                    the icon quietly returns to its default state. */}
                {hasUnreadGift && (
                  <>
                    {/* Background soft radial glow (brightness pulse) */}
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute -inset-6 rounded-full"
                      style={{
                        background:
                          "radial-gradient(circle, rgba(255,229,196,0.55) 0%, rgba(255,181,167,0.35) 40%, rgba(216,150,200,0.15) 65%, transparent 85%)",
                        filter: "blur(12px)",
                      }}
                      animate={{ opacity: [0.55, 1, 0.55], scale: [1, 1.15, 1] }}
                      transition={{
                        duration: 1.8,
                        repeat: Number.POSITIVE_INFINITY,
                        ease: "easeInOut",
                      }}
                    />
                    {/* Expanding pulse rings */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-full"
                      style={{
                        background:
                          "radial-gradient(circle, rgba(255,215,0,0.7) 0%, rgba(255,181,167,0.4) 45%, transparent 75%)",
                        animation:
                          "pulse-ring 1.6s cubic-bezier(0,0,0.2,1) infinite",
                      }}
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-full border-2"
                      style={{
                        borderColor: "rgba(255,229,196,1)",
                        animation:
                          "pulse-ring 1.6s cubic-bezier(0,0,0.2,1) -0.55s infinite",
                      }}
                    />
                    {/* Repeating firework-style particle bursts */}
                    <InboxBurstEmitter />
                  </>
                )}
                <motion.button
                  type="button"
                  onClick={handleInbox}
                  className={
                    "group relative flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-serif tracking-wider backdrop-blur-sm transition-all " +
                    (hasUnreadGift
                      ? "border-2 border-peach-accent/90 bg-abyss/60 text-stardust hover:border-peach-accent"
                      : "border border-nebula-pink/30 bg-abyss/40 text-text-sub hover:border-nebula-pink/60 hover:text-stardust")
                  }
                  style={
                    hasUnreadGift
                      ? {
                          boxShadow:
                            "0 0 12px rgba(255,229,196,0.75), 0 0 24px rgba(255,181,167,0.55), 0 0 48px rgba(216,150,200,0.35)",
                        }
                      : undefined
                  }
                  animate={
                    hasUnreadGift
                      ? {
                          y: [0, -5, 0],
                          rotate: [-3, 3, -3],
                          scale: [1, 1.15, 1],
                        }
                      : undefined
                  }
                  transition={
                    hasUnreadGift
                      ? {
                          duration: 2.2,
                          repeat: Number.POSITIVE_INFINITY,
                          ease: "easeInOut",
                        }
                      : undefined
                  }
                  whileHover={hasUnreadGift ? { scale: 1.22 } : undefined}
                  aria-label={
                    hasUnreadGift
                      ? "편지함 열기, 새벽의 선물이 도착했어요"
                      : unreadCount > 0
                        ? `편지함 열기, 미확인 ${unreadCount}건`
                        : "편지함 열기"
                  }
                >
                  <Inbox
                    className={"h-3 w-3 " + (hasUnreadGift ? "text-[#FFE5C4]" : "")}
                    style={
                      hasUnreadGift
                        ? {
                            filter:
                              "drop-shadow(0 0 6px rgba(255,229,196,1)) drop-shadow(0 0 12px rgba(255,215,0,0.8))",
                          }
                        : undefined
                    }
                  />
                  편지함
                  {unreadCount > 0 && (
                    <span
                      className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-peach-accent px-1 text-[9px] font-bold text-abyss"
                      style={{ boxShadow: "0 0 6px rgba(255,181,167,0.6)" }}
                    >
                      {unreadCount}
                    </span>
                  )}
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Auth-needed hint (shown briefly when logged-out user clicks a button) */}
      <AnimatePresence>
        {authMsg && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="mt-2 text-center font-serif text-[11px] italic text-nebula-pink"
          >
            {authMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compose modal */}
      <AnimatePresence>
        {composeOpen && nickname && (
          <ComposeModal
            nickname={nickname}
            onClose={() => setComposeOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Inbox modal */}
      <AnimatePresence>
        {inboxOpen && nickname && (
          <InboxModal
            letters={inbox}
            nickname={nickname}
            onClose={() => setInboxOpen(false)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

// ─── Shared modal shell styles ───
const MODAL_BACKDROP: React.CSSProperties = {
  background: "rgba(11,8,33,0.8)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

const MODAL_CARD: React.CSSProperties = {
  background: "rgba(26,15,61,0.92)",
  border: "1px solid rgba(216,150,200,0.3)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(107,75,168,0.4)",
};

const MODAL_TITLE: React.CSSProperties = {
  fontFamily: "'Noto Serif KR', serif",
  fontSize: "26px",
  fontWeight: 300,
  letterSpacing: "0.06em",
  backgroundImage: "linear-gradient(135deg, #FFE5C4, #D896C8, #6B4BA8)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: "transparent",
  filter: "drop-shadow(0 0 10px rgba(216,150,200,0.45))",
};

function NebulaGlows() {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(216,150,200,0.3) 0%, transparent 65%)",
          filter: "blur(28px)",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-12 -left-12 h-48 w-48 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(107,75,168,0.35) 0%, transparent 65%)",
          filter: "blur(32px)",
        }}
      />
    </>
  );
}

const BURST_PALETTE = [
  "#FFE5C4",
  "#FFD700",
  "#FFB5A7",
  "#D896C8",
  "#FFFFFF",
];

type InboxBurstParticle = {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
};

type InboxBurst = {
  id: number;
  particles: InboxBurstParticle[];
};

/**
 * Firework-style particle emitter mounted behind the inbox button when an
 * unclaimed renewal gift is waiting. Re-fires every 1.8s with 13 varied
 * particles per volley. Auto-cleans finished volleys so the React tree
 * stays lean.
 */
function InboxBurstEmitter() {
  const [bursts, setBursts] = useState<InboxBurst[]>([]);

  useEffect(() => {
    let counter = 0;
    let cancelled = false;

    const spawn = () => {
      if (cancelled) return;
      const id = ++counter;
      const particles: InboxBurstParticle[] = Array.from(
        { length: 13 },
        (_, i) => {
          // Spread in full circle but bias slightly upward so the effect
          // reads as a "burst" rather than a flat ring.
          const angle =
            (i / 13) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
          const speed = 32 + Math.random() * 36;
          return {
            id: i,
            x: Math.cos(angle) * speed,
            y: Math.sin(angle) * speed - 10,
            size: 2 + Math.random() * 3,
            color: BURST_PALETTE[i % BURST_PALETTE.length],
            delay: Math.random() * 0.12,
            duration: 1.0 + Math.random() * 0.4,
          };
        },
      );
      setBursts((prev) => [...prev, { id, particles }]);
      // Retire each volley ~1.5s after it spawns so the DOM doesn't grow.
      window.setTimeout(() => {
        if (cancelled) return;
        setBursts((prev) => prev.filter((b) => b.id !== id));
      }, 1500);
    };

    spawn();
    const interval = window.setInterval(spawn, 1800);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible"
    >
      {bursts.map((b) =>
        b.particles.map((p) => (
          <motion.span
            key={`${b.id}-${p.id}`}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,
              background: p.color,
              filter: `drop-shadow(0 0 ${p.size + 3}px ${p.color}) drop-shadow(0 0 ${
                p.size + 6
              }px ${p.color})`,
            }}
            initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
            animate={{
              x: p.x,
              y: p.y,
              scale: [0, 1.3, 0],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              ease: "easeOut",
              times: [0, 0.25, 1],
            }}
          />
        )),
      )}
    </div>
  );
}

/**
 * Expanding shock wave rendered at t=0 when the claim button is pressed.
 * Two concentric rings: the inner soft glow and the outer crisp border.
 */
function ClaimShockwave() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
    >
      <motion.span
        className="absolute rounded-full"
        style={{
          width: 80,
          height: 80,
          background:
            "radial-gradient(circle, rgba(255,229,196,0.85) 0%, rgba(255,181,167,0.5) 45%, rgba(216,150,200,0) 80%)",
          filter: "blur(4px)",
        }}
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: 7, opacity: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />
      <motion.span
        className="absolute rounded-full"
        style={{
          width: 60,
          height: 60,
          border: "2px solid #FFE5C4",
          boxShadow:
            "0 0 20px rgba(255,229,196,0.9), inset 0 0 20px rgba(255,181,167,0.6)",
        }}
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: 8, opacity: 0 }}
        transition={{ duration: 0.9, ease: "easeOut", delay: 0.05 }}
      />
    </div>
  );
}

/**
 * Particle burst — 60 stars fire from card center in every direction with
 * gravity-like physics. Mixed sizes/colors for a festive explosion.
 */
function ClaimBurst() {
  const stars = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => {
        // Even angular distribution + slight randomness so adjacent stars
        // don't stack visibly.
        const angle = (i / 60) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
        // Initial speed (determines how far stars fly before gravity).
        const speed = 130 + Math.random() * 180;
        // Horizontal: stars spread uniformly.
        const x = Math.cos(angle) * speed;
        // Vertical: launched upward first (-y) then pulled down by "gravity"
        // via waypoint arrays.
        const yLaunch = Math.sin(angle) * speed;
        const yFall = yLaunch + 220 + Math.random() * 180;
        return {
          id: i,
          x,
          yPath: [0, yLaunch, yFall] as [number, number, number],
          size: 3 + Math.random() * 6,
          color: BURST_PALETTE[i % BURST_PALETTE.length],
          delay: Math.random() * 0.25,
          duration: 1.3 + Math.random() * 0.9,
          rotate: (Math.random() - 0.5) * 540,
        };
      }),
    [],
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center overflow-visible"
    >
      {stars.map((s) => (
        <motion.span
          key={s.id}
          className="absolute rounded-full"
          style={{
            width: s.size,
            height: s.size,
            background: s.color,
            filter: `drop-shadow(0 0 ${s.size + 3}px ${s.color}) drop-shadow(0 0 ${
              s.size + 8
            }px ${s.color})`,
          }}
          initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: 0 }}
          animate={{
            x: s.x,
            y: s.yPath,
            scale: [0, 1.3, 1, 0.4],
            opacity: [0, 1, 1, 0],
            rotate: s.rotate,
          }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            ease: "easeOut",
            times: [0, 0.15, 0.5, 1],
          }}
        />
      ))}
    </div>
  );
}

/** Huge gold "✦ +50 별빛 ✦" that bounces in after the burst begins. */
function ClaimBigText({ amount }: { amount: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop halo so the text reads against the card */}
      <motion.span
        className="absolute rounded-full"
        style={{
          width: 320,
          height: 320,
          background:
            "radial-gradient(circle, rgba(255,229,196,0.55) 0%, rgba(255,181,167,0.3) 35%, rgba(216,150,200,0.15) 60%, transparent 80%)",
          filter: "blur(6px)",
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.1, 1], opacity: [0, 1, 0.7] }}
        transition={{ duration: 0.9, delay: 0.8, ease: "easeOut" }}
      />
      <motion.p
        className="relative font-serif font-bold tracking-wider"
        style={{
          fontSize: 48,
          backgroundImage:
            "linear-gradient(135deg, #FFF5E0 0%, #FFD700 35%, #FFB5A7 70%, #D896C8 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
          filter:
            "drop-shadow(0 0 12px rgba(255,229,196,0.95)) drop-shadow(0 0 28px rgba(255,181,167,0.75)) drop-shadow(0 0 48px rgba(216,150,200,0.55))",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
        }}
        initial={{ scale: 0, opacity: 0, y: 10 }}
        animate={{
          scale: [0, 1.35, 0.95, 1],
          opacity: [0, 1, 1, 1],
          y: [10, -2, 1, 0],
        }}
        transition={{
          duration: 0.9,
          delay: 0.8,
          ease: "easeOut",
          times: [0, 0.5, 0.78, 1],
        }}
      >
        ✦ +{amount} 별빛 ✦
      </motion.p>
    </div>
  );
}

/**
 * The big "별빛 받기" button for renewal letters. 1.5× the normal button
 * size, continuously pulses while unclaimed, and floats two tiny satellite
 * stars that orbit just above the button lip. Turns into a muted "이미
 * 받으셨습니다" state when claimed.
 */
function ClaimButton({
  eventClaimed,
  claiming,
  onClick,
}: {
  eventClaimed: boolean;
  claiming: boolean;
  onClick: () => void;
}) {
  if (eventClaimed) {
    return (
      <button
        type="button"
        disabled
        aria-label="이미 수령"
        className="rounded-full px-5 py-2 font-serif text-[12px] font-medium tracking-wider disabled:cursor-not-allowed"
        style={{
          background: "rgba(26,15,61,0.55)",
          border: "1px solid rgba(216,150,200,0.3)",
          color: "rgba(255,229,196,0.65)",
        }}
      >
        ✓ 별빛을 받으셨습니다
      </button>
    );
  }

  return (
    <div className="relative">
      {/* Outer pulsing glow ring */}
      {!claiming && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,229,196,0.6) 0%, rgba(255,181,167,0.35) 45%, transparent 75%)",
            filter: "blur(6px)",
          }}
          animate={{ scale: [1, 1.25, 1], opacity: [0.8, 0.4, 0.8] }}
          transition={{
            duration: 1.6,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Orbital star decorations (2) */}
      {!claiming && (
        <>
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -top-3 left-2 text-[14px]"
            style={{
              filter:
                "drop-shadow(0 0 6px rgba(255,229,196,1)) drop-shadow(0 0 12px rgba(255,215,0,0.7))",
              color: "#FFE5C4",
            }}
            animate={{ y: [0, -4, 0], opacity: [0.7, 1, 0.7] }}
            transition={{
              duration: 1.8,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          >
            ✦
          </motion.span>
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -top-2 right-3 text-[11px]"
            style={{
              filter:
                "drop-shadow(0 0 5px rgba(255,229,196,0.9)) drop-shadow(0 0 10px rgba(216,150,200,0.7))",
              color: "#FFB5A7",
            }}
            animate={{ y: [0, -3, 0], opacity: [0.6, 1, 0.6] }}
            transition={{
              duration: 1.4,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
              delay: 0.5,
            }}
          >
            ✧
          </motion.span>
        </>
      )}

      <motion.button
        type="button"
        onClick={onClick}
        disabled={claiming}
        aria-label="별빛 받기"
        className="relative rounded-full font-serif font-bold tracking-wider transition-all disabled:cursor-not-allowed"
        style={{
          padding: "12px 26px",
          fontSize: 16,
          background: claiming
            ? "rgba(216,150,200,0.3)"
            : "linear-gradient(135deg, #FFF5E0 0%, #FFD700 35%, #FFB5A7 70%, #D896C8 100%)",
          border: "2px solid rgba(255,255,255,0.75)",
          boxShadow: claiming
            ? "none"
            : "0 0 20px rgba(255,229,196,0.9), 0 0 40px rgba(255,181,167,0.6), 0 0 64px rgba(216,150,200,0.4)",
          color: claiming ? "rgba(255,229,196,0.8)" : "rgba(11,8,33,1)",
        }}
        animate={claiming ? undefined : { scale: [1, 1.06, 1] }}
        transition={
          claiming
            ? undefined
            : {
                duration: 1.3,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
              }
        }
        whileHover={
          claiming
            ? undefined
            : {
                scale: 1.12,
                boxShadow:
                  "0 0 28px rgba(255,229,196,1), 0 0 56px rgba(255,181,167,0.85), 0 0 96px rgba(216,150,200,0.6)",
              }
        }
      >
        {claiming ? "수령 중..." : "✨ 별빛 받기 ✨"}
      </motion.button>
    </div>
  );
}

/**
 * Line-by-line staggered reveal of the renewal letter content. Each line
 * fades in + slides up; the "✦ 별빛 50 ✦" line gets a bigger gold accent.
 * Empty lines render as half-line spacers so blank paragraphs don't collapse.
 */
function RenewalLetterBody({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={i} style={{ height: 8 }} />;
        }
        const isAccent = trimmed.includes("별빛 50") || trimmed.startsWith("✦");
        const isHeader = trimmed.startsWith("✨");
        return (
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.4,
              delay: 0.15 + i * 0.08,
              ease: "easeOut",
            }}
            className={
              "wrap-anywhere font-serif " +
              (isAccent
                ? "text-[22px] font-semibold tracking-wider"
                : isHeader
                  ? "text-[16px] font-medium tracking-widest"
                  : "text-[13px] leading-relaxed")
            }
            style={
              isAccent
                ? {
                    backgroundImage:
                      "linear-gradient(135deg, #FFF5E0, #FFD700, #FFB5A7)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    color: "transparent",
                    filter:
                      "drop-shadow(0 0 8px rgba(255,229,196,0.9)) drop-shadow(0 0 20px rgba(255,181,167,0.6))",
                    marginTop: 6,
                    marginBottom: 6,
                  }
                : isHeader
                  ? {
                      color: "#FFE5C4",
                      textShadow:
                        "0 0 10px rgba(255,229,196,0.8), 0 0 20px rgba(255,181,167,0.5)",
                    }
                  : {
                      color: "#f4efff",
                      textShadow: "0 0 8px rgba(255,229,196,0.25)",
                      lineHeight: 1.9,
                    }
            }
          >
            {trimmed}
          </motion.p>
        );
      })}
    </div>
  );
}

/** Blessing subtitle that fades in below the big text. */
function ClaimMessage() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center"
    >
      <motion.p
        className="relative translate-y-16 text-center font-serif italic text-pretty"
        style={{
          fontSize: 18,
          color: "#FFE5C4",
          textShadow:
            "0 0 10px rgba(255,229,196,0.9), 0 0 20px rgba(255,181,167,0.7), 0 0 32px rgba(216,150,200,0.5)",
          letterSpacing: "0.05em",
        }}
        initial={{ opacity: 0, y: 72 }}
        animate={{ opacity: 1, y: 64 }}
        transition={{ duration: 0.6, delay: 1.5, ease: "easeOut" }}
      >
        새벽의 축복이 함께하기를 ✨
      </motion.p>
    </div>
  );
}

const GIFT_PALETTE = ["#FFE5C4", "#FFD700", "#FFB5A7", "#D896C8", "#FFFFFF"];

/** Four twinkling star decorations anchored to the card corners. */
function CornerStars() {
  const positions = [
    { top: -10, left: -10, size: 16, delay: 0 },
    { top: -10, right: -10, size: 14, delay: 0.6 },
    { bottom: -10, left: -10, size: 14, delay: 1.2 },
    { bottom: -10, right: -10, size: 16, delay: 1.8 },
  ] as const;
  return (
    <>
      {positions.map((p, i) => (
        <svg
          key={i}
          aria-hidden
          width={p.size}
          height={p.size}
          viewBox="0 0 10 10"
          className="pointer-events-none absolute z-10"
          style={{
            top: "top" in p ? p.top : undefined,
            bottom: "bottom" in p ? p.bottom : undefined,
            left: "left" in p ? p.left : undefined,
            right: "right" in p ? p.right : undefined,
            filter:
              "drop-shadow(0 0 6px rgba(255,229,196,1)) drop-shadow(0 0 14px rgba(255,215,0,0.8))",
            animation: `twinkle 2.2s ease-in-out ${p.delay}s infinite`,
          }}
        >
          <path
            d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z"
            fill="#FFE5C4"
          />
        </svg>
      ))}
    </>
  );
}

/** Dense drifting sparkle field that surrounds the gift letter card. */
function GiftParticles() {
  // Pre-computed positions for 22 particles spread around the card edges
  // and interior. Deterministic so the visual feels stable across rerenders.
  const particles = [
    { left: "4%", top: "6%", size: 5, delay: 0, color: 0 },
    { left: "94%", top: "10%", size: 6, delay: 0.3, color: 1 },
    { left: "8%", top: "56%", size: 4, delay: 0.9, color: 2 },
    { left: "90%", top: "60%", size: 5, delay: 1.4, color: 3 },
    { left: "48%", top: "3%", size: 4, delay: 0.6, color: 1 },
    { left: "50%", top: "96%", size: 5, delay: 1.1, color: 2 },
    { left: "20%", top: "30%", size: 3, delay: 1.8, color: 0 },
    { left: "78%", top: "34%", size: 4, delay: 0.15, color: 3 },
    { left: "14%", top: "78%", size: 3, delay: 2.1, color: 1 },
    { left: "84%", top: "80%", size: 4, delay: 0.45, color: 0 },
    { left: "30%", top: "12%", size: 3, delay: 1.3, color: 4 },
    { left: "66%", top: "16%", size: 3.5, delay: 0.75, color: 2 },
    { left: "34%", top: "88%", size: 3, delay: 1.6, color: 4 },
    { left: "62%", top: "82%", size: 3.5, delay: 0.25, color: 1 },
    { left: "2%", top: "38%", size: 2.5, delay: 1.0, color: 3 },
    { left: "96%", top: "42%", size: 2.5, delay: 0.55, color: 0 },
    { left: "40%", top: "50%", size: 2, delay: 2.4, color: 4 },
    { left: "58%", top: "48%", size: 2, delay: 0.85, color: 2 },
    { left: "24%", top: "64%", size: 3, delay: 1.9, color: 0 },
    { left: "72%", top: "68%", size: 3, delay: 0.05, color: 3 },
    { left: "12%", top: "22%", size: 2.5, delay: 2.2, color: 2 },
    { left: "86%", top: "26%", size: 2.5, delay: 0.35, color: 4 },
  ];
  return (
    <>
      {particles.map((p, i) => {
        const c = GIFT_PALETTE[p.color];
        return (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              background: c,
              filter: `drop-shadow(0 0 ${p.size + 3}px ${c}) drop-shadow(0 0 ${p.size + 6}px ${c})`,
              animation: `twinkle 2.4s ease-in-out ${p.delay}s infinite`,
            }}
          />
        );
      })}
    </>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="닫기"
      className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-stardust transition-colors hover:bg-nebula-pink/20"
      style={{
        background: "rgba(11,8,33,0.6)",
        border: "1px solid rgba(216,150,200,0.3)",
      }}
    >
      <X className="h-4 w-4" />
    </button>
  );
}

function ComposeModal({
  nickname,
  onClose,
}: {
  nickname: string;
  onClose: () => void;
}) {
  const [users, setUsers] = useState<string[]>([]);
  const [to, setTo] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Fetch users list for recipient dropdown (same query as legacy Mailbox)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        if (cancelled) return;
        const nicks = snap.docs
          .map((d) => (d.data().nickname as string | undefined) ?? d.id)
          .filter((n) => !!n && n !== nickname)
          .sort((a, b) => a.localeCompare(b, "ko"));
        setUsers(nicks);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nickname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleSend = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending || doneMsg) return;
    if (!to) {
      setErr("받을 사람을 선택해주세요");
      return;
    }
    if (!content.trim()) {
      setErr("편지 내용을 입력해주세요");
      return;
    }
    setErr(null);
    setSending(true);
    try {
      await addDoc(collection(db, "letters"), {
        from: nickname,
        to,
        content: content.trim(),
        status: "pending",
        read: false,
        createdAt: serverTimestamp(),
        deliveredAt: null,
      });
      setDoneMsg("편지가 우체통에 넣어졌습니다. 곧 전달될 거예요!");
      setContent("");
      setTo("");
      setTimeout(() => {
        setDoneMsg(null);
        onClose();
      }, 2000);
    } catch (e) {
      console.error(e);
      setErr("전송에 실패했습니다");
    }
    setSending(false);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={MODAL_BACKDROP}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="편지 쓰기"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl"
        style={MODAL_CARD}
        initial={{ scale: 0.95, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 20, opacity: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <NebulaGlows />
        <CloseButton onClose={onClose} />

        {/* Title */}
        <div className="relative px-6 pb-2 pt-9 text-center">
          <h2 className="leading-none" style={MODAL_TITLE}>
            별똥별 편지
          </h2>
          <p className="mt-2 font-serif text-[10px] tracking-[0.35em] text-nebula-pink/80 uppercase">
            To the Stars
          </p>
          <p className="mt-3 font-serif text-[11px] italic text-text-sub">
            익명으로 전달돼요
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSend}
          className="relative flex flex-col gap-3 px-6 pb-6 pt-3"
        >
          {/* Recipient select */}
          <label className="relative block">
            <span className="sr-only">받을 사람</span>
            <select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={sending || !!doneMsg}
              aria-label="받을 사람"
              className="w-full appearance-none rounded-full border border-nebula-pink/25 bg-abyss-deep/50 px-4 py-2.5 pr-10 font-serif text-sm text-text-primary backdrop-blur-sm transition-all focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30 disabled:opacity-60"
            >
              <option value="" className="bg-abyss-deep text-text-sub">
                받을 사람을 선택하세요
              </option>
              {users.map((u) => (
                <option
                  key={u}
                  value={u}
                  className="bg-abyss-deep text-text-primary"
                >
                  {u}
                </option>
              ))}
            </select>
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-nebula-pink"
            >
              <ChevronDown className="h-4 w-4" />
            </span>
          </label>

          {/* Content textarea */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={sending || !!doneMsg}
            placeholder="마음을 담은 한 마디를 적어주세요"
            rows={6}
            aria-label="편지 내용"
            className="nebula-scroll w-full resize-none rounded-2xl border border-nebula-pink/25 bg-abyss-deep/50 px-4 py-3 font-serif text-sm leading-relaxed text-text-primary placeholder:italic placeholder:text-text-sub/70 backdrop-blur-sm transition-all focus:border-peach-accent/60 focus:outline-none focus:ring-2 focus:ring-peach-accent/30 disabled:opacity-60"
          />

          {err && (
            <p
              className="text-center font-serif text-[11px] italic"
              style={{ color: "#E8A8B8" }}
            >
              {err}
            </p>
          )}

          {doneMsg && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-2"
            >
              <Sparkles
                className="h-3.5 w-3.5 text-peach-accent"
                style={{ filter: "drop-shadow(0 0 6px rgba(255,181,167,0.9))" }}
              />
              <p className="text-center font-serif text-[12px] italic text-stardust">
                {doneMsg}
              </p>
            </motion.div>
          )}

          <button
            type="submit"
            disabled={sending || !!doneMsg}
            className="mt-1 w-full rounded-full py-2.5 font-serif text-sm font-medium tracking-wider text-abyss-deep transition-all duration-200 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
              boxShadow: "0 0 14px rgba(255,181,167,0.5)",
            }}
          >
            {sending ? "보내는 중..." : doneMsg ? "전송됨" : "보내기"}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

function InboxModal({
  letters,
  nickname,
  onClose,
}: {
  letters: LetterDoc[];
  nickname: string;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [marking, setMarking] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimErr, setClaimErr] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ amount: number } | null>(
    null,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Auto-clear the celebration after 3.5s. Button state flips via snapshot
  // (eventClaimed: true) independently, so the card stays in the claimed
  // state even after the overlay fades.
  //
  // Timeline inside the celebration:
  //   0ms    — shockwave + card shake
  //   300ms  — 60-particle star burst
  //   800ms  — "+50 별빛" big text bounces in
  //   1500ms — blessing message fades in below
  //   3500ms — everything fades out (setCelebration(null))
  useEffect(() => {
    if (!celebration) return;
    const t = window.setTimeout(() => setCelebration(null), 3500);
    return () => window.clearTimeout(t);
  }, [celebration]);

  // Auto-clear claim errors after 3s.
  useEffect(() => {
    if (!claimErr) return;
    const t = window.setTimeout(() => setClaimErr(null), 3000);
    return () => window.clearTimeout(t);
  }, [claimErr]);

  const safeIdx = Math.max(0, Math.min(idx, letters.length - 1));
  const current = letters[safeIdx];
  const isEvent = current?.eventType === RENEWAL_EVENT_TYPE;
  const isUnclaimedEvent = isEvent && !current?.eventClaimed;

  const handleRead = async () => {
    if (!current || current.read || marking) return;
    setMarking(true);
    try {
      await updateDoc(doc(db, "letters", current.id), { read: true });
    } catch (e) {
      console.error(e);
    }
    setMarking(false);
  };

  const handleClaim = async () => {
    if (!current || claiming) return;
    if (current.eventClaimed) return;
    if (current.eventType !== RENEWAL_EVENT_TYPE) return;
    setClaimErr(null);
    setClaiming(true);
    try {
      await claimRenewalLetter(nickname, current.id);
      setCelebration({ amount: RENEWAL_EVENT_AMOUNT });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "ALREADY_CLAIMED") {
        setClaimErr("이미 수령한 선물입니다");
      } else if (msg === "USER_NOT_FOUND") {
        setClaimErr("계정을 찾을 수 없어요. 다시 로그인해 주세요.");
      } else {
        setClaimErr("잠시 후 다시 시도해 주세요");
        console.error("claimRenewalLetter failed:", e);
      }
    }
    setClaiming(false);
  };

  // Visual tokens — swap the modal skin based on whether the current letter
  // is a renewal gift. Keeping this as a single gate avoids forking the
  // whole render tree.
  const cardStyle: React.CSSProperties = isEvent
    ? {
        background:
          "linear-gradient(145deg, rgba(46,25,80,0.95) 0%, rgba(26,15,61,0.95) 60%, rgba(60,30,75,0.95) 100%)",
        border: "3px solid rgba(255,215,100,0.85)",
        boxShadow:
          "0 20px 60px rgba(0,0,0,0.65), 0 0 60px rgba(255,215,0,0.55), 0 0 120px rgba(255,181,167,0.45), 0 0 180px rgba(216,150,200,0.3), inset 0 0 40px rgba(255,229,196,0.08)",
      }
    : MODAL_CARD;

  const contentBoxStyle: React.CSSProperties = isEvent
    ? {
        background:
          "linear-gradient(135deg, rgba(255,229,196,0.12), rgba(255,181,167,0.08) 50%, rgba(216,150,200,0.1))",
        border: "1px solid rgba(255,229,196,0.35)",
        boxShadow: "inset 0 0 20px rgba(255,229,196,0.08)",
      }
    : {
        background: "rgba(11,8,33,0.4)",
        border: "1px solid rgba(216,150,200,0.2)",
      };

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={MODAL_BACKDROP}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="받은 편지함"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className={
          "relative w-full max-w-sm rounded-2xl " +
          (isEvent ? "overflow-visible" : "overflow-hidden")
        }
        style={cardStyle}
        initial={{ scale: 0.95, y: 20, opacity: 0 }}
        animate={
          celebration
            ? {
                scale: [1, 1.02, 0.98, 1.01, 1],
                x: [0, -6, 6, -4, 4, -2, 2, 0],
                opacity: 1,
                y: 0,
              }
            : isEvent
              ? { scale: [1, 1.015, 1], opacity: 1, y: [0, -4, 0] }
              : { scale: 1, y: 0, opacity: 1 }
        }
        exit={{ scale: 0.95, y: 20, opacity: 0 }}
        transition={
          celebration
            ? {
                scale: { duration: 0.45, ease: "easeOut" },
                x: { duration: 0.45, ease: "easeOut" },
              }
            : isEvent
              ? {
                  scale: {
                    duration: 3,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                  },
                  opacity: { duration: 0.25, ease: "easeOut" },
                  y: {
                    duration: 4,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                  },
                }
              : { duration: 0.25, ease: "easeOut" }
        }
      >
        <NebulaGlows />
        {isEvent && <GiftParticles />}
        {isEvent && <CornerStars />}
        <CloseButton onClose={onClose} />

        {/* Claim celebration sequence — shockwave + burst + big text +
            blessing message, staggered over ~2s with auto-clear at 3.5s. */}
        <AnimatePresence>
          {celebration && (
            <>
              <ClaimShockwave key="shockwave" />
              <ClaimBurst key="burst" />
              <ClaimBigText key="bigtext" amount={celebration.amount} />
              <ClaimMessage key="msg" />
            </>
          )}
        </AnimatePresence>

        {/* Unclaimed gift — floating NEW badge (bigger + brighter glow) */}
        {isUnclaimedEvent && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -left-1 -top-1 z-10 rounded-full px-3 py-1.5 font-serif text-[12px] font-bold tracking-wider text-abyss-deep"
            style={{
              background: "linear-gradient(135deg, #FFF5E0, #FFD700, #FFB5A7, #D896C8)",
              boxShadow:
                "0 0 14px rgba(255,229,196,1), 0 0 28px rgba(255,181,167,0.9), 0 0 48px rgba(216,150,200,0.65)",
              border: "2px solid rgba(255,255,255,0.85)",
            }}
            animate={{
              y: [0, -3, 0],
              scale: [1, 1.08, 1],
            }}
            transition={{
              duration: 1.3,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          >
            NEW ✨
          </motion.span>
        )}

        {/* Title */}
        <div className="relative px-6 pb-3 pt-9 text-center">
          <h2 className="leading-none" style={MODAL_TITLE}>
            {isEvent ? "새벽의 선물" : "도착한 마음"}
          </h2>
          <p className="mt-2 font-serif text-[10px] tracking-[0.35em] text-nebula-pink/80 uppercase">
            {isEvent ? "Gift from Dawnlight" : "Letters from Afar"}
          </p>
        </div>

        {letters.length === 0 || !current ? (
          <div className="relative px-6 pb-10 pt-3 text-center">
            <span
              aria-hidden
              className="mb-3 inline-block text-3xl text-text-sub/60"
              style={{ filter: "drop-shadow(0 0 10px rgba(216,150,200,0.5))" }}
            >
              ✦
            </span>
            <p className="font-serif text-[13px] italic text-text-sub text-balance">
              아직 도착한 편지가 없어요
            </p>
          </div>
        ) : (
          <div className="relative px-6 pb-6 pt-3">
            {/* Meta row */}
            <div className="mb-2 flex items-center justify-between">
              <span className="font-serif text-[10px] italic text-text-sub">
                {isEvent && (
                  <span className="mr-2 text-stardust">
                    from {current.from}
                  </span>
                )}
                {current.deliveredAt
                  ? formatSmart(current.deliveredAt.toDate())
                  : current.createdAt
                    ? formatSmart(current.createdAt.toDate())
                    : ""}
              </span>
              <span className="inline-flex items-center gap-1.5 font-serif text-[10px] tracking-wider text-stardust">
                {safeIdx + 1} / {letters.length}
                {!current.read && (
                  <span
                    aria-label="미확인"
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{
                      background: "#FFB5A7",
                      boxShadow: "0 0 6px rgba(255,181,167,0.9)",
                    }}
                  />
                )}
              </span>
            </div>

            {/* Letter content — event letters get line-by-line reveal with
                a highlighted "별빛 50" accent line. Normal letters render as
                a single pre-wrapped paragraph. */}
            <div
              className="nebula-scroll relative max-h-[45vh] overflow-y-auto rounded-xl p-5 backdrop-blur-sm"
              style={contentBoxStyle}
            >
              {isEvent ? (
                <RenewalLetterBody
                  key={current.id}
                  content={current.content}
                />
              ) : (
                <p className="wrap-anywhere whitespace-pre-wrap font-serif text-[13px] leading-relaxed text-text-primary">
                  {current.content}
                </p>
              )}
            </div>

            {/* Controls */}
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIdx(Math.max(0, safeIdx - 1))}
                disabled={safeIdx <= 0}
                aria-label="이전 편지"
                className="rounded-full border border-nebula-pink/30 bg-abyss-deep/50 px-3 py-1.5 font-serif text-[11px] tracking-wider text-stardust backdrop-blur-sm transition-all hover:border-nebula-pink/60 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ‹ 이전
              </button>

              {isEvent ? (
                <ClaimButton
                  eventClaimed={!!current.eventClaimed}
                  claiming={claiming}
                  onClick={handleClaim}
                />
              ) : (
                <button
                  type="button"
                  onClick={handleRead}
                  disabled={current.read || marking}
                  className="rounded-full px-4 py-2 font-serif text-[11px] font-medium tracking-wider transition-all disabled:cursor-not-allowed"
                  style={{
                    background: current.read
                      ? "rgba(26,15,61,0.5)"
                      : "linear-gradient(135deg, #FFE5C4, #FFB5A7)",
                    border: current.read
                      ? "1px solid rgba(216,150,200,0.3)"
                      : "none",
                    boxShadow: current.read
                      ? "none"
                      : "0 0 12px rgba(255,181,167,0.5)",
                    color: current.read
                      ? "rgba(255,229,196,0.7)"
                      : "rgba(11,8,33,1)",
                  }}
                >
                  {current.read
                    ? "읽음"
                    : marking
                      ? "처리 중..."
                      : "읽었습니다"}
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  setIdx(Math.min(letters.length - 1, safeIdx + 1))
                }
                disabled={safeIdx >= letters.length - 1}
                aria-label="다음 편지"
                className="rounded-full border border-nebula-pink/30 bg-abyss-deep/50 px-3 py-1.5 font-serif text-[11px] tracking-wider text-stardust backdrop-blur-sm transition-all hover:border-nebula-pink/60 disabled:cursor-not-allowed disabled:opacity-30"
              >
                다음 ›
              </button>
            </div>

            {/* Claim error — inline, auto-clears after 3s */}
            <AnimatePresence>
              {claimErr && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="mt-3 text-center font-serif text-[11px] italic"
                  style={{ color: "#E8A8B8" }}
                >
                  {claimErr}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
