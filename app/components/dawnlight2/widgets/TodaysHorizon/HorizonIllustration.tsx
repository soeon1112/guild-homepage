// SVG illustration: a sunset horizon with parallax cumulus clouds,
// silhouetted floating islands, and a drifting hot-air balloon.
// Designed to bleed into the page background — no frame, no border.
//
// Balloon positioning quirk: the `animate-sway` keyframes set
// `transform: translateY(...) rotate(...)` on each frame, which fully
// replaces any SVG `transform` attribute on the same element (CSS
// animation cascade beats the presentation attribute). v0 carried
// `transform="translate(0 290)"` directly on the swaying group, so
// that translate was silently dropped and the envelope top sat at
// y=-28 (above the viewBox), getting clipped. We split it: an outer
// non-animated <g transform="translate(0 60)"> handles vertical
// placement; an inner <g class="animate-sway"> handles the rotational
// rocking only.
export function HorizonIllustration() {
  return (
    <div className="relative w-full">
      <svg
        viewBox="0 0 1200 600"
        className="block h-auto w-full"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="구름 위에 떠 있는 작은 섬들과 비행선이 그려진 노을 풍경"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="dl2-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffe5c2" stopOpacity="1" />
            <stop offset="55%" stopColor="#ffc785" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffc785" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="dl2-cumulus" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fdf6f0" stopOpacity="0.98" />
            <stop offset="55%" stopColor="#ffd4b8" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#e8a888" stopOpacity="0.85" />
          </linearGradient>

          <linearGradient id="dl2-island" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a2c5e" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#2a1f4a" stopOpacity="0.7" />
          </linearGradient>

          <linearGradient id="dl2-balloon" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffd4b8" />
            <stop offset="100%" stopColor="#ffc785" />
          </linearGradient>

          <linearGradient id="dl2-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f4b896" stopOpacity="0" />
            <stop offset="100%" stopColor="#f4b896" stopOpacity="0.5" />
          </linearGradient>

          <symbol id="dl2-cumulus-cloud" viewBox="0 0 240 110">
            <path
              d="M 18 86
                 Q 6 86 6 74
                 Q 0 60 14 52
                 Q 16 34 36 32
                 Q 44 14 66 14
                 Q 80 0 100 8
                 Q 118 0 134 10
                 Q 156 4 170 22
                 Q 192 22 198 40
                 Q 222 42 224 62
                 Q 234 70 226 84
                 Q 222 96 204 94
                 Q 188 102 168 96
                 Q 144 104 122 98
                 Q 96 104 74 98
                 Q 52 102 36 96
                 Q 22 96 18 86 Z"
              fill="url(#dl2-cumulus)"
            />
            <path
              d="M 36 32
                 Q 44 18 64 16
                 Q 80 4 100 10
                 Q 118 4 132 12
                 Q 154 8 168 22"
              fill="none"
              stroke="#fdf6f0"
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0.55"
            />
          </symbol>
        </defs>

        {/* Sun glow on horizon */}
        <ellipse cx="600" cy="430" rx="380" ry="160" fill="url(#dl2-sun)" />
        <circle cx="600" cy="430" r="42" fill="#ffe5c2" opacity="0.9" />

        {/* Distant island silhouettes — gentle vertical bob */}
        <g className="animate-float-up" style={{ animationDelay: "-2s" }}>
          <g transform="translate(220 360)">
            <path
              d="M -55 0 Q -45 -22 -20 -28 Q 0 -34 25 -30 Q 50 -26 60 -8 Q 65 2 55 8 Q 30 18 0 16 Q -30 14 -50 10 Z"
              fill="url(#dl2-island)"
            />
            <path d="M -12 -28 l 2 -10 l 2 10 z" fill="#2a1f4a" opacity="0.85" />
            <path d="M 8 -30 l 2 -12 l 2 12 z" fill="#2a1f4a" opacity="0.85" />
            <path d="M 26 -28 l 2 -9 l 2 9 z" fill="#2a1f4a" opacity="0.85" />
            <path d="M -10 8 L -6 24 L -2 10 Z" fill="#2a1f4a" opacity="0.55" />
          </g>

          <g transform="translate(880 330)">
            <path
              d="M -85 0 Q -75 -28 -45 -36 Q -10 -44 25 -40 Q 65 -36 80 -14 Q 88 0 70 10 Q 30 24 -10 22 Q -50 20 -78 14 Z"
              fill="url(#dl2-island)"
            />
            <path d="M -30 -36 l 3 -14 l 3 14 z" fill="#2a1f4a" opacity="0.85" />
            <path d="M -8 -40 l 3 -16 l 3 16 z" fill="#2a1f4a" opacity="0.85" />
            <path d="M 18 -38 l 3 -13 l 3 13 z" fill="#2a1f4a" opacity="0.85" />
            <path d="M 40 -34 l 3 -10 l 3 10 z" fill="#2a1f4a" opacity="0.85" />
            <path d="M -6 12 L 0 32 L 6 14 Z" fill="#2a1f4a" opacity="0.55" />
          </g>
        </g>

        <g className="animate-float-up" style={{ animationDelay: "-5s" }}>
          <g transform="translate(540 380)">
            <path
              d="M -28 0 Q -22 -10 -8 -14 Q 6 -18 18 -14 Q 30 -10 32 -2 Q 28 6 10 8 Q -10 8 -26 4 Z"
              fill="url(#dl2-island)"
              opacity="0.85"
            />
            <path d="M -4 -14 l 1.5 -6 l 1.5 6 z" fill="#2a1f4a" opacity="0.8" />
            <path d="M 8 -16 l 1.5 -7 l 1.5 7 z" fill="#2a1f4a" opacity="0.8" />
          </g>
        </g>

        {/* Hot-air balloon — drifts across with a gentle sway. The
            outer animated <g> owns the horizontal drift; the static
            inner <g transform="translate(0 60)"> owns vertical
            placement (envelope top → y=32, basket bottom → y=126,
            ~5–21% of viewBox — the empty top band above the centered
            sky-quote/parchment overlay); the innermost animate-sway
            <g> owns the rocking. Splitting the translate from the
            sway is what makes vertical position actually take effect
            — see the cascade note in the file header. */}
        <g className="animate-drift-across" style={{ animationDelay: "-12s" }}>
          <g transform="translate(0 60)">
            <g className="animate-sway">
              <g transform="translate(60 0)">
                <line x1="0" y1="42" x2="0" y2="60" stroke="#fef5e6" strokeWidth="0.8" opacity="0.7" />
                <line x1="-8" y1="42" x2="-6" y2="60" stroke="#fef5e6" strokeWidth="0.8" opacity="0.6" />
                <line x1="8" y1="42" x2="6" y2="60" stroke="#fef5e6" strokeWidth="0.8" opacity="0.6" />
                <path
                  d="M 0 -28 C 22 -28 30 -10 24 8 C 20 22 10 38 0 42 C -10 38 -20 22 -24 8 C -30 -10 -22 -28 0 -28 Z"
                  fill="url(#dl2-balloon)"
                />
                <path
                  d="M -22 -2 C -18 8 -10 22 0 26 C 10 22 18 8 22 -2"
                  fill="none"
                  stroke="#a06a52"
                  strokeWidth="0.8"
                  opacity="0.45"
                />
                <rect x="-6" y="60" width="12" height="6" rx="1.5" fill="#6b4a3a" />
              </g>
            </g>
          </g>
        </g>

        {/* Cumulus clouds — 4 distinct shapes drifting at different speeds */}
        <g className="animate-drift-slow" style={{ animationDelay: "-2s" }}>
          <use href="#dl2-cumulus-cloud" x="-40" y="430" width="520" height="240" opacity="0.95" />
        </g>
        <g className="animate-drift-slower" style={{ animationDelay: "-6s" }}>
          <use href="#dl2-cumulus-cloud" x="700" y="380" width="320" height="148" opacity="0.85" />
        </g>
        <g className="animate-drift-slower" style={{ animationDelay: "-14s" }}>
          <use href="#dl2-cumulus-cloud" x="900" y="460" width="380" height="174" opacity="0.9" />
        </g>
        <g className="animate-drift-slow" style={{ animationDelay: "-9s" }}>
          <use href="#dl2-cumulus-cloud" x="380" y="200" width="180" height="82" opacity="0.55" />
        </g>

        {/* Warm horizon haze overlay */}
        <rect x="0" y="380" width="1200" height="220" fill="url(#dl2-haze)" opacity="0.6" />
      </svg>
    </div>
  );
}
