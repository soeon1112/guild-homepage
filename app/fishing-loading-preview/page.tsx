// Temporary preview of the mobile app's fishing loading screen.
// Mirrors dawnlight-app/app/fishing.tsx FishingLoadingOverlay so the
// design can be iterated on from a phone browser without rebuilding
// the APK each time. Delete once the design is finalised.
//
// `position: fixed; inset: 0; z-index: 9999` covers the global
// BottomNav / FloatingChat / FloatingPet from layout.tsx.

const STARS: {
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  size: number;
}[] = [
  { top: "8%", left: "18%", size: 2 },
  { top: "14%", right: "12%", size: 3 },
  { top: "10%", right: "32%", size: 1 },
  { top: "22%", left: "8%", size: 2 },
  { top: "20%", left: "55%", size: 3 },
  { bottom: "28%", left: "20%", size: 2 },
  { bottom: "22%", right: "16%", size: 4 },
  { bottom: "12%", left: "46%", size: 1 },
  { bottom: "32%", left: "78%", size: 2 },
];

export default function FishingLoadingPreviewPage() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background:
          "linear-gradient(180deg, #0B0821 0%, #140A33 50%, #1A0F3D 100%)",
        overflow: "hidden",
      }}
    >
      {/* Static star field — same layout as the RN version. No
          animation; the splash only flashes for ~1–2 s in production. */}
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
          }}
        />
      ))}

      {/* Centred glass card */}
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
            width: "70%",
            maxWidth: 320,
            position: "relative",
            padding: "28px 24px",
            borderRadius: 20,
            overflow: "hidden",
            backgroundColor: "rgba(26,15,61,0.55)",
            border: "1px solid rgba(216,150,200,0.25)",
            boxShadow:
              "0 0 48px rgba(216,150,200,0.45), 0 12px 32px rgba(11,8,33,0.6)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Inner purple→pink gradient (= LinearGradient inside the
              RN card body) */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(135deg, rgba(107,75,168,0.55) 0%, rgba(216,150,200,0.30) 100%)",
              pointerEvents: "none",
            }}
          />
          {/* CardNebula equivalent — two corner-anchored radial glows
              (top-left pink, bottom-right peach) for the frosted-glass
              "interior glow" effect that CardNebula.tsx provides on RN */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 15% 20%, rgba(216,150,200,0.18) 0%, transparent 60%), radial-gradient(circle at 85% 80%, rgba(255,181,167,0.14) 0%, transparent 60%)",
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
            {/* 4-point sparkle star — same SVG path as RN StarBurst */}
            <div
              style={{
                marginBottom: 14,
                filter: "drop-shadow(0 0 6px rgba(255,229,196,0.8))",
                lineHeight: 0,
              }}
            >
              <svg width={28} height={28} viewBox="0 0 24 24">
                <path
                  d="M12 1 L13.5 10.5 L23 12 L13.5 13.5 L12 23 L10.5 13.5 L1 12 L10.5 10.5 Z"
                  fill="#FFE5C4"
                />
              </svg>
            </div>

            {/* Title — Noto Serif KR matches the homepage's serif headers */}
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

            {/* Spinner — CSS equivalent of RN ActivityIndicator,
                cosmic-pink top arc rotating on a faint track */}
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  border: "2px solid rgba(216,150,200,0.25)",
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
      `}</style>
    </div>
  );
}
