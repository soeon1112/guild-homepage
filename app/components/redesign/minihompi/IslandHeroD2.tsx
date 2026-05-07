"use client";

// dawnlight2 미니홈피 1단계 — 떠있는 섬 + 깃발 + 구름.
// v0 dawnlight2-v0/components/minihome/island-hero.tsx 베이스.
// ★ v0 의 lantern (깃대 위 정사각 박스 + 글로우) 제거. 깃대 + 깃발만.

export function IslandHeroD2({ nickname }: { nickname: string }) {
  return (
    <section className="flex flex-col items-center pt-2 pb-1">
      <div
        className="relative"
        style={{ animation: "mh-bob 4s ease-in-out infinite" }}
      >
        <style>{`
          @keyframes mh-bob {
            0%, 100% { transform: translateY(0); }
            50%       { transform: translateY(-10px); }
          }
          @keyframes mh-flag-wave {
            0%, 100% { transform: skewY(0deg); }
            50%       { transform: skewY(-3deg); }
          }
          @keyframes mh-cloud-l {
            0%, 100% { transform: translateX(0); }
            50%       { transform: translateX(-8px); }
          }
          @keyframes mh-cloud-r {
            0%, 100% { transform: translateX(0); }
            50%       { transform: translateX(8px); }
          }
        `}</style>

        <svg
          viewBox="0 0 320 240"
          className="w-64 sm:w-80"
          aria-label={`${nickname}님의 작은 섬`}
          role="img"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="d2-island-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7a5898" />
              <stop offset="50%" stopColor="#5a3878" />
              <stop offset="100%" stopColor="#3a2058" />
            </linearGradient>
            <linearGradient id="d2-island-top" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a87848" />
              <stop offset="100%" stopColor="#7a5030" />
            </linearGradient>
            <radialGradient id="d2-shadow" cx="50%" cy="20%" r="50%">
              <stop offset="0%" stopColor="#1a0f3d" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#1a0f3d" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="d2-cloud" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fdf6f0" stopOpacity="0.92" />
              <stop offset="100%" stopColor="#ffd4b8" stopOpacity="0.72" />
            </linearGradient>
          </defs>

          <ellipse cx="160" cy="222" rx="80" ry="10" fill="url(#d2-shadow)" />

          <g style={{ animation: "mh-cloud-l 6s ease-in-out infinite" }}>
            <path
              d="M 20 130 Q 14 130 14 123 Q 8 114 18 110 Q 19 102 28 100 Q 34 92 44 96 Q 52 92 60 98 Q 68 98 68 106 Q 75 107 73 116 Q 71 124 63 122 Q 50 126 34 122 Z"
              fill="url(#d2-cloud)"
              opacity="0.9"
            />
          </g>

          <g style={{ animation: "mh-cloud-r 7s ease-in-out infinite", animationDelay: "-2s" }}>
            <path
              d="M 234 118 Q 228 118 228 112 Q 222 104 232 100 Q 233 93 241 91 Q 247 84 256 88 Q 263 84 270 89 Q 277 89 278 97 Q 285 98 283 107 Q 282 115 274 113 Q 262 117 248 113 Z"
              fill="url(#d2-cloud)"
              opacity="0.82"
            />
          </g>

          <path
            d="M 80 200 Q 72 186 76 168 Q 82 150 100 142 Q 116 136 138 134 Q 158 130 178 132 Q 202 130 220 138 Q 242 146 250 164 Q 256 180 252 200 Z"
            fill="url(#d2-island-body)"
          />
          <path
            d="M 100 142 Q 116 136 138 134 Q 158 130 178 132 Q 202 130 220 138 Q 202 130 176 128 Q 156 126 136 130 Q 114 132 100 142 Z"
            fill="url(#d2-island-top)"
            opacity="0.75"
          />

          <g fill="#2a1840" opacity="0.7">
            <path d="M 108 138 l 3 -13 l 3 13 z" />
            <path d="M 122 134 l 3 -15 l 3 15 z" />
            <path d="M 228 142 l 3 -11 l 3 11 z" />
            <path d="M 215 138 l 2.5 -10 l 2.5 10 z" />
          </g>

          <line
            x1="163"
            y1="130"
            x2="163"
            y2="86"
            stroke="#3a2058"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <g
            style={{
              animation: "mh-flag-wave 2.4s ease-in-out infinite",
              transformOrigin: "163px 96px",
            }}
          >
            <path
              d="M 163 88 L 182 96 L 163 104 Z"
              fill="#f4a87a"
              opacity="0.92"
            />
            <path
              d="M 163 93 L 182 96 L 163 99 Z"
              fill="#ffd4b0"
              opacity="0.6"
            />
          </g>
        </svg>
      </div>

      <p
        className="mt-3 text-center font-serif text-sm italic leading-relaxed"
        style={{ color: "rgba(200, 184, 232, 0.75)" }}
      >
        {nickname}님의 섬에 도착했어요
      </p>
    </section>
  );
}
