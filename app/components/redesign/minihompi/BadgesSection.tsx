"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lock } from "lucide-react";
import { Timestamp } from "firebase/firestore";
import { BADGES, type BadgeMeta } from "@/src/lib/badges";
import { listEarnedBadges } from "@/src/lib/badgeCheck";
import { formatSmart } from "@/src/lib/formatSmart";
import { useAuth } from "@/app/components/AuthProvider";
import { CollapsibleSection } from "./CollapsibleSection";

type EarnedMap = Record<string, Timestamp | null>;
type Shape = "star" | "hex" | "circle";
const SHAPES: Shape[] = ["star", "hex", "circle"];

function hashCode(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function BadgesSection({ nickname }: { nickname: string }) {
  const { nickname: viewerNick } = useAuth();
  const isOwner = !!viewerNick && viewerNick === nickname;
  const [earned, setEarned] = useState<EarnedMap>({});
  const [detail, setDetail] = useState<BadgeMeta | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listEarnedBadges(nickname);
        if (cancelled) return;
        const map: EarnedMap = {};
        for (const e of list) map[e.id] = e.earnedAt;
        setEarned(map);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nickname]);

  const total = BADGES.length;
  const earnedCount = useMemo(
    () => BADGES.filter((b) => earned[b.id] !== undefined).length,
    [earned],
  );

  return (
    <>
      <CollapsibleSection
        title={`배지 컬렉션 (${earnedCount}/${total})`}
        defaultOpen={false}
      >
        <div className="grid grid-cols-5 gap-3 sm:grid-cols-7 md:grid-cols-8">
          {BADGES.map((b) => {
            const isEarned = earned[b.id] !== undefined;
            return (
              <BadgeItem
                key={b.id}
                badge={b}
                isEarned={isEarned}
                canReveal={isOwner}
                shape={SHAPES[hashCode(b.id) % 3]}
                hue={hashCode(b.id + "h") % 360}
                onOpen={() => {
                  if (isOwner) {
                    setDetail(b);
                  } else {
                    setPrivacyOpen(true);
                  }
                }}
              />
            );
          })}
        </div>
      </CollapsibleSection>

      {detail && (
        <BadgeDetailModal
          badge={detail}
          earnedAt={earned[detail.id] ?? null}
          isEarned={earned[detail.id] !== undefined}
          canReveal={isOwner}
          onClose={() => setDetail(null)}
        />
      )}

      {privacyOpen && <PrivacyModal onClose={() => setPrivacyOpen(false)} />}
    </>
  );
}

function BadgeItem({
  badge,
  isEarned,
  canReveal,
  shape,
  hue,
  onOpen,
}: {
  badge: BadgeMeta;
  isEarned: boolean;
  canReveal: boolean;
  shape: Shape;
  hue: number;
  onOpen: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [tipPos, setTipPos] = useState<{
    top: number;
    left: number;
    below: boolean;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const [canHover, setCanHover] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    setCanHover(mq.matches);
    const handler = (e: MediaQueryListEvent) => setCanHover(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const handleEnter = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      // Flip below when less than ~90px of space above (viewport + section edge margin)
      const below = rect.top < 90;
      setTipPos({
        top: below ? rect.bottom + 8 : rect.top - 8,
        left: rect.left + rect.width / 2,
        below,
      });
    }
    setHover(true);
  };

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onOpen}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHover(false)}
      onFocus={handleEnter}
      onBlur={() => setHover(false)}
      className="group relative flex flex-col items-center gap-1.5 transition-transform hover:-translate-y-0.5"
      aria-label={isEarned ? badge.name : "미획득 배지"}
    >
      <div
        className="relative flex h-11 w-11 items-center justify-center sm:h-12 sm:w-12"
        style={{ opacity: isEarned ? 1 : 0.25 }}
      >
        <BadgeShape shape={shape} hue={hue} unlocked={isEarned} />
        {/* Emoji centered on top of shape */}
        {isEarned ? (
          <span
            className="absolute text-base leading-none"
            style={{
              filter: "drop-shadow(0 0 3px rgba(255,229,196,0.85))",
            }}
            aria-hidden
          >
            {badge.emoji}
          </span>
        ) : (
          <Lock
            className="absolute h-3.5 w-3.5 text-text-sub/90"
            aria-hidden
            style={{ filter: "drop-shadow(0 0 4px rgba(0,0,0,0.5))" }}
          />
        )}
      </div>
      <span
        className="max-w-full truncate font-serif text-[9px] tracking-wide text-text-sub/80"
        style={{ opacity: isEarned ? 1 : 0.4 }}
      >
        {isEarned ? badge.name : "???"}
      </span>

      {mounted &&
        canHover &&
        hover &&
        tipPos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] whitespace-nowrap rounded-md border border-nebula-pink/30 bg-abyss-deep/95 px-2.5 py-1.5 text-center backdrop-blur-md"
            style={{
              top: tipPos.top,
              left: tipPos.left,
              transform: tipPos.below
                ? "translateX(-50%)"
                : "translate(-50%, -100%)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            }}
          >
            <div className="font-serif text-[11px] tracking-wider text-stardust">
              {canReveal && isEarned ? badge.name : "???"}
            </div>
            <div className="mt-0.5 font-serif text-[9px] italic text-text-sub">
              {canReveal && isEarned
                ? badge.description
                : canReveal
                  ? "획득 조건 비공개"
                  : "본인만 볼 수 있음"}
            </div>
            <span
              aria-hidden
              className={
                "absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-abyss-deep/95 " +
                (tipPos.below
                  ? "top-0 -translate-y-1/2 border-l border-t border-nebula-pink/30"
                  : "top-full -translate-y-1/2 border-b border-r border-nebula-pink/30")
              }
            />
          </div>,
          document.body,
        )}
    </button>
  );
}

