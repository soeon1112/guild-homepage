"use client";

import { useMemo } from "react";

type Star = {
  x: number;
  y: number;
  r: number;
  delay: number;
  duration: number;
  opacity: number;
};

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function CosmicBackground() {
  const stars = useMemo<Star[]>(() => {
    const rand = seeded(7);
    return Array.from({ length: 90 }, () => ({
      x: rand() * 100,
      y: rand() * 100,
      r: 0.5 + rand() * 2.5,
      delay: rand() * 4,
      duration: 2 + rand() * 4,
      opacity: 0.4 + rand() * 0.6,
    }));
  }, []);

  // Note: v0 originally applied a scroll-based parallax `translateY` to this
  // container. That caused the backdrop to shift upward on long pages, exposing
  // whatever sat behind it (the legacy `.bg-scene` illustration). Removed so the
  // cosmic backdrop reliably covers the viewport regardless of scroll position.

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Base vertical gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(180deg, #0B0821 0%, #140A33 45%, #1A0F3D 100%)",
        }}
      />

      {/* Nebula blobs */}
      <div
        className="absolute -left-20 top-10 h-[420px] w-[420px] rounded-full animate-nebula-drift"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, #6B4BA8 0%, rgba(61,46,107,0.5) 35%, transparent 70%)",
          filter: "blur(80px)",
          opacity: 0.65,
        }}
      />
      <div
        className="absolute right-[-80px] top-[260px] h-[360px] w-[360px] rounded-full animate-nebula-drift"
        style={{
          background:
            "radial-gradient(circle at 60% 40%, #D896C8 0%, rgba(216,150,200,0.35) 35%, transparent 70%)",
          filter: "blur(80px)",
          opacity: 0.55,
          animationDelay: "-7s",
        }}
      />
      <div
        className="absolute left-[20%] bottom-[8%] h-[340px] w-[340px] rounded-full animate-nebula-drift"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, #3D2E6B 0%, rgba(107,75,168,0.4) 40%, transparent 72%)",
          filter: "blur(80px)",
          opacity: 0.7,
          animationDelay: "-13s",
        }}
      />

      {/* Milky way band */}
      <svg
        className="absolute inset-0 h-full w-full mix-blend-screen opacity-60"
        preserveAspectRatio="none"
        viewBox="0 0 400 900"
      >
        <defs>
          <linearGradient id="mw" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE5C4" stopOpacity="0" />
            <stop offset="35%" stopColor="#FFE5C4" stopOpacity="0.18" />
            <stop offset="50%" stopColor="#D896C8" stopOpacity="0.28" />
            <stop offset="65%" stopColor="#6B4BA8" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#3D2E6B" stopOpacity="0" />
          </linearGradient>
          <filter id="mwBlur">
            <feGaussianBlur stdDeviation="22" />
          </filter>
        </defs>
        <path
          d="M -40 200 Q 160 380 220 520 T 460 900"
          stroke="url(#mw)"
          strokeWidth="140"
          fill="none"
          filter="url(#mwBlur)"
          strokeLinecap="round"
        />
        <path
          d="M -40 200 Q 160 380 220 520 T 460 900"
          stroke="url(#mw)"
          strokeWidth="50"
          fill="none"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>

      {/* Star particles */}
      <svg aria-hidden className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {stars.map((s, i) => (
          <circle
            key={i}
            cx={`${s.x}%`}
            cy={`${s.y}%`}
            r={s.r}
            fill="#FFE5C4"
            opacity={s.opacity}
            style={{
              animation: `twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
              filter: s.r > 1.8 ? "drop-shadow(0 0 3px #FFE5C4)" : undefined,
            }}
          />
        ))}
      </svg>

      {/* Shooting star */}
      <div className="absolute left-[10%] top-[15%]">
        <div
          className="h-[2px] w-24 rounded-full animate-shooting"
          style={{
            background: "linear-gradient(90deg, transparent, #FFE5C4, #FFB5A7)",
            filter: "drop-shadow(0 0 6px #FFE5C4)",
            animationDelay: "2s",
          }}
        />
      </div>

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(11,8,33,0.55) 100%)",
        }}
      />
    </div>
  );
}
