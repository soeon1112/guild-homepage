"use client";

import { useEffect, useState } from "react";

type Star = {
  top: number;
  left: number;
  size: number;
  duration: number;
  delay: number;
};

// Fixed-position starfield for the 하늘섬 main page. 40 twinkling white
// stars; positions are generated client-side after mount so SSR and the
// first client render match (server emits an empty list — no hydration
// mismatch warning). Sits between the .dawnlight2::before sky gradient
// (z-index: -1) and the page content (z-index: 1+); pointer-events:
// none keeps it from blocking taps on the chrome bars or content.
//
// Animation references the dl2-twinkle keyframe defined in globals.css.
// We use the dl2- prefix everywhere inside the dawnlight2 scope so we
// don't conflict with the cosmic UI's existing `twinkle` keyframe.
export function StarryBackground() {
  const [stars, setStars] = useState<Star[]>([]);

  useEffect(() => {
    const generated: Star[] = Array.from({ length: 40 }, () => ({
      top: Math.random() * 100,
      left: Math.random() * 100,
      // Larger base footprint + snappier cycle so the strengthened
      // dl2-twinkle envelope (opacity 0.15→1, scale 0.9→1.4) reads as
      // a pulse instead of a faint flicker against the dark sky.
      size: 1.5 + Math.random() * 2.5,
      duration: 1.5 + Math.random() * 2,
      delay: Math.random() * 5,
    }));
    setStars(generated);
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      {stars.map((s, i) => (
        <div
          key={`dl2-star-${i}`}
          className="absolute rounded-full bg-white"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            opacity: 0.6,
            boxShadow: `0 0 ${Math.max(2, s.size * 2)}px rgba(255,255,255,0.6)`,
            animation: `dl2-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