function BadgeShape({
  shape,
  hue,
  unlocked,
}: {
  shape: Shape;
  hue: number;
  unlocked: boolean;
}) {
  const gradId = `badge-grad-${hue}-${shape}-${unlocked ? 1 : 0}`;
  const colorA = unlocked ? "#FFE5C4" : "#3D2E6B";
  const colorB = unlocked ? `hsl(${hue}, 60%, 60%)` : "#1A0F3D";
  const colorC = unlocked ? "#6B4BA8" : "#0B0821";

  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colorA} />
          <stop offset="50%" stopColor={colorB} />
          <stop offset="100%" stopColor={colorC} />
        </linearGradient>
        <filter id={`glow-${gradId}`}>
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {shape === "star" && (
        <path
          d="M24 4 L28 18 L43 20 L32 30 L35 44 L24 37 L13 44 L16 30 L5 20 L20 18 Z"
          fill={`url(#${gradId})`}
          stroke={unlocked ? "#FFE5C4" : "rgba(255,229,196,0.2)"}
          strokeWidth="0.8"
          filter={unlocked ? `url(#glow-${gradId})` : undefined}
        />
      )}
      {shape === "hex" && (
        <path
          d="M24 4 L40 13 L40 35 L24 44 L8 35 L8 13 Z"
          fill={`url(#${gradId})`}
          stroke={unlocked ? "#FFE5C4" : "rgba(255,229,196,0.2)"}
          strokeWidth="0.8"
          filter={unlocked ? `url(#glow-${gradId})` : undefined}
        />
      )}
      {shape === "circle" && (
        <circle
          cx="24"
          cy="24"
          r="19"
          fill={`url(#${gradId})`}
          stroke={unlocked ? "#FFE5C4" : "rgba(255,229,196,0.2)"}
          strokeWidth="0.8"
          filter={unlocked ? `url(#glow-${gradId})` : undefined}
        />
      )}
      {unlocked && <circle cx="18" cy="18" r="2" fill="#FFE5C4" opacity="0.7" />}
    </svg>
  );
}

function BadgeDetailModal({
  badge,
  earnedAt,
  isEarned,
  canReveal,
  onClose,
}: {
  badge: BadgeMeta;
  earnedAt: Timestamp | null;
  isEarned: boolean;
  canReveal: boolean;
  onClose: () => void;
}) {
  const revealed = isEarned && canReveal;
  const name = revealed ? badge.name : "???";
  const desc = revealed ? badge.description : "???";
  const emoji = revealed ? badge.emoji : "❓";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
      style={{ background: "rgba(11,8,33,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(26,15,61,0.95)",
          border: "1px solid rgba(216,150,200,0.3)",
          boxShadow:
            "0 20px 60px rgba(11,8,33,0.6), 0 0 40px rgba(107,75,168,0.35)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-stardust transition-colors hover:bg-nebula-pink/20"
        >
          ✕
        </button>

        <div className="flex flex-col items-center gap-3 text-center">
          <span className="text-4xl" aria-hidden>
            {emoji}
          </span>
          <h3
            className="font-serif text-lg"
            style={{
              backgroundImage: "linear-gradient(135deg, #FFE5C4, #D896C8)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
            }}
          >
            {name}
          </h3>
          <p className="wrap-anywhere font-serif text-[13px] italic text-text-sub">
            {desc}
          </p>
          {revealed && earnedAt && (
            <p className="font-serif text-[11px] tracking-wider text-peach-accent">
              획득: {formatSmart(earnedAt.toDate())}
            </p>
          )}
          {!isEarned && canReveal && (
            <p className="font-serif text-[11px] italic text-text-sub/70">
              미획득
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
      style={{ background: "rgba(11,8,33,0.6)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="relative w-full max-w-xs rounded-2xl p-7"
        onClick={(e) => e.stopPropagation()}
        style={{
          background:
            "linear-gradient(180deg, rgba(26,15,61,0.85) 0%, rgba(11,8,33,0.85) 100%)",
          border: "1px solid rgba(216,150,200,0.3)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          boxShadow:
            "0 20px 60px rgba(11,8,33,0.6), 0 0 40px rgba(107,75,168,0.4), inset 0 1px 0 rgba(255,229,196,0.08)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-stardust transition-colors hover:bg-nebula-pink/20"
        >
          ✕
        </button>

        <div className="flex flex-col items-center gap-3 text-center">
          <span
            className="text-3xl text-peach-accent"
            aria-hidden
            style={{
              filter:
                "drop-shadow(0 0 10px rgba(255,181,167,0.6)) drop-shadow(0 0 18px rgba(216,150,200,0.35))",
            }}
          >
            ✦
          </span>
          <h3
            className="font-serif text-base tracking-wider"
            style={{
              backgroundImage: "linear-gradient(135deg, #FFE5C4, #D896C8)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
              filter: "drop-shadow(0 0 8px rgba(216,150,200,0.35))",
            }}
          >
            비공개
          </h3>
          <p className="break-keep font-serif text-[12px] italic leading-relaxed text-text-sub">
            이 별빛은 본인에게만 보입니다
          </p>
        </div>
      </div>
    </div>
  );
}
