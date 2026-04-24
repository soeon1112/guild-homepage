"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { MemberAvatar } from "./MemberAvatar";

export type MemberCardData = {
  id: string;
  nickname: string;
  bio?: string;
  profileImage?: string;
  registered: boolean;
  lastSeenHours?: number;
};

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function hashCode(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

type Status = "online" | "recent" | "offline";
function getStatus(hours?: number): Status {
  if (hours == null) return "offline";
  if (hours < 1) return "online";
  if (hours < 24) return "recent";
  return "offline";
}

const STATUS_STYLE: Record<
  Status,
  { color: string; glow: string; label: string }
> = {
  online: {
    color: "#FFB5A7",
    glow:
      "0 0 6px rgba(255,181,167,0.9), 0 0 12px rgba(255,181,167,0.5)",
    label: "온라인",
  },
  recent: {
    color: "#FFE5C4",
    glow:
      "0 0 6px rgba(255,229,196,0.85), 0 0 10px rgba(255,229,196,0.4)",
    label: "최근 접속",
  },
  offline: {
    color: "rgba(200,168,233,0.35)",
    glow: "none",
    label: "오프라인",
  },
};

export function MemberCard({
  member,
  index,
}: {
  member: MemberCardData;
  index: number;
}) {
  const { id, nickname, bio, profileImage, registered, lastSeenHours } = member;
  const recent = lastSeenHours != null && lastSeenHours < 1;

  const stars = useMemo(() => {
    const rand = seeded(hashCode(nickname) + 1);
    return Array.from({ length: 3 }, () => ({
      top: `${8 + rand() * 80}%`,
      left: `${8 + rand() * 85}%`,
      r: 1 + rand() * 1.4,
      delay: rand() * 3,
    }));
  }, [nickname]);

  const status = getStatus(lastSeenHours);
  const statusStyle = STATUS_STYLE[status];

  if (!registered) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 0.5, y: 0 }}
        whileHover={{ opacity: 0.75 }}
        transition={{ duration: 0.4, delay: Math.min(index * 0.02, 0.2) }}
        className="group relative"
      >
        <Link
          href={`/members/${id}`}
          className="relative block rounded-2xl"
          aria-label="빈 길드원 슬롯 — 프로필 등록하러 가기"
        >
          <div
            className="relative flex items-center gap-2.5 rounded-2xl p-3 transition-all duration-300 group-hover:-translate-y-0.5 sm:gap-4 sm:p-5"
            style={{
              minHeight: 104,
              background: "rgba(107, 75, 168, 0.03)",
              backdropFilter: "blur(16px)",
              border: "1px dashed rgba(200, 168, 233, 0.22)",
            }}
          >
            <div
              className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full sm:h-16 sm:w-16"
              style={{
                border: "1.5px dashed rgba(200, 168, 233, 0.35)",
                background:
                  "radial-gradient(circle, rgba(107,75,168,0.08) 0%, rgba(11,8,33,0.2) 70%, transparent 100%)",
              }}
            >
              <span className="font-serif text-xl text-text-sub/50">·</span>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span
                className="truncate font-serif text-[13px] tracking-wide text-text-sub/60 italic sm:text-sm"
                style={{ filter: "blur(0.4px)" }}
              >
                미등록된 새벽
              </span>
              <span
                className="wrap-anywhere font-serif text-[10px] italic leading-relaxed text-text-sub/50 sm:text-[11px]"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                아직 이곳에 빛이 머물기 전
              </span>
            </div>
          </div>
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.03, 0.3) }}
      className="group relative"
    >
      <Link
        href={`/members/${id}`}
        className="relative block rounded-2xl transition-transform duration-300 hover:-translate-y-0.5 hover:scale-[1.015]"
        aria-label={`${nickname} 프로필 보기`}
      >
        <div
          className="relative flex items-center gap-2.5 overflow-hidden rounded-2xl p-3 sm:gap-4 sm:p-5"
          style={{
            minHeight: 108,
            background: "rgba(107, 75, 168, 0.08)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(200, 168, 233, 0.15)",
            boxShadow: "0 2px 14px rgba(11,8,33,0.25)",
          }}
        >
          {stars.map((s, i) => (
            <span
              key={i}
              aria-hidden
              className="pointer-events-none absolute rounded-full bg-stardust"
              style={{
                top: s.top,
                left: s.left,
                width: s.r,
                height: s.r,
                opacity: 0.55,
                filter: "drop-shadow(0 0 3px #FFE5C4)",
                animation: `twinkle ${3 + i}s ease-in-out ${s.delay}s infinite`,
              }}
            />
          ))}

          <div className="relative h-11 w-11 flex-shrink-0 sm:h-16 sm:w-16">
            <div className="origin-top-left scale-[0.6875] sm:scale-100">
              <MemberAvatar
                imageUrl={profileImage}
                nickname={nickname}
                size={64}
                ring
              />
            </div>

            {recent && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full border border-nebula-pink/70"
                style={{
                  animation: "pulse-ring 2.4s cubic-bezier(0,0,0.2,1) infinite",
                }}
              />
            )}

            <span
              aria-label={statusStyle.label}
              title={statusStyle.label}
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-abyss-deep"
              style={{
                background: statusStyle.color,
                boxShadow: statusStyle.glow,
              }}
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
            <span
              className="truncate font-serif text-[13px] font-medium tracking-wide sm:text-[17px]"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, #FFE5C4 0%, #D896C8 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                color: "transparent",
              }}
            >
              {nickname}
            </span>

            <span
              className="wrap-anywhere font-serif text-[10.5px] italic leading-relaxed text-text-sub sm:text-[13px]"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {bio && bio.trim() ? bio : "..."}
            </span>
          </div>

          <span
            aria-hidden
            className="pointer-events-none absolute right-3 top-3 text-nebula-pink/60 transition-all duration-300 group-hover:text-stardust group-hover:scale-110"
            style={{ filter: "drop-shadow(0 0 4px rgba(216,150,200,0.6))" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2 L13.5 9.5 L21 11 L13.5 12.5 L12 20 L10.5 12.5 L3 11 L10.5 9.5 Z" />
            </svg>
          </span>

          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              boxShadow:
                "0 10px 32px rgba(107,75,168,0.45), 0 0 22px rgba(216,150,200,0.4), inset 0 0 18px rgba(255,229,196,0.08)",
              border: "1px solid rgba(216,150,200,0.4)",
            }}
          />
        </div>

      </Link>
    </motion.div>
  );
}
