import { ImageResponse } from "next/og";

export const alt = "새벽빛 · 마비노기 모바일 길드";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function loadNotoSerifKR(
  weight: 400 | 700,
  text: string,
): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@${weight}&text=${encodeURIComponent(text)}&display=swap`;
  const css = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  }).then((r) => r.text());
  const match = css.match(/url\((https:\/\/[^)]+)\)\s*format/);
  if (!match) throw new Error("Noto Serif KR subset CSS missing font URL");
  const res = await fetch(match[1]);
  return res.arrayBuffer();
}

const stars: Array<{ x: number; y: number; s: number; o: number }> = [
  { x: 120, y: 80, s: 4, o: 0.9 },
  { x: 260, y: 140, s: 3, o: 0.7 },
  { x: 410, y: 60, s: 5, o: 0.95 },
  { x: 560, y: 38, s: 2, o: 0.55 },
  { x: 720, y: 92, s: 3, o: 0.8 },
  { x: 1020, y: 110, s: 4, o: 0.85 },
  { x: 1140, y: 200, s: 3, o: 0.6 },
  { x: 78, y: 320, s: 2, o: 0.55 },
  { x: 80, y: 440, s: 3, o: 0.7 },
  { x: 180, y: 540, s: 5, o: 0.9 },
  { x: 340, y: 580, s: 2, o: 0.5 },
  { x: 820, y: 572, s: 2, o: 0.45 },
  { x: 960, y: 540, s: 3, o: 0.6 },
  { x: 1080, y: 450, s: 4, o: 0.8 },
  { x: 1138, y: 540, s: 2, o: 0.5 },
];

export default async function Image() {
  const title = "새벽빛";
  const subtitle = "Dawnlight";
  const tagline = "함께 별자리를 이루는 이들";
  const footer = "마비노기 모바일 길드";
  const text = title + subtitle + tagline + footer;

  const [regular, bold] = await Promise.all([
    loadNotoSerifKR(400, text),
    loadNotoSerifKR(700, text),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          background:
            "radial-gradient(ellipse at 50% 40%, #3D2E6B 0%, #1A0F3D 45%, #0B0821 100%)",
          fontFamily: "'Noto Serif KR', serif",
          overflow: "hidden",
        }}
      >
        {/* Nebula glows */}
        <div
          style={{
            position: "absolute",
            left: -160,
            top: -160,
            width: 520,
            height: 520,
            borderRadius: 9999,
            background:
              "radial-gradient(circle, rgba(216,150,200,0.3) 0%, transparent 65%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -180,
            bottom: -180,
            width: 560,
            height: 560,
            borderRadius: 9999,
            background:
              "radial-gradient(circle, rgba(107,75,168,0.38) 0%, transparent 65%)",
            display: "flex",
          }}
        />

        {/* Stars */}
        {stars.map((s, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: s.x,
              top: s.y,
              width: s.s * 2,
              height: s.s * 2,
              borderRadius: 9999,
              background: "#FFE5C4",
              opacity: s.o,
              boxShadow: `0 0 ${s.s * 5}px ${s.s}px rgba(255,229,196,0.55)`,
              display: "flex",
            }}
          />
        ))}

        {/* Eyebrow */}
        <div
          style={{
            display: "flex",
            fontSize: 30,
            color: "#FFE5C4",
            letterSpacing: 18,
            opacity: 0.78,
            marginBottom: 26,
            fontWeight: 400,
          }}
        >
          {subtitle}
        </div>

        {/* Main title with gradient */}
        <div
          style={{
            display: "flex",
            fontSize: 220,
            fontWeight: 700,
            letterSpacing: 28,
            lineHeight: 1,
            paddingLeft: 28,
            backgroundImage:
              "linear-gradient(135deg, #FFE5C4 0%, #FFB5A7 40%, #D896C8 75%, #6B4BA8 100%)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            color: "transparent",
          }}
        >
          {title}
        </div>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            width: 320,
            height: 1,
            marginTop: 48,
            marginBottom: 30,
            background:
              "linear-gradient(90deg, transparent 0%, rgba(216,150,200,0.75) 50%, transparent 100%)",
          }}
        />

        {/* Tagline */}
        <div
          style={{
            display: "flex",
            fontSize: 36,
            color: "#D896C8",
            letterSpacing: 10,
            fontWeight: 400,
          }}
        >
          {tagline}
        </div>

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: 46,
            display: "flex",
            fontSize: 22,
            color: "rgba(255,229,196,0.62)",
            letterSpacing: 16,
            fontWeight: 400,
          }}
        >
          {footer}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Noto Serif KR", data: regular, weight: 400, style: "normal" },
        { name: "Noto Serif KR", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
