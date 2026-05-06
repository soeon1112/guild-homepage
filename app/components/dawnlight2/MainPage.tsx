"use client";

// Placeholder for the 하늘섬 (Dawnlight 2) main page — gated to
// nicknames listed in src/lib/featureFlags.ts (currently "언쏘" only).
// Step 3-A: this version exists to verify the global setup —
//   • twilight sky gradient (painted by .dawnlight2::before)
//   • Noto Sans KR body / Noto Serif KR via .font-serif-kr
//   • Tailwind utilities like `text-cream` / `bg-twilight-deep`
//     resolve to the right colors via @theme inline + `.dawnlight2`.
// Real widgets (Today's Horizon, 바람결 소식, etc.) ship in follow-ups.
export function Dawnlight2MainPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-32 pt-16 sm:pt-24">
      {/* Title block — uses Noto Serif KR to confirm the serif variable
          is wired through next/font and the .font-serif-kr utility. */}
      <header className="text-center">
        <h1 className="font-serif-kr text-4xl font-light tracking-[0.18em] text-cream sm:text-5xl">
          새벽빛
        </h1>
        <span className="mt-2 inline-block text-[11px] font-light uppercase tracking-[0.42em] text-muted-lavender">
          Dawnlight 2 · 하늘섬
        </span>
      </header>

      {/* Body — Noto Sans KR (the .dawnlight2 default font-family). */}
      <section className="mx-auto mt-12 max-w-md rounded-2xl border border-mist-lavender/20 bg-cream/5 px-6 py-8 text-center backdrop-blur-md">
        <p className="text-sm leading-relaxed text-cream/85">
          글로벌 셋업이 적용됐어요.
          <br />
          노을빛 하늘과 두 가지 한국어 폰트가 보이면 정상이에요.
        </p>
        <p className="mt-4 text-[11px] uppercase tracking-[0.32em] text-muted-lavender">
          위젯은 다음 단계에서 채울게요
        </p>
      </section>

      {/* Token sample — three swatches make it obvious if the palette
          override didn't load (everything would look black/transparent). */}
      <ul className="mt-8 flex items-center justify-center gap-3 text-[10px] uppercase tracking-[0.2em] text-muted-lavender">
        <li className="flex flex-col items-center gap-1.5">
          <span className="h-6 w-6 rounded-full bg-sunset-gold" aria-hidden />
          <span>sunset</span>
        </li>
        <li className="flex flex-col items-center gap-1.5">
          <span className="h-6 w-6 rounded-full bg-mist-lavender" aria-hidden />
          <span>mist</span>
        </li>
        <li className="flex flex-col items-center gap-1.5">
          <span className="h-6 w-6 rounded-full bg-cloud-pink" aria-hidden />
          <span>cloud</span>
        </li>
      </ul>
    </main>
  );
}
