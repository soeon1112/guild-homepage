// Temporary preview of the mobile app's fishing loading screen.
// Mirrors dawnlight-app/app/fishing.tsx FishingLoadingOverlay so the
// design can be iterated on from a phone browser without rebuilding
// the APK each time. Delete once the design is finalised.
//
// Rendering strategy: portal into document.body. The page itself
// lives inside ChromeShell's <main className="relative z-10 ...">,
// which establishes a stacking context — any z-index inside it can't
// climb above the sibling TopHeader / BottomNav. Portalling makes
// the overlay a direct child of body, escaping main's context so a
// modest z-index reliably covers all layout chrome.

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// `duration` + `delay` drive the subtle twinkle. Hand-picked
// asymmetric values (no two stars share both fields) so the field
// never lines up into a synchronised pulse — calmer than CosmicBackground's
// 90-star drift but visually consistent with it. To roll back to a
// purely static field, drop these two fields and remove the
// `animation` line on the star <div> below + the `@keyframes
// fishing-loading-star-twinkle` block at the bottom of <style>.
const STARS: {
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  size: number;
  duration: number;
  delay: number;
}[] = [
  { top: "8%", left: "18%", size: 2, duration: 4.0, delay: 0 },
  { top: "14%", right: "12%", size: 3, duration: 4.5, delay: 1.2 },
  { top: "10%", right: "32%", size: 1, duration: 3.5, delay: 0.5 },
  { top: "22%", left: "8%", size: 2, duration: 4.2, delay: 2.1 },
  { top: "20%", left: "55%", size: 3, duration: 5.0, delay: 0.8 },
  { bottom: "28%", left: "20%", size: 2, duration: 3.8, delay: 1.6 },
  { bottom: "22%", right: "16%", size: 4, duration: 4.6, delay: 2.5 },
  { bottom: "12%", left: "46%", size: 1, duration: 3.2, delay: 0.3 },
  { bottom: "32%", left: "78%", size: 2, duration: 4.4, delay: 1.9 },
];

function Overlay() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background:
          "linear-gradient(180deg, #0B0821 0%, #140A33 50%, #1A0F3D 100%)",
        overflow: "hidden",
      }}
    >
      {/* Star field — gentle twinkle (opacity 0.4 ↔ 1). Per-star
          delay/duration gives an asymmetric, calm rhythm. */}
      {STARS.map((s, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: s.top,
            left: s.left,
            right: s.right,
            bottom: s.bottom,
            width: s.size,
            height: s.size,
            borderRadius: "50%",
            backgroundColor: "#FFE5C4",
            boxShadow:
              s.size >= 3
                ? "0 0 6px rgba(255,229,196,0.9), 0 0 12px rgba(255,229,196,0.4)"
                : "none",
            animation: `fishing-loading-star-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}

      {/* Centred glass card — translucent so the cosmic background
          shows through. Inner content stays opaque/glowing for legibility. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "60%",
            maxWidth: 260,
            position: "relative",
            padding: "22px 20px",
            borderRadius: 20,
            overflow: "hidden",
            backgroundColor: "rgba(26,15,61,0.20)",
            border: "1px solid rgba(216,150,200,0.22)",
            boxShadow:
              "0 0 48px rgba(216,150,200,0.40), 0 12px 32px rgba(11,8,33,0.55)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Inner purple→pink gradient (subtle, lets bg show through) */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(135deg, rgba(107,75,168,0.25) 0%, rgba(216,150,200,0.15) 100%)",
              pointerEvents: "none",
            }}
          />
          {/* CardNebula equivalent — corner-anchored radial glows */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 15% 20%, rgba(216,150,200,0.16) 0%, transparent 60%), radial-gradient(circle at 85% 80%, rgba(255,181,167,0.12) 0%, transparent 60%)",
              pointerEvents: "none",
            }}
          />

          {/* Content (relative so it stacks above the gradient layers) */}
          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* 4-point sparkle star */}
            <div
              style={{
                marginBottom: 10,
                filter: "drop-shadow(0 0 6px rgba(255,229,196,0.85))",
                lineHeight: 0,
              }}
            >
              <svg width={26} height={26} viewBox="0 0 24 24">
                <path
                  d="M12 1 L13.5 10.5 L23 12 L13.5 13.5 L12 23 L10.5 13.5 L1 12 L10.5 10.5 Z"
                  fill="#FFE5C4"
                />
              </svg>
            </div>

            {/* Title */}
            <div
              style={{
                color: "#FFE5C4",
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "1.5px",
                fontFamily: "'Noto Serif KR', serif",
              }}
            >
              별빛 부두로...
            </div>

            {/* Spinner */}
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: "2px solid rgba(216,150,200,0.22)",
                  borderTopColor: "#D896C8",
                  animation: "fishing-loading-spin 0.9s linear infinite",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fishing-loading-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fishing-loading-star-twinkle {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function FishingLoadingPreviewPage() {
  // Portal target = document.body. Mount-after-hydrate guard avoids
  // SSR mismatch (document is undefined on the server).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(<Overlay />, document.body);
}
